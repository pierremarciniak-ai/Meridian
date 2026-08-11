import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, encodePacked, http, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";
import { hardhatLocal } from "@/lib/web3/chain";
import { ContainerPositionStatus } from "@/lib/domain/enums";
import { fetchContainerPositionStatus } from "@/lib/vesselfinder";

export const runtime = "nodejs";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

// Durée de validité de l'attestation : assez courte pour limiter la fenêtre
// pendant laquelle une signature interceptée reste utilisable, assez longue
// pour laisser le temps de confirmer la transaction wallet (approbation +
// envoi) sans qu'elle expire entre-temps.
const SIGNATURE_TTL_SECONDS = 10 * 60;

type SignResponse =
  | { available: true; status: ContainerPositionStatus; deadline: number; signature: `0x${string}` }
  | { available: false; reason: string };

// Ne fait plus AUCUN appel on-chain (contrairement à l'ancien cron) : signe
// juste hors-chaîne un triplet (transactionID, status, deadline) avec la clé
// de l'oracle, gratuitement. C'est l'utilisateur qui consomme cette
// signature via withdrawFundsWithPositionUpdate / rollbackDepositWithPositionUpdate
// (voir Meridian.sol / applySignedContainerPosition), en payant lui-même le
// gas de la mise à jour on-chain — le wallet oracle n'a donc plus besoin
// d'être alimenté en ETH.
export async function POST(request: NextRequest) {
  const privateKey = process.env.CONTAINER_ORACLE_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json(
      { error: "Variable d'environnement CONTAINER_ORACLE_PRIVATE_KEY manquante" },
      { status: 500 },
    );
  }

  let transactionId: string | undefined;
  try {
    const body = await request.json();
    transactionId = body?.transactionId;
  } catch {
    // corps absent/invalide, traité comme un transactionId manquant ci-dessous
  }

  if (!transactionId || !/^0x[0-9a-fA-F]{64}$/.test(transactionId)) {
    return NextResponse.json({ error: "transactionId manquant ou invalide" }, { status: 400 });
  }

  const publicClient = createPublicClient({ chain: hardhatLocal, transport: http(rpcUrl) });

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
      ["bytes32", "uint8", "uint256", "address"],
      [transactionId as `0x${string}`, status, BigInt(deadline), meridianAddress],
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
