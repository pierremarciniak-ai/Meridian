"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { CompassIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";

const TRANSACTION_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/**
 * Navigation pure vers un contrat par référence (aucun appel de contrat) :
 * "Mes contrats" ne liste que les contrats où le wallet connecté est
 * acheteur ou vendeur, donc quiconque a juste besoin d'ouvrir un contrat
 * existant sans être ni l'un ni l'autre (typiquement le wallet configuré
 * comme oracle de position de conteneur) n'a autrement aucun moyen d'y
 * accéder depuis l'accueil.
 */
export function OpenShipmentPanel() {
  const router = useRouter();
  const [transactionId, setTransactionId] = useState("");
  const [idError, setIdError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = transactionId.trim();
    if (!TRANSACTION_ID_PATTERN.test(trimmed)) {
      setIdError("Référence du contrat invalide : attendu un hash de 32 octets (0x + 64 caractères hexadécimaux).");
      return;
    }
    setIdError(null);
    router.push(`/transaction/${trimmed}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ouvrir un contrat</CardTitle>
        <CompassIcon className="h-6 w-6 text-subtle" />
      </CardHeader>
      <p className="mb-4 text-sm text-muted">
        Accédez directement à un contrat dont vous connaissez la référence — utile par exemple pour le
        wallet configuré comme oracle de position de conteneur, qui n&apos;apparaît jamais dans « Mes contrats ».
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Référence du contrat (transaction ID)" error={idError ?? undefined}>
            <input
              className="field-input font-mono-tight"
              placeholder="0x…"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" variant="secondary">
          Ouvrir
        </Button>
      </form>
    </Card>
  );
}
