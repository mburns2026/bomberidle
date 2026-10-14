import Phaser from "phaser";
import { RARITIES, Rarity } from "./state";

export const T = 32;
const OUT = 0x2a1810;
const SKIN = 0xf1c9a0;
type G = Phaser.GameObjects.Graphics;
const R = (g: G, c: number, x: number, y: number, w: number, h: number, a = 1) =>
  g.fillStyle(c, a).fillRect(x, y, w, h);
const shade = (c: number, f: number) => {
  const ch = (v: number) => Math.min(255, Math.round(v * f));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
};
const shadow = (g: G, w = 24) => g.fillStyle(0x000000, 0.28).fillEllipse(16, 29, w, 6);

/** Arte procedural com contorno, luz e sombra. Gera todas as texturas do jogo. */
export function makeTextures(s: Phaser.Scene) {
  const mk = (name: string, draw: (g: G) => void, w = T, h = T) => {
    const g = s.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(name, w, h);
    g.destroy();
  };

  const tufts = [[[5, 7], [22, 20], [13, 26]], [[18, 6], [7, 22], [26, 27]], [[10, 12], [24, 14], [4, 28]]];
  tufts.forEach((pts, i) =>
    mk(`grass${i}`, (g) => {
      R(g, i === 1 ? 0x57a030 : 0x5aa033, 0, 0, T, T);
      pts.forEach(([x, y]) => { R(g, 0x438626, x, y, 1, 3); R(g, 0x438626, x + 2, y + 1, 1, 2); R(g, 0x7cc64c, x + 1, y - 1, 1, 2); });
      if (i === 2) { R(g, 0xffffff, 20, 24, 2, 2); R(g, 0xffd24a, 21, 25, 1, 1); }
    })
  );

  mk("pillar", (g) => {
    shadow(g, 27);
    R(g, OUT, 3, 12, 26, 17); R(g, 0xe8d3a3, 4, 14, 24, 14); R(g, 0xc9b078, 4, 24, 24, 4);
    R(g, OUT, 2, 3, 28, 12); R(g, 0xc8402e, 3, 4, 26, 10); R(g, 0xe25c47, 3, 4, 26, 3);
    [7, 13, 19, 25].forEach((x) => R(g, 0xa23222, x - 1, 6, 2, 8));
    R(g, OUT, 12, 19, 8, 10); R(g, 0x7a4a2a, 13, 20, 6, 9); R(g, 0xffd24a, 17, 24, 1, 2);
    R(g, OUT, 5, 17, 5, 5); R(g, 0x8fd0ff, 6, 18, 3, 3);
    R(g, OUT, 22, 17, 5, 5); R(g, 0x8fd0ff, 23, 18, 3, 3);
  });

  mk("block", (g) => {
    shadow(g, 27);
    R(g, OUT, 2, 3, 28, 26); R(g, 0xe0a25f, 3, 4, 26, 24);
    R(g, 0xf0c283, 3, 4, 26, 3); R(g, 0xf0c283, 3, 4, 3, 24);
    R(g, 0xb67a3c, 3, 25, 26, 3); R(g, 0xb67a3c, 26, 4, 3, 24);
    [[4, 13, 24, 2], [4, 21, 24, 2], [15, 5, 2, 8], [9, 15, 2, 6], [21, 15, 2, 6], [15, 23, 2, 2]].forEach(([x, y, w, h]) => R(g, 0xb67a3c, x, y, w, h));
  });

  (Object.keys(RARITIES) as Rarity[]).forEach((r) => {
    const c = RARITIES[r].color, d = shade(c, 0.62), l = shade(c, 1.3);
    mk(`chest_${r}`, (g) => {
      shadow(g);
      R(g, OUT, 4, 10, 24, 18); R(g, c, 5, 11, 22, 16); R(g, l, 5, 11, 22, 3); R(g, d, 5, 22, 22, 5);
      R(g, OUT, 5, 17, 22, 2);
      R(g, 0xffd24a, 5, 11, 2, 16); R(g, 0xffd24a, 25, 11, 2, 16);
      R(g, OUT, 14, 16, 4, 7); R(g, 0xffe27a, 15, 17, 2, 5);
      if (r === "epic" || r === "legendary") { R(g, 0xffffff, 9, 6, 1, 4); R(g, 0xffffff, 7, 8, 5, 1); R(g, 0xffffff, 24, 4, 1, 3); R(g, 0xffffff, 23, 5, 3, 1); }
    });
    mk(`hero_${r}`, (g) => {
      shadow(g, 18);
      R(g, OUT, 10, 25, 5, 4); R(g, OUT, 17, 25, 5, 4); R(g, 0x3b2a1e, 11, 25, 3, 3); R(g, 0x3b2a1e, 18, 25, 3, 3);
      R(g, OUT, 9, 15, 14, 11); R(g, c, 10, 16, 12, 9); R(g, l, 10, 16, 12, 2); R(g, d, 10, 23, 12, 2);
      R(g, 0x3b2a1e, 10, 20, 12, 2); R(g, 0xffd24a, 15, 20, 2, 2);
      R(g, OUT, 7, 16, 3, 7); R(g, SKIN, 8, 17, 2, 5); R(g, OUT, 22, 16, 3, 7); R(g, SKIN, 22, 17, 2, 5);
      R(g, OUT, 9, 4, 14, 13); R(g, SKIN, 10, 6, 12, 10); R(g, shade(SKIN, 0.85), 10, 14, 12, 2);
      R(g, OUT, 13, 10, 2, 3); R(g, OUT, 18, 10, 2, 3); R(g, 0xffffff, 13, 10, 1, 1); R(g, 0xffffff, 18, 10, 1, 1);
      R(g, OUT, 8, 2, 16, 7); R(g, c, 9, 3, 14, 5); R(g, l, 9, 3, 14, 2); R(g, d, 9, 7, 14, 1);
      R(g, 0xffd24a, 14, 4, 4, 2);
    });
  });

  mk("bomb", (g) => {
    shadow(g, 20);
    g.fillStyle(OUT).fillCircle(16, 19, 10);
    g.fillStyle(0x2b2f3a).fillCircle(16, 19, 9);
    g.fillStyle(0x5a6275).fillCircle(12, 15, 3);
    R(g, 0xffffff, 11, 14, 1, 1);
    R(g, 0x888888, 13, 8, 6, 3); R(g, 0x7a4a1c, 17, 4, 2, 4);
    R(g, 0xffd24a, 16, 1, 4, 4); R(g, 0xfff3b0, 17, 2, 2, 2);
  });

  mk("tree", (g) => {
    shadow(g, 20);
    R(g, OUT, 13, 20, 6, 10); R(g, 0x7a4a2a, 14, 21, 4, 9);
    g.fillStyle(OUT).fillCircle(16, 13, 13);
    g.fillStyle(0x2f7a2e).fillCircle(16, 13, 12);
    g.fillStyle(0x3f9a3a).fillCircle(13, 10, 7);
    R(g, 0x7cc64c, 10, 7, 3, 2); R(g, 0x7cc64c, 17, 12, 2, 2);
  });

  mk("hedge", (g) => {
    R(g, OUT, 0, 12, T, 18); R(g, 0x3f8f35, 1, 13, 30, 16); R(g, 0x56ad45, 1, 13, 30, 4);
    [[4, 20], [14, 23], [24, 19], [9, 26]].forEach(([x, y]) => R(g, 0x2f7a2e, x, y, 3, 2));
  });

  mk("flame", (g) => {
    g.fillStyle(0xff7a1a, 0.9).fillCircle(16, 16, 14);
    g.fillStyle(0xffd24a).fillCircle(16, 16, 9);
    g.fillStyle(0xfff3b0).fillCircle(16, 16, 4);
  });

  mk("spark", (g) => R(g, 0xffffff, 0, 0, 6, 6), 6, 6);
}
