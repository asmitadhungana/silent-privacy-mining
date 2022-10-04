// @ts-ignore
import React, { useEffect, useState } from "react";
import { BoxCircle, CircleText, MainBox } from "./styles/EarnStyles";
import { ContainedButton } from "./styles/CustomButton";
import theme from "./styles/Theme";
import { ThemeProvider } from "@emotion/react";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { Modal } from "@mui/material";
import DepositBox from "./DepositBox";
import { pmc, pmcMethod, smasp } from "../api";
import { ethers } from "ethers";
import tokenAbi from "../api/token.json";

export default function Earn() {

  const [phase1List,setPhase1List] = useState<{phase: number; globalPoolBalance: number,rewardRate:number}[]>(
    [],
  );
  const [asset,setAssetId] = useState<String[]>(
    [],
  );
  const [tokenNames, setTokenNames] = useState<string[]>(
    []
  );
  const [userpool, setUserPool] = useState<{userPoolVoucherBalance:any,phase: number; userPoolBalance: number}[]> ([],);
  const [rewardPending, setPending] = useState<number[]>([],)
  const [assetmain, setAsset] = useState<string>("")
  const [lifeTimeDeposit, setLifeTimeDeposit] = useState<string>("")
  const [tokenName, setTokenName] = useState<string>("")
  

  const [rows,setRows] = useState<{
    protocolDeposit: {
      crypto: any;
      stable: any,
    },

    lifeTimeDeposit: {
      crypto: any,
      stable: any,
    },
    
    voucherClaimed: any,
    pending: any,
    rewards: any,
    assetId: any,
    tokenName: string
  }[]>(
    [],
  );

  async function fetchData() {
        const provider = new ethers.providers.Web3Provider(
          window.ethereum);
        await window.ethereum.request({ method: 'eth_requestAccounts' })
        const addr = window.ethereum.selectedAddress
    
        const deployedPools = await pmc.getDeployedPools()
        var phase1 = new Array();
        var assetIds = new Array();
        var _tokenNames = new Array();
        var userpools = new Array();
        var reward = new Array();
    
        for (let count = 0; count < deployedPools.length; count++) {
          const element = deployedPools[count];
  
          if (element.phase == 1) {
            var assetId = await pmc.deployedPools(count)
            phase1.push(element)
            assetId = (ethers.BigNumber.from(assetId))
            assetIds.push(assetId)

            const tokenAddr = await smasp.assetIdToToken(assetId);
            const tokenContract = new ethers.Contract(tokenAddr, tokenAbi.abi, provider);
            const tokenName = (await tokenContract.name());
            _tokenNames.push(tokenName.toUpperCase());

            const userpoolstate = await pmc.userPoolState(addr,assetId)
            userpools.push(userpoolstate)

            if (userpoolstate.userPoolBalance > 0 && userpoolstate.phase==1) {
              const rewardPending =await pmc.getPendingRewards(addr,assetId)
              reward.push(rewardPending)
            }else{
              reward.push(Number(0))
            }
          }
        }
          setPhase1List(phase1)
          setAssetId(assetIds)
          setTokenNames(_tokenNames)
          setUserPool(userpools)
          setPending(reward)
          // console.log(userpool,phase1List,rewardPending,asset) 
          const rowso = new Array()
          for (let i = 0; i < phase1List.length; i++) {
            rowso.push({
              protocolDeposit: {
                crypto: ` ${phase1List[i].globalPoolBalance}  ${tokenNames[i]}`,
                stable: "",
              },
              lifeTimeDeposit: {
                crypto: ` ${userpool[i].userPoolBalance}  ${tokenNames[i]}`,
                stable: "",
              },
              voucherClaimed: userpool[i].userPoolVoucherBalance+"",
              rewards: `${phase1List[i].rewardRate/10**18*60*60*24} VOUCH/Day`,
              assetId: asset[i],
              tokenName: tokenNames[i],
              pending: rewardPending[i]+""
            },)
    }
    setRows(rowso)   
    }
   
useEffect(()=>{
  fetchData()
})


const claimRewards=async(_assetId:any, row:{})=> {
  await pmcMethod.claimRewards(_assetId);
  console.log(rows)
  console.log(row)
  console.log(_assetId)
}


  const [open, setOpen] = React.useState(false);
 
  const handleOpen = (asset: string, deposit:string, _tokenName: string) => {
    setOpen(true);
    setAsset(asset);
    setLifeTimeDeposit(deposit);
    setTokenName(_tokenName.toUpperCase());
  };

  const handleClose = () => {
    setOpen(false);
    setAsset("");
  };

  return (
    <div>
      <ThemeProvider theme={theme}>
        <MainBox>
          <BoxCircle />
          <CircleText>Phase 1: Earn Vouchers</CircleText>
          <div style={{ display: "flex", flexDirection: "row" }}>
            <table aria-label='customized table' style={{ flex: 0.8 }}>
              <tr>
                <th>Pool</th>
                <th>Protocol Deposit</th>
                <th>Your Lifetime Deposit</th>
                <th>Vouchers Claimed</th>
                <th>Pending</th>
              </tr>
    
              {rows.map((row,rowkey) => (
                <tr key = {rowkey}>
                  <td
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}>
                    <AccountCircleIcon
                      style={{
                        fontSize: 45,
                        color: theme.palette.secondary.main,
                      }}
                    />

                    {row.tokenName.toUpperCase()}

                    <ContainedButton
                      variant='outlined'
                      onClick={()=>handleOpen(
                        row.assetId,
                        row.lifeTimeDeposit.crypto,
                        row.tokenName
                        )}
                      sx={{
                        position: "absolute",
                        bottom: "-25%",
                        backgroundColor: "#fff",
                      }}>
                      Deposit
                    </ContainedButton>
                   
                  <Modal
                    open={open}
                    onClose={handleClose}
                    aria-labelledby='modal-modal-title'
                    aria-describedby='modal-modal-description'>
                    <DepositBox 
                    asset ={assetmain}
                    crypto = {lifeTimeDeposit}
                    tokenName = {tokenName}
                    />
                  </Modal>
                  </td> 
                  <td>
                    {row.protocolDeposit.crypto}
                    <br />
                    {row.protocolDeposit.stable}
                  </td>
                  <td>
                    {row.lifeTimeDeposit.crypto}
                    <br />
                    {row.lifeTimeDeposit.stable}
                  </td>
                  <td>{row.voucherClaimed} Vouch</td>
                  <td>
                    <span>{row.pending} Vouch </span>
                    <ContainedButton
                      variant='outlined'
                      onClick={(e)=> {claimRewards(row.assetId,row)}}
                      sx={{
                        position: "absolute",
                        bottom: "-25%",
                        right: "5%",
                        backgroundColor: "#fff",
                      }}>
                      {row.voucherClaimed === 0 ? (
                        <span>DEPOSIT</span>
                      ) : (
                        <span>Claim</span>
                      )}
                    </ContainedButton>
                  </td>
                </tr>
              ))}
            </table>

            <table style={{ flex: 0.2 }}>
              <tr>
                <th style={{ padding: "13px" }}>Rewards</th>
              </tr>
              {rows.map((row) => (
                <tr>
                  <td>{row.rewards}</td>
                </tr>
              ))}
            </table>
          </div>
        </MainBox>
      </ThemeProvider>
    </div>
  );
}
