import React, { useState, useEffect, useCallback, useRef } from 'react';
import lottie from 'lottie-web';
import { useI18n } from '../context/I18nProvider';
import TowerDefenseGame, { TowerDefenseRef } from './TowerDefenseGame';
import AirplaneGame from './AirplaneGame';
import LetterRaceGame from './LetterRaceGame';

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

type View = 'select' | 'practice' | 'win' | 'airplane' | 'race';
type GameChoice = 'tower' | 'airplane' | 'race';

const AlphabetTrainerPage: React.FC<{ isStudentView?: boolean; avatarSrc?: string }> = ({ isStudentView = false, avatarSrc }) => {
  const { t } = useI18n();

  const [priorities, setPriorities] = useState<number[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length === 28) return p; }
    } catch {}
    return new Array(28).fill(0);
  });

  const [childMode, setChildMode] = useState(false);
  const [view, setView] = useState<View>('select');
  const [gameChoice, setGameChoice] = useState<GameChoice>('tower');
  const [queue, setQueue] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [restartMsg, setRestartMsg] = useState('');
  const [celebrating, setCelebrating] = useState(false);
  const [popup, setPopup] = useState<{ emoji: string; text: string; phase: 'hidden' | 'in' | 'out' }>({
    emoji: '🌟', text: 'Amazing!', phase: 'hidden',
  });
  const [shaking, setShaking] = useState(false);
  const [letterForm, setLetterForm] = useState<LetterForm>('isolated');
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

  const handleLetterClick = (i: number) => {
    setPriorities(prev => { const n = [...prev]; n[i] = (n[i] + 1) % 4; return n; });
  };

  const handleStart = () => {
    if (unique === 0) return;
    if (childMode && (gameChoice === 'airplane' || gameChoice === 'race')) {
      setView(gameChoice);
      return;
    }
    const q = buildQueue(priorities);
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
      if (next >= queue.length) { if (childMode) launchConfetti(120); setView('win'); }
      return next;
    });
  };

  const handleCorrect = () => {
    if (celebrating) return;
    setRestartMsg('');
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
    consecutiveCorrect.current = 0;  // reset streak on wrong answer
    gameRef.current?.setStreak(0);
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
  const renderSelect = () => (
    <div className="max-w-3xl mx-auto px-4 pb-12 pt-2">
      {/* Instructions */}
      <p className={`text-center mb-4 ${childMode ? 'text-base font-bold text-blue-700' : 'text-sm text-slate-500 dark:text-slate-400'}`}>
        {childMode ? t('alphabetTrainer.instrChild') : t('alphabetTrainer.instrAdult')}
      </p>

      {/* Legend (adult only — child mode is self-explanatory) */}
      {!childMode && (
        <div className="flex flex-wrap justify-center gap-4 mb-5">
          {([
            { label: t('alphabetTrainer.legendNone'),   cls: 'bg-slate-100 dark:bg-gray-700 border-slate-200 dark:border-gray-600' },
            { label: t('alphabetTrainer.legendOnce'),   cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700' },
            { label: t('alphabetTrainer.legendTwice'),  cls: 'bg-amber-100 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600' },
            { label: t('alphabetTrainer.legendThrice'), cls: 'bg-amber-200 dark:bg-amber-900/50 border-amber-500' },
          ] as { label: string; cls: string }[]).map(({ label, cls }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <div className={`w-4 h-4 rounded border ${cls}`} />
              {label}
            </div>
          ))}
        </div>
      )}

      {/* ── Letter-form selector ──────────────────────────────────────────── */}
      <div className="mb-5">
        <p className={`text-center text-xs mb-2 ${childMode ? 'font-bold text-indigo-600' : 'text-slate-400 dark:text-slate-500'}`}>
          Letter shape / شَكل الحَرف
        </p>
        <div className="flex gap-2 justify-center flex-wrap">
          {FORM_CONFIG.map(({ form, labelAr, labelEn }) => {
            const active = letterForm === form;
            return (
              <button
                key={form}
                onClick={() => setLetterForm(form)}
                className={`flex flex-col items-center px-3 py-1.5 rounded-xl border-2 transition-all duration-150 select-none ${
                  active
                    ? (childMode
                        ? 'bg-indigo-500 border-indigo-400 text-white shadow-md shadow-indigo-200'
                        : 'bg-teal-600 dark:bg-amber-600 border-teal-500 dark:border-amber-500 text-white')
                    : (childMode
                        ? 'bg-white border-indigo-200 text-indigo-700 hover:border-indigo-400'
                        : 'bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-gray-400')
                }`}
              >
                <span style={{ fontFamily: "'Hafs', 'Amiri', serif", fontSize: '1.25rem', lineHeight: 1.1 }}>
                  {getLetterInForm('ب', form)}
                </span>
                <span className="text-[10px] font-bold mt-0.5" style={{ fontFamily: "'Hafs', 'Amiri', serif" }}>{labelAr}</span>
                <span className={`text-[9px] ${active ? 'opacity-80' : 'opacity-60'}`}>{labelEn}</span>
              </button>
            );
          })}
        </div>
        {/* Note about non-connecting letters when a connected form is chosen */}
        {(letterForm === 'initial' || letterForm === 'medial') && (
          <p className="text-center text-[10px] mt-2 text-slate-400 dark:text-slate-500">
            <span className="font-semibold" style={{ fontFamily: "'Hafs', 'Amiri', serif", fontSize: '0.85rem' }}>
              ا و ر ز د ذ
            </span>
            {' '}only have 2 shapes — shown as{' '}
            <span className="font-semibold">{letterForm === 'initial' ? 'Isolated' : 'End'}</span>
          </p>
        )}
      </div>

      {/* Letter Grid — 5 columns, RTL order */}
      <div className="grid grid-cols-5 gap-2 mb-6" style={{ direction: 'rtl' }}>
        {LETTERS.map((letter, i) => {
          const p  = priorities[i];
          const cc = CHILD_CARD_COLORS[i % CHILD_CARD_COLORS.length];
          // Dot row — 3 slots; filled dots = chosen priority level
          const dotRow = (dotFill: string, dotEmpty: string) => (
            <div className="flex gap-[3px] mt-1.5">
              {[1, 2, 3].map(d => (
                <div
                  key={d}
                  style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: d <= p ? dotFill : dotEmpty,
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          );

          return childMode ? (
            <button
              key={i}
              onClick={() => handleLetterClick(i)}
              style={{
                background: cc.bg,
                borderColor: cc.border,
                color: cc.char,
                outline: p > 0 ? `3px solid ${CHILD_PRIORITY_OUTLINES[p]}` : 'none',
                outlineOffset: '1px',
              }}
              className="rounded-2xl border-2 flex flex-col items-center justify-center py-2 px-1 cursor-pointer hover:-translate-y-1 hover:shadow-lg active:scale-90 transition-all duration-150 select-none"
            >
              <span style={{ fontFamily: "'Hafs', 'Amiri', serif", fontSize: 'clamp(2.8rem, 14vw, 6rem)', lineHeight: 1 }}>
                {getLetterInForm(letter, letterForm)}
              </span>
              {NON_CONNECTORS.has(letter) && (letterForm === 'initial' || letterForm === 'medial') && (
                <span style={{ fontSize: '0.55rem', opacity: 0.5, marginTop: 2 }}>
                  ≡ {letterForm === 'initial' ? 'مُفرَد' : 'آخِر'}
                </span>
              )}
              {dotRow(CHILD_PRIORITY_OUTLINES[p] || 'rgba(148,163,184,0.5)', 'rgba(148,163,184,0.22)')}
            </button>
          ) : (
            <button
              key={i}
              onClick={() => handleLetterClick(i)}
              className={`rounded-xl border flex flex-col items-center justify-center py-2 px-1 cursor-pointer hover:-translate-y-1 active:scale-90 transition-all duration-150 select-none ${
                p === 0 ? 'bg-slate-100 dark:bg-gray-700/60 border-slate-200 dark:border-gray-600' :
                p === 1 ? 'bg-amber-50  dark:bg-amber-900/20 border-amber-300 dark:border-amber-700' :
                p === 2 ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600' :
                          'bg-amber-200 dark:bg-amber-900/50 border-amber-500'
              }`}
            >
              <span
                style={{ fontFamily: "'Hafs', 'Amiri', serif", fontSize: 'clamp(2.6rem, 13vw, 5.8rem)', lineHeight: 1 }}
                className={
                  p === 0 ? 'text-slate-500 dark:text-slate-400' :
                  p === 3 ? 'text-amber-800 dark:text-amber-200' :
                            'text-amber-700 dark:text-amber-300'
                }
              >{getLetterInForm(letter, letterForm)}</span>
              {NON_CONNECTORS.has(letter) && (letterForm === 'initial' || letterForm === 'medial') && (
                <span className="text-[8px] text-slate-400 dark:text-slate-500" style={{ marginTop: 2 }}>
                  ≡ {letterForm === 'initial' ? 'مُفرَد' : 'آخِر'}
                </span>
              )}
              {dotRow(
                p === 3 ? '#d97706' : p === 2 ? '#f59e0b' : '#fbbf24',
                'rgba(148,163,184,0.22)',
              )}
            </button>
          );
        })}
      </div>

      {/* ── Game picker (child mode) ──────────────────────────────────────── */}
      {childMode && (
        <div className="mb-6">
          <p className="text-center text-sm mb-3 font-extrabold text-indigo-600 tracking-wide">
            🎮 Pick your game!
          </p>
          <div className="flex gap-4 justify-center">
            {/* Castle Battle */}
            {(() => {
              const active = gameChoice === 'tower';
              return (
                <button
                  onClick={() => setGameChoice('tower')}
                  className="relative flex flex-col items-center rounded-3xl border-4 select-none active:scale-95 transition-all duration-200 overflow-hidden"
                  style={{
                    width: 148,
                    borderColor: active ? '#6366f1' : '#e0e7ff',
                    background: active
                      ? 'linear-gradient(160deg,#6366f1 0%,#4f46e5 100%)'
                      : 'linear-gradient(160deg,#f0f4ff 0%,#e8edff 100%)',
                    boxShadow: active
                      ? '0 8px 24px rgba(99,102,241,0.45), 0 2px 8px rgba(99,102,241,0.3)'
                      : '0 2px 8px rgba(99,102,241,0.1)',
                    transform: active ? 'scale(1.06)' : 'scale(1)',
                  }}
                >
                  {active && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'radial-gradient(ellipse at 50% 0%,rgba(255,255,255,0.18) 0%,transparent 70%)',
                    }} />
                  )}
                  <div className="pt-3 px-2">
                    <LottieAnim src="/sprites/knight.json" width={110} height={110} />
                  </div>
                  <div className="pb-3 px-3 w-full text-center">
                    <div className={`font-extrabold text-sm leading-tight ${active ? 'text-white' : 'text-indigo-700'}`}>
                      Castle Battle
                    </div>
                    <div className={`text-[10px] mt-0.5 leading-tight ${active ? 'text-indigo-100' : 'text-indigo-400'}`}>
                      Send soldiers to win!
                    </div>
                  </div>
                  {active && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    </div>
                  )}
                </button>
              );
            })()}

            {/* Letter Flight */}
            {(() => {
              const active = gameChoice === 'airplane';
              return (
                <button
                  onClick={() => setGameChoice('airplane')}
                  className="relative flex flex-col items-center rounded-3xl border-4 select-none active:scale-95 transition-all duration-200 overflow-hidden"
                  style={{
                    width: 148,
                    borderColor: active ? '#06b6d4' : '#cffafe',
                    background: active
                      ? 'linear-gradient(160deg,#0891b2 0%,#0e7490 100%)'
                      : 'linear-gradient(160deg,#f0feff 0%,#e0f9ff 100%)',
                    boxShadow: active
                      ? '0 8px 24px rgba(6,182,212,0.45), 0 2px 8px rgba(6,182,212,0.3)'
                      : '0 2px 8px rgba(6,182,212,0.1)',
                    transform: active ? 'scale(1.06)' : 'scale(1)',
                  }}
                >
                  {active && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'radial-gradient(ellipse at 50% 0%,rgba(255,255,255,0.18) 0%,transparent 70%)',
                    }} />
                  )}
                  <div className="pt-3 px-2">
                    <LottieAnim src="/sprites/airplane-game.json" width={110} height={110} />
                  </div>
                  <div className="pb-3 px-3 w-full text-center">
                    <div className={`font-extrabold text-sm leading-tight ${active ? 'text-white' : 'text-cyan-700'}`}>
                      Letter Flight
                    </div>
                    <div className={`text-[10px] mt-0.5 leading-tight ${active ? 'text-cyan-100' : 'text-cyan-400'}`}>
                      Fly to the right letter!
                    </div>
                  </div>
                  {active && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow">
                      <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                    </div>
                  )}
                </button>
              );
            })()}

            {/* Letter Race (2 players, one keyboard) */}
            {(() => {
              const active = gameChoice === 'race';
              return (
                <button
                  onClick={() => setGameChoice('race')}
                  className="relative flex flex-col items-center rounded-3xl border-4 select-none active:scale-95 transition-all duration-200 overflow-hidden"
                  style={{
                    width: 148,
                    borderColor: active ? '#10b981' : '#d1fae5',
                    background: active
                      ? 'linear-gradient(160deg,#059669 0%,#047857 100%)'
                      : 'linear-gradient(160deg,#f0fdf7 0%,#e2fbef 100%)',
                    boxShadow: active
                      ? '0 8px 24px rgba(16,185,129,0.45), 0 2px 8px rgba(16,185,129,0.3)'
                      : '0 2px 8px rgba(16,185,129,0.1)',
                    transform: active ? 'scale(1.06)' : 'scale(1)',
                  }}
                >
                  {active && (
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: 'radial-gradient(ellipse at 50% 0%,rgba(255,255,255,0.18) 0%,transparent 70%)',
                    }} />
                  )}
                  <div className="pt-3 px-2 flex items-end justify-center gap-1" style={{ width: 110, height: 110 }}>
                    <img src="/sprites/race-fox.png" alt="" className="h-20 w-auto object-contain" />
                    <img src="/sprites/race-lion.png" alt="" className="h-20 w-auto object-contain" />
                  </div>
                  <div className="pb-3 px-3 w-full text-center">
                    <div className={`font-extrabold text-sm leading-tight ${active ? 'text-white' : 'text-emerald-700'}`}>
                      Letter Race
                    </div>
                    <div className={`text-[10px] mt-0.5 leading-tight ${active ? 'text-emerald-100' : 'text-emerald-500'}`}>
                      2 players — race &amp; grab it!
                    </div>
                  </div>
                  {active && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    </div>
                  )}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className={`text-sm px-4 py-2 rounded-lg border ${
          childMode
            ? 'font-bold bg-white border-blue-200 rounded-full text-blue-700'
            : 'bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-500 dark:text-slate-400'
        }`}>
          {unique === 0
            ? (childMode ? t('alphabetTrainer.noLettersChild') : t('alphabetTrainer.noLetters'))
            : <>{unique} {unique === 1 ? t('alphabetTrainer.letter') : t('alphabetTrainer.letters')} — {total} {t('alphabetTrainer.rounds')}</>
          }
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPriorities(new Array(28).fill(1))}
            className={`px-4 py-2 text-sm border transition-colors ${
              childMode
                ? 'rounded-full border-2 border-blue-200 font-bold text-blue-600 hover:border-blue-400 bg-white'
                : 'rounded-lg border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-gray-400'
            }`}
          >{t('alphabetTrainer.selectAll')}</button>
          <button
            onClick={() => setPriorities(new Array(28).fill(0))}
            className={`px-4 py-2 text-sm border transition-colors ${
              childMode
                ? 'rounded-full border-2 border-blue-200 font-bold text-blue-600 hover:border-blue-400 bg-white'
                : 'rounded-lg border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-gray-400'
            }`}
          >{t('alphabetTrainer.clearAll')}</button>
          <button
            onClick={handleStart}
            disabled={unique === 0}
            className={`px-6 py-2 text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
              childMode
                ? 'rounded-full bg-orange-400 hover:bg-orange-500 text-white shadow-md shadow-orange-200'
                : 'rounded-lg bg-teal-600 dark:bg-amber-600 hover:bg-teal-700 dark:hover:bg-amber-700 text-white'
            }`}
          >{t('alphabetTrainer.startPractice')}</button>
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
          onClick={() => { setView('select'); setRestartMsg(''); }}
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
          onClick={() => { setQueue(buildQueue(priorities)); setPos(0); setRestartMsg(''); setView('practice'); gameRef.current?.reset(); }}
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
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold ${childMode ? 'bg-gradient-to-br from-pink-400 to-purple-400 text-white' : 'bg-gradient-to-br from-teal-500 to-amber-500 text-white'}`}>
              ا
            </div>
            <h2 className={`text-2xl font-extrabold ${childMode ? 'text-blue-700' : 'text-slate-800 dark:text-slate-100'}`}>
              {t('alphabetTrainer.pageTitle')}
            </h2>
          </div>

          {/* Child mode toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {childMode ? t('alphabetTrainer.childModeLabel') : t('alphabetTrainer.adultModeLabel')}
            </span>
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={childMode}
                onChange={e => setChildMode(e.target.checked)}
              />
              <div className="w-11 h-6 rounded-full bg-slate-300 dark:bg-gray-600 peer-checked:bg-pink-400 transition-colors duration-200" />
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 peer-checked:translate-x-5 flex items-center justify-center text-xs leading-none">
                {childMode ? '☀️' : '🌙'}
              </div>
            </div>
          </label>
        </div>
        <div className={`w-16 h-1 rounded-full mb-6 ${childMode ? 'bg-gradient-to-r from-pink-400 to-purple-400' : 'bg-gradient-to-r from-teal-400 to-amber-400'}`} />
      </div>

      {/* Main content */}
      {view === 'select'   && renderSelect()}
      {view === 'practice' && renderPractice()}
      {view === 'win'      && renderWin()}
      {view === 'airplane' && (
        <div className="max-w-3xl mx-auto px-4 pb-8">
          <AirplaneGame letters={selectedLetters} letterForm={letterForm} onExit={() => setView('select')} avatarSrc={avatarSrc} />
        </div>
      )}
      {view === 'race' && (
        <LetterRaceGame letters={selectedLetters} letterForm={letterForm} onExit={() => setView('select')} />
      )}
    </div>
  );
};

export default AlphabetTrainerPage;
