// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

// Mint un NFT à l'acheteur et un au vendeur pour chaque transaction Meridian
// signée, avec les détails de la transaction encodés en JSON on-chain
// (data URI base64, pas d'image pour l'instant). Le owner de ce contrat doit
// être l'adresse du contrat Meridian : c'est lui qui appelle
// mintTransactionPair une fois les deux signatures réunies.
contract MeridianNFT is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    // currency / transactionCondition / transactionModel / advancePaymentMode
    // sont les codes uint8 des enums Meridian (même ordre : voir les
    // fonctions *Label ci-dessous). Convertis en libellés lisibles ici,
    // plutôt que dans Meridian.sol, pour ne pas alourdir son bytecode
    // (proche de la limite EIP-170).
    struct TransactionData {
        bytes32 transactionID;
        string billNumber;
        address buyer;
        address seller;
        uint8 currency;
        uint8 transactionCondition;
        uint8 transactionModel;
        uint8 advancePaymentMode;
        // Mêmes largeurs que IMeridianNFT.TransactionData côté
        // InternalFunctions.sol (obligatoire : c'est le même shape ABI pour
        // l'appel externe mintTransactionPair). uint128 pour les montants,
        // uint40 pour les timestamps — voir le commentaire sur le struct
        // Transaction dans InternalFunctions.sol pour la justification.
        uint128 advanceAmount;
        uint128 totalAmount;
        uint40 transactionCancellingDate;
        string containerReference;
    }

    enum UserType {
        Buyer,
        Seller
    }

    // internal (pas public) : avec 12 champs dont 2 string, le getter
    // auto-généré par `public` fait "stack too deep" à la compilation
    // (codegen legacy, sans viaIR). getTransactionData ci-dessous retourne
    // le struct entier en un bloc memory, ce qui évite le problème (même
    // pattern que Meridian.getTransaction).
    mapping(uint256 => TransactionData) internal _transactionData;

    constructor(address initialOwner)
        ERC721("MeridianNFT", "MER")
        Ownable(initialOwner)
    {}

    function getTransactionData(uint256 tokenId) external view returns (TransactionData memory) {
        return _transactionData[tokenId];
    }

    function mintOne(address _to, TransactionData calldata _data) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _transactionData[tokenId] = _data;
        string memory _uri = buildTokenURI(_data);

        _safeMint(_to, tokenId);
        _setTokenURI(tokenId, _uri);
    }

    // Construit le JSON de metadata encodé en base64 (data URI), en
    // accumulant deux arguments à la fois (json + un nouveau morceau)
    // plutôt qu'en un seul abi.encodePacked à N arguments : avec autant de
    // champs et d'appels imbriqués (Strings.*, _attribute), un seul gros
    // appel fait aussi "stack too deep" à la compilation.
    //
    // Note : billNumber et containerReference viennent de saisies
    // utilisateur côté Meridian et ne sont pas échappés ici. Un `"` dans ces
    // champs casserait le JSON généré. Impact limité à l'affichage du NFT
    // (aucun fonds en jeu), donc accepté tel quel pour l'instant.
    function buildTokenURI(TransactionData calldata _data) public pure returns (string memory) {
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

    // _quoted distingue les valeurs texte ("value":"...") des valeurs
    // numériques déjà stringifiées ("value":123, sans guillemets), pour que
    // les marketplaces qui lisent ces attributs comme des nombres le puissent.
    function _attributeBody(string memory _traitType, string memory _value, bool _quoted) private pure returns (bytes memory) {
        return _quoted
            ? abi.encodePacked('{"trait_type":"', _traitType, '","value":"', _value, '"}')
            : abi.encodePacked('{"trait_type":"', _traitType, '","value":', _value, "}");
    }

    // Ordre attendu : Currency { USDC, USDT, EURC } dans InternalFunctions.sol.
    function _currencyLabel(uint8 _currency) private pure returns (string memory) {
        if (_currency == 0) return "USDC";
        if (_currency == 1) return "USDT";
        return "EURC";
    }

    // Ordre attendu : TransactionCondition { AtTheBeginningOfDelivery, AtTheEndOfDelivery }.
    function _transactionConditionLabel(uint8 _condition) private pure returns (string memory) {
        return _condition == 0 ? "AtTheBeginningOfDelivery" : "AtTheEndOfDelivery";
    }

    // Ordre attendu : TransactionModel { FullLocked, PartialLocked, PartialImmediate, Free }.
    function _transactionModelLabel(uint8 _model) private pure returns (string memory) {
        if (_model == 0) return "FullLocked";
        if (_model == 1) return "PartialLocked";
        if (_model == 2) return "PartialImmediate";
        return "Free";
    }

    // Ordre attendu : AdvancePaymentMode { Immediate, Deferred }.
    function _advancePaymentModeLabel(uint8 _mode) private pure returns (string memory) {
        return _mode == 0 ? "Immediate" : "Deferred";
    }
}
