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

// ── Keep lesson PDFs on the device ──────────────────────────────────────────
// Supabase serves storage files with `cache-control: no-cache`, so without
// this every lesson opening downloaded the whole PDF again (15–25 MB each) —
// the bulk of the project's egress. Uploaded PDFs live at timestamped paths
// and never change, so a copy kept in Cache Storage is safe to reuse forever.
const PDF_CACHE = 'lesson-pdfs-v1';
const PDF_CACHE_MAX = 40;                         // oldest copies dropped beyond this
// A file name carrying an upload timestamp (13 digits) anywhere in it:
// arabic-pdfs/<ts>-<name>.pdf, pdfs/<ts>-<name>.pdf, qaedah-pdfs/<topic>-<ts>-<name>.pdf
const isImmutableUpload = (u: string) => /\/storage\/v1\/object\/public\/[^?]*\/[^/?]*\d{12,}[^/?]*\.pdf(\?|$)/i.test(u);

async function pdfSource(url: string): Promise<{ url: string } | { data: ArrayBuffer }> {
  if (!isImmutableUpload(url) || typeof caches === 'undefined') return { url };
  try {
    const cache = await caches.open(PDF_CACHE);
    const hit = await cache.match(url);
    if (hit) return { data: await hit.arrayBuffer() };
    const res = await fetch(url);
    if (!res.ok) return { url };
    await cache.put(url, res.clone());
    // Trim: keys() is in insertion order, so the front is the oldest.
    cache.keys().then(keys => Promise.all(
      keys.slice(0, Math.max(0, keys.length - PDF_CACHE_MAX)).map(k => cache.delete(k)),
    )).catch(() => {});
    return { data: await res.arrayBuffer() };
  } catch {
    return { url };                                // private mode, quota… — just stream it
  }
}

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
    let task: any = null;
    setLoading(true); setError(''); setNumPages(0); setThumbnails([]);
    pdfSource(url).then(source => {
      if (cancelled) return null;
      task = pdfjsLib.getDocument({
        ...source,
        cMapUrl: '/pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/',
      });
      return task.promise;
    }).then(async (doc: any) => {
      if (!doc) return;
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
      try { task?.destroy?.(); } catch { /* noop */ }
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

  // ── Scroll and swipe turn the page ─────────────────────────────────────────
  // Only where the slide itself cannot scroll: when a page is taller than the
  // box (fit-to-width on a desktop) the gesture belongs to the page, not to us.
  const gestureAt = useRef(0);
  const touchFrom = useRef<{ x: number; y: number } | null>(null);
  const scrollable = () => {
    const el = containerRef.current;
    if (!el) return false;
    const st = getComputedStyle(el);
    const canY = /auto|scroll/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 4;
    const canX = /auto|scroll/.test(st.overflowX) && el.scrollWidth  > el.clientWidth  + 4;
    return canY || canX;
  };
  /** One gesture is one page, however long the finger or the wheel keeps going. */
  const turn = (delta: number) => {
    const now = Date.now();
    if (now - gestureAt.current < 350) return;
    gestureAt.current = now;
    go(pageRef.current + delta);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (scrollable() || Math.abs(e.deltaY) < 8) return;
    turn(e.deltaY > 0 ? 1 : -1);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    touchFrom.current = e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : null;                                        // two fingers: a pinch, not a swipe
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const from = touchFrom.current;
    touchFrom.current = null;
    const t = e.changedTouches[0];
    if (!from || !t || scrollable()) return;
    const dx = t.clientX - from.x, dy = t.clientY - from.y;
    if (Math.abs(dy) >= 48 && Math.abs(dy) > Math.abs(dx)) turn(dy < 0 ? 1 : -1);
    else if (Math.abs(dx) >= 48) turn(dx < 0 ? 1 : -1);
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
            onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
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
          onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
          className={`flex-1 min-h-0 flex justify-center p-3 ${
            isContain ? 'overflow-hidden items-center' : 'overflow-auto items-start'
          }`}
        >
          {!error && <canvas ref={canvasRef} className={`shadow-lg bg-white ${isContain ? 'max-w-full max-h-full' : ''}`} />}
        </div>
      )}

      {/* Prev / Next nav bar */}
      {!error && numPages > 0 && (
        /* 44px tall on a phone — a thumb cannot reliably hit a 30px button —
           and back to a compact bar from sm up. */
        <div className="flex-shrink-0 flex items-center justify-center gap-3 px-3 py-2 bg-gray-900 border-t border-gray-700 select-none"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page"
            className="h-11 sm:h-8 px-5 sm:px-3 rounded-lg bg-white text-gray-800 text-sm font-semibold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ‹ Prev
          </button>
          <span className="text-sm font-semibold text-white tabular-nums">{page} / {numPages}</span>
          <button
            onClick={() => go(page + 1)} disabled={page >= numPages} aria-label="Next page"
            className="h-11 sm:h-8 px-5 sm:px-3 rounded-lg bg-white text-gray-800 text-sm font-semibold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
};

export default PdfPager;
