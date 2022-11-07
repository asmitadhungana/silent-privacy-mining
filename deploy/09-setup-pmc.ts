import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { SilentToken, PrivacyMining } from '../typechain-types';

const setupPmc: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, deployments, network } = hre;
  const { log } = deployments;
  const { deployer, multisig } = await getNamedAccounts();

  const pmc: PrivacyMining = await ethers.getContract(
    'PrivacyMining',
    deployer
  );
  const silentToken: SilentToken = await ethers.getContract(
    'SilentToken',
    deployer
  );

  log('Transferring ownership of PMC to Owmer/Multisig...');

  const transferPmcOwnershipToMultisig = await pmc.transferOwnership(multisig);
  await transferPmcOwnershipToMultisig.wait(1);

  log(`09.1 - PMC setup successful: Mutisig ${multisig} set as PMC owner`);

  log(
    'Transferring half of Silent tokens from the initial deployer to multisig...'
  );
  const silentTotalSupply = await silentToken.totalSupply();
  await silentToken.transfer(multisig, silentTotalSupply.div(2));
  log(`09.2 - PMC setup successful: Mutisig ${multisig} set as PMC owner`);
};

export default setupPmc;
setupPmc.tags = ['all', 'setupPmc'];
setupPmc.dependencies = ['setupSmasp'];
