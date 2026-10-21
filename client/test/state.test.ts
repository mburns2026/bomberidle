import { test } from "node:test";
import assert from "node:assert/strict";

// state.ts le o localStorage ao ser importado: cada teste monta o "navegador" e importa uma copia nova.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
let n = 0;
const load = async () => (await import(`../src/state.ts?t=${++n}`)) as typeof import("../src/state");
const KEY = "bomber-idle:v1";
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const op = (extra = {}) => ({ r: "common", n: 1, xp: 0, lv: 1, up: { stamina: 0, speed: 0, luck: 0 }, j: { s: 0, v: 0, l: 0 }, ...extra });

test("save novo: 1 operador, saldo inicial e mapa 1", async () => {
  mem.clear();
  const s = await load();
  assert.equal(s.store.collection.length, 1);
  assert.equal(s.store.pending, s.START_BALANCE);
  assert.deepEqual([s.mapState.index, s.mapState.instance, s.mapState.auto], [0, 1, true]);
});

test("mapa, instancia e Auto sobrevivem a recarregar a pagina", async () => {
  mem.clear();
  mem.set(KEY, JSON.stringify({ pending: 5, chests: 0, wk: true, owned: [op({ w: 1 })], map: { i: 12, n: 20, a: true } }));
  const s = await load();
  assert.deepEqual([s.mapState.index, s.mapState.instance, s.mapState.auto], [12, 20, true]);
  s.mapState.instance = 21;
  s.saveNow();
  const s2 = await load();
  assert.equal(s2.mapState.instance, 21);
});

test("ponto de retomada do Auto e salvo", async () => {
  mem.clear();
  mem.set(KEY, JSON.stringify({ pending: 0, chests: 0, wk: true, owned: [op()], map: { i: 3, n: 1, a: false, r: { i: 9, n: 30 } } }));
  const s = await load();
  assert.equal(s.mapState.auto, false);
  assert.deepEqual(s.mapState.resume, { i: 9, n: 30 });
});

test("mapa salvo invalido volta ao padrao em vez de quebrar o jogo", async () => {
  for (const bad of [{ i: 999, n: 1, a: true }, { i: 0, n: 0, a: true }, { i: -1, n: 5, a: true }, { i: 1.5, n: 5, a: true }]) {
    mem.clear();
    mem.set(KEY, JSON.stringify({ pending: 0, chests: 0, wk: true, owned: [op()], map: bad }));
    const s = await load();
    assert.deepEqual([s.mapState.index, s.mapState.instance], [0, 1], JSON.stringify(bad));
  }
});

test("stamina e salva (recarregar nao enche mais a barra) e nunca passa do maximo", async () => {
  mem.clear();
  mem.set(KEY, JSON.stringify({ pending: 0, chests: 0, wk: true, owned: [op({ s: 2.5 }), op({ n: 2, s: 9999 })] }));
  const s = await load();
  const [a, b] = s.store.collection;
  assert.equal(a.stamina, 2.5);
  assert.equal(b.stamina, b.maxStamina);
});

test("save antigo sem stamina continua valido (comeca cheio)", async () => {
  mem.clear();
  mem.set(KEY, JSON.stringify({ pending: 0, chests: 0, wk: true, owned: [op()] }));
  const s = await load();
  assert.equal(s.store.collection[0].stamina, s.store.collection[0].maxStamina);
});

test("missoes do dia usam a data local, nao UTC", async () => {
  mem.clear();
  const daily = { day: localDay(), blocks: 7, bombs: 0, chests: 0, maps: [], claimed: [] };
  mem.set(KEY, JSON.stringify({ pending: 0, chests: 0, wk: true, owned: [op()], daily }));
  const s = await load();
  assert.equal(s.store.daily.blocks, 7);
  mem.set(KEY, JSON.stringify({ pending: 0, chests: 0, wk: true, owned: [op()], daily: { ...daily, day: "2000-01-01" } }));
  assert.equal((await load()).store.daily.blocks, 0);
});

test("comprar capsula cobra, adiciona operador e avisa a lista para se refazer", async () => {
  mem.clear();
  const s = await load();
  const v = s.store.version;
  const r = s.buyCapsule(2);
  assert.ok(Array.isArray(r) && r.length === 2);
  assert.equal(s.store.pending, s.START_BALANCE - 2 * s.CAPSULE_PRICE);
  assert.equal(s.store.collection.length, 3);
  assert.ok(s.store.version > v);
  assert.equal(s.buyCapsule(1), "$BOMBERSI insuficientes");
});

test("mandar operador trabalhar ou descansar NAO refaz a lista inteira (evitava pular o scroll)", async () => {
  mem.clear();
  const s = await load();
  s.buyCapsule(2);
  const v = s.store.version;
  s.setWorking(s.store.collection[1], false);
  s.restAll();
  s.workAll();
  assert.equal(s.store.version, v);
});

test("chances da capsula somam 100% e o HP dos baus cresce com a raridade", async () => {
  const s = await load();
  assert.equal(Object.values(s.CAPSULE_ODDS).reduce((a, b) => a + b, 0), 100);
  const hp = s.RARITY_ORDER.map((r) => s.RARITIES[r].hp);
  assert.deepEqual(hp, [...hp].sort((a, b) => a - b));
});

test("mapas: 50 ids unicos x 33 instancias", async () => {
  const m = await import("../src/maps.ts");
  assert.equal(m.MAPS.length, 50);
  assert.equal(new Set(m.MAPS.map((x) => x.id)).size, 50);
  assert.equal(m.INSTANCES_PER_MAP, 33);
});
