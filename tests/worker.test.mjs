import test from 'node:test'; import assert from 'node:assert/strict';
import {mkenv, call, req, adm, admGet, seed, row, rows, f, addSnake, tokenFor, newWallet} from './harness.mjs';

test('instalação nova: todos os endpoints de escrita funcionam (regressão do schema quebrado)', async () => {
  const e = mkenv(), w = 'p_fresh'; seed(e, w, {bal: 1000});
  for (const [p, b] of [['/me'], ['/sync', {}], ['/shop', {item: 'vip'}], ['/gacha', {}], ['/farm/claim', {}], ['/snakes']]) { const r = await call(e, w, p, b); assert.equal(r.status, 200, p + ' -> ' + JSON.stringify(r.body)); }
});

test('login real: assinatura Ed25519, nonce de uso único, assinatura inválida, saldo inicial só em testnet', async () => {
  for (const [testnet, expected] of [['1', 100], ['0', 0]]) {
    const e = mkenv({TESTNET: testnet}), W = newWallet();
    const n = await call(e, null, '/auth/nonce', {wallet: W.addr}); assert.equal(n.status, 200);
    const bad = await call(e, null, '/auth/verify', {wallet: W.addr, nonce: n.body.nonce, signature: Buffer.alloc(64).toString('base64')}); assert.equal(bad.status, 401);   // consumiu o nonce
    const n2 = await call(e, null, '/auth/nonce', {wallet: W.addr});
    const ok = await call(e, null, '/auth/verify', {wallet: W.addr, nonce: n2.body.nonce, signature: W.sign(n2.body.message)});
    assert.equal(ok.status, 200); assert.equal(ok.body.state.bal, expected, 'TESTNET=' + testnet);
    const replay = await call(e, null, '/auth/verify', {wallet: W.addr, nonce: n2.body.nonce, signature: W.sign(n2.body.message)}); assert.equal(replay.status, 401, 'replay');
    const me = await req(e, '/me', {token: ok.body.token}); assert.equal(me.status, 200);
  }
});

test('auth: token forjado, expirado e sem token são rejeitados; CORS não vaza para origem estranha', async () => {
  const e = mkenv(); seed(e, 'p_auth');
  assert.equal((await req(e, '/me', {token: tokenFor('p_auth').slice(0, -2) + 'xx'})).status, 401);
  assert.equal((await req(e, '/me', {token: tokenFor('p_auth', Date.now() - 1)})).status, 401);
  assert.equal((await req(e, '/me')).status, 401);
  const r = await req(e, '/health', {headers: {Origin: 'https://evil.example'}}); assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  const g = await req(e, '/health', {headers: {Origin: 'https://game.example'}}); assert.equal(g.headers.get('Access-Control-Allow-Origin'), 'https://game.example');
});

test('teto diário é RÍGIDO no /sync mesmo com muitas chamadas e valores absurdos', async () => {
  const e = mkenv(), w = 'p_cap'; seed(e, w);
  for (let i = 0; i < 40; i++) { e.DB.raw.prepare('UPDATE players SET last_sync=? WHERE wallet=?').run(Date.now() - 120000, w); await call(e, w, '/sync', {val: 1e9, bot: 1e9, kills: 1e9, killVal: 1e9}); }
  const p = row(e, 'SELECT today_u, bal_u, earned_u FROM players WHERE wallet=?', w);
  assert.ok(f(p.today_u) <= 300, 'today=' + f(p.today_u)); assert.equal(p.bal_u, p.earned_u);
});

test('AFK: um claim de 24h com 8 épicas respeita o teto E a cota AFK (antes pagava 512% do teto)', async () => {
  const e = mkenv(), w = 'p_afk'; seed(e, w); for (let i = 0; i < 8; i++) addSnake(e, w);
  e.DB.raw.prepare('UPDATE players SET afk_at=? WHERE wallet=?').run(Date.now() - 24 * 36e5, w);
  const r = await call(e, w, '/farm/claim', {}); assert.equal(r.status, 200);
  assert.ok(r.body.claimed <= 300 * 0.4 + 1e-9, 'claimed=' + r.body.claimed); assert.ok(r.body.today <= 300);
  const r2 = await call(e, w, '/farm/claim', {}); assert.equal(r2.body.claimed, 0, 'segundo claim imediato não paga nada');
  e.DB.raw.prepare('UPDATE players SET afk_at=? WHERE wallet=?').run(Date.now() - 24 * 36e5, w);
  const r3 = await call(e, w, '/farm/claim', {}); assert.ok(r3.body.today <= 300 && r3.body.afkToday <= 120.0001, 'cota diária AFK: ' + r3.body.afkToday);
});

test('AFK: o cliente não consegue informar horas nem valores (corpo é ignorado)', async () => {
  const e = mkenv(), w = 'p_afk2'; seed(e, w); addSnake(e, w, 'common', 2);
  e.DB.raw.prepare('UPDATE players SET afk_at=? WHERE wallet=?').run(Date.now() - 36e5, w);
  const r = await call(e, w, '/farm/claim', {hours: 9999, amount: 9999, claimed: 9999}); assert.ok(r.body.claimed > 1.9 && r.body.claimed < 2.1, 'claimed=' + r.body.claimed);
});

test('SAQUE: bônus inicial e faucet não são sacáveis; só o que foi ganho jogando', async () => {
  const e = mkenv({TESTNET: '1'}), w = 'p_wd1'; seed(e, w, {bal: 100, earned: 0});
  let r = await call(e, w, '/withdraw', {amount: 100}); assert.equal(r.status, 402); assert.equal(r.body.error, 'locked');
  e.DB.raw.prepare('UPDATE players SET bal_u=bal_u+?, earned_u=earned_u+? WHERE wallet=?').run(1500000, 1500000, w);   // ganhou 150 jogando; saldo total 250
  r = await call(e, w, '/withdraw', {amount: 200}); assert.equal(r.body.error, 'locked', 'saldo 250, mas só 150 foram ganhos');
  r = await call(e, w, '/withdraw', {amount: 150}); assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(f(row(e, 'SELECT bal_u FROM players WHERE wallet=?', w).bal_u), 100, 'sobraram os 100 do bônus, que continuam não sacáveis');
});
test('SAQUE: ganho jogando é sacável até o limite do ganho', async () => {
  const e = mkenv(), w = 'p_wd2'; seed(e, w, {bal: 400, earned: 250});
  assert.equal((await call(e, w, '/withdraw', {amount: 300})).body.error, 'locked');
  const ok = await call(e, w, '/withdraw', {amount: 250}); assert.equal(ok.status, 200); assert.ok(ok.body.withdrawalId > 0);
  const p = row(e, 'SELECT bal_u, wd_total_u FROM players WHERE wallet=?', w); assert.equal(f(p.bal_u), 150); assert.equal(f(p.wd_total_u), 250);
});
test('SAQUE: conta nova (< idade mínima) não saca; mínimo e valor inválido', async () => {
  const e = mkenv({WD_MIN_AGE_H: '24'}), w = 'p_wd3'; seed(e, w, {bal: 500, created: Date.now() - 3600e3});
  assert.equal((await call(e, w, '/withdraw', {amount: 100})).body.error, 'too_new');
  e.DB.raw.prepare('UPDATE players SET created=? WHERE wallet=?').run(Date.now() - 2 * 864e5, w);
  assert.equal((await call(e, w, '/withdraw', {amount: 50})).body.error, 'min');
  assert.equal((await call(e, w, '/withdraw', {amount: 'abc'})).body.error, 'min');
  assert.equal((await call(e, w, '/withdraw', {amount: -500})).body.error, 'min');
  assert.equal((await call(e, w, '/withdraw', {amount: 100})).status, 200);
});
test('SAQUE: limite diário é atômico sob concorrência (3x1000 em paralelo, limite 1000)', async () => {
  const e = mkenv(), w = 'p_wd4'; seed(e, w, {bal: 5000});
  const rs = await Promise.all([1, 2, 3].map(() => call(e, w, '/withdraw', {amount: 1000})));
  assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join());
  assert.equal(f(row(e, "SELECT SUM(amount_u) s FROM withdrawals WHERE wallet=? AND status!='failed'", w).s), 1000); assert.equal(f(row(e, 'SELECT bal_u FROM players WHERE wallet=?', w).bal_u), 4000);
  const mix = await Promise.all([call(e, w, '/withdraw', {amount: 100}), call(e, w, '/withdraw', {amount: 100})]); assert.ok(mix.every(r => r.status === 429), 'já bateu o limite do dia');
});
test('SAQUE: conta suspeita (sus>=5) fica em revisão, fora da fila de pagamento, até aprovação', async () => {
  const e = mkenv(), w = 'p_wd5'; seed(e, w, {bal: 300, sus: 5}); const r = await call(e, w, '/withdraw', {amount: 100}); assert.equal(r.status, 200);
  let q = (await admGet(e, '/admin/queue')).body; assert.equal(q.withdrawals.length, 0); assert.equal(q.review.length, 1);
  assert.equal((await adm(e, '/admin/approve', {id: r.body.withdrawalId})).status, 200); q = (await admGet(e, '/admin/queue')).body; assert.equal(q.withdrawals.length, 1);
});

test('ADMIN: fluxo pending→processing→sent; reserva dupla e estados inválidos são recusados', async () => {
  const e = mkenv(), w = 'p_adm1'; seed(e, w, {bal: 500}); const id = (await call(e, w, '/withdraw', {amount: 100})).body.withdrawalId;
  assert.equal((await adm(e, '/admin/claim', {id})).status, 200); assert.equal((await adm(e, '/admin/claim', {id})).status, 409, 'segunda reserva');
  assert.equal((await admGet(e, '/admin/queue')).body.withdrawals.length, 0, 'processing não volta para a fila (evita pagar 2x)');
  assert.equal((await adm(e, '/admin/done', {id, sig: 'x'})).status, 400); assert.equal((await adm(e, '/admin/done', {id, sig: 'S'.repeat(64)})).status, 200);
  assert.equal((await adm(e, '/admin/failed', {id})).status, 409, 'não dá para reembolsar um saque já enviado');
});
test('ADMIN: reembolso acontece UMA vez (mesmo chamado em paralelo) e o ledger concilia', async () => {
  const e = mkenv(), w = 'p_adm2'; seed(e, w, {bal: 500}); const id = (await call(e, w, '/withdraw', {amount: 200})).body.withdrawalId;
  const rs = await Promise.all([adm(e, '/admin/failed', {id}), adm(e, '/admin/failed', {id}), adm(e, '/admin/failed', {id})]); assert.ok(rs.every(r => r.status === 200));
  const p = row(e, 'SELECT bal_u, wd_total_u FROM players WHERE wallet=?', w); assert.equal(f(p.bal_u), 500); assert.equal(p.wd_total_u, 0);
  assert.equal(row(e, "SELECT COUNT(*) n FROM ledger WHERE kind='wd_refund'").n, 1);
  assert.equal(row(e, 'SELECT SUM(delta_u) s FROM ledger WHERE wallet=?', w).s, p.bal_u, 'soma do ledger == saldo');
});
test('ADMIN: chave errada/ausente é negada; queima nunca excede o pendente', async () => {
  const e = mkenv(); const r = await req(e, '/admin/queue', {headers: {'X-Admin-Key': 'nope'}}); assert.equal(r.status, 403);
  assert.equal((await req(e, '/admin/queue')).status, 403);
  e.DB.raw.prepare("INSERT INTO stats(k,v) VALUES('burn_pending_u', 50000)").run();
  assert.equal((await adm(e, '/admin/burned', {amount: 6})).status, 409); assert.equal((await adm(e, '/admin/burned', {amount: 5})).status, 200);
  assert.equal(row(e, "SELECT v FROM stats WHERE k='burn_pending_u'").v, 0); assert.equal(row(e, "SELECT v FROM stats WHERE k='burn_done_u'").v, 50000);
});

test('GACHA: atômico — falha no meio NÃO cobra nem cria cobra (antes cobrava e dava erro)', async () => {
  const e = mkenv(), w = 'p_g1'; seed(e, w, {bal: 400}); e.DB.raw.exec('DROP TABLE gacha_log');
  const r = await call(e, w, '/gacha', {}); assert.equal(r.status, 500);
  assert.equal(f(row(e, 'SELECT bal_u FROM players WHERE wallet=?', w).bal_u), 400); assert.equal(row(e, 'SELECT COUNT(*) n FROM snakes').n, 0);
});
test('GACHA: concorrência — saldo para 1 cápsula em 3 pedidos paralelos gera exatamente 1 cobra', async () => {
  const e = mkenv(), w = 'p_g2'; seed(e, w, {bal: 400}); const rs = await Promise.all([1, 2, 3].map(() => call(e, w, '/gacha', {})));
  assert.equal(rs.filter(r => r.status === 200).length, 1, rs.map(r => r.status).join()); assert.equal(row(e, 'SELECT COUNT(*) n FROM snakes').n, 1); assert.equal(row(e, 'SELECT bal_u FROM players WHERE wallet=?', w).bal_u, 0);
  const ok = rs.find(r => r.status === 200).body; assert.ok(ok.snake.id > 0 && ['common', 'rare', 'epic', 'legendary', 'mythic'].includes(ok.snake.rarity));
});
test('GACHA: distribuição de raridade segue os pesos (600 giros em 20 carteiras, p/ respeitar o rate limit)', async () => {
  const e = mkenv(), c = {}; let n = 0;
  for (let k = 0; k < 20; k++) { const w = 'p_g3_' + k; seed(e, w, {bal: 400 * 30}); for (let i = 0; i < 30; i++) { const r = await call(e, w, '/gacha', {}); assert.equal(r.status, 200); c[r.body.snake.rarity] = (c[r.body.snake.rarity] || 0) + 1; n++; } }
  const share = id => (c[id] || 0) / n; assert.equal(n, 600);
  assert.ok(share('common') > 0.47 && share('common') < 0.63, 'common ' + share('common')); assert.ok(share('rare') > 0.18 && share('rare') < 0.32, 'rare ' + share('rare'));
  assert.ok(share('mythic') < 0.05, 'mythic ' + share('mythic'));
});
test('UPGRADE: 3 em paralelo pagam preços de níveis diferentes (80+120+180), nunca o preço velho 3x', async () => {
  const e = mkenv(), w = 'p_u1'; seed(e, w, {bal: 1000}); addSnake(e, w, 'common', 2);
  const rs = await Promise.all([1, 2, 3].map(() => call(e, w, '/snake/upgrade', {id: 1}))); const ok = rs.filter(r => r.status === 200).length;
  const sn = row(e, 'SELECT lvl, afk_u FROM snakes WHERE id=1'), spent = 1000 - f(row(e, 'SELECT bal_u FROM players WHERE wallet=?', w).bal_u);
  assert.equal(sn.lvl, ok); assert.equal(spent, [0, 80, 200, 380][ok], 'ok=' + ok + ' gasto=' + spent);
});
test('UPGRADE: saldo só para 1 → exatamente 1 sucesso; nível máximo respeitado; ganho é linear sobre a taxa base', async () => {
  const e = mkenv(), w = 'p_u2'; seed(e, w, {bal: 100}); addSnake(e, w, 'epic', 8);
  const rs = await Promise.all([1, 2].map(() => call(e, w, '/snake/upgrade', {id: 1}))); assert.equal(rs.filter(r => r.status === 200).length, 1);
  assert.equal(row(e, 'SELECT afk_u FROM snakes WHERE id=1').afk_u, 8 + 2, 'epic base 8 → +30% da BASE = +2 (arredondado)');
  const e2 = mkenv(), w2 = 'p_u3'; seed(e2, w2, {bal: 1e6}); addSnake(e2, w2, 'common', 2); e2.DB.raw.prepare('UPDATE snakes SET lvl=10 WHERE id=1').run();
  assert.equal((await call(e2, w2, '/snake/upgrade', {id: 1})).body.error, 'max_level');
  assert.equal((await call(e2, w2, '/snake/upgrade', {id: 999})).status, 404);
  const e3 = mkenv(), w3 = 'p_u4'; seed(e3, w3, {bal: 1000}); addSnake(e3, 'outro', 'common', 2); assert.equal((await call(e3, w3, '/snake/upgrade', {id: 1})).status, 404, 'cobra de outra conta');
});

test('LOJA: skin comprada uma vez; preço inválido; saldo insuficiente; queima 50%', async () => {
  const e = mkenv(), w = 'p_s1'; seed(e, w, {bal: 600});
  assert.equal((await call(e, w, '/shop', {item: 'skin', id: 1})).status, 200); assert.equal(f(row(e, 'SELECT bal_u FROM players WHERE wallet=?', w).bal_u), 100);
  assert.equal((await call(e, w, '/shop', {item: 'skin', id: 1})).status, 200, 'reequipar é grátis'); assert.equal(f(row(e, 'SELECT bal_u FROM players WHERE wallet=?', w).bal_u), 100);
  assert.equal((await call(e, w, '/shop', {item: 'skin', id: 999})).status, 400); assert.equal((await call(e, w, '/shop', {item: 'skin', id: 56})).status, 402);
  assert.equal(f(row(e, 'SELECT burned_u FROM players WHERE wallet=?', w).burned_u), 250); assert.equal(f(row(e, "SELECT v FROM stats WHERE k='burn_pending_u'").v), 250);
});
test('LOJA: compras em paralelo da mesma skin cobram uma vez só', async () => {
  const e = mkenv(), w = 'p_s2'; seed(e, w, {bal: 1000}); await Promise.all([1, 2, 3].map(() => call(e, w, '/shop', {item: 'skin', id: 1})));
  assert.equal(f(row(e, 'SELECT bal_u FROM players WHERE wallet=?', w).bal_u), 500);
});

test('IDEMPOTÊNCIA: mesma chave devolve a mesma resposta e cobra uma vez; em paralelo só uma executa', async () => {
  const e = mkenv(), w = 'p_i1'; seed(e, w, {bal: 2000}); const h = {'Idempotency-Key': 'key-aaaaaaaa-1'};
  const a = await call(e, w, '/shop', {item: 'vip'}, h), b = await call(e, w, '/shop', {item: 'vip'}, h); assert.equal(a.status, 200); assert.deepEqual(b.body.bal, a.body.bal);
  const rs = await Promise.all([1, 2, 3].map(() => call(e, w, '/gacha', {}, {'Idempotency-Key': 'key-gacha-0001'})));
  assert.equal(row(e, 'SELECT COUNT(*) n FROM snakes').n, 1, rs.map(r => r.status).join());
  assert.equal((await call(e, w, '/gacha', {}, {'Idempotency-Key': 'curta'})).body.error, 'idem');
});
test('IDEMPOTÊNCIA: operação que falhou libera a chave', async () => {
  const e = mkenv(), w = 'p_i2'; seed(e, w, {bal: 0}); const h = {'Idempotency-Key': 'key-retry-0001'};
  assert.equal((await call(e, w, '/gacha', {}, h)).status, 402); e.DB.raw.prepare('UPDATE players SET bal_u=4000000 WHERE wallet=?').run(w); assert.equal((await call(e, w, '/gacha', {}, h)).status, 200);
});

test('FAUCET: só em testnet, 1x/24h, e o valor NÃO vira saldo sacável', async () => {
  const main = mkenv(), w = 'p_f1'; seed(main, w); assert.equal((await call(main, w, '/faucet', {})).body.error, 'mainnet');
  const e = mkenv({TESTNET: '1'}); seed(e, w); assert.equal((await call(e, w, '/faucet', {})).status, 200); assert.equal((await call(e, w, '/faucet', {})).body.error, 'wait');
  assert.equal((await call(e, w, '/withdraw', {amount: 250})).body.error, 'locked');
});

test('RATE LIMIT: excesso de requisições por carteira → 429; auth por IP → 429', async () => {
  const e = mkenv(), w = 'p_rl'; seed(e, w); let last; for (let i = 0; i < 125; i++) last = (await call(e, w, '/me')).status; assert.equal(last, 429);
  let a; for (let i = 0; i < 25; i++) a = (await call(e, null, '/auth/nonce', {wallet: 'x'}, {ip: '8.8.8.8'})).status; assert.equal(a, 429);
});

test('CONCILIAÇÃO: soma do ledger == saldo após uma sequência mista de operações', async () => {
  const e = mkenv(), w = 'p_led'; seed(e, w, {bal: 3000});
  await call(e, w, '/shop', {item: 'skin', id: 1}); await call(e, w, '/gacha', {}); e.DB.raw.prepare('UPDATE players SET last_sync=? WHERE wallet=?').run(Date.now() - 100000, w);
  await call(e, w, '/sync', {val: 50, play: 90, boost: 30, paidBoost: 30}); await call(e, w, '/snake/upgrade', {id: 1}); await call(e, w, '/withdraw', {amount: 100});
  const p = row(e, 'SELECT bal_u FROM players WHERE wallet=?', w); assert.equal(row(e, 'SELECT SUM(delta_u) s FROM ledger WHERE wallet=?', w).s, p.bal_u);
  assert.ok(row(e, 'SELECT COUNT(*) n FROM ledger WHERE wallet=?', w).n >= 5);
});
