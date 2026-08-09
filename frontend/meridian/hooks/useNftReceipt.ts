"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianNftAbi } from "@/lib/web3/abi/meridianNft";
import { meridianAddress } from "@/lib/web3/contracts";

// Meridian n'expose aucun getter "tokenId pour cette transaction/ce rôle" :
// on le retrouve en rejouant l'event TransactionNFTMinted (transactionID et
// userAddress sont tous deux indexés), comme useMyShipmentIds le fait déjà
// pour retrouver les transactions d'un compte.
export function useNftTokenId(transactionId: Hex | undefined, userAddress: Address | undefined, enabled: boolean) {
  const publicClient = usePublicClient();
  const [tokenId, setTokenId] = useState<bigint>();
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!publicClient || !transactionId || !userAddress || !enabled) {
      setTokenId(undefined);
      return;
    }
    setIsLoading(true);
    try {
      const logs = await publicClient.getContractEvents({
        address: meridianAddress,
        abi: meridianAbi,
        eventName: "TransactionNFTMinted",
        args: { transactionID: transactionId, userAddress },
        fromBlock: 0n,
        toBlock: "latest",
      });
      setTokenId(logs.at(-1)?.args.tokenId as bigint | undefined);
    } catch {
      setTokenId(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, transactionId, userAddress, enabled]);

  useEffect(() => {
    // Même raison que useMyShipmentIds : load() rejoue des logs on-chain
    // (asynchrone), setTokenId n'est appelé qu'à la réponse RPC.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { tokenId, isLoading };
}

// nftAddress vient de useMeridianNFTAddress (lecture on-chain) plutôt que de
// la constante d'env : voir le commentaire de ce hook pour la raison
// (divergence possible avec l'adresse réellement configurée sur Meridian).
export function useNftTokenUri(nftAddress: Address | undefined, tokenId: bigint | undefined) {
  return useReadContract({
    address: nftAddress,
    abi: meridianNftAbi,
    functionName: "tokenURI",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: !!nftAddress && tokenId !== undefined },
  });
}
