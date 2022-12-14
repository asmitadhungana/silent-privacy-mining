import { MenuItem, TextField, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

const PageHeader = styled(Typography)({
  fontWeight: 800,
  marginLeft: 30,
  fontSize: 30,
  fontFamily: 'PT Sans, sans-serif',
  marginTop: 50
});

const PageText = styled(Typography)({
  fontFamily: 'PT Sans, sans-serif',
  marginLeft: 30
});

const HeaderField = styled(TextField)({
  width: '70%',
  '& label': {
    fontSize: '15px',
    fontFamily: 'PT Sans, sans-serif',
    position: 'absolute',
    top: -4,
    left: 3
  },
  '& input': {
    fontSize: '15px',
    fontFamily: 'PT Sans, sans-serif',
    padding: '15px 15px 9px 15px'
  }
});

const SelectField = styled(TextField)({
  width: '20%',
  '& .MuiSelect-select': {
    fontSize: '15px',
    fontFamily: 'PT Sans, sans-serif',
    padding: '15px 15px 9px 15px'
  }
});

const CustomMenu = styled(MenuItem)({
  fontSize: '15px',
  fontFamily: 'PT Sans, sans-serif'
});

export { PageHeader, PageText, HeaderField, SelectField, CustomMenu };
