"use client";

import { useAccount, useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";
import { sameAddress } from "@/lib/domain/transaction";

/** Indique si le wallet connecté est le owner du contrat Meridian. */
export function useIsOwner() {
  const { address } = useAccount();
  const meridianAddress = useMeridianAddress();
  const { data: owner, isLoading, refetch } = useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "owner",
    query: { enabled: !!meridianAddress },
  });

  return {
    owner: owner as `0x${string}` | undefined,
    isOwner: sameAddress(owner as string | undefined, address),
    isLoading,
    refetch,
  };
}
