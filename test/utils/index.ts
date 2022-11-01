import { ethers } from "hardhat";
import { BigNumber } from "ethers";
const {toWei, fromWei} = require('web3-utils');

export function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

export const toBN = v => BigNumber.from(v.toString());
export const toUnit = amount => toBN(toWei(amount.toString(), 'ether'));
export const fromUnit = amount => fromWei(amount, 'ether');

export * from "./time";
export * from "./constants";
export * from "./setUsers";