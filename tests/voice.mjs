// Voice choice: the most natural German voice is used by default, and the picker in Fortschritt switches it.
// Usage: APP=http://localhost:4173/ node tests/voice.mjs
import { createRequire } from "module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = process.env.APP || "http://localhost:4173/";
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.route("**/api/sentences", (r) => r.fulfill({ status: 503, body: "{}" }));
await page.addInitScript(() => {
  localStorage.setItem("wz-tour", "1"); localStorage.setItem("wz-photos", "0");
  const V = (name, lang, local = true) => ({ name, lang, voiceURI: name, localService: local, default: false });
  const list = [V("Microsoft Hedda - German (Germany)", "de-DE"), V("eSpeak German", "de"), V("Microsoft Katja Online (Natural) - German (Germany)", "de-DE", false), V("Google Deutsch", "de-DE", false), V("Microsoft Jan Online (Natural) - German (Austria)", "de-AT", false), V("Google US English", "en-US", false)];
  window.__spoken = []; window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  speechSynthesis.getVoices = () => list;
  speechSynthesis.speak = (u) => window.__spoken.push(`${u.voice?.name}|${u.text}|${u.lang}`);
});
await page.goto(APP); await page.click('[data-start="900"]');
await page.click(".wrow [data-say]");
let last = await page.evaluate(() => window.__spoken.at(-1));
assert.match(last, /^Microsoft Katja Online \(Natural\)/, "best voice by default: " + last);
await page.goto(APP + "#stand"); await page.waitForTimeout(200);
const opts = await page.$$eval("#voiceSel option", (x) => x.map((o) => o.textContent));
console.log("picker:", opts.join(" | "));
assert.equal(opts.length, 5, "only German voices"); assert.ok(opts[0].startsWith("★ Microsoft Katja") && opts.at(-1).includes("eSpeak"));
await page.selectOption("#voiceSel", "Google Deutsch");
assert.match(await page.evaluate(() => window.__spoken.at(-1)), /^Google Deutsch\|Guten Tag/, "sample with the picked voice");
await page.goto(APP + "#heute"); await page.click(".wrow [data-say]");
assert.match(await page.evaluate(() => window.__spoken.at(-1)), /^Google Deutsch\|/, "choice persists");
assert.deepEqual(errs, []);
await b.close();
console.log("voice OK");
