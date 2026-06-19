import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

interface Props {
  url: string;
  initialPage?: number;
  onPageChange?: (page: number, total: number) => void;
  className?: string;
  /** 'width' — scale to container width (default).
   *  'contain' — scale to fit both dimensions (no scroll). */
  fitMode?: 'width' | 'contain';
  /** Render thumbnail previews of every page below the main slide. */
  pageStrip?: boolean;
}

const THUMB_W = 96; // thumbnail render width in px (height is proportional)

const PdfPager: React.FC<Props> = ({
  url, initialPage = 1, onPageChange, className,
  fitMode = 'width', pageStrip = false,
}) => {
  const containerRef    = useRef<HTMLDivElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const thumbStripRef   = useRef<HTMLDivElement>(null);
  const docRef          = useRef<any>(null);
  const renderTaskRef   = useRef<any>(null);
  const pageRef         = useRef(1);
  const fitModeRef      = useRef(fitMode);
  const onPageChangeRef = useRef(onPageChange);

  useEffect(() => { onPageChangeRef.current = onPageChange; }, [onPageChange]);
  useEffect(() => { fitModeRef.current = fitMode; }, [fitMode]);

  const [numPages,   setNumPages]   = useState(0);
  const [page,       setPage]       = useState(initialPage);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [thumbnails, setThumbnails] = useState<string[]>([]); // dataURLs, index = page-1

  // ── Render the main canvas ──────────────────────────────────────────────────
  const renderPage = useCallback(async (n: number) => {
    const doc = docRef.current, canvas = canvasRef.current, container = containerRef.current;
    if (!doc || !canvas || !container) return;
    try {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* noop */ } }
      const pdfPage  = await doc.getPage(n);
      const unscaled = pdfPage.getViewport({ scale: 1 });
      const padding  = 24;
      const availW   = container.clientWidth  - padding;
      // In contain mode (or when pageStrip is active and container has finite height)
      // scale to fit both dimensions; otherwise scale to width only.
      const useContain = fitModeRef.current === 'contain' || pageStrip;
      const availH   = useContain ? container.clientHeight - padding : Infinity;
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
  }, [pageStrip]);

  // ── Render all thumbnails in the background after load ─────────────────────
  const renderThumbnails = useCallback(async (doc: any, total: number) => {
    const results: string[] = new Array(total).fill('');
    for (let i = 1; i <= total; i++) {
      try {
        const pdfPage  = await doc.getPage(i);
        const unscaled = pdfPage.getViewport({ scale: 1 });
        const scale    = THUMB_W / unscaled.width;
        const viewport = pdfPage.getViewport({ scale });
        const c        = document.createElement('canvas');
        c.width        = Math.floor(viewport.width);
        c.height       = Math.floor(viewport.height);
        const ctx      = c.getContext('2d');
        if (!ctx) continue;
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        results[i - 1] = c.toDataURL('image/jpeg', 0.75);
        // Progressively update so thumbnails appear as they're ready
        setThumbnails([...results]);
      } catch { /* skip this thumbnail */ }
    }
  }, []);

  // ── Load document ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setNumPages(0); setThumbnails([]);
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
      if (pageStrip) renderThumbnails(doc, doc.numPages);
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

  // ── Re-render main canvas on page / fitMode change ─────────────────────────
  useEffect(() => {
    if (!loading && docRef.current) renderPage(page);
  }, [page, loading, fitMode, renderPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refit on container resize ──────────────────────────────────────────────
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

  // ── Keyboard arrow navigation ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName ?? '')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(pageRef.current + 1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); go(pageRef.current - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numPages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll thumbnail strip to keep current page visible ───────────────
  useEffect(() => {
    const strip = thumbStripRef.current;
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

  const isContain = fitMode === 'contain' && !pageStrip;

  return (
    <div className={`relative flex flex-col h-full w-full bg-gray-700 ${className ?? ''}`}>
      {/* Loading / error overlays */}
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

      {pageStrip ? (
        /* ── Split layout: main slide (flex-1) + thumbnail grid below ───────── */
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Main slide — fills available space, canvas scales to contain */}
          <div
            ref={containerRef}
            className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-3"
          >
            {!error && <canvas ref={canvasRef} className="shadow-lg bg-white max-w-full max-h-full" />}
          </div>

          {/* Thumbnail grid — fills remaining space */}
          {!error && thumbnails.length > 0 && (
            <div
              ref={thumbStripRef}
              className="flex-shrink-0 flex gap-2 px-2 py-2 overflow-x-auto bg-gray-800 border-t border-gray-600"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}
            >
              {thumbnails.map((src, i) => {
                const n       = i + 1;
                const isCurr  = page === n;
                return (
                  <button
                    key={n}
                    data-page={n}
                    onClick={() => go(n)}
                    title={`Slide ${n}`}
                    className={`relative flex-shrink-0 rounded-md overflow-hidden transition-all duration-150 ${
                      isCurr
                        ? 'ring-2 ring-white shadow-lg scale-105 z-10'
                        : 'opacity-60 hover:opacity-100 hover:ring-1 hover:ring-gray-400'
                    }`}
                    style={{ height: 80 }}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt={`Slide ${n}`}
                        className="h-full w-auto block bg-white"
                        draggable={false}
                      />
                    ) : (
                      <div className="h-20 w-16 bg-gray-600 flex items-center justify-center">
                        <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
                        </svg>
                      </div>
                    )}
                    {/* Page number badge */}
                    <span className={`absolute bottom-0 inset-x-0 text-center text-[9px] font-bold py-0.5 ${
                      isCurr ? 'bg-white/90 text-gray-900' : 'bg-black/50 text-white'
                    }`}>
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── Standard layout: scrollable (width) or contained (contain) ──────── */
        <div
          ref={containerRef}
          className={`flex-1 min-h-0 flex justify-center p-3 ${
            isContain ? 'overflow-hidden items-center' : 'overflow-auto items-start'
          }`}
        >
          {!error && <canvas ref={canvasRef} className="shadow-lg bg-white" />}
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
