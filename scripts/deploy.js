const hre = require("hardhat");

async function main() {
  const currentTimestampInSeconds = Math.round(Date.now() / 1000);
  const TWO_MONTHS_IN_SEC = 60 * 24 * 60 * 60;
  const rewardPeriodFinish = currentTimestampInSeconds + TWO_MONTHS_IN_SEC;

  const SilentToken = await hre.ethers.getContractFactory("SilentToken");
  const silentToken = await SilentToken.deploy("SilentToken", "SILENT", 1000000);

  await silentToken.deployed();

  const SMASP = await hre.ethers.getContractFactory("SMASP");
  const smasp = await SMASP.deploy();

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
