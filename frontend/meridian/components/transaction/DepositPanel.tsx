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
import { erc20Abi } from "@/lib/web3/abi/erc20";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress, tokenAddresses } from "@/lib/web3/contracts";

export function DepositPanel({ transactionId, tx, onDeposited }: { transactionId: `0x${string}`; tx: OnChainTransaction; onDeposited: () => void }) {
  const { address } = useAccount();
  const tokenAddress = tokenAddresses[tx.currency];
  const { decimals, symbol } = useErc20Meta(tokenAddress);
  const balanceQuery = useErc20Balance(tokenAddress, address);
  const allowanceQuery = useErc20Allowance(tokenAddress, address, meridianAddress);

  const approveAction = useContractAction();
  const depositAction = useContractAction();

  const amountDue = estimateDepositAmount(tx);
  const allowance = (allowanceQuery.data as bigint | undefined) ?? 0n;
  const balance = (balanceQuery.data as bigint | undefined) ?? 0n;
  const needsApproval = allowance < amountDue;
  const insufficientBalance = balance < amountDue;

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
          Financement complet : {formatAmount(tx.depositedAmount, decimals)} {symbol} déposés sur l&apos;escrow.
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
          Prochain versement dû : <span className="text-foam">{formatAmount(amountDue, decimals)} {currencyLabels[tx.currency]}</span>
        </span>
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
              disabled={insufficientBalance}
              loading={approveAction.isBusy}
              onClick={() =>
                approveAction.execute({
                  address: tokenAddress,
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [meridianAddress, amountDue],
                })
              }
            >
              Approuver {formatAmount(amountDue, decimals)} {symbol}
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
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
