-- 0001: cobras (gacha), farm AFK e log de gacha. O worker JÁ dependia disto, mas o schema.sql original não criava.
-- ATENÇÃO (banco de produção existente): SQLite não tem "ADD COLUMN IF NOT EXISTS".
-- Antes de aplicar, rode:  npx wrangler d1 execute slither --remote --command "PRAGMA table_info(players)"
-- Se as colunas active_snake e afk_at JÁ aparecerem, apague as duas linhas ALTER abaixo e aplique o resto.
ALTER TABLE players ADD COLUMN active_snake INTEGER;
ALTER TABLE players ADD COLUMN afk_at INTEGER;
CREATE TABLE IF NOT EXISTS snakes(
  id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT, rarity TEXT, speed_u INTEGER, magnet_u INTEGER, afk_u INTEGER, lvl INTEGER DEFAULT 0, created INTEGER);
CREATE INDEX IF NOT EXISTS ix_snakes_wallet ON snakes(wallet);
CREATE TABLE IF NOT EXISTS gacha_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT, rarity TEXT, snake_id INTEGER, cost_u INTEGER, created INTEGER);
