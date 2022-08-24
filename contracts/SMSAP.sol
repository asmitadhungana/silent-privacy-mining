// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/security/Pausable.sol";
// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPrivacyMining {
    struct Pool {
        uint256 phase;
        uint256 globalAssetsDeposit;
        uint256 globalSilentStaked;
        uint256 totalVouchersClaimed;
    }
    function depositAssetToPool(address user, uint256 assetId, uint256 amount) external;
    function pools(uint256) external returns (Pool memory);
}

contract SMSAP is Pausable, Ownable {
    address public privacyMiningContract;

    event PrivacyMiningContractAdded(address indexed _privacyMiningContract);

    function addPrivacyMiningContract(address _privacyMiningContract) external onlyOwner {
        require(_privacyMiningContract != address(0), "Invalid PMC address");
        // require(privacyMiningContract == address(0), "Privacy Mining Contract already initialized");
        privacyMiningContract = _privacyMiningContract;
        emit PrivacyMiningContractAdded(_privacyMiningContract);
    }

    function depositAsset(uint256 assetId, uint256 amount) external {
        require(amount > 0, "Amount should be a positive integer");
        
        // Check if the asset-reward Pool exists first: Cross-contract call
        // IPrivacyMining privacyMining = IPrivacyMining(privacyMiningContract);
        // IPrivacyMining.Pool memory assetRewardPool = privacyMining.pools(assetId);
        // require(assetRewardPool.phase == 1, "Asset Reward pool not deployed yet.");

        // Deposit/register the asset to the asset-reward Pool: Cross-contract call
        IPrivacyMining(privacyMiningContract).depositAssetToPool(msg.sender, assetId, amount);
    }

    
}