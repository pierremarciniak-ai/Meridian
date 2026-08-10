"use client";

import { useEffect } from "react";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { formatAmount } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Meta } from "@/hooks/useErc20";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";

// rollbackDeposit est réservé à l'acheteur (onlyBuyer) et ne fait rien tant
// que pendingWithdrawalAmount est déjà à 0 (voir canRollbackDeposit) : rien à
// afficher côté fournisseur ou une fois les fonds déjà récupérés/retirés.
export function RollbackPanel({ transactionId, tx, onRolledBack }: { transactionId: `0x${string}`; tx: OnChainTransaction; onRolledBack: () => void }) {
  const { tokenAddresses } = useTokenAddresses();
  const { decimals, symbol } = useErc20Meta(tokenAddresses[tx.currency]);
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  useEffect(() => {
    if (isSuccess) onRolledBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  return (
    <div className="mt-4">
      <p className="mb-3 text-sm text-danger">
        Provision déposée à récupérer: {formatAmount(tx.pendingWithdrawalAmount, decimals)} {symbol}
      </p>
      <TxStatusLine stage={stage} error={error} />
      <Button
        variant="secondary"
        className="mt-2"
        loading={isBusy}
        onClick={() =>
          execute({
            address: meridianAddress,
            abi: meridianAbi,
            functionName: "rollbackDeposit",
            args: [transactionId],
          })
        }
      >
        Restituer la provision disponible
      </Button>
    </div>
  );
}
