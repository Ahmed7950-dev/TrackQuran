// components/TajweedLessonViewer.tsx
// -----------------------------------------------------------------------------
// Full-screen PDF viewer using PDF.js.
// Each page is rendered to a <canvas> — no browser toolbar, no download button.
// Tutors navigate with Prev / Next buttons and can mark lessons done per student.
// -----------------------------------------------------------------------------

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — Vite ?url import gives the bundled worker path, no CDN needed
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Student, TajweedLesson } from '../types';
import { markLessonCompleted, unmarkLessonCompleted, getCompletedLessonIds } from '../services/tajweedService';

// Point PDF.js at the locally-bundled worker (no CDN, always matches the package version)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface Props {
  lesson: TajweedLesson;
  students: Student[];
  tutorId: string;
  onClose: () => void;
}

const TajweedLessonViewer: React.FC<Props> = ({ lesson, students, tutorId, onClose }) => {
  // ── PDF state ──────────────────────────────────────────────────────────────
  const canvasRef                           = useRef<HTMLCanvasElement>(null);
  const containerRef                        = useRef<HTMLDivElement>(null);
  const renderTaskRef                       = useRef<pdfjsLib.RenderTask | null>(null);
  const [pdfDoc,       setPdfDoc]           = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum,      setPageNum]          = useState(1);
  const [totalPages,   setTotalPages]       = useState(0);
  const [loadingPdf,   setLoadingPdf]       = useState(true);
  const [pdfError,     setPdfError]         = useState('');

  // ── Completion state ───────────────────────────────────────────────────────
  const [completedIds,       setCompletedIds]       = useState<Set<string>>(new Set());
  const [selectedStudentId,  setSelectedStudentId]  = useState('');
  const [marking,            setMarking]            = useState(false);

  // ── Load PDF ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lesson.pdfUrl) { setPdfError('No PDF attached to this lesson.'); setLoadingPdf(false); return; }
    setLoadingPdf(true);
    setPdfError('');

    const load = async () => {
      try {
        // Fetch the PDF as binary first — this uses the browser's normal fetch
        // (which handles CORS correctly for public Supabase storage) and then
        // passes the raw data to PDF.js so it never makes its own network request.
        const response = await fetch(lesson.pdfUrl!);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();

        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setPageNum(1);
      } catch (err) {
        console.error('PDF load error:', err);
        setPdfError('Failed to load PDF. Please try again.');
      } finally {
        setLoadingPdf(false);
      }
    };
    load();
  }, [lesson.pdfUrl]);

  // ── Render current page ────────────────────────────────────────────────────
  const renderPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, num: number) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Cancel any in-progress render
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
      renderTaskRef.current = null;
    }

    const page = await doc.getPage(num);

    // Scale to fit the container width, max 2x device pixel ratio for sharpness
    const dpr = window.devicePixelRatio || 1;
    const containerW = container.clientWidth;
    const viewport = page.getViewport({ scale: 1 });
    const scale = (containerW / viewport.width) * dpr;
    const scaledViewport = page.getViewport({ scale });

    canvas.width  = scaledViewport.width;
    canvas.height = scaledViewport.height;
    canvas.style.width  = `${scaledViewport.width  / dpr}px`;
    canvas.style.height = `${scaledViewport.height / dpr}px`;

    const ctx = canvas.getContext('2d')!;
    const task = page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: scaledViewport, canvas });
    renderTaskRef.current = task;
    try {
      await task.promise;
    } catch (e: unknown) {
      // RenderingCancelledException is expected when we cancel — ignore it
      if (e instanceof Error && e.name !== 'RenderingCancelledException') {
        console.error('Render error:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (pdfDoc) renderPage(pdfDoc, pageNum);
  }, [pdfDoc, pageNum, renderPage]);

  // Re-render on container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pdfDoc) return;
    const ro = new ResizeObserver(() => renderPage(pdfDoc, pageNum));
    ro.observe(container);
    return () => ro.disconnect();
  }, [pdfDoc, pageNum, renderPage]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        setPageNum(n => Math.min(totalPages, n + 1));
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPageNum(n => Math.max(1, n - 1));
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPages, onClose]);

  // ── Completion ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedStudentId) return;
    getCompletedLessonIds(selectedStudentId).then(ids => setCompletedIds(ids));
  }, [selectedStudentId]);

  const isCompleted = selectedStudentId ? completedIds.has(lesson.id) : false;

  const handleMark = async () => {
    if (!selectedStudentId || marking) return;
    setMarking(true);
    if (isCompleted) {
      const ok = await unmarkLessonCompleted(selectedStudentId, lesson.id);
      if (ok) setCompletedIds(prev => { const s = new Set(prev); s.delete(lesson.id); return s; });
    } else {
      const ok = await markLessonCompleted(selectedStudentId, lesson.id, tutorId);
      if (ok) setCompletedIds(prev => new Set([...prev, lesson.id]));
    }
    setMarking(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col select-none">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 bg-gray-800 border-b border-gray-700 flex-shrink-0">

        {/* Close */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex-shrink-0"
          title="Close (Esc)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white text-sm sm:text-base truncate">{lesson.title}</h2>
          {totalPages > 0 && (
            <p className="text-xs text-gray-400">Page {pageNum} of {totalPages}</p>
          )}
        </div>

        {/* Student selector */}
        {students.length > 0 && (
          <select
            value={selectedStudentId}
            onChange={e => setSelectedStudentId(e.target.value)}
            className="px-2 sm:px-3 py-1.5 bg-gray-700 text-gray-200 text-sm rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 max-w-[130px] sm:max-w-[180px]"
          >
            <option value="">Select student…</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        {/* Mark done button */}
        {selectedStudentId && (
          <button
            onClick={handleMark}
            disabled={marking}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 ${
              isCompleted
                ? 'bg-green-600 text-white hover:bg-red-600'
                : 'bg-teal-600 text-white hover:bg-teal-700'
            }`}
            title={isCompleted ? 'Click to unmark' : 'Mark as done'}
          >
            {marking ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
            <span className="hidden sm:inline">{isCompleted ? 'Done ✓' : 'Mark Done'}</span>
          </button>
        )}
      </div>

      {/* ── PDF canvas area ── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto flex items-start justify-center bg-gray-700 py-4 px-2"
      >
        {loadingPdf && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-300">
            <svg className="animate-spin w-10 h-10" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
            </svg>
            <span className="text-sm">Loading PDF…</span>
          </div>
        )}

        {pdfError && !loadingPdf && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 opacity-60">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <p className="text-sm font-medium">{pdfError}</p>
          </div>
        )}

        {!loadingPdf && !pdfError && (
          <canvas
            ref={canvasRef}
            className="shadow-2xl rounded"
            style={{ display: 'block', maxWidth: '100%' }}
          />
        )}
      </div>

      {/* ── Bottom navigation bar ── */}
      {!loadingPdf && !pdfError && totalPages > 0 && (
        <div className="flex items-center justify-center gap-4 px-4 py-3 bg-gray-800 border-t border-gray-700 flex-shrink-0">

          {/* Previous */}
          <button
            onClick={() => setPageNum(n => Math.max(1, n - 1))}
            disabled={pageNum <= 1}
            className="flex items-center gap-2 px-5 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Previous
          </button>

          {/* Page counter */}
          <span className="text-gray-300 text-sm font-medium tabular-nums min-w-[80px] text-center">
            {pageNum} / {totalPages}
          </span>

          {/* Next */}
          <button
            onClick={() => setPageNum(n => Math.min(totalPages, n + 1))}
            disabled={pageNum >= totalPages}
            className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>

        </div>
      )}
    </div>
  );
};

export default TajweedLessonViewer;
