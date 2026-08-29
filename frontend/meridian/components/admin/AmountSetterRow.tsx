"use client";

import { useEffect, useState } from "react";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { formatAmount, parseAmountInput } from "@/lib/domain/format";
import { useContractAction } from "@/hooks/useContractAction";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

/**
 * Formulaire générique pour les fonctions `onlyOwner` qui remplacent un
 * montant brut en unité de token (ex. `setMinimumFeesAmount`). Saisi et
 * affiché en unité lisible (ex. "30" pour 30_000_000 à 6 décimales) ; la
 * valeur transmise au contrat reste le `uint128` brut.
 */
export function AmountSetterRow({
  label,
  hint,
  currentValue,
  decimals,
  symbol,
  functionName,
  onUpdated,
}: {
  label: string;
  hint?: string;
  currentValue: bigint | undefined;
  decimals: number;
  symbol?: string;
  functionName: string;
  onUpdated: () => void;
}) {
  const meridianAddress = useMeridianAddress();
  const [value, setValue] = useState("");
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  const trimmed = value.trim();
  const parsedAmount = parseAmountInput(trimmed, decimals);
  const valid = trimmed !== "" && parsedAmount > 0n && !!meridianAddress;

  useEffect(() => {
    // Même raison que sur RateSetterRow/AddressSetterRow : on ne vide le
    // champ qu'une fois la transaction confirmée, pas juste envoyée.
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
        <span className="text-sm text-foam">
          {currentValue !== undefined ? `${formatAmount(currentValue, decimals)}${symbol ? ` ${symbol}` : ""}` : "—"}
        </span>
      </div>
      {hint && <p className="text-xs text-subtle">{hint}</p>}
      <div className="flex gap-2">
        <input
          className="field-input"
          inputMode="decimal"
          placeholder="Montant"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!valid}
          loading={isBusy}
          onClick={() =>
            meridianAddress && execute({ address: meridianAddress, abi: meridianAbi, functionName, args: [parsedAmount] })
          }
        >
          Mettre à jour
        </Button>
      </div>
      <TxStatusLine stage={stage} error={error} />
    </div>
  );
}
