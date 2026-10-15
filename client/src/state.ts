export type Rarity = "common" | "rare" | "epic" | "mythic" | "legendary" | "super";

// chest = valor base do bau dessa raridade; hp = vida do bau (quanto mais raro, mais dificil); mult = multiplicador do operador dessa raridade
export const RARITIES: Record<Rarity, { label: string; color: number; css: string; mult: number; chest: number; hp: number }> = {
  common: { label: "Comum", color: 0x8d99a6, css: "#8d99a6", mult: 1, chest: 1, hp: 10 },
  rare: { label: "Raro", color: 0x3fa2ff, css: "#3fa2ff", mult: 1.1, chest: 2, hp: 20 },
  epic: { label: "Épico", color: 0x9b5cff, css: "#9b5cff", mult: 1.25, chest: 4, hp: 40 },
  mythic: { label: "Mítico", color: 0xff3fa4, css: "#ff3fa4", mult: 1.5, chest: 8, hp: 80 },
  legendary: { label: "Lendário", color: 0xffb830, css: "#ffb830", mult: 1.8, chest: 16, hp: 160 },
  super: { label: "Super lendário", color: 0xfff1b8, css: "#fff1b8", mult: 2.5, chest: 40, hp: 320 },
};
export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "mythic", "legendary", "super"];
const rank = (r: Rarity) => RARITY_ORDER.indexOf(r);

// ---------- economia (valores de teste; ajuste aqui) ----------
export const REWARD_SCALE = 100; // multiplica o valor dos baus, missoes e custos
export const CAPSULE_PRICE = 30000; // $BOMBERSI por Capsula de Recruta
export const MAX_COLLECTION = 500; // operadores que cada carteira pode possuir
export const MAX_WORKING = 15; // operadores trabalhando ao mesmo tempo
export const START_BALANCE = 60000; // saldo de teste de um save novo (2 capsulas)
export const OUTSIDE_RATE = 0.1; // stamina por segundo de quem descansa fora de alojamento
export type LodgeKind = "casulo" | "modulo" | "torre";
export const LODGING: Record<LodgeKind, { label: string; cap: number; rate: number; price: number | null }> = {
  casulo: { label: "Casulo", cap: 3, rate: 0.25, price: 150000 }, // rate = stamina por segundo
  modulo: { label: "Módulo", cap: 5, rate: 0.5, price: 600000 },
  torre: { label: "Torre", cap: 8, rate: 1, price: null }, // paga em $ASG: em breve
};
export const MAX_LODGINGS = 20; // alojamentos por carteira
export const BUTLER_PRICE = 1000000; // Droide Zelador (demo em $BOMBERSI)
export const WORK_MIN = 0.3; // "Enviar todos" so leva quem tem 30%+ de stamina
export const BUTLER_REST_AT = 0.15; // Zelador recolhe quem cai abaixo de 15%
export const BUTLER_WORK_AT = 0.8; // e devolve ao trabalho quem chega a 80%
/** Dano de uma bomba nos baus: cresce com o poder e o nivel do operador. */
export const bombDamage = (d: { power: number; level: number }) => Math.round(8 + 2 * d.power + 0.4 * (d.level - 1));
/** Chances (%) da Capsula de Recruta. Soma 100. */
export const CAPSULE_ODDS: Record<Rarity, number> = { common: 55, rare: 24, epic: 12, mythic: 6, legendary: 2.5, super: 0.5 };

export interface Jitter { s: number; v: number; l: number } // variacao individual: stamina, velocidade, sorte

export interface HeroData {
  id: string;
  serial: number;
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
  jitter: Jitter;
}

export type UpKey = "stamina" | "speed" | "luck";
export const UP_MAX = 10;
const MAX_LEVEL = 30;

interface Daily { day: string; blocks: number; bombs: number; chests: number; maps: string[]; claimed: string[] }
interface SavedOp { r: Rarity; n: number; xp: number; lv: number; up: { stamina: number; speed: number; luck: number }; j: Jitter; w?: 1 }
interface Saved {
  pending: number; chests: number;
  owned?: SavedOp[]; serial?: number; wk?: boolean;
  lodging?: Record<LodgeKind, number>; butler?: { owned: boolean; on: boolean };
  heroes?: Record<string, { xp: number; level: number; up: { stamina: number; speed: number; luck: number } }>; // formato antigo (<1.6)
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

// ---------- modelos de operador: um por raridade ----------
interface Arch { key: string; name: string; role: string; portrait: string; power: number; speed: number; maxStamina: number; regen: number; luck: number; chestMult: number; melee: boolean }
export const ARCH: Record<Rarity, Arch> = {
  common: { key: "lyra", name: "Lyra", role: "Bio-mecânica: recupera stamina rápido", portrait: "nft/lyra.jpg", power: 1, speed: 1.0, maxStamina: 8, regen: 0.3, luck: 0, chestMult: 1, melee: false },
  rare: { key: "titan", name: "Titan", role: "Piloto tanque: bomba grande, lento", portrait: "nft/titan.jpg", power: 5, speed: 0.8, maxStamina: 14, regen: 0.12, luck: 0, chestMult: 1, melee: false },
  epic: { key: "vex", name: "Vex", role: "Hacker: atrai baús mais raros", portrait: "nft/vex.jpg", power: 3, speed: 1.3, maxStamina: 10, regen: 0.12, luck: 1, chestMult: 1, melee: false },
  mythic: { key: "kira", name: "Kira", role: "Android furtiva: a mais veloz", portrait: "nft/kira.jpg", power: 2, speed: 2.0, maxStamina: 12, regen: 0.12, luck: 0.3, chestMult: 1, melee: false },
  legendary: { key: "jax", name: "Jax", role: "Samurai: corta blocos sem bomba", portrait: "nft/jax.jpg", power: 3, speed: 1.7, maxStamina: 12, regen: 0.15, luck: 0.5, chestMult: 1, melee: true },
  super: { key: "orion", name: "Orion", role: "Divino: todos os bônus, baús x2", portrait: "nft/orion.jpg", power: 5, speed: 1.8, maxStamina: 20, regen: 0.25, luck: 1.5, chestMult: 2, melee: false },
};

const noJitter = (): Jitter => ({ s: 0, v: 0, l: 0 });
const rollJitter = (): Jitter => ({ s: Math.floor(Math.random() * 4) - 1, v: r2((Math.random() - 0.5) * 0.2), l: r2(Math.random() * 0.2) });

function build(r: Rarity, n: number, j: Jitter, lv = 1, xp = 0, up = { stamina: 0, speed: 0, luck: 0 }): HeroData {
  const a = ARCH[r];
  const d: HeroData = {
    id: `op${n}`, serial: n, name: `${a.name} #${n}`, rarity: r, role: a.role, portrait: a.portrait,
    power: a.power, speed: a.speed, maxStamina: a.maxStamina, stamina: 0, regen: a.regen, luck: a.luck,
    chestMult: a.chestMult, melee: a.melee, level: lv, xp, up: { ...up },
    base: { maxStamina: a.maxStamina + j.s, speed: r2(a.speed * (1 + j.v)), luck: r2(a.luck + j.l) },
    jitter: j,
  };
  applyStats(d);
  d.stamina = d.maxStamina;
  return d;
}

function initialOwned(): HeroData[] {
  if (saved?.owned?.length) return saved.owned.map((o) => build(o.r, o.n, o.j, o.lv, o.xp, o.up));
  if (saved?.heroes) {
    // migracao: os 6 operadores fixos das versoes anteriores viram operadores #1..#6 com o progresso preservado
    const out: HeroData[] = [];
    RARITY_ORDER.forEach((r, i) => {
      const s = saved.heroes![ARCH[r].key];
      out.push(build(r, i + 1, noJitter(), s?.level ?? 1, s?.xp ?? 0, s?.up));
    });
    return out;
  }
  return [build("common", 1, rollJitter())]; // operador inicial de um save novo
}

const owned = initialOwned();
const workingIds = new Set<string>(saved?.wk ? (saved.owned ?? []).filter((o) => o.w).map((o) => `op${o.n}`) : []);

export const store = {
  pending: saved ? saved.pending ?? 0 : START_BALANCE, // $BOMBERSI de teste (ainda sem blockchain)
  chests: saved?.chests ?? 0,
  serial: Math.max(saved?.serial ?? 0, ...owned.map((o) => o.serial)) + 1, // proximo numero de operador
  collection: owned, // tudo o que o jogador possui
  heroes: [] as HeroData[], // os que estao trabalhando agora (ate MAX_WORKING)
  lodging: { casulo: 0, modulo: 0, torre: 0, ...(saved?.lodging ?? {}) } as Record<LodgeKind, number>,
  butler: { owned: false, on: true, ...(saved?.butler ?? {}) },
  housed: new Map<string, LodgeKind>(), // quem esta descansando em qual alojamento (recalculado a cada segundo)
  version: 0, // sobe quando a colecao muda (a interface se refaz)
  status: {} as Record<string, string>,
  daily: saved?.daily?.day === today() ? saved.daily : freshDaily(),
};

/** Ordena por raridade (maior primeiro), depois nivel e numero. */
export const sortOps = (list: HeroData[]) =>
  [...list].sort((a, b) => rank(b.rarity) - rank(a.rarity) || b.level - a.level || a.serial - b.serial);

export const isWorking = (h: HeroData) => workingIds.has(h.id);
function syncWorking() {
  const list = sortOps(store.collection.filter((h) => workingIds.has(h.id)));
  store.heroes.length = 0;
  store.heroes.push(...list);
  store.version++;
}
/** Preenche as vagas livres com os melhores operadores descansados (stamina >= 30%). */
export function fillSlots(): number {
  const free = MAX_WORKING - workingIds.size;
  const pick = sortOps(store.collection.filter((h) => !workingIds.has(h.id) && h.stamina >= WORK_MIN * h.maxStamina)).slice(0, Math.max(0, free));
  pick.forEach((h) => workingIds.add(h.id));
  syncWorking();
  return pick.length;
}
if (saved?.wk) syncWorking(); else fillSlots();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      pending: store.pending, chests: store.chests, daily: store.daily, serial: store.serial,
      wk: true, lodging: store.lodging, butler: store.butler,
      owned: store.collection.map((h): SavedOp => ({ r: h.rarity, n: h.serial, xp: h.xp, lv: h.level, up: h.up, j: h.jitter, ...(workingIds.has(h.id) ? { w: 1 as const } : {}) })),
    }));
  } catch {
    /* sem storage: ignora */
  }
}
persist(); // grava ja no formato novo (migracao)
const ensureDay = () => { if (store.daily.day !== today()) store.daily = freshDaily(); };

/** Bau aberto: soma $BOMBERSI, XP do operador e progresso das missoes. */
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

// ---------- Capsula de Recruta ----------
// Aviso: no modo demo o sorteio roda no navegador. Com a economia on-chain, o sorteio TEM de rodar no servidor.
function rollCapsule(): Rarity {
  let x = Math.random() * 100;
  for (const r of RARITY_ORDER) { x -= CAPSULE_ODDS[r]; if (x < 0) return r; }
  return "common";
}
/** Compra `count` capsulas. Devolve os operadores novos ou uma mensagem de erro. */
export function buyCapsule(count: number): HeroData[] | string {
  const cost = CAPSULE_PRICE * count;
  if (store.collection.length + count > MAX_COLLECTION) return `Coleção cheia (máx. ${MAX_COLLECTION} operadores)`;
  if (store.pending < cost) return "$BOMBERSI insuficientes";
  store.pending = r2(store.pending - cost);
  const fresh: HeroData[] = [];
  for (let i = 0; i < count; i++) fresh.push(build(rollCapsule(), store.serial++, rollJitter()));
  store.collection.push(...fresh);
  fillSlots();
  persist();
  return fresh;
}

// ---------- trabalho, descanso, alojamentos e Droide Zelador ----------
export function setWorking(h: HeroData, on: boolean): string | null {
  if (on) {
    if (workingIds.size >= MAX_WORKING) return `Limite de ${MAX_WORKING} operadores trabalhando`;
    if (h.stamina < 1) return "Sem stamina: deixe descansar primeiro";
    workingIds.add(h.id);
  } else workingIds.delete(h.id);
  syncWorking();
  persist();
  return null;
}
/** Envia os mais raros descansados (30%+) para as vagas livres. */
export function workAll(): number { const n = fillSlots(); persist(); return n; }
export function restAll(): number { const n = workingIds.size; workingIds.clear(); syncWorking(); persist(); return n; }
export function buyLodging(kind: LodgeKind): string | null {
  const L = LODGING[kind];
  if (L.price === null) return "Disponível em breve (pago em $ASG)";
  const total = store.lodging.casulo + store.lodging.modulo + store.lodging.torre;
  if (total >= MAX_LODGINGS) return `Limite de ${MAX_LODGINGS} alojamentos`;
  if (store.pending < L.price) return "$BOMBERSI insuficientes";
  store.pending = r2(store.pending - L.price);
  store.lodging[kind]++;
  persist();
  return null;
}
export function buyButler(): string | null {
  if (store.butler.owned) return "Você já tem o Droide Zelador";
  if (store.pending < BUTLER_PRICE) return "$BOMBERSI insuficientes";
  store.pending = r2(store.pending - BUTLER_PRICE);
  store.butler.owned = true;
  store.butler.on = true;
  persist();
  return null;
}
export function toggleButler() { store.butler.on = !store.butler.on; persist(); }

/** Roda a cada segundo: Zelador troca quem cansou, e a reserva recupera stamina (mais rapido nos alojamentos). */
export function economyTick() {
  if (store.butler.owned && store.butler.on) {
    let changed = false;
    for (const h of [...store.heroes]) if (h.stamina < BUTLER_REST_AT * h.maxStamina) { workingIds.delete(h.id); changed = true; }
    const free = MAX_WORKING - workingIds.size;
    if (free > 0) {
      const back = sortOps(store.collection.filter((h) => !workingIds.has(h.id) && h.stamina >= BUTLER_WORK_AT * h.maxStamina)).slice(0, free);
      back.forEach((h) => workingIds.add(h.id));
      changed = changed || back.length > 0;
    }
    if (changed) syncWorking();
  }
  const tired = sortOps(store.collection.filter((h) => !workingIds.has(h.id) && h.stamina < h.maxStamina));
  store.housed.clear();
  let i = 0;
  for (const kind of ["torre", "modulo", "casulo"] as LodgeKind[])
    for (let c = 0; c < store.lodging[kind] * LODGING[kind].cap && i < tired.length; c++, i++) store.housed.set(tired[i].id, kind);
  for (const h of tired) {
    const k = store.housed.get(h.id);
    h.stamina = Math.min(h.maxStamina, h.stamina + (k ? LODGING[k].rate : OUTSIDE_RATE));
  }
}

// ---------- melhorias (sumidouro de $BOMBERSI) ----------
export const upgradeCost = (h: HeroData, k: UpKey) => Math.round(100 * REWARD_SCALE * Math.pow(1.5, h.up[k]));
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
  { id: "chests", label: "Abrir 30 baús", goal: 30, reward: 40 * REWARD_SCALE, stat: "chests" },
  { id: "blocks", label: "Quebrar 80 blocos", goal: 80, reward: 30 * REWARD_SCALE, stat: "blocks" },
  { id: "bombs", label: "Plantar 40 bombas", goal: 40, reward: 30 * REWARD_SCALE, stat: "bombs" },
  { id: "maps", label: "Visitar 3 mapas", goal: 3, reward: 60 * REWARD_SCALE, stat: "maps" },
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
  store.collection.forEach((h) => (h.stamina = h.maxStamina));
}

/** Estado de selecao de mapa: "auto" avanca para o proximo mapa ao limpar o atual. */
export const mapState = { index: 0, auto: true, request: null as number | null };
