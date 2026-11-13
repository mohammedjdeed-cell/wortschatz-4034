import "./style.css";
import * as St from "./state.js";
import { BY, WORDS, MAXR, LEVELS, INTERVAL, today, addDays } from "./state.js";
import { SENT, pending, getSentences, onAI } from "./ai.js";
import * as AI from "./ai.js";
import { cloud } from "./cloud.js";
import { esc, wordHTML, posLabel, isNoun, tile, freqHTML, caseOf, attachPhotos, sayText, hasPicture, photosOn, setPhotos } from "./visuals.js";

window.__BY = BY;
const $ = (id) => document.getElementById(id);
const main = $("main");
const LS = "wz4034";
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let view = "heute";
let dir = lsGet("wz-dir") || "de";
let flipped = false;
let dict = { q: "", pos: "all", st: "all", limit: 120 };
let board = null;

/* ---------- persistence ---------- */
St.onChange((S) => { lsSet(LS, S); cloud.saveProgress(S, setSync); renderBadge(); });
function setSync(s) {
  const el = $("sync"); if (!cloud.enabled) { el.hidden = true; return; }
  el.hidden = false; el.className = "sync " + (s === "busy" ? "busy" : s === "off" ? "off" : "");
  el.textContent = s === "busy" ? "Speichert…" : s === "err" ? "Offline" : s === "off" ? "Lokal" : "Synchron";
}

/* ---------- speech ---------- */
const canSpeak = "speechSynthesis" in window;
let rate = lsGet("wz-rate") || 0.9;
function speak(t) {
  if (!canSpeak) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = "de-DE"; u.rate = rate;
    const v = speechSynthesis.getVoices().find((v) => v.lang?.startsWith("de")); if (v) u.voice = v; speechSynthesis.speak(u); } catch {}
}
const SPK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
const spkBtn = (text, label = "Aussprache") => (canSpeak ? `<button class="icon-btn" data-say="${esc(text)}" aria-label="${label}">${SPK}</button>` : "");

/* ---------- shared bits ---------- */
function sentHTML(r, { full = true } = {}) {
  const s = SENT[r]; const w = BY.get(r);
  if (s) {
    const ex = [];
    if (s.pl) ex.push(`Plural: <b>${esc(s.pl)}</b>`);
    if (s.konj && w.p === "verb") ex.push(`<span>${esc(s.konj)}</span>`);
    if (s.tip) ex.push(`<span class="en">${esc(s.tip)}</span>`);
    if (full && s.syn) ex.push(`≈ <b>${esc(s.syn)}</b>`);
    if (full && s.ant) ex.push(`↔ <b>${esc(s.ant)}</b>`);
    return (ex.length ? `<div class="extra">${ex.join("")}</div>` : "")
      + `<div class="sent"><span class="de">${esc(s.de)} ${canSpeak ? `<button class="icon-btn" style="width:28px;height:28px;display:inline-grid;vertical-align:middle;border-radius:8px" data-say="${esc(s.de)}" aria-label="Satz vorlesen">${SPK}</button>` : ""}</span><span class="en">${esc(s.en)}</span></div>`
      + (s.kde && full ? `<div class="sent klinik"><span class="lbl">Klinik</span><span class="de">${esc(s.kde)}</span><span class="en">${esc(s.ken)}</span></div>` : "");
  }
  if (pending.has(r)) return `<div class="sent"><div class="skel"></div><div class="skel s2"></div></div>`;
  return "";
}
function metaHTML(w) {
  const c = caseOf(w);
  return `<div class="meta"><span class="chip">#${w.r}</span><span class="chip">${esc(posLabel(w))}</span>${c ? `<span class="chip case">+ ${c}</span>` : ""}${freqHTML(w.r)}</div>`;
}
function aiNote() {
  const st = AI.aiState;
  if (st === "off") return `<div class="note">KI-Beispielsätze sind auf diesem Server nicht eingerichtet. <span class="en">AI example sentences aren't configured here — words, pictures and flashcards still work.</span></div>`;
  if (st === "auth") return `<div class="note">Für KI-Beispielsätze bitte anmelden. <span class="en">Sign in to load AI example sentences.</span> <button class="btn ghost" data-act="account">Anmelden<small>Sign in</small></button></div>`;
  if (st === "limited") return `<div class="note">Gerade zu viele Anfragen. <span class="en">Usage limit reached; sentences fill in later.</span></div>`;
  if (st === "err") return `<div class="note">Sätze konnten nicht geladen werden. <button class="btn ghost" data-act="retry">Nochmal<small>Try again</small></button></div>`;
  return "";
}
function levelsHTML() {
  return `<div class="levels">${LEVELS.map(([r, l, d, en]) => `<button class="btn" data-start="${r}" aria-pressed="${St.S.start === r}"><span><b>${l}</b> · ${esc(d)}</span><small>${en}</small></button>`).join("")}</div>`;
}

/* ---------- Heute ---------- */
function ring(done, total) {
  const R = 36, C = 2 * Math.PI * R, p = total ? done / total : 0;
  return `<svg class="ringsvg" viewBox="0 0 84 84" aria-hidden="true"><defs><linearGradient id="ringGrad" x1="0" x2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient></defs>
    <circle class="track" cx="42" cy="42" r="${R}"/><circle class="bar" cx="42" cy="42" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}"/></svg>`;
}
function bento() {
  const s = St.stats();
  return `<section class="bento" aria-label="Überblick">
    <div class="tile ring">${ring(s.todayDone, s.todayTotal)}<div><span class="k">Heute · <span class="en">today</span></span><span class="v">${s.todayDone}<small>/${s.todayTotal}</small></span></div></div>
    <div class="tile"><span class="flame">${s.streak ? "🔥" : "🌱"}</span><span class="k">Serie · <span class="en">streak</span></span><span class="v">${s.streak}<small> T.</small></span></div>
    <div class="tile"><span class="k">Am Lernen · <span class="en">learning</span></span><span class="v">${s.learning}</span></div>
    <div class="tile"><span class="k">Bekannt · <span class="en">known</span></span><span class="v">${s.known}</span></div>
  </section>`;
}
function wordCard(r) {
  const w = BY.get(r); if (!w) return "";
  const known = !!St.S.known[r];
  return `<article class="card${known ? " known-done" : ""}" data-r="${r}">
    <div class="wordhead">${tile(w, "", { photo: true })}<div>${metaHTML(w)}<div class="word">${wordHTML(w)}</div><div class="gloss en">${esc(w.e)}</div></div>${spkBtn(sayText(w))}</div>
    ${sentHTML(r)}
    <label class="know"><input type="checkbox" data-know="${r}" ${known ? "checked disabled" : ""}><span>Kenne ich schon<small>I already know this — swap in a new word</small></span></label>
  </article>`;
}
function renderHeute() {
  if (!St.S.start) {
    main.innerHTML = `<div class="hero"><span class="eyebrow">Willkommen · welcome</span><h1>Wo fangen wir an?</h1><p class="lede">Jeden Tag ${St.S.goal} Wörter aus dem Häufigkeitswörterbuch (Jones &amp; Tschirner), häufigste zuerst. <span class="en">Pick a start level. Tick words you already know and a new one appears at once.</span></p></div>
      <div class="card">${levelsHTML()}</div>
      ${!cloud.user && cloud.enabled ? `<div class="note" style="margin-top:14px">Mit Konto wird dein Fortschritt auf allen Geräten synchronisiert. <span class="en">Sign in to sync across devices.</span> <button class="btn ghost" data-act="account">Anmelden<small>Sign in</small></button></div>` : ""}`;
    return;
  }
  const d = new Date();
  const s = St.stats();
  main.innerHTML = `<div class="hero"><span class="eyebrow">${d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</span><h1>Deine ${s.todayTotal} Wörter für heute</h1>
      <p class="lede">Kennst du ein Wort schon? Haken setzen, sofort kommt ein neues. <span class="en">Already know one? Tick it and it's replaced.</span></p></div>
    ${bento()}${aiNote()}
    <div class="grid" id="todayGrid">${St.S.today.ranks.map(wordCard).join("")}</div>
    ${!St.S.today.ranks.length ? `<div class="card done"><div class="big">🏆</div><h2>Alle 4034 Wörter geschafft!</h2><div class="en">You have been through the whole dictionary.</div></div>` : ""}
    <div class="row" style="margin-top:18px"><button class="btn primary" data-act="practice">Jetzt üben<small>Practise as flashcards${s.due ? " · " + s.due + " due" : ""}</small></button><button class="btn" data-act="more">${St.S.goal} weitere Wörter<small>${St.S.goal} more words today</small></button></div>`;
  attachPhotos(main);
}

/* ---------- Karten ---------- */
function cardFront(w, mode) {
  if (mode === "en") return `<div class="lbl">Wie heißt das auf Deutsch?</div><div class="word en" style="font-family:var(--f-en);font-weight:500">${esc(w.e)}</div>`;
  if (mode === "bild") return `${tile(w, "xl", { photo: true })}<div class="lbl" style="margin-top:8px">Was ist das? · <span class="en" style="text-transform:none;letter-spacing:0">what is it?</span></div><div class="meta" style="justify-content:center"><span class="chip">${esc(posLabel(w))}</span></div>`;
  return `<div class="meta" style="justify-content:center"><span class="chip">#${w.r}</span><span class="chip">${esc(posLabel(w))}</span></div><div class="word">${wordHTML(w)}</div>${spkBtn(sayText(w))}`;
}
function cardBack(w, L) {
  return `<div class="wordhead">${tile(w, "", { photo: true })}<div><div class="word" style="font-size:1.6rem;justify-content:flex-start">${wordHTML(w)}</div><div class="gloss en" style="font-size:1.2rem">${esc(w.e)}</div></div>${spkBtn(sayText(w))}</div>
    ${metaHTML(w)}${sentHTML(w.r)}<div class="lbl" style="margin-top:auto">Fach ${L.b + 1} von 7 · nächste Wiederholung nach „Gewusst“: ${INTERVAL[Math.min(L.b + 1, 6)]} T.</div>`;
}
function renderKarten() {
  const deck = St.dueDeck(); const total = Object.keys(St.S.learn).length;
  if (!St.S.start) { location.hash = "heute"; return; }
  if (!deck.length) {
    const next = Object.values(St.S.learn).map((x) => x.due).sort()[0];
    main.innerHTML = `<div class="deck"><div class="card done"><div class="big">✨</div><h2>Fertig für heute</h2><div class="en">No cards due right now.${next ? " Next review: " + esc(next) + "." : ""}</div><div class="row" style="justify-content:center"><button class="btn primary" data-act="more2">${St.S.goal} neue Wörter<small>Get new words</small></button></div></div></div>`;
    return;
  }
  const r = deck[0], w = BY.get(r), L = St.S.learn[r];
  const mode = dir === "bild" && !hasPicture(w) ? "de" : dir;
  const doneToday = St.S.hist[today()] || 0;
  main.innerHTML = `<div class="deck">
    <div class="deckbar"><span class="mono muted" style="font-size:.85rem">${deck.length} fällig <span class="en">due</span> · ${total} im Kasten</span>
      <div class="seg" role="group" aria-label="Richtung">${[["de", "DE → EN"], ["en", "EN → DE"], ["bild", "Bild → DE"]].map(([k, l]) => `<button data-dir="${k}" aria-pressed="${dir === k}">${l}</button>`).join("")}</div></div>
    <div class="progress" aria-hidden="true"><i style="width:${Math.min(100, (doneToday / Math.max(1, doneToday + deck.length)) * 100)}%"></i></div>
    <div class="flip${flipped ? " flipped" : ""}" id="flip">
      <span class="swipe-label l">Nochmal</span><span class="swipe-label r">Gewusst</span>
      <div class="flip-inner" id="flipInner" role="button" tabindex="0" aria-label="Karte umdrehen · flip card">
        <div class="face front">${cardFront(w, mode)}<div class="hint">Tippen zum Umdrehen · <span class="en">tap to flip</span> · <span class="kbd">Leertaste</span></div></div>
        <div class="face back">${flipped ? cardBack(w, L) : ""}</div>
      </div>
    </div>
    <div class="row" ${flipped ? "" : "hidden"} id="answerRow"><button class="btn wide" data-act="again">Nochmal<small>Again → box 1 · ←</small></button><button class="btn primary wide" data-act="good">Gewusst<small>Got it → next box · →</small></button></div>
    <button class="btn ghost" data-act="retire" ${flipped ? "" : "hidden"} id="retireBtn">Kenne ich sicher · aus dem Kasten<small>I know this well, remove from the box</small></button>
  </div>`;
  attachPhotos(main);
  bindSwipe();
}
function flip() {
  if (flipped) return; flipped = true;
  const deck = St.dueDeck(); const r = deck[0]; if (!r) return;
  document.querySelector(".face.back").innerHTML = cardBack(BY.get(r), St.S.learn[r]);
  $("flip").classList.add("flipped"); $("answerRow").hidden = false; $("retireBtn").hidden = false; attachPhotos(main);
  getSentences(deck.slice(0, 8));
  if (navigator.vibrate) navigator.vibrate(8);
}
function doAnswer(good) {
  const r = St.dueDeck()[0]; if (!r) return;
  St.answer(r, good); flipped = false; if (navigator.vibrate) navigator.vibrate(good ? [10, 30, 10] : 25);
  transition(renderKarten); getSentences(St.dueDeck().slice(0, 6));
}
function bindSwipe() {
  const el = $("flip"); if (!el) return; let x0 = null, dx = 0, id = null;
  const inner = $("flipInner"); const L = el.querySelector(".swipe-label.l"), R = el.querySelector(".swipe-label.r");
  el.addEventListener("pointerdown", (e) => { if (!flipped || e.target.closest("button")) return; x0 = e.clientX; id = e.pointerId; inner.style.transition = "none"; });
  el.addEventListener("pointermove", (e) => {
    if (x0 === null || e.pointerId !== id) return; dx = e.clientX - x0;
    inner.style.transform = `rotateY(180deg) translateX(${-dx}px) rotate(${-dx / 25}deg)`;
    L.style.opacity = Math.min(1, Math.max(0, -dx / 90)); R.style.opacity = Math.min(1, Math.max(0, dx / 90));
  });
  const end = () => {
    if (x0 === null) return; inner.style.transition = ""; inner.style.transform = ""; L.style.opacity = R.style.opacity = 0;
    const d = dx; x0 = null; dx = 0; if (Math.abs(d) > 90) doAnswer(d > 0);
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
}

/* ---------- Wörter (dictionary) ---------- */
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
const SEARCH = WORDS.map((w) => ({ r: w.r, de: norm(w.w), en: norm(w.e) }));
function filtered() {
  const q = norm(dict.q.trim()); const num = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : 0;
  return WORDS.filter((w, i) => {
    if (dict.pos !== "all") {
      if (dict.pos === "noun" ? !isNoun(w.p) : dict.pos === "other" ? isNoun(w.p) || ["verb", "adj"].includes(w.p) : w.p !== dict.pos) return false;
    }
    if (dict.st !== "all") { const s = St.wordState(w.r); if (dict.st === "learn" ? !(s === "learn" || s === "today") : s !== dict.st) return false; }
    if (!q) return true;
    if (num) return w.r === num;
    return SEARCH[i].de.includes(q) || SEARCH[i].en.includes(q);
  });
}
function itemHTML(w) {
  const s = St.wordState(w.r);
  return `<button class="item" data-open="${w.r}">${tile(w)}<div><div class="w">${wordHTML(w)}</div><span class="e en">${esc(w.e)}</span></div><span class="mono muted" style="font-size:.72rem">#${w.r}</span><span class="status ${s}" title="${s}"></span></button>`;
}
function renderWoerter(keepFocus) {
  const list = filtered();
  const chip = (k, v, l) => `<button data-${k}="${v}" aria-pressed="${dict[k] === v}">${l}</button>`;
  const head = `<div class="hero"><span class="eyebrow">Häufigkeitswörterbuch · ${MAXR} Wörter</span><h1>Wörterbuch</h1></div>
   <div class="search"><input id="q" type="search" placeholder="Suchen: Wort, English, #Rang" value="${esc(dict.q)}" autocomplete="off" enterkeyhint="search" aria-label="Suchen">
   <div class="chips">${chip("pos", "all", "Alle")}${chip("pos", "noun", "Nomen")}${chip("pos", "verb", "Verben")}${chip("pos", "adj", "Adjektive")}${chip("pos", "prep", "Präpositionen")}${chip("pos", "other", "Andere")}<span style="width:12px;flex:none"></span>${chip("st", "all", "Alle Status")}${chip("st", "new", "Neu")}${chip("st", "learn", "Am Lernen")}${chip("st", "known", "Bekannt")}</div></div>`;
  const body = `<p class="muted mono" style="font-size:.8rem;margin:4px 0 10px">${list.length} Treffer</p><div class="list" id="dlist">${list.slice(0, dict.limit).map(itemHTML).join("")}</div>${list.length > dict.limit ? `<div class="row" style="justify-content:center;margin-top:14px"><button class="btn" data-act="moreList" id="moreList">Mehr anzeigen<small>${list.length - dict.limit} more</small></button></div>` : ""}`;
  if (keepFocus && $("dres")) { $("dres").innerHTML = body; syncChips(); }
  else main.innerHTML = head + `<div id="dres">${body}</div>`;
  const more = $("moreList");
  if (more && "IntersectionObserver" in window) { const o = new IntersectionObserver((e) => { if (e[0].isIntersecting) { o.disconnect(); dict.limit += 120; renderWoerter(true); } }, { rootMargin: "400px" }); o.observe(more); }
}
function syncChips() { document.querySelectorAll(".chips button").forEach((b) => { const k = b.dataset.pos ? "pos" : "st"; b.setAttribute("aria-pressed", String(dict[k] === b.dataset[k])); }); }

function openWord(r) {
  const w = BY.get(r); const s = St.wordState(r);
  const L = St.S.learn[r];
  openSheet(`<div class="vis-wrap">${tile(w, "lg", { photo: true })}</div>
    <div>${metaHTML(w)}<div class="word" style="font-size:2rem">${wordHTML(w)}</div><div class="gloss en" style="font-size:1.2rem">${esc(w.e)}</div></div>
    <div class="row">${spkBtn(sayText(w))}<span class="muted" style="font-size:.85rem">${s === "known" ? "✓ Bekannt · known" : L ? `Fach ${L.b + 1} · fällig ${esc(L.due)}` : "Noch nicht gelernt · not learned yet"}</span></div>
    <div id="sheetSent">${sentHTML(r) || (AI.aiState === "ok" || AI.aiState === "idle" ? `<div class="sent"><div class="skel"></div><div class="skel s2"></div></div>` : "")}</div>
    <div class="row">${s === "known" ? `<button class="btn" data-act="relearn" data-r="${r}">Wieder lernen<small>Put back in the box</small></button>` : `${!L ? `<button class="btn primary" data-act="learn" data-r="${r}">Lernen<small>Add to flashcards</small></button>` : ""}<button class="btn" data-act="known" data-r="${r}">Kenne ich<small>Mark as known</small></button>`}</div>
    <div class="credit">Fotos: Wikipedia/Wikimedia Commons (lizenziert nach Angabe der Quelle)</div>`, r);
  getSentences([r]);
}

/* ---------- Fortschritt ---------- */
function dictMap() {
  const cols = 82, rows = Math.ceil(MAXR / cols), cell = 6, gap = 1;
  const c = document.createElement("canvas"); c.width = cols * (cell + gap); c.height = rows * (cell + gap); c.className = "dictmap"; c.setAttribute("role", "img");
  const cs = getComputedStyle(document.documentElement);
  const col = { new: cs.getPropertyValue("--heat-0"), learn: cs.getPropertyValue("--accent-2"), today: cs.getPropertyValue("--accent-2"), known: cs.getPropertyValue("--accent") };
  const g = c.getContext("2d");
  for (let r = 1; r <= MAXR; r++) { const i = r - 1; g.fillStyle = col[St.wordState(r)]; g.fillRect((i % cols) * (cell + gap), Math.floor(i / cols) * (cell + gap), cell, cell); }
  const k = Object.keys(St.S.known).length, l = Object.keys(St.S.learn).length;
  c.setAttribute("aria-label", `Wörterbuch-Karte: ${k} bekannt, ${l} am Lernen, ${MAXR - k - l} neu`);
  c.addEventListener("pointermove", (e) => {
    const b = c.getBoundingClientRect(); const x = Math.floor(((e.clientX - b.left) / b.width) * cols); const y = Math.floor(((e.clientY - b.top) / b.height) * rows);
    const r = y * cols + x + 1; const w = BY.get(r); if (!w) return hideTip();
    showTip(e, `<b>#${r}</b> ${esc(w.w)} · ${esc(w.e)}`);
  });
  c.addEventListener("pointerleave", hideTip);
  c.addEventListener("click", (e) => { const b = c.getBoundingClientRect(); const r = Math.floor(((e.clientY - b.top) / b.height) * rows) * cols + Math.floor(((e.clientX - b.left) / b.width) * cols) + 1; if (BY.has(r)) openWord(r); });
  return c;
}
function heatmap() {
  const weeks = 20; const t = new Date(); const end = today();
  const startOffset = -(weeks * 7 - 1) - ((t.getDay() + 6) % 7 === 6 ? 0 : 6 - ((t.getDay() + 6) % 7));
  let cells = "";
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(end, startOffset + i); const n = St.S.hist[d] || 0; const future = d > end;
    const l = n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4;
    cells += `<i data-l="${l}" data-tip="${d}: ${n} Wiederholungen" ${future ? 'style="visibility:hidden"' : ""}></i>`;
  }
  return `<div class="heat" aria-label="Aktivität der letzten ${weeks} Wochen">${cells}</div>
    <div class="legend" style="margin-top:8px"><span>weniger</span>${[0, 1, 2, 3, 4].map((l) => `<span><i style="background:var(--heat-${l});margin:0"></i></span>`).join("")}<span>mehr</span></div>`;
}
function renderStand() {
  const k = Object.keys(St.S.known).length, l = Object.keys(St.S.learn).length; const pct = ((k + l) / MAXR) * 100;
  const boxes = [0, 0, 0, 0, 0, 0, 0]; Object.values(St.S.learn).forEach((x) => boxes[Math.min(x.b, 6)]++);
  const max = Math.max(1, ...boxes); const s = St.stats();
  const theme = document.documentElement.dataset.theme || "system";
  main.innerHTML = `<div class="hero"><span class="eyebrow">Fortschritt · progress</span><h1>${(k + l).toLocaleString("de-DE")} von ${MAXR.toLocaleString("de-DE")} Wörtern</h1><p class="lede">${pct.toFixed(1).replace(".", ",")} % des Wörterbuchs gesehen. Die 4034 Wörter decken laut Buch rund 85 % aller Texte ab. <span class="en">Words are ordered by frequency in a 4.2-million-word corpus.</span></p></div>
  <section class="bento four"><div class="tile"><span class="k">XP</span><span class="v">${s.xp}</span></div><div class="tile"><span class="flame">${s.streak ? "🔥" : "🌱"}</span><span class="k">Serie</span><span class="v">${s.streak}<small> T.</small></span></div><div class="tile"><span class="k">Fällig · due</span><span class="v">${s.due}</span></div><div class="tile"><span class="k">Nächstes Wort</span><span class="v">#${Math.min(St.S.cursor, MAXR)}</span></div></section>
  <div class="two">
    <div class="card"><div class="section-head" style="margin:0"><h2>Wörterbuch-Karte</h2><div class="legend"><span><i style="background:var(--accent)"></i>Bekannt ${k}</span><span><i style="background:var(--accent-2)"></i>Am Lernen ${l}</span><span><i style="background:var(--heat-0);outline:1px solid var(--line)"></i>Neu ${MAXR - k - l}</span></div></div><div id="mapHost"></div><div class="muted" style="font-size:.8rem">Jedes Kästchen ist ein Wort, Rang 1 oben links. Tippen öffnet das Wort. <span class="en">Each cell is one word; tap to open.</span></div></div>
    <div class="card"><h2>Karteikasten <span class="muted" style="font-weight:400;font-size:.85rem">· Leitner-Fächer 1–7</span></h2>
      <div class="bars">${boxes.map((n, i) => `<div class="b" data-tip="Fach ${i + 1}: ${n} Karten · Wiederholung nach ${INTERVAL[i]} T."><span class="n">${n}</span><i style="height:${Math.round((n / max) * 110)}px"></i><span>${i + 1}</span></div>`).join("")}</div>
      <div class="muted" style="font-size:.8rem">Wiederholung nach 0, 1, 2, 4, 8, 16, 32 Tagen.</div>
      <h2 style="margin-top:8px">Aktivität</h2>${heatmap()}</div>
  </div>
  ${cloud.user ? `<div class="section-head"><h2>Rangliste · leaderboard</h2><span class="muted" style="font-size:.8rem">nach XP</span></div><div class="card" id="board"><div class="skel"></div><div class="skel s2"></div></div>` : ""}
  <div class="section-head"><h2>Einstellungen</h2></div>
  <div class="card settings">
    <div class="setting"><span>Startniveau<br><small class="en">changing this only moves the start; learned words stay</small></span></div>${levelsHTML()}
    <div class="setting"><span>Wörter pro Tag · <span class="en">daily goal</span></span><div class="seg">${[5, 10, 15, 20].map((n) => `<button data-goal="${n}" aria-pressed="${St.S.goal === n}">${n}</button>`).join("")}</div></div>
    <div class="setting"><span>Design · <span class="en">theme</span></span><div class="seg">${[["system", "System"], ["light", "Hell"], ["dark", "Dunkel"]].map(([k2, l2]) => `<button data-theme="${k2}" aria-pressed="${theme === k2}">${l2}</button>`).join("")}</div></div>
    <div class="setting"><span>Fotos für Nomen · <span class="en">Wikipedia photos</span></span><div class="seg"><button data-photos="1" aria-pressed="${photosOn}">An</button><button data-photos="0" aria-pressed="${!photosOn}">Aus</button></div></div>
    <div class="setting"><span>Sprechtempo · <span class="en">speech rate</span></span><div class="seg">${[[0.7, "langsam"], [0.9, "normal"], [1.05, "schnell"]].map(([v, l2]) => `<button data-rate="${v}" aria-pressed="${rate === v}">${l2}</button>`).join("")}</div></div>
    <div class="setting"><span>Sicherung · <span class="en">backup</span></span><div class="row"><button class="btn" data-act="export">Exportieren<small>Download JSON</small></button><label class="btn">Importieren<small>Restore JSON</small><input type="file" accept="application/json" id="importFile" hidden></label></div></div>
    <div class="setting"><span>Zurücksetzen · <span class="en">reset</span></span><div class="row" id="resetBox"><button class="btn" data-act="reset">Alles löschen<small>Erase all progress</small></button></div></div>
  </div>`;
  $("mapHost").appendChild(dictMap());
  if (cloud.user) loadBoard();
}
async function loadBoard() {
  try { board = await cloud.leaderboard(); } catch { board = []; }
  const el = $("board"); if (!el) return;
  if (!board.length) { el.innerHTML = `<div class="muted">Noch keine Einträge.</div>`; return; }
  el.innerHTML = `<ol class="board">${board.map((p, i) => `<li class="${p.id === cloud.user?.uid ? "me" : ""}"><span class="pl">${i + 1}</span><span class="av" style="${p.photo ? `background-image:url('${esc(p.photo)}')` : ""}">${p.photo ? "" : esc((p.name || "?")[0].toUpperCase())}</span><span class="nm">${esc(p.name || "—")}</span><span class="muted" style="font-size:.78rem">🔥${p.streak || 0} · ${p.known || 0} ✓</span><span class="sc">${p.xp || 0}</span></li>`).join("")}</ol>`;
}

/* ---------- account ---------- */
function renderAvatar() {
  const b = $("accountBtn"); const u = cloud.user;
  if (u?.photoURL) { b.style.backgroundImage = `url('${u.photoURL}')`; b.textContent = ""; }
  else if (u) { b.style.backgroundImage = ""; b.textContent = (u.displayName || u.email || "?")[0].toUpperCase(); }
  else { b.style.backgroundImage = ""; b.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`; }
}
function openAccount(mode = "in", err = "") {
  if (!cloud.enabled) {
    openSheet(`<h2>Konto</h2><p class="muted">Diese Installation läuft ohne Firebase — dein Fortschritt wird nur in diesem Browser gespeichert. <span class="en">This build has no Firebase config, so progress stays in this browser. See README → Firebase setup.</span></p>`); return;
  }
  const u = cloud.user;
  if (u) {
    openSheet(`<h2>Konto</h2><div class="row"><span class="avatar" style="${u.photoURL ? `background-image:url('${esc(u.photoURL)}')` : ""}">${u.photoURL ? "" : esc((u.displayName || u.email || "?")[0].toUpperCase())}</span><div><b>${esc(u.displayName || "Lernende:r")}</b><div class="muted" style="font-size:.85rem">${esc(u.email || "")}</div></div></div>
      <div class="note">Fortschritt wird automatisch auf allen Geräten synchronisiert. <span class="en">Progress syncs automatically across your devices.</span></div>
      <button class="btn" data-act="signout">Abmelden<small>Sign out</small></button>`); return;
  }
  const up = mode === "up";
  openSheet(`<h2>${up ? "Konto erstellen" : "Anmelden"}</h2><p class="muted" style="margin:0">Jede Person hat ihr eigenes Konto und ihren eigenen Fortschritt. <span class="en">Each person gets their own account and progress.</span></p>
    <button class="btn primary wide" data-act="google">Mit Google fortfahren<small>Continue with Google</small></button>
    <div class="divider">oder E-Mail</div>
    <form id="authForm" class="settings">${up ? `<label class="field">Name<input name="name" autocomplete="name" required maxlength="60"></label>` : ""}
      <label class="field">E-Mail<input name="email" type="email" autocomplete="email" required></label>
      <label class="field">Passwort<input name="pw" type="password" autocomplete="${up ? "new-password" : "current-password"}" minlength="6" required></label>
      ${err ? `<div class="err">${esc(err)}</div>` : ""}
      <button class="btn primary wide" type="submit">${up ? "Registrieren" : "Anmelden"}<small>${up ? "Create account" : "Sign in"}</small></button></form>
    <div class="row" style="justify-content:space-between">${up ? `<button class="btn ghost" data-act="mode-in">Schon ein Konto?<small>Sign in instead</small></button>` : `<button class="btn ghost" data-act="mode-up">Neues Konto<small>Create account</small></button><button class="btn ghost" data-act="forgot">Passwort vergessen<small>Reset password</small></button>`}</div>
    <button class="btn ghost" data-act="closeSheet">Ohne Konto weiter<small>Continue locally on this device</small></button>`);
  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    try { if (up) await cloud.signUpEmail(f.get("name"), f.get("email"), f.get("pw")); else await cloud.signInEmail(f.get("email"), f.get("pw")); closeSheet(); }
    catch (x) { openAccount(mode, authMsg(x)); }
  });
}
const authMsg = (e) => ({ "auth/invalid-credential": "E-Mail oder Passwort falsch.", "auth/email-already-in-use": "Diese E-Mail ist schon registriert.", "auth/weak-password": "Passwort zu schwach (mind. 6 Zeichen).", "auth/too-many-requests": "Zu viele Versuche, bitte später.", "auth/popup-closed-by-user": "Fenster geschlossen." })[e?.code] || "Fehler: " + (e?.code || e?.message || e);

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
function showTip(e, html) { const t = $("tip"); t.innerHTML = html; t.hidden = false; const x = Math.min(innerWidth - t.offsetWidth - 8, e.clientX + 12); t.style.left = x + "px"; t.style.top = e.clientY - 36 + "px"; }
function hideTip() { $("tip").hidden = true; }
document.addEventListener("pointerover", (e) => { const el = e.target.closest?.("[data-tip]"); if (el) showTip(e, esc(el.dataset.tip)); });
document.addEventListener("pointerout", (e) => { if (e.target.closest?.("[data-tip]")) hideTip(); });

/* ---------- routing / render ---------- */
function transition(fn) { if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(fn); else fn(); }
function render() {
  document.querySelectorAll("#dock a").forEach((a) => (a.dataset.v === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  if (view === "heute") renderHeute(); else if (view === "karten") renderKarten(); else if (view === "woerter") renderWoerter(); else renderStand();
  renderBadge();
}
function renderBadge() { const n = St.S.start ? St.dueDeck().length : 0; const b = $("dueBadge"); b.hidden = !n; b.textContent = n > 99 ? "99+" : n; }
let rs = 0; function renderSoon() { cancelAnimationFrame(rs); rs = requestAnimationFrame(() => {
  if (view === "heute") { // patch sentence blocks in place to keep scroll + focus
    document.querySelectorAll("#todayGrid .card[data-r]").forEach((c) => {
      const r = Number(c.dataset.r); const sig = SENT[r] ? "f" : pending.has(r) ? "p" : "n";
      if (c.dataset.sig === sig) return; c.dataset.sig = sig;
      c.querySelectorAll(":scope > .extra, :scope > .sent").forEach((n) => n.remove());
      c.querySelector(".wordhead").insertAdjacentHTML("afterend", sentHTML(r));
    });
  } else if (view === "karten" && flipped) { const r = St.dueDeck()[0]; const b = document.querySelector(".face.back"); if (r && b) { b.innerHTML = cardBack(BY.get(r), St.S.learn[r]); attachPhotos(b); } }
  if (sheetWord && $("sheetSent")) $("sheetSent").innerHTML = sentHTML(sheetWord);
}); }
onAI(renderSoon);
function route() {
  const h = (location.hash || "#heute").slice(1); const v = ["heute", "karten", "woerter", "stand"].includes(h) ? h : "heute";
  if (v !== view) { view = v; flipped = false; transition(render); window.scrollTo({ top: 0 }); } else render();
  if (view === "karten") getSentences(St.dueDeck().slice(0, 8));
  if (view === "heute" && St.S.start) getSentences([...St.S.today.ranks, ...St.peek(4)]);
}
addEventListener("hashchange", route);

/* ---------- events ---------- */
document.addEventListener("change", (e) => {
  const r = Number(e.target.dataset?.know);
  if (r) {
    const card = e.target.closest(".card"); card.classList.add("leaving");
    setTimeout(() => {
      const nr = St.markKnown(r);
      const html = nr ? wordCard(nr) : "";
      if (html) { card.outerHTML = html; const c = document.querySelector(`.card[data-r="${nr}"]`); c?.classList.add("arriving"); attachPhotos(c); getSentences([nr, ...St.peek(4)]); } else card.remove();
      const b = document.querySelector(".bento"); if (b) b.outerHTML = bento();
      toast(`${BY.get(r).w} → bekannt · known`);
    }, 200);
  }
  if (e.target.id === "importFile") importBackup(e.target.files[0]);
});
document.addEventListener("input", (e) => { if (e.target.id === "q") { dict.q = e.target.value; dict.limit = 120; renderWoerter(true); } });
document.addEventListener("click", async (e) => {
  const t = e.target.closest("button,[data-open],#flipInner"); if (!t) return;
  if (t.dataset.say) { e.stopPropagation(); speak(t.dataset.say); return; }
  if (t.id === "flipInner") { flip(); return; }
  if (t.dataset.open) { openWord(Number(t.dataset.open)); return; }
  if (t.dataset.start) {
    const r = Number(t.dataset.start); const first = !St.S.start; St.setStart(r);
    if (first) { render(); getSentences([...St.S.today.ranks, ...St.peek(6)]); } else { toast("Start: #" + r); render(); }
    return;
  }
  if (t.dataset.dir) { dir = t.dataset.dir; lsSet("wz-dir", dir); flipped = false; transition(renderKarten); return; }
  if (t.dataset.pos) { dict.pos = t.dataset.pos; dict.limit = 120; renderWoerter(true); return; }
  if (t.dataset.st) { dict.st = t.dataset.st; dict.limit = 120; renderWoerter(true); return; }
  if (t.dataset.goal) { St.S.goal = Number(t.dataset.goal); St.save(); renderStand(); toast(`Ziel: ${St.S.goal} Wörter/Tag`); return; }
  if (t.dataset.theme) { const th = t.dataset.theme; if (th === "system") { delete document.documentElement.dataset.theme; localStorage.removeItem("wz-theme"); } else { document.documentElement.dataset.theme = th; localStorage.setItem("wz-theme", th); } renderStand(); return; }
  if (t.dataset.photos) { setPhotos(t.dataset.photos === "1"); location.reload(); return; }
  if (t.dataset.rate) { rate = Number(t.dataset.rate); lsSet("wz-rate", rate); speak("Guten Tag"); renderStand(); return; }
  const r = Number(t.dataset.r);
  switch (t.dataset.act) {
    case "more": { const n = St.moreWords(St.S.goal); renderHeute(); getSentences([...n, ...St.peek(4)]); break; }
    case "more2": St.moreWords(St.S.goal); location.hash = "heute"; break;
    case "practice": location.hash = "karten"; break;
    case "retry": AI.resetAI(); getSentences([...St.S.today.ranks]); render(); break;
    case "again": doAnswer(false); break;
    case "good": doAnswer(true); break;
    case "retire": { const x = St.dueDeck()[0]; St.retire(x); flipped = false; transition(renderKarten); toast(`${BY.get(x).w} → bekannt`); break; }
    case "learn": St.learnWord(r); openWord(r); toast("In den Kasten · added"); break;
    case "known": St.retire(r); openWord(r); if (view === "woerter") renderWoerter(true); break;
    case "relearn": St.unmarkKnown(r); openWord(r); if (view === "woerter") renderWoerter(true); break;
    case "moreList": dict.limit += 120; renderWoerter(true); break;
    case "account": openAccount(); break;
    case "mode-up": openAccount("up"); break;
    case "mode-in": openAccount("in"); break;
    case "closeSheet": closeSheet(); break;
    case "google": try { await cloud.signInGoogle(); closeSheet(); } catch (x) { openAccount("in", authMsg(x)); } break;
    case "forgot": { const em = document.querySelector('#authForm [name="email"]')?.value; if (!em) { openAccount("in", "Bitte zuerst die E-Mail eintragen."); break; } try { await cloud.resetPassword(em); toast("E-Mail zum Zurücksetzen gesendet"); } catch (x) { openAccount("in", authMsg(x)); } break; }
    case "signout": await cloud.signOut(); closeSheet(); St.replaceState(St.fresh()); lsSet(LS, St.S); toast("Abgemeldet"); render(); break;
    case "export": exportBackup(); break;
    case "reset": $("resetBox").innerHTML = `<span>Wirklich? <span class="en">Erase everything?</span></span><button class="btn" data-act="resetYes">Ja, löschen<small>Yes, erase</small></button><button class="btn ghost" data-act="resetNo">Abbrechen<small>Cancel</small></button>`; break;
    case "resetYes": { const g = St.S.goal; St.replaceState(St.fresh()); St.S.goal = g; St.save(); location.hash = "heute"; render(); break; }
    case "resetNo": renderStand(); break;
  }
});
$("accountBtn").addEventListener("click", () => openAccount());
document.addEventListener("keydown", (e) => {
  if (view !== "karten" || $("sheet").open || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if ((e.key === " " || e.key === "Enter") && !flipped) { e.preventDefault(); flip(); }
  else if (flipped && (e.key === "ArrowLeft" || e.key === "1")) doAnswer(false);
  else if (flipped && (e.key === "ArrowRight" || e.key === "2")) doAnswer(true);
});

function exportBackup() {
  const blob = new Blob([JSON.stringify(St.S, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `wortschatz-4034-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function importBackup(file) {
  try { const x = St.migrate(JSON.parse(await file.text())); if (!x) throw 0; St.replaceState(x); St.save(); toast("Sicherung geladen · restored"); render(); }
  catch { toast("Ungültige Datei · invalid file"); }
}

/* ---------- boot ---------- */
const local = St.migrate(lsGet(LS)); if (local) St.replaceState(local);
St.ensureToday(); route(); renderAvatar(); setSync(cloud.enabled ? "off" : "off");
if (cloud.enabled) {
  cloud.init().then(() => {
    cloud.onUser(async (u) => {
      renderAvatar();
      if (!u) { setSync("off"); return; }
      setSync("busy");
      try {
        const remote = St.migrate(await cloud.loadProgress());
        if (remote && (remote.updated || 0) >= (St.S.updated || 0)) { St.replaceState(remote); lsSet(LS, St.S); }
        else if (St.S.start) St.save(); // upload local progress (first sign-in on this device)
        setSync("ok");
      } catch { setSync("err"); }
      cloud.watchProgress((d) => { const x = St.migrate(d); if (x) { St.replaceState(x); lsSet(LS, St.S); if (!flipped) render(); } });
      AI.resetAI(); St.ensureToday(); render();
      if (St.S.start) getSentences([...St.S.today.ranks, ...St.peek(6)]);
    });
  }).catch((e) => { console.warn("Firebase init failed", e); setSync("err"); });
}
setInterval(() => { if (St.ensureToday()) render(); }, 60_000);
