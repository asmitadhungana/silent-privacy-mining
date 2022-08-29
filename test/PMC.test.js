const {ethers} = require('hardhat');
const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const {constants} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const {expect} = require("chai");
const {toWei, fromWei} = require('web3-utils');

const {VOUCHER_REWARD_TYPE, STAKING_REWARD_TYPE, ONE_MONTH} = require('./helpers/constants');

const toBN = v => ethers.BigNumber.from(v.toString());
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');

describe("PMC", () => {
  let silentToken;
  let smsap;
  let privacyMining;

  let ONE_BILLION = toUnit('1000');


  // ============ HELPER FUNCTIONS ============ //

  const doDeployDependentContracts = async () => {
    [deployer, assetOwner1, assetOwner2] = await ethers.getSigners();

    // Deploy Silent Token
    const SilentToken = await hre.ethers.getContractFactory("SilentToken");
    silentToken = await SilentToken.deploy("SilentToken", "SILENT", 1000000000);
    await silentToken.deployed();

    // Deploy SMSAP contract
    const SMSAP = await hre.ethers.getContractFactory("SMSAP");
    smsap = await SMSAP.deploy();
    await smsap.deployed();
  }
    
  const doDeployPMC = async (silentTokenAddress, smsapAddress) => {
    const PrivacyMining = await hre.ethers.getContractFactory("PrivacyMining");
    privacyMining = await PrivacyMining.deploy(silentTokenAddress, smsapAddress);
    await privacyMining.deployed();
    return {privacyMining};
  }

  const doSetPmcInSMSAP = async () => {
    await smsap.connect(deployer).addPrivacyMiningContract(privacyMining.address);
  }

  const doCreateAssetRewardPool = async (_assetId, _rewardType, _reward, _rewardsDuration) => {
    await privacyMining.createAssetRewardPool(
      _assetId,
      _rewardType,
      _reward,
      _rewardsDuration
    );
  }

  const doApprovePmcForTokenSpending = async (_assetOwner, amount) => {
    await silentToken.connect(deployer).transfer(_assetOwner.address, amount);
    await silentToken.connect(_assetOwner).approve(privacyMining.address, amount);
  }

  // ============ TEST FIXTURES ============ //

  const createVoucherRewardPoolFixture = async() => {
    [deployer, assetOwner1, assetOwner2] = await ethers.getSigners();
    const rewardPool = {
      assetId: 1,
      rewardType: VOUCHER_REWARD_TYPE,
      reward: ONE_BILLION,
      rewardsDuration: ONE_MONTH
    }

    await doDeployDependentContracts();
    await doDeployPMC(silentToken.address, smsap.address);
    await smsap.addPrivacyMiningContract(privacyMining.address);
    await privacyMining.createAssetRewardPool(
      rewardPool.assetId, 
      rewardPool.rewardType, 
      rewardPool.reward, 
      rewardPool.rewardsDuration
    );

    const phaseOnePeriodFinish = (await time.latest()) + rewardPool.rewardsDuration;

    return { rewardPool, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2 };
  }

  const claimVoucherRewardsFixture = async() => {
    const { rewardPool, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2 } = await createVoucherRewardPoolFixture();

    // USER: DEPOSIT ASSET TO THE POOL
    const depositAmount = toUnit('1000'); 
    await smsap.connect(assetOwner1).depositAsset(rewardPool.assetId, depositAmount);


    // INCREASE THE TIME TO ACCUMULATE SOME REWARDS 
    await time.increaseTo(phaseOnePeriodFinish - 10000);

    // claim voucher rewards from pool
    await privacyMining.connect(assetOwner1).claimRewards(
      rewardPool.assetId, 
      rewardPool.rewardType
    );

    // console.log('userPoolVoucherBalance:: ', await privacyMining.userPoolVoucherBalance(
    //   assetOwner1.address,
    //   rewardPool.assetId
    // ));

    return {rewardPool, depositAmount, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2};
  }

  const createStakingRewardsFixture = async() => {
    // const {rewardPool, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2 } = await createVoucherRewardPoolFixture();

    const {rewardPool, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2 } = await claimVoucherRewardsFixture();

    await time.increaseTo(phaseOnePeriodFinish);

    const stakingRewardPool = {
      assetId: rewardPool.assetId,
      rewardType: STAKING_REWARD_TYPE,
      reward: ONE_BILLION,
      rewardsDuration: ONE_MONTH
    }

    // Create the staking reward pool
    await doCreateAssetRewardPool(
      stakingRewardPool.assetId, 
      stakingRewardPool.rewardType, 
      stakingRewardPool.reward, 
      stakingRewardPool.rewardsDuration
    );

    const phaseTwoPeriodFinish = (await time.latest()) + stakingRewardPool.rewardsDuration;

    return {rewardPool, phaseOnePeriodFinish, assetOwner1, assetOwner2, stakingRewardPool, phaseTwoPeriodFinish};
  }

  const stakeSilentInPoolFixture = async() => {
    const {rewardPool, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2 } = await claimVoucherRewardsFixture();

    // INCREASE TIME TO LET PHASE ONE'S PERIOD FINISH
    await time.increaseTo(phaseOnePeriodFinish);

    // DEPLOYER: CREATES STAKING REWARD POOL
    const stakingRewardPool = {
      assetId: rewardPool.assetId,
      rewardType: STAKING_REWARD_TYPE,
      reward: ONE_BILLION,
      rewardsDuration: ONE_MONTH
    }

    await doCreateAssetRewardPool(
      stakingRewardPool.assetId, 
      stakingRewardPool.rewardType, 
      stakingRewardPool.reward, 
      stakingRewardPool.rewardsDuration
    );

    // USER: Approves SILENT tokens to PMC for spending
    const silentStakingAmount = toUnit('1000');
    await doApprovePmcForTokenSpending(assetOwner1, silentStakingAmount);

    // USER: Stakes SILENT tokens to the pool
    await privacyMining.connect(assetOwner1).stakeSilentToPool(
      stakingRewardPool.assetId,
      silentStakingAmount
    );

    // Compute the phase two finish period for the pool
    const phaseTwoPeriodFinish = (await time.latest()) + stakingRewardPool.rewardsDuration;

    return {stakingRewardPool, silentStakingAmount, phaseOnePeriodFinish, phaseTwoPeriodFinish, assetOwner1, assetOwner2};
  }

  // ============ TEST CASES ============ //


  describe('constructor()', () => {
    beforeEach(async () => {
      [deployer, assetOwner1, assetOwner2] = await ethers.getSigners();
      await doDeployDependentContracts();
    });

    it('should revert for zero addresses for dependent contracts', async () => {
      await expect(
        doDeployPMC(ZERO_ADDRESS, ZERO_ADDRESS)
      ).to.be.revertedWith('Invalid Contract Addresses');
    });

    it('should set the correct state variables', async () => {
      await doDeployPMC(silentToken.address, smsap.address);
      expect (await privacyMining.smsapContract()).to.eq(smsap.address);
      // smsap contract [?]
    });
  });


  describe('createAssetRewardPool()', () => {
    beforeEach(async () => {
      await doDeployDependentContracts();
      await doDeployPMC(silentToken.address, smsap.address);
      await doSetPmcInSMSAP();
    });

    it('should let the owner create a new asset reward pool', async () => {
      const rewardPool = {
        assetId: 1,
        rewardType: VOUCHER_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      await privacyMining.createAssetRewardPool(
        rewardPool.assetId,
        rewardPool.rewardType,
        rewardPool.reward,
        rewardPool.rewardsDuration
      );
    });

    it('shouldn\'t let two pools to be created for the same assetId', async() => {
      // Step 1. Create a reward pool for assetId = 1
      const rewardPool = {
        assetId: 1,
        rewardType: VOUCHER_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }
      await privacyMining.createAssetRewardPool(
        rewardPool.assetId,
        rewardPool.rewardType,
        rewardPool.reward,
        rewardPool.rewardsDuration
      );

      // Step 2. ReCreate a reward pool for assetId = 1
      const _rewardPool = {
        assetId: 1,
        rewardType: VOUCHER_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }
      await expect (
        privacyMining.createAssetRewardPool(
          _rewardPool.assetId,
          _rewardPool.rewardType,
          _rewardPool.reward,
          _rewardPool.rewardsDuration
        )
      ).to.be.revertedWith('Asset pool already created');

      await expect(
        doDeployPMC(ZERO_ADDRESS, ZERO_ADDRESS)
      ).to.be.revertedWith('Invalid Contract Addresses');
    });

    it('should initialize the phase of a new asset reward pool as 1', async() => {
      const rewardPool = {
        assetId: 1,
        rewardType: VOUCHER_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      };

      await doCreateAssetRewardPool(
        rewardPool.assetId,
        rewardPool.rewardType,
        rewardPool.reward,
        rewardPool.rewardsDuration
      );

      const deployedRewardPool = await privacyMining.pools(rewardPool.assetId)
      expect (await deployedRewardPool.phase).to.eq(1);
    });

    it('should add the newly deployed reward pool to the deployedPools list', async() => {
      const rewardPool = {
        assetId: 1,
        rewardType: VOUCHER_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      console.log(ethers.utils.formatBytes32String("Silent"));
      await doCreateAssetRewardPool(
        rewardPool.assetId,
        rewardPool.rewardType,
        rewardPool.reward,
        rewardPool.rewardsDuration
      );

      const deployedPoolsArr = await privacyMining.getDeployedPools();
      // console.log('deployedPoolsArr', deployedPoolsArr);

      const newlyDeployedRewardPool = deployedPoolsArr[deployedPoolsArr.length - 1];
      // console.log('newlyDeployedRewardPool', newlyDeployedRewardPool);

      const poolPhase = ethers.BigNumber.from(newlyDeployedRewardPool.phase);
      // expect (newlyDeployedRewardPool.assetId).to.eq(rewardPool.assetId);
    });

    // STAKING REWARD POOL
    it('shouldn\'t let staking reward pool to be created before voucher reward pool', async() => {
      const rewardPool_staking = {
        assetId: 1,
        rewardType: STAKING_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      await expect( 
        doCreateAssetRewardPool(
          rewardPool_staking.assetId,
          rewardPool_staking.rewardType,
          rewardPool_staking.reward,
          rewardPool_staking.rewardsDuration
        )
      ).to.be.revertedWithCustomError(privacyMining, "OnlyCallableInPhaseOne");
    });


    it('should let owner create staking reward pool after reward period of phase I has finished', async() => {
      // const {phaseOnePeriodFinish} = await loadFixture(createVoucherRewardPoolFixture);
      const {phaseOnePeriodFinish} = await createVoucherRewardPoolFixture();
      
      await time.increaseTo(phaseOnePeriodFinish + 1);

      rewardPool_staking = {
        assetId: 1,
        rewardType: STAKING_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      await (
        doCreateAssetRewardPool(rewardPool_staking.assetId, rewardPool_staking.rewardType, rewardPool_staking.reward, rewardPool_staking.rewardsDuration)
      );
      
      const deployedRewardPool = await privacyMining.pools(rewardPool_staking.assetId);
      // const rewardForPool = await privacyMining.rewardForPool(rewardPool_staking.assetId, rewardPool_staking.STAKING_REWARD_TYPE);
      // console.log('rewardForPool', rewardForPool);
      // expect (rewardForPool.rewardsDistributor).to.not.eq(ZERO_ADDRESS);
      expect (deployedRewardPool.phase).to.eq(2);
    });

    it('should initialize the phase of a new staking reward pool as 2', async() => {
      const {phaseOnePeriodFinish} = await loadFixture(createVoucherRewardPoolFixture);
      
      await time.increaseTo(phaseOnePeriodFinish + 1);

      rewardPool_staking = {
        assetId: 1,
        rewardType: STAKING_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      await( 
        doCreateAssetRewardPool(
          rewardPool_staking.assetId,
          rewardPool_staking.rewardType,
          rewardPool_staking.reward,
          rewardPool_staking.rewardsDuration
        )
      );

      const deployedRewardPool = await privacyMining.pools(rewardPool_staking.assetId);
      expect (deployedRewardPool.phase).to.eq(2);

    });

    // // FAILING TEST CASE
    // it('should initialize the new reward pool with the correct parameters', async() => {
    //   const {phaseOnePeriodFinish} = await createVoucherRewardPoolFixture();
      
    //   await time.increaseTo(phaseOnePeriodFinish);

    //   rewardPool_staking = {
    //     assetId: 1,
    //     rewardType: STAKING_REWARD_TYPE,
    //     reward: ONE_BILLION,
    //     rewardsDuration: ONE_MONTH
    //   }

    //   await( 
    //     doCreateAssetRewardPool(
    //       rewardPool_staking.assetId,
    //       rewardPool_staking.rewardType,
    //       rewardPool_staking.reward,
    //       rewardPool_staking.rewardsDuration
    //     )
    //   );

    //   const _rewardForPool = await privacyMining.rewardForPool(rewardPool_staking.assetId, rewardPool_staking.STAKING_REWARD_TYPE);
    //   console.log('_rewardForPool', _rewardForPool);
    //   expect (_rewardForPool.rewardsDistributor).to.not.eq(ZERO_ADDRESS);
    // });

    it('should emit the event `RewardAdded` after successful creation of new reward pool', async() => {
      const {phaseOnePeriodFinish} = await createVoucherRewardPoolFixture();
      
      await time.increaseTo(phaseOnePeriodFinish);

      rewardPool_staking = {
        assetId: 1,
        rewardType: STAKING_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      await expect(
        privacyMining.createAssetRewardPool(
          rewardPool_staking.assetId,
          rewardPool_staking.rewardType,
          rewardPool_staking.reward,
          rewardPool_staking.rewardsDuration
        )
      ).to.emit(privacyMining, "RewardAdded")
      .withArgs(rewardPool_staking.assetId, rewardPool_staking.rewardType, rewardPool_staking.reward);
      
    });

    it('should revert if the provided rewardType isn\'t the predesignated types', async() => {
      await expect( 
        doCreateAssetRewardPool(
          rewardPool_staking.assetId,
          ethers.utils.formatBytes32String("Silent"),
          rewardPool_staking.reward,
          rewardPool_staking.rewardsDuration
        )
      ).to.be.reverted;
    });
  });


  describe ('depositAssetToPool()', () => {
    beforeEach(async () => {
      const {assetOwner1, rewardPool, phaseOnePeriodFinish} = await createVoucherRewardPoolFixture();
      this.phaseOnePeriodFinish = phaseOnePeriodFinish;
      this.rewardPool = rewardPool;
      this.assetOwner1 = assetOwner1;
    });   

    it('FAILURE: should revert if the caller is not the smasp contract', async () => {
      await expect(
        privacyMining.connect(deployer).depositAssetToPool(
          user = deployer.address, 
          assetId = 1, 
          amount = toUnit('100')
        )
      ).to.be.revertedWith("Only SMSAP can call this");
    });

    // IMPLEMENT
    it('FAILURE: should revert if the reward pool has not been created', async () => {
    });

    it('FAILURE: should revert if the reward period for pool\'s phase one has finished', async () => {
      await time.increaseTo(this.phaseOnePeriodFinish);

      await expect(
        smsap.connect(this.assetOwner1).depositAsset(
          assetId = 1, 
          amount = toUnit('100')
        )
      ).to.be.revertedWithCustomError(privacyMining, "RewardPeriodFinished");
    });

    it('FAILURE: should revert if the reward period is not in phase one', async () => {
      await time.increaseTo(this.phaseOnePeriodFinish);
      await doCreateAssetRewardPool(this.rewardPool.assetId, STAKING_REWARD_TYPE, ONE_BILLION, ONE_MONTH);

      await expect(
        smsap.connect(this.assetOwner1).depositAsset(
          this.rewardPool.assetId, 
          amount = toUnit('100')
        )
      ).to.be.revertedWithCustomError(privacyMining, "OnlyCallableInPhaseOne");

    });

    it('SUCCESS: should make a successful deposit on behalf of caller when called from SMSAP', async () => {
      await smsap.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );
    });

    it('SUCCESS: it should change the reward pool\'s `globalAssetDeposit` to `amount`', async () => {
      await smsap.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const _rewardPool = await privacyMining.pools(this.rewardPool.assetId);
      expect(_rewardPool.globalAssetsDeposit).to.eq(amount);
    });

    it('SUCCESS: it should initialize the `userPoolBalance` by `amount` on initial deposit', async () => {
      await smsap.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const _userPoolState = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );
      expect(_userPoolState.userPoolBalance).to.eq(amount);
    });

    it('SUCCESS: it should add the `userPoolBalance` by `amount` on subsequent deposits', async () => {
      // USER MAKES INITAL DEPOSIT
      await smsap.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const _userPoolState = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );
      expect(_userPoolState.userPoolBalance).to.eq(amount);

      // USER MAKES SUBSEQUENT DEPOSIT
      await smsap.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const _userPoolState_sub = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect(
        parseInt(fromUnit(_userPoolState_sub.userPoolBalance.toString()))
      ).to.eq(
        parseInt(fromUnit(amount.toString())) + parseInt(fromUnit(amount.toString()))
      );
    });

    it('SUCCESS: it should emit the event `AssetDepositedToPool`', async () => {
      await expect(
        await smsap.connect(this.assetOwner1).depositAsset(
          this.rewardPool.assetId, 
          amount = 100
        )
      ).to.emit(privacyMining, "AssetDepositedToPool")
      .withArgs(this.assetOwner1.address, this.rewardPool.assetId, amount);
    });

    it('SUCCESS: it should set the `rewardPerTokenStored` for the rewardPool to Zero on first deposit', async () => {
      await smsap.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const _rewardForPool = await privacyMining.rewardForPool(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      const _pool = await privacyMining.pools(this.rewardPool.assetId);
      console.log('_pool.globalAssetsDeposit: ', _pool.globalAssetsDeposit);

      // lastTimeRewardApplicable
      const _rewardRate = this.rewardPool.reward / this.rewardPool.rewardsDuration;
      console.log("_rewardRate: ", _rewardRate);

      // INCREASE THE TIME
      await time.increaseTo(this.phaseOnePeriodFinish - 10000);

      const _lastTimeRewardApplicable = await privacyMining.lastTimeRewardApplicable(this.rewardPool.assetId, this.rewardPool.rewardType);
      console.log('_lastTimeRewardApplicable ', _lastTimeRewardApplicable);
      console.log('_rewardForPool.lastUpdateTime: ',  _rewardForPool.lastUpdateTime);
      
      console.log('_lastTimeRewardApplicable - _rewardForPool.lastUpdateTime: ', _lastTimeRewardApplicable - _rewardForPool.lastUpdateTime);

      const poolRewardPerTokenPaid = _rewardRate * (_lastTimeRewardApplicable - _rewardForPool.lastUpdateTime) * 1e18 / _pool.globalAssetsDeposit;
      console.log('poolRewardPerTokenPaid: ', poolRewardPerTokenPaid)

      console.log('rewardForPool.rewardPerTokenStored: ', _rewardForPool.rewardPerTokenStored);

      // expect(_rewardForPool.rewardPerTokenStored).to.eq(toBN(poolRewardPerTokenPaid)); // Only whole numbers
      expect(_rewardForPool.rewardPerTokenStored).to.eq(0);
    });

    //TODO
    it('SUCCESS: it should update the `userPoolRewards` of the reward pool for the user on subsequent deposits', async () => {});
    // TODO
    it('FAILURE: should revert if a user tries to deposit asset to an undeployed reward pool', async() => {});
    // TODO
    it('FAILURE: should revert if a user tries to deposit asset to the staking reward pool', async() => {});
    // TODO: FAILING TEST CASE
    it('SUCCESS: it should update the `rewardPerTokenStored` for the rewardPool on the second deposit', async () => {
      // First deposit
      await smsap.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      // INCREASE THE TIME
      await time.increaseTo(this.phaseOnePeriodFinish - 100000);

      // Second Deposit
      await smsap.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const _rewardForPool = await privacyMining.rewardForPool(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      const _pool = await privacyMining.pools(this.rewardPool.assetId);
      console.log('_pool.globalAssetsDeposit: ', _pool.globalAssetsDeposit);

      const _rewardRate = this.rewardPool.reward / this.rewardPool.rewardsDuration;
      console.log("_rewardRate: ", _rewardRate);

      // INCREASE THE TIME
      await time.increaseTo(this.phaseOnePeriodFinish - 10000);

      // lastTimeRewardApplicable
      const _lastTimeRewardApplicable = await privacyMining.lastTimeRewardApplicable(this.rewardPool.assetId, this.rewardPool.rewardType);
      console.log('_lastTimeRewardApplicable ', _lastTimeRewardApplicable);
      console.log('_rewardForPool.lastUpdateTime: ',  _rewardForPool.lastUpdateTime);
      
      console.log('_lastTimeRewardApplicable - _rewardForPool.lastUpdateTime: ', _lastTimeRewardApplicable - _rewardForPool.lastUpdateTime);

      const poolRewardPerTokenPaid = _rewardRate * (_lastTimeRewardApplicable - _rewardForPool.lastUpdateTime) * 1e18 / _pool.globalAssetsDeposit;
      console.log('poolRewardPerTokenPaid: ', poolRewardPerTokenPaid)

      console.log('rewardForPool.rewardPerTokenStored: ', _rewardForPool.rewardPerTokenStored);

      // expect(_rewardForPool.rewardPerTokenStored).to.eq(poolRewardPerTokenPaid);
      // expect(_rewardForPool.rewardPerTokenStored).to.eq(0); // THIS IS TRUE AT THIS POINT
      expect(_rewardForPool.rewardPerTokenStored).to.eq(toBN(poolRewardPerTokenPaid)); // Only whole numbers
    });
    // TODO
    it('SUCCESS: it should update the `userPoolRewardPerTokenPaid` of the user ', async () => {
    });
  });


  describe ('stakeSilentToPool()', () => {
    beforeEach(async() => {
      const {rewardPool, stakingRewardPool, depositAmount, phaseOnePeriodFinish, phaseTwoPeriodFinish, deployer, assetOwner1, assetOwner2} = await createStakingRewardsFixture();
      this.assetOwner1 = assetOwner1;
      this.assetOwner2 = assetOwner2;
      this.depositAmount = depositAmount;
      this.rewardPool = rewardPool;
      this.stakingRewardPool = stakingRewardPool;
      this.phaseOnePeriodFinish = phaseOnePeriodFinish;
      this.phaseTwoPeriodFinish = phaseTwoPeriodFinish;
    });

    it('FAILURE: should revert if staking with ZERO amount', async () => {
      // STAKE SILENT TO POOL
      await expect (
        privacyMining.connect(this.assetOwner1).stakeSilentToPool(
          assetId = this.stakingRewardPool.assetId,
          amount = toUnit('0')
        )
      ).to.be.revertedWith("Cannot stake 0");
    });

    it('FAILURE: should revert if the current reward period for phase II has finished', async () => {
      await time.increaseTo(this.phaseTwoPeriodFinish + 100);

      // USER: Approves SILENT tokens for spending
      const silentStakingAmount = toUnit('1000');
      await doApprovePmcForTokenSpending(this.assetOwner1, silentStakingAmount);

      // USER: Stakes SILENT tokens to the pool
      await expect(
        privacyMining.connect(this.assetOwner1).stakeSilentToPool(
          assetId = this.stakingRewardPool.assetId,
          amount = silentStakingAmount
        )
      ).to.be.revertedWithCustomError(
        privacyMining, 
        'RewardPeriodFinished'
      );
    });

    it('FAILURE: should revert if staking user has no voucher balance from phase I', async () => {
      // USER: Approves SILENT tokens for spending
      const silentStakingAmount = toUnit('1000');
      await doApprovePmcForTokenSpending(this.assetOwner2, silentStakingAmount);

      // USER: Stake SILENT tokens to pool
      await expect(
        privacyMining.connect(this.assetOwner2).stakeSilentToPool(
          this.stakingRewardPool.assetId, 
          silentStakingAmount
        )
      ).to.be.revertedWith("Only Voucher owners can stake");
    });

    // UPDATE: MAYBE A BETTER MESSAGE [?]
    it('FAILURE: should revert if staking to an undeployed pool', async () => {
      await time.increaseTo(this.phaseOnePeriodFinish + 100);
      await createStakingRewardsFixture();

      // USER: Approves SILENT tokens for spending
      const silentStakingAmount = toUnit('1000');
      await doApprovePmcForTokenSpending(assetOwner1, silentStakingAmount);

      // USER: Stakes SILENT tokens to the pool
      await expect (
        privacyMining.connect(this.assetOwner1).stakeSilentToPool(
          assetId = this.rewardPool.assetId + 1,
          amount = silentStakingAmount
        )
      ).to.be.revertedWithCustomError(
        privacyMining, 
        "OnlyCallableInPhaseTwo"
      );
    });

    it('FAILURE: should revert if user hasn\'t approved PMC contract to spend their SILENT tokens', async () => {
      // USER: Doesn't approve SILENT Tokens for spending
      const silentStakingAmount = toUnit('1000');

      // USER: Stakes SILENT tokens to the pool
      await expect (
        privacyMining.connect(this.assetOwner1).stakeSilentToPool(
          assetId = this.rewardPool.assetId,
          amount = silentStakingAmount
        )
      ).to.be.revertedWith(
        'ERC20: insufficient allowance'
      );
    });

    it('SUCCESS: should update the `globalSilentStaked` amount for the pool', async () => {
      // USER: Approves SILENT tokens for spending
      const silentStakingAmount = toUnit('1000');
      await doApprovePmcForTokenSpending(assetOwner1, silentStakingAmount);

      // USER: Stakes SILENT tokens to the pool
      await privacyMining.connect(this.assetOwner1).stakeSilentToPool(
        assetId = this.rewardPool.assetId,
        amount = silentStakingAmount
      );

      // FETCH the pool
      const _pool = await privacyMining.pools(this.rewardPool.assetId);
      
      expect (_pool.globalSilentStaked).to.eq(silentStakingAmount);
    });

    it('SUCCESS: should update the `userPoolBalance` for STAKING_REWARD_TYPE', async () => {
      // USER: Approves SILENT tokens for spending
      const silentStakingAmount = toUnit('1000');
      await doApprovePmcForTokenSpending(assetOwner1, silentStakingAmount);

      // USER: Stakes SILENT tokens to the pool
      await privacyMining.connect(this.assetOwner1).stakeSilentToPool(
        assetId = this.rewardPool.assetId,
        amount = silentStakingAmount
      );

      // FETCH the pool
      const _userStateForPool = await privacyMining.userPoolState(this.assetOwner1.address, this.rewardPool.assetId, STAKING_REWARD_TYPE);
      
      expect (_userStateForPool.userPoolBalance).to.eq(silentStakingAmount);
    });

    it('SUCCESS: should transfer designated `amount` of SILENT tokens from user to PMC', async () => {
      // USER: Approves SILENT tokens for spending
      const silentStakingAmount = toUnit('1000');
      await doApprovePmcForTokenSpending(this.assetOwner1, silentStakingAmount);

      // CHECK: USER's and PMC's SILENT balance before staking
      const userSilentBalanceBefore = await silentToken.balanceOf(this.assetOwner1.address);
      const pmcSilentBalanceBefore = await silentToken.balanceOf(privacyMining.address);

      // USER: Stakes SILENT tokens to the pool
      await privacyMining.connect(this.assetOwner1).stakeSilentToPool(
        assetId = this.rewardPool.assetId,
        amount = silentStakingAmount
      );

      // CHECK: PMC's SILENT balance after staking
      const userSilentBalanceAfter = await silentToken.balanceOf(this.assetOwner1.address);
      const pmcSilentBalanceAfter = await silentToken.balanceOf(privacyMining.address);

      // ASSERT: SILENT DECREASED IN USER + INCREASED IN CONTRACT
      expect (userSilentBalanceAfter).to.eq(userSilentBalanceBefore - silentStakingAmount);
      expect (pmcSilentBalanceAfter).to.eq(pmcSilentBalanceBefore + silentStakingAmount);
    });

    it('SUCCESS: should emit the event `SilentStakedInPool`', async () => {
      // USER: Approves SILENT tokens for spending
      const silentStakingAmount = toUnit('1000');
      await doApprovePmcForTokenSpending(assetOwner1, silentStakingAmount);

      // USER: Stakes SILENT tokens to the pool
      await expect(
        privacyMining.connect(this.assetOwner1).stakeSilentToPool(
          assetId = this.stakingRewardPool.assetId,
          amount = silentStakingAmount
        )
      ).to.emit(privacyMining, 'SilentStakedInPool')
      .withArgs(this.assetOwner1.address, this.stakingRewardPool.assetId, silentStakingAmount);

    });

    // // TODO: MOCK THE CONTRACT FOR THIS
    // it('FAILURE: should revert if the pool is not in phase II', async () => {
    //   const silentStakingAmount = toUnit('1000');
    //   await doApprovePmcForTokenSpending(assetOwner1, silentStakingAmount);

    //   await expect (
    //     privacyMining.connect(this.assetOwner1).stakeSilentToPool(
    //       assetId = this.rewardPool.assetId,
    //       amount = silentStakingAmount
    //     )
    //   ).to.be.revertedWithCustomError(
    //     privacyMining, 
    //     "OnlyCallableInPhaseTwo"
    //   );
    // });

  });


  describe ('unstakeSilentFromPool()', () => {

    beforeEach(async() => {
      const {stakingRewardPool, silentStakingAmount, phaseOnePeriodFinish, phaseTwoPeriodFinish, assetOwner1, assetOwner2} = await loadFixture(stakeSilentInPoolFixture);
      this.assetOwner1 = assetOwner1;
      this.assetOwner2 = assetOwner2;
      this.silentStakingAmount = silentStakingAmount;
      this.stakingRewardPool = stakingRewardPool;
      this.phaseOnePeriodFinish = phaseOnePeriodFinish;
      this.phaseTwoPeriodFinish = phaseTwoPeriodFinish;
      this.silentStakingAmount = silentStakingAmount;
    });

    it('FAILURE: should revert if the pool is not in phase II', async () => {
      await expect(
        privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
          assetId = 101, // undeployed reward pool
          amount = this.silentStakingAmount
        )
      ).to.be.revertedWithCustomError(
        privacyMining, 
        "OnlyCallableInPhaseTwo"
      );
    });

    it('FAILURE: should revert if unstaking with ZERO amount', async () => {
      await expect (
        privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
          assetId = this.stakingRewardPool.assetId,
          amount = toUnit('0')
        )
      ).to.be.revertedWith("Cannot stake 0");
    });

    // TODO: UPDATE THE SC TO PASS THIS TEST
    it('TEST FAILURE: should revert if the current reward period for phase II has finished', async () => {
      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      await privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
        this.stakingRewardPool.assetId, 
        this.silentStakingAmount
      );
    });

    it('FAILURE: should revert if unstaking to an undeployed pool', async () => {
      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      await expect(
        privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
          101, // undeployed pool
          this.silentStakingAmount
        )
      ).to.be.revertedWithCustomError(privacyMining, "OnlyCallableInPhaseTwo");
    });

    it('FAILURE: should revert if user has no stake in the pool', async () => {
      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      await expect(
        privacyMining.connect(this.assetOwner2).unstakeSilentFromPool(
          this.stakingRewardPool.assetId, 
          this.silentStakingAmount
        )
      ).to.be.revertedWith('Cannot unstake more than staked');
    });

    it('FAILURE: should revert if user tries to unstake more than their staking balance in the pool', async () => {
      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      await expect(
        privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
          this.stakingRewardPool.assetId, 
          this.silentStakingAmount + toUnit('1')
        )
      ).to.be.revertedWith('Cannot unstake more than staked');
    });

    it('SUCCESS: should update the `globalSilentStaked` amount for the pool', async () => {
      // CHECK: globalSilentStaked of pool before unstaking
      const _pool = await privacyMining.pools(this.stakingRewardPool.assetId);
      const _poolGlobalSilentStaked_before = parseInt(fromUnit(_pool.globalSilentStaked.toString()));

      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      const unstakingAmount = parseInt(fromUnit(this.silentStakingAmount.toString())) - 100;

      await privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
        this.stakingRewardPool.assetId, 
        toUnit(unstakingAmount.toString())
      );

      // CHECK: globalSilentStaked of pool before unstaking
      const __pool = await privacyMining.pools(this.stakingRewardPool.assetId);
      const __poolGlobalSilentStaked_after = parseInt(fromUnit(__pool.globalSilentStaked.toString()));

      expect (__poolGlobalSilentStaked_after).to.eq( _poolGlobalSilentStaked_before - unstakingAmount);
    });

    it('SUCCESS: should update the `userPoolBalance` for STAKING_REWARD_TYPE', async () => {
      // CHECK: userPoolBalance for user before unstaking
      const _userPoolState_before = await privacyMining.userPoolState(this.assetOwner1.address, this.stakingRewardPool.assetId, this.stakingRewardPool.rewardType);
      const _userPoolBalance_before = parseInt(fromUnit(_userPoolState_before.userPoolBalance.toString()));

      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      const unstakingAmount = parseInt(fromUnit(this.silentStakingAmount.toString())) - 100;

      await privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
        this.stakingRewardPool.assetId, 
        toUnit(unstakingAmount.toString())
      );

      // CHECK: userPoolBalance for user after unstaking
      const _userPoolState_after = await privacyMining.userPoolState(this.assetOwner1.address, this.stakingRewardPool.assetId, this.stakingRewardPool.rewardType);
      const _userPoolBalance_after = parseInt(fromUnit(_userPoolState_after.userPoolBalance.toString()));

      expect (_userPoolBalance_after).to.eq(_userPoolBalance_before - unstakingAmount);
    });

    it('SUCCESS: should transfer designated `amount` of SILENT tokens from PMC to user', async () => {
      // CHECK: user silent balance before unstaking
      const _userSilentBalance_before = await silentToken.balanceOf(this.assetOwner1.address);

      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      const unstakingAmount = parseInt(fromUnit(this.silentStakingAmount.toString())) - 100;

      await privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
        this.stakingRewardPool.assetId, 
        toUnit(unstakingAmount.toString())
      );

      // CHECK: user silent balance after unstaking
      const _userSilentBalance_after = await silentToken.balanceOf(this.assetOwner1.address);

      expect (parseInt(fromUnit(_userSilentBalance_after.toString()))).to.eq(parseInt(fromUnit(_userSilentBalance_before.toString())) + unstakingAmount);
    });

    it('SUCCESS: should emit the event `SilentUnStakedFromPool`', async () => {
      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      const unstakingAmount = parseInt(fromUnit(this.silentStakingAmount.toString())) - 100;

      await expect(
        privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
          this.stakingRewardPool.assetId, 
          toUnit(unstakingAmount.toString())
        )
      ).to.emit(privacyMining, "SilentUnstakedFromPool")
      .withArgs(this.assetOwner1.address, this.stakingRewardPool.assetId, toUnit(unstakingAmount.toString()));
    });
  });


  describe ('claimRewards(): VoucherRewards', () => {
    beforeEach(async () => {
      const {rewardPool, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2} = await createVoucherRewardPoolFixture();

      // USER: DEPOSIT ASSET TO THE POOL
      const depositAmount = toUnit('1000'); 
      await smsap.connect(assetOwner1).depositAsset(rewardPool.assetId, depositAmount);


      // INCREASE THE TIME TO ACCUMULATE SOME REWARDS 
      await time.increaseTo(phaseOnePeriodFinish - 10000);

      // Local variables
      this.rewardPool = rewardPool;
      this.phaseOnePeriodFinish = phaseOnePeriodFinish;
      this.assetOwner1 = assetOwner1;
      this.assetOwner2 = assetOwner2;
    })

    it('FAILURE: it should revert if the reward pool hasn\'t been deployed', async () => {
      await expect(
        privacyMining.connect(this.assetOwner1).claimRewards(
          this.rewardPool.assetId + 1,
          this.rewardPool.rewardType
        )
      ).to.be.revertedWithCustomError(
        privacyMining,
        'RewardPeriodFinished'
      );
    });

    it('FAILURE: it should revert if the reward period for the pool has already finished', async () => {
      await time.increaseTo(this.phaseOnePeriodFinish + 1);

      await expect(
        privacyMining.connect(this.assetOwner1).claimRewards(
          this.rewardPool.assetId,
          this.rewardPool.rewardType
        )
      ).to.be.revertedWithCustomError(
        privacyMining,
        'RewardPeriodFinished'
      );
    });

    it('SUCCESS: it should update user\'s pool rewards (`userPoolRewards`) to ZERO', async () => {
      // USER: DEPOSITS ASSET AGAIN TO THE POOL TO UPDATE POOL REWARDS
      const depositAmount = toUnit('1000'); 
      await smsap.connect(assetOwner1).depositAsset(this.rewardPool.assetId, depositAmount);

      // INCREASE THE TIME TO ACCUMULATE SOME REWARDS 
      await time.increaseTo(this.phaseOnePeriodFinish - 1000);

      // CHECK: USER POOL REWARDS
      const userPoolState_before = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        VOUCHER_REWARD_TYPE
      );

      console.log('Reward pool:::', await privacyMining.rewardForPool(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      ));

      // ASSERT `userPoolRewards` FOR USER IS NOT ZERO BEFORE CLAIM
      expect(
        parseInt(fromUnit(userPoolState_before.userPoolRewards.toString()))
      ).not.equal(
        0
      );

      // USER: CLAIMS REWARDS
      await privacyMining.connect(this.assetOwner1).claimRewards(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      // CHECK: USER POOL REWARDS
      const userPoolState_after = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        VOUCHER_REWARD_TYPE
      );

      // ASSERT `userPoolRewards` FOR USER IS NOT ZERO BEFORE CLAIM
      expect(
        parseInt(fromUnit(userPoolState_after.userPoolRewards.toString()))
      ).to.eq(
        0
      );
    });

    it('SUCCESS: if voucher reward: should update user\'s total voucher balance (`userPoolVoucherBalance`)', async () => {
      const userPoolVoucherBalance_before = await privacyMining.userPoolVoucherBalance(
        this.assetOwner1.address,
        this.rewardPool.assetId,
      );

      // GET USER'S PENDING REWARDS
      const pendingRewards = await privacyMining.rewardsPending(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        VOUCHER_REWARD_TYPE
      );
      const userPendingRewards = parseInt(fromUnit(pendingRewards.toString()));

      await privacyMining.connect(this.assetOwner1).claimRewards(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      const userPoolVoucherBalance_after = await privacyMining.userPoolVoucherBalance(
        this.assetOwner1.address,
        this.rewardPool.assetId,
      );

      expect(
        parseInt(fromUnit(userPoolVoucherBalance_after.toString()))
      ).to.eq(
        parseInt(fromUnit(userPoolVoucherBalance_before.toString())) 
        +
        userPendingRewards
      );
    });

    it('SUCCESS: if voucher reward: should update pool\'s total vouchers claimed (`totalVouchersClaimed`)', async () => {
      // CHECK BEFORE: POOL's TOTALVOUCHERSCLAIMED 
      const pool_before = await privacyMining.pools(this.rewardPool.assetId);
      const poolTotalVouchersClaimed_before = parseInt(fromUnit(pool_before.totalVouchersClaimed.toString()));

      // GET USER'S PENDING REWARDS
      const pendingRewards = await privacyMining.rewardsPending(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        VOUCHER_REWARD_TYPE
      );
      const userPendingRewards = parseInt(fromUnit(pendingRewards.toString()));
      console.log('userPendingRewards::: ', userPendingRewards);
    
      // USER: CLAIMS REWARDS
      await privacyMining.connect(this.assetOwner1).claimRewards(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      // CHECK AFTER: POOL's TOTALVOUCHERSCLAIMED 
      const pool_after = await privacyMining.pools(this.rewardPool.assetId);
      const poolTotalVouchersClaimed_after = parseInt(fromUnit(pool_after.totalVouchersClaimed.toString()));

      // ASSERT `userPoolRewards` FOR USER IS NOT ZERO BEFORE CLAIM
      expect(
        poolTotalVouchersClaimed_after
      ).to.eq(
        poolTotalVouchersClaimed_before
        +
        userPendingRewards
      );
    });

    // FAILING TEST CASE: TODO: UPDATE CONTRACT TO EMIT EVENT FOR VOUCHER REWARD PAID
    it('SUCCESS: VOUCHER_REWARD_TYPE: should emit the event `RewardPaid` with correct arguments', async () => {
      // GET USER'S PENDING REWARDS
      const pendingRewards = await privacyMining.rewardsPending(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        VOUCHER_REWARD_TYPE
      );

      // const _pool = await privacyMining.pools(this.rewardPool.assetId);
      // const _rewardForPool = await privacyMining.rewardForPool(
      //   this.rewardPool.assetId,
      //   this.rewardPool.rewardType
      // );
      // const rewardForOneTimestamp = (_rewardForPool.rewardRate * 1e18) / (_pool.globalSilentStaked * _pool.totalVouchersClaimed);
    
      // USER: CLAIMS REWARDS
      await expect(
        privacyMining.connect(this.assetOwner1).claimRewards(
          this.rewardPool.assetId,
          this.rewardPool.rewardType
        )
      ).to.emit(
        privacyMining, 
        'RewardPaid'
      ).withArgs(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        this.rewardPool.rewardType,
        pendingRewards
      );
    });

    // TODO: Check for gas estimate
    it('FAILURE: should skip the `if` statement if the user has accumulated 0 rewards in given reward pool', async () => {
      // CHECK GAS
      await privacyMining.connect(this.assetOwner2).claimRewards(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      )
    });

    // TODO: Implement in the contract
    it('FAILURE: should revert if the silent balance of PMC isn\'t maintained at the end of transaction', async () => {

    });

    // TODO: Implement in the contract
    it('FAILURE: should revert if the reward to be paid exceeds pool\'s rewards in PMC', async () => {

    });
  });


  describe ('claimRewards(): StakingRewards', () => {
    beforeEach(async () => {
      const { stakingRewardPool, phaseTwoPeriodFinish, assetOwner1} = await stakeSilentInPoolFixture();

      // Local variables
      this.stakingRewardPool = stakingRewardPool;
      this.phaseTwoPeriodFinish = phaseTwoPeriodFinish;
      this.assetOwner1 = assetOwner1;

      // INCREASE THE TIME TO ACCUMULATE SOME REWARDS 
      // await time.increaseTo(this.phaseTwoPeriodFinish - 10000);
    });

    it('FAILURE: it should revert if the reward pool hasn\'t been deployed', async () => {
      await expect(
        privacyMining.connect(this.assetOwner1).claimRewards(
          this.stakingRewardPool.assetId + 1,
          this.stakingRewardPool.rewardType
        )
      ).to.be.revertedWithCustomError(
        privacyMining,
        'RewardPeriodFinished'
      );
    });

    it('FAILURE: it should revert if the reward period for the pool has already finished', async () => {
      await time.increaseTo(this.phaseTwoPeriodFinish);

      await expect(
        privacyMining.connect(this.assetOwner1).claimRewards(
          this.stakingRewardPool.assetId,
          this.stakingRewardPool.rewardType
        )
      ).to.be.revertedWithCustomError(
        privacyMining,
        'RewardPeriodFinished'
      );
    });

    it('SUCCESS: if voucher reward: should update user\'s total voucher balance (`userPoolVoucherBalance`)', async () => {
      const userPoolVoucherBalance_before = await privacyMining.userPoolVoucherBalance(
        this.assetOwner1.address,
        this.stakingRewardPool.assetId,
      );

      // GET USER'S PENDING REWARDS
      const pendingRewards = await privacyMining.rewardsPending(
        this.assetOwner1.address,
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );
      const userPendingRewards = parseInt(fromUnit(pendingRewards.toString()));

      await privacyMining.connect(this.assetOwner1).claimRewards(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );

      const userPoolVoucherBalance_after = await privacyMining.userPoolVoucherBalance(
        this.assetOwner1.address,
        this.stakingRewardPool.assetId,
      );

      expect(
        parseInt(fromUnit(userPoolVoucherBalance_after.toString()))
      ).to.eq(
        parseInt(fromUnit(userPoolVoucherBalance_before.toString())) 
        +
        userPendingRewards
      );
    });

    it('SUCCESS: if voucher reward: should update pool\'s total vouchers claimed (`totalVouchersClaimed`)', async () => {
      // CHECK BEFORE: POOL's TOTALVOUCHERSCLAIMED 
      const pool_before = await privacyMining.pools(this.stakingRewardPool.assetId);
      const poolTotalVouchersClaimed_before = parseInt(fromUnit(pool_before.totalVouchersClaimed.toString()));

      // GET USER'S PENDING REWARDS
      const pendingRewards = await privacyMining.rewardsPending(
        this.assetOwner1.address,
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );
      const userPendingRewards = parseInt(fromUnit(pendingRewards.toString()));
      console.log('userPendingRewards::: ', userPendingRewards);
    
      // USER: CLAIMS REWARDS
      await privacyMining.connect(this.assetOwner1).claimRewards(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );

      // CHECK AFTER: POOL's TOTALVOUCHERSCLAIMED 
      const pool_after = await privacyMining.pools(this.stakingRewardPool.assetId);
      const poolTotalVouchersClaimed_after = parseInt(fromUnit(pool_after.totalVouchersClaimed.toString()));

      // ASSERT `userPoolRewards` FOR USER IS NOT ZERO BEFORE CLAIM
      expect(
        poolTotalVouchersClaimed_after
      ).to.eq(
        poolTotalVouchersClaimed_before
        +
        userPendingRewards
      );
    });

    // FAILING TEST CASE: rewardPerToken is always 0
    it('SUCCESS: should update user\'s pool rewards (`userPoolRewards`) to ZERO', async () => {
      // INCREASE THE TIME TO ACCUMULATE SOME REWARDS 
      await time.increaseTo(this.phaseTwoPeriodFinish - 100);

      // GET USER'S PENDING REWARDS
      const pendingRewards = await privacyMining.rewardsPending(
        this.assetOwner1.address,
        this.stakingRewardPool.assetId,
        STAKING_REWARD_TYPE
      );
      const userPendingRewards = parseInt(fromUnit(pendingRewards.toString()));
      console.log('userPendingRewards:::', userPendingRewards);

      const userPoolVoucherBalance = await privacyMining.userPoolVoucherBalance(
        this.assetOwner1.address,
        this.stakingRewardPool.assetId
      );
      console.log('userPoolVoucherBalance:::', userPoolVoucherBalance);
      
      // USER: STAKE SILENT TO THE POOL AGAIN TO UPDATE POOL REWARDS
      const stakingAmount = toUnit('1000');
      await doApprovePmcForTokenSpending(this.assetOwner1, stakingAmount);
      
      await privacyMining.connect(this.assetOwner1).stakeSilentToPool(
        this.stakingRewardPool.assetId, 
        stakingAmount
      );

      // CHECK: USER POOL REWARDS
      const userPoolState_before = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );
      console.log('userPoolBalance:::', userPoolState_before.userPoolBalance);

      const _pool = await privacyMining.pools(
        this.stakingRewardPool.assetId
      );
      console.log('pool globalSilentStaked:::', _pool.globalSilentStaked );
      console.log('pool totalVouchersClaimed:::', _pool.totalVouchersClaimed );

      console.log('userPoolRewardPerTokenPaid:::', userPoolState_before.userPoolRewardPerTokenPaid);
      console.log('lastTimeRewardApplicable:::', await privacyMining.lastTimeRewardApplicable(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      ));
      console.log('Reward pool lastUpdateTime:::', await privacyMining.rewardForPool(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      ));
      console.log('pool rewardPerToken:::', await privacyMining.rewardPerToken(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      ));

      // ASSERT `userPoolRewards` FOR USER IS NOT ZERO BEFORE CLAIM
      expect(
        parseInt(fromUnit(userPoolState_before.userPoolRewards.toString()))
      ).not.equal(
        0
      );

      // USER: CLAIMS REWARDS
      await privacyMining.connect(this.assetOwner1).claimRewards(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );

      // CHECK: USER POOL REWARDS
      const userPoolState_after = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );

      // ASSERT `userPoolRewards` FOR USER IS NOT ZERO BEFORE CLAIM
      expect(
        parseInt(fromUnit(userPoolState_after.userPoolRewards.toString()))
      ).to.eq(
        0
      );
    });

    // TODO: Check in the contract
    it('SUCCESS: should stop rewards calculation after the user has unstaked all the silent tokens from the pool', async () => {
      
    });

    it('SUCCESS: STAKING_REWARD_TYPE: should emit the event `RewardPaid` with correct arguments', async () => {
      // GET USER'S PENDING REWARDS
      const pendingRewards = await privacyMining.rewardsPending(
        this.assetOwner1.address,
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );
      const userPendingRewards = parseInt(fromUnit(pendingRewards.toString()));
    
      // USER: CLAIMS REWARDS
      await expect(
        privacyMining.connect(this.assetOwner1).claimRewards(
          this.stakingRewardPool.assetId,
          this.stakingRewardPool.rewardType
        )
      ).to.emit(
        privacyMining, 
        'RewardPaid')
      .withArgs(
        this.assetOwner1.address,
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType,
        userPendingRewards
      );
    });

    // TODO: Check for gas estimate
    it('FAILURE: should skip the `if` statement if the user has accumulated 0 rewards in given reward pool', async () => {
      // CHECK GAS
      await privacyMining.connect(this.assetOwner2).claimRewards(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      )
    });

    // TODO: Implement in the contract
    it('FAILURE: should revert if the silent balance of PMC isn\'t maintained at the end of transaction', async () => {

    });

    // TODO: Implement in the contract
    it('FAILURE: should revert if the user reward to be paid exceeds pool\'s rewards in PMC', async () => {});

  });


  describe ('lastTimeRewardApplicable()', () => {
    it('should return current time if the reward period for the pool hasn\'t finished yet', async () => {});
    it('should return Pool.periodfinish for the pool if it has passed already', async () => {});
  });


  describe ('rewardPerToken()', () => {
    it('should return 0 if global pool balance of asset or staked silent is 0', async () => {});
    it('should compute the correct rewardPerToken for a reward pool based on the specified formula', async () => {});
  });


  describe ('rewardsPending()', () => {
    it('should compute the correct accumulated rewards of the user for a reward pool correctly', async () => {});
  });


  describe ('getDeployedPools()', () => {
    it('should ', async () => {});
    it('should ', async () => {});
  });

});
