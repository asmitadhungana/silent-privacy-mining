import { ethers, network } from "hardhat";
import { toWei } from "web3-utils";
import { BigNumber } from "ethers";
import { PrivacyMining, SilentToken } from "../typechain-types";
import { getNamedAccounts, getUnnamedAccounts } from "hardhat";

const toBN = v => ethers.BigNumber.from(v.toString());
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));

const token_approve_transfer = async(_token:SilentToken, _to, _allowance: BigNumber) => {
  const tokenApproveTx  = await _token.approve(_to, _allowance);
  tokenApproveTx.wait(1);
}

export async function pmc_stakeSilentToPool() {
  const users = await getUnnamedAccounts();
  const {deployer} = await getNamedAccounts();

    const weth: SilentToken = await ethers.getContract("WETH");
    const silentToken: SilentToken = await ethers.getContract("SilentToken", deployer);
    const pmc: PrivacyMining = await ethers.getContract("PrivacyMining", deployer);

    const stakeAmount = toUnit('100');

    // Approve PMC for Silent token transfer
    await token_approve_transfer(silentToken, pmc.address, stakeAmount);

    // Stake the asset
    const stakeTx = await pmc.stakeSilentToPool(
        weth.address,
        stakeAmount
    );
    stakeTx.wait(1);

    console.log(`Staked 100 Silent tokens to PMC`);
}

pmc_stakeSilentToPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });