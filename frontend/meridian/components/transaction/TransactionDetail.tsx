"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { CopyChip } from "@/components/CopyChip";
import { AlertIcon, ContainerShipIcon } from "@/components/icons";
import { StatusBadge } from "@/components/StatusBadge";
import { BecomeSellerPanel } from "@/components/transaction/BecomeSellerPanel";
import { DepositPanel } from "@/components/transaction/DepositPanel";
import { DetailsForm } from "@/components/transaction/DetailsForm";
import { TimelineStepper } from "@/components/transaction/TimelineStepper";
import { TransactionSummary } from "@/components/transaction/TransactionSummary";
import { WithdrawPanel } from "@/components/transaction/WithdrawPanel";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Currency, WorkflowStatus } from "@/lib/domain/enums";
import { formatAmount } from "@/lib/domain/format";
import { hasSeller, sameAddress, transactionExists } from "@/lib/domain/transaction";
import { useErc20Meta } from "@/hooks/useErc20";
import { useMeridianTransaction } from "@/hooks/useMeridianTransaction";
import { tokenAddresses } from "@/lib/web3/contracts";

export function TransactionDetail({ id }: { id: `0x${string}` }) {
  const { address } = useAccount();
  const { data: tx, isLoading, refetch } = useMeridianTransaction(id);
  const { decimals, symbol } = useErc20Meta(tokenAddresses[tx ? tx.currency : Currency.USDC]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="h-64 animate-pulse rounded-lg" style={{ background: "var(--color-navy-850)" }} />
      </div>
    );
  }

  if (!tx || !transactionExists(tx)) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Card className="items-center text-center">
          <div className="flex flex-col items-center gap-3 py-6">
            <ContainerShipIcon className="h-8 w-8 text-subtle" />
            <h1 className="text-lg font-semibold text-foam">Dossier introuvable</h1>
            <p className="max-w-sm text-sm text-muted">
              Aucune transaction n&apos;existe pour cet identifiant sur ce réseau. Vérifiez le lien transmis, ou que votre
              portefeuille est bien connecté au bon réseau.
            </p>
            <CopyChip value={id} chars={8} />
            <Link href="/">
              <Button variant="secondary" className="mt-2">
                Retour au tableau de bord
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const isBuyer = sameAddress(tx.buyer.userAddress, address);
  const isSeller = sameAddress(tx.seller.userAddress, address);
  const role: "buyer" | "seller" | null = isBuyer ? "buyer" : isSeller ? "seller" : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{tx.billNumber || "Dossier sans référence"}</CardTitle>
            <div className="mt-2">
              <CopyChip label="ID" value={id} chars={8} />
            </div>
          </div>
          <StatusBadge status={tx.workflowStatus} />
        </CardHeader>

        <TimelineStepper status={tx.workflowStatus} />

        <div className="rope-divider my-6" />

        <TransactionSummary
          transactionId={id}
          tx={tx}
          decimals={decimals}
          symbol={symbol}
          account={address}
          role={role}
          onSigned={() => refetch()}
        />
      </Card>

      {!address && tx.workflowStatus !== WorkflowStatus.Finished && tx.workflowStatus !== WorkflowStatus.Aborted && (
        <p className="text-center text-sm text-subtle">Connectez votre portefeuille pour agir sur ce dossier.</p>
      )}

      {tx.workflowStatus === WorkflowStatus.Initialized && !hasSeller(tx) && (
        <BecomeSellerPanel transactionId={id} expectedBillNumber={tx.billNumber} onAccepted={() => refetch()} />
      )}

      {tx.workflowStatus === WorkflowStatus.Created &&
        (role ? (
          <DetailsForm transactionId={id} tx={tx} role={role} onSaved={() => refetch()} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Logistique & conditions</CardTitle>
            </CardHeader>
            <p className="text-sm text-subtle">Seuls l&apos;acheteur et le fournisseur déclarés peuvent modifier ce dossier.</p>
          </Card>
        ))}

      {tx.workflowStatus === WorkflowStatus.Signed && role === "buyer" && <DepositPanel transactionId={id} tx={tx} onDeposited={() => refetch()} />}
      {tx.workflowStatus === WorkflowStatus.Signed && role === "seller" && <WithdrawPanel transactionId={id} tx={tx} onWithdrawn={() => refetch()} />}
      {tx.workflowStatus === WorkflowStatus.Signed && !role && (
        <Card>
          <p className="text-sm text-subtle">
            Dossier signé par les deux parties — en attente de dépôt par l&apos;acheteur puis de retrait par le fournisseur.
          </p>
        </Card>
      )}

      {tx.workflowStatus === WorkflowStatus.Finished && (
        <Card>
          <CardHeader>
            <CardTitle>Dossier soldé</CardTitle>
          </CardHeader>
          <p className="text-sm" style={{ color: "#86efac" }}>
            {formatAmount(tx.depositedAmount, decimals)} {symbol} déposés par l&apos;acheteur et intégralement reversés au
            fournisseur. Cycle terminé.
          </p>
        </Card>
      )}

      {tx.workflowStatus === WorkflowStatus.Aborted && (
        <Card>
          <CardHeader>
            <CardTitle>Dossier abandonné</CardTitle>
            <AlertIcon className="h-6 w-6 text-danger" />
          </CardHeader>
          <p className="text-sm text-danger">
            L&apos;échéance d&apos;annulation a été dépassée avant la finalisation du dossier ; le contrat l&apos;a
            automatiquement marqué comme abandonné. Si des fonds avaient déjà été déposés, ils restent comptabilisés
            ci-dessus mais ne peuvent plus être mouvementés via cette interface une fois ce statut atteint.
          </p>
        </Card>
      )}
    </div>
  );
}
