import { ethers, network } from 'hardhat';
import { toWei } from 'web3-utils';
import { BigNumber } from 'ethers';
import { PrivacyMining, SilentToken } from '../typechain-types';
import { getNamedAccounts, getUnnamedAccounts } from 'hardhat';

const toBN = (v) => ethers.BigNumber.from(v.toString());
const toUnit = (amount) => toBN(toWei(amount.toString(), 'ether'));

const token_approve_transfer = async (_token: SilentToken, _to, _allowance: BigNumber) => {
  const tokenApproveTx = await _token.approve(_to, _allowance);
  tokenApproveTx.wait(1);
};

export async function pmc_stakeSilentToPool() {
  const users = await getUnnamedAccounts();
  const { deployer } = await getNamedAccounts();

  const weth: SilentToken = await ethers.getContract('WETH');

  // Cache reward pool instance and signer for accessibility
  const pool = weth;
  const signer = deployer;

  const silentToken: SilentToken = await ethers.getContract('SilentToken', signer);
  const pmc: PrivacyMining = await ethers.getContract('PrivacyMining', signer);

  const stakeAmount = toUnit('100');

  // Approve PMC for Silent token transfer
  await token_approve_transfer(silentToken, pmc.address, stakeAmount);

  // Stake the asset
  const stakeTx = await pmc.stakeSilentToPool(pool.address, stakeAmount);
  stakeTx.wait(1);

  console.log(`User ${signer} staked ${stakeAmount} Silent tokens to PMC's ${await pool.name()}`);
}

pmc_stakeSilentToPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
