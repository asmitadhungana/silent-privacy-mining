// @ts-ignore
import React, { useEffect, useState } from 'react';
import { BigNumber, ethers } from 'ethers';
import { useWeb3React } from '@web3-react/core';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { Stack } from '@mui/material';
import theme from './styles/Theme';
import { ModalField, ModalHeader, ModalMainBox, ModalSubBox } from './styles/ModalStyles';
import { ContainedButton } from './styles/CustomButton';
import { getSigner, getSmaspContract } from '../utils/contracts';
import tokenAbi from '../abis/token.json';
import { Provider } from '../utils/provider';

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

const DepositBox = ({ asset }: { asset: any }) => {
  const { account, library: provider } = useWeb3React<Provider>();

  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [percent, setPercent] = useState<number>(1);
  const [amount, setAmount] = useState<number>(0);

  useEffect(() => {
    async function fetchData() {
      if (account && provider) {
        const smasp = getSmaspContract(provider);
        const tokenAddr = await smasp.assetIdToToken(asset.assetId);

        const tokenContract = new ethers.Contract(tokenAddr, tokenAbi.abi, provider);
        const tokenBal = (await tokenContract.balanceOf(account)) / 10 ** 18;
        setTokenBalance(tokenBal);
        setAmount(Math.floor(tokenBal / 4));
      }
    }
    fetchData();
  }, [account, provider]);

  async function doApproveTokenForTransfer(_tokenAddress: string, _tokenSpender: string, _spendingAmount: BigNumber) {
    if (account && provider) {
      const signer = getSigner(provider, account);
      const tokenContract = new ethers.Contract(_tokenAddress, tokenAbi.abi, signer);

      // // Then let the tokenOwner approve the tokenSpender
      await tokenContract.approve(_tokenSpender, _spendingAmount);

      console.log('ERC20: Allowance approved');
    }
  }

  async function depositAssetToPool(_amount: Number) {
    if (account && provider) {
      const amount = ethers.utils.parseUnits(_amount.toString(), 18);
      const smasp = getSmaspContract(provider);
      const signer = getSigner(provider, account);
      const tokenAddr = await smasp.assetIdToToken(asset.assetId);
      await doApproveTokenForTransfer(tokenAddr, smasp.address, amount);
      await smasp.connect(signer).depositAsset(asset.assetId, amount);

      console.log(`Deposited ${_amount} ${asset.tokenName}`);
    }
  }

  return (
    <div>
      <ModalMainBox sx={{ bgcolor: 'background.paper' }}>
        <AccountCircleIcon
          style={{
            fontSize: 45,
            color: theme.palette.secondary.main
          }}
        />
        <ModalHeader>{asset.tokenName}</ModalHeader>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-evenly',
            alignItems: 'center',
            marginBottom: '20px'
          }}
        >
          Your Lifetime Protocol Deposits : {'' + asset.lifeTimeDeposit.crypto}
        </div>
        <ModalSubBox>
          <ModalHeader sx={{ fontSize: '18px', textAlign: 'left', marginBottom: '15px' }}>
            Deposit into {asset.tokenName} pool
          </ModalHeader>
          <Stack spacing={1} direction="column" alignItems="center" alignContent="justify-between">
            <Stack spacing={1} direction="row" width="55%">
              <ContainedButton
                variant="contained"
                onClick={(e) => {
                  {
                    setPercent(1);
                    setAmount(Math.round((tokenBalance * 1) / 4));
                  }
                }}
              >
                25%
              </ContainedButton>
              <ContainedButton
                variant="contained"
                onClick={(e) => {
                  {
                    setPercent(2);
                  }
                  setAmount(Math.floor((tokenBalance * 2) / 4));
                }}
              >
                50%
              </ContainedButton>
              <ContainedButton
                variant="contained"
                onClick={(e) => {
                  {
                    setPercent(3);
                  }
                  setAmount(Math.floor((tokenBalance * 3) / 4));
                }}
              >
                75%
              </ContainedButton>
              <ContainedButton
                variant="contained"
                onClick={(e) => {
                  {
                    setPercent(4);
                  }
                  setAmount(Math.floor((tokenBalance * 4) / 4));
                }}
              >
                MAX
              </ContainedButton>
            </Stack>
            <ModalField onChange={(e) => setAmount(parseInt(e.target.value))} value={amount} label="Anon-Screen" />
            <Stack spacing={1} direction="row" width="55%">
              <span>Balance</span>
              <span>
                {tokenBalance} {asset.tokenName}
              </span>
            </Stack>
          </Stack>
          <ContainedButton
            variant="contained"
            sx={{ marginTop: '15px' }}
            onClick={(e) => {
              {
                depositAssetToPool(amount);
              }
            }}
          >
            Deposit
          </ContainedButton>
        </ModalSubBox>
      </ModalMainBox>
    </div>
  );
};

export default DepositBox;
