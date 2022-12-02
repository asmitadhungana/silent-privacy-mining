import { ethers, network, getUnnamedAccounts, getNamedAccounts } from 'hardhat';
import { toWei } from 'web3-utils';
import { BigNumber } from 'ethers';
import { SilentToken, SMASP } from '../typechain-types';

const toBN = (v) => ethers.BigNumber.from(v.toString());
const toUnit = (amount) => toBN(toWei(amount.toString(), 'ether'));

const token_approve_transfer = async (_token: SilentToken, _to, _allowance: BigNumber) => {
  const tokenApproveTx = await _token.approve(_to, _allowance);
  tokenApproveTx.wait(1);
};

export async function smasp_depositAssetToPool() {
  const users = await getUnnamedAccounts();
  const { deployer } = await getNamedAccounts();

  // Using deployer as signer
  const signer = deployer;

  const weth: SilentToken = await ethers.getContract('WETH', signer);

  const pool = weth;
  const smasp: SMASP = await ethers.getContract('SMASP', signer);

  // // Using an user as signer
  // const weth: SilentToken = await ethers.getContract("WETH", users[0]);
  // const smasp: SMASP = await ethers.getContract("SMASP", users[0]);

  const depositAmount = toUnit('100');

  // Approve SMASP for respective token transfer
  await token_approve_transfer(pool, smasp.address, depositAmount);

  console.log('Token approval success');

  // Deposit the token/asset
  const depositAssetTx = await smasp.depositAsset(pool.address, depositAmount);
  depositAssetTx.wait(1);

  console.log(`User ${signer} deposited 100 ${await pool.name()} tokens to SMASP`);
}

smasp_depositAssetToPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
