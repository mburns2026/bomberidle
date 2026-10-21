import Phaser from "phaser";
import { RARITIES, Rarity, HeroData, store, addReward, addEnemyReward, mapState, track, levelMult, REWARD_SCALE, bombDamage } from "../state";
import { makeTextures } from "../art";
import { MAPS, COLS, ROWS, MapDef, INSTANCES_PER_MAP, chestDropChance, blockHp, chestHpMult, enemyHp, mvpHp, hasMvp, mapProgress } from "../maps";

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

interface Runtime {
  data: HeroData; gx: number; gy: number;
  sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image;
  barBg: Phaser.GameObjects.Rectangle; barFg: Phaser.GameObjects.Rectangle; zzz: Phaser.GameObjects.Text;
  sleeping: boolean; lastMove: number; nextAt: number;
}
interface Bomb { gx: number; gy: number; range: number; luck: number; dmg: number; owner: HeroData; sprite: Phaser.GameObjects.Image }
interface Chest { sprite: Phaser.GameObjects.Image; rarity: Rarity; hp: number; maxHp: number; barBg: Phaser.GameObjects.Rectangle; barFg: Phaser.GameObjects.Rectangle }
interface BlockState { hp: number; maxHp: number; barBg?: Phaser.GameObjects.Rectangle; barFg?: Phaser.GameObjects.Rectangle }
interface Enemy {
  gx: number; gy: number; hp: number; maxHp: number; mvp: boolean; reward: number;
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
  private dropChance = 0.3; // chance de bau por bloco quebrado, recalculada por mapa em buildMap()
  private ambient?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() { super("farm"); }

  create() {
    makeTextures(this);
    this.makeEnemyTextures();
    this.cameras.main.setScroll(-T, -T);
    try { if (this.renderer.type === Phaser.WEBGL) this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.3); } catch { /* sem WebGL */ }

    (Object.keys(RARITIES) as Rarity[]).forEach((r) =>
      this.anims.create({ key: `walk_${r}`, frames: [0, 1, 2, 3].map((i) => ({ key: `hero_${r}_${i}` })), frameRate: 9, repeat: -1 })
    );

    store.heroes.forEach((data) => this.addRuntime(data));

    this.buildMap();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.checkRegen() });
  }

  update() {
    const now = this.time.now;
    for (const h of this.heroes) {
      if (now >= h.nextAt) { h.nextAt = now + 450 / h.data.speed; this.tick(h); } // ritmo depende da velocidade atual
      const { x, y } = h.sprite;
      h.barBg.setPosition(x, y - 13 * HERO_SCALE - 6);
      h.barFg.setPosition(x - BAR_W / 2, y - 13 * HERO_SCALE - 6);
      h.barFg.width = Math.max(0, BAR_W * (h.data.stamina / h.data.maxStamina));
      h.zzz.setPosition(x + 6, y - 13 * HERO_SCALE - 20).setVisible(h.sleeping);
      h.glow.setPosition(x, y + 9 * HERO_SCALE);
      h.sprite.setAlpha(h.sleeping ? 0.7 : 1);
      if (h.sprite.anims.isPlaying && (h.sleeping || now - h.lastMove > (450 / h.data.speed) * 1.4)) {
        h.sprite.anims.stop();
        h.sprite.setTexture(`hero_${h.data.rarity}_0`);
      }
    }
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
          this.blocksHp.set(key(x, y), { hp: maxHp, maxHp, barBg, barFg });
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
    this.enemies.push({ gx, gy, hp: maxHp, maxHp, mvp, reward, sprite, barBg, barFg, nextMoveAt: 0 });
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

  /** Dano em um inimigo; quem der o golpe final leva a recompensa. */
  private hitEnemy(owner: HeroData, e: Enemy, dmg: number) {
    e.hp -= dmg;
    if (e.hp <= 0) {
      addEnemyReward(e.reward, owner);
      const [cx, cy] = [e.sprite.x, e.sprite.y];
      this.burst(cx, cy, e.mvp ? 0xffd24a : 0xd03a3a, e.mvp ? 16 : 8);
      const txt = this.add.text(cx, cy, `+${e.reward}`, {
        fontFamily: "monospace", fontSize: "14px", color: "#ffe27a", stroke: "#000", strokeThickness: 3,
      }).setOrigin(0.5).setDepth(8);
      this.tweens.add({ targets: txt, y: txt.y - 26, alpha: 0, duration: 900, onComplete: () => txt.destroy() });
      this.destroyEnemy(e);
      this.enemies.splice(this.enemies.indexOf(e), 1);
      return;
    }
    e.barBg.setVisible(true);
    e.barFg.setVisible(true);
    e.barFg.width = 26 * (e.hp / e.maxHp);
    e.sprite.setScale(e.mvp ? 1.15 : 1);
    this.tweens.add({ targets: e.sprite, scale: (e.mvp ? 1.15 : 1) * 1.15, duration: 70, yoyo: true });
  }

  /** Inimigo vizinho (nao ameaçado por bomba) que o operador pode atacar daqui. */
  private adjacentEnemy(x: number, y: number, danger: Set<string>): [number, number, Enemy] | null {
    for (const en of this.enemies) {
      if (Math.abs(en.gx - x) + Math.abs(en.gy - y) === 1 && !danger.has(key(en.gx, en.gy))) return [en.gx, en.gy, en];
    }
    return null;
  }

  private addRuntime(data: HeroData) {
    const [gx, gy] = SPAWNS[this.heroes.length % SPAWNS.length];
    const px = gx * T + T / 2, py = gy * T + T / 2;
    const sprite = this.add.sprite(px, py + HERO_DY, `hero_${data.rarity}_0`).setScale(HERO_SCALE).setDepth(4);
    sprite.anims.timeScale = data.speed;
    const glow = this.add.image(px, py + 9 * HERO_SCALE + HERO_DY, "glow").setTint(RARITIES[data.rarity].color).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.1 * HERO_SCALE, 0.5 * HERO_SCALE).setAlpha(0.6).setDepth(3.5);
    this.tweens.add({ targets: glow, alpha: 0.9, duration: 900, yoyo: true, repeat: -1 });
    const barBg = this.add.rectangle(0, 0, BAR_W + 2, 5, 0x000000, 0.65).setDepth(6);
    const barFg = this.add.rectangle(0, 0, BAR_W, 3, RARITIES[data.rarity].color).setOrigin(0, 0.5).setDepth(7);
    const zzz = this.add.text(0, 0, "Zzz", { fontFamily: "monospace", fontSize: "12px", color: "#ffffff", stroke: "#000", strokeThickness: 3 }).setDepth(7);
    this.heroes.push({ data, gx, gy, sprite, glow, barBg, barFg, zzz, sleeping: false, lastMove: 0, nextAt: 0 });
  }

  /** Entra/sai de campo conforme a lista de operadores trabalhando mudou (ex.: nova capsula). */
  private syncRoster() {
    const want = new Set(store.heroes);
    for (let i = this.heroes.length - 1; i >= 0; i--) {
      const h = this.heroes[i];
      if (want.has(h.data)) continue;
      this.tweens.killTweensOf(h.sprite);
      this.tweens.killTweensOf(h.glow);
      [h.sprite, h.glow, h.barBg, h.barFg, h.zzz].forEach((o) => o.destroy());
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
      mapState.instance = 1; // troca manual de mapa sempre comeca na instancia 1
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

  // ---------- IA dos herois ----------
  private bfs(
    sx: number, sy: number,
    goal: (x: number, y: number) => boolean,
    avoid?: Set<string>
  ): [number, number][] | null {
    const prev = new Map<string, [number, number] | null>();
    prev.set(key(sx, sy), null);
    const q: [number, number][] = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift()!;
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

  private nextToBlock(x: number, y: number) {
    return DIRS.some(([dx, dy]) => inBounds(x + dx, y + dy) && this.grid[y + dy][x + dx] === 2);
  }

  private blast(gx: number, gy: number, range: number): [number, number][] {
    const out: [number, number][] = [[gx, gy]];
    for (const [dx, dy] of DIRS) {
      for (let i = 1; i <= range; i++) {
        const x = gx + dx * i, y = gy + dy * i;
        if (!inBounds(x, y) || this.grid[y][x] === 1) break;
        out.push([x, y]);
        if (this.grid[y][x] === 2) break;
      }
    }
    return out;
  }

  private dangerSet() {
    const s = new Set<string>();
    this.bombs.forEach((b) => this.blast(b.gx, b.gy, b.range).forEach(([x, y]) => s.add(key(x, y))));
    return s;
  }

  private tick(h: Runtime) {
    const d = h.data;
    const say = (s: string) => (store.status[d.id] = s);

    if (h.sleeping) {
      d.stamina = Math.min(d.maxStamina, d.stamina + d.regen);
      if (d.stamina >= d.maxStamina * 0.5) h.sleeping = false;
      say("Descansando");
      return;
    }
    const danger = this.dangerSet();
    if (danger.has(key(h.gx, h.gy))) {
      const p = this.bfs(h.gx, h.gy, (x, y) => !danger.has(key(x, y)));
      if (p && p.length) this.step(h, p[0]);
      say("Fugindo da bomba");
      return;
    }
    if (d.stamina < 1) { h.sleeping = true; say("Sem stamina"); return; }

    const near = this.adjacentChest(h.gx, h.gy, danger);
    if (near) {
      this.idle = 0;
      if (d.melee) { say("Golpeando o baú"); this.slashChest(h, near); } else { say("Bombardeando o baú"); this.placeBomb(h); }
      return;
    }
    const cp = this.bfs(h.gx, h.gy, (x, y) => this.adjacentChest(x, y, danger) !== null, danger);
    if (cp) { this.idle = 0; say("Indo ao baú"); this.step(h, cp[0]); return; }

    const foe = this.adjacentEnemy(h.gx, h.gy, danger);
    if (foe) {
      this.idle = 0;
      const [, , e] = foe;
      if (d.melee) { say(e.mvp ? "Golpeando o MVP" : "Golpeando inimigo"); this.slashEnemy(h, foe); }
      else { say(e.mvp ? "Bombardeando o MVP" : "Bombardeando inimigo"); this.placeBomb(h); }
      return;
    }
    const ep = this.bfs(h.gx, h.gy, (x, y) => this.adjacentEnemy(x, y, danger) !== null, danger);
    if (ep) { this.idle = 0; say("Indo atacar inimigo"); this.step(h, ep[0]); return; }

    if (this.nextToBlock(h.gx, h.gy)) {
      this.idle = 0;
      if (d.melee) { say("Cortando blocos"); this.slash(h); } else { say("Plantando bomba"); this.placeBomb(h); }
      return;
    }

    const bp = this.bfs(h.gx, h.gy, (x, y) => this.nextToBlock(x, y), danger);
    if (bp) { this.idle = 0; say("Procurando blocos"); this.step(h, bp[0]); return; }

    if (danger.size === 0) this.idle++; // so conta como preso quando nao ha bombas em jogo
    say(danger.size ? "Aguardando explosão" : "Sem caminho");
  }

  private step(h: Runtime, [nx, ny]: [number, number]) {
    if (nx !== h.gx) h.sprite.setFlipX(nx < h.gx);
    h.gx = nx; h.gy = ny;
    h.lastMove = this.time.now;
    h.sprite.play(`walk_${h.data.rarity}`, true);
    h.sprite.anims.timeScale = h.data.speed;
    this.tweens.add({ targets: h.sprite, x: nx * T + T / 2, y: ny * T + T / 2 + HERO_DY, duration: (450 / h.data.speed) * 0.85 });
  }

  private destroyChest(c: Chest) {
    this.tweens.killTweensOf(c.sprite);
    [c.sprite, c.barBg, c.barFg].forEach((o) => o.destroy());
  }

  /** Baú vizinho (nao ameaçado por bomba) que o operador pode atacar daqui. */
  private adjacentChest(x: number, y: number, danger: Set<string>): [number, number, Chest] | null {
    for (const [dx, dy] of DIRS) {
      const k = key(x + dx, y + dy), c = this.chests.get(k);
      if (c && !danger.has(k)) return [x + dx, y + dy, c];
    }
    return null;
  }

  /** Golpe corpo a corpo no baú (Jax): dano menor que a bomba, mas gasta pouca stamina. */
  private slashChest(h: Runtime, [x, y, chest]: [number, number, Chest]) {
    h.data.stamina -= 0.3;
    const fx = this.add.image(x * T + T / 2, y * T + T / 2, "flame").setDepth(5).setTint(0xffffff).setScale(0.4);
    this.tweens.add({ targets: fx, scale: 0.9, alpha: 0, duration: 200, onComplete: () => fx.destroy() });
    this.hitChest(h.data, x, y, chest, Math.max(1, Math.round(bombDamage(h.data) * 0.4)));
  }

  /** Golpe corpo a corpo num inimigo (Jax): mesma logica do golpe no baú. */
  private slashEnemy(h: Runtime, [x, y, e]: [number, number, Enemy]) {
    h.data.stamina -= 0.3;
    const fx = this.add.image(x * T + T / 2, y * T + T / 2, "flame").setDepth(5).setTint(0xffffff).setScale(0.4);
    this.tweens.add({ targets: fx, scale: 0.9, alpha: 0, duration: 200, onComplete: () => fx.destroy() });
    this.hitEnemy(h.data, e, Math.max(1, Math.round(bombDamage(h.data) * 0.4)));
  }

  /** Aplica dano; o operador que dá o golpe final recebe a recompensa. */
  private hitChest(owner: HeroData, x: number, y: number, chest: Chest, dmg: number) {
    chest.hp -= dmg;
    if (chest.hp <= 0) { this.openChest(owner, x, y, chest); return; }
    chest.barBg.setVisible(true);
    chest.barFg.setVisible(true);
    chest.barFg.width = 26 * (chest.hp / chest.maxHp);
    chest.sprite.setScale(1);
    this.tweens.add({ targets: chest.sprite, scale: 1.14, duration: 70, yoyo: true });
    const txt = this.add.text(x * T + T / 2, y * T + 4, `-${dmg}`, {
      fontFamily: "monospace", fontSize: "11px", color: "#ff8a8a", stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: txt, y: txt.y - 16, alpha: 0, duration: 600, onComplete: () => txt.destroy() });
  }

  private openChest(owner: HeroData, x: number, y: number, chest: Chest) {
    const base = RARITIES[chest.rarity].chest;
    const value = Math.round(base * RARITIES[owner.rarity].mult * owner.chestMult * levelMult(owner) * (1 + owner.power * 0.05) * REWARD_SCALE);
    addReward(value, owner, base);
    this.chests.delete(key(x, y));
    this.destroyChest(chest);
    this.burst(x * T + T / 2, y * T + T / 2, 0xffe27a, 10);
    const txt = this.add.text(x * T + T / 2, y * T, `+${value}`, {
      fontFamily: "monospace", fontSize: "14px", color: "#ffe27a", stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: txt, y: txt.y - 26, alpha: 0, duration: 900, onComplete: () => txt.destroy() });
  }

  private placeBomb(h: Runtime) {
    h.data.stamina -= 1;
    track.bomb();
    const range = Math.min(4, 1 + Math.ceil(h.data.power / 2));
    const sprite = this.add.image(h.gx * T + T / 2, h.gy * T + T / 2, "bomb").setDepth(3);
    this.tweens.add({ targets: sprite, scale: 1.15, duration: 280, yoyo: true, repeat: -1 });
    const bomb: Bomb = { gx: h.gx, gy: h.gy, range, luck: h.data.luck, dmg: bombDamage(h.data), owner: h.data, sprite };
    this.bombs.set(key(h.gx, h.gy), bomb);
    this.time.delayedCall(1400, () => this.explode(bomb));
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
  private breakBlock(x: number, y: number, luck: number) {
    if (this.grid[y][x] !== 2) return;
    const cx = x * T + T / 2, cy = y * T + T / 2;
    this.grid[y][x] = 0;
    this.blockSprites[y][x]?.destroy();
    this.blockSprites[y][x] = null;
    const bh = this.blocksHp.get(key(x, y));
    if (bh) { bh.barBg?.destroy(); bh.barFg?.destroy(); this.blocksHp.delete(key(x, y)); }
    this.blocksLeft--;
    track.block();
    this.burst(cx, cy, this.map.crate, 8);
    if (Math.random() < this.dropChance) {
      const rarity = this.rollRarity(luck);
      const sprite = this.add.image(cx, cy, `chest_${rarity}`).setDepth(2).setScale(0);
      this.tweens.add({ targets: sprite, scale: 1, duration: 260, ease: "Back.Out" });
      const maxHp = Math.round(RARITIES[rarity].hp * this.curChestHpMult);
      const barBg = this.add.rectangle(cx, cy - 17, 28, 5, 0x000000, 0.7).setDepth(6).setVisible(false);
      const barFg = this.add.rectangle(cx - 13, cy - 17, 26, 3, RARITIES[rarity].color).setOrigin(0, 0.5).setDepth(7).setVisible(false);
      this.chests.set(key(x, y), { sprite, rarity, hp: maxHp, maxHp, barBg, barFg });
    }
  }

  /** Aplica dano num bloco; quebra de fato so quando o HP acaba (mapas/instancias avancadas exigem mais de 1 bombada). */
  private hitBlock(x: number, y: number, dmg: number, luck: number) {
    if (this.grid[y][x] !== 2) return;
    const b = this.blocksHp.get(key(x, y));
    if (!b) { this.breakBlock(x, y, luck); return; } // seguranca: sem registro de hp, quebra direto
    b.hp -= dmg;
    if (b.hp <= 0) { this.breakBlock(x, y, luck); return; }
    if (b.barBg && b.barFg) {
      b.barBg.setVisible(true);
      b.barFg.setVisible(true);
      b.barFg.width = 22 * (b.hp / b.maxHp);
    }
    const sprite = this.blockSprites[y][x];
    if (sprite) { sprite.setScale(1); this.tweens.add({ targets: sprite, scale: 1.1, duration: 70, yoyo: true }); }
  }

  /** Corte corpo a corpo (Jax): dano reduzido num bloco adjacente, gastando pouca stamina. */
  private slash(h: Runtime) {
    const target = DIRS.map(([dx, dy]) => [h.gx + dx, h.gy + dy] as [number, number])
      .find(([x, y]) => inBounds(x, y) && this.grid[y][x] === 2);
    if (!target) return;
    h.data.stamina -= 0.3;
    const [x, y] = target;
    const fx = this.add.image(x * T + T / 2, y * T + T / 2, "flame").setDepth(5).setTint(0xffffff).setScale(0.5);
    this.tweens.add({ targets: fx, scale: 1.2, alpha: 0, duration: 260, onComplete: () => fx.destroy() });
    this.hitBlock(x, y, Math.max(1, Math.round(bombDamage(h.data) * 0.4)), h.data.luck);
  }

  private explode(bomb: Bomb) {
    if (this.bombs.get(key(bomb.gx, bomb.gy)) !== bomb) return; // mapa trocado antes da explosao
    const cells = this.blast(bomb.gx, bomb.gy, bomb.range); // calcular antes de remover blocos
    for (const [x, y] of cells) { // dano nos baus e inimigos antes de quebrar blocos (baus/inimigos novos nao sofrem esta explosao)
      const c = this.chests.get(key(x, y));
      if (c) this.hitChest(bomb.owner, x, y, c, bomb.dmg);
      const e = this.enemies.find((en) => en.gx === x && en.gy === y);
      if (e) this.hitEnemy(bomb.owner, e, bomb.dmg);
    }
    this.bombs.delete(key(bomb.gx, bomb.gy));
    this.tweens.killTweensOf(bomb.sprite);
    bomb.sprite.destroy();
    this.cameras.main.shake(90, 0.002);
    for (const [x, y] of cells) {
      const cx = x * T + T / 2, cy = y * T + T / 2;
      const flame = this.add.image(cx, cy, "flame").setDepth(5).setScale(0.6);
      this.tweens.add({ targets: flame, scale: 1.5, alpha: 0, duration: 420, onComplete: () => flame.destroy() });
      this.burst(cx, cy, 0xffc04a, 5);
      this.hitBlock(x, y, bomb.dmg, bomb.luck);
    }
  }
}
