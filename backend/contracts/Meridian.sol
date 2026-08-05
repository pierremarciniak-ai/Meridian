// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./InternalFunctions.sol";

contract Meridian is InternalFunctions, ReentrancyGuard {
    using SafeERC20 for IERC20;
    // Un "using ... for" déclaré dans InternalFunctions (contrat parent) ne
    // s'hérite pas automatiquement : il faut le redéclarer ici pour pouvoir
    // utiliser .toUint40()/.toUint128() dans ce fichier.
    using SafeCast for uint256;

    function setTokenAddress(Currency _currency, address _tokenAddress) external onlyOwner {
        require(_tokenAddress != address(0), "Invalid token address");
        tokenAddresses[_currency] = IERC20(_tokenAddress);

        emit TokenAddressUpdated(_currency, _tokenAddress);
    }

    function setSanctionsOracleAddress(address _sanctionsOracle) external onlyOwner {
        require(_sanctionsOracle != address(0), "Invalid sanctions oracle address");
        sanctionsOracleAddress = _sanctionsOracle;

        emit SanctionsOracleAddressUpdated(_sanctionsOracle);
    }

    function setMeridianNFTAddress(address _meridianNFT) external onlyOwner {
        require(_meridianNFT != address(0), "Invalid Meridian NFT address");
        meridianNFTAddress = _meridianNFT;

        emit MeridianNFTAddressUpdated(_meridianNFT);
    }

    function setMockSanctionsOracleAddress(address _mockSanctionsOracle) external onlyOwner {
        require(_mockSanctionsOracle != address(0), "Invalid mock sanctions oracle address");
        mockSanctionsOracleAddress = _mockSanctionsOracle;

        emit MockSanctionsOracleAddressUpdated(_mockSanctionsOracle);
    }

    function toggleMockSanctionsOracle(bool _actualSetting) external onlyOwner {
        if (mockSanctionsEnabled != _actualSetting) {
            mockSanctionsEnabled = _actualSetting;

            emit MockSanctionsToggled(_actualSetting);
        }
    }

    function addExemptAddress(address _account) external onlyOwner {
        isExempt[_account] = true;

        emit ExemptAddressAdded(_account);
    }

    function removeExemptAddress(address _account) external onlyOwner {
        isExempt[_account] = false;

        emit ExemptAddressRemoved(_account);
    }

    function setNewOwner(address _newOwner) external onlyOwner {
        transferOwnership(_newOwner);
    }

    function toggleSanctionsCheck(bool _actualSetting) external onlyOwner {
        if (checkSanctionsEnabled != _actualSetting) {
            checkSanctionsEnabled = _actualSetting;

            emit SanctionsCheckToggled(_actualSetting);
        }
    }

    function initializeTransaction(TransactionDetailsInput calldata _details, string calldata _billNumber) external
    onlyUnsanctioned(msg.sender) {
        internalID++;

        bytes32 _transactionID = keccak256(abi.encodePacked(internalID, msg.sender));

        require(TransactionsList[_transactionID].workflowStatus == WorkflowStatus.UnSet, "Transaction ID already exists");
        require(_details.totalAmount > 0, "Total amount must be greater than zero");
        require(_details.transactionCancellingDate >= block.timestamp, "Transaction cancelling date must be in the future");
        require(bytes(_billNumber).length > 0, "Bill number cannot be empty");

        Transaction memory _transaction;

        _transaction.workflowStatus = WorkflowStatus.TransactionInitialized;
        //_transaction.buyer = initializeUser(UserType.Buyer, msg.sender, checkSanction(msg.sender));
        _transaction.buyer = initializeUser(UserType.Buyer, msg.sender); // Assuming buyer is not subjected to sanctions for now
        _transaction.currency = _details.currency;
        _transaction.transactionCancellingDate = _details.transactionCancellingDate.toUint40();
        _transaction.transactionCondition = _details.transactionCondition;
        _transaction.transactionModel = _details.transactionModel;
        _transaction.advancePaymentMode = calculateAdvancePaymentMode(_transaction.transactionModel, _details.advancePaymentMode);
        _transaction.advanceAmount = calculateAdvanceAmount(_details.transactionModel, _details.advanceAmount).toUint128();
        _transaction.totalAmount = _details.totalAmount.toUint128();
        _transaction.billNumber = _billNumber;

        TransactionsList[_transactionID] = _transaction;

        emit TransactionInitialized(_transactionID, msg.sender);
    }

    function createTransaction(bytes32 _transactionID, string calldata _billNumber) external
    onlyUnsanctioned(msg.sender) onlyInitializedTransaction(_transactionID) {
        require(_transactionID != bytes32(0), "Transaction ID cannot be zero");
        require(bytes(_billNumber).length > 0, "Bill number cannot be empty");
        
        Transaction storage _transaction = TransactionsList[_transactionID];

        bytes32 _billNumberHashSeller = keccak256(abi.encodePacked(_billNumber));
        bytes32 _billNumberHashTransaction = keccak256(abi.encodePacked(_transaction.billNumber));

        require(_billNumberHashSeller == _billNumberHashTransaction, "Bill number does not match");

        _transaction.workflowStatus = WorkflowStatus.TransactionCreated;
        //_transaction.seller = initializeUser(UserType.Seller, msg.sender, checkSanction(msg.sender));
        _transaction.seller = initializeUser(UserType.Seller, msg.sender); // Assuming seller is not subjected to sanctions for now

        emit TransactionCreated(_transactionID, msg.sender);
    }

    function saveTransactionDetailsSeller(bytes32 _transactionID, SellerLogisticsInput calldata _logistics,
    TransactionDetailsInput calldata _details) external onlySeller(_transactionID) onlyCreatedTransaction(_transactionID) {
        require(_logistics.arrivalDate > _logistics.departureDate, "Arrival date must be after departure date");
        require(bytes(_logistics.containerReference).length > 0, "Container reference cannot be empty");

        Transaction storage _transaction = TransactionsList[_transactionID];

        _transaction.sellerDepartureDate = _logistics.departureDate.toUint40();
        _transaction.sellerArrivalDate = _logistics.arrivalDate.toUint40();
        _transaction.containerReference = _logistics.containerReference;

        saveCommonTransactionDetails(_transactionID, _details);

        resetSignatures(_transactionID);

        emit TransactionDetailsSaved(_transactionID, UserType.Seller, msg.sender);
    }

    function saveTransactionDetailsBuyer(bytes32 _transactionID, TransactionDetailsInput calldata _details) external
    onlyBuyer(_transactionID) onlyCreatedTransaction(_transactionID) {

        saveCommonTransactionDetails(_transactionID, _details);

        resetSignatures(_transactionID);

        emit TransactionDetailsSaved(_transactionID, UserType.Buyer, msg.sender);
    }

    function signTransactionSeller(bytes32 _transactionID) external onlySeller(_transactionID) onlyCreatedTransaction(_transactionID) {
        _signTransaction(_transactionID, UserType.Seller);
    }

    function signTransactionBuyer(bytes32 _transactionID) external onlyBuyer(_transactionID) onlyCreatedTransaction(_transactionID) {
        _signTransaction(_transactionID, UserType.Buyer);
    }

    // Appelée par le front-end une fois la transaction passée en
    // TransactionSigned (les deux parties ont signé), pas automatiquement
    // depuis signTransaction* : voir le commentaire sur _mintTransactionNFTs
    // dans InternalFunctions.sol. Permissionless (pas de onlyBuyer/onlySeller) :
    // les NFTs vont de toute façon aux adresses buyer/seller déjà fixées sur
    // la transaction, donc rien à protéger côté appelant.
    // function mintTransactionNFTs(bytes32 _transactionID) external onlySignedTransaction(_transactionID) {
    //     require(meridianNFTAddress != address(0), "Meridian NFT contract not configured");

    //     Transaction storage _transaction = TransactionsList[_transactionID];
    //     require(!_transaction.nftsMinted, "NFTs already minted for this transaction");
    //     _transaction.nftsMinted = true;

    //     _mintTransactionNFTs(_transactionID);
    // }

    function mintTransactionNFTBuyer(bytes32 _transactionID) external onlyBuyer(_transactionID) onlySignedTransaction(_transactionID) {
        require(meridianNFTAddress != address(0), "Meridian NFT contract not configured");

        Transaction storage _transaction = TransactionsList[_transactionID];
        require(!_transaction.buyerNFTMinted, "Buyer NFT already minted for this transaction");
        _transaction.buyerNFTMinted = true;

        uint256 tokenId = mintTransactionNFT(_transactionID, _transaction.buyer.userAddress);

        emit TransactionNFTMinted(_transactionID, _transaction.buyer.userType, _transaction.buyer.userAddress, tokenId);
    }

    function mintTransactionNFTSeller(bytes32 _transactionID) external onlySeller(_transactionID) onlySignedTransaction(_transactionID) {
        require(meridianNFTAddress != address(0), "Meridian NFT contract not configured");

        Transaction storage _transaction = TransactionsList[_transactionID];
        require(!_transaction.sellerNFTMinted, "Seller NFT already minted for this transaction");
        _transaction.sellerNFTMinted = true;

        uint256 tokenId = mintTransactionNFT(_transactionID, _transaction.seller.userAddress);

        emit TransactionNFTMinted(_transactionID, _transaction.seller.userType, _transaction.seller.userAddress, tokenId);
    }    

    function depositFunds(bytes32 _transactionID) external nonReentrant onlyBuyer(_transactionID) onlySignedTransaction(_transactionID)
    transactionDateNotOverdue(_transactionID) {
        Transaction storage _transaction = TransactionsList[_transactionID];

        require(!_transaction.depositCompleted, "Payment already completed");

        uint128 _amountToDeposit = calculateDepositAmount(_transaction);
        require(_amountToDeposit > 0, "No deposit required for this transaction model");

        IERC20 _token = tokenAddresses[_transaction.currency];
        require(address(_token) != address(0), "Token address not configured for this currency");

        _transaction.depositedAmount += _amountToDeposit;
        _transaction.pendingWithdrawalAmount += _amountToDeposit;
        if (_transaction.depositedAmount >= _transaction.totalAmount) {
            _transaction.depositCompleted = true;
        }

        _token.safeTransferFrom(_transaction.buyer.userAddress, address(this), _amountToDeposit);

        emit FundsDeposited(_transactionID, _transaction.buyer.userAddress, _amountToDeposit, _transaction.currency);
    }

    function withdrawFunds(bytes32 _transactionID) external nonReentrant onlySeller(_transactionID) onlySignedTransaction(_transactionID) {
        Transaction storage _transaction = TransactionsList[_transactionID];
        Currency _currency = _transaction.currency;

        require(_transaction.withdrawalCompleted == false, "Withdrawal already completed");

        uint128 _amount = _transaction.pendingWithdrawalAmount;
        require(_amount > 0, "Nothing to withdraw");

        IERC20 _token = tokenAddresses[_currency];
        require(address(_token) != address(0), "Token address not configured for this currency");

        _transaction.pendingWithdrawalAmount = 0;

        _token.safeTransfer(_transaction.seller.userAddress, _amount);

        emit FundsWithdrawn(_transactionID, _transaction.seller.userAddress, _amount, _transaction.currency);

        if (_transaction.pendingWithdrawalAmount == 0 && _transaction.depositCompleted) {
            _transaction.workflowStatus = WorkflowStatus.TransactionCompleted;
            _transaction.withdrawalCompleted = true;

            emit TransactionCompleted(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
        }
    }

    function rollbackDeposit(bytes32 _transactionID) external nonReentrant onlyBuyer(_transactionID) onlyAbortedTransaction(_transactionID) {
        Transaction storage _transaction = TransactionsList[_transactionID];
        uint128 _refundAmount = _transaction.depositedAmount;

        require(_refundAmount > 0, "No funds to rollback");

        IERC20 _token = tokenAddresses[_transaction.currency];
        require(address(_token) != address(0), "Token address not configured for this currency");

        _transaction.pendingWithdrawalAmount = 0;
        _transaction.depositedAmount = 0;
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
