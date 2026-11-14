// Unit check of the FSRS scheduling in src/state.js (no browser). Usage: node tests/fsrs.mjs
import { build } from "vite";
import assert from "node:assert/strict";
const out = await build({ logLevel: "silent", build: { write: false, lib: { entry: new URL("../src/state.js", import.meta.url).pathname, formats: ["es"], fileName: "s" } } });
globalThis.localStorage = { getItem: () => null, setItem() {} };
const St = await import("data:text/javascript;base64," + Buffer.from(out[0].output[0].code).toString("base64"));
const t = St.today();
St.replaceState({ ...St.fresh(), start: 900, learn: { 5: { b: 3, due: t, d: t }, 6: { b: 0, due: t, d: t }, 7: { b: 2, due: St.addDays(t, 3), d: t } } });

assert.deepEqual(St.dueDeck().sort(), [5, 6], "due today, the future card is not due");
const pOld = St.preview(5), pNew = St.preview(6);
assert.ok(pOld[1].days === 0 && pOld[3].days >= 4, "migrated box-3 card: Nochmal today, Gut ≥ its old interval");
assert.ok(pOld[1].days <= pOld[2].days && pOld[2].days <= pOld[3].days && pOld[3].days <= pOld[4].days, "intervals grow with the grade");
assert.ok(pNew[3].days === 0 && pNew[4].days >= 1, "new card: learning steps today, Leicht graduates");

St.answer(5, 3);
assert.ok(St.S.learn[5].f && St.S.learn[5].due > t && St.S.learn[5].b >= 3, "Gut moves a review card into the future");
assert.equal(St.memory(5).recall, 100);
St.answer(6, 1);
assert.equal(St.S.learn[6].due, t, "Nochmal keeps the card due today");
assert.equal(St.S.learn[6].b, 0);
St.answer(6, true); // boolean API (Schreiben, old callers) = Gut
assert.ok(St.S.learn[6].f.n === 2);
St.answer(6, 4);
assert.ok(St.S.learn[6].due > t, "Leicht graduates the card");
assert.deepEqual(St.dueDeck(), [], "nothing due any more");
const json = JSON.parse(JSON.stringify(St.S)); St.replaceState(json); // survives the Firestore round trip
assert.ok(St.preview(5)[3].days > 0);
console.log("fsrs OK");
