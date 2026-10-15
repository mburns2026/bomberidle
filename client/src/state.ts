export type Rarity = "common" | "rare" | "epic" | "mythic" | "legendary" | "super";

// chest = valor base do bau dessa raridade; mult = multiplicador do heroi dessa raridade
export const RARITIES: Record<Rarity, { label: string; color: number; css: string; mult: number; chest: number }> = {
  common: { label: "Comum", color: 0x8d99a6, css: "#8d99a6", mult: 1, chest: 1 },
  rare: { label: "Raro", color: 0x3fa2ff, css: "#3fa2ff", mult: 1.1, chest: 2 },
  epic: { label: "Épico", color: 0x9b5cff, css: "#9b5cff", mult: 1.25, chest: 4 },
  mythic: { label: "Mítico", color: 0xff3fa4, css: "#ff3fa4", mult: 1.5, chest: 8 },
  legendary: { label: "Lendário", color: 0xffb830, css: "#ffb830", mult: 1.8, chest: 16 },
  super: { label: "Super lendário", color: 0xfff1b8, css: "#fff1b8", mult: 2.5, chest: 40 },
};

export interface HeroData {
  id: string;
  name: string;
  rarity: Rarity;
  role: string;
  portrait: string; // carta NFT em public/
  power: number; // 1..5 -> alcance da bomba
  speed: number; // multiplicador de velocidade (ja com melhorias)
  maxStamina: number; // ja com nivel e melhorias
  stamina: number; // cada bomba gasta 1
  regen: number; // stamina recuperada por tick de descanso
  luck: number; // desloca a raridade dos baus para cima
  chestMult: number; // multiplicador do valor dos baus
  melee: boolean; // quebra blocos adjacentes sem bomba
  level: number;
  xp: number;
  up: { stamina: number; speed: number; luck: number }; // niveis de melhoria
  base: { maxStamina: number; speed: number; luck: number }; // atributos de fabrica
}

export type UpKey = "stamina" | "speed" | "luck";
export const UP_MAX = 10;
const MAX_LEVEL = 30;

interface Daily { day: string; blocks: number; bombs: number; chests: number; maps: string[]; claimed: string[] }
interface Saved {
  pending: number; chests: number;
  heroes?: Record<string, { xp: number; level: number; up: { stamina: number; speed: number; luck: number } }>;
  daily?: Daily;
}

const KEY = "bomber-idle:v1"; // mesma chave: saves antigos continuam validos
function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
const saved = load();
const today = () => new Date().toISOString().slice(0, 10);
const freshDaily = (): Daily => ({ day: today(), blocks: 0, bombs: 0, chests: 0, maps: [], claimed: [] });
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Recalcula os atributos a partir da base, do nivel e das melhorias. */
export function applyStats(h: HeroData) {
  h.maxStamina = h.base.maxStamina + 2 * h.up.stamina + (h.level - 1);
  h.speed = r2(h.base.speed * (1 + 0.06 * h.up.speed));
  h.luck = r2(h.base.luck + 0.15 * h.up.luck);
}
export const levelMult = (h: HeroData) => 1 + 0.03 * (h.level - 1);
const xpNeed = (lv: number) => Math.round(30 * Math.pow(lv, 1.4));
export const xpInfo = (h: HeroData) => ({ xp: h.xp, need: xpNeed(h.level) });

type Factory = Omit<HeroData, "stamina" | "level" | "xp" | "up" | "base">;
const hero = (h: Factory): HeroData => {
  const s = saved?.heroes?.[h.id];
  const d: HeroData = {
    ...h, stamina: 0, level: s?.level ?? 1, xp: s?.xp ?? 0,
    up: s?.up ?? { stamina: 0, speed: 0, luck: 0 },
    base: { maxStamina: h.maxStamina, speed: h.speed, luck: h.luck },
  };
  applyStats(d);
  d.stamina = d.maxStamina;
  return d;
};

export const store = {
  pending: saved?.pending ?? 0, // pontos de teste (ainda sem blockchain)
  chests: saved?.chests ?? 0,
  heroes: [
    hero({ id: "lyra", name: "Lyra", rarity: "common", role: "Bio-mecânica: recupera stamina rápido", portrait: "nft/lyra.jpg", power: 1, speed: 1.0, maxStamina: 8, regen: 0.3, luck: 0, chestMult: 1, melee: false }),
    hero({ id: "titan", name: "Titan", rarity: "rare", role: "Piloto tanque: bomba grande, lento", portrait: "nft/titan.jpg", power: 5, speed: 0.8, maxStamina: 14, regen: 0.12, luck: 0, chestMult: 1, melee: false }),
    hero({ id: "vex", name: "Vex", rarity: "epic", role: "Hacker: atrai baús mais raros", portrait: "nft/vex.jpg", power: 3, speed: 1.3, maxStamina: 10, regen: 0.12, luck: 1, chestMult: 1, melee: false }),
    hero({ id: "kira", name: "Kira", rarity: "mythic", role: "Android furtiva: a mais veloz", portrait: "nft/kira.jpg", power: 2, speed: 2.0, maxStamina: 12, regen: 0.12, luck: 0.3, chestMult: 1, melee: false }),
    hero({ id: "jax", name: "Jax", rarity: "legendary", role: "Samurai: corta blocos sem bomba", portrait: "nft/jax.jpg", power: 3, speed: 1.7, maxStamina: 12, regen: 0.15, luck: 0.5, chestMult: 1, melee: true }),
    hero({ id: "orion", name: "Orion", rarity: "super", role: "Divino: todos os bônus, baús x2", portrait: "nft/orion.jpg", power: 5, speed: 1.8, maxStamina: 20, regen: 0.25, luck: 1.5, chestMult: 2, melee: false }),
  ] as HeroData[],
  status: {} as Record<string, string>,
  daily: saved?.daily?.day === today() ? saved.daily : freshDaily(),
};

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      pending: store.pending, chests: store.chests, daily: store.daily,
      heroes: Object.fromEntries(store.heroes.map((h) => [h.id, { xp: h.xp, level: h.level, up: h.up }])),
    }));
  } catch {
    /* sem storage: ignora */
  }
}
const ensureDay = () => { if (store.daily.day !== today()) store.daily = freshDaily(); };

/** Bau aberto: soma pontos, XP do heroi e progresso das missoes. */
export function addReward(value: number, h: HeroData, chestBase: number) {
  ensureDay();
  store.pending = r2(store.pending + value);
  store.chests += 1;
  store.daily.chests += 1;
  h.xp += 5 + chestBase * 2;
  while (h.level < MAX_LEVEL && h.xp >= xpNeed(h.level)) { h.xp -= xpNeed(h.level); h.level++; applyStats(h); }
  persist();
}

let ticks = 0;
const bump = () => { if (++ticks % 10 === 0) persist(); };
export const track = {
  block() { ensureDay(); store.daily.blocks++; bump(); },
  bomb() { ensureDay(); store.daily.bombs++; bump(); },
  map(id: string) { ensureDay(); if (!store.daily.maps.includes(id)) { store.daily.maps.push(id); persist(); } },
};

// ---------- melhorias (sumidouro de pontos) ----------
export const upgradeCost = (h: HeroData, k: UpKey) => Math.round(100 * Math.pow(1.5, h.up[k]));
export function upgrade(h: HeroData, k: UpKey): boolean {
  const c = upgradeCost(h, k);
  if (h.up[k] >= UP_MAX || store.pending < c) return false;
  store.pending = r2(store.pending - c);
  h.up[k]++;
  applyStats(h);
  persist();
  return true;
}

// ---------- missoes diarias ----------
export const MISSIONS = [
  { id: "chests", label: "Abrir 30 baús", goal: 30, reward: 40, stat: "chests" },
  { id: "blocks", label: "Quebrar 80 blocos", goal: 80, reward: 30, stat: "blocks" },
  { id: "bombs", label: "Plantar 40 bombas", goal: 40, reward: 30, stat: "bombs" },
  { id: "maps", label: "Visitar 3 mapas", goal: 3, reward: 60, stat: "maps" },
] as const;
export function missionProgress(m: (typeof MISSIONS)[number]): number {
  ensureDay();
  return m.stat === "maps" ? store.daily.maps.length : store.daily[m.stat];
}
export const missionClaimed = (id: string) => store.daily.claimed.includes(id);
export function claimMission(id: string): boolean {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m || missionClaimed(id) || missionProgress(m) < m.goal) return false;
  store.daily.claimed.push(id);
  store.pending = r2(store.pending + m.reward);
  persist();
  return true;
}

export function refillAll() {
  store.heroes.forEach((h) => (h.stamina = h.maxStamina));
}

/** Estado de selecao de mapa: "auto" avanca para o proximo mapa ao limpar o atual. */
export const mapState = { index: 0, auto: true, request: null as number | null };
