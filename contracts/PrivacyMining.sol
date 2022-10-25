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
error InvalidPhase(uint256 assetId, uint256 assumedPhase, uint256 correctPhase);

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
 * reward pools in PrivacyMining contract, identified by their `assetId`s
 *
 * Each reward pool will run in two phases:
 * In Phase I: Virtualtokens called vouchers will be distributed
 * In Phase II : Silent tokens will be distributed as rewards
 */
contract PrivacyMining is IPrivacyMining, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    /* ========== STATE VARIABLES ========== */

    /**
     * @dev This struct stores the information of all the
     * reward pools in the privacy mining program
     */
    struct RewardPool {
        uint8 phase;
        uint64 lastRewardTime;
        uint64 allocPoint;
        uint256 accSilentPerShare;
        uint256 globalPoolBalance;
    }

    /**
     * @dev This struct stores the information of user's state
     * in each RewardPool the user partipates in
     */
    struct UserPoolInfo {
        uint8 phase;
        uint248 userVoucherBalance;
        uint256 userPoolBalance;
        int256 rewardDebt;
    }

    /**
     * @dev Silent token contract Instance
     */
    IERC20 public immutable SILENT;

    /**
     * @dev Address of the SMASP contract
     */
    address public immutable SMASP;

    /**
     * @dev Stores the assetIds of all reward pools ever deployed
     */
    uint256[] public deployedPools;

    /**
     * @dev Maps the assetId of an asset to its RewardPool data
     */
    mapping(uint256 => RewardPool) public rewardPoolInfo;

    /**
     * @dev Maps a user address and assetId to the struct UserPoolInfo
     */
    mapping(address => mapping(uint256 => UserPoolInfo)) public userPoolInfo;

    /**
     * @dev Maps a phase (1 or 2) to total allocations of its pools
     */
    mapping(uint256 => uint256) public phaseToTotalAllocPoint;

    /**
     * @dev Stores the total number of Vouchers emitted per second during phase I
     */
    uint256 public VouchersPerSecond;

    /**
     * @dev Stores the total number of Silent tokens emitted per second during phase II
     */
    uint256 public silentEmissionRate;

    /**
     * @dev Stores the precision for both reward tokens
     */
    uint256 private constant ACC_REWARD_PRECISION = 1e18;

    /**
     * @dev Stores the reward period for PMC
     */
    uint256 public constant REWARD_PERIOD = 7 days;

    /* ========== CONSTRUCTOR ========== */

    /**
     * @dev Sets the values for {SILENT} token and {SMASP} contract
     * Both of these values are immutable: they can only be set once during construction
     *
     * Requirements:
     * `_silentToken` and `_smaspContract` cannot be the zero address
     */
    constructor(address _silentToken, address _smaspContract) {
        require(_silentToken != address(0));
        require(_smaspContract != address(0));

        SILENT = IERC20(_silentToken);
        SMASP = _smaspContract;
    }

    /* ========== MODIFIERS ========== */

    /**
     * @dev Checks if the reward pool for the given `_assetId` is in given `_phase`
     */
    modifier onlyValidPhase(uint256 _assetId, uint256 _phase) {
        uint256 rewardPoolPhase = rewardPoolInfo[_assetId].phase;
        if (rewardPoolPhase != _phase)
            revert InvalidPhase(_assetId, _phase, rewardPoolPhase);
        _;
    }

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    /**
     * @dev Fetches the information of an asset reward pool in PMC
     * @param _assetId: Asset id of asset reward pool in SMASP
     */
    function getRewardPoolInfo(uint256 _assetId)
        external
        view
        returns (RewardPool memory)
    {
        return rewardPoolInfo[_assetId];
    }

    /**
     * @dev Fetches the pending rewards for a user for a reward pool
     * @param _assetId: Asset id of asset reward pool in SMASP
     * @param _user: Address of the user for whom _pending is being computed
     * @return pending the amount of rewards pending for _user
     */
    function getPendingRewards(uint256 _assetId, address _user)
        external
        view
        returns (uint256 pending)
    {
        // Require user and rewardPool to be in the same phase
        RewardPool memory rewardPool_memory = rewardPoolInfo[_assetId];
        UserPoolInfo storage userPoolInfo_storage = userPoolInfo[_user][
            _assetId
        ];

        require(
            rewardPool_memory.phase == userPoolInfo_storage.phase,
            "User pool phase mismatch"
        );

        uint256 accSilentPerShare = rewardPool_memory.accSilentPerShare; // rewardPerToken
        uint256 globalPoolBalance = rewardPool_memory.globalPoolBalance; // globalPoolBalance

        // Compute the accSilentPerShare [ rewardPerTokenStored ]
        if (
            block.timestamp > rewardPool_memory.lastRewardTime &&
            globalPoolBalance != 0
        ) {
            uint256 duration = block.timestamp -
                rewardPool_memory.lastRewardTime;
            uint256 silentReward = (duration *
                silentEmissionRate *
                rewardPool_memory.allocPoint) /
                phaseToTotalAllocPoint[rewardPool_memory.phase];
            accSilentPerShare +=
                (silentReward * ACC_REWARD_PRECISION) /
                globalPoolBalance;
        }

        pending = uint256(
            int256(
                (userPoolInfo_storage.userPoolBalance * accSilentPerShare) /
                    ACC_REWARD_PRECISION
            ) - userPoolInfo_storage.rewardDebt
        );
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    /**
     * @dev Registers a user in Phase two of a reward pool
     * @param userPoolInfo_storage: UserPoolInfo for user for the pool
     * the UserPoolInfo.phase is changed to 2
     * the UserPoolInfo.userVoucherBalance is retained from phase 1
     * all other UserPoolInfo values are reset to default/zeroes
     *
     * Requirements:
     * - User must have collected vouchers during phase 1 of the pool
     */
    function _enterPhaseTwo(UserPoolInfo storage userPoolInfo_storage)
        internal
    {
        if (userPoolInfo_storage.userVoucherBalance == 0)
            revert IneligibleUser();

        // userVoucherBalance remains unchanged, all others change
        userPoolInfo_storage.phase = 2;
        userPoolInfo_storage.userPoolBalance = 0;
        userPoolInfo_storage.userVoucherBalance =
            userPoolInfo_storage.userVoucherBalance /
            1e18; // [ Patch: Round off for now]
    }

    /**
     * @dev Updates the reward variables of a reward pool
     * each time any user interacts with the SC [ deposits/stakes/unstakes/claims]
     * and when the owner updates the reward pool allocations
     *
     * @param _assetId: assetId of the reward pool being updated
     * @return rewardPool_memory the updated instance of RewardPool for the _assetId in memory
     */
    function updateRewardPoolVariables(uint256 _assetId)
        public
        returns (RewardPool memory rewardPool_memory)
    {
        rewardPool_memory = rewardPoolInfo[_assetId];

        uint256 currentBlockTimeStamp = block.timestamp;

        if (currentBlockTimeStamp > rewardPool_memory.lastRewardTime) {
            uint256 globalPoolBalance = rewardPool_memory.globalPoolBalance;
            // Compute the accSilentPerShare [ rewardPerTokenStored ] :: rewardPerToken()
            if (globalPoolBalance != 0) {
                uint256 duration = currentBlockTimeStamp -
                    rewardPool_memory.lastRewardTime;

                uint256 silentReward = (duration *
                    silentEmissionRate *
                    rewardPool_memory.allocPoint) /
                    phaseToTotalAllocPoint[rewardPool_memory.phase];

                rewardPool_memory.accSilentPerShare +=
                    (silentReward * ACC_REWARD_PRECISION) /
                    globalPoolBalance;

                // Update the accSilentPerShare in storage
                rewardPoolInfo[_assetId].accSilentPerShare = rewardPool_memory
                    .accSilentPerShare;
            }
            rewardPool_memory.lastRewardTime = uint64(currentBlockTimeStamp);
            // Update the reward variables of pool in storage
            rewardPoolInfo[_assetId].lastRewardTime = uint64(
                currentBlockTimeStamp
            );

            // Emit an event
            emit LogUpdatePoolRewards(
                _assetId,
                currentBlockTimeStamp,
                globalPoolBalance,
                rewardPool_memory.accSilentPerShare
            );
        }
    }

    /* ========== MUTATIVE  FUNCTIONS ========== */

    /**
     * @dev See {IPrivacyMining-depositAssetToPool}
     * @param _user: Assset id of asset reward pool in SMASP
     * @param _assetId: Assset id of asset reward pool in SMASP
     * @param _amount: Deposit amount of user in SMASP to be registered for the pool
     *
     * Updates the pool balance of the pool and user based on `_amount`
     * Emits a {LogDepositToPool} event
     *
     * Requirements:
     * - can only be called by SMASP contract
     * - rewardPool for `_assetId` must be in phase I
     * - reward period for phase I must not have completed already
     */
    function depositAssetToPool(
        address _user,
        uint256 _assetId,
        uint256 _amount
    ) public override onlyValidPhase(_assetId, 1) {
        // CHECKS
        require(msg.sender == SMASP, "Only SMASP can call");

        UserPoolInfo storage userPoolInfo_storage = userPoolInfo[_user][
            _assetId
        ];
        // In first ever deposit: change user's pool phase to 1
        if (userPoolInfo_storage.phase == 0) {
            userPoolInfo_storage.phase = 1;
        }

        RewardPool memory rewardPool_memory = updateRewardPoolVariables(
            _assetId
        );

        // EFFECTS
        // 1. Change userPoolBalance
        userPoolInfo_storage.userPoolBalance += _amount;

        // 2. Change userAccSilentPerShare [userPoolRewardPerTokenPaid] :: rewardsPending()
        // userPoolAccumulatedRewards += (userPoolBalance * (RewardPool.rewardPerTokenStored - userPoolRewardPerToken) / 1e25);
        // Just adding to the rewardDebt of the user [?]
        userPoolInfo_storage.rewardDebt += int256(
            (_amount * rewardPool_memory.accSilentPerShare) /
                ACC_REWARD_PRECISION
        );

        rewardPoolInfo[_assetId].globalPoolBalance += _amount;

        // EVENT
        emit LogDepositToPool(_user, _assetId, _amount);
    }

    /**
     * @dev See {IPrivacyMining-stakeSilentToPool}
     * @param _assetId: Assset id of asset reward pool
     * @param _amount: Amount of Silent tokens to be staked
     *
     * Lets user stake their Silent tokens to a reward pool
     *
     * - _amount cannot be zero
     * - reward pool must be in phase 2
     * - the current reward period shouldn't have completed
     * - the contract must be in unpaused state
     * - the user must have participated in phase 1 of the reward pool:
     *   UserPoolState.phase should not be zero
     * - the user must have collected voucher rewards in phase 1
     *
     * Updates the balance of user and the pool based on `_amount`
     *
     * Emits a {LogSilentStakedToPool} event indicating the staked amount
     */
    function stakeSilentToPool(uint256 _assetId, uint256 _amount)
        external
        override
        onlyValidPhase(_assetId, 2)
    {
        RewardPool memory rewardPool_memory = updateRewardPoolVariables(
            _assetId
        );
        UserPoolInfo storage userPoolInfo_storage = userPoolInfo[msg.sender][
            _amount
        ];

        // Verify that the user participated in phase one of reward pool
        if (userPoolInfo_storage.phase == 0) revert IneligibleUser();
        // If user's phase w.r.t reward pool is one, upgrade it to two
        if (userPoolInfo_storage.phase == 1) {
            _enterPhaseTwo(userPoolInfo_storage);
        }

        // Compute the effective stake for user in the reward pool
        // [ Effective stake = ( user's total silent stake * user's voucher balance ) w.r.t. reward pool ]
        uint256 userEffectiveStakeAmount = _amount *
            userPoolInfo_storage.userVoucherBalance;

        // Add the effective stake amount to the userPoolBalance
        userPoolInfo_storage.userPoolBalance += userEffectiveStakeAmount;
        // Compute the user's new rewardDebt in the pool and update it
        userPoolInfo_storage.rewardDebt += int256(
            (userEffectiveStakeAmount * rewardPool_memory.accSilentPerShare) /
                ACC_REWARD_PRECISION
        );
        // Add the effective stake amount to the rewardPool's globalPoolBalance
        rewardPoolInfo[_assetId].globalPoolBalance += userEffectiveStakeAmount;

        // Transfer the staked amount from user to the contract
        SILENT.safeTransferFrom(msg.sender, address(this), _amount);
        // Emit an event to notify
        emit LogSilentStakedToPool(msg.sender, _assetId, _amount);
    }

    /**
     * @dev See {IPrivacyMining-unstakeSilentFromPool}
     * @param _assetId: Assset id of asset reward pool
     * @param _amount: Amount of Silent tokens to be unstaked
     *
     * Lets user(caller) unstake their Silent tokens from a reward pool
     *
     * Requirements
     * - reward pool must be in phase 2
     * - `_amount` cannot be less than user's total stake in the pool
     * - user must be in phase 2 for the given reward pool
     *
     * Updates the balance of user and the pool based on `_amount` powered by
     * user's total voucher balance
     * Transfers `_amount` Silent tokens from contract to the user
     *
     * Emits a {LogSilentUnstakedFromPool} event indicating the updated balance
     */
    function unstakeSilentFromPool(uint256 _assetId, uint256 _amount)
        external
        override
        onlyValidPhase(_assetId, 2)
    {
        RewardPool memory rewardPool_memory = updateRewardPoolVariables(
            _assetId
        );
        UserPoolInfo storage userPoolInfo_storage = userPoolInfo[msg.sender][
            _amount
        ];

        // Verify that user is in phase 2 w.r.t the reward pool
        if (userPoolInfo_storage.phase != 2) revert IneligibleUser();

        // Compute the original amount staked in the pool by the user
        uint256 userOriginalStake;
        unchecked {
            userOriginalStake =
                userPoolInfo_storage.userPoolBalance /
                userPoolInfo_storage.userVoucherBalance;
        }

        // Verify that the staked amount is greater than the amount being unstaked
        if (_amount == 0 || userOriginalStake < _amount) revert InvalidAmount();

        // Compute the effective amount being unstaked
        uint256 userEffectiveUnstakeAmount = _amount *
            userPoolInfo_storage.userVoucherBalance;

        // Deduce effective unstake amount from userPoolBalance
        userPoolInfo_storage.userPoolBalance -= userEffectiveUnstakeAmount;
        // Change user's reward debt in the pool
        userPoolInfo_storage.rewardDebt -= int256(
            (userEffectiveUnstakeAmount * rewardPool_memory.accSilentPerShare) /
                ACC_REWARD_PRECISION
        );
        // Change the rewardPool's globalPoolBalance
        rewardPoolInfo[_assetId]
            .globalPoolBalance -= userEffectiveUnstakeAmount;

        // Transfer the unstaked amount from contract to user
        SILENT.safeTransfer(msg.sender, _amount);
        emit LogSilentUnstakedFromPool(msg.sender, _assetId, _amount);
    }

    /**
     * @dev See {IPrivacyMining-claimRewardsFromPool} -> lets a user claim rewards if it has been accumulated
     * @param _assetId: Assset id of asset reward pool
     *
     * Note: Doesn't pay out the reward if user has accumulated zero reward in the given pool
     *
     * Emits a {LogRewardPaidByPool} event indicating the paid reward
     * Updates the reward parameters of the reward pool
     *
     * Requirements:
     * - user's phase in the reward pool should match reward pool's current phase
     */
    function claimRewardsFromPool(uint256 _assetId) external override {
        RewardPool memory rewardPool_memory = updateRewardPoolVariables(
            _assetId
        );
        UserPoolInfo storage userPoolInfo_storage = userPoolInfo[msg.sender][
            _assetId
        ];

        // Verify that the user is in same phase w.r.t the reward pool
        if (userPoolInfo_storage.phase != rewardPool_memory.phase)
            revert InvalidPhase(
                _assetId,
                userPoolInfo_storage.phase,
                rewardPool_memory.phase
            );

        // Calculate the user's pending reward till the latest block
        int256 silentReward = int256(
            userPoolInfo_storage.userPoolBalance *
                rewardPool_memory.accSilentPerShare
        ) / 1e25;
        uint256 userPendingReward = uint256(
            silentReward - userPoolInfo_storage.rewardDebt
        );

        // If the pending reward is > 0, transfer it to the user
        if (userPendingReward != 0) {
            if (rewardPool_memory.phase == 2) {
                SILENT.safeTransfer(msg.sender, userPendingReward);
            } else if (rewardPool_memory.phase == 1) {
                userPoolInfo_storage.userVoucherBalance += uint248(
                    userPendingReward
                );
            }
            emit LogRewardPaidByPool(_assetId, msg.sender, userPendingReward);
        }
    }

    /* ========== OWNER RESTRICTED FUNCTIONS ========== */

    /**
     * @dev See {IPrivacyMining-addRewardPool}
     *
     * @param _assetId: assetId of the reward pool
     * @param _phase : _phase to be initialized
     * @param _allocPoint: reward allocation point for the reward pool
     *
     * Lets the owner of the pool add a new reward pool to PMC
     * or upgrade a reward pool from phase one to two
     *
     * Emits the event {LogRewardPoolAdded} denoting the _assetId, _phase and _allocPoint of the rewardPool
     *
     * Requirements:
     * - a corresponding asset pool in SMASP should exist for provided `_assetId`
     * - `_phase` must either be 1 or 2
     * - The rewardPool's initial phase must be 1 less than `_phase`
     */
    function addRewardPool(
        uint256 _assetId,
        uint256 _phase,
        uint256 _allocPoint
    ) external onlyOwner {
        RewardPool storage rewardPool_storage = rewardPoolInfo[_assetId];

        // Verify that the _phase being initialized is either one or two
        require(_phase == 1 || _phase == 2, "Invalid Phase");

        // Verify that the reward pool's phase is one less than new _phase
        if (rewardPool_storage.phase != _phase - 1)
            revert InvalidPhase({
                assetId: _assetId,
                assumedPhase: _phase,
                correctPhase: rewardPool_storage.phase
            });

        // If the Reward Pool is getting added to PMC for phase one
        if (_phase == 1) {
            // Verify that a corresponding asset pool exists in SMASP
            require(
                ISMASP(SMASP).assetIdToToken(_assetId) != address(0),
                "Invalid _assetId"
            );
            // Add the assetId to the list of deployed pools
            deployedPools.push(_assetId);
        } else {
            // If Reward pool is getting upgraded to phase two
            // Reset reward pool's accSilentPerShare and globalPoolBalance
            rewardPool_storage.accSilentPerShare = 0;
            rewardPool_storage.globalPoolBalance = 0;
        }

        // Add to the totalAllocPoint for the phase
        phaseToTotalAllocPoint[_phase] += _allocPoint;

        // Initialize the attributes for the pool's RewardPool struct
        rewardPool_storage.phase = uint8(_phase);
        rewardPool_storage.allocPoint = uint64(_allocPoint);
        rewardPool_storage.lastRewardTime = uint64(block.timestamp);

        // Emit an event to notify
        emit LogRewardPoolAdded(_assetId, _phase, _allocPoint);
    }

    /**
     * @dev Lets the owner update the allocation points for a reward pool
     *
     * @param _assetId: assetId of the reward pool
     * @param _phase: expected phase of the reward pool
     * @param _newAllocPoint: reward allocation point for the reward pool
     *
     * Updates the reward pool variables
     *
     * Emits the event {LogUpdateRewardPool} denoting
     * the _assetId and _newAllocPoint of the rewardPool
     *
     * Requirements:
     * - reward pool's phase must match provided `_phase`
     */
    function updateRewardPoolAllocations(
        uint256 _assetId,
        uint256 _phase,
        uint256 _newAllocPoint
    ) external onlyOwner onlyValidPhase(_assetId, _phase) {
        uint256 poolPhase = rewardPoolInfo[_assetId].phase;

        // Update reward pool variables
        updateRewardPoolVariables(_assetId);

        // Update the total allocations for the phase
        phaseToTotalAllocPoint[poolPhase] =
            (phaseToTotalAllocPoint[poolPhase] -
                rewardPoolInfo[_assetId].allocPoint) +
            _newAllocPoint;
        // Update the allocations for the reward pool
        rewardPoolInfo[_assetId].allocPoint = uint64(_newAllocPoint);

        // Emit an event to notify
        emit LogUpdateRewardPool(_assetId, _newAllocPoint);
    }

    /**
     * @dev Lets the owner update the `silentEmissionRate` for PMC
     *
     * @param _silentEmissionRate: assetId of the reward pool
     *
     * Emits the event {LogUpdateSilentEmissionRate} denoting the newly updated
     * `silentEmissionRate`
     *
     */
    function setSilentEmissionRate(uint256 _silentEmissionRate)
        external
        onlyOwner
    {
        // Might need to update all the reward pools beforehand
        silentEmissionRate = _silentEmissionRate;
        emit LogUpdateSilentEmissionRate(_silentEmissionRate);
    }

    // TIMELOCK
    function withdrawExcessPoolRewards() external onlyOwner {}
}
