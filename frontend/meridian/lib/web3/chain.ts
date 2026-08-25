import { defineChain, sepolia as sepoliaOfficial } from "@reown/appkit/networks";
import { useChainId } from "wagmi";

/**
 * Réseaux supportés, chacun avec son id fixe et sa propre variable d'env
 * pour l'URL RPC. Le choix du réseau actif se fait dans le wallet
 * (sélecteur MetaMask/AppKit), pas via une variable d'env globale + un
 * redémarrage — voir lib/web3/contracts.ts pour l'adresse Meridian, câblée
 * de la même façon par réseau.
 */

const hardhatRpcUrl = process.env.NEXT_PUBLIC_RPC_URL_HARDHAT ?? "http://127.0.0.1:8545";

/** Le node Hardhat local n'est pas un réseau connu de Reown/viem : on le déclare nous-mêmes au format CaipNetwork attendu par AppKit. */
export const hardhatLocal = defineChain({
  id: 31337,
  caipNetworkId: "eip155:31337",
  chainNamespace: "eip155",
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [hardhatRpcUrl] },
  },
  testnet: true,
});

const sepoliaRpcUrl = process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA;

/**
 * Sepolia est un réseau standard déjà connu de Reown/viem (nom, explorateur
 * Etherscan, devise... corrects par défaut), mais l'objet exporté par
 * `@reown/appkit/networks` est en réalité la chaîne viem brute
 * (`export * from 'viem/chains'`), qui ne porte pas `caipNetworkId`/
 * `chainNamespace` — le helper `defineChain` ne les déduit pas
 * automatiquement. Sans ces deux champs, AppKit ne reconnaît pas
 * correctement le réseau et bloque la connexion d'un wallet dessus.
 */
export const sepolia = defineChain({
  ...sepoliaOfficial,
  caipNetworkId: `eip155:${sepoliaOfficial.id}`,
  chainNamespace: "eip155",
  rpcUrls: sepoliaRpcUrl
    ? { ...sepoliaOfficial.rpcUrls, default: { http: [sepoliaRpcUrl] } }
    : sepoliaOfficial.rpcUrls,
});

/**
 * Registre des réseaux supportés par l'app, utilisé par AppKit (sélecteur de
 * réseau du wallet) et par Header.tsx (avertissement "réseau non
 * supporté"). Ajouter un réseau ici + son adresse Meridian dans
 * lib/web3/contracts.ts suffit à l'activer partout.
 */
export const supportedChains = [hardhatLocal, sepolia] as const;

/**
 * Symbole de la devise native du réseau connecté, pour le rappel "prévoir de
 * quoi payer le gas" sur la page d'accueil. Retombe sur "ETH" si le réseau
 * connecté n'est pas dans `supportedChains` (mauvais réseau, ou wallet non
 * connecté).
 */
export function useNativeCurrencySymbol(): string {
  const chainId = useChainId();
  const chain = supportedChains.find((c) => c.id === chainId);
  return chain?.nativeCurrency.symbol ?? "ETH";
}
