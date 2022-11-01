import { ethers } from 'hardhat';
import { getNamedAccounts } from 'hardhat';
// const {execute, get} = deployments;

export async function pmc_addRewardPool() {
  const { multisig } = await getNamedAccounts();

  const weth = await ethers.getContract('WETH');
  // OR
  // const weth = await get("WETH"); // using hardhat-deploy-ethers
  const pmc = await ethers.getContract('PrivacyMining', multisig);

  const rewardPoolAllocPoint = 100;
  const phase = 2;

  const addRewardPoolTx = await pmc.addRewardPool(
    weth.address,
    phase,
    rewardPoolAllocPoint + 100
  );
  await addRewardPoolTx.wait(1);

  // OR
  // await execute('PrivacyMining', {from: multisig, log: true}, 'addRewardPool', weth.address, phase, rewardPoolAllocPoint);

  console.log('Successfully added reward pool to pmc');
}

pmc_addRewardPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
