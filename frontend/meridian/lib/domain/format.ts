import { formatUnits, parseUnits } from "viem";

/** Formate un montant brut (bigint) en chaîne lisible : séparateur de milliers, 2 décimales max, sans zéros inutiles. */
export function formatAmount(value: bigint, decimals: number): string {
  const formatted = formatUnits(value, decimals);
  const [whole, fraction] = formatted.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (!fraction) return groupedWhole;
  const trimmedFraction = fraction.slice(0, 2).replace(/0+$/, "");
  return trimmedFraction ? `${groupedWhole},${trimmedFraction}` : groupedWhole;
}

/**
 * Parse la saisie d'un champ montant en valeur brute (bigint). Appelée à
 * chaque frappe : une saisie transitoirement invalide ("q", "1.2.3", "-",
 * virgule seule…) est un état normal pendant que l'utilisateur tape, pas une
 * erreur — contrairement à `parseUnits`, qui lèverait dans ce cas. Toute
 * saisie non interprétable est traitée comme `0n`.
 */
export function parseAmountInput(value: string, decimals: number): bigint {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0n;
  try {
    return parseUnits(normalized, decimals);
  } catch {
    return 0n;
  }
}

/** Formate un timestamp Unix en date lisible (fr-FR, fuseau UTC). */
export function formatUnixDate(seconds: bigint | number): string {
  const value = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (!value) return "—";
  return new Date(value * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Convertit la valeur d'un `<input type="date">` (minuit UTC) en timestamp Unix. */
export function dateInputToUnix(value: string): bigint {
  if (!value) return 0n;
  return BigInt(Math.floor(Date.parse(`${value}T00:00:00Z`) / 1000));
}

export function unixToDateInput(seconds: bigint | number): string {
  const value = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (!value) return "";
  return new Date(value * 1000).toISOString().slice(0, 10);
}

/**
 * Pendant de `dateInputToUnix` pour un `<input type="datetime-local">` (mode
 * "échéance courte", voir `useShortDeadlineMode`). Contrairement à
 * `<input type="date">`, sa valeur ("YYYY-MM-DDTHH:mm") n'a pas de fuseau et
 * le moteur JS l'interprète en heure locale — donc pas de suffixe "Z" ici,
 * à l'inverse de `dateInputToUnix`.
 */
export function dateTimeInputToUnix(value: string): bigint {
  if (!value) return 0n;
  return BigInt(Math.floor(new Date(value).getTime() / 1000));
}

export function unixToDateTimeInput(seconds: bigint | number): string {
  const value = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (!value) return "";
  const d = new Date(value * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Raccourcit une chaîne hex ("0x1234…abcd") en gardant `chars` caractères de chaque côté. */
export function truncateHex(value: string, chars = 5): string {
  if (value.length <= chars * 2 + 2) return value;
  return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`;
}
