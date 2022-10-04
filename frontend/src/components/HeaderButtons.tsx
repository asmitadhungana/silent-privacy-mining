// @ts-ignore
import { Stack } from "@mui/material";
import { ContainedButton } from "./styles/CustomButton";

const HeaderButtons = () => {
  return (
    <Stack
      spacing={1}
      direction='row'
      marginTop={1.5}
      justifyContent='flex-end'>
      <ContainedButton variant='contained'>Kovan</ContainedButton>
      <ContainedButton variant='contained'>Silent Address</ContainedButton>
      <ContainedButton variant='contained'>MasterkEy</ContainedButton>
    </Stack>
  );
};

export default HeaderButtons;
