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

/** Os 5 layouts de obstaculo fixo usados pelos biomas originais, reaproveitados nos mapas gerados abaixo. */
export const PILLAR_PATTERNS: ((x: number, y: number) => boolean)[] = [
  (x, y) => x % 2 === 1 && y % 2 === 1,
  (x, y) => y % 4 === 1 && x % 6 !== 3,
  (x, y) => ((x === 9 || x === 19) && ![3, 8, 13].includes(y)) || (y === 8 && ![4, 14, 24].includes(x)) || (x % 4 === 2 && y % 4 === 2),
  (x, y) => (x % 6 === 2 && y % 4 === 2) || (x % 6 === 5 && y % 4 === 0),
  (x, y) => x % 3 === 1 && y % 3 === 1,
];

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

  // ---------- 45 biomas gerados (paleta procedural por rotacao de matiz) ----------
  { id: "caverna_de_cristal", name: "Caverna de Cristal", floor: [0x883a3a, 0x7f3939, 0x943d3d], tuft: 0x632121, tuft2: 0xd16161,
    roof: 0x2e9e9e, wall: 0xd7ccc1, trim: 0x7a4a2a, crate: 0xc78557, crateDark: 0x8a542e, border: 0x671e1e,
    density: 0.42, ambient: 0xeaea86, fall: false, pillar: PILLAR_PATTERNS[0] },
  { id: "pantano_sombrio", name: "Pântano Sombrio", floor: [0x3a8851, 0x397f4d, 0x3d9456], tuft: 0x216334, tuft2: 0x61d182,
    roof: 0x9e2e7d, wall: 0xc1d7d3, trim: 0x5a3a1a, crate: 0x57c7a6, crateDark: 0x2e8a6f, border: 0x1e6733,
    density: 0.42, ambient: 0x86ccea, fall: false, pillar: PILLAR_PATTERNS[1] },
  { id: "ruinas_esquecidas", name: "Ruínas Esquecidas", floor: [0x673a88, 0x62397f, 0x703d94], tuft: 0x482163, tuft2: 0xa261d1,
    roof: 0x5d9e2e, wall: 0xd7c1d5, trim: 0x6a4020, crate: 0xc757c7, crateDark: 0x8a2e8a, border: 0x481e67,
    density: 0.43, ambient: 0xea86af, fall: false, pillar: PILLAR_PATTERNS[2] },
  { id: "oasis_perdido", name: "Oásis Perdido", floor: [0x887e3a, 0x7f7639, 0x948a3d], tuft: 0x635b21, tuft2: 0xd1c361,
    roof: 0x2e3c9e, wall: 0xcfd7c1, trim: 0x4a3018, crate: 0xa6c757, crateDark: 0x6f8a2e, border: 0x675e1e,
    density: 0.43, ambient: 0x92ea86, fall: true, pillar: PILLAR_PATTERNS[3] },
  { id: "floresta_fantasma", name: "Floresta Fantasma", floor: [0x3a7b88, 0x39737f, 0x3d8694], tuft: 0x215863, tuft2: 0x61bed1,
    roof: 0x9e412e, wall: 0xc1c8d7, trim: 0x7a4a2a, crate: 0x5785c7, crateDark: 0x2e548a, border: 0x1e5b67,
    density: 0.43, ambient: 0x9686ea, fall: false, pillar: PILLAR_PATTERNS[4] },
  { id: "gruta_de_obsidiana", name: "Gruta de Obsidiana", floor: [0x883a64, 0x7f395f, 0x943d6c], tuft: 0x632145, tuft2: 0xd1619e,
    roof: 0x2e9e61, wall: 0xd7c1c2, trim: 0x5a3a1a, crate: 0xc75765, crateDark: 0x8a2e39, border: 0x671e45,
    density: 0.44, ambient: 0xeab486, fall: false, pillar: PILLAR_PATTERNS[0] },
  { id: "plato_congelado", name: "Platô Congelado", floor: [0x4d883a, 0x4a7f39, 0x53943d], tuft: 0x326321, tuft2: 0x7dd161,
    roof: 0x822e9e, wall: 0xc1d7c6, trim: 0x6a4020, crate: 0x57c769, crateDark: 0x2e8a3d, border: 0x30671e,
    density: 0.44, ambient: 0x86ead1, fall: false, pillar: PILLAR_PATTERNS[1] },
  { id: "terra_vermelha", name: "Terra Vermelha", floor: [0x3d3a88, 0x3c397f, 0x403d94], tuft: 0x242163, tuft2: 0x6661d1,
    roof: 0x999e2e, wall: 0xcdc1d7, trim: 0x4a3018, crate: 0x8a57c7, crateDark: 0x582e8a, border: 0x211e67,
    density: 0.45, ambient: 0xea86e5, fall: false, pillar: PILLAR_PATTERNS[2] },
  { id: "abismo_estelar", name: "Abismo Estelar", floor: [0x88543a, 0x7f5039, 0x945a3d], tuft: 0x633721, tuft2: 0xd18661,
    roof: 0x2e799e, wall: 0xd7d4c1, trim: 0x7a4a2a, crate: 0xc7ab57, crateDark: 0x8a732e, border: 0x67361e,
    density: 0.45, ambient: 0xc8ea86, fall: true, pillar: PILLAR_PATTERNS[3] },
  { id: "recife_de_coral", name: "Recife de Coral", floor: [0x3a886b, 0x397f65, 0x3d9474], tuft: 0x21634b, tuft2: 0x61d1a7,
    roof: 0x9e2e58, wall: 0xc1d4d7, trim: 0x5a3a1a, crate: 0x57c2c7, crateDark: 0x2e868a, border: 0x1e674c,
    density: 0.45, ambient: 0x86abea, fall: false, pillar: PILLAR_PATTERNS[4] },
  { id: "cidade_afundada", name: "Cidade Afundada", floor: [0x813a88, 0x79397f, 0x8d3d94], tuft: 0x5e2163, tuft2: 0xc861d1,
    roof: 0x379e2e, wall: 0xd7c1ce, trim: 0x6a4020, crate: 0xc757a1, crateDark: 0x8a2e6b, border: 0x611e67,
    density: 0.46, ambient: 0xea868e, fall: false, pillar: PILLAR_PATTERNS[0] },
  { id: "deserto_de_sal", name: "Deserto de Sal", floor: [0x77883a, 0x707f39, 0x82943d], tuft: 0x566321, tuft2: 0xbad161,
    roof: 0x452e9e, wall: 0xc7d7c1, trim: 0x4a3018, crate: 0x81c757, crateDark: 0x508a2e, border: 0x57671e,
    density: 0.46, ambient: 0x86ea9b, fall: false, pillar: PILLAR_PATTERNS[1] },
  { id: "montanha_flutuante", name: "Montanha Flutuante", floor: [0x3a6188, 0x395c7f, 0x3d6894], tuft: 0x214263, tuft2: 0x6199d1,
    roof: 0x9e662e, wall: 0xc1c1d7, trim: 0x7a4a2a, crate: 0x5760c7, crateDark: 0x2e358a, border: 0x1e4267,
    density: 0.46, ambient: 0xb886ea, fall: false, pillar: PILLAR_PATTERNS[2] },
  { id: "bosque_radioativo", name: "Bosque Radioativo", floor: [0x883a4a, 0x7f3947, 0x943d4f], tuft: 0x63212f, tuft2: 0xd16178,
    roof: 0x2e9e87, wall: 0xd7c7c1, trim: 0x5a3a1a, crate: 0xc76e57, crateDark: 0x8a412e, border: 0x671e2d,
    density: 0.47, ambient: 0xead586, fall: true, pillar: PILLAR_PATTERNS[3] },
  { id: "fenda_vulcanica", name: "Fenda Vulcânica", floor: [0x3a8841, 0x397f3f, 0x3d9444], tuft: 0x216327, tuft2: 0x61d16a,
    roof: 0x9e2e95, wall: 0xc1d7ce, trim: 0x6a4020, crate: 0x57c78f, crateDark: 0x2e8a5c, border: 0x1e6724,
    density: 0.47, ambient: 0x86e1ea, fall: false, pillar: PILLAR_PATTERNS[4] },
  { id: "tundra_esquecida", name: "Tundra Esquecida", floor: [0x573a88, 0x53397f, 0x5e3d94], tuft: 0x3a2163, tuft2: 0x8b61d1,
    roof: 0x749e2e, wall: 0xd4c1d7, trim: 0x4a3018, crate: 0xb057c7, crateDark: 0x772e8a, border: 0x391e67,
    density: 0.47, ambient: 0xea86c4, fall: false, pillar: PILLAR_PATTERNS[0] },
  { id: "jardim_alienigena", name: "Jardim Alienígena", floor: [0x886e3a, 0x7f6839, 0x94773d], tuft: 0x634d21, tuft2: 0xd1ac61,
    roof: 0x2e539e, wall: 0xd3d7c1, trim: 0x7a4a2a, crate: 0xbdc757, crateDark: 0x828a2e, border: 0x674f1e,
    density: 0.48, ambient: 0xa7ea86, fall: false, pillar: PILLAR_PATTERNS[1] },
  { id: "catacumbas_antigas", name: "Catacumbas Antigas", floor: [0x3a8885, 0x397f7c, 0x3d9491], tuft: 0x216361, tuft2: 0x61d1cd,
    roof: 0x9e2e32, wall: 0xc1cdd7, trim: 0x5a3a1a, crate: 0x579dc7, crateDark: 0x2e678a, border: 0x1e6764,
    density: 0.48, ambient: 0x868aea, fall: false, pillar: PILLAR_PATTERNS[2] },
  { id: "pico_nebuloso", name: "Pico Nebuloso", floor: [0x883a74, 0x7f396d, 0x943d7e], tuft: 0x632153, tuft2: 0xd161b5,
    roof: 0x2e9e4a, wall: 0xd7c1c6, trim: 0x6a4020, crate: 0xc7577c, crateDark: 0x8a2e4c, border: 0x671e54,
    density: 0.49, ambient: 0xea9f86, fall: true, pillar: PILLAR_PATTERNS[3] },
  { id: "vale_das_sombras", name: "Vale das Sombras", floor: [0x5d883a, 0x597f39, 0x65943d], tuft: 0x3f6321, tuft2: 0x94d161,
    roof: 0x6b2e9e, wall: 0xc1d7c2, trim: 0x4a3018, crate: 0x5bc757, crateDark: 0x318a2e, border: 0x3f671e,
    density: 0.49, ambient: 0x86eabc, fall: false, pillar: PILLAR_PATTERNS[4] },
  { id: "praia_de_cristal", name: "Praia de Cristal", floor: [0x3a4788, 0x39447f, 0x3d4b94], tuft: 0x212c63, tuft2: 0x6173d1,
    roof: 0x9e8c2e, wall: 0xc8c1d7, trim: 0x7a4a2a, crate: 0x7357c7, crateDark: 0x452e8a, border: 0x1e2a67,
    density: 0.49, ambient: 0xd986ea, fall: false, pillar: PILLAR_PATTERNS[0] },
  { id: "campo_magnetico", name: "Campo Magnético", floor: [0x88443a, 0x7f4239, 0x94483d], tuft: 0x632a21, tuft2: 0xd16f61,
    roof: 0x2e909e, wall: 0xd7cfc1, trim: 0x5a3a1a, crate: 0xc79457, crateDark: 0x8a602e, border: 0x67271e,
    density: 0.5, ambient: 0xddea86, fall: false, pillar: PILLAR_PATTERNS[1] },
  { id: "caverna_de_gelo", name: "Caverna de Gelo", floor: [0x3a885b, 0x397f56, 0x3d9461], tuft: 0x21633d, tuft2: 0x61d190,
    roof: 0x9e2e6f, wall: 0xc1d7d5, trim: 0x6a4020, crate: 0x57c7b5, crateDark: 0x2e8a7b, border: 0x1e673c,
    density: 0.5, ambient: 0x86c0ea, fall: false, pillar: PILLAR_PATTERNS[2] },
  { id: "selva_bioluminescente", name: "Selva Bioluminescente", floor: [0x713a88, 0x6b397f, 0x7b3d94], tuft: 0x502163, tuft2: 0xb161d1,
    roof: 0x4e9e2e, wall: 0xd7c1d2, trim: 0x4a3018, crate: 0xc757b9, crateDark: 0x8a2e7e, border: 0x521e67,
    density: 0.5, ambient: 0xea86a2, fall: true, pillar: PILLAR_PATTERNS[3] },
  { id: "dunas_ardentes", name: "Dunas Ardentes", floor: [0x87883a, 0x7e7f39, 0x94943d], tuft: 0x636321, tuft2: 0xd1d161,
    roof: 0x2e2e9e, wall: 0xccd7c1, trim: 0x7a4a2a, crate: 0x98c757, crateDark: 0x638a2e, border: 0x67671e,
    density: 0.51, ambient: 0x86ea86, fall: false, pillar: PILLAR_PATTERNS[4] },
  { id: "arquipelago_perdido", name: "Arquipélago Perdido", floor: [0x3a7188, 0x396a7f, 0x3d7b94], tuft: 0x215063, tuft2: 0x61b0d1,
    roof: 0x9e4f2e, wall: 0xc1c5d7, trim: 0x5a3a1a, crate: 0x5777c7, crateDark: 0x2e488a, border: 0x1e5167,
    density: 0.51, ambient: 0xa386ea, fall: false, pillar: PILLAR_PATTERNS[0] },
  { id: "floresta_petrificada", name: "Floresta Petrificada", floor: [0x883a5a, 0x7f3956, 0x943d61], tuft: 0x63213d, tuft2: 0xd1618f,
    roof: 0x2e9e70, wall: 0xd7c3c1, trim: 0x6a4020, crate: 0xc75757, crateDark: 0x8a2e2e, border: 0x671e3c,
    density: 0.51, ambient: 0xeac086, fall: false, pillar: PILLAR_PATTERNS[1] },
  { id: "portal_dimensional", name: "Portal Dimensional", floor: [0x44883a, 0x417f39, 0x47943d], tuft: 0x296321, tuft2: 0x6fd161,
    roof: 0x902e9e, wall: 0xc1d7c9, trim: 0x4a3018, crate: 0x57c778, crateDark: 0x2e8a49, border: 0x27671e,
    density: 0.52, ambient: 0x86eadd, fall: false, pillar: PILLAR_PATTERNS[2] },
  { id: "terras_fragmentadas", name: "Terras Fragmentadas", floor: [0x473a88, 0x45397f, 0x4c3d94], tuft: 0x2c2163, tuft2: 0x7461d1,
    roof: 0x8b9e2e, wall: 0xd0c1d7, trim: 0x7a4a2a, crate: 0x9957c7, crateDark: 0x642e8a, border: 0x2a1e67,
    density: 0.52, ambient: 0xea86d9, fall: true, pillar: PILLAR_PATTERNS[3] },
  { id: "lago_venenoso", name: "Lago Venenoso", floor: [0x885e3a, 0x7f5939, 0x94653d], tuft: 0x634021, tuft2: 0xd19561,
    roof: 0x2e6a9e, wall: 0xd7d6c1, trim: 0x5a3a1a, crate: 0xc7b957, crateDark: 0x8a7f2e, border: 0x67401e,
    density: 0.53, ambient: 0xbbea86, fall: false, pillar: PILLAR_PATTERNS[4] },
  { id: "colina_dos_ventos", name: "Colina dos Ventos", floor: [0x3a8875, 0x397f6e, 0x3d947f], tuft: 0x216353, tuft2: 0x61d1b5,
    roof: 0x9e2e4a, wall: 0xc1d2d7, trim: 0x6a4020, crate: 0x57b4c7, crateDark: 0x2e7a8a, border: 0x1e6755,
    density: 0.53, ambient: 0x869eea, fall: false, pillar: PILLAR_PATTERNS[0] },
  { id: "ruinas_submersas", name: "Ruínas Submersas", floor: [0x883a84, 0x7f397b, 0x943d90], tuft: 0x632160, tuft2: 0xd161cc,
    roof: 0x2e9e33, wall: 0xd7c1cb, trim: 0x4a3018, crate: 0xc75793, crateDark: 0x8a2e5f, border: 0x671e63,
    density: 0.53, ambient: 0xea8a86, fall: false, pillar: PILLAR_PATTERNS[1] },
  { id: "campos_de_lava", name: "Campos de Lava", floor: [0x6d883a, 0x677f39, 0x77943d], tuft: 0x4d6321, tuft2: 0xabd161,
    roof: 0x542e9e, wall: 0xc4d7c1, trim: 0x7a4a2a, crate: 0x72c757, crateDark: 0x448a2e, border: 0x4e671e,
    density: 0.54, ambient: 0x86eaa7, fall: false, pillar: PILLAR_PATTERNS[2] },
  { id: "gruta_sagrada", name: "Gruta Sagrada", floor: [0x3a5788, 0x39537f, 0x3d5d94], tuft: 0x213a63, tuft2: 0x618ad1,
    roof: 0x9e752e, wall: 0xc4c1d7, trim: 0x5a3a1a, crate: 0x5c57c7, crateDark: 0x322e8a, border: 0x1e3967,
    density: 0.54, ambient: 0xc586ea, fall: true, pillar: PILLAR_PATTERNS[3] },
  { id: "planicie_eletrizada", name: "Planície Eletrizada", floor: [0x883a40, 0x7f393e, 0x943d44], tuft: 0x632126, tuft2: 0xd1616a,
    roof: 0x2e9e95, wall: 0xd7cac1, trim: 0x6a4020, crate: 0xc77d57, crateDark: 0x8a4d2e, border: 0x671e24,
    density: 0.54, ambient: 0xeae286, fall: false, pillar: PILLAR_PATTERNS[4] },
  { id: "vulcao_adormecido", name: "Vulcão Adormecido", floor: [0x3a884b, 0x397f48, 0x3d944f], tuft: 0x21632f, tuft2: 0x61d179,
    roof: 0x9e2e86, wall: 0xc1d7d1, trim: 0x4a3018, crate: 0x57c79d, crateDark: 0x2e8a68, border: 0x1e672d,
    density: 0.55, ambient: 0x86d4ea, fall: false, pillar: PILLAR_PATTERNS[0] },
  { id: "mar_de_areia", name: "Mar de Areia", floor: [0x613a88, 0x5c397f, 0x693d94], tuft: 0x432163, tuft2: 0x9a61d1,
    roof: 0x659e2e, wall: 0xd7c1d7, trim: 0x7a4a2a, crate: 0xbe57c7, crateDark: 0x822e8a, border: 0x431e67,
    density: 0.55, ambient: 0xea86b7, fall: false, pillar: PILLAR_PATTERNS[1] },
  { id: "bosque_encantado", name: "Bosque Encantado", floor: [0x88783a, 0x7f7039, 0x94833d], tuft: 0x635621, tuft2: 0xd1ba61,
    roof: 0x2e459e, wall: 0xd1d7c1, trim: 0x5a3a1a, crate: 0xafc757, crateDark: 0x768a2e, border: 0x67581e,
    density: 0.55, ambient: 0x9aea86, fall: false, pillar: PILLAR_PATTERNS[2] },
  { id: "despenhadeiro_gelido", name: "Despenhadeiro Gélido", floor: [0x3a8188, 0x39797f, 0x3d8d94], tuft: 0x215e63, tuft2: 0x61c7d1,
    roof: 0x9e382e, wall: 0xc1cad7, trim: 0x6a4020, crate: 0x578ec7, crateDark: 0x2e5b8a, border: 0x1e6067,
    density: 0.56, ambient: 0x8e86ea, fall: true, pillar: PILLAR_PATTERNS[3] },
  { id: "canion_carmesim", name: "Cânion Carmesim", floor: [0x883a6a, 0x7f3964, 0x943d73], tuft: 0x63214a, tuft2: 0xd161a6,
    roof: 0x2e9e59, wall: 0xd7c1c3, trim: 0x4a3018, crate: 0xc7576d, crateDark: 0x8a2e41, border: 0x671e4b,
    density: 0.56, ambient: 0xeaac86, fall: false, pillar: PILLAR_PATTERNS[4] },
  { id: "estacao_abandonada", name: "Estação Abandonada", floor: [0x54883a, 0x507f39, 0x59943d], tuft: 0x376321, tuft2: 0x86d161,
    roof: 0x792e9e, wall: 0xc1d7c5, trim: 0x7a4a2a, crate: 0x57c761, crateDark: 0x2e8a36, border: 0x36671e,
    density: 0.57, ambient: 0x86eac9, fall: false, pillar: PILLAR_PATTERNS[0] },
  { id: "jardim_de_cristal", name: "Jardim de Cristal", floor: [0x3a3d88, 0x393b7f, 0x3d4094], tuft: 0x212463, tuft2: 0x6165d1,
    roof: 0x9e9a2e, wall: 0xcbc1d7, trim: 0x5a3a1a, crate: 0x8157c7, crateDark: 0x512e8a, border: 0x1e2067,
    density: 0.57, ambient: 0xe686ea, fall: false, pillar: PILLAR_PATTERNS[1] },
  { id: "pantano_radioativo", name: "Pântano Radioativo", floor: [0x884e3a, 0x7f4b39, 0x94533d], tuft: 0x633221, tuft2: 0xd17e61,
    roof: 0x2e819e, wall: 0xd7d2c1, trim: 0x6a4020, crate: 0xc7a257, crateDark: 0x8a6c2e, border: 0x67301e,
    density: 0.57, ambient: 0xd0ea86, fall: false, pillar: PILLAR_PATTERNS[2] },
  { id: "pico_sagrado", name: "Pico Sagrado", floor: [0x3a8865, 0x397f5f, 0x3d946d], tuft: 0x216345, tuft2: 0x61d19e,
    roof: 0x9e2e61, wall: 0xc1d6d7, trim: 0x4a3018, crate: 0x57c7c3, crateDark: 0x2e8a86, border: 0x1e6746,
    density: 0.58, ambient: 0x86b3ea, fall: true, pillar: PILLAR_PATTERNS[3] },
  { id: "zona_zero", name: "Zona Zero", floor: [0x7b3a88, 0x73397f, 0x863d94], tuft: 0x592163, tuft2: 0xbf61d1,
    roof: 0x409e2e, wall: 0xd7c1d0, trim: 0x7a4a2a, crate: 0xc757aa, crateDark: 0x8a2e72, border: 0x5b1e67,
    density: 0.58, ambient: 0xea8696, fall: false, pillar: PILLAR_PATTERNS[4] },
];

export const INSTANCES_PER_MAP = 33; // "estancias" de cada mapa: 1 (mais fraca) a 33 (mais forte, com MVP)

/** Progresso 0..1 na escada geral mapa+instancia: 0 = mapa 1 instancia 1, 1 = ultimo mapa, instancia 33. */
export const mapProgress = (mapIndex: number, instance: number) => {
  const step = mapIndex * INSTANCES_PER_MAP + (instance - 1);
  const totalSteps = MAPS.length * INSTANCES_PER_MAP - 1;
  return Math.min(1, Math.max(0, step / totalSteps));
};

// ---------- taxa de drop: continua a mesma curva (quantidade de baus), ajuste aqui ----------
const MIN_DROP = 0.05;        // mapa 1, instancia 1: comeco dificil de proposito
const MAX_DROP = 0.55;        // ultimo mapa, ultima instancia: exatamente aqui
const DROP_CURVE = 2;         // >1 segura a taxa baixa por mais tempo (dificuldade maior bem no inicio)

/** Chance de um bloco destruido soltar um bau, combinando mapa (0..n-1) e instancia (1..33). */
export const chestDropChance = (mapIndex: number, instance: number) =>
  MIN_DROP + (MAX_DROP - MIN_DROP) * Math.pow(mapProgress(mapIndex, instance), DROP_CURVE);

// ---------- HP de blocos, baus e inimigos: ancorado no dano que o heroi de fato alcanca ----------
// bombDamage(d) em state.ts = 8 + 2*power + 0.4*(nivel-1). Isso da o piso e o teto REAIS do jogo:
const DMG_MIN = 10;   // bombDamage(power 1, nivel 1): heroi comum recem-saido da capsula
const DMG_MAX = 29.6; // bombDamage(power 5, nivel 30): heroi lendario/super no nivel maximo
// Em vez de multiplicadores soltos, o HP de cada alvo = "quantas bombadas ele aguenta" x "dano
// esperado de um heroi nesse ponto da progressao". Resultado: a dificuldade relativa (numero de
// bombadas) fica ESTAVEL do mapa 1 ao 50 pra quem evolui no ritmo do jogo — nao fica nem facil
// demais nem impossivel; so fica maior em numero absoluto (e a recompensa junto, via drop chance).

/** Dano esperado de um heroi "no ritmo" da progressao t (0 = inicio, 1 = fim do jogo). */
const expectedDmg = (t: number) => DMG_MIN + (DMG_MAX - DMG_MIN) * t;

const BLOCK_HITS_MIN = 1, BLOCK_HITS_MAX = 3; // blocos: 1 bombada no inicio -> 3 no fim (igual a hoje no mapa 1)
const ENEMY_HITS_MIN = 2, ENEMY_HITS_MAX = 5; // inimigos comuns: 2 -> 5 bombadas
const MVP_HIT_MULT = 5;                       // MVP aguenta 5x um inimigo comum do mesmo ponto (mini-boss)

/** HP de um bloco nesse mapa+instancia (hits-alvo x dano esperado do heroi ali). */
export const blockHp = (mapIndex: number, instance: number): number => {
  const t = mapProgress(mapIndex, instance);
  const hits = BLOCK_HITS_MIN + (BLOCK_HITS_MAX - BLOCK_HITS_MIN) * t;
  return Math.max(1, Math.round(hits * expectedDmg(t)));
};

/** Multiplicador de HP do bau por cima do HP base da raridade (RARITIES[r].hp em state.ts).
 *  Acompanha o dano esperado do heroi 1:1 -> abrir um bau custa o MESMO numero de bombadas
 *  do inicio ao fim do jogo, pra raridade nao virar inviavel nos mapas mais avancados. */
export const chestHpMult = (mapIndex: number, instance: number): number => {
  const t = mapProgress(mapIndex, instance);
  return expectedDmg(t) / DMG_MIN;
};

/** HP de um inimigo comum nesse ponto da progressao. */
export const enemyHp = (mapIndex: number, instance: number): number => {
  const t = mapProgress(mapIndex, instance);
  const hits = ENEMY_HITS_MIN + (ENEMY_HITS_MAX - ENEMY_HITS_MIN) * t;
  return Math.max(1, Math.round(hits * expectedDmg(t)));
};

/** So existe MVP na ultima instancia (33) de cada mapa. */
export const hasMvp = (instance: number) => instance === INSTANCES_PER_MAP;

/** HP do MVP daquele mapa (so existe quando hasMvp(instance) e true). */
export const mvpHp = (mapIndex: number, instance: number): number => Math.round(enemyHp(mapIndex, instance) * MVP_HIT_MULT);
