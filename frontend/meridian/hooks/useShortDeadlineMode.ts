"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "meridian:dev:short-deadline";

// Préférence de dev persistée en local. Pas de contexte global : chaque
// formulaire la relit à son montage (ex. en naviguant depuis /dev-tools vers
// / ou vers un contrat), aucun besoin de synchronisation en direct entre
// composants déjà montés.
export function useShortDeadlineMode() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // localStorage n'existe pas côté serveur (SSR) : cette lecture doit
    // rester dans un effet (exécuté après le montage, client uniquement)
    // pour éviter un crash SSR et une désynchronisation d'hydratation —
    // impossible de la dériver au rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const update = useCallback((value: boolean) => {
    setEnabled(value);
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  }, []);

  return [enabled, update] as const;
}
