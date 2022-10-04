const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const {ethers} = require('hardhat');

async function do_deployContracts(_deployer) {

  // Deploy Dummy ERC20 tokens [Assets]
  const tokens = ["weth", "dai", "usdc"]
  const _tokens = [];
  for (i = 0; i < 3; i++) {
    const Token = await hre.ethers.getContractFactory("SilentToken");
    _tokens[i] = await Token.deploy(tokens[i], tokens[i], 100000000);

    await _tokens[i].deployed();
  }

  // Deploy Silent Token
  const StakingToken = await hre.ethers.getContractFactory("SilentToken");
  const silentToken = await StakingToken.deploy("Silent Token", "SILENT", 100000000);

  await silentToken.deployed();

  // Deploy SMSAP
  const SMSAP = await hre.ethers.getContractFactory("SMASP");
  const smasp = await SMSAP.deploy();

  await smasp.deployed();

  // Deploy PrivacyMining
  const PrivacyMining = await hre.ethers.getContractFactory("PrivacyMining");
  const privacyMining = await PrivacyMining.deploy(silentToken.address, smasp.address, deployer.address);

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
      privacyMining:privacyMining.address
  }

  fs.writeFile(path.resolve(__dirname, "../deployedContracts.json"), JSON.stringify(deployedContracts), err => {
      if (err) throw err;
  });

}

async function main() {
  [deployer, assetOwner1, assetOwner2] = await ethers.getSigners();
  await do_deployContracts(deployer)
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
