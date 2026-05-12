// components/TajweedLessonViewer.tsx
// Split-screen: PDF left | Whiteboard right.
// Text objects are React divs (moveable, editable, deletable).
// Pen/eraser strokes live on a canvas underneath.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Student, TajweedLesson } from '../types';
import { markLessonCompleted, unmarkLessonCompleted, getCompletedLessonIds } from '../services/tajweedService';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ── Types ──────────────────────────────────────────────────────────────────────
type DrawTool = 'pen' | 'eraser' | 'text';

interface TextObj {
  id: string;
  x: number; y: number;
  text: string;
  fontSize: number;
  color: string;
}

interface HistoryEntry { strokes: string; texts: TextObj[]; }
interface PageData      { strokes: string; texts: TextObj[]; }

const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#000000'];
let _uid = 0;
const genId = () => `t${++_uid}_${Date.now()}`;

// ── Component ──────────────────────────────────────────────────────────────────
interface Props { lesson: TajweedLesson; students: Student[]; tutorId: string; onClose: () => void; }

const TajweedLessonViewer: React.FC<Props> = ({ lesson, students, tutorId, onClose }) => {

  // ── PDF ───────────────────────────────────────────────────────────────────
  // We render the PDF via an <iframe> using the browser's native PDF viewer
  // (PDFium in Chrome / built-in viewers in Firefox & Safari) — this renders
  // Arabic and other complex scripts correctly, sidestepping PDF.js font issues.
  // PDF.js is still used just to read the page count for the navigation buttons.
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [pageNum,     setPageNum]    = useState(1);
  const [totalPages,  setTotalPages] = useState(0);
  const [loadingPdf,  setLoadingPdf] = useState(true);
  const [pdfError,    setPdfError]   = useState('');

  // ── Drawing canvas (pen/eraser strokes) ───────────────────────────────────
  const strokesRef     = useRef<HTMLCanvasElement>(null);
  const drawContRef    = useRef<HTMLDivElement>(null);
  const isDrawing      = useRef(false);
  const lastPos        = useRef({ x: 0, y: 0 });

  // ── Text objects ──────────────────────────────────────────────────────────
  const textsRef = useRef<TextObj[]>([]);
  const [texts, _setTexts] = useState<TextObj[]>([]);
  const setTexts = useCallback((u: TextObj[] | ((p: TextObj[]) => TextObj[])) => {
    _setTexts(p => { const n = typeof u === 'function' ? u(p) : u; textsRef.current = n; return n; });
  }, []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editVal,    setEditVal]    = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  // New-text input
  const [newPos, setNewPos] = useState<{ x: number; y: number } | null>(null);
  const [newVal, setNewVal] = useState('');
  const newRef  = useRef<HTMLTextAreaElement>(null);

  // Drag
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Per-page store & undo
  const pageStore  = useRef<Map<number, PageData>>(new Map());
  const prevPage   = useRef(1);
  const historyRef = useRef<HistoryEntry[]>([]);

  // ── Toolbar state ─────────────────────────────────────────────────────────
  const [tool,       setTool]       = useState<DrawTool>('pen');
  const [color,      setColor]      = useState('#ef4444');
  const [lineWidth,  setLineWidth]  = useState(4);
  const [fontSize,   setFontSize]   = useState(28);
  const [showCanvas, setShowCanvas] = useState(true);   // false = PDF full-screen

  // ── Completion ────────────────────────────────────────────────────────────
  const [completedIds,      setCompletedIds]      = useState<Set<string>>(new Set());
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [marking,           setMarking]           = useState(false);

  // ── PDF metadata load (page count only — no canvas rendering) ────────────
  useEffect(() => {
    if (!lesson.pdfUrl) { setPdfError('No PDF attached.'); setLoadingPdf(false); return; }
    setLoadingPdf(true); setPdfError('');
    (async () => {
      try {
        const res = await fetch(lesson.pdfUrl!);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = await pdfjsLib.getDocument({
          data: await res.arrayBuffer(),
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
        }).promise;
        setTotalPages(doc.numPages);
        setPageNum(1);
      } catch (e) { console.error(e); setPdfError('Failed to load PDF. Please try again.'); }
      finally { setLoadingPdf(false); }
    })();
  }, [lesson.pdfUrl]);

  // iframe src — includes #page anchor for navigation. The browser's native
  // PDF viewer interprets the hash and scrolls to the requested page without
  // reloading the document.
  const iframeSrc = lesson.pdfUrl
    ? `${lesson.pdfUrl}#page=${pageNum}&toolbar=0&navpanes=0&zoom=page-fit`
    : '';

  // ── Strokes canvas init/resize ────────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const c = strokesRef.current, cont = drawContRef.current; if (!c || !cont) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cont.clientWidth, h = cont.clientHeight;
    const saved = c.width > 0 ? c.toDataURL() : null;
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = `${w}px`; c.style.height = `${h}px`;
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr);
    if (saved) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, w, h); img.src = saved; }
  }, []);

  useEffect(() => {
    const el = drawContRef.current; if (!el) return;
    initCanvas();
    const ro = new ResizeObserver(initCanvas); ro.observe(el); return () => ro.disconnect();
  }, [initCanvas]);

  // ── Per-page save/restore ─────────────────────────────────────────────────
  useEffect(() => {
    const c = strokesRef.current; if (!c) return;
    // Save old page
    pageStore.current.set(prevPage.current, { strokes: c.toDataURL(), texts: [...textsRef.current] });
    prevPage.current = pageNum;
    historyRef.current = [];
    // Restore new page
    const dpr = window.devicePixelRatio || 1;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
    setTexts([]); setSelectedId(null); setEditingId(null); setNewPos(null);
    const saved = pageStore.current.get(pageNum);
    if (saved) {
      const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.width / dpr, c.height / dpr); img.src = saved.strokes;
      setTexts(saved.texts);
    }
  }, [pageNum, setTexts]);

  // ── History ───────────────────────────────────────────────────────────────
  const pushHistory = () => {
    const c = strokesRef.current; if (!c) return;
    historyRef.current = [...historyRef.current.slice(-19), { strokes: c.toDataURL(), texts: [...textsRef.current] }];
  };
  const undo = () => {
    if (!historyRef.current.length) return;
    const entry = historyRef.current.pop()!;
    const c = strokesRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
    if (entry.strokes) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.width / dpr, c.height / dpr); img.src = entry.strokes; }
    setTexts(entry.texts); setSelectedId(null);
  };
  const clearBoard = () => {
    pushHistory();
    const c = strokesRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.getContext('2d')!.clearRect(0, 0, c.width / dpr, c.height / dpr);
    setTexts([]); setSelectedId(null);
  };

  // ── Pen / eraser ──────────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent) => {
    const r = strokesRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onCanvasDown = (e: React.MouseEvent) => { pushHistory(); isDrawing.current = true; lastPos.current = getPos(e); };
  const onCanvasMove = (e: React.MouseEvent) => {
    if (!isDrawing.current) return;
    const ctx = strokesRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(pos.x, pos.y);
    if (tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.lineWidth = lineWidth * 6; }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = color; ctx.lineWidth = lineWidth; }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    lastPos.current = pos;
  };
  const onCanvasUp = () => { isDrawing.current = false; };

  // ── Text creation (click background in text mode) ─────────────────────────
  const onContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    setSelectedId(null);
    if (tool !== 'text') return;
    const r = e.currentTarget.getBoundingClientRect();
    setNewPos({ x: e.clientX - r.left, y: e.clientY - r.top });
    setNewVal(''); setTimeout(() => newRef.current?.focus(), 0);
  };
  const commitNew = () => {
    const t = newVal.trim();
    if (t && newPos) { pushHistory(); setTexts(prev => [...prev, { id: genId(), x: newPos.x, y: newPos.y, text: t, fontSize, color }]); }
    setNewPos(null); setNewVal('');
  };

  // ── Text drag ─────────────────────────────────────────────────────────────
  const onTextDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id); setNewPos(null);
    const obj = textsRef.current.find(t => t.id === id)!;
    pushHistory();
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.sx, dy = e.clientY - dragRef.current.sy;
      setTexts(prev => prev.map(t => t.id === dragRef.current!.id ? { ...t, x: dragRef.current!.ox + dx, y: dragRef.current!.oy + dy } : t));
    };
    const onUp = () => { dragRef.current = null; };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [setTexts]);

  // ── Text edit (double-click) ───────────────────────────────────────────────
  const onTextDblClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const obj = textsRef.current.find(t => t.id === id)!;
    setEditingId(id); setEditVal(obj.text);
    setTimeout(() => editRef.current?.focus(), 0);
  };
  const commitEdit = () => {
    if (!editingId) return;
    const t = editVal.trim();
    pushHistory();
    if (t) setTexts(prev => prev.map(o => o.id === editingId ? { ...o, text: t } : o));
    else { setTexts(prev => prev.filter(o => o.id !== editingId)); setSelectedId(null); }
    setEditingId(null); setEditVal('');
  };

  // ── Delete selected ───────────────────────────────────────────────────────
  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory(); setTexts(prev => prev.filter(t => t.id !== selectedId)); setSelectedId(null);
  };

  // ── Apply color/size to selected text or toolbar ──────────────────────────
  const applyColor = (c: string) => {
    setColor(c);
    if (selectedId) setTexts(prev => prev.map(t => t.id === selectedId ? { ...t, color: c } : t));
  };
  const applySize = (s: number) => {
    setFontSize(s);
    if (selectedId) setTexts(prev => prev.map(t => t.id === selectedId ? { ...t, fontSize: s } : t));
  };

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (newPos || editingId) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPageNum(n => Math.min(totalPages, n + 1));
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   setPageNum(n => Math.max(1, n - 1));
      if (e.key === 'Escape') { if (selectedId) { setSelectedId(null); return; } onClose(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !['INPUT','TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName ?? '')) deleteSelected();
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPages, onClose, selectedId, newPos, editingId]);

  // ── Completion ────────────────────────────────────────────────────────────
  useEffect(() => { if (selectedStudentId) getCompletedLessonIds(selectedStudentId).then(setCompletedIds); }, [selectedStudentId]);
  const isCompleted = selectedStudentId ? completedIds.has(lesson.id) : false;
  const handleMark = async () => {
    if (!selectedStudentId || marking) return; setMarking(true);
    if (isCompleted) { const ok = await unmarkLessonCompleted(selectedStudentId, lesson.id); if (ok) setCompletedIds(p => { const s = new Set(p); s.delete(lesson.id); return s; }); }
    else { const ok = await markLessonCompleted(selectedStudentId, lesson.id, tutorId); if (ok) setCompletedIds(p => new Set([...p, lesson.id])); }
    setMarking(false);
  };

  const selectedObj = texts.find(t => t.id === selectedId);

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button onClick={onClose} title="Close (Esc)" className="p-1.5 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white text-sm truncate">{lesson.title}</h2>
          {totalPages > 0 && <p className="text-xs text-gray-400">Page {pageNum} of {totalPages}</p>}
        </div>
        {/* Split / Full-screen toggle */}
        <button
          onClick={() => setShowCanvas(v => !v)}
          title={showCanvas ? 'Hide canvas (full-screen PDF)' : 'Show canvas (split screen)'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 text-gray-200 text-xs font-semibold rounded-lg hover:bg-gray-600 transition-colors flex-shrink-0"
        >
          {showCanvas ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
              <span className="hidden sm:inline">Full Screen</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
              </svg>
              <span className="hidden sm:inline">Split Screen</span>
            </>
          )}
        </button>

        {students.length > 0 && (
          <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}
            className="px-2 py-1.5 bg-gray-700 text-gray-200 text-sm rounded-lg border border-gray-600 focus:outline-none max-w-[150px]">
            <option value="">Select student…</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {selectedStudentId && (
          <button onClick={handleMark} disabled={marking}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg flex-shrink-0 disabled:opacity-50 ${isCompleted ? 'bg-green-600 text-white hover:bg-red-600' : 'bg-teal-600 text-white hover:bg-teal-700'}`}>
            {marking ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
              : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>}
            <span className="hidden sm:inline">{isCompleted ? 'Done ✓' : 'Mark Done'}</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Left: PDF (rendered by the browser's native PDF viewer via iframe) */}
        <div ref={pdfContainerRef} className={`${showCanvas ? 'w-1/2 border-r border-gray-600' : 'w-full'} flex items-center justify-center bg-gray-700 overflow-hidden transition-all`}>
          {loadingPdf && <div className="flex flex-col items-center gap-3 text-gray-300"><svg className="animate-spin w-10 h-10" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg><span className="text-sm">Loading PDF…</span></div>}
          {pdfError && !loadingPdf && <p className="text-red-400 text-sm px-6 text-center">{pdfError}</p>}
          {!loadingPdf && !pdfError && iframeSrc && (
            <iframe
              src={iframeSrc}
              title={lesson.title}
              className="w-full h-full bg-white"
              style={{ border: 'none' }}
              allowFullScreen
            />
          )}
        </div>

        {/* Right: Whiteboard */}
        <div className={`${showCanvas ? 'w-1/2 flex' : 'hidden'} flex-col`}>

          {/* Toolbar */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-100 border-b border-gray-200 flex-shrink-0 flex-wrap select-none">

            {/* Tool buttons */}
            {([
              { id: 'pen'   as DrawTool, label: 'Pen',    d: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z' },
              { id: 'text'  as DrawTool, label: 'Text',   d: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z' },
              { id: 'eraser'as DrawTool, label: 'Eraser', d: 'M12 9.75 14.25 12m0 0 2.25 2.25M14.25 12l2.25-2.25M14.25 12 12 14.25m-2.58 4.92-6.374-6.375a1.125 1.125 0 0 1 0-1.59l9.856-9.856a1.125 1.125 0 0 1 1.59 0l3.532 3.531a1.125 1.125 0 0 1 0 1.592L10.58 19.096a1.125 1.125 0 0 1-.83.354H7.998a.75.75 0 0 1-.75-.75v-1.332c0-.311.124-.61.344-.83Z' },
            ]).map(t => (
              <button key={t.id} onClick={() => { setTool(t.id); setSelectedId(null); }} title={t.label}
                className={`p-1.5 rounded-lg ${tool === t.id ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d={t.d} /></svg>
              </button>
            ))}

            <div className="w-px h-5 bg-gray-300" />

            {/* Color swatches */}
            {COLORS.map(c => (
              <button key={c} onClick={() => applyColor(c)}
                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-transform ${color === c ? 'border-gray-700 scale-125' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c }} />
            ))}
            <label title="Custom colour" className="w-5 h-5 rounded-full border-2 border-dashed border-gray-400 flex items-center justify-center cursor-pointer hover:border-gray-600 relative overflow-hidden flex-shrink-0">
              <span className="text-gray-400 text-xs font-bold leading-none">+</span>
              <input type="color" value={color} onChange={e => applyColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>

            <div className="w-px h-5 bg-gray-300" />

            {/* Size slider */}
            {(tool === 'text' || selectedObj) ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Size</span>
                <input type="range" min={10} max={96} step={2}
                  value={selectedObj ? selectedObj.fontSize : fontSize}
                  onChange={e => applySize(Number(e.target.value))}
                  className="w-20 accent-teal-600" />
                <span className="text-xs text-gray-500 tabular-nums w-6">{selectedObj ? selectedObj.fontSize : fontSize}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Width</span>
                <input type="range" min={1} max={20} step={1} value={lineWidth}
                  onChange={e => setLineWidth(Number(e.target.value))} className="w-20 accent-teal-600" />
                <span className="text-xs text-gray-500 tabular-nums w-5">{lineWidth}</span>
              </div>
            )}

            <div className="w-px h-5 bg-gray-300" />

            {/* Delete selected */}
            {selectedId && (
              <button onClick={deleteSelected} title="Delete text (Del)"
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-100">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
              </button>
            )}

            {/* Undo */}
            <button onClick={undo} title="Undo (Ctrl+Z)" className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
            </button>

            {/* Clear */}
            <button onClick={clearBoard} title="Clear board" className="p-1.5 rounded-lg text-gray-600 hover:bg-red-100 hover:text-red-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Selected text hint */}
          {selectedId && !editingId && (
            <div className="flex items-center gap-2 px-3 py-1 bg-teal-50 border-b border-teal-200 text-xs text-teal-700 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672Zm-7.518-.267A8.25 8.25 0 1 1 20.25 10.5M8.288 14.212A5.25 5.25 0 1 1 17.25 10.5" /></svg>
              Drag to move · Double-click to edit · Change colour/size above · Del to delete
            </div>
          )}

          {/* Drawing surface */}
          <div ref={drawContRef} className="flex-1 relative overflow-hidden bg-white"
            onClick={onContainerClick}
            style={{ cursor: tool === 'text' ? 'crosshair' : 'default' }}>

            {/* Strokes canvas */}
            <canvas ref={strokesRef} className="absolute inset-0"
              style={{ pointerEvents: tool !== 'text' ? 'auto' : 'none', cursor: tool === 'pen' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'default' }}
              onMouseDown={onCanvasDown} onMouseMove={onCanvasMove}
              onMouseUp={onCanvasUp} onMouseLeave={onCanvasUp} />

            {/* Text objects */}
            {texts.map(obj => {
              const isSel  = selectedId === obj.id;
              const isEdit = editingId  === obj.id;
              return (
                <div key={obj.id} className="absolute"
                  style={{ left: obj.x, top: obj.y, zIndex: isSel ? 10 : 5, pointerEvents: tool === 'pen' || tool === 'eraser' ? 'none' : 'auto' }}
                  onMouseDown={isEdit ? undefined : e => onTextDown(e, obj.id)}
                  onDoubleClick={isEdit ? undefined : e => onTextDblClick(e, obj.id)}
                  onClick={e => e.stopPropagation()}>
                  {isEdit ? (
                    <textarea ref={editRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => { if (e.key === 'Escape') { setEditingId(null); } e.stopPropagation(); }}
                      rows={3} className="border-2 border-teal-500 rounded px-2 py-1 outline-none resize bg-white/95 shadow-lg min-w-[120px]"
                      style={{ fontSize: obj.fontSize, color: obj.color, fontFamily: 'sans-serif', lineHeight: 1.3 }} />
                  ) : (
                    <div className={`px-1 py-0.5 whitespace-pre-wrap cursor-move rounded ${isSel ? 'ring-2 ring-teal-500 ring-offset-1 bg-teal-50/30' : 'hover:ring-1 hover:ring-gray-300'}`}
                      style={{ fontSize: obj.fontSize, color: obj.color, fontFamily: 'sans-serif', lineHeight: 1.3, maxWidth: 420 }}>
                      {obj.text}
                    </div>
                  )}
                </div>
              );
            })}

            {/* New text input */}
            {newPos && (
              <div className="absolute z-20" style={{ left: newPos.x, top: newPos.y }} onClick={e => e.stopPropagation()}>
                <textarea ref={newRef} value={newVal} onChange={e => setNewVal(e.target.value)}
                  onBlur={commitNew}
                  onKeyDown={e => { if (e.key === 'Escape') { setNewPos(null); setNewVal(''); } e.stopPropagation(); }}
                  rows={2} placeholder="Type here…"
                  className="border-2 border-teal-500 rounded px-2 py-1 outline-none resize bg-white shadow-lg min-w-[140px]"
                  style={{ fontSize, color, fontFamily: 'sans-serif', lineHeight: 1.3 }} />
                <div className="flex gap-1 mt-1">
                  <button onMouseDown={e => { e.preventDefault(); commitNew(); }} className="px-2 py-0.5 bg-teal-600 text-white text-xs font-semibold rounded hover:bg-teal-700">Add</button>
                  <button onMouseDown={e => { e.preventDefault(); setNewPos(null); setNewVal(''); }} className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      {!loadingPdf && !pdfError && totalPages > 0 && (
        <div className="flex items-center justify-center gap-4 px-4 py-2.5 bg-gray-800 border-t border-gray-700 flex-shrink-0">
          <button onClick={() => setPageNum(n => Math.max(1, n - 1))} disabled={pageNum <= 1}
            className="flex items-center gap-2 px-5 py-1.5 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Previous
          </button>
          <span className="text-gray-300 text-sm tabular-nums min-w-[70px] text-center">{pageNum} / {totalPages}</span>
          <button onClick={() => setPageNum(n => Math.min(totalPages, n + 1))} disabled={pageNum >= totalPages}
            className="flex items-center gap-2 px-5 py-1.5 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-30 disabled:cursor-not-allowed">
            Next
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default TajweedLessonViewer;
