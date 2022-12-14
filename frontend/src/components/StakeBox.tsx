// @ts-ignore
import React, { useEffect, useState } from 'react';
import { useWeb3React } from '@web3-react/core';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { Stack } from '@mui/material';
import theme from './styles/Theme';
import { ModalField, ModalMainBox, ModalSubBox, ModalSubSubBox } from './styles/ModalStyles';
import { ContainedButton } from './styles/CustomButton';
import { BigNumber, ethers } from 'ethers';
import { getPmcContract, getSigner } from '../utils/contracts';
import { Provider } from '../utils/provider';
import tokenAbi from '../abis/token.json';

const toBN = (v: any) => BigNumber.from(v.toString());
const convertBN = (v: BigNumber, decimal = 18) => ethers.utils.formatUnits(v, decimal);

type DataRow = {
  assetId: any;
  protocolDeposit: any;
  vouchBalance: any;
  staked: any;
  rewards: any;
  apr: any;
};
const divStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '15px'
};

const StakeBox = ({ asset }: { asset: DataRow }) => {
  const { account, library: provider } = useWeb3React<Provider>();

  const [state, setState] = useState<Number>(1); // stake(1) or unstake (0)
  const [accountSilentBalance, setAccountSilentBalance] = useState<BigNumber>(toBN(0));
  const [power, setPower] = useState<BigNumber>(toBN(0));
  const [reward, setReward] = useState<BigNumber>(toBN(0));
  const [amount, setAmount] = useState<BigNumber>(toBN(0));

  useEffect(() => {
    async function fetchData() {
      if (account && provider) {
        const pmc = getPmcContract(provider);
        const silentAddress = await pmc.SILENT();
        const silentContract = new ethers.Contract(silentAddress, tokenAbi.abi, provider);
        const silentBalance = await silentContract.balanceOf(account);
        setAccountSilentBalance(silentBalance);
        const _power = asset.vouchBalance.mul(asset.staked);
        setPower(_power);

        try {
          const _reward = await pmc.getPendingRewards(asset.assetId, account);
          setReward(_reward);
        } catch (e) {
          // Skip due to phase mismatch
        }
      }
    }
    fetchData();
  }, [account, provider, asset]);

  async function doApproveTokenForTransfer(_tokenSpender: string, _spendingAmount: BigNumber) {
    if (account && provider) {
      const signer = getSigner(provider, account);
      const tokenContract = new ethers.Contract(tokenAbi.silentTokenAddress, tokenAbi.abi, signer);

      // // Then let the tokenOwner approve the tokenSpender
      await tokenContract.approve(_tokenSpender, _spendingAmount);

      console.log('ERC20: Allowance approved');
    }
  }

  async function stakeSilentToPool() {
    if (account && provider) {
      const pmc = getPmcContract(provider);
      const signer = getSigner(provider, account);
      await doApproveTokenForTransfer(pmc.address, amount);
      await pmc.connect(signer).stakeSilentToPool(asset.assetId, amount);
    }
  }

  async function unstakeSilentFromPool() {
    if (account && provider) {
      const pmc = getPmcContract(provider);
      const signer = getSigner(provider, account);
      await pmc.connect(signer).unstakeSilentFromPool(asset.assetId, amount);
    }
  }

  const claimRewards = async (_assetId: any) => {
    if (account && provider) {
      const pmc = getPmcContract(provider);
      const signer = getSigner(provider, account);
      await pmc.connect(signer).claimRewardsFromPool(_assetId);
    }
  };
  return (
    <div>
      <ModalMainBox
        sx={{
          bgcolor: 'background.paper',
          border: '0px',
          borderRadius: '5px',
          height: '60%'
        }}
      >
        <ContainedButton variant="contained" sx={{ position: 'absolute', top: 0, right: 0 }}>
          <AccountCircleIcon
            sx={{
              fontSize: 30,
              color: theme.palette.secondary.main,
              marginRight: '20px'
            }}
          />
          {convertBN(accountSilentBalance)} SILENT
        </ContainedButton>
        <Stack sx={{ margin: '60px 12px 5px 12px' }}>
          <div style={divStyle}>Staking Power : {convertBN(power)}</div>
          <div style={divStyle}>
            Pending Rewards : {convertBN(reward)}
            <Stack direction="row" spacing={1} width="65%">
              <ContainedButton
                variant="contained"
                size="small"
                onClick={(e) => {
                  claimRewards(asset);
                }}
                disabled={!reward.gt(0)}
              >
                Claim
              </ContainedButton>
            </Stack>
          </div>
        </Stack>
        <ModalSubBox>
          <div style={divStyle}>
            <ContainedButton
              variant="contained"
              onClick={(e) => {
                setState(1);
              }}
              disableRipple
            >
              Stake
            </ContainedButton>
            <ContainedButton
              variant="contained"
              onClick={(e) => {
                setState(0);
              }}
              disableRipple
            >
              Unstake
            </ContainedButton>
          </div>
          <Stack spacing={1} direction="column" alignItems="center" alignContent="justify-between">
            <Stack spacing={1} direction="row" width="55%">
              {/* <ContainedButton variant='contained' onClick={(e)=> {setAmount(Math.round(amount*1))}}>25%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {setAmount(Math.floor(amount*2))}}>50%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {setAmount(Math.floor(amount*3))}}>75%</ContainedButton>
              <ContainedButton variant='contained' onClick={(e)=> {setAmount(Math.floor(amount*4))}}>MAX</ContainedButton> */}
              <ContainedButton
                variant="contained"
                onClick={(e) => {
                  setAmount((state ? accountSilentBalance : asset.staked).div(4));
                }}
              >
                25%
              </ContainedButton>
              <ContainedButton
                variant="contained"
                onClick={(e) => {
                  setAmount((state ? accountSilentBalance : asset.staked).div(2));
                }}
              >
                50%
              </ContainedButton>
              <ContainedButton
                variant="contained"
                onClick={(e) => {
                  setAmount((state ? accountSilentBalance : asset.staked).mul(3).div(4));
                }}
              >
                75%
              </ContainedButton>
              <ContainedButton
                variant="contained"
                onClick={(e) => {
                  setAmount(state ? accountSilentBalance : asset.staked);
                }}
              >
                MAX
              </ContainedButton>
            </Stack>
            <ModalSubSubBox>
              <ModalField
                onChange={(e) => setAmount(ethers.utils.parseUnits(e.target.value, 18))}
                value={convertBN(amount)}
                label="Anon-Screen"
                sx={{ marginBottom: '5px' }}
              />
              <Stack spacing={1} direction="row" justifyContent="space-between">
                <span>Balance</span>
                <span>{state ? convertBN(accountSilentBalance) : convertBN(asset.staked)} SILENT</span>
              </Stack>
            </ModalSubSubBox>
          </Stack>
          <ContainedButton
            variant="contained"
            sx={{ marginTop: '15px' }}
            onClick={(e) => {
              state ? stakeSilentToPool() : unstakeSilentFromPool();
            }}
          >
            {state ? <p>Stake</p> : <p>Unstake</p>}
          </ContainedButton>
        </ModalSubBox>
      </ModalMainBox>
    </div>
  );
};

export default StakeBox;
