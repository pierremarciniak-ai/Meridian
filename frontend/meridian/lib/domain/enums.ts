// Ordre strictement identique aux enums Solidity de InternalFunctions.sol —
// la position numérique est ce qui est encodé on-chain (uint8).

export enum WorkflowStatus {
  Unset = 0,
  Initialized = 1,
  Created = 2,
  Signed = 3,
  Finished = 4,
  Aborted = 5,
}

export enum Currency {
  USDC = 0,
  USDT = 1,
  EURC = 2,
}

export enum TransactionCondition {
  AtTheBeginningOfDelivery = 0,
  AtTheEndOfDelivery = 1,
}

export enum TransactionModel {
  FullLocked = 0,
  PartialLocked = 1,
  PartialImmediate = 2,
  Free = 3,
}

export enum AdvancePaymentMode {
  Immediate = 0,
  Deferred = 1,
}

export enum UserType {
  Buyer = 0,
  Seller = 1,
}

export enum ContainerPositionStatus {
  UnSet = 0,
  InTransit = 1,
  AtDestination = 2,
}

export const currencyLabels: Record<Currency, string> = {
  [Currency.USDC]: "USDC",
  [Currency.USDT]: "USDT",
  [Currency.EURC]: "EURC",
};

export const workflowStatusLabels: Record<WorkflowStatus, string> = {
  [WorkflowStatus.Unset]: "Inconnu",
  [WorkflowStatus.Initialized]: "Initié",
  [WorkflowStatus.Created]: "Accepté par le fournisseur",
  [WorkflowStatus.Signed]: "Signé",
  [WorkflowStatus.Finished]: "Soldé",
  [WorkflowStatus.Aborted]: "Abandonné",
};

export const transactionConditionLabels: Record<TransactionCondition, string> = {
  [TransactionCondition.AtTheBeginningOfDelivery]: "Au départ de la livraison",
  [TransactionCondition.AtTheEndOfDelivery]: "À réception de la livraison",
};

export const transactionModelLabels: Record<TransactionModel, string> = {
  [TransactionModel.FullLocked]: "Paiement total bloqué",
  [TransactionModel.PartialLocked]: "Acompte bloqué (30%)",
  [TransactionModel.PartialImmediate]: "Acompte immédiat (15%)",
  [TransactionModel.Free]: "Libre",
};

export const transactionModelHints: Record<TransactionModel, string> = {
  [TransactionModel.FullLocked]: "L'intégralité du montant est déposée en une fois, avant l'expédition.",
  [TransactionModel.PartialLocked]: "30% du montant saisi est exigé comme acompte, à solder avant l'échéance.",
  [TransactionModel.PartialImmediate]: "15% du montant saisi est exigé comme acompte, versé immédiatement.",
  [TransactionModel.Free]: "Montant et échéancier libres, à la discrétion des deux parties.",
};

export const advancePaymentModeLabels: Record<AdvancePaymentMode, string> = {
  [AdvancePaymentMode.Immediate]: "Immédiat",
  [AdvancePaymentMode.Deferred]: "Différé",
};

export const userTypeLabels: Record<UserType, string> = {
  [UserType.Buyer]: "Acheteur",
  [UserType.Seller]: "Fournisseur",
};

export const containerPositionStatusLabels: Record<ContainerPositionStatus, string> = {
  [ContainerPositionStatus.UnSet]: "Non renseignée",
  [ContainerPositionStatus.InTransit]: "En cours de transport",
  [ContainerPositionStatus.AtDestination]: "Arrivé à destination",
};
