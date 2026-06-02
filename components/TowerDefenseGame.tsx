import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

export interface TowerDefenseRef {
  spawnPlayerSoldier: () => void;
  spawnBilalSoldier:  () => void;
  spawnJafarSoldier:  () => void;
  spawnEnemySoldier:  () => void;
  reset: () => void;
}

// ─── Sprite sheet config ────────────────────────────────────────────────────────
// Both sheets: 5 cols × 5 rows = 25 frames, character faces RIGHT
const SHEET_COLS   = 5;
const SHEET_ROWS   = 5;
const TOTAL_FRAMES = SHEET_COLS * SHEET_ROWS;
const ANIM_TICK    = 3;   // advance one frame every N game ticks
const SPRITE_SIZE  = 92;  // square — source frames are 1:1 so keep aspect
const SPRITE_W     = SPRITE_SIZE;
const SPRITE_H     = SPRITE_SIZE;
const HAMZAH_FOOT_RATIO = 0.88; // feet at 88% of sprite height (Hamzah / player)
const ALBERT_FOOT_RATIO = 0.75; // feet at 75% of sprite height (Albert / enemy)
const BILAL_FOOT_RATIO  = 0.88; // feet ratio for Bilal
const JAFAR_FOOT_RATIO  = 0.88; // feet ratio for Jafar

// Bilal stats — spawned after 3 consecutive correct answers
const BILAL_MAX_HP  = 5;   // tougher than a regular soldier (SOL_MAX_HP = 3)
const BILAL_DAMAGE  = 1.5; // damage per hit — kills 1.5 enemies

// Jafar stats — spawned after 6 consecutive correct answers
const JAFAR_MAX_HP  = 8;   // much tougher than Bilal
const JAFAR_DAMAGE  = 2.5; // damage per hit — kills 2.5 enemies

// ─── Game constants ─────────────────────────────────────────────────────────────
const CANVAS_H     = 270;
const TENT_MAX_HP  = 100;
const SOL_MAX_HP   = 3;
const FIGHT_RANGE  = 70;
const WALK_SPEED   = 0.38;
const TENT_DMG     = 25;
const DEATH_TICKS  = 18;
const GROUND_Y     = CANVAS_H - 32;

// Tent anchor x — wider than before to give tent images breathing room
const LEFT_ANCHOR  = 80;
// RIGHT_ANCHOR = cw - 80  (computed per-frame from canvas width)

// Target display heights for tent images (widths computed from natural aspect ratio)
const PLAYER_TENT_TARGET_H = 145;
const ENEMY_TENT_TARGET_H  = 165;
const PLAYER_TENT_Y_OFFSET = 30;  // positive = lower the player tent toward the ground

// ─── Types ──────────────────────────────────────────────────────────────────────
interface Soldier {
  id: number; side: 'player' | 'enemy';
  x: number; y: number;
  hp: number; maxHp: number;
  fightingWith: number | null;
  frame: number; dying: number;
  isBilal?: boolean;  // true → use Bilal sprites + boosted stats
  isJafar?: boolean;  // true → use Jafar sprites + elite stats
}
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; r: number;
}
interface Star { x: number; y: number; r: number; phase: number; speed: number; }
interface GS {
  soldiers: Soldier[]; particles: Particle[];
  playerHp: number; enemyHp: number;
  nextId: number;
  winner: 'player' | 'enemy' | null; winFrame: number;
  shakeLeft: number; shakeRight: number;
  stars: Star[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const m = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + m, y); ctx.lineTo(x + w - m, y);
  ctx.arcTo(x + w, y, x + w, y + m, m);
  ctx.lineTo(x + w, y + h - m);
  ctx.arcTo(x + w, y + h, x + w - m, y + h, m);
  ctx.lineTo(x + m, y + h);
  ctx.arcTo(x, y + h, x, y + h - m, m);
  ctx.lineTo(x, y + m);
  ctx.arcTo(x, y, x + m, y, m);
  ctx.closePath();
}

function burst(ps: Particle[], x: number, y: number, count: number, colors: string[], speed = 3) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random());
    ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5,
      life: 18 + Math.random() * 12, maxLife: 30,
      color: colors[Math.floor(Math.random() * colors.length)], r: 2 + Math.random() * 3 });
  }
}

/**
 * Draw source image/canvas onto an offscreen canvas removing near-white pixels.
 * Works for both transparent PNGs and white-background PNGs.
 */
function removeWhiteBg(src: HTMLImageElement): HTMLCanvasElement {
  const oc = document.createElement('canvas');
  oc.width = src.naturalWidth; oc.height = src.naturalHeight;
  const oct = oc.getContext('2d')!;
  oct.drawImage(src, 0, 0);
  const id = oct.getImageData(0, 0, oc.width, oc.height);
  const d  = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    const dist = Math.sqrt((255-r)**2 + (255-g)**2 + (255-b)**2);
    if (dist < 40) d[i+3] = dist < 28 ? 0 : Math.round(((dist-28)/12)*255);
  }
  oct.putImageData(id, 0, 0);
  return oc;
}

// ─── Component ──────────────────────────────────────────────────────────────────
const TowerDefenseGame = forwardRef<TowerDefenseRef, {
  onGameOver?: (winner: 'player' | 'enemy') => void;
}>(({ onGameOver }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Character sprites — Hamzah (player / left side) ───────────────────────
  const hamzahWalk   = useRef<HTMLCanvasElement | null>(null);
  const hamzahFight  = useRef<HTMLCanvasElement | null>(null);
  const hamzahReady  = useRef(false);

  // ── Character sprites — Albert (enemy / right side) ───────────────────────
  const albertWalk   = useRef<HTMLCanvasElement | null>(null);
  const albertFight  = useRef<HTMLCanvasElement | null>(null);
  const albertReady  = useRef(false);

  // ── Character sprites — Bilal (special player / left side) ────────────────
  const bilalWalk    = useRef<HTMLCanvasElement | null>(null);
  const bilalFight   = useRef<HTMLCanvasElement | null>(null);
  const bilalReady   = useRef(false);

  // ── Character sprites — Jafar (elite player / left side) ──────────────────
  const jafarWalk    = useRef<HTMLCanvasElement | null>(null);
  const jafarFight   = useRef<HTMLCanvasElement | null>(null);
  const jafarReady   = useRef(false);

  // ── Background & tent images ───────────────────────────────────────────────
  const bgImg          = useRef<HTMLImageElement | null>(null);
  const playerTentCvs  = useRef<HTMLCanvasElement | null>(null);
  const enemyTentCvs   = useRef<HTMLCanvasElement | null>(null);
  // Computed display dimensions (set after load, from natural aspect ratio)
  const ptW = useRef(0); const ptH = useRef(PLAYER_TENT_TARGET_H);
  const etW = useRef(0); const etH = useRef(ENEMY_TENT_TARGET_H);
  const bgReady        = useRef(false);
  const loadingComplete = useRef(false); // true once ALL asset loads settle

  const makeGS = (): GS => ({
    soldiers: [], particles: [],
    playerHp: TENT_MAX_HP, enemyHp: TENT_MAX_HP,
    nextId: 0, winner: null, winFrame: 0,
    shakeLeft: 0, shakeRight: 0,
    stars: Array.from({ length: 30 }, () => ({
      x: Math.random(), y: Math.random() * 0.5,
      r: 0.8 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.03 + Math.random() * 0.04,
    })),
  });

  const gs    = useRef<GS>(makeGS());
  const cbRef = useRef(onGameOver);
  cbRef.current = onGameOver;

  // ── Load all assets ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = (src: string): Promise<HTMLImageElement> =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload  = () => res(img);
        img.onerror = () => rej(new Error(`Failed: ${src}`));
        img.src = src;
      });

    (async () => {
      // Load ALL assets in parallel — game stays on loading screen until every
      // attempt settles (success or failure), then flips to the real render in one frame.
      await Promise.allSettled([

        // Hamzah (player / left)
        Promise.all([load('/sprites/hamzah-walk.png'), load('/sprites/hamzah-fight.png')])
          .then(([w, f]) => {
            if (cancelled) return;
            hamzahWalk.current  = removeWhiteBg(w);
            hamzahFight.current = removeWhiteBg(f);
            hamzahReady.current = true;
          })
          .catch(() => console.warn('Hamzah sprites missing.')),

        // Albert (enemy / right)
        Promise.all([load('/sprites/Albert-walk.png'), load('/sprites/Albert-attack.png')])
          .then(([w, f]) => {
            if (cancelled) return;
            albertWalk.current  = removeWhiteBg(w);
            albertFight.current = removeWhiteBg(f);
            albertReady.current = true;
          })
          .catch(() => console.warn('Albert sprites missing.')),

        // Bilal (special player / left)
        Promise.all([load('/sprites/Bilal-walk.png'), load('/sprites/Bilal-attack.png')])
          .then(([w, f]) => {
            if (cancelled) return;
            bilalWalk.current  = removeWhiteBg(w);
            bilalFight.current = removeWhiteBg(f);
            bilalReady.current = true;
            console.log('[TowerDefense] ✓ Bilal sprites loaded');
          })
          .catch((e) => console.warn('[TowerDefense] ✗ Bilal sprites FAILED:', e)),

        // Jafar (elite player / left)
        Promise.all([load('/sprites/Jafar-walk.png'), load('/sprites/Jafar-attack.png')])
          .then(([w, f]) => {
            if (cancelled) return;
            jafarWalk.current  = removeWhiteBg(w);
            jafarFight.current = removeWhiteBg(f);
            jafarReady.current = true;
            console.log('[TowerDefense] ✓ Jafar sprites loaded');
          })
          .catch((e) => console.warn('[TowerDefense] ✗ Jafar sprites FAILED:', e)),

        // Background
        load('/sprites/battle-bg.png')
          .then(bg => { if (!cancelled) { bgImg.current = bg; bgReady.current = true; } })
          .catch(() => console.warn('battle-bg.png missing.')),

        // Player tent
        load('/sprites/tent-player.png')
          .then(pt => {
            if (cancelled) return;
            playerTentCvs.current = removeWhiteBg(pt);
            ptH.current = PLAYER_TENT_TARGET_H;
            ptW.current = (pt.naturalWidth / pt.naturalHeight) * PLAYER_TENT_TARGET_H;
          })
          .catch(() => console.warn('tent-player.png missing.')),

        // Enemy tent
        load('/sprites/tent-enemy.png')
          .then(et => {
            if (cancelled) return;
            enemyTentCvs.current = removeWhiteBg(et);
            etH.current = ENEMY_TENT_TARGET_H;
            etW.current = (et.naturalWidth / et.naturalHeight) * ENEMY_TENT_TARGET_H;
          })
          .catch(() => console.warn('tent-enemy.png missing.')),

      ]);

      if (!cancelled) loadingComplete.current = true;
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Imperative API ─────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    spawnPlayerSoldier() {
      if (gs.current.winner) return;
      gs.current.soldiers.push({
        id: gs.current.nextId++, side: 'player',
        x: LEFT_ANCHOR + 35,
        y: GROUND_Y - 2 - Math.random() * 6,
        hp: SOL_MAX_HP, maxHp: SOL_MAX_HP,
        fightingWith: null, frame: 0, dying: 0,
      });
    },
    spawnBilalSoldier() {
      if (gs.current.winner) return;
      console.log('[TowerDefense] spawnBilalSoldier called, bilalReady=', bilalReady.current);
      gs.current.soldiers.push({
        id: gs.current.nextId++, side: 'player',
        x: LEFT_ANCHOR + 35,
        y: GROUND_Y - 2 - Math.random() * 6,
        hp: BILAL_MAX_HP, maxHp: BILAL_MAX_HP,
        fightingWith: null, frame: 0, dying: 0,
        isBilal: true,
      });
    },
    spawnJafarSoldier() {
      if (gs.current.winner) return;
      console.log('[TowerDefense] spawnJafarSoldier called, jafarReady=', jafarReady.current);
      gs.current.soldiers.push({
        id: gs.current.nextId++, side: 'player',
        x: LEFT_ANCHOR + 35,
        y: GROUND_Y - 2 - Math.random() * 6,
        hp: JAFAR_MAX_HP, maxHp: JAFAR_MAX_HP,
        fightingWith: null, frame: 0, dying: 0,
        isJafar: true,
      });
    },
    spawnEnemySoldier() {
      if (gs.current.winner) return;
      const canvas = canvasRef.current;
      const cw     = canvas ? canvas.width / devicePixelRatio : 600;
      gs.current.soldiers.push({
        id: gs.current.nextId++, side: 'enemy',
        x: cw - LEFT_ANCHOR - 35,
        y: GROUND_Y - 2 - Math.random() * 6,
        hp: SOL_MAX_HP, maxHp: SOL_MAX_HP,
        fightingWith: null, frame: 0, dying: 0,
      });
    },
    reset() { gs.current = makeGS(); },
  }));

  // ── Canvas setup & game loop ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0) {
        canvas.width  = r.width  * devicePixelRatio;
        canvas.height = CANVAS_H * devicePixelRatio;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let animId: number;
    let tick = 0;

    const loop = () => {
      tick++;
      const state  = gs.current;
      const dpr    = devicePixelRatio;
      const cw     = canvas.width / dpr;
      const ctx    = canvas.getContext('2d');
      if (!ctx) { animId = requestAnimationFrame(loop); return; }

      const LEFT_X  = LEFT_ANCHOR;
      const RIGHT_X = cw - LEFT_ANCHOR;

      // ── LOADING SCREEN — show until all assets have settled ────────────────
      if (!loadingComplete.current) {
        ctx.save();
        ctx.scale(dpr, dpr);
        // Desert-toned dark background
        const loadBg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        loadBg.addColorStop(0, '#2d1a0a');
        loadBg.addColorStop(1, '#1a0d04');
        ctx.fillStyle = loadBg;
        ctx.fillRect(0, 0, cw, CANVAS_H);
        // Pulsing sword icon
        const pulse = 0.75 + 0.25 * Math.sin(tick * 0.08);
        ctx.font = `${Math.round(32 * pulse)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚔️', cw / 2, CANVAS_H / 2 - 18);
        // Loading text
        const dots = '.'.repeat(1 + (Math.floor(tick / 18) % 3));
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillStyle = `rgba(255,200,100,${pulse})`;
        ctx.fillText(`Loading${dots}`, cw / 2, CANVAS_H / 2 + 18);
        ctx.restore();
        animId = requestAnimationFrame(loop);
        return;
      }

      // ── UPDATE ──────────────────────────────────────────────────────────────
      if (!state.winner) {
        if (state.shakeLeft  > 0) state.shakeLeft--;
        if (state.shakeRight > 0) state.shakeRight--;

        const deadIds = new Set<number>();
        for (const s of state.soldiers) {
          if (s.dying > 0) { s.dying--; s.frame++; if (s.dying === 0) deadIds.add(s.id); }
        }

        const dmgMap = new Map<number, number>();
        for (const s of state.soldiers) {
          if (s.dying > 0 || s.fightingWith === null || deadIds.has(s.id)) continue;
          s.frame++;
          if (s.frame % 32 === 0) {
            const dmg = s.isJafar ? JAFAR_DAMAGE : s.isBilal ? BILAL_DAMAGE : 1;
            dmgMap.set(s.fightingWith, (dmgMap.get(s.fightingWith) ?? 0) + dmg);
          }
        }
        for (const s of state.soldiers) {
          if (deadIds.has(s.id) || s.dying > 0) continue;
          const d = dmgMap.get(s.id) ?? 0;
          if (d > 0) {
            s.hp -= d;
            if (s.hp <= 0) {
              s.dying = DEATH_TICKS; s.fightingWith = null;
              burst(state.particles, s.x, s.y - 40, 12,
                s.side === 'player' ? ['#93c5fd','#3b82f6','#fff'] : ['#fca5a5','#ef4444','#fff'], 3);
            }
          }
        }
        for (const s of state.soldiers) {
          if (s.fightingWith !== null) {
            const opp = state.soldiers.find(o => o.id === s.fightingWith);
            if (!opp || opp.dying > 0) s.fightingWith = null;
          }
        }
        state.soldiers = state.soldiers.filter(s => !deadIds.has(s.id));

        const freshDead = new Set<number>();
        for (const s of state.soldiers) {
          if (s.fightingWith !== null || s.dying > 0) continue;
          s.x += WALK_SPEED * (s.side === 'player' ? 1 : -1);
          s.frame++;
          if (s.side === 'player' && s.x >= RIGHT_X - 30) {
            state.enemyHp = Math.max(0, state.enemyHp - TENT_DMG);
            state.shakeRight = 22;
            burst(state.particles, RIGHT_X, GROUND_Y - 60, 18, ['#fbbf24','#f59e0b','#ef4444','#fff'], 4);
            freshDead.add(s.id);
            if (state.enemyHp <= 0) { state.winner = 'player'; cbRef.current?.('player'); }
            continue;
          }
          if (s.side === 'enemy' && s.x <= LEFT_X + 30) {
            state.playerHp = Math.max(0, state.playerHp - TENT_DMG);
            state.shakeLeft  = 22;
            burst(state.particles, LEFT_X, GROUND_Y - 60, 18, ['#fbbf24','#f59e0b','#3b82f6','#fff'], 4);
            freshDead.add(s.id);
            if (state.playerHp <= 0) { state.winner = 'enemy'; cbRef.current?.('enemy'); }
            continue;
          }
          for (const opp of state.soldiers) {
            if (opp.side === s.side || opp.fightingWith !== null || freshDead.has(opp.id) || opp.dying > 0) continue;
            if (Math.abs(s.x - opp.x) < FIGHT_RANGE) {
              s.fightingWith = opp.id; opp.fightingWith = s.id;
              s.frame = opp.frame = 0; break;
            }
          }
        }
        state.soldiers = state.soldiers.filter(s => !freshDead.has(s.id));

        state.particles = state.particles.filter(p => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--;
          return p.life > 0;
        });
      } else {
        state.winFrame++;
        state.particles = state.particles.filter(p => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--;
          return p.life > 0;
        });
      }

      // ── DRAW ────────────────────────────────────────────────────────────────
      ctx.save();
      ctx.scale(dpr, dpr);

      // ── Background ──────────────────────────────────────────────────────────
      if (bgReady.current && bgImg.current) {
        // Stretch the image to fill the entire canvas
        ctx.drawImage(bgImg.current, 0, 0, cw, CANVAS_H);
      } else {
        // Procedural fallback sky
        const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        sky.addColorStop(0, '#6bb8d4'); sky.addColorStop(1, '#c8e8f8');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, CANVAS_H);
        // Stars
        for (const st of state.stars) {
          const a = 0.35 + 0.35 * Math.sin(tick * st.speed + st.phase);
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.beginPath(); ctx.arc(st.x * cw, st.y * CANVAS_H, st.r, 0, Math.PI * 2); ctx.fill();
        }
        // Sun
        ctx.fillStyle = 'rgba(255,235,80,0.9)';
        ctx.beginPath(); ctx.arc(cw / 2, 26, 14, 0, Math.PI * 2); ctx.fill();
        // Ground
        const grassGrad = ctx.createLinearGradient(0, GROUND_Y - 6, 0, CANVAS_H);
        grassGrad.addColorStop(0, '#5db832'); grassGrad.addColorStop(1, '#3d8a18');
        ctx.fillStyle = grassGrad; ctx.fillRect(0, GROUND_Y - 6, cw, CANVAS_H - GROUND_Y + 6);
        // Path
        const pathGrad = ctx.createLinearGradient(0, GROUND_Y - 10, 0, GROUND_Y + 4);
        pathGrad.addColorStop(0, '#c8a05a'); pathGrad.addColorStop(1, '#a07a38');
        ctx.fillStyle = pathGrad;
        ctx.fillRect(LEFT_X + 32, GROUND_Y - 10, RIGHT_X - LEFT_X - 64, 10);
      }

      // ── HP bar helper ────────────────────────────────────────────────────────
      const drawHpBar = (cx: number, topY: number, hp: number) => {
        const barW = 74, barH = 11;
        const bx = cx - barW / 2, by = topY - barH - 6;

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        rr(ctx, bx - 1, by - 1, barW + 2, barH + 2, 5); ctx.fill();
        ctx.fillStyle = '#0f172a';
        rr(ctx, bx, by, barW, barH, 5); ctx.fill();

        const pct = Math.max(0, hp / TENT_MAX_HP);
        if (pct > 0) {
          const hpC = pct > 0.6 ? '#22c55e' : pct > 0.3 ? '#f59e0b' : '#ef4444';
          ctx.fillStyle = hpC; rr(ctx, bx, by, barW * pct, barH, 5); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.3)'; rr(ctx, bx, by, barW * pct, barH / 2, 5); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
        rr(ctx, bx, by, barW, barH, 5); ctx.stroke();

        ctx.font = 'bold 10px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 5;
        ctx.fillText(`${hp} HP`, cx, by - 2);
        ctx.shadowBlur = 0; ctx.textBaseline = 'alphabetic';
      };

      // ── Procedural tent fallback ─────────────────────────────────────────────
      const drawProceduralTent = (tx: number, side: 'player' | 'enemy', hp: number, shake: number) => {
        const ox  = shake > 0 ? Math.sin(tick * 0.5) * 5 : 0;
        const x   = tx + ox;
        const isP = side === 'player';
        const bodyC = isP ? '#2563eb' : '#dc2626';
        const darkC = isP ? '#1e3a8a' : '#7f1d1d';
        const lightC = isP ? '#93c5fd' : '#fca5a5';
        const accentC = isP ? '#60a5fa' : '#f87171';

        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.ellipse(x, GROUND_Y + 4, 36, 7, 0, 0, Math.PI * 2); ctx.fill();

        const tentG = ctx.createLinearGradient(x-30, 0, x+30, 0);
        tentG.addColorStop(0, darkC); tentG.addColorStop(0.4, bodyC); tentG.addColorStop(1, lightC);
        ctx.beginPath();
        ctx.moveTo(x - 30, GROUND_Y - 9); ctx.lineTo(x, GROUND_Y - 84); ctx.lineTo(x + 30, GROUND_Y - 9);
        ctx.closePath(); ctx.fillStyle = tentG; ctx.fill();
        ctx.strokeStyle = darkC; ctx.lineWidth = 2; ctx.stroke();

        ctx.fillStyle = darkC;
        ctx.beginPath(); ctx.arc(x, GROUND_Y - 17, 12, Math.PI, 0);
        ctx.lineTo(x + 12, GROUND_Y - 7); ctx.lineTo(x - 12, GROUND_Y - 7);
        ctx.closePath(); ctx.fill();

        // Flag
        ctx.strokeStyle = '#8d7452'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, GROUND_Y - 84); ctx.lineTo(x, GROUND_Y - 104); ctx.stroke();
        const fw = Math.sin(tick * 0.07 + (isP ? 0 : Math.PI)) * 3;
        const fd = isP ? 1 : -1;
        ctx.fillStyle = accentC;
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y - 103);
        ctx.quadraticCurveTo(x + fd*11, GROUND_Y-96+fw, x + fd*19, GROUND_Y-91+fw*.5);
        ctx.quadraticCurveTo(x + fd*11, GROUND_Y-86+fw, x, GROUND_Y-83);
        ctx.closePath(); ctx.fill();

        drawHpBar(x, GROUND_Y - 84, hp);
      };

      // ── Tent drawing: image or fallback ──────────────────────────────────────
      const drawTent = (side: 'player' | 'enemy', hp: number, shake: number) => {
        const isPlayer  = side === 'player';
        const tx        = isPlayer ? LEFT_X : RIGHT_X;
        const imgCvs    = isPlayer ? playerTentCvs.current : enemyTentCvs.current;
        const dw        = isPlayer ? ptW.current : etW.current;
        const dh        = isPlayer ? ptH.current : etH.current;
        const ox        = shake > 0 ? Math.sin(tick * 0.5) * 5 : 0;
        const cx        = tx + ox;

        if (imgCvs && dw > 0 && dh > 0) {
          const yOffset = isPlayer ? PLAYER_TENT_Y_OFFSET : 0;
          const drawY   = GROUND_Y - dh + yOffset;
          // Draw tent image: centred on cx, bottom flush with GROUND_Y (+ optional offset)
          // Player tent is flipped horizontally so it faces into the battlefield
          if (isPlayer) {
            ctx.save();
            ctx.translate(cx + dw / 2, drawY);
            ctx.scale(-1, 1);
            ctx.drawImage(imgCvs, 0, 0, dw, dh);
            ctx.restore();
          } else {
            ctx.drawImage(imgCvs, cx - dw / 2, drawY, dw, dh);
          }
          // HP bar above the image
          drawHpBar(cx, drawY, hp);
        } else {
          drawProceduralTent(tx, side, hp, shake);
        }
      };

      drawTent('player', state.playerHp, state.shakeLeft);
      drawTent('enemy',  state.enemyHp,  state.shakeRight);

      // ── Soldiers ────────────────────────────────────────────────────────────
      const drawSoldier = (s: Soldier) => {
        const fighting   = s.fightingWith !== null;
        const dying      = s.dying > 0;
        const isPlayer   = s.side === 'player';
        const isBilal    = !!s.isBilal;
        const isJafar    = !!s.isJafar;

        // Pick sprite sheet: Jafar > Bilal > Hamzah for player side, Albert for enemy
        let spriteReady: boolean;
        let sheet: HTMLCanvasElement | null;
        if (isJafar) {
          spriteReady = jafarReady.current;
          sheet = fighting ? jafarFight.current : jafarWalk.current;
        } else if (isBilal) {
          spriteReady = bilalReady.current;
          sheet = fighting ? bilalFight.current : bilalWalk.current;
        } else if (isPlayer) {
          spriteReady = hamzahReady.current;
          sheet = fighting ? hamzahFight.current : hamzahWalk.current;
        } else {
          spriteReady = albertReady.current;
          sheet = fighting ? albertFight.current : albertWalk.current;
        }

        if (spriteReady && sheet) {
          const frameIdx  = Math.floor(s.frame / ANIM_TICK) % TOTAL_FRAMES;
          const col = frameIdx % SHEET_COLS;
          const row = Math.floor(frameIdx / SHEET_COLS);
          const fw  = sheet.width  / SHEET_COLS;
          const fh  = sheet.height / SHEET_ROWS;
          // Per-character foot ratio so each sprite aligns to its shadow
          const footRatio = isJafar ? JAFAR_FOOT_RATIO : isBilal ? BILAL_FOOT_RATIO : (isPlayer ? HAMZAH_FOOT_RATIO : ALBERT_FOOT_RATIO);
          // Elite characters are drawn bigger to look more imposing
          const scale  = isJafar ? 1.30 : isBilal ? 1.15 : 1;
          const drawW  = SPRITE_W * scale;
          const drawH  = SPRITE_H * scale;
          const drawY = s.y - drawH * footRatio;
          const drawX = s.x - drawW / 2;

          ctx.globalAlpha = dying ? (s.dying % 3 === 0 ? 0.25 : 1) : 1;

          // Aura glow — gold for Bilal, crimson for Jafar
          if ((isBilal || isJafar) && !dying) {
            ctx.save();
            const auraColor  = isJafar ? '#ef4444' : '#fbbf24';
            const auraFill   = isJafar ? 'rgba(239,68,68,0.18)' : 'rgba(251,191,36,0.18)';
            ctx.shadowColor  = auraColor;
            ctx.shadowBlur   = (isJafar ? 26 : 18) + 6 * Math.sin(tick * 0.08);
            ctx.fillStyle    = auraFill;
            ctx.beginPath();
            ctx.ellipse(s.x, s.y - drawH * 0.4, drawW * 0.4, drawH * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Ground shadow
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, drawW * 0.38, 4, 0, 0, Math.PI * 2); ctx.fill();

          ctx.save();
          if (isPlayer || isBilal || isJafar) {
            // Hamzah / Bilal / Jafar face right → player walks right → draw as-is
            ctx.drawImage(sheet, col * fw, row * fh, fw, fh, drawX, drawY, drawW, drawH);
          } else {
            // Albert faces right → enemy walks left → flip horizontally around s.x
            ctx.translate(s.x, drawY);
            ctx.scale(-1, 1);
            ctx.drawImage(sheet, col * fw, row * fh, fw, fh, -drawW / 2, 0, drawW, drawH);
          }
          ctx.restore();

          // ── Soldier HP bar (always visible above head) ──────────────────
          if (!dying) {
            const barW = 44, barH = 5;
            const bx   = s.x - barW / 2;
            const by   = drawY - 9;
            const hpPct = s.hp / s.maxHp;
            const hpColor = hpPct > 0.6 ? '#22c55e' : hpPct > 0.3 ? '#f59e0b' : '#ef4444';
            // Track shadow
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            rr(ctx, bx - 1, by - 1, barW + 2, barH + 2, 3); ctx.fill();
            // Track
            ctx.fillStyle = '#1e293b';
            rr(ctx, bx, by, barW, barH, 2); ctx.fill();
            // Fill
            if (hpPct > 0) {
              ctx.fillStyle = hpColor;
              rr(ctx, bx, by, barW * hpPct, barH, 2); ctx.fill();
              // Shine
              ctx.fillStyle = 'rgba(255,255,255,0.28)';
              rr(ctx, bx, by, barW * hpPct, barH / 2, 2); ctx.fill();
            }
            // Border
            ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.5;
            rr(ctx, bx, by, barW, barH, 2); ctx.stroke();
          }

          // ── Character label above the sprite ───────────────────────────
          if ((isBilal || isJafar) && !dying) {
            ctx.save();
            ctx.font = `bold ${isJafar ? 13 : 11}px system-ui,sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = isJafar ? '#f87171' : '#fbbf24';
            ctx.shadowColor = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur = 4;
            ctx.fillText(isJafar ? '⚔️ JAFAR' : '★ BILAL', s.x, drawY - 12);
            ctx.restore();
          }

          ctx.globalAlpha = 1;

        } else {
          // Procedural fallback soldier
          const isP    = s.side === 'player';
          const isBilalFallback = !!s.isBilal;
          const isJafarFallback = !!s.isJafar;
          // Elite characters get distinct colours even in fallback
          const bodyC = isJafarFallback ? '#b91c1c' : isBilalFallback ? '#d97706' : (isP ? '#2563eb' : '#dc2626');
          const darkC = isJafarFallback ? '#7f1d1d' : isBilalFallback ? '#92400e' : (isP ? '#1e3a8a' : '#991b1b');
          const bob   = Math.sin(s.frame * 0.22) * 1.8;
          const baseY = s.y + bob;
          ctx.globalAlpha = dying ? (s.dying % 3 === 0 ? 0.25 : 1) : 1;
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
          const legA = Math.sin(s.frame * 0.25) * (s.fightingWith ? 4 : 10);
          ctx.strokeStyle = darkC; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(s.x-2, baseY-14); ctx.lineTo(s.x-5, baseY-legA); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s.x+2, baseY-14); ctx.lineTo(s.x+5, baseY+legA); ctx.stroke();
          ctx.fillStyle = bodyC; rr(ctx, s.x-7, baseY-32, 14, 18, 3); ctx.fill();
          ctx.strokeStyle = darkC; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(s.x, baseY-42, 8, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = darkC; ctx.beginPath(); ctx.arc(s.x, baseY-43, 9, Math.PI, 0); ctx.fill();
          ctx.globalAlpha = 1;
        }
      };

      [...state.soldiers].sort((a, b) => a.y - b.y).forEach(drawSoldier);

      // ── Particles ───────────────────────────────────────────────────────────
      for (const p of state.particles) {
        const a = p.life / p.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Winner overlay ──────────────────────────────────────────────────────
      if (state.winner) {
        const wf = Math.min(state.winFrame, 30) / 30;
        ctx.fillStyle = `rgba(0,0,0,${0.52 * wf})`;
        ctx.fillRect(0, 0, cw, CANVAS_H);

        if (wf > 0.5) {
          const isPlayerWin = state.winner === 'player';
          const a  = (wf - 0.5) * 2;
          const sc = 0.6 + 0.4 * a;
          ctx.save();
          ctx.translate(cw / 2, CANVAS_H / 2);
          ctx.scale(sc, sc);
          ctx.globalAlpha = a;

          ctx.fillStyle = isPlayerWin ? 'rgba(20,40,120,0.94)' : 'rgba(100,20,20,0.94)';
          rr(ctx, -115, -34, 230, 68, 14); ctx.fill();
          ctx.strokeStyle = isPlayerWin ? '#93c5fd' : '#fca5a5'; ctx.lineWidth = 3; ctx.stroke();

          ctx.font = 'bold 25px system-ui,sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = isPlayerWin ? '#fde047' : '#f87171';
          ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10;
          ctx.fillText(isPlayerWin ? '🏆 You Win!' : '💀 Game Over', 0, -10);
          ctx.font = 'bold 14px system-ui,sans-serif';
          ctx.fillStyle = '#fff'; ctx.shadowBlur = 6;
          ctx.fillText(isPlayerWin ? 'Amazing job! 🌟' : 'Try again! 💪', 0, 15);
          ctx.shadowBlur = 0;
          ctx.restore(); ctx.globalAlpha = 1;
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%', height: `${CANVAS_H}px`,
        display: 'block', borderRadius: 0,
        borderTop: '2px solid rgba(180,100,20,0.3)',
        borderBottom: '2px solid rgba(180,100,20,0.3)',
        boxShadow: '0 6px 28px rgba(0,0,0,0.18)',
      }}
    />
  );
});

TowerDefenseGame.displayName = 'TowerDefenseGame';
export default TowerDefenseGame;
