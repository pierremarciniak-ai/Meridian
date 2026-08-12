"use client";

import { useAccount } from "wagmi";
import { FeesPanel } from "@/components/admin/FeesPanel";
import { OraclesPanel } from "@/components/admin/OraclesPanel";
import { OwnerPanel } from "@/components/admin/OwnerPanel";
import { SanctionsListPanel } from "@/components/admin/SanctionsListPanel";
import { TokenAddressesPanel } from "@/components/admin/TokenAddressesPanel";
import { AlertIcon, CompassIcon } from "@/components/icons";
import { Card } from "@/components/ui/Card";
import { useAdminState } from "@/hooks/useAdminState";
import { useIsOwner } from "@/hooks/useIsOwner";

export function AdminDashboard() {
  const { isConnected } = useAccount();
  const { isOwner, isLoading: isOwnerLoading } = useIsOwner();
  const admin = useAdminState();

  if (!isConnected) {
    return (
      <Card className="items-center text-center">
        <div className="flex flex-col items-center gap-3 py-6">
          <CompassIcon className="h-8 w-8 text-subtle" />
          <p className="text-sm text-muted">Connectez le portefeuille owner du contrat pour accéder à l&apos;administration.</p>
        </div>
      </Card>
    );
  }

  if (isOwnerLoading || admin.isLoading) {
    return <div className="h-64 animate-pulse rounded-lg" style={{ background: "var(--color-navy-850)" }} />;
  }

  if (!isOwner) {
    return (
      <Card className="items-center text-center">
        <div className="flex flex-col items-center gap-3 py-6">
          <AlertIcon className="h-8 w-8 text-danger" />
          <h1 className="text-lg font-semibold text-foam">Accès refusé</h1>
          <p className="max-w-sm text-sm text-muted">
            Le portefeuille connecté n&apos;est pas le owner du contrat Meridian. Seul le owner peut accéder à cette page.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <OwnerPanel owner={admin.owner} onUpdated={admin.refetch} />
      <TokenAddressesPanel tokenAddressesOnChain={admin.tokenAddressesOnChain} onUpdated={admin.refetch} />
      <FeesPanel feesWalletAddress={admin.feesWalletAddress} feesRateBps={admin.feesRateBps} onUpdated={admin.refetch} />
      <OraclesPanel
        sanctionsOracleAddress={admin.sanctionsOracleAddress}
        mockSanctionsOracleAddress={admin.mockSanctionsOracleAddress}
        meridianNFTAddress={admin.meridianNFTAddress}
        containerPositionOracleAddress={admin.containerPositionOracleAddress}
        mockSanctionsEnabled={admin.mockSanctionsEnabled}
        onUpdated={admin.refetch}
      />
      <SanctionsListPanel
        mockSanctionsEnabled={admin.mockSanctionsEnabled}
        mockSanctionsOracleAddress={admin.mockSanctionsOracleAddress}
      />
    </div>
  );
}
