"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianNftAbi } from "@/lib/web3/abi/meridianNft";
import { useMeridianAddress, useMeridianDeployBlock } from "@/lib/web3/contracts";
import { getContractEventsChunked } from "@/lib/web3/eventLogs";

/**
 * Retrouve le tokenId du reçu NFT d'une transaction/d'un rôle. Meridian
 * n'expose aucun getter dédié : on le retrouve en rejouant l'event
 * `TransactionNFTMinted` (transactionID et userAddress sont tous deux
 * indexés), comme `useMyShipmentIds` le fait pour les transactions d'un
 * compte.
 */
export function useNftTokenId(transactionId: Hex | undefined, userAddress: Address | undefined, enabled: boolean) {
  const publicClient = usePublicClient();
  const meridianAddress = useMeridianAddress();
  const deployBlock = useMeridianDeployBlock();
  const [tokenId, setTokenId] = useState<bigint>();
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!publicClient || !transactionId || !userAddress || !enabled || !meridianAddress) {
      setTokenId(undefined);
      return;
    }
    setIsLoading(true);
    try {
      const latest = await publicClient.getBlockNumber();
      const logs = await getContractEventsChunked(publicClient, {
        address: meridianAddress,
        abi: meridianAbi,
        eventName: "TransactionNFTMinted",
        args: { transactionID: transactionId, userAddress },
        fromBlock: deployBlock,
        toBlock: latest,
      });
      setTokenId(logs.at(-1)?.args.tokenId as bigint | undefined);
    } catch {
      setTokenId(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, transactionId, userAddress, enabled, meridianAddress, deployBlock]);

  useEffect(() => {
    // Même raison que useMyShipmentIds : load() rejoue des logs on-chain
    // (asynchrone), setTokenId n'est appelé qu'à la réponse RPC.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { tokenId, isLoading };
}

/** Lit la tokenURI d'un reçu NFT. `nftAddress` doit venir de `useMeridianNFTAddress` (lecture on-chain), pas d'une constante d'env — voir ce hook. */
export function useNftTokenUri(nftAddress: Address | undefined, tokenId: bigint | undefined) {
  return useReadContract({
    address: nftAddress,
    abi: meridianNftAbi,
    functionName: "tokenURI",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: !!nftAddress && tokenId !== undefined },
  });
}
