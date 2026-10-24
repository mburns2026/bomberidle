import "dotenv/config";
import express from "express";
import cors from "cors";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getPlayer } from "./store.js";
import { settle } from "./game/farming.js";
import { buildClaimTx, fetchLastNonce } from "./solana/claim.js";
import { verifyClaimAuth } from "./auth.js";

const app = express();
const env = process.env;
app.set("trust proxy", 1); // atras de proxy (Render, Railway, Fly...) o IP real vem do cabecalho
app.use(cors(env.CORS_ORIGIN ? { origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()) } : undefined));
app.use(express.json({ limit: "10kb" }));

// Limite simples por IP (60 req/min). Em producao prefira um limitador de verdade (Redis/proxy).
const hits = new Map<string, { n: number; reset: number }>();
app.use((req, res, next) => {
  const ip = req.ip ?? "?", now = Date.now(), h = hits.get(ip);
  if (!h || now > h.reset) { hits.set(ip, { n: 1, reset: now + 60_000 }); return next(); }
  if (++h.n > 60) return res.status(429).json({ error: "too many requests" });
  next();
});
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now > h.reset) hits.delete(ip); }, 60_000).unref();

const configured = !!(env.REWARD_MINT && env.SERVER_AUTHORITY_SECRET && env.PROGRAM_ID);
if (!configured && (env.REWARD_MINT || env.SERVER_AUTHORITY_SECRET || env.PROGRAM_ID))
  console.warn("on-chain parcialmente configurado: defina REWARD_MINT, SERVER_AUTHORITY_SECRET e PROGRAM_ID juntos");
const solana = configured
  ? {
      connection: new Connection(env.RPC_URL ?? "https://api.devnet.solana.com"),
      programId: new PublicKey(env.PROGRAM_ID!),
      rewardMint: new PublicKey(env.REWARD_MINT!),
      serverAuthority: Keypair.fromSecretKey(bs58.decode(env.SERVER_AUTHORITY_SECRET!)),
    }
  : null;
// Mesmo valor passado a `initialize`/`set_max_claim`: saques maiores sao divididos em varios.
const maxClaim = env.MAX_CLAIM ? BigInt(env.MAX_CLAIM) : null;

const validWallet = (w: unknown): w is string => {
  try { return typeof w === "string" && !!new PublicKey(w); } catch { return false; }
};

app.get("/health", (_req, res) => res.json({ ok: true, onchain: !!solana }));

app.get("/player/:wallet", (req, res) => {
  if (!validWallet(req.params.wallet)) return res.status(400).json({ error: "invalid wallet" });
  const p = getPlayer(req.params.wallet);
  settle(p);
  res.json({
    wallet: p.wallet,
    heroes: p.heroes,
    pending: p.pending.toString(),
    reserved: p.reserved ? p.reserved.amount.toString() : null,
    nonce: p.nonce,
  });
});

app.post("/claim", async (req, res) => {
  const { wallet, ts, signature } = req.body ?? {};
  if (!validWallet(wallet)) return res.status(400).json({ error: "invalid wallet" });
  const authError = verifyClaimAuth(wallet, ts, signature);
  if (authError) return res.status(401).json({ error: authError });
  if (!solana) return res.status(503).json({ error: "on-chain claim not configured" });

  const p = getPlayer(wallet);
  try {
    const user = new PublicKey(wallet);
    const onchain = Number(await fetchLastNonce(solana, user));
    // O saque anterior ja foi registrado na cadeia? Entao a reserva esta paga.
    if (p.reserved && onchain >= p.reserved.nonce) p.reserved = undefined;
    p.nonce = Math.max(p.nonce, onchain);

    // Sem reserva aberta: separa um novo saque do saldo. (Daqui ate `reserved` nao ha await: sem corrida entre pedidos.)
    if (!p.reserved) {
      settle(p);
      if (p.pending <= 0n) return res.status(400).json({ error: "nothing to claim" });
      const amount = maxClaim !== null && p.pending > maxClaim ? maxClaim : p.pending;
      p.pending -= amount;
      p.reserved = { amount, nonce: p.nonce + 1 };
    }

    // Se o jogador nao assinar/enviar, a reserva continua e o proximo pedido reconstroi a MESMA transacao
    // (mesmo valor e nonce, blockhash novo). O nonce on-chain impede pagamento duplo.
    const tx = await buildClaimTx(solana, user, p.reserved.amount, BigInt(p.reserved.nonce));
    res.json({ transaction: tx, amount: p.reserved.amount.toString(), nonce: p.reserved.nonce });
  } catch (e) {
    console.error("claim failed", e);
    res.status(500).json({ error: "claim failed, try again" });
  }
});

const port = Number(env.PORT ?? 3001);
app.listen(port, () => console.log(`server on :${port}`));
