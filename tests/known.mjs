// "Kenne ich" on Heute keeps the word in today's list (marked), never swaps in a new word; unticking undoes it.
// Usage: APP=http://localhost:4173/ node tests/known.mjs
import { createRequire } from "module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = process.env.APP || "http://localhost:4173/";
const b = await chromium.launch();
for (const [name, opts] of [["phone", { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }], ["laptop", { viewport: { width: 1440, height: 900 } }]]) {
  const page = await (await b.newContext(opts)).newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.route("**/api/sentences", (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.addInitScript(() => { localStorage.setItem("wz-tour", "1"); localStorage.setItem("wz-photos", "0"); });
  await page.goto(APP); await page.click('[data-start="900"]');
  const ranks = () => page.$$eval("#todayList .wrow", (x) => x.map((e) => Number(e.dataset.r)));
  const before = await ranks();
  for (const r of before.slice(0, 3)) await page.click(`.wrow[data-r="${r}"] .check`);
  await page.waitForTimeout(200);
  assert.deepEqual(await ranks(), before, `${name}: list changed after Kenne ich`);
  assert.equal(await page.$$eval("#todayList .wrow.done", (x) => x.length), 3, `${name}: 3 rows marked`);
  assert.match(await page.textContent("#stats"), /Heute\s*3\s*\/\s*10/, `${name}: stats count known as done`);
  await page.reload(); await page.waitForTimeout(200);
  assert.deepEqual(await ranks(), before, `${name}: list changed after reload`);
  await page.click(`.wrow[data-r="${before[0]}"] .check`); await page.waitForTimeout(150); // undo
  assert.equal(await page.$$eval("#todayList .wrow.done", (x) => x.length), 2, `${name}: undo`);
  assert.equal(await page.evaluate((r) => !!JSON.parse(localStorage.getItem("wz4034")).learn[r], before[0]), true, `${name}: undone word back in the box`);
  assert.deepEqual(errs, []);
  console.log(`${name}: list stays ${before.length} words, tick/undo OK`);
}
await b.close();
console.log("known OK");
