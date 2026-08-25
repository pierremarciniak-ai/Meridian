/**
 * Enums miroirs de InternalFunctions.sol — ordre strictement identique aux
 * enums Solidity, la position numérique étant ce qui est encodé on-chain
 * (uint8).
 */

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
  [TransactionCondition.AtTheBeginningOfDelivery]: "Départ du bateau",
  [TransactionCondition.AtTheEndOfDelivery]: "Arrivée du bateau",
};

export const transactionModelLabels: Record<TransactionModel, string> = {
  [TransactionModel.FullLocked]: "Paiement avec provision 100%",
  [TransactionModel.PartialLocked]: "Paiement avec provision 30%",
  [TransactionModel.PartialImmediate]: "Paiement anticipé 15%",
  [TransactionModel.Free]: "Paiement libre",
};

export const transactionModelHints: Record<TransactionModel, string> = {
  [TransactionModel.FullLocked]: "Provision déposée à 100% en une fois",
  [TransactionModel.PartialLocked]: "Provision déposée à 30%, reste du solde à l'échéance",
  [TransactionModel.PartialImmediate]: "15% du montant total payé à la signature du contrat, reste du solde à l'échéance",
  [TransactionModel.Free]: "Choix des montants et paiement anticipé / provision libre",
};

export const advancePaymentModeLabels: Record<AdvancePaymentMode, string> = {
  [AdvancePaymentMode.Immediate]: "Paiement anticipé à la signature du contrat",
  [AdvancePaymentMode.Deferred]: "Provision à la signature du contrat",
};

export const userTypeLabels: Record<UserType, string> = {
  [UserType.Buyer]: "Acheteur",
  [UserType.Seller]: "Fournisseur",
};

export const containerPositionStatusLabels: Record<ContainerPositionStatus, string> = {
  [ContainerPositionStatus.UnSet]: "N/A",
  [ContainerPositionStatus.InTransit]: "Départ confirmé",
  [ContainerPositionStatus.AtDestination]: "Arrivée confirmée",
};
