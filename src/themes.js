// Situational themes + level-ordered lessons ("Lektionen") over the 4034-word frequency list.
// Why situational and not semantic sets: learning near-synonyms or one word family together (all colours,
// all body parts at once) causes interference; words that co-occur in one situation are remembered better.
import CAT from "./data/cat.json";

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
export const themeOf = (r) => CAT[r] || "";

const UNIT = 10;
const byTheme = {};
Object.entries(CAT).forEach(([r, c]) => (byTheme[c] ||= []).push(Number(r)));
Object.values(byTheme).forEach((a) => a.sort((x, y) => x - y));
export const themeRanks = (id) => byTheme[id] || [];

const unitCache = {};
/** Lessons of ~10 words, grouped by CEFR band, most frequent first. */
export function unitsOf(id) {
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
  return [...rs.filter((r) => r >= start), ...rs.filter((r) => r < start)];
}
