// Smoke test: open every view, click every visible button once, fail on page errors or an empty page.
// Usage (test build without Firebase):
//   npx vite build --mode test --outDir /tmp/dist-test && npx vite preview --port 4173 --outDir /tmp/dist-test
//   APP=http://localhost:4173/ node tests/smoke.mjs
import { createRequire } from "module";
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = process.env.APP || "http://localhost:4173/";
const VIEWS = (process.env.VIEWS || "heute,themen,thema/medizin,thema/fsp-arzt,lektion/fsp-arzt~1,ueben,karten,schreiben,quiz,artikel,erklaer,duell,woerter,stand").split(",");
const SKIP = '[data-act="reset"],[data-act="resetYes"],[data-act="signout"],[data-act="google"],[data-act="export"],[data-photos],[data-act="aiThemeGo"],[data-act="mineTopic"],[data-act="mineCheck"]';
const SEL = `main button:not([disabled]):not(${SKIP}):not(.flip:not(.flipped) .back button)`;
const SIZES = [
  { name: "phone", opts: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } },
  { name: "laptop", opts: { viewport: { width: 1440, height: 900 } } },
];
let fails = 0;
const b = await chromium.launch();
for (const size of SIZES) {
  const ctx = await b.newContext(size.opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.route("**/api/sentences", (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.route(/wikipedia|wikimedia/, (r) => r.abort());
  await page.addInitScript(() => { localStorage.setItem("wz-tour", "1"); localStorage.setItem("wz-photos", "0"); window.confirm = () => false; });
  await page.goto(APP);
  await page.click('[data-start="900"]');
  for (const v of VIEWS) {
    await page.goto(APP + "#" + v);
    await page.waitForTimeout(150);
    const n = Math.min(40, await page.$$eval(SEL, (x) => x.filter((e) => e.offsetParent).length));
    for (let i = 0; i < n; i++) {
      await page.goto(APP + "#" + v);
      await page.waitForTimeout(80);
      const vis = [];
      for (const x of await page.$$(SEL)) if (await x.isVisible()) vis.push(x);
      if (!vis[i]) break;
      const label = (await vis[i].textContent()).trim().slice(0, 30);
      const before = errs.length;
      await vis[i].click({ timeout: 2000 }).catch((e) => errs.push(`click failed: ${e.message.split("\n")[0]}`));
      await page.waitForTimeout(250);
      if (await page.evaluate(() => document.querySelector("#sheet").open)) await page.keyboard.press("Escape");
      const empty = await page.evaluate(() => !document.querySelector("#main").textContent.trim());
      if (errs.length > before || empty) {
        fails++;
        console.log(`✗ ${size.name} #${v} "${label}": ${empty ? "empty page " : ""}${errs.slice(before).join(" | ")}`);
      }
    }
    console.log(`  ${size.name} #${v}: ${n} buttons`);
  }
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} failures` : "smoke OK");
process.exit(fails ? 1 : 0);
