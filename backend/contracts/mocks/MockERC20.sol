// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Token ERC-20 minimaliste pour les tests locaux uniquement.
/// @dev mint() est volontairement public/sans restriction : NE JAMAIS
/// déployer ce contrat ailleurs qu'en local ou sur un testnet dédié aux tests.
contract MockERC20 is ERC20 {
    uint8 private immutable _customDecimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _customDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    /// @notice Mint librement des tokens à n'importe quelle adresse (tests uniquement).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
