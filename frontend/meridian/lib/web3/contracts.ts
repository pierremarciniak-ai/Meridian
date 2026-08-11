import type { Address } from "viem";
import { useChainId } from "wagmi";
import { hardhatLocal, sepolia } from "@/lib/web3/chain";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

// Contrairement à l'ancienne constante unique (qui devait obligatoirement
// être valide au chargement, faute de quoi toute l'app plantait), une
// adresse manquante ici est tolérée : ce réseau se comporte alors comme
// "pas encore déployé/configuré" (useMeridianAddress renvoie undefined pour
// lui) sans empêcher les AUTRES réseaux de fonctionner. Seule une valeur
// présente mais mal formée (faute de frappe) est signalée, car c'est
// probablement une vraie erreur de configuration.
function parseOptionalAddress(value: string | undefined, name: string): Address | undefined {
  if (!value) return undefined;
  if (!ADDRESS_PATTERN.test(value)) {
    console.error(`Variable d'environnement ${name} invalide, ignorée : "${value}"`);
    return undefined;
  }
  return value as Address;
}

// Un déploiement distinct de Meridian par réseau supporté (voir
// lib/web3/chain.ts) : contrairement à MeridianNFT/aux adresses de tokens
// (modifiables on-chain, lues en direct via useMeridianNFTAddress /
// useTokenAddresses), l'adresse de Meridian lui-même ne change jamais après
// déploiement — mais elle est différente sur chaque réseau, donc une seule
// constante ne suffit plus dès qu'on supporte plusieurs réseaux à la fois.
// Prochainement : ajouter une entrée avalancheFuji.id ici + son
// NEXT_PUBLIC_MERIDIAN_ADDRESS_AVALANCHE_FUJI suffira à l'activer partout.
const MERIDIAN_ADDRESSES: Partial<Record<number, Address>> = {
  [hardhatLocal.id]: parseOptionalAddress(process.env.NEXT_PUBLIC_MERIDIAN_ADDRESS_HARDHAT, "NEXT_PUBLIC_MERIDIAN_ADDRESS_HARDHAT"),
  [sepolia.id]: parseOptionalAddress(process.env.NEXT_PUBLIC_MERIDIAN_ADDRESS_SEPOLIA, "NEXT_PUBLIC_MERIDIAN_ADDRESS_SEPOLIA"),
};

// Version non réactive (utilisable hors composant React, ex. la route API
// app/api/container-position/sign) : le chainId doit alors être fourni
// explicitement par l'appelant (le serveur n'a pas de wallet connecté).
export function getMeridianAddress(chainId: number): Address | undefined {
  return MERIDIAN_ADDRESSES[chainId];
}

// Bloc de déploiement de Meridian par réseau : sert de fromBlock pour tout
// scan d'events (voir lib/web3/eventLogs.ts) — sur un réseau public déjà
// avancé (Sepolia...), partir de 0 fait remonter un eth_getLogs sur des
// millions de blocs inutiles, ce que la plupart des fournisseurs RPC
// refusent (c'est ce qui causait "Impossible de joindre le nœud RPC" sur
// Sepolia, alors que le vrai problème était une plage de blocs trop large,
// pas une panne réseau). 0 reste correct pour Hardhat local (toujours
// redéployé from scratch, jamais des millions de blocs d'historique).
const MERIDIAN_DEPLOY_BLOCKS: Partial<Record<number, bigint>> = {
  [hardhatLocal.id]: 0n,
  [sepolia.id]: (() => {
    const raw = process.env.NEXT_PUBLIC_MERIDIAN_DEPLOY_BLOCK_SEPOLIA;
    return raw ? BigInt(raw) : 0n;
  })(),
};

export function getMeridianDeployBlock(chainId: number): bigint {
  return MERIDIAN_DEPLOY_BLOCKS[chainId] ?? 0n;
}

export function useMeridianDeployBlock(): bigint {
  const chainId = useChainId();
  return getMeridianDeployBlock(chainId);
}

// Version réactive pour les composants/hooks client : suit automatiquement
// le réseau réellement sélectionné dans le wallet (useChainId), undefined
// tant que ce réseau n'est pas l'un de ceux supportés (voir supportedChains
// dans lib/web3/chain.ts) — Header.tsx avertit déjà l'utilisateur dans ce
// cas, donc les appelants peuvent traiter "undefined" comme "en attente du
// bon réseau" sans message d'erreur supplémentaire.
export function useMeridianAddress(): Address | undefined {
  const chainId = useChainId();
  return getMeridianAddress(chainId);
}
