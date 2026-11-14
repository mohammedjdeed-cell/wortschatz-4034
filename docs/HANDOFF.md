# Wortschatz 4034 – Handoff for a new conversation

> Paste this whole file as the first message of a new Claude Code session that has the GitHub repo
> **`mohammedjdeed-cell/wortschatz-4034`** attached with **push** access. Last updated after commit `293cca7`.

## 0. Who / what
- **Owner:** Dr. Mohammed Jdeed. He is a medical doctor in Krefeld, preparing for the **Fachsprachprüfung (FSP), Ärztekammer Nordrhein, Düsseldorf**. Native Arabic, fluent English, German B2 → C1.
- **App:** PWA vocabulary trainer for the 4,034 most frequent German words (Jones & Tschirner frequency dictionary), plus FSP exam packs and own words/themes. Multi-user with accounts.
- **Preferred style:** direct and dense, no filler. Tables and steps. Peer tone.

## 1. Live infrastructure

| Piece | Value |
|---|---|
| Live app | https://wortschatz-4034.vercel.app (Vercel, auto-deploys every push to `main`) |
| Repo | https://github.com/mohammedjdeed-cell/wortschatz-4034 (public, no secrets in it) |
| Firebase project | `wortschatz-4034`: Auth (Google + Email/Password; **Anonymous disabled**), Firestore `(default)` in `eur3`, Spark plan |
| Google sign-in | Uses the app domain as `authDomain`. Vercel proxies `/__/auth/*` to `wortschatz-4034.firebaseapp.com`. The OAuth client lists the redirect URI `https://wortschatz-4034.vercel.app/__/auth/handler`. Firebase authorised domains include `wortschatz-4034.vercel.app` |
| Vercel env vars | `ANTHROPIC_API_KEY` (secret, never in repo), `FIREBASE_PROJECT_ID=wortschatz-4034`. The public Firebase web config is committed in `.env.production` / `.env.development` (not secret) |
| AI | Claude **Haiku 5.5** (`claude-haiku-5-5`), set in `api/sentences.js`; override with `ANTHROPIC_MODEL`. Paid from the owner's Claude Console API credits ($5 bought, $5/month spend limit, auto-reload off). Total spend so far: well under $1 |
| Custom domain | None. A typo domain `wortschtz.jd` was added and then removed; don't re-add it. A real domain also needs Firebase authorised domains + the OAuth redirect URI |

**Owner steps that may still be open — ask him:**
1. Publish the **latest `firestore.rules`** (Firestore → Rules → Publish). Needed for **Wort-Duell** (`duels/{code}`) and for the Arabic fields in the sentence cache. The duel has **never been tested live** for this reason.
2. Delete the leftover test document `profiles/<id>` named **"E2E Test"** in Firestore.

## 2. Architecture (vanilla JS + Vite 8 + vite-plugin-pwa, no framework)

| File | Role |
|---|---|
| `index.html` | App shell. Top bar: brand, tabs (Heute · Themen · Üben · Wörter · Fortschritt), `?` help, EN/ع switch, avatar. On phones (≤720px) the tabs become a bottom tab bar |
| `src/main.js` | Router (hash `#view/arg`, `VIEWS` map, `TAB_OF`), Heute, Karten (flashcards), Wörter (dictionary + "Meine Wörter"), Fortschritt (stats, settings, leaderboard), account/auth sheet, global click/keydown/input handlers, boot + Firebase sync |
| `src/learn.js` | Themen pages, unit/lesson rows, practice hub (Üben), quiz engine (solo + duel), Schreiben (typed recall), der/die/das trainer, Erklär's! (pass-and-play taboo), Wort-Duell (Firestore realtime), AI theme builder. Gets UI helpers from main via `initLearn(H)`. `leave()` clears timers and listeners on route change |
| `src/state.js` | Learning state `S` + Leitner logic + custom words + pack-word registration + own themes. `save()` → localStorage + `cloud.saveProgress` |
| `src/themes.js` | 22 built-in situational themes (from `data/cat.json`), CEFR bands, `unitsOf`, `themeOrder`, packs (`data/packs.json`), user themes (`setUserThemes`), `getTheme`, `findUnit` |
| `src/tour.js` | Welcome (choose EN/AR), spotlight tour (`STEPS`), per-page help (`HELP`) in EN + AR |
| `src/ai.js` | Sentence fetch: localStorage → Firestore `sentences/{rank}` → `/api/sentences`. `aiCall(mode, payload)`. `getCustomSentences` (lazy, for own words) |
| `src/cloud.js` | Firebase wrapper (lazy import): auth (popup on desktop, redirect on touch), progress doc, profiles/leaderboard, sentence cache, duel CRUD/watch |
| `src/visuals.js` | Emoji tiles (`data/emoji.json`, ~980 curated), preposition SVG diagrams + case badges, number dots, gender colours, Wikipedia photos (queued, max 2 parallel), frequency meter |
| `api/sentences.js` | Vercel function. Verifies the Firebase ID token (jose + Google JWKS), rate limit 40 req / 10 min per user, structured JSON outputs. **Modes:** `sentences` (default, ≤12 dictionary words), `words` (own-word lookup and correction, ≤25), `topic` (word suggestions), `theme` (whole course: name/emoji/desc/units), `translate` (Arabic glosses), `categorize` (theme ids) |
| `firestore.rules` | `users/{uid}` owner only. `profiles/{uid}` read by signed-in users, write/delete by owner. `sentences/{rank}` public read, create-once by signed-in users. `duels/{code}` get by code, host/guest field-scoped updates |
| `src/style.css` | "Ink on paper" editorial design. Colour only for der (blue) / die (red) / das (ochre). Dark mode via tokens. No gradients or glow (the owner disliked the earlier neon look) |

**Data files (`src/data/`):** `words.json` (4034 entries, ranks renumbered by position: the source had 41 duplicate ranks), `ar.json` (Arabic gloss for every rank), `cat.json` (theme id per rank), `emoji.json`, `packs.json` (FSP Arzt: 144 words / 12 lessons; FSP Zahnarzt: 120 / 10; words are `{r}` when in the dictionary, otherwise full objects).

**Id ranges:**

| Range | What |
|---|---|
| 1–4034 | Dictionary ranks |
| 100001+ | Own words (`S.custom`) |
| 200001+ | Pack words; deterministic, file order — **don't reorder `packs.json`** or saved progress breaks |

**State `S` (synced to `users/{uid}`):** `start`, `cursor`, `goal`, `known{}`, `learn{r:{b,due,d,lap}}` (Leitner boxes 0–6, intervals `[0,1,2,4,8,16,32]` days), `today{date,ranks}`, `hist{date:count}`, `streak`, `xp`, `lang` ("en"/"ar"), `custom{}`, `nextCustom`, `path{mode:"freq"|"theme",theme}`, `themes{}` (own AI themes: `{name,emoji,desc,request,units:[{title,ids}]}`), `updated`.

## 3. How to work on it / test
- Build: `npm run build`.
- Test build without Firebase or login (AI calls then go unauthenticated):
  ```bash
  npx vite build --mode test --outDir <scratch>/dist-test
  ```
  ```bash
  npx vite preview --port 4173 --outDir <scratch>/dist-test
  ```
- Browser tests: Playwright (pre-installed). Launch with `{proxy:{server:process.env.HTTPS_PROXY,bypass:'localhost'}}`. Mock the AI with `page.route('**/api/sentences', …)`. Check phones at 412×915 with `isMobile` and the laptop at 1440×900 / 1536×864.
- Live API tests:
  - create a throwaway account via `identitytoolkit … accounts:signUp?key=<public web key>`;
  - call `https://wortschatz-4034.vercel.app/api/sentences` with `Authorization: Bearer <idToken>`;
  - **always delete the account afterwards** (`accounts:delete`).
  - Node fetch needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
- The cloud session needs these hosts allowed (personal environment "wortschatz-4034" exists): `wortschatz-4034.vercel.app`, `identitytoolkit.googleapis.com`, `firestore.googleapis.com`, `wortschatz-4034.firebaseapp.com`, `apis.google.com`, `accounts.google.com`, `www.gstatic.com`, `securetoken.googleapis.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `de.wikipedia.org`, `upload.wikimedia.org`.
- Commits end with the attribution lines the session provides. Push to `main` deploys.

## 4. Open missions (owner's list, latest first) with diagnosis

### 4.1 Bugs
1. **"Lernen" in Themen throws you to the first page.** Cause: `learn.js` `onClick` → `d.unit` handler ends with `location.hash = "heute"` (by design, but it feels like being kicked out).
   **Fix:** stay in the theme. Open an in-place lesson session: introduce the 10 words one by one (picture, word, meaning, 🔊, sentence) → mini-quiz → "Lektion fertig ✓" → **"Nächste Lektion →"** button. Still add the words to the box (`St.startUnit`).
2. **Quiz / buttons "do funny stuff", "quiz shows only one question with no options".** Likely causes to verify by reproducing in Playwright:
   - `answerOpt` sets `quiz.locked = true` and resets it only inside a `setTimeout` that is pushed to `timers`. If the route changes before it fires, `leave()` clears it and `quiz.locked` stays `true` forever: the options no longer respond. **Fix:** reset `locked`/`ended` in `leave()`, or recreate the quiz on entry.
   - `route()` calls `Learn.leave()` whenever view **or arg** changes. `startQuiz` changes the hash, and the timing between `leave` and render may race.
   - Global click delegation in `main.js` uses `e.target.closest("button,[data-open],#flipInner")` and `dataset` keys. Watch for collisions, e.g. `data-theme` = light/dark appearance vs. theme ids (learn uses `data-theme-id`, OK), and `data-start` level buttons rendered inside other views.
   - The quiz for a small pool (one lesson = 10 words, or packs with few words of the same word class) can produce fewer than 4 options or repeat the same words. **Fix:** always pad distractors from a wider pool, never fewer than 4 options; for a lesson quiz mix lesson words with already-learned words.
   - Write a Playwright "click every button on every view" smoke test.
3. **Lesson quizzes too easy.**
   - Options are translations, so recognition is easy. Add harder types:
     - pick the right **article + plural**;
     - **cloze**: the sentence from the AI with the target word blanked;
     - **typing** instead of multiple choice for lesson review;
     - **listening**: TTS, then choose or type;
     - distractors that look or sound similar (Levenshtein ≤ 2, same prefix) and same theme.
   - Adapt difficulty: after 2 correct answers, switch that word to typing.

### 4.2 Features
4. **Leaderboard opt-in for every registered user.** Today *every* signed-in user's profile is written on save (`cloud.saveProgress` → `profiles/{uid}`), and only the top 20 by XP are shown.
   - **Wanted:** a setting **"Auf der Rangliste zeigen"** (+ editable display name) in Fortschritt.
   - Store `visible: true/false` in the profile.
   - Query `where('visible','==',true).orderBy('xp','desc')` (needs a composite index: add it to `firestore.indexes.json`), or filter on the client.
   - Show your own rank even when you're outside the top 20.
   - Update the rules' `hasOnly` key list.
5. **"Nächste Lektion" flow:** see 4.1.1. Also show "Weiter mit Lektion N" on Heute when the path is a theme.
6. **Better spaced repetition ("top quality learning methods, timing").** Replace Leitner with **FSRS** (`ts-fsrs` npm package):
   - per-card stability, difficulty and due date;
   - four buttons: Nochmal / Schwer / Gut / Leicht;
   - migrate the existing boxes to an initial stability;
   - target retention 90 %;
   - keep `St.dueDeck()` and `St.answer()` as the API, so Karten and Schreiben keep working;
   - show "next review in X days" on each button.
7. **Push notifications** (daily reminder: "N Karten fällig").
   - Firebase Cloud Messaging web push (`firebase/messaging`) and a service-worker handler (vite-plugin-pwa `injectManifest`, or a separate `firebase-messaging-sw.js`).
   - Store tokens in `push/{uid}` (with a rules entry).
   - A Vercel Cron (`vercel.json` → `crons`) calls `/api/remind` daily, which reads users with due cards (needs `firebase-admin` with a service-account env var) and sends via FCM.
   - Settings: toggle + time of day.
   - iOS only supports push for the installed PWA (home screen).
8. **New tab "Sätze" (turn words into structures).** Ideas, all with the target word highlighted:
   - (a) **word order**: drag/tap word tiles into the correct order (from AI sentences);
   - (b) **cloze** with an article/case/ending choice;
   - (c) **build your own sentence** with the word: the AI checks grammar and gives a corrected version plus a short explanation (new API mode `check`);
   - (d) **sentence patterns**: verb + preposition + case (e.g. *sich beschweren über + Akk*), Nebensatz (weil/dass), Passiv, Konjunktiv II; FSP phrases (Anamnese questions, Aufklärung phrases).
   - Track mastery per word ("can use in a sentence").
   - Probably replace one tab, or put it inside Üben. Five tabs is the mobile maximum.

## 5. Feature inventory (what already works)
- **Heute:** daily new words (goal 5/10/15/20). Each word row has a tile, coloured article, gloss (EN/AR), rank, frequency meter, 🔊, "Kenne ich" swap, AI sentence + KLINIK sentence + plural/Perfekt/conjugation/synonym/antonym.
- **Learning path:** frequency order or a theme/pack/own theme (`S.path`).
- **Themen:**
  - 22 built-in themes by CEFR band;
  - FSP Arzt and FSP Zahnarzt packs;
  - own AI themes ("Thema erstellen", ~20 s, preview with dictionary-linked words, save/delete);
  - per lesson: Lernen / Weiterlernen / Üben / Wiederholen; quiz per theme.
- **Üben:**
  - Karteikarten: Leitner, flip, swipe, keyboard, directions DE→X / X→DE / Bild→DE;
  - Schreiben: article required, typo- and synonym-tolerant, umlaut buttons;
  - Schnell-Quiz: 10 questions with same-theme distractors;
  - der/die/das: 20 nouns, streak;
  - Erklär's!: 2 teams, timer, rounds, word source;
  - Wort-Duell: code/link, realtime, live scores, needs the rules published.
- **Wörter:** search in DE/EN/AR or by #rank, filters, word sheet. "Meine Wörter": paste words → dictionary match first, then AI lookup/correction; AI topic suggestions; own words get lazy AI sentences.
- **Fortschritt:** 4034-cell dictionary map, Leitner bars, 26-week heatmap, leaderboard, settings (level, translation language, goal, theme, photos, speech rate, tour/help, export/import JSON, reset).
- **Accounts:**
  - Google + email login, realtime sync across devices, local-only mode without login;
  - AI needs a login (the endpoint verifies the token).
- **Tutorial:** first-visit welcome (EN/AR), spotlight tour, `?` help per page in EN/AR, restart from settings.
- **PWA:** installable, offline, Wikipedia photos cached.

## 6. Prompt to start the next session
> "Continue the Wortschatz 4034 app (repo attached). Read `docs/HANDOFF.md` first. Start with the bugs in 4.1: reproduce each with Playwright, fix, retest on phone and laptop sizes. Then do 4.2 in this order: leaderboard opt-in, next-lesson flow, FSRS, Sätze tab, push notifications. Commit and push after each item and keep the README in sync."
