require('dotenv').config();
require('@nomicfoundation/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    // скопируйте значения из .env вашего afs-test
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: [process.env.PRIVATE_KEY].filter(Boolean),
    },
    optimismSepolia: { url: process.env.OP_SEPOLIA_RPC_URL, accounts: [process.env.PRIVATE_KEY].filter(Boolean) },
  }
};
