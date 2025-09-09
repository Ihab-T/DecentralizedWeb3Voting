// scripts/hash-id.mjs
import { keccak256, toUtf8Bytes } from "ethers";


const ids = [
  "Floor1",
  "Floor2"
];

for (const s of ids) {
  const norm = s.trim().toLowerCase(); // нормализация
  const hex = keccak256(toUtf8Bytes(norm));
  console.log(`${norm} -> ${hex}`);
}
