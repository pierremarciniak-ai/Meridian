"use client";

import { AppKitButton } from "@reown/appkit/react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { CompassIcon } from "@/components/icons";
import { hardhatLocal } from "@/lib/web3/chain";

export function Header() {
  const { chainId, isConnected } = useAccount();
  const onExpectedChain = !isConnected || chainId === hardhatLocal.id;

  return (
    <header className="border-b" style={{ borderColor: "var(--color-navy-700)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: "var(--color-navy-800)", border: "1px solid var(--color-navy-500)" }}
          >
            <CompassIcon className="h-5 w-5 text-accent" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-semibold tracking-wide text-foam">MERIDIAN</span>
            <span className="label-caps mt-1">Escrow de fret maritime</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {!onExpectedChain && (
            <span className="status-badge status-aborted">
              <span className="status-badge__dot" />
              Mauvais réseau
            </span>
          )}
          <AppKitButton balance="hide" label="Connecter un portefeuille" loadingLabel="Connexion…" />
        </div>
      </div>
    </header>
  );
}
