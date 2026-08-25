"use client";

import { useEffect, useState } from "react";
import { CopyChip } from "@/components/CopyChip";
import { AlertIcon } from "@/components/icons";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { useContractAction } from "@/hooks/useContractAction";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const RENOUNCE_CONFIRM_WORD = "RENONCER";

/**
 * Transfert et renoncement de propriété du contrat Meridian. Le transfert
 * demande une confirmation navigateur ; le renoncement (irréversible, rend
 * toutes les fonctions `onlyOwner` définitivement inappelables) exige en
 * plus de taper un mot de confirmation exact pour activer le bouton.
 */
export function OwnerPanel({ owner, onUpdated }: { owner: `0x${string}` | undefined; onUpdated: () => void }) {
  const meridianAddress = useMeridianAddress();
  const [newOwner, setNewOwner] = useState("");
  const transferAction = useContractAction();
  const validNewOwner = ADDRESS_PATTERN.test(newOwner.trim());

  const [renounceConfirm, setRenounceConfirm] = useState("");
  const renounceAction = useContractAction();

  useEffect(() => {
    // Même raison que AddressSetterRow : isSuccess reflète la confirmation
    // asynchrone de la transaction (receipt), pas une valeur dérivable au
    // rendu.
    if (transferAction.isSuccess) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNewOwner("");
      onUpdated();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferAction.isSuccess]);

  useEffect(() => {
    if (renounceAction.isSuccess) onUpdated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renounceAction.isSuccess]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Propriété du contrat</CardTitle>
      </CardHeader>

      <div className="flex items-center justify-between gap-4 py-2.5">
        <span className="label-caps">Owner actuel</span>
        {owner ? <CopyChip value={owner} /> : <span className="text-xs text-subtle">Chargement…</span>}
      </div>

      <div className="rope-divider my-4" />

      <Field label="Transférer la propriété" hint="L'adresse actuelle perd immédiatement tout accès aux fonctions onlyOwner.">
        <div className="flex gap-2">
          <input
            className="field-input font-mono-tight"
            placeholder="0x…"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!validNewOwner || !meridianAddress}
            loading={transferAction.isBusy}
            onClick={() => {
              if (!meridianAddress) return;
              if (!window.confirm(`Transférer la propriété du contrat à ${newOwner.trim()} ? Cette action est irréversible depuis ce compte.`)) return;
              transferAction.execute({ address: meridianAddress, abi: meridianAbi, functionName: "setNewOwner", args: [newOwner.trim()] });
            }}
          >
            Transférer
          </Button>
        </div>
      </Field>
      <TxStatusLine stage={transferAction.stage} error={transferAction.error} />

      <div className="rope-divider my-4" />

      <div className="rounded-lg p-4" style={{ border: "1px solid var(--color-coral-500)" }}>
        <p className="mb-3 flex items-center gap-2 text-sm text-danger">
          <AlertIcon className="h-4 w-4 shrink-0" />
          Renoncer à la propriété rend TOUTES les fonctions onlyOwner définitivement inappelables (aucun owner ne pourra
          plus jamais être défini).
        </p>
        <Field label={`Tapez "${RENOUNCE_CONFIRM_WORD}" pour activer le bouton`}>
          <input
            className="field-input font-mono-tight"
            value={renounceConfirm}
            onChange={(e) => setRenounceConfirm(e.target.value)}
          />
        </Field>
        <Button
          variant="danger"
          className="mt-3"
          disabled={renounceConfirm !== RENOUNCE_CONFIRM_WORD}
          loading={renounceAction.isBusy}
          onClick={() => meridianAddress && renounceAction.execute({ address: meridianAddress, abi: meridianAbi, functionName: "renounceOwnership" })}
        >
          Renoncer définitivement à la propriété
        </Button>
        <div className="mt-2">
          <TxStatusLine stage={renounceAction.stage} error={renounceAction.error} />
        </div>
      </div>
    </Card>
  );
}
