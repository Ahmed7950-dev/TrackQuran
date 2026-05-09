// components/CreateLessonModal.tsx
// -----------------------------------------------------------------------------
// Admin-only modal: create a new lesson or edit an existing one.
// Uploads a PDF to the tajweed-assets bucket, then saves the lesson.
// -----------------------------------------------------------------------------

import React, { useRef, useState } from 'react';
import { TajweedLesson } from '../types';
import { createLesson, updateLesson, uploadLessonPdf } from '../services/tajweedService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Pass an existing lesson to enter edit mode */
  existing?: TajweedLesson;
  onCreated?: (lesson: TajweedLesson) => void;
  onUpdated?: (lesson: TajweedLesson) => void;
}

const CreateLessonModal: React.FC<Props> = ({ isOpen, onClose, existing, onCreated, onUpdated }) => {
  const isEdit = !!existing;

  const [title,    setTitle]    = useState(existing?.title       ?? '');
  const [desc,     setDesc]     = useState(existing?.description ?? '');
  const [file,     setFile]     = useState<File | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => { setTitle(''); setDesc(''); setFile(null); setSaving(false); setErrorMsg(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') { setErrorMsg('Please select a PDF file.'); return; }
    if (f.size > 50 * 1024 * 1024) { setErrorMsg('PDF must be under 50 MB.'); return; }
    setErrorMsg('');
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!title.trim()) { setErrorMsg('Please enter a lesson title.'); return; }
    if (!isEdit && !file) { setErrorMsg('Please upload a PDF file.'); return; }

    setSaving(true);

    // Upload PDF if a new file was chosen
    let pdfUrl = existing?.pdfUrl;
    if (file) {
      const url = await uploadLessonPdf(file);
      if (!url) { setErrorMsg('Failed to upload PDF. Check storage permissions.'); setSaving(false); return; }
      pdfUrl = url;
    }

    if (isEdit && existing) {
      // Update mode
      const ok = await updateLesson(existing.id, {
        title:       title.trim(),
        description: desc.trim() || undefined,
        pdfUrl,
      });
      setSaving(false);
      if (!ok) { setErrorMsg('Failed to save changes. Please try again.'); return; }
      onUpdated?.({ ...existing, title: title.trim(), description: desc.trim() || undefined, pdfUrl });
      handleClose();
    } else {
      // Create mode
      const lesson = await createLesson({
        title:       title.trim(),
        description: desc.trim() || undefined,
        pdfUrl,
      });
      setSaving(false);
      if (!lesson) { setErrorMsg('Failed to create lesson. Check your connection.'); return; }
      onCreated?.(lesson);
      handleClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4"
      onClick={saving ? undefined : handleClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {isEdit ? 'Edit Lesson' : 'Upload New Lesson'}
          </h2>
          {!saving && (
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Lesson Title
            </label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              disabled={saving} autoFocus
              placeholder="e.g. Rules of Noon Sakinah"
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={desc} onChange={e => setDesc(e.target.value)}
              disabled={saving} rows={2}
              placeholder="Short summary shown to tutors in the lesson list."
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          {/* PDF upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              PDF File {isEdit && <span className="text-xs font-normal text-slate-400">(leave empty to keep current)</span>}
            </label>
            <input
              ref={fileRef} type="file" accept="application/pdf"
              onChange={handleFileChange} disabled={saving}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={saving}
              className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-gray-600 rounded-lg hover:border-teal-500 dark:hover:border-teal-400 transition-colors text-left"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                className={`w-8 h-8 flex-shrink-0 ${file ? 'text-teal-600' : 'text-slate-400'}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <div className="min-w-0">
                {file ? (
                  <>
                    <p className="text-sm font-semibold text-teal-700 dark:text-teal-300 truncate">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </>
                ) : existing?.pdfUrl ? (
                  <>
                    <p className="text-sm text-slate-600 dark:text-slate-300">Current PDF attached — click to replace</p>
                    <p className="text-xs text-slate-400">Max 50 MB</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-600 dark:text-slate-300">Click to choose a PDF file</p>
                    <p className="text-xs text-slate-400">Max 50 MB</p>
                  </>
                )}
              </div>
            </button>
          </div>

          {errorMsg && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {saving && (
            <div className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-300">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
              </svg>
              {file ? 'Uploading PDF…' : 'Saving…'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button" onClick={handleClose} disabled={saving}
              className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500 disabled:opacity-50"
            >Cancel</button>
            <button
              type="submit" disabled={saving}
              className="px-6 py-2 bg-teal-600 text-white font-semibold rounded-md shadow-sm hover:bg-teal-700 disabled:opacity-50 disabled:cursor-wait"
            >{saving ? '…' : isEdit ? 'Save Changes' : 'Upload Lesson'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateLessonModal;
