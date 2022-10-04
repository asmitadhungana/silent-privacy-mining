import { Route, Routes } from 'react-router-dom';
import '../App.css';
import Admin from '../components/Admin.tsx';
import Header from '../components/Header.tsx';
import React, { useState } from "react"
import { smaspMethod } from "../api"
import { ethers } from 'ethers';

function App() {
  
  const [connButtonText, setConnButtonText] = useState("Silent Address");
  const [owner, setOwner] = useState(null)


  const connectWallet = async () => {
      if (typeof window.ethereum !== undefined) {
        // set ethers provider
        var provider = new ethers.providers.Web3Provider(window.ethereum);
        var signer = provider.getSigner();
      
        // connect to metamask
        await window.ethereum.request({ method: 'eth_requestAccounts' })
          .then(function (result) {
            setOwner(result[0]);
            setConnButtonText(result[0]);
          })
          .catch(error => {
            console.log(error);
          })
  
      } else {
        // Ethers.js
        console.log('Need to install MetaMask');
      }
  }

  const deposit=async()=>{
    await smaspMethod.depositAssetToPool(owner,0,10);
  }
  return (
    <div className="App">
    
        {/* <Earn 
        connectWallet = {connectWallet}
        connButtonText = {connButtonText}
        />
        <Claim 
        connectWallet = {connectWallet}
        connButtonText = {connButtonText}
        />
        <DepositBox 
        connectWallet = {connectWallet}
        connButtonText = {connButtonText}
        />
        <StakeBox 
        connectWallet = {connectWallet}
        connButtonText = {connButtonText}
        /> */}
      <Routes>
      <Route exact path="/" element={  <Header 
        connectWallet = {connectWallet}
        connButtonText = {connButtonText}
        />}></Route>
        <Route exact path="/admin" element={<Admin />}></Route>
      </Routes>
    </div>
  );
}

export default App;
