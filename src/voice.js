// German text-to-speech with the most natural voice the device offers (browser Web Speech API, free, works offline for local voices).
// Neural voices (Edge "Natural"/"Online", Google network voices, Apple "Premium/Enhanced") sound far better than the default
// compact voices, but browsers list them in arbitrary order. We rank them, and the learner can pick one in Fortschritt.
const LS = "wz-voice";
export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
let voices = [];
const listeners = new Set();
function load() {
  if (!canSpeak) return;
  voices = speechSynthesis.getVoices().filter((v) => /^de([-_]|$)/i.test(v.lang || ""));
  listeners.forEach((fn) => fn());
}
if (canSpeak) { load(); speechSynthesis.addEventListener?.("voiceschanged", load); }
export const onVoices = (fn) => listeners.add(fn);

/** Higher = more natural. Exported for tests. */
export function voiceScore(v) {
  const n = `${v.name} ${v.voiceURI || ""}`;
  let s = 0;
  if (/natural|neural|wavenet|journey|studio|chirp/i.test(n)) s += 100; // Edge "Microsoft Katja Online (Natural)", cloud-backed neural voices
  else if (/online/i.test(n)) s += 80;
  if (/premium|enhanced|erweitert|hohe qualit/i.test(n)) s += 70; // Apple premium/enhanced voices (downloaded in iOS/macOS settings)
  if (/google/i.test(n)) s += 60; // Chrome/Android Google voices (network, decent quality)
  if (/samsung/i.test(n)) s += 30;
  if (/compact|espeak|e-speak|robot|novelty|grandma|grandpa|bubbles|bad news|good news|jester|organ|trinoids|whisper|zarvox/i.test(n)) s -= 100;
  if (/^de[-_]de$/i.test(v.lang)) s += 10; // standard German over Austrian/Swiss
  if (v.localService === false) s += 5; // network voices are usually the neural ones
  return s;
}
export const naturalLabel = (v) => voiceScore(v) >= 60;
/** German voices, best first. */
export function germanVoices() { return [...voices].sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name)); }
export function chosenVoice() {
  let id = ""; try { id = localStorage.getItem(LS) || ""; } catch {}
  const list = germanVoices();
  return list.find((v) => v.voiceURI === id) || list[0] || null;
}
export function setVoice(uri) { try { if (uri) localStorage.setItem(LS, uri); else localStorage.removeItem(LS); } catch {} }

export function say(text, rate = 0.9) {
  if (!canSpeak || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = chosenVoice();
    u.lang = v?.lang || "de-DE"; if (v) u.voice = v;
    u.rate = rate; u.pitch = 1;
    speechSynthesis.speak(u);
  } catch {}
}
