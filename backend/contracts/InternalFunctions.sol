// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface ISanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}

// Forme ABI attendue de MeridianNFT.sol : pas d'import direct du contrat
// (comme pour ISanctionsList ci-dessus), juste le shape nécessaire pour
// l'appeler via l'adresse stockée dans meridianNFTAddress.
//
// Les enums sont passés en uint8 bruts (même ordre que Currency /
// TransactionCondition / TransactionModel / AdvancePaymentMode ci-dessous)
// plutôt qu'en string déjà formatées : la conversion en libellés lisibles
// est faite côté MeridianNFT.sol, pas ici. Comme InternalFunctions est
// hérité (donc inliné) par Meridian, tout code ajouté ici alourdit
// directement le bytecode de Meridian — déjà proche de la limite EIP-170
// (24 576 bytes) — alors que MeridianNFT est un contrat séparé avec son
// propre budget.
interface IMeridianNFT {
    struct TransactionData {
        bytes32 transactionID;
        string billNumber;
        address buyer;
        address seller;
        uint8 currency;
        uint8 transactionCondition;
        uint8 transactionModel;
        uint8 advancePaymentMode;
        uint128 advanceAmount;
        uint128 totalAmount;
        uint40 transactionCancellingDate;
        string containerReference;
    }

    //function mintTransactionPair(TransactionData calldata data) external returns (uint256 buyerTokenId, uint256 sellerTokenId);
    function mintOne(address _to, TransactionData calldata _data) external returns (uint256 tokenId);
}

// Contrat abstrait : porte tout ce qui est "interne" au fonctionnement
// (types, storage, modifiers, events, et fonctions internal). Meridian.sol
// en hérite et n'expose que l'API destinée au front-end. `abstract` car ce
// contrat n'a pas vocation à être déployé seul (pas de fonctions externes).
abstract contract InternalFunctions is Ownable {
    using SafeCast for uint256;
    // Redéclaré ici pour la même raison que SafeCast ci-dessus : un
    // "using ... for" ne s'hérite pas, et applySignedContainerPosition /
    // withdrawFundsCore / rollbackDepositCore (dans ce fichier) en ont
    // besoin directement, pas seulement Meridian.sol.
    using SafeERC20 for IERC20;
    using MessageHashUtils for bytes32;
    using ECDSA for bytes32;

    // uint96 (et non uint256) pour que ce compteur se packe avec le
    // _owner (address, 20 bytes) hérité d'Ownable dans le même slot de
    // storage (20+12=32 bytes) au lieu d'occuper un slot dédié. uint96 max
    // ≈ 7,9×10^28 : aucune limite réaliste pour un compteur de transactions.
    uint96 public internalID;

    enum WorkflowStatus {
        UnSet,
        TransactionInitialized,
        TransactionCreated,
        TransactionSigned,
        TransactionCompleted,
        TransactionAborted
    }

    enum Currency {
        USDC,
        USDT,
        EURC
    }

    enum TransactionCondition {
        AtTheBeginningOfDelivery,
        AtTheEndOfDelivery
    }

    enum TransactionModel {
        FullLocked,
        PartialLocked,
        PartialImmediate,
        Free
    }

    enum AdvancePaymentMode {
        Immediate,
        Deferred
    }

    enum UserType {
        Buyer,
        Seller
    }

    enum ContainerPositionStatus {
        UnSet,
        InTransit,
        AtDestination
    }

    struct User {
        UserType userType;
        address userAddress;
    }

    // Champs réordonnés (par rapport à l'ordre "logique") pour maximiser le
    // packing de storage : Solidity ne packe que des champs value-type
    // consécutifs dans la déclaration, et un struct/string/array force
    // toujours un nouveau slot avant ET après lui. On regroupe donc tous les
    // enums/bools en tête (1 slot), les deux User ensuite (1 slot chacun,
    // déjà compacts en interne), puis les uint réduits (timestamp en
    // uint40, montants en uint128) group par group de 32 bytes, et les deux
    // string en tout dernier.
    struct Transaction {
        WorkflowStatus workflowStatus;
        Currency currency;
        TransactionCondition transactionCondition;
        TransactionModel transactionModel;
        AdvancePaymentMode advancePaymentMode;
        ContainerPositionStatus containerPositionStatus;
        UserType currentEditor;
        bool signedByBuyer;
        bool signedBySeller;
        bool depositCompleted;
        bool partialWithdrawalCompleted;
        bool withdrawalCompleted;
        bool totalAmountRefunded;
        bool partialAmountRefunded;
        bool buyerNFTMinted;
        bool sellerNFTMinted;
        // Distinguent la cause d'un TransactionAborted : sanction détectée
        // (ici) d'une échéance simplement dépassée (checkAbortedStatus, qui
        // ne touche à aucun des deux). Sans ça, le front ne peut pas savoir
        // pourquoi un dossier a été abandonné et affiche à tort le message
        // "échéance dépassée" même quand la vraie cause est une sanction.
        bool buyerSanctioned;
        bool sellerSanctioned;

        User buyer;
        User seller;

        // uint40 suffit très largement (valide jusqu'à l'an 36812).
        uint40 transactionCancellingDate;

        // Montants : uint128 suffit très largement pour des montants de
        // tokens (max ≈ 3,4×10^38, aucune stablecoin n'en approche). Les
        // paires ci-dessous remplissent chacune un slot de 32 bytes pile.
        uint128 advanceAmount;
        uint128 totalAmount;
        uint128 depositedAmount;
        uint128 pendingWithdrawalAmount;
        uint128 refundAmount;

        string billNumber;
        string containerReference;
        // uint creationDate;
        // uint signedDate;
        // uint cancellationDate;
        // uint completionDate;
    }

    // TransactionDetailsInput / ShipPosition restent volontairement en uint
    // (256) : ce sont des structs calldata-only,
    // jamais écrites en storage. L'encodage ABI/calldata word-aligne chaque
    // champ sur 32 bytes quelle que soit sa largeur déclarée, donc les
    // réduire n'apporterait aucun gain de gas ici, juste des casts en plus
    // au moment de les copier vers Transaction (uint128/uint40, voir
    // saveCommonTransactionDetails et Meridian.initializeTransaction).
    struct TransactionDetailsInput {
        Currency currency;
        TransactionCondition transactionCondition;
        TransactionModel transactionModel;
        AdvancePaymentMode advancePaymentMode;
        uint advanceAmount;
        uint totalAmount;
        uint transactionCancellingDate;
    }

    struct ShipPosition {
        uint latitude;
        uint longitude;
        uint timestamp;
    }

    //mapping (bytes32 => bool) public IDsUsed;
    mapping (bytes32 => Transaction) internal TransactionsList;
    //mapping (address => mapping(bytes32 => bool)) public UserTransactions;

    mapping (Currency => IERC20) public tokenAddresses;
    //mapping (address => mapping (Currency => uint)) public pendingWithdrawals;

    address public sanctionsOracleAddress;
    address public mockSanctionsOracleAddress;
    // Adresse zéro = minting désactivé (checkSignatures ne fait alors rien).
    address public meridianNFTAddress;
    // Adresse dédiée (contrôlée par le cron backend qui interroge l'API
    // VesselFinder), distincte du owner : VesselFinder n'expose aucun oracle
    // on-chain, donc c'est notre propre service qui pousse la donnée via
    // reportContainerPosition. Ne jamais alimenter containerPositionStatus
    // depuis un paramètre fourni par le vendeur (withdrawFunds) : il a
    // intérêt à mentir pour débloquer les fonds plus tôt.
    address public containerPositionOracleAddress;

    bool public mockSanctionsEnabled = true;
  
    mapping(address => bool) public isExempt;

    constructor() Ownable(msg.sender) {
        internalID = 0;
    }

    modifier onlyBuyer(bytes32 _transactionID) {
        require(msg.sender == TransactionsList[_transactionID].buyer.userAddress, "You're not the declared buyer");
        _;
    }

    modifier onlySeller(bytes32 _transactionID) {
        require(msg.sender == TransactionsList[_transactionID].seller.userAddress, "You're not the declared seller");
        _;
    }

    modifier onlyInitializedTransaction(bytes32 _transactionID) {
        require(TransactionsList[_transactionID].workflowStatus == WorkflowStatus.TransactionInitialized, "Transaction is initialized");
        _;
    }

    modifier onlyCreatedTransaction(bytes32 _transactionID) {
        require(TransactionsList[_transactionID].workflowStatus == WorkflowStatus.TransactionCreated, "Transaction already created or not initialized");
        _;
    }

    modifier onlySignedTransaction(bytes32 _transactionID) {
        require(TransactionsList[_transactionID].workflowStatus == WorkflowStatus.TransactionSigned, "Transaction is not signed");
        _;
    }

    modifier sellerInfosCompleted(bytes32 _transactionID) {
        require(bytes(TransactionsList[_transactionID].containerReference).length > 0, "Container reference cannot be empty");
        _;
    }

    // Comme transactionDateNotOverdue ci-dessous : abortIfOverdue est appelé
    // en premier pour laisser l'éventuelle transition vers TransactionAborted
    // se produire et persister. Le require qui suit ne peut alors revert que
    // dans les cas où abortIfOverdue n'a rien muté (date non dépassée et
    // statut pas déjà aborted), donc aucune écriture n'est jamais perdue.
    // modifier onlyAbortedTransaction(bytes32 _transactionID) {
    //     checkAbortedStatus(_transactionID);
    //     require(TransactionsList[_transactionID].workflowStatus == WorkflowStatus.TransactionAborted, "Transaction is not aborted");
    //     _;
    // }

    // checkWithdrawalEligibility et checkRollbackEligibility existaient ici
    // comme modifiers ; remplacés par des appels directs à
    // withdrawalEligibilityStatus / rollbackEligibilityStatus depuis
    // withdrawFundsCore / rollbackDepositCore (voir plus bas) : ces deux
    // actions ont désormais chacune deux points d'entrée externes
    // (withdrawFunds/withdrawFundsWithPositionUpdate,
    // rollbackDeposit/rollbackDepositWithPositionUpdate), et un modifier
    // attaché à deux fonctions dupliquerait son bytecode à chaque site
    // d'attache — un appel de fonction interne, non.

    // Contrairement aux autres modifiers, celui-ci ne fait volontairement PAS
    // de revert quand la condition échoue : un revert annulerait aussi le
    // passage à TransactionAborted qu'on veut justement persister. À la place,
    // si la date est dépassée, on met à jour le statut et on n'exécute pas le
    // `_;` (donc l'action demandée par l'appelant n'a pas lieu), mais la
    // transaction on-chain se termine normalement, avec l'écriture conservée.
    // modifier transactionDateNotOverdue(bytes32 _transactionID) {
    //     if (!checkAbortedStatus(_transactionID)) {
    //         _;
    //     }
    // }

    modifier onlyUnsanctioned(address _userAddress) {
        bool _sanctionned = checkSanction(_userAddress);
        if (_sanctionned) {
            revert AddressIsSanctioned(_userAddress);
        }
        _;
    }

    modifier onlyContainerPositionOracle() {
        require(msg.sender == containerPositionOracleAddress, "You're not the container position oracle");
        _;
    }

    event TransactionInitialized(bytes32 indexed transactionID, address indexed buyer);
    event TransactionCreated(bytes32 indexed transactionID, address indexed seller);
    event TransactionDetailsSaved(bytes32 indexed transactionID, UserType userType, address indexed userAddress);
    event TransactionSigned(bytes32 indexed transactionID, address indexed buyer, address indexed seller);
    event TransactionPartiallySigned(bytes32 indexed transactionID, UserType userType, address indexed userAddress);
    event FundsDeposited(bytes32 indexed transactionID, address indexed buyer, uint amount, Currency currency);
    event FundsWithdrawn(bytes32 indexed transactionID, address indexed seller, uint amount, Currency currency);
    event TransactionCompleted(bytes32 indexed transactionID, address indexed buyer, address indexed seller);
    event TransactionDateOverdue(bytes32 indexed transactionID, address indexed buyer, address indexed seller);
    event TransactionAborted(bytes32 indexed transactionID, address indexed buyer, address indexed seller);
    event totalAmountRefunded(bytes32 indexed transactionID, address indexed buyer, uint amount, Currency currency);
    event partialAmountRefunded(bytes32 indexed transactionID, address indexed buyer, uint amount, Currency currency);
    event AddressSanctioned(address indexed userAddress);
    // Émis quand l'appel à l'oracle échoue (pas de contrat à l'adresse
    // configurée, revert interne, panne...) : checkSanction traite alors
    // l'adresse comme NON sanctionnée pour ne pas bloquer la transaction
    // (voir checkSanction) — cet event permet de repérer une panne d'oracle
    // dans les logs, puisque le comportement on-chain ne la distingue sinon
    // pas d'une vérification qui a simplement conclu "non sanctionné".
    event SanctionsOracleCallFailed(address indexed userAddress);
    event SanctionsOracleAddressUpdated(address indexed newOracle);
    event MockSanctionsOracleAddressUpdated(address indexed newMockOracle);
    event MockSanctionsToggled(bool status);
    event ExemptAddressAdded(address indexed account);
    event ExemptAddressRemoved(address indexed account);
    event TokenAddressUpdated(Currency indexed currency, address indexed tokenAddress);
    event MeridianNFTAddressUpdated(address indexed newMeridianNFT);
    event TransactionNFTMinted(bytes32 indexed transactionID, UserType userType, address indexed userAddress, uint256 tokenId);
    event ContainerPositionOracleAddressUpdated(address indexed newOracle);
    event ContainerPositionReported(bytes32 indexed transactionID, ContainerPositionStatus status);
    event BuyerIsNowEditor(bytes32 indexed transactionID);
    event SellerIsNowEditor(bytes32 indexed transactionID);

    error AddressIsSanctioned(address accountAddress);

    function initializeUser(UserType _userType, address _userAddress) internal pure returns (User memory) {
        return User({
            userType: _userType,
            userAddress: _userAddress
        });
    }

    function calculateAdvanceAmount(TransactionModel _transactionModel, uint _partialAmount) internal pure returns (uint) {
        if (_transactionModel == TransactionModel.PartialLocked) {
            return (_partialAmount * 30) / 100;
        } else if (_transactionModel == TransactionModel.PartialImmediate) {
            return (_partialAmount * 15) / 100;
        } else if (_transactionModel == TransactionModel.FullLocked) {
            return 0;
        }
        return _partialAmount;
    }

    function calculateAdvancePaymentMode(TransactionModel _transactionModel, AdvancePaymentMode _requestedMode) internal pure
    returns (AdvancePaymentMode) {
        if (_transactionModel == TransactionModel.FullLocked || _transactionModel == TransactionModel.PartialLocked) {
            return AdvancePaymentMode.Deferred;
        } else if (_transactionModel == TransactionModel.PartialImmediate) {
            return AdvancePaymentMode.Immediate;
        }
        // Seul cas restant : TransactionModel.Free. Un retour inconditionnel
        // ici (plutôt qu'un 3e "else if") permet au compilateur de prouver
        // que la fonction retourne toujours une valeur sur tous les chemins.
        return _requestedMode;
    }

    function saveCommonTransactionDetails(bytes32 _transactionID, TransactionDetailsInput calldata _details) internal {
        require(_details.transactionCancellingDate >= block.timestamp, "Transaction cancelling date must be in the future");
        require(_details.totalAmount > 0, "Total amount must be greater than zero");

        Transaction storage _transaction = TransactionsList[_transactionID];

        if (_details.currency != _transaction.currency) {
            _transaction.currency = _details.currency;
        }
        if (_details.transactionCondition != _transaction.transactionCondition) {
            _transaction.transactionCondition = _details.transactionCondition;
        }
        if (_details.transactionModel != _transaction.transactionModel) {
            _transaction.transactionModel = _details.transactionModel;
            _transaction.advancePaymentMode = calculateAdvancePaymentMode(_transaction.transactionModel, _details.advancePaymentMode);
        }
        if (_details.transactionCancellingDate != _transaction.transactionCancellingDate) {
            _transaction.transactionCancellingDate = _details.transactionCancellingDate.toUint40();
        }
        if (_details.advanceAmount != _transaction.advanceAmount) {
            _transaction.advanceAmount = calculateAdvanceAmount(_details.transactionModel, _details.advanceAmount).toUint128();
        }
        if (_details.totalAmount != _transaction.totalAmount) {
            _transaction.totalAmount = _details.totalAmount.toUint128();
        }
    }

    function resetSignatures(bytes32 _transactionID) internal {
        Transaction storage _transaction = TransactionsList[_transactionID];
        _transaction.signedByBuyer = false;
        _transaction.signedBySeller = false;
    }

    function calculateDepositAmount(Transaction storage _transaction) internal view returns (uint128) {
        if (_transaction.transactionModel == TransactionModel.FullLocked) {
            return _transaction.totalAmount;
        } else if (_transaction.transactionModel == TransactionModel.Free && _transaction.advanceAmount == 0) {
            return _transaction.totalAmount;
        } else if (_transaction.depositedAmount == 0) {
            return _transaction.advanceAmount;
        } else if (_transaction.depositedAmount > 0 && _transaction.depositedAmount < _transaction.totalAmount) {
            return _transaction.totalAmount - _transaction.depositedAmount;
        } else {
            return 0;
        }
    }

    function signTransaction(bytes32 _transactionID, UserType _userType) internal {
        Transaction storage _transaction = TransactionsList[_transactionID];

        require(_userType == _transaction.currentEditor, "Only the current editor can sign the transaction");

        if (checkSanction(msg.sender)) {
            _transaction.workflowStatus = WorkflowStatus.TransactionAborted;
            if (_userType == UserType.Seller) {
                _transaction.sellerSanctioned = true;
            } else {
                _transaction.buyerSanctioned = true;
            }

            emit TransactionAborted(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
        } else {
            if (_userType == UserType.Seller) {
                _transaction.signedBySeller = true;
                _transaction.currentEditor = UserType.Buyer;

                emit BuyerIsNowEditor(_transactionID);                
            } else {
                _transaction.signedByBuyer = true;
                _transaction.currentEditor = UserType.Seller;

                emit SellerIsNowEditor(_transactionID);                  
            }

            emit TransactionPartiallySigned(_transactionID, _userType, msg.sender);
            checkSignatures(_transactionID);
        }
    }    

    function checkSignatures(bytes32 _transactionID) internal {
        Transaction storage _transaction = TransactionsList[_transactionID];

        if (_transaction.signedByBuyer && _transaction.signedBySeller) {
            _transaction.workflowStatus = WorkflowStatus.TransactionSigned;

            emit TransactionSigned(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
        }
    }

    // Construit les données et mint un NFT "reçu de transaction" pour
    // l'acheteur et un pour le vendeur. Appelé par
    // Meridian.mintTransactionNFTs (fonction externe séparée, appelée par le
    // front-end après la double signature) plutôt qu'automatiquement depuis
    // checkSignatures : garder ce code hors du chemin critique de signature
    // réduit le bytecode de Meridian, déjà proche de la limite EIP-170.
    function mintTransactionNFT(bytes32 _transactionID, address _to) internal returns (uint256 _tokenId) {
        Transaction storage _transaction = TransactionsList[_transactionID];

        // Champs assignés un par un plutôt qu'un seul struct literal nommé :
        // avec 12 champs, le literal fait "stack too deep" à la compilation
        // (codegen legacy, sans viaIR).
        IMeridianNFT.TransactionData memory _data;

        _data.transactionID = _transactionID;
        _data.billNumber = _transaction.billNumber;
        _data.buyer = _transaction.buyer.userAddress;
        _data.seller = _transaction.seller.userAddress;
        _data.currency = uint8(_transaction.currency);
        _data.transactionCondition = uint8(_transaction.transactionCondition);
        _data.transactionModel = uint8(_transaction.transactionModel);
        _data.advancePaymentMode = uint8(_transaction.advancePaymentMode);
        _data.advanceAmount = _transaction.advanceAmount;
        _data.totalAmount = _transaction.totalAmount;
        _data.transactionCancellingDate = _transaction.transactionCancellingDate;
        _data.containerReference = _transaction.containerReference;

        //IMeridianNFT(meridianNFTAddress).mintTransactionPair(_data);_mintOne
        _tokenId = IMeridianNFT(meridianNFTAddress).mintOne(_to, _data);
    }

    // Fonction partagée : applique l'abandon si la date est dépassée, et
    // retourne true si c'est le cas (permet au modifier ET à la fonction
    // publique checkAndAbortIfOverdue de réutiliser exactement la même
    // logique, sans duplication).
    // Convention : transactionCancellingDate correspond à minuit UTC du
    // *lendemain* du dernier jour valide (ex. "valide jusqu'au 15/09" ->
    // stocké comme le 16/09 à 00:00:00 UTC). La comparaison >= évite le
    // nombre magique "23:59:59" côté front et reste lisible : la transaction
    // expire dès que block.timestamp atteint ou dépasse cette date pivot.
    // function checkAbortedStatus(bytes32 _transactionID) internal returns (bool) {
    //     Transaction storage _transaction = TransactionsList[_transactionID];

    //     if (block.timestamp >= _transaction.transactionCancellingDate) {
    //         if (_transaction.workflowStatus != WorkflowStatus.TransactionAborted) {
    //             _transaction.workflowStatus = WorkflowStatus.TransactionAborted;
                
    //             emit TransactionDateOverdue(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
    //             emit TransactionAborted(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
    //         }
    //         return true;
    //     } else if (_transaction.workflowStatus == WorkflowStatus.TransactionAborted) {
    //         return true;
    //     } else {
    //         return false;
    //     }
    // }   

    function withdrawalEligibilityStatus(bytes32 _transactionID) internal view returns (bool _status) {
        Transaction storage _transaction = TransactionsList[_transactionID];

        require(_transaction.withdrawalCompleted == false, "Withdrawal already completed");
        require(_transaction.pendingWithdrawalAmount > 0, "No pending amount to withdraw");

        if (_transaction.advancePaymentMode == AdvancePaymentMode.Deferred || _transaction.partialWithdrawalCompleted) {
            if (_transaction.transactionCondition == TransactionCondition.AtTheBeginningOfDelivery) {
                require(_transaction.containerPositionStatus == ContainerPositionStatus.InTransit ||
                _transaction.containerPositionStatus == ContainerPositionStatus.AtDestination, "Container must be in transit or at destination for withdrawal");
            } else if (_transaction.transactionCondition == TransactionCondition.AtTheEndOfDelivery) {
                require(_transaction.containerPositionStatus == ContainerPositionStatus.AtDestination, "Container must be at destination for withdrawal");
            }
        }
        return true;
    }

    function rollbackEligibilityStatus(bytes32 _transactionID) internal returns (bool _status) {
        Transaction storage _transaction = TransactionsList[_transactionID];

        require(_transaction.pendingWithdrawalAmount > 0, "No pending amount to rollback");

        if (_transaction.workflowStatus == WorkflowStatus.TransactionAborted) {
            return true;
        } else if (block.timestamp >= _transaction.transactionCancellingDate) {

            if ((_transaction.transactionCondition == TransactionCondition.AtTheBeginningOfDelivery &&
            _transaction.containerPositionStatus == ContainerPositionStatus.UnSet) ||
            (_transaction.transactionCondition == TransactionCondition.AtTheEndOfDelivery &&
            _transaction.containerPositionStatus != ContainerPositionStatus.AtDestination)) {
                
                _transaction.workflowStatus = WorkflowStatus.TransactionAborted;

                emit TransactionAborted(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);

                return true;
            }
        }
        return false;
    }

    // Vérifie une attestation hors-chaîne signée par containerPositionOracleAddress
    // (voir app/api/container-position/sign côté front/backend) et met à jour
    // containerPositionStatus si elle est valide, avant que
    // withdrawFundsCore/rollbackDepositCore ne s'exécutent avec la valeur
    // fraîche. Objectif : l'oracle ne signe qu'un message (gratuit, hors
    // chaîne) au lieu d'envoyer lui-même reportContainerPosition — c'est
    // l'utilisateur (acheteur/vendeur), via withdrawFundsWithPositionUpdate /
    // rollbackDepositWithPositionUpdate, qui paie le gas de la mise à jour.
    // _deadline borne la durée de validité de la signature (anti-rejeu d'une
    // vieille attestation), et address(this) lie la signature à ce contrat
    // précis (anti-rejeu inter-contrats/inter-réseaux).
    function applySignedContainerPosition(
        bytes32 _transactionID,
        ContainerPositionStatus _status,
        uint256 _deadline,
        bytes calldata _signature
    ) internal {
        require(block.timestamp <= _deadline, "Container position signature expired");

        bytes32 _messageHash = keccak256(abi.encodePacked(_transactionID, _status, _deadline, address(this)));
        address _signer = _messageHash.toEthSignedMessageHash().recover(_signature);

        require(_signer == containerPositionOracleAddress, "Invalid container position signature");

        TransactionsList[_transactionID].containerPositionStatus = _status;

        emit ContainerPositionReported(_transactionID, _status);
    }

    // Logique partagée par withdrawFunds et withdrawFundsWithPositionUpdate —
    // une fonction interne plutôt qu'un modifier commun aux deux, pour ne pas
    // dupliquer ce corps à chaque site d'attache (voir la note plus haut sur
    // l'ex-modifier checkWithdrawalEligibility).
    function withdrawFundsCore(bytes32 _transactionID) internal {
        withdrawalEligibilityStatus(_transactionID);

        Transaction storage _transaction = TransactionsList[_transactionID];
        Currency _currency = _transaction.currency;

        _transaction.sellerSanctioned = checkSanction(msg.sender);
        _transaction.buyerSanctioned = checkSanction(_transaction.buyer.userAddress);

        if (_transaction.sellerSanctioned || _transaction.buyerSanctioned) {
            _transaction.workflowStatus = WorkflowStatus.TransactionAborted;

            emit TransactionAborted(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
        } else {
            IERC20 _token = tokenAddresses[_currency];
            require(address(_token) != address(0), "Token address not configured for this currency");

            uint128 _amountToWithdraw = _transaction.pendingWithdrawalAmount;

            _transaction.pendingWithdrawalAmount = 0;
            _transaction.partialWithdrawalCompleted = true;

            _token.safeTransfer(_transaction.seller.userAddress, _amountToWithdraw);

            emit FundsWithdrawn(_transactionID, _transaction.seller.userAddress, _amountToWithdraw, _transaction.currency);

            if (_transaction.pendingWithdrawalAmount == 0 && _transaction.depositCompleted) {
                _transaction.workflowStatus = WorkflowStatus.TransactionCompleted;
                _transaction.withdrawalCompleted = true;

                emit TransactionCompleted(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
            }
        }
    }

    // Logique partagée par rollbackDeposit et rollbackDepositWithPositionUpdate
    // — même raison que withdrawFundsCore ci-dessus.
    function rollbackDepositCore(bytes32 _transactionID) internal {
        require(rollbackEligibilityStatus(_transactionID), "Transaction is not eligible for rollback");

        Transaction storage _transaction = TransactionsList[_transactionID];
        uint128 _refundAmount = _transaction.pendingWithdrawalAmount;

        IERC20 _token = tokenAddresses[_transaction.currency];
        require(address(_token) != address(0), "Token address not configured for this currency");

        _transaction.depositedAmount -= _transaction.pendingWithdrawalAmount;
        _transaction.pendingWithdrawalAmount = 0;
        _transaction.refundAmount = _refundAmount;

        _token.safeTransfer(_transaction.buyer.userAddress, _refundAmount);

        if (_transaction.totalAmount > _refundAmount) {
            _transaction.partialAmountRefunded = true;
            emit partialAmountRefunded(_transactionID, _transaction.buyer.userAddress, _refundAmount, _transaction.currency);
        } else {
            _transaction.totalAmountRefunded = true;
            emit totalAmountRefunded(_transactionID, _transaction.buyer.userAddress, _refundAmount, _transaction.currency);
        }
    }

    function checkSanction(address _userAddress) internal returns (bool) {
        if (isExempt[_userAddress]) {
            return false;
        }

        address _oracleAddress = mockSanctionsEnabled ? mockSanctionsOracleAddress : sanctionsOracleAddress;

        try ISanctionsList(_oracleAddress).isSanctioned(_userAddress) returns (bool _sanctioned) {
            if (_sanctioned) {
                emit AddressSanctioned(_userAddress);
                return true;
            }
            return false;
        } catch {
            emit SanctionsOracleCallFailed(_userAddress);
            return false;
        }
    }
}
