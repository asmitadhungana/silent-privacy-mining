// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Interface of the PrivacyMining contract
interface IPrivacyMining {
    struct RewardPool {
        uint8 phase;
        uint48 rewardsDuration;
        uint48 periodFinish;
        uint48 lastUpdateTime;
        uint256 rewardRate;
        uint256 rewardPerTokenStored;
        uint256 globalPoolBalance; // non-compressible
    }

    function getPoolStatus(uint256 assetId)
        external
        view
        returns (RewardPool memory);

    function depositAssetToPool(
        address user,
        uint256 assetId,
        uint256 amount
    ) external;

    error InvalidPhase(
        uint256 _assetId,
        uint8 assumedPhase,
        uint8 correctPhase
    );
}

/// @dev Mock/Dummy implementation for the SMASP contract
contract SMASP is Pausable, Ownable {
    using SafeERC20 for IERC20;
    address public privacyMiningContract;

    /// @dev Maps the assetId of a token to its contract address
    mapping(uint256 => address) public assetIdToToken;

    /// @dev Lets the owenr add the PrivacyMining Contract to SMASP
    /// Emits the event {PrivacyMiningContractAdded}
    function addPrivacyMiningContract(address _privacyMiningContract)
        external
        onlyOwner
    {
        require(_privacyMiningContract != address(0), "Invalid address");
        require(privacyMiningContract == address(0), "PMC preInitalized");
        privacyMiningContract = _privacyMiningContract;
        emit PrivacyMiningContractAdded(_privacyMiningContract);
    }

    /// @dev Lets a user deposit Asset in SMASP
    function depositAsset(uint256 _assetId, uint256 amount)
        external
        whenNotPaused
    {
        require(amount > 0, "Invalid Amount");
        address _tokenAddress = assetIdToToken[_assetId];
        require(_tokenAddress != address(0), "No Such Asset Pool");

        IERC20(_tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        // Get the phase of the corresponding asset-reward pool in PMC
        IPrivacyMining.RewardPool memory _rewardPool = IPrivacyMining(
            privacyMiningContract
        ).getPoolStatus(_assetId);
        if (_rewardPool.phase != 1)
            revert IPrivacyMining.InvalidPhase(_assetId, 1, _rewardPool.phase);

        // Deposit/register the asset to the asset-reward Pool
        IPrivacyMining(privacyMiningContract).depositAssetToPool(
            msg.sender,
            _assetId,
            amount
        );
    }

    /// @dev Lets the owner create a new asset pool in the SMASP
    function createAssetPool(address _tokenAddress) external onlyOwner {
        uint256 _assetId = uint256(uint160(_tokenAddress)); // Hashing and keeping bytes32 is much safer
        require(
            assetIdToToken[_assetId] == address(0),
            "Pool already deployed"
        );
        assetIdToToken[_assetId] = _tokenAddress;
        emit AssetPoolAdded(_tokenAddress, _assetId);
    }

    event PrivacyMiningContractAdded(address indexed _privacyMiningContract);
    event AssetPoolAdded(address indexed _tokenAddress, uint256 assetId);
}
