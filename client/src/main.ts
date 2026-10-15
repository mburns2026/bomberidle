import Phaser from "phaser";
import { FarmScene, GAME_W, GAME_H } from "./scenes/FarmScene";
import { RARITIES, store, refillAll, mapState } from "./state";
import { MAPS } from "./maps";
import { connect, requestClaim } from "./wallet";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_W,
  height: GAME_H,
  backgroundColor: "#1b2a14",
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

const refs = new Map<string, { fill: HTMLElement; st: HTMLElement }>();

function buildHeroes() {
  const list = $("heroes");
  for (const h of store.heroes) {
    const r = RARITIES[h.rarity];
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = import.meta.env.BASE_URL + h.portrait;
    img.alt = `Carta NFT de ${h.name}`;
    img.style.borderColor = r.css;

    const info = document.createElement("div");
    const top = document.createElement("div");
    top.className = "hero-top";
    const name = document.createElement("strong");
    name.textContent = h.name;
    const tier = document.createElement("span");
    tier.className = "tier";
    tier.textContent = r.label;
    tier.style.color = r.css;
    top.append(name, tier);

    const role = document.createElement("div");
    role.className = "muted small";
    role.textContent = h.role;

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.style.background = r.css;
    bar.append(fill);

    const st = document.createElement("div");
    st.className = "muted small";

    info.append(top, role, bar, st);
    li.append(img, info);
    list.append(li);
    refs.set(h.id, { fill, st });
  }
}
buildHeroes();

const mapBtns: HTMLButtonElement[] = [];
function buildMaps() {
  const box = $("maps");
  const add = (label: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = label;
    b.onclick = onClick;
    box.append(b);
    mapBtns.push(b);
  };
  add("Auto", () => { mapState.auto = true; });
  MAPS.forEach((m, i) => add(m.name, () => { mapState.auto = false; mapState.request = i; }));
}
buildMaps();

function render() {
  $("pending").textContent = store.pending.toFixed(2);
  $("chests").textContent = String(store.chests);
  $("mapname").textContent = MAPS[mapState.index].name;
  const target = mapState.request ?? mapState.index;
  mapBtns.forEach((b, i) => b.classList.toggle("on", i === 0 ? mapState.auto : !mapState.auto && target === i - 1));
  for (const h of store.heroes) {
    const ref = refs.get(h.id)!;
    ref.fill.style.width = `${Math.max(0, (h.stamina / h.maxStamina) * 100)}%`;
    ref.st.textContent = `${store.status[h.id] ?? "Pronto"} · stamina ${h.stamina.toFixed(1)}/${h.maxStamina}`;
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
