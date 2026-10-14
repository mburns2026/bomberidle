import { Hero, Player, Rarity } from "./types.js";

const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  rare: 1.5,
  epic: 2.2,
  legendary: 3.5,
};

const REWARD_PER_CHEST = 10_000n; // 0.01 token com 6 decimais (ajuste ao seu mint)
const HOUR_MS = 3_600_000;

/** PRNG deterministico (mulberry32) para simulacao reproduzivel/auditavel. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simula o farming idle de um heroi por `elapsedMs`, gastando stamina. */
export function farmHero(hero: Hero, elapsedMs: number, seed: number): bigint {
  const hours = Math.min(elapsedMs / HOUR_MS, hero.stamina);
  if (hours <= 0) return 0n;
  hero.stamina -= hours;

  const rand = rng(seed);
  const expectedChests = hero.speed * RARITY_MULT[hero.rarity] * hours;
  const whole = Math.floor(expectedChests);
  let chests = whole + (rand() < expectedChests - whole ? 1 : 0);

  let total = 0n;
  while (chests-- > 0) {
    const bonus = 1 + rand() * (hero.power / 10); // variacao por poder
    total += BigInt(Math.floor(Number(REWARD_PER_CHEST) * bonus));
  }
  return total;
}

/** Liquida o tempo offline do jogador e soma ao saldo pendente. */
export function settle(player: Player, now = Date.now()): bigint {
  const elapsed = now - player.lastSettledAt;
  let gained = 0n;
  player.heroes.forEach((h, i) => {
    gained += farmHero(h, elapsed, now ^ (i * 2654435761));
  });
  player.pending += gained;
  player.lastSettledAt = now;
  return gained;
}
