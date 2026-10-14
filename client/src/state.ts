export type Rarity = "common" | "rare" | "epic" | "mythic" | "legendary" | "supreme";

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "mythic", "legendary", "supreme"];

/**
 * mult   = multiplicador de recompensa do heroi dessa raridade
 * chest  = valor base do bau dessa raridade
 * weight = chance relativa de um bau dessa raridade aparecer
 */
export const RARITIES: Record<
  Rarity,
  { label: string; color: number; css: string; mult: number; chest: number; weight: number }
> = {
  common: { label: "Comum", color: 0x8fa6c4, css: "#8fa6c4", mult: 1, chest: 1, weight: 55 },
  rare: { label: "Raro", color: 0x2ea8ff, css: "#2ea8ff", mult: 1.25, chest: 3, weight: 25 },
  epic: { label: "Épico", color: 0xb45cff, css: "#b45cff", mult: 1.5, chest: 8, weight: 11 },
  mythic: { label: "Mítico", color: 0xff3d8b, css: "#ff3d8b", mult: 1.9, chest: 15, weight: 6 },
  legendary: { label: "Lendário", color: 0xffb020, css: "#ffb020", mult: 2.4, chest: 25, weight: 2.5 },
  supreme: { label: "Super Lendário", color: 0xfff0a8, css: "#ffe9a0", mult: 3.2, chest: 60, weight: 0.5 },
};

/** Habilidade unica de cada heroi (todos os campos numericos sao opcionais). */
export interface Perk {
  name: string;
  desc: string;
  regen?: number; // multiplicador de regeneracao de stamina ao descansar
  crit?: number; // chance (0..1) de recompensa em dobro ao abrir bau
  range?: number; // alcance extra da bomba
  refund?: number; // chance (0..1) de a bomba nao gastar stamina
}

export interface HeroData {
  id: string;
  name: string;
  title: string;
  klass: string;
  gear: string;
  stats: [string, string][]; // atributos exibidos na ficha
  lore: string;
  rarity: Rarity;
  perk: Perk;
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

/** Esquadrao inicial: os 6 NFTs, um de cada raridade. Os ids casam com os arquivos em public/nft/. */
export const store = {
  pending: saved?.pending ?? 0, // pontos de teste (ainda sem blockchain)
  chests: saved?.chests ?? 0,
  heroes: [
    {
      id: "lyra", name: "Lyra", title: "Bio-Mecânica", klass: "Cypher Operator",
      gear: "Visor de plasma | Ferramenta", rarity: "common",
      stats: [["INTEL", "90"], ["REPARO", "95"]],
      lore: "Conserta o que a cidade descarta. Mantém o esquadrão de pé com solda de plasma e teimosia.",
      perk: { name: "Reparo Rápido", desc: "Recupera stamina 2,5x mais rápido.", regen: 2.5 },
      power: 1, speed: 1.0, maxStamina: 8, stamina: 8,
    },
    {
      id: "jax", name: "Jax", title: "Street Samurai", klass: "Cyborg",
      gear: "Armadura samurai | Katanas de plasma", rarity: "rare",
      stats: [["AGILIDADE", "96"], ["CORPO A CORPO", "98"]],
      lore: "Ex-ronin dos becos de neon. Corta o ruído da rede com duas lâminas e nenhuma pressa.",
      perk: { name: "Corte Duplo", desc: "25% de chance de recompensa em dobro.", crit: 0.25 },
      power: 3, speed: 1.3, maxStamina: 10, stamina: 10,
    },
    {
      id: "titan", name: "Titan", title: "Heavy Pilot", klass: "Tank Pilot",
      gear: "Armadura pesada | Manetes de controle", rarity: "epic",
      stats: [["DEFESA", "99"], ["PODER", "88"]],
      lore: "Piloto de mecha pesado. Onde ele pisa, o quarteirão inteiro vira entulho.",
      perk: { name: "Carga Pesada", desc: "+1 de alcance nas bombas.", range: 1 },
      power: 4, speed: 1.2, maxStamina: 14, stamina: 14,
    },
    {
      id: "vex", name: "Vex", title: "Neural Hacker", klass: "Cypher Operator",
      gear: "Visor neural | Data deck", rarity: "mythic",
      stats: [["INTEL", "99"], ["VELOCIDADE", "86"]],
      lore: "Invade sistemas antes que acordem. Cada bomba dele já nasce com a senha do cofre.",
      perk: { name: "Hack Neural", desc: "35% de chance de a bomba não gastar stamina.", refund: 0.35 },
      power: 3, speed: 1.6, maxStamina: 12, stamina: 12,
    },
    {
      id: "kira", name: "Kira", title: "Sleek Rogue", klass: "Stealth Android",
      gear: "Lâmina integrada | Data-shuriken", rarity: "legendary",
      stats: [["VELOCIDADE", "95"], ["AGILIDADE", "98"]],
      lore: "Androide furtiva da Gênese. Aparece, corta, some — e o baú já está aberto.",
      perk: { name: "Sombra Veloz", desc: "20% de recompensa em dobro e 15% de bomba grátis.", crit: 0.2, refund: 0.15 },
      power: 4, speed: 2.1, maxStamina: 14, stamina: 14,
    },
    {
      id: "orion", name: "Orion", title: "Supreme Divinity", klass: "Divine",
      gear: "Cajado solar | Armadura de ouro", rarity: "supreme",
      stats: [["INTEL", "∞"], ["PODER", "ONIPOTENTE"]],
      lore: "Guardião dourado da rede. O valor eterno ao redor do qual todos os outros heróis orbitam.",
      perk: {
        name: "Onipotência", desc: "Regen 2x, +1 de alcance, 30% de recompensa em dobro e 20% de bomba grátis.",
        regen: 2, range: 1, crit: 0.3, refund: 0.2,
      },
      power: 5, speed: 2.1, maxStamina: 18, stamina: 18,
    },
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

/** Sorteia a raridade de um bau conforme os pesos. */
export function rollChestRarity(): Rarity {
  const total = RARITY_ORDER.reduce((s, r) => s + RARITIES[r].weight, 0);
  let n = Math.random() * total;
  for (const r of RARITY_ORDER) {
    n -= RARITIES[r].weight;
    if (n < 0) return r;
  }
  return "common";
}

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
