-- Instalação NOVA (banco vazio). Equivale à versão original + migrations/0001 + migrations/0002.
-- Banco já existente? NÃO rode este arquivo: use as migrações (ver README, "Atualizando um banco existente").
CREATE TABLE IF NOT EXISTS players(
  wallet TEXT PRIMARY KEY, bal_u INTEGER DEFAULT 0, today_u INTEGER DEFAULT 0, day TEXT, burned_u INTEGER DEFAULT 0,
  pts INTEGER DEFAULT 0, vip INTEGER DEFAULT 0, skin INTEGER DEFAULT 0, owned TEXT DEFAULT '[0]', faucet_at INTEGER DEFAULT 0,
  last_sync INTEGER DEFAULT 0, q TEXT, sus INTEGER DEFAULT 0, ver INTEGER DEFAULT 0, created INTEGER,
  active_snake INTEGER, afk_at INTEGER,
  earned_u INTEGER DEFAULT 0, wd_total_u INTEGER DEFAULT 0, afk_today_u INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS nonces(wallet TEXT, nonce TEXT, exp INTEGER, PRIMARY KEY(wallet, nonce));
CREATE TABLE IF NOT EXISTS withdrawals(
  id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT, amount_u INTEGER, status TEXT DEFAULT 'pending', sig TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS stats(k TEXT PRIMARY KEY, v INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS snakes(
  id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT, rarity TEXT, speed_u INTEGER, magnet_u INTEGER, afk_u INTEGER, lvl INTEGER DEFAULT 0, created INTEGER);
CREATE INDEX IF NOT EXISTS ix_snakes_wallet ON snakes(wallet);
CREATE TABLE IF NOT EXISTS gacha_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT, rarity TEXT, snake_id INTEGER, cost_u INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT NOT NULL, kind TEXT NOT NULL, delta_u INTEGER NOT NULL, bal_u INTEGER NOT NULL, ref, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_ledger_wallet ON ledger(wallet, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_refund ON ledger(ref) WHERE kind = 'wd_refund';
CREATE TABLE IF NOT EXISTS idem(wallet TEXT NOT NULL, k TEXT NOT NULL, resp TEXT, created INTEGER NOT NULL, PRIMARY KEY(wallet, k));
CREATE TABLE IF NOT EXISTS rl(k TEXT NOT NULL, win INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(k, win));
CREATE INDEX IF NOT EXISTS ix_withdrawals_wallet ON withdrawals(wallet, created);
CREATE INDEX IF NOT EXISTS ix_withdrawals_status ON withdrawals(status);
