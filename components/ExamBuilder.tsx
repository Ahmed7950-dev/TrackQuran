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

// All types shown in the items list (includes legacy fill_blank_options)
const QUESTION_TYPE_LABELS: Partial<Record<HomeworkQuestionType, string>> = {
  multiple_choice:      'Multiple Choice',
  true_false:           'True / False',
  translate_to_arabic:  'Translate → Arabic',
  translate_to_english: 'Translate → English',
  fill_blank:           'Fill in the Blank',
  fill_blank_options:   'Fill in the Blank (choices)',
  short_answer:         'Short Answer',
  matching:             'Word Matching',
  multi_answer:         'Multi-Word Answer',
};

// Types shown in the add/edit dropdown (no legacy fill_blank_options)
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

const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';
const lbl = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide';

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
  const dragIdx = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const [e, its] = await Promise.all([getExam(examId), getExamItems(examId)]);
    setExam(e);
    setItems(its);
    setLoading(false);
  }, [examId]);

  useEffect(() => { reload(); }, [reload]);

  const saveSettings = async (patch: Partial<ArabicExam>) => {
    if (!exam) return;
    setExam({ ...exam, ...patch });
    await updateExam(exam.id, patch);
  };

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
        {/* Level + version — display only, set at creation */}
        <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-gray-700/60 rounded-lg">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Level {exam.level}</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {exam.version === 'arabic' ? 'Arabic' : 'Transliteration'}
          </span>
          <span className="text-xs text-slate-400 ml-auto">set at creation</span>
        </div>

        <div>
          <label className={lbl}>Exam title</label>
          <input defaultValue={exam.title} onBlur={e => saveSettings({ title: e.target.value })} className={inp} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Time limit (min)</label>
            <input type="number" min={0} defaultValue={exam.timeLimitMinutes ?? ''} placeholder="None"
              onBlur={e => saveSettings({ timeLimitMinutes: e.target.value ? Number(e.target.value) : undefined })} className={inp} />
          </div>
          <div>
            <label className={lbl}>Pass %</label>
            <input type="number" min={0} max={100} defaultValue={exam.passingPercentage}
              onBlur={e => saveSettings({ passingPercentage: Number(e.target.value) })} className={inp} />
          </div>
        </div>

        <div>
          <label className={lbl}>Leaderboard names</label>
          <select value={exam.leaderboardPrivacy} onChange={e => saveSettings({ leaderboardPrivacy: e.target.value as ArabicExam['leaderboardPrivacy'] })} className={inp}>
            <option value="first_name">First name only</option>
            <option value="full">Full name</option>
            <option value="anonymous">Anonymous</option>
          </select>
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

      {/* Add/edit question form */}
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
              {/* Drag handle */}
              <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 select-none text-xl flex items-center px-0.5" title="Drag to reorder">
                ⠿
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {item.itemType === 'question'
                      ? `Q${qNum} · ${QUESTION_TYPE_LABELS[item.questionType!] ?? item.questionType} · ${item.marks ?? 0} marks`
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
                  <p className="text-sm text-slate-700 dark:text-slate-200" dir="auto">
                    {item.content || <span className="text-slate-400">No prompt</span>}
                    {item.questionType === 'matching' && item.correctAnswer && (() => {
                      try {
                        const pairs: [string, string][] = JSON.parse(item.correctAnswer);
                        return <span className="ml-2 text-xs text-slate-400">({pairs.length} pairs)</span>;
                      } catch { return null; }
                    })()}
                    {item.questionType === 'multi_answer' && item.options && item.options.length > 0 && (
                      <span className="ml-2 text-xs text-slate-400">({item.options.length} words)</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Question add/edit form ────────────────────────────────────────────────────
const ExamQuestionForm: React.FC<{
  examId: string;
  existing?: ArabicExamItem;
  onDone: () => void;
  onCancel: () => void;
}> = ({ examId, existing, onDone, onCancel }) => {
  const isEdit = !!existing;

  const [type, setType] = useState<HomeworkQuestionType>(
    existing?.questionType === 'fill_blank_options' ? 'fill_blank' : (existing?.questionType ?? 'multiple_choice'),
  );
  const [question, setQuestion] = useState(existing?.content ?? '');
  const [options, setOptions] = useState<string[]>(existing?.options ?? ['', '', '', '']);
  const [correct, setCorrect] = useState(existing?.correctAnswer ?? '');
  const [marks, setMarks] = useState<number>(existing?.marks ?? 1);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  // fill_blank: show optional choices
  const [showChoices, setShowChoices] = useState(
    existing?.questionType === 'fill_blank_options' ||
    (existing?.questionType === 'fill_blank' && (existing.options?.length ?? 0) > 0),
  );

  // matching: list of {left, right} pairs
  const [pairs, setPairs] = useState<{ left: string; right: string }[]>(() => {
    if ((existing?.questionType === 'matching') && existing.correctAnswer) {
      try {
        return (JSON.parse(existing.correctAnswer) as [string, string][]).map(([l, r]) => ({ left: l, right: r }));
      } catch { /* fall through */ }
    }
    return [{ left: '', right: '' }, { left: '', right: '' }];
  });

  const isArabicAnswer = type === 'translate_to_arabic';

  const handleTypeChange = (newType: HomeworkQuestionType) => {
    setType(newType);
    setShowChoices(false);
    setCorrect('');
    if (newType === 'multi_answer') {
      setOptions(['', '']);
    } else if (newType === 'multiple_choice') {
      setOptions(['', '', '', '']);
    } else if (newType === 'fill_blank') {
      setOptions(['', '', '']);
    }
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
      // correct answer is optional for fill_blank (tutor marks)
    } else if (type === 'matching') {
      const validPairs = pairs.filter(p => p.left.trim() && p.right.trim());
      if (validPairs.length < 2) { setErr('Add at least 2 complete pairs.'); return; }
      finalCorrect = JSON.stringify(validPairs.map(p => [p.left.trim(), p.right.trim()]));
      finalOptions = undefined;
    } else if (type === 'short_answer') {
      finalCorrect = '';
    } else if (type === 'multi_answer') {
      finalOptions = options.filter(o => o.trim());
      if (finalOptions.length < 1) { setErr('Add at least one word.'); return; }
      finalCorrect = '';
    } else {
      // translate_to_arabic / translate_to_english
      if (!finalCorrect) { setErr('Provide the correct answer.'); return; }
    }

    if (marks < 0) { setErr('Marks must be 0 or more.'); return; }

    setSaving(true);
    const payload = {
      content: q,
      questionType: type,
      options: finalOptions,
      correctAnswer: finalCorrect || undefined,
      marks,
    };
    if (isEdit && existing) {
      await updateExamItem(existing.id, payload, examId);
    } else {
      await createExamItem({ examId, itemType: 'question', ...payload });
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
          <select
            value={type}
            onChange={e => handleTypeChange(e.target.value as HomeworkQuestionType)}
            disabled={isEdit}
            className={inp}
          >
            {ADMIN_QUESTION_TYPES.map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl}>Marks</label>
          <input type="number" min={0} value={marks} onChange={e => setMarks(Number(e.target.value))} className={inp} />
        </div>
      </div>

      {/* Question text */}
      <div>
        <label className={lbl}>
          {type === 'translate_to_english' ? 'Arabic text to translate'
            : type === 'fill_blank' ? 'Question (use ___ for each blank)'
            : type === 'matching' ? 'Question / instruction (optional)'
            : 'Question / statement'}
        </label>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2} dir="auto" className={inp} />
      </div>

      {/* Multiple choice options */}
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
                <input
                  value={opt}
                  onChange={e => {
                    const prev = opt;
                    setOptions(options.map((o, j) => j === i ? e.target.value : o));
                    if (correct === prev) setCorrect(e.target.value);
                  }}
                  dir={isArabicAnswer ? 'rtl' : 'ltr'}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className={`flex-1 ${inp}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* True / False */}
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

      {/* Fill in the blank: optional choices */}
      {type === 'fill_blank' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={lbl + ' mb-0'}>Choices (optional)</label>
            <button type="button"
              onClick={() => { setShowChoices(!showChoices); setOptions(['', '', '']); }}
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
                    <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setOptions([...options, ''])}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">+ Add choice</button>
            </div>
          )}
        </div>
      )}

      {/* Matching pairs */}
      {type === 'matching' && (
        <div>
          <label className={lbl}>Word pairs</label>
          <div className="space-y-2">
            {pairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={pair.left}
                  onChange={e => setPairs(ps => ps.map((p, j) => j === i ? { ...p, left: e.target.value } : p))}
                  dir="auto" placeholder="Word / phrase" className={`flex-1 ${inp}`} />
                <span className="text-slate-400 flex-shrink-0">↔</span>
                <input value={pair.right}
                  onChange={e => setPairs(ps => ps.map((p, j) => j === i ? { ...p, right: e.target.value } : p))}
                  dir="auto" placeholder="Matching word" className={`flex-1 ${inp}`} />
                {pairs.length > 2 && (
                  <button type="button" onClick={() => setPairs(ps => ps.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 text-lg leading-none flex-shrink-0">×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setPairs(ps => [...ps, { left: '', right: '' }])}
            className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">+ Add pair</button>
        </div>
      )}

      {/* Short answer info */}
      {type === 'short_answer' && (
        <p className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-gray-700 rounded-lg px-3 py-2 border border-slate-200 dark:border-gray-600">
          Student types a free-text answer. Tutor marks manually.
        </p>
      )}

      {/* Multi-word answer — list of words the student must answer individually */}
      {type === 'multi_answer' && (
        <div>
          <label className={lbl}>Words — student writes an answer next to each</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 w-5">{i + 1}.</span>
                <input
                  value={opt}
                  onChange={e => setOptions(options.map((o, j) => j === i ? e.target.value : o))}
                  dir="auto"
                  placeholder={`Word ${i + 1}`}
                  className={`flex-1 ${inp}`}
                />
                {options.length > 1 && (
                  <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setOptions([...options, ''])}
            className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">+ Add word</button>
          <p className="mt-2 text-xs text-slate-400">Tutor marks each answer manually.</p>
        </div>
      )}

      {/* Correct answer field — for translate types and optional for fill_blank */}
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
          <input value={correct} onChange={e => setCorrect(e.target.value)}
            dir="auto" placeholder="Model answer…" className={inp} />
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
