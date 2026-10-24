// Parametros de balanceamento do BOMBERS 2.0. Tudo que e "numero de design" fica aqui (nada espalhado pelo codigo).
// Hipoteses: sem dados de jogo real, os valores sao conservadores e foram escolhidos para dar identidade
// as classes sem mexer na economia. Ajuste aqui e rode `npm test` (os testes validam os LIMITES, nao os numeros).
import type { AbilityDef, AbilityId, BomberClass, Modifiers } from "./bomberTypes";

/** Tetos e pisos aplicados a TODOS os modificadores, venham de onde vierem. */
export const LIMITS = {
  dmgMult: [0.5, 2] as const,
  speedMult: [0.6, 1.6] as const,
  regenMult: [0.5, 2] as const,
  staminaCostMult: [0.5, 1.5] as const,
  chestDmgMult: [1, 2] as const,
  enemyDmgMult: [1, 2] as const,
  resistantDmgMult: [1, 2] as const,
  hitIntervalMult: [0.5, 1.5] as const,
  luckBonus: [0, 0.6] as const,       // so o BONUS de habilidades; a sorte base/melhorias seguem como antes
  critChance: [0, 0.35] as const,
  critMult: [1, 2.5] as const,
  blastRangeBonus: [0, 1] as const,
  splashRadius: [0, 1] as const,
  teamBonus: 0.1,                     // bonus maximo recebido de aliados (nao soma entre fontes)
  abilityDurationMs: 10000,
  abilityCooldownMinMs: 5000,
  blastRangeMax: 5,                   // a bomba normal continua limitada a 4 (state/FarmScene 1.7.1)
};

export const BALANCE = {
  maxDtMs: 250,            // um frame longo (aba escondida) nunca gasta recarga/duracao de uma vez
  warmupFraction: 0.3,     // ao carregar a pagina as habilidades ativas comecam com 30% da recarga
  minTickMs: 80,           // ritmo minimo de passo: mesmo muito rapido, 1 acao por 80 ms
  baseTickMs: 450,         // ritmo base da 1.7.1 (450 / velocidade)
  bombFuseMs: 1400,        // pavio da bomba (igual a 1.7.1)
  resistantBlockHp: 20,    // bloco com HP maximo >= isto conta como "resistente"
  actionMinStamina: 1,     // gate de 1.7.1: abaixo disso o operador dorme
  bombCost: 1,
  meleeHitCost: 0.3,       // igual a 1.7.1
  meleeDmgFactor: 0.4,     // igual a 1.7.1
  meleeMinIntervalMs: 120, // nunca dois golpes do mesmo operador em menos que isto
  combo: { windowMs: 1200, size: 3, finisherMult: 1.5 },
  repair: { selfFraction: 0.2, selfBelow: 0.5, allyAmount: 0.8, allyBelow: 0.6, maxAllies: 3, lockMs: 30000 },
  teamBuffTtlMs: 1200,     // o bonus de equipe some sozinho se a fonte se afastar
  sightRadius: 4,          // tiles em que QUALQUER operador enxerga o valor de um bau (alem disso, assume a media)
  avgChestBase: 2.6,       // media ponderada de RARITIES[*].chest pelas chances de drop
  lyraNapBelow: 0.25,      // Lyra descansa cedo em vez de gastar o resto da stamina em blocos
  escapeMarginMs: 150,
};

// Alias legivel para os numeros de cada habilidade.
const d = (x: AbilityDef): AbilityDef => x;
export const ABILITY_DEFS: Record<AbilityId, AbilityDef> = {
  lyra_efficiency: d({ id: "lyra_efficiency", cls: "lyra", kind: "passive", name: "Eficiência Bio-mecânica", unlockLevel: 1,
    desc: "Bombas custam 15% menos stamina e ela se recupera 25% mais rápido ao descansar em campo.",
    durationMs: 0, cooldownMs: 0, staminaCost: 0, range: 0, mods: { staminaCostMult: 0.85, regenMult: 1.25 } }),
  lyra_repair: d({ id: "lyra_repair", cls: "lyra", kind: "active", name: "Pulso de Reparo", unlockLevel: 3,
    desc: "Recupera 20% da própria stamina e 0,8 de até 3 aliados próximos cansados (cada aliado só recebe um reparo a cada 30 s).",
    durationMs: 0, cooldownMs: 22000, staminaCost: 0, range: 4, mods: {} }),
  kai_tracker: d({ id: "kai_tracker", cls: "kai", kind: "passive", name: "Rastreador Urbano", unlockLevel: 1,
    desc: "+25% de dano em inimigos e prefere caçar inimigos próximos (até 6 passos) antes de ir atrás de baús.",
    durationMs: 0, cooldownMs: 0, staminaCost: 0, range: 0, mods: { enemyDmgMult: 1.25 } }),
  kai_hunt: d({ id: "kai_hunt", cls: "kai", kind: "active", name: "Marca de Caça", unlockLevel: 3,
    desc: "Por 5 s causa +35% de dano em inimigos (soma ao passivo) e fica 15% mais rápido. Custa 0,5 de stamina.",
    durationMs: 5000, cooldownMs: 14000, staminaCost: 0.5, range: 0, mods: { enemyDmgMult: 1.35, speedMult: 1.15 } }),
  titan_breaker: d({ id: "titan_breaker", cls: "titan", kind: "passive", name: "Quebra-Blindagem", unlockLevel: 1,
    desc: "+25% de dano em baús e +30% em blocos resistentes.",
    durationMs: 0, cooldownMs: 0, staminaCost: 0, range: 0, mods: { chestDmgMult: 1.25, resistantDmgMult: 1.3 } }),
  titan_seismic: d({ id: "titan_seismic", cls: "titan", kind: "active", name: "Impacto Sísmico", unlockLevel: 3,
    desc: "A próxima bomba ganha +1 de alcance e explode também nas diagonais (respeitando casinhas e blocos). Custa 2 de stamina extra.",
    durationMs: 6000, cooldownMs: 16000, staminaCost: 2, range: 0, armed: true, mods: { blastRangeBonus: 1, splashRadius: 1 } }),
  vex_scanner: d({ id: "vex_scanner", cls: "vex", kind: "passive", name: "Scanner de Tesouros", unlockLevel: 1,
    desc: "Enxerga o valor dos baús a até 6 tiles (os outros veem a 4) e ganha +0,25 de sorte.",
    durationMs: 0, cooldownMs: 0, staminaCost: 0, range: 6, detectRange: 6, mods: { luckBonus: 0.25 } }),
  vex_deep_scan: d({ id: "vex_deep_scan", cls: "vex", kind: "active", name: "Varredura Profunda", unlockLevel: 3,
    desc: "Por 5 s o alcance de detecção sobe para 8 tiles e a sorte ganha +0,35.",
    durationMs: 5000, cooldownMs: 20000, staminaCost: 0.5, range: 8, detectRange: 8, mods: { luckBonus: 0.35 } }),
  kira_agile: d({ id: "kira_agile", cls: "kira", kind: "passive", name: "Passo Furtivo", unlockLevel: 1,
    desc: "+5% de velocidade e prefere alvos acessíveis por caminhos curtos.",
    durationMs: 0, cooldownMs: 0, staminaCost: 0, range: 0, mods: { speedMult: 1.05 } }),
  kira_dash: d({ id: "kira_dash", cls: "kira", kind: "active", name: "Impulso", unlockLevel: 3,
    desc: "Por 3 s fica 50% mais rápida. Continua andando pela grade, sem atravessar blocos. Custa 0,5 de stamina.",
    durationMs: 3000, cooldownMs: 12000, staminaCost: 0.5, range: 0, mods: { speedMult: 1.5 } }),
  jax_blade_master: d({ id: "jax_blade_master", cls: "jax", kind: "passive", name: "Mestre da Lâmina", unlockLevel: 1,
    desc: "8% de chance de golpe crítico (x1,75) e o 3º golpe seguido causa +50% de dano.",
    durationMs: 0, cooldownMs: 0, staminaCost: 0, range: 0, mods: { critChance: 0.08, critMult: 1.75 } }),
  jax_flurry: d({ id: "jax_flurry", cls: "jax", kind: "active", name: "Tempestade de Lâminas", unlockLevel: 3,
    desc: "Por 3 s golpeia com o dobro de frequência (mín. 120 ms entre golpes) e +10% de chance de crítico.",
    durationMs: 3000, cooldownMs: 15000, staminaCost: 0, range: 0, mods: { hitIntervalMult: 0.5, critChance: 0.1 } }),
  orion_apex: d({ id: "orion_apex", cls: "orion", kind: "passive", name: "Presença Suprema", unlockLevel: 1,
    desc: "+10% de dano, +5% de velocidade, +0,2 de sorte. Aliados a 4 tiles ganham +3% de dano.",
    durationMs: 0, cooldownMs: 0, staminaCost: 0, range: 4, mods: { dmgMult: 1.1, speedMult: 1.05, luckBonus: 0.2 }, aura: { range: 4, dmg: 0.03, speed: 0 } }),
  orion_ascension: d({ id: "orion_ascension", cls: "orion", kind: "active", name: "Ascensão", unlockLevel: 8,
    desc: "Por 6 s: +25% de dano, +20% de velocidade e +0,2 de sorte; aliados a 5 tiles ganham +7% de dano e +5% de velocidade. Custa 2 de stamina.",
    durationMs: 6000, cooldownMs: 45000, staminaCost: 2, range: 5, mods: { dmgMult: 1.25, speedMult: 1.2, luckBonus: 0.2 }, aura: { range: 5, dmg: 0.07, speed: 0.05 } }),
  aeon_architect: d({ id: "aeon_architect", cls: "aeon", kind: "passive", name: "Arquiteto da Grade", unlockLevel: 1,
    desc: "+12% de dano, +6% de velocidade, bombas 10% mais baratas, +0,2 de sorte e enxerga baús a 7 tiles. Aliados a 5 tiles ganham +3% de dano e +2% de velocidade.",
    durationMs: 0, cooldownMs: 0, staminaCost: 0, range: 5, detectRange: 7,
    mods: { dmgMult: 1.12, speedMult: 1.06, staminaCostMult: 0.9, luckBonus: 0.2, regenMult: 1.1 }, aura: { range: 5, dmg: 0.03, speed: 0.02 } }),
  aeon_rewrite: d({ id: "aeon_rewrite", cls: "aeon", kind: "active", name: "Reescrita da Grade", unlockLevel: 10,
    desc: "Por 8 s: +25% de dano, +15% de velocidade, +1 de alcance nas bombas e +0,2 de sorte; aliados a 6 tiles ganham +6% de dano e +5% de velocidade e têm 15% das recargas encurtadas (uma vez por aliado a cada 45 s). Custa 3 de stamina.",
    durationMs: 8000, cooldownMs: 60000, staminaCost: 3, range: 6, detectRange: 8,
    mods: { dmgMult: 1.25, speedMult: 1.15, blastRangeBonus: 1, luckBonus: 0.2 }, aura: { range: 6, dmg: 0.06, speed: 0.05 },
    cdSync: { range: 6, fraction: 0.15, lockMs: 45000 } }),
};

export const CLASS_INFO: Record<BomberClass, { label: string; role: string }> = {
  lyra: { label: "Bio-mecânica", role: "Suporte: economiza e recupera stamina" },
  kai: { label: "Techno-Stalker", role: "Rastreador: caça inimigos com precisão" },
  titan: { label: "Tanque explosivo", role: "Dano alto em alvos resistentes, em área" },
  vex: { label: "Hacker de tesouros", role: "Detecta e prioriza os baús mais valiosos" },
  kira: { label: "Androide furtiva", role: "Velocidade e rotas curtas" },
  jax: { label: "Samurai", role: "Corpo a corpo: golpes em sequência e críticos" },
  orion: { label: "Entidade suprema", role: "Híbrido: dano, mobilidade e bônus de equipe" },
  aeon: { label: "Construto primordial", role: "Ápice: arquiteta a grade, potencializa e sincroniza a equipe" },
};

/** Pesos da IA DENTRO de cada categoria (baú > inimigo > bloco continua valendo, como na 1.7.1). */
export interface AIWeights { value: number; dist: number; resistant: number; finish: number; cluster: number; mvp: number; enemyBonus: number; huntRange: number }
export const AI_WEIGHTS: Record<BomberClass, AIWeights> = {
  lyra:  { value: 0.8, dist: 1.2, resistant: 0,   finish: 1,   cluster: 1.5, mvp: 0, enemyBonus: 0, huntRange: 0 },
  kai:   { value: 1.0, dist: 1.2, resistant: 0,   finish: 3,   cluster: 0,   mvp: 2, enemyBonus: 1100, huntRange: 6 }, // enemyBonus > diferenca de categoria (1000): inimigo PROXIMO vence o bau
  titan: { value: 1.0, dist: 0.6, resistant: 6,   finish: 0,   cluster: 1.0, mvp: 0, enemyBonus: 0, huntRange: 0 },
  vex:   { value: 2.2, dist: 0.5, resistant: 0,   finish: 0,   cluster: 0,   mvp: 0, enemyBonus: 0, huntRange: 0 },
  kira:  { value: 0.5, dist: 2.5, resistant: 0,   finish: 0,   cluster: 0,   mvp: 0, enemyBonus: 0, huntRange: 0 },
  jax:   { value: 1.0, dist: 1.0, resistant: 0,   finish: 6,   cluster: 4,   mvp: 0, enemyBonus: 0, huntRange: 0 },
  orion: { value: 1.6, dist: 0.9, resistant: 1,   finish: 2,   cluster: 2,   mvp: 6, enemyBonus: 0, huntRange: 0 },
  aeon:  { value: 1.8, dist: 0.8, resistant: 1,   finish: 2,   cluster: 2,   mvp: 4, enemyBonus: 0, huntRange: 0 },
};
export const TIER: Record<"chest" | "enemy" | "block", number> = { chest: 3000, enemy: 2000, block: 1000 };
export const AI_TUNING = {
  switchMargin: 6,        // um alvo da mesma categoria so vence o atual com folga (anti-oscilacao)
  minHoldMs: 1500,        // tempo minimo de permanencia no alvo antes de trocar por "so um pouco melhor"
  noProgressLimit: 10,    // decisoes sem se aproximar do alvo = inalcancavel
  blacklistMs: 8000,
  trailLen: 16, trailMaxUnique: 3, // preso: 16 decisoes de movimento passando por no maximo 3 celulas
  blacklistCap: 32,
  unsafeWaitTicks: 3,     // espera ate 3 decisoes por uma posicao segura antes de plantar mesmo assim (bomba nao fere operador na 1.7.1)
};

export const NEUTRAL_MODS: Readonly<Modifiers> = Object.freeze({
  dmgMult: 1, speedMult: 1, regenMult: 1, staminaCostMult: 1, chestDmgMult: 1, resistantDmgMult: 1,
  enemyDmgMult: 1, hitIntervalMult: 1, luckBonus: 0, critChance: 0, critMult: 1, blastRangeBonus: 0, splashRadius: 0,
});
export const ABILITIES_BY_CLASS: Record<BomberClass, AbilityDef[]> = {
  lyra: [ABILITY_DEFS.lyra_efficiency, ABILITY_DEFS.lyra_repair],
  kai: [ABILITY_DEFS.kai_tracker, ABILITY_DEFS.kai_hunt],
  titan: [ABILITY_DEFS.titan_breaker, ABILITY_DEFS.titan_seismic],
  vex: [ABILITY_DEFS.vex_scanner, ABILITY_DEFS.vex_deep_scan],
  kira: [ABILITY_DEFS.kira_agile, ABILITY_DEFS.kira_dash],
  jax: [ABILITY_DEFS.jax_blade_master, ABILITY_DEFS.jax_flurry],
  orion: [ABILITY_DEFS.orion_apex, ABILITY_DEFS.orion_ascension],
  aeon: [ABILITY_DEFS.aeon_architect, ABILITY_DEFS.aeon_rewrite],
};
