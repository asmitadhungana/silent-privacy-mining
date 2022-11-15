import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deploySMASPContract: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, deployments, network } = hre;
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();

  log('Deploying the SMASP contract...');
  const smasp = await deploy('SMASP', {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: 0
  });

  log(`06-Deployed 'SMASP' contract at ${smasp.address} `);
};

export default deploySMASPContract;
deploySMASPContract.tags = ['all', 'smasp'];
