// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {Owned} from 'solmate/src/auth/Owned.sol';
import {ReentrancyGuard} from 'solmate/src/utils/ReentrancyGuard.sol';
import {Pausable} from '@openzeppelin/contracts/security/Pausable.sol';
import {SafeERC20, IERC20} from '../libraries/SafeERC20.sol';
import {IPrivacyMining} from '../interfaces/IPrivacyMining.sol';
import {SafeCastLib} from '../libraries/SafeCastLib.sol';
import {FullMath} from '../libraries/FullMath.sol';
import {Math} from '../libraries/Math.sol';
import 'hardhat/console.sol';

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

error InvalidValue(string variable);

/**
 * @dev Thrown when the deposit/stake functions are called upon a
 * reward pool after it's reward period has ended
 */
error RewardPeriodFinished(uint256 assetId, uint256 currentTimestamp, uint256 rewardEndTimestamp);

/**
 * @dev Thrown when the pool is upgraded (phase/allocPoint) when its
 * exisiting reward period is ongoing
 */
error RewardPeriodOngoing(uint256 assetId, uint256 currentTimestamp, uint256 rewardEndTimestamp);

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
contract TestPMC is IPrivacyMining, ReentrancyGuard, Pausable, Owned {
  using SafeERC20 for IERC20;
  using SafeCastLib for uint256;
  using SafeCastLib for int256;

  // ::::::::::::::::: ECHIDNA-EVENTS ::::::::::::::::: //
  /**
   * @dev This is a special echidna event that gets emitted
   * whenever an assertion fails
   */
  event AssertionFailed(string, uint);

  /* ========== STATE VARIABLES ========== */

  /**
   * @dev This struct stores the information of the
   * global variables of each of the two phases
   *
   * @param rewardEmissionRate: reward emission rate (per second)
   * @param totalAllocPoint: total allocation of all reward pools in phase
   */
  struct PhaseInfo {
    uint128 totalAllocPoint;
    uint128 rewardEmissionRate;
  }

  /**
   * @dev This struct stores the information of all the
   * reward pools in the privacy mining program
   */
  struct RewardPool {
    uint8 rewardPrecision;
    uint8 phase;
    uint8 allocPoint;
    uint40 rewardStartTime;
    uint40 lastRewardTime;
    uint40 rewardEndTime;
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

  /**
   * @dev Stores the reward period for reward pools in both the phases
   */
  uint256 private constant GLOBAL_REWARD_PERIOD = 7 days;

  /**
   * @dev Silent token contract Instance
   */
  IERC20 public immutable SILENT;

  /**
   * @dev Address of the SMASP contract
   */
  // address public immutable SMASP; // NOTE: CHANGE TO ISMASP IN INTEGRATED CONTRACT

  /**
   * @dev Maps the phase (1 or 2) to the struct PhaseInfo
   */
  mapping(uint256 => PhaseInfo) internal phaseInfo;

  /**
   * @dev Maps the assetId of an asset to the struct RewardPool
   */
  mapping(uint256 => RewardPool) internal rewardPoolInfo;

  /**
   * @dev Maps a user address and assetId to the struct UserPoolInfo
   * Used for storing user's state information w.r.t. the reward pool for `assetId`
   */
  mapping(address => mapping(uint256 => UserPoolInfo)) internal userPoolInfo;

  /* ========== CONSTRUCTOR ========== */

  /**
   * @dev Sets the values for {SILENT} token and {SMASP} contract
   * Both of these values are immutable: they can only be set once during construction
   *
   * Requirements:
   * `_silentToken` and `_smaspContract` cannot be the zero address
   */
  constructor(address _silentToken, address _smaspContract) Owned(msg.sender) {
    require(_silentToken != address(0));
    // require(_smaspContract != address(0));

    SILENT = IERC20(_silentToken);
    // SMASP = _smaspContract; // NOTE: CHANGE TO ISMASP IN INTEGRATED CONTRACT
  }

  /* ========== MODIFIERS ========== */

  /**
   * @dev Checks if the reward pool for the given `_assetId` is in given `_phase`
   */
  modifier onlyValidPhase(uint256 _assetId, uint256 _phase) {
    uint256 rewardPoolPhase = rewardPoolInfo[_assetId].phase;
    if (rewardPoolPhase != _phase)
      revert InvalidPhase({assetId: _assetId, assumedPhase: _phase, correctPhase: rewardPoolPhase});
    _;
  }

  /**
   * @dev Checks if the reward period for the given `_assetId` has already finished
   */
  modifier beforePeriodFinished(uint256 _assetId) {
    if (block.timestamp > rewardPoolInfo[_assetId].rewardEndTime)
      revert RewardPeriodFinished({
        assetId: _assetId,
        currentTimestamp: block.timestamp,
        rewardEndTimestamp: rewardPoolInfo[_assetId].rewardEndTime
      });
    _;
  }

  /* ========== EXTERNAL VIEW FUNCTIONS ========== */

  /**
   * @dev Fetches the information of an asset reward pool in PMC
   * @param _assetId: Asset id of asset reward pool in SMASP
   */
  function getRewardPoolInfo(uint256 _assetId) external view returns (RewardPool memory) {
    return rewardPoolInfo[_assetId];
  }

  /**
   * @dev Fetches the current phase of a reward pool in PMC
   * @param _assetId: Asset id of asset reward pool in SMASP
   */
  function getRewardPoolPhase(uint256 _assetId) external view returns (uint256) {
    return uint256(rewardPoolInfo[_assetId].phase);
  }

  /**
   * @dev Fetches the information of a user w.r.t. a reward pool in PMC
   * @param _user: Address of an user
   * @param _assetId: Asset id of asset reward pool in SMASP
   */
  function getUserPoolInfo(address _user, uint256 _assetId) external view returns (UserPoolInfo memory) {
    return userPoolInfo[_user][_assetId];
  }

  /**
   * @dev Fetches the state of a phase in PMC
   * @param _phase: Phase number(1 or 2) in PMC
   */
  function getPhaseInfo(uint256 _phase) external view returns (PhaseInfo memory) {
    return phaseInfo[_phase];
  }

  // Echidna: Changed this function from view -> mutative
  /**
   * @dev Fetches the pending rewards of a user w.r.t. a reward pool
   * @param _assetId: Asset id of asset reward pool in SMASP
   * @param _user: Address of an user
   */
  function getPendingRewards(uint256 _assetId, address _user) external returns (uint256 pending) {
    // Require user and rewardPool to be in the same phase
    RewardPool memory rewardPool_memory = rewardPoolInfo[_assetId];
    UserPoolInfo storage userPoolInfo_memory = userPoolInfo[_user][_assetId];

    if (userPoolInfo_memory.phase != rewardPool_memory.phase)
      revert InvalidPhase({
        assetId: _assetId,
        assumedPhase: userPoolInfo_memory.phase,
        correctPhase: rewardPool_memory.phase
      });

    uint256 poolAccRewardPerShare = rewardPool_memory.accRewardPerShare;

    // Compute the accRewardPerShare for the pool
    if (block.timestamp > rewardPool_memory.lastRewardTime) {
      poolAccRewardPerShare = accRewardPerShare(rewardPool_memory);
    }

    // Compute and return the user's pending reward
    pending = (int256(
      FullMath.mulDiv(
        userPoolInfo_memory.userPoolBalance,
        poolAccRewardPerShare,
        (10 ** rewardPool_memory.rewardPrecision)
      )
    ) - userPoolInfo_memory.rewardDebt).safeCastInt256ToUint256();
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
  function _enterPhase(UserPoolInfo storage userPoolInfo_storage, uint256 _phase) internal {
    // userVoucherBalance remains unchanged, all others change
    userPoolInfo_storage.phase = uint8(_phase);
    userPoolInfo_storage.userPoolBalance = 0;
    userPoolInfo_storage.rewardDebt = 0;
    if (_phase == 1) {
      userPoolInfo_storage.userVoucherBalance = 0;
    } else {
      require(userPoolInfo_storage.userVoucherBalance > 0);
    }
  }

  /**
   * @dev Computes the last reward claimable time for a reward pool
   * @param _rewardEndTime: RewardPool.rewardEndTime of the reward Pool
   */
  function lastRewardApplicableTime(uint40 _rewardEndTime) public view returns (uint256) {
    return Math.min(block.timestamp, uint256(_rewardEndTime));
  }

  // Echidna: Changed this function from view ->  due to event emission: AssertionFailed
  /**
   * @dev Computes the accumulated reward per share/token of a reward pool
   * since last reward distribution time to the current timestamp and adds it to
   * the accumulatedRewardPerShare of the reward pool since genesis
   *
   * @param _rewardPool_memory: Memory reference of reward pool
   */
  function accRewardPerShare(RewardPool memory _rewardPool_memory) internal returns (uint256 poolAccRewardPerShare) {
    poolAccRewardPerShare = _rewardPool_memory.accRewardPerShare;
    // Make sure to update a pool using the `updatePoolRewardVariables` once before updating it's allocPoint to 0
    if (_rewardPool_memory.globalPoolBalance != 0 && _rewardPool_memory.allocPoint != 0) {
      uint256 durationSinceLastReward = lastRewardApplicableTime(_rewardPool_memory.rewardEndTime) -
        uint256(_rewardPool_memory.lastRewardTime);

      uint256 poolAccRewardsInDuration = (durationSinceLastReward *
        (phaseInfo[_rewardPool_memory.phase]).rewardEmissionRate *
        _rewardPool_memory.allocPoint) / phaseInfo[_rewardPool_memory.phase].totalAllocPoint;

      poolAccRewardPerShare +=
        (poolAccRewardsInDuration * 10 ** _rewardPool_memory.rewardPrecision) /
        _rewardPool_memory.globalPoolBalance;

      // Echidna Assert: accRewardPershare isn't 0
      if (
        (phaseInfo[_rewardPool_memory.phase]).rewardEmissionRate != 0 &&
        (lastRewardApplicableTime(_rewardPool_memory.rewardEndTime) != uint256(_rewardPool_memory.lastRewardTime))
      ) {
        if (poolAccRewardPerShare == 0) {
          emit AssertionFailed('a: durationSinceLastReward', durationSinceLastReward);
          emit AssertionFailed('a: rewardPool_memory.allocPoint', _rewardPool_memory.allocPoint);
          emit AssertionFailed('a: phase totalAllocPoint', phaseInfo[_rewardPool_memory.phase].totalAllocPoint);
          emit AssertionFailed('a: poolAccRewardsInDuration', poolAccRewardsInDuration);
          emit AssertionFailed('a: globalPoolBalance', _rewardPool_memory.globalPoolBalance);
          emit AssertionFailed('a: new poolAccRewardPerShare', poolAccRewardPerShare);
          emit AssertionFailed('a: old poolAccRewardPerShare', _rewardPool_memory.accRewardPerShare);
        }
      }
    }
  }

  /** @dev Updates the reward variables of a reward pool
   * @param _assetId: assetId of the reward pool
   *
   */
  function updatePoolRewardVariables(uint256 _assetId) public returns (RewardPool memory rewardPool_memory) {
    rewardPool_memory = rewardPoolInfo[_assetId];
    // COMPUTE POOL'S `accRewardPerShare` and `lastRewardTime`

    if (block.timestamp > rewardPool_memory.lastRewardTime) {
      rewardPool_memory.accRewardPerShare = accRewardPerShare(rewardPool_memory);
      rewardPool_memory.lastRewardTime = uint40(lastRewardApplicableTime(rewardPool_memory.rewardEndTime));

      // // UPDATE IN STORAGE
      rewardPoolInfo[_assetId].accRewardPerShare = rewardPool_memory.accRewardPerShare;
      rewardPoolInfo[_assetId].lastRewardTime = rewardPool_memory.lastRewardTime;

      emit LogUpdatePoolRewards({
        assetId: _assetId,
        lastRewardTime: rewardPool_memory.lastRewardTime,
        globalPoolBalance: rewardPool_memory.globalPoolBalance,
        accRewardPerShare: rewardPool_memory.accRewardPerShare
      });
    }
  }

  /** @dev Updates all the reward variables of reward pools in a given phase
   * @param _assetIds: Array of assetId of all reward pools currently in `_phase`
   *
   * Called whenever a new reward pool is added to the PMC {Func: addRewardPool}
   * OR
   * the allocPoint for an existing reward pool is updated {Func: updateRewardPoolAllocations}
   * This is because the rewards for all pools is affected by the above two actions
   */
  function massUpdatePoolRewardVariables(uint256[] calldata _assetIds) public {
    uint256 len = _assetIds.length;

    for (uint256 i = 0; i < len; ++i) {
      uint256 poolPhase = rewardPoolInfo[_assetIds[i]].phase;
      require(poolPhase == 1 || poolPhase == 2, 'Invalid Pool'); // Note: check if needed
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
  ) public override onlyValidPhase(_assetId, 1) beforePeriodFinished(_assetId) nonReentrant {
    // require(msg.sender == SMASP, 'Only SMASP can call');

    UserPoolInfo storage userPoolInfo_storage = userPoolInfo[_user][_assetId];

    // In first ever deposit: Update user's pool phase to 1
    if (userPoolInfo_storage.phase != 1) {
      if (userPoolInfo_storage.phase == 0) {
        userPoolInfo_storage.phase = 1;
      } else {
        _enterPhase(userPoolInfo_storage, 1);
      }
    }

    RewardPool memory rewardPool_memory = updatePoolRewardVariables(_assetId);

    // Update userPoolBalance
    userPoolInfo_storage.userPoolBalance += _amount;

    if (_amount != 0 && rewardPool_memory.accRewardPerShare != 0) {
      if (
        _amount * rewardPool_memory.accRewardPerShare < rewardPool_memory.accRewardPerShare ||
        _amount * rewardPool_memory.accRewardPerShare < _amount
      ) {
        emit AssertionFailed('d: _amount', _amount);
        emit AssertionFailed('d: accRewardPerShare', rewardPool_memory.accRewardPerShare);
      }
    }

    // Update user's pool rewardDebt
    userPoolInfo_storage.rewardDebt += int256(
      FullMath.mulDiv(_amount, rewardPool_memory.accRewardPerShare, 10 ** rewardPool_memory.rewardPrecision)
    );

    rewardPoolInfo[_assetId].globalPoolBalance += _amount;

    emit LogDepositToPool({user: _user, assetId: _assetId, amount: _amount});
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
  function stakeSilentToPool(
    uint256 _assetId,
    uint256 _amount
  ) external override onlyValidPhase(_assetId, 2) beforePeriodFinished(_assetId) nonReentrant {
    RewardPool memory rewardPool_memory = updatePoolRewardVariables(_assetId);
    UserPoolInfo storage userPoolInfo_storage = userPoolInfo[msg.sender][_assetId];

    // If user's phase w.r.t reward pool is one, upgrade it to two
    if (userPoolInfo_storage.phase != 2) {
      if (userPoolInfo_storage.phase == 0) {
        revert IneligibleUser();
      } else {
        _enterPhase(userPoolInfo_storage, 2);
      }
    }

    // Compute the effective stake for user in the reward pool
    // [ Effective stake = ( user's total silent stake * user's voucher balance ) w.r.t. reward pool ]
    uint256 userEffectiveStakeAmount = _amount * userPoolInfo_storage.userVoucherBalance;

    // Checking for overflow: muldiv case
    if (userEffectiveStakeAmount != 0 && rewardPool_memory.accRewardPerShare != 0) {
      if (
        userEffectiveStakeAmount * rewardPool_memory.accRewardPerShare < rewardPool_memory.accRewardPerShare ||
        userEffectiveStakeAmount * rewardPool_memory.accRewardPerShare < userEffectiveStakeAmount
      ) {
        emit AssertionFailed('s: userEffectiveStakeAmount', userEffectiveStakeAmount);
        emit AssertionFailed('s: accRewardPerShare', rewardPool_memory.accRewardPerShare);
      }
    }

    // Add the effective stake amount to the userPoolBalance
    userPoolInfo_storage.userPoolBalance += userEffectiveStakeAmount;
    // Compute the user's new rewardDebt in the pool and update it
    userPoolInfo_storage.rewardDebt += int256(
      (userEffectiveStakeAmount * rewardPool_memory.accRewardPerShare) / 10 ** rewardPool_memory.rewardPrecision
    );

    // Add the effective stake amount to the rewardPool's globalPoolBalance
    rewardPoolInfo[_assetId].globalPoolBalance += userEffectiveStakeAmount;

    // Transfer the staked amount from user to the contract
    SILENT.safeTransferFrom(msg.sender, address(this), _amount);
    // Emit an event to notify
    emit LogSilentStakedToPool({user: msg.sender, assetId: _assetId, amount: _amount});
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
  function unstakeSilentFromPool(
    uint256 _assetId,
    uint256 _amount
  ) external override nonReentrant onlyValidPhase(_assetId, 2) {
    RewardPool memory rewardPool_memory = updatePoolRewardVariables(_assetId);
    UserPoolInfo storage userPoolInfo_storage = userPoolInfo[msg.sender][_assetId];

    // Verify that user is in phase 2 w.r.t the reward pool
    if (userPoolInfo_storage.phase != 2) revert IneligibleUser();

    // Compute the original amount staked in the pool by the user
    uint256 userOriginalStake;
    unchecked {
      userOriginalStake = userPoolInfo_storage.userPoolBalance / userPoolInfo_storage.userVoucherBalance;
    }

    // Verify that the staked amount is greater than the amount being unstaked
    if (_amount == 0 || userOriginalStake < _amount) revert InvalidAmount();

    // Compute the effective amount being unstaked
    uint256 userEffectiveUnstakeAmount = _amount * userPoolInfo_storage.userVoucherBalance;

    // if (userEffectiveUnstakeAmount * rewardPool_memory.accRewardPerShare > (type(uint256).max - 1)) {
    //   emit AssertionFailed(userEffectiveUnstakeAmount);
    //   emit AssertionFailed(rewardPool_memory.accRewardPerShare);
    // }

    if (userEffectiveUnstakeAmount != 0 && rewardPool_memory.accRewardPerShare != 0) {
      if (
        userEffectiveUnstakeAmount * rewardPool_memory.accRewardPerShare < rewardPool_memory.accRewardPerShare ||
        userEffectiveUnstakeAmount * rewardPool_memory.accRewardPerShare < userEffectiveUnstakeAmount
      ) {
        emit AssertionFailed('u: userEffectiveUnstakeAmount', userEffectiveUnstakeAmount);
        emit AssertionFailed('u: accRewardPerShare', rewardPool_memory.accRewardPerShare);
      }
    }

    // Deduce effective unstake amount from userPoolBalance
    userPoolInfo_storage.userPoolBalance -= userEffectiveUnstakeAmount;
    // Update user's reward debt in the pool
    userPoolInfo_storage.rewardDebt -= int256(
      (userEffectiveUnstakeAmount * rewardPool_memory.accRewardPerShare) / 10 ** rewardPool_memory.rewardPrecision
    );
    // Update the rewardPool's globalPoolBalance
    rewardPoolInfo[_assetId].globalPoolBalance -= userEffectiveUnstakeAmount;

    // Transfer the unstaked amount from contract to user
    SILENT.safeTransfer(msg.sender, _amount);
    emit LogSilentUnstakedFromPool({user: msg.sender, assetId: _assetId, amount: _amount});
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
    RewardPool memory rewardPool_memory = updatePoolRewardVariables(_assetId);
    UserPoolInfo storage userPoolInfo_storage = userPoolInfo[msg.sender][_assetId];

    // Verify that the user is in same phase w.r.t the reward pool
    if (userPoolInfo_storage.phase != rewardPool_memory.phase)
      revert InvalidPhase({
        assetId: _assetId,
        assumedPhase: userPoolInfo_storage.phase,
        correctPhase: rewardPool_memory.phase
      });

    // NOTE: Change it to real overflow detection
    // Echidna: Assert: No overflow
    if (userPoolInfo_storage.userPoolBalance * rewardPool_memory.accRewardPerShare >= type(uint256).max - 100) {
      emit AssertionFailed(
        'c: uPB * acRPS',
        userPoolInfo_storage.userPoolBalance * rewardPool_memory.accRewardPerShare
      );
    }

    int256 userAccumulatedRewardSinceGenesis = int256(
      FullMath.mulDiv(
        userPoolInfo_storage.userPoolBalance,
        rewardPool_memory.accRewardPerShare,
        10 ** rewardPool_memory.rewardPrecision
      )
    );

    // Echidna: Assert
    if (
      userPoolInfo_storage.userPoolBalance != 0 && rewardPool_memory.lastRewardTime != rewardPool_memory.rewardEndTime
    ) {
      if (userAccumulatedRewardSinceGenesis == 0) {
        emit AssertionFailed('userAccumulatedRewardSinceGenesis', 0);
        emit AssertionFailed('accRewardPerShare', rewardPool_memory.accRewardPerShare);
        emit AssertionFailed('userPoolBalance', userPoolInfo_storage.userPoolBalance);
      }
    }

    // Compute the user's accumulated reward since user's last claimed block
    uint256 userPendingRewardSinceLastClaimedBlock = (userAccumulatedRewardSinceGenesis -
      userPoolInfo_storage.rewardDebt).safeCastInt256ToUint256();

    userPoolInfo_storage.rewardDebt = userAccumulatedRewardSinceGenesis;

    // If the pending reward is > 0, transfer it to the user
    if (userPendingRewardSinceLastClaimedBlock != 0) {
      // // Echidna: Added condition
      // if (
      //   block.timestamp > rewardPool_memory.lastRewardTime &&
      //   rewardPool_memory.rewardEndTime != rewardPool_memory.lastRewardTime
      // ) {
      if (rewardPool_memory.phase == 2) {
        SILENT.safeTransfer(msg.sender, userPendingRewardSinceLastClaimedBlock);
      } else if (rewardPool_memory.phase == 1) {
        userPoolInfo_storage.userVoucherBalance += uint248(userPendingRewardSinceLastClaimedBlock);
      }
      // }
    }

    emit LogRewardPaidByPool({assetId: _assetId, user: msg.sender, amount: userPendingRewardSinceLastClaimedBlock});
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
    uint8 _allocPoint
  ) external onlyOwner onlyValidPhase(_assetId, _phase - 1) {
    require(_allocPoint > 0, 'Invalid AllocPoint');
    RewardPool storage rewardPool_storage = rewardPoolInfo[_assetId];

    // If the Reward Pool is getting added to PMC for phase one
    if (_phase == 1) {
      // Verify that a corresponding asset pool exists in SMASP
      // require(ISMASP(SMASP).assetIdToToken(_assetId) != address(0), 'Invalid _assetId');
      rewardPool_storage.rewardPrecision = 18;
    } else if (_phase == 2) {
      // Verify that the current reward period has already ended
      if (block.timestamp <= rewardPoolInfo[_assetId].rewardEndTime)
        revert RewardPeriodOngoing({
          assetId: _assetId,
          currentTimestamp: block.timestamp,
          rewardEndTimestamp: rewardPoolInfo[_assetId].rewardEndTime
        });
      // Reset reward pool's accRewardPerShare and globalPoolBalance
      rewardPool_storage.accRewardPerShare = 0;
      rewardPool_storage.globalPoolBalance = 0;
      rewardPool_storage.rewardPrecision = 36;
      // Deduce its previous allocPoint from the total allocPoint of phase 1
      phaseInfo[1].totalAllocPoint -= uint128(rewardPool_storage.allocPoint);
    } else {
      revert InvalidPhase({assetId: _assetId, assumedPhase: _phase - 1, correctPhase: rewardPool_storage.phase});
    }

    // Add to the totalAllocPoint for the phase
    phaseInfo[_phase].totalAllocPoint += _allocPoint;

    // Initialize the attributes for the pool's RewardPool struct
    rewardPool_storage.phase = uint8(_phase); // No need for safeCast since we've checked _phase == 1 or 2 already
    rewardPool_storage.allocPoint = _allocPoint;
    rewardPool_storage.rewardStartTime = uint40(block.timestamp); // NOTE: This could be initialised in the very first deposit/stake to a pool
    rewardPool_storage.lastRewardTime = uint40(block.timestamp);
    rewardPool_storage.rewardEndTime = uint40(block.timestamp + GLOBAL_REWARD_PERIOD);

    // Emit an event to notify
    emit LogRewardPoolAdded({assetId: _assetId, phase: _phase, allocPoint: _allocPoint});
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
   * NOTE: Owner should call the function {massupdatePoolRewardVariables} before calling this function
   * whenever this function is called
   * Maybe a pre-requisite should be that the
   */
  function updateRewardPoolAllocations(
    uint256 _assetId,
    uint256 _phase,
    uint8 _newAllocPoint
  ) external onlyOwner onlyValidPhase(_assetId, _phase) {
    // Verify that _phase is either 1 or 2 or else allocPoint can be set for a non-existent pool
    if (_phase != 1 && _phase != 2)
      revert InvalidPhase({assetId: _assetId, assumedPhase: _phase, correctPhase: rewardPoolInfo[_assetId].phase});
    // AllocPoint cannot be updated until the current reward period is finished
    if (block.timestamp <= rewardPoolInfo[_assetId].rewardEndTime)
      revert RewardPeriodOngoing({
        assetId: _assetId,
        currentTimestamp: block.timestamp,
        rewardEndTimestamp: rewardPoolInfo[_assetId].rewardEndTime
      });

    // Update the total allocations for the phase
    phaseInfo[_phase].totalAllocPoint =
      (phaseInfo[_phase].totalAllocPoint - rewardPoolInfo[_assetId].allocPoint) +
      _newAllocPoint;

    rewardPoolInfo[_assetId].allocPoint = _newAllocPoint;

    if (_newAllocPoint == 0) {
      if (_phase == 2) {
        // Delete the reward pool altogether
        delete rewardPoolInfo[_assetId]; // NOTE: GAS: Updating the storage before and deleting later can be optimized
      }
    } else {
      // Renew the pool's reward period
      rewardPoolInfo[_assetId].rewardStartTime = uint40(block.timestamp);
      rewardPoolInfo[_assetId].rewardEndTime = uint40(block.timestamp + GLOBAL_REWARD_PERIOD);
    }

    // Emit an event to notify
    emit LogUpdateRewardPool({assetId: _assetId, allocPoint: _newAllocPoint});
  }

  /**
   * @dev Lets the owner update the emissionRate for a phase in PMC
   *
   * @param _phase: one of the two global phases of reward pools in PMC
   * @param _rewardEmissionRate: amount of vouchers (`_phase` == 1) or
   * silent rewards (`_phase` == 2) to be distributed per second in PMC
   *
   * Emits the event {LogUpdateRewardEmissionRate} denoting the newly updated
   * reward emission rate for the `_phase`
   *
   * NOTE: Owner whould update all the reward pools with the
   * function: {massupdatePoolRewardVariables} before calling this function
   */
  function setRewardEmissionRate(uint256 _phase, uint128 _rewardEmissionRate) external onlyOwner {
    require(_rewardEmissionRate > 0, 'Invalid Emission Rate');
    require(_phase == 1 || _phase == 2, 'Invalid Phase');
    phaseInfo[_phase].rewardEmissionRate = _rewardEmissionRate;
    emit LogUpdateRewardEmissionRate({phase: _phase, rewardPerSecond: _rewardEmissionRate});
  }
}
