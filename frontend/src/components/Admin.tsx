// @ts-ignore
import { React, useState } from 'react';
import { MainBox } from './styles/EarnStyles';
import { ContainedButton } from './styles/CustomButton';
import { Stack } from '@mui/material';
import { PageHeader, CustomMenu } from './styles/HeaderStyles';
import {
  AdminSelectField,
  BoxHeader,
  BoxSubHeader
} from './styles/AdminStyles';
import { ModalField } from './styles/ModalStyles';
import { ethers } from 'ethers';
import tokenAbi from '../abis/token.json';
import {
  getPmcContract,
  getSmaspContract,
  getSigner
} from '../utils/contracts';

const divStyle = {
  display: 'flex',
  justifyContent: 'space-around',
  alignItems: 'center',
  marginBottom: '15px',
  width: '80%'
};

const Admin = () => {
  const phases = [
    {
      value: '1',
      label: 'Phase 1'
    },
    {
      value: '2',
      label: 'Phase 2'
    }
  ];

  const [phase, setPhase] = useState('1');
  const [token, setToken] = useState('');
  const [asset, setAssetId] = useState<String>('');
  const [reward, setReward] = useState<Number>(1);
  const [rewardDuration, setRewardDuration] = useState<Number>(1);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPhase(event.target.value);
  };

  /*
  async function smasp_addAssetPool(token: String) {
    await smaspMethod.createAssetPool(token);
    console.log('SMASP: Asset Pools added...');
  }

  async function doApproveTokenForTransfer(
    _tokenAddress: String,
    _tokenSpender: String,
    _spendingAmount: Number
  ) {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const tokenContract = new ethers.Contract(
      String(_tokenAddress),
      tokenAbi.abi,
      provider.getSigner()
    );

    // // Then let the tokenOwner approve the tokenSpender
    await tokenContract.approve(_tokenSpender, _spendingAmount);

    console.log('ERC20: Allowance approved');
  }

  async function pmc_createAssetRewardPool(
    _assetId: String,
    _phase: Number,
    _reward: Number,
    _rewardsDuration: Number,
    c?: String
  ) {
    if (_phase == 2) {
      await doApproveTokenForTransfer(String(c), pmc.address, _reward);
    }

    await pmcMethod.createAssetRewardPool(
      _assetId,
      _phase,
      _reward,
      _rewardsDuration
    );

    console.log(`PMC: AssetRewardPool added for Phase: ${_phase}`);
  }

  const createPhase2 = async (assetId: String, reward: Number) => {
    // await pmcMethod.changePoolToPhaseTwo(assetId);

    // DEPLOYER: Initiates phase 2 for WETH reward pool
    await pmc_createAssetRewardPool(
      assetId,
      2,
      reward,
      1000,
      tokenAbi.silentTokenAddress
    );

    // await pmcMethod.updateReward(
    //   assetId,
    //   reward
    // )
  };
  */
  return (
    <div>
      <PageHeader style={{ textAlign: 'center' }}>Admin Page</PageHeader>
      <MainBox style={{ margin: '25px 40px' }}>
        {/* Asset Pool */}
        <BoxHeader>SMASP</BoxHeader>
        <Stack
          spacing={1}
          direction="column"
          alignItems="center"
          alignContent="justify-between"
        >
          <BoxSubHeader>CREATE A NEW ASSET POOL</BoxSubHeader>
          <div style={divStyle}>
            <strong>Token</strong>
            <ModalField
              onChange={(e) => setToken(e.target.value)}
              label="Enter the token address here"
              style={{ width: '65%' }}
            />
          </div>
          <ContainedButton
            onClick={(e) => {
              // smasp_addAssetPool(token);
            }}
            variant="contained"
            style={{ marginBottom: '20px' }}
          >
            Create
          </ContainedButton>
        </Stack>
      </MainBox>
      <MainBox style={{ margin: '25px 40px' }}>
        {/* Reward Pool */}
        <BoxHeader>PMC</BoxHeader>
        <Stack
          spacing={1}
          direction="column"
          alignItems="center"
          alignContent="justify-between"
        >
          <BoxSubHeader>CREATE A NEW REWARD POOL</BoxSubHeader>
          <Stack style={divStyle}>
            <div style={divStyle}>
              <strong>Asset Id</strong>
              <ModalField
                onChange={(e) => setAssetId(e.target.value)}
                label="Enter the assetId of the corresponding token here"
                style={{ width: '65%' }}
              />
            </div>
            <div style={divStyle}>
              <strong>Phase</strong>
              <AdminSelectField
                id="select-phases"
                select
                value={phase}
                onChange={handleChange}
                variant="outlined"
                style={{ width: '65%' }}
              >
                {phases.map((option) => (
                  <CustomMenu key={option.value} value={option.value}>
                    {option.label}
                  </CustomMenu>
                ))}
              </AdminSelectField>
            </div>
            <div style={divStyle}>
              <strong>Reward</strong>
              <ModalField
                style={{ width: '65%' }}
                onChange={(e) => setReward(parseInt(e.target.value))}
              />
            </div>
            <div style={divStyle}>
              <strong>Reward Duration</strong>
              <ModalField
                style={{ width: '65%' }}
                onChange={(e) => setRewardDuration(parseInt(e.target.value))}
              />
            </div>
          </Stack>
          <ContainedButton
            onClick={(e) => {
              // pmc_createAssetRewardPool(
              //   asset,
              //   parseInt(phase),
              //   reward,
              //   rewardDuration
              // );
            }}
            variant="contained"
            style={{ marginBottom: '20px' }}
          >
            Create
          </ContainedButton>
        </Stack>
      </MainBox>
      <MainBox style={{ margin: '25px 40px' }}>
        <Stack
          spacing={1}
          direction="column"
          alignItems="center"
          alignContent="justify-between"
        >
          <BoxSubHeader>UPDATE A REWARD POOL</BoxSubHeader>
          <Stack style={divStyle}>
            <div style={divStyle}>
              <strong>Asset Id</strong>
              <ModalField
                style={{ width: '65%' }}
                onChange={(e) => setAssetId(e.target.value)}
              />
            </div>
            <div style={divStyle}>
              <strong>Reward</strong>
              <ModalField
                style={{ width: '65%' }}
                onChange={(e) => setReward(parseInt(e.target.value))}
              />
            </div>
          </Stack>
          <ContainedButton
            onClick={(e) => {
              // createPhase2(asset, reward);
            }}
            variant="contained"
            style={{ marginBottom: '20px' }}
          >
            Update
          </ContainedButton>
        </Stack>
      </MainBox>
    </div>
  );
};

export default Admin;
