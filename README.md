# Wortschatz 4034

Ten German words a day from *A Frequency Dictionary of German* (Jones & Tschirner), most common first. It is a Leitner-box flashcard trainer with multiple accounts, cloud sync, pictures for each word, and AI example sentences (one everyday sentence and one clinical sentence). It is built for Fachsprachprüfung preparation.

| Layer | Tech | Role |
|---|---|---|
| Frontend | Vite + vanilla JS (ES modules), PWA | Installable app; works offline |
| Accounts + DB | Firebase Auth (Google, email) + Firestore | Each user has their own progress; leaderboard; shared sentence cache |
| Hosting | Firebase Hosting (primary) **and** Vercel (Git-connected previews) | Same static build on both |
| AI | Vercel Serverless Function `api/sentences.js` → Claude API | Writes example sentences, emoji, plural, conjugation, synonyms and antonyms. Each word is generated **once** and cached in Firestore for all users |

## Features
- **Heute (Today):** your daily words, each with a visual tile. Tick a word you already know and a new one takes its place.
- **Karten (Flashcards):** 3D flip cards in three modes: DE → EN, EN → DE, and **Bild → DE** (picture to German). Swipe left or right, or use Space / ← / →. Leitner boxes 1–7 with review intervals of 0/1/2/4/8/16/32 days.
- **Wörter (Dictionary):** search all 4034 words in German or English, or by `#rank`. Filter by part of speech and learning status. Each word opens in a detail sheet.
- **Fortschritt (Progress):** a 4034-cell dictionary map, Leitner box chart, activity heatmap, streak, XP, a leaderboard, settings, and JSON backup/restore.
- **Visuals:**
  - About 980 hand-picked emoji, plus AI emoji for the remaining words.
  - Wikipedia photos for nouns.
  - Spatial diagrams for prepositions, with a case badge (Akk / Dat / Wechsel / Gen).
  - Dot grids for numbers.
  - Colour coding for der, die and das.
  - A frequency meter.
- German text-to-speech for words and sentences.

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
4. For the Firebase-hosted build, set `VITE_API_BASE=https://<app>.vercel.app` so that build calls the Vercel AI endpoint.

**AI cost:** sentences are cached in Firestore (`sentences/{rank}`), so all 4034 words are generated at most once in total, not once per user. The function runs at `effort: "low"`, sends up to 12 words per request, and is rate-limited to 30 requests per user per 10 minutes.

## 3 · Local development
```bash
npm install
cp .env.example .env.local   # fill in the Firebase values (optional)
npm run dev
```
Without Firebase values, the app runs in local-only mode: progress is kept in localStorage and there is no login. Use `vercel dev` to run the AI function locally as well.

## Data model (Firestore)
| Path | Who | Content |
|---|---|---|
| `users/{uid}` | owner only | full learning state (Leitner boxes, known words, daily queue, history, streak, XP) |
| `profiles/{uid}` | read: signed-in users; write: owner | name, photo, known/learning counts, streak, XP (for the leaderboard) |
| `sentences/{rank}` | read: anyone; create-once: signed-in users | AI example sentences + visual hints |

Rules are in `firestore.rules`.

## Notes
- The word list comes from the original single-file app. In that file, 41 entries had duplicate rank numbers, which made those words unreachable. The list was already in frequency order, so the ranks were renumbered by position and all 4034 words are now reachable.
- The state format of the old app (v1) is still accepted. When the new app runs on the same origin, it upgrades that data automatically. Backup import also accepts v1 JSON.
- Photos come from Wikipedia/Wikimedia Commons via the public REST API. They can be turned off under **Fortschritt → Einstellungen**.
