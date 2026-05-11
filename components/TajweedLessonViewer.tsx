// components/TajweedLessonViewer.tsx
// -----------------------------------------------------------------------------
// Split-screen: PDF viewer on the left, drawing whiteboard on the right.
// PDF.js renders each page to canvas (read-only, no download).
// Whiteboard supports pen, eraser, text, color, size, undo, clear.
// Per-page drawings are saved and restored as you navigate.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Student, TajweedLesson } from '../types';
import { markLessonCompleted, unmarkLessonCompleted, getCompletedLessonIds } from '../services/tajweedService';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

type DrawTool = 'pen' | 'eraser' | 'text';

interface TextOverlay { x: number; y: number; }

interface Props {
  lesson: TajweedLesson;
  students: Student[];
  tutorId: string;
  onClose: () => void;
}

const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#000000','#ffffff'];

const TajweedLessonViewer: React.FC<Props> = ({ lesson, students, tutorId, onClose }) => {

  // ── PDF ────────────────────────────────────────────────────────────────────
  const pdfCanvasRef   = useRef<HTMLCanvasElement>(null);
  const pdfContainerRef= useRef<HTMLDivElement>(null);
  const renderTaskRef  = useRef<pdfjsLib.RenderTask | null>(null);
  const [pdfDoc,       setPdfDoc]     = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum,      setPageNum]    = useState(1);
  const [totalPages,   setTotalPages] = useState(0);
  const [loadingPdf,   setLoadingPdf] = useState(true);
  const [pdfError,     setPdfError]   = useState('');

  // ── Drawing ────────────────────────────────────────────────────────────────
  const drawCanvasRef    = useRef<HTMLCanvasElement>(null);
  const drawContainerRef = useRef<HTMLDivElement>(null);
  const isDrawing        = useRef(false);
  const lastPos          = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pageDrawings     = useRef<Map<number, string>>(new Map()); // page → dataURL
  const history          = useRef<string[]>([]);   // undo stack (dataURLs)

  const [tool,      setTool]      = useState<DrawTool>('pen');
  const [color,     setColor]     = useState('#ef4444');
  const [lineWidth, setLineWidth] = useState(4);
  const [fontSize,  setFontSize]  = useState(28);
  const [textInput, setTextInput] = useState<TextOverlay | null>(null);
  const [textValue, setTextValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Completion ─────────────────────────────────────────────────────────────
  const [completedIds,      setCompletedIds]      = useState<Set<string>>(new Set());
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [marking,           setMarking]           = useState(false);

  // ── Load PDF ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lesson.pdfUrl) { setPdfError('No PDF attached to this lesson.'); setLoadingPdf(false); return; }
    setLoadingPdf(true); setPdfError('');
    (async () => {
      try {
        const res = await fetch(lesson.pdfUrl!);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setPageNum(1);
      } catch (err) {
        console.error('PDF load error:', err);
        setPdfError('Failed to load PDF. Please try again.');
      } finally {
        setLoadingPdf(false);
      }
    })();
  }, [lesson.pdfUrl]);

  // ── Render PDF page ────────────────────────────────────────────────────────
  const renderPage = useCallback(async (doc: pdfjsLib.PDFDocumentProxy, num: number) => {
    const canvas    = pdfCanvasRef.current;
    const container = pdfContainerRef.current;
    if (!canvas || !container) return;

    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} renderTaskRef.current = null; }

    const page = await doc.getPage(num);
    const dpr  = window.devicePixelRatio || 1;
    const vp0  = page.getViewport({ scale: 1 });
    const scale = Math.min(container.clientWidth / vp0.width, container.clientHeight / vp0.height) * dpr;
    const vp   = page.getViewport({ scale });

    canvas.width        = vp.width;
    canvas.height       = vp.height;
    canvas.style.width  = `${vp.width  / dpr}px`;
    canvas.style.height = `${vp.height / dpr}px`;

    const ctx  = canvas.getContext('2d')!;
    const task = page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport: vp, canvas });
    renderTaskRef.current = task;
    try { await task.promise; }
    catch (e: unknown) { if (e instanceof Error && e.name !== 'RenderingCancelledException') console.error(e); }
  }, []);

  useEffect(() => { if (pdfDoc) renderPage(pdfDoc, pageNum); }, [pdfDoc, pageNum, renderPage]);

  useEffect(() => {
    const el = pdfContainerRef.current;
    if (!el || !pdfDoc) return;
    const ro = new ResizeObserver(() => renderPage(pdfDoc, pageNum));
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfDoc, pageNum, renderPage]);

  // ── Init / resize drawing canvas ───────────────────────────────────────────
  const initDrawCanvas = useCallback(() => {
    const canvas    = drawCanvasRef.current;
    const container = drawContainerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = container.clientWidth;
    const h   = container.clientHeight;

    // Save current content before resize
    const saved = canvas.width > 0 && canvas.height > 0
      ? canvas.toDataURL()
      : null;

    canvas.width        = w * dpr;
    canvas.height       = h * dpr;
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Restore saved drawing if any
    if (saved) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, w, h); };
      img.src = saved;
    }
  }, []);

  useEffect(() => {
    const el = drawContainerRef.current;
    if (!el) return;
    initDrawCanvas();
    const ro = new ResizeObserver(initDrawCanvas);
    ro.observe(el);
    return () => ro.disconnect();
  }, [initDrawCanvas]);

  // ── Per-page drawing save/restore ─────────────────────────────────────────
  // Save drawing for old page, restore for new page
  const prevPageRef = useRef(1);
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    // Save current page's drawing
    pageDrawings.current.set(prevPageRef.current, canvas.toDataURL());
    prevPageRef.current = pageNum;

    // Restore new page's drawing (or blank)
    const saved = pageDrawings.current.get(pageNum);
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.width / dpr;
    const h   = canvas.height / dpr;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    if (saved) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = saved;
    }

    history.current = [];
  }, [pageNum]);

  // ── Drawing helpers ────────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = drawCanvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pushHistory = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    history.current = [...history.current.slice(-19), canvas.toDataURL()];
  };

  const undo = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas || history.current.length === 0) return;
    const prev = history.current[history.current.length - 1];
    history.current = history.current.slice(0, -1);
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.width / dpr;
    const h   = canvas.height / dpr;
    const img = new Image();
    img.onload = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h); };
    img.src = prev;
  };

  const clearCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    pushHistory();
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 0, 0); // reset transform
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  };

  // ── Mouse events on drawing canvas ────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'text') {
      const pos = getPos(e);
      setTextInput(pos);
      setTextValue('');
      setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }
    pushHistory();
    isDrawing.current = true;
    lastPos.current = getPos(e);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = drawCanvasRef.current!;
    const ctx    = canvas.getContext('2d')!;
    const pos    = getPos(e);

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth   = tool === 'eraser' ? lineWidth * 6 : lineWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();

    lastPos.current = pos;
  };

  const onMouseUp   = () => { isDrawing.current = false; };
  const onMouseLeave= () => { isDrawing.current = false; };

  // ── Text commit ───────────────────────────────────────────────────────────
  const commitText = () => {
    if (!textInput) return;
    const text = textValue.trim();
    if (text) {
      pushHistory();
      const ctx = drawCanvasRef.current!.getContext('2d')!;
      ctx.font         = `${fontSize}px sans-serif`;
      ctx.fillStyle    = color;
      ctx.textBaseline = 'top';
      // Wrap multi-line
      text.split('\n').forEach((line, i) => {
        ctx.fillText(line, textInput.x, textInput.y + i * (fontSize * 1.3));
      });
    }
    setTextInput(null);
    setTextValue('');
  };

  // ── Keyboard nav (only when text input NOT open) ───────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textInput) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPageNum(n => Math.min(totalPages, n + 1));
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   setPageNum(n => Math.max(1, n - 1));
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPages, onClose, textInput]);

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
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">

      {/* ══ Top bar ══════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">

        <button onClick={onClose} title="Close (Esc)"
          className="p-1.5 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white text-sm truncate">{lesson.title}</h2>
          {totalPages > 0 && <p className="text-xs text-gray-400">Page {pageNum} of {totalPages}</p>}
        </div>

        {students.length > 0 && (
          <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}
            className="px-2 py-1.5 bg-gray-700 text-gray-200 text-sm rounded-lg border border-gray-600 focus:outline-none max-w-[150px]">
            <option value="">Select student…</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        {selectedStudentId && (
          <button onClick={handleMark} disabled={marking}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 ${isCompleted ? 'bg-green-600 text-white hover:bg-red-600' : 'bg-teal-600 text-white hover:bg-teal-700'}`}>
            {marking
              ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            }
            <span className="hidden sm:inline">{isCompleted ? 'Done ✓' : 'Mark Done'}</span>
          </button>
        )}
      </div>

      {/* ══ Body — PDF left | Whiteboard right ═══════════════════════════════ */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* ── Left: PDF ───────────────────────────────────────────────────── */}
        <div ref={pdfContainerRef}
          className="w-1/2 flex items-center justify-center bg-gray-700 overflow-hidden border-r border-gray-600">
          {loadingPdf && (
            <div className="flex flex-col items-center gap-3 text-gray-300">
              <svg className="animate-spin w-10 h-10" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
              </svg>
              <span className="text-sm">Loading PDF…</span>
            </div>
          )}
          {pdfError && !loadingPdf && (
            <div className="flex flex-col items-center gap-3 text-red-400 px-6 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 opacity-60">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-sm font-medium">{pdfError}</p>
            </div>
          )}
          {!loadingPdf && !pdfError && (
            <canvas ref={pdfCanvasRef} className="shadow-xl" style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }} />
          )}
        </div>

        {/* ── Right: Whiteboard ───────────────────────────────────────────── */}
        <div className="w-1/2 flex flex-col bg-white">

          {/* Drawing toolbar */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200 flex-shrink-0 flex-wrap">

            {/* Tool buttons */}
            {([
              { id: 'pen',    label: 'Pen',    icon: <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /> },
              { id: 'text',   label: 'Text',   icon: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /> },
              { id: 'eraser', label: 'Eraser', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 17.94 6M17.94 6 6 6m11.94 0L18 18" /><path strokeLinecap="round" strokeLinejoin="round" d="m6 18 6-6" /></> },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTool(t.id)} title={t.label}
                className={`p-1.5 rounded-lg transition-colors ${tool === t.id ? 'bg-teal-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">{t.icon}</svg>
              </button>
            ))}

            <div className="w-px h-5 bg-gray-300 mx-0.5" />

            {/* Color swatches */}
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} title={c}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c ? 'border-gray-800 scale-125' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #ccc' : undefined }}
              />
            ))}

            {/* Custom color */}
            <label title="Custom color" className="relative w-5 h-5 rounded-full border-2 border-dashed border-gray-400 overflow-hidden cursor-pointer hover:border-gray-600 flex items-center justify-center">
              <span className="text-gray-400 text-xs font-bold leading-none">+</span>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
            </label>

            <div className="w-px h-5 bg-gray-300 mx-0.5" />

            {/* Stroke/font size */}
            {tool === 'text' ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 hidden sm:inline">Size</span>
                <input type="range" min={12} max={96} step={4} value={fontSize}
                  onChange={e => setFontSize(Number(e.target.value))}
                  className="w-20 accent-teal-600" />
                <span className="text-xs text-gray-500 tabular-nums w-6">{fontSize}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 hidden sm:inline">Width</span>
                <input type="range" min={1} max={20} step={1} value={lineWidth}
                  onChange={e => setLineWidth(Number(e.target.value))}
                  className="w-20 accent-teal-600" />
                <span className="text-xs text-gray-500 tabular-nums w-5">{lineWidth}</span>
              </div>
            )}

            <div className="w-px h-5 bg-gray-300 mx-0.5" />

            {/* Undo */}
            <button onClick={undo} title="Undo (Ctrl+Z)"
              className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
            </button>

            {/* Clear */}
            <button onClick={clearCanvas} title="Clear board"
              className="p-1.5 rounded-lg text-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>

          {/* Drawing canvas area */}
          <div ref={drawContainerRef} className="flex-1 relative overflow-hidden"
            style={{ cursor: tool === 'pen' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'text' }}>
            <canvas
              ref={drawCanvasRef}
              className="absolute inset-0"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
              style={{ touchAction: 'none' }}
            />

            {/* Floating text input */}
            {textInput && (
              <div className="absolute" style={{ left: textInput.x, top: textInput.y, zIndex: 10 }}>
                <textarea
                  ref={textareaRef}
                  value={textValue}
                  onChange={e => setTextValue(e.target.value)}
                  onBlur={commitText}
                  onKeyDown={e => { if (e.key === 'Escape') { setTextInput(null); setTextValue(''); } }}
                  rows={2}
                  placeholder="Type here…"
                  className="border-2 border-teal-500 rounded px-2 py-1 outline-none resize-none bg-white/90 shadow-lg min-w-[120px]"
                  style={{ fontSize, color, fontFamily: 'sans-serif', lineHeight: 1.3 }}
                />
                <div className="flex gap-1 mt-1">
                  <button onMouseDown={e => { e.preventDefault(); commitText(); }}
                    className="px-2 py-0.5 bg-teal-600 text-white text-xs rounded hover:bg-teal-700">
                    Add
                  </button>
                  <button onMouseDown={e => { e.preventDefault(); setTextInput(null); setTextValue(''); }}
                    className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ Bottom nav ═══════════════════════════════════════════════════════ */}
      {!loadingPdf && !pdfError && totalPages > 0 && (
        <div className="flex items-center justify-center gap-4 px-4 py-2.5 bg-gray-800 border-t border-gray-700 flex-shrink-0">
          <button onClick={() => setPageNum(n => Math.max(1, n - 1))} disabled={pageNum <= 1}
            className="flex items-center gap-2 px-5 py-1.5 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Previous
          </button>

          <span className="text-gray-300 text-sm font-medium tabular-nums min-w-[70px] text-center">
            {pageNum} / {totalPages}
          </span>

          <button onClick={() => setPageNum(n => Math.min(totalPages, n + 1))} disabled={pageNum >= totalPages}
            className="flex items-center gap-2 px-5 py-1.5 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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
