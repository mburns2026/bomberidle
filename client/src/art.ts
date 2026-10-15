import Phaser from "phaser";
import { RARITIES, Rarity } from "./state";
import { MAPS, MapDef } from "./maps";

export const T = 32;
const OUT = 0x05060f, SKIN = 0xf1c9a0, CY = 0x39e6ff, MG = 0xff3fd0, PU = 0x9b5cff;
type G = Phaser.GameObjects.Graphics;
type MK = (name: string, draw: (g: G) => void, w?: number, h?: number) => void;
const R = (g: G, c: number, x: number, y: number, w: number, h: number, a = 1) => g.fillStyle(c, a).fillRect(x, y, w, h);
const shade = (c: number, f: number) => {
  const ch = (v: number) => Math.min(255, Math.round(v * f));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
};
const shadow = (g: G, w = 22) => g.fillStyle(0x000000, 0.4).fillEllipse(16, 29, w, 6);

// ---------- personagens: esqueleto comum + visual proprio, 4 quadros de caminhada ----------
interface Look {
  w: number; suit: number; trim: number; legs: number;
  back?: (g: G, f: number) => void;
  head: (g: G) => void;
  front?: (g: G, f: number) => void;
}

function drawChar(g: G, L: Look, f: number) {
  const lift = [[0, 0], [-2, 0], [0, 0], [0, -2]][f], bob = [0, -1, 0, -1][f], sw = [0, 1, 0, -1][f];
  L.back?.(g, f);
  shadow(g, 12 + L.w * 2);
  [16 - L.w + 1, 16 + L.w - 5].forEach((x, i) => {
    const dy = lift[i];
    R(g, OUT, x, 24 + dy, 4, 5); R(g, L.legs, x + 1, 24 + dy, 2, 4); R(g, shade(L.legs, 1.7), x + 1, 24 + dy, 1, 3);
  });
  g.translateCanvas(0, bob);
  const x0 = 16 - L.w, tw = L.w * 2;
  R(g, OUT, x0 - 1, 13, tw + 2, 12); R(g, L.suit, x0, 14, tw, 10);
  R(g, shade(L.suit, 1.4), x0, 14, tw, 2); R(g, shade(L.suit, 0.65), x0, 22, tw, 2); R(g, shade(L.suit, 1.5), x0, 14, 1, 8);
  R(g, L.trim, 15, 15, 2, 8);
  R(g, OUT, x0 - 3, 15 + sw, 3, 8); R(g, L.suit, x0 - 2, 16 + sw, 2, 5); R(g, SKIN, x0 - 2, 21 + sw, 2, 2);
  R(g, OUT, x0 + tw, 15 - sw, 3, 8); R(g, L.suit, x0 + tw, 16 - sw, 2, 5); R(g, SKIN, x0 + tw, 21 - sw, 2, 2);
  L.head(g);
  L.front?.(g, f);
}

const LOOKS: Record<Rarity, Look> = {
  common: { w: 5, suit: 0x3a3f5c, trim: PU, legs: 0x1b1f33, // Lyra
    head: (g) => { R(g, OUT, 9, 3, 14, 13); R(g, SKIN, 10, 6, 12, 9); R(g, 0xd4a77c, 10, 13, 12, 2); R(g, 0x14121f, 9, 2, 14, 6); R(g, 0x14121f, 9, 6, 2, 6); R(g, OUT, 10, 9, 12, 4); R(g, CY, 10, 9, 12, 3); R(g, 0xbff6ff, 12, 10, 2, 1); R(g, 0xbff6ff, 18, 10, 2, 1); },
    front: (g, f) => { R(g, 0xc0c8d4, 24, 12, 2, 6); R(g, 0xc0c8d4, 23, 11, 4, 2); R(g, f % 2 ? 0xffd24a : 0xff9a3c, 25, 9, 2, 2); } },
  rare: { w: 8, suit: 0x2b2a44, trim: CY, legs: 0x1d1d33, // Titan
    head: (g) => { R(g, OUT, 9, 2, 14, 12); R(g, 0x3b3a5c, 10, 3, 12, 10); R(g, 0x57567e, 10, 3, 12, 2); R(g, CY, 11, 7, 4, 3); R(g, MG, 17, 7, 4, 3); R(g, 0x1d1d33, 12, 11, 8, 2); },
    front: (g) => { [[2, 0], [22, 0]].forEach(([x]) => { R(g, OUT, x, 11, 8, 8); R(g, 0x7b4bd6, x + 1, 12, 6, 6); R(g, PU, x + 1, 12, 6, 2); R(g, 0x5a38a8, x + 1, 16, 6, 2); }); R(g, 0x9b6cff, 8, 15, 16, 2); } },
  epic: { w: 6, suit: 0x2c4a6b, trim: PU, legs: 0x23283c, // Vex
    head: (g) => { R(g, OUT, 10, 3, 12, 12); R(g, SKIN, 11, 5, 10, 9); R(g, 0x1a1530, 10, 2, 12, 4); R(g, 0x1a1530, 12, 0, 2, 3); R(g, 0x1a1530, 17, 0, 2, 3); R(g, PU, 10, 8, 12, 3); R(g, 0xe0c8ff, 12, 9, 3, 1); R(g, 0xe0c8ff, 17, 9, 3, 1); },
    front: (g, f) => { R(g, CY, 25, 5, 6, 9, f % 2 ? 0.5 : 0.35); R(g, 0x9bf6ff, 25, 5, 6, 1); R(g, 0x9bf6ff, 25, 13, 6, 1); R(g, 0x9bf6ff, 26, 8, 3, 1); } },
  mythic: { w: 4, suit: 0x14161f, trim: CY, legs: 0x2a3040, // Kira
    head: (g) => { R(g, OUT, 10, 2, 12, 12); R(g, 0x14161f, 11, 3, 10, 10); R(g, 0xaab4c8, 11, 3, 10, 2); R(g, 0x3a4458, 11, 5, 2, 7); R(g, CY, 15, 7, 2, 3); },
    front: (g, f) => { R(g, CY, 15, 17, 2, 3, f % 2 ? 1 : 0.7); for (let i = 0; i < 9; i++) { R(g, OUT, 21 + i, 20 - i, 3, 3); R(g, 0xdfe8ff, 22 + i, 20 - i, 1, 2); } } },
  legendary: { w: 6, suit: 0x6a3fb0, trim: MG, legs: 0x1a1530, // Jax
    back: (g) => { g.fillStyle(MG, 0.22).fillCircle(16, 16, 15); },
    head: (g) => { R(g, OUT, 10, 3, 12, 11); R(g, SKIN, 11, 5, 10, 8); R(g, 0x8f5cf0, 11, 10, 10, 4); R(g, MG, 13, 7, 2, 2); R(g, MG, 18, 7, 2, 2); R(g, 0x14121f, 11, 2, 10, 4); R(g, 0x14121f, 15, 0, 3, 3); },
    front: (g) => { R(g, OUT, 4, 12, 7, 5); R(g, 0x6a3fb0, 5, 13, 5, 3); R(g, 0x8f5cf0, 5, 13, 5, 1); R(g, OUT, 21, 12, 7, 5); R(g, 0x6a3fb0, 22, 13, 5, 3); R(g, 0x8f5cf0, 22, 13, 5, 1); R(g, 0xff7af0, 3, 14, 2, 13); R(g, 0xffd0fa, 3, 14, 1, 4); R(g, 0xff7af0, 27, 14, 2, 13); R(g, 0xffd0fa, 28, 14, 1, 4); } },
  super: { w: 6, suit: 0xf2c14a, trim: 0xffffff, legs: 0xd9a52e, // Orion
    back: (g, f) => {
      const d = [0, -1, 0, 1][f];
      g.fillStyle(0xfff4c2, 0.35).fillCircle(16, 15, 16); g.fillStyle(0xffffff, 0.25).fillCircle(16, 15, 11);
      R(g, OUT, 0, 6 + d, 9, 15); R(g, 0xe8ecf8, 1, 7 + d, 7, 13); R(g, 0xffffff, 1, 7 + d, 2, 13); R(g, 0xaab4d0, 3, 10 + d, 4, 1); R(g, 0xaab4d0, 2, 14 + d, 5, 1);
      R(g, OUT, 23, 6 + d, 9, 15); R(g, 0xe8ecf8, 24, 7 + d, 7, 13); R(g, 0xffffff, 29, 7 + d, 2, 13); R(g, 0xaab4d0, 25, 10 + d, 4, 1); R(g, 0xaab4d0, 25, 14 + d, 5, 1);
    },
    head: (g) => { R(g, OUT, 9, 2, 14, 13); R(g, OUT, 9, 0, 3, 4); R(g, OUT, 20, 0, 3, 4); R(g, 0xd9b46a, 10, 3, 12, 11); R(g, 0xd9b46a, 10, 1, 2, 3); R(g, 0xd9b46a, 20, 1, 2, 3); R(g, 0x2b6bff, 11, 7, 4, 4); R(g, 0x2b6bff, 17, 7, 4, 4); R(g, 0xffffff, 12, 8, 1, 1); R(g, 0xffffff, 18, 8, 1, 1); R(g, 0xf2c14a, 15, 10, 2, 4); },
    front: () => {} },
};
LOOKS.super.front = (g) => { R(g, 0xf2c14a, 27, 4, 2, 24); R(g, OUT, 26, 1, 4, 5); R(g, 0xfff0a0, 27, 2, 2, 3); };

// ---------- mapas: cada bioma gera o proprio conjunto de texturas (arte original) ----------
function mapTextures(mk: MK, m: MapDef) {
  const id = m.id;
  const spots: [number, number][][] = [[[5, 7], [22, 20], [13, 26]], [[18, 6], [7, 22], [26, 27]], [[10, 12], [24, 14], [4, 28]]];
  spots.forEach((pts, i) => mk(`${id}_floor${i}`, (g) => {
    R(g, m.floor[i], 0, 0, T, T);
    pts.forEach(([x, y]) => { R(g, m.tuft, x, y, 1, 3); R(g, m.tuft, x + 2, y + 1, 1, 2); R(g, m.tuft2, x + 1, y - 1, 1, 2); });
    if (i === 2 && (id === "meadow" || id === "jungle")) { R(g, 0xffffff, 20, 24, 2, 2); R(g, 0xffd24a, 21, 25, 1, 1); }
    if (i === 2 && id === "snow") { R(g, 0xffffff, 20, 24, 2, 1); R(g, 0xffffff, 8, 8, 1, 1); }
  }));

  mk(`${id}_pillar`, (g) => { // casinha do bioma
    shadow(g, 27);
    R(g, OUT, 3, 12, 26, 17); R(g, m.wall, 4, 14, 24, 14); R(g, shade(m.wall, 0.8), 4, 24, 24, 4);
    R(g, OUT, 2, 3, 28, 12); R(g, m.roof, 3, 4, 26, 10); R(g, shade(m.roof, 1.25), 3, 4, 26, 3);
    [7, 13, 19, 25].forEach((x) => R(g, shade(m.roof, 0.78), x - 1, 6, 2, 8));
    if (id === "snow") { R(g, 0xffffff, 3, 4, 26, 4); R(g, 0xdcebf7, 3, 7, 26, 1); }
    R(g, OUT, 12, 19, 8, 10); R(g, m.trim, 13, 20, 6, 9); R(g, 0xffd24a, 17, 24, 1, 2);
    const win = id === "volcano" ? 0xff8a2b : 0x8fd0ff;
    R(g, OUT, 5, 17, 5, 5); R(g, win, 6, 18, 3, 3); R(g, OUT, 22, 17, 5, 5); R(g, win, 23, 18, 3, 3);
  });

  mk(`${id}_block`, (g) => { // bloco destrutivel
    shadow(g, 27);
    R(g, OUT, 2, 3, 28, 26); R(g, m.crate, 3, 4, 26, 24); R(g, shade(m.crate, 1.25), 3, 4, 26, 3); R(g, shade(m.crate, 1.25), 3, 4, 3, 24);
    R(g, m.crateDark, 3, 25, 26, 3); R(g, m.crateDark, 26, 4, 3, 24);
    [[4, 13, 24, 2], [4, 21, 24, 2], [15, 5, 2, 8], [9, 15, 2, 6], [21, 15, 2, 6], [15, 23, 2, 2]].forEach(([x, y, w, h]) => R(g, m.crateDark, x, y, w, h));
    if (id === "snow") R(g, 0xffffff, 6, 6, 8, 1, 0.8);
  });

  mk(`${id}_pylon`, (g) => { // borda: arvore, cacto ou rocha
    shadow(g, 20);
    if (id === "desert") {
      R(g, OUT, 12, 5, 8, 25); R(g, m.border, 13, 6, 6, 23); R(g, OUT, 5, 12, 8, 4); R(g, OUT, 5, 12, 4, 10); R(g, m.border, 6, 13, 7, 2); R(g, m.border, 6, 13, 2, 8);
      R(g, OUT, 19, 14, 8, 4); R(g, OUT, 23, 8, 4, 10); R(g, m.border, 19, 15, 7, 2); R(g, m.border, 24, 9, 2, 8); R(g, shade(m.border, 1.4), 13, 6, 1, 23);
    } else if (id === "volcano") {
      g.fillStyle(OUT).fillCircle(16, 19, 12); g.fillStyle(m.border).fillCircle(16, 19, 11); g.fillStyle(shade(m.border, 1.5)).fillCircle(13, 15, 5);
      R(g, 0xff6a2a, 18, 20, 5, 1); R(g, 0xff6a2a, 21, 20, 1, 5);
    } else {
      R(g, OUT, 13, 20, 6, 10); R(g, 0x7a4a2a, 14, 21, 4, 9);
      g.fillStyle(OUT).fillCircle(16, 13, 13); g.fillStyle(m.border).fillCircle(16, 13, 12); g.fillStyle(shade(m.border, 1.4)).fillCircle(13, 10, 7);
      R(g, shade(m.border, 1.9), 10, 7, 3, 2); R(g, shade(m.border, 1.9), 17, 12, 2, 2);
      if (id === "snow") g.fillStyle(0xffffff, 0.9).fillCircle(16, 6, 6);
    }
  });

  mk(`${id}_wall`, (g) => { // borda: cerca viva, duna ou rochas
    R(g, OUT, 0, 12, T, 18); R(g, m.border, 1, 13, 30, 16); R(g, shade(m.border, 1.3), 1, 13, 30, 4);
    [[4, 20], [14, 23], [24, 19], [9, 26]].forEach(([x, y]) => R(g, shade(m.border, 0.7), x, y, 3, 2));
    if (id === "volcano") R(g, 0xff6a2a, 1, 26, 30, 2);
    if (id === "snow") R(g, 0xffffff, 1, 13, 30, 3);
  });
}

/** Gera todas as texturas do jogo por codigo (arte original, sem assets externos). */
export function makeTextures(s: Phaser.Scene) {
  const mk: MK = (name, draw, w = T, h = T) => {
    const g = s.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(name, w, h);
    g.destroy();
  };

  (Object.keys(RARITIES) as Rarity[]).forEach((r) => {
    const c = RARITIES[r].color, l = shade(c, 1.4), wood = 0x8a5a2a;
    mk(`chest_${r}`, (g) => { // bau de madeira com ferragens da cor da raridade
      shadow(g);
      R(g, OUT, 4, 10, 24, 18); R(g, wood, 5, 11, 22, 16); R(g, shade(wood, 1.3), 5, 11, 22, 3); R(g, shade(wood, 0.65), 5, 22, 22, 5);
      R(g, OUT, 5, 17, 22, 2); R(g, c, 5, 11, 3, 16); R(g, c, 24, 11, 3, 16); R(g, l, 5, 11, 1, 16);
      R(g, OUT, 14, 15, 4, 7); R(g, l, 15, 16, 2, 5);
      if (r === "mythic" || r === "legendary" || r === "super") { R(g, 0xffffff, 9, 5, 1, 4); R(g, 0xffffff, 7, 7, 5, 1); R(g, 0xffffff, 24, 3, 1, 3); R(g, 0xffffff, 23, 4, 3, 1); }
    });
    [0, 1, 2, 3].forEach((f) => mk(`hero_${r}_${f}`, (g) => drawChar(g, LOOKS[r], f)));
  });

  mk("bomb", (g) => {
    shadow(g, 20);
    g.fillStyle(OUT).fillCircle(16, 19, 10); g.fillStyle(0x2a2f3a).fillCircle(16, 19, 9);
    g.fillStyle(0x5a6275).fillCircle(12, 15, 3); R(g, 0xffffff, 11, 14, 1, 1);
    R(g, 0x888888, 13, 8, 6, 3); R(g, 0x7a4a1c, 17, 4, 2, 4); R(g, 0xffd24a, 16, 1, 4, 4); R(g, 0xfff3b0, 17, 2, 2, 2);
  });
  mk("flame", (g) => { g.fillStyle(0xff7a1a, 0.9).fillCircle(16, 16, 14); g.fillStyle(0xffd24a).fillCircle(16, 16, 9); g.fillStyle(0xfff3b0).fillCircle(16, 16, 4); });
  mk("glow", (g) => { g.fillStyle(0xffffff, 0.1).fillCircle(16, 16, 16); g.fillStyle(0xffffff, 0.15).fillCircle(16, 16, 11); g.fillStyle(0xffffff, 0.25).fillCircle(16, 16, 6); });
  mk("spark", (g) => R(g, 0xffffff, 0, 0, 6, 6), 6, 6);

  MAPS.forEach((m) => mapTextures(mk, m));
}
