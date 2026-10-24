// Backend Slither.Idle v2 — Cloudflare Worker + D1. O livro-caixa do servidor é a fonte da verdade.
// Mudanças da Fase 2 (ver docs/AUDIT.md): mutações atômicas (D1 batch), livro-caixa, idempotência, rate limit,
// teto diário RÍGIDO, saque limitado ao que foi GANHO jogando, fluxo de saque pending→processing→sent/failed.
// Todos os parâmetros econômicos ficam em CFG (um só lugar). Os valores abaixo são os ORIGINAIS, exceto onde marcado [NOVO].
const CFG = {
  CAP: 300,                 // teto diário de emissão por conta (tokens)
  FAUCET: 250, FAUCET_MS: 864e5,   // só existe em TESTNET
  VIP_PRICE: 250, BATTERY_PRICE: 200, GACHA_PRICE: 400,
  WD_MIN: 100, WD_DAY: 1000,
  START_BAL_TESTNET: 100,   // [NOVO] saldo inicial só existe em testnet; em produção (TESTNET!=1) é 0
  AFK_CAP_HOURS: 24,
  AFK_SHARE: 0.4,           // [NOVO] AFK pode preencher no máx. 40% do teto diário: o jogo ativo continua sendo o caminho principal
  UPG_BASE: 80, UPG_MULT: 1.5, UPG_MAX_LVL: 10,   // [NOVO] nível máximo
  WD_MIN_AGE_H: 24,         // [NOVO] idade mínima da conta para sacar (env WD_MIN_AGE_H sobrescreve)
  SUS_HOLD: 5,              // [NOVO] contas com 'sus' >= 5 têm o saque retido para REVISÃO (nunca punição automática)
  RL: {auth_ip: [20, 60], any_wallet: [120, 60], sync: [60, 60], value: [30, 60], admin_ip: [60, 60]},   // [max, janela em s]
};
const RARITIES = [
  {id: 'common',    w: 55, speed: 0, magnet: 0,  afk: 2},
  {id: 'rare',      w: 25, speed: 2, magnet: 10, afk: 4},
  {id: 'epic',      w: 12, speed: 4, magnet: 25, afk: 8},
  {id: 'legendary', w: 6,  speed: 6, magnet: 45, afk: 16},
  {id: 'mythic',    w: 2,  speed: 9, magnet: 70, afk: 32},
];
function rollSnakeRarity() {   // [NOVO] sorteio com crypto.getRandomValues
  const total = RARITIES.reduce((s, r) => s + r.w, 0); let roll = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * total;
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
  const h = {'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key, Idempotency-Key', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin'};
  if (ok.includes('*')) h['Access-Control-Allow-Origin'] = '*'; else if (ok.includes(o)) h['Access-Control-Allow-Origin'] = o;   // [NOVO] origem não autorizada não recebe cabeçalho
  return h;
}
const reply = (req, env, data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json', ...cors(req, env)}});

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(req, env)});
    try { return reply(req, env, await route(req, env)); }
    catch (e) { if (e instanceof HttpError) return reply(req, env, {error: e.code}, e.status); console.error(e); return reply(req, env, {error: 'server'}, 500); }
  }
};

// ---------- rate limit (janela fixa em D1) ----------
async function limit(env, key, [max, sec]) {
  const win = Math.floor(Date.now() / (sec * 1000));
  const r = await env.DB.prepare('INSERT INTO rl(k, win, n) VALUES(?,?,1) ON CONFLICT(k, win) DO UPDATE SET n = n + 1 RETURNING n').bind(key, win).first();
  if (Math.random() < 0.01) await env.DB.prepare('DELETE FROM rl WHERE win < ?').bind(win - 5).run();
  if (r.n > max) throw new HttpError(429, 'rate');
}
const ip = req => req.headers.get('CF-Connecting-IP') || 'local';
const VALUE_ROUTES = new Set(['/shop', '/gacha', '/snake/upgrade', '/farm/claim', '/faucet', '/withdraw']);

async function route(req, env) {
  const path = new URL(req.url).pathname, m = req.method;
  if (path === '/health') return {ok: true, testnet: env.TESTNET === '1', v: 2};
  if (path.startsWith('/admin/')) { await limit(env, 'adm:' + ip(req), CFG.RL.admin_ip); return admin(req, env, path); }
  if (path.startsWith('/auth/')) await limit(env, 'auth:' + ip(req), CFG.RL.auth_ip);
  if (path === '/auth/nonce' && m === 'POST') return nonce(env, await body(req));
  if (path === '/auth/verify' && m === 'POST') return verify(env, await body(req));
  const w = await authed(req, env);
  await limit(env, 'w:' + w, CFG.RL.any_wallet);
  if (path === '/sync') await limit(env, 's:' + w, CFG.RL.sync);
  if (VALUE_ROUTES.has(path)) await limit(env, 'v:' + w, CFG.RL.value);
  const idem = req.headers.get('Idempotency-Key');
  if (path === '/me') { const p = await load(env, w); roll(p); return view(p); }
  if (path === '/sync' && m === 'POST') return sync(env, w, await body(req));
  if (path === '/shop' && m === 'POST') { const b = await body(req); return once(env, w, idem, () => shop(env, w, b)); }
  if (path === '/gacha' && m === 'POST') return once(env, w, idem, () => gacha(env, w));
  if (path === '/snakes') return {list: await listSnakes(env, w)};
  if (path === '/snake/select' && m === 'POST') return selectSnake(env, w, await body(req));
  if (path === '/snake/upgrade' && m === 'POST') { const b = await body(req); return once(env, w, idem, () => upgradeSnake(env, w, b)); }
  if (path === '/farm/claim' && m === 'POST') return once(env, w, idem, () => farmClaim(env, w));
  if (path === '/faucet' && m === 'POST') return once(env, w, idem, () => faucet(env, w));
  if (path === '/withdraw' && m === 'POST') { const b = await body(req); return once(env, w, idem, () => withdraw(env, w, b)); }
  if (path === '/withdrawals') { const r = await env.DB.prepare('SELECT id, amount_u, status, sig, created FROM withdrawals WHERE wallet=? ORDER BY id DESC LIMIT 10').bind(w).all(); return {list: r.results.map(x => ({id: x.id, amount: f(x.amount_u), status: x.status, sig: x.sig, created: x.created}))}; }
  throw new HttpError(404, 'not_found');
}
const body = async req => { try { const t = await req.text(); if (t.length > 4096) throw 0; return JSON.parse(t || '{}'); } catch (e) { throw new HttpError(400, 'bad_json'); } };

// ---------- idempotência: a mesma Idempotency-Key devolve a MESMA resposta e nunca executa duas vezes ----------
async function once(env, w, key, fn) {
  if (!key) return fn();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) throw new HttpError(400, 'idem');
  const now = Date.now();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM idem WHERE created < ?').bind(now - 864e5).run();
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO idem(wallet, k, resp, created) VALUES(?,?,NULL,?)').bind(w, key, now).run();
  if (ins.meta.changes === 0) {
    const r = await env.DB.prepare('SELECT resp FROM idem WHERE wallet=? AND k=?').bind(w, key).first();
    if (r && r.resp) return JSON.parse(r.resp);
    throw new HttpError(409, 'in_flight');
  }
  try { const out = await fn(); await env.DB.prepare('UPDATE idem SET resp=? WHERE wallet=? AND k=?').bind(JSON.stringify(out), w, key).run(); return out; }
  catch (e) { await env.DB.prepare('DELETE FROM idem WHERE wallet=? AND k=?').bind(w, key).run(); throw e; }   // falhou: a chave pode ser reutilizada
}

// ---------- criptografia ----------
function b58dec(s) {
  let n = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new HttpError(400, 'wallet'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex;
  const bytes = (hex.match(/../g) || []).map(h => parseInt(h, 16)); let z = 0; for (const c of s) { if (c === '1') z++; else break; }
  return Uint8Array.from([...new Array(z).fill(0), ...(n === 0n ? [] : bytes)]);
}
const pub = w => { if (typeof w !== 'string' || w.length < 32 || w.length > 44) throw new HttpError(400, 'wallet'); const k = b58dec(w); if (k.length !== 32) throw new HttpError(400, 'wallet'); return k; };
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const safeEq = (a, b) => { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };   // [NOVO] tempo constante
async function hmac(env, data) {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 24) throw new HttpError(500, 'config');
  const k = await crypto.subtle.importKey('raw', enc.encode(env.JWT_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data))));
}
async function makeToken(env, payload) { const p = b64u(enc.encode(JSON.stringify(payload))); return p + '.' + await hmac(env, p); }
async function authed(req, env) {
  const h = req.headers.get('Authorization') || '', t = h.startsWith('Bearer ') ? h.slice(7) : '', [p, s] = t.split('.');
  if (!p || !s || !safeEq(s, await hmac(env, p))) throw new HttpError(401, 'auth');
  let d; try { d = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { throw new HttpError(401, 'auth'); }
  if (!d.w || !(d.exp >= Date.now())) throw new HttpError(401, 'expired');
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
  const c = await env.DB.prepare('SELECT COUNT(*) n FROM nonces WHERE wallet=?').bind(w).first();
  if (c.n >= 10) throw new HttpError(429, 'rate');   // [NOVO] no máx. 10 nonces vivos por carteira (evita lotar o banco)
  await env.DB.prepare('INSERT INTO nonces(wallet, nonce, exp) VALUES(?,?,?)').bind(w, n, exp).run();
  return {nonce: n, message: msg(w, n, exp)};
}
async function verify(env, b) {
  const w = String(b.wallet || ''), pk = pub(w), n = String(b.nonce || '');
  const row = await env.DB.prepare('SELECT exp FROM nonces WHERE wallet=? AND nonce=?').bind(w, n).first();
  if (!row || row.exp < Date.now()) throw new HttpError(401, 'nonce');
  const del = await env.DB.prepare('DELETE FROM nonces WHERE wallet=? AND nonce=?').bind(w, n).run();   // uso único (anti-replay)
  if (del.meta.changes !== 1) throw new HttpError(401, 'nonce');
  let sig; try { sig = Uint8Array.from(atob(String(b.signature)), c => c.charCodeAt(0)); } catch (e) { throw new HttpError(400, 'sig'); }
  if (!(await edverify(pk, sig, enc.encode(msg(w, n, row.exp))))) throw new HttpError(401, 'signature');
  const start = env.TESTNET === '1' ? u(CFG.START_BAL_TESTNET) : 0;
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO players(wallet, bal_u, day, q, created) VALUES(?,?,?,?,?)').bind(w, start, today(), JSON.stringify(newQ()), Date.now()).run();
  if (ins.meta.changes === 1 && start > 0) await env.DB.prepare("INSERT INTO ledger(wallet, kind, delta_u, bal_u, ref, created) VALUES(?,?,?,?,?,?)").bind(w, 'start_grant', start, start, null, Date.now()).run();
  const exp = Date.now() + 7 * 864e5, p = await load(env, w); roll(p);
  return {token: await makeToken(env, {w, exp}), wallet: w, exp, state: view(p)};
}

// ---------- jogador ----------
const newQ = () => ({day: today(), coins: 0, kills: 0, boost: 0, play: 0, len: 0, done: [], pd: false});
async function load(env, w) {
  const r = await env.DB.prepare('SELECT * FROM players WHERE wallet=?').bind(w).first(); if (!r) throw new HttpError(401, 'no_player');
  r.owned = JSON.parse(r.owned || '[0]'); r.q = JSON.parse(r.q || 'null') || newQ(); return r;
}
function roll(p) { const d = today(); if (p.day !== d) { p.day = d; p.today_u = 0; p.afk_today_u = 0; } if (!p.q || p.q.day !== d) p.q = newQ(); }
const withdrawable = p => Math.max(0, Math.min(p.bal_u, p.earned_u - p.wd_total_u));
const view = p => ({bal: f(p.bal_u), today: f(p.today_u), cap: CFG.CAP, burned: f(p.burned_u), pts: p.pts, vip: !!p.vip, skin: p.skin, owned: p.owned, day: p.day, faucetAt: p.faucet_at, q: p.q, serverTime: Date.now(),
  activeSnake: p.active_snake, afkAt: p.afk_at, withdrawable: f(withdrawable(p)), afkToday: f(p.afk_today_u), afkShare: CFG.AFK_SHARE});

// Emissão: retorno decrescente + teto RÍGIDO. [CORRIGIDO] antes, uma única coleta podia passar de 500% do teto.
function pay(p, tokens, afk) {
  const capU = u(CFG.CAP); let paid = Math.round(Math.max(0, 1 - p.today_u / capU) * tokens * 1e4);
  paid = Math.min(paid, capU - p.today_u); if (afk) paid = Math.min(paid, u(CFG.CAP * CFG.AFK_SHARE) - p.afk_today_u);
  paid = Math.max(0, paid); p.today_u += paid; p.bal_u += paid; p.earned_u += paid; if (afk) p.afk_today_u += paid; return paid;
}
const UPDATE_P = 'UPDATE players SET bal_u=?, today_u=?, day=?, burned_u=?, pts=?, vip=?, skin=?, owned=?, faucet_at=?, last_sync=?, q=?, sus=?, active_snake=?, afk_at=?, earned_u=?, wd_total_u=?, afk_today_u=?, ver=ver+1 WHERE wallet=? AND ver=?';
const VER_OK = '(SELECT ver FROM players WHERE wallet=?)=?';   // só vale se ESTA transação acabou de gravar a nova versão

// Lê → decide → grava TUDO em um único batch (transação do D1) com controle de versão.
// fn(p) pode devolver {kind, ref, burn, pool, emit, guard:[sql, ...args], after:[prepared com WHERE {VER_OK}]}.
// guard = condição extra avaliada ATOMICAMENTE junto do UPDATE (ex.: limite diário de saque, nível da cobra).
// Ordem dos resultados: [0]=jogador, [1]=ledger, [2..]=after, depois estatísticas.
async function mutate(env, w, fn) {
  for (let i = 0; i < 5; i++) {
    const p = await load(env, w); roll(p); const bal0 = p.bal_u, out = (await fn(p)) || {}, nv = p.ver + 1, G = out.guard || null;
    const upd = env.DB.prepare(UPDATE_P + (G ? ' AND ' + G[0] : '')).bind(p.bal_u, p.today_u, p.day, p.burned_u, p.pts, p.vip, p.skin, JSON.stringify(p.owned), p.faucet_at, p.last_sync, JSON.stringify(p.q), p.sus, p.active_snake, p.afk_at, p.earned_u, p.wd_total_u, p.afk_today_u, w, p.ver, ...(G ? G.slice(1) : []));
    const led = env.DB.prepare(`INSERT INTO ledger(wallet, kind, delta_u, bal_u, ref, created) SELECT ?,?,?,?,?,? WHERE ${VER_OK}`).bind(w, out.kind || 'misc', p.bal_u - bal0, p.bal_u, out.ref ?? null, Date.now(), w, nv);
    const stats = []; for (const [k, d] of [['burn_pending_u', out.burn], ['pool_return_u', out.pool], ['emit_u:' + today(), out.emit]]) if (d) stats.push(env.DB.prepare(`INSERT INTO stats(k, v) SELECT ?,? WHERE ${VER_OK} ON CONFLICT(k) DO UPDATE SET v = v + excluded.v`).bind(k, d, w, nv));
    const res = await env.DB.batch([upd, led, ...(out.after || []).map(s => s(w, nv)), ...stats]);
    if (res[0].meta && res[0].meta.changes === 1) return {state: view(p), results: res};
  }
  throw new HttpError(409, 'busy');
}
const run = async (...a) => (await mutate(...a)).state;

function pick(d) {   // mesmas 3 missões do dia que o cliente sorteia
  let h = 0; for (const c of d) h = (h * 31 + c.charCodeAt(0)) | 0; const ids = [0, 1, 2, 3, 4], out = [];
  while (out.length < 3) { h = (h * 1103515245 + 12345) & 0x7fffffff; out.push(QUESTS[ids.splice(h % ids.length, 1)[0]]); } return out;
}
// O cliente informa o que fez; o servidor LIMITA pelo tempo real decorrido (anti-bot) e aplica o teto diário.
const sync = (env, w, b) => run(env, w, p => {
  const now = Date.now(), dt = p.last_sync ? Math.min(120, (now - p.last_sync) / 1000) : 10, maxBase = dt * 0.6 + 1;
  const val = clamp(b.val, 0, maxBase), bot = clamp(b.bot, 0, Math.max(0, maxBase - val)), kills = Math.floor(clamp(b.kills, 0, dt / 3 + 1)), killVal = clamp(b.killVal, 0, kills);
  const coinsN = Math.floor(clamp(b.coinsN, 0, dt * 6 + 10)), play = clamp(b.play, 0, dt + 2), boost = clamp(b.boost, 0, play), paidBoost = clamp(b.paidBoost, 0, boost), len = clamp(b.len, 0, 1500);
  if (+b.val > maxBase * 1.5 + 2 || +b.kills > dt / 3 + 3 || +b.play > dt + 5) p.sus++;
  const paid = pay(p, val + bot * 0.6 + killVal, false);
  const cost = Math.min(u(paidBoost * 0.1), p.bal_u); p.bal_u -= cost; p.burned_u += cost;   // turbo pago: 100% queimado
  const q = p.q; q.coins += coinsN; q.kills += kills; q.boost += boost; q.play += play; q.len = Math.max(q.len, len);
  for (const x of pick(q.day)) if (q[x.id] >= x.t && !q.done.includes(x.id)) { q.done.push(x.id); p.pts += 5; }
  if (q.play >= 600 && !q.pd) { q.pd = true; p.pts += 10; }
  p.last_sync = now; return {kind: 'sync', burn: cost, emit: paid};
});
const shop = (env, w, b) => run(env, w, p => {
  let cost = 0, kind, ref;
  if (b.item === 'skin') {
    const id = b.id | 0, price = SKIN_PRICES[id]; if (price === undefined) throw new HttpError(400, 'item'); kind = 'shop_skin'; ref = id;
    if (!p.owned.includes(id)) { cost = u(price); if (p.bal_u < cost) throw new HttpError(402, 'poor'); p.bal_u -= cost; p.owned.push(id); }
    p.skin = id;
  } else if (b.item === 'vip') { if (p.vip) throw new HttpError(409, 'have'); kind = 'shop_vip'; cost = u(CFG.VIP_PRICE); if (p.bal_u < cost) throw new HttpError(402, 'poor'); p.bal_u -= cost; p.vip = 1; }
  else if (b.item === 'battery') { kind = 'shop_battery'; cost = u(CFG.BATTERY_PRICE); if (p.bal_u < cost) throw new HttpError(402, 'poor'); p.bal_u -= cost; }
  else throw new HttpError(400, 'item');
  const burn = Math.floor(cost / 2); p.burned_u += burn; return {kind, ref, burn, pool: cost - burn};   // 50% queimado, 50% volta para a pool
});
// ---------- cobras: gacha, selecao, upgrade, farm AFK ----------
async function listSnakes(env, w) {
  const r = await env.DB.prepare('SELECT id, rarity, speed_u, magnet_u, afk_u, lvl, created FROM snakes WHERE wallet=? ORDER BY id').bind(w).all();
  return r.results.map(x => ({id: x.id, rarity: x.rarity, speed: x.speed_u, magnet: x.magnet_u, afk: x.afk_u, lvl: x.lvl, created: x.created}));
}
async function gacha(env, w) {   // [CORRIGIDO] cobrança + cobra + log no MESMO batch: ou tudo acontece, ou nada
  const r = rollSnakeRarity(), price = u(CFG.GACHA_PRICE), now = Date.now();
  const {state, results} = await mutate(env, w, p => {
    if (p.bal_u < price) throw new HttpError(402, 'poor');
    p.bal_u -= price; const burn = Math.floor(price / 2); p.burned_u += burn; p.afk_at = p.afk_at || now;
    return {kind: 'gacha', burn, pool: price - burn, after: [
      (w2, nv) => env.DB.prepare(`INSERT INTO snakes(wallet, rarity, speed_u, magnet_u, afk_u, created) SELECT ?,?,?,?,?,? WHERE ${VER_OK}`).bind(w2, r.id, r.speed, r.magnet, r.afk, now, w2, nv),
      (w2, nv) => env.DB.prepare(`INSERT INTO gacha_log(wallet, rarity, snake_id, cost_u, created) SELECT ?,?,(SELECT MAX(id) FROM snakes WHERE wallet=?),?,? WHERE ${VER_OK}`).bind(w2, r.id, w2, price, now, w2, nv)]};
  });
  return {...state, snake: {id: results[2].meta.last_row_id, rarity: r.id, speed: r.speed, magnet: r.magnet, afk: r.afk, lvl: 0}};
}
async function selectSnake(env, w, b) {
  const id = b.id | 0, row = await env.DB.prepare('SELECT id FROM snakes WHERE id=? AND wallet=?').bind(id, w).first();
  if (!row) throw new HttpError(404, 'snake');
  return run(env, w, p => { p.active_snake = id; return {kind: 'snake_select'}; });
}
async function upgradeSnake(env, w, b) {   // [CORRIGIDO] o nível é lido DENTRO da transação e protegido por guard
  const id = b.id | 0; let info;
  const {state} = await mutate(env, w, async p => {
    const sn = await env.DB.prepare('SELECT rarity, afk_u, lvl FROM snakes WHERE id=? AND wallet=?').bind(id, w).first();
    if (!sn) throw new HttpError(404, 'snake'); if (sn.lvl >= CFG.UPG_MAX_LVL) throw new HttpError(409, 'max_level');
    const price = Math.round(CFG.UPG_BASE * Math.pow(CFG.UPG_MULT, sn.lvl)), cost = u(price); if (p.bal_u < cost) throw new HttpError(402, 'poor');
    const base = (RARITIES.find(x => x.id === sn.rarity) || RARITIES[0]).afk, step = Math.max(1, Math.round(base * 0.3));   // [CORRIGIDO] +30% da taxa BASE da raridade (como o comentário original dizia); antes compunha sobre a taxa atual
    p.bal_u -= cost; const burn = Math.floor(cost / 2); p.burned_u += burn; info = {snakeId: id, afk: sn.afk_u + step, lvl: sn.lvl + 1, price};
    return {kind: 'snake_upgrade', ref: id, burn, pool: cost - burn, guard: ['(SELECT lvl FROM snakes WHERE id=? AND wallet=?)=?', id, w, sn.lvl],
      after: [(w2, nv) => env.DB.prepare(`UPDATE snakes SET afk_u = afk_u + ?, lvl = lvl + 1 WHERE id=? AND wallet=? AND lvl=? AND ${VER_OK}`).bind(step, id, w2, sn.lvl, w2, nv)]};
  });
  return {...state, ...info};
}
// Farm AFK: paga pelo tempo real do SERVIDOR desde o último claim, somando todas as cobras, com o mesmo teto rígido
// e uma cota máxima (AFK_SHARE) do teto diário. O cliente não informa horas nem valores.
async function farmClaim(env, w) {
  let claimed = 0;
  const {state} = await mutate(env, w, async p => {
    claimed = 0; const now = Date.now(), rate = (await env.DB.prepare('SELECT COALESCE(SUM(afk_u),0) s FROM snakes WHERE wallet=?').bind(w).first()).s;
    const elapsedH = Math.min(CFG.AFK_CAP_HOURS, Math.max(0, (now - (p.afk_at || now)) / 36e5));
    if (!rate || elapsedH <= 0) { p.afk_at = now; return {kind: 'afk_claim'}; }
    const paid = pay(p, rate * elapsedH, true); p.afk_at = now; claimed = f(paid); return {kind: 'afk_claim', emit: paid};
  });
  return {...state, claimed};
}
const faucet = (env, w) => { if (env.TESTNET !== '1') throw new HttpError(403, 'mainnet'); return run(env, w, p => { if (p.faucet_at + CFG.FAUCET_MS > Date.now()) throw new HttpError(429, 'wait'); p.bal_u += u(CFG.FAUCET); p.faucet_at = Date.now(); return {kind: 'faucet'}; }); };   // faucet NÃO conta como ganho: não é sacável

// Saque: [CORRIGIDO] tudo em uma transação. Só sai o que foi GANHO jogando (earned - já sacado), limitado ao saldo,
// com idade mínima da conta e limite diário avaliado atomicamente. Contas muito suspeitas ficam em 'review' (revisão humana).
async function withdraw(env, w, b) {
  const amt = Math.floor(clamp(b.amount, 0, 1e9)); if (amt < CFG.WD_MIN) throw new HttpError(400, 'min');
  const A = u(amt), dayStart = Date.parse(today() + 'T00:00:00Z'), minAge = (env.WD_MIN_AGE_H !== undefined && +env.WD_MIN_AGE_H >= 0 ? +env.WD_MIN_AGE_H : CFG.WD_MIN_AGE_H) * 36e5;
  const {state, results} = await mutate(env, w, async p => {
    if (Date.now() - p.created < minAge) throw new HttpError(403, 'too_new');
    if (p.bal_u < A) throw new HttpError(402, 'poor');
    if (A > withdrawable(p)) throw new HttpError(402, 'locked');   // saldo existe, mas não foi ganho jogando (bônus inicial/faucet)
    const used = (await env.DB.prepare("SELECT COALESCE(SUM(amount_u),0) s FROM withdrawals WHERE wallet=? AND created>=? AND status!='failed'").bind(w, dayStart).first()).s;
    if (used + A > u(CFG.WD_DAY)) throw new HttpError(429, 'daily_limit');   // o guard abaixo repete esta checagem de forma atômica
    p.bal_u -= A; p.wd_total_u += A;
    const status = p.sus >= CFG.SUS_HOLD ? 'review' : 'pending';
    return {kind: 'withdraw', ref: null,
      guard: ["(SELECT COALESCE(SUM(amount_u),0) FROM withdrawals WHERE wallet=? AND created>=? AND status!='failed') + ? <= ?", w, dayStart, A, u(CFG.WD_DAY)],
      after: [(w2, nv) => env.DB.prepare(`INSERT INTO withdrawals(wallet, amount_u, status, created) SELECT ?,?,?,? WHERE ${VER_OK}`).bind(w2, A, status, Date.now(), w2, nv)]};
  });
  return {...state, withdrawalId: results[2].meta.last_row_id};
}

// ---------- admin (quem tem a ADMIN_KEY: o script payout.mjs) ----------
async function admin(req, env, path) {
  if (!env.ADMIN_KEY || !safeEq(req.headers.get('X-Admin-Key') || '', env.ADMIN_KEY)) throw new HttpError(403, 'forbidden');
  const list = async st => (await env.DB.prepare("SELECT id, wallet, amount_u, created FROM withdrawals WHERE status=? ORDER BY id LIMIT 50").bind(st).all()).results.map(x => ({id: x.id, wallet: x.wallet, amount: f(x.amount_u), created: x.created}));
  if (path === '/admin/queue') {
    const bp = await env.DB.prepare("SELECT v FROM stats WHERE k='burn_pending_u'").first();
    return {withdrawals: await list('pending'), processing: await list('processing'), review: await list('review'), burnPending: f(bp ? bp.v : 0)};
  }
  const b = await body(req), id = b.id | 0, S = async () => await env.DB.prepare('SELECT wallet, amount_u, status FROM withdrawals WHERE id=?').bind(id).first();
  if (path === '/admin/approve') {   // revisão humana liberou um saque retido
    const r = await env.DB.prepare("UPDATE withdrawals SET status='pending' WHERE id=? AND status='review'").bind(id).run(); if (r.meta.changes !== 1) throw new HttpError(409, 'state'); return {ok: true};
  }
  if (path === '/admin/claim') {   // [NOVO] reserva o saque ANTES de enviar: uma segunda execução do script nunca paga de novo
    const r = await env.DB.prepare("UPDATE withdrawals SET status='processing' WHERE id=? AND status='pending'").bind(id).run(); if (r.meta.changes !== 1) throw new HttpError(409, 'state'); return {ok: true};
  }
  if (path === '/admin/done') {
    const sig = String(b.sig || ''); if (sig.length < 20) throw new HttpError(400, 'sig');
    const r = await env.DB.prepare("UPDATE withdrawals SET status='sent', sig=? WHERE id=? AND status IN ('processing','pending')").bind(sig, id).run(); if (r.meta.changes !== 1) throw new HttpError(409, 'state'); return {ok: true};
  }
  if (path === '/admin/failed') {   // devolve o saldo UMA única vez (índice único no ledger impede reembolso duplo)
    const x = await S(); if (!x) throw new HttpError(404, 'not_found'); if (x.status === 'failed') return {ok: true, already: true}; if (x.status === 'sent') throw new HttpError(409, 'state');
    try {
      await env.DB.batch([
        env.DB.prepare("UPDATE withdrawals SET status='failed' WHERE id=? AND status IN ('pending','processing','review')").bind(id),
        env.DB.prepare("INSERT INTO ledger(wallet, kind, delta_u, bal_u, ref, created) SELECT ?, 'wd_refund', ?, (SELECT bal_u FROM players WHERE wallet=?) + ?, ?, ? WHERE (SELECT status FROM withdrawals WHERE id=?)='failed'").bind(x.wallet, x.amount_u, x.wallet, x.amount_u, id, Date.now(), id),
        env.DB.prepare("UPDATE players SET bal_u = bal_u + ?, wd_total_u = MAX(0, wd_total_u - ?), ver = ver + 1 WHERE wallet=? AND (SELECT status FROM withdrawals WHERE id=?)='failed' AND EXISTS(SELECT 1 FROM ledger WHERE kind='wd_refund' AND ref=?)").bind(x.amount_u, x.amount_u, x.wallet, id, id)]);
    } catch (e) { return {ok: true, already: true}; }   // violação do índice único = reembolso já feito
    return {ok: true};
  }
  if (path === '/admin/burned') {
    const A = u(clamp(b.amount, 0, 1e12)); if (!A) throw new HttpError(400, 'amount');
    const r = await env.DB.prepare("UPDATE stats SET v = v - ? WHERE k='burn_pending_u' AND v >= ?").bind(A, A).run(); if (r.meta.changes !== 1) throw new HttpError(409, 'exceeds_pending');
    await env.DB.prepare('INSERT INTO stats(k, v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v = v + excluded.v').bind('burn_done_u', A).run(); return {ok: true};
  }
  throw new HttpError(404, 'not_found');
}
