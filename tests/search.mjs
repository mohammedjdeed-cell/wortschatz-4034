// Dictionary search quality: forms, plurals, irregular verbs, umlaut spellings, typos, meanings, ranking. Usage: node tests/search.mjs
import { build } from "vite";
const out = await build({ logLevel: "silent", build: { write: false, lib: { entry: new URL("./search-entry.js", import.meta.url).pathname, formats: ["es"], fileName: "s" } } });
globalThis.localStorage = { getItem: () => null, setItem() {} };
const M = await import("data:text/javascript;base64," + Buffer.from(out[0].output[0].code).toString("base64"));
const words = [...M.WORDS, ...M.packWords()];
const top = (q, n = 1) => M.search(words, q).slice(0, n).map((x) => x.w.w.split(/[,(]/)[0].trim());
const cases = [
  ["buch", "Buch"], ["Bücher", "Buch"], ["buecher", "Buch"], ["büch", "Buch"], ["Kinder", "Kind"], ["Ärzte", "Arzt"],
  ["ging", "gehen"], ["gegangen", "gehen"], ["verstand", "verstehen"], ["wusste", "wissen"], ["gemacht", "machen"], ["macht", "machen"],
  ["Krankenhuas", "Krankenhaus"], ["krankenhaus", "Krankenhaus"], ["book", "Buch"], ["doctor", "Arzt"], ["Häuser", "Haus"], ["war", "sein"],
];
let bad = 0;
for (const [q, want] of cases) { const got = top(q, 3); const ok = got.includes(want); if (!ok) bad++; console.log(`${ok ? "✓" : "✗"} ${q.padEnd(12)} → ${got.join(", ")}`); }
if (bad) { console.log(`${bad} search cases failed`); process.exit(1); }
console.log("search OK");
