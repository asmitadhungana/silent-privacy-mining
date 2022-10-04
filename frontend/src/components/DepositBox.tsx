// @ts-ignore
import React, { useEffect, useState } from "react";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { Stack } from "@mui/material";
import theme from "./styles/Theme";
import {
  ModalField,
  ModalHeader,
  ModalMainBox,
  ModalSubBox,
} from "./styles/ModalStyles";
import { ContainedButton } from "./styles/CustomButton";
import { smasp, smaspMethod } from "../api";
import tokenAbi from "../api/token.json";

import { BigNumber, ethers } from "ethers";

// interface props {
//   protocolDeposit: {
//     crypto: any;
//     stable: any,
//   },

//   lifeTimeDeposit: {
//     crypto: any,
//     stable: any,
//   },

//   voucherClaimed: any,
//   pending: any,
//   rewards: any,
//   assetId: any
// }

const DepositBox = (props:{asset:string, crypto : string, tokenName: string}) => {

  const [owner, setOwner] = useState<String>();
  const [asset, setAssetId] = useState<any>(props.asset);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [percent, setPercent] = useState<number>(1);
  const [amount, setAmount] = useState<number>(0);

  
  useEffect(() => {
    async function fetchData() {
      const provider = new ethers.providers.Web3Provider(
        window.ethereum);

        await window.ethereum.request({ method: 'eth_requestAccounts' })
        const addr = window.ethereum.selectedAddress
        setOwner(owner)
        // console.log(assetId)
        setAssetId(props.asset)
        console.log("abcds"+asset)

        const tokenAddr = await smasp.assetIdToToken(asset);
        console.log("tokenAddr"+tokenAddr)
        const tokenContract = new ethers.Contract(tokenAddr, tokenAbi.abi, provider);
        const tokenBal = (await tokenContract.balanceOf(addr))/10**18;
        setTokenBalance(tokenBal)
        setAmount(Math.floor(tokenBal/4))
    }
    fetchData();
}, [])

async function doApproveTokenForTransfer(_tokenAddress:String, _tokenOwner:String, _tokenSpender:String, _spendingAmount:Number) {
  const provider = new ethers.providers.Web3Provider(
    window.ethereum);
  const tokenAddr = await smasp.assetIdToToken(asset);
  const tokenContract = new ethers.Contract(tokenAddr, tokenAbi.abi, provider.getSigner());

  // // Then let the tokenOwner approve the tokenSpender
  await tokenContract.approve(_tokenSpender, _spendingAmount);

  console.log("ERC20: Allowance approved")
}

async function depositAssetToPool( _assetId:any, _amount:Number) {
  const tokenAddr = await smasp.assetIdToToken(asset);
  console.log("tokenAddr"+tokenAddr)
  const _assetOwner = window.ethereum.selectedAddress

  console.log(_assetOwner,tokenAddr);

  const _tokenAddress = tokenAddr
  await doApproveTokenForTransfer(
    _tokenAddress,
     _assetOwner,
     smasp.address,
     _amount
  )
  await smaspMethod.depositAsset(
    _assetId,
    _amount
  );
  console.log("SMASP: Asset Deposited To Pool...")
}
const deposit = async()=>{
  await smaspMethod.depositAsset(asset,200);
}

  return (
    <div>
      <ModalMainBox sx={{ bgcolor: "background.paper" }}>
        <AccountCircleIcon
          style={{
            fontSize: 45,
            color: theme.palette.secondary.main,
          }}
        />
        <ModalHeader>{props.tokenName}</ModalHeader>
        <div
          style={{
            display: "flex",
            justifyContent: "space-evenly",
            alignItems: "center",
            marginBottom: "20px",
          }}>
          Your Lifetime Protocol Deposits : {""+props.crypto}
        </div>
        <ModalSubBox>
          <ModalHeader
            sx={{ fontSize: "18px", textAlign: "left", marginBottom: "15px" }}>
            Deposit into ______
          </ModalHeader>
          <Stack
            spacing={1}
            direction='column'
            alignItems='center'
            alignContent='justify-between'>
            <Stack spacing={1} direction='row' width='55%'>
              <ContainedButton variant='contained' onClick={(e)=> {{setPercent(1);setAmount(Math.round(tokenBalance*1/4))}}}>25%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {{setPercent(2)};setAmount(Math.floor(tokenBalance*2/4))}}>50%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {{setPercent(3)};setAmount(Math.floor(tokenBalance*3/4))}}>75%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {{setPercent(4)};setAmount(Math.floor(tokenBalance*4/4))}}>MAX</ContainedButton>
            </Stack>
            <ModalField
            onChange={(e) => setAmount(parseInt(e.target.value))}
            value={amount}
            label='Anon-Screen' />
            <Stack spacing={1} direction='row' width='55%'>
              <span>Balance</span>
              <span>{tokenBalance} {props.tokenName}</span>
            </Stack>
          </Stack>
          <ContainedButton variant='contained' sx={{ marginTop: "15px" }}
          onClick={(e)=> {console.log(amount);{depositAssetToPool(asset,amount)}}}>
            Deposit
          </ContainedButton>
        </ModalSubBox>
      </ModalMainBox>
    </div>
  );
};

export default DepositBox;
//{depositAssetToPool(asset,amount)}