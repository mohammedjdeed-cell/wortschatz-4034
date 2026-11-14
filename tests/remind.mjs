// Unit check of the reminder logic in api/remind.js (no Firebase). Usage: node tests/remind.mjs
import assert from "node:assert/strict";
const { localNow, messageFor } = await import("../api/remind.js");
const t = localNow("Europe/Berlin", new Date("2026-11-14T17:30:00Z"));
assert.deepEqual(t, { date: "2026-11-14", hour: 18 });
assert.deepEqual(localNow("Not/AZone", new Date("2026-07-01T05:00:00Z")), { date: "2026-07-01", hour: 7 }, "bad zone falls back to Berlin (CEST)");
assert.equal(localNow("Asia/Damascus", new Date("2026-11-14T22:30:00Z")).date, "2026-11-15");
const S = { learn: { 1: { due: "2026-11-14" }, 2: { due: "2026-11-13" }, 3: { due: "2026-11-20" } }, hist: {}, streak: { n: 5, last: "2026-11-13" } };
assert.match(messageFor(S, "2026-11-14").title, /^2 Karten fällig/);
assert.match(messageFor(S, "2026-11-14").body, /Serie von 5 Tagen/);
assert.match(messageFor({ ...S, learn: {} }, "2026-11-14").title, /Serie: 5 Tage/);
assert.equal(messageFor({ ...S, learn: {}, streak: { n: 5, last: "2026-11-10" } }, "2026-11-14"), null, "broken streak, nothing due → no message");
assert.equal(messageFor({ ...S, learn: {}, hist: { "2026-11-14": 3 } }, "2026-11-14"), null, "already practised");
assert.equal(messageFor(null, "2026-11-14"), null);
const res = { code: 0, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
delete process.env.CRON_SECRET; await (await import("../api/remind.js")).default({ headers: {} }, res); assert.equal(res.code, 401, "no secret → 401");
console.log("remind OK");
