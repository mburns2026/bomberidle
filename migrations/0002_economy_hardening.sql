-- 0002: livro-caixa, idempotência, rate limit, "ganho jogando" (earned_u) e cota de AFK.
-- Backfill conservador: earned_u = saldo atual - 100 (bônus inicial) + já sacado. Ajuste se souber a composição real dos saldos.
ALTER TABLE players ADD COLUMN earned_u INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN wd_total_u INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN afk_today_u INTEGER DEFAULT 0;
UPDATE players SET wd_total_u = COALESCE((SELECT SUM(amount_u) FROM withdrawals w WHERE w.wallet = players.wallet AND w.status != 'failed'), 0);
UPDATE players SET earned_u = MAX(0, bal_u - 1000000) + wd_total_u;
CREATE TABLE IF NOT EXISTS ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT NOT NULL, kind TEXT NOT NULL, delta_u INTEGER NOT NULL, bal_u INTEGER NOT NULL, ref, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_ledger_wallet ON ledger(wallet, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_refund ON ledger(ref) WHERE kind = 'wd_refund';   -- um saque só pode ser reembolsado uma vez
CREATE TABLE IF NOT EXISTS idem(wallet TEXT NOT NULL, k TEXT NOT NULL, resp TEXT, created INTEGER NOT NULL, PRIMARY KEY(wallet, k));
CREATE TABLE IF NOT EXISTS rl(k TEXT NOT NULL, win INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(k, win));
CREATE INDEX IF NOT EXISTS ix_withdrawals_wallet ON withdrawals(wallet, created);
CREATE INDEX IF NOT EXISTS ix_withdrawals_status ON withdrawals(status);
