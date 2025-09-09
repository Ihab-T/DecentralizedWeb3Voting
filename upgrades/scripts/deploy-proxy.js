// scripts/deploy-proxy.js
import hre from "hardhat";
const { ethers, upgrades } = hre;
import fs from "fs";

async function main() {
  // 1) Адрес оракула, который будет иметь право вызывать setStage
  //    Подставь сюда адрес того же кошелька, что использует твой сервер afs-oracle
  const ORACLE_ADDRESS = "0x566eb02f012565d633f7a97907b03E1e187eA080"; // <-- замени на свой

  // 2) Берём фабрику апгрейдируемого контракта
  //    Имя контракта — как в файле .sol (например, contract ConstructionMilestonesV2 is ...)
  const Contract = await ethers.getContractFactory("ConstructionMilestonesV1Upgradeable");

  // 3) Деплоим прокси (UUPS) с вызовом initialize(oracle)
  const proxy = await upgrades.deployProxy(Contract, [ORACLE_ADDRESS], {
    kind: "uups",
    initializer: "initialize",
  });
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  console.log("Proxy deployed to:", proxyAddress);

  // 4) Узнаём адрес реализации (implementation) и admin (для UUPS admin — внутри прокси, но вытащим для записи)
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("Implementation:", implAddress);

  // 5) Сохраним адреса в файл
  const out = { proxy: proxyAddress, implementation: implAddress, network: (await ethers.provider.getNetwork()).chainId.toString() };
  fs.writeFileSync("addresses.json", JSON.stringify(out, null, 2));
  console.log("Saved to addresses.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
