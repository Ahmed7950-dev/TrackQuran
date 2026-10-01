// ─────────────────────────────────────────────────────────────────────────────
// LetterCardsGame — the letter shapes, played as cards.
//
//   LetterCardsSetup  tutor, inside the Alphabet tab: letters, shape, lives,
//                     and whether the student joins by link or the tutor holds
//                     both hands himself.
//   LetterCardsPage   the link, /letter-cards/:id.
//
// The tutor holds every letter in its ISOLATED form; the student holds the same
// letters in the shape chosen before the game. Both start with the same five
// letters — only the shape differs — and no two of the ten cards in play ever
// show the same animal.
//
// The tutor always throws first. The student answers with the same letter: right
// and the pair goes to the student and both draw again; wrong and BOTH letters
// go back to the pile to come round later, and a life is spent. The game is won
// when every letter has been answered.
//
// The tutor's device is the authority. It broadcasts the board on
// `letter-cards:<id>` after every move; the student's device sends picks and
// draws whatever it is told. In tutor mode there is no second device at all.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { createGameChannel, P2PGameChannel } from '../services/p2pGameChannel';
import { MatchForm } from '../services/letterMatchService';
import { shapeOf, FORM_LABEL } from './LetterMatchChallenge';
import {
  ANIMALS, Animal, BOARD_BACKGROUND, CARD_BACK_STUDENT, CARD_BACK_TUTOR, CardsEnd,
  CardsMode, HAND_SIZE, LetterCardsGame as Game, animalSrc, completeLetterCardsGame,
  createLetterCardsGame, getLetterCardsGame, letterCardsChannel, letterCardsUrl,
  markLetterCardsStarted, notifyLetterCardsHomework, notifyLetterCardsInvite,
  recordLetterCardsAttempt, SOUND_POINT, SOUND_THROW, WordCard, WordsScript, WordsSide,
} from '../services/letterCardsService';
import { recordVocabAnswer } from '../services/vocabHomeworkService';
import { BOARD, Box, DEFAULT_LAYOUT, Layout } from './letterCardsLayout';
import {
  Card, Snap, deal, judge as judgeBoard, throwStudent, throwTutor,
} from '../services/letterCardsEngine';

const LETTER_FONT = "'Amiri', 'Amiri Regular', serif";

export type { Card, Snap } from '../services/letterCardsEngine';

// ── The board ───────────────────────────────────────────────────────────────

const boxStyle = (b: Box): React.CSSProperties => ({
  position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`,
});

/** What a card says: a letter in one of its shapes, or a word. */
export interface Face { text: string; rtl: boolean; size: number }

/** A word has to fit the panel: the longest word of it on a line, the whole
 *  of it in two or three. Sizes are in cqw — per cent of the CARD's width. */
const fitWord = (text: string, rtl: boolean): number => {
  // Harakat sit above and below the letters and take no width of their own,
  // so a vowelled word must not be measured as though they did.
  const bare = rtl ? text.replace(/[\u064B-\u0655\u0670\u06D6-\u06ED]/g, '') : text;
  const words = bare.split(/\s+/).filter(Boolean);
  const longest = Math.max(4, ...words.map(w => [...w].length));
  const total = Math.max(6, [...bare].length);
  return Math.max(7, Math.min(rtl ? 26 : 22, (rtl ? 130 : 145) / longest, (rtl ? 320 : 360) / total));
};

export const wordFace = (text: string, rtl: boolean): Face => ({ text, rtl, size: fitWord(text, rtl) });

/** One card: the animal, with what it says in the panel at the top. */
const CardFace: React.FC<{
  card: Card; face: Face; layout: Layout;
  onClick?: () => void; dim?: boolean; glow?: string;
}> = ({ card, face, layout, onClick, dim, glow }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    aria-label={`${card.animal}, ${face.text}`}
    className={`relative w-full h-full rounded-[8%] overflow-visible transition-transform duration-150 ${
      onClick ? 'cursor-pointer hover:-translate-y-[4%] active:scale-95' : ''}`}
    // Its own size container, so the letter is measured against the CARD.
    style={{
      containerType: 'inline-size',
      opacity: dim ? 0.55 : 1,
      filter: glow ? `drop-shadow(0 0 10px ${glow})` : undefined,
    }}
  >
    <img src={animalSrc(card.animal)} alt="" draggable={false}
      className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
    <span
      className="absolute flex items-center justify-center pointer-events-none"
      style={{
        left: `${layout.letterBox.x}%`, top: `${layout.letterBox.y}%`,
        width: `${layout.letterBox.w}%`, height: `${layout.letterBox.h}%`,
      }}
    >
      <span dir={face.rtl ? 'rtl' : 'ltr'} style={{
        fontFamily: face.rtl ? LETTER_FONT : 'inherit',
        fontSize: `${face.size}cqw`, lineHeight: 1.12,
        color: '#1A1208', fontWeight: 700,
        textAlign: 'center', overflowWrap: 'anywhere',
      }}>
        {face.text}
      </span>
    </span>
  </button>
);

/**
 * The table's two sounds. Both screens play them off the same snapshot, so the
 * student hears the card the tutor threw. A refused play is nothing to answer
 * for — some browsers hold sound back until the first tap, and the first tap
 * is a card anyway.
 */
const play = (src: string) => {
  try {
    const a = new Audio(src);
    a.volume = 0.7;
    void a.play().catch(() => { /* not yet allowed */ });
  } catch { /* no audio on this device */ }
};

/** Card down when one appears in the middle, a chime when the pair was right. */
const useTableSounds = (snap: Snap) => {
  const thrown = (snap.thrownTutor ? 1 : 0) + (snap.thrownStudent ? 1 : 0);
  const was = useRef(thrown);
  const flash = useRef(snap.flash?.n ?? 0);
  useEffect(() => {
    if (thrown > was.current) play(SOUND_THROW);
    was.current = thrown;
  }, [thrown]);
  useEffect(() => {
    const n = snap.flash?.n ?? 0;
    if (n !== flash.current && snap.flash?.ok) play(SOUND_POINT);
    flash.current = n;
  }, [snap.flash]);
};

const CardBack: React.FC<{ src: string }> = ({ src }) => (
  <img src={src} alt="" draggable={false}
    className="absolute inset-0 w-full h-full object-contain pointer-events-none rounded-[8%]" />
);

const Board: React.FC<{
  snap: Snap;
  /** Whose screen this is. The tutor sees his own hand; in tutor mode, both. */
  me: 'tutor' | 'student';
  onPick?: (side: 'tutor' | 'student', index: number) => void;
  layout?: Layout;
  /** A vocabulary game: one half of each word on each side of the table.
   *  Without it the cards are letters and their shapes. */
  words?: WordCard[] | null;
  /** Which half the STUDENT holds; the tutor holds the other. */
  wordsSide?: WordsSide;
  /** How the word half is written — its own script, or transliterated. */
  wordsScript?: WordsScript;
  /** Everything the board paints over itself — nothing sits above the canvas. */
  onBack?: () => void;
  onRematch?: () => void;
}> = ({ snap, me, onPick, layout = DEFAULT_LAYOUT, words, wordsSide = 'english',
       wordsScript = 'arabic', onBack, onRematch }) => {
  useTableSounds(snap);
  const wordById = useMemo(() => new Map((words ?? []).map(w => [w.id, w])), [words]);
  const isWords = wordById.size > 0;
  /** The tutor's side says the Arabic, or the letter on its own; the student's
   *  side says the meaning, or the letter in the shape being practised. */
  const faceOf = (card: Card, side: 'tutor' | 'student'): Face => {
    if (isWords) {
      const w = wordById.get(card.letter);
      const wordHalf = wordsSide === 'arabic' ? 'student' : 'tutor';
      if (side !== wordHalf) return wordFace(w?.english ?? card.letter, false);
      // The word itself: in Arabic, or transliterated when that was chosen and
      // the word actually carries one.
      const translit = wordsScript === 'translit' ? (w?.translit ?? '').trim() : '';
      return translit ? wordFace(translit, false) : wordFace(w?.arabic ?? card.letter, true);
    }
    const text = shapeOf(card.letter, side === 'tutor' ? 'isolated' : snap.form);
    return { text, rtl: true, size: layout.letterSize };
  };
  const bothOpen = snap.mode === 'tutor';
  /** Whoever is looking sits at the bottom of the table, the other across it,
   *  so both players see their own hand in the same place. */
  const near: 'tutor' | 'student' = me;
  const far: 'tutor' | 'student' = me === 'tutor' ? 'student' : 'tutor';
  const handOf = (side: 'tutor' | 'student') => side === 'tutor' ? snap.tutorHand : snap.studentHand;
  const thrownOf = (side: 'tutor' | 'student') => side === 'tutor' ? snap.thrownTutor : snap.thrownStudent;
  const sees = (side: 'tutor' | 'student') => bothOpen || me === side;
  const myTurn = (side: 'tutor' | 'student') =>
    !!onPick && snap.ph === 'playing' && snap.turn === side && (bothOpen || me === side);
  /** Each hand keeps its colour: the one across the table red, your own blue,
   *  the way the table itself is painted. */
  const FAR_GLOW = 'rgba(198,62,52,.85)';
  const NEAR_GLOW = 'rgba(52,104,204,.85)';

  return (
    <div
      className="lc-board select-none"
      style={{ aspectRatio: `${BOARD.w} / ${BOARD.h}`, containerType: 'inline-size' }}
    >
      <BoardStyle />
      <img src={BOARD_BACKGROUND} alt="" draggable={false}
        className="absolute inset-0 w-full h-full object-cover rounded-2xl" />

      {/* the pile everyone draws from */}
      <div style={boxStyle(layout.drawPile)} className="pointer-events-none">
        {snap.pile.length > 0 && <CardBack src={CARD_BACK_TUTOR} />}
        {snap.pile.length > 0 && (
          <span className="absolute inset-x-0 -bottom-[18%] text-center text-white font-black"
            style={{ fontSize: 'clamp(11px, 2vw, 18px)', textShadow: '0 2px 6px rgba(0,0,0,.8)' }}>
            {snap.pile.length}
          </span>
        )}
      </div>

      {/* the hand across the table, along the top */}
      {layout.studentHand.map((box, i) => {
        const card = handOf(far)[i];
        if (!card) return null;
        return (
          <div key={`f${i}`} style={boxStyle(box)}>
            {sees(far)
              ? <CardFace card={card} face={faceOf(card, far)} layout={layout}
                  onClick={myTurn(far) ? () => onPick!(far, i) : undefined}
                  glow={myTurn(far) ? 'rgba(255,220,120,.9)' : FAR_GLOW} />
              : <CardBack src={CARD_BACK_STUDENT} />}
          </div>
        );
      })}

      {/* your own five, along the bottom */}
      {layout.tutorHand.map((box, i) => {
        const card = handOf(near)[i];
        if (!card) return null;
        return (
          <div key={`n${i}`} style={boxStyle(box)}>
            {sees(near)
              ? <CardFace card={card} face={faceOf(card, near)} layout={layout}
                  onClick={myTurn(near) ? () => onPick!(near, i) : undefined}
                  glow={myTurn(near) ? 'rgba(255,220,120,.9)' : NEAR_GLOW} />
              : <CardBack src={CARD_BACK_TUTOR} />}
          </div>
        );
      })}

      {/* what is on the table: theirs on the left, yours on the right */}
      {thrownOf(far) && (
        <div style={boxStyle(layout.thrownTutor)}>
          <CardFace card={thrownOf(far)!} face={faceOf(thrownOf(far)!, far)} layout={layout} glow={FAR_GLOW} />
        </div>
      )}
      {thrownOf(near) && (
        <div style={boxStyle(layout.thrownStudent)}>
          <CardFace card={thrownOf(near)!} face={faceOf(thrownOf(near)!, near)} layout={layout} glow={NEAR_GLOW} />
        </div>
      )}

      {/* ── one bar across the top: everything lives in it ── */}
      <div className="absolute inset-x-0 top-0 flex items-center rounded-t-2xl"
        style={{
          height: '5%',
          paddingInline: '1%',
          gap: '0.7cqw',
          fontSize: 'clamp(7px, 0.95cqw, 13px)',
          background: 'linear-gradient(to bottom, rgba(8,6,3,.72), rgba(8,6,3,.34))',
          boxShadow: 'inset 0 -0.5cqw 0.9cqw -0.35cqw rgba(0,0,0,.85), inset 0 0.2cqw 0.5cqw -0.25cqw rgba(255,235,190,.28)',
          backdropFilter: 'blur(2px)',
        }}>

        {onBack && (
          <button onClick={onBack} aria-label="Back to the letters"
            className="flex-shrink-0 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
            style={{ width: '2.2em', height: '2.2em' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}
              strokeLinecap="round" strokeLinejoin="round" style={{ width: '60%', height: '60%' }} aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        <span className="font-black text-white whitespace-nowrap truncate" style={{ fontSize: '1.1em' }}>
          {isWords ? 'Word cards' : FORM_LABEL[snap.form].en}
        </span>

        <span className="flex-grow" />

        <span className="flex-shrink-0 rounded-full bg-emerald-500/25 text-emerald-50 font-black whitespace-nowrap"
          style={{ padding: '0.22em 0.7em', fontSize: '1em' }}>
          ✓ {snap.score} / {snap.total}
        </span>

        {snap.livesMax !== null && (
          <span className="flex-shrink-0 rounded-full bg-rose-500/25 text-rose-50 font-black whitespace-nowrap"
            style={{ padding: '0.22em 0.7em', fontSize: '1em' }}>
            {'♥'.repeat(Math.max(0, snap.lives ?? 0))}
            <span className="opacity-35">{'♥'.repeat(Math.max(0, snap.livesMax - (snap.lives ?? 0)))}</span>
          </span>
        )}

        <span className={`flex-shrink-0 rounded-full font-black whitespace-nowrap ${
          snap.ph === 'over' ? 'bg-white/20 text-white'
            : (snap.mode === 'tutor' || snap.turn === me) ? 'bg-amber-400 text-amber-950' : 'bg-white/15 text-white/80'}`}
          style={{ padding: '0.22em 0.8em', fontSize: '1em' }}>
          {snap.ph === 'over'
            ? (snap.ended === 'done' ? 'All answered' : 'Out of lives')
            : snap.mode === 'tutor'
              ? (snap.turn === 'tutor' ? 'Throw a card' : 'Their answer')
              : snap.turn === me ? 'Your turn' : 'Waiting…'}
        </span>

        {onRematch && (
          <button onClick={onRematch}
            className="flex-shrink-0 rounded-full bg-white/15 hover:bg-white/25 text-white font-black whitespace-nowrap"
            style={{ padding: '0.22em 0.8em', fontSize: '1em' }}>
            Play again
          </button>
        )}
      </div>

      {/* right / wrong, over the middle */}
      {snap.flash && (
        <div key={snap.flash.n}
          className="absolute inset-0 flex items-center justify-center pointer-events-none lc-flash">
          <span className="rounded-full px-6 py-3 font-black text-white"
            style={{
              fontSize: 'clamp(16px, 4vw, 46px)',
              background: snap.flash.ok ? 'rgba(16,128,80,.92)' : 'rgba(176,32,32,.92)',
              boxShadow: '0 10px 40px rgba(0,0,0,.45)',
            }}>
            {snap.flash.ok ? '✓' : '✕'}
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * The board is as large as the screen allows and centred on it. Held upright
 * the screen is the wrong shape for a card table, so the board turns a quarter
 * and fills the phone that way instead of sitting small in the middle.
 */
const BoardStyle: React.FC = () => (
  <style>{`
@keyframes lc-flash{0%{opacity:0;transform:scale(.7)}18%{opacity:1;transform:scale(1)}72%{opacity:1}100%{opacity:0;transform:scale(1.15)}}
.lc-flash{animation:lc-flash 1s ease forwards}
.lc-board{
  position:absolute; top:50%; left:50%;
  transform:translate(-50%,-50%);
  width:min(
    calc(100dvw - env(safe-area-inset-left) - env(safe-area-inset-right)),
    calc((100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)) * ${BOARD.w} / ${BOARD.h})
  );
}
@media (orientation:portrait){
  .lc-board{
    transform:translate(-50%,-50%) rotate(90deg);
    width:min(
      calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)),
      calc((100dvw - env(safe-area-inset-left) - env(safe-area-inset-right)) * ${BOARD.w} / ${BOARD.h})
    );
  }
}`}</style>
);

export { Board as LetterCardsBoard };
export type { Snap as LetterCardsSnap };

// ── The page behind the link ────────────────────────────────────────────────

export const LetterCardsPage: React.FC<{ gameId: string }> = ({ gameId }) => {
  const [game, setGame] = useState<Game | null | undefined>(undefined);
  const [isTutor, setIsTutor] = useState<boolean | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const snapRef = useRef<Snap | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chanRef = useRef<P2PGameChannel | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => { document.title = 'Letter cards'; getLetterCardsGame(gameId).then(setGame); }, [gameId]);

  // The board already fills the window; real full screen only hides the
  // browser's own bars, and browsers hand it over on a gesture and not before,
  // so the first touch anywhere takes it and nobody is asked to press anything.
  // iPhone Safari never allows it outside video — there the board is enough.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !document.fullscreenEnabled) return;
    const take = () => {
      document.removeEventListener('pointerdown', take);
      if (!document.fullscreenElement) void el.requestFullscreen?.().catch(() => { /* refused */ });
    };
    document.addEventListener('pointerdown', take);
    return () => document.removeEventListener('pointerdown', take);
  }, [game]);

  /** Back to wherever they came from — the letters page for the tutor. */
  const leave = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    let fromHere = false;
    try { fromHere = !!document.referrer && new URL(document.referrer).origin === window.location.origin; } catch { /* bad referrer */ }
    if (fromHere && window.history.length > 1) { window.history.back(); return; }
    window.location.href = '/';
  }, []);

  // The tutor opening his own link is signed in; a student arriving is not.
  useEffect(() => {
    if (!game) return;
    supabase.auth.getSession().then(({ data }) => setIsTutor(data.session?.user?.id === game.teacherId));
  }, [game]);

  /** Homework: the student plays the tutor's side against the computer, on
   *  their own device, with nobody on the other end of a channel. */
  const solo = game?.mode === 'solo';
  const host = solo || isTutor === true;
  const me: 'tutor' | 'student' = solo ? 'student' : (host ? 'tutor' : 'student');

  // The tutor's device records each finished game once.
  const savedRef = useRef(false);

  const broadcast = useCallback((s: Snap | null) => {
    if (s) chanRef.current?.send({ type: 'broadcast', event: 'board', payload: s });
  }, []);

  const commit = useCallback((s: Snap) => { snapRef.current = s; setSnap(s); broadcast(s); }, [broadcast]);

  /** A words game writes every answer the moment it is judged, right or
   *  wrong, so a game left half-played still leaves a record of the words that
   *  were actually revised. The card thrown at the student is the word being
   *  asked; the one they picked wrongly is not counted against itself. */
  const gameRef = useRef<Game | null>(null);
  useEffect(() => { gameRef.current = game ?? null; }, [game]);
  const recordAnswer = useCallback((judged: Snap) => {
    const g = gameRef.current;
    if (!g || g.kind !== 'words' || !g.studentId) return;
    const asked = judged.thrownTutor, answered = judged.thrownStudent;
    if (!asked || !answered) return;
    void recordVocabAnswer(g.studentId, asked.letter, asked.letter === answered.letter);
  }, []);

  /** Throwing a card. Judging only ever runs on the tutor's device. */
  const pick = useCallback((side: 'tutor' | 'student', index: number) => {
    const s = snapRef.current;
    if (!s || s.ph !== 'playing' || s.turn !== side) return;
    if (side === 'tutor') { commit(throwTutor(s, index)); return; }
    const thrown = throwStudent(s, index);
    if (thrown === s) return;
    commit(thrown);
    // A beat with both cards face up, so the pair can be read before it goes.
    window.setTimeout(() => {
      const before = snapRef.current ?? thrown;
      recordAnswer(before);
      commit(judgeBoard(before));
    }, 750);
  }, [commit, recordAnswer]);

  // ── Alone against the computer ──
  useEffect(() => {
    if (!solo || !game) return;
    const first = deal(game.letters, game.form ?? 'initial', game.lives, game.mode);
    snapRef.current = first; setSnap(first);
    startedAt.current = Date.now();
    void markLetterCardsStarted(game.id);
  }, [solo, game]);

  /** The computer's turn: it takes a moment, then throws one of its cards. */
  useEffect(() => {
    if (!solo || !snap || snap.ph !== 'playing' || snap.turn !== 'tutor') return;
    const n = snap.tutorHand.length;
    if (!n) return;
    const t = window.setTimeout(() => pick('tutor', Math.floor(Math.random() * n)), 900);
    return () => window.clearTimeout(t);
  }, [solo, snap, pick]);

  // ── The wire ──
  useEffect(() => {
    if (solo || !game || isTutor === null) return;
    const ch = createGameChannel(letterCardsChannel(game.id), host ? 'host' : 'guest');
    chanRef.current = ch;
    if (host) {
      const first = deal(game.letters, game.form ?? 'initial', game.lives, game.mode);
      snapRef.current = first; setSnap(first);
      startedAt.current = Date.now();
      void markLetterCardsStarted(game.id);
      ch.on('broadcast', { event: 'hello' }, () => broadcast(snapRef.current));
      ch.on('broadcast', { event: 'pick' }, ({ payload }) => {
        if (payload?.side === 'student') pick('student', payload.index);
      });
      ch.subscribe(() => broadcast(snapRef.current));
      const hb = window.setInterval(() => broadcast(snapRef.current), 2000);
      return () => { window.clearInterval(hb); ch.unsubscribe(); chanRef.current = null; };
    }
    ch.on('broadcast', { event: 'board' }, ({ payload }) => { snapRef.current = payload; setSnap(payload); });
    ch.subscribe(status => { if (status === 'SUBSCRIBED') ch.send({ type: 'broadcast', event: 'hello', payload: {} }); });
    return () => { ch.unsubscribe(); chanRef.current = null; };
    // `pick` is stable enough: it only reads refs.
  }, [solo, game, isTutor, host, broadcast, pick]);

  useEffect(() => {
    if (!host || !game || !snap || snap.ph !== 'over' || savedRef.current) return;
    savedRef.current = true;
    const durationMs = Date.now() - startedAt.current;
    const endedReason = snap.ended ?? 'done';
    void completeLetterCardsGame({
      id: game.id, score: snap.score, mistakes: snap.mistakes, wrongLetters: snap.wrongLetters,
      endedReason, durationMs,
    });
    // Homework is played again and again, so every run is kept on its own.
    if (solo) {
      void recordLetterCardsAttempt({
        gameId: game.id, studentId: game.studentId, score: snap.score, total: snap.total,
        mistakes: snap.mistakes, wrongLetters: snap.wrongLetters, endedReason, durationMs,
      });
    }
  }, [host, solo, game, snap]);

  /** Deal the whole thing again — the tutor's call, or the student's own on
   *  homework, which may be played as often as they like. */
  const rematch = useCallback(() => {
    if (!host || !game) return;
    savedRef.current = false;
    startedAt.current = Date.now();
    commit(deal(game.letters, game.form ?? 'initial', game.lives, game.mode));
  }, [host, game, commit]);

  const onPick = host
    ? pick
    : (side: 'tutor' | 'student', index: number) => {
        if (side !== 'student') return;
        chanRef.current?.send({ type: 'broadcast', event: 'pick', payload: { side, index } });
      };

  if (game === undefined) return <Shell><p className="text-center py-24 text-slate-500">Loading the game…</p></Shell>;
  if (!game) return (
    <Shell>
      <div className="text-center py-24 px-4">
        <p className="text-xl font-black text-slate-800">Game not found</p>
        <p className="text-sm text-slate-500 mt-1">Ask your teacher for a new link.</p>
      </div>
    </Shell>
  );
  if (!snap) return (
    <Shell>
      <p className="text-center py-24 text-slate-500">
        {host ? 'Dealing…' : 'Waiting for your teacher to start…'}
      </p>
    </Shell>
  );

  return (
    <div ref={wrapRef} className="fixed inset-0 overflow-hidden bg-black">
      {/* the artwork itself carries the margins, so there is no coloured letterbox */}
      <img src={BOARD_BACKGROUND} alt="" aria-hidden="true" draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'blur(28px) brightness(.55)', transform: 'scale(1.12)' }} />
      <Board
        snap={snap} me={me} words={game.words} wordsSide={game.wordsSide} wordsScript={game.wordsScript}
        onPick={snap.ph === 'playing' ? onPick : undefined}
        onBack={leave}
        onRematch={host ? rematch : undefined}
      />
    </div>
  );
};

const Shell: React.FC<{ children: React.ReactNode; wrapRef?: React.Ref<HTMLDivElement> }> = ({ children, wrapRef }) => (
  <div ref={wrapRef}
    className="min-h-[100dvh] w-full bg-slate-900 flex items-center justify-center p-1 sm:p-2"
    style={{ paddingTop: 'max(0.25rem, env(safe-area-inset-top))', paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}>
    <div className="w-full">{children}</div>
  </div>
);

// ── Setting one up ──────────────────────────────────────────────────────────

export const LetterCardsSetup: React.FC<{
  /** A letters game: the letters, and the shape the student will hold
   *  ('isolated' means: ask here). */
  letters?: string[];
  initialForm?: MatchForm | 'isolated';
  /** A vocabulary game instead: the tutor throws the Arabic, the student
   *  answers with the meaning. */
  words?: WordCard[];
  student: { id: string; name: string };
  /** The STUDENT setting up their own game: no mode to pick, no lives to pick,
   *  no link to send. They choose which half they hold and how the word is
   *  written, and the board deals against the computer straight away. */
  selfPlay?: { teacherId: string };
  onClose: () => void;
}> = ({ letters = [], initialForm = 'isolated', words, student, selfPlay, onClose }) => {
  const isWords = !!words?.length;
  /** The pile's keys: the letters themselves, or the ids of the words. */
  const keys = isWords ? words!.map(w => w.id) : letters;
  const noun = isWords ? 'word' : 'letter';
  const [form, setForm] = useState<MatchForm>(initialForm === 'isolated' ? 'initial' : initialForm);
  const [wordsSide, setWordsSide] = useState<WordsSide>('english');
  const [wordsScript, setWordsScript] = useState<WordsScript>('arabic');
  /** Without a transliteration on the words there is nothing to offer. */
  const haveTranslit = !!words?.some(w => (w.translit ?? '').trim());
  /** What the word half is called in the setup's own wording. */
  const wordLabel = wordsScript === 'translit' && haveTranslit ? 'transliteration' : 'Arabic word';
  const [lives, setLives] = useState<number | null>(3);
  const [mode, setMode] = useState<CardsMode>('multiplayer');
  /** Playing alone: one life for every ten words on the pile, never none. */
  const soloLives = Math.max(1, Math.round(keys.length / 10));
  const playMode: CardsMode = selfPlay ? 'solo' : mode;
  const playLives = selfPlay ? soloLives : lives;
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const studentName = student.name;

  const create = async () => {
    setBusy(true); setErr('');
    let teacherId = selfPlay?.teacherId;
    if (!teacherId) {
      const { data } = await supabase.auth.getUser();
      teacherId = data.user?.id;
    }
    if (!teacherId) { setBusy(false); setErr('Sign in again to start a game.'); return; }
    const g = await createLetterCardsGame({
      teacherId, studentId: student.id, studentName, letters: keys,
      form: isWords ? null : form, kind: isWords ? 'words' : 'letters',
      words: isWords ? words! : null, wordsSide,
      wordsScript: haveTranslit ? wordsScript : 'arabic', lives: playLives, mode: playMode,
    });
    if (!g) { setBusy(false); setErr('Could not start the game — check the connection.'); return; }
    // The student goes straight to the board; there is nobody to send a link to.
    if (selfPlay) { window.location.href = `/letter-cards/${g.id}`; return; }
    setBusy(false);
    setGame(g);
  };

  if (game) {
    const url = letterCardsUrl(game.id);
    return (
      <div className="p-5 sm:p-6 space-y-4">
        <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">Ready to play</h3>
        {mode !== 'tutor' ? (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {mode === 'solo'
                ? `${studentName} can play this against the computer whenever they like, from this link or from their homework tab.`
                : `Send this to ${studentName}, then open it yourself — you deal from your side.`}
            </p>
            <div className="flex justify-center py-2"><QRCodeSVG value={url} size={168} /></div>
            <div className="flex gap-2">
              <input readOnly value={url}
                className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-900 text-xs" />
              <button onClick={() => { navigator.clipboard?.writeText(url).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="h-10 px-4 rounded-xl bg-slate-800 text-white text-sm font-bold">{copied ? '✓' : 'Copy'}</button>
            </div>
            <button onClick={() => { void (mode === 'solo' ? notifyLetterCardsHomework(game) : notifyLetterCardsInvite(game)); }}
              className="w-full h-11 rounded-xl border-2 border-teal-600 text-teal-700 font-black">
              {mode === 'solo' ? `Set it for ${studentName}` : `Send it to ${studentName}`}
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You hold both hands. {studentName} tells you which animal to throw.
          </p>
        )}
        <a href={`/letter-cards/${game.id}`}
          className="block w-full h-12 rounded-xl bg-teal-700 text-white font-black flex items-center justify-center">
          {mode === 'solo' ? 'See the board' : 'Open the board'}
        </a>
        <button onClick={onClose} className="w-full py-2 text-sm text-slate-500">Close</button>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6 space-y-5">
      <div>
        <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">
          {isWords ? 'Word cards' : 'Letter cards'}
        </h3>
        {selfPlay ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {keys.length} {noun}{keys.length === 1 ? '' : 's'} · the computer throws{' '}
            {wordsSide === 'arabic' ? 'the meaning' : `the ${wordLabel}`}, you answer with{' '}
            {wordsSide === 'arabic' ? `the ${wordLabel}` : 'the meaning'} ·{' '}
            {soloLives} {soloLives === 1 ? 'life' : 'lives'}.
          </p>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {keys.length} {noun}{keys.length === 1 ? '' : 's'} ·
            {mode === 'solo' ? ' the computer holds' : ' you hold'}
            {isWords
              ? (wordsSide === 'arabic' ? ' the meaning, ' : ` the ${wordLabel}, `)
              : ' the isolated shape, '}
            {studentName} holds the{' '}
            {isWords
              ? (wordsSide === 'arabic' ? wordLabel : 'meaning')
              : `${FORM_LABEL[form].en.toLowerCase()} shape`}.
          </p>
        )}
      </div>

      <div className={selfPlay ? 'hidden' : ''}>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">How you play it</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {([
            ['multiplayer', 'Together, by link', 'Each of you sees only your own cards.'],
            ['tutor', 'On my screen only', 'Both hands face up. They tell you what to throw.'],
            ['solo', 'Homework, on their own', 'They play the computer, as many times as they like.'],
          ] as const).map(([k, title, note]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`text-start rounded-xl border-2 px-3 py-2.5 transition-colors ${
                mode === k ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30' : 'border-slate-200 dark:border-gray-600'}`}>
              <span className="block text-sm font-black text-slate-800 dark:text-slate-100">{title}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{note}</span>
            </button>
          ))}
        </div>
      </div>

      {isWords && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">
            {selfPlay ? 'What you hold' : 'What they hold'}
          </p>
          <div className="flex gap-2">
            {([
              ['english', 'The meaning', selfPlay ? `The computer throws the ${wordLabel}` : `You throw the ${wordLabel}`],
              ['arabic', `The ${wordLabel}`, selfPlay ? 'The computer throws the meaning' : 'You throw the meaning'],
            ] as const).map(([k, title, note]) => (
              <button key={k} onClick={() => setWordsSide(k)}
                className={`flex-1 text-start rounded-xl border-2 px-3 py-2.5 transition-colors ${
                  wordsSide === k ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30' : 'border-slate-200 dark:border-gray-600'}`}>
                <span className="block text-sm font-black text-slate-800 dark:text-slate-100">{title}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{note}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isWords && haveTranslit && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">How the word is written</p>
          <div className="flex gap-2">
            {([
              ['arabic', 'Arabic', 'كِتاب'],
              ['translit', 'Transliteration', 'kitaab'],
            ] as const).map(([k, title, sample]) => (
              <button key={k} onClick={() => setWordsScript(k)}
                className={`flex-1 text-start rounded-xl border-2 px-3 py-2.5 transition-colors ${
                  wordsScript === k ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30' : 'border-slate-200 dark:border-gray-600'}`}>
                <span className="block text-sm font-black text-slate-800 dark:text-slate-100">{title}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5"
                  style={k === 'arabic' ? { fontFamily: LETTER_FONT, fontSize: 15 } : undefined}>{sample}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={isWords ? 'hidden' : ''}>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">The shape they hold</p>
        <div className="flex gap-2">
          {(['initial', 'medial', 'final'] as const).map(f => (
            <button key={f} onClick={() => setForm(f)}
              className={`flex-1 h-10 rounded-xl text-sm font-black transition-colors ${
                form === f ? 'bg-teal-700 text-white' : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300'}`}>
              {FORM_LABEL[f].en}
            </button>
          ))}
        </div>
      </div>

      <div className={selfPlay ? 'hidden' : ''}>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">Lives</p>
        <div className="flex gap-2">
          {[3, 5, 7, null].map(n => (
            <button key={String(n)} onClick={() => setLives(n)}
              className={`flex-1 h-10 rounded-xl text-sm font-black transition-colors ${
                lives === n ? 'bg-teal-700 text-white' : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300'}`}>
              {n ?? '∞'}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 h-12 rounded-xl bg-slate-100 dark:bg-gray-700 font-bold">Cancel</button>
        <button onClick={create} disabled={busy || keys.length === 0}
          className="flex-1 h-12 rounded-xl bg-teal-700 text-white font-black disabled:opacity-40">
          {busy ? 'Dealing…' : selfPlay ? 'Play' : 'Start'}
        </button>
      </div>
    </div>
  );
};

export default LetterCardsPage;
