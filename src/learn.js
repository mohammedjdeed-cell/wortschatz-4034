// Themes (learning path), practice modes (typing, quiz, der/die/das) and two-player games (Erklär's!, Wort-Duell).
import * as St from "./state.js";
import { BY, WORDS } from "./state.js";
import { THEMES, THEME, BANDS, unitsOf, themeRanks, themeOf, bandOf, getTheme, PACKS, userThemes, findUnit } from "./themes.js";
import { cloud } from "./cloud.js";
import { SENT, getSentences, aiCall } from "./ai.js";
import { esc, wordHTML, tile, keyOf, isNoun, gender, posLabel, attachPhotos, sayText } from "./visuals.js";

let H; // UI helpers from main.js: gloss, trW, isAr, spkBtn, speak, toast, openAccount, sentHTML, openWord
export function initLearn(h) { H = h; }
const $ = (id) => document.getElementById(id);
const main = () => $("main");
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const levelOf = () => (BANDS.find((b) => (St.S.start || 1) >= b.from && (St.S.start || 1) <= b.to) || BANDS[0]).id;
const vib = (p) => { try { navigator.vibrate?.(p); } catch {} };

let timers = [], unsub = null;
/** Called by the router whenever the view changes: stop timers and live listeners. */
export function leave() {
  timers.forEach(clearInterval); timers.forEach(clearTimeout); timers = []; if (unsub) { unsub(); unsub = null; }
  // An answer animation cut short by navigation must never leave a game locked (options would stop responding).
  if (quiz) quiz.locked = false; if (art) art.locked = false;
}

/* ================= THEMES ================= */
function unitStatus(u) {
  let seen = 0, mastered = 0;
  u.ranks.forEach((r) => { if (St.S.known[r]) { seen++; mastered++; } else if (St.S.learn[r]) { seen++; if (St.S.learn[r].b >= 3) mastered++; } });
  return { seen, mastered, total: u.ranks.length, state: mastered === u.ranks.length ? "done" : seen ? "active" : "new" };
}
function themeProgress(id) {
  const rs = themeRanks(id); let seen = 0;
  rs.forEach((r) => { if (St.S.known[r] || St.S.learn[r]) seen++; });
  return { seen, total: rs.length };
}
function pathLabel() {
  const p = St.S.path;
  const t = p?.mode === "theme" && getTheme(p.theme);
  return t ? `${t.emoji} ${t.name}` : "Nach Häufigkeit";
}
export function pathChip() {
  return `<a class="pathchip" href="#themen" title="Lernweg ändern"><span class="muted">Lernweg:</span> ${esc(pathLabel())}</a>`;
}
function themeCard(t) {
  const p = themeProgress(t.id); const inBand = t.kind === "pack" || t.kind === "user" ? 0 : themeRanks(t.id).filter((r) => bandOf(r) === levelOf()).length;
  const active = St.S.path?.mode === "theme" && St.S.path.theme === t.id;
  return `<a class="theme${active ? " active" : ""}" href="#thema/${t.id}"><span class="temo">${t.emoji}</span><span class="tbody"><b>${esc(t.name)}</b><span class="muted small">${esc(t.desc)}</span>
    <span class="meter"><i style="width:${(p.seen / Math.max(1, p.total)) * 100}%"></i></span><span class="tmeta">${p.seen}/${p.total} Wörter · ${t.kind === "pack" || t.kind === "user" ? `${unitsOf(t.id).length} Lektionen` : `${inBand} auf ${levelOf()}`}</span></span>${active ? '<span class="badge dict">Lernweg</span>' : ""}</a>`;
}
export function renderThemen() {
  const lvl = levelOf();
  const rec = ["medizin", "koerper", ...THEMES.map((t) => t.id).filter((id) => !["medizin", "koerper", "basis"].includes(id)).sort((a, b) => themeRanks(b).filter((r) => bandOf(r) === lvl).length - themeRanks(a).filter((r) => bandOf(r) === lvl).length).slice(0, 1)];
  main().innerHTML = `<div class="page-head"><div><h1>Themen</h1><p>Lerne in Lektionen à 10 Wörtern, nach Situation geordnet und von leicht nach schwer. Wörter, die zusammen vorkommen, bleiben besser hängen.</p></div></div>
  <div class="panel pad pathbox"><div><b>Woher kommen deine neuen Wörter?</b><p class="muted small" style="margin:2px 0 0">Aktuell: ${esc(pathLabel())}. Wähle ein Thema als Lernweg – oder lerne einfach nach Häufigkeit.</p></div>
    <button class="btn${St.S.path?.mode === "theme" ? "" : " primary"}" data-path="freq">Nach Häufigkeit</button></div>
  <div class="section"><h2>Prüfungsvorbereitung <span class="muted small" style="font-weight:400">Fachsprachprüfung Düsseldorf</span></h2><div class="themes">${PACKS.map(themeCard).join("")}</div></div>
  <div class="section"><h2>Eigene Themen mit KI</h2>
    <div class="panel pad stack"><p class="muted small" style="margin:0">Beschreibe, was du lernen willst – die KI baut daraus ein Thema mit Lektionen. Wörter, die schon im Wörterbuch stehen, werden verknüpft.</p>
      <textarea id="aiThemeReq" rows="2" maxlength="160" placeholder="z. B. Fach Zahnarzt Düsseldorf – Prothetik · Kardiologie-Station · Arztbrief Innere Medizin">${esc(aiTheme.request)}</textarea>
      <div class="row end"><div class="seg" role="group" aria-label="Lektionen">${[2, 3, 4, 5].map((n) => `<button data-ain="${n}" aria-pressed="${aiTheme.units === n}">${n} Lektionen</button>`).join("")}</div><button class="btn primary" data-act="aiThemeGo">Thema erstellen</button></div>
      <div id="aiThemeOut">${aiThemeHTML()}</div></div>
    ${userThemes().length ? `<div class="themes" style="margin-top:10px">${userThemes().map(themeCard).join("")}</div>` : ""}</div>
  <div class="section"><h2>Empfohlen für dich <span class="muted small" style="font-weight:400">Niveau ${lvl}</span></h2><div class="themes">${rec.map((id) => themeCard(THEME[id])).join("")}</div></div>
  <div class="section"><h2>Alle Themen</h2><div class="themes">${THEMES.filter((t) => !rec.includes(t.id)).map(themeCard).join("")}</div></div>`;
}
export function renderThema(id) {
  const t = getTheme(id); if (!t) { location.hash = "themen"; return; }
  if (t.kind !== "base") return renderCourse(t);
  const units = unitsOf(id); const lvl = levelOf(); const active = St.S.path?.mode === "theme" && St.S.path.theme === id;
  const bands = BANDS.filter((b) => units.some((u) => u.band === b.id));
  main().innerHTML = `<a class="back" href="#themen">← Themen</a>
  <div class="page-head"><div><h1>${t.emoji} ${esc(t.name)}</h1><p>${themeRanks(id).length} Wörter in ${units.length} Lektionen · ${esc(t.desc)}</p></div>
    <div class="row">${active ? `<span class="badge dict">Dein Lernweg</span>` : `<button class="btn" data-path="theme" data-theme-id="${id}">Als Lernweg wählen</button>`}<button class="btn primary" data-quiz-theme="${id}">Quiz zum Thema</button></div></div>
  ${bands.map((b) => `<div class="section"><h2>${b.id} ${b.id === lvl ? '<span class="badge dict">Dein Niveau</span>' : ""}</h2><ul class="units">${units.filter((u) => u.band === b.id).map((u) => unitRow(u)).join("")}</ul></div>`).join("")}`;
}
function unitRow(u) {
  const s = unitStatus(u);
  const preview = u.ranks.slice(0, 6).map((r) => { const w = BY.get(r); return isNoun(w.p) ? `<span class="g-${gender(w.p)}">${esc(keyOf(w))}</span>` : esc(keyOf(w)); }).join(", ");
  return `<li class="unit ${s.state}"><span class="unum">${s.state === "done" ? "✓" : u.n}</span>
    <div class="ubody"><b>Lektion ${u.n}${u.title ? ` · ${esc(u.title)}` : ""}</b><span class="small muted">${preview}${u.ranks.length > 6 ? " …" : ""}</span><span class="meter"><i style="width:${(s.seen / s.total) * 100}%"></i></span></div>
    <span class="small muted mono">${s.seen}/${s.total}</span>
    ${s.state === "done" ? `<button class="btn" data-quiz-unit="${u.id}">Wiederholen</button>` : s.seen === s.total ? `<button class="btn" data-quiz-unit="${u.id}">Üben</button>` : `<button class="btn primary" data-unit="${u.id}">${s.seen ? "Weiterlernen" : "Lernen"}</button>`}</li>`;
}
/** Exam packs and own AI themes: lessons with titles instead of CEFR bands. */
function renderCourse(t) {
  const units = unitsOf(t.id); const active = St.S.path?.mode === "theme" && St.S.path.theme === t.id;
  main().innerHTML = `<a class="back" href="#themen">← Themen</a>
  <div class="page-head"><div><h1>${t.emoji} ${esc(t.name)}</h1><p>${themeRanks(t.id).length} Wörter in ${units.length} Lektionen · ${esc(t.desc)}</p>${t.kind === "pack" ? `<p class="small muted">Wortschatz zur Vorbereitung, nach Prüfungsteilen geordnet – keine offizielle Liste der Kammer.</p>` : t.request ? `<p class="small muted">Anfrage: „${esc(t.request)}“</p>` : ""}</div>
    <div class="row">${active ? `<span class="badge dict">Dein Lernweg</span>` : `<button class="btn" data-path="theme" data-theme-id="${t.id}">Als Lernweg wählen</button>`}<button class="btn primary" data-quiz-theme="${t.id}">Quiz</button>${t.kind === "user" ? `<button class="btn ghost danger" data-act="aiThemeDel" data-theme-id="${t.id}">Löschen</button>` : ""}</div></div>
  <ul class="units">${units.map((u) => unitRow(u)).join("")}</ul>`;
}

/* ================= PRACTICE HUB ================= */
export function renderUeben() {
  const due = St.S.start ? St.dueDeck().length : 0; const n = learnedPool().length;
  const card = (href, emo, title, desc, extra = "") => `<a class="mode" href="${href}"><span class="memo">${emo}</span><span class="mbody"><b>${title}</b><span class="muted small">${desc}</span></span>${extra}</a>`;
  main().innerHTML = `<div class="page-head"><div><h1>Üben</h1><p>Abwechslung hilft beim Behalten: erst wiedererkennen, dann selbst schreiben, dann im Spiel benutzen.</p></div></div>
  <div class="section" style="margin-top:0"><h2>Allein</h2><div class="modes">
    ${card("#karten", "🗂️", "Karteikarten", "Wiederholen im richtigen Abstand (Leitner-System)", due ? `<span class="badge dict">${due} fällig</span>` : "")}
    ${card("#schreiben", "⌨️", "Schreiben", "Bedeutung sehen, deutsches Wort mit Artikel tippen", due ? `<span class="badge">${due} fällig</span>` : "")}
    ${card("#quiz", "❓", "Schnell-Quiz", "10 Fragen, 4 Antworten – mit ähnlichen Wörtern als Falle", `<span class="badge">${n} Wörter</span>`)}
    ${card("#artikel", "🎯", "der · die · das", "Artikel-Training im Sekundentakt")}
  </div></div>
  <div class="section"><h2>Zu zweit</h2><div class="modes">
    ${card("#erklaer", "🗣️", "Erklär’s!", "Ein Handy, zwei Teams: Wort auf Deutsch erklären, ohne es zu sagen")}
    ${card("#duell", "⚔️", "Wort-Duell", "Online gegen Freunde – jeder mit eigenem Konto, gleiche 10 Fragen")}
  </div></div>`;
}
/** Words the learner has met: box + known + own words; falls back to their level band. */
function learnedPool() {
  const rs = [...Object.keys(St.S.learn), ...Object.keys(St.S.known)].map(Number).filter((r) => BY.has(r));
  return [...new Set(rs)];
}
function levelPool() {
  const b = BANDS.find((x) => x.id === levelOf()); return WORDS.filter((w) => w.r >= b.from && w.r <= b.to).map((w) => w.r);
}

/* ================= QUIZ ENGINE (solo quiz, lessons, duel) ================= */
// Question types: de (German → meaning), tr (meaning → German), listen (hear → German), cloze (sentence gap),
// art (article + plural), type (typed recall). A word answered right twice in quizzes is asked as "type" from then on.
const posClass = (w) => (isNoun(w.p) ? "noun" : ["verb", "adj", "adv"].includes(w.p) ? w.p : "other");
const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
const sentOf = (r) => SENT[r] || St.S.custom?.[r]?.s || BY.get(r)?.s || null;
const singleArt = (w) => isNoun(w.p) && !w.p.includes(",");
let FOLDED = null;
const foldedKeys = () => FOLDED || (FOLDED = WORDS.map((x) => [x, fold(keyOf(x))]));
/** Words that look or sound like the target: edit distance ≤ 2 or the same first 4 letters. */
function lookAlikes(w) {
  const k = fold(keyOf(w)); const cls = posClass(w);
  return foldedKeys().filter(([x, fk]) => x.r !== w.r && fk !== k && posClass(x) === cls && Math.abs(fk.length - k.length) <= 3
    && ((k.length >= 4 && fk.slice(0, 4) === k.slice(0, 4)) || lev(fk, k) <= 2)).map(([x]) => x);
}
function distractors(r, k, { similar = false, extra = [] } = {}) {
  const w = BY.get(r); const cls = posClass(w); const gl = (x) => (H.isAr() ? x.ar || x.e : x.e);
  const used = new Set([gl(w)]), keys = new Set([keyOf(w)]), out = [];
  const take = (list, max = k) => { for (const x of shuffle(list)) { if (out.length >= max) return; if (!x || x.r === r || used.has(gl(x)) || keys.has(keyOf(x))) continue; used.add(gl(x)); keys.add(keyOf(x)); out.push(x.r); } };
  const near = Math.min(r, 3400);
  if (similar) take(lookAlikes(w), 2); // at most two look-alikes, so the right answer is not the odd one out
  take(extra.map((x) => BY.get(x)).filter((x) => x && posClass(x) === cls)); // lesson / learned words first
  take(themeRanks(themeOf(r)).map((x) => BY.get(x)).filter((x) => x && posClass(x) === cls)); // same theme + word class = plausible traps
  if (out.length < k) take(WORDS.filter((x) => posClass(x) === cls && Math.abs(x.r - (r > 4034 ? 1500 : near)) < 600));
  if (out.length < k) take(WORDS.filter((x) => posClass(x) === cls));
  if (out.length < k) take(WORDS); // never fewer than 4 options
  return out;
}
/** Duel questions: simple recognition, identical for both players. */
export function makeQuestions(pool, n = 10) {
  return shuffle([...new Set(pool)].filter((r) => BY.has(r))).slice(0, n).map((r, i) => ({ r, t: i % 2 ? "tr" : "de", o: shuffle([r, ...distractors(r, 3)]) }));
}
/** Where the word sits in its example sentence (inflected forms by stem), or null. */
function clozeOf(r) {
  const s = sentOf(r); const w = BY.get(r); if (!s?.de || !w) return null;
  const key = keyOf(w).replace(/^sich\s+/, "");
  if (/\s/.test(key)) { const i = s.de.toLowerCase().indexOf(key.toLowerCase()); return i < 0 ? null : { de: s.de, at: i, len: key.length, s }; }
  const stem = fold(w.p === "verb" ? key.replace(/(e?n)$/, "") : key.replace(/(e|en)$/, ""));
  if (stem.length < 3) return null;
  for (const m of s.de.matchAll(/[A-Za-zÄÖÜäöüß]+/g)) {
    const t = fold(m[0]); if (t.startsWith(stem) && t.length <= fold(key).length + 4) return { de: s.de, at: m.index, len: m[0].length, s };
  }
  return null;
}
const pluralOf = (r) => { const p = (sentOf(r)?.pl || "").replace(/^die\s+/i, "").trim(); return p && p !== "–" && p !== "-" && !/\s/.test(p) ? p : ""; };
function wrongPlural(key, right) {
  const uml = key.replace(/([aou])(?!.*[aou])/i, (c) => ({ a: "ä", o: "ö", u: "ü", A: "Ä", O: "Ö", U: "Ü" })[c]);
  const opts = [key + "e", key + "en", key + "er", key + "s", key + "n", uml + "e", uml + "er", key].filter((x) => x !== right && !/(ee|nn)$/.test(x) || x === key);
  return shuffle(opts.filter((x) => x !== right))[0];
}
const quizLevel = (r) => (St.S.known[r] ? 2 : St.S.learn[r]?.qc || 0);
function pickType(r, stage) {
  const w = BY.get(r); if (!w) return "de";
  if (quizLevel(r) >= 2) return "type";
  if (stage === 0) return shuffle(canSpeak ? ["de", "de", "listen"] : ["de"])[0];
  const hard = ["tr"]; if (clozeOf(r)) hard.push("cloze", "cloze"); if (singleArt(w)) hard.push("art");
  return shuffle(hard)[0];
}
/** Fill in type and options right before a question is shown (sentences may have arrived by then). */
function prepQuestion(q, extra = []) {
  if (q.t) return q;
  q.t = pickType(q.r, q.stage ?? Math.round(Math.random()));
  const w = BY.get(q.r);
  if (q.t === "art") {
    const a = w.p.trim(), pl = pluralOf(q.r), others = shuffle(["der", "die", "das"].filter((x) => x !== a)), key = keyOf(w);
    if (pl) { const bad = wrongPlural(key, pl); q.o = shuffle([[a, pl], [others[0], pl], [a, bad], [others[1], bad]]).map(([x, p]) => `${x}|${p}`); q.ok = `${a}|${pl}`; }
    else { q.o = ["der", "die", "das"]; q.ok = a; }
  } else if (q.t !== "type") q.o = shuffle([q.r, ...distractors(q.r, 3, { similar: q.t !== "de", extra })]);
  return q;
}
const isRight = (q, k) => (q.t === "art" ? q.o[k] === q.ok : q.o[k] === q.r);
function questionHTML(q, i, total) {
  const w = BY.get(q.r); const t = q.t || "de";
  const prog = total > 12 ? `<span class="meter qmeter"><i style="width:${(i / total) * 100}%"></i></span><span class="small mono qok">${quiz.res.filter(Boolean).length} ✓</span>`
    : `<div class="dots">${Array.from({ length: total }, (_, k) => `<i class="${k < quiz.res.length ? (quiz.res[k] ? "ok" : "no") : k === i ? "cur" : ""}"></i>`).join("")}</div>`;
  const dots = `<div class="qhead"><span class="muted small nowrap">Frage ${i + 1} von ${total}</span>${prog}</div>`;
  const gw = (x) => `<span class="word">${wordHTML(x)}</span>`;
  let label, prompt;
  if (t === "de") { label = "Was bedeutet …"; prompt = `<div class="word qword">${wordHTML(w)}</div>${H.spkBtn(sayText(w))}`; }
  else if (t === "tr") { label = "Wie heißt das auf Deutsch?"; prompt = `<div class="qword">${H.gloss(w, "gloss-big")}</div>${tile(w)}`; }
  else if (t === "listen") { label = "Was hörst du?"; prompt = `<button class="btn big listenbtn" data-say="${esc(sayText(w))}">🔊 Nochmal hören</button>`; }
  else if (t === "cloze") {
    const c = clozeOf(q.r); const s = c.s; const tr = H.isAr() && s.ar_s ? `<span class="tr ar" dir="rtl" lang="ar">${esc(s.ar_s)}</span>` : `<span class="en">${esc(s.en || "")}</span>`;
    label = "Welches Wort fehlt?"; prompt = `<p class="cloze">${esc(c.de.slice(0, c.at))}<span class="gap">${"_".repeat(Math.max(4, Math.min(12, c.len)))}</span>${esc(c.de.slice(c.at + c.len))}</p>${tr}`;
  } else if (t === "art") { label = "Artikel und Plural?"; prompt = `<div class="word qword">${esc(keyOf(w))}</div>${H.gloss(w)}`; }
  else { // type
    const res = q.typed;
    return `${dots}<div class="panel qcard">${tile(w, "", { photo: true })}<span class="lbl">Schreib das Wort${isNoun(w.p) ? " mit Artikel" : ""}</span>${H.gloss(w, "gloss-big")}</div>
      <form id="qTypeForm" class="typeform" autocomplete="off"><input id="typeIn" class="input big" lang="de" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${isNoun(w.p) ? "z. B. der Tisch" : "Deutsches Wort"}" ${res ? "disabled" : ""} value="${esc(q.input || "")}">
        <div class="umlauts">${["ä", "ö", "ü", "ß"].map((c) => `<button type="button" class="btn" data-ins="${c}">${c}</button>`).join("")}<button class="btn primary" type="submit">${res ? "Weiter" : "Prüfen"}</button></div></form>
      ${res ? typeResult(w, res) : ""}`;
  }
  const opt = (o, k) => {
    let body;
    if (t === "de") body = H.gloss(BY.get(o));
    else if (t === "art") { const [a, p] = String(o).split("|"); body = `<span class="word"><span class="art g-${a}">${a}</span> ${esc(keyOf(w))}${p ? ` <span class="muted">· Pl. ${esc(p)}</span>` : ""}</span>`; }
    else if (t === "cloze") body = `<span class="word">${esc(keyOf(BY.get(o)))}</span>`;
    else body = gw(BY.get(o));
    return `<button class="opt" data-opt="${k}"><span class="kbd">${k + 1}</span>${body}</button>`;
  };
  return `${dots}<div class="panel qcard"><span class="lbl">${label}</span>${prompt}</div><div class="opts">${q.o.map(opt).join("")}</div>`;
}
/** After a question is on screen: listening questions read the word aloud, typing questions focus the input. */
function afterQuestion(q) {
  if (q.t === "listen" && !q.played) { q.played = true; H.speak(sayText(BY.get(q.r))); }
  if (q.t === "type") { const i = $("typeIn"); if (i && !i.disabled) i.focus(); else document.querySelector("#qTypeForm [type=submit]")?.focus(); attachPhotos(main()); }
}
function record(q, right) { if (quiz.mode !== "duel") St.quizMark(q.r, right); if (!right && quiz.requeue) quiz.requeue(q); }
let quiz = null; // { qs, i, res: [0/1], src, mode: "solo"|"lesson"|"duel", locked }
function answerOpt(k, after) {
  if (!quiz || quiz.locked) return; const q = quiz.qs[quiz.i]; if (!q || q.t === "type") return; quiz.locked = true;
  const right = isRight(q, k); quiz.res.push(right ? 1 : 0); quiz.i++; record(q, right); vib(right ? 15 : [30, 40, 30]); // count the answer now, even if the user leaves during the animation
  document.querySelectorAll(".opt").forEach((b) => { const idx = Number(b.dataset.opt); if (isRight(q, idx)) b.classList.add("right"); else if (idx === k) b.classList.add("wrong"); b.disabled = true; });
  if (q.t !== "de" && q.t !== "art") H.speak(sayText(BY.get(q.r)));
  const cur = quiz; timers.push(setTimeout(() => { cur.locked = false; if (quiz === cur) after(right); }, right ? 750 : 1700));
}
/** Typed answer inside a quiz: first submit checks, second submit moves on. */
function submitQuizTyping(redraw) {
  const q = quiz?.qs[quiz.i]; if (!q || q.t !== "type") return;
  if (q.typed) { quiz.res.push(q.typed.good ? 1 : 0); quiz.i++; record(q, q.typed.good); redraw(); return; }
  const v = $("typeIn")?.value || ""; if (!v.trim()) return; q.input = v;
  q.typed = checkTyped(BY.get(q.r), v); vib(q.typed.good ? 15 : [30, 40, 30]); H.speak(sayText(BY.get(q.r))); getSentences([q.r]); redraw();
}
export function startQuiz(pool, src) {
  leave();
  pool = [...new Set(pool)].filter((r) => BY.has(r));
  if (pool.length < 4) { H.toast("Dafür brauchst du mindestens 4 Wörter – lerne zuerst ein paar."); location.hash = "ueben"; return; }
  quiz = { qs: shuffle(pool).slice(0, 10).map((r) => ({ r })), i: 0, res: [], src, mode: "solo", locked: false, pool };
  getSentences(quiz.qs.map((q) => q.r));
  if (location.hash !== "#quiz") location.hash = "quiz"; else renderQuiz();
}
export function renderQuiz() {
  if (quiz?.ended) quiz = null; // coming back to #quiz after a finished round starts a new one
  if (!quiz || quiz.mode !== "solo") { const p = learnedPool(); startQuiz(p.length >= 8 ? p : [...p, ...levelPool()], "Gelernte Wörter"); return; }
  leave(); // a fresh render never has an answer animation pending
  if (quiz.i >= quiz.qs.length) return renderQuizEnd();
  const q = prepQuestion(quiz.qs[quiz.i], quiz.pool);
  main().innerHTML = `<div class="deck"><div class="deckbar"><span><b>Schnell-Quiz</b> · ${esc(quiz.src)}</span><a class="btn ghost" href="#ueben">Beenden</a></div>${questionHTML(q, quiz.i, quiz.qs.length)}</div>`;
  afterQuestion(q);
}
function missedHTML(missed) {
  return missed.length ? `<p>Diese Wörter solltest du wiederholen:</p><div class="chips-list">${missed.map((r) => `<button class="chipbtn" data-open="${r}">${wordHTML(BY.get(r))}</button>`).join("")}</div>` : "<p>Alles richtig – stark!</p>";
}
function renderQuizEnd() {
  quiz.ended = true; const ok = quiz.res.filter(Boolean).length; St.logPractice(quiz.qs.length);
  const missed = [...new Set(quiz.qs.filter((q, i) => !quiz.res[i]).map((q) => q.r))];
  main().innerHTML = `<div class="deck"><div class="panel empty"><div class="big">${ok >= 8 ? "🏆" : ok >= 5 ? "👍" : "💪"}</div><h2>${ok} von ${quiz.qs.length} richtig</h2>
    ${missedHTML(missed)}
    <div class="row" style="justify-content:center">${missed.length ? `<button class="btn" data-missed="${missed.join(",")}">Falsche in den Karteikasten</button>` : ""}<button class="btn primary" data-act="quizAgain">Neues Quiz</button></div></div></div>`;
}

/* ================= LESSON SESSION (Themen → Lernen) ================= */
// Introduce the lesson's words one by one, then a mini-quiz in two rounds (recognise, then recall/cloze/article),
// mixed with a few words learned earlier. Mistakes come back at the end. Then "Nächste Lektion".
let les = null; // { uid, phase: "intro"|"quiz"|"done", intro: [r], k, quiz }
function nextUnit(uid) {
  const u = findUnit(uid); if (!u) return null; const units = unitsOf(u.theme); const i = units.findIndex((x) => x.id === uid);
  return units.slice(i + 1).find((x) => unitStatus(x).state !== "done") || units[i + 1] || null;
}
/** First lesson of the learning-path theme that still has unseen words (for "Weiter mit Lektion N" on Heute). */
export function pathLesson() {
  const p = St.S.path; if (p?.mode !== "theme" || !getTheme(p.theme)) return null;
  const units = unitsOf(p.theme); return units.find((u) => unitStatus(u).seen < u.ranks.length) || units.find((u) => unitStatus(u).state !== "done") || null;
}
export function startLesson(uid, { intro = true } = {}) {
  const u = findUnit(uid); if (!u) { location.hash = "themen"; return; }
  const added = St.startUnit(u.ranks); getSentences(u.ranks);
  const words = u.ranks.filter((r) => BY.has(r));
  les = { uid, phase: intro ? "intro" : "quiz", intro: added.length ? added : words, k: 0, quiz: null };
  if (!intro) lessonQuiz();
  if (location.hash !== `#lektion/${uid}`) location.hash = `lektion/${uid}`; else renderLektion(uid);
}
function lessonQuiz() {
  const u = findUnit(les.uid); const words = u.ranks.filter((r) => BY.has(r));
  const review = shuffle(learnedPool().filter((r) => !words.includes(r))).slice(0, 3);
  const qs = [...shuffle(words).map((r) => ({ r, stage: 0 })), ...shuffle([...words, ...review]).map((r) => ({ r, stage: 1 }))];
  const again = new Set();
  les.quiz = { qs, i: 0, res: [], mode: "lesson", locked: false, pool: [...words, ...learnedPool()].slice(0, 80),
    requeue: (q) => { const key = q.r + ":" + q.stage; if (again.has(key)) return; again.add(key); les.quiz.qs.push({ r: q.r, stage: q.stage }); } };
  les.phase = "quiz";
}
export function renderLektion(uid) {
  if (!les || les.uid !== uid) { if (!findUnit(uid)) { location.hash = "themen"; return; } startLesson(uid); return; }
  leave();
  const u = findUnit(uid); const t = getTheme(u.theme);
  const bar = (right) => `<div class="deckbar"><span><b>Lektion ${u.n}</b> · ${esc(t.emoji)} ${esc(u.title || t.name)}</span>${right}<a class="btn ghost" href="#thema/${u.theme}">Beenden</a></div>`;
  if (les.phase === "intro") {
    const r = les.intro[les.k]; const w = BY.get(r); const last = les.k === les.intro.length - 1;
    main().innerHTML = `<div class="deck">${bar(`<span class="small muted mono">${les.k + 1}/${les.intro.length}</span>`)}
      <div class="dots">${les.intro.map((_, i) => `<i class="${i < les.k ? "ok" : i === les.k ? "cur" : ""}"></i>`).join("")}</div>
      <div class="panel pad intro">${tile(w, "xl", { photo: true })}<div class="row" style="justify-content:center;gap:8px"><div class="word qword">${wordHTML(w)}</div>${H.spkBtn(sayText(w))}</div>${H.gloss(w, "gloss-big")}
        <div id="introSent" class="introsent">${H.sentHTML(r)}</div></div>
      <div class="answer"><button class="btn" data-act="lesPrev" ${les.k ? "" : "disabled"}>← Zurück</button><button class="btn primary" data-act="lesNext">${last ? "Zum Quiz →" : "Weiter →"}</button></div>
      ${les.k === 0 ? `<button class="btn ghost" data-act="lesSkip">Gleich zum Quiz</button>` : ""}</div>`;
    attachPhotos(main()); if (!les.spoken?.[les.k]) { (les.spoken ||= {})[les.k] = 1; H.speak(sayText(w)); }
    return;
  }
  if (les.phase === "quiz") {
    quiz = les.quiz;
    if (quiz.i >= quiz.qs.length) { les.phase = "done"; St.logPractice(quiz.res.length); return renderLektion(uid); }
    const q = prepQuestion(quiz.qs[quiz.i], quiz.pool);
    main().innerHTML = `<div class="deck">${bar("")}${questionHTML(q, quiz.i, quiz.qs.length)}</div>`;
    afterQuestion(q); return;
  }
  const lq = les.quiz; const ok = lq.res.filter(Boolean).length; const nx = nextUnit(uid);
  const missed = [...new Set(lq.qs.filter((q, i) => !lq.res[i]).map((q) => q.r))];
  main().innerHTML = `<div class="deck"><div class="panel empty"><div class="big">✓</div><h2>Lektion ${u.n} fertig</h2><p>${ok} von ${lq.res.length} Antworten richtig. Die Wörter liegen jetzt im Karteikasten.</p>
    ${missedHTML(missed)}
    <div class="row" style="justify-content:center;flex-wrap:wrap"><a class="btn" href="#thema/${u.theme}">Zum Thema</a><button class="btn" data-quiz-unit="${uid}">Nochmal üben</button>${nx ? `<button class="btn primary" data-unit="${nx.id}">Nächste Lektion →</button>` : `<a class="btn primary" href="#karten">Karteikarten</a>`}</div>
    ${nx ? `<p class="small muted">Als Nächstes: Lektion ${nx.n}${nx.title ? ` · ${esc(nx.title)}` : ""}</p>` : `<p class="small muted">Das war die letzte Lektion dieses Themas.</p>`}</div></div>`;
}

/* ================= SCHREIBEN (typed recall, updates the box) ================= */
let typing = null; // { r, result }
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const fold = (x) => x.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").trim();
export function checkTyped(w, input) {
  const want = keyOf(w); const arts = isNoun(w.p) ? w.p.split(",").map((a) => a.trim()) : [];
  let s = input.trim().replace(/\s+/g, " "), art = "";
  const m = s.match(/^(der|die|das)\s+(.+)$/i); if (m) { art = m[1].toLowerCase(); s = m[2]; }
  const d = lev(fold(s), fold(want));
  const wordOk = d === 0 || (want.length >= 6 && d === 1);
  const artOk = !arts.length || arts.includes(art);
  let synonym = null;
  if (!wordOk) { // another dictionary word with the same meaning also counts (e.g. Arzt for "doctor")
    const tokens = (x) => new Set(x.e.toLowerCase().split(/[,;()]/).map((t) => t.replace(/^to /, "").trim()).filter((t) => t.length > 2));
    const mine = tokens(w);
    const other = WORDS.find((x) => x.r !== w.r && fold(keyOf(x)) === fold(s) && [...tokens(x)].some((t) => mine.has(t)));
    if (other) { const oa = isNoun(other.p) ? other.p.split(",").map((a) => a.trim()) : []; if (!oa.length || oa.includes(art)) synonym = other; }
  }
  return { wordOk, artOk, typo: wordOk && d === 1, good: (wordOk && artOk) || !!synonym, missingArt: arts.length && !art, synonym };
}
export function renderSchreiben() {
  const deck = St.S.start ? St.dueDeck() : [];
  if (!deck.length) { main().innerHTML = `<div class="deck"><div class="panel empty"><div class="big">✓</div><h2>Keine Karten fällig</h2><p>Lerne neue Wörter oder mach ein Quiz.</p><div class="row" style="justify-content:center"><a class="btn" href="#themen">Themen</a><a class="btn primary" href="#quiz">Quiz</a></div></div></div>`; return; }
  const r = typing && !typing.result && deck.includes(typing.r) ? typing.r : deck[0];
  if (!typing || typing.r !== r) typing = { r, result: null };
  const w = BY.get(r);
  main().innerHTML = `<div class="deck"><div class="deckbar"><span><b class="mono" style="color:var(--fg)">${deck.length}</b> fällig</span><a class="btn ghost" href="#ueben">Beenden</a></div>
    <div class="panel qcard">${tile(w, "", { photo: true })}<span class="lbl">${esc(posLabel(w))}${isNoun(w.p) ? " · mit Artikel" : ""}</span>${H.gloss(w, "gloss-big")}</div>
    <form id="typeForm" class="typeform" autocomplete="off"><input id="typeIn" class="input big" lang="de" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${isNoun(w.p) ? "z. B. der Tisch" : "Deutsches Wort"}" ${typing.result ? "disabled" : ""} value="${esc(typing.input || "")}">
      <div class="umlauts">${["ä", "ö", "ü", "ß"].map((c) => `<button type="button" class="btn" data-ins="${c}">${c}</button>`).join("")}<button class="btn primary" type="submit">${typing.result ? "Weiter" : "Prüfen"}</button></div></form>
    <div id="typeRes">${typing.result ? typeResult(w, typing.result) : ""}</div></div>`;
  attachPhotos(main()); if (!typing.result) $("typeIn").focus(); else $("typeForm").querySelector("[type=submit]").focus();
}
function typeResult(w, res) {
  const msg = res.synonym ? `Auch richtig! Gesucht war aber:` : res.good ? (res.typo ? "Richtig – kleiner Tippfehler" : "Richtig!") : res.wordOk && !res.artOk ? (res.missingArt ? "Wort richtig – aber der Artikel fehlt" : "Wort richtig – falscher Artikel") : "Leider falsch";
  return `<div class="panel pad tres ${res.good ? "good" : "bad"}"><b>${msg}</b><div class="row" style="gap:8px"><span class="word">${wordHTML(w)}</span>${H.spkBtn(sayText(w))}</div>${H.sentHTML(w.r, { full: false })}</div>`;
}
function submitTyping() {
  if (!typing) return; const w = BY.get(typing.r);
  if (typing.result) { St.answer(typing.r, typing.result.good); typing = null; renderSchreiben(); getSentences(St.dueDeck().slice(0, 4)); return; }
  const v = $("typeIn").value; if (!v.trim()) return; typing.input = v;
  typing.result = checkTyped(w, v); vib(typing.result.good ? 15 : [30, 40, 30]); H.speak(sayText(w)); getSentences([w.r]); renderSchreiben();
}

/* ================= der · die · das ================= */
let art = null; // { deck, i, ok, streak, best, locked }
export function renderArtikel() {
  leave();
  if (!art || art.i >= art.deck.length) {
    if (art && art.i >= art.deck.length) return renderArtikelEnd();
    const single = (r) => { const w = BY.get(r); return w && isNoun(w.p) && !w.p.includes(","); };
    let pool = [...learnedPool(), ...St.S.today.ranks].filter(single);
    if (pool.length < 15) pool = pool.concat(WORDS.filter((w) => w.r <= Math.max(St.S.cursor || 400, (St.S.start || 1) + 500)).map((w) => w.r).filter(single));
    art = { deck: shuffle([...new Set(pool)]).slice(0, 20), i: 0, ok: 0, streak: 0, best: 0, locked: false };
  }
  const w = BY.get(art.deck[art.i]);
  main().innerHTML = `<div class="deck"><div class="deckbar"><span><b>der · die · das</b> · ${art.i + 1}/${art.deck.length}</span><span class="small muted">Serie <b class="mono" style="color:var(--fg)">${art.streak}</b></span><a class="btn ghost" href="#ueben">Beenden</a></div>
    <div class="panel qcard">${tile(w, "", { photo: true })}<div class="word qword">${esc(keyOf(w))}</div>${H.gloss(w)}</div>
    <div class="arts">${["der", "die", "das"].map((a, k) => `<button class="artbtn a-${a}" data-art="${a}"><span class="kbd">${k + 1}</span>${a}</button>`).join("")}</div></div>`;
  attachPhotos(main());
}
function answerArt(a) {
  if (!art || art.locked) return; const w = BY.get(art.deck[art.i]); const right = w.p.trim() === a; art.locked = true;
  if (right) { art.ok++; art.streak++; art.best = Math.max(art.best, art.streak); } else art.streak = 0;
  art.i++; const cur = art;
  vib(right ? 15 : [30, 40, 30]);
  document.querySelectorAll(".artbtn").forEach((b) => { if (b.dataset.art === w.p.trim()) b.classList.add("right"); else if (b.dataset.art === a) b.classList.add("wrong"); b.disabled = true; });
  if (!right) H.speak(sayText(w));
  timers.push(setTimeout(() => { cur.locked = false; if (art === cur) renderArtikel(); }, right ? 500 : 1400));
}
function renderArtikelEnd() {
  St.logPractice(art.deck.length);
  main().innerHTML = `<div class="deck"><div class="panel empty"><div class="big">🎯</div><h2>${art.ok} von ${art.deck.length} richtig</h2><p>Längste Serie: ${art.best}</p><div class="row" style="justify-content:center"><a class="btn" href="#ueben">Zurück</a><button class="btn primary" data-act="artAgain">Nochmal</button></div></div></div>`;
}

/* ================= ERKLÄR'S! (pass-and-play, two teams) ================= */
let ex = { phase: "setup", teams: [{ name: "Team A", score: 0 }, { name: "Team B", score: 0 }], cur: 0, round: 1, rounds: 3, secs: 60, src: "level", deck: [], i: 0, left: 0, log: [] };
function exPool() {
  if (ex.src === "learned") { const p = learnedPool(); if (p.length >= 15) return p; }
  if (getTheme(ex.src)) return themeRanks(ex.src);
  return levelPool();
}
export function renderErklaer() {
  const T = ex.teams[ex.cur];
  if (ex.phase === "setup") {
    main().innerHTML = `<div class="deck"><div class="page-head"><div><h1>Erklär’s!</h1><p>Ein Handy, zwei Teams. Wer dran ist, erklärt das Wort <b>auf Deutsch</b> – ohne das Wort selbst oder Teile davon zu sagen. Das eigene Team rät.</p></div></div>
      <div class="panel settings-box">
        <label class="field">Team 1<input class="input" data-team="0" value="${esc(ex.teams[0].name)}" maxlength="20"></label>
        <label class="field">Team 2<input class="input" data-team="1" value="${esc(ex.teams[1].name)}" maxlength="20"></label>
        <div class="field">Wörter<select id="exSrc" class="input"><option value="level" ${ex.src === "level" ? "selected" : ""}>Mein Niveau (${levelOf()})</option><option value="learned" ${ex.src === "learned" ? "selected" : ""}>Meine gelernten Wörter</option>${[...PACKS, ...userThemes(), ...THEMES].map((t) => `<option value="${t.id}" ${ex.src === t.id ? "selected" : ""}>${t.emoji} ${esc(t.name)}</option>`).join("")}</select></div>
        <div class="field">Zeit pro Runde<div class="seg">${[45, 60, 90].map((s) => `<button data-exsecs="${s}" aria-pressed="${ex.secs === s}">${s} s</button>`).join("")}</div></div>
        <div class="field">Runden pro Team<div class="seg">${[2, 3, 5].map((s) => `<button data-exrounds="${s}" aria-pressed="${ex.rounds === s}">${s}</button>`).join("")}</div></div>
      </div><button class="btn primary block big" data-act="exStart">Spiel starten</button></div>`;
    return;
  }
  if (ex.phase === "ready") {
    main().innerHTML = `<div class="deck"><div class="panel empty"><span class="lbl">Runde ${ex.round} von ${ex.rounds}</span><h2 style="font-size:1.6rem">${esc(T.name)} ist dran</h2><p>Gib das Handy der Person, die erklärt. Die anderen schauen nicht auf den Bildschirm.</p>
      ${scoreboard()}<button class="btn primary big" data-act="exGo">Los – ${ex.secs} Sekunden</button></div></div>`;
    return;
  }
  if (ex.phase === "play") {
    const w = BY.get(ex.deck[ex.i % ex.deck.length]); const s = SENT[w.r] || {};
    const taboo = [s.syn, s.ant].filter(Boolean);
    main().innerHTML = `<div class="deck"><div class="deckbar"><b>${esc(T.name)}</b><span class="timer mono" id="exTimer">${ex.left}</span><span class="small muted">Punkte diese Runde: <b class="mono" style="color:var(--fg)">${ex.log.filter((x) => x.ok).length}</b></span></div>
      <div class="panel qcard excard">${tile(w)}<div class="word qword">${wordHTML(w)}</div>${H.gloss(w)}${taboo.length ? `<div class="small muted">Auch nicht sagen: <b>${taboo.map(esc).join(", ")}</b></div>` : ""}</div>
      <div class="answer"><button class="btn big" data-act="exSkip">Überspringen</button><button class="btn primary big" data-act="exOk">Erraten ✓</button></div></div>`;
    return;
  }
  if (ex.phase === "turnEnd") {
    const pts = ex.log.filter((x) => x.ok).length;
    main().innerHTML = `<div class="deck"><div class="panel pad"><h2>Zeit um! ${esc(T.name)}: +${pts}</h2><ul class="exlog">${ex.log.map((x) => `<li class="${x.ok ? "ok" : "no"}">${x.ok ? "✓" : "–"} <span class="word" style="font-size:1rem">${wordHTML(BY.get(x.r))}</span>${H.gloss(BY.get(x.r))}</li>`).join("") || "<li class='muted'>Keine Wörter</li>"}</ul>${scoreboard()}
      <button class="btn primary block big" data-act="exNext">${ex.cur === 1 && ex.round >= ex.rounds ? "Ergebnis zeigen" : "Nächstes Team"}</button></div></div>`;
    return;
  }
  const [a, b] = ex.teams; const win = a.score === b.score ? "Unentschieden!" : `${esc((a.score > b.score ? a : b).name)} gewinnt!`;
  main().innerHTML = `<div class="deck"><div class="panel empty"><div class="big">🏆</div><h2>${win}</h2>${scoreboard()}<div class="row" style="justify-content:center"><button class="btn" data-act="exSetup">Einstellungen</button><button class="btn primary" data-act="exRestart">Neues Spiel</button></div></div></div>`;
}
const scoreboard = () => `<div class="scoreboard">${ex.teams.map((t, k) => `<div class="${k === ex.cur ? "cur" : ""}"><span>${esc(t.name)}</span><b class="mono">${t.score}</b></div>`).join("")}</div>`;
function exTick() {
  ex.left--; const el = $("exTimer"); if (el) { el.textContent = ex.left; el.classList.toggle("low", ex.left <= 10); }
  if (ex.left <= 0) { leave(); vib([80, 60, 80]); ex.teams[ex.cur].score += ex.log.filter((x) => x.ok).length; ex.phase = "turnEnd"; renderErklaer(); }
}

/* ================= WORT-DUELL (online) ================= */
let duel = { code: "", data: null, setupSrc: "level" };
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join("");
const myName = () => (cloud.user?.displayName || (cloud.user?.email || "Spieler").split("@")[0]).slice(0, 40);
export function renderDuell(code) {
  if (!cloud.enabled || !cloud.user) {
    main().innerHTML = `<div class="deck"><div class="panel empty"><div class="big">⚔️</div><h2>Wort-Duell</h2><p>Für Duelle mit Freunden brauchst du ein Konto – damit beide Spieler verbunden werden.</p><button class="btn primary" data-act="account">Anmelden</button></div></div>`;
    if (code) duel.code = code.toUpperCase(); return;
  }
  code = (code || "").toUpperCase();
  if (!code) {
    main().innerHTML = `<div class="deck"><div class="page-head"><div><h1>Wort-Duell</h1><p>Beide bekommen dieselben 10 Fragen. Ihr könnt gleichzeitig oder nacheinander spielen – wer mehr richtig hat, gewinnt.</p></div></div>
      <div class="panel pad stack"><h2>Neues Duell</h2><div class="field">Wörter<select id="duelSrc" class="input"><option value="level">Mein Niveau (${levelOf()})</option><option value="learned">Meine gelernten Wörter</option>${[...PACKS, ...THEMES].map((t) => `<option value="${t.id}" ${duel.setupSrc === t.id ? "selected" : ""}>${t.emoji} ${esc(t.name)}</option>`).join("")}</select></div>
        <button class="btn primary block" data-act="duelCreate">Duell erstellen</button></div>
      <div class="panel pad stack" style="margin-top:12px"><h2>Einem Duell beitreten</h2><form id="joinForm" class="row"><input id="joinCode" class="input mono" style="flex:1;text-transform:uppercase" maxlength="6" placeholder="CODE" autocomplete="off"><button class="btn primary" type="submit">Beitreten</button></form></div></div>`;
    return;
  }
  if (duel.code !== code || !unsub) {
    leave(); duel.code = code; duel.data = null;
    main().innerHTML = `<div class="deck"><div class="panel pad"><div class="row"><span class="spinner"></span><span class="muted">Duell ${esc(code)} wird geladen …</span></div></div></div>`;
    unsub = cloud.watchDuel(code, async (d) => {
      if (!d) { main().innerHTML = `<div class="deck"><div class="panel empty"><h2>Duell nicht gefunden</h2><p>Prüfe den Code <b class="mono">${esc(code)}</b>.</p><a class="btn" href="#duell">Zurück</a></div></div>`; return; }
      const uid = cloud.user.uid;
      if (d.host !== uid && !d.guest) { try { await cloud.updateDuel(code, { guest: uid, guestName: myName(), state: "playing" }); } catch { H.toast("Beitreten nicht möglich"); } return; }
      if (d.host !== uid && d.guest !== uid) { main().innerHTML = `<div class="deck"><div class="panel empty"><h2>Dieses Duell ist schon voll</h2><a class="btn" href="#duell">Neues Duell</a></div></div>`; return; }
      const mine = d.host === uid ? "pA" : "pB", theirs = mine === "pA" ? "pB" : "pA";
      if ((d[mine] || []).length === d.qs.length && (d[theirs] || []).length === d.qs.length && d.state !== "done") cloud.updateDuel(code, { state: "done" }).catch(() => {});
      duel.data = d; drawDuel();
    });
    return;
  }
  drawDuel();
}
function drawDuel() {
  const d = duel.data; if (!d) return; const uid = cloud.user.uid; const isHost = d.host === uid;
  const mine = d[isHost ? "pA" : "pB"] || [], theirs = d[isHost ? "pB" : "pA"] || [];
  const oppName = isHost ? d.guestName || "wartet …" : d.hostName;
  const bar = `<div class="duelbar"><div><span class="small muted">Du</span><b class="mono">${mine.filter(Boolean).length}</b><span class="small muted">${mine.length}/${d.qs.length}</span></div><span class="vs">⚔️</span><div><span class="small muted">${esc(oppName)}</span><b class="mono">${theirs.filter(Boolean).length}</b><span class="small muted">${theirs.length}/${d.qs.length}</span></div></div>`;
  const share = isHost && !d.guest ? `<div class="panel pad stack sharebox"><b>Lade deinen Gegner ein</b><div class="code mono">${esc(duel.code)}</div><div class="row"><button class="btn" data-act="duelShare">Link teilen</button><button class="btn ghost" data-act="duelCopy">Code kopieren</button></div><span class="small muted">Du kannst schon anfangen – dein Gegner spielt dieselben Fragen.</span></div>` : "";
  if (mine.length >= d.qs.length) {
    const done = theirs.length >= d.qs.length; const a = mine.filter(Boolean).length, b = theirs.filter(Boolean).length;
    main().innerHTML = `<div class="deck">${bar}${share}<div class="panel pad"><h2>${done ? (a === b ? "Unentschieden!" : a > b ? "Du hast gewonnen! 🏆" : `${esc(oppName)} hat gewonnen`) : "Fertig – warte auf deinen Gegner …"}</h2>
      <ul class="exlog">${d.qs.map((q, i) => `<li><span>${mine[i] ? "✓" : "✗"}</span><span class="word" style="font-size:1rem">${wordHTML(BY.get(q.r))}</span>${H.gloss(BY.get(q.r))}<span class="small muted" style="margin-left:auto">Gegner ${i < theirs.length ? (theirs[i] ? "✓" : "✗") : "…"}</span></li>`).join("")}</ul>
      <div class="row end"><a class="btn primary" href="#duell">Neues Duell</a></div></div></div>`;
    return;
  }
  if (!quiz || quiz.mode !== "duel" || quiz.code !== duel.code) quiz = { qs: d.qs, i: mine.length, res: [...mine], mode: "duel", code: duel.code, locked: false };
  quiz.i = mine.length; quiz.res = [...mine];
  main().innerHTML = `<div class="deck">${bar}${share}${questionHTML(d.qs[quiz.i], quiz.i, d.qs.length)}</div>`;
}
async function duelCreate() {
  const src = $("duelSrc")?.value || "level"; duel.setupSrc = src;
  let pool = src === "learned" ? learnedPool().filter((r) => r <= 4034 || r >= 200001) : getTheme(src) ? themeRanks(src) : levelPool();
  if (pool.length < 10) pool = levelPool();
  const code = newCode(); const qs = makeQuestions(pool, 10);
  try { await cloud.createDuel(code, { hostName: myName(), guest: "", guestName: "", state: "waiting", qs, pA: [], pB: [], label: getTheme(src)?.name || (src === "learned" ? "Gelernte Wörter" : `Niveau ${levelOf()}`) }); location.hash = `duell/${code}`; }
  catch (e) { console.warn(e); H.toast("Duell konnte nicht erstellt werden – sind die Firestore-Regeln aktuell?"); }
}

/* ================= OWN THEMES WITH AI ================= */
let aiTheme = { request: "", units: 3, busy: false, err: "", draft: null };
const fold2 = (x) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").trim();
let DICTKEY = null;
function dictMatch(w, artIn = "") {
  if (!DICTKEY) { DICTKEY = new Map(); WORDS.forEach((x) => keyOf(x).split("/").forEach((k) => { const n = fold2(k); if (!DICTKEY.has(n)) DICTKEY.set(n, []); DICTKEY.get(n).push(x); })); }
  const c = DICTKEY.get(fold2(w)); if (!c) return null; const a = (artIn || "").split(",")[0].trim();
  return a ? c.find((x) => x.p.split(",")[0].trim() === a) || null : c.find((x) => !isNoun(x.p)) || null;
}
function aiThemeHTML() {
  if (aiTheme.busy) return `<div class="row" style="gap:10px"><span class="spinner"></span><span class="muted">Die KI baut dein Thema … (10–30 Sekunden)</span></div>`;
  if (aiTheme.err) return `<div class="note">${esc(aiTheme.err)}</div>`;
  const t = aiTheme.draft; if (!t) return "";
  return `<div class="draft"><h2>${esc(t.emoji)} ${esc(t.name)}</h2><p class="muted small" style="margin:2px 0 10px">${esc(t.desc)}</p>
    ${t.units.map((u, i) => `<div class="draftunit"><b>Lektion ${i + 1} · ${esc(u.title)}</b><div class="small">${u.words.map((w) => { const m = dictMatch(w.w, w.art); return `<span class="dw${m ? " indict" : ""}" title="${m ? "Im Wörterbuch #" + m.r : "Neues Wort"}">${w.art ? `<span class="g-${w.art.split(",")[0].trim()}">${esc(w.art.split(",")[0].trim())}</span> ` : ""}${esc(w.w)}</span>`; }).join(", ")}</div></div>`).join("")}
    <p class="small muted">Unterstrichen = schon im Wörterbuch, wird verknüpft.</p>
    <div class="row end"><button class="btn ghost" data-act="aiThemeDrop">Verwerfen</button><button class="btn primary" data-act="aiThemeSave">Thema speichern</button></div></div>`;
}
const drawAiTheme = () => { const el = $("aiThemeOut"); if (el) el.innerHTML = aiThemeHTML(); };
async function aiThemeGo() {
  const req = ($("aiThemeReq")?.value || aiTheme.request).trim(); aiTheme.request = req;
  if (req.length < 3) { H.toast("Bitte beschreibe kurz dein Thema"); return; }
  aiTheme.busy = true; aiTheme.err = ""; aiTheme.draft = null; drawAiTheme();
  try {
    const res = await aiCall("theme", { request: req, units: aiTheme.units, level: levelOf(), exclude: [] });
    const t = res && res.name ? res : null; if (!t) throw new Error("err");
    t.units = (t.units || []).filter((u) => u.words?.length); aiTheme.draft = t;
  } catch (e) { aiTheme.err = { auth: "Für KI-Themen bitte anmelden.", limited: "Die KI ist gerade ausgelastet – bitte gleich nochmal.", off: "Die KI ist auf diesem Server nicht eingerichtet." }[e.message] || "Das hat nicht geklappt – bitte nochmal versuchen."; }
  aiTheme.busy = false; drawAiTheme();
}
function aiThemeSave() {
  const t = aiTheme.draft; if (!t) return;
  const own = new Map(Object.entries(St.S.custom || {}).map(([id, c]) => [fold2(c.w) + "|" + (c.art || ""), Number(id)]));
  const units = t.units.map((u) => ({ title: u.title, ids: [...new Set(u.words.map((w) => {
    const m = dictMatch(w.w, w.art); if (m) return m.r;
    const k = fold2(w.w) + "|" + (w.art || ""); if (own.has(k)) return own.get(k);
    const id = St.addCustom({ w: w.w, art: w.art, pos: w.pos, e: w.e, ar: w.ar, topic: t.name, s: null }, { learn: false });
    St.S.custom[id].emoji = w.emoji || ""; own.set(k, id); return id;
  }))] }));
  const id = St.saveUserTheme({ name: t.name, emoji: t.emoji, desc: t.desc, request: aiTheme.request, units });
  St.registerCustom(); aiTheme = { request: "", units: aiTheme.units, busy: false, err: "", draft: null };
  location.hash = `thema/${id}`; H.toast("Thema gespeichert");
}

/* ================= events from main.js ================= */
export function onClick(t) {
  const d = t.dataset;
  if (d.path) { St.setPath(d.path, d.themeId || ""); H.toast(d.path === "theme" ? `Neue Wörter kommen jetzt aus „${getTheme(d.themeId).name}“` : "Neue Wörter kommen nach Häufigkeit"); location.hash.startsWith("#thema") ? renderThema(d.themeId) : renderThemen(); return true; }
  if (d.unit) { les = null; startLesson(d.unit); return true; }
  if (d.quizUnit) { les = null; startLesson(d.quizUnit, { intro: false }); return true; }
  if (d.quizTheme) { const seen = themeRanks(d.quizTheme).filter((r) => St.S.learn[r] || St.S.known[r]); startQuiz(seen.length >= 8 ? seen : themeRanks(d.quizTheme).slice(0, 40), getTheme(d.quizTheme).name); return true; }
  if (d.opt !== undefined && quiz) { answerOpt(Number(d.opt), (right) => { if (quiz.mode === "solo") renderQuiz(); else if (quiz.mode === "lesson") { if (les) renderLektion(les.uid); } else { const isHost = duel.data.host === cloud.user.uid; const key = isHost ? "pA" : "pB"; const arr = [...(duel.data[key] || []), right ? 1 : 0]; duel.data[key] = arr; drawDuel(); cloud.updateDuel(duel.code, { [key]: arr }).catch(() => H.toast("Antwort nicht gespeichert – Verbindung?")); if (arr.length === duel.data.qs.length) St.logPractice(arr.length); } }); return true; }
  if (d.missed) { d.missed.split(",").map(Number).forEach((r) => St.learnWord(r)); H.toast("In den Karteikasten gelegt"); t.disabled = true; return true; }
  if (d.ins) { const i = $("typeIn"); if (i && !i.disabled) { const p = i.selectionStart ?? i.value.length; i.value = i.value.slice(0, p) + d.ins + i.value.slice(p); i.focus(); i.setSelectionRange(p + 1, p + 1); } return true; }
  if (d.art) { answerArt(d.art); return true; }
  if (d.ain) { aiTheme.units = Number(d.ain); document.querySelectorAll("[data-ain]").forEach((b) => b.setAttribute("aria-pressed", String(b === t))); return true; }
  if (d.exsecs) { ex.secs = Number(d.exsecs); renderErklaer(); return true; }
  if (d.exrounds) { ex.rounds = Number(d.exrounds); renderErklaer(); return true; }
  switch (d.act) {
    case "quizAgain": renderQuizAgain(); return true;
    case "lesNext": if (les) { if (les.k < les.intro.length - 1) les.k++; else lessonQuiz(); renderLektion(les.uid); } return true;
    case "lesPrev": if (les && les.k > 0) { les.k--; renderLektion(les.uid); } return true;
    case "lesSkip": if (les) { lessonQuiz(); renderLektion(les.uid); } return true;
    case "artAgain": art = null; renderArtikel(); return true;
    case "exStart": { const src = $("exSrc")?.value; if (src) ex.src = src; ex.deck = shuffle(exPool()); ex.i = 0; ex.round = 1; ex.cur = 0; ex.teams.forEach((x) => (x.score = 0)); ex.phase = "ready"; renderErklaer(); getSentences(ex.deck.slice(0, 40).filter((r) => r <= 4034)); return true; }
    case "exGo": ex.phase = "play"; ex.left = ex.secs; ex.log = []; leave(); timers.push(setInterval(exTick, 1000)); renderErklaer(); return true;
    case "exOk": case "exSkip": ex.log.push({ r: ex.deck[ex.i % ex.deck.length], ok: d.act === "exOk" }); ex.i++; vib(d.act === "exOk" ? 20 : 10); renderErklaer(); return true;
    case "exNext": if (ex.cur === 1) ex.round++; ex.cur = 1 - ex.cur; ex.phase = ex.round > ex.rounds ? "end" : "ready"; renderErklaer(); return true;
    case "exRestart": ex.teams.forEach((x) => (x.score = 0)); ex.round = 1; ex.cur = 0; ex.deck = shuffle(exPool()); ex.i = 0; ex.phase = "ready"; renderErklaer(); return true;
    case "exSetup": ex.phase = "setup"; renderErklaer(); return true;
    case "duelCreate": duelCreate(); return true;
    case "aiThemeGo": aiThemeGo(); return true;
    case "aiThemeSave": aiThemeSave(); return true;
    case "aiThemeDrop": aiTheme.draft = null; drawAiTheme(); return true;
    case "aiThemeDel": if (confirm("Dieses Thema löschen? Bereits gelernte Wörter bleiben im Karteikasten.")) { St.deleteUserTheme(d.themeId); location.hash = "themen"; } return true;
    case "duelShare": { const url = `${location.origin}/#duell/${duel.code}`; const text = `Wort-Duell auf Wortschatz 4034 – mach mit! Code: ${duel.code}`; if (navigator.share) navigator.share({ title: "Wort-Duell", text, url }).catch(() => {}); else { navigator.clipboard?.writeText(`${text} ${url}`); H.toast("Link kopiert"); } return true; }
    case "duelCopy": navigator.clipboard?.writeText(duel.code).then(() => H.toast("Code kopiert")).catch(() => {}); return true;
  }
  return false;
}
function renderQuizAgain() { const src = quiz?.src; const pool = quiz ? quiz.qs.map((q) => q.r) : []; quiz = null; if (src && src !== "Gelernte Wörter" && pool.length >= 4) { const p = Object.values(THEME).find((t) => src.startsWith(t.name)); startQuiz(p ? themeRanks(p.id).filter((r) => St.S.learn[r] || St.S.known[r] || pool.includes(r)) : pool, src); } else renderQuiz(); }
export function onSubmit(e) {
  if (e.target.id === "typeForm") { e.preventDefault(); submitTyping(); return true; }
  if (e.target.id === "qTypeForm") { e.preventDefault(); submitQuizTyping(() => (quiz?.mode === "lesson" && les ? renderLektion(les.uid) : renderQuiz())); return true; }
  if (e.target.id === "joinForm") { e.preventDefault(); const c = $("joinCode").value.trim().toUpperCase(); if (c.length === 6) location.hash = `duell/${c}`; else H.toast("Der Code hat 6 Zeichen"); return true; }
  return false;
}
export function onInput(e) {
  if (e.target.id === "aiThemeReq") { aiTheme.request = e.target.value; return true; } if (e.target.dataset?.team) { ex.teams[Number(e.target.dataset.team)].name = e.target.value || `Team ${Number(e.target.dataset.team) + 1}`; return true; } return false; }
export function onKey(e, view) {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return false;
  if (view === "lektion" && les?.phase === "intro") {
    const btn = e.key === "ArrowRight" || (e.key === "Enter" && document.activeElement?.tagName !== "BUTTON") ? "lesNext" : e.key === "ArrowLeft" ? "lesPrev" : "";
    if (btn) { document.querySelector(`[data-act="${btn}"]:not([disabled])`)?.click(); return true; }
  }
  if ((view === "quiz" || view === "duell" || view === "lektion") && /^[1-4]$/.test(e.key)) { const b = document.querySelector(`.opt[data-opt="${Number(e.key) - 1}"]`); if (b && !b.disabled) b.click(); return true; }
  if (view === "artikel" && /^[1-3]$/.test(e.key)) { answerArt(["der", "die", "das"][Number(e.key) - 1]); return true; }
  return false;
}
export const pendingDuel = () => duel.code;
/** Sentences arrived from the AI: refresh the open result panel. */
export function refreshSentences(view) {
  if (view === "schreiben" && typing?.result && $("typeRes")) $("typeRes").innerHTML = typeResult(BY.get(typing.r), typing.result);
  if (view === "lektion" && les?.phase === "intro" && $("introSent")) $("introSent").innerHTML = H.sentHTML(les.intro[les.k]);
}
