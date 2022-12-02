import { ethers, network } from 'hardhat';
import { getNamedAccounts } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { developmentChains } from '../hardhat-helper-config';
import { days } from '@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time/duration';

export async function pmc_addRewardPool() {
  const { multisig } = await getNamedAccounts();

  // Fetch the deployed contract instance of reward pool whose current
  // reward period is to be ended in development
  const weth = await ethers.getContract('WETH');

  // Cache reward pool instance and signer for accessibility
  const pool = weth;

  // OR
  // const weth = await get('PrivacyMining'); // using hardhat-deploy-ethers
  const pmc = await ethers.getContract('PrivacyMining');

  const rewardPoolAllocPoint = 100;
  const phase = 1;

  const rewardPeriodEndTimestamp = (await pmc.getRewardPoolInfo(weth.address)).rewardEndTime;

  // Move time forward by MIN_DELAY if in one of development chain
  if (developmentChains.includes(network.name)) {
    // const blockNumBefore = await ethers.provider.getBlockNumber();
    // const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    // const timestampBefore = blockBefore.timestamp;
    await time.increaseTo(rewardPeriodEndTimestamp);
  }

  const timestamp = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
  if (timestamp > (await pmc.getRewardPoolInfo(weth.address)).rewardEndTime) {
    console.log(`Successfully ended reward pool of pool ${await pool.name()}`);
  }
  console.log(`timestamp : ${timestamp} > ${(await pmc.getRewardPoolInfo(weth.address)).rewardEndTime}`);

  // OR
  // await execute(
  //   'PrivacyMining',
  //   { from: signer, log: true },
  //   'addRewardPool',
  //   weth.address,
  //   phase,
  //   rewardPoolAllocPoint
  // );
}

pmc_addRewardPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
