import { Web3ReactProvider } from '@web3-react/core';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { App } from './App';
import './index.css';
import { getProvider } from './utils/provider';
import theme from './components/styles/Theme';

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Web3ReactProvider getLibrary={getProvider}>
      <ThemeProvider theme={theme}>
        <Router>
          <App />
        </Router>
      </ThemeProvider>
    </Web3ReactProvider>
  </React.StrictMode>
);
