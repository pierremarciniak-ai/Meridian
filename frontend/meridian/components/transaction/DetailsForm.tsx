"use client";

import { type FormEvent, useEffect, useState } from "react";
import { TxStatusLine } from "@/components/TxStatusLine";
import { FeesExplainerNote } from "@/components/transaction/FeesExplainerNote";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import {
  Currency,
  TransactionCondition,
  TransactionModel,
  currencyLabels,
  transactionConditionLabels,
  transactionModelLabels,
} from "@/lib/domain/enums";
import { dateInputToUnix, dateTimeInputToUnix, formatAmount, parseAmountInput, unixToDateInput, unixToDateTimeInput } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { estimateAdvanceAmount, estimateFees, isCurrentEditor } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Meta } from "@/hooks/useErc20";
import { useFeesRateBps } from "@/hooks/useFeesRateBps";
import { useMinFeesAmount } from "@/hooks/useMinFeesAmount";
import { useShortDeadlineMode } from "@/hooks/useShortDeadlineMode";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

/**
 * Format ISO 6346 (numéro de conteneur maritime) : 4 lettres (code
 * propriétaire) suivies de 7 chiffres, collés, sans espace ni tiret — voir
 * le placeholder "MEDU1234567" ci-dessous.
 */
const CONTAINER_REFERENCE_PATTERN = /^[A-Za-z]{4}\d{7}$/;

/**
 * Formulaire de négociation des détails d'un contrat
 * (`saveTransactionDetailsSeller`/`saveTransactionDetailsBuyer`), verrouillé
 * tant que ce n'est pas le tour de l'utilisateur (voir `isCurrentEditor`).
 * Toute soumission réinitialise les deux signatures côté contrat.
 */
export function DetailsForm({
  transactionId,
  tx,
  role,
  onSaved,
}: {
  transactionId: `0x${string}`;
  tx: OnChainTransaction;
  role: "buyer" | "seller";
  onSaved: () => void;
}) {
  const [currency, setCurrency] = useState<Currency>(tx.currency);
  const [condition, setCondition] = useState<TransactionCondition>(tx.transactionCondition);
  const [model, setModel] = useState<TransactionModel>(tx.transactionModel);
  const [totalAmountInput, setTotalAmountInput] = useState("");
  const [advanceAmountInput, setAdvanceAmountInput] = useState("");
  const [cancellingDate, setCancellingDate] = useState(unixToDateInput(tx.transactionCancellingDate));
  const [containerReference, setContainerReference] = useState(tx.containerReference);
  const [shortDeadline] = useShortDeadlineMode();

  const meridianAddress = useMeridianAddress();
  const { tokenAddresses } = useTokenAddresses();
  const { decimals, symbol } = useErc20Meta(tokenAddresses[currency]);
  const { execute, stage, error, isSuccess } = useContractAction();
  const { feesRateBps } = useFeesRateBps();
  const { minFeesAmount } = useMinFeesAmount();

  useEffect(() => {
    // decimals vient de useErc20Meta (lecture on-chain asynchrone, 6 par
    // défaut avant résolution) : reformater les champs texte éditables une
    // fois la vraie valeur connue n'est pas dérivable au rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTotalAmountInput(formatAmount(tx.totalAmount, decimals).replace(/\s/g, "").replace(",", "."));
    setAdvanceAmountInput(formatAmount(tx.advanceAmount, decimals).replace(/\s/g, "").replace(",", "."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decimals]);

  useEffect(() => {
    // shortDeadline vient de useShortDeadlineMode, résolu de façon
    // asynchrone après le montage (voir ce hook) : même raison que
    // ci-dessus, pas une valeur dérivable au rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCancellingDate(shortDeadline ? unixToDateTimeInput(tx.transactionCancellingDate) : unixToDateInput(tx.transactionCancellingDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortDeadline]);

  useEffect(() => {
    if (isSuccess) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const totalAmountParsed = totalAmountInput ? parseAmountInput(totalAmountInput, decimals) : 0n;
  const isFreeModel = model === TransactionModel.Free;
  /**
   * Idem que sur le formulaire de création : pour PartialLocked/
   * PartialImmediate, le contrat applique lui-même un pourcentage à
   * `advanceAmount` reçu, donc on lui transmet le montant total (et non le
   * montant déjà calculé) pour que l'acompte stocké corresponde exactement
   * à ce qui est affiché.
   */
  const autoAdvanceAmount = estimateAdvanceAmount(model, totalAmountParsed);
  /**
   * Recalculé à chaque frappe : pure estimation en temps réel, le montant
   * qui fait foi n'étant calculé qu'à la double signature (voir
   * TransactionSummary).
   */
  const { feesAmount: feesEstimate } = estimateFees(totalAmountParsed, feesRateBps, minFeesAmount);
  const myTurn = isCurrentEditor(tx, role);
  const containerReferenceValid = CONTAINER_REFERENCE_PATTERN.test(containerReference);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!myTurn || !meridianAddress) return;
    if (role === "seller" && !containerReferenceValid) return;
    const details = {
      currency,
      transactionCondition: condition,
      transactionModel: model,
      advancePaymentMode: tx.advancePaymentMode,
      advanceAmount: isFreeModel ? parseAmountInput(advanceAmountInput, decimals) : totalAmountParsed,
      totalAmount: totalAmountParsed,
      transactionCancellingDate: shortDeadline ? dateTimeInputToUnix(cancellingDate) : dateInputToUnix(cancellingDate),
    };

    if (role === "seller") {
      await execute({
        address: meridianAddress,
        abi: meridianAbi,
        functionName: "saveTransactionDetailsSeller",
        args: [transactionId, containerReference, details],
      });
    } else {
      await execute({
        address: meridianAddress,
        abi: meridianAbi,
        functionName: "saveTransactionDetailsBuyer",
        args: [transactionId, details],
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{role === "seller" ? "Logistique & conditions" : "Conditions de la transaction"}</CardTitle>
      </CardHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {!myTurn && (
          <p className="text-sm text-subtle">
            En attente de la validation {role === "buyer" ? "du fournisseur" : "de l'acheteur"}
          </p>
        )}

        <fieldset disabled={!myTurn} className="contents">
        {role === "seller" && (
          <Field
            label="Référence conteneur *"
            error={
              !containerReference
                ? "Obligatoire pour la signature du contrat"
                : !containerReferenceValid
                  ? "Format invalide : 4 lettres suivies de 7 chiffres, collés (ex. MEDU1234567)"
                  : undefined
            }
          >
            <input
              className="field-input font-mono-tight"
              placeholder=""
              value={containerReference}
              onChange={(e) => setContainerReference(e.target.value)}
              required
            />
          </Field>
        )}

        <Field label="Modèle de paiement">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Devise">
            <select className="field-select" value={currency} onChange={(e) => setCurrency(Number(e.target.value) as Currency)}>
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
            <select className="field-select" value={condition} onChange={(e) => setCondition(Number(e.target.value) as TransactionCondition)}>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            label={`Montant total (${symbol || "…"})`}
            hint={!tx.feesPaid && feesEstimate > 0n ? `~ ${formatAmount(feesEstimate, decimals)} ${symbol} de frais de service*` : undefined}
          >
            <input className="field-input" inputMode="decimal" value={totalAmountInput} onChange={(e) => setTotalAmountInput(e.target.value)} required />
          </Field>
          <Field
            label={`Montant de l'acompte (${symbol || "…"})`}
            hint={isFreeModel ? undefined : `Calculé automatiquement (${transactionModelLabels[model].toLowerCase()}).`}
          >
            <input
              className="field-input"
              inputMode="decimal"
              value={isFreeModel ? advanceAmountInput : formatAmount(autoAdvanceAmount, decimals)}
              onChange={(e) => setAdvanceAmountInput(e.target.value)}
              disabled={!isFreeModel}
              readOnly={!isFreeModel}
            />
          </Field>
          <Field label="Échéance d'annulation" hint={shortDeadline ? "Mode échéance courte activé (voir Outils de test)." : undefined}>
            <input
              className="field-input"
              type={shortDeadline ? "datetime-local" : "date"}
              value={cancellingDate}
              onChange={(e) => setCancellingDate(e.target.value)}
              required
            />
          </Field>
        </div>

        {!tx.feesPaid && feesEstimate > 0n && <FeesExplainerNote />}

        <p className="text-xs text-subtle">Toute modification enregistrée réinitialise les deux signatures : acheteur et fournisseur devront re-signer.</p>

        <TxStatusLine stage={stage} error={error} />

        <Button
          type="submit"
          variant="secondary"
          disabled={role === "seller" && !containerReferenceValid}
          loading={stage === "signing" || stage === "confirming"}
        >
          Enregistrer
        </Button>
        </fieldset>
      </form>
    </Card>
  );
}
