import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { Contract } from "ethers";

const setupSmaspContract: DeployFunction = async (
  hre: HardhatRuntimeEnvironment
) => {
  const { getNamedAccounts, deployments, network } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const pmc: Contract  = await ethers.getContract("PrivacyMining", deployer);
  const smasp: Contract  = await ethers.getContract("SMASP", deployer);
  const wethToken: Contract = await ethers.getContract("WETH", deployer);
  const daiToken: Contract  = await ethers.getContract("DAI", deployer);
  const usdcToken: Contract  = await ethers.getContract("USDC", deployer);

  log("Setting PMC in SMASP...");

  const setPrivacyMiningTx = await smasp.addPrivacyMiningContract(pmc.address);
  await setPrivacyMiningTx.wait(1);

  log("Creating asset pools in SMASP...");
  const addWethAssetPoolTx = await smasp.createAssetPool(wethToken.address);
  await addWethAssetPoolTx.wait(1);

  const addDaiAssetPoolTx = await smasp.createAssetPool(daiToken.address);
  await addDaiAssetPoolTx.wait(1);

  const addUsdcAssetPoolTx = await smasp.createAssetPool(usdcToken.address);
  await addUsdcAssetPoolTx.wait(1);

  log("08 - SMASP setup successful: PMC is set and Asset pools for weth, dai and usdc have been created.");
};

export default setupSmaspContract;
setupSmaspContract.tags = ["all", "setupSmasp"];
setupSmaspContract.dependencies = ['erc20Tokens', "privacyMining"];