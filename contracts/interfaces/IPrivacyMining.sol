// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @dev Interface of Silent Protocol's PrivacyMining contract
interface IPrivacyMining {
    event LogUpdateRewardPool(uint256 assetId, uint256 allocPoint);
    event LogUpdateSilentEmissionRate(uint256 silentPerSecond);

    event LogDepositToPool(address user, uint256 assetId, uint256 amount);
    event LogSilentStakedToPool(address user, uint256 assetId, uint256 amount);
    event LogSilentUnstakedFromPool(
        address user,
        uint256 assetId,
        uint256 amount
    );
    event LogRewardPaidByPool(uint256 assetId, address user, uint256 amount);
    event LogRewardPoolAdded(
        uint256 assetId,
        uint256 phase,
        uint256 allocPoint
    );

    event LogUpdatePoolRewards(
        uint256 assetId,
        uint256 lastRewardTime,
        uint256 globalPoolBalance,
        uint256 accSilentPerShare
    );

    /// @dev Registers into PMC whenever a deposit of `amount` is made by `user`in SMASP to an asset pool
    /// represented by its `assetId` with a reward pool deployed and currently in phase 1 in PMC.
    ///
    /// Emits a {LogDepositToPool} event
    function depositAssetToPool(
        address user,
        uint256 _assetId,
        uint256 amount
    ) external;

    /// @dev Lets a user stake `amount` Silent tokens to a reward pool for `assetId`
    /// that is currently in phase 2 in PMC
    ///
    /// It increments the pool balance of user and the pool's globalPoolBalance based on `amount`
    ///
    /// Emits a {LogSilentStakedToPool} event indicating the updated balance
    function stakeSilentToPool(uint256 _assetId, uint256 amount) external;

    /// @dev Lets a user unstake `amount` Silent tokens from a reward pool for `assetId`
    /// in phase 2 in PMC where s/he has a stake greater than or equal to `amount`
    ///
    /// It decrements the pool balance of user and the pool's globalPoolBalance based on `amount`
    ///
    /// Emits a {LogSilentUnstakedFromPool} event indicating the updated balance
    function unstakeSilentFromPool(uint256 _assetId, uint256 amount) external;

    /// @dev Lets a user claim its pending rewards of reward from a reward pool for `assetId`
    // in either of its two phases.
    ///
    /// It updates (decrements) the Silent token balance of PMC in phase 2 of the reward pool
    /// upon a successful call made by a user with pending rewards > 0.
    ///
    /// Emits a {LogRewardPaidByPool} event indicating the updated balance
    function claimRewardsFromPool(uint256 _assetId) external;
}
