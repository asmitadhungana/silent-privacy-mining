// @ts-ignore
import { styled, Box, Typography } from '@mui/material';
import theme from './Theme';

const MainBox = styled(Box)({
  padding: 1,
  border: '1px solid',
  borderRadius: '3px',
  borderColor: theme.palette.secondary.main,
  margin: '25px',
  position: 'relative',

  '& table': {
    borderCollapse: 'separate',
    borderSpacing: '0 28px',
    width: '100%',
    margin: '50px 20px 20px 20px'
  },

  '& tr': {
    width: '100%',
    outline: 'thin solid',
    outlineColor: theme.palette.secondary.main,
    outlineRadius: '2px',
    position: 'relative'
  },

  '& th, &td': {
    width: '150px',
    textAlign: 'center',
    padding: '25px 0px',
    fontSize: 18,
    fontWeight: 600
  },

  '& td': {
    width: '150px',
    fontSize: 18,
    textAlign: 'center',
    padding: '20px 0'
  }
});

const BoxCircle = styled(Box)({
  position: 'absolute',
  top: 0,
  left: 0,
  border: '1px solid',
  width: 120,
  height: 120,
  borderColor: theme.palette.secondary.main,
  borderRadius: '50%'
});

const CircleText = styled(Typography)({
  fontWeight: 800,
  fontSize: 20,
  fontFamily: 'PT Sans, sans-serif',
  marginTop: 45,
  marginLeft: 20
});

export { BoxCircle, MainBox, CircleText };
