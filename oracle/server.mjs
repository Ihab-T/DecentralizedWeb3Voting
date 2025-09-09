import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { SiweMessage } from 'siwe';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/* -------------------- paths -------------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* -------------------- env -------------------- */
const PORT = Number(process.env.PORT ?? 8787);

// L1 (Sepolia)
const SEPOLIA_RPC_URL     = process.env.SEPOLIA_RPC_URL ?? process.env.LOCAL_RPC_URL ?? '';
const CONTRACT_ADDRESS_L1 = process.env.CONTRACT_ADDRESS ?? '';

// L2 (Optimism Sepolia)
const OP_SEPOLIA_RPC_URL  = process.env.OP_SEPOLIA_RPC_URL ?? '';
const CONTRACT_ADDRESS_L2 = process.env.CONTRACT_ADDRESS_L2 ?? '';

// общие
const PRIVATE_KEY   = process.env.PRIVATE_KEY ?? '';
const API_KEY       = process.env.ORACLE_API_KEY ?? '';
const AUTH_SECRET   = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL   = Number(process.env.SESSION_TTL ?? 3600);

const PRIMARY_CHAIN = (process.env.PRIMARY_CHAIN ?? 'l2').toLowerCase(); // 'l1'|'l2'

const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 60);
const LOG_FILE           = process.env.LOG_FILE ?? 'history.jsonl';
const RETRIES            = Number(process.env.RETRIES ?? 3);
const BACKOFF_MS         = Number(process.env.BACKOFF_MS ?? 2000);

/* -------------------- logging jsonl -------------------- */
const logPath = path.join(__dirname, LOG_FILE);
function appendLog(obj) {
  const line = JSON.stringify({ ts: Date.now(), ...obj }) + '\n';
  fs.appendFile(logPath, line, (e) => { if (e) console.error('[log append error]', e); });
}

/* -------------------- helpers -------------------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withRetries(fn, retries = RETRIES, backoff = BACKOFF_MS) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (i < retries) await sleep(backoff * (i + 1)); }
  }
  throw last;
}
const toId = (s) => ethers.id(String(s ?? '').trim().toLowerCase());

function resolveChain(queryChain) {
  const c = String(queryChain || '').toLowerCase();
  if (c === 'l1' || c === 'sepolia') return 'l1';
  if (c === 'l2' || c === 'optimism' || c === 'optimismsepolia') return 'l2';
  return PRIMARY_CHAIN; // по умолчанию — что указано в .env
}

/* -------------------- ABI -------------------- */
/** Базовые методы (как в v3/v4) */
const ABI_BASE = [
  { inputs:[{internalType:'bytes32',name:'elementId',type:'bytes32'},{internalType:'uint8',name:'newStage',type:'uint8'}],
    name:'setStage', outputs:[], stateMutability:'nonpayable', type:'function' },
  { inputs:[{internalType:'bytes32',name:'elementId',type:'bytes32'},{internalType:'string',name:'note',type:'string'}],
    name:'setNote', outputs:[], stateMutability:'nonpayable', type:'function' },
  { inputs:[{internalType:'bytes32',name:'',type:'bytes32'}],
    name:'stageOf', outputs:[{internalType:'uint8',name:'',type:'uint8'}], stateMutability:'view', type:'function' },
  { inputs:[{internalType:'bytes32',name:'',type:'bytes32'}],
    name:'noteOf', outputs:[{internalType:'string',name:'',type:'string'}], stateMutability:'view', type:'function' },
  { inputs:[{internalType:'bytes32',name:'',type:'bytes32'}],
    name:'updatedAt', outputs:[{internalType:'uint256',name:'',type:'uint256'}], stateMutability:'view', type:'function' },
  { inputs:[], name:'version', outputs:[{internalType:'uint256',name:'',type:'uint256'}], stateMutability:'pure', type:'function' }
];

/** Доп. методы V5 (все опциональные — вызываем через try/catch) */
const ABI_V5_EXTRA = [
  // если в контракте есть массив voters (public) — можно читать по индексу
  { inputs:[{internalType:'uint256',name:'',type:'uint256'}], name:'voters',
    outputs:[{internalType:'address',name:'',type:'address'}], stateMutability:'view', type:'function' },

  // или единым вызовом вернуть все 3 адреса
  { inputs:[], name:'getVoters', outputs:[{internalType:'address[3]',name:'',type:'address[3]'}],
    stateMutability:'view', type:'function' },

  // статус голоса конкретного участника (минимальный вариант — только факт голосования)
  { inputs:[{internalType:'bytes32',name:'elementId',type:'bytes32'},{internalType:'address',name:'voter',type:'address'}],
    name:'hasVoted', outputs:[{internalType:'bool',name:'',type:'bool'}], stateMutability:'view', type:'function' },

  // количество «Да» (если есть)
  { inputs:[{internalType:'bytes32',name:'elementId',type:'bytes32'}],
    name:'approvalsOf', outputs:[{internalType:'uint8',name:'',type:'uint8'}], stateMutability:'view', type:'function' },

  // сама транзакция голосования (на будущее)
  { inputs:[{internalType:'bytes32',name:'elementId',type:'bytes32'},{internalType:'bool',name:'approve',type:'bool'}],
    name:'vote', outputs:[], stateMutability:'nonpayable', type:'function' },
];

const ABI = [...ABI_BASE, ...ABI_V5_EXTRA];

/* -------------------- providers / wallets / contracts -------------------- */
const providers = {
  l1: new ethers.JsonRpcProvider(SEPOLIA_RPC_URL),
  l2: new ethers.JsonRpcProvider(OP_SEPOLIA_RPC_URL)
};

const wallets = {
  l1: new ethers.Wallet(PRIVATE_KEY, providers.l1),
  l2: new ethers.Wallet(PRIVATE_KEY, providers.l2)
};

const addresses = {
  l1: CONTRACT_ADDRESS_L1,
  l2: CONTRACT_ADDRESS_L2
};

function contractFor(chain, withSigner = true) {
  const addr = addresses[chain];
  if (!addr || !addr.startsWith('0x')) throw new Error(`contract address for ${chain} is not set`);
  const provOrSigner = withSigner ? wallets[chain] : providers[chain];
  return new ethers.Contract(addr, ABI, provOrSigner);
}

/* -------------------- express -------------------- */
const app = express();
app.use(cors());
app.use(express.json());

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMIT_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false
}));

// статика (admin.html, history.html)
app.use(express.static('public'));

/* -------------------- SIWE (как было) -------------------- */
const nonces = new Map();
const clientKey = (req) => (req.ip ?? req.headers['x-forwarded-for'] ?? 'local') + '|' + (req.headers['user-agent'] ?? '');

function checkAuth(req, res, next) {
  if (API_KEY) {
    const k = req.get('x-api-key') || req.get('X-API-KEY');
    if (k === API_KEY) return next();
  }
  const auth = req.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    try {
      const token   = auth.slice(7);
      const payload = jwt.verify(token, AUTH_SECRET);
      req.user = { address: payload.sub };
      return next();
    } catch (e) { /* fallthrough */ }
  }
  return res.status(401).json({ ok:false, error:'unauthorized' });
}

/* -------------------- status -------------------- */
app.get('/status', async (req, res) => {
  try {
    const [n1, n2] = await Promise.all([
      providers.l1.getNetwork(),
      providers.l2.getNetwork()
    ]);

    res.json({
      ok:true,
      primary: PRIMARY_CHAIN,
      l1: { chainId: Number(n1.chainId), wallet: wallets.l1?.address, contract: addresses.l1 },
      l2: { chainId: Number(n2.chainId), wallet: wallets.l2?.address, contract: addresses.l2 },
    });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message ?? e) });
  }
});

/* -------------------- SIWE endpoints -------------------- */
app.get('/auth/siwe/nonce', (req, res) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  nonces.set(clientKey(req), { nonce, ts: Date.now() });
  res.json({ ok:true, nonce });
});

app.post('/auth/siwe/verify', async (req, res) => {
  try {
    const { message, signature } = req.body || {};
    if (!message || !signature) return res.status(400).json({ ok:false, error:'bad input' });

    const saved = nonces.get(clientKey(req));
    if (!saved) return res.status(400).json({ ok:false, error:'nonce_missing' });

    const msg     = new SiweMessage(message);
    const domain  = req.headers.host;
    const checked = await msg.verify({ signature, domain, nonce: saved.nonce });
    if (!checked.success) return res.status(401).json({ ok:false, error:'invalid_signature' });

    const address = checked.data.address.toLowerCase();

    if (process.env.ALLOW_ADDRESSES) {
      const allow = process.env.ALLOW_ADDRESSES.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!allow.includes(address)) return res.status(403).json({ ok:false, error:'not allowed' });
    }

    nonces.delete(clientKey(req));

    const token = jwt.sign({ sub: address }, AUTH_SECRET, { expiresIn: SESSION_TTL });
    res.json({ ok:true, token, address, did:`did:pkh:eip155:${checked.data.chainId}:${address}` });
  } catch (e) {
    res.status(401).json({ ok:false, error: String(e?.message ?? e) });
  }
});

/* -------------------- history -------------------- */
app.get('/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 1000);
  try {
    if (!fs.existsSync(logPath)) return res.json([]);
    const lines = fs.readFileSync(logPath, 'utf8')
      .trim().split('\n').filter(Boolean).slice(-limit).map(l => JSON.parse(l));
    res.json(lines);
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message ?? e) });
  }
});

/* -------------------- write endpoints (как были) -------------------- */
app.post('/set-stage', checkAuth, async (req, res) => {
  try {
    const chain     = resolveChain(req.body?.chain);
    const elementId = String(req.body?.elementId ?? '').trim();
    const stageNum  = Number(req.body?.stage);
    if (!elementId) return res.status(400).json({ ok:false, error:'elementId is required' });
    if (!Number.isInteger(stageNum) || stageNum < 0 || stageNum > 255)
      return res.status(400).json({ ok:false, error:'stage must be integer 0..255' });

    const idBytes32 = toId(elementId);
    const c = contractFor(chain, true);

    const tx      = await withRetries(() => c.setStage(idBytes32, stageNum));
    const receipt = await withRetries(() => tx.wait());

    appendLog({ type:'setStage', chain, elementId, stage: stageNum, actor: req.user?.address ?? null,
      did: req.user ? `did:pkh:eip155:${chain==='l2' ? 11155420:11155111}:${req.user.address}` : null,
      txHash: tx.hash, blockNumber: receipt.blockNumber });

    res.json({ ok:true, txHash: tx.hash, blockNumber: receipt.blockNumber });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message ?? e) });
  }
});

app.post('/set-note', checkAuth, async (req, res) => {
  try {
    const chain     = resolveChain(req.body?.chain);
    const elementId = String(req.body?.elementId ?? '').trim();
    const note      = String(req.body?.note ?? '');
    if (!elementId) return res.status(400).json({ ok:false, error:'elementId is required' });
    if (note.length > 1000) return res.status(400).json({ ok:false, error:'note too long (max 1000 chars)' });

    const idBytes32 = toId(elementId);
    const c = contractFor(chain, true);

    const tx      = await withRetries(() => c.setNote(idBytes32, note));
    const receipt = await withRetries(() => tx.wait());

    appendLog({ type:'setNote', chain, elementId, note, actor: req.user?.address ?? null,
      did: req.user ? `did:pkh:eip155:${chain==='l2' ? 11155420:11155111}:${req.user.address}` : null,
      txHash: tx.hash, blockNumber: receipt.blockNumber });

    res.json({ ok:true, txHash: tx.hash, blockNumber: receipt.blockNumber });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message ?? e) });
  }
});

/* -------------------- read endpoints (старые + новые V5) -------------------- */

// базовый stage
app.get('/stage-of/:elementId', async (req, res) => {
  try {
    const chain = resolveChain(req.query?.chain);
    const raw   = String(req.params.elementId ?? '').trim();
    if (!raw) return res.status(400).json({ ok:false, error:'elementId required' });

    const id = toId(raw);
    const c  = contractFor(chain, false);
    const v  = await c.stageOf(id);
    res.json({ ok:true, chain, elementId: raw, stage: Number(v) });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message ?? e) });
  }
});

// агрегированная инфа (как раньше)
app.get('/info/:elementId', async (req, res) => {
  try {
    const chain = resolveChain(req.query?.chain);
    const raw   = String(req.params.elementId ?? '').trim();
    if (!raw) return res.status(400).json({ ok:false, error:'elementId required' });

    const id = toId(raw);
    const c  = contractFor(chain, false);

    const out = { ok:true, elementId: raw, chain };
    try { out.stage     = Number(await c.stageOf(id)); }   catch {}
    try { out.updatedAt = Number(await c.updatedAt(id)); } catch {}
    try { out.note      = await c.noteOf(id); }            catch {}
    try { out.version   = Number(await c.version()); }     catch {}
    if (out.updatedAt) out.updatedAtISO = new Date(out.updatedAt * 1000).toISOString();

    res.json(out);
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message ?? e) });
  }
});

/* -------- V5: список голосующих -------- */
app.get('/v5/voters', async (req, res) => {
  try {
    const chain = resolveChain(req.query?.chain);
    const c     = contractFor(chain, false);

    let voters = [];
    // пробуем getVoters()
    try {
      const arr = await c.getVoters();
      voters = Array.from(arr);
    } catch {
      // фолбэк: voters(i)
      try {
        const v0 = await c.voters(0);
        const v1 = await c.voters(1);
        const v2 = await c.voters(2);
        voters = [v0, v1, v2];
      } catch {}
    }

    res.json({ ok:true, chain, voters });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message ?? e) });
  }
});

/* -------- V5: статусы голосов по элементу -------- */
app.get('/v5/votes/:elementId', async (req, res) => {
  try {
    const chain = resolveChain(req.query?.chain);
    const raw   = String(req.params.elementId ?? '').trim();
    if (!raw) return res.status(400).json({ ok:false, error:'elementId required' });

    const id = toId(raw);
    const c  = contractFor(chain, false);

    // возьмём список голосующих (через /v5/voters-логику)
    let voters = [];
    try {
      const arr = await c.getVoters();
      voters = Array.from(arr);
    } catch {
      try {
        voters = [ await c.voters(0), await c.voters(1), await c.voters(2) ];
      } catch {}
    }

    const perVoter = [];
    let approvals  = undefined; // попробуем получить, но не обязательно
    try {
      const a = await c.approvalsOf(id);
      approvals = Number(a);
    } catch {}

    for (const addr of voters) {
      if (!addr) continue;
      const row = { address: addr, voted: null };
      try {
        const hv = await c.hasVoted(id, addr);
        row.voted = !!hv;
      } catch {
        // если метода нет — оставим null
      }
      perVoter.push(row);
    }

    // полезно знать и текущую стадию
    let stage = undefined;
    try { stage = Number(await c.stageOf(id)); } catch {}

    res.json({ ok:true, chain, elementId: raw, stage, approvals, voters: perVoter });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message ?? e) });
  }
});

/* -------------------- start -------------------- */
app.listen(PORT, () => console.log(`✅ AFS oracle is listening on http://localhost:${PORT}`));

async function init() {
  // быстрые проверки подключения
  const [n1, n2] = await Promise.all([
    providers.l1.getNetwork(),
    providers.l2.getNetwork()
  ]);
  console.log(`L1 chainId=${n1.chainId}, wallet=${wallets.l1.address}, contract=${addresses.l1}`);
  console.log(`L2 chainId=${n2.chainId}, wallet=${wallets.l2.address}, contract=${addresses.l2}`);
  if (!PRIVATE_KEY?.startsWith('0x')) throw new Error('PRIVATE_KEY is not set or has no 0x-prefix');
  if (!addresses.l1?.startsWith('0x')) console.warn('⚠ CONTRACT_ADDRESS (L1) is empty');
  if (!addresses.l2?.startsWith('0x')) console.warn('⚠ CONTRACT_ADDRESS_L2 (L2) is empty');
}
init().catch(e => { console.error('Init error:', e); process.exit(1); });
