// IA dos BOMBERS: campo de distancias (BFS unico por decisao), candidatos a alvo, escolha com permanencia,
// lista negra de alvos inalcancaveis, deteccao de operador preso e checagem de fuga antes de plantar bomba.
// Modulo puro e deterministico (o acaso entra por parametro).
import { AI_TUNING, AI_WEIGHTS, BALANCE, TIER } from "./bomberConfig";
import type { BomberClass, CellTarget, WorldView } from "./bomberTypes";

export const DIRS4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const cellKey = (x: number, y: number) => `${x},${y}`;

export interface Field { w: number; h: number; sx: number; sy: number; dist: Int16Array; prev: Int16Array }

/** BFS a partir de (sx, sy). A celula inicial sempre vale; as demais so entram se `passable`. dist = -1: inalcancavel. */
export function bfsField(w: number, h: number, sx: number, sy: number, passable: (x: number, y: number) => boolean): Field {
  const dist = new Int16Array(w * h).fill(-1), prev = new Int16Array(w * h).fill(-1);
  const q = new Int16Array(w * h);
  let head = 0, tail = 0;
  const s = sy * w + sx;
  dist[s] = 0; q[tail++] = s;
  while (head < tail) {
    const cur = q[head++], x = cur % w, y = (cur - x) / w;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1 || !passable(nx, ny)) continue;
      dist[ni] = dist[cur] + 1; prev[ni] = cur; q[tail++] = ni;
    }
  }
  return { w, h, sx, sy, dist, prev };
}
export const distAt = (f: Field, x: number, y: number) => (x < 0 || y < 0 || x >= f.w || y >= f.h ? -1 : f.dist[y * f.w + x]);

/** Caminho (sem a celula inicial) ate (x, y). [] se ja esta la; null se inalcancavel. */
export function pathTo(f: Field, x: number, y: number): [number, number][] | null {
  if (distAt(f, x, y) < 0) return null;
  const out: [number, number][] = [];
  let i = y * f.w + x;
  while (i !== f.sy * f.w + f.sx) { const cx = i % f.w; out.push([cx, (i - cx) / f.w]); i = f.prev[i]; if (i < 0) return null; }
  return out.reverse();
}

// ---------- candidatos ----------
export interface CandidateOpts { detectRadius: number; dmgChest: number; dmgEnemy: number; dmgBlock: number; dmgBlockResistant: number; resistantHp: number; rewardScale: number }

/** Monta os alvos atacaveis: so os que estao fora de zonas de bomba e tem uma celula de ataque alcancavel. */
export function buildCandidates(view: WorldView, f: Field, o: CandidateOpts): CellTarget[] {
  const targetKeys = new Set<string>();
  for (const c of view.chests) if (!view.danger.has(cellKey(c.x, c.y))) targetKeys.add(cellKey(c.x, c.y));
  for (const e of view.enemies) if (!view.danger.has(cellKey(e.x, e.y))) targetKeys.add(cellKey(e.x, e.y));
  for (const b of view.blocks) if (!view.danger.has(cellKey(b.x, b.y))) targetKeys.add(cellKey(b.x, b.y));

  const stand = (tx: number, ty: number) => {
    let best: { x: number; y: number; d: number; adj: number } | null = null;
    for (const [dx, dy] of DIRS4) {
      const x = tx + dx, y = ty + dy, d = distAt(f, x, y);
      if (d < 0) continue;
      let adj = 0;
      for (const [ax, ay] of DIRS4) if (targetKeys.has(cellKey(x + ax, y + ay))) adj++;
      if (!best || d < best.d || (d === best.d && adj > best.adj)) best = { x, y, d, adj };
    }
    return best;
  };
  const hitsFor = (hp: number, dmg: number) => Math.max(1, Math.ceil(hp / Math.max(1, dmg)));
  const out: CellTarget[] = [];

  for (const c of view.chests) {
    if (view.danger.has(cellKey(c.x, c.y))) continue;
    const s = stand(c.x, c.y); if (!s) continue;
    const seen = Math.hypot(c.x - f.sx, c.y - f.sy) <= o.detectRadius;
    out.push({ id: `c:${c.x},${c.y}`, kind: "chest", tx: c.x, ty: c.y, sx: s.x, sy: s.y, dist: s.d, hp: c.hp, maxHp: c.maxHp,
      value: seen ? c.base : BALANCE.avgChestBase, hits: hitsFor(c.hp, o.dmgChest), resistant: true, mvp: false, adjTargets: s.adj, label: c.label });
  }
  for (const e of view.enemies) {
    if (view.danger.has(cellKey(e.x, e.y))) continue;
    const s = stand(e.x, e.y); if (!s) continue;
    out.push({ id: `e:${e.id}`, kind: "enemy", tx: e.x, ty: e.y, sx: s.x, sy: s.y, dist: s.d, hp: e.hp, maxHp: e.maxHp,
      value: e.reward / o.rewardScale, hits: hitsFor(e.hp, o.dmgEnemy), resistant: false, mvp: e.mvp, adjTargets: s.adj, label: e.mvp ? "MVP" : "inimigo" });
  }
  for (const b of view.blocks) {
    if (view.danger.has(cellKey(b.x, b.y))) continue;
    const s = stand(b.x, b.y); if (!s) continue;
    const res = b.maxHp >= o.resistantHp;
    out.push({ id: `b:${b.x},${b.y}`, kind: "block", tx: b.x, ty: b.y, sx: s.x, sy: s.y, dist: s.d, hp: b.hp, maxHp: b.maxHp,
      value: view.dropChance * BALANCE.avgChestBase, hits: hitsFor(b.hp, res ? o.dmgBlockResistant : o.dmgBlock), resistant: res, mvp: false, adjTargets: s.adj, label: "bloco" });
  }
  return out;
}

/** Utilidade de um alvo. A categoria (baus > inimigos > blocos) domina, como na 1.7.1; os pesos da classe decidem DENTRO dela. */
export function scoreCandidate(cls: BomberClass, c: CellTarget, staminaRatio: number): number {
  const w = AI_WEIGHTS[cls];
  const resistant = c.kind !== "chest" && c.resistant && staminaRatio >= 0.4 ? 1 : c.kind === "chest" && staminaRatio >= 0.4 ? 0.5 : 0;
  return TIER[c.kind]
    + w.value * (c.value / (1 + 0.25 * c.hits))
    - w.dist * c.dist
    + w.resistant * resistant
    + w.finish * (c.hits <= 1 ? 1 : 0)
    + w.cluster * Math.min(3, c.adjTargets)
    + w.mvp * (c.mvp ? 1 : 0)
    + (c.kind === "enemy" && c.dist <= w.huntRange ? w.enemyBonus : 0); // cacador (Kai): inimigo proximo vale mais que um bau
}

// ---------- estado de decisao por operador ----------
export interface AIState {
  lockId: string | null; lockSince: number; lockKind: CellTarget["kind"] | null;
  bestDist: number; noProgress: number;
  black: Map<string, number>;
  trail: number[];
  unsafeStreak: number;
}
export const newAIState = (): AIState => ({ lockId: null, lockSince: 0, lockKind: null, bestDist: Infinity, noProgress: 0, black: new Map(), trail: [], unsafeStreak: 0 });
export function resetAI(st: AIState) { st.lockId = null; st.lockKind = null; st.bestDist = Infinity; st.noProgress = 0; st.black.clear(); st.trail.length = 0; st.unsafeStreak = 0; }

export function blacklist(st: AIState, id: string, now: number, ms: number = AI_TUNING.blacklistMs) {
  st.black.set(id, now + ms);
  if (st.black.size > AI_TUNING.blacklistCap) {
    const oldest = [...st.black.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) st.black.delete(oldest[0]);
  }
  if (st.lockId === id) { st.lockId = null; st.lockKind = null; st.bestDist = Infinity; st.noProgress = 0; }
}

/**
 * Escolhe o alvo. Mantem o alvo travado enquanto ele existir e nao houver motivo relevante:
 * (a) apareceu algo de categoria superior (ex.: um bau novo enquanto quebrava bloco) ou
 * (b) outro alvo da mesma categoria e MUITO melhor (margem) depois do tempo minimo de permanencia, e o atual nao esta ao alcance do golpe.
 */
export function chooseTarget(st: AIState, cands: CellTarget[], now: number, cls: BomberClass, staminaRatio: number): CellTarget | null {
  if (st.black.size) for (const [k, until] of st.black) if (until <= now) st.black.delete(k);
  let best: CellTarget | null = null, bestU = -Infinity, locked: CellTarget | null = null, lockedU = -Infinity;
  for (const c of cands) {
    if (st.black.has(c.id)) continue;
    const u = scoreCandidate(cls, c, staminaRatio);
    if (u > bestU) { bestU = u; best = c; }
    if (c.id === st.lockId) { locked = c; lockedU = u; }
  }
  if (!best) { st.lockId = null; st.lockKind = null; return null; }
  let pick = best;
  if (locked && best.id !== locked.id) {
    const higherTier = TIER[best.kind] > TIER[locked.kind];
    const muchBetter = bestU - lockedU >= AI_TUNING.switchMargin && now - st.lockSince >= AI_TUNING.minHoldMs && locked.dist > 0;
    if (!higherTier && !muchBetter) pick = locked;
  }
  if (pick.id !== st.lockId) { st.lockId = pick.id; st.lockKind = pick.kind; st.lockSince = now; st.bestDist = pick.dist; st.noProgress = 0; }
  return pick;
}

/** Acompanha se o operador esta mesmo chegando ao alvo. Depois de N decisoes sem se aproximar, o alvo vai para a lista negra. */
export function reportProgress(st: AIState, c: CellTarget, now: number): "ok" | "abandon" {
  if (c.dist === 0 || c.dist < st.bestDist) { st.bestDist = c.dist; st.noProgress = 0; return "ok"; }
  if (++st.noProgress >= AI_TUNING.noProgressLimit) { blacklist(st, c.id, now); return "abandon"; }
  return "ok";
}

/** Preso = as ultimas decisoes de movimento passaram por muito poucas celulas (oscilacao ou parado). */
export function recordMove(st: AIState, x: number, y: number, w: number): boolean {
  st.trail.push(y * w + x);
  if (st.trail.length > AI_TUNING.trailLen) st.trail.shift();
  return st.trail.length >= AI_TUNING.trailLen && new Set(st.trail).size <= AI_TUNING.trailMaxUnique;
}
/** Atacar/agir no lugar nao e estar preso. */
export const recordAction = (st: AIState) => { st.trail.length = 0; };

export function unstickStep(rng: () => number, options: [number, number][]): [number, number] | null {
  return options.length ? options[Math.min(options.length - 1, Math.floor(rng() * options.length))] : null;
}

/** Depois de plantar a bomba em (sx, sy), existe uma celula fora de perigo a ate maxSteps passos? */
export function hasEscape(w: number, h: number, sx: number, sy: number, passable: (x: number, y: number) => boolean, unsafe: (x: number, y: number) => boolean, maxSteps: number): boolean {
  const seen = new Set<number>([sy * w + sx]);
  let frontier: [number, number][] = [[sx, sy]];
  for (let step = 1; step <= maxSteps && frontier.length; step++) {
    const next: [number, number][] = [];
    for (const [x, y] of frontier) for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(ny * w + nx) || !passable(nx, ny)) continue;
      if (!unsafe(nx, ny)) return true;
      seen.add(ny * w + nx); next.push([nx, ny]);
    }
    frontier = next;
  }
  return false;
}
/** Quantos passos o operador consegue dar antes do pavio acabar. */
export const escapeSteps = (stepMs: number) => Math.max(1, Math.min(6, Math.floor((BALANCE.bombFuseMs - BALANCE.escapeMarginMs) / Math.max(1, stepMs))));
