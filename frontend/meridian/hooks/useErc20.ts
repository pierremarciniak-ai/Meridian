"use client";

import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { erc20Abi } from "@/lib/web3/abi/erc20";

// tokenAddress est désormais résolu on-chain (useTokenAddresses) plutôt que
// depuis l'env, donc potentiellement undefined le temps du premier fetch —
// ces trois hooks se désactivent proprement (query.enabled) dans ce cas au
// lieu d'envoyer une adresse invalide.
export function useErc20Meta(tokenAddress: Address | undefined) {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: erc20Abi, functionName: "decimals" },
      { address: tokenAddress, abi: erc20Abi, functionName: "symbol" },
    ],
    query: { enabled: !!tokenAddress },
  });

  return {
    decimals: (data?.[0]?.result as number | undefined) ?? 6,
    symbol: (data?.[1]?.result as string | undefined) ?? "",
    isLoading,
  };
}

export function useErc20Balance(tokenAddress: Address | undefined, account: Address | undefined) {
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!tokenAddress && !!account },
  });
}

export function useErc20Allowance(tokenAddress: Address | undefined, owner: Address | undefined, spender: Address | undefined) {
  return useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled: !!tokenAddress && !!owner && !!spender },
  });
}
