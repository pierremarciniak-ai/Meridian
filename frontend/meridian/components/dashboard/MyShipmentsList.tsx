"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ShipmentRow } from "@/components/dashboard/ShipmentRow";
import { AlertIcon, ContainerShipIcon, SearchIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { WorkflowStatus } from "@/lib/domain/enums";
import { isCurrentEditor, pendingActionReason, sameAddress } from "@/lib/domain/transaction";
import { useMyShipments } from "@/hooks/useMyShipments";

/** Liste "Mes contrats" (acheteur ou fournisseur), avec recherche et bandeau "N contrat(s) nécessite(nt) une action". */
export function MyShipmentsList() {
  const { address, isConnected } = useAccount();
  const { shipments, isLoading, error, refresh } = useMyShipments(address);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shipments;
    return shipments.filter(({ id, tx }) => id.toLowerCase().includes(q) || tx.billNumber.toLowerCase().includes(q));
  }, [shipments, query]);

  /**
   * Nombre de contrats pour lesquels le wallet connecté (acheteur ou
   * fournisseur) a une action disponible : dépôt, retrait, ou signature en
   * attente — mêmes conditions que les bulles de ShipmentRow, pas de
   * logique dupliquée.
   */
  const pendingCount = useMemo(() => {
    if (!address) return 0;
    return shipments.reduce((count, { tx }) => {
      const roleKey = sameAddress(tx.buyer.userAddress, address) ? "buyer" : sameAddress(tx.seller.userAddress, address) ? "seller" : null;
      const awaitingMySignature = tx.workflowStatus === WorkflowStatus.Created && isCurrentEditor(tx, roleKey);
      const hasAction = pendingActionReason(tx, roleKey) !== null || awaitingMySignature;
      return hasAction ? count + 1 : count;
    }, 0);
  }, [shipments, address]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mes contrats</CardTitle>
        <Button variant="ghost" onClick={() => refresh()} disabled={!isConnected || isLoading}>
          Rafraîchir
        </Button>
      </CardHeader>

      {isConnected && pendingCount > 0 && (
        <div className="action-banner">
          <AlertIcon className="h-4 w-4 shrink-0" />
          {pendingCount > 1
            ? `${pendingCount} contrats nécessitent une action de votre part.`
            : "1 contrat nécessite une action de votre part."}
        </div>
      )}

      {!isConnected && (
        <p className="flex flex-col items-center gap-3 py-10 text-center text-sm text-subtle">
          <ContainerShipIcon className="h-8 w-8 text-subtle" />
          Connectez votre portefeuille pour retrouver les contrats où vous êtes acheteur ou fournisseur.
        </p>
      )}

      {isConnected && isLoading && shipments.length === 0 && <p className="py-6 text-center text-sm text-subtle">Recherche des contrats…</p>}

      {isConnected && error && (
        <p className="flex flex-col items-center gap-3 py-10 text-center text-sm text-danger">
          <AlertIcon className="h-8 w-8" />
          {error}
        </p>
      )}

      {isConnected && !isLoading && !error && shipments.length === 0 && (
        <p className="flex flex-col items-center gap-3 py-10 text-center text-sm text-subtle">
          <ContainerShipIcon className="h-8 w-8 text-subtle" />
          Aucun contrat pour l&apos;instant. Créez-en un, ou acceptez-en un en tant que fournisseur.
        </p>
      )}

      {isConnected && shipments.length > 0 && (
        <div className="relative mb-4">
          <SearchIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            className="field-input pr-9"
            placeholder="Rechercher par référence du contrat ou numéro de bon de commande…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map(({ id, tx }) => (
            <ShipmentRow key={id} id={id} tx={tx} />
          ))}
        </div>
      )}

      {isConnected && !isLoading && !error && shipments.length > 0 && filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-subtle">
          Aucun contrat ne correspond à cette recherche parmi ceux où vous êtes acheteur ou fournisseur.
        </p>
      )}
    </Card>
  );
}
