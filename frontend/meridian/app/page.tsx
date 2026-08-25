"use client";

import { useState } from "react";
import { AcceptShipmentForm } from "@/components/dashboard/AcceptShipmentForm";
import { CreateShipmentForm } from "@/components/dashboard/CreateShipmentForm";
import { MyShipmentsList } from "@/components/dashboard/MyShipmentsList";
import { AlertIcon, WavesIcon } from "@/components/icons";
import { useNativeCurrencySymbol } from "@/lib/web3/chain";

export default function Home() {
  // Une fois le contrat créé, CreateShipmentForm affiche l'écran "Contrat
  // créé" (référence du contrat + bon de commande à transmettre) : "Espace fournisseur" n'a plus rien à
  // faire sur cette même page à ce moment-là, donc on le masque et on laisse
  // l'écran de résultat prendre toute la largeur de la section.
  const [hasJustCreated, setHasJustCreated] = useState(false);
  const nativeCurrencySymbol = useNativeCurrencySymbol();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
      <section className="flex flex-col gap-3">
        {/* <span className="label-caps flex items-center gap-2 text-accent">
          <WavesIcon className="h-4 w-4" />
          Escrow commercial on-chain
        </span> */}
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-foam sm:text-4xl">
          Sécurisez vos transactions de fret.
        </h1>
        <p className="max-w-2xl text-sm text-muted sm:text-base">
          Meridian permet de signer une transaction et de bloquer les fonds sur la blockchain. Une fois les conditions 
          convenues remplies les fonds sont libérés au fournisseur.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className={hasJustCreated ? "lg:col-span-5" : "lg:col-span-3"}>
          <CreateShipmentForm onCreatedChange={setHasJustCreated} />
        </div>
        {!hasJustCreated && (
          <div className="lg:col-span-2 flex flex-col gap-6">
            <AcceptShipmentForm />
            <p
              className="flex items-start gap-2 rounded-lg border px-4 py-3 text-sm text-muted"
              style={{ borderColor: "var(--color-navy-700)", background: "var(--color-navy-850)" }}
            >
              <AlertIcon className="h-4 w-4 shrink-0 text-accent" />
              <span>
                Important : pensez à disposer de {nativeCurrencySymbol} dans votre portefeuille pour couvrir les frais
                de gas des transactions on-chain (signature, dépôt, retrait…).
              </span>
            </p>
          </div>
        )}
      </section>

      <section>
        <MyShipmentsList />
      </section>
    </div>
  );
}
