export type Rarity = "common" | "rare" | "epic" | "mythic" | "legendary" | "supreme";

export interface Hero {
  id: string;
  rarity: Rarity;
  power: number;      // chance/valor de dano em blocos
  speed: number;      // baus por hora base
  maxStamina: number; // horas de farming por recarga
  stamina: number;
}

export interface Player {
  wallet: string;
  heroes: Hero[];
  pending: bigint;       // recompensa acumulada (unidades minimas do token)
  lastSettledAt: number; // epoch ms
  nonce: number;         // ultimo nonce usado no claim
}
