// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Contrat abstrait : porte tout ce qui est "interne" au fonctionnement
// (types, storage, modifiers, events, et fonctions internal). Meridian.sol
// en hérite et n'expose que l'API destinée au front-end. `abstract` car ce
// contrat n'a pas vocation à être déployé seul (pas de fonctions externes).
abstract contract InternalFunctions is Ownable {

    uint public internalID;

    enum WorkflowStatus {
        TransactionInitialized,
        TransactionCreated,
        TransactionSigned,
        TransactionFinished,
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

    struct User {
        UserType userType;
        address userAddress;
        bool isSubjectedToSanctions;
    }

    struct Transaction {
        WorkflowStatus workflowStatus;
        string billNumber;
        User buyer;
        User seller;
        Currency currency;
        TransactionCondition transactionCondition;
        TransactionModel transactionModel;
        AdvancePaymentMode advancePaymentMode;
        uint advanceAmount;
        uint totalAmount;
        uint transactionCancellingDate;
        uint sellerDepartureDate;
        uint sellerArrivalDate;
        string containerReference;
        bool signedByBuyer;
        bool signedBySeller;
        bytes32 billHash;
        uint depositedAmount;
        uint pendingWithdrawalAmount;
        bool depositCompleted;
        bool withdrawalCompleted;
        // uint creationDate;
        // uint signedDate;
        // uint departureDate;
        // uint arrivalDate;
        // uint cancellationDate;
        // uint completionDate;
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

    struct SellerLogisticsInput {
        uint departureDate;
        uint arrivalDate;
        string containerReference;
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
    mapping (address => mapping (Currency => uint)) public pendingWithdrawals;

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
        require(TransactionsList[_transactionID].workflowStatus == WorkflowStatus.TransactionInitialized, "Transaction is not in the initialized state");
        _;
    }

    modifier onlyCreatedTransaction(bytes32 _transactionID) {
        require(TransactionsList[_transactionID].workflowStatus == WorkflowStatus.TransactionCreated, "Transaction already created or not initialized");
        _;
    }

    modifier onlySignedTransaction(bytes32 _transactionID) {
        require(TransactionsList[_transactionID].workflowStatus == WorkflowStatus.TransactionSigned, "Transaction is not in the signed state");
        _;
    }

    // Contrairement aux autres modifiers, celui-ci ne fait volontairement PAS
    // de revert quand la condition échoue : un revert annulerait aussi le
    // passage à TransactionAborted qu'on veut justement persister. À la place,
    // si la date est dépassée, on met à jour le statut et on n'exécute pas le
    // `_;` (donc l'action demandée par l'appelant n'a pas lieu), mais la
    // transaction on-chain se termine normalement, avec l'écriture conservée.
    modifier transactionDateNotOverdue(bytes32 _transactionID) {
        if (!abortIfOverdue(_transactionID)) {
            _;
        }
    }       

    event TransactionInitialized(bytes32 indexed transactionID, address indexed buyer);
    event TransactionCreated(bytes32 indexed transactionID, address indexed seller);
    event TransactionDetailsSaved(bytes32 indexed transactionID, UserType userType, address indexed userAddress);
    event TransactionSigned(bytes32 indexed transactionID, address indexed buyer, address indexed seller);
    event TransactionPartiallySigned(bytes32 indexed transactionID, UserType userType, address indexed userAddress);
    event FundsDeposited(bytes32 indexed transactionID, address indexed buyer, uint amount, Currency currency);
    event FundsWithdrawn(bytes32 indexed transactionID, address indexed seller, uint amount, Currency currency);
    event TransactionFinished(bytes32 indexed transactionID, address indexed buyer, address indexed seller);
    event TransactionDateOverdue(bytes32 indexed transactionID, address indexed buyer, address indexed seller);
    event TransactionAborted(bytes32 indexed transactionID, address indexed buyer, address indexed seller);

    function initializeUser(UserType _userType, address _userAddress, bool _isSubjectedToSanctions) internal pure returns (User memory) {
        return User({
            userType: _userType,
            userAddress: _userAddress,
            isSubjectedToSanctions: _isSubjectedToSanctions
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
            _transaction.transactionCancellingDate = _details.transactionCancellingDate;
        }
        if (_details.advanceAmount != _transaction.advanceAmount) {
            _transaction.advanceAmount = calculateAdvanceAmount(_details.transactionModel, _details.advanceAmount);
        }
        if (_details.totalAmount != _transaction.totalAmount) {
            _transaction.totalAmount = _details.totalAmount;
        }
    }

    function calculateDepositAmount(Transaction storage _transaction) internal view returns (uint) {
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

    function checkSignatures(bytes32 _transactionID) internal {
        Transaction storage _transaction = TransactionsList[_transactionID];

        if (_transaction.signedByBuyer && _transaction.signedBySeller) {
            _transaction.workflowStatus = WorkflowStatus.TransactionSigned;

            emit TransactionSigned(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
        }
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
    function abortIfOverdue(bytes32 _transactionID) internal returns (bool) {
        Transaction storage _transaction = TransactionsList[_transactionID];

        if (block.timestamp >= _transaction.transactionCancellingDate) {
            if (_transaction.workflowStatus != WorkflowStatus.TransactionAborted) {
                _transaction.workflowStatus = WorkflowStatus.TransactionAborted;
                emit TransactionDateOverdue(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
            }
            return true;
        }
        return false;
    }    

    // function checkSanction(address _userAddress) internal view returns (bool) {
    //     // Implement the logic to check if the user is sanctioned
    //     // For example, you can maintain a list of sanctioned addresses and check against it
    //     return false; // Placeholder return value
    // }
}
