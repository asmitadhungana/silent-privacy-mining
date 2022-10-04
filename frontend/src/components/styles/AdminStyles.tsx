// @ts-ignore
import { styled, Typography, TextField } from "@mui/material";

const BoxHeader = styled(Typography)({
  fontWeight: 800,
  fontSize: "20px",
  fontFamily: "PT Sans, sans-serif",
  margin: "10px",
});

const BoxSubHeader = styled(Typography)({
  fontWeight: 800,
  fontSize: "22px",
  fontFamily: "PT Sans, sans-serif",
  margin: "10px 0px 25px 0px",
  textAlign: "center",
});

const AdminSelectField = styled(TextField)({
  width: "65%",
  "& .MuiSelect-select": {
    fontSize: "15px",
    fontFamily: "PT Sans, sans-serif",
    padding: "10px 15px 9px 15px",
  },
});

export { BoxHeader, BoxSubHeader, AdminSelectField };
