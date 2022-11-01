import { ethers, network } from 'hardhat';
import { deployments, getUnnamedAccounts, getNamedAccounts } from 'hardhat';

export async function smasp_createAssetPool() {
  const { deployer } = await getNamedAccounts();

  const wethInstance = await ethers.getContract('WETH');
  const smaspInstance = await ethers.getContract('SMASP', deployer);

  const createAssetPoolTx = await smaspInstance.createAssetPool(
    wethInstance.address
  );
  await createAssetPoolTx.wait(1);
}

smasp_createAssetPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
