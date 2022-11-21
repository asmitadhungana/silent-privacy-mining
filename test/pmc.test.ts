// /* eslint-disable node/no-missing-import */
// /* eslint-disable camelcase */
// /* eslint-disable node/no-unpublished-import */
// import { expect, assert } from './chai-setup';
// import { BigNumber, constants, utils } from 'ethers';
// import { time } from '@nomicfoundation/hardhat-network-helpers';
// import { anyUint, anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
// import { ethers, deployments, getUnnamedAccounts, getNamedAccounts } from 'hardhat';
// import { SMASP, PrivacyMining, SilentToken } from '../typechain-types';
// import { advanceTime, setupUser, setupUsers, toBN, toUnit, advanceBlockTo, fromUnit } from './utils';
// import snapshotGasCost from '@uniswap/snapshot-gas-cost';

// const setup = deployments.createFixture(async () => {
//   await deployments.fixture('all');
//   const { deployer, multisig } = await getNamedAccounts();
//   const contracts = {
//     PrivacyMining: <PrivacyMining>await ethers.getContract('PrivacyMining'),
//     SMASP: <SMASP>await ethers.getContract('SMASP'),
//     WETH: <SilentToken>await ethers.getContract('WETH'),
//     DAI: <SilentToken>await ethers.getContract('DAI'),
//     SilentToken: <SilentToken>await ethers.getContract('SilentToken')
//   };
//   const users = await setupUsers(await getUnnamedAccounts(), contracts);
//   return {
//     ...contracts,
//     users,
//     multisig: await setupUser(multisig, contracts),
//     deployer: await setupUser(deployer, contracts)
//   };
// });

// describe('PrivacyMining', () => {
//   interface SetupVars {
//     users: any;
//     SMASP: SMASP;
//     WETH: SilentToken;
//     PrivacyMining: PrivacyMining;
//     SilentToken: SilentToken;
//     [propName: string]: any;
//   }

//   describe('addRewardPool', () => {
//     it('emits `LogRewardPoolAdded` event', async () => {
//       const { multisig, PrivacyMining, WETH } = await setup();
//       await expect(multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100))
//         .to.emit(PrivacyMining, 'LogRewardPoolAdded')
//         .withArgs(WETH.address, 1, 100);
//     });

//     it("Should revert if reward pool doesn't exist in SMASP", async () => {
//       const { multisig, PrivacyMining } = await setup();
//       await expect(multisig.PrivacyMining.addRewardPool(1, 1, 100)).to.be.revertedWith(
//         PrivacyMining,
//         'Invalid _assetId'
//       );
//     });

//     it('Should revert if argument `_phase` is not 1 or 2', async () => {
//       const { multisig, PrivacyMining } = await setup();
//       await expect(multisig.PrivacyMining.addRewardPool(1, 3, 100)).to.be.reverted;
//       await expect(multisig.PrivacyMining.addRewardPool(1, 0, 100)).to.be.revertedWith(
//         'Arithmetic operation underflowed or overflowed outside of an unchecked block'
//       );
//     });

//     it('Should set the variables for the `RewardPool` struct', async () => {
//       const { multisig, PrivacyMining, WETH } = await setup();
//       const addRewardPool_tx = await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100);
//       await addRewardPool_tx.wait(1);

//       const timestamp1 = (await ethers.provider.getBlock(addRewardPool_tx.blockNumber)).timestamp;

//       const wethRewardPool = await PrivacyMining.rewardPoolInfo(WETH.address);

//       expect(wethRewardPool.phase).to.eq(1);
//       expect(wethRewardPool.lastRewardTime).to.eq(timestamp1);
//       expect(wethRewardPool.allocPoint).to.eq(100);
//       expect(wethRewardPool.accRewardPerShare).to.eq(0);
//       expect(wethRewardPool.globalPoolBalance).to.eq(0);
//     });

//     it('Should increment the totalAllocPoint for the corresponding phase', async () => {
//       const { multisig, PrivacyMining, WETH } = await setup();
//       const addRewardPool_tx = await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 100);
//       await addRewardPool_tx.wait(1);

//       expect(await PrivacyMining.phaseToTotalAllocPoint(1)).to.eq(100);
//     });

//     it('Gas snapshot for `addRewardPool` function', async () => {
//       const { multisig, PrivacyMining, WETH } = await setup();
//       await snapshotGasCost(multisig.PrivacyMining.estimateGas.addRewardPool(WETH.address, 1, 100));
//     });
//   });

//   describe('depositAssetToPool', () => {
//     let _: SetupVars;

//     beforeEach(async () => {
//       const { deployer, multisig, PrivacyMining, SMASP, WETH, users } = await setup();

//       await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

//       const depositAmount = toUnit(1);

//       await deployer.WETH.transfer(users[0].address, depositAmount);
//       await users[0].WETH.approve(SMASP.address, depositAmount);

//       _ = {
//         users,
//         SMASP,
//         WETH,
//         PrivacyMining,
//         depositAmount,
//         multisig
//       };
//     });

//     it('emits `LogDepositToPool` event', async () => {
//       await expect(_.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount))
//         .to.emit(_.PrivacyMining, 'LogDepositToPool')
//         .withArgs(_.users[0].address, _.WETH.address, _.depositAmount);
//     });

//     it('should set/change the variables for `UserPoolInfo` struct', async () => {
//       await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);

//       const userPoolInfo = await _.PrivacyMining.userPoolInfo(_.users[0].address, _.WETH.address);

//       expect(userPoolInfo.userPoolBalance).to.eq(_.depositAmount);
//       expect(userPoolInfo.phase).to.eq(1);
//       expect(userPoolInfo.userVoucherBalance).to.eq(0);
//     });

//     it('Gas snapshot for `depositAssetToPool` function', async () => {
//       await snapshotGasCost(_.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount));
//     });
//   });

//   describe('getPendingRewards', function () {
//     let _: SetupVars;

//     beforeEach(async () => {
//       const { deployer, multisig, PrivacyMining, SMASP, WETH, users } = await setup();

//       await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

//       const depositAmount = toUnit(1);

//       await deployer.WETH.transfer(users[0].address, depositAmount);
//       _ = {
//         users,
//         SMASP,
//         WETH,
//         PrivacyMining,
//         depositAmount
//       };
//     });

//     it('PendingReward should equal ExpectedReward', async () => {
//       await _.users[0].WETH.approve(_.SMASP.address, _.depositAmount);

//       const log1 = await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);
//       await log1.wait();

//       await advanceTime(86400);

//       const log2 = await _.PrivacyMining.updatePoolRewardVariables(_.WETH.address);

//       const timestamp2 = (await ethers.provider.getBlock(log2.blockNumber)).timestamp;
//       const timestamp1 = (await ethers.provider.getBlock(log1.blockNumber)).timestamp;

//       const expectedRewards = toUnit(1).mul(timestamp2 - timestamp1);

//       const pendingRewards = await _.PrivacyMining.getPendingRewards(_.WETH.address, _.users[0].address);

//       // console.log('timestamp2', timestamp2, 'timestamp', timestamp1);
//       // console.log('expectedRewards: ', parseInt(expectedRewards.toString()));
//       // console.log('pendingRewards: ', parseInt(pendingRewards.toString()));

//       expect(pendingRewards).to.be.equal(expectedRewards);
//     });

//     it('When time is lastRewardTime', async function () {
//       await _.users[0].WETH.approve(_.SMASP.address, _.depositAmount);

//       const log1 = await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);

//       await advanceBlockTo(3);

//       const log2 = await _.PrivacyMining.updatePoolRewardVariables(_.WETH.address);

//       const timestamp2 = (await ethers.provider.getBlock(log2.blockNumber)).timestamp;
//       const timestamp1 = (await ethers.provider.getBlock(log1.blockNumber)).timestamp;

//       const expectedRewards = BigNumber.from(toUnit(1).toString()).mul(timestamp2 - timestamp1);

//       const pendingRewards = await _.PrivacyMining.getPendingRewards(_.WETH.address, _.users[0].address);

//       expect(pendingRewards).to.be.equal(expectedRewards);
//     });

//     it('Gas snapshot for `getPendingRewards` function', async () => {
//       await _.users[0].WETH.approve(_.SMASP.address, _.depositAmount);

//       const log1 = await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);
//       await log1.wait();

//       await advanceTime(86400);

//       await snapshotGasCost(_.PrivacyMining.getPendingRewards(_.WETH.address, _.users[0].address));
//     });
//   });

//   describe('updatePoolRewardVariables', () => {
//     let _: SetupVars;

//     beforeEach(async () => {
//       const { deployer, multisig, PrivacyMining, SMASP, WETH, users } = await setup();

//       await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

//       const depositAmount = toUnit(1);

//       await deployer.WETH.transfer(users[0].address, depositAmount);
//       await users[0].WETH.approve(SMASP.address, depositAmount);

//       _ = {
//         users,
//         SMASP,
//         WETH,
//         PrivacyMining,
//         depositAmount
//       };
//     });

//     it('Should emit event `LogUpdatePoolRewards`', async function () {
//       await advanceBlockTo(1);
//       await expect(_.PrivacyMining.updatePoolRewardVariables(_.WETH.address))
//         .to.emit(_.PrivacyMining, 'LogUpdatePoolRewards')
//         .withArgs(
//           _.WETH.address,
//           (
//             await _.PrivacyMining.rewardPoolInfo(_.WETH.address)
//           ).lastRewardTime,
//           (
//             await _.PrivacyMining.rewardPoolInfo(_.WETH.address)
//           ).globalPoolBalance,
//           (
//             await _.PrivacyMining.rewardPoolInfo(_.WETH.address)
//           ).accRewardPerShare
//         );
//     });

//     it('Should take else path', async function () {
//       // Use Multicall here
//     });

//     it('Gas snapshot for `updatePoolRewardVariables` function', async () => {
//       await advanceBlockTo(1);

//       await snapshotGasCost(_.PrivacyMining.updatePoolRewardVariables(_.WETH.address));
//     });
//   });

//   describe('claimRewards: [Phase I]', () => {
//     let _: SetupVars;

//     beforeEach(async () => {
//       const { deployer, multisig, PrivacyMining, SMASP, WETH, users } = await setup();

//       await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

//       const depositAmount = toUnit(1);

//       await deployer.WETH.transfer(users[0].address, depositAmount.mul(2));
//       await users[0].WETH.approve(SMASP.address, depositAmount.mul(2));

//       _ = {
//         users,
//         SMASP,
//         WETH,
//         PrivacyMining,
//         depositAmount
//       };
//     });

//     it(`should reward users with correct amount of vouchers`, async () => {
//       const log1 = await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);
//       await advanceTime(86400);

//       const log2 = await _.users[0].PrivacyMining.claimRewardsFromPool(_.WETH.address);

//       const timestamp2 = (await ethers.provider.getBlock(log2.blockNumber)).timestamp;
//       const timestamp1 = (await ethers.provider.getBlock(log1.blockNumber)).timestamp;

//       const expectedRewards = toUnit(1).mul(timestamp2 - timestamp1);

//       expect((await _.PrivacyMining.userPoolInfo(_.users[0].address, _.WETH.address)).rewardDebt).to.eq(
//         expectedRewards
//       );
//     });

//     it('Gas snapshot for `claimRewards` function [phase=1]', async () => {
//       await _.users[0].SMASP.depositAsset(_.WETH.address, _.depositAmount);

//       await time.increase(86400);
//       await snapshotGasCost(_.users[0].PrivacyMining.claimRewardsFromPool(_.WETH.address));
//     });
//   });

//   describe('stakeSilentToPool', () => {
//     let _: SetupVars;

//     beforeEach(async () => {
//       const { deployer, multisig, PrivacyMining, SMASP, WETH, SilentToken, users } = await setup();

//       await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

//       const depositAmount = toUnit(1);

//       await deployer.WETH.transfer(users[0].address, depositAmount.mul(2));
//       await users[0].WETH.approve(SMASP.address, depositAmount.mul(2));

//       await users[0].SMASP.depositAsset(WETH.address, depositAmount);

//       await time.increase(86400);

//       await users[0].PrivacyMining.claimRewardsFromPool(WETH.address);

//       // console.log(
//       //   'userVoucherBalance :' +
//       //     (await PrivacyMining.userPoolInfo(users[0].address, WETH.address))
//       //       .userVoucherBalance
//       // );

//       await multisig.PrivacyMining.setRewardEmissionRate(2, toUnit(1));
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 10);

//       await multisig.SilentToken.transfer(users[0].address, depositAmount);
//       await users[0].SilentToken.approve(PrivacyMining.address, depositAmount);

//       _ = {
//         users,
//         multisig,
//         SMASP,
//         WETH,
//         PrivacyMining,
//         SilentToken,
//         depositAmount
//       };
//     });

//     it(`should revert if user didn't participate in phase 1 of rewardPool`, async () => {
//       await expect(_.users[1].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount)).to.be.reverted;
//     });

//     it(`should revert if reward pool is not in phase 1`, async () => {
//       // Try to stake to SilentToken pool which has phase 0
//       await expect(_.users[1].PrivacyMining.stakeSilentToPool(_.SilentToken.address, _.depositAmount)).to.be.reverted;
//     });

//     it(`should transfer staked amount from user to PMC`, async () => {
//       expect(await _.SilentToken.balanceOf(_.PrivacyMining.address)).to.eq(0);
//       await _.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount);

//       expect(await _.SilentToken.balanceOf(_.PrivacyMining.address)).to.eq(_.depositAmount);
//     });

//     it(`should emit event \`LogSilentStakedToPool\``, async () => {
//       await expect(_.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount))
//         .to.emit(_.PrivacyMining, 'LogSilentStakedToPool')
//         .withArgs(_.users[0].address, _.WETH.address, _.depositAmount);
//     });

//     it(`should change the \`globalPoolBalance\` in struct \`RewardPool\``, async () => {
//       const rewardPoolInfo_before = await _.PrivacyMining.rewardPoolInfo(_.WETH.address);
//       expect(rewardPoolInfo_before.globalPoolBalance).to.eq(0);
//       await _.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount);

//       const rewardPoolInfo_after = await _.PrivacyMining.rewardPoolInfo(_.WETH.address);

//       const userPoolVoucherBalance = (await _.PrivacyMining.userPoolInfo(_.users[0].address, _.WETH.address))
//         .userVoucherBalance;

//       expect(rewardPoolInfo_after.globalPoolBalance).to.eq(
//         rewardPoolInfo_before.globalPoolBalance.add(_.depositAmount).mul(userPoolVoucherBalance)
//       );
//     });

//     it(`should change respective variables in struct \`UserPoolInfo\``, async () => {
//       await _.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount);

//       const userPoolInfo = await _.PrivacyMining.userPoolInfo(_.users[0].address, _.WETH.address);

//       const userPoolVoucherBalance = (await _.PrivacyMining.userPoolInfo(_.users[0].address, _.WETH.address))
//         .userVoucherBalance;

//       expect(userPoolInfo.userPoolBalance).to.eq(_.depositAmount.mul(userPoolVoucherBalance));
//       expect(userPoolInfo.phase).to.eq(2);
//     });

//     it('Gas snapshot for `stakeSilentToPool` function', async () => {
//       await snapshotGasCost(_.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount));
//     });
//   });

//   describe('unstakeSilentFromPool', () => {
//     let _: SetupVars;

//     beforeEach(async () => {
//       const { deployer, multisig, PrivacyMining, SMASP, WETH, SilentToken, users } = await setup();

//       await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

//       const depositAmount = toUnit(1);

//       await deployer.WETH.transfer(users[0].address, depositAmount.mul(2));
//       await users[0].WETH.approve(SMASP.address, depositAmount.mul(2));

//       await users[0].SMASP.depositAsset(WETH.address, depositAmount);

//       await time.increase(86400);

//       await users[0].PrivacyMining.claimRewardsFromPool(WETH.address);

//       // console.log(
//       //   'userVoucherBalance :' +
//       //     (await PrivacyMining.userPoolInfo(users[0].address, WETH.address))
//       //       .userVoucherBalance
//       // );

//       await multisig.PrivacyMining.setRewardEmissionRate(2, toUnit(1));
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 10);

//       await multisig.SilentToken.transfer(users[0].address, depositAmount);
//       await users[0].SilentToken.approve(PrivacyMining.address, depositAmount);

//       await users[0].PrivacyMining.stakeSilentToPool(WETH.address, depositAmount);

//       _ = {
//         users,
//         multisig,
//         SMASP,
//         WETH,
//         PrivacyMining,
//         SilentToken,
//         depositAmount
//       };
//     });

//     it(`should revert if user is unstaking more than staked SILENT`, async () => {
//       await expect(_.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount.add(1))).to.be
//         .reverted;
//     });

//     it(`should revert if reward pool is not in phase 2`, async () => {
//       await expect(_.users[0].PrivacyMining.unstakeSilentFromPool(_.SilentToken.address, _.depositAmount)).to.be
//         .reverted;
//     });

//     it(`should transfer unstaked amount from PMC to user`, async () => {
//       const pmcSilentBalance_before = await _.SilentToken.balanceOf(_.PrivacyMining.address);
//       const userSilentBalance_before = await _.SilentToken.balanceOf(_.users[0].address);

//       await _.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount);

//       const pmcSilentBalance_after = await _.SilentToken.balanceOf(_.PrivacyMining.address);

//       const userSilentBalance_after = await _.SilentToken.balanceOf(_.users[0].address);

//       expect(pmcSilentBalance_after).to.eq(pmcSilentBalance_before.sub(_.depositAmount));
//       expect(userSilentBalance_after).to.eq(userSilentBalance_before.add(_.depositAmount));
//     });

//     it(`should emit event \`LogSilentUnStakedFromPool\``, async () => {
//       await expect(_.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount))
//         .to.emit(_.PrivacyMining, 'LogSilentUnstakedFromPool')
//         .withArgs(_.users[0].address, _.WETH.address, _.depositAmount);
//     });

//     it(`should decrease the \`globalPoolBalance\` of \`RewardPool\``, async () => {
//       const userVoucherBalance = (await _.PrivacyMining.userPoolInfo(_.users[0].address, _.WETH.address))
//         .userVoucherBalance;

//       const rewardPoolInfo_before = await _.PrivacyMining.rewardPoolInfo(_.WETH.address);

//       await _.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount);

//       const rewardPoolInfo_after = await _.PrivacyMining.rewardPoolInfo(_.WETH.address);

//       expect(rewardPoolInfo_after.globalPoolBalance).to.eq(
//         rewardPoolInfo_before.globalPoolBalance.sub(_.depositAmount.mul(userVoucherBalance))
//       );
//     });

//     it(`should decrease \`userPoolBalance\` of \`UserPoolInfo\``, async () => {
//       const userPoolInfo_before = await _.PrivacyMining.userPoolInfo(_.users[0].address, _.WETH.address);

//       await _.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount);

//       const userPoolInfo_after = await _.PrivacyMining.userPoolInfo(_.users[0].address, _.WETH.address);

//       expect(userPoolInfo_after.userPoolBalance).to.eq(
//         userPoolInfo_before.userPoolBalance.sub(_.depositAmount.mul(userPoolInfo_before.userVoucherBalance))
//       );
//     });

//     it('Gas snapshot for `unstakeSilentFromPool` function', async () => {
//       await snapshotGasCost(_.users[0].PrivacyMining.unstakeSilentFromPool(_.WETH.address, _.depositAmount));
//     });
//   });

//   describe('claimRewards: [Phase II]', () => {
//     let _: SetupVars;

//     beforeEach(async () => {
//       const { deployer, multisig, PrivacyMining, SMASP, WETH, SilentToken, users } = await setup();

//       await multisig.PrivacyMining.setRewardEmissionRate(1, toUnit(1));
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);

//       // USER: Deposits WETH in its reward pool in phase 1

//       const depositAmount = toUnit(1);

//       await deployer.WETH.transfer(users[0].address, depositAmount.mul(2));
//       await users[0].WETH.approve(SMASP.address, depositAmount.mul(2));

//       await users[0].SMASP.depositAsset(WETH.address, depositAmount);

//       // USER: Claims Voucher Rewards from WETH pool in phase 1

//       await time.increase(86400);

//       await users[0].PrivacyMining.claimRewardsFromPool(WETH.address);

//       // Owner: Upgrades WETH reward pool to phase 2

//       await multisig.PrivacyMining.setRewardEmissionRate(2, toUnit(1));
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 2, 10);

//       // Owner: Transfers Silent Tokens to PMC for rewards distribution for 5 days
//       await multisig.SilentToken.transfer(PrivacyMining.address, toUnit(1).mul(86400).mul(5));

//       // USER: Stakes SILENT in WETH reward pool in phase 2

//       await multisig.SilentToken.transfer(users[0].address, depositAmount);
//       await users[0].SilentToken.approve(PrivacyMining.address, depositAmount);

//       _ = {
//         users,
//         multisig,
//         SMASP,
//         WETH,
//         PrivacyMining,
//         SilentToken,
//         depositAmount
//       };
//     });

//     it(`should transfer correct amount of SILENT tokens as rewards to user`, async () => {
//       const log1 = await _.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount);

//       const userSilentBalance_before = await _.users[0].SilentToken.balanceOf(_.users[0].address);

//       await advanceTime(86400);

//       const log2 = await _.PrivacyMining.updatePoolRewardVariables(_.WETH.address);
//       const rewardPool = await _.PrivacyMining.rewardPoolInfo(_.WETH.address);
//       const userPoolInfo = await _.PrivacyMining.userPoolInfo(_.users[0].address, _.WETH.address);

//       const pendingRewards = await _.PrivacyMining.getPendingRewards(_.WETH.address, _.users[0].address);
//       // const log2 = await _.users[0].PrivacyMining.claimRewardsFromPool(
//       //   _.WETH.address
//       // );

//       const userSilentBalance_after = await _.users[0].SilentToken.balanceOf(_.users[0].address);

//       const timestamp1 = (await ethers.provider.getBlock(log1.blockNumber)).timestamp;
//       const timestamp2 = (await ethers.provider.getBlock(log2.blockNumber)).timestamp;

//       const expectedRewards = toUnit(1).mul(timestamp2 - timestamp1);

//       const claimedRewards = userSilentBalance_after.sub(userSilentBalance_before);

//       expect(claimedRewards).to.be.equal(expectedRewards);
//     });

//     it('Gas snapshot for `claimRewardsForPool` function [Phase II]', async () => {
//       const log1 = await _.users[0].PrivacyMining.stakeSilentToPool(_.WETH.address, _.depositAmount);
//       await advanceTime(86400);

//       await snapshotGasCost(_.users[0].PrivacyMining.claimRewardsFromPool(_.WETH.address));
//     });
//   });

//   describe('massUpdatePoolRewardVariables', function () {
//     it('Should call updatePoolRewardVariables', async function () {
//       const { multisig, PrivacyMining, WETH } = await setup();

//       await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 10);
//       await advanceBlockTo(1);
//       await expect(multisig.PrivacyMining.massUpdatePoolRewardVariables([WETH.address], 1))
//         .to.emit(PrivacyMining, 'LogUpdatePoolRewards')
//         .withArgs(WETH.address, anyUint, anyUint, anyUint);
//     });

//     it('Updating invalid pools should fail', async function () {
//       const { multisig, PrivacyMining, WETH } = await setup();
//       await expect(
//         multisig.PrivacyMining.massUpdatePoolRewardVariables([WETH.address], 1)
//       ).to.be.revertedWithCustomError(PrivacyMining, 'InvalidPhase');
//     });
//   });

//   describe('updateRewardPoolAllocations', () => {
//     it('should update the pool allocations of the target pool', async () => {
//       const { multisig, PrivacyMining, WETH } = await setup();

//       const old_allocPoint = 10;
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 1, old_allocPoint);
//       await advanceBlockTo(1);

//       expect((await PrivacyMining.rewardPoolInfo(WETH.address)).allocPoint).to.equal(old_allocPoint);

//       const new_allocPoint = 100;
//       await multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 1, new_allocPoint);

//       expect((await PrivacyMining.rewardPoolInfo(WETH.address)).allocPoint).to.equal(new_allocPoint);
//     });

//     it('should update the reward shares of all other reward pools in the same phase', async () => {
//       const { multisig, PrivacyMining, WETH, DAI } = await setup();

//       // Add WETH Reward Pool to PMC
//       await multisig.PrivacyMining.addRewardPool(WETH.address, 1, 60);

//       // Add DAI Reward Pool to PMC
//       await multisig.PrivacyMining.addRewardPool(DAI.address, 1, 40);

//       // Expect rewardShare of WETH pool to be 60% and DAI to be 40% of total share for the phase

//       const phaseOne_oldTotalAllocPoint = parseInt(await PrivacyMining.phaseToTotalAllocPoint(1));
//       const weth_oldPoolInfo = await PrivacyMining.rewardPoolInfo(WETH.address);
//       const weth_oldRewardShare = parseInt(weth_oldPoolInfo.allocPoint) / phaseOne_oldTotalAllocPoint;

//       const dai_oldPoolInfo = await PrivacyMining.rewardPoolInfo(DAI.address);
//       const dai_oldRewardShare = parseInt(dai_oldPoolInfo.allocPoint) / phaseOne_oldTotalAllocPoint;

//       expect(weth_oldRewardShare).to.equal(0.6);
//       expect(dai_oldRewardShare).to.equal(0.4);

//       await advanceBlockTo(1);

//       // UPDATE WETH ALLOCPOINT TO BE SAME AS DAI POOL'S ALLOCPOINT

//       await multisig.PrivacyMining.updateRewardPoolAllocations(WETH.address, 1, 40);

//       const phaseOne_newTotalAllocPoint = parseInt(await PrivacyMining.phaseToTotalAllocPoint(1));
//       const weth_newPoolInfo = await PrivacyMining.rewardPoolInfo(WETH.address);
//       const weth_newRewardShare = parseInt(weth_newPoolInfo.allocPoint) / phaseOne_newTotalAllocPoint;

//       const dai_newPoolInfo = await PrivacyMining.rewardPoolInfo(DAI.address);
//       const dai_newRewardShare = parseInt(dai_newPoolInfo.allocPoint) / phaseOne_newTotalAllocPoint;

//       // Expect rewardShare of WETH pool and DAI pool both to be 50% of total share for the phase
//       expect(weth_newRewardShare).to.equal(0.5);
//       expect(dai_newRewardShare).to.equal(0.5);
//     });
//   });

//   describe('security', () => {
//     it(`shouldn't emit rewards when the emission rate is 0`);
//     it(`shouldn't ever reward more than correct amount`);
//   });
// });
