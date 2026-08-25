"use client";

import { AppKitButton } from "@reown/appkit/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { useAccount } from "wagmi";
import { CompassIcon } from "@/components/icons";
import { supportedChains } from "@/lib/web3/chain";
import { useIsContainerPositionOracle } from "@/hooks/useIsContainerPositionOracle";
import { useIsOwner } from "@/hooks/useIsOwner";

export function Header() {
  const { chainId, isConnected } = useAccount();
  const { isOwner } = useIsOwner();
  const { isContainerPositionOracle } = useIsContainerPositionOracle();
  // Plusieurs réseaux sont supportés simultanément (voir supportedChains) :
  // "mauvais réseau" signifie "aucun des réseaux supportés", pas "différent
  // d'un seul réseau attendu".
  const onExpectedChain = !isConnected || supportedChains.some((chain) => chain.id === chainId);
  const pathname = usePathname();

  /**
   * Force un rechargement complet quand on clique sur le logo depuis "/".
   * Un `<Link>` vers la route déjà affichée ne déclenche aucune navigation
   * (Next.js réutilise la page telle quelle) : les états locaux du tableau
   * de bord (ex. l'écran "Contrat créé" après une création) resteraient
   * sinon figés, rendant le clic visiblement sans effet.
   */
  function handleLogoClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname === "/") {
      event.preventDefault();
      window.location.href = "/";
    }
  }

  return (
    <header className="border-b" style={{ borderColor: "var(--color-navy-700)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" onClick={handleLogoClick} className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: "var(--color-navy-800)", border: "1px solid var(--color-navy-500)" }}
          >
            <CompassIcon className="h-5 w-5 text-accent" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-semibold tracking-wide text-foam">MERIDIAN</span>
            <span className="label-caps mt-1">Escrow on-chain de fret maritime</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-5 sm:flex">
          <Link href="/dev-tools" className="label-caps transition-colors hover:text-accent">
            Outils de test
          </Link>
          {isContainerPositionOracle && (
            <Link href="/oracle" className="label-caps transition-colors hover:text-accent">
              Oracle
            </Link>
          )}
          {isOwner && (
            <Link href="/admin" className="label-caps transition-colors hover:text-accent">
              Administration
            </Link>
          )}
        </nav>

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
