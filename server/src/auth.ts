import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

/** Janela em que a assinatura e aceita (evita reaproveitar uma assinatura antiga). */
export const AUTH_WINDOW_MS = 2 * 60 * 1000;

/** Mensagem que a carteira assina no cliente (client/src/wallet.ts deve gerar exatamente esta). */
export const claimMessage = (wallet: string, ts: number) => `bomber-idle:claim:${wallet}:${ts}`;

/**
 * Confere que quem chamou /claim e mesmo o dono da carteira.
 * Sem isso, qualquer pessoa poderia pedir o saque de outra carteira e zerar o saldo dela.
 */
export function verifyClaimAuth(wallet: string, ts: unknown, signatureB64: unknown, now = Date.now()): string | null {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "missing timestamp";
  if (typeof signatureB64 !== "string") return "missing signature";
  if (Math.abs(now - ts) > AUTH_WINDOW_MS) return "signature expired";
  try {
    const sig = Buffer.from(signatureB64, "base64");
    if (sig.length !== nacl.sign.signatureLength) return "bad signature";
    const msg = new TextEncoder().encode(claimMessage(wallet, ts));
    return nacl.sign.detached.verify(msg, sig, new PublicKey(wallet).toBytes()) ? null : "bad signature";
  } catch {
    return "bad signature";
  }
}
