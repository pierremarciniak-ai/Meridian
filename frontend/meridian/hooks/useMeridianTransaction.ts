"use client";

import { useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";
import type { OnChainTransaction } from "@/lib/domain/transaction";

/** Lit l'état complet d'une transaction (`getTransaction`) sur le contrat Meridian. */
export function useMeridianTransaction(transactionId: `0x${string}` | undefined) {
  const meridianAddress = useMeridianAddress();
  const query = useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "getTransaction",
    args: transactionId ? [transactionId] : undefined,
    query: { enabled: !!transactionId && !!meridianAddress },
  });

  return { ...query, data: query.data as unknown as OnChainTransaction | undefined };
}
