import type { Address } from "viem";
import { useChainId } from "wagmi";
import { hardhatLocal, sepolia } from "@/lib/web3/chain";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/**
 * Valide une adresse issue d'une variable d'environnement, en tolérant son
 * absence. Contrairement à une adresse obligatoire (qui ferait planter toute
 * l'app), un réseau sans adresse configurée se comporte simplement comme
 * "pas encore déployé" — seule une valeur présente mais mal formée (faute de
 * frappe) est signalée en console, car c'est probablement une vraie erreur
 * de configuration.
 */
function parseOptionalAddress(value: string | undefined, name: string): Address | undefined {
  if (!value) return undefined;
  if (!ADDRESS_PATTERN.test(value)) {
    console.error(`Variable d'environnement ${name} invalide, ignorée : "${value}"`);
    return undefined;
  }
  return value as Address;
}

/**
 * Adresse de Meridian par réseau supporté (voir lib/web3/chain.ts).
 * Contrairement à MeridianNFT/aux adresses de tokens (modifiables on-chain,
 * lues en direct), l'adresse de Meridian ne change jamais après déploiement
 * — mais diffère d'un réseau à l'autre. Pour ajouter un réseau : une entrée
 * ici + sa variable NEXT_PUBLIC_MERIDIAN_ADDRESS_* suffisent.
 */
const MERIDIAN_ADDRESSES: Partial<Record<number, Address>> = {
  [hardhatLocal.id]: parseOptionalAddress(process.env.NEXT_PUBLIC_MERIDIAN_ADDRESS_HARDHAT, "NEXT_PUBLIC_MERIDIAN_ADDRESS_HARDHAT"),
  [sepolia.id]: parseOptionalAddress(process.env.NEXT_PUBLIC_MERIDIAN_ADDRESS_SEPOLIA, "NEXT_PUBLIC_MERIDIAN_ADDRESS_SEPOLIA"),
};

/** Version non réactive de `useMeridianAddress`, utilisable hors composant React (ex. une route API). */
export function getMeridianAddress(chainId: number): Address | undefined {
  return MERIDIAN_ADDRESSES[chainId];
}

/**
 * Bloc de déploiement de Meridian par réseau, utilisé comme `fromBlock` pour
 * tout scan d'events (voir lib/web3/eventLogs.ts). Sur un réseau public déjà
 * avancé (Sepolia...), partir de 0 fait remonter un `eth_getLogs` sur des
 * millions de blocs, ce que la plupart des fournisseurs RPC refusent. 0
 * reste correct pour Hardhat local (toujours redéployé from scratch).
 */
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

/**
 * Version réactive pour composants/hooks client : suit le réseau sélectionné
 * dans le wallet. `undefined` tant que ce réseau n'est pas supporté (voir
 * `supportedChains` dans lib/web3/chain.ts) — à traiter comme "en attente du
 * bon réseau", Header.tsx avertissant déjà l'utilisateur dans ce cas.
 */
export function useMeridianAddress(): Address | undefined {
  const chainId = useChainId();
  return getMeridianAddress(chainId);
}
