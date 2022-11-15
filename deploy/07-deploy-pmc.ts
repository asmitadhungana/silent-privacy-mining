import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployPMC: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, deployments, network } = hre;
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const silentToken = await get('SilentToken');
  const smasp = await get('SMASP');

  log('Deploying the PrivacyMining contract...');
  const pmc = await deploy('PrivacyMining', {
    from: deployer,
    args: [silentToken.address, smasp.address],
    log: true,
    waitConfirmations: 0
  });

  log(`07-Deployed 'PMC' at ${pmc.address} `);
};

export default deployPMC;
deployPMC.tags = ['all', 'privacyMining'];
deployPMC.dependencies = ['silentToken', 'smasp'];
