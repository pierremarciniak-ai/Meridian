"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress, useMeridianDeployBlock } from "@/lib/web3/contracts";
import { getContractEventsChunked } from "@/lib/web3/eventLogs";

/**
 * Retrouve les transactionID d'un compte en rejouant les logs on-chain. Le
 * contrat n'expose aucune fonction d'énumération des transactions : un
 * transactionID (bytes32) n'est retrouvable qu'en le connaissant déjà, ou en
 * rejouant les events où l'adresse apparaît comme acheteur
 * (`TransactionInitialized`) ou fournisseur (`TransactionCreated`).
 */
export function useMyShipmentIds(account: Address | undefined) {
  const publicClient = usePublicClient();
  const meridianAddress = useMeridianAddress();
  const deployBlock = useMeridianDeployBlock();
  const [ids, setIds] = useState<Hex[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicClient || !account || !meridianAddress) {
      setIds([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const latest = await publicClient.getBlockNumber();
      const [asBuyer, asSeller] = await Promise.all([
        getContractEventsChunked(publicClient, {
          address: meridianAddress,
          abi: meridianAbi,
          eventName: "TransactionInitialized",
          args: { buyer: account },
          fromBlock: deployBlock,
          toBlock: latest,
        }),
        getContractEventsChunked(publicClient, {
          address: meridianAddress,
          abi: meridianAbi,
          eventName: "TransactionCreated",
          args: { seller: account },
          fromBlock: deployBlock,
          toBlock: latest,
        }),
      ]);

      const seen = new Set<Hex>();
      const ordered: Hex[] = [];
      for (const log of [...asBuyer, ...asSeller].reverse()) {
        const id = log.args.transactionID;
        if (id && !seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
      setIds(ordered);
    } catch {
      // Nœud RPC injoignable (pas encore démarré, mauvais réseau…) : on
      // affiche un état vide + message plutôt que de laisser l'erreur réseau
      // remonter comme une rejection non gérée.
      setIds([]);
      setError("Impossible de joindre le nœud RPC du réseau connecté. Vérifiez qu'il est démarré/accessible.");
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, account, meridianAddress, deployBlock]);

  useEffect(() => {
    // load() rejoue des logs on-chain (système externe, asynchrone) et
    // n'appelle setIds/setError qu'une fois la réponse RPC reçue : pas une
    // valeur dérivable au rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { ids, isLoading, error, refresh: load };
}
