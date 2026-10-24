// Sistema de habilidades: estado temporario, recargas centralizadas, modificadores com limites e decisao de ativacao.
// Modulo puro. O tempo avanca por tickRuntime(dt) chamado pelo loop da cena (nenhum timer por personagem).
import { ABILITIES_BY_CLASS, ABILITY_DEFS, BALANCE, LIMITS, NEUTRAL_MODS } from "./bomberConfig";
import { clamp, gainStamina, spendStamina, type StaminaLike } from "./bomberCombat";
import { CLASS_BY_RARITY } from "./bomberTypes";
import type { AbilityContext, AbilityDef, AbilityId, AbilityRuntime, BomberClass, Modifiers } from "./bomberTypes";
import type { Rarity } from "../state";

export interface BomberLike extends StaminaLike { id: string; rarity: Rarity; level: number }

export const bomberClass = (r: Rarity): BomberClass => CLASS_BY_RARITY[r];
export const abilitiesOf = (cls: BomberClass): AbilityDef[] => ABILITIES_BY_CLASS[cls];
export const isUnlocked = (def: AbilityDef, level: number) => level >= def.unlockLevel;

/** Registro de estado por operador. A cena e a interface leem o mesmo mapa (a UI mostra recarga/estado). */
const registry = new Map<string, AbilityRuntime>();
export function createRuntime(cls: BomberClass): AbilityRuntime {
  const cd: AbilityRuntime["cd"] = {};
  // Recarregar a pagina nao zera as recargas por completo: ativas comecam com 30% (efeitos ativos nunca persistem).
  for (const d of abilitiesOf(cls)) if (d.kind === "active") cd[d.id] = Math.round(d.cooldownMs * BALANCE.warmupFraction);
  return { cls, cd, active: {}, team: { dmg: 0, speed: 0, ms: 0 }, supportLockMs: 0, syncLockMs: 0, mods: { ...NEUTRAL_MODS } };
}
export function runtimeOf(h: BomberLike): AbilityRuntime {
  let rt = registry.get(h.id);
  if (!rt || rt.cls !== bomberClass(h.rarity)) { rt = createRuntime(bomberClass(h.rarity)); registry.set(h.id, rt); }
  return rt;
}
export const peekRuntime = (id: string) => registry.get(id);
export const dropRuntime = (id: string) => { registry.delete(id); };
export const resetRegistry = () => registry.clear();

/** Avanca recargas e duracoes. dt e limitado (um frame longo nao "queima" tudo de uma vez) e nunca negativo. */
export function tickRuntime(rt: AbilityRuntime, dtMs: number) {
  const dt = clamp(dtMs, 0, BALANCE.maxDtMs);
  for (const k of Object.keys(rt.cd) as AbilityId[]) rt.cd[k] = Math.max(0, (rt.cd[k] ?? 0) - dt);
  for (const k of Object.keys(rt.active) as AbilityId[]) {
    const left = (rt.active[k] ?? 0) - dt;
    if (left > 0) rt.active[k] = left; else delete rt.active[k];
  }
  rt.supportLockMs = Math.max(0, rt.supportLockMs - dt);
  rt.syncLockMs = Math.max(0, rt.syncLockMs - dt);
  if (rt.team.ms > 0) { rt.team.ms -= dt; if (rt.team.ms <= 0) rt.team = { dmg: 0, speed: 0, ms: 0 }; }
}

/** Fecha todos os efeitos temporarios (troca de mapa, cena reiniciada). Recargas continuam. */
export function clearTransient(rt: AbilityRuntime) {
  rt.active = {};
  rt.team = { dmg: 0, speed: 0, ms: 0 };
}

/** Bonus de equipe: vale o MAIOR recebido (varios Orions nao somam) e nunca passa de LIMITS.teamBonus. */
export function setTeamBuff(rt: AbilityRuntime, dmg: number, speed: number) {
  rt.team = {
    dmg: Math.min(LIMITS.teamBonus, Math.max(rt.team.dmg, dmg)),
    speed: Math.min(LIMITS.teamBonus, Math.max(rt.team.speed, speed)),
    ms: BALANCE.teamBuffTtlMs,
  };
}

const MULT: (keyof Modifiers)[] = ["dmgMult", "speedMult", "regenMult", "staminaCostMult", "chestDmgMult", "enemyDmgMult", "resistantDmgMult", "hitIntervalMult"];
const ADD: (keyof Modifiers)[] = ["luckBonus", "critChance", "blastRangeBonus"];
const MAXK: (keyof Modifiers)[] = ["critMult", "splashRadius"];

/** Modificadores efetivos: passivas sempre, ativas enquanto durarem, bonus de equipe; tudo limitado por LIMITS. */
export function modifiersOf(rt: AbilityRuntime, h: BomberLike): Modifiers {
  const m = rt.mods;
  Object.assign(m, NEUTRAL_MODS);
  for (const d of abilitiesOf(rt.cls)) {
    if (!isUnlocked(d, h.level)) continue;
    if (d.kind === "active" && !(rt.active[d.id] && rt.active[d.id]! > 0)) continue;
    for (const k of MULT) if (d.mods[k] !== undefined) m[k] *= d.mods[k]!;
    for (const k of ADD) if (d.mods[k] !== undefined) m[k] += d.mods[k]!;
    for (const k of MAXK) if (d.mods[k] !== undefined) m[k] = Math.max(m[k], d.mods[k]!);
  }
  m.dmgMult *= 1 + Math.min(LIMITS.teamBonus, rt.team.dmg);
  m.speedMult *= 1 + Math.min(LIMITS.teamBonus, rt.team.speed);
  for (const k of [...MULT, ...ADD, ...MAXK]) {
    const lim = LIMITS[k as keyof typeof LIMITS] as readonly [number, number];
    m[k] = clamp(m[k], lim[0], lim[1]);
  }
  return m;
}

export function isReady(rt: AbilityRuntime, def: AbilityDef, h: BomberLike): boolean {
  if (def.kind !== "active" || !isUnlocked(def, h.level)) return false;
  if ((rt.cd[def.id] ?? 0) > 0 || (rt.active[def.id] ?? 0) > 0) return false;
  return h.stamina + 1e-9 >= def.staminaCost;
}

/** Ativa: cobra a stamina, inicia duracao e recarga. Nao reativa enquanto ativa ou em recarga (sem acumulo). */
export function activate(rt: AbilityRuntime, def: AbilityDef, h: BomberLike): boolean {
  if (!isReady(rt, def, h)) return false;
  if (!spendStamina(h, def.staminaCost)) return false;
  rt.cd[def.id] = Math.min(Math.max(def.cooldownMs, LIMITS.abilityCooldownMinMs), 600000);
  if (def.durationMs > 0) rt.active[def.id] = Math.min(def.durationMs, LIMITS.abilityDurationMs);
  return true;
}
/** Efeito "armado" (Impacto Sismico) e gasto pela proxima bomba. */
export function consumeArmed(rt: AbilityRuntime): AbilityId | null {
  for (const d of abilitiesOf(rt.cls)) if (d.armed && (rt.active[d.id] ?? 0) > 0) { delete rt.active[d.id]; return d.id; }
  return null;
}

/** Condicoes de ativacao automatica. Devolve as habilidades que DEVEM ser ativadas agora (ja prontas). */
export function decideAbilities(rt: AbilityRuntime, h: BomberLike, ctx: AbilityContext): AbilityDef[] {
  const out: AbilityDef[] = [];
  const ratio = h.maxStamina > 0 ? h.stamina / h.maxStamina : 0;
  for (const d of abilitiesOf(rt.cls)) {
    if (!isReady(rt, d, h)) continue;
    let go = false;
    switch (d.id) {
      case "lyra_repair": go = ratio <= BALANCE.repair.selfBelow || ctx.alliesNeedingSupport >= 1; break;
      case "kai_hunt": go = ctx.enemiesNear >= 1 && h.stamina >= 2; break;
      case "aeon_rewrite": go = ratio >= 0.4 && (ctx.targetsNear >= 3 || ctx.enemiesNear >= 1 || ctx.chestsDetected >= 2); break;
      case "titan_seismic": go = ctx.adjacentTarget && h.stamina >= d.staminaCost + 2 && (ctx.targetsNear >= 3 || ctx.resistantNear); break;
      case "vex_deep_scan": go = ctx.chestsDetected >= 2 && h.stamina >= 2; break;
      case "kira_dash": go = ctx.pathLen !== null && ctx.pathLen >= 4 && h.stamina >= 2; break;
      case "jax_flurry": go = ctx.adjacentTarget && h.stamina >= 3; break;
      case "orion_ascension": go = ratio >= 0.4 && (ctx.targetsNear >= 3 || ctx.enemiesNear >= 1); break;
      default: go = false;
    }
    if (go) out.push(d);
  }
  return out;
}

// ---------- suporte da Lyra ----------
export interface RepairTarget { data: BomberLike; rt: AbilityRuntime; dist?: number }
export interface RepairResult { self: number; allies: { id: string; amount: number }[] }

/**
 * Pulso de Reparo. A stamina entregue e limitada de tres formas, para nao haver ciclo infinito:
 * (1) a propria Lyra so se cura se estiver abaixo de 50% e ganha no maximo 20% do maximo;
 * (2) no maximo 3 aliados por pulso, cada um com stamina <= 60% e uma unica vez por 30 s, nao importa quantas Lyras existam;
 * (3) a habilidade em si tem recarga de 22 s e nunca passa do maximo de ninguem.
 */
export function repairPulse(self: BomberLike, allies: RepairTarget[]): RepairResult {
  const R = BALANCE.repair;
  const res: RepairResult = { self: 0, allies: [] };
  if (self.maxStamina > 0 && self.stamina / self.maxStamina <= R.selfBelow) res.self = gainStamina(self, R.selfFraction * self.maxStamina);
  const need = allies
    .filter((a) => a.data.id !== self.id && a.rt.supportLockMs <= 0 && a.data.maxStamina > 0 && a.data.stamina / a.data.maxStamina <= R.allyBelow)
    .sort((a, b) => a.data.stamina / a.data.maxStamina - b.data.stamina / b.data.maxStamina)
    .slice(0, R.maxAllies);
  for (const a of need) {
    const got = gainStamina(a.data, R.allyAmount);
    if (got > 0) { a.rt.supportLockMs = R.lockMs; res.allies.push({ id: a.data.id, amount: got }); }
  }
  return res;
}

/**
 * Sincronia do Aeon: encurta as recargas ATIVAS dos aliados em `fraction` do tempo total de cada habilidade.
 * Limites: so recargas que ainda estao correndo, nunca abaixo de zero, e cada aliado so recebe uma sincronia por `lockMs`
 * (varios Aeons nao somam). Devolve os ids que foram beneficiados.
 */
export function syncCooldowns(def: AbilityDef, allies: RepairTarget[]): string[] {
  const s = def.cdSync;
  if (!s) return [];
  const out: string[] = [];
  for (const a of allies) {
    if (a.rt.syncLockMs > 0) continue;
    let shaved = false;
    for (const d of abilitiesOf(a.rt.cls)) {
      if (d.kind !== "active") continue;
      const left = a.rt.cd[d.id] ?? 0;
      if (left <= 0) continue;
      a.rt.cd[d.id] = Math.max(0, left - Math.min(left, d.cooldownMs * s.fraction));
      shaved = true;
    }
    if (shaved) { a.rt.syncLockMs = s.lockMs; out.push(a.data.id); }
  }
  return out;
}

// ---------- auras e deteccao ----------
/** Aura de equipe ativa agora (passiva + ativa em duracao): o maior alcance e os maiores bonus. */
export function auraOf(rt: AbilityRuntime, h: BomberLike): { range: number; dmg: number; speed: number } | null {
  let best: { range: number; dmg: number; speed: number } | null = null;
  for (const d of abilitiesOf(rt.cls)) {
    if (!d.aura || !isUnlocked(d, h.level)) continue;
    if (d.kind === "active" && !((rt.active[d.id] ?? 0) > 0)) continue;
    best = best
      ? { range: Math.max(best.range, d.aura.range), dmg: Math.max(best.dmg, d.aura.dmg), speed: Math.max(best.speed, d.aura.speed) }
      : { ...d.aura };
  }
  return best;
}
/** Alcance (tiles) em que o operador enxerga o valor dos baus. Quem nao detecta usa o raio basico. */
export function detectRadius(rt: AbilityRuntime, h: BomberLike): number {
  let r = BALANCE.sightRadius;
  for (const d of abilitiesOf(rt.cls)) {
    if (d.detectRange === undefined || !isUnlocked(d, h.level)) continue;
    if (d.kind === "active" && !((rt.active[d.id] ?? 0) > 0)) continue;
    r = Math.max(r, d.detectRange);
  }
  return r;
}

// ---------- texto para a interface ----------
export function abilityStatus(rt: AbilityRuntime | undefined, def: AbilityDef, level: number): { text: string; state: "locked" | "passive" | "active" | "cooldown" | "ready" } {
  if (!isUnlocked(def, level)) return { text: `Bloqueada (Nv ${def.unlockLevel})`, state: "locked" };
  if (def.kind === "passive") return { text: "Passiva", state: "passive" };
  const a = rt?.active[def.id] ?? 0, c = rt?.cd[def.id] ?? 0;
  if (a > 0) return { text: def.armed ? "Armada" : `Ativa ${(a / 1000).toFixed(1)}s`, state: "active" };
  if (c > 0) return { text: `Recarga ${Math.ceil(c / 1000)}s`, state: "cooldown" };
  return { text: "Pronta", state: "ready" };
}
export { ABILITY_DEFS };
