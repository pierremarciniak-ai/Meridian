// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./InternalFunctions.sol";

/// @title Meridian
/// @notice Escrow de transactions commerciales maritimes entre un acheteur et un fournisseur.
/// @dev API externe uniquement ; toute la logique et le storage vivent dans InternalFunctions.
contract Meridian is InternalFunctions, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    /// @notice Configure l'adresse du token ERC-20 utilisé pour une devise.
    function setTokenAddress(Currency _currency, address _tokenAddress) external onlyOwner {
        require(_tokenAddress != address(0), "Invalid token address");
        tokenAddresses[_currency] = IERC20(_tokenAddress);

        emit TokenAddressUpdated(_currency, _tokenAddress);
    }

    /// @notice Configure l'adresse de l'oracle de sanctions réel.
    function setSanctionsOracleAddress(address _sanctionsOracle) external onlyOwner {
        require(_sanctionsOracle != address(0), "Invalid sanctions oracle address");
        sanctionsOracleAddress = _sanctionsOracle;

        emit SanctionsOracleAddressUpdated(_sanctionsOracle);
    }

    /// @notice Configure l'adresse du contrat MeridianNFT utilisé pour les reçus.
    function setMeridianNFTAddress(address _meridianNFT) external onlyOwner {
        require(_meridianNFT != address(0), "Invalid Meridian NFT address");
        meridianNFTAddress = _meridianNFT;

        emit MeridianNFTAddressUpdated(_meridianNFT);
    }

    /// @notice Configure l'adresse de l'oracle de position de conteneur.
    function setContainerPositionOracleAddress(address _containerPositionOracle) external onlyOwner {
        require(_containerPositionOracle != address(0), "Invalid container position oracle address");
        containerPositionOracleAddress = _containerPositionOracle;

        emit ContainerPositionOracleAddressUpdated(_containerPositionOracle);
    }

    /// @notice Enregistre directement la position d'un conteneur (appelée par le wallet oracle).
    /// @dev Voir le commentaire sur containerPositionOracleAddress dans
    /// InternalFunctions.sol : ce chemin dépense le gas du wallet oracle
    /// lui-même, utile en dev/admin (ContainerPositionOraclePanel). En usage
    /// normal, c'est plutôt applySignedContainerPosition (via
    /// withdrawFundsWithPositionUpdate/rollbackDepositWithPositionUpdate,
    /// payé par l'utilisateur) qui écrit containerPositionStatus.
    function reportContainerPosition(bytes32 _transactionID, ContainerPositionStatus _status) external
    onlyContainerPositionOracle onlySignedTransaction(_transactionID) {
        TransactionsList[_transactionID].containerPositionStatus = _status;

        emit ContainerPositionReported(_transactionID, _status);
    }

    /// @notice Configure l'adresse de l'oracle de sanctions simulé (tests/démo).
    function setMockSanctionsOracleAddress(address _mockSanctionsOracle) external onlyOwner {
        require(_mockSanctionsOracle != address(0), "Invalid mock sanctions oracle address");
        mockSanctionsOracleAddress = _mockSanctionsOracle;

        emit MockSanctionsOracleAddressUpdated(_mockSanctionsOracle);
    }

    /// @notice Bascule entre l'oracle de sanctions réel et simulé.
    function toggleMockSanctionsOracle(bool _actualSetting) external onlyOwner {
        if (mockSanctionsEnabled != _actualSetting) {
            mockSanctionsEnabled = _actualSetting;

            emit MockSanctionsToggled(_actualSetting);
        }
    }

    /// @notice Transfère la propriété du contrat.
    function setNewOwner(address _newOwner) external onlyOwner {
        transferOwnership(_newOwner);
    }

    /// @notice Configure le wallet destinataire des frais de service.
    function setFeesWalletAddress(address _feesWalletAddress) external onlyOwner {
        require(_feesWalletAddress != address(0), "Invalid fees wallet address");
        feesWalletAddress = _feesWalletAddress;

        emit FeesWalletAddressUpdated(_feesWalletAddress);
    }

    /// @notice Configure le taux de frais de service, en points de base (sur 10000).
    function setFeesRateBps(uint16 _feesRateBps) external onlyOwner {
        require(_feesRateBps <= 10000, "Fee rate cannot exceed 100%");
        feesRateBps = _feesRateBps;

        emit FeesRateBpsUpdated(_feesRateBps);
    }

    /// @notice Configure le montant minimum des frais de service
    function setMinimumFeesAmount(uint128 _minFeesAmount) external onlyOwner {
        
        minFeesAmount = _minFeesAmount;

        emit MinimumFeesAmountUpdated(_minFeesAmount);
    }    

    /// @notice Ouvre un nouveau dossier : l'appelant devient l'acheteur.
    /// @dev Génère transactionID = keccak256(internalID, msg.sender).
    /// currentEditor démarre à Seller : c'est donc le fournisseur qui doit
    /// agir en premier (saveTransactionDetailsSeller puis
    /// signTransactionSeller) une fois le dossier accepté via
    /// createTransaction.
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
        _transaction.buyer = initializeUser(UserType.Buyer, msg.sender);
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

    /// @notice Accepte un dossier initialisé : l'appelant devient le fournisseur.
    /// @dev _billNumber doit correspondre exactement à celui saisi par
    /// l'acheteur à l'initialisation (comparé par hash).
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
        _transaction.seller = initializeUser(UserType.Seller, msg.sender);

        emit TransactionCreated(_transactionID, msg.sender);
    }

    /// @notice Enregistre les détails et la référence conteneur côté fournisseur.
    /// @dev Réinitialise les deux signatures. Abandonne la transaction sans
    /// revert si le fournisseur est détecté sanctionné.
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

    /// @notice Enregistre les détails côté acheteur (contre-proposition).
    /// @dev Réinitialise les deux signatures. Abandonne la transaction sans
    /// revert si l'acheteur est détecté sanctionné.
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

    /// @notice Signe la transaction côté fournisseur.
    function signTransactionSeller(bytes32 _transactionID) external nonReentrant onlySeller(_transactionID)
    sellerInfosCompleted(_transactionID) onlyCreatedTransaction(_transactionID) {

        signTransaction(_transactionID, UserType.Seller);
    }

    /// @notice Signe la transaction côté acheteur.
    /// @dev Le fournisseur signant toujours en premier (voir
    /// initializeTransaction), c'est cette fonction qui complète
    /// systématiquement la double signature et déclenche le prélèvement des
    /// frais (transfertFeesFromBuyer).
    function signTransactionBuyer(bytes32 _transactionID) external nonReentrant onlyBuyer(_transactionID)
    sellerInfosCompleted(_transactionID) onlyCreatedTransaction(_transactionID) {

        signTransaction(_transactionID, UserType.Buyer);
    }

    /// @notice Mint le reçu NFT de l'acheteur pour ce dossier.
    function mintTransactionNFTBuyer(bytes32 _transactionID) external onlyBuyer(_transactionID) onlySignedOrCompletedTransaction(_transactionID) {
        require(meridianNFTAddress != address(0), "Meridian NFT contract not configured");

        Transaction storage _transaction = TransactionsList[_transactionID];
        require(!_transaction.buyerNFTMinted, "Buyer NFT already minted for this transaction");
        _transaction.buyerNFTMinted = true;

        uint256 tokenId = mintTransactionNFT(_transactionID, _transaction.buyer.userAddress);

        emit TransactionNFTMinted(_transactionID, _transaction.buyer.userType, _transaction.buyer.userAddress, tokenId);
    }

    /// @notice Mint le reçu NFT du fournisseur pour ce dossier.
    function mintTransactionNFTSeller(bytes32 _transactionID) external onlySeller(_transactionID) onlySignedOrCompletedTransaction(_transactionID) {
        require(meridianNFTAddress != address(0), "Meridian NFT contract not configured");

        Transaction storage _transaction = TransactionsList[_transactionID];
        require(!_transaction.sellerNFTMinted, "Seller NFT already minted for this transaction");
        _transaction.sellerNFTMinted = true;

        uint256 tokenId = mintTransactionNFT(_transactionID, _transaction.seller.userAddress);

        emit TransactionNFTMinted(_transactionID, _transaction.seller.userType, _transaction.seller.userAddress, tokenId);
    }

    /// @notice Dépose le prochain versement dû (acompte ou solde restant).
    /// @dev Le montant est calculé par calculateDepositAmount, jamais fourni
    /// par l'appelant. Abandonne la transaction sans revert si l'une des
    /// deux parties est détectée sanctionnée.
    function depositFunds(bytes32 _transactionID) external nonReentrant onlyBuyer(_transactionID) onlySignedTransaction(_transactionID)
    {
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

            if (_transaction.depositedAmount >= _transaction.netAmountDue) {
                _transaction.depositCompleted = true;
            }

            _token.safeTransferFrom(_transaction.buyer.userAddress, address(this), _amountToDeposit);

            emit FundsDeposited(_transactionID, _transaction.buyer.userAddress, _amountToDeposit, _transaction.currency);
        }
    }

    /// @notice Retire les fonds disponibles vers le fournisseur.
    function withdrawFunds(bytes32 _transactionID) external nonReentrant onlySeller(_transactionID)
    onlySignedTransaction(_transactionID) {
        withdrawFundsCore(_transactionID);
    }

    /// @notice Variante de withdrawFunds qui applique d'abord une attestation de position signée.
    /// @dev Voir applySignedContainerPosition dans InternalFunctions.sol :
    /// une seule transaction, un seul wallet à signer côté utilisateur, et
    /// le wallet oracle backend ne dépense jamais de gas.
    function withdrawFundsWithPositionUpdate(bytes32 _transactionID, ContainerPositionStatus _status, uint256 _deadline,
    bytes calldata _signature) external nonReentrant onlySeller(_transactionID) onlySignedTransaction(_transactionID) {
        applySignedContainerPosition(_transactionID, _status, _deadline, _signature);
        withdrawFundsCore(_transactionID);
    }

    /// @notice Rembourse l'acheteur du montant en attente de retrait.
    function rollbackDeposit(bytes32 _transactionID) external nonReentrant onlyBuyer(_transactionID) {
        rollbackDepositCore(_transactionID);
    }

    /// @notice Variante de rollbackDeposit qui applique d'abord une attestation de position signée.
    function rollbackDepositWithPositionUpdate(bytes32 _transactionID, ContainerPositionStatus _status, uint256 _deadline,
    bytes calldata _signature) external nonReentrant onlyBuyer(_transactionID) {
        applySignedContainerPosition(_transactionID, _status, _deadline, _signature);
        rollbackDepositCore(_transactionID);
    }

    /// @notice Retourne l'état complet d'un dossier.
    function getTransaction(bytes32 _transactionID) external view returns (Transaction memory) {
        return TransactionsList[_transactionID];
    }
}
