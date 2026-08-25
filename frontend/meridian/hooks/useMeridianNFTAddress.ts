"use client";

import { useReadContract } from "wagmi";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

/**
 * Lit `meridianNFTAddress` directement sur la chaîne plutôt que de se fier à
 * `NEXT_PUBLIC_MERIDIAN_NFT_ADDRESS` (valeur figée au build) : owner peut
 * rappeler `setMeridianNFTAddress` à tout moment depuis OraclesPanel, et les
 * deux valeurs divergent alors silencieusement — c'est ce qui faisait
 * échouer la lecture du reçu NFT (tokenURI interrogé sur l'ancien contrat,
 * qui ne connaît pas le tokenId fraîchement minté). Même source de vérité
 * que `useAdminState` pour ce champ, mais utilisable hors du dashboard admin.
 */
export function useMeridianNFTAddress() {
  const meridianAddress = useMeridianAddress();
  return useReadContract({
    address: meridianAddress,
    abi: meridianAbi,
    functionName: "meridianNFTAddress",
    query: { enabled: !!meridianAddress },
  });
}
