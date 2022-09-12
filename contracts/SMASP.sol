// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/security/Pausable.sol";
// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPrivacyMining {
    function depositAssetToPool(address user, uint256 assetId, uint256 amount) external;
    function getPoolPhase(uint256 assetId) external view returns (uint256);
    error OnlyCallableInPhaseOne();
}

contract SMASP is Pausable, Ownable {
    address public privacyMiningContract;

    event PrivacyMiningContractAdded(address indexed _privacyMiningContract);

    function addPrivacyMiningContract(address _privacyMiningContract) external onlyOwner {
        require(_privacyMiningContract != address(0), "Invalid PMC address");
        require(privacyMiningContract == address(0), "Privacy Mining Contract already initialized");
        privacyMiningContract = _privacyMiningContract;
        emit PrivacyMiningContractAdded(_privacyMiningContract);
    }

    function depositAsset(uint256 assetId, uint256 amount) external {
        require(amount > 0, "Amount should be a positive integer");
        // Get the phase of the corresponding asset-reward pool in PMC
        uint256 poolPhase = IPrivacyMining(privacyMiningContract).getPoolPhase(assetId);
        if (poolPhase != 1) revert IPrivacyMining.OnlyCallableInPhaseOne();

        // Deposit/register the asset to the asset-reward Pool
        IPrivacyMining(privacyMiningContract).depositAssetToPool(msg.sender, assetId, amount);
    }

    
}