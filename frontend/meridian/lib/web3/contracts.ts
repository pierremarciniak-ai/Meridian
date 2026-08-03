import type { Address } from "viem";
import { Currency } from "@/lib/domain/enums";

function requireAddress(value: string | undefined, name: string): Address {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Variable d'environnement ${name} manquante ou invalide`);
  }
  return value as Address;
}

export const meridianAddress = requireAddress(process.env.NEXT_PUBLIC_MERIDIAN_ADDRESS, "NEXT_PUBLIC_MERIDIAN_ADDRESS");

export const tokenAddresses: Record<Currency, Address> = {
  [Currency.USDC]: requireAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS, "NEXT_PUBLIC_USDC_ADDRESS"),
  [Currency.USDT]: requireAddress(process.env.NEXT_PUBLIC_USDT_ADDRESS, "NEXT_PUBLIC_USDT_ADDRESS"),
  [Currency.EURC]: requireAddress(process.env.NEXT_PUBLIC_EURC_ADDRESS, "NEXT_PUBLIC_EURC_ADDRESS"),
};
