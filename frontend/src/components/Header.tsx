import React, { useState, MouseEvent } from 'react';
import { useWeb3React } from '@web3-react/core';
import { Stack } from '@mui/material';
import { injected } from '../utils/connectors';
import { useEagerConnect, useInactiveListener } from '../utils/hooks';
import { Provider } from '../utils/provider';
import { ellipseAddress } from '../utils/web3';
import { ContainedButton } from './styles/CustomButton';

const Header = () => {
  const context = useWeb3React<Provider>();
  const { activate, deactivate, active, account } = context;
  const [showDisconnect, setShowDisconnect] = useState(false);

  const handleActivate = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    await activate(injected);
  };

  const handleDeactivate = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    deactivate();
  };

  const onMouseEnter = () => {
    if (active && account) setShowDisconnect(true);
    else setShowDisconnect(false);
  };
  const onMouseLeave = () => {
    if (active && account) setShowDisconnect(false);
    else setShowDisconnect(false);
  };

  const eagerConnectionSuccessful = useEagerConnect();
  useInactiveListener(!eagerConnectionSuccessful);

  return (
    <>
      <Stack spacing={1} direction="row" marginTop={1.5} justifyContent="flex-end">
        <ContainedButton variant="contained">Testnet</ContainedButton>
        <ContainedButton variant="contained">Silent Address</ContainedButton>
        <ContainedButton
          variant="contained"
          onClick={(e) => {
            active ? handleDeactivate(e) : handleActivate(e);
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          {active && account ? (showDisconnect ? 'Disconnect' : ellipseAddress(account)) : 'Connect'}
        </ContainedButton>
      </Stack>
    </>
  );
};

export default Header;
