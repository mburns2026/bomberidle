// Phantom connection (identifies the wallet only; never moves funds)
(function () {
  const short = a => a.slice(0, 4) + '…' + a.slice(-4);
  const prov = () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) ? window.phantom.solana
    : (window.solana && window.solana.isPhantom ? window.solana : null);
  const W = window.Wallet = {pubkey: null};
  function paint() {
    document.querySelectorAll('[data-wallet-btn]').forEach(b => {
      b.textContent = W.pubkey ? '🟢 ' + short(W.pubkey) : t('wc');
      b.title = W.pubkey ? t('wd') : t('wt');
    });
  }
  function changed() { paint(); window.dispatchEvent(new CustomEvent('wallet', {detail: W.pubkey})); }   // só quando a carteira muda de verdade
  W.sign = async msg => { const p = prov(), r = await p.signMessage(new TextEncoder().encode(msg), 'utf8'); return btoa(String.fromCharCode(...r.signature)); };
  async function connect() {
    const p = prov();
    if (!p) {
      if (/Android|iPhone|iPad/i.test(navigator.userAgent))
        location.href = 'https://phantom.app/ul/browse/' + encodeURIComponent(location.href) + '?ref=' + encodeURIComponent(location.origin);
      else { alert(t('wn')); window.open('https://phantom.app/download', '_blank', 'noopener'); }
      return;
    }
    try { const r = await p.connect(); W.pubkey = r.publicKey.toString(); changed(); } catch (e) { /* usuário recusou */ }
  }
  async function disconnect() { const p = prov(); if (p) await p.disconnect(); W.pubkey = null; changed(); }
  addEventListener('langchange', paint);
  document.addEventListener('click', e => { const b = e.target.closest('[data-wallet-btn]'); if (b) (W.pubkey ? disconnect() : connect()); });
  addEventListener('load', () => {
    const p = prov(); if (!p) return paint();
    p.on('disconnect', () => { W.pubkey = null; changed(); });
    p.on('accountChanged', k => { W.pubkey = k ? k.toString() : null; changed(); });
    p.connect({onlyIfTrusted: true}).then(r => { W.pubkey = r.publicKey.toString(); changed(); }).catch(paint);
  });
})();
