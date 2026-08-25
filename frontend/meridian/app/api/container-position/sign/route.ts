import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, encodePacked, http, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { getMeridianAddress } from "@/lib/web3/contracts";
import { hardhatLocal, sepolia } from "@/lib/web3/chain";
import { ContainerPositionStatus } from "@/lib/domain/enums";
import { fetchContainerPositionStatus } from "@/lib/vesselfinder";

export const runtime = "nodejs";

/**
 * Durée de validité de l'attestation : assez courte pour limiter la fenêtre
 * pendant laquelle une signature interceptée reste utilisable, assez longue
 * pour laisser le temps de confirmer la transaction wallet (approbation +
 * envoi) sans qu'elle expire entre-temps.
 */
const SIGNATURE_TTL_SECONDS = 10 * 60;

/**
 * La route (serveur, pas de wallet connecté) ne connaît pas d'elle-même le
 * réseau ciblé : le front le lui indique via `chainId` (celui du wallet
 * connecté, voir `useMeridianAddress`). Chaque réseau supporté a sa propre
 * clé d'oracle — l'adresse configurée on-chain via
 * `setContainerPositionOracleAddress` diffère d'un déploiement à l'autre
 * (voir scripts/deploy-local.ts / deploy-sepolia.ts), donc pas de clé unique
 * possible ici.
 */
const NETWORK_CONFIG = {
  [hardhatLocal.id]: { chain: hardhatLocal, privateKeyEnvVar: "CONTAINER_ORACLE_PRIVATE_KEY_HARDHAT" },
  [sepolia.id]: { chain: sepolia, privateKeyEnvVar: "CONTAINER_ORACLE_PRIVATE_KEY_SEPOLIA" },
} as const;

type SignResponse =
  | { available: true; status: ContainerPositionStatus; deadline: number; signature: `0x${string}` }
  | { available: false; reason: string };

/**
 * Signe hors-chaîne un triplet (transactionID, status, deadline) avec la clé
 * de l'oracle, gratuitement — ne fait plus aucun appel on-chain
 * (contrairement à l'ancien cron). C'est l'utilisateur qui consomme cette
 * signature via `withdrawFundsWithPositionUpdate`/
 * `rollbackDepositWithPositionUpdate` (voir Meridian.sol /
 * `applySignedContainerPosition`), en payant lui-même le gas de la mise à
 * jour on-chain : le wallet oracle n'a donc jamais besoin d'être alimenté en
 * ETH, sur aucun des réseaux supportés.
 */
export async function POST(request: NextRequest) {
  let transactionId: string | undefined;
  let chainId: number | undefined;
  try {
    const body = await request.json();
    transactionId = body?.transactionId;
    chainId = typeof body?.chainId === "number" ? body.chainId : undefined;
  } catch {
    // corps absent/invalide, traité comme des paramètres manquants ci-dessous
  }

  if (!transactionId || !/^0x[0-9a-fA-F]{64}$/.test(transactionId)) {
    return NextResponse.json({ error: "transactionId manquant ou invalide" }, { status: 400 });
  }

  const networkConfig = chainId !== undefined ? NETWORK_CONFIG[chainId as keyof typeof NETWORK_CONFIG] : undefined;
  if (!networkConfig) {
    return NextResponse.json({ error: `chainId manquant ou non supporté : ${chainId}` }, { status: 400 });
  }

  const meridianAddress = getMeridianAddress(chainId as number);
  if (!meridianAddress) {
    return NextResponse.json(
      { error: `Adresse Meridian non configurée pour le réseau ${chainId}` },
      { status: 500 },
    );
  }

  const privateKey = process.env[networkConfig.privateKeyEnvVar];
  if (!privateKey) {
    return NextResponse.json(
      { error: `Variable d'environnement ${networkConfig.privateKeyEnvVar} manquante` },
      { status: 500 },
    );
  }

  const publicClient = createPublicClient({
    chain: networkConfig.chain,
    transport: http(networkConfig.chain.rpcUrls.default.http[0]),
  });

  const tx = await publicClient.readContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "getTransaction",
    args: [transactionId as `0x${string}`],
  });

  if (!tx.containerReference) {
    return NextResponse.json<SignResponse>({ available: false, reason: "Référence conteneur absente" });
  }

  const status = await fetchContainerPositionStatus(tx.containerReference);
  if (status === undefined) {
    return NextResponse.json<SignResponse>({
      available: false,
      reason: "Aucune donnée VesselFinder exploitable pour l'instant",
    });
  }

  const deadline = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;

  const messageHash = keccak256(
    encodePacked(
      ["bytes32", "uint8", "uint256", "address", "uint256"],
      [transactionId as `0x${string}`, status, BigInt(deadline), meridianAddress, BigInt(chainId as number)],
    ),
  );

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  // Signature hors-chaîne pure (aucune transaction envoyée, aucun gas
  // dépensé) : { raw: messageHash } applique le préfixe EIP-191 standard,
  // exactement ce que vérifie applySignedContainerPosition côté contrat via
  // MessageHashUtils.toEthSignedMessageHash + ECDSA.recover.
  const signature = await account.signMessage({ message: { raw: messageHash } });

  return NextResponse.json<SignResponse>({ available: true, status, deadline, signature });
}
