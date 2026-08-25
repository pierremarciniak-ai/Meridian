"use client";

import { useEffect } from "react";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { useContractAction } from "@/hooks/useContractAction";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

/** Interrupteur générique pour les fonctions `onlyOwner` qui basculent un booléen (ex. `toggleMockSanctionsOracle`). */
export function ToggleRow({
  label,
  hint,
  value,
  functionName,
  onUpdated,
}: {
  label: string;
  hint?: string;
  value: boolean | undefined;
  functionName: string;
  onUpdated: () => void;
}) {
  const meridianAddress = useMeridianAddress();
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  useEffect(() => {
    if (isSuccess) onUpdated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="label-caps">{label}</span>
          {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
        </div>
        <Button
          variant={value ? "brass" : "secondary"}
          loading={isBusy}
          disabled={value === undefined || !meridianAddress}
          onClick={() => meridianAddress && execute({ address: meridianAddress, abi: meridianAbi, functionName, args: [!value] })}
        >
          {value ? "Activé" : "Désactivé"}
        </Button>
      </div>
      <TxStatusLine stage={stage} error={error} />
    </div>
  );
}
