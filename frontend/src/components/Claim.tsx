// @ts-ignore
import React, { useEffect, useState } from 'react';
import { ethers, BigNumber } from 'ethers';
import { useWeb3React } from '@web3-react/core';
import { BoxCircle, CircleText, MainBox } from './styles/EarnStyles';
import { ContainedButton } from './styles/CustomButton';
import theme from './styles/Theme';
import { ThemeProvider } from '@emotion/react';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { Modal } from '@mui/material';
import StakeBox from './StakeBox';
import { getPmcContract, getSigner } from '../utils/contracts';
import { Provider } from '../utils/provider';
import assets from '../abis/assets.json';

type DataRow = {
  assetId: any;
  userPhase: any;
  protocolDeposit: any;
  vouchBalance: any;
  staked: any;
  stakingPower: BigNumber;
  rewards: any;
  apr: any;
};

const Claim = () => {
  const { account, library: provider } = useWeb3React<Provider>();

  const [rows, setRows] = useState<DataRow[]>([]);
  const [asset, setAsset] = useState<DataRow | null>(null);

  const calcApr = (
    emissionRate: BigNumber,
    allocPoint: BigNumber,
    totalAllocPoint: BigNumber,
    staked: BigNumber,
    totalStaked: BigNumber
  ) => {
    return emissionRate
      .mul(24 * 60 * 60)
      .mul(staked)
      .div(totalStaked)
      .mul(allocPoint)
      .mul(100)
      .div(totalAllocPoint);
  };

  useEffect(() => {
    async function fetchData() {
      if (account && provider) {
        const pmc = getPmcContract(provider);
        const rows: DataRow[] = [];

        const emissionRate = await pmc.phaseToRewardEmissionRate(2);
        const totalAllocPoint = await pmc.phaseToTotalAllocPoint(2);
        for (let i = 0; i < Object.values(assets).length; i++) {
          const assetId = Object.values(assets)[i];
          const rewardPool = await pmc.rewardPoolInfo(assetId);
          const userPool = await pmc.userPoolInfo(account, assetId);
          const staked =
            userPool.phase === 2 ? userPool.userPoolBalance.div(userPool.userVoucherBalance) : BigNumber.from(0);
          const stakingPower = userPool.phase === 2 ? userPool.userPoolBalance : BigNumber.from(0);

          if (rewardPool.phase === 2) {
            const pendingRewards = await pmc.getPendingRewards(assetId, account);
            rows.push({
              assetId,
              userPhase: userPool.phase,
              protocolDeposit: rewardPool.globalPoolBalance,
              vouchBalance: userPool.userVoucherBalance,
              staked,
              stakingPower,
              rewards: pendingRewards,
              apr:
                userPool.phase === 2
                  ? calcApr(emissionRate, rewardPool.allocPoint, totalAllocPoint, staked, rewardPool.globalPoolBalance)
                  : 0
            });
          }
        }
        setRows(rows);
      }

      // for (let count = 0; count < deployedPools.length; count++) {
      //   const element = deployedPools[count];

      //   if (element.phase == 2) {
      //     let assetId = await pmc.deployedPools(count);
      //     // console.log(count,assetId)
      //     phase2.push(element);
      //     assetId = ethers.BigNumber.from(assetId);
      //     assetIds.push(assetId);
      //     const userpoolstate = await pmc.userPoolState(addr, assetId);
      //     userpools.push(userpoolstate);
      //     if (userpoolstate.userPoolBalance > 0 && userpoolstate.phase == 2) {
      //       const rewardPending = await pmc.getPendingRewards(addr, assetId);
      //       reward.push(rewardPending);
      //     } else {
      //       reward.push(Number(0));
      //     }
      //   }
      // }
    }
    fetchData();
  }, [account, provider]);

  // setInterval( fetchData, 15000);

  const claimRewards = async (_assetId: any) => {
    if (account && provider) {
      const pmc = getPmcContract(provider);
      const signer = getSigner(provider, account);
      await pmc.connect(signer).claimRewardsFromPool(_assetId);
    }
  };

  const [open, setOpen] = React.useState(false);
  const handleOpen = (asset: DataRow) => {
    setOpen(true);
    setAsset(asset);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <div>
      <ThemeProvider theme={theme}>
        <MainBox>
          <BoxCircle />
          <CircleText>Phase 2: Earn Silent Rewards</CircleText>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <table aria-label="customized table" style={{ flex: 0.8 }}>
              <tr>
                <th>Pool</th>
                <th>Protocol Deposit</th>
                <th>Vouch Balance</th>
                <th>User Staked</th>
                <th>Pending Rewards</th>
                <th></th>
              </tr>
              {rows.map((row, rowkey) => (
                <tr key={rowkey}>
                  <td
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center'
                    }}
                  >
                    <AccountCircleIcon
                      style={{
                        fontSize: 45,
                        color: theme.palette.secondary.main
                      }}
                    />
                    <ContainedButton
                      variant="outlined"
                      sx={{
                        position: 'absolute',
                        bottom: '-25%',
                        backgroundColor: '#fff'
                      }}
                      onClick={() => handleOpen(row)}
                    >
                      Stake
                    </ContainedButton>
                  </td>
                  {!!asset && (
                    <Modal
                      open={open}
                      onClose={handleClose}
                      aria-labelledby="modal-modal-title"
                      aria-describedby="modal-modal-description"
                    >
                      <StakeBox asset={asset} />
                    </Modal>
                  )}
                  <td>{ethers.utils.formatUnits(row.protocolDeposit, 18)}</td>
                  <td>
                    {row.userPhase === 1 ? ethers.utils.formatUnits(row.vouchBalance, 18) : row.vouchBalance.toString()}{' '}
                    VOUCH
                  </td>
                  <td>{ethers.utils.formatUnits(row.staked, 18)}</td>
                  <td>
                    <span> {ethers.utils.formatUnits(row.rewards, 18)} </span>
                    {row.rewards.gt(0) && (
                      <ContainedButton
                        variant="outlined"
                        onClick={(e) => {
                          claimRewards(row.assetId);
                        }}
                        sx={{
                          position: 'absolute',
                          bottom: '25%',
                          right: '5%',
                          backgroundColor: '#fff'
                        }}
                      >
                        <span>Claim</span>
                      </ContainedButton>
                    )}
                  </td>
                </tr>
              ))}
            </table>

            <table style={{ flex: 0.2 }}>
              <tr>
                <th style={{ padding: '13px' }}>APR</th>
              </tr>
              {rows.map((row) => (
                <tr>
                  <td>{ethers.utils.formatUnits(row.apr, 18)} %</td>
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
