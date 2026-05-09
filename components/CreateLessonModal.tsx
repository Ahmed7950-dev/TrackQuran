// components/CreateLessonModal.tsx
// -----------------------------------------------------------------------------
// Admin-only modal: takes a title + optional description, creates an empty
// lesson with one blank slide, and hands the new lesson to the parent so the
// editor opens immediately.
// -----------------------------------------------------------------------------

import React, { useState } from 'react';
import { Slide, TajweedLesson } from '../types';
import { createLesson } from '../services/tajweedService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (lesson: TajweedLesson) => void;
}

const CreateLessonModal: React.FC<Props> = ({ isOpen, onClose, onCreated }) => {
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [saving, setSaving]     = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const reset = () => { setTitle(''); setDesc(''); setSaving(false); setErrorMsg(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!title.trim()) { setErrorMsg('Please enter a lesson title.'); return; }

    setSaving(true);
    const blankSlide: Slide = {
      id: `slide-${Date.now()}`,
      background: '#ffffff',
      elements: [{
        type: 'text',
        id:   `el-${Date.now()}`,
        x: 60, y: 280, w: 1160, h: 160,
        text: title.trim(),
        fontSize: 64, color: '#0f766e', bold: true, align: 'center',
      }],
    };
    const lesson = await createLesson({
      title:       title.trim(),
      description: description.trim() || undefined,
      slides:      [blankSlide],
    });
    setSaving(false);

    if (!lesson) { setErrorMsg('Failed to create lesson. Check your connection.'); return; }
    onCreated(lesson);
    handleClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={saving ? undefined : handleClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Create New Lesson</h2>
          {!saving && (
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
              disabled={saving} autoFocus
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
              disabled={saving} rows={2}
              placeholder="Short summary shown to tutors in the lesson list."
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>

          <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-3 text-sm text-teal-800 dark:text-teal-200">
            A blank slide with your title will be created. You'll then be taken to the editor where you can add text, images, and more slides.
          </div>

          {errorMsg && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {errorMsg}
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
            >{saving ? 'Creating…' : 'Create & Open Editor'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateLessonModal;
