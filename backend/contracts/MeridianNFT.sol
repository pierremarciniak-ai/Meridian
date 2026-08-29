// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/// @title MeridianNFT
/// @notice Reçu NFT d'une transaction Meridian, un exemplaire par partie (acheteur/vendeur).
/// @dev Metadata encodée en JSON on-chain (data URI base64, pas d'image pour
/// l'instant), reconstruite à la volée dans tokenURI() à partir de
/// _transactionData plutôt que stockée telle quelle (pas d'ERC721URIStorage) :
/// la donnée brute suffit à la régénérer, la dupliquer en JSON stocké
/// n'aurait fait qu'alourdir le gas du mint pour rien. Le owner de ce
/// contrat doit être l'adresse du contrat Meridian : c'est lui qui appelle
/// mintOne une fois les deux signatures réunies.
contract MeridianNFT is ERC721, Ownable {
    uint256 private _nextTokenId;

    /// @notice Détails de transaction figés au moment du mint.
    /// @dev currency / transactionCondition / transactionModel /
    /// advancePaymentMode sont les codes uint8 des enums Meridian (même
    /// ordre : voir les fonctions *Label ci-dessous), convertis en libellés
    /// lisibles ici plutôt que dans Meridian.sol pour ne pas alourdir son
    /// bytecode (proche de la limite EIP-170). Les largeurs (uint128/uint40)
    /// doivent rester identiques à IMeridianNFT.TransactionData côté
    /// InternalFunctions.sol : c'est le même shape ABI pour l'appel externe.
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

    enum UserType {
        Buyer,
        Seller
    }

    /// @dev internal (pas public) : avec 12 champs dont 2 string, le getter
    /// auto-généré par `public` fait "stack too deep" à la compilation
    /// (codegen legacy, sans viaIR) — voir getTransactionData ci-dessous.
    mapping(uint256 => TransactionData) internal _transactionData;

    constructor(address initialOwner)
        ERC721("MeridianNFT", "MER")
        Ownable(initialOwner)
    {}

    /// @notice Retourne les détails de transaction associés à un tokenId.
    function getTransactionData(uint256 tokenId) external view returns (TransactionData memory) {
        return _transactionData[tokenId];
    }

    /// @notice Mint un reçu pour une adresse (appelé par Meridian, une fois par partie).
    function mintOne(address _to, TransactionData calldata _data) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _transactionData[tokenId] = _data;

        _safeMint(_to, tokenId);
    }

    /// @notice URI de metadata du token, reconstruite à la volée (voir buildTokenURI).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        TransactionData memory _data = _transactionData[tokenId];
        return buildTokenURI(_data);
    }

    /// @notice Construit la data URI JSON (base64) de metadata pour une transaction.
    /// @dev Accumule deux arguments à la fois (json + un nouveau morceau)
    /// plutôt qu'un seul abi.encodePacked à N arguments : avec autant de
    /// champs et d'appels imbriqués (Strings.*, _attribute), un seul gros
    /// appel fait aussi "stack too deep" à la compilation. billNumber et
    /// containerReference viennent de saisies utilisateur côté Meridian et
    /// ne sont pas échappés ici : un `"` dans ces champs casserait le JSON
    /// généré. Impact limité à l'affichage du NFT (aucun fonds en jeu), donc
    /// accepté tel quel pour l'instant.
    function buildTokenURI(TransactionData memory _data) public pure returns (string memory) {
        bytes memory json = abi.encodePacked(
            '{"name":"Meridian Transaction ', _data.billNumber, '",',
            '"description":"On-chain escrow transaction details (Meridian).",',
            '"attributes":['
        );

        json = abi.encodePacked(json, _attribute("Transaction ID", Strings.toHexString(uint256(_data.transactionID), 32), true));
        json = abi.encodePacked(json, _attribute("Bill Number", _data.billNumber, true));
        json = abi.encodePacked(json, _attribute("Buyer", Strings.toHexString(_data.buyer), true));
        json = abi.encodePacked(json, _attribute("Seller", Strings.toHexString(_data.seller), true));
        json = abi.encodePacked(json, _attribute("Currency", _currencyLabel(_data.currency), true));
        json = abi.encodePacked(json, _attribute("Transaction Condition", _transactionConditionLabel(_data.transactionCondition), true));
        json = abi.encodePacked(json, _attribute("Transaction Model", _transactionModelLabel(_data.transactionModel), true));
        json = abi.encodePacked(json, _attribute("Advance Payment Mode", _advancePaymentModeLabel(_data.advancePaymentMode), true));
        json = abi.encodePacked(json, _attribute("Advance Amount", Strings.toString(_data.advanceAmount), false));
        json = abi.encodePacked(json, _attribute("Total Amount", Strings.toString(_data.totalAmount), false));
        json = abi.encodePacked(json, _attribute("Expiration Date", Strings.toString(_data.transactionCancellingDate), false));
        json = abi.encodePacked(json, _lastAttribute("Container Reference", _data.containerReference, true));
        json = abi.encodePacked(json, "]}");

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    function _attribute(string memory _traitType, string memory _value, bool _quoted) private pure returns (bytes memory) {
        return abi.encodePacked(_attributeBody(_traitType, _value, _quoted), ",");
    }

    function _lastAttribute(string memory _traitType, string memory _value, bool _quoted) private pure returns (bytes memory) {
        return _attributeBody(_traitType, _value, _quoted);
    }

    /// @dev _quoted distingue les valeurs texte ("value":"...") des valeurs
    /// numériques déjà stringifiées ("value":123, sans guillemets), pour que
    /// les marketplaces qui lisent ces attributs comme des nombres le puissent.
    function _attributeBody(string memory _traitType, string memory _value, bool _quoted) private pure returns (bytes memory) {
        return _quoted
            ? abi.encodePacked('{"trait_type":"', _traitType, '","value":"', _value, '"}')
            : abi.encodePacked('{"trait_type":"', _traitType, '","value":', _value, "}");
    }

    /// @dev Ordre attendu : Currency { USDC, USDT, EURC } dans InternalFunctions.sol.
    function _currencyLabel(uint8 _currency) private pure returns (string memory) {
        if (_currency == 0) return "USDC";
        if (_currency == 1) return "USDT";
        return "EURC";
    }

    /// @dev Ordre attendu : TransactionCondition { AtTheBeginningOfDelivery, AtTheEndOfDelivery }.
    function _transactionConditionLabel(uint8 _condition) private pure returns (string memory) {
        return _condition == 0 ? "AtTheBeginningOfDelivery" : "AtTheEndOfDelivery";
    }

    /// @dev Ordre attendu : TransactionModel { FullLocked, PartialLocked, PartialImmediate, Free }.
    function _transactionModelLabel(uint8 _model) private pure returns (string memory) {
        if (_model == 0) return "FullLocked";
        if (_model == 1) return "PartialLocked";
        if (_model == 2) return "PartialImmediate";
        return "Free";
    }

    /// @dev Ordre attendu : AdvancePaymentMode { Immediate, Deferred }.
    function _advancePaymentModeLabel(uint8 _mode) private pure returns (string memory) {
        return _mode == 0 ? "Immediate" : "Deferred";
    }
}
