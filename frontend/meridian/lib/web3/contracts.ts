import type { Address } from "viem";

function requireAddress(value: string | undefined, name: string): Address {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Variable d'environnement ${name} manquante ou invalide`);
  }
  return value as Address;
}

export const meridianAddress = requireAddress(process.env.NEXT_PUBLIC_MERIDIAN_ADDRESS, "NEXT_PUBLIC_MERIDIAN_ADDRESS");
// Pas de constante d'env pour l'adresse de MeridianNFT ni pour les adresses
// de tokens (USDC/USDT/EURC) : contrairement à meridianAddress (fixe), elles
// sont modifiables on-chain (setMeridianNFTAddress, setTokenAddress — voir
// OraclesPanel/TokenAddressesPanel) et divergeraient silencieusement d'une
// valeur figée au build. Utiliser useMeridianNFTAddress / useTokenAddresses
// (lecture on-chain) partout où ces adresses sont nécessaires.
