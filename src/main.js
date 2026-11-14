import "./style.css";
import * as St from "./state.js";
import { BY, WORDS, MAXR, LEVELS, INTERVAL, today, addDays, customWords } from "./state.js";
import { SENT, pending, getSentences, onAI, aiCall } from "./ai.js";
import * as AI from "./ai.js";
import { cloud } from "./cloud.js";
import * as Learn from "./learn.js";
import * as Saetze from "./saetze.js";
import { startTour, tourSeen, welcomeHTML, helpHTML } from "./tour.js";
import { esc, keyOf, wordHTML, posLabel, isNoun, tile, freqHTML, caseOf, attachPhotos, sayText, hasPicture, photosOn, setPhotos } from "./visuals.js";

window.__BY = BY;
const $ = (id) => document.getElementById(id);
const main = $("main");
const LS = "wz4034";
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let view = "";
let dir = lsGet("wz-dir") || "de";
let flipped = false;
let dict = { q: "", pos: "all", st: "all", limit: 120, view: "dict" };
let mine = { text: "", topic: "", n: 20, busy: "", err: "", preview: null };

/* ---------- persistence ---------- */
St.onChange((S) => { lsSet(LS, S); cloud.saveProgress(S, setSync); renderBadge(); });
function setSync(s) {
  const el = $("sync");
  if (!cloud.enabled || !cloud.user) { el.hidden = true; return; }
  el.hidden = false; el.className = "sync " + (s === "busy" ? "busy" : s === "err" ? "err" : "");
  el.textContent = s === "busy" ? "Speichert…" : s === "err" ? "Nicht synchron" : "Synchron";
}

/* ---------- speech ---------- */
const canSpeak = "speechSynthesis" in window;
let rate = lsGet("wz-rate") || 0.9;
function speak(t) {
  if (!canSpeak) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = "de-DE"; u.rate = rate;
    const v = speechSynthesis.getVoices().find((v) => v.lang?.startsWith("de")); if (v) u.voice = v; speechSynthesis.speak(u); } catch {}
}
const SPK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
const spkBtn = (text, cls = "") => (canSpeak ? `<button class="icon-btn ${cls}" data-say="${esc(text)}" aria-label="Vorlesen" title="Vorlesen">${SPK}</button>` : "");

/* ---------- translation language (English or Arabic) ---------- */
const isAr = () => St.S.lang === "ar";
const trW = (w) => (isAr() && w.ar ? w.ar : w.e);
function gloss(w, cls = "gloss") { const a = isAr() && w.ar; return `<span class="${cls}${a ? " ar" : ""}"${a ? ' dir="rtl" lang="ar"' : ""}>${esc(trW(w))}</span>`; }
function sTr(s, kind) {
  const ar = kind === "k" ? s.ar_k : s.ar_s, en = kind === "k" ? s.ken : s.en;
  return isAr() && ar ? `<span class="tr ar" dir="rtl" lang="ar">${esc(ar)}</span>` : `<span class="en">${esc(en)}</span>`;
}
function syncLang() { document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String((St.S.lang || "en") === b.dataset.lang))); }

/* ---------- shared bits ---------- */
function sentHTML(r, { full = true } = {}) {
  const w = BY.get(r); const s = SENT[r] || St.S.custom?.[r]?.s || w?.s;
  if (s && s.de) {
    const ex = [];
    if (s.pl) ex.push(`<span>Plural: <b>${esc(s.pl)}</b></span>`);
    if (s.konj && w.p === "verb") ex.push(`<span>${esc(s.konj)}</span>`);
    if (s.tip) ex.push(`<span>${esc(s.tip)}</span>`);
    if (full && s.syn) ex.push(`<span>Synonym: <b>${esc(s.syn)}</b></span>`);
    if (full && s.ant) ex.push(`<span>Gegenteil: <b>${esc(s.ant)}</b></span>`);
    return (ex.length ? `<div class="extra">${ex.join("")}</div>` : "")
      + `<div class="sent"><span class="de">${esc(s.de)} ${spkBtn(s.de, "sm")}</span>${sTr(s, "s")}</div>`
      + (s.kde && full ? `<div class="sent"><span class="lbl">Klinik</span><span class="de">${esc(s.kde)}</span>${sTr(s, "k")}</div>` : "");
  }
  if (pending.has(r)) return `<div><div class="skel"></div><div class="skel s2"></div></div>`;
  return "";
}
function metaHTML(w) {
  if (w.pack) return `<div class="meta"><span class="chip mine">${w.pack === "fsp-zahnarzt" ? "FSP Zahnarzt" : "FSP Arzt"}</span><span>${esc(posLabel(w))}</span></div>`;
  if (w.custom) return `<div class="meta"><span class="chip mine">Eigenes Wort</span><span>${esc(posLabel(w))}</span>${w.topic ? `<span>· ${esc(w.topic)}</span>` : ""}</div>`;
  const c = caseOf(w);
  return `<div class="meta"><span class="chip">#${w.r}</span><span>${esc(posLabel(w))}</span>${c ? `<span class="chip case">+ ${c}</span>` : ""}${freqHTML(w.r)}</div>`;
}
function aiNote() {
  const st = AI.aiState;
  if (st === "off") return `<div class="note">Beispielsätze sind auf diesem Server nicht eingerichtet. Wörter, Bilder und Karten funktionieren trotzdem.</div>`;
  if (st === "auth") return `<div class="note"><span>Melde dich an, um KI-Beispielsätze zu laden.</span><button class="btn" data-act="account">Anmelden</button></div>`;
  if (st === "limited") return `<div class="note">Gerade zu viele Anfragen. Die Sätze erscheinen später.</div>`;
  if (st === "err") return `<div class="note"><span>Beispielsätze konnten nicht geladen werden.</span><button class="btn" data-act="retry">Erneut versuchen</button></div>`;
  return "";
}
function levelsHTML() {
  return `<div class="levels">${LEVELS.map(([r, l]) => `<button class="level" data-start="${r}" aria-pressed="${St.S.start === r}"><b>${l}</b><span>${{ 1: "Wörter 1–399", 400: "Wörter 400–899", 900: "Wörter 900–1599", 1600: "Wörter 1600–2499", 2500: "Wörter 2500–4034" }[r]}</span></button>`).join("")}</div>`;
}

/* ---------- Heute ---------- */
function statsHTML() {
  const s = St.stats(); const pct = s.todayTotal ? (s.todayDone / s.todayTotal) * 100 : 0;
  return `<div class="stats" id="stats">
    <div class="stat"><span class="k">Heute</span><span class="v">${s.todayDone}<small> / ${s.todayTotal}</small></span><div class="meter"><i style="width:${pct}%"></i></div></div>
    <div class="stat"><span class="k">Fällig</span><span class="v">${s.due}</span></div>
    <div class="stat"><span class="k">Serie</span><span class="v">${s.streak}<small> ${s.streak === 1 ? "Tag" : "Tage"}</small></span></div>
    <div class="stat"><span class="k">Am Lernen</span><span class="v">${s.learning}</span></div>
    <div class="stat"><span class="k">Bekannt</span><span class="v">${s.known}</span></div>
  </div>`;
}
function wordRow(r) {
  const w = BY.get(r); if (!w) return "";
  const known = !!St.S.known[r];
  return `<li class="wrow${known ? " done" : ""}" data-r="${r}">
    ${tile(w, "", { photo: true })}
    <div class="wmain"><div class="wtitle"><span class="word">${wordHTML(w)}</span>${gloss(w)}</div>${metaHTML(w)}</div>
    <div class="wactions">${spkBtn(sayText(w))}<label class="check" title="Kenne ich schon – durch ein neues Wort ersetzen"><input type="checkbox" data-know="${r}" ${known ? "checked disabled" : ""}>Kenne ich</label></div>
    <div class="wbody">${sentHTML(r)}</div>
  </li>`;
}
function startHTML() {
  return `<div class="page-head"><div><h1>Wo möchtest du anfangen?</h1>
      <p>Jeden Tag ${St.S.goal} Wörter aus dem Häufigkeitswörterbuch von Jones &amp; Tschirner, die häufigsten zuerst. Wörter, die du schon kennst, hakst du ab – dann kommt sofort ein neues.</p></div></div>
    <div class="panel pad">${levelsHTML()}</div>
    ${cloud.enabled && !cloud.user ? `<div class="note" style="margin-top:12px"><span>Mit Konto wird dein Fortschritt auf allen Geräten gespeichert.</span><button class="btn" data-act="account">Anmelden</button></div>` : ""}`;
}
function nextLessonHTML() {
  const u = Learn.pathLesson(); if (!u) return "";
  return `<a class="panel pad nextles" href="#lektion/${u.id}"><span class="lbl">Dein Lernweg</span><b>Weiter mit Lektion ${u.n}${u.title ? ` · ${esc(u.title)}` : ""}</b><span class="btn primary">Lernen →</span></a>`;
}
function renderHeute() {
  if (!St.S.start) { main.innerHTML = startHTML(); return; }
  const d = new Date(); const s = St.stats();
  main.innerHTML = `<div class="page-head"><div><h1>Heute</h1><p>${d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })} · ${Learn.pathChip()}</p></div>
      <div class="row"><button class="btn" data-act="more">+ ${St.S.goal} Wörter</button><button class="btn primary" data-act="practice">Üben${s.due ? ` · ${s.due}` : ""}</button></div></div>
    ${statsHTML()}${nextLessonHTML()}${aiNote()}
    ${St.S.today.ranks.length ? `<ul class="wlist" id="todayList">${St.S.today.ranks.map(wordRow).join("")}</ul>`
      : `<div class="panel empty"><div class="big">🏆</div><h2>Alle 4034 Wörter geschafft</h2><p>Du hast das ganze Wörterbuch durchgearbeitet.</p></div>`}`;
  attachPhotos(main);
}

/* ---------- Karten ---------- */
function cardFront(w, mode) {
  if (mode === "en") return `<div class="lbl">Auf Deutsch?</div>${gloss(w, "gloss-big")}<div class="meta" style="justify-content:center"><span>${esc(posLabel(w))}</span></div>`;
  if (mode === "bild") return `${tile(w, "xl", { photo: true })}<div class="lbl">Was ist das?</div><div class="meta" style="justify-content:center"><span>${esc(posLabel(w))}</span></div>`;
  return `<div class="meta" style="justify-content:center"><span class="chip">#${w.r}</span><span>${esc(posLabel(w))}</span></div><div class="word">${wordHTML(w)}</div>${spkBtn(sayText(w))}`;
}
/** FSRS memory state in words: stability (days until recall drops to 90 %) and recall chance now. */
function memLabel(r) {
  const m = St.memory(r); if (!m) return "Neue Karte";
  const s = m.stability < 1 ? "unter 1 Tag" : `${Math.round(m.stability)} ${Math.round(m.stability) === 1 ? "Tag" : "Tage"}`;
  return `Gedächtnis hält ~${s} · jetzt ${m.recall} % sicher${m.lapses ? ` · ${m.lapses}× vergessen` : ""}`;
}
function gradesHTML(r) {
  const p = St.preview(r);
  return St.GRADES.map(([g, l]) => `<button class="btn${g === 3 ? " primary" : ""}" data-grade="${g}"><span>${l}</span><small class="mono">${p[g]?.label || ""}</small><span class="kbd">${g}</span></button>`).join("");
}
function cardBack(w, L) {
  return `<div class="wtitle" style="gap:12px;align-items:center">${tile(w, "", { photo: true })}<div style="flex:1;min-width:0"><div class="word">${wordHTML(w)}</div><div>${gloss(w)}</div></div>${spkBtn(sayText(w))}</div>
    ${metaHTML(w)}${sentHTML(w.r)}
    <div class="lbl" style="margin-top:auto">${memLabel(w.r)}</div>`;
}
function renderKarten() {
  if (!St.S.start) {
    main.innerHTML = `<div class="page-head"><div><h1>Karten</h1><p>Wähle zuerst dein Startniveau – dann kommen deine ersten Wörter in den Karteikasten.</p></div></div><div class="panel pad">${levelsHTML()}</div>`;
    return;
  }
  const deck = St.dueDeck(); const total = Object.keys(St.S.learn).length;
  if (!deck.length) {
    const next = Object.values(St.S.learn).map((x) => x.due).sort()[0];
    main.innerHTML = `<div class="deck"><div class="panel empty"><div class="big">✓</div><h2>Für heute fertig</h2><p>Keine Karten fällig.${next ? ` Nächste Wiederholung am ${new Date(next).toLocaleDateString("de-DE", { day: "numeric", month: "long" })}.` : ""}</p><button class="btn primary" data-act="more2">${St.S.goal} neue Wörter</button></div></div>`;
    return;
  }
  const r = deck[0], w = BY.get(r), L = St.S.learn[r];
  const mode = dir === "bild" && !hasPicture(w) ? "de" : dir;
  main.innerHTML = `<div class="deck">
    <div class="deckbar"><span><b class="mono" style="color:var(--fg)">${deck.length}</b> fällig · ${total} im Kasten</span>
      <div class="seg" role="group" aria-label="Abfragerichtung">${[["de", `DE → ${isAr() ? "AR" : "EN"}`], ["en", `${isAr() ? "AR" : "EN"} → DE`], ["bild", "Bild → DE"]].map(([k, l]) => `<button data-dir="${k}" aria-pressed="${dir === k}">${l}</button>`).join("")}</div></div>
    <div class="flip${flipped ? " flipped" : ""}" id="flip">
      <span class="swipe-label l">Nochmal</span><span class="swipe-label r">Gut</span>
      <div class="flip-inner" id="flipInner" role="button" tabindex="0" aria-label="Karte umdrehen">
        <div class="face front">${cardFront(w, mode)}<div class="hint"><span class="hint-key">Antwort zeigen: klicken oder <span class="kbd">Leertaste</span></span><span class="hint-touch">Antippen, um die Antwort zu sehen</span></div></div>
        <div class="face back">${cardBack(w, L)}</div>
      </div>
    </div>
    <div class="answer grades" id="answerRow" ${flipped ? "" : "hidden"}>${gradesHTML(r)}</div>
    <div class="row" style="justify-content:center" ${flipped ? "" : "hidden"} id="retireRow"><button class="btn ghost" data-act="retire">Kenne ich sicher – aus dem Kasten nehmen</button></div>
  </div>`;
  attachPhotos(main);
  bindSwipe();
  $("flipInner").focus({ preventScroll: true });
}
function flip() {
  if (flipped || !$("flip")) return; flipped = true;
  $("flip").classList.add("flipped"); $("answerRow").hidden = false; $("retireRow").hidden = false;
  getSentences(St.dueDeck().slice(0, 8));
  if (navigator.vibrate) navigator.vibrate(8);
}
function doAnswer(grade) {
  const r = St.dueDeck()[0]; if (!r) return;
  St.answer(r, grade); flipped = false; if (navigator.vibrate) navigator.vibrate(grade >= 3 ? [10, 30, 10] : 25);
  renderKarten(); getSentences(St.dueDeck().slice(0, 6));
}
function bindSwipe() {
  const el = $("flip"); if (!el) return; let x0 = null, dx = 0, id = null;
  const inner = $("flipInner"); const L = el.querySelector(".swipe-label.l"), R = el.querySelector(".swipe-label.r");
  el.addEventListener("pointerdown", (e) => { if (!flipped || e.target.closest("button")) return; x0 = e.clientX; id = e.pointerId; dx = 0; inner.style.transition = "none"; });
  el.addEventListener("pointermove", (e) => {
    if (x0 === null || e.pointerId !== id) return; dx = e.clientX - x0;
    inner.style.transform = `rotateY(180deg) translateX(${-dx}px)`;
    L.style.opacity = Math.min(1, Math.max(0, -dx / 90)); R.style.opacity = Math.min(1, Math.max(0, dx / 90));
  });
  const end = () => {
    if (x0 === null) return; inner.style.transition = ""; inner.style.transform = ""; L.style.opacity = R.style.opacity = 0;
    const d = dx; x0 = null; dx = 0; if (Math.abs(d) > 90) doAnswer(d > 0 ? 3 : 1);
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
}

/* ---------- Wörter ---------- */
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
const normAr = (s) => (s || "").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
const IDX = new Map();
const idx = (w) => { let x = IDX.get(w.r); if (!x || x.src !== w) { x = { src: w, de: norm(w.w), en: norm(w.e), ar: normAr(w.ar) }; IDX.set(w.r, x); } return x; };
function filtered() {
  const q = norm(dict.q.trim()); const num = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : 0;
  const qa = normAr(dict.q.trim());
  return [...WORDS, ...St.packWords(), ...customWords()].filter((w) => {
    if (dict.pos === "mine") { if (!w.custom) return false; }
    else if (dict.pos !== "all") {
      if (dict.pos === "noun" ? !isNoun(w.p) : dict.pos === "other" ? isNoun(w.p) || ["verb", "adj", "prep"].includes(w.p) : w.p !== dict.pos) return false;
    }
    if (dict.st !== "all") { const s = St.wordState(w.r); if (dict.st === "learn" ? !(s === "learn" || s === "today") : s !== dict.st) return false; }
    if (!q) return true;
    if (num) return w.r === num;
    const x = idx(w); return x.de.includes(q) || x.en.includes(q) || (qa && x.ar.includes(qa));
  });
}
function itemHTML(w) {
  const s = St.wordState(w.r);
  const label = { new: "neu", learn: "am Lernen", today: "heute", known: "bekannt" }[s];
  return `<li><button class="item" data-open="${w.r}">${tile(w)}<div><div class="w">${wordHTML(w)}</div>${gloss(w, "e")}</div><span class="rank">${w.custom ? "eigen" : w.pack ? "FSP" : "#" + w.r}</span><span class="dot ${s}" title="${label}"></span></button></li>`;
}
function wordsHead(active) {
  return `<div class="page-head"><div><h1>${active === "mine" ? "Meine Wörter" : "Wörterbuch"}</h1><p>${active === "mine" ? "Eigene Wörter und KI-Wortlisten. Was schon im Wörterbuch steht, wird automatisch zugeordnet." : `${MAXR.toLocaleString("de-DE")} Wörter, nach Häufigkeit geordnet.`}</p></div>
    <div class="seg" role="group" aria-label="Ansicht"><button data-wview="dict" aria-pressed="${active === "dict"}">Wörterbuch</button><button data-wview="mine" aria-pressed="${active === "mine"}">Meine Wörter${customWords().length ? ` · ${customWords().length}` : ""}</button></div></div>`;
}
function renderWoerter(onlyResults) {
  if (dict.view === "mine") return renderMine();
  const list = filtered();
  const f = (k, v, l) => `<button data-${k}="${v}" aria-pressed="${dict[k] === v}">${l}</button>`;
  const results = `<p class="muted small" style="margin:0 0 8px">${list.length.toLocaleString("de-DE")} ${list.length === 1 ? "Wort" : "Wörter"}</p>
    ${list.length ? `<ul class="dlist">${list.slice(0, dict.limit).map(itemHTML).join("")}</ul>` : `<div class="panel empty"><p>Kein Treffer.</p></div>`}
    ${list.length > dict.limit ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" data-act="moreList" id="moreList">Weitere ${Math.min(120, list.length - dict.limit)} anzeigen</button></div>` : ""}`;
  if (onlyResults && $("dres")) { $("dres").innerHTML = results; syncFilters(); }
  else main.innerHTML = `${wordsHead("dict")}
    <div class="searchbar"><input id="q" type="search" placeholder="Deutsch, ${isAr() ? "Arabisch" : "Englisch"} oder #Rang" value="${esc(dict.q)}" autocomplete="off" enterkeyhint="search" aria-label="Suchen">
    <div class="filters">${f("pos", "all", "Alle")}${f("pos", "mine", "Meine Wörter")}${f("pos", "noun", "Nomen")}${f("pos", "verb", "Verben")}${f("pos", "adj", "Adjektive")}${f("pos", "prep", "Präpositionen")}${f("pos", "other", "Andere")}<span class="sep"></span>${f("st", "all", "Jeder Status")}${f("st", "new", "Neu")}${f("st", "learn", "Am Lernen")}${f("st", "known", "Bekannt")}</div></div>
    <div id="dres">${results}</div>`;
  const more = $("moreList");
  if (more && "IntersectionObserver" in window) { const o = new IntersectionObserver((e) => { if (e[0].isIntersecting) { o.disconnect(); dict.limit += 120; renderWoerter(true); } }, { rootMargin: "300px" }); o.observe(more); }
}
function syncFilters() { document.querySelectorAll(".filters button").forEach((b) => { const k = b.dataset.pos ? "pos" : "st"; b.setAttribute("aria-pressed", String(dict[k] === b.dataset[k])); }); }

/* ---------- Meine Wörter: own words, matching, AI topics ---------- */
const TOPICS = ["Körper", "Innere Medizin", "Notaufnahme", "Gynäkologie", "Chirurgie", "Arztbrief", "Medikamente", "Technik", "Alltag", "Behörden"];
const ARTS = /^(der|die|das|den|dem|des)\s+/i;
let DICT_INDEX = null;
function dictIndex() {
  if (!DICT_INDEX) { DICT_INDEX = new Map(); WORDS.forEach((w) => w.w.split(/[,(]/)[0].split("/").forEach((k) => { const n = norm(k.trim()); if (!n) return; if (!DICT_INDEX.has(n)) DICT_INDEX.set(n, []); DICT_INDEX.get(n).push(w); })); }
  return DICT_INDEX;
}
function localMatch(q, art = "") {
  const c = dictIndex().get(norm(String(q).replace(ARTS, "").trim())); if (!c) return null;
  const a = (art || "").split(",")[0].trim().toLowerCase();
  return (a && c.find((w) => w.p.split(",")[0].trim() === a)) || c[0];
}
function parseLine(line) {
  const [left, meaning = ""] = line.split("=").map((x) => x.trim());
  const m = left.match(ARTS); return { raw: line.trim(), q: left.replace(ARTS, "").trim(), art: m ? m[1].toLowerCase() : "", meaning };
}
const ownDup = (w) => customWords().find((c) => norm(c.w) === norm(w));
function dictItem(w, q) {
  const st = St.wordState(w.r);
  return { kind: "dict", r: w.r, q, st, checked: st === "new", disabled: st === "learn" || st === "today" };
}
function newItem(o, { meaning = "", topic = "" } = {}) {
  const dup = ownDup(o.w);
  const s = o.de ? { emoji: o.emoji || "", pl: o.pl || "", de: o.de, en: o.en || "", ar_s: o.ar_s || "", kde: o.kde || "", ken: o.ken || "", ar_k: o.ar_k || "", tip: o.tip || "", syn: o.syn || "", ant: o.ant || "", konj: o.konj || "" } : null;
  return { kind: "new", data: { w: o.w, art: o.art || "", pos: o.pos || (o.art ? "noun" : "phrase"), e: meaning || o.e || "", ar: o.ar || "", topic, s }, checked: !dup, disabled: !!dup, dup: !!dup };
}
const aiWhy = (code) => ({ auth: "Für die KI bitte anmelden", limited: "KI gerade ausgelastet – später erneut", off: "KI ist nicht eingerichtet" })[code] || "KI nicht erreichbar";
function previewRow(it, i) {
  if (it.kind === "invalid") return `<li class="prow off"><span class="pcheck"></span><div class="pmain"><b>${esc(it.q)}</b><span class="muted small">${esc(it.why || "Kein deutsches Wort erkannt")}</span></div><span class="badge">nicht erkannt</span></li>`;
  const w = it.kind === "dict" ? BY.get(it.r) : { r: -1, w: it.data.w, p: it.data.art || (it.data.pos === "noun" ? "" : it.data.pos), e: it.data.e, ar: it.data.ar, emoji: it.data.s?.emoji || "", custom: true };
  const badge = it.kind === "dict" ? ({ new: `Im Wörterbuch #${it.r}`, known: "Schon bekannt", learn: "Schon im Kasten", today: "Schon im Kasten" })[it.st] : it.dup ? "Schon in deinen Wörtern" : "Neues eigenes Wort";
  return `<li class="prow${it.disabled ? " off" : ""}"><label class="pcheck"><input type="checkbox" data-pi="${i}" ${it.checked ? "checked" : ""} ${it.disabled ? "disabled" : ""} aria-label="${esc(w.w)} auswählen"></label>${tile(w)}
    <div class="pmain"><span class="word" style="font-size:1.1rem">${wordHTML(w)}</span>${gloss(w)}</div><span class="badge${it.kind === "dict" && it.st === "new" ? " dict" : ""}">${badge}</span></li>`;
}
function previewHTML() {
  if (mine.busy) return `<div class="panel pad"><div class="row" style="gap:10px"><span class="spinner"></span><span class="muted">${esc(mine.busy)}</span></div></div>`;
  if (mine.err) return `<div class="note">${esc(mine.err)}</div>`;
  if (!mine.preview) return "";
  const n = mine.preview.filter((x) => x.checked && !x.disabled && x.kind !== "invalid").length;
  return `<div class="panel"><div class="panel-head" style="padding:14px 16px 0"><h2>Vorschau · ${mine.preview.length} ${mine.preview.length === 1 ? "Wort" : "Wörter"}</h2>
      <div class="row"><button class="btn ghost" data-act="mineClear">Verwerfen</button><button class="btn primary" data-act="mineAdd" ${n ? "" : "disabled"}>${n} zum Lernen hinzufügen</button></div></div>
    <ul class="plist">${mine.preview.map(previewRow).join("")}</ul></div>`;
}
function renderPreview() { const el = $("minePreview"); if (el) { el.innerHTML = previewHTML(); attachPhotos(el); } }
function renderMine() {
  const list = customWords();
  main.innerHTML = `${wordsHead("mine")}
  <div class="grid2 even">
    <div class="panel pad stack"><h2>Wörter eingeben</h2><p class="muted small" style="margin:0">Ein Wort pro Zeile, mit oder ohne Artikel – auch falsch geschrieben oder auf Englisch/Arabisch. Optional mit Bedeutung: <span class="mono">röntgen = to x-ray</span></p>
      <textarea id="mineText" rows="5" placeholder="die Herzinsuffizienz&#10;Blutdruck&#10;nüchtern">${esc(mine.text)}</textarea>
      <div class="row end"><button class="btn primary" data-act="mineCheck">Prüfen und zuordnen</button></div></div>
    <div class="panel pad stack"><h2>Wörter zu einem Thema</h2><p class="muted small" style="margin:0">Die KI schlägt passende Wörter für dein Niveau vor.</p>
      <input id="mineTopic" class="input" type="text" maxlength="80" placeholder="z. B. Körper, Kardiologie, Technik" value="${esc(mine.topic)}">
      <div class="filters wrap">${TOPICS.map((t) => `<button data-topic="${esc(t)}" aria-pressed="${mine.topic === t}">${t}</button>`).join("")}</div>
      <div class="row end"><div class="seg" role="group" aria-label="Anzahl">${[10, 20, 30].map((n) => `<button data-mn="${n}" aria-pressed="${mine.n === n}">${n}</button>`).join("")}</div><button class="btn primary" data-act="mineTopic">Wörter vorschlagen</button></div></div>
  </div>
  <div id="minePreview" class="section" style="margin-top:16px">${previewHTML()}</div>
  <div class="section"><h2>Deine Wörter <span class="muted small" style="font-weight:400">${list.length}</span></h2>
    ${list.length ? `<ul class="dlist">${list.map(itemHTML).join("")}</ul>` : `<div class="panel empty"><p>Noch keine eigenen Wörter. Gib oben Wörter ein oder lass dir Wörter zu einem Thema vorschlagen.</p></div>`}</div>`;
  attachPhotos(main);
}
async function mineCheck() {
  const lines = mine.text.split(/\n|;/).map((x) => x.trim()).filter(Boolean).slice(0, 25);
  if (!lines.length) { toast("Bitte zuerst Wörter eingeben"); return; }
  const items = [], ask = [];
  lines.forEach((line) => { const p = parseLine(line); const m = localMatch(p.q, p.art); if (m) items.push(dictItem(m, line)); else ask.push(p); });
  mine.err = ""; mine.preview = items;
  if (ask.length) {
    mine.busy = `Die KI prüft ${ask.length} ${ask.length === 1 ? "Wort" : "Wörter"} …`; renderPreview();
    try {
      const res = await aiCall("words", { words: ask.map((a) => a.raw) });
      ask.forEach((a, i) => {
        const o = res.find((x) => x.q === a.raw) || res[i];
        if (!o || !o.ok || !o.w) { items.push({ kind: "invalid", q: a.raw }); return; }
        const m = localMatch(o.w, o.art); items.push(m ? dictItem(m, a.raw) : newItem(o, { meaning: a.meaning }));
      });
    } catch (e) {
      ask.forEach((a) => items.push(a.meaning ? newItem({ w: a.q, art: a.art, pos: a.art ? "noun" : "phrase" }, { meaning: a.meaning }) : { kind: "invalid", q: a.raw, why: aiWhy(e.message) + " – oder Bedeutung mit „=“ angeben" }));
    }
  }
  mine.busy = ""; mine.preview = items; renderPreview();
}
async function mineTopic() {
  const topic = mine.topic.trim(); if (!topic) { toast("Bitte ein Thema eingeben"); return; }
  const level = (LEVELS.find(([r]) => r === St.S.start) || [0, "B1"])[1];
  mine.err = ""; mine.busy = `Die KI sucht ${mine.n} Wörter zum Thema „${topic}“ …`; mine.preview = null; renderPreview();
  try {
    const res = await aiCall("topic", { topic, n: mine.n, level, exclude: customWords().map((w) => w.w).slice(0, 300) });
    const seen = new Set();
    mine.preview = res.filter((o) => o.w && !seen.has(norm(o.w)) && seen.add(norm(o.w))).map((o) => { const m = localMatch(o.w, o.art); return m ? dictItem(m, o.w) : newItem(o, { topic }); });
  } catch (e) { mine.err = aiWhy(e.message) + "."; }
  mine.busy = ""; renderPreview();
}
function mineAdd() {
  const pick = (mine.preview || []).filter((x) => x.checked && !x.disabled && x.kind !== "invalid");
  const dictRanks = [];
  pick.forEach((it) => { if (it.kind === "dict") { St.learnWord(it.r); dictRanks.push(it.r); } else St.addCustom(it.data); });
  St.save(); mine.preview = null; mine.text = "";
  renderMine(); getSentences(dictRanks);
  toast(`${pick.length} ${pick.length === 1 ? "Wort" : "Wörter"} in den Karteikasten gelegt`);
}

function openWord(r) {
  const w = BY.get(r); const s = St.wordState(r); const L = St.S.learn[r];
  const status = s === "known" ? "Bekannt" : L ? `Im Karteikasten · fällig ${new Date(L.due).toLocaleDateString("de-DE")} · ${memLabel(r)}` : "Noch nicht gelernt";
  openSheet(`${tile(w, "lg", { photo: true })}
    <div><div class="word" style="font-size:1.8rem">${wordHTML(w)}</div><div style="font-size:1.05rem">${gloss(w)}</div>${isAr() && w.ar ? `<div class="en">${esc(w.e)}</div>` : ""}${metaHTML(w)}</div>
    <div class="row">${spkBtn(sayText(w))}<span class="muted small">${status}${Saetze.usedLevel(r) ? ` · im Satz: ${Saetze.canUse(r) ? "sicher ✓" : "1× richtig"}` : ""}</span></div>
    <div id="sheetSent" style="display:flex;flex-direction:column;gap:8px">${sentHTML(r)}</div>
    <div class="row">${s === "known" ? `<button class="btn" data-act="relearn" data-r="${r}">Wieder lernen</button>` : `${!L ? `<button class="btn primary" data-act="learn" data-r="${r}">In den Karteikasten</button>` : ""}<button class="btn" data-act="known" data-r="${r}">Kenne ich</button>`}${L || s === "known" ? `<button class="btn" data-act="ownSentence" data-r="${r}">Satz bilden ✍️</button>` : ""}${w.custom ? `<button class="btn ghost danger" data-act="delCustom" data-r="${r}">Löschen</button>` : ""}</div>
    ${photosOn && isNoun(w.p) ? `<div class="credit">Fotos: Wikipedia / Wikimedia Commons</div>` : ""}`, r);
  getSentences([r]);
}

/* ---------- Fortschritt ---------- */
function dictMap() {
  const cols = 82, rows = Math.ceil(MAXR / cols), cell = 6, gap = 1;
  const c = document.createElement("canvas"); c.width = cols * (cell + gap); c.height = rows * (cell + gap); c.className = "dictmap"; c.setAttribute("role", "img");
  const cs = getComputedStyle(document.documentElement);
  const col = { new: cs.getPropertyValue("--g0").trim(), learn: cs.getPropertyValue("--learn").trim(), today: cs.getPropertyValue("--learn").trim(), known: cs.getPropertyValue("--g4").trim() };
  const g = c.getContext("2d");
  for (let r = 1; r <= MAXR; r++) { const i = r - 1; g.fillStyle = col[St.wordState(r)]; g.fillRect((i % cols) * (cell + gap), Math.floor(i / cols) * (cell + gap), cell, cell); }
  const k = Object.keys(St.S.known).length, l = Object.keys(St.S.learn).length;
  c.setAttribute("aria-label", `Wörterbuch-Karte: ${k} bekannt, ${l} am Lernen, ${MAXR - k - l} neu`);
  const at = (e) => { const b = c.getBoundingClientRect(); return Math.floor(((e.clientY - b.top) / b.height) * rows) * cols + Math.floor(((e.clientX - b.left) / b.width) * cols) + 1; };
  c.addEventListener("pointermove", (e) => { const w = BY.get(at(e)); if (!w) return hideTip(); showTip(e, `#${w.r} ${w.w} – ${trW(w)}`); });
  c.addEventListener("pointerleave", hideTip);
  c.addEventListener("click", (e) => { const r = at(e); if (BY.has(r)) openWord(r); });
  return c;
}
function heatmap() {
  const weeks = 26; const end = today(); const dow = (new Date().getDay() + 6) % 7; // Monday = 0
  const start = addDays(end, -(weeks - 1) * 7 - dow);
  let cells = "";
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i); const n = St.S.hist[d] || 0;
    const l = n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4;
    cells += d > end ? `<i style="visibility:hidden"></i>` : `<i data-l="${l}" data-tip="${new Date(d).toLocaleDateString("de-DE")}: ${n} Wiederholungen"></i>`;
  }
  return `<div class="heat" aria-label="Aktivität der letzten ${weeks} Wochen">${cells}</div>
    <div class="legend" style="margin-top:8px"><span>weniger</span>${[0, 1, 2, 3, 4].map((l) => `<i style="background:var(--g${l});margin:0"></i>`).join("")}<span>mehr</span></div>`;
}
function renderStand() {
  const k = Object.keys(St.S.known).length, l = Object.keys(St.S.learn).length; const seen = k + l;
  const boxes = [0, 0, 0, 0, 0, 0, 0]; Object.values(St.S.learn).forEach((x) => boxes[Math.min(x.b, 6)]++);
  const max = Math.max(1, ...boxes); const s = St.stats();
  const theme = document.documentElement.dataset.theme || "system";
  main.innerHTML = `<div class="page-head"><div><h1>Fortschritt</h1><p>${seen.toLocaleString("de-DE")} von ${MAXR.toLocaleString("de-DE")} Wörtern gesehen (${((seen / MAXR) * 100).toFixed(1).replace(".", ",")} %). Laut Jones &amp; Tschirner decken diese Wörter rund 85 % normaler Texte ab.</p></div></div>
  <div class="stats">
    <div class="stat"><span class="k">Bekannt</span><span class="v">${k}</span></div>
    <div class="stat"><span class="k">Am Lernen</span><span class="v">${l}</span></div>
    <div class="stat"><span class="k">Serie</span><span class="v">${s.streak}<small> ${s.streak === 1 ? "Tag" : "Tage"}</small></span></div>
    <div class="stat"><span class="k">Punkte</span><span class="v">${s.xp}</span></div>
    <div class="stat"><span class="k">Nächstes Wort</span><span class="v">#${Math.min(St.S.cursor, MAXR)}</span></div>
  </div>
  <div class="grid2">
    <div class="panel pad"><div class="panel-head"><h2>Wörterbuch-Karte</h2><div class="legend"><span><i style="background:var(--g4)"></i>Bekannt</span><span><i style="background:var(--learn)"></i>Am Lernen</span><span><i style="background:var(--g0);box-shadow:inset 0 0 0 1px var(--line-strong)"></i>Neu</span></div></div>
      <div id="mapHost"></div><p class="muted small" style="margin:8px 0 0">Ein Kästchen pro Wort, Rang 1 oben links. Antippen öffnet das Wort.</p></div>
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="panel pad"><div class="panel-head"><h2>Gedächtnis</h2><span class="muted small">Karten nach Stabilität (FSRS)</span></div>
        <div class="bars">${boxes.map((n, i) => `<div class="b" data-tip="${i ? `Gedächtnis hält ${INTERVAL[i]}${i < 6 ? `–${INTERVAL[i + 1]}` : "+"} Tage` : "Neu oder gerade vergessen"}: ${n} Karten"><span class="n">${n}</span><i style="height:${Math.round((n / max) * 96)}px"></i><span>${i ? INTERVAL[i] + (i < 6 ? "" : "+") : "neu"}</span></div>`).join("")}</div></div>
      <div class="panel pad"><div class="panel-head"><h2>Aktivität</h2><span class="muted small">26 Wochen</span></div>${heatmap()}</div>
    </div>
  </div>
  ${cloud.user ? boardSection() : ""}
  ${cloud.user ? `<div class="section"><h2>Erinnerung</h2><div class="panel" id="pushBox">${pushHTML()}</div></div>` : ""}
  <div class="section"><h2>Einstellungen</h2><ul class="panel settings">
    <li class="stack"><div class="lab"><b>Startniveau</b><span>Ändert nur, wo neue Wörter herkommen. Gelerntes bleibt erhalten.</span></div>${levelsHTML()}</li>
    <li><div class="lab"><b>Übersetzung</b><span>Bedeutungen und Beispielsätze auf Englisch oder Arabisch</span></div><div class="seg"><button data-lang="en">Englisch</button><button data-lang="ar">العربية</button></div></li>
    <li><div class="lab"><b>Neue Wörter pro Tag</b></div><div class="seg">${[5, 10, 15, 20].map((n) => `<button data-goal="${n}" aria-pressed="${St.S.goal === n}">${n}</button>`).join("")}</div></li>
    <li><div class="lab"><b>Darstellung</b></div><div class="seg">${[["system", "System"], ["light", "Hell"], ["dark", "Dunkel"]].map(([k2, l2]) => `<button data-theme="${k2}" aria-pressed="${theme === k2}">${l2}</button>`).join("")}</div></li>
    <li><div class="lab"><b>Fotos bei Nomen</b><span>Bilder von Wikipedia</span></div><div class="seg"><button data-photos="1" aria-pressed="${photosOn}">An</button><button data-photos="0" aria-pressed="${!photosOn}">Aus</button></div></li>
    <li><div class="lab"><b>Sprechtempo</b></div><div class="seg">${[[0.7, "Langsam"], [0.9, "Normal"], [1.05, "Schnell"]].map(([v, l2]) => `<button data-rate="${v}" aria-pressed="${rate === v}">${l2}</button>`).join("")}</div></li>
    <li><div class="lab"><b>Einführung</b><span>Tour durch die App · Tour · جولة تعريفية</span></div><div class="row"><button class="btn" data-act="help">Hilfe zu dieser Seite</button><button class="btn primary" data-act="tourStart">Tour starten</button></div></li>
    <li><div class="lab"><b>Sicherung</b><span>Fortschritt als Datei speichern oder wiederherstellen</span></div><div class="row"><button class="btn" data-act="export">Exportieren</button><label class="btn">Importieren<input type="file" accept="application/json" id="importFile" hidden></label></div></li>
    <li><div class="lab"><b>Zurücksetzen</b><span>Löscht deinen gesamten Fortschritt</span></div><div class="row" id="resetBox"><button class="btn danger" data-act="reset">Alles löschen</button></div></li>
  </ul></div>`;
  $("mapHost").appendChild(dictMap());
  if (cloud.user) { loadBoard(); loadPush(); }
}
/* ---------- daily reminder ---------- */
let push = { loaded: false, on: false, hour: 18, busy: false, err: "" };
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
function pushHTML() {
  if (!cloud.pushReady) return `<p class="muted small" style="margin:0;padding:14px">Tägliche Erinnerungen sind auf diesem Server noch nicht eingerichtet.</p>`;
  if (isIOS && !standalone()) return `<p class="muted small" style="margin:0;padding:14px">Auf dem iPhone gibt es Erinnerungen nur in der installierten App: Teilen → „Zum Home-Bildschirm“, dann die App von dort öffnen.</p>`;
  if (!push.loaded) return `<div style="padding:14px"><div class="skel"></div></div>`;
  return `<ul class="settings"><li><div class="lab"><b>Tägliche Erinnerung</b><span>${push.on ? `Jeden Tag um ${push.hour} Uhr, wenn Karten fällig sind oder deine Serie in Gefahr ist.` : "Eine Nachricht am Tag, nur wenn es etwas zu tun gibt."}</span></div><div class="seg"><button data-push="1" aria-pressed="${push.on}" ${push.busy ? "disabled" : ""}>An</button><button data-push="0" aria-pressed="${!push.on}" ${push.busy ? "disabled" : ""}>Aus</button></div></li>
    ${push.on ? `<li><div class="lab"><b>Uhrzeit</b></div><select id="pushHour" class="input" style="width:auto">${Array.from({ length: 17 }, (_, i) => i + 6).map((h) => `<option value="${h}" ${h === push.hour ? "selected" : ""}>${h}:00 Uhr</option>`).join("")}</select></li>` : ""}
    ${push.err ? `<li><div class="note" style="flex:1">${esc(push.err)}</div></li>` : ""}</ul>`;
}
const drawPush = () => { const el = $("pushBox"); if (el) el.innerHTML = pushHTML(); };
async function loadPush() {
  if (!cloud.pushReady || push.loaded) return drawPush();
  try { const p = await cloud.pushGet(); push.on = !!p?.on && "Notification" in window && Notification.permission === "granted"; push.hour = p?.hour ?? 18; } catch (e) { console.warn(e); }
  push.loaded = true; drawPush();
}
async function setPush(on) {
  push.busy = true; push.err = ""; drawPush();
  try { if (on) await cloud.pushOn(push.hour); else await cloud.pushOff(); push.on = on; toast(on ? `Erinnerung jeden Tag um ${push.hour} Uhr` : "Erinnerung aus"); }
  catch (e) { console.warn(e); push.err = { denied: "Benachrichtigungen sind blockiert. Erlaube sie in den Browser-Einstellungen für diese Seite.", unsupported: "Dieser Browser unterstützt keine Push-Nachrichten." }[e.message] || "Das hat nicht geklappt – sind die neuesten Firestore-Regeln veröffentlicht?"; }
  push.busy = false; drawPush();
}
const myBoardName = () => St.S.board?.name || cloud.user?.displayName || (cloud.user?.email || "").split("@")[0] || "";
function boardSection() {
  const on = !!St.S.board?.visible;
  return `<div class="section"><h2>Rangliste</h2><div class="panel">
    <ul class="settings"><li><div class="lab"><b>Auf der Rangliste zeigen</b><span>${on ? "Andere angemeldete Lernende sehen deinen Namen, deine Punkte und deine Serie." : "Du bist nicht sichtbar. Die Rangliste siehst du trotzdem."}</span></div><div class="seg"><button data-board="1" aria-pressed="${on}">An</button><button data-board="0" aria-pressed="${!on}">Aus</button></div></li>
    ${on ? `<li><div class="lab"><b>Anzeigename</b><span>So erscheinst du auf der Rangliste</span></div><form id="boardName" class="row"><input class="input" name="n" maxlength="40" value="${esc(myBoardName())}" style="width:200px"><button class="btn" type="submit">Speichern</button></form></li>` : ""}</ul>
    <div id="board"><div style="padding:14px"><div class="skel"></div></div></div></div></div>`;
}
async function loadBoard() {
  let all = [];
  try { all = await cloud.leaderboard(); } catch (e) { console.warn(e); }
  const el = $("board"); if (!el) return;
  if (!all.length) { el.innerHTML = `<p class="muted small" style="margin:0;padding:14px">Noch niemand auf der Rangliste.${St.S.board?.visible ? "" : " Sei die erste Person – schalte oben „An“."}</p>`; return; }
  const me = all.findIndex((p) => p.id === cloud.user?.uid);
  const row = (p, i) => `<li class="${p.id === cloud.user?.uid ? "me" : ""}"><span class="pl">${i + 1}</span><span class="av" style="${p.photo ? `background-image:url('${esc(p.photo)}')` : ""}">${p.photo ? "" : esc((p.name || "?")[0].toUpperCase())}</span><span class="nm">${esc(p.name || "—")}</span><span class="muted small">${p.known || 0} bekannt · Serie ${p.streak || 0}</span><span class="sc">${p.xp || 0}</span></li>`;
  el.innerHTML = `<ol class="board">${all.slice(0, 20).map(row).join("")}${me >= 20 ? `<li class="gap" aria-hidden="true"><span class="pl">…</span></li>${row(all[me], me)}` : ""}</ol>
    <p class="muted small" style="margin:0;padding:8px 14px 12px">${all.length} ${all.length === 1 ? "Person" : "Personen"} auf der Rangliste${St.S.board?.visible && me >= 0 ? ` · dein Platz: ${me + 1}` : ""}</p>`;
}
/* ---------- account ---------- */
const GLOGO = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
function renderAvatar() {
  const b = $("accountBtn"); const u = cloud.user;
  if (u?.photoURL) { b.style.backgroundImage = `url('${u.photoURL}')`; b.textContent = ""; }
  else if (u) { b.style.backgroundImage = ""; b.textContent = (u.displayName || u.email || "?")[0].toUpperCase(); }
  else { b.style.backgroundImage = ""; b.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`; }
}
function openAccount(mode = "in", err = "") {
  if (!cloud.enabled) { openSheet(`<h2>Konto</h2><p class="muted" style="margin:0">Diese Version läuft ohne Firebase. Dein Fortschritt wird nur in diesem Browser gespeichert.</p>`); return; }
  const u = cloud.user;
  if (u) {
    openSheet(`<h2>Konto</h2><div class="row" style="gap:12px"><span class="avatar" style="width:44px;height:44px;${u.photoURL ? `background-image:url('${esc(u.photoURL)}')` : ""}">${u.photoURL ? "" : esc((u.displayName || u.email || "?")[0].toUpperCase())}</span><div><b>${esc(u.displayName || "Ohne Namen")}</b><div class="muted small">${esc(u.email || "")}</div></div></div>
      <p class="muted small" style="margin:0">Dein Fortschritt wird automatisch auf allen Geräten gespeichert, auf denen du angemeldet bist.</p>
      <div class="row end"><button class="btn" data-act="signout">Abmelden</button></div>`); return;
  }
  const up = mode === "up";
  openSheet(`<h2>${up ? "Konto erstellen" : "Anmelden"}</h2>
    <button class="btn block gbtn" data-act="google">${GLOGO} Mit Google ${up ? "registrieren" : "anmelden"}</button>
    <div class="divider">oder mit E-Mail</div>
    <form id="authForm" class="form">${up ? `<label class="field">Name<input name="name" autocomplete="name" required maxlength="60"></label>` : ""}
      <label class="field">E-Mail<input name="email" type="email" autocomplete="email" required></label>
      <label class="field">Passwort<input name="pw" type="password" autocomplete="${up ? "new-password" : "current-password"}" minlength="6" required></label>
      ${err ? `<div class="err" role="alert">${esc(err)}</div>` : ""}
      <button class="btn primary block" type="submit">${up ? "Konto erstellen" : "Anmelden"}</button></form>
    <div class="row" style="justify-content:space-between">${up ? `<button class="btn ghost" data-act="mode-in">Ich habe schon ein Konto</button>` : `<button class="btn ghost" data-act="mode-up">Neues Konto erstellen</button><button class="btn ghost" data-act="forgot">Passwort vergessen?</button>`}</div>`);
  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    try { if (up) await cloud.signUpEmail(f.get("name"), f.get("email"), f.get("pw")); else await cloud.signInEmail(f.get("email"), f.get("pw")); closeSheet(); }
    catch (x) { openAccount(mode, authMsg(x)); }
  });
}
const authMsg = (e) => ({
  "auth/invalid-credential": "E-Mail oder Passwort ist falsch.", "auth/email-already-in-use": "Diese E-Mail ist schon registriert.",
  "auth/weak-password": "Das Passwort braucht mindestens 6 Zeichen.", "auth/too-many-requests": "Zu viele Versuche. Bitte später erneut.",
  "auth/popup-closed-by-user": "Das Google-Fenster wurde geschlossen.", "auth/cancelled-popup-request": "Anmeldung abgebrochen.",
  "auth/unauthorized-domain": "Diese Adresse ist in Firebase nicht freigegeben.", "auth/network-request-failed": "Keine Verbindung.",
})[e?.code] || "Anmeldung fehlgeschlagen (" + (e?.code || e?.message || e) + ").";

/* ---------- sheet, toast, tooltip ---------- */
let sheetWord = 0;
function openSheet(html, r = 0) {
  sheetWord = r; $("sheetBody").innerHTML = `<button class="icon-btn sheet-close" data-act="closeSheet" aria-label="Schließen">✕</button>` + html;
  const d = $("sheet"); if (!d.open) d.showModal(); attachPhotos(d);
}
function closeSheet() { $("sheet").close(); sheetWord = 0; }
$("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeSheet(); });
$("sheet").addEventListener("close", () => { sheetWord = 0; });
let tT; function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(tT); tT = setTimeout(() => (t.hidden = true), 2400); }
function showTip(e, text) { const t = $("tip"); t.textContent = text; t.hidden = false; t.style.left = Math.min(innerWidth - t.offsetWidth - 8, e.clientX + 12) + "px"; t.style.top = e.clientY - 34 + "px"; }
function hideTip() { $("tip").hidden = true; }
document.addEventListener("pointerover", (e) => { const el = e.target.closest?.("[data-tip]"); if (el) showTip(e, el.dataset.tip); });
document.addEventListener("pointerout", (e) => { if (e.target.closest?.("[data-tip]")) hideTip(); });

Learn.initLearn({ gloss, trW, isAr, spkBtn, speak, toast, sentHTML, openWord });
Saetze.initSaetze({ gloss, isAr, spkBtn, speak, toast });

/* ---------- routing / render ---------- */
const TAB_OF = { thema: "themen", lektion: "themen", saetze: "ueben", karten: "ueben", schreiben: "ueben", quiz: "ueben", artikel: "ueben", erklaer: "ueben", duell: "ueben" };
const VIEWS = {
  heute: () => renderHeute(), karten: () => renderKarten(), woerter: () => renderWoerter(), stand: () => renderStand(),
  themen: () => Learn.renderThemen(), thema: () => Learn.renderThema(viewArg), lektion: () => Learn.renderLektion(viewArg), ueben: () => Learn.renderUeben(),
  schreiben: () => Learn.renderSchreiben(), quiz: () => Learn.renderQuiz(), artikel: () => Learn.renderArtikel(),
  erklaer: () => Learn.renderErklaer(), duell: () => Learn.renderDuell(viewArg), saetze: () => Saetze.renderSaetze(viewArg),
};
let viewArg = "";
function render() {
  const tab = TAB_OF[view] || view;
  document.querySelectorAll("#dock a").forEach((a) => (a.dataset.v === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  (VIEWS[view] || VIEWS.heute)();
  renderBadge(); syncLang();
}
function renderBadge() { const n = St.S.start ? St.dueDeck().length : 0; const b = $("dueBadge"); b.hidden = !n; b.textContent = n > 99 ? "99+" : n; }
let rs = 0; function renderSoon() { cancelAnimationFrame(rs); rs = requestAnimationFrame(() => {
  if (view === "heute") {
    document.querySelectorAll("#todayList .wrow[data-r]").forEach((c) => {
      const r = Number(c.dataset.r); const sig = SENT[r] ? "f" : pending.has(r) ? "p" : "n";
      if (c.dataset.sig === sig) return; c.dataset.sig = sig; c.querySelector(".wbody").innerHTML = sentHTML(r);
    });
    const note = AI.aiState; if (note !== renderSoon.last) { renderSoon.last = note; const html = aiNote(); const old = main.querySelector(".note"); if (old) old.remove(); if (html) $("stats")?.insertAdjacentHTML("afterend", html); }
  } else if (view === "karten") { const r = St.dueDeck()[0]; const b = document.querySelector(".face.back"); if (r && b) { b.innerHTML = cardBack(BY.get(r), St.S.learn[r]); attachPhotos(b); } }
  Learn.refreshSentences(view);
  if (sheetWord && $("sheetSent")) $("sheetSent").innerHTML = sentHTML(sheetWord);
}); }
onAI(renderSoon);
function route() {
  const [h, arg = ""] = decodeURIComponent((location.hash || "#heute").slice(1)).split("/");
  const v = VIEWS[h] ? h : "heute";
  if (v !== view || arg !== viewArg) { Learn.leave(); view = v; viewArg = arg; flipped = false; window.scrollTo({ top: 0 }); }
  render();
  if (view === "karten") getSentences(St.dueDeck().slice(0, 8));
  if (view === "heute" && St.S.start) getSentences([...St.S.today.ranks, ...St.peek(4)]);
}
addEventListener("hashchange", route);

/* ---------- events ---------- */
document.addEventListener("change", (e) => {
  const r = Number(e.target.dataset?.know);
  if (r) {
    const row = e.target.closest(".wrow"); row.classList.add("leaving");
    setTimeout(() => {
      const nr = St.markKnown(r);
      if (nr) { row.outerHTML = wordRow(nr); const c = document.querySelector(`.wrow[data-r="${nr}"]`); c?.classList.add("arriving"); attachPhotos(c); getSentences([nr, ...St.peek(4)]); } else row.remove();
      $("stats").outerHTML = statsHTML();
      toast(`„${BY.get(r).w}“ als bekannt markiert`);
    }, 180);
  }
  if (e.target.id === "importFile") importBackup(e.target.files[0]);
  if (e.target.id === "pushHour") { push.hour = Number(e.target.value); cloud.pushHour(push.hour).then(() => { toast(`Erinnerung um ${push.hour} Uhr`); drawPush(); }).catch(() => toast("Nicht gespeichert – Verbindung?")); }
  if (e.target.dataset?.pi && mine.preview) { mine.preview[Number(e.target.dataset.pi)].checked = e.target.checked; renderPreview(); }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "q") { dict.q = e.target.value; dict.limit = 120; renderWoerter(true); }
  if (e.target.id === "mineText") mine.text = e.target.value;
  Learn.onInput(e); Saetze.onInput(e);
  if (e.target.id === "mineTopic") mine.topic = e.target.value;
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "mineTopic") { e.preventDefault(); mineTopic(); } });
document.addEventListener("click", async (e) => {
  const t = e.target.closest("button,[data-open],#flipInner"); if (!t) return;
  if (t.dataset.say) { e.stopPropagation(); speak(t.dataset.say); return; }
  if (t.id === "flipInner") { flip(); return; }
  if (t.dataset.open) { openWord(Number(t.dataset.open)); return; }
  if (t.dataset.welcome) {
    const w = t.dataset.welcome; closeSheet();
    if (w === "skip") { try { localStorage.setItem("wz-tour", "1"); } catch {} return; }
    St.S.lang = w; St.save(); syncLang(); render(); setTimeout(() => startTour(), 150); return;
  }
  if (Learn.onClick(t, e)) return;
  if (Saetze.onClick(t)) return;
  if (t.dataset.start) {
    const r = Number(t.dataset.start); const first = !St.S.start; St.setStart(r);
    if (first) { render(); getSentences([...St.S.today.ranks, ...St.peek(6)]); } else { toast(`Neue Wörter ab Rang ${r}`); render(); }
    return;
  }
  if (t.dataset.lang) { St.S.lang = t.dataset.lang; St.save(); syncLang(); flipped = false; render(); return; }
  if (t.dataset.wview) { dict.view = t.dataset.wview; renderWoerter(); return; }
  if (t.dataset.topic) { mine.topic = t.dataset.topic; const i = $("mineTopic"); if (i) i.value = mine.topic; document.querySelectorAll("[data-topic]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.topic === mine.topic))); return; }
  if (t.dataset.mn) { mine.n = Number(t.dataset.mn); document.querySelectorAll("[data-mn]").forEach((b) => b.setAttribute("aria-pressed", String(b === t))); return; }
  if (t.dataset.dir) { dir = t.dataset.dir; lsSet("wz-dir", dir); flipped = false; renderKarten(); return; }
  if (t.dataset.pos) { dict.pos = t.dataset.pos; dict.limit = 120; renderWoerter(true); return; }
  if (t.dataset.st) { dict.st = t.dataset.st; dict.limit = 120; renderWoerter(true); return; }
  if (t.dataset.goal) { St.S.goal = Number(t.dataset.goal); St.save(); renderStand(); return; }
  if (t.dataset.theme) { const th = t.dataset.theme; if (th === "system") { delete document.documentElement.dataset.theme; try { localStorage.removeItem("wz-theme"); } catch {} } else { document.documentElement.dataset.theme = th; try { localStorage.setItem("wz-theme", th); } catch {} } renderStand(); return; }
  if (t.dataset.photos) { setPhotos(t.dataset.photos === "1"); location.reload(); return; }
  if (t.dataset.push) { setPush(t.dataset.push === "1"); return; }
  if (t.dataset.board) { St.S.board = { ...(St.S.board || {}), visible: t.dataset.board === "1", name: St.S.board?.name || myBoardName() }; St.save(); renderStand(); toast(St.S.board.visible ? "Du bist jetzt auf der Rangliste" : "Du bist nicht mehr auf der Rangliste"); setTimeout(loadBoard, 1500); return; }
  if (t.dataset.grade) { doAnswer(Number(t.dataset.grade)); return; }
  if (t.dataset.rate) { rate = Number(t.dataset.rate); lsSet("wz-rate", rate); speak("Guten Tag"); renderStand(); return; }
  const r = Number(t.dataset.r);
  switch (t.dataset.act) {
    case "more": { const n = St.moreWords(St.S.goal); renderHeute(); getSentences([...n, ...St.peek(4)]); break; }
    case "more2": St.moreWords(St.S.goal); location.hash = "heute"; break;
    case "practice": location.hash = "karten"; break;
    case "retry": AI.resetAI(); render(); getSentences([...St.S.today.ranks]); break;
    case "again": doAnswer(1); break;
    case "good": doAnswer(3); break;
    case "retire": { const x = St.dueDeck()[0]; St.retire(x); flipped = false; renderKarten(); toast(`„${BY.get(x).w}“ als bekannt markiert`); break; }
    case "learn": St.learnWord(r); openWord(r); toast("In den Karteikasten gelegt"); break;
    case "known": St.retire(r); openWord(r); if (view === "woerter") renderWoerter(true); break;
    case "relearn": St.unmarkKnown(r); openWord(r); if (view === "woerter") renderWoerter(true); break;
    case "moreList": dict.limit += 120; renderWoerter(true); break;
    case "mineCheck": mineCheck(); break;
    case "mineTopic": mineTopic(); break;
    case "mineAdd": mineAdd(); break;
    case "mineClear": mine.preview = null; mine.err = ""; renderPreview(); break;
    case "delCustom": { const w = BY.get(r); St.removeCustom(r); closeSheet(); if (view === "woerter") renderWoerter(); toast(`„${w?.w}“ gelöscht`); break; }
    case "ownSentence": closeSheet(); location.hash = `saetze/eigen~${r}`; break;
    case "account": openAccount(); break;
    case "mode-up": openAccount("up"); break;
    case "mode-in": openAccount("in"); break;
    case "closeSheet": closeSheet(); break;
    case "google": t.disabled = true; try { await cloud.signInGoogle(); closeSheet(); } catch (x) { console.warn(x); openAccount("in", authMsg(x)); } break;
    case "forgot": { const em = document.querySelector('#authForm [name="email"]')?.value; if (!em) { openAccount("in", "Bitte zuerst deine E-Mail-Adresse eintragen."); break; } try { await cloud.resetPassword(em); toast("E-Mail zum Zurücksetzen verschickt"); } catch (x) { openAccount("in", authMsg(x)); } break; }
    case "signout": await cloud.pushForget(); push = { loaded: false, on: false, hour: 18, busy: false, err: "" }; await cloud.signOut(); closeSheet(); St.replaceState(St.fresh()); lsSet(LS, St.S); toast("Abgemeldet"); render(); break;
    case "export": exportBackup(); break;
    case "tourStart": closeSheet(); startTour(); break;
    case "help": openSheet(helpHTML(view)); break;
    case "reset": $("resetBox").innerHTML = `<span class="small">Wirklich alles löschen?</span><button class="btn danger" data-act="resetYes">Ja, löschen</button><button class="btn ghost" data-act="resetNo">Abbrechen</button>`; break;
    case "resetYes": { const g = St.S.goal; St.replaceState(St.fresh()); St.S.goal = g; St.save(); location.hash = "heute"; render(); break; }
    case "resetNo": renderStand(); break;
  }
});
$("accountBtn").addEventListener("click", () => openAccount());
$("helpBtn").addEventListener("click", () => openSheet(helpHTML(view)));
document.addEventListener("submit", (e) => {
  if (e.target.id === "boardName") { e.preventDefault(); const n = String(new FormData(e.target).get("n") || "").trim().slice(0, 40); if (!n) return toast("Bitte einen Namen eingeben"); St.S.board = { ...(St.S.board || {}), name: n }; St.save(); toast("Name gespeichert"); setTimeout(loadBoard, 1500); return; }
  if (!Saetze.onSubmit(e)) Learn.onSubmit(e);
});
document.addEventListener("keydown", (e) => {
  if (Learn.onKey(e, view) || Saetze.onKey(e, view)) return;
  if (view !== "karten" || $("sheet").open || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if ((e.key === " " || e.key === "Enter") && !flipped && $("flip")) { e.preventDefault(); flip(); }
  else if (flipped && e.key === "ArrowLeft") doAnswer(1);
  else if (flipped && e.key === "ArrowRight") doAnswer(3);
  else if (flipped && /^[1-4]$/.test(e.key)) doAnswer(Number(e.key));
});

function exportBackup() {
  const blob = new Blob([JSON.stringify(St.S, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `wortschatz-4034-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function importBackup(file) {
  try { const x = St.migrate(JSON.parse(await file.text())); if (!x) throw 0; St.replaceState(x); St.save(); toast("Sicherung wiederhergestellt"); render(); }
  catch { toast("Diese Datei ist keine gültige Sicherung"); }
}

/* ---------- boot ---------- */
const local = St.migrate(lsGet(LS)); if (local) St.replaceState(local);
St.ensureToday(); route(); renderAvatar(); setSync();
if (!tourSeen()) setTimeout(() => openSheet(welcomeHTML()), 300);
if (cloud.enabled) {
  cloud.init().then(() => {
    cloud.redirectResult().catch((x) => openAccount("in", authMsg(x)));
    cloud.onUser(async (u) => {
      renderAvatar();
      if (!u) { setSync(); return; }
      setSync("busy");
      try {
        const remote = St.migrate(await cloud.loadProgress());
        if (remote && (remote.updated || 0) >= (St.S.updated || 0)) { St.replaceState(remote); lsSet(LS, St.S); }
        else if (St.S.start) St.save(); // first sign-in on this device: upload local progress
        setSync("ok");
      } catch (x) { console.warn("load failed", x); setSync("err"); }
      cloud.watchProgress((d) => { const x = St.migrate(d); if (x) { St.replaceState(x); lsSet(LS, St.S); if (!flipped) render(); } });
      AI.resetAI(); St.ensureToday(); render();
      if (St.S.start) getSentences([...St.S.today.ranks, ...St.peek(6)]);
    });
  }).catch((e) => { console.warn("Firebase init failed", e); });
}
setInterval(() => { if (St.ensureToday()) render(); }, 60_000);
