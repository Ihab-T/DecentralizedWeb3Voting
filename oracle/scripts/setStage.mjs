import 'dotenv/config';
import { ethers } from 'ethers';

// --- чтение аргументов из командной строки ---
const [elementId, newStageStr] = process.argv.slice(2);
if (!elementId || newStageStr === undefined) {
  console.error('Usage: node scripts/setStage.mjs <elementId> <stage>');
  console.error('Example: node scripts/setStage.mjs floor1 2');
  process.exit(1);
}

const newStage = Number(newStageStr);
if (!Number.isInteger(newStage) || newStage < 0 || newStage > 255) {
  console.error('Stage must be an integer in [0..255].');
  process.exit(1);
}

// --- провайдер и кошелёк (подписант) ---
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const signer   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- адрес контракта и минимальный ABI ---
const CONTRACT = process.env.CONTRACT_ADDRESS;
if (!CONTRACT || !CONTRACT.startsWith('0x') || CONTRACT.length !== 42) {
  console.error('Invalid CONTRACT_ADDRESS in .env');
  process.exit(1);
}

const abi = [
  "function stageOf(bytes32) view returns (uint8)",
  "function setStage(bytes32 elementId, uint8 newStage)"
];

// --- helper: bytes32 id = keccak256(lowercase) как в Unity ---
const id = (s) => ethers.id(String(s).toLowerCase());

// --- основной код ---
try {
  console.log('Signer:', await signer.getAddress());
  const net = await provider.getNetwork();
  console.log('Network:', net.chainId.toString(), net.name);

  const cm = new ethers.Contract(CONTRACT, abi, signer);
  const key = id(elementId);

  // показать текущее значение
  const before = await cm.stageOf(key);
  console.log(`Before: stageOf(${elementId}) = ${Number(before)}`);

  // отправить транзакцию
  const tx = await cm.setStage(key, newStage);
  console.log('Tx sent:', tx.hash);
  await tx.wait(); // ждем майнинга

  // перечитать
  const after = await cm.stageOf(key);
  console.log(`After:  stageOf(${elementId}) = ${Number(after)}`);

  console.log('Done ✅');
} catch (err) {
  console.error('ERROR:', err);
  process.exit(1);
}
