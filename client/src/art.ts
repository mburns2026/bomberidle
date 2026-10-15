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

// ---------- bomber-bots: herois chibi (cabecao, corpo pequeno), um por raridade ----------
interface Bot {
  body: number; trim: number; helm: number; visor: number; eye: number; eye2?: number; wide?: number;
  back?: (g: G, f: number) => void; top?: (g: G) => void; front?: (g: G, f: number) => void;
}

function drawBot(g: G, P: Bot, f: number) {
  const lift = [[0, 0], [-2, 0], [0, 0], [0, -2]][f], bob = [0, -1, 0, -1][f], sw = [0, 1, 0, -1][f], wd = P.wide ?? 0;
  P.back?.(g, f);
  shadow(g, 20 + wd * 2);
  [[10, lift[0]], [17, lift[1]]].forEach(([x, dy]) => { R(g, OUT, x, 27 + dy, 5, 4); R(g, P.trim, x + 1, 27 + dy, 3, 2); R(g, shade(P.body, 0.6), x + 1, 29 + dy, 3, 1); });
  g.translateCanvas(0, bob);
  // corpo
  R(g, OUT, 10 - wd, 18, 12 + wd * 2, 9); R(g, P.body, 11 - wd, 19, 10 + wd * 2, 7);
  R(g, shade(P.body, 1.4), 11 - wd, 19, 10 + wd * 2, 2); R(g, shade(P.body, 0.65), 11 - wd, 24, 10 + wd * 2, 2);
  // moeda no peito (tema crypto)
  g.fillStyle(OUT).fillCircle(16, 22, 3.5); g.fillStyle(0xffd24a).fillCircle(16, 22, 2.5); R(g, 0xfff3b0, 15, 21, 1, 1); R(g, 0xb47a10, 16, 23, 1, 1);
  // bracos
  R(g, OUT, 7 - wd, 19 + sw, 3, 6); R(g, P.trim, 8 - wd, 20 + sw, 1, 4);
  R(g, OUT, 22 + wd, 19 - sw, 3, 6); R(g, P.trim, 23 + wd, 20 - sw, 1, 4);
  // cabecao com visor
  g.fillStyle(OUT).fillRoundedRect(6, 2, 20, 17, 6);
  g.fillStyle(P.helm).fillRoundedRect(7, 3, 18, 15, 5);
  R(g, shade(P.helm, 1.45), 10, 4, 9, 2); R(g, shade(P.helm, 0.7), 8, 16, 16, 2);
  g.fillStyle(P.visor).fillRoundedRect(9, 8, 14, 8, 3);
  R(g, P.eye, 11, 11, 3, f === 3 ? 1 : 3); R(g, P.eye2 ?? P.eye, 18, 11, 3, f === 3 ? 1 : 3);
  R(g, 0xffffff, 12, 11, 1, 1, 0.8); R(g, 0xffffff, 19, 11, 1, 1, 0.8);
  P.top?.(g);
  P.front?.(g, f);
}

const BOTS: Record<Rarity, Bot> = {
  common: { body: 0x4a5a7a, trim: PU, helm: 0x7d8cab, visor: 0x0a1a2a, eye: CY, // Lyra
    top: (g) => { R(g, OUT, 24, 5, 4, 7); R(g, 0x14121f, 25, 6, 2, 5); R(g, CY, 9, 10, 14, 1, 0.9); },
    front: (g, f) => { R(g, 0xc0c8d4, 25, 20, 2, 7); R(g, 0xc0c8d4, 24, 19, 4, 2); R(g, f % 2 ? 0xffd24a : 0xff9a3c, 25, 17, 2, 2); } },
  rare: { body: 0x6a3fb0, trim: 0x9b6cff, helm: 0x3b3a5c, visor: 0x05060f, eye: CY, eye2: MG, wide: 2, // Titan
    front: () => {} },
  epic: { body: 0x2c4a6b, trim: PU, helm: 0x2a3350, visor: 0x1a0f3a, eye: 0xe0c8ff, // Vex
    top: (g) => { R(g, OUT, 10, 0, 3, 4); R(g, 0x1a1530, 11, 1, 1, 3); R(g, OUT, 16, 0, 3, 4); R(g, 0x1a1530, 17, 1, 1, 3); },
    front: (g, f) => { R(g, CY, 25, 9, 6, 8, f % 2 ? 0.5 : 0.35); R(g, 0x9bf6ff, 25, 9, 6, 1); R(g, 0x9bf6ff, 26, 12, 3, 1); } },
  mythic: { body: 0x14161f, trim: CY, helm: 0x2a3040, visor: 0x05060f, eye: CY, // Kira
    top: (g) => { R(g, OUT, 13, 0, 6, 4); R(g, 0xaab4c8, 14, 1, 4, 2); },
    front: (g) => { for (let i = 0; i < 8; i++) { R(g, OUT, 22 + i, 23 - i, 3, 3); R(g, 0xdfe8ff, 23 + i, 23 - i, 1, 2); } } },
  legendary: { body: 0x6a3fb0, trim: MG, helm: 0x3a2a60, visor: 0x120a22, eye: MG, // Jax
    back: (g) => { g.fillStyle(MG, 0.22).fillCircle(16, 16, 15); },
    top: (g) => { R(g, OUT, 6, 0, 4, 4); R(g, 0x8f5cf0, 7, 1, 2, 2); R(g, OUT, 22, 0, 4, 4); R(g, 0x8f5cf0, 23, 1, 2, 2); },
    front: () => {} },
  super: { body: 0xf2c14a, trim: 0xffffff, helm: 0xe6c070, visor: 0x0b1a3a, eye: 0x2b6bff, // Orion
    back: (g, f) => {
      const d = [0, -1, 0, 1][f];
      g.fillStyle(0xfff4c2, 0.35).fillCircle(16, 15, 16);
      R(g, OUT, 0, 10 + d, 8, 12); R(g, 0xe8ecf8, 1, 11 + d, 6, 10); R(g, 0xffffff, 1, 11 + d, 2, 10);
      R(g, OUT, 24, 10 + d, 8, 12); R(g, 0xe8ecf8, 25, 11 + d, 6, 10); R(g, 0xffffff, 29, 11 + d, 2, 10);
    },
    top: (g) => { R(g, OUT, 7, 0, 5, 5); R(g, 0xd9b46a, 8, 1, 3, 3); R(g, OUT, 20, 0, 5, 5); R(g, 0xd9b46a, 21, 1, 3, 3); },
    front: () => {} },
};
// acessorios que precisam do contexto grafico (definidos aqui para manter o objeto acima enxuto)
BOTS.rare.front = (g) => { [2, 24].forEach((x) => { R(g, OUT, x, 17, 7, 5); R(g, 0x7b4bd6, x + 1, 18, 5, 3); R(g, 0x9b6cff, x + 1, 18, 5, 1); }); };
BOTS.legendary.front = (g) => { R(g, 0xff7af0, 2, 15, 2, 13); R(g, 0xffd0fa, 2, 15, 1, 4); R(g, 0xff7af0, 28, 15, 2, 13); R(g, 0xffd0fa, 29, 15, 1, 4); };
BOTS.super.front = (g) => { R(g, 0xf2c14a, 28, 8, 2, 22); R(g, OUT, 27, 4, 4, 5); R(g, 0xfff0a0, 28, 5, 2, 3); };

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

// ---------- sprites PNG dos operadores (um personagem por raridade) ----------
export const SPRITE_FILES: Record<Rarity, string> = { common: "lyra", rare: "titan", epic: "vex", mythic: "kira", legendary: "jax", super: "orion" };
export const SPRITE_PX = 96; // lado da textura quadrada de cada quadro

/** Carrega os PNGs de public/sprites (chamar no preload da cena). */
export function preloadSprites(s: Phaser.Scene) {
  const base = import.meta.env.BASE_URL;
  (Object.keys(SPRITE_FILES) as Rarity[]).forEach((r) => s.load.image(`spr_${r}`, `${base}sprites/${SPRITE_FILES[r]}.png`));
}

/** Gera os 4 quadros de caminhada (balanco e quique) a partir da ilustracao, com brilho na cor da raridade. */
function bakeHero(s: Phaser.Scene, r: Rarity): boolean {
  if (!s.textures.exists(`spr_${r}`)) return false;
  const src = s.textures.get(`spr_${r}`).getSourceImage() as HTMLImageElement;
  const P = SPRITE_PX, box = P - 8;
  const k = Math.min(box / src.height, box / src.width);
  const w = src.width * k, h = src.height * k;
  const bob = [0, -2, 0, -2], rot = [0, -0.04, 0, 0.04], sq = [1, 0.97, 1, 0.97];
  for (let f = 0; f < 4; f++) {
    const name = `hero_${r}_${f}`;
    if (s.textures.exists(name)) s.textures.remove(name);
    const tex = s.textures.createCanvas(name, P, P);
    if (!tex) return false;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(P / 2, P - 4 + bob[f]);
    ctx.rotate(rot[f]);
    ctx.scale(1, sq[f]);
    ctx.shadowColor = RARITIES[r].css; // aura fina: destaca o personagem em qualquer mapa
    ctx.shadowBlur = 5;
    ctx.drawImage(src, -w / 2, -h, w, h);
    ctx.shadowBlur = 0;
    ctx.drawImage(src, -w / 2, -h, w, h);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR); // suaviza so os personagens; o mapa segue pixelado
  }
  return true;
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
    // sprite PNG se carregado; senao o boneco desenhado por codigo (ampliado 3x para o mesmo tamanho)
    if (!bakeHero(s, r)) [0, 1, 2, 3].forEach((f) => mk(`hero_${r}_${f}`, (g) => { g.scaleCanvas(3, 3); drawBot(g, BOTS[r], f); }, SPRITE_PX, SPRITE_PX));
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
