"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { usePublicClient } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";

// Le contrat n'expose aucune fonction d'énumération des transactions : un
// transactionID (bytes32) n'est retrouvable qu'en le connaissant déjà, ou en
// rejouant les logs des events où l'adresse connectée apparaît comme
// acheteur (TransactionInitialized) ou fournisseur (TransactionCreated).
export function useMyShipmentIds(account: Address | undefined) {
  const publicClient = usePublicClient();
  const [ids, setIds] = useState<Hex[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicClient || !account) {
      setIds([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [asBuyer, asSeller] = await Promise.all([
        publicClient.getContractEvents({
          address: meridianAddress,
          abi: meridianAbi,
          eventName: "TransactionInitialized",
          args: { buyer: account },
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getContractEvents({
          address: meridianAddress,
          abi: meridianAbi,
          eventName: "TransactionCreated",
          args: { seller: account },
          fromBlock: 0n,
          toBlock: "latest",
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
      setError("Impossible de joindre le nœud Hardhat local (http://127.0.0.1:8545). Vérifiez qu'il est démarré.");
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, account]);

  useEffect(() => {
    load();
  }, [load]);

  return { ids, isLoading, error, refresh: load };
}
