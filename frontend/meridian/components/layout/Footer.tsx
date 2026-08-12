import { WavesIcon } from "@/components/icons";

export function Footer() {
  return (
    <footer className="mt-auto border-t" style={{ borderColor: "var(--color-navy-700)" }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="flex items-center gap-2 text-xs text-subtle">
          <WavesIcon className="h-4 w-4" />
          Meridian — escrow on-chain pour transactions commerciales maritimes.
        </p>
        <p className="text-xs text-subtle">Usage démo uniquement</p>
      </div>
    </footer>
  );
}
