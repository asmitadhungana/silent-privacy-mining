const hre = require("hardhat");

async function main() {
  const currentTimestampInSeconds = Math.round(Date.now() / 1000);
  const TWO_MONTHS_IN_SEC = 60 * 24 * 60 * 60;
  const rewardPeriodFinish = currentTimestampInSeconds + TWO_MONTHS_IN_SEC;

  const SilentToken = await hre.ethers.getContractFactory("SilentToken");
  const silentToken = await SilentToken.deploy("SilentToken", "SILENT", 1000000);

  await silentToken.deployed();

  const PrivacyMining = await hre.ethers.getContractFactory("PrivacyMining");
  const smaspContractAddress = silentToken.address; // Dummy value for now
  const privacyMining = await PrivacyMining.deploy(silentToken.address, smaspContractAddress);

  await privacyMining.deployed();

  console.log(
    `Silent Token deployed to ${silentToken.address} and PrivacyMining deployed to ${privacyMining.address}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
