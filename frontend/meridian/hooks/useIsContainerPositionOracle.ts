"use client";

import { useAccount, useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";
import { sameAddress } from "@/lib/domain/transaction";

export function useIsContainerPositionOracle() {
  const { address } = useAccount();
  const { data: oracle, isLoading } = useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "containerPositionOracleAddress",
  });

  return {
    oracle: oracle as `0x${string}` | undefined,
    isContainerPositionOracle: sameAddress(oracle as string | undefined, address),
    isLoading,
  };
}
