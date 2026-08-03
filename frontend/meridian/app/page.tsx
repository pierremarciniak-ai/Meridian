import { AcceptShipmentForm } from "@/components/dashboard/AcceptShipmentForm";
import { CreateShipmentForm } from "@/components/dashboard/CreateShipmentForm";
import { FaucetPanel } from "@/components/dashboard/FaucetPanel";
import { MyShipmentsList } from "@/components/dashboard/MyShipmentsList";
import { WavesIcon } from "@/components/icons";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
      <section className="flex flex-col gap-3">
        <span className="label-caps flex items-center gap-2 text-accent">
          <WavesIcon className="h-4 w-4" />
          Escrow commercial on-chain
        </span>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-foam sm:text-4xl">
          Sécurisez vos transactions de fret.
        </h1>
        <p className="max-w-2xl text-sm text-muted sm:text-base">
          Meridian bloque les fonds de l&apos;acheteur sur la blockchain dès la signature des deux parties, et ne les
          libère au fournisseur qu&apos;une fois les conditions convenues remplies.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <CreateShipmentForm />
        </div>
        <div className="lg:col-span-2">
          <AcceptShipmentForm />
        </div>
      </section>

      <section>
        <MyShipmentsList />
      </section>

      <section>
        <div className="rope-divider mb-8" />
        <FaucetPanel />
      </section>
    </div>
  );
}
