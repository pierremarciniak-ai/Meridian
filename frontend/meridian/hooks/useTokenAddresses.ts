"use client";

import type { Address } from "viem";
import { useReadContracts } from "wagmi";
import { Currency } from "@/lib/domain/enums";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

// Lit les adresses de tokens (USDC/USDT/EURC) directement sur Meridian
// plutôt que depuis l'env : modifiables on-chain via setTokenAddress (voir
// TokenAddressesPanel), elles peuvent diverger silencieusement d'une valeur
// figée au build — même raison que useMeridianNFTAddress (voir ce hook).
export function useTokenAddresses() {
  const meridianAddress = useMeridianAddress();
  const { data, isLoading, refetch } = useReadContracts({
    query: { enabled: !!meridianAddress },
    contracts: [
      { address: meridianAddress, abi: meridianAbi, functionName: "tokenAddresses", args: [Currency.USDC] },
      { address: meridianAddress, abi: meridianAbi, functionName: "tokenAddresses", args: [Currency.USDT] },
      { address: meridianAddress, abi: meridianAbi, functionName: "tokenAddresses", args: [Currency.EURC] },
    ],
  });

  const [usdc, usdt, eurc] = data ?? [];

  return {
    isLoading,
    refetch,
    tokenAddresses: {
      [Currency.USDC]: usdc?.result as Address | undefined,
      [Currency.USDT]: usdt?.result as Address | undefined,
      [Currency.EURC]: eurc?.result as Address | undefined,
    } as Record<Currency, Address | undefined>,
  };
}
