require('@nomicfoundation/hardhat-toolbox');
import '@typechain/hardhat';
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';
import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-solhint';
import 'hardhat-contract-sizer';

// Echidna: Ganache accounts[0] for echidna-fuzz tests initialization/setup with etheno
const GANACHE_PK = '0xf2f48ee19680706196e2e339e5da3491186e0c4c5030670656b0e0164837257d';

/** @type import('hardhat/config').HardhatUserConfig */
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.4',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  defaultNetwork: 'hardhat',
  networks: {
    localhost: {
      chainId: 31337,
      live: false,
      saveDeployments: true,
      tags: ['local'],
      deploy: ['deploy/']
    },
    hardhat: {
      live: false,
      saveDeployments: true,
      tags: ['test', 'local'],
      deploy: ['deploy/'],
      allowUnlimitedContractSize: true
    }
    // Echidna: etheno ganache node info
    // localhost: {
    //   chainId: 1337,
    //   url: 'http://127.0.0.1:8546',
    //   accounts: [GANACHE_PK],
    //   saveDeployments: false,
    //   allowUnlimitedContractSize: true
    // },
    // rinkeby: {
    //   live: true,
    //   saveDeployments: true,
    //   tags: ["staging"],
    //   deploy: [ 'deploy-/' ]
    // }
  },
  namedAccounts: {
    deployer: {
      default: 0
    },
    multisig: {
      default: 1, // here this will by default take the second account as onwer/multisig (so in the test this will be a different account than the deployer)
      1: '' // on the mainnet the owner will be our multisig contract
    }
  }
};

export default config;
