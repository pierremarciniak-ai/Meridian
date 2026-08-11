"use client";

import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { useContractAction } from "@/hooks/useContractAction";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

// isExempt court-circuite checkSanction (InternalFunctions.sol) : une adresse
// exemptée n'est jamais interrogée auprès de l'oracle de sanctions.
export function ExemptListPanel() {
  const meridianAddress = useMeridianAddress();
  const [address, setAddress] = useState("");
  const trimmed = address.trim();
  const valid = ADDRESS_PATTERN.test(trimmed);
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  const { data: isExempt, refetch } = useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "isExempt",
    args: valid ? [trimmed as `0x${string}`] : undefined,
    query: { enabled: valid && !!meridianAddress },
  });

  useEffect(() => {
    if (isSuccess) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adresses exemptées de vérification OFAC</CardTitle>
      </CardHeader>
      <Field label="Adresse" hint="Bypass checkSanction pour cette adresse, indépendamment du statut de l'oracle.">
        <input className="field-input font-mono-tight" placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>

      {valid && (
        <p className="mt-2 text-sm text-subtle">
          Statut actuel : <span className={isExempt ? "text-accent" : "text-foam"}>{isExempt ? "exemptée" : "non exemptée"}</span>
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          disabled={!valid || !meridianAddress}
          loading={isBusy}
          onClick={() => meridianAddress && execute({ address: meridianAddress, abi: meridianAbi, functionName: "addExemptAddress", args: [trimmed] })}
        >
          Exempter
        </Button>
        <Button
          variant="danger"
          disabled={!valid || !meridianAddress}
          loading={isBusy}
          onClick={() => meridianAddress && execute({ address: meridianAddress, abi: meridianAbi, functionName: "removeExemptAddress", args: [trimmed] })}
        >
          Retirer l&apos;exemption
        </Button>
      </div>
      <div className="mt-2">
        <TxStatusLine stage={stage} error={error} />
      </div>
    </Card>
  );
}
