// Regras de segurança do payout.mjs, em funções puras (testáveis sem rede).
// Princípio: o padrão é SIMULAR. Enviar de verdade exige --send E --confirm=<total exato> E, fora da devnet, uma confirmação extra.
export const DEVNET_RPC = 'https://api.devnet.solana.com';
export function parseArgs(argv, env = {}) {
  const a = {send: argv.includes('--send'), allowMainnet: argv.includes('--allow-mainnet'), confirm: null};
  const c = argv.find(x => x.startsWith('--confirm=')); if (c) a.confirm = c.slice(10);
  a.maxRun = Number(env.MAX_RUN ?? 5000); a.rpc = env.RPC || DEVNET_RPC; return a;
}
export const isMainnetRpc = rpc => !/devnet|testnet|localhost|127\.0\.0\.1/i.test(rpc || '');
export const sum = list => Math.round(list.reduce((s, w) => s + w.amount * 1e4, 0)) / 1e4;
// Devolve {ok, reasons[]}. Só envia se TODAS as condições forem satisfeitas.
export function checkSend({args, queue, env = {}}) {
  const r = [], total = sum(queue.withdrawals);
  if (!args.send) return {ok: false, simulate: true, reasons: ['modo simulação (padrão): nada será enviado']};
  if (!queue.withdrawals.length && !(queue.burnPending >= 1)) r.push('nada a fazer');
  if (args.confirm !== String(total)) r.push(`--confirm precisa ser exatamente o total dos saques a enviar (${total}). Recebido: ${args.confirm ?? 'nada'}`);
  if (total > args.maxRun) r.push(`total ${total} excede MAX_RUN=${args.maxRun}. Aumente MAX_RUN conscientemente ou pague em lotes`);
  if (isMainnetRpc(args.rpc)) {
    if (!args.allowMainnet) r.push('RPC não parece devnet: exige --allow-mainnet');
    if (env.CONFIRM_MAINNET !== 'YES') r.push('RPC não parece devnet: exige CONFIRM_MAINNET=YES no ambiente');
  }
  if (queue.processing && queue.processing.length) r.push(`${queue.processing.length} saque(s) em "processing": verifique on-chain e resolva (admin/done ou admin/failed) antes de enviar mais`);
  return {ok: r.length === 0, simulate: false, reasons: r};
}
