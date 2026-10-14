import Phaser from "phaser";
import { RARITIES, RARITY_ORDER, HeroData, Rarity } from "./state";

/** Fator de resolucao: a arte e desenhada numa grade de 32 unidades e ampliada por K. */
export const K = 2;
export const U = 32; // unidades por tile
export const T = U * K; // pixels por tile

const OUT = 0x07050f;
const CYAN = 0x2de2e6;
const MAGENTA = 0xff3d8b;
const VIOLET = 0xb45cff;
const AMBER = 0xffb020;

type G = Phaser.GameObjects.Graphics;

// Helpers em "unidades"; tudo e multiplicado por K ao desenhar.
const R = (g: G, c: number, x: number, y: number, w: number, h: number, a = 1) =>
  g.fillStyle(c, a).fillRect(x * K, y * K, w * K, h * K);
const C = (g: G, c: number, x: number, y: number, r: number, a = 1) =>
  g.fillStyle(c, a).fillCircle(x * K, y * K, r * K);
const E = (g: G, c: number, x: number, y: number, w: number, h: number, a = 1) =>
  g.fillStyle(c, a).fillEllipse(x * K, y * K, w * K, h * K);
const SR = (g: G, c: number, x: number, y: number, w: number, h: number, lw = 1, a = 1) =>
  g.lineStyle(lw * K, c, a).strokeRect(x * K, y * K, w * K, h * K);
const SC = (g: G, c: number, x: number, y: number, r: number, lw = 1, a = 1) =>
  g.lineStyle(lw * K, c, a).strokeCircle(x * K, y * K, r * K);
const L = (g: G, c: number, x1: number, y1: number, x2: number, y2: number, lw = 1, a = 1) =>
  g.lineStyle(lw * K, c, a).lineBetween(x1 * K, y1 * K, x2 * K, y2 * K);
const TRI = (g: G, c: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, a = 1) =>
  g.fillStyle(c, a).fillTriangle(x1 * K, y1 * K, x2 * K, y2 * K, x3 * K, y3 * K);

const shade = (c: number, f: number) => {
  const ch = (v: number) => Math.min(255, Math.round(v * f));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
};
const shadow = (g: G, w = 24) => E(g, 0x000000, 16, 29, w, 6, 0.45);

/** Gerador pseudo-aleatorio simples para que a arte seja sempre igual. */
function lcg(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** Neon: contorno brilhante com halos suaves. */
function neonRect(g: G, c: number, x: number, y: number, w: number, h: number) {
  SR(g, c, x - 1.5, y - 1.5, w + 3, h + 3, 3, 0.1);
  SR(g, c, x - 0.5, y - 0.5, w + 1, h + 1, 2, 0.25);
  SR(g, c, x, y, w, h, 1, 1);
}

/** Arte procedural cyberpunk. Gera todas as texturas do jogo. */
export function makeTextures(s: Phaser.Scene) {
  const mk = (name: string, draw: (g: G) => void, w = T, h = T) => {
    if (s.textures.exists(name)) return;
    const g = s.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(name, w, h);
    g.destroy();
  };

  // ---------- piso: asfalto escuro com grade e circuitos ----------
  const floorBase = [0x0c0a20, 0x0e0b26, 0x0a091c];
  for (let i = 0; i < 3; i++) {
    mk(`floor${i}`, (g) => {
      R(g, floorBase[i], 0, 0, U, U);
      R(g, 0x13103a, 1, 1, U - 2, U - 2, 0.55);
      // juntas da grade (neon azul bem fraco)
      R(g, 0x2a4fa8, 0, U - 1, U, 1, 0.45);
      R(g, 0x2a4fa8, U - 1, 0, 1, U, 0.45);
      R(g, 0x4aa8ff, 0, 0, U, 1, 0.07);
      if (i === 0) {
        L(g, CYAN, 4, 20, 14, 20, 1, 0.22); L(g, CYAN, 14, 20, 14, 12, 1, 0.22); L(g, CYAN, 14, 12, 24, 12, 1, 0.22);
        C(g, CYAN, 24, 12, 1.4, 0.5); C(g, CYAN, 4, 20, 1.2, 0.4);
      } else if (i === 1) {
        R(g, MAGENTA, 6, 8, 2, 2, 0.5); R(g, VIOLET, 22, 22, 2, 2, 0.5);
        L(g, VIOLET, 8, 9, 20, 9, 1, 0.14);
      } else {
        L(g, 0x4aa8ff, 6, 26, 26, 6, 1, 0.1);
        R(g, CYAN, 20, 24, 2, 2, 0.35);
      }
    });
  }

  // ---------- pilar indestrutivel: torre de dados ----------
  mk("pillar", (g) => {
    shadow(g, 27);
    R(g, OUT, 3, 5, 26, 24);
    R(g, 0x1a1745, 4, 6, 24, 22);
    R(g, 0x272264, 4, 6, 24, 3);
    R(g, 0x100e2c, 4, 24, 24, 4);
    neonRect(g, CYAN, 4, 6, 24, 22);
    const winCols = [CYAN, MAGENTA, 0x3a3478];
    const rnd = lcg(7);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        const c = winCols[Math.floor(rnd() * 3)];
        R(g, c, 8 + col * 7, 11 + row * 5, 5, 3, c === 0x3a3478 ? 1 : 0.9);
      }
    R(g, MAGENTA, 4, 25, 24, 1, 0.8);
    R(g, CYAN, 14, 2, 4, 4, 0.9);
    R(g, 0xffffff, 15, 3, 2, 2, 0.9);
  });

  // ---------- bloco destrutivel: caixa de carga ----------
  mk("block", (g) => {
    shadow(g, 27);
    R(g, OUT, 3, 4, 26, 25);
    R(g, 0x2c2358, 4, 5, 24, 23);
    R(g, 0x3f337c, 4, 5, 24, 3);
    R(g, 0x1b1638, 4, 24, 24, 4);
    // listras de aviso nos cantos
    for (let i = 0; i < 3; i++) {
      R(g, AMBER, 5 + i * 4, 5, 2, 3, 0.9);
      R(g, AMBER, 21 + i * 2, 25, 2, 3, 0.9);
    }
    L(g, 0x5b4aa8, 4, 28, 28, 5, 1, 0.9);
    L(g, 0x5b4aa8, 4, 5, 28, 28, 1, 0.6);
    TRI(g, MAGENTA, 16, 11, 21, 16, 16, 21);
    TRI(g, 0xff9ec4, 16, 11, 11, 16, 16, 21);
    neonRect(g, MAGENTA, 4, 5, 24, 23);
  });

  // ---------- borda do mapa: predios e dutos ----------
  const wall = (name: string, seed: number, neon: number) =>
    mk(name, (g) => {
      R(g, 0x070614, 0, 0, U, U);
      R(g, 0x0f0c26, 1, 3, U - 2, U - 3);
      const rnd = lcg(seed);
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 5; col++) {
          const v = rnd();
          if (v < 0.45) continue;
          R(g, v < 0.7 ? AMBER : v < 0.88 ? CYAN : MAGENTA, 3 + col * 6, 6 + row * 6, 3, 3, 0.85);
        }
      R(g, neon, 0, 0, U, 2, 0.95);
      R(g, neon, 0, 0, U, 5, 0.12);
      R(g, 0x2a4fa8, 0, U - 1, U, 1, 0.5);
    });
  wall("wall_a", 11, CYAN);
  wall("wall_b", 23, MAGENTA);

  // ---------- baus e herois por raridade ----------
  RARITY_ORDER.forEach((r: Rarity) => {
    const c = RARITIES[r].color;
    const l = shade(c, 1.35);
    const d = r === "supreme" ? 0x6b4a0a : shade(c, 0.35);
    const lid = r === "supreme" ? 0xd9a21a : shade(c, 0.6);
    mk(`chest_${r}`, (g) => {
      shadow(g);
      if (r === "mythic" || r === "legendary" || r === "supreme") C(g, c, 16, 18, 14, 0.14);
      R(g, OUT, 4, 10, 24, 18);
      R(g, d, 5, 11, 22, 16);
      R(g, lid, 5, 11, 22, 3);
      R(g, c, 5, 17, 22, 1.5);
      neonRect(g, c, 5, 11, 22, 16);
      R(g, OUT, 13, 15, 6, 8);
      R(g, l, 14, 16, 4, 6);
      R(g, 0xffffff, 15, 17, 2, 2, 0.9);
      if (r === "epic" || r === "mythic" || r === "legendary" || r === "supreme") {
        R(g, 0xffffff, 8, 5, 1, 4); R(g, 0xffffff, 6, 7, 5, 1);
        R(g, 0xffffff, 24, 3, 1, 3); R(g, 0xffffff, 23, 4, 3, 1);
      }
      if (r === "supreme") {
        SR(g, 0xffffff, 3, 9, 26, 20, 1, 0.8);
        TRI(g, 0xffffff, 16, 2, 18, 8, 14, 8);
      }
    });
  });

  // ---------- bomba de plasma ----------
  mk("bomb", (g) => {
    shadow(g, 20);
    C(g, MAGENTA, 16, 19, 13, 0.14);
    C(g, OUT, 16, 19, 10);
    C(g, 0x25213f, 16, 19, 9);
    C(g, 0x4a4678, 12, 15, 3);
    R(g, 0xffffff, 11, 14, 1, 1, 0.9);
    SC(g, MAGENTA, 16, 19, 9, 1.4, 1);
    C(g, MAGENTA, 16, 20, 4, 0.95);
    C(g, 0xffd6e8, 16, 20, 2, 1);
    R(g, 0x8a86b0, 14, 7, 4, 4);
    R(g, CYAN, 13, 3, 6, 4, 0.95);
    R(g, 0xffffff, 15, 4, 2, 2, 0.95);
  });

  // ---------- explosao de plasma ----------
  mk("flame", (g) => {
    C(g, MAGENTA, 16, 16, 15, 0.5);
    C(g, CYAN, 16, 16, 11, 0.85);
    C(g, 0xdffcff, 16, 16, 6.5, 1);
    C(g, 0xffffff, 16, 16, 3, 1);
  });

  mk("spark", (g) => R(g, 0xffffff, 0, 0, 6, 6), 6 * K, 6 * K);

  // aura generica (sera tingida com a cor da raridade)
  mk(
    "glow",
    (g) => {
      for (let r = 30; r >= 2; r -= 2) C(g, 0xffffff, 32, 32, r, 0.04);
    },
    64 * K,
    64 * K
  );

  // linhas de varredura (CRT)
  mk("scan", (g) => g.fillStyle(0x000000, 0.35).fillRect(0, 0, 4, 2), 4, 4);
}

/** Vinheta escura nas bordas, desenhada num canvas. */
export function makeVignette(s: Phaser.Scene, w: number, h: number) {
  if (s.textures.exists("vignette")) return;
  const tex = s.textures.createCanvas("vignette", w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(3,0,12,0.7)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
}

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

/**
 * Cria o "token" redondo do heroi a partir do rosto do NFT (textura `face_<id>`),
 * com anel neon na cor da raridade. Retorna o nome da textura.
 */
export function makeHeroToken(s: Phaser.Scene, h: HeroData): string {
  const name = `hero_${h.id}`;
  if (s.textures.exists(name)) return name;
  const size = T;
  const tex = s.textures.createCanvas(name, size, size);
  if (!tex) return name;
  const ctx = tex.getContext();
  const col = hex(RARITIES[h.rarity].color);
  const c = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0818";
  ctx.fill();

  const faceKey = `face_${h.id}`;
  if (s.textures.exists(faceKey)) {
    const img = s.textures.get(faceKey).getSourceImage() as CanvasImageSource;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 6, 6, size - 12, size - 12);
    ctx.restore();
  } else {
    ctx.fillStyle = col;
    ctx.font = `bold ${Math.round(size * 0.5)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(h.name.charAt(0), c, c + 2);
  }

  ctx.lineWidth = 4;
  ctx.strokeStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(c, c, c - 3, 0, Math.PI * 2);
  ctx.stroke();
  if (h.rarity === "supreme") {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(c, c, c - 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }
  tex.refresh();
  return name;
}
