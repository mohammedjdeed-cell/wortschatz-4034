// Example sentences + visual hints. Lookup order: local cache → shared Firestore cache → Vercel AI endpoint.
import { BY } from "./state.js";
import { cloud } from "./cloud.js";

const LS = "wz4034-s";
export const SENT = (() => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } })();
const persist = () => { try { localStorage.setItem(LS, JSON.stringify(SENT)); } catch {} };
export const pending = new Set();
export let aiState = "idle"; // idle | ok | off | limited | err | auth
const API = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "") + "/api/sentences";
let notify = () => {};
export function onAI(fn) { notify = fn; }

const FIELDS = ["emoji", "pl", "de", "en", "kde", "ken", "tip", "syn", "ant", "konj", "ar", "ar_s", "ar_k"];
const clean = (o) => Object.fromEntries(FIELDS.map((k) => [k, String(o?.[k] ?? "").slice(0, k === "emoji" ? 16 : 240)]));

export async function getSentences(ranks) {
  const need = [...new Set(ranks)].filter((r) => r <= 4034 && BY.has(r) && !SENT[r] && !pending.has(r));
  if (!need.length) return;
  need.forEach((r) => pending.add(r)); notify();

  // 1) shared cache in Firestore
  try {
    const found = await cloud.readSentences(need);
    Object.entries(found).forEach(([r, v]) => { SENT[r] = clean(v); });
    if (Object.keys(found).length) persist();
  } catch {}
  const missing = need.filter((r) => !SENT[r]);
  need.filter((r) => SENT[r]).forEach((r) => pending.delete(r));
  notify();
  if (!missing.length) return;
  if (aiState === "off" || aiState === "limited") { missing.forEach((r) => pending.delete(r)); notify(); return; }

  // 2) generate with Claude via the Vercel function, 12 per request
  for (let i = 0; i < missing.length; i += 12) {
    const part = missing.slice(i, i + 12);
    try {
      const token = await cloud.idToken();
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: JSON.stringify({ words: part.map((r) => { const w = BY.get(r); return { r, w: w.w, p: w.p, e: w.e }; }) }),
      });
      if (res.status === 401) { aiState = "auth"; break; }
      if (res.status === 429) { aiState = "limited"; break; }
      if (res.status === 503 || res.status === 404 || res.status === 405) { aiState = "off"; break; }
      if (!res.ok) throw new Error(String(res.status));
      const { items } = await res.json();
      const got = {};
      (items || []).forEach((o) => { const r = Number(o.r); if (part.includes(r) && o.de) { SENT[r] = clean(o); got[r] = SENT[r]; } });
      persist(); aiState = "ok";
      cloud.writeSentences(got).catch(() => {});
    } catch { aiState = "err"; }
    finally { part.forEach((r) => pending.delete(r)); notify(); }
  }
  missing.forEach((r) => pending.delete(r)); notify();
}
export function resetAI() { if (aiState !== "ok") aiState = "idle"; }

/** Own-word lookup ("words") and topic suggestions ("topic"). Throws an Error whose message is a short reason code. */
export async function aiCall(mode, payload) {
  const token = await cloud.idToken();
  if (!token && cloud.enabled) throw new Error("auth");
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ mode, ...payload }),
  });
  if (res.status === 401) throw new Error("auth");
  if (res.status === 429) throw new Error("limited");
  if (res.status === 503 || res.status === 404 || res.status === 405) throw new Error("off");
  if (!res.ok) throw new Error("err");
  return (await res.json()).items || [];
}
