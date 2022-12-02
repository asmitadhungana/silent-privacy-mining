import { ethers, network } from 'hardhat';
import { deployments, getUnnamedAccounts, getNamedAccounts } from 'hardhat';

export async function smasp_createAssetPool() {
  const { multisig } = await getNamedAccounts();

  // Fetch the deployed instance of asset contract to be added to SMASP
  const weth = await ethers.getContract('WETH');

  const pool = weth;
  const signer = multisig;

  const smaspInstance = await ethers.getContract('SMASP', signer);

  const createAssetPoolTx = await smaspInstance.createAssetPool(pool.address);
  await createAssetPoolTx.wait(1);
}

smasp_createAssetPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
