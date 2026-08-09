import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";
import { hardhatLocal } from "@/lib/web3/chain";
import { WorkflowStatus } from "@/lib/domain/enums";
import { fetchContainerPositionStatus } from "@/lib/vesselfinder";

export const runtime = "nodejs";
// Plafonné à 10s sur le plan Hobby de Vercel quoi qu'on mette ici ; utile
// seulement à partir du plan Pro.
export const maxDuration = 60;

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

const transactionSignedEvent = parseAbiItem(
  "event TransactionSigned(bytes32 indexed transactionID, address indexed buyer, address indexed seller)",
);

type CronResult = {
  transactionID: string;
  outcome: "reported" | "unchanged" | "not-active" | "no-data" | "error";
  txHash?: string;
  error?: string;
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const privateKey = process.env.CONTAINER_ORACLE_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json(
      { error: "Variable d'environnement CONTAINER_ORACLE_PRIVATE_KEY manquante" },
      { status: 500 },
    );
  }

  const publicClient = createPublicClient({ chain: hardhatLocal, transport: http(rpcUrl) });
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: hardhatLocal, transport: http(rpcUrl) });

  // Reconstruit la liste des transactions "en jeu" depuis l'historique des
  // events TransactionSigned : le contrat ne tient pas de registre des
  // transactions actives. Limitation connue : ça rescane tout l'historique
  // à chaque exécution. CRON_FROM_BLOCK permet de couper le bruit au
  // démarrage ; à terme, remplacer par un dernier bloc scanné persisté
  // (Vercel KV/Upstash) pour ne parcourir que le delta.
  const fromBlock = process.env.CRON_FROM_BLOCK ? BigInt(process.env.CRON_FROM_BLOCK) : 0n;
  const logs = await publicClient.getLogs({
    address: meridianAddress,
    event: transactionSignedEvent,
    fromBlock,
    toBlock: "latest",
  });

  const transactionIDs = [...new Set(logs.map((log) => log.args.transactionID as `0x${string}`))];
  const results: CronResult[] = [];

  for (const transactionID of transactionIDs) {
    try {
      const tx = await publicClient.readContract({
        address: meridianAddress,
        abi: meridianAbi,
        functionName: "getTransaction",
        args: [transactionID],
      });

      // Rien à reporter une fois le retrait effectué : plus personne n'en a
      // l'usage, et la transaction ne devrait plus apparaître aux prochains
      // passages une fois la persistance du fromBlock en place.
      if (tx.workflowStatus !== WorkflowStatus.Signed || tx.withdrawalCompleted) {
        results.push({ transactionID, outcome: "not-active" });
        continue;
      }

      const newStatus = await fetchContainerPositionStatus(tx.containerReference);
      if (newStatus === undefined) {
        results.push({ transactionID, outcome: "no-data" });
        continue;
      }
      if (newStatus === tx.containerPositionStatus) {
        results.push({ transactionID, outcome: "unchanged" });
        continue;
      }

      const txHash = await walletClient.writeContract({
        address: meridianAddress,
        abi: meridianAbi,
        functionName: "reportContainerPosition",
        args: [transactionID, newStatus],
      });

      results.push({ transactionID, outcome: "reported", txHash });
    } catch (err) {
      results.push({ transactionID, outcome: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ checked: transactionIDs.length, results });
}
