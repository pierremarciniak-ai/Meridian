"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Abi } from "viem";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

type WriteArgs = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

type Stage = "idle" | "signing" | "confirming" | "success" | "error";

/**
 * Cherche un champ `.data` (chaîne hex, ou `{data: chaîne hex}` imbriqué —
 * la forme que renvoie Hardhat) en remontant la chaîne de `.cause`, et tente
 * de le décoder avec l'ABI de l'appel en cours.
 */
function decodeRevertFromCauseChain(err: unknown, abi: Abi): string | undefined {
  let cause: unknown = err;
  for (let i = 0; cause && typeof cause === "object" && i < 10; i++) {
    const data = (cause as { data?: unknown }).data;
    const hex = typeof data === "string" ? data : (data as { data?: unknown } | undefined)?.data;
    if (typeof hex === "string" && hex.startsWith("0x") && hex.length > 2) {
      try {
        const decoded = decodeErrorResult({ abi, data: hex as `0x${string}` });
        const args = decoded.args?.map(String).join(", ");
        return args ? `${decoded.errorName}(${args})` : decoded.errorName;
      } catch {
        // Ce champ .data n'est pas décodable avec cette ABI (ou n'est pas un
        // revert) : on continue à remonter la chaîne plutôt que d'abandonner.
      }
    }
    cause = (cause as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Extrait un message de revert lisible depuis une erreur viem. viem décode
 * déjà le message d'un `require()` côté contrat, mais le range dans
 * `.shortMessage` sur une deuxième ligne (ex. `'The contract function "x"
 * reverted with the following reason:\nNothing to withdraw'`) : un
 * `.split("\n")[0]` naïf ne garderait donc que la phrase générique. On
 * cherche plutôt l'erreur de revert décodée dans la chaîne de causes
 * (`.walk`) et on lit directement sa raison — ou, pour un custom error (pas
 * de string), son nom + arguments.
 */
function extractErrorMessage(err: unknown, abi?: Abi): string {
  if (err instanceof BaseError) {
    const revertError = err.walk((e) => e instanceof ContractFunctionRevertedError) as
      | ContractFunctionRevertedError
      | undefined;
    if (revertError) {
      if (revertError.reason) return revertError.reason;
      if (revertError.data?.errorName) {
        const args = revertError.data.args?.map(String).join(", ");
        return args ? `${revertError.data.errorName}(${args})` : revertError.data.errorName;
      }
    }

    // Hardhat renvoie un code JSON-RPC -32000 (au lieu du code standard pour
    // un revert d'eth_call) quand l'appel revert avec une erreur custom
    // (pas Error(string)/Panic) : viem classe alors ça comme une erreur RPC
    // générique (InvalidInputRpcError, message figé "Missing or invalid
    // parameters") au lieu de construire un ContractFunctionRevertedError,
    // donc le .walk() ci-dessus ne trouve rien. Les octets du revert restent
    // cependant présents plus bas dans la chaîne de causes (.cause.cause...
    // .data.data) : on les décode nous-mêmes avec l'ABI de l'appel.
    if (abi) {
      const decoded = decodeRevertFromCauseChain(err, abi);
      if (decoded) return decoded;
    }

    return err.shortMessage.split("\n")[0];
  }
  const anyErr = err as { shortMessage?: string; message?: string } | undefined;
  const raw = anyErr?.shortMessage ?? anyErr?.message ?? "Une erreur inconnue est survenue.";
  return raw.split("\n")[0];
}

/**
 * Rejoue en lecture seule, au bloc de la transaction, un appel miné avec
 * `status: "reverted"` (ex. l'échéance a expiré entre la simulation et
 * l'inclusion du bloc, ou un état a changé entre-temps), pour en extraire la
 * vraie raison de revert plutôt que d'afficher un message générique.
 */
async function fetchRevertReason(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  hash: `0x${string}`,
  abi?: Abi
): Promise<string> {
  try {
    const tx = await publicClient.getTransaction({ hash });
    await publicClient.call({
      account: tx.from,
      to: tx.to ?? undefined,
      data: tx.input,
      value: tx.value,
      blockNumber: tx.blockNumber ?? undefined,
    });
    return "La transaction a été minée mais a échoué (revert) sans raison identifiable.";
  } catch (err) {
    return extractErrorMessage(err, abi);
  }
}

/**
 * Enrobe `useWriteContract` + `useWaitForTransactionReceipt` derrière une
 * seule fonction `execute` à appeler depuis un bouton : un état de cycle de
 * vie unique (`signing` -> `confirming` -> `success`/`error`) et un message
 * d'erreur lisible extrait du revert on-chain.
 */
export function useContractAction() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, reset: resetWrite } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}`>();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  // Mémorise l'ABI du dernier appel : nécessaire pour décoder un éventuel
  // revert custom-error rencontré plus tard via le receipt (useEffect
  // ci-dessous), où `params` n'est plus dans le scope de l'appelant.
  const lastAbiRef = useRef<Abi | undefined>(undefined);

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
      lastAbiRef.current = params.abi;
      try {
        let h: `0x${string}`;
        if (publicClient && address) {
          // simulateContract d'abord plutôt que d'envoyer directement : (1)
          // si l'appel doit revert, on obtient ici l'erreur décodée par le
          // RPC (message de require lisible via extractErrorMessage) au lieu
          // d'un rejet générique côté wallet ; (2) le `request` retourné
          // porte un gas correctement estimé par le nœud — certains wallets
          // (MetaMask sur un réseau perso) retombent sinon sur une valeur
          // par défaut qui peut dépasser leur propre plafond interne et
          // faire échouer l'envoi avant même d'atteindre le contrat, avec un
          // message d'erreur RPC générique qui n'a rien à voir avec le vrai
          // problème.
          const { request } = await publicClient.simulateContract({ ...params, account: address } as Parameters<
            typeof publicClient.simulateContract
          >[0]);
          h = await writeContractAsync(request as Parameters<typeof writeContractAsync>[0]);
        } else {
          h = await writeContractAsync(params as Parameters<typeof writeContractAsync>[0]);
        }
        setHash(h);
        setStage("confirming");
        return h;
      } catch (err) {
        setStage("error");
        setError(extractErrorMessage(err, params.abi));
        return undefined;
      }
    },
    [writeContractAsync, publicClient, address]
  );

  useEffect(() => {
    // Réagit à useWaitForTransactionReceipt (polling RPC asynchrone) : un
    // système externe, pas une valeur dérivable au rendu — c'est exactement
    // le second cas d'usage légitime d'un effet (s'abonner à un système
    // externe et appeler setState quand il change).
    if (receipt.isSuccess) {
      // isSuccess ne veut dire que "on a bien récupéré un receipt", pas "la
      // transaction a réussi" : une transaction minée peut très bien avoir
      // status "reverted" (ex. une condition qui tenait encore au moment de
      // la simulation ne tient plus au moment de l'inclusion du bloc — une
      // échéance qui vient d'expirer pendant que l'utilisateur signait dans
      // son wallet, un état modifié entre-temps par une autre transaction…).
      // Sans cette vérification, ce cas se traduisait par un stage "success"
      // silencieux : aucun event émis à trouver, donc aucune mise à jour de
      // l'UI ni du contrat, sans le moindre message d'erreur.
      if (receipt.data?.status === "reverted") {
        setStage("error");
        if (publicClient && hash) {
          fetchRevertReason(publicClient, hash, lastAbiRef.current).then(setError);
        } else {
          setError("La transaction a été minée mais a échoué (revert).");
        }
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStage("success");
      }
    } else if (receipt.isError) {
      setStage("error");
      setError(extractErrorMessage(receipt.error, lastAbiRef.current));
    }
  }, [receipt.isSuccess, receipt.isError, receipt.error, receipt.data, publicClient, hash]);

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
