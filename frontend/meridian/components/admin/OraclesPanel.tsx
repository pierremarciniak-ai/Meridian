"use client";

import { AddressSetterRow } from "@/components/admin/AddressSetterRow";
import { ToggleRow } from "@/components/admin/ToggleRow";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

export function OraclesPanel({
  sanctionsOracleAddress,
  mockSanctionsOracleAddress,
  meridianNFTAddress,
  containerPositionOracleAddress,
  checkSanctionsEnabled,
  mockSanctionsEnabled,
  onUpdated,
}: {
  sanctionsOracleAddress: `0x${string}` | undefined;
  mockSanctionsOracleAddress: `0x${string}` | undefined;
  meridianNFTAddress: `0x${string}` | undefined;
  containerPositionOracleAddress: `0x${string}` | undefined;
  checkSanctionsEnabled: boolean | undefined;
  mockSanctionsEnabled: boolean | undefined;
  onUpdated: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Oracles & contrats liés</CardTitle>
      </CardHeader>
      <div className="divide-y" style={{ borderColor: "var(--color-navy-700)" }}>
        <ToggleRow
          label="Vérification des sanctions (OFAC)"
          hint="Si désactivé, initializeTransaction/createTransaction ne consultent plus aucun oracle de sanctions."
          value={checkSanctionsEnabled}
          functionName="toggleSanctionsCheck"
          onUpdated={onUpdated}
        />
        <ToggleRow
          label="Utiliser l'oracle mock"
          hint="Active/désactive le mock (tests) à la place de l'oracle réel pour la vérification des sanctions."
          value={mockSanctionsEnabled}
          functionName="toggleMockSanctionsOracle"
          onUpdated={onUpdated}
        />
        <AddressSetterRow
          label="Oracle sanctions (réel)"
          currentValue={sanctionsOracleAddress}
          functionName="setSanctionsOracleAddress"
          onUpdated={onUpdated}
        />
        <AddressSetterRow
          label="Oracle sanctions (mock)"
          currentValue={mockSanctionsOracleAddress}
          functionName="setMockSanctionsOracleAddress"
          onUpdated={onUpdated}
        />
        <AddressSetterRow
          label="Oracle position de conteneur"
          hint="Adresse du service backend qui appelle reportContainerPosition (cron VesselFinder)."
          currentValue={containerPositionOracleAddress}
          functionName="setContainerPositionOracleAddress"
          onUpdated={onUpdated}
        />
        <AddressSetterRow
          label="Contrat MeridianNFT"
          currentValue={meridianNFTAddress}
          functionName="setMeridianNFTAddress"
          onUpdated={onUpdated}
        />
      </div>
    </Card>
  );
}
