const hre = require("hardhat");

async function main() {
  const SilentToken = await hre.ethers.getContractFactory("SilentToken");
  const silentToken = await SilentToken.deploy("SilentToken", "SILENT", 1000000);

  await silentToken.deployed();

  const SMSAP = await hre.ethers.getContractFactory("SMSAP");
  const smasp = await SMSAP.deploy();

  await smasp.deployed();

  const PrivacyMining = await hre.ethers.getContractFactory("PrivacyMining");
  const privacyMining = await PrivacyMining.deploy(silentToken.address, smasp.address);

  await privacyMining.deployed();

  console.log(`Silent Token deployed to ${silentToken.address}.`);
  console.log(`SMASP Contract deployed to ${smasp.address}.`);
  console.log(`PrivacyMining deployed to ${privacyMining.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
