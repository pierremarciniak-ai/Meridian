"use client";

import { useEffect } from "react";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { formatAmount } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import type { ContainerPositionAttestation } from "@/hooks/useContainerPositionAttestation";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Meta } from "@/hooks/useErc20";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

// rollbackDeposit est réservé à l'acheteur (onlyBuyer) et ne fait rien tant
// que pendingWithdrawalAmount est déjà à 0 (voir canRollbackDeposit) : rien à
// afficher côté fournisseur ou une fois les fonds déjà récupérés/retirés.
//
// refetchAttestation vient de TransactionDetail (une seule requête
// useContainerPositionAttestation partagée avec la logique d'affichage,
// plutôt qu'un second fetch indépendant ici) : au clic, on revérifie une
// attestation fraîche et on l'envoie avec la transaction elle-même
// (rollbackDepositWithPositionUpdate) si elle est disponible — sinon on
// retombe sur le rollbackDeposit "nu", au cas où l'état déjà en storage
// suffirait.
export function RollbackPanel({
  transactionId,
  tx,
  onRolledBack,
  refetchAttestation,
}: {
  transactionId: `0x${string}`;
  tx: OnChainTransaction;
  onRolledBack: () => void;
  refetchAttestation?: () => Promise<ContainerPositionAttestation | undefined>;
}) {
  const meridianAddress = useMeridianAddress();
  const { tokenAddresses } = useTokenAddresses();
  const { decimals, symbol } = useErc20Meta(tokenAddresses[tx.currency]);
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  useEffect(() => {
    if (isSuccess) onRolledBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  async function handleRollback() {
    if (!meridianAddress) return;
    const fresh = await refetchAttestation?.();
    if (fresh?.available) {
      await execute({
        address: meridianAddress,
        abi: meridianAbi,
        functionName: "rollbackDepositWithPositionUpdate",
        args: [transactionId, fresh.status, BigInt(fresh.deadline), fresh.signature],
      });
    } else {
      await execute({
        address: meridianAddress,
        abi: meridianAbi,
        functionName: "rollbackDeposit",
        args: [transactionId],
      });
    }
  }

  return (
    <div className="mt-4">
      <p className="mb-3 text-sm text-danger">
        Fonds déposés à récupérer: {formatAmount(tx.pendingWithdrawalAmount, decimals)} {symbol}
      </p>
      <TxStatusLine stage={stage} error={error} />
      <Button variant="secondary" className="mt-2" loading={isBusy} onClick={handleRollback}>
        Récupérer mes fonds
      </Button>
    </div>
  );
}
