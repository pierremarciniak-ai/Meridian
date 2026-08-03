import { defineChain } from "@reown/appkit/networks";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);

// Le node Hardhat local n'est pas un réseau connu de Reown/viem : on le
// déclare nous-mêmes au format CaipNetwork attendu par AppKit.
export const hardhatLocal = defineChain({
  id: chainId,
  caipNetworkId: `eip155:${chainId}`,
  chainNamespace: "eip155",
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  testnet: true,
});
