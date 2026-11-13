// Visual representations of words: emoji tiles, preposition diagrams, number dots, gender colouring, photos, frequency meter.
import EMOJI from "./data/emoji.json";
import { SENT } from "./ai.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const keyOf = (w) => w.w.split(/[,(]/)[0].trim();
export const POS = { verb: "Verb", adj: "Adjektiv", adv: "Adverb", pron: "Pronomen", prep: "Präposition", conj: "Konjunktion", part: "Partikel", num: "Zahlwort", art: "Artikel", interj: "Interjektion", aux: "Hilfsverb" };
export const isNoun = (p) => /^(der|die|das)/.test(p) && !/art$/.test(p);
export const gender = (p) => { const a = p.split(",")[0].trim(); return a === "der" || a === "die" || a === "das" ? a : ""; };
export const posLabel = (w) => (isNoun(w.p) ? "Nomen" : POS[w.p] || w.p);
export function wordHTML(w) {
  if (isNoun(w.p)) return `<span class="art g-${gender(w.p)}">${esc(w.p)}</span><span>${esc(w.w)}</span>`;
  return `<span>${esc(w.w)}</span>`;
}
export const sayText = (w) => (isNoun(w.p) ? w.p.split(",")[0] + " " : "") + keyOf(w);

/* ---------- prepositions ---------- */
export const CASES = {
  Akk: ["durch", "für", "gegen", "ohne", "um", "bis", "entlang", "wider"],
  Dat: ["aus", "bei", "mit", "nach", "seit", "von", "zu", "gegenüber", "ab", "außer", "samt"],
  "Akk/Dat": ["an", "auf", "hinter", "in", "neben", "über", "unter", "vor", "zwischen"],
  Gen: ["während", "wegen", "trotz", "statt", "anstatt", "innerhalb", "außerhalb", "aufgrund", "laut", "mithilfe", "oberhalb", "unterhalb", "angesichts", "infolge", "bezüglich"],
};
export function caseOf(w) {
  if (w.p !== "prep") return "";
  const k = keyOf(w);
  for (const [c, list] of Object.entries(CASES)) if (list.includes(k)) return c;
  return "";
}
const BOX = `<path d="M30 44h40v34H30z" class="bx"/><path d="M30 44l10-10h40l-10 10M70 44l10-10v34l-10 10" class="bx2"/>`;
const ball = (x, y, extra = "") => `<circle cx="${x}" cy="${y}" r="9" class="bl" ${extra}/>`;
const arrow = (d) => `<path d="${d}" class="ar" marker-end="url(#ah)"/>`;
const DIAG = {
  in: BOX + ball(52, 62),
  auf: BOX + ball(52, 25),
  unter: BOX + ball(52, 90),
  über: BOX + ball(55, 12) + `<path d="M55 22v6" class="ar" stroke-dasharray="2 3"/>`,
  vor: BOX + ball(40, 76, 'r="11"'),
  hinter: ball(78, 38, 'opacity=".55"') + BOX,
  neben: BOX + ball(92, 66),
  an: BOX + ball(90, 56),
  zwischen: `<path d="M8 50h24v28H8zM68 50h24v28H68z" class="bx"/>` + ball(50, 68),
  aus: BOX + ball(88, 30) + arrow("M55 60 Q70 40 80 34"),
  zu: ball(14, 60) + arrow("M24 60h22") + BOX,
  nach: ball(14, 60) + arrow("M24 60h22") + BOX,
  von: BOX + arrow("M66 62 H76") + ball(88, 62),
  durch: BOX + arrow("M6 62 H94") + ball(14, 62),
  um: BOX + `<ellipse cx="55" cy="58" rx="40" ry="28" class="ar" fill="none" stroke-dasharray="4 4"/>` + ball(15, 58),
  gegen: BOX + ball(12, 60) + arrow("M22 60h6"),
  bis: `<path d="M74 24v66" class="bx"/>` + ball(16, 60) + arrow("M26 60h44"),
  bei: BOX + ball(86, 72, 'r="7"'),
  mit: ball(40, 58) + ball(62, 58) + `<path d="M49 58h4" class="ar"/>`,
  ohne: BOX + `<path d="M24 30l60 54M84 30L24 84" class="ar" stroke-width="4"/>`,
  entlang: `<path d="M6 80 H94" class="bx"/>` + ball(26, 68) + arrow("M38 68 H86"),
  gegenüber: `<path d="M50 20v72" class="bx" stroke-dasharray="3 4"/>` + `<path d="M8 48h28v28H8z" class="bx"/>` + ball(80, 62),
  seit: `<path d="M10 70 H92" class="bx"/><path d="M22 60v20" class="ar"/>` + arrow("M24 70 H86"),
};
export function prepDiagram(w) {
  const d = DIAG[keyOf(w)]; if (!d) return "";
  return `<svg class="diagram" viewBox="0 0 100 100" aria-hidden="true"><defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--vc)"/></marker></defs>
  <style>.bx{fill:color-mix(in oklch,var(--vc) 14%,transparent);stroke:var(--vc);stroke-width:2.5;stroke-linejoin:round}.bx2{fill:none;stroke:var(--vc);stroke-width:2;opacity:.6;stroke-linejoin:round}.bl{fill:var(--fg);stroke:var(--surface);stroke-width:2}.ar{stroke:var(--vc);stroke-width:2.5;fill:none;stroke-linecap:round}</style>${d}</svg>`;
}

/* ---------- numbers ---------- */
const NUMS = { eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, hundert: 100, tausend: 1000, Million: 1e6, Milliarde: 1e9, halb: 0.5, beide: 2 };
export function numberValue(w) { return NUMS[keyOf(w)]; }
function numberVis(n) {
  if (n <= 12 && n >= 1) {
    const cols = n <= 4 ? n : n <= 9 ? 3 : 4; const rows = Math.ceil(n / cols); const cell = 70 / Math.max(cols, rows);
    let s = ""; for (let i = 0; i < n; i++) { const cx = 50 - ((cols - 1) * cell) / 2 + (i % cols) * cell; const cy = 50 - ((rows - 1) * cell) / 2 + Math.floor(i / cols) * cell; s += `<circle cx="${cx}" cy="${cy}" r="${cell * 0.36}" fill="var(--vc)"/>`; }
    return `<svg class="diagram" viewBox="0 0 100 100" aria-hidden="true">${s}</svg>`;
  }
  const t = n >= 1e9 ? "10⁹" : n >= 1e6 ? "10⁶" : n === 0.5 ? "½" : String(n);
  return `<span class="pos" style="font-size:1.5em">${t}</span>`;
}

/* ---------- emoji / tile ---------- */
const POS_GLYPH = { verb: "🏃", adj: "🎨", adv: "⏱️", pron: "👤", conj: "🔗", part: "✨", art: "📎", interj: "❗" };
export function emojiFor(w) { return EMOJI[keyOf(w)] || SENT[w.r]?.emoji || ""; }
export function hasPicture(w) { return !!(EMOJI[keyOf(w)] || SENT[w.r]?.emoji || DIAG[keyOf(w)] || numberValue(w)); }

/** Visual tile. size: "" | "lg" | "xl". Nouns may later swap in a photo (see attachPhotos). */
export function tile(w, size = "", { photo = false } = {}) {
  const g = gender(w.p);
  let inner = "";
  const em = emojiFor(w);
  const diag = w.p === "prep" ? prepDiagram(w) : "";
  const nv = numberValue(w);
  if (diag) inner = diag;
  else if (nv) inner = numberVis(nv);
  else if (em) inner = `<span class="emo">${em}</span>`;
  else if (w.p === "prep" && caseOf(w)) inner = `<span class="pos">${esc(caseOf(w))}</span>`;
  else inner = `<span class="pos">${esc(isNoun(w.p) ? g : (POS_GLYPH[w.p] ? POS_GLYPH[w.p] : w.p.slice(0, 3)))}</span>`;
  const ph = photo && isNoun(w.p) ? ` data-photo="${w.r}"` : "";
  return `<div class="vis ${g} ${size}"${ph} role="img" aria-label="${esc(keyOf(w))}">${inner}${g ? '<span class="gbar"></span>' : ""}</div>`;
}

/* ---------- frequency meter ---------- */
export function freqHTML(r) {
  const pct = Math.max(2, 100 - (Math.log(r) / Math.log(4034)) * 100);
  const top = r <= 100 ? "Top 100" : r <= 500 ? "Top 500" : r <= 1000 ? "Top 1000" : r <= 2000 ? "Top 2000" : "Top 4034";
  return `<div class="freq" title="Häufigkeitsrang #${r}"><span class="bar"><i style="width:${pct.toFixed(0)}%"></i></span><span>${top}</span></div>`;
}

/* ---------- Wikipedia photos for nouns (lazy, cached) ---------- */
const IMGKEY = "wz-img-v1";
let IMG = {}; try { IMG = JSON.parse(localStorage.getItem(IMGKEY) || "{}"); } catch {}
const saveImg = () => { try { localStorage.setItem(IMGKEY, JSON.stringify(IMG)); } catch {} };
const inflight = new Map();
export let photosOn = (() => { try { return localStorage.getItem("wz-photos") !== "0"; } catch { return true; } })();
export function setPhotos(on) { photosOn = on; try { localStorage.setItem("wz-photos", on ? "1" : "0"); } catch {} }

async function fetchPhoto(word) {
  if (word in IMG) return IMG[word];
  if (inflight.has(word)) return inflight.get(word);
  const p = (async () => {
    try {
      const res = await fetch(`https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}?redirect=true`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw 0;
      const j = await res.json();
      const src = j.type === "standard" && j.thumbnail?.source && !/\.svg/i.test(j.thumbnail.source) ? j.thumbnail.source : "";
      IMG[word] = src ? { src, page: j.content_urls?.desktop?.page || "" } : "";
    } catch { IMG[word] = ""; }
    saveImg(); return IMG[word];
  })();
  inflight.set(word, p); return p;
}

const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => {
  entries.forEach(async (e) => {
    if (!e.isIntersecting) return; io.unobserve(e.target);
    const el = e.target; const r = Number(el.dataset.photo); const w = window.__BY?.get(r); if (!w) return;
    const ph = await fetchPhoto(keyOf(w));
    if (ph && ph.src && el.isConnected) {
      const img = new Image(); img.className = "photo"; img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
      img.onload = () => el.appendChild(img); img.src = ph.src;
    }
  });
}, { rootMargin: "200px" }) : null;

export function attachPhotos(root = document) {
  if (!photosOn || !io) return;
  root.querySelectorAll("[data-photo]").forEach((el) => { if (!el.querySelector("img")) io.observe(el); });
}
