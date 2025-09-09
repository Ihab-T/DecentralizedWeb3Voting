// scripts/deploy-v5.mjs
import fs from 'node:fs';
import path from 'node:path';
import pkg from 'hardhat';
const { ethers, upgrades, network } = pkg;

function getArg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

async function main() {
  console.log(`[deploy-v5] network = ${network.name}`);

  // 1) читаем voters.json
  const votersJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'voters.json'), 'utf8'));

  // 2) определяем chainId
  const net = await ethers.provider.getNetwork();
  const chainId = String(net.chainId);
  console.log(`[deploy-v5] chainId = ${chainId}`);

  const ROLEMAP = votersJson[chainId] || {};
  const voters = Object.keys(ROLEMAP);
  if (!voters.length) throw new Error(`voters.json не содержит адресов для chainId=${chainId}`);

  // валидация адресов
  for (const a of voters) {
    if (!ethers.isAddress(a)) throw new Error(`Некорректный адрес в voters.json: ${a}`);
  }
  console.log('[deploy-v5] voters =', voters);

  // 3) деплой прокси с инициализацией initializeV5(address[])
  const Factory = await ethers.getContractFactory('ConstructionMilestonesV5Upgradeable');
  const proxy = await upgrades.deployProxy(Factory, [voters], { initializer: 'initializeV5' });
  await proxy.waitForDeployment();

  const proxyAddr = await proxy.getAddress();
  const implAddr = await upgrades.erc1967.getImplementationAddress(proxyAddr);

  console.log('✅ Proxy deployed at:', proxyAddr);
  console.log('✅ Implementation V5:', implAddr);

  // 4) сохраним адреса в файл
  const outFile = getArg('--addresses', `addresses.${network.name}.json`);
  const out = { proxy: proxyAddr, implementationV5: implAddr, network: chainId };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log('Saved to', outFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
