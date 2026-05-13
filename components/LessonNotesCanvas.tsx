// components/LessonNotesCanvas.tsx
// ---------------------------------------------------------------------------
// Block-based lesson notes editor with:
//   • Rich text paragraphs & headings
//   • Freehand drawing canvas (pen / highlighter / eraser)
//   • Tables with dynamic row/column control
//   • Image upload (stored in Supabase Storage)
//   • Auto-save to arabic_lesson_notes table
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getLessonNotes, saveLessonNotes, uploadNoteImage } from '../services/arabicService';

// ── Block types ────────────────────────────────────────────────────────────────

export type NoteBlock =
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'heading';   text: string; level: 1 | 2 | 3 }
  | { id: string; type: 'table';     rows: string[][] }
  | { id: string; type: 'image';     src: string; caption: string }
  | { id: string; type: 'drawing';   dataUrl: string; height: number }
  | { id: string; type: 'divider' };

let _id = 0;
const nid = () => `nb${++_id}_${Date.now()}`;

const mkParagraph  = (): NoteBlock => ({ id: nid(), type: 'paragraph', text: '' });
const mkHeading    = (level: 1|2|3 = 1): NoteBlock => ({ id: nid(), type: 'heading', text: '', level });
const mkTable      = (r = 3, c = 3): NoteBlock => ({ id: nid(), type: 'table', rows: Array.from({ length: r }, () => Array(c).fill('')) });
const mkDrawing    = (): NoteBlock => ({ id: nid(), type: 'drawing', dataUrl: '', height: 340 });
const mkDivider    = (): NoteBlock => ({ id: nid(), type: 'divider' });

// ═══════════════════════════════════════════════════════════════════════════════
// DrawingBlock — freehand canvas
// ═══════════════════════════════════════════════════════════════════════════════

type DrawTool = 'pen' | 'highlighter' | 'eraser';

const CANVAS_WIDTH = 1200; // internal resolution (displayed at 100% width via CSS)

const DrawingBlock: React.FC<{
  block: Extract<NoteBlock, { type: 'drawing' }>;
  onChange: (dataUrl: string) => void;
  onHeightChange: (h: number) => void;
}> = ({ block, onChange, onHeightChange }) => {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const drawing     = useRef(false);
  const lastPos     = useRef<{ x: number; y: number } | null>(null);
  const [tool,  setTool]  = useState<DrawTool>('pen');
  const [color, setColor] = useState('#1e293b');
  const [size,  setSize]  = useState(4);
  const [expanded, setExpanded] = useState(false);
  const initialized = useRef(false);

  // Load existing dataUrl onto canvas once on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (block.dataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = block.dataUrl;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = 'touches' in e ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const pos = getPos(e);
    lastPos.current = pos;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const r = tool === 'eraser' ? size * 6 : size / 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fillStyle = tool === 'eraser' ? '#ffffff'
      : tool === 'highlighter' ? color + '55'
      : color;
    ctx.fill();
  }

  function moveDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current || !lastPos.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.lineWidth = tool === 'eraser' ? size * 12
      : tool === 'highlighter' ? size * 6
      : size;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff'
      : tool === 'highlighter' ? color + '55'
      : color;
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.stroke();
    lastPos.current = pos;
  }

  function endDraw() {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    // restore compositing
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.globalCompositeOperation = 'source-over';
    onChange(canvasRef.current?.toDataURL('image/png') ?? '');
  }

  function clearCanvas() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    onChange('');
  }

  const displayH = expanded ? 600 : block.height;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-gray-600 overflow-hidden select-none">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-600">
        {/* Tool buttons */}
        {([['pen','✏️ Pen'],['highlighter','🖍 Highlight'],['eraser','🧹 Eraser']] as [DrawTool,string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTool(t)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
              tool === t
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-white dark:bg-gray-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-gray-600 hover:border-amber-400 dark:hover:border-amber-500'
            }`}>
            {label}
          </button>
        ))}
        <div className="w-px h-5 bg-slate-200 dark:bg-gray-600 mx-1" />
        {/* Color */}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Color</span>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="w-7 h-7 rounded-lg cursor-pointer border border-slate-200 dark:border-gray-600 p-0.5 bg-white dark:bg-gray-700" />
        </label>
        {/* Size */}
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Size</span>
          <input type="range" min={1} max={24} value={size} onChange={e => setSize(+e.target.value)}
            className="w-24 accent-amber-500" />
          <span className="text-xs text-slate-400 w-4">{size}</span>
        </label>
        <div className="flex-1" />
        {/* Canvas height */}
        <button onClick={() => { const h = expanded ? 340 : 600; setExpanded(e => !e); onHeightChange(h); }}
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 px-2 py-1 rounded transition-colors">
          {expanded ? '⤡ Shrink' : '⤢ Expand'}
        </button>
        <button onClick={clearCanvas}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
          Clear
        </button>
      </div>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={Math.round(displayH * (CANVAS_WIDTH / 800))}
        style={{ touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : 'crosshair', width: '100%', height: `${displayH}px`, display: 'block' }}
        className="bg-white"
        onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TableBlock
// ═══════════════════════════════════════════════════════════════════════════════

const TableBlock: React.FC<{
  rows: string[][];
  onChange: (rows: string[][]) => void;
}> = ({ rows, onChange }) => {
  const nRows = rows.length;
  const nCols = rows[0]?.length ?? 0;

  const setCell = (r: number, c: number, v: string) =>
    onChange(rows.map((row, ri) => row.map((cell, ci) => ri === r && ci === c ? v : cell)));

  const addRow    = () => onChange([...rows, Array(nCols).fill('')]);
  const addCol    = () => onChange(rows.map(row => [...row, '']));
  const removeRow = () => nRows > 1 && onChange(rows.slice(0, -1));
  const removeCol = () => nCols > 1 && onChange(rows.map(row => row.slice(0, -1)));

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Table {nRows}×{nCols}</span>
        <div className="flex gap-1.5">
          {[['+ Row', addRow], ['+ Col', addCol]].map(([label, fn]) => (
            <button key={label as string} onClick={fn as () => void}
              className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
              {label as string}
            </button>
          ))}
          {[['− Row', removeRow, nRows <= 1], ['− Col', removeCol, nCols <= 1]].map(([label, fn, dis]) => (
            <button key={label as string} onClick={fn as () => void} disabled={dis as boolean}
              className="px-2.5 py-1 text-xs font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {label as string}
            </button>
          ))}
        </div>
      </div>
      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-600">
        <table className="w-full border-collapse" style={{ minWidth: `${nCols * 120}px` }}>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={r === 0 ? 'bg-amber-50 dark:bg-amber-900/20' : r % 2 === 0 ? 'bg-slate-50 dark:bg-gray-800/60' : 'bg-white dark:bg-gray-800'}>
                {row.map((cell, c) => (
                  <td key={c} className="border border-slate-200 dark:border-gray-600 p-0">
                    <input
                      value={cell}
                      onChange={e => setCell(r, c, e.target.value)}
                      placeholder={r === 0 ? `Column ${c + 1}` : ''}
                      dir="auto"
                      className={`w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none focus:bg-amber-50/60 dark:focus:bg-amber-900/10 transition-colors placeholder-slate-300 dark:placeholder-gray-600 ${
                        r === 0 ? 'font-semibold text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'
                      }`}
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
};

// ═══════════════════════════════════════════════════════════════════════════════
// Auto-resize textarea helper
// ═══════════════════════════════════════════════════════════════════════════════

const AutoTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  dir?: string;
}> = ({ value, onChange, placeholder, className, dir }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = ref.current.scrollHeight + 'px'; }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      dir={dir ?? 'auto'}
      rows={1}
      className={className}
      style={{ resize: 'none', overflow: 'hidden' }}
    />
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Block wrapper (move up/down, delete)
// ═══════════════════════════════════════════════════════════════════════════════

const BlockWrapper: React.FC<{
  children: React.ReactNode;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  label: string;
}> = ({ children, isFirst, isLast, onMoveUp, onMoveDown, onDelete, label }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Side controls — visible on hover */}
      <div className={`absolute -left-10 top-1 flex flex-col gap-0.5 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        <button onClick={onMoveUp} disabled={isFirst} title="Move up"
          className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 disabled:opacity-30 shadow-sm transition-colors text-xs">
          ↑
        </button>
        <button onClick={onMoveDown} disabled={isLast} title="Move down"
          className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 disabled:opacity-30 shadow-sm transition-colors text-xs">
          ↓
        </button>
      </div>
      {/* Type badge + delete — visible on hover */}
      <div className={`absolute -right-2 -top-2 flex items-center gap-1 transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-gray-700 text-slate-400 dark:text-slate-500 rounded uppercase tracking-wide">{label}</span>
        <button onClick={onDelete} title="Delete block"
          className="w-5 h-5 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400 hover:bg-red-500 dark:hover:bg-red-600 hover:text-white transition-colors text-xs leading-none">
          ×
        </button>
      </div>
      {children}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Add-block button strip
// ═══════════════════════════════════════════════════════════════════════════════

const AddBlockStrip: React.FC<{
  onAdd: (block: NoteBlock) => void;
  uploading: boolean;
  onImageFile: (file: File) => void;
}> = ({ onAdd, uploading, onImageFile }) => {
  const imgRef = useRef<HTMLInputElement>(null);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tRows, setTRows] = useState(3);
  const [tCols, setTCols] = useState(3);

  const BTNS: { label: string; icon: string; action: () => void }[] = [
    { label: 'Paragraph', icon: '¶',  action: () => onAdd(mkParagraph()) },
    { label: 'Heading 1', icon: 'H1', action: () => onAdd(mkHeading(1)) },
    { label: 'Heading 2', icon: 'H2', action: () => onAdd(mkHeading(2)) },
    { label: 'Heading 3', icon: 'H3', action: () => onAdd(mkHeading(3)) },
    { label: 'Table',     icon: '⊞',  action: () => setShowTableModal(true) },
    { label: 'Drawing',   icon: '✏',  action: () => onAdd(mkDrawing()) },
    { label: 'Image',     icon: '🖼',  action: () => imgRef.current?.click() },
    { label: 'Divider',   icon: '—',  action: () => onAdd(mkDivider()) },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-gray-800/80 border border-slate-200 dark:border-gray-700 rounded-xl">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mr-1">Insert</span>
        {BTNS.map(b => (
          <button key={b.label} onClick={b.action} disabled={b.label === 'Image' && uploading}
            title={b.label}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-gray-600 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 hover:text-amber-700 dark:hover:text-amber-300 transition-colors disabled:opacity-50">
            <span className="font-mono">{b.icon}</span>
            <span className="hidden sm:inline">{b.label}</span>
          </button>
        ))}
        <input ref={imgRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onImageFile(f); e.target.value = ''; }} />
      </div>

      {/* Table config modal */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-slate-200 dark:border-gray-700 p-6 w-80 space-y-5">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Insert Table</h3>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1.5 block">Rows: {tRows}</span>
                <input type="range" min={1} max={20} value={tRows} onChange={e => setTRows(+e.target.value)}
                  className="w-full accent-amber-500" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1.5 block">Columns: {tCols}</span>
                <input type="range" min={1} max={10} value={tCols} onChange={e => setTCols(+e.target.value)}
                  className="w-full accent-amber-500" />
              </label>
            </div>
            <div className="flex items-center justify-center gap-3 py-2 text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-gray-700/50 rounded-xl">
              <span className="font-mono text-2xl text-amber-500">⊞</span>
              <span>{tRows} rows × {tCols} columns</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowTableModal(false)}
                className="flex-1 py-2.5 text-sm font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button onClick={() => { onAdd(mkTable(tRows, tCols)); setShowTableModal(false); setTRows(3); setTCols(3); }}
                className="flex-1 py-2.5 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors">
                Insert Table
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════════

interface Props {
  lessonId: string;
  authorId: string;       // studentId if in student context, else teacherId
  authorLabel?: string;   // shown in header for clarity
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'idle';

const LessonNotesCanvas: React.FC<Props> = ({ lessonId, authorId, authorLabel }) => {
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saveStatus, setSave]   = useState<SaveStatus>('idle');
  const [uploading, setUploading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>('');

  // Load on mount
  useEffect(() => {
    getLessonNotes(lessonId, authorId).then(data => {
      setBlocks(data.length ? data : [mkParagraph()]);
      setLoading(false);
      lastSaved.current = JSON.stringify(data.length ? data : []);
    });
  }, [lessonId, authorId]);

  // Auto-save: debounce 1.5 s after any change
  const scheduleSave = useCallback((newBlocks: NoteBlock[]) => {
    const serialized = JSON.stringify(newBlocks);
    if (serialized === lastSaved.current) return;
    setSave('unsaved');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSave('saving');
      await saveLessonNotes(lessonId, authorId, newBlocks);
      lastSaved.current = serialized;
      setSave('saved');
      setTimeout(() => setSave('idle'), 2500);
    }, 1500);
  }, [lessonId, authorId]);

  const updateBlocks = useCallback((next: NoteBlock[]) => {
    setBlocks(next);
    scheduleSave(next);
  }, [scheduleSave]);

  // Cleanup timer on unmount — save immediately
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        // Fire save immediately on unmount
        const current = blocks;
        saveLessonNotes(lessonId, authorId, current).catch(console.error);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Block mutators
  const updateBlock = (id: string, patch: Partial<NoteBlock>) =>
    updateBlocks(blocks.map(b => b.id === id ? { ...b, ...patch } as NoteBlock : b));
  const deleteBlock = (id: string) =>
    updateBlocks(blocks.filter(b => b.id !== id).length ? blocks.filter(b => b.id !== id) : [mkParagraph()]);
  const moveUp   = (idx: number) => { if (idx === 0) return; const n = [...blocks]; [n[idx-1], n[idx]] = [n[idx], n[idx-1]]; updateBlocks(n); };
  const moveDown = (idx: number) => { if (idx === blocks.length-1) return; const n = [...blocks]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; updateBlocks(n); };
  const addBlock = (b: NoteBlock) => updateBlocks([...blocks, b]);

  // Image upload handler
  const handleImageFile = async (file: File) => {
    setUploading(true);
    const url = await uploadNoteImage(lessonId, authorId, file);
    setUploading(false);
    if (url) {
      addBlock({ id: nid(), type: 'image', src: url, caption: '' });
    } else {
      alert('Image upload failed. Check your Supabase storage bucket policy.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-3 border-amber-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  const blockLabel = (b: NoteBlock) => {
    if (b.type === 'heading') return `H${b.level}`;
    return b.type;
  };

  return (
    <div className="h-full flex flex-col">
      {/* ── Sticky header ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-slate-700 dark:text-slate-200">📓 Notes & Canvas</span>
          {authorLabel && (
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full">
              {authorLabel}
            </span>
          )}
        </div>
        {/* Save status */}
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Saving…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === 'unsaved' && (
            <span className="text-xs text-amber-500 font-medium">● Unsaved</span>
          )}
          {/* Manual save */}
          <button
            onClick={async () => {
              if (saveTimer.current) clearTimeout(saveTimer.current);
              setSave('saving');
              await saveLessonNotes(lessonId, authorId, blocks);
              lastSaved.current = JSON.stringify(blocks);
              setSave('saved');
              setTimeout(() => setSave('idle'), 2500);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Save
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-10 py-8 space-y-6">

          {/* Insert toolbar */}
          <AddBlockStrip onAdd={addBlock} uploading={uploading} onImageFile={handleImageFile} />

          {/* Blocks */}
          {blocks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-600">
              <span className="text-5xl mb-3">📓</span>
              <p className="text-sm">Click an insert button above to start your notes</p>
            </div>
          )}

          <div className="space-y-5 pl-10">
            {blocks.map((block, idx) => (
              <BlockWrapper
                key={block.id}
                isFirst={idx === 0}
                isLast={idx === blocks.length - 1}
                onMoveUp={() => moveUp(idx)}
                onMoveDown={() => moveDown(idx)}
                onDelete={() => deleteBlock(block.id)}
                label={blockLabel(block)}
              >
                {/* ── Paragraph ── */}
                {block.type === 'paragraph' && (
                  <AutoTextarea
                    value={block.text}
                    onChange={v => updateBlock(block.id, { text: v })}
                    placeholder="Type your notes here…"
                    className="w-full px-4 py-3 text-base text-slate-700 dark:text-slate-200 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500 leading-relaxed placeholder-slate-300 dark:placeholder-gray-600 transition-colors"
                  />
                )}

                {/* ── Heading ── */}
                {block.type === 'heading' && (
                  <input
                    value={block.text}
                    onChange={e => updateBlock(block.id, { text: e.target.value })}
                    placeholder={`Heading ${block.level}`}
                    dir="auto"
                    className={`w-full px-4 py-2 bg-transparent border-b-2 border-amber-300 dark:border-amber-700 focus:outline-none focus:border-amber-500 dark:focus:border-amber-400 text-slate-800 dark:text-slate-100 font-extrabold placeholder-slate-300 dark:placeholder-gray-600 transition-colors ${
                      block.level === 1 ? 'text-3xl' : block.level === 2 ? 'text-2xl' : 'text-xl'
                    }`}
                  />
                )}

                {/* ── Divider ── */}
                {block.type === 'divider' && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px bg-slate-300 dark:bg-gray-600" />
                    <span className="text-slate-300 dark:text-gray-600 text-xs">✦</span>
                    <div className="flex-1 h-px bg-slate-300 dark:bg-gray-600" />
                  </div>
                )}

                {/* ── Table ── */}
                {block.type === 'table' && (
                  <TableBlock
                    rows={block.rows}
                    onChange={rows => updateBlock(block.id, { rows })}
                  />
                )}

                {/* ── Image ── */}
                {block.type === 'image' && (
                  <div className="space-y-2">
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-800">
                      <img src={block.src} alt={block.caption || 'Note image'} className="max-w-full h-auto block mx-auto" style={{ maxHeight: 500 }} />
                    </div>
                    <input
                      value={block.caption}
                      onChange={e => updateBlock(block.id, { caption: e.target.value })}
                      placeholder="Add a caption…"
                      className="w-full px-3 py-1.5 text-sm text-center text-slate-500 dark:text-slate-400 bg-transparent border-b border-slate-200 dark:border-gray-700 focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors placeholder-slate-300 dark:placeholder-gray-600 italic"
                    />
                  </div>
                )}

                {/* ── Drawing ── */}
                {block.type === 'drawing' && (
                  <DrawingBlock
                    block={block}
                    onChange={dataUrl => updateBlock(block.id, { dataUrl })}
                    onHeightChange={height => updateBlock(block.id, { height })}
                  />
                )}
              </BlockWrapper>
            ))}
          </div>

          {/* Bottom spacer */}
          <div className="h-16" />
        </div>
      </div>
    </div>
  );
};

export default LessonNotesCanvas;
