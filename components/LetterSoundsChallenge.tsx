// components/LetterSoundsChallenge.tsx
// ---------------------------------------------------------------------------
// Letter sounds — the listening challenge.
//
// A Qaedah lesson's vowel, every letter of the alphabet, one sound at a time.
// The student does nothing but listen, so the screen holds one thing: the
// letter, as large as it will go, carrying the vowel.
//
// Two components:
//   LetterSoundsSetup      the tutor picks a shape, then listens together or
//                          sends a link.
//   LetterSoundsChallenge  the thing itself, full screen.
//
// The first sound needs a tap. Browsers refuse audio until the page has had a
// gesture, so there is a start screen rather than a silent first letter the
// student thinks is broken.
// ---------------------------------------------------------------------------
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ARABIC_LETTERS, letterAudioUrl, speakLetter } from '../services/letterAudioService';
import {
  FORM_LABEL, VOWEL_LABEL, glyphFor, letterSoundsUrl,
  createLetterSounds, markLetterSoundsOpened, markLetterSoundsFinished,
  type LetterForm, type Vowel, type LetterSoundChallenge,
} from '../services/letterSoundsService';

const ARABIC = "'Hafs', 'Amiri', serif";

/* ── The booth's palette. Deep green ink, cream letter, gold for the sound. */
const C = {
  ground: '#0E201C',
  panel:  '#152B26',
  raised: '#1C3832',
  line:   '#27463F',
  cream:  '#F4EFE2',
  body:   '#C3D4CD',
  muted:  '#9DB3AB',
  gold:   '#E0A942',
  onGold: '#231703',
};

const FORMS: LetterForm[] = ['isolated', 'initial', 'medial', 'final'];

/* ── Setup: shape, then together or by link ──────────────────────────── */

export const LetterSoundsSetup: React.FC<{
  vowel: Vowel;
  topicId: string;
  topicTitle: string;
  teacherId?: string;
  studentId?: string;
  studentName?: string;
  /** Student view: no link to send, just start. */
  studentMode?: boolean;
  onStart: (form: LetterForm) => void;
  onClose: () => void;
}> = ({ vowel, topicId, topicTitle, teacherId, studentId, studentName, studentMode, onStart, onClose }) => {
  const [form, setForm] = useState<LetterForm>('isolated');
  const [link, setLink] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const makeLink = async () => {
    if (!teacherId || !studentId) { setError('Open a student first to send them a link.'); return; }
    setBusy(true); setError('');
    const made = await createLetterSounds({
      teacherId, studentId, studentName, topicId, topicTitle, vowel, form,
    });
    setBusy(false);
    if (!made) { setError('Could not make the link. Try again.'); return; }
    setLink(letterSoundsUrl(made.id));
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { /* the link is on screen anyway */ }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center overflow-y-auto p-0 sm:p-6"
      style={{ background: 'rgba(5,14,12,0.76)' }} role="dialog" aria-modal="true" aria-label="Listen to the letters">
      <div className="w-full sm:max-w-[620px] sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.cream, minHeight: '100dvh', maxHeight: '100dvh' }}>

        <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4" style={{ borderBottom: `1px solid #1E3832` }}>
          <div className="min-w-0 flex-grow">
            <p className="m-0 text-[11.5px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.gold }}>
              Listen to the letters
            </p>
            <h2 className="m-0 mt-1.5 text-[22px] font-extrabold" style={{ letterSpacing: '-0.015em' }}>{topicTitle}</h2>
            <p className="m-0 mt-1.5 text-sm leading-relaxed" style={{ color: '#A8BDB5' }}>
              Every letter of the alphabet, said with {VOWEL_LABEL[vowel].toLowerCase()}. The student only listens.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex-shrink-0 flex items-center justify-center w-11 h-11 -mt-1 -mr-2 rounded-xl"
            style={{ background: 'transparent', color: C.muted, border: 0 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-grow overflow-y-auto px-5 sm:px-6 py-5">
          <p className="m-0 mb-3 text-[11.5px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.muted }}>
            Which shape of the letter
          </p>
          <div className="flex flex-wrap gap-2.5">
            {FORMS.map(f => {
              const on = form === f;
              return (
                <button key={f} type="button" onClick={() => setForm(f)} aria-pressed={on}
                  className="inline-flex items-center gap-2.5 h-[52px] px-4 rounded-[13px]"
                  style={{
                    background: on ? C.raised : '#10251F',
                    border: `1px solid ${on ? C.gold : '#1E3832'}`,
                    color: on ? C.cream : C.body,
                  }}>
                  <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 26, lineHeight: 1, color: on ? C.gold : C.muted }}>
                    {glyphFor('ب', f, vowel)}
                  </span>
                  <span className="text-[13.5px] font-bold">{FORM_LABEL[f]}</span>
                </button>
              );
            })}
          </div>
          <p className="m-0 mt-3 mx-0.5 text-[12.5px] leading-relaxed" style={{ color: '#7E968E' }}>
            The shape changes, the sound does not —{' '}
            <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 19, color: C.body }}>{glyphFor('ب', 'initial', vowel)}</span>
            {' and '}
            <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 19, color: C.body }}>{glyphFor('ب', 'medial', vowel)}</span>
            {' are the same sound.'}
          </p>

          <div className="mt-6 p-[18px] rounded-[14px]" style={{ background: '#10251F', border: `1px solid #1E3832` }}>
            <p className="m-0 mb-3.5 text-[11.5px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.muted }}>First few</p>
            <div className="flex flex-wrap items-center gap-[18px]">
              {ARABIC_LETTERS.slice(0, 5).map(l => (
                <span key={l} lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 44, lineHeight: 1, color: C.cream }}>
                  {glyphFor(l, form, vowel)}
                </span>
              ))}
              <span className="text-sm font-bold" style={{ color: '#7E968E' }}>… {ARABIC_LETTERS.length} letters</span>
            </div>
          </div>

          <p className="m-0 mt-6 mb-3 text-[11.5px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.muted }}>
            {studentMode ? 'Ready' : 'How are you doing it'}
          </p>

          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={() => onStart(form)}
              className="flex items-center gap-4 px-[19px] py-[17px] rounded-[14px] text-left"
              style={{ background: C.gold, color: C.onGold, border: 0 }}>
              <span className="flex-shrink-0 inline-flex items-center justify-center w-[42px] h-[42px] rounded-xl" style={{ background: 'rgba(35,23,3,0.14)' }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
              </span>
              <span className="min-w-0">
                <span className="block text-base font-extrabold">{studentMode ? 'Start listening' : 'Listen together now'}</span>
                <span className="block mt-0.5 text-[13px] font-semibold opacity-80">
                  {studentMode ? 'Full screen, one letter at a time' : 'Opens full screen on this device, for the lesson'}
                </span>
              </span>
            </button>

            {!studentMode && !link && (
              <button type="button" onClick={() => void makeLink()} disabled={busy}
                className="flex items-center gap-4 px-[19px] py-[17px] rounded-[14px] text-left disabled:opacity-60"
                style={{ background: C.raised, color: C.cream, border: `1px solid ${C.line}` }}>
                <span className="flex-shrink-0 inline-flex items-center justify-center w-[42px] h-[42px] rounded-xl" style={{ background: C.line, color: C.gold }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9.5 14.5l5-5" />
                    <path d="M12.8 7.2l1.9-1.9a3.4 3.4 0 0 1 4.8 4.8l-1.9 1.9" />
                    <path d="M11.2 16.8l-1.9 1.9a3.4 3.4 0 0 1-4.8-4.8l1.9-1.9" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-extrabold">{busy ? 'Making the link…' : 'Send a link'}</span>
                  <span className="block mt-0.5 text-[13px] font-semibold" style={{ color: '#A8BDB5' }}>
                    They listen on their own, whenever — you get a note when they do
                  </span>
                </span>
              </button>
            )}

            {link && (
              <div className="p-[18px] rounded-[14px]" style={{ background: '#10251F', border: `1px solid ${C.gold}` }}>
                <p className="m-0 mb-2.5 text-[11.5px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.gold }}>Their link</p>
                <p className="m-0 break-all text-[13px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.body }}>{link}</p>
                <button type="button" onClick={() => void copy()}
                  className="mt-3 h-11 px-5 rounded-[10px] text-sm font-extrabold"
                  style={{ background: C.gold, color: C.onGold, border: 0 }}>
                  {copied ? '✓ Copied' : 'Copy link'}
                </button>
              </div>
            )}
          </div>

          {error && <p role="alert" className="mt-4 mb-0 text-[13.5px]" style={{ color: '#F0B5AE' }}>{error}</p>}

          {!studentMode && (
            <p className="m-0 mt-[18px] mx-0.5 text-[12.5px] leading-relaxed" style={{ color: '#7E968E' }}>
              It is in their portal under Qaedah too, so they can come back to it without the link.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── The challenge ───────────────────────────────────────────────────── */

const LetterSoundsChallenge: React.FC<{
  vowel: Vowel;
  form: LetterForm;
  topicTitle: string;
  /** Present when opened from a link: marks opened/finished and notifies. */
  challenge?: LetterSoundChallenge;
  onExit: () => void;
}> = ({ vowel, form, topicTitle, challenge, onExit }) => {
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reachedEnd = useRef(false);

  const letter = ARABIC_LETTERS[i];

  /** Play this letter. Falls back to the browser voice when there is no file,
   *  so a set that is only half recorded is still usable. */
  const play = useCallback((which: string) => {
    audioRef.current?.pause();
    const audio = new Audio(letterAudioUrl(which, vowel));
    audioRef.current = audio;
    setPlaying(true);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => { setPlaying(false); speakLetter(which + (vowel === 'fatha' ? 'َ' : vowel === 'kasra' ? 'ِ' : 'ُ')); };
    audio.play().catch(() => { setPlaying(false); });
  }, [vowel]);

  // Every letter speaks as it arrives — that is the whole exercise.
  useEffect(() => {
    if (!started) return;
    play(ARABIC_LETTERS[i]);
  }, [started, i, play]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  useEffect(() => { if (challenge) void markLetterSoundsOpened(challenge.id); }, [challenge]);

  // Reaching the last letter is "done" — there is nothing to score.
  useEffect(() => {
    if (!started || reachedEnd.current) return;
    if (i < ARABIC_LETTERS.length - 1) return;
    reachedEnd.current = true;
    if (challenge) void markLetterSoundsFinished(challenge);
  }, [started, i, challenge]);

  // Arrow keys, for a tutor driving it from a keyboard in the lesson.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI(n => Math.min(ARABIC_LETTERS.length - 1, n + 1));
      else if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1));
      else if (e.key === ' ') { e.preventDefault(); play(ARABIC_LETTERS[i]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, i, play]);

  const shell = (inner: React.ReactNode) => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: C.ground, color: C.cream,
      fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {inner}
    </div>
  );

  // ── The tap that lets the first sound play ──────────────────────────
  if (!started) {
    return shell(
      <div className="flex-grow flex flex-col items-center justify-center gap-7 px-6 text-center">
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 'clamp(120px, 34vw, 210px)', lineHeight: 1.15, color: C.cream }}>
          {glyphFor('ب', form, vowel)}
        </span>
        <div>
          <h1 className="m-0 text-[22px] sm:text-[26px] font-extrabold" style={{ letterSpacing: '-0.015em' }}>{topicTitle}</h1>
          <p className="m-0 mt-2 text-[15px]" style={{ color: C.muted }}>
            {ARABIC_LETTERS.length} letters · {FORM_LABEL[form].toLowerCase()} · just listen
          </p>
        </div>
        <button type="button" onClick={() => setStarted(true)}
          className="inline-flex items-center gap-3 h-[60px] px-8 rounded-full text-[17px] font-extrabold"
          style={{ background: C.gold, color: C.onGold, border: 0 }}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
          Start listening
        </button>
        <button type="button" onClick={onExit} className="text-sm font-bold" style={{ background: 'none', border: 0, color: C.muted }}>
          Leave
        </button>
      </div>,
    );
  }

  const atStart = i === 0;
  const atEnd = i === ARABIC_LETTERS.length - 1;

  return shell(<>
    {/* quiet top bar */}
    <div className="flex-shrink-0" style={{ borderBottom: `1px solid #1E3832` }}>
      <div className="flex flex-wrap items-center gap-3.5 px-5 py-3.5">
        <span className="inline-flex items-center gap-2.5 min-w-0">
          <span className="flex-shrink-0 inline-flex items-center justify-center w-[38px] h-[38px] rounded-[11px]"
            style={{ background: C.raised, border: `1px solid ${C.line}`, color: C.gold }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4z" />
              <path d="M16 9.2a4 4 0 0 1 0 5.6" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[15.5px] font-extrabold truncate" style={{ letterSpacing: '-0.01em' }}>{topicTitle}</span>
            <span className="block mt-px text-[12.5px]" style={{ color: C.muted }}>Listen to each letter</span>
          </span>
        </span>

        <span className="flex-grow" />

        <span className="inline-flex items-center gap-2 h-[34px] px-3.5 rounded-full text-[13px] font-bold"
          style={{ background: C.raised, border: `1px solid ${C.line}`, color: C.body }}>
          <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 17, color: C.gold }}>{glyphFor('ب', form, vowel)}</span>
          {FORM_LABEL[form]}
        </span>
        <span className="text-[13.5px] font-bold tabular-nums" style={{ color: C.muted }}>
          {i + 1} of {ARABIC_LETTERS.length}
        </span>
        <button type="button" onClick={onExit} aria-label="Leave"
          className="inline-flex items-center justify-center w-11 h-11 rounded-[11px]"
          style={{ background: 'transparent', border: 0, color: C.muted }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>

    {/* the letter */}
    <div className="flex-grow flex flex-col items-center justify-center gap-8 px-5 pt-8 pb-6 text-center">
      <div className="relative flex items-center justify-center w-full">
        <span aria-hidden="true" style={{
          position: 'absolute', width: 'min(520px, 76vw)', height: 'min(520px, 76vw)', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(224,169,66,0.16) 0%, rgba(224,169,66,0) 68%)',
          opacity: playing ? 1 : 0, transition: 'opacity 240ms ease',
        }} />
        <span lang="ar" dir="rtl" aria-live="polite"
          style={{ position: 'relative', fontFamily: ARABIC, fontSize: 'clamp(160px, 44vw, 360px)', lineHeight: 1.12, color: C.cream }}>
          {glyphFor(letter, form, vowel)}
        </span>
      </div>

      <button type="button" onClick={() => play(letter)}
        className="inline-flex items-center gap-3 h-[60px] px-[30px] rounded-full text-[17px] font-extrabold"
        style={{ background: C.gold, color: C.onGold, border: 0 }}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4z" />
          <path d="M16 9.2a4 4 0 0 1 0 5.6" />
        </svg>
        Listen again
      </button>
    </div>

    {/* moving through the alphabet */}
    <div className="flex-shrink-0 px-5 pb-7">
      <div className="flex items-center justify-center gap-4 max-w-[760px] mx-auto">
        <button type="button" onClick={() => setI(n => Math.max(0, n - 1))} disabled={atStart}
          aria-label="Previous letter"
          className="inline-flex items-center justify-center gap-2.5 h-16 flex-1 min-w-0 px-5 rounded-[18px] text-base font-bold disabled:opacity-40"
          style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.cream }}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 5.5L8 12l6.5 6.5" />
          </svg>
          Back
        </button>
        <button type="button" onClick={() => setI(n => Math.min(ARABIC_LETTERS.length - 1, n + 1))} disabled={atEnd}
          aria-label="Next letter"
          className="inline-flex items-center justify-center gap-2.5 h-16 flex-1 min-w-0 px-5 rounded-[18px] text-base font-extrabold disabled:opacity-40"
          style={{ background: C.raised, border: 0, color: C.cream }}>
          Next
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.5 5.5L16 12l-6.5 6.5" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-1 mt-5">
        {ARABIC_LETTERS.map((l, n) => (
          <span key={l} title={`Letter ${n + 1}`}
            style={{ width: 16, height: 6, borderRadius: 3, background: n === i ? C.gold : n < i ? '#3C6459' : '#22403A' }} />
        ))}
      </div>
    </div>
  </>);
};

export default LetterSoundsChallenge;
