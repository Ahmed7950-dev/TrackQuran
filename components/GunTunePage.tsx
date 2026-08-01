// ─────────────────────────────────────────────────────────────────────────────
// /gun-tune — hands-on bench for placing the Reading Battle gun in the
// soldier's hands. The model renders LIVE through the same RunnerStage the
// battle uses; the sliders mutate the prop config in place (the stage re-reads
// it every frame), the pink dot marks the muzzle the aim line will start from.
// Adjust until it looks right, press Copy, paste the numbers back to Claude.
// No auth — the page can't change anything for anyone else.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';

const HERO_GLB = '/rb/hero.glb?v=4';

const DEFAULTS = {
  url: '/rb/gun.glb?v=1', bone: 'mixamorigRightHand',
  s: 60, x: 0, y: 4, z: 2, rx: 0, ry: 0, rz: -1.5708,
  muzzle: [-3.4, -1, 0] as [number, number, number],
};

const deg = (rad: number) => Math.round((rad * 180) / Math.PI);
const rad = (d: number) => (d * Math.PI) / 180;
const wrap = (r: number) => {
  let v = r;
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v < -Math.PI) v += 2 * Math.PI;
  return v;
};

const GunTunePage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  // ONE object for the whole session — the stage reads it every frame
  const cfgRef = useRef({ ...DEFAULTS, muzzle: [...DEFAULTS.muzzle] as [number, number, number] });
  const poseRef = useRef<{ heading: number; anim: 'idle' | 'run' }>({ heading: 90, anim: 'idle' });
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
        const st = new RunnerStage(canvas, () => [{
          x: 50, y: 62,
          heading: poseRef.current.heading,
          speed: poseRef.current.anim === 'run' ? 0.09 : 0,
          anim: poseRef.current.anim,
        }], [{ url: HERO_GLB, scale: 1, pinOrigin: true, prop: cfgRef.current }],
        { size: () => Math.min(460, canvas.clientWidth || 460) });
        stage = st;
        stageRef.current = st;
        await st.init();
      } catch { /* page is a utility — nothing to break */ }
    })();
    const iv = window.setInterval(() => {
      const m = stageRef.current?.getMuzzle?.(0);
      const d = dotRef.current;
      if (m && d) {
        d.style.left = `${m.x - 6}px`;
        d.style.top = `${m.y - 6}px`;
        d.style.display = 'block';
      } else if (d) {
        d.style.display = 'none';
      }
    }, 60);
    return () => { dead = true; window.clearInterval(iv); stage?.dispose(); };
  }, []);

  const cfg = cfgRef.current;
  const set = (k: 's' | 'x' | 'y' | 'z' | 'rx' | 'ry' | 'rz', v: number) => {
    (cfg as any)[k] = v;
    setTick(t => t + 1);
  };
  const setMuzzle = (i: number, v: number) => { cfg.muzzle[i] = v; setTick(t => t + 1); };

  const json = `{ s: ${+cfg.s.toFixed(1)}, x: ${+cfg.x.toFixed(1)}, y: ${+cfg.y.toFixed(1)}, z: ${+cfg.z.toFixed(1)}, rx: ${+cfg.rx.toFixed(4)}, ry: ${+cfg.ry.toFixed(4)}, rz: ${+cfg.rz.toFixed(4)}, muzzle: [${cfg.muzzle.map(v => +v.toFixed(2)).join(', ')}] }`;

  const Row: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }> =
    ({ label, value, min, max, step, onChange, fmt }) => (
      <label className="flex items-center gap-2 text-xs text-white/90">
        <span className="w-16 font-bold shrink-0">{label}</span>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))} className="flex-1 accent-emerald-400" />
        <span className="w-16 text-right font-mono">{fmt ? fmt(value) : value.toFixed(1)}</span>
      </label>
    );

  return (
    <div className="fixed inset-0 overflow-y-auto text-white" style={{ background: '#0e1418' }}>
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div>
          <h1 className="text-xl font-extrabold">🔫 Gun placement bench</h1>
          <p className="text-white/60 text-sm">Move the sliders until the gun sits right in his hands and the pink dot is on the muzzle tip. Then press <b>Copy numbers</b> and paste them to Claude.</p>
        </div>

        <div className="flex flex-wrap gap-4">
          {/* the live soldier */}
          <div className="relative rounded-2xl overflow-hidden border border-white/10" style={{ width: 'min(460px, 92vw)', height: 'min(460px, 92vw)', background: 'linear-gradient(#9aa8b5, #6e7c8a)' }}>
            <canvas ref={canvasRef} className="w-full h-full" />
            <div ref={dotRef} style={{ position: 'absolute', width: 12, height: 12, borderRadius: '50%', border: '2px solid #ff4fa3', background: 'rgba(255,79,163,0.35)', pointerEvents: 'none', display: 'none' }} />
          </div>

          {/* controls */}
          <div className="flex-1 min-w-[280px] space-y-4">
            <div className="bg-white/5 rounded-2xl p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">View</p>
              <Row label="Facing" value={poseRef.current.heading} min={0} max={360} step={5}
                onChange={v => { poseRef.current.heading = v; setTick(t => t + 1); }} fmt={v => `${v}°`} />
              <div className="flex gap-2">
                {[0, 90, 180, 270].map(h => (
                  <button key={h} onClick={() => { poseRef.current.heading = h; setTick(t => t + 1); }}
                    className={`px-2 py-1 rounded text-xs font-bold ${poseRef.current.heading === h ? 'bg-emerald-500' : 'bg-white/10'}`}>{h}°</button>
                ))}
                <button onClick={() => { poseRef.current.anim = poseRef.current.anim === 'run' ? 'idle' : 'run'; setTick(t => t + 1); }}
                  className="ml-auto px-2 py-1 rounded text-xs font-bold bg-sky-600">
                  {poseRef.current.anim === 'run' ? '⏸ stand' : '▶ walk'}
                </button>
              </div>
            </div>

            <div className="bg-white/5 rounded-2xl p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Size & position (in the hand)</p>
              <Row label="Size" value={cfg.s} min={5} max={150} step={1} onChange={v => set('s', v)} fmt={v => v.toFixed(0)} />
              <Row label="Shift X" value={cfg.x} min={-25} max={25} step={0.5} onChange={v => set('x', v)} />
              <Row label="Shift Y" value={cfg.y} min={-25} max={25} step={0.5} onChange={v => set('y', v)} />
              <Row label="Shift Z" value={cfg.z} min={-25} max={25} step={0.5} onChange={v => set('z', v)} />
            </div>

            <div className="bg-white/5 rounded-2xl p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Rotation</p>
              <Row label="Rot X" value={deg(cfg.rx)} min={-180} max={180} step={5} onChange={v => set('rx', rad(v))} fmt={v => `${v}°`} />
              <Row label="Rot Y" value={deg(cfg.ry)} min={-180} max={180} step={5} onChange={v => set('ry', rad(v))} fmt={v => `${v}°`} />
              <Row label="Rot Z" value={deg(cfg.rz)} min={-180} max={180} step={5} onChange={v => set('rz', rad(v))} fmt={v => `${v}°`} />
              <div className="flex gap-2 pt-1">
                <button onClick={() => set('ry', wrap(cfg.ry + Math.PI))} className="px-2 py-1 rounded text-xs font-bold bg-amber-600">Flip ↔ (Y 180°)</button>
                <button onClick={() => set('rz', wrap(cfg.rz + Math.PI))} className="px-2 py-1 rounded text-xs font-bold bg-amber-600">Flip ↕ (Z 180°)</button>
                <button onClick={() => { Object.assign(cfg, { ...DEFAULTS, muzzle: [...DEFAULTS.muzzle] }); setTick(t => t + 1); }}
                  className="ml-auto px-2 py-1 rounded text-xs font-bold bg-white/10">Reset</button>
              </div>
            </div>

            <div className="bg-white/5 rounded-2xl p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Muzzle (the pink dot — aim line starts here)</p>
              <Row label="Muzzle X" value={cfg.muzzle[0]} min={-10} max={10} step={0.1} onChange={v => setMuzzle(0, v)} />
              <Row label="Muzzle Y" value={cfg.muzzle[1]} min={-10} max={10} step={0.1} onChange={v => setMuzzle(1, v)} />
              <Row label="Muzzle Z" value={cfg.muzzle[2]} min={-10} max={10} step={0.1} onChange={v => setMuzzle(2, v)} />
            </div>

            <div className="bg-black/40 rounded-2xl p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-300">Your numbers</p>
              <code className="block text-[11px] text-emerald-200 break-all font-mono">{json}</code>
              <button
                onClick={() => { try { navigator.clipboard?.writeText(json); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* manual copy */ } }}
                className="w-full py-2 rounded-xl font-extrabold text-sm bg-emerald-500">
                {copied ? '✓ Copied — paste it to Claude' : '📋 Copy numbers'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GunTunePage;
