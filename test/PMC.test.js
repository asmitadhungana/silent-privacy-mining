const {ethers} = require('hardhat');
const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
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
  let smasp;
  let privacyMining;

  let ONE_BILLION = toUnit('1000000000');


  // ============ HELPER FUNCTIONS ============ //

  const doDeployDependentContracts = async () => {
    [deployer, assetOwner1, assetOwner2] = await ethers.getSigners();

    // Deploy Silent Token
    const SilentToken = await hre.ethers.getContractFactory("SilentToken");
    // ONE_BILLION IS ALREADY IN WEI, THIS WILL BE AGAIN powered by 1e18 below
    silentToken = await SilentToken.deploy("SilentToken", "SILENT", ONE_BILLION);
    await silentToken.deployed();

    // Deploy SMASP contract
    const SMASP = await hre.ethers.getContractFactory("SMASP");
    smasp = await SMASP.deploy();
    await smasp.deployed();
  }
    
  const doDeployPMC = async (silentTokenAddress, smaspAddress) => {
    const PrivacyMining = await hre.ethers.getContractFactory("PrivacyMining");
    privacyMining = await PrivacyMining.deploy(silentTokenAddress, smaspAddress);
    await privacyMining.deployed();
    return {privacyMining};
  }

  const doSetPmcInSMASP = async () => {
    await smasp.connect(deployer).addPrivacyMiningContract(privacyMining.address);
  }

  const doCreateAssetRewardPool = async (_assetId, _rewardType, _reward, _rewardsDuration) => {
    await privacyMining.connect(deployer).createAssetRewardPool(
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
    await doDeployPMC(silentToken.address, smasp.address);
    await smasp.addPrivacyMiningContract(privacyMining.address);
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
    await smasp.connect(assetOwner1).depositAsset(rewardPool.assetId, depositAmount);


    // INCREASE THE TIME TO ACCUMULATE SOME REWARDS 
    await time.increaseTo(phaseOnePeriodFinish - 10000);

    // claim voucher rewards from pool
    await privacyMining.connect(assetOwner1).claimRewards(
      rewardPool.assetId, 
      rewardPool.rewardType
    );

    return {rewardPool, depositAmount, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2};
  }

  const createStakingRewardPoolFixture = async() => {
    const {rewardPool, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2 } = await claimVoucherRewardsFixture();

    await time.increaseTo(phaseOnePeriodFinish);

    const stakingRewardPool = {
      assetId: rewardPool.assetId,
      rewardType: STAKING_REWARD_TYPE,
      reward: ONE_BILLION,
      rewardsDuration: ONE_MONTH
    }
    
    // DEPLOYER: provides PMC with an allowance equal to reward amount
    await silentToken.connect(deployer).approve(privacyMining.address, stakingRewardPool.reward + 1000);

    // DEPLOYER: CREATES THE STAKING REWARD POOL
    await doCreateAssetRewardPool(
      stakingRewardPool.assetId, 
      stakingRewardPool.rewardType, 
      stakingRewardPool.reward, 
      stakingRewardPool.rewardsDuration
    );

    const phaseTwoPeriodFinish = (await time.latest()) + stakingRewardPool.rewardsDuration;

    return {rewardPool, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2, stakingRewardPool, phaseTwoPeriodFinish};
  }

  const stakeSilentInPoolFixture = async() => {
    const {rewardPool, phaseOnePeriodFinish, assetOwner1, assetOwner2, stakingRewardPool, phaseTwoPeriodFinish} = await createStakingRewardPoolFixture();

    // USER: Approves SILENT tokens to PMC for spending
    const silentStakingAmount = toUnit('1000');
    await doApprovePmcForTokenSpending(assetOwner1, silentStakingAmount);

    // USER: Stakes SILENT tokens to the pool
    await privacyMining.connect(assetOwner1).stakeSilentToPool(
      stakingRewardPool.assetId,
      silentStakingAmount
    );

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
      await doDeployPMC(silentToken.address, smasp.address);
      expect (await privacyMining.smaspContract()).to.eq(smasp.address);
      // smasp contract [?]
    });
  });


  describe('createAssetRewardPool()', () => {
    beforeEach(async () => {
      await doDeployDependentContracts();
      await doDeployPMC(silentToken.address, smasp.address);
      await doSetPmcInSMASP();
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

    it('should add the newly deployed reward pool\'s `assetId` to the deployedPools list', async() => {
      const rewardPool = {
        assetId: 1,
        rewardType: VOUCHER_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      // console.log(ethers.utils.formatBytes32String("Silent"));
      await doCreateAssetRewardPool(
        rewardPool.assetId,
        rewardPool.rewardType,
        rewardPool.reward,
        rewardPool.rewardsDuration
      );

      const lastDeployedPool = await privacyMining.deployedPools(0);

      expect (lastDeployedPool).to.eq(rewardPool.assetId);
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

      // 1. OWNER: PROVIDES PMC WITH AN ALLOWANCE OF THE `reward` AMOUNT OF SILENT TOKENS
      await doApprovePmcForTokenSpending(deployer, rewardPool_staking.reward);

      // 2. OWNER: CALLS THE `createAssetRewardPool` function in PMC with appropriate inputs
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

    it('should initialize the phase of a new staking reward pool as 2', async() => {
      const {phaseOnePeriodFinish} = await loadFixture(createVoucherRewardPoolFixture);
      
      await time.increaseTo(phaseOnePeriodFinish + 1);

      rewardPool_staking = {
        assetId: 1,
        rewardType: STAKING_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      // 1. OWNER: PROVIDES PMC WITH AN ALLOWANCE OF THE `reward` AMOUNT OF SILENT TOKENS
      await doApprovePmcForTokenSpending(deployer, rewardPool_staking.reward);

      // 2. OWNER: CALLS THE `createAssetRewardPool` function in PMC with appropriate inputs
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

    it('should initialize the new staking reward pool with the correct parameters', async() => {
      const {phaseOnePeriodFinish} = await createVoucherRewardPoolFixture();
      
      await time.increaseTo(phaseOnePeriodFinish);

      rewardPool_staking = {
        assetId: 1,
        rewardType: STAKING_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      // 1. OWNER: PROVIDES PMC WITH AN ALLOWANCE OF THE `reward` AMOUNT OF SILENT TOKENS
      await doApprovePmcForTokenSpending(deployer, rewardPool_staking.reward);

      // 2. OWNER: CALLS THE `createAssetRewardPool` function in PMC with appropriate inputs
      await( 
        doCreateAssetRewardPool(
          rewardPool_staking.assetId,
          rewardPool_staking.rewardType,
          rewardPool_staking.reward,
          rewardPool_staking.rewardsDuration
        )
      );

      const _rewardForPool = await privacyMining.rewardForPool(
        rewardPool_staking.assetId, 
        rewardPool_staking.rewardType
      );

      expect (_rewardForPool.rewardsDistributor).to.eq(deployer.address);
      expect (_rewardForPool.rewardsDuration).to.eq(ONE_MONTH);
      expect (
        _rewardForPool.periodFinish).to.eq( 
        parseInt(_rewardForPool.lastUpdateTime) + 
        parseInt(ONE_MONTH)
      );
      expect (_rewardForPool.rewardPerTokenStored).to.eq(0);
    });

    it('should emit the event `RewardAdded` after successful creation of new reward pool', async() => {
      const {phaseOnePeriodFinish} = await createVoucherRewardPoolFixture();
      
      await time.increaseTo(phaseOnePeriodFinish);

      rewardPool_staking = {
        assetId: 1,
        rewardType: STAKING_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      // 1. OWNER: PROVIDES PMC WITH AN ALLOWANCE OF THE `reward` AMOUNT OF SILENT TOKENS
      await doApprovePmcForTokenSpending(deployer, rewardPool_staking.reward);

      // 2. OWNER: CALLS THE `createAssetRewardPool` function in PMC with appropriate inputs
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
      const {phaseOnePeriodFinish} = await createVoucherRewardPoolFixture();
      
      await time.increaseTo(phaseOnePeriodFinish);

      rewardPool_staking = {
        assetId: 1,
        rewardType: STAKING_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      // 1. OWNER: PROVIDES PMC WITH AN ALLOWANCE OF THE `reward` AMOUNT OF SILENT TOKENS
      await doApprovePmcForTokenSpending(deployer, rewardPool_staking.reward);

      // 2. OWNER: CALLS THE `createAssetRewardPool` function in PMC with appropriate inputs
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
      ).to.be.revertedWith("Only SMASP can call this");
    });

    it('FAILURE: should revert if a user tries to deposit asset to an undeployed reward pool', async() => {
      await time.increaseTo(this.phaseOnePeriodFinish);

      await expect(
        smasp.connect(this.assetOwner1).depositAsset(
          assetId = 101, // assetId for an undeployed reward pool
          amount = toUnit('100')
        )
      ).to.be.revertedWithCustomError(privacyMining, "OnlyCallableInPhaseOne");
    });

    it('FAILURE: should revert if the reward period for pool\'s phase one has finished', async () => {
      await time.increaseTo(this.phaseOnePeriodFinish);

      await expect(
        smasp.connect(this.assetOwner1).depositAsset(
          assetId = 1, 
          amount = toUnit('100')
        )
      ).to.be.revertedWithCustomError(privacyMining, "RewardPeriodFinished");
    });

    it('FAILURE: should revert if the reward period is not in phase one', async () => {
      const {phaseOnePeriodFinish} = await createVoucherRewardPoolFixture();
      
      await time.increaseTo(phaseOnePeriodFinish);

      rewardPool_staking = {
        assetId: this.rewardPool.assetId,
        rewardType: STAKING_REWARD_TYPE,
        reward: ONE_BILLION,
        rewardsDuration: ONE_MONTH
      }

      // 1. OWNER: PROVIDES PMC WITH AN ALLOWANCE OF THE `reward` AMOUNT OF SILENT TOKENS
      await doApprovePmcForTokenSpending(deployer, rewardPool_staking.reward);

      // 2. OWNER: CALLS THE `createAssetRewardPool` function in PMC to create staking reward pool with phase II
      await( 
        doCreateAssetRewardPool(
          rewardPool_staking.assetId,
          rewardPool_staking.rewardType,
          rewardPool_staking.reward,
          rewardPool_staking.rewardsDuration
        )
      );

      await expect(
        smasp.connect(this.assetOwner1).depositAsset(
          this.rewardPool.assetId, 
          amount = toUnit('100')
        )
      ).to.be.revertedWithCustomError(privacyMining, "OnlyCallableInPhaseOne");
    });

    it('SUCCESS: should make a successful deposit on behalf of caller when called from SMASP', async () => {
      await smasp.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );
    });

    it('SUCCESS: it should change the reward pool\'s `globalAssetDeposit` to `amount`', async () => {
      await smasp.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const _rewardPool = await privacyMining.pools(this.rewardPool.assetId);
      expect(_rewardPool.globalAssetsDeposit).to.eq(amount);
    });

    it('SUCCESS: it should initialize the `userPoolBalance` by `amount` on initial deposit', async () => {
      await smasp.connect(this.assetOwner1).depositAsset(
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
      await smasp.connect(this.assetOwner1).depositAsset(
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
      await smasp.connect(this.assetOwner1).depositAsset(
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
        await smasp.connect(this.assetOwner1).depositAsset(
          this.rewardPool.assetId, 
          amount = 100
        )
      ).to.emit(privacyMining, "AssetDepositedToPool")
      .withArgs(this.assetOwner1.address, this.rewardPool.assetId, amount);
    });

    it('SUCCESS: it should set the `rewardPerTokenStored` for the rewardPool to Zero on first deposit', async () => {
      await smasp.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const _rewardForPool = await privacyMining.rewardForPool(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect(_rewardForPool.rewardPerTokenStored).to.eq(0);
    });

    it('SUCCESS: it should update(increase) the `rewardPerTokenStored` for the rewardPool on the second deposit', async () => {
      // First deposit
      await smasp.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const rewardForPool_before = await privacyMining.rewardForPool(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect (rewardForPool_before.rewardPerTokenStored).to.eq(0);

      // INCREASE THE TIME
      await time.increaseTo(this.phaseOnePeriodFinish - 100000);

      // Second Deposit
      await smasp.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const rewardForPool_after = await privacyMining.rewardForPool(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect(rewardForPool_after.rewardPerTokenStored).to.be.gt(0);
    });

    it('SUCCESS: it should update(increase) the `userPoolRewards` of the reward pool for the user on subsequent deposits', async () => {
      // First deposit
      await smasp.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );
  
      const userPoolState_before = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );
  
      expect (userPoolState_before.userPoolRewards).to.eq(0);
  
      // INCREASE THE TIME
      await time.increaseTo(this.phaseOnePeriodFinish - 100000);

      // Second Deposit
      await smasp.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const userPoolState_after = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );
  
      expect (userPoolState_after.userPoolRewards).to.be.gt(0);
    });
    
    it('SUCCESS: it should set the `userPoolRewardPerTokenPaid` of user to Zero on first deposit', async () => {
      await smasp.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const _userPoolState = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect(_userPoolState.userPoolRewardPerTokenPaid).to.eq(0);
    });

    it('SUCCESS: it should update(increase) the `userPoolRewardPerTokenPaid` of user on subsequent deposits', async () => {
      // USER: Makes first deposit
      await smasp.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const userPoolState_before = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect(userPoolState_before.userPoolRewardPerTokenPaid).to.eq(0);

      // USER: Makes second deposit
      await smasp.connect(this.assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        amount = toUnit('100')
      );

      const userPoolState_after = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect(userPoolState_after.userPoolRewardPerTokenPaid).to.be.gt(0);
    });
  });


  describe ('stakeSilentToPool()', () => {
    beforeEach(async() => {
      const {rewardPool, stakingRewardPool, depositAmount, phaseOnePeriodFinish, phaseTwoPeriodFinish, deployer, assetOwner1, assetOwner2} = await createStakingRewardPoolFixture();
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
      await createStakingRewardPoolFixture();

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
        "RewardPeriodFinished"
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
      const _userStateForPool = await privacyMining.userPoolState(
        this.assetOwner1.address, 
        this.rewardPool.assetId, 
        STAKING_REWARD_TYPE
      );
      
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
      expect (
        parseInt(fromUnit(pmcSilentBalanceAfter.toString()))
      ).to.eq(
        parseInt(fromUnit(pmcSilentBalanceBefore.toString())) + 
        parseInt(fromUnit(silentStakingAmount.toString()))
      );
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
      ).to.be.revertedWith("Cannot unstake 0");
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
      ).to.be.revertedWithCustomError(
        privacyMining, 
        "OnlyCallableInPhaseTwo"
      );
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
      const _poolGlobalSilentStaked_before = parseInt(
        fromUnit(_pool.globalSilentStaked.toString())
        );

      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      const unstakingAmount = parseInt(
        fromUnit(this.silentStakingAmount.toString())
        ) - 100;

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
      const _userPoolState_before = await privacyMining.userPoolState(
        this.assetOwner1.address, 
        this.stakingRewardPool.assetId, 
        this.stakingRewardPool.rewardType
      );
      const _userPoolBalance_before = parseInt(
        fromUnit(_userPoolState_before.userPoolBalance.toString())
      );

      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      const unstakingAmount = parseInt(
        fromUnit(this.silentStakingAmount.toString())
      ) - 100;

      await privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
        this.stakingRewardPool.assetId, 
        toUnit(unstakingAmount.toString())
      );

      // CHECK: userPoolBalance for user after unstaking
      const _userPoolState_after = await privacyMining.userPoolState(
        this.assetOwner1.address, 
        this.stakingRewardPool.assetId, 
        this.stakingRewardPool.rewardType
      );
      const _userPoolBalance_after = parseInt(
        fromUnit(_userPoolState_after.userPoolBalance.toString())
      );

      expect (_userPoolBalance_after).to.eq(_userPoolBalance_before - unstakingAmount);
    });

    it('SUCCESS: should transfer designated `amount` of SILENT tokens from PMC to user', async () => {
      // CHECK: user silent balance before unstaking
      const _userSilentBalance_before = await silentToken.balanceOf(
        this.assetOwner1.address
        );

      // increase time to accumulate some staking rewards
      await time.increaseTo((await time.latest()) + 1000);

      // unstake silent from pool
      const unstakingAmount = parseInt(
        fromUnit(this.silentStakingAmount.toString())
        ) - 100;

      await privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
        this.stakingRewardPool.assetId, 
        toUnit(unstakingAmount.toString())
      );

      // CHECK: user silent balance after unstaking
      const _userSilentBalance_after = await silentToken.balanceOf(
        this.assetOwner1.address
        );

      expect (parseInt(
        fromUnit(_userSilentBalance_after.toString()))
      ).to.eq(parseInt(
        fromUnit(_userSilentBalance_before.toString())) + 
        unstakingAmount
      );
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
      .withArgs(
        this.assetOwner1.address, 
        this.stakingRewardPool.assetId, 
        toUnit(unstakingAmount.toString())
      );
    });

    it('SUCCESS: should let users unstake even after the current reward period has finished', async () => {
      // increase time to accumulate some staking rewards
      await time.increaseTo(this.phaseTwoPeriodFinish);

      // unstake silent from pool
      await expect(
        privacyMining.connect(this.assetOwner1).unstakeSilentFromPool(
          this.stakingRewardPool.assetId, 
          this.silentStakingAmount
        )
      ).to.emit(privacyMining, 'SilentUnstakedFromPool')
      .withArgs(this.assetOwner1.address,
        this.stakingRewardPool.assetId,
        this.silentStakingAmount
      );
    });
  });


  describe ('claimRewards(): VoucherRewards', () => {
    beforeEach(async () => {
      const {rewardPool, phaseOnePeriodFinish, deployer, assetOwner1, assetOwner2} = await createVoucherRewardPoolFixture();

      // USER: DEPOSIT ASSET TO THE POOL
      const depositAmount = toUnit('1000'); 
      await smasp.connect(assetOwner1).depositAsset(rewardPool.assetId, depositAmount);


      // INCREASE THE TIME TO ACCUMULATE SOME REWARDS 
      await time.increaseTo(phaseOnePeriodFinish - 10000);

      // Local variables
      this.rewardPool = rewardPool;
      this.phaseOnePeriodFinish = phaseOnePeriodFinish;
      this.assetOwner1 = assetOwner1;
      this.assetOwner2 = assetOwner2;
    })

    it('SUCCESS: it should skip the `if` block if the reward pool hasn\'t been deployed', async () => {
      // USER: CLAIMS REWARD FOR A DEPLOYED REWARD POOL
      const tx_deployed_pool = await privacyMining.connect(this.assetOwner1).claimRewards(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );
      const receipt_before = await tx_deployed_pool.wait();
      const gasUsed_before = parseInt(receipt_before.gasUsed);

      let event_before;
      let eventSignature_before;
      receipt_before.events.forEach((_event) => {
        event_before = _event.event;
        eventSignature_before = _event.eventSignature;
        // console.log("Event:", event_before, eventSignature_before);
      });

      // USER: CLAIMS REWARD FOR AN UNDEPLOYED REWARD POOL
      const tx_undeployed_pool = await privacyMining.connect(this.assetOwner1).claimRewards(
        this.rewardPool.assetId + 101, // undeployed asset-reward pool
        this.rewardPool.rewardType
      );
      const receipt_after = await tx_undeployed_pool.wait();
      const gasUsed_after = parseInt(receipt_after.gasUsed);

      // ASSERT: For reward not to be paid
      expect(gasUsed_after).to.be.lt(gasUsed_before + 5000);
      expect(event_before.toString()).to.eq('RewardPaid'); // When `if` block is executed, the event `RewardPaid` is emitted
      expect(eventSignature_before.toString()).to.eq('RewardPaid(address,uint256,bytes32,uint256)');
      expect(receipt_after.events.length).to.eq(0); // When `if` block is skipped, no event is emitted
    });

    it('SUCCESS: it should skip the `if` block if the reward period for the pool has already finished', async () => {
      const tx_before = await privacyMining.connect(this.assetOwner1).claimRewards(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );
      const receipt_before = await tx_before.wait();
      const gasUsed_before = parseInt(receipt_before.gasUsed);

      await time.increaseTo(this.phaseOnePeriodFinish + 1);

      const tx_after = await privacyMining.connect(this.assetOwner1).claimRewards(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );
      const receipt_after = await tx_after.wait();
      const gasUsed_after = parseInt(receipt_after.gasUsed);

      expect(gasUsed_after).to.be.lt(gasUsed_before + 50000);
    });

    it('SUCCESS: it should update user\'s pool rewards (`userPoolRewards`) to ZERO', async () => {
      // USER: DEPOSITS ASSET AGAIN TO THE POOL TO UPDATE POOL REWARDS
      const depositAmount = toUnit('1000'); 
      await smasp.connect(assetOwner1).depositAsset(
        this.rewardPool.assetId, 
        depositAmount
      );

      // INCREASE THE TIME TO ACCUMULATE SOME REWARDS 
      await time.increaseTo(this.phaseOnePeriodFinish - 1000);

      // CHECK: USER POOL REWARDS
      const userPoolState_before = await privacyMining.userPoolState(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        VOUCHER_REWARD_TYPE
      );

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

    it('SUCCESS: should update(increase) user\'s total voucher balance (`userPoolVoucherBalance`)', async () => {
      const userPoolVoucherBalance_before = await privacyMining.userPoolVoucherBalance(
        this.assetOwner1.address,
        this.rewardPool.assetId,
      );

      // GET USER'S PENDING REWARDS: some timestamps before claiming
      const pendingRewards = await privacyMining.rewardsPending(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        VOUCHER_REWARD_TYPE
      );
      const userPendingRewards = parseInt(
        fromUnit(pendingRewards.toString())
      );

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
      ).to.be.gt(
        parseInt(fromUnit(userPoolVoucherBalance_before.toString())) 
        +
        userPendingRewards
      );
    });

    it('SUCCESS: should update(increase) pool\'s total vouchers claimed (`totalVouchersClaimed`)', async () => {
      // CHECK BEFORE: POOL's TOTALVOUCHERSCLAIMED 
      const pool_before = await privacyMining.pools(this.rewardPool.assetId);

      const poolTotalVouchersClaimed_before = parseInt(
        fromUnit(pool_before.totalVouchersClaimed.toString())
      );

      // GET USER'S PENDING REWARDS: some timestamps before claiming
      const pendingRewards = await privacyMining.rewardsPending(
        this.assetOwner1.address,
        this.rewardPool.assetId,
        VOUCHER_REWARD_TYPE
      );
      const userPendingRewards = parseInt(
        fromUnit(pendingRewards.toString())
      );
    
      // USER: CLAIMS REWARDS
      await privacyMining.connect(this.assetOwner1).claimRewards(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      // CHECK AFTER: POOL's TOTALVOUCHERSCLAIMED 
      const pool_after = await privacyMining.pools(this.rewardPool.assetId);
      const poolTotalVouchersClaimed_after = parseInt(
        fromUnit(pool_after.totalVouchersClaimed.toString())
      );

      // ASSERT `userPoolRewards` FOR USER IS NOT ZERO BEFORE CLAIM
      expect(
        poolTotalVouchersClaimed_after
      ).to.be.gt(
        poolTotalVouchersClaimed_before
        +
        userPendingRewards
      );
    });

    it('SUCCESS: should emit the event `RewardPaid` with correct arguments', async () => {
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
        anyValue
      );
    });

    it('SUCCESS: should skip the `if` block if the user has accumulated 0 rewards in given reward pool', async () => {
      // USER: CLAIMS REWARD FOR A REWARD POOL WHERE THEY HAVE ACCUMULATED ZERO REWARDS :: HERE, NO ASSETS DEPOSITED
      const tx = await privacyMining.connect(this.assetOwner2).claimRewards(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );
      const receipt = await tx.wait();
      const gasUsed = parseInt(receipt.gasUsed);

      // ASSERT: For reward not to be paid
      expect(gasUsed).to.be.lt(100000);
      expect(receipt.events.length).to.eq(0); // When `if` block is skipped, no event is emitted
    });

    // TODO: Implement in the contract
    it('FAILURE: should revert if the silent balance of PMC isn\'t maintained at the end of transaction', async () => {});

    // TODO: Implement in the contract
    it('FAILURE: should revert if the reward to be paid exceeds pool\'s rewards in PMC', async () => {});
  });


  describe ('claimRewards(): StakingRewards', () => {
    beforeEach(async () => {
      const { stakingRewardPool, phaseTwoPeriodFinish, assetOwner1, assetOwner2} = await stakeSilentInPoolFixture();

      // Local variables
      this.stakingRewardPool = stakingRewardPool;
      this.phaseTwoPeriodFinish = phaseTwoPeriodFinish;
      this.assetOwner1 = assetOwner1;
      this.assetOwner2 = assetOwner2;
    });

    it('SUCCESS: it should skip the `if` block if the reward pool hasn\'t been deployed', async () => {
      // USER: CLAIMS REWARDS IN A DEPLOYED POOL
      const tx_deployed_pool = await privacyMining.connect(this.assetOwner1).claimRewards(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );
      const receipt_before = await tx_deployed_pool.wait();
      const gasUsed_before = parseInt(receipt_before.gasUsed);

      let event_before;
      let eventSignature_before;
      receipt_before.events.forEach((_event) => {
        event_before = _event.event;
        eventSignature_before = _event.eventSignature;
      });

      // ASSERT: FOR REWARD TO BE PAID
      expect(event_before.toString()).to.eq('RewardPaid');
      expect(eventSignature_before.toString()).to.eq('RewardPaid(address,uint256,bytes32,uint256)');
      expect(receipt_before.events.length).to.eq(2);
    
      // USER: CLAIMS REWARDS IN AN UNDEPLOYED POOL
      const tx_undeployed_pool = await privacyMining.connect(assetOwner1).claimRewards(
        this.stakingRewardPool.assetId + 101,
        this.stakingRewardPool.rewardType
      );
      const receipt_after = await tx_undeployed_pool.wait();
      const gasUsed_after = parseInt(receipt_after.gasUsed);

      // ASSERT: FOR REWARD NOT TO BE PAID
      expect(gasUsed_after).to.be.lt(gasUsed_before + 50000); // Since if statement is executed for claim in deployed pool and skipped in undeployed pool
      expect(receipt_after.events.length).to.eq(0);
    });

    it('SUCCESS: it should allow each user to claim only once after the reward period has finished', async () => {
      // INCREASE TIME TO PASS THE REWARD PERIOD
      await time.increaseTo(this.phaseTwoPeriodFinish);

      // USER: CLAIMS REWARDS ONCE AFTER REWARD PERIOD FINISHES
      const tx_once = await privacyMining.connect(this.assetOwner1).claimRewards(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );
      const receipt_before = await tx_once.wait();
      const gasUsed_before = parseInt(receipt_before.gasUsed);

      let event_before;
      let eventSignature_before;
      receipt_before.events.forEach((_event) => {
        event_before = _event.event;
        eventSignature_before = _event.eventSignature;
      });

      // ASSERT: FOR REWARD TO BE PAID
      expect(event_before.toString()).to.eq('RewardPaid');
      expect(eventSignature_before.toString()).to.eq('RewardPaid(address,uint256,bytes32,uint256)');
      expect(receipt_before.events.length).to.eq(2);
    
      // USER: CLAIMS REWARDS TWICE AFTER REWARD PERIOD FINISHES: No reward paid
      const tx_twice = await privacyMining.connect(assetOwner1).claimRewards(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );
      const receipt_after = await tx_twice.wait();
      const gasUsed_after = parseInt(receipt_after.gasUsed);

      // ASSERT: FOR REWARD NOT TO BE PAID
      expect(gasUsed_after).to.be.lt(gasUsed_before + 50000);
      expect(receipt_after.events.length).to.eq(0);
    });

    it('SUCCESS: should update user\'s pool rewards (`userPoolRewards`) to ZERO', async () => {
      // INCREASE THE TIME TO ACCUMULATE SOME REWARDS 
      await time.increaseTo(this.phaseTwoPeriodFinish - 1000);

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

      // ASSERT `userPoolRewards` FOR USER IS NOT ZERO BEFORE CLAIM
      expect(
        userPoolState_before.userPoolRewards
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

    it('SUCCESS: STAKING_REWARD_TYPE: should emit the event `RewardPaid` with correct arguments', async () => {
      // INCREASE THE TIME TO ACCUMULATE SOME REWARDS
      await time.increaseTo(this.phaseTwoPeriodFinish - 1000);
    
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
        anyValue
      );
    });

    it('SUCCESS: should skip the `if` block if the user has accumulated 0 rewards in given reward pool', async () => {
      // INCREASE TIME TO PASS THE REWARD PERIOD
      await time.increaseTo(this.phaseTwoPeriodFinish - 1000);

      // USER: CLAIMS REWARDS FOR AN UNPARTICIPATED REWARD POOL
      const tx = await privacyMining.connect(this.assetOwner2).claimRewards(
        this.stakingRewardPool.assetId,
        this.stakingRewardPool.rewardType
      );
      const receipt = await tx.wait();
      const gasUsed = parseInt(receipt.gasUsed);

      // ASSERT: FOR REWARD NOT TO BE PAID
      expect(receipt.events.length).to.eq(0);
      // expect(gasUsed).to.be.lt(100000); // gasUsed = 102313
    });

    // TODO: Implement in the contract
    it('FAILURE: should revert if the silent balance of PMC isn\'t maintained at the end of transaction', async () => {});

    // TODO: Implement in the contract
    it('FAILURE: should revert if the user reward to be paid exceeds pool\'s rewards in PMC', async () => {});
  });


  describe ('lastTimeRewardApplicable()', () => {
    beforeEach(async () => {
      const { rewardPool, phaseOnePeriodFinish} = await createVoucherRewardPoolFixture();
      this.phaseOnePeriodFinish = phaseOnePeriodFinish;
      this.rewardPool = rewardPool;
    });   

    it('should return current time if the reward period for the pool hasn\'t finished yet', async () => {
      await (time.increaseTo(this.phaseOnePeriodFinish - 1000));

      // GET THE TIMESTAMP OF PREVIOUS BLOCK (block.timestamp)
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;

      const _lastTimeRewardApplicable = await privacyMining.lastTimeRewardApplicable(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect(_lastTimeRewardApplicable).to.eq(timestampBefore);
      expect(_lastTimeRewardApplicable).to.eq(this.phaseOnePeriodFinish - 1000);
    });

    it('should return Pool.periodfinish for the pool if it has passed already', async () => {
      await (time.increaseTo(this.phaseOnePeriodFinish + 100));

      const _lastTimeRewardApplicable = await privacyMining.lastTimeRewardApplicable(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect(_lastTimeRewardApplicable).to.eq(this.phaseOnePeriodFinish);
    });
  });


  describe ('getDeployedPools()', () => {
    beforeEach(async () => {
      await doDeployDependentContracts();
      await doDeployPMC(silentToken.address, smasp.address);
      await doSetPmcInSMASP();
    });

    it('should return information about all the deployed pools', async () => {
      // DEPLOYER: CREATES REWARD POOL FOR ASSETID 1
      await privacyMining.createAssetRewardPool(
        1,
        VOUCHER_REWARD_TYPE,
        ONE_BILLION,
        ONE_MONTH
      );

      // USER: DEPOSITS 100 IN REWARD POOL 1
      await smasp.depositAsset(
        1,
        toUnit('100')
      );

      // DEPLOYER: CREATES REWARD POOL FOR ASSETID 2
      await privacyMining.createAssetRewardPool(
        2,
        VOUCHER_REWARD_TYPE,
        ONE_BILLION,
        ONE_MONTH
      );

      // USER: DEPOSITS 200 IN REWARD POOL 2
      await smasp.depositAsset(
        2,
        toUnit('200')
      );

      // DEPLOYER: CREATES REWARD POOL FOR ASSETID 3
      await privacyMining.createAssetRewardPool(
        3,
        VOUCHER_REWARD_TYPE,
        ONE_BILLION,
        ONE_MONTH
      );

      // USER: DEPOSITS 300 IN REWARD POOL 3
      await smasp.depositAsset(
        3,
        toUnit('300')
      );
    
      // GET ALL DEPLOYED POOLS
      const deployedPools = await privacyMining.getDeployedPools();

      let _globalAssetsDeposit;
      let _rewardPool;

      // ASSERT: THE DEPLOYED POOLS HAVE CORRECT VALUES FOR `globalAssetsDeposit`
      for (i = 0; i < deployedPools.length; i++) {
        _rewardPool = deployedPools[i];
        _globalAssetsDeposit = _rewardPool.globalAssetsDeposit;
        expect(_globalAssetsDeposit).to.eq(toUnit(eval(`${i+1}00`)));
      }
    });
  });


  describe ('rewardPerToken()', () => {
    it('PHASE I: should return 0 if global assets deposit for reward pool is 0', async () => {
      const {rewardPool} = await createVoucherRewardPoolFixture();
      const rewardPerToken = await privacyMining.rewardPerToken(
        rewardPool.assetId,
        rewardPool.rewardType
      );
      await expect(rewardPerToken).to.eq(0);
    });

    it('PHASE II: should return 0 if global silent staked for reward pool is 0', async () => {
      const {stakingRewardPool} = await createStakingRewardPoolFixture();
      const rewardPerToken = await privacyMining.rewardPerToken(
        stakingRewardPool.assetId,
        stakingRewardPool.rewardType
      );
      await expect(rewardPerToken).to.eq(0);
    });

    it('PHASE I: should compute the correct rewardPerToken for a reward pool based on the specified formula', async () => {
      const {rewardPool, phaseOnePeriodFinish, assetOwner1} = await createVoucherRewardPoolFixture();
      // USER: DEPOSITS TO THE DEPLOYED VOUCHER REWARD POOL
      await smasp.connect(assetOwner1).depositAsset(
        rewardPool.assetId, 
        toUnit('100')
      );

      const _pool = await privacyMining.pools(
        rewardPool.assetId
      );

      const _rewardForPool = await privacyMining.rewardForPool(
        rewardPool.assetId,
        rewardPool.rewardType
      );
      
      // INCREASE THE TIME TO A DETERMINISTIC TIMESTAMP
      await (time.increaseTo(phaseOnePeriodFinish - 1000));

      // COMPUTE THE `rewardPerTokenStored` FROM THE PMC
      const _rewardPerToken_pmc =  await privacyMining.rewardPerToken(
        rewardPool.assetId,
        rewardPool.rewardType
      );

      // CALCULATE THE `rewardPerTokenStored` FOR THE SAME TIMESTAMP
      const _rewardPerToken_calculated = _rewardForPool.rewardPerTokenStored.add(
        (
          ethers.BigNumber.from(phaseOnePeriodFinish - 1000).sub(
            _rewardForPool.lastUpdateTime
          )
        ).mul(
          _rewardForPool.rewardRate
        ).mul(
          (ethers.BigNumber.from(10)).pow(36)
        ).div(
          _pool.globalAssetsDeposit
        )
      );

      expect(_rewardPerToken_pmc).to.eq(_rewardPerToken_calculated);
    });

    it('PHASE II: should compute the correct rewardPerToken for a reward pool based on the specified formula', async () => {
      const {stakingRewardPool, phaseTwoPeriodFinish} = await stakeSilentInPoolFixture();

      const _pool = await privacyMining.pools(
        stakingRewardPool.assetId
      );

      const _rewardForPool = await privacyMining.rewardForPool(
        stakingRewardPool.assetId,
        stakingRewardPool.rewardType
      );
      
      // INCREASE THE TIME TO A DETERMINISTIC TIMESTAMP
      await (time.increaseTo(phaseTwoPeriodFinish - 1000));

      // COMPUTE THE `rewardPerTokenStored` FROM THE PMC
      const _rewardPerToken_pmc =  await privacyMining.rewardPerToken(
        stakingRewardPool.assetId,
        stakingRewardPool.rewardType
      );

      // CALCULATE THE `rewardPerTokenStored` FOR THE SAME TIMESTAMP
      const _rewardPerToken_calculated = _rewardForPool.rewardPerTokenStored.add(
        (
          ethers.BigNumber.from(phaseTwoPeriodFinish - 1000).sub(
            _rewardForPool.lastUpdateTime
          )
        ).mul(
          _rewardForPool.rewardRate
        ).mul(
          (ethers.BigNumber.from(10)).pow(36)
        ).div(
          (
            _pool.globalAssetsDeposit
          ).mul(
            _pool.totalVouchersClaimed
          )
        )
      );

      expect(_rewardPerToken_pmc).to.eq(_rewardPerToken_calculated);
    });
  });


  describe ('rewardsPending()', () => {
    it('PHASE I: should compute the correct accumulated rewards of the user for a reward pool correctly', async () => {
      const {rewardPool, phaseOnePeriodFinish, assetOwner1} = await createVoucherRewardPoolFixture();

      // USER: DEPOSITS TO THE DEPLOYED VOUCHER REWARD POOL
      const depositAmount = toUnit('100');
      await smasp.connect(assetOwner1).depositAsset(
        rewardPool.assetId, 
        depositAmount
      );

      const _pool = await privacyMining.pools(
        rewardPool.assetId
      );

      const _rewardForPool = await privacyMining.rewardForPool(
        rewardPool.assetId,
        rewardPool.rewardType
      );

      const _userPoolVoucherBalance = await privacyMining.userPoolVoucherBalance(
        assetOwner1.address,
        rewardPool.assetId
      );

      const _userPoolState = await privacyMining.userPoolState(
        assetOwner1.address,
        rewardPool.assetId,
        rewardPool.rewardType
      );
      
      // INCREASE THE TIME TO A DETERMINISTIC TIMESTAMP
      await (time.increaseTo(phaseOnePeriodFinish - 1000));

      // GET THE PENDING REWARDS FOR THE USER FROM THE PMC
      const _rewardsPending_pmc =  await privacyMining.rewardsPending(
        assetOwner1.address,
        rewardPool.assetId,
        rewardPool.rewardType
      );

      // CALCULATE THE `rewardPerTokenStored` FOR THE SAME TIMESTAMP
      const _rewardPerToken_calculated = _rewardForPool.rewardPerTokenStored.add(
        (
          ethers.BigNumber.from(phaseOnePeriodFinish - 1000).sub(
            _rewardForPool.lastUpdateTime
          )
        ).mul(
          _rewardForPool.rewardRate
        ).mul(
          (ethers.BigNumber.from(10)).pow(36)
        ).div(
          _pool.globalAssetsDeposit
        )
      );

      // USER EFFECTIVE POOL SHARE [PHASE I]
      const _userEffectivePoolShare = depositAmount;

      // CALCULATE THE `rewardPerTokenStored` FOR THE SAME TIMESTAMP
      const _rewardsPending_calculated = _userEffectivePoolShare.mul(
        (
          _rewardPerToken_calculated
        ).sub(
          _userPoolState.userPoolRewardPerTokenPaid
        )
      ).div(
        (ethers.BigNumber.from(10)).pow(36)
      );

      expect(_rewardsPending_pmc).to.eq(_rewardsPending_calculated);
    });

    it('PHASE II: should compute the correct accumulated rewards of the user for a reward pool correctly', async () => {
      const {assetOwner1, stakingRewardPool, phaseTwoPeriodFinish, silentStakingAmount} = await stakeSilentInPoolFixture();

      const _pool = await privacyMining.pools(
        stakingRewardPool.assetId
      );

      const _rewardForPool = await privacyMining.rewardForPool(
        stakingRewardPool.assetId,
        stakingRewardPool.rewardType
      );

      const _userPoolVoucherBalance = await privacyMining.userPoolVoucherBalance(
        assetOwner1.address,
        stakingRewardPool.assetId
      );

      const _userPoolState = await privacyMining.userPoolState(
        assetOwner1.address,
        stakingRewardPool.assetId,
        stakingRewardPool.rewardType
      );
      
      // INCREASE THE TIME TO A DETERMINISTIC TIMESTAMP
      await (time.increaseTo(phaseTwoPeriodFinish - 1000));

      // GET THE PENDING REWARDS FOR THE USER FROM THE PMC
      const _rewardsPending_pmc =  await privacyMining.rewardsPending(
        assetOwner1.address,
        stakingRewardPool.assetId,
        stakingRewardPool.rewardType
      );

      // CALCULATE THE `rewardPerTokenStored` FOR THE SAME TIMESTAMP
      const _rewardPerToken_calculated = _rewardForPool.rewardPerTokenStored.add(
        (
          ethers.BigNumber.from(phaseTwoPeriodFinish - 1000).sub(
            _rewardForPool.lastUpdateTime
          )
        ).mul(
          _rewardForPool.rewardRate
        ).mul(
          (ethers.BigNumber.from(10)).pow(36)
        ).div(
          (
            _pool.globalAssetsDeposit
          ).mul(
            _pool.totalVouchersClaimed
          )
        )
      );

      // USER EFFECTIVE POOL SHARE [PHASE II]
      const _userEffectivePoolShare = silentStakingAmount.mul(_userPoolVoucherBalance);

      // CALCULATE THE `rewardPerTokenStored` FOR THE SAME TIMESTAMP
      const _rewardsPending_calculated = _userEffectivePoolShare.mul(
        (
          _rewardPerToken_calculated
        ).sub(
          _userPoolState.userPoolRewardPerTokenPaid
        )
      ).div(
        (ethers.BigNumber.from(10)).pow(36)
      );

      expect(_rewardsPending_pmc).to.eq(_rewardsPending_calculated);
    });
  });


  describe ('updateRewardRate()', () => {
    beforeEach(async () => {
      const {rewardPool, deployer, assetOwner1, phaseOnePeriodFinish} = await createVoucherRewardPoolFixture();
      this.rewardPool = rewardPool;
      this.assetOwner1 = assetOwner1;
      this.deployer = deployer;
      this.phaseOnePeriodFinish = phaseOnePeriodFinish;
    });

    it('FAILURE: should revert if the caller isn\'t owner', async() => {
      const _newRewardRate = toUnit('100');

      await expect(
        privacyMining.connect(this.assetOwner1).updateRewardRate(
          this.rewardPool.assetId,
          this.rewardPool.rewardType,
          _newRewardRate
        )
      ).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it('FAILURE: should revert if the reward period has already finished', async() => {
      await time.increaseTo(this.phaseOnePeriodFinish);
      const _newRewardRate = toUnit('100');

      await expect(
        privacyMining.connect(this.deployer).updateRewardRate(
          this.rewardPool.assetId,
          this.rewardPool.rewardType,
          _newRewardRate
        )
      ).to.be.revertedWithCustomError(
        privacyMining,
        'RewardPeriodFinished'
      );
    });

    it('FAILURE: should revert if the rewardType isn\'t one of VOUCHER/STAKING', async() => {
      await time.increaseTo(this.phaseOnePeriodFinish);

      const _newRewardRate = toUnit('100');
      await expect(
        privacyMining.connect(deployer).updateRewardRate(
          this.rewardPool.assetId,
          this.rewardPool.rewardType,
          _newRewardRate
        )
      ).to.be.revertedWithCustomError(
        privacyMining,
        'RewardPeriodFinished'
      );
    });

    it('SUCCESS: Resets the reward pool\'s rewardRate', async() => {
      const _newRewardRate = toUnit('100');

      // GET THE UPDATED REWARD POOL
      const _rewardForPool_before = await privacyMining.rewardForPool(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );
       
      await privacyMining.connect(this.deployer).updateRewardRate(
        this.rewardPool.assetId,
        this.rewardPool.rewardType,
        _newRewardRate
      );

      // GET THE UPDATED REWARD POOL
      const _rewardForPool_after = await privacyMining.rewardForPool(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect(_rewardForPool_after.rewardRate).to.not.eq(_rewardForPool_before.rewardRate);
      expect(_rewardForPool_after.rewardRate).to.eq(_newRewardRate); 
    });

    it('SUCCESS: Phase II: Transfers the added reward from Owner to PMC if new reward rate is higher', async() => {
      const {stakingRewardPool, deployer, phaseTwoPeriodFinish} = await createStakingRewardPoolFixture();

      // GET THE INITIAL REWARD POOL
      const _rewardForPool_before = await privacyMining.rewardForPool(
        stakingRewardPool.assetId,
        stakingRewardPool.rewardType
      );

      // GET THE OLD SILENT BALANCE OF PMC
      const pmcSilentBalance_before = await silentToken.balanceOf(
        privacyMining.address
      );

      // SET THE NEW REWARD RATE JUST 10 UNITS ABOVE PREVIOUS
      const _newRewardRate = _rewardForPool_before.rewardRate.add(toBN('10'));

      // COMPUTE THE ADDED REWARD FOR [this.phaseOnePeriodFinish - 1000]
      const remainingPeriod = ethers.BigNumber.from(1000); // Because: [this.phaseOnePeriodFinish - 1000]
      const addedReward = _newRewardRate.mul(remainingPeriod);

      await doApprovePmcForTokenSpending(this.assetOwner1, addedReward);

      // INCREASE THE TIME FOR DETERMINISTIC REWARDS COMPUTATION FOR COMPARISIONS
      await time.increaseTo(phaseTwoPeriodFinish - 1000);
       
      // DEPLOYER: UPDATES REWARD RATE
      await privacyMining.connect(deployer).updateRewardRate(
        stakingRewardPool.assetId,
        stakingRewardPool.rewardType,
        _newRewardRate
      );

      // GET THE UPDATED REWARD POOL
      const _rewardForPool_after = await privacyMining.rewardForPool(
        stakingRewardPool.assetId,
        stakingRewardPool.rewardType
      );

      // GET THE NEW SILENT BALANCE OF PMC
      const pmcSilentBalance_after = await silentToken.balanceOf(
        privacyMining.address
      );

      expect(_rewardForPool_after.rewardRate).to.eq(_newRewardRate);
      expect(pmcSilentBalance_after).to.be.at.most(pmcSilentBalance_before.add(addedReward));
    });

    it('SUCCESS: Updates the reward pool\'s `lastUpdateTime`', async() => {
      // GET THE UPDATED REWARD POOL
      const _rewardForPool_before = await privacyMining.rewardForPool(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );
       
      const _newRewardRate = toUnit('100');

      await (time.increaseTo(this.phaseOnePeriodFinish - 1000));

      // DEPLOYER: UPDATES REWARD RATE
      await privacyMining.connect(this.deployer).updateRewardRate(
        this.rewardPool.assetId,
        this.rewardPool.rewardType,
        _newRewardRate
      );

      // GET THE UPDATED REWARD POOL
      const _rewardForPool_after = await privacyMining.rewardForPool(
        this.rewardPool.assetId,
        this.rewardPool.rewardType
      );

      expect(_rewardForPool_before.lastUpdateTime).to.be.at.most(this.phaseOnePeriodFinish - 1000);
      expect(_rewardForPool_after.lastUpdateTime).to.be.at.least(this.phaseOnePeriodFinish - 1000);
    });

    it('SUCCESS: Emits the event `RewardAdded` with correct arguments', async() => {
      const _newRewardRate = toUnit('100');

      // DEPLOYER: UPDATES REWARD RATE
      await expect(
        privacyMining.connect(this.deployer).updateRewardRate(
          this.rewardPool.assetId,
          this.rewardPool.rewardType,
          _newRewardRate
        )
      ).to.emit(
        privacyMining,
        'RewardRateUpdated'
      ).withArgs(
        this.rewardPool.assetId,
        this.rewardPool.rewardType,
        _newRewardRate
      )
    });

    // TODO
    it('FAILURE: should revert if the new rewardRate isn\'t balanced', async() => {});

  });

});
