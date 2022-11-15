import { ethers, Contract } from 'ethers';

import PMC from '../abis/pmc.json';
import SMASP from '../abis/smasp.json';

export function getSigner(
  provider: ethers.providers.Web3Provider,
  account: string
) {
  return provider.getSigner(account).connectUnchecked();
}

export function getPmcContract(provider: ethers.providers.Provider): Contract {
  return new Contract(PMC.address, PMC.abi, provider);
}

export function getSmaspContract(
  provider: ethers.providers.Provider
): Contract {
  return new Contract(SMASP.address, SMASP.abi, provider);
}
