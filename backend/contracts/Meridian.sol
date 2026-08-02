// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./InternalFunctions.sol";

contract Meridian is InternalFunctions, ReentrancyGuard {
    using SafeERC20 for IERC20;

    function setTokenAddress(Currency _currency, address _tokenAddress) external onlyOwner {
        require(_tokenAddress != address(0), "Invalid token address");
        tokenAddresses[_currency] = IERC20(_tokenAddress);
    }

    function initializeTransaction(TransactionDetailsInput calldata _details, string calldata _billNumber) external {
        internalID++;

        bytes32 _transactionID = keccak256(abi.encodePacked(internalID, msg.sender));

        require(TransactionsList[_transactionID].workflowStatus == WorkflowStatus.UnSet, "Transaction ID already exists");
        require(_details.totalAmount > 0, "Total amount must be greater than zero");
        require(_details.transactionCancellingDate >= block.timestamp, "Transaction cancelling date must be in the future");
        require(bytes(_billNumber).length > 0, "Bill number cannot be empty");

        Transaction memory _transaction;

        _transaction.workflowStatus = WorkflowStatus.TransactionInitialized;
        //_transaction.buyer = initializeUser(UserType.Buyer, msg.sender, checkSanction(msg.sender));
        _transaction.buyer = initializeUser(UserType.Buyer, msg.sender, false); // Assuming buyer is not subjected to sanctions for now
        _transaction.currency = _details.currency;
        _transaction.transactionCancellingDate = _details.transactionCancellingDate;
        _transaction.transactionCondition = _details.transactionCondition;
        _transaction.transactionModel = _details.transactionModel;
        _transaction.advancePaymentMode = calculateAdvancePaymentMode(_transaction.transactionModel, _details.advancePaymentMode);
        _transaction.advanceAmount = calculateAdvanceAmount(_details.transactionModel, _details.advanceAmount);
        _transaction.totalAmount = _details.totalAmount;
        _transaction.transactionCancellingDate = _details.transactionCancellingDate;
        _transaction.billNumber = _billNumber;

        TransactionsList[_transactionID] = _transaction;

        emit TransactionInitialized(_transactionID, msg.sender);
    }

    function createTransaction(bytes32 _transactionID, string calldata _billNumber) external onlyInitializedTransaction(_transactionID) {
        require(_transactionID != bytes32(0), "Transaction ID cannot be zero");
        require(bytes(_billNumber).length > 0, "Bill number cannot be empty");
        
        Transaction storage _transaction = TransactionsList[_transactionID];

        bytes32 _billNumberHashSeller = keccak256(abi.encodePacked(_billNumber));
        bytes32 _billNumberHashTransaction = keccak256(abi.encodePacked(_transaction.billNumber));

        require(_billNumberHashSeller == _billNumberHashTransaction, "Bill number does not match");

        _transaction.workflowStatus = WorkflowStatus.TransactionCreated;
        //_transaction.seller = initializeUser(UserType.Seller, msg.sender, checkSanction(msg.sender));
        _transaction.seller = initializeUser(UserType.Seller, msg.sender, false); // Assuming seller is not subjected to sanctions for now

        emit TransactionCreated(_transactionID, msg.sender);
    }

    function saveTransactionDetailsSeller(bytes32 _transactionID, SellerLogisticsInput calldata _logistics,
    TransactionDetailsInput calldata _details) external onlySeller(_transactionID) onlyCreatedTransaction(_transactionID) {
        require(_logistics.arrivalDate > _logistics.departureDate, "Arrival date must be after departure date");
        require(bytes(_logistics.containerReference).length > 0, "Container reference cannot be empty");

        Transaction storage _transaction = TransactionsList[_transactionID];

        _transaction.sellerDepartureDate = _logistics.departureDate;
        _transaction.sellerArrivalDate = _logistics.arrivalDate;
        _transaction.containerReference = _logistics.containerReference;

        saveCommonTransactionDetails(_transactionID, _details);

        if (_transaction.signedBySeller) {
            _transaction.signedBySeller = false;
        }
        if (_transaction.signedByBuyer) {
            _transaction.signedByBuyer = false;
        }

        emit TransactionDetailsSaved(_transactionID, UserType.Seller, msg.sender);
    }

    function saveTransactionDetailsBuyer(bytes32 _transactionID, TransactionDetailsInput calldata _details) external
    onlyBuyer(_transactionID) onlyCreatedTransaction(_transactionID) {

        Transaction storage _transaction = TransactionsList[_transactionID];

        saveCommonTransactionDetails(_transactionID, _details);

        if (_transaction.signedBySeller) {
            _transaction.signedBySeller = false;
        }
        if (_transaction.signedByBuyer) {
            _transaction.signedByBuyer = false;
        }

        emit TransactionDetailsSaved(_transactionID, UserType.Buyer, msg.sender);
    }

    function signTransactionSeller(bytes32 _transactionID) external onlySeller(_transactionID) onlyCreatedTransaction(_transactionID) {
        //bool isSellerSanctioned = checkSanction(msg.sender);
        bool isSellerSanctioned = false; // Assuming seller is not subjected to sanctions for now
        require(!isSellerSanctioned, "Seller is subjected to sanctions");
        

        TransactionsList[_transactionID].signedBySeller = true;

        emit TransactionPartiallySigned(_transactionID, UserType.Seller, msg.sender);

        checkSignatures(_transactionID);
    }

    function signTransactionBuyer(bytes32 _transactionID) external onlyBuyer(_transactionID) onlyCreatedTransaction(_transactionID) {
        //bool isBuyerSanctioned = checkSanction(msg.sender);
        bool isBuyerSanctioned = false; // Assuming buyer is not subjected to sanctions for now
        require(!isBuyerSanctioned, "Buyer is subjected to sanctions");

        TransactionsList[_transactionID].signedByBuyer = true;

        emit TransactionPartiallySigned(_transactionID, UserType.Buyer, msg.sender);
        checkSignatures(_transactionID);
    }

    function depositFunds(bytes32 _transactionID) external nonReentrant onlyBuyer(_transactionID) onlySignedTransaction(_transactionID)
    transactionDateNotOverdue(_transactionID) {
        Transaction storage _transaction = TransactionsList[_transactionID];

        require(!_transaction.depositCompleted, "Payment already completed");

        uint _amountToDeposit = calculateDepositAmount(_transaction);
        require(_amountToDeposit > 0, "No deposit required for this transaction model");

        IERC20 _token = tokenAddresses[_transaction.currency];
        require(address(_token) != address(0), "Token address not configured for this currency");

        _transaction.depositedAmount += _amountToDeposit;
        _transaction.pendingWithdrawalAmount += _amountToDeposit;
        if (_transaction.depositedAmount >= _transaction.totalAmount) {
            _transaction.depositCompleted = true;
        }

        _token.safeTransferFrom(msg.sender, address(this), _amountToDeposit);

        emit FundsDeposited(_transactionID, msg.sender, _amountToDeposit, _transaction.currency);
    }

    function withdrawFunds(bytes32 _transactionID) external nonReentrant onlySeller(_transactionID) onlySignedTransaction(_transactionID)
    transactionDateNotOverdue(_transactionID) {
        Transaction storage _transaction = TransactionsList[_transactionID];
        Currency _currency = _transaction.currency;

        require(_transaction.withdrawalCompleted == false, "Withdrawal already completed");

        uint _amount = _transaction.pendingWithdrawalAmount;
        require(_amount > 0, "Nothing to withdraw");

        IERC20 _token = tokenAddresses[_currency];
        require(address(_token) != address(0), "Token address not configured for this currency");

        _transaction.pendingWithdrawalAmount = 0;

        _token.safeTransfer(msg.sender, _amount);

        emit FundsWithdrawn(_transactionID, msg.sender, _amount, _transaction.currency);

        if (_transaction.pendingWithdrawalAmount == 0 && _transaction.depositCompleted) {
            _transaction.workflowStatus = WorkflowStatus.TransactionFinished;
            _transaction.withdrawalCompleted = true;

            emit TransactionFinished(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
        }
    }

    function getTransaction(bytes32 _transactionID) external view returns (Transaction memory) {
        return TransactionsList[_transactionID];
    }

    // function checkShipPosition(bytes32 _transactionID) external view returns (string memory) {
    //     Transaction storage _transaction = TransactionsList[_transactionID];
    //     // Implement the logic to check the ship's position based on the transaction details
    //     // For example, you can use an oracle or external API to get the ship's current position
    //     return "Ship position not implemented"; // Placeholder return value
    // }
}
