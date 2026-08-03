import { formatUnits, parseUnits } from "viem";

export function formatAmount(value: bigint, decimals: number): string {
  const formatted = formatUnits(value, decimals);
  const [whole, fraction] = formatted.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (!fraction) return groupedWhole;
  const trimmedFraction = fraction.slice(0, 2).replace(/0+$/, "");
  return trimmedFraction ? `${groupedWhole},${trimmedFraction}` : groupedWhole;
}

export function parseAmountInput(value: string, decimals: number): bigint {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0n;
  return parseUnits(normalized, decimals);
}

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

export function dateInputToUnix(value: string): bigint {
  if (!value) return 0n;
  return BigInt(Math.floor(Date.parse(`${value}T00:00:00Z`) / 1000));
}

export function unixToDateInput(seconds: bigint | number): string {
  const value = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (!value) return "";
  return new Date(value * 1000).toISOString().slice(0, 10);
}

export function truncateHex(value: string, chars = 5): string {
  if (value.length <= chars * 2 + 2) return value;
  return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`;
}
