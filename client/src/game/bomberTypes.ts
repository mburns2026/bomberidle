// Tipos compartilhados do sistema de BOMBERS 2.0. Modulo puro: sem Phaser e sem estado global.
import type { Rarity } from "../state";

export type BomberClass = "lyra" | "kai" | "titan" | "vex" | "kira" | "jax" | "orion" | "aeon";
export type AbilityKind = "passive" | "active";
export type AbilityId =
  | "lyra_efficiency" | "lyra_repair"
  | "kai_tracker" | "kai_hunt"
  | "titan_breaker" | "titan_seismic"
  | "vex_scanner" | "vex_deep_scan"
  | "kira_agile" | "kira_dash"
  | "jax_blade_master" | "jax_flurry"
  | "orion_apex" | "orion_ascension"
  | "aeon_architect" | "aeon_rewrite";
export type TargetKind = "chest" | "enemy" | "block";

/** Modificadores efetivos de um operador num instante. Sempre finitos e dentro de LIMITS. */
export interface Modifiers {
  dmgMult: number;         // multiplica o dano de bomba/golpe
  speedMult: number;       // multiplica a velocidade (ritmo de passos)
  regenMult: number;       // multiplica a regeneracao de stamina em campo
  staminaCostMult: number; // multiplica o custo de stamina das acoes
  chestDmgMult: number;    // dano extra contra baus
  enemyDmgMult: number;    // dano extra contra inimigos (Kai)
  resistantDmgMult: number;// dano extra contra blocos resistentes
  hitIntervalMult: number; // intervalo entre golpes corpo a corpo (menor = mais rapido)
  luckBonus: number;       // soma a sorte (so afeta o sorteio de raridade ja existente)
  critChance: number;      // 0..1
  critMult: number;        // multiplicador do critico
  blastRangeBonus: number; // alcance extra da bomba
  splashRadius: number;    // raio da explosao em area (0 = so a cruz normal)
}

export interface AbilityDef {
  id: AbilityId;
  cls: BomberClass;
  kind: AbilityKind;
  name: string;
  desc: string;
  unlockLevel: number;   // nivel do operador que libera a habilidade
  durationMs: number;    // 0 = efeito instantaneo
  cooldownMs: number;    // recarga (comeca ao ativar)
  staminaCost: number;
  range: number;         // alcance em tiles (suporte, deteccao ou aura), 0 = nao se aplica
  mods: Partial<Modifiers>;
  armed?: boolean;       // efeito consumido pela proxima bomba (nao pelo tempo)
  detectRange?: number;  // alcance de deteccao de baus (Vex)
  aura?: { range: number; dmg: number; speed: number }; // bonus pequeno para aliados proximos
  cdSync?: { range: number; fraction: number; lockMs: number }; // Aeon: encurta as recargas dos aliados (cada aliado so uma vez por lockMs)
}

export interface TeamBuff { dmg: number; speed: number; ms: number }

/** Estado temporario de habilidades de UM operador. Nao e salvo: recarregar a pagina nunca preserva efeitos ativos. */
export interface AbilityRuntime {
  cls: BomberClass;
  cd: Partial<Record<AbilityId, number>>;     // ms restantes de recarga
  active: Partial<Record<AbilityId, number>>; // ms restantes de efeito
  team: TeamBuff;          // bonus recebido de um aliado (nao soma: vale o maior)
  supportLockMs: number;   // enquanto > 0 nao recebe outro reparo da Lyra
  syncLockMs: number;      // enquanto > 0 nao recebe outra sincronia do Aeon
  mods: Modifiers;         // cache, recalculado por modifiersOf
}

export interface AbilityContext {
  pathLen: number | null;       // passos ate a posicao de ataque do alvo atual
  adjacentTarget: boolean;      // ja esta no lugar de atacar
  resistantNear: boolean;       // alvo atual e resistente (bloco duro ou bau)
  targetsNear: number;          // alvos a ate 2 passos
  chestsDetected: number;       // baus dentro do alcance de deteccao
  enemiesNear: number;          // inimigos a ate 6 passos
  alliesNeedingSupport: number; // aliados proximos com stamina baixa
  inDanger: boolean;
}

export interface CellTarget {
  id: string; kind: TargetKind;
  tx: number; ty: number;  // posicao do alvo
  sx: number; sy: number;  // celula de onde atacar
  dist: number;            // passos ate (sx, sy); 0 = ja esta la
  hp: number; maxHp: number;
  value: number;           // valor esperado (na mesma escala para todos os tipos)
  hits: number;            // golpes estimados para destruir
  resistant: boolean; mvp: boolean;
  adjTargets: number;      // quantos outros alvos ficam ao redor da celula de ataque
  label: string;
}

export interface WorldView {
  grid: number[][]; // 0 livre, 1 casinha, 2 bloco
  chests: { x: number; y: number; hp: number; maxHp: number; base: number; label: string }[];
  enemies: { id: string; x: number; y: number; hp: number; maxHp: number; reward: number; mvp: boolean }[];
  blocks: { x: number; y: number; hp: number; maxHp: number }[];
  bombCells: Set<string>;
  danger: Set<string>;
  dropChance: number;
}

/** Quem e quem: a classe e definida pela raridade (mesmo mapeamento de ARCH em state.ts). */
export const CLASS_BY_RARITY: Record<Rarity, BomberClass> = {
  common: "lyra", uncommon: "kai", rare: "titan", epic: "vex", mythic: "kira", legendary: "jax", super: "orion", ancestral: "aeon",
};
