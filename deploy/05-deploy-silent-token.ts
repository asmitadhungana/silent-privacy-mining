import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
const {toWei} = require('web3-utils');

const toBN = v => ethers.BigNumber.from(v.toString());
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const deploySilentToken: DeployFunction = async(hre:HardhatRuntimeEnvironment) => {
    const { getNamedAccounts, deployments ,network } = hre;
    const { deployer } = await getNamedAccounts();
    const { deploy, log } = deployments;

    log("Deploying SilentToken...");
    const silentToken = await deploy("SilentToken", {
        from: deployer,
        args: ["Silent Token", "SILENT", toUnit(1000000)],
        log: true,
        waitConfirmations: 0
    });

    log(`05 - Deployed 'SilentToken' at ${silentToken.address}`);
};

export default deploySilentToken;
deploySilentToken.tags = ["all", "silentToken"];
