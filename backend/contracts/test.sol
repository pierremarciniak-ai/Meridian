// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}

contract CompliantVault is Ownable {
    // Adresse de l'oracle Chainalysis (adresse universelle EVM)
    address public sanctionsOracle = 0x40C57923924B5c5c5455c48D93317139ADDaC8fb;

    // Interrupteur d'urgence pour l'oracle
    bool public checkSanctionsEnabled = true;

    // Liste d'exception interne (en cas de faux positif de l'oracle)
    mapping(address => bool) public isExempt;

    // Solde des utilisateurs
    mapping(address => uint256) public balances;

    // Evénements
    event SanctionsOracleUpdated(address indexed newOracle);
    event SanctionsCheckToggled(bool enabled);
    event ExemptionSet(address indexed account, bool status);
    event Deposited(address indexed user, uint256 amount);

    error AddressSanctioned(address account);

    constructor() Ownable(msg.sender) {}

    // Modificateur réutilisable pour la vérification des sanctions
    modifier onlyUnsanctioned(address _account) {
        if (checkSanctionsEnabled && !isExempt[_account]) {
            bool sanctioned = ISanctionsList(sanctionsOracle).isSanctioned(_account);
            if (sanctioned) {
                revert AddressSanctioned(_account);
            }
        }
        _;
    }

    // --- Fonction principale protégée ---
    function deposit() external payable onlyUnsanctioned(msg.sender) {
        require(msg.value > 0, "Montant invalide");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    // --- Fonctions d'administration & Secours (Circuit Breaker) ---

    /// @notice Permet de mettre à jour l'adresse de l'oracle si Chainalysis déploie une V2
    function setSanctionsOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "Adresse invalide");
        sanctionsOracle = _newOracle;
        emit SanctionsOracleUpdated(_newOracle);
    }

    /// @notice Désactive la vérification si l'oracle est défaillant ou bloqué
    function toggleSanctionsCheck(bool _enabled) external onlyOwner {
        checkSanctionsEnabled = _enabled;
        emit SanctionsCheckToggled(_enabled);
    }

    /// @notice Accorde une exemption manuelle à une adresse en cas de faux positif
    function setExemption(address _account, bool _exempt) external onlyOwner {
        isExempt[_account] = _exempt;
        emit ExemptionSet(_account, _exempt);
    }
}