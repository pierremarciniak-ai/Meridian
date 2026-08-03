"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { truncateHex } from "@/lib/domain/format";

export function CopyChip({ value, chars = 6, label }: { value: string; chars?: number; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silencieux : le presse-papier peut être indisponible (contexte non sécurisé, permissions)
    }
  }

  return (
    <span className="copy-chip font-mono-tight">
      {label ? <span className="text-subtle">{label}</span> : null}
      <span>{truncateHex(value, chars)}</span>
      <button type="button" onClick={handleCopy} aria-label="Copier" title="Copier">
        {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}
