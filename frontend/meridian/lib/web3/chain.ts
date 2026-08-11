import { defineChain, sepolia as sepoliaOfficial } from "@reown/appkit/networks";

// Contrairement à l'ancienne version (un seul réseau "actif" piloté par
// NEXT_PUBLIC_CHAIN_ID), l'app supporte désormais plusieurs réseaux
// simultanément — le choix se fait dans le wallet (sélecteur de réseau
// MetaMask/AppKit), pas via .env.local + redémarrage. Chaque réseau a donc
// son propre id fixe et sa propre variable d'env pour l'URL RPC (voir
// lib/web3/contracts.ts pour l'adresse Meridian, câblée de la même façon).

const hardhatRpcUrl = process.env.NEXT_PUBLIC_RPC_URL_HARDHAT ?? "http://127.0.0.1:8545";

// Le node Hardhat local n'est pas un réseau connu de Reown/viem : on le
// déclare nous-mêmes au format CaipNetwork attendu par AppKit.
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

// Sepolia est un réseau standard déjà connu de Reown/viem (nom, explorateur
// Etherscan, devise... corrects par défaut) : inutile de le redéclarer
// entièrement à la main. Mais l'objet exporté par @reown/appkit/networks est
// en réalité la chaîne viem brute (`export * from 'viem/chains'`), qui ne
// porte PAS caipNetworkId/chainNamespace — son propre helper defineChain ne
// les déduit pas automatiquement. Sans ces deux champs, AppKit ne reconnaît
// pas correctement le réseau et bloque la connexion d'un wallet dessus : il
// faut donc les fournir explicitement, comme pour hardhatLocal ci-dessus.
export const sepolia = defineChain({
  ...sepoliaOfficial,
  caipNetworkId: `eip155:${sepoliaOfficial.id}`,
  chainNamespace: "eip155",
  rpcUrls: sepoliaRpcUrl
    ? { ...sepoliaOfficial.rpcUrls, default: { http: [sepoliaRpcUrl] } }
    : sepoliaOfficial.rpcUrls,
});

// Prochainement : avalancheFuji (réseau de test Avalanche, chainId 43113),
// suivant exactement le même schéma que sepolia ci-dessus (déjà connu de
// @reown/appkit/networks sous le nom `avalancheFuji`).

// Registre des réseaux supportés par l'app — utilisé par AppKit (sélecteur
// de réseau du wallet) et par Header.tsx (avertissement "réseau non
// supporté"). Ajouter un réseau ici + son adresse Meridian dans
// lib/web3/contracts.ts suffit à l'activer partout, sans toucher aux
// composants consommateurs (voir useMeridianAddress).
export const supportedChains = [hardhatLocal, sepolia] as const;
