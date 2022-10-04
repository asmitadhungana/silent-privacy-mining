# PMC Frontend

This is the frontend for privacy-mining-program

## Tasks

### Install the dependencies

`npm install` or `yarn`

### Start a local hardhat node in an isolated terminal

1. `npx hardhat node`

### Deploy the contracts:

2. `npx hardhat run --network localhost scripts/1_deploy_contracts.js`

### Setup the necessary pre-conditions for pmc:

3. `npx hardhat run --network localhost scripts/2_setup.js`

### Change the deployed contract addresses in /frontend/src/api/<contract.json>

4. This is done so that frontend can access the newly deployed contract instances.

### Start the UI

5. `npm start`

### To use the admin panel in UI

Go to the endpoint `/admin`
