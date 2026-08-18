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
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { erc20Abi } from "@/lib/web3/abi/erc20";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

export function DepositPanel({ transactionId, tx, onDeposited }: { transactionId: `0x${string}`; tx: OnChainTransaction; onDeposited: () => void }) {
  const { address } = useAccount();
  const meridianAddress = useMeridianAddress();
  const { tokenAddresses } = useTokenAddresses();
  const tokenAddress = tokenAddresses[tx.currency];
  const { decimals, symbol } = useErc20Meta(tokenAddress);
  const balanceQuery = useErc20Balance(tokenAddress, address);
  const allowanceQuery = useErc20Allowance(tokenAddress, address, meridianAddress);

  const approveAction = useContractAction();
  const depositAction = useContractAction();

  // Les frais de service sont désormais prélevés à la signature complète du
  // dossier (voir TransactionSummary), pas au dépôt : amountDue porte sur
  // netAmountDue (déjà réduit de la part de frais du fournisseur), plus
  // aucun montant de frais à ajouter ici.
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
        {tx.feesPaid && (
          <span className="text-subtle">Frais de service déduits du montant</span>
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
              disabled={insufficientBalance || !tokenAddress || !meridianAddress}
              loading={approveAction.isBusy}
              onClick={() =>
                tokenAddress &&
                meridianAddress &&
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
              disabled={insufficientBalance || !meridianAddress}
              loading={depositAction.isBusy}
              onClick={() =>
                meridianAddress &&
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
