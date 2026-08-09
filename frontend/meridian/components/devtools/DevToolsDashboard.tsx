"use client";

import { FaucetPanel } from "@/components/dashboard/FaucetPanel";
import { ShortDeadlinePanel } from "@/components/devtools/ShortDeadlinePanel";

export function DevToolsDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <FaucetPanel />
      <ShortDeadlinePanel />
    </div>
  );
}
