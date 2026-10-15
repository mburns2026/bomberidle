import Phaser from "phaser";
import { FarmScene, GAME_W, GAME_H } from "./scenes/FarmScene";
import {
  RARITIES, store, refillAll, mapState, MISSIONS, missionProgress, missionClaimed, claimMission,
  upgrade, upgradeCost, UP_MAX, xpInfo, UpKey,
} from "./state";
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
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// ---------- abas ----------
const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
tabs.forEach((btn) => {
  btn.onclick = () => {
    tabs.forEach((b) => b.classList.toggle("on", b === btn));
    ["heroes", "missions", "maps"].forEach((t) => { $("tab-" + t).hidden = t !== btn.dataset.tab; });
  };
});

// ---------- herois: nivel, XP, stamina e melhorias ----------
const UPS: { key: UpKey; label: string }[] = [
  { key: "stamina", label: "Stamina" },
  { key: "speed", label: "Veloc." },
  { key: "luck", label: "Sorte" },
];
interface HeroRef { lvl: HTMLElement; xp: HTMLElement; fill: HTMLElement; st: HTMLElement; ups: Record<UpKey, HTMLButtonElement> }
const refs = new Map<string, HeroRef>();

function buildHeroes() {
  const list = $("heroes");
  for (const h of store.heroes) {
    const r = RARITIES[h.rarity];
    const li = el("li");
    const img = el("img");
    img.src = import.meta.env.BASE_URL + h.portrait;
    img.alt = `Carta NFT do operador ${h.name}`;
    img.style.borderColor = r.css;

    const info = el("div");
    const top = el("div", "hero-top");
    const tier = el("span", "tier", r.label);
    tier.style.color = r.css;
    top.append(el("strong", "", h.name), tier);

    const lvl = el("span", "lvl");
    const xpBar = el("div", "bar thin");
    const xp = el("div");
    xpBar.append(xp);
    const lvlRow = el("div", "lvl-row");
    lvlRow.append(lvl, xpBar);

    const bar = el("div", "bar");
    const fill = el("div");
    fill.style.background = r.css;
    bar.append(fill);
    const st = el("div", "muted small");

    const upsRow = el("div", "ups");
    const ups = {} as Record<UpKey, HTMLButtonElement>;
    for (const u of UPS) {
      const b = el("button", "up");
      b.onclick = () => toast(upgrade(h, u.key) ? `${h.name}: ${u.label} nível ${h.up[u.key]}` : "$BOMBERSI insuficientes ou nível máximo");
      ups[u.key] = b;
      upsRow.append(b);
    }

    info.append(top, el("div", "muted small", h.role), lvlRow, bar, st, upsRow);
    li.append(img, info);
    list.append(li);
    refs.set(h.id, { lvl, xp, fill, st, ups });
  }
}
buildHeroes();

// ---------- missoes diarias ----------
const mRefs = new Map<string, { fill: HTMLElement; txt: HTMLElement; btn: HTMLButtonElement }>();
function buildMissions() {
  const list = $("missions");
  for (const m of MISSIONS) {
    const li = el("li", "mission");
    const bar = el("div", "bar");
    const fill = el("div");
    fill.style.background = "#ffd24a";
    bar.append(fill);
    const txt = el("div", "muted small");
    const btn = el("button", "up", "Resgatar");
    btn.onclick = () => toast(claimMission(m.id) ? `+${m.reward} $BOMBERSI resgatados` : "Missão ainda não concluída");
    const box = el("div");
    box.append(el("strong", "", `${m.label} · +${m.reward}`), bar, txt);
    li.append(box, btn);
    list.append(li);
    mRefs.set(m.id, { fill, txt, btn });
  }
}
buildMissions();

// ---------- mapas ----------
const mapBtns: HTMLButtonElement[] = [];
function buildMaps() {
  const box = $("maps");
  const add = (label: string, onClick: () => void) => {
    const b = el("button", "chip", label);
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
    const x = xpInfo(h);
    ref.lvl.textContent = `Nv ${h.level}`;
    ref.xp.style.width = `${Math.min(100, (x.xp / x.need) * 100)}%`;
    ref.fill.style.width = `${Math.max(0, (h.stamina / h.maxStamina) * 100)}%`;
    ref.st.textContent = `${store.status[h.id] ?? "Pronto"} · stamina ${h.stamina.toFixed(1)}/${h.maxStamina}`;
    for (const u of UPS) {
      const b = ref.ups[u.key], maxed = h.up[u.key] >= UP_MAX, cost = upgradeCost(h, u.key);
      b.textContent = maxed ? `${u.label} MAX` : `${u.label} ${h.up[u.key]}/${UP_MAX} · ${cost}`;
      b.disabled = maxed;
      b.classList.toggle("poor", !maxed && store.pending < cost);
    }
  }
  for (const m of MISSIONS) {
    const ref = mRefs.get(m.id)!, p = Math.min(missionProgress(m), m.goal);
    ref.fill.style.width = `${(p / m.goal) * 100}%`;
    ref.txt.textContent = `${p}/${m.goal}`;
    const done = missionClaimed(m.id);
    ref.btn.textContent = done ? "Resgatado" : "Resgatar";
    ref.btn.disabled = done || p < m.goal;
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
