// Firebase (Auth + Firestore) wrapper. Loaded lazily; the app works fully offline/local without it.
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // Serve the sign-in handler from the app's own domain (Vercel proxies /__/auth/* to Firebase).
  // A different auth domain breaks Google sign-in in browsers that partition third-party storage.
  authDomain: typeof location !== "undefined" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.host : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const enabled = !!(cfg.apiKey && cfg.projectId && cfg.appId);

let F = null; // { auth, db, fa (auth module), fs (firestore module) }
let user = null;
let unwatch = null;
const userListeners = new Set();

async function load() {
  if (!enabled) return null;
  if (F) return F;
  const [{ initializeApp }, fa, fs] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
  const app = initializeApp(cfg);
  const auth = fa.getAuth(app);
  let db;
  try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
  catch { db = fs.getFirestore(app); }
  F = { auth, db, fa, fs };
  fa.onAuthStateChanged(auth, (u) => { user = u; userListeners.forEach((fn) => fn(u)); });
  return F;
}

let saveT = null, lastSaved = 0;
export const cloud = {
  enabled,
  get user() { return user; },
  async init() { await load(); },
  onUser(fn) { userListeners.add(fn); if (F) fn(user); },

  async signInGoogle() {
    const { auth, fa } = F || (await load()); const p = new fa.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
    const mobile = matchMedia("(pointer: coarse)").matches || navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    if (mobile) return fa.signInWithRedirect(auth, p);
    try { await fa.signInWithPopup(auth, p); }
    catch (e) { if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/internal-error"].includes(e?.code)) await fa.signInWithRedirect(auth, p); else throw e; }
  },
  async redirectResult() { const { auth, fa } = F || (await load()); return fa.getRedirectResult(auth); },
  async signInEmail(email, pw) { const { auth, fa } = await load(); await fa.signInWithEmailAndPassword(auth, email, pw); },
  async signUpEmail(name, email, pw) { const { auth, fa } = await load(); const c = await fa.createUserWithEmailAndPassword(auth, email, pw); if (name) await fa.updateProfile(c.user, { displayName: name }); },
  async resetPassword(email) { const { auth, fa } = await load(); await fa.sendPasswordResetEmail(auth, email); },
  async signOut() { const { auth, fa } = await load(); if (unwatch) { unwatch(); unwatch = null; } await fa.signOut(auth); },
  async idToken() { if (!user) return ""; try { return await user.getIdToken(); } catch { return ""; } },

  async loadProgress() {
    if (!user) return null; const { db, fs } = F;
    const snap = await fs.getDoc(fs.doc(db, "users", user.uid));
    return snap.exists() ? snap.data() : null;
  },
  /** live updates from other devices */
  watchProgress(cb) {
    if (!user) return; const { db, fs } = F; if (unwatch) unwatch();
    unwatch = fs.onSnapshot(fs.doc(db, "users", user.uid), (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const d = snap.data(); if ((d.updated || 0) > lastSaved) cb(d);
    });
  },
  saveProgress(S, onState) {
    if (!user || !F) return; clearTimeout(saveT); onState?.("busy");
    saveT = setTimeout(async () => {
      const { db, fs } = F;
      try {
        lastSaved = S.updated || Date.now();
        await fs.setDoc(fs.doc(db, "users", user.uid), JSON.parse(JSON.stringify(S)));
        const known = Object.keys(S.known).length, learning = Object.keys(S.learn).length;
        await fs.setDoc(fs.doc(db, "profiles", user.uid), {
          name: (user.displayName || (user.email || "Lernende:r").split("@")[0]).slice(0, 60),
          photo: (user.photoURL || "").slice(0, 500), known, learning,
          streak: S.streak?.n || 0, xp: S.xp || 0, updated: fs.serverTimestamp(),
        });
        onState?.("ok");
      } catch (e) { console.warn("save failed", e); onState?.("err"); }
    }, 800);
  },
  async leaderboard() {
    if (!user) return []; const { db, fs } = F;
    const q = fs.query(fs.collection(db, "profiles"), fs.orderBy("xp", "desc"), fs.limit(20));
    const snap = await fs.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  /* ---------- Wort-Duell (online, two accounts) ---------- */
  async createDuel(code, data) { const { db, fs } = F; await fs.setDoc(fs.doc(db, "duels", code), { ...data, host: user.uid, created: fs.serverTimestamp() }); },
  async getDuel(code) { const { db, fs } = F; const s = await fs.getDoc(fs.doc(db, "duels", code)); return s.exists() ? s.data() : null; },
  async updateDuel(code, fields) { const { db, fs } = F; await fs.updateDoc(fs.doc(db, "duels", code), fields); },
  watchDuel(code, cb) { const { db, fs } = F; return fs.onSnapshot(fs.doc(db, "duels", code), (s) => cb(s.exists() ? s.data() : null), () => cb(null)); },
    async readSentences(ranks) {
    if (!F) return {}; const { db, fs } = F; const out = {};
    for (let i = 0; i < ranks.length; i += 30) {
      const ids = ranks.slice(i, i + 30).map(String);
      const snap = await fs.getDocs(fs.query(fs.collection(db, "sentences"), fs.where(fs.documentId(), "in", ids)));
      snap.forEach((d) => { out[d.id] = d.data(); });
    }
    return out;
  },
  async writeSentences(map) {
    if (!user || !F) return; const { db, fs } = F;
    await Promise.all(Object.entries(map).map(([r, v]) => fs.setDoc(fs.doc(db, "sentences", String(r)), { ...v, by: user.uid }).catch(() => {})));
  },
};
