import { ethers, network, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { developmentChains, MIN_DELAY } from '../hardhat-helper-config';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { days } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time/duration';
import { SilentToken, PrivacyMining } from '../typechain-types';

export async function pmc_claimRewards() {
  const users = await getUnnamedAccounts();
  const { multisig, deployer } = await getNamedAccounts();

  // Fetch the deployed contract instance of reward pool to be claimed from
  // AssetId of the reward pool = pool address
  const weth = await ethers.getContract('WETH');

  // Variable caching the reward pool being claimed from and signer that is claiming
  const pool = weth;
  const signer = deployer;

  // Fetch the deployed contract instance of PMC and SilentToken contracts initializing signers for tx-based instances
  const pmc: PrivacyMining = await ethers.getContract('PrivacyMining', signer);
  const silentToken: SilentToken = await ethers.getContract('SilentToken');

  // Fetch the user (reward) balance before claiming
  // Determine the reward type (voucher or SILENT)
  let rewardType: String;
  let userRewardBalance_before: ethers.BigNumber;
  const poolPhase: Number = (await pmc.getRewardPoolInfo(pool.address)).phase;
  if (poolPhase == 1) {
    rewardType = 'Voucher';
    userRewardBalance_before = (await pmc.getUserPoolInfo(signer, pool.address)).userVoucherBalance;
  } else if (poolPhase == 2) {
    rewardType = 'SILENT token';
    userRewardBalance_before = await silentToken.balanceOf(signer);
  }

  console.log('userRewardBalance_before: ', userRewardBalance_before);

  // Move time forward by MIN_DELAY if in one of development chain
  if (developmentChains.includes(network.name)) {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp;
    await time.increaseTo(timestampBefore + days(1));
  }

  // CLAIM REWARDS FROM THE POOL
  const claimTx = await pmc.claimRewardsFromPool(pool.address);
  claimTx.wait(1);

  console.log(`Pool's accRewardPerShare in PMC is: ${(await pmc.getRewardPoolInfo(pool.address)).accRewardPerShare} `);
  console.log(`Pool's allocPoint in PMC is: ${(await pmc.getRewardPoolInfo(pool.address)).allocPoint} `);
  console.log(`Pool's globalPoolBalance in PMC is: ${(await pmc.getRewardPoolInfo(pool.address)).globalPoolBalance} `);
  console.log(`Pool's rewardEndTime in PMC is: ${(await pmc.getRewardPoolInfo(pool.address)).rewardEndTime} `);
  console.log(`Pool's lastRewardTime in PMC is: ${(await pmc.getRewardPoolInfo(pool.address)).lastRewardTime} `);
  console.log(`User's poolBalance in PMC is: ${(await pmc.getUserPoolInfo(signer, pool.address)).userPoolBalance} `);

  // Fetch the user (reward) balance after claiming
  let userRewardBalance_after: ethers.BigNumber;
  if (poolPhase == 1) {
    userRewardBalance_after = (await pmc.getUserPoolInfo(signer, pool.address)).userVoucherBalance;
  } else if (poolPhase == 2) {
    userRewardBalance_after = await silentToken.balanceOf(signer);
  }

  console.log('userRewardBalance_after: ', userRewardBalance_after);

  console.log(
    `User ${signer} successfully claimed ${userRewardBalance_after.sub(
      userRewardBalance_before
    )} ${rewardType} rewards from ${await pool.name()} pool`
  );
}

pmc_claimRewards()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
