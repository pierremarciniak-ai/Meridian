"use client";

import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { erc20Abi } from "@/lib/web3/abi/erc20";

export function useErc20Meta(tokenAddress: Address) {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: erc20Abi, functionName: "decimals" },
      { address: tokenAddress, abi: erc20Abi, functionName: "symbol" },
    ],
  });

  return {
    decimals: (data?.[0]?.result as number | undefined) ?? 6,
    symbol: (data?.[1]?.result as string | undefined) ?? "",
    isLoading,
  };
}

export function useErc20Balance(tokenAddress: Address, account: Address | undefined) {
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account },
  });
}

export function useErc20Allowance(tokenAddress: Address, owner: Address | undefined, spender: Address) {
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner ? [owner, spender] : undefined,
    query: { enabled: !!owner },
  });
}
