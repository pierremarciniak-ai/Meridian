import {
  AdvancePaymentMode,
  ContainerPositionStatus,
  Currency,
  TransactionCondition,
  TransactionModel,
  UserType,
  WorkflowStatus,
} from "@/lib/domain/enums";

export type OnChainUser = {
  userType: UserType;
  userAddress: `0x${string}`;
};

// Miroir exact du struct Transaction dans InternalFunctions.sol — mêmes
// champs, peu importe l'ordre (viem retourne un objet nommé, pas un tuple
// positionnel).
export type OnChainTransaction = {
  workflowStatus: WorkflowStatus;
  currency: Currency;
  transactionCondition: TransactionCondition;
  transactionModel: TransactionModel;
  advancePaymentMode: AdvancePaymentMode;
  containerPositionStatus: ContainerPositionStatus;
  // Seule cette partie (buyer ou seller) peut actuellement modifier les
  // détails ou signer — voir signTransaction/saveTransactionDetails* dans
  // InternalFunctions.sol/Meridian.sol. Ne change qu'à la signature, jamais
  // à une simple sauvegarde de détails.
  currentEditor: UserType;
  signedByBuyer: boolean;
  signedBySeller: boolean;
  depositCompleted: boolean;
  partialWithdrawalCompleted: boolean;
  withdrawalCompleted: boolean;
  totalAmountRefunded: boolean;
  partialAmountRefunded: boolean;
  buyerNFTMinted: boolean;
  sellerNFTMinted: boolean;
  // Distinguent un TransactionAborted causé par une sanction détectée à la
  // signature ou au retrait, d'un abandon simplement dû à l'échéance
  // dépassée (ni l'un ni l'autre) — voir _signTransaction/withdrawFunds.
  buyerSanctioned: boolean;
  sellerSanctioned: boolean;
  buyer: OnChainUser;
  seller: OnChainUser;
  // uint40 côté contrat : viem décode les entiers qui tiennent sûrement dans
  // un Number (<= 48 bits) en `number`, pas en `bigint` — contrairement aux
  // montants ci-dessous (uint128, toujours bigint). Vérifié empiriquement :
  // c'est ce qui causait "Cannot mix BigInt and other types" dans
  // TimeTravelPanel avant ce correctif.
  transactionCancellingDate: number;
  advanceAmount: bigint;
  totalAmount: bigint;
  depositedAmount: bigint;
  pendingWithdrawalAmount: bigint;
  refundAmount: bigint;
  billNumber: string;
  containerReference: string;
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

// Miroir client de la garde currentEditor dans signTransaction /
// saveTransactionDetailsSeller / saveTransactionDetailsBuyer : permet de
// désactiver l'édition/la signature côté UI plutôt que de laisser
// l'utilisateur remplir un formulaire pour se prendre un revert.
export function isCurrentEditor(tx: Pick<OnChainTransaction, "currentEditor">, role: "buyer" | "seller" | null): boolean {
  if (!role) return false;
  return (role === "buyer" && tx.currentEditor === UserType.Buyer) || (role === "seller" && tx.currentEditor === UserType.Seller);
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

// Miroir client de la condition sur containerPositionStatus dans
// withdrawFunds : permet d'afficher pourquoi le retrait est bloqué avant
// d'attendre un revert on-chain. Quand AdvancePaymentMode = Immediate, le
// contrat ignore containerPositionStatus — mais seulement pour le tout
// premier retrait : dès que partialWithdrawalCompleted est déjà à true (un
// retrait a déjà eu lieu), le reliquat retombe sous la même condition que
// Deferred — voir withdrawFunds dans Meridian.sol.
export function isContainerPositionSufficientForWithdrawal(tx: OnChainTransaction): boolean {
  if (tx.advancePaymentMode === AdvancePaymentMode.Immediate && !tx.partialWithdrawalCompleted) return true;
  if (tx.transactionCondition === TransactionCondition.AtTheBeginningOfDelivery) {
    return (
      tx.containerPositionStatus === ContainerPositionStatus.InTransit ||
      tx.containerPositionStatus === ContainerPositionStatus.AtDestination
    );
  }
  return tx.containerPositionStatus === ContainerPositionStatus.AtDestination;
}

// rollbackDeposit rembourse pendingWithdrawalAmount (pas depositedAmount,
// qui inclut aussi ce que le fournisseur a déjà retiré) et le remet à 0 :
// sa disponibilité se résume donc à "il reste un montant non retiré".
export function canRollbackDeposit(tx: OnChainTransaction): boolean {
  return tx.pendingWithdrawalAmount > 0n;
}

// Miroir client de checkAbortedStatus : le contrat ne fait cette transition
// que paresseusement, en effet de bord du prochain appel à une fonction
// gardée (depositFunds, rollbackDeposit...). Tant que personne ne l'a
// déclenchée, workflowStatus reste affiché "Signed" en storage même après
// l'échéance — sans ce miroir, le bouton de rollback resterait invisible
// pour l'acheteur alors que l'appel réussirait déjà on-chain.
export function isTransactionOverdue(tx: Pick<OnChainTransaction, "transactionCancellingDate">): boolean {
  return Math.floor(Date.now() / 1000) >= tx.transactionCancellingDate;
}
