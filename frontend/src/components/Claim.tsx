// @ts-ignore
import React, { useEffect, useState } from "react";
import { BoxCircle, CircleText, MainBox } from "./styles/EarnStyles";
import { ContainedButton } from "./styles/CustomButton";
import theme from "./styles/Theme";
import { ThemeProvider } from "@emotion/react";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { Modal } from "@mui/material";
import StakeBox from "./StakeBox";
import { pmc, pmcMethod } from "../api";
import { ethers } from "ethers";

const Claim = () => {

  const [phase2List,setPhase2List] = useState<{phase: number; globalPoolBalance: number,rewardRate:number}[]>(
    [],
  );
  const [asset,setAssetId] = useState<String[]>(
    [],
  );
  const [userpool, setUserPool] = useState<{userPoolVoucherBalance:any,phase: number; userPoolBalance: number}[]> ([],);
  const [rewardPending, setPending] = useState<Number[]>([],)
  const [assetmain, setAsset] = useState<string>("")
  const [lifeTimeDeposit, setLifeTimeDeposit] = useState<string>("")

  const [rows,setRows] = useState<{
    protocolDeposit: {
      crypto: any;
      stable: any,
    },
    vouchBalance: any,
    staked: {
      crypto: any,
      stable: any,
    },
    rewards: any,
    apr: any,
    assetId: any,
    userPoolBalance:any
  }[]>(
    [],
  );

  async function fetchData() {
    await window.ethereum.request({ method: 'eth_requestAccounts' })
    const addr = window.ethereum.selectedAddress

    const deployedPools = await pmc.getDeployedPools()
    var phase2 = new Array();
    var assetIds = new Array();
    var userpools = new Array();
    var reward = new Array();

    for (let count = 0; count < deployedPools.length; count++) {
      const element = deployedPools[count];

      if (element.phase == 2) {
        var assetId = await pmc.deployedPools(count)
        // console.log(count,assetId)
          phase2.push(element)
          assetId = (ethers.BigNumber.from(assetId))
          assetIds.push(assetId)
          const userpoolstate = await pmc.userPoolState(addr,assetId)
          userpools.push(userpoolstate)
          if (userpoolstate.userPoolBalance > 0 && userpoolstate.phase==2) {
            const rewardPending =await pmc.getPendingRewards(addr,assetId)
            reward.push(rewardPending)
          }else{
            reward.push(Number(0))
          }
      }
    }
      setPhase2List(phase2)
      setAssetId(assetIds)
      setUserPool(userpools)
      setPending(reward)
      
      const rowso = new Array()

      for (let i = 0; i < phase2List.length; i++) {
      rowso.push({
        protocolDeposit: {
          crypto: phase2List[i].globalPoolBalance + " SILENT ",
          stable: "" ,
        },
        vouchBalance: userpool[i].userPoolVoucherBalance+"",
        staked: {
          crypto: userpool[i].userPoolBalance+" SILENT ",
          stable: "",
        },
        rewards: rewardPending[i]+" SILENT ",
        apr: phase2List[i].rewardRate/10**18*60*60*24+" VOUCH/Day",
        assetId: asset[i],
        userPoolBalance : userpool[i].userPoolBalance
      },)
      }
      setRows(rowso)
      // console.log(rows)
      }
  useEffect(()=>{

      fetchData()
      // setTimeout(  , 4000);
    })

    // setInterval( fetchData, 15000);


const claimRewards=async(_assetId:any)=> {
  await pmcMethod.claimRewards(_assetId);
}

  const [open, setOpen] = React.useState(false);
  const handleOpen = (asset: string, deposit:string) => {
    setOpen(true);
    setAsset(asset);
    setLifeTimeDeposit(deposit);
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
          <CircleText>Phase 2: Earn Silent Rewards</CircleText>
          <div style={{ display: "flex", flexDirection: "row" }}>
            <table aria-label='customized table' style={{ flex: 0.8 }}>
              <tr>
                <th>Pool</th>
                <th>Protocol Deposit</th>
                <th>Vouch Balance</th>
                <th>User Staked</th>
                <th>Pending Rewards</th>
                <th></th>
              </tr>
              {rows.map((row) => (
                <tr>
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
                    <ContainedButton
                      variant='outlined'
                      sx={{
                        position: "absolute",
                        bottom: "-25%",
                        backgroundColor: "#fff",
                      }}
                      onClick={()=>handleOpen(row.assetId,row.userPoolBalance)}
                      >
                      Stake
                    </ContainedButton>
                  </td>
                  <Modal
                    open={open}
                    onClose={handleClose}
                    aria-labelledby='modal-modal-title'
                    aria-describedby='modal-modal-description'>
                    <StakeBox 
                    asset ={assetmain}
                    userPoolBalance = {lifeTimeDeposit}
                    />
                  </Modal>
                  <td>
                    {row.protocolDeposit.crypto} 
                    <br />
                    {row.protocolDeposit.stable}
                  </td>
                  <td>{row.vouchBalance} VOUCH</td>
                  <td>
                    {row.staked.crypto} 
                    <br />
                    {row.staked.stable}
                  </td>
                  <td>
                    <span> {row.rewards} </span>
                    <ContainedButton
                      variant='outlined'
                      onClick={(e)=> {claimRewards(row.assetId)}}
                      sx={{
                        position: "absolute",
                        bottom: "-25%",
                        right: "5%",
                        backgroundColor: "#fff",
                      }}>
                      <span>Claim</span>
                    </ContainedButton>
                  </td>
                </tr>
              ))}
            </table>

            <table style={{ flex: 0.2 }}>
              <tr>
                <th style={{ padding: "13px" }}>APR</th>
              </tr>
              {rows.map((row) => (
                <tr>
                  <td>{row.apr} APR</td>
                </tr>
              ))}
            </table>
          </div>
        </MainBox>
      </ThemeProvider>
    </div>
  );
};

export default Claim;
