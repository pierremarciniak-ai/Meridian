// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SanctionsList
/// @notice Oracle de sanctions simulé, utilisé en tests et en démo (mockSanctionsOracleAddress).
contract SanctionsList is Ownable {

    mapping(address => uint256) private sanctionedGeneration;
    uint256 private currentGeneration = 1;

    /// @notice Simule une panne de l'oracle (utilisé pour tester le fail-open de checkSanction).
    bool public broken;

    /// @dev Le mapping seul ne permet aucune énumération : ces events sont le
    /// seul moyen pour un client (front admin) de reconstruire la liste des
    /// adresses ayant été sanctionnées, en les rejouant puis en vérifiant le
    /// statut réel de chacune via isSanctioned (qui tient compte de
    /// unSetAllSanctioned).
    event AddressSanctioned(address indexed account);
    event AddressUnsanctioned(address indexed account);
    event AllSanctionsCleared();

    constructor() Ownable(msg.sender) {}

    /// @notice Transfère la propriété du contrat.
    function setNewOwner(address _newOwner) external onlyOwner {
        transferOwnership(_newOwner);
    }

    /// @notice Sanctionne une adresse.
    function setSanctioned(address _addr) external onlyOwner {
        sanctionedGeneration[_addr] = currentGeneration;
        emit AddressSanctioned(_addr);
    }

    /// @notice Lève la sanction sur une adresse.
    function unSetSanctioned(address _addr) external onlyOwner {
        sanctionedGeneration[_addr] = 0;
        emit AddressUnsanctioned(_addr);
    }

    /// @notice Indique si une adresse est actuellement sanctionnée.
    /// @dev Lecture volontairement publique (pas onlyOwner) : c'est le
    /// contrat Meridian qui l'appelle (checkSanction), et pour cet oracle,
    /// msg.sender est alors l'adresse de Meridian — jamais le owner de
    /// SanctionsList. Restreindre la lecture casserait toute vérification de
    /// sanction.
    function isSanctioned(address _addr) external view returns (bool) {
        require(!broken, "SanctionsList: oracle is down");
        return sanctionedGeneration[_addr] == currentGeneration;
    }

    /// @notice Active ou désactive la simulation de panne de l'oracle.
    function setBroken(bool _broken) external onlyOwner {
        broken = _broken;
    }

    /// @notice Lève toutes les sanctions d'un coup.
    /// @dev Incrémente currentGeneration plutôt que d'effacer le mapping :
    /// toute entrée existante devient obsolète en une seule écriture.
    function unSetAllSanctioned() external onlyOwner {
        currentGeneration++;
        emit AllSanctionsCleared();
    }
}
