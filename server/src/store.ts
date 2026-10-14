import { Player } from "./game/types.js";

// TODO: trocar por PostgreSQL + Redis. Memoria apenas para desenvolvimento.
const players = new Map<string, Player>();

export function getPlayer(wallet: string): Player {
  let p = players.get(wallet);
  if (!p) {
    p = {
      wallet,
      heroes: [
        { id: "starter-1", rarity: "common", power: 3, speed: 12, maxStamina: 8, stamina: 8 },
      ],
      pending: 0n,
      lastSettledAt: Date.now(),
      nonce: 0,
    };
    players.set(wallet, p);
  }
  return p;
}
