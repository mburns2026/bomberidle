import Phaser from "phaser";
import { RARITIES, Rarity, HeroData, store, addReward, addEnemyReward, mapState, track, levelMult, REWARD_SCALE, bombDamage, bumpStat } from "../state";
import { makeTextures } from "../art";
import { MAPS, COLS, ROWS, MapDef, INSTANCES_PER_MAP, chestDropChance, blockHp, chestHpMult, enemyHp, mvpHp, hasMvp, mapProgress } from "../maps";
import type { AbilityContext, AbilityDef, AbilityRuntime, BomberClass, CellTarget, WorldView } from "../game/bomberTypes";
import { ABILITY_DEFS, AI_TUNING, BALANCE } from "../game/bomberConfig";
import { activate, auraOf, bomberClass, clearTransient, consumeArmed, decideAbilities, detectRadius, modifiersOf, repairPulse, runtimeOf, setTeamBuff, tickRuntime } from "../game/bomberAbilities";
import { blastCells, bombDamageVs, bombSnapshot, createRng, gainStamina, isResistantBlock, meleeDamage, newCombo, registerHit, rollCrit, spendStamina, type BombSnapshot, type ComboState } from "../game/bomberCombat";
import { blacklist, bfsField, buildCandidates, chooseTarget, escapeSteps, hasEscape, newAIState, pathTo, recordAction, recordMove, reportProgress, resetAI, unstickStep, type AIState } from "../game/bomberAI";
import { FxPool } from "../game/bomberFx";

const T = 32;
const HERO_SCALE = 1.5; // tamanho dos operadores em campo
const HERO_DY = -13 * (HERO_SCALE - 1); // mantem os pes na mesma posicao do tile
const BAR_W = 28;
export const MAP_W = COLS * T;
export const MAP_H = ROWS * T;
export const GAME_W = MAP_W + 2 * T; // borda decorativa de 1 tile
export const GAME_H = MAP_H + 2 * T;

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SPAWNS: [number, number][] = [[0, 0], [COLS - 1, 0], [0, ROWS - 1], [COLS - 1, ROWS - 1], [14, 0], [14, ROWS - 1]];
const key = (x: number, y: number) => `${x},${y}`;
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const CLASS_COLOR: Record<BomberClass, number> = { lyra: 0x55ffb0, titan: 0xff9a3c, vex: 0x39e6ff, kira: 0xdfe8ff, jax: 0xff3fd0, orion: 0xfff1b8 };
const CLASS_CSS: Record<BomberClass, string> = { lyra: "#55ffb0", titan: "#ffb15a", vex: "#7df0ff", kira: "#dfe8ff", jax: "#ff9af0", orion: "#fff1b8" };
const POSE_ATTACK = 4, POSE_BOMB = 5;

interface Runtime {
  data: HeroData; gx: number; gy: number;
  sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image;
  barBg: Phaser.GameObjects.Rectangle; barFg: Phaser.GameObjects.Rectangle; zzz: Phaser.GameObjects.Text;
  pips: Phaser.GameObjects.Image[];
  sleeping: boolean; lastMove: number; nextAt: number;
  cls: BomberClass; ab: AbilityRuntime; ai: AIState; combo: ComboState;
  poseUntil: number; posed: boolean; lastLevel: number; auraFxAt: number; trailAt: number;
}
interface Bomb { gx: number; gy: number; snap: BombSnapshot; luck: number; owner: HeroData; sprite: Phaser.GameObjects.Image }
interface Chest { x: number; y: number; sprite: Phaser.GameObjects.Image; rarity: Rarity; hp: number; maxHp: number; barBg: Phaser.GameObjects.Rectangle; barFg: Phaser.GameObjects.Rectangle }
interface BlockState { x: number; y: number; hp: number; maxHp: number; barBg?: Phaser.GameObjects.Rectangle; barFg?: Phaser.GameObjects.Rectangle }
interface Enemy {
  id: number; gx: number; gy: number; hp: number; maxHp: number; mvp: boolean; reward: number;
  sprite: Phaser.GameObjects.Image; barBg: Phaser.GameObjects.Rectangle; barFg: Phaser.GameObjects.Rectangle;
  nextMoveAt: number;
}

/** Mapa em grade com varios biomas: herois autonomos minerando blocos, abrindo baus e gastando stamina. */
export class FarmScene extends Phaser.Scene {
  private grid: number[][] = []; // 0 livre, 1 casinha, 2 bloco
  private blockSprites: (Phaser.GameObjects.Image | null)[][] = [];
  private mapObjs: Phaser.GameObjects.GameObject[] = [];
  private blocksLeft = 0;
  private chests = new Map<string, Chest>();
  private bombs = new Map<string, Bomb>();
  private heroes: Runtime[] = [];
  private idle = 0;
  private map!: MapDef;
  private dropChance = 0.3;     // chance de bau por bloco quebrado (mapa + instancia)
  private curChestHpMult = 1;   // multiplicador de HP dos baus (mapa + instancia)
  private blocksHp = new Map<string, BlockState>(); // HP de cada bloco destrutivel do mapa atual
  private enemies: Enemy[] = [];
  private ambient?: Phaser.GameObjects.Particles.ParticleEmitter;
  private fx!: FxPool;
  private rng: () => number = Math.random;
  private holo: Phaser.GameObjects.Image[] = [];
  private holoAt = 0;
  private enemySeq = 0;
  private frame = 0;
  private viewFrame = -1;
  private viewCache: WorldView | null = null;

  constructor() { super("farm"); }

  create() {
    makeTextures(this);
    this.makeEnemyTextures();
    this.fx = new FxPool(this);
    this.rng = createRng((Math.random() * 4294967296) >>> 0); // semente aleatoria; os testes usam sementes fixas
    this.cameras.main.setScroll(-T, -T);
    try { if (this.renderer.type === Phaser.WEBGL) this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.3); } catch { /* sem WebGL */ }

    (Object.keys(RARITIES) as Rarity[]).forEach((r) =>
      this.anims.create({ key: `walk_${r}`, frames: [0, 1, 2, 3].map((i) => ({ key: `hero_${r}_${i}` })), frameRate: 9, repeat: -1 })
    );

    store.heroes.forEach((data) => this.addRuntime(data));

    this.buildMap();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.checkRegen() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.holo.forEach((o) => { this.tweens.killTweensOf(o); o.destroy(); }); this.holo = []; this.fx.destroy(); });
  }

  /** Intervalo entre decisoes/passos: 450 ms / velocidade efetiva (com piso, para nunca passar de 1 acao por 80 ms). */
  private stepMs(h: Runtime) {
    return Math.max(BALANCE.minTickMs, BALANCE.baseTickMs / Math.max(0.1, h.data.speed * h.ab.mods.speedMult));
  }

  update(_time: number, delta: number) {
    const now = this.time.now;
    this.frame++;
    for (const h of this.heroes) {
      tickRuntime(h.ab, delta); // recargas e duracoes avancam aqui, em um unico lugar (sem timers por personagem)
      modifiersOf(h.ab, h.data);
      const stepMs = this.stepMs(h);
      if (now >= h.nextAt) { h.nextAt = now + stepMs; this.tick(h); } // ritmo depende da velocidade atual
      const { x, y } = h.sprite;
      h.barBg.setPosition(x, y - 13 * HERO_SCALE - 6);
      h.barFg.setPosition(x - BAR_W / 2, y - 13 * HERO_SCALE - 6);
      h.barFg.width = Math.max(0, BAR_W * (h.data.stamina / h.data.maxStamina));
      h.zzz.setPosition(x + 6, y - 13 * HERO_SCALE - 20).setVisible(h.sleeping);
      h.glow.setPosition(x, y + 9 * HERO_SCALE);
      h.pips.forEach((p, i) => p.setPosition(x - 6 + i * 6, y - 13 * HERO_SCALE - 1));
      h.sprite.setAlpha(h.sleeping ? 0.7 : 1);
      if (h.posed && now >= h.poseUntil) { h.posed = false; h.sprite.setTexture(`hero_${h.data.rarity}_0`); }
      if (!h.posed && h.sprite.anims.isPlaying && (h.sleeping || now - h.lastMove > stepMs * 1.4)) {
        h.sprite.anims.stop();
        h.sprite.setTexture(`hero_${h.data.rarity}_0`);
      }
      if (h.data.level > h.lastLevel) this.levelUpFx(h);
      h.lastLevel = h.data.level;
      // Kira em Impulso deixa um rastro curto de velocidade (efeito leve, no maximo a cada 90 ms)
      if (h.cls === "kira" && (h.ab.active.kira_dash ?? 0) > 0 && now - h.lastMove < stepMs * 1.2 && now - h.trailAt > 90) {
        h.trailAt = now;
        this.fx.image({ texture: "fx_streak", x: x - (h.sprite.flipX ? -10 : 10), y: y + 4, tint: 0x39e6ff, scale: 1, toScale: 0.6, alpha: 0.7, duration: 220, depth: 3.4, flipX: h.sprite.flipX, add: true });
      }
    }
    if (now - this.holoAt > 400) { this.holoAt = now; this.refreshHolo(); }
    this.tickEnemies();
    for (const e of this.enemies) {
      e.barBg.setPosition(e.sprite.x, e.sprite.y - 17);
      e.barFg.setPosition(e.sprite.x - 13, e.sprite.y - 17);
    }
  }

  // ---------- mapa ----------
  private buildMap() {
    const m = (this.map = MAPS[mapState.index]);
    this.dropChance = chestDropChance(mapState.index, mapState.instance);
    this.curChestHpMult = chestHpMult(mapState.index, mapState.instance);
    track.map(m.id);
    this.mapObjs.forEach((o) => { this.tweens.killTweensOf(o); o.destroy(); });
    this.mapObjs = [];
    this.chests.forEach((c) => this.destroyChest(c));
    this.chests.clear();
    this.bombs.forEach((b) => { this.tweens.killTweensOf(b.sprite); b.sprite.destroy(); });
    this.bombs.clear();
    this.enemies.forEach((e) => this.destroyEnemy(e));
    this.enemies = [];
    this.blocksHp.clear();
    this.ambient?.destroy();
    this.blocksLeft = 0;
    this.viewCache = null;
    // troca de mapa: alvos, listas negras e efeitos temporarios deixam de valer (recargas continuam)
    this.heroes.forEach((h) => { resetAI(h.ai); clearTransient(h.ab); h.combo = newCombo(); });

    for (let y = -1; y <= ROWS; y++)
      for (let x = -1; x <= COLS; x++) {
        const inside = x >= 0 && x < COLS && y >= 0 && y < ROWS;
        const px = x * T + T / 2, py = y * T + T / 2;
        this.mapObjs.push(this.add.image(px, py, `${m.id}_floor${inside ? (x * 7 + y * 3) % 3 : 0}`).setDepth(0));
        if (!inside) this.mapObjs.push(this.add.image(px, py, `${m.id}_${(x + y) % 2 === 0 ? "pylon" : "wall"}`).setDepth(1));
      }

    const keep = new Set<string>();
    const mark = (gx: number, gy: number) => { keep.add(key(gx, gy)); DIRS.forEach(([dx, dy]) => keep.add(key(gx + dx, gy + dy))); };
    SPAWNS.forEach(([x, y]) => mark(x, y));
    this.heroes.forEach((h) => mark(h.gx, h.gy));

    this.grid = [];
    this.blockSprites = [];
    for (let y = 0; y < ROWS; y++) {
      this.grid[y] = [];
      this.blockSprites[y] = [];
      for (let x = 0; x < COLS; x++) {
        const px = x * T + T / 2, py = y * T + T / 2;
        const free = keep.has(key(x, y));
        const pillar = !free && m.pillar(x, y);
        const dx = Math.min(x, COLS - 1 - x), dy = Math.min(y, ROWS - 1 - y);
        const block = !pillar && !free && dx + dy > 2 && Math.random() < m.density;
        this.grid[y][x] = pillar ? 1 : block ? 2 : 0;
        this.blockSprites[y][x] = null;
        if (pillar) this.mapObjs.push(this.add.image(px, py, `${m.id}_pillar`).setDepth(1));
        if (block) {
          const s = this.add.image(px, py, `${m.id}_block`).setDepth(1);
          this.blockSprites[y][x] = s;
          this.mapObjs.push(s);
          this.blocksLeft++;
          const maxHp = blockHp(mapState.index, mapState.instance);
          const barBg = this.add.rectangle(px, py - T / 2 + 3, 22, 4, 0x000000, 0.7).setDepth(6).setVisible(false);
          const barFg = this.add.rectangle(px - 11, py - T / 2 + 3, 22, 2, 0xff9a4a).setOrigin(0, 0.5).setDepth(7).setVisible(false);
          this.mapObjs.push(barBg, barFg);
          this.blocksHp.set(key(x, y), { x, y, hp: maxHp, maxHp, barBg, barFg });
        }
      }
    }

    this.spawnEnemies();

    // clima do bioma: polen, areia, neve, brasas ou vagalumes
    this.ambient = this.add.particles(0, 0, "spark", {
      x: { min: 0, max: MAP_W }, y: { min: 0, max: MAP_H }, lifespan: 5000,
      speedY: m.fall ? { min: 15, max: 30 } : { min: -25, max: -8 }, speedX: { min: -8, max: 8 },
      scale: { start: 0.7, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: m.ambient, quantity: 1, frequency: 260,
    }).setDepth(7);
  }

  // ---------- inimigos ----------
  private makeEnemyTextures() {
    if (this.textures.exists("enemy_mob")) return;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(12, 13, 10);
    g.fillStyle(0x1a1a1a, 1);
    g.fillCircle(8, 11, 2);
    g.fillCircle(16, 11, 2);
    g.fillStyle(0x1a1a1a, 0.5);
    g.fillRect(6, 20, 12, 2);
    g.generateTexture("enemy_mob", 24, 24);
    g.clear();

    g.fillStyle(0xffffff, 1);
    g.fillCircle(18, 19, 15);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x1 = 18 + Math.cos(a) * 15, y1 = 19 + Math.sin(a) * 15;
      const x2 = 18 + Math.cos(a) * 22, y2 = 19 + Math.sin(a) * 22;
      const perp = a + Math.PI / 2;
      g.fillTriangle(x1 + Math.cos(perp) * 2.5, y1 + Math.sin(perp) * 2.5, x1 - Math.cos(perp) * 2.5, y1 - Math.sin(perp) * 2.5, x2, y2);
    }
    g.fillStyle(0x1a1a1a, 1);
    g.fillCircle(12, 17, 3);
    g.fillCircle(24, 17, 3);
    g.generateTexture("enemy_mvp", 36, 36);
    g.destroy();
  }

  /** Posiciona os inimigos deste mapa+instancia: alguns comuns, e um MVP so na instancia 33. */
  private spawnEnemies() {
    const mi = mapState.index, inst = mapState.instance;
    const free: [number, number][] = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (this.grid[y][x] === 0 && !this.heroes.some((h) => h.gx === x && h.gy === y)
          && !SPAWNS.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) <= 2))
          free.push([x, y]);
    Phaser.Utils.Array.Shuffle(free);

    const t = mapProgress(mi, inst);
    const count = Math.min(free.length, 2 + Math.round(4 * t)); // 2 inimigos no inicio -> 6 nos mapas finais
    for (let i = 0; i < count; i++) {
      const [x, y] = free[i];
      this.addEnemy(x, y, enemyHp(mi, inst), false);
    }
    if (hasMvp(inst) && free.length > count) {
      const [x, y] = free[count];
      this.addEnemy(x, y, mvpHp(mi, inst), true);
    }
  }

  private addEnemy(gx: number, gy: number, maxHp: number, mvp: boolean) {
    const px = gx * T + T / 2, py = gy * T + T / 2;
    const sprite = this.add.image(px, py, mvp ? "enemy_mvp" : "enemy_mob").setDepth(4).setTint(mvp ? 0xffd24a : 0xd03a3a);
    if (mvp) { sprite.setScale(1.15); this.tweens.add({ targets: sprite, scale: 1.3, duration: 500, yoyo: true, repeat: -1 }); }
    const barBg = this.add.rectangle(px, py - 17, 26, 5, 0x000000, 0.7).setDepth(6).setVisible(false);
    const barFg = this.add.rectangle(px - 13, py - 17, 26, 3, mvp ? 0xffd24a : 0xd03a3a).setOrigin(0, 0.5).setDepth(7).setVisible(false);
    const reward = Math.round((mvp ? 25 : 6) * REWARD_SCALE * (1 + mapProgress(mapState.index, mapState.instance)));
    this.enemies.push({ id: ++this.enemySeq, gx, gy, hp: maxHp, maxHp, mvp, reward, sprite, barBg, barFg, nextMoveAt: 0 });
    this.viewCache = null;
  }

  private destroyEnemy(e: Enemy) {
    this.tweens.killTweensOf(e.sprite);
    [e.sprite, e.barBg, e.barFg].forEach((o) => o.destroy());
  }

  /** Inimigos vagam devagar por celulas livres (sem entrar em blocos, pilares, bombas ou outro inimigo). */
  private tickEnemies() {
    const now = this.time.now;
    for (const e of this.enemies) {
      if (now < e.nextMoveAt) continue;
      e.nextMoveAt = now + 900 + Math.random() * 600;
      const opts = DIRS.map(([dx, dy]) => [e.gx + dx, e.gy + dy] as [number, number]).filter(
        ([x, y]) => inBounds(x, y) && this.grid[y][x] === 0 && !this.enemies.some((o) => o !== e && o.gx === x && o.gy === y)
      );
      if (!opts.length) continue;
      const [nx, ny] = opts[Math.floor(Math.random() * opts.length)];
      e.gx = nx; e.gy = ny;
      this.tweens.add({ targets: e.sprite, x: nx * T + T / 2, y: ny * T + T / 2, duration: 700 });
    }
  }

  /** Dano em um inimigo; quem der o golpe final leva a recompensa. Inimigo ja removido e ignorado (sem recompensa dupla). */
  private hitEnemy(owner: HeroData, e: Enemy, dmg: number) {
    if (!this.enemies.includes(e)) return;
    e.hp -= dmg;
    if (e.hp <= 0) {
      addEnemyReward(e.reward, owner);
      bumpStat(owner, "enemies");
      const [cx, cy] = [e.sprite.x, e.sprite.y];
      this.burst(cx, cy, e.mvp ? 0xffd24a : 0xd03a3a, e.mvp ? 16 : 8);
      this.fx.text({ x: cx, y: cy, text: `+${e.reward}`, color: "#ffe27a", size: 14, rise: 26, duration: 900 });
      this.destroyEnemy(e);
      this.enemies.splice(this.enemies.indexOf(e), 1);
      this.viewCache = null;
      return;
    }
    e.barBg.setVisible(true);
    e.barFg.setVisible(true);
    e.barFg.width = 26 * (e.hp / e.maxHp);
    e.sprite.setScale(e.mvp ? 1.15 : 1);
    this.tweens.add({ targets: e.sprite, scale: (e.mvp ? 1.15 : 1) * 1.15, duration: 70, yoyo: true });
  }

  private addRuntime(data: HeroData) {
    const [gx, gy] = SPAWNS[this.heroes.length % SPAWNS.length];
    const px = gx * T + T / 2, py = gy * T + T / 2;
    const ab = runtimeOf(data);
    const sprite = this.add.sprite(px, py + HERO_DY, `hero_${data.rarity}_0`).setScale(HERO_SCALE).setDepth(4);
    sprite.anims.timeScale = data.speed;
    const glow = this.add.image(px, py + 9 * HERO_SCALE + HERO_DY, "glow").setTint(RARITIES[data.rarity].color).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.1 * HERO_SCALE, 0.5 * HERO_SCALE).setAlpha(0.6).setDepth(3.5);
    this.tweens.add({ targets: glow, alpha: 0.9, duration: 900, yoyo: true, repeat: -1 });
    const barBg = this.add.rectangle(0, 0, BAR_W + 2, 5, 0x000000, 0.65).setDepth(6);
    const barFg = this.add.rectangle(0, 0, BAR_W, 3, RARITIES[data.rarity].color).setOrigin(0, 0.5).setDepth(7);
    const zzz = this.add.text(0, 0, "Zzz", { fontFamily: "monospace", fontSize: "12px", color: "#ffffff", stroke: "#000", strokeThickness: 3 }).setDepth(7);
    // evolucao discreta: um losango dourado por marco de nivel (10, 20, 30)
    const pips = [0, 1, 2].map(() => this.add.image(0, 0, "spark").setTint(0xffd24a).setDepth(7).setVisible(false));
    const rt: Runtime = {
      data, gx, gy, sprite, glow, barBg, barFg, zzz, pips, sleeping: false, lastMove: 0, nextAt: 0,
      cls: bomberClass(data.rarity), ab, ai: newAIState(), combo: newCombo(), poseUntil: 0, posed: false, lastLevel: data.level, auraFxAt: 0, trailAt: 0,
    };
    this.heroes.push(rt);
    this.updatePips(rt);
  }

  private updatePips(h: Runtime) {
    const n = Math.min(3, Math.floor(h.data.level / 10));
    h.pips.forEach((p, i) => p.setVisible(i < n));
  }

  /** Entra/sai de campo conforme a lista de operadores trabalhando mudou (ex.: nova capsula). */
  private syncRoster() {
    const want = new Set(store.heroes);
    for (let i = this.heroes.length - 1; i >= 0; i--) {
      const h = this.heroes[i];
      if (want.has(h.data)) continue;
      this.tweens.killTweensOf(h.sprite);
      this.tweens.killTweensOf(h.glow);
      [h.sprite, h.glow, h.barBg, h.barFg, h.zzz, ...h.pips].forEach((o) => o.destroy());
      this.heroes.splice(i, 1);
    }
    const have = new Set(this.heroes.map((h) => h.data));
    store.heroes.forEach((d) => { if (!have.has(d)) this.addRuntime(d); });
  }

  private checkRegen() {
    this.syncRoster();
    if (mapState.request !== null) {
      mapState.index = mapState.request;
      mapState.request = null;
      mapState.instance = mapState.requestInstance ?? 1; // troca manual comeca na instancia 1; "Auto" retoma de onde parou
      mapState.requestInstance = null;
      this.idle = 0;
      this.cameras.main.flash(300, 255, 255, 255, false);
      this.buildMap();
      return;
    }
    const stuck = this.idle >= 40 && this.bombs.size === 0;
    const cleared = this.blocksLeft === 0 && this.chests.size === 0 && this.bombs.size === 0 && this.enemies.length === 0;
    if (cleared || stuck) {
      this.idle = 0;
      if (mapState.auto) {
        if (mapState.instance < INSTANCES_PER_MAP) mapState.instance++; // sobe de instancia no mesmo mapa
        else { mapState.instance = 1; mapState.index = (mapState.index + 1) % MAPS.length; } // mapa seguinte
      }
      this.cameras.main.flash(300, 255, 255, 255, false);
      this.buildMap();
    }
  }

  // ---------- IA dos herois (decisao em bomberAI.ts; aqui so a execucao no Phaser) ----------
  /** Fuga de bomba: BFS simples ate a celula segura mais proxima (pode atravessar a zona de perigo). */
  private bfs(sx: number, sy: number, goal: (x: number, y: number) => boolean, avoid?: Set<string>): [number, number][] | null {
    const prev = new Map<string, [number, number] | null>();
    prev.set(key(sx, sy), null);
    const q: [number, number][] = [[sx, sy]];
    for (let head = 0; head < q.length; head++) {
      const [x, y] = q[head];
      if ((x !== sx || y !== sy) && goal(x, y)) {
        const path: [number, number][] = [];
        let cur: [number, number] | null = [x, y];
        while (cur && !(cur[0] === sx && cur[1] === sy)) {
          path.unshift(cur);
          cur = prev.get(key(cur[0], cur[1])) ?? null;
        }
        return path;
      }
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (!inBounds(nx, ny) || this.grid[ny][nx] !== 0 || prev.has(k)) continue;
        if (this.bombs.has(k) || avoid?.has(k)) continue;
        prev.set(k, [x, y]);
        q.push([nx, ny]);
      }
    }
    return null;
  }

  private dangerSet() {
    const s = new Set<string>();
    this.bombs.forEach((b) => blastCells(this.grid, b.gx, b.gy, b.snap.range, b.snap.splash).forEach(([x, y]) => s.add(key(x, y))));
    return s;
  }

  /** Foto do mapa para a IA. Valida durante o frame e e refeita quando algo muda (bomba, bau, bloco, inimigo). */
  private snapshot(): WorldView {
    if (this.viewCache && this.viewFrame === this.frame) return this.viewCache;
    const v: WorldView = {
      grid: this.grid,
      chests: [...this.chests.values()].map((c) => ({ x: c.x, y: c.y, hp: c.hp, maxHp: c.maxHp, base: RARITIES[c.rarity].chest, label: `baú ${RARITIES[c.rarity].label}` })),
      enemies: this.enemies.map((e) => ({ id: String(e.id), x: e.gx, y: e.gy, hp: e.hp, maxHp: e.maxHp, reward: e.reward, mvp: e.mvp })),
      blocks: [...this.blocksHp.values()].filter((b) => this.grid[b.y][b.x] === 2).map((b) => ({ x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp })),
      bombCells: new Set(this.bombs.keys()),
      danger: this.dangerSet(),
      dropChance: this.dropChance,
    };
    this.viewCache = v;
    this.viewFrame = this.frame;
    return v;
  }

  private tick(h: Runtime) {
    const d = h.data, now = this.time.now, m = h.ab.mods;
    const say = (s: string) => (store.status[d.id] = s);

    if (h.sleeping) {
      gainStamina(d, d.regen * m.regenMult); // nunca passa do maximo
      if (d.stamina >= d.maxStamina * 0.5) h.sleeping = false;
      this.useAbilities(h, this.baseCtx(h));
      say("Descansando");
      return;
    }
    const view = this.snapshot();
    const danger = view.danger;
    if (danger.has(key(h.gx, h.gy))) {
      const p = this.bfs(h.gx, h.gy, (x, y) => !danger.has(key(x, y)));
      if (p && p.length) this.step(h, p[0]);
      say("Fugindo da bomba");
      return;
    }
    if (d.stamina < BALANCE.actionMinStamina) { h.sleeping = true; say("Sem stamina"); return; }

    // um BFS por decisao: distancias para todos os alvos de uma vez
    const field = bfsField(COLS, ROWS, h.gx, h.gy, (x, y) => this.grid[y][x] === 0 && !view.bombCells.has(key(x, y)) && !danger.has(key(x, y)));
    const bd = bombDamage(d);
    const per = Math.max(1, Math.round((d.melee ? bd * BALANCE.meleeDmgFactor : bd) * m.dmgMult));
    const cands = buildCandidates(view, field, {
      detectRadius: detectRadius(h.ab, d), dmgChest: per * m.chestDmgMult, dmgEnemy: per, dmgBlock: per,
      dmgBlockResistant: per * m.resistantDmgMult, resistantHp: BALANCE.resistantBlockHp, rewardScale: REWARD_SCALE,
    });
    const ratio = d.maxStamina > 0 ? d.stamina / d.maxStamina : 0;
    const pick = chooseTarget(h.ai, cands, now, h.cls, ratio);
    if (!pick) {
      this.useAbilities(h, this.baseCtx(h));
      if (danger.size === 0) this.idle++; // so conta como preso quando nao ha bombas em jogo
      say(danger.size ? "Aguardando explosão" : "Sem caminho");
      return;
    }
    if (reportProgress(h.ai, pick, now) === "abandon") { say("Alvo inalcançável"); return; }
    this.idle = 0;
    this.useAbilities(h, this.abilityCtx(h, pick, cands));

    if (pick.dist > 0) {
      const path = pathTo(field, pick.sx, pick.sy);
      if (!path || !path.length) { blacklist(h.ai, pick.id, now); say("Sem caminho"); return; }
      if (recordMove(h.ai, h.gx, h.gy, COLS)) { this.unstick(h, pick, view); say("Reposicionando"); return; }
      this.step(h, path[0]);
      say(`Indo: ${pick.label}`);
      return;
    }
    recordAction(h.ai);
    // Lyra nao gasta o resto da stamina em blocos: descansa cedo e volta mais forte
    if (h.cls === "lyra" && pick.kind === "block" && ratio < BALANCE.lyraNapBelow) { h.sleeping = true; say("Poupando energia"); return; }
    if (d.melee) { say(`Golpeando: ${pick.label}`); this.meleeStrike(h, pick); }
    else { say(`Bombardeando: ${pick.label}`); this.plantBomb(h, view); }
  }

  /** Preso (poucas celulas nas ultimas decisoes): larga o alvo por um tempo e da um passo aleatorio para uma celula livre. */
  private unstick(h: Runtime, pick: CellTarget, view: WorldView) {
    blacklist(h.ai, pick.id, this.time.now, 6000);
    h.ai.trail.length = 0;
    const opts = DIRS.map(([dx, dy]) => [h.gx + dx, h.gy + dy] as [number, number])
      .filter(([x, y]) => inBounds(x, y) && this.grid[y][x] === 0 && !view.bombCells.has(key(x, y)) && !view.danger.has(key(x, y)));
    const to = unstickStep(this.rng, opts);
    if (to) this.step(h, to);
  }

  private step(h: Runtime, [nx, ny]: [number, number]) {
    if (nx !== h.gx) h.sprite.setFlipX(nx < h.gx);
    h.gx = nx; h.gy = ny;
    h.lastMove = this.time.now;
    h.posed = false;
    h.sprite.play(`walk_${h.data.rarity}`, true);
    h.sprite.anims.timeScale = h.data.speed * h.ab.mods.speedMult;
    this.tweens.add({ targets: h.sprite, x: nx * T + T / 2, y: ny * T + T / 2 + HERO_DY, duration: this.stepMs(h) * 0.85 });
  }

  /** Pose curta (golpe/plantar bomba): troca a textura e volta sozinha em `ms`. */
  private pose(h: Runtime, frame: number, ms: number) {
    h.sprite.anims.stop();
    h.sprite.setTexture(`hero_${h.data.rarity}_${frame}`);
    h.posed = true;
    h.poseUntil = this.time.now + ms;
  }

  // ---------- habilidades ----------
  private alliesNeedingSupport(h: Runtime): number {
    if (h.cls !== "lyra") return 0;
    const range = ABILITY_DEFS.lyra_repair.range;
    let n = 0;
    for (const o of this.heroes) {
      if (o === h || Math.hypot(o.gx - h.gx, o.gy - h.gy) > range) continue;
      if (o.data.stamina / o.data.maxStamina <= BALANCE.repair.allyBelow && o.ab.supportLockMs <= 0) n++;
    }
    return n;
  }
  private baseCtx(h: Runtime): AbilityContext {
    return { pathLen: null, adjacentTarget: false, resistantNear: false, targetsNear: 0, chestsDetected: 0, enemiesNear: 0, alliesNeedingSupport: this.alliesNeedingSupport(h), inDanger: false };
  }
  private abilityCtx(h: Runtime, pick: CellTarget, cands: CellTarget[]): AbilityContext {
    const r = detectRadius(h.ab, h.data);
    let near = 0, enemies = 0, chests = 0;
    for (const c of cands) {
      if (c.dist <= 2) near++;
      if (c.kind === "enemy" && c.dist <= 6) enemies++;
      if (c.kind === "chest" && Math.hypot(c.tx - h.gx, c.ty - h.gy) <= r) chests++;
    }
    return { pathLen: pick.dist, adjacentTarget: pick.dist === 0, resistantNear: pick.resistant, targetsNear: near, chestsDetected: chests, enemiesNear: enemies, alliesNeedingSupport: this.alliesNeedingSupport(h), inDanger: false };
  }

  private useAbilities(h: Runtime, ctx: AbilityContext) {
    for (const def of decideAbilities(h.ab, h.data, ctx)) {
      if (!activate(h.ab, def, h.data)) continue;
      bumpStat(h.data, "skills");
      modifiersOf(h.ab, h.data);
      this.abilityFx(h, def);
      if (def.id === "lyra_repair") this.lyraPulse(h, def.range);
    }
    const aura = auraOf(h.ab, h.data);
    if (aura) this.applyAura(h, aura);
  }

  private abilityFx(h: Runtime, def: AbilityDef) {
    const x = h.sprite.x, y = h.sprite.y;
    this.fx.image({ texture: "fx_ring", x, y: y + 8, tint: CLASS_COLOR[h.cls], scale: 0.5, toScale: 1.7, alpha: 0.9, duration: 450, depth: 3.6, add: true });
    this.fx.text({ x, y: y - 13 * HERO_SCALE - 16, text: def.name, color: CLASS_CSS[h.cls], size: 10, rise: 14, duration: 900 });
  }

  private lyraPulse(h: Runtime, range: number) {
    const near = this.heroes.filter((o) => o !== h && Math.hypot(o.gx - h.gx, o.gy - h.gy) <= range);
    const res = repairPulse(h.data, near.map((o) => ({ data: o.data, rt: o.ab })));
    if (res.self > 0) this.fx.text({ x: h.sprite.x, y: h.sprite.y - 12, text: `+${res.self.toFixed(1)}`, color: "#55ffb0", size: 11, rise: 18 });
    for (const a of res.allies) {
      const o = near.find((r) => r.data.id === a.id);
      if (!o) continue;
      this.fx.image({ texture: "fx_plus", x: o.sprite.x, y: o.sprite.y - 6, tint: 0x55ffb0, scale: 0.4, toScale: 0.7, duration: 600, dy: -14, depth: 6, add: true });
      this.fx.text({ x: o.sprite.x, y: o.sprite.y - 12, text: `+${a.amount.toFixed(1)}`, color: "#55ffb0", size: 10, rise: 16 });
    }
  }

  /** Bonus de equipe (Orion): quem esta no alcance recebe o bonus por ~1 s; sai de perto e ele some sozinho. Nao soma fontes. */
  private applyAura(h: Runtime, aura: { range: number; dmg: number; speed: number }) {
    const now = this.time.now;
    for (const o of this.heroes) {
      if (o === h || Math.hypot(o.gx - h.gx, o.gy - h.gy) > aura.range) continue;
      setTeamBuff(o.ab, aura.dmg, aura.speed);
      if (now - o.auraFxAt > 3500) {
        o.auraFxAt = now;
        this.fx.image({ texture: "fx_ring", x: o.sprite.x, y: o.sprite.y + 8, tint: 0xfff1b8, scale: 0.35, toScale: 0.9, alpha: 0.7, duration: 500, depth: 3.6, add: true });
      }
    }
  }

  private levelUpFx(h: Runtime) {
    this.updatePips(h);
    const x = h.sprite.x, y = h.sprite.y;
    this.fx.image({ texture: "fx_ring", x, y: y + 6, tint: 0xffd24a, scale: 0.4, toScale: 1.9, duration: 700, depth: 3.6, add: true });
    this.fx.image({ texture: "fx_star", x, y: y - 10, tint: 0xfff3b0, scale: 0.3, toScale: 0.8, duration: 700, dy: -12, depth: 6, add: true });
    this.fx.text({ x, y: y - 13 * HERO_SCALE - 14, text: `Nv ${h.data.level}!`, color: "#ffe27a", size: 12, rise: 20, duration: 1000 });
  }

  /** Hologramas dos Vex: marcam (no maximo 6) os baus raros que algum Vex acordado enxerga. */
  private refreshHolo() {
    const seers = this.heroes.filter((h) => h.cls === "vex" && !h.sleeping);
    const picks: { x: number; y: number; base: number }[] = [];
    if (seers.length) {
      this.chests.forEach((c) => {
        const base = RARITIES[c.rarity].chest;
        if (base >= 2 && seers.some((v) => Math.hypot(c.x - v.gx, c.y - v.gy) <= detectRadius(v.ab, v.data))) picks.push({ x: c.x, y: c.y, base });
      });
      picks.sort((a, b) => b.base - a.base);
      picks.length = Math.min(picks.length, 6);
    }
    while (this.holo.length < picks.length) {
      const m = this.add.image(0, 0, "fx_holo").setTint(0x39e6ff).setDepth(5).setAlpha(0.85).setVisible(false);
      this.tweens.add({ targets: m, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
      this.holo.push(m);
    }
    this.holo.forEach((m, i) => { const p = picks[i]; if (p) m.setPosition(p.x * T + T / 2, p.y * T + T / 2).setVisible(true); else m.setVisible(false); });
  }

  // ---------- combate ----------
  private destroyChest(c: Chest) {
    this.tweens.killTweensOf(c.sprite);
    [c.sprite, c.barBg, c.barFg].forEach((o) => o.destroy());
  }

  /** Golpe corpo a corpo (Jax): valida o alvo, respeita intervalo minimo/combo/stamina e aplica critico. */
  private meleeStrike(h: Runtime, c: CellTarget) {
    const d = h.data, now = this.time.now, m = h.ab.mods;
    const chest = c.kind === "chest" ? this.chests.get(key(c.tx, c.ty)) : undefined;
    const enemy = c.kind === "enemy" ? this.enemies.find((e) => `e:${e.id}` === c.id) : undefined;
    const block = c.kind === "block" && this.grid[c.ty][c.tx] === 2 ? this.blocksHp.get(key(c.tx, c.ty)) : undefined;
    const alive = chest || block || enemy;
    if (!alive || Math.abs(c.tx - h.gx) + Math.abs(c.ty - h.gy) !== 1) { blacklist(h.ai, c.id, now, 1000); return; } // alvo destruido/movido: nao ataca
    const hit = registerHit(h.combo, now);
    if (!hit.ok) return; // intervalo minimo: nada de dano repetido no mesmo frame
    if (!spendStamina(d, BALANCE.meleeHitCost * m.staminaCostMult)) { h.sleeping = true; return; }
    const crit = rollCrit(m.critChance, this.rng);
    let dmg = meleeDamage(bombDamage(d), m, crit, hit.finisher);
    if (chest) dmg = Math.max(1, Math.round(dmg * m.chestDmgMult));
    else if (block && isResistantBlock(block.maxHp)) dmg = Math.max(1, Math.round(dmg * m.resistantDmgMult));
    const cx = c.tx * T + T / 2, cy = c.ty * T + T / 2;
    const ang = (Math.atan2(c.ty - h.gy, c.tx - h.gx) * 180) / Math.PI;
    this.pose(h, POSE_ATTACK, 160);
    h.sprite.setFlipX(c.tx < h.gx);
    this.fx.image({ texture: "fx_slash", x: cx, y: cy, tint: hit.finisher ? 0xffd24a : crit ? 0xffffff : 0xff7af0, scale: crit ? 0.8 : 0.55, toScale: crit ? 1.3 : 1, alpha: 0.95, duration: 220, angle: ang - 45, depth: 5, add: true });
    if (crit) {
      bumpStat(d, "crits");
      this.fx.image({ texture: "fx_star", x: cx, y: cy - 6, tint: 0xfff3b0, scale: 0.4, toScale: 0.9, duration: 350, depth: 6, add: true });
      this.fx.text({ x: cx, y: cy - 10, text: "CRÍTICO", color: "#fff3b0", size: 11, rise: 18 });
    }
    if (chest) this.hitChest(d, c.tx, c.ty, chest, dmg, crit);
    else if (enemy) this.hitEnemy(d, enemy, dmg);
    else this.hitBlock(c.tx, c.ty, dmg, d.luck + m.luckBonus, d);
    h.nextAt = now + Math.max(BALANCE.minTickMs, this.stepMs(h) * m.hitIntervalMult);
  }

  /** Aplica dano; o operador que da o golpe final recebe a recompensa. Bau ja aberto e ignorado (sem recompensa dupla). */
  private hitChest(owner: HeroData, x: number, y: number, chest: Chest, dmg: number, crit = false) {
    if (this.chests.get(key(x, y)) !== chest) return;
    chest.hp -= dmg;
    if (chest.hp <= 0) { this.openChest(owner, x, y, chest); return; }
    chest.barBg.setVisible(true);
    chest.barFg.setVisible(true);
    chest.barFg.width = 26 * (chest.hp / chest.maxHp);
    chest.sprite.setScale(1);
    this.tweens.add({ targets: chest.sprite, scale: 1.14, duration: 70, yoyo: true });
    this.fx.text({ x: x * T + T / 2, y: y * T + 4, text: `-${dmg}`, color: crit ? "#fff3b0" : "#ff8a8a", size: crit ? 13 : 11, rise: 16, duration: 600 });
  }

  private openChest(owner: HeroData, x: number, y: number, chest: Chest) {
    const base = RARITIES[chest.rarity].chest;
    const value = Math.round(base * RARITIES[owner.rarity].mult * owner.chestMult * levelMult(owner) * (1 + owner.power * 0.05) * REWARD_SCALE);
    addReward(value, owner, base);
    bumpStat(owner, "chests");
    this.chests.delete(key(x, y));
    this.destroyChest(chest);
    this.viewCache = null;
    this.burst(x * T + T / 2, y * T + T / 2, 0xffe27a, 10);
    this.fx.image({ texture: "fx_star", x: x * T + T / 2, y: y * T + T / 2, tint: 0xffe27a, scale: 0.3, toScale: 0.8, duration: 450, depth: 6, add: true });
    this.fx.text({ x: x * T + T / 2, y: y * T, text: `+${value}`, color: "#ffe27a", size: 14, rise: 26, duration: 900 });
  }

  private plantBomb(h: Runtime, view: WorldView) {
    const d = h.data, m = h.ab.mods, k = key(h.gx, h.gy);
    if (this.bombs.has(k)) return; // ja existe bomba nesta celula (dois operadores no mesmo tile)
    const snap = bombSnapshot(bombDamage(d), d.power, m);
    // seguranca: depois de plantar, existe saida da zona de explosao antes do pavio acabar?
    const blast = new Set(blastCells(this.grid, h.gx, h.gy, snap.range, snap.splash).map(([x, y]) => key(x, y)));
    const safe = hasEscape(COLS, ROWS, h.gx, h.gy, (x, y) => this.grid[y][x] === 0 && !view.bombCells.has(key(x, y)),
      (x, y) => view.danger.has(key(x, y)) || blast.has(key(x, y)), escapeSteps(this.stepMs(h)));
    if (!safe && h.ai.unsafeStreak < AI_TUNING.unsafeWaitTicks) { h.ai.unsafeStreak++; store.status[d.id] = "Aguardando posição segura"; return; }
    h.ai.unsafeStreak = 0;
    if (!spendStamina(d, BALANCE.bombCost * m.staminaCostMult)) { h.sleeping = true; return; }
    consumeArmed(h.ab); // Impacto Sismico vale para esta bomba
    track.bomb();
    const sprite = this.add.image(h.gx * T + T / 2, h.gy * T + T / 2, "bomb").setDepth(3);
    if (snap.splash > 0) sprite.setTint(0xffb15a);
    this.tweens.add({ targets: sprite, scale: 1.15, duration: 280, yoyo: true, repeat: -1 });
    const bomb: Bomb = { gx: h.gx, gy: h.gy, snap, luck: d.luck + m.luckBonus, owner: d, sprite };
    this.bombs.set(k, bomb);
    this.viewCache = null;
    this.pose(h, POSE_BOMB, 220);
    this.time.delayedCall(BALANCE.bombFuseMs, () => this.explode(bomb));
  }

  private burst(x: number, y: number, tint: number, n: number) {
    const p = this.add.particles(x, y, "spark", {
      speed: { min: 40, max: 130 }, lifespan: 450, scale: { start: 1.2, end: 0 }, tint, quantity: n, emitting: false,
    }).setDepth(6);
    p.explode(n);
    this.time.delayedCall(600, () => p.destroy());
  }

  private rollRarity(luck: number): Rarity {
    const r = (1 - Math.pow(1 - Math.random(), 1 + luck)) * 100; // luck desloca para raridades altas
    return r < 55 ? "common" : r < 79 ? "rare" : r < 91 ? "epic" : r < 97 ? "mythic" : r < 99.5 ? "legendary" : "super";
  }

  /** Remove o bloco de fato (so chamado quando o HP dele chega a zero) e sorteia um bau. */
  private breakBlock(x: number, y: number, luck: number, owner?: HeroData) {
    if (this.grid[y][x] !== 2) return;
    const cx = x * T + T / 2, cy = y * T + T / 2;
    this.grid[y][x] = 0;
    this.blockSprites[y][x]?.destroy();
    this.blockSprites[y][x] = null;
    const bh = this.blocksHp.get(key(x, y));
    if (bh) { bh.barBg?.destroy(); bh.barFg?.destroy(); this.blocksHp.delete(key(x, y)); }
    this.blocksLeft--;
    this.viewCache = null;
    track.block();
    if (owner) bumpStat(owner, "blocks");
    this.burst(cx, cy, this.map.crate, 8);
    if (Math.random() < this.dropChance) {
      const rarity = this.rollRarity(luck);
      const sprite = this.add.image(cx, cy, `chest_${rarity}`).setDepth(2).setScale(0);
      this.tweens.add({ targets: sprite, scale: 1, duration: 260, ease: "Back.Out" });
      const maxHp = Math.round(RARITIES[rarity].hp * this.curChestHpMult);
      const barBg = this.add.rectangle(cx, cy - 17, 28, 5, 0x000000, 0.7).setDepth(6).setVisible(false);
      const barFg = this.add.rectangle(cx - 13, cy - 17, 26, 3, RARITIES[rarity].color).setOrigin(0, 0.5).setDepth(7).setVisible(false);
      this.chests.set(key(x, y), { x, y, sprite, rarity, hp: maxHp, maxHp, barBg, barFg });
    }
  }

  /** Aplica dano num bloco; quebra de fato so quando o HP acaba (mapas/instancias avancadas exigem mais de 1 bombada). */
  private hitBlock(x: number, y: number, dmg: number, luck: number, owner?: HeroData) {
    if (this.grid[y][x] !== 2) return;
    const b = this.blocksHp.get(key(x, y));
    if (!b) { this.breakBlock(x, y, luck, owner); return; } // seguranca: sem registro de hp, quebra direto
    b.hp -= dmg;
    if (b.hp <= 0) { this.breakBlock(x, y, luck, owner); return; }
    if (b.barBg && b.barFg) {
      b.barBg.setVisible(true);
      b.barFg.setVisible(true);
      b.barFg.width = 22 * (b.hp / b.maxHp);
    }
    const sprite = this.blockSprites[y][x];
    if (sprite) { sprite.setScale(1); this.tweens.add({ targets: sprite, scale: 1.1, duration: 70, yoyo: true }); }
  }

  private explode(bomb: Bomb) {
    if (this.bombs.get(key(bomb.gx, bomb.gy)) !== bomb) return; // mapa trocado antes da explosao
    const cells = blastCells(this.grid, bomb.gx, bomb.gy, bomb.snap.range, bomb.snap.splash); // calcular antes de remover blocos
    for (const [x, y] of cells) { // dano nos baus e inimigos antes de quebrar blocos (baus/inimigos novos nao sofrem esta explosao)
      const c = this.chests.get(key(x, y));
      if (c) this.hitChest(bomb.owner, x, y, c, bombDamageVs(bomb.snap, "chest", true));
      const e = this.enemies.find((en) => en.gx === x && en.gy === y);
      if (e) this.hitEnemy(bomb.owner, e, bombDamageVs(bomb.snap, "enemy", false));
    }
    this.bombs.delete(key(bomb.gx, bomb.gy));
    this.viewCache = null;
    this.tweens.killTweensOf(bomb.sprite);
    bomb.sprite.destroy();
    this.cameras.main.shake(bomb.snap.splash > 0 ? 140 : 90, bomb.snap.splash > 0 ? 0.004 : 0.002);
    const bx = bomb.gx * T + T / 2, by = bomb.gy * T + T / 2;
    this.fx.image({ texture: "fx_ring", x: bx, y: by, tint: bomb.snap.splash > 0 ? 0xffb15a : 0xffc04a, scale: 0.4, toScale: 0.8 + bomb.snap.range * 0.45, alpha: 0.8, duration: 320, depth: 4.5, add: true });
    for (const [x, y] of cells) {
      const cx = x * T + T / 2, cy = y * T + T / 2;
      this.fx.image({ texture: "flame", x: cx, y: cy, scale: 0.6, toScale: 1.5, duration: 420, depth: 5 });
      this.burst(cx, cy, 0xffc04a, 5);
      const bh = this.blocksHp.get(key(x, y));
      this.hitBlock(x, y, bombDamageVs(bomb.snap, "block", bh ? isResistantBlock(bh.maxHp) : false), bomb.luck, bomb.owner);
    }
  }
}
