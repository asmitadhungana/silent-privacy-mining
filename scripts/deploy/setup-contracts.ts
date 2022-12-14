const hre = require('hardhat');
const { ethers } = require('hardhat');
import {
  SMASP__factory,
  SMASP,
  PrivacyMining__factory,
  PrivacyMining,
  SilentToken__factory,
  SilentToken
} from '../typechain-types';

const { weth, dai, usdc, silentToken, smasp, privacyMining } = require('../../deployedContracts.json');

// Fetch contract instances
async function helper_fetchContractInstances() {
  // Fetch the deployed instance of smasp
  const smaspContract: SMASP__factory = await hre.ethers.getContractFactory('SMASP');
  const smaspInstance: SMASP = smaspContract.attach(smasp);

  // Fetch the deployed instance of pmc
  const pmcontract: PrivacyMining__factory = await hre.ethers.getContractFactory('PrivacyMining');
  const pmcInstance: PrivacyMining = pmcontract.attach(privacyMining);

  // Fetch the deployed instance of silentToken
  const silentContract: SilentToken__factory = await hre.ethers.getContractFactory('SilentToken');
  const silentInstance: SilentToken = silentContract.attach(silentToken);

  return { smaspInstance, pmcInstance, silentInstance };
}

// Create asset pools in SMASP
async function smasp_addAssetPool(_deployer: string, _smaspInstance: SMASP, _tokenAddress: string) {
  // Call SMASP
  await _smaspInstance.connect(_deployer).createAssetPool(_tokenAddress);

  // Fetch the name of the Asset from its ERC20 Contract
  const tokenContract: SilentToken__factory = await hre.ethers.getContractFactory('SilentToken');
  const tokenInstance: SilentToken = tokenContract.attach(_tokenAddress);

  // Log the newly created asset pool name on the console
  console.log(`SMASP: Asset Pools added for ${await tokenInstance.name()}`);
}

async function helper_addAllAssetPoolsToSMASP(_deployer: string, _smaspInstance: SMASP) {
  // 1. Create Asset pool for weth token
  await smasp_addAssetPool(_deployer, _smaspInstance, weth);

  // 2. Create Asset pool for dai token
  await smasp_addAssetPool(_deployer, _smaspInstance, dai);

  // 3. Create Asset pool for usdc token
  await smasp_addAssetPool(_deployer, _smaspInstance, usdc);
}

// Add PMC to SMASP
async function smasp_addPrivacyMiningContract(_deployer: string, _smaspInstance: SMASP) {
  await _smaspInstance.connect(_deployer).addPrivacyMiningContract(privacyMining);
  console.log('SMASP: PMC added...');
}

export const setup = async () => {
  const [deployer, assetOwner1, assetOwner2] = await ethers.getSigners();

  const { smaspInstance, pmcInstance, silentInstance } = await helper_fetchContractInstances();

  // // ADD PMC to SMASP
  await smasp_addPrivacyMiningContract(deployer, smaspInstance);
  console.log(`PMC in SMASP: `, await smaspInstance.privacyMiningContract());

  // // Create 3 asset pools for WETH, DAI and USDC in SMASP
  await helper_addAllAssetPoolsToSMASP(deployer, smaspInstance);

  return { smaspInstance, pmcInstance, silentInstance };
};

setup().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
