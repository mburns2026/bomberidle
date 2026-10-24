import Phaser from "phaser";
import { FarmScene, GAME_W, GAME_H } from "./scenes/FarmScene";
import {
  RARITIES, RARITY_ORDER, Rarity, HeroData, store, refillAll, mapState, MISSIONS, missionProgress, missionClaimed, claimMission,
  upgrade, upgradeCost, UP_MAX, xpInfo, UpKey, sortOps, buyCapsule, CAPSULE_PRICE, CAPSULE_ODDS, MAX_COLLECTION, MAX_WORKING,
  isWorking, setWorking, workAll, restAll, buyLodging, buyButler, toggleButler, economyTick, LODGING, LodgeKind, BUTLER_PRICE, OUTSIDE_RATE, MAX_LODGINGS, saveNow, START_BALANCE,
} from "./state";
import { MAPS, INSTANCES_PER_MAP } from "./maps";
import { abilitiesOf, abilityStatus, bomberClass, peekRuntime } from "./game/bomberAbilities";
import { CLASS_INFO, NEUTRAL_MODS } from "./game/bomberConfig";
import type { Modifiers } from "./game/bomberTypes";
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
interface AbilRef { name: HTMLElement; state: HTMLElement; id: string }
interface HeroRef { lvl: HTMLElement; xp: HTMLElement; fill: HTMLElement; st: HTMLElement; work: HTMLButtonElement; ups: Record<UpKey, HTMLButtonElement>; stats: HTMLElement; eff: HTMLElement; abil: AbilRef[]; perf: HTMLElement }

/** Texto curto dos bonus ativos agora (so o que difere do normal). */
function effText(m: Modifiers): string {
  const p: string[] = [];
  const mult = (k: keyof Modifiers, label: string) => { if (Math.abs(m[k] - NEUTRAL_MODS[k]) > 0.005) p.push(`${label} ×${m[k].toFixed(2)}`); };
  mult("dmgMult", "dano"); mult("speedMult", "veloc."); mult("regenMult", "regen."); mult("staminaCostMult", "custo");
  if (m.luckBonus > 0.005) p.push(`sorte +${m.luckBonus.toFixed(2)}`);
  if (m.critChance > 0.005) p.push(`crítico ${Math.round(m.critChance * 100)}%`);
  if (m.blastRangeBonus > 0) p.push(`alcance +${m.blastRangeBonus}`);
  return p.join(" · ");
}
const refs = new Map<string, HeroRef>();

let builtVersion = -1;
let filter: Rarity | "all" = "all";
const PAGE = 30; // linhas por vez: com 500 operadores a lista inteira deixava a pagina pesada
let shownLimit = PAGE;
function buildHeroes() {
  builtVersion = store.version;
  const list = $("heroes");
  list.replaceChildren();
  refs.clear();
  const fbox = $("hero-filter");
  fbox.replaceChildren();
  const chip = (label: string, key: Rarity | "all", n: number) => {
    const b = el("button", "chip" + (filter === key ? " on" : ""), `${label} (${n})`);
    b.onclick = () => { filter = key; shownLimit = PAGE; buildHeroes(); };
    fbox.append(b);
  };
  chip("Todos", "all", store.collection.length);
  RARITY_ORDER.forEach((r) => chip(RARITIES[r].label, r, store.collection.filter((h) => h.rarity === r).length));
  const all = sortOps(store.collection).filter((h) => filter === "all" || h.rarity === filter);
  const shown = all.slice(0, shownLimit);
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
    const work = el("button", "up");
    work.onclick = () => { const err = setWorking(h, !isWorking(h)); if (err) toast(err); };
    upsRow.append(work);
    const ups = {} as Record<UpKey, HTMLButtonElement>;
    for (const u of UPS) {
      const b = el("button", "up");
      b.onclick = () => toast(upgrade(h, u.key) ? `${h.name}: ${u.label} nível ${h.up[u.key]}` : "$BOMBERSI insuficientes ou nível máximo");
      ups[u.key] = b;
      upsRow.append(b);
    }

    // classe de combate, poder/velocidade, habilidades e desempenho
    const cls = bomberClass(h.rarity), ci = CLASS_INFO[cls];
    const classLine = el("div", "muted small", `${ci.label} · ${ci.role}`);
    const stats = el("div", "small stats");
    const eff = el("div", "small eff");
    const abilBox = el("div", "abils");
    const abil: AbilRef[] = [];
    for (const def of abilitiesOf(cls)) {
      const row = el("div", "abil");
      row.title = def.desc;
      const name = el("span", "n", `${def.kind === "passive" ? "◆" : "✦"} ${def.name}`);
      const state = el("span", "s");
      row.append(name, state);
      abilBox.append(row);
      abil.push({ name, state, id: def.id });
    }
    const more = el("details", "more");
    more.append(el("summary", "", "Habilidades e desempenho"));
    for (const def of abilitiesOf(cls)) more.append(el("p", "", `${def.name}: ${def.desc}${def.kind === "active" ? ` (recarga ${Math.round(def.cooldownMs / 1000)} s, libera no nível ${def.unlockLevel})` : ""}`));
    const perf = el("p", "perf");
    more.append(perf);
    info.append(top, classLine, stats, lvlRow, bar, st, eff, abilBox, more, upsRow);
    li.append(img, info);
    list.append(li);
    refs.set(h.id, { lvl, xp, fill, st, work, ups, stats, eff, abil, perf });
  }
  if (all.length > shown.length) {
    const more = el("button", "chip", `Mostrar mais (${all.length - shown.length})`);
    more.onclick = () => { shownLimit += PAGE; buildHeroes(); };
    const wrap = el("li");
    wrap.style.gridTemplateColumns = "1fr";
    wrap.append(more);
    list.append(wrap);
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
    btn.onclick = () => toast(claimMission(m.id) ? `+${fmt(m.reward)} $BOMBERSI resgatados` : "Missão ainda não concluída");
    const box = el("div");
    box.append(el("strong", "", `${m.label} · +${fmt(m.reward)}`), bar, txt);
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
  add("Auto", () => {
    if (!mapState.auto && mapState.resume) { // volta para onde o Auto estava antes da escolha manual
      mapState.request = mapState.resume.i;
      mapState.requestInstance = mapState.resume.n;
      mapState.resume = null;
    }
    mapState.auto = true;
  });
  MAPS.forEach((m, i) => add(m.name, () => {
    if (mapState.auto) mapState.resume = { i: mapState.index, n: mapState.instance }; // guarda o progresso do Auto
    mapState.auto = false;
    mapState.request = i;
    mapState.requestInstance = null;
  }));
}
buildMaps();

function render() {
  $("pending").textContent = fmt(store.pending);
  $("chests").textContent = String(store.chests);
  $("mapname").textContent = `${MAPS[mapState.index].name} · Instância ${mapState.instance}/${INSTANCES_PER_MAP}`;
  const target = mapState.request ?? mapState.index;
  mapBtns.forEach((b, i) => b.classList.toggle("on", i === 0 ? mapState.auto : !mapState.auto && target === i - 1));

  if (builtVersion !== store.version) buildHeroes();
  const working = new Set(store.heroes);
  $("hero-info").textContent = `${store.collection.length}/${MAX_COLLECTION} operadores · ${working.size}/${MAX_WORKING} trabalhando${store.butler.owned ? ` · Zelador ${store.butler.on ? "ligado" : "desligado"}` : ""}${working.size === 0 && store.collection.length ? " · Ninguém em campo: use Enviar todos" : ""}`;
  for (const h of store.collection) {
    const ref = refs.get(h.id);
    if (!ref) continue;
    const x = xpInfo(h);
    ref.lvl.textContent = `Nv ${h.level}`;
    ref.xp.style.width = `${Math.min(100, (x.xp / x.need) * 100)}%`;
    ref.fill.style.width = `${Math.max(0, (h.stamina / h.maxStamina) * 100)}%`;
    const home = store.housed.get(h.id);
    const where = working.has(h) ? store.status[h.id] ?? "Pronto" : home ? `Descansando · ${LODGING[home].label}` : h.stamina < h.maxStamina ? "Descansando" : "Pronto na reserva";
    ref.st.textContent = `${working.has(h) ? "▶ Trabalhando" : "⏸ Reserva"} · ${where} · stamina ${h.stamina.toFixed(1)}/${h.maxStamina}`;
    // poder e velocidade: atual (com nivel e melhorias) contra o valor de fabrica
    ref.stats.textContent = `Poder ${h.power} · Veloc. ${h.speed.toFixed(2)} (base ${h.base.speed.toFixed(2)}) · Sorte ${h.luck.toFixed(2)} (base ${h.base.luck.toFixed(2)}) · Stamina máx. ${h.maxStamina} (base ${h.base.maxStamina})`;
    const rt = peekRuntime(h.id);
    ref.eff.textContent = working.has(h) && rt ? effText(rt.mods) : "";
    ref.eff.hidden = !ref.eff.textContent;
    const defs = abilitiesOf(bomberClass(h.rarity));
    ref.abil.forEach((a, i) => {
      const st = abilityStatus(rt, defs[i], h.level);
      a.state.textContent = st.text;
      a.state.className = `s ${st.state}`;
    });
    ref.perf.textContent = `Desempenho: ${fmt(h.stats.chests)} baús · ${fmt(h.stats.blocks)} blocos · ${fmt(h.stats.enemies)} inimigos · ${fmt(h.stats.crits)} críticos · ${fmt(h.stats.skills)} habilidades usadas`;
    ref.work.textContent = working.has(h) ? "Recolher" : "Enviar";
    ref.work.classList.toggle("poor", !working.has(h) && (working.size >= MAX_WORKING || h.stamina < 1));
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
setInterval(economyTick, 1000);
setInterval(saveNow, 10000); // stamina e posicao no mapa tambem ficam salvas
addEventListener("pagehide", saveNow);
document.addEventListener("visibilitychange", () => { if (document.hidden) saveNow(); });
$("work-all").onclick = () => { const n = workAll(); toast(n ? `${n} operador(es) enviados ao trabalho` : "Nenhuma vaga livre ou ninguém com 30%+ de stamina"); };
$("rest-all").onclick = () => { const n = restAll(); toast(n ? `${n} operador(es) recolhidos para descansar` : "Ninguém estava trabalhando"); };

try {
  if (!localStorage.getItem("bomber-idle:seen")) {
    localStorage.setItem("bomber-idle:seen", "1");
    toast(`Bem-vindo! Você começa com 1 operador e ${fmt(START_BALANCE)} $BOMBERSI: abra suas cápsulas no menu de baixo.`);
  }
} catch { /* sem storage: ignora */ }

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
  const btn = $("claim") as HTMLButtonElement;
  btn.disabled = true;
  try {
    const { transaction } = await requestClaim(wallet);
    const { Transaction } = await import("@solana/web3.js");
    const tx = Transaction.from(Uint8Array.from(atob(transaction), (c) => c.charCodeAt(0)));
    const { signature } = await (window as any).solana.signAndSendTransaction(tx);
    toast(`Saque enviado: ${signature.slice(0, 12)}…`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/reject|denied|cancel/i.test(msg)) toast("Saque cancelado na carteira.");
    else if (e instanceof TypeError) toast("Servidor indisponível: o saque on-chain ainda não está no ar.");
    else toast(msg ? `Saque indisponível: ${msg}` : "Saque indisponível no momento.");
  } finally {
    btn.disabled = !wallet;
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
  liveUpdate?.(); // evita o modal abrir com valores vazios por 400 ms
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

function openLodging() {
  const upd: (() => void)[] = [];
  openModal("Alojamentos", (body) => {
    body.append(el("p", "", `Operadores em reserva recuperam stamina sozinhos (${Math.round(OUTSIDE_RATE * 60)}/min). Em alojamentos a recuperação é bem mais rápida, e os mais raros ficam com as melhores vagas.`));
    const grid = el("div");
    grid.style.cssText = "display:grid;gap:10px;margin-bottom:10px";
    (["casulo", "modulo", "torre"] as LodgeKind[]).forEach((kind) => {
      const L = LODGING[kind];
      const card = el("div");
      card.style.cssText = "border:2px solid #5a3a1c;border-radius:8px;padding:10px;background:var(--card)";
      const own = el("b"), occ = el("b");
      const buy = el("button", "", L.price === null ? "Em breve · $ASG" : `Comprar · ${fmt(L.price)} $BOMBERSI`);
      buy.disabled = L.price === null;
      buy.onclick = () => { const e = buyLodging(kind); toast(e ?? `${L.label} comprado`); };
      const r1 = kv("Capacidade", `${L.cap} operadores`), r2 = kv("Recuperação", `${Math.round(L.rate * 60)}/min`);
      const r3 = el("div", "kv"); r3.append(el("span", "muted", "Você tem"), own);
      const r4 = el("div", "kv"); r4.append(el("span", "muted", "Vagas ocupadas"), occ);
      card.append(el("strong", "", L.label), r1, r2, r3, r4);
      card.append(buy);
      (buy.style as CSSStyleDeclaration).marginTop = "8px";
      grid.append(card);
      upd.push(() => {
        const used = Array.from(store.housed.values()).filter((k) => k === kind).length;
        own.textContent = String(store.lodging[kind]);
        occ.textContent = `${used}/${store.lodging[kind] * L.cap}`;
        if (L.price !== null) buy.disabled = store.pending < L.price;
      });
    });
    body.append(grid);

    const bc = el("div");
    bc.style.cssText = "border:2px solid var(--gold);border-radius:8px;padding:10px;background:var(--card)";
    const bstat = el("b");
    const bbtn = el("button");
    bbtn.onclick = () => {
      if (!store.butler.owned) { const e = buyButler(); toast(e ?? "Droide Zelador ativado"); } else toggleButler();
    };
    const brow = el("div", "kv"); brow.append(el("span", "muted", "Estado"), bstat);
    bc.append(
      el("strong", "", "Droide Zelador"),
      el("p", "small", "Cuida da sua equipe sozinho: recolhe quem cai abaixo de 15% de stamina, manda descansar e devolve ao trabalho quem chega a 80%. Um único droide cuida de todos os alojamentos."),
      brow, bbtn,
    );
    bbtn.style.marginTop = "8px";
    body.append(bc);
    upd.push(() => {
      bstat.textContent = !store.butler.owned ? "não comprado" : store.butler.on ? "ligado" : "desligado";
      bbtn.textContent = !store.butler.owned ? `Comprar · ${fmt(BUTLER_PRICE)} $BOMBERSI` : store.butler.on ? "Desligar" : "Ligar";
      bbtn.disabled = !store.butler.owned && store.pending < BUTLER_PRICE;
    });
    body.append(el("p", "muted small", `Limite de ${MAX_LODGINGS} alojamentos por carteira. A Torre será vendida em $ASG.`));
  }, () => upd.forEach((f) => f()));
}

const HUB: Record<string, () => void> = {
  heroes: () => {
    closeModal();
    tabs[0].click();
    document.querySelector("aside")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },
  capsules: () => openCapsules(),
  lodging: () => openLodging(),
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
      "Seus operadores entram em expedição automaticamente: andam pelo mapa, plantam bombas, quebram blocos e abrem baús.",
      "Cada bomba gasta stamina. Sem stamina, o operador dorme e volta quando se recupera.",
      "Os baús têm vida (HP): quanto mais raro, mais bombas são necessárias para abri-lo. Quem dá o golpe final leva a recompensa.",
      "Inimigos vagam pelo mapa e também pagam $BOMBERSI (e XP) a quem os derrotar. Na última instância de cada mapa aparece um MVP, bem mais forte e que paga muito mais.",
      "Use os $BOMBERSI para melhorar Stamina, Velocidade e Sorte de cada operador, ou para abrir Cápsulas de Recruta.",
    ]);
    sec("Classes e habilidades", [
      "Cada operador tem uma classe de combate: Lyra (suporte), Titan (tanque explosivo), Vex (hacker de tesouros), Kira (velocidade), Jax (samurai) e Orion (híbrido supremo).",
      "Cada classe tem uma habilidade passiva (sempre ligada) e uma ativa, que o operador usa sozinho quando faz sentido. A ativa libera no nível 3 (Ascensão do Orion, no nível 8) e tem recarga.",
      "Efeitos ativos e recargas valem só durante a sessão: ao recarregar a página eles recomeçam, e as recargas voltam parcialmente aquecidas.",
      "Habilidades não geram $BOMBERSI: elas mudam como o operador luta, se move e escolhe alvos. As recompensas dos baús e inimigos continuam as mesmas.",
    ]);
    sec("Mapas e instâncias", [
      "São 50 mapas, cada um com 33 instâncias. A cada instância limpa o jogo avança sozinho (modo Auto).",
      "Quanto mais longe, mais HP têm blocos, baús e inimigos, e maior a chance de um bloco soltar baú.",
      "Escolher um mapa na mão não apaga o progresso: o botão Auto volta para a instância em que você estava.",
      "O mapa, a instância e a stamina ficam salvos neste navegador.",
    ]);
    sec("Bom saber", [
      "Operadores só trabalham com o jogo aberto e visível: não há mineração offline.",
      "Missões diárias reiniciam à meia-noite (horário do seu aparelho) e pagam $BOMBERSI.",
      "Operadores sobem de nível com XP ganho nos baús e inimigos (até o nível 30).",
      "No máximo 15 operadores trabalham ao mesmo tempo. Use Enviar todos e Recolher todos, ou o Droide Zelador para automatizar.",
      "Dica: sem Alojamento, quem está na reserva recupera só 6 stamina por minuto. Compre um Casulo antes do Droide Zelador.",
      "Dica: ter mais de 15 operadores só compensa com Zelador e Alojamentos, para revezar quem está cansado.",
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
