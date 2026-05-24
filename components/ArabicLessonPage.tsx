// components/ArabicLessonPage.tsx
// ---------------------------------------------------------------------------
// Arabic lessons library — grouped into 3 levels of 20 lessons each.
// • Admins can upload / edit / delete / reorder lessons and upload level plan images.
// • Tutors/students see 3 level tabs; completed lessons are highlighted green.
// • "Show Plan" button reveals the level overview image.
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { ArabicLesson, ArabicStudent, ArabicLevelPlan, ArabicCourseDialect } from '../types';
import { useAuth } from '../context/AuthProvider';
import { useI18n } from '../context/I18nProvider';
import {
  getArabicLessons,
  createArabicLesson,
  updateArabicLesson,
  deleteArabicLesson as deleteLessonSvc,
  reorderArabicLessons,
  uploadArabicLessonPdf,
  getHomeworkCountsByLesson,
  getHomeworkCompletionsForStudent,
  getVocabRoundsByLesson,
  getLevelPlans,
  uploadLevelPlanImage,
  saveLevelPlan,
} from '../services/arabicService';
import ArabicLessonDetailPage from './ArabicLessonDetailPage';

const LESSONS_PER_LEVEL = 20;
const LEVELS = [1, 2, 3] as const;

// ── Create / Edit modal ──────────────────────────────────────────────────────

interface ModalProps {
  isOpen: boolean;
  existing?: ArabicLesson;
  onClose: () => void;
  onCreated?: (l: ArabicLesson) => void;
  onUpdated?: (l: ArabicLesson) => void;
  createdBy?: string;
  defaultLevel?: 1 | 2 | 3;
  defaultDialect?: ArabicCourseDialect;
}

const COURSE_LABELS: Record<ArabicCourseDialect, string> = {
  levantine: 'Levantine Arabic',
  msa:       'Modern Standard Arabic',
};

const CreateArabicLessonModal: React.FC<ModalProps> = ({
  isOpen, existing, onClose, onCreated, onUpdated, createdBy, defaultLevel = 1, defaultDialect = 'levantine',
}) => {
  const { t } = useI18n();
  const isEdit = !!existing;
  const [title,   setTitle]   = useState(existing?.title       ?? '');
  const [desc,    setDesc]    = useState(existing?.description ?? '');
  const [level,   setLevel]   = useState<1|2|3>(existing?.level ?? defaultLevel);
  const [dialect, setDialect] = useState<ArabicCourseDialect>(existing?.dialect ?? defaultDialect);
  const [file,    setFile]    = useState<File | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => { setTitle(''); setDesc(''); setFile(null); setSaving(false); setErr(''); setDialect(defaultDialect); };
  const handleClose = () => { reset(); onClose(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') { setErr(t('arabicLessonPage.errPdfOnly')); return; }
    if (f.size > 50 * 1024 * 1024) { setErr(t('arabicLessonPage.errPdfSize')); return; }
    setErr(''); setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!title.trim()) { setErr(t('arabicLessonPage.errTitleRequired')); return; }
    if (!isEdit && !file) { setErr(t('arabicLessonPage.errFileRequired')); return; }
    setSaving(true);

    let pdfUrl = existing?.pdfUrl;
    if (file) {
      const url = await uploadArabicLessonPdf(file);
      if (!url) { setErr(t('arabicLessonPage.errUploadFailed')); setSaving(false); return; }
      pdfUrl = url;
    }

    if (isEdit && existing) {
      const ok = await updateArabicLesson(existing.id, { title: title.trim(), description: desc.trim() || undefined, pdfUrl, level, dialect });
      setSaving(false);
      if (!ok) { setErr(t('arabicLessonPage.errSaveFailed')); return; }
      onUpdated?.({ ...existing, title: title.trim(), description: desc.trim() || undefined, pdfUrl, level, dialect });
      handleClose();
    } else {
      const lesson = await createArabicLesson({ title: title.trim(), description: desc.trim() || undefined, level, dialect, pdfUrl, createdBy });
      setSaving(false);
      if (!lesson) { setErr(t('arabicLessonPage.errCreateFailed')); return; }
      onCreated?.(lesson);
      handleClose();
    }
  };

  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={saving ? undefined : handleClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {isEdit ? t('arabicLessonPage.editLesson') : t('arabicLessonPage.uploadLesson')}
          </h2>
          {!saving && (
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('arabicLessonPage.lessonTitle')}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} disabled={saving} autoFocus
              placeholder={t('arabicLessonPage.lessonTitlePlaceholder')} className={inp} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('arabicLessonPage.description')} <span className="text-xs font-normal text-slate-400">({t('arabicLessonPage.optional')})</span>
            </label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} disabled={saving} rows={2}
              placeholder={t('arabicLessonPage.descriptionPlaceholder')} className={inp} />
          </div>
          {/* Course Type selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('arabicLessonPage.course')}</label>
            <div className="flex gap-2">
              {(['levantine', 'msa'] as ArabicCourseDialect[]).map(d => (
                <button key={d} type="button" onClick={() => setDialect(d)} disabled={saving}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${
                    dialect === d
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-amber-300'
                  }`}>
                  {COURSE_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          {/* Level selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('arabicLessonPage.level')}</label>
            <div className="flex gap-2">
              {LEVELS.map(l => (
                <button key={l} type="button" onClick={() => setLevel(l)} disabled={saving}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${
                    level === l
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-amber-300'
                  }`}>
                  {t('arabicLessonPage.levelN', { n: l })}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('arabicLessonPage.pdfFile')} {isEdit && <span className="text-xs font-normal text-slate-400">({t('arabicLessonPage.pdfKeepCurrent')})</span>}
            </label>
            <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFileChange} disabled={saving} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={saving}
              className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-gray-600 rounded-lg hover:border-amber-400 transition-colors text-left">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                className={`w-8 h-8 flex-shrink-0 ${file ? 'text-amber-600' : 'text-slate-400'}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <div className="min-w-0">
                {file ? (
                  <><p className="text-sm font-semibold text-amber-700 dark:text-amber-300 truncate">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p></>
                ) : existing?.pdfUrl ? (
                  <><p className="text-sm text-slate-600 dark:text-slate-300">{t('arabicLessonPage.pdfReplace')}</p>
                    <p className="text-xs text-slate-400">{t('arabicLessonPage.pdfMaxSize')}</p></>
                ) : (
                  <><p className="text-sm text-slate-600 dark:text-slate-300">{t('arabicLessonPage.pdfChoose')}</p>
                    <p className="text-xs text-slate-400">{t('arabicLessonPage.pdfMaxSize')}</p></>
                )}
              </div>
            </button>
          </div>
          {err && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">{err}</div>}
          {saving && (
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
              </svg>
              {file ? t('arabicLessonPage.uploadingPdf') : t('arabicLessonPage.saving')}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose} disabled={saving}
              className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500 disabled:opacity-50">
              {t('arabicLessonPage.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-amber-500 text-white font-semibold rounded-md shadow-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-wait">
              {saving ? '…' : isEdit ? t('arabicLessonPage.saveChanges') : t('arabicLessonPage.uploadLesson')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Level Plan Image Modal ────────────────────────────────────────────────────

const LevelPlanModal: React.FC<{
  level: 1|2|3;
  dialect: ArabicCourseDialect;
  imageUrl?: string;
  isAdmin: boolean;
  onClose: () => void;
  onUploaded: (url: string) => void;
}> = ({ level, dialect, imageUrl, isAdmin, onClose, onUploaded }) => {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr(t('arabicLessonPage.errImageOnly')); return; }
    setUploading(true); setErr('');
    const url = await uploadLevelPlanImage(level, dialect, f);
    if (!url) { setErr(t('arabicLessonPage.errPlanUploadFailed')); setUploading(false); return; }
    await saveLevelPlan(level, dialect, url);
    setUploading(false);
    onUploaded(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={onClose}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 backdrop-blur-sm flex-shrink-0" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-white text-base tracking-wide">{COURSE_LABELS[dialect]} — Level {level} Plan</h3>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                {uploading ? t('arabicLessonPage.uploading') : t('arabicLessonPage.uploadPlanImage')}
              </button>
            </>
          )}
          <button onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
            {t('arabicLessonPage.close')}
          </button>
        </div>
      </div>

      {err && (
        <p className="px-6 py-2 text-sm text-red-300 bg-red-900/40 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {err}
        </p>
      )}

      {/* ── Full-screen image area ── */}
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden" onClick={onClose}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Level ${level} plan`}
            onClick={e => e.stopPropagation()}
            className="max-w-full max-h-full object-contain select-none"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/50" onClick={e => e.stopPropagation()}>
            <span className="text-7xl">🗺</span>
            <p className="font-semibold text-lg">{t('arabicLessonPage.noPlanImage')}</p>
            {isAdmin && <p className="text-sm">{t('arabicLessonPage.noPlanImageHint')}</p>}
          </div>
        )}
      </div>

      {/* Hint */}
      <p className="text-center text-white/30 text-xs py-2 flex-shrink-0 select-none">
        Click anywhere outside the image to close
      </p>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  students: ArabicStudent[];
  teacherId: string;
  preSelectedStudentId?: string;
  onStudentUpdated?: (s: ArabicStudent) => void;
  studentMode?: boolean;
  /** Limit which course dialects are shown (for student view). Empty = show all. */
  dialectFilter?: ArabicCourseDialect[];
}

const ArabicLessonPage: React.FC<Props> = ({ students, teacherId, preSelectedStudentId, onStudentUpdated, studentMode = false, dialectFilter }) => {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  // Which dialects to show: admin sees both; student sees their selected ones (or all if unfiltered)
  const availableDialects: ArabicCourseDialect[] =
    dialectFilter && dialectFilter.length > 0 ? dialectFilter : ['levantine', 'msa'];

  const [lessons,       setLessons]       = useState<ArabicLesson[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [activeDialect, setActiveDialect] = useState<ArabicCourseDialect>(availableDialects[0]);
  const [activeLevel,   setActiveLevel]   = useState<1|2|3>(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing,    setEditing]    = useState<ArabicLesson | null>(null);
  const [viewing,    setViewing]    = useState<ArabicLesson | null>(null);

  // Level plans keyed by "dialect-level" (e.g. "msa-1", "levantine-2")
  const [levelPlans, setLevelPlans] = useState<Record<string, string>>({});
  const [showPlan,   setShowPlan]   = useState<1|2|3|null>(null);

  // Per-lesson stats for student badges
  const [hwCounts,    setHwCounts]    = useState<Record<string, number>>({});
  const [hwDone,      setHwDone]      = useState<string[]>([]);
  const [vocabRounds, setVocabRounds] = useState<Record<string, number>>({});

  // Drag-reorder (admin)
  const dragIdx   = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Completed lesson IDs for the pre-selected student
  const completedSet = new Set(
    preSelectedStudentId
      ? (students.find(s => s.id === preSelectedStudentId)?.completedLessonIds ?? [])
      : []
  );

  useEffect(() => {
    getArabicLessons().then(data => { setLessons(data); setLoading(false); });
    getHomeworkCountsByLesson().then(setHwCounts);
    getLevelPlans().then(plans => {
      const map: Record<string, string> = {};
      plans.forEach(p => { if (p.planImageUrl) map[`${p.dialect}-${p.level}`] = p.planImageUrl; });
      setLevelPlans(map);
    });
  }, []);

  useEffect(() => {
    if (!preSelectedStudentId) { setHwDone([]); setVocabRounds({}); return; }
    getHomeworkCompletionsForStudent(preSelectedStudentId).then(setHwDone);
    getVocabRoundsByLesson(preSelectedStudentId).then(setVocabRounds);
  }, [preSelectedStudentId]);

  const handleDelete = async (l: ArabicLesson) => {
    if (!confirm(t('arabicLessonPage.deleteConfirm', { title: l.title }))) return;
    const ok = await deleteLessonSvc(l.id);
    if (ok) setLessons(prev => prev.filter(x => x.id !== l.id));
  };

  // ── Drag-to-reorder ──────────────────────────────────────────────────────
  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); setOverIdx(idx); };
  const handleDrop      = async (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    dragIdx.current = null; setOverIdx(null);
    if (from === null || from === dropIdx) return;

    // Use the same filtered+sorted slice that was rendered — must match dialect AND level
    const visibleLessons = lessons
      .filter(l => (l.dialect ?? 'levantine') === activeDialect && (l.level ?? 1) === activeLevel)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const reordered = [...visibleLessons];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIdx, 0, moved);

    const otherLessons = lessons.filter(
      l => !((l.dialect ?? 'levantine') === activeDialect && (l.level ?? 1) === activeLevel),
    );
    const allReordered = [
      ...otherLessons,
      ...reordered.map((l, i) => ({ ...l, orderIndex: i + 1 })),
    ];
    setLessons(allReordered);
    await reorderArabicLessons(allReordered);
  };
  const handleDragEnd = () => { dragIdx.current = null; setOverIdx(null); };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24 text-slate-500 dark:text-slate-400">
        <svg className="animate-spin w-8 h-8" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
      </div>
    );
  }

  // Lessons for the current dialect + level
  const dialectLessons = lessons.filter(l => (l.dialect ?? 'levantine') === activeDialect);
  const levelLessons = dialectLessons
    .filter(l => (l.level ?? 1) === activeLevel)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // Per-level progress for the pre-selected student
  const levelCompleted = levelLessons.filter(l => completedSet.has(l.id)).length;
  const levelTotal = levelLessons.length;
  const levelPct = levelTotal > 0 ? Math.round((levelCompleted / LESSONS_PER_LEVEL) * 100) : 0;

  // Milestones: lesson titles at position 10 and 20 within this level
  const milestone1 = levelLessons[9];  // 10th lesson
  const milestone2 = levelLessons[19]; // 20th lesson

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{t('arabicLessonPage.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin
              ? t('arabicLessonPage.adminSubtitle')
              : t('arabicLessonPage.studentSubtitle', { count: dialectLessons.length })}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg shadow-sm transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('arabicLessonPage.uploadLesson')}
          </button>
        )}
      </div>

      {/* ── Course (dialect) tabs ── */}
      {(isAdmin || availableDialects.length > 1) && (
        <div className="flex gap-1 bg-slate-100 dark:bg-gray-700/50 p-1 rounded-xl w-fit">
          {availableDialects.map(d => (
            <button
              key={d}
              onClick={() => { setActiveDialect(d); setActiveLevel(1); }}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                activeDialect === d
                  ? 'bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {COURSE_LABELS[d]}
            </button>
          ))}
        </div>
      )}

      {/* ── Level tabs ── */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-gray-700 overflow-x-auto">
        {LEVELS.map(lvl => {
          const lvlLessons = dialectLessons.filter(l => (l.level ?? 1) === lvl);
          const lvlDone = lvlLessons.filter(l => completedSet.has(l.id)).length;
          return (
            <button key={lvl} onClick={() => setActiveLevel(lvl)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px ${
                activeLevel === lvl
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}>
              {t('arabicLessonPage.levelN', { n: lvl })}
              {preSelectedStudentId && lvlLessons.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  lvlDone === lvlLessons.length ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-gray-700 dark:text-slate-400'
                }`}>
                  {lvlDone}/{Math.min(LESSONS_PER_LEVEL, lvlLessons.length)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Level header: Show Plan button only ── */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 rounded-2xl border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">
            {COURSE_LABELS[activeDialect]} — {t('arabicLessonPage.levelN', { n: activeLevel })} ({activeLevel === 1 ? t('arabicLessonPage.beginner') : activeLevel === 2 ? t('arabicLessonPage.intermediate') : t('arabicLessonPage.advanced')})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('arabicLessonPage.levelSummary', { count: levelTotal, total: LESSONS_PER_LEVEL })}</p>
        </div>
        <button onClick={() => setShowPlan(activeLevel)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-sm font-semibold rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
              </svg>
              {t('arabicLessonPage.showPlan')}
        </button>
      </div>

      {/* Lesson list */}
      {levelLessons.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-3">📄</div>
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">{t('arabicLessonPage.noLessons', { n: activeLevel })}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isAdmin ? t('arabicLessonPage.noLessonsAdmin') : t('arabicLessonPage.noLessonsStudent')}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-gray-700">
          {levelLessons.map((lesson, idx) => {
            const isCompleted = completedSet.has(lesson.id);
            return (
              <ArabicLessonRow
                key={lesson.id}
                lesson={lesson}
                index={idx}
                isAdmin={isAdmin}
                isDragOver={overIdx === idx}
                isCompleted={isCompleted}
                hwQuestionCount={hwCounts[lesson.id] ?? 0}
                homeworkDone={hwDone.includes(lesson.id)}
                vocabRounds={vocabRounds[lesson.id] ?? 0}
                showStudentStats={!!preSelectedStudentId}
                onView={() => setViewing(lesson)}
                onEdit={e => { e.stopPropagation(); setEditing(lesson); }}
                onDelete={e => { e.stopPropagation(); handleDelete(lesson); }}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={e => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
              />
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {isAdmin && (
        <CreateArabicLessonModal
          isOpen={createOpen}
          defaultLevel={activeLevel}
          defaultDialect={activeDialect}
          onClose={() => setCreateOpen(false)}
          createdBy={currentUser?.id}
          onCreated={lesson => { setLessons(prev => [...prev, lesson]); setCreateOpen(false); }}
        />
      )}

      {/* Edit modal */}
      {isAdmin && editing && (
        <CreateArabicLessonModal
          isOpen={!!editing}
          existing={editing}
          defaultDialect={activeDialect}
          onClose={() => setEditing(null)}
          onUpdated={updated => { setLessons(prev => prev.map(l => l.id === updated.id ? updated : l)); setEditing(null); }}
        />
      )}

      {/* Level plan modal — scoped to the currently active dialect */}
      {showPlan && (
        <LevelPlanModal
          level={showPlan}
          dialect={activeDialect}
          imageUrl={levelPlans[`${activeDialect}-${showPlan}`]}
          isAdmin={isAdmin}
          onClose={() => setShowPlan(null)}
          onUploaded={url => {
            setLevelPlans(prev => ({ ...prev, [`${activeDialect}-${showPlan}`]: url }));
          }}
        />
      )}

      {/* Lesson detail page */}
      {viewing && (
        <ArabicLessonDetailPage
          lesson={viewing}
          students={students}
          teacherId={teacherId}
          preSelectedStudentId={preSelectedStudentId}
          studentMode={studentMode}
          onClose={async () => {
            setViewing(null);
            if (preSelectedStudentId) {
              const [dbDone, dbRounds] = await Promise.all([
                getHomeworkCompletionsForStudent(preSelectedStudentId),
                getVocabRoundsByLesson(preSelectedStudentId),
              ]);
              setHwDone(prev => [...new Set([...prev, ...dbDone])]);
              setVocabRounds(dbRounds);
            }
          }}
          onStudentUpdated={onStudentUpdated}
          onHomeworkComplete={lessonId =>
            setHwDone(prev => prev.includes(lessonId) ? prev : [...prev, lessonId])
          }
        />
      )}
    </div>
  );
};

// ── Lesson row ────────────────────────────────────────────────────────────────

interface RowProps {
  lesson: ArabicLesson; index: number; isAdmin: boolean; isDragOver: boolean;
  isCompleted: boolean;
  hwQuestionCount: number; homeworkDone: boolean; vocabRounds: number; showStudentStats: boolean;
  onView: () => void; onEdit: (e: React.MouseEvent) => void; onDelete: (e: React.MouseEvent) => void;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void; onDragEnd: () => void;
}

const ArabicLessonRow: React.FC<RowProps> = ({
  lesson, index, isAdmin, isDragOver,
  isCompleted,
  hwQuestionCount, homeworkDone, vocabRounds, showStudentStats,
  onView, onEdit, onDelete,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) => {
  const { t } = useI18n();
  return (
  <div
    draggable={isAdmin}
    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
    onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
    onClick={onView}
    className={`group flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors
      ${isDragOver
        ? 'bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-400'
        : isCompleted
          ? 'bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
          : 'hover:bg-slate-50 dark:hover:bg-gray-700/50'
      }`}
  >
    {isAdmin && (
      <div
        className="flex-shrink-0 text-slate-300 dark:text-gray-600 hover:text-slate-500 cursor-grab active:cursor-grabbing"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M7 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM7 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM7 15a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 15a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
        </svg>
      </div>
    )}
    {/* Number / checkmark */}
    {isCompleted ? (
      <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-emerald-400 dark:bg-emerald-600 text-white">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
        </svg>
      </span>
    ) : (
      <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold">
        {index + 1}
      </span>
    )}
    <div className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg ${isCompleted ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-slate-100 dark:bg-gray-700'}`}>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    </div>
    <div className="flex-1 min-w-0">
      <p className={`font-semibold truncate ${isCompleted ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-100'}`}>{lesson.title}</p>
      {lesson.description && <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{lesson.description}</p>}
      {/* Student progress badges */}
      {showStudentStats && (
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {hwQuestionCount > 0 && (
            homeworkDone ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-200 dark:border-emerald-800">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5"><path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" /></svg>
                {t('arabicLessonPage.homeworkDone')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded-full border border-amber-200 dark:border-amber-700">
                📝 {t('arabicLessonPage.questions', { n: hwQuestionCount })}
              </span>
            )
          )}
          {vocabRounds > 0 && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${
              vocabRounds >= 5
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700'
            }`}>
              🎴 {t('arabicLessonPage.flashcards', { n: vocabRounds })}
            </span>
          )}
        </div>
      )}
    </div>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
      className={`w-4 h-4 flex-shrink-0 transition-colors ${isCompleted ? 'text-emerald-400 group-hover:text-emerald-500' : 'text-slate-300 dark:text-gray-600 group-hover:text-amber-500'}`}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
    {isAdmin && (
      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <button onClick={onEdit} title={t('arabicLessonPage.edit')} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-gray-700 rounded transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
          </svg>
        </button>
        <button onClick={onDelete} title={t('arabicLessonPage.delete')} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </button>
      </div>
    )}
  </div>
  );
};

export default ArabicLessonPage;
