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
    using SafeERC20 for IERC20;
    using MessageHashUtils for bytes32;
    using ECDSA for bytes32;

    uint96 public internalID;
    
    uint16 public feesRateBps; // ex: 250 = 2,50 %, sur 10000

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
        bool feesPaid;
        bool depositCompleted;
        bool partialWithdrawalCompleted;
        bool withdrawalCompleted;
        bool totalAmountRefunded;
        bool partialAmountRefunded;
        bool buyerNFTMinted;
        bool sellerNFTMinted;
        bool buyerSanctioned;
        bool sellerSanctioned;

        User buyer;
        User seller;

        uint40 transactionCancellingDate;

        uint128 advanceAmount;
        uint128 totalAmount;
        uint128 depositedAmount;
        uint128 pendingWithdrawalAmount;
        uint128 refundAmount;
        uint128 feesAmount;
        uint128 netAmountDue;  // = totalAmount - feesAmount/2   

        string billNumber;
        string containerReference;
    }

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

    mapping (bytes32 => Transaction) internal TransactionsList;

    mapping (Currency => IERC20) public tokenAddresses;

    address public sanctionsOracleAddress;
    address public mockSanctionsOracleAddress;
    address public meridianNFTAddress;
    // Adresse dédiée (contrôlée par notre backend qui interroge l'API
    // VesselFinder), distincte du owner : VesselFinder n'expose aucun oracle
    // on-chain, donc c'est notre propre service qui atteste la donnée —
    // soit directement via reportContainerPosition (son propre wallet),
    // soit via une signature hors-chaîne consommée par n'importe qui via
    // applySignedContainerPosition (voir withdrawFundsWithPositionUpdate /
    // rollbackDepositWithPositionUpdate dans Meridian.sol, le chemin normal
    // : ce wallet ne dépense alors jamais de gas). Ne jamais alimenter
    // containerPositionStatus depuis un paramètre fourni par le vendeur
    // (withdrawFunds) : il a intérêt à mentir pour débloquer les fonds plus
    // tôt.
    address public containerPositionOracleAddress;
    address public feesWalletAddress;

    bool public mockSanctionsEnabled = true;

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

    modifier onlySignedOrCompletedTransaction(bytes32 _transactionID) {
        WorkflowStatus _status = TransactionsList[_transactionID].workflowStatus;
        require(
            _status == WorkflowStatus.TransactionSigned || _status == WorkflowStatus.TransactionCompleted,
            "Transaction must be signed or completed"
        );
        _;
    }

    modifier sellerInfosCompleted(bytes32 _transactionID) {
        require(bytes(TransactionsList[_transactionID].containerReference).length > 0, "Container reference cannot be empty");
        _;
    }

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
    event FeesRateBpsUpdated(uint16 newFeesRateBps);
    event FeesPaid(bytes32 indexed transactionID, address indexed buyer, address feesWallet, uint amount, Currency currency);    
    event FeesWalletAddressUpdated(address indexed newFeesWallet);

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
            return _transaction.netAmountDue;
        } else if (_transaction.transactionModel == TransactionModel.Free && _transaction.advanceAmount == 0) {
            return _transaction.netAmountDue;
        } else if (_transaction.depositedAmount == 0) {
            return _transaction.advanceAmount;
        } else if (_transaction.depositedAmount > 0 && _transaction.depositedAmount < _transaction.netAmountDue) {
            return _transaction.netAmountDue - _transaction.depositedAmount;
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

            transfertFeesFromBuyer(_transactionID);

            emit TransactionSigned(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
        }
    }

function transfertFeesFromBuyer(bytes32 _transactionID) internal {
    Transaction storage _transaction = TransactionsList[_transactionID];

    uint128 _feesAmount = uint128(uint256(_transaction.totalAmount) * feesRateBps / 10000);

    //frais minimum de 30 stablecoin
    if (feesRateBps > 0 && _feesAmount < 30_000_000) _feesAmount = 30_000_000;

    // évite que le plancher dépasse totalAmount sur une très petite
    // transaction, ce qui ferait revert netAmountDue (totalAmount - fees/2)
    // par underflow
    if (_feesAmount > _transaction.totalAmount) _feesAmount = _transaction.totalAmount;

    _transaction.feesAmount = _feesAmount;
    _transaction.netAmountDue = _transaction.totalAmount - (_feesAmount / 2);

    // La part de frais du fournisseur (feesAmount/2) est déduite de l'acompte
    // (1er dépôt) plutôt que du solde restant : le solde restant vaut alors
    // totalAmount - advanceAmount (valeur d'origine), inchangé par les frais.
    // Si l'acompte est trop petit pour absorber toute la part, il tombe à 0
    // et le manque retombe sur le solde restant via netAmountDue (voir
    // calculateDepositAmount).
    uint128 _sellerFeesShare = _feesAmount / 2;
    if (_transaction.advanceAmount > _sellerFeesShare) {
        _transaction.advanceAmount -= _sellerFeesShare;
    } else {
        _transaction.advanceAmount = 0;
    }

    // plafonne advanceAmount à netAmountDue : garde-fou pour le modèle Free,
    // où l'acompte est saisi manuellement et peut dépasser totalAmount.
    if (_transaction.advanceAmount > _transaction.netAmountDue) {
        _transaction.advanceAmount = _transaction.netAmountDue;
    }

    if (_feesAmount > 0) {
        require(feesWalletAddress != address(0), "Fees wallet address not configured");
        IERC20 _token = tokenAddresses[_transaction.currency];
        require(address(_token) != address(0), "Token address not configured for this currency");

        _transaction.feesPaid = true;
        _token.safeTransferFrom(_transaction.buyer.userAddress, feesWalletAddress, _feesAmount);

        emit FeesPaid(_transactionID, _transaction.buyer.userAddress, feesWalletAddress, _feesAmount, _transaction.currency);
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

        _tokenId = IMeridianNFT(meridianNFTAddress).mintOne(_to, _data);
    }  

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

    function rollbackEligibilityStatus(bytes32 _transactionID) internal view returns (bool _status) {
        Transaction storage _transaction = TransactionsList[_transactionID];

        require(_transaction.pendingWithdrawalAmount > 0, "No pending amount to rollback");

        if (_transaction.workflowStatus == WorkflowStatus.TransactionAborted) {
            return true;
        } else if (block.timestamp >= _transaction.transactionCancellingDate) {

            if ((_transaction.transactionCondition == TransactionCondition.AtTheBeginningOfDelivery &&
            _transaction.containerPositionStatus == ContainerPositionStatus.UnSet) ||
            (_transaction.transactionCondition == TransactionCondition.AtTheEndOfDelivery &&
            _transaction.containerPositionStatus != ContainerPositionStatus.AtDestination)) {
                
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
    // vieille attestation), address(this) lie la signature à ce contrat
    // précis (anti-rejeu inter-contrats) et block.chainid à ce réseau précis
    // (anti-rejeu inter-réseaux) : sans ce dernier, transactionID seul ne
    // suffit pas à distinguer deux réseaux — il vaut keccak256(internalID,
    // buyer), et internalID redémarre à 0 sur chaque déploiement, donc deux
    // dossiers sans rapport sur deux chaînes différentes peuvent partager le
    // même transactionID.
    function applySignedContainerPosition(bytes32 _transactionID, ContainerPositionStatus _status, uint256 _deadline,
    bytes calldata _signature) internal {
        require(block.timestamp <= _deadline, "Container position signature expired");

        bytes32 _messageHash = keccak256(abi.encodePacked(_transactionID, _status, _deadline, address(this), block.chainid));
        address _signer = _messageHash.toEthSignedMessageHash().recover(_signature);

        require(_signer == containerPositionOracleAddress, "Invalid container position signature");

        TransactionsList[_transactionID].containerPositionStatus = _status;

        emit ContainerPositionReported(_transactionID, _status);
    }

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

    function rollbackDepositCore(bytes32 _transactionID) internal {
        require(rollbackEligibilityStatus(_transactionID), "Transaction is not eligible for rollback");

        Transaction storage _transaction = TransactionsList[_transactionID];
        uint128 _refundAmount = _transaction.pendingWithdrawalAmount;

        IERC20 _token = tokenAddresses[_transaction.currency];
        require(address(_token) != address(0), "Token address not configured for this currency");

        _transaction.depositedAmount -= _transaction.pendingWithdrawalAmount;
        _transaction.pendingWithdrawalAmount = 0;
        _transaction.refundAmount = _refundAmount;
        _transaction.depositCompleted = false;

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
