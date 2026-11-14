// Sätze: from words to sentences. Word order, article/case gaps, own sentences checked by the AI, and sentence patterns
// (verb + preposition + case, Nebensatz, Passiv, Konjunktiv II, FSP phrases). Tracks per word whether it can be used in a sentence.
import * as St from "./state.js";
import { BY } from "./state.js";
import { getSentences, aiCall } from "./ai.js";
import { esc, wordHTML, keyOf, isNoun, gender, sayText } from "./visuals.js";
import { learnedPool, wordSpan, sentOf } from "./learn.js";
import PATTERNS from "./data/patterns.json";

let H; // UI helpers from main.js
export function initSaetze(h) { H = h; }
const $ = (id) => document.getElementById(id);
const main = () => $("main");
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };

export const CATS = [
  { id: "praep", name: "Verb + Präposition + Kasus", emoji: "🔗" },
  { id: "neben", name: "Nebensätze (weil, dass, ob …)", emoji: "↪️" },
  { id: "passiv", name: "Passiv", emoji: "🏥" },
  { id: "konj", name: "Konjunktiv II: höflich & hypothetisch", emoji: "🤝" },
  { id: "anamnese", name: "FSP · Anamnese-Fragen", emoji: "🩺" },
  { id: "aufklaerung", name: "FSP · Aufklärung", emoji: "📝" },
  { id: "arztbrief", name: "FSP · Arztbrief & Arzt-Arzt", emoji: "📄" },
];
const PAT = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));

/* ---------- mastery: "can use the word in a sentence" ---------- */
const used = () => (St.S.used ||= {});
/** Points per word: word order right = 1, own sentence right = 2. Two points = can use it. */
export function usedLevel(r) { return used()[r] || 0; }
export const canUse = (r) => usedLevel(r) >= 2;
function addUse(r, n) { if (!r) return; used()[r] = Math.min(9, usedLevel(r) + n); }
const patDone = (id) => (St.S.pats || {})[id] >= 1;
function addPat(id) { (St.S.pats ||= {})[id] = ((St.S.pats || {})[id] || 0) + 1; }

/* ---------- word pools ---------- */
const withSentence = () => learnedPool().filter((r) => sentOf(r)?.de && sentOf(r).de.split(/\s+/).length <= 14);
/** Words with an example sentence, not-yet-mastered first. Asks the AI for missing sentences in the background. */
function wordPool() {
  const have = withSentence();
  if (have.length < 8) getSentences(learnedPool().filter((r) => r <= 4034 && !sentOf(r)?.de).slice(0, 24));
  return [...shuffle(have.filter((r) => !canUse(r))), ...shuffle(have.filter((r) => canUse(r)))];
}
const trOf = (s) => (H.isAr() && s.ar_s ? `<p class="tr ar" dir="rtl" lang="ar">${esc(s.ar_s)}</p>` : `<p class="en">${esc(s.en || "")}</p>`);
const trPat = (p) => (H.isAr() && p.ar ? `<p class="tr ar" dir="rtl" lang="ar">${esc(p.ar)}</p>` : `<p class="en">${esc(p.en)}</p>`);

/* ---------- session state ---------- */
let sx = null; // { mode, items, i, res, placed, pool, checked, ok, sel }
const ARTS = { def: ["der", "die", "das", "den", "dem", "des"], indef: ["ein", "eine", "einen", "einem", "einer", "eines"], neg: ["kein", "keine", "keinen", "keinem", "keiner", "keines"] };
const famOf = (t) => Object.values(ARTS).find((f) => f.includes(t.toLowerCase()));
function tokens(de) { return de.trim().split(/\s+/); }
/** Index of the token that contains the target word (for highlighting), or -1. */
function targetToken(r, de) { const c = wordSpan(r); if (!c || c.de !== de) return -1; let pos = 0; return tokens(de).findIndex((t) => { const hit = c.at >= pos && c.at < pos + t.length + 1; pos += t.length + 1; return hit; }); }
function buildItem(de, extra) {
  const tk = tokens(de); let pool = shuffle(tk.map((t, i) => ({ t, i })));
  for (let k = 0; k < 5 && pool.every((x, j) => x.i === j); k++) pool = shuffle(pool); // never start solved
  return { kind: "bau", de, tk, pool, placed: [], ...extra };
}
function gapItem(r) {
  const s = sentOf(r); const tk = tokens(s.de); const ti = targetToken(r, s.de);
  const cand = tk.map((t, i) => ({ t: t.replace(/[.,!?;:]$/, ""), i })).filter((x) => famOf(x.t));
  if (!cand.length) return null;
  const pick = cand.find((x) => ti >= 0 && x.i < ti && ti - x.i <= 3) || cand[0];
  const fam = famOf(pick.t); const right = pick.t.toLowerCase();
  const opts = shuffle([right, ...shuffle(fam.filter((x) => x !== right)).slice(0, 3)]);
  const cap = pick.i === 0 ? (x) => x[0].toUpperCase() + x.slice(1) : (x) => x;
  return { kind: "gap", r, de: s.de, s, at: pick.i, opts: opts.map(cap), right: cap(right), tk };
}

/* ---------- views ---------- */
export function renderSaetze(arg = "") {
  const [mode, sub] = arg.split("~");
  if (mode === "bau" || mode === "luecke") return wordSession(mode);
  if (mode === "eigen") return renderEigen(sub ? Number(sub) : 0);
  if (mode === "muster") return sub ? patternSession(sub) : renderMusterList();
  sx = null;
  const have = withSentence().length, mastered = Object.keys(used()).filter((r) => canUse(Number(r))).length;
  const card = (href, emo, title, desc, extra = "") => `<a class="mode" href="${href}"><span class="memo">${emo}</span><span class="mbody"><b>${title}</b><span class="muted small">${desc}</span></span>${extra}</a>`;
  main().innerHTML = `<a class="back" href="#ueben">← Üben</a><div class="page-head"><div><h1>Sätze</h1><p>Vom Wort zum Satz: Wörter erst im Satz bauen, dann selbst benutzen. Dein Wort ist immer markiert.</p></div></div>
    <div class="stats" style="grid-template-columns:repeat(2,1fr)"><div class="stat"><span class="k">Sicher im Satz</span><span class="v">${mastered}<small> Wörter</small></span></div><div class="stat"><span class="k">Muster geübt</span><span class="v">${Object.keys(St.S.pats || {}).length}<small> / ${PATTERNS.length}</small></span></div></div>
    <div class="section"><h2>Mit deinen Wörtern</h2><div class="modes">
      ${card("#saetze/bau", "🧱", "Satzbau", "Wörter in die richtige Reihenfolge tippen", `<span class="badge">${have} Sätze</span>`)}
      ${card("#saetze/luecke", "🔤", "Artikel & Kasus", "Die Lücke im Satz füllen: der, den, dem, des …")}
      ${card("#saetze/eigen", "✍️", "Eigener Satz", "Schreib einen Satz mit dem Wort – die KI korrigiert und erklärt")}
    </div>${have < 4 ? `<p class="small muted">Für Satzbau und Lücken brauchst du gelernte Wörter mit Beispielsatz. Die Sätze werden geladen, sobald du angemeldet bist.</p>` : ""}</div>
    <div class="section"><h2>Satzmuster</h2><div class="modes">
      ${CATS.map((c) => { const ps = PATTERNS.filter((p) => p.cat === c.id); const d = ps.filter((p) => patDone(p.id)).length; return card(`#saetze/muster~${c.id}`, c.emoji, c.name, ps.slice(0, 2).map((p) => esc(p.title)).join(" · "), `<span class="badge${d === ps.length ? " dict" : ""}">${d}/${ps.length}</span>`); }).join("")}
    </div></div>`;
}
function renderMusterList() { location.hash = "saetze"; }

function wordSession(mode) {
  if (!sx || sx.mode !== mode) {
    const pool = wordPool();
    const items = (mode === "bau" ? pool.map((r) => buildItem(sentOf(r).de, { r, s: sentOf(r) })) : pool.map(gapItem).filter(Boolean)).slice(0, 8);
    sx = { mode, items, i: 0, res: [] };
  }
  const title = mode === "bau" ? "Satzbau" : "Artikel & Kasus";
  if (!sx.items.length) {
    main().innerHTML = `<div class="deck"><div class="panel empty"><div class="big">🧱</div><h2>Noch keine Sätze</h2><p>Dafür brauchst du gelernte Wörter mit Beispielsatz${mode === "luecke" ? " (mit Artikel)" : ""}. Lerne ein paar Wörter auf „Heute“ – oder übe die Satzmuster.</p><div class="row" style="justify-content:center"><a class="btn" href="#saetze">Zurück</a><a class="btn primary" href="#saetze/muster~praep">Satzmuster</a></div></div></div>`;
    sx = null; return;
  }
  drawItem(title, "#saetze");
}
function patternSession(cat) {
  if (!sx || sx.mode !== "muster~" + cat) {
    const ps = shuffle(PATTERNS.filter((p) => p.cat === cat)).sort((a, b) => patDone(a.id) - patDone(b.id));
    sx = { mode: "muster~" + cat, items: ps.map((p) => (p.gap ? { kind: "pgap", p, opts: shuffle(p.opts), right: p.gap } : buildItem(p.de, { p }))), i: 0, res: [] };
  }
  drawItem(CATS.find((c) => c.id === cat)?.name || "Satzmuster", "#saetze");
}
function drawItem(title, back) {
  if (sx.i >= sx.items.length) return drawEnd(title);
  const it = sx.items[sx.i]; const n = sx.items.length;
  const head = `<div class="deckbar"><span><b>${esc(title)}</b> · ${sx.i + 1}/${n}</span><a class="btn ghost" href="${back}">Beenden</a></div>`;
  const wordInfo = it.r ? `<div class="row satzwort"><span class="word">${wordHTML(BY.get(it.r))}</span>${H.gloss(BY.get(it.r))}</div>` : it.p ? `<div class="lbl">${esc(it.p.title)}</div>` : "";
  let body = "";
  if (it.kind === "bau") {
    const hl = it.r ? targetToken(it.r, it.de) : -1;
    const tile = (x, where) => `<button class="stile${x.i === hl ? " hl" : ""}" data-tile="${where}:${x.i}" ${it.checked ? "disabled" : ""}>${esc(x.t)}</button>`;
    const ok = it.checked && it.ok;
    body = `<div class="panel pad stack">${wordInfo}${it.s ? trOf(it.s) : trPat(it.p)}
        <div class="sline${it.checked ? (ok ? " good" : " bad") : ""}" aria-label="Dein Satz">${it.placed.map((x) => tile(x, "a")).join("") || `<span class="muted small">Tippe die Wörter in der richtigen Reihenfolge an.</span>`}</div>
        <div class="spool">${it.pool.map((x) => tile(x, "p")).join("")}</div>
        ${it.checked ? `<div class="tres ${ok ? "good" : "bad"} panel pad"><b>${ok ? "Richtig!" : "Nicht ganz – so ist es richtig:"}</b><div class="row" style="gap:6px"><span class="de">${esc(it.de)}</span>${H.spkBtn(it.de, "sm")}</div></div>` : ""}</div>
      <div class="answer">${it.checked ? `<span></span><button class="btn primary" data-sx="next">Weiter →</button>` : `<button class="btn" data-sx="reset" ${it.placed.length ? "" : "disabled"}>Zurücksetzen</button><button class="btn primary" data-sx="check" ${it.pool.length ? "disabled" : ""}>Prüfen</button>`}</div>`;
  } else {
    const isP = it.kind === "pgap"; const de = isP ? it.p.de : it.de;
    let gapped;
    if (isP) { const at = de.indexOf(it.p.gap); gapped = `${esc(de.slice(0, at))}<span class="gap sgap">${it.checked ? esc(it.right) : "&nbsp;"}</span>${esc(de.slice(at + it.p.gap.length))}`; }
    else gapped = it.tk.map((t, i) => (i === it.at ? `<span class="gap sgap">${it.checked ? esc(it.right) : "&nbsp;"}</span>${esc(t.slice(t.replace(/[.,!?;:]$/, "").length))}` : esc(t))).join(" ");
    const w = it.r && BY.get(it.r);
    body = `<div class="panel qcard">${wordInfo}${w && isNoun(w.p) ? `<span class="small muted">Genus: <b class="g-${gender(w.p)}">${esc(gender(w.p))}</b></span>` : ""}<p class="cloze">${gapped}</p>${isP ? trPat(it.p) : trOf(it.s)}</div>
      <div class="opts">${it.opts.map((o, k) => `<button class="opt${it.checked ? (o === it.right ? " right" : o === it.sel ? " wrong" : "") : ""}" data-sopt="${k}" ${it.checked ? "disabled" : ""}><span class="kbd">${k + 1}</span><span class="word">${esc(o)}</span></button>`).join("")}</div>
      ${it.checked ? `<div class="answer"><span></span><button class="btn primary" data-sx="next">Weiter →</button></div>` : ""}`;
  }
  main().innerHTML = `<div class="deck">${head}${body}</div>`;
  if (it.checked) document.querySelector('[data-sx="next"]')?.focus();
}
function drawEnd(title) {
  const ok = sx.res.filter(Boolean).length; if (!sx.logged) { sx.logged = true; St.logPractice(sx.res.length); }
  const isPat = sx.mode.startsWith("muster");
  main().innerHTML = `<div class="deck"><div class="panel empty"><div class="big">${ok === sx.res.length ? "🏆" : "💪"}</div><h2>${esc(title)}: ${ok} von ${sx.res.length} richtig</h2>
    <p>${isPat ? "Sprich die Sätze laut nach – so werden sie zu fertigen Bausteinen für die Prüfung." : "Wörter, die du zweimal richtig im Satz benutzt, gelten als „sicher im Satz“."}</p>
    <div class="row" style="justify-content:center"><a class="btn" href="#saetze">Übersicht</a><button class="btn primary" data-sx="again">Nochmal</button></div></div></div>`;
}
function checkBau(it) {
  const mine = it.placed.map((x) => x.t).join(" ");
  it.ok = mine === it.tk.join(" ") || mine.replace(/[.,!?;:]/g, "") === it.tk.join(" ").replace(/[.,!?;:]/g, "");
  it.checked = true; sx.res.push(it.ok ? 1 : 0); vib(it.ok ? 15 : [30, 40, 30]);
  if (it.ok && it.r) addUse(it.r, 1); if (it.ok && it.p) addPat(it.p.id);
  St.save(); H.speak(it.de);
}

/* ---------- own sentence, checked by the AI ---------- */
let own = { r: 0, text: "", busy: false, res: null, err: "" };
function nextOwnWord(skip = 0) {
  const pool = learnedPool(); if (!pool.length) return 0;
  const cand = shuffle(pool.filter((r) => r !== skip && !canUse(r)));
  return cand[0] || shuffle(pool.filter((r) => r !== skip))[0] || pool[0];
}
function renderEigen(r) {
  if (r && BY.has(r) && own.r !== r) own = { r, text: "", busy: false, res: null, err: "" };
  if (!own.r || !BY.has(own.r)) own = { r: nextOwnWord(), text: "", busy: false, res: null, err: "" };
  if (!own.r) { main().innerHTML = `<div class="deck"><div class="panel empty"><div class="big">✍️</div><h2>Noch keine Wörter</h2><p>Lerne zuerst ein paar Wörter – dann bildest du hier eigene Sätze damit.</p><a class="btn primary" href="#heute">Heute</a></div></div>`; return; }
  const w = BY.get(own.r); const res = own.res;
  const lvl = usedLevel(own.r);
  main().innerHTML = `<div class="deck"><div class="deckbar"><span><b>Eigener Satz</b>${lvl ? ` · ${canUse(own.r) ? "sicher im Satz ✓" : "1× richtig"}` : ""}</span><a class="btn ghost" href="#saetze">Beenden</a></div>
    <div class="panel qcard"><span class="lbl">Bilde einen Satz mit</span><div class="row" style="justify-content:center;gap:8px"><div class="word qword">${wordHTML(w)}</div>${H.spkBtn(sayText(w))}</div>${H.gloss(w)}
      <p class="small muted" style="margin:0">Tipp: ein Satz aus deinem Alltag oder aus der Klinik. Mutig sein – Fehler sind hier erwünscht.</p></div>
    <form id="ownForm" class="typeform"><textarea id="ownText" rows="3" maxlength="300" lang="de" spellcheck="false" placeholder="z. B. ${esc(isNoun(w.p) ? `Ich habe ${w.p.split(",")[0] === "der" ? "den" : w.p.split(",")[0]} ${keyOf(w)} …` : `Gestern habe ich … ${keyOf(w)} …`)}" ${own.busy ? "disabled" : ""}>${esc(own.text)}</textarea>
      <div class="umlauts">${["ä", "ö", "ü", "ß"].map((c) => `<button type="button" class="btn" data-sins="${c}">${c}</button>`).join("")}<button class="btn primary" type="submit" ${own.busy ? "disabled" : ""}>${own.busy ? "KI prüft …" : "Prüfen lassen"}</button></div></form>
    <div id="ownRes">${own.err ? `<div class="note">${esc(own.err)}</div>` : res ? ownResult(res) : ""}</div>
    <div class="row" style="justify-content:space-between"><button class="btn ghost" data-sx="ownSkip">Anderes Wort</button>${res ? `<button class="btn" data-sx="ownRetry">Neuer Satz mit diesem Wort</button>` : ""}</div></div>`;
  if (!own.busy && !res) $("ownText")?.focus();
}
function ownResult(res) {
  const good = res.ok && res.uses;
  const why = (e) => (H.isAr() && e.why_ar ? `<span class="tr ar" dir="rtl" lang="ar">${esc(e.why_ar)}</span>` : `<span class="en">${esc(e.why)}</span>`);
  const tip = H.isAr() && res.tip_ar ? `<span class="tr ar" dir="rtl" lang="ar">${esc(res.tip_ar)}</span>` : esc(res.tip || "");
  return `<div class="panel pad tres ${good ? "good" : "bad"}"><b>${good ? "Richtig – so kann man das sagen! ✓" : !res.uses ? "Das Wort fehlt oder passt hier nicht" : "Fast – hier ist die korrigierte Fassung:"}</b>
    ${!good || res.corrected !== own.text.trim() ? `<div class="row" style="gap:6px"><span class="de">${esc(res.corrected)}</span>${H.spkBtn(res.corrected, "sm")}</div>` : ""}
    ${(res.errors || []).length ? `<ul class="errlist">${res.errors.map((e) => `<li><s>${esc(e.wrong)}</s> → <b>${esc(e.right)}</b> ${why(e)}</li>`).join("")}</ul>` : ""}
    ${res.tip ? `<p class="small" style="margin:0"><span class="lbl">Tipp</span> ${tip}</p>` : ""}</div>`;
}
async function ownCheck() {
  const text = ($("ownText")?.value || "").trim(); own.text = text;
  if (text.split(/\s+/).length < 3) { H.toast("Bitte einen ganzen Satz schreiben"); return; }
  const w = BY.get(own.r); own.busy = true; own.err = ""; own.res = null; renderEigen();
  try {
    const word = (isNoun(w.p) ? w.p.split(",")[0].trim() + " " : "") + keyOf(w);
    const res = await aiCall("check", { word, meaning: w.e, sentence: text });
    if (!res || typeof res.ok !== "boolean") throw new Error("err");
    own.res = res; if (res.ok && res.uses) { addUse(own.r, 2); St.save(); }
    vib(res.ok && res.uses ? 15 : [30, 40, 30]);
  } catch (e) { own.err = { auth: "Für die KI-Korrektur bitte anmelden.", limited: "Die KI ist gerade ausgelastet – bitte gleich nochmal.", off: "Die KI ist auf diesem Server nicht eingerichtet." }[e.message] || "Das hat nicht geklappt – bitte nochmal versuchen."; }
  own.busy = false; if (location.hash.startsWith("#saetze/eigen")) renderEigen();
}

/* ---------- events from main.js ---------- */
export function onClick(t) {
  const d = t.dataset;
  if (d.tile && sx) {
    const it = sx.items[sx.i]; if (!it || it.checked) return true;
    const [where, idx] = d.tile.split(":"); const i = Number(idx);
    if (where === "p") { const k = it.pool.findIndex((x) => x.i === i); it.placed.push(...it.pool.splice(k, 1)); }
    else { const k = it.placed.findIndex((x) => x.i === i); it.pool.push(...it.placed.splice(k, 1)); }
    vib(5); drawItem(sxTitle(), "#saetze"); return true;
  }
  if (d.sopt !== undefined && sx) {
    const it = sx.items[sx.i]; if (!it || it.checked) return true;
    it.sel = it.opts[Number(d.sopt)]; it.checked = true; const ok = it.sel === it.right; sx.res.push(ok ? 1 : 0); vib(ok ? 15 : [30, 40, 30]);
    if (ok && it.p) addPat(it.p.id); St.save(); H.speak(it.kind === "pgap" ? it.p.de : it.de);
    if (it.kind === "pgap") sx.items.splice(sx.i + 1, 0, buildItem(it.p.de, { p: it.p })); // then build the whole sentence
    drawItem(sxTitle(), "#saetze"); return true;
  }
  if (d.sins) { const i = $("ownText"); if (i && !i.disabled) { const p = i.selectionStart ?? i.value.length; i.value = i.value.slice(0, p) + d.sins + i.value.slice(p); own.text = i.value; i.focus(); i.setSelectionRange(p + 1, p + 1); } return true; }
  switch (d.sx) {
    case "check": { const it = sx?.items[sx.i]; if (it && !it.pool.length) { checkBau(it); drawItem(sxTitle(), "#saetze"); } return true; }
    case "reset": { const it = sx?.items[sx.i]; if (it) { it.pool = shuffle([...it.pool, ...it.placed]); it.placed = []; drawItem(sxTitle(), "#saetze"); } return true; }
    case "next": if (sx) { sx.i++; drawItem(sxTitle(), "#saetze"); } return true;
    case "again": { const m = sx?.mode; sx = null; renderSaetze(m || ""); return true; }
    case "ownSkip": own = { r: nextOwnWord(own.r), text: "", busy: false, res: null, err: "" }; if (location.hash !== "#saetze/eigen") location.hash = "saetze/eigen"; else renderEigen(); return true;
    case "ownRetry": own.text = ""; own.res = null; own.err = ""; renderEigen(); return true;
  }
  return false;
}
const sxTitle = () => (!sx ? "" : sx.mode === "bau" ? "Satzbau" : sx.mode === "luecke" ? "Artikel & Kasus" : CATS.find((c) => "muster~" + c.id === sx.mode)?.name || "Satzmuster");
export function onSubmit(e) { if (e.target.id === "ownForm") { e.preventDefault(); ownCheck(); return true; } return false; }
export function onInput(e) { if (e.target.id === "ownText") { own.text = e.target.value; return true; } return false; }
export function onKey(e, view) {
  if (view !== "saetze" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return false;
  if (/^[1-4]$/.test(e.key)) { const b = document.querySelector(`[data-sopt="${Number(e.key) - 1}"]:not([disabled])`); if (b) { b.click(); return true; } }
  return false;
}
export const leaveSaetze = () => {}; // nothing timed here
export { PAT };
