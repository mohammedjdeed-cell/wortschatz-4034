// Guided tour (spotlight on each part of the screen) and per-page help, in English or Arabic.
// The app UI stays German on purpose; explanations follow the learner's translation language.
import * as St from "./state.js";

const T = (en, ar) => ({ en, ar });
const L = () => (St.S.lang === "ar" ? "ar" : "en");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const UI = {
  next: T("Next", "التالي"), back: T("Back", "رجوع"), skip: T("Skip tour", "تخطّي الجولة"), done: T("Let's start", "لنبدأ"),
  of: T("of", "من"), help: T("Help", "مساعدة"), tour: T("Start the guided tour", "ابدأ الجولة التعريفية"), close: T("Close", "إغلاق"),
};

/* ---------- guided tour ---------- */
const STEPS = [
  { view: "heute", sel: null, ...{ t: T("Welcome to Wortschatz 4034", "مرحبًا بك في Wortschatz 4034"), b: T(
    "You learn the 4,034 most frequent German words – about 85 % of everyday texts – plus exam vocabulary for the Fachsprachprüfung. The app itself is in German on purpose, so you practise while you click. This tour shows you every part in one minute.",
    "تتعلم هنا أكثر 4034 كلمة ألمانية استخدامًا – وهي تغطي نحو 85٪ من النصوص اليومية – بالإضافة إلى مفردات امتحان اللغة الطبية (Fachsprachprüfung). واجهة التطبيق بالألمانية عن قصد، لتتمرن أثناء الاستخدام. هذه الجولة تعرّفك بكل جزء في دقيقة واحدة.") } },
  { view: "heute", sel: ".langseg", t: T("Translation language", "لغة الترجمة"), b: T(
    "EN shows meanings and example sentences in English, ع in Arabic. Your choice is saved to your account – switch any time.",
    "زر EN يعرض المعاني والأمثلة بالإنجليزية، وزر ع بالعربية. يُحفظ اختيارك في حسابك ويمكنك التبديل في أي وقت.") },
  { view: "heute", sel: "#accountBtn", t: T("Your account", "حسابك"), b: T(
    "Sign in with Google or e-mail. Then your progress syncs between phone and laptop, AI example sentences load, and you can play duels with friends.",
    "سجّل الدخول عبر Google أو البريد الإلكتروني. عندها يتزامن تقدّمك بين الهاتف والحاسوب، وتظهر جمل الأمثلة المولّدة بالذكاء الاصطناعي، ويمكنك منافسة أصدقائك.") },
  { view: "heute", sel: "#dock", t: T("Five sections", "خمسة أقسام"), b: T(
    "Heute – today's new words. Themen – lessons by topic and the FSP packs. Üben – practice and games. Wörter – dictionary and your own words. Fortschritt – statistics and settings.",
    "Heute: كلمات اليوم الجديدة. Themen: دروس حسب الموضوع وحزم امتحان FSP. Üben: التمارين والألعاب. Wörter: القاموس وكلماتك الخاصة. Fortschritt: الإحصائيات والإعدادات.") },
  { view: "heute", sel: ".levels", when: () => !St.S.start, t: T("Choose your start level", "اختر مستوى البداية"), b: T(
    "A1 starts with the most common word; B1 skips the first 899, C1 the first 2,499. You pick one right after this tour – and can change it later under Fortschritt.",
    "A1 يبدأ من أكثر كلمة شيوعًا؛ B1 يتخطى أول 899 كلمة، وC1 أول 2499 كلمة. تختار مستواك بعد انتهاء الجولة مباشرة – ويمكنك تغييره لاحقًا من قسم Fortschritt.") },
  { view: "heute", sel: "#stats", when: () => !!St.S.start, t: T("Your day at a glance", "يومك في لمحة"), b: T(
    "Heute: words done today out of your goal. Fällig: cards due for review. Serie: days in a row. Am Lernen: words in your card box. Bekannt: words you already know.",
    "Heute: ما أنجزته اليوم من هدفك. Fällig: البطاقات المستحقة للمراجعة. Serie: عدد الأيام المتتالية. Am Lernen: الكلمات في صندوق البطاقات. Bekannt: الكلمات التي تعرفها.") },
  { view: "heute", sel: ".wrow", when: () => !!St.S.start, t: T("One word, everything you need", "كل ما تحتاجه عن الكلمة"), b: T(
    "Picture or diagram, the article in colour (der blue · die red · das yellow), meaning and frequency. 🔊 reads it aloud. ‘Kenne ich’ means you already know it – it is replaced by a new word at once. Underneath: an everyday sentence and a clinical sentence (KLINIK).",
    "صورة أو رسم توضيحي، وأداة التعريف بلون مميز (der أزرق · die أحمر · das أصفر)، والمعنى ومدى شيوع الكلمة. زر 🔊 ينطق الكلمة. زر ‹Kenne ich› يعني أنك تعرفها فتُستبدل فورًا بكلمة جديدة. وفي الأسفل جملة يومية وجملة من سياق المستشفى (KLINIK).") },
  { view: "heute", sel: '[data-act="practice"]', when: () => !!St.S.start, t: T("Review and more words", "المراجعة والمزيد من الكلمات"), b: T(
    "‘Üben’ opens your due flashcards. ‘+10 Wörter’ gives you ten more new words today. Under the date you see your ‘Lernweg’ – where new words come from.",
    "زر ‹Üben› يفتح بطاقات المراجعة المستحقة. زر ‹+10 Wörter› يضيف عشر كلمات جديدة اليوم. وتحت التاريخ ترى ‹Lernweg›، أي مصدر كلماتك الجديدة.") },
  { view: "themen", sel: ".themes", t: T("Themes and exam packs", "المواضيع وحزم الامتحان"), b: T(
    "Words grouped by situation, in lessons of about 10 from easy to hard – that sticks better than random lists. Start a lesson with ‘Lernen’, or make a theme your ‘Lernweg’. You also find the FSP packs for doctors and dentists in Düsseldorf here, and you can let the AI build a theme from your own request.",
    "الكلمات مجمّعة حسب المواقف في دروس من نحو 10 كلمات، من السهل إلى الصعب – وهذا أثبت في الذاكرة من القوائم العشوائية. ابدأ درسًا بزر ‹Lernen›، أو اجعل موضوعًا ما مسار تعلمك ‹Lernweg›. هنا أيضًا حزم امتحان FSP للأطباء وأطباء الأسنان في دوسلدورف، ويمكنك أن تطلب من الذكاء الاصطناعي بناء موضوع خاص بك.") },
  { view: "ueben", sel: ".modes", t: T("Practice and games", "التمارين والألعاب"), b: T(
    "Karteikarten: spaced repetition. Schreiben: see the meaning, type the German word with its article. Schnell-Quiz: 10 quick questions. der · die · das: article training. For two: Erklär’s! on one phone, and Wort-Duell online against friends.",
    "Karteikarten: المراجعة المتباعدة. Schreiben: ترى المعنى وتكتب الكلمة الألمانية مع أداة التعريف. Schnell-Quiz: عشرة أسئلة سريعة. der · die · das: تدريب على أدوات التعريف. ولشخصين: لعبة Erklär’s! على هاتف واحد، وWort-Duell عبر الإنترنت ضد الأصدقاء.") },
  { view: "woerter", sel: "#q", t: T("Dictionary and your own words", "القاموس وكلماتك الخاصة"), b: T(
    "Search all words in German, English or Arabic, or by rank (#120). Under ‘Meine Wörter’ you add your own words – they are matched to the dictionary automatically – or let the AI suggest words for a topic.",
    "ابحث في كل الكلمات بالألمانية أو الإنجليزية أو العربية، أو برقم الترتيب (#120). ومن ‹Meine Wörter› تضيف كلماتك الخاصة – وتُربط بالقاموس تلقائيًا – أو تطلب من الذكاء الاصطناعي اقتراح كلمات لموضوع ما.") },
  { view: "stand", sel: "#mapHost", t: T("Your progress", "تقدّمك"), b: T(
    "Every square is one word, rank 1 at the top left – watch the map fill up. Below: your card boxes, activity, leaderboard and settings (daily goal, theme, backup – and this tour).",
    "كل مربع يمثل كلمة، والترتيب 1 في أعلى اليسار – شاهد الخريطة وهي تمتلئ. وفي الأسفل: صناديق البطاقات والنشاط ولوحة المتصدرين والإعدادات (الهدف اليومي، المظهر، النسخ الاحتياطي – وهذه الجولة).") },
  { view: "heute", sel: "#helpBtn", t: T("Help is always here", "المساعدة دائمًا هنا"), b: T(
    "The ? button explains the page you are on, button by button. Tip: 10 new words plus your due cards every day beats a long session once a week.",
    "زر ؟ يشرح الصفحة التي أنت فيها، زرًا زرًا. نصيحة: عشر كلمات جديدة مع مراجعة البطاقات المستحقة كل يوم أفضل من جلسة طويلة مرة في الأسبوع.") },
];

let step = -1, steps = [], onEnd = null;
const $ = (id) => document.getElementById(id);
export function startTour(after) {
  steps = STEPS.filter((s) => !s.when || s.when()); step = 0; onEnd = after || null;
  if (!$("tour")) {
    const el = document.createElement("div"); el.id = "tour"; el.className = "tour";
    el.innerHTML = `<div class="tour-hole" id="tourHole"></div><div class="tour-card" id="tourCard" role="dialog" aria-modal="true" aria-live="polite"></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-tour]"); if (b) go(b.dataset.tour); });
    addEventListener("resize", () => place()); addEventListener("scroll", () => place(), { passive: true });
    document.addEventListener("keydown", (e) => { if (step < 0) return; if (e.key === "Escape") go("end"); if (e.key === "ArrowRight") go(L() === "ar" ? "prev" : "next"); if (e.key === "ArrowLeft") go(L() === "ar" ? "next" : "prev"); });
  }
  $("tour").hidden = false; show();
}
function go(a) {
  if (a === "next") step++; else if (a === "prev") step = Math.max(0, step - 1); else step = steps.length;
  if (step >= steps.length) { $("tour").hidden = true; step = -1; try { localStorage.setItem("wz-tour", "1"); } catch {} onEnd?.(); return; }
  show();
}
function show() {
  const s = steps[step]; const cur = (location.hash || "#heute").slice(1).split("/")[0] || "heute";
  if (s.view && s.view !== cur) { location.hash = s.view; setTimeout(show, 260); return; }
  const lang = L(); const card = $("tourCard");
  card.dir = lang === "ar" ? "rtl" : "ltr"; card.lang = lang; card.classList.toggle("ar", lang === "ar");
  card.innerHTML = `<div class="tour-top"><span class="small muted">${step + 1} ${UI.of[lang]} ${steps.length}</span><button class="btn ghost" data-tour="end">${UI.skip[lang]}</button></div>
    <h3>${esc(s.t[lang])}</h3><p>${esc(s.b[lang])}</p>
    <div class="tour-nav">${step ? `<button class="btn" data-tour="prev">${UI.back[lang]}</button>` : "<span></span>"}<button class="btn primary" data-tour="next">${step === steps.length - 1 ? UI.done[lang] : UI.next[lang]}</button></div>`;
  const target = s.sel && document.querySelector(s.sel);
  if (target) target.scrollIntoView({ block: "center", behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
  requestAnimationFrame(() => place());
  card.querySelector('[data-tour="next"]').focus({ preventScroll: true });
}
function place() {
  if (step < 0 || !steps[step]) return;
  const s = steps[step]; const hole = $("tourHole"), card = $("tourCard");
  const target = s.sel && document.querySelector(s.sel);
  const tour = $("tour"); tour.classList.toggle("dim", !target);
  if (!target) { hole.style.display = "none"; card.style.cssText = ""; card.classList.add("center"); return; }
  card.classList.remove("center");
  const r = target.getBoundingClientRect(); const pad = 6;
  Object.assign(hole.style, { display: "block", left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
  if (innerWidth <= 720) { card.style.cssText = ""; card.classList.add("sheet-mode"); if (r.top > innerHeight / 2) card.classList.add("top"); else card.classList.remove("top"); return; }
  card.classList.remove("sheet-mode", "top");
  const cw = Math.min(380, innerWidth - 32); const ch = card.offsetHeight || 220;
  let top = r.bottom + 12; if (top + ch > innerHeight - 12) top = Math.max(12, r.top - ch - 12);
  let left = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), innerWidth - cw - 16);
  card.style.cssText = `width:${cw}px;left:${left}px;top:${top}px`;
}
export const tourSeen = () => { try { return localStorage.getItem("wz-tour") === "1"; } catch { return true; } };

/* ---------- welcome: pick the explanation language ---------- */
export function welcomeHTML() {
  return `<div class="welcome"><img src="/icons/icon.svg" alt="" width="56" height="56"><h2>Willkommen bei Wortschatz 4034</h2>
    <p class="muted">Choose the language for explanations and translations.<br><span class="ar" lang="ar" dir="rtl">اختر لغة الشرح والترجمة.</span></p>
    <div class="welcome-langs"><button class="btn big" data-welcome="en">English</button><button class="btn big ar" lang="ar" data-welcome="ar">العربية</button></div>
    <button class="btn ghost" data-welcome="skip">Ohne Einführung starten</button></div>`;
}

/* ---------- help per page: what each button does ---------- */
const HELP = {
  heute: { t: T("Heute – today's words", "Heute – كلمات اليوم"), items: [
    ["Wo möchtest du anfangen? (A1–C1)", T("Choose where in the frequency list you start. Only needed once.", "اختر من أين تبدأ في قائمة الكلمات حسب الشيوع. مرة واحدة فقط.")],
    ["Kenne ich", T("You already know the word: it goes to ‘Bekannt’ and a new word takes its place.", "تعرف الكلمة: تنتقل إلى ‹Bekannt› وتحل محلها كلمة جديدة.")],
    ["🔊", T("Reads the word or sentence aloud (German voice of your device). Speed under Fortschritt → Sprechtempo.", "ينطق الكلمة أو الجملة بصوت ألماني من جهازك. يمكن تغيير السرعة من Fortschritt → Sprechtempo.")],
    ["+ 10 Wörter", T("Ten more new words for today.", "عشر كلمات جديدة إضافية لليوم.")],
    ["Üben · N", T("Opens the flashcards that are due now (N).", "يفتح البطاقات المستحقة الآن (N).")],
    ["Lernweg", T("Where new words come from: the frequency list or a theme you chose. Tap it to change.", "مصدر الكلمات الجديدة: قائمة الشيوع أو موضوع اخترته. اضغط عليه للتغيير.")],
    ["KLINIK", T("A sentence from a hospital or doctor–patient situation – made for the FSP.", "جملة من سياق المستشفى أو حوار الطبيب مع المريض – مفيدة لامتحان FSP.")],
  ] },
  themen: { t: T("Themen – learn by topic", "Themen – التعلّم حسب الموضوع"), items: [
    ["Prüfungsvorbereitung", T("FSP packs for doctors (Ärztekammer Nordrhein) and dentists (Zahnärztekammer Nordrhein), ordered by exam part: Anamnese, Untersuchung, Aufklärung, Arztbrief, Fallvorstellung.", "حزم امتحان FSP للأطباء (Ärztekammer Nordrhein) ولأطباء الأسنان (Zahnärztekammer Nordrhein)، مرتبة حسب أجزاء الامتحان: أخذ السيرة المرضية، الفحص، التوعية قبل الإجراء، الرسالة الطبية، عرض الحالة.")],
    ["Thema erstellen", T("Describe what you need (e.g. ‘Fach Zahnarzt – Prothetik’). The AI builds lessons; words already in the dictionary are linked. Check the preview, then ‘Thema speichern’.", "صف ما تحتاجه (مثل ‹Fach Zahnarzt – Prothetik›). يبني الذكاء الاصطناعي الدروس، وتُربط الكلمات الموجودة في القاموس. راجع المعاينة ثم اضغط ‹Thema speichern›.")],
    ["Nach Häufigkeit", T("Switch your daily new words back to the plain frequency order.", "إعادة الكلمات اليومية الجديدة إلى ترتيب الشيوع العادي.")],
    ["Lektion · Lernen", T("Puts the lesson's ~10 words into today's list and your card box.", "يضع كلمات الدرس (نحو 10) في قائمة اليوم وصندوق البطاقات.")],
    ["Als Lernweg wählen", T("From now on your daily new words come from this theme.", "من الآن تأتي كلماتك اليومية الجديدة من هذا الموضوع.")],
    ["Quiz / Wiederholen", T("A quick multiple-choice quiz on the theme or lesson.", "اختبار سريع متعدد الخيارات على الموضوع أو الدرس.")],
  ] },
  ueben: { t: T("Üben – practice", "Üben – التمرين"), items: [
    ["Karteikarten", T("Spaced repetition: tap to flip, then ‘Gewusst’ (box up, review later) or ‘Nochmal’ (back to box 1).", "مراجعة متباعدة: اضغط لقلب البطاقة، ثم ‹Gewusst› (تنتقل لصندوق أعلى وتُراجع لاحقًا) أو ‹Nochmal› (تعود للصندوق 1).")],
    ["Schreiben", T("See the meaning, type the German word – nouns with article. Small typos and correct synonyms count.", "ترى المعنى وتكتب الكلمة الألمانية – والأسماء مع أداة التعريف. تُقبل الأخطاء الإملائية البسيطة والمرادفات الصحيحة.")],
    ["Schnell-Quiz", T("10 questions, 4 answers. Wrong answers come from the same theme, so guessing does not help.", "عشرة أسئلة بأربعة خيارات. الخيارات الخاطئة من الموضوع نفسه، فلا يفيد التخمين.")],
    ["der · die · das", T("20 nouns: pick the right article (keys 1-2-3 on a laptop).", "عشرون اسمًا: اختر أداة التعريف الصحيحة (المفاتيح 1-2-3 على الحاسوب).")],
    ["Erklär’s!", T("Two teams, one phone: explain the word in German without saying it; your team guesses before the time runs out.", "فريقان وهاتف واحد: اشرح الكلمة بالألمانية دون أن تذكرها، ويخمّن فريقك قبل انتهاء الوقت.")],
    ["Wort-Duell", T("Create a duel, share the link or 6-letter code. Both answer the same 10 questions; the score updates live. Needs an account.", "أنشئ مبارزة وشارك الرابط أو الرمز المكوّن من 6 أحرف. يجيب الطرفان عن الأسئلة العشرة نفسها وتتحدث النتيجة مباشرة. يتطلب حسابًا.")],
  ] },
  karten: { t: T("Karteikarten – flashcards", "Karteikarten – البطاقات"), items: [
    ["DE → EN / EN → DE / Bild → DE", T("Direction of the question: German first, translation first, or picture first.", "اتجاه السؤال: الألمانية أولًا، أو الترجمة أولًا، أو الصورة أولًا.")],
    ["Karte / Leertaste", T("Tap the card (or press Space) to see the answer.", "اضغط على البطاقة (أو مفتاح المسافة) لرؤية الإجابة.")],
    ["Gewusst → / Nochmal ←", T("Knew it: next box, next review in 1, 2, 4, 8, 16 or 32 days. Didn't: back to box 1. On the phone you can swipe right/left.", "عرفتها: الصندوق التالي والمراجعة بعد 1 أو 2 أو 4 أو 8 أو 16 أو 32 يومًا. لم تعرفها: العودة للصندوق 1. على الهاتف يمكنك السحب يمينًا أو يسارًا.")],
    ["Kenne ich sicher", T("Removes the card from the box for good and marks the word as known.", "يزيل البطاقة من الصندوق نهائيًا ويضع الكلمة في ‹Bekannt›.")],
  ] },
  woerter: { t: T("Wörter – dictionary & own words", "Wörter – القاموس وكلماتك"), items: [
    ["Suche", T("German, English or Arabic, or #rank. Filters for word type and status (Neu, Am Lernen, Bekannt).", "بالألمانية أو الإنجليزية أو العربية، أو برقم الترتيب. مع مرشحات لنوع الكلمة وحالتها.")],
    ["Wort antippen", T("Opens details: picture, sentences, ‘In den Karteikasten’ or ‘Kenne ich’.", "يفتح التفاصيل: الصورة والجمل وزر ‹In den Karteikasten› أو ‹Kenne ich›.")],
    ["Meine Wörter · Prüfen und zuordnen", T("Type words one per line (any spelling, even English/Arabic). Dictionary words are linked; the AI fills in the rest. Tick what you want and add it to learning.", "اكتب كلمة في كل سطر (بأي تهجئة، حتى بالإنجليزية أو العربية). تُربط كلمات القاموس، ويكمل الذكاء الاصطناعي الباقي. اختر ما تريد وأضفه للتعلّم.")],
    ["Wörter vorschlagen", T("The AI suggests 10–30 words for a topic at your level.", "يقترح الذكاء الاصطناعي 10–30 كلمة لموضوع ما بحسب مستواك.")],
  ] },
  stand: { t: T("Fortschritt – statistics & settings", "Fortschritt – الإحصائيات والإعدادات"), items: [
    ["Wörterbuch-Karte", T("One square per word: black = known, ochre = learning. Tap a square to open the word.", "مربع لكل كلمة: الأسود = معروفة، الأصفر الداكن = قيد التعلّم. اضغط على مربع لفتح الكلمة.")],
    ["Karteikasten", T("How many cards are in each of the 7 boxes.", "عدد البطاقات في كل صندوق من الصناديق السبعة.")],
    ["Rangliste", T("Points of everyone using the app (only with an account).", "نقاط جميع المستخدمين (مع الحساب فقط).")],
    ["Einstellungen", T("Start level, translation language, words per day, light/dark, photos, speech speed, backup, reset – and the tour.", "مستوى البداية، لغة الترجمة، عدد الكلمات يوميًا، الوضع الفاتح/الداكن، الصور، سرعة النطق، النسخ الاحتياطي، إعادة الضبط – والجولة التعريفية.")],
  ] },
};
const HELP_ALIAS = { thema: "themen", schreiben: "ueben", quiz: "ueben", artikel: "ueben", erklaer: "ueben", duell: "ueben" };
export function helpHTML(view) {
  const lang = L(); const h = HELP[HELP_ALIAS[view] || view] || HELP.heute;
  return `<div class="help ${lang === "ar" ? "ar" : ""}" dir="${lang === "ar" ? "rtl" : "ltr"}" lang="${lang}"><h2>${esc(h.t[lang])}</h2>
    <dl>${h.items.map(([k, v]) => `<div><dt lang="de" dir="ltr">${esc(k)}</dt><dd>${esc(v[lang])}</dd></div>`).join("")}</dl>
    <button class="btn primary block" data-act="tourStart">${UI.tour[lang]}</button></div>`;
}
