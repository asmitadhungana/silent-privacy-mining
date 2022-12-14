// @ts-ignore
import { styled, Typography, TextField, Box } from '@mui/material';
import theme from './Theme';

const ModalHeader = styled(Typography)({
  fontWeight: 800,
  fontSize: '15px',
  fontFamily: 'PT Sans, sans-serif',
  marginBottom: '20px'
});

const ModalField = styled(TextField)({
  width: '55%',
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
    padding: '10px 15px 9px 15px'
  }
});

const ModalMainBox = styled(Box)({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '42%',
  border: '1px solid',
  borderColor: theme.palette.secondary.main,
  borderRadius: '2px',
  padding: '10px 20px 40px 20px',
  textAlign: 'center',
  fontFamily: 'PT Sans, sans-serif'
});

const ModalSubBox = styled(Box)({
  border: '1px solid',
  borderColor: theme.palette.secondary.main,
  borderRadius: '2px',
  padding: '10px 20px',
  margin: '0 10px',
  fontFamily: 'PT Sans, sans-serif'
});

const ModalSubSubBox = styled(Box)({
  border: '1px solid',
  width: '60%',
  borderColor: theme.palette.secondary.main,
  borderRadius: '2px',
  padding: '10px 20px',
  margin: '0 10px',
  fontFamily: 'PT Sans, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  '& div': {
    width: '100%'
  }
});

export { ModalHeader, ModalField, ModalMainBox, ModalSubBox, ModalSubSubBox };
