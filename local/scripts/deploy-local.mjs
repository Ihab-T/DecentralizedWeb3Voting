import "dotenv/config";
import { JsonRpcProvider, Wallet, ContractFactory } from "ethers";
import artifact from "../artifacts/contracts/ConstructionMilestones.sol/ConstructionMilestones.json" with { type: "json" };

async function main() {
  const rpc = process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545"; // если сменишь порт — поменяй тут
  const pk  = process.env.LOCAL_PRIVATE_KEY; // возьми один из приватных ключей, которые печатает hardhat node

  if (!pk?.startsWith("0x")) throw new Error("Set LOCAL_PRIVATE_KEY in .env (starts with 0x)");

  const provider = new JsonRpcProvider(rpc);
  const wallet   = new Wallet(pk, provider);
  const oracle   = await wallet.getAddress();

  const factory  = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(oracle);
  await contract.waitForDeployment();

  console.log("Deployed at:", await contract.getAddress());
}

main().catch(e => { console.error(e); process.exit(1); });
