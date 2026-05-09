// components/PdfUploadModal.tsx
// -----------------------------------------------------------------------------
// Admin-only modal that:
//   1. Accepts a lesson title + PDF file
//   2. Uploads PDF to Supabase Storage (public URL)
//   3. Calls the parse-pdf-to-slides Edge Function
//   4. Saves the resulting lesson to `tajweed_lessons`
//   5. Returns the new lesson id to the parent so it can open the editor
// -----------------------------------------------------------------------------

import React, { useState } from 'react';
import { TajweedLesson } from '../types';
import { uploadPdf, generateSlidesFromPdf, createLesson } from '../services/tajweedService';

type Stage = 'idle' | 'uploading' | 'parsing' | 'saving' | 'done' | 'error';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (lesson: TajweedLesson) => void;
}

const PdfUploadModal: React.FC<Props> = ({ isOpen, onClose, onCreated }) => {
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [file, setFile]         = useState<File | null>(null);
  const [stage, setStage]       = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const reset = () => {
    setTitle(''); setDesc(''); setFile(null);
    setStage('idle'); setErrorMsg('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim()) { setErrorMsg('Please enter a lesson title.'); return; }
    if (!file)         { setErrorMsg('Please choose a PDF file.');     return; }
    if (file.type !== 'application/pdf') { setErrorMsg('Only PDF files are supported.'); return; }

    try {
      setStage('uploading');
      const pdfUrl = await uploadPdf(file);
      if (!pdfUrl) throw new Error('PDF upload failed');

      setStage('parsing');
      const result = await generateSlidesFromPdf(pdfUrl, title.trim());
      if ('error' in result) throw new Error(result.error);
      if (!result.slides.length) throw new Error('AI returned no slides');

      setStage('saving');
      const lesson = await createLesson({
        title:       title.trim(),
        description: description.trim() || undefined,
        pdfUrl,
        slides:      result.slides,
      });
      if (!lesson) throw new Error('Saving lesson failed');

      setStage('done');
      onCreated(lesson);
      handleClose();
    } catch (err) {
      setStage('error');
      setErrorMsg((err as Error).message);
    }
  };

  const busy = stage === 'uploading' || stage === 'parsing' || stage === 'saving';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={busy ? undefined : handleClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Create Tajweed Lesson</h2>
          {!busy && (
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Lesson Title</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              disabled={busy}
              placeholder="e.g. Rules of Noon Sakinah"
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={description} onChange={e => setDesc(e.target.value)}
              disabled={busy} rows={2}
              placeholder="Short summary shown to tutors in the lesson list."
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PDF File</label>
            <label className={`relative flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer transition ${
              busy ? 'opacity-50 cursor-not-allowed border-slate-300' : 'border-teal-300 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-teal-500">
                <path d="M9 17V8.5l-2.5 2.5L5 9.5 10 4.5 15 9.5 13.5 11 11 8.5V17H9zM5 21v-2h14v2H5z" />
              </svg>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {file ? file.name : 'Click to select a PDF'}
              </span>
              {file && (
                <span className="text-xs text-slate-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
              <input
                type="file" accept="application/pdf" disabled={busy}
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </label>
          </div>

          {/* Status indicator */}
          {stage !== 'idle' && stage !== 'error' && (
            <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-3 text-sm text-teal-800 dark:text-teal-200 flex items-center gap-3">
              <svg className="animate-spin w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4zm2 5.3A8 8 0 014 12H0c0 3 1.1 5.8 3 7.9l3-2.6z"></path>
              </svg>
              <span>
                {stage === 'uploading' && 'Uploading PDF to storage…'}
                {stage === 'parsing'   && 'AI is reading the PDF and creating slides… (15-60s)'}
                {stage === 'saving'    && 'Saving lesson…'}
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button" onClick={handleClose} disabled={busy}
              className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500 disabled:opacity-50"
            >Cancel</button>
            <button
              type="submit" disabled={busy}
              className="px-6 py-2 bg-teal-600 text-white font-semibold rounded-md shadow-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-wait"
            >{busy ? 'Working…' : 'Create with AI'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PdfUploadModal;
