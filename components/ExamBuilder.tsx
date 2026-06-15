import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArabicExam, ArabicExamItem, ArabicExamItemType, HomeworkQuestionType,
} from '../types';
import {
  getExam, getExamItems, updateExam, createExamItem, updateExamItem,
  deleteExamItem, reorderExamItems, uploadExamImage,
} from '../services/examService';

// ─────────────────────────────────────────────────────────────────────────────
// Admin exam builder: edit settings + an ordered list of content/question items.
// ─────────────────────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<HomeworkQuestionType, string> = {
  multiple_choice:      'Multiple Choice',
  true_false:           'True / False',
  translate_to_arabic:  'Translate → Arabic',
  translate_to_english: 'Translate → English',
  fill_blank:           'Fill in the Blank',
  fill_blank_options:   'Fill in the Blank (with choices)',
};

const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';
const label = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide';

const ADD_BUTTONS: { type: ArabicExamItemType; label: string; icon: string }[] = [
  { type: 'question',    label: 'Question',    icon: '❓' },
  { type: 'section',     label: 'Section',     icon: '📑' },
  { type: 'headline',    label: 'Headline',    icon: '🔠' },
  { type: 'instruction', label: 'Instruction', icon: '📌' },
  { type: 'paragraph',   label: 'Paragraph',   icon: '📝' },
  { type: 'image',       label: 'Image',       icon: '🖼️' },
  { type: 'divider',     label: 'Divider',     icon: '➖' },
];

const ExamBuilder: React.FC<{ examId: string; onBack: () => void; onPreview: (examId: string) => void }> = ({ examId, onBack, onPreview }) => {
  const [exam, setExam] = useState<ArabicExam | null>(null);
  const [items, setItems] = useState<ArabicExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQ, setEditingQ] = useState<ArabicExamItem | null>(null);
  const [addingQ, setAddingQ] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const [e, its] = await Promise.all([getExam(examId), getExamItems(examId)]);
    setExam(e);
    setItems(its);
    setLoading(false);
  }, [examId]);

  useEffect(() => { reload(); }, [reload]);

  // ── Settings ───────────────────────────────────────────────────────────────
  const saveSettings = async (patch: Partial<ArabicExam>) => {
    if (!exam) return;
    setExam({ ...exam, ...patch });
    await updateExam(exam.id, patch);
  };

  // ── Items ──────────────────────────────────────────────────────────────────
  const addTextItem = async (type: ArabicExamItemType) => {
    await createExamItem({ examId, itemType: type, content: type === 'divider' ? undefined : '' });
    reload();
  };

  const onAddClick = (type: ArabicExamItemType) => {
    if (type === 'question') { setAddingQ(true); return; }
    if (type === 'image') { fileRef.current?.click(); return; }
    addTextItem(type);
  };

  const onImageChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = await uploadExamImage(file);
    if (url) { await createExamItem({ examId, itemType: 'image', imageUrl: url }); reload(); }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    await reorderExamItems(next.map(i => i.id));
  };

  const removeItem = async (item: ArabicExamItem) => {
    if (!window.confirm('Delete this item?')) return;
    await deleteExamItem(item.id, examId);
    reload();
  };

  const saveContent = async (item: ArabicExamItem, content: string) => {
    if (content === (item.content ?? '')) return;
    await updateExamItem(item.id, { content }, examId);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, content } : i));
  };

  if (loading || !exam) return <div className="p-8 text-center text-slate-400">Loading exam…</div>;

  let qNum = 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-700">← Back to exams</button>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${exam.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-500 dark:bg-gray-700 dark:text-slate-400'}`}>
            {exam.status === 'published' ? 'Published' : 'Draft'}
          </span>
          <button onClick={() => onPreview(exam.id)} className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold">Preview</button>
          <button
            onClick={() => saveSettings({ status: exam.status === 'published' ? 'draft' : 'published' })}
            className={`px-3 py-1.5 rounded-lg text-white text-sm font-semibold ${exam.status === 'published' ? 'bg-slate-500 hover:bg-slate-600' : 'bg-green-600 hover:bg-green-700'}`}
          >{exam.status === 'published' ? 'Unpublish' : 'Publish'}</button>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-5 mb-6 space-y-4">
        <div>
          <label className={label}>Exam title</label>
          <input defaultValue={exam.title} onBlur={e => saveSettings({ title: e.target.value })} className={inp} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={label}>Level</label>
            <select value={exam.level} onChange={e => saveSettings({ level: Number(e.target.value) as 1|2|3 })} className={inp}>
              {[1,2,3].map(l => <option key={l} value={l}>Level {l}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Version</label>
            <select value={exam.version} onChange={e => saveSettings({ version: e.target.value as ArabicExam['version'] })} className={inp}>
              <option value="arabic">Arabic</option>
              <option value="transliteration">Transliteration</option>
            </select>
          </div>
          <div>
            <label className={label}>Time limit (min)</label>
            <input type="number" min={0} defaultValue={exam.timeLimitMinutes ?? ''} placeholder="None"
              onBlur={e => saveSettings({ timeLimitMinutes: e.target.value ? Number(e.target.value) : undefined })} className={inp} />
          </div>
          <div>
            <label className={label}>Pass %</label>
            <input type="number" min={0} max={100} defaultValue={exam.passingPercentage}
              onBlur={e => saveSettings({ passingPercentage: Number(e.target.value) })} className={inp} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Leaderboard names</label>
            <select value={exam.leaderboardPrivacy} onChange={e => saveSettings({ leaderboardPrivacy: e.target.value as ArabicExam['leaderboardPrivacy'] })} className={inp}>
              <option value="first_name">First name only</option>
              <option value="full">Full name</option>
              <option value="anonymous">Anonymous</option>
            </select>
          </div>
        </div>
        <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Total marks: {exam.totalMarks}</p>
      </div>

      {/* Add buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {ADD_BUTTONS.map(b => (
          <button key={b.type} onClick={() => onAddClick(b.type)}
            className="px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/50">
            {b.icon} {b.label}
          </button>
        ))}
      </div>

      {/* Add-question form */}
      {addingQ && (
        <ExamQuestionForm examId={examId} onDone={() => { setAddingQ(false); reload(); }} onCancel={() => setAddingQ(false)} />
      )}
      {editingQ && (
        <ExamQuestionForm examId={examId} existing={editingQ} onDone={() => { setEditingQ(null); reload(); }} onCancel={() => setEditingQ(null)} />
      )}

      {/* Items list */}
      <div className="space-y-3">
        {items.length === 0 && <p className="text-center text-slate-400 py-8">No items yet — use the buttons above to build the exam.</p>}
        {items.map((item, index) => {
          if (item.itemType === 'question') qNum++;
          return (
            <div key={item.id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-3 flex gap-3">
              {/* Reorder */}
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={() => move(index, -1)} disabled={index === 0} className="w-6 h-6 rounded bg-slate-100 dark:bg-gray-700 text-slate-500 disabled:opacity-30">▲</button>
                <button onClick={() => move(index, 1)} disabled={index === items.length - 1} className="w-6 h-6 rounded bg-slate-100 dark:bg-gray-700 text-slate-500 disabled:opacity-30">▼</button>
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {item.itemType === 'question' ? `Q${qNum} · ${QUESTION_TYPE_LABELS[item.questionType!]} · ${item.marks ?? 0} marks` : item.itemType}
                  </span>
                  <div className="flex gap-2">
                    {item.itemType === 'question' && (
                      <button onClick={() => setEditingQ(item)} className="text-xs font-semibold text-sky-600 hover:underline">Edit</button>
                    )}
                    <button onClick={() => removeItem(item)} className="text-xs font-semibold text-red-500 hover:underline">Delete</button>
                  </div>
                </div>

                {/* Editable content by type */}
                {item.itemType === 'divider' && <hr className="border-slate-200 dark:border-gray-700" />}
                {item.itemType === 'image' && item.imageUrl && (
                  <img src={item.imageUrl} alt="" className="max-h-40 rounded-lg border border-slate-200 dark:border-gray-700" />
                )}
                {(['section','headline','instruction','paragraph'] as ArabicExamItemType[]).includes(item.itemType) && (
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
                  <p className="text-sm text-slate-700 dark:text-slate-200" dir="auto">{item.content || <span className="text-slate-400">No prompt</span>}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Question add/edit form (with marks) ──────────────────────────────────────
const ExamQuestionForm: React.FC<{
  examId: string;
  existing?: ArabicExamItem;
  onDone: () => void;
  onCancel: () => void;
}> = ({ examId, existing, onDone, onCancel }) => {
  const isEdit = !!existing;
  const [type, setType] = useState<HomeworkQuestionType>(existing?.questionType ?? 'multiple_choice');
  const [question, setQuestion] = useState(existing?.content ?? '');
  const [options, setOptions] = useState<string[]>(existing?.options ?? ['', '', '', '']);
  const [correct, setCorrect] = useState(existing?.correctAnswer ?? '');
  const [marks, setMarks] = useState<number>(existing?.marks ?? 1);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const needsOptions = type === 'multiple_choice' || type === 'fill_blank_options';
  const isArabicAnswer = type === 'translate_to_arabic';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const q = question.trim();
    if (!q) { setErr('Question text is required.'); return; }
    let finalOptions: string[] | undefined;
    let finalCorrect = correct.trim();

    if (needsOptions) {
      finalOptions = options.map(o => o.trim());
      if (finalOptions.some(o => !o)) { setErr('Fill all options.'); return; }
      if (!finalCorrect || !finalOptions.includes(finalCorrect)) { setErr('Pick the correct option.'); return; }
    } else if (type === 'true_false') {
      if (!finalCorrect) { setErr('Choose True or False.'); return; }
    } else if (type === 'fill_blank') {
      if (!q.includes('___')) { setErr('Use ___ to mark the blank(s).'); return; }
      // correct answer optional (tutor-marked); store if provided
    } else {
      if (!finalCorrect) { setErr('Provide the correct answer.'); return; }
    }
    if (!marks || marks < 0) { setErr('Marks must be 0 or more.'); return; }

    setSaving(true);
    if (isEdit && existing) {
      await updateExamItem(existing.id, {
        content: q, questionType: type, options: needsOptions ? finalOptions : undefined,
        correctAnswer: finalCorrect || undefined, marks,
      }, examId);
    } else {
      await createExamItem({
        examId, itemType: 'question', content: q, questionType: type,
        options: needsOptions ? finalOptions : undefined, correctAnswer: finalCorrect || undefined, marks,
      });
    }
    setSaving(false);
    onDone();
  };

  return (
    <form onSubmit={submit} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-4 mb-4">
      <h3 className="font-bold text-amber-800 dark:text-amber-300">{isEdit ? 'Edit question' : 'New question'}</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Type</label>
          <select value={type} onChange={e => setType(e.target.value as HomeworkQuestionType)} disabled={isEdit} className={inp}>
            {(Object.entries(QUESTION_TYPE_LABELS) as [HomeworkQuestionType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Marks</label>
          <input type="number" min={0} value={marks} onChange={e => setMarks(Number(e.target.value))} className={inp} />
        </div>
      </div>

      <div>
        <label className={label}>{type === 'translate_to_english' ? 'Arabic text to translate' : type === 'fill_blank' ? 'Question (use ___ for blanks)' : 'Question / Statement'}</label>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2} dir="auto" className={inp} />
      </div>

      {needsOptions && (
        <div>
          <label className={label}>Options — click the dot to mark the correct one</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button type="button" onClick={() => setCorrect(opt)}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${correct === opt && opt.trim() ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}>
                  {correct === opt && opt.trim() && '✓'}
                </button>
                <span className="text-xs font-bold text-slate-500 w-5">{String.fromCharCode(65 + i)}.</span>
                <input value={opt} onChange={e => {
                  const prev = opt;
                  setOptions(options.map((o, j) => j === i ? e.target.value : o));
                  if (correct === prev) setCorrect(e.target.value);
                }} dir={isArabicAnswer ? 'rtl' : 'ltr'} placeholder={`Option ${String.fromCharCode(65 + i)}`} className={`flex-1 ${inp}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {type === 'true_false' && (
        <div>
          <label className={label}>Correct answer</label>
          <div className="flex gap-3">
            {['True','False'].map(v => (
              <button key={v} type="button" onClick={() => setCorrect(v)}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold ${correct === v ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300'}`}>{v}</button>
            ))}
          </div>
        </div>
      )}

      {!needsOptions && type !== 'true_false' && (
        <div>
          <label className={label}>Correct answer {type === 'fill_blank' && <span className="normal-case font-normal text-slate-400">(optional — tutor marks)</span>}</label>
          <input value={correct} onChange={e => setCorrect(e.target.value)} dir={isArabicAnswer ? 'rtl' : 'ltr'} placeholder="Correct answer…" className={inp} />
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

export default ExamBuilder;
