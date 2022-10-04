// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @dev Interface of Silent Protocol's PrivacyMining contract
interface IPrivacyMining {
    /// @dev Emitted when `reward` amount of vouchers/Silent tokens are added to the PMC contract
    /// for distribution during phase 1 or phase 2 of a reward pool corresponding to `assetId`
    event RewardAdded(uint256 indexed _assetId, uint256 reward);

    /// @dev Emitted when the UserPoolState.phase of `user` is updated to 2 from 1 for a reward pool
    /// corresponding to `assetId` on his/her first stake to the reward pool
    event UserEntersPhaseTwo(address indexed user, uint256 indexed _assetId);

    /// @dev Emitted when a `user` claims pending `reward` from a reward pool corresponding to `assetId`
    event RewardPaid(
        address indexed user,
        uint256 indexed _assetId,
        uint256 reward
    );

    /// @dev Emitted a `user` successfully calls any of the four mutating external functions in PMC
    /// thus updating the balance of the reward pool for `assetId` by `amount`.
    ///
    /// @param added is used to indicate wheather the `amount` was added to the pool or deducted from the pool.
    event PoolBalanceChanged(
        address user,
        uint256 indexed _assetId,
        bool indexed added,
        uint256 amount
    );

    /// @dev Registers into PMC whenever a deposit of `amount` is made by `user`in SMASP to an asset pool
    /// represented by its `assetId` with a reward pool deployed and currently in phase 1 in PMC.
    ///
    /// Emits a {PoolBalanceChanged} event
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
    /// Emits a {PoolBalanceChanged} event indicating the updated balance
    function stakeSilentToPool(uint256 _assetId, uint256 amount) external;

    /// @dev Lets a user unstake `amount` Silent tokens from a reward pool for `assetId`
    /// in phase 2 in PMC where s/he has a stake greater than or equal to `amount`
    ///
    /// It decrements the pool balance of user and the pool's globalPoolBalance based on `amount`
    ///
    /// Emits a {PoolBalanceChanged} event indicating the updated balance
    function unstakeSilentFromPool(uint256 _assetId, uint256 amount) external;

    /// @dev Lets a user claim its pending rewards of reward from a reward pool for `assetId`
    // in either of its two phases.
    ///
    /// It updates (decrements) the Silent token balance of PMC in phase 2 of the reward pool
    /// upon a successful call made by a user with pending rewards > 0.
    ///
    /// Emits a {PoolBalanceChanged} event indicating the updated balance
    function claimRewards(uint256 _assetId) external;
}
