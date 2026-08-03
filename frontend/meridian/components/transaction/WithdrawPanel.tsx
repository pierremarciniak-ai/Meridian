"use client";

import { useEffect } from "react";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatAmount } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Meta } from "@/hooks/useErc20";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress, tokenAddresses } from "@/lib/web3/contracts";

export function WithdrawPanel({ transactionId, tx, onWithdrawn }: { transactionId: `0x${string}`; tx: OnChainTransaction; onWithdrawn: () => void }) {
  const { decimals, symbol } = useErc20Meta(tokenAddresses[tx.currency]);
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  useEffect(() => {
    if (isSuccess) onWithdrawn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const nothingToWithdraw = tx.pendingWithdrawalAmount === 0n;

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
        <p className="text-sm text-subtle">Aucun fonds en attente pour l&apos;instant — revenez une fois l&apos;acheteur déposé.</p>
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
