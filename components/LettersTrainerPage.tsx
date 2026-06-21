import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../context/I18nProvider';
import {
  TrainerState,
  TrainerStudent,
  LetterChallenge,
  TajweedChallenge,
  TrainerVerse,
  loadTrainerState,
  saveTrainerState,
  newTrainerId,
  tokenizeVerse,
  autoMatchedIndices,
  shuffle,
} from '../services/lettersTrainerService';

type View =
  | { name: 'home' }
  | { name: 'student'; studentId: string }
  | { name: 'newChallenge'; studentId?: string }
  | { name: 'newTajweed'; studentId?: string }
  | { name: 'runner'; studentId: string; challengeId: string }
  | { name: 'tajweedRunner'; studentId: string; tajweedId: string };

// --- Avatar colours -----------------------------------------------------------

const AVATAR_COLORS = [
  'bg-teal-500', 'bg-purple-500', 'bg-rose-500',
  'bg-amber-500', 'bg-blue-500', 'bg-emerald-500', 'bg-indigo-500',
];
const avatarColor = (name: string) => {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
};

// --- Reusable atoms ----------------------------------------------------------

const cardCls =
  'bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 mb-5 border border-slate-100 dark:border-gray-700';

const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
  <div className={`${cardCls} ${className || ''}`}>{children}</div>
);

const SectionLabel: React.FC<React.PropsWithChildren> = ({ children }) => (
  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
    {children}
  </p>
);

const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'success' | 'danger' | 'ghost' | 'tajweed' | 'default';
    size?: 'sm' | 'md' | 'lg';
  }
> = ({ variant = 'default', size = 'md', className = '', children, ...rest }) => {
  const sizeCls =
    size === 'sm' ? 'px-3 py-1.5 text-sm' :
    size === 'lg' ? 'px-6 py-3 text-base' :
    'px-4 py-2 text-sm';
  const variants: Record<string, string> = {
    primary: 'bg-teal-600 dark:bg-orange-600 text-white hover:bg-teal-700 dark:hover:bg-orange-700',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700',
    tajweed: 'bg-teal-700 text-white hover:bg-teal-800',
    default:
      'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-gray-600 border border-slate-200 dark:border-gray-600',
  };
  return (
    <button
      {...rest}
      className={`rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${sizeCls} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

// iOS-style toggle switch
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl border border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-700/50 cursor-pointer select-none">
    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
    <div className="relative flex-shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="w-11 h-6 rounded-full bg-slate-300 dark:bg-gray-600 peer-checked:bg-teal-500 dark:peer-checked:bg-orange-500 transition-colors duration-200" />
      <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 peer-checked:translate-x-5" />
    </div>
  </label>
);

// Icon-only edit button
const IconEditBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => (
  <button
    {...props}
    className={`p-2 rounded-xl text-slate-400 hover:text-teal-600 dark:hover:text-orange-400 hover:bg-teal-50 dark:hover:bg-orange-900/20 transition-all ${props.className || ''}`}
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
    </svg>
  </button>
);

// Icon-only delete button
const IconDeleteBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => (
  <button
    {...props}
    className={`p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all ${props.className || ''}`}
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  </button>
);

// Start button with play icon
const StartBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'letter' | 'tajweed' }> = ({ variant = 'letter', children, ...rest }) => (
  <button
    {...rest}
    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-sm font-semibold transition-all active:scale-95 shadow-sm ${
      variant === 'tajweed'
        ? 'bg-teal-700 hover:bg-teal-800'
        : 'bg-teal-600 dark:bg-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700'
    }`}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
      <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
    </svg>
    {children}
  </button>
);

// Add challenge button with + icon
const AddChallengeBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'letter' | 'tajweed' }> = ({ variant = 'letter', children, ...rest }) => (
  <button
    {...rest}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-all active:scale-95 shadow-sm ${
      variant === 'tajweed'
        ? 'bg-teal-700 hover:bg-teal-800'
        : 'bg-teal-600 dark:bg-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700'
    }`}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 flex-shrink-0">
      <path fillRule="evenodd" d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
    </svg>
    {children}
  </button>
);

const Crumbs: React.FC<{ items: { label: string; onClick?: () => void }[] }> = ({ items }) => (
  <nav className="text-sm text-slate-500 dark:text-slate-400 mb-5 flex flex-wrap items-center gap-1">
    {items.map((it, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>}
        {it.onClick ? (
          <button onClick={it.onClick} className="hover:text-teal-600 dark:hover:text-orange-400 transition-colors underline-offset-2 hover:underline">
            {it.label}
          </button>
        ) : (
          <span className="text-slate-700 dark:text-slate-200 font-medium">{it.label}</span>
        )}
      </React.Fragment>
    ))}
  </nav>
);

// --- Confirm modal -----------------------------------------------------------

const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, body, confirmLabel, onConfirm, onCancel }) => {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">{title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">{body}</p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onCancel}>{t('lettersTrainer.cancel')}</Btn>
          <Btn variant="danger" onClick={() => { onCancel(); onConfirm(); }}>
            {confirmLabel ?? t('lettersTrainer.confirm')}
          </Btn>
        </div>
      </div>
    </div>
  );
};

// --- Verse display -----------------------------------------------------------

const VerseDisplay: React.FC<{
  text: string;
  letters?: string[];
  marks?: number[];
  highlight: boolean;
  variant?: 'letter' | 'tajweed';
  className?: string;
}> = ({ text, letters = [], marks = [], highlight, variant = 'letter', className }) => {
  const tokens = useMemo(() => tokenizeVerse(text), [text]);
  const targetSet = useMemo(() => new Set(letters), [letters]);
  const markSet = useMemo(() => new Set(marks), [marks]);
  const highlightCls =
    variant === 'tajweed'
      ? 'text-teal-600 dark:text-teal-400 font-bold'
      : 'text-red-500 dark:text-red-400 font-bold';
  return (
    <span className={`font-quranic ${className || ''}`} dir="rtl">
      {tokens.map((tok, i) => {
        const auto = tok.clickable && targetSet.has(Array.from(tok.text)[0]);
        const manual = markSet.has(i);
        if (highlight && (auto || manual)) {
          return <span key={i} className={highlightCls}>{tok.text}</span>;
        }
        return <span key={i}>{tok.text}</span>;
      })}
    </span>
  );
};

// --- Editable verse (wizard) -------------------------------------------------

const EditableVerse: React.FC<{
  text: string;
  letters: string[];
  marks: number[];
  variant: 'letter' | 'tajweed';
  onToggleMark: (tokenIdx: number) => void;
}> = ({ text, letters, marks, variant, onToggleMark }) => {
  const tokens = useMemo(() => tokenizeVerse(text), [text]);
  const auto = useMemo(() => autoMatchedIndices(text, letters), [text, letters]);
  const manualSet = useMemo(() => new Set(marks), [marks]);
  return (
    <span className="font-quranic text-2xl leading-loose" dir="rtl">
      {tokens.map((tok, i) => {
        if (!tok.clickable) return <span key={i}>{tok.text}</span>;
        const isAuto = auto.has(i);
        const isManual = manualSet.has(i);
        const baseCls = 'cursor-pointer rounded px-0.5 transition-colors';
        let extra = 'hover:bg-slate-100 dark:hover:bg-gray-700';
        if (variant === 'letter') {
          if (isAuto) extra = 'text-red-500 dark:text-red-400 font-bold';
          else if (isManual) extra = 'text-red-500 dark:text-red-400 font-bold underline decoration-dotted';
        } else {
          if (isManual) extra = 'text-teal-600 dark:text-teal-400 font-bold';
        }
        return (
          <span key={i} className={`${baseCls} ${extra}`} onClick={() => onToggleMark(i)}>
            {tok.text}
          </span>
        );
      })}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LettersTrainerPageProps {
  /** When provided the trainer skips the student-selection home screen and
   *  goes straight to this student's history view. If the student doesn't
   *  exist yet in the local trainer data they are created automatically. */
  preSelectedStudent?: { id: string; name: string };
}

const LettersTrainerPage: React.FC<LettersTrainerPageProps> = ({ preSelectedStudent }) => {
  const { t } = useI18n();
  const [state, setState] = useState<TrainerState>(() => {
    const loaded = loadTrainerState();
    if (preSelectedStudent && !loaded.students.some(s => s.id === preSelectedStudent.id)) {
      // Auto-register the student so their trainer history is stored under
      // the same ID used by the rest of the app.
      return { ...loaded, students: [...loaded.students, { id: preSelectedStudent.id, name: preSelectedStudent.name }] };
    }
    return loaded;
  });
  const [view, setView] = useState<View>(() =>
    preSelectedStudent ? { name: 'student', studentId: preSelectedStudent.id } : { name: 'home' }
  );
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    onConfirm: () => void;
  } | null>(null);

  const editingLetterRef = useRef<LetterChallenge | null>(null);
  const editingTajweedRef = useRef<TajweedChallenge | null>(null);

  useEffect(() => {
    saveTrainerState(state);
  }, [state]);

  const update = (mut: (s: TrainerState) => void) =>
    setState(prev => {
      const copy: TrainerState = JSON.parse(JSON.stringify(prev));
      mut(copy);
      return copy;
    });

  const askConfirm = (title: string, body: string, onConfirm: () => void) =>
    setConfirm({ title, body, onConfirm });

  const addStudent = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    update(s => { s.students.push({ id: newTrainerId(), name: trimmed }); });
  };

  const renameStudent = (id: string, name: string) => {
    update(s => {
      const st = s.students.find(x => x.id === id);
      if (st) st.name = name;
    });
  };

  const removeStudent = (id: string) => {
    update(s => {
      s.students = s.students.filter(x => x.id !== id);
      delete s.completions[id];
      delete s.tajweedCompletions[id];
    });
  };

  const deleteChallenge = (id: string) => {
    update(s => {
      s.challenges = s.challenges.filter(c => c.id !== id);
      Object.values(s.completions).forEach(rec => { delete rec[id]; });
    });
  };

  const deleteTajweed = (id: string) => {
    update(s => {
      s.tajweedChallenges = s.tajweedChallenges.filter(c => c.id !== id);
      Object.values(s.tajweedCompletions).forEach(rec => { delete rec[id]; });
    });
  };

  const saveLetterChallenge = (draft: LetterChallenge) => {
    update(s => {
      const idx = s.challenges.findIndex(c => c.id === draft.id);
      if (idx >= 0) s.challenges[idx] = draft;
      else s.challenges.push(draft);
    });
  };

  const saveTajweedChallenge = (draft: TajweedChallenge) => {
    update(s => {
      const idx = s.tajweedChallenges.findIndex(c => c.id === draft.id);
      if (idx >= 0) s.tajweedChallenges[idx] = draft;
      else s.tajweedChallenges.push(draft);
    });
  };

  const incrementLetterCompletion = (studentId: string, challengeId: string) => {
    update(s => {
      if (!s.completions[studentId]) s.completions[studentId] = {};
      s.completions[studentId][challengeId] = (s.completions[studentId][challengeId] || 0) + 1;
    });
  };

  const incrementTajweedCompletion = (studentId: string, tajweedId: string) => {
    update(s => {
      if (!s.tajweedCompletions[studentId]) s.tajweedCompletions[studentId] = {};
      s.tajweedCompletions[studentId][tajweedId] = (s.tajweedCompletions[studentId][tajweedId] || 0) + 1;
    });
  };

  const goHome = () => setView({ name: 'home' });
  const openStudent = (id: string) => setView({ name: 'student', studentId: id });

  let content: React.ReactNode = null;

  if (view.name === 'home') {
    content = (
      <HomeView
        state={state}
        onAddStudent={addStudent}
        onOpenStudent={openStudent}
        onRenameStudent={renameStudent}
        onRemoveStudent={(id, name) =>
          askConfirm(
            t('lettersTrainer.removeStudentTitle'),
            t('lettersTrainer.removeStudentBody', { name }),
            () => removeStudent(id),
          )
        }
        onEditChallenge={c => { editingLetterRef.current = c; setView({ name: 'newChallenge' }); }}
        onDeleteChallenge={c =>
          askConfirm(
            t('lettersTrainer.deleteChallengeTitle'),
            t('lettersTrainer.deleteChallengeBody'),
            () => deleteChallenge(c.id),
          )
        }
        onEditTajweed={c => { editingTajweedRef.current = c; setView({ name: 'newTajweed' }); }}
        onDeleteTajweed={c =>
          askConfirm(
            t('lettersTrainer.deleteTajweedTitle'),
            t('lettersTrainer.deleteTajweedBody'),
            () => deleteTajweed(c.id),
          )
        }
      />
    );
  } else if (view.name === 'student') {
    const student = state.students.find(s => s.id === view.studentId);
    if (!student) { setView({ name: 'home' }); return null; }
    content = (
      <StudentView
        state={state}
        student={student}
        onHome={goHome}
        onRename={name => renameStudent(student.id, name)}
        onPrev={id => setView({ name: 'student', studentId: id })}
        onAddChallenge={() => { editingLetterRef.current = null; setView({ name: 'newChallenge', studentId: student.id }); }}
        onAddTajweed={() => { editingTajweedRef.current = null; setView({ name: 'newTajweed', studentId: student.id }); }}
        onEditChallenge={c => { editingLetterRef.current = c; setView({ name: 'newChallenge', studentId: student.id }); }}
        onEditTajweed={c => { editingTajweedRef.current = c; setView({ name: 'newTajweed', studentId: student.id }); }}
        onStartChallenge={c => setView({ name: 'runner', studentId: student.id, challengeId: c.id })}
        onStartTajweed={c => setView({ name: 'tajweedRunner', studentId: student.id, tajweedId: c.id })}
        locked={!!preSelectedStudent}
      />
    );
  } else if (view.name === 'newChallenge') {
    const student = view.studentId ? state.students.find(s => s.id === view.studentId) : undefined;
    content = (
      <ChallengeWizard
        existing={editingLetterRef.current}
        student={student}
        onCancel={prompt => {
          const close = () => {
            editingLetterRef.current = null;
            if (student) setView({ name: 'student', studentId: student.id });
            else goHome();
          };
          if (prompt) askConfirm(t('lettersTrainer.discardChangesTitle'), t('lettersTrainer.discardChangesBody'), close);
          else close();
        }}
        onSave={c => {
          saveLetterChallenge(c);
          editingLetterRef.current = null;
          if (student) setView({ name: 'student', studentId: student.id });
          else goHome();
        }}
        onHome={() => { editingLetterRef.current = null; goHome(); }}
        onStudentCrumb={() => { editingLetterRef.current = null; if (student) setView({ name: 'student', studentId: student.id }); }}
      />
    );
  } else if (view.name === 'newTajweed') {
    const student = view.studentId ? state.students.find(s => s.id === view.studentId) : undefined;
    content = (
      <TajweedWizard
        existing={editingTajweedRef.current}
        student={student}
        onCancel={prompt => {
          const close = () => {
            editingTajweedRef.current = null;
            if (student) setView({ name: 'student', studentId: student.id });
            else goHome();
          };
          if (prompt) askConfirm(t('lettersTrainer.discardChangesTitle'), t('lettersTrainer.discardChangesBody'), close);
          else close();
        }}
        onSave={c => {
          saveTajweedChallenge(c);
          editingTajweedRef.current = null;
          if (student) setView({ name: 'student', studentId: student.id });
          else goHome();
        }}
        onHome={() => { editingTajweedRef.current = null; goHome(); }}
        onStudentCrumb={() => { editingTajweedRef.current = null; if (student) setView({ name: 'student', studentId: student.id }); }}
      />
    );
  } else if (view.name === 'runner') {
    const student = state.students.find(s => s.id === view.studentId);
    const challenge = state.challenges.find(c => c.id === view.challengeId);
    if (!student || !challenge) { setView({ name: 'home' }); return null; }
    content = (
      <ChallengeRunner
        student={student}
        challenge={challenge}
        onComplete={() => incrementLetterCompletion(student.id, challenge.id)}
        onHome={goHome}
        onStudent={() => setView({ name: 'student', studentId: student.id })}
      />
    );
  } else if (view.name === 'tajweedRunner') {
    const student = state.students.find(s => s.id === view.studentId);
    const tajweed = state.tajweedChallenges.find(c => c.id === view.tajweedId);
    if (!student || !tajweed) { setView({ name: 'home' }); return null; }
    content = (
      <TajweedRunner
        student={student}
        tajweed={tajweed}
        onComplete={() => incrementTajweedCompletion(student.id, tajweed.id)}
        onHome={goHome}
        onStudent={() => setView({ name: 'student', studentId: student.id })}
      />
    );
  }

  return (
    <div>
      <header className="mb-8 text-center">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-700 dark:from-orange-500 dark:to-orange-700 rounded-2xl flex items-center justify-center text-white text-2xl font-bold font-quranic shadow-lg">
            ح
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100">
            {t('lettersTrainer.pageTitle')}
          </h2>
        </div>
        <div className="w-20 h-1 bg-gradient-to-r from-teal-400 via-teal-500 to-teal-300 dark:from-orange-400 dark:via-orange-500 dark:to-orange-300 mx-auto rounded-full" />
      </header>

      {content}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title || ''}
        body={confirm?.body || ''}
        onConfirm={() => { confirm?.onConfirm(); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// HOME VIEW
// ---------------------------------------------------------------------------

const HomeView: React.FC<{
  state: TrainerState;
  onAddStudent: (name: string) => void;
  onOpenStudent: (id: string) => void;
  onRenameStudent: (id: string, name: string) => void;
  onRemoveStudent: (id: string, name: string) => void;
  onEditChallenge: (c: LetterChallenge) => void;
  onDeleteChallenge: (c: LetterChallenge) => void;
  onEditTajweed: (c: TajweedChallenge) => void;
  onDeleteTajweed: (c: TajweedChallenge) => void;
}> = ({
  state, onAddStudent, onOpenStudent, onRenameStudent, onRemoveStudent,
  onEditChallenge, onDeleteChallenge, onEditTajweed, onDeleteTajweed,
}) => {
  const { t } = useI18n();
  const [name, setName] = useState('');

  return (
    <>
      <Card>
        <SectionLabel>{t('lettersTrainer.students')}</SectionLabel>
        <div className="flex gap-2 mb-5 flex-wrap">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onAddStudent(name); setName(''); } }}
            placeholder={t('lettersTrainer.studentNamePlaceholder')}
            className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-700 text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400 dark:focus:ring-orange-400"
          />
          <Btn variant="primary" onClick={() => { onAddStudent(name); setName(''); }}>
            {t('lettersTrainer.addStudent')}
          </Btn>
        </div>

        {state.students.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic py-4 text-center">
            {t('lettersTrainer.noStudents')}
          </p>
        ) : (
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
            {state.students.map(s => {
              const letterTotal = (Object.values(state.completions[s.id] || {}) as number[]).reduce((a, b) => a + b, 0);
              const tajweedTotal = (Object.values(state.tajweedCompletions[s.id] || {}) as number[]).reduce((a, b) => a + b, 0);
              const total = letterTotal + tajweedTotal;
              const color = avatarColor(s.name);
              return (
                <div
                  key={s.id}
                  onClick={() => onOpenStudent(s.id)}
                  className="relative cursor-pointer p-4 rounded-2xl border-2 border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-700/40 hover:border-teal-400 dark:hover:border-orange-400 hover:shadow-md transition-all group"
                >
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const next = window.prompt('Rename student:', s.name);
                      if (next && next.trim() && next.trim() !== s.name) onRenameStudent(s.id, next.trim());
                    }}
                    className="absolute top-2 right-8 text-slate-300 dark:text-gray-600 group-hover:text-slate-400 hover:!text-teal-500 dark:hover:!text-orange-400 transition-colors text-sm"
                  >✎</button>
                  <button
                    onClick={e => { e.stopPropagation(); onRemoveStudent(s.id, s.name); }}
                    className="absolute top-2 right-2 text-slate-300 dark:text-gray-600 group-hover:text-slate-400 hover:!text-red-500 transition-colors font-bold"
                  >×</button>
                  <div className={`w-11 h-11 ${color} rounded-full flex items-center justify-center text-white text-lg font-bold mb-3 shadow-sm`}>
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100 mb-2 pr-8 truncate">{s.name}</div>
                  {total > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                      {total === 1
                        ? t('lettersTrainer.completionSingle')
                        : t('lettersTrainer.completionsTotal', { count: String(total) })}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {state.challenges.length > 0 && (
        <Card>
          <SectionLabel>{t('lettersTrainer.letterChallenges')} · {state.challenges.length}</SectionLabel>
          <div className="space-y-2">
            {state.challenges.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-100 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-700/30">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {c.letters.map((l, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="text-xs text-slate-400 dark:text-slate-500">{t('lettersTrainer.vs')}</span>}
                      <span className="font-quranic text-2xl w-9 h-9 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-lg flex items-center justify-center shadow-sm text-slate-800 dark:text-slate-100">
                        {l}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
                <div className="flex-1 text-sm text-slate-500 dark:text-slate-400">
                  {c.verses.length === 1 ? t('lettersTrainer.verseSingle') : t('lettersTrainer.versePlural', { count: String(c.verses.length) })}
                </div>
                <div className="flex items-center gap-1">
                  <IconEditBtn onClick={() => onEditChallenge(c)} title={t('lettersTrainer.edit')} />
                  <IconDeleteBtn onClick={() => onDeleteChallenge(c)} title={t('lettersTrainer.delete')} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {state.tajweedChallenges.length > 0 && (
        <Card>
          <SectionLabel>{t('lettersTrainer.tajweedChallenges')} · {state.tajweedChallenges.length}</SectionLabel>
          <div className="space-y-2">
            {state.tajweedChallenges.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-100 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-700/30">
                <div className="px-3 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-semibold">
                  {c.ruleName || t('lettersTrainer.tajweedChallenges')}
                </div>
                <div className="flex-1 text-sm text-slate-500 dark:text-slate-400">
                  {c.verses.length === 1 ? t('lettersTrainer.verseSingle') : t('lettersTrainer.versePlural', { count: String(c.verses.length) })}
                </div>
                <div className="flex items-center gap-1">
                  <IconEditBtn onClick={() => onEditTajweed(c)} title={t('lettersTrainer.edit')} />
                  <IconDeleteBtn onClick={() => onDeleteTajweed(c)} title={t('lettersTrainer.delete')} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// STUDENT VIEW
// ---------------------------------------------------------------------------

const StudentView: React.FC<{
  state: TrainerState;
  student: TrainerStudent;
  onHome: () => void;
  onRename: (name: string) => void;
  onPrev: (id: string) => void;
  onAddChallenge: () => void;
  onAddTajweed: () => void;
  onEditChallenge: (c: LetterChallenge) => void;
  onEditTajweed: (c: TajweedChallenge) => void;
  onStartChallenge: (c: LetterChallenge) => void;
  onStartTajweed: (c: TajweedChallenge) => void;
  /** When true the trainer is scoped to this one student: hide the student
   *  switcher (prev/next) and the "all students" breadcrumb. */
  locked?: boolean;
}> = ({ state, student, onHome, onRename, onPrev, onAddChallenge, onAddTajweed, onEditChallenge, onEditTajweed, onStartChallenge, onStartTajweed, locked }) => {
  const { t } = useI18n();
  const idx = state.students.findIndex(s => s.id === student.id);
  const prev = state.students[idx - 1];
  const next = state.students[idx + 1];
  const letterCount = (cid: string) => state.completions[student.id]?.[cid] || 0;
  const tajweedCount = (tid: string) => state.tajweedCompletions[student.id]?.[tid] || 0;
  const color = avatarColor(student.name);

  return (
    <>
      {!locked && <Crumbs items={[{ label: `← ${t('lettersTrainer.allStudents')}`, onClick: onHome }]} />}

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className={`w-14 h-14 ${color} rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-md flex-shrink-0`}>
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate">{student.name}</h2>
              <button
                onClick={() => {
                  const next = window.prompt('Rename student:', student.name);
                  if (next && next.trim() && next.trim() !== student.name) onRename(next.trim());
                }}
                className="text-slate-400 hover:text-teal-600 dark:hover:text-orange-400 transition-colors text-base"
              >✎</button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('lettersTrainer.studentViewHint')}</p>
          </div>
          {!locked && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Btn size="sm" disabled={!prev} onClick={() => prev && onPrev(prev.id)}>‹</Btn>
              <span className="text-xs text-slate-500 dark:text-slate-400 px-2">{idx + 1} / {state.students.length}</span>
              <Btn size="sm" disabled={!next} onClick={() => next && onPrev(next.id)}>›</Btn>
            </div>
          )}
        </div>
      </Card>

      {/* Letter challenges */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <SectionLabel>{t('lettersTrainer.letterChallengesSection')}</SectionLabel>
            <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">{t('lettersTrainer.letterChallengesDesc')}</p>
          </div>
          <AddChallengeBtn variant="letter" onClick={onAddChallenge}>
            {t('lettersTrainer.addLetterChallenge')}
          </AddChallengeBtn>
        </div>
        {state.challenges.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-4">{t('lettersTrainer.noLetterChallenges')}</p>
        ) : (
          <div className="space-y-2">
            {state.challenges.map(c => {
              const cnt = letterCount(c.id);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-100 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-700/30">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {c.letters.map((l, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className="text-xs text-slate-400">{t('lettersTrainer.vs')}</span>}
                        <span className="font-quranic text-2xl w-9 h-9 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-lg flex items-center justify-center shadow-sm text-slate-800 dark:text-slate-100">
                          {l}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0 text-sm text-slate-500 dark:text-slate-400">
                    {c.verses.length === 1 ? t('lettersTrainer.verseSingle') : t('lettersTrainer.versePlural', { count: String(c.verses.length) })}
                    {cnt > 0 && (
                      <span className="ms-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                        {cnt === 1 ? t('lettersTrainer.completionSingle') : t('lettersTrainer.completionsTotal', { count: String(cnt) })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <IconEditBtn onClick={() => onEditChallenge(c)} title={t('lettersTrainer.edit')} />
                    <StartBtn variant="letter" onClick={() => onStartChallenge(c)}>
                      {t('lettersTrainer.start')}
                    </StartBtn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Tajweed challenges */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <SectionLabel>{t('lettersTrainer.tajweedChallengesSection')}</SectionLabel>
            <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">{t('lettersTrainer.tajweedChallengesDesc')}</p>
          </div>
          <AddChallengeBtn variant="tajweed" onClick={onAddTajweed}>
            {t('lettersTrainer.addTajweedChallenge')}
          </AddChallengeBtn>
        </div>
        {state.tajweedChallenges.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-4">{t('lettersTrainer.noTajweedChallenges')}</p>
        ) : (
          <div className="space-y-2">
            {state.tajweedChallenges.map(c => {
              const cnt = tajweedCount(c.id);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-100 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-700/30">
                  <div className="px-3 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-semibold flex-shrink-0">
                    {c.ruleName || t('lettersTrainer.tajweedChallengesSection')}
                  </div>
                  <div className="flex-1 min-w-0 text-sm text-slate-500 dark:text-slate-400">
                    {c.verses.length === 1 ? t('lettersTrainer.verseSingle') : t('lettersTrainer.versePlural', { count: String(c.verses.length) })}
                    {cnt > 0 && (
                      <span className="ms-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400">
                        {cnt === 1 ? t('lettersTrainer.completionSingle') : t('lettersTrainer.completionsTotal', { count: String(cnt) })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <IconEditBtn onClick={() => onEditTajweed(c)} title={t('lettersTrainer.edit')} />
                    <StartBtn variant="tajweed" onClick={() => onStartTajweed(c)}>
                      {t('lettersTrainer.start')}
                    </StartBtn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
};

// ---------------------------------------------------------------------------
// LETTER CHALLENGE WIZARD
// ---------------------------------------------------------------------------

const ChallengeWizard: React.FC<{
  existing: LetterChallenge | null;
  student?: TrainerStudent;
  onCancel: (promptForConfirm: boolean) => void;
  onSave: (c: LetterChallenge) => void;
  onHome: () => void;
  onStudentCrumb: () => void;
}> = ({ existing, student, onCancel, onSave, onHome, onStudentCrumb }) => {
  const { t } = useI18n();
  const [step, setStep] = useState<'letters' | 'verses'>('letters');
  const [letters, setLetters] = useState<string[]>(existing ? existing.letters.slice() : ['', '', '']);
  const [verses, setVerses] = useState<TrainerVerse[]>(
    existing ? existing.verses.map(v => ({ text: v.text, marks: v.marks.slice() })) : [],
  );
  const [highlightOn, setHighlightOn] = useState<boolean>(existing ? existing.highlightOn !== false : true);
  const [verseInput, setVerseInput] = useState('');

  const isEditing = !!existing;
  const finalLetters = letters.filter(l => l && l.trim());

  const goVerses = () => {
    const l1 = (letters[0] || '').trim();
    const l2 = (letters[1] || '').trim();
    const l3 = (letters[2] || '').trim();
    if (!l1 || !l2) { alert('Please enter at least the first two letters.'); return; }
    const c1 = Array.from(l1)[0];
    const c2 = Array.from(l2)[0];
    const c3 = l3 ? Array.from(l3)[0] : null;
    const picked = c3 ? [c1, c2, c3] : [c1, c2];
    if (new Set(picked).size !== picked.length) { alert('The letters must all be different.'); return; }
    setLetters(picked);
    setStep('verses');
  };

  const addVerses = () => {
    const lines = verseInput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setVerses(v => [...v, ...lines.map(text => ({ text, marks: [] as number[] }))]);
    setVerseInput('');
  };

  const toggleMark = (vi: number, ti: number) => {
    setVerses(v => v.map((vv, i) => {
      if (i !== vi) return vv;
      const idx = vv.marks.indexOf(ti);
      const marks = idx >= 0 ? vv.marks.filter(x => x !== ti) : [...vv.marks, ti];
      return { ...vv, marks };
    }));
  };

  const confirmSave = () => {
    if (verses.length === 0) return;
    onSave({
      id: existing ? existing.id : newTrainerId(),
      letters: finalLetters,
      verses: verses.map(v => ({ text: v.text, marks: v.marks.slice() })),
      highlightOn,
      createdAt: existing ? existing.createdAt : Date.now(),
    });
  };

  const dirty = verses.length > 0 || letters.some(l => l && l.trim());

  return (
    <>
      <Crumbs items={[
        { label: t('lettersTrainer.allStudents'), onClick: onHome },
        ...(student ? [{ label: student.name, onClick: onStudentCrumb }] : []),
        { label: isEditing ? t('lettersTrainer.editChallenge') : t('lettersTrainer.newChallenge') },
      ]} />
      <Card>
        <SectionLabel>{isEditing ? t('lettersTrainer.editChallenge') : t('lettersTrainer.newChallenge')}</SectionLabel>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{t('lettersTrainer.wizardStep1Hint')}</p>

        {step === 'letters' ? (
          <>
            <div className="grid grid-cols-3 gap-4 max-w-sm">
              {[0, 1, 2].map(i => (
                <div key={i}>
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {i === 0 ? t('lettersTrainer.firstLetter') : i === 1 ? t('lettersTrainer.secondLetter') : t('lettersTrainer.thirdLetter')}
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={letters[i] || ''}
                    onChange={e => setLetters(l => { const n = l.slice(); n[i] = e.target.value; return n; })}
                    placeholder={['ب', 'ت', 'ث'][i]}
                    className="mt-1 w-full px-3 py-3 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-center text-3xl font-quranic focus:outline-none focus:ring-2 focus:ring-teal-400 dark:focus:ring-orange-400"
                    dir="rtl"
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <Btn variant="primary" onClick={goVerses}>{t('lettersTrainer.continue')}</Btn>
              <Btn onClick={() => onCancel(dirty || isEditing)}>{t('lettersTrainer.cancel')}</Btn>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-slate-50 dark:bg-gray-700/40 rounded-xl">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t('lettersTrainer.lettersLabel')}
              </span>
              <div className="font-quranic text-2xl flex items-center gap-2">
                {finalLetters.map((l, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-xs uppercase text-slate-400">{t('lettersTrainer.vs')}</span>}
                    <span>{l}</span>
                  </React.Fragment>
                ))}
              </div>
              <Btn size="sm" variant="ghost" onClick={() => setStep('letters')}>{t('lettersTrainer.change')}</Btn>
            </div>

            <div className="mb-5">
              <Toggle checked={highlightOn} onChange={setHighlightOn} label={t('lettersTrainer.highlightLetters')} />
            </div>

            <div className="mb-5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t('lettersTrainer.pasteVerseLabel')}
              </label>
              <textarea
                value={verseInput}
                onChange={e => setVerseInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addVerses(); }}
                placeholder="ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
                dir="rtl"
                className="mt-1 w-full px-3 py-3 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-quranic text-2xl min-h-[120px] focus:outline-none focus:ring-2 focus:ring-teal-400 dark:focus:ring-orange-400"
              />
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Btn variant="primary" onClick={addVerses}>{t('lettersTrainer.addVerse')}</Btn>
                <span className="text-xs text-slate-400 dark:text-slate-500">{t('lettersTrainer.pasteHint')}</span>
              </div>
            </div>

            {verses.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-4">{t('lettersTrainer.noVerses')}</p>
            ) : (
              <div className="space-y-2">
                {verses.map((v, vi) => (
                  <div key={vi} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-gray-700">
                    <span className="text-xs text-slate-400 mt-2 flex-shrink-0">{vi + 1}</span>
                    <div className="flex-1">
                      <EditableVerse text={v.text} letters={finalLetters} marks={v.marks} variant="letter" onToggleMark={ti => toggleMark(vi, ti)} />
                    </div>
                    <button onClick={() => setVerses(a => a.filter((_, i) => i !== vi))} className="text-slate-300 hover:text-red-500 transition-colors text-lg flex-shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-gray-700">
              <Btn onClick={() => onCancel(dirty || isEditing)}>{t('lettersTrainer.cancel')}</Btn>
              <Btn variant="primary" disabled={verses.length === 0} onClick={confirmSave}>
                {isEditing ? t('lettersTrainer.saveChanges') : t('lettersTrainer.confirmChallenge')}
              </Btn>
            </div>
          </>
        )}
      </Card>
    </>
  );
};

// ---------------------------------------------------------------------------
// TAJWEED WIZARD
// ---------------------------------------------------------------------------

const TajweedWizard: React.FC<{
  existing: TajweedChallenge | null;
  student?: TrainerStudent;
  onCancel: (prompt: boolean) => void;
  onSave: (c: TajweedChallenge) => void;
  onHome: () => void;
  onStudentCrumb: () => void;
}> = ({ existing, student, onCancel, onSave, onHome, onStudentCrumb }) => {
  const { t } = useI18n();
  const [step, setStep] = useState<'name' | 'verses'>('name');
  const [ruleName, setRuleName] = useState(existing?.ruleName || '');
  const [verses, setVerses] = useState<TrainerVerse[]>(
    existing ? existing.verses.map(v => ({ text: v.text, marks: v.marks.slice() })) : [],
  );
  const [highlightOn, setHighlightOn] = useState(existing ? existing.highlightOn !== false : true);
  const [verseInput, setVerseInput] = useState('');
  const isEditing = !!existing;

  const goVerses = () => {
    if (!ruleName.trim()) { alert('Please give the rule a name.'); return; }
    setStep('verses');
  };

  const addVerses = () => {
    const lines = verseInput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setVerses(v => [...v, ...lines.map(text => ({ text, marks: [] as number[] }))]);
    setVerseInput('');
  };

  const toggleMark = (vi: number, ti: number) => {
    setVerses(v => v.map((vv, i) => {
      if (i !== vi) return vv;
      const idx = vv.marks.indexOf(ti);
      const marks = idx >= 0 ? vv.marks.filter(x => x !== ti) : [...vv.marks, ti];
      return { ...vv, marks };
    }));
  };

  const confirmSave = () => {
    if (verses.length === 0) return;
    onSave({
      id: existing ? existing.id : newTrainerId(),
      ruleName: ruleName.trim(),
      verses: verses.map(v => ({ text: v.text, marks: v.marks.slice() })),
      highlightOn,
      createdAt: existing ? existing.createdAt : Date.now(),
    });
  };

  const dirty = verses.length > 0 || ruleName.trim() !== '';

  return (
    <>
      <Crumbs items={[
        { label: t('lettersTrainer.allStudents'), onClick: onHome },
        ...(student ? [{ label: student.name, onClick: onStudentCrumb }] : []),
        { label: isEditing ? t('lettersTrainer.editTajweed') : t('lettersTrainer.newTajweed') },
      ]} />
      <Card>
        <SectionLabel>{isEditing ? t('lettersTrainer.editTajweed') : t('lettersTrainer.newTajweed')}</SectionLabel>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">{t('lettersTrainer.tajweedWizardHint')}</p>

        {step === 'name' ? (
          <>
            <div className="max-w-md">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t('lettersTrainer.ruleName')}
              </label>
              <input
                type="text"
                value={ruleName}
                onChange={e => setRuleName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') goVerses(); }}
                placeholder={t('lettersTrainer.ruleNamePlaceholder')}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400 dark:focus:ring-orange-400"
              />
            </div>
            <div className="mt-5 flex gap-2">
              <Btn variant="tajweed" onClick={goVerses}>{t('lettersTrainer.continue')}</Btn>
              <Btn onClick={() => onCancel(dirty || isEditing)}>{t('lettersTrainer.cancel')}</Btn>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-xl">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t('lettersTrainer.ruleLabel')}
              </span>
              <span className="text-teal-700 dark:text-teal-300 font-semibold">{ruleName}</span>
              <Btn size="sm" variant="ghost" onClick={() => setStep('name')}>{t('lettersTrainer.change')}</Btn>
            </div>

            <div className="mb-5">
              <Toggle checked={highlightOn} onChange={setHighlightOn} label={t('lettersTrainer.highlightTajweed')} />
            </div>

            <div className="mb-5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t('lettersTrainer.pasteVerseLabel')}
              </label>
              <textarea
                value={verseInput}
                onChange={e => setVerseInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addVerses(); }}
                placeholder="ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
                dir="rtl"
                className="mt-1 w-full px-3 py-3 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-quranic text-2xl min-h-[120px] focus:outline-none focus:ring-2 focus:ring-teal-400 dark:focus:ring-orange-400"
              />
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Btn variant="tajweed" onClick={addVerses}>{t('lettersTrainer.addVerse')}</Btn>
                <span className="text-xs text-slate-400 dark:text-slate-500">{t('lettersTrainer.tajweedPasteHint')}</span>
              </div>
            </div>

            {verses.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-4">{t('lettersTrainer.noVersesTajweed')}</p>
            ) : (
              <div className="space-y-2">
                {verses.map((v, vi) => (
                  <div key={vi} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-gray-700">
                    <span className="text-xs text-slate-400 mt-2 flex-shrink-0">{vi + 1}</span>
                    <div className="flex-1">
                      <EditableVerse text={v.text} letters={[]} marks={v.marks} variant="tajweed" onToggleMark={ti => toggleMark(vi, ti)} />
                    </div>
                    <button onClick={() => setVerses(a => a.filter((_, i) => i !== vi))} className="text-slate-300 hover:text-red-500 transition-colors text-lg flex-shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-gray-700">
              <Btn onClick={() => onCancel(dirty || isEditing)}>{t('lettersTrainer.cancel')}</Btn>
              <Btn variant="tajweed" disabled={verses.length === 0} onClick={confirmSave}>
                {isEditing ? t('lettersTrainer.saveChanges') : t('lettersTrainer.confirmChallenge')}
              </Btn>
            </div>
          </>
        )}
      </Card>
    </>
  );
};

// ---------------------------------------------------------------------------
// LETTER CHALLENGE RUNNER
// ---------------------------------------------------------------------------

const ChallengeRunner: React.FC<{
  student: TrainerStudent;
  challenge: LetterChallenge;
  onComplete: () => void;
  onHome: () => void;
  onStudent: () => void;
}> = ({ student, challenge, onComplete, onHome, onStudent }) => {
  const { t } = useI18n();
  const [order, setOrder] = useState<number[]>(() => shuffle(challenge.verses.map((_, i) => i)));
  const [pos, setPos] = useState(0);
  const [highlightOn, setHighlightOn] = useState(challenge.highlightOn !== false);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timeout = flash === 'right' ? 350 : 550;
    const timer = setTimeout(() => {
      if (flash === 'right') {
        if (pos + 1 >= challenge.verses.length) { setDone(true); onComplete(); }
        else setPos(p => p + 1);
      } else {
        setOrder(shuffle(challenge.verses.map((_, i) => i)));
        setPos(0);
      }
      setFlash(null);
    }, timeout);
    return () => clearTimeout(timer);
  }, [flash, pos, challenge.verses.length, onComplete]);

  const restart = () => { setDone(false); setOrder(shuffle(challenge.verses.map((_, i) => i))); setPos(0); };

  if (done) {
    return (
      <>
        <Crumbs items={[{ label: t('lettersTrainer.allStudents'), onClick: onHome }, { label: student.name, onClick: onStudent }]} />
        <Card>
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🌟</div>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">{t('lettersTrainer.challengeComplete')}</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8">
              {t('lettersTrainer.challengeCompleteDesc', { name: student.name, count: String(challenge.verses.length) })}
            </p>
            <div className="flex justify-center gap-3 flex-wrap">
              <Btn size="lg" onClick={restart}>{t('lettersTrainer.repeatChallenge')}</Btn>
              <Btn size="lg" variant="primary" onClick={onStudent}>{t('lettersTrainer.backToChallenges')}</Btn>
            </div>
          </div>
        </Card>
      </>
    );
  }

  const currentIdx = order[pos];
  const verse = challenge.verses[currentIdx];

  return (
    <>
      <Crumbs items={[
        { label: t('lettersTrainer.allStudents'), onClick: onHome },
        { label: student.name, onClick: onStudent },
        { label: t('lettersTrainer.challenge') },
      ]} />
      <Card>
        {/* Student + target letters */}
        <div className="text-center mb-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">{student.name}</div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-1">{t('lettersTrainer.letterDistinction')}</p>
          <div className="font-quranic text-4xl text-red-500 dark:text-red-400 mt-2 tracking-widest">
            {challenge.letters.join(' · ')}
          </div>
        </div>

        {/* Highlight toggle */}
        <div className="mb-4">
          <Toggle checked={highlightOn} onChange={setHighlightOn} label={t('lettersTrainer.highlightRed')} />
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-teal-400 dark:from-orange-500 dark:to-orange-400 transition-all duration-300"
            style={{ width: `${(pos / challenge.verses.length) * 100}%` }}
          />
        </div>
        <div className="text-xs text-center text-slate-400 dark:text-slate-500 mb-4">
          {t('lettersTrainer.verseOf', { pos: String(pos + 1), total: String(challenge.verses.length) })}
        </div>

        {/* Verse display — 4× bigger */}
        <div className={`text-center py-10 px-4 rounded-2xl my-4 min-h-[200px] flex items-center justify-center transition-all duration-200 ${
          flash === 'right' ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-400' :
          flash === 'wrong' ? 'bg-red-50 dark:bg-red-900/20 ring-2 ring-red-400' :
          'bg-slate-50 dark:bg-gray-700/40'
        }`}>
          <VerseDisplay
            text={verse.text}
            letters={challenge.letters}
            marks={verse.marks}
            highlight={highlightOn}
            variant="letter"
            className="text-8xl leading-[2.5]"
          />
        </div>

        {/* Wrong / Correct action buttons */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          <button
            onClick={() => setFlash('wrong')}
            className="flex flex-col items-center justify-center gap-2 py-5 rounded-2xl bg-red-500 hover:bg-red-600 active:scale-95 text-white font-bold transition-all shadow-md"
          >
            <span className="text-3xl leading-none">✕</span>
            <span className="text-sm tracking-wide">{t('lettersTrainer.wrongRestart')}</span>
          </button>
          <button
            onClick={() => setFlash('right')}
            className="flex flex-col items-center justify-center gap-2 py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold transition-all shadow-md"
          >
            <span className="text-3xl leading-none">✓</span>
            <span className="text-sm tracking-wide">{t('lettersTrainer.correctNext')}</span>
          </button>
        </div>

        {/* Exit */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-gray-700 text-center">
          <button
            onClick={onStudent}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            {t('lettersTrainer.exitChallenge')}
          </button>
        </div>
      </Card>
    </>
  );
};

// ---------------------------------------------------------------------------
// TAJWEED RUNNER
// ---------------------------------------------------------------------------

const TajweedRunner: React.FC<{
  student: TrainerStudent;
  tajweed: TajweedChallenge;
  onComplete: () => void;
  onHome: () => void;
  onStudent: () => void;
}> = ({ student, tajweed, onComplete, onHome, onStudent }) => {
  const { t } = useI18n();
  const [order, setOrder] = useState<number[]>(() => shuffle(tajweed.verses.map((_, i) => i)));
  const [pos, setPos] = useState(0);
  const [highlightOn, setHighlightOn] = useState(tajweed.highlightOn !== false);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timeout = flash === 'right' ? 350 : 550;
    const timer = setTimeout(() => {
      if (flash === 'right') {
        if (pos + 1 >= tajweed.verses.length) { setDone(true); onComplete(); }
        else setPos(p => p + 1);
      } else {
        setOrder(shuffle(tajweed.verses.map((_, i) => i)));
        setPos(0);
      }
      setFlash(null);
    }, timeout);
    return () => clearTimeout(timer);
  }, [flash, pos, tajweed.verses.length, onComplete]);

  const restart = () => { setDone(false); setOrder(shuffle(tajweed.verses.map((_, i) => i))); setPos(0); };

  if (done) {
    return (
      <>
        <Crumbs items={[{ label: t('lettersTrainer.allStudents'), onClick: onHome }, { label: student.name, onClick: onStudent }]} />
        <Card>
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🌟</div>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">{t('lettersTrainer.tajweedComplete')}</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8">
              {t('lettersTrainer.tajweedCompleteDesc', { name: student.name, count: String(tajweed.verses.length), rule: tajweed.ruleName })}
            </p>
            <div className="flex justify-center gap-3 flex-wrap">
              <Btn size="lg" onClick={restart}>{t('lettersTrainer.repeatChallenge')}</Btn>
              <Btn size="lg" variant="tajweed" onClick={onStudent}>{t('lettersTrainer.backToChallenges')}</Btn>
            </div>
          </div>
        </Card>
      </>
    );
  }

  const currentIdx = order[pos];
  const verse = tajweed.verses[currentIdx];

  return (
    <>
      <Crumbs items={[
        { label: t('lettersTrainer.allStudents'), onClick: onHome },
        { label: student.name, onClick: onStudent },
        { label: t('lettersTrainer.tajweedChallenge') },
      ]} />
      <Card>
        {/* Student + rule */}
        <div className="text-center mb-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">{student.name}</div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-1">{t('lettersTrainer.tajweedRule')}</p>
          <div className="text-3xl text-teal-700 dark:text-teal-400 mt-2 font-bold">{tajweed.ruleName}</div>
        </div>

        {/* Highlight toggle */}
        <div className="mb-4">
          <Toggle checked={highlightOn} onChange={setHighlightOn} label={t('lettersTrainer.highlightTajweed')} />
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-gradient-to-r from-teal-600 to-teal-400 transition-all duration-300"
            style={{ width: `${(pos / tajweed.verses.length) * 100}%` }}
          />
        </div>
        <div className="text-xs text-center text-slate-400 dark:text-slate-500 mb-4">
          {t('lettersTrainer.verseOf', { pos: String(pos + 1), total: String(tajweed.verses.length) })}
        </div>

        {/* Verse display — 4× bigger */}
        <div className={`text-center py-10 px-4 rounded-2xl my-4 min-h-[200px] flex items-center justify-center transition-all duration-200 ${
          flash === 'right' ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-400' :
          flash === 'wrong' ? 'bg-red-50 dark:bg-red-900/20 ring-2 ring-red-400' :
          'bg-slate-50 dark:bg-gray-700/40'
        }`}>
          <VerseDisplay
            text={verse.text}
            marks={verse.marks}
            highlight={highlightOn}
            variant="tajweed"
            className="text-8xl leading-[2.5]"
          />
        </div>

        {/* Wrong / Correct action buttons */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          <button
            onClick={() => setFlash('wrong')}
            className="flex flex-col items-center justify-center gap-2 py-5 rounded-2xl bg-red-500 hover:bg-red-600 active:scale-95 text-white font-bold transition-all shadow-md"
          >
            <span className="text-3xl leading-none">✕</span>
            <span className="text-sm tracking-wide">{t('lettersTrainer.wrongRestart')}</span>
          </button>
          <button
            onClick={() => setFlash('right')}
            className="flex flex-col items-center justify-center gap-2 py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold transition-all shadow-md"
          >
            <span className="text-3xl leading-none">✓</span>
            <span className="text-sm tracking-wide">{t('lettersTrainer.correctNext')}</span>
          </button>
        </div>

        {/* Exit */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-gray-700 text-center">
          <button
            onClick={onStudent}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            {t('lettersTrainer.exitChallenge')}
          </button>
        </div>
      </Card>
    </>
  );
};

export default LettersTrainerPage;
