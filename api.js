// Cliente da API (modo online). Sem API_URL, ou se o jogador não assinar, tudo continua em modo local.
(function () {
  const K = 'slitheri_token', cfg = () => window.SITE || {};
  const A = window.Api = {token: null, wallet: null, online: false};
  try { const o = JSON.parse(localStorage.getItem(K) || 'null'); if (o && o.exp > Date.now()) { A.token = o.token; A.wallet = o.wallet; } } catch (e) {}
  const changed = () => window.dispatchEvent(new Event('apistate'));
  A.enabled = () => !!cfg().API_URL;
  // Operações que movem saldo levam uma Idempotency-Key. A MESMA chave é reutilizada se a resposta se perdeu na rede
  // (o servidor então devolve o resultado original em vez de executar de novo) e cliques duplicados em andamento são ignorados.
  const VALUE = new Set(['/shop', '/gacha', '/snake/upgrade', '/farm/claim', '/faucet', '/withdraw']), keys = new Map(), busy = new Set();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  A.call = async (path, body) => {
    const value = VALUE.has(path), sig = value ? path + JSON.stringify(body || {}) : '';
    if (value) { if (busy.has(sig)) throw Object.assign(new Error('busy'), {code: 'busy'}); busy.add(sig); }
    let k = null; if (value) { const o = keys.get(sig); k = o && Date.now() - o.t < 6e4 ? o.k : uuid(); keys.set(sig, {k, t: Date.now()}); }
    let r;
    try { r = await fetch(cfg().API_URL + path, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type': 'application/json', ...(A.token ? {Authorization: 'Bearer ' + A.token} : {}), ...(k ? {'Idempotency-Key': k} : {})}, body: body === undefined ? undefined : JSON.stringify(body)}); }
    catch (e) { if (value) busy.delete(sig); throw e; }   // falha de rede: mantém a chave para a nova tentativa
    if (value) { busy.delete(sig); keys.delete(sig); }   // o servidor respondeu (ok ou erro): a próxima ação é uma ação nova
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !path.startsWith('/auth/')) A.logout();
    if (!r.ok) throw Object.assign(new Error(j.error || 'http ' + r.status), {status: r.status, code: j.error});
    return j;
  };
  A.logout = () => { A.token = null; A.online = false; try { localStorage.removeItem(K); } catch (e) {} Save.setOnline(null); changed(); };
  A.refresh = async () => { Save.setOnline(await A.call('/me')); A.online = true; changed(); };
  A.login = async w => {   // assina uma mensagem (não move fundos, não custa nada)
    const n = await A.call('/auth/nonce', {wallet: w}), sig = await Wallet.sign(n.message);
    const v = await A.call('/auth/verify', {wallet: w, nonce: n.nonce, signature: sig});
    A.token = v.token; A.wallet = w; try { localStorage.setItem(K, JSON.stringify({token: v.token, wallet: w, exp: v.exp})); } catch (e) {}
    Save.setOnline(v.state); A.online = true; changed();
  };
  addEventListener('wallet', async e => {
    if (!A.enabled()) return; const w = e.detail;
    if (!w) { if (A.token) A.logout(); return; }
    try { if (A.token && A.wallet === w) await A.refresh(); else { A.logout(); await A.login(w); } }
    catch (err) { A.online = false; changed(); }   // recusou assinar ou servidor fora do ar: segue em modo local
  });
})();
