// @ts-ignore
import React, { useState } from "react";
import { Stack, ThemeProvider } from "@mui/material";
import theme from "./styles/Theme";
import {
  CustomMenu,
  HeaderField,
  PageHeader,
  PageText,
  SelectField,
} from "./styles/HeaderStyles";
import Earn from "./Earn";
import Claim from "./Claim";
import HeaderButtons from "./HeaderButtons";
import { ContainedButton } from "./styles/CustomButton";

const phases = [
  {
    value: "1",
    label: "Phase 1",
  },
  {
    value: "2",
    label: "Phase 2",
  },
];

const Header = (props: {
  connButtonText: string; connectWallet: () => React.MouseEventHandler<HTMLButtonElement> | undefined; 
}) => {
  const [phase, setPhase] = useState("1");

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPhase(event.target.value);
  };

  return (
    <div>
      <ThemeProvider theme={theme}>
        <Stack
          spacing={1}
          direction='row'
          marginTop={1.5}
          justifyContent='flex-end'>
          <ContainedButton variant='contained'>Kovan</ContainedButton>
          <ContainedButton variant='contained' onClick={(e)=> {props.connectWallet()}}>{props.connButtonText}</ContainedButton>
          <ContainedButton variant='contained'>MasterkEy</ContainedButton>
        </Stack>
        <PageHeader>Privacy Mining Program</PageHeader>
        <PageText marginTop={1.5}>
          Earn Silent Rewards by Depositing assets to your silent account
        </PageText>
        <Stack spacing={1} direction='row' marginTop={3} marginLeft={4}>
          <HeaderField
            id='outlined-basic'
            label='Search for Tokens to Deposit'
            variant='outlined'
          />
          <SelectField
            id='select-phases'
            select
            value={phase}
            onChange={handleChange}
            variant='outlined'>
            {phases.map((option) => (
              <CustomMenu key={option.value} value={option.value}>
                {option.label}
              </CustomMenu>
            ))}
          </SelectField>
        </Stack>
      </ThemeProvider>
      {phase === "1" ? <Earn /> : <Claim />}
    </div>
  );
};

export default Header;
