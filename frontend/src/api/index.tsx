import { ethers } from "ethers";

import PMC from "../api/pmc.json";
import SMASP from "../api/smasp.json";

const provider = new ethers.providers.Web3Provider(
    window.ethereum
);

// for get functions
const pmc = new ethers.Contract(
    PMC.address,
    PMC.abi,
    provider
);

const smasp = new ethers.Contract(
    SMASP.address,
    SMASP.abi,
    provider
)

// for external functions
const signer = provider.getSigner()

const pmcMethod = new ethers.Contract(
    PMC.address,
    PMC.abi,
    signer
)

const smaspMethod = new ethers.Contract(
    SMASP.address,
    SMASP.abi,
    signer
)

export { pmc, pmcMethod, smasp, smaspMethod };