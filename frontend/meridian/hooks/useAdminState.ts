"use client";

import { useReadContracts } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";
import { Currency } from "@/lib/domain/enums";

/** Un seul multicall pour tout l'état "réglages" consommé par le dashboard admin, plutôt qu'un `useReadContract` par valeur. */
export function useAdminState() {
  const meridianAddress = useMeridianAddress();
  const { data, isLoading, refetch } = useReadContracts({
    query: { enabled: !!meridianAddress },
    contracts: [
      { address: meridianAddress, abi: meridianAbi, functionName: "owner" },
      { address: meridianAddress, abi: meridianAbi, functionName: "sanctionsOracleAddress" },
      { address: meridianAddress, abi: meridianAbi, functionName: "mockSanctionsOracleAddress" },
      { address: meridianAddress, abi: meridianAbi, functionName: "meridianNFTAddress" },
      { address: meridianAddress, abi: meridianAbi, functionName: "containerPositionOracleAddress" },
      { address: meridianAddress, abi: meridianAbi, functionName: "mockSanctionsEnabled" },
      { address: meridianAddress, abi: meridianAbi, functionName: "feesWalletAddress" },
      { address: meridianAddress, abi: meridianAbi, functionName: "feesRateBps" },
      { address: meridianAddress, abi: meridianAbi, functionName: "tokenAddresses", args: [Currency.USDC] },
      { address: meridianAddress, abi: meridianAbi, functionName: "tokenAddresses", args: [Currency.USDT] },
      { address: meridianAddress, abi: meridianAbi, functionName: "tokenAddresses", args: [Currency.EURC] },
    ],
  });

  const [
    owner,
    sanctionsOracleAddress,
    mockSanctionsOracleAddress,
    meridianNFTAddress,
    containerPositionOracleAddress,
    mockSanctionsEnabled,
    feesWalletAddress,
    feesRateBps,
    usdc,
    usdt,
    eurc,
  ] = data ?? [];

  return {
    isLoading,
    refetch,
    owner: owner?.result as `0x${string}` | undefined,
    sanctionsOracleAddress: sanctionsOracleAddress?.result as `0x${string}` | undefined,
    mockSanctionsOracleAddress: mockSanctionsOracleAddress?.result as `0x${string}` | undefined,
    meridianNFTAddress: meridianNFTAddress?.result as `0x${string}` | undefined,
    containerPositionOracleAddress: containerPositionOracleAddress?.result as `0x${string}` | undefined,
    mockSanctionsEnabled: mockSanctionsEnabled?.result as boolean | undefined,
    feesWalletAddress: feesWalletAddress?.result as `0x${string}` | undefined,
    feesRateBps: feesRateBps?.result as number | undefined,
    tokenAddressesOnChain: {
      [Currency.USDC]: usdc?.result as `0x${string}` | undefined,
      [Currency.USDT]: usdt?.result as `0x${string}` | undefined,
      [Currency.EURC]: eurc?.result as `0x${string}` | undefined,
    },
  };
}
