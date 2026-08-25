"use client";

import { useEffect, useState } from "react";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { useContractAction } from "@/hooks/useContractAction";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

/**
 * Formulaire générique pour les fonctions `onlyOwner` qui remplacent un
 * taux en points de base (ex. `setFeesRateBps`). Saisi et affiché en
 * pourcentage (ex. "2.5" pour 250 bps) pour rester lisible ; le taux
 * lui-même est un `uint16` brut côté contrat (0-10000 = 0-100%).
 */
export function RateSetterRow({
  label,
  hint,
  currentValueBps,
  functionName,
  onUpdated,
}: {
  label: string;
  hint?: string;
  currentValueBps: number | undefined;
  functionName: string;
  onUpdated: () => void;
}) {
  const meridianAddress = useMeridianAddress();
  const [value, setValue] = useState("");
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  const trimmed = value.trim();
  const parsedPercent = trimmed !== "" ? Number(trimmed.replace(",", ".")) : NaN;
  const parsedBps = Number.isFinite(parsedPercent) ? Math.round(parsedPercent * 100) : NaN;
  const valid = trimmed !== "" && Number.isFinite(parsedBps) && parsedBps >= 0 && parsedBps <= 10000 && !!meridianAddress;

  useEffect(() => {
    // Même raison que sur AmountSetterRow : on ne vide le champ qu'une fois
    // la transaction confirmée, pas juste envoyée.
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
        <span className="text-sm text-foam">{currentValueBps !== undefined ? `${currentValueBps / 100} %` : "—"}</span>
      </div>
      {hint && <p className="text-xs text-subtle">{hint}</p>}
      <div className="flex gap-2">
        <input
          className="field-input"
          inputMode="decimal"
          placeholder="Taux en % (ex. 2.5)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!valid}
          loading={isBusy}
          onClick={() => meridianAddress && execute({ address: meridianAddress, abi: meridianAbi, functionName, args: [parsedBps] })}
        >
          Mettre à jour
        </Button>
      </div>
      <TxStatusLine stage={stage} error={error} />
    </div>
  );
}
