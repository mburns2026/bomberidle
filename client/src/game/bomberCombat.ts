// Combate dos BOMBERS: stamina segura, critico, combo corpo a corpo, dano por tipo de alvo e geometria da explosao.
// Modulo puro (sem Phaser, sem relogio proprio): o tempo entra por parametro, entao tudo e testavel.
import { BALANCE, LIMITS } from "./bomberConfig";
import type { Modifiers } from "./bomberTypes";

export interface StaminaLike { stamina: number; maxStamina: number }
const fin = (v: number, def: number) => (Number.isFinite(v) ? v : def);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, fin(v, lo)));

/** Soma stamina sem passar do maximo. Devolve quanto entrou de verdade. */
export function gainStamina(h: StaminaLike, amount: number): number {
  const before = clamp(h.stamina, 0, h.maxStamina);
  h.stamina = clamp(before + Math.max(0, fin(amount, 0)), 0, h.maxStamina);
  return h.stamina - before;
}

/** Gasta stamina. Nunca deixa negativo; se nao ha o suficiente, nao gasta nada e devolve false. */
export function spendStamina(h: StaminaLike, cost: number): boolean {
  const c = Math.max(0, fin(cost, 0));
  if (c === 0) return true;
  if (h.stamina + 1e-9 < c) return false;
  h.stamina = clamp(h.stamina - c, 0, h.maxStamina);
  return true;
}

/** PRNG deterministico (mulberry32). A cena usa uma semente aleatoria; os testes usam sementes fixas. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Critico: a chance e limitada por LIMITS.critChance mesmo que o chamador passe algo maior. */
export function rollCrit(chance: number, rng: () => number): boolean {
  const c = clamp(chance, 0, LIMITS.critChance[1]);
  return c > 0 && rng() < c;
}

// ---------- combo corpo a corpo ----------
export interface ComboState { count: number; last: number }
export const newCombo = (): ComboState => ({ count: 0, last: -Infinity });

/**
 * Registra um golpe em `now` (ms). Recusa (ok=false) se vier antes do intervalo minimo desde o ultimo golpe:
 * e isso que impede dano repetido no mesmo frame. O combo reinicia se passar a janela, e o 3o golpe e o "finalizador".
 */
export function registerHit(c: ComboState, now: number, minIntervalMs: number = BALANCE.meleeMinIntervalMs): { ok: boolean; finisher: boolean } {
  if (now - c.last < minIntervalMs) return { ok: false, finisher: false };
  if (now - c.last > BALANCE.combo.windowMs) c.count = 0;
  c.last = now;
  c.count++;
  if (c.count >= BALANCE.combo.size) { c.count = 0; return { ok: true, finisher: true }; }
  return { ok: true, finisher: false };
}

/** Dano de um golpe. Sem modificadores equivale ao 1.7.1: max(1, round(dano da bomba * 0.4)). */
export function meleeDamage(bombDmg: number, mods: Modifiers, crit: boolean, finisher: boolean): number {
  const x = bombDmg * BALANCE.meleeDmgFactor * mods.dmgMult * (crit ? mods.critMult : 1) * (finisher ? BALANCE.combo.finisherMult : 1);
  return Math.max(1, Math.round(fin(x, 1)));
}

// ---------- bombas ----------
export const isResistantBlock = (maxHp: number) => maxHp >= BALANCE.resistantBlockHp;

/** Alcance da bomba: formula de 1.7.1 (teto 4) + bonus de habilidade (teto LIMITS.blastRangeMax). */
export function bombRange(power: number, mods: Modifiers): number {
  const base = Math.min(4, 1 + Math.ceil(power / 2));
  return Math.min(LIMITS.blastRangeMax, base + Math.round(clamp(mods.blastRangeBonus, 0, LIMITS.blastRangeBonus[1])));
}

export interface BombSnapshot { dmg: number; chestMult: number; resistMult: number; range: number; splash: number }
export function bombSnapshot(baseBombDmg: number, power: number, mods: Modifiers): BombSnapshot {
  return {
    dmg: Math.max(1, Math.round(fin(baseBombDmg * mods.dmgMult, 1))),
    chestMult: mods.chestDmgMult, resistMult: mods.resistantDmgMult,
    range: bombRange(power, mods), splash: Math.round(clamp(mods.splashRadius, 0, LIMITS.splashRadius[1])),
  };
}
/** Dano da bomba contra um tipo de alvo. */
export function bombDamageVs(b: BombSnapshot, kind: "chest" | "enemy" | "block", resistant: boolean): number {
  const m = kind === "chest" ? b.chestMult : kind === "block" && resistant ? b.resistMult : 1;
  return Math.max(1, Math.round(b.dmg * m));
}

/**
 * Celulas atingidas por uma bomba em (gx, gy). A cruz funciona como em 1.7.1: o raio para na casinha (1) e
 * inclui o primeiro bloco (2). Com `splash` = 1 (Impacto Sísmico do Titan) entram tambem as 4 diagonais, mas so
 * se nao forem casinha e se ao menos um dos dois vizinhos ortogonais de passagem estiver livre (nao atravessa quinas fechadas).
 */
export function blastCells(grid: number[][], gx: number, gy: number, range: number, splash = 0): [number, number][] {
  const rows = grid.length, cols = rows ? grid[0].length : 0;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;
  const out: [number, number][] = [[gx, gy]];
  const seen = new Set<string>([`${gx},${gy}`]);
  const add = (x: number, y: number) => { const k = `${x},${y}`; if (!seen.has(k)) { seen.add(k); out.push([x, y]); } };
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let i = 1; i <= range; i++) {
      const x = gx + dx * i, y = gy + dy * i;
      if (!inb(x, y) || grid[y][x] === 1) break;
      add(x, y);
      if (grid[y][x] === 2) break;
    }
  }
  if (splash >= 1) {
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
      const x = gx + dx, y = gy + dy;
      if (!inb(x, y) || grid[y][x] === 1) continue;
      const openA = inb(gx + dx, gy) && grid[gy][gx + dx] === 0;
      const openB = inb(gx, gy + dy) && grid[gy + dy][gx] === 0;
      if (openA || openB) add(x, y);
    }
  }
  return out;
}
