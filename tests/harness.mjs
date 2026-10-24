import fs from 'node:fs'; import crypto from 'node:crypto'; import {fileURLToPath} from 'node:url'; import path from 'node:path';
import {makeDB} from './d1shim.mjs';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
export const SCHEMA = read('schema.sql'), SECRET = 'test-secret-test-secret-test-secret-1234';
export const worker = (await import(path.join(ROOT, 'worker.js'))).default;
export const tokenFor = (w, exp = Date.now() + 864e5) => { const p = Buffer.from(JSON.stringify({w, exp})).toString('base64url'); return p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url'); };
export const mkenv = (extra = {}) => ({DB: makeDB(SCHEMA), JWT_SECRET: SECRET, ADMIN_KEY: 'admin-key-for-tests', TESTNET: '0', ALLOW_ORIGIN: 'https://game.example', WD_MIN_AGE_H: '0', ...extra});
export const req = (e, path, {w, body, headers = {}, token} = {}) => worker.fetch(new Request('https://x' + path, {method: body === undefined ? 'GET' : 'POST',
  headers: {'Content-Type': 'application/json', 'CF-Connecting-IP': headers.ip || '1.1.1.' + Math.floor(Math.random() * 250), ...(w || token ? {Authorization: 'Bearer ' + (token || tokenFor(w))} : {}), ...headers}, body: body === undefined ? undefined : JSON.stringify(body)}), e);
export const call = async (e, w, path, body, headers) => { const r = await req(e, path, {w, body, headers}); return {status: r.status, body: await r.json()}; };
export const adm = async (e, path, body) => { const r = await req(e, path, {body, headers: {'X-Admin-Key': 'admin-key-for-tests'}}); return {status: r.status, body: await r.json()}; };
export const admGet = async (e, path) => { const r = await worker.fetch(new Request('https://x' + path, {headers: {'X-Admin-Key': 'admin-key-for-tests', 'CF-Connecting-IP': '9.9.9.9'}}), e); return {status: r.status, body: await r.json()}; };
const day = () => new Date().toISOString().slice(0, 10);
// cria jogador direto no banco (com linha de ledger inicial para o invariante de conciliação)
export function seed(e, w, {bal = 0, earned = bal, created = Date.now() - 10 * 864e5, sus = 0} = {}) {
  e.DB.raw.prepare('INSERT INTO players(wallet, bal_u, day, q, created, earned_u, sus) VALUES(?,?,?,?,?,?,?)').run(w, Math.round(bal * 1e4), day(), null, created, Math.round(earned * 1e4), sus);
  e.DB.raw.prepare("INSERT INTO ledger(wallet, kind, delta_u, bal_u, ref, created) VALUES(?,?,?,?,?,?)").run(w, 'seed', Math.round(bal * 1e4), Math.round(bal * 1e4), null, Date.now());
}
export const row = (e, sql, ...a) => e.DB.raw.prepare(sql).get(...a);
export const rows = (e, sql, ...a) => e.DB.raw.prepare(sql).all(...a);
export const f = n => n / 1e4;
export const addSnake = (e, w, rarity = 'epic', afk = 8) => e.DB.raw.prepare('INSERT INTO snakes(wallet, rarity, speed_u, magnet_u, afk_u, created) VALUES(?,?,?,?,?,?)').run(w, rarity, 0, 0, afk, Date.now());
// Ed25519 + base58 para testar o login real
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const b58enc = buf => { let n = BigInt('0x' + Buffer.from(buf).toString('hex')), s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b === 0) s = '1' + s; else break; } return s; };
export function newWallet() { const {publicKey, privateKey} = crypto.generateKeyPairSync('ed25519'); const raw = publicKey.export({format: 'der', type: 'spki'}).subarray(-32);
  return {addr: b58enc(raw), sign: m => crypto.sign(null, Buffer.from(m), privateKey).toString('base64')}; }
