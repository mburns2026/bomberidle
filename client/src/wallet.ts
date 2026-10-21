// Integracao minima com Phantom. Para producao, use @solana/wallet-adapter.
declare global { interface Window { solana?: any } }

export const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function connect(): Promise<string> {
  if (!window.solana?.isPhantom) throw new Error("Instale a carteira Phantom");
  const { publicKey } = await window.solana.connect();
  return publicKey.toString();
}

export async function fetchPlayer(wallet: string) {
  const r = await fetch(`${API}/player/${wallet}`);
  return r.json();
}

const toBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

/**
 * Pede o saque ao servidor. A carteira assina uma mensagem com data/hora para provar que e a dona:
 * sem isso, qualquer pessoa poderia chamar /claim com a carteira de outra e zerar o saldo dela.
 * (Mesma mensagem que o servidor valida em server/src/auth.ts.)
 */
export async function requestClaim(wallet: string) {
  const ts = Date.now();
  const message = `bomber-idle:claim:${wallet}:${ts}`;
  const signed = await window.solana.signMessage(new TextEncoder().encode(message), "utf8");
  const r = await fetch(`${API}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, ts, signature: toBase64(signed.signature) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Falha no saque");
  return data as { transaction: string; amount: string; nonce: number };
}
