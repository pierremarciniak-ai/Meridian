"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { LifebuoyIcon } from "@/components/icons";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { useContractAction } from "@/hooks/useContractAction";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";

const TRANSACTION_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

// Contrairement à un simple "suivre un dossier" (retiré volontairement pour
// ne pas permettre de consulter n'importe quelle transaction depuis le
// tableau de bord), ce formulaire n'ouvre le dossier qu'après acceptation
// effective en tant que fournisseur.
export function AcceptShipmentForm() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const [transactionId, setTransactionId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  useEffect(() => {
    const trimmed = transactionId.trim();
    if (isSuccess && TRANSACTION_ID_PATTERN.test(trimmed)) {
      router.push(`/transaction/${trimmed}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = transactionId.trim();
    if (!TRANSACTION_ID_PATTERN.test(trimmed)) {
      setIdError("Identifiant invalide : attendu un hash de 32 octets (0x + 64 caractères hexadécimaux).");
      return;
    }
    setIdError(null);
    await execute({
      address: meridianAddress,
      abi: meridianAbi,
      functionName: "createTransaction",
      args: [trimmed, billNumber],
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Espace fournisseur</CardTitle>
        <LifebuoyIcon className="h-6 w-6 text-subtle" />
      </CardHeader>
      <p className="mb-4 text-sm text-muted">
        Renseignez les deux références transmises par l&apos;acheteur pour endosser le rôle de fournisseur sur son dossier.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Identifiant du dossier (transaction ID)" error={idError ?? undefined}>
          <input
            className="field-input font-mono-tight"
            placeholder="0x…"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            required
          />
        </Field>
        <Field label="Numéro de facture (bill number)">
          <input
            className="field-input font-mono-tight"
            placeholder="BL-2026-00042"
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            required
          />
        </Field>
        <TxStatusLine stage={stage} error={error} />
        <Button type="submit" disabled={!isConnected} loading={isBusy}>
          {isConnected ? "Accepter le dossier" : "Connectez votre portefeuille"}
        </Button>
      </form>
    </Card>
  );
}
