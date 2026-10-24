import test from 'node:test'; import assert from 'node:assert/strict';
import {makeDB} from './d1shim.mjs'; import {read, SCHEMA} from './harness.mjs';
const cols = (db, t) => db.raw.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name).sort();
const tables = db => db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name).sort();
test('banco ORIGINAL + migrações 0001 e 0002 == schema.sql novo (mesmas tabelas e colunas)', () => {
  const fresh = makeDB(SCHEMA), upgraded = makeDB(read('tests/fixtures/schema_v1_original.sql'), read('migrations/0001_snakes_afk.sql'), read('migrations/0002_economy_hardening.sql'));
  assert.deepEqual(tables(upgraded), tables(fresh)); for (const t of tables(fresh)) assert.deepEqual(cols(upgraded, t), cols(fresh, t), 'tabela ' + t);
});
test('migração 0002 preserva dados: saldos intactos, saque já feito entra em wd_total e ganhos não passam do saldo', () => {
  const db = makeDB(read('tests/fixtures/schema_v1_original.sql'), read('migrations/0001_snakes_afk.sql'));
  db.raw.exec("INSERT INTO players(wallet, bal_u, day, created) VALUES('a', 5000000, '2026-01-01', 1), ('b', 1000000, '2026-01-01', 1)");
  db.raw.exec("INSERT INTO withdrawals(wallet, amount_u, status, created) VALUES('a', 1000000, 'sent', 1), ('a', 500000, 'failed', 1)");
  db.raw.exec(read('migrations/0002_economy_hardening.sql'));
  const a = db.raw.prepare("SELECT * FROM players WHERE wallet='a'").get(), b = db.raw.prepare("SELECT * FROM players WHERE wallet='b'").get();
  assert.equal(a.bal_u, 5000000); assert.equal(a.wd_total_u, 1000000, 'failed não conta'); assert.equal(a.earned_u, 4000000 + 1000000);
  assert.equal(b.earned_u, 0, 'conta que só tem o bônus inicial (100) não ganha direito a saque');
});
test('índice único impede reembolso duplicado no ledger', () => {
  const db = makeDB(SCHEMA); const ins = () => db.raw.prepare("INSERT INTO ledger(wallet,kind,delta_u,bal_u,ref,created) VALUES('w','wd_refund',1,1,7,1)").run();
  ins(); assert.throws(ins);
});
