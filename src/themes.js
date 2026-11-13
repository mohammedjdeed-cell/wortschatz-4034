// Situational themes + level-ordered lessons ("Lektionen") over the 4034-word frequency list.
// Why situational and not semantic sets: learning near-synonyms or one word family together (all colours,
// all body parts at once) causes interference; words that co-occur in one situation are remembered better.
import CAT from "./data/cat.json";
import PACKS_RAW from "./data/packs.json";

export const THEMES = [
  { id: "medizin", name: "Medizin & Klinik", emoji: "🩺", desc: "Arzt, Patient, Behandlung" },
  { id: "koerper", name: "Körper & Gesundheit", emoji: "🫀", desc: "Körperteile, Sinne, Befinden" },
  { id: "sprechen", name: "Sprechen & Denken", emoji: "🗣️", desc: "sagen, fragen, erklären" },
  { id: "menschen", name: "Menschen & Familie", emoji: "👨‍👩‍👧", desc: "Familie, Freunde, Beziehungen" },
  { id: "gefuehle", name: "Gefühle & Charakter", emoji: "💭", desc: "Angst, Freude, hoffen" },
  { id: "zeit", name: "Zeit & Kalender", emoji: "⏰", desc: "heute, oft, Woche, früh" },
  { id: "zahlen", name: "Zahlen & Mengen", emoji: "🔢", desc: "viel, Prozent, Hälfte" },
  { id: "raum", name: "Orte & Bewegung", emoji: "🧭", desc: "kommen, oben, Weg, links" },
  { id: "alltag", name: "Alltag & Handeln", emoji: "🛠️", desc: "machen, nehmen, brauchen" },
  { id: "wohnen", name: "Haus & Wohnen", emoji: "🏠", desc: "Zimmer, Tür, Bett" },
  { id: "essen", name: "Essen & Trinken", emoji: "🍽️", desc: "Brot, kochen, Kaffee" },
  { id: "arbeit", name: "Arbeit & Beruf", emoji: "💼", desc: "Chef, Firma, Kollege" },
  { id: "geld", name: "Geld & Wirtschaft", emoji: "💶", desc: "kaufen, teuer, Kosten" },
  { id: "bildung", name: "Bildung & Wissenschaft", emoji: "🎓", desc: "Studie, lernen, Forschung" },
  { id: "reisen", name: "Verkehr & Reisen", emoji: "🚆", desc: "Zug, fahren, Reise" },
  { id: "natur", name: "Natur & Wetter", emoji: "🌿", desc: "Baum, Tier, Sonne" },
  { id: "technik", name: "Technik & Material", emoji: "⚙️", desc: "Gerät, Strom, Computer" },
  { id: "staat", name: "Staat & Recht", emoji: "⚖️", desc: "Gesetz, Behörde, Polizei" },
  { id: "gesellschaft", name: "Gesellschaft & Kultur", emoji: "🎭", desc: "Medien, Sport, Kunst" },
  { id: "eigenschaften", name: "Beschreiben & Bewerten", emoji: "🎨", desc: "groß, wichtig, einfach" },
  { id: "abstrakt", name: "Begriffe & Argumente", emoji: "🧠", desc: "Problem, Ergebnis, Grund" },
  { id: "basis", name: "Kleine Wörter", emoji: "🧩", desc: "Artikel, Pronomen, Präpositionen" },
];
export const THEME = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const BANDS = [
  { id: "A1", from: 1, to: 399 }, { id: "A2", from: 400, to: 899 }, { id: "B1", from: 900, to: 1599 },
  { id: "B2", from: 1600, to: 2499 }, { id: "C1", from: 2500, to: 4034 },
];
export const bandOf = (r) => (BANDS.find((b) => r >= b.from && r <= b.to) || BANDS[4]).id;
/* ---------- exam packs (FSP) and the learner's own AI themes ---------- */
export const PACK_BASE = 200001; // ids of pack words that are not in the 4034 list (stable: assigned in file order)
export const PACK_WORDS = new Map();
let nextPackId = PACK_BASE;
export const PACKS = PACKS_RAW.map((p) => ({
  id: p.id, name: p.name, emoji: p.emoji, desc: p.desc, kind: "pack",
  units: p.units.map((u, i) => ({
    id: `${p.id}~${i + 1}`, theme: p.id, n: i + 1, title: u.title,
    ranks: u.words.map((w) => { if (w.r) return w.r; const id = nextPackId++; PACK_WORDS.set(id, { ...w, pack: p.id }); return id; }),
  })),
}));
const PACK = Object.fromEntries(PACKS.map((p) => [p.id, p]));
let USER = {};
/** Own themes live in the learner's state (S.themes); state.js hands them over whenever it changes. */
export function setUserThemes(map) {
  USER = Object.fromEntries(Object.entries(map || {}).map(([id, t]) => [id, { id, name: t.name, emoji: t.emoji || "✨", desc: t.desc || "", kind: "user", request: t.request || "",
    units: (t.units || []).map((u, i) => ({ id: `${id}~${i + 1}`, theme: id, n: i + 1, title: u.title, ranks: u.ids || [] })) }]));
}
export const userThemes = () => Object.values(USER);
/** Any theme: built-in (by frequency list), exam pack, or own AI theme. */
export const getTheme = (id) => THEME[id] ? { ...THEME[id], kind: "base" } : PACK[id] || USER[id] || null;
const packOf = new Map();
PACKS.forEach((p) => p.units.forEach((u) => u.ranks.forEach((r) => { if (!packOf.has(r)) packOf.set(r, p.id); })));
export const themeOf = (r) => CAT[r] || packOf.get(r) || "";

const UNIT = 10;
const byTheme = {};
Object.entries(CAT).forEach(([r, c]) => (byTheme[c] ||= []).push(Number(r)));
Object.values(byTheme).forEach((a) => a.sort((x, y) => x - y));
export const themeRanks = (id) => byTheme[id] || (PACK[id] || USER[id])?.units.flatMap((u) => u.ranks) || [];

const unitCache = {};
/** Lessons of ~10 words, grouped by CEFR band, most frequent first. */
export function unitsOf(id) {
  if (PACK[id] || USER[id]) return (PACK[id] || USER[id]).units;
  if (unitCache[id]) return unitCache[id];
  const out = [];
  BANDS.forEach((b) => {
    const rs = themeRanks(id).filter((r) => r >= b.from && r <= b.to);
    const chunks = [];
    for (let i = 0; i < rs.length; i += UNIT) chunks.push(rs.slice(i, i + UNIT));
    if (chunks.length > 1 && chunks.at(-1).length < 5) chunks.at(-2).push(...chunks.pop()); // no tiny last lesson
    chunks.forEach((ranks, i) => out.push({ id: `${id}-${b.id}-${i + 1}`, theme: id, band: b.id, n: out.length + 1, ranks }));
  });
  return (unitCache[id] = out);
}
/** Order in which a theme feeds new words: from the learner's start level upward, easier words afterwards. */
export function themeOrder(id, start = 1) {
  const rs = themeRanks(id);
  if (!THEME[id]) return rs; // packs and own themes: lesson order
  return [...rs.filter((r) => r >= start), ...rs.filter((r) => r < start)];
}

export function findUnit(uid) {
  const tid = uid.includes("~") ? uid.split("~")[0] : uid.split("-")[0];
  return unitsOf(tid).find((u) => u.id === uid) || null;
}
