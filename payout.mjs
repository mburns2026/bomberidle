// Paga os saques pendentes e queima os tokens "gastos" no jogo — na rede escolhida (devnet para testes).
// A chave da tesouraria fica SÓ no seu computador (nunca no servidor). Uso:
//   node payout.mjs                          → SIMULAÇÃO (padrão): só mostra o que faria
//   node payout.mjs --send --confirm=<TOTAL> → envia de verdade (TOTAL = soma exata mostrada na simulação)
// Variáveis: API, ADMIN_KEY, MINT, KEYPAIR (caminho do .json da tesouraria), RPC (padrão: devnet), MAX_RUN (padrão 5000)
// Fora da devnet: exige também --allow-mainnet e CONFIRM_MAINNET=YES. NUNCA rode em mainnet sem auditoria e sem aprovação explícita.
// Segurança contra pagamento duplo: cada saque é RESERVADO (/admin/claim → "processing") antes de enviar. Se o envio der erro
// DEPOIS de transmitido (ex.: timeout), o saque fica "processing" para você conferir on-chain — o script nunca reenvia sozinho.
import fs from 'node:fs';
import {Connection, Keypair, PublicKey} from '@solana/web3.js';
import {getOrCreateAssociatedTokenAccount, transfer, burn, getMint} from '@solana/spl-token';
import {parseArgs, checkSend, sum} from './lib/payout-guard.mjs';

const {API, ADMIN_KEY, MINT, KEYPAIR} = process.env, args = parseArgs(process.argv.slice(2), process.env);
if (!API || !ADMIN_KEY || !MINT || !KEYPAIR) { console.error('Defina API, ADMIN_KEY, MINT e KEYPAIR.'); process.exit(1); }
const H = {'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY};
const post = async (p, b) => { const r = await fetch(API + p, {method: 'POST', headers: H, body: JSON.stringify(b)}); const j = await r.json().catch(() => ({})); return {ok: r.ok, ...j}; };
const q = await (await fetch(API + '/admin/queue', {headers: {'X-Admin-Key': ADMIN_KEY}})).json();
if (!q.withdrawals) { console.error('Resposta inesperada da API (ADMIN_KEY correta?):', q); process.exit(1); }
const verdict = checkSend({args, queue: q, env: process.env});
console.log(`${args.send ? 'ENVIO REAL' : 'SIMULAÇÃO'} | rede: ${args.rpc} | saques pendentes: ${q.withdrawals.length} (total ${sum(q.withdrawals)}) | em revisão: ${(q.review || []).length} | em processing: ${(q.processing || []).length} | queima pendente: ${q.burnPending}`);
for (const w of q.withdrawals) console.log(`  saque #${w.id}: ${w.amount} → ${w.wallet}`);
if (q.burnPending >= 1) console.log(`  queimar ${q.burnPending} tokens da tesouraria`);
if (!verdict.ok) { for (const r of verdict.reasons) console.log((verdict.simulate ? '  ℹ ' : '  ⛔ ') + r); if (!verdict.simulate) process.exit(2); process.exit(0); }

const conn = new Connection(args.rpc, 'confirmed'), payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR, 'utf8')))), mint = new PublicKey(MINT);
const unit = 10n ** BigInt((await getMint(conn, mint)).decimals), raw = x => BigInt(Math.round(x * 1e4)) * unit / 10000n;
const src = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
for (const w of q.withdrawals) {
  const claim = await post('/admin/claim', {id: w.id});   // reserva: se outra execução já pegou, 409 e seguimos
  if (!claim.ok) { console.log(`  #${w.id}: já reservado por outra execução — ignorado`); continue; }
  let dst;
  try { dst = await getOrCreateAssociatedTokenAccount(conn, payer, mint, new PublicKey(w.wallet)); }
  catch (e) { console.error(`  #${w.id} falhou ANTES de enviar (${e.message}) → devolvendo saldo`); await post('/admin/failed', {id: w.id}); continue; }   // nada foi transmitido: seguro devolver
  try { const sig = await transfer(conn, payer, src.address, dst.address, payer, raw(w.amount)); await post('/admin/done', {id: w.id, sig}); console.log('  ok', w.id, sig); }
  catch (e) { console.error(`  #${w.id} ERRO NO ENVIO (${e.message}). NÃO reenvie: confira a tesouraria on-chain. Fica em "processing" até você resolver (admin/done com a assinatura, ou admin/failed se comprovadamente não saiu).`); }
}
if (q.burnPending >= 1) {
  try { const sig = await burn(conn, payer, src.address, mint, payer, raw(q.burnPending)); await post('/admin/burned', {amount: q.burnPending, sig}); console.log('  queima ok', sig); }
  catch (e) { console.error('  queima falhou:', e.message); }
}
