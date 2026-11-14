// Lesson flow: Themen → Lernen stays in the theme, intro → mini-quiz (all question types) → "Nächste Lektion".
// Usage: APP=http://localhost:4173/ node tests/lesson.mjs [outDir for screenshots]
import { createRequire } from "module";
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = process.env.APP || "http://localhost:4173/";
const OUT = process.argv[2];
const fail = (m) => { console.log("✗ " + m); process.exitCode = 1; };
const b = await chromium.launch();
for (const [name, opts] of [["phone", { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }], ["laptop", { viewport: { width: 1536, height: 864 } }]]) {
  const page = await (await b.newContext(opts)).newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  // fake AI: a sentence that contains the word, and a plural for nouns
  await page.route("**/api/sentences", async (r) => {
    const { words = [] } = JSON.parse(r.request().postData() || "{}");
    const items = words.map((w) => { const k = w.w.split(/[,(]/)[0].trim(); const noun = /^(der|die|das)/.test(w.p);
      return { r: w.r, emoji: "", pl: noun ? "die " + k + "en" : "", de: `Heute sehe ich ${noun ? w.p.split(",")[0] + " " : ""}${k} im Krankenhaus.`, en: "Today I see it.", ar_s: "", kde: "", ken: "", ar_k: "", tip: "", syn: "", ant: "", konj: "", ar: "" }; });
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items }) });
  });
  await page.route(/wikipedia|wikimedia/, (r) => r.abort());
  await page.addInitScript(() => { localStorage.setItem("wz-tour", "1"); localStorage.setItem("wz-photos", "0"); speechSynthesis.speak = () => {}; });
  await page.goto(APP); await page.click('[data-start="900"]');
  await page.goto(APP + "#thema/medizin");
  const uid = await page.getAttribute("[data-unit]", "data-unit");
  await page.click(`[data-unit="${uid}"]`); await page.waitForTimeout(300);
  let h = await page.evaluate(() => location.hash);
  if (h !== `#lektion/${uid}`) fail(`${name}: Lernen went to ${h}`);
  if (OUT) await page.screenshot({ path: `${OUT}/${name}-intro.png` });
  let n = 0; while (await page.$('[data-act="lesNext"]')) { await page.click('[data-act="lesNext"]'); n++; if (n > 20) break; }
  console.log(`${name}: intro ${n} words`);
  const types = {}; let q = 0;
  while (await page.$(".qhead") && q < 60) {
    const kind = await page.evaluate(() => document.querySelector("#qTypeForm") ? "type" : document.querySelector(".qcard .lbl")?.textContent);
    types[kind] = (types[kind] || 0) + 1;
    if (OUT && types[kind] === 1) await page.screenshot({ path: `${OUT}/${name}-q-${String(kind).replace(/\W+/g, "_")}.png` });
    if (kind === "type") { await page.fill("#typeIn", "xx"); await page.press("#typeIn", "Enter"); await page.waitForTimeout(100); await page.press("#qTypeForm [type=submit]", "Enter").catch(() => page.click("#qTypeForm [type=submit]")); }
    else { const c = await page.$$eval(".opt", (x) => x.length); if (c < 3) fail(`${name}: only ${c} options for ${kind}`); await page.click('.opt[data-opt="0"]'); await page.waitForTimeout(1800); }
    q++;
  }
  console.log(`${name}: ${q} questions`, types);
  if (OUT) await page.screenshot({ path: `${OUT}/${name}-done.png` });
  const next = await page.$('.empty [data-unit]');
  if (!next) fail(`${name}: no Nächste Lektion button`); else { const nid = await next.getAttribute("data-unit"); await next.click(); await page.waitForTimeout(300); h = await page.evaluate(() => location.hash); if (h !== `#lektion/${nid}`) fail(`${name}: next lesson went to ${h}`); else console.log(`${name}: next → ${h}`); }
  // Heute shows "Weiter mit Lektion N" when the path is a theme
  await page.goto(APP + "#thema/medizin"); await page.click('[data-path="theme"]'); await page.goto(APP + "#heute"); await page.waitForTimeout(200);
  const nl = await page.textContent(".nextles").catch(() => ""); if (!/Weiter mit Lektion/.test(nl)) fail(`${name}: no next-lesson link on Heute`); else console.log(`${name}: Heute → ${nl.replace(/\s+/g, " ").trim()}`);
  if (OUT) await page.screenshot({ path: `${OUT}/${name}-heute.png` });
  // adaptive difficulty: words answered right twice come as typing questions
  await page.evaluate(() => { const S = JSON.parse(localStorage.getItem("wz4034")); Object.values(S.learn).forEach((L) => (L.qc = 2)); S.updated = Date.now(); localStorage.setItem("wz4034", JSON.stringify(S)); });
  await page.reload(); await page.goto(APP + "#ueben"); await page.goto(APP + "#quiz"); await page.waitForTimeout(200);
  if (!(await page.$("#qTypeForm"))) fail(`${name}: no typing question after 2 right answers`);
  else {
    const want = await page.evaluate(() => { const g = document.querySelector(".qcard .gloss-big").textContent; const w = [...window.__BY.values()].find((x) => x.e === g); return (/^(der|die|das)/.test(w.p) ? w.p.split(",")[0] + " " : "") + w.w.split(/[,(]/)[0].trim(); });
    await page.fill("#typeIn", want); await page.press("#typeIn", "Enter"); await page.waitForTimeout(150);
    const res = await page.textContent(".tres b"); if (!/Richtig/.test(res)) fail(`${name}: typed "${want}" → ${res}`); else console.log(`${name}: typing "${want}" → ${res}`);
    if (OUT) await page.screenshot({ path: `${OUT}/${name}-q-type.png` });
    await page.press("#qTypeForm [type=submit]", "Enter"); await page.waitForTimeout(150);
    if (!/Frage 2/.test(await page.textContent(".qhead"))) fail(`${name}: typing did not advance`);
  }
  if (errs.length) fail(`${name}: page errors ${errs.join(" | ")}`);
}
await b.close();
console.log(process.exitCode ? "lesson FAILED" : "lesson OK");
