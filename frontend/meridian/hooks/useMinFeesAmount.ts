"use client";

import { useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

/**
 * Lit `minFeesAmount`, le plancher de frais configurable par l'admin (voir
 * `setMinimumFeesAmount`) — appliqué par `transfertFeesFromBuyer` dès que
 * `feesRateBps` est non nul. Utilisé avec `useFeesRateBps` pour reproduire
 * ce calcul côté front (voir `estimateFees`).
 */
export function useMinFeesAmount() {
  const meridianAddress = useMeridianAddress();
  const { data, isLoading } = useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "minFeesAmount",
    query: { enabled: !!meridianAddress },
  });

  return { minFeesAmount: (data as bigint | undefined) ?? 0n, isLoading };
}
