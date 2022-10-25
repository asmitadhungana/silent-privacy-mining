import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { MIN_DELAY, PROPOSERS, EXECUTORS } from "../hardhat-helper-config";

const deployTimelock: DeployFunction = async(hre:HardhatRuntimeEnvironment) => {
    const { getNamedAccounts, deployments } = hre;
    const { deployer } = await getNamedAccounts();
    const { deploy, log } = deployments;

    log("Deploying Timelock contract...");
    const timelock = await deploy("TimeLock", {
        from: deployer,
        args: [MIN_DELAY, PROPOSERS, EXECUTORS],
        log: true,
        autoMine: true
    });

    log(`02 - Deployed 'Timelock' contract at ${timelock.address}`);
};

// deployTimelock.id = 'deploy_timelock';
deployTimelock.tags = ["timelock"];
export default deployTimelock;
