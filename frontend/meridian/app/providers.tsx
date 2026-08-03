"use client";

import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { hardhatLocal } from "@/lib/web3/chain";
import { networks, reownProjectId, wagmiAdapter, wagmiConfig } from "@/lib/web3/config";

if (typeof window !== "undefined") {
  if (!reownProjectId) {
    console.warn(
      "[Meridian] NEXT_PUBLIC_REOWN_PROJECT_ID est vide : la connexion par portefeuille injecté (MetaMask…) " +
        "fonctionne, mais WalletConnect/QR restera indisponible tant qu'un Project ID valide " +
        "(https://cloud.reown.com) n'est pas renseigné dans .env.local."
    );
  }

  createAppKit({
    adapters: [wagmiAdapter],
    projectId: reownProjectId || "000000000000000000000000000000",
    networks: [...networks],
    defaultNetwork: hardhatLocal,
    metadata: {
      name: "Meridian",
      description: "Escrow commercial pour transactions maritimes",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#2dd4bf",
      "--w3m-border-radius-master": "3px",
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
      history: false,
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
