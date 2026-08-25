"use client";

import { useEffect, useState } from "react";
import { AnchorIcon } from "@/components/icons";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { ContainerPositionStatus, containerPositionStatusLabels } from "@/lib/domain/enums";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

/**
 * Permet de reporter manuellement la position d'un conteneur
 * (`reportContainerPosition`). Réservé au wallet configuré comme
 * `containerPositionOracleAddress` (voir `useIsContainerPositionOracle`) :
 * c'est un appel normal à une fonction déjà restreinte on-chain, pas un
 * raccourci qui contourne une protection — donc utilisable aussi bien en
 * local qu'en conditions réelles (Sepolia...).
 */
export function ContainerPositionOraclePanel({
  transactionId,
  tx,
  onReported,
}: {
  transactionId: `0x${string}`;
  tx: OnChainTransaction;
  onReported: () => void;
}) {
  const meridianAddress = useMeridianAddress();
  const [status, setStatus] = useState<ContainerPositionStatus>(tx.containerPositionStatus);
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  useEffect(() => {
    if (isSuccess) onReported();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Position du conteneur (oracle)</CardTitle>
        <AnchorIcon className="h-6 w-6 text-subtle" />
      </CardHeader>
      <p className="mb-4 text-sm text-muted">
        Vous êtes connecté avec le wallet configuré comme oracle de position de conteneur. En production, cette valeur
        est poussée par le cron qui interroge VesselFinder — ici vous pouvez la reporter manuellement pour vos tests.
      </p>
      <div className="flex items-end gap-3">
        <Field label="Nouvelle position">
          <select
            className="field-select"
            value={status}
            onChange={(e) => setStatus(Number(e.target.value) as ContainerPositionStatus)}
          >
            {Object.values(ContainerPositionStatus)
              .filter((v) => typeof v === "number")
              .map((v) => (
                <option key={v} value={v}>
                  {containerPositionStatusLabels[v as ContainerPositionStatus]}
                </option>
              ))}
          </select>
        </Field>
        <Button
          variant="secondary"
          loading={isBusy}
          disabled={!meridianAddress}
          onClick={() =>
            meridianAddress &&
            execute({
              address: meridianAddress,
              abi: meridianAbi,
              functionName: "reportContainerPosition",
              args: [transactionId, status],
            })
          }
        >
          Appliquer
        </Button>
      </div>
      <div className="mt-3">
        <TxStatusLine stage={stage} error={error} />
      </div>
    </Card>
  );
}
