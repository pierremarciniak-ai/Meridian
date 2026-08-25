"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { useContractAction } from "@/hooks/useContractAction";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

/** Formulaire d'acceptation d'un contrat par le fournisseur (`createTransaction`), avec vérification du numéro de bon de commande. */
export function BecomeSellerPanel({ transactionId, expectedBillNumber, onAccepted }: { transactionId: `0x${string}`; expectedBillNumber: string; onAccepted: () => void }) {
  const { isConnected } = useAccount();
  const meridianAddress = useMeridianAddress();
  const [billNumber, setBillNumber] = useState(expectedBillNumber);
  const { execute, stage, error, isSuccess } = useContractAction();

  useEffect(() => {
    if (isSuccess) onAccepted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!meridianAddress) return;
    await execute({
      address: meridianAddress,
      abi: meridianAbi,
      functionName: "createTransaction",
      args: [transactionId, billNumber],
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accepter en tant que fournisseur</CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-muted">
        Confirmez le numéro de bon de commande communiqué par l&apos;acheteur pour endosser le rôle de fournisseur sur ce contrat.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Numéro de bon de commande" hint="Pré-rempli depuis le contrat ; ne le modifiez que si l'acheteur vous a communiqué une référence différente.">
          <input
            className="field-input font-mono-tight"
            placeholder="BL-2026-00042"
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            required
          />
        </Field>
        <TxStatusLine stage={stage} error={error} />
        <Button type="submit" disabled={!isConnected} loading={stage === "signing" || stage === "confirming"}>
          Accepter le contrat
        </Button>
      </form>
    </Card>
  );
}
