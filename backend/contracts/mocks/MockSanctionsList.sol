// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

contract SanctionsList is Ownable {

    mapping(address => uint256) private sanctionedGeneration;
    uint256 private currentGeneration = 1;

    // Le mapping seul ne permet aucune énumération : ces events sont le seul
    // moyen pour un client (front admin) de reconstruire la liste des
    // adresses ayant été sanctionnées, en les rejouant puis en vérifiant le
    // statut réel de chacune via isSanctioned (qui, lui, tient compte de
    // unSetAllSanctioned).
    event AddressSanctioned(address indexed account);
    event AddressUnsanctioned(address indexed account);
    event AllSanctionsCleared();

    constructor() Ownable(msg.sender) {}

    function setSanctioned(address _addr) external onlyOwner {
        sanctionedGeneration[_addr] = currentGeneration;
        emit AddressSanctioned(_addr);
    }

    function unSetSanctioned(address _addr) external onlyOwner {
        sanctionedGeneration[_addr] = 0;
        emit AddressUnsanctioned(_addr);
    }

    // Lecture volontairement publique (pas onlyOwner) : c'est le contrat
    // Meridian qui l'appelle (checkSanction), et pour cet oracle, msg.sender
    // est alors l'adresse de Meridian — jamais le owner de SanctionsList.
    // Restreindre la lecture casserait toute vérification de sanction.
    function isSanctioned(address _addr) external view returns (bool) {
        return sanctionedGeneration[_addr] == currentGeneration;
    }

    function unSetAllSanctioned() external onlyOwner {
        currentGeneration++;
        emit AllSanctionsCleared();
    }
}