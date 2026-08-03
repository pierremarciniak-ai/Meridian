import Link from "next/link";
import { ContainerShipIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TransactionDetail } from "@/components/transaction/TransactionDetail";

const TRANSACTION_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!TRANSACTION_ID_PATTERN.test(id)) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Card className="text-center">
          <div className="flex flex-col items-center gap-3 py-6">
            <ContainerShipIcon className="h-8 w-8 text-subtle" />
            <h1 className="text-lg font-semibold text-foam">Identifiant invalide</h1>
            <p className="max-w-sm text-sm text-muted">
              L&apos;identifiant de dossier doit être un hash de 32 octets (0x suivi de 64 caractères hexadécimaux).
            </p>
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

  return <TransactionDetail id={id as `0x${string}`} />;
}
