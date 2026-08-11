"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { currencyLabels } from "@/lib/domain/enums";
import { formatAmount } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { estimateDepositAmount } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Allowance, useErc20Balance, useErc20Meta } from "@/hooks/useErc20";
import { useFeesAmount } from "@/hooks/useFeesAmount";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { erc20Abi } from "@/lib/web3/abi/erc20";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";

export function DepositPanel({ transactionId, tx, onDeposited }: { transactionId: `0x${string}`; tx: OnChainTransaction; onDeposited: () => void }) {
  const { address } = useAccount();
  const { tokenAddresses } = useTokenAddresses();
  const tokenAddress = tokenAddresses[tx.currency];
  const { decimals, symbol } = useErc20Meta(tokenAddress);
  const balanceQuery = useErc20Balance(tokenAddress, address);
  const allowanceQuery = useErc20Allowance(tokenAddress, address, meridianAddress);
  const { feesAmount } = useFeesAmount();

  const approveAction = useContractAction();
  const depositAction = useContractAction();

  const amountDue = estimateDepositAmount(tx);
  // depositFunds prélève les frais de gestion en plus du dépôt lui-même,
  // mais seulement au tout premier appel réussi (tx.feesPaid encore à
  // false) — voir Meridian.sol. Il faut donc les inclure dans l'allowance
  // à approuver et dans le montant réellement transféré par l'acheteur ce
  // coup-ci, sans les compter sur les dépôts complémentaires suivants.
  const isFirstDeposit = !tx.feesPaid;
  const feesForThisDeposit = isFirstDeposit ? feesAmount : 0n;
  const totalDue = amountDue + feesForThisDeposit;

  const allowance = (allowanceQuery.data as bigint | undefined) ?? 0n;
  const balance = (balanceQuery.data as bigint | undefined) ?? 0n;
  const needsApproval = allowance < totalDue;
  const insufficientBalance = balance < totalDue;

  useEffect(() => {
    if (approveAction.isSuccess) allowanceQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveAction.isSuccess]);

  useEffect(() => {
    if (depositAction.isSuccess) onDeposited();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositAction.isSuccess]);

  if (tx.depositCompleted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dépôt</CardTitle>
        </CardHeader>
        <p className="text-sm" style={{ color: "#86efac" }}>
          Montant déposé: {formatAmount(tx.depositedAmount, decimals)} {symbol}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Déposer les fonds</CardTitle>
      </CardHeader>

      <div className="mb-4 flex flex-col gap-1 text-sm">
        <span className="text-muted">
          Prochain versement à effectuer : <span className="text-foam">{formatAmount(amountDue, decimals)} {currencyLabels[tx.currency]}</span>
        </span>
        {feesForThisDeposit > 0n && (
          <span className="text-muted">
            + Frais de gestion (1er dépôt) : <span className="text-foam">{formatAmount(feesForThisDeposit, decimals)} {symbol}</span>
          </span>
        )}
        {feesForThisDeposit > 0n && (
          <span className="text-foam">
            Total à approuver et déposer : {formatAmount(totalDue, decimals)} {symbol}
          </span>
        )}
        <span className="text-subtle">
          Solde disponible : {formatAmount(balance, decimals)} {symbol}
        </span>
      </div>

      {insufficientBalance && (
        <p className="mb-3 text-sm text-danger">Solde {symbol} insuffisant. Utilisez le robinet de jetons de test depuis le tableau de bord.</p>
      )}

      <div className="flex flex-col gap-3">
        {needsApproval ? (
          <>
            <TxStatusLine stage={approveAction.stage} error={approveAction.error} />
            <Button
              variant="secondary"
              disabled={insufficientBalance || !tokenAddress}
              loading={approveAction.isBusy}
              onClick={() =>
                tokenAddress &&
                approveAction.execute({
                  address: tokenAddress,
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [meridianAddress, totalDue],
                })
              }
            >
              Approuver {formatAmount(totalDue, decimals)} {symbol}
              {feesForThisDeposit > 0n ? " (dont frais de gestion)" : ""}
            </Button>
          </>
        ) : (
          <>
            <TxStatusLine stage={depositAction.stage} error={depositAction.error} />
            <Button
              disabled={insufficientBalance}
              loading={depositAction.isBusy}
              onClick={() =>
                depositAction.execute({
                  address: meridianAddress,
                  abi: meridianAbi,
                  functionName: "depositFunds",
                  args: [transactionId],
                })
              }
            >
              Déposer {formatAmount(amountDue, decimals)} {symbol}
              {feesForThisDeposit > 0n ? ` + ${formatAmount(feesForThisDeposit, decimals)} ${symbol} de frais` : ""}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
