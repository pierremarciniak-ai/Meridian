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

    function setContainerPositionOracleAddress(address _containerPositionOracle) external onlyOwner {
        require(_containerPositionOracle != address(0), "Invalid container position oracle address");
        containerPositionOracleAddress = _containerPositionOracle;

        emit ContainerPositionOracleAddressUpdated(_containerPositionOracle);
    }

    // Appelée par notre propre backend (le cron qui interroge l'API
    // VesselFinder), pas par le vendeur : voir le commentaire sur
    // containerPositionOracleAddress dans InternalFunctions.sol. C'est la
    // seule façon d'écrire containerPositionStatus.
    function reportContainerPosition(bytes32 _transactionID, ContainerPositionStatus _status) external
    onlyContainerPositionOracle onlySignedTransaction(_transactionID) {
        TransactionsList[_transactionID].containerPositionStatus = _status;

        emit ContainerPositionReported(_transactionID, _status);
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
        _transaction.currentEditor = UserType.Seller;

        TransactionsList[_transactionID] = _transaction;

        emit TransactionInitialized(_transactionID, msg.sender);
    }

    function createTransaction(bytes32 _transactionID, string calldata _billNumber) external
    onlyUnsanctioned(msg.sender) onlyInitializedTransaction(_transactionID) {
        require(_transactionID != bytes32(0), "Transaction ID cannot be zero");
        require(bytes(_billNumber).length > 0, "Bill number cannot be empty");
        
        Transaction storage _transaction = TransactionsList[_transactionID];

        require(_transaction.buyer.userAddress != msg.sender, "Buyer cannot be the seller");

        bytes32 _billNumberHashSeller = keccak256(abi.encodePacked(_billNumber));
        bytes32 _billNumberHashTransaction = keccak256(abi.encodePacked(_transaction.billNumber));

        require(_billNumberHashSeller == _billNumberHashTransaction, "Bill number does not match");

        _transaction.workflowStatus = WorkflowStatus.TransactionCreated;
        //_transaction.seller = initializeUser(UserType.Seller, msg.sender, checkSanction(msg.sender));
        _transaction.seller = initializeUser(UserType.Seller, msg.sender); // Assuming seller is not subjected to sanctions for now

        emit TransactionCreated(_transactionID, msg.sender);
    }

    function saveTransactionDetailsSeller(bytes32 _transactionID, string calldata _containerReference,
    TransactionDetailsInput calldata _details) external onlySeller(_transactionID) onlyCreatedTransaction(_transactionID) {

        Transaction storage _transaction = TransactionsList[_transactionID];

        require(_transaction.currentEditor == UserType.Seller, "Only the buyer can currently save transaction details");

        _transaction.sellerSanctioned = checkSanction(msg.sender);

        if (_transaction.sellerSanctioned) {
            _transaction.workflowStatus = WorkflowStatus.TransactionAborted;

            emit TransactionAborted(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
        } else {
            require(bytes(_containerReference).length > 0, "Container reference cannot be empty");

            _transaction.containerReference = _containerReference;

            saveCommonTransactionDetails(_transactionID, _details);

            resetSignatures(_transactionID);

            emit TransactionDetailsSaved(_transactionID, UserType.Seller, msg.sender);
        }
    }

    function saveTransactionDetailsBuyer(bytes32 _transactionID, TransactionDetailsInput calldata _details) external
    onlyBuyer(_transactionID) sellerInfosCompleted(_transactionID) onlyCreatedTransaction(_transactionID) {

        Transaction storage _transaction = TransactionsList[_transactionID];

        require(_transaction.currentEditor == UserType.Buyer, "Only the seller can currently save transaction details");

        _transaction.buyerSanctioned = checkSanction(msg.sender);

        if (_transaction.buyerSanctioned) {
            _transaction.workflowStatus = WorkflowStatus.TransactionAborted;

            emit TransactionAborted(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
        } else {
            saveCommonTransactionDetails(_transactionID, _details);

            resetSignatures(_transactionID);

            emit TransactionDetailsSaved(_transactionID, UserType.Buyer, msg.sender);
        }
    }

    function signTransactionSeller(bytes32 _transactionID) external onlySeller(_transactionID) sellerInfosCompleted(_transactionID)
    onlyCreatedTransaction(_transactionID) {

        signTransaction(_transactionID, UserType.Seller);     
    }

    function signTransactionBuyer(bytes32 _transactionID) external onlyBuyer(_transactionID) sellerInfosCompleted(_transactionID)
    onlyCreatedTransaction(_transactionID) {

        signTransaction(_transactionID, UserType.Buyer);
    }

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
    {//transactionDateNotOverdue(_transactionID) {
        Transaction storage _transaction = TransactionsList[_transactionID];

        _transaction.sellerSanctioned = checkSanction(_transaction.seller.userAddress);
        _transaction.buyerSanctioned = checkSanction(msg.sender);

        if (_transaction.sellerSanctioned || _transaction.buyerSanctioned) {
            _transaction.workflowStatus = WorkflowStatus.TransactionAborted;

            emit TransactionAborted(_transactionID, _transaction.buyer.userAddress, _transaction.seller.userAddress);
        } else {
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
    }

    function withdrawFunds(bytes32 _transactionID) external nonReentrant onlySeller(_transactionID)
    onlySignedTransaction(_transactionID) {
        withdrawFundsCore(_transactionID);
    }

    // Variante payée par le vendeur : applique d'abord une attestation de
    // position signée par l'oracle (voir applySignedContainerPosition dans
    // InternalFunctions.sol) puis enchaîne sur le même retrait que
    // withdrawFunds — une seule transaction, un seul wallet à signer côté
    // utilisateur, et le wallet oracle backend ne dépense jamais de gas.
    function withdrawFundsWithPositionUpdate(
        bytes32 _transactionID,
        ContainerPositionStatus _status,
        uint256 _deadline,
        bytes calldata _signature
    ) external nonReentrant onlySeller(_transactionID) onlySignedTransaction(_transactionID) {
        applySignedContainerPosition(_transactionID, _status, _deadline, _signature);
        withdrawFundsCore(_transactionID);
    }

    function rollbackDeposit(bytes32 _transactionID) external nonReentrant onlyBuyer(_transactionID) {
        rollbackDepositCore(_transactionID);
    }

    // Équivalent de withdrawFundsWithPositionUpdate côté acheteur.
    function rollbackDepositWithPositionUpdate(
        bytes32 _transactionID,
        ContainerPositionStatus _status,
        uint256 _deadline,
        bytes calldata _signature
    ) external nonReentrant onlyBuyer(_transactionID) {
        applySignedContainerPosition(_transactionID, _status, _deadline, _signature);
        rollbackDepositCore(_transactionID);
    }

    function getTransaction(bytes32 _transactionID) external view returns (Transaction memory) {
        return TransactionsList[_transactionID];
    }
}
