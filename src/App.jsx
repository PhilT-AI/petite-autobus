import { useState, useRef, useEffect, useMemo } from "react";
import lexiqueData from "./data/lexique.json";
import fasciculeIndex from "./data/fascicules.json";
import verbsData from "./data/verbs.json";
import grammarData from "./data/grammar-questions.json";
import readingData from "./data/reading.json";
import listeningData from "./data/listening.json";
import writingData from "./data/writing-prompts.json";
import heroImg from "./assets/hero.png";

/* ════════════════ SRS ENGINE ════════════════ */
const SRS_KEY = "petite-autobus-srs";
const STREAK_KEY = "petite-autobus-streak";
const GRAMMAR_SRS_KEY = "petite-autobus-grammar-srs";
const THEME_KEY = "petite-autobus-theme";
const TTS_KEY = "petite-autobus-tts";

const loadTTS = () => {
  try { return localStorage.getItem(TTS_KEY) !== "off"; } catch { return true; }
};

const speak = (text, lang = "fr-FR") => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.85;
  // Try to find a French voice
  const voices = window.speechSynthesis.getVoices();
  const frVoice = voices.find(v => v.lang.startsWith("fr")) || null;
  if (frVoice) utter.voice = frVoice;
  window.speechSynthesis.speak(utter);
};

const loadGrammarSRS = () => {
  try { return JSON.parse(localStorage.getItem(GRAMMAR_SRS_KEY)) || {}; } catch { return {}; }
};
const saveGrammarSRS = (d) => localStorage.setItem(GRAMMAR_SRS_KEY, JSON.stringify(d));

const recordGrammarAnswer = (gsrs, questionId, correct, module, topic, difficulty) => {
  const prev = gsrs[questionId] || { attempts: 0, correct: 0, lastAttempt: 0, module, topic, difficulty, streak: 0, nextDue: 0 };
  const streak = correct ? (prev.streak || 0) + 1 : 0;
  // SRS scheduling: interval doubles with each correct streak, resets on wrong
  const intervals = [0, 1, 3, 7, 14, 30, 60]; // days
  const intervalDays = intervals[Math.min(streak, intervals.length - 1)];
  const nextDue = Date.now() + intervalDays * 86400000;
  return {
    ...gsrs,
    [questionId]: {
      ...prev,
      attempts: prev.attempts + 1,
      correct: prev.correct + (correct ? 1 : 0),
      lastAttempt: Date.now(),
      module, topic, difficulty,
      streak,
      nextDue,
    }
  };
};

const isGrammarDue = (gsrs, questionId) => {
  const state = gsrs[questionId];
  if (!state) return true; // never attempted
  return Date.now() >= (state.nextDue || 0);
};

const isGrammarWeak = (gsrs, questionId) => {
  const state = gsrs[questionId];
  if (!state) return false;
  return state.attempts > 0 && (state.correct / state.attempts) < 0.6;
};

const loadTheme = () => {
  try { return localStorage.getItem(THEME_KEY) || "dark"; } catch { return "dark"; }
};

const loadSRS = () => {
  try { return JSON.parse(localStorage.getItem(SRS_KEY)) || {}; } catch { return {}; }
};
const saveSRS = (d) => localStorage.setItem(SRS_KEY, JSON.stringify(d));

const loadStreak = () => {
  try { return JSON.parse(localStorage.getItem(STREAK_KEY)) || { count: 0, lastDate: null, sessionsToday: 0 }; } catch { return { count: 0, lastDate: null, sessionsToday: 0 }; }
};
const saveStreak = (d) => localStorage.setItem(STREAK_KEY, JSON.stringify(d));

const today = () => new Date().toISOString().slice(0, 10);

const getCardState = (srs, id) => srs[id] || { due: 0, interval: 0, ease: 2.5, reps: 0, lastRating: null };

const rateCard = (srs, id, rating) => {
  // rating: 0=again, 1=hard, 2=good, 3=easy
  const now = Date.now();
  const card = getCardState(srs, id);
  let { interval, ease, reps } = card;

  if (rating === 0) {
    interval = 1; reps = 0; ease = Math.max(1.3, ease - 0.2);
  } else if (rating === 1) {
    interval = reps === 0 ? 1 : Math.ceil(interval * 1.2);
    ease = Math.max(1.3, ease - 0.15);
    reps += 1;
  } else if (rating === 2) {
    interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.ceil(interval * ease);
    reps += 1;
  } else {
    interval = reps === 0 ? 4 : Math.ceil(interval * ease * 1.3);
    ease += 0.15;
    reps += 1;
  }

  const due = now + interval * 86400000;
  return { ...srs, [id]: { due, interval, ease, reps, lastRating: rating, lastReview: now } };
};

const isDue = (srs, id) => {
  const state = srs[id];
  if (!state) return true;
  return Date.now() >= state.due;
};

const isMastered = (srs, id) => {
  const state = srs[id];
  return state && state.reps >= 3 && state.interval >= 7;
};

/* ════════════════ STYLES ════════════════ */
const themes = {
  dark: {
    bgBase: "#1a1c17", bgCard: "#2a2e24", bgElevated: "#32372a",
    greenPrimary: "#6b7c3f", greenBright: "#a8bc6a",
    tan: "#b5a070", tanLight: "#cdb98a",
    alertRed: "#c45c3a", gold: "#c9a84c",
    text: "#e8e4d8", textSec: "#9a9680", textMut: "#6b6758",
    border: "#3a3e32",
  },
  light: {
    bgBase: "#f5f3ed", bgCard: "#ffffff", bgElevated: "#eae7df",
    greenPrimary: "#5a6b35", greenBright: "#4a7a2e",
    tan: "#8a7040", tanLight: "#6b5530",
    alertRed: "#c03820", gold: "#a88520",
    text: "#1a1c17", textSec: "#5a5845", textMut: "#8a8672",
    border: "#d5d0c5",
  },
};
let C = themes[loadTheme()];

const font = {
  h: { fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" },
  card: { fontFamily: "'Barlow Semi Condensed',sans-serif", fontWeight: 600 },
  body: { fontFamily: "'Barlow',sans-serif", fontWeight: 400 },
  label: { fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" },
};

const BusIcon = ({ size = 28, color = C.greenBright }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="15" rx="3" stroke={color} strokeWidth="1.8"/>
    <line x1="3" y1="9" x2="21" y2="9" stroke={color} strokeWidth="1.5"/>
    <line x1="12" y1="9" x2="12" y2="3" stroke={color} strokeWidth="1.5"/>
    <rect x="5" y="11" width="4" height="3" rx="0.8" fill={color} opacity="0.3"/>
    <rect x="15" y="11" width="4" height="3" rx="0.8" fill={color} opacity="0.3"/>
    <circle cx="7.5" cy="20" r="1.5" stroke={color} strokeWidth="1.5"/>
    <circle cx="16.5" cy="20" r="1.5" stroke={color} strokeWidth="1.5"/>
    <line x1="5" y1="18" x2="5" y2="19" stroke={color} strokeWidth="1.5"/>
    <line x1="19" y1="18" x2="19" y2="19" stroke={color} strokeWidth="1.5"/>
  </svg>
);

const Bar = ({ value, max = 100, color = C.greenBright, h = 6 }) => (
  <div style={{ width: "100%", height: h, borderRadius: h / 2, background: C.bgBase }}>
    <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: "100%", borderRadius: h / 2, background: color, transition: "width 0.5s ease" }}/>
  </div>
);

const Chip = ({ children, color = C.greenPrimary, active }) => (
  <span style={{ ...font.label, fontSize: 9, padding: "3px 8px", borderRadius: 20, border: `1.5px solid ${active ? color : C.border}`, background: active ? `${color}22` : "transparent", color: active ? color : C.textSec, whiteSpace: "nowrap" }}>{children}</span>
);

const SpeakBtn = ({ text, lang = "fr-FR", size = 28, ttsOn }) => {
  if (!ttsOn) return null;
  return (
    <button onClick={(e) => { e.stopPropagation(); speak(text, lang); }}
      style={{ width: size, height: size, borderRadius: size / 2, border: `1.5px solid ${C.border}`, background: C.bgElevated, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0 }}
      title="Listen">
      <span style={{ fontSize: size * 0.5 }}>🔊</span>
    </button>
  );
};

const ACCENT_CHARS = ["é", "è", "ê", "ë", "à", "â", "ù", "û", "ô", "î", "ï", "ç", "œ", "'"];

const AccentBar = ({ onChar }) => (
  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center", padding: "6px 0" }}>
    {ACCENT_CHARS.map(ch => (
      <button key={ch} onClick={(e) => { e.preventDefault(); onChar(ch); }}
        style={{
          width: 30, height: 30, borderRadius: 6, border: `1px solid ${C.border}`,
          background: C.bgCard, color: C.text, ...font.card, fontSize: 14,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}>{ch}</button>
    ))}
  </div>
);

const DAILY_PLAN_KEY = "petite-autobus-daily";
const ACTIVITY_KEY = "petite-autobus-activity";

const loadDailyPlan = () => {
  try {
    const d = JSON.parse(localStorage.getItem(DAILY_PLAN_KEY));
    if (d && d.date === today()) return d;
    return { date: today(), flashcards: 0, grammar: 0, conjugation: 0, synonym: 0, listening: 0, reading: 0 };
  } catch { return { date: today(), flashcards: 0, grammar: 0, conjugation: 0, synonym: 0, listening: 0, reading: 0 }; }
};
const saveDailyPlan = (d) => localStorage.setItem(DAILY_PLAN_KEY, JSON.stringify(d));

const loadActivity = () => {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY)) || {}; } catch { return {}; }
};
const saveActivity = (d) => localStorage.setItem(ACTIVITY_KEY, JSON.stringify(d));

const recordActivity = (type) => {
  const act = loadActivity();
  const t = today();
  if (!act[t]) act[t] = { flashcards: 0, grammar: 0, conjugation: 0, synonym: 0, listening: 0, reading: 0, writing: 0, total: 0 };
  act[t][type] = (act[t][type] || 0) + 1;
  act[t].total = (act[t].total || 0) + 1;
  saveActivity(act);
  // Also update daily plan
  const dp = loadDailyPlan();
  dp[type] = (dp[type] || 0) + 1;
  saveDailyPlan(dp);
  return dp;
};

/* ════════════════ HOOKS ════════════════ */
const useStats = (srs) => useMemo(() => {
  const total = lexiqueData.length;
  const reviewed = Object.keys(srs).length;
  const mastered = lexiqueData.filter(e => isMastered(srs, e.id)).length;
  const dueNow = lexiqueData.filter(e => isDue(srs, e.id)).length;

  const catStats = {};
  for (const e of lexiqueData) {
    if (!catStats[e.category]) catStats[e.category] = { total: 0, mastered: 0, due: 0 };
    catStats[e.category].total++;
    if (isMastered(srs, e.id)) catStats[e.category].mastered++;
    if (isDue(srs, e.id)) catStats[e.category].due++;
  }

  const fascStats = {};
  for (const [fKey, ids] of Object.entries(fasciculeIndex)) {
    const m = ids.filter(id => isMastered(srs, id)).length;
    const d = ids.filter(id => isDue(srs, id)).length;
    fascStats[fKey] = { total: ids.length, mastered: m, due: d, pct: Math.round((m / ids.length) * 100) };
  }

  return { total, reviewed, mastered, dueNow, catStats, fascStats };
}, [srs]);

/* ════════════════════ HOME ════════════════════ */
const Home = ({ go, srs, streak }) => {
  const stats = useStats(srs);

  const fascEntries = Object.entries(stats.fascStats)
    .sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)));
  const firstInProgress = fascEntries.find(([, s]) => s.pct > 0 && s.pct < 100);
  const firstNotStarted = fascEntries.find(([, s]) => s.pct === 0);
  const continueFasc = firstInProgress || firstNotStarted;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Hero Banner */}
      <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}`, position: "relative" }}>
        <img src={heroImg} alt="Petite Autobus" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 16px 12px", background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>
          <div style={{ ...font.h, fontSize: 20, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>Petite Autobus</div>
          <div style={{ ...font.body, fontSize: 11, color: "rgba(255,255,255,0.8)" }}>CAF French Proficiency · PSC Exam Prep</div>
        </div>
      </div>

      {/* Streak */}
      <div style={{ background: C.bgCard, borderRadius: 14, padding: "18px 20px", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 50, height: 50, borderRadius: 12, background: `${C.gold}20`, border: `2px solid ${C.gold}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 24 }}>🔥</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...font.h, fontSize: 30, color: C.gold, lineHeight: 1 }}>{streak.count}</div>
          <div style={{ ...font.label, fontSize: 10, color: C.textSec, marginTop: 2 }}>Day Streak</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ ...font.card, fontSize: 15, color: C.greenBright }}>{stats.mastered} / {stats.total}</div>
          <div style={{ ...font.body, fontSize: 11, color: C.textMut }}>mastered</div>
        </div>
      </div>

      {/* Continue */}
      {continueFasc && (
        <div onClick={() => go("flashcard", { fascicule: continueFasc[0] })} style={{ background: `${C.greenPrimary}22`, borderRadius: 12, padding: "16px 18px", border: `1px solid ${C.greenPrimary}40`, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...font.label, fontSize: 9, color: C.greenBright, marginBottom: 3 }}>Continue Where You Left Off</div>
            <div style={{ ...font.card, fontSize: 14, color: C.text }}>Fascicule {continueFasc[0].slice(1)}</div>
            <div style={{ ...font.body, fontSize: 11, color: C.textSec, marginTop: 3 }}>{continueFasc[1].due} cards due · {continueFasc[1].total} total</div>
          </div>
          <span style={{ color: C.greenBright, fontSize: 18 }}>→</span>
        </div>
      )}

      {/* Main Navigation */}
      <div>
        <div style={{ ...font.label, fontSize: 10, color: C.textMut, marginBottom: 10 }}>Jump Into</div>
        {[
          { icon: "📚", label: "Flashcards", desc: "Synonyms & vocabulary by fascicule or category", color: C.greenPrimary, tap: () => go("study") },
          { icon: "✏️", label: "Conjugation Drill", desc: "Verb conjugation practice · NP-A, B, C", color: C.gold, tap: () => go("conjdrill") },
          { icon: "📝", label: "Grammar Quiz", desc: `${grammarData.questions.length} questions · 14 modules`, color: C.tan, tap: () => go("grammarquiz") },
          { icon: "🎧", label: "Listening", desc: `${listeningData.scenarios.length} scenarios + vocab practice`, color: C.tanLight, tap: () => go("listening") },
          { icon: "📖", label: "Reading", desc: `${readingData.passages.length} passages with comprehension questions`, color: C.alertRed, tap: () => go("reading") },
          { icon: "✍️", label: "Writing", desc: `${writingData.prompts.length} writing prompts with self-assessment`, color: C.gold, tap: () => go("writing") },
        ].map(a => (
          <div key={a.label} onClick={a.tap} style={{
            background: C.bgCard, borderRadius: 12, padding: "14px 16px",
            border: `1px solid ${C.border}`, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 14, marginBottom: 8,
          }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: `${a.color}15`, border: `2px solid ${a.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 22 }}>{a.icon}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...font.card, fontSize: 15, color: C.text }}>{a.label}</div>
              <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 2 }}>{a.desc}</div>
            </div>
            <span style={{ ...font.h, fontSize: 18, color: C.textMut }}>›</span>
          </div>
        ))}
      </div>

      {/* Quick Tools Row */}
      <div>
        <div style={{ ...font.label, fontSize: 10, color: C.textMut, marginBottom: 10 }}>Tools</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { icon: "🎯", label: "Exam Sim", color: C.tan, tap: () => go("examsim") },
            { icon: "📋", label: "Daily Plan", color: C.greenBright, tap: () => go("dailyplan") },
            { icon: "⚠️", label: "Weak Areas", color: C.alertRed, tap: () => go("weakareas") },
          ].map(a => (
            <div key={a.label} onClick={a.tap} style={{ background: C.bgCard, borderRadius: 10, padding: "14px 10px", border: `1px solid ${C.border}`, cursor: "pointer", textAlign: "center" }}>
              <span style={{ fontSize: 22, display: "block", marginBottom: 6 }}>{a.icon}</span>
              <span style={{ ...font.label, fontSize: 10, color: C.textSec }}>{a.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Progress Summary */}
      <div style={{ background: C.bgCard, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
        <div style={{ ...font.label, fontSize: 10, color: C.textMut, marginBottom: 10 }}>Progress</div>
        {Object.entries(stats.catStats).map(([cat, s]) => {
          const pct = Math.round((s.mastered / s.total) * 100);
          const label = cat === "nom" ? "Noms" : cat === "verbe" ? "Verbes" : cat === "connecteur" ? "Connecteurs" : "Expressions";
          return (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ ...font.card, fontSize: 12, color: C.text }}>{label}</span>
                <span style={{ ...font.body, fontSize: 11, color: C.textSec }}>{s.mastered}/{s.total} · {pct}%</span>
              </div>
              <Bar value={pct} color={pct > 70 ? C.greenBright : pct > 30 ? C.tan : C.textMut} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ════════════════════ STUDY ════════════════════ */
const Study = ({ go, srs }) => {
  const [tab, setTab] = useState(null);
  const stats = useStats(srs);

  const fascEntries = Object.entries(stats.fascStats)
    .sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)));
  const totalFascDone = fascEntries.filter(([, s]) => s.pct === 100).length;

  const studyModes = [
    { k: "fasc", icon: "📚", l: "Fascicules", desc: "PSC Lexique fascicule decks" },
    { k: "cat", icon: "🏷️", l: "By Category", desc: "Nouns, verbs, connectors, expressions" },
    { k: "verbs", icon: "✏️", l: "Verbs", desc: "Conjugation drills & 100 CAF verbs" },
    { k: "gram", icon: "📝", l: "Grammar", desc: `${grammarData.questions.length} quiz questions & reference` },
    { k: "skills", icon: "🎯", l: "Skills", desc: "Listening, reading, writing & more" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Mode selector - always visible */}
      {!tab ? (
        <>
          <div style={{ ...font.h, fontSize: 18, color: C.text, textAlign: "center", marginBottom: 4 }}>What do you want to study?</div>
          {studyModes.map(m => (
            <div key={m.k} onClick={() => setTab(m.k)} style={{
              background: C.bgCard, borderRadius: 14, padding: "18px 20px",
              border: `1px solid ${C.border}`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 16,
              transition: "transform 0.1s",
            }}>
              <div style={{ width: 50, height: 50, borderRadius: 13, background: `${C.greenPrimary}15`, border: `2px solid ${C.greenPrimary}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 24 }}>{m.icon}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...font.card, fontSize: 16, color: C.text }}>{m.l}</div>
                <div style={{ ...font.body, fontSize: 13, color: C.textSec, marginTop: 3 }}>{m.desc}</div>
              </div>
              <span style={{ ...font.h, fontSize: 18, color: C.textMut }}>›</span>
            </div>
          ))}
        </>
      ) : (
        <>
          {/* Back button + compact tabs when inside a mode */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: -4 }}>
            <button onClick={() => setTab(null)} style={{ background: "none", border: "none", cursor: "pointer", ...font.h, fontSize: 20, color: C.textSec, padding: "4px 8px 4px 0" }}>←</button>
            <div style={{ display: "flex", gap: 4, flex: 1, background: C.bgCard, borderRadius: 10, padding: 3 }}>
              {studyModes.map(t => (
                <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: tab === t.k ? C.bgElevated : "transparent", ...font.label, fontSize: 11, color: tab === t.k ? C.greenBright : C.textMut, cursor: "pointer", fontWeight: tab === t.k ? 700 : 500 }}>{t.l}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "fasc" && <>
        <div style={{ background: C.bgCard, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ ...font.card, fontSize: 13, color: C.text }}>PSC Fascicules</span>
            <span style={{ ...font.body, fontSize: 12, color: C.greenBright }}>{totalFascDone} / {fascEntries.length}</span>
          </div>
          <Bar value={totalFascDone} max={fascEntries.length} color={C.greenBright} />
          <div style={{ ...font.body, fontSize: 11, color: C.textSec, marginTop: 6 }}>{stats.total} synonym entries · Lexique FP 2024</div>
        </div>

        {fascEntries.map(([fKey, fStats]) => {
          const fNum = parseInt(fKey.slice(1));
          const isDone = fStats.pct === 100;
          const isActive = fStats.pct > 0 && fStats.pct < 100;
          return (
            <div key={fKey} onClick={() => go("flashcard", { fascicule: fKey })} style={{
              background: isActive ? `${C.greenPrimary}15` : C.bgCard,
              borderRadius: 10, padding: "12px 14px",
              border: `1px solid ${isActive ? C.greenPrimary + "44" : C.border}`,
              display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 7, background: isDone ? `${C.greenBright}18` : isActive ? `${C.gold}18` : `${C.textMut}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isDone ? <span style={{ color: C.greenBright, fontSize: 14 }}>✓</span> :
                 <span style={{ ...font.h, fontSize: 10, color: isActive ? C.gold : C.textMut }}>{fKey}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ ...font.card, fontSize: 12, color: C.text }}>Fascicule {fNum}</span>
                  <span style={{ ...font.body, fontSize: 11, color: C.textSec }}>{fStats.total} entries · {fStats.due} due</span>
                </div>
                {(isActive || isDone) && <div style={{ marginTop: 5 }}><Bar value={fStats.pct} color={isDone ? C.greenBright : C.gold} h={3} /></div>}
              </div>
              <span style={{ ...font.h, fontSize: 13, color: isDone ? C.greenBright : isActive ? C.gold : C.textMut }}>{fStats.pct}%</span>
            </div>
          );
        })}
      </>}

      {tab === "cat" && Object.entries(stats.catStats).map(([cat, s]) => {
        const pct = Math.round((s.mastered / s.total) * 100);
        const label = cat === "nom" ? "Noms" : cat === "verbe" ? "Verbes" : cat === "connecteur" ? "Connecteurs" : "Expressions";
        return (
          <div key={cat} onClick={() => go("flashcard", { category: cat })} style={{ background: C.bgCard, borderRadius: 12, padding: 18, border: `1px solid ${C.border}`, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: `${C.tan}15`, border: `2px solid ${C.tan}35`, display: "flex", alignItems: "center", justifyContent: "center", ...font.h, fontSize: 14, color: C.tan }}>{label.slice(0, 3)}</div>
              <div>
                <div style={{ ...font.card, fontSize: 15, color: C.text }}>{label}</div>
                <div style={{ ...font.body, fontSize: 11, color: C.textSec }}>{s.mastered}/{s.total} mastered · {s.due} due</div>
              </div>
            </div>
            <Bar value={s.mastered} max={s.total} color={pct > 70 ? C.greenBright : C.tan} />
          </div>
        );
      })}

      {tab === "verbs" && <>
        <div onClick={() => go("conjdrill")} style={{ background: `${C.gold}12`, borderRadius: 12, padding: "18px", border: `1px solid ${C.gold}35`, cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: `${C.gold}15`, border: `2px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ ...font.h, fontSize: 18, color: C.gold }}>✎</span>
          </div>
          <div>
            <div style={{ ...font.card, fontSize: 15, color: C.text }}>Conjugation Drill</div>
            <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 3 }}>Fill-in-the-blank practice · NP-A, B, C</div>
          </div>
        </div>
        <div onClick={() => go("verbs")} style={{ background: `${C.greenPrimary}22`, borderRadius: 12, padding: "18px", border: `1px solid ${C.greenPrimary}40`, cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: `${C.greenPrimary}15`, border: `2px solid ${C.greenPrimary}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ ...font.h, fontSize: 16, color: C.greenBright }}>100</span>
          </div>
          <div>
            <div style={{ ...font.card, fontSize: 15, color: C.text }}>Verb Reference</div>
            <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 3 }}>100 CAF verbs · All conjugations</div>
          </div>
        </div>
      </>}

      {tab === "gram" && <>
        <div onClick={() => go("grammarquiz")} style={{ background: `${C.tan}12`, borderRadius: 12, padding: "18px", border: `1px solid ${C.tan}35`, cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: `${C.tan}15`, border: `2px solid ${C.tan}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ ...font.h, fontSize: 16, color: C.tan }}>{grammarData.questions.length}</span>
          </div>
          <div>
            <div style={{ ...font.card, fontSize: 15, color: C.text }}>Grammar Quiz</div>
            <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 3 }}>ABCD fill-in-the-blank · Filter by module, difficulty, topic</div>
          </div>
        </div>
        <div onClick={() => go("grammar")} style={{ background: `${C.greenPrimary}22`, borderRadius: 12, padding: "18px", border: `1px solid ${C.greenPrimary}40`, cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: `${C.greenPrimary}15`, border: `2px solid ${C.greenPrimary}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ ...font.h, fontSize: 14, color: C.greenBright }}>LEX</span>
          </div>
          <div>
            <div style={{ ...font.card, fontSize: 15, color: C.text }}>Lexique Reference</div>
            <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 3 }}>151 synonym entries · Search & browse</div>
          </div>
        </div>

        {/* Quick launch by module */}
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginTop: 4 }}>Quick Start by Module</div>
        {grammarData.modules.map(m => {
          const count = grammarData.questions.filter(q => q.module === m).length;
          return (
            <div key={m} onClick={() => go("grammarquiz", { module: m })} style={{
              background: C.bgCard, borderRadius: 10, padding: "12px 14px",
              border: `1px solid ${C.border}`, cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ ...font.card, fontSize: 13, color: C.text }}>{m}</span>
              <span style={{ ...font.body, fontSize: 11, color: C.textSec }}>{count} questions →</span>
            </div>
          );
        })}
      </>}

      {tab === "skills" && <>
        {[
          { icon: "🎧", label: "Listening Comprehension", desc: "Listen and answer questions", color: C.tanLight, screen: "listening" },
          { icon: "📖", label: "Reading Comprehension", desc: `${readingData.passages.length} CAF passages with questions`, color: C.alertRed, screen: "reading" },
          { icon: "✍️", label: "Writing Practice", desc: `${writingData.prompts.length} prompts with self-assessment`, color: C.gold, screen: "writing" },
          { icon: "🎯", label: "Exam Simulation", desc: "Timed mixed-format mock test", color: C.tan, screen: "examsim" },
          { icon: "📋", label: "Daily Study Plan", desc: "Track your daily study goals", color: C.greenBright, screen: "dailyplan" },
          { icon: "⚠️", label: "Weak Areas", desc: "Focus on your weakest topics", color: C.alertRed, screen: "weakareas" },
        ].map(s => (
          <div key={s.screen} onClick={() => go(s.screen)} style={{
            background: C.bgCard, borderRadius: 12, padding: "16px 18px",
            border: `1px solid ${C.border}`, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: `${s.color}15`, border: `2px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
            </div>
            <div>
              <div style={{ ...font.card, fontSize: 15, color: C.text }}>{s.label}</div>
              <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 3 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </>}
    </div>
  );
};

/* ════════════════════ FLASHCARD ════════════════════ */
const Flashcard = ({ go, srs, setSrs, params, ttsOn }) => {
  const [flipped, setFlipped] = useState(false);
  const [idx, setIdx] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [reverse, setReverse] = useState(params?.reverse || false);

  const cards = useMemo(() => {
    let pool;
    if (params?.fascicule) {
      const ids = fasciculeIndex[params.fascicule] || [];
      pool = lexiqueData.filter(e => ids.includes(e.id));
    } else if (params?.category) {
      pool = lexiqueData.filter(e => e.category === params.category);
    } else {
      pool = lexiqueData;
    }
    const due = pool.filter(e => isDue(srs, e.id));
    return due.length > 0 ? due : pool;
  }, [params, srs]);

  const c = cards[idx];

  const title = params?.fascicule ? `Fascicule ${params.fascicule.slice(1)}` :
    params?.category ? (params.category === "nom" ? "Noms" : params.category === "verbe" ? "Verbes" : params.category === "connecteur" ? "Connecteurs" : "Expressions") :
    "All Due Cards";

  const ratingLabels = [
    { l: "Again", s: "< 1 min", color: C.alertRed, key: "1" },
    { l: "Hard", s: "1 day", color: C.tan, key: "2" },
    { l: "Good", s: "3 days", color: C.greenBright, key: "3" },
    { l: "Easy", s: "7 days", color: C.gold, key: "4" },
  ];

  const rate = (rating) => {
    const updated = rateCard(srs, c.id, rating);
    setSrs(updated);
    saveSRS(updated);
    setReviewed(r => r + 1);
    setFlipped(false);
    setTimeout(() => {
      if (idx + 1 >= cards.length) setSessionDone(true);
      else setIdx(i => i + 1);
    }, 150);
  };

  // Keyboard shortcuts: Space to flip, 1-4 to rate
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); setFlipped(f => !f); }
      if (flipped && c) {
        if (e.key === "1") rate(0);
        if (e.key === "2") rate(1);
        if (e.key === "3") rate(2);
        if (e.key === "4") rate(3);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flipped, c, idx]);

  if (sessionDone || !c) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18, textAlign: "center", paddingTop: 40 }}>
        <div style={{ fontSize: 40 }}>🎉</div>
        <div style={{ ...font.h, fontSize: 24, color: C.greenBright }}>Session Complete!</div>
        <div style={{ ...font.card, fontSize: 15, color: C.text }}>{reviewed} cards reviewed</div>
        <button onClick={() => go("home")} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer", marginTop: 12 }}>Back to Home</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => go("home")} style={{ background: "none", border: "none", cursor: "pointer", ...font.body, fontSize: 13, color: C.textSec }}>← {title}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span onClick={() => setReverse(r => !r)} style={{ ...font.label, fontSize: 8, color: reverse ? C.gold : C.textMut, background: reverse ? `${C.gold}18` : "transparent", border: `1px solid ${reverse ? C.gold + "40" : C.border}`, borderRadius: 6, padding: "3px 7px", cursor: "pointer" }}>
            {reverse ? "EN→FR" : "FR→EN"}
          </span>
          <span style={{ ...font.label, fontSize: 10, color: C.textMut }}>{idx + 1} / {cards.length}</span>
        </div>
      </div>

      <Bar value={idx + 1} max={cards.length} color={C.greenBright} h={3} />

      {/* Card */}
      <div onClick={() => setFlipped(!flipped)} style={{
        background: flipped ? C.bgElevated : C.bgCard,
        borderRadius: 18, padding: "28px 20px",
        border: `1.5px solid ${flipped ? C.greenPrimary + "55" : C.border}`,
        cursor: "pointer", flex: 1, display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center", textAlign: "center", gap: 16,
        minHeight: 260, transition: "background 0.3s, border-color 0.3s",
        position: "relative",
      }}>
        <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 5 }}>
          {c.fascicules.map(f => <Chip key={f} active color={C.greenPrimary}>F{f}</Chip>)}
          <Chip active color={C.tan}>{c.category}</Chip>
        </div>

        {!flipped ? (
          <>
            {reverse ? (
              <>
                <div style={{ ...font.body, fontSize: 18, color: C.text, lineHeight: 1.3, marginTop: 16 }}>{c.en}</div>
                <div style={{ ...font.body, fontSize: 11, color: C.textMut }}>↻ Tap to reveal French</div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                  <div style={{ ...font.h, fontSize: 26, color: C.text, lineHeight: 1.2 }}>{c.term}</div>
                  <SpeakBtn text={c.term} ttsOn={ttsOn} />
                </div>
                <div style={{ ...font.body, fontSize: 11, color: C.textMut }}>↻ Tap to reveal</div>
              </>
            )}
          </>
        ) : (
          <>
            {reverse && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                <div style={{ ...font.h, fontSize: 24, color: C.text }}>{c.term}</div>
                <SpeakBtn text={c.term} ttsOn={ttsOn} />
              </div>
            )}
            {!reverse && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                <div style={{ ...font.card, fontSize: 16, color: C.tanLight }}>{c.term}</div>
                <SpeakBtn text={c.term} ttsOn={ttsOn} />
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {c.synonyms.map(s => (
                <span key={s} style={{ ...font.card, fontSize: 13, color: C.greenBright, background: `${C.greenPrimary}22`, padding: "5px 12px", borderRadius: 16, border: `1px solid ${C.greenPrimary}35` }}>{s}</span>
              ))}
            </div>
            {c.en && !reverse && <div style={{ ...font.body, fontSize: 15, color: C.text, padding: "10px 16px", background: `${C.bgBase}88`, borderRadius: 8 }}>{c.en}</div>}
            {reverse && <div style={{ ...font.body, fontSize: 13, color: C.textSec, fontStyle: "italic" }}>{c.en}</div>}
          </>
        )}
      </div>

      {/* SRS Buttons */}
      {flipped && (
        <div style={{ display: "flex", gap: 6 }}>
          {ratingLabels.map((r, i) => (
            <button key={r.l} onClick={() => rate(i)} style={{
              flex: 1, padding: "12px 6px", borderRadius: 10,
              border: `1.5px solid ${r.color}35`, background: `${r.color}12`,
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <span style={{ ...font.card, fontSize: 12, color: r.color }}>{r.l}</span>
              <span style={{ ...font.body, fontSize: 9, color: `${r.color}88` }}>{r.key} · {r.s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ════════════════════ QUIZ ════════════════════ */
const Quiz = ({ go, srs, ttsOn }) => {
  const [mode, setMode] = useState(null);
  const [sel, setSel] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  // Generate quiz questions from real data
  const qs = useMemo(() => {
    const pool = lexiqueData.filter(e => e.synonyms.length >= 1 && e.en);
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
    return shuffled.map(entry => {
      const correctSyn = entry.synonyms[Math.floor(Math.random() * entry.synonyms.length)];
      const others = pool.filter(e => e.id !== entry.id);
      const wrongSyns = others.sort(() => Math.random() - 0.5).slice(0, 3)
        .map(e => e.synonyms.length > 0 ? e.synonyms[0] : e.term);

      const opts = [correctSyn, ...wrongSyns].sort(() => Math.random() - 0.5);
      const ans = opts.indexOf(correctSyn);

      return {
        stem: `Quel est un synonyme de « ${entry.term} » ?`,
        en: entry.en,
        opts,
        ans,
        category: entry.category,
        allSyns: entry.synonyms,
      };
    });
  }, []);

  const total = qs.length;
  const q = qs[qi];

  if (done) {
    const pct = Math.round((score / total) * 100);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18, textAlign: "center" }}>
        <div style={{ padding: "24px 0 8px" }}>
          <div style={{ fontSize: 40 }}>{pct >= 70 ? "🏆" : "📋"}</div>
          <div style={{ ...font.h, fontSize: 44, color: pct >= 70 ? C.gold : C.alertRed, marginTop: 8 }}>{pct}%</div>
          <div style={{ ...font.card, fontSize: 15, color: C.text, marginTop: 4 }}>{score} / {total} Correct</div>
          <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 6 }}>{mode === "test" ? "Test" : "Practice"} Mode</div>
        </div>
        <button onClick={() => { setMode(null); setDone(false); setQi(0); setScore(0); setSel(null); setAnswered(false); }} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer", marginTop: 6 }}>Try Again</button>
        <button onClick={() => go("home")} style={{ padding: 12, borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", ...font.card, fontSize: 13, color: C.textSec, cursor: "pointer" }}>Back to Home</button>
      </div>
    );
  }

  if (!mode) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Quiz Mode</div>
      {[
        { k: "practice", t: "Practice Mode", d: "Instant feedback — see all synonyms after answering", color: C.greenBright },
        { k: "test", t: "Test Mode", d: "No hints — score and breakdown at the end", color: C.gold },
      ].map(m => (
        <button key={m.k} onClick={() => setMode(m.k)} style={{
          background: C.bgCard, borderRadius: 14, padding: "20px 18px",
          border: `1.5px solid ${C.border}`, cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: `${m.color}15`, border: `2px solid ${m.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: m.color }} />
          </div>
          <div>
            <div style={{ ...font.card, fontSize: 15, color: C.text }}>{m.t}</div>
            <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 3 }}>{m.d}</div>
          </div>
        </button>
      ))}
    </div>
  );

  const pick = (i) => {
    if (answered) return;
    setSel(i);
    if (mode === "practice") {
      setAnswered(true);
      if (i === q.ans) setScore(s => s + 1);
    }
  };

  const next = () => {
    if (mode === "test" && sel === q.ans) setScore(s => s + 1);
    if (qi + 1 >= total) { setDone(true); return; }
    setQi(i => i + 1); setSel(null); setAnswered(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => setMode(null)} style={{ background: "none", border: "none", cursor: "pointer", ...font.body, fontSize: 12, color: C.textSec }}>← {mode === "test" ? "Test" : "Practice"}</button>
        <span style={{ ...font.label, fontSize: 10, color: C.textMut }}>Q{qi + 1}/{total}</span>
      </div>

      <div style={{ display: "flex", gap: 3 }}>
        {qs.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < qi ? C.greenBright : i === qi ? C.gold : C.bgElevated }} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 5 }}>
        <Chip active color={C.tan}>{q.category}</Chip>
      </div>

      <div style={{ background: C.bgCard, borderRadius: 14, padding: "20px 18px", border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ ...font.card, fontSize: 15, color: C.text, lineHeight: 1.6, flex: 1 }}>{q.stem}</div>
          <SpeakBtn text={q.stem} ttsOn={ttsOn} size={26} />
        </div>
        <div style={{ ...font.body, fontSize: 11, color: C.textMut, marginTop: 6 }}>{q.en}</div>
      </div>

      {q.opts.map((o, i) => {
        const isCorr = i === q.ans;
        const isSel = i === sel;
        const show = mode === "practice" && answered;
        let bc = C.border, bg = C.bgCard;
        if (show && isCorr) { bc = C.greenBright; bg = `${C.greenBright}12`; }
        if (show && isSel && !isCorr) { bc = C.alertRed; bg = `${C.alertRed}12`; }
        if (!show && isSel) { bc = C.greenPrimary; bg = `${C.greenPrimary}12`; }
        return (
          <button key={i} onClick={() => pick(i)} style={{ background: bg, borderRadius: 10, padding: "14px 16px", border: `1.5px solid ${bc}`, cursor: answered ? "default" : "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12, marginBottom: 2 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, border: `1.5px solid ${isSel ? bc : C.textMut}33`, display: "flex", alignItems: "center", justifyContent: "center", ...font.label, fontSize: 10, color: isSel ? bc : C.textMut, flexShrink: 0 }}>
              {show && isCorr ? "✓" : show && isSel && !isCorr ? "✗" : String.fromCharCode(65 + i)}
            </div>
            <span style={{ ...font.body, fontSize: 14, color: C.text }}>{o}</span>
          </button>
        );
      })}

      {/* Practice feedback */}
      {mode === "practice" && answered && (
        <div style={{ background: C.bgElevated, borderRadius: 14, padding: 18, border: `1px solid ${sel === q.ans ? C.greenBright : C.alertRed}25` }}>
          <div style={{ ...font.label, fontSize: 9, color: sel === q.ans ? C.greenBright : C.alertRed, marginBottom: 6 }}>
            {sel === q.ans ? "Correct!" : "Incorrect"}
          </div>
          <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginBottom: 8 }}>All synonyms:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {q.allSyns.map(s => (
              <span key={s} style={{ ...font.card, fontSize: 12, color: C.greenBright, background: `${C.greenPrimary}18`, padding: "4px 10px", borderRadius: 12, border: `1px solid ${C.greenPrimary}30` }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {sel !== null && (mode === "test" || answered) && (
        <button onClick={next} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer", marginTop: 4 }}>
          {qi + 1 >= total ? "See Results" : "Next Question"}
        </button>
      )}
    </div>
  );
};

/* ════════════════════ DECKS ════════════════════ */
const Decks = ({ go, srs }) => {
  const stats = useStats(srs);
  const fascEntries = Object.entries(stats.fascStats)
    .sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Fascicule Decks</div>
      {fascEntries.map(([fKey, fStats]) => (
        <div key={fKey} onClick={() => go("flashcard", { fascicule: fKey })} style={{ background: C.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
            <div>
              <div style={{ ...font.card, fontSize: 14, color: C.text }}>Fascicule {fKey.slice(1)}</div>
              <div style={{ ...font.body, fontSize: 11, color: C.textMut, marginTop: 2 }}>Lexique FP 2024</div>
            </div>
            {fStats.due > 0 && <div style={{ width: 7, height: 7, borderRadius: 4, background: C.greenBright, marginTop: 5 }} />}
          </div>
          <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
            <span style={{ ...font.body, fontSize: 11, color: C.textSec }}>{fStats.total} cards</span>
            <span style={{ ...font.body, fontSize: 11, color: fStats.due > 0 ? C.greenBright : C.textMut }}>{fStats.due} due</span>
            <span style={{ ...font.body, fontSize: 11, color: C.gold }}>{fStats.mastered} mastered</span>
          </div>
          <Bar value={fStats.pct} color={fStats.pct === 100 ? C.greenBright : fStats.pct > 0 ? C.tan : C.textMut} h={3} />
        </div>
      ))}
    </div>
  );
};

/* ════════════════════ PROGRESS ════════════════════ */
const Progress = ({ srs, streak }) => {
  const stats = useStats(srs);
  const days = ["M", "T", "W", "T", "F", "S", "S"];

  // Build calendar from SRS review history
  const reviewDates = {};
  for (const state of Object.values(srs)) {
    if (state.lastReview) {
      const d = new Date(state.lastReview).toISOString().slice(0, 10);
      reviewDates[d] = (reviewDates[d] || 0) + 1;
    }
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    return { day: i + 1, active: !!reviewDates[d] };
  });

  // Category mastery
  const weakAreas = Object.entries(stats.catStats)
    .map(([cat, s]) => ({ tag: cat === "nom" ? "Noms" : cat === "verbe" ? "Verbes" : cat === "connecteur" ? "Connecteurs" : "Expressions", pct: s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct);

  const overallPct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { l: "Streak", v: String(streak.count), s: "days", color: C.gold },
          { l: "Due Now", v: String(stats.dueNow), s: `of ${stats.total}`, color: C.greenBright },
          { l: "Mastered", v: String(stats.mastered), s: `/ ${stats.total}`, color: C.tanLight },
          { l: "Overall", v: `${overallPct}%`, s: "mastery", color: C.tan },
        ].map(s => (
          <div key={s.l} style={{ background: C.bgCard, borderRadius: 10, padding: "14px 12px", border: `1px solid ${C.border}` }}>
            <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 5 }}>{s.l}</div>
            <div style={{ ...font.h, fontSize: 26, color: s.color }}>{s.v}</div>
            <div style={{ ...font.body, fontSize: 11, color: C.textSec, marginTop: 2 }}>{s.s}</div>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div style={{ background: C.bgCard, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 10 }}>{monthNames[month]} {year}</div>
        <div style={{ display: "flex", gap: 3, justifyContent: "center", marginBottom: 6 }}>
          {days.map((d, i) => <div key={i} style={{ ...font.label, fontSize: 8, color: C.textMut, width: 26, textAlign: "center" }}>{d}</div>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
          {calDays.map(d => (
            <div key={d.day} style={{ width: 26, height: 26, borderRadius: 5, background: d.active ? `${C.greenBright}25` : C.bgBase, border: `1px solid ${d.active ? C.greenBright + "35" : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", ...font.body, fontSize: 9, color: d.active ? C.greenBright : C.textMut }}>{d.day}</div>
          ))}
        </div>
      </div>

      {/* Category Mastery */}
      <div style={{ background: C.bgCard, borderRadius: 12, padding: "16px 18px", border: `1px solid ${C.border}` }}>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 12 }}>Category Mastery</div>
        {weakAreas.map(w => (
          <div key={w.tag} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ ...font.body, fontSize: 11, color: C.text }}>{w.tag}</span>
              <span style={{ ...font.label, fontSize: 10, color: w.pct > 70 ? C.greenBright : w.pct > 40 ? C.tan : C.alertRed }}>{w.pct}%</span>
            </div>
            <Bar value={w.pct} color={w.pct > 70 ? C.greenBright : w.pct > 40 ? C.tan : C.alertRed} h={4} />
          </div>
        ))}
      </div>

      {/* Activity Heatmap - Last 30 days */}
      {(() => {
        const act = loadActivity();
        const last30 = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
          const a = act[d] || {};
          last30.push({ date: d, total: a.total || 0, day: new Date(d).getDate() });
        }
        const maxAct = Math.max(1, ...last30.map(d => d.total));
        return (
          <div style={{ background: C.bgCard, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
            <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 10 }}>Last 30 Days Activity</div>
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              {last30.map(d => {
                const intensity = d.total / maxAct;
                return (
                  <div key={d.date} title={`${d.date}: ${d.total} activities`} style={{
                    width: 18, height: 18, borderRadius: 3,
                    background: d.total === 0 ? C.bgBase : `rgba(168,188,106,${0.2 + intensity * 0.8})`,
                    border: `1px solid ${d.total > 0 ? C.greenBright + "30" : C.border}`,
                  }} />
                );
              })}
            </div>
            <div style={{ ...font.body, fontSize: 10, color: C.textMut, marginTop: 6 }}>
              {last30.filter(d => d.total > 0).length} active days · {last30.reduce((s, d) => s + d.total, 0)} total activities
            </div>
          </div>
        );
      })()}

      {/* Weekly Trend */}
      {(() => {
        const act = loadActivity();
        const weeks = [];
        for (let w = 3; w >= 0; w--) {
          let total = 0;
          for (let d = 0; d < 7; d++) {
            const date = new Date(Date.now() - (w * 7 + d) * 86400000).toISOString().slice(0, 10);
            total += (act[date]?.total || 0);
          }
          weeks.push({ label: w === 0 ? "This week" : `${w} week${w > 1 ? "s" : ""} ago`, total });
        }
        const maxW = Math.max(1, ...weeks.map(w => w.total));
        return (
          <div style={{ background: C.bgCard, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
            <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 10 }}>Weekly Trend</div>
            {weeks.map(w => (
              <div key={w.label} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ ...font.body, fontSize: 11, color: C.text }}>{w.label}</span>
                  <span style={{ ...font.label, fontSize: 10, color: C.greenBright }}>{w.total}</span>
                </div>
                <Bar value={w.total} max={maxW} color={C.greenBright} h={4} />
              </div>
            ))}
          </div>
        );
      })()}

      {/* Overall Readiness */}
      <div style={{ background: `${C.gold}0a`, borderRadius: 12, padding: "18px", border: `1px solid ${C.gold}25`, textAlign: "center" }}>
        <div style={{ ...font.label, fontSize: 9, color: C.gold, marginBottom: 12 }}>PSC Readiness</div>
        <div style={{ width: 80, height: 80, borderRadius: "50%", border: `3px solid ${overallPct > 50 ? C.greenBright : C.tan}35`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", background: `${overallPct > 50 ? C.greenBright : C.tan}0a` }}>
          <span style={{ ...font.h, fontSize: 24, color: overallPct > 50 ? C.greenBright : C.tan }}>{overallPct}%</span>
        </div>
        <span style={{ ...font.card, fontSize: 13, color: C.text }}>{stats.mastered} of {stats.total} entries mastered</span>
      </div>
    </div>
  );
};

/* ════════════════════ GRAMMAR ════════════════════ */
const Grammar = ({ srs, ttsOn }) => {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let results = filter === "all" ? lexiqueData : lexiqueData.filter(e => e.category === filter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      results = results.filter(e =>
        e.term.toLowerCase().includes(q) ||
        e.en.toLowerCase().includes(q) ||
        e.synonyms.some(s => s.toLowerCase().includes(q))
      );
    }
    return results;
  }, [filter, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Lexique Reference</div>
      {/* Search */}
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search terms, synonyms, or English..."
          style={{
            width: "100%", padding: "11px 14px 11px 36px", borderRadius: 10,
            border: `1.5px solid ${search ? C.greenPrimary + "55" : C.border}`,
            background: C.bgCard, color: C.text, ...font.body, fontSize: 13,
            outline: "none",
          }}
        />
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.textMut, fontSize: 14 }}>⌕</span>
        {search && (
          <span onClick={() => setSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.textMut, fontSize: 14, cursor: "pointer" }}>✕</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {[
          { k: "all", l: "All" },
          { k: "verbe", l: "Verbes" },
          { k: "nom", l: "Noms" },
          { k: "connecteur", l: "Connecteurs" },
          { k: "expression", l: "Expressions" },
        ].map(f => (
          <span key={f.k} onClick={() => setFilter(f.k)} style={{ ...font.label, fontSize: 9, padding: "4px 10px", borderRadius: 20, border: `1.5px solid ${filter === f.k ? C.greenBright : C.border}`, background: filter === f.k ? `${C.greenBright}22` : "transparent", color: filter === f.k ? C.greenBright : C.textSec, cursor: "pointer" }}>{f.l}</span>
        ))}
      </div>
      <div style={{ ...font.body, fontSize: 11, color: C.textMut }}>{filtered.length} entries{search && ` matching "${search}"`}</div>
      {filtered.map(r => {
        const mastered = isMastered(srs, r.id);
        return (
          <div key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} style={{ background: C.bgCard, borderRadius: 12, padding: "14px 16px", border: `1px solid ${open === r.id ? C.greenPrimary + "44" : C.border}`, cursor: "pointer", transition: "border-color 0.2s" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <Chip active color={C.tan}>{r.category}</Chip>
              {r.fascicules.map(f => <Chip key={f} color={C.greenPrimary}>F{f}</Chip>)}
              {mastered && <span style={{ ...font.label, fontSize: 8, color: C.greenBright }}>✓ Mastered</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ ...font.card, fontSize: 14, color: C.text }}>{r.id}. {r.term}</div>
              <SpeakBtn text={r.term} ttsOn={ttsOn} size={22} />
            </div>
            {r.en && <div style={{ ...font.body, fontSize: 11, color: C.textMut, marginTop: 3 }}>{r.en}</div>}
            {open === r.id && (
              <div style={{ marginTop: 14 }}>
                <div style={{ ...font.label, fontSize: 8, color: C.greenBright, marginBottom: 6 }}>Synonyms</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                  {r.synonyms.map(s => (
                    <span key={s} style={{ ...font.card, fontSize: 12, color: C.greenBright, background: `${C.greenPrimary}18`, padding: "4px 10px", borderRadius: 12, border: `1px solid ${C.greenPrimary}30` }}>{s}</span>
                  ))}
                </div>
                {r.fascicules.length > 0 && (
                  <div style={{ ...font.body, fontSize: 11, color: C.textSec }}>
                    Appears in: {r.fascicules.map(f => `Fascicule ${f}`).join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ════════════════════ GRAMMAR QUIZ ════════════════════ */
const GrammarQuiz = ({ go, params, grammarSrs, setGrammarSrs, ttsOn }) => {
  const [phase, setPhase] = useState("setup"); // setup | quiz | results
  const [selMods, setSelMods] = useState(new Set());
  const [selDiffs, setSelDiffs] = useState(new Set());
  const [selTopics, setSelTopics] = useState(new Set());
  const [showTopics, setShowTopics] = useState(false);
  const [mode, setMode] = useState("practice");
  const [qs, setQs] = useState([]);
  const [qi, setQi] = useState(0);
  const [sel, setSel] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);

  const allQs = grammarData.questions;
  const modules = grammarData.modules;
  const difficulties = grammarData.difficulties;
  const topics = grammarData.topics;

  // Pre-select from params if navigated with filter
  useEffect(() => {
    if (params?.module) setSelMods(new Set([params.module]));
    if (params?.difficulty) setSelDiffs(new Set([params.difficulty]));
  }, []);

  const toggle = (set, setFn, val) => {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    setFn(next);
  };

  const filtered = useMemo(() => {
    return allQs.filter(q => {
      if (selMods.size > 0 && !selMods.has(q.module)) return false;
      if (selDiffs.size > 0 && !selDiffs.has(q.difficulty)) return false;
      if (selTopics.size > 0 && !selTopics.has(q.topic)) return false;
      return true;
    });
  }, [selMods, selDiffs, selTopics, allQs]);

  const startQuiz = () => {
    if (filtered.length === 0) return;
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    setQs(shuffled.map(q => {
      const opts = [q.correct, ...q.wrong.map(w => w.answer)].sort(() => Math.random() - 0.5);
      return { ...q, opts, correctIdx: opts.indexOf(q.correct) };
    }));
    setQi(0); setSel(null); setAnswered(false); setScore(0); setAnswers([]);
    setPhase("quiz");
  };

  const recordAnswer = (qObj, isCorrect) => {
    const updated = recordGrammarAnswer(grammarSrs, qObj.id, isCorrect, qObj.module, qObj.topic, qObj.difficulty);
    setGrammarSrs(updated);
    saveGrammarSRS(updated);
  };

  const pick = (i) => {
    if (answered) return;
    setSel(i);
    if (mode === "practice") {
      setAnswered(true);
      const correct = i === qs[qi].correctIdx;
      if (correct) setScore(s => s + 1);
      setAnswers(a => [...a, { qi, sel: i, correct }]);
      recordAnswer(qs[qi], correct);
    }
  };

  const next = () => {
    if (mode === "test") {
      const correct = sel === qs[qi].correctIdx;
      if (correct) setScore(s => s + 1);
      setAnswers(a => [...a, { qi, sel, correct }]);
      recordAnswer(qs[qi], correct);
    }
    if (qi + 1 >= qs.length) { setPhase("results"); return; }
    setQi(i => i + 1); setSel(null); setAnswered(false);
  };

  // RESULTS
  if (phase === "results") {
    const pct = Math.round((score / qs.length) * 100);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18, textAlign: "center" }}>
        <div style={{ padding: "24px 0 8px" }}>
          <div style={{ fontSize: 40 }}>{pct >= 70 ? "🏆" : "📋"}</div>
          <div style={{ ...font.h, fontSize: 44, color: pct >= 70 ? C.gold : C.alertRed, marginTop: 8 }}>{pct}%</div>
          <div style={{ ...font.card, fontSize: 15, color: C.text, marginTop: 4 }}>{score} / {qs.length} Correct</div>
          <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 6 }}>{mode === "test" ? "Test" : "Practice"} Mode · Grammar Quiz</div>
        </div>

        {/* Review missed questions */}
        {answers.filter(a => !a.correct).length > 0 && (
          <div style={{ textAlign: "left" }}>
            <div style={{ ...font.label, fontSize: 9, color: C.alertRed, marginBottom: 10 }}>Review Missed</div>
            {answers.filter(a => !a.correct).map((a, idx) => {
              const q = qs[a.qi];
              return (
                <div key={idx} style={{ background: C.bgCard, borderRadius: 10, padding: 14, border: `1px solid ${C.border}`, marginBottom: 8 }}>
                  <div style={{ ...font.body, fontSize: 13, color: C.text, marginBottom: 6 }}>{q.stem}</div>
                  <div style={{ ...font.body, fontSize: 12, color: C.greenBright, marginBottom: 2 }}>✓ {q.correct}</div>
                  <div style={{ ...font.body, fontSize: 11, color: C.textSec }}>{q.correctExplanation}</div>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={() => { setPhase("setup"); }} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer" }}>New Quiz</button>
        <button onClick={() => go("home")} style={{ padding: 12, borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", ...font.card, fontSize: 13, color: C.textSec, cursor: "pointer" }}>Back to Home</button>
      </div>
    );
  }

  // QUIZ
  if (phase === "quiz") {
    const q = qs[qi];
    const getExplanation = (optText) => {
      if (optText === q.correct) return q.correctExplanation;
      const w = q.wrong.find(w => w.answer === optText);
      return w ? w.explanation : "";
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => setPhase("setup")} style={{ background: "none", border: "none", cursor: "pointer", ...font.body, fontSize: 12, color: C.textSec }}>← Setup</button>
          <span style={{ ...font.label, fontSize: 10, color: C.textMut }}>Q{qi + 1}/{qs.length}</span>
        </div>

        <div style={{ display: "flex", gap: 3 }}>
          {qs.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < qi ? C.greenBright : i === qi ? C.gold : C.bgElevated }} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <Chip active color={C.tan}>{q.module}</Chip>
          <Chip active color={q.difficulty === "Easy" ? C.greenBright : q.difficulty === "Medium" ? C.gold : C.alertRed}>{q.difficulty}</Chip>
          <Chip color={C.textSec}>{q.topic}</Chip>
        </div>

        <div style={{ background: C.bgCard, borderRadius: 14, padding: "20px 18px", border: `1px solid ${C.border}` }}>
          <div style={{ ...font.card, fontSize: 15, color: C.text, lineHeight: 1.6 }}>{q.stem}</div>
          <div style={{ ...font.body, fontSize: 10, color: C.textMut, marginTop: 6 }}>{q.id}</div>
        </div>

        {q.opts.map((o, i) => {
          const isCorr = i === q.correctIdx;
          const isSel = i === sel;
          const show = mode === "practice" && answered;
          let bc = C.border, bg = C.bgCard;
          if (show && isCorr) { bc = C.greenBright; bg = `${C.greenBright}12`; }
          if (show && isSel && !isCorr) { bc = C.alertRed; bg = `${C.alertRed}12`; }
          if (!show && isSel) { bc = C.greenPrimary; bg = `${C.greenPrimary}12`; }
          return (
            <button key={i} onClick={() => pick(i)} style={{ background: bg, borderRadius: 10, padding: "14px 16px", border: `1.5px solid ${bc}`, cursor: answered ? "default" : "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12, marginBottom: 2 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, border: `1.5px solid ${isSel ? bc : C.textMut}33`, display: "flex", alignItems: "center", justifyContent: "center", ...font.label, fontSize: 10, color: isSel ? bc : C.textMut, flexShrink: 0 }}>
                {show && isCorr ? "✓" : show && isSel && !isCorr ? "✗" : String.fromCharCode(65 + i)}
              </div>
              <span style={{ ...font.body, fontSize: 14, color: C.text }}>{o}</span>
            </button>
          );
        })}

        {/* Practice feedback with explanation */}
        {mode === "practice" && answered && (
          <div style={{ background: C.bgElevated, borderRadius: 14, padding: 18, border: `1px solid ${sel === q.correctIdx ? C.greenBright : C.alertRed}25` }}>
            <div style={{ ...font.label, fontSize: 9, color: sel === q.correctIdx ? C.greenBright : C.alertRed, marginBottom: 8 }}>
              {sel === q.correctIdx ? "Correct!" : "Incorrect"}
            </div>
            {sel !== q.correctIdx && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...font.body, fontSize: 12, color: C.alertRed, marginBottom: 2 }}>Your answer: {q.opts[sel]}</div>
                <div style={{ ...font.body, fontSize: 11, color: C.textSec }}>{getExplanation(q.opts[sel])}</div>
              </div>
            )}
            <div style={{ ...font.body, fontSize: 12, color: C.greenBright, marginBottom: 2 }}>Correct: {q.correct}</div>
            <div style={{ ...font.body, fontSize: 11, color: C.textSec }}>{q.correctExplanation}</div>
          </div>
        )}

        {sel !== null && (mode === "test" || answered) && (
          <button onClick={next} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer", marginTop: 4 }}>
            {qi + 1 >= qs.length ? "See Results" : "Next Question"}
          </button>
        )}
      </div>
    );
  }

  // SETUP SCREEN
  const diffColors = { Easy: C.greenBright, Medium: C.gold, Hard: C.alertRed };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Grammar Quiz</div>
      <div style={{ ...font.body, fontSize: 12, color: C.textSec }}>
        {allQs.length} questions available · Select filters to build your quiz
      </div>

      {/* Quick launch: Due for review */}
      {(() => {
        const dueCount = allQs.filter(q => isGrammarDue(grammarSrs, q.id)).length;
        const weakCount = allQs.filter(q => isGrammarWeak(grammarSrs, q.id)).length;
        return (dueCount > 0 || weakCount > 0) ? (
          <div style={{ display: "flex", gap: 6 }}>
            {dueCount > 0 && dueCount < allQs.length && (
              <button onClick={() => {
                const due = allQs.filter(q => isGrammarDue(grammarSrs, q.id));
                const shuffled = [...due].sort(() => Math.random() - 0.5);
                setQs(shuffled.map(q => {
                  const opts = [q.correct, ...q.wrong.map(w => w.answer)].sort(() => Math.random() - 0.5);
                  return { ...q, opts, correctIdx: opts.indexOf(q.correct) };
                }));
                setQi(0); setSel(null); setAnswered(false); setScore(0); setAnswers([]);
                setPhase("quiz");
              }} style={{
                flex: 1, padding: "12px 10px", borderRadius: 10, textAlign: "center",
                border: `1.5px solid ${C.greenBright}44`, background: `${C.greenBright}12`, cursor: "pointer",
              }}>
                <div style={{ ...font.card, fontSize: 13, color: C.greenBright }}>Review Due ({dueCount})</div>
                <div style={{ ...font.body, fontSize: 10, color: C.textMut, marginTop: 2 }}>SRS scheduled</div>
              </button>
            )}
            {weakCount > 0 && (
              <button onClick={() => {
                const weak = allQs.filter(q => isGrammarWeak(grammarSrs, q.id));
                const shuffled = [...weak].sort(() => Math.random() - 0.5);
                setQs(shuffled.map(q => {
                  const opts = [q.correct, ...q.wrong.map(w => w.answer)].sort(() => Math.random() - 0.5);
                  return { ...q, opts, correctIdx: opts.indexOf(q.correct) };
                }));
                setQi(0); setSel(null); setAnswered(false); setScore(0); setAnswers([]);
                setPhase("quiz");
              }} style={{
                flex: 1, padding: "12px 10px", borderRadius: 10, textAlign: "center",
                border: `1.5px solid ${C.alertRed}44`, background: `${C.alertRed}12`, cursor: "pointer",
              }}>
                <div style={{ ...font.card, fontSize: 13, color: C.alertRed }}>Weak ({weakCount})</div>
                <div style={{ ...font.body, fontSize: 10, color: C.textMut, marginTop: 2 }}>Below 60%</div>
              </button>
            )}
          </div>
        ) : null;
      })()}

      {/* Mode select */}
      <div style={{ display: "flex", gap: 6 }}>
        {[{ k: "practice", l: "Practice", d: "Instant feedback" }, { k: "test", l: "Test", d: "Score at end" }].map(m => (
          <button key={m.k} onClick={() => setMode(m.k)} style={{
            flex: 1, padding: "12px 10px", borderRadius: 10, textAlign: "center",
            border: `1.5px solid ${mode === m.k ? C.greenPrimary : C.border}`,
            background: mode === m.k ? `${C.greenPrimary}18` : C.bgCard, cursor: "pointer",
          }}>
            <div style={{ ...font.card, fontSize: 13, color: mode === m.k ? C.greenBright : C.text }}>{m.l}</div>
            <div style={{ ...font.body, fontSize: 10, color: C.textMut, marginTop: 2 }}>{m.d}</div>
          </button>
        ))}
      </div>

      {/* Module filter */}
      <div>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Module</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {modules.map(m => {
            const active = selMods.has(m);
            const count = allQs.filter(q => q.module === m).length;
            return (
              <span key={m} onClick={() => toggle(selMods, setSelMods, m)} style={{
                ...font.label, fontSize: 9, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                border: `1.5px solid ${active ? C.greenBright : C.border}`,
                background: active ? `${C.greenBright}22` : "transparent",
                color: active ? C.greenBright : C.textSec,
              }}>{m} ({count})</span>
            );
          })}
        </div>
      </div>

      {/* Difficulty filter */}
      <div>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Difficulty</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {difficulties.map(d => {
            const active = selDiffs.has(d);
            const color = diffColors[d] || C.textSec;
            const count = allQs.filter(q => q.difficulty === d).length;
            return (
              <span key={d} onClick={() => toggle(selDiffs, setSelDiffs, d)} style={{
                ...font.label, fontSize: 9, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                border: `1.5px solid ${active ? color : C.border}`,
                background: active ? `${color}22` : "transparent",
                color: active ? color : C.textSec,
              }}>{d} ({count})</span>
            );
          })}
        </div>
      </div>

      {/* Topic filter (collapsible) */}
      <div>
        <div onClick={() => setShowTopics(!showTopics)} style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          Topic {showTopics ? "▾" : "▸"} {selTopics.size > 0 && <span style={{ color: C.greenBright }}>({selTopics.size} selected)</span>}
        </div>
        {showTopics && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", maxHeight: 160, overflowY: "auto" }}>
            {topics.map(t => {
              const active = selTopics.has(t);
              return (
                <span key={t} onClick={() => toggle(selTopics, setSelTopics, t)} style={{
                  ...font.label, fontSize: 8, padding: "4px 9px", borderRadius: 16, cursor: "pointer",
                  border: `1.5px solid ${active ? C.tan : C.border}`,
                  background: active ? `${C.tan}22` : "transparent",
                  color: active ? C.tan : C.textSec,
                }}>{t}</span>
              );
            })}
          </div>
        )}
      </div>

      {/* Selection summary & start */}
      <div style={{ background: C.bgCard, borderRadius: 12, padding: "16px 18px", border: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ ...font.card, fontSize: 14, color: C.text }}>Selected Questions</span>
          <span style={{ ...font.h, fontSize: 20, color: filtered.length > 0 ? C.greenBright : C.alertRed }}>{filtered.length}</span>
        </div>
        <div style={{ ...font.body, fontSize: 11, color: C.textSec, marginBottom: 4 }}>
          {selMods.size === 0 && selDiffs.size === 0 && selTopics.size === 0 ? "All questions (no filters)" : [
            selMods.size > 0 && `${selMods.size} module${selMods.size > 1 ? "s" : ""}`,
            selDiffs.size > 0 && `${selDiffs.size} difficult${selDiffs.size > 1 ? "ies" : "y"}`,
            selTopics.size > 0 && `${selTopics.size} topic${selTopics.size > 1 ? "s" : ""}`,
          ].filter(Boolean).join(" · ")}
        </div>
        {selMods.size > 0 || selDiffs.size > 0 || selTopics.size > 0 ? (
          <span onClick={() => { setSelMods(new Set()); setSelDiffs(new Set()); setSelTopics(new Set()); }} style={{ ...font.body, fontSize: 11, color: C.tan, cursor: "pointer" }}>Clear all filters</span>
        ) : null}
      </div>

      <button onClick={startQuiz} disabled={filtered.length === 0} style={{
        padding: 16, borderRadius: 12, border: "none",
        background: filtered.length > 0 ? C.greenPrimary : C.bgElevated,
        ...font.card, fontSize: 15, color: filtered.length > 0 ? C.text : C.textMut,
        cursor: filtered.length > 0 ? "pointer" : "default",
      }}>
        Start Quiz ({filtered.length} question{filtered.length !== 1 ? "s" : ""})
      </button>
    </div>
  );
};

/* ════════════════════ CONJUGATION DRILL ════════════════════ */
const SUBJECTS = [
  { pronoun: "je", idx: 0, label: "je / j'" },
  { pronoun: "tu", idx: 1, label: "tu" },
  { pronoun: "il/elle", idx: 2, label: "il / elle" },
  { pronoun: "nous", idx: 3, label: "nous" },
  { pronoun: "vous", idx: 4, label: "vous" },
  { pronoun: "ils/elles", idx: 5, label: "ils / elles" },
];
const IMP_SUBJECTS = [
  { pronoun: "tu", idx: 0, label: "tu" },
  { pronoun: "nous", idx: 1, label: "nous" },
  { pronoun: "vous", idx: 2, label: "vous" },
];

// Compound tenses store full phrases like "je vais dire", "j'ai été"
// Simple tenses store bare forms like "suis" or "étais"
const COMPOUND_TENSES = new Set([
  "passeCompose", "futurProche", "plusQueParfait",
  "subjPasse", "condPasse", "futurAnterieur",
]);

const parseConjAnswer = (rawVal, tenseKey) => {
  if (!rawVal || rawVal === "—" || rawVal === "∅") return null;

  const parts = rawVal.split("/").map(s => s.trim());
  const isImperatif = tenseKey === "imperatif";
  const isGerondif = tenseKey === "gerondif";
  const isCompound = COMPOUND_TENSES.has(tenseKey);

  // Gérondif has no subject — it's always "en + participe"
  if (isGerondif) {
    return { subject: null, subjectLabel: "(gérondif)", answer: rawVal, allForms: rawVal, hint: "en + participe présent" };
  }

  // Impératif: 3 forms (tu/nous/vous)
  if (isImperatif) {
    if (parts.length >= 3) {
      // skip forms that are "—"
      const validIdxs = [0, 1, 2].filter(i => parts[i] && parts[i] !== "—");
      if (validIdxs.length === 0) return null;
      const pick = validIdxs[Math.floor(Math.random() * validIdxs.length)];
      const subj = IMP_SUBJECTS[pick];
      return { subject: subj.pronoun, subjectLabel: subj.label, answer: parts[pick], allForms: rawVal, hint: "conjugated verb only" };
    }
    return { subject: "tu", subjectLabel: "tu", answer: rawVal, allForms: rawVal, hint: "conjugated verb only" };
  }

  // 6 forms: je/tu/il/nous/vous/ils — always simple (bare verb forms)
  if (parts.length === 6) {
    const subj = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
    return { subject: subj.pronoun, subjectLabel: subj.label, answer: parts[subj.idx], allForms: rawVal, hint: "conjugated verb only" };
  }

  // Single form — always je
  if (isCompound) {
    // Full phrase like "je vais dire" or "j'ai été"
    return {
      subject: "je", subjectLabel: "je / j'", answer: rawVal, allForms: rawVal, singleForm: true,
      hint: `full phrase (e.g. ${rawVal})`,
      isCompound: true,
    };
  }

  // Simple tense single form like "étais", "serai"
  return {
    subject: "je", subjectLabel: "je / j'", answer: rawVal, allForms: rawVal, singleForm: true,
    hint: "conjugated verb only",
  };
};

const ConjDrill = ({ go, ttsOn }) => {
  const [level, setLevel] = useState("A");
  const [qi, setQi] = useState(0);
  const [input, setInput] = useState("");
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const inputRef = useRef(null);

  const tenseKeys = {
    A: [{ k: "present", l: "Présent" }, { k: "passeCompose", l: "Passé composé" }, { k: "futurProche", l: "Futur proche" }, { k: "imperatif", l: "Impératif" }],
    B: [{ k: "imparfait", l: "Imparfait" }, { k: "plusQueParfait", l: "Plus-que-parfait" }, { k: "futurSimple", l: "Futur simple" }, { k: "conditionnel", l: "Conditionnel" }, { k: "subjonctif", l: "Subjonctif" }],
    C: [{ k: "passeSimple", l: "Passé simple" }, { k: "subjPasse", l: "Subj. passé" }, { k: "condPasse", l: "Cond. passé" }, { k: "futurAnterieur", l: "Futur antérieur" }, { k: "gerondif", l: "Gérondif" }],
  };

  const levelKey = level === "A" ? "npA" : level === "B" ? "npB" : "npC";
  const levelColor = level === "A" ? C.greenBright : level === "B" ? C.tan : C.gold;

  const questions = useMemo(() => {
    const pool = [];
    const tenses = tenseKeys[level];
    for (const v of verbsData.verbs) {
      const data = v[levelKey];
      if (!data) continue;
      for (const t of tenses) {
        const parsed = parseConjAnswer(data[t.k], t.k);
        if (!parsed) continue;
        pool.push({
          verb: v, tenseKey: t.k, tenseLabel: t.l,
          subject: parsed.subject,
          subjectLabel: parsed.subjectLabel,
          answer: parsed.answer,
          allForms: parsed.allForms,
          singleForm: parsed.singleForm || false,
          isCompound: parsed.isCompound || false,
          hint: parsed.hint || "",
        });
      }
    }
    return [...pool].sort(() => Math.random() - 0.5).slice(0, 15);
  }, [level]);

  const total = questions.length;
  const q = questions[qi];

  const normalize = (s) => s.toLowerCase().trim().replace(/\s+/g, " ").replace(/['ʼ']/g, "'");
  const stripAccents = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[''ʼ]/g, "").replace(/\s+/g, "");
  const [almostCorrect, setAlmostCorrect] = useState(false);

  const check = () => {
    if (answered) return;
    setAnswered(true);
    const userAns = normalize(input);
    const correctAns = normalize(q.answer);
    // Build acceptable variants
    const variants = [correctAns];
    if (q.singleForm && q.subject) {
      const withSubj = normalize(`${q.subject} ${q.answer}`);
      variants.push(withSubj);
      if (q.subject === "je") {
        variants.push(normalize(`j'${q.answer}`));
        variants.push(normalize(`j' ${q.answer}`));
      }
    }

    const exactMatch = variants.some(v => userAns === v);
    if (exactMatch) {
      setCorrect(true);
      setAlmostCorrect(false);
      setScore(s => s + 1);
      return;
    }

    // Check if it matches when stripping accents and apostrophes
    const userStripped = stripAccents(userAns);
    const fuzzyMatch = variants.some(v => userStripped === stripAccents(v));
    if (fuzzyMatch) {
      setCorrect(true);
      setAlmostCorrect(true);
      setScore(s => s + 1);
      return;
    }

    setCorrect(false);
    setAlmostCorrect(false);
  };

  const next = () => {
    if (qi + 1 >= total) { setDone(true); return; }
    setQi(i => i + 1); setInput(""); setAnswered(false); setCorrect(false); setAlmostCorrect(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const restart = () => {
    setQi(0); setInput(""); setAnswered(false); setCorrect(false); setAlmostCorrect(false); setScore(0); setDone(false);
  };

  useEffect(() => { inputRef.current?.focus(); }, []);

  if (done) {
    const pct = Math.round((score / total) * 100);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18, textAlign: "center", paddingTop: 40 }}>
        <div style={{ fontSize: 40 }}>{pct >= 70 ? "🏆" : "📋"}</div>
        <div style={{ ...font.h, fontSize: 44, color: pct >= 70 ? C.gold : C.alertRed }}>{pct}%</div>
        <div style={{ ...font.card, fontSize: 15, color: C.text }}>{score} / {total} Correct</div>
        <div style={{ ...font.body, fontSize: 12, color: C.textSec }}>NP-{level} Conjugation Drill</div>
        <button onClick={restart} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer", marginTop: 6 }}>Try Again</button>
        <button onClick={() => go("study")} style={{ padding: 12, borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", ...font.card, fontSize: 13, color: C.textSec, cursor: "pointer" }}>Back to Study</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => go("study")} style={{ background: "none", border: "none", cursor: "pointer", ...font.body, fontSize: 13, color: C.textSec }}>← NP-{level} Drill</button>
        <span style={{ ...font.label, fontSize: 10, color: C.textMut }}>{qi + 1} / {total}</span>
      </div>

      <Bar value={qi + 1} max={total} color={levelColor} h={3} />

      {/* NP Level selector */}
      {qi === 0 && !answered && (
        <div style={{ display: "flex", gap: 4, background: C.bgCard, borderRadius: 10, padding: 3 }}>
          {["A", "B", "C"].map(l => (
            <button key={l} onClick={() => setLevel(l)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: level === l ? C.bgElevated : "transparent", ...font.label, fontSize: 9, color: level === l ? levelColor : C.textMut, cursor: "pointer" }}>NP-{l}</button>
          ))}
        </div>
      )}

      {/* Question */}
      <div style={{ background: C.bgCard, borderRadius: 14, padding: "20px 18px", border: `1px solid ${C.border}`, textAlign: "center" }}>
        <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: 12 }}>
          <Chip active color={levelColor}>NP-{level}</Chip>
          <Chip active color={C.tan}>{q.tenseLabel}</Chip>
          <Chip color={C.textSec}>{q.verb.group}</Chip>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 6 }}>
          <div style={{ ...font.h, fontSize: 26, color: C.text }}>{q.verb.infinitif}</div>
          <SpeakBtn text={q.verb.infinitif} ttsOn={ttsOn} />
        </div>
        <div style={{ ...font.body, fontSize: 13, color: C.textSec, marginBottom: 10 }}>{q.verb.en}</div>
        {/* Subject pronoun — prominent */}
        {q.subjectLabel && (
          <div style={{ display: "inline-block", background: `${levelColor}20`, border: `1.5px solid ${levelColor}50`, borderRadius: 10, padding: "8px 20px" }}>
            <span style={{ ...font.h, fontSize: 22, color: levelColor }}>{q.subjectLabel}</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ ...font.label, fontSize: 9, color: C.textMut, textAlign: "center" }}>
        {q.tenseLabel} of « {q.verb.infinitif} » {q.subject ? `— ${q.subjectLabel}` : ""}
      </div>
      {/* Format hint */}
      <div style={{ ...font.body, fontSize: 11, color: C.tan, textAlign: "center", background: `${C.tan}12`, borderRadius: 8, padding: "6px 12px" }}>
        {q.isCompound
          ? `Type the full phrase (auxiliary + verb)`
          : q.tenseKey === "gerondif"
          ? `Type: en + participe présent`
          : `Type the conjugated verb only`
        }
      </div>
      {!answered && <AccentBar onChar={(ch) => { setInput(prev => prev + ch); inputRef.current?.focus(); }} />}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { answered ? next() : check(); } }}
        placeholder={q.isCompound ? "e.g. j'ai parlé, je vais dire..." : "Type the conjugation..."}
        disabled={answered}
        style={{
          width: "100%", padding: "14px 16px", borderRadius: 12, textAlign: "center",
          border: `1.5px solid ${answered ? (correct ? (almostCorrect ? C.gold : C.greenBright) : C.alertRed) + "55" : C.border}`,
          background: answered ? (correct ? (almostCorrect ? `${C.gold}12` : `${C.greenBright}12`) : `${C.alertRed}12`) : C.bgCard,
          color: C.text, ...font.card, fontSize: 16, outline: "none",
        }}
      />

      {/* Feedback */}
      {answered && (
        <div style={{ background: C.bgElevated, borderRadius: 12, padding: 16, border: `1px solid ${correct ? (almostCorrect ? C.gold : C.greenBright) : C.alertRed}25`, textAlign: "center" }}>
          <div style={{ ...font.label, fontSize: 9, color: correct ? (almostCorrect ? C.gold : C.greenBright) : C.alertRed, marginBottom: 8 }}>
            {correct ? (almostCorrect ? "Almost! Watch the accents/apostrophes" : "Correct!") : "Incorrect"}
          </div>
          {/* Show correct spelling when almost correct */}
          {correct && almostCorrect && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ ...font.body, fontSize: 10, color: C.textMut, marginBottom: 4 }}>Correct spelling:</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <div style={{ ...font.card, fontSize: 18, color: C.greenBright }}>{q.answer}</div>
                <SpeakBtn text={q.answer} ttsOn={ttsOn} size={24} />
              </div>
            </div>
          )}
          {!correct && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ ...font.body, fontSize: 11, color: C.textSec, marginBottom: 4 }}>
                {q.subject ? `${q.subjectLabel} →` : "Answer:"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <div style={{ ...font.card, fontSize: 18, color: C.greenBright }}>{q.answer}</div>
                <SpeakBtn text={q.answer} ttsOn={ttsOn} size={24} />
              </div>
            </div>
          )}
          {/* Show all forms if available */}
          {q.allForms && q.allForms.includes("/") && (
            <div style={{ background: C.bgCard, borderRadius: 8, padding: "10px 14px", textAlign: "left", marginBottom: 8 }}>
              <div style={{ ...font.label, fontSize: 8, color: levelColor, marginBottom: 6 }}>All forms — {q.tenseLabel}</div>
              {q.tenseKey === "imperatif" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                  {["tu", "nous", "vous"].map((s, i) => {
                    const forms = q.allForms.split("/").map(f => f.trim());
                    return forms[i] ? (
                      <div key={s}>
                        <div style={{ ...font.body, fontSize: 9, color: C.textMut }}>{s}</div>
                        <div style={{ ...font.card, fontSize: 12, color: s === q.subject ? C.greenBright : C.text }}>{forms[i]}</div>
                      </div>
                    ) : null;
                  })}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                  {["je", "tu", "il/elle", "nous", "vous", "ils/elles"].map((s, i) => {
                    const forms = q.allForms.split("/").map(f => f.trim());
                    return forms[i] ? (
                      <div key={s}>
                        <div style={{ ...font.body, fontSize: 9, color: C.textMut }}>{s}</div>
                        <div style={{ ...font.card, fontSize: 12, color: s === q.subject ? C.greenBright : C.text }}>{forms[i]}</div>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}
          {q.verb[levelKey]?.example && (
            <div style={{ borderLeft: `3px solid ${levelColor}44`, paddingLeft: 12, textAlign: "left", marginTop: 10 }}>
              <div style={{ ...font.body, fontSize: 12, color: C.text }}>{q.verb[levelKey].example.fr}</div>
              <div style={{ ...font.body, fontSize: 11, color: C.textSec, fontStyle: "italic", marginTop: 2 }}>{q.verb[levelKey].example.en}</div>
            </div>
          )}
        </div>
      )}

      {/* Action button */}
      {!answered ? (
        <button onClick={check} disabled={!input.trim()} style={{ padding: 14, borderRadius: 12, border: "none", background: input.trim() ? C.greenPrimary : C.bgElevated, ...font.card, fontSize: 14, color: input.trim() ? C.text : C.textMut, cursor: input.trim() ? "pointer" : "default" }}>Check</button>
      ) : (
        <button onClick={next} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer" }}>
          {qi + 1 >= total ? "See Results" : "Next"}
        </button>
      )}
    </div>
  );
};

/* ════════════════════ VERBS ════════════════════ */
const Verbs = ({ go, ttsOn }) => {
  const [open, setOpen] = useState(null);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("A");

  const filtered = useMemo(() => {
    let results = verbsData.verbs;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      results = results.filter(v =>
        v.infinitif.toLowerCase().includes(q) ||
        v.en.toLowerCase().includes(q) ||
        v.context.toLowerCase().includes(q)
      );
    }
    return results;
  }, [search]);

  const tenseLabels = {
    A: { present: "Présent", passeCompose: "Passé composé", futurProche: "Futur proche", imperatif: "Impératif" },
    B: { imparfait: "Imparfait", plusQueParfait: "Plus-que-parfait", futurSimple: "Futur simple", conditionnel: "Conditionnel", subjonctif: "Subjonctif" },
    C: { passeSimple: "Passé simple", subjPasse: "Subj. passé", condPasse: "Cond. passé", futurAnterieur: "Futur antérieur", gerondif: "Gérondif" },
  };

  const levelKey = level === "A" ? "npA" : level === "B" ? "npB" : "npC";
  const levelColor = level === "A" ? C.greenBright : level === "B" ? C.tan : C.gold;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>100 Verbs</div>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search verbs..."
          style={{ width: "100%", padding: "11px 14px 11px 36px", borderRadius: 10, border: `1.5px solid ${search ? C.greenPrimary + "55" : C.border}`, background: C.bgCard, color: C.text, ...font.body, fontSize: 13, outline: "none" }}
        />
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.textMut, fontSize: 14 }}>⌕</span>
        {search && <span onClick={() => setSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.textMut, fontSize: 14, cursor: "pointer" }}>✕</span>}
      </div>

      {/* NP Level tabs */}
      <div style={{ display: "flex", gap: 4, background: C.bgCard, borderRadius: 10, padding: 3 }}>
        {[{ k: "A", l: "NP-A Rudimentaire" }, { k: "B", l: "NP-B Intermédiaire" }, { k: "C", l: "NP-C Avancé" }].map(t => (
          <button key={t.k} onClick={() => setLevel(t.k)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: level === t.k ? C.bgElevated : "transparent", ...font.label, fontSize: 9, color: level === t.k ? (t.k === "A" ? C.greenBright : t.k === "B" ? C.tan : C.gold) : C.textMut, cursor: "pointer" }}>{t.k}</button>
        ))}
      </div>

      {/* Tense reference for this level */}
      <div style={{ background: C.bgCard, borderRadius: 10, padding: "10px 14px", border: `1px solid ${C.border}` }}>
        <div style={{ ...font.label, fontSize: 8, color: levelColor, marginBottom: 6 }}>
          {level === "A" ? "NP-A Rudimentaire" : level === "B" ? "NP-B Intermédiaire" : "NP-C Avancé"} Tenses
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {Object.values(tenseLabels[level]).map(t => (
            <Chip key={t} active color={levelColor}>{t}</Chip>
          ))}
        </div>
      </div>

      <div style={{ ...font.body, fontSize: 11, color: C.textMut }}>{filtered.length} verbs{search && ` matching "${search}"`}</div>

      {/* Verb cards */}
      {filtered.map(v => {
        const data = v[levelKey];
        const isOpen = open === v.id;
        return (
          <div key={v.id} onClick={() => setOpen(isOpen ? null : v.id)} style={{ background: C.bgCard, borderRadius: 12, padding: "14px 16px", border: `1px solid ${isOpen ? levelColor + "44" : C.border}`, cursor: "pointer", transition: "border-color 0.2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...font.h, fontSize: 13, color: levelColor }}>{v.id}.</span>
                <span style={{ ...font.card, fontSize: 15, color: C.text }}>{v.infinitif}</span>
                <SpeakBtn text={v.infinitif} ttsOn={ttsOn} size={22} />
                <Chip active color={C.textSec}>{v.group}</Chip>
              </div>
              <span style={{ ...font.body, fontSize: 12, color: C.textSec }}>{v.en}</span>
            </div>
            <div style={{ ...font.body, fontSize: 10, color: C.textMut }}>{v.context}</div>

            {isOpen && data && (
              <div style={{ marginTop: 14 }}>
                {/* Conjugation table */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
                  {Object.entries(tenseLabels[level]).map(([key, label]) => (
                    <div key={key} style={{ background: C.bgBase, borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ ...font.label, fontSize: 7, color: levelColor, marginBottom: 3 }}>{label}</div>
                      <div style={{ ...font.card, fontSize: 12, color: C.text }}>{data[key] || "—"}</div>
                    </div>
                  ))}
                </div>

                {/* Example */}
                {data.example && (
                  <div style={{ borderLeft: `3px solid ${levelColor}44`, paddingLeft: 12 }}>
                    <div style={{ ...font.body, fontSize: 12, color: C.text, marginBottom: 3 }}>{data.example.fr}</div>
                    <div style={{ ...font.body, fontSize: 11, color: C.textSec, fontStyle: "italic" }}>{data.example.en}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ════════════════════ WEAK AREAS ════════════════════ */
const WeakAreas = ({ go, srs, grammarSrs }) => {
  const stats = useStats(srs);

  const grammarByTopic = useMemo(() => {
    const topics = {};
    for (const [qId, data] of Object.entries(grammarSrs)) {
      const t = data.topic || "Unknown";
      if (!topics[t]) topics[t] = { attempts: 0, correct: 0, questions: [] };
      topics[t].attempts += data.attempts;
      topics[t].correct += data.correct;
      topics[t].questions.push(qId);
    }
    return Object.entries(topics)
      .map(([topic, d]) => ({ topic, pct: d.attempts > 0 ? Math.round((d.correct / d.attempts) * 100) : 0, attempts: d.attempts, correct: d.correct, count: d.questions.length }))
      .sort((a, b) => a.pct - b.pct);
  }, [grammarSrs]);

  const grammarByModule = useMemo(() => {
    const mods = {};
    for (const [, data] of Object.entries(grammarSrs)) {
      const m = data.module || "Unknown";
      if (!mods[m]) mods[m] = { attempts: 0, correct: 0 };
      mods[m].attempts += data.attempts;
      mods[m].correct += data.correct;
    }
    return Object.entries(mods)
      .map(([mod, d]) => ({ mod, pct: d.attempts > 0 ? Math.round((d.correct / d.attempts) * 100) : 0, attempts: d.attempts }))
      .sort((a, b) => a.pct - b.pct);
  }, [grammarSrs]);

  const missedQs = useMemo(() => {
    return Object.entries(grammarSrs)
      .filter(([, d]) => d.attempts > 0 && (d.correct / d.attempts) < 0.5)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => (a.correct / a.attempts) - (b.correct / b.attempts));
  }, [grammarSrs]);

  const totalGrammarAttempts = Object.values(grammarSrs).reduce((s, d) => s + d.attempts, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Weak Areas</div>

      {totalGrammarAttempts === 0 && Object.keys(srs).length === 0 ? (
        <div style={{ background: C.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, textAlign: "center" }}>
          <div style={{ ...font.card, fontSize: 14, color: C.text, marginBottom: 8 }}>No data yet</div>
          <div style={{ ...font.body, fontSize: 12, color: C.textSec }}>Complete some quizzes or flashcard sessions to see your weak areas here.</div>
        </div>
      ) : <>
        {/* Lexique category weaknesses */}
        <div>
          <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Synonym Categories</div>
          {Object.entries(stats.catStats).map(([cat, s]) => {
            const pct = s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0;
            const label = cat === "nom" ? "Noms" : cat === "verbe" ? "Verbes" : cat === "connecteur" ? "Connecteurs" : "Expressions";
            return (
              <div key={cat} onClick={() => go("flashcard", { category: cat })} style={{ background: C.bgCard, borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.border}`, marginBottom: 6, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ ...font.card, fontSize: 12, color: C.text }}>{label}</span>
                  <span style={{ ...font.label, fontSize: 10, color: pct < 30 ? C.alertRed : pct < 70 ? C.tan : C.greenBright }}>{pct}% mastered</span>
                </div>
                <Bar value={pct} color={pct < 30 ? C.alertRed : pct < 70 ? C.tan : C.greenBright} h={3} />
              </div>
            );
          })}
        </div>

        {/* Grammar by module */}
        {grammarByModule.length > 0 && (
          <div>
            <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Grammar by Module</div>
            {grammarByModule.map(m => (
              <div key={m.mod} onClick={() => go("grammarquiz", { module: m.mod })} style={{ background: C.bgCard, borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.border}`, marginBottom: 6, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ ...font.card, fontSize: 12, color: C.text }}>{m.mod}</span>
                  <span style={{ ...font.label, fontSize: 10, color: m.pct < 50 ? C.alertRed : m.pct < 75 ? C.tan : C.greenBright }}>{m.pct}% ({m.attempts} attempts)</span>
                </div>
                <Bar value={m.pct} color={m.pct < 50 ? C.alertRed : m.pct < 75 ? C.tan : C.greenBright} h={3} />
              </div>
            ))}
          </div>
        )}

        {/* Grammar by topic */}
        {grammarByTopic.length > 0 && (
          <div>
            <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Weakest Grammar Topics</div>
            {grammarByTopic.slice(0, 8).map(t => (
              <div key={t.topic} style={{ background: C.bgCard, borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.border}`, marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ ...font.card, fontSize: 12, color: C.text }}>{t.topic}</span>
                  <span style={{ ...font.label, fontSize: 10, color: t.pct < 50 ? C.alertRed : t.pct < 75 ? C.tan : C.greenBright }}>{t.correct}/{t.attempts}</span>
                </div>
                <Bar value={t.pct} color={t.pct < 50 ? C.alertRed : t.pct < 75 ? C.tan : C.greenBright} h={3} />
              </div>
            ))}
          </div>
        )}

        {/* Most missed questions */}
        {missedQs.length > 0 && (
          <div>
            <div style={{ ...font.label, fontSize: 9, color: C.alertRed, marginBottom: 8 }}>Most Missed Questions ({missedQs.length})</div>
            <button onClick={() => go("grammarquiz")} style={{
              width: "100%", padding: 14, borderRadius: 12, border: "none",
              background: C.alertRed, ...font.card, fontSize: 14, color: "#fff", cursor: "pointer",
            }}>
              Practice Weak Questions
            </button>
          </div>
        )}
      </>}
    </div>
  );
};

/* ════════════════════ EXAM SIMULATION ════════════════════ */
const ExamSim = ({ go, srs, grammarSrs, setGrammarSrs, ttsOn }) => {
  const [phase, setPhase] = useState("setup"); // setup | running | results
  const [timeLimit, setTimeLimit] = useState(15); // minutes
  const [qs, setQs] = useState([]);
  const [qi, setQi] = useState(0);
  const [sel, setSel] = useState(null);
  const [input, setInput] = useState("");
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const inputRef = useRef(null);

  // Timer
  useEffect(() => {
    if (phase !== "running" || timeUp) return;
    const iv = setInterval(() => {
      const e = Math.floor((Date.now() - startTime) / 1000);
      setElapsed(e);
      if (e >= timeLimit * 60) { setTimeUp(true); setPhase("results"); }
    }, 1000);
    return () => clearInterval(iv);
  }, [phase, startTime, timeLimit, timeUp]);

  const buildQuestions = () => {
    const pool = [];

    // Grammar questions (50%)
    const grammarPool = [...grammarData.questions].sort(() => Math.random() - 0.5).slice(0, 10);
    for (const q of grammarPool) {
      const opts = [q.correct, ...q.wrong.map(w => w.answer)].sort(() => Math.random() - 0.5);
      pool.push({ type: "grammar", ...q, opts, correctIdx: opts.indexOf(q.correct) });
    }

    // Synonym questions (30%)
    const synPool = lexiqueData.filter(e => e.synonyms.length >= 1 && e.en);
    const synShuffled = [...synPool].sort(() => Math.random() - 0.5).slice(0, 6);
    for (const entry of synShuffled) {
      const correctSyn = entry.synonyms[Math.floor(Math.random() * entry.synonyms.length)];
      const wrongSyns = synPool.filter(e => e.id !== entry.id).sort(() => Math.random() - 0.5).slice(0, 3)
        .map(e => e.synonyms.length > 0 ? e.synonyms[0] : e.term);
      const opts = [correctSyn, ...wrongSyns].sort(() => Math.random() - 0.5);
      pool.push({
        type: "synonym",
        id: `syn-${entry.id}`,
        stem: `Quel est un synonyme de « ${entry.term} » ?`,
        en: entry.en,
        correct: correctSyn,
        opts,
        correctIdx: opts.indexOf(correctSyn),
        allSyns: entry.synonyms,
      });
    }

    // Conjugation questions (20%)
    const levels = ["A", "B", "C"];
    const tenseKeys = {
      A: ["present", "passeCompose", "futurProche"],
      B: ["imparfait", "futurSimple", "conditionnel"],
      C: ["passeSimple", "condPasse", "futurAnterieur"],
    };
    const conjPool = [];
    for (const lv of levels) {
      const lk = lv === "A" ? "npA" : lv === "B" ? "npB" : "npC";
      for (const v of verbsData.verbs) {
        const data = v[lk];
        if (!data) continue;
        for (const tk of tenseKeys[lv]) {
          const val = data[tk];
          if (val && val !== "—" && val !== "∅") {
            conjPool.push({ verb: v, level: lv, tenseKey: tk, answer: val });
          }
        }
      }
    }
    const conjShuffled = [...conjPool].sort(() => Math.random() - 0.5).slice(0, 4);
    for (const c of conjShuffled) {
      const tenseLabel = c.tenseKey.replace(/([A-Z])/g, " $1").trim();
      pool.push({
        type: "conjugation",
        id: `conj-${c.verb.id}-${c.tenseKey}`,
        stem: `${tenseLabel} of « ${c.verb.infinitif} » (${c.verb.en})`,
        answer: c.answer,
        level: c.level,
      });
    }

    return pool.sort(() => Math.random() - 0.5);
  };

  const start = () => {
    setQs(buildQuestions());
    setQi(0); setSel(null); setInput(""); setAnswered(false);
    setScore(0); setAnswers([]); setTimeUp(false);
    setStartTime(Date.now()); setElapsed(0);
    setPhase("running");
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const remaining = Math.max(0, timeLimit * 60 - elapsed);

  const submitAnswer = () => {
    if (answered) return;
    const q = qs[qi];
    let correct = false;

    if (q.type === "conjugation") {
      const normalize = (s) => s.toLowerCase().trim().replace(/\s+/g, " ").replace(/['ʼ']/g, "'");
      const variants = normalize(q.answer).split("/").map(s => s.trim());
      correct = variants.some(v => normalize(input) === v);
    } else {
      correct = sel === q.correctIdx;
    }

    if (correct) setScore(s => s + 1);
    setAnswers(a => [...a, { qi, correct, type: q.type }]);
    setAnswered(true);

    if (q.type === "grammar") {
      const updated = recordGrammarAnswer(grammarSrs, q.id, correct, q.module, q.topic, q.difficulty);
      setGrammarSrs(updated);
      saveGrammarSRS(updated);
    }
  };

  const nextQ = () => {
    if (qi + 1 >= qs.length) { setPhase("results"); return; }
    setQi(i => i + 1); setSel(null); setInput(""); setAnswered(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // RESULTS
  if (phase === "results") {
    const total = answers.length;
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    const byType = { grammar: { c: 0, t: 0 }, synonym: { c: 0, t: 0 }, conjugation: { c: 0, t: 0 } };
    for (const a of answers) {
      byType[a.type].t++;
      if (a.correct) byType[a.type].c++;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ textAlign: "center", padding: "24px 0 8px" }}>
          <div style={{ fontSize: 40 }}>{pct >= 70 ? "🏆" : timeUp ? "⏰" : "📋"}</div>
          <div style={{ ...font.h, fontSize: 44, color: pct >= 70 ? C.gold : C.alertRed, marginTop: 8 }}>{pct}%</div>
          <div style={{ ...font.card, fontSize: 15, color: C.text, marginTop: 4 }}>{score} / {total} Correct</div>
          <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 6 }}>
            {timeUp ? "Time's up!" : `Completed in ${formatTime(elapsed)}`} · Exam Simulation
          </div>
        </div>

        {/* Breakdown by type */}
        <div style={{ background: C.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
          <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 10 }}>Breakdown</div>
          {[
            { l: "Grammar", ...byType.grammar, color: C.tan },
            { l: "Synonyms", ...byType.synonym, color: C.greenBright },
            { l: "Conjugation", ...byType.conjugation, color: C.gold },
          ].map(s => s.t > 0 && (
            <div key={s.l} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ ...font.body, fontSize: 12, color: C.text }}>{s.l}</span>
                <span style={{ ...font.label, fontSize: 10, color: s.color }}>{s.c}/{s.t}</span>
              </div>
              <Bar value={s.t > 0 ? (s.c / s.t) * 100 : 0} color={s.color} h={3} />
            </div>
          ))}
        </div>

        <button onClick={() => setPhase("setup")} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer" }}>New Exam</button>
        <button onClick={() => go("home")} style={{ padding: 12, borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", ...font.card, fontSize: 13, color: C.textSec, cursor: "pointer" }}>Back to Home</button>
      </div>
    );
  }

  // RUNNING
  if (phase === "running") {
    const q = qs[qi];
    const timerColor = remaining < 60 ? C.alertRed : remaining < 180 ? C.gold : C.greenBright;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Timer bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...font.label, fontSize: 10, color: C.textMut }}>Q{qi + 1}/{qs.length}</span>
          <span style={{ ...font.h, fontSize: 16, color: timerColor }}>{formatTime(remaining)}</span>
        </div>
        <Bar value={remaining} max={timeLimit * 60} color={timerColor} h={4} />

        {/* Question type badge */}
        <div style={{ display: "flex", gap: 5 }}>
          <Chip active color={q.type === "grammar" ? C.tan : q.type === "synonym" ? C.greenBright : C.gold}>
            {q.type === "grammar" ? "Grammar" : q.type === "synonym" ? "Synonym" : "Conjugation"}
          </Chip>
          {q.module && <Chip color={C.textSec}>{q.module}</Chip>}
          {q.level && <Chip color={C.textSec}>NP-{q.level}</Chip>}
        </div>

        {/* Stem */}
        <div style={{ background: C.bgCard, borderRadius: 14, padding: "18px 16px", border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ ...font.card, fontSize: 15, color: C.text, lineHeight: 1.6, flex: 1 }}>{q.stem}</div>
            <SpeakBtn text={q.stem.replace(/_+/g, q.correct || q.answer || "")} ttsOn={ttsOn} size={26} />
          </div>
          {q.en && <div style={{ ...font.body, fontSize: 11, color: C.textMut, marginTop: 6 }}>{q.en}</div>}
        </div>

        {/* ABCD options for grammar/synonym */}
        {q.type !== "conjugation" && q.opts.map((o, i) => {
          const isSel = i === sel;
          const show = answered;
          const isCorr = i === q.correctIdx;
          let bc = C.border, bg = C.bgCard;
          if (show && isCorr) { bc = C.greenBright; bg = `${C.greenBright}12`; }
          if (show && isSel && !isCorr) { bc = C.alertRed; bg = `${C.alertRed}12`; }
          if (!show && isSel) { bc = C.greenPrimary; bg = `${C.greenPrimary}12`; }
          return (
            <button key={i} onClick={() => { if (!answered) setSel(i); }} style={{ background: bg, borderRadius: 10, padding: "12px 14px", border: `1.5px solid ${bc}`, cursor: answered ? "default" : "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, border: `1.5px solid ${isSel ? bc : C.textMut}33`, display: "flex", alignItems: "center", justifyContent: "center", ...font.label, fontSize: 10, color: isSel ? bc : C.textMut, flexShrink: 0 }}>
                {show && isCorr ? "✓" : show && isSel && !isCorr ? "✗" : String.fromCharCode(65 + i)}
              </div>
              <span style={{ ...font.body, fontSize: 13, color: C.text }}>{o}</span>
            </button>
          );
        })}

        {/* Text input for conjugation */}
        {q.type === "conjugation" && !answered && <AccentBar onChar={(ch) => { setInput(prev => prev + ch); inputRef.current?.focus(); }} />}
        {q.type === "conjugation" && (
          <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { answered ? nextQ() : submitAnswer(); } }}
            placeholder="Type the conjugation..."
            disabled={answered}
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12, textAlign: "center",
              border: `1.5px solid ${answered ? (answers[answers.length - 1]?.correct ? C.greenBright : C.alertRed) + "55" : C.border}`,
              background: C.bgCard, color: C.text, ...font.card, fontSize: 16, outline: "none",
            }}
          />
        )}

        {/* Feedback */}
        {answered && (
          <div style={{ background: C.bgElevated, borderRadius: 10, padding: 14, border: `1px solid ${answers[answers.length - 1]?.correct ? C.greenBright : C.alertRed}25`, textAlign: "center" }}>
            <div style={{ ...font.label, fontSize: 9, color: answers[answers.length - 1]?.correct ? C.greenBright : C.alertRed }}>
              {answers[answers.length - 1]?.correct ? "Correct!" : "Incorrect"}
            </div>
            {q.type === "conjugation" && !answers[answers.length - 1]?.correct && (
              <div style={{ ...font.card, fontSize: 14, color: C.greenBright, marginTop: 6 }}>{q.answer}</div>
            )}
          </div>
        )}

        {/* Action */}
        {!answered ? (
          <button onClick={submitAnswer} disabled={q.type === "conjugation" ? !input.trim() : sel === null} style={{
            padding: 14, borderRadius: 12, border: "none",
            background: (q.type === "conjugation" ? input.trim() : sel !== null) ? C.greenPrimary : C.bgElevated,
            ...font.card, fontSize: 14,
            color: (q.type === "conjugation" ? input.trim() : sel !== null) ? C.text : C.textMut,
            cursor: (q.type === "conjugation" ? input.trim() : sel !== null) ? "pointer" : "default",
          }}>Submit</button>
        ) : (
          <button onClick={nextQ} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer" }}>
            {qi + 1 >= qs.length ? "See Results" : "Next"}
          </button>
        )}
      </div>
    );
  }

  // SETUP
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Exam Simulation</div>
      <div style={{ ...font.body, fontSize: 12, color: C.textSec }}>
        Timed mock test combining grammar, synonyms, and conjugation — just like the PSC exam.
      </div>

      <div style={{ background: C.bgCard, borderRadius: 12, padding: 18, border: `1px solid ${C.border}` }}>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 10 }}>Format</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { l: "Grammar (ABCD)", n: "10 questions", color: C.tan },
            { l: "Synonyms (ABCD)", n: "6 questions", color: C.greenBright },
            { l: "Conjugation (type)", n: "4 questions", color: C.gold },
          ].map(s => (
            <div key={s.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} />
                <span style={{ ...font.body, fontSize: 12, color: C.text }}>{s.l}</span>
              </div>
              <span style={{ ...font.body, fontSize: 11, color: C.textSec }}>{s.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Time Limit</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[10, 15, 20, 30].map(t => (
            <button key={t} onClick={() => setTimeLimit(t)} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, textAlign: "center",
              border: `1.5px solid ${timeLimit === t ? C.greenPrimary : C.border}`,
              background: timeLimit === t ? `${C.greenPrimary}18` : C.bgCard,
              ...font.card, fontSize: 14, color: timeLimit === t ? C.greenBright : C.text, cursor: "pointer",
            }}>{t}m</button>
          ))}
        </div>
      </div>

      <button onClick={start} style={{ padding: 16, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 15, color: C.text, cursor: "pointer" }}>
        Start Exam (20 questions · {timeLimit} min)
      </button>
    </div>
  );
};

/* ════════════════════ DAILY STUDY PLAN ════════════════════ */
const DailyPlan = ({ go }) => {
  const [plan, setPlan] = useState(loadDailyPlan);
  const activity = loadActivity();
  const t = today();
  const todayAct = activity[t] || { flashcards: 0, grammar: 0, conjugation: 0, synonym: 0, listening: 0, reading: 0, writing: 0, total: 0 };

  const goals = [
    { key: "flashcards", label: "Flashcards", goal: 10, icon: "📇", color: C.greenBright, screen: "flashcard" },
    { key: "grammar", label: "Grammar Quiz", goal: 5, icon: "📝", color: C.tan, screen: "grammarquiz" },
    { key: "conjugation", label: "Conjugation Drill", goal: 5, icon: "🔤", color: C.gold, screen: "conjdrill" },
    { key: "synonym", label: "Synonym Quiz", goal: 5, icon: "🔀", color: C.greenPrimary, screen: "quiz" },
    { key: "listening", label: "Listening", goal: 3, icon: "🎧", color: C.tanLight, screen: "listening" },
    { key: "reading", label: "Reading", goal: 1, icon: "📖", color: C.alertRed, screen: "reading" },
    { key: "writing", label: "Writing", goal: 1, icon: "✍️", color: C.gold, screen: "writing" },
  ];

  const totalDone = goals.reduce((s, g) => s + Math.min(todayAct[g.key] || 0, g.goal), 0);
  const totalGoal = goals.reduce((s, g) => s + g.goal, 0);
  const pct = Math.round((totalDone / totalGoal) * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Daily Study Plan</div>

      {/* Overall progress */}
      <div style={{ background: C.bgCard, borderRadius: 14, padding: "18px 20px", border: `1px solid ${C.border}`, textAlign: "center" }}>
        <div style={{ ...font.h, fontSize: 36, color: pct >= 100 ? C.gold : C.greenBright }}>{pct}%</div>
        <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 4 }}>
          {pct >= 100 ? "Daily goal complete! 🎉" : `${totalDone} / ${totalGoal} activities done`}
        </div>
        <Bar value={pct} color={pct >= 100 ? C.gold : C.greenBright} h={6} />
      </div>

      {/* Individual goals */}
      {goals.map(g => {
        const done = todayAct[g.key] || 0;
        const complete = done >= g.goal;
        return (
          <div key={g.key} onClick={() => go(g.screen)} style={{
            background: C.bgCard, borderRadius: 12, padding: "14px 16px",
            border: `1px solid ${complete ? g.color + "44" : C.border}`,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 20 }}>{g.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ ...font.card, fontSize: 13, color: C.text }}>{g.label}</span>
                <span style={{ ...font.label, fontSize: 10, color: complete ? g.color : C.textSec }}>
                  {done}/{g.goal} {complete ? "✓" : ""}
                </span>
              </div>
              <Bar value={done} max={g.goal} color={g.color} h={3} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ════════════════════ LISTENING COMPREHENSION ════════════════════ */
const Listening = ({ go, ttsOn }) => {
  const [phase, setPhase] = useState("setup");
  const [mode, setMode] = useState(null); // "scenarios" or "vocab"
  const [level, setLevel] = useState("A");
  const [qi, setQi] = useState(0);
  const [sel, setSel] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [plays, setPlays] = useState(0);
  const [qs, setQs] = useState([]);
  const [scenario, setScenario] = useState(null);
  const [speedMode, setSpeedMode] = useState("normal"); // normal or slow

  // Filter scenarios by level
  const scenariosByLevel = useMemo(() => {
    const lvl = `NP-${level}`;
    return listeningData.scenarios.filter(s => s.level === lvl);
  }, [level]);

  const allScenarios = listeningData.scenarios;

  // Build vocab-based questions (original mode)
  const vocabQuestions = useMemo(() => {
    const pool = [];
    for (const e of lexiqueData) {
      if (!e.en || e.synonyms.length < 1) continue;
      pool.push({
        fr: `${e.term} est un synonyme de ${e.synonyms[0]}.`,
        question: `Quel mot a été utilisé comme synonyme ?`,
        correct: e.synonyms[0],
        wrong: lexiqueData.filter(x => x.id !== e.id && x.synonyms.length > 0).sort(() => Math.random() - 0.5).slice(0, 3).map(x => x.synonyms[0] || x.term),
        en: e.en,
      });
    }
    for (const v of verbsData.verbs) {
      const lk = level === "A" ? "npA" : level === "B" ? "npB" : "npC";
      if (v[lk]?.example?.fr) {
        pool.push({
          fr: v[lk].example.fr,
          question: `Quel verbe a été utilisé dans la phrase ?`,
          correct: v.infinitif,
          wrong: verbsData.verbs.filter(x => x.id !== v.id).sort(() => Math.random() - 0.5).slice(0, 3).map(x => x.infinitif),
          en: v[lk].example.en,
        });
      }
    }
    return pool.sort(() => Math.random() - 0.5).slice(0, 10);
  }, [level]);

  const startVocab = () => {
    const shuffled = vocabQuestions.map(s => {
      const opts = [s.correct, ...s.wrong].sort(() => Math.random() - 0.5);
      return { ...s, opts, correctIdx: opts.indexOf(s.correct) };
    });
    setQs(shuffled);
    setQi(0); setSel(null); setAnswered(false); setScore(0); setPlays(0);
    setMode("vocab");
    setPhase("quiz");
  };

  const startScenario = (sc) => {
    setScenario(sc);
    const mapped = sc.questions.map(q => ({
      fr: sc.text,
      question: q.stem,
      opts: q.options,
      correctIdx: q.correct,
      explanation: q.explanation,
      scenarioTitle: sc.title,
      scenarioType: sc.type,
    }));
    setQs(mapped);
    setQi(0); setSel(null); setAnswered(false); setScore(0); setPlays(0);
    setMode("scenarios");
    setPhase("quiz");
  };

  const playAudio = () => {
    const text = qs[qi]?.fr || "";
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "fr-FR";
    utter.rate = speedMode === "slow" ? 0.65 : 0.85;
    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(v => v.lang.startsWith("fr")) || null;
    if (frVoice) utter.voice = frVoice;
    window.speechSynthesis.speak(utter);
    setPlays(p => p + 1);
  };

  const pick = (i) => {
    if (answered) return;
    setSel(i);
    setAnswered(true);
    if (i === qs[qi].correctIdx) setScore(s => s + 1);
    recordActivity("listening");
  };

  const next = () => {
    if (qi + 1 >= qs.length) { setPhase("results"); return; }
    setQi(i => i + 1); setSel(null); setAnswered(false); setPlays(0);
  };

  if (phase === "results") {
    const pct = Math.round((score / qs.length) * 100);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18, textAlign: "center" }}>
        <div style={{ padding: "24px 0 8px" }}>
          <div style={{ fontSize: 40 }}>{pct >= 70 ? "🎧" : "📋"}</div>
          <div style={{ ...font.h, fontSize: 44, color: pct >= 70 ? C.gold : C.alertRed, marginTop: 8 }}>{pct}%</div>
          <div style={{ ...font.card, fontSize: 15, color: C.text, marginTop: 4 }}>{score} / {qs.length} Correct</div>
          <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 6 }}>
            {mode === "scenarios" && scenario ? scenario.title : "Vocabulary Listening"}
          </div>
        </div>
        <button onClick={() => { setPhase("setup"); setMode(null); setScenario(null); }} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer" }}>New Session</button>
        <button onClick={() => go("home")} style={{ padding: 12, borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", ...font.card, fontSize: 13, color: C.textSec, cursor: "pointer" }}>Back to Home</button>
      </div>
    );
  }

  if (phase === "quiz") {
    const q = qs[qi];
    const isScenario = mode === "scenarios";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => { setPhase("setup"); setMode(null); }} style={{ background: "none", border: "none", cursor: "pointer", ...font.body, fontSize: 12, color: C.textSec }}>← Back</button>
          <span style={{ ...font.label, fontSize: 10, color: C.textMut }}>Q{qi + 1}/{qs.length}</span>
        </div>
        {isScenario && <div style={{ ...font.card, fontSize: 13, color: C.tanLight, textAlign: "center" }}>{scenario.title}</div>}
        <Bar value={qi + 1} max={qs.length} color={C.tanLight} h={3} />

        {/* Play button + speed toggle */}
        <div style={{ background: C.bgCard, borderRadius: 14, padding: "24px 20px", border: `1px solid ${C.border}`, textAlign: "center" }}>
          <button onClick={playAudio} style={{
            width: 70, height: 70, borderRadius: 35, border: `2px solid ${C.tanLight}`,
            background: `${C.tanLight}15`, cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", margin: "0 auto",
          }}>
            <span style={{ fontSize: 30 }}>🔊</span>
          </button>
          <div style={{ ...font.card, fontSize: 14, color: C.text, marginTop: 12 }}>Tap to listen</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
            <button onClick={() => setSpeedMode("normal")} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${speedMode === "normal" ? C.greenPrimary : C.border}`, background: speedMode === "normal" ? `${C.greenPrimary}18` : "transparent", ...font.label, fontSize: 10, color: speedMode === "normal" ? C.greenBright : C.textMut, cursor: "pointer" }}>Normal</button>
            <button onClick={() => setSpeedMode("slow")} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${speedMode === "slow" ? C.gold : C.border}`, background: speedMode === "slow" ? `${C.gold}18` : "transparent", ...font.label, fontSize: 10, color: speedMode === "slow" ? C.gold : C.textMut, cursor: "pointer" }}>🐢 Slow</button>
          </div>
          <div style={{ ...font.body, fontSize: 11, color: C.textMut, marginTop: 6 }}>Played {plays} time{plays !== 1 ? "s" : ""}</div>
          {answered && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: C.bgElevated, borderRadius: 8, textAlign: "left" }}>
              <div style={{ ...font.body, fontSize: 13, color: C.text, whiteSpace: "pre-wrap" }}>{q.fr}</div>
              {q.en && <div style={{ ...font.body, fontSize: 11, color: C.textSec, fontStyle: "italic", marginTop: 4 }}>{q.en}</div>}
              {q.explanation && <div style={{ ...font.body, fontSize: 11, color: C.greenBright, marginTop: 6 }}>{q.explanation}</div>}
            </div>
          )}
        </div>

        <div style={{ ...font.card, fontSize: 13, color: C.text, textAlign: "center" }}>{q.question}</div>

        {q.opts.map((o, i) => {
          const isCorr = i === q.correctIdx;
          const isSel = i === sel;
          let bc = C.border, bg = C.bgCard;
          if (answered && isCorr) { bc = C.greenBright; bg = `${C.greenBright}12`; }
          if (answered && isSel && !isCorr) { bc = C.alertRed; bg = `${C.alertRed}12`; }
          if (!answered && isSel) { bc = C.greenPrimary; bg = `${C.greenPrimary}12`; }
          return (
            <button key={i} onClick={() => pick(i)} style={{ background: bg, borderRadius: 10, padding: "12px 14px", border: `1.5px solid ${bc}`, cursor: answered ? "default" : "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, border: `1.5px solid ${isSel ? bc : C.textMut}33`, display: "flex", alignItems: "center", justifyContent: "center", ...font.label, fontSize: 10, color: isSel ? bc : C.textMut, flexShrink: 0 }}>
                {answered && isCorr ? "✓" : answered && isSel && !isCorr ? "✗" : String.fromCharCode(65 + i)}
              </div>
              <span style={{ ...font.body, fontSize: 13, color: C.text }}>{o}</span>
            </button>
          );
        })}

        {answered && (
          <button onClick={next} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer" }}>
            {qi + 1 >= qs.length ? "See Results" : "Next"}
          </button>
        )}
      </div>
    );
  }

  // SETUP
  const typeIcons = { message: "📞", announcement: "📢", dialogue: "💬", instructions: "📋" };
  const typeLabels = { message: "Message", announcement: "Announcement", dialogue: "Dialogue", instructions: "Instructions" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Listening Comprehension</div>
      <div style={{ ...font.body, fontSize: 12, color: C.textSec }}>
        Listen to French audio and answer comprehension questions. Train your ear for the PSC oral exam.
      </div>

      {/* NP Level filter */}
      <div>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>NP Level</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["A", "B", "C"].map(l => (
            <button key={l} onClick={() => setLevel(l)} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, textAlign: "center",
              border: `1.5px solid ${level === l ? C.greenPrimary : C.border}`,
              background: level === l ? `${C.greenPrimary}18` : C.bgCard,
              ...font.card, fontSize: 14, color: level === l ? C.greenBright : C.text, cursor: "pointer",
            }}>NP-{l}</button>
          ))}
        </div>
      </div>

      {/* Scenario-based listening */}
      <div style={{ ...font.label, fontSize: 10, color: C.textMut, marginTop: 4 }}>Scenarios — NP-{level} ({scenariosByLevel.length} available)</div>
      {scenariosByLevel.length === 0 && (
        <div style={{ ...font.body, fontSize: 12, color: C.textSec, padding: "12px 0" }}>No scenarios at this level yet. Try another NP level or use Vocabulary Mode below.</div>
      )}
      {scenariosByLevel.map(sc => (
        <div key={sc.id} onClick={() => startScenario(sc)} style={{
          background: C.bgCard, borderRadius: 12, padding: "14px 16px",
          border: `1px solid ${C.border}`, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: `${C.tanLight}15`, border: `2px solid ${C.tanLight}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 20 }}>{typeIcons[sc.type] || "🎧"}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...font.card, fontSize: 14, color: C.text }}>{sc.title}</div>
            <div style={{ ...font.body, fontSize: 11, color: C.textSec, marginTop: 2 }}>
              {typeLabels[sc.type] || sc.type} · {sc.questions.length} questions · {sc.topic}
            </div>
          </div>
          <span style={{ ...font.h, fontSize: 16, color: C.textMut }}>›</span>
        </div>
      ))}

      {/* All scenarios button */}
      {scenariosByLevel.length < allScenarios.length && (
        <>
          <div style={{ ...font.label, fontSize: 10, color: C.textMut, marginTop: 8 }}>All Levels ({allScenarios.length} total)</div>
          {allScenarios.filter(s => s.level !== `NP-${level}`).map(sc => (
            <div key={sc.id} onClick={() => startScenario(sc)} style={{
              background: C.bgCard, borderRadius: 12, padding: "14px 16px",
              border: `1px solid ${C.border}`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 14, opacity: 0.7,
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: `${C.textMut}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 20 }}>{typeIcons[sc.type] || "🎧"}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...font.card, fontSize: 14, color: C.text }}>{sc.title}</div>
                <div style={{ ...font.body, fontSize: 11, color: C.textSec, marginTop: 2 }}>
                  {sc.level} · {typeLabels[sc.type] || sc.type} · {sc.questions.length} Q
                </div>
              </div>
              <span style={{ ...font.h, fontSize: 16, color: C.textMut }}>›</span>
            </div>
          ))}
        </>
      )}

      {/* Vocab quick mode */}
      <div style={{ ...font.label, fontSize: 10, color: C.textMut, marginTop: 12 }}>Quick Practice</div>
      <div onClick={startVocab} style={{
        background: `${C.gold}12`, borderRadius: 12, padding: "16px 18px",
        border: `1px solid ${C.gold}35`, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: `${C.gold}15`, border: `2px solid ${C.gold}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 20 }}>⚡</span>
        </div>
        <div>
          <div style={{ ...font.card, fontSize: 14, color: C.text }}>Vocabulary Listening</div>
          <div style={{ ...font.body, fontSize: 11, color: C.textSec, marginTop: 2 }}>10 random synonym & verb questions · NP-{level}</div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════ READING COMPREHENSION ════════════════════ */
const Reading = ({ go, ttsOn }) => {
  const [phase, setPhase] = useState("list");
  const [passage, setPassage] = useState(null);
  const [qi, setQi] = useState(0);
  const [sel, setSel] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);

  const startPassage = (p) => {
    setPassage(p);
    setShowTranslation(false);
    setQi(0); setSel(null); setAnswered(false); setScore(0);
    setPhase("read");
  };

  const pick = (i) => {
    if (answered) return;
    setSel(i);
    setAnswered(true);
    if (i === passage.questions[qi].correct) setScore(s => s + 1);
  };

  const next = () => {
    if (qi + 1 >= passage.questions.length) {
      recordActivity("reading");
      setPhase("results");
      return;
    }
    setQi(i => i + 1); setSel(null); setAnswered(false);
  };

  if (phase === "results") {
    const pct = Math.round((score / passage.questions.length) * 100);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18, textAlign: "center" }}>
        <div style={{ padding: "24px 0 8px" }}>
          <div style={{ fontSize: 40 }}>{pct >= 70 ? "📖" : "📋"}</div>
          <div style={{ ...font.h, fontSize: 44, color: pct >= 70 ? C.gold : C.alertRed, marginTop: 8 }}>{pct}%</div>
          <div style={{ ...font.card, fontSize: 15, color: C.text, marginTop: 4 }}>{score} / {passage.questions.length} Correct</div>
          <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 6 }}>{passage.title}</div>
        </div>
        <button onClick={() => setPhase("list")} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer" }}>More Passages</button>
        <button onClick={() => go("home")} style={{ padding: 12, borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", ...font.card, fontSize: 13, color: C.textSec, cursor: "pointer" }}>Back to Home</button>
      </div>
    );
  }

  if (phase === "read" || phase === "questions") {
    const q = passage.questions[qi];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => setPhase(phase === "read" ? "list" : "read")} style={{ background: "none", border: "none", cursor: "pointer", ...font.body, fontSize: 12, color: C.textSec }}>← {phase === "read" ? "Back" : "Re-read"}</button>
          <div style={{ display: "flex", gap: 5 }}>
            <Chip active color={C.tan}>{passage.level}</Chip>
            <Chip color={C.textSec}>{passage.topic}</Chip>
          </div>
        </div>

        {/* Passage text */}
        {(phase === "read" || !answered) && (
          <div style={{ background: C.bgCard, borderRadius: 14, padding: "18px 16px", border: `1px solid ${C.border}`, maxHeight: phase === "questions" ? 150 : "none", overflowY: phase === "questions" ? "auto" : "visible" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ ...font.card, fontSize: 14, color: C.text }}>{passage.title}</div>
              <SpeakBtn text={passage.text} ttsOn={ttsOn} size={26} />
            </div>
            <div style={{ ...font.body, fontSize: 13, color: C.text, lineHeight: 1.7, whiteSpace: "pre-line" }}>{passage.text}</div>

            {/* Translation toggle */}
            {passage.textEn && (
              <>
                <button onClick={() => setShowTranslation(!showTranslation)} style={{
                  marginTop: 12, padding: "8px 14px", borderRadius: 8,
                  border: `1px solid ${showTranslation ? C.tanLight : C.border}`,
                  background: showTranslation ? `${C.tanLight}15` : "transparent",
                  ...font.label, fontSize: 11, color: showTranslation ? C.tanLight : C.textSec,
                  cursor: "pointer", width: "100%", textAlign: "center",
                }}>
                  {showTranslation ? "🇫🇷 Hide Translation" : "🇬🇧 Show English Translation"}
                </button>
                {showTranslation && (
                  <div style={{ marginTop: 10, padding: "14px 16px", background: `${C.tanLight}08`, borderRadius: 10, border: `1px solid ${C.tanLight}20` }}>
                    <div style={{ ...font.label, fontSize: 9, color: C.tanLight, marginBottom: 6 }}>English Translation</div>
                    <div style={{ ...font.body, fontSize: 13, color: C.textSec, lineHeight: 1.7, whiteSpace: "pre-line" }}>{passage.textEn}</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {phase === "read" && (
          <button onClick={() => setPhase("questions")} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer" }}>
            Start Questions ({passage.questions.length})
          </button>
        )}

        {phase === "questions" && (
          <>
            <div style={{ ...font.label, fontSize: 10, color: C.textMut }}>Question {qi + 1} of {passage.questions.length}</div>
            <div style={{ ...font.card, fontSize: 14, color: C.text }}>{q.stem}</div>

            {q.options.map((o, i) => {
              const isCorr = i === q.correct;
              const isSel = i === sel;
              let bc = C.border, bg = C.bgCard;
              if (answered && isCorr) { bc = C.greenBright; bg = `${C.greenBright}12`; }
              if (answered && isSel && !isCorr) { bc = C.alertRed; bg = `${C.alertRed}12`; }
              if (!answered && isSel) { bc = C.greenPrimary; bg = `${C.greenPrimary}12`; }
              return (
                <button key={i} onClick={() => pick(i)} style={{ background: bg, borderRadius: 10, padding: "12px 14px", border: `1.5px solid ${bc}`, cursor: answered ? "default" : "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, border: `1.5px solid ${isSel ? bc : C.textMut}33`, display: "flex", alignItems: "center", justifyContent: "center", ...font.label, fontSize: 10, color: isSel ? bc : C.textMut, flexShrink: 0 }}>
                    {answered && isCorr ? "✓" : answered && isSel && !isCorr ? "✗" : String.fromCharCode(65 + i)}
                  </div>
                  <span style={{ ...font.body, fontSize: 13, color: C.text }}>{o}</span>
                </button>
              );
            })}

            {answered && (
              <div style={{ background: C.bgElevated, borderRadius: 12, padding: 16, border: `1px solid ${sel === q.correct ? C.greenBright : C.alertRed}30` }}>
                {/* Result header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 18 }}>{sel === q.correct ? "✅" : "❌"}</span>
                  <span style={{ ...font.card, fontSize: 14, color: sel === q.correct ? C.greenBright : C.alertRed }}>
                    {sel === q.correct ? "Correct!" : "Incorrect"}
                  </span>
                </div>

                {/* If wrong, show the correct answer */}
                {sel !== q.correct && (
                  <div style={{ background: `${C.greenBright}10`, borderRadius: 8, padding: "10px 12px", marginBottom: 10, border: `1px solid ${C.greenBright}25` }}>
                    <div style={{ ...font.label, fontSize: 9, color: C.greenBright, marginBottom: 4 }}>Correct Answer</div>
                    <div style={{ ...font.card, fontSize: 13, color: C.text }}>{q.options[q.correct]}</div>
                  </div>
                )}

                {/* Explanation from passage */}
                {q.explanation && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ ...font.label, fontSize: 9, color: C.tanLight, marginBottom: 4 }}>From the passage</div>
                    <div style={{ ...font.body, fontSize: 13, color: C.text, fontStyle: "italic", lineHeight: 1.5 }}>{q.explanation}</div>
                  </div>
                )}

                {/* Translation of the question */}
                {q.stemEn && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                    <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 4 }}>Question Translation</div>
                    <div style={{ ...font.body, fontSize: 12, color: C.textSec }}>{q.stemEn}</div>
                  </div>
                )}

                {/* Tap to re-read passage hint */}
                <button onClick={() => setPhase("read")} style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", ...font.body, fontSize: 11, color: C.textSec, cursor: "pointer", width: "100%" }}>
                  📖 Re-read the passage
                </button>
              </div>
            )}

            {answered && (
              <button onClick={next} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer" }}>
                {qi + 1 >= passage.questions.length ? "See Results" : "Next Question"}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  // LIST
  const levelColor = { "NP-A": C.greenBright, "NP-B": C.tan, "NP-C": C.gold };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Reading Comprehension</div>
      <div style={{ ...font.body, fontSize: 12, color: C.textSec }}>
        Read CAF-relevant texts and answer comprehension questions. {readingData.passages.length} passages available.
      </div>

      {readingData.passages.map(p => (
        <div key={p.id} onClick={() => startPassage(p)} style={{
          background: C.bgCard, borderRadius: 12, padding: "16px 18px",
          border: `1px solid ${C.border}`, cursor: "pointer",
        }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
            <Chip active color={levelColor[p.level] || C.textSec}>{p.level}</Chip>
            <Chip color={C.textSec}>{p.topic}</Chip>
            <Chip color={C.textSec}>{p.questions.length}Q</Chip>
          </div>
          <div style={{ ...font.card, fontSize: 14, color: C.text }}>{p.title}</div>
          <div style={{ ...font.body, fontSize: 11, color: C.textMut, marginTop: 4 }}>{p.text.slice(0, 80)}...</div>
        </div>
      ))}
    </div>
  );
};

/* ════════════════════ WRITING PROMPTS ════════════════════ */
const Writing = ({ go }) => {
  const [phase, setPhase] = useState("list");
  const [prompt, setPrompt] = useState(null);
  const [text, setText] = useState("");
  const [showExample, setShowExample] = useState(false);
  const [checked, setChecked] = useState([]);

  const startPrompt = (p) => {
    setPrompt(p);
    setText("");
    setShowExample(false);
    setChecked([]);
    setPhase("write");
  };

  const toggleCheck = (idx) => {
    setChecked(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  };

  const finish = () => {
    recordActivity("writing");
    setPhase("review");
  };

  if (phase === "review") {
    const pct = prompt.checklist.length > 0 ? Math.round((checked.length / prompt.checklist.length) * 100) : 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ textAlign: "center", padding: "18px 0" }}>
          <div style={{ fontSize: 36 }}>{pct >= 80 ? "✍️" : "📝"}</div>
          <div style={{ ...font.h, fontSize: 36, color: pct >= 80 ? C.gold : C.tan, marginTop: 8 }}>{pct}%</div>
          <div style={{ ...font.body, fontSize: 12, color: C.textSec, marginTop: 4 }}>Self-Assessment · {checked.length}/{prompt.checklist.length} criteria met</div>
        </div>

        <div style={{ background: C.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
          <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Your Writing</div>
          <div style={{ ...font.body, fontSize: 13, color: C.text, whiteSpace: "pre-line", lineHeight: 1.6 }}>{text || "(empty)"}</div>
        </div>

        <button onClick={() => setPhase("list")} style={{ padding: 14, borderRadius: 12, border: "none", background: C.greenPrimary, ...font.card, fontSize: 14, color: C.text, cursor: "pointer" }}>More Prompts</button>
        <button onClick={() => go("home")} style={{ padding: 12, borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", ...font.card, fontSize: 13, color: C.textSec, cursor: "pointer" }}>Back to Home</button>
      </div>
    );
  }

  if (phase === "write") {
    const levelColor = { "NP-A": C.greenBright, "NP-B": C.tan, "NP-C": C.gold };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => setPhase("list")} style={{ background: "none", border: "none", cursor: "pointer", ...font.body, fontSize: 12, color: C.textSec }}>← Back</button>
          <div style={{ display: "flex", gap: 5 }}>
            <Chip active color={levelColor[prompt.level] || C.textSec}>{prompt.level}</Chip>
            <Chip color={C.textSec}>{prompt.topic}</Chip>
          </div>
        </div>

        {/* Prompt */}
        <div style={{ background: C.bgCard, borderRadius: 14, padding: "16px 18px", border: `1px solid ${C.border}` }}>
          <div style={{ ...font.card, fontSize: 14, color: C.text, lineHeight: 1.6 }}>{prompt.prompt}</div>
        </div>

        {/* Hints */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {prompt.hints.map((h, i) => (
            <span key={i} style={{ ...font.body, fontSize: 11, color: C.tan, background: `${C.tan}12`, padding: "4px 10px", borderRadius: 8 }}>💡 {h}</span>
          ))}
        </div>

        {/* Writing area */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Écrivez votre réponse ici..."
          style={{
            width: "100%", minHeight: 180, padding: "14px 16px", borderRadius: 12,
            border: `1.5px solid ${C.border}`, background: C.bgCard, color: C.text,
            ...font.body, fontSize: 14, lineHeight: 1.6, outline: "none", resize: "vertical",
          }}
        />

        <div style={{ ...font.body, fontSize: 11, color: C.textMut, textAlign: "right" }}>
          {text.split(/\s+/).filter(Boolean).length} words
        </div>

        {/* Self-assessment checklist */}
        <div>
          <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Self-Assessment Checklist</div>
          {prompt.checklist.map((item, i) => (
            <div key={i} onClick={() => toggleCheck(i)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              background: C.bgCard, borderRadius: 8, marginBottom: 4,
              border: `1px solid ${checked.includes(i) ? C.greenBright + "44" : C.border}`,
              cursor: "pointer",
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4,
                border: `1.5px solid ${checked.includes(i) ? C.greenBright : C.textMut}`,
                background: checked.includes(i) ? `${C.greenBright}22` : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                ...font.label, fontSize: 10, color: C.greenBright,
              }}>{checked.includes(i) ? "✓" : ""}</div>
              <span style={{ ...font.body, fontSize: 12, color: C.text }}>{item}</span>
            </div>
          ))}
        </div>

        {/* Show example toggle */}
        <button onClick={() => setShowExample(!showExample)} style={{
          padding: 12, borderRadius: 10, border: `1.5px solid ${C.border}`,
          background: "transparent", ...font.card, fontSize: 13, color: C.tan, cursor: "pointer",
        }}>{showExample ? "Hide Example" : "Show Example Answer"}</button>

        {showExample && prompt.example && (
          <div style={{ background: C.bgElevated, borderRadius: 12, padding: 16, border: `1px solid ${C.tan}25` }}>
            <div style={{ ...font.label, fontSize: 9, color: C.tan, marginBottom: 8 }}>Example</div>
            <div style={{ ...font.body, fontSize: 12, color: C.text, whiteSpace: "pre-line", lineHeight: 1.6 }}>{prompt.example}</div>
          </div>
        )}

        <button onClick={finish} disabled={!text.trim()} style={{
          padding: 16, borderRadius: 12, border: "none",
          background: text.trim() ? C.greenPrimary : C.bgElevated,
          ...font.card, fontSize: 15, color: text.trim() ? C.text : C.textMut,
          cursor: text.trim() ? "pointer" : "default",
        }}>Complete & Review</button>
      </div>
    );
  }

  // LIST
  const levelColor = { "NP-A": C.greenBright, "NP-B": C.tan, "NP-C": C.gold };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Writing Practice</div>
      <div style={{ ...font.body, fontSize: 12, color: C.textSec }}>
        Practice writing in French with CAF-relevant scenarios. Self-assess with checklists and compare with examples.
      </div>

      {writingData.prompts.map(p => (
        <div key={p.id} onClick={() => startPrompt(p)} style={{
          background: C.bgCard, borderRadius: 12, padding: "16px 18px",
          border: `1px solid ${C.border}`, cursor: "pointer",
        }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
            <Chip active color={levelColor[p.level] || C.textSec}>{p.level}</Chip>
            <Chip color={C.textSec}>{p.topic}</Chip>
          </div>
          <div style={{ ...font.body, fontSize: 13, color: C.text }}>{p.prompt.slice(0, 80)}...</div>
        </div>
      ))}
    </div>
  );
};

/* ════════════════════ SETTINGS ════════════════════ */
const Settings = ({ srs, setSrs, grammarSrs, setGrammarSrs, theme, setTheme, ttsOn, toggleTTS }) => {
  const stats = useStats(srs);
  const [confirmReset, setConfirmReset] = useState(false);

  const resetProgress = () => {
    setSrs({});
    saveSRS({});
    setGrammarSrs({});
    saveGrammarSRS({});
    localStorage.removeItem(STREAK_KEY);
    setConfirmReset(false);
  };

  const exportData = () => {
    const data = {
      srs: loadSRS(),
      grammarSrs: loadGrammarSRS(),
      streak: loadStreak(),
      exportDate: new Date().toISOString(),
      version: 1,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `petite-autobus-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.srs) { saveSRS(data.srs); setSrs(data.srs); }
          if (data.grammarSrs) { saveGrammarSRS(data.grammarSrs); setGrammarSrs(data.grammarSrs); }
          if (data.streak) { saveStreak(data.streak); }
          alert("Progress imported successfully!");
        } catch { alert("Invalid backup file."); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...font.h, fontSize: 18, color: C.text }}>Settings</div>

      {/* Theme toggle */}
      <div>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Theme</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[{ k: "dark", l: "Dark" }, { k: "light", l: "Light" }].map(t => (
            <button key={t.k} onClick={() => setTheme(t.k)} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, textAlign: "center",
              border: `1.5px solid ${theme === t.k ? C.greenPrimary : C.border}`,
              background: theme === t.k ? `${C.greenPrimary}18` : C.bgCard,
              ...font.card, fontSize: 13, color: theme === t.k ? C.greenBright : C.text, cursor: "pointer",
            }}>{t.l}</button>
          ))}
        </div>
      </div>

      {/* Text-to-Speech toggle */}
      <div>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Text-to-Speech</div>
        <div onClick={toggleTTS} style={{
          background: C.bgCard, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
        }}>
          <div>
            <div style={{ ...font.body, fontSize: 13, color: C.text }}>French Audio</div>
            <div style={{ ...font.body, fontSize: 11, color: C.textSec, marginTop: 2 }}>Hear French words and sentences</div>
          </div>
          <div style={{
            width: 44, height: 24, borderRadius: 12, padding: 2,
            background: ttsOn ? C.greenPrimary : C.bgElevated,
            border: `1px solid ${ttsOn ? C.greenBright + "40" : C.border}`,
            transition: "background 0.2s",
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 9, background: "#fff",
              transform: ttsOn ? "translateX(20px)" : "translateX(0)",
              transition: "transform 0.2s",
            }} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Data</div>
        <div style={{ background: C.bgCard, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ ...font.body, fontSize: 13, color: C.text }}>Synonym Entries</span>
            <span style={{ ...font.card, fontSize: 13, color: C.greenBright }}>{stats.total}</span>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ ...font.body, fontSize: 13, color: C.text }}>Grammar Questions</span>
            <span style={{ ...font.card, fontSize: 13, color: C.tan }}>{grammarData.questions.length}</span>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ ...font.body, fontSize: 13, color: C.text }}>Verbs</span>
            <span style={{ ...font.card, fontSize: 13, color: C.gold }}>{verbsData.verbs.length}</span>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ ...font.body, fontSize: 13, color: C.text }}>Mastered</span>
            <span style={{ ...font.card, fontSize: 13, color: C.greenBright }}>{stats.mastered}</span>
          </div>
        </div>
      </div>

      {/* Export / Import */}
      <div>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Backup & Restore</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportData} style={{ flex: 1, padding: 14, borderRadius: 12, border: `1.5px solid ${C.greenPrimary}`, background: "transparent", ...font.card, fontSize: 13, color: C.greenBright, cursor: "pointer" }}>Export Progress</button>
          <button onClick={importData} style={{ flex: 1, padding: 14, borderRadius: 12, border: `1.5px solid ${C.border}`, background: "transparent", ...font.card, fontSize: 13, color: C.textSec, cursor: "pointer" }}>Import Backup</button>
        </div>
      </div>

      <div>
        <div style={{ ...font.label, fontSize: 9, color: C.textMut, marginBottom: 8 }}>Danger Zone</div>
        <div style={{ background: C.bgCard, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div onClick={() => setConfirmReset(true)} style={{ padding: "14px 16px", cursor: "pointer" }}>
            <span style={{ ...font.body, fontSize: 13, color: C.alertRed }}>Reset All Progress</span>
          </div>
        </div>
      </div>

      {confirmReset && (
        <div style={{ background: `${C.alertRed}15`, borderRadius: 12, padding: 18, border: `1px solid ${C.alertRed}35`, textAlign: "center" }}>
          <div style={{ ...font.card, fontSize: 14, color: C.text, marginBottom: 12 }}>Reset all progress? This cannot be undone.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmReset(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", ...font.card, fontSize: 13, color: C.textSec, cursor: "pointer" }}>Cancel</button>
            <button onClick={resetProgress} style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", background: C.alertRed, ...font.card, fontSize: 13, color: "#fff", cursor: "pointer" }}>Reset</button>
          </div>
        </div>
      )}

      <div style={{ ...font.body, fontSize: 10, color: C.textMut, textAlign: "center", marginTop: 8 }}>
        petite autobus v1.0 · Lexique FP 2024
      </div>
    </div>
  );
};

/* ════════════════════ APP SHELL ════════════════════ */
export default function App() {
  const [screen, setScreen] = useState("home");
  const [tab, setTab] = useState("home");
  const [srs, setSrs] = useState(loadSRS);
  const [streak, setStreak] = useState(loadStreak);
  const [grammarSrs, setGrammarSrs] = useState(loadGrammarSRS);
  const [theme, setThemeState] = useState(loadTheme);
  const [ttsOn, setTtsOn] = useState(loadTTS);

  const toggleTTS = () => {
    const next = !ttsOn;
    localStorage.setItem(TTS_KEY, next ? "on" : "off");
    setTtsOn(next);
    if (!next) window.speechSynthesis?.cancel();
  };

  // Preload voices on mount
  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);
  const [screenParams, setScreenParams] = useState(null);
  const scrollRef = useRef(null);

  const setTheme = (t) => {
    localStorage.setItem(THEME_KEY, t);
    C = themes[t];
    setThemeState(t);
  };

  // Update streak on mount
  useEffect(() => {
    const t = today();
    setStreak(prev => {
      let updated;
      if (prev.lastDate === t) {
        updated = prev;
      } else if (prev.lastDate === new Date(Date.now() - 86400000).toISOString().slice(0, 10)) {
        updated = { count: prev.count + 1, lastDate: t, sessionsToday: 0 };
      } else if (!prev.lastDate) {
        updated = { count: 1, lastDate: t, sessionsToday: 0 };
      } else {
        updated = { count: 1, lastDate: t, sessionsToday: 0 };
      }
      saveStreak(updated);
      return updated;
    });
  }, []);

  const go = (s, params = null) => {
    setScreen(s);
    setScreenParams(params);
    if (!["flashcard", "quiz", "grammar", "verbs", "conjdrill", "grammarquiz", "examsim", "weakareas", "dailyplan", "listening", "reading", "writing"].includes(s)) setTab(s);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const renderScreen = () => {
    switch (screen) {
      case "home": return <Home go={go} srs={srs} streak={streak} />;
      case "study": return <Study go={go} srs={srs} />;
      case "flashcard": return <Flashcard go={go} srs={srs} setSrs={setSrs} params={screenParams} ttsOn={ttsOn} />;
      case "quiz": return <Quiz go={go} srs={srs} ttsOn={ttsOn} />;
      case "decks": return <Decks go={go} srs={srs} />;
      case "progress": return <Progress srs={srs} streak={streak} />;
      case "grammar": return <Grammar srs={srs} ttsOn={ttsOn} />;
      case "verbs": return <Verbs go={go} ttsOn={ttsOn} />;
      case "conjdrill": return <ConjDrill go={go} ttsOn={ttsOn} />;
      case "grammarquiz": return <GrammarQuiz go={go} params={screenParams} grammarSrs={grammarSrs} setGrammarSrs={setGrammarSrs} ttsOn={ttsOn} />;
      case "examsim": return <ExamSim go={go} srs={srs} grammarSrs={grammarSrs} setGrammarSrs={setGrammarSrs} ttsOn={ttsOn} />;
      case "weakareas": return <WeakAreas go={go} srs={srs} grammarSrs={grammarSrs} />;
      case "dailyplan": return <DailyPlan go={go} />;
      case "listening": return <Listening go={go} ttsOn={ttsOn} />;
      case "reading": return <Reading go={go} ttsOn={ttsOn} />;
      case "writing": return <Writing go={go} />;
      case "settings": return <Settings srs={srs} setSrs={setSrs} grammarSrs={grammarSrs} setGrammarSrs={setGrammarSrs} theme={theme} setTheme={setTheme} ttsOn={ttsOn} toggleTTS={toggleTTS} />;
      default: return <Home go={go} srs={srs} streak={streak} />;
    }
  };

  const navItems = [
    { k: "home", l: "Home", icon: "🏠" },
    { k: "study", l: "Study", icon: "📖" },
    { k: "decks", l: "Decks", icon: "📇" },
    { k: "progress", l: "Progress", icon: "📊" },
    { k: "settings", l: "Settings", icon: "⚙️" },
  ];

  return (
    <div style={{ width: "100%", maxWidth: 420, margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column", background: C.bgBase, color: C.text, ...font.body, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700;800&family=Barlow+Semi+Condensed:wght@500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "10px 18px 12px", background: C.bgBase, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div onClick={() => go("home")} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <img src={heroImg} alt="Petite Autobus" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
            <div>
              <div style={{ ...font.h, fontSize: 15, color: C.text, lineHeight: 1 }}>petite autobus</div>
              <div style={{ ...font.body, fontSize: 9, color: C.textMut }}>CAF French Proficiency</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={toggleTTS} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 16, opacity: ttsOn ? 1 : 0.35 }} title={ttsOn ? "TTS On" : "TTS Off"}>
              {ttsOn ? "🔊" : "🔇"}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 13 }}>🔥</span>
              <span style={{ ...font.label, fontSize: 10, color: C.gold }}>{streak.count}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 18px 18px" }}>
        {renderScreen()}
      </div>

      {/* Bottom Nav */}
      <div style={{ display: "flex", background: C.bgCard, borderTop: `1px solid ${C.border}`, padding: "6px 4px 10px", flexShrink: 0 }}>
        {navItems.map(n => (
          <button key={n.k} onClick={() => { setTab(n.k); go(n.k); }} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            padding: "4px 0", background: "none", border: "none", cursor: "pointer", position: "relative",
          }}>
            {tab === n.k && <div style={{ position: "absolute", top: -6, width: 20, height: 2, borderRadius: 1, background: C.greenBright }} />}
            <span style={{ fontSize: 16, filter: tab === n.k ? "none" : "grayscale(1) opacity(0.5)" }}>{n.icon}</span>
            <span style={{ ...font.label, fontSize: 8, color: tab === n.k ? C.greenBright : C.textMut }}>{n.l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
