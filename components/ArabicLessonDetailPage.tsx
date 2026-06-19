// components/ArabicLessonDetailPage.tsx
// Full-screen lesson detail overlay — 4 tabs:
//   📖 Lesson PDF  · 📝 Homework  · 🔤 Vocabulary  · 🎬 Dialogue Video

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArabicLesson, ArabicStudent,
  HomeworkQuestion, HomeworkQuestionType,
  HomeworkItem, ArabicExamItemType,
  VocabWord, VocabMode, VocabAttempt,
  TajweedLesson, Student,
} from '../types';
// VocabMode kept in types import for saveSpacedRep (both modes saved)
import { useAuth } from '../context/AuthProvider';
import { useI18n } from '../context/I18nProvider';
import TajweedLessonViewer, { VocabWordBasic } from './TajweedLessonViewer';
import WordFlightGame from './WordFlightGame';
import {
  getHomeworkQuestions, createHomeworkQuestion,
  updateHomeworkQuestion as updateHWQ,
  deleteHomeworkQuestion,
  getHomeworkItems, createHomeworkItem, updateHomeworkItem,
  deleteHomeworkItem, reorderHomeworkItems, uploadHomeworkImage,
  getVocabWords, createVocabWord, deleteVocabWord,
  getVocabAttempts, saveVocabAttempts,
  saveVocabMistakes,
  updateArabicLesson,
  setArabicLessonCompletion,
  markHomeworkComplete,
  getWhiteboardData, saveWhiteboardData, uploadNoteImage,
  saveLessonNote,
  getLessonProgressForStudent, markLessonProgress, markLessonDone, logLessonRevision,
} from '../services/arabicService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripDiacritics(s: string) {
  return s.replace(/[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g, '');
}
function answersMatch(correct: string, user: string) {
  const n = (s: string) => stripDiacritics(s).toLowerCase().trim().replace(/\s+/g, ' ');
  return n(correct) === n(user);
}
function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SR_DELAYS = [1, 3, 7, 14];

type Tab = 'lesson' | 'homework' | 'vocabulary' | 'video' | 'teacher_note' | 'grammar';

const QUESTION_TYPE_LABELS: Record<HomeworkQuestionType, string> = {
  multiple_choice:      'Multiple Choice',
  true_false:           'True / False',
  translate_to_arabic:  'Translate → Arabic',
  translate_to_english: 'Translate → English',
  fill_blank:           'Fill in the Blank',
  fill_blank_options:   'Fill in the Blank (with choices)',
  short_answer:         'Short Answer',
  matching:             'Word Matching',
  multi_answer:         'Multi-Word Answer',
};

const ADD_BUTTONS: { type: ArabicExamItemType; label: string; icon: string }[] = [
  { type: 'question',    label: 'Question',    icon: '❓' },
  { type: 'section',     label: 'Section',     icon: '📑' },
  { type: 'headline',    label: 'Headline',    icon: '🔠' },
  { type: 'instruction', label: 'Instruction', icon: '📌' },
  { type: 'paragraph',   label: 'Paragraph',   icon: '📝' },
  { type: 'image',       label: 'Image',       icon: '🖼️' },
  { type: 'divider',     label: 'Divider',     icon: '➖' },
];

const ADMIN_QUESTION_TYPES: [HomeworkQuestionType, string][] = [
  ['multiple_choice',      'Multiple Choice (auto-graded)'],
  ['true_false',           'True / False (auto-graded)'],
  ['translate_to_arabic',  'Translate → Arabic'],
  ['translate_to_english', 'Translate → English'],
  ['fill_blank',           'Fill in the Blank'],
  ['short_answer',         'Short Answer'],
  ['matching',             'Word Matching (auto-graded)'],
  ['multi_answer',         'Multi-Word Answer'],
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  lesson: ArabicLesson;
  students: ArabicStudent[];
  teacherId: string;
  preSelectedStudentId?: string;
  onClose: () => void;
  onStudentUpdated?: (s: ArabicStudent) => void;
  onHomeworkComplete?: (lessonId: string) => void;
  studentMode?: boolean;
}

const ArabicLessonDetailPage: React.FC<Props> = ({
  lesson: initialLesson, students, teacherId,
  preSelectedStudentId, onClose, onStudentUpdated, onHomeworkComplete,
  studentMode = false,
}) => {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [lesson, setLesson] = useState(initialLesson);
  const [activeTab, setActiveTab] = useState<Tab>(initialLesson.pdfUrl ? 'lesson' : 'homework');
  const [canvasVocabWords, setCanvasVocabWords] = useState<VocabWordBasic[]>([]);

  // ── Teacher's note & grammar summary ───────────────────────────────────────
  const [teacherNote,    setTeacherNote]    = useState(initialLesson.teacherNote    ?? '');
  const [grammarSummary, setGrammarSummary] = useState(initialLesson.grammarSummary ?? '');
  const [grammarSaveStatus, setGrammarSaveStatus] = useState<'saved' | 'saving' | null>(null);
  const grammarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteWindowRef   = useRef<Window | null>(null);

  // Listen for postMessage from the teacher-note popup window and auto-save
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'teacher_note' || e.data?.lessonId !== lesson.id) return;
      const val = e.data.value as string;
      setTeacherNote(val);
      saveLessonNote(lesson.id, 'teacherNote', val);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [lesson.id]);

  // Open / focus the teacher-note popup window
  const openTeacherNoteWindow = () => {
    // If already open, just focus it
    if (noteWindowRef.current && !noteWindowRef.current.closed) {
      noteWindowRef.current.focus();
      return;
    }
    const win = window.open(
      '', `teacher_note_${lesson.id}`,
      'width=860,height=700,resizable=yes,scrollbars=yes',
    );
    if (!win) return;
    noteWindowRef.current = win;
    const escaped = (teacherNote ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
    const lessonIdStr = lesson.id;
    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Teacher's Note — ${lesson.title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#fafafa;display:flex;flex-direction:column;height:100vh;padding:20px;gap:12px}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0}
    h1{font-size:17px;font-weight:700;color:#1e293b;display:flex;align-items:center;gap:8px}
    .sub{font-size:12px;color:#64748b;margin-top:2px}
    .status{font-size:12px;font-weight:600;color:#94a3b8;flex-shrink:0}
    .status.saving{color:#f59e0b}
    .status.saved{color:#22c55e}
    textarea{flex:1;width:100%;padding:16px;font-size:14px;line-height:1.7;
             border:1px solid #e2e8f0;border-radius:10px;resize:none;
             background:#fff;outline:none;color:#1e293b}
    textarea:focus{border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.15)}
    .hint{font-size:11px;color:#94a3b8;flex-shrink:0}
  </style>
</head>
<body>
  <header>
    <div>
      <h1>🗒️ Teacher's Note</h1>
      <div class="sub">${lesson.title}</div>
    </div>
    <span class="status" id="st">Auto-saves as you type</span>
  </header>
  <textarea id="ta" placeholder="Write your lesson notes, teaching tips, or anything private here…">${escaped}</textarea>
  <div class="hint">This window is separate from your lesson page — safe to write notes while screen-sharing the lesson tab.</div>
  <script>
    var ta=document.getElementById('ta'),st=document.getElementById('st'),timer;
    ta.addEventListener('input',function(){
      clearTimeout(timer);
      st.className='status saving';st.textContent='Saving…';
      timer=setTimeout(function(){
        if(window.opener&&!window.opener.closed){
          window.opener.postMessage({type:'teacher_note',lessonId:'${lessonIdStr}',value:ta.value},'*');
          st.className='status saved';st.textContent='✓ Saved';
        }
      },1200);
    });
    // Move cursor to end
    ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);
  </script>
</body>
</html>`);
    win.document.close();
  };

  const handleGrammarChange = (val: string) => {
    setGrammarSummary(val);
    setGrammarSaveStatus(null);
    if (grammarTimerRef.current) clearTimeout(grammarTimerRef.current);
    grammarTimerRef.current = setTimeout(async () => {
      setGrammarSaveStatus('saving');
      await saveLessonNote(lesson.id, 'grammarSummary', val);
      setGrammarSaveStatus('saved');
    }, 1200);
  };

  // Tabs — Teacher's Note hidden in student mode; grammar always shown
  const tabs: { id: Tab; icon: string; label: string; popup?: boolean }[] = [
    { id: 'lesson',       icon: '📖', label: t('arabicLessonDetail.tabLesson')      },
    { id: 'homework',     icon: '📝', label: t('arabicLessonDetail.tabHomework')    },
    { id: 'vocabulary',   icon: '🔤', label: t('arabicLessonDetail.tabVocabulary')  },
    { id: 'video',        icon: '🎬', label: t('arabicLessonDetail.tabVideo')       },
    ...(!studentMode ? [{ id: 'teacher_note' as Tab, icon: '🗒️', label: t('arabicLessonDetail.tabTeacherNote'), popup: true }] : []),
    { id: 'grammar',      icon: '📐', label: t('arabicLessonDetail.tabGrammar')     },
  ];

  // Whiteboard is shared per student — authorId = student being viewed, or teacher if no student context
  const wbAuthorId = preSelectedStudentId ?? teacherId;

  // Load vocab words for canvas import whenever the lesson changes
  useEffect(() => {
    getVocabWords(lesson.id).then(ws =>
      setCanvasVocabWords(ws.map(w => ({ arabic: w.arabic, transliteration: w.transliteration, english: w.english })))
    );
  }, [lesson.id]);

  const tajweedLesson: TajweedLesson = {
    id: lesson.id, title: lesson.title, description: lesson.description,
    orderIndex: lesson.orderIndex, pdfUrl: lesson.pdfUrl,
    createdBy: lesson.createdBy, createdAt: lesson.createdAt, updatedAt: lesson.updatedAt,
  };

  const studentCompat = students.map(s => ({
    id: s.id, name: s.name,
    recitationAchievements: [], memorizationAchievements: [],
    attendance: [], masteredTajweedRules: [],
    tafsirReviews: [], tafsirMemorizationReviews: [], mistakes: {},
  })) as unknown as Student[];

  const handleMarkDone = async (studentId: string, lessonId: string, done: boolean) => {
    await setArabicLessonCompletion(teacherId, studentId, lessonId, done);
    const s = students.find(x => x.id === studentId);
    if (!s) return;
    const ids = new Set(s.completedLessonIds);
    done ? ids.add(lessonId) : ids.delete(lessonId);
    onStudentUpdated?.({ ...s, completedLessonIds: [...ids] });
  };

  return (
    <div className="fixed inset-0 z-40 bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
        <button onClick={onClose}
          className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          <span className="font-semibold text-sm">{t('arabicLessonDetail.allLessons')}</span>
        </button>
        <div className="w-px h-5 bg-slate-200 dark:bg-gray-600" />
        <h1 className="font-bold text-slate-800 dark:text-slate-100 text-base truncate flex-1">{lesson.title}</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id}
            onClick={() => tab.popup ? openTeacherNoteWindow() : setActiveTab(tab.id)}
            title={tab.popup ? t('arabicLessonDetail.openPrivate') : undefined}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px ${
              tab.popup
                ? 'border-transparent text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300'
                : activeTab === tab.id
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            <span>{tab.icon}</span>{tab.label}
            {tab.popup && (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 opacity-60">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'lesson' && (
          lesson.pdfUrl ? (
            <TajweedLessonViewer
              embedded lesson={tajweedLesson}
              students={studentCompat} tutorId={teacherId}
              preSelectedStudentId={preSelectedStudentId}
              fetchCompletedIds={async (sid) => new Set(students.find(x => x.id === sid)?.completedLessonIds ?? [])}
              onMarkCompleted={async (sid, lid) => { await handleMarkDone(sid, lid, true); return true; }}
              onUnmarkCompleted={async (sid, lid) => { await handleMarkDone(sid, lid, false); return true; }}
              progressMode
              studentMode={studentMode}
              getProgress={async (sid, lid) => {
                const m = await getLessonProgressForStudent(sid);
                const p = m.get(lid);
                return p ? { status: p.status, lastSlide: p.lastSlide, revisionCount: p.revisionCount } : null;
              }}
              onMarkProgress={async (sid, lid, slide, total) => { await markLessonProgress(sid, lid, slide, total); }}
              onMarkLessonDone={async (sid, lid, total) => { await markLessonDone(studentMode ? null : teacherId, sid, lid, total); }}
              onLogRevision={async (sid, lid) => { await logLessonRevision(sid, lid); }}
              onClose={() => {}}
              onSaveWhiteboard={async (data) => { await saveWhiteboardData(lesson.id, wbAuthorId, data); }}
              onLoadWhiteboard={async () => getWhiteboardData(lesson.id, wbAuthorId)}
              onUploadImage={async (file) => uploadNoteImage(lesson.id, wbAuthorId, file)}
              vocabWords={canvasVocabWords}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 dark:text-slate-400">
              <span className="text-5xl">📄</span>
              <p className="text-sm">No PDF attached to this lesson yet.</p>
            </div>
          )
        )}
        {activeTab === 'homework' && (
          <div className="h-full overflow-y-auto">
            <HomeworkTab
              lessonId={lesson.id}
              isAdmin={isAdmin}
              studentId={preSelectedStudentId}
              onHomeworkComplete={onHomeworkComplete}
            />
          </div>
        )}
        {activeTab === 'vocabulary' && (
          <div className="h-full overflow-y-auto">
            <VocabularyTab
              lessonId={lesson.id} isAdmin={isAdmin}
              students={students} preSelectedStudentId={preSelectedStudentId}
            />
          </div>
        )}
        {activeTab === 'video' && (
          <div className="h-full overflow-y-auto">
            <VideoTab lesson={lesson} isAdmin={isAdmin} onLessonUpdated={setLesson} />
          </div>
        )}

        {/* ── Grammar Summary tab ── */}
        {activeTab === 'grammar' && (
          <div className="h-full overflow-y-auto p-6">
            <GrammarTab
              label={t('arabicLessonDetail.tabGrammar')}
              description={studentMode
                ? t('arabicLessonDetail.grammarDescStudent')
                : t('arabicLessonDetail.grammarDescAdmin')}
              lessonNumber={lesson.orderIndex}
              value={grammarSummary}
              saveStatus={grammarSaveStatus}
              onChange={handleGrammarChange}
              readOnly={!isAdmin}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// NOTE TAB  (shared by Teacher's Note & Grammar Summary)
// ═══════════════════════════════════════════════════════

const NoteTab: React.FC<{
  label: string;
  icon: string;
  description: string;
  value: string;
  saveStatus: 'saved' | 'saving' | null;
  onChange: (val: string) => void;
  readOnly?: boolean;
}> = ({ label, icon, description, value, saveStatus, onChange, readOnly = false }) => {
  const { t } = useI18n();
  return (
  <div className="max-w-3xl mx-auto space-y-4">
    {/* Header */}
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span>{icon}</span>{label}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
      </div>
      {/* Auto-save indicator — only when editable */}
      {!readOnly && (
        <div className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold mt-1">
          {saveStatus === 'saving' && (
            <>
              <div className="w-3 h-3 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
              <span className="text-amber-600 dark:text-amber-400">{t('arabicLessonDetail.saving')}</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              <span className="text-emerald-600 dark:text-emerald-400">{t('arabicLessonDetail.saved')}</span>
            </>
          )}
        </div>
      )}
    </div>

    {/* Read-only view for students */}
    {readOnly ? (
      value ? (
        <div
          dir="auto"
          className="w-full min-h-[420px] p-4 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl shadow-sm leading-relaxed whitespace-pre-wrap">
          {value}
        </div>
      ) : (
        <div className="w-full min-h-[200px] flex items-center justify-center bg-slate-50 dark:bg-gray-800 border border-dashed border-slate-200 dark:border-gray-700 rounded-xl">
          <p className="text-sm text-slate-400 dark:text-slate-500 italic">{t('arabicLessonDetail.noGrammar')}</p>
        </div>
      )
    ) : (
      /* Editable textarea for tutor */
      <>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={`Write your ${label.toLowerCase()} here…`}
          className="w-full min-h-[420px] p-4 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 resize-y leading-relaxed placeholder-slate-300 dark:placeholder-slate-600"
          dir="auto"
        />
        {!value && (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">
            {t('arabicLessonDetail.autoSaveHint')}
          </p>
        )}
      </>
    )}
  </div>
  );
};

// ═══════════════════════════════════════════════════════
// GRAMMAR TAB  (numbered grammar points: 1.1, 1.2, …)
// ═══════════════════════════════════════════════════════

/** Grammar points are stored in the `grammar_summary` column as a JSON array of
 *  strings. Legacy plain-text values are treated as a single point. */
function parseGrammarRows(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) return parsed;
  } catch { /* not JSON → legacy plain text */ }
  return [raw];
}

const GrammarTab: React.FC<{
  label: string;
  description: string;
  lessonNumber: number;
  value: string;
  saveStatus: 'saved' | 'saving' | null;
  onChange: (val: string) => void;
  readOnly?: boolean;
}> = ({ label, description, lessonNumber, value, saveStatus, onChange, readOnly = false }) => {
  const { t } = useI18n();
  const [rows, setRows] = useState<string[]>(() => {
    const parsed = parseGrammarRows(value);
    return parsed.length ? parsed : (readOnly ? [] : ['']);
  });

  const commit = (next: string[]) => { setRows(next); onChange(JSON.stringify(next)); };
  const updateRow = (i: number, val: string) => { const next = rows.slice(); next[i] = val; commit(next); };
  const addRow    = () => commit([...rows, '']);
  const removeRow = (i: number) => { const next = rows.filter((_, idx) => idx !== i); commit(next.length ? next : ['']); };

  const NumberBadge: React.FC<{ i: number }> = ({ i }) => (
    <div className="flex-shrink-0 w-14 h-11 flex items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 font-bold text-sm text-amber-700 dark:text-amber-300 select-none">
      {lessonNumber}.{i + 1}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>📐</span>{label}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
        </div>
        {!readOnly && (
          <div className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold mt-1">
            {saveStatus === 'saving' && (
              <>
                <div className="w-3 h-3 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                <span className="text-amber-600 dark:text-amber-400">{t('arabicLessonDetail.saving')}</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
                <span className="text-emerald-600 dark:text-emerald-400">{t('arabicLessonDetail.saved')}</span>
              </>
            )}
          </div>
        )}
      </div>

      {readOnly ? (
        rows.some(r => r.trim()) ? (
          <div className="space-y-3">
            {rows.filter(r => r.trim()).map((row, i) => (
              <div key={i} className="flex items-start gap-3">
                <NumberBadge i={i} />
                <div dir="auto" className="flex-1 p-3 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl shadow-sm leading-relaxed whitespace-pre-wrap">
                  {row}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full min-h-[200px] flex items-center justify-center bg-slate-50 dark:bg-gray-800 border border-dashed border-slate-200 dark:border-gray-700 rounded-xl">
            <p className="text-sm text-slate-400 dark:text-slate-500 italic">{t('arabicLessonDetail.noGrammar')}</p>
          </div>
        )
      ) : (
        <>
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="flex items-start gap-3">
                <NumberBadge i={i} />
                <textarea
                  value={row}
                  onChange={e => updateRow(i, e.target.value)}
                  placeholder={`Grammar point ${lessonNumber}.${i + 1}…`}
                  rows={2}
                  className="flex-1 p-3 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 resize-y leading-relaxed placeholder-slate-300 dark:placeholder-slate-600"
                  dir="auto"
                />
                <button
                  onClick={() => removeRow(i)}
                  title="Remove"
                  className="flex-shrink-0 w-9 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                  🗑
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addRow}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold shadow-sm active:scale-95 transition-all">
            <span className="text-base leading-none">＋</span> Add grammar point ({lessonNumber}.{rows.length + 1})
          </button>
        </>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// HOMEWORK TAB
// ═══════════════════════════════════════════════════════

type PracticePhase = 'idle' | 'practising' | 'done';

const HomeworkTab: React.FC<{
  lessonId: string;
  isAdmin: boolean;
  studentId?: string;
  onHomeworkComplete?: (lessonId: string) => void;
}> = ({ lessonId, isAdmin, studentId, onHomeworkComplete }) => {
  const { t } = useI18n();
  const [items, setItems]           = useState<HomeworkItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [addingQ, setAddingQ]       = useState(false);
  const [editingQ, setEditingQ]     = useState<HomeworkItem | null>(null);
  const [practicePhase, setPhase]   = useState<PracticePhase>('idle');
  const [qIndex, setQIndex]         = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [blankAnswers, setBlankAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback]     = useState<'correct' | 'wrong' | 'manual' | null>(null);
  const [score, setScore]           = useState(0);
  const fileRef                     = useRef<HTMLInputElement>(null);
  const dragIdx                     = useRef<number | null>(null);
  const [overIdx, setOverIdx]       = useState<number | null>(null);

  const reload = useCallback(async () => {
    const its = await getHomeworkItems(lessonId);
    setItems(its);
    setLoading(false);
  }, [lessonId]);

  useEffect(() => { reload(); }, [reload]);

  const practiceItems = items.filter(i => i.itemType === 'question');

  const startPractice = () => {
    setQIndex(0); setUserAnswer(''); setBlankAnswers({}); setFeedback(null); setScore(0);
    setPhase('practising');
  };

  const checkAnswer = () => {
    const q = practiceItems[qIndex];
    const qtype = q.questionType;
    const questionText = q.content ?? '';
    if (qtype === 'matching' || qtype === 'short_answer' || qtype === 'multi_answer') {
      setFeedback('manual'); return;
    }
    let correct = false;
    if (qtype === 'fill_blank') {
      const blanksCount = (questionText.match(/___/g) ?? []).length;
      const answers = q.options?.length ? q.options : [q.correctAnswer ?? ''];
      correct = Array.from({ length: blanksCount }, (_, i) => i)
        .every(i => answersMatch(answers[i] ?? '', blankAnswers[i] ?? ''));
    } else if (qtype === 'multiple_choice' || qtype === 'fill_blank_options' || qtype === 'true_false') {
      correct = userAnswer === q.correctAnswer;
    } else {
      correct = answersMatch(q.correctAnswer ?? '', userAnswer);
    }
    if (correct) setScore(s => s + 1);
    setFeedback(correct ? 'correct' : 'wrong');
  };

  const nextQuestion = () => {
    if (qIndex + 1 >= practiceItems.length) {
      setPhase('done');
      if (studentId) {
        markHomeworkComplete(studentId, lessonId).catch(console.error);
        onHomeworkComplete?.(lessonId);
      }
      return;
    }
    setQIndex(i => i + 1); setUserAnswer(''); setBlankAnswers({}); setFeedback(null);
  };

  // Admin builder helpers
  const addTextItem = async (type: ArabicExamItemType) => {
    await createHomeworkItem({ lessonId, itemType: type, content: type === 'divider' ? undefined : '' });
    reload();
  };

  const onAddClick = (type: ArabicExamItemType) => {
    if (type === 'question') { setAddingQ(true); return; }
    if (type === 'image')    { fileRef.current?.click(); return; }
    addTextItem(type);
  };

  const onImageChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = await uploadHomeworkImage(file);
    if (url) { await createHomeworkItem({ lessonId, itemType: 'image', imageUrl: url }); reload(); }
  };

  const handleDragEnd = async () => {
    const from = dragIdx.current;
    const to = overIdx;
    setOverIdx(null);
    dragIdx.current = null;
    if (from === null || to === null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    await reorderHomeworkItems(next.map(i => i.id));
  };

  const removeItem = async (item: HomeworkItem) => {
    if (!window.confirm('Delete this item?')) return;
    await deleteHomeworkItem(item.id);
    reload();
  };

  const saveContent = async (item: HomeworkItem, content: string) => {
    if (content === (item.content ?? '')) return;
    await updateHomeworkItem(item.id, { content });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, content } : i));
  };

  if (loading) return <LoadingSpinner />;

  // ── Practice ─────────────────────────────────────────────────────────────
  if (practicePhase === 'practising') {
    const q = practiceItems[qIndex];
    const qtype = q.questionType;
    const questionText = q.content ?? '';
    const fbParts = qtype === 'fill_blank' ? questionText.split('___') : [];
    const fbAnswers = q.options?.length ? q.options : [q.correctAnswer ?? ''];
    const isManual = qtype === 'matching' || qtype === 'short_answer' || qtype === 'multi_answer';

    return (
      <div className="max-w-4xl mx-auto p-10 space-y-8">
        <div className="flex items-center justify-between">
          <span className="text-base text-slate-500 dark:text-slate-400">{t('arabicLessonDetail.questionOf', { n: qIndex + 1, total: practiceItems.length })}</span>
          <button onClick={() => setPhase('idle')} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">× {t('arabicLessonDetail.exit')}</button>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(qIndex / practiceItems.length) * 100}%` }} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-10 shadow-sm space-y-6">
          <span className="inline-block px-3 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full text-sm font-semibold">
            {QUESTION_TYPE_LABELS[qtype ?? 'short_answer']}
          </span>

          {/* Question text */}
          {qtype !== 'fill_blank' && (
            <p className="text-2xl font-semibold text-slate-800 dark:text-slate-100"
               dir={qtype === 'translate_to_english' ? 'rtl' : 'ltr'}>
              {questionText}
            </p>
          )}

          {/* Tutor-marked notice */}
          {isManual && (
            <div className="px-4 py-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl text-sm text-sky-700 dark:text-sky-300">
              This question type is marked by your tutor.
            </div>
          )}

          {/* Answer input by type */}
          {!isManual && (
            <>
              {(qtype === 'multiple_choice' || qtype === 'fill_blank_options') && q.options?.length ? (
                <div className="space-y-3">
                  {q.options.map((opt, i) => (
                    <button key={i} disabled={!!feedback} onClick={() => setUserAnswer(opt)}
                      className={`w-full text-left px-6 py-4 rounded-xl border-2 text-base transition-colors ${
                        userAnswer === opt
                          ? feedback === 'correct' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                            : feedback === 'wrong' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                            : 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-200 dark:border-gray-600 hover:border-amber-300 text-slate-700 dark:text-slate-200'
                      }`}>
                      {String.fromCharCode(65 + i)}. {opt}
                    </button>
                  ))}
                </div>
              ) : qtype === 'true_false' ? (
                <div className="flex gap-4">
                  {(['True', 'False']).map(opt => (
                    <button key={opt} disabled={!!feedback} onClick={() => setUserAnswer(opt)}
                      className={`flex-1 py-4 rounded-xl border-2 font-semibold text-base transition-colors ${
                        userAnswer === opt
                          ? feedback === 'correct' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                            : feedback === 'wrong' ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                            : 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-200 dark:border-gray-600 hover:border-amber-300 text-slate-700 dark:text-slate-200'
                      }`}>{opt}
                    </button>
                  ))}
                </div>
              ) : qtype === 'fill_blank' ? (
                <div className="flex flex-wrap items-center gap-2 text-xl leading-loose">
                  {fbParts.map((part, i) => (
                    <React.Fragment key={i}>
                      {part && <span className="text-slate-800 dark:text-slate-100">{part}</span>}
                      {i < fbParts.length - 1 && (
                        <input type="text" value={blankAnswers[i] ?? ''}
                          onChange={e => setBlankAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter' && !feedback) checkAnswer(); }}
                          disabled={!!feedback}
                          className={`w-36 px-3 py-1 border-b-2 text-center text-base focus:outline-none transition-colors ${
                            feedback === 'correct' ? 'border-emerald-500 text-emerald-700'
                              : feedback === 'wrong' ? 'border-red-500 text-red-700'
                              : 'border-amber-500 focus:border-amber-600'
                          } bg-transparent dark:text-white`}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <input type="text" value={userAnswer}
                  onChange={e => setUserAnswer(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !feedback) checkAnswer(); }}
                  disabled={!!feedback}
                  dir={qtype === 'translate_to_arabic' ? 'rtl' : 'ltr'}
                  placeholder="Type your answer…"
                  className="w-full px-5 py-4 border-2 border-slate-200 dark:border-gray-600 rounded-xl text-base focus:outline-none focus:border-amber-400 dark:bg-gray-700 dark:text-white"
                  autoFocus
                />
              )}
            </>
          )}

          {/* Feedback */}
          {feedback && feedback !== 'manual' && (
            <div className={`flex items-start gap-4 p-4 rounded-xl ${feedback === 'correct' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
              <span className="text-2xl">{feedback === 'correct' ? '✅' : '❌'}</span>
              <div>
                <p className="font-semibold text-lg">{feedback === 'correct' ? t('arabicLessonDetail.correct') : t('arabicLessonDetail.incorrect')}</p>
                {feedback === 'wrong' && (
                  <p className="text-base mt-0.5">
                    {t('arabicLessonDetail.correctAnswer')} <span className="font-bold">
                      {qtype === 'fill_blank' ? fbAnswers.join(' / ') : q.correctAnswer}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {!feedback ? (
              <button onClick={checkAnswer}
                disabled={isManual ? false : qtype === 'fill_blank'
                  ? Object.keys(blankAnswers).length < (questionText.match(/___/g) ?? []).length
                  : !userAnswer}
                className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl disabled:opacity-40 transition-colors text-base">
                {isManual ? 'Continue' : t('arabicLessonDetail.submit')}
              </button>
            ) : (
              <button onClick={nextQuestion}
                className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-base">
                {qIndex + 1 >= practiceItems.length ? t('arabicLessonDetail.seeResults') : t('arabicLessonDetail.nextQuestion')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  if (practicePhase === 'done') {
    const pct = Math.round((score / practiceItems.length) * 100);
    return (
      <div className="max-w-2xl mx-auto p-12 text-center space-y-6">
        <div className="text-7xl">{pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</div>
        <h2 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{t('arabicLessonDetail.practiceComplete')}</h2>
        <p className="text-lg text-slate-500 dark:text-slate-400">
          {t('arabicLessonDetail.practiceScore', { score, total: practiceItems.length, pct })}
        </p>
        <button onClick={startPractice}
          className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-base">
          {t('arabicLessonDetail.tryAgain')}
        </button>
        <button onClick={() => setPhase('idle')}
          className="w-full py-4 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors text-base">
          {t('arabicLessonDetail.backToQuestions')}
        </button>
      </div>
    );
  }

  // ── Normal view ───────────────────────────────────────────────────────────
  let qNum = 0;
  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('arabicLessonDetail.homeworkTitle')}</h2>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-1">
            {practiceItems.length} question{practiceItems.length !== 1 ? 's' : ''}{items.length > practiceItems.length ? ` · ${items.length} total items` : ''}
          </p>
        </div>
        {practiceItems.length > 0 && !isAdmin && (
          <button onClick={startPractice}
            className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors text-base">
            ▶ {t('arabicLessonDetail.startPractice')}
          </button>
        )}
      </div>

      {/* Admin add buttons */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {ADD_BUTTONS.map(b => (
            <button key={b.type} onClick={() => onAddClick(b.type)}
              className="px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors">
              {b.icon} {b.label}
            </button>
          ))}
        </div>
      )}

      {/* Add / edit question form */}
      {isAdmin && addingQ && (
        <HomeworkQuestionForm lessonId={lessonId} onDone={() => { setAddingQ(false); reload(); }} onCancel={() => setAddingQ(false)} />
      )}
      {isAdmin && editingQ && (
        <HomeworkQuestionForm lessonId={lessonId} existing={editingQ} onDone={() => { setEditingQ(null); reload(); }} onCancel={() => setEditingQ(null)} />
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-3">📝</div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{t('arabicLessonDetail.noQuestions')}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin ? t('arabicLessonDetail.noQuestionsAdmin') : t('arabicLessonDetail.noQuestionsStudent')}
          </p>
        </div>
      )}

      {/* Items list */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((item, index) => {
            if (item.itemType === 'question') qNum++;
            return (
              <div
                key={item.id}
                draggable={isAdmin}
                onDragStart={isAdmin ? () => { dragIdx.current = index; } : undefined}
                onDragOver={isAdmin ? e => { e.preventDefault(); setOverIdx(index); } : undefined}
                onDragEnd={isAdmin ? handleDragEnd : undefined}
                className={`bg-white dark:bg-gray-800 border rounded-xl p-3 flex gap-3 transition-colors ${
                  isAdmin && overIdx === index
                    ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-200 dark:ring-amber-900'
                    : 'border-slate-200 dark:border-gray-700'
                }`}
              >
                {isAdmin && (
                  <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 select-none text-xl flex items-center px-0.5" title="Drag to reorder">
                    ⠿
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {item.itemType === 'question'
                        ? `Q${qNum} · ${QUESTION_TYPE_LABELS[item.questionType ?? 'short_answer']} · ${item.marks ?? 0} marks`
                        : item.itemType}
                    </span>
                    {isAdmin && (
                      <div className="flex gap-2">
                        {item.itemType === 'question' && (
                          <button onClick={() => setEditingQ(item)} className="text-xs font-semibold text-sky-600 hover:underline">Edit</button>
                        )}
                        <button onClick={() => removeItem(item)} className="text-xs font-semibold text-red-500 hover:underline">Delete</button>
                      </div>
                    )}
                  </div>
                  {item.itemType === 'divider' && <hr className="border-slate-200 dark:border-gray-700" />}
                  {item.itemType === 'image' && item.imageUrl && (
                    <img src={item.imageUrl} alt="" className="max-h-40 rounded-lg border border-slate-200 dark:border-gray-700" />
                  )}
                  {(['section', 'headline', 'instruction', 'paragraph'] as ArabicExamItemType[]).includes(item.itemType) && (
                    isAdmin ? (
                      <textarea
                        defaultValue={item.content ?? ''}
                        onBlur={e => saveContent(item, e.target.value)}
                        rows={item.itemType === 'paragraph' ? 3 : 1}
                        dir="auto"
                        placeholder={`Enter ${item.itemType} text…`}
                        className={inp}
                      />
                    ) : (
                      <p className={`text-sm dark:text-slate-200 ${item.itemType === 'headline' ? 'font-bold text-base' : item.itemType === 'section' ? 'font-bold text-amber-700 dark:text-amber-300' : 'text-slate-700'}`} dir="auto">
                        {item.content}
                      </p>
                    )
                  )}
                  {item.itemType === 'question' && (
                    <p className="text-sm text-slate-700 dark:text-slate-200" dir="auto">
                      {item.content || <span className="text-slate-400">No prompt</span>}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Homework Question Form (mirrors ExamQuestionForm) ─────────────────────────

const HomeworkQuestionForm: React.FC<{
  lessonId: string;
  existing?: HomeworkItem;
  onDone: () => void;
  onCancel: () => void;
}> = ({ lessonId, existing, onDone, onCancel }) => {
  const isEdit = !!existing;
  const [type, setType]   = useState<HomeworkQuestionType>(
    existing?.questionType === 'fill_blank_options' ? 'fill_blank' : (existing?.questionType ?? 'multiple_choice'),
  );
  const [question, setQuestion]       = useState(existing?.content ?? '');
  const [options, setOptions]   = useState<string[]>(existing?.options ?? ['', '', '', '']);
  const [correct, setCorrect]   = useState(existing?.correctAnswer ?? '');
  const [marks, setMarks]       = useState<number>(existing?.marks ?? 1);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');
  const [showChoices, setShowChoices] = useState(
    existing?.questionType === 'fill_blank_options' ||
    (existing?.questionType === 'fill_blank' && (existing.options?.length ?? 0) > 0),
  );
  const [pairs, setPairs] = useState<{ left: string; right: string }[]>(() => {
    if (existing?.questionType === 'matching' && existing.correctAnswer) {
      try { return (JSON.parse(existing.correctAnswer) as [string, string][]).map(([l, r]) => ({ left: l, right: r })); }
      catch { /* fall through */ }
    }
    return [{ left: '', right: '' }, { left: '', right: '' }];
  });
  const isArabicAnswer = type === 'translate_to_arabic';

  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';
  const lbl = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide';

  const handleTypeChange = (newType: HomeworkQuestionType) => {
    setType(newType); setShowChoices(false); setCorrect('');
    if (newType === 'multi_answer') setOptions(['', '']);
    else if (newType === 'multiple_choice') setOptions(['', '', '', '']);
    else if (newType === 'fill_blank') setOptions(['', '', '']);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const q = question.trim();
    if (!q) { setErr('Question text is required.'); return; }
    let finalOptions: string[] | undefined;
    let finalCorrect = correct.trim();

    if (type === 'multiple_choice') {
      finalOptions = options.map(o => o.trim());
      if (finalOptions.some(o => !o)) { setErr('Fill all options.'); return; }
      if (!finalCorrect || !finalOptions.includes(finalCorrect)) { setErr('Pick the correct option.'); return; }
    } else if (type === 'true_false') {
      if (!finalCorrect) { setErr('Choose True or False.'); return; }
    } else if (type === 'fill_blank') {
      if (!q.includes('___')) { setErr('Use ___ to mark the blank(s).'); return; }
      if (showChoices) {
        finalOptions = options.filter(o => o.trim());
        if (finalOptions.length < 2) { setErr('Add at least 2 choices.'); return; }
      }
    } else if (type === 'matching') {
      const validPairs = pairs.filter(p => p.left.trim() && p.right.trim());
      if (validPairs.length < 2) { setErr('Add at least 2 complete pairs.'); return; }
      finalCorrect = JSON.stringify(validPairs.map(p => [p.left.trim(), p.right.trim()]));
    } else if (type === 'short_answer') {
      finalCorrect = '';
    } else if (type === 'multi_answer') {
      finalOptions = options.filter(o => o.trim());
      if (finalOptions.length < 1) { setErr('Add at least one word.'); return; }
      finalCorrect = '';
    } else {
      if (!finalCorrect) { setErr('Provide the correct answer.'); return; }
    }
    if (marks < 0) { setErr('Marks must be 0 or more.'); return; }

    setSaving(true);
    const payload = { content: q, questionType: type, options: finalOptions, correctAnswer: finalCorrect || undefined, marks };
    if (isEdit && existing) {
      await updateHomeworkItem(existing.id, payload);
    } else {
      await createHomeworkItem({ lessonId, itemType: 'question', ...payload });
    }
    setSaving(false);
    onDone();
  };

  return (
    <form onSubmit={submit} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-4 mb-4">
      <h3 className="font-bold text-amber-800 dark:text-amber-300">{isEdit ? 'Edit question' : 'New question'}</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Type</label>
          <select value={type} onChange={e => handleTypeChange(e.target.value as HomeworkQuestionType)} disabled={isEdit} className={inp}>
            {ADMIN_QUESTION_TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Marks</label>
          <input type="number" min={0} value={marks} onChange={e => setMarks(Number(e.target.value))} className={inp} />
        </div>
      </div>

      <div>
        <label className={lbl}>
          {type === 'translate_to_english' ? 'Arabic text to translate'
            : type === 'fill_blank' ? 'Question (use ___ for each blank)'
            : type === 'matching' ? 'Question / instruction (optional)'
            : 'Question / statement'}
        </label>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2} dir="auto" className={inp} />
      </div>

      {type === 'multiple_choice' && (
        <div>
          <label className={lbl}>Options — click the dot to mark the correct one</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button type="button" onClick={() => setCorrect(opt)}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${correct === opt && opt.trim() ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}>
                  {correct === opt && opt.trim() && '✓'}
                </button>
                <span className="text-xs font-bold text-slate-500 w-5">{String.fromCharCode(65 + i)}.</span>
                <input value={opt}
                  onChange={e => { const prev = opt; setOptions(options.map((o, j) => j === i ? e.target.value : o)); if (correct === prev) setCorrect(e.target.value); }}
                  dir={isArabicAnswer ? 'rtl' : 'ltr'} placeholder={`Option ${String.fromCharCode(65 + i)}`} className={`flex-1 ${inp}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {type === 'true_false' && (
        <div>
          <label className={lbl}>Correct answer</label>
          <div className="flex gap-3">
            {['True', 'False'].map(v => (
              <button key={v} type="button" onClick={() => setCorrect(v)}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold ${correct === v ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300'}`}>{v}</button>
            ))}
          </div>
        </div>
      )}

      {type === 'fill_blank' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={lbl + ' mb-0'}>Choices (optional)</label>
            <button type="button" onClick={() => { setShowChoices(!showChoices); setOptions(['', '', '']); }}
              className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline">
              {showChoices ? '− Remove choices' : '+ Add choices'}
            </button>
          </div>
          {showChoices && (
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-5">{String.fromCharCode(65 + i)}.</span>
                  <input value={opt} onChange={e => setOptions(options.map((o, j) => j === i ? e.target.value : o))}
                    dir="auto" placeholder={`Choice ${String.fromCharCode(65 + i)}`} className={`flex-1 ${inp}`} />
                  {options.length > 2 && (
                    <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setOptions([...options, ''])} className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">+ Add choice</button>
            </div>
          )}
        </div>
      )}

      {type === 'matching' && (
        <div>
          <label className={lbl}>Word pairs</label>
          <div className="space-y-2">
            {pairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={pair.left} onChange={e => setPairs(ps => ps.map((p, j) => j === i ? { ...p, left: e.target.value } : p))}
                  dir="auto" placeholder="Word / phrase" className={`flex-1 ${inp}`} />
                <span className="text-slate-400 flex-shrink-0">↔</span>
                <input value={pair.right} onChange={e => setPairs(ps => ps.map((p, j) => j === i ? { ...p, right: e.target.value } : p))}
                  dir="auto" placeholder="Matching word" className={`flex-1 ${inp}`} />
                {pairs.length > 2 && (
                  <button type="button" onClick={() => setPairs(ps => ps.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-lg leading-none flex-shrink-0">×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setPairs(ps => [...ps, { left: '', right: '' }])}
            className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">+ Add pair</button>
        </div>
      )}

      {type === 'short_answer' && (
        <p className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-gray-700 rounded-lg px-3 py-2 border border-slate-200 dark:border-gray-600">
          Student types a free-text answer. Tutor marks manually.
        </p>
      )}

      {type === 'multi_answer' && (
        <div>
          <label className={lbl}>Words — student writes an answer next to each</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 w-5">{i + 1}.</span>
                <input value={opt} onChange={e => setOptions(options.map((o, j) => j === i ? e.target.value : o))}
                  dir="auto" placeholder={`Word ${i + 1}`} className={`flex-1 ${inp}`} />
                {options.length > 1 && (
                  <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setOptions([...options, ''])}
            className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">+ Add word</button>
        </div>
      )}

      {(type === 'translate_to_arabic' || type === 'translate_to_english') && (
        <div>
          <label className={lbl}>Correct answer</label>
          <input value={correct} onChange={e => setCorrect(e.target.value)}
            dir={isArabicAnswer ? 'rtl' : 'ltr'} placeholder="Correct answer…" className={inp} />
        </div>
      )}
      {type === 'fill_blank' && (
        <div>
          <label className={lbl}>Correct answer <span className="normal-case font-normal text-slate-400">(optional — tutor marks)</span></label>
          <input value={correct} onChange={e => setCorrect(e.target.value)} dir="auto" placeholder="Model answer…" className={inp} />
        </div>
      )}

      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 py-2 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-gray-600 rounded-lg text-sm font-semibold">Cancel</button>
        <button type="submit" disabled={saving} className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50">{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add question'}</button>
      </div>
    </form>
  );
};

// ═══════════════════════════════════════════════════════
// VOCABULARY TAB
// ═══════════════════════════════════════════════════════

interface VocabTabProps {
  lessonId: string;
  isAdmin: boolean;
  students: ArabicStudent[];
  preSelectedStudentId?: string;
}

type ChallengePhase = 'idle' | 'active' | 'wrong' | 'complete';

const VocabularyTab: React.FC<VocabTabProps> = ({ lessonId, isAdmin, students, preSelectedStudentId }) => {
  const { t } = useI18n();
  const [words, setWords]           = useState<VocabWord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showAddWord, setShowAdd]   = useState(false);
  const [showBulk, setShowBulk]     = useState(false);
  // Only show student selector if no student pre-selected
  const [selectedStudentId, setStudentId] = useState(preSelectedStudentId ?? '');
  const [attempts, setAttempts]     = useState<VocabAttempt[]>([]);

  // Word Flight game
  const [showWordFlight, setShowWordFlight] = useState(false);

  // Challenge state — "I know / Not sure" button flow
  const [phase, setPhase]           = useState<ChallengePhase>('idle');
  const [shuffled, setShuffled]     = useState<VocabWord[]>([]);
  const [cardIndex, setCardIndex]   = useState(0);
  const [wrongWords, setWrongWords] = useState<VocabWord[]>([]);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    getVocabWords(lessonId).then(ws => { setWords(ws); setLoading(false); });
  }, [lessonId]);

  useEffect(() => {
    if (!selectedStudentId) { setAttempts([]); return; }
    getVocabAttempts(selectedStudentId, lessonId).then(setAttempts);
  }, [selectedStudentId, lessonId]);

  const startChallenge = () => {
    setShuffled(shuffleArray(words)); setCardIndex(0);
    setWrongWords([]);
    setPhase('active');
  };

  const restartChallenge = () => {
    setShuffled(shuffleArray(words)); setCardIndex(0);
    setPhase('active');
  };

  /** "I know" — move to next card */
  const handleKnow = () => {
    if (cardIndex + 1 >= shuffled.length) {
      setPhase('complete');
      if (selectedStudentId) saveSpacedRep();
      // Save any wrong words accumulated before the final correct streak
      if (selectedStudentId && wrongWords.length > 0) {
        saveVocabMistakes(selectedStudentId, wrongWords.map(w => ({ wordId: w.id, lessonId }))).catch(console.error);
      }
    } else {
      setCardIndex(i => i + 1);
    }
  };

  /** "Not Sure" — record word as wrong, show answer, then restart */
  const handleNotSure = () => {
    const word = shuffled[cardIndex];
    setWrongWords(prev => prev.some(w => w.id === word.id) ? prev : [...prev, word]);
    setPhase('wrong');
  };

  /** After user acknowledges wrong answer, restart challenge */
  const handleRestartAfterWrong = () => {
    restartChallenge();
  };

  // Saves spaced-repetition progress for BOTH modes (arabic + transliteration)
  // All 5 future attempt dates are calculated from the first attempt date.
  const saveSpacedRep = async () => {
    setSaving(true);
    const now  = new Date();
    const DELAYS = [0, 1, 3, 7, 14]; // days from first-attempt date
    const newAttempts: VocabAttempt[] = [];

    for (const word of words) {
      for (const wMode of (['arabic', 'transliteration'] as VocabMode[])) {
        const existing = attempts.filter(a => a.wordId === word.id && a.mode === wMode);
        const completedNums = new Set(existing.filter(a => a.completedAt).map(a => a.attemptNumber));
        const pending = existing.find(a => !a.completedAt);

        if (completedNums.size === 0 && !pending) {
          // First session — create all 5 attempts; mark #1 as done now
          DELAYS.forEach((days, i) => {
            const d = new Date(now); d.setDate(d.getDate() + days);
            newAttempts.push({
              id: `vat-${now.getTime()}-${Math.random().toString(36).slice(2)}-${word.id}-${wMode}-${i + 1}`,
              studentId: selectedStudentId, wordId: word.id, lessonId,
              attemptNumber: i + 1, mode: wMode,
              scheduledAt: d.toISOString(),
              completedAt: i === 0 ? now.toISOString() : undefined,
              createdAt: now.toISOString(),
            });
          });
        } else if (pending) {
          // Mark the pending attempt as done
          newAttempts.push({ ...pending, completedAt: now.toISOString() });
          // Ensure all subsequent attempts exist (for old data created before this change)
          const firstAttempt = existing.find(a => a.attemptNumber === 1);
          const firstDate = firstAttempt?.completedAt ? new Date(firstAttempt.completedAt) : now;
          for (let i = pending.attemptNumber + 1; i <= 5; i++) {
            if (!existing.find(a => a.attemptNumber === i)) {
              const d = new Date(firstDate); d.setDate(d.getDate() + DELAYS[i - 1]);
              newAttempts.push({
                id: `vat-${now.getTime()}-${Math.random().toString(36).slice(2)}-${word.id}-${wMode}-${i}`,
                studentId: selectedStudentId, wordId: word.id, lessonId,
                attemptNumber: i, mode: wMode,
                scheduledAt: d.toISOString(), completedAt: undefined,
                createdAt: now.toISOString(),
              });
            }
          }
        }
        // If all 5 already completed → skip
      }
    }
    await saveVocabAttempts(newAttempts);
    const fresh = await getVocabAttempts(selectedStudentId, lessonId);
    setAttempts(fresh);
    setSaving(false);
  };

  const handleDeleteWord = async (id: string) => {
    if (!confirm(t('arabicLessonDetail.deleteWordConfirm'))) return;
    if (await deleteVocabWord(id)) setWords(prev => prev.filter(w => w.id !== id));
  };

  if (loading) return <LoadingSpinner />;

  // ── Challenge: active (I know / Not Sure) ────────────────────────────────
  if (phase === 'active') {
    const word = shuffled[cardIndex];
    return (
      <div className="max-w-3xl mx-auto p-10 space-y-8">
        <div className="flex items-center justify-between">
          <span className="text-base text-slate-500 dark:text-slate-400">{t('arabicLessonDetail.cardOf', { n: cardIndex + 1, total: shuffled.length })}</span>
          <button onClick={() => setPhase('idle')} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">× {t('arabicLessonDetail.exit')}</button>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${(cardIndex / shuffled.length) * 100}%` }} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 py-16 px-12 text-center shadow-sm space-y-4">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest">{t('arabicLessonDetail.doYouKnow')}</p>
          <p className="text-5xl font-extrabold text-slate-800 dark:text-slate-100">{word.english}</p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <button onClick={handleNotSure}
            className="py-7 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-bold rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-2xl">
            😕 {t('arabicLessonDetail.notSure')}
          </button>
          <button onClick={handleKnow}
            className="py-7 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 font-bold rounded-2xl hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors text-2xl">
            ✓ {t('arabicLessonDetail.iKnow')}
          </button>
        </div>
      </div>
    );
  }

  // ── Challenge: wrong — show answer then restart ────────────────────────────
  if (phase === 'wrong') {
    const word = shuffled[cardIndex];
    return (
      <div className="max-w-3xl mx-auto p-10 space-y-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-800 p-12 text-center shadow-sm space-y-6">
          <div className="text-5xl">😕</div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{word.english}</p>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6 space-y-2">
            <p className="text-sm font-semibold text-red-500 uppercase tracking-wide">{t('arabicLessonDetail.theArabicWordIs')}</p>
            <p className="text-5xl font-extrabold text-slate-800 dark:text-slate-100" dir="rtl">{word.arabic}</p>
            {word.transliteration && (
              <p className="text-base text-slate-500 dark:text-slate-400 italic">{word.transliteration}</p>
            )}
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
            <p className="text-base font-semibold text-amber-700 dark:text-amber-300">❗ {t('arabicLessonDetail.challengeWarning')}</p>
          </div>
        </div>
        <button onClick={handleRestartAfterWrong}
          className="w-full py-5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl transition-colors text-xl">
          🔄 {t('arabicLessonDetail.startOver')}
        </button>
        <button onClick={() => setPhase('idle')}
          className="w-full py-4 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors text-base">
          {t('arabicLessonDetail.backToWordList')}
        </button>
      </div>
    );
  }

  // ── Complete ──────────────────────────────────────────────────────────────
  if (phase === 'complete') {
    return (
      <div className="max-w-3xl mx-auto p-10 space-y-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-12 text-center shadow-sm space-y-5">
          <div className="text-7xl">🎉</div>
          <h2 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{t('arabicLessonDetail.challengeComplete')}</h2>
          <p className="text-lg text-slate-500 dark:text-slate-400">{t('arabicLessonDetail.challengeCompleteMsg', { count: words.length })}</p>
          {selectedStudentId && (
            <p className="text-base text-emerald-600 dark:text-emerald-400 font-semibold">
              {saving ? t('arabicLessonDetail.savingProgress') : t('arabicLessonDetail.progressSaved')}
            </p>
          )}
        </div>
        {wrongWords.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">{t('arabicLessonDetail.needMorePractice')}</h3>
            <div className="divide-y divide-slate-100 dark:divide-gray-700">
              {wrongWords.map(w => (
                <div key={w.id} className="py-3 grid grid-cols-3 gap-2 text-base text-center">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{w.english}</span>
                  <span dir="rtl">{w.arabic}</span>
                  <span className="text-slate-500 dark:text-slate-400">{w.transliteration}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-4">
          <button onClick={startChallenge}
            className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-base">
            {t('arabicLessonDetail.practiceAgain')}
          </button>
          <button onClick={() => setPhase('idle')}
            className="flex-1 py-4 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors text-base">
            {t('arabicLessonDetail.backToWords')}
          </button>
        </div>
      </div>
    );
  }

  // ── Idle / word list ──────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('arabicLessonDetail.vocabTrainer')}</h2>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-1">
            {t('arabicLessonDetail.vocabSubtitle', { count: words.length, hint: isAdmin ? t('arabicLessonDetail.vocabHintAdmin') : t('arabicLessonDetail.vocabHintStudent') })}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => { setShowAdd(false); setShowBulk(v => !v); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${showBulk ? 'bg-amber-100 text-amber-700' : 'bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>
              📋 {t('arabicLessonDetail.bulkImport')}
            </button>
            <button onClick={() => { setShowBulk(false); setShowAdd(v => !v); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors text-sm">
              {showAddWord ? `✕ ${t('arabicLessonDetail.cancel')}` : `+ ${t('arabicLessonDetail.addWord')}`}
            </button>
          </div>
        )}
      </div>

      {isAdmin && showBulk && (
        <BulkVocabImport lessonId={lessonId}
          onImported={ws => { setWords(prev => [...prev, ...ws]); setShowBulk(false); }}
          onCancel={() => setShowBulk(false)} />
      )}
      {isAdmin && showAddWord && (
        <AddVocabWordForm lessonId={lessonId}
          onCreated={w => { setWords(prev => [...prev, w]); setShowAdd(false); }}
          onCancel={() => setShowAdd(false)} />
      )}

      {words.length === 0 && !showAddWord && !showBulk && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-3">🔤</div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{t('arabicLessonDetail.noVocab')}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin ? t('arabicLessonDetail.noVocabAdmin') : t('arabicLessonDetail.noVocabStudent')}
          </p>
        </div>
      )}

      {words.length > 0 && (
        <>
          {/* Word table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden">
            <div className="grid grid-cols-4 bg-slate-50 dark:bg-gray-700/50 text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-5 py-3 border-b border-slate-200 dark:border-gray-700 text-center">
              <span className="text-left">#</span><span>Arabic</span><span>Transliteration</span><span>English</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-gray-700">
              {words.map((w, i) => (
                <div key={w.id} className="grid grid-cols-4 items-center px-5 py-4 group text-center">
                  <span className="text-sm text-slate-400 text-left">{i + 1}</span>
                  <span className="text-xl text-slate-800 dark:text-slate-100" dir="rtl">{w.arabic}</span>
                  <span className="text-base text-slate-600 dark:text-slate-300">{w.transliteration}</span>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-base text-slate-700 dark:text-slate-200">{w.english}</span>
                    {isAdmin && (
                      <button onClick={() => handleDeleteWord(w.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 rounded transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>


          {/* Challenge section — tutor only */}
          {!isAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-4">
              <div>
                <h3 className="font-bold text-slate-700 dark:text-slate-200">{t('arabicLessonDetail.flashcardChallenge')}</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {t('arabicLessonDetail.flashcardDesc', { count: words.length })}
                </p>
              </div>
              {/* Student selector only when no student pre-selected */}
              {!preSelectedStudentId && students.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{t('arabicLessonDetail.trackProgressFor')}</label>
                  <select value={selectedStudentId} onChange={e => setStudentId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="">{t('arabicLessonDetail.noStudentPractice')}</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <button onClick={startChallenge}
                className="w-full py-5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors text-lg">
                🎴 {t('arabicLessonDetail.startFlashcard', { count: words.length })}
              </button>
              <button onClick={() => setShowWordFlight(true)}
                className="w-full py-5 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl transition-colors text-lg">
                ✈️ Word Flight Game
              </button>
            </div>
          )}

          {showWordFlight && (
            <WordFlightGame
              words={words.map(w => ({ arabic: w.arabic, meaning: w.english }))}
              onExit={() => setShowWordFlight(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

// ── Add single word form ──────────────────────────────────────────────────────

const AddVocabWordForm: React.FC<{ lessonId: string; onCreated: (w: VocabWord) => void; onCancel: () => void }> = ({ lessonId, onCreated, onCancel }) => {
  const { t } = useI18n();
  const [arabic, setArabic]         = useState('');
  const [translit, setTranslit]     = useState('');
  const [english, setEnglish]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');
  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!arabic.trim() || !translit.trim() || !english.trim()) { setErr(t('arabicLessonDetail.errAllFieldsRequired')); return; }
    setSaving(true);
    const w = await createVocabWord({ lessonId, arabic: arabic.trim(), transliteration: translit.trim(), english: english.trim() });
    setSaving(false);
    if (!w) { setErr(t('arabicLessonDetail.errFailedToSave')); return; }
    onCreated(w);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-4">
      <h3 className="font-bold text-amber-800 dark:text-amber-300">{t('arabicLessonDetail.addWord')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{t('arabicLessonDetail.colArabic')}</label>
          <input value={arabic} onChange={e => setArabic(e.target.value)} dir="rtl" placeholder="كتاب" className={inp} /></div>
        <div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{t('arabicLessonDetail.colTranslit')}</label>
          <input value={translit} onChange={e => setTranslit(e.target.value)} placeholder="kitāb" className={inp} /></div>
        <div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{t('arabicLessonDetail.colEnglish')}</label>
          <input value={english} onChange={e => setEnglish(e.target.value)} placeholder="book" className={inp} /></div>
      </div>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-gray-600 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors">{t('arabicLessonDetail.cancel')}</button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">{saving ? t('arabicLessonDetail.savingEllipsis') : t('arabicLessonDetail.addWord')}</button>
      </div>
    </form>
  );
};

// ── Bulk import form ──────────────────────────────────────────────────────────

const BulkVocabImport: React.FC<{ lessonId: string; onImported: (ws: VocabWord[]) => void; onCancel: () => void }> = ({ lessonId, onImported, onCancel }) => {
  const { t } = useI18n();
  const [arabicText, setArabic]     = useState('');
  const [translitText, setTranslit] = useState('');
  const [englishText, setEnglish]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');

  const arabicLines  = arabicText.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const translitLines= translitText.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const englishLines = englishText.trim().split('\n').map(s => s.trim()).filter(Boolean);

  const handleImport = async () => {
    setErr('');
    if (!arabicLines.length) { setErr(t('arabicLessonDetail.errPasteArabic')); return; }
    if (arabicLines.length !== translitLines.length || arabicLines.length !== englishLines.length) {
      setErr(t('arabicLessonDetail.errLinesMismatch', { arabic: arabicLines.length, translit: translitLines.length, english: englishLines.length }));
      return;
    }
    setSaving(true);
    const created: VocabWord[] = [];
    for (let i = 0; i < arabicLines.length; i++) {
      const w = await createVocabWord({ lessonId, arabic: arabicLines[i], transliteration: translitLines[i], english: englishLines[i] });
      if (w) created.push(w);
    }
    setSaving(false);
    onImported(created);
  };

  const ta = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white resize-none';

  return (
    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-bold text-amber-800 dark:text-amber-300">{t('arabicLessonDetail.bulkImport')}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('arabicLessonDetail.bulkImportDesc')}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{t('arabicLessonDetail.bulkArabic')}</label>
          <textarea value={arabicText} onChange={e => setArabic(e.target.value)} rows={8}
            dir="rtl" placeholder={"كتاب\nقلم\nمدرسة"} className={ta} />
          <p className="text-xs text-slate-400 mt-0.5">{arabicLines.length} line{arabicLines.length !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{t('arabicLessonDetail.bulkTranslit')}</label>
          <textarea value={translitText} onChange={e => setTranslit(e.target.value)} rows={8}
            placeholder={"kitāb\nqalam\nmadrasah"} className={ta} />
          <p className="text-xs text-slate-400 mt-0.5">{translitLines.length} line{translitLines.length !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">{t('arabicLessonDetail.bulkEnglish')}</label>
          <textarea value={englishText} onChange={e => setEnglish(e.target.value)} rows={8}
            placeholder={"book\npen\nschool"} className={ta} />
          <p className="text-xs text-slate-400 mt-0.5">{englishLines.length} line{englishLines.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-gray-600 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors">{t('arabicLessonDetail.cancel')}</button>
        <button type="button" onClick={handleImport} disabled={saving || !arabicLines.length}
          className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">
          {saving ? t('arabicLessonDetail.importing') : t('arabicLessonDetail.importWords', { count: arabicLines.length })}
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// VIDEO TAB
// ═══════════════════════════════════════════════════════

const VideoTab: React.FC<{ lesson: ArabicLesson; isAdmin: boolean; onLessonUpdated: (l: ArabicLesson) => void }> = ({ lesson, isAdmin, onLessonUpdated }) => {
  const { t } = useI18n();
  const [urlInput, setUrlInput] = useState(lesson.videoUrl ?? '');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [err, setErr]           = useState('');

  const videoId = extractYoutubeId(lesson.videoUrl ?? '');

  const handleSave = async () => {
    setErr(''); setSaved(false);
    const trimmed = urlInput.trim();
    if (trimmed && !extractYoutubeId(trimmed)) { setErr(t('arabicLessonDetail.errInvalidYouTube')); return; }
    setSaving(true);
    const ok = await updateArabicLesson(lesson.id, { videoUrl: trimmed || undefined });
    setSaving(false);
    if (!ok) { setErr(t('arabicLessonDetail.errFailedToSave')); return; }
    onLessonUpdated({ ...lesson, videoUrl: trimmed || undefined });
    setSaved(true); setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('arabicLessonDetail.dialogueVideo')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {isAdmin ? t('arabicLessonDetail.videoDescAdmin') : t('arabicLessonDetail.videoDescStudent')}
        </p>
      </div>

      {isAdmin && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-3">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{t('arabicLessonDetail.youtubeUrl')}</label>
          <div className="flex gap-3">
            <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
              placeholder={t('arabicLessonDetail.youtubePlaceholder')}
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white" />
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors flex-shrink-0">
              {saving ? t('arabicLessonDetail.savingEllipsis') : t('arabicLessonDetail.save')}
            </button>
          </div>
          {err  && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">✅ {t('arabicLessonDetail.videoSaved')}</p>}
        </div>
      )}

      {videoId ? (
        /* Protected embed: sandbox blocks top-navigation and popups so the
           YouTube logo / title cannot redirect the user to YouTube.com */
        <div
          className="relative bg-black rounded-2xl overflow-hidden shadow-lg select-none"
          style={{ aspectRatio: '16/9' }}
          onContextMenu={e => e.preventDefault()}
        >
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&controls=0`}
            title="Dialogue video"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
            style={{ border: 'none' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-16 text-center">
          <div className="text-5xl mb-3">🎬</div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">No video yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin ? 'Paste a YouTube link above to add a dialogue video.' : 'The admin hasn\'t added a video for this lesson yet.'}
          </p>
        </div>
      )}
    </div>
  );
};

// ── Shared ─────────────────────────────────────────────────────────────────────

const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center py-24">
    <svg className="animate-spin w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  </div>
);

export default ArabicLessonDetailPage;
