export const COLS = 29;
export const ROWS = 17;

export interface MapDef {
  id: string; name: string;
  floor: [number, number, number]; tuft: number; tuft2: number; // chao
  roof: number; wall: number; trim: number; // casinhas (obstaculos fixos)
  crate: number; crateDark: number; // blocos destrutiveis
  border: number; // arvores / cactos / rochas da borda
  density: number; // chance de bloco em cada celula livre
  ambient: number; fall: boolean; // particulas do clima
  pillar: (x: number, y: number) => boolean; // layout dos obstaculos fixos
}

/** Biomas originais: cada mapa tem paleta, layout, densidade e clima proprios. */
export const MAPS: MapDef[] = [
  { id: "meadow", name: "Campo Verde", floor: [0x5aa033, 0x57a030, 0x5fa836], tuft: 0x438626, tuft2: 0x7cc64c,
    roof: 0xc8402e, wall: 0xe8d3a3, trim: 0x7a4a2a, crate: 0xe0a25f, crateDark: 0xb67a3c, border: 0x2f7a2e,
    density: 0.45, ambient: 0xffffff, fall: false, pillar: (x, y) => x % 2 === 1 && y % 2 === 1 },
  { id: "desert", name: "Deserto Dourado", floor: [0xe3c079, 0xdeb96e, 0xe8c885], tuft: 0xc9a35a, tuft2: 0xf3dca0,
    roof: 0xb5651d, wall: 0xe9c98c, trim: 0x7a4a2a, crate: 0xc59a62, crateDark: 0x946a38, border: 0x3f8f4a,
    density: 0.45, ambient: 0xfff0b0, fall: false, pillar: (x, y) => y % 4 === 1 && x % 6 !== 3 },
  { id: "snow", name: "Montanha Nevada", floor: [0xe8f1f8, 0xdfeaf4, 0xeaf3fa], tuft: 0xbcd0e0, tuft2: 0xffffff,
    roof: 0x4a8fd0, wall: 0xf2f6fa, trim: 0x7a5a3a, crate: 0x9fd0ea, crateDark: 0x6aa4c8, border: 0x2b6b4a,
    density: 0.4, ambient: 0xffffff, fall: true,
    pillar: (x, y) => ((x === 9 || x === 19) && ![3, 8, 13].includes(y)) || (y === 8 && ![4, 14, 24].includes(x)) || (x % 4 === 2 && y % 4 === 2) },
  { id: "volcano", name: "Vulcão", floor: [0x4a3a38, 0x4f3e3b, 0x453533], tuft: 0x2e2220, tuft2: 0xff6a2a,
    roof: 0x7a2a1a, wall: 0x6a5048, trim: 0x2a1a14, crate: 0x8a5a3a, crateDark: 0x5a3a24, border: 0x3a2e2c,
    density: 0.5, ambient: 0xff8a2b, fall: false, pillar: (x, y) => (x % 6 === 2 && y % 4 === 2) || (x % 6 === 5 && y % 4 === 0) },
  { id: "jungle", name: "Selva Antiga", floor: [0x2f7a3a, 0x2b7436, 0x338240], tuft: 0x1f5a2a, tuft2: 0x8fdc5a,
    roof: 0xc9a23a, wall: 0xb08a52, trim: 0x5a3a1a, crate: 0x9a7a3a, crateDark: 0x6a5224, border: 0x1f6a2a,
    density: 0.5, ambient: 0xe8ff7a, fall: false, pillar: (x, y) => x % 3 === 1 && y % 3 === 1 },
];
