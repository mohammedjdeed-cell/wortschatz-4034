# Wortschatz 4034 – Handoff for a new conversation

> Paste this whole file as the first message of a new Claude Code session that has the GitHub repo
> **`mohammedjdeed-cell/wortschatz-4034`** attached with **push** access. Last updated after the section-4 session (commits `3aa0a2c` … `dbf4a2e`, 2026-11-14).

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
1. Publish the **latest `firestore.rules`** (Firestore → Rules → Publish). Needed for: Wort-Duell (`duels/{code}`, never tested live), the Arabic fields in the sentence cache, the **opt-in leaderboard** (`profiles` now need `visible: true`; until published, opting in fails quietly and the board stays empty), and **reminders** (`push/{uid}`).
2. Delete the leftover test document `profiles/<id>` named **"E2E Test"** in Firestore (with the new rules it is invisible anyway).
3. Daily reminders (optional), see README → "Daily reminders": `VITE_FIREBASE_VAPID_KEY` (Firebase → Cloud Messaging → Web Push certificates), `FIREBASE_SERVICE_ACCOUNT` (Vercel, secret), `CRON_SECRET` (Vercel **and** GitHub repo secret). Until then the setting says "noch nicht eingerichtet" and the hourly workflow skips itself.
4. Not yet verified live (the session had no permission to write to production Firebase / spend AI credits): leaderboard opt-in against real Firestore, the AI `check` mode (Sätze → Eigener Satz), and an end-to-end FCM push. All were tested with mocks.

## 2. Architecture (vanilla JS + Vite 8 + vite-plugin-pwa, no framework)

| File | Role |
|---|---|
| `index.html` | App shell. Top bar: brand, tabs (Heute · Themen · Üben · Wörter · Fortschritt), `?` help, EN/ع switch, avatar. On phones (≤720px) the tabs become a bottom tab bar |
| `src/main.js` | Router (hash `#view/arg`, `VIEWS` map, `TAB_OF`), Heute, Karten (flashcards), Wörter (dictionary + "Meine Wörter"), Fortschritt (stats, settings, leaderboard), account/auth sheet, global click/keydown/input handlers, boot + Firebase sync |
| `src/learn.js` | Themen pages, unit/lesson rows, **lesson session `#lektion/<unit>`** (intro → two-round mini-quiz → Nächste Lektion), practice hub (Üben), quiz engine (types de/tr/listen/cloze/art/type; solo, lesson, duel), Schreiben (typed recall), der/die/das trainer, Erklär's! (pass-and-play taboo), Wort-Duell (Firestore realtime), AI theme builder. Gets UI helpers from main via `initLearn(H)`. `leave()` clears timers and listeners on route change |
| `src/state.js` | Learning state `S` + **FSRS** scheduling (`ts-fsrs`; `answer(r, 1–4|bool)`, `preview`, `memory`, `quizMark`) + custom words + pack-word registration + own themes. `save()` → localStorage + `cloud.saveProgress` |
| `src/themes.js` | 22 built-in situational themes (from `data/cat.json`), CEFR bands, `unitsOf`, `themeOrder`, packs (`data/packs.json`), user themes (`setUserThemes`), `getTheme`, `findUnit` |
| `src/saetze.js` | **Sätze** (`#saetze/…`): Satzbau, Artikel & Kasus, Eigener Satz (AI `check`), Satzmuster (`data/patterns.json`). Mastery `S.used`, `S.pats` |
| `src/tour.js` | Welcome (choose EN/AR), spotlight tour (`STEPS`), per-page help (`HELP`) in EN + AR |
| `src/ai.js` | Sentence fetch: localStorage → Firestore `sentences/{rank}` → `/api/sentences`. `aiCall(mode, payload)`. `getCustomSentences` (lazy, for own words) |
| `src/cloud.js` | Firebase wrapper (lazy import): auth (popup on desktop, redirect on touch), progress doc, profiles/leaderboard, sentence cache, duel CRUD/watch |
| `src/visuals.js` | Emoji tiles (`data/emoji.json`, ~980 curated), preposition SVG diagrams + case badges, number dots, gender colours, Wikipedia photos (queued, max 2 parallel), frequency meter |
| `api/remind.js` | Hourly reminder sender (firebase-admin + FCM), called by `.github/workflows/remind.yml` with `CRON_SECRET` |
| `api/sentences.js` | Vercel function. Verifies the Firebase ID token (jose + Google JWKS), rate limit 40 req / 10 min per user, structured JSON outputs. **Modes:** `sentences` (default, ≤12 dictionary words), `words` (own-word lookup and correction, ≤25), `topic` (word suggestions), `theme` (whole course: name/emoji/desc/units), `translate` (Arabic glosses), `categorize` (theme ids), `check` (correct a learner sentence) |
| `firestore.rules` | `users/{uid}` owner only. `profiles/{uid}` read by signed-in users, write/delete by owner. `sentences/{rank}` public read, create-once by signed-in users. `duels/{code}` get by code, host/guest field-scoped updates |
| `src/style.css` | "Ink on paper" editorial design. Colour only for der (blue) / die (red) / das (ochre). Dark mode via tokens. No gradients or glow (the owner disliked the earlier neon look) |

**Data files (`src/data/`):** `words.json` (4034 entries, ranks renumbered by position: the source had 41 duplicate ranks), `ar.json` (Arabic gloss for every rank), `cat.json` (theme id per rank), `emoji.json`, `packs.json` (FSP Arzt: 144 words / 12 lessons; FSP Zahnarzt: 120 / 10; words are `{r}` when in the dictionary, otherwise full objects).

**Id ranges:**

| Range | What |
|---|---|
| 1–4034 | Dictionary ranks |
| 100001+ | Own words (`S.custom`) |
| 200001+ | Pack words; deterministic, file order — **don't reorder `packs.json`** or saved progress breaks |

**State `S` (synced to `users/{uid}`):** `start`, `cursor`, `goal`, `known{}`, `learn{r:{b,due,d,lap,qc,f}}` (`f` = FSRS memory {s,d,st,n,l,t,due,ls}; `b` = box 0–6 derived from stability for charts; `qc` = quiz right-answer count, ≥2 → typing questions), `today{date,ranks}`, `hist{date:count}`, `streak`, `xp`, `lang` ("en"/"ar"), `custom{}`, `nextCustom`, `path{mode:"freq"|"theme",theme}`, `themes{}` (own AI themes: `{name,emoji,desc,request,units:[{title,ids}]}`), `board{visible,name}` (leaderboard opt-in), `used{r:points}`, `pats{id:n}` (Sätze), `updated`.

## 3. How to work on it / test
- Build: `npm run build`.
- Test build without Firebase or login (AI calls then go unauthenticated):
  ```bash
  npx vite build --mode test --outDir <scratch>/dist-test
  ```
  ```bash
  npx vite preview --port 4173 --outDir <scratch>/dist-test
  ```
- Test suites (see README): `tests/smoke.mjs` (every button, phone + laptop), `tests/lesson.mjs`, `tests/saetze.mjs` (mocked AI), `tests/fsrs.mjs`, `tests/remind.mjs` (no browser).
- Browser tests: Playwright (pre-installed). Launch with `{proxy:{server:process.env.HTTPS_PROXY,bypass:'localhost'}}`. Mock the AI with `page.route('**/api/sentences', …)`. Check phones at 412×915 with `isMobile` and the laptop at 1440×900 / 1536×864.
- Live API tests:
  - create a throwaway account via `identitytoolkit … accounts:signUp?key=<public web key>`;
  - call `https://wortschatz-4034.vercel.app/api/sentences` with `Authorization: Bearer <idToken>`;
  - **always delete the account afterwards** (`accounts:delete`).
  - Node fetch needs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
- The cloud session needs these hosts allowed (personal environment "wortschatz-4034" exists): `wortschatz-4034.vercel.app`, `identitytoolkit.googleapis.com`, `firestore.googleapis.com`, `wortschatz-4034.firebaseapp.com`, `apis.google.com`, `accounts.google.com`, `www.gstatic.com`, `securetoken.googleapis.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `de.wikipedia.org`, `upload.wikimedia.org`.
- Commits end with the attribution lines the session provides. Push to `main` deploys.

## 4. Missions (status after the 2026-11-14 session)

| # | Item | Status | Commit |
|---|---|---|---|
| 4.1.1 | "Lernen" kicked you to Heute | Fixed: in-place lesson `#lektion/<unit>` with intro → mini-quiz → "Nächste Lektion →" | `9d8c798` |
| 4.1.2 | Quiz buttons stop responding | Fixed: `locked` stayed true when leaving mid-animation; answers now counted at once, `leave()`/render unlock; always 4 distinct options; smoke test | `3aa0a2c` |
| 4.1.3 | Lesson quizzes too easy | Done: listening, cloze, article + plural, typing; look-alike distractors; typing after 2 right answers | `9d8c798` |
| 4.2.4 | Leaderboard opt-in | Done (needs rules published) | `51766a7` |
| 4.2.5 | Nächste Lektion / "Weiter mit Lektion N" on Heute | Done | `9d8c798` |
| 4.2.6 | FSRS | Done: 4 grades with intervals, migration from Leitner, 90 % retention | `4937303` |
| 4.2.8 | Sätze | Done as a mode inside Üben (no 6th tab) | `b54d280` |
| 4.2.7 | Push notifications | Code done; needs owner setup (section 1, step 3) | `dbf4a2e` |

**Ideas for next:** verify the owner steps live; FSRS learning steps are minute-based but due dates are day-based (a card graded "Gut" while new can reappear in the same session right away); optimise FSRS parameters from the review history once there is enough data; AI explanations for the case in "Artikel & Kasus" (today it shows the genus only); more Satzmuster (Arzt-Arzt-Gespräch, Fachbegriff ↔ Laiensprache).

## 5. Feature inventory (what already works)
- **Heute:** daily new words (goal 5/10/15/20). Each word row has a tile, coloured article, gloss (EN/AR), rank, frequency meter, 🔊, "Kenne ich" swap, AI sentence + KLINIK sentence + plural/Perfekt/conjugation/synonym/antonym.
- **Learning path:** frequency order or a theme/pack/own theme (`S.path`).
- **Themen:**
  - 22 built-in themes by CEFR band;
  - FSP Arzt and FSP Zahnarzt packs;
  - own AI themes ("Thema erstellen", ~20 s, preview with dictionary-linked words, save/delete);
  - per lesson: Lernen / Weiterlernen / Üben / Wiederholen; quiz per theme.
- **Üben:**
  - Karteikarten: FSRS (Nochmal/Schwer/Gut/Leicht), flip, swipe, keyboard 1–4, directions DE→X / X→DE / Bild→DE;
  - Sätze: Satzbau, Artikel & Kasus, Eigener Satz (AI), Satzmuster;
  - Schreiben: article required, typo- and synonym-tolerant, umlaut buttons;
  - Schnell-Quiz: 10 questions with same-theme distractors;
  - der/die/das: 20 nouns, streak;
  - Erklär's!: 2 teams, timer, rounds, word source;
  - Wort-Duell: code/link, realtime, live scores, needs the rules published.
- **Wörter:** search in DE/EN/AR or by #rank, filters, word sheet. "Meine Wörter": paste words → dictionary match first, then AI lookup/correction; AI topic suggestions; own words get lazy AI sentences.
- **Fortschritt:** 4034-cell dictionary map, memory chart (FSRS stability), 26-week heatmap, opt-in leaderboard, reminder, settings (level, translation language, goal, theme, photos, speech rate, tour/help, export/import JSON, reset).
- **Accounts:**
  - Google + email login, realtime sync across devices, local-only mode without login;
  - AI needs a login (the endpoint verifies the token).
- **Tutorial:** first-visit welcome (EN/AR), spotlight tour, `?` help per page in EN/AR, restart from settings.
- **PWA:** installable, offline, Wikipedia photos cached.

## 6. Prompt to start the next session
> "Continue the Wortschatz 4034 app (repo attached). Read `docs/HANDOFF.md` first. Ask me which owner steps in section 1 are done, then verify those features live. Run the test suites in `tests/` before and after every change. Commit and push after each item and keep the README in sync."
