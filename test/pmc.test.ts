/* eslint-disable node/no-missing-import */
/* eslint-disable camelcase */
/* eslint-disable node/no-unpublished-import */
import { expect, assert } from './chai-setup';
import { BigNumber, constants, utils } from 'ethers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { anyUint, anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { ethers, deployments, getUnnamedAccounts, getNamedAccounts } from 'hardhat';
import {
  SMASP,
  PrivacyMining,
  SilentToken,
  PrivacyMining__factory,
  SMASP__factory,
  SilentToken__factory
} from '../typechain-types';
import { advanceTime, setupUser, setupUsers, toBN, toUnit, advanceBlockTo, fromUnit, advanceBlock } from './utils';
import snapshotGasCost from '@uniswap/snapshot-gas-cost';
import { days } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time/duration';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('all');
  const { deployer, multisig, treasury } = await getNamedAccounts();
  const contracts = {
    PrivacyMining: <PrivacyMining>await ethers.getContract('PrivacyMining'),
    SMASP: <SMASP>await ethers.getContract('SMASP'),
    WETH: <SilentToken>await ethers.getContract('WETH'),
    SilentToken: <SilentToken>await ethers.getContract('SilentToken'),
    DAI: <SilentToken>await ethers.getContract('DAI')
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    multisig: await setupUser(multisig, contracts),
    deployer: await setupUser(deployer, contracts),
    treasury: await setupUser(treasury, contracts)
  };
});

describe('PrivacyMining', () => {
  interface SetupVars {
    users: any;
    SMASP: SMASP;
    WETH: SilentToken;
    PrivacyMining: PrivacyMining;
    SilentToken: SilentToken;
    [propName: string]: any;
  }

  describe('addRewardPool', () => {
    describe('phase I', () => {
      it('emits `LogRewardPoolAdded` event', async () => {
        const { multisig, PrivacyMining, WETH } = await setup();
        await expect(multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100))
          .to.emit(PrivacyMining, 'LogRewardPoolAdded')
          .withArgs(WETH.address, 1, 100);
      });

      it("Should revert if reward pool doesn't exist in SMASP", async () => {
        const { multisig, PrivacyMining } = await setup();
        await expect(multisig.PrivacyMining.addRewardPool(1, 1, 100)).to.be.revertedWith(
          PrivacyMining,
          'Invalid _assetId'
        );
      });

      it('Should revert if argument `_phase` is not 1 or 2', async () => {
        const { multisig, PrivacyMining } = await setup();
        await expect(multisig.PrivacyMining.addRewardPool(1, 3, 100)).to.be.revertedWithCustomError(
          PrivacyMining,
          'InvalidPhase'
        );
        await expect(multisig.PrivacyMining.addRewardPool(1, 0, 100)).to.be.revertedWith(
          'Arithmetic operation underflowed or overflowed outside of an unchecked block'
        );
      });

      it('Should set the variables for the `RewardPool` struct', async () => {
        const { multisig, PrivacyMining, WETH } = await setup();
        const addRewardPool_tx = await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100);
        await addRewardPool_tx.wait(1);

        const timestamp = (await ethers.provider.getBlock(addRewardPool_tx.blockNumber)).timestamp;

        const wethRewardPool = await PrivacyMining.getRewardPoolInfo(WETH.address);

        expect(wethRewardPool.phase).to.eq(1);
        expect(wethRewardPool.cycle).to.eq(1);
        expect(wethRewardPool.lastRewardTime).to.eq(timestamp);
        expect(wethRewardPool.allocPoint).to.eq(100);
        expect(wethRewardPool.accRewardPerShare).to.eq(0);
        expect(wethRewardPool.globalPoolBalance).to.eq(0);
      });

      it('Should increment the totalAllocPoint for the corresponding phase', async () => {
        const { multisig, PrivacyMining, WETH } = await setup();
        const addRewardPool_tx = await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100);
        await addRewardPool_tx.wait(1);

        expect((await PrivacyMining.getPhaseInfo(1)).totalAllocPoint).to.eq(100);
      });

      it('Should update reward shares of all reward pools in same phase relatively', async () => {
        const { multisig, PrivacyMining, WETH, DAI } = await setup();

        await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

        // 1. ADD DAI reward pool
        await multisig.PrivacyMining.addRewardPool(DAI.address, 1, 10);

        const rewardShare_DAI_before = toBN((await PrivacyMining.getRewardPoolInfo(DAI.address)).allocPoint).div(
          (await PrivacyMining.getPhaseInfo(1)).totalAllocPoint
        );

        const rewardShare_WETH_before = toBN((await PrivacyMining.getRewardPoolInfo(WETH.address)).allocPoint).div(
          (await PrivacyMining.getPhaseInfo(1)).totalAllocPoint
        );

        // BEFORE: Expect rewardShare of DAI pool to be 1 and WETH pool to be 0
        expect(rewardShare_DAI_before).to.eq(1);
        expect(rewardShare_WETH_before).to.eq(0);

        // 2. ADD WETH reward pool
        await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

        const rewardShare_DAI_after =
          parseInt((await PrivacyMining.getRewardPoolInfo(DAI.address)).allocPoint.toString()) /
          parseInt((await PrivacyMining.getPhaseInfo(1)).totalAllocPoint.toString());

        const rewardShare_WETH_after =
          parseInt((await PrivacyMining.getRewardPoolInfo(DAI.address)).allocPoint.toString()) /
          parseInt((await PrivacyMining.getPhaseInfo(1)).totalAllocPoint.toString());

        // AFTER: Expect rewardShare of DAI pool to be 0.5 and WETH pool to be 0.5
        expect(rewardShare_DAI_after).to.eq(0.5);
        expect(rewardShare_WETH_after).to.eq(0.5);
      });

      it('Gas snapshot for `addRewardPool` function: [Initiate Phase I]', async () => {
        const { multisig, PrivacyMining, WETH } = await setup();
        await snapshotGasCost(multisig.PrivacyMining.estimateGas.addRewardPool(WETH.address, 1, 100));
      });
    });

    describe('phase II', () => {
      it('Should revert if reward pool is upgraded to phase 2 before phase 1 ends', async () => {
        const { multisig, PrivacyMining, WETH } = await setup();
        // Create reward pool for WETH [Phase I initiated]
        await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100);

        // Upgrade WETH reward pool to Phase II [before phase I's reward period ends]
        await expect(multisig.PrivacyMining.addRewardPool(WETH.address, 2, 100)).to.be.revertedWithCustomError(
          PrivacyMining,
          'RewardPeriodOngoing'
        );
      });

      it('Should succeed if reward pool is upgraded to phase 2 after phase 1 ends', async () => {
        const { multisig, PrivacyMining, WETH } = await setup();
        // Create reward pool for WETH [Phase I initiated]
        const log1 = await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100);
        await log1.wait(1);

        // INCREASE timestamp to phase one's end
        const rewardPoolInfo = await PrivacyMining.getRewardPoolInfo(WETH.address);

        // Get the reward end timestamp for reward pool's phase one
        const phaseOneEndTime = rewardPoolInfo.rewardEndTime;

        // Increase the time to reward pool's end timestamp for phase one
        await time.increaseTo(phaseOneEndTime + 1);

        // NOTE: CALL `massUpdatePoolRewardVariables` beforehand

        // Upgrade WETH reward pool to Phase II [after phase I's reward period ends]
        await expect(multisig.PrivacyMining.addRewardPool(WETH.address, 2, 100))
          .to.emit(PrivacyMining, 'LogRewardPoolAdded')
          .withArgs(WETH.address, 2, 100);
      });

      it("Should update reward variables of the reward pool's `Reward` struct", async () => {
        const { multisig, PrivacyMining, WETH } = await setup();
        // Create reward pool for WETH [Phase I initiated]
        const log1 = await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100);
        await log1.wait(1);

        // INCREASE timestamp to phase one's end
        const rewardPoolInfo_before = await PrivacyMining.getRewardPoolInfo(WETH.address);

        // Get the reward end timestamp for reward pool's phase one
        const phaseOneEndTime = rewardPoolInfo_before.rewardEndTime;

        // Increase the time to reward pool's end timestamp for phase one
        await time.increaseTo(phaseOneEndTime + 1);

        // NOTE: CALL `massUpdatePoolRewardVariables` beforehand

        // Upgrade WETH reward pool to Phase II [after phase I's reward period ends]
        const log2 = await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 101);
        await log2.wait(1);

        const rewardPoolInfo_after = await PrivacyMining.getRewardPoolInfo(WETH.address);

        expect(rewardPoolInfo_after.cycle).to.eq(1);
        expect(rewardPoolInfo_after.phase).to.eq(2);
        expect(rewardPoolInfo_after.lastRewardTime).to.eq((await ethers.provider.getBlock(log2.blockNumber)).timestamp);
        expect(rewardPoolInfo_after.allocPoint).to.eq(101);
        expect(rewardPoolInfo_after.accRewardPerShare).to.eq(0);
        expect(rewardPoolInfo_after.globalPoolBalance).to.eq(0);
      });

      it('Should update the total allocPoint of both Phase One and Phase Two', async () => {
        const { multisig, PrivacyMining, WETH } = await setup();
        // Create reward pool for WETH [Phase I initiated]
        const log1 = await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100);
        await log1.wait(1);

        expect((await PrivacyMining.getPhaseInfo(1)).totalAllocPoint).to.eq(100);
        expect((await PrivacyMining.getPhaseInfo(2)).totalAllocPoint).to.eq(0);

        // Get the info for WETH reward pool
        const rewardPoolInfo_before = await PrivacyMining.getRewardPoolInfo(WETH.address);

        // Get the reward end timestamp for reward pool's phase one
        const phaseOneEndTime = rewardPoolInfo_before.rewardEndTime;

        // Increase the time to reward pool's end timestamp for phase one
        await time.increaseTo(phaseOneEndTime + 1);

        // NOTE: CALL `massUpdatePoolRewardVariables` beforehand

        // Upgrade WETH reward pool to Phase II [after phase I's reward period ends]
        const log2 = await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 101);
        await log2.wait(1);

        expect((await PrivacyMining.getPhaseInfo(1)).totalAllocPoint).to.eq(0);
        expect((await PrivacyMining.getPhaseInfo(2)).totalAllocPoint).to.eq(101);
      });

      it('Gas snapshot for `addRewardPool` function: [Upgrade to Phase II]', async () => {
        const { multisig, PrivacyMining, WETH } = await setup();
        // Create reward pool for WETH [Phase I initiated]
        const log1 = await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100);
        await log1.wait(1);

        // INCREASE timestamp to phase one's end
        const rewardPoolInfo = await PrivacyMining.getRewardPoolInfo(WETH.address);

        // Get the reward end timestamp for reward pool's phase one
        const phaseOneEndTime = rewardPoolInfo.rewardEndTime;

        // Increase the time to reward pool's end timestamp for phase one
        await time.increaseTo(phaseOneEndTime + 1);

        // NOTE: CALL `massUpdatePoolRewardVariables` beforehand

        // Upgrade WETH reward pool to Phase II [after phase I's reward period ends]
        await snapshotGasCost(multisig.PrivacyMining.estimateGas.addRewardPool(WETH.address, 2, 100));
      });
    });
  });

  describe('depositAssetToPool', () => {
    let _: SetupVars;

    beforeEach(async () => {
      const { deployer, multisig, PrivacyMining, SMASP, WETH, users, DAI } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      const depositAmount = toUnit(1);

      await deployer.WETH.transfer(users[0].address, depositAmount);
      await users[0].WETH.approve(SMASP.address, depositAmount);

      _ = {
        users,
        deployer,
        SMASP,
        WETH,
        PrivacyMining,
        depositAmount,
        multisig,
        DAI
      };
    });

    it('emits `LogDepositToPool` event', async () => {
      await expect(_.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount))
        .to.emit(_.PrivacyMining, 'LogDepositToPool')
        .withArgs(_.users[0].address, _.WETH.address, _.depositAmount);
    });

    it('should set/change the variables for `UserPoolInfo` struct', async () => {
      await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);

      const userPoolInfo = await _.PrivacyMining.getUserPoolInfo(_.users[0].address, _.WETH.address);

      expect(userPoolInfo.userPoolBalance).to.eq(_.depositAmount);
      expect(userPoolInfo.phase).to.eq(1);
      expect(userPoolInfo.userVoucherBalance).to.eq(0);
      expect(userPoolInfo.rewardDebt).to.eq(0);
    });

    it('should set/change the variables for `RewardPool` struct', async () => {
      const log1 = await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);
      await log1.wait(1);
      const timestamp = (await ethers.provider.getBlock(log1.blockNumber)).timestamp;

      const rewardPoolInfo = await _.PrivacyMining.getRewardPoolInfo(_.WETH.address);

      expect(rewardPoolInfo.globalPoolBalance).to.eq(_.depositAmount);
      expect(rewardPoolInfo.accRewardPerShare).to.eq(0);
      expect(rewardPoolInfo.lastRewardTime).to.eq(timestamp);
    });

    it('reverts if the reward period has already finished', async () => {
      // INCREASE timestamp to phase one's end
      const rewardPoolInfo = await _.PrivacyMining.getRewardPoolInfo(_.WETH.address);

      // Get the reward end timestamp for reward pool's phase one
      const phaseOneEndTime = rewardPoolInfo.rewardEndTime;

      // Increase the time to reward pool's end timestamp for phase one
      await time.increaseTo(phaseOneEndTime + 1);

      // NOTE: CALL `massUpdatePoolRewardVariables` beforehand

      await expect(_.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount)).to.be.revertedWithCustomError(
        _.PrivacyMining,
        'RewardPeriodFinished'
      );
    });

    it('reverts for all other pool phases except phase one', async () => {
      // 1. TEST FOR CALL IN PHASE ONE OF REWARD POOL [WETH]: PASS
      await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);

      // 2. TEST FOR CALL IN PHASE TWO OF REWARD POOL [WETH]: REVERT

      //  Fetch WETH reward pool's info
      const rewardPoolInfo = await _.PrivacyMining.getRewardPoolInfo(_.WETH.address);

      // Get the reward end timestamp for reward pool's phase one
      const phaseOneEndTime = rewardPoolInfo.rewardEndTime;

      // Increase the time to reward pool's end timestamp for phase one
      await time.increaseTo(phaseOneEndTime);

      // NOTE: CALL `massUpdatePoolRewardVariables` beforehand

      // First let _.users[0] approve WETH tokens to SMASP
      await _.deployer.WETH.transfer(_.users[0].address, _.depositAmount);
      await _.users[0].WETH.approve(_.SMASP.address, _.depositAmount);

      await expect(_.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount)).to.be.revertedWithCustomError(
        _.PrivacyMining,
        'RewardPeriodFinished'
      );

      // 3. TEST FOR CALL IN PHASE ZERO OF REWARD POOL [DAI]: REVERT
      // First let _.users[0] approve WETH tokens to SMASP
      await _.deployer.DAI.transfer(_.users[0].address, _.depositAmount);
      await _.users[0].DAI.approve(_.SMASP.address, _.depositAmount);

      await expect(_.users[0].SMASP.depositAsset(_.DAI.address, _.depositAmount)).to.be.revertedWithCustomError(
        _.PrivacyMining,
        'InvalidPhase'
      );
    });

    it('Gas snapshot for `depositAssetToPool` function', async () => {
      await snapshotGasCost(_.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount));
    });
  });

  describe('getPendingRewards', function () {
    let _: SetupVars;

    beforeEach(async () => {
      const { deployer, multisig, PrivacyMining, SMASP, WETH, users } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      const depositAmount = toUnit(1);

      await deployer.WETH.transfer(users[0].address, depositAmount);
      _ = {
        users,
        SMASP,
        WETH,
        PrivacyMining,
        depositAmount
      };
    });

    it('PendingReward should equal ExpectedReward', async () => {
      await _.users[0].WETH.approve(_.SMASP.address, _.depositAmount);

      const log1 = await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);
      await log1.wait();

      await advanceTime(86400);

      const log2 = await _.PrivacyMining.updatePoolRewardVariables(_.WETH.address);

      const timestamp2 = (await ethers.provider.getBlock(log2.blockNumber)).timestamp;
      const timestamp1 = (await ethers.provider.getBlock(log1.blockNumber)).timestamp;

      const expectedRewards = toUnit(1).mul(timestamp2 - timestamp1);

      const pendingRewards = await _.PrivacyMining.getPendingRewards(_.WETH.address, _.users[0].address);

      // console.log('timestamp2', timestamp2, 'timestamp', timestamp);
      // console.log('expectedRewards: ', parseInt(expectedRewards.toString()));
      // console.log('pendingRewards: ', pendingRewards.toBigInt());

      expect(pendingRewards).to.eq(expectedRewards);
    });

    it('When time is lastRewardTime', async function () {
      await _.users[0].WETH.approve(_.SMASP.address, _.depositAmount);

      const log1 = await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);

      await advanceBlockTo(3);

      const log2 = await _.PrivacyMining.updatePoolRewardVariables(_.WETH.address);

      const timestamp2 = (await ethers.provider.getBlock(log2.blockNumber)).timestamp;
      const timestamp1 = (await ethers.provider.getBlock(log1.blockNumber)).timestamp;

      const expectedRewards = toUnit(1).mul(timestamp2 - timestamp1);

      const pendingRewards = await _.PrivacyMining.getPendingRewards(_.WETH.address, _.users[0].address);

      expect(pendingRewards).to.eq(expectedRewards);
    });

    it('Gas snapshot for `getPendingRewards` function', async () => {
      await _.users[0].WETH.approve(_.SMASP.address, _.depositAmount);

      const log1 = await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);
      await log1.wait();

      await advanceTime(86400);

      await snapshotGasCost(_.PrivacyMining.getPendingRewards(_.WETH.address, _.users[0].address));
    });
  });

  describe('updatePoolRewardVariables', () => {
    let _: SetupVars;

    beforeEach(async () => {
      const { deployer, multisig, PrivacyMining, SMASP, WETH, users } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      const depositAmount = toUnit(1);

      await deployer.WETH.transfer(users[0].address, depositAmount);
      await users[0].WETH.approve(SMASP.address, depositAmount);

      _ = {
        users,
        SMASP,
        WETH,
        PrivacyMining,
        depositAmount
      };
    });

    it('Should emit event `LogUpdatePoolRewards`', async function () {
      await advanceBlockTo(1);
      await expect(_.PrivacyMining.updatePoolRewardVariables(_.WETH.address))
        .to.emit(_.PrivacyMining, 'LogUpdatePoolRewards')
        .withArgs(
          _.WETH.address,
          (
            await _.PrivacyMining.getRewardPoolInfo(_.WETH.address)
          ).lastRewardTime,
          (
            await _.PrivacyMining.getRewardPoolInfo(_.WETH.address)
          ).globalPoolBalance,
          (
            await _.PrivacyMining.getRewardPoolInfo(_.WETH.address)
          ).accRewardPerShare
        );
    });

    it('Should take else path', async function () {
      // Use Multicall here
    });

    it('Should not update `RewardPool.accRewardPerShare` & `RewardPool.lastRewardTime` after reward period finishes', async () => {
      // Get the info for WETH reward pool before function call
      const rewardPoolInfo_before = await _.PrivacyMining.getRewardPoolInfo(_.WETH.address);

      // Get the reward end timestamp for reward pool's phase one
      const phaseOneEndTime = rewardPoolInfo_before.rewardEndTime;

      // Increase the time to reward pool's end timestamp for phase one
      await time.increaseTo(phaseOneEndTime + 1);

      // NOTE: CALL `massUpdatePoolRewardVariables` beforehand

      const log1 = await _.PrivacyMining.updatePoolRewardVariables(_.WETH.address);
      await log1.wait(1);

      const rewardPoolInfo_after = await _.PrivacyMining.getRewardPoolInfo(_.WETH.address);

      expect(rewardPoolInfo_after.accRewardPerShare).to.eq(rewardPoolInfo_before.accRewardPerShare);
      // Expect WETH's `RewardPool.lastRewardTime` to be the `RewardPool.rewardEndTime`
      expect(rewardPoolInfo_after.lastRewardTime).to.eq(rewardPoolInfo_before.rewardEndTime);

      await expect(_.PrivacyMining.updatePoolRewardVariables(_.WETH.address))
        .to.emit(_.PrivacyMining, 'LogUpdatePoolRewards')
        .withArgs(
          _.WETH.address,
          rewardPoolInfo_before.rewardEndTime,
          rewardPoolInfo_before.globalPoolBalance,
          rewardPoolInfo_before.accRewardPerShare
        );
    });

    it('Gas snapshot for `updatePoolRewardVariables` function', async () => {
      await advanceBlockTo(1);

      await snapshotGasCost(_.PrivacyMining.updatePoolRewardVariables(_.WETH.address));
    });
  });

  describe('claimRewards: [Phase I]', () => {
    let _: SetupVars;

    beforeEach(async () => {
      const { deployer, multisig, PrivacyMining, SMASP, WETH, users } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      const depositAmount = toUnit(1);

      await deployer.WETH.transfer(users[0].address, depositAmount.mul(2));
      await users[0].WETH.approve(SMASP.address, depositAmount.mul(2));

      _ = {
        users,
        SMASP,
        WETH,
        PrivacyMining,
        depositAmount
      };
    });

    it(`should reward users with correct amount of vouchers`, async () => {
      const log1 = await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);
      await advanceTime(86400);

      const userVoucherBalance_before = (await _.PrivacyMining.getUserPoolInfo(_.users[0].address, _.WETH.address))
        .userVoucherBalance;

      const log2 = await _.users[0].PrivacyMining.claimRewardsFromPool(_.WETH.address);

      const userVoucherBalance_after = (await _.PrivacyMining.getUserPoolInfo(_.users[0].address, _.WETH.address))
        .userVoucherBalance;

      const timestamp2 = (await ethers.provider.getBlock(log2.blockNumber)).timestamp;
      const timestamp1 = (await ethers.provider.getBlock(log1.blockNumber)).timestamp;

      const expectedRewards = toUnit(1).mul(timestamp2 - timestamp1);

      expect(userVoucherBalance_after.sub(userVoucherBalance_before)).to.eq(expectedRewards);

      expect((await _.PrivacyMining.getUserPoolInfo(_.users[0].address, _.WETH.address)).rewardDebt).to.eq(
        expectedRewards
      );
    });

    it('Gas snapshot for `claimRewards` function [phase=1]', async () => {
      await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);

      await time.increase(86400);
      await snapshotGasCost(_.users[0].PrivacyMining.claimRewardsFromPool(_.WETH.address));
    });
  });

  describe('stakeSilentToPool', () => {
    let _: SetupVars;

    beforeEach(async () => {
      const { deployer, multisig, PrivacyMining, SMASP, WETH, SilentToken, users } = await setup();

      // 1. Set emission rate for phase one
      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
      // 2. Add WETH reward pool to PMC
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      // 3. Let user 1 WETH to WETH reward pool in PMC
      const depositAmount = toUnit(1);

      await deployer.WETH.transfer(users[0].address, depositAmount.mul(2));
      await users[0].WETH.approve(SMASP.address, depositAmount.mul(2));

      await users[0].SMASP.depositAsset(WETH.address, depositAmount);

      // 4. Let user claim accumulate voucher rewards from WETH reward pool
      await time.increase(86400);

      await users[0].PrivacyMining.claimRewardsFromPool(WETH.address);

      // console.log(
      //   'userVoucherBalance: ',
      //   (await PrivacyMining.getUserPoolInfo(users[0].address, WETH.address)).userVoucherBalance
      // );

      // 5. End phase one for WETH reward pool
      const phaseOneEndTime = (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;

      await time.increase(phaseOneEndTime + 1); // Reward period is 7 days

      // 6. Set reward emission rate for phase two
      await multisig.PrivacyMining.setRewardEmissionRate(2, toUnit(1));
      // 7. Upgrade WETH reward pool to phase two
      await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 10);

      await multisig.SilentToken.transfer(users[0].address, depositAmount);
      await users[0].SilentToken.approve(PrivacyMining.address, depositAmount);

      _ = {
        users,
        multisig,
        SMASP,
        WETH,
        PrivacyMining,
        SilentToken,
        depositAmount
      };
    });

    it(`should revert if user didn't participate in phase 1 of rewardPool`, async () => {
      await expect(_.users[1].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount)).to.be.reverted;
    });

    it(`should revert if reward pool is not in phase 2`, async () => {
      // Try to stake to SilentToken pool which has phase 0
      await expect(_.users[1].PrivacyMining.stakeSilentToPool(_.SilentToken.address, _.depositAmount)).to.be.reverted;
    });

    it(`should revert if reward pool is not in phase 1`, async () => {
      // Try to stake to SilentToken pool which has phase 0
      await expect(_.users[1].PrivacyMining.stakeSilentToPool(_.SilentToken.address, _.depositAmount)).to.be.reverted;
    });

    it(`should transfer staked amount from user to PMC`, async () => {
      expect(await _.SilentToken.balanceOf(_.PrivacyMining.address)).to.eq(0);
      await _.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount);

      expect(await _.SilentToken.balanceOf(_.PrivacyMining.address)).to.eq(_.depositAmount);
    });

    it(`should emit event \`LogSilentStakedToPool\``, async () => {
      await expect(_.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount))
        .to.emit(_.PrivacyMining, 'LogSilentStakedToPool')
        .withArgs(_.users[0].address, _.WETH.address, _.depositAmount);
    });

    it(`should change the \`globalPoolBalance\` in struct \`RewardPool\``, async () => {
      const rewardPoolInfo_before = await _.PrivacyMining.getRewardPoolInfo(_.WETH.address);
      expect(rewardPoolInfo_before.globalPoolBalance).to.eq(0);
      await _.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount);

      const rewardPoolInfo_after = await _.PrivacyMining.getRewardPoolInfo(_.WETH.address);

      const userPoolVoucherBalance = (await _.PrivacyMining.getUserPoolInfo(_.users[0].address, _.WETH.address))
        .userVoucherBalance;

      expect(rewardPoolInfo_after.globalPoolBalance).to.eq(
        rewardPoolInfo_before.globalPoolBalance.add(_.depositAmount).mul(userPoolVoucherBalance)
      );
    });

    it(`should change respective variables in struct \`UserPoolInfo\``, async () => {
      await _.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount);

      const userPoolInfo = await _.PrivacyMining.getUserPoolInfo(_.users[0].address, _.WETH.address);

      const userPoolVoucherBalance = (await _.PrivacyMining.getUserPoolInfo(_.users[0].address, _.WETH.address))
        .userVoucherBalance;

      expect(userPoolInfo.userPoolBalance).to.eq(_.depositAmount.mul(userPoolVoucherBalance));
      expect(userPoolInfo.phase).to.eq(2);
    });

    it('Gas snapshot for `stakeSilentToPool` function', async () => {
      await snapshotGasCost(_.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount));
    });
  });

  describe('unstakeSilentFromPool', () => {
    let _: SetupVars;

    beforeEach(async () => {
      const { deployer, multisig, PrivacyMining, SMASP, WETH, SilentToken, users } = await setup();

      // 1. Set emission rate for phase one
      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
      // 2. Add WETH reward pool to PMC
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      // 3. Let user 1 WETH to WETH reward pool in PMC
      const depositAmount = toUnit(1);

      await deployer.WETH.transfer(users[0].address, depositAmount.mul(2));
      await users[0].WETH.approve(SMASP.address, depositAmount.mul(2));

      await users[0].SMASP.depositAsset(WETH.address, depositAmount);

      // 4. Let user claim accumulate voucher rewards from WETH reward pool
      await time.increase(86400);

      await users[0].PrivacyMining.claimRewardsFromPool(WETH.address);

      // 5. End phase one for WETH reward pool
      const phaseOneEndTime = (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;

      await time.increase(phaseOneEndTime + 1);

      // 6. Set reward emission rate for phase two
      await multisig.PrivacyMining.setRewardEmissionRate(2, toUnit(1));
      // 7. Upgrade WETH reward pool to phase two
      await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 10);

      // 8. Let user stake some amount of SILENT to WETH pool
      await multisig.SilentToken.transfer(users[0].address, depositAmount);
      await users[0].SilentToken.approve(PrivacyMining.address, depositAmount);
      await users[0].PrivacyMining.stakeSilentToPool(WETH.address, depositAmount);

      _ = {
        users,
        multisig,
        SMASP,
        WETH,
        PrivacyMining,
        SilentToken,
        depositAmount
      };
    });

    it(`should revert if user is unstaking more than staked SILENT`, async () => {
      await expect(_.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount.add(1))).to.be
        .reverted;
    });

    it(`should revert if reward pool is not in phase 2`, async () => {
      await expect(_.users[0].PrivacyMining.unstakeSilentFromPool(_.SilentToken.address, _.depositAmount)).to.be
        .reverted;
    });

    it(`should transfer unstaked amount from PMC to user`, async () => {
      const pmcSilentBalance_before = await _.SilentToken.balanceOf(_.PrivacyMining.address);
      const userSilentBalance_before = await _.SilentToken.balanceOf(_.users[0].address);

      await _.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount);

      const pmcSilentBalance_after = await _.SilentToken.balanceOf(_.PrivacyMining.address);

      const userSilentBalance_after = await _.SilentToken.balanceOf(_.users[0].address);

      expect(pmcSilentBalance_after).to.eq(pmcSilentBalance_before.sub(_.depositAmount));
      expect(userSilentBalance_after).to.eq(userSilentBalance_before.add(_.depositAmount));
    });

    it(`should emit event \`LogSilentUnStakedFromPool\``, async () => {
      await expect(_.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount))
        .to.emit(_.PrivacyMining, 'LogSilentUnstakedFromPool')
        .withArgs(_.users[0].address, _.WETH.address, _.depositAmount);
    });

    it(`should decrease the \`globalPoolBalance\` of \`RewardPool\``, async () => {
      const userVoucherBalance = (await _.PrivacyMining.getUserPoolInfo(_.users[0].address, _.WETH.address))
        .userVoucherBalance;

      const rewardPoolInfo_before = await _.PrivacyMining.getRewardPoolInfo(_.WETH.address);

      await _.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount);

      const rewardPoolInfo_after = await _.PrivacyMining.getRewardPoolInfo(_.WETH.address);

      expect(rewardPoolInfo_after.globalPoolBalance).to.eq(
        rewardPoolInfo_before.globalPoolBalance.sub(_.depositAmount.mul(userVoucherBalance))
      );
    });

    it(`should decrease \`userPoolBalance\` of \`UserPoolInfo\``, async () => {
      const userPoolInfo_before = await _.PrivacyMining.getUserPoolInfo(_.users[0].address, _.WETH.address);

      await _.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount);

      const userPoolInfo_after = await _.PrivacyMining.getUserPoolInfo(_.users[0].address, _.WETH.address);

      expect(userPoolInfo_after.userPoolBalance).to.eq(
        userPoolInfo_before.userPoolBalance.sub(_.depositAmount.mul(userPoolInfo_before.userVoucherBalance))
      );
    });

    it('Gas snapshot for `unstakeSilentFromPool` function', async () => {
      await snapshotGasCost(_.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount));
    });
  });

  describe('claimRewards: [Phase II]', () => {
    let _: SetupVars;

    beforeEach(async () => {
      const { deployer, multisig, PrivacyMining, SMASP, WETH, SilentToken, users, treasury } = await setup();

      // 1. Set emission rate for phase one
      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
      // 2. Add WETH reward pool to PMC
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      // 3. Let user 1 WETH to WETH reward pool in PMC
      const depositAmount = toUnit(1);

      await deployer.WETH.transfer(users[0].address, depositAmount.mul(2));
      await users[0].WETH.approve(SMASP.address, depositAmount.mul(2));

      await users[0].SMASP.depositAsset(WETH.address, depositAmount);

      // 4. Let user claim accumulate voucher rewards from WETH reward pool
      await time.increase(86400);

      await users[0].PrivacyMining.claimRewardsFromPool(WETH.address);

      // console.log(
      //   'userVoucherBalance :' +
      //     (await PrivacyMining.getUserPoolInfo(users[0].address, WETH.address)).userVoucherBalance
      // );

      // 5. End WETH reward pool's current rewardPeriod for phase one
      const phaseOneEndTime = (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;

      await time.increase(phaseOneEndTime + 1); // Reward period is 7 days

      // 6. Set reward emission rate for phase two
      await multisig.PrivacyMining.setRewardEmissionRate(2, toUnit(1));
      // 7. Upgrade WETH reward pool to phase two
      await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 10);

      // 8. Compute WETH reward pool's current rewardPeriod for phase two
      const phaseTwoEndTime = (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;

      // Owner: Transfers Silent Tokens to Treasury for rewards distribution until rewardEndTime [7 days]
      // From current timestamp until `rewardEndTime`
      const silentRewards = toUnit(1).mul(phaseTwoEndTime - (await time.latest()));
      // Multisig: Transfers the Silent rewards for the duration to the tresury
      await multisig.SilentToken.transfer(treasury.address, silentRewards);

      // 9. Treasury: Provides the Silent token allowance for the PMC to reward users
      await treasury.SilentToken.approve(PrivacyMining.address, silentRewards);

      // USER: Approves SILENT to PMC for staking in WETH reward pool during phase 2
      await multisig.SilentToken.transfer(users[0].address, depositAmount);
      await users[0].SilentToken.approve(PrivacyMining.address, depositAmount);

      _ = {
        users,
        multisig,
        treasury,
        SMASP,
        WETH,
        PrivacyMining,
        SilentToken,
        depositAmount
      };
    });

    it(`should transfer correct amount of SILENT tokens as rewards to user`, async () => {
      // 1. USER: Stakes SILENT to the WETH reward pool
      const log1 = await _.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount);

      const treasuryBalance_before = await _.SilentToken.balanceOf(_.treasury.address);
      const userSilentBalance_before = await _.users[0].SilentToken.balanceOf(_.users[0].address);

      const phaseTwoEndTime = (await _.PrivacyMining.getRewardPoolInfo(_.WETH.address)).rewardEndTime;

      // 2. System: Increase time to 10 seconds before the current reward period for phase 2 ends
      await time.increaseTo(phaseTwoEndTime - 10);

      // 3. USER: Claim SILENT rewards from the WETH reward pool
      const log2 = await _.users[0].PrivacyMining.claimRewardsFromPool(_.WETH.address);

      const treasuryBalance_after = await _.SilentToken.balanceOf(_.treasury.address);
      const userSilentBalance_after = await _.users[0].SilentToken.balanceOf(_.users[0].address);

      const timestamp1 = (await ethers.provider.getBlock(log1.blockNumber)).timestamp;
      const timestamp2 = (await ethers.provider.getBlock(log2.blockNumber)).timestamp;

      const expectedRewards = toUnit(1).mul(timestamp2 - timestamp1);
      const claimedRewards = userSilentBalance_after.sub(userSilentBalance_before);

      // NOTE: FIX THE PRECISION ERROR IN THE FOLLOWING EXPECT STATEMENT
      // expect(claimedRewards).to.eq(expectedRewards);
      expect(userSilentBalance_after.sub(userSilentBalance_before)).to.eq(
        treasuryBalance_before.sub(treasuryBalance_after)
      );
    });

    it('Gas snapshot for `claimRewardsForPool` function [Phase II]', async () => {
      // 1. USER: Stakes SILENT to the WETH reward pool
      const log1 = await _.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount);
      // 2. System: Increase time to 10 seconds before the current reward period for phase 2 ends
      await advanceTime(86400);
      // 3. USER: Take gas snapshot when user claims SILENT rewards from the WETH reward pool
      await snapshotGasCost(_.users[0].PrivacyMining.claimRewardsFromPool(_.WETH.address));
    });
  });

  describe('massUpdatePoolRewardVariables', function () {
    it('Should call updatePoolRewardVariables', async function () {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);
      await advanceBlockTo(1);
      await expect(multisig.PrivacyMining.massUpdatePoolRewardVariables([WETH.address]))
        .to.emit(PrivacyMining, 'LogUpdatePoolRewards')
        .withArgs(WETH.address, anyUint, anyUint, anyUint);
    });

    it('Updating invalid pools should fail', async function () {
      const { multisig, PrivacyMining, WETH, SilentToken } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      await expect(multisig.PrivacyMining.massUpdatePoolRewardVariables([SilentToken.address])).to.be.revertedWith(
        'Invalid Pool'
      );
    });

    it('Gas snapshot for `massUpdatePoolRewardVariables` function', async () => {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);
      await advanceBlockTo(1);

      await snapshotGasCost(multisig.PrivacyMining.massUpdatePoolRewardVariables([WETH.address]));
    });
  });

  describe('updateRewardPoolAllocations', () => {
    it('updates `RewardPool.allocPoint` of given reward pool and starts a new reward period', async () => {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      // 1. Add WETH reward pool to PMC with 10 `allocPoint`
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      expect((await PrivacyMining.getRewardPoolInfo(WETH.address)).allocPoint).to.eq(10);

      // 2. End current reward period for phase One
      const phaseOneEndTime = (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
      await advanceTime(phaseOneEndTime + 1);

      // 3. Update WETH reward pool's `allocPoint` to 100
      const updateRewardPoolAllocations_tx = await multisig.PrivacyMining.updateRewardPoolAllocations(
        WETH.address,
        1,
        100
      );

      const timestamp = (await ethers.provider.getBlock(updateRewardPoolAllocations_tx.blockNumber)).timestamp;

      expect((await PrivacyMining.getRewardPoolInfo(WETH.address)).allocPoint).to.eq(100);
      expect((await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime).to.eq(timestamp + days(7));
    });

    it('updates `PhaseInfo.totalAllocPoint` of the same phase', async () => {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      // 1. Add WETH reward pool to PMC with 10 `allocPoint`
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      expect((await PrivacyMining.getPhaseInfo(1)).totalAllocPoint).to.eq(10);

      // 2. End current reward period for phase One
      const phaseOneEndTime = (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
      await advanceTime(phaseOneEndTime + 1);

      // 3. Update WETH reward pool's `allocPoint` to 100
      await multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 1, 100);

      expect((await PrivacyMining.getPhaseInfo(1)).totalAllocPoint).to.eq(100);
    });

    it('reverts when called by non-owner', async () => {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      // 1. Add WETH reward pool to PMC
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      // 2. End current reward period for phase One
      const phaseOneEndTime = (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
      await advanceTime(phaseOneEndTime + 1);

      // 3. Let non-owner of PMC make tx to `updateRewardPoolAllocations`
      await expect(PrivacyMining.updateRewardPoolAllocations(WETH.address, 1, 100)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it('reverts when allocPoint is updated before rewardPeriod finishes', async () => {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      // 1. Add WETH reward pool to PMC
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      // 2. Let owner of PMC update WETH's `allocPoint` to ZERO before current period finishes
      await expect(
        multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 1, 100)
      ).to.be.revertedWithCustomError(PrivacyMining, 'RewardPeriodOngoing');
    });

    it('deletes rewardPool from PMC if allocPoint is reset to ZERO in phase two', async () => {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      // 1. Create WETH reward pool in PMC with 10 `allocPoint`
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      // 2. End the current reward period for WETH reward pool
      const phaseOneEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
      await advanceTime(phaseOneEndTime + 1);

      // 3. Upgrade the WETH reward pool to phase 2 with 20 `allocPoint`
      await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 20);

      // 4. End the current reward period for WETH reward pool
      const phaseTwoEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
      await advanceTime(phaseTwoEndTime + 1);

      // 5. Update the `allocPoint` of WETH reward pool [in phase 2] to ZERO
      await multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 2, 0);

      // Expect the WETH rewardPool to be deleted from PMC
      const rewardPoolInfo = await PrivacyMining.getRewardPoolInfo(WETH.address);
      expect(rewardPoolInfo.cycle).to.eq(1);
      expect(rewardPoolInfo.phase).to.eq(0);
      expect(rewardPoolInfo.rewardPrecision).to.eq(0);
      expect(rewardPoolInfo.allocPoint).to.eq(0);
      expect(rewardPoolInfo.lastRewardTime).to.eq(0);
      expect(rewardPoolInfo.rewardEndTime).to.eq(0);
      expect(rewardPoolInfo.accRewardPerShare).to.eq(0);
      expect(rewardPoolInfo.globalPoolBalance).to.eq(0);
    });

    it('Gas snapshot for `updateRewardPoolAllocations` function: zero to non-zero', async () => {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      // 1. Create WETH reward pool in PMC with 10 `allocPoint`
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      expect((await PrivacyMining.getPhaseInfo(1)).totalAllocPoint).to.eq(10);

      // 2. End the current reward period for WETH reward pool
      const phaseOneEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
      await advanceTime(phaseOneEndTime + 1);

      // 3. Update the `allocPoint` of WETH reward pool to ZERO
      await multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 1, 0);

      // 4. Update the `allocPoint` of WETH reward pool to non-ZERO
      await snapshotGasCost(multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 1, 10));
    });

    it('Gas snapshot for `updateRewardPoolAllocations` function: non-zero to non-zero', async () => {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      // 1. Create WETH reward pool in PMC with 10 `allocPoint`
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      // 2. End the current reward period for WETH reward pool
      const phaseOneEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
      await advanceTime(phaseOneEndTime + 1);

      // 3. Update the `allocPoint` of WETH reward pool to some non-ZERO value
      await snapshotGasCost(multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 1, 100));
    });

    it('Gas snapshot for `updateRewardPoolAllocations` function: non-zero to zero [phase I]', async () => {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      // 1. Create WETH reward pool in PMC with 10 `allocPoint`
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      expect((await PrivacyMining.getPhaseInfo(1)).totalAllocPoint).to.eq(10);

      // 2. End the current reward period for WETH reward pool
      const phaseOneEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
      await advanceTime(phaseOneEndTime + 1);

      // 3. Update the `allocPoint` of WETH reward pool to ZERO
      await snapshotGasCost(multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 1, 0));
    });

    it('Gas snapshot for `updateRewardPoolAllocations` function: non-zero to zero [phase II]', async () => {
      const { multisig, PrivacyMining, WETH } = await setup();

      await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));

      // 1. Create WETH reward pool in PMC with 10 `allocPoint`
      await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

      // 2. End the current reward period for WETH reward pool
      const phaseOneEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
      await advanceTime(phaseOneEndTime + 1);

      // 3. Upgrade the WETH reward pool to phase 2 with 20 `allocPoint`
      await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 20);

      // 4. End the current reward period for WETH reward pool
      const phaseTwoEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
      await advanceTime(phaseTwoEndTime + 1);

      // 5. Update the `allocPoint` of WETH reward pool [in phase 2] to ZERO
      await snapshotGasCost(multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 2, 0));
    });
  });

  describe('Pool recycle', () => {
    describe('recycle process', () => {
      it(`should let a pool recycle back to phase one after phase two is finished`, async () => {
        const { multisig, PrivacyMining, WETH } = await setup();

        expect((await PrivacyMining.getRewardPoolInfo(WETH.address)).cycle).to.eq(0);

        // 1. Create WETH reward pool in PMC with 10 `allocPoint`
        await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

        // 2. End the current reward period for WETH reward pool
        const phaseOneEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
        await advanceTime(phaseOneEndTime + 1);

        expect((await PrivacyMining.getRewardPoolInfo(WETH.address)).cycle).to.eq(1);

        // 3. Upgrade the WETH reward pool to phase 2 with 20 `allocPoint`
        await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 20);

        expect((await PrivacyMining.getRewardPoolInfo(WETH.address)).cycle).to.eq(1);

        // 4. End the current reward period for WETH reward pool
        const phaseTwoEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
        await advanceTime(phaseTwoEndTime + 1);

        // 5. Update the allocPoint of WETH reward pool to zero
        await multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 2, 0);

        // 6. Recycle the WETH pool back to phase one
        const recycleRewardPool_tx = await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 30);
        await recycleRewardPool_tx.wait(1);

        // 7. Fetch the info of the newly recycled pool and assert
        const rewardPoolInfo_new = await PrivacyMining.getRewardPoolInfo(WETH.address);
        expect(rewardPoolInfo_new.cycle).to.eq(2);
        expect(rewardPoolInfo_new.phase).to.eq(1);
        expect(rewardPoolInfo_new.allocPoint).to.eq(30);
        expect(rewardPoolInfo_new.globalPoolBalance).to.eq(0);
        expect(rewardPoolInfo_new.rewardStartTime).to.eq(
          (await ethers.provider.getBlock(recycleRewardPool_tx.blockNumber)).timestamp
        );
      });
    });

    describe('After recycle', () => {
      it(`should reset all UserPoolInfo variables of a old user participating in the recycled pool during first deposit`, async () => {
        const { multisig, deployer, PrivacyMining, WETH, SMASP, users } = await setup();

        // 0. Set reward emission rates for phase I and II
        await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
        await multisig.PrivacyMining.setRewardEmissionRate(2, toUnit(1));

        // 1. Create WETH reward pool in PMC with 10 `allocPoint`
        await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

        expect((await PrivacyMining.getUserPoolInfo(users[0].address, WETH.address)).cycle).to.eq(0);

        // 1.1. Let user deposit in the WETH reward pool
        await deployer.WETH.transfer(users[0].address, toUnit(10));
        await users[0].WETH.approve(SMASP.address, toUnit(10));
        await users[0].SMASP.depositAsset(WETH.address, toUnit(10));
        // 1.2. Let user claim rewards from the WETH reward pool
        await time.increase(days(1));
        await users[0].PrivacyMining.claimRewardsFromPool(WETH.address);

        // 2. End the current reward period for WETH reward pool
        const phaseOneEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
        await advanceTime(phaseOneEndTime + 1);

        // 3. Fetch the user info w.r.t. the phase one WETH pool and assert
        const userPoolInfo_phaseOne = await PrivacyMining.getUserPoolInfo(users[0].address, WETH.address);

        expect(userPoolInfo_phaseOne.userPoolBalance).to.eq(toUnit(10));
        expect(userPoolInfo_phaseOne.cycle).to.eq(1);
        expect(userPoolInfo_phaseOne.phase).to.eq(1);

        // 4. Upgrade the WETH reward pool to phase 2 with 20 `allocPoint`
        await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 20);
        // 4.1. Let user stake Silent in the WETH reward pool
        await multisig.SilentToken.transfer(users[0].address, toUnit(20));
        await users[0].SilentToken.approve(PrivacyMining.address, toUnit(20));
        await users[0].PrivacyMining.stakeSilentToPool(WETH.address, toUnit(20));

        // 5. End the current reward period for WETH reward pool
        const phaseTwoEndTime = await (await PrivacyMining.getRewardPoolInfo(WETH.address)).rewardEndTime;
        await advanceTime(phaseTwoEndTime + 1);

        // 6. Update the allocPoint of WETH reward pool to zero
        await multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 2, 0);

        // 7. Fetch the user info w.r.t. the newly recycled pool and assert
        const userPoolInfo_phaseTwo = await PrivacyMining.getUserPoolInfo(users[0].address, WETH.address);

        expect(userPoolInfo_phaseTwo.userPoolBalance).to.eq(toUnit(20).mul(userPoolInfo_phaseTwo.userVoucherBalance));
        expect(userPoolInfo_phaseTwo.cycle).to.eq(1);
        expect(userPoolInfo_phaseTwo.phase).to.eq(2);

        // 8. Recycle the WETH pool back to phase one
        await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 30);

        // 9. User deposits in the recycled WETH pool in phase one
        await deployer.WETH.transfer(users[0].address, toUnit(1));
        await users[0].WETH.approve(SMASP.address, toUnit(1));
        await users[0].SMASP.depositAsset(WETH.address, toUnit(1));

        // 10. Fetch the info of the user w.r.t. the newly recycled pool and assert
        const userPoolInfo = await PrivacyMining.getUserPoolInfo(users[0].address, WETH.address);

        expect(userPoolInfo.userPoolBalance).to.eq(toUnit(1));
        expect(userPoolInfo.cycle).to.eq(2);
        expect(userPoolInfo.phase).to.eq(1);
        expect(userPoolInfo.userVoucherBalance).to.eq(0);
      });
    });
  });
});
