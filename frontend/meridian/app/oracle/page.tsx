import { OracleDashboard } from "@/components/oracle/OracleDashboard";

export default function OraclePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-foam">Oracle de position de conteneur</h1>
        <p className="mt-1 text-sm text-muted">Réservé au wallet configuré comme oracle sur le contrat Meridian.</p>
      </div>
      <OracleDashboard />
    </div>
  );
}
