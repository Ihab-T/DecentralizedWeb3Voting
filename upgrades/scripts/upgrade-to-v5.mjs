// scripts/upgrade-to-v5.mjs (ESM)
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ВАЖНО: Hardhat — CJS, поэтому импортируем дефолт и достаём нужное
import hardhat from 'hardhat';
const { ethers, upgrades, network } = hardhat;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Выбор файла адресов по сети
function defaultAddressesPath(net) {
  if (net === 'sepolia')         return path.join(__dirname, '..', 'addresses.json');
  if (net === 'optimismSepolia') return path.join(__dirname, '..', 'addresses.optimismSepolia.json');
  return path.join(__dirname, '..', 'addresses.json');
}

async function readJson(p)  { return JSON.parse(await fs.readFile(p, 'utf8')); }
async function writeJson(p, obj) { await fs.writeFile(p, JSON.stringify(obj, null, 2)); }

async function loadVoters() {
  try {
    const j = await readJson(path.join(__dirname, '..', 'voters.json'));
    const arr = Array.isArray(j) ? j : j?.voters;
    if (Array.isArray(arr) && arr.length === 3) return arr;
  } catch {}
  return null;
}

async function main() {
  const net = network.name; // 'sepolia' или 'optimismSepolia'
  const addressesPath = process.env.ADDRESSES
    ? path.resolve(process.env.ADDRESSES)
    : defaultAddressesPath(net);

  console.log(`Network: ${net}`);
  console.log(`Addresses file: ${addressesPath}`);

  const data  = await readJson(addressesPath);
  const proxy = process.env.PROXY || data.proxy;
  if (!proxy) throw new Error(`В ${addressesPath} нет поля "proxy".`);

  console.log(`Upgrading proxy ${proxy} on ${net}...`);

  const ImplV5 = await ethers.getContractFactory('ConstructionMilestonesV5Upgradeable');
  const voters = await loadVoters();

  try {
    if (voters) {
      console.log('Trying upgrade with initializeV5(voters)...');
      const upgraded = await upgrades.upgradeProxy(proxy, ImplV5, {
        call: { fn: 'initializeV5', args: [voters] }
      });
      await upgraded.waitForDeployment?.();
    } else {
      console.log('No voters.json -> upgrading without call...');
      const upgraded = await upgrades.upgradeProxy(proxy, ImplV5);
      await upgraded.waitForDeployment?.();
    }
  } catch (e) {
    console.warn('First attempt failed (maybe already initialized). Retrying without call...');
    const upgraded = await upgrades.upgradeProxy(proxy, ImplV5);
    await upgraded.waitForDeployment?.();
  }

  const impl = await upgrades.erc1967.getImplementationAddress(proxy);
  console.log(`✅ New implementation: ${impl}`);

  data.implementationV5 = impl;
  await writeJson(addressesPath, data);
  console.log(`Saved to ${addressesPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
