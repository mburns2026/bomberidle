import test from 'node:test'; import assert from 'node:assert/strict'; import vm from 'node:vm';
import {read} from './harness.mjs';
test('catálogo de skins (skins.js) e preços do servidor (worker.js) estão sincronizados', () => {
  const sb = {window: {}}; vm.runInNewContext(read('skins.js'), sb); const S = sb.window.SKINS;
  const prices = JSON.parse(read('worker.js').match(/SKIN_PRICES = (\[[^\]]*\])/)[1]);
  assert.equal(prices.length, S.length); S.forEach((s, i) => assert.equal(prices[i], s.price, `skin ${i} ${s.n[0]}`));
  S.forEach((s, i) => assert.equal(s.id, i, 'id == índice (compatibilidade com itens já comprados)'));
});
test('toda função chamada em play.html/store.html existe (regressão: act() não existia em play.html)', () => {
  for (const f of ['play.html', 'store.html']) { const src = read(f); if (/\bact\(/.test(src)) assert.match(src, /(async\s+)?function act\(/, f + ' usa act() sem defini-la'); }
});
test('todas as chaves de tradução usadas na interface existem no dicionário i18n', () => {
  const dict = read('i18n.js'), defined = new Set([...dict.matchAll(/\b([A-Za-z0-9_]+)\s*:\s*[\[\'"`]/g)].map(m => m[1])), used = new Set();
  for (const f of ['play.html', 'store.html', 'index.html', 'wallet.js', 'api.js', 'save.js']) { const s = read(f); for (const m of s.matchAll(/data-i="([^"]+)"/g)) used.add(m[1]); for (const m of s.matchAll(/\bt\('([^']+)'\)/g)) used.add(m[1]); }
  assert.deepEqual([...used].filter(k => !defined.has(k)).sort(), []);
});
test('nenhum segredo/chave privada no repositório (varredura simples)', () => {
  for (const f of ['config.js', 'wrangler.toml', 'api.js', 'wallet.js', 'play.html', 'store.html', 'index.html', 'README.md']) {
    const s = read(f); const real = /(ADMIN_KEY|JWT_SECRET)\s*=\s*["'](?!sua|your|<|COLE|xxx)[^"']{6,}/; assert.doesNotMatch(s, real, f + ' (placeholders como "sua-admin-key" são aceitos)'); assert.doesNotMatch(s, /\[\s*\d{1,3}(\s*,\s*\d{1,3}){60,}\s*\]/, f + ' parece conter keypair');
  }
});
