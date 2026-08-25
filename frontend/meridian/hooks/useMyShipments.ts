"use client";

import { useCallback } from "react";
import type { Address, Hex } from "viem";
import { useReadContracts } from "wagmi";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { useMyShipmentIds } from "@/hooks/useMyShipmentIds";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

export type Shipment = { id: Hex; tx: OnChainTransaction };

/**
 * Charge, en un seul multicall, l'état complet de chaque contrat où le
 * portefeuille connecté est acheteur ou fournisseur (cf. `useMyShipmentIds`).
 * Sert de base à la liste "Mes contrats" et à sa barre de recherche : comme
 * l'ensemble récupéré est déjà scopé au portefeuille connecté, une recherche
 * dessus ne peut jamais faire remonter le contrat de quelqu'un d'autre.
 */
export function useMyShipments(account: Address | undefined) {
  const { ids, isLoading: idsLoading, error, refresh: refreshIds } = useMyShipmentIds(account);
  const meridianAddress = useMeridianAddress();

  const { data, isLoading: txsLoading, refetch: refetchTxs } = useReadContracts({
    contracts: ids.map((id) => ({
      address: meridianAddress,
      abi: meridianAbi,
      functionName: "getTransaction",
      args: [id],
    })),
    query: { enabled: ids.length > 0 && !!meridianAddress },
  });

  const shipments: Shipment[] = ids.flatMap((id, index) => {
    const result = data?.[index];
    if (!result || result.status !== "success") return [];
    return [{ id, tx: result.result as unknown as OnChainTransaction }];
  });

  const refresh = useCallback(async () => {
    await refreshIds();
    await refetchTxs();
  }, [refreshIds, refetchTxs]);

  return {
    shipments,
    isLoading: idsLoading || (ids.length > 0 && txsLoading),
    error,
    refresh,
  };
}
