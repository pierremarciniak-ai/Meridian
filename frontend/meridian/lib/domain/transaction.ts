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
  // Frais de service : prélevés en une fois chez l'acheteur (100% du
  // montant) dès que les deux signatures sont réunies — voir checkSignatures
  // / transfertFeesFromBuyer dans InternalFunctions.sol, pas au dépôt.
  // feesAmount/netAmountDue sont figés à ce moment précis (donc fiables même
  // si le taux global feesRateBps change ensuite) ; tant que feesPaid vaut
  // false, ces deux champs valent encore 0 et toute valeur affichée ailleurs
  // n'est qu'une estimation (voir estimateFees ci-dessous).
  feesPaid: boolean;
  // Frais réellement prélevés (== totalAmount * feesRateBps / 10000 au
  // moment de la signature, avec un plancher de 30 tokens dès que
  // feesRateBps > 0, lui-même plafonné à totalAmount — voir MIN_FEES_AMOUNT
  // ci-dessous). 0 tant que feesPaid vaut false.
  feesAmount: bigint;
  // Montant net que l'acheteur doit effectivement déposer (totalAmount -
  // feesAmount/2, la part du fournisseur étant absorbée par cette réduction
  // plutôt que déduite séparément à son retrait) — c'est la vraie cible du
  // dépôt, pas totalAmount (voir estimateDepositAmount). Vaut encore 0 tant
  // que feesPaid est false (valeur par défaut du struct, calculée seulement
  // à la signature complète) : ne jamais l'utiliser comme cible de dépôt
  // avant ce moment, utiliser estimateFees à la place.
  netAmountDue: bigint;
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
// N'a de sens qu'une fois la transaction Signed (netAmountDue déjà calculé et
// advanceAmount déjà réduit de la part de frais du fournisseur, puis
// plafonné à netAmountDue, par transfertFeesFromBuyer — voir
// InternalFunctions.sol) — appelant garanti par tx.workflowStatus côté UI.
export function estimateDepositAmount(tx: OnChainTransaction): bigint {
  if (tx.transactionModel === TransactionModel.FullLocked) return tx.netAmountDue;
  if (tx.transactionModel === TransactionModel.Free && tx.advanceAmount === 0n) return tx.netAmountDue;
  if (tx.depositedAmount === 0n) return tx.advanceAmount;
  if (tx.depositedAmount > 0n && tx.depositedAmount < tx.netAmountDue) return tx.netAmountDue - tx.depositedAmount;
  return 0n;
}

// Plancher de frais appliqué par transfertFeesFromBuyer (InternalFunctions.sol)
// — 30 tokens exprimés dans la plus petite unité, comme totalAmount (6
// décimales pour USDC/USDT/EURC, les seules devises supportées).
const MIN_FEES_AMOUNT = 30_000_000n;

// Miroir client de la partie calcul de transfertFeesFromBuyer (pas le
// transfert lui-même) — sert à estimer en temps réel, avant que la
// transaction soit Signed, le montant des frais et le montant net qui en
// résultera pour un totalAmount et un feesRateBps donnés. Purement indicatif
// tant que la transaction n'est pas Signed : le calcul qui fait foi
// s'exécute on-chain à la double signature, sur les valeurs alors en
// vigueur. Une fois Signed, préférer tx.feesAmount/tx.netAmountDue (figés,
// fiables même si feesRateBps change depuis).
//
// Reproduit aussi le plafonnement à totalAmount fait côté contrat
// (transfertFeesFromBuyer) : sur une transaction dont totalAmount est
// inférieur au plancher, les frais affichés valent totalAmount (pas
// MIN_FEES_AMOUNT) — sinon netAmountDue (totalAmount - fees/2) s'afficherait
// négatif alors que la valeur on-chain réelle restera toujours positive.
export function estimateFees(totalAmount: bigint, feesRateBps: number): { feesAmount: bigint; netAmountDue: bigint } {
  let feesAmount = (totalAmount * BigInt(feesRateBps)) / 10000n;
  if (feesRateBps > 0 && feesAmount < MIN_FEES_AMOUNT) feesAmount = MIN_FEES_AMOUNT;
  if (feesAmount > totalAmount) feesAmount = totalAmount;
  return { feesAmount, netAmountDue: totalAmount - feesAmount / 2n };
}

// Miroir client de la condition sur containerPositionStatus dans
// withdrawFunds : permet d'afficher pourquoi le retrait est bloqué avant
// d'attendre un revert on-chain. Quand AdvancePaymentMode = Immediate, le
// contrat ignore containerPositionStatus — mais seulement pour le tout
// premier retrait : dès que partialWithdrawalCompleted est déjà à true (un
// retrait a déjà eu lieu), le reliquat retombe sous la même condition que
// Deferred — voir withdrawFunds dans Meridian.sol.
// `livePosition` permet d'évaluer la condition contre une position fraîche
// (attestation signée par l'oracle, pas encore appliquée on-chain) plutôt
// que la valeur potentiellement périmée stockée dans tx — voir
// useContainerPositionAttestation / WithdrawPanel.
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

// rollbackDeposit rembourse pendingWithdrawalAmount (pas depositedAmount,
// qui inclut aussi ce que le fournisseur a déjà retiré) et le remet à 0 :
// sa disponibilité se résume donc à "il reste un montant non retiré".
export function canRollbackDeposit(tx: OnChainTransaction): boolean {
  return tx.pendingWithdrawalAmount > 0n;
}

// Miroir client de la garde combinée dans withdrawFunds (montant en attente +
// position du conteneur) : indique si le fournisseur a réellement un retrait
// disponible maintenant, pas seulement un solde théorique — voir WithdrawPanel.
export function canWithdraw(tx: OnChainTransaction): boolean {
  return tx.pendingWithdrawalAmount > 0n && isContainerPositionSufficientForWithdrawal(tx);
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

// Miroir client exact de rollbackEligibilityStatus (InternalFunctions.sol).
// Contrairement à isTransactionOverdue seul, tient aussi compte de la
// position du conteneur : si elle satisfait déjà la condition de livraison
// convenue (le fournisseur a rempli sa part), le contrat refuse le rollback
// même une fois l'échéance dépassée — le retrait normal (withdrawFunds) est
// alors la seule voie. Sans ce miroir, le bouton de rollback resterait
// affiché côté acheteur dans des cas où l'appel on-chain reverterait.
// `livePosition` : même raison que sur isContainerPositionSufficientForWithdrawal.
export function isRollbackEligible(tx: OnChainTransaction, livePosition?: ContainerPositionStatus): boolean {
  if (tx.workflowStatus === WorkflowStatus.Aborted) return true;
  if (!isTransactionOverdue(tx)) return false;
  const containerPositionStatus = livePosition ?? tx.containerPositionStatus;
  if (tx.transactionCondition === TransactionCondition.AtTheBeginningOfDelivery) {
    return containerPositionStatus === ContainerPositionStatus.UnSet;
  }
  return containerPositionStatus !== ContainerPositionStatus.AtDestination;
}

// Reflète exactement les conditions d'affichage de DepositPanel/RollbackPanel
// (acheteur) et WithdrawPanel (fournisseur) dans TransactionDetail — sert à
// afficher une bulle "Action requise" dans la liste des contrats sans dupliquer
// la logique de gating propre à chaque panneau. `null` = rien à faire pour
// l'instant côté utilisateur connecté.
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

// Avancement du dépôt de l'acheteur — contrairement à pendingActionReason,
// indépendant du rôle : la même information ("où en est-on du versement")
// est utile aussi bien à l'acheteur qu'au fournisseur, donc pas de variante
// par rôle ici. `null` = rien n'a encore été déposé.
export function depositProgressStatus(tx: OnChainTransaction): "advance" | "full" | null {
  if (tx.workflowStatus !== WorkflowStatus.Signed) return null;
  if (tx.depositCompleted) return "full";
  if (tx.advanceAmount > 0n && tx.depositedAmount >= tx.advanceAmount) return "advance";
  return null;
}
