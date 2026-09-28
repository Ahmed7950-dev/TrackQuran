import React, { useState, useEffect, useCallback, useRef } from 'react';
import lottie from 'lottie-web';
import { useI18n } from '../context/I18nProvider';
import TowerDefenseGame, { TowerDefenseRef } from './TowerDefenseGame';
import WordChallengePage from './WordChallengePage';
import LetterHuntGame from './LetterHuntGame';
import LetterFormDrill from './LetterFormDrill';
import AirplaneGame from './AirplaneGame';
import LetterRaceGame from './LetterRaceGame';
import ReadingBattleGame from './ReadingBattleGame';
import FlappyLettersGame from './FlappyLettersGame';
import OddLetterGame from './OddLetterGame';
import { LetterMatchSetup } from './LetterMatchChallenge';
import { LetterCardsSetup } from './LetterCardsGame';
import { getFormMisses, clearFormMisses, FormMisses, MatchForm } from '../services/letterMatchService';

const LottieAnim: React.FC<{ src: string; width: number; height: number; style?: React.CSSProperties }> = ({ src, width, height, style }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let anim: any;
    let cancelled = false;
    fetch(src).then(r => r.json()).then(data => {
      if (cancelled || !ref.current) return;
      anim = lottie.loadAnimation({ container: ref.current, animationData: data, renderer: 'svg', loop: true, autoplay: true });
    });
    return () => { cancelled = true; anim?.destroy(); };
  }, [src]);
  return <div ref={ref} style={{ width, height, overflow: 'hidden', ...style }} />;
};

const LETTERS = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];

const CHILD_CARD_COLORS = [
  { bg: '#fff0f5', border: '#f8bbd0', char: '#c2185b' },
  { bg: '#fff8e1', border: '#ffe082', char: '#f57f17' },
  { bg: '#e8f5e9', border: '#a5d6a7', char: '#2e7d32' },
  { bg: '#e3f2fd', border: '#90caf9', char: '#1565c0' },
  { bg: '#f3e5f5', border: '#ce93d8', char: '#6a1b9a' },
  { bg: '#e0f7fa', border: '#80deea', char: '#00695c' },
  { bg: '#fbe9e7', border: '#ffab91', char: '#bf360c' },
  { bg: '#f9fbe7', border: '#dce775', char: '#558b2f' },
];

const CHILD_PRIORITY_OUTLINES = ['', '#43a047', '#f9a825', '#e91e63'];

const PRAISE = [
  { emoji: '🌟', text: 'Amazing!' },   { emoji: '🎉', text: 'Woohoo!' },
  { emoji: '⭐', text: 'Super Star!' }, { emoji: '🏆', text: 'You nailed it!' },
  { emoji: '🦁', text: 'So brave!' },  { emoji: '🚀', text: 'Blast off!' },
  { emoji: '🌈', text: 'Brilliant!' }, { emoji: '🎊', text: 'Fantastic!' },
  { emoji: '🐝', text: 'Bee-utiful!'}, { emoji: '💫', text: 'Dazzling!' },
  { emoji: '🦋', text: 'Beautiful!' }, { emoji: '🎯', text: 'Spot on!' },
];

const CONFETTI_COLORS = ['#ff6b9d','#ffd93d','#6bcb77','#4d96ff','#ff9a3c','#c77dff','#ff595e','#6af2f0'];
const STORAGE_KEY = 'alphabet_trainer_priorities';
/** Missed-letter tallies, per student (each reader misses different letters).
 *  Only the practice challenge feeds this — adult mode and the child-mode
 *  castle battle — never the arcade games. */
const MISS_KEY = (studentId?: string) => `alphabet_trainer_misses:${studentId ?? 'default'}`;
const HARDCORE_KEY = 'alphabet_trainer_hardcore';
const readMisses = (studentId?: string): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(MISS_KEY(studentId)) ?? '{}') as Record<string, number>; }
  catch { return {}; }
};

// ─── Letter-form (positional shape) support ────────────────────────────────
type LetterForm = 'isolated' | 'initial' | 'medial' | 'final';

// These letters do NOT connect to the following letter, so they only have
// 2 distinct visual shapes: isolated ≡ initial, and final ≡ medial.
const NON_CONNECTORS = new Set(['ا', 'و', 'ر', 'ز', 'د', 'ذ']);

/**
 * Wraps a base Arabic letter with Unicode ZWJ / ZWNJ to force the correct
 * contextual glyph (isolated / initial / medial / final).
 *  ZWJ  = U+200D  → forces joining on that side
 *  ZWNJ = U+200C  → forces non-joining (used for isolated)
 */
function getLetterInForm(letter: string, form: LetterForm): string {
  switch (form) {
    case 'initial': return `${letter}‍`;
    case 'medial':  return `‍${letter}‍`;
    case 'final':   return `‍${letter}`;
    default:        return `‌${letter}‌`;  // isolated (explicit non-join)
  }
}

const FORM_CONFIG: { form: LetterForm; labelAr: string; labelEn: string }[] = [
  { form: 'isolated', labelAr: 'مُفرَد',   labelEn: 'Isolated'  },
  { form: 'initial',  labelAr: 'أَوَّل',    labelEn: 'Beginning' },
  { form: 'medial',   labelAr: 'وَسَط',     labelEn: 'Middle'    },
  { form: 'final',    labelAr: 'آخِر',      labelEn: 'End'       },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQueue(priorities: number[]): string[] {
  const q: string[] = [];
  priorities.forEach((p, i) => { for (let k = 0; k < p; k++) q.push(LETTERS[i]); });
  return shuffle(q);
}

type View = 'select' | 'practice' | 'win' | 'airplane' | 'race' | 'flappy' | 'oddletter' | 'battle' | 'wordchallenge' | 'letterhunt' | 'formdrill' | 'lettermatch' | 'lettercards';

/** Everything that can be started from this page: a challenge on the left rail,
 *  a game on the right. One is chosen at a time, and Start opens it. */
type PickId =
  | 'guess' | 'wordchallenge' | 'formdrill' | 'lettermatch'
  | 'lettercards' | 'tower' | 'airplane' | 'race' | 'battle' | 'flappy' | 'letterhunt' | 'oddletter';

interface Activity {
  id: PickId;
  name: string;
  hint: string;
  icon: string;
  /** The icon is Arabic type, not an emoji. */
  arabic?: boolean;
  tint: string;
  soft: string;
  /** False for the two that bring their own content. */
  needsLetters: boolean;
  /** Making a link or a shared board needs the tutor's account. */
  tutorOnly?: boolean;
}

const CHALLENGES: Activity[] = [
  { id: 'guess',        name: 'Guess the letter', hint: 'Name each letter as it comes', icon: '؟', arabic: true, tint: '#0d9488', soft: '#ccfbf1', needsLetters: true },
  { id: 'wordchallenge',name: 'Word challenge',   hint: 'Read a word, letter by letter', icon: '✦',              tint: '#7c3aed', soft: '#ede9fe', needsLetters: true },
  { id: 'formdrill',    name: 'Letter form drill',hint: 'Beginning, middle, end',        icon: 'ـبـ', arabic: true, tint: '#0284c7', soft: '#e0f2fe', needsLetters: true },
  { id: 'lettermatch',  name: 'Letter shapes match', hint: 'Match a letter to its shape', icon: '⇄',             tint: '#4f46e5', soft: '#e0e7ff', needsLetters: true, tutorOnly: true },
];

const GAMES: Activity[] = [
  { id: 'lettercards', name: 'Letter cards',      hint: 'Throw a card, match its pair',  icon: '🃏', tint: '#d97706', soft: '#fef3c7', needsLetters: true, tutorOnly: true },
  { id: 'tower',       name: 'Castle battle',     hint: 'Send soldiers to win',          icon: '🏰', tint: '#6366f1', soft: '#e0e7ff', needsLetters: true },
  { id: 'airplane',    name: 'Letter flight',     hint: 'Fly to the right letter',       icon: '✈️', tint: '#0891b2', soft: '#cffafe', needsLetters: true },
  { id: 'race',        name: 'Letter race',       hint: 'Run to the letter you hear',    icon: '🏃', tint: '#0f766e', soft: '#ccfbf1', needsLetters: true },
  { id: 'battle',      name: 'Reading battle',    hint: 'Read the verse and fight',      icon: '⚔️', tint: '#b91c1c', soft: '#fee2e2', needsLetters: false },
  { id: 'flappy',      name: 'Flappy letters',    hint: 'Flap through the right gap',    icon: '🐦', tint: '#ca8a04', soft: '#fef9c3', needsLetters: true },
  { id: 'letterhunt',  name: 'Letter hunt',       hint: 'Find the letter in the wild',   icon: '🔍', tint: '#be185d', soft: '#fce7f3', needsLetters: true },
  { id: 'oddletter',   name: 'Find the odd letter', hint: 'Spot the imposter',           icon: '👀', tint: '#059669', soft: '#d1fae5', needsLetters: false },
];

const AlphabetTrainerPage: React.FC<{
  isStudentView?: boolean;
  avatarSrc?: string;
  /** The student the tutor is working with — games played here are logged to
   *  THEM (they are the host). Absent in the student portal, which is read-only. */
  hostStudent?: { id: string; name: string };
  /** Roster for the "log to" picker, so a session started without a student
   *  open can still be attributed instead of silently going nowhere. */
  students?: Array<{ id: string; name: string }>;
  onLogActivity?: (studentId: string, a: import('../types').ActivityLog, studentName?: string) => void;
}> = ({ isStudentView = false, avatarSrc, hostStudent, students = [], onLogActivity }) => {
  const { t } = useI18n();

  const [priorities, setPriorities] = useState<number[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length === 28) return p; }
    } catch {}
    return new Array(28).fill(0);
  });

  /** The one game or challenge that Start will open. */
  const [pick, setPick] = useState<PickId>('guess');
  const chosen = [...CHALLENGES, ...GAMES].find(a => a.id === pick) ?? null;
  /** The castle battle plays the letter practice inside its arena — the rest of
   *  the practice and win screens still ask for it by this name. */
  const childMode = pick === 'tower';
  /** Hardcore: a wrong answer restarts the whole run (the old behaviour).
   *  Off by default — a mistake now just moves on and is counted. */
  const [hardcore, setHardcore] = useState<boolean>(() => {
    try { return localStorage.getItem(HARDCORE_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem(HARDCORE_KEY, hardcore ? '1' : '0'); } catch { /* private mode */ } }, [hardcore]);
  const [misses, setMisses] = useState<Record<string, number>>({});
  const [view, setView] = useState<View>('select');

  // ── Game logbook ────────────────────────────────────────────────────────────
  // Leaving a game writes "<letters> letters revised through game <name>" into
  // the host student's logbook. A 30s floor keeps an accidental open-and-close
  // out of the record, and sourceId collapses repeat rounds of the same game on
  // the same letters into one entry for the day.
  const gameStartRef = useRef(0);
  // Who this session belongs to. Defaults to the student the tutor already has
  // open; otherwise the one this device last worked with.
  const LOG_TO_KEY = 'alphabetTrainer:logTo';
  const logTarget = hostStudent
    ?? students.find(x => {
      try { return x.id === localStorage.getItem(LOG_TO_KEY); } catch { return false; }
    })
    ?? null;
  useEffect(() => {
    if (!logTarget) return;
    try { localStorage.setItem(LOG_TO_KEY, logTarget.id); } catch { /* private mode */ }
  }, [logTarget?.id]);
  useEffect(() => { setMisses(readMisses(logTarget?.id)); }, [logTarget?.id]);
  // Wrong matches from the letter-shapes challenge, per shape. Only the shape
  // selected in the table shows them (see missedFor).
  const [formMisses, setFormMisses] = useState<FormMisses>({});
  const reloadFormMisses = useCallback(() => {
    if (!logTarget?.id || isStudentView) { setFormMisses({}); return; }
    getFormMisses(logTarget.id).then(setFormMisses).catch(() => setFormMisses({}));
  }, [logTarget?.id, isStudentView]);
  useEffect(() => { reloadFormMisses(); }, [reloadFormMisses]);
  const bumpMiss = (letter: string) => {
    setMisses(prev => {
      const next = { ...prev, [letter]: (prev[letter] ?? 0) + 1 };
      try { localStorage.setItem(MISS_KEY(logTarget?.id), JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };
  useEffect(() => {
    if (view === 'airplane' || view === 'flappy' || view === 'race' || view === 'oddletter') {
      gameStartRef.current = Date.now();
    }
  }, [view]);
  /** A completed letter-practice run (the castle battle in child mode). */
  /** Rounds answered in the current run, and whether it was already logged.
   *  A wrong answer restarts the queue, so a long session can end without ever
   *  reaching the win screen — those still count as revision and must log. */
  const roundsRef = useRef(0);
  const runLoggedRef = useRef(false);
  const logPractice = (gameName: string, completed = true) => {
    if (!logTarget || !onLogActivity) return;
    if (runLoggedRef.current) return;
    const rounds = roundsRef.current;
    if (!completed && rounds < 3) return;            // a glance, not a session
    const covered = [...new Set(queue.length ? queue : selectedLetters)];
    if (covered.length === 0) return;
    runLoggedRef.current = true;
    const ls = covered.join(' ');
    // The calendar cell shows the TITLE, so it carries the count only — the
    // letters themselves stay in the detail, visible when the day is opened.
    onLogActivity(logTarget.id, {
      kind: 'game',
      title: `${covered.length} letter${covered.length === 1 ? '' : 's'} revised through game ${gameName}`,
      detail: `${ls} · ${rounds} round${rounds === 1 ? '' : 's'}`
        + (completed ? '' : ' · not finished'),
      sourceId: `${gameName}:${ls}`,
    }, logTarget.name);
  };

  const finishGame = (gameName: string, letters?: string[]) => {
    const playedMs = gameStartRef.current ? Date.now() - gameStartRef.current : 0;
    if (logTarget && onLogActivity && playedMs >= 30_000) {
      const ls = (letters ?? []).join(' ');
      const n = (letters ?? []).length;
      const played = playedMs >= 60_000 ? `${Math.round(playedMs / 60_000)} min` : `${Math.round(playedMs / 1000)}s`;
      onLogActivity(logTarget.id, {
        kind: 'game',
        title: n
          ? `${n} letter${n === 1 ? '' : 's'} revised through game ${gameName}`
          : `Letters revised through game ${gameName}`,
        detail: ls ? `${ls} · ${played}` : played,
        sourceId: `${gameName}:${ls}`,
      }, logTarget.name);
    }
    setView('select');
  };
  const [queue, setQueue] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [restartMsg, setRestartMsg] = useState('');
  const [celebrating, setCelebrating] = useState(false);
  const [popup, setPopup] = useState<{ emoji: string; text: string; phase: 'hidden' | 'in' | 'out' }>({
    emoji: '🌟', text: 'Amazing!', phase: 'hidden',
  });
  const [shaking, setShaking] = useState(false);
  const [letterForm, setLetterForm] = useState<LetterForm>('isolated');
  /** Misses shown on a letter: the practice tally, plus the shape challenge's
   *  wrong matches for the shape currently selected in the table. */
  const missedFor = (letter: string): number =>
    (misses[letter] ?? 0)
    + (letterForm !== 'isolated' ? formMisses[letterForm as MatchForm]?.[letter] ?? 0 : 0);
  const gameRef            = useRef<TowerDefenseRef>(null);
  const consecutiveCorrect = useRef(0);  // streak counter — Bilal spawns on every 3rd in a row

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(priorities));
  }, [priorities]);

  // Enemy soldiers: in the student portal they spawn automatically at random
  // intervals; on the tutor side they're sent via the hidden "R" shortcut.
  useEffect(() => {
    if (!childMode || view !== 'practice') return;
    if (isStudentView) {
      let timer: ReturnType<typeof setTimeout>;
      const schedule = () => {
        timer = setTimeout(() => { gameRef.current?.spawnEnemySoldier(); schedule(); }, 4000 + Math.random() * 5000);
      };
      schedule();
      return () => clearTimeout(timer);
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        gameRef.current?.spawnEnemySoldier();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [childMode, view, isStudentView]);

  useEffect(() => {
    const id = 'at-styles';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      @keyframes at-card-in  { from{opacity:0;transform:scale(.88) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
      @keyframes at-card-kid { from{opacity:0;transform:scale(.6) rotate(-6deg)} to{opacity:1;transform:scale(1) rotate(0)} }
      @keyframes at-shake    { 0%,100%{transform:translateX(0)} 18%{transform:translateX(-11px) rotate(-2deg)} 36%{transform:translateX(11px) rotate(2deg)} 54%{transform:translateX(-8px) rotate(-1deg)} 72%{transform:translateX(8px) rotate(1deg)} }
      @keyframes at-pop-in   { from{transform:translate(-50%,-50%) scale(0);opacity:0} to{transform:translate(-50%,-50%) scale(1);opacity:1} }
      @keyframes at-pop-out  { from{transform:translate(-50%,-50%) scale(1);opacity:1} to{transform:translate(-50%,-50%) scale(.6);opacity:0} }
      @keyframes at-confetti { 0%{transform:translateY(0) rotate(0deg);opacity:1} 85%{opacity:1} 100%{transform:translateY(105vh) rotate(760deg);opacity:0} }
      @keyframes at-bounce   { from{transform:scale(0) rotate(-15deg)} to{transform:scale(1) rotate(0)} }
      .at-card-in  { animation: at-card-in  .35s cubic-bezier(.4,0,.2,1) both; }
      .at-card-kid { animation: at-card-kid .4s  cubic-bezier(.34,1.56,.64,1) both; }
      .at-shake    { animation: at-shake .45s ease; }
      .at-pop-in   { animation: at-pop-in  .5s  cubic-bezier(.34,1.56,.64,1) forwards; }
      .at-pop-out  { animation: at-pop-out .28s ease forwards; }
      .at-bounce   { animation: at-bounce  .7s  cubic-bezier(.34,1.56,.64,1) .25s both; }
    `;
    document.head.appendChild(s);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  const launchConfetti = useCallback((count: number) => {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        const dur = 1.5 + Math.random() * 1.8;
        Object.assign(el.style, {
          position: 'fixed', top: '-20px', zIndex: '9999', pointerEvents: 'none',
          left: (Math.random() * 100) + 'vw',
          background: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          width: (7 + Math.random() * 10) + 'px',
          height: (7 + Math.random() * 10) + 'px',
          animationName: 'at-confetti',
          animationDuration: dur + 's',
          animationTimingFunction: 'linear',
          animationFillMode: 'forwards',
        });
        document.body.appendChild(el);
        setTimeout(() => el.remove(), dur * 1000 + 200);
      }, i * 20);
    }
  }, []);

  const celebrate = useCallback((onDone: () => void) => {
    const p = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    setPopup({ emoji: p.emoji, text: p.text, phase: 'in' });
    launchConfetti(55);
    setTimeout(() => {
      setPopup(prev => ({ ...prev, phase: 'out' }));
      setTimeout(() => {
        setPopup(prev => ({ ...prev, phase: 'hidden' }));
        onDone();
      }, 300);
    }, 1100);
  }, [launchConfetti]);

  const unique = priorities.filter(p => p > 0).length;
  const total  = priorities.reduce((a, b) => a + b, 0);

  // Miss heat: 1 miss = faintest red … 5+ = deepest. Semi-transparent so it
  // composites over the card in both light and dark themes.
  const MISS_ALPHA = [0, 0.16, 0.30, 0.44, 0.58, 0.72];
  const missStyle = (n: number) => {
    if (n <= 0) return null;
    const g = Math.min(5, n);                       // beyond 5 stays at grade 5
    return {
      alpha: MISS_ALPHA[g],
      border: `rgba(185, 28, 28, ${0.45 + g * 0.1})`,
      ink: g >= 3 ? '#ffffff' : undefined,          // keep the glyph readable
    };
  };

  /** Long-press a letter to wipe its miss counter (and its red background). */
  const pressTimer = useRef<number | null>(null);
  const longFired  = useRef(false);
  const clearMiss = (letter: string) => {
    if (letterForm !== 'isolated' && logTarget?.id && formMisses[letterForm as MatchForm]?.[letter]) {
      const form = letterForm as MatchForm;
      setFormMisses(prev => { const f = { ...(prev[form] ?? {}) }; delete f[letter]; return { ...prev, [form]: f }; });
      clearFormMisses(logTarget.id, form, letter);
    }
    setMisses(prev => {
      const next = { ...prev };
      delete next[letter];
      try { localStorage.setItem(MISS_KEY(logTarget?.id), JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };
  const startPress = (letter: string) => {
    longFired.current = false;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longFired.current = true;
      clearMiss(letter);
      try { navigator.vibrate?.(30); } catch { /* unsupported */ }
    }, 600);
  };
  const endPress = () => {
    if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  };
  useEffect(() => () => { if (pressTimer.current) window.clearTimeout(pressTimer.current); }, []);

  const handleLetterClick = (i: number) => {
    // A long press already did its job — don't also cycle the priority.
    if (longFired.current) { longFired.current = false; return; }
    setPriorities(prev => { const n = [...prev]; n[i] = (n[i] + 1) % 4; return n; });
  };

  const handleStart = () => {
    if (!chosen) return;
    // Two of them bring their own content and need no letters chosen.
    if (chosen.needsLetters && unique === 0) return;
    // Everything except the two letter runs is a view of its own.
    if (pick !== 'guess' && pick !== 'tower') { setView(pick as View); return; }
    const q = buildQueue(priorities);
    roundsRef.current = 0; runLoggedRef.current = false;
    setQueue(q); setPos(0); setRestartMsg(''); setView('practice');
    consecutiveCorrect.current = 0;
    gameRef.current?.setStreak(0);
    gameRef.current?.reset();
  };

  // Unique letters chosen for the challenge (priority > 0) — the airplane
  // game tests each selected letter once.
  const selectedLetters = LETTERS.filter((_, i) => priorities[i] > 0);

  const advancePos = () => {
    setPos(prev => {
      const next = prev + 1;
      if (next >= queue.length) {
        if (childMode) launchConfetti(120);
        // Finishing the run is the logbook event. In child mode the practice
        // arena is the castle battle, so it is logged under that name; the
        // plain layout logs as letter practice. Both list the letters covered.
        logPractice(childMode ? 'Castle Battle' : 'Letter Practice');
        setView('win');
      }
      return next;
    });
  };

  const handleCorrect = () => {
    if (celebrating) return;
    setRestartMsg('');
    roundsRef.current += 1;
    consecutiveCorrect.current += 1;
    const streak = consecutiveCorrect.current;
    console.log('[AlphabetTrainer] streak:', streak);
    if (streak >= 6) {
      consecutiveCorrect.current = 0;
      console.log('[AlphabetTrainer] ⚔️ Spawning JAFAR!');
      gameRef.current?.spawnJafarSoldier();
      gameRef.current?.setStreak(0);
    } else if (streak === 3) {
      // Don't reset — keep counting toward 6 for Jafar
      console.log('[AlphabetTrainer] 🔥 Spawning BILAL!');
      gameRef.current?.spawnBilalSoldier();
      gameRef.current?.setStreak(streak);
    } else {
      gameRef.current?.spawnPlayerSoldier();
      gameRef.current?.setStreak(streak);
    }
    if (childMode) {
      setCelebrating(true);
      celebrate(() => { setCelebrating(false); advancePos(); });
    } else {
      advancePos();
    }
  };

  const handleWrong = () => {
    if (celebrating) return;
    roundsRef.current += 1;
    consecutiveCorrect.current = 0;  // reset streak on wrong answer
    gameRef.current?.setStreak(0);
    // The missed letter is tallied for this student and shown in red on the
    // letter grid, so the tutor sees at a glance what needs more work.
    const missed = queue[pos];
    if (missed) bumpMiss(missed);

    if (!hardcore) {
      // Default: keep going. A mistake costs the streak and is recorded, but
      // it no longer throws away the whole run.
      if (childMode) {
        setShaking(true);
        setTimeout(() => { setShaking(false); advancePos(); }, 450);
      } else {
        advancePos();
      }
      return;
    }

    // Hardcore: start the run over, as before.
    if (childMode) {
      setShaking(true);
      setRestartMsg(t('alphabetTrainer.restartChild'));
      setTimeout(() => {
        setShaking(false);
        setPos(0);
        setQueue(q => shuffle([...q]));
      }, 500);
    } else {
      setRestartMsg(t('alphabetTrainer.restartAdult'));
      setPos(0);
      setQueue(q => shuffle([...q]));
    }
  };

  const pct    = queue.length > 0 ? Math.round((pos / queue.length) * 100) : 0;
  const letter = queue[pos] ?? '';

  // ─── SELECT VIEW ───────────────────────────────────────────────────────────
  // ─── SELECT VIEW ───────────────────────────────────────────────────────────
  /** One rectangle in a rail. */
  const railCard = (a: Activity) => {
    const active = pick === a.id;
    const locked = a.needsLetters && unique === 0;
    return (
      <button
        key={a.id}
        onClick={() => setPick(a.id)}
        title={locked ? 'Pick some letters first' : a.hint}
        className={`group w-full flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-start transition-all duration-150 ${
          active
            ? 'border-transparent shadow-md ring-2 ring-offset-1 dark:ring-offset-gray-900'
            : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-slate-300 dark:hover:border-gray-600 hover:shadow-sm'
        }`}
        style={active ? { background: a.soft, boxShadow: `0 6px 18px -8px ${a.tint}`, ['--tw-ring-color' as string]: a.tint } : undefined}
      >
        <span
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-[20px] leading-none"
          style={{ background: active ? a.tint : a.soft, color: active ? '#fff' : a.tint }}
        >
          <span dir="rtl" style={a.arabic ? { fontFamily: "'Hafs','Amiri',serif", fontSize: 22 } : undefined}>{a.icon}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[13px] font-extrabold leading-tight truncate ${
            active ? 'text-slate-900 dark:text-slate-900' : 'text-slate-700 dark:text-slate-100'}`}>
            {a.name}
          </span>
          <span className={`block text-[11px] leading-tight truncate ${
            active ? 'text-slate-600 dark:text-slate-700' : 'text-slate-400 dark:text-slate-500'}`}>
            {a.hint}
          </span>
        </span>
        {active && (
          <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: a.tint }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="m5 13 4 4L19 7" /></svg>
          </span>
        )}
      </button>
    );
  };

  const rail = (title: string, note: string, list: Activity[]) => (
    <section className="flex flex-col gap-2">
      <div className="px-1">
        <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{title}</h3>
        <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-0.5">{note}</p>
      </div>
      {list.filter(a => !(a.tutorOnly && isStudentView)).map(railCard)}
    </section>
  );

  const renderSelect = () => (
    <div className="mx-auto w-full max-w-[1500px] px-3 sm:px-5 pb-32">
      <div className="grid gap-4 lg:gap-5 items-start lg:grid-cols-[minmax(215px,0.85fr)_minmax(0,2fr)_minmax(215px,0.85fr)]">

        {/* ── Challenges ── */}
        <div className="order-2 lg:order-1 lg:sticky lg:top-4">
          {rail('Challenges', 'Reading and shapes', CHALLENGES)}
        </div>

        {/* ── The letters ── */}
        <div className="order-1 lg:order-2 rounded-3xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 sm:p-4">
          {/* the shape they read */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 me-1">Shape</span>
            {FORM_CONFIG.map(({ form, labelAr, labelEn }) => {
              const active = letterForm === form;
              return (
                <button
                  key={form}
                  onClick={() => setLetterForm(form)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all duration-150 ${
                    active
                      ? 'bg-teal-600 dark:bg-amber-600 border-transparent text-white shadow-sm'
                      : 'bg-slate-50 dark:bg-gray-900/40 border-slate-200 dark:border-gray-700 text-slate-500 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <span style={{ fontFamily: "'Hafs', 'Amiri', serif", fontSize: '1.1rem', lineHeight: 1 }}>
                    {getLetterInForm('ب', form)}
                  </span>
                  <span className="text-[11px] font-bold">{labelEn}</span>
                  <span className="text-[10px] opacity-70 hidden sm:inline" style={{ fontFamily: "'Hafs', 'Amiri', serif" }}>{labelAr}</span>
                </button>
              );
            })}
            <span className="flex-grow" />
            <button
              onClick={() => setPriorities(new Array(28).fill(1))}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-gray-700 hover:border-slate-300"
            >{t('alphabetTrainer.selectAll')}</button>
            <button
              onClick={() => setPriorities(new Array(28).fill(0))}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-gray-700 hover:border-slate-300"
            >{t('alphabetTrainer.clearAll')}</button>
          </div>

          {(letterForm === 'initial' || letterForm === 'medial') && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
              <span className="font-semibold" style={{ fontFamily: "'Hafs', 'Amiri', serif", fontSize: '0.85rem' }}>ا و ر ز د ذ</span>
              {' '}only have 2 shapes — shown as{' '}
              <span className="font-semibold">{letterForm === 'initial' ? 'Isolated' : 'End'}</span>
            </p>
          )}

          {/* the 28, in the order they are recited */}
          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 gap-1.5 sm:gap-2" style={{ direction: 'rtl' }}>
            {LETTERS.map((letter, i) => {
              const p = priorities[i];
              const missed = missedFor(letter);
              const ms = missStyle(missed);
              const pressHandlers = {
                onPointerDown: () => startPress(letter),
                onPointerUp: endPress,
                onPointerLeave: endPress,
                onPointerCancel: endPress,
                onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
              };
              return (
                <button
                  key={i}
                  onClick={() => handleLetterClick(i)}
                  {...pressHandlers}
                  title={missed > 0 ? t('alphabetTrainer.missedTimes', { count: missed }) : undefined}
                  style={ms ? { borderColor: ms.border } : undefined}
                  className={`relative aspect-[4/5] rounded-2xl border flex flex-col items-center justify-center cursor-pointer hover:-translate-y-0.5 active:scale-95 transition-all duration-150 select-none ${
                    p === 0 ? 'bg-slate-50 dark:bg-gray-900/40 border-slate-200 dark:border-gray-700' :
                    p === 1 ? 'bg-amber-50  dark:bg-amber-900/20 border-amber-300 dark:border-amber-700' :
                    p === 2 ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600' :
                              'bg-amber-200 dark:bg-amber-900/50 border-amber-500'
                  }`}
                >
                  {ms && (
                    <span aria-hidden style={{
                      position: 'absolute', inset: 0, borderRadius: 'inherit',
                      background: `rgba(220, 38, 38, ${ms.alpha})`, pointerEvents: 'none',
                    }} />
                  )}
                  {missed > 0 && (
                    <span
                      title={t('alphabetTrainer.missedTimes', { count: missed })}
                      style={{
                        position: 'absolute', top: 3, insetInlineEnd: 3,
                        minWidth: 17, height: 17, padding: '0 4px',
                        borderRadius: 9, background: '#dc2626', color: '#fff',
                        fontSize: 10, fontWeight: 800, lineHeight: '17px',
                        textAlign: 'center', pointerEvents: 'none',
                      }}
                    >{missed}</span>
                  )}
                  <span
                    style={{ position: 'relative', fontFamily: "'Hafs', 'Amiri', serif", fontSize: 'clamp(2rem, 6vw, 3.4rem)', lineHeight: 1, ...(ms?.ink ? { color: ms.ink } : {}) }}
                    className={
                      p === 0 ? 'text-slate-500 dark:text-slate-400' :
                      p === 3 ? 'text-amber-800 dark:text-amber-200' :
                                'text-amber-700 dark:text-amber-300'
                    }
                  >{getLetterInForm(letter, letterForm)}</span>
                  {NON_CONNECTORS.has(letter) && (letterForm === 'initial' || letterForm === 'medial') && (
                    <span className="text-[8px] text-slate-400 dark:text-slate-500 mt-0.5">
                      ≡ {letterForm === 'initial' ? 'مُفرَد' : 'آخِر'}
                    </span>
                  )}
                  <span className="flex gap-[3px] mt-1">
                    {[1, 2, 3].map(d => (
                      <span key={d} style={{
                        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                        background: d <= p
                          ? (p === 3 ? '#d97706' : p === 2 ? '#f59e0b' : '#fbbf24')
                          : 'rgba(148,163,184,0.22)',
                      }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {LETTERS.some(l => missedFor(l) > 0) && !isStudentView && (
            <button
              onClick={() => {
                setMisses({});
                try { localStorage.setItem(MISS_KEY(logTarget?.id), '{}'); } catch { /* private mode */ }
                if (letterForm !== 'isolated' && logTarget?.id) {
                  const form = letterForm as MatchForm;
                  setFormMisses(prev => ({ ...prev, [form]: {} }));
                  clearFormMisses(logTarget.id, form);
                }
              }}
              className="mt-3 text-[11px] font-semibold text-slate-400 hover:text-red-600 underline"
            >{t('alphabetTrainer.clearMisses')}</button>
          )}
        </div>

        {/* ── Games ── */}
        <div className="order-3 lg:sticky lg:top-4">
          {rail('Games', 'Play the letters', GAMES)}
        </div>
      </div>

      {/* ── Start ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-[1500px] px-3 sm:px-5 py-2.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-slate-800 dark:text-slate-100 truncate">
              {chosen?.name ?? 'Pick a game or a challenge'}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
              {unique === 0
                ? (chosen?.needsLetters === false ? 'Ready — no letters needed' : t('alphabetTrainer.noLetters'))
                : <>{unique} {unique === 1 ? t('alphabetTrainer.letter') : t('alphabetTrainer.letters')} · {total} {t('alphabetTrainer.rounds')}</>}
            </p>
          </div>
          <button
            onClick={handleStart}
            disabled={!chosen || (chosen.needsLetters && unique === 0)}
            className="flex-shrink-0 h-11 px-7 rounded-2xl bg-teal-600 dark:bg-amber-600 hover:bg-teal-700 dark:hover:bg-amber-700 text-white text-sm font-black transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >Start</button>
        </div>
      </div>
    </div>
  );

  // ─── PRACTICE VIEW ─────────────────────────────────────────────────────────
  const renderPractice = () => {
    // Shared top-bar element (back button + progress bar + counter)
    const topBar = (
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            // Log the work done even though the run was not completed.
            logPractice(childMode ? 'Castle Battle' : 'Letter Practice', false);
            setView('select'); setRestartMsg('');
          }}
          className={`px-4 py-1.5 text-sm border transition-colors flex-shrink-0 ${
            childMode
              ? 'rounded-full border-2 border-blue-200 font-bold text-blue-600 hover:border-blue-400 bg-white'
              : 'rounded-lg border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400'
          }`}
        >{t('alphabetTrainer.backBtn')}</button>
        <div className={`flex-1 h-3 rounded-full overflow-hidden ${childMode ? 'bg-indigo-100' : 'bg-slate-200 dark:bg-gray-700'}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${childMode ? '' : 'bg-amber-500 dark:bg-amber-400'}`}
            style={{ width: `${pct}%`, ...(childMode ? { background: 'linear-gradient(90deg,#ff6b9d,#ffd93d,#6bcb77)' } : {}) }}
          />
        </div>
        <span className={`text-sm flex-shrink-0 min-w-[3rem] text-right ${childMode ? 'font-extrabold text-blue-700' : 'text-slate-400 dark:text-slate-500'}`}>
          {pos} / {queue.length}
        </span>
      </div>
    );

    // ── Child mode: canvas-first layout — letter card overlaid on the arena ──
    if (childMode) {
      return (
        <>
          {/* Top bar above the canvas */}
          <div className="px-4 pt-2 pb-2">
            {topBar}
          </div>

          {/* Battle arena — full width, letter card floated inside as an overlay */}
          <div className="relative w-full">
            <TowerDefenseGame ref={gameRef} />

            {/* Letter card — top-center of canvas, small padding from the top edge.
                pointer-events-none so clicks pass through to the game. */}
            <div
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none"
              style={{ top: 10, zIndex: 5 }}
            >
              <div
                key={`${pos}-${letter}-${letterForm}`}
                className={`flex items-center justify-center rounded-3xl at-card-kid border-4 border-indigo-200 shadow-xl ${shaking ? 'at-shake' : ''}`}
                style={{
                  width: 'min(170px, 38vw)', height: 'min(170px, 38vw)',
                  background: 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                }}
              >
                <span
                  style={{
                    fontFamily: "'Hafs', 'Amiri', serif",
                    fontSize: 'clamp(4rem, 14vw, 6.5rem)',
                    lineHeight: 1,
                    color: '#3c4a8a',
                  }}
                >{getLetterInForm(letter, letterForm)}</span>
              </div>
            </div>
          </div>

          {/* Correct / Wrong buttons — below the canvas */}
          <div className="px-4 pt-3 pb-2 max-w-sm mx-auto w-full">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleCorrect}
                disabled={celebrating}
                className="py-4 rounded-full bg-green-500 hover:bg-green-400 text-white font-bold text-lg shadow-md shadow-green-200 transition-all active:scale-95 disabled:opacity-60"
              >{t('alphabetTrainer.correctChild')}</button>
              <button
                onClick={handleWrong}
                disabled={celebrating}
                className="py-4 rounded-full bg-rose-500 hover:bg-rose-400 text-white font-bold text-lg shadow-md shadow-rose-200 transition-all active:scale-95 disabled:opacity-60"
              >{t('alphabetTrainer.wrongChild')}</button>
            </div>
            {restartMsg && (
              <p className="text-center mt-3 text-sm font-semibold text-pink-500">
                {restartMsg}
              </p>
            )}
          </div>
        </>
      );
    }

    // ── Adult mode — original layout (no game canvas) ────────────────────────
    return (
      <div className="max-w-xl mx-auto px-4 pb-4 pt-2">
        {/* Top bar: back + progress + count */}
        <div className="flex items-center gap-3 mb-8">
          {topBar}
        </div>

        {/* Active form badge */}
        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-gray-600">
            <span style={{ fontFamily: "'Hafs', 'Amiri', serif", fontSize: '1rem', lineHeight: 1 }}>
              {getLetterInForm('ب', letterForm)}
            </span>
            <span style={{ fontFamily: "'Hafs', 'Amiri', serif" }}>
              {FORM_CONFIG.find(f => f.form === letterForm)?.labelAr}
            </span>
            <span className="opacity-60">·</span>
            <span>{FORM_CONFIG.find(f => f.form === letterForm)?.labelEn}</span>
          </div>
        </div>

        {/* Letter card */}
        <div className="flex justify-center mb-10">
          <div
            key={`${pos}-${letter}-${letterForm}`}
            className={`flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-3xl at-card-in border border-amber-200/60 dark:border-gray-600 shadow-md ${shaking ? 'at-shake' : ''}`}
            style={{ width: 'min(240px,70vw)', height: 'min(240px,70vw)' }}
          >
            <span
              style={{
                fontFamily: "'Hafs', 'Amiri', serif",
                fontSize: 'clamp(4.5rem,16vw,7rem)',
                lineHeight: 1,
              }}
              className="text-slate-700 dark:text-slate-200"
            >{getLetterInForm(letter, letterForm)}</span>
            {NON_CONNECTORS.has(letter) && (letterForm === 'initial' || letterForm === 'medial') && (
              <span className="text-xs mt-2 px-2 py-0.5 rounded-full text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-gray-700">
                ≡ {letterForm === 'initial' ? 'Isolated' : 'End'}
              </span>
            )}
          </div>
        </div>

        {/* Correct / Wrong buttons */}
        <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
          <button
            onClick={handleCorrect}
            disabled={celebrating}
            className="py-5 rounded-2xl bg-teal-600 dark:bg-teal-700 hover:bg-teal-700 dark:hover:bg-teal-600 text-white font-bold text-lg transition-all active:scale-95 disabled:opacity-60"
          >{t('alphabetTrainer.correct')}</button>
          <button
            onClick={handleWrong}
            disabled={celebrating}
            className="py-5 rounded-2xl bg-red-500 dark:bg-red-700 hover:bg-red-600 dark:hover:bg-red-600 text-white font-bold text-lg transition-all active:scale-95 disabled:opacity-60"
          >{t('alphabetTrainer.wrong')}</button>
        </div>

        {restartMsg && (
          <p className="text-center mt-5 text-sm font-semibold text-red-400">
            {restartMsg}
          </p>
        )}
      </div>
    );
  };

  // ─── WIN VIEW ──────────────────────────────────────────────────────────────
  const renderWin = () => (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className={`flex items-center justify-center text-4xl mb-6 ${
        childMode
          ? 'at-bounce w-28 h-28 rounded-full bg-yellow-100 border-4 border-yellow-300 shadow-lg'
          : 'w-24 h-24 rounded-full bg-white dark:bg-gray-800 border-2 border-amber-300'
      }`}>
        {childMode ? '🏆' : '✓'}
      </div>
      <h2 className={`mb-2 font-bold ${childMode ? 'text-4xl font-extrabold text-pink-500' : 'text-3xl text-amber-600 dark:text-amber-400'}`}
        style={childMode ? {} : { fontFamily: "'Hafs', 'Amiri', serif" }}
      >
        {childMode ? t('alphabetTrainer.winTitleChild') : t('alphabetTrainer.winTitleAdult')}
      </h2>
      <p className={`mb-8 max-w-xs ${childMode ? 'text-lg font-bold text-blue-600' : 'text-slate-500 dark:text-slate-400'}`}>
        {childMode ? (
          <>{t('alphabetTrainer.winSubChildA', { count: queue.length })}<br />{t('alphabetTrainer.winSubChildB')}</>
        ) : (
          t('alphabetTrainer.winSubAdult', { count: queue.length })
        )}
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={() => {
            roundsRef.current = 0; runLoggedRef.current = false;
            setQueue(buildQueue(priorities)); setPos(0); setRestartMsg(''); setView('practice'); gameRef.current?.reset();
          }}
          className={`px-6 py-2.5 font-bold transition-all active:scale-95 ${
            childMode
              ? 'rounded-full bg-orange-400 hover:bg-orange-500 text-white shadow-md'
              : 'rounded-xl bg-teal-600 dark:bg-amber-600 hover:bg-teal-700 dark:hover:bg-amber-700 text-white'
          }`}
        >{childMode ? t('alphabetTrainer.playAgainChild') : t('alphabetTrainer.practiceAgain')}</button>
        <button
          onClick={() => setView('select')}
          className={`px-6 py-2.5 font-bold transition-all active:scale-95 ${
            childMode
              ? 'rounded-full bg-white border-2 border-blue-300 text-blue-600 hover:border-blue-500'
              : 'rounded-xl border border-slate-300 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-500'
          }`}
        >{t('alphabetTrainer.changeLetters')}</button>
      </div>
    </div>
  );

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className={`${childMode ? 'bg-blue-50' : 'bg-white dark:bg-gray-900'} min-h-[calc(100dvh-6rem)] transition-colors duration-300 relative`}>

      {/* Celebration popup (child mode) */}
      {popup.phase !== 'hidden' && (
        <div
          className={`fixed top-1/2 left-1/2 z-[9998] bg-white rounded-3xl p-8 text-center shadow-2xl border-4 border-yellow-300 min-w-[180px] pointer-events-none ${popup.phase === 'in' ? 'at-pop-in' : 'at-pop-out'}`}
        >
          <span className="text-6xl block mb-2">{popup.emoji}</span>
          <div className="font-extrabold text-2xl text-blue-900">{popup.text}</div>
        </div>
      )}

      {/* Page header */}
      <div className="mx-auto w-full max-w-[1500px] px-3 sm:px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold bg-gradient-to-br from-teal-500 to-amber-500 text-white">
            ا
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-800 dark:text-slate-100 leading-tight">
              {t('alphabetTrainer.pageTitle')}
            </h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Choose the letters, then a challenge or a game
            </p>
          </div>
          <span className="flex-grow" />
          {/* Hardcore: a wrong answer restarts the run (tutor side only) */}
          {!isStudentView && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none" title={t('alphabetTrainer.hardcoreHint')}>
              <input type="checkbox" checked={hardcore} onChange={e => setHardcore(e.target.checked)} className="accent-red-600" />
              <span className={`text-[11px] font-bold uppercase tracking-wide ${hardcore ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {t('alphabetTrainer.hardcore')}
              </span>
            </label>
          )}
        </div>
      </div>

      {/* Main content */}
      {view === 'select'   && renderSelect()}
      {view === 'practice' && renderPractice()}
      {view === 'win'      && renderWin()}
      {view === 'airplane' && (
        <div className="max-w-3xl mx-auto px-4 pb-8">
          <AirplaneGame letters={selectedLetters} letterForm={letterForm} onExit={() => finishGame('Airplane', selectedLetters)} avatarSrc={avatarSrc} />
        </div>
      )}
      {view === 'flappy' && (
        <FlappyLettersGame letters={selectedLetters} letterForm={letterForm} onExit={() => finishGame('Flappy Letters', selectedLetters)} />
      )}
      {view === 'race' && (
        <LetterRaceGame letters={selectedLetters} letterForm={letterForm} onExit={() => finishGame('Letter Race', selectedLetters)} />
      )}
      {view === 'battle' && (
        <ReadingBattleGame onExit={() => setView('select')} />
      )}
      {view === 'oddletter' && (
        <OddLetterGame onExit={() => finishGame('Odd Letter')} />
      )}
      {view === 'lettercards' && (
        logTarget ? (
          <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-3xl border border-slate-200 dark:border-gray-700 my-6">
            <LetterCardsSetup
              letters={selectedLetters}
              initialForm={letterForm}
              student={logTarget}
              onClose={() => setView('select')}
            />
          </div>
        ) : (
          <div className="max-w-md mx-auto my-10 p-6 text-center rounded-3xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
            <p className="font-bold text-slate-700 dark:text-slate-200">Pick a student first</p>
            <p className="text-sm text-slate-500 mt-1">Letter cards is played with one student.</p>
            <button onClick={() => setView('select')} className="mt-4 h-10 px-5 rounded-xl bg-slate-100 dark:bg-gray-700 font-bold">Back</button>
          </div>
        )
      )}
      {view === 'lettermatch' && (
        <LetterMatchSetup
          letters={selectedLetters}
          initialForm={letterForm}
          student={logTarget}
          onExit={() => { reloadFormMisses(); setView('select'); }}
          onCompleted={(c, attempt) => {
            reloadFormMisses();
            if (!logTarget || !onLogActivity || c.studentId !== logTarget.id) return;
            onLogActivity(logTarget.id, {
              kind: 'letters',
              title: `${c.letters.length} letter${c.letters.length === 1 ? '' : 's'} revised through letter shapes match`,
              detail: `${attempt.correct}/${attempt.total} matched · ${attempt.mistakes} mistake${attempt.mistakes === 1 ? '' : 's'} · ${c.form} · attempt ${attempt.attemptNo} · ${c.letters.join(' ')}`,
              sourceId: `LetterMatch:${c.id}:${attempt.attemptNo}`,
            }, logTarget.name);
          }}
        />
      )}
      {view === 'formdrill' && (
        <LetterFormDrill
          letters={selectedLetters}
          onFinish={(score, total, repeats) => {
            if (!logTarget || !onLogActivity) return;
            const ls = selectedLetters.join(' ');
            onLogActivity(logTarget.id, {
              kind: 'letters',
              title: `${selectedLetters.length} letter${selectedLetters.length === 1 ? '' : 's'} revised through letter-form drill`,
              detail: `${score}/${total} correct · ${repeats}× each · ${ls}`,
              sourceId: `FormDrill:${ls}`,
            }, logTarget.name);
          }}
          onExit={() => setView('select')}
        />
      )}
      {view === 'letterhunt' && (
        <LetterHuntGame
          letters={selectedLetters}
          onFinish={(hostScore, guestScore, rounds) => {
            if (!logTarget || !onLogActivity) return;
            const ls = selectedLetters.join(' ');
            onLogActivity(logTarget.id, {
              kind: 'game',
              title: `${selectedLetters.length} letter${selectedLetters.length === 1 ? '' : 's'} revised through game Letter Hunt`,
              detail: `${guestScore}/${rounds} found · tutor ${hostScore} · ${ls}`,
              sourceId: `Letter Hunt:${ls}`,
            }, logTarget.name);
          }}
          onExit={() => setView('select')}
        />
      )}
      {view === 'wordchallenge' && (
        <WordChallengePage
          letters={selectedLetters}
          childMode={childMode}
          onFinish={(score, total) => {
            if (!logTarget || !onLogActivity) return;
            const ls = selectedLetters.join(' ');
            onLogActivity(logTarget.id, {
              kind: 'letters',
              title: `${selectedLetters.length} letter${selectedLetters.length === 1 ? '' : 's'} revised through word challenge`,
              detail: `${score}/${total} correct · ${ls}`,
              sourceId: `WordChallenge:${ls}`,
            }, logTarget.name);
          }}
          onExit={() => setView('select')}
        />
      )}
    </div>
  );
};

export default AlphabetTrainerPage;
