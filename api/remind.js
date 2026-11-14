// Vercel Serverless Function: POST /api/remind — daily study reminders via Firebase Cloud Messaging (web push).
// Called every hour by .github/workflows/remind.yml (Vercel Hobby crons run at most once a day, so GitHub Actions does the hourly tick).
// Sends to every learner whose chosen reminder hour (in their time zone) is now and who has not been reminded today:
//   "N Karten fällig" when cards are due, otherwise a streak reminder if they have not practised today.
// Env: CRON_SECRET (shared with the GitHub workflow), FIREBASE_SERVICE_ACCOUNT (service-account JSON, server only).
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const APP_URL = process.env.APP_URL || "https://wortschatz-4034.vercel.app";

function admin() {
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return { db: getFirestore(), fcm: getMessaging() };
}
/** Local date "YYYY-MM-DD" and hour 0–23 in a time zone (falls back to Europe/Berlin). */
export function localNow(tz, now = new Date()) {
  let zone = tz; try { new Intl.DateTimeFormat("en", { timeZone: zone }); } catch { zone = "Europe/Berlin"; }
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
/** What to say, or null when there is nothing worth a notification. */
export function messageFor(S, date) {
  const due = Object.values(S?.learn || {}).filter((L) => L && L.due <= date).length;
  const practised = (S?.hist || {})[date] > 0;
  const y = new Date(date + "T12:00:00Z"); y.setUTCDate(y.getUTCDate() - 1); const yesterday = y.toISOString().slice(0, 10);
  const streak = [date, yesterday].includes(S?.streak?.last) ? S.streak.n || 0 : 0; // a streak older than yesterday is already broken
  if (due > 0) return { title: `${due} ${due === 1 ? "Karte" : "Karten"} fällig`, body: practised ? "Noch ein paar Minuten – dann ist der Kasten leer." : streak > 1 ? `Halte deine Serie von ${streak} Tagen. 5 Minuten reichen.` : "5 Minuten reichen – los geht’s.", url: "/#karten" };
  if (!practised && streak > 1) return { title: `Deine Serie: ${streak} Tage`, body: "Heute noch nicht geübt – ein kurzes Quiz hält sie am Leben.", url: "/#quiz" };
  return null;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.authorization || "") !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(503).json({ error: "push_not_configured" });
  const { db, fcm } = admin();
  const now = new Date(); const out = { checked: 0, sent: 0, skipped: 0, removedTokens: 0 };
  const subs = await db.collection("push").where("on", "==", true).get();
  for (const doc of subs.docs) {
    out.checked++;
    const p = doc.data(); const { date, hour } = localNow(p.tz, now);
    const tokens = (p.tokens || []).filter(Boolean);
    if (hour !== Number(p.hour) || p.last === date || !tokens.length) { out.skipped++; continue; }
    const user = await db.collection("users").doc(doc.id).get();
    const msg = messageFor(user.exists ? user.data() : null, date);
    if (!msg) { await doc.ref.update({ last: date }); out.skipped++; continue; }
    const r = await fcm.sendEachForMulticast({
      tokens,
      data: { title: msg.title, body: msg.body, url: msg.url },
      webpush: { headers: { Urgency: "normal", TTL: "21600" }, fcmOptions: { link: APP_URL + msg.url } },
    });
    const dead = r.responses.map((x, i) => (!x.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(x.error?.code || "") ? tokens[i] : null)).filter(Boolean);
    out.sent += r.successCount; out.removedTokens += dead.length;
    await doc.ref.update({ last: date, tokens: tokens.filter((t) => !dead.includes(t)) });
  }
  return res.status(200).json(out);
}
