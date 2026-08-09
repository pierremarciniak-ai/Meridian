import { DevToolsDashboard } from "@/components/devtools/DevToolsDashboard";

export default function DevToolsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-foam">Outils de test</h1>
        <p className="mt-1 text-sm text-muted">
          Panneau provisoire, réseau de développement Hardhat local uniquement — à retirer avant une mise en production.
        </p>
      </div>
      <DevToolsDashboard />
    </div>
  );
}
