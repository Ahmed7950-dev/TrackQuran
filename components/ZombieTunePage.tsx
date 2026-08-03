// ─────────────────────────────────────────────────────────────────────────────
// /zombie-tune — sizing bench for the zombie-mode props. A soldier stands next
// to a zombie at the SAME 13-arena-units-per-viewport scale the battle uses, so
// what you see here is exactly what you get in the arena; the three crates are
// drawn on the same floor. Move the sliders, press Copy, paste the numbers back
// to Claude. No auth — the page can't change anything for anyone else.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { ZOMBIE_GLB, ZOMBIES, PICKUPS, PICKUP_RULES, RB_HEROES, RB_GUN, RB_GUNS } from './readingBattleConfig';

// the arena maps 13 arena units across the character viewport — matching it
// here is what makes the preview honest
const UNITS_ACROSS = 13;

const ZombieTunePage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const floorRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<any>(null);
  const cfgRef = useRef({ zombie: ZOMBIES.scale, crate: PICKUP_RULES.size });
  const animRef = useRef<'run' | 'tackle'>('run');
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stage: { dispose(): void } | null = null;
    let dead = false;
    (async () => {
      try {
        const { RunnerStage } = await import('./letterRaceStage');
        if (dead || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const st = new RunnerStage(canvas, () => ([
          // reference soldier on the left, rifle in hand, exactly as in battle
          { x: 32, y: 62, heading: 90, speed: 0, anim: 'idle' as const },
          // the zombie on the right, walking or swinging
          { x: 68, y: 62, heading: 270, speed: animRef.current === 'run' ? 0.09 : 0, anim: animRef.current },
        ]), [
          { url: RB_HEROES[0].url, scale: 1, pinOrigin: true,
            prop: { ...RB_GUN, url: RB_GUNS[0].url } },
          { url: ZOMBIE_GLB, scale: cfgRef.current.zombie, pinOrigin: true },
        ], { size: () => Math.min(520, canvas.clientWidth || 520) });
        stage = st;
        stageRef.current = st;
        await st.init();
      } catch { /* bench is a utility — never hard-fail */ }
    })();
    return () => { dead = true; stage?.dispose(); };
    // the stage bakes model scale at build time, so a zombie-size change
    // rebuilds it — that is why the scale is in the dep list
  }, [cfgRef.current.zombie]);

  // crates on the floor, drawn at the same units-per-pixel as the characters
  useEffect(() => {
    const imgs = PICKUPS.map(p => {
      const im = new Image();
      im.src = p.sprite;
      im.onload = () => setTick(t => t + 1);
      return im;
    });
    let raf = 0;
    const draw = () => {
      const c = floorRef.current;
      if (c) {
        const W = c.clientWidth, H = c.clientHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
        const g = c.getContext('2d');
        if (g) {
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.clearRect(0, 0, W, H);
          const u = Math.min(520, W) / UNITS_ACROSS;      // px per arena unit
          const s = cfgRef.current.crate * u;
          PICKUPS.forEach((p, i) => {
            const cx = W * (0.22 + i * 0.28);
            const cy = H * 0.86;
            g.beginPath();
            g.fillStyle = p.color + '55';
            g.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
            g.fill();
            const im = imgs[i];
            if (im.complete && im.naturalWidth) g.drawImage(im, cx - s / 2, cy - s * 0.85, s, s);
            g.fillStyle = 'rgba(255,255,255,0.75)';
            g.font = '600 11px system-ui';
            g.textAlign = 'center';
            g.fillText(p.name, cx, cy + s * 0.45);
          });
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cfg = cfgRef.current;
  const json = `zombie scale: ${cfg.zombie.toFixed(2)} · crate size: ${cfg.crate.toFixed(1)}`;

  const Row: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint?: string }> =
    ({ label, value, min, max, step, onChange, hint }) => (
      <label className="flex items-center gap-3 text-sm text-white/90">
        <span className="w-28 font-bold shrink-0">{label}</span>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))} className="flex-1 accent-red-400" />
        <span className="w-24 text-right font-mono text-xs">{value.toFixed(2)}{hint}</span>
      </label>
    );

  return (
    <div className="fixed inset-0 overflow-y-auto text-white" style={{ background: '#140e0e' }}>
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div>
          <h1 className="text-xl font-extrabold">🧟 Zombie &amp; crate sizing bench</h1>
          <p className="text-white/60 text-sm">
            The soldier on the left is a real fighter at battle size — size the zombie against him.
            The crates sit on the same floor at the same scale. Then press <b>Copy numbers</b> and paste them to Claude.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="relative rounded-2xl overflow-hidden border border-white/10"
            style={{ width: 'min(520px, 92vw)', height: 'min(520px, 92vw)', background: 'linear-gradient(#e8a866, #d68c47)' }}>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            <canvas ref={floorRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} />
          </div>

          <div className="flex-1 min-w-[280px] space-y-4">
            <div className="bg-white/5 rounded-2xl p-4 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-300">Zombie</p>
              <Row label="Body size" value={cfg.zombie} min={0.4} max={2} step={0.05}
                onChange={v => { cfg.zombie = v; setTick(t => t + 1); }} hint="×" />
              <div className="flex gap-2">
                <button onClick={() => { animRef.current = 'run'; setTick(t => t + 1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${animRef.current === 'run' ? 'bg-red-500' : 'bg-white/10'}`}>▶ walking</button>
                <button onClick={() => { animRef.current = 'tackle'; setTick(t => t + 1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${animRef.current === 'tackle' ? 'bg-red-500' : 'bg-white/10'}`}>👊 attacking</button>
              </div>
              <p className="text-[11px] text-white/45">1.00 = exactly a fighter's height.</p>
            </div>

            <div className="bg-white/5 rounded-2xl p-4 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Crates</p>
              <Row label="Crate size" value={cfg.crate} min={2} max={14} step={0.5}
                onChange={v => { cfg.crate = v; setTick(t => t + 1); }} hint="u" />
              <p className="text-[11px] text-white/45">Arena units across. A fighter is about 4 units wide.</p>
            </div>

            <div className="bg-black/40 rounded-2xl p-4 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-300">Your numbers</p>
              <code className="block text-xs text-emerald-200 break-all font-mono">{json}</code>
              <button
                onClick={() => { try { navigator.clipboard?.writeText(json); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* manual copy */ } }}
                className="w-full py-2.5 rounded-xl font-extrabold text-sm bg-emerald-500">
                {copied ? '✓ Copied — paste it to Claude' : '📋 Copy numbers'}
              </button>
              <button onClick={() => { cfg.zombie = ZOMBIES.scale; cfg.crate = PICKUP_RULES.size; setTick(t => t + 1); }}
                className="w-full py-2 rounded-xl font-bold text-xs bg-white/10">Reset to shipped values</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZombieTunePage;
