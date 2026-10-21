import { test } from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { verifyClaimAuth, claimMessage, AUTH_WINDOW_MS } from "../src/auth.js";

const kp = nacl.sign.keyPair();
const wallet = new PublicKey(kp.publicKey).toBase58();
const sign = (w: string, ts: number, secret = kp.secretKey) =>
  Buffer.from(nacl.sign.detached(new TextEncoder().encode(claimMessage(w, ts)), secret)).toString("base64");

test("assinatura valida do dono da carteira passa", () => {
  const ts = Date.now();
  assert.equal(verifyClaimAuth(wallet, ts, sign(wallet, ts)), null);
});

test("assinatura de outra chave e recusada (ninguem saca a carteira alheia)", () => {
  const ts = Date.now();
  const other = nacl.sign.keyPair();
  assert.equal(verifyClaimAuth(wallet, ts, sign(wallet, ts, other.secretKey)), "bad signature");
});

test("assinatura de outra carteira nao serve para esta", () => {
  const ts = Date.now();
  const other = nacl.sign.keyPair();
  const otherWallet = new PublicKey(other.publicKey).toBase58();
  assert.equal(verifyClaimAuth(wallet, ts, sign(otherWallet, ts, other.secretKey)), "bad signature");
});

test("assinatura antiga ou do futuro expira", () => {
  const now = Date.now();
  const old = now - AUTH_WINDOW_MS - 1000;
  assert.equal(verifyClaimAuth(wallet, old, sign(wallet, old), now), "signature expired");
  const future = now + AUTH_WINDOW_MS + 1000;
  assert.equal(verifyClaimAuth(wallet, future, sign(wallet, future), now), "signature expired");
});

test("trocar o timestamp invalida a assinatura", () => {
  const ts = Date.now();
  assert.equal(verifyClaimAuth(wallet, ts + 1, sign(wallet, ts)), "bad signature");
});

test("campos ausentes ou lixo sao recusados sem lancar erro", () => {
  assert.equal(verifyClaimAuth(wallet, undefined, "x"), "missing timestamp");
  assert.equal(verifyClaimAuth(wallet, Date.now(), undefined), "missing signature");
  assert.equal(verifyClaimAuth(wallet, Date.now(), "%%%nao-e-base64%%%"), "bad signature");
});
