// Vercel Serverless Function: POST /api/sentences
// Generates example sentences + visual hints for up to 12 words with Claude.
// The client caches results in Firestore (`sentences/{rank}`), so each word is generated once for all users.
import Anthropic from "@anthropic-ai/sdk";
import { createRemoteJWKSet, jwtVerify } from "jose";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const PROJECT = process.env.FIREBASE_PROJECT_ID || "";
const REQUIRE_AUTH = (process.env.REQUIRE_AUTH ?? (PROJECT ? "true" : "false")) === "true";
const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const client = new Anthropic(); // reads ANTHROPIC_API_KEY

// naive per-instance rate limit: 30 requests / 10 min per user
const hits = new Map();
function limited(key) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const arr = (hits.get(key) || []).filter((t) => now - t < win);
  arr.push(now); hits.set(key, arr);
  return arr.length > 30;
}

const ITEM = {
  type: "object",
  additionalProperties: false,
  required: ["r", "emoji", "pl", "de", "en", "kde", "ken", "tip", "syn", "ant", "konj"],
  properties: {
    r: { type: "integer" },
    emoji: { type: "string" },
    pl: { type: "string" },
    de: { type: "string" },
    en: { type: "string" },
    kde: { type: "string" },
    ken: { type: "string" },
    tip: { type: "string" },
    syn: { type: "string" },
    ant: { type: "string" },
    konj: { type: "string" },
  },
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", items: ITEM } },
};

const INSTRUCTIONS = `You write vocabulary material for an Arabic-speaking medical doctor learning German (B1 to C1), preparing for the Fachsprachprüfung.
For each word, return one object:
- r: the rank number given.
- emoji: ONE emoji that best pictures the word's most common meaning (for abstract words choose a clear symbolic one).
- pl: plural with article for nouns (e.g. "die Bäume"), else "".
- de: one natural everyday German sentence at B1 level, max 12 words, using the word in a common meaning. en: its English translation.
- kde: one short German sentence from a hospital or doctor–patient context using the word, or "" if forced. ken: its translation or "".
- tip: very short English usage note (max 8 words): verbs give the Perfekt (e.g. "Perfekt: hat gelesen", mark separable prefixes); prepositions give the case; otherwise a useful collocation.
- syn: one common German synonym or "". ant: one common German antonym or "".
- konj: verbs only, present tense "ich …, du …, er …" (e.g. "ich gehe, du gehst, er geht"), else "".
Keep German umlauts and ß exactly. Write original sentences.`;

function cors(req, res) {
  const origin = req.headers.origin || "";
  const ok = !ALLOWED.length || ALLOWED.includes(origin);
  if (ok && origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return ok;
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
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: `https://securetoken.google.com/${PROJECT}`,
        audience: PROJECT,
      });
      uid = payload.sub;
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }
  }
  if (limited(uid)) return res.status(429).json({ error: "rate_limited" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const words = Array.isArray(body.words) ? body.words.slice(0, 12) : [];
  const clean = words
    .map((w) => ({ r: Number(w.r), w: String(w.w || "").slice(0, 60), p: String(w.p || "").slice(0, 12), e: String(w.e || "").slice(0, 80) }))
    .filter((w) => Number.isInteger(w.r) && w.r > 0 && w.r <= 4034 && w.w);
  if (!clean.length) return res.status(400).json({ error: "no_words" });

  const list = clean.map((w) => `${w.r} | ${w.w} | ${w.p} | ${w.e}`).join("\n");
  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: INSTRUCTIONS,
      messages: [{ role: "user", content: `Words (rank | word | part of speech or article | English):\n${list}` }],
    });
    if (msg.stop_reason === "refusal") return res.status(422).json({ error: "refused" });
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const data = JSON.parse(text);
    const allowed = new Set(clean.map((w) => w.r));
    const items = (data.items || []).filter((o) => allowed.has(Number(o.r)) && o.de);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ items, model: msg.model });
  } catch (e) {
    const status = e?.status === 429 ? 429 : 502;
    console.error("sentences error", e?.status, e?.message);
    return res.status(status).json({ error: status === 429 ? "rate_limited" : "upstream_error" });
  }
}
