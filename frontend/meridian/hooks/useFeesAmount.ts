"use client";

import { useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

// feesAmount est un montant brut global (mêmes décimales que le token de la
// transaction, voir useErc20Meta côté appelant) — pas indexé par Currency,
// donc pas de useReadContracts multi-devise nécessaire ici.
export function useFeesAmount() {
  const meridianAddress = useMeridianAddress();
  const { data, isLoading } = useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "feesAmount",
    query: { enabled: !!meridianAddress },
  });

  return { feesAmount: (data as bigint | undefined) ?? 0n, isLoading };
}
