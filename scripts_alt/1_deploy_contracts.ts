const fs = require('fs');
const path = require('path');
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

async function do_deployContracts(_deployer) {
  // Deploy Dummy ERC20 tokens [Assets]
  const tokens: string[] = ['weth', 'dai', 'usdc'];
  let _tokens: SilentToken[] = [];
  for (let i = 0; i < 3; i++) {
    const silentTokenFactory: SilentToken__factory = await hre.ethers.getContractFactory('SilentToken');
    _tokens[i] = await silentTokenFactory.deploy(tokens[i], tokens[i], 100000000);

    await _tokens[i].deployed();
  }

  // Deploy Silent Token
  const silentTokenFactory: SilentToken__factory = await hre.ethers.getContractFactory('SilentToken');
  const silentToken: SilentToken = await silentTokenFactory.deploy('Silent Token', 'SILENT', 100000000);

  await silentToken.deployed();

  // Deploy SMSAP
  const SmaspFactory: SMASP__factory = await hre.ethers.getContractFactory('SMASP');
  const smasp: SMASP = await SmaspFactory.deploy();

  await smasp.deployed();

  // Deploy PrivacyMining
  const PrivacyMiningFactory: PrivacyMining__factory = await hre.ethers.getContractFactory('PrivacyMining');
  const privacyMining: PrivacyMining = await PrivacyMiningFactory.deploy(silentToken.address, smasp.address);

  await privacyMining.deployed();

  console.log(`Asset Tokens deployed to the following addresses:
      ${tokens[0]} : ${_tokens[0].address}
      ${tokens[1]} : ${_tokens[1].address}
      ${tokens[2]} : ${_tokens[2].address}
  `);
  console.log(`Silent Token deployed to ${silentToken.address}`);
  console.log(`SMASP Contract deployed to ${smasp.address}`);
  console.log(`PrivacyMining deployed to ${privacyMining.address}`);

  const deployedContracts = {
    weth: _tokens[0].address,
    dai: _tokens[1].address,
    usdc: _tokens[2].address,
    silentToken: silentToken.address,
    smasp: smasp.address,
    privacyMining: privacyMining.address
  };

  fs.writeFile(path.resolve(__dirname, '../deployedContracts.json'), JSON.stringify(deployedContracts), (err) => {
    if (err) throw err;
  });
}

async function main() {
  const [deployer] = await ethers.getSigners();
  await do_deployContracts(deployer);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
