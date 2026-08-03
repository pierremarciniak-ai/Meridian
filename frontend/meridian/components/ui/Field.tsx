import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      {children}
      {error ? <span className="text-danger text-xs">{error}</span> : hint ? <span className="text-subtle text-xs">{hint}</span> : null}
    </label>
  );
}
