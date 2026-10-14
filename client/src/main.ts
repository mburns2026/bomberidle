import Phaser from "phaser";
import { FarmScene, GAME_W, GAME_H } from "./scenes/FarmScene";
import { RARITIES, store, refillAll } from "./state";
import { connect, requestClaim } from "./wallet";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_W,
  height: GAME_H,
  backgroundColor: "#1d3a17",
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [FarmScene],
});

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let wallet = "";

function toast(msg: string) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

function render() {
  $("pending").textContent = store.pending.toFixed(2);
  $("chests").textContent = String(store.chests);
  const list = $("heroes");
  list.replaceChildren();
  for (const h of store.heroes) {
    const r = RARITIES[h.rarity];
    const li = document.createElement("li");

    const top = document.createElement("div");
    top.className = "hero-top";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = r.css;
    const name = document.createElement("strong");
    name.textContent = h.name;
    const rar = document.createElement("span");
    rar.className = "muted";
    rar.textContent = r.label;
    top.append(dot, name, rar);

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.style.width = `${Math.max(0, (h.stamina / h.maxStamina) * 100)}%`;
    fill.style.background = r.css;
    bar.append(fill);

    const st = document.createElement("div");
    st.className = "muted small";
    st.textContent = `${store.status[h.id] ?? "Pronto"} · stamina ${h.stamina.toFixed(1)}/${h.maxStamina}`;

    li.append(top, bar, st);
    list.append(li);
  }
}
render();
setInterval(render, 400);

$("refill").onclick = () => { refillAll(); toast("Stamina recarregada (modo teste)"); };

$("connect").onclick = async () => {
  try {
    wallet = await connect();
    $("connect").textContent = `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
    ($("claim") as HTMLButtonElement).disabled = false;
  } catch (e) {
    toast((e as Error).message);
  }
};

$("claim").onclick = async () => {
  try {
    const { transaction } = await requestClaim(wallet);
    const { Transaction } = await import("@solana/web3.js");
    const tx = Transaction.from(Uint8Array.from(atob(transaction), (c) => c.charCodeAt(0)));
    const { signature } = await (window as any).solana.signAndSendTransaction(tx);
    toast(`Saque enviado: ${signature.slice(0, 12)}…`);
  } catch (e) {
    toast("Saque indisponível: o servidor on-chain ainda não está no ar.");
  }
};
