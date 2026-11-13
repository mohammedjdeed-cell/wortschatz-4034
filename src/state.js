// Learning state + Leitner queue logic (ported from the original single-file app, extended with streak/history/XP).
import RAW from "./data/words.json";
import AR from "./data/ar.json";
import { themeOrder, PACK_WORDS, setUserThemes } from "./themes.js";

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
  path: { mode: "freq", theme: "" }, themes: {}, // where new daily words come from: frequency order or one theme
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
export function markKnown(r) {
  delete S.learn[r]; S.known[r] = 1;
  const i = S.today.ranks.indexOf(r); let nr = null;
  if (i >= 0) {
    const n = pull(1);
    if (n.length) { nr = n[0]; S.today.ranks.splice(i, 1, nr); addLearn([nr]); } else S.today.ranks.splice(i, 1);
  }
  bump(1); save(); return nr;
}
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
export function answer(r, good) {
  const L = S.learn[r]; if (!L) return;
  if (good) { L.b = Math.min(L.b + 1, 6); L.due = addDays(today(), INTERVAL[L.b]); } else { L.b = 0; L.due = today(); }
  L.lap = Date.now();
  bump(good ? 2 : 1); save();
}
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
