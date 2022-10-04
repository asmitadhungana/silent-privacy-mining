// @ts-ignore
import React, { useEffect, useState } from "react";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { Stack } from "@mui/material";
import theme from "./styles/Theme";
import {
  ModalField,
  ModalMainBox,
  ModalSubBox,
  ModalSubSubBox,
} from "./styles/ModalStyles";
import { ContainedButton } from "./styles/CustomButton";
import { ethers} from "ethers";
import { BigNumber } from "ethers";
import { pmc, pmcMethod, smasp } from "../api";
import tokenAbi from "../api/token.json";
import { SecurityUpdateWarningRounded } from "@mui/icons-material";

const toBN = (v:any) => BigNumber.from(v.toString());

const divStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "15px",
};
// interface props{
//   protocolDeposit: {
//     crypto: any;
//     stable: any,
//   },

//   vouchBalance: any,
//   staked: {
//     crypto: any,
//     stable: any,
//   }
//   rewards: any,
//   apr: any,
//   assetId : any,
//   userPoolBalance : any
// }
const DepositBox = (props:{asset:string, userPoolBalance : string}) => {
  // console.log(props.asset,props.userPoolBalance)
  const [owner, setOwner] = useState<String>()
  const [asset, setAssetId] = useState<any>(props.asset)
  const [state,setState] = useState<Number>(1) // stake(1) or unstake (0)
  const [accountSilentBalance,setaccountSilentBalance] = useState<BigNumber>(toBN(0))
  const [sToken,setStoken] = useState<String>("")
  const [reward,setReward] = useState<String>("")
  // const [amount, setAmount] = useState<number>(0)
  const [amount, setAmount] = useState<BigNumber>(toBN(0))
  const [userOriginalStake, setUserOriginalStake] = useState<Number>(1)

  useEffect(() => {
    async function fetchData() {
        await window.ethereum.request({ method: 'eth_requestAccounts' })
        const addr = window.ethereum.selectedAddress
        setOwner(owner)
        console.log(props.asset)
        setAssetId(props.asset)
        const provider = new ethers.providers.Web3Provider(
          window.ethereum);
        const tokenContract = new ethers.Contract(tokenAbi.silentTokenAddress, tokenAbi.abi, provider.getSigner());
        // const _accountSilentBal: BigNumber = await tokenContract.balanceOf(addr)
        // setaccountSilentBalance(_accountSilentBal.div(1e18))
        const _accountSilentBal: number = await tokenContract.balanceOf(addr)
        setaccountSilentBalance(toBN(_accountSilentBal /1e18))
        const tokenName = await tokenContract.symbol()
        setStoken(tokenName)

        const userpoolstate = await pmc.userPoolState(addr,props.asset)
        setUserOriginalStake(userpoolstate.userPoolBalance.div(userpoolstate.userPoolVoucherBalance));
        if (userpoolstate.userPoolBalance > 0 && userpoolstate.phase==2) {
            const rewardPending =await pmc.getPendingRewards(addr,props.asset)
            setReward(String(rewardPending))
        }else{
            setReward(String(0));
        }
        if (state) {     
          setAmount(toBN((_accountSilentBal/1e18)/4));
        }else{
          setAmount(userpoolstate.userPoolBalance.div(toBN(4)))
        }
      }
    fetchData();
}, [])

  async function doApproveTokenForTransfer(_tokenAddress:String, _tokenOwner:String, _tokenSpender:String, _spendingAmount:number) {
    const provider = new ethers.providers.Web3Provider(
      window.ethereum);
    const tokenContract = new ethers.Contract(tokenAbi.silentTokenAddress, tokenAbi.abi, provider.getSigner());
  
    await tokenContract.approve(_tokenSpender, _spendingAmount);
  
    console.log("ERC20: Allowance approved")
  }

  async function stakeSilentToPool(_assetId:any, _stakingAmount:number) {
    const _tokenAddress = await smasp.assetIdToToken(asset);
    const _assetOwner = window.ethereum.selectedAddress
    await doApproveTokenForTransfer(
      _tokenAddress,
       _assetOwner,
       pmc.address,
       _stakingAmount
    );
    await pmcMethod.stakeSilentToPool(_assetId, _stakingAmount);
  }

  async function unstakeSilentFromPool(_assetId:any, _unstakingAmount:any) {
    await pmcMethod.unstakeSilentFromPool(
      _assetId,
      _unstakingAmount
    );
  }

  const claimRewards=async(_assetId:any)=> {
    await pmcMethod.claimRewards(_assetId);
  }
  return (
    <div>
      <ModalMainBox
        sx={{
          bgcolor: "background.paper",
          border: "0px",
          borderRadius: "5px",
          height: "60%",
        }}>
        <ContainedButton
          variant='contained'
          sx={{ position: "absolute", top: 0, left: 0 }}>
          Stake
        </ContainedButton>
        <ContainedButton
          variant='contained'
          sx={{ position: "absolute", top: 0, right: 0 }}>
          <AccountCircleIcon
            sx={{
              fontSize: 30,
              color: theme.palette.secondary.main,
              marginRight: "20px",
            }}
          />{" "}
          Silent Balance
        </ContainedButton>
        <Stack sx={{ margin: "60px 12px 5px 12px" }}>
          <div style={divStyle}>
            Staking Power : {props.userPoolBalance+""}
          </div>
          <div style={divStyle}>
            Pending Rewards : {reward +""}
            <Stack direction='row' spacing={1} width='65%'>
              
              <ContainedButton variant='contained' onClick={(e)=> {claimRewards(asset)}}>Claim</ContainedButton>
            </Stack>
          </div>
        </Stack>
        <ModalSubBox>
          <div style={divStyle}>
          <ContainedButton variant='contained' onClick={(e)=> {setState(1)}}>Stake</ContainedButton>
          <ContainedButton variant='contained' onClick={(e)=> {setState(0)}}>Unstake</ContainedButton>
          </div>
          <Stack
            spacing={1}
            direction='column'
            alignItems='center'
            alignContent='justify-between'>
            <Stack spacing={1} direction='row' width='55%'>
              {/* <ContainedButton variant='contained' onClick={(e)=> {setAmount(Math.round(amount*1))}}>25%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {setAmount(Math.floor(amount*2))}}>50%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {setAmount(Math.floor(amount*3))}}>75%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {setAmount(Math.floor(amount*4))}}>MAX</ContainedButton> */}
              <ContainedButton variant='contained' onClick={(e)=> {setAmount(amount.mul(1))}}>25%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {setAmount(amount.mul(2))}}>50%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {setAmount(amount.mul(3))}}>75%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {setAmount(amount.mul(4))}}>MAX</ContainedButton>
            </Stack>
            <ModalSubSubBox>
              <ModalField 
                          onChange={(e) => setAmount(toBN(e.target.value))}
                          value={amount}
                          label='Anon-Screen' sx={{ marginBottom: "5px" }} />
              <Stack spacing={1} direction='row' justifyContent='space-between'>
                <span>Balance</span>
                <span>{state?<p>{accountSilentBalance.toString()+""}</p>:<p>{userOriginalStake+""}</p>} {sToken}</span>
              </Stack>
            </ModalSubSubBox>
          </Stack>
          <ContainedButton variant='contained' sx={{ marginTop: "15px" }}
          onClick={(e)=> {state?stakeSilentToPool(asset,100):unstakeSilentFromPool(asset,100)}}>
            {state?<p>Stake</p>:<p>Unstake</p>}
          </ContainedButton>
        </ModalSubBox>
      </ModalMainBox>
    </div>
  );
};

export default DepositBox;
