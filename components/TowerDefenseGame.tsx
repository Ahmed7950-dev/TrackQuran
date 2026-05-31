import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

export interface TowerDefenseRef {
  spawnPlayerSoldier: () => void;
  spawnEnemySoldier: () => void;
  reset: () => void;
}

// ─── Data types ────────────────────────────────────────────────────────────────
interface Soldier {
  id: number;
  side: 'player' | 'enemy';
  x: number;
  y: number;          // foot-anchor y (boots land here)
  hp: number;
  maxHp: number;
  fightingWith: number | null;
  frame: number;      // monotonic tick used for animation
  dying: number;      // > 0 → death-flash frames remaining
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; r: number;
}

interface Star { x: number; y: number; r: number; phase: number; speed: number; }

interface GS {
  soldiers: Soldier[];
  particles: Particle[];
  playerHp: number;
  enemyHp: number;
  nextId: number;
  winner: 'player' | 'enemy' | null;
  winFrame: number;
  shakeLeft: number;
  shakeRight: number;
  stars: Star[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_H    = 250;
const TENT_MAX_HP = 100;
const SOL_MAX_HP  = 3;
const FIGHT_RANGE = 28;
const WALK_SPEED  = 0.85;
const TENT_DMG    = 25;
const DEATH_TICKS = 14;
const GROUND_Y    = CANVAS_H - 32;   // absolute ground line

// Tent anchor x values are set per-render from canvas width (see LEFT_X / RIGHT_X)

// ─── Helpers ───────────────────────────────────────────────────────────────────
/** Draw a rounded rectangle path */
function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const m = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + m, y);
  ctx.lineTo(x + w - m, y);
  ctx.arcTo(x + w, y, x + w, y + m, m);
  ctx.lineTo(x + w, y + h - m);
  ctx.arcTo(x + w, y + h, x + w - m, y + h, m);
  ctx.lineTo(x + m, y + h);
  ctx.arcTo(x, y + h, x, y + h - m, m);
  ctx.lineTo(x, y + m);
  ctx.arcTo(x, y, x + m, y, m);
  ctx.closePath();
}

function burst(
  ps: Particle[], x: number, y: number,
  count: number, colors: string[], speed = 3,
) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random());
    ps.push({
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5,
      life: 18 + Math.random() * 12,
      maxLife: 30,
      color: colors[Math.floor(Math.random() * colors.length)],
      r: 2 + Math.random() * 3,
    });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
const TowerDefenseGame = forwardRef<TowerDefenseRef, {
  onGameOver?: (winner: 'player' | 'enemy') => void;
}>(({ onGameOver }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const makeGS = (): GS => ({
    soldiers: [], particles: [],
    playerHp: TENT_MAX_HP, enemyHp: TENT_MAX_HP,
    nextId: 0, winner: null, winFrame: 0,
    shakeLeft: 0, shakeRight: 0,
    stars: Array.from({ length: 28 }, () => ({
      x: Math.random(), y: Math.random() * 0.55,
      r: 0.8 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.03 + Math.random() * 0.04,
    })),
  });

  const gs = useRef<GS>(makeGS());
  const cbRef = useRef(onGameOver);
  cbRef.current = onGameOver;

  useImperativeHandle(ref, () => ({
    spawnPlayerSoldier() {
      if (gs.current.winner) return;
      const canvas = canvasRef.current;
      const LEFT_X = 58;
      // spawn a touch to the right of the tent door
      gs.current.soldiers.push({
        id: gs.current.nextId++,
        side: 'player',
        x: LEFT_X + 18,
        y: GROUND_Y - 2 - Math.random() * 8,
        hp: SOL_MAX_HP, maxHp: SOL_MAX_HP,
        fightingWith: null, frame: 0, dying: 0,
      });
      void canvas; // satisfy linter
    },
    spawnEnemySoldier() {
      if (gs.current.winner) return;
      const canvas = canvasRef.current;
      const cw = canvas ? canvas.width / devicePixelRatio : 600;
      const RIGHT_X = cw - 58;
      gs.current.soldiers.push({
        id: gs.current.nextId++,
        side: 'enemy',
        x: RIGHT_X - 18,
        y: GROUND_Y - 2 - Math.random() * 8,
        hp: SOL_MAX_HP, maxHp: SOL_MAX_HP,
        fightingWith: null, frame: 0, dying: 0,
      });
    },
    reset() { gs.current = makeGS(); },
  }));

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
      const state = gs.current;
      const dpr = devicePixelRatio;
      const cw  = canvas.width / dpr;
      const ctx  = canvas.getContext('2d');
      if (!ctx) { animId = requestAnimationFrame(loop); return; }

      const LEFT_X  = 58;
      const RIGHT_X = cw - 58;

      // ── UPDATE ──────────────────────────────────────────────────────────────
      if (!state.winner) {
        if (state.shakeLeft  > 0) state.shakeLeft--;
        if (state.shakeRight > 0) state.shakeRight--;

        // Advance dying soldiers; remove when done
        const deadIds = new Set<number>();
        for (const s of state.soldiers) {
          if (s.dying > 0) {
            s.dying--;
            s.frame++;
            if (s.dying === 0) deadIds.add(s.id);
          }
        }

        // Collect simultaneous damage (no turn-order bias)
        const dmgMap = new Map<number, number>();
        for (const s of state.soldiers) {
          if (s.dying > 0 || s.fightingWith === null || deadIds.has(s.id)) continue;
          s.frame++;
          // Swing every 32 ticks
          if (s.frame % 32 === 0) {
            dmgMap.set(s.fightingWith, (dmgMap.get(s.fightingWith) ?? 0) + 1);
          }
        }

        // Apply damage
        for (const s of state.soldiers) {
          if (deadIds.has(s.id) || s.dying > 0) continue;
          const d = dmgMap.get(s.id) ?? 0;
          if (d > 0) {
            s.hp -= d;
            if (s.hp <= 0) {
              s.dying = DEATH_TICKS;
              s.fightingWith = null;
              burst(state.particles, s.x, s.y - 20, 10,
                s.side === 'player'
                  ? ['#93c5fd','#3b82f6','#fff']
                  : ['#fca5a5','#ef4444','#fff'],
                2.5,
              );
            }
          }
        }

        // Clear fightingWith refs to now-dying soldiers
        for (const s of state.soldiers) {
          if (s.fightingWith !== null) {
            const opp = state.soldiers.find(o => o.id === s.fightingWith);
            if (!opp || opp.dying > 0) s.fightingWith = null;
          }
        }

        // Remove fully-dead
        state.soldiers = state.soldiers.filter(s => !deadIds.has(s.id));

        // Move walking soldiers; detect new fights & tent hits
        const freshDead = new Set<number>();
        for (const s of state.soldiers) {
          if (s.fightingWith !== null || s.dying > 0) continue;
          const dir = s.side === 'player' ? 1 : -1;
          s.x += WALK_SPEED * dir;
          s.frame++;

          // Tent hit
          if (s.side === 'player' && s.x >= RIGHT_X - 22) {
            state.enemyHp = Math.max(0, state.enemyHp - TENT_DMG);
            state.shakeRight = 22;
            burst(state.particles, RIGHT_X, GROUND_Y - 50, 14,
              ['#fbbf24','#f59e0b','#ef4444','#fff'], 3);
            freshDead.add(s.id);
            if (state.enemyHp <= 0) {
              state.winner = 'player';
              cbRef.current?.('player');
            }
            continue;
          }
          if (s.side === 'enemy' && s.x <= LEFT_X + 22) {
            state.playerHp = Math.max(0, state.playerHp - TENT_DMG);
            state.shakeLeft = 22;
            burst(state.particles, LEFT_X, GROUND_Y - 50, 14,
              ['#fbbf24','#f59e0b','#3b82f6','#fff'], 3);
            freshDead.add(s.id);
            if (state.playerHp <= 0) {
              state.winner = 'enemy';
              cbRef.current?.('enemy');
            }
            continue;
          }

          // Collision → fight pairing
          for (const opp of state.soldiers) {
            if (
              opp.side === s.side ||
              opp.fightingWith !== null ||
              freshDead.has(opp.id) ||
              opp.dying > 0
            ) continue;
            if (Math.abs(s.x - opp.x) < FIGHT_RANGE) {
              s.fightingWith   = opp.id;
              opp.fightingWith = s.id;
              s.frame = opp.frame = 0;
              break;
            }
          }
        }
        state.soldiers = state.soldiers.filter(s => !freshDead.has(s.id));

        // Update particles
        state.particles = state.particles.filter(p => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.18;
          p.life--;
          return p.life > 0;
        });
      } else {
        state.winFrame++;
        // Still update particles after win
        state.particles = state.particles.filter(p => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--;
          return p.life > 0;
        });
      }

      // ── DRAW ────────────────────────────────────────────────────────────────
      ctx.save();
      ctx.scale(dpr, dpr);

      // ── Background sky ──────────────────────────────────────────────────────
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, '#7ec8e3');
      sky.addColorStop(1, '#d4edff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cw, CANVAS_H);

      // Stars (twinkle)
      for (const st of state.stars) {
        const alpha = 0.4 + 0.4 * Math.sin(tick * st.speed + st.phase);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(st.x * cw, st.y * CANVAS_H, st.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sun
      ctx.fillStyle = 'rgba(255,235,80,0.9)';
      ctx.beginPath(); ctx.arc(cw / 2, 26, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,235,80,0.3)';
      ctx.beginPath(); ctx.arc(cw / 2, 26, 22, 0, Math.PI * 2); ctx.fill();

      // Clouds
      const cloud = (cx: number, cy: number, s: number) => {
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        for (const [dx, dy, rs] of [[0,0,1],[s*.8,s*.28,.72],[-s*.7,s*.22,.68]] as [number,number,number][]) {
          ctx.beginPath(); ctx.arc(cx+dx, cy+dy, s*rs, 0, Math.PI*2); ctx.fill();
        }
      };
      cloud(cw * 0.22, 20, 16 + Math.sin(tick * 0.005) * 1.5);
      cloud(cw * 0.70, 16, 14 + Math.cos(tick * 0.006) * 1.5);
      cloud(cw * 0.46, 28, 11);

      // ── Ground ──────────────────────────────────────────────────────────────
      // Green grass strip
      const grassGrad = ctx.createLinearGradient(0, GROUND_Y - 6, 0, CANVAS_H);
      grassGrad.addColorStop(0, '#5db832');
      grassGrad.addColorStop(0.2, '#4aaa1e');
      grassGrad.addColorStop(1, '#3d8a18');
      ctx.fillStyle = grassGrad;
      ctx.fillRect(0, GROUND_Y - 6, cw, CANVAS_H - GROUND_Y + 6);

      // Ground highlight
      ctx.fillStyle = 'rgba(120,220,60,0.4)';
      ctx.fillRect(0, GROUND_Y - 6, cw, 3);

      // Dirt path (lane)
      const pathGrad = ctx.createLinearGradient(0, GROUND_Y - 10, 0, GROUND_Y + 4);
      pathGrad.addColorStop(0, '#c8a05a');
      pathGrad.addColorStop(1, '#a07a38');
      ctx.fillStyle = pathGrad;
      const pathL = LEFT_X + 28;
      const pathR = RIGHT_X - 28;
      ctx.fillRect(pathL, GROUND_Y - 10, pathR - pathL, 10);
      // Path top highlight
      ctx.fillStyle = 'rgba(255,220,130,0.3)';
      ctx.fillRect(pathL, GROUND_Y - 10, pathR - pathL, 2);
      // Dirt texture dots
      ctx.fillStyle = 'rgba(100,70,20,0.15)';
      for (let dx = pathL + 12; dx < pathR; dx += 22) {
        ctx.beginPath(); ctx.arc(dx, GROUND_Y - 5, 1.5, 0, Math.PI * 2); ctx.fill();
      }

      // ── Tents ───────────────────────────────────────────────────────────────
      const drawTent = (
        tx: number,
        side: 'player' | 'enemy',
        hp: number,
        shake: number,
      ) => {
        const ox  = shake > 0 ? Math.sin(tick * 0.5) * 5 : 0;
        const x   = tx + ox;
        const isP = side === 'player';

        const bodyC  = isP ? '#2563eb' : '#dc2626';
        const darkC  = isP ? '#1e3a8a' : '#7f1d1d';
        const lightC = isP ? '#93c5fd' : '#fca5a5';
        const accentC = isP ? '#60a5fa' : '#f87171';

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(x, GROUND_Y + 4, 34, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // ── Base platform ──────────────────────────────────────────────────
        const platGrad = ctx.createLinearGradient(x - 32, 0, x + 32, 0);
        platGrad.addColorStop(0, darkC);
        platGrad.addColorStop(0.5, bodyC);
        platGrad.addColorStop(1, lightC);
        ctx.fillStyle = platGrad;
        rr(ctx, x - 32, GROUND_Y - 8, 64, 12, 4);
        ctx.fill();
        ctx.strokeStyle = darkC; ctx.lineWidth = 1.5; ctx.stroke();

        // ── Main tent body ─────────────────────────────────────────────────
        const tentGrad = ctx.createLinearGradient(x - 28, 0, x + 28, 0);
        tentGrad.addColorStop(0, darkC);
        tentGrad.addColorStop(0.4, bodyC);
        tentGrad.addColorStop(1, lightC);

        ctx.beginPath();
        ctx.moveTo(x - 28, GROUND_Y - 8);
        ctx.lineTo(x, GROUND_Y - 80);
        ctx.lineTo(x + 28, GROUND_Y - 8);
        ctx.closePath();
        ctx.fillStyle = tentGrad;
        ctx.fill();
        ctx.strokeStyle = darkC; ctx.lineWidth = 2; ctx.stroke();

        // Horizontal band stripes
        ctx.strokeStyle = 'rgba(255,255,255,0.20)';
        ctx.lineWidth = 1;
        for (let frac = 0.2; frac < 0.9; frac += 0.25) {
          const ly  = GROUND_Y - 8 - (72 * frac);
          const half = 28 * (1 - frac);
          ctx.beginPath(); ctx.moveTo(x - half, ly); ctx.lineTo(x + half, ly); ctx.stroke();
        }

        // Left & right seams
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, GROUND_Y - 80); ctx.lineTo(x - 28, GROUND_Y - 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, GROUND_Y - 80); ctx.lineTo(x + 28, GROUND_Y - 8); ctx.stroke();

        // ── Door opening ───────────────────────────────────────────────────
        ctx.fillStyle = darkC;
        ctx.beginPath();
        ctx.arc(x, GROUND_Y - 16, 11, Math.PI, 0);
        ctx.lineTo(x + 11, GROUND_Y - 6);
        ctx.lineTo(x - 11, GROUND_Y - 6);
        ctx.closePath();
        ctx.fill();
        // Door glow
        ctx.fillStyle = 'rgba(255,200,80,0.18)';
        ctx.beginPath();
        ctx.arc(x, GROUND_Y - 16, 8, Math.PI, 0);
        ctx.lineTo(x + 8, GROUND_Y - 8);
        ctx.lineTo(x - 8, GROUND_Y - 8);
        ctx.closePath();
        ctx.fill();

        // ── Flag pole ──────────────────────────────────────────────────────
        ctx.strokeStyle = '#8d7452';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y - 80);
        ctx.lineTo(x, GROUND_Y - 98);
        ctx.stroke();

        // Flag wave
        const fw = Math.sin(tick * 0.07 + (isP ? 0 : Math.PI)) * 3;
        const fd = isP ? 1 : -1;
        ctx.fillStyle = accentC;
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y - 97);
        ctx.quadraticCurveTo(x + fd * 10, GROUND_Y - 91 + fw, x + fd * 18, GROUND_Y - 87 + fw * 0.5);
        ctx.quadraticCurveTo(x + fd * 10, GROUND_Y - 83 + fw, x, GROUND_Y - 79);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Star on flag
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('★', x + fd * 9, GROUND_Y - 89 + fw * 0.5);

        // ── HP bar ─────────────────────────────────────────────────────────
        const barW = 72;
        const barH = 11;
        const bx   = x - barW / 2;
        const by   = GROUND_Y - 116;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        rr(ctx, bx - 1, by - 1, barW + 2, barH + 2, 5);
        ctx.fill();

        // Track
        ctx.fillStyle = '#0f172a';
        rr(ctx, bx, by, barW, barH, 5);
        ctx.fill();

        // Fill
        const pct = Math.max(0, hp / TENT_MAX_HP);
        if (pct > 0) {
          const hpC = pct > 0.6 ? '#22c55e' : pct > 0.3 ? '#f59e0b' : '#ef4444';
          ctx.fillStyle = hpC;
          rr(ctx, bx, by, barW * pct, barH, 5);
          ctx.fill();
          // Shine
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          rr(ctx, bx, by, barW * pct, barH / 2, 5);
          ctx.fill();
        }

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        rr(ctx, bx, by, barW, barH, 5);
        ctx.stroke();

        // HP text
        ctx.font = 'bold 10px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
        ctx.fillText(`${hp} HP`, x, by - 2);
        ctx.shadowBlur = 0;
        ctx.textBaseline = 'alphabetic';
      };

      drawTent(LEFT_X,  'player', state.playerHp, state.shakeLeft);
      drawTent(RIGHT_X, 'enemy',  state.enemyHp,  state.shakeRight);

      // ── Soldiers ────────────────────────────────────────────────────────────
      const drawSoldier = (s: Soldier) => {
        const isP      = s.side === 'player';
        const bodyC    = isP ? '#2563eb' : '#dc2626';
        const darkC    = isP ? '#1e3a8a' : '#991b1b';
        const helmetC  = isP ? '#1e40af' : '#b91c1c';
        const plumeC   = isP ? '#93c5fd' : '#fca5a5';
        const shieldC  = isP ? '#1d4ed8' : '#991b1b';
        const shieldRim = isP ? '#bfdbfe' : '#fecaca';
        const fighting  = s.fightingWith !== null;
        const dying     = s.dying > 0;

        // Death flash: alternate white/red
        const deathAlpha = dying ? (s.dying % 3 === 0 ? 0.3 : 1) : 1;
        ctx.globalAlpha = deathAlpha;

        const footY  = s.y;
        const bob    = Math.sin(s.frame * (fighting ? 0.28 : 0.22)) * (fighting ? 2.5 : 1.8);
        const baseY  = footY + bob;          // animated base = boot level

        // ── Ground shadow ──────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.ellipse(s.x, footY + 2, 8, 3, 0, 0, Math.PI * 2); ctx.fill();

        // ── Walk / fight leg cycle ─────────────────────────────────────────
        const legA = fighting ? Math.sin(s.frame * 0.30) * 5 : Math.sin(s.frame * 0.25) * 10;
        // Left leg
        ctx.strokeStyle = darkC; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x - 2, baseY - 14);
        ctx.lineTo(s.x - 5, baseY - legA);
        ctx.stroke();
        // Right leg
        ctx.beginPath();
        ctx.moveTo(s.x + 2, baseY - 14);
        ctx.lineTo(s.x + 5, baseY + legA);
        ctx.stroke();

        // Boots
        ctx.fillStyle = '#44403c';
        ctx.beginPath(); ctx.ellipse(s.x - 5, baseY - legA, 4.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(s.x + 5, baseY + legA, 4.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();

        // ── Torso ─────────────────────────────────────────────────────────
        const bodyGrad = ctx.createLinearGradient(s.x - 8, 0, s.x + 8, 0);
        bodyGrad.addColorStop(0, darkC);
        bodyGrad.addColorStop(0.5, bodyC);
        bodyGrad.addColorStop(1, isP ? '#60a5fa' : '#f87171');
        ctx.fillStyle = bodyGrad;
        rr(ctx, s.x - 7, baseY - 32, 14, 18, 3);
        ctx.fill();
        ctx.strokeStyle = darkC; ctx.lineWidth = 1; ctx.stroke();

        // Belt
        ctx.fillStyle = '#78350f';
        ctx.fillRect(s.x - 7, baseY - 17, 14, 3);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s.x, baseY - 15, 2, 0, Math.PI * 2); ctx.fill();

        // ── Shield (off-hand side) ─────────────────────────────────────────
        const shieldDir = isP ? -1 : 1;
        ctx.fillStyle = shieldC;
        rr(ctx, s.x + shieldDir * 7 - 4, baseY - 31, 7, 14, 2);
        ctx.fill();
        ctx.strokeStyle = shieldRim; ctx.lineWidth = 1; ctx.stroke();
        // Shield boss
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s.x + shieldDir * 10 - 4 + shieldDir * 3, baseY - 25, 2, 0, Math.PI * 2); ctx.fill();

        // ── Weapon arm ────────────────────────────────────────────────────
        const wDir = isP ? 1 : -1;
        if (fighting) {
          // Attack swing: sine wave
          const swing = Math.sin(s.frame * 0.42) * 8;
          // Upper arm
          ctx.strokeStyle = darkC; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(s.x + wDir * 5, baseY - 28);
          ctx.lineTo(s.x + wDir * 14, baseY - 22 + swing * 0.4);
          ctx.stroke();
          // Sword hilt
          ctx.fillStyle = '#92400e';
          ctx.beginPath(); ctx.arc(s.x + wDir * 14, baseY - 22 + swing * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
          // Sword blade (triangle shape)
          const tipX = s.x + wDir * 28;
          const tipY = baseY - 28 + swing;
          ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(s.x + wDir * 14, baseY - 22 + swing * 0.4);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();
          // Blade highlight
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(s.x + wDir * 16, baseY - 22.5 + swing * 0.4);
          ctx.lineTo(tipX - wDir * 2, tipY + 0.5);
          ctx.stroke();
          // Sword tip
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath(); ctx.arc(tipX, tipY, 2.5, 0, Math.PI * 2); ctx.fill();

          // Clash sparks (every 8 ticks)
          if (tick % 8 < 4) {
            const mx = (s.x + wDir * 28 + (isP ? RIGHT_X : LEFT_X)) / 2;
            const SPARK_COLORS = ['#fbbf24','#fcd34d','#fff','#f87171'];
            ctx.fillStyle = SPARK_COLORS[tick % SPARK_COLORS.length];
            for (let i = 0; i < 2; i++) {
              const a = Math.random() * Math.PI * 2;
              ctx.beginPath();
              ctx.arc(tipX + Math.cos(a)*3, tipY + Math.sin(a)*3, 1.5, 0, Math.PI * 2);
              ctx.fill();
            }
            void mx;
          }
        } else {
          // Walking: arm swings opposite to main leg
          const armSwing = Math.sin(s.frame * 0.25 + Math.PI) * 7;
          ctx.strokeStyle = darkC; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(s.x + wDir * 5, baseY - 28);
          ctx.lineTo(s.x + wDir * 10, baseY - 20 + armSwing);
          ctx.stroke();
          // Spear / lance tip
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(s.x + wDir * 10, baseY - 20 + armSwing);
          ctx.lineTo(s.x + wDir * 10, baseY - 38 + armSwing * 0.3);
          ctx.stroke();
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.moveTo(s.x + wDir * 10, baseY - 38 + armSwing * 0.3);
          ctx.lineTo(s.x + wDir * 14, baseY - 33 + armSwing * 0.3);
          ctx.lineTo(s.x + wDir * 6,  baseY - 33 + armSwing * 0.3);
          ctx.closePath(); ctx.fill();
        }

        // ── Neck ──────────────────────────────────────────────────────────
        ctx.fillStyle = '#f5deb3';
        ctx.beginPath(); ctx.arc(s.x, baseY - 34, 3.5, 0, Math.PI * 2); ctx.fill();

        // ── Head ──────────────────────────────────────────────────────────
        ctx.fillStyle = '#fcd34d';
        ctx.beginPath(); ctx.arc(s.x, baseY - 42, 8.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = darkC; ctx.lineWidth = 1; ctx.stroke();

        // ── Helmet ────────────────────────────────────────────────────────
        ctx.fillStyle = helmetC;
        ctx.beginPath();
        ctx.arc(s.x, baseY - 43, 10, Math.PI, 0);
        ctx.lineTo(s.x + 12, baseY - 35);
        ctx.lineTo(s.x - 12, baseY - 35);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = darkC; ctx.lineWidth = 1; ctx.stroke();

        // Nasal guard
        ctx.fillStyle = darkC;
        ctx.fillRect(s.x - 1, baseY - 43, 2, 8);

        // Cheek guards
        ctx.fillStyle = helmetC;
        ctx.strokeStyle = darkC; ctx.lineWidth = 0.8;
        rr(ctx, s.x - 12, baseY - 39, 5, 7, 2); ctx.fill(); ctx.stroke();
        rr(ctx, s.x + 7,  baseY - 39, 5, 7, 2); ctx.fill(); ctx.stroke();

        // ── Plume ─────────────────────────────────────────────────────────
        const plumeWave = Math.sin(tick * 0.08 + s.x) * 2;
        ctx.fillStyle = plumeC;
        ctx.beginPath();
        ctx.moveTo(s.x - 3, baseY - 52);
        ctx.quadraticCurveTo(s.x + plumeWave, baseY - 60, s.x + 3, baseY - 52);
        ctx.closePath();
        ctx.fill();

        // ── Eyes ──────────────────────────────────────────────────────────
        ctx.fillStyle = darkC;
        ctx.beginPath(); ctx.arc(s.x - 3, baseY - 41, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s.x + 3, baseY - 41, 1.4, 0, Math.PI * 2); ctx.fill();
        // Eye shine
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s.x - 2.3, baseY - 41.6, 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s.x + 3.7, baseY - 41.6, 0.6, 0, Math.PI * 2); ctx.fill();

        // ── HP pips (when damaged) ─────────────────────────────────────────
        if (s.hp < s.maxHp && !dying) {
          for (let i = 0; i < s.maxHp; i++) {
            ctx.fillStyle = i < s.hp ? '#22c55e' : '#ef4444';
            ctx.beginPath();
            ctx.arc(s.x - (s.maxHp - 1) * 5 + i * 10, baseY - 66, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }

        ctx.globalAlpha = 1;
      };

      // Sort by y for depth — soldiers further back (lower y) drawn first
      [...state.soldiers]
        .sort((a, b) => a.y - b.y)
        .forEach(drawSoldier);

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
        ctx.fillStyle = `rgba(0,0,0,${0.55 * wf})`;
        ctx.fillRect(0, 0, cw, CANVAS_H);

        if (wf > 0.5) {
          const isPlayerWin = state.winner === 'player';
          const msgAlpha = (wf - 0.5) * 2;
          const scale    = 0.6 + 0.4 * msgAlpha;

          ctx.save();
          ctx.translate(cw / 2, CANVAS_H / 2);
          ctx.scale(scale, scale);
          ctx.globalAlpha = msgAlpha;

          // Banner
          ctx.fillStyle = isPlayerWin ? 'rgba(30,58,138,0.9)' : 'rgba(127,29,29,0.9)';
          rr(ctx, -110, -32, 220, 64, 14);
          ctx.fill();
          ctx.strokeStyle = isPlayerWin ? '#93c5fd' : '#fca5a5';
          ctx.lineWidth = 3; ctx.stroke();

          // Text
          const line1 = isPlayerWin ? '🏆 You Win!' : '💀 Game Over';
          const line2 = isPlayerWin ? 'Amazing job! 🌟' : 'Try again! 💪';
          ctx.font = 'bold 24px system-ui,sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isPlayerWin ? '#fde047' : '#f87171';
          ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10;
          ctx.fillText(line1, 0, -10);
          ctx.font = 'bold 14px system-ui,sans-serif';
          ctx.fillStyle = '#fff';
          ctx.shadowBlur = 6;
          ctx.fillText(line2, 0, 14);
          ctx.shadowBlur = 0;

          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: `${CANVAS_H}px`,
        display: 'block',
        borderRadius: '16px',
        border: '2px solid rgba(99,102,241,0.25)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4)',
      }}
    />
  );
});

TowerDefenseGame.displayName = 'TowerDefenseGame';
export default TowerDefenseGame;
