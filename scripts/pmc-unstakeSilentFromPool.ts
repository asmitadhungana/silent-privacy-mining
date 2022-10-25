import { ethers, network, getNamedAccounts, getUnnamedAccounts } from "hardhat";
import { toWei } from "web3-utils";
import { PrivacyMining, SilentToken } from "../typechain-types";

const toBN = v => ethers.BigNumber.from(v.toString());
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

export async function pmc_unstakeSilentFromPool() {
  const users = await getUnnamedAccounts();
  const {deployer} = await getNamedAccounts();

    const weth: SilentToken = await ethers.getContract("WETH");
    const pmc: PrivacyMining = await ethers.getContract("PrivacyMining", deployer);
    const unstakeAmount = toUnit('100');

    // Stake the asset
    const unstakeTx = await pmc.unstakeSilentFromPool(
      weth.address,
      unstakeAmount
    );
    unstakeTx.wait(1);

    console.log(`Untaked 100 Silent tokens from PMC`);
}

// Provide the value from console later...
pmc_unstakeSilentFromPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });