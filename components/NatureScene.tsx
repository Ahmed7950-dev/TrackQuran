// ─────────────────────────────────────────────────────────────────────────────
// NatureScene — a drawn landscape that fills its (relative) parent, used
// behind the "Next lesson" card. One of eight scenes is picked at random
// once per page load, so a refresh shows a new one but switching tabs does
// not. Drawn in SVG: no image files, sharp at any size, a few KB.
// A shade on top keeps white text readable on every scene.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useId } from 'react';

const W = 400, H = 200;

/** A soft ridge through evenly spaced heights, closed to the bottom. */
function ridge(ys: number[]): string {
  const step = W / (ys.length - 1);
  const pts = ys.map((y, i) => [i * step, y] as const);
  let d = `M0 ${H} L${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  return `${d} L${W} ${H} Z`;
}

/** Sharp peaks through [x, y] points, closed to the bottom. */
const peaks = (p: [number, number][]) => `M0 ${H} ${p.map(([x, y]) => `L${x} ${y}`).join(' ')} L${W} ${H} Z`;

/** Repeatable scatter (same stars on every render). */
function scatter(n: number, seed: number, maxY: number): [number, number, number][] {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, () => [r() * W, r() * maxY, 0.4 + r() * 0.9]);
}

const Pine: React.FC<{ x: number; y: number; h: number; fill: string }> = ({ x, y, h, fill }) => (
  <path d={`M${x} ${y - h} L${x + h * 0.32} ${y - h * 0.45} L${x + h * 0.18} ${y - h * 0.45} L${x + h * 0.4} ${y} L${x - h * 0.4} ${y} L${x - h * 0.18} ${y - h * 0.45} L${x - h * 0.32} ${y - h * 0.45} Z`} fill={fill} />
);
const Olive: React.FC<{ x: number; y: number; s: number; fill: string }> = ({ x, y, s, fill }) => (
  <g fill={fill}>
    <rect x={x - s * 0.08} y={y - s * 0.55} width={s * 0.16} height={s * 0.55} />
    <ellipse cx={x} cy={y - s * 0.75} rx={s * 0.55} ry={s * 0.38} />
    <ellipse cx={x - s * 0.35} cy={y - s * 0.62} rx={s * 0.3} ry={s * 0.22} />
  </g>
);
type Scene = (id: string) => React.ReactNode;

const SCENES: Scene[] = [
  // 1 · Dawn over mountains
  id => (<>
    <defs><linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B4A7A" /><stop offset=".55" stopColor="#E59A9A" /><stop offset="1" stopColor="#F8C99B" /></linearGradient></defs>
    <rect width={W} height={H} fill={`url(#${id}s)`} />
    <circle cx="290" cy="118" r="20" fill="#FFE2B0" opacity=".9" />
    <path d={peaks([[0, 120], [60, 78], [110, 110], [170, 62], [240, 112], [300, 84], [360, 116], [400, 96]])} fill="#8E6B8F" />
    <path d={peaks([[0, 140], [50, 118], [120, 150], [190, 104], [260, 146], [330, 120], [400, 142]])} fill="#5E4A72" />
    <path d={ridge([170, 160, 172, 158, 168])} fill="#2E2645" />
  </>),
  // 2 · Desert dunes at sunset
  id => (<>
    <defs><linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5A3C6E" /><stop offset=".5" stopColor="#E8875A" /><stop offset="1" stopColor="#F7C46C" /></linearGradient></defs>
    <rect width={W} height={H} fill={`url(#${id}s)`} />
    <circle cx="120" cy="112" r="30" fill="#FFD98A" />
    <path d={ridge([128, 118, 132, 112, 126])} fill="#D9894B" />
    <path d={ridge([150, 160, 140, 152, 146])} fill="#B5643A" />
    <path d={ridge([182, 170, 186, 172, 180])} fill="#7E3F2A" />
    <path d="M300 104 q6 -5 12 0 q6 -5 12 0 M330 96 q4 -3 8 0 q4 -3 8 0" fill="none" stroke="#5A2E2A" strokeWidth="1.6" strokeLinecap="round" />
  </>),
  // 3 · Misty pine forest
  id => (<>
    <defs><linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9CC3CB" /><stop offset="1" stopColor="#E3EEE6" /></linearGradient>
      <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" stopOpacity="0" /><stop offset=".5" stopColor="#FFFFFF" stopOpacity=".35" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" /></linearGradient></defs>
    <circle cx="300" cy="96" r="16" fill="#FFFBEA" opacity=".8" />
    <rect width={W} height={H} fill={`url(#${id}s)`} />
    <path d={ridge([96, 84, 100, 80, 94, 86])} fill="#8FB2AE" />
    {[20, 70, 130, 200, 260, 330, 385].map((x, i) => <Pine key={`a${i}`} x={x} y={128 - (i % 2) * 6} h={44} fill="#6E9893" />)}
    <path d={ridge([132, 126, 136, 124, 132])} fill="#4F7C76" />
    {[0, 45, 95, 150, 215, 270, 320, 375].map((x, i) => <Pine key={`b${i}`} x={x} y={170 - (i % 3) * 5} h={62} fill="#2F5A55" />)}
    <path d={ridge([176, 170, 180, 172, 178])} fill="#1F403C" />
    <rect y="96" width={W} height="40" fill={`url(#${id}m)`} />
  </>),
  // 4 · Starry night over a lake
  id => (<>
    <defs><linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B1430" /><stop offset="1" stopColor="#2B3E6B" /></linearGradient></defs>
    <rect width={W} height={H} fill={`url(#${id}s)`} />
    {scatter(90, 7, 135).map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" opacity={0.4 + (i % 5) / 8} />)}
    <circle cx="320" cy="98" r="22" fill="#F4EBC8" opacity=".12" />
    <mask id={`${id}c`}><circle cx="320" cy="98" r="12" fill="#fff" /><circle cx="326" cy="94" r="11" fill="#000" /></mask>
    <circle cx="320" cy="98" r="12" fill="#F4EBC8" mask={`url(#${id}c)`} />
    <path d={peaks([[0, 128], [70, 104], [130, 124], [200, 100], [270, 126], [340, 110], [400, 124]])} fill="#2A3D6B" />
    <rect y="138" width={W} height="62" fill="#1C2B52" />
    <path d={`M0 140 L70 158 L130 142 L200 162 L270 141 L340 154 L400 142 L400 140 Z`} fill="#2A3D6B" opacity=".55" />
    {[150, 160, 172, 184].map((y, i) => <rect key={i} x={300 - (14 - i * 2)} y={y - 8} width={(14 - i * 2) * 2} height="1.4" rx=".7" fill="#F4EBC8" opacity={0.5 - i * 0.1} />)}
  </>),
  // 5 · Sea at sunset
  id => (<>
    <defs>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3E5C8A" /><stop offset=".6" stopColor="#F29A76" /><stop offset="1" stopColor="#FCD38C" /></linearGradient>
      <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E98A6E" /><stop offset="1" stopColor="#2E4A72" /></linearGradient>
    </defs>
    <rect width={W} height={H} fill={`url(#${id}s)`} />
    <circle cx="250" cy="126" r="26" fill="#FFE6A8" />
    <rect y="126" width={W} height="74" fill={`url(#${id}w)`} />
    {[132, 140, 150, 162, 176].map((y, i) => <rect key={i} x={250 - (30 - i * 4)} y={y} width={(30 - i * 4) * 2} height="2" rx="1" fill="#FFE6A8" opacity={0.75 - i * 0.12} />)}
    <path d="M0 200 L0 112 C20 104 34 100 48 108 C64 116 80 112 96 122 C110 130 130 128 150 140 L150 200 Z" fill="#2C2A45" />
  </>),
  // 6 · Olive hills in the golden hour
  id => (<>
    <defs><linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8EC0D6" /><stop offset="1" stopColor="#F6E3B4" /></linearGradient></defs>
    <rect width={W} height={H} fill={`url(#${id}s)`} />
    <circle cx="300" cy="100" r="30" fill="#FFF1C2" opacity=".35" />
    <circle cx="300" cy="100" r="16" fill="#FFF1C2" />
    <path d={ridge([110, 96, 112, 98, 108, 100])} fill="#B9C58A" />
    <path d={ridge([140, 128, 146, 132, 142])} fill="#8FA45E" />
    {[60, 150, 240, 330].map((x, i) => <Olive key={i} x={x} y={142 - (i % 2) * 6} s={22} fill="#5E7A3E" />)}
    <path d={ridge([176, 164, 178, 166, 174])} fill="#6B8443" />
    {[30, 120, 210, 300, 380].map((x, i) => <Olive key={`f${i}`} x={x} y={182 - (i % 2) * 5} s={30} fill="#3E5528" />)}
  </>),
  // 7 · Northern lights over snowy peaks
  id => (<>
    <defs>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#071A2B" /><stop offset="1" stopColor="#123A4E" /></linearGradient>
      <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5BF0B5" stopOpacity="0" /><stop offset=".6" stopColor="#5BF0B5" stopOpacity=".55" /><stop offset="1" stopColor="#5BF0B5" stopOpacity="0" /></linearGradient>
    </defs>
    <rect width={W} height={H} fill={`url(#${id}s)`} />
    {scatter(55, 21, 130).map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r * 0.8} fill="#FFFFFF" opacity=".6" />)}
    <g transform="translate(0 30)">
      <path d="M-10 70 C80 20 160 90 240 40 S360 20 410 60 L410 110 C340 70 280 120 220 90 S80 70 -10 120 Z" fill={`url(#${id}a)`} />
      <path d="M-10 60 C90 30 170 80 250 50 S370 40 410 70 L410 84 C350 60 270 96 230 76 S90 54 -10 92 Z" fill="#7CF7C8" opacity=".3" />
      <path d="M-10 46 C80 4 200 64 300 22 C350 6 390 24 410 34 L410 52 C380 44 340 50 300 62 C210 92 110 44 -10 84 Z" fill="#9B7BF0" opacity=".22" />
    </g>
    <path d={peaks([[0, 140], [60, 96], [100, 124], [170, 80], [230, 128], [300, 92], [360, 126], [400, 110]])} fill="#2B4A5E" />
    <path d={`M60 96 L74 106 L66 108 Z M170 80 L186 94 L176 96 L168 92 Z M300 92 L314 104 L304 106 Z`} fill="#E6F2F5" />
    <path d={ridge([170, 162, 174, 164, 172])} fill="#0E2633" />
    {[20, 60, 340, 380].map((x, i) => <Pine key={i} x={x} y={176} h={40} fill="#0A1C26" />)}
  </>),
  // 8 · Autumn valley with a river
  id => (<>
    <defs><linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F4B67A" /><stop offset="1" stopColor="#FBE3BD" /></linearGradient></defs>
    <rect width={W} height={H} fill={`url(#${id}s)`} />
    <circle cx="210" cy="104" r="18" fill="#FFF0CF" />
    <path d={ridge([110, 118, 104, 116, 108])} fill="#D9925A" />
    <path d={ridge([126, 112, 130, 116, 124])} fill="#C0673C" />
    <path d={ridge([156, 146, 160, 150, 154])} fill="#8E3F27" />

    {[40, 80, 320, 360].map((x, i) => <Olive key={i} x={x} y={186} s={26} fill={i % 2 ? '#6A2A1A' : '#A3441F'} />)}
  </>),
];

/** Chosen once per page load: a refresh shows a new scene, a re-render does not. */
const PICK = Math.floor(Math.random() * SCENES.length);

export const SCENE_COUNT = SCENES.length;

/** `scene` pins one (0-based); left out, the page-load pick is used. */
const NatureScene: React.FC<{ className?: string; scene?: number }> = ({ className = '', scene }) => {
  const id = useId().replace(/:/g, '');
  return (
    <div aria-hidden="true" className={`absolute inset-0 pointer-events-none ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="w-full h-full block">
        {SCENES[(scene ?? PICK) % SCENES.length](id)}
      </svg>
      {/* the shade that keeps white text readable on light skies */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,10,14,.45) 0%, rgba(8,10,14,.12) 45%, rgba(8,10,14,0) 70%, rgba(8,10,14,.12) 100%)' }} />
    </div>
  );
};

export default NatureScene;
