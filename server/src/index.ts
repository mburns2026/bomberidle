import "dotenv/config";
import express from "express";
import cors from "cors";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getPlayer } from "./store.js";
import { settle } from "./game/farming.js";
import { buildClaimTx } from "./solana/claim.js";

const app = express();
app.use(cors());
app.use(express.json());

const env = process.env;
const solana =
  env.REWARD_MINT && env.SERVER_AUTHORITY_SECRET
    ? {
        connection: new Connection(env.RPC_URL ?? "https://api.devnet.solana.com"),
        programId: new PublicKey(env.PROGRAM_ID!),
        rewardMint: new PublicKey(env.REWARD_MINT),
        serverAuthority: Keypair.fromSecretKey(bs58.decode(env.SERVER_AUTHORITY_SECRET)),
      }
    : null;

const validWallet = (w: unknown): w is string => {
  try { return typeof w === "string" && !!new PublicKey(w); } catch { return false; }
};

app.get("/health", (_req, res) => res.json({ ok: true, onchain: !!solana }));

// TODO: autenticar com assinatura de mensagem (Sign-In With Solana) em todas as rotas.
app.get("/player/:wallet", (req, res) => {
  if (!validWallet(req.params.wallet)) return res.status(400).json({ error: "invalid wallet" });
  const p = getPlayer(req.params.wallet);
  settle(p);
  res.json({
    wallet: p.wallet,
    heroes: p.heroes,
    pending: p.pending.toString(),
    nonce: p.nonce,
  });
});

app.post("/claim", async (req, res) => {
  const { wallet } = req.body ?? {};
  if (!validWallet(wallet)) return res.status(400).json({ error: "invalid wallet" });
  if (!solana) return res.status(503).json({ error: "on-chain claim not configured" });

  const p = getPlayer(wallet);
  settle(p);
  if (p.pending <= 0n) return res.status(400).json({ error: "nothing to claim" });

  const amount = p.pending;
  const nonce = p.nonce + 1;
  try {
    const tx = await buildClaimTx(solana, new PublicKey(wallet), amount, BigInt(nonce));
    // Reserva o saldo/nonce; em producao confirme on-chain antes de dar baixa definitiva.
    p.pending = 0n;
    p.nonce = nonce;
    res.json({ transaction: tx, amount: amount.toString(), nonce });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

const port = Number(env.PORT ?? 3001);
app.listen(port, () => console.log(`server on :${port}`));
