// @ts-ignore
import React, { useEffect, useState } from 'react';
import { BigNumber, ethers } from 'ethers';
import { useWeb3React } from '@web3-react/core';
import { BoxCircle, CircleText, MainBox } from './styles/EarnStyles';
import { ContainedButton } from './styles/CustomButton';
import theme from './styles/Theme';
import { ThemeProvider } from '@emotion/react';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { Modal } from '@mui/material';
import DepositBox from './DepositBox';
import { getPmcContract, getSigner } from '../utils/contracts';
import { Provider } from '../utils/provider';
import assets from '../abis/assets.json';

export default function Earn() {
  const { account, library: provider } = useWeb3React<Provider>();

  const [rows, setRows] = useState<
    {
      protocolDeposit: {
        crypto: any;
        stable: any;
      };

      lifeTimeDeposit: {
        crypto: any;
        stable: any;
      };

      voucherClaimed: any;
      pending: any;
      rewards: any;
      assetId: any;
      tokenName: string;
    }[]
  >([]);

  const [asset, setAsset] = useState<any>(null);
  const calcVoucherRewards = (emissionRate: BigNumber, allocPoint: BigNumber, totalAllocPoint: BigNumber) => {
    return emissionRate
      .mul(24 * 60 * 60)
      .mul(allocPoint)
      .div(totalAllocPoint);
  };

  useEffect(() => {
    async function fetchData() {
      if (account && provider) {
        const pmc = getPmcContract(provider);
        const phase1Pools: any[] = [];
        const userPools: any[] = [];
        const rows: any[] = [];

        const emissionRate = await pmc.phaseToRewardEmissionRate(1);
        const totalAllocPoint = await pmc.phaseToTotalAllocPoint(1);
        for (let i = 0; i < Object.values(assets).length; i++) {
          const tokenName = Object.keys(assets)[i].toUpperCase();
          const assetId = Object.values(assets)[i];
          const rewardPool = await pmc.rewardPoolInfo(assetId);
          const userPool = await pmc.userPoolInfo(account, assetId);
          console.log('@@@', rewardPool, userPool);
          if (rewardPool.phase === 1) {
            phase1Pools.push(rewardPool);
            userPools.push(userPool);
            let pendingRewards;
            try {
              pendingRewards = await pmc.getPendingRewards(assetId, account);
            } catch (e) {
              // User pool phase mismatch
              pendingRewards = BigNumber.from(0);
            }
            rows.push({
              protocolDeposit: {
                crypto: ` ${ethers.utils.formatUnits(rewardPool.globalPoolBalance, 18)} ${tokenName}`,
                stable: ''
              },
              lifeTimeDeposit: {
                crypto: ` ${ethers.utils.formatUnits(
                  userPool.phase === 1 ? userPool.userPoolBalance : BigNumber.from(0),
                  18
                )} ${tokenName}`,
                stable: ''
              },
              voucherClaimed: userPool.userVoucherBalance,
              rewards: calcVoucherRewards(emissionRate, rewardPool.allocPoint, totalAllocPoint),
              assetId,
              tokenName,
              pending: pendingRewards
            });
          }
        }

        setRows(rows);
      }
    }
    fetchData();
  }, [account, provider]);

  const claimRewards = async (_assetId: any) => {
    if (account && provider) {
      const pmc = getPmcContract(provider);
      const signer = getSigner(provider, account);
      await pmc.connect(signer).claimRewardsFromPool(_assetId);
    }
  };

  const [open, setOpen] = React.useState(false);

  const handleOpen = (asset: any) => {
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
          <CircleText>Phase 1: Earn Vouchers</CircleText>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <table aria-label="customized table" style={{ flex: 0.8 }}>
              <tr>
                <th>Pool</th>
                <th>Protocol Deposit</th>
                <th>Your Lifetime Deposit</th>
                <th>Vouchers Claimed</th>
                <th>Pending</th>
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

                    {row.tokenName.toUpperCase()}

                    <ContainedButton
                      variant="outlined"
                      onClick={() => handleOpen(row)}
                      sx={{
                        position: 'absolute',
                        bottom: '-20%',
                        backgroundColor: '#fff'
                      }}
                    >
                      Deposit
                    </ContainedButton>
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
                  <td>{ethers.utils.formatUnits(row.voucherClaimed, 18)} Vouch</td>
                  <td>
                    {/* <span>{ethers.utils.formatUnits(row.pending, 18)} Vouch </span> */}
                    <span>{ethers.utils.formatUnits(row.pending, 18)} Vouch </span>
                    {row.pending.gt(0) && (
                      <ContainedButton
                        variant="outlined"
                        onClick={(e) => {
                          claimRewards(row.assetId);
                        }}
                        sx={{
                          position: 'absolute',
                          bottom: '-20%',
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
            <Modal
              open={open}
              onClose={handleClose}
              aria-labelledby="modal-modal-title"
              aria-describedby="modal-modal-description"
            >
              <DepositBox asset={asset} />
            </Modal>
            <table style={{ flex: 0.2 }}>
              <tr>
                <th style={{ padding: '13px' }}>Rewards</th>
              </tr>
              {rows.map((row, rowkey) => (
                <tr key={rowkey}>
                  <td>{ethers.utils.formatUnits(row.rewards, 18)} VOUCH/Day</td>
                </tr>
              ))}
            </table>
          </div>
        </MainBox>
      </ThemeProvider>
    </div>
  );
}
