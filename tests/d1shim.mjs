// Simulador mínimo de D1 sobre node:sqlite (Node >= 22.13). Só para testes locais.
// batch() roda TODAS as instruções de forma síncrona (nenhuma outra requisição intercala) e dá ROLLBACK se alguma falhar — como o D1 real.
import {DatabaseSync} from 'node:sqlite';
export function makeDB(...sqls) {
  const db = new DatabaseSync(':memory:'); for (const s of sqls) db.exec(s);
  const wrap = sql => ({sql, _b: [], bind(...a) { this._b = a; return this; },
    _run() { const r = db.prepare(sql).run(...this._b); return {success: true, meta: {changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid)}}; },
    _first() { return db.prepare(sql).get(...this._b) ?? null; },
    _all() { return {results: db.prepare(sql).all(...this._b)}; },
    async run() { await null; return this._run(); }, async first() { await null; return this._first(); }, async all() { await null; return this._all(); }});
  return {raw: db, prepare: wrap,
    async batch(stmts) { await null; db.exec('BEGIN'); try { const out = stmts.map(s => /^\s*(select|with)/i.test(s.sql) ? {results: s._all().results, meta: {}} : s._run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } }};
}
