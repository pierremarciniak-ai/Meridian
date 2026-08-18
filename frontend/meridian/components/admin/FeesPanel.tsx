"use client";

import { AddressSetterRow } from "@/components/admin/AddressSetterRow";
import { RateSetterRow } from "@/components/admin/RateSetterRow";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

// feesRateBps est un taux global en points de base (250 = 2,50 %) appliqué à
// totalAmount au moment de la double signature de chaque dossier, quelle que
// soit sa devise — voir checkSignatures/transfertFeesFromBuyer dans
// InternalFunctions.sol. L'acheteur paie la totalité des frais ainsi
// calculés ; le fournisseur en absorbe la moitié via un dépôt net réduit
// d'autant (netAmountDue), sans virement séparé de sa part.
export function FeesPanel({
  feesWalletAddress,
  feesRateBps,
  onUpdated,
}: {
  feesWalletAddress: `0x${string}` | undefined;
  feesRateBps: number | undefined;
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
          hint="Destinataire des frais prélevés dès la double signature de chaque dossier (voir checkSignatures)."
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
      </div>
    </Card>
  );
}
