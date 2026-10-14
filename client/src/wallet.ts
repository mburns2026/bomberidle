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

export async function requestClaim(wallet: string) {
  const r = await fetch(`${API}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Falha no saque");
  return data as { transaction: string; amount: string; nonce: number };
}
