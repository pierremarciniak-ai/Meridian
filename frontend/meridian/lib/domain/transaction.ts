import { AdvancePaymentMode, Currency, TransactionCondition, TransactionModel, UserType, WorkflowStatus } from "@/lib/domain/enums";

export type OnChainUser = {
  userType: UserType;
  userAddress: `0x${string}`;
  isSubjectedToSanctions: boolean;
};

export type OnChainTransaction = {
  workflowStatus: WorkflowStatus;
  billNumber: string;
  buyer: OnChainUser;
  seller: OnChainUser;
  currency: Currency;
  transactionCondition: TransactionCondition;
  transactionModel: TransactionModel;
  advancePaymentMode: AdvancePaymentMode;
  advanceAmount: bigint;
  totalAmount: bigint;
  transactionCancellingDate: bigint;
  sellerDepartureDate: bigint;
  sellerArrivalDate: bigint;
  containerReference: string;
  signedByBuyer: boolean;
  signedBySeller: boolean;
  billHash: `0x${string}`;
  depositedAmount: bigint;
  pendingWithdrawalAmount: bigint;
  depositCompleted: boolean;
  withdrawalCompleted: boolean;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function sameAddress(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function transactionExists(tx: Pick<OnChainTransaction, "workflowStatus">): boolean {
  return tx.workflowStatus !== WorkflowStatus.Unset;
}

export function hasSeller(tx: Pick<OnChainTransaction, "seller">): boolean {
  return !sameAddress(tx.seller.userAddress, ZERO_ADDRESS);
}

// Miroir client (estimation d'affichage uniquement) de calculateAdvanceAmount
// dans InternalFunctions.sol — la valeur qui fait foi reste celle calculée
// on-chain lors de l'appel réel.
export function estimateAdvanceAmount(model: TransactionModel, partialAmount: bigint): bigint {
  if (model === TransactionModel.PartialLocked) return (partialAmount * 30n) / 100n;
  if (model === TransactionModel.PartialImmediate) return (partialAmount * 15n) / 100n;
  if (model === TransactionModel.FullLocked) return 0n;
  return partialAmount;
}

// Miroir client de calculateAdvancePaymentMode.
export function estimateAdvancePaymentMode(model: TransactionModel, requested: AdvancePaymentMode): AdvancePaymentMode {
  if (model === TransactionModel.FullLocked || model === TransactionModel.PartialLocked) return AdvancePaymentMode.Deferred;
  if (model === TransactionModel.PartialImmediate) return AdvancePaymentMode.Immediate;
  return requested;
}

// Miroir client de calculateDepositAmount — sert à afficher le montant du
// prochain dépôt attendu avant de déclencher l'approbation ERC20 + l'appel.
export function estimateDepositAmount(tx: OnChainTransaction): bigint {
  if (tx.transactionModel === TransactionModel.FullLocked) return tx.totalAmount;
  if (tx.transactionModel === TransactionModel.Free && tx.advanceAmount === 0n) return tx.totalAmount;
  if (tx.depositedAmount === 0n) return tx.advanceAmount;
  if (tx.depositedAmount > 0n && tx.depositedAmount < tx.totalAmount) return tx.totalAmount - tx.depositedAmount;
  return 0n;
}
