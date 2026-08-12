"use client";

import { useEffect } from "react";
import { CopyChip } from "@/components/CopyChip";
import { CheckIcon, ClockIcon } from "@/components/icons";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import {
  WorkflowStatus,
  advancePaymentModeLabels,
  containerPositionStatusLabels,
  currencyLabels,
  transactionConditionLabels,
  transactionModelLabels,
} from "@/lib/domain/enums";
import { formatAmount, formatUnixDate } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { estimateFees, isCurrentEditor, sameAddress } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Allowance, useErc20Balance } from "@/hooks/useErc20";
import { useFeesRateBps } from "@/hooks/useFeesRateBps";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { erc20Abi } from "@/lib/web3/abi/erc20";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

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
  const signAction = useContractAction();
  const approveFeesAction = useContractAction();
  const meridianAddress = useMeridianAddress();
  const { feesRateBps } = useFeesRateBps();
  const { tokenAddresses } = useTokenAddresses();
  const tokenAddress = tokenAddresses[tx.currency];

  const canSign = tx.workflowStatus === WorkflowStatus.Created;
  const alreadySigned = role === "buyer" ? tx.signedByBuyer : role === "seller" ? tx.signedBySeller : false;
  const myTurn = isCurrentEditor(tx, role);

  // Les frais ne sont plus figés on-chain (tx.feesAmount/netAmountDue restent
  // à 0) tant que les deux signatures ne sont pas réunies : ce calcul en
  // temps réel, sur totalAmount et feesRateBps actuels, sert à la fois à
  // l'affichage avant signature et à dimensionner l'allowance à demander à
  // l'acheteur. currentEditor démarre toujours à Seller (voir
  // InternalFunctions.sol) : c'est donc systématiquement la signature de
  // l'acheteur qui complète le dossier et déclenche le prélèvement — seul ce
  // rôle a besoin d'un flow d'approbation ici, jamais le fournisseur.
  const feesEstimate = tx.feesPaid ? tx.feesAmount : estimateFees(tx.totalAmount, feesRateBps).feesAmount;

  const buyerAllowanceQuery = useErc20Allowance(tokenAddress, tx.buyer.userAddress, meridianAddress);
  const buyerBalanceQuery = useErc20Balance(tokenAddress, tx.buyer.userAddress);
  const buyerAllowance = (buyerAllowanceQuery.data as bigint | undefined) ?? 0n;
  const buyerBalance = (buyerBalanceQuery.data as bigint | undefined) ?? 0n;

  const isBuyerTurnToSign = role === "buyer" && canSign && myTurn && !alreadySigned;
  const feesAlreadyHandled = tx.feesPaid || feesEstimate === 0n;
  const needsFeeApproval = isBuyerTurnToSign && !feesAlreadyHandled && buyerAllowance < feesEstimate;
  const insufficientFeeBalance = isBuyerTurnToSign && !feesAlreadyHandled && buyerBalance < feesEstimate;

  useEffect(() => {
    if (signAction.isSuccess) onSigned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signAction.isSuccess]);

  useEffect(() => {
    if (approveFeesAction.isSuccess) buyerAllowanceQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveFeesAction.isSuccess]);

  async function handleSign() {
    if (!meridianAddress) return;
    await signAction.execute({
      address: meridianAddress,
      abi: meridianAbi,
      functionName: role === "buyer" ? "signTransactionBuyer" : "signTransactionSeller",
      args: [transactionId],
    });
  }

  async function handleApproveFees() {
    if (!tokenAddress || !meridianAddress) return;
    await approveFeesAction.execute({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [meridianAddress, feesEstimate],
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
          <Row label="Conteneur">{tx.containerReference ? <span className="font-mono-tight">{tx.containerReference}</span> : "—"}</Row>
          <Row label="Position du conteneur">{containerPositionStatusLabels[tx.containerPositionStatus]}</Row>
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
          <Row label="Frais de gestion">
            {tx.feesPaid ? (
              <span className="flex items-center justify-end gap-1">
                <CheckIcon className="h-3.5 w-3.5 text-accent" /> {formatAmount(tx.feesAmount, decimals)} {symbol} payés
              </span>
            ) : feesEstimate > 0n ? (
              <>
                ~{formatAmount(feesEstimate, decimals)} {symbol} · à payer par l&apos;acheteur à la double signature
              </>
            ) : (
              "Aucun"
            )}
          </Row>
          <Row label="Date d'expiration de la provision">{formatUnixDate(tx.transactionCancellingDate)}</Row>
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
            {!role ? (
              <p className="text-sm text-subtle">Seuls l&apos;acheteur et le fournisseur déclarés peuvent signer ce dossier.</p>
            ) : !myTurn ? (
              <p className="text-sm text-subtle">
                En attente de la signature {role === "buyer" ? "du fournisseur" : "de l'acheteur"}
              </p>
            ) : (
              <>
                {insufficientFeeBalance && (
                  <p className="mb-2 text-sm text-danger">
                    Solde {symbol} insuffisant pour payer les frais de gestion (~{formatAmount(feesEstimate, decimals)} {symbol} requis).
                  </p>
                )}

                {needsFeeApproval ? (
                  <>
                    <TxStatusLine stage={approveFeesAction.stage} error={approveFeesAction.error} />
                    <Button
                      className="mt-2 w-full"
                      variant="secondary"
                      onClick={handleApproveFees}
                      disabled={insufficientFeeBalance || !tokenAddress || !meridianAddress}
                      loading={approveFeesAction.isBusy}
                    >
                      Approuver {formatAmount(feesEstimate, decimals)} {symbol} de frais de gestion
                    </Button>
                  </>
                ) : (
                  <>
                    <TxStatusLine stage={signAction.stage} error={signAction.error} />
                    <Button
                      className="mt-2 w-full"
                      onClick={handleSign}
                      disabled={alreadySigned || insufficientFeeBalance || !meridianAddress}
                      loading={signAction.isBusy}
                    >
                      {alreadySigned
                        ? "Signé"
                        : `Signer en tant que ${role === "buyer" ? "acheteur" : "fournisseur"}`}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
