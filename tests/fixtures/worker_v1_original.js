// Backend Slither.Idle — Cloudflare Worker + D1. O livro-caixa do servidor é a fonte da verdade.
// Regras espelham o jogo: teto diário com retorno decrescente, sem multiplicadores, compras queimam 50%.
const CAP = 300, FAUCET = 250, FAUCET_MS = 864e5, VIP_PRICE = 250, BATTERY_PRICE = 200, WD_MIN = 100, WD_DAY = 1000, START_BAL = 100;
// ---- cobras (gacha), farm AFK e upgrade: tudo usa o MESMO teto diario (CAP) acima, nunca emite por fora dele ----
const GACHA_PRICE = 400;                 // custo de uma capsula (mesma escala de preco das skins)
const AFK_CAP_HOURS = 24;                // nao acumula mais que 1 dia parado sem reivindicar
const UPG_BASE = 80, UPG_MULT = 1.5;     // preco do upgrade de cobra cresce 1.5x a cada nivel, igual ao Bomber Idle
// raridade -> peso do sorteio, bonus de velocidade/ima (cosmetico/gameplay ativo) e taxa de farm AFK base (tokens/hora)
const RARITIES = [
  {id: 'common',    w: 55, speed: 0, magnet: 0,  afk: 2},
  {id: 'rare',      w: 25, speed: 2, magnet: 10, afk: 4},
  {id: 'epic',      w: 12, speed: 4, magnet: 25, afk: 8},
  {id: 'legendary', w: 6,  speed: 6, magnet: 45, afk: 16},
  {id: 'mythic',    w: 2,  speed: 9, magnet: 70, afk: 32},
];
function rollSnakeRarity() {
  const total = RARITIES.reduce((s, r) => s + r.w, 0); let roll = Math.random() * total;
  for (const r of RARITIES) { if (roll < r.w) return r; roll -= r.w; }
  return RARITIES[0];
}
const SKIN_PRICES = [0,500,1500,3000,300,300,300,300,300,300,300,300,300,300,300,300,300,300,300,300,200,200,200,250,300,300,300,400,900,900,1200,1800,1800,2500,3500,3500,5000,6000,8000,700,800,700,1200,1500,900,800,800,900,1000,1500,1500,2000,2200,1800,1500,2500,9000];
const QUESTS = [{id: 'coins', t: 60}, {id: 'kills', t: 3}, {id: 'boost', t: 15}, {id: 'play', t: 300}, {id: 'len', t: 500}];
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', enc = new TextEncoder();
const u = x => Math.round(x * 1e4), f = n => n / 1e4;                       // 1 token = 10.000 unidades (sem erro de ponto flutuante)
const clamp = (v, a, b) => { v = +v; return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : a; };
const today = () => new Date().toISOString().slice(0, 10);
class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

function cors(req, env) {
  const o = req.headers.get('Origin') || '', ok = (env.ALLOW_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  return {'Access-Control-Allow-Origin': ok.includes('*') ? '*' : ok.includes(o) ? o : (ok[0] || ''), 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin'};
}
const reply = (req, env, data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json', ...cors(req, env)}});

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(req, env)});
    try { return reply(req, env, await route(req, env)); }
    catch (e) { if (e instanceof HttpError) return reply(req, env, {error: e.code}, e.status); console.error(e); return reply(req, env, {error: 'server'}, 500); }
  }
};

async function route(req, env) {
  const path = new URL(req.url).pathname, m = req.method;
  if (path === '/health') return {ok: true, testnet: env.TESTNET === '1'};
  if (path === '/auth/nonce' && m === 'POST') return nonce(env, await body(req));
  if (path === '/auth/verify' && m === 'POST') return verify(env, await body(req));
  if (path.startsWith('/admin/')) return admin(req, env, path);
  const w = await authed(req, env);
  if (path === '/me') { const p = await load(env, w); roll(p); return view(p); }
  if (path === '/sync' && m === 'POST') return sync(env, w, await body(req));
  if (path === '/shop' && m === 'POST') return shop(env, w, await body(req));
  if (path === '/gacha' && m === 'POST') return gacha(env, w);
  if (path === '/snakes') return {list: await listSnakes(env, w)};
  if (path === '/snake/select' && m === 'POST') return selectSnake(env, w, await body(req));
  if (path === '/snake/upgrade' && m === 'POST') return upgradeSnake(env, w, await body(req));
  if (path === '/farm/claim' && m === 'POST') return farmClaim(env, w);
  if (path === '/faucet' && m === 'POST') return faucet(env, w);
  if (path === '/withdraw' && m === 'POST') return withdraw(env, w, await body(req));
  if (path === '/withdrawals') { const r = await env.DB.prepare('SELECT id, amount_u, status, sig, created FROM withdrawals WHERE wallet=? ORDER BY id DESC LIMIT 10').bind(w).all(); return {list: r.results.map(x => ({id: x.id, amount: f(x.amount_u), status: x.status, sig: x.sig, created: x.created}))}; }
  throw new HttpError(404, 'not_found');
}
const body = async req => { try { const t = await req.text(); if (t.length > 4096) throw 0; return JSON.parse(t || '{}'); } catch (e) { throw new HttpError(400, 'bad_json'); } };

// ---------- criptografia ----------
function b58dec(s) {
  let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new HttpError(400, 'wallet'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
  const bytes = (hex.match(/../g) || []).map(h => parseInt(h, 16)); let z = 0; for (const c of s) { if (c === '1') z++; else break; }
  return Uint8Array.from([...new Array(z).fill(0), ...(n === 0n ? [] : bytes)]);
}
const pub = w => { if (typeof w !== 'string' || w.length < 32 || w.length > 44) throw new HttpError(400, 'wallet'); const k = b58dec(w); if (k.length !== 32) throw new HttpError(400, 'wallet'); return k; };
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(env, data) {
  if (!env.JWT_SECRET) throw new HttpError(500, 'config');
  const k = await crypto.subtle.importKey('raw', enc.encode(env.JWT_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data))));
}
async function makeToken(env, payload) { const p = b64u(enc.encode(JSON.stringify(payload))); return p + '.' + await hmac(env, p); }
async function authed(req, env) {
  const h = req.headers.get('Authorization') || '', t = h.startsWith('Bearer ') ? h.slice(7) : '', [p, s] = t.split('.');
  if (!p || !s || s !== await hmac(env, p)) throw new HttpError(401, 'auth');
  let d; try { d = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { throw new HttpError(401, 'auth'); }
  if (!d.w || d.exp < Date.now()) throw new HttpError(401, 'expired');
  return d.w;
}
async function edverify(pk, sig, data) {   // Phantom assina com Ed25519
  if (sig.length !== 64) return false;
  for (const alg of [{name: 'Ed25519'}, {name: 'NODE-ED25519', namedCurve: 'NODE-ED25519'}]) {
    try { const k = await crypto.subtle.importKey('raw', pk, alg, false, ['verify']); return await crypto.subtle.verify(alg, k, sig, data); } catch (e) {}
  }
  return false;
}
const msg = (w, n, exp) => `Sign in to Slither.Idle\nWallet: ${w}\nNonce: ${n}\nExpires: ${new Date(exp).toISOString()}\nThis does not move funds or cost anything.`;
async function nonce(env, b) {
  const w = String(b.wallet || ''); pub(w);
  const n = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join(''), exp = Date.now() + 5 * 6e4;
  await env.DB.prepare('DELETE FROM nonces WHERE exp < ?').bind(Date.now()).run();
  await env.DB.prepare('INSERT INTO nonces(wallet, nonce, exp) VALUES(?,?,?)').bind(w, n, exp).run();
  return {nonce: n, message: msg(w, n, exp)};
}
async function verify(env, b) {
  const w = String(b.wallet || ''), pk = pub(w), n = String(b.nonce || '');
  const row = await env.DB.prepare('SELECT exp FROM nonces WHERE wallet=? AND nonce=?').bind(w, n).first();
  if (!row || row.exp < Date.now()) throw new HttpError(401, 'nonce');
  await env.DB.prepare('DELETE FROM nonces WHERE wallet=? AND nonce=?').bind(w, n).run();   // uso único (anti-replay)
  let sig; try { sig = Uint8Array.from(atob(String(b.signature)), c => c.charCodeAt(0)); } catch (e) { throw new HttpError(400, 'sig'); }
  if (!(await edverify(pk, sig, enc.encode(msg(w, n, row.exp))))) throw new HttpError(401, 'signature');
  await env.DB.prepare('INSERT OR IGNORE INTO players(wallet, bal_u, day, q, created) VALUES(?,?,?,?,?)').bind(w, u(START_BAL), today(), JSON.stringify(newQ()), Date.now()).run();
  const exp = Date.now() + 7 * 864e5, p = await load(env, w); roll(p);
  return {token: await makeToken(env, {w, exp}), wallet: w, exp, state: view(p)};
}

// ---------- jogador ----------
const newQ = () => ({day: today(), coins: 0, kills: 0, boost: 0, play: 0, len: 0, done: [], pd: false});
async function load(env, w) {
  const r = await env.DB.prepare('SELECT * FROM players WHERE wallet=?').bind(w).first(); if (!r) throw new HttpError(401, 'no_player');
  r.owned = JSON.parse(r.owned || '[0]'); r.q = JSON.parse(r.q || 'null') || newQ(); return r;
}
function roll(p) { const d = today(); if (p.day !== d) { p.day = d; p.today_u = 0; } if (!p.q || p.q.day !== d) p.q = newQ(); }
const view = p => ({bal: f(p.bal_u), today: f(p.today_u), cap: CAP, burned: f(p.burned_u), pts: p.pts, vip: !!p.vip, skin: p.skin, owned: p.owned, day: p.day, faucetAt: p.faucet_at, q: p.q, serverTime: Date.now(),
  activeSnake: p.active_snake, afkAt: p.afk_at});
async function addStat(env, k, d) { if (d) await env.DB.prepare('INSERT INTO stats(k, v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v = v + excluded.v').bind(k, d).run(); }
async function mutate(env, w, fn) {   // lê → altera → grava com controle de versão (sem corrida entre abas/requisições)
  for (let i = 0; i < 4; i++) {
    const p = await load(env, w); roll(p); const out = fn(p) || {};
    const r = await env.DB.prepare('UPDATE players SET bal_u=?, today_u=?, day=?, burned_u=?, pts=?, vip=?, skin=?, owned=?, faucet_at=?, last_sync=?, q=?, sus=?, active_snake=?, afk_at=?, ver=ver+1 WHERE wallet=? AND ver=?')
      .bind(p.bal_u, p.today_u, p.day, p.burned_u, p.pts, p.vip, p.skin, JSON.stringify(p.owned), p.faucet_at, p.last_sync, JSON.stringify(p.q), p.sus, p.active_snake, p.afk_at, w, p.ver).run();
    if (r.meta && r.meta.changes === 1) { await addStat(env, 'burn_pending_u', out.burn); await addStat(env, 'pool_return_u', out.pool); return view(p); }
  }
  throw new HttpError(409, 'busy');
}
function pick(d) {   // mesmas 3 missões do dia que o cliente sorteia
  let h = 0; for (const c of d) h = (h * 31 + c.charCodeAt(0)) | 0; const ids = [0, 1, 2, 3, 4], out = [];
  while (out.length < 3) { h = (h * 1103515245 + 12345) & 0x7fffffff; out.push(QUESTS[ids.splice(h % ids.length, 1)[0]]); } return out;
}
// O cliente informa o que fez; o servidor LIMITA pelo tempo real decorrido (anti-bot) e aplica o teto diário.
const sync = (env, w, b) => mutate(env, w, p => {
  const now = Date.now(), dt = p.last_sync ? Math.min(120, (now - p.last_sync) / 1000) : 10, maxBase = dt * 0.6 + 1;
  const val = clamp(b.val, 0, maxBase), bot = clamp(b.bot, 0, Math.max(0, maxBase - val)), kills = Math.floor(clamp(b.kills, 0, dt / 3 + 1)), killVal = clamp(b.killVal, 0, kills);
  const coinsN = Math.floor(clamp(b.coinsN, 0, dt * 6 + 10)), play = clamp(b.play, 0, dt + 2), boost = clamp(b.boost, 0, play), paidBoost = clamp(b.paidBoost, 0, boost), len = clamp(b.len, 0, 1500);
  if (+b.val > maxBase * 1.5 + 2 || +b.kills > dt / 3 + 3 || +b.play > dt + 5) p.sus++;
  const rate = Math.max(0, 1 - f(p.today_u) / CAP), paid = u((val + bot * 0.6 + killVal) * rate);
  p.today_u += paid; p.bal_u += paid;
  const cost = Math.min(u(paidBoost * 0.1), p.bal_u); p.bal_u -= cost; p.burned_u += cost;   // turbo pago: 100% queimado
  const q = p.q; q.coins += coinsN; q.kills += kills; q.boost += boost; q.play += play; q.len = Math.max(q.len, len);
  for (const x of pick(q.day)) if (q[x.id] >= x.t && !q.done.includes(x.id)) { q.done.push(x.id); p.pts += 5; }
  if (q.play >= 600 && !q.pd) { q.pd = true; p.pts += 10; }
  p.last_sync = now; return {burn: cost};
});
const shop = (env, w, b) => mutate(env, w, p => {
  let cost = 0;
  if (b.item === 'skin') {
    const id = b.id | 0, price = SKIN_PRICES[id]; if (price === undefined) throw new HttpError(400, 'item');
    if (!p.owned.includes(id)) { cost = u(price); if (p.bal_u < cost) throw new HttpError(402, 'poor'); p.bal_u -= cost; p.owned.push(id); }
    p.skin = id;
  } else if (b.item === 'vip') { if (p.vip) throw new HttpError(409, 'have'); cost = u(VIP_PRICE); if (p.bal_u < cost) throw new HttpError(402, 'poor'); p.bal_u -= cost; p.vip = 1; }
  else if (b.item === 'battery') { cost = u(BATTERY_PRICE); if (p.bal_u < cost) throw new HttpError(402, 'poor'); p.bal_u -= cost; }
  else throw new HttpError(400, 'item');
  const burn = Math.floor(cost / 2); p.burned_u += burn; return {burn, pool: cost - burn};   // 50% queimado, 50% volta para a pool
});
// ---------- cobras: gacha, selecao, upgrade, farm AFK ----------
async function listSnakes(env, w) {
  const r = await env.DB.prepare('SELECT id, rarity, speed_u, magnet_u, afk_u, lvl, created FROM snakes WHERE wallet=? ORDER BY id').bind(w).all();
  return r.results.map(x => ({id: x.id, rarity: x.rarity, speed: x.speed_u, magnet: x.magnet_u, afk: x.afk_u, lvl: x.lvl, created: x.created}));
}
async function gacha(env, w) {
  const r = rollSnakeRarity();
  const state = await mutate(env, w, p => {
    const price = u(GACHA_PRICE); if (p.bal_u < price) throw new HttpError(402, 'poor');
    p.bal_u -= price; const burn = Math.floor(price / 2); p.burned_u += burn; return {burn, pool: price - burn};
  });
  const ins = await env.DB.prepare('INSERT INTO snakes(wallet, rarity, speed_u, magnet_u, afk_u, created) VALUES(?,?,?,?,?,?)')
    .bind(w, r.id, r.speed, r.magnet, r.afk, Date.now()).run();
  const snakeId = ins.meta.last_row_id;
  await env.DB.prepare('INSERT INTO gacha_log(wallet, rarity, snake_id, cost_u, created) VALUES(?,?,?,?,?)').bind(w, r.id, snakeId, u(GACHA_PRICE), Date.now()).run();
  return {...state, snake: {id: snakeId, rarity: r.id, speed: r.speed, magnet: r.magnet, afk: r.afk, lvl: 0}};
}
async function selectSnake(env, w, b) {
  const id = b.id | 0;
  const row = await env.DB.prepare('SELECT id FROM snakes WHERE id=? AND wallet=?').bind(id, w).first();
  if (!row) throw new HttpError(404, 'snake');
  return mutate(env, w, p => { p.active_snake = id; });
}
async function upgradeSnake(env, w, b) {
  const id = b.id | 0;
  const snake = await env.DB.prepare('SELECT afk_u, lvl FROM snakes WHERE id=? AND wallet=?').bind(id, w).first();
  if (!snake) throw new HttpError(404, 'snake');
  const price = Math.round(UPG_BASE * Math.pow(UPG_MULT, snake.lvl));   // cresce 1.5x por nivel, igual ao padrao do Bomber Idle
  const state = await mutate(env, w, p => {
    const cost = u(price); if (p.bal_u < cost) throw new HttpError(402, 'poor');
    p.bal_u -= cost; const burn = Math.floor(cost / 2); p.burned_u += burn; return {burn, pool: cost - burn};
  });
  const step = Math.max(1, Math.round(snake.afk_u * 0.3));   // cada nivel soma 30% da taxa base da raridade
  await env.DB.prepare('UPDATE snakes SET afk_u = afk_u + ?, lvl = lvl + 1 WHERE id=?').bind(step, id).run();
  return {...state, snakeId: id, afk: snake.afk_u + step, lvl: snake.lvl + 1, price};
}
// Farm AFK: paga pelo tempo real decorrido desde o ultimo claim (nao depende do cliente estar aberto), somando a taxa
// de TODAS as cobras do jogador. Usa a mesma formula de teto decrescente do /sync, entao nunca emite fora do CAP/dia.
async function farmClaim(env, w) {
  const snakes = (await env.DB.prepare('SELECT afk_u FROM snakes WHERE wallet=?').bind(w).all()).results;
  const ratePerHour = snakes.reduce((s, x) => s + x.afk_u, 0);
  let claimed = 0;   // mutate() devolve so view(p); o quanto foi coletado precisa ser capturado por fora
  const state = await mutate(env, w, p => {
    const now = Date.now(), elapsedH = Math.min(AFK_CAP_HOURS, Math.max(0, (now - (p.afk_at || now)) / 36e5));
    if (!ratePerHour || elapsedH <= 0) { p.afk_at = now; claimed = 0; return; }
    const rate = Math.max(0, 1 - f(p.today_u) / CAP), gross = ratePerHour * elapsedH, paid = u(gross * rate);
    p.today_u += paid; p.bal_u += paid; p.afk_at = now; claimed = f(paid);
  });
  return {...state, claimed};
}
const faucet = (env, w) => { if (env.TESTNET !== '1') throw new HttpError(403, 'mainnet'); return mutate(env, w, p => { if (p.faucet_at + FAUCET_MS > Date.now()) throw new HttpError(429, 'wait'); p.bal_u += u(FAUCET); p.faucet_at = Date.now(); }); };
async function withdraw(env, w, b) {
  const amt = Math.floor(clamp(b.amount, 0, 1e9)); if (amt < WD_MIN) throw new HttpError(400, 'min');
  const used = (await env.DB.prepare("SELECT COALESCE(SUM(amount_u),0) s FROM withdrawals WHERE wallet=? AND created>=? AND status!='failed'").bind(w, Date.parse(today() + 'T00:00:00Z')).first()).s;
  if (used + u(amt) > u(WD_DAY)) throw new HttpError(429, 'daily_limit');
  const id = (await env.DB.prepare('INSERT INTO withdrawals(wallet, amount_u, created) VALUES(?,?,?)').bind(w, u(amt), Date.now()).run()).meta.last_row_id;
  try { return {...await mutate(env, w, p => { if (p.bal_u < u(amt)) throw new HttpError(402, 'poor'); p.bal_u -= u(amt); }), withdrawalId: id}; }
  catch (e) { await env.DB.prepare('DELETE FROM withdrawals WHERE id=?').bind(id).run(); throw e; }
}

// ---------- admin (quem tem a ADMIN_KEY: o script payout.mjs) ----------
async function admin(req, env, path) {
  if (!env.ADMIN_KEY || req.headers.get('X-Admin-Key') !== env.ADMIN_KEY) throw new HttpError(403, 'forbidden');
  if (path === '/admin/queue') {
    const r = await env.DB.prepare("SELECT id, wallet, amount_u FROM withdrawals WHERE status='pending' ORDER BY id LIMIT 50").all(), bp = await env.DB.prepare("SELECT v FROM stats WHERE k='burn_pending_u'").first();
    return {withdrawals: r.results.map(x => ({id: x.id, wallet: x.wallet, amount: f(x.amount_u)})), burnPending: f(bp ? bp.v : 0)};
  }
  const b = await body(req);
  if (path === '/admin/done') { await env.DB.prepare("UPDATE withdrawals SET status='sent', sig=? WHERE id=? AND status='pending'").bind(String(b.sig || ''), b.id | 0).run(); return {ok: true}; }
  if (path === '/admin/failed') {   // saque que falhou volta para o saldo do jogador
    const x = await env.DB.prepare("SELECT wallet, amount_u FROM withdrawals WHERE id=? AND status='pending'").bind(b.id | 0).first(); if (!x) throw new HttpError(404, 'not_found');
    await env.DB.prepare("UPDATE withdrawals SET status='failed' WHERE id=?").bind(b.id | 0).run(); await mutate(env, x.wallet, p => { p.bal_u += x.amount_u; }); return {ok: true};
  }
  if (path === '/admin/burned') { await addStat(env, 'burn_pending_u', -u(clamp(b.amount, 0, 1e12))); await addStat(env, 'burn_done_u', u(clamp(b.amount, 0, 1e12))); return {ok: true}; }
  throw new HttpError(404, 'not_found');
}
