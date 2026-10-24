import test from 'node:test'; import assert from 'node:assert/strict'; import {parseArgs, checkSend, sum, isMainnetRpc} from '../lib/payout-guard.mjs';
const Q = {withdrawals: [{id: 1, amount: 100.5}, {id: 2, amount: 200}], processing: [], burnPending: 0};
test('padrão é simulação: sem --send nunca envia', () => { const v = checkSend({args: parseArgs([]), queue: Q}); assert.equal(v.ok, false); assert.equal(v.simulate, true); });
test('--send sozinho NÃO basta: exige --confirm com o total exato', () => {
  assert.equal(checkSend({args: parseArgs(['--send']), queue: Q}).ok, false);
  assert.equal(checkSend({args: parseArgs(['--send', '--confirm=300']), queue: Q}).ok, false, 'total é 300.5');
  assert.equal(checkSend({args: parseArgs(['--send', '--confirm=300.5']), queue: Q}).ok, true);
});
test('limite por execução (MAX_RUN)', () => { const v = checkSend({args: parseArgs(['--send', '--confirm=300.5'], {MAX_RUN: '100'}), queue: Q}); assert.equal(v.ok, false); assert.match(v.reasons.join(), /MAX_RUN/); });
test('fora da devnet exige --allow-mainnet E CONFIRM_MAINNET=YES', () => {
  const rpc = 'https://api.mainnet-beta.solana.com', base = {RPC: rpc};
  assert.equal(isMainnetRpc(rpc), true); assert.equal(isMainnetRpc('https://api.devnet.solana.com'), false);
  assert.equal(checkSend({args: parseArgs(['--send', '--confirm=300.5'], base), queue: Q, env: {}}).ok, false);
  assert.equal(checkSend({args: parseArgs(['--send', '--confirm=300.5', '--allow-mainnet'], base), queue: Q, env: {}}).ok, false);
  assert.equal(checkSend({args: parseArgs(['--send', '--confirm=300.5', '--allow-mainnet'], base), queue: Q, env: {CONFIRM_MAINNET: 'YES'}}).ok, true);
});
test('saques "processing" pendentes bloqueiam novos envios até conferência manual', () => {
  const v = checkSend({args: parseArgs(['--send', '--confirm=300.5']), queue: {...Q, processing: [{id: 9}]}}); assert.equal(v.ok, false); assert.match(v.reasons.join(), /processing/);
});
test('soma sem erro de ponto flutuante', () => assert.equal(sum([{amount: 0.1}, {amount: 0.2}]), 0.3));
