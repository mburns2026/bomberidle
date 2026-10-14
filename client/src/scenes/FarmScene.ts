import Phaser from "phaser";
import { RARITIES, Rarity, HeroData, store, addReward, rollChestRarity, assetUrl } from "../state";
import { makeTextures, makeHeroSprites, makeVignette, T, HERO_H, HERO_FOOT } from "../art";

const COLS = 29;
const ROWS = 17;
export const MAP_W = COLS * T;
export const MAP_H = ROWS * T;
export const GAME_W = MAP_W + 2 * T; // borda decorativa de 1 tile
export const GAME_H = MAP_H + 2 * T;

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x: number, y: number) => `${x},${y}`;
const footY = (gy: number) => gy * T + T - 6; // y dos pes do heroi dentro do tile
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

interface Runtime {
  data: HeroData;
  gx: number;
  gy: number;
  sprite: Phaser.GameObjects.Image;
  aura: Phaser.GameObjects.Image;
  barBg: Phaser.GameObjects.Rectangle;
  barFg: Phaser.GameObjects.Rectangle;
  zzz: Phaser.GameObjects.Text;
  sleeping: boolean;
  frame: number; // 1 e 2 = passos
}
interface Bomb { gx: number; gy: number; range: number; sprite: Phaser.GameObjects.Image }
interface Chest { sprite: Phaser.GameObjects.Image; aura?: Phaser.GameObjects.Image; rarity: Rarity }

/** Mapa em grade: herois NFT autonomos minerando caixas, abrindo baus e gastando stamina. */
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

  preload() {
    // rosto de cada NFT (usado para montar o token redondo do heroi)
    store.heroes.forEach((h) => this.load.image(`face_${h.id}`, assetUrl(`nft/${h.id}_face.webp`)));
  }

  create() {
    makeTextures(this);
    makeVignette(this, GAME_W, GAME_H);
    this.cameras.main.setScroll(-T, -T);

    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        this.add.image(x * T + T / 2, y * T + T / 2, `floor${(x * 7 + y * 3) % 3}`).setDepth(0);

    // borda: predios e dutos neon
    for (let y = -1; y <= ROWS; y++)
      for (let x = -1; x <= COLS; x++) {
        if (x >= 0 && x < COLS && y >= 0 && y < ROWS) continue;
        const px = x * T + T / 2, py = y * T + T / 2;
        this.add.image(px, py, (x + y) % 2 === 0 ? "wall_a" : "wall_b").setDepth(1);
      }

    this.buildMap();

    const mid = Math.floor(COLS / 2);
    const starts: [number, number][] = [
      [0, 0], [COLS - 1, 0], [0, ROWS - 1], [COLS - 1, ROWS - 1], [mid, 0], [mid, ROWS - 1],
    ];
    store.heroes.forEach((data, i) => {
      const [gx, gy] = starts[i % starts.length];
      const col = RARITIES[data.rarity].color;
      const base = makeHeroSprites(this, data);
      const aura = this.add.image(gx * T + T / 2, footY(gy) - 30, "glow")
        .setTint(col).setBlendMode(Phaser.BlendModes.ADD).setScale(0.62).setAlpha(0.5).setDepth(3.5);
      this.tweens.add({ targets: aura, alpha: { from: 0.3, to: 0.75 }, duration: 900 + i * 90, yoyo: true, repeat: -1 });
      const sprite = this.add.image(gx * T + T / 2, footY(gy), `${base}_0`).setOrigin(0.5, HERO_FOOT / HERO_H).setDepth(4);
      const barBg = this.add.rectangle(0, 0, 46, 8, 0x000000, 0.7).setDepth(6);
      const barFg = this.add.rectangle(0, 0, 42, 5, col).setOrigin(0, 0.5).setDepth(7);
      const zzz = this.add.text(0, 0, "Zzz", { fontFamily: "monospace", fontSize: "20px", color: "#9fefff", stroke: "#000", strokeThickness: 4 }).setDepth(7);
      const h: Runtime = { data, gx, gy, sprite, aura, barBg, barFg, zzz, sleeping: false, frame: 0 };
      this.heroes.push(h);
      this.time.addEvent({ delay: 450 / data.speed, loop: true, callback: () => this.tick(h) });

      // brilho extra para os mais raros
      if (data.rarity === "supreme" || data.rarity === "legendary") {
        this.time.addEvent({
          delay: data.rarity === "supreme" ? 280 : 650,
          loop: true,
          callback: () => this.burst(h.sprite.x, h.sprite.y - 40, col, 2, 0.5),
        });
      }
    });

    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.checkRegen() });

    // linhas de varredura e vinheta por cima de tudo
    this.add.tileSprite(-T, -T, GAME_W, GAME_H, "scan").setOrigin(0, 0).setDepth(20).setAlpha(0.5);
    this.add.image(MAP_W / 2, MAP_H / 2, "vignette").setDepth(21);
  }

  update() {
    for (const h of this.heroes) {
      const { x, y } = h.sprite;
      h.aura.setPosition(x, y - 30).setVisible(!h.sleeping);
      h.sprite.setDepth(4 + y / 10000); // quem esta mais abaixo aparece na frente
      h.barBg.setPosition(x, y - 84);
      h.barFg.setPosition(x - 21, y - 84);
      h.barFg.width = Math.max(0, 42 * (h.data.stamina / h.data.maxStamina));
      h.zzz.setPosition(x + 14, y - 112).setVisible(h.sleeping);
      h.sprite.setAlpha(h.sleeping ? 0.6 : 1);
    }
  }

  // ---------- mapa ----------
  private clearChest(c: Chest) {
    if (c.aura) {
      this.tweens.killTweensOf(c.aura);
      c.aura.destroy();
    }
    c.sprite.destroy();
  }

  private buildMap() {
    this.mapObjs.forEach((o) => o.destroy());
    this.mapObjs = [];
    this.chests.forEach((c) => this.clearChest(c));
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
      this.cameras.main.flash(300, 45, 226, 230, false);
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
      d.stamina = Math.min(d.maxStamina, d.stamina + 0.12 * (d.perk.regen ?? 1));
      if (d.stamina >= d.maxStamina * 0.5) h.sleeping = false;
      say("Recarregando");
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
    if (bp) { this.idle = 0; say("Procurando caixas"); this.step(h, bp[0]); return; }

    this.idle++;
    say("Sem caminho");
  }

  private step(h: Runtime, [nx, ny]: [number, number]) {
    h.gx = nx; h.gy = ny;
    const dur = 450 / h.data.speed;
    this.tweens.add({
      targets: h.sprite,
      x: nx * T + T / 2,
      y: footY(ny),
      duration: dur * 0.85,
    });
    // caminhada: alterna os quadros de passo e volta a posicao parada no fim
    h.frame = h.frame === 1 ? 2 : 1;
    h.sprite.setTexture(`hero_${h.data.id}_${h.frame}`);
    this.time.delayedCall(dur * 0.85, () => { if (h.frame !== 0) h.sprite.setTexture(`hero_${h.data.id}_0`); });
    this.tweens.add({ targets: h.sprite, scaleY: 0.95, scaleX: 1.04, duration: dur * 0.42, yoyo: true });
    const chest = this.chests.get(key(nx, ny));
    if (chest) this.openChest(h, nx, ny, chest);
  }

  private floatText(x: number, y: number, text: string, color: string, size = 24) {
    const t = this.add.text(x, y, text, {
      fontFamily: "Orbitron, monospace", fontSize: `${size}px`, color, stroke: "#07050f", strokeThickness: 5,
    }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: t, y: y - 56, alpha: 0, duration: 1000, onComplete: () => t.destroy() });
  }

  private openChest(h: Runtime, x: number, y: number, chest: Chest) {
    const base = RARITIES[chest.rarity].chest;
    const crit = Math.random() < (h.data.perk.crit ?? 0);
    const value = Math.round(base * RARITIES[h.data.rarity].mult * (1 + h.data.power * 0.05) * (crit ? 2 : 1) * 100) / 100;
    addReward(value);
    this.chests.delete(key(x, y));
    this.clearChest(chest);
    const cx = x * T + T / 2, cy = y * T + T / 2;
    this.burst(cx, cy, RARITIES[chest.rarity].color, crit ? 18 : 10);
    this.floatText(cx, cy - T / 2, `+${value}`, "#ffe27a");
    if (crit) this.floatText(cx, cy - T, `${h.data.perk.name.toUpperCase()}!`, RARITIES[h.data.rarity].css, 18);
  }

  private placeBomb(h: Runtime) {
    const free = Math.random() < (h.data.perk.refund ?? 0);
    if (free) this.floatText(h.sprite.x, h.sprite.y - T, "GRÁTIS", "#2de2e6", 18);
    else h.data.stamina -= 1;
    const range = Math.min(5, 1 + Math.ceil(h.data.power / 2) + (h.data.perk.range ?? 0));
    const sprite = this.add.image(h.gx * T + T / 2, h.gy * T + T / 2, "bomb").setDepth(3);
    this.tweens.add({ targets: sprite, scale: 1.15, duration: 280, yoyo: true, repeat: -1 });
    const bomb: Bomb = { gx: h.gx, gy: h.gy, range, sprite };
    this.bombs.set(key(h.gx, h.gy), bomb);
    this.time.delayedCall(1400, () => this.explode(bomb));
  }

  private burst(x: number, y: number, tint: number, n: number, speed = 1) {
    const p = this.add.particles(x, y, "spark", {
      speed: { min: 80 * speed, max: 260 * speed }, lifespan: 450, scale: { start: 1.2, end: 0 }, tint, quantity: n, emitting: false,
    }).setDepth(6);
    p.explode(n);
    this.time.delayedCall(600, () => p.destroy());
  }

  private spawnChest(x: number, y: number) {
    const rarity = rollChestRarity();
    const cx = x * T + T / 2, cy = y * T + T / 2;
    const sprite = this.add.image(cx, cy, `chest_${rarity}`).setDepth(2).setScale(0);
    this.tweens.add({ targets: sprite, scale: 1, duration: 260, ease: "Back.Out" });
    let aura: Phaser.GameObjects.Image | undefined;
    if (rarity !== "common") {
      aura = this.add.image(cx, cy, "glow")
        .setTint(RARITIES[rarity].color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.55).setAlpha(0.5).setDepth(1.5);
      this.tweens.add({ targets: aura, alpha: { from: 0.3, to: 0.7 }, duration: 700, yoyo: true, repeat: -1 });
    }
    this.chests.set(key(x, y), { sprite, aura, rarity });
  }

  private explode(bomb: Bomb) {
    const cells = this.blast(bomb.gx, bomb.gy, bomb.range); // calcular antes de remover blocos
    this.bombs.delete(key(bomb.gx, bomb.gy));
    this.tweens.killTweensOf(bomb.sprite);
    bomb.sprite.destroy();
    this.cameras.main.shake(90, 0.002);

    for (const [x, y] of cells) {
      const cx = x * T + T / 2, cy = y * T + T / 2;
      const flame = this.add.image(cx, cy, "flame").setDepth(5).setScale(0.6).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: flame, scale: 1.5, alpha: 0, duration: 420, onComplete: () => flame.destroy() });
      this.burst(cx, cy, 0x2de2e6, 5);

      if (this.grid[y][x] === 2) {
        this.grid[y][x] = 0;
        this.blockSprites[y][x]?.destroy();
        this.blockSprites[y][x] = null;
        this.blocksLeft--;
        this.burst(cx, cy, 0xff3d8b, 8);
        if (Math.random() < 0.3) this.spawnChest(x, y);
      }
    }
  }
}
