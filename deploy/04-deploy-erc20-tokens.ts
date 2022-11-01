import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { toWei } from 'web3-utils';
import { SilentToken } from '../typechain-types';

const toBN = (v) => ethers.BigNumber.from(v.toString());
const toUnit = (amount) => toBN(toWei(amount.toString(), 'ether'));

const deployERC20Tokens: DeployFunction = async (
  hre: HardhatRuntimeEnvironment
) => {
  const { getNamedAccounts, deployments, network } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;

  const tokens: SilentToken[] = ['weth', 'dai', 'usdc'];
  let _tokens: SilentToken[] = [];

  for (let i: number = 0; i < 3; i++) {
    log(`Deploying ${tokens[i].toUpperCase()} contract ...`);
    _tokens[i] = await deploy(tokens[i].toUpperCase(), {
      from: deployer,
      contract: 'SilentToken',
      args: [`${tokens[i]} token`, tokens[i].toUpperCase(), toUnit(1000000)],
      log: true,
      waitConfirmations: 0,
    });

    log(
      `04.${i} - Deployed ${tokens[i].toUpperCase()} token at ${
        _tokens[i].address
      }`
    );
  }
};

export default deployERC20Tokens;
deployERC20Tokens.tags = ['all', 'erc20Tokens'];
