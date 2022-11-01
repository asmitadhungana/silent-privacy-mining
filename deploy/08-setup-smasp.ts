import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { SMASP, SilentToken, PrivacyMining } from '../typechain-types';

const setupSmaspContract: DeployFunction = async (
  hre: HardhatRuntimeEnvironment
) => {
  const { getNamedAccounts, deployments, network } = hre;
  const { deploy, log } = deployments;
  const { deployer, multisig } = await getNamedAccounts();

  const pmc: PrivacyMining = await ethers.getContract(
    'PrivacyMining',
    deployer
  );
  let smasp: SMASP = await ethers.getContract('SMASP', deployer);
  const wethToken: SilentToken = await ethers.getContract('WETH', deployer);
  const daiToken: SilentToken = await ethers.getContract('DAI', deployer);
  const usdcToken: SilentToken = await ethers.getContract('USDC', deployer);

  log('Deployer: Transferring ownership of SMASP to Owmer/Multisig...');

  const transferSmaspOwnershipToMultisig = await smasp.transferOwnership(
    multisig
  );
  await transferSmaspOwnershipToMultisig.wait(1);

  // Attach the multisig as a signer to the smasp instance
  smasp = await ethers.getContract('SMASP', multisig);

  log('Multisig: Setting PMC in SMASP...');

  const setPrivacyMiningTx = await smasp.addPrivacyMiningContract(pmc.address);
  await setPrivacyMiningTx.wait(1);

  log('Multisig: Creating asset pools in SMASP...');
  const addWethAssetPoolTx = await smasp.createAssetPool(wethToken.address);
  await addWethAssetPoolTx.wait(1);

  const addDaiAssetPoolTx = await smasp.createAssetPool(daiToken.address);
  await addDaiAssetPoolTx.wait(1);

  const addUsdcAssetPoolTx = await smasp.createAssetPool(usdcToken.address);
  await addUsdcAssetPoolTx.wait(1);

  log(
    `08 - SMASP setup successful: 
    1. SMASP ownership transferred to Multisig.
    2. PMC is set in SMASP
    3. Asset pools for weth, dai and usdc have been created.
    `
  );
};

export default setupSmaspContract;
setupSmaspContract.tags = ['all', 'setupSmasp'];
setupSmaspContract.dependencies = ['erc20Tokens', 'privacyMining'];
