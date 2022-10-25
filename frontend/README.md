# PMC Frontend

This is the frontend for privacy-mining-program

## Tasks

### Install the dependencies

`yarn install`

### Start a local hardhat node in an isolated terminal

1.1. `yarn hardhat node` // Runs a local node with hardhat-deploy
1.2. `yarn hardhat node --no-deploy` // Runs a local node without hardhat-deploy

### Deploy the contracts [Case: 1.2.]

2. `yarn hardhat run --network localhost scripts_alt/1_deploy_contracts.js`

### Setup the necessary pre-conditions for pmc [Case: 1.2.]

3. `yarn hardhat run --network localhost scripts_alt/2_setup.js`

### Change the deployed contract addresses in /frontend/src/api/<contract.json>

4. This is done so that frontend can access the newly deployed contract instances.

### Start the UI

5. `yarn start`

### To use the admin panel in UI

Go to the endpoint `/admin`
