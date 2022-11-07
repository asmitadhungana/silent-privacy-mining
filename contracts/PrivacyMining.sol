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
 * @dev Thrown when a function is accessed during the wrong phase
 */
error InvalidPhase(uint256 assetId, uint256 assumedPhase, uint256 correctPhase);

/**
 * @dev Thrown when the amount passed to a function is ZERO or invalid
 */
error InvalidAmount();

/**
 * @dev Thrown when a user ineligible to participate in a given reward
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
        uint256 accRewardPerShare;
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

    /// Construct an additional struct for phase [?]

    /**
     * @dev Silent token contract Instance expect(
        (await PrivacyMining.rewardPooInfo(WETH.address)).allocPoint
      ).to.equal(old_allocPoint);
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
     * @dev Maps a phase (1 or 2) to its reward emission rate (per second)
     */
    mapping(uint256 => uint256) public phaseToRewardEmissionRate;

    /**
     * @dev Stores the precision for both reward tokens
     */
    uint256 private constant ACC_REWARD_PRECISION = 1e18;

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
        revert InvalidPhase({
                assetId: _assetId,
                assumedPhase: _phase,
                correctPhase: rewardPoolPhase
            });
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

        uint256 accRewardPerShare = rewardPool_memory.accRewardPerShare;
        uint256 globalPoolBalance = rewardPool_memory.globalPoolBalance;

        // Compute the accRewardPerShare for the pool
        if (
            block.timestamp > rewardPool_memory.lastRewardTime &&
            globalPoolBalance != 0
        ) {
            uint256 blocksSinceLastReward = block.timestamp -
                rewardPool_memory.lastRewardTime;

            uint256 totalRewardsAccruedInPool = (blocksSinceLastReward *
                phaseToRewardEmissionRate[rewardPool_memory.phase] *
                rewardPool_memory.allocPoint) /
                phaseToTotalAllocPoint[rewardPool_memory.phase];

            // Rewards accrued per token in the pool
            accRewardPerShare +=
                (totalRewardsAccruedInPool * ACC_REWARD_PRECISION) /
                globalPoolBalance;
        }

        // Compute and return the user's pending reward
        pending = uint256(
            int256(
                (userPoolInfo_storage.userPoolBalance * accRewardPerShare) /
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
        userPoolInfo_storage.rewardDebt = 0;
        userPoolInfo_storage.userVoucherBalance =
            uint248(userPoolInfo_storage.userVoucherBalance /
            ACC_REWARD_PRECISION); // [ Patch: Round off for now]
    }

    /**
     * @dev Updates the reward variables of a reward pool
     * each time any user interacts with the SC [ deposits/stakes/unstakes/claims]
     * and when the owner updates the reward pool allocations
     *
     * @param _assetId: assetId of the reward pool being updated
     * @return rewardPool_memory the updated instance of RewardPool for the _assetId in memory
     */
    function updatePoolRewardVariables(uint256 _assetId)
        public
        returns (RewardPool memory rewardPool_memory)
    {
        rewardPool_memory = rewardPoolInfo[_assetId];

        uint256 currentBlockTimeStamp = block.timestamp;

        if (currentBlockTimeStamp > rewardPool_memory.lastRewardTime) {
            uint256 globalPoolBalance = rewardPool_memory.globalPoolBalance;
            // Compute the pool's accRewardPerShare
            if (globalPoolBalance != 0) {
                uint256 duration = currentBlockTimeStamp -
                    rewardPool_memory.lastRewardTime;

                uint256 rewardAmount = (duration *
                    phaseToRewardEmissionRate[rewardPool_memory.phase] *
                    rewardPool_memory.allocPoint) /
                    phaseToTotalAllocPoint[rewardPool_memory.phase];

                rewardPool_memory.accRewardPerShare +=
                    (rewardAmount * ACC_REWARD_PRECISION) /
                    globalPoolBalance;

                // Update pool's accRewardPerShare in storage
                rewardPoolInfo[_assetId].accRewardPerShare = rewardPool_memory
                    .accRewardPerShare;
            }
            rewardPool_memory.lastRewardTime = uint64(currentBlockTimeStamp);
            // Update pool's lastRewardTime in storage
            rewardPoolInfo[_assetId].lastRewardTime = uint64(
                currentBlockTimeStamp
            );

            // Emit an event
            emit LogUpdatePoolRewards({
                assetId: _assetId,
                lastRewardTime: currentBlockTimeStamp,
                globalPoolBalance: globalPoolBalance,
                accRewardPerShare: rewardPool_memory.accRewardPerShare
            });
        }
    }

    /** @dev Updates all the reward variables of reward pools in a given phase
    * @param _assetIds: Array of assetId of all reward pools currently in `_phase`
    * @param _phase: phase for which all reward pools are getting mass-updated
    *
    * Called whenever a new reward pool is added to the PMC {Func: addRewardPool}
    * OR 
    * the allocPoint for an existing reward pool is updated {Func: updateRewardPoolAllocations}
    * This is because the rewards for all pools is affected by the above two actions
    */
    function massUpdatePoolRewardVariables(uint256[] calldata _assetIds, uint256 _phase) public {
        uint256 len  = _assetIds.length;
        for (uint256 i = 0; i < len; ++i) {
            uint256 poolPhase = rewardPoolInfo[_assetIds[i]].phase;
            if(poolPhase != _phase) revert InvalidPhase({
                assetId: _assetIds[i],
                assumedPhase: _phase,
                correctPhase: poolPhase
            });
            updatePoolRewardVariables(_assetIds[i]);
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
        require(msg.sender == SMASP, "Only SMASP can call");

        UserPoolInfo storage userPoolInfo_storage = userPoolInfo[_user][
            _assetId
        ];

        // In first ever deposit: Update user's pool phase to 1
        if (userPoolInfo_storage.phase == 0) {
            userPoolInfo_storage.phase = 1;
        }

        RewardPool memory rewardPool_memory = updatePoolRewardVariables(
            _assetId
        );

        // Update userPoolBalance
        userPoolInfo_storage.userPoolBalance += _amount;

        // Update user's pool rewardDebt
        userPoolInfo_storage.rewardDebt += int256(
            (_amount * rewardPool_memory.accRewardPerShare) /
                ACC_REWARD_PRECISION
        );

        rewardPoolInfo[_assetId].globalPoolBalance += _amount;

        emit LogDepositToPool({
            user: _user, 
            assetId: _assetId, 
            amount: _amount
        });
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
        RewardPool memory rewardPool_memory = updatePoolRewardVariables(
            _assetId
        );
        UserPoolInfo storage userPoolInfo_storage = userPoolInfo[msg.sender][
            _assetId
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
            (userEffectiveStakeAmount * rewardPool_memory.accRewardPerShare) /
                ACC_REWARD_PRECISION
        );

        // Add the effective stake amount to the rewardPool's globalPoolBalance
        rewardPoolInfo[_assetId].globalPoolBalance += userEffectiveStakeAmount;

        // Transfer the staked amount from user to the contract
        SILENT.safeTransferFrom(msg.sender, address(this), _amount);
        // Emit an event to notify
        emit LogSilentStakedToPool({
            user: msg.sender,
            assetId: _assetId,
            amount: _amount
        });
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
        nonReentrant
        onlyValidPhase(_assetId, 2)
    {
        RewardPool memory rewardPool_memory = updatePoolRewardVariables(
            _assetId
        );
        UserPoolInfo storage userPoolInfo_storage = userPoolInfo[msg.sender][
            _assetId
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
        // Update user's reward debt in the pool
        userPoolInfo_storage.rewardDebt -= int256(
            (userEffectiveUnstakeAmount * rewardPool_memory.accRewardPerShare) /
                ACC_REWARD_PRECISION
        );
        // Update the rewardPool's globalPoolBalance
        rewardPoolInfo[_assetId]
            .globalPoolBalance -= userEffectiveUnstakeAmount;

        // Transfer the unstaked amount from contract to user
        SILENT.safeTransfer(msg.sender, _amount);
        emit LogSilentUnstakedFromPool({
            user: msg.sender, 
            assetId: _assetId,
            amount: _amount
        });
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
    function claimRewardsFromPool(uint256 _assetId) external override nonReentrant {
        RewardPool memory rewardPool_memory = updatePoolRewardVariables(
            _assetId
        );
        UserPoolInfo storage userPoolInfo_storage = userPoolInfo[msg.sender][
            _assetId
        ];

        // Verify that the user is in same phase w.r.t the reward pool
        if (userPoolInfo_storage.phase != rewardPool_memory.phase)
            revert InvalidPhase({
                assetId: _assetId,
                assumedPhase: userPoolInfo_storage.phase,
                correctPhase: rewardPool_memory.phase
            });

        // Compute the user's accumulated reward since genesis
        int256 accumulatedRewardSinceGenesis = int256(
            userPoolInfo_storage.userPoolBalance *
                rewardPool_memory.accRewardPerShare
         / ACC_REWARD_PRECISION);
         
        // Compute the user's accumulated reward since user's last claimed block
        uint256 userPendingRewardSinceLastClaimedBlock = uint256(
            accumulatedRewardSinceGenesis - userPoolInfo_storage.rewardDebt
        );

        userPoolInfo_storage.rewardDebt = accumulatedRewardSinceGenesis;

        // If the pending reward is > 0, transfer it to the user
        if (userPendingRewardSinceLastClaimedBlock != 0) {
            if (rewardPool_memory.phase == 2) {
                SILENT.safeTransfer(msg.sender, userPendingRewardSinceLastClaimedBlock);
            } else if (rewardPool_memory.phase == 1) {
                userPoolInfo_storage.userVoucherBalance += uint248(
                    userPendingRewardSinceLastClaimedBlock
                );
            }
            emit LogRewardPaidByPool({
                assetId: _assetId, 
                user: msg.sender, 
                amount: userPendingRewardSinceLastClaimedBlock
            });
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
    ) external onlyOwner onlyValidPhase(_assetId, _phase - 1) {
        RewardPool storage rewardPool_storage = rewardPoolInfo[_assetId];

        // If the Reward Pool is getting added to PMC for phase one
        if (_phase == 1) {
            // Verify that a corresponding asset pool exists in SMASP
            require(
                ISMASP(SMASP).assetIdToToken(_assetId) != address(0),
                "Invalid _assetId"
            );
            // Add the assetId to the list of deployed pools
            deployedPools.push(_assetId);
        } else if (_phase == 2) {
            // If Reward pool is getting upgraded to phase two
            // Reset reward pool's accRewardPerShare and globalPoolBalance
            rewardPool_storage.accRewardPerShare = 0;
            rewardPool_storage.globalPoolBalance = 0;
            // Deduce its previous allocPoint from the total allocPoint of phase 1
            phaseToTotalAllocPoint[1] -= rewardPool_storage.allocPoint;
        } else {
            revert InvalidPhase({
                assetId: _assetId,
                assumedPhase: _phase - 1,
                correctPhase: rewardPool_storage.phase
            });
        }

        // Add to the totalAllocPoint for the phase
        phaseToTotalAllocPoint[_phase] += _allocPoint;

        // Initialize the attributes for the pool's RewardPool struct
        rewardPool_storage.phase = uint8(_phase);
        rewardPool_storage.allocPoint = uint64(_allocPoint);
        rewardPool_storage.lastRewardTime = uint64(block.timestamp);

        // Emit an event to notify
        emit LogRewardPoolAdded({
            assetId: _assetId,
            phase: _phase,
            allocPoint: _allocPoint
        });
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
     *
     * NOTE: Owner should batch the function {massupdatePoolRewardVariables} for the same _phase
     * whenever this function is called
     * Maybe a pre-requisite should be that the 
     */
    function updateRewardPoolAllocations(
        uint256 _assetId,
        uint256 _phase,
        uint256 _newAllocPoint
    ) external onlyOwner onlyValidPhase(_assetId, _phase) {
        uint256 poolPhase = rewardPoolInfo[_assetId].phase;

        // Update the total allocations for the phase
        phaseToTotalAllocPoint[poolPhase] =
            (phaseToTotalAllocPoint[poolPhase] -
                rewardPoolInfo[_assetId].allocPoint) +
            _newAllocPoint;
        // Update the allocations for the reward pool
        rewardPoolInfo[_assetId].allocPoint = uint64(_newAllocPoint);

        // Emit an event to notify
        emit LogUpdateRewardPool({
            assetId: _assetId,
            allocPoint: _newAllocPoint
        });
    }

    /**
     * @dev Lets the owner update the `phaseToRewardEmissionRate` for PMC
     *
     * @param _phase: one of the two global phases of reward pools in PMC
     * @param _rewardEmissionRate: amount of vouchers (`_phase` == 1) or 
     * silent rewards (`_phase` == 2) to be distributed per second in PMC
     *
     * Emits the event {LogUpdateRewardEmissionRate} denoting the newly updated
     * reward emission rate for the `_phase`
     *
     * Requirement: Owner will need to update all the reward pools with the 
     * function: {massupdatePoolRewardVariables} beforehand
     */
    function setRewardEmissionRate(uint256 _phase, uint256 _rewardEmissionRate)
        external
        onlyOwner
    {
        require(_phase == 1 || _phase == 2, "Invalid Phase");
        phaseToRewardEmissionRate[_phase] = _rewardEmissionRate;
        emit LogUpdateRewardEmissionRate({
            phase: _phase, 
            rewardPerSecond: _rewardEmissionRate
        });
    }
}
