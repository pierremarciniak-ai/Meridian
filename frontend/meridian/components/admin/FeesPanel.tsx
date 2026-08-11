"use client";

import { AddressSetterRow } from "@/components/admin/AddressSetterRow";
import { AmountSetterRow } from "@/components/admin/AmountSetterRow";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Currency } from "@/lib/domain/enums";
import { useErc20Meta } from "@/hooks/useErc20";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";

// feesAmount est un montant brut unique (pas indexé par Currency, voir
// Meridian.sol/depositFunds) appliqué tel quel quelle que soit la devise de
// la transaction — on affiche/saisit sa valeur en s'appuyant sur les
// décimales de l'USDC comme référence, puisque USDC/USDT/EURC partagent
// toutes les trois 6 décimales dans ce projet.
export function FeesPanel({
  feesWalletAddress,
  feesAmount,
  onUpdated,
}: {
  feesWalletAddress: `0x${string}` | undefined;
  feesAmount: bigint | undefined;
  onUpdated: () => void;
}) {
  const { tokenAddresses } = useTokenAddresses();
  const { decimals, symbol } = useErc20Meta(tokenAddresses[Currency.USDC]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Frais de gestion</CardTitle>
      </CardHeader>
      <div className="divide-y" style={{ borderColor: "var(--color-navy-700)" }}>
        <AddressSetterRow
          label="Wallet de frais"
          hint="Destinataire des frais prélevés au premier dépôt de chaque dossier (voir depositFunds)."
          currentValue={feesWalletAddress}
          functionName="setFeesWalletAddress"
          onUpdated={onUpdated}
        />
        <AmountSetterRow
          label="Montant des frais"
          hint={`Même montant quelle que soit la devise de la transaction (USDC/USDT/EURC), exprimé ici en ${symbol || "…"}.`}
          currentValue={feesAmount}
          decimals={decimals}
          symbol={symbol}
          functionName="setFeesAmount"
          onUpdated={onUpdated}
        />
      </div>
    </Card>
  );
}
