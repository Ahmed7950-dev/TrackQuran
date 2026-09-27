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
  markLetterCardsStarted, notifyLetterCardsInvite,
} from '../services/letterCardsService';
import { Box, DEFAULT_LAYOUT, Layout } from './letterCardsLayout';
import {
  Card, Snap, deal, judge as judgeBoard, throwStudent, throwTutor,
} from '../services/letterCardsEngine';

const LETTER_FONT = "'Amiri', 'Amiri Regular', serif";

export type { Card, Snap } from '../services/letterCardsEngine';

// ── The board ───────────────────────────────────────────────────────────────

const boxStyle = (b: Box): React.CSSProperties => ({
  position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`,
});

/** One card: the animal, with its letter in the panel at the top. */
const CardFace: React.FC<{
  card: Card; form: MatchForm | 'isolated'; layout: Layout;
  onClick?: () => void; dim?: boolean; glow?: string;
}> = ({ card, form, layout, onClick, dim, glow }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    aria-label={`${card.animal}, letter ${card.letter}`}
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
      <span dir="rtl" style={{
        fontFamily: LETTER_FONT, fontSize: `${layout.letterSize}cqw`, lineHeight: 1,
        color: '#1A1208', fontWeight: 700,
      }}>
        {shapeOf(card.letter, form)}
      </span>
    </span>
  </button>
);

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
  /** Everything the board paints over itself — nothing sits above the canvas. */
  onBack?: () => void;
  onRematch?: () => void;
  onFullscreen?: () => void;
  fullscreen?: boolean;
}> = ({ snap, me, onPick, layout = DEFAULT_LAYOUT, onBack, onRematch, onFullscreen, fullscreen }) => {
  const bothOpen = snap.mode === 'tutor';
  const seeTutor = bothOpen || me === 'tutor';
  const seeStudent = bothOpen || me === 'student';
  const myTurn = (side: 'tutor' | 'student') =>
    !!onPick && snap.ph === 'playing' && snap.turn === side && (bothOpen || me === side);

  return (
    <div
      className="relative w-full mx-auto select-none"
      style={{ aspectRatio: '1672 / 941', maxWidth: 'min(100%, 1400px)', containerType: 'inline-size' }}
    >
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

      {/* the student's five, along the top */}
      {layout.studentHand.map((box, i) => {
        const card = snap.studentHand[i];
        if (!card) return null;
        return (
          <div key={`s${i}`} style={boxStyle(box)}>
            {seeStudent
              ? <CardFace card={card} form={snap.form} layout={layout}
                  onClick={myTurn('student') ? () => onPick!('student', i) : undefined}
                  glow={myTurn('student') ? 'rgba(255,220,120,.9)' : undefined} />
              : <CardBack src={CARD_BACK_STUDENT} />}
          </div>
        );
      })}

      {/* the tutor's five, along the bottom */}
      {layout.tutorHand.map((box, i) => {
        const card = snap.tutorHand[i];
        if (!card) return null;
        return (
          <div key={`t${i}`} style={boxStyle(box)}>
            {seeTutor
              ? <CardFace card={card} form="isolated" layout={layout}
                  onClick={myTurn('tutor') ? () => onPick!('tutor', i) : undefined}
                  glow={myTurn('tutor') ? 'rgba(255,220,120,.9)' : undefined} />
              : <CardBack src={CARD_BACK_TUTOR} />}
          </div>
        );
      })}

      {/* what is on the table */}
      {snap.thrownTutor && (
        <div style={boxStyle(layout.thrownTutor)}>
          <CardFace card={snap.thrownTutor} form="isolated" layout={layout} />
        </div>
      )}
      {snap.thrownStudent && (
        <div style={boxStyle(layout.thrownStudent)}>
          <CardFace card={snap.thrownStudent} form={snap.form} layout={layout} />
        </div>
      )}

      {/* ── the chrome, painted on the board ── */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ fontSize: 'clamp(9px, 1.5cqw, 20px)' }}>

        {/* back to the letters */}
        {onBack && (
          <button onClick={onBack} aria-label="Back to the letters"
            className="pointer-events-auto absolute flex items-center justify-center rounded-full
                       bg-black/45 hover:bg-black/65 text-white backdrop-blur-sm"
            style={{ left: '1.4%', top: '2.2%', width: '4.4cqw', height: '4.4cqw', minWidth: 30, minHeight: 30 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}
              strokeLinecap="round" strokeLinejoin="round" style={{ width: '55%', height: '55%' }} aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        {/* what this game is */}
        <div className="absolute text-center text-white whitespace-nowrap"
          style={{ left: '50%', top: '1.6%', transform: 'translateX(-50%)', textShadow: '0 2px 8px rgba(0,0,0,.85)' }}>
          <p className="font-black leading-none" style={{ fontSize: '1.35em' }}>
            Letter cards · {FORM_LABEL[snap.form].en}
          </p>
        </div>

        {/* full screen, and a rematch for the tutor */}
        <div className="absolute flex items-center" style={{ right: '1.4%', top: '2.2%', gap: '0.8cqw' }}>
          {onRematch && (
            <button onClick={onRematch}
              className="pointer-events-auto rounded-full bg-black/45 hover:bg-black/65 text-white
                         backdrop-blur-sm font-black whitespace-nowrap"
              style={{ padding: '0.5em 1.1em', fontSize: '1.1em' }}>
              Play again
            </button>
          )}
          {onFullscreen && (
            <button onClick={onFullscreen} aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}
              className="pointer-events-auto flex items-center justify-center rounded-full
                         bg-black/45 hover:bg-black/65 text-white backdrop-blur-sm"
              style={{ width: '4.4cqw', height: '4.4cqw', minWidth: 30, minHeight: 30 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}
                strokeLinecap="round" strokeLinejoin="round" style={{ width: '55%', height: '55%' }} aria-hidden="true">
                {fullscreen
                  ? <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
                  : <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />}
              </svg>
            </button>
          )}
        </div>

        {/* the score and what is left of the lives, above the table */}
        <div className="absolute flex items-center justify-center"
          style={{ left: '50%', top: '30.5%', transform: 'translateX(-50%)', gap: '0.8cqw' }}>
          <span className="rounded-full bg-emerald-900/70 text-emerald-50 font-black backdrop-blur-sm whitespace-nowrap"
            style={{ padding: '0.35em 0.9em', fontSize: '1.15em' }}>
            ✓ {snap.score} / {snap.total}
          </span>
          {snap.livesMax !== null && (
            <span className="rounded-full bg-rose-900/70 text-rose-50 font-black backdrop-blur-sm whitespace-nowrap"
              style={{ padding: '0.35em 0.9em', fontSize: '1.15em' }}>
              {'♥'.repeat(Math.max(0, snap.lives ?? 0))}
              <span className="opacity-35">{'♥'.repeat(Math.max(0, snap.livesMax - (snap.lives ?? 0)))}</span>
            </span>
          )}
        </div>

        {/* whose turn it is, under the table */}
        <div className="absolute" style={{ left: '50%', top: '61.5%', transform: 'translateX(-50%)' }}>
          <span className={`rounded-full font-black whitespace-nowrap backdrop-blur-sm ${
            snap.ph === 'over' ? 'bg-slate-900/75 text-slate-100'
              : (snap.mode === 'tutor' || snap.turn === me) ? 'bg-amber-400 text-amber-950' : 'bg-slate-900/70 text-slate-200'}`}
            style={{ padding: '0.4em 1.1em', fontSize: '1.2em' }}>
            {snap.ph === 'over'
              ? (snap.ended === 'done' ? 'Every letter answered' : 'Out of lives')
              : snap.mode === 'tutor'
                ? (snap.turn === 'tutor' ? 'Throw a card' : 'Their answer')
                : snap.turn === me ? 'Your turn'
                : `Waiting for ${snap.turn === 'tutor' ? 'the teacher' : 'the student'}`}
          </span>
        </div>
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

const FlashStyle: React.FC = () => (
  <style>{`@keyframes lc-flash{0%{opacity:0;transform:scale(.7)}18%{opacity:1;transform:scale(1)}72%{opacity:1}100%{opacity:0;transform:scale(1.15)}}.lc-flash{animation:lc-flash 1s ease forwards}`}</style>
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
  const [fullscreen, setFullscreen] = useState(false);
  const chanRef = useRef<P2PGameChannel | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => { document.title = 'Letter cards'; getLetterCardsGame(gameId).then(setGame); }, [gameId]);

  // iPhone Safari allows full screen on video only, so the button is offered
  // where it works and the board simply fills the window everywhere else.
  const fullscreenAvailable = typeof document !== 'undefined'
    && (document.fullscreenEnabled || !!(document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled);

  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) { void document.exitFullscreen?.(); return; }
    void el.requestFullscreen?.().catch(() => { /* refused — the board still fills the window */ });
  }, []);

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

  const host = isTutor === true;

  // The tutor's device records each finished game once.
  const savedRef = useRef(false);

  const broadcast = useCallback((s: Snap | null) => {
    if (s) chanRef.current?.send({ type: 'broadcast', event: 'board', payload: s });
  }, []);

  const commit = useCallback((s: Snap) => { snapRef.current = s; setSnap(s); broadcast(s); }, [broadcast]);

  /** Throwing a card. Judging only ever runs on the tutor's device. */
  const pick = useCallback((side: 'tutor' | 'student', index: number) => {
    const s = snapRef.current;
    if (!s || s.ph !== 'playing' || s.turn !== side) return;
    if (side === 'tutor') { commit(throwTutor(s, index)); return; }
    const thrown = throwStudent(s, index);
    if (thrown === s) return;
    commit(thrown);
    // A beat with both cards face up, so the pair can be read before it goes.
    window.setTimeout(() => commit(judgeBoard(snapRef.current ?? thrown)), 750);
  }, [commit]);

  // ── The wire ──
  useEffect(() => {
    if (!game || isTutor === null) return;
    const ch = createGameChannel(letterCardsChannel(game.id), host ? 'host' : 'guest');
    chanRef.current = ch;
    if (host) {
      const first = deal(game.letters, game.form, game.lives, game.mode);
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
  }, [game, isTutor, host, broadcast, pick]);

  useEffect(() => {
    if (!host || !game || !snap || snap.ph !== 'over' || savedRef.current) return;
    savedRef.current = true;
    void completeLetterCardsGame({
      id: game.id, score: snap.score, mistakes: snap.mistakes, wrongLetters: snap.wrongLetters,
      endedReason: snap.ended ?? 'done', durationMs: Date.now() - startedAt.current,
    });
  }, [host, game, snap]);

  /** Deal the whole thing again — the tutor's call. */
  const rematch = useCallback(() => {
    if (!host || !game) return;
    savedRef.current = false;
    startedAt.current = Date.now();
    commit(deal(game.letters, game.form, game.lives, game.mode));
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

  const me: 'tutor' | 'student' = host ? 'tutor' : 'student';
  return (
    <Shell wrapRef={wrapRef}>
      <FlashStyle />
      <Board
        snap={snap} me={me}
        onPick={snap.ph === 'playing' ? onPick : undefined}
        onBack={leave}
        onRematch={host ? rematch : undefined}
        onFullscreen={fullscreenAvailable ? toggleFullscreen : undefined}
        fullscreen={fullscreen}
      />
    </Shell>
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
  letters: string[];
  /** The shape the student will hold. 'isolated' means: ask here. */
  initialForm: MatchForm | 'isolated';
  student: { id: string; name: string };
  onClose: () => void;
}> = ({ letters, initialForm, student, onClose }) => {
  const [form, setForm] = useState<MatchForm>(initialForm === 'isolated' ? 'initial' : initialForm);
  const [lives, setLives] = useState<number | null>(3);
  const [mode, setMode] = useState<CardsMode>('multiplayer');
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const studentName = student.name;

  const create = async () => {
    setBusy(true); setErr('');
    const { data } = await supabase.auth.getUser();
    const teacherId = data.user?.id;
    if (!teacherId) { setBusy(false); setErr('Sign in again to start a game.'); return; }
    const g = await createLetterCardsGame({
      teacherId, studentId: student.id, studentName, letters, form, lives, mode,
    });
    setBusy(false);
    if (g) setGame(g); else setErr('Could not start the game — check the connection.');
  };

  if (game) {
    const url = letterCardsUrl(game.id);
    return (
      <div className="p-5 sm:p-6 space-y-4">
        <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">Ready to play</h3>
        {mode === 'multiplayer' ? (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Send this to {studentName}, then open it yourself — you deal from your side.
            </p>
            <div className="flex justify-center py-2"><QRCodeSVG value={url} size={168} /></div>
            <div className="flex gap-2">
              <input readOnly value={url}
                className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-900 text-xs" />
              <button onClick={() => { navigator.clipboard?.writeText(url).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="h-10 px-4 rounded-xl bg-slate-800 text-white text-sm font-bold">{copied ? '✓' : 'Copy'}</button>
            </div>
            <button onClick={() => { void notifyLetterCardsInvite(game); }}
              className="w-full h-11 rounded-xl border-2 border-teal-600 text-teal-700 font-black">
              Send it to {studentName}
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You hold both hands. {studentName} tells you which animal to throw.
          </p>
        )}
        <a href={`/letter-cards/${game.id}`}
          className="block w-full h-12 rounded-xl bg-teal-700 text-white font-black flex items-center justify-center">
          Open the board
        </a>
        <button onClick={onClose} className="w-full py-2 text-sm text-slate-500">Close</button>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6 space-y-5">
      <div>
        <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">Letter cards</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {letters.length} letter{letters.length === 1 ? '' : 's'} · you hold the isolated shape,
          {' '}{studentName} holds the {FORM_LABEL[form].en.toLowerCase()} shape.
        </p>
      </div>

      <div>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">How you play it</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {([
            ['multiplayer', 'Together, by link', 'Each of you sees only your own cards.'],
            ['tutor', 'On my screen only', 'Both hands face up. They tell you what to throw.'],
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

      <div>
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

      <div>
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
        <button onClick={create} disabled={busy || letters.length === 0}
          className="flex-1 h-12 rounded-xl bg-teal-700 text-white font-black disabled:opacity-40">
          {busy ? 'Dealing…' : 'Start'}
        </button>
      </div>
    </div>
  );
};

export default LetterCardsPage;
