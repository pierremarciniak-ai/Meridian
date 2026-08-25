"use client";

import { useAccount, useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";
import { sameAddress } from "@/lib/domain/transaction";

/** Indique si le wallet connecté est l'oracle de position de conteneur configuré sur Meridian. */
export function useIsContainerPositionOracle() {
  const { address } = useAccount();
  const meridianAddress = useMeridianAddress();
  const { data: oracle, isLoading } = useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "containerPositionOracleAddress",
    query: { enabled: !!meridianAddress },
  });

  return {
    oracle: oracle as `0x${string}` | undefined,
    isContainerPositionOracle: sameAddress(oracle as string | undefined, address),
    isLoading,
  };
}
