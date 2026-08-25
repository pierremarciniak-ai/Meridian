"use client";

import Link from "next/link";
import type { Hex } from "viem";
import { useAccount } from "wagmi";
import { StatusBadge } from "@/components/StatusBadge";
import { AlertIcon, CheckIcon, ClockIcon, SignatureIcon } from "@/components/icons";
import { currencyLabels, UserType, WorkflowStatus } from "@/lib/domain/enums";
import { formatAmount, formatUnixDate, truncateHex } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import {
  depositProgressStatus,
  isCurrentEditor,
  isTransactionOverdue,
  pendingActionReason,
  sameAddress,
} from "@/lib/domain/transaction";
import { useErc20Meta } from "@/hooks/useErc20";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";

const actionLabels = {
  deposit: "En attente de dépôt",
  rollback: "Retrait disponible",
  withdraw: "Retrait disponible",
} as const;

const signatureLabels = {
  [UserType.Buyer]: "En attente signature acheteur",
  [UserType.Seller]: "En attente signature fournisseur",
} as const;

const depositProgressLabels = {
  advance: "Acompte déposé",
  full: "Montant total déposé",
} as const;

export function ShipmentRow({ id, tx }: { id: Hex; tx: OnChainTransaction }) {
  const { address } = useAccount();
  const { tokenAddresses } = useTokenAddresses();
  const { decimals } = useErc20Meta(tokenAddresses[tx.currency]);

  const isBuyer = sameAddress(tx.buyer.userAddress, address);
  const isSeller = sameAddress(tx.seller.userAddress, address);
  const roleKey: "buyer" | "seller" | null = isBuyer ? "buyer" : isSeller ? "seller" : null;
  const role = isBuyer ? "Acheteur" : isSeller ? "Fournisseur" : null;
  const actionReason = pendingActionReason(tx, roleKey);
  const overdue = tx.workflowStatus === WorkflowStatus.Signed && isTransactionOverdue(tx);
  const awaitingSignature = tx.workflowStatus === WorkflowStatus.Created;
  const myTurnToSign = awaitingSignature && isCurrentEditor(tx, roleKey);
  const depositProgress = depositProgressStatus(tx);
  // Même calcul que pendingCount dans MyShipmentsList (bulle "N contrat(s)
  // nécessite(nt) une action...") : actionReason seul ne couvre pas le cas
  // "en attente de ma signature" (contrat encore en Created), à additionner
  // pour que la bordure corresponde exactement à ce que compte le bandeau.
  const needsMyAction = !!actionReason || myTurnToSign;

  return (
    <Link
      href={`/transaction/${id}`}
      className="flex items-center justify-between gap-4 rounded-lg px-4 py-3.5 transition-colors"
      style={{
        background: "var(--color-navy-850)",
        // Même ton que .action-banner (bulle "N contrat(s) nécessite(nt)
        // une action...") : permet de repérer visuellement, dans la liste,
        // les contrats concernés sans avoir à lire chaque bulle.
        border: needsMyAction ? "1px solid rgba(217, 165, 102, 0.5)" : "1px solid var(--color-navy-700)",
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate font-mono-tight text-sm text-foam">{tx.billNumber || truncateHex(id)}</span>
          {role && <span className="label-caps shrink-0 text-accent">{role}</span>}
        </div>
        <span className="font-mono-tight text-xs text-subtle">{truncateHex(id, 8)}</span>
      </div>

      <div className="hidden flex-col items-end gap-1 sm:flex">
        <span className="text-sm text-foam">
          {formatAmount(tx.totalAmount, decimals)} {currencyLabels[tx.currency]}
        </span>
        <span className="text-xs text-subtle">Échéance {formatUnixDate(tx.transactionCancellingDate)}</span>
      </div>

      <div className="flex w-auto shrink-0 flex-col items-end gap-1.5 sm:w-[250px]">
        <StatusBadge status={tx.workflowStatus} />
        {awaitingSignature &&
          (isCurrentEditor(tx, roleKey) ? (
            // action-badge (même ton que .action-banner), contrairement à
            // signatureLabels ci-dessous : c'est une action attendue de
            // l'utilisateur courant, pas juste une information d'attente.
            <span className="action-badge">
              <SignatureIcon className="h-3 w-3" />
              En attente de ma signature
            </span>
          ) : (
            <span className="waiting-badge">
              <ClockIcon className="h-3 w-3" />
              {signatureLabels[tx.currentEditor]}
            </span>
          ))}
        {depositProgress && (
          <span className="waiting-badge">
            <CheckIcon className="h-3 w-3" />
            {depositProgressLabels[depositProgress]}
          </span>
        )}
        {overdue && (
          <span className="warning-badge">
            <AlertIcon className="h-3 w-3" />
            Date d&apos;expiration dépassée
          </span>
        )}
        {actionReason && (
          <span className="action-badge">
            <AlertIcon className="h-3 w-3" />
            {actionLabels[actionReason]}
          </span>
        )}
      </div>
    </Link>
  );
}
