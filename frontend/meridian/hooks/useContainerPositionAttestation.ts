"use client";

import { useCallback, useEffect, useState } from "react";
import type { ContainerPositionStatus } from "@/lib/domain/enums";

export type ContainerPositionAttestation =
  | { available: true; status: ContainerPositionStatus; deadline: number; signature: `0x${string}` }
  | { available: false; reason: string };

// Interroge app/api/container-position/sign : une lecture VesselFinder +
// une signature hors-chaîne côté serveur, aucun appel on-chain. Le résultat
// sert à la fois à décider si l'action (retrait/rollback) est débloquée
// côté UI, et — au clic — à fournir les paramètres exacts attendus par
// withdrawFundsWithPositionUpdate / rollbackDepositWithPositionUpdate.
export function useContainerPositionAttestation(transactionId: `0x${string}` | undefined) {
  const [data, setData] = useState<ContainerPositionAttestation | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Retourne directement le résultat frais (pas seulement via le state) :
  // le clic sur "Retirer"/"Récupérer mes fonds" doit pouvoir l'utiliser
  // immédiatement, sans dépendre d'un re-render pour lire `data` à jour —
  // la précédente attestation peut dater de plusieurs minutes.
  const refetch = useCallback(async (): Promise<ContainerPositionAttestation | undefined> => {
    if (!transactionId) return undefined;
    setIsLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/container-position/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const body = (await res.json()) as ContainerPositionAttestation;
      setData(body);
      return body;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setData(undefined);
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    // refetch() est asynchrone (appel réseau) et n'appelle setData/setError
    // qu'une fois la réponse reçue : pas une valeur dérivable au rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}
