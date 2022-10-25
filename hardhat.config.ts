require("@nomicfoundation/hardhat-toolbox");
import "@typechain/hardhat";
import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers"
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-solhint";

/** @type import('hardhat/config').HardhatUserConfig */
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    localhost: {
      chainId: 31337,
      // live: false,
      // saveDeployments: true,
      // tags: ["local"],
      // deploy: [ 'deploy/' ]
    },
    hardhat: {
      live: false,
      saveDeployments: true,
      tags: ["test", "local"],
      deploy: [ 'deploy/' ]
    },
    // rinkeby: {
    //   live: true,
    //   saveDeployments: true,
    //   tags: ["staging"],
    //   deploy: [ 'deploy-/' ]
    // }
  },
  namedAccounts: {
    deployer: {
      default: 0, 
    },
    multisig: {
      default: 1, // here this will by default take the second account as onwer/multisig (so in the test this will be a different account than the deployer)
      1: "", // on the mainnet the owner will be a multisig
    }
  },
};

export default config;
