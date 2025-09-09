// scripts/upgrade-to-v4.js  (ESM)
import fs from "fs";
import pkg from "hardhat";
const { ethers, upgrades, network } = pkg;

// в какой файл писать адреса для текущей сети
function outPath() {
  return network.name === "sepolia"
    ? "addresses.json"
    : `addresses.${network.name}.json`;
}

// Читаем адрес прокси (из env либо из сохранённого файла) и нормализуем
function loadProxyAddress() {
  const fromEnv = process.env.PROXY || process.env.npm_config_proxy || "";
  let a = (fromEnv || "").trim();
  if (a) {
    // примитивная проверка и приведение к нижнему регистру
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      throw new Error(`Invalid proxy address: ${fromEnv}`);
    }
    return a.toLowerCase();
  }
  // пробуем найти в файлах
  for (const file of [outPath(), "addresses.json"]) {
    if (fs.existsSync(file)) {
      try {
        const saved = JSON.parse(fs.readFileSync(file, "utf8"));
        if (saved?.proxy) return String(saved.proxy).trim().toLowerCase();
      } catch {}
    }
  }
  throw new Error(
    "Proxy address not provided. Set PROXY=0x... or put it into addresses.json"
  );
}

async function main() {
  const PROXY = loadProxyAddress();

  const ContractV4 = await ethers.getContractFactory(
    "ConstructionMilestonesV4Upgradeable"
  );

  // апгрейд
  const proxy = await upgrades.upgradeProxy(PROXY, ContractV4);
  await proxy.waitForDeployment();

  const impl = await upgrades.erc1967.getImplementationAddress(PROXY);
  console.log("Proxy still at:", await proxy.getAddress());
  console.log("New implementation:", impl);

  // сохраняем
  const file = outPath();
  let saved = {};
  if (fs.existsSync(file)) {
    try {
      saved = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {}
  }
  saved.proxy = PROXY;
  saved.implementationV4 = impl;
  saved.network = String((await ethers.provider.getNetwork()).chainId);
  fs.writeFileSync(file, JSON.stringify(saved, null, 2));
  console.log("Saved to", file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
