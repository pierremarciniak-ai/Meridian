"use client";

import { ClockIcon } from "@/components/icons";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useShortDeadlineMode } from "@/hooks/useShortDeadlineMode";

/**
 * Alternative au time-travel Hardhat (retiré : `evm_setNextBlockTimestamp`
 * n'existe que sur un nœud de dev, jamais sur un réseau réel comme Sepolia).
 * Ne triche pas avec l'horloge de la chaîne : permet juste de fixer une
 * échéance d'annulation proche (minutes) au lieu d'une date seule, pour
 * pouvoir tester `rollbackDeposit` en attendant réellement quelques minutes
 * — fonctionne donc sur n'importe quel réseau, y compris Sepolia.
 */
export function ShortDeadlinePanel() {
  const [enabled, setEnabled] = useShortDeadlineMode();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Échéance courte</CardTitle>
        <ClockIcon className="h-6 w-6 text-subtle" />
      </CardHeader>
      <p className="mb-4 text-sm text-muted">
        Ajoute l&apos;heure et les minutes aux champs de date (échéance d&apos;annulation, date de départ, date
        d&apos;arrivée) à la création d&apos;un contrat et lors de la mise à jour des conditions, pour pouvoir fixer des
        échéances dans quelques minutes plutôt qu&apos;un jour entier au minimum — utile pour tester l&apos;abandon
        automatique, <code>rollbackDeposit</code>, ou différentes combinaisons de conditions sans attendre
        indéfiniment, y compris sur un réseau réel.
      </p>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4"
          style={{ accentColor: "var(--color-teal-400)" }}
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="text-sm text-foam">Activer l&apos;échéance courte (heures/minutes)</span>
      </label>
    </Card>
  );
}
