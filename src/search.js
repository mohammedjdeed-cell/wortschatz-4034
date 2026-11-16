// Dictionary search: finds a word from any form (Bücher → Buch, ging → gehen, verstand → verstehen), tolerates typos,
// and ranks results (exact → form → stem → prefix → meaning → contains → typo, then frequency). Runs in the browser, no server.
import { SENT } from "./ai.js";

export const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").trim();
const normAr = (s) => String(s || "").replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
/** "ue/ae/oe" typed instead of ü/ä/ö (buecher → bucher). Only used as an extra query variant. */
const deDigraph = (s) => s.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");

/** Strips German inflection endings so Bücher/Buch, Kinder/Kind, macht/machen, gemacht/machen meet. */
export function stem(s) {
  let w = norm(s);
  if (w.length > 6 && w.startsWith("ge") && /(t|en)$/.test(w)) w = w.slice(2); // Partizip II: gemacht, gegeben
  for (const suf of ["innen", "erinnen", "test", "tet", "ten", "ern", "en", "er", "es", "st", "te", "em", "e", "n", "s", "t"]) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) { w = w.slice(0, -suf.length); break; }
  }
  return w;
}

// Irregular verbs: lemma → forms that suffix rules cannot reach. Prefixed verbs in the dictionary (verstehen, anfangen) inherit them.
const IRR = {
  sein: "bin bist ist sind seid war warst waren wart gewesen wäre wären sei", haben: "hast hat hatte hattest hatten gehabt hätte hätten",
  werden: "wirst wird wurde wurden geworden worden würde würden", können: "kann kannst konnte konnten gekonnt könnte könnten",
  müssen: "muss musst musste mussten gemusst müsste", dürfen: "darf darfst durfte durften gedurft dürfte", wollen: "will willst wollte wollten gewollt",
  sollen: "soll sollst sollte sollten gesollt", mögen: "mag magst mochte mochten gemocht möchte möchten", wissen: "weiß weißt wusste wussten gewusst wüsste",
  gehen: "ging gingen gegangen", kommen: "kam kamen gekommen käme", sehen: "sieht siehst sah sahen gesehen", geben: "gibt gibst gab gaben gegeben",
  nehmen: "nimmt nimmst nahm nahmen genommen", stehen: "stand standen gestanden", finden: "fand fanden gefunden", bleiben: "blieb blieben geblieben",
  liegen: "lag lagen gelegen", heißen: "hieß hießen geheißen", denken: "dachte dachten gedacht", bringen: "brachte brachten gebracht",
  tun: "tut tat taten getan", lassen: "lässt ließ ließen gelassen", halten: "hält hielt hielten gehalten", sprechen: "spricht sprach sprachen gesprochen",
  fahren: "fährt fuhr fuhren gefahren", laufen: "läuft lief liefen gelaufen", schreiben: "schrieb schrieben geschrieben", lesen: "liest las lasen gelesen",
  essen: "isst aß aßen gegessen", trinken: "trank tranken getrunken", schlafen: "schläft schlief schliefen geschlafen", helfen: "hilft half halfen geholfen",
  treffen: "trifft traf trafen getroffen", sitzen: "saß saßen gesessen", ziehen: "zog zogen gezogen", tragen: "trägt trug trugen getragen",
  fallen: "fällt fiel fielen gefallen", fangen: "fängt fing fingen gefangen", beginnen: "begann begannen begonnen", bitten: "bat baten gebeten",
  bieten: "bot boten geboten", verlieren: "verlor verloren", gewinnen: "gewann gewannen gewonnen", werfen: "wirft warf warfen geworfen",
  sterben: "stirbt starb starben gestorben", schließen: "schloss schlossen geschlossen", rufen: "rief riefen gerufen", scheinen: "schien schienen geschienen",
  steigen: "stieg stiegen gestiegen", treten: "tritt trat traten getreten", vergessen: "vergisst vergaß vergaßen", gelten: "gilt galt galten gegolten",
  schlagen: "schlägt schlug schlugen geschlagen", wachsen: "wächst wuchs wuchsen gewachsen", leiden: "litt litten gelitten", messen: "misst maß maßen gemessen",
  nennen: "nannte nannten genannt", kennen: "kannte kannten gekannt", rennen: "rannte gerannt", brennen: "brannte gebrannt", senden: "sandte gesandt",
  wenden: "wandte gewandt", springen: "sprang sprangen gesprungen", singen: "sang sangen gesungen", sinken: "sank sanken gesunken",
  stoßen: "stößt stieß stießen gestoßen", greifen: "griff griffen gegriffen", weisen: "wies wiesen gewiesen", empfehlen: "empfiehlt empfahl empfohlen",
  befehlen: "befiehlt befahl befohlen", fliegen: "flog flogen geflogen", fliehen: "floh flohen geflohen", fließen: "floss flossen geflossen",
  riechen: "roch rochen gerochen", schieben: "schob schoben geschoben", schießen: "schoss schossen geschossen", schneiden: "schnitt schnitten geschnitten",
  schweigen: "schwieg schwiegen geschwiegen", streiten: "stritt stritten gestritten", gleichen: "glich glichen geglichen", waschen: "wäscht wusch gewaschen",
  raten: "rät riet rieten geraten", braten: "brät briet gebraten", frieren: "fror froren gefroren", heben: "hob hoben gehoben", hängen: "hing hingen gehangen",
  lügen: "log logen gelogen", leihen: "lieh liehen geliehen", meiden: "mied gemieden", reiten: "ritt geritten", reißen: "riss rissen gerissen",
  schaffen: "schuf schufen geschaffen", scheiden: "schied schieden geschieden", schmelzen: "schmilzt schmolz geschmolzen", schwimmen: "schwamm geschwommen",
  schwören: "schwor geschworen", stehlen: "stiehlt stahl gestohlen", stechen: "sticht stach gestochen", streichen: "strich gestrichen",
  treiben: "trieb trieben getrieben", verderben: "verdirbt verdarb verdorben", vermeiden: "vermied vermieden", wiegen: "wog gewogen", zwingen: "zwang gezwungen",
  binden: "band gebunden", bergen: "birgt barg geborgen", biegen: "bog gebogen", blasen: "bläst blies geblasen", dringen: "drang gedrungen",
  erschrecken: "erschrak erschrocken", fressen: "frisst fraß gefressen", gebären: "gebar geboren", genießen: "genoss genossen",
  geschehen: "geschieht geschah geschehen", gießen: "goss gegossen", graben: "gräbt grub gegraben", klingen: "klang geklungen", kriechen: "kroch gekrochen",
  laden: "lädt lud geladen", pfeifen: "pfiff gepfiffen", preisen: "pries gepriesen", quellen: "quoll gequollen", saufen: "soff gesoffen",
  saugen: "sog gesogen", schelten: "schalt gescholten", schlingen: "schlang geschlungen", schreien: "schrie geschrien",
  schreiten: "schritt geschritten", sprießen: "spross gesprossen", stinken: "stank gestunken", verzeihen: "verzieh verziehen", weichen: "wich gewichen",
  werben: "wirbt warb geworben", winden: "wand gewunden",
};
const IRR_LIST = Object.entries(IRR).filter(([, f]) => f).map(([l, f]) => [norm(l), f.split(" ").map(norm)]);
const SEP = /^(ab|an|auf|aus|bei|dar|ein|fest|fort|her|hin|los|mit|nach|vor|weg|weiter|zu|zurück|zusammen|um|durch|über|unter|wieder)/;

const keyOf = (w) => w.w.split(/[,(]/)[0].trim();
const lev = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < best) best = cur[j]; }
    if (best > max) return max + 1; prev = cur;
  }
  return prev[b.length];
};

/** Per-word index: lemma keys, extra forms (plural, irregular verb forms), stems, meanings. Rebuilt when the word object changes. */
const IDX = new Map();
function entry(w) {
  const s = SENT[w.r] || w.s || null; const sig = `${w.w}|${w.e}|${w.ar}|${s?.pl || ""}`;
  let x = IDX.get(w.r); if (x && x.sig === sig) return x;
  const keys = new Set(keyOf(w).split("/").map(norm).filter(Boolean));
  const full = norm(w.w); // e.g. "hgb (handelsgesetzbuch)"
  const forms = new Map(); // normalized form → label shown in the result
  const pl = String(s?.pl || "").replace(/^(die|der|das)\s+/i, "").trim();
  if (pl && pl !== "-" && pl !== "–") forms.set(norm(pl), "Plural");
  if (w.p === "verb") {
    for (const k of keys) for (const [base, fs] of IRR_LIST) {
      if (!k.endsWith(base)) continue;
      const pre = k.slice(0, k.length - base.length);
      for (const f of fs) { forms.set(pre + f, "Form"); if (pre && SEP.test(pre)) forms.set(f, `Form (${pre}…)`); }
    }
  }
  x = { sig, keys: [...keys], full, forms, stems: [...keys].map(stem), en: norm(w.e), enWords: norm(w.e).split(/[^a-z]+/).filter(Boolean), ar: normAr(w.ar) };
  IDX.set(w.r, x); return x;
}

/** Score one word for a query; 0 = no match. Returns [score, hint]. */
function score(w, q, qa) {
  const x = entry(w); const qs = q.map(stem);
  let best = 0, hint = "";
  const hit = (s, h = "") => { if (s > best) { best = s; hint = h; } };
  for (const v of q) {
    for (const k of x.keys) {
      if (k === v) hit(100);
      else if (k.startsWith(v)) hit(70 - Math.min(20, k.length - v.length));
      else if (v.length >= 3 && k.includes(v)) hit(35);
    }
    const f = x.forms.get(v); if (f) hit(92, f);
    if (v.length >= 3 && x.full.includes(v)) hit(34);
    if (x.enWords.includes(v) || x.en === v) hit(60); else if (v.length >= 3 && x.en.includes(v)) hit(30);
  }
  for (const s of qs) if (s.length >= 3 && s !== q[0] && (x.stems.includes(s) || x.keys.includes(s))) hit(85, /^(der|die|das)\b/.test(w.p) && q[0].length > x.keys[0].length ? "Plural" : "Form");
  if (qa && x.ar.includes(qa)) hit(x.ar.split(/[،,]\s*/).some((p) => p.trim() === qa) ? 60 : 30);
  if (!best && q[0].length >= 4) { // typo tolerance
    const max = q[0].length >= 7 ? 2 : 1;
    for (const k of [...x.keys, ...x.forms.keys()]) { const d = lev(q[0], k, max); if (d <= max) hit(25 - d * 5, "ähnlich"); }
  }
  return [best, hint];
}

/** Ranked search. Returns [{ w, hint }] best first; ties by frequency rank. */
export function search(words, raw) {
  const q0 = norm(raw); if (!q0) return words.map((w) => ({ w, hint: "" }));
  const q = [...new Set([q0, deDigraph(q0)])]; const qa = normAr(String(raw).trim());
  const out = [];
  for (const w of words) { const [s, hint] = score(w, q, qa); if (s) out.push({ w, s, hint }); }
  return out.sort((a, b) => b.s - a.s || a.w.r - b.w.r);
}
