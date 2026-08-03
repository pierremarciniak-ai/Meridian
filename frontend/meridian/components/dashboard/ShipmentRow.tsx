"use client";

import Link from "next/link";
import type { Hex } from "viem";
import { useAccount } from "wagmi";
import { StatusBadge } from "@/components/StatusBadge";
import { currencyLabels } from "@/lib/domain/enums";
import { formatAmount, formatUnixDate, truncateHex } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { sameAddress } from "@/lib/domain/transaction";
import { useErc20Meta } from "@/hooks/useErc20";
import { tokenAddresses } from "@/lib/web3/contracts";

export function ShipmentRow({ id, tx }: { id: Hex; tx: OnChainTransaction }) {
  const { address } = useAccount();
  const { decimals } = useErc20Meta(tokenAddresses[tx.currency]);

  const role = sameAddress(tx.buyer.userAddress, address)
    ? "Acheteur"
    : sameAddress(tx.seller.userAddress, address)
      ? "Fournisseur"
      : null;

  return (
    <Link
      href={`/transaction/${id}`}
      className="flex items-center justify-between gap-4 rounded-lg px-4 py-3.5 transition-colors"
      style={{ background: "var(--color-navy-850)", border: "1px solid var(--color-navy-700)" }}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono-tight text-sm text-foam">{tx.billNumber || truncateHex(id)}</span>
          {role && <span className="label-caps text-accent">{role}</span>}
        </div>
        <span className="font-mono-tight text-xs text-subtle">{truncateHex(id, 8)}</span>
      </div>

      <div className="hidden flex-col items-end gap-1 sm:flex">
        <span className="text-sm text-foam">
          {formatAmount(tx.totalAmount, decimals)} {currencyLabels[tx.currency]}
        </span>
        <span className="text-xs text-subtle">Échéance {formatUnixDate(tx.transactionCancellingDate)}</span>
      </div>

      <div className="flex w-auto shrink-0 items-center justify-end sm:w-[250px]">
        <StatusBadge status={tx.workflowStatus} />
      </div>
    </Link>
  );
}
