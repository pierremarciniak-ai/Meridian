"use client";

import { useEffect } from "react";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { AdvancePaymentMode, containerPositionStatusLabels, TransactionCondition } from "@/lib/domain/enums";
import { formatAmount } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { isContainerPositionSufficientForWithdrawal } from "@/lib/domain/transaction";
import { useContainerPositionAttestation } from "@/hooks/useContainerPositionAttestation";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Meta } from "@/hooks/useErc20";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

/**
 * Retrait des fonds disponibles par le fournisseur. Le statut on-chain
 * (`tx.containerPositionStatus`) n'est plus tenu à jour par un cron : on
 * interroge en direct une attestation signée par l'oracle
 * (`useContainerPositionAttestation`, sans coût de gas) pour savoir si la
 * condition est réellement remplie *maintenant*. Au clic, on récupère une
 * attestation fraîche et on l'envoie avec la transaction elle-même
 * (`withdrawFundsWithPositionUpdate`) : la mise à jour on-chain et le
 * retrait se font en un seul appel, payé par le vendeur — le wallet oracle
 * backend ne dépense jamais de gas.
 */
export function WithdrawPanel({ transactionId, tx, onWithdrawn }: { transactionId: `0x${string}`; tx: OnChainTransaction; onWithdrawn: () => void }) {
  const meridianAddress = useMeridianAddress();
  const { tokenAddresses } = useTokenAddresses();
  const { decimals, symbol } = useErc20Meta(tokenAddresses[tx.currency]);
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();
  const { data: attestation, isLoading: isCheckingPosition, refetch: refetchAttestation } = useContainerPositionAttestation(transactionId);

  useEffect(() => {
    if (isSuccess) onWithdrawn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const nothingToWithdraw = tx.pendingWithdrawalAmount === 0n;
  const livePosition = attestation?.available ? attestation.status : undefined;
  const containerConditionMet = isContainerPositionSufficientForWithdrawal(tx, livePosition);

  async function handleWithdraw() {
    if (!meridianAddress) return;
    // On revérifie juste avant d'envoyer plutôt que de réutiliser
    // l'attestation affichée à l'écran, qui peut dater de plusieurs minutes
    // (deadline de 10 min côté API) et n'être plus valable au moment du clic.
    const fresh = await refetchAttestation();
    if (fresh?.available) {
      await execute({
        address: meridianAddress,
        abi: meridianAbi,
        functionName: "withdrawFundsWithPositionUpdate",
        args: [transactionId, fresh.status, BigInt(fresh.deadline), fresh.signature],
      });
    } else {
      // Attestation indisponible (VesselFinder injoignable, pas de donnée
      // exploitable...) : on retente quand même avec la valeur déjà en
      // storage, au cas où elle suffirait déjà.
      await execute({
        address: meridianAddress,
        abi: meridianAbi,
        functionName: "withdrawFunds",
        args: [transactionId],
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retirer les fonds</CardTitle>
      </CardHeader>

      <p className="mb-4 text-sm text-muted">
        Montant en attente:{" "}
        <span className="text-foam">
          {formatAmount(tx.pendingWithdrawalAmount, decimals)} {symbol}
        </span>
      </p>

      {nothingToWithdraw ? (
        <p className="text-sm text-subtle">Aucun fonds en attente pour l&apos;instant.</p>
      ) : isCheckingPosition ? (
        <p className="text-sm text-subtle">Vérification de la position du conteneur…</p>
      ) : !containerConditionMet ? (
        <p className="text-sm text-subtle">
          Retrait bloqué : ce contrat exige{" "}
          {tx.transactionCondition === TransactionCondition.AtTheBeginningOfDelivery
            ? "que le conteneur soit parti"
            : "que le conteneur soit arrivé à destination"}{" "}
          avant de pouvoir retirer les fonds.
          {tx.advancePaymentMode === AdvancePaymentMode.Immediate && tx.partialWithdrawalCompleted && (
            <> L&apos;acompte immédiat a déjà été retiré : le reliquat suit désormais les mêmes règles qu&apos;un paiement différé.</>
          )}
        </p>
      ) : (
        <>
          <TxStatusLine stage={stage} error={error} />
          <Button className="mt-3" loading={isBusy} onClick={handleWithdraw}>
            Retirer {formatAmount(tx.pendingWithdrawalAmount, decimals)} {symbol}
          </Button>
        </>
      )}
    </Card>
  );
}
