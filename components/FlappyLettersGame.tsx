import React, { useState, useEffect, useRef, useCallback } from 'react';
import lottie from 'lottie-web';
import { QRCodeSVG } from 'qrcode.react';
import { ARABIC_LETTERS } from '../services/letterAudioService';
import { listAllQaedahWords } from '../services/qaedahService';
import { createGameChannel, P2PGameChannel } from '../services/p2pGameChannel';

// ─────────────────────────────────────────────────────────────────────────────
// Flappy Letters — a Flappy-Bird-style WORD game for 1–2 players.
//
// A Qaedah word is shown at the top (no audio). The player flaps (Left/Right
// Shift, or tap your half of the screen) and must fly into the word's letters
// IN ORDER. Touching a wrong letter is not deadly — it just burns the chance:
// the word is replaced by a fresh one. Completing a word earns a ⭐ (shown
// next to the player's name); the goal is to collect as many stars as
// possible. Death comes ONLY from the dragons that fly in from the right —
// the ground and ceiling are soft (the bird just rests/bumps). Every round
// opens with a 3-2-1 countdown. Speed, letter density, and dragon frequency
// all ramp up as stars are earned. Online, each player flaps with SPACE.
//
// 2P: each player has their OWN word (always two different words of the same
// length). Word lengths follow the same schedule for both players: their
// first 3 completed words are 3-letter words, the next 3 are 4-letter words,
// and every word after that has 5 letters (a failed word is retried with a
// new word of the same length). Winner = most stars when everyone crashes.
//
// Words come from the Qaedah lists in Supabase (all topics, fetched once at
// mount) with a built-in fallback list so the game always works offline.
// Characters are a registry of Lottie JSON animations (type 'lottie') or
// static images (type 'sprite') — adding one is a pure asset + registry drop,
// and the hitbox is independent of the animation.
// ─────────────────────────────────────────────────────────────────────────────

const HAFS: React.CSSProperties = { fontFamily: "'Hafs', 'Amiri', serif" };

type LetterForm = 'isolated' | 'initial' | 'medial' | 'final';
function getLetterInForm(letter: string, form: LetterForm): string {
  switch (form) {
    case 'initial': return `${letter}‍`;
    case 'medial':  return `‍${letter}‍`;
    case 'final':   return `‍${letter}`;
    default:        return `‌${letter}‌`;
  }
}

// ── Character registry (§ data-driven) ──────────────────────────────────────
export interface GameCharacter {
  id: string;
  name: string;
  type: 'lottie' | 'sprite';
  src: string;
  size: number;
  hitboxR: number;
  aspect?: number; // animation frame w/h (default ~1.15) — sizes the lottie box
  flip?: boolean;  // mirror horizontally (for art exported facing left)
}

// Coordinates: x in 0..100 (% of field width), y in 0..100 (% of field height).
// Speeds/accelerations are per SECOND (delta-time based).
const GAME_CONFIG = {
  direction: 'rtl' as 'rtl' | 'ltr',
  difficulty: {
    gravity: 150,            // downward acceleration (height-%/s²)
    flapVy: -46,             // upward velocity applied by one flap
    maxFallVy: 85,           // terminal fall speed
    baseSpeed: 13,           // world scroll speed (width-%/s) at start
    speedRampPerStar: 1.4,   // extra speed per star earned (all players)
    maxSpeed: 32,
    clusterSpacing: 52,      // width-% scrolled between letter columns (CONSTANT
    spacingMinRatio: 1,      // — letter density does NOT ramp with progress;
    spacingShrinkPerStar: 0, //   only speed and dragon frequency get harder)
    emptySlotsStart: 4,      // flyable gaps per column
    emptySlotsMin: 4,        // (kept equal to start → column fill never tightens)
    tightenEvery: 2,
    slotsY: [13, 28, 43, 58, 72, 86], // vertical letter slots (sky → ground)
    bubbleR: 6.2,            // bubble radius (height-%)
    dragonGapStart: 150,     // width-% scrolled between dragons at the start
    dragonGapMin: 60,
    dragonGapShrinkPerStar: 0.07,
    dragonSpeedFactor: 1.12, // dragons fly a bit faster than the letters
    wrongGraceMs: 900,       // after a wrong grab, ignore further wrong touches
    starsToWin: 10,          // first player to bank this many stars wins
  },
  // ⭐ awarded per completed word (Lottie), and the dragon obstacle.
  starSrc: '/sprites/star.json',
  obstacle: { id: 'dragon', name: 'Dragon', type: 'lottie', src: '/sprites/dragon-obstacle.json', size: 15, hitboxR: 4, aspect: 1 } as GameCharacter,
  // Pixel-art scenes — one picked at random per game start, tiled + scrolled.
  backgrounds: [
    '/sprites/flappy-bg/green-peaks.png',
    '/sprites/flappy-bg/sunset.png',
    '/sprites/flappy-bg/ice.png',
    '/sprites/flappy-bg/winter.png',
    '/sprites/flappy-bg/rocky.png',
  ],
  characters: [
    // Birds fly toward the RIGHT (the world scrolls left). Files exported
    // facing left ("revert" downloads) carry flip: true and are mirrored.
    { id: 'toucan',        name: 'Toucan',      type: 'lottie', src: '/sprites/birds/toucan.json',        size: 9,   hitboxR: 2.4, aspect: 1.07 },
    { id: 'parrot',        name: 'Parrot',      type: 'lottie', src: '/sprites/birds/parrot.json',        size: 9,   hitboxR: 2.4, aspect: 0.95, flip: true },
    { id: 'cute-bird',     name: 'Cutie',       type: 'lottie', src: '/sprites/birds/cute-bird.json',     size: 8.5, hitboxR: 2.4, aspect: 1 },
    { id: 'bird',          name: 'Bluebird',    type: 'lottie', src: '/sprites/birds/bird.json',          size: 8.5, hitboxR: 2.4, aspect: 1.78, flip: true },
    { id: 'bird-flying',   name: 'Sky',         type: 'lottie', src: '/sprites/birds/bird-flying.json',   size: 8.5, hitboxR: 2.4, aspect: 1.78 },
    { id: 'falcon',        name: 'Falcon',      type: 'lottie', src: '/sprites/birds/falcon.json',        size: 10,  hitboxR: 2.4, aspect: 0.72 },
    { id: 'flying-bird-2', name: 'Dove',        type: 'lottie', src: '/sprites/birds/flying-bird-2.json', size: 8.5, hitboxR: 2.4, aspect: 1 },
    { id: 'hummingbird',   name: 'Hummingbird', type: 'lottie', src: '/sprites/birds/hummingbird.json',   size: 8.5, hitboxR: 2.4, aspect: 1, flip: true },
    { id: 'chudik',        name: 'Chudik',      type: 'lottie', src: '/sprites/birds/chudik.json',        size: 8.5, hitboxR: 2.4, aspect: 1 },
    { id: 'red-bird',      name: 'Red Bird',    type: 'lottie', src: '/sprites/birds/red-bird.json',      size: 8.5, hitboxR: 2.4, aspect: 1 },
  ] as GameCharacter[],
};

const ONLINE_SITE_URL = 'https://www.lisanquran.com';
const SNAPSHOT_MS = 33;        // host → guest state rate (~30Hz, unreliable channel)
const RECONCILE_NUDGE = 0.06;  // guest pulls its predicted bird toward the host's
const RECONCILE_SNAP = 10;     // ...and hard-snaps when the error exceeds this
const P1_LERP = 0.3;           // guest interpolation for the host's bird

const GROUND_Y = 92;   // top of the ground strip
const CEILING_Y = 2;
const P1_X = 22;       // both flyers share one column (width-%), stacked
const P2_X = 22;       // vertically (P1 hovers at y=46, P2 at y=54)
const PLAYER_COLORS = ['#38bdf8', '#fbbf24'];

const BUBBLE_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#2dd4bf', '#c084fc', '#4ade80', '#38bdf8'];

// ── Word helpers ─────────────────────────────────────────────────────────────
// Base letters of a word: Arabic letters only, no harakat, no tatweel. Qaedah
// words may use Quranic orthography — hamzat-wasl ٱ (U+0671) is collected as
// a plain ا so it matches the letter bubbles.
const isArabicBase = (ch: string) => {
  const c = ch.charCodeAt(0);
  return (c >= 0x0621 && c <= 0x064A && c !== 0x0640) || c === 0x0671;
};
const baseLetters = (word: string): string[] =>
  [...word].filter(isArabicBase).map(ch => (ch === 'ٱ' ? 'ا' : ch));

// Split a word into letter units (base char + its harakat) so the word can be
// rendered with one span per letter — the next-needed letter gets highlighted
// while Arabic joining is preserved (same-font inline spans shape correctly,
// exactly like the per-letter reader in StudentProgressPage).
const wordUnits = (word: string): { u: string; base: boolean }[] => {
  const units: { u: string; base: boolean }[] = [];
  for (const ch of word) {
    if (isArabicBase(ch)) units.push({ u: ch, base: true });
    else if (units.length) units[units.length - 1].u += ch;
    else units.push({ u: ch, base: false });
  }
  return units;
};

// Word-length schedule (shared by both players so their words always have the
// same letter count): the first 3 completed words → 3 letters, the next 3 →
// 4 letters, everything after → 5. A failed word retries at the same length.
const lengthForStars = (stars: number) => (stars < 3 ? 3 : stars < 6 ? 4 : 5);

// Built-in fallback pool (works offline / before the Qaedah lists load).
const FALLBACK_WORDS = [
  // 3 base letters
  'كَتَبَ', 'قَرَأَ', 'ذَهَبَ', 'جَلَسَ', 'شَرِبَ', 'لَعِبَ', 'فَتَحَ', 'نَصَرَ', 'خَرَجَ', 'دَخَلَ',
  'رَكِبَ', 'سَمِعَ', 'عَمِلَ', 'غَسَلَ', 'صَبَرَ', 'ضَحِكَ', 'طَبَخَ', 'ظَهَرَ', 'حَمَلَ', 'زَرَعَ',
  'قَمَر', 'جَبَل', 'عِنَب', 'جَمَل', 'وَلَد', 'بَيْت',
  // 4 base letters
  'مَكْتَب', 'مَسْجِد', 'دَفْتَر', 'مَلْعَب', 'مَطْبَخ', 'مَغْرِب', 'مَشْرِق', 'أَرْنَب',
  'كَوْكَب', 'مَنْزِل', 'مَرْكَب', 'مَصْنَع', 'مَخْبَز', 'بُسْتَان', 'شُبَّاك', 'مُعَلِّم',
  // 5 base letters
  'مِفْتَاح', 'مَدْرَسَة', 'سَفِينَة', 'مَكْتَبَة', 'تُفَّاحَة', 'مِنْشَفَة', 'مَلْعَقَة',
  'طَاوِلَة', 'مِصْبَاح', 'صَابُون', 'حَقِيبَة', 'شَجَرَة', 'سَيَّارَة',
];

type WordTiers = Record<3 | 4 | 5, string[]>;
const buildTiers = (words: string[]): WordTiers => {
  const tiers: WordTiers = { 3: [], 4: [], 5: [] };
  for (const w of words) {
    const n = baseLetters(w).length;
    if (n === 3 || n === 4 || n === 5) tiers[n].push(w);
  }
  return tiers;
};

type Phase = 'menu' | 'count' | 'play' | 'paused' | 'over';

interface Flyer {
  name: string;
  x: number; y: number; vy: number;
  alive: boolean;
  stars: number;
  word: string;          // current word (with harakat, as authored)
  seq: string[];         // its base letters, in collect order
  seqPos: number;        // next letter index to collect
  graceUntil: number;    // wrong-touches ignored until this time
  failAt: number;        // last wrong grab (red flash on the word card)
  starAt: number;        // last star earned (celebration pop)
  diedAt: number;
  flapAt: number;
  charId: string;
}
interface Bubble {
  id: number;
  letter: string;
  x: number; y: number;
  color: string;
  taken: boolean; takenAt: number; wrong?: boolean;
}
interface Dragon { id: number; x: number; y: number }

// Host → guest snapshot (compact keys; rides the unreliable P2P channel).
interface NetSnapshot {
  ph: Phase;
  cn: string;   // countdown display during the 'count' phase
  bg: string;
  speed: number;
  em: string; wi: number;
  ps: { x: number; y: number; vy: number; alive: boolean; stars: number; word: string; seqPos: number; name: string; charId: string; failAge: number; starAge: number }[];
  bs: { id: number; letter: string; x: number; y: number; color: string; taken: boolean }[];
  ds: Dragon[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const charById = (id: string): GameCharacter =>
  GAME_CONFIG.characters.find(c => c.id === id) ?? GAME_CONFIG.characters[0];

// Lottie/sprite renderer. The lottie animation mounts once per character id and
// keeps playing across React re-renders (the wrapper div identity is stable).
const CharacterSprite: React.FC<{ char: GameCharacter; heightPx: number; style?: React.CSSProperties }> = ({ char, heightPx, style }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (char.type !== 'lottie' || !ref.current) return;
    let anim: ReturnType<typeof lottie.loadAnimation> | undefined;
    let cancelled = false;
    fetch(char.src).then(r => r.json()).then(data => {
      if (cancelled || !ref.current) return;
      anim = lottie.loadAnimation({ container: ref.current, animationData: data, renderer: 'svg', loop: true, autoplay: true });
    }).catch(() => {});
    return () => { cancelled = true; anim?.destroy(); };
  }, [char.src, char.type]);
  const flipStyle: React.CSSProperties = char.flip ? { transform: 'scaleX(-1)' } : {};
  if (char.type === 'sprite') {
    return <img src={char.src} alt="" draggable={false} style={{ height: heightPx, width: 'auto', objectFit: 'contain', ...flipStyle, ...style }} />;
  }
  return <div ref={ref} style={{ height: heightPx, width: heightPx * (char.aspect ?? 1.15), pointerEvents: 'none', ...flipStyle, ...style }} />;
};

// Small looping star (HUD) / one-shot star burst (celebration).
const StarLottie: React.FC<{ sizePx: number; loop?: boolean }> = ({ sizePx, loop = true }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let anim: ReturnType<typeof lottie.loadAnimation> | undefined;
    let cancelled = false;
    fetch(GAME_CONFIG.starSrc).then(r => r.json()).then(data => {
      if (cancelled || !ref.current) return;
      anim = lottie.loadAnimation({ container: ref.current, animationData: data, renderer: 'svg', loop, autoplay: true });
    }).catch(() => {});
    return () => { cancelled = true; anim?.destroy(); };
  }, [loop]);
  return <div ref={ref} style={{ width: sizePx, height: sizePx, pointerEvents: 'none' }} />;
};

const CharPicker: React.FC<{ value: string; onChange: (id: string) => void; excluded?: string; color: string; label: string }> =
  ({ value, onChange, excluded, color, label }) => (
    <div style={{ background: '#ffffff14', borderRadius: 18, padding: '12px 14px', minWidth: 230 }}>
      <div style={{ color, fontWeight: 900, fontSize: 14, marginBottom: 8, textAlign: 'center' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 420 }}>
        {GAME_CONFIG.characters.map(c => (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            disabled={c.id === excluded}
            style={{
              width: 92, height: 92, borderRadius: 16, cursor: c.id === excluded ? 'not-allowed' : 'pointer',
              border: value === c.id ? `3px solid ${color}` : '3px solid #ffffff22',
              background: value === c.id ? '#ffffff2e' : '#ffffff10',
              opacity: c.id === excluded ? 0.35 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, overflow: 'hidden',
            }}
            title={c.name}
          >
            <CharacterSprite char={c} heightPx={70} />
          </button>
        ))}
      </div>
    </div>
  );

// Player panel: name + star count on top, the current word below with the
// NEXT letter to catch highlighted in yellow (collected letters turn green).
// Flashes red on a wrong grab and pops a star burst on completion.
const PlayerPanel: React.FC<{ p: Flyer; color: string; align: 'start' | 'end'; starsToWin: number }> = ({ p, color, align, starsToWin }) => {
  const failing = performance.now() - p.failAt < 700;
  const starring = performance.now() - p.starAt < 1100;
  let seqIdx = -1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'start' ? 'flex-start' : 'flex-end', gap: 5 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, background: '#ffffffe0',
        border: `3px solid ${color}`, borderRadius: 14, padding: '4px 10px',
        opacity: p.alive ? 1 : 0.55,
      }}>
        <CharacterSprite char={charById(p.charId)} heightPx={22} />
        <span style={{ fontWeight: 800, fontSize: 12, color: '#334155', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
        <StarLottie sizePx={22} />
        <span style={{ fontWeight: 900, fontSize: 15, color: '#0f172a' }}>{p.stars}<span style={{ fontSize: 10, color: '#94a3b8' }}>/{starsToWin}</span></span>
        {!p.alive && <span style={{ fontSize: 13 }}>💥</span>}
      </div>
      {p.alive && p.word && (
        <div style={{
          position: 'relative', background: '#ffffffee', borderRadius: 16, padding: '4px 14px 7px',
          border: `3px solid ${failing ? '#ef4444' : color}`,
          boxShadow: failing ? '0 0 0 4px #ef444455' : '0 4px 14px rgba(2,6,23,0.2)',
          textAlign: 'center', minWidth: 130,
        }}>
          <div dir="rtl" style={{ ...HAFS, fontSize: 'clamp(24px,3.8vh,38px)', lineHeight: 1.35, color: '#0f172a' }}>
            {wordUnits(p.word).map((unit, k) => {
              if (unit.base) seqIdx++;
              const state = !unit.base ? 'todo' : seqIdx < p.seqPos ? 'done' : seqIdx === p.seqPos ? 'next' : 'todo';
              return (
                <span key={k} style={{
                  color: state === 'done' ? '#16a34a' : '#0f172a',
                  background: state === 'next' ? '#fde047' : 'transparent',
                  borderRadius: state === 'next' ? 6 : 0,
                }}>{unit.u}</span>
              );
            })}
          </div>
          {starring && (
            <div style={{ position: 'absolute', top: -34, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
              <StarLottie key={p.starAt} sizePx={84} loop={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface FlappyLettersProps {
  letters: string[];
  letterForm?: LetterForm;
  onExit: () => void;
  roomId?: string;          // set when joining an online room via link
  playerRole?: '1' | '2';   // '2' = the joining guest
}

const FlappyLettersGame = ({ letters, letterForm = 'isolated', onExit, roomId: propRoomId, playerRole }: FlappyLettersProps) => {
  const isP2 = playerRole === '2';
  const pool = letters.length ? letters : ARABIC_LETTERS; // distractor letters
  const D = GAME_CONFIG.difficulty;

  const [phase, setPhase] = useState<Phase>('menu');
  const [, setTick] = useState(0);
  const [mode, setMode] = useState<1 | 2 | 'online'>(1);
  // ── Online 2P (host creates a room; guest joins via link/QR) ──
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(null);
  const [p2Joined, setP2Joined] = useState(false);
  const [guestJoined, setGuestJoined] = useState(false);   // guest pressed Join
  const [gotFirstSnap, setGotFirstSnap] = useState(false); // guest received state
  const [qrOpen, setQrOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [directPath, setDirectPath] = useState(false);
  const channelRef = useRef<P2PGameChannel | null>(null);
  const guestInfoRef = useRef<{ name: string; charId: string } | null>(null);
  const snapRef = useRef<{ s: NetSnapshot; at: number } | null>(null);
  const [p1Char, setP1Char] = useState(GAME_CONFIG.characters[0].id);
  const [p2Char, setP2Char] = useState(GAME_CONFIG.characters[1].id);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [menuStep, setMenuStep] = useState<1 | 2>(1); // pick player 1 first, then player 2
  const [bgUrl, setBgUrl] = useState<string>(GAME_CONFIG.backgrounds[0]);
  const [countNum, setCountNum] = useState('3');
  const countRef = useRef('3');
  useEffect(() => { countRef.current = countNum; }, [countNum]);

  const phaseRef = useRef<Phase>('menu');
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const modeRef = useRef<1 | 2 | 'online'>(1);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const isOnline = mode === 'online' || isP2;

  const fieldRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef(16 / 9); // field width / height — for circle collisions
  // The field is position:fixed inset:0, so viewport size IS field size.
  // Measured on resize only — reading layout inside the rAF loop causes
  // forced reflows (a major jank source).
  useEffect(() => {
    const measure = () => { if (window.innerHeight > 0) aspectRef.current = window.innerWidth / window.innerHeight; };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ── Word pool: Qaedah lists (all topics) merged over the built-in fallback ──
  const tiersRef = useRef<WordTiers>(buildTiers(FALLBACK_WORDS));
  useEffect(() => {
    let cancelled = false;
    listAllQaedahWords().then(words => {
      if (cancelled || !words.length) return;
      const merged = buildTiers([...words, ...FALLBACK_WORDS]);
      // keep a tier only if the Qaedah+fallback mix still has enough variety
      ([3, 4, 5] as const).forEach(n => { if (merged[n].length >= 4) tiersRef.current[n] = merged[n]; });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── Mutable game model (read/written inside the rAF loop) ──────────────────
  const game = useRef({
    players: [] as Flyer[],
    bubbles: [] as Bubble[],
    dragons: [] as Dragon[],
    scrolledSinceCluster: 999, // spawn a column immediately
    scrolledSinceDragon: 0,
    bubbleSeq: 0,
    dragonSeq: 0,
    bgShift: 0,                // accumulated background scroll (width-%)
    endMsg: '',
    winnerIdx: -1 as number,
  });
  const timersRef = useRef<number[]>([]);
  const after = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  // ── Sound effects (Web Audio) ───────────────────────────────────────────────
  const acRef = useRef<AudioContext | null>(null);
  const tone = useCallback((freqs: number[], dur = 0.14, type: OscillatorType = 'sine', vol = 0.18) => {
    try {
      const ac = acRef.current ?? (acRef.current = new (window.AudioContext || (window as any).webkitAudioContext)());
      freqs.forEach((f, i) => {
        const o = ac.createOscillator(); const g = ac.createGain();
        o.type = type; o.frequency.value = f;
        const t0 = ac.currentTime + i * dur;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(ac.destination);
        o.start(t0); o.stop(t0 + dur);
      });
    } catch { /* audio unavailable */ }
  }, []);
  const sfxCollect = useCallback(() => tone([523, 659], 0.09, 'sine', 0.2), [tone]);
  const sfxWrong   = useCallback(() => tone([200, 140], 0.14, 'sawtooth', 0.15), [tone]);
  const sfxCrash   = useCallback(() => tone([220, 150, 90], 0.12, 'sawtooth', 0.2), [tone]);
  const sfxFlap    = useCallback(() => tone([340], 0.05, 'triangle', 0.06), [tone]);
  const sfxCount   = useCallback(() => tone([440], 0.12, 'square', 0.14), [tone]);
  const sfxGo      = useCallback(() => tone([880], 0.25, 'square', 0.16), [tone]);
  const sfxStar    = useCallback(() => tone([523, 659, 784, 1047], 0.11, 'sine', 0.22), [tone]);

  // ── Difficulty as a function of TOTAL stars earned this run ────────────────
  const totalStars  = () => game.current.players.reduce((s, p) => s + p.stars, 0);
  const speedNow    = (s: number) => Math.min(D.maxSpeed, D.baseSpeed + D.speedRampPerStar * s);
  const spacingNow  = (s: number) => D.clusterSpacing * Math.max(D.spacingMinRatio, 1 - D.spacingShrinkPerStar * s);
  const emptiesNow  = (s: number) => Math.max(D.emptySlotsMin, D.emptySlotsStart - Math.floor(s / D.tightenEvery));
  const dragonGapNow = (s: number) => Math.max(D.dragonGapMin, D.dragonGapStart * (1 - D.dragonGapShrinkPerStar * s));

  // ── Deal a word to a player (shared length tier; ≠ the other's word) ────────
  const dealWord = useCallback((pIdx: number) => {
    const g = game.current;
    const p = g.players[pIdx];
    const tier = tiersRef.current[lengthForStars(g.players.reduce((s, pl) => s + pl.stars, 0))];
    const other = g.players[1 - pIdx]?.word;
    const candidates = tier.filter(w => w !== p.word && w !== other);
    const word = (candidates.length ? candidates : tier)[Math.floor(Math.random() * (candidates.length ? candidates.length : tier.length))];
    p.word = word;
    p.seq = baseLetters(word);
    p.seqPos = 0;
  }, []);

  // ── Lifecycle: set up a fresh run (used by Start and Restart) ───────────────
  const startRun = useCallback(() => {
    timersRef.current.forEach(clearTimeout); timersRef.current = [];
    const mkFlyer = (name: string, x: number, y: number, charId: string): Flyer => ({
      name, x, y, vy: 0, alive: true, stars: 0,
      word: '', seq: [], seqPos: 0, graceUntil: 0, failAt: 0, starAt: 0,
      diedAt: 0, flapAt: 0, charId,
    });
    const players: Flyer[] = [mkFlyer(p1Name.trim() || 'Player 1', P1_X, 46, p1Char)];
    if (modeRef.current === 2) players.push(mkFlyer(p2Name.trim() || 'Player 2', P2_X, 54, p2Char));
    else if (modeRef.current === 'online') {
      const gi = guestInfoRef.current;
      if (!gi) return; // can't start before the guest joins
      players.push(mkFlyer(gi.name, P2_X, 54, gi.charId));
    }
    game.current = {
      players,
      bubbles: [],
      dragons: [],
      scrolledSinceCluster: 999,
      scrolledSinceDragon: -40, // breathing room before the first dragon
      bubbleSeq: 0,
      dragonSeq: 0,
      bgShift: 0,
      endMsg: '',
      winnerIdx: -1,
    };
    players.forEach((_, i) => dealWord(i));
    setBgUrl(GAME_CONFIG.backgrounds[Math.floor(Math.random() * GAME_CONFIG.backgrounds.length)]);
    // 3…2…1… countdown, then the birds drop and it's on
    setPhase('count');
    setCountNum('3'); sfxCount();
    after(800,  () => { setCountNum('2'); sfxCount(); });
    after(1600, () => { setCountNum('1'); sfxCount(); });
    after(2400, () => { sfxGo(); setPhase('play'); });
  }, [p1Char, p2Char, p1Name, p2Name, dealWord, after, sfxCount, sfxGo]);

  const endRun = useCallback(() => {
    const g = game.current;
    const stars = g.players.map(p => p.stars);
    if (g.players.length === 1) {
      g.endMsg = stars[0] > 0 ? `${stars[0]} star${stars[0] === 1 ? '' : 's'} earned!` : 'Crashed!';
      g.winnerIdx = stars[0] > 0 ? 0 : -1;
    } else if (stars[0] === stars[1]) {
      g.endMsg = "It's a tie!";
      g.winnerIdx = -1;
    } else {
      const w = stars[0] > stars[1] ? 0 : 1;
      g.endMsg = `${g.players[w].name} wins!`;
      g.winnerIdx = w;
    }
    setPhase('over');
    if (g.winnerIdx >= 0) sfxStar();
  }, [sfxStar]);

  // ── Letter grab: right letter advances the word; wrong letter burns it ─────
  const grabLetter = useCallback((pIdx: number, bubble: Bubble) => {
    const g = game.current;
    const p = g.players[pIdx];
    const now = performance.now();
    if (bubble.letter === p.seq[p.seqPos]) {
      bubble.taken = true; bubble.takenAt = now;
      p.seqPos++;
      sfxCollect();
      if (p.seqPos >= p.seq.length) {
        p.stars++; p.starAt = now;
        sfxStar();
        if (p.stars >= D.starsToWin) {
          // first to the target wins — game over right here
          g.endMsg = g.players.length === 1 ? `You did it — ${D.starsToWin} stars! 🏆` : `${p.name} wins!`;
          g.winnerIdx = pIdx;
          setPhase('over');
          return;
        }
        dealWord(pIdx); // next word (length follows the star schedule)
      }
    } else {
      if (now < p.graceUntil) return; // just failed — don't chain-punish
      bubble.taken = true; bubble.takenAt = now; bubble.wrong = true;
      p.failAt = now;
      p.graceUntil = now + D.wrongGraceMs;
      sfxWrong();
      dealWord(pIdx); // lose the chance — fresh word, same length
    }
  }, [dealWord, sfxCollect, sfxStar, sfxWrong, D.wrongGraceMs]);

  const eliminate = useCallback((pIdx: number) => {
    const g = game.current;
    const p = g.players[pIdx];
    if (!p.alive) return;
    p.alive = false; p.diedAt = performance.now(); p.vy = Math.max(p.vy, 10);
    sfxCrash();
    if (g.players.every(pl => !pl.alive)) {
      after(700, () => { if (phaseRef.current === 'play') endRun(); });
    }
  }, [after, endRun, sfxCrash]);

  // ── Column spawner: each alive player's NEXT letter + distractors ───────────
  const spawnCluster = useCallback(() => {
    const g = game.current;
    const needed = [...new Set(g.players.filter(p => p.alive).map(p => p.seq[p.seqPos]).filter(Boolean))];
    if (!needed.length) return;
    const slots = shuffle(D.slotsY.map((y, i) => ({ y, i })));
    const empties = emptiesNow(totalStars());
    const filled = slots.slice(0, Math.max(needed.length, slots.length - empties));
    const neededSlots = filled.slice(0, needed.length);
    const distractorPool = [...new Set([...pool, ...ARABIC_LETTERS])].filter(l => !needed.includes(l));
    filled.forEach(slot => {
      const nIdx = neededSlots.indexOf(slot);
      const letter = nIdx >= 0 ? needed[nIdx] : distractorPool[Math.floor(Math.random() * distractorPool.length)];
      g.bubbles.push({
        id: g.bubbleSeq++,
        letter,
        x: 106 + (Math.random() * 6 - 3),          // slight jitter → organic cluster
        y: slot.y,
        color: BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)],
        taken: false, takenAt: 0,
      });
    });
  }, [pool, D]);

  const spawnDragon = useCallback(() => {
    const g = game.current;
    g.dragons.push({ id: g.dragonSeq++, x: 112, y: 14 + Math.random() * 66 });
  }, []);

  // Dev-only test hook (vite dev server only; stripped from prod builds)
  if ((import.meta as any).env?.DEV) {
    (window as any).__flappyTest = { game, grabLetter, dealWord, eliminate, channelRef, snapRef, guestInfoRef };
  }

  // ── Flap input ──────────────────────────────────────────────────────────────
  // Local flap: on the host, pIdx 0 = own bird and 1 = the remote guest's bird
  // (driven by received 'flap' events). On the guest, everything maps to its
  // own bird (players[1]) — applied locally for instant feel (client-side
  // prediction) AND sent to the host on the reliable channel.
  const flap = useCallback((pIdx: number) => {
    if (phaseRef.current !== 'play') return;
    const g = game.current;
    const idx = isP2 ? 1 : modeRef.current === 1 ? 0 : pIdx;
    const p = g.players[idx];
    if (!p || !p.alive) return;
    p.vy = D.flapVy;
    p.flapAt = performance.now();
    sfxFlap();
    if (isP2) channelRef.current?.send({ type: 'broadcast', event: 'flap', payload: {} });
  }, [D.flapVy, sfxFlap, isP2]);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  const isP2RefConst = isP2; // stable for the listener below
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return; // typing a name
      const online = modeRef.current === 'online' || isP2RefConst;
      if (e.code === 'ShiftLeft') { e.preventDefault(); flap(0); }
      else if (e.code === 'ShiftRight') { e.preventDefault(); if (!(modeRef.current === 'online' && !isP2RefConst)) flap(1); }
      else if (e.code === 'Space' && online) {
        // online: each player's own Space bar is their flap key
        e.preventDefault();
        flap(isP2RefConst ? 1 : 0);
      }
      else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        const ph = phaseRef.current;
        if (ph === 'play' && !online) setPhase('paused');
        else if (ph === 'paused') setPhase('play');
        else if (ph === 'over' && !isP2RefConst) startRun();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [flap, startRun]);

  // ── Touch: tap ANYWHERE on the screen to flap (iPad-friendly — HUD panels
  // and overlays don't swallow the tap; only real buttons do). Local 2P still
  // splits the screen into left/right halves.
  const onScreenPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest?.('button, input')) return; // let buttons be buttons
    if (phaseRef.current !== 'play') return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const leftHalf = (e.clientX - rect.left) < rect.width / 2;
    if (isP2 || modeRef.current === 'online') { flap(isP2 ? 1 : 0); return; } // online: whole screen = your bird
    flap(modeRef.current === 1 ? 0 : (leftHalf ? 0 : 1));
  }, [flap, isP2]);

  // ── Main loop (delta-time based, 60fps target) — host/local only ───────────
  useEffect(() => {
    if (isP2) return; // the guest runs its own prediction loop below
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.035, (now - last) / 1000); // clamp long frames
      last = now;
      const ph = phaseRef.current;
      const g = game.current;

      if (ph === 'count') {
        // gentle hover during the countdown; the scenery drifts
        g.players.forEach((p, i) => { p.y = (i === 0 ? 46 : 54) + Math.sin(now / 400 + i * 2) * 2.2; p.vy = 0; });
        g.bgShift += 1.5 * dt;
        setTick(t => t + 1);
        return;
      }
      if (ph !== 'play') return; // menu/over/paused are static — no re-render

      const stars = totalStars();
      const speed = speedNow(stars);
      const aspect = aspectRef.current;

      // physics + collisions
      g.players.forEach((p, i) => {
        p.vy = Math.min(D.maxFallVy, p.vy + D.gravity * dt);
        p.y += p.vy * dt;
        if (!p.alive) return;
        const r = charById(p.charId).hitboxR;
        // top and bottom are SOFT: the bird rests on the ground / bumps the
        // ceiling instead of dying — only dragons are deadly.
        if (p.y + r >= GROUND_Y) { p.y = GROUND_Y - r; p.vy = Math.min(0, p.vy); }
        if (p.y - r <= CEILING_Y) { p.y = CEILING_Y + r; p.vy = Math.max(0, p.vy); }
        // dragons are deadly
        for (const d of g.dragons) {
          const dx = (d.x - p.x) * aspect;
          const dy = d.y - p.y;
          const rr = GAME_CONFIG.obstacle.hitboxR + r;
          if (dx * dx + dy * dy <= rr * rr) { eliminate(i); return; }
        }
        // letters advance (or burn) the word — never deadly
        for (const b of g.bubbles) {
          if (b.taken) continue;
          const dx = (b.x - p.x) * aspect;
          const dy = b.y - p.y;
          if (dx * dx + dy * dy <= (D.bubbleR + r) * (D.bubbleR + r)) {
            grabLetter(i, b);
            break;
          }
        }
      });

      // world scroll + spawning (background at 0.55× = parallax depth)
      const dx = speed * dt;
      g.bgShift += dx * 0.55;
      g.bubbles.forEach(b => { b.x -= dx; });
      g.bubbles = g.bubbles.filter(b => b.x > -12 && (!b.taken || now - b.takenAt < 450));
      const ddx = dx * D.dragonSpeedFactor;
      g.dragons.forEach(d => { d.x -= ddx; });
      g.dragons = g.dragons.filter(d => d.x > -18);
      g.scrolledSinceCluster += dx;
      if (g.scrolledSinceCluster >= spacingNow(stars)) {
        g.scrolledSinceCluster = 0;
        spawnCluster();
      }
      g.scrolledSinceDragon += dx;
      if (g.scrolledSinceDragon >= dragonGapNow(stars)) {
        g.scrolledSinceDragon = 0;
        spawnDragon();
      }

      setTick(t => t + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [D, grabLetter, eliminate, spawnCluster, spawnDragon, isP2]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ONLINE — HOST side: room channel, remote flaps, 30Hz snapshots
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isP2 || mode !== 'online') return;
    const id = onlineRoomId ?? crypto.randomUUID();
    if (!onlineRoomId) { setOnlineRoomId(id); return; } // re-run with the id set
    const ch = createGameChannel(`flappy-letters:${id}`, 'host');
    ch.onPathChange(setDirectPath);
    ch.on('broadcast', { event: 'ready' }, ({ payload }: { payload: { name: string; charId: string } }) => {
      guestInfoRef.current = { name: payload.name || 'Player 2', charId: payload.charId };
      setP2Joined(true);
      // if a run is already set up, refresh P2's identity live
      const g = game.current;
      if (g.players[1]) { g.players[1].name = guestInfoRef.current.name; g.players[1].charId = payload.charId; }
    });
    ch.on('broadcast', { event: 'flap' }, () => { flap(1); });
    ch.subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
  }, [mode, isP2, onlineRoomId, flap]);

  // Host → guest snapshots (both the 'fast' P2P channel and the fallback ride
  // through the same send() — see p2pGameChannel).
  useEffect(() => {
    if (isP2 || mode !== 'online' || phase === 'menu' || !channelRef.current) return;
    const iv = setInterval(() => {
      const g = game.current;
      if (!g.players.length) return;
      const now = performance.now();
      const snap: NetSnapshot = {
        ph: phaseRef.current,
        cn: countRef.current,
        bg: bgUrl,
        speed: speedNow(g.players.reduce((s, p) => s + p.stars, 0)),
        em: g.endMsg, wi: g.winnerIdx,
        ps: g.players.map(p => ({
          x: p.x, y: p.y, vy: p.vy, alive: p.alive, stars: p.stars,
          word: p.word, seqPos: p.seqPos, name: p.name, charId: p.charId,
          failAge: Math.min(2000, now - p.failAt), starAge: Math.min(2000, now - p.starAt),
        })),
        bs: g.bubbles.filter(b => !b.taken || now - b.takenAt < 400).map(b => ({ id: b.id, letter: b.letter, x: b.x, y: b.y, color: b.color, taken: b.taken })),
        ds: g.dragons,
      };
      channelRef.current?.send({ type: 'broadcast', event: 'state', payload: snap });
    }, SNAPSHOT_MS);
    return () => clearInterval(iv);
  }, [mode, isP2, phase, bgUrl]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ONLINE — GUEST side: join, receive snapshots, predict own bird
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isP2 || !propRoomId || !guestJoined) return;
    const ch = createGameChannel(`flappy-letters:${propRoomId}`, 'guest');
    ch.onPathChange(setDirectPath);
    ch.on('broadcast', { event: 'state' }, ({ payload }: { payload: NetSnapshot }) => {
      const now = performance.now();
      snapRef.current = { s: payload, at: now };
      setGotFirstSnap(true);
      const g = game.current;
      // (re)build local flyers to match the host's
      while (g.players.length < payload.ps.length) {
        g.players.push({ name: '', x: payload.ps[g.players.length].x, y: payload.ps[g.players.length].y, vy: 0, alive: true, stars: 0, word: '', seq: [], seqPos: 0, graceUntil: 0, failAt: 0, starAt: 0, diedAt: 0, flapAt: 0, charId: GAME_CONFIG.characters[0].id });
      }
      payload.ps.forEach((sp, i) => {
        const p = g.players[i];
        const wordChanged = p.word !== sp.word;
        p.name = sp.name; p.charId = sp.charId; p.alive = sp.alive; p.stars = sp.stars;
        p.word = sp.word; p.seqPos = sp.seqPos;
        if (wordChanged) p.seq = baseLetters(sp.word);
        p.failAt = now - sp.failAge; p.starAt = now - sp.starAge;
        if (i === 0) { /* host bird: interpolated in the guest loop */ }
        else {
          // own bird: reconcile prediction toward authority
          const err = Math.abs(p.y - sp.y);
          if (err > RECONCILE_SNAP || !sp.alive || phaseRef.current !== 'play') { p.y = sp.y; p.vy = sp.vy; }
        }
      });
      g.bubbles = payload.bs.map(b => ({ ...b, takenAt: b.taken ? now : 0 }));
      g.dragons = payload.ds;
      g.endMsg = payload.em; g.winnerIdx = payload.wi;
      if (payload.bg !== bgUrlRef.current) setBgUrl(payload.bg);
      if (payload.cn && payload.cn !== countRef.current) setCountNum(payload.cn);
      if (payload.ph !== phaseRef.current) setPhase(payload.ph);
    });
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        const send = () => ch.send({ type: 'broadcast', event: 'ready', payload: { name: p2Name.trim() || 'Player 2', charId: p2Char } });
        send();
        const iv = setInterval(() => { if (snapRef.current) clearInterval(iv); else send(); }, 2500);
        timersRef.current.push(iv as unknown as number);
      }
    });
    channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isP2, propRoomId, guestJoined]);

  const bgUrlRef = useRef(bgUrl);
  useEffect(() => { bgUrlRef.current = bgUrl; }, [bgUrl]);

  // Guest render loop: own bird = local physics (prediction), host bird =
  // interpolation, bubbles/dragons = dead-reckoning between snapshots.
  useEffect(() => {
    if (!isP2) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.035, (now - last) / 1000);
      last = now;
      const g = game.current;
      const snap = snapRef.current;
      if (!snap || !g.players.length) return;
      const ph = phaseRef.current;
      if (ph !== 'play' && ph !== 'count') { setTick(t => t + 1); return; }
      const [sp1, sp2] = snap.s.ps;
      // host bird: smooth interpolation toward the latest snapshot
      if (sp1) { g.players[0].x = sp1.x; g.players[0].y += (sp1.y - g.players[0].y) * P1_LERP; }
      // own bird: local physics + gentle reconcile
      const me = g.players[1];
      if (me && sp2) {
        if (ph === 'play' && me.alive) {
          me.vy = Math.min(D.maxFallVy, me.vy + D.gravity * dt);
          me.y += me.vy * dt;
          me.y += (sp2.y - me.y) * RECONCILE_NUDGE;
          const mr = charById(me.charId).hitboxR;
          me.y = Math.max(CEILING_Y + mr, Math.min(GROUND_Y - mr, me.y));
          if (me.y >= GROUND_Y - mr) me.vy = Math.min(0, me.vy);
        } else {
          me.y += (sp2.y - me.y) * P1_LERP; me.vy = sp2.vy;
        }
        me.x = sp2.x;
      }
      // world dead-reckoning at the host's speed
      if (ph === 'play') {
        const dx = snap.s.speed * dt;
        g.bubbles.forEach(b => { b.x -= dx; });
        g.dragons.forEach(d => { d.x -= dx * D.dragonSpeedFactor; });
        g.bgShift += dx * 0.55;
      } else {
        g.bgShift += 1.5 * dt;
      }
      setTick(t => t + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isP2, D]);

  // cleanup timers/audio on unmount
  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    acRef.current?.close().catch(() => {});
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  const g = game.current;
  const shareLink = onlineRoomId ? `${ONLINE_SITE_URL}/flappy-letters/${onlineRoomId}` : '';
  const copyLink = () => { navigator.clipboard?.writeText(shareLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }).catch(() => {}); };

  return (
    <div
      dir="ltr"
      onPointerDown={onScreenPointerDown}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, overflow: 'hidden', userSelect: 'none',
        background: 'linear-gradient(#7dd3fc 0%, #bae6fd 45%, #e0f2fe 75%, #f0f9ff 100%)',
        touchAction: 'manipulation',
      }}
    >
      {/* pixel-art scenery — a tiling strip moved with translate3d so the
          scroll runs on the compositor (animating background-position repaints
          the whole viewport every frame = jank). */}
      {(() => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
        const tileW = vh * (576 / 324); // scene images are 576×324
        const shiftPx = (g.bgShift / 100) * vw;
        return (
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0,
              width: vw + 2 * tileW,
              backgroundImage: `url(${bgUrl})`,
              backgroundRepeat: 'repeat-x',
              backgroundSize: 'auto 100%',
              imageRendering: 'pixelated',
              transform: `translate3d(${-(shiftPx % tileW)}px, 0, 0)`,
              willChange: 'transform',
            }} />
          </div>
        );
      })()}

      {/* ── Field ── */}
      <div ref={fieldRef} style={{ position: 'absolute', inset: 0 }}>
        {/* ceiling + ground danger zones (scene-agnostic overlays) */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${CEILING_Y}%`, background: 'linear-gradient(#0f172a88,#0f172a00)' }} />
        <div style={{
          position: 'absolute', left: 0, right: 0, top: `${GROUND_Y}%`, bottom: 0,
          background: 'linear-gradient(rgba(15,23,42,0.18), rgba(15,23,42,0.5))',
          borderTop: '3px solid rgba(255,255,255,0.85)',
        }} />

        {/* letter bubbles */}
        {(phase !== 'menu') && g.bubbles.map(b => {
          return (
            <div key={b.id} style={{
              position: 'absolute', left: 0, top: 0,
              transform: `translate3d(${b.x}vw, ${b.y}vh, 0) translate(-50%, -50%) scale(${b.taken ? (b.wrong ? 0.4 : 1.6) : 1})`,
              opacity: b.taken ? 0 : 1,
              willChange: 'transform',
              transition: b.taken ? 'transform 0.4s ease, opacity 0.4s ease' : undefined,
              width: `${D.bubbleR * 2}vh`, height: `${D.bubbleR * 2}vh`,
              maxWidth: 96, maxHeight: 96,
              borderRadius: '50%',
              background: `radial-gradient(circle at 32% 28%, #ffffffee 0%, ${b.color} 55%)`,
              border: '3px solid #ffffffcc',
              boxShadow: '0 6px 16px rgba(2,6,23,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span dir="rtl" style={{ ...HAFS, fontSize: `${D.bubbleR * 1.05}vh`, lineHeight: 1, color: '#0f172a', fontWeight: 700 }}>
                {getLetterInForm(b.letter, letterForm)}
              </span>
            </div>
          );
        })}

        {/* dragons — the only deadly obstacle, flying right → left */}
        {(phase !== 'menu') && g.dragons.map(d => (
          <div key={d.id} style={{
            position: 'absolute', left: 0, top: 0,
            transform: `translate3d(${d.x}vw, ${d.y}vh, 0) translate(-50%, -50%)`,
            willChange: 'transform',
            filter: 'drop-shadow(0 4px 8px rgba(2,6,23,0.3))',
          }}>
            <CharacterSprite char={GAME_CONFIG.obstacle} heightPx={Math.round(window.innerHeight * GAME_CONFIG.obstacle.size / 100)} />
          </div>
        ))}

        {/* flyers */}
        {(phase !== 'menu') && g.players.map((p, i) => {
          const c = charById(p.charId);
          const tilt = Math.max(-24, Math.min(55, p.vy * 0.55));
          const justFlapped = performance.now() - p.flapAt < 130;
          return (
            <div key={i} style={{
              position: 'absolute', left: 0, top: 0,
              transform: `translate3d(${p.x}vw, ${p.y}vh, 0) translate(-50%, -50%) rotate(${p.alive ? tilt : 90}deg) scale(${justFlapped ? 1.12 : 1})`,
              opacity: p.alive ? 1 : 0.55,
              willChange: 'transform',
              filter: p.alive ? 'drop-shadow(0 4px 6px rgba(2,6,23,0.25))' : 'grayscale(0.8)',
            }}>
              <CharacterSprite char={c} heightPx={Math.round(window.innerHeight * c.size / 100)} />
            </div>
          );
        })}
      </div>

      {/* ── HUD: player 1 panel on the LEFT, player 2 on the RIGHT ── */}
      {phase !== 'menu' && (
        <>
          <div style={{ position: 'absolute', top: 10, left: 10, pointerEvents: 'none' }}>
            {g.players[0] && <PlayerPanel p={g.players[0]} color={PLAYER_COLORS[0]} align="start" starsToWin={D.starsToWin} />}
          </div>
          {g.players[1] && (
            <div style={{ position: 'absolute', top: 10, right: 10, pointerEvents: 'none' }}>
              <PlayerPanel p={g.players[1]} color={PLAYER_COLORS[1]} align="end" starsToWin={D.starsToWin} />
            </div>
          )}
          <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
            <button onClick={onExit} style={{
              background: '#0f172acc', color: '#fff', border: 'none', borderRadius: 12,
              padding: '7px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 13,
            }}>← Exit</button>
            {!isP2 && (phase === 'play' || phase === 'paused') && (
              <button onClick={startRun} title="Restart the round" style={{
                background: '#16a34acc', color: '#fff', border: 'none', borderRadius: 12,
                padding: '7px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 13,
              }}>↻ Restart</button>
            )}
          </div>
        </>
      )}

      {/* ── Countdown ── */}
      {phase === 'count' && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '38%', textAlign: 'center', pointerEvents: 'none' }}>
          <div key={countNum} style={{ fontSize: 'clamp(72px,14vw,150px)', fontWeight: 900, color: '#fff', textShadow: '0 6px 24px rgba(2,6,23,0.55)', animation: 'flCountPop 0.75s ease' }}>
            {countNum}
          </div>
          <div style={{ display: 'inline-block', background: '#0f172acc', color: '#fff', borderRadius: 16, padding: '10px 20px', fontWeight: 900, fontSize: 'clamp(13px,2vw,18px)', marginTop: 6 }}>
            {isOnline ? 'Press SPACE to flap — catch YOUR word’s letters in order!' : mode === 2 ? '⇧ Left / Right Shift to flap — catch YOUR word’s letters in order!' : 'Catch your word’s letters in order — dodge the dragons!'}
          </div>
        </div>
      )}
      <style>{`@keyframes flCountPop { 0% { transform: scale(2.2); opacity: 0; } 40% { transform: scale(1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }`}</style>

      {/* ── Paused ── */}
      {phase === 'paused' && (
        <div style={{ position: 'absolute', inset: 0, background: '#0f172a66', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 22, padding: '26px 34px', textAlign: 'center', boxShadow: '0 18px 50px rgba(2,6,23,0.4)' }}>
            <div style={{ fontWeight: 900, fontSize: 24, color: '#0f172a', marginBottom: 14 }}>Paused</div>
            <button onClick={() => setPhase('play')} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 22px', fontWeight: 900, fontSize: 16, cursor: 'pointer', marginRight: 8 }}>▶ Resume</button>
            <button onClick={onExit} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 14, padding: '10px 22px', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>Exit</button>
          </div>
        </div>
      )}

      {/* ── Menu ── */}
      {phase === 'menu' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(#0c4a6e, #082f49)' }}>
          <div style={{ textAlign: 'center', padding: 16, maxHeight: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 'clamp(30px,5vw,52px)', fontWeight: 900, color: '#fff', marginBottom: 4 }}>
              🐦 Flappy Letters
            </div>
            <div style={{ color: '#7dd3fc', fontWeight: 700, fontSize: 'clamp(13px,1.8vw,17px)', marginBottom: 18 }}>
              Catch your word&rsquo;s letters in order — first to 10 ⭐ wins. Dodge the dragons!
            </div>

            {!isP2 && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
                {([1, 2, 'online'] as const).map(m => (
                  <button key={String(m)} onClick={() => { setMode(m); setMenuStep(1); }} style={{
                    background: mode === m ? '#0ea5e9' : '#ffffff18', color: '#fff', border: mode === m ? '3px solid #7dd3fc' : '3px solid transparent',
                    borderRadius: 16, padding: '10px 22px', fontWeight: 900, fontSize: 16, cursor: 'pointer',
                  }}>
                    {m === 1 ? '1 Player' : m === 2 ? '2 Players' : '🌐 Online'}
                  </button>
                ))}
              </div>
            )}

            {/* one player configures at a time: player 1 first, then player 2 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              {isP2 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <input
                    value={p2Name}
                    onChange={e => setP2Name(e.target.value)}
                    placeholder="Your name"
                    maxLength={16}
                    style={{ background: '#ffffff14', border: '2px solid #fbbf24', color: '#fff', borderRadius: 14, padding: '10px 16px', fontWeight: 800, fontSize: 15, textAlign: 'center', outline: 'none', width: 240 }}
                  />
                  <CharPicker value={p2Char} onChange={setP2Char} color="#fbbf24" label="Pick your bird" />
                </div>
              ) : menuStep === 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <input
                    value={p1Name}
                    onChange={e => setP1Name(e.target.value)}
                    placeholder={mode === 2 ? 'Player 1 — your name' : 'Your name'}
                    maxLength={16}
                    style={{ background: '#ffffff14', border: '2px solid #38bdf8', color: '#fff', borderRadius: 14, padding: '10px 16px', fontWeight: 800, fontSize: 15, textAlign: 'center', outline: 'none', width: 240 }}
                  />
                  <CharPicker value={p1Char} onChange={setP1Char} excluded={mode === 2 ? p2Char : undefined} color="#38bdf8"
                    label={mode === 2 ? `${p1Name.trim() || 'Player 1'} (Left ⇧) — pick your bird` : 'Pick your bird'} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <input
                    value={p2Name}
                    onChange={e => setP2Name(e.target.value)}
                    placeholder="Player 2 — your name"
                    maxLength={16}
                    style={{ background: '#ffffff14', border: '2px solid #fbbf24', color: '#fff', borderRadius: 14, padding: '10px 16px', fontWeight: 800, fontSize: 15, textAlign: 'center', outline: 'none', width: 240 }}
                  />
                  <CharPicker value={p2Char} onChange={setP2Char} excluded={p1Char} color="#fbbf24"
                    label={`${p2Name.trim() || 'Player 2'} (Right ⇧) — pick your bird`} />
                </div>
              )}
            </div>

            {/* online host: share link + QR + join status */}
            {!isP2 && mode === 'online' && onlineRoomId && (
              <div style={{ background: '#ffffff10', borderRadius: 18, padding: '12px 16px', maxWidth: 430, margin: '0 auto 14px' }}>
                <div style={{ color: '#7dd3fc', fontWeight: 800, fontSize: 12, marginBottom: 6 }}>Share this link with Player 2:</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ flex: 1, background: '#ffffff14', borderRadius: 10, padding: '7px 10px', fontSize: 10, color: '#cbd5e1', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareLink}</div>
                  <button onClick={copyLink} style={{ background: linkCopied ? '#22c55e' : '#0ea5e9', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 12px', fontWeight: 900, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{linkCopied ? '✓ Copied' : 'Copy'}</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 10 }}>
                  <button onClick={() => setQrOpen(true)} style={{ background: '#fff', border: 'none', borderRadius: 12, padding: 6, cursor: 'pointer' }} title="Tap to enlarge">
                    <QRCodeSVG value={shareLink} size={110} level="M" />
                  </button>
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>Tap the QR to enlarge · scan to join 📱</span>
                </div>
                {p2Joined
                  ? <div style={{ color: '#4ade80', fontWeight: 900, fontSize: 13, marginTop: 8 }}>✅ {guestInfoRef.current?.name} joined — ready to fly!</div>
                  : <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: 12, marginTop: 8 }}>⏳ Waiting for Player 2…</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
              {menuStep === 2 && (
                <button onClick={() => setMenuStep(1)} style={{ background: '#ffffff18', color: '#fff', border: 'none', borderRadius: 16, padding: '13px 22px', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>← Back</button>
              )}
              {isP2 ? (
                <button onClick={() => setGuestJoined(true)} disabled={guestJoined} style={{
                  background: guestJoined ? '#475569' : 'linear-gradient(160deg,#f59e0b,#d97706)', color: '#fff', border: 'none',
                  borderRadius: 18, padding: '14px 44px', fontWeight: 900, fontSize: 20, cursor: guestJoined ? 'default' : 'pointer',
                  boxShadow: guestJoined ? 'none' : '0 10px 30px rgba(245,158,11,0.4)',
                }}>{guestJoined ? (gotFirstSnap ? '✅ Connected — waiting for host…' : '⏳ Joining…') : '🔗 Join game'}</button>
              ) : mode === 2 && menuStep === 1 ? (
                <button onClick={() => setMenuStep(2)} style={{
                  background: 'linear-gradient(160deg,#0ea5e9,#0284c7)', color: '#fff', border: 'none',
                  borderRadius: 18, padding: '14px 44px', fontWeight: 900, fontSize: 20, cursor: 'pointer',
                  boxShadow: '0 10px 30px rgba(14,165,233,0.4)',
                }}>Next → Player 2</button>
              ) : (
                <button onClick={startRun} disabled={mode === 'online' && !p2Joined} style={{
                  background: (mode === 'online' && !p2Joined) ? '#475569' : 'linear-gradient(160deg,#22c55e,#16a34a)', color: '#fff', border: 'none',
                  borderRadius: 18, padding: '14px 44px', fontWeight: 900, fontSize: 20, cursor: (mode === 'online' && !p2Joined) ? 'default' : 'pointer',
                  boxShadow: (mode === 'online' && !p2Joined) ? 'none' : '0 10px 30px rgba(34,197,94,0.4)',
                }}>▶ Start</button>
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <button onClick={onExit} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>← Back to letters</button>
            </div>
          </div>
        </div>
      )}

      {/* enlarged QR */}
      {qrOpen && (
        <div onClick={() => setQrOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(8,15,30,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <QRCodeSVG value={shareLink} size={Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - 90, 380)} level="M" />
            <span style={{ fontSize: 14, color: '#475569', fontWeight: 800 }}>Scan to join as Player 2 🐦</span>
          </div>
          <button onClick={() => setQrOpen(false)} style={{ marginTop: 18, padding: '10px 26px', borderRadius: 999, background: '#fff', color: '#0f172a', fontWeight: 900, border: 'none', cursor: 'pointer' }}>Close ✕</button>
        </div>
      )}

      {/* connection path badge (online only) */}
      {isOnline && phase !== 'menu' && (
        <div title={directPath ? 'Direct player-to-player connection' : 'Relayed via server'} style={{ position: 'fixed', bottom: 6, left: 6, zIndex: 95, background: directPath ? '#16a34ac9' : '#475569c9', color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 800, pointerEvents: 'none' }}>
          {directPath ? '⚡ Direct' : '☁️ Relay'}
        </div>
      )}

      {/* ── Game over ── */}
      {phase === 'over' && (
        <div style={{ position: 'absolute', inset: 0, background: '#0f172a99', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 26, padding: '28px 34px', textAlign: 'center', boxShadow: '0 18px 60px rgba(2,6,23,0.5)', maxWidth: 480 }}>
            <div style={{ fontSize: 40, marginBottom: 4 }}>{g.winnerIdx >= 0 ? '🏆' : '💥'}</div>
            <div style={{ fontWeight: 900, fontSize: 26, color: '#0f172a', marginBottom: 12 }}>{g.endMsg}</div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 18 }}>
              {g.players.map((p, i) => (
                <div key={i} style={{
                  border: `3px solid ${PLAYER_COLORS[i]}`, borderRadius: 18, padding: '12px 18px',
                  background: g.winnerIdx === i ? '#f0fdf4' : '#f8fafc',
                }}>
                  <CharacterSprite char={charById(p.charId)} heightPx={52} />
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#475569', marginTop: 4, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 }}>
                    <StarLottie sizePx={26} />
                    <span style={{ fontWeight: 900, fontSize: 22, color: '#0f172a' }}>{p.stars}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: g.winnerIdx === i ? '#16a34a' : '#dc2626' }}>
                    {g.winnerIdx === i ? 'Winner!' : 'Crashed'}
                  </div>
                </div>
              ))}
            </div>
            {!isP2 && (
              <button onClick={startRun} style={{ background: 'linear-gradient(160deg,#22c55e,#16a34a)', color: '#fff', border: 'none', borderRadius: 16, padding: '12px 30px', fontWeight: 900, fontSize: 18, cursor: 'pointer', marginRight: 8 }}>
                🔄 Restart
              </button>
            )}
            {!isP2 && mode !== 'online' && (
              <button onClick={() => { setMenuStep(1); setPhase('menu'); }} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 16, padding: '12px 22px', fontWeight: 900, fontSize: 18, cursor: 'pointer', marginRight: 8 }}>
                Players
              </button>
            )}
            {isP2 && <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 10 }}>Waiting for the host to restart…</div>}
            <button onClick={onExit} style={{ background: 'transparent', color: '#64748b', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: 15 }}>
              Exit
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default FlappyLettersGame;
