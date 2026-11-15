// Learning state + spaced repetition (FSRS; ported from the original single-file Leitner app, extended with streak/history/XP).
import RAW from "./data/words.json";
import AR from "./data/ar.json";
import { themeOrder, PACK_WORDS, setUserThemes } from "./themes.js";
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from "ts-fsrs";

export const MAXR = 4034;
export const INTERVAL = [0, 1, 2, 4, 8, 16, 32];
export const BY = new Map(RAW.map((w) => [w[0], { r: w[0], w: w[1], p: w[2], e: w[3], ar: AR[w[0]] || "" }]));
export const WORDS = [...BY.values()];
export const CUSTOM_BASE = 100001; // ids of the learner's own words start here
export const LEVELS = [
  [1, "A1", "Anfang", "from word #1"],
  [400, "A2", "ab Rang 400", "skip the first 399"],
  [900, "B1", "ab Rang 900", "skip the first 899"],
  [1600, "B2", "ab Rang 1600", "skip the first 1599"],
  [2500, "C1", "ab Rang 2500", "skip the first 2499"],
];

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const today = () => fmt(new Date());
export const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return fmt(new Date(y, m - 1, d + n)); };

export const fresh = () => ({
  v: 2, start: 0, cursor: 1, goal: 10, known: {}, learn: {}, today: { date: "", ranks: [] },
  hist: {}, streak: { n: 0, last: "" }, xp: 0, updated: 0,
  lang: "en", custom: {}, nextCustom: CUSTOM_BASE,
  path: { mode: "freq", theme: "" }, themes: {},
  board: { visible: false, name: "" }, // leaderboard opt-in + display name
  used: {}, pats: {}, // Sätze: points per word for using it in a sentence (2 = can use it), practised sentence patterns // where new daily words come from: frequency order or one theme
});

export let S = fresh();
export function replaceState(next) { S = Object.assign(fresh(), next || {}); registerCustom(); return S; }

/* ---------- the learner's own words ---------- */
const POSMAP = { noun: "", verb: "verb", adj: "adj", adv: "adv", prep: "prep", conj: "conj", pron: "pron", num: "num", part: "part", interj: "interj", phrase: "phrase" };
function customToWord(id, c, extra = { custom: true }) {
  const p = c.art ? c.art : POSMAP[c.pos] ?? "phrase";
  return { r: Number(id), w: c.w, p: p || "phrase", e: c.e || "", ar: c.ar || "", emoji: c.s?.emoji || c.emoji || "", s: c.s || null, topic: c.topic || "", ...extra };
}
// exam-pack words (FSP) are part of the app, not of the learner's state
PACK_WORDS.forEach((c, id) => BY.set(id, customToWord(id, c, { pack: c.pack })));
export const packWords = () => [...PACK_WORDS.keys()].map((id) => BY.get(id));
export function registerCustom() {
  for (const r of [...BY.keys()]) if (r >= CUSTOM_BASE && !PACK_WORDS.has(r)) BY.delete(r);
  setUserThemes(S.themes);
  Object.entries(S.custom || {}).forEach(([id, c]) => BY.set(Number(id), customToWord(id, c)));
}
export const customWords = () => [...BY.values()].filter((w) => w.custom).sort((a, b) => (S.custom[b.r]?.added || 0) - (S.custom[a.r]?.added || 0));
export function addCustom(c, { learn = true } = {}) {
  const id = S.nextCustom || CUSTOM_BASE; S.nextCustom = id + 1;
  S.custom[id] = { w: c.w, art: c.art || "", pos: c.pos || "", e: c.e || "", ar: c.ar || "", topic: c.topic || "", s: c.s || null, added: Date.now() };
  BY.set(id, customToWord(id, S.custom[id])); if (learn) addLearn([id]);
  return id;
}
export function removeCustom(id) { delete S.custom[id]; delete S.learn[id]; delete S.known[id]; BY.delete(Number(id)); save(); }

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); }
export function save() { S.updated = Date.now(); listeners.forEach((fn) => fn(S)); }

const isTaken = (r) => S.known[r] || S.learn[r] || S.today.ranks.includes(r);
export function pull(n) {
  const out = [];
  if (S.path?.mode === "theme" && S.path.theme) {
    for (const r of themeOrder(S.path.theme, S.start || 1)) { if (out.length >= n) break; if (!isTaken(r)) out.push(r); }
    if (out.length >= n) return out; // theme exhausted → top up from the frequency list
  }
  let r = Math.max(S.cursor, 1);
  while (out.length < n && r <= MAXR) { if (BY.has(r) && !isTaken(r) && !out.includes(r)) out.push(r); r++; }
  S.cursor = r; return out;
}
export function peek(n) {
  const out = []; let r = Math.max(S.cursor, 1);
  while (out.length < n && r <= MAXR) { if (BY.has(r) && !isTaken(r)) out.push(r); r++; }
  return out;
}
export function addLearn(ranks) { const t = today(); ranks.forEach((r) => { if (!S.learn[r]) S.learn[r] = { b: 0, due: t, d: t }; }); }
export function ensureToday() {
  if (!S.start) return false;
  const t = today();
  if (S.today.date === t) return false;
  S.today = { date: t, ranks: [] };
  const nr = pull(S.goal || 10); S.today.ranks = nr; addLearn(nr); save();
  return true;
}
/** "Kenne ich": the word leaves the card box but stays in today's list (marked), so the day keeps its size. */
export function markKnown(r) { delete S.learn[r]; S.known[r] = 1; bump(1); save(); }
export function unmarkKnown(r) { delete S.known[r]; addLearn([r]); save(); }
export function learnWord(r) { if (S.known[r]) delete S.known[r]; addLearn([r]); save(); }
/** Put a lesson's words into today's list and the box (skips words already known or in the box). */
export function startUnit(ranks) {
  ensureToday();
  const fresh = ranks.filter((r) => BY.has(r) && !isTaken(r));
  S.today.ranks.push(...fresh); addLearn(fresh); save(); return fresh;
}
export function setPath(mode, theme = "") { S.path = { mode, theme }; save(); }
export function moreWords(n = 10) { const got = pull(n); S.today.ranks.push(...got); addLearn(got); save(); return got; }
export function setStart(r) {
  const first = !S.start; S.start = r; S.cursor = r;
  if (first) { S.today = { date: "", ranks: [] }; ensureToday(); } else save();
}
export function dueDeck() {
  const t = today();
  return Object.keys(S.learn).map(Number).filter((r) => S.learn[r].due <= t)
    .sort((a, b) => (S.learn[a].lap || 0) - (S.learn[b].lap || 0) || S.learn[a].b - S.learn[b].b || a - b);
}
/* ---------- spaced repetition: FSRS (target retention 90 %) ----------
   Each card in S.learn keeps its FSRS memory state in L.f = { s: stability, d: difficulty, st: state, n: reps, l: lapses, t: last review ms, due: ms }.
   L.due stays a local date string (what dueDeck compares) and L.b a box 0–6 derived from stability, so the box chart and lesson status keep working. */
export const GRADES = [[1, "Nochmal"], [2, "Schwer"], [3, "Gut"], [4, "Leicht"]];
const F = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true, maximum_interval: 3650 }));
const DAY = 86400000;
const boxOf = (stab) => { let b = 0; while (b < 6 && stab >= INTERVAL[b + 1]) b++; return b; };
/** FSRS card from a stored entry; old Leitner boxes become a review card whose stability equals the box interval. */
function cardOf(L, now) {
  if (L.f) return { ...createEmptyCard(now), stability: L.f.s, difficulty: L.f.d, state: L.f.st, reps: L.f.n, lapses: L.f.l, last_review: L.f.t ? new Date(L.f.t) : undefined, due: new Date(L.f.due), learning_steps: L.f.ls || 0 };
  if (!L.b) return createEmptyCard(now);
  const iv = INTERVAL[Math.min(L.b, 6)]; const [y, m, d] = (L.due || today()).split("-").map(Number); const due = new Date(y, m - 1, d, 4);
  return { ...createEmptyCard(now), state: State.Review, stability: iv, difficulty: 5, reps: L.b, last_review: new Date(due.getTime() - iv * DAY), due, scheduled_days: iv };
}
const gradeOf = (g) => (g === true ? Rating.Good : g === false ? Rating.Again : Math.min(4, Math.max(1, Number(g) || 1)));
function store(L, c) {
  L.f = { s: +c.stability.toFixed(3), d: +c.difficulty.toFixed(3), st: c.state, n: c.reps, l: c.lapses, t: c.last_review ? c.last_review.getTime() : Date.now(), due: c.due.getTime(), ls: c.learning_steps || 0 };
  L.due = fmt(c.due); L.b = c.state === State.Review ? boxOf(c.stability) : 0;
}
/** What each grade would do now: { 1: {days, label}, … } for the buttons. */
export function preview(r) {
  const L = S.learn[r]; if (!L) return {}; const now = new Date(); const rec = F.repeat(cardOf(L, now), now); const out = {};
  for (const [g] of GRADES) { const due = rec[g].card.due; const days = Math.round((due - now) / DAY); const mins = Math.round((due - now) / 60000);
    out[g] = { days, label: days >= 1 ? (days >= 60 ? `${Math.round(days / 30)} Mon.` : `${days} ${days === 1 ? "Tag" : "Tage"}`) : mins < 60 ? `${Math.max(1, mins)} Min.` : "heute" }; }
  return out;
}
/** Grade a card: true/false (Gut/Nochmal) or 1–4 (Nochmal/Schwer/Gut/Leicht). */
export function answer(r, grade) {
  const L = S.learn[r]; if (!L) return; const g = gradeOf(grade); const now = new Date();
  store(L, F.next(cardOf(L, now), now, g).card);
  L.lap = Date.now();
  bump(g >= Rating.Good ? 2 : 1); save();
}
/** Memory details for the word sheet and card back. */
export function memory(r) {
  const L = S.learn[r]; if (!L?.f) return null;
  const now = new Date(); let R = 1; try { R = F.retrievability(cardOf(L, now), now); } catch {}
  return { stability: L.f.s, difficulty: L.f.d, reps: L.f.n, lapses: L.f.l, recall: Math.round(Math.min(1, R) * 100) };
}
/** Quiz results per word: after two right answers the quizzes ask the word as typed recall. */
export function quizMark(r, ok) { const L = S.learn[r]; if (!L) return; L.qc = ok ? Math.min((L.qc || 0) + 1, 9) : Math.max(0, (L.qc || 0) - 1); }
export function retire(r) { delete S.learn[r]; S.known[r] = 1; bump(1); save(); }

// activity: reviews per day, streak, XP
function bump(xp) {
  const t = today();
  S.hist[t] = (S.hist[t] || 0) + 1;
  S.xp = (S.xp || 0) + xp;
  if (S.streak.last !== t) {
    S.streak.n = S.streak.last === addDays(t, -1) ? S.streak.n + 1 : 1;
    S.streak.last = t;
  }
  // keep ~1 year of history
  const keys = Object.keys(S.hist); if (keys.length > 380) keys.sort().slice(0, keys.length - 380).forEach((k) => delete S.hist[k]);
}
/** Practice outside the flashcard box (quiz, games): counts towards activity, streak and points. */
export function logPractice(n = 1) { for (let i = 0; i < n; i++) bump(1); save(); }
export function streakNow() { const t = today(); return S.streak.last === t || S.streak.last === addDays(t, -1) ? S.streak.n : 0; }
export function wordState(r) {
  if (S.known[r]) return "known";
  if (S.today.ranks.includes(r)) return "today";
  if (S.learn[r]) return "learn";
  return "new";
}
export function stats() {
  const t = S.today.ranks.length;
  const done = S.today.ranks.filter((r) => S.known[r] || (S.learn[r] && (S.learn[r].b > 0 || S.learn[r].lap))).length;
  return { todayTotal: t, todayDone: done, learning: Object.keys(S.learn).length, known: Object.keys(S.known).length, due: dueDeck().length, streak: streakNow(), xp: S.xp || 0 };
}

// v1 → v2 migration (old single-file app used localStorage "wz4034")
export function migrate(x) {
  if (!x || typeof x !== "object") return null;
  if (x.v === 1) return Object.assign(fresh(), x, { v: 2 });
  if (x.v === 2) return Object.assign(fresh(), x);
  return null;
}

/* ---------- own AI themes ---------- */
export function saveUserTheme(t) {
  const id = "u" + Date.now().toString(36);
  S.themes[id] = { name: t.name, emoji: t.emoji, desc: t.desc, request: t.request, created: Date.now(), units: t.units };
  setUserThemes(S.themes); save(); return id;
}
export function deleteUserTheme(id) {
  const t = S.themes[id]; if (!t) return;
  delete S.themes[id];
  // drop own words that only existed for this theme and were never studied
  const still = new Set(Object.values(S.themes).flatMap((x) => x.units.flatMap((u) => u.ids)));
  t.units.flatMap((u) => u.ids).forEach((r) => { if (r >= CUSTOM_BASE && S.custom[r] && !S.learn[r] && !S.known[r] && !still.has(r)) { delete S.custom[r]; BY.delete(r); } });
  if (S.path?.theme === id) S.path = { mode: "freq", theme: "" };
  setUserThemes(S.themes); save();
}
