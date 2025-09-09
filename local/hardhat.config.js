// hardhat.config.js (ESM)
import * as dotenv from "dotenv";
dotenv.config();

/** @type import("hardhat/config").HardhatUserConfig */
const networks = {
  hardhat: { type: "edr-simulated" },
  localhost: { type: "http", url: "http://127.0.0.1:8545" },
};

if (process.env.SEPOLIA_RPC_URL && process.env.PRIVATE_KEY?.startsWith("0x")) {
  networks.sepolia = {
    type: "http",
    url: process.env.SEPOLIA_RPC_URL,
    accounts: [process.env.PRIVATE_KEY],
  };
}

export default {
  solidity: {
    compilers: [
      { version: "0.8.24" }, // для V2 + OpenZeppelin v5
      { version: "0.8.19" }, // для твоих старых контрактов
    ],
    // точечно можно указать, чем компилить конкретный файл:
    overrides: {
      "contracts/ConstructionMilestonesV2.sol": { version: "0.8.24" },
    },
  },
  networks,
};
