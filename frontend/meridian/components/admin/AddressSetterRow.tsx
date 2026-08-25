"use client";

import { useEffect, useState } from "react";
import { CopyChip } from "@/components/CopyChip";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { ZERO_ADDRESS } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/**
 * Formulaire générique pour les fonctions `onlyOwner` qui remplacent une
 * adresse stockée (oracle sanctions, oracle position conteneur, contrat
 * NFT, token par devise...) — un seul composant paramétrable évite de
 * dupliquer sept fois le même formulaire à un champ.
 */
export function AddressSetterRow({
  label,
  hint,
  currentValue,
  functionName,
  extraArgs = [],
  onUpdated,
}: {
  label: string;
  hint?: string;
  currentValue: `0x${string}` | undefined;
  functionName: string;
  extraArgs?: readonly unknown[];
  onUpdated: () => void;
}) {
  const meridianAddress = useMeridianAddress();
  const [value, setValue] = useState("");
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();
  const trimmed = value.trim();
  const valid = ADDRESS_PATTERN.test(trimmed) && !!meridianAddress;
  const isUnset = !currentValue || currentValue.toLowerCase() === ZERO_ADDRESS;

  useEffect(() => {
    // Réagit à la confirmation de la transaction (isSuccess vient du receipt
    // via useContractAction) : un événement externe asynchrone, pas une
    // valeur dérivable au rendu — vider le champ plus tôt (ex. juste après
    // l'appel execute) le viderait même si la transaction finit par revert.
    if (isSuccess) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue("");
      onUpdated();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="label-caps">{label}</span>
        {isUnset ? <span className="text-xs text-subtle">Non configuré</span> : <CopyChip value={currentValue!} />}
      </div>
      {hint && <p className="text-xs text-subtle">{hint}</p>}
      <div className="flex gap-2">
        <input
          className="field-input font-mono-tight"
          placeholder="0x…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!valid}
          loading={isBusy}
          onClick={() =>
            meridianAddress &&
            execute({
              address: meridianAddress,
              abi: meridianAbi,
              functionName,
              args: [...extraArgs, trimmed],
            })
          }
        >
          Mettre à jour
        </Button>
      </div>
      <TxStatusLine stage={stage} error={error} />
    </div>
  );
}
