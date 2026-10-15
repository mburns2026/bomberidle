import Phaser from "phaser";
import { RARITIES, Rarity, HeroData, store, addReward } from "../state";

const T = 32;
const COLS = 29;
const ROWS = 17;
export const MAP_W = COLS * T;
export const MAP_H = ROWS * T;

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x: number, y: number) => `${x},${y}`;
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const RARITY_LIST: Rarity[] = ["common", "rare", "epic", "legendary"];

interface Runtime {
  data: HeroData;
  gx: number;
  gy: number;
  sprite: Phaser.GameObjects.Image;
  barBg: Phaser.GameObjects.Rectangle;
  barFg: Phaser.GameObjects.Rectangle;
  zzz: Phaser.GameObjects.Text;
  sleeping: boolean;
}
interface Bomb { gx: number; gy: number; range: number; sprite: Phaser.GameObjects.Image }
interface Chest { sprite: Phaser.GameObjects.Image; rarity: Rarity }

/** Mapa em grade: herois autonomos minerando blocos, abrindo baus e gastando stamina. */
export class FarmScene extends Phaser.Scene {
  private grid: number[][] = []; // 0 livre, 1 pilar, 2 bloco
  private blockSprites: (Phaser.GameObjects.Image | null)[][] = [];
  private mapObjs: Phaser.GameObjects.GameObject[] = [];
  private blocksLeft = 0;
  private chests = new Map<string, Chest>();
  private bombs = new Map<string, Bomb>();
  private heroes: Runtime[] = [];
  private idle = 0;

  constructor() { super("farm"); }

  create() {
    this.makeTextures();
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        this.add.image(x * T + T / 2, y * T + T / 2, `grass${(x * 7 + y * 3) % 2}`).setDepth(0);

    this.buildMap();

    const corners: [number, number][] = [[0, 0], [COLS - 1, 0], [0, ROWS - 1], [COLS - 1, ROWS - 1]];
    store.heroes.forEach((data, i) => {
      const [gx, gy] = corners[i % corners.length];
      const sprite = this.add.image(gx * T + T / 2, gy * T + T / 2, `hero_${data.rarity}`).setDepth(4);
      const barBg = this.add.rectangle(0, 0, 22, 5, 0x000000, 0.65).setDepth(6);
      const barFg = this.add.rectangle(0, 0, 20, 3, RARITIES[data.rarity].color).setOrigin(0, 0.5).setDepth(7);
      const zzz = this.add.text(0, 0, "Zzz", { fontFamily: "monospace", fontSize: "12px", color: "#cfe8ff", stroke: "#000", strokeThickness: 3 }).setDepth(7);
      const h: Runtime = { data, gx, gy, sprite, barBg, barFg, zzz, sleeping: false };
      this.heroes.push(h);
      this.time.addEvent({ delay: 450 / data.speed, loop: true, callback: () => this.tick(h) });
    });

    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.checkRegen() });
  }

  update() {
    for (const h of this.heroes) {
      const { x, y } = h.sprite;
      h.barBg.setPosition(x, y - 19);
      h.barFg.setPosition(x - 10, y - 19);
      h.barFg.width = Math.max(0, 20 * (h.data.stamina / h.data.maxStamina));
      h.zzz.setPosition(x + 6, y - 32).setVisible(h.sleeping);
    }
  }

  // ---------- arte procedural (original, sem assets externos) ----------
  private makeTextures() {
    const mk = (name: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      draw(g);
      g.generateTexture(name, T, T);
      g.destroy();
    };
    mk("grass0", (g) => { g.fillStyle(0x4c8a2e).fillRect(0, 0, T, T); g.fillStyle(0x58983b).fillRect(4, 6, 3, 3).fillRect(21, 22, 3, 3); });
    mk("grass1", (g) => { g.fillStyle(0x4a862c).fillRect(0, 0, T, T); g.fillStyle(0x58983b).fillRect(18, 8, 3, 3).fillRect(7, 24, 3, 3); });
    mk("pillar", (g) => {
      g.fillStyle(0x7a2418).fillRect(2, 14, 28, 16);
      g.fillStyle(0xb03a2e).fillRect(2, 4, 28, 12);
      g.fillStyle(0xd0584a).fillRect(6, 4, 4, 12).fillRect(14, 4, 4, 12).fillRect(22, 4, 4, 12);
      g.fillStyle(0xf0d9a8).fillRect(12, 20, 8, 10);
    });
    mk("block", (g) => {
      g.fillStyle(0xd9a066).fillRect(1, 1, 30, 30);
      g.fillStyle(0xa8743c).fillRect(1, 10, 30, 2).fillRect(1, 21, 30, 2).fillRect(15, 1, 2, 9).fillRect(7, 12, 2, 9).fillRect(23, 12, 2, 9).fillRect(15, 23, 2, 8);
    });
    for (const r of RARITY_LIST) {
      const c = RARITIES[r].color;
      mk(`chest_${r}`, (g) => {
        g.fillStyle(0x3a220e).fillRect(4, 9, 24, 19);
        g.fillStyle(c).fillRect(6, 11, 20, 15);
        g.fillStyle(0x000000, 0.22).fillRect(6, 18, 20, 8);
        g.fillStyle(0x3a220e).fillRect(6, 16, 20, 2);
        g.fillStyle(0xffd24a).fillRect(14, 15, 4, 6);
      });
      mk(`hero_${r}`, (g) => {
        g.fillStyle(0x000000, 0.25).fillEllipse(16, 28, 18, 6);
        g.fillStyle(c).fillRect(10, 15, 12, 11);
        g.fillStyle(0xf1c9a0).fillRect(10, 6, 12, 10);
        g.fillStyle(c).fillRect(9, 3, 14, 6);
        g.fillStyle(0x222222).fillRect(13, 10, 2, 3).fillRect(18, 10, 2, 3);
        g.fillStyle(0x333333).fillRect(10, 26, 4, 3).fillRect(18, 26, 4, 3);
      });
    }
    mk("bomb", (g) => {
      g.fillStyle(0x1a1a1a).fillCircle(16, 19, 9);
      g.fillStyle(0x666666).fillCircle(13, 16, 2);
      g.fillStyle(0x7a4a1c).fillRect(15, 6, 3, 5);
      g.fillStyle(0xffd24a).fillRect(14, 3, 5, 4);
    });
  }

  // ---------- mapa ----------
  private buildMap() {
    this.mapObjs.forEach((o) => o.destroy());
    this.mapObjs = [];
    this.chests.forEach((c) => c.sprite.destroy());
    this.chests.clear();
    this.blocksLeft = 0;

    const keep = new Set<string>();
    this.heroes.forEach((h) => {
      keep.add(key(h.gx, h.gy));
      DIRS.forEach(([dx, dy]) => keep.add(key(h.gx + dx, h.gy + dy)));
    });

    this.grid = [];
    this.blockSprites = [];
    for (let y = 0; y < ROWS; y++) {
      this.grid[y] = [];
      this.blockSprites[y] = [];
      for (let x = 0; x < COLS; x++) {
        const px = x * T + T / 2, py = y * T + T / 2;
        const pillar = x % 2 === 1 && y % 2 === 1;
        const dx = Math.min(x, COLS - 1 - x), dy = Math.min(y, ROWS - 1 - y);
        const safe = dx + dy <= 2 || keep.has(key(x, y));
        const block = !pillar && !safe && Math.random() < 0.45;
        this.grid[y][x] = pillar ? 1 : block ? 2 : 0;
        this.blockSprites[y][x] = null;
        if (pillar) this.mapObjs.push(this.add.image(px, py, "pillar").setDepth(1));
        if (block) {
          const s = this.add.image(px, py, "block").setDepth(1);
          this.blockSprites[y][x] = s;
          this.mapObjs.push(s);
          this.blocksLeft++;
        }
      }
    }
  }

  private checkRegen() {
    const stuck = this.idle >= 40 && this.bombs.size === 0;
    if ((this.blocksLeft === 0 && this.bombs.size === 0) || stuck) {
      this.idle = 0;
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
      d.stamina = Math.min(d.maxStamina, d.stamina + 0.12);
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

    const cp = this.bfs(h.gx, h.gy, (x, y) => this.chests.has(key(x, y)), danger);
    if (cp) { this.idle = 0; say("Indo ao baú"); this.step(h, cp[0]); return; }

    if (this.nextToBlock(h.gx, h.gy)) { this.idle = 0; say("Plantando bomba"); this.placeBomb(h); return; }

    const bp = this.bfs(h.gx, h.gy, (x, y) => this.nextToBlock(x, y), danger);
    if (bp) { this.idle = 0; say("Procurando blocos"); this.step(h, bp[0]); return; }

    this.idle++;
    say("Sem caminho");
  }

  private step(h: Runtime, [nx, ny]: [number, number]) {
    if (nx !== h.gx) h.sprite.setFlipX(nx < h.gx);
    h.gx = nx; h.gy = ny;
    this.tweens.add({
      targets: h.sprite,
      x: nx * T + T / 2,
      y: ny * T + T / 2,
      duration: (450 / h.data.speed) * 0.85,
    });
    const chest = this.chests.get(key(nx, ny));
    if (chest) this.openChest(h, nx, ny, chest);
  }

  private openChest(h: Runtime, x: number, y: number, chest: Chest) {
    const base = RARITIES[chest.rarity].chest;
    const value = Math.round(base * RARITIES[h.data.rarity].mult * (1 + h.data.power * 0.05) * 100) / 100;
    addReward(value);
    this.chests.delete(key(x, y));
    chest.sprite.destroy();
    const txt = this.add.text(x * T + T / 2, y * T, `+${value}`, {
      fontFamily: "monospace", fontSize: "14px", color: "#ffe27a", stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: txt, y: txt.y - 26, alpha: 0, duration: 900, onComplete: () => txt.destroy() });
  }

  private placeBomb(h: Runtime) {
    h.data.stamina -= 1;
    const range = Math.min(4, 1 + Math.ceil(h.data.power / 2));
    const sprite = this.add.image(h.gx * T + T / 2, h.gy * T + T / 2, "bomb").setDepth(3);
    this.tweens.add({ targets: sprite, scale: 1.15, duration: 280, yoyo: true, repeat: -1 });
    const bomb: Bomb = { gx: h.gx, gy: h.gy, range, sprite };
    this.bombs.set(key(h.gx, h.gy), bomb);
    this.time.delayedCall(1400, () => this.explode(bomb));
  }

  private rollRarity(): Rarity {
    const r = Math.random() * 100;
    return r < 70 ? "common" : r < 90 ? "rare" : r < 98 ? "epic" : "legendary";
  }

  private explode(bomb: Bomb) {
    const cells = this.blast(bomb.gx, bomb.gy, bomb.range); // calcular antes de remover blocos
    this.bombs.delete(key(bomb.gx, bomb.gy));
    this.tweens.killTweensOf(bomb.sprite);
    bomb.sprite.destroy();
    this.cameras.main.shake(90, 0.002);

    for (const [x, y] of cells) {
      const cx = x * T + T / 2, cy = y * T + T / 2;
      const flame = this.add.rectangle(cx, cy, T - 4, T - 4, 0xffa42b, 0.9).setDepth(5);
      this.tweens.add({ targets: flame, alpha: 0, scale: 1.25, duration: 380, onComplete: () => flame.destroy() });

      if (this.grid[y][x] === 2) {
        this.grid[y][x] = 0;
        this.blockSprites[y][x]?.destroy();
        this.blockSprites[y][x] = null;
        this.blocksLeft--;
        if (Math.random() < 0.3) {
          const rarity = this.rollRarity();
          const sprite = this.add.image(cx, cy, `chest_${rarity}`).setDepth(2).setScale(0);
          this.tweens.add({ targets: sprite, scale: 1, duration: 260, ease: "Back.Out" });
          this.chests.set(key(x, y), { sprite, rarity });
        }
      }
    }
  }
}
