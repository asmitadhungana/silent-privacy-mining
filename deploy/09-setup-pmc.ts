import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { Contract } from "ethers";

const setupPmc: DeployFunction = async (
  hre: HardhatRuntimeEnvironment
) => {
    const { getNamedAccounts, deployments, network } = hre;
    const { log } = deployments;
    const { deployer, multisig } = await getNamedAccounts();
    
    const pmc: Contract  = await ethers.getContract("PrivacyMining", deployer);

    log("Transferring ownership of PMC to Owmer/Multisig...");

    const transferPmcOwnershipToMultisig = await pmc.transferOwnership( multisig );
    await transferPmcOwnershipToMultisig.wait(1);

    log(`09 - PMC setup successful: Mutisig ${ multisig } set as PMC owner`);
}; 

export default setupPmc;
setupPmc.tags = ["all", "setupPmc"];
setupPmc.dependencies = ["setupSmasp"];