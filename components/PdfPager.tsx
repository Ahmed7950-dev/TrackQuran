import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

interface Props {
  url: string;
  initialPage?: number;
  onPageChange?: (page: number, total: number) => void;
  className?: string;
  /** 'width' (default) — scale to container width, allow vertical scroll.
   *  'contain'          — scale to fit both width AND height, no scroll. */
  fitMode?: 'width' | 'contain';
  /** Show a horizontal strip of numbered page buttons for quick navigation. */
  pageStrip?: boolean;
}

const PdfPager: React.FC<Props> = ({
  url, initialPage = 1, onPageChange, className,
  fitMode = 'width', pageStrip = false,
}) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const stripRef      = useRef<HTMLDivElement>(null);
  const docRef        = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const pageRef       = useRef(1);
  const fitModeRef    = useRef(fitMode);
  const onPageChangeRef = useRef(onPageChange);

  useEffect(() => { onPageChangeRef.current = onPageChange; }, [onPageChange]);
  useEffect(() => { fitModeRef.current = fitMode; }, [fitMode]);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage]         = useState(initialPage);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const renderPage = useCallback(async (n: number) => {
    const doc = docRef.current, canvas = canvasRef.current, container = containerRef.current;
    if (!doc || !canvas || !container) return;
    try {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* noop */ } }
      const pdfPage  = await doc.getPage(n);
      const unscaled = pdfPage.getViewport({ scale: 1 });
      const padding  = 24;
      const availW   = container.clientWidth  - padding;
      const availH   = fitModeRef.current === 'contain'
        ? container.clientHeight - padding
        : Infinity;
      const scale    = Math.max(0.2, Math.min(availW / unscaled.width, availH / unscaled.height));
      const dpr      = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale });
      const ctx      = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width        = Math.floor(viewport.width  * dpr);
      canvas.height       = Math.floor(viewport.height * dpr);
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

  // Re-render on page or fitMode change.
  useEffect(() => {
    if (!loading && docRef.current) renderPage(page);
  }, [page, loading, fitMode, renderPage]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Auto-scroll the strip to keep the active page button visible.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const btn = strip.querySelector(`[data-page="${page}"]`) as HTMLElement | null;
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [page]);

  const go = (n: number) => {
    const clamped = Math.min(Math.max(1, n), numPages || 1);
    pageRef.current = clamped;
    setPage(clamped);
    onPageChangeRef.current?.(clamped, numPages);
  };

  const isContain = fitMode === 'contain';

  return (
    <div className={`relative flex flex-col h-full w-full bg-gray-700 ${className ?? ''}`}>
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-300 z-10 bg-gray-700">
          <svg className="animate-spin w-10 h-10" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
          </svg>
          <span className="text-sm">Loading PDF…</span>
        </div>
      )}
      {error && (
        <p className="absolute z-10 inset-0 flex items-center justify-center text-red-400 text-sm px-6 text-center">{error}</p>
      )}

      {/* Page canvas area */}
      <div
        ref={containerRef}
        className={`flex-1 min-h-0 flex justify-center p-3 ${
          isContain ? 'overflow-hidden items-center' : 'overflow-auto items-start'
        }`}
      >
        {!error && <canvas ref={canvasRef} className="shadow-lg bg-white" />}
      </div>

      {/* Slide strip — quick jump between pages */}
      {!error && pageStrip && numPages > 1 && (
        <div
          ref={stripRef}
          className="flex-shrink-0 flex gap-1.5 px-3 py-2 overflow-x-auto bg-gray-800 border-t border-gray-700"
          style={{ scrollbarWidth: 'none' }}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              data-page={n}
              onClick={() => go(n)}
              className={`flex-shrink-0 min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-colors ${
                n === page
                  ? 'bg-white text-gray-900 shadow'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {/* Prev / Next nav bar */}
      {!error && numPages > 0 && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 px-3 py-2 bg-gray-900 border-t border-gray-700 select-none">
          <button
            onClick={() => go(page - 1)} disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg bg-white text-gray-800 text-sm font-semibold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ‹ Prev
          </button>
          <span className="text-sm font-semibold text-white tabular-nums">{page} / {numPages}</span>
          <button
            onClick={() => go(page + 1)} disabled={page >= numPages}
            className="px-3 py-1.5 rounded-lg bg-white text-gray-800 text-sm font-semibold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
};

export default PdfPager;
