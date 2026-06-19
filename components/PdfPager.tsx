// components/PdfPager.tsx
// ---------------------------------------------------------------------------
// Self-contained PDF.js page viewer: renders one page at a time to a canvas,
// fits it to the container width, and exposes prev/next navigation plus the
// current page / total page count. Used by TajweedLessonViewer so lessons can
// be presented slide-by-slide and the current slide can be tracked/resumed.
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves ?url to a hashed asset path; PDF.js needs a worker URL.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

interface Props {
  url: string;
  /** 1-based page to open on (resume position). */
  initialPage?: number;
  /** Fired whenever the visible page or the total page count changes. */
  onPageChange?: (page: number, total: number) => void;
  className?: string;
}

const PdfPager: React.FC<Props> = ({ url, initialPage = 1, onPageChange, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const docRef       = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const pageRef      = useRef(1);            // latest page (avoids stale closures)
  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => { onPageChangeRef.current = onPageChange; }, [onPageChange]);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage]         = useState(initialPage);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // Render a given page number, fitting the canvas to the container width.
  const renderPage = useCallback(async (n: number) => {
    const doc = docRef.current, canvas = canvasRef.current, container = containerRef.current;
    if (!doc || !canvas || !container) return;
    try {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* noop */ } }
      const pdfPage = await doc.getPage(n);
      const unscaled = pdfPage.getViewport({ scale: 1 });
      const avail = container.clientWidth - 24; // padding allowance
      const scale = Math.max(0.2, avail / unscaled.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width  = Math.floor(viewport.width  * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width  = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderTaskRef.current = pdfPage.render({ canvasContext: ctx, viewport });
      await renderTaskRef.current.promise;
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') console.error('PdfPager render:', e?.message ?? e);
    }
  }, []);

  // Load the document once per url.
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setNumPages(0);
    const task = pdfjsLib.getDocument({
      url,
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
    });
    task.promise.then(async (doc: any) => {
      if (cancelled) return;
      docRef.current = doc;
      setNumPages(doc.numPages);
      const start = Math.min(Math.max(1, initialPage), doc.numPages);
      pageRef.current = start;
      setPage(start);
      setLoading(false);
      onPageChangeRef.current?.(start, doc.numPages);
      await renderPage(start);
    }).catch((e: any) => {
      if (cancelled) return;
      console.error('PdfPager load:', e?.message ?? e);
      setError('Failed to load PDF.');
      setLoading(false);
    });
    return () => {
      cancelled = true;
      try { task.destroy?.(); } catch { /* noop */ }
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Re-render on page change.
  useEffect(() => {
    if (!loading && docRef.current) renderPage(page);
  }, [page, loading, renderPage]);

  // Re-fit on container resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (docRef.current) renderPage(pageRef.current); });
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [renderPage]);

  const go = (n: number) => {
    const clamped = Math.min(Math.max(1, n), numPages || 1);
    pageRef.current = clamped;
    setPage(clamped);
    onPageChangeRef.current?.(clamped, numPages);
  };

  return (
    <div className={`relative flex flex-col h-full w-full bg-gray-700 ${className ?? ''}`}>
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-300 z-10 bg-gray-700">
          <svg className="animate-spin w-10 h-10" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
          <span className="text-sm">Loading PDF…</span>
        </div>
      )}
      {error && <p className="absolute z-10 inset-0 flex items-center justify-center text-red-400 text-sm px-6 text-center">{error}</p>}

      {/* Scrollable page area */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto flex items-start justify-center p-3">
        {!error && <canvas ref={canvasRef} className="shadow-lg bg-white" />}
      </div>

      {/* Page navigation */}
      {!error && numPages > 0 && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 px-3 py-2 bg-gray-800 border-t border-gray-700 select-none">
          <button onClick={() => go(page - 1)} disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg bg-gray-700 text-gray-200 text-sm font-semibold hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
            ‹ Prev
          </button>
          <span className="text-sm font-semibold text-gray-200 tabular-nums">{page} / {numPages}</span>
          <button onClick={() => go(page + 1)} disabled={page >= numPages}
            className="px-3 py-1.5 rounded-lg bg-gray-700 text-gray-200 text-sm font-semibold hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
            Next ›
          </button>
        </div>
      )}
    </div>
  );
};

export default PdfPager;
