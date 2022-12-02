// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {TestPMC} from './TestPMC.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract MockERC20 is ERC20 {
  constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {}

  function mint(address _to, uint256 _amount) external {
    _mint(_to, _amount);
  }

  function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
    // bypass allowance
    _transfer(from, to, amount);
    return true;
  }
}

contract EchidnaPMC {
  event DebugErrUint(string, uint256);
  event LogErr(bytes error);

  MockERC20 private silentToken;
  TestPMC private privacyMining;

  uint256 private constant MAX_GLOBAL_POOL_BALANCE = 1_000_000_000_000 ether; // one trillion ether
  uint256 private constant MAX_DEPOSIT_OR_STAKE_BALANCE = 1_000_000_000 ether; // one billion ether

  // assetId => phase => value
  // Max rewards (already) claimed  by a user for a reward pool during either of its two phases
  mapping(uint256 => mapping(uint256 => uint256)) private maxRewardsClaimed;
  // Max rewards distributable/emitted for a reward pool during either of its two phases
  mapping(uint256 => mapping(uint256 => uint256)) private maxRewardsDistributed;
  // Rewards accumulated/distributable/emitted by a reward pool until the last time its reward shares was changed
  mapping(uint256 => mapping(uint256 => uint256)) private cachedPoolDistributedRewards;

  // phase => value
  // Last time the total allocPoint of a phase changed due to a reward pool being added/removed to/from it
  // or allocPoint of any of its existing reward pools being updated
  mapping(uint256 => uint256) private lastTimeTotalAllocChanged;

  /** SETUP */
  constructor() {
    // Create the SilentToken
    silentToken = new MockERC20('Silent', 'SILENT');

    // Create the PrivacyMining contract
    privacyMining = new TestPMC(address(silentToken), address(0));

    // Mint Silent tokens to this contract
    silentToken.mint(address(this), type(uint128).max);
    // Mint Silent tokens to PMC for rewards distribution
    silentToken.mint(address(privacyMining), type(uint128).max);
    // Set the reward emission rate of the two phases in PMC
    privacyMining.setRewardEmissionRate(1, 1 ether);
    privacyMining.setRewardEmissionRate(2, 1 ether);
  }

  function testAddRewardPool(uint256 _assetId, uint256 _phase, uint8 _allocPoint) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    // if (_allocPoint > 255) {
    //   _allocPoint = 1 + (_allocPoint % 255);
    // }
    if (_phase > 2) {
      _phase = 1 + (_phase % 2);
    }

    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);
    TestPMC.PhaseInfo memory phaseInfo = privacyMining.getPhaseInfo(_assetId);

    // pre-conditions
    require(rewardPoolInfo.phase == _phase - 1);
    require(block.timestamp > rewardPoolInfo.rewardEndTime);

    // Mass update all pools reward variables to update their accRewardPerShare's
    uint256[] memory assetIdsToUpdate;
    uint256 counter;

    for (uint256 i = 0; i <= 5; i++) {
      TestPMC.RewardPool memory cache_rewardPoolInfo = privacyMining.getRewardPoolInfo(i);
      uint256 _lastTimeTotalAllocChanged = lastTimeTotalAllocChanged[rewardPoolInfo.phase];

      if (cache_rewardPoolInfo.phase != 0) {
        assetIdsToUpdate[counter] = i;
        // Update the pool's cached reward variables before their rewardShare changes
        cachedPoolDistributedRewards[i][rewardPoolInfo.phase] +=
          (phaseInfo.rewardEmissionRate *
            cache_rewardPoolInfo.allocPoint *
            (privacyMining.lastRewardApplicableTime(cache_rewardPoolInfo.rewardEndTime) - _lastTimeTotalAllocChanged)) /
          phaseInfo.totalAllocPoint;

        counter++;
      }
    }
    privacyMining.massUpdatePoolRewardVariables(assetIdsToUpdate);

    // action
    try privacyMining.addRewardPool(_assetId, _phase, _allocPoint) {
      // Update the timestamp that total alloc changed for the phases
      // For the old phase the reward pool was in
      if (_phase == 2) {
        lastTimeTotalAllocChanged[_phase - 1] = block.timestamp;
      }
      // For the new phase that reward pool got in
      lastTimeTotalAllocChanged[_phase] = block.timestamp;

      emit DebugErrUint('initial pool phase', rewardPoolInfo.phase);

      // Reset all the global variables keeping reward pool's state for the epoch
      maxRewardsClaimed[_assetId][_phase] = 0;
      cachedPoolDistributedRewards[_assetId][_phase] = 0;
      maxRewardsDistributed[_assetId][_phase] = 0;

      // post-conditions
      assert(rewardPoolInfo.phase == 0 || rewardPoolInfo.phase == 1); // Initial phases
      assert(_phase == 1 || _phase == 2); // New phases
    } catch (bytes memory err) {
      emit LogErr(err);
      // assert(false);
    }
  }

  // :::::::::::::::: PMC HELPER FUNCTIONS :::::::::::::::: //

  function addRewardPool(uint256 _assetId, uint256 _phase, uint256 _allocPoint) public {
    // pre-condition
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    if (_phase > 2) {
      _phase = 1 + (_phase % 2);
    }
    if (_allocPoint > 255) {
      _allocPoint = 1 + (_allocPoint % 255);
    }

    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);
    TestPMC.PhaseInfo memory phaseInfo = privacyMining.getPhaseInfo(_assetId);

    // pre-conditions
    require(rewardPoolInfo.phase == _phase - 1);
    require(block.timestamp > rewardPoolInfo.rewardEndTime);

    // Mass update the pool reward variables to update the accRewardPerShare
    uint256[] memory assetIdsToUpdate;
    uint256 counter;

    for (uint256 i = 0; i <= 5; i++) {
      TestPMC.RewardPool memory cache_rewardPoolInfo = privacyMining.getRewardPoolInfo(i);
      uint256 _lastTimeTotalAllocChanged = lastTimeTotalAllocChanged[rewardPoolInfo.phase];

      if (cache_rewardPoolInfo.phase != 0) {
        assetIdsToUpdate[counter] = i;
        // Update the pool's cached reward variables before their rewardShare changes
        cachedPoolDistributedRewards[i][rewardPoolInfo.phase] +=
          (phaseInfo.rewardEmissionRate *
            cache_rewardPoolInfo.allocPoint *
            (privacyMining.lastRewardApplicableTime(cache_rewardPoolInfo.rewardEndTime) - _lastTimeTotalAllocChanged)) /
          phaseInfo.totalAllocPoint;

        counter++;
      }
    }
    privacyMining.massUpdatePoolRewardVariables(assetIdsToUpdate);

    // action
    try privacyMining.addRewardPool(_assetId, _phase, uint8(_allocPoint)) {
      // Update the timestamp that total alloc changed for the phases
      // For the old phase the reward pool was in
      if (_phase == 2) {
        lastTimeTotalAllocChanged[_phase - 1] = block.timestamp;
      }
      // For the new phase that reward pool got in
      lastTimeTotalAllocChanged[_phase] = block.timestamp;

      // To reset prev cyclce values if/when pool gets recycled
      maxRewardsClaimed[_assetId][_phase] = 0;
      cachedPoolDistributedRewards[_assetId][_phase] = 0;
      maxRewardsDistributed[_assetId][_phase] = 0;
    } catch {
      // assert(false);
    }
  }

  function updatePoolAllocations(uint256 _assetId, uint256 _newAllocPoint) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    if (_newAllocPoint > 255) {
      _newAllocPoint = 1 + (_newAllocPoint % 255);
    }

    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);
    TestPMC.PhaseInfo memory phaseInfo = privacyMining.getPhaseInfo(rewardPoolInfo.phase);

    // pre-conditions
    require(rewardPoolInfo.phase != 0);
    require(block.timestamp > rewardPoolInfo.rewardEndTime);

    // Mass update the pool reward variables to update the accRewardPerShare
    uint256[] memory assetIdsToUpdate;
    uint256 counter;

    for (uint256 i = 0; i <= 5; i++) {
      TestPMC.RewardPool memory cache_rewardPoolInfo = privacyMining.getRewardPoolInfo(i);
      uint256 _lastTimeTotalAllocChanged = lastTimeTotalAllocChanged[rewardPoolInfo.phase];

      if (cache_rewardPoolInfo.phase == rewardPoolInfo.phase) {
        assetIdsToUpdate[counter] = i;
        // Update the pool's cached reward variables before their rewardShare changes
        if (cache_rewardPoolInfo.allocPoint != 0) {
          cachedPoolDistributedRewards[i][rewardPoolInfo.phase] +=
            (phaseInfo.rewardEmissionRate *
              cache_rewardPoolInfo.allocPoint *
              (privacyMining.lastRewardApplicableTime(cache_rewardPoolInfo.rewardEndTime) -
                _lastTimeTotalAllocChanged)) /
            phaseInfo.totalAllocPoint;

          counter++;
        }
      }
    }
    privacyMining.massUpdatePoolRewardVariables(assetIdsToUpdate);

    // action
    try privacyMining.updateRewardPoolAllocations(_assetId, rewardPoolInfo.phase, uint8(_newAllocPoint)) {
      // Update to keep track of the allocPoint changed timestamp
      lastTimeTotalAllocChanged[rewardPoolInfo.phase] = block.timestamp;

      // post-conditions
      // Assert the new allocPoint has been updated
      assert((privacyMining.getRewardPoolInfo(_assetId)).allocPoint == _newAllocPoint);
      // Assert the phase's total allocPoint has been updated
      assert(
        (privacyMining.getPhaseInfo(rewardPoolInfo.phase)).totalAllocPoint ==
          (phaseInfo.totalAllocPoint - rewardPoolInfo.allocPoint + _newAllocPoint)
      );
    } catch (bytes memory err) {
      emit LogErr(err);
      // assert(false);
    }
  }

  function depositAsset(uint256 _assetId, uint256 _amount) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    if (_amount > MAX_DEPOSIT_OR_STAKE_BALANCE) {
      _amount = 1 + (_amount % MAX_DEPOSIT_OR_STAKE_BALANCE);
    }
    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);
    require(rewardPoolInfo.globalPoolBalance < MAX_GLOBAL_POOL_BALANCE);
    require(rewardPoolInfo.phase == 1);

    try privacyMining.depositAssetToPool(address(this), _assetId, _amount) {
      TestPMC.RewardPool memory rewardPoolInfo_new = privacyMining.getRewardPoolInfo(_assetId);
      assert((privacyMining.getUserPoolInfo(address(this), _assetId)).phase == 1);
      require(rewardPoolInfo_new.globalPoolBalance < MAX_GLOBAL_POOL_BALANCE);
    } catch (bytes memory err) {
      emit LogErr(err);
      // assert(false);
    }
  }

  function stakeSilent(uint256 _assetId, uint256 _amount) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    if (_amount > MAX_DEPOSIT_OR_STAKE_BALANCE) {
      _amount = 1 + (_amount % MAX_DEPOSIT_OR_STAKE_BALANCE);
    }

    require((privacyMining.getRewardPoolInfo(_assetId)).phase == 2);
    require((privacyMining.getUserPoolInfo(address(this), _assetId)).phase != 0);
    require(block.timestamp < (privacyMining.getRewardPoolInfo(_assetId)).rewardEndTime);

    try privacyMining.stakeSilentToPool(_assetId, _amount) {
      // NOTE: globalPoolBalance can be zero when all Silent has been unstaked [i.e. Not only in the beginning ]
      TestPMC.RewardPool memory rewardPoolInfo_new = privacyMining.getRewardPoolInfo(_assetId);
      require(rewardPoolInfo_new.globalPoolBalance <= MAX_GLOBAL_POOL_BALANCE * MAX_GLOBAL_POOL_BALANCE); // Silent x Vouchers
    } catch (bytes memory err) {
      emit LogErr(err);
      // assert(false);
    }
  }

  function updatePoolRewardVariables(uint256 _assetId) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);

    uint256 poolGlobalBalance = rewardPoolInfo.globalPoolBalance;
    require(poolGlobalBalance > 0 && poolGlobalBalance < MAX_GLOBAL_POOL_BALANCE);

    emit DebugErrUint('poolGlobalBalance', rewardPoolInfo.globalPoolBalance);
    emit DebugErrUint('poolAccRewardPerShare', rewardPoolInfo.accRewardPerShare);
    emit DebugErrUint('poolAllocPoint', rewardPoolInfo.allocPoint);

    // One more call to make sure it's not the first deposit: in which case `accRewardPerShare` can be zero
    try privacyMining.updatePoolRewardVariables(_assetId) {} catch (bytes memory err) {
      emit LogErr(err);
      // assert(false);
    }
  }

  // :::::::::::::::: FUNCTION LEVEL INVARIANTS :::::::::::::::: //

  // 1. Verify that the deposited asset amount is added to the userPoolBalance and globalPoolBalance
  function testDepositBalanceChange(uint256 _assetId, uint256 _amount) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    if (_amount > MAX_DEPOSIT_OR_STAKE_BALANCE) {
      _amount = 1 + (_amount % MAX_DEPOSIT_OR_STAKE_BALANCE);
    }

    // pre-conditions
    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);

    require(rewardPoolInfo.phase == 1);
    require(rewardPoolInfo.globalPoolBalance <= MAX_GLOBAL_POOL_BALANCE);
    require(block.timestamp <= rewardPoolInfo.rewardEndTime);

    uint256 userPoolBalance_before = (privacyMining.getUserPoolInfo(address(this), _assetId)).userPoolBalance;
    uint256 globalPoolBalance_before = rewardPoolInfo.globalPoolBalance;

    emit DebugErrUint('_amount', _amount);
    emit DebugErrUint('userPoolBalance_before', userPoolBalance_before);
    emit DebugErrUint('globalPoolBalance_before', globalPoolBalance_before);

    // action
    try privacyMining.depositAssetToPool(address(this), _assetId, _amount) {
      TestPMC.RewardPool memory rewardPoolInfo_new = privacyMining.getRewardPoolInfo(_assetId);
      assert((privacyMining.getUserPoolInfo(address(this), _assetId)).phase == 1);

      uint256 userPoolBalance_after = (privacyMining.getUserPoolInfo(address(this), _assetId)).userPoolBalance;
      uint256 globalPoolBalance_after = rewardPoolInfo_new.globalPoolBalance;

      // Error logs
      emit DebugErrUint('userPoolBalance_after', userPoolBalance_after);
      emit DebugErrUint('globalPoolBalance_after', globalPoolBalance_after);

      // post-conditions
      require(globalPoolBalance_after <= MAX_GLOBAL_POOL_BALANCE);

      assert(userPoolBalance_after == userPoolBalance_before + _amount);
      assert(globalPoolBalance_after == globalPoolBalance_before + _amount);
    } catch (bytes memory err) {
      emit LogErr(err);
      // assert(false); // NOTE: CHECK WHY IT WENT HERE
    }
  }

  // 2. Verify that the staked silent is powered by the user's voucher balance from phase one
  function testStakingBalanceChange(uint256 _assetId, uint256 _amount) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    if (_amount > MAX_DEPOSIT_OR_STAKE_BALANCE) {
      _amount = 1 + (_amount % MAX_DEPOSIT_OR_STAKE_BALANCE);
    }

    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);
    TestPMC.UserPoolInfo memory userPoolInfo = privacyMining.getUserPoolInfo(address(this), _assetId);

    // pre-condition
    require(rewardPoolInfo.phase == 2);
    require(block.timestamp <= rewardPoolInfo.rewardEndTime);
    require(userPoolInfo.phase != 0);
    require(userPoolInfo.userPoolBalance > 0);

    uint256 userPoolVoucherBalance = userPoolInfo.userVoucherBalance;
    require(userPoolVoucherBalance > 0);

    uint256 userPoolBalance_before = userPoolInfo.userPoolBalance;
    uint256 globalPoolBalance_before = rewardPoolInfo.globalPoolBalance;

    // If user's phase is 1 prior to calling the stake fx, the fx will reset his/her userPoolBalance to 0
    if (userPoolInfo.phase == 1) {
      userPoolBalance_before = 0;
    }

    // Error logs
    emit DebugErrUint('userPoolBalance_before', userPoolBalance_before);
    emit DebugErrUint('globalPoolBalance_before', globalPoolBalance_before);

    // action
    try privacyMining.stakeSilentToPool(_assetId, _amount) {
      TestPMC.RewardPool memory rewardPoolInfo_new = privacyMining.getRewardPoolInfo(_assetId);
      require(rewardPoolInfo_new.globalPoolBalance <= MAX_GLOBAL_POOL_BALANCE * MAX_GLOBAL_POOL_BALANCE); // Silent x Vouchers

      uint256 userPoolBalance_after = (privacyMining.getUserPoolInfo(address(this), _assetId)).userPoolBalance;
      uint256 globalPoolBalance_after = rewardPoolInfo_new.globalPoolBalance;

      // Error logs
      emit DebugErrUint('userPoolBalance_after', userPoolBalance_after);
      emit DebugErrUint('globalPoolBalance_after', globalPoolBalance_after);
      emit DebugErrUint('user vouchers', userPoolVoucherBalance);

      assert(userPoolBalance_after == userPoolBalance_before + _amount * userPoolVoucherBalance);
      assert(globalPoolBalance_after == globalPoolBalance_before + _amount * userPoolVoucherBalance);
    } catch (bytes memory err) {
      emit LogErr(err);
      // assert(false);
    }
  }

  // 3. Verify that the user/globalPoolBalance doesn't ever exceed the cumulative _amount used while staking
  function testUnstakingBalanceChange(uint256 _assetId, uint256 _amount) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    if (_amount > MAX_DEPOSIT_OR_STAKE_BALANCE) {
      _amount = 1 + (_amount % MAX_DEPOSIT_OR_STAKE_BALANCE);
    }

    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);
    TestPMC.UserPoolInfo memory userPoolInfo = privacyMining.getUserPoolInfo(address(this), _assetId);

    // pre-conditions
    require(rewardPoolInfo.phase == 2);
    require(block.timestamp <= rewardPoolInfo.rewardEndTime);
    require(userPoolInfo.phase != 0);
    uint256 userPoolVoucherBalance = userPoolInfo.userVoucherBalance;
    require(userPoolVoucherBalance > 0);
    uint256 userPoolBalance_before = userPoolInfo.userPoolBalance;
    require(userPoolBalance_before > 0);

    uint256 globalPoolBalance_before = (privacyMining.getRewardPoolInfo(_assetId)).globalPoolBalance;

    // Error Logs
    emit DebugErrUint('_amount', _amount);
    emit DebugErrUint('userPoolVoucherBalance', userPoolVoucherBalance);
    emit DebugErrUint('userPoolBalance_before', userPoolBalance_before);
    emit DebugErrUint('globalPoolBalance_before', globalPoolBalance_before);

    // action
    try privacyMining.unstakeSilentFromPool(_assetId, _amount) {
      uint256 userPoolBalance_after = (privacyMining.getUserPoolInfo(address(this), _assetId)).userPoolBalance;
      uint256 globalPoolBalance_after = (privacyMining.getRewardPoolInfo(_assetId)).globalPoolBalance;

      // Error logs
      emit DebugErrUint('userPoolBalance_after', userPoolBalance_after);
      emit DebugErrUint('globalPoolBalance_after', globalPoolBalance_after);

      // post-conditions
      assert(userPoolBalance_after == userPoolBalance_before - _amount * userPoolVoucherBalance);
      assert(globalPoolBalance_after == globalPoolBalance_before - _amount * userPoolVoucherBalance);
    } catch (bytes memory err) {
      emit LogErr(err);
      // assert(false);
    }
  }

  // 4. CLAIM REWARDS: Test that the user's claimed Silent rewards doesn't exceed pool's cumulative Silent rewards
  // And Silent rewards added to user's account balances the Silent reward deduced from PMC
  function testClaimSilentRewardsBalanceChange(uint256 _assetId) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }

    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);
    TestPMC.PhaseInfo memory phaseInfo = privacyMining.getPhaseInfo(rewardPoolInfo.phase);

    // pre-conditions
    require(rewardPoolInfo.phase == 2);
    // require(block.timestamp <= rewardPoolInfo.rewardEndTime); // Not needed
    require(rewardPoolInfo.allocPoint != 0);
    require((privacyMining.getUserPoolInfo(address(this), _assetId)).phase == 2);

    uint256 userSilentBalance_before = silentToken.balanceOf(address(this));
    uint256 pmcSilentBalance_before = silentToken.balanceOf(address(privacyMining));

    // action
    try privacyMining.claimRewardsFromPool(_assetId) {
      uint256 pmcSilentBalance_after = silentToken.balanceOf(address(privacyMining));
      uint256 userSilentBalance_after = silentToken.balanceOf(address(this));

      // Error logs
      emit DebugErrUint('userSilentBalance_change', userSilentBalance_after - userSilentBalance_before);
      emit DebugErrUint('pmcSilentBalance_change', pmcSilentBalance_before - pmcSilentBalance_after);
      emit DebugErrUint('maxPoolSilentAllocation', maxRewardsDistributed[_assetId][2]);

      // Update the max claimed rewards for the reward pool by the user
      maxRewardsClaimed[_assetId][2] += userSilentBalance_after - userSilentBalance_before;

      // Update the max distributable/emitted rewards for the reward pool by PMC
      maxRewardsDistributed[_assetId][2] =
        cachedPoolDistributedRewards[_assetId][2] +
        ((phaseInfo.rewardEmissionRate *
          rewardPoolInfo.allocPoint *
          (privacyMining.lastRewardApplicableTime(rewardPoolInfo.rewardEndTime) -
            lastTimeTotalAllocChanged[rewardPoolInfo.phase])) / phaseInfo.totalAllocPoint);

      // post-conditions
      assert(userSilentBalance_after - userSilentBalance_before == pmcSilentBalance_before - pmcSilentBalance_after);
      assert(maxRewardsClaimed[_assetId][2] <= maxRewardsDistributed[_assetId][2]);
    } catch (bytes memory err) {
      emit LogErr(err);
      // assert(false);
    }
  }

  // 5. Verify that user can never claim rewards from a different phase
  // And rewards claimed doesn't exceed pool's allocated rewards
  function testValidClaimRewards(uint256 _assetId) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);
    TestPMC.UserPoolInfo memory userPoolInfo = privacyMining.getUserPoolInfo(address(this), _assetId);
    TestPMC.PhaseInfo memory phaseInfo = privacyMining.getPhaseInfo(rewardPoolInfo.phase);

    uint8 poolPhase = rewardPoolInfo.phase;
    uint8 userPhase = userPoolInfo.phase;

    require(poolPhase == userPhase);
    emit DebugErrUint('poolPhase', poolPhase);
    emit DebugErrUint('userPhase', userPhase);
    emit DebugErrUint('poolAllocPoint', rewardPoolInfo.allocPoint);
    emit DebugErrUint('totalAllocpoint', phaseInfo.totalAllocPoint);

    uint256 userRewardsBalance_before;
    if (poolPhase == 1) {
      userRewardsBalance_before = userPoolInfo.userVoucherBalance;
    } else {
      userRewardsBalance_before = silentToken.balanceOf(address(this));
      require(silentToken.balanceOf(address(privacyMining)) > maxRewardsDistributed[_assetId][2]);
    }

    try privacyMining.claimRewardsFromPool(_assetId) {
      if (poolPhase != userPhase) {
        assert(false);
      }
      // Fetch the rewards balance of the user after claiming
      uint256 userRewardsBalance_after;
      if (poolPhase == 1) {
        userRewardsBalance_after = (privacyMining.getUserPoolInfo(address(this), _assetId)).userVoucherBalance;
      } else {
        userRewardsBalance_after = silentToken.balanceOf(address(this));
      }

      // Update the max claimed rewards for the reward pool by the user
      maxRewardsClaimed[_assetId][poolPhase] += userRewardsBalance_after - userRewardsBalance_before;

      // Update the max distributable/emitted rewards for the reward pool by PMC
      maxRewardsDistributed[_assetId][poolPhase] =
        cachedPoolDistributedRewards[_assetId][poolPhase] +
        (phaseInfo.rewardEmissionRate *
          rewardPoolInfo.allocPoint *
          (privacyMining.lastRewardApplicableTime(rewardPoolInfo.rewardEndTime) -
            lastTimeTotalAllocChanged[poolPhase])) /
        phaseInfo.totalAllocPoint;

      emit DebugErrUint('maxRewardsClaimed', maxRewardsClaimed[_assetId][poolPhase]);
      emit DebugErrUint('maxRewardsDistributed', maxRewardsDistributed[_assetId][poolPhase]);

      assert(maxRewardsClaimed[_assetId][poolPhase] <= maxRewardsDistributed[_assetId][poolPhase]);
    } catch (bytes memory err) {
      emit LogErr(err);
      // assert(false);
    }
  }

  // 6. CLAIM REWARDS: Test that the user Voucher rewards doesn't exceed pool's allocated rewards
  function testVoucherRewardsNeverExceedMaxPoolAllocation(uint256 _assetId) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }

    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId); // Info for the same phase as pool
    TestPMC.UserPoolInfo memory userPoolInfo = privacyMining.getUserPoolInfo(address(this), _assetId);
    TestPMC.PhaseInfo memory phaseInfo = privacyMining.getPhaseInfo(rewardPoolInfo.phase);

    require(rewardPoolInfo.phase == 1);
    require(userPoolInfo.phase == 1);
    // require(block.timestamp <= rewardPoolInfo.rewardEndTime); // Not needed

    uint256 userVoucherBalance_before = userPoolInfo.userVoucherBalance;

    // action
    try privacyMining.claimRewardsFromPool(_assetId) {
      uint256 userVoucherBalance_after = (privacyMining.getUserPoolInfo(address(this), _assetId)).userVoucherBalance;

      maxRewardsClaimed[_assetId][1] += userVoucherBalance_after - userVoucherBalance_before;

      maxRewardsDistributed[_assetId][1] =
        cachedPoolDistributedRewards[_assetId][1] +
        (phaseInfo.rewardEmissionRate *
          rewardPoolInfo.allocPoint *
          (privacyMining.lastRewardApplicableTime(rewardPoolInfo.rewardEndTime) - lastTimeTotalAllocChanged[1])) /
        phaseInfo.totalAllocPoint;

      emit DebugErrUint('userVoucherBalance_change', userVoucherBalance_after - userVoucherBalance_before);
      emit DebugErrUint('maxRewardsClaimed', maxRewardsClaimed[_assetId][1]);
      emit DebugErrUint('maxPoolVoucherAllocation', maxRewardsDistributed[_assetId][1]);

      // post-condition
      assert(maxRewardsClaimed[_assetId][1] <= maxRewardsDistributed[_assetId][1]);
    } catch (bytes memory err) {
      emit LogErr(err);
      // assert(false);
    }
  }

  // :::::::::::::::: SYSTEM LEVEL INVARIANTS :::::::::::::::: //

  //1. Test: Pool's Phase never goes less than 0 and greater than 2
  function testValidPoolPhase(uint256 _assetId) public view {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    uint256 phase = (privacyMining.getRewardPoolInfo(_assetId)).phase;
    assert(phase >= 0 && phase <= 2);
  }

  // 2. Test User's phase never goes less than 0 and greater than 2
  function testValidUserPhase(uint256 _assetId) public view {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }
    uint256 phase = (privacyMining.getUserPoolInfo(address(this), _assetId)).phase;
    assert(phase >= 0 && phase <= 2);
  }

  // 3. Verify that the accRewardPerShare increases with time in each phase
  function testAccRewardPerShareIncreases(uint256 _assetId) public {
    if (_assetId > 5) {
      _assetId = 1 + (_assetId % 5);
    }

    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);
    uint256 poolGlobalBalance = rewardPoolInfo.globalPoolBalance;
    uint256 poolAccRewardPerShare_old = rewardPoolInfo.accRewardPerShare;

    require(rewardPoolInfo.phase == 1 || rewardPoolInfo.phase == 2);
    require(rewardPoolInfo.allocPoint > 0);
    require(poolGlobalBalance > 0 && poolGlobalBalance < MAX_GLOBAL_POOL_BALANCE);
    require(block.timestamp > rewardPoolInfo.lastRewardTime);
    require(block.timestamp <= rewardPoolInfo.rewardEndTime);

    emit DebugErrUint('_current timestamp', block.timestamp);
    emit DebugErrUint('_lastReward timestamp', rewardPoolInfo.lastRewardTime);

    // One more call to make sure it's not the first deposit: in which case `accRewardPerShare` can be zero
    try privacyMining.updatePoolRewardVariables(_assetId) returns (TestPMC.RewardPool memory) {
      TestPMC.RewardPool memory rewardPoolInfo_new = privacyMining.getRewardPoolInfo(_assetId);

      uint256 poolAccRewardPerShare_new = rewardPoolInfo_new.accRewardPerShare;
      emit DebugErrUint('poolGlobalBalance', rewardPoolInfo_new.globalPoolBalance);
      emit DebugErrUint('poolAccRewardPerShare_new', poolAccRewardPerShare_new);
      emit DebugErrUint('poolAccRewardPerShare_old', poolAccRewardPerShare_old);
      emit DebugErrUint('poolPhase', rewardPoolInfo_new.phase);
      emit DebugErrUint('current timestamp', block.timestamp);
      emit DebugErrUint('lastReward timestamp', rewardPoolInfo_new.lastRewardTime);

      assert(poolAccRewardPerShare_new > 0);
      assert(poolAccRewardPerShare_new > poolAccRewardPerShare_old);
    } catch (bytes memory err) {
      emit LogErr(err);
      assert(block.timestamp <= rewardPoolInfo.lastRewardTime); // NOTE: REQUIRE THIS TO BE TRUE IN THE MAIN CONTRACT

      emit DebugErrUint('current timestamp_', block.timestamp);
      emit DebugErrUint('lastReward timestamp_', rewardPoolInfo.lastRewardTime);
    }
  }

  // 4. Reward emission rate should never be set for a phase other than 1 or 2
  function testRewardEmissionRate(uint8 _phase) public view {
    if (_phase != 1 && _phase != 2) {
      assert((privacyMining.getPhaseInfo(_phase)).rewardEmissionRate == 0);
    }
  }

  // 5. AllocPoints of pools not in either phase 1 or phase 2 is always 0
  function testAllocPoints(uint256 _assetId) public view {
    TestPMC.RewardPool memory rewardPoolInfo = privacyMining.getRewardPoolInfo(_assetId);
    if (rewardPoolInfo.phase != 1 && rewardPoolInfo.phase != 2) {
      assert(rewardPoolInfo.allocPoint == 0);
    }
  }
}
