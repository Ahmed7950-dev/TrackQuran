// components/TajweedLessonEditor.tsx
// -----------------------------------------------------------------------------
// Admin-only slide editor.
//   • 1280×720 virtual canvas (scales responsively)
//   • Click an element to select; toolbar shows context-sensitive controls
//   • Drag to move, resize handles on each corner
//   • Add text / add image / change background / delete
//   • Save persists slides JSONB back to tajweed_lessons
// -----------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { Slide, SlideElement, TajweedLesson, TextElement, ImageElement } from '../types';
import { updateLesson, uploadSlideImage } from '../services/tajweedService';

const CANVAS_W = 1280;
const CANVAS_H = 720;

interface Props {
  lesson: TajweedLesson;
  onClose: () => void;
  onSaved: (lesson: TajweedLesson) => void;
}

const TajweedLessonEditor: React.FC<Props> = ({ lesson, onClose, onSaved }) => {
  const [title,        setTitle]        = useState(lesson.title);
  const [description,  setDescription]  = useState(lesson.description ?? '');
  const [slides,       setSlides]       = useState<Slide[]>(lesson.slides);
  const [currentIdx,   setCurrentIdx]   = useState(0);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [dirty,        setDirty]        = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // ── Compute scale so canvas fits within stage container ────────────────────
  useEffect(() => {
    const compute = () => {
      const el = stageRef.current; if (!el) return;
      const w = el.clientWidth, h = el.clientHeight;
      setScale(Math.min(w / CANVAS_W, h / CANVAS_H));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const slide = slides[currentIdx];
  const selectedEl = slide?.elements.find(e => e.id === selectedElId) ?? null;

  const updateSlide = (mutate: (s: Slide) => Slide) => {
    setSlides(prev => prev.map((s, i) => (i === currentIdx ? mutate(s) : s)));
    setDirty(true);
  };
  const updateEl = (id: string, patch: Partial<SlideElement>) => {
    updateSlide(s => ({
      ...s,
      elements: s.elements.map(el => (el.id === id ? ({ ...el, ...patch } as SlideElement) : el)),
    }));
  };
  const removeEl = (id: string) => {
    updateSlide(s => ({ ...s, elements: s.elements.filter(el => el.id !== id) }));
    setSelectedElId(null);
  };
  const newId = () => `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const addText = () => {
    const el: TextElement = {
      type: 'text', id: newId(),
      x: 100, y: 100, w: 600, h: 100,
      text: 'New text',
      fontSize: 32, color: '#1e293b', bold: false, align: 'left',
    };
    updateSlide(s => ({ ...s, elements: [...s.elements, el] }));
    setSelectedElId(el.id);
  };

  const handleAddImage = async (file: File) => {
    const url = await uploadSlideImage(file);
    if (!url) return;
    const el: ImageElement = {
      type: 'image', id: newId(),
      x: 100, y: 100, w: 400, h: 300, url,
    };
    updateSlide(s => ({ ...s, elements: [...s.elements, el] }));
    setSelectedElId(el.id);
  };

  // ── Slide management ───────────────────────────────────────────────────────
  const addSlideAfter = () => {
    const newSlide: Slide = { id: `slide-${Date.now()}`, background: '#ffffff', elements: [] };
    setSlides(prev => [...prev.slice(0, currentIdx + 1), newSlide, ...prev.slice(currentIdx + 1)]);
    setCurrentIdx(currentIdx + 1);
    setSelectedElId(null);
    setDirty(true);
  };
  const removeCurrentSlide = () => {
    if (slides.length === 1) return;
    if (!confirm('Delete this slide?')) return;
    setSlides(prev => prev.filter((_, i) => i !== currentIdx));
    setCurrentIdx(Math.max(0, currentIdx - 1));
    setSelectedElId(null);
    setDirty(true);
  };
  const moveSlide = (dir: -1 | 1) => {
    const j = currentIdx + dir;
    if (j < 0 || j >= slides.length) return;
    setSlides(prev => {
      const next = [...prev];
      [next[currentIdx], next[j]] = [next[j], next[currentIdx]];
      return next;
    });
    setCurrentIdx(j);
    setDirty(true);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    const ok = await updateLesson(lesson.id, { title, description, slides });
    setSaving(false);
    if (ok) {
      setDirty(false);
      onSaved({ ...lesson, title, description, slides });
    } else {
      alert('Failed to save');
    }
  };

  // ── Drag / resize handlers (mouse-based) ───────────────────────────────────
  type DragMode = 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br';
  const dragRef = useRef<{
    mode: DragMode; id: string;
    startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  } | null>(null);

  const onElMouseDown = (e: React.MouseEvent, el: SlideElement, mode: DragMode) => {
    e.stopPropagation();
    setSelectedElId(el.id);
    dragRef.current = {
      mode, id: el.id,
      startX: e.clientX, startY: e.clientY,
      origX: el.x, origY: el.y, origW: el.w, origH: el.h,
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  };
  const onMouseMove = (e: MouseEvent) => {
    const d = dragRef.current; if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    let { origX: x, origY: y, origW: w, origH: h } = d;
    switch (d.mode) {
      case 'move':      x = d.origX + dx; y = d.origY + dy; break;
      case 'resize-br': w = Math.max(40, d.origW + dx); h = Math.max(20, d.origH + dy); break;
      case 'resize-bl': x = d.origX + dx; w = Math.max(40, d.origW - dx); h = Math.max(20, d.origH + dy); break;
      case 'resize-tr': y = d.origY + dy; w = Math.max(40, d.origW + dx); h = Math.max(20, d.origH - dy); break;
      case 'resize-tl': x = d.origX + dx; y = d.origY + dy; w = Math.max(40, d.origW - dx); h = Math.max(20, d.origH - dy); break;
    }
    // Clamp inside canvas
    x = Math.max(0, Math.min(CANVAS_W - w, x));
    y = Math.max(0, Math.min(CANVAS_H - h, y));
    updateEl(d.id, { x, y, w, h });
  };
  const onMouseUp = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup',   onMouseUp);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onMouseUp(), []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!slide) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 flex flex-col" dir="ltr">
      {/* ── Top bar ── */}
      <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center gap-3 border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700" title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
          </svg>
        </button>
        <input
          value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }}
          className="flex-1 text-lg font-bold bg-transparent text-slate-800 dark:text-slate-100 px-2 py-1 rounded focus:bg-slate-100 dark:focus:bg-gray-700 focus:outline-none"
        />
        <span className="text-xs text-slate-400">{dirty ? 'Unsaved' : 'Saved'}</span>
        <button
          onClick={handleSave} disabled={!dirty || saving}
          className="px-4 py-1.5 bg-teal-600 text-white font-semibold rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >{saving ? 'Saving…' : 'Save'}</button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 flex min-h-0">
        {/* ── Slide thumbnails sidebar ── */}
        <aside className="w-44 bg-slate-100 dark:bg-gray-900 overflow-y-auto p-2 flex-shrink-0 border-r border-slate-200 dark:border-gray-700">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setCurrentIdx(i); setSelectedElId(null); }}
              className={`w-full mb-2 rounded-md overflow-hidden border-2 transition-all ${
                i === currentIdx ? 'border-teal-500 shadow-md' : 'border-slate-300 dark:border-gray-700 hover:border-teal-300'
              }`}
            >
              <div className="relative w-full" style={{ paddingTop: `${(CANVAS_H / CANVAS_W) * 100}%`, background: s.background ?? '#fff' }}>
                <div className="absolute inset-0 overflow-hidden">
                  <div style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${175 / CANVAS_W})`, transformOrigin: 'top left' }}>
                    <SlideContent slide={s} />
                  </div>
                </div>
                <div className="absolute top-0.5 left-0.5 bg-slate-700 text-white text-[10px] font-bold rounded px-1.5">{i + 1}</div>
              </div>
            </button>
          ))}
          <button
            onClick={addSlideAfter}
            className="w-full p-3 text-sm font-semibold text-teal-700 dark:text-teal-300 border-2 border-dashed border-teal-300 dark:border-teal-700 rounded-md hover:bg-teal-50 dark:hover:bg-teal-900/30 mt-2"
          >+ New slide</button>
        </aside>

        {/* ── Stage (canvas) ── */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-200 dark:bg-gray-900">
          <div ref={stageRef} className="flex-1 flex items-center justify-center p-6 min-h-0" onClick={() => setSelectedElId(null)}>
            <div
              className="relative shadow-2xl"
              style={{
                width:  CANVAS_W * scale,
                height: CANVAS_H * scale,
                background: slide.background ?? '#ffffff',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Inner unscaled canvas, then scale wrapper */}
              <div style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                {slide.elements.map(el => (
                  <EditableElement
                    key={el.id} el={el}
                    selected={el.id === selectedElId}
                    onMouseDown={onElMouseDown}
                    onTextChange={text => updateEl(el.id, { text } as Partial<TextElement>)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Bottom toolbar (slide nav + slide controls) ── */}
          <div className="bg-white dark:bg-gray-800 border-t border-slate-200 dark:border-gray-700 px-4 py-2 flex items-center gap-3 flex-wrap">
            <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={currentIdx === 0}
              className="px-3 py-1.5 bg-slate-200 dark:bg-gray-700 rounded text-sm disabled:opacity-40">‹ Prev</button>
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{currentIdx + 1} / {slides.length}</span>
            <button onClick={() => setCurrentIdx(i => Math.min(slides.length - 1, i + 1))} disabled={currentIdx === slides.length - 1}
              className="px-3 py-1.5 bg-slate-200 dark:bg-gray-700 rounded text-sm disabled:opacity-40">Next ›</button>
            <div className="w-px h-5 bg-slate-300" />
            <button onClick={() => moveSlide(-1)} disabled={currentIdx === 0}
              className="px-2 py-1 text-xs text-slate-600 dark:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-gray-700 disabled:opacity-40">↑ Move up</button>
            <button onClick={() => moveSlide(1)} disabled={currentIdx === slides.length - 1}
              className="px-2 py-1 text-xs text-slate-600 dark:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-gray-700 disabled:opacity-40">Move down ↓</button>
            <button onClick={removeCurrentSlide} disabled={slides.length === 1}
              className="px-2 py-1 text-xs text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-40 ml-auto">Delete slide</button>
          </div>
        </main>

        {/* ── Right toolbar ── */}
        <aside className="w-72 bg-white dark:bg-gray-800 overflow-y-auto p-4 border-l border-slate-200 dark:border-gray-700 flex-shrink-0 space-y-4">
          {/* Add tools */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Add</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={addText}
                className="px-3 py-2 bg-teal-600 text-white text-sm font-semibold rounded-md hover:bg-teal-700">+ Text</button>
              <label className="px-3 py-2 bg-amber-600 text-white text-sm font-semibold rounded-md hover:bg-amber-700 cursor-pointer text-center">
                + Image
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleAddImage(f); e.currentTarget.value = ''; }} />
              </label>
            </div>
          </div>

          {/* Background */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Background</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={slide.background ?? '#ffffff'}
                onChange={e => updateSlide(s => ({ ...s, background: e.target.value }))}
                className="w-10 h-10 rounded border border-slate-300"
              />
              <input
                type="text"
                value={slide.background ?? '#ffffff'}
                onChange={e => updateSlide(s => ({ ...s, background: e.target.value }))}
                className="flex-1 px-2 py-1.5 text-sm border border-slate-300 dark:border-gray-600 rounded font-mono dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          {/* Selected element controls */}
          {selectedEl && (
            <div className="border-t border-slate-200 dark:border-gray-700 pt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Selected {selectedEl.type === 'text' ? 'Text' : 'Image'}
              </p>

              {selectedEl.type === 'text' && (
                <>
                  <textarea
                    value={selectedEl.text}
                    onChange={e => updateEl(selectedEl.id, { text: e.target.value } as Partial<TextElement>)}
                    rows={3}
                    className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Font size</span>
                      <input
                        type="number" min={10} max={120}
                        value={selectedEl.fontSize}
                        onChange={e => updateEl(selectedEl.id, { fontSize: Number(e.target.value) || 16 } as Partial<TextElement>)}
                        className="w-full px-2 py-1 border border-slate-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Color</span>
                      <input
                        type="color" value={selectedEl.color}
                        onChange={e => updateEl(selectedEl.id, { color: e.target.value } as Partial<TextElement>)}
                        className="w-full h-7 rounded border border-slate-300"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateEl(selectedEl.id, { bold: !selectedEl.bold } as Partial<TextElement>)}
                      className={`flex-1 px-2 py-1 text-xs rounded ${selectedEl.bold ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-gray-700'}`}
                    >Bold</button>
                    {(['left', 'center', 'right'] as const).map(a => (
                      <button key={a}
                        onClick={() => updateEl(selectedEl.id, { align: a } as Partial<TextElement>)}
                        className={`flex-1 px-2 py-1 text-xs rounded capitalize ${selectedEl.align === a ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-gray-700'}`}
                      >{a}</button>
                    ))}
                  </div>
                  <label className="text-xs block">
                    <span className="text-slate-500 dark:text-slate-400">Font family</span>
                    <select
                      value={selectedEl.fontFamily ?? ''}
                      onChange={e => updateEl(selectedEl.id, { fontFamily: e.target.value || undefined } as Partial<TextElement>)}
                      className="w-full px-2 py-1 border border-slate-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                    >
                      <option value="">Default (Sans-serif)</option>
                      <option value="Hafs">Hafs (Quranic)</option>
                      <option value="Amiri Regular">Amiri (Quranic)</option>
                      <option value="serif">Serif</option>
                      <option value="monospace">Monospace</option>
                    </select>
                  </label>
                </>
              )}

              {selectedEl.type === 'image' && (
                <p className="text-xs text-slate-400 break-all">URL: {selectedEl.url}</p>
              )}

              {/* Position / size readout */}
              <div className="grid grid-cols-4 gap-1 text-xs text-slate-500">
                <span>X {Math.round(selectedEl.x)}</span>
                <span>Y {Math.round(selectedEl.y)}</span>
                <span>W {Math.round(selectedEl.w)}</span>
                <span>H {Math.round(selectedEl.h)}</span>
              </div>

              <button
                onClick={() => removeEl(selectedEl.id)}
                className="w-full px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded hover:bg-red-700"
              >Delete element</button>
            </div>
          )}

          {!selectedEl && (
            <p className="text-xs text-slate-400 italic border-t border-slate-200 dark:border-gray-700 pt-4">
              Click any element on the slide to edit it. Drag to move; drag the corners to resize.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Editable element rendered on the canvas. Includes drag region + resize handles
// when selected. Double-click on text to edit inline.
// -----------------------------------------------------------------------------
const EditableElement: React.FC<{
  el: SlideElement;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent, el: SlideElement, mode: 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br') => void;
  onTextChange: (text: string) => void;
}> = ({ el, selected, onMouseDown, onTextChange }) => {
  const [editing, setEditing] = useState(false);
  return (
    <div
      style={{
        position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h,
        cursor: editing ? 'text' : 'move',
        boxShadow: selected ? '0 0 0 2px #14b8a6' : 'none',
      }}
      onMouseDown={e => !editing && onMouseDown(e, el, 'move')}
      onDoubleClick={() => el.type === 'text' && setEditing(true)}
    >
      {el.type === 'text' && (
        editing ? (
          <textarea
            autoFocus
            value={el.text}
            onChange={e => onTextChange(e.target.value)}
            onBlur={() => setEditing(false)}
            style={{
              width: '100%', height: '100%',
              fontSize: el.fontSize, color: el.color,
              fontWeight: el.bold ? 700 : 400, textAlign: el.align,
              fontFamily: el.fontFamily ?? 'inherit',
              background: 'rgba(255,255,255,0.95)',
              border: '2px solid #14b8a6', borderRadius: 4,
              padding: 4, outline: 'none', resize: 'none',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%', height: '100%',
              fontSize: el.fontSize, color: el.color,
              fontWeight: el.bold ? 700 : 400, textAlign: el.align,
              fontFamily: el.fontFamily ?? 'inherit',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden',
              userSelect: 'none',
            }}
            dir="auto"
          >{el.text}</div>
        )
      )}
      {el.type === 'image' && (
        <img src={el.url} alt="" draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }} />
      )}
      {selected && (
        <>
          {(['tl', 'tr', 'bl', 'br'] as const).map(corner => (
            <div
              key={corner}
              onMouseDown={e => onMouseDown(e, el, `resize-${corner}` as 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br')}
              style={{
                position: 'absolute', width: 14, height: 14,
                background: '#14b8a6', border: '2px solid white', borderRadius: 2,
                cursor: corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize',
                top:    corner.startsWith('t') ? -7 : undefined,
                bottom: corner.startsWith('b') ? -7 : undefined,
                left:   corner.endsWith('l')   ? -7 : undefined,
                right:  corner.endsWith('r')   ? -7 : undefined,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Read-only renderer used by thumbnails AND the live viewer (no interactions).
// -----------------------------------------------------------------------------
export const SlideContent: React.FC<{ slide: Slide }> = ({ slide }) => (
  <div style={{ position: 'relative', width: '100%', height: '100%', background: slide.background ?? '#ffffff', overflow: 'hidden' }}>
    {slide.elements.map(el => (
      <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h }}>
        {el.type === 'text' && (
          <div style={{
            width: '100%', height: '100%',
            fontSize: el.fontSize, color: el.color,
            fontWeight: el.bold ? 700 : 400, textAlign: el.align,
            fontFamily: el.fontFamily ?? 'inherit',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden',
          }} dir="auto">{el.text}</div>
        )}
        {el.type === 'image' && (
          <img src={el.url} alt="" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
      </div>
    ))}
  </div>
);

export default TajweedLessonEditor;
