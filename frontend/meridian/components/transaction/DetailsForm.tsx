"use client";

import { type FormEvent, useEffect, useState } from "react";
import { TxStatusLine } from "@/components/TxStatusLine";
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
import { dateInputToUnix, formatAmount, parseAmountInput, unixToDateInput } from "@/lib/domain/format";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { estimateAdvanceAmount } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Meta } from "@/hooks/useErc20";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { meridianAddress, tokenAddresses } from "@/lib/web3/contracts";

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
  const [departureDate, setDepartureDate] = useState(unixToDateInput(tx.sellerDepartureDate));
  const [arrivalDate, setArrivalDate] = useState(unixToDateInput(tx.sellerArrivalDate));
  const [containerReference, setContainerReference] = useState(tx.containerReference);

  const { decimals, symbol } = useErc20Meta(tokenAddresses[currency]);
  const { execute, stage, error, isSuccess } = useContractAction();

  useEffect(() => {
    setTotalAmountInput(formatAmount(tx.totalAmount, decimals).replace(/\s/g, "").replace(",", "."));
    setAdvanceAmountInput(formatAmount(tx.advanceAmount, decimals).replace(/\s/g, "").replace(",", "."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decimals]);

  useEffect(() => {
    if (isSuccess) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const totalAmountParsed = totalAmountInput ? parseAmountInput(totalAmountInput, decimals) : 0n;
  const isFreeModel = model === TransactionModel.Free;
  // Idem que sur le formulaire de création : pour PartialLocked/PartialImmediate
  // le contrat applique lui-même un pourcentage à l'advanceAmount reçu, donc on
  // lui transmet le montant total (et non le montant déjà calculé) pour que
  // l'acompte stocké corresponde exactement à ce qui est affiché.
  const autoAdvanceAmount = estimateAdvanceAmount(model, totalAmountParsed);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const details = {
      currency,
      transactionCondition: condition,
      transactionModel: model,
      advancePaymentMode: tx.advancePaymentMode,
      advanceAmount: isFreeModel ? parseAmountInput(advanceAmountInput, decimals) : totalAmountParsed,
      totalAmount: totalAmountParsed,
      transactionCancellingDate: dateInputToUnix(cancellingDate),
    };

    if (role === "seller") {
      await execute({
        address: meridianAddress,
        abi: meridianAbi,
        functionName: "saveTransactionDetailsSeller",
        args: [
          transactionId,
          {
            departureDate: dateInputToUnix(departureDate),
            arrivalDate: dateInputToUnix(arrivalDate),
            containerReference,
          },
          details,
        ],
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
        {role === "seller" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Date de départ">
              <input className="field-input" type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} required />
            </Field>
            <Field label="Date d'arrivée">
              <input className="field-input" type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} required />
            </Field>
            <Field label="Référence conteneur">
              <input
                className="field-input font-mono-tight"
                value={containerReference}
                onChange={(e) => setContainerReference(e.target.value)}
                required
              />
            </Field>
          </div>
        )}

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={`Montant total (${symbol || "…"})`}>
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
          <Field label="Échéance d'annulation">
            <input className="field-input" type="date" value={cancellingDate} onChange={(e) => setCancellingDate(e.target.value)} required />
          </Field>
        </div>

        <p className="text-xs text-subtle">Toute modification enregistrée réinitialise les deux signatures : acheteur et fournisseur devront re-signer.</p>

        <TxStatusLine stage={stage} error={error} />

        <Button type="submit" variant="secondary" loading={stage === "signing" || stage === "confirming"}>
          Enregistrer
        </Button>
      </form>
    </Card>
  );
}
