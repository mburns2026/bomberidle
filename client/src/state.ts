export type Rarity = "common" | "rare" | "epic" | "legendary";

export const RARITIES: Record<
  Rarity,
  { label: string; color: number; css: string; mult: number; chest: number }
> = {
  common: { label: "Comum", color: 0x9c6b3a, css: "#9c6b3a", mult: 1, chest: 1 },
  rare: { label: "Raro", color: 0x3f7fd0, css: "#3f7fd0", mult: 1.25, chest: 3 },
  epic: { label: "Épico", color: 0x9b4fd6, css: "#9b4fd6", mult: 1.5, chest: 8 },
  legendary: { label: "Lendário", color: 0xf2b632, css: "#f2b632", mult: 2, chest: 25 },
};

export interface HeroData {
  id: string;
  name: string;
  rarity: Rarity;
  power: number; // 1..5 -> alcance da bomba
  speed: number; // multiplicador de velocidade
  maxStamina: number;
  stamina: number; // cada bomba gasta 1
}

const KEY = "bomber-idle:v1";

function load(): { pending: number; chests: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const saved = load();

export const store = {
  pending: saved?.pending ?? 0, // pontos de teste (ainda sem blockchain)
  chests: saved?.chests ?? 0,
  heroes: [
    { id: "h1", name: "Pip", rarity: "common", power: 1, speed: 1.0, maxStamina: 8, stamina: 8 },
    { id: "h2", name: "Tuco", rarity: "rare", power: 3, speed: 1.2, maxStamina: 10, stamina: 10 },
    { id: "h3", name: "Nina", rarity: "epic", power: 4, speed: 1.5, maxStamina: 12, stamina: 12 },
    { id: "h4", name: "Rex", rarity: "legendary", power: 5, speed: 1.8, maxStamina: 15, stamina: 15 },
  ] as HeroData[],
  status: {} as Record<string, string>,
};

export function addReward(value: number) {
  store.pending = Math.round((store.pending + value) * 100) / 100;
  store.chests += 1;
  try {
    localStorage.setItem(KEY, JSON.stringify({ pending: store.pending, chests: store.chests }));
  } catch {
    /* sem storage: ignora */
  }
}

export function refillAll() {
  store.heroes.forEach((h) => (h.stamina = h.maxStamina));
}
