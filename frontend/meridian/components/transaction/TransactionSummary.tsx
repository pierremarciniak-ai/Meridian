"use client";

import { useEffect } from "react";
import { CopyChip } from "@/components/CopyChip";
import { CheckIcon, ClockIcon } from "@/components/icons";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import {
  WorkflowStatus,
  advancePaymentModeLabels,
  currencyLabels,
  transactionConditionLabels,
  transactionModelLabels,
} from "@/lib/domain/enums";
import { formatAmount, formatUnixDate } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { sameAddress } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="label-caps">{label}</span>
      <span className="text-right text-sm text-foam">{children}</span>
    </div>
  );
}

function PartyLine({ label, address, you }: { label: string; address: string; you: boolean }) {
  const isZero = sameAddress(address, "0x0000000000000000000000000000000000000000");
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="label-caps">{label}</span>
      {isZero ? (
        <span className="text-sm text-subtle">En attente</span>
      ) : (
        <span className="flex items-center gap-2">
          {you && <span className="label-caps text-accent">Vous</span>}
          <CopyChip value={address} />
        </span>
      )}
    </div>
  );
}

export function TransactionSummary({
  transactionId,
  tx,
  decimals,
  symbol,
  account,
  role,
  onSigned,
}: {
  transactionId: `0x${string}`;
  tx: OnChainTransaction;
  decimals: number;
  symbol: string;
  account?: string;
  role: "buyer" | "seller" | null;
  onSigned: () => void;
}) {
  const { execute, stage, error, isSuccess } = useContractAction();

  useEffect(() => {
    if (isSuccess) onSigned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const canSign = tx.workflowStatus === WorkflowStatus.Created;
  const alreadySigned = role === "buyer" ? tx.signedByBuyer : role === "seller" ? tx.signedBySeller : false;

  async function handleSign() {
    await execute({
      address: meridianAddress,
      abi: meridianAbi,
      functionName: role === "buyer" ? "signTransactionBuyer" : "signTransactionSeller",
      args: [transactionId],
    });
  }

  return (
    <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
      <div className="rope-divider md:border-t-0 md:border-r md:pr-8" style={{ borderColor: "var(--color-navy-600)" }}>
        <h3 className="label-caps mb-1 mt-4 md:mt-0">Parties</h3>
        <div className="divide-y" style={{ borderColor: "var(--color-navy-700)" }}>
          <PartyLine label="Acheteur" address={tx.buyer.userAddress} you={sameAddress(tx.buyer.userAddress, account)} />
          <PartyLine label="Fournisseur" address={tx.seller.userAddress} you={sameAddress(tx.seller.userAddress, account)} />
        </div>

        <h3 className="label-caps mb-1 mt-6">Logistique</h3>
        <div className="divide-y" style={{ borderColor: "var(--color-navy-700)" }}>
          <Row label="Départ">{formatUnixDate(tx.sellerDepartureDate)}</Row>
          <Row label="Arrivée">{formatUnixDate(tx.sellerArrivalDate)}</Row>
          <Row label="Conteneur">{tx.containerReference ? <span className="font-mono-tight">{tx.containerReference}</span> : "—"}</Row>
        </div>
      </div>

      <div>
        <h3 className="label-caps mb-1 mt-4 md:mt-0">Conditions financières</h3>
        <div className="divide-y" style={{ borderColor: "var(--color-navy-700)" }}>
          <Row label="Devise">{currencyLabels[tx.currency]}</Row>
          <Row label="Condition">{transactionConditionLabels[tx.transactionCondition]}</Row>
          <Row label="Modèle">{transactionModelLabels[tx.transactionModel]}</Row>
          <Row label="Acompte">
            {formatAmount(tx.advanceAmount, decimals)} {symbol} · {advancePaymentModeLabels[tx.advancePaymentMode].toLowerCase()}
          </Row>
          <Row label="Montant total">
            {formatAmount(tx.totalAmount, decimals)} {symbol}
          </Row>
          <Row label="Échéance">{formatUnixDate(tx.transactionCancellingDate)}</Row>
        </div>

        <h3 className="label-caps mb-1 mt-6">Règlement</h3>
        <div className="divide-y" style={{ borderColor: "var(--color-navy-700)" }}>
          <Row label="Déposé">
            {formatAmount(tx.depositedAmount, decimals)} {symbol}
          </Row>
          <Row label="En attente de retrait">
            {formatAmount(tx.pendingWithdrawalAmount, decimals)} {symbol}
          </Row>
          <Row label="Signatures">
            <span className="flex items-center justify-end gap-3">
              <span className="flex items-center gap-1">
                {tx.signedByBuyer ? <CheckIcon className="h-3.5 w-3.5 text-accent" /> : <ClockIcon className="h-3.5 w-3.5 text-subtle" />}
                Acheteur
              </span>
              <span className="flex items-center gap-1">
                {tx.signedBySeller ? <CheckIcon className="h-3.5 w-3.5 text-accent" /> : <ClockIcon className="h-3.5 w-3.5 text-subtle" />}
                Fournisseur
              </span>
            </span>
          </Row>
        </div>

        {canSign && (
          <div className="mt-4">
            {role ? (
              <>
                <TxStatusLine stage={stage} error={error} />
                <Button
                  className="mt-2 w-full"
                  onClick={handleSign}
                  disabled={alreadySigned}
                  loading={stage === "signing" || stage === "confirming"}
                >
                  {alreadySigned ? "Déjà signé" : `Signer en tant que ${role === "buyer" ? "acheteur" : "fournisseur"}`}
                </Button>
              </>
            ) : (
              <p className="text-sm text-subtle">Seuls l&apos;acheteur et le fournisseur déclarés peuvent signer ce dossier.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
