"use client";

import { useEffect } from "react";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { AdvancePaymentMode, containerPositionStatusLabels, TransactionCondition } from "@/lib/domain/enums";
import { formatAmount } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { isContainerPositionSufficientForWithdrawal } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Meta } from "@/hooks/useErc20";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";

export function WithdrawPanel({ transactionId, tx, onWithdrawn }: { transactionId: `0x${string}`; tx: OnChainTransaction; onWithdrawn: () => void }) {
  const { tokenAddresses } = useTokenAddresses();
  const { decimals, symbol } = useErc20Meta(tokenAddresses[tx.currency]);
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  useEffect(() => {
    if (isSuccess) onWithdrawn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const nothingToWithdraw = tx.pendingWithdrawalAmount === 0n;
  const containerConditionMet = isContainerPositionSufficientForWithdrawal(tx);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retirer les fonds</CardTitle>
      </CardHeader>

      <p className="mb-4 text-sm text-muted">
        Montant disponible au retrait :{" "}
        <span className="text-foam">
          {formatAmount(tx.pendingWithdrawalAmount, decimals)} {symbol}
        </span>
      </p>

      {nothingToWithdraw ? (
        <p className="text-sm text-subtle">Aucun fonds en attente pour l&apos;instant.</p>
      ) : !containerConditionMet ? (
        <p className="text-sm text-subtle">
          Retrait bloqué : ce dossier exige{" "}
          {tx.transactionCondition === TransactionCondition.AtTheBeginningOfDelivery
            ? "que le conteneur soit au moins en transit"
            : "que le conteneur soit arrivé à destination"}{" "}
          avant de pouvoir retirer les fonds. Position actuelle rapportée : {containerPositionStatusLabels[tx.containerPositionStatus].toLowerCase()}.
          {tx.advancePaymentMode === AdvancePaymentMode.Immediate && tx.partialWithdrawalCompleted && (
            <> L&apos;acompte immédiat a déjà été retiré : le reliquat suit désormais les mêmes règles qu&apos;un paiement différé.</>
          )}
        </p>
      ) : (
        <>
          <TxStatusLine stage={stage} error={error} />
          <Button
            className="mt-3"
            loading={isBusy}
            onClick={() =>
              execute({
                address: meridianAddress,
                abi: meridianAbi,
                functionName: "withdrawFunds",
                args: [transactionId],
              })
            }
          >
            Retirer {formatAmount(tx.pendingWithdrawalAmount, decimals)} {symbol}
          </Button>
        </>
      )}
    </Card>
  );
}
