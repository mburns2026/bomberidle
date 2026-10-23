// Smoke test da FarmScene SEM navegador: roda a cena real (src/scenes/FarmScene.ts) com um mock do Phaser
// (test/smoke/phaser-mock.cjs), relogio simulado e 15 operadores. Nao e parte do `npm test`: rode `npm run smoke`.
// Variaveis: FRAMES (padrao 20000), LVL (nivel dos operadores), MAP/INST (onde comecar), BRIEF=1 (resumo de uma linha).
// Limite: valida a logica da cena (sem excecoes, invariantes, vazamentos, economia), NAO a renderizacao nem a API real do Phaser.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
const mockUrl = pathToFileURL(new URL("./phaser-mock.cjs", import.meta.url).pathname).href;
registerHooks({ resolve(spec, ctx, next) { return spec === "phaser" ? { url: mockUrl, shortCircuit: true, format: "commonjs" } : next(spec, ctx); } });
import assert from "node:assert/strict";
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
const rar = ["common", "rare", "epic", "mythic", "legendary", "super"];
const LVL = Number(process.env.LVL ?? 30);
mem.set("bomber-idle:v1", JSON.stringify({ pending: 0, chests: 0, wk: true, owned: Array.from({ length: 15 }, (_, i) => ({ r: rar[i % 6], n: i + 1, xp: 0, lv: LVL, up: { stamina: 2, speed: 1, luck: 0 }, j: { s: 0, v: 0, l: 0 }, w: 1 })), map: { i: Number(process.env.MAP ?? 0), n: Number(process.env.INST ?? 1), a: true } }));

const P: any = (await import("phaser")).default;
const st = await import("../../src/state.ts");
const { FarmScene } = await import("../../src/scenes/FarmScene.ts");
const ab = await import("../../src/game/bomberAbilities.ts");

const timers: { at: number; cb: () => void }[] = [];
const loops: { every: number; next: number; cb: () => void }[] = [];
const sc: any = new FarmScene();
let nowMs = 0;
sc.add = { image: (x: number, y: number, tex: string) => P.__go({ x, y, texture: tex }), sprite: (x: number, y: number, tex: string) => P.__go({ x, y, texture: tex }),
  rectangle: (x: number, y: number) => P.__go({ x, y }), text: (x: number, y: number) => P.__go({ x, y }), particles: (x: number, y: number) => P.__go({ x, y }), graphics: () => P.__go() };
sc.make = { graphics: () => P.__go() };
sc.textures = { exists: () => false };
sc.anims = { create() {} };
sc.renderer = { type: 0 };
sc.events = { once() {} };
sc.cameras = { main: P.__go({ postFX: P.__go() }) };
sc.tweens = { add(cfg: any) { P.__stats.tweens++; if (cfg.onComplete && !cfg.repeat) timers.push({ at: nowMs + (cfg.duration ?? 0), cb: cfg.onComplete }); }, killTweensOf() {} };
sc.time = { get now() { return nowMs; }, delayedCall(ms: number, cb: () => void) { timers.push({ at: nowMs + ms, cb }); }, addEvent(c: any) { loops.push({ every: c.delay, next: c.delay, cb: c.callback }); } };

sc.create();
assert.equal(sc.heroes.length, 15, "15 operadores em campo");
const frames = Number(process.env.FRAMES ?? 20000), DT = 16;
let worst = 0, total = 0, maxBombs = 0, mapChanges = 0, lastMap = `${st.mapState.index}/${st.mapState.instance}`;
const statuses = new Set<string>();
const t0 = performance.now();
for (let f = 0; f < frames; f++) {
  nowMs += DT;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= nowMs) { const t = timers.splice(i, 1)[0]; t.cb(); }
  for (const l of loops) if (nowMs >= l.next) { l.next += l.every; l.cb(); st.economyTick(); }
  const a = performance.now(); sc.update(nowMs, DT); const d = performance.now() - a; worst = Math.max(worst, d); total += d;
  maxBombs = Math.max(maxBombs, sc.bombs.size);
  const mk = `${st.mapState.index}/${st.mapState.instance}`; if (mk !== lastMap) { mapChanges++; lastMap = mk; }
  if (f % 60 === 0) {
    for (const h of st.store.collection) {
      assert.ok(Number.isFinite(h.stamina) && h.stamina >= 0 && h.stamina <= h.maxStamina + 1e-9, `stamina ${h.name}: ${h.stamina}`);
      assert.ok(Number.isFinite(h.xp) && Number.isFinite(h.level));
      statuses.add((st.store.status[h.id] ?? "").replace(/:.*/, ""));
    }
    assert.ok(Number.isFinite(st.store.pending) && st.store.pending >= 0);
    for (const h of sc.heroes) { assert.ok(inb(h.gx, h.gy), `fora do mapa ${h.gx},${h.gy}`); assert.ok(sc.grid[h.gy][h.gx] === 0, `heroi dentro de bloco ${h.gx},${h.gy}`); }
    for (const [k, b] of sc.bombs) assert.equal(k, `${b.gx},${b.gy}`);
  }
}
function inb(x: number, y: number) { return x >= 0 && y >= 0 && x < 29 && y < 17; }
const ms = performance.now() - t0;
const live = P.__stats.created - P.__stats.destroyed;
const stats = Object.fromEntries(st.store.collection.map((h: any) => [h.name, h.stats]));
const chestsCreated = Object.entries(P.__stats.byTex).filter(([k]) => k.startsWith("chest_")).reduce((s, [, n]) => s + (n as number), 0);
if (process.env.BRIEF) { const d = st.store.daily; console.log(JSON.stringify({ scene: process.env.SCENE ?? "new", blocks: d.blocks, bombs: d.bombs, chests: st.store.chests, pending: Math.round(st.store.pending), mapChanges, finalMap: lastMap, live })); process.exit(0); }
console.log(JSON.stringify({
  simulatedSeconds: Math.round(frames * DT / 1000), wallMs: Math.round(ms), avgUpdateMs: +(total / frames).toFixed(3), worstUpdateMs: +worst.toFixed(2),
  mapChanges, finalMap: lastMap, pending: st.store.pending, chestsOpened: st.store.chests, chestSpritesCreated: chestsCreated, maxBombs,
  createdObjects: P.__stats.created, destroyedObjects: P.__stats.destroyed, liveObjects: live, tweens: P.__stats.tweens,
  fxImagesPooled: sc.fx.allImg.length, fxTextsPooled: sc.fx.allTxt.length, holo: sc.holo.length, statuses: [...statuses].sort(), stats,
}, null, 1));
assert.ok(st.store.chests <= chestsCreated, "nenhum bau pago mais de uma vez");
assert.ok(Object.values(stats).every((x: any) => Object.values(x).every((v) => Number.isFinite(v as number))), "estatisticas finitas");
console.log("SMOKE OK");
