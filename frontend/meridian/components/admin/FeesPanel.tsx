"use client";

import { AddressSetterRow } from "@/components/admin/AddressSetterRow";
import { AmountSetterRow } from "@/components/admin/AmountSetterRow";
import { RateSetterRow } from "@/components/admin/RateSetterRow";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

/**
 * Configuration des frais de service : wallet destinataire, taux et
 * plancher (`feesRateBps`/`minFeesAmount`, appliqués à `totalAmount` à la
 * double signature de chaque contrat — voir `checkSignatures`/
 * `transfertFeesFromBuyer` dans InternalFunctions.sol). L'acheteur paie la
 * totalité des frais ainsi calculés ; le fournisseur en absorbe la moitié
 * via un dépôt net réduit d'autant (`netAmountDue`), sans virement séparé
 * de sa part. `minFeesAmount` est exprimé en unité de stablecoin (6
 * décimales), indépendamment de la devise choisie par chaque contrat.
 */
export function FeesPanel({
  feesWalletAddress,
  feesRateBps,
  minFeesAmount,
  onUpdated,
}: {
  feesWalletAddress: `0x${string}` | undefined;
  feesRateBps: number | undefined;
  minFeesAmount: bigint | undefined;
  onUpdated: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Frais de service</CardTitle>
      </CardHeader>
      <div className="divide-y" style={{ borderColor: "var(--color-navy-700)" }}>
        <AddressSetterRow
          label="Wallet de frais"
          hint="Destinataire des frais prélevés dès la double signature de chaque contrat (voir checkSignatures)."
          currentValue={feesWalletAddress}
          functionName="setFeesWalletAddress"
          onUpdated={onUpdated}
        />
        <RateSetterRow
          label="Taux de frais"
          hint="Pourcentage de totalAmount prélevé chez l'acheteur à la double signature ; le fournisseur en absorbe la moitié via un dépôt net réduit d'autant."
          currentValueBps={feesRateBps}
          functionName="setFeesRateBps"
          onUpdated={onUpdated}
        />
        <AmountSetterRow
          label="Plancher de frais"
          hint="Montant minimum des frais dès que le taux ci-dessus est non nul, quelle que soit la devise du contrat (6 décimales)."
          currentValue={minFeesAmount}
          decimals={6}
          functionName="setMinimumFeesAmount"
          onUpdated={onUpdated}
        />
      </div>
    </Card>
  );
}
