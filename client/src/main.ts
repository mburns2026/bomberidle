import Phaser from "phaser";
import { FarmScene, GAME_W, GAME_H } from "./scenes/FarmScene";
import {
  RARITIES, RARITY_ORDER, Rarity, HeroData, store, refillAll, mapState, MISSIONS, missionProgress, missionClaimed, claimMission,
  upgrade, upgradeCost, UP_MAX, xpInfo, UpKey, sortOps, buyCapsule, CAPSULE_PRICE, CAPSULE_ODDS, MAX_COLLECTION, MAX_WORKING,
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
let liveUpdate: (() => void) | null = null;
const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");

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

let builtVersion = -1;
let filter: Rarity | "all" = "all";
function buildHeroes() {
  builtVersion = store.version;
  const list = $("heroes");
  list.replaceChildren();
  refs.clear();
  const fbox = $("hero-filter");
  fbox.replaceChildren();
  const chip = (label: string, key: Rarity | "all", n: number) => {
    const b = el("button", "chip" + (filter === key ? " on" : ""), `${label} (${n})`);
    b.onclick = () => { filter = key; buildHeroes(); };
    fbox.append(b);
  };
  chip("Todos", "all", store.collection.length);
  RARITY_ORDER.forEach((r) => chip(RARITIES[r].label, r, store.collection.filter((h) => h.rarity === r).length));
  const shown = sortOps(store.collection).filter((h) => filter === "all" || h.rarity === filter);
  if (!shown.length) list.append(el("li", "muted small", "Nenhum operador desta raridade ainda."));
  for (const h of shown) {
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
  $("pending").textContent = fmt(store.pending);
  $("chests").textContent = String(store.chests);
  $("mapname").textContent = MAPS[mapState.index].name;
  const target = mapState.request ?? mapState.index;
  mapBtns.forEach((b, i) => b.classList.toggle("on", i === 0 ? mapState.auto : !mapState.auto && target === i - 1));

  if (builtVersion !== store.version) buildHeroes();
  const working = new Set(store.heroes);
  $("hero-info").textContent = `${store.collection.length}/${MAX_COLLECTION} operadores · ${working.size}/${MAX_WORKING} trabalhando (os melhores entram em campo)`;
  for (const h of store.collection) {
    const ref = refs.get(h.id);
    if (!ref) continue;
    const x = xpInfo(h);
    ref.lvl.textContent = `Nv ${h.level}`;
    ref.xp.style.width = `${Math.min(100, (x.xp / x.need) * 100)}%`;
    ref.fill.style.width = `${Math.max(0, (h.stamina / h.maxStamina) * 100)}%`;
    ref.st.textContent = `${working.has(h) ? store.status[h.id] ?? "Pronto" : "Em reserva"} · stamina ${h.stamina.toFixed(1)}/${h.maxStamina}`;
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
  liveUpdate?.();
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

// ---------- hub (menu inferior) ----------
const modal = $("modal");
const modalBody = $("modal-body");
function closeModal() { modal.hidden = true; liveUpdate = null; hubBtns.forEach((b) => b.classList.remove("on")); }
function openModal(title: string, build: (body: HTMLElement) => void, live?: () => void) {
  $("modal-title").textContent = title;
  modalBody.replaceChildren();
  build(modalBody);
  liveUpdate = live ?? null;
  modal.hidden = false;
}
$("modal-close").onclick = closeModal;
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

const soon = (title: string, what: string, bullets: string[]) => (body: HTMLElement) => {
  body.append(el("span", "badge", "Em breve"), el("p", "", what));
  const ul = el("ul", "plain");
  bullets.forEach((b) => ul.append(el("li", "", b)));
  body.append(ul);
};
const kv = (k: string, v: string) => {
  const row = el("div", "kv");
  row.append(el("span", "muted", k), el("b", "", v));
  return row;
};


function openCapsules() {
  let results: HeroData[] = [];
  const resBox = el("div");
  resBox.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:12px 0";
  const b1 = el("button", "", `Abrir ×1 · ${fmt(CAPSULE_PRICE)}`);
  const b5 = el("button", "", `Abrir ×5 · ${fmt(CAPSULE_PRICE * 5)}`);
  const showResults = () => {
    resBox.replaceChildren();
    for (const h of results) {
      const r = RARITIES[h.rarity];
      const card = el("div");
      card.style.cssText = `display:grid;grid-template-columns:44px 1fr;gap:8px;background:var(--card);border:2px solid ${r.css};border-radius:8px;padding:6px`;
      const img = el("img");
      img.src = import.meta.env.BASE_URL + h.portrait;
      img.alt = `Carta NFT do operador ${h.name}`;
      img.style.cssText = `width:44px;height:62px;object-fit:cover;object-position:top;border:2px solid ${r.css};border-radius:6px`;
      const info = el("div");
      const tier = el("div", "small", r.label);
      tier.style.cssText = `color:${r.css};font-weight:800`;
      info.append(el("strong", "small", h.name), tier, el("div", "muted small", `Stamina ${h.maxStamina} · Veloc. ${h.speed}`));
      card.append(img, info);
      resBox.append(card);
    }
  };
  const buy = (n: number) => {
    const r = buyCapsule(n);
    if (typeof r === "string") { toast(r); return; }
    results = r;
    showResults();
    const best = sortOps(r)[0];
    toast(n === 1 ? `Novo operador: ${best.name} (${RARITIES[best.rarity].label})` : `5 novos operadores! Melhor: ${best.name} (${RARITIES[best.rarity].label})`);
  };
  b1.onclick = () => buy(1);
  b5.onclick = () => buy(5);
  const bal = el("div", "big");
  openModal("Cápsula de Recruta", (body) => {
    body.append(
      el("p", "", "Cada cápsula sorteia um operador: raridade, atributos e habilidade são definidos de forma independente. Operadores repetidos têm pequenas variações."),
      bal,
    );
    const row = el("div");
    row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap";
    row.append(b1, b5);
    body.append(row, resBox);
    body.append(el("strong", "", "Chances"));
    RARITY_ORDER.forEach((r) => {
      const line = kv(RARITIES[r].label, `${CAPSULE_ODDS[r]}%`);
      (line.firstChild as HTMLElement).style.color = RARITIES[r].css;
      body.append(line);
    });
    body.append(el("p", "muted small", `Preço: ${fmt(CAPSULE_PRICE)} $BOMBERSI por cápsula. Limite de ${MAX_COLLECTION} operadores. A Cápsula Premium ($ASG) chega depois.`));
  }, () => {
    bal.textContent = `${fmt(store.pending)} $BOMBERSI`;
    b1.disabled = store.pending < CAPSULE_PRICE;
    b5.disabled = store.pending < CAPSULE_PRICE * 5;
  });
}

const HUB: Record<string, () => void> = {
  heroes: () => {
    closeModal();
    tabs[0].click();
    document.querySelector("aside")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },
  capsules: () => openCapsules(),
  lodging: () => openModal("Alojamentos", soon("", "Operadores cansados recuperam stamina bem mais rápido dentro de um alojamento.", [
    "Cápsula, Módulo e Torre: cada um com capacidade e velocidade de recuperação próprias.",
    "Droide Zelador: leva os cansados para descansar e os devolve ao trabalho sozinho.",
  ])),
  exchange: () => openModal("Bolsa", soon("", "Compre e venda operadores raros e alojamentos com outros jogadores.", [
    "Somente raridades altas e alojamentos.",
    "Uma taxa por venda alimenta o sumidouro da economia.",
  ])),
  invites: () => openModal("Convites", soon("", "Convide amigos com seu link e ganhe operadores de resgate quando eles jogarem.", [
    "Link e código pessoais.",
    "Resgate dos operadores ganhos pela aba Resgates.",
  ])),
  vault: () => openModal("Cofre de Recompensas", (body) => {
    const big = el("div", "big");
    big.id = "vault-balance";
    const note = el("p", "muted small", "Seus $BOMBERSI de teste ficam salvos só neste navegador. O saque on-chain (mínimo, taxa e histórico) chega na versão 1.8.");
    const go = el("button", "", "Sacar");
    go.id = "vault-claim";
    go.onclick = () => { const c = $("claim") as HTMLButtonElement; if (c.disabled) toast("Conecte a carteira primeiro."); else c.click(); };
    body.append(el("div", "muted small", "Recompensas das expedições"), big, kv("Baús abertos", ""), note, go);
  }, () => {
    const b = document.getElementById("vault-balance");
    if (b) b.textContent = `${fmt(store.pending)} $BOMBERSI`;
    const row = modalBody.querySelector(".kv b");
    if (row) row.textContent = String(store.chests);
  }),
  manual: () => openModal("Manual", (body) => {
    const sec = (t: string, items: string[]) => {
      body.append(el("strong", "", t));
      const ol = el("ol");
      items.forEach((i) => ol.append(el("li", "", i)));
      body.append(ol);
    };
    sec("Como funciona", [
      "Seus operadores entram em expedição automaticamente: andam pelo mapa, plantam bombas e abrem baús.",
      "Cada bomba gasta stamina. Sem stamina, o operador descansa e volta quando se recupera.",
      "Os baús rendem $BOMBERSI. Quanto mais rara a caixa e o operador, maior o ganho.",
      "Use os $BOMBERSI para melhorar Stamina, Velocidade e Sorte de cada operador.",
    ]);
    sec("Bom saber", [
      "Operadores só trabalham com o jogo aberto: não há mineração offline.",
      "Missões diárias reiniciam todo dia e pagam $BOMBERSI.",
      "Cinco mapas com biomas diferentes; o modo Auto avança sozinho.",
      "Operadores sobem de nível com XP ganho nos baús (até o nível 30).",
    ]);
  }),
  settings: () => openModal("Configurações", (body) => {
    body.append(
      kv("Carteira", wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "não conectada"),
      kv("Rede", "devnet (teste)"),
      kv("Moeda do jogo", "$BOMBERSI"),
      kv("Token do estúdio", "$ASG"),
    );
    const reset = el("button", "danger", "Apagar progresso deste navegador");
    reset.style.marginTop = "14px";
    reset.onclick = () => {
      if (confirm("Isso apaga operadores, níveis, missões e $BOMBERSI de teste salvos neste navegador. Continuar?")) {
        try { localStorage.removeItem("bomber-idle:v1"); } catch { /* ignora */ }
        location.reload();
      }
    };
    body.append(reset);
  }),
};
const hubBtns = Array.from(document.querySelectorAll<HTMLButtonElement>("#hub button"));
hubBtns.forEach((b) => {
  b.onclick = () => {
    hubBtns.forEach((x) => x.classList.toggle("on", x === b));
    HUB[b.dataset.hub!]();
    if (b.dataset.hub === "heroes") hubBtns.forEach((x) => x.classList.remove("on"));
  };
});
