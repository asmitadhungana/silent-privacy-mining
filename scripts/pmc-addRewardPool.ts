import { ethers } from 'hardhat';
import { getNamedAccounts } from 'hardhat';
const { execute, get } = deployments;

export async function pmc_addRewardPool() {
  const { multisig } = await getNamedAccounts();

  // Fetch the deployed instance of reward pool to add/upgrade in PMC
  const weth = await ethers.getContract('WETH');
  // OR
  // const weth = await get('PrivacyMining'); // using hardhat-deploy-ethers

  // Cache reward pool instance and signer for accessibility
  const pool = weth;
  const signer = multisig;

  // Fetch the deployed instance of privacy mining contract
  const pmc = await ethers.getContract('PrivacyMining', signer);

  // Determine the phase to add/upgrade the reward pool to and allocPoint for it
  const phase = 1;
  const rewardPoolAllocPoint = 100;

  // Make sure to massUpdate all the pools in PMC beforehand
  // Fetch all reward pools in PMC and add them to the array assetIdsToUpdate
  // let assetIdsToUpdate: ethers.BigNumber[];
  // await pmc.massUpdatePoolRewardVariables(assetIdsToUpdate);

  // Add/Upgrade the reward pool to given phase with provided allocPoint in PMC
  const addRewardPoolTx = await pmc.addRewardPool(pool.address, phase, rewardPoolAllocPoint + 100);
  await addRewardPoolTx.wait(1);

  // OR
  // await execute(
  //   'PrivacyMining',
  //   { from: signer, log: true },
  //   'addRewardPool',
  //   pool.address,
  //   phase,
  //   rewardPoolAllocPoint
  // );

  console.log(`Successfully added ${await pool.name()} reward pool  to pmc`);
}

pmc_addRewardPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
