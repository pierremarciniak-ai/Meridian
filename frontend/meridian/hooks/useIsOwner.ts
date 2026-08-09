"use client";

import { useAccount, useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";
import { sameAddress } from "@/lib/domain/transaction";

export function useIsOwner() {
  const { address } = useAccount();
  const { data: owner, isLoading, refetch } = useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "owner",
  });

  return {
    owner: owner as `0x${string}` | undefined,
    isOwner: sameAddress(owner as string | undefined, address),
    isLoading,
    refetch,
  };
}
