// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;


contract SanctionsList {

    mapping(address => uint256) private sanctionedGeneration;
    uint256 private currentGeneration = 1;

    function setSanctioned(address _addr) external {
        sanctionedGeneration[_addr] = currentGeneration;
    }

    function unSetSanctioned(address _addr) external {
        sanctionedGeneration[_addr] = 0;
    }

    function isSanctioned(address _addr) external view returns (bool) {
        return sanctionedGeneration[_addr] == currentGeneration;
    }

    function unSetAllSanctioned() external {
        currentGeneration++;
    }
}