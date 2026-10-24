import { test } from "node:test";
import assert from "node:assert/strict";

// Mesmo esquema de state.test.ts: o "navegador" e montado a cada teste e o modulo e importado de novo.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
let n = 0;
const load = async () => (await import(`../src/state.ts?b=${++n}`)) as typeof import("../src/state");
const KEY = "bomber-idle:v1";
const op = (extra: Record<string, unknown> = {}) => ({ r: "common", n: 1, xp: 0, lv: 1, up: { stamina: 0, speed: 0, luck: 0 }, j: { s: 0, v: 0, l: 0 }, ...extra });
const put = (o: Record<string, unknown>) => mem.set(KEY, JSON.stringify({ pending: 0, chests: 0, wk: true, ...o }));
const stored = () => JSON.parse(mem.get(KEY)!);

test("save da 1.7.1 (sem estatisticas) carrega sem perder nada e comeca com estatisticas zeradas", async () => {
  mem.clear();
  put({ pending: 123456, chests: 77, serial: 9, owned: [
    op({ r: "legendary", n: 4, xp: 55, lv: 12, up: { stamina: 3, speed: 2, luck: 1 }, j: { s: 1, v: 0.05, l: 0.1 }, w: 1, s: 7.25 }),
    op({ r: "super", n: 8, xp: 10, lv: 30, up: { stamina: 10, speed: 10, luck: 10 }, j: { s: 0, v: 0, l: 0.2 } }),
  ] });
  const s = await load();
  assert.equal(s.store.pending, 123456); assert.equal(s.store.chests, 77);
  const [jax, orion] = s.store.collection;
  assert.deepEqual([jax.rarity, jax.serial, jax.level, jax.xp, jax.up, jax.stamina], ["legendary", 4, 12, 55, { stamina: 3, speed: 2, luck: 1 }, 7.25]);
  assert.deepEqual([orion.rarity, orion.level, orion.up], ["super", 30, { stamina: 10, speed: 10, luck: 10 }]);
  assert.deepEqual(jax.stats, { chests: 0, blocks: 0, enemies: 0, crits: 0, skills: 0 });
  assert.equal(s.isWorking(jax), true); assert.equal(s.isWorking(orion), false);
  assert.equal(jax.maxStamina, 12 + 1 + 2 * 3 + 11, "atributos recalculados como antes");
});

test("estatisticas sobrevivem a recarregar; o save continua na mesma chave e so ganha o campo opcional", async () => {
  mem.clear();
  put({ owned: [op({ w: 1 })] });
  const s = await load();
  s.bumpStat(s.store.collection[0], "chests", 3); s.bumpStat(s.store.collection[0], "crits");
  s.saveNow();
  assert.ok(mem.has(KEY) && !mem.has("bomber-idle:v2"));
  const o = stored().owned[0];
  assert.deepEqual(Object.keys(o).sort(), ["j", "lv", "n", "r", "s", "st", "up", "w", "xp"], "nenhum dado de habilidade temporaria e gravado");
  const s2 = await load();
  assert.deepEqual(s2.store.collection[0].stats, { chests: 3, blocks: 0, enemies: 0, crits: 1, skills: 0 });
});

test("saves corrompidos viram valores seguros (sem NaN, Infinity ou negativos) e itens invalidos sao descartados", async () => {
  mem.clear();
  put({ pending: "abc", chests: -5, owned: [
    op({ n: 1, lv: -5, xp: "x", up: { stamina: 999, speed: -4, luck: null }, j: { s: 1e9, v: "a", l: -1 }, s: -3, st: { chests: -1, blocks: "z", crits: 5.9 } }),
    op({ r: "dragao", n: 2 }),
    op({ n: 0 }), op({ n: "x" }), null, "lixo",
    op({ r: "epic", n: 3, lv: 9999, xp: 1e99, s: 1e99 }),
  ] });
  const s = await load();
  assert.equal(s.store.pending, 0); assert.equal(s.store.chests, 0);
  assert.equal(s.store.collection.length, 2);
  for (const h of s.store.collection) {
    for (const v of [h.level, h.xp, h.stamina, h.maxStamina, h.speed, h.luck, h.up.stamina, h.up.speed, h.up.luck, ...Object.values(h.stats)]) assert.ok(Number.isFinite(v) && v >= 0, `${h.name}: ${v}`);
    assert.ok(h.stamina <= h.maxStamina); assert.ok(h.level <= 30 && h.level >= 1); assert.ok(h.up.stamina <= s.UP_MAX);
  }
  const a = s.store.collection.find((h) => h.serial === 1)!;
  assert.equal(a.level, 1); assert.deepEqual(a.up, { stamina: 10, speed: 0, luck: 0 });
  assert.deepEqual(a.stats, { chests: 0, blocks: 0, enemies: 0, crits: 5, skills: 0 });
  assert.equal(a.stamina, a.maxStamina, "stamina salva invalida usa o padrao da 1.7.1 (cheia), sempre finita e dentro do maximo");
});

test("owned que nao e lista nao derruba o jogo: cai no operador inicial", async () => {
  for (const bad of ["x", 5, {}, [null]]) {
    mem.clear(); put({ owned: bad, pending: 10 });
    const s = await load();
    assert.equal(s.store.collection.length, 1, JSON.stringify(bad));
    assert.equal(s.store.pending, 10);
  }
});

test("formato anterior a 1.6 (heroes por chave) continua migrando com nivel, XP e melhorias", async () => {
  mem.clear();
  mem.set(KEY, JSON.stringify({ pending: 50, chests: 2, heroes: { lyra: { xp: 4, level: 3, up: { stamina: 2, speed: 0, luck: 0 } }, orion: { xp: 9, level: 20, up: { stamina: 1, speed: 1, luck: 1 } } } }));
  const s = await load();
  assert.equal(s.store.collection.length, 6);
  const lyra = s.store.collection.find((h) => h.serial === 1)!, orion = s.store.collection.find((h) => h.serial === 6)!;
  assert.deepEqual([lyra.level, lyra.xp, lyra.up.stamina], [3, 4, 2]);
  assert.deepEqual([orion.rarity, orion.level, orion.xp], ["super", 20, 9]);
});

test("os 6 operadores originais mantem identificadores, raridade e atributos de fabrica da 1.7.1", async () => {
  mem.clear(); put({ owned: ["common", "rare", "epic", "mythic", "legendary", "super"].map((r, i) => op({ r, n: i + 1 })) });
  const s = await load();
  const by = Object.fromEntries(s.store.collection.map((h) => [h.rarity, h]));
  assert.deepEqual(s.store.collection.map((h) => h.id).sort(), ["op1", "op2", "op3", "op4", "op5", "op6"]);
  assert.deepEqual([by.common.power, by.rare.power, by.epic.power, by.mythic.power, by.legendary.power, by.super.power], [1, 5, 3, 2, 3, 5]);
  assert.deepEqual([by.common.speed, by.rare.speed, by.mythic.speed, by.legendary.speed, by.super.speed], [1, 0.8, 2, 1.7, 1.8]);
  assert.ok(by.rare.speed < by.mythic.speed, "Titan continua mais lento que Kira");
  assert.equal(by.legendary.melee, true); assert.equal(s.store.collection.filter((h) => h.melee).length, 1);
  assert.equal(by.super.chestMult, 2);
});

test("economia intacta: dano da bomba, capsula, alojamento, Zelador, melhoria e missao", async () => {
  mem.clear(); put({ pending: 2_000_000, owned: [op({ n: 1, w: 1, s: 1 }), op({ n: 2, s: 1 })] });
  const s = await load();
  assert.equal(s.bombDamage({ power: 5, level: 1 }), 18); assert.equal(s.bombDamage({ power: 1, level: 11 }), 14);
  assert.equal(s.CAPSULE_PRICE, 30000); assert.equal(s.MAX_WORKING, 15); assert.equal(s.REWARD_SCALE, 100);
  const [a, b] = s.store.collection;
  assert.equal(s.buyLodging("casulo"), null); assert.equal(s.store.pending, 2_000_000 - 150000);
  s.economyTick();
  assert.equal(s.store.housed.get(b.id), "casulo");
  assert.ok(b.stamina > 1 && b.stamina <= b.maxStamina, "descanso no casulo recupera stamina");
  assert.equal(s.upgrade(a, "luck"), true); assert.equal(a.up.luck, 1);
  const before = s.store.pending;
  assert.equal(s.buyButler(), null); assert.equal(s.store.pending, before - s.BUTLER_PRICE);
  const r = s.buyCapsule(1); assert.ok(Array.isArray(r) && r.length === 1);
  s.track.bomb(); s.track.block();
  assert.equal(s.store.daily.bombs, 1);
  s.addReward(500, a, 1);
  assert.equal(s.store.pending >= 500, true); assert.equal(s.store.chests, 1);
});

test("addReward e addEnemyReward continuam pagando uma vez por chamada (sem recompensa extra por habilidade)", async () => {
  mem.clear(); put({ pending: 0, owned: [op({ r: "legendary", n: 1, w: 1 })] });
  const s = await load(); const h = s.store.collection[0];
  s.addReward(1000, h, 1); assert.equal(s.store.pending, 1000);
  s.addEnemyReward(600, h); assert.equal(s.store.pending, 1600);
  s.bumpStat(h, "skills", 50); assert.equal(s.store.pending, 1600, "estatisticas nao mexem no saldo");
});

test("habilidades temporarias nao persistem: recarregar comeca sem efeitos e com aquecimento de recarga", async () => {
  const ab = await import(`../src/game/bomberAbilities.ts?c=${++n}`);
  const cfg = await import("../src/game/bomberConfig.ts");
  ab.resetRegistry();
  const h = { id: "op4", rarity: "legendary", level: 30, stamina: 10, maxStamina: 10 };
  const rt = ab.runtimeOf(h); rt.cd = {};
  assert.equal(ab.activate(rt, cfg.ABILITY_DEFS.jax_flurry, h), true);
  assert.ok(ab.modifiersOf(rt, h).hitIntervalMult < 1);
  ab.resetRegistry(); // "recarregar a pagina": o registro vive so na memoria
  const rt2 = ab.runtimeOf(h);
  assert.deepEqual(rt2.active, {});
  assert.equal(ab.modifiersOf(rt2, h).hitIntervalMult, 1);
  assert.equal(rt2.cd.jax_flurry, Math.round(cfg.ABILITY_DEFS.jax_flurry.cooldownMs * cfg.BALANCE.warmupFraction));
});

test("8 BOMBERS: Kai (Incomum) e Aeon (Ancestral, o topo) existem, sao carregaveis e a ordem de raridade esta certa", async () => {
  mem.clear(); put({ owned: ["common", "uncommon", "rare", "epic", "mythic", "legendary", "super", "ancestral"].map((r, i) => op({ r, n: i + 1, lv: 5 })) });
  const s = await load();
  assert.deepEqual(s.RARITY_ORDER, ["common", "uncommon", "rare", "epic", "mythic", "legendary", "super", "ancestral"]);
  assert.equal(s.store.collection.length, 8);
  const by = Object.fromEntries(s.store.collection.map((h) => [h.rarity, h]));
  assert.equal(by.uncommon.name, "Kai #2"); assert.equal(by.ancestral.name, "Aeon #8");
  assert.equal(by.uncommon.portrait, "nft/kai.jpg"); assert.equal(by.ancestral.portrait, "nft/aeon.jpg");
  assert.equal(s.RARITIES.uncommon.label, "Incomum"); assert.equal(s.RARITIES.ancestral.label, "Ancestral");
  // Aeon no topo de tudo (menos velocidade: a Kira continua a mais veloz) e Kai entre Comum e Raro
  const others = s.store.collection.filter((h) => h.rarity !== "ancestral");
  for (const k of ["power", "maxStamina", "luck", "chestMult"] as const) assert.ok(others.every((h) => by.ancestral[k] >= h[k]), k);
  assert.ok(s.RARITIES.ancestral.mult > Math.max(...others.map((h) => s.RARITIES[h.rarity].mult)));
  assert.ok(by.ancestral.speed < by.mythic.speed && by.ancestral.speed > by.super.speed, "Kira segue como a mais veloz");
  assert.ok(s.RARITIES.common.mult < s.RARITIES.uncommon.mult && s.RARITIES.uncommon.mult < s.RARITIES.rare.mult);
  assert.ok(by.uncommon.power < by.rare.power && by.uncommon.maxStamina > by.common.maxStamina);
});

test("capsula: as chances somam 100, Raro..Super lendario seguem iguais a 1.7.1 e so o Comum foi dividido", async () => {
  mem.clear(); put({ owned: [op()] });
  const s = await load();
  const sum = Object.values(s.CAPSULE_ODDS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9, `soma ${sum}`);
  const o = s.CAPSULE_ODDS;
  assert.deepEqual([o.rare, o.epic, o.mythic, o.legendary, o.super], [24, 12, 6, 2.5, 0.5]);
  assert.ok(Math.abs(o.common + o.uncommon + o.ancestral - 55) < 1e-9, "os 55% do Comum de 1.7.1 foram repartidos");
  assert.equal(o.ancestral, 0.1); assert.ok(o.ancestral < o.super, "Aeon e mais raro que o Orion");
});

test("migracao de saves antigos (pre-1.6) cria so os 6 operadores originais, nunca Kai nem Aeon de graca", async () => {
  mem.clear();
  mem.set(KEY, JSON.stringify({ pending: 1, chests: 0, heroes: { lyra: { xp: 0, level: 2, up: { stamina: 0, speed: 0, luck: 0 } } } }));
  const s = await load();
  assert.deepEqual(s.store.collection.map((h) => h.rarity), ["common", "rare", "epic", "mythic", "legendary", "super"]);
});
