"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { CopyChip } from "@/components/CopyChip";
import { ContainerBoxIcon } from "@/components/icons";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import {
  AdvancePaymentMode,
  Currency,
  TransactionCondition,
  TransactionModel,
  advancePaymentModeLabels,
  currencyLabels,
  transactionConditionLabels,
  transactionModelHints,
  transactionModelLabels,
} from "@/lib/domain/enums";
import { dateInputToUnix, dateTimeInputToUnix, formatAmount, parseAmountInput, unixToDateTimeInput } from "@/lib/domain/format";
import { estimateAdvanceAmount } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Meta } from "@/hooks/useErc20";
import { useFeesAmount } from "@/hooks/useFeesAmount";
import { useShortDeadlineMode } from "@/hooks/useShortDeadlineMode";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress } from "@/lib/web3/contracts";
import { findEventArg } from "@/lib/web3/parseLogs";

function tomorrowPlus(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nowPlusMinutes(minutes: number) {
  return unixToDateTimeInput(Math.floor(Date.now() / 1000) + minutes * 60);
}

// onCreatedChange permet à la page d'ajuster sa mise en page une fois le
// dossier créé (masquer "Espace fournisseur" et laisser "Dossier créé"
// prendre toute la largeur) sans dupliquer l'état `created` côté page.
export function CreateShipmentForm({ onCreatedChange }: { onCreatedChange?: (created: boolean) => void }) {
  const router = useRouter();
  const { isConnected } = useAccount();

  const [currency, setCurrency] = useState<Currency>(Currency.USDC);
  const [condition, setCondition] = useState<TransactionCondition>(TransactionCondition.AtTheEndOfDelivery);
  const [model, setModel] = useState<TransactionModel>(TransactionModel.PartialLocked);
  const [advancePaymentMode, setAdvancePaymentMode] = useState<AdvancePaymentMode>(AdvancePaymentMode.Deferred);
  const [totalAmountInput, setTotalAmountInput] = useState("");
  const [advanceAmountInput, setAdvanceAmountInput] = useState("");
  const [cancellingDate, setCancellingDate] = useState(tomorrowPlus(30));
  const [billNumber, setBillNumber] = useState("");
  const [created, setCreated] = useState<{ id: `0x${string}`; billNumber: string } | null>(null);
  const [shortDeadline] = useShortDeadlineMode();

  const { tokenAddresses } = useTokenAddresses();
  const tokenAddress = tokenAddresses[currency];
  const { decimals, symbol } = useErc20Meta(tokenAddress);
  const { execute, stage, error, receipt, isBusy } = useContractAction();
  const { feesAmount } = useFeesAmount();

  useEffect(() => {
    // shortDeadline vient de useShortDeadlineMode, résolu de façon
    // asynchrone (lecture localStorage côté client après le montage) : ce
    // n'est pas une valeur dérivable au rendu, donc un effet est requis pour
    // réappliquer la date par défaut une fois le mode connu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCancellingDate(shortDeadline ? nowPlusMinutes(5) : tomorrowPlus(30));
  }, [shortDeadline]);

  useEffect(() => {
    // Réagit à la confirmation de la transaction (receipt, alimenté par
    // useWaitForTransactionReceipt) : un événement externe asynchrone, pas
    // une valeur dérivable au rendu.
    if (stage === "success" && receipt && !created) {
      const id = findEventArg<`0x${string}`>(receipt.logs, "TransactionInitialized", "transactionID");
      if (id) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCreated({ id, billNumber });
        onCreatedChange?.(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, receipt]);

  const totalAmountParsed = totalAmountInput ? parseAmountInput(totalAmountInput, decimals) : 0n;
  const needsAdvanceInput = model !== TransactionModel.FullLocked;
  const isFreeModel = model === TransactionModel.Free;
  // Pour PartialLocked/PartialImmediate, le contrat applique lui-même un
  // pourcentage (30 %/15 %) à la valeur qu'on lui passe comme advanceAmount :
  // pour que l'acompte réellement stocké corresponde au montant affiché, on
  // lui transmet le montant total (qu'il réduira au pourcentage voulu) plutôt
  // que de lui envoyer directement le montant déjà calculé — sinon le
  // pourcentage serait appliqué deux fois.
  const autoAdvanceAmount = estimateAdvanceAmount(model, totalAmountParsed);
  const freeAdvanceParsed = isFreeModel ? parseAmountInput(advanceAmountInput, decimals) : 0n;
  const advanceTooHigh = isFreeModel && totalAmountParsed > 0n && freeAdvanceParsed >= totalAmountParsed;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (advanceTooHigh) return;
    const details = {
      currency,
      transactionCondition: condition,
      transactionModel: model,
      advancePaymentMode,
      advanceAmount: !needsAdvanceInput ? 0n : isFreeModel ? freeAdvanceParsed : totalAmountParsed,
      totalAmount: totalAmountParsed,
      transactionCancellingDate: shortDeadline ? dateTimeInputToUnix(cancellingDate) : dateInputToUnix(cancellingDate),
    };
    await execute({
      address: meridianAddress,
      abi: meridianAbi,
      functionName: "initializeTransaction",
      args: [details, billNumber],
    });
  }

  if (created) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dossier créé</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted">
          Transmettez ces deux références à votre fournisseur : elles lui permettront d&apos;accepter le dossier.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <CopyChip label="ID" value={created.id} chars={10} />
          <CopyChip label="Facture" value={created.billNumber} chars={12} />
        </div>
        <div className="mt-6 flex gap-3">
          <Button onClick={() => router.push(`/transaction/${created.id}`)}>Ouvrir le dossier</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setCreated(null);
              onCreatedChange?.(false);
            }}
          >
            Créer un autre dossier
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Espace acheteur</CardTitle>
        <ContainerBoxIcon className="h-6 w-6 text-subtle" />
      </CardHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Devise de règlement">
            <select
              className="field-select"
              value={currency}
              onChange={(e) => setCurrency(Number(e.target.value) as Currency)}
            >
              {Object.values(Currency)
                .filter((v) => typeof v === "number")
                .map((v) => (
                  <option key={v} value={v}>
                    {currencyLabels[v as Currency]}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Condition de paiement">
            <select
              className="field-select"
              value={condition}
              onChange={(e) => setCondition(Number(e.target.value) as TransactionCondition)}
            >
              {Object.values(TransactionCondition)
                .filter((v) => typeof v === "number")
                .map((v) => (
                  <option key={v} value={v}>
                    {transactionConditionLabels[v as TransactionCondition]}
                  </option>
                ))}
            </select>
          </Field>
        </div>

        <Field label="Modèle de paiement" hint={transactionModelHints[model]}>
          <select className="field-select" value={model} onChange={(e) => setModel(Number(e.target.value) as TransactionModel)}>
            {Object.values(TransactionModel)
              .filter((v) => typeof v === "number")
              .map((v) => (
                <option key={v} value={v}>
                  {transactionModelLabels[v as TransactionModel]}
                </option>
              ))}
          </select>
        </Field>

        {isFreeModel && (
          <Field label="Versement de l'acompte">
            <select
              className="field-select"
              value={advancePaymentMode}
              onChange={(e) => setAdvancePaymentMode(Number(e.target.value) as AdvancePaymentMode)}
            >
              {Object.values(AdvancePaymentMode)
                .filter((v) => typeof v === "number")
                .map((v) => (
                  <option key={v} value={v}>
                    {advancePaymentModeLabels[v as AdvancePaymentMode]}
                  </option>
                ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={`Montant total (${symbol || "…"})`}
            hint={
              feesAmount > 0n
                ? `+ ${formatAmount(feesAmount, decimals)} ${symbol} de frais de gestion, prélevés lors du premier dépôt.`
                : undefined
            }
          >
            <input
              className="field-input"
              inputMode="decimal"
              placeholder="0.00"
              value={totalAmountInput}
              onChange={(e) => setTotalAmountInput(e.target.value)}
              required
            />
          </Field>

          {needsAdvanceInput && (
            <Field
              label={`Montant de l'acompte (${symbol || "…"})`}
              error={advanceTooHigh ? "L'acompte doit être strictement inférieur au montant total." : undefined}
            >
              <input
                className="field-input"
                inputMode="decimal"
                placeholder="0.00"
                value={isFreeModel ? advanceAmountInput : formatAmount(autoAdvanceAmount, decimals)}
                onChange={(e) => setAdvanceAmountInput(e.target.value)}
                disabled={!isFreeModel}
                readOnly={!isFreeModel}
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date d'expiration de la provision" hint={shortDeadline ? "Mode échéance courte activé (voir Outils de test)." : undefined}>
            <input
              className="field-input"
              type={shortDeadline ? "datetime-local" : "date"}
              value={cancellingDate}
              onChange={(e) => setCancellingDate(e.target.value)}
              required
            />
          </Field>

          <Field label="Numéro de facture (bill number)" hint="Doit être communiqué au fournisseur pour qu'il accepte le dossier.">
            <input
              className="field-input font-mono-tight"
              placeholder="BL-2026-00042"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              required
            />
          </Field>
        </div>

        <TxStatusLine stage={stage} error={error} />

        <Button type="submit" loading={isBusy} disabled={!isConnected || advanceTooHigh}>
          {isConnected ? "Initier le dossier" : "Connectez votre portefeuille"}
        </Button>
      </form>
    </Card>
  );
}
