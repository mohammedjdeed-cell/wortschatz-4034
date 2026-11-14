// Sätze flow with a mocked AI: word order, article/case gaps, own sentence (check mode), sentence patterns, word sheet link.
// Usage: APP=http://localhost:4173/ node tests/saetze.mjs [outDir for screenshots]
import { createRequire } from "module";
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = process.env.APP || "http://localhost:4173/";
const OUT = process.argv[2];
const fail = (m) => { console.log("✗ " + m); process.exitCode = 1; };
const b = await chromium.launch();
for (const [name, opts] of [["phone", { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }], ["laptop", { viewport: { width: 1440, height: 900 } }]]) {
  const page = await (await b.newContext(opts)).newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  let checked = null;
  await page.route("**/api/sentences", async (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    if (body.mode === "check") {
      checked = body;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ check: { ok: false, uses: true, corrected: "Ich habe den Arzt gestern gesehen.", errors: [{ wrong: "der Arzt", right: "den Arzt", why: "Akkusativ after sehen", why_ar: "حالة النصب بعد sehen" }], tip: "", tip_ar: "" } }) });
    }
    const items = (body.words || []).map((w) => { const k = w.w.split(/[,(]/)[0].trim(); const noun = /^(der|die|das)/.test(w.p);
      const art = noun ? { der: "den", die: "die", das: "das" }[w.p.split(",")[0].trim()] + " " : "";
      return { r: w.r, emoji: "", pl: "", de: `Heute sehe ich ${art}${k} im Krankenhaus.`, en: "Today I see it in hospital.", ar_s: "", kde: "", ken: "", ar_k: "", tip: "", syn: "", ant: "", konj: "", ar: "" }; });
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items }) });
  });
  await page.route(/wikipedia|wikimedia/, (r) => r.abort());
  await page.addInitScript(() => { localStorage.setItem("wz-tour", "1"); localStorage.setItem("wz-photos", "0"); speechSynthesis.speak = () => {}; });
  await page.goto(APP); await page.click('[data-start="900"]'); await page.waitForTimeout(800); // today's words + their sentences
  await page.goto(APP + "#ueben"); await page.click('a[href="#saetze"]'); await page.waitForTimeout(200);
  if (OUT) await page.screenshot({ path: `${OUT}/${name}-saetze.png`, fullPage: true });

  // word order: click the tiles in original order
  await page.goto(APP + "#saetze/bau"); await page.waitForTimeout(150);
  let solved = 0;
  for (let k = 0; k < 8 && (await page.$(".spool")); k++) {
    const idx = (await page.$$eval(".spool [data-tile]", (x) => x.map((e) => Number(e.dataset.tile.split(":")[1])))).sort((a, c) => a - c);
    if (!idx.length) break;
    for (const i of idx) await page.click(`.spool [data-tile="p:${i}"]`);
    if (k === 0 && OUT) await page.screenshot({ path: `${OUT}/${name}-bau.png` });
    await page.click('[data-sx="check"]');
    if (await page.$(".sline.good")) solved++; else fail(`${name}: correct order not accepted`);
    await page.click('[data-sx="next"]');
  }
  console.log(`${name}: Satzbau solved ${solved}`);
  if (!solved) fail(`${name}: no Satzbau items`);

  // article / case gap
  await page.goto(APP + "#saetze/luecke"); await page.waitForTimeout(150);
  const gapOpts = await page.$$eval("[data-sopt]", (x) => x.map((e) => e.textContent.trim()));
  if (gapOpts.length !== 4) fail(`${name}: Lücke has ${gapOpts.length} options`); else console.log(`${name}: Lücke options`, gapOpts.join(" "));
  if (OUT) await page.screenshot({ path: `${OUT}/${name}-luecke.png` });
  await page.click('[data-sopt="0"]'); if (!(await page.$(".opt.right"))) fail(`${name}: no feedback in Lücke`);

  // pattern: gap, then building the sentence
  await page.goto(APP + "#saetze/muster~praep"); await page.waitForTimeout(150);
  const right = await page.evaluate(() => document.querySelector(".lbl").textContent);
  await page.click('[data-sopt="0"]'); await page.click('[data-sx="next"]');
  console.log(`${name}: pattern ${right} → next is ${(await page.$(".spool")) ? "Satzbau" : "gap"}`);

  // own sentence checked by the AI
  await page.goto(APP + "#saetze/eigen"); await page.waitForTimeout(150);
  await page.fill("#ownText", "Ich habe der Arzt gestern gesehen."); await page.click('#ownForm [type=submit]'); await page.waitForTimeout(400);
  const res = await page.textContent("#ownRes");
  if (!checked?.word || !/den Arzt/.test(res)) fail(`${name}: check result missing (${res.slice(0, 80)})`); else console.log(`${name}: Eigener Satz → "${res.replace(/\s+/g, " ").trim().slice(0, 90)}"`);
  if (OUT) await page.screenshot({ path: `${OUT}/${name}-eigen.png` });

  // word sheet → Satz bilden
  await page.goto(APP + "#woerter"); await page.fill("#q", "#900"); await page.waitForTimeout(200); await page.click("[data-open]");
  await page.click('[data-act="learn"]').catch(() => {});
  await page.click('[data-act="ownSentence"]'); await page.waitForTimeout(200);
  const h = await page.evaluate(() => location.hash); if (h !== "#saetze/eigen~900") fail(`${name}: Satz bilden → ${h}`);
  if (errs.length) fail(`${name}: page errors ${errs.join(" | ")}`);
}
await b.close();
console.log(process.exitCode ? "saetze FAILED" : "saetze OK");
