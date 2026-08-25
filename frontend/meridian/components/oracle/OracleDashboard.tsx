"use client";

import { useAccount } from "wagmi";
import { OpenShipmentPanel } from "@/components/dashboard/OpenShipmentPanel";
import { AlertIcon, CompassIcon } from "@/components/icons";
import { Card } from "@/components/ui/Card";
import { useIsContainerPositionOracle } from "@/hooks/useIsContainerPositionOracle";

export function OracleDashboard() {
  const { isConnected } = useAccount();
  const { isContainerPositionOracle, isLoading } = useIsContainerPositionOracle();

  if (!isConnected) {
    return (
      <Card className="items-center text-center">
        <div className="flex flex-col items-center gap-3 py-6">
          <CompassIcon className="h-8 w-8 text-subtle" />
          <p className="text-sm text-muted">
            Connectez le wallet configuré comme oracle de position de conteneur pour accéder à cet outil.
          </p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-lg" style={{ background: "var(--color-navy-850)" }} />;
  }

  if (!isContainerPositionOracle) {
    return (
      <Card className="items-center text-center">
        <div className="flex flex-col items-center gap-3 py-6">
          <AlertIcon className="h-8 w-8 text-danger" />
          <h1 className="text-lg font-semibold text-foam">Accès refusé</h1>
          <p className="max-w-sm text-sm text-muted">
            Le wallet connecté n&apos;est pas l&apos;oracle de position de conteneur configuré sur le contrat Meridian.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Ouvrez un contrat pour reporter sa position de conteneur — le panneau de report apparaît directement sur sa
        page une fois le contrat signé.
      </p>
      <OpenShipmentPanel />
    </div>
  );
}
