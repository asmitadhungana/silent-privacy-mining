import { ethers, network, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { developmentChains, MIN_DELAY } from '../hardhat-helper-config';
import { time } from '@nomicfoundation/hardhat-network-helpers';

export async function pmc_claimRewards() {
  const users = await getUnnamedAccounts();
  const { deployer } = await getNamedAccounts();

  // Move time forward by MIN_DELAY
  if (developmentChains.includes(network.name)) {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const timestampBefore = blockBefore.timestamp;
    await time.increaseTo(timestampBefore + MIN_DELAY);
  }

  const wethAssetId = await ethers.getContract('WETH');
  const pmc = await ethers.getContract('PrivacyMining', deployer);
  const claimTx = await pmc.claimRewards(wethAssetId);
  claimTx.wait(1);

  // console.log(`Claimed rewards from ${await wethAssetId.name()}`);
}

pmc_claimRewards()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
