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
  speed: number; // multiplicador de velocidade
  maxStamina: number;
  stamina: number; // cada bomba gasta 1
  regen: number; // stamina recuperada por tick de descanso
  luck: number; // desloca a raridade dos baus para cima
  chestMult: number; // multiplicador do valor dos baus
  melee: boolean; // quebra blocos adjacentes sem bomba
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

const hero = (h: Omit<HeroData, "stamina">): HeroData => ({ ...h, stamina: h.maxStamina });

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

/** Estado de selecao de mapa: "auto" avanca para o proximo mapa ao limpar o atual. */
export const mapState = { index: 0, auto: true, request: null as number | null };
