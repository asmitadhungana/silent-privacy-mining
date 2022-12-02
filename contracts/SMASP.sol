// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {Owned} from 'solmate/src/auth/Owned.sol';

/// @dev Interface of the PrivacyMining contract
interface IPrivacyMining {
  function depositAssetToPool(address user, uint256 assetId, uint256 amount) external;

  error InvalidPhase(uint256 assetId, uint256 assumedPhase, uint256 correctPhase);

  function getRewardPoolPhase(uint256 _assetId) external view returns (uint256);
}

/// @dev Mock/Dummy implementation for the SMASP contract
contract SMASP is Pausable, Owned {
  using SafeERC20 for IERC20;
  address public privacyMiningContract;

  /// @dev Maps the assetId of a token to its contract address
  mapping(uint256 => address) public assetIdToToken;

  constructor() Owned(msg.sender) {}

  /// @dev Lets the owenr add the PrivacyMining Contract to SMASP
  /// Emits the event {PrivacyMiningContractAdded}
  function addPrivacyMiningContract(address _privacyMiningContract) external onlyOwner {
    require(_privacyMiningContract != address(0), 'Invalid address');
    require(privacyMiningContract == address(0), 'PMC preInitalized');
    privacyMiningContract = _privacyMiningContract;
    emit PrivacyMiningContractAdded(_privacyMiningContract);
  }

  /// @dev Lets a user deposit Asset in SMASP
  function depositAsset(uint256 _assetId, uint256 amount) external whenNotPaused {
    require(amount > 0, 'Invalid Amount');
    address _tokenAddress = assetIdToToken[_assetId];
    require(_tokenAddress != address(0), 'No Such Asset Pool');

    IERC20(_tokenAddress).safeTransferFrom(msg.sender, address(this), amount);

    //  TODO: Conditional execution for the following function

    // Get the phase of the corresponding asset-reward pool in PMC
    uint256 poolPhaseInPMC = IPrivacyMining(privacyMiningContract).getRewardPoolPhase(_assetId);

    if (poolPhaseInPMC != 1) revert IPrivacyMining.InvalidPhase(_assetId, 1, poolPhaseInPMC);

    // Deposit/register the asset to the asset-reward Pool
    IPrivacyMining(privacyMiningContract).depositAssetToPool(msg.sender, _assetId, amount);
  }

  /// @dev Lets the owner create a new asset pool in the SMASP
  function createAssetPool(address _tokenAddress) external onlyOwner {
    uint256 _assetId = uint256(uint160(_tokenAddress)); // Hashing and keeping bytes32 is much safer
    require(assetIdToToken[_assetId] == address(0), 'Pool already deployed');
    assetIdToToken[_assetId] = _tokenAddress;
    emit AssetPoolAdded(_tokenAddress, _assetId);
  }

  event PrivacyMiningContractAdded(address indexed _privacyMiningContract);
  event AssetPoolAdded(address indexed _tokenAddress, uint256 assetId);
}
