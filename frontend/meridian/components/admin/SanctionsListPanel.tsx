"use client";

import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { CopyChip } from "@/components/CopyChip";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { ZERO_ADDRESS } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { useSanctionedAddresses } from "@/hooks/useSanctionedAddresses";
import { sanctionsListAbi } from "@/lib/web3/abi/sanctionsList";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/**
 * Une ligne = son propre `useContractAction`, pour que le bouton "Lever la
 * sanction" d'une adresse ne montre pas de spinner sur toutes les autres
 * pendant qu'une transaction est en cours.
 */
function SanctionedAddressRow({
  account,
  oracleAddress,
  onLifted,
}: {
  account: `0x${string}`;
  oracleAddress: `0x${string}`;
  onLifted: () => void;
}) {
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  useEffect(() => {
    if (isSuccess) onLifted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  return (
    <div className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <CopyChip value={account} />
        <Button
          variant="secondary"
          loading={isBusy}
          onClick={() =>
            execute({ address: oracleAddress, abi: sanctionsListAbi, functionName: "unSetSanctioned", args: [account] })
          }
        >
          Lever la sanction
        </Button>
      </div>
      <TxStatusLine stage={stage} error={error} />
    </div>
  );
}

/**
 * Gère la liste de sanctions de l'oracle mock. `setSanctioned`/
 * `unSetSanctioned`/`unSetAllSanctioned` sont `onlyOwner` sur SanctionsList
 * lui-même (pas sur Meridian) : réservé au wallet qui a déployé cet oracle
 * mock, pas nécessairement le même que le owner de Meridian dans un
 * déploiement plus élaboré qu'en local. `isSanctioned` reste public
 * (lecture) : c'est Meridian qui l'appelle pour chaque vérification de
 * sanction, `msg.sender` y est alors l'adresse de Meridian.
 */
export function SanctionsListPanel({
  mockSanctionsEnabled,
  mockSanctionsOracleAddress,
}: {
  mockSanctionsEnabled: boolean | undefined;
  mockSanctionsOracleAddress: `0x${string}` | undefined;
}) {
  const [address, setAddress] = useState("");
  const trimmed = address.trim();
  const valid = ADDRESS_PATTERN.test(trimmed);
  const hasOracle = !!mockSanctionsOracleAddress && mockSanctionsOracleAddress.toLowerCase() !== ZERO_ADDRESS;

  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  const { data: isSanctioned, refetch } = useReadContract({
    address: mockSanctionsOracleAddress,
    abi: sanctionsListAbi,
    functionName: "isSanctioned",
    args: valid ? [trimmed as `0x${string}`] : undefined,
    query: { enabled: valid && hasOracle },
  });

  const {
    sanctionedAddresses,
    isLoading: isLoadingSanctioned,
    refresh: refreshSanctioned,
  } = useSanctionedAddresses(hasOracle ? mockSanctionsOracleAddress : undefined);

  useEffect(() => {
    if (isSuccess) {
      refetch();
      refreshSanctioned();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liste de sanctions (oracle mock)</CardTitle>
      </CardHeader>

      {!mockSanctionsEnabled ? (
        <p className="text-sm text-subtle">
          Activez « Utiliser l&apos;oracle mock » ci-dessus pour gérer les adresses sanctionnées de test.
        </p>
      ) : !hasOracle ? (
        <p className="text-sm text-subtle">Configurez d&apos;abord l&apos;adresse de l&apos;oracle mock ci-dessus.</p>
      ) : (
        <>
          <p className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted">
            Agit directement sur <CopyChip value={mockSanctionsOracleAddress!} /> — réservé au wallet qui l&apos;a déployé.
          </p>
          <Field label="Adresse">
            <input
              className="field-input font-mono-tight"
              placeholder="0x…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>

          {valid && (
            <p className="mt-2 text-sm text-subtle">
              Statut actuel :{" "}
              <span className={isSanctioned ? "text-danger" : "text-foam"}>{isSanctioned ? "sanctionnée" : "non sanctionnée"}</span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={!valid}
              loading={isBusy}
              onClick={() =>
                execute({
                  address: mockSanctionsOracleAddress!,
                  abi: sanctionsListAbi,
                  functionName: "setSanctioned",
                  args: [trimmed],
                })
              }
            >
              Sanctionner
            </Button>
            <Button
              variant="secondary"
              disabled={!valid}
              loading={isBusy}
              onClick={() =>
                execute({
                  address: mockSanctionsOracleAddress!,
                  abi: sanctionsListAbi,
                  functionName: "unSetSanctioned",
                  args: [trimmed],
                })
              }
            >
              Lever la sanction
            </Button>
            <Button
              variant="ghost"
              loading={isBusy}
              onClick={() =>
                execute({
                  address: mockSanctionsOracleAddress!,
                  abi: sanctionsListAbi,
                  functionName: "unSetAllSanctioned",
                })
              }
            >
              Réinitialiser toutes les sanctions
            </Button>
          </div>
          <div className="mt-2">
            <TxStatusLine stage={stage} error={error} />
          </div>

          <div className="rope-divider my-4" />

          <h3 className="label-caps mb-1">Adresses actuellement sanctionnées</h3>
          {isLoadingSanctioned ? (
            <p className="py-2 text-sm text-subtle">Chargement…</p>
          ) : sanctionedAddresses.length === 0 ? (
            <p className="py-2 text-sm text-subtle">Aucune adresse sanctionnée pour l&apos;instant.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-navy-700)" }}>
              {sanctionedAddresses.map((account) => (
                <SanctionedAddressRow
                  key={account}
                  account={account}
                  oracleAddress={mockSanctionsOracleAddress!}
                  onLifted={refreshSanctioned}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
