"use client";

import { useCallback, useEffect, useState } from "react";
import type { Abi } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

type WriteArgs = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

type Stage = "idle" | "signing" | "confirming" | "success" | "error";

function extractErrorMessage(err: unknown): string {
  const anyErr = err as { shortMessage?: string; message?: string } | undefined;
  const raw = anyErr?.shortMessage ?? anyErr?.message ?? "Une erreur inconnue est survenue.";
  return raw.split("\n")[0];
}

// Enrobe useWriteContract + useWaitForTransactionReceipt : une seule fonction
// `execute` à appeler depuis un bouton, un état de cycle de vie unique
// (signing -> confirming -> success/error) et un message d'erreur lisible
// extrait du revert on-chain.
export function useContractAction() {
  const { writeContractAsync, reset: resetWrite } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}`>();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const receipt = useWaitForTransactionReceipt({ hash, query: { enabled: !!hash } });

  // Ne rethrow jamais : aucun appelant n'awaite/catch cette promesse (les
  // boutons l'appellent en "fire and forget" depuis onClick), donc un rejet
  // ici deviendrait une unhandled promise rejection que l'overlay Next.js
  // affiche comme un crash. L'échec est déjà entièrement reflété par `stage`
  // et `error`.
  const execute = useCallback(
    async (params: WriteArgs) => {
      setError(null);
      setStage("signing");
      try {
        const h = await writeContractAsync(params as Parameters<typeof writeContractAsync>[0]);
        setHash(h);
        setStage("confirming");
        return h;
      } catch (err) {
        setStage("error");
        setError(extractErrorMessage(err));
        return undefined;
      }
    },
    [writeContractAsync]
  );

  useEffect(() => {
    if (receipt.isSuccess) setStage("success");
    else if (receipt.isError) {
      setStage("error");
      setError(extractErrorMessage(receipt.error));
    }
  }, [receipt.isSuccess, receipt.isError, receipt.error]);

  const reset = useCallback(() => {
    setHash(undefined);
    setStage("idle");
    setError(null);
    resetWrite();
  }, [resetWrite]);

  return {
    execute,
    hash,
    receipt: receipt.data,
    stage,
    error,
    isBusy: stage === "signing" || stage === "confirming",
    isSuccess: stage === "success",
    reset,
  };
}
