const hre = require("hardhat");
const {ethers} = require('hardhat');
const {toWei, fromWei} = require('web3-utils');
const {
  time
} = require("@nomicfoundation/hardhat-network-helpers");

let _tokens = [];
let silentToken;
let smasp;
let privacyMining;

const toBN = v => ethers.BigNumber.from(v.toString());
const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
const fromUnit = amount => fromWei(amount, 'ether');

async function deployContracts(_deployer) {

  // Deploy Dummy ERC20 tokens [Assets]
  const tokens = ["weth", "dai", "usdc"]
  for (i = 0; i < 3; i++) {
    const Token = await hre.ethers.getContractFactory("SilentToken");
    _tokens[i] = await Token.deploy(tokens[i], tokens[i], 100000000);

    await _tokens[i].deployed();
  }

  // Deploy Silent Token
  const StakingToken = await hre.ethers.getContractFactory("SilentToken");
  silentToken = await StakingToken.deploy("StakingToken", "STOKEN", 100000000);

  await silentToken.deployed();

  // Deploy SMSAP
  const SMSAP = await hre.ethers.getContractFactory("SMASP");
  smasp = await SMSAP.deploy();

  await smasp.deployed();

  // Deploy PrivacyMining
  const PrivacyMining = await hre.ethers.getContractFactory("PrivacyMining");
  privacyMining = await PrivacyMining.deploy(silentToken.address, smasp.address, deployer.address);

  await privacyMining.deployed();
  console.log(`Asset Tokens deployed to the following addresses:
      ${tokens[0]} : ${_tokens[0].address}
      ${tokens[1]} : ${_tokens[1].address}
      ${tokens[2]} : ${_tokens[2].address}
  `);
  console.log(`Silent Token deployed to ${silentToken.address}.`);
  console.log(`SMASP Contract deployed to ${smasp.address}.`);
  console.log(`PrivacyMining deployed to ${privacyMining.address}`);
  // console.log( ethers.utils.formatBytes32String(_tokens[0].address));
  // console.log( ethers.utils.parseUnits((_tokens[0].address).toString(), 32));

}

async function smasp_addAssetPool(_deployer) {
  [deployer] = await ethers.getSigners();

  for (i = 0; i < 3; i++) {
    await smasp.createAssetPool(_tokens[i].address);
  }

  console.log("SMASP: Asset Pools added...")
}

async function smasp_addPrivacyMiningContract(_deployer) {
  await smasp.addPrivacyMiningContract(privacyMining.address);
  console.log("SMASP: PMC added...")
}

async function doApproveTokenForTransfer(_tokenAddress, _tokenOwner, _deployer, _tokenSpender, _spendingAmount) {
  let tokenContract = await hre.ethers.getContractFactory("SilentToken");
  let tokenContractInstance = tokenContract.attach(_tokenAddress);

  // First transfer the _spendingAmount from owner(since s/he has all the tokens minted)
  // To the assetOwner
  if (_tokenOwner != _deployer) {
    tokenContractInstance.connect(_deployer).transfer(_tokenOwner.address, _spendingAmount);
  }
  // Then let the tokenOwner approve the tokenSpender
  tokenContractInstance.connect(_tokenOwner).approve(_tokenSpender, _spendingAmount);

  console.log("ERC20: Allowance approved...")
}

async function pmc_createAssetRewardPool(_deployer, _assetId, _phase, _reward, _rewardsDuration, _tokenAddress) {
  if (_phase == 2) {
    await doApproveTokenForTransfer(
      _tokenAddress = _tokenAddress, 
      _tokenOwner = _deployer, 
      _deployer = _deployer, 
      _tokenSpender = privacyMining.address, 
      _spendingAmount = _reward
    );
  }

  await privacyMining.createAssetRewardPool(
    _assetId,
    _phase,
    _reward,
    _rewardsDuration
  );

  console.log(`PMC: AssetRewardPool added for Phase: ${_phase}`);
}

async function smsap_depositAssetToPool(_deployer, _assetOwner, _assetId, _amount, _tokenAddress) {
  await doApproveTokenForTransfer(
    _tokenAddress = _tokenAddress,
    _tokenOwner = _assetOwner,
    _deployer = _deployer,
    _tokenSpender = smasp.address,
    _spendingAmount = _amount
  )
  await smasp.connect(_assetOwner).depositAsset(
    _assetId,
    _amount
  );
  console.log("SMASP: Asset Deposited To Pool...")
}

async function pmc_claimRewards(_assetOwner1, _assetId) {
  await privacyMining.connect(_assetOwner1).claimRewards(_assetId);
  console.log("PMC: Rewards Claimed From Pool...")
}

async function pmc_stakeSilentToPool(_deployer, _assetOwner, _assetId, _stakingAmount) {
  await doApproveTokenForTransfer(
    _tokenAddress = silentToken.address,
    _tokenOwner = _assetOwner,
    _deployer = _deployer,
    _tokenSpender = privacyMining.address,
    _spendingAmount = _stakingAmount
  );
  await privacyMining.connect(_assetOwner).stakeSilentToPool(_assetId, _spendingAmount);

  console.log(`PMC: Tokens staked to pool...`);
}

async function pmc_unstakeSilentFromPool(_assetOwner1, _assetId, _unstakingAmount) {
  await privacyMining.connect(_assetOwner1).unstakeSilentFromPool(
    _assetId,
    _unstakingAmount
  );
  console.log(`PMC: Tokens Unstaked From Pool...`)
}

async function increaseTime(_assetId, _finish) {
  // Fetch the reward pool data
  const rewardPool = await privacyMining.rewardForPool(_assetId);

  if (_finish == true) {
    // Finish the reward period completely
    await time.increaseTo(rewardPool.periodFinish);
  } else {
    await time.increaseTo(rewardPool.periodFinish - 100);
  }
}

async function main() {
  [deployer, assetOwner1, assetOwner2] = await ethers.getSigners();

  await deployContracts(deployer);
  await smasp_addAssetPool(deployer);
  await smasp_addPrivacyMiningContract(deployer);

  const hex = ethers.utils.hexZeroPad(_tokens[0].address, 32);
  const wethAssetId = toBN(hex.toString());

  // DEPLOYER: Create Asset Reward Pool
  await pmc_createAssetRewardPool(
    deployer, 
    wethAssetId,
    1,
    toUnit('100000'),
    1000,
    ethers.constants.AddressZero
  );

  // USER1: Deposit asset to the pool
  await smsap_depositAssetToPool(
    deployer,
    assetOwner1, 
    wethAssetId,
    toUnit('1000000'),
    _tokens[0].address
  );

  // USER2: Deposit asset to the pool
  await smsap_depositAssetToPool(
    deployer,
    assetOwner2, 
    wethAssetId,
    toUnit('200000'),
    _tokens[0].address
  );

  console.log(`
  ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
  `);

  // Increase the time to accumulate some rewards
  await increaseTime(wethAssetId, _finish = false); 
  
  // USER 1: Claim rewards
  await pmc_claimRewards(assetOwner1, wethAssetId);

  console.log("User1 PoolState After Vouchers Claim: " , await privacyMining.userPoolState(
    assetOwner1.address,
    wethAssetId
  ));


  // USER 2: Claim rewards
  await pmc_claimRewards(assetOwner2, wethAssetId);

  console.log("User2 PoolState After Vouchers Claim: " , await privacyMining.userPoolState(
    assetOwner2.address,
    wethAssetId
  ));

  // Increase the time to finish period for phase 1
  await increaseTime(wethAssetId, _finish = true);

  // DEPLOYER: Initiates phase 2 for WETH reward pool 
  await pmc_createAssetRewardPool(
    deployer, 
    wethAssetId,
    2,
    toUnit('100000'),
    1000,
    silentToken.address
  );


  console.log(`
  ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
  `);

  // USER 1: Stakes Staking Token to Reward Pool in phase 2
  await pmc_stakeSilentToPool(
    deployer,
    assetOwner1,
    wethAssetId,
    toUnit('1000000')
  );

  console.log("User1 PoolState Before Staking Rewards Claims: " , await privacyMining.userPoolState(
    assetOwner1.address,
    wethAssetId
  ));

  console.log("RewardPoolState Before Staking Rewards Claims: " , await privacyMining.rewardForPool(
    wethAssetId
  ));


  console.log(`
  ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
  `);

  // USER 2: Stakes Staking Token to Reward Pool in phase 2
  await pmc_stakeSilentToPool(
    deployer,
    assetOwner2,
    wethAssetId,
    toUnit('2000000')
  );

  console.log("User2 PoolState Before Staking Rewards Claims: " , await privacyMining.userPoolState(
    assetOwner2.address,
    wethAssetId
  ));

  console.log("RewardPoolState Before Staking Rewards Claims: " , await privacyMining.rewardForPool(
    wethAssetId
  ));


  console.log(`
  ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
  `);

  // Increase the time to accumulate some rewards
  await increaseTime(wethAssetId, _finish = false);

  const user1PendingRewards = await privacyMining.getPendingRewards(assetOwner1.address, wethAssetId);
  console.log(`User1: PendingRewards: ${user1PendingRewards}`);

  // USER 1: Claims Staking Rewards
  await pmc_claimRewards(assetOwner1, wethAssetId);

  console.log("User1 PoolState After Staking Rewards Claims: " , await privacyMining.userPoolState(
    assetOwner1.address,
    wethAssetId
  ));

  console.log("RewardPoolState After Staking Rewards Claims: " , await privacyMining.rewardForPool(
    wethAssetId
  ));

  // USER 2: Claims Staking Rewards

  const user2PendingRewards = await privacyMining.getPendingRewards(assetOwner2.address, wethAssetId);
  console.log(`User2: PendingRewards: ${user2PendingRewards}`);
  await pmc_claimRewards(assetOwner2, wethAssetId);

  console.log("User2 PoolState After Staking Rewards Claims: " , await privacyMining.userPoolState(
    assetOwner2.address,
    wethAssetId
  ));

  console.log("RewardPoolState After Staking Rewards Claims: " , await privacyMining.rewardForPool(
    wethAssetId
  ));


  console.log(`
  ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
  `);


  // USER 1: Unstakes Some Staking Token
  await pmc_unstakeSilentFromPool(
    assetOwner1,
    wethAssetId,
    toUnit('1000000')
  );

  console.log("User1 PoolState After Unstake: " , await privacyMining.userPoolState(
    assetOwner1.address,
    wethAssetId
  ));

  console.log("RewardPoolState After User Unstake: " , await privacyMining.rewardForPool(
    wethAssetId
  ));

  // USER 2: Unstakes Some Staking Token
  await pmc_unstakeSilentFromPool(
    assetOwner2,
    wethAssetId,
    toUnit('2000000')
  );

  console.log("User2 PoolState After Unstake: " , await privacyMining.userPoolState(
    assetOwner2.address,
    wethAssetId
  ));

  console.log("RewardPoolState After User Unstake: " , await privacyMining.rewardForPool(
    wethAssetId
  ));

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});