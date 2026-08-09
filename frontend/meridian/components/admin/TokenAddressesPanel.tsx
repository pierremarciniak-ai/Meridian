"use client";

import { AddressSetterRow } from "@/components/admin/AddressSetterRow";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Currency, currencyLabels } from "@/lib/domain/enums";

export function TokenAddressesPanel({
  tokenAddressesOnChain,
  onUpdated,
}: {
  tokenAddressesOnChain: Record<Currency, `0x${string}` | undefined>;
  onUpdated: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Adresses des tokens</CardTitle>
      </CardHeader>
      <div className="divide-y" style={{ borderColor: "var(--color-navy-700)" }}>
        {Object.values(Currency)
          .filter((v) => typeof v === "number")
          .map((currency) => (
            <AddressSetterRow
              key={currency}
              label={currencyLabels[currency as Currency]}
              currentValue={tokenAddressesOnChain[currency as Currency]}
              functionName="setTokenAddress"
              extraArgs={[currency]}
              onUpdated={onUpdated}
            />
          ))}
      </div>
    </Card>
  );
}
