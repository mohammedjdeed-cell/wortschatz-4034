# Wortschatz 4034

Ten German words a day from *A Frequency Dictionary of German* (Jones & Tschirner), most common first. It is a spaced-repetition flashcard trainer (FSRS) with multiple accounts, cloud sync, pictures for each word, and AI example sentences (one everyday sentence and one clinical sentence). It is built for Fachsprachprüfung preparation.

| Layer | Tech | Role |
|---|---|---|
| Frontend | Vite + vanilla JS (ES modules), PWA | Installable app; works offline |
| Accounts + DB | Firebase Auth (Google, email) + Firestore | Each user has their own progress; leaderboard; shared sentence cache |
| Hosting | Firebase Hosting (primary) **and** Vercel (Git-connected previews) | Same static build on both |
| AI | Vercel Serverless Function `api/sentences.js` → Claude API | Writes example sentences, emoji, plural, conjugation, synonyms and antonyms. Each word is generated **once** and cached in Firestore for all users |

## Features
- **Heute (Today):** your daily words, each with a visual tile. Tick a word you already know ("Kenne ich"): it stays in today's list marked as known and skips the card box, so the day keeps its size (5/10/15/20/30 words); untick to undo. "+ N Wörter" adds more.
- **Karten (Flashcards):** 3D flip cards in three modes: DE → EN, EN → DE, and **Bild → DE** (picture to German). Rate each card **Nochmal / Schwer / Gut / Leicht** (keys 1–4, ← / →, or swipe); each button shows when the card comes back. Scheduling is **FSRS** (`ts-fsrs`, target retention 90 %, fuzz on): every word has its own stability and difficulty. Existing Leitner boxes were migrated on first review (stability = old box interval). Learning steps (1–10 min) keep a card in today's deck; due dates are day-based.
- **Wörter (Dictionary):** search all 4034 words in German or English, or by `#rank`. Filter by part of speech and learning status. Each word opens in a detail sheet.
- **Fortschritt (Progress):** a 4034-cell dictionary map, memory chart (cards by FSRS stability), activity heatmap, streak, XP, an opt-in leaderboard (editable display name, top 20 plus your own rank), settings, and JSON backup/restore.
- **Visuals:**
  - About 980 hand-picked emoji, plus AI emoji for the remaining words.
  - Wikipedia photos for nouns.
  - Spatial diagrams for prepositions, with a case badge (Akk / Dat / Wechsel / Gen).
  - Dot grids for numbers.
  - Colour coding for der, die and das.
  - A frequency meter.
- German text-to-speech for words and sentences.
- **Meine Wörter (own words):**
  - Type your own words (any spelling, with or without article). Each word is matched against the 4034-word dictionary first; the AI fills in the rest.
  - Or ask for a topic ("Körper", "Kardiologie", "Technik") and the AI suggests words at your level. Words already in the dictionary are linked to it rather than duplicated.
- **Lektionen:** "Lernen" in a theme opens the lesson in place: the ~10 words one by one (picture, word, meaning, 🔊, sentence), then a mini-quiz in two rounds mixed with a few earlier words, then **Nächste Lektion →**. With a theme as learning path, Heute shows "Weiter mit Lektion N".
- **Quiz types:** meaning, listening (TTS), sentence gap (cloze), article + plural, typed recall; look-alike distractors (edit distance ≤ 2 or same prefix). A word answered right twice is asked as typing from then on.
- **Themen:** 22 situational themes with level-ordered lessons, two exam packs (**FSP Arzt** and **FSP Zahnarzt**, Düsseldorf, `src/data/packs.json`, ordered by exam part), and **own themes built by the AI** from any request (e.g. "Fach Zahnarzt – Prothetik").
- **Sätze** (in Üben): from word to sentence. **Satzbau** (tap the words of the example sentence into order, your word highlighted), **Artikel & Kasus** (fill the article gap: der/den/dem/des …), **Eigener Satz** (write a sentence with the word; the AI corrects it and explains each mistake in EN/AR, API mode `check`), and **Satzmuster** (`src/data/patterns.json`: verb + preposition + case, Nebensätze, Passiv, Konjunktiv II, FSP Anamnese, Aufklärung, Arztbrief). Per word it tracks "sicher im Satz" (`S.used`, 2 points = can use it); the word sheet has "Satz bilden".
- **Üben:** flashcards, typed recall, quick quiz, der/die/das trainer, Sätze; for two people: Erklär's! (one phone) and Wort-Duell (online).
- **Erinnerung (daily reminder):** web push via Firebase Cloud Messaging. Fortschritt → Erinnerung: on/off and hour of day. One message a day, only when cards are due or the streak is at risk. On iPhone it only works in the installed app (home screen).
- **Tutorial:** first-visit welcome with the choice of English or Arabic, a guided spotlight tour, and a "?" help page for every screen (`src/tour.js`).
- **Translation language:** German ↔ English or German ↔ Arabic (switch in the header). All 4034 words have an Arabic meaning (`src/data/ar.json`); new AI example sentences come with Arabic translations. The dictionary search also accepts Arabic.

---

## 1 · Firebase (accounts, database, hosting)
1. Go to <https://console.firebase.google.com> and click **Add project** (Google Analytics is optional).
2. **Build → Authentication → Get started.** Enable **Google** and **Email/Password**.
   - Under **Settings → Authorized domains**, add your Vercel domain (e.g. `wortschatz-4034.vercel.app`).
3. **Build → Firestore Database → Create database.** Choose production mode and the `eur3` region (Europe).
4. **Settings → General → Your apps → Web app (</>).** Register it. The public config for this project is already committed in `.env.production` and `.env.development`; this config is not secret.
5. Deploy the rules and hosting from your machine:
   ```bash
   npm i -g firebase-tools
   firebase login
   cp .firebaserc.example .firebaserc   # put your project id inside
   npm install
   npm run deploy:firebase             # builds, then deploys hosting + firestore.rules
   ```
   The app goes live at `https://<project-id>.web.app`.

### Automatic Firebase deploys from GitHub (optional)
The workflow `.github/workflows/firebase-hosting.yml` deploys every push to `main` and posts a preview URL on pull requests. To set it up:
1. Run `firebase init hosting:github`. This creates the `FIREBASE_SERVICE_ACCOUNT` secret for you. Answer **No** when it asks to overwrite the workflow.
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions** and add the following.
   - **Variables:**
     - `FIREBASE_PROJECT_ID`
     - `VITE_API_BASE` (your Vercel URL)
   - **Secrets:**
     - `VITE_FIREBASE_API_KEY`
     - `VITE_FIREBASE_MESSAGING_SENDER_ID`
     - `VITE_FIREBASE_APP_ID`

The workflow skips itself until `FIREBASE_PROJECT_ID` is set.

## 2 · Vercel (Git connection + AI endpoint)
1. Go to <https://vercel.com/new> and import this GitHub repo. Vercel detects the framework (Vite) and reads `vercel.json`.
2. Under **Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your Claude API key (server-only) |
   | `FIREBASE_PROJECT_ID` | your Firebase project id. The function only accepts signed-in users, by verifying their Firebase ID token |
   | `VITE_FIREBASE_*` | the same six values as in `.env.local` |
   | `ALLOWED_ORIGINS` *(optional)* | `https://<id>.web.app,https://<id>.firebaseapp.com,https://<app>.vercel.app` |
   | `ANTHROPIC_MODEL` *(optional)* | defaults to `claude-haiku-5-5` (about $0.50 for the whole dictionary). Set `claude-opus-5-5` for the highest quality (about $13) |

3. Redeploy. Every push to `main` now deploys to production, and every branch or PR gets a preview URL.

### Daily reminders (optional)
1. Firebase console → **Project settings → Cloud Messaging → Web Push certificates → Generate key pair**. Copy the public key and set it as `VITE_FIREBASE_VAPID_KEY` (Vercel env var, or in `.env.production`; it is public).
2. Firebase console → **Project settings → Service accounts → Generate new private key**. Paste the whole JSON as the Vercel env var `FIREBASE_SERVICE_ACCOUNT` (secret, server only).
3. Pick a random string and set it as Vercel env var `CRON_SECRET` **and** as GitHub repo secret `CRON_SECRET`.
4. Publish the latest `firestore.rules` (they contain `push/{uid}`), then redeploy.

`.github/workflows/remind.yml` calls `POST /api/remind` every hour (Vercel Hobby crons run at most once a day). The function sends to learners whose chosen hour (in their own time zone) is now and who were not reminded today, and drops dead tokens. GitHub pauses scheduled workflows after 60 days without repo activity; re-enable it under Actions if reminders stop.
4. For the Firebase-hosted build, set `VITE_API_BASE=https://<app>.vercel.app` so that build calls the Vercel AI endpoint.

**AI cost:** sentences are cached in Firestore (`sentences/{rank}`), so all 4034 words are generated at most once in total, not once per user. The function runs at `effort: "low"`, sends up to 12 words per request, and is rate-limited to 30 requests per user per 10 minutes.

## 3 · Local development
```bash
npm install
cp .env.example .env.local   # fill in the Firebase values (optional)
npm run dev
```
Without Firebase values, the app runs in local-only mode: progress is kept in localStorage and there is no login. Use `vercel dev` to run the AI function locally as well.

### Smoke test (Playwright)
```bash
npx vite build --mode test --outDir /tmp/dist-test
npx vite preview --port 4173 --outDir /tmp/dist-test &
node tests/smoke.mjs
```
`node tests/known.mjs` checks "Kenne ich" (word stays, undo). `node tests/saetze.mjs` covers the Sätze modes with a mocked AI. `node tests/fsrs.mjs` and `node tests/remind.mjs` check scheduling and reminder logic without a browser. `node tests/lesson.mjs` walks a lesson (intro → all quiz types → next lesson → Heute link → typing) with a mocked AI. `tests/smoke.mjs` opens every view on a phone (412×915) and a laptop (1440×900), clicks every visible button once and fails on page errors or an empty page. `VIEWS=quiz,artikel node tests/smoke.mjs` limits it to some views.

## Data model (Firestore)
| Path | Who | Content |
|---|---|---|
| `users/{uid}` | owner only | full learning state (FSRS memory per card `learn[r].f`, known words, daily queue, history, streak, XP) |
| `profiles/{uid}` | read: owner, or signed-in users when `visible`; write: owner | leaderboard card, **only while the learner opted in** (Fortschritt → Rangliste → "Auf der Rangliste zeigen"): display name, photo, known/learning counts, streak, XP, `visible: true`. Switching off deletes it |
| `sentences/{rank}` | read: anyone; create-once: signed-in users | AI example sentences + visual hints |
| `push/{uid}` | owner only (server reads with the Admin SDK) | reminder on/off, hour, time zone, FCM tokens of the learner's devices, last reminder date |

Rules are in `firestore.rules`.

## Notes
- The word list comes from the original single-file app. In that file, 41 entries had duplicate rank numbers, which made those words unreachable. The list was already in frequency order, so the ranks were renumbered by position and all 4034 words are now reachable.
- The state format of the old app (v1) is still accepted. When the new app runs on the same origin, it upgrades that data automatically. Backup import also accepts v1 JSON.
- Photos come from Wikipedia/Wikimedia Commons via the public REST API. They can be turned off under **Fortschritt → Einstellungen**.
