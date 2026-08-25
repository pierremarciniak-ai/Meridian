"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { sanctionsListAbi } from "@/lib/web3/abi/sanctionsList";

/**
 * Reconstruit la liste des adresses actuellement sanctionnées sur un oracle
 * SanctionsList, qui ne permet aucune énumération directe (juste un mapping
 * avec un compteur de génération pour un reset en O(1) — voir
 * `unSetAllSanctioned` côté contrat). Procède en deux temps : (1) rejoue
 * l'historique des events `AddressSanctioned` pour obtenir l'ensemble des
 * adresses ayant un jour été sanctionnées (même patron que
 * `useMyShipmentIds`), puis (2) vérifie le statut réel de chacune via
 * `isSanctioned`, qui tient compte des levées individuelles et de
 * `unSetAllSanctioned`.
 */
export function useSanctionedAddresses(oracleAddress: Address | undefined) {
  const publicClient = usePublicClient();
  const [candidates, setCandidates] = useState<Address[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!publicClient || !oracleAddress) {
      setCandidates([]);
      return;
    }
    setIsLoadingHistory(true);
    try {
      const logs = await publicClient.getContractEvents({
        address: oracleAddress,
        abi: sanctionsListAbi,
        eventName: "AddressSanctioned",
        fromBlock: 0n,
        toBlock: "latest",
      });
      const seen = new Set<Address>();
      const ordered: Address[] = [];
      for (const log of logs) {
        const account = log.args.account;
        if (account && !seen.has(account)) {
          seen.add(account);
          ordered.push(account);
        }
      }
      setCandidates(ordered);
    } catch {
      setCandidates([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [publicClient, oracleAddress]);

  useEffect(() => {
    // Même raison que useMyShipmentIds : loadHistory() rejoue des logs
    // on-chain (asynchrone), setCandidates n'est appelé qu'à la réponse RPC.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  const {
    data,
    refetch: refetchStatuses,
    isLoading: isLoadingStatuses,
  } = useReadContracts({
    contracts: candidates.map((account) => ({
      address: oracleAddress,
      abi: sanctionsListAbi,
      functionName: "isSanctioned",
      args: [account],
    })),
    query: { enabled: candidates.length > 0 && !!oracleAddress },
  });

  const sanctionedAddresses = candidates.filter((_, index) => data?.[index]?.result === true);

  const refresh = useCallback(async () => {
    await loadHistory();
    await refetchStatuses();
  }, [loadHistory, refetchStatuses]);

  return {
    sanctionedAddresses,
    isLoading: isLoadingHistory || (candidates.length > 0 && isLoadingStatuses),
    refresh,
  };
}
