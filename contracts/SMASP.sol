// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/security/Pausable.sol";
// import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPrivacyMining {
    function depositAssetToPool(address user, uint256 assetId, uint256 amount) external;
}

contract SMASP is Pausable, Ownable {
    address public privacyMiningContract;

    event PrivacyMiningContractAdded(address indexed _privacyMiningContract);

    function addPrivacyMiningContract(address _privacyMiningContract) external onlyOwner {
        require(privacyMiningContract == address(0), "Privacy Mining Contract already initialized");
        privacyMiningContract = _privacyMiningContract;
        emit PrivacyMiningContractAdded(_privacyMiningContract);
    }

    function depositAsset(uint256 assetId, uint256 amount) external {
        require(amount > 0, "Amount should be a positive integer");
        IPrivacyMining(privacyMiningContract).depositAssetToPool(msg.sender, assetId, amount);
    }

    
}