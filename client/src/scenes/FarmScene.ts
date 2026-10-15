import Phaser from "phaser";
import { RARITIES, Rarity, HeroData, store, addReward, mapState, track, levelMult, REWARD_SCALE, bombDamage } from "../state";
import { makeTextures } from "../art";
import { MAPS, COLS, ROWS, MapDef } from "../maps";

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
  private ambient?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() { super("farm"); }

  create() {
    makeTextures(this);
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
  }

  // ---------- mapa ----------
  private buildMap() {
    const m = (this.map = MAPS[mapState.index]);
    track.map(m.id);
    this.mapObjs.forEach((o) => { this.tweens.killTweensOf(o); o.destroy(); });
    this.mapObjs = [];
    this.chests.forEach((c) => this.destroyChest(c));
    this.chests.clear();
    this.bombs.forEach((b) => { this.tweens.killTweensOf(b.sprite); b.sprite.destroy(); });
    this.bombs.clear();
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
        }
      }
    }

    // clima do bioma: polen, areia, neve, brasas ou vagalumes
    this.ambient = this.add.particles(0, 0, "spark", {
      x: { min: 0, max: MAP_W }, y: { min: 0, max: MAP_H }, lifespan: 5000,
      speedY: m.fall ? { min: 15, max: 30 } : { min: -25, max: -8 }, speedX: { min: -8, max: 8 },
      scale: { start: 0.7, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: m.ambient, quantity: 1, frequency: 260,
    }).setDepth(7);
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
      this.idle = 0;
      this.cameras.main.flash(300, 255, 255, 255, false);
      this.buildMap();
      return;
    }
    const stuck = this.idle >= 40 && this.bombs.size === 0;
    if ((this.blocksLeft === 0 && this.chests.size === 0 && this.bombs.size === 0) || stuck) {
      this.idle = 0;
      if (mapState.auto) mapState.index = (mapState.index + 1) % MAPS.length; // avanca para o proximo bioma
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

  private breakBlock(x: number, y: number, luck: number) {
    if (this.grid[y][x] !== 2) return;
    const cx = x * T + T / 2, cy = y * T + T / 2;
    this.grid[y][x] = 0;
    this.blockSprites[y][x]?.destroy();
    this.blockSprites[y][x] = null;
    this.blocksLeft--;
    track.block();
    this.burst(cx, cy, this.map.crate, 8);
    if (Math.random() < 0.3) {
      const rarity = this.rollRarity(luck);
      const sprite = this.add.image(cx, cy, `chest_${rarity}`).setDepth(2).setScale(0);
      this.tweens.add({ targets: sprite, scale: 1, duration: 260, ease: "Back.Out" });
      const maxHp = RARITIES[rarity].hp;
      const barBg = this.add.rectangle(cx, cy - 17, 28, 5, 0x000000, 0.7).setDepth(6).setVisible(false);
      const barFg = this.add.rectangle(cx - 13, cy - 17, 26, 3, RARITIES[rarity].color).setOrigin(0, 0.5).setDepth(7).setVisible(false);
      this.chests.set(key(x, y), { sprite, rarity, hp: maxHp, maxHp, barBg, barFg });
    }
  }

  /** Corte corpo a corpo (Jax): quebra um bloco adjacente gastando pouca stamina. */
  private slash(h: Runtime) {
    const target = DIRS.map(([dx, dy]) => [h.gx + dx, h.gy + dy] as [number, number])
      .find(([x, y]) => inBounds(x, y) && this.grid[y][x] === 2);
    if (!target) return;
    h.data.stamina -= 0.3;
    const [x, y] = target;
    const fx = this.add.image(x * T + T / 2, y * T + T / 2, "flame").setDepth(5).setTint(0xffffff).setScale(0.5);
    this.tweens.add({ targets: fx, scale: 1.2, alpha: 0, duration: 260, onComplete: () => fx.destroy() });
    this.breakBlock(x, y, h.data.luck);
  }

  private explode(bomb: Bomb) {
    if (this.bombs.get(key(bomb.gx, bomb.gy)) !== bomb) return; // mapa trocado antes da explosao
    const cells = this.blast(bomb.gx, bomb.gy, bomb.range); // calcular antes de remover blocos
    for (const [x, y] of cells) { // dano nos baus antes de quebrar blocos (baus novos nao sofrem esta explosao)
      const c = this.chests.get(key(x, y));
      if (c) this.hitChest(bomb.owner, x, y, c, bomb.dmg);
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
      this.breakBlock(x, y, bomb.luck);
    }
  }
}
