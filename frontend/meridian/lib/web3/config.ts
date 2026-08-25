import { cookieStorage, createStorage, type Config } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { supportedChains } from "@/lib/web3/chain";

export const reownProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

/**
 * AppKit exige un projectId non vide à la construction ; en dev sans clé
 * Reown, on retombe sur un placeholder inoffensif. Le connecteur "injected"
 * (MetaMask, etc.) fonctionne dans tous les cas — seule l'option
 * WalletConnect/QR du modal reste inopérante tant qu'une vraie clé
 * (https://cloud.reown.com) n'est pas renseignée dans NEXT_PUBLIC_REOWN_PROJECT_ID.
 */
const projectId = reownProjectId || "000000000000000000000000000000";

export const networks = supportedChains;

export const wagmiAdapter = new WagmiAdapter({
  networks: [...networks],
  projectId,
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig as Config;
