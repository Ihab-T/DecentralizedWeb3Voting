import 'dotenv/config';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const signer   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const addr = await signer.getAddress();
console.log('Signer address:', addr);

const net = await provider.getNetwork();
console.log('Network:', net.chainId.toString(), net.name);  // ожидаем 11155111 sepolia

const balance = await provider.getBalance(addr);
console.log('Balance (ETH):', ethers.formatEther(balance));
