// scripts/upgrade-proxy.js (ESM)
import fs from "fs";
import pkg from "hardhat";
const { ethers, upgrades } = pkg;

const saved = JSON.parse(fs.readFileSync("addresses.json", "utf8"));
const PROXY_ADDRESS = saved.proxy;

// Явно вызываем reinitializer без аргументов
const CALL_OPTIONS = {
  call: { fn: "initializeV3", args: [] },
};

async function main() {
  console.log("Upgrading proxy:", PROXY_ADDRESS);

  const ContractV3 = await ethers.getContractFactory("ConstructionMilestonesV3Upgradeable");
  const proxy = await upgrades.upgradeProxy(PROXY_ADDRESS, ContractV3, CALL_OPTIONS);
  await proxy.waitForDeployment();

  const impl = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("✅ Proxy still at:", await proxy.getAddress());
  console.log("✅ New implementation:", impl);

  fs.writeFileSync(
    "addresses.json",
    JSON.stringify({ ...saved, implementationV3: impl }, null, 2)
  );
  console.log("Saved to addresses.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
