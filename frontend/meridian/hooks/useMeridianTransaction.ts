"use client";

import { useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";
import type { OnChainTransaction } from "@/lib/domain/transaction";

export function useMeridianTransaction(transactionId: `0x${string}` | undefined) {
  const query = useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "getTransaction",
    args: transactionId ? [transactionId] : undefined,
    query: { enabled: !!transactionId },
  });

  return { ...query, data: query.data as unknown as OnChainTransaction | undefined };
}
