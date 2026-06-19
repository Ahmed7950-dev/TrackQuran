// components/ArabicLessonDetailPage.tsx
// Full-screen lesson detail overlay — 4 tabs:
//   📖 Lesson PDF  · 📝 Homework  · 🔤 Vocabulary  · 🎬 Dialogue Video

import React, { useCallback, useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web';
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
  saveHomeworkSubmission, getHomeworkSubmission, getHomeworkSubmissions, updateHomeworkGrading,
  HomeworkSubmission,
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
import { createNotification } from '../services/notificationService';

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
  initialTab?: Tab;
}

const ArabicLessonDetailPage: React.FC<Props> = ({
  lesson: initialLesson, students, teacherId,
  preSelectedStudentId, onClose, onStudentUpdated, onHomeworkComplete,
  studentMode = false, initialTab,
}) => {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [lesson, setLesson] = useState(initialLesson);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? (initialLesson.pdfUrl ? 'lesson' : 'homework'));
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

  // ── Tab SVG icons ────────────────────────────────────────────────────────────
  const TAB_ICONS: Record<Tab, React.ReactNode> = {
    lesson: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <path clipRule="evenodd" d="m157.41 255.93 42.72-20.89c19.05-9.33 42.24-1.36 51.56 17.69 9.33 19.08 1.36 42.24-17.69 51.56l-76.59 37.45v42.58c0 12.95 10.6 23.53 23.53 23.53h270.96c12.93 0 23.5-10.57 23.5-23.53v-219.72h-317.99zm197.04 115.11h-136.52c-4.56 0-8.25-3.71-8.25-8.28 0-4.56 3.69-8.25 8.25-8.25h136.52c4.56 0 8.28 3.69 8.28 8.25-.01 4.57-3.72 8.28-8.28 8.28zm60.43-56.55h-149.95c-4.56 0-8.28-3.71-8.28-8.28 0-4.56 3.71-8.25 8.28-8.25h149.95c4.56 0 8.28 3.69 8.28 8.25 0 4.57-3.71 8.28-8.28 8.28zm-154.74-64.83c0-4.54 3.71-8.25 8.28-8.25h86.03c4.56 0 8.28 3.71 8.28 8.25 0 4.56-3.71 8.28-8.28 8.28h-86.03c-4.57 0-8.28-3.71-8.28-8.28zm-42.21-64.8h196.95c4.56 0 8.28 3.71 8.28 8.28 0 4.54-3.71 8.25-8.28 8.25h-196.95c-4.56 0-8.25-3.71-8.25-8.25 0-4.56 3.69-8.28 8.25-8.28zm-186.69 53.75c0-19.79 16.1-35.89 35.89-35.89 19.76 0 35.89 16.1 35.89 35.89 0 19.76-16.13 35.89-35.89 35.89-19.79 0-35.89-16.13-35.89-35.89zm195.51 50.85-89.94 43.99c-14.8 7.23-23.58 21.32-23.58 37.79v24.21c0 6.83-5.56 12.39-12.39 12.39h-88.45c-6.83 0-12.39-5.56-12.39-12.39v-43.28c0-30.64 25.06-55.7 55.67-55.7h46.71c6.72 0 12.47-1.33 18.48-4.28l86.51-42.29c10.89-5.33 24.15-.79 29.45 10.09 5.35 10.88.81 24.14-10.07 29.47zm285.25-163.33c0 12.08-9.86 21.94-21.94 21.94h-347.28c-12.08 0-21.97-9.86-21.97-21.94s9.89-21.97 21.97-21.97h347.27c12.08 0 21.95 9.9 21.95 21.97z" fillRule="evenodd" />
      </svg>
    ),
    homework: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <path d="m25.55 5.6h-8.633-1.607v3.93c0 2.178-1.771 3.95-3.949 3.95s-3.95-1.772-3.95-3.95v-.94c0-1.323 1.076-2.399 2.399-2.399.243 0 .479.036.7.104v-.695h-.953-.197v-1.38c0-.73.6-1.32 1.33-1.32s1.32.59 1.32 1.32v5.31c0 .36-.29.65-.65.65s-.65-.29-.65-.65v-.94c0-.5-.41-.9-.9-.9-.5 0-.9.4-.9.9v.94c0 1.35 1.1 2.45 2.45 2.45s2.45-1.1 2.45-2.45v-5.31c0-1.72-1.4-3.12-3.12-3.12-1.73 0-3.13 1.4-3.13 3.12v1.38h-1.11c-1.47 0-2.65 1.18-2.65 2.64v19.11c0 1.46 1.18 2.65 2.65 2.65h19.1c1.47 0 2.65-1.19 2.65-2.65v-19.11c0-1.46-1.18-2.64-2.65-2.64zm-9.5 20.036h-6.837c-.497 0-.9-.403-.9-.9s.403-.9.9-.9h6.837c.497 0 .9.403.9.9s-.403.9-.9.9zm6.737-4.196h-13.573c-.497 0-.9-.403-.9-.9s.403-.9.9-.9h13.573c.497 0 .9.403.9.9s-.403.9-.9.9zm0-4.196h-13.573c-.497 0-.9-.403-.9-.9s.403-.9.9-.9h13.573c.497 0 .9.403.9.9s-.403.9-.9.9z" />
      </svg>
    ),
    vocabulary: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <path d="m439.408 161.774h-21.449l.141 64.229 7.501-.028c.421-.001 10.367-.04 14.345-.109 15.546-.271 26.83-13.726 26.83-31.991 0-19.2-10.998-32.101-27.368-32.101zm.276 49.094c-1.553.027-4.115.05-6.635.067-.024-8.871-.063-34.161-.063-34.161h6.422c11.477 0 12.369 13.089 12.369 17.101-.001 8.353-3.739 16.847-12.093 16.993z" />
        <path d="m69.616 192.526 9.762 33.858 13.956-.097 12.575-63.18-14.711-2.928-6.248 31.388-8.568-29.714-13.505-.018-8.592 29.709-6.221-31.452-14.715 2.911 12.537 63.385 13.965-.098z" />
        <path d="m339.331 181.701c0-11.401-9.61-20.677-21.422-20.677h-20.989v65.701h15v-22.017l18.286 24.999 12.107-8.856-15.051-20.576c7.131-3.361 12.069-10.412 12.069-18.574zm-21.422-5.677c3.481 0 6.422 2.6 6.422 5.677s-2.941 5.676-6.422 5.676c-1.427 0-3.708.008-5.989.019v-11.372z" />
        <path d="m193.875 161.025c-18.114 0-32.85 14.736-32.85 32.85s14.736 32.85 32.85 32.85 32.85-14.736 32.85-32.85-14.736-32.85-32.85-32.85zm0 50.7c-9.843 0-17.85-8.007-17.85-17.85s8.007-17.85 17.85-17.85 17.85 8.007 17.85 17.85-8.007 17.85-17.85 17.85z" />
        <path d="m489.5 124.25h-94.25c-3.472 0-6.762.792-9.702 2.202 1.411-2.939 2.202-6.23 2.202-9.702v-94.25c0-12.407-10.093-22.5-22.5-22.5h-94.25c-12.407 0-22.5 10.093-22.5 22.5v94.25c0 3.472.792 6.763 2.202 9.702-2.939-1.411-6.23-2.202-9.702-2.202h-94.25c-5.758 0-11.016 2.177-15 5.747-3.984-3.571-9.241-5.747-15-5.747h-94.25c-12.407 0-22.5 10.093-22.5 22.5v22.5h15v-22.5c0-4.135 3.365-7.5 7.5-7.5h94.25c4.135 0 7.5 3.365 7.5 7.5v94.25c0 4.135-3.364 7.5-7.5 7.5h-94.25c-4.135 0-7.5-3.365-7.5-7.5v-56.75h-15v56.75c0 12.407 10.093 22.5 22.5 22.5h94.25c5.758 0 11.016-2.177 15-5.747 3.984 3.571 9.242 5.747 15 5.747h94.25c3.472 0 6.763-.792 9.702-2.202-1.411 2.939-2.202 6.23-2.202 9.702v94.25c0 5.758 2.177 11.016 5.747 15-3.571 3.984-5.747 9.241-5.747 15v94.25c0 12.407 10.093 22.5 22.5 22.5h24.625v-15h-24.625c-4.135 0-7.5-3.365-7.5-7.5v-94.25c0-4.135 3.365-7.5 7.5-7.5h94.25c4.135 0 7.5 3.364 7.5 7.5v94.25c0 4.135-3.365 7.5-7.5 7.5h-24.625v15h24.625c12.407 0 22.5-10.093 22.5-22.5v-94.25c0-5.758-2.177-11.016-5.747-15 3.571-3.984 5.747-9.242 5.747-15v-94.25c0-3.472-.792-6.763-2.202-9.702 2.939 1.411 6.23 2.202 9.702 2.202h94.25c12.407 0 22.5-10.093 22.5-22.5v-94.25c0-12.407-10.093-22.5-22.5-22.5zm-116.75 116.75c0 4.135-3.365 7.5-7.5 7.5h-94.25c-4.135 0-7.5-3.365-7.5-7.5v-94.25c0-4.135 3.365-7.5 7.5-7.5h94.25c4.135 0 7.5 3.365 7.5 7.5zm-109.25-218.5c0-4.135 3.365-7.5 7.5-7.5h94.25c4.135 0 7.5 3.365 7.5 7.5v94.25c0 4.135-3.365 7.5-7.5 7.5h-94.25c-4.135 0-7.5-3.364-7.5-7.5zm-22.5 226h-94.25c-4.135 0-7.5-3.365-7.5-7.5v-94.25c0-4.135 3.365-7.5 7.5-7.5h94.25c4.135 0 7.5 3.365 7.5 7.5v94.25c0 4.135-3.365 7.5-7.5 7.5zm30 124.25c-4.135 0-7.5-3.365-7.5-7.5v-94.25c0-4.135 3.365-7.5 7.5-7.5h94.25c4.135 0 7.5 3.365 7.5 7.5v94.25c0 4.135-3.365 7.5-7.5 7.5zm226-131.75c0 4.135-3.365 7.5-7.5 7.5h-94.25c-4.135 0-7.5-3.365-7.5-7.5v-94.25c0-4.135 3.364-7.5 7.5-7.5h94.25c4.135 0 7.5 3.365 7.5 7.5z" />
        <path d="m342.75 30h15v15h-15z" />
        <path d="m342.75 60h15v15h-15z" />
        <path d="m310.625 497h15v15h-15z" />
      </svg>
    ),
    video: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <path d="m8.91 512a8.06 8.06 0 0 1 -8-7.66c0-.51-2.5-51.41 1-107.24 4.85-76.46 18.31-125.58 40-146a8.06 8.06 0 0 1 11.09 11.72c-37.65 35.44-38.77 185.78-36 240.72a8.06 8.06 0 0 1 -7.68 8.46z" />
        <path d="m184.74 512a8.06 8.06 0 0 1 -8-7.62c-2.67-48.45-10.15-110.88-16.74-139.17-6.33-27.29-23.08-61.43-36-81.61a8.06 8.06 0 1 1 13.58-8.67c14.06 22 31.28 57.34 38.08 86.64 6.86 29.54 14.36 91.89 17.07 141.94a8.06 8.06 0 0 1 -7.61 8.48z" />
        <path d="m115.82 512h-.16a8.06 8.06 0 0 1 -7.9-8.21 980.77 980.77 0 0 0 -6.3-117.08 8.06 8.06 0 1 1 16-1.87 998.08 998.08 0 0 1 6.4 119.26 8.06 8.06 0 0 1 -8.04 7.9z" />
        <path d="m43 512a8.06 8.06 0 0 1 -8-7.61c0-.44-2.44-44.1-1.84-89.4 1.13-84.28 11.12-102.36 19.69-108.7 7.81-5.77 15.68-8 23.39-6.59 8.29 1.51 15.6 7.08 21.75 16.58a8.06 8.06 0 1 1 -13.55 8.72c-2.5-3.86-6.45-8.63-11.1-9.48-3.16-.58-6.84.67-10.93 3.69-2 1.48-12 13.06-13.16 95.88-.6 44.75 1.79 87.93 1.81 88.36a8.06 8.06 0 0 1 -7.59 8.5z" />
        <path d="m503.09 512h-.41a8.06 8.06 0 0 1 -7.65-8.45c2.74-54.94 1.61-205.28-36-240.72a8.06 8.06 0 1 1 11.05-11.73c21.68 20.43 35.13 69.55 40 146 3.55 55.84 1.08 106.73 1 107.24a8.06 8.06 0 0 1 -7.99 7.66z" />
        <path d="m327.26 512h-.36a8.06 8.06 0 0 1 -7.7-8.4c1.86-42.57 10.32-112.92 17.08-142 7.09-30.57 25.52-67.58 39.64-89a8.06 8.06 0 1 1 13.46 8.86c-13.78 20.94-31.05 56.46-37.4 83.83-6.46 27.85-14.88 98-16.67 139.09a8.06 8.06 0 0 1 -8.05 7.62z" />
        <path d="m396.18 512a8.06 8.06 0 0 1 -8.05-7.9 998.08 998.08 0 0 1 6.4-119.26 8.06 8.06 0 1 1 16 1.87 979.51 979.51 0 0 0 -6.3 117.08 8.06 8.06 0 0 1 -7.9 8.21z" />
        <path d="m469 512h-.46a8.06 8.06 0 0 1 -7.59-8.5c0-.43 2.41-43.61 1.81-88.36-1.11-82.83-11.16-94.4-13.16-95.88-7.5-5.54-12.94-5.12-18.78 1.45a8.06 8.06 0 0 1 -12.06-10.71c11.44-12.88 26.17-14.24 40.41-3.71 8.58 6.34 18.57 24.43 19.69 108.7.61 45.3-1.81 89-1.84 89.4a8.06 8.06 0 0 1 -8.02 7.61z" />
        <path d="m188.84 132.5a8.06 8.06 0 0 1 -8.06-8.06v-19.56c-21.78-10.51-35.09-28.39-35.09-47.62 0-15.87 8.64-30.58 24.33-41.42 14.79-10.22 34.3-15.84 54.98-15.84s40.15 5.62 54.93 15.84c15.69 10.84 24.33 25.55 24.33 41.42s-8.64 30.58-24.33 41.42c-14.78 10.21-34.29 15.84-54.93 15.84a111 111 0 0 1 -14.81-1l-15.48 16.48a8.06 8.06 0 0 1 -5.87 2.5zm36.16-116.38c-17.4 0-33.66 4.61-45.77 13-11.23 7.72-17.42 17.72-17.42 28.14 0 14 11.52 27.37 30.07 34.93a8.06 8.06 0 0 1 5 7.46v4.44l4.41-4.7a8 8 0 0 1 7.3-2.39 93.84 93.84 0 0 0 16.41 1.4c17.4 0 33.66-4.61 45.77-13 11.21-7.74 17.38-17.74 17.38-28.16s-6.17-20.42-17.38-28.16c-12.16-8.35-28.41-12.96-45.77-12.96z" />
        <path d="m274.8 229c-20.52 0-39.59-10.53-48.38-28.92-6.17-12.91-6.42-27.65-.7-41.5a61.93 61.93 0 0 1 73.37-35.09c14.38 4.24 25.7 13.68 31.87 26.59 7.44 15.56 6 34.19-3.49 49.67l7.78 16.25a8.06 8.06 0 0 1 -11.13 10.55l-14.81-8.09a63.76 63.76 0 0 1 -7.76 4.4 62 62 0 0 1 -26.75 6.14zm7.84-91.76a46 46 0 0 0 -19.84 4.6 44.43 44.43 0 0 0 -22.18 22.89c-4 9.58-3.84 19.66.34 28.4 8.77 18.33 32.82 25.15 53.63 15.19a47.26 47.26 0 0 0 9.08-5.67 8 8 0 0 1 6.74-1.57 8.06 8.06 0 0 1 1.33-6.79c8.56-11.58 10.31-25.5 4.69-37.25-4.18-8.73-12-15.16-21.89-18.09a42 42 0 0 0 -11.9-1.69z" />
        <path d="m102.19 257.83a8.06 8.06 0 0 1 -7.9-6.49c-1.82-9.19-1.19-17.23 1.88-23.9l.08-.18a8 8 0 0 1 7.63-4.75c15.5.53 25.81-.22 31.49-2.27a13.53 13.53 0 0 0 8.15-8.36c3.22-9.6 5-46.55-6.23-71.54a8.06 8.06 0 0 1 14.71-6.63c12.89 28.61 11.26 70 6.82 83.28a29.77 29.77 0 0 1 -17.95 18.39c-6.92 2.5-16.71 3.57-31.28 3.38a30.72 30.72 0 0 0 .53 9.45 8.06 8.06 0 0 1 -7.91 9.63z" />
        <path d="m54.4 246.23a8.15 8.15 0 0 1 -1.32-.11 8.06 8.06 0 0 1 -6.63-9.27c2.15-13-.72-19.46-.92-19.87a8.06 8.06 0 0 1 14.1-7.81c.61 1.08 5.89 11.1 2.72 30.3a8.06 8.06 0 0 1 -7.95 6.76zm-8.87-29.23.07.13z" />
        <path d="m53.48 221.6a8 8 0 0 1 -1.72-.19c-1.59-.35-39.06-9.18-43.07-65.27-1.46-20.5 2.78-36.26 12.61-46.82a40.13 40.13 0 0 1 23.2-12.18c7-7.18 28.58-24.35 66.11-12.68 16.35 5.09 30.05 12.81 40.72 23 6.38 6.07 9.29 17.2 6.77 25.89-1.82 6.27-6.25 10.54-12.16 11.72-3.19.64-6.43-.11-9.85-.89a33.71 33.71 0 0 0 -4.56-.85 8.06 8.06 0 0 1 -4.79-15.38c4.25-1.48 8.87-.42 13 .52.86.2 2 .47 2.88.62.75-2 .14-7.56-2.36-9.95-8.86-8.43-20.43-14.91-34.4-19.25-34.44-10.71-50.33 9-51 9.88a7.55 7.55 0 0 1 -6.4 3.17 23.44 23.44 0 0 0 -15.51 7.6c-6.53 7.17-9.28 18.78-8.15 34.49 2.71 37.92 23 48 28.93 50.19 11.24-3.06 16.53-9.11 18.86-13-2.9-4.58-5-11.51-3-20.35 1.61-7 5.62-10.44 8.7-12.13 7.59-4.15 16.29-1.24 17.26-.9l-5.44 15.16h.09c-1.31-.43-3.43-.6-4.2-.17a3 3 0 0 0 -.73 1.61c-1.45 6.27 1.48 8.93 1.51 9a8.06 8.06 0 0 1 3 8.44c-.23.9-5.95 22.06-34.5 28.51a8.06 8.06 0 0 1 -1.8.21z" />
        <path d="m131.37 287a8 8 0 0 1 -6.62-3.46l-16.15-23.23c-12.09-4-37.45-11.91-50.58-13.72a23.94 23.94 0 0 0 -2.5 10.65 8.06 8.06 0 0 1 -16.11-.5c.52-16.62 8.85-24 9.8-24.78a8.08 8.08 0 0 1 5.4-1.85c16.5.54 57.11 14.23 61.69 15.79a8.06 8.06 0 0 1 4 3l17.7 25.43a8.06 8.06 0 0 1 -6.63 12.67z" />
        <path d="m409.83 257.77a8.06 8.06 0 0 1 -7.92-9.62 30.6 30.6 0 0 0 .52-9.39c-14.58.19-24.36-.87-31.28-3.38a29.77 29.77 0 0 1 -17.95-18.38c-4.38-13-6.17-52.5 6-81.41a8.06 8.06 0 0 1 14.85 6.26c-10.51 25-8.65 60.85-5.57 70a13.53 13.53 0 0 0 8.15 8.36c5.68 2.06 16 2.8 31.49 2.27a8 8 0 0 1 7.63 4.75l.08.18c3.07 6.67 3.7 14.68 1.9 23.83a8.06 8.06 0 0 1 -7.9 6.53zm5.89-30.56v.07z" />
        <path d="m457.6 246.23a8.06 8.06 0 0 1 -7.94-6.74c-3.18-19.2 2.1-29.22 2.72-30.3a8.06 8.06 0 0 1 14.1 7.81c-.19.41-3.07 6.85-.92 19.87a8.06 8.06 0 0 1 -6.63 9.27 8.16 8.16 0 0 1 -1.33.09zm8.87-29.23-.07.13z" />
        <path d="m380.63 287a8.06 8.06 0 0 1 -6.63-12.67l17.66-25.41a8.06 8.06 0 0 1 4-3c4.58-1.56 45.19-15.25 61.69-15.79a8 8 0 0 1 5.4 1.85c.95.79 9.28 8.16 9.8 24.78a8.06 8.06 0 1 1 -16.11.5 23.93 23.93 0 0 0 -2.5-10.65c-13.14 1.82-38.5 9.7-50.58 13.72l-16.14 23.22a8.05 8.05 0 0 1 -6.59 3.45z" />
        <path d="m458.52 221.6a8.06 8.06 0 0 1 -1.78-.2c-28.55-6.45-34.27-27.61-34.5-28.51-.85-3.33 0-6.49 2.86-8.37.7-.68 2.93-3.35 1.62-9a8.06 8.06 0 1 1 15.7-3.62c2 8.85-.08 15.77-3 20.35 2.32 3.85 7.62 9.91 18.87 13 5.83-2.11 26.2-12.18 28.92-50.2 1.12-15.71-1.62-27.32-8.15-34.49a23.41 23.41 0 0 0 -15.6-7.6 7.79 7.79 0 0 1 -4.9-1.73c-4-3.11-16.1-11.67-24.57-13.83-19.65-5-45.51-4.44-59.14 12.11a60.25 60.25 0 0 1 -20.47 16.49 11.52 11.52 0 0 0 3.73 3.16c4.64 2.43 11.85 2 22.07-1.26 15.3-4.91 25.63-.11 29.84 5.5 8.15 10.86 4.38 30.53 3.54 34.36a8.06 8.06 0 0 1 -15.74-3.44c1.41-6.55 2-17.48-.62-21.15-.91-.82-4.68-2.3-12.09.08-9.27 3-22.94 6.24-34.48.19-7.17-3.76-12.24-10.42-15.08-19.79a8 8 0 0 1 .88-6.78 7.82 7.82 0 0 1 5.7-3.54c1-.17 10.51-2.19 20.3-14.07 15.4-18.76 44.35-25.46 75.57-17.53 11 2.81 23.67 11.63 28.59 15.27a40.17 40.17 0 0 1 24.1 12.31c9.83 10.56 14.08 26.32 12.61 46.82-4 56.09-41.47 64.92-43.07 65.27a8 8 0 0 1 -1.71.2z" />
      </svg>
    ),
    teacher_note: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <path d="m52.96191 41.9817c-2.29102-3.61084-10.32007-6.87897-16.37695-8.89844-.81506-.14886-1.59888.49969-2.39258.56824-2.22803.46509-4.12976.23157-6.11133-.54095-.23535-.09467-.49219-.09564-.72363-.00873-2.27393.75616-4.90845 1.74237-7.19141 2.73633-1.28564.45697-.54614 2.35156.71875 1.86816.9248-.39935 1.86694-.77051 2.80554-1.13879-.07117 2.21887.64685 4.44873 2.02747 6.18909.19336.24414.48438.37842.7832.37842 1.57812-.41895 3.07764-1.11768 4.49805-1.54004v3.44336c0 .55225.44727 1 1 1s1-.44775 1-1v-3.44269c1.41309.41986 2.91772 1.1203 4.49609 1.53949.29883-.00012.58984-.1344.7832-.37854 1.3844-1.74506 2.10229-3.98206 2.02673-6.20691 5.81946 2.26843 9.74231 4.57733 10.97229 6.50916 1.01074 1.57324 1.62109 5.5498 1.7207 11.19727.03223 1.84082-.89258 3.49072-2.30957 4.10986-9.55237 1.44464-19.90222-.51605-28.96484-3.79004-.10254-2.59961.84473-5.22656 2.50781-6.93457 6.41504.49951 12.56934 2.92578 17.82422 7.03369 1.0448.78802 2.25684-.74542 1.23242-1.57623-5.69434-4.44965-12.3916-7.03802-19.36816-7.48431-.83154-.00848-1.29749.89288-1.80786 1.43872-.61267-.73999-1.35327-1.37762-2.19446-1.89819l-3.96448-22.62793c-.1377-.7915-.57617-1.48193-1.2334-1.94385-2.11115-1.55188-5.18597.41144-4.6767 2.9776-.00006-.00006 3.54163 20.25598 3.54163 20.25598-.30804.06494-.57239.26459-.70477.55353-1.37598 2.98877-1.46387 6.34424-.26074 9.97266.12598.38135.46777.6499.86816.68213l6.29004.5c.11365.31055.32776.56989.63086.68799 4.55908 1.77692 9.34546 3.03784 14.20874 3.78979-6.49414.27466-16.13623-.65729-20.63843-1.44226-2.55151-.43787-3.24536-3.40283-2.93829-5.95306.21783-1.60651-2.09595-1.6947-1.99921-.06049-.47992 3.57239 1.12482 7.44446 4.62128 7.98871 9.41229 1.854 28.85956 2.06073 37.83575-.34082 2.13965-.935 3.5459-3.33539 3.5-5.97406-.10938-6.18799-.79492-10.30762-2.03613-12.23926zm-26.09473-1.05225c-1.05261-1.50696-1.2074-3.34497-1.21619-5.11255.4762-.17194.93323-.33368 1.3783-.48773-.17383 1.7428.7594 3.48511 2.42188 4.68036-.83203.28564-1.68848.58838-2.58398.91992zm5.2334-1.8706c-1.87207-.4245-3.23657-2.21375-3.07251-3.54376 1.88037.47272 3.85669.52594 5.93994.00073.14136 1.3656-1.04102 2.8194-2.86743 3.54303zm5.02832 1.8706c-.89453-.33105-1.75098-.6333-2.58398-.91992 1.66431-1.19592 2.5968-2.93945 2.42163-4.68323.46924.16217.92944.32483 1.37988.4881-.01233 1.76758-.16321 3.60791-1.21753 5.11505zm-25.11523-17.70947c-.22986-1.28186 1.74481-1.64948 1.96875-.34906 0-.00006 3.72778 21.27789 3.72778 21.27789-.68762-.21161-1.39185-.34521-2.10541-.39404l-3.59113-20.53479zm7.73559 30.29688-5.42603-.43164c-.76953-2.6748-.71875-5.14453.15137-7.35791 2.47498-.17456 5.13013 1.03876 6.48779 3.12457-.71191 1.41882-1.12378 3.01978-1.21313 4.66498z" />
        <path d="m57.99804 15.03834c0-3.30859-2.69141-6-6-6h-4.05957c-.55273 0-1 .44775-1 1s.44727 1 1 1h4.05957c2.20605 0 4 1.79443 4 4v25c0 .9707-.35938 1.91602-1.01172 2.66113-.36426.41504-.32227 1.04688.09277 1.41113 1.77795 1.22845 3.00122-2.81213 2.91895-4.0722z" />
        <path d="m8.26757 44.35817c.83008.02155 1.32819-1.04803.74799-1.66364-.65619-.73969-1.01752-1.68304-1.01752-2.65619v-25c0-2.20557 1.79395-4 4-4h4.0498c1.30786-.01355 1.31763-1.98199 0-2h-4.0498c-3.30859 0-6 2.69141-6 6v25c0 1.4624.54004 2.87744 1.52148 3.9834.19727.22266.47266.33643.74805.33643z" />
        <path d="m43.99804 3.03834c0-.55225-.44727-1-1-1h-13.03027c-1.88672 0-3.66895.75586-4.98242 2.09424-6.83545-1.1192-9.47729 9.2226-4.0658 12.89508l.42126 5.43842c.33264 5.38287 5.28784 9.66803 10.65723 9.57214 5.56934.00012 10.25-4.20544 10.65723-9.57117l.4248-5.44049c3.46851-2.24152 3.87573-8.36005.87964-11.23206.08997-.49567.0127-2.22937.03833-2.75616zm-20 3c.73975-.04218 1.53516.57153 2.0957-.1485.95898-1.1767 2.37012-1.8515 3.87402-1.8515h12.03027c.33374 3.14783-1.68237 5.96478-4.96973 6h-9.9707c-2.39429.74005-4.36133 2.74969-5.63281 4.81787-2.71008-2.68079-1.31714-8.8017 2.57324-8.81787zm17.19336 9.48975-.53027 6.78467c-1.11987 10.20117-16.17529 10.30511-17.32617-.00153 0 .00006-.46045-5.91656-.46045-5.91656.92737-1.8526 2.50159-3.41913 4.40967-4.35632h9.74414c1.20874 0 2.34595-.31024 3.33801-.85394.65063 1.3454.94666 2.84644.82507 4.34369zm1.96985-1.46411c-.10925-1.43433-.51013-2.82117-1.18384-4.09503.52039-.52551.95239-1.13599 1.28577-1.80432 1.00696 1.69293.9624 4.2533-.10193 5.89935z" />
      </svg>
    ),
    grammar: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <path d="m46.6282 43.82031a.99974.99974 0 0 0 -1 1v8.38969a4.7953 4.7953 0 0 1 -4.79 4.79h-27a4.79531 4.79531 0 0 1 -4.79-4.79v-42.42a4.79562 4.79562 0 0 1 4.79-4.79h20.21432v5.57129a6.00657 6.00657 0 0 0 6 6h5.57568v7.02881a1.00011 1.00011 0 0 0 2-.00006v-8.03022a1.00126 1.00126 0 0 0 -.293-.70752l-11.56729-11.55706a1.06191 1.06191 0 0 0 -.71978-.30524h-21.21a6.7976 6.7976 0 0 0 -6.79 6.79v42.42a6.7976 6.7976 0 0 0 6.79 6.79h27a6.79759 6.79759 0 0 0 6.79-6.79v-8.38969a.99974.99974 0 0 0 -.99993-1zm-10.57568-36.40313 8.16132 8.15411h-4.16132a4.00458 4.00458 0 0 1 -4-4z" />
        <path d="m43.33817 24a1.00005 1.00005 0 0 0 -1-1h-19.64893a1 1 0 1 0 0 2h19.64893a1.00005 1.00005 0 0 0 1-1z" />
        <path d="m40.2283 32a1 1 0 0 0 -1-1h-16.54a1 1 0 0 0 0 2h16.54a1 1 0 0 0 1-1z" />
        <path d="m22.68826 39a1.00019 1.00019 0 0 0 .00006 2h8.54a1.00019 1.00019 0 0 0 -.00006-2z" />
        <path d="m49.85422 25.61145c-.303.32819-19.44489 19.4256-20.40033 20.39935a1.00353 1.00353 0 0 0 -.21979.33124l-3.41742 7.864a1.0067 1.0067 0 0 0 1.31549 1.31537l7.86353-3.41784a1.00664 1.00664 0 0 0 .33123-.21979l18.3819-18.3819c1.24646-1.2901 3.40131-2.91119 3.23383-4.95209a4.1743 4.1743 0 0 0 -7.08844-2.93834zm-21.19232 27.06433 1.83075-4.21222 2.38135 2.38135zm5.95776-2.91333-3.04443-3.04445 16.97064-16.9702 3.04425 3.04462zm19.69311-19.69263-1.30834 1.30835-3.04443-3.04443 1.30835-1.30835a2.15307 2.15307 0 0 1 3.04442 3.04443z" />
        <path d="m14.33817 25a.99811.99811 0 0 0 .604-.20312l4-3.03174a1.00012 1.00012 0 0 0 -1.20807-1.59375l-3.53119 2.67627-1.39791-.61621a1.00018 1.00018 0 0 0 -.80664 1.83007 15.36812 15.36812 0 0 0 2.33981.93848z" />
        <path d="m11.99832 32.06152a15.36812 15.36812 0 0 0 2.33985.93848.99811.99811 0 0 0 .604-.20312l4-3.03174a1.00013 1.00013 0 0 0 -1.20807-1.59375l-3.53119 2.67627-1.39791-.61621a1.00018 1.00018 0 0 0 -.80668 1.83007z" />
        <path d="m11.99832 40.06152a15.3665 15.3665 0 0 0 2.33985.93848 1.00127 1.00127 0 0 0 .604-.20312l4-3.03223a1.00013 1.00013 0 0 0 -1.20807-1.59375l-3.53119 2.67676-1.39791-.61621a1.00018 1.00018 0 0 0 -.80668 1.83007z" />
      </svg>
    ),
  };

  // Tabs — Teacher's Note hidden in student mode; grammar always shown
  const tabs: { id: Tab; icon: React.ReactNode; label: string; popup?: boolean }[] = [
    { id: 'lesson',       icon: TAB_ICONS.lesson,       label: t('arabicLessonDetail.tabLesson')      },
    { id: 'homework',     icon: TAB_ICONS.homework,     label: t('arabicLessonDetail.tabHomework')    },
    { id: 'vocabulary',   icon: TAB_ICONS.vocabulary,   label: t('arabicLessonDetail.tabVocabulary')  },
    { id: 'video',        icon: TAB_ICONS.video,        label: t('arabicLessonDetail.tabVideo')       },
    ...(!studentMode ? [{ id: 'teacher_note' as Tab, icon: TAB_ICONS.teacher_note, label: t('arabicLessonDetail.tabTeacherNote'), popup: true }] : []),
    { id: 'grammar',      icon: TAB_ICONS.grammar,      label: t('arabicLessonDetail.tabGrammar')     },
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
              lessonTitle={lesson.title}
              isAdmin={isAdmin}
              studentMode={studentMode}
              studentId={preSelectedStudentId}
              studentName={students.find(s => s.id === preSelectedStudentId)?.name}
              teacherId={teacherId}
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

const HomeworkTab: React.FC<{
  lessonId: string;
  lessonTitle: string;
  isAdmin: boolean;
  studentMode: boolean;
  studentId?: string;
  studentName?: string;
  teacherId: string;
  onHomeworkComplete?: (lessonId: string) => void;
}> = ({ lessonId, lessonTitle, isAdmin, studentMode, studentId, studentName, teacherId, onHomeworkComplete }) => {
  const { t } = useI18n();
  const [items, setItems]     = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  // admin
  const [addingQ, setAddingQ]   = useState(false);
  const [editingQ, setEditingQ] = useState<HomeworkItem | null>(null);
  const fileRef  = useRef<HTMLInputElement>(null);
  const dragIdx  = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  // student
  const [hwMode, setHwMode]       = useState<'preview' | 'answering' | 'submitted'>('preview');
  const [answers, setAnswers]     = useState<Record<string, string>>({});
  const [subAnswers, setSubAnswers] = useState<Record<string, Record<number, string>>>({});
  const [results, setResults]     = useState<Record<string, 'correct' | 'wrong' | 'manual'>>({});
  const [hwScore, setHwScore]     = useState({ correct: 0, total: 0 });
  // tutor review
  const [submission, setSubmission]   = useState<HomeworkSubmission | null>(null);
  const [grading, setGrading]         = useState<Record<string, { correct: boolean; note?: string }>>({});
  const [noteInputs, setNoteInputs]   = useState<Record<string, string>>({});
  const [gradeSaving, setGradeSaving] = useState(false);
  // student past attempts
  const [pastAttempts, setPastAttempts]     = useState<HomeworkSubmission[]>([]);
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const its = await getHomeworkItems(lessonId);
    setItems(its);
    setLoading(false);
  }, [lessonId]);

  useEffect(() => { reload(); }, [reload]);

  // Load latest submission + initialise grading/notes when tutor is reviewing
  useEffect(() => {
    if (isAdmin || studentMode || !studentId) return;
    getHomeworkSubmission(lessonId, studentId).then(sub => {
      if (sub) {
        setSubmission(sub);
        setGrading(sub.grading ?? {});
        // Pre-fill note inputs from saved grading
        const notes: Record<string, string> = {};
        Object.entries(sub.grading ?? {}).forEach(([id, g]) => {
          if (g.note) notes[id] = g.note;
        });
        setNoteInputs(notes);
      }
    });
  }, [isAdmin, studentMode, studentId, lessonId]);

  // Load all past attempts for the student
  useEffect(() => {
    if (!studentMode || !studentId) return;
    getHomeworkSubmissions(lessonId, studentId).then(setPastAttempts);
  }, [studentMode, studentId, lessonId]);

  const practiceItems = items.filter(i => i.itemType === 'question');

  const submitHomework = () => {
    const res: Record<string, 'correct' | 'wrong' | 'manual'> = {};
    const autoGrading: Record<string, { correct: boolean }> = {};
    let correct = 0;
    let autoTotal = 0;
    for (const q of practiceItems) {
      const qtype = q.questionType;
      if (qtype === 'short_answer' || qtype === 'multi_answer') {
        res[q.id] = 'manual';
      } else if (qtype === 'matching') {
        try {
          const pairs: [string, string][] = JSON.parse(q.correctAnswer ?? '[]');
          const all = pairs.every((pair, i) => answersMatch(pair[1], subAnswers[q.id]?.[i] ?? ''));
          res[q.id] = all ? 'correct' : 'wrong';
          autoGrading[q.id] = { correct: all };
          if (all) correct++;
          autoTotal++;
        } catch { res[q.id] = 'manual'; }
      } else if (qtype === 'fill_blank') {
        const blanksCount = (q.content ?? '').split('___').length - 1;
        const fbAnswers = q.options?.length ? q.options : [q.correctAnswer ?? ''];
        const all = Array.from({ length: blanksCount }, (_, i) => i)
          .every(i => answersMatch(fbAnswers[i] ?? '', subAnswers[q.id]?.[i] ?? ''));
        res[q.id] = all ? 'correct' : 'wrong';
        autoGrading[q.id] = { correct: all };
        if (all) correct++;
        autoTotal++;
      } else if (qtype === 'multiple_choice' || qtype === 'fill_blank_options' || qtype === 'true_false') {
        const ok = answers[q.id] === q.correctAnswer;
        res[q.id] = ok ? 'correct' : 'wrong';
        autoGrading[q.id] = { correct: ok };
        if (ok) correct++;
        autoTotal++;
      } else {
        const ok = answersMatch(q.correctAnswer ?? '', answers[q.id] ?? '');
        res[q.id] = ok ? 'correct' : 'wrong';
        autoGrading[q.id] = { correct: ok };
        if (ok) correct++;
        autoTotal++;
      }
    }
    setResults(res);
    // total = auto-graded count only; manual questions are not included in the immediate score
    setHwScore({ correct, total: autoTotal });
    setHwMode('submitted');
    if (studentId) {
      markHomeworkComplete(studentId, lessonId).catch(console.error);
      onHomeworkComplete?.(lessonId);
      // Save answers + auto-grading to Supabase so tutor can review, then refresh attempts list
      saveHomeworkSubmission(lessonId, studentId, teacherId, answers, subAnswers, autoGrading)
        .then(() => getHomeworkSubmissions(lessonId, studentId).then(setPastAttempts))
        .catch(console.error);
      // Notify the tutor
      createNotification({
        teacherId,
        studentId,
        recipient: 'tutor',
        bookingId: null,
        type: 'homework_submitted',
        title: `${studentName ?? 'Student'} submitted homework`,
        body: lessonTitle,
        metadata: { lessonId },
      }).catch(console.error);
    }
  };

  const saveGrading = async (newGrading: Record<string, { correct: boolean; note?: string }>) => {
    if (!submission) return;
    setGradeSaving(true);
    await updateHomeworkGrading(submission.id, newGrading);
    setGradeSaving(false);
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

  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';

  // ── Student view ──────────────────────────────────────────────────────────
  if (studentMode) {
    const submitted = hwMode === 'submitted';

    // Render answer input for a question item
    const renderInput = (q: HomeworkItem) => {
      const qtype = q.questionType;
      const sid = q.id;
      const res = results[sid];
      const done = submitted;

      const borderFor = (opt: string) => {
        if (!done || answers[sid] !== opt) return answers[sid] === opt ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-slate-200 dark:border-gray-600 hover:border-amber-300';
        return res === 'correct' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300';
      };

      if (qtype === 'multiple_choice' || qtype === 'fill_blank_options') {
        return (
          <div className="space-y-2 mt-3">
            {(q.options ?? []).map((opt, i) => (
              <button key={i} type="button" disabled={done} onClick={() => setAnswers(p => ({ ...p, [sid]: opt }))}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-colors ${borderFor(opt)} text-slate-700 dark:text-slate-200`}>
                {String.fromCharCode(65 + i)}. {opt}
                {done && res === 'correct' && answers[sid] === opt && <span className="ml-2">✅</span>}
                {done && res === 'wrong' && answers[sid] === opt && <span className="ml-2">❌</span>}
                {done && q.correctAnswer === opt && answers[sid] !== opt && <span className="ml-2 text-emerald-600 font-semibold text-xs">(correct)</span>}
              </button>
            ))}
          </div>
        );
      }

      if (qtype === 'true_false') {
        return (
          <div className="flex gap-3 mt-3">
            {['True', 'False'].map(opt => (
              <button key={opt} type="button" disabled={done} onClick={() => setAnswers(p => ({ ...p, [sid]: opt }))}
                className={`flex-1 py-3 rounded-xl border-2 font-semibold text-sm transition-colors ${borderFor(opt)} text-slate-700 dark:text-slate-200`}>
                {opt}
                {done && answers[sid] === opt && (res === 'correct' ? ' ✅' : ' ❌')}
                {done && q.correctAnswer === opt && answers[sid] !== opt && <span className="ml-1 text-emerald-600 text-xs">(correct)</span>}
              </button>
            ))}
          </div>
        );
      }

      if (qtype === 'fill_blank') {
        const parts = (q.content ?? '').split('___');
        const fbAnswers = q.options?.length ? q.options : [q.correctAnswer ?? ''];
        return (
          <div className="flex flex-wrap items-center gap-2 text-base leading-loose mt-3">
            {parts.map((part, i) => (
              <React.Fragment key={i}>
                {part && <span className="text-slate-800 dark:text-slate-100">{part}</span>}
                {i < parts.length - 1 && (
                  <span className="inline-flex flex-col items-center gap-0.5">
                    <input type="text" disabled={done}
                      value={subAnswers[sid]?.[i] ?? ''}
                      onChange={e => setSubAnswers(p => ({ ...p, [sid]: { ...(p[sid] ?? {}), [i]: e.target.value } }))}
                      className={`w-32 px-2 py-0.5 border-b-2 text-center text-sm focus:outline-none bg-transparent dark:text-white transition-colors ${
                        done
                          ? (results[sid] === 'correct' ? 'border-emerald-500 text-emerald-700' : 'border-red-400 text-red-600')
                          : 'border-amber-500 focus:border-amber-600'
                      }`}
                    />
                    {done && results[sid] === 'wrong' && fbAnswers[i] && (
                      <span className="text-[10px] text-emerald-600 font-semibold">{fbAnswers[i]}</span>
                    )}
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
        );
      }

      if (qtype === 'matching') {
        let pairs: [string, string][] = [];
        try { pairs = JSON.parse(q.correctAnswer ?? '[]'); } catch { /* */ }
        const rightOpts = pairs.map(p => p[1]);
        return (
          <div className="space-y-2 mt-3">
            {pairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-gray-700 px-3 py-2 rounded-lg">{pair[0]}</span>
                <span className="text-slate-400 text-sm flex-shrink-0">→</span>
                <select disabled={done}
                  value={subAnswers[sid]?.[i] ?? ''}
                  onChange={e => setSubAnswers(p => ({ ...p, [sid]: { ...(p[sid] ?? {}), [i]: e.target.value } }))}
                  className={`flex-1 px-2 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    done
                      ? answersMatch(pair[1], subAnswers[sid]?.[i] ?? '') ? 'border-emerald-500' : 'border-red-400'
                      : 'border-slate-300 dark:border-gray-600'
                  }`}>
                  <option value="">Choose…</option>
                  {rightOpts.map((opt, j) => <option key={j} value={opt}>{opt}</option>)}
                </select>
                {done && (
                  answersMatch(pair[1], subAnswers[sid]?.[i] ?? '') ? <span className="text-emerald-600 flex-shrink-0">✅</span>
                  : <span className="flex-shrink-0 flex flex-col items-start"><span className="text-red-500">❌</span><span className="text-[10px] text-emerald-600 font-semibold">{pair[1]}</span></span>
                )}
              </div>
            ))}
          </div>
        );
      }

      if (qtype === 'short_answer') {
        return (
          <textarea disabled={done} rows={3}
            value={answers[sid] ?? ''}
            onChange={e => setAnswers(p => ({ ...p, [sid]: e.target.value }))}
            placeholder="Write your answer here…"
            dir="auto"
            className={`mt-3 ${inp} resize-none ${done ? 'opacity-70' : ''}`}
          />
        );
      }

      if (qtype === 'multi_answer') {
        const words = q.options ?? [];
        return (
          <div className="space-y-2 mt-3">
            {words.map((word, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-32 flex-shrink-0 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-gray-700 px-3 py-2 rounded-lg">{word}</span>
                <input type="text" disabled={done}
                  value={subAnswers[sid]?.[i] ?? ''}
                  onChange={e => setSubAnswers(p => ({ ...p, [sid]: { ...(p[sid] ?? {}), [i]: e.target.value } }))}
                  placeholder="Your answer…"
                  dir="auto"
                  className={`flex-1 px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 ${done ? 'opacity-70' : ''}`}
                />
              </div>
            ))}
            {done && <p className="text-xs text-slate-400 italic">Tutor will review your answers.</p>}
          </div>
        );
      }

      // translate types
      return (
        <input type="text" disabled={done}
          value={answers[sid] ?? ''}
          onChange={e => setAnswers(p => ({ ...p, [sid]: e.target.value }))}
          dir={qtype === 'translate_to_arabic' ? 'rtl' : 'ltr'}
          placeholder="Type your answer…"
          className={`mt-3 ${inp} ${done ? 'opacity-70' : ''}`}
        />
      );
    };

    // Render a single item (context or question) for student
    const renderStudentItem = (item: HomeworkItem, qNum: number) => {
      const submitted = hwMode === 'submitted';
      const res = results[item.id];
      return (
        <div key={item.id} className={`bg-white dark:bg-gray-800 border rounded-2xl p-5 space-y-1 ${
          submitted && item.itemType === 'question'
            ? res === 'correct' ? 'border-emerald-300 dark:border-emerald-700'
            : res === 'wrong' ? 'border-red-300 dark:border-red-700'
            : 'border-slate-200 dark:border-gray-700'
            : 'border-slate-200 dark:border-gray-700'
        }`}>
          {item.itemType === 'divider' && <hr className="border-slate-200 dark:border-gray-700" />}
          {item.itemType === 'image' && item.imageUrl && (
            <img src={item.imageUrl} alt="" className="max-h-60 rounded-xl" />
          )}
          {(['section', 'headline', 'instruction', 'paragraph'] as ArabicExamItemType[]).includes(item.itemType) && (
            <p className={`${item.itemType === 'headline' ? 'text-lg font-bold text-slate-800 dark:text-slate-100' : item.itemType === 'section' ? 'text-base font-bold text-amber-700 dark:text-amber-300' : item.itemType === 'instruction' ? 'text-sm text-sky-700 dark:text-sky-300 italic' : 'text-sm text-slate-700 dark:text-slate-300'}`} dir="auto">
              {item.content}
            </p>
          )}
          {item.itemType === 'question' && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Q{qNum} · {QUESTION_TYPE_LABELS[item.questionType ?? 'short_answer']}
                </span>
                {submitted && (
                  res === 'correct' ? <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">Correct ✅</span>
                  : res === 'wrong' ? <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">Incorrect ❌</span>
                  : <span className="text-xs font-bold text-sky-600 bg-sky-50 dark:bg-sky-900/30 px-2 py-0.5 rounded-full">Tutor review 📋</span>
                )}
              </div>
              {item.questionType !== 'fill_blank' && (
                <p className="text-base font-medium text-slate-800 dark:text-slate-100" dir={item.questionType === 'translate_to_english' ? 'rtl' : 'auto'}>
                  {item.content}
                </p>
              )}
              {renderInput(item)}
            </>
          )}
        </div>
      );
    };

    // ── Preview mode (blurred) ────────────────────────────────────────────────
    if (hwMode === 'preview') {
      return (
        <div className="max-w-3xl mx-auto p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('arabicLessonDetail.homeworkTitle')}</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              {practiceItems.length} question{practiceItems.length !== 1 ? 's' : ''}
            </p>
          </div>

          {items.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-12 text-center">
              <div className="text-5xl mb-3">📝</div>
              <p className="font-semibold text-slate-700 dark:text-slate-200">{t('arabicLessonDetail.noQuestionsStudent')}</p>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden">
              {/* Blur overlay */}
              <div className="absolute inset-0 backdrop-blur-sm bg-white/70 dark:bg-gray-900/70 z-10 flex flex-col items-center justify-center gap-4 rounded-2xl">
                <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">
                  {practiceItems.length} question{practiceItems.length !== 1 ? 's' : ''} ready
                  {pastAttempts.length > 0 && ` · Attempt ${pastAttempts.length + 1}`}
                </p>
                <button onClick={() => setHwMode('answering')}
                  className="px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold text-lg rounded-xl shadow-lg transition-colors">
                  📝 Do Homework
                </button>
              </div>
              {/* Blurred question list */}
              <div className="pointer-events-none select-none space-y-3 p-1">
                {practiceItems.map((q, i) => (
                  <div key={q.id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-5">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Q{i + 1} · {QUESTION_TYPE_LABELS[q.questionType ?? 'short_answer']}</span>
                    <p className="mt-1 text-base text-slate-700 dark:text-slate-200 line-clamp-2" dir="auto">{q.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Previous attempts shown in preview mode */}
          {pastAttempts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Previous Attempts ({pastAttempts.length})
              </h3>
              {pastAttempts.map(attempt => {
                const isExpanded = expandedAttempt === attempt.id;
                const gradingEntries = Object.entries(attempt.grading ?? {}) as [string, { correct: boolean; note?: string }][];
                const gradedCount   = gradingEntries.filter(([, g]) => g.correct !== undefined).length;
                const correctCount  = gradingEntries.filter(([, g]) => g.correct).length;
                const hasNotes      = gradingEntries.some(([, g]) => g.note);
                const allGradedPrev = practiceItems.length > 0 && gradedCount >= practiceItems.length;
                const pendingPrev   = practiceItems.filter(q =>
                  (q.questionType === 'short_answer' || q.questionType === 'multi_answer') &&
                  attempt.grading?.[q.id] === undefined
                ).length;

                return (
                  <div key={attempt.id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                      onClick={() => setExpandedAttempt(isExpanded ? null : attempt.id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Attempt {attempt.attemptNumber}</span>
                        <span className="text-xs text-slate-400">
                          {new Date(attempt.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {hasNotes && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">💬 Tutor feedback</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {allGradedPrev
                          ? <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">{correctCount}/{gradedCount} ✅</span>
                          : pendingPrev > 0
                            ? <span className="text-xs text-sky-600 dark:text-sky-400">⏳ {pendingPrev} pending tutor review</span>
                            : gradedCount > 0
                              ? <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">{correctCount}/{gradedCount} ✅</span>
                              : <span className="text-xs text-slate-400">Awaiting marking</span>
                        }
                        <span className="text-slate-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-gray-700 divide-y divide-slate-100 dark:divide-gray-700">
                        {practiceItems.map((q, qi) => {
                          const g   = attempt.grading?.[q.id];
                          const ans = attempt.answers?.[q.id];
                          const sub = attempt.subAnswers?.[q.id];
                          let ansDisplay: React.ReactNode = <span dir="auto">{ans || '—'}</span>;
                          if (q.questionType === 'fill_blank' && sub) {
                            const parts = (q.content ?? '').split('___');
                            ansDisplay = <span dir="auto">{parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <span className="font-bold mx-0.5 text-amber-600">[{sub[i] ?? '—'}]</span>}</span>)}</span>;
                          } else if ((q.questionType === 'matching' || q.questionType === 'multi_answer') && sub) {
                            const labels = q.questionType === 'matching'
                              ? (() => { try { return (JSON.parse(q.correctAnswer ?? '[]') as [string,string][]).map(p => p[0]); } catch { return []; } })()
                              : (q.options ?? []);
                            ansDisplay = <span className="flex flex-col gap-0.5">{labels.map((label, i) => <span key={i} dir="auto">{label}: {sub[i] ?? '—'}</span>)}</span>;
                          }
                          return (
                            <div key={q.id} className="px-5 py-3 space-y-1.5">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1" dir="auto">
                                  <span className="text-slate-400 text-xs font-bold mr-2">Q{qi + 1}</span>{q.content}
                                </p>
                                {g !== undefined
                                  ? (g.correct ? <span className="text-xs font-bold text-emerald-600 flex-shrink-0">✅</span> : <span className="text-xs font-bold text-red-500 flex-shrink-0">❌</span>)
                                  : <span className="text-xs text-slate-400 flex-shrink-0">⏳</span>}
                              </div>
                              <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-0.5">Your answer</span>
                                {ansDisplay}
                              </div>
                              {g?.note && (
                                <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                                  <span className="flex-shrink-0">💬</span>
                                  <span dir="auto">{g.note}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // ── Answering / Submitted mode ────────────────────────────────────────────
    let qNum = 0;
    const manualCount = practiceItems.filter(q => q.questionType === 'short_answer' || q.questionType === 'multi_answer').length;
    const pct = submitted && hwScore.total > 0 ? Math.round((hwScore.correct / hwScore.total) * 100) : 0;

    // Helper: render a single past attempt expandable card
    const renderAttemptCard = (attempt: HomeworkSubmission) => {
      const isExpanded = expandedAttempt === attempt.id;
      const gradingEntries = Object.entries(attempt.grading ?? {});
      const gradedCount   = gradingEntries.filter(([, g]) => g.correct !== undefined).length;
      const correctCount  = gradingEntries.filter(([, g]) => g.correct).length;
      const hasTutorNotes = gradingEntries.some(([, g]) => g.note);
      // "Full score" is only shown when every question has a grading entry (auto + tutor-marked)
      const allGraded     = practiceItems.length > 0 && gradedCount >= practiceItems.length;
      // Pending = manual questions not yet marked by tutor
      const pendingCount  = practiceItems.filter(q =>
        (q.questionType === 'short_answer' || q.questionType === 'multi_answer') &&
        attempt.grading?.[q.id] === undefined
      ).length;

      return (
        <div key={attempt.id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          {/* Attempt header — always visible */}
          <button
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-colors text-left"
            onClick={() => setExpandedAttempt(isExpanded ? null : attempt.id)}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                Attempt {attempt.attemptNumber}
              </span>
              <span className="text-xs text-slate-400">
                {new Date(attempt.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              {hasTutorNotes && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                  💬 Tutor feedback
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {allGraded ? (
                <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
                  {correctCount}/{gradedCount} ✅
                </span>
              ) : pendingCount > 0 ? (
                <span className="text-xs text-sky-600 dark:text-sky-400">⏳ {pendingCount} pending tutor review</span>
              ) : gradedCount > 0 ? (
                <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
                  {correctCount}/{gradedCount} ✅
                </span>
              ) : (
                <span className="text-xs text-slate-400">Awaiting tutor marking</span>
              )}
              <span className="text-slate-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
            </div>
          </button>

          {/* Expanded: per-question results */}
          {isExpanded && (
            <div className="border-t border-slate-100 dark:border-gray-700 divide-y divide-slate-100 dark:divide-gray-700">
              {practiceItems.map((q, qi) => {
                const qtype = q.questionType;
                const g = attempt.grading?.[q.id];
                const ans = attempt.answers?.[q.id];
                const sub = attempt.subAnswers?.[q.id];

                // Determine display answer text
                let answerDisplay: React.ReactNode = null;
                if (qtype === 'fill_blank' && sub) {
                  const parts = (q.content ?? '').split('___');
                  answerDisplay = (
                    <span dir="auto">
                      {parts.map((part, i) => (
                        <span key={i}>{part}{i < parts.length - 1 && <span className="font-bold mx-0.5 text-amber-600">[{sub[i] ?? '—'}]</span>}</span>
                      ))}
                    </span>
                  );
                } else if (qtype === 'matching' && sub) {
                  let pairs: [string, string][] = [];
                  try { pairs = JSON.parse(q.correctAnswer ?? '[]'); } catch { /* */ }
                  answerDisplay = (
                    <span className="flex flex-col gap-0.5">
                      {pairs.map((pair, i) => <span key={i} dir="auto">{pair[0]} → {sub[i] ?? '—'}</span>)}
                    </span>
                  );
                } else if (qtype === 'multi_answer' && sub) {
                  answerDisplay = (
                    <span className="flex flex-col gap-0.5">
                      {(q.options ?? []).map((word, i) => <span key={i} dir="auto">{word}: {sub[i] ?? '—'}</span>)}
                    </span>
                  );
                } else {
                  answerDisplay = <span dir="auto">{ans || '—'}</span>;
                }

                return (
                  <div key={q.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1" dir="auto">
                        <span className="text-slate-400 text-xs font-bold mr-2">Q{qi + 1}</span>
                        {q.content}
                      </p>
                      {g !== undefined ? (
                        g.correct
                          ? <span className="text-xs font-bold text-emerald-600 flex-shrink-0">✅ Correct</span>
                          : <span className="text-xs font-bold text-red-500 flex-shrink-0">❌ Incorrect</span>
                      ) : (
                        <span className="text-xs text-slate-400 flex-shrink-0">⏳ Pending</span>
                      )}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1">Your answer</span>
                      {answerDisplay}
                    </div>
                    {g?.note && (
                      <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                        <span className="flex-shrink-0">💬</span>
                        <span dir="auto">{g.note}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="max-w-3xl mx-auto p-8 space-y-5">
        {/* Submitted summary */}
        {submitted && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-6 text-center space-y-3">
            <div className="text-5xl">{hwScore.total === 0 ? '📋' : pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Homework submitted!</h2>
            {hwScore.total > 0 && (
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {hwScore.correct} / {hwScore.total} auto-graded correct
              </p>
            )}
            {manualCount > 0 && (
              <p className="text-sky-600 dark:text-sky-400 text-sm font-medium">
                ⏳ {manualCount} question{manualCount !== 1 ? 's' : ''} sent to your tutor for review
              </p>
            )}
            <button onClick={() => { setHwMode('preview'); setAnswers({}); setSubAnswers({}); setResults({}); }}
              className="mt-1 px-6 py-2 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-300 font-semibold rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
              ↩ Redo homework
            </button>
          </div>
        )}

        {/* All items */}
        {items.map(item => {
          if (item.itemType === 'question') qNum++;
          return renderStudentItem(item, qNum);
        })}

        {/* Submit button */}
        {!submitted && (
          <button onClick={submitHomework}
            className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors text-base shadow">
            Submit Homework
          </button>
        )}

        {/* Past attempts */}
        {submitted && pastAttempts.length > 0 && (
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Previous Attempts ({pastAttempts.length})
            </h3>
            {pastAttempts.map(renderAttemptCard)}
          </div>
        )}
      </div>
    );
  }

  // ── Tutor review view (teacher role, viewing a specific student) ─────────
  if (!isAdmin && !studentMode && studentId) {
    const manualTypes: HomeworkQuestionType[] = ['short_answer', 'multi_answer'];
    let reviewQNum = 0;
    const totalMarked = Object.keys(grading).length;
    const totalCorrect = (Object.values(grading) as { correct: boolean; note?: string }[]).filter(g => g.correct).length;

    const renderStudentAnswer = (item: HomeworkItem) => {
      const qtype = item.questionType;
      const ans = submission?.answers?.[item.id];
      const sub = submission?.subAnswers?.[item.id];

      if (qtype === 'matching') {
        let pairs: [string, string][] = [];
        try { pairs = JSON.parse(item.correctAnswer ?? '[]'); } catch { /* */ }
        return (
          <div className="space-y-1.5">
            {pairs.map((pair, i) => {
              const studentVal = sub?.[i] ?? '';
              const correct = answersMatch(pair[1], studentVal);
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-32 flex-shrink-0 font-medium text-slate-700 dark:text-slate-200">{pair[0]}</span>
                  <span className="text-slate-400">→</span>
                  <span className={`flex-1 font-semibold ${studentVal ? (correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400') : 'text-slate-400 italic'}`}>
                    {studentVal || 'No answer'}
                  </span>
                  {studentVal && (correct
                    ? <span className="text-emerald-600 flex-shrink-0">✅</span>
                    : <span className="flex-shrink-0 text-red-500">❌ <span className="text-xs text-emerald-600 font-medium">{pair[1]}</span></span>
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      if (qtype === 'fill_blank') {
        const parts = (item.content ?? '').split('___');
        const fbAns = item.options?.length ? item.options : [item.correctAnswer ?? ''];
        return (
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-loose">
            {parts.map((part, i) => (
              <span key={i}>
                {part}
                {i < parts.length - 1 && (() => {
                  const sv = sub?.[i] ?? '';
                  const ok = answersMatch(fbAns[i] ?? '', sv);
                  return (
                    <span className={`inline-block mx-1 px-2 py-0.5 rounded font-bold text-sm ${sv ? (ok ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300') : 'bg-slate-100 dark:bg-gray-700 text-slate-400 italic'}`}>
                      {sv || '—'}
                      {sv && !ok && <span className="ml-1 text-xs text-emerald-600">({fbAns[i]})</span>}
                    </span>
                  );
                })()}
              </span>
            ))}
          </p>
        );
      }

      if (qtype === 'multi_answer') {
        return (
          <div className="space-y-1.5">
            {(item.options ?? []).map((word, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-28 flex-shrink-0 font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-gray-700 px-2 py-1 rounded">{word}</span>
                <span className={`flex-1 font-semibold ${sub?.[i] ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 italic'}`} dir="auto">
                  {sub?.[i] || 'No answer'}
                </span>
              </div>
            ))}
          </div>
        );
      }

      if (qtype === 'multiple_choice' || qtype === 'fill_blank_options') {
        const correct = ans === item.correctAnswer;
        return (
          <div className="space-y-1.5">
            {(item.options ?? []).map((opt, i) => {
              const isSelected = ans === opt;
              const isCorrect = opt === item.correctAnswer;
              return (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                  isSelected && correct ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 font-semibold text-emerald-700 dark:text-emerald-300'
                  : isSelected && !correct ? 'border-red-400 bg-red-50 dark:bg-red-900/20 font-semibold text-red-600 dark:text-red-400'
                  : isCorrect && !correct ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400'
                }`}>
                  <span className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-xs font-bold border-current">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1">{opt}</span>
                  {isSelected && (correct ? <span>✅</span> : <span>❌</span>)}
                  {isCorrect && !isSelected && <span className="text-xs font-semibold text-emerald-600">(correct)</span>}
                </div>
              );
            })}
          </div>
        );
      }

      if (qtype === 'true_false') {
        const correct = ans === item.correctAnswer;
        return (
          <div className="flex gap-3">
            {['True', 'False'].map(opt => {
              const isSelected = ans === opt;
              const isCorrect = opt === item.correctAnswer;
              return (
                <div key={opt} className={`flex-1 text-center px-4 py-3 rounded-xl border-2 font-semibold text-sm ${
                  isSelected && correct ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : isSelected ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  : isCorrect && !correct ? 'border-emerald-300 text-emerald-600 dark:text-emerald-400'
                  : 'border-slate-200 dark:border-gray-600 text-slate-400'
                }`}>
                  {opt}{isSelected && (correct ? ' ✅' : ' ❌')}
                  {isCorrect && !isSelected && <span className="block text-xs font-normal">correct</span>}
                </div>
              );
            })}
          </div>
        );
      }

      // short_answer, translate types
      return (
        <div className={`px-4 py-3 rounded-xl border-2 text-sm font-medium ${
          ans ? 'border-slate-200 dark:border-gray-600 text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-gray-700/50'
          : 'border-dashed border-slate-200 dark:border-gray-600 text-slate-400 italic'
        }`} dir="auto">
          {ans || 'No answer provided'}
        </div>
      );
    };

    return (
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {studentName ? `${studentName}'s Homework` : 'Homework Review'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{lessonTitle}</p>
          </div>
          {submission ? (
            <div className="text-right flex-shrink-0">
              <span className="inline-block px-3 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full text-xs font-bold">
                Submitted {new Date(submission.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              {totalMarked > 0 && (
                <p className="text-xs text-slate-400 mt-1">{totalCorrect}/{totalMarked} marked · {gradeSaving && <span className="text-amber-500 animate-pulse">saving…</span>}</p>
              )}
            </div>
          ) : (
            <span className="inline-block px-3 py-1 bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 rounded-full text-xs font-bold">
              Not submitted yet
            </span>
          )}
        </div>

        {/* No submission state */}
        {!submission && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-slate-200 dark:border-gray-700 p-12 text-center space-y-3">
            <div className="text-5xl">📭</div>
            <p className="font-semibold text-slate-700 dark:text-slate-200">{studentName ?? 'The student'} hasn't submitted this homework yet.</p>
            <p className="text-sm text-slate-400">You'll receive a notification when they submit.</p>
          </div>
        )}

        {/* Question review cards */}
        {submission && practiceItems.map(item => {
          reviewQNum++;
          const qtype = item.questionType;
          const isManual = manualTypes.includes(qtype ?? 'short_answer');
          const g = grading[item.id];
          const autoCorrect = !isManual && (() => {
            const ans = submission.answers?.[item.id];
            const sub = submission.subAnswers?.[item.id];
            if (qtype === 'matching') {
              try {
                const pairs: [string, string][] = JSON.parse(item.correctAnswer ?? '[]');
                return pairs.every((p, i) => answersMatch(p[1], sub?.[i] ?? ''));
              } catch { return false; }
            }
            if (qtype === 'fill_blank') {
              const fbAns = item.options?.length ? item.options : [item.correctAnswer ?? ''];
              const blanks = (item.content ?? '').split('___').length - 1;
              return Array.from({ length: blanks }, (_, i) => i).every(i => answersMatch(fbAns[i] ?? '', sub?.[i] ?? ''));
            }
            if (qtype === 'multiple_choice' || qtype === 'fill_blank_options' || qtype === 'true_false') {
              return ans === item.correctAnswer;
            }
            return answersMatch(item.correctAnswer ?? '', ans ?? '');
          })();

          const cardBorder = isManual
            ? (g?.correct === true ? 'border-emerald-300 dark:border-emerald-700' : g?.correct === false ? 'border-red-300 dark:border-red-700' : 'border-slate-200 dark:border-gray-700')
            : (autoCorrect ? 'border-emerald-300 dark:border-emerald-700' : 'border-red-300 dark:border-red-700');

          return (
            <div key={item.id} className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-5 space-y-4 ${cardBorder}`}>
              {/* Question header */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Q{reviewQNum}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 font-medium">
                    {QUESTION_TYPE_LABELS[qtype ?? 'short_answer']}
                  </span>
                  {item.marks != null && item.marks > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                      {item.marks} mark{item.marks !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {/* Result badge */}
                {isManual ? (
                  g?.correct === true ? <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 rounded-full">✅ Correct</span>
                  : g?.correct === false ? <span className="text-xs font-bold text-red-600 bg-red-100 dark:bg-red-900/30 px-3 py-1 rounded-full">❌ Incorrect</span>
                  : <span className="text-xs font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-3 py-1 rounded-full">⏳ Needs marking</span>
                ) : (
                  autoCorrect
                    ? <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 rounded-full">✅ Correct</span>
                    : <span className="text-xs font-bold text-red-600 bg-red-100 dark:bg-red-900/30 px-3 py-1 rounded-full">❌ Incorrect</span>
                )}
              </div>

              {/* Question prompt */}
              {qtype !== 'fill_blank' && (
                <p className="text-base font-semibold text-slate-800 dark:text-slate-100" dir="auto">{item.content}</p>
              )}

              {/* Student's answer */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Student's Answer</p>
                {renderStudentAnswer(item)}
              </div>

              {/* Correct answer (for auto-graded wrong answers) */}
              {!isManual && !autoCorrect && item.correctAnswer && qtype !== 'matching' && qtype !== 'fill_blank' && qtype !== 'multiple_choice' && qtype !== 'fill_blank_options' && qtype !== 'true_false' && (
                <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
                  <span className="font-bold">Correct answer:</span> {item.correctAnswer}
                </div>
              )}

              {/* Manual marking buttons */}
              {isManual && (
                <div className="space-y-3 pt-1">
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        const note = noteInputs[item.id] ?? g?.note ?? '';
                        const ng = { ...grading, [item.id]: { correct: true, ...(note ? { note } : {}) } };
                        setGrading(ng);
                        saveGrading(ng);
                      }}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                        g?.correct === true
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700'
                      }`}
                    >
                      ✅ Correct
                    </button>
                    <button
                      onClick={() => {
                        const note = noteInputs[item.id] ?? g?.note ?? '';
                        const ng = { ...grading, [item.id]: { correct: false, ...(note ? { note } : {}) } };
                        setGrading(ng);
                        saveGrading(ng);
                      }}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                        g?.correct === false
                          ? 'bg-red-500 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700'
                      }`}
                    >
                      ❌ Incorrect
                    </button>
                  </div>
                  {/* Correction / comment textarea */}
                  <textarea
                    rows={2}
                    value={noteInputs[item.id] ?? ''}
                    onChange={e => setNoteInputs(p => ({ ...p, [item.id]: e.target.value }))}
                    onBlur={() => {
                      if (g === undefined) return; // don't save note until marked
                      const note = noteInputs[item.id] ?? '';
                      const ng = { ...grading, [item.id]: { ...g, note: note || undefined } };
                      setGrading(ng);
                      saveGrading(ng);
                    }}
                    placeholder="Add a correction or comment for the student… (optional)"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                    dir="auto"
                  />
                </div>
              )}

              {/* Tutor note for auto-graded questions (optional correction) */}
              {!isManual && g !== undefined && (
                <div className="pt-1">
                  <textarea
                    rows={2}
                    value={noteInputs[item.id] ?? ''}
                    onChange={e => setNoteInputs(p => ({ ...p, [item.id]: e.target.value }))}
                    onBlur={() => {
                      const note = noteInputs[item.id] ?? '';
                      const ng = { ...grading, [item.id]: { ...g, note: note || undefined } };
                      setGrading(ng);
                      saveGrading(ng);
                    }}
                    placeholder="Add a comment for the student… (optional)"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                    dir="auto"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Tutor read-only view (no student selected) ────────────────────────────
  if (!isAdmin && !studentMode && !studentId) {
    let rNum = 0;
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Homework Preview</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{lessonTitle} · {practiceItems.length} question{practiceItems.length !== 1 ? 's' : ''}</p>
        </div>
        {practiceItems.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-slate-200 dark:border-gray-700 p-12 text-center">
            <p className="font-semibold text-slate-500 dark:text-slate-400">No questions added yet.</p>
          </div>
        )}
        {practiceItems.map(item => {
          rNum++;
          const qtype = item.questionType ?? 'short_answer';
          let pairs: [string, string][] = [];
          if (qtype === 'matching') { try { pairs = JSON.parse(item.correctAnswer ?? '[]'); } catch { /* */ } }
          return (
            <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-bold flex items-center justify-center">{rNum}</span>
                <div className="flex-1 space-y-2">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm" dir="auto">{item.content}</p>
                  {item.imageUrl && <img src={item.imageUrl} className="rounded-xl max-h-40 object-contain" />}
                  <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 text-xs font-medium">{qtype.replace(/_/g, ' ')}</span>
                </div>
              </div>
              {(qtype === 'multiple_choice' || qtype === 'fill_blank_options') && item.options && (
                <div className="grid grid-cols-2 gap-2 pl-10">
                  {item.options.map((opt, i) => (
                    <div key={i} className={`px-3 py-2 rounded-lg border text-sm ${opt === item.correctAnswer ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-semibold' : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300'}`}>
                      {opt === item.correctAnswer && <span className="mr-1">✓</span>}{opt}
                    </div>
                  ))}
                </div>
              )}
              {qtype === 'true_false' && (
                <div className="flex gap-2 pl-10">
                  {['true', 'false'].map(v => (
                    <div key={v} className={`px-4 py-1.5 rounded-lg border text-sm font-medium capitalize ${v === item.correctAnswer ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400'}`}>
                      {v === item.correctAnswer && <span className="mr-1">✓</span>}{v}
                    </div>
                  ))}
                </div>
              )}
              {qtype === 'matching' && pairs.length > 0 && (
                <div className="pl-10 space-y-1.5">
                  {pairs.map(([a, b], i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <span className="px-2 py-1 bg-slate-100 dark:bg-gray-700 rounded">{a}</span>
                      <span className="text-slate-400">→</span>
                      <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded">{b}</span>
                    </div>
                  ))}
                </div>
              )}
              {(qtype === 'fill_blank' || qtype === 'short_answer' || qtype === 'translate') && item.correctAnswer && (
                <div className="pl-10">
                  <p className="text-xs text-slate-400 mb-1">Answer</p>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300" dir="auto">{item.correctAnswer}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Admin view ────────────────────────────────────────────────────────────
  let qNum = 0;

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />

      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('arabicLessonDetail.homeworkTitle')}</h2>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-1">
          {practiceItems.length} question{practiceItems.length !== 1 ? 's' : ''}{items.length > practiceItems.length ? ` · ${items.length} total items` : ''}
        </p>
      </div>

      {/* Add buttons */}
      <div className="flex flex-wrap gap-2">
        {ADD_BUTTONS.map(b => (
          <button key={b.type} onClick={() => onAddClick(b.type)}
            className="px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors">
            {b.icon} {b.label}
          </button>
        ))}
      </div>

      {/* Add / edit question form */}
      {addingQ && (
        <HomeworkQuestionForm lessonId={lessonId} onDone={() => { setAddingQ(false); reload(); }} onCancel={() => setAddingQ(false)} />
      )}
      {editingQ && (
        <HomeworkQuestionForm lessonId={lessonId} existing={editingQ} onDone={() => { setEditingQ(null); reload(); }} onCancel={() => setEditingQ(null)} />
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-3">📝</div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{t('arabicLessonDetail.noQuestions')}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('arabicLessonDetail.noQuestionsAdmin')}</p>
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
                draggable
                onDragStart={() => { dragIdx.current = index; }}
                onDragOver={e => { e.preventDefault(); setOverIdx(index); }}
                onDragEnd={handleDragEnd}
                className={`bg-white dark:bg-gray-800 border rounded-xl p-3 flex gap-3 transition-colors ${
                  overIdx === index
                    ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-200 dark:ring-amber-900'
                    : 'border-slate-200 dark:border-gray-700'
                }`}
              >
                <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 select-none text-xl flex items-center px-0.5" title="Drag to reorder">
                  ⠿
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {item.itemType === 'question'
                        ? `Q${qNum} · ${QUESTION_TYPE_LABELS[item.questionType ?? 'short_answer']} · ${item.marks ?? 0} marks`
                        : item.itemType}
                    </span>
                    <div className="flex gap-2">
                      {item.itemType === 'question' && (
                        <button onClick={() => setEditingQ(item)} className="text-xs font-semibold text-sky-600 hover:underline">Edit</button>
                      )}
                      <button onClick={() => removeItem(item)} className="text-xs font-semibold text-red-500 hover:underline">Delete</button>
                    </div>
                  </div>
                  {item.itemType === 'divider' && <hr className="border-slate-200 dark:border-gray-700" />}
                  {item.itemType === 'image' && item.imageUrl && (
                    <img src={item.imageUrl} alt="" className="max-h-40 rounded-lg border border-slate-200 dark:border-gray-700" />
                  )}
                  {(['section', 'headline', 'instruction', 'paragraph'] as ArabicExamItemType[]).includes(item.itemType) && (
                    <textarea
                      defaultValue={item.content ?? ''}
                      onBlur={e => saveContent(item, e.target.value)}
                      rows={item.itemType === 'paragraph' ? 3 : 1}
                      dir="auto"
                      placeholder={`Enter ${item.itemType} text…`}
                      className={inp}
                    />
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
  const [flipped, setFlipped]       = useState(false);

  // Lottie refs for challenge buttons
  const greetingLottieRef = useRef<HTMLDivElement>(null);
  const planeLottieRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getVocabWords(lessonId).then(ws => { setWords(ws); setLoading(false); });
  }, [lessonId]);

  useEffect(() => {
    if (!selectedStudentId) { setAttempts([]); return; }
    getVocabAttempts(selectedStudentId, lessonId).then(setAttempts);
  }, [selectedStudentId, lessonId]);

  // Reset flip when card changes
  useEffect(() => { setFlipped(false); }, [cardIndex, phase]);

  // Lottie: greeting card button
  useEffect(() => {
    if (!greetingLottieRef.current) return;
    const anim = lottie.loadAnimation({ container: greetingLottieRef.current, renderer: 'svg', loop: true, autoplay: true, path: '/greeting-card.json' });
    return () => anim.destroy();
  }, [phase]);

  // Lottie: plane button
  useEffect(() => {
    if (!planeLottieRef.current) return;
    const anim = lottie.loadAnimation({ container: planeLottieRef.current, renderer: 'svg', loop: true, autoplay: true, path: '/plane.json' });
    return () => anim.destroy();
  }, [phase]);

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

        {/* Flip card */}
        <div style={{ perspective: '1200px' }} onClick={() => setFlipped(f => !f)} className="cursor-pointer select-none">
          <div style={{ transformStyle: 'preserve-3d', transition: 'transform 0.55s cubic-bezier(0.4,0.2,0.2,1)', transform: flipped ? 'rotateY(180deg)' : 'none', position: 'relative', minHeight: '200px' }}>
            {/* Front — English */}
            <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 py-16 px-12 text-center shadow-sm space-y-4 absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest">{t('arabicLessonDetail.doYouKnow')}</p>
              <p className="text-5xl font-extrabold text-slate-800 dark:text-slate-100">{word.english}</p>
              <p className="text-xs text-slate-300 dark:text-slate-600 mt-2">tap to reveal</p>
            </div>
            {/* Back — Arabic + transliteration */}
            <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-700 py-16 px-12 text-center shadow-sm space-y-3 absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-6xl font-extrabold text-slate-800 dark:text-slate-100" dir="rtl">{word.arabic}</p>
              {word.transliteration && <p className="text-xl text-amber-700 dark:text-amber-300 italic">{word.transliteration}</p>}
              <p className="text-base text-slate-500 dark:text-slate-400 mt-1">= {word.english}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mt-4">
          {/* Not Sure button */}
          <button onClick={() => { setFlipped(true); handleNotSure(); }}
            className="group flex flex-col items-center justify-center gap-3 py-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-700 transition-all shadow-sm">
            <svg className="w-10 h-10 text-red-500 dark:text-red-400 group-hover:scale-110 transition-transform" viewBox="0 0 64 64" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="m54.47021 44.459c-2.59771-3.29311-13.30316-6.74373-15.55609-7.442a35.687 35.687 0 0 0 -.44635-3.85693 12.1115 12.1115 0 0 0 3.38965-6.10737 5.33833 5.33833 0 0 0 1.84158-6.63125 15.86778 15.86778 0 0 0 .36444-5.08649 16.08178 16.08178 0 0 0 -.94532-4.11816 6.18869 6.18869 0 0 0 1.4795-3.11133 1.33544 1.33544 0 0 0 -1.48828-1.52734 8.02887 8.02887 0 0 1 -5.05225-.86622 16.30427 16.30427 0 0 0 -12.35547-.001c-4.8548 2.27275-8.21593 8.78178-6.477 15.20617a5.49549 5.49549 0 0 0 2.29738 6.25192 13.10539 13.10539 0 0 0 3.20392 5.97485 36.27915 36.27915 0 0 0 -.44855 3.87927c-2.33026.69617-12.78967 3.95831-15.37744 7.14783-2.33938 2.88471-3.17727 13.09956-3.26516 14.25483a1 1 0 0 0 1.99414.15235c.22558-2.9668 1.17236-11.11036 2.82422-13.14747 1.8833-2.32128 10.26562-5.23535 14.084-6.39648 4.48152 5.49784 7.01416 5.12012 7.01416 5.12012 2.58008 0 5.8335-3.56934 7.12256-5.11719 3.8584 1.2207 12.34472 4.27539 14.22607 6.66016 1.58057 2.0039 2.38037 9.96582 2.55518 12.86523a.9999.9999 0 0 0 1.99609-.12012c-.06789-1.13086-.72902-11.1289-2.98098-13.98338zm-27.91992-36.93752c3.77491-1.76757 8.80274-.873 10.72119.03125a10.468 10.468 0 0 0 5.10452 1.10743 3.22376 3.22376 0 0 1 -.9043 1.3623 1.31716 1.31716 0 0 0 -.37939 1.50293 14.12089 14.12089 0 0 1 .98 3.99512 13.867 13.867 0 0 1 -.21192 4.02051 8.966 8.966 0 0 1 -1.46142-4.7295 1.33542 1.33542 0 0 0 -1.71827-1.248 26.0117 26.0117 0 0 1 -14.38281.04882 1.33147 1.33147 0 0 0 -1.70508 1.22461 8.1478 8.1478 0 0 1 -1.65531 4.61325c-.84566-4.62851 1.40407-9.95686 5.61279-11.92872zm-3.16015 18.81934a1.00094 1.00094 0 0 0 -.51319-.69141 3.49381 3.49381 0 0 1 -1.86071-3.53717c.83685-.27554 3.10076-2.95691 3.51013-6.36712a28.05229 28.05229 0 0 0 13.92138-.042c.25144 2.58886 2.09919 6.708 3.75013 6.66693a3.66306 3.66306 0 0 1 -1.78675 3.254.997.997 0 0 0 -.44433.67578 9.49692 9.49692 0 0 1 -4.66455 6.68067c-.15918.084-3.93995 2.01074-7.17725.34375a10.52343 10.52343 0 0 1 -4.73486-6.98343zm8.15771 15.81348c-1.30658-.007-3.72931-2.3042-5.337-4.23743a29.60949 29.60949 0 0 1 .32122-3.21136c2.96526 1.91969 7.07172 1.5756 10.1026-.18537a31.34117 31.34117 0 0 1 .348 3.41767c-3.73339 4.37668-5.43482 4.21649-5.43482 4.21649z"/>
              <path d="m49.66748 56.4375h-9a1 1 0 0 1 0-2h9a1 1 0 0 1 0 2z"/>
              <path d="m53.43457 35.35938a3.85156 3.85156 0 0 1 1.83154-3.74708c1.03077-.67968 1.16651-1.00683 1.082-1.48242-.27333-1.53729-3.3849-1.28819-2.98242.17481a1 1 0 0 1 -1.92869.52931c-1.16431-4.24423 6.13532-5.23283 6.87988-1.05566.354 1.98438-1.20166 3.00977-1.94873 3.50293a1.86228 1.86228 0 0 0 -.94043 1.916.99987.99987 0 0 1 -1.99315.16211z"/>
              <circle cx="54.485" cy="38.02" r=".954"/>
              <path d="m7.76953 36.84277a3.84848 3.84848 0 0 1 1.832-3.74707c1.03028-.67968 1.166-1.00683 1.08155-1.48242-.27323-1.53336-3.38463-1.293-2.98243.17481a1 1 0 0 1 -1.92871.52929c-1.16634-4.2477 6.1361-5.22843 6.87989-1.05566.35351 1.98242-1.20118 3.00976-1.94825 3.50293a1.86185 1.86185 0 0 0 -.94091 1.916.99988.99988 0 0 1 -1.99314.16212z"/>
              <circle cx="8.82" cy="39.503" r=".954"/>
              <path d="m11.06055 13.2627a3.84842 3.84842 0 0 1 1.832-3.74707c1.03027-.67969 1.166-1.00684 1.08154-1.48243-.27243-1.52894-3.38594-1.296-2.98291.17481a1 1 0 0 1 -1.92868.52929c-1.16597-4.2463 6.1365-5.22917 6.88037-1.05566.35352 1.98242-1.20117 3.00977-1.94824 3.50293a1.86186 1.86186 0 0 0 -.94092 1.916.99987.99987 0 0 1 -1.99316.16213z"/>
              <circle cx="12.111" cy="15.923" r=".954"/>
              <path d="m50.2583 15.958a3.84738 3.84738 0 0 1 1.832-3.748c1.03028-.67969 1.166-1.00683 1.08155-1.48242-.273-1.53231-3.38546-1.29425-2.98292.1748a1 1 0 0 1 -1.92871.5293c-1.16663-4.24892 6.13698-5.22647 6.88041-1.05568.35351 1.98437-1.20167 3.01074-1.94874 3.5039a1.86009 1.86009 0 0 0 -.94043 1.916.99987.99987 0 0 1 -1.99316.1621z"/>
              <circle cx="51.309" cy="18.618" r=".954"/>
            </svg>
            <span className="text-red-600 dark:text-red-400 font-bold text-base">{t('arabicLessonDetail.notSure')}</span>
          </button>
          {/* I Know button */}
          <button onClick={handleKnow}
            className="group flex flex-col items-center justify-center gap-3 py-6 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all shadow-sm">
            <svg className="w-10 h-10 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" viewBox="0 0 511.981 511.981" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="m495.502 236.263c0-13.943-5.405-26.767-15.219-36.109-9.477-9.021-22.134-13.988-35.641-13.988l-162.409.005c-16.464-17.908-21.958-44.092-13.27-65.004 13.031-31.362 12.298-56.688-2.45-84.684-11.503-21.836-40.53-39.068-60.886-36.162-12.265 1.752-20.815 10.203-23.461 23.186-.871 4.273-1.131 9.309-1.434 15.14-.838 16.181-1.987 38.342-16.159 65.492-8.273 15.85-11.13 32.729-13.651 47.623-4.637 27.396-7.396 43.662-34.698 46.645v-2.718c0-5.523-4.477-10-10-10h-79.745c-5.523 0-10 4.477-10 10v294.035c0 5.523 4.477 10 10 10h79.747c5.523 0 10-4.477 10-10v-2.805c18.363 1.452 36.906 6.572 56.363 11.959 23.27 6.443 47.331 13.105 71.701 13.105h112.143c30.679 0 55.501-16.171 66.4-43.259 6.207-15.427 6.479-31.339 1.319-43.197 7.605-5.464 13.936-13.05 18.544-22.471 8.322-17.01 9.151-36.271 2.793-51.103 10.897-8.542 17.625-20.821 20.692-32.648 3.592-13.852 2.572-27.342-2.22-37.645 18.45-7.413 31.541-25.096 31.541-45.397zm-50.079 29.099-50 1.087c-5.521.12-9.9 4.693-9.78 10.215.12 5.521 4.698 9.88 10.215 9.78l46.76-1.017c5.417 4.956 7.292 16.949 4.204 28.856-1.755 6.769-9.489 28.854-35.313 28.854-5.523 0-10 4.477-10 10s4.477 10 10 10c5.839 0 11.188-.757 16.062-2.124 3.48 9.364 2.561 22.216-2.839 33.252-2.771 5.665-8.338 14.068-18.253 18.42-.29.106-.577.227-.857.362-3.794 1.536-8.202 2.481-13.301 2.481-5.523 0-10 4.477-10 10s4.477 10 10 10c4.732 0 9.298-.551 13.651-1.624 2.543 6.26 2.738 16.342-1.692 27.353-3.717 9.238-15.819 30.724-47.845 30.724h-112.145c-21.652 0-43.37-6.014-66.363-12.38-20.081-5.56-40.752-11.273-61.701-12.737v-79.162c0-5.523-4.477-10-10-10s-10 4.477-10 10v92.021h-59.747v-274.035h59.747v92.014c0 5.523 4.477 10 10 10s10-4.477 10-10v-79.225c44.37-4.023 49.689-35.446 54.417-63.377 2.385-14.089 4.851-28.657 11.661-41.706 16.189-31.015 17.521-56.709 18.402-73.712.261-5.03.486-9.374 1.058-12.182 1.244-6.104 4.107-7.01 6.692-7.379 11.005-1.571 32.208 10.207 40.363 25.685 11.989 22.757 12.459 41.735 1.675 67.688-9.547 22.979-6.491 50.531 6.882 72.679h-12.329c-5.522 0-10 4.478-10 10s4.478 10 10 10l199.595-.006c8.349 0 16.109 3.009 21.85 8.474 5.81 5.53 9.009 13.209 9.009 21.623.001 15.684-13.492 28.737-30.078 29.098z"/>
              <path d="m106.226 332.702c-5.523 0-10 4.48-10 10.003s4.477 10 10 10 10-4.477 10-10v-.007c0-5.523-4.477-9.996-10-9.996z"/>
            </svg>
            <span className="text-emerald-700 dark:text-emerald-400 font-bold text-base">{t('arabicLessonDetail.iKnow')}</span>
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
                className="w-full flex items-center gap-4 px-5 py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors shadow-md hover:shadow-lg">
                <div ref={greetingLottieRef} className="w-14 h-14 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-base font-bold">{t('arabicLessonDetail.startFlashcard', { count: words.length })}</p>
                  <p className="text-xs font-normal opacity-80">Flip cards to test your memory</p>
                </div>
              </button>
              <button onClick={() => setShowWordFlight(true)}
                className="w-full flex items-center gap-4 px-5 py-4 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl transition-colors shadow-md hover:shadow-lg">
                <div ref={planeLottieRef} className="w-14 h-14 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-base font-bold">Word Flight Game</p>
                  <p className="text-xs font-normal opacity-80">Catch the falling Arabic words</p>
                </div>
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
