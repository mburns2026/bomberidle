import Phaser from "phaser";
import { FarmScene, GAME_W, GAME_H } from "./scenes/FarmScene";
import { RARITIES, RARITY_ORDER, HeroData, store, refillAll, assetUrl } from "./state";
import { connect, requestClaim } from "./wallet";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_W,
  height: GAME_H,
  backgroundColor: "#07040f",
  antialias: true,
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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---------- ficha do NFT ----------
function closeSheet() {
  $("modal").hidden = true;
  $("modal").replaceChildren();
}

function openSheet(h: HeroData) {
  const r = RARITIES[h.rarity];
  const modal = $("modal");
  modal.replaceChildren();

  const sheet = el("div", "sheet");
  sheet.style.setProperty("--rc", r.css);

  const close = el("button", "close", "✕");
  close.setAttribute("aria-label", "Fechar");
  close.onclick = closeSheet;

  const img = el("img", "card");
  img.src = assetUrl(`nft/${h.id}_card.webp`);
  img.alt = `Carta NFT de ${h.name}`;

  const body = el("div", "body");
  const badge = el("span", "badge", r.label);
  const dl = el("dl");
  const row = (k: string, v: string) => { dl.append(el("dt", undefined, k), el("dd", undefined, v)); };
  row("Título", h.title);
  row("Classe", h.klass);
  row("Equipamento", h.gear);
  row("Poder", `${h.power}/5`);
  row("Velocidade", `x${h.speed.toFixed(1)}`);
  row("Stamina", String(h.maxStamina));

  const chips = el("div", "chips");
  h.stats.forEach(([k, v]) => chips.append(el("span", undefined, `${k}: ${v}`)));

  const perk = el("div", "perk");
  perk.append(el("b", undefined, h.perk.name), el("div", undefined, h.perk.desc));

  body.append(el("h3", undefined, h.name), badge, dl, chips, perk, el("p", "lore", h.lore));
  sheet.append(close, img, body);
  modal.append(sheet);
  modal.hidden = false;
  close.focus();
}

$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

// ---------- painel de herois ----------
const live = new Map<string, { fill: HTMLElement; status: HTMLElement }>();

function buildHeroes() {
  const list = $("heroes");
  list.replaceChildren();
  $("count").textContent = `${store.heroes.length} NFTs`;
  for (const h of store.heroes) {
    const r = RARITIES[h.rarity];
    const li = el("li");
    const btn = el("button", `hero r-${h.rarity}`);
    btn.type = "button";
    btn.style.setProperty("--rc", r.css);
    btn.setAttribute("aria-label", `Ver ficha de ${h.name}, ${r.label}`);
    btn.onclick = () => openSheet(h);

    const face = el("img", "face");
    face.src = assetUrl(`nft/${h.id}_face.webp`);
    face.alt = "";

    const info = el("div", "info");
    const line = el("div", "line1");
    line.append(el("strong", undefined, h.name), el("span", "badge", r.label));
    const sub = el("div", "sub", `${h.title} · ${h.perk.name}`);
    const bar = el("div", "bar");
    const fill = el("div");
    bar.append(fill);
    const status = el("div", "muted small");
    info.append(line, sub, bar, status);

    btn.append(face, info);
    li.append(btn);
    list.append(li);
    live.set(h.id, { fill, status });
  }

  const legend = $("legend");
  legend.replaceChildren();
  for (const k of RARITY_ORDER) {
    const s = el("span", undefined, RARITIES[k].label);
    s.style.setProperty("--rc", RARITIES[k].css);
    legend.append(s);
  }
}

function render() {
  $("pending").textContent = store.pending.toFixed(2);
  $("chests").textContent = String(store.chests);
  for (const h of store.heroes) {
    const n = live.get(h.id);
    if (!n) continue;
    n.fill.style.width = `${Math.max(0, (h.stamina / h.maxStamina) * 100)}%`;
    n.status.textContent = `${store.status[h.id] ?? "Pronto"} · stamina ${h.stamina.toFixed(1)}/${h.maxStamina}`;
  }
}
buildHeroes();
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
