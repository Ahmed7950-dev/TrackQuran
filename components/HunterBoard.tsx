// components/HunterBoard.tsx
// -----------------------------------------------------------------------------
// The shared board of the Write round.
//
// The same component is the whole screen on a phone that scanned the code and
// the white rectangle in the middle of the lesson screen — what changes is the
// role, not the drawing. The screen the lesson is run from is the HOST: guests
// send their ink to it and it mirrors every stroke back out, so a tablet and a
// phone that cannot see each other still draw on the same board.
//
// Ink arrives in pieces while a stroke is still being drawn (`ink`), and the
// piece carries the stroke's id, so a line appears as it is made instead of
// jumping into place when the finger lifts.
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createGameChannel, type P2PGameChannel } from '../services/p2pGameChannel';
import {
  BOARD_RATIO, PENS, NIBS, ERASER_NIBS, boardChannel, layersFor, newStrokeId, paintStroke,
  type InkOwner, type Stroke,
} from '../services/hunterBoardService';

type Tool = 'pen' | 'eraser';

interface Props {
  /** null for a board nobody else is on — homework, where there is no room. */
  roomId: string | null;
  me: InkOwner;
  /** The lesson screen holds the room open and mirrors everyone's ink. */
  isHost: boolean;
  /** Cleared when a new letter is set — the board starts empty each time. */
  round: number;
  /** Ink already on the board (a submitted drawing the tutor is marking). */
  initial?: Stroke[];
  /** Fires on every finished stroke, so the owner can keep what was drawn. */
  onStrokes?: (strokes: Stroke[]) => void;
  /** Hide the tools — a drawing being looked at rather than made. */
  readOnly?: boolean;
  /** Host only: how many devices are drawing. */
  onPeers?: (n: number) => void;
  className?: string;
}

const PAPER = '#FBFAF6';

const HunterBoard: React.FC<Props> = ({ roomId, me, isHost, round, initial, onStrokes, onPeers, readOnly, className }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tutorRef = useRef<HTMLCanvasElement>(null);
  const studentRef = useRef<HTMLCanvasElement>(null);
  const chanRef = useRef<P2PGameChannel | null>(null);

  const strokesRef = useRef<Stroke[]>(initial ?? []);
  const openRef = useRef<Map<string, Stroke>>(new Map());
  const drawingRef = useRef<Stroke | null>(null);
  const peersRef = useRef<Map<string, number>>(new Map());
  /** This device, so its own ink does not come back and get painted twice. */
  const pidRef = useRef<string>(Math.random().toString(36).slice(2, 10));

  const [tool, setTool] = useState<Tool>('pen');
  const [colour, setColour] = useState(PENS[0].hex);
  const [nib, setNib] = useState(1);
  const [size, setSize] = useState({ w: 0, h: 0 });

  /* ── the canvases ── */
  const layer = (o: InkOwner) => (o === 'tutor' ? tutorRef.current : studentRef.current);

  const redraw = useCallback(() => {
    const { w, h } = { w: tutorRef.current?.width ?? 0, h: tutorRef.current?.height ?? 0 };
    if (!w || !h) return;
    for (const o of ['tutor', 'student'] as InkOwner[]) {
      const ctx = layer(o)?.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, w, h);
    }
    const all = [...strokesRef.current, ...openRef.current.values()];
    for (const s of all) {
      for (const o of layersFor(s)) {
        const ctx = layer(o)?.getContext('2d');
        if (ctx) paintStroke(ctx, s, w, h);
      }
    }
  }, []);

  /** Draw one stroke without rebuilding the board — the live path. */
  const paintOne = useCallback((s: Stroke) => {
    const w = tutorRef.current?.width ?? 0, h = tutorRef.current?.height ?? 0;
    if (!w) return;
    // An eraser has to be replayed from the start of the board, or the ink it
    // already took out comes back when a later stroke is painted over it.
    if (s.erase) { redraw(); return; }
    const ctx = layer(s.owner)?.getContext('2d');
    if (ctx) paintStroke(ctx, s, w, h);
  }, [redraw]);

  /* ── size: a 4:3 box, letterboxed into whatever room there is ── */
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current;
      if (!el) return;
      const bw = el.clientWidth, bh = el.clientHeight;
      if (!bw || !bh) return;
      const w = Math.min(bw, bh * BOARD_RATIO);
      const h = w / BOARD_RATIO;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const ref of [tutorRef, studentRef]) {
        const c = ref.current;
        if (!c) continue;
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
      setSize({ w, h });
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('orientationchange', fit);
    return () => { ro.disconnect(); window.removeEventListener('orientationchange', fit); };
  }, [redraw]);

  /* ── a new letter wipes the board, everywhere ── */
  const firstRound = useRef(true);
  useEffect(() => {
    strokesRef.current = initial ?? [];
    openRef.current.clear();
    redraw();
    // The phones cannot see that the tutor moved on, so the lesson screen tells
    // them. Not on the first one: there is nothing to clear, and the room may
    // not be up yet.
    if (isHost && !firstRound.current) chanRef.current?.send({ type: 'broadcast', event: 'wipe', payload: { round } });
    firstRound.current = false;
  }, [round, initial, redraw, isHost]);

  /* ── the room ── */
  useEffect(() => {
    // Homework is drawn alone: no room, no channel, nothing to mirror.
    if (!roomId) return;
    const ch = createGameChannel(boardChannel(roomId), isHost ? 'host' : 'guest');
    chanRef.current = ch;

    const addPiece = (p: { id: string; owner: InkOwner; erase: boolean; colour: string; width: number; pts: [number, number][]; done?: boolean }) => {
      let s = openRef.current.get(p.id);
      if (!s) {
        s = { id: p.id, owner: p.owner, erase: p.erase, colour: p.colour, width: p.width, pts: [] };
        openRef.current.set(p.id, s);
      }
      s.pts.push(...p.pts);
      if (p.done) {
        openRef.current.delete(p.id);
        strokesRef.current.push(s);
        redraw();
      } else {
        paintOne({ ...s, pts: s.pts.slice(-Math.max(2, p.pts.length + 1)) });
      }
    };

    // Ink travels one way only, which is what keeps it from being painted
    // twice: guests send `ink` and listen to nothing else; the lesson screen —
    // the one thing every device can see — hears `ink` and mirrors EVERYTHING,
    // its own included, as `ink-echo`. A guest skips the echo of its own pid.
    if (isHost) {
      ch.on('broadcast', { event: 'ink' }, ({ payload }) => {
        addPiece(payload);
        ch.send({ type: 'broadcast', event: 'ink-echo', payload });
      });
    } else {
      ch.on('broadcast', { event: 'ink-echo' }, ({ payload }) => {
        if (payload?.pid === pidRef.current) return;
        addPiece(payload);
      });
    }

    ch.on('broadcast', { event: 'wipe' }, () => {
      strokesRef.current = []; openRef.current.clear(); redraw();
    });

    if (isHost) {
      ch.on('broadcast', { event: 'join' }, ({ payload }) => {
        peersRef.current.set(payload.pid, Date.now());
        onPeers?.(peersRef.current.size);
        // Catch the newcomer up with what is already on the board.
        for (const s of strokesRef.current) {
          ch.send({ type: 'broadcast', event: 'ink-echo', payload: { ...s, done: true, pid: 'host-replay' } });
        }
      });
    }

    ch.subscribe();

    let beat: number | null = null;
    if (!isHost) {
      const hello = () => ch.send({ type: 'broadcast', event: 'join', payload: { pid: pidRef.current, who: me } });
      hello();
      beat = window.setInterval(hello, 5000);
    } else {
      // Anyone who stops saying hello has put the phone down.
      beat = window.setInterval(() => {
        const cutoff = Date.now() - 16000;
        let changed = false;
        for (const [pid, at] of peersRef.current) if (at < cutoff) { peersRef.current.delete(pid); changed = true; }
        if (changed) onPeers?.(peersRef.current.size);
      }, 5000);
    }

    return () => { if (beat) window.clearInterval(beat); ch.unsubscribe(); chanRef.current = null; };
  }, [roomId, isHost, me, redraw, paintOne, onPeers]);

  /* ── drawing ── */
  const at = (e: React.PointerEvent): [number, number] => {
    const c = tutorRef.current!;
    const r = c.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const sendPiece = (s: Stroke, pts: [number, number][], done: boolean) => {
    chanRef.current?.send({
      type: 'broadcast', event: isHost ? 'ink-echo' : 'ink',
      payload: { id: s.id, owner: s.owner, erase: s.erase, colour: s.colour, width: s.width, pts, done, pid: pidRef.current },
    });
  };

  const down = (e: React.PointerEvent) => {
    // Capture keeps a stroke going when the finger leaves the canvas; a pointer
    // id the browser does not know (a synthetic event) makes it throw.
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ }
    const s: Stroke = {
      id: newStrokeId(), owner: me, erase: tool === 'eraser',
      colour, width: (tool === 'eraser' ? ERASER_NIBS : NIBS)[nib], pts: [at(e)],
    };
    drawingRef.current = s;
    paintOne(s);
    sendPiece(s, s.pts, false);
  };

  const move = (e: React.PointerEvent) => {
    const s = drawingRef.current;
    if (!s) return;
    const p = at(e);
    const last = s.pts[s.pts.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.002) return;   // noise
    s.pts.push(p);
    paintOne({ ...s, pts: s.pts.slice(-2) });
    sendPiece(s, [p], false);
  };

  const up = () => {
    const s = drawingRef.current;
    if (!s) return;
    drawingRef.current = null;
    strokesRef.current.push(s);
    if (s.erase) redraw();
    sendPiece(s, [], true);
    onStrokes?.([...strokesRef.current]);
  };

  const wipeMine = () => {
    strokesRef.current = strokesRef.current.filter(s => s.owner !== me);
    redraw();
    chanRef.current?.send({ type: 'broadcast', event: 'wipe', payload: { who: me } });
    for (const s of strokesRef.current) sendPiece(s, s.pts, true);
    onStrokes?.([...strokesRef.current]);
  };

  const nibs = tool === 'eraser' ? ERASER_NIBS : NIBS;

  return (
    <div className={`flex flex-col ${className ?? ''}`} style={{ minHeight: 0 }}>
      <div ref={wrapRef} className="flex-grow flex items-center justify-center min-h-0" style={{ touchAction: 'none' }}>
        <div className="relative rounded-[18px] overflow-hidden" style={{ width: size.w || undefined, height: size.h || undefined, background: PAPER, border: '1px solid #E3DED1' }}>
          {/* a line to sit the letter on */}
          <span aria-hidden="true" style={{ position: 'absolute', left: '7%', right: '7%', top: '62%', height: 1, background: '#E8E2D4' }} />
          <canvas ref={studentRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
          <canvas ref={tutorRef} className="absolute inset-0" style={{ touchAction: 'none' }}
            onPointerDown={readOnly ? undefined : down} onPointerMove={readOnly ? undefined : move}
            onPointerUp={readOnly ? undefined : up} onPointerCancel={readOnly ? undefined : up}
            onPointerLeave={readOnly ? undefined : up} />
        </div>
      </div>

      {!readOnly && <div className="flex-shrink-0 flex flex-wrap items-center justify-center gap-2.5 pt-3">
        <span className="flex items-center gap-2 px-2.5 py-2 rounded-[14px]" style={{ background: '#FFFFFF', border: '1px solid #E3DED1' }}>
          <button type="button" onClick={() => setTool('pen')} aria-label="Pen" aria-pressed={tool === 'pen'}
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: tool === 'pen' ? '#1B2436' : '#F2EFE7', border: tool === 'pen' ? 0 : '1px solid #E3DED1', color: tool === 'pen' ? PAPER : '#5A5648' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20l4-1 10-10a2.4 2.4 0 0 0-3.4-3.4L4.6 15.6z" /></svg>
          </button>
          <button type="button" onClick={() => setTool('eraser')} aria-label="Eraser" aria-pressed={tool === 'eraser'}
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: tool === 'eraser' ? '#1B2436' : '#F2EFE7', border: tool === 'eraser' ? 0 : '1px solid #E3DED1', color: tool === 'eraser' ? PAPER : '#5A5648' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 19l-4-4 9-9 4 4-9 9z" /><path d="M8 19h10" /></svg>
          </button>
        </span>

        {tool === 'pen' && (
          <span className="flex items-center gap-2 px-2.5 py-2 rounded-[14px]" style={{ background: '#FFFFFF', border: '1px solid #E3DED1' }}>
            {PENS.map(p => (
              <button key={p.hex} type="button" onClick={() => setColour(p.hex)} aria-label={p.name} aria-pressed={colour === p.hex}
                className="w-9 h-9 rounded-full"
                style={{ background: p.hex, border: colour === p.hex ? '3px solid #1B2436' : '1px solid rgba(0,0,0,0.12)', boxShadow: colour === p.hex ? `inset 0 0 0 2px ${PAPER}` : 'none' }} />
            ))}
          </span>
        )}

        <span className="flex items-center gap-2 px-2.5 py-2 rounded-[14px]" style={{ background: '#FFFFFF', border: '1px solid #E3DED1' }}>
          {nibs.map((n, i) => (
            <button key={n} type="button" onClick={() => setNib(i)} aria-label={['Thin', 'Medium', 'Thick'][i]} aria-pressed={nib === i}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: nib === i ? '#1B2436' : '#F2EFE7', border: nib === i ? 0 : '1px solid #E3DED1' }}>
              <span style={{ width: 6 + i * 6, height: 6 + i * 6, borderRadius: '50%', background: nib === i ? PAPER : '#1B2436' }} />
            </button>
          ))}
        </span>

        <button type="button" onClick={wipeMine}
          className="h-11 px-4 rounded-[13px] text-[13.5px] font-bold"
          style={{ background: '#F2EFE7', border: '1px solid #E3DED1', color: '#5A5648' }}>
          Clear mine
        </button>
      </div>}
    </div>
  );
};

export default HunterBoard;
