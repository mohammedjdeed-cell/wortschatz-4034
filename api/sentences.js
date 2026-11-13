// Vercel Serverless Function: POST /api/sentences
// All AI features of the app go through here (Claude Haiku by default). Modes:
//   "sentences" (default) – example sentences + hints for dictionary words; cached by the client in Firestore for all users
//   "words"               – look up / correct the user's own words and fill in translations, article, sentences
//   "topic"               – suggest words for a topic (e.g. "Körper", "Kardiologie", "Technik")
//   "translate"           – Arabic glosses for dictionary words (used to build src/data/ar.json)
import Anthropic from "@anthropic-ai/sdk";
import { createRemoteJWKSet, jwtVerify } from "jose";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
// Server-side refusal fallbacks exist for Opus/Sonnet/Fable, not for Haiku.
const FALLBACK = /haiku/.test(MODEL) ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
const PROJECT = process.env.FIREBASE_PROJECT_ID || "";
const REQUIRE_AUTH = (process.env.REQUIRE_AUTH ?? (PROJECT ? "true" : "false")) === "true";
const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const client = new Anthropic(); // reads ANTHROPIC_API_KEY

// naive per-instance rate limit: 40 requests / 10 min per user
const hits = new Map();
function limited(key) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const arr = (hits.get(key) || []).filter((t) => now - t < win);
  arr.push(now); hits.set(key, arr);
  return arr.length > 40;
}

const str = { type: "string" };
const obj = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const list = (item) => obj({ items: { type: "array", items: item } });
const SENT_FIELDS = { emoji: str, pl: str, de: str, en: str, ar_s: str, kde: str, ken: str, ar_k: str, tip: str, syn: str, ant: str, konj: str };

const SCHEMAS = {
  sentences: list(obj({ r: { type: "integer" }, ar: str, ...SENT_FIELDS })),
  words: list(obj({ q: str, ok: { type: "boolean" }, w: str, art: str, pos: str, e: str, ar: str, ...SENT_FIELDS })),
  topic: list(obj({ w: str, art: str, pos: str, e: str, ar: str, ...SENT_FIELDS })),
  translate: list(obj({ r: { type: "integer" }, ar: str })),
  categorize: list(obj({ r: { type: "integer" }, c: { type: "string", enum: ["basis", "zeit", "zahlen", "menschen", "koerper", "medizin", "gefuehle", "sprechen", "alltag", "raum", "wohnen", "essen", "arbeit", "geld", "bildung", "staat", "gesellschaft", "natur", "reisen", "technik", "eigenschaften", "abstrakt"] } })),
};

const AUDIENCE = `You write vocabulary material for an Arabic-speaking medical doctor learning German (B1 to C1) for the Fachsprachprüfung.`;
const FIELD_RULES = `Field rules:
- emoji: ONE emoji that best pictures the most common meaning (symbolic for abstract words).
- pl: plural with article for nouns (e.g. "die Bäume"), else "".
- de: one natural everyday German sentence (B1, max 12 words) using the word. en: English translation. ar_s: Modern Standard Arabic translation.
- kde: one short German sentence from a hospital / doctor–patient context, or "" if forced. ken: English translation or "". ar_k: Arabic translation or "".
- tip: very short English usage note (max 8 words): verbs give the Perfekt (e.g. "Perfekt: hat gelesen", mark separable prefixes); prepositions give the case; otherwise a collocation.
- syn: one common German synonym or "". ant: one common German antonym or "".
- konj: verbs only, present tense "ich …, du …, er …", else "".
Keep German umlauts and ß exactly. Arabic must be Modern Standard Arabic, without diacritics unless needed for clarity.`;
const WORD_RULES = `- w: the German dictionary form (lemma) WITHOUT article; nouns capitalised.
- art: "der", "die" or "das" for nouns (several separated by ", " if both are used), else "".
- pos: one of noun, verb, adj, adv, prep, conj, pron, num, part, interj, phrase.
- e: short English meaning (max 5 words). ar: short Arabic meaning (max 5 words).`;

const PROMPTS = {
  sentences: `${AUDIENCE}\nFor each dictionary word, return one object. r: the rank number given. ar: short Arabic meaning (max 5 words).\n${FIELD_RULES}\nWrite original sentences.`,
  words: `${AUDIENCE}\nThe learner typed their own words (possibly misspelled, inflected, with or without article, or in English/Arabic). For each input return one object:\n- q: the input exactly as given.\n- ok: false if it is not a real German word or phrase you can identify; then leave the other fields "".\n${WORD_RULES}\n${FIELD_RULES}`,
  topic: `${AUDIENCE}\nSuggest useful German words for the requested topic and level, most useful first. No duplicates, no words from the exclude list. Prefer words a doctor in a German hospital would really need when the topic is medical.\n${WORD_RULES}\n${FIELD_RULES}`,
  categorize: `Assign each German dictionary word to exactly ONE situational theme, judged by its MOST COMMON meaning. Themes:
basis = function words: articles, pronouns, prepositions, conjunctions, particles, modal/auxiliary verbs (sein, haben, werden, können).
zeit = time, dates, frequency, calendar (Jahr, heute, oft, Montag, früh).
zahlen = numbers, quantities, measures, amounts (zwei, viel, Prozent, Meter, Hälfte).
menschen = people, family, relationships, roles in private life (Mann, Kind, Freund, heiraten).
koerper = body parts, senses, health in everyday life, sleep (Kopf, Auge, krank, schlafen, müde).
medizin = clinical/medical: doctors, hospital, diseases, treatment, drugs (Arzt, Patient, Behandlung, Krankenhaus, Schmerz, Operation, Blut).
gefuehle = emotions, attitudes, character (Angst, Freude, lieben, hoffen, stolz).
sprechen = speaking, thinking, knowing, information, communication (sagen, fragen, meinen, Frage, Brief, erklären).
alltag = general everyday actions with no clear topic (machen, geben, nehmen, legen, suchen, brauchen, versuchen).
raum = places, space, position, direction, movement (Ort, oben, kommen, gehen, links, Weg, liegen).
wohnen = home, house, furniture, household (Haus, Zimmer, Tür, Bett, wohnen).
essen = food, drink, cooking, eating out (Brot, trinken, Kaffee, kochen).
arbeit = work, jobs, companies, office, careers (Arbeit, Chef, Firma, Beruf, arbeiten).
geld = economy, money, buying, prices, trade (Geld, kaufen, teuer, Markt, Kosten).
bildung = school, university, learning, science, research, reading/writing (Schule, lernen, Studie, Buch).
staat = state, politics, law, authorities, military (Regierung, Gesetz, Polizei, Krieg, wählen).
gesellschaft = society, culture, media, art, sport, religion, leisure (Kultur, Film, Musik, Sport, Kirche).
natur = nature, animals, plants, weather, environment (Baum, Hund, Wetter, Sonne).
reisen = transport, traffic, travel, holidays (Auto, Zug, Reise, fahren, Hotel).
technik = technology, machines, materials, computers, energy (Computer, Maschine, Stoff, Strom).
eigenschaften = adjectives/adverbs that describe qualities and judgements without a clear topic (groß, gut, schnell, wichtig, einfach).
abstrakt = abstract nouns/verbs for reasoning and argumentation (Problem, Ergebnis, Möglichkeit, Grund, entwickeln, Bedeutung).
Prefer a concrete theme over eigenschaften/alltag/abstrakt when the word clearly belongs to one. Return r unchanged.`,
  translate: `Translate each German dictionary entry into a short Modern Standard Arabic meaning (max 5 words; give the 1–2 most common senses separated by "، "). The English gloss tells you the intended sense. Return r unchanged.`,
};

function cors(req, res) {
  const origin = req.headers.origin || "";
  const ok = !ALLOWED.length || ALLOWED.includes(origin);
  if (ok && origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return ok;
}
const clip = (v, n) => String(v ?? "").slice(0, n);

function buildRequest(mode, body) {
  if (mode === "sentences" || mode === "translate" || mode === "categorize") {
    const max = mode === "sentences" ? 12 : 200;
    const words = (Array.isArray(body.words) ? body.words : []).slice(0, max)
      .map((w) => ({ r: Number(w.r), w: clip(w.w, 60), p: clip(w.p, 12), e: clip(w.e, 80) }))
      .filter((w) => Number.isInteger(w.r) && w.r > 0 && w.r <= 4034 && w.w);
    if (!words.length) return null;
    return { allowed: new Set(words.map((w) => w.r)), text: `Words (rank | word | part of speech or article | English):\n${words.map((w) => `${w.r} | ${w.w} | ${w.p} | ${w.e}`).join("\n")}` };
  }
  if (mode === "words") {
    const words = (Array.isArray(body.words) ? body.words : []).map((s) => clip(s, 60).trim()).filter(Boolean).slice(0, 25);
    if (!words.length) return null;
    return { text: `Inputs, one per line:\n${words.join("\n")}` };
  }
  if (mode === "topic") {
    const topic = clip(body.topic, 80).trim(); if (!topic) return null;
    const n = Math.min(30, Math.max(5, Number(body.n) || 15));
    const level = clip(body.level, 4) || "B1";
    const exclude = (Array.isArray(body.exclude) ? body.exclude : []).map((s) => clip(s, 40)).slice(0, 300);
    return { text: `Topic: ${topic}\nLevel: ${level}\nNumber of words: ${n}\nExclude: ${exclude.join(", ") || "(none)"}` };
  }
  return null;
}

export default async function handler(req, res) {
  if (!cors(req, res)) return res.status(403).json({ error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ai_not_configured" });

  let uid = "anon:" + (req.headers["x-forwarded-for"] || "").split(",")[0];
  if (REQUIRE_AUTH) {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "auth_required" });
    try {
      const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT });
      uid = payload.sub;
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }
  }
  if (limited(uid)) return res.status(429).json({ error: "rate_limited" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const mode = SCHEMAS[body.mode] ? body.mode : "sentences";
  const built = buildRequest(mode, body);
  if (!built) return res.status(400).json({ error: "bad_request" });

  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: mode === "sentences" ? 8000 : 16000,
      ...FALLBACK,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMAS[mode] } },
      system: PROMPTS[mode],
      messages: [{ role: "user", content: built.text }],
    });
    if (msg.stop_reason === "refusal") return res.status(422).json({ error: "refused" });
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    let items = JSON.parse(text).items || [];
    if (built.allowed) items = items.filter((o) => built.allowed.has(Number(o.r)));
    if (mode === "sentences") items = items.filter((o) => o.de);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ items, model: msg.model });
  } catch (e) {
    const status = e?.status === 429 ? 429 : 502;
    console.error("ai error", mode, e?.status, e?.message);
    return res.status(status).json({ error: status === 429 ? "rate_limited" : "upstream_error" });
  }
}
