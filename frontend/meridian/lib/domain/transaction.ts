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

/**
 * Miroir exact du struct `Transaction` dans InternalFunctions.sol — mêmes
 * champs, peu importe l'ordre (viem retourne un objet nommé, pas un tuple
 * positionnel).
 */
export type OnChainTransaction = {
  workflowStatus: WorkflowStatus;
  currency: Currency;
  transactionCondition: TransactionCondition;
  transactionModel: TransactionModel;
  advancePaymentMode: AdvancePaymentMode;
  containerPositionStatus: ContainerPositionStatus;
  /**
   * Partie actuellement autorisée à modifier les détails ou signer. Ne
   * change qu'à la signature, jamais à une simple sauvegarde de détails
   * (voir `signTransaction`/`saveTransactionDetails*` côté contrat).
   */
  currentEditor: UserType;
  signedByBuyer: boolean;
  signedBySeller: boolean;
  /**
   * Devient true dès que les deux signatures sont réunies (prélèvement des
   * frais chez l'acheteur — voir `transfertFeesFromBuyer`). Tant que false,
   * `feesAmount`/`netAmountDue` valent encore 0 : toute valeur affichée
   * ailleurs n'est qu'une estimation (voir `estimateFees`).
   */
  feesPaid: boolean;
  /** Frais réellement prélevés, figés à la signature. 0 tant que `feesPaid` est false. */
  feesAmount: bigint;
  /**
   * Montant net que l'acheteur doit effectivement déposer (`totalAmount` -
   * `feesAmount`/2, la part du fournisseur étant absorbée par cette
   * réduction plutôt que déduite séparément à son retrait). Vaut encore 0
   * tant que `feesPaid` est false : utiliser `estimateFees` avant ce moment.
   */
  netAmountDue: bigint;
  depositCompleted: boolean;
  partialWithdrawalCompleted: boolean;
  withdrawalCompleted: boolean;
  totalAmountRefunded: boolean;
  partialAmountRefunded: boolean;
  buyerNFTMinted: boolean;
  sellerNFTMinted: boolean;
  /** Distinguent un abandon causé par une sanction d'un abandon simplement dû à l'échéance dépassée. */
  buyerSanctioned: boolean;
  sellerSanctioned: boolean;
  buyer: OnChainUser;
  seller: OnChainUser;
  /**
   * `uint40` côté contrat : viem décode les entiers qui tiennent sûrement
   * dans un `Number` (<= 48 bits) en `number`, pas en `bigint` —
   * contrairement aux montants ci-dessous (`uint128`, toujours `bigint`).
   */
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

/** Compare deux adresses sans tenir compte de la casse. */
export function sameAddress(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function transactionExists(tx: Pick<OnChainTransaction, "workflowStatus">): boolean {
  return tx.workflowStatus !== WorkflowStatus.Unset;
}

export function hasSeller(tx: Pick<OnChainTransaction, "seller">): boolean {
  return !sameAddress(tx.seller.userAddress, ZERO_ADDRESS);
}

/**
 * Miroir client de la garde `currentEditor` (signature/sauvegarde des
 * détails) : permet de désactiver l'action côté UI plutôt que de laisser
 * l'utilisateur se prendre un revert.
 */
export function isCurrentEditor(tx: Pick<OnChainTransaction, "currentEditor">, role: "buyer" | "seller" | null): boolean {
  if (!role) return false;
  return (role === "buyer" && tx.currentEditor === UserType.Buyer) || (role === "seller" && tx.currentEditor === UserType.Seller);
}

/** Miroir client (estimation d'affichage) de `calculateAdvanceAmount` — la valeur qui fait foi est calculée on-chain. */
export function estimateAdvanceAmount(model: TransactionModel, partialAmount: bigint): bigint {
  if (model === TransactionModel.PartialLocked) return (partialAmount * 30n) / 100n;
  if (model === TransactionModel.PartialImmediate) return (partialAmount * 15n) / 100n;
  if (model === TransactionModel.FullLocked) return 0n;
  return partialAmount;
}

/** Miroir client de `calculateAdvancePaymentMode`. */
export function estimateAdvancePaymentMode(model: TransactionModel, requested: AdvancePaymentMode): AdvancePaymentMode {
  if (model === TransactionModel.FullLocked || model === TransactionModel.PartialLocked) return AdvancePaymentMode.Deferred;
  if (model === TransactionModel.PartialImmediate) return AdvancePaymentMode.Immediate;
  return requested;
}

/**
 * Miroir client de `calculateDepositAmount` — montant du prochain dépôt
 * attendu. N'a de sens qu'une fois la transaction Signed (`netAmountDue` et
 * `advanceAmount` déjà calculés par `transfertFeesFromBuyer`).
 */
export function estimateDepositAmount(tx: OnChainTransaction): bigint {
  if (tx.transactionModel === TransactionModel.FullLocked) return tx.netAmountDue;
  if (tx.transactionModel === TransactionModel.Free && tx.advanceAmount === 0n) return tx.netAmountDue;
  if (tx.depositedAmount === 0n) return tx.advanceAmount;
  if (tx.depositedAmount > 0n && tx.depositedAmount < tx.netAmountDue) return tx.netAmountDue - tx.depositedAmount;
  return 0n;
}

/**
 * Miroir client du calcul de `transfertFeesFromBuyer` (pas le transfert
 * lui-même) — estime en temps réel, avant la double signature, le montant
 * des frais et le montant net qui en résultera. Purement indicatif : une
 * fois Signed, préférer `tx.feesAmount`/`tx.netAmountDue` (figés, fiables
 * même si `feesRateBps`/`minFeesAmount` changent depuis). `minFeesAmount`
 * vient de `useMinFeesAmount` (configurable via `setMinimumFeesAmount`, plus
 * une constante fixe) : le plancher s'applique dès que le taux est non nul,
 * sans exception même au-delà de `totalAmount` sur une très petite
 * transaction ; `netAmountDue` est alors clampé à 0 plutôt que de réduire
 * les frais (même logique que côté contrat).
 */
export function estimateFees(
  totalAmount: bigint,
  feesRateBps: number,
  minFeesAmount: bigint
): { feesAmount: bigint; netAmountDue: bigint } {
  let feesAmount = (totalAmount * BigInt(feesRateBps)) / 10000n;
  if (feesRateBps > 0 && feesAmount < minFeesAmount) feesAmount = minFeesAmount;
  const halfFees = feesAmount / 2n;
  const netAmountDue = totalAmount > halfFees ? totalAmount - halfFees : 0n;
  return { feesAmount, netAmountDue };
}

/**
 * Miroir client de la condition de position dans `withdrawFunds` — permet
 * d'afficher pourquoi le retrait est bloqué avant d'attendre un revert
 * on-chain. En `AdvancePaymentMode.Immediate`, seul le tout premier retrait
 * ignore la position du conteneur ; le reliquat retombe ensuite sous la même
 * condition qu'en `Deferred`. `livePosition` permet d'évaluer contre une
 * attestation fraîche (signée par l'oracle, pas encore appliquée on-chain)
 * plutôt que la valeur potentiellement périmée stockée dans `tx`.
 */
export function isContainerPositionSufficientForWithdrawal(
  tx: OnChainTransaction,
  livePosition?: ContainerPositionStatus
): boolean {
  if (tx.advancePaymentMode === AdvancePaymentMode.Immediate && !tx.partialWithdrawalCompleted) return true;
  const containerPositionStatus = livePosition ?? tx.containerPositionStatus;
  if (tx.transactionCondition === TransactionCondition.AtTheBeginningOfDelivery) {
    return (
      containerPositionStatus === ContainerPositionStatus.InTransit ||
      containerPositionStatus === ContainerPositionStatus.AtDestination
    );
  }
  return containerPositionStatus === ContainerPositionStatus.AtDestination;
}

/**
 * `rollbackDeposit` rembourse `pendingWithdrawalAmount` (pas
 * `depositedAmount`, qui inclut aussi ce que le fournisseur a déjà retiré) :
 * sa disponibilité se résume donc à "il reste un montant non retiré".
 */
export function canRollbackDeposit(tx: OnChainTransaction): boolean {
  return tx.pendingWithdrawalAmount > 0n;
}

/** Indique si le fournisseur a réellement un retrait disponible maintenant, pas seulement un solde théorique. */
export function canWithdraw(tx: OnChainTransaction): boolean {
  return tx.pendingWithdrawalAmount > 0n && isContainerPositionSufficientForWithdrawal(tx);
}

/**
 * Miroir client de l'abandon différé pour échéance dépassée : le contrat ne
 * fait cette transition que paresseusement, en effet de bord du prochain
 * appel à une fonction gardée. Sans ce miroir, `workflowStatus` reste
 * affiché "Signed" après l'échéance alors que l'action réussirait déjà
 * on-chain.
 */
export function isTransactionOverdue(tx: Pick<OnChainTransaction, "transactionCancellingDate">): boolean {
  return Math.floor(Date.now() / 1000) >= tx.transactionCancellingDate;
}

/**
 * Miroir client exact de `rollbackEligibilityStatus`. Contrairement à
 * `isTransactionOverdue` seul, tient aussi compte de la position du
 * conteneur : si elle satisfait déjà la condition de livraison convenue, le
 * contrat refuse le rollback même après l'échéance — seul le retrait normal
 * reste possible. `livePosition` : même raison que sur
 * `isContainerPositionSufficientForWithdrawal`.
 */
export function isRollbackEligible(tx: OnChainTransaction, livePosition?: ContainerPositionStatus): boolean {
  if (tx.workflowStatus === WorkflowStatus.Aborted) return true;
  if (!isTransactionOverdue(tx)) return false;
  const containerPositionStatus = livePosition ?? tx.containerPositionStatus;
  if (tx.transactionCondition === TransactionCondition.AtTheBeginningOfDelivery) {
    return containerPositionStatus === ContainerPositionStatus.UnSet;
  }
  return containerPositionStatus !== ContainerPositionStatus.AtDestination;
}

/**
 * Reflète les conditions d'affichage de DepositPanel/RollbackPanel
 * (acheteur) et WithdrawPanel (fournisseur), pour la bulle "Action requise"
 * de la liste des contrats — sans dupliquer la logique de gating propre à
 * chaque panneau. `null` = rien à faire pour l'instant.
 */
export function pendingActionReason(tx: OnChainTransaction, role: "buyer" | "seller" | null): "deposit" | "rollback" | "withdraw" | null {
  if (tx.workflowStatus !== WorkflowStatus.Signed && tx.workflowStatus !== WorkflowStatus.Aborted) return null;

  if (role === "buyer") {
    const rollbackAvailable = canRollbackDeposit(tx) && isRollbackEligible(tx);
    if (rollbackAvailable) return "rollback";
    if (tx.workflowStatus === WorkflowStatus.Signed && !tx.depositCompleted) return "deposit";
    return null;
  }

  if (role === "seller") {
    return tx.workflowStatus === WorkflowStatus.Signed && canWithdraw(tx) ? "withdraw" : null;
  }

  return null;
}

/**
 * Avancement du dépôt de l'acheteur, indépendant du rôle (utile à
 * l'acheteur comme au fournisseur). `null` = rien n'a encore été déposé.
 */
export function depositProgressStatus(tx: OnChainTransaction): "advance" | "full" | null {
  if (tx.workflowStatus !== WorkflowStatus.Signed) return null;
  if (tx.depositCompleted) return "full";
  if (tx.advanceAmount > 0n && tx.depositedAmount >= tx.advanceAmount) return "advance";
  return null;
}
