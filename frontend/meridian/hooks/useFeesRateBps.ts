"use client";

import { useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

// feesRateBps est un taux global en points de base (250 = 2,50 %), appliqué
// à totalAmount au moment de la double signature (voir checkSignatures /
// transfertFeesFromBuyer dans InternalFunctions.sol) — pas un montant fixe.
// Avant cette signature, le montant réel des frais n'existe pas encore
// on-chain (tx.feesAmount vaut 0) : c'est ce taux, combiné à totalAmount côté
// appelant (voir estimateFees dans lib/domain/transaction.ts), qui permet
// d'afficher une estimation en temps réel pendant la saisie.
export function useFeesRateBps() {
  const meridianAddress = useMeridianAddress();
  const { data, isLoading } = useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "feesRateBps",
    query: { enabled: !!meridianAddress },
  });

  return { feesRateBps: (data as number | undefined) ?? 0, isLoading };
}
