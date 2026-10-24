import { test } from "node:test";
import assert from "node:assert/strict";
import { ABILITY_DEFS, ABILITIES_BY_CLASS, BALANCE, LIMITS, NEUTRAL_MODS, AI_TUNING } from "../src/game/bomberConfig.ts";
import { CLASS_BY_RARITY } from "../src/game/bomberTypes.ts";
import type { AbilityContext, AbilityId, BomberClass, CellTarget, WorldView } from "../src/game/bomberTypes.ts";
import {
  activate, abilityStatus, auraOf, bomberClass, clearTransient, consumeArmed, createRuntime, decideAbilities, detectRadius, isReady,
  modifiersOf, repairPulse, resetRegistry, runtimeOf, setTeamBuff, syncCooldowns, tickRuntime, type BomberLike,
} from "../src/game/bomberAbilities.ts";
import {
  blastCells, bombDamageVs, bombRange, bombSnapshot, createRng, gainStamina, meleeDamage, newCombo, registerHit, rollCrit, spendStamina,
} from "../src/game/bomberCombat.ts";
import {
  bfsField, blacklist, buildCandidates, chooseTarget, hasEscape, newAIState, pathTo, recordAction, recordMove, reportProgress, scoreCandidate, distAt, DIRS4,
} from "../src/game/bomberAI.ts";

const hero = (rarity: BomberLike["rarity"], over: Partial<BomberLike> = {}): BomberLike => ({ id: `h-${rarity}`, rarity, level: 30, stamina: 10, maxStamina: 10, ...over });
const CLASSES: BomberClass[] = ["lyra", "kai", "titan", "vex", "kira", "jax", "orion", "aeon"];
const RARITIES8 = ["common", "uncommon", "rare", "epic", "mythic", "legendary", "super", "ancestral"] as const;
const ctx = (o: Partial<AbilityContext> = {}): AbilityContext => ({ pathLen: null, adjacentTarget: false, resistantNear: false, targetsNear: 0, chestsDetected: 0, enemiesNear: 0, alliesNeedingSupport: 0, inDanger: false, ...o });

// ---------- habilidades: identidade e limites ----------
test("cada BOMBER tem as habilidades da sua classe (1 passiva + 1 ativa) e a raridade mapeia para a classe certa", () => {
  assert.deepEqual(CLASS_BY_RARITY, { common: "lyra", uncommon: "kai", rare: "titan", epic: "vex", mythic: "kira", legendary: "jax", super: "orion", ancestral: "aeon" });
  const ids = new Set<string>();
  for (const cls of CLASSES) {
    const list = ABILITIES_BY_CLASS[cls];
    assert.equal(list.length, 2, cls);
    assert.deepEqual(list.map((d) => d.kind), ["passive", "active"], cls);
    for (const d of list) { assert.equal(d.cls, cls); assert.ok(d.id.startsWith(cls + "_")); assert.ok(d.name && d.desc); assert.ok(!ids.has(d.id)); ids.add(d.id); }
  }
  assert.equal(ids.size, 16);
  assert.equal(Object.keys(ABILITY_DEFS).length, 16);
});

test("toda habilidade respeita os limites de duracao, recarga e modificadores", () => {
  for (const d of Object.values(ABILITY_DEFS)) {
    assert.ok(d.durationMs <= LIMITS.abilityDurationMs, d.id);
    if (d.kind === "active") {
      assert.ok(d.cooldownMs >= LIMITS.abilityCooldownMinMs, d.id);
      assert.ok(d.cooldownMs > d.durationMs, `${d.id}: recarga deve ser maior que a duracao (sem sobreposicao)`);
      assert.ok(d.unlockLevel >= 1);
    }
    for (const [k, v] of Object.entries(d.mods)) {
      const lim = LIMITS[k as keyof typeof LIMITS] as readonly [number, number];
      assert.ok(v >= lim[0] && v <= lim[1], `${d.id}.${k}=${v}`);
    }
    if (d.aura) assert.ok(d.aura.dmg <= LIMITS.teamBonus && d.aura.speed <= LIMITS.teamBonus, d.id);
  }
});

test("modificadores ficam dentro dos limites mesmo com todas as ativas ligadas e bonus de equipe absurdo", () => {
  for (const r of RARITIES8) {
    const h = hero(r, { id: `x-${r}`, stamina: 10 });
    const rt = createRuntime(bomberClass(r));
    for (const d of ABILITIES_BY_CLASS[rt.cls]) if (d.kind === "active") rt.active[d.id] = d.durationMs || 1000;
    setTeamBuff(rt, 99, 99);
    const m = modifiersOf(rt, h);
    for (const [k, v] of Object.entries(m)) {
      assert.ok(Number.isFinite(v), `${r}.${k}`);
      const lim = LIMITS[k as keyof typeof LIMITS] as readonly [number, number];
      assert.ok(v >= lim[0] - 1e-9 && v <= lim[1] + 1e-9, `${r}.${k}=${v}`);
    }
    assert.ok(rt.team.dmg <= LIMITS.teamBonus && rt.team.speed <= LIMITS.teamBonus);
  }
});

test("bonus de sorte das habilidades respeita o teto em todas as classes", () => {
  for (const cls of CLASSES) {
    const rt = createRuntime(cls);
    for (const d of ABILITIES_BY_CLASS[cls]) if (d.kind === "active") rt.active[d.id] = 5000;
    const m = modifiersOf(rt, hero("common", { level: 30 }));
    assert.ok(m.luckBonus <= LIMITS.luckBonus[1] + 1e-9, cls);
  }
  // sem habilidades ativas, so o que e passivo
  assert.equal(modifiersOf(createRuntime("vex"), hero("epic")).luckBonus, 0.25);
  assert.equal(modifiersOf(createRuntime("lyra"), hero("common")).luckBonus, 0);
});

test("habilidades ativas so valem depois do nivel de desbloqueio", () => {
  const rt = createRuntime("orion"); rt.cd = {};
  const low = hero("super", { level: 7 }), ok = hero("super", { level: 8 });
  assert.equal(isReady(rt, ABILITY_DEFS.orion_ascension, low), false);
  assert.equal(isReady(rt, ABILITY_DEFS.orion_ascension, ok), true);
  assert.equal(abilityStatus(rt, ABILITY_DEFS.orion_ascension, 7).state, "locked");
  assert.equal(abilityStatus(rt, ABILITY_DEFS.orion_apex, 1).state, "passive");
  // passiva de Orion vale no nivel 1
  assert.equal(modifiersOf(rt, hero("super", { level: 1 })).dmgMult, 1.1);
});

test("recarga: nao reativa durante efeito/recarga, cobra stamina e volta a ficar pronta", () => {
  const rt = createRuntime("kira"), h = hero("mythic", { stamina: 5 });
  const def = ABILITY_DEFS.kira_dash;
  assert.equal(activate(rt, def, h), false, "comeca em recarga parcial (aquecimento)");
  assert.equal(rt.cd.kira_dash, Math.round(def.cooldownMs * BALANCE.warmupFraction));
  for (let i = 0; i < 40; i++) tickRuntime(rt, 100);
  assert.equal(activate(rt, def, h), true);
  assert.equal(h.stamina, 4.5);
  assert.ok(modifiersOf(rt, h).speedMult > 1.5);
  assert.equal(activate(rt, def, h), false, "sem acumulo enquanto ativa");
  for (let i = 0; i < 40; i++) tickRuntime(rt, 100); // 4 s: efeito (3 s) acabou, recarga (12 s) nao
  assert.equal(rt.active.kira_dash, undefined);
  assert.equal(activate(rt, def, h), false);
  for (let i = 0; i < 90; i++) tickRuntime(rt, 100); // total 13 s
  assert.equal(activate(rt, def, h), true);
});

test("o relogio das habilidades ignora frames gigantes, negativos e NaN", () => {
  const rt = createRuntime("jax"); rt.cd.jax_flurry = 15000;
  tickRuntime(rt, 1e9);
  assert.equal(rt.cd.jax_flurry, 15000 - BALANCE.maxDtMs);
  tickRuntime(rt, -5000); tickRuntime(rt, NaN);
  assert.equal(rt.cd.jax_flurry, 15000 - BALANCE.maxDtMs);
});

test("habilidade sem stamina suficiente nao ativa e nao deixa stamina negativa", () => {
  const rt = createRuntime("titan"); rt.cd = {};
  const h = hero("rare", { stamina: 1.5 });
  assert.equal(activate(rt, ABILITY_DEFS.titan_seismic, h), false);
  assert.equal(h.stamina, 1.5);
  h.stamina = 2; assert.equal(activate(rt, ABILITY_DEFS.titan_seismic, h), true);
  assert.equal(h.stamina, 0);
});

test("Impacto Sismico e consumido pela proxima bomba e a recarga continua", () => {
  const rt = createRuntime("titan"); rt.cd = {};
  const h = hero("rare", { stamina: 9 });
  assert.equal(activate(rt, ABILITY_DEFS.titan_seismic, h), true);
  const m = modifiersOf(rt, h);
  assert.equal(m.splashRadius, 1); assert.equal(m.blastRangeBonus, 1);
  assert.equal(consumeArmed(rt), "titan_seismic");
  assert.equal(modifiersOf(rt, h).splashRadius, 0);
  assert.equal(consumeArmed(rt), null);
  assert.ok((rt.cd.titan_seismic ?? 0) > 0);
});

test("trocar de mapa limpa efeitos temporarios mas nao as recargas", () => {
  const rt = createRuntime("orion"); rt.cd = {};
  activate(rt, ABILITY_DEFS.orion_ascension, hero("super", { stamina: 9 }));
  setTeamBuff(rt, 0.05, 0.05);
  clearTransient(rt);
  assert.deepEqual(rt.active, {}); assert.equal(rt.team.ms, 0);
  assert.ok((rt.cd.orion_ascension ?? 0) > 0);
});

test("condicoes de ativacao automatica", () => {
  const ready = (cls: BomberClass, r: BomberLike["rarity"], over: Partial<BomberLike> = {}) => { const rt = createRuntime(cls); rt.cd = {}; return { rt, h: hero(r, over) }; };
  let { rt, h } = ready("lyra", "common", { stamina: 10 });
  assert.equal(decideAbilities(rt, h, ctx()).length, 0, "Lyra cheia sem aliados cansados nao desperdica o reparo");
  assert.equal(decideAbilities(rt, h, ctx({ alliesNeedingSupport: 1 }))[0].id, "lyra_repair");
  h.stamina = 4; assert.equal(decideAbilities(rt, h, ctx())[0].id, "lyra_repair");
  ({ rt, h } = ready("kira", "mythic")); assert.equal(decideAbilities(rt, h, ctx({ pathLen: 2 })).length, 0);
  assert.equal(decideAbilities(rt, h, ctx({ pathLen: 6 }))[0].id, "kira_dash");
  ({ rt, h } = ready("jax", "legendary")); assert.equal(decideAbilities(rt, h, ctx()).length, 0);
  assert.equal(decideAbilities(rt, h, ctx({ adjacentTarget: true }))[0].id, "jax_flurry");
  ({ rt, h } = ready("titan", "rare")); assert.equal(decideAbilities(rt, h, ctx({ adjacentTarget: true })).length, 0);
  assert.equal(decideAbilities(rt, h, ctx({ adjacentTarget: true, targetsNear: 3 }))[0].id, "titan_seismic");
  ({ rt, h } = ready("vex", "epic")); assert.equal(decideAbilities(rt, h, ctx({ chestsDetected: 1 })).length, 0);
  assert.equal(decideAbilities(rt, h, ctx({ chestsDetected: 2 }))[0].id, "vex_deep_scan");
  ({ rt, h } = ready("orion", "super", { stamina: 3 })); assert.equal(decideAbilities(rt, h, ctx({ targetsNear: 5 })).length, 0, "Orion com pouca stamina nao ascende");
  h.stamina = 8; assert.equal(decideAbilities(rt, h, ctx({ enemiesNear: 1 }))[0].id, "orion_ascension");
});

test("Orion: aura de equipe pequena, sem somar fontes; Vex enxerga mais longe que os outros", () => {
  const rt = createRuntime("orion"); rt.cd = {};
  const o = hero("super", { stamina: 9 });
  assert.deepEqual(auraOf(rt, o), { range: 4, dmg: 0.03, speed: 0 });
  activate(rt, ABILITY_DEFS.orion_ascension, o);
  assert.deepEqual(auraOf(rt, o), { range: 5, dmg: 0.07, speed: 0.05 });
  const ally = createRuntime("lyra");
  setTeamBuff(ally, 0.07, 0.05); setTeamBuff(ally, 0.03, 0); // duas fontes: vale o maior
  assert.equal(ally.team.dmg, 0.07);
  assert.ok(modifiersOf(ally, hero("common")).dmgMult <= 1 + LIMITS.teamBonus);
  const vex = createRuntime("vex"), lyra = createRuntime("lyra");
  assert.equal(detectRadius(vex, hero("epic")), 6);
  assert.equal(detectRadius(lyra, hero("common")), BALANCE.sightRadius);
});

// ---------- Lyra: suporte sem stamina infinita ----------
test("Pulso de Reparo: limites por aliado, por pulso e sem passar do maximo", () => {
  const lyra = hero("common", { id: "L", stamina: 3, maxStamina: 10 });
  const mk = (id: string, st: number) => ({ data: hero("rare", { id, stamina: st, maxStamina: 10 }), rt: createRuntime("titan") });
  const allies = [mk("a", 1), mk("b", 5), mk("c", 5.9), mk("d", 2), mk("e", 9.5)];
  const r = repairPulse(lyra, allies);
  assert.equal(r.self, 2); assert.equal(lyra.stamina, 5);
  assert.equal(r.allies.length, 3, "no maximo 3 aliados");
  assert.deepEqual(r.allies.map((a) => a.id), ["a", "d", "b"], "os mais cansados primeiro; quem tem >60% nao recebe");
  allies.forEach((a) => assert.ok(a.data.stamina <= a.data.maxStamina));
  const again = repairPulse(lyra, allies); // mesmos aliados dentro do bloqueio de 30 s
  assert.equal(again.allies.filter((a) => ["a", "d", "b"].includes(a.id)).length, 0);
  const full = hero("common", { id: "F", stamina: 10 });
  assert.equal(repairPulse(full, []).self, 0, "cheia nao ganha nada");
});

test("simulacao de 1 hora: duas Lyras e um aliado nunca geram stamina ilimitada", () => {
  const l1 = hero("common", { id: "L1", stamina: 0 }), l2 = hero("common", { id: "L2", stamina: 0 });
  const ally = hero("rare", { id: "A", stamina: 0 });
  const r1 = createRuntime("lyra"), r2 = createRuntime("lyra"), ra = createRuntime("titan");
  r1.cd = {}; r2.cd = {};
  let gainedAlly = 0, gainedSelf = 0;
  for (let t = 0; t < 3600 * 10; t++) { // passos de 100 ms
    [r1, r2, ra].forEach((r) => tickRuntime(r, 100));
    for (const [h, rt, other, otherRt] of [[l1, r1, l2, r2], [l2, r2, l1, r1]] as const) {
      for (const d of decideAbilities(rt, h, ctx({ alliesNeedingSupport: 1 }))) {
        if (!activate(rt, d, h)) continue;
        const before = ally.stamina + other.stamina + h.stamina;
        const res = repairPulse(h, [{ data: ally, rt: ra }, { data: other, rt: otherRt }]);
        gainedSelf += res.self; gainedAlly += res.allies.filter((a) => a.id === "A").reduce((s, a) => s + a.amount, 0);
        assert.ok(ally.stamina + other.stamina + h.stamina >= before);
      }
    }
    // o aliado gasta tudo o que recebe (pior caso para "ciclos")
    if (ally.stamina > 0 && t % 50 === 0) ally.stamina = 0;
    for (const h of [l1, l2, ally]) assert.ok(h.stamina >= 0 && h.stamina <= h.maxStamina);
  }
  assert.ok(gainedAlly <= Math.ceil(3600 / 30) * BALANCE.repair.allyAmount + 1e-6, `aliado recebeu ${gainedAlly}`);
  assert.ok(gainedSelf <= 2 * Math.ceil(3600 / 22) * 0.2 * 10 + 1e-6);
});

// ---------- stamina, critico, combo, dano ----------
test("stamina nunca passa do maximo nem fica negativa", () => {
  const h = { stamina: 9.5, maxStamina: 10 };
  assert.equal(gainStamina(h, 5), 0.5); assert.equal(h.stamina, 10);
  assert.equal(gainStamina(h, -3), 0); assert.equal(gainStamina(h, NaN), 0); assert.equal(gainStamina(h, Infinity), 0);
  assert.equal(h.stamina, 10);
  assert.equal(spendStamina(h, 3), true); assert.equal(h.stamina, 7);
  assert.equal(spendStamina(h, 7.5), false); assert.equal(h.stamina, 7);
  assert.equal(spendStamina(h, 7), true); assert.equal(h.stamina, 0);
  assert.equal(spendStamina(h, 0.0001), false); assert.ok(h.stamina >= 0);
  const bad = { stamina: NaN, maxStamina: 10 }; gainStamina(bad, 1); assert.ok(Number.isFinite(bad.stamina));
});

test("o critico respeita a probabilidade maxima, com semente fixa", () => {
  const rng = createRng(12345);
  let n = 0; const N = 40000;
  for (let i = 0; i < N; i++) if (rollCrit(5, rng)) n++; // chance absurda e limitada a 35%
  assert.ok(n / N <= LIMITS.critChance[1] + 0.01, `taxa ${n / N}`);
  assert.ok(n / N >= LIMITS.critChance[1] - 0.01);
  let z = 0; for (let i = 0; i < 1000; i++) if (rollCrit(0, rng) || rollCrit(-1, rng) || rollCrit(NaN, rng)) z++;
  assert.equal(z, 0);
  const jax = modifiersOf((() => { const r = createRuntime("jax"); r.active.jax_flurry = 1000; return r; })(), hero("legendary"));
  assert.ok(Math.abs(jax.critChance - 0.18) < 1e-9);
});

test("mesma semente = mesma sequencia (determinismo)", () => {
  const a = createRng(7), b = createRng(7);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
});

test("Jax nao causa dano repetido no mesmo frame: intervalo minimo entre golpes", () => {
  const c = newCombo();
  let ok = 0;
  for (let i = 0; i < 1000; i++) if (registerHit(c, 5000).ok) ok++;
  assert.equal(ok, 1);
  const c2 = newCombo(); ok = 0;
  for (let t = 0; t < 10000; t++) if (registerHit(c2, t).ok) ok++; // tentativa a cada 1 ms durante 10 s
  assert.ok(ok <= Math.floor(10000 / BALANCE.meleeMinIntervalMs) + 1, `golpes: ${ok}`);
});

test("combo: o 3o golpe seguido e o finalizador; passar da janela reinicia", () => {
  const c = newCombo();
  assert.deepEqual([registerHit(c, 1000).finisher, registerHit(c, 1300).finisher, registerHit(c, 1600).finisher, registerHit(c, 1900).finisher], [false, false, true, false]);
  const d = newCombo(); registerHit(d, 0); registerHit(d, 300);
  assert.equal(registerHit(d, 300 + BALANCE.combo.windowMs + 1).finisher, false, "janela estourou: recomeca");
});

test("dano corpo a corpo: sem modificadores equivale ao da 1.7.1; crit e finalizador multiplicam", () => {
  for (const b of [1, 8, 9, 14, 20, 33, 100]) assert.equal(meleeDamage(b, NEUTRAL_MODS, false, false), Math.max(1, Math.round(b * 0.4)));
  const m = { ...NEUTRAL_MODS, critMult: 1.75 };
  assert.equal(meleeDamage(20, m, true, false), Math.round(20 * 0.4 * 1.75));
  assert.equal(meleeDamage(20, m, false, true), Math.round(20 * 0.4 * 1.5));
  assert.equal(meleeDamage(NaN, NEUTRAL_MODS, false, false), 1);
});

test("alcance e dano de bomba: baseline da 1.7.1 e bonus do Titan", () => {
  for (const p of [1, 2, 3, 4, 5]) assert.equal(bombRange(p, NEUTRAL_MODS), Math.min(4, 1 + Math.ceil(p / 2)));
  assert.equal(bombRange(5, { ...NEUTRAL_MODS, blastRangeBonus: 1 }), 5);
  assert.equal(bombRange(5, { ...NEUTRAL_MODS, blastRangeBonus: 99 }), 5, "teto");
  const rt = createRuntime("titan"); const m = modifiersOf(rt, hero("rare"));
  const s = bombSnapshot(20, 5, m);
  assert.equal(bombDamageVs(s, "chest", true), 25);
  assert.equal(bombDamageVs(s, "block", true), 26);
  assert.equal(bombDamageVs(s, "block", false), 20);
  assert.equal(bombDamageVs(s, "enemy", false), 20);
  const lyra = bombSnapshot(20, 1, modifiersOf(createRuntime("lyra"), hero("common")));
  assert.equal(bombDamageVs(lyra, "chest", true), 20);
});

// ---------- geometria da explosao ----------
const oldBlast = (grid: number[][], gx: number, gy: number, range: number) => {
  const out: [number, number][] = [[gx, gy]];
  for (const [dx, dy] of DIRS4) for (let i = 1; i <= range; i++) {
    const x = gx + dx * i, y = gy + dy * i;
    if (x < 0 || y < 0 || x >= grid[0].length || y >= grid.length || grid[y][x] === 1) break;
    out.push([x, y]);
    if (grid[y][x] === 2) break;
  }
  return out;
};
const randGrid = (seed: number, w = 29, h = 17) => { const r = createRng(seed); return Array.from({ length: h }, () => Array.from({ length: w }, () => { const v = r(); return v < 0.2 ? 1 : v < 0.55 ? 2 : 0; })); };

test("explosao normal e identica a da 1.7.1 (cruz, para na casinha, inclui o 1o bloco)", () => {
  for (let s = 1; s <= 25; s++) {
    const g = randGrid(s);
    for (let i = 0; i < 20; i++) {
      const x = (i * 7 + s) % 29, y = (i * 3 + s) % 17;
      if (g[y][x] !== 0) continue;
      for (const range of [1, 2, 3, 4]) assert.deepEqual(blastCells(g, x, y, range, 0), oldBlast(g, x, y, range));
    }
  }
});

test("explosao em area do Titan respeita casinhas, bordas e quinas fechadas", () => {
  const g = randGrid(99);
  for (let y = 0; y < 17; y++) for (let x = 0; x < 29; x++) {
    if (g[y][x] !== 0) continue;
    const cells = blastCells(g, x, y, 5, 1);
    const keys = new Set(cells.map(([a, b]) => `${a},${b}`));
    assert.equal(keys.size, cells.length, "sem duplicatas");
    for (const [cx, cy] of cells) {
      assert.ok(cx >= 0 && cy >= 0 && cx < 29 && cy < 17);
      assert.notEqual(g[cy][cx], 1, "nunca atinge casinha");
      if (Math.abs(cx - x) === 1 && Math.abs(cy - y) === 1) assert.ok(g[y][cx] === 0 || g[cy][x] === 0, "diagonal precisa de passagem");
    }
    for (const c of oldBlast(g, x, y, 5)) assert.ok(keys.has(`${c[0]},${c[1]}`), "a cruz continua inclusa");
  }
  const closed = [[0, 0, 0], [0, 0, 2], [0, 2, 1]]; // (1,1) com direita e baixo bloqueados
  assert.ok(!blastCells(closed, 1, 1, 1, 1).some(([x, y]) => x === 2 && y === 2), "diagonal (2,2) e casinha");
  const pocket = [[0, 1, 0], [2, 0, 2], [0, 2, 0]];
  assert.ok(!blastCells(pocket, 1, 1, 1, 1).some(([x, y]) => x === 0 && y === 0), "quina fechada por bloco/casinha: nao passa");
});

// ---------- IA ----------
const openGrid = (w = 9, h = 7) => Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
const view = (grid: number[][], over: Partial<WorldView> = {}): WorldView => ({ grid, chests: [], enemies: [], blocks: [], bombCells: new Set(), danger: new Set(), dropChance: 0.3, ...over });
const fieldFor = (grid: number[][], sx: number, sy: number, bombs = new Set<string>()) => bfsField(grid[0].length, grid.length, sx, sy, (x, y) => grid[y][x] === 0 && !bombs.has(`${x},${y}`));
const OPTS = { detectRadius: 4, dmgChest: 10, dmgEnemy: 10, dmgBlock: 10, dmgBlockResistant: 13, resistantHp: 20, rewardScale: 100 };

test("BFS: distancias, caminho valido e celulas inalcancaveis", () => {
  const g = openGrid(); g[3][4] = 1; g[2][4] = 1; g[4][4] = 1;
  const f = fieldFor(g, 0, 3);
  assert.equal(distAt(f, 0, 3), 0); assert.equal(distAt(f, 3, 3), 3); assert.equal(distAt(f, 4, 3), -1);
  const p = pathTo(f, 8, 3)!;
  assert.equal(p.length, distAt(f, 8, 3));
  let [cx, cy] = [0, 3];
  for (const [x, y] of p) { assert.equal(Math.abs(x - cx) + Math.abs(y - cy), 1); assert.equal(g[y][x], 0); [cx, cy] = [x, y]; }
  assert.deepEqual([cx, cy], [8, 3]);
  const walled = openGrid(5, 5); for (let y = 0; y < 5; y++) walled[y][2] = 1;
  assert.equal(pathTo(fieldFor(walled, 0, 0), 4, 4), null);
});

test("candidatos: alvos em zona de bomba ou sem posicao de ataque alcancavel ficam de fora; alvo destruido some", () => {
  const g = openGrid(); g[3][3] = 2;
  const v = view(g, { chests: [{ x: 6, y: 3, hp: 10, maxHp: 10, base: 4, label: "baú Épico" }], blocks: [{ x: 3, y: 3, hp: 10, maxHp: 10 }] });
  const f = fieldFor(g, 0, 0);
  assert.deepEqual(buildCandidates(v, f, OPTS).map((c) => c.id).sort(), ["b:3,3", "c:6,3"]);
  v.danger.add("6,3");
  assert.deepEqual(buildCandidates(v, f, OPTS).map((c) => c.id), ["b:3,3"], "bau na zona de bomba nao e atacado");
  v.danger.clear(); v.chests.length = 0;
  assert.deepEqual(buildCandidates(v, f, OPTS).map((c) => c.id), ["b:3,3"], "bau destruido deixa de ser candidato");
  const sealed = openGrid(5, 5); for (let y = 0; y < 5; y++) sealed[y][2] = 1;
  assert.equal(buildCandidates(view(sealed, { chests: [{ x: 4, y: 2, hp: 5, maxHp: 5, base: 1, label: "" }] }), fieldFor(sealed, 0, 0), OPTS).length, 0);
});

test("a categoria domina (bau > inimigo > bloco), como na 1.7.1, em qualquer classe", () => {
  const g = openGrid(); g[0][8] = 2;
  const v = view(g, { chests: [{ x: 8, y: 6, hp: 10, maxHp: 10, base: 1, label: "" }], blocks: [{ x: 8, y: 0, hp: 10, maxHp: 10 }], enemies: [{ id: "1", x: 2, y: 1, hp: 10, maxHp: 10, reward: 600, mvp: false }] });
  const cands = buildCandidates(v, fieldFor(g, 0, 0), OPTS);
  for (const cls of CLASSES) {
    const st = newAIState();
    // o Kai e o unico cacador: inimigo PROXIMO (<= 6 passos) vence o bau; as demais classes seguem baus > inimigos
    assert.equal(chooseTarget(st, cands, 0, cls, 1)!.kind, cls === "kai" ? "enemy" : "chest", cls);
    assert.equal(chooseTarget(newAIState(), cands.filter((c) => c.kind !== "chest"), 0, cls, 1)!.kind, "enemy", cls);
  }
});

test("especializacao: Titan busca bloco resistente, Vex o bau valioso, Kira o caminho curto", () => {
  const g = openGrid(15, 9);
  const blocks = [{ x: 3, y: 4, hp: 10, maxHp: 10 }, { x: 5, y: 4, hp: 60, maxHp: 60 }]; for (const b of blocks) g[b.y][b.x] = 2;
  const cb = buildCandidates(view(g, { blocks }), fieldFor(g, 0, 4), OPTS);
  assert.equal(chooseTarget(newAIState(), cb, 0, "titan", 1)!.id, "b:5,4", "Titan prefere o resistente");
  assert.equal(chooseTarget(newAIState(), cb, 0, "kira", 1)!.id, "b:3,4", "Kira prefere o mais perto");
  const chests = [{ x: 2, y: 4, hp: 10, maxHp: 10, base: 1, label: "comum" }, { x: 7, y: 4, hp: 10, maxHp: 10, base: 16, label: "lendário" }];
  const cc = buildCandidates(view(g, { chests }), fieldFor(g, 0, 4), { ...OPTS, detectRadius: 8 });
  assert.equal(chooseTarget(newAIState(), cc, 0, "vex", 1)!.id, "c:7,4", "Vex vai ao bau que vale mais");
  assert.equal(chooseTarget(newAIState(), cc, 0, "kira", 1)!.id, "c:2,4", "Kira vai ao mais perto");
  // sem detectar, o valor e desconhecido (media) e a distancia decide
  const blind = buildCandidates(view(g, { chests }), fieldFor(g, 0, 4), { ...OPTS, detectRadius: 3 });
  assert.equal(blind.find((c) => c.id === "c:7,4")!.value, BALANCE.avgChestBase);
});

test("Jax escolhe a posicao de ataque com mais alvos adjacentes", () => {
  const g = openGrid(); g[2][4] = 2; g[4][4] = 2; g[3][3] = 2; // (4,3) fica adjacente a 3 blocos; (3,2) e (3,4) tambem
  const blocks = [{ x: 4, y: 2, hp: 10, maxHp: 10 }, { x: 4, y: 4, hp: 10, maxHp: 10 }, { x: 3, y: 3, hp: 10, maxHp: 10 }];
  const c = buildCandidates(view(g, { blocks }), fieldFor(g, 4, 3), OPTS);
  assert.ok(c.every((t) => t.dist === 0 && t.adjTargets >= 3));
});

test("sem oscilacao: duas opcoes equivalentes nao fazem o operador trocar de alvo a cada decisao", () => {
  const mkC = (id: string, dist: number): CellTarget => ({ id, kind: "chest", tx: 0, ty: 0, sx: 0, sy: 0, dist, hp: 10, maxHp: 10, value: 4, hits: 1, resistant: true, mvp: false, adjTargets: 0, label: "" });
  const st = newAIState(); const ids: string[] = [];
  for (let t = 0; t < 60; t++) {
    // quem esta mais perto alterna a cada decisao (+-1), exatamente o caso que gera ping-pong
    const a = mkC("A", t % 2 ? 5 : 6), b = mkC("B", t % 2 ? 6 : 5);
    ids.push(chooseTarget(st, [a, b], t * 300, "lyra", 1)!.id);
  }
  const switches = ids.filter((id, i) => i && id !== ids[i - 1]).length;
  assert.equal(switches, 0, ids.join(""));
});

test("categoria superior interrompe o alvo atual; alvo destruido e substituido", () => {
  const mk = (id: string, kind: CellTarget["kind"]): CellTarget => ({ id, kind, tx: 0, ty: 0, sx: 0, sy: 0, dist: 3, hp: 10, maxHp: 10, value: 2, hits: 1, resistant: false, mvp: false, adjTargets: 0, label: "" });
  const st = newAIState(); const block = mk("b:1", "block"), chest = mk("c:1", "chest");
  assert.equal(chooseTarget(st, [block], 0, "kira", 1)!.id, "b:1");
  assert.equal(chooseTarget(st, [block, chest], 10, "kira", 1)!.id, "c:1");
  assert.equal(chooseTarget(st, [block], 20, "kira", 1)!.id, "b:1", "bau sumiu (destruido): volta ao bloco, sem alvo fantasma");
  assert.equal(chooseTarget(st, [], 30, "kira", 1), null);
  assert.equal(st.lockId, null);
});

test("alvo inalcancavel vai para a lista negra e nao e perseguido para sempre", () => {
  const mk = (id: string, dist: number): CellTarget => ({ id, kind: "chest", tx: 0, ty: 0, sx: 0, sy: 0, dist, hp: 10, maxHp: 10, value: 4, hits: 1, resistant: true, mvp: false, adjTargets: 0, label: "" });
  const st = newAIState(); let now = 0, abandoned = -1;
  for (let i = 0; i < 40; i++) {
    now += 300;
    const c = chooseTarget(st, [mk("far", 9), mk("other", 12)], now, "kira", 1);
    if (!c) { assert.ok(st.black.has("far") && st.black.has("other"), "so fica sem alvo quando todos estao na lista negra"); continue; }
    if (reportProgress(st, c, now) === "abandon" && abandoned < 0) { abandoned = i; assert.equal(c.id, "far"); assert.ok(st.black.has("far"), "entra na lista negra ao ser abandonado"); }
  }
  assert.ok(abandoned >= 0 && abandoned <= AI_TUNING.noProgressLimit + 1, `abandonou em ${abandoned}`);
  now += AI_TUNING.blacklistMs * 3; // a lista negra expira
  assert.equal(chooseTarget(st, [mk("far", 9)], now, "kira", 1)!.id, "far");
  blacklist(st, "far", now); assert.equal(chooseTarget(st, [mk("far", 9)], now, "kira", 1), null);
});

test("deteccao de operador preso: oscilar entre 2 celulas dispara; andar por celulas novas ou agir nao", () => {
  const st = newAIState(); let stuck = false;
  for (let i = 0; i < 16; i++) stuck = recordMove(st, i % 2, 0, 29);
  assert.equal(stuck, true);
  const st2 = newAIState(); stuck = false;
  for (let i = 0; i < 40; i++) stuck = stuck || recordMove(st2, i % 29, Math.floor(i / 29), 29);
  assert.equal(stuck, false);
  const st3 = newAIState(); for (let i = 0; i < 10; i++) recordMove(st3, 0, 0, 29);
  recordAction(st3); assert.equal(st3.trail.length, 0);
});

test("seguranca da bomba: beco sem saida e detectado; espaco aberto nao", () => {
  const g = openGrid(7, 3);
  const pass = (x: number, y: number) => g[y][x] === 0;
  const cells = blastCells(g, 0, 1, 4, 0); const unsafe = new Set(cells.map(([x, y]) => `${x},${y}`));
  assert.equal(hasEscape(7, 3, 0, 1, pass, (x, y) => unsafe.has(`${x},${y}`), 1), false, "com 1 passo ainda esta na linha de fogo");
  assert.equal(hasEscape(7, 3, 0, 1, pass, (x, y) => unsafe.has(`${x},${y}`), 2), true, "com 2 passos (1,0) esta fora do fogo");
  const corridor = openGrid(6, 1);
  const c2 = new Set(blastCells(corridor, 0, 0, 2, 0).map(([x, y]) => `${x},${y}`));
  assert.equal(hasEscape(6, 1, 0, 0, (x, y) => corridor[y][x] === 0, (x, y) => c2.has(`${x},${y}`), 1), false);
  assert.equal(hasEscape(6, 1, 0, 0, (x, y) => corridor[y][x] === 0, (x, y) => c2.has(`${x},${y}`), 3), true);
});

test("score de classe e finito e a categoria preserva a ordem", () => {
  const base: CellTarget = { id: "x", kind: "chest", tx: 0, ty: 0, sx: 0, sy: 0, dist: 40, hp: 320, maxHp: 320, value: 40, hits: 99, resistant: true, mvp: true, adjTargets: 4, label: "" };
  for (const cls of CLASSES) for (const kind of ["chest", "enemy", "block"] as const) assert.ok(Number.isFinite(scoreCandidate(cls, { ...base, kind }, 0.5)));
  for (const cls of CLASSES) {
    const enemyNear = scoreCandidate(cls, { ...base, kind: "enemy", dist: 0, value: 80, hits: 1 }, 1);
    const enemyFar = scoreCandidate(cls, { ...base, kind: "enemy", dist: 7, value: 80, hits: 1 }, 1);
    assert.ok(scoreCandidate(cls, { ...base, kind: "chest" }, 1) > enemyFar, `${cls}: inimigo alem do alcance nunca vence o bau`);
    if (cls !== "kai") assert.ok(scoreCandidate(cls, { ...base, kind: "chest" }, 1) > enemyNear, cls);
  }
});

// ---------- 15 operadores simulados (logica pura: IA + habilidades + combate, sem Phaser) ----------
test("simulacao headless: 15 operadores por 600 decisoes mantem invariantes e terminam rapido", () => {
  resetRegistry();
  const W = 29, H = 17, rng = createRng(2026);
  const grid: number[][] = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x % 2 === 1 && y % 2 === 1 ? 1 : 0)));
  const blockHp = new Map<string, { hp: number; maxHp: number }>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] === 0 && Math.min(x, W - 1 - x) + Math.min(y, H - 1 - y) > 2 && rng() < 0.45) { grid[y][x] = 2; blockHp.set(`${x},${y}`, { hp: 12, maxHp: 12 }); }
  const chests = new Map<string, { hp: number; maxHp: number; base: number }>();
  const rarities = RARITIES8;
  const ops = Array.from({ length: 15 }, (_, i) => {
    const r = rarities[i % 8];
    const data = { id: `op${i}`, rarity: r, level: 1 + ((i * 7) % 30), stamina: 12, maxStamina: 12, power: 1 + (i % 5), melee: r === "legendary" };
    const pos = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1], [14, 0], [14, H - 1]][i % 6];
    return { data, x: pos[0], y: pos[1], ai: newAIState(), combo: newCombo(), rt: runtimeOf(data), sleep: false, rewards: 0, attacks: 0 };
  });
  const brokenBy = new Map<string, number>(); let rewardsGiven = 0;
  const t0 = performance.now();
  let blocksStart = blockHp.size;
  for (let tick = 0; tick < 600; tick++) {
    const now = tick * 350;
    const bombs: { x: number; y: number; at: number; dmg: number; owner: number; cells: [number, number][] }[] = (globalThis as any).__b ??= [];
    // explode bombas vencidas
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i]; if (b.at > now) continue;
      for (const [x, y] of b.cells) {
        const k = `${x},${y}`, c = chests.get(k);
        if (c) { c.hp -= b.dmg; if (c.hp <= 0) { chests.delete(k); rewardsGiven++; } }
        const bh = blockHp.get(k);
        if (bh && grid[y][x] === 2) { bh.hp -= b.dmg; if (bh.hp <= 0) { grid[y][x] = 0; blockHp.delete(k); brokenBy.set(k, (brokenBy.get(k) ?? 0) + 1); if (rng() < 0.3) chests.set(k, { hp: 20, maxHp: 20, base: 1 + Math.floor(rng() * 8) }); } }
      }
      bombs.splice(i, 1);
    }
    const bombCells = new Set(bombs.map((b) => `${b.x},${b.y}`));
    const danger = new Set<string>(); bombs.forEach((b) => b.cells.forEach(([x, y]) => danger.add(`${x},${y}`)));
    const v: WorldView = {
      grid, bombCells, danger, dropChance: 0.3,
      chests: [...chests].map(([k, c]) => { const [x, y] = k.split(",").map(Number); return { x, y, hp: c.hp, maxHp: c.maxHp, base: c.base, label: "baú" }; }),
      enemies: [], blocks: [...blockHp].map(([k, b]) => { const [x, y] = k.split(",").map(Number); return { x, y, hp: b.hp, maxHp: b.maxHp }; }),
    };
    ops.forEach((o, idx) => {
      const d = o.data;
      tickRuntime(o.rt, 350);
      const mods = modifiersOf(o.rt, d);
      for (const [k, val] of Object.entries(mods)) assert.ok(Number.isFinite(val), k);
      assert.ok(d.stamina >= 0 && d.stamina <= d.maxStamina + 1e-9, `stamina ${d.stamina}`);
      if (o.sleep) { gainStamina(d, 0.3 * mods.regenMult); if (d.stamina >= d.maxStamina / 2) o.sleep = false; return; }
      if (danger.has(`${o.x},${o.y}`)) {
        const f = fieldFor(grid, o.x, o.y, bombCells);
        for (const [dx, dy] of DIRS4) { const nx = o.x + dx, ny = o.y + dy; if (grid[ny]?.[nx] === 0 && !bombCells.has(`${nx},${ny}`) && distAt(f, nx, ny) === 1 && !danger.has(`${nx},${ny}`)) { o.x = nx; o.y = ny; break; } }
        return;
      }
      if (d.stamina < 1) { o.sleep = true; return; }
      const f = bfsField(W, H, o.x, o.y, (x, y) => grid[y][x] === 0 && !bombCells.has(`${x},${y}`) && !danger.has(`${x},${y}`));
      const cls = bomberClass(d.rarity);
      const cands = buildCandidates(v, f, { ...OPTS, detectRadius: 4 });
      const pick = chooseTarget(o.ai, cands, now, cls, d.stamina / d.maxStamina);
      if (!pick) return;
      if (reportProgress(o.ai, pick, now) === "abandon") return;
      for (const ab of decideAbilities(o.rt, d, ctx({ pathLen: pick.dist, adjacentTarget: pick.dist === 0, targetsNear: cands.filter((c) => c.dist <= 2).length, resistantNear: pick.resistant, chestsDetected: cands.filter((c) => c.kind === "chest").length, alliesNeedingSupport: 1 }))) {
        if (activate(o.rt, ab, d) && ab.id === "lyra_repair") repairPulse(d, ops.filter((p) => p !== o).map((p) => ({ data: p.data, rt: p.rt })));
      }
      if (pick.dist > 0) {
        const path = pathTo(f, pick.sx, pick.sy)!;
        assert.ok(path.length > 0 && grid[path[0][1]][path[0][0]] === 0);
        o.x = path[0][0]; o.y = path[0][1];
        recordMove(o.ai, o.x, o.y, W);
        return;
      }
      recordAction(o.ai);
      if (d.melee) {
        if (!registerHit(o.combo, now).ok || !spendStamina(d, 0.3)) return;
        const crit = rollCrit(mods.critChance, rng), dmg = meleeDamage(12, mods, crit, false);
        const k = `${pick.tx},${pick.ty}`;
        const c = chests.get(k), bh = blockHp.get(k);
        if (c) { c.hp -= dmg; if (c.hp <= 0) { chests.delete(k); rewardsGiven++; } }
        else if (bh) { bh.hp -= dmg; if (bh.hp <= 0) { grid[pick.ty][pick.tx] = 0; blockHp.delete(k); } }
        o.attacks++;
      } else {
        if (bombCells.has(`${o.x},${o.y}`) || !spendStamina(d, 1 * mods.staminaCostMult)) return;
        const snap = bombSnapshot(12, d.power, mods); consumeArmed(o.rt);
        const cells = blastCells(grid, o.x, o.y, snap.range, snap.splash);
        bombs.push({ x: o.x, y: o.y, at: now + 1400, dmg: snap.dmg, owner: idx, cells });
        bombCells.add(`${o.x},${o.y}`); cells.forEach(([x, y]) => danger.add(`${x},${y}`));
        o.attacks++;
      }
    });
  }
  const ms = performance.now() - t0;
  delete (globalThis as any).__b;
  assert.ok(ms < 4000, `600 decisoes x 15 operadores levaram ${ms.toFixed(0)} ms`);
  assert.ok(blockHp.size < blocksStart, "os operadores avancam no mapa");
  assert.ok(ops.every((o) => o.attacks > 0), "todos os 15 agiram: " + ops.map((o) => o.attacks).join(","));
  assert.ok(ops.every((o) => o.data.stamina >= 0 && o.data.stamina <= o.data.maxStamina));
  assert.equal(chests.size >= 0, true);
  // cada bau so paga uma vez: recompensas ao destruir <= baus criados
  assert.ok(rewardsGiven <= [...brokenBy.values()].reduce((s, n) => s + n, 0) + 0, "sem recompensa duplicada");
});

// ---------- Kai (Incomum) e Aeon (Ancestral) ----------
test("Kai: cacador de inimigos. Inimigo proximo vence o bau; alem de 6 passos o bau volta a ser a prioridade", () => {
  const mk = (id: string, kind: CellTarget["kind"], dist: number): CellTarget => ({ id, kind, tx: 0, ty: 0, sx: 0, sy: 0, dist, hp: 10, maxHp: 10, value: 4, hits: 1, resistant: kind === "chest", mvp: false, adjTargets: 0, label: "" });
  assert.equal(chooseTarget(newAIState(), [mk("c", "chest", 2), mk("e", "enemy", 6)], 0, "kai", 1)!.id, "e");
  assert.equal(chooseTarget(newAIState(), [mk("c", "chest", 2), mk("e", "enemy", 7)], 0, "kai", 1)!.id, "c");
  assert.equal(chooseTarget(newAIState(), [mk("c", "chest", 2), mk("e", "enemy", 1)], 0, "kira", 1)!.id, "c", "outras classes nao mudam");
  const rt = createRuntime("kai"), h = hero("uncommon", { id: "kai1" });
  const passive = bombSnapshot(20, 2, modifiersOf(rt, h));
  assert.equal(bombDamageVs(passive, "enemy", false), 25);
  assert.equal(bombDamageVs(passive, "chest", true), 20, "so inimigos");
  rt.cd = {}; assert.equal(activate(rt, ABILITY_DEFS.kai_hunt, h), true);
  const hunt = modifiersOf(rt, h);
  assert.ok(Math.abs(hunt.enemyDmgMult - 1.25 * 1.35) < 1e-9 && hunt.enemyDmgMult <= LIMITS.enemyDmgMult[1]);
  assert.equal(decideAbilities(createRuntime("kai"), hero("uncommon"), ctx({ enemiesNear: 1 })).length, 0, "comeca em recarga parcial");
  const r2 = createRuntime("kai"); r2.cd = {};
  assert.equal(decideAbilities(r2, hero("uncommon"), ctx()).length, 0, "sem inimigo por perto nao gasta");
  assert.equal(decideAbilities(r2, hero("uncommon"), ctx({ enemiesNear: 1 }))[0].id, "kai_hunt");
});

test("Aeon: Reescrita so no nivel 10, bonus dentro dos limites e alcance da bomba no teto", () => {
  const rt = createRuntime("aeon"); rt.cd = {};
  const low = hero("ancestral", { id: "a1", level: 9, stamina: 20, maxStamina: 24 }), ok = { ...low, level: 10 };
  assert.equal(isReady(rt, ABILITY_DEFS.aeon_rewrite, low), false);
  assert.equal(isReady(rt, ABILITY_DEFS.aeon_rewrite, ok), true);
  const base = { ...modifiersOf(rt, ok) };
  assert.ok(Math.abs(base.dmgMult - 1.12) < 1e-9 && base.luckBonus === 0.2);
  activate(rt, ABILITY_DEFS.aeon_rewrite, ok);
  const m = modifiersOf(rt, ok);
  assert.ok(m.dmgMult > 1.39 && m.dmgMult <= LIMITS.dmgMult[1]);
  assert.ok(m.luckBonus <= LIMITS.luckBonus[1] && Math.abs(m.luckBonus - 0.4) < 1e-9);
  assert.equal(bombRange(5, m), 5, "alcance 4 + 1 = 5, o teto");
  assert.equal(ok.stamina, 17, "custa 3 de stamina");
  assert.deepEqual(auraOf(rt, ok), { range: 6, dmg: 0.06, speed: 0.05 });
  assert.equal(detectRadius(rt, ok), 8);
  assert.equal(detectRadius(createRuntime("aeon"), ok), 7, "Intel: enxerga mais longe que todos os outros, menos a varredura do Vex");
});

test("Sincronia do Aeon: encurta so recargas correndo, nunca abaixo de zero, uma vez por aliado a cada 45 s", () => {
  const def = ABILITY_DEFS.aeon_rewrite;
  const mkAlly = (id: string, rarity: BomberLike["rarity"], cdLeft: number) => { const rt = createRuntime(bomberClass(rarity)); for (const d of ABILITIES_BY_CLASS[rt.cls]) if (d.kind === "active") rt.cd[d.id] = cdLeft; return { data: hero(rarity, { id }), rt }; };
  const a = mkAlly("a", "legendary", 10000), b = mkAlly("b", "rare", 0), c = mkAlly("c", "mythic", 500);
  const got = syncCooldowns(def, [a, b, c]);
  assert.deepEqual(got, ["a", "c"], "quem esta com a habilidade pronta nao e beneficiado nem travado");
  assert.equal(a.rt.cd.jax_flurry, 10000 - 15000 * 0.15);
  assert.equal(c.rt.cd.kira_dash, 0, "limitado ao que resta");
  assert.equal(b.rt.syncLockMs, 0);
  assert.deepEqual(syncCooldowns(def, [a, c]), [], "bloqueio de 45 s: dois Aeons nao somam");
  tickRuntime(a.rt, 250);
  for (let i = 0; i < 200; i++) tickRuntime(a.rt, 250); // 50 s
  assert.equal(a.rt.syncLockMs, 0);
  assert.equal(syncCooldowns(def, [a]).length, 0, "recarga ja acabou: nada a encurtar");
  // 1 h simulada: a recarga de um aliado nunca fica negativa e o ganho por hora tem teto
  const al = mkAlly("z", "legendary", 15000); let shaved = 0;
  for (let t = 0; t < 14400; t++) {
    const before = al.rt.cd.jax_flurry ?? 0;
    tickRuntime(al.rt, 250);
    if (t % 240 === 0) { al.rt.cd.jax_flurry = 15000; } // o aliado usa a habilidade e recarrega
    const b4 = al.rt.cd.jax_flurry!; syncCooldowns(def, [al]); shaved += b4 - al.rt.cd.jax_flurry!;
    assert.ok(al.rt.cd.jax_flurry! >= 0 && before >= 0);
  }
  assert.ok(shaved <= Math.ceil(3600 / 45) * 15000 * 0.15 + 1e-6, `encurtado ${shaved}`);
});
