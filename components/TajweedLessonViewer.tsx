// components/TajweedLessonViewer.tsx
// Split-screen: PDF left | Whiteboard right.
// Objects: text, draggable tables, images — all moveable & editable.
// Pen/highlighter/eraser strokes live on a canvas underneath.
// Persists to Supabase via optional onSaveWhiteboard / onLoadWhiteboard callbacks.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Student, TajweedLesson } from '../types';
import { markLessonCompleted, unmarkLessonCompleted, getCompletedLessonIds } from '../services/tajweedService';

// ── Types ──────────────────────────────────────────────────────────────────────

type DrawTool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'table' | 'image';

interface TextObj  { id: string; x: number; y: number; text: string; fontSize: number; color: string; }
interface TableObj { id: string; x: number; y: number; rows: string[][]; cellW: number; cellH: number; }
interface WBImg    { id: string; x: number; y: number; src: string; w: number; h: number; }

export interface WhiteboardData {
  strokes: string;
  texts:   TextObj[];
  tables:  TableObj[];
  images:  WBImg[];
}

type DragInfo =
  | { kind: 'text'  | 'table' | 'image'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'img-resize';                 id: string; sx: number; sy: number; ow: number; oh: number };

interface HistEntry { strokes: string; texts: TextObj[]; tables: TableObj[]; images: WBImg[]; }

export interface VocabWordBasic { arabic: string; transliteration: string; english: string; }

const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#000000','#ffffff'];
let _uid = 0;
const uid = () => `wb${++_uid}_${Date.now()}`;

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  lesson: TajweedLesson;
  students: Student[];
  tutorId: string;
  onClose: () => void;
  preSelectedStudentId?: string;
  fetchCompletedIds?: (studentId: string) => Promise<Set<string>>;
  onMarkCompleted?:   (studentId: string, lessonId: string, tutorId: string) => Promise<boolean>;
  onUnmarkCompleted?: (studentId: string, lessonId: string) => Promise<boolean>;
  embedded?: boolean;
  // Persistence — optional; without these the board is ephemeral per session
  onSaveWhiteboard?: (data: WhiteboardData) => Promise<void>;
  onLoadWhiteboard?: () => Promise<WhiteboardData | null>;
  onUploadImage?:    (file: File) => Promise<string | null>;
  // Vocabulary import — pass words to enable the "Import Vocab" button
  vocabWords?: VocabWordBasic[];
}

// ── Component ──────────────────────────────────────────────────────────────────

const TajweedLessonViewer: React.FC<Props> = ({
  lesson, students, tutorId, onClose,
  preSelectedStudentId,
  fetchCompletedIds, onMarkCompleted, onUnmarkCompleted,
  embedded = false,
  onSaveWhiteboard, onLoadWhiteboard, onUploadImage,
  vocabWords,
}) => {
  const _fetchIds = fetchCompletedIds ?? getCompletedLessonIds;
  const _mark     = onMarkCompleted   ?? markLessonCompleted;
  const _unmark   = onUnmarkCompleted ?? unmarkLessonCompleted;

  // ── PDF ───────────────────────────────────────────────────────────────────
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [loadingPdf, setLoadingPdf] = useState(!!lesson.pdfUrl);
  const [pdfError,   setPdfError]   = useState('');

  // ── Canvas ────────────────────────────────────────────────────────────────
  const strokesRef  = useRef<HTMLCanvasElement>(null);
  const drawContRef = useRef<HTMLDivElement>(null);
  const isDrawing   = useRef(false);
  const lastPos     = useRef({ x: 0, y: 0 });
  const loadedStrokesRef = useRef<string | null>(null);

  // ── Objects (refs mirror state for use inside callbacks) ──────────────────
  const textsRef  = useRef<TextObj[]>([]);
  const tablesRef = useRef<TableObj[]>([]);
  const imagesRef = useRef<WBImg[]>([]);

  const [texts,  _setTexts]  = useState<TextObj[]>([]);
  const [tables, _setTables] = useState<TableObj[]>([]);
  const [images, _setImages] = useState<WBImg[]>([]);

  const setTexts  = useCallback((u: TextObj[]  | ((p: TextObj[])  => TextObj[]))  => { _setTexts(p  => { const n = typeof u === 'function' ? u(p)  : u; textsRef.current  = n; return n; }); }, []);
  const setTables = useCallback((u: TableObj[] | ((p: TableObj[]) => TableObj[])) => { _setTables(p => { const n = typeof u === 'function' ? u(p)  : u; tablesRef.current = n; return n; }); }, []);
  const setImages = useCallback((u: WBImg[]    | ((p: WBImg[])    => WBImg[]))    => { _setImages(p => { const n = typeof u === 'function' ? u(p)  : u; imagesRef.current = n; return n; }); }, []);

  // ── Selection & edit ──────────────────────────────────────────────────────
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editVal,       setEditVal]       = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  // New text
  const [newPos, setNewPos] = useState<{ x: number; y: number } | null>(null);
  const [newVal, setNewVal] = useState('');
  const newRef = useRef<HTMLTextAreaElement>(null);

  // Drag
  const dragRef = useRef<DragInfo | null>(null);

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const [tool,       setTool]       = useState<DrawTool>('pen');
  const [color,      setColor]      = useState('#ef4444');
  const [lineWidth,  setLineWidth]  = useState(4);
  const [fontSize,   setFontSize]   = useState(28);
  const [showCanvas, setShowCanvas] = useState(true);

  // ── Table modal ───────────────────────────────────────────────────────────
  const [tableModal, setTableModal] = useState<{ x: number; y: number } | null>(null);
  const [tRows, setTRows] = useState(3);
  const [tCols, setTCols] = useState(3);

  // ── Image upload ──────────────────────────────────────────────────────────
  const imgInputRef    = useRef<HTMLInputElement>(null);
  const pendingImgPos  = useRef<{ x: number; y: number } | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  // ── History ───────────────────────────────────────────────────────────────
  const historyRef = useRef<HistEntry[]>([]);

  // ── Save status ───────────────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | null>(null);

  // ── Completion ────────────────────────────────────────────────────────────
  const [completedIds,      setCompletedIds]      = useState<Set<string>>(new Set());
  const [selectedStudentId, setSelectedStudentId] = useState(preSelectedStudentId ?? '');
  const [marking,           setMarking]           = useState(false);

  const iframeSrc = lesson.pdfUrl ?? '';

  // ─────────────────────────────────────────────────────────────────────────
  // Canvas init / resize
  // ─────────────────────────────────────────────────────────────────────────

  const initCanvas = useCallback(() => {
    const c = strokesRef.current, cont = drawContRef.current;
    if (!c || !cont) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cont.clientWidth, h = cont.clientHeight;
    const prevDataUrl = c.width > 0 ? c.toDataURL() : null;
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = `${w}px`; c.style.height = `${h}px`;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const src = prevDataUrl || loadedStrokesRef.current;
    if (src) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = src;
      if (loadedStrokesRef.current) loadedStrokesRef.current = null;
    }
  }, []);

  useEffect(() => {
    const el = drawContRef.current;
    if (!el) return;
    initCanvas();
    const ro = new ResizeObserver(initCanvas);
    ro.observe(el);
    return () => ro.disconnect();
  }, [initCanvas]);

  // ─────────────────────────────────────────────────────────────────────────
  // Load saved whiteboard on mount
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!onLoadWhiteboard) return;
    onLoadWhiteboard().then(data => {
      if (!data) return;
      setTexts(data.texts   ?? []);
      setTables(data.tables ?? []);
      setImages(data.images ?? []);
      if (data.strokes) {
        const c = strokesRef.current;
        if (c && c.width > 0) {
          const dpr = window.devicePixelRatio || 1;
          const img = new Image();
          img.onload = () => c.getContext('2d')!.drawImage(img, 0, 0, c.width / dpr, c.height / dpr);
          img.src = data.strokes;
        } else {
          loadedStrokesRef.current = data.strokes;
        }
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-save (debounced 1.5 s)
  // ─────────────────────────────────────────────────────────────────────────

  const scheduleAutoSave = useCallback(() => {
    if (!onSaveWhiteboard) return;
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      await onSaveWhiteboard({
        strokes: strokesRef.current?.toDataURL('image/png') ?? '',
        texts:   textsRef.current,
        tables:  tablesRef.current,
        images:  imagesRef.current,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2500);
    }, 1500);
  }, [onSaveWhiteboard]);

  // ─────────────────────────────────────────────────────────────────────────
  // History
  // ─────────────────────────────────────────────────────────────────────────

  const pushHistory = () => {
    historyRef.current = [...historyRef.current.slice(-19), {
      strokes: strokesRef.current?.toDataURL() ?? '',
      texts:   [...textsRef.current],
      tables:  tablesRef.current.map(t => ({ ...t, rows: t.rows.map(r => [...r]) })),
      images:  [...imagesRef.current],
    }];
  };

  const undo = useCallback(() => {
    const entry = historyRef.current.pop();
    if (!entry) return;
    const c = strokesRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
    if (entry.strokes) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width / dpr, c.height / dpr);
      img.src = entry.strokes;
    }
    setTexts(entry.texts); setTables(entry.tables); setImages(entry.images);
    setSelectedId(null);
    scheduleAutoSave();
  }, [setTexts, setTables, setImages, scheduleAutoSave]);

  const clearBoard = () => {
    pushHistory();
    const c = strokesRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.getContext('2d')!.clearRect(0, 0, c.width / dpr, c.height / dpr);
    setTexts([]); setTables([]); setImages([]);
    setSelectedId(null);
    scheduleAutoSave();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Pen / highlighter / eraser drawing
  // ─────────────────────────────────────────────────────────────────────────

  const getPos = (e: React.MouseEvent) => {
    const r = strokesRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const isDrawTool = tool === 'pen' || tool === 'highlighter' || tool === 'eraser';

  const onCanvasDown = (e: React.MouseEvent) => {
    if (!isDrawTool) return;
    pushHistory(); isDrawing.current = true; lastPos.current = getPos(e);
  };

  const onCanvasMove = (e: React.MouseEvent) => {
    if (!isDrawing.current) return;
    const ctx = strokesRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = lineWidth * 6;
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color + '55';
      ctx.lineWidth = lineWidth * 5;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    lastPos.current = pos;
  };

  const onCanvasUp = () => {
    if (isDrawing.current) { isDrawing.current = false; scheduleAutoSave(); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Container click — place objects (only in creation tools, not select)
  // ─────────────────────────────────────────────────────────────────────────

  const onContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If click lands on an existing object, don't create a new one
    if ((e.target as HTMLElement).closest('.wb-object')) return;
    // In select mode, clicking empty area just deselects
    if (tool === 'select' || isDrawTool) {
      setSelectedId(null);
      return;
    }
    setSelectedId(null);
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;

    if (tool === 'text') {
      setNewPos({ x, y }); setNewVal('');
      setTimeout(() => newRef.current?.focus(), 0);
    }
    if (tool === 'table') {
      setTableModal({ x, y });
    }
    if (tool === 'image') {
      pendingImgPos.current = { x, y };
      imgInputRef.current?.click();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Text objects
  // ─────────────────────────────────────────────────────────────────────────

  const commitNew = () => {
    const t = newVal.trim();
    if (t && newPos) {
      pushHistory();
      setTexts(prev => [...prev, { id: uid(), x: newPos.x, y: newPos.y, text: t, fontSize, color }]);
      scheduleAutoSave();
    }
    setNewPos(null); setNewVal('');
  };

  const commitEdit = () => {
    if (!editingTextId) return;
    pushHistory();
    const t = editVal.trim();
    if (t) setTexts(prev => prev.map(o => o.id === editingTextId ? { ...o, text: t } : o));
    else { setTexts(prev => prev.filter(o => o.id !== editingTextId)); setSelectedId(null); }
    setEditingTextId(null); setEditVal('');
    scheduleAutoSave();
  };

  const onTextDown = (e: React.MouseEvent, obj: TextObj) => {
    e.stopPropagation();
    setSelectedId(obj.id); setNewPos(null);
    pushHistory();
    dragRef.current = { kind: 'text', id: obj.id, sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y };
  };

  const onTextDblClick = (e: React.MouseEvent, obj: TextObj) => {
    e.stopPropagation();
    setEditingTextId(obj.id); setEditVal(obj.text);
    setTimeout(() => editRef.current?.focus(), 0);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Table objects
  // ─────────────────────────────────────────────────────────────────────────

  const insertTable = () => {
    if (!tableModal) return;
    pushHistory();
    setTables(prev => [...prev, {
      id: uid(), x: tableModal.x, y: tableModal.y,
      rows: Array.from({ length: tRows }, () => Array(tCols).fill('')),
      cellW: 100, cellH: 36,
    }]);
    setTableModal(null);
    scheduleAutoSave();
  };

  const insertVocabTable = () => {
    if (!vocabWords || vocabWords.length === 0) return;
    pushHistory();
    // Header row + one row per word
    const rows: string[][] = [
      ['#', 'Arabic', 'Transliteration', 'English'],
      ...vocabWords.map((w, i) => [`${i + 1}`, w.arabic, w.transliteration, w.english]),
    ];
    setTables(prev => [...prev, {
      id: uid(), x: 40, y: 40,
      rows, cellW: 120, cellH: 36,
    }]);
    scheduleAutoSave();
  };

  const updateCell = (tableId: string, r: number, c: number, val: string) => {
    setTables(prev => prev.map(t => t.id !== tableId ? t : {
      ...t, rows: t.rows.map((row, ri) => ri !== r ? row : row.map((cell, ci) => ci !== c ? cell : val)),
    }));
    scheduleAutoSave();
  };

  const mutateTable = (tableId: string, op: 'addRow' | 'delRow' | 'addCol' | 'delCol') => {
    pushHistory();
    setTables(prev => prev.map(t => {
      if (t.id !== tableId) return t;
      let rows = t.rows;
      const nc = rows[0]?.length ?? 0;
      if (op === 'addRow') rows = [...rows, Array(nc).fill('')];
      if (op === 'delRow' && rows.length > 1) rows = rows.slice(0, -1);
      if (op === 'addCol') rows = rows.map(r => [...r, '']);
      if (op === 'delCol' && nc > 1) rows = rows.map(r => r.slice(0, -1));
      return { ...t, rows };
    }));
    scheduleAutoSave();
  };

  const onTableHeaderDown = (e: React.MouseEvent, obj: TableObj) => {
    e.stopPropagation();
    setSelectedId(obj.id); setNewPos(null);
    pushHistory();
    dragRef.current = { kind: 'table', id: obj.id, sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Image objects
  // ─────────────────────────────────────────────────────────────────────────

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !onUploadImage) return;
    setUploadingImg(true);
    const url = await onUploadImage(file);
    setUploadingImg(false);
    if (!url) { alert('Image upload failed — check Supabase Storage bucket permissions.'); return; }
    const pos = pendingImgPos.current ?? { x: 60, y: 60 };
    pendingImgPos.current = null;
    const imgEl = new Image();
    imgEl.onload = () => {
      const maxW = 320, maxH = 240;
      const scale = Math.min(1, maxW / imgEl.naturalWidth, maxH / imgEl.naturalHeight);
      pushHistory();
      setImages(prev => [...prev, { id: uid(), x: pos.x, y: pos.y, src: url, w: imgEl.naturalWidth * scale, h: imgEl.naturalHeight * scale }]);
      scheduleAutoSave();
    };
    imgEl.src = url;
  };

  const onImgDown = (e: React.MouseEvent, obj: WBImg) => {
    e.stopPropagation();
    setSelectedId(obj.id); setNewPos(null);
    pushHistory();
    dragRef.current = { kind: 'image', id: obj.id, sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y };
  };

  const onImgResizeDown = (e: React.MouseEvent, obj: WBImg) => {
    e.stopPropagation(); e.preventDefault();
    dragRef.current = { kind: 'img-resize', id: obj.id, sx: e.clientX, sy: e.clientY, ow: obj.w, oh: obj.h };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Unified drag (document level)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (d.kind === 'text')       setTexts( prev => prev.map(o => o.id === d.id ? { ...o, x: (d as any).ox + dx, y: (d as any).oy + dy } : o));
      if (d.kind === 'table')      setTables(prev => prev.map(o => o.id === d.id ? { ...o, x: (d as any).ox + dx, y: (d as any).oy + dy } : o));
      if (d.kind === 'image')      setImages(prev => prev.map(o => o.id === d.id ? { ...o, x: (d as any).ox + dx, y: (d as any).oy + dy } : o));
      if (d.kind === 'img-resize') setImages(prev => prev.map(o => o.id === d.id ? { ...o, w: Math.max(40, (d as any).ow + dx), h: Math.max(30, (d as any).oh + dy) } : o));
    };
    const onUp = () => { if (dragRef.current) { dragRef.current = null; scheduleAutoSave(); } };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [setTexts, setTables, setImages, scheduleAutoSave]);

  // ─────────────────────────────────────────────────────────────────────────
  // Delete selected / colour / size
  // ─────────────────────────────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    pushHistory();
    setTexts( prev => prev.filter(o => o.id !== selectedId));
    setTables(prev => prev.filter(o => o.id !== selectedId));
    setImages(prev => prev.filter(o => o.id !== selectedId));
    setSelectedId(null);
    scheduleAutoSave();
  }, [selectedId, setTexts, setTables, setImages, scheduleAutoSave]);

  const applyColor = (c: string) => {
    setColor(c);
    if (selectedId && texts.find(t => t.id === selectedId)) {
      setTexts(prev => prev.map(t => t.id === selectedId ? { ...t, color: c } : t));
      scheduleAutoSave();
    }
  };

  const applySize = (s: number) => {
    setFontSize(s);
    if (selectedId && texts.find(t => t.id === selectedId)) {
      setTexts(prev => prev.map(t => t.id === selectedId ? { ...t, fontSize: s } : t));
      scheduleAutoSave();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Keyboard shortcuts
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (newPos || editingTextId || tableModal) return;
      if (e.key === 'Escape') { if (selectedId) { setSelectedId(null); return; } if (!embedded) onClose(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !['INPUT','TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName ?? '')) deleteSelected();
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, selectedId, newPos, editingTextId, tableModal, embedded, deleteSelected, undo]);

  // ─────────────────────────────────────────────────────────────────────────
  // Completion
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => { if (selectedStudentId) _fetchIds(selectedStudentId).then(setCompletedIds); }, [selectedStudentId, _fetchIds]);

  const isCompleted = selectedStudentId ? completedIds.has(lesson.id) : false;
  const handleMark = async () => {
    if (!selectedStudentId || marking) return; setMarking(true);
    if (isCompleted) { const ok = await _unmark(selectedStudentId, lesson.id); if (ok) setCompletedIds(p => { const s = new Set(p); s.delete(lesson.id); return s; }); }
    else             { const ok = await _mark(selectedStudentId, lesson.id, tutorId); if (ok) setCompletedIds(p => new Set([...p, lesson.id])); }
    setMarking(false);
  };

  const selectedTextObj = texts.find(t => t.id === selectedId);

  // Canvas cursor based on tool
  const canvasCursor = tool === 'select' ? 'default'
    : tool === 'text' ? 'text'
    : tool === 'table' ? 'crosshair'
    : tool === 'image' ? 'copy'
    : 'default';

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={embedded ? 'flex flex-col h-full bg-gray-900' : 'fixed inset-0 z-50 bg-gray-900 flex flex-col'}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0 flex-wrap">
        {!embedded && (
          <button onClick={onClose} title="Close (Esc)" className="p-1.5 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        )}
        <h2 className="font-bold text-white text-sm truncate flex-1 min-w-0">{lesson.title}</h2>

        {/* Save status */}
        {onSaveWhiteboard && (
          <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
            {saveStatus === 'saving'  && <span className="text-gray-400 flex items-center gap-1"><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Saving…</span>}
            {saveStatus === 'saved'   && <span className="text-emerald-400 flex items-center gap-1">✓ Saved</span>}
            {saveStatus === 'unsaved' && <span className="text-amber-400">● Unsaved</span>}
          </div>
        )}

        {/* Canvas toggle — always legible: amber text on darker bg */}
        <button onClick={() => setShowCanvas(v => !v)} title={showCanvas ? 'Hide whiteboard' : 'Show whiteboard'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors flex-shrink-0 whitespace-nowrap shadow-sm">
          {showCanvas ? (
            <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg><span>PDF Only</span></>
          ) : (
            <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg><span>Show Board</span></>
          )}
        </button>

        {/* Student selector — only shown when no pre-selected student */}
        {!preSelectedStudentId && students.length > 0 && (
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
            {isCompleted ? 'Done ✓' : 'Mark Done'}
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Left: PDF */}
        <div ref={pdfContainerRef}
          className={`${showCanvas ? 'w-1/2 border-r border-gray-600' : 'w-full'} relative flex items-center justify-center bg-gray-700 overflow-hidden transition-all`}>
          {loadingPdf && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-300 z-10 bg-gray-700">
              <svg className="animate-spin w-10 h-10" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
              <span className="text-sm">Loading PDF…</span>
            </div>
          )}
          {pdfError && <p className="absolute z-10 text-red-400 text-sm px-6 text-center">{pdfError}</p>}
          {iframeSrc ? (
            <iframe src={iframeSrc} title={lesson.title} className="w-full h-full bg-white" style={{ border: 'none' }} allowFullScreen
              onLoad={() => { setLoadingPdf(false); setPdfError(''); }}
              onError={() => { setLoadingPdf(false); setPdfError('Failed to load PDF.'); }} />
          ) : (
            !loadingPdf && <p className="text-gray-400 text-sm">No PDF attached to this lesson.</p>
          )}
        </div>

        {/* Right: Whiteboard */}
        <div className={`${showCanvas ? 'w-1/2 flex' : 'hidden'} flex-col`}>

          {/* ── Whiteboard toolbar ── */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-100 border-b border-gray-200 flex-shrink-0 flex-wrap select-none gap-y-1">

            {/* All tools including Select */}
            {([
              { id: 'select'      as DrawTool, label: 'Select / Move', icon: 'M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672Zm-7.518-.267A8.25 8.25 0 1 1 20.25 10.5M8.288 14.212A5.25 5.25 0 1 1 17.25 10.5' },
              { id: 'pen'         as DrawTool, label: 'Pen',           icon: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z' },
              { id: 'highlighter' as DrawTool, label: 'Highlight',     icon: 'M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42' },
              { id: 'eraser'      as DrawTool, label: 'Eraser',        icon: 'M12 9.75 14.25 12m0 0 2.25 2.25M14.25 12l2.25-2.25M14.25 12 12 14.25m-2.58 4.92-6.374-6.375a1.125 1.125 0 0 1 0-1.59l9.856-9.856a1.125 1.125 0 0 1 1.59 0l3.532 3.531a1.125 1.125 0 0 1 0 1.592L10.58 19.096a1.125 1.125 0 0 1-.83.354H7.998a.75.75 0 0 1-.75-.75v-1.332c0-.311.124-.61.344-.83Z' },
              { id: 'text'        as DrawTool, label: 'Text',          icon: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z' },
              { id: 'table'       as DrawTool, label: 'Table',         icon: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z' },
              { id: 'image'       as DrawTool, label: 'Image',         icon: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z' },
            ]).map(t => (
              <button key={t.id} onClick={() => { setTool(t.id); setSelectedId(null); setTableModal(null); }} title={t.label}
                disabled={t.id === 'image' && !onUploadImage}
                className={`p-1.5 rounded-lg transition-colors ${tool === t.id ? 'bg-teal-600 text-white' : 'text-gray-700 hover:bg-gray-200'} disabled:opacity-30`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d={t.icon} /></svg>
              </button>
            ))}

            {/* Import vocab table button */}
            {vocabWords && vocabWords.length > 0 && (
              <button onClick={insertVocabTable} title={`Import vocabulary table (${vocabWords.length} words)`}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Vocab
              </button>
            )}

            <div className="w-px h-5 bg-gray-300" />

            {/* Colors */}
            {COLORS.map(c => (
              <button key={c} onClick={() => applyColor(c)}
                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-transform ${color === c ? 'border-gray-700 scale-125' : 'border-transparent hover:scale-110'}`}
                style={{ backgroundColor: c, outline: c === '#ffffff' ? '1px solid #ccc' : undefined }} />
            ))}
            <label title="Custom colour" className="w-5 h-5 rounded-full border-2 border-dashed border-gray-400 flex items-center justify-center cursor-pointer hover:border-gray-600 relative overflow-hidden flex-shrink-0">
              <span className="text-gray-500 text-xs font-bold leading-none">+</span>
              <input type="color" value={color} onChange={e => applyColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>

            <div className="w-px h-5 bg-gray-300" />

            {/* Size slider */}
            {(tool === 'text' || selectedTextObj) ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-600">Size</span>
                <input type="range" min={10} max={96} step={2} value={selectedTextObj ? selectedTextObj.fontSize : fontSize} onChange={e => applySize(+e.target.value)} className="w-20 accent-teal-600" />
                <span className="text-xs text-gray-600 tabular-nums w-6">{selectedTextObj ? selectedTextObj.fontSize : fontSize}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-600">{tool === 'highlighter' ? 'Width' : tool === 'eraser' ? 'Size' : 'Width'}</span>
                <input type="range" min={1} max={20} step={1} value={lineWidth} onChange={e => setLineWidth(+e.target.value)} className="w-20 accent-teal-600" />
                <span className="text-xs text-gray-600 tabular-nums w-5">{lineWidth}</span>
              </div>
            )}

            <div className="w-px h-5 bg-gray-300" />

            {/* Delete selected */}
            {selectedId && (
              <button onClick={deleteSelected} title="Delete (Del)" className="p-1.5 rounded-lg text-red-500 hover:bg-red-100">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
              </button>
            )}

            {/* Undo */}
            <button onClick={undo} title="Undo (Ctrl+Z)" className="p-1.5 rounded-lg text-gray-700 hover:bg-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
            </button>

            {/* Clear */}
            <button onClick={clearBoard} title="Clear board" className="p-1.5 rounded-lg text-gray-700 hover:bg-red-100 hover:text-red-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>

            {/* Upload spinner */}
            {uploadingImg && <span className="text-xs text-gray-600 flex items-center gap-1"><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Uploading…</span>}
          </div>

          {/* Hint when object selected */}
          {selectedId && !editingTextId && (
            <div className="flex items-center gap-2 px-3 py-1 bg-teal-50 border-b border-teal-200 text-xs text-teal-700 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672Zm-7.518-.267A8.25 8.25 0 1 1 20.25 10.5M8.288 14.212A5.25 5.25 0 1 1 17.25 10.5" /></svg>
              {selectedTextObj ? 'Drag to move · Double-click to edit · Change colour/size above · Del to delete' : 'Drag to move · Del to delete'}
            </div>
          )}

          {/* ── Drawing surface ── */}
          <div ref={drawContRef} className="flex-1 relative overflow-hidden bg-white"
            onClick={onContainerClick}
            style={{ cursor: canvasCursor }}>

            {/* Strokes canvas */}
            <canvas ref={strokesRef} className="absolute inset-0"
              style={{ pointerEvents: isDrawTool ? 'auto' : 'none', cursor: tool === 'pen' || tool === 'highlighter' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'default' }}
              onMouseDown={onCanvasDown} onMouseMove={onCanvasMove}
              onMouseUp={onCanvasUp} onMouseLeave={onCanvasUp} />

            {/* ── Text objects ── */}
            {texts.map(obj => {
              const isSel  = selectedId  === obj.id;
              const isEdit = editingTextId === obj.id;
              return (
                <div key={obj.id} className="absolute wb-object"
                  style={{ left: obj.x, top: obj.y, zIndex: isSel ? 20 : 10, pointerEvents: isDrawTool ? 'none' : 'auto' }}
                  onMouseDown={isEdit ? undefined : e => onTextDown(e, obj)}
                  onDoubleClick={isEdit ? undefined : e => onTextDblClick(e, obj)}
                  onClick={e => e.stopPropagation()}>
                  {isEdit ? (
                    <textarea ref={editRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                      onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Escape') setEditingTextId(null); e.stopPropagation(); }}
                      rows={3} className="border-2 border-teal-500 rounded px-2 py-1 outline-none resize bg-white/95 shadow-lg min-w-[120px]"
                      style={{ fontSize: obj.fontSize, color: obj.color, lineHeight: 1.3 }} />
                  ) : (
                    <div className={`px-1 py-0.5 whitespace-pre-wrap cursor-move rounded ${isSel ? 'ring-2 ring-teal-500 ring-offset-1 bg-teal-50/20' : 'hover:ring-1 hover:ring-gray-300'}`}
                      style={{ fontSize: obj.fontSize, color: obj.color, lineHeight: 1.3, maxWidth: 420 }}>
                      {obj.text}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Table objects ── */}
            {tables.map(tbl => {
              const isSel = selectedId === tbl.id;
              const nCols = tbl.rows[0]?.length ?? 0;
              return (
                <div key={tbl.id} className="absolute wb-object"
                  style={{ left: tbl.x, top: tbl.y, zIndex: isSel ? 20 : 10, pointerEvents: isDrawTool ? 'none' : 'auto' }}
                  onClick={e => { e.stopPropagation(); setSelectedId(tbl.id); }}>
                  {/* Table controls (visible when selected) */}
                  {isSel && (
                    <div className="flex items-center gap-1 mb-1 flex-wrap">
                      {([['+ Row','addRow'],['+ Col','addCol'],['− Row','delRow'],['− Col','delCol']] as [string, 'addRow'|'addCol'|'delRow'|'delCol'][]).map(([label, op]) => (
                        <button key={op} onClick={e => { e.stopPropagation(); mutateTable(tbl.id, op); }}
                          className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${op.startsWith('−') || op.startsWith('d') ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'} border`}>
                          {label}
                        </button>
                      ))}
                      <span className="text-[10px] text-gray-500 ml-1">{tbl.rows.length}×{nCols}</span>
                    </div>
                  )}
                  {/* Drag handle (header row) */}
                  <div
                    onMouseDown={e => onTableHeaderDown(e, tbl)}
                    className={`cursor-move rounded-t-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide select-none ${isSel ? 'bg-teal-500 text-white ring-2 ring-teal-400' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                    style={{ width: nCols * tbl.cellW }}>
                    ⠿ Table {isSel ? '(drag to move)' : ''}
                  </div>
                  {/* Table grid */}
                  <div className={`border border-gray-300 rounded-b-lg overflow-hidden ${isSel ? 'ring-2 ring-teal-400' : ''}`}>
                    <table className="border-collapse" style={{ width: nCols * tbl.cellW }}>
                      <tbody>
                        {tbl.rows.map((row, r) => (
                          <tr key={r} className={r === 0 ? 'bg-amber-50' : r % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                            {row.map((cell, c) => (
                              <td key={c} style={{ width: tbl.cellW, height: tbl.cellH }} className="border border-gray-200 p-0">
                                <input
                                  value={cell}
                                  onChange={e => updateCell(tbl.id, r, c, e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  dir="auto"
                                  placeholder={r === 0 ? `Col ${c+1}` : ''}
                                  className={`w-full h-full px-1.5 py-1 text-xs bg-transparent focus:outline-none focus:bg-teal-50 placeholder-gray-300 ${r === 0 ? 'font-semibold' : ''}`}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* ── Image objects ── */}
            {images.map(img => {
              const isSel = selectedId === img.id;
              return (
                <div key={img.id} className="absolute wb-object"
                  style={{ left: img.x, top: img.y, width: img.w, height: img.h, zIndex: isSel ? 20 : 10, pointerEvents: isDrawTool ? 'none' : 'auto' }}
                  onMouseDown={e => onImgDown(e, img)}
                  onClick={e => { e.stopPropagation(); setSelectedId(img.id); }}>
                  <img src={img.src} alt="note" draggable={false}
                    className={`w-full h-full object-contain rounded-lg cursor-move select-none ${isSel ? 'ring-2 ring-teal-500 ring-offset-1' : 'hover:ring-1 hover:ring-gray-300'}`} />
                  {isSel && (
                    <div onMouseDown={e => onImgResizeDown(e, img)}
                      className="absolute bottom-0 right-0 w-4 h-4 bg-teal-500 rounded-tl cursor-nwse-resize flex items-center justify-center"
                      style={{ fontSize: 8, color: 'white' }}>⤡</div>
                  )}
                </div>
              );
            })}

            {/* ── New text input ── */}
            {newPos && (
              <div className="absolute z-30" style={{ left: newPos.x, top: newPos.y }} onClick={e => e.stopPropagation()}>
                <textarea ref={newRef} value={newVal} onChange={e => setNewVal(e.target.value)}
                  onBlur={commitNew}
                  onKeyDown={e => { if (e.key === 'Escape') { setNewPos(null); setNewVal(''); } e.stopPropagation(); }}
                  rows={2} placeholder="Type here…"
                  className="border-2 border-teal-500 rounded px-2 py-1 outline-none resize bg-white shadow-lg min-w-[140px]"
                  style={{ fontSize, color, lineHeight: 1.3 }} />
                <div className="flex gap-1 mt-1">
                  <button onMouseDown={e => { e.preventDefault(); commitNew(); }} className="px-2 py-0.5 bg-teal-600 text-white text-xs font-semibold rounded hover:bg-teal-700">Add</button>
                  <button onMouseDown={e => { e.preventDefault(); setNewPos(null); setNewVal(''); }} className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Table insert modal ── */}
      {tableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setTableModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-72 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 text-lg">Insert Table</h3>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600 mb-1 block">Rows: {tRows}</span>
              <input type="range" min={1} max={20} value={tRows} onChange={e => setTRows(+e.target.value)} className="w-full accent-teal-600" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600 mb-1 block">Columns: {tCols}</span>
              <input type="range" min={1} max={10} value={tCols} onChange={e => setTCols(+e.target.value)} className="w-full accent-teal-600" />
            </label>
            <p className="text-center text-sm text-gray-500 bg-gray-50 rounded-xl py-2">{tRows} rows × {tCols} columns</p>
            <div className="flex gap-3">
              <button onClick={() => setTableModal(null)} className="flex-1 py-2.5 text-sm font-semibold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200">Cancel</button>
              <button onClick={insertTable} className="flex-1 py-2.5 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700">Insert</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden image file input */}
      <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
    </div>
  );
};

export default TajweedLessonViewer;
