// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/Math.sol";
import "./libraries/SafeERC20.sol";
import "./interfaces/IPrivacyMining.sol";
import "hardhat/console.sol";

/**
 * @dev the interface for the Silent Multi Asset Shielded Pool contract
 */
interface ISMASP {
    function assetIdToToken(uint256) external returns (address);
}

/**
 * @dev Thrown when the deposit/stake functions are called after
 * reward period for the pool finishes
 */
error RewardPeriodFinished();

/**
 * @dev Thrown when a function is accessed during the wrong phase
 */
error InvalidPhase(uint256 _assetId, uint8 assumedPhase, uint8 correctPhase);

/**
 * @dev Thrown when the amount passed to a function is ZERO or invalid
 */
error InvalidAmount();

/**
 * @dev Thrown when a user inelligible to participate in a given reward
 * pool accesses a mutable function
 */
error IneligibleUser();

/**
 * @dev Implementation of the {IPrivacyMining} interface
 * This contract will conduct the privacy mining program
 * all the asset pools deployed in the SMASP
 *
 * All the shielded asset pools in SMASP will have a corresponding
 * reward pools in PrivacyMining contract, identified by their "assetId"s
 *
 * Each reward pool will run in two phases:
 * In Phase I: Virtualtokens called vouchers will be distributed
 * In Phase II : Silent tokens will be distributed as rewards
 */
contract PrivacyMining is IPrivacyMining, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    /**
     * @dev Silent token contract Instance
     */
    IERC20 public immutable silentToken;

    /**
     * @dev Address of the SMASP contract
     */
    address public immutable smaspContract;

    /**
     * @dev Address of the rewardsDistributor
     * No implementation is made in the current iteration
     * It may be best initialized according to reward pools
     */
    address public immutable rewardsDistributor;

    /**
     * @dev This struct stores the information of all the
     * reward pools in the privacy mining program
     */
    struct RewardPool {
        uint8 phase;
        uint48 rewardsDuration;
        uint48 periodFinish;
        uint48 lastUpdateTime;
        uint256 rewardRate;
        uint256 rewardPerTokenStored;
        uint256 globalPoolBalance; // non-compressible
    }

    /**
     * @dev Maps the assetId of an asset to its RewardPool data
     */
    mapping(uint256 => RewardPool) public rewardForPool;

    /**
     * @dev Stores the assetIds of all reward pools ever deployed
     */
    uint256[] public deployedPools;

    /**
     * @dev This struct stores the information of user's state
     * in each RewardPool the user partipates in
     */
    struct UserPoolState {
        uint248 userPoolVoucherBalance;
        uint8 phase;
        uint256 userPoolRewardPerTokenPaid; // compressible
        uint256 userPoolAccumulatedRewards; // compressible [dependent upon voucher/silent total supply]
        uint256 userPoolBalance; // non-compressible
    }

    /**
     * @dev Maps a user address and assetId to the struct UserPoolState
     */
    mapping(address => mapping(uint256 => UserPoolState)) public userPoolState;

    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Sets the values for {silentToken] {smaspContract} and {rewardsDistributor}
     * All three of these values are immutable: they can only be set once during construction
     *
     * Requirements:
     * `_silentToken`, `_smaspContract` and `rewardsDistributor` cannot be the zero address
     */
    constructor(
        address _silentToken,
        address _smaspContract,
        address _rewardsDistributor
    ) {
        require(_silentToken != address(0));
        require(_smaspContract != address(0));
        require(_rewardsDistributor != address(0));

        silentToken = IERC20(_silentToken);
        smaspContract = _smaspContract;
        rewardsDistributor = _rewardsDistributor;
    }

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    /**
     * @dev Fetches information of all assset reward pools deployed in the PMC
     */
    function getDeployedPools() external view returns (RewardPool[] memory) {
        uint256[] memory _deployedPools = deployedPools;
        RewardPool[] memory rewardPools = new RewardPool[](
            _deployedPools.length
        );

        for (uint256 i = 0; i < _deployedPools.length; ) {
            rewardPools[i] = rewardForPool[_deployedPools[i]];
            unchecked {
                ++i;
            }
        }
        return rewardPools;
    }

    /**
     * @dev Fetches the information of an asset reward pool in PMC
     * @param _assetId: Assset id of asset reward pool in SMASP
     */
    function getPoolStatus(uint256 _assetId)
        external
        view
        returns (RewardPool memory)
    {
        return rewardForPool[_assetId];
    }

    /**
     * @dev Fetches the pending rewards for a user for a reward pool
     * @param _assetId: Assset id of asset reward pool in SMASP
     */
    function getPendingRewards(address user, uint256 _assetId)
        external
        view
        returns (uint256 _rewardsPending)
    {
        require(
            userPoolState[user][_assetId].phase ==
                rewardForPool[_assetId].phase,
            "Phase mismatch"
        );
        (_rewardsPending, , ) = rewardsPending(
            userPoolState[user][_assetId],
            rewardForPool[_assetId],
            _assetId
        );
    }

    /**
     * @dev Just a helper function for testing purposes
     * @param _assetId: Assset id of asset reward pool in SMASP
     */
    function changePoolToPhaseTwo(uint256 _assetId) external {
        rewardForPool[_assetId].periodFinish = uint48(block.timestamp);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    /**
     * @dev Registers a user in Phase two of a reward pool
     * @param userPoolState__: UserPoolState for user for the pool
     * the UserPoolState.phase is changed to 2
     * the UserPoolState.userPoolVoucherBalance is retained from phase 1
     * all other UserPoolState values are reset to default/zeroes
     *
     * Requirements:
     * - User must have collected vouchers during phase 1 of the pool
     */
    function _enterPhaseTwo(UserPoolState storage userPoolState__) internal {
        if (userPoolState__.userPoolVoucherBalance == 0)
            revert IneligibleUser();

        // userPoolVoucherBalance remains unchanged, all others change
        userPoolState__.phase = 2;
        userPoolState__.userPoolRewardPerTokenPaid = 0;
        userPoolState__.userPoolAccumulatedRewards = 0;
        userPoolState__.userPoolBalance = 0;
        // userPoolState__.userPoolVoucherBalance = userPoolState__
        //     .userPoolVoucherBalance;
        userPoolState__.userPoolVoucherBalance =
            userPoolState__.userPoolVoucherBalance /
            1e18; // [ Patch: Round off for now]
    }

    /**
     * @dev See {IPrivacyMining-depositAssetToPool}
     * @param user: Assset id of asset reward pool in SMASP
     * @param _assetId: Assset id of asset reward pool in SMASP
     * @param amount: Deposit amount of user in SMASP to be registered for the pool
     *
     * Updates the pool balance of the pool and user based on `amount`
     * Emits a {PoolBalanceChanged} event
     *
     * Requirements:
     * - can only be called by SMASP contract
     * - rewardPool for `_assetId` must be in phase I
     * - reward period for phase I must not have completed already
     */
    function depositAssetToPool(
        address user,
        uint256 _assetId,
        uint256 amount
    )
        external
        virtual
        override
        nonReentrant
        onlyValidPhase(_assetId, 1)
        beforePeriodFinished(_assetId)
    {
        require(msg.sender == smaspContract, "Caller not SMASP");

        UserPoolState storage userPoolState__ = userPoolState[user][_assetId];
        RewardPool storage rewardForPool__ = rewardForPool[_assetId];

        if (userPoolState__.phase == 0) {
            userPoolState__.phase = 1;
        }

        _updateReward(rewardForPool__, userPoolState__, _assetId, user);

        rewardForPool__.globalPoolBalance += amount;
        userPoolState__.userPoolBalance += amount;

        emit PoolBalanceChanged(user, _assetId, true, amount);
    }

    /**
     * @dev See {IPrivacyMining-stakeSilentToPool}
     * @param _assetId: Assset id of asset reward pool
     * @param amount: Amount of Silent tokens to be staked
     *
     * Lets user stake their Silent tokens to a reward pool
     *
     * - amount cannot be zero amount
     * - reward pool must be in phase 2
     * - the current reward period shouldn't have completed
     * - the contract must be in unpaused state
     * - the user must have participated in phase 1 of the reward pool:
     *   UserPoolState.phase should not be zero
     * - the user must have collected voucher rewards in phase 1
     *
     * Updates the balance of user and the pool based on `amount`
     *
     * Emits a {PoolBalanceChanged} event indicating the updated balance
     */
    function stakeSilentToPool(uint256 _assetId, uint256 amount)
        external
        virtual
        override
        nonReentrant
        onlyValidPhase(_assetId, 2)
        beforePeriodFinished(_assetId)
        whenNotPaused
    {
        if (amount == 0) revert InvalidAmount();
        UserPoolState storage userPoolState__ = userPoolState[msg.sender][
            _assetId
        ];
        RewardPool storage rewardForPool__ = rewardForPool[_assetId];

        if (userPoolState__.phase == 0) revert IneligibleUser();
        if (userPoolState__.phase == 1) {
            _enterPhaseTwo(userPoolState__);
        }

        _updateReward(rewardForPool__, userPoolState__, _assetId, msg.sender);

        uint256 userEffectiveStakeAmount = amount *
            userPoolState__.userPoolVoucherBalance;

        userPoolState__.userPoolBalance += userEffectiveStakeAmount;
        rewardForPool__.globalPoolBalance += userEffectiveStakeAmount;

        silentToken.safeTransferFrom(msg.sender, address(this), amount);
        emit PoolBalanceChanged(msg.sender, _assetId, true, amount);
    }

    /**
     * @dev See {IPrivacyMining-unstakeSilentFromPool}
     * @param _assetId: Assset id of asset reward pool
     * @param amount: Amount of Silent tokens to be unstaked
     *
     * Lets user unstake their Silent tokens from a reward pool
     *
     * Requirements
     * - reward pool must be in phase 2
     * - `amount` cannot be less than user's total stake in the pool
     * - user must be in phase 2 for the given reward pool
     *
     * Updates the balance of user and the pool based on `amount` powered by
     * user's total voucher balance
     * Transfers `amount` Silent tokens from contract to the user
     *
     * Emits a {PoolBalanceChanged} event indicating the updated balance
     */
    function unstakeSilentFromPool(uint256 _assetId, uint256 amount)
        external
        virtual
        override
        nonReentrant
        onlyValidPhase(_assetId, 2)
    {
        UserPoolState storage userPoolState__ = userPoolState[msg.sender][
            _assetId
        ];
        RewardPool storage rewardForPool__ = rewardForPool[_assetId];

        if (userPoolState__.phase != 2) revert IneligibleUser();

        uint256 userOriginalStake;
        unchecked {
            userOriginalStake =
                userPoolState__.userPoolBalance /
                userPoolState__.userPoolVoucherBalance;
        }

        console.log(
            "userOriginalStake: %s , amount: %s",
            userOriginalStake,
            amount
        );

        if (amount == 0 || userOriginalStake < amount) revert InvalidAmount();

        _updateReward(rewardForPool__, userPoolState__, _assetId, msg.sender);

        uint256 userEffectiveUnstakeAmount = amount *
            userPoolState__.userPoolVoucherBalance;

        rewardForPool[_assetId].globalPoolBalance -= userEffectiveUnstakeAmount;
        userPoolState__.userPoolBalance -= userEffectiveUnstakeAmount;

        silentToken.safeTransfer(msg.sender, amount);
        emit PoolBalanceChanged(msg.sender, _assetId, false, amount);
    }

    /**
     * @dev See {IPrivacyMining-claimRewards} -> lets a user claim rewards if it has been accumulated
     * @param _assetId: Assset id of asset reward pool
     *
     * Note: Doesn't pay out the reward if user has accumulated zero reward in the given pool
     *
     * Emits a {RewardPaid} event indicating the paid reward
     * Updates the reward parameters of the reward pool
     *
     * Requirements:
     * - user's phase in the reward pool should match reward pool's current phase
     */
    function claimRewards(uint256 _assetId)
        external
        virtual
        override
        nonReentrant
    {
        UserPoolState storage userPoolState__ = userPoolState[msg.sender][
            _assetId
        ];
        RewardPool storage rewardForPool__ = rewardForPool[_assetId];

        // User can only claim within a phase
        if (userPoolState__.phase != rewardForPool__.phase)
            revert InvalidPhase(
                _assetId,
                userPoolState__.phase,
                rewardForPool__.phase
            );

        _updateReward(rewardForPool__, userPoolState__, _assetId, msg.sender);

        uint256 reward = userPoolState__.userPoolAccumulatedRewards;

        if (reward != 0) {
            userPoolState__.userPoolAccumulatedRewards = 0;
            if (userPoolState__.phase == 2) {
                silentToken.safeTransfer(msg.sender, reward);
            } else if (userPoolState__.phase == 1) {
                userPoolState__.userPoolVoucherBalance += uint248(reward);
            }
            emit RewardPaid(msg.sender, _assetId, reward);
        }
    }

    /* ========== PUBLIC VIEW FUNCTIONS ========== */

    /**
     * @dev Computes the last reward claimable time for a reward pool
     * @param _assetId: Assset id of asset reward pool
     */
    function lastTimeRewardApplicable(uint256 _assetId)
        public
        view
        returns (uint48)
    {
        return
            uint48(
                Math.min(block.timestamp, rewardForPool[_assetId].periodFinish)
            );
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    /**
     * @dev Computes the running sum of rewardRate per token of a reward pool
     * since it was last updated
     * @param rewardForPool__: Storage pointer to the rewardForPool_
     * @param _lastTimeRewardApplicable: last applicable reward time for pool
     */
    function rewardPerToken(
        RewardPool storage rewardForPool__,
        uint48 _lastTimeRewardApplicable
    ) internal view returns (uint256) {
        if (rewardForPool__.globalPoolBalance == 0) {
            return rewardForPool__.rewardPerTokenStored;
        }

        return
            rewardForPool__.rewardPerTokenStored +
            ((uint256(rewardForPool__.rewardRate) *
                (_lastTimeRewardApplicable - rewardForPool__.lastUpdateTime) *
                1e25) / rewardForPool__.globalPoolBalance);
    }

    /**
     * @dev Computes the pending rewards for a user in a reward pool
     *
     * @param userPoolState__: storage pointer to the user's userPoolState_ for the pool
     * @param rewardForPool__: storage pointer to the user's rewardForPool[_assetId] of the pool
     * @param _assetId: assetId of the reward pool
     */
    function rewardsPending(
        UserPoolState storage userPoolState__,
        RewardPool storage rewardForPool__,
        uint256 _assetId
    )
        internal
        view
        returns (
            uint256 _rewardsPending,
            uint256 _rewardPerTokenStored,
            uint48 _lastTimeRewardApplicable
        )
    {
        _lastTimeRewardApplicable = lastTimeRewardApplicable(_assetId);
        _rewardPerTokenStored = rewardPerToken(
            rewardForPool__,
            _lastTimeRewardApplicable
        );
        // k*(s-p[user])
        _rewardsPending =
            ((userPoolState__.userPoolBalance *
                (rewardPerToken(rewardForPool__, _lastTimeRewardApplicable) -
                    userPoolState__.userPoolRewardPerTokenPaid)) / 1e25) +
            userPoolState__.userPoolAccumulatedRewards;
    }

    /**
     * @dev Updates the reward each time any user interacts with the SC [ deposit/stake/unstake/claim]
     * and when the owner updates the reward pool [updateRewardPool]
     *
     * @param userPoolState__: storage pointer to the user's userPoolState_ for the pool
     * @param rewardForPool__: storage pointer to the user's rewardForPool[_assetId] of the pool
     * @param _assetId: assetId of the reward pool
     * @param user : address of the user who initiated the call
     */
    function _updateReward(
        RewardPool storage rewardForPool__,
        UserPoolState storage userPoolState__,
        uint256 _assetId,
        address user
    ) internal {
        (
            uint256 _rewardsPending,
            uint256 _rewardPerTokenStored,
            uint48 _lastTimeRewardApplicable
        ) = rewardsPending(userPoolState__, rewardForPool__, _assetId);

        rewardForPool__.lastUpdateTime = _lastTimeRewardApplicable;
        rewardForPool__.rewardPerTokenStored = _rewardPerTokenStored;

        if (user != address(0)) {
            // store the pending rewards for the user in `userPoolAccumulatedRewards`
            userPoolState__.userPoolAccumulatedRewards = _rewardsPending;
            // updae the `userPoolRewardPerTokenPaid` with later `rewardPerTokenStored`
            userPoolState__.userPoolRewardPerTokenPaid = _rewardPerTokenStored;
        }
    }

    /* ========== MODIFIERS ========== */

    /**
     * @dev Checks if the reward pool for the given `_assetId` is in given `_phase`
     */
    modifier onlyValidPhase(uint256 _assetId, uint8 _phase) {
        uint8 rewardPoolPhase = rewardForPool[_assetId].phase;
        if (rewardPoolPhase != _phase)
            revert InvalidPhase(_assetId, _phase, rewardPoolPhase);
        _;
    }

    /**
     * @dev Checks if the reward period for the given `_assetId` has already finished
     */
    modifier beforePeriodFinished(uint256 _assetId) {
        if (block.timestamp > rewardForPool[_assetId].periodFinish)
            revert RewardPeriodFinished();
        _;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    /**
     * @dev See {IPrivacyMining-createAssetRewardPool}
     *
     * @param _assetId: assetId of the reward pool
     * @param _phase : new _phase to be initialized
     * @param reward: reward amount (in 1e18 decimals) to be distributed
     * @param _rewardsDuration: duration of the reward period
     *
     * Lets the owner of the pool initialize a new Asset-Reward Pool
     * or update the phase of an asset reward pool from 1 to 2
     *
     * Emits the event {RewardAdded} denoting the added reward amount and
     * the assetId of therewardPool  for which it is initialized
     *
     * Requirements:
     * - a corresponding asset pool in SMASP should exist for provided `_assetId`
     * - `reward` must be greater than `rewardsDuration`
     * - `_phase` must either be 1 or 2
     * - The rewardPool's phase must be 1 less than passed `_phase`
     * - If rewardPool is being created for phase 2, phase 1's current
     *   reward-period should have already gotten completed
     */
    function createAssetRewardPool(
        uint256 _assetId,
        uint8 _phase,
        uint256 reward,
        uint48 _rewardsDuration
    ) external onlyOwner {
        require(reward > _rewardsDuration, "Invalid Duration");

        RewardPool storage rewardForPool__ = rewardForPool[_assetId];

        if (rewardForPool__.phase != _phase - 1)
            revert InvalidPhase(_assetId, _phase, rewardForPool__.phase);

        if (_phase == 1) {
            require(
                ISMASP(smaspContract).assetIdToToken(_assetId) != address(0),
                "Invalid Asset Pool"
            );
            deployedPools.push(_assetId);
        } else if (_phase == 2) {
            if (block.timestamp < rewardForPool__.periodFinish)
                revert("Phase One Ongoing");
            silentToken.safeTransferFrom(msg.sender, address(this), reward);
        } else {
            revert InvalidPhase(_assetId, _phase, rewardForPool__.phase);
        }

        // Initialize the reward attributes for the pool
        rewardForPool__.phase = _phase;
        rewardForPool__.rewardsDuration = _rewardsDuration;
        rewardForPool__.periodFinish = uint48(
            block.timestamp + _rewardsDuration
        );
        rewardForPool__.lastUpdateTime = uint48(block.timestamp);
        rewardForPool__.rewardRate = reward / _rewardsDuration;
        rewardForPool__.rewardPerTokenStored = 0;
        rewardForPool__.globalPoolBalance = 0;

        emit RewardAdded(_assetId, reward);
    }

    /**
     * @dev See {IPrivacyMining-updateRewardPool}
     * @param _assetId: assetId of the reward pool
     * @param reward: reward amount to be added/updated
     * Lets the owner of the pool update the reward for an existing reward pool
     * Might change the caller to be rewardsDistributor
     *
     * Emits the event {RewardAdded} denoting the added reward amount and
     *  phase at which the rewardPool is updated
     *
     * Adds the provided reward to exisiting reward if the reward period for the
     *  pool is ongoing
     * Initiates a new reward period with same rewardsDuration as before if the
     *  current reward period for the rewardPool has already completed
     */
    function updateRewardPool(uint256 _assetId, uint256 reward)
        external
        onlyOwner
    {
        RewardPool storage rewardForPool__ = rewardForPool[_assetId];
        // Extra storage read done just to call this function
        _updateReward(
            rewardForPool__,
            userPoolState[address(0)][0],
            _assetId,
            address(0)
        );

        if (block.timestamp >= rewardForPool__.periodFinish) {
            unchecked {
                rewardForPool__.rewardRate =
                    reward /
                    rewardForPool__.rewardsDuration;
            }
            rewardForPool__.periodFinish =
                uint48(block.timestamp) +
                rewardForPool__.rewardsDuration;
        } else {
            uint256 remaining = uint256(rewardForPool__.periodFinish) -
                block.timestamp;
            uint256 leftover = remaining * rewardForPool__.rewardRate;
            unchecked {
                rewardForPool__.rewardRate = (reward + leftover) / remaining;
            }
        }

        rewardForPool__.lastUpdateTime = uint48(block.timestamp);
        emit RewardAdded(_assetId, reward);
    }
}
