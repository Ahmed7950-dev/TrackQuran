import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

export interface TowerDefenseRef {
  spawnPlayerSoldier: () => void;
  spawnEnemySoldier: () => void;
  reset: () => void;
}

// ─── Sprite sheet config ───────────────────────────────────────────────────────
// Both sheets are 5 columns × 5 rows = 25 frames, character faces RIGHT
const SHEET_COLS   = 5;
const SHEET_ROWS   = 5;
const TOTAL_FRAMES = SHEET_COLS * SHEET_ROWS; // 25
const ANIM_TICK    = 3;    // advance one sprite frame every N game ticks
const SPRITE_SIZE  = 92;   // square draw size — source frames are square so keep 1:1
const SPRITE_W     = SPRITE_SIZE;
const SPRITE_H     = SPRITE_SIZE;
const FOOT_RATIO   = 0.88; // feet are at this fraction of sprite height

// ─── Game constants ────────────────────────────────────────────────────────────
const CANVAS_H    = 270;
const TENT_MAX_HP = 100;
const SOL_MAX_HP  = 3;
const FIGHT_RANGE = 70;   // centre-to-centre px to start fighting (wider for sprites)
const WALK_SPEED  = 0.38;
const TENT_DMG    = 25;
const DEATH_TICKS = 18;
const GROUND_Y    = CANVAS_H - 32;

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Soldier {
  id: number;
  side: 'player' | 'enemy';
  x: number;
  y: number;   // foot-anchor y
  hp: number; maxHp: number;
  fightingWith: number | null;
  frame: number;
  dying: number;
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
  playerHp: number; enemyHp: number;
  nextId: number;
  winner: 'player' | 'enemy' | null;
  winFrame: number;
  shakeLeft: number; shakeRight: number;
  stars: Star[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function rr(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
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

function burst(
  ps: Particle[], x: number, y: number,
  count: number, colors: string[], speed = 3,
) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random());
    ps.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5,
      life: 18 + Math.random() * 12, maxLife: 30,
      color: colors[Math.floor(Math.random() * colors.length)],
      r: 2 + Math.random() * 3,
    });
  }
}

/**
 * Remove the white/near-white background from a sprite sheet.
 * Returns an OffscreenCanvas (or regular canvas fallback) with alpha=0
 * wherever the source pixel was close to pure white.
 */
function removeWhiteBg(img: HTMLImageElement): HTMLCanvasElement {
  const oc = document.createElement('canvas');
  oc.width  = img.naturalWidth;
  oc.height = img.naturalHeight;
  const octx = oc.getContext('2d')!;
  octx.drawImage(img, 0, 0);
  const id = octx.getImageData(0, 0, oc.width, oc.height);
  const d  = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // Euclidean distance from pure white
    const dist = Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2);
    if (dist < 40) {
      // Feather the edge for anti-aliasing (linear fade 30-40)
      d[i + 3] = dist < 30 ? 0 : Math.round(((dist - 30) / 10) * 255);
    }
  }
  octx.putImageData(id, 0, 0);
  return oc;
}

// ─── Component ────────────────────────────────────────────────────────────────
const TowerDefenseGame = forwardRef<TowerDefenseRef, {
  onGameOver?: (winner: 'player' | 'enemy') => void;
}>(({ onGameOver }, ref) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);

  // Processed sprite canvases (null until loaded)
  const walkSprite  = useRef<HTMLCanvasElement | null>(null);
  const fightSprite = useRef<HTMLCanvasElement | null>(null);
  const spritesReady = useRef(false);

  const makeGS = (): GS => ({
    soldiers: [], particles: [],
    playerHp: TENT_MAX_HP, enemyHp: TENT_MAX_HP,
    nextId: 0, winner: null, winFrame: 0,
    shakeLeft: 0, shakeRight: 0,
    stars: Array.from({ length: 30 }, () => ({
      x: Math.random(), y: Math.random() * 0.5,
      r: 0.8 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.03 + Math.random() * 0.04,
    })),
  });

  const gs    = useRef<GS>(makeGS());
  const cbRef = useRef(onGameOver);
  cbRef.current = onGameOver;

  // ── Load & process sprite sheets ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = (src: string): Promise<HTMLImageElement> =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload  = () => res(img);
        img.onerror = () => rej(new Error(`Failed to load ${src}`));
        img.src = src;
      });

    (async () => {
      try {
        const [walkImg, fightImg] = await Promise.all([
          load('/sprites/hamzah-walk.png'),
          load('/sprites/hamzah-fight.png'),
        ]);
        if (cancelled) return;
        walkSprite.current  = removeWhiteBg(walkImg);
        fightSprite.current = removeWhiteBg(fightImg);
        spritesReady.current = true;
      } catch (e) {
        console.warn('Hamzah sprites not found — using fallback drawing.', e);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Exposed imperative API ─────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    spawnPlayerSoldier() {
      if (gs.current.winner) return;
      const LEFT_X = 58;
      gs.current.soldiers.push({
        id: gs.current.nextId++, side: 'player',
        x: LEFT_X + 32,
        y: GROUND_Y - 2 - Math.random() * 6,
        hp: SOL_MAX_HP, maxHp: SOL_MAX_HP,
        fightingWith: null, frame: 0, dying: 0,
      });
    },
    spawnEnemySoldier() {
      if (gs.current.winner) return;
      const canvas = canvasRef.current;
      const cw     = canvas ? canvas.width / devicePixelRatio : 600;
      const RIGHT_X = cw - 58;
      gs.current.soldiers.push({
        id: gs.current.nextId++, side: 'enemy',
        x: RIGHT_X - 32,
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
      const state = gs.current;
      const dpr   = devicePixelRatio;
      const cw    = canvas.width / dpr;
      const ctx   = canvas.getContext('2d');
      if (!ctx) { animId = requestAnimationFrame(loop); return; }

      const LEFT_X  = 58;
      const RIGHT_X = cw - 58;

      // ── UPDATE ──────────────────────────────────────────────────────────────
      if (!state.winner) {
        if (state.shakeLeft  > 0) state.shakeLeft--;
        if (state.shakeRight > 0) state.shakeRight--;

        // Advance dying soldiers
        const deadIds = new Set<number>();
        for (const s of state.soldiers) {
          if (s.dying > 0) { s.dying--; s.frame++; if (s.dying === 0) deadIds.add(s.id); }
        }

        // Simultaneous damage collection
        const dmgMap = new Map<number, number>();
        for (const s of state.soldiers) {
          if (s.dying > 0 || s.fightingWith === null || deadIds.has(s.id)) continue;
          s.frame++;
          if (s.frame % 32 === 0) dmgMap.set(s.fightingWith, (dmgMap.get(s.fightingWith) ?? 0) + 1);
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

        // Clear refs to dying opponents
        for (const s of state.soldiers) {
          if (s.fightingWith !== null) {
            const opp = state.soldiers.find(o => o.id === s.fightingWith);
            if (!opp || opp.dying > 0) s.fightingWith = null;
          }
        }
        state.soldiers = state.soldiers.filter(s => !deadIds.has(s.id));

        // Walk + tent hit + fight pairing
        const freshDead = new Set<number>();
        for (const s of state.soldiers) {
          if (s.fightingWith !== null || s.dying > 0) continue;
          s.x += WALK_SPEED * (s.side === 'player' ? 1 : -1);
          s.frame++;

          if (s.side === 'player' && s.x >= RIGHT_X - 28) {
            state.enemyHp  = Math.max(0, state.enemyHp - TENT_DMG);
            state.shakeRight = 22;
            burst(state.particles, RIGHT_X, GROUND_Y - 50, 16, ['#fbbf24','#f59e0b','#ef4444','#fff'], 3.5);
            freshDead.add(s.id);
            if (state.enemyHp <= 0) { state.winner = 'player'; cbRef.current?.('player'); }
            continue;
          }
          if (s.side === 'enemy' && s.x <= LEFT_X + 28) {
            state.playerHp = Math.max(0, state.playerHp - TENT_DMG);
            state.shakeLeft  = 22;
            burst(state.particles, LEFT_X, GROUND_Y - 50, 16, ['#fbbf24','#f59e0b','#3b82f6','#fff'], 3.5);
            freshDead.add(s.id);
            if (state.playerHp <= 0) { state.winner = 'enemy'; cbRef.current?.('enemy'); }
            continue;
          }

          for (const opp of state.soldiers) {
            if (opp.side === s.side || opp.fightingWith !== null || freshDead.has(opp.id) || opp.dying > 0) continue;
            if (Math.abs(s.x - opp.x) < FIGHT_RANGE) {
              s.fightingWith = opp.id; opp.fightingWith = s.id;
              s.frame = opp.frame = 0;
              break;
            }
          }
        }
        state.soldiers = state.soldiers.filter(s => !freshDead.has(s.id));

        // Particles
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

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, '#6bb8d4');
      sky.addColorStop(1, '#c8e8f8');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cw, CANVAS_H);

      // Stars (twinkle)
      for (const st of state.stars) {
        const a = 0.35 + 0.35 * Math.sin(tick * st.speed + st.phase);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.arc(st.x * cw, st.y * CANVAS_H, st.r, 0, Math.PI * 2); ctx.fill();
      }

      // Sun
      ctx.fillStyle = 'rgba(255,235,80,0.92)';
      ctx.beginPath(); ctx.arc(cw / 2, 26, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,235,80,0.28)';
      ctx.beginPath(); ctx.arc(cw / 2, 26, 24, 0, Math.PI * 2); ctx.fill();

      // Clouds
      const cloud = (cx: number, cy: number, s: number) => {
        ctx.fillStyle = 'rgba(255,255,255,0.84)';
        for (const [dx, dy, rs] of [[0,0,1],[s*.8,s*.28,.72],[-s*.7,s*.22,.68]] as [number,number,number][]) {
          ctx.beginPath(); ctx.arc(cx+dx, cy+dy, s*rs, 0, Math.PI*2); ctx.fill();
        }
      };
      cloud(cw * 0.20, 20, 17 + Math.sin(tick * 0.005) * 1.5);
      cloud(cw * 0.68, 16, 15 + Math.cos(tick * 0.006) * 1.5);
      cloud(cw * 0.44, 30, 12);

      // Ground
      const grassGrad = ctx.createLinearGradient(0, GROUND_Y - 6, 0, CANVAS_H);
      grassGrad.addColorStop(0, '#5db832');
      grassGrad.addColorStop(0.2, '#4aaa1e');
      grassGrad.addColorStop(1, '#3d8a18');
      ctx.fillStyle = grassGrad;
      ctx.fillRect(0, GROUND_Y - 6, cw, CANVAS_H - GROUND_Y + 6);
      ctx.fillStyle = 'rgba(120,220,60,0.4)';
      ctx.fillRect(0, GROUND_Y - 6, cw, 3);

      // Dirt lane
      const pathGrad = ctx.createLinearGradient(0, GROUND_Y - 10, 0, GROUND_Y + 4);
      pathGrad.addColorStop(0, '#c8a05a'); pathGrad.addColorStop(1, '#a07a38');
      ctx.fillStyle = pathGrad;
      const pL = LEFT_X + 32, pR = RIGHT_X - 32;
      ctx.fillRect(pL, GROUND_Y - 10, pR - pL, 10);
      ctx.fillStyle = 'rgba(255,220,130,0.3)';
      ctx.fillRect(pL, GROUND_Y - 10, pR - pL, 2);
      ctx.fillStyle = 'rgba(100,70,20,0.15)';
      for (let dx = pL + 14; dx < pR; dx += 24) {
        ctx.beginPath(); ctx.arc(dx, GROUND_Y - 5, 1.5, 0, Math.PI * 2); ctx.fill();
      }

      // ── Tents ───────────────────────────────────────────────────────────────
      const drawTent = (tx: number, side: 'player' | 'enemy', hp: number, shake: number) => {
        const ox   = shake > 0 ? Math.sin(tick * 0.5) * 5 : 0;
        const x    = tx + ox;
        const isP  = side === 'player';
        const bodyC  = isP ? '#2563eb' : '#dc2626';
        const darkC  = isP ? '#1e3a8a' : '#7f1d1d';
        const lightC = isP ? '#93c5fd' : '#fca5a5';
        const accentC = isP ? '#60a5fa' : '#f87171';

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.ellipse(x, GROUND_Y + 4, 36, 7, 0, 0, Math.PI * 2); ctx.fill();

        // Base platform
        const platG = ctx.createLinearGradient(x-34, 0, x+34, 0);
        platG.addColorStop(0, darkC); platG.addColorStop(0.5, bodyC); platG.addColorStop(1, lightC);
        ctx.fillStyle = platG;
        rr(ctx, x - 34, GROUND_Y - 9, 68, 13, 4); ctx.fill();
        ctx.strokeStyle = darkC; ctx.lineWidth = 1.5; ctx.stroke();

        // Tent body
        const tentG = ctx.createLinearGradient(x-30, 0, x+30, 0);
        tentG.addColorStop(0, darkC); tentG.addColorStop(0.4, bodyC); tentG.addColorStop(1, lightC);
        ctx.beginPath();
        ctx.moveTo(x - 30, GROUND_Y - 9);
        ctx.lineTo(x, GROUND_Y - 84);
        ctx.lineTo(x + 30, GROUND_Y - 9);
        ctx.closePath();
        ctx.fillStyle = tentG; ctx.fill();
        ctx.strokeStyle = darkC; ctx.lineWidth = 2; ctx.stroke();

        // Stripes
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
        for (let frac = 0.2; frac < 0.9; frac += 0.25) {
          const ly = GROUND_Y - 9 - (75 * frac), half = 30 * (1 - frac);
          ctx.beginPath(); ctx.moveTo(x - half, ly); ctx.lineTo(x + half, ly); ctx.stroke();
        }

        // Door
        ctx.fillStyle = darkC;
        ctx.beginPath();
        ctx.arc(x, GROUND_Y - 17, 12, Math.PI, 0);
        ctx.lineTo(x + 12, GROUND_Y - 7); ctx.lineTo(x - 12, GROUND_Y - 7);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,200,80,0.18)';
        ctx.beginPath();
        ctx.arc(x, GROUND_Y - 17, 8, Math.PI, 0);
        ctx.lineTo(x + 8, GROUND_Y - 9); ctx.lineTo(x - 8, GROUND_Y - 9);
        ctx.closePath(); ctx.fill();

        // Flag pole
        ctx.strokeStyle = '#8d7452'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, GROUND_Y - 84); ctx.lineTo(x, GROUND_Y - 104); ctx.stroke();

        // Flag
        const fw = Math.sin(tick * 0.07 + (isP ? 0 : Math.PI)) * 3;
        const fd = isP ? 1 : -1;
        ctx.fillStyle = accentC;
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y - 103);
        ctx.quadraticCurveTo(x + fd * 11, GROUND_Y - 96 + fw, x + fd * 19, GROUND_Y - 91 + fw * 0.5);
        ctx.quadraticCurveTo(x + fd * 11, GROUND_Y - 86 + fw, x, GROUND_Y - 83);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('★', x + fd * 10, GROUND_Y - 93 + fw * 0.5);

        // HP bar
        const barW = 72, barH = 11;
        const bx = x - barW / 2, by = GROUND_Y - 122;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        rr(ctx, bx - 1, by - 1, barW + 2, barH + 2, 5); ctx.fill();
        ctx.fillStyle = '#0f172a';
        rr(ctx, bx, by, barW, barH, 5); ctx.fill();
        const pct = Math.max(0, hp / TENT_MAX_HP);
        if (pct > 0) {
          const hpC = pct > 0.6 ? '#22c55e' : pct > 0.3 ? '#f59e0b' : '#ef4444';
          ctx.fillStyle = hpC; rr(ctx, bx, by, barW * pct, barH, 5); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.3)'; rr(ctx, bx, by, barW * pct, barH / 2, 5); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
        rr(ctx, bx, by, barW, barH, 5); ctx.stroke();
        ctx.font = 'bold 10px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
        ctx.fillText(`${hp} HP`, x, by - 2);
        ctx.shadowBlur = 0; ctx.textBaseline = 'alphabetic';
      };

      drawTent(LEFT_X,  'player', state.playerHp, state.shakeLeft);
      drawTent(RIGHT_X, 'enemy',  state.enemyHp,  state.shakeRight);

      // ── Soldiers ────────────────────────────────────────────────────────────

      /**
       * Draw one soldier using the Hamzah sprite sheet when loaded,
       * or fall back to procedural drawing.
       */
      const drawSoldier = (s: Soldier) => {
        const fighting = s.fightingWith !== null;
        const dying    = s.dying > 0;

        // Choose sprite sheet
        const sheet = fighting ? fightSprite.current : walkSprite.current;

        if (spritesReady.current && sheet) {
          // ── SPRITE DRAWING ───────────────────────────────────────────────
          const frameIndex = Math.floor(s.frame / ANIM_TICK) % TOTAL_FRAMES;
          const col = frameIndex % SHEET_COLS;
          const row = Math.floor(frameIndex / SHEET_COLS);
          const fw  = sheet.width  / SHEET_COLS;
          const fh  = sheet.height / SHEET_ROWS;

          // Foot-of-sprite should land at s.y
          const drawY = s.y - SPRITE_H * FOOT_RATIO;
          const drawX = s.x - SPRITE_W / 2;

          // Death flash
          ctx.globalAlpha = dying ? (s.dying % 3 === 0 ? 0.25 : 1) : 1;

          // Ground shadow
          ctx.fillStyle = 'rgba(0,0,0,0.20)';
          ctx.beginPath();
          ctx.ellipse(s.x, s.y + 2, SPRITE_W * 0.38, 4, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.save();

          if (s.side === 'player') {
            // Sprite faces right → player walks right → draw as-is
            ctx.drawImage(sheet, col * fw, row * fh, fw, fh, drawX, drawY, SPRITE_W, SPRITE_H);
          } else {
            // Sprite faces right → enemy walks left → flip horizontally
            ctx.translate(s.x + SPRITE_W / 2, drawY);
            ctx.scale(-1, 1);
            ctx.drawImage(sheet, col * fw, row * fh, fw, fh, -SPRITE_W / 2, 0, SPRITE_W, SPRITE_H);
          }

          ctx.restore();

          // HP pips when damaged
          if (s.hp < s.maxHp && !dying) {
            for (let i = 0; i < s.maxHp; i++) {
              ctx.fillStyle = i < s.hp ? '#22c55e' : '#ef4444';
              ctx.beginPath();
              ctx.arc(s.x - (s.maxHp - 1) * 5.5 + i * 11, s.y - SPRITE_H * FOOT_RATIO - 8, 4, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5; ctx.stroke();
            }
          }

          ctx.globalAlpha = 1;

        } else {
          // ── PROCEDURAL FALLBACK (before sprites load) ────────────────────
          const isP    = s.side === 'player';
          const bodyC  = isP ? '#2563eb' : '#dc2626';
          const darkC  = isP ? '#1e3a8a' : '#991b1b';
          const bob    = Math.sin(s.frame * 0.22) * 1.8;
          const baseY  = s.y + bob;
          ctx.globalAlpha = dying ? (s.dying % 3 === 0 ? 0.25 : 1) : 1;

          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, 8, 3, 0, 0, Math.PI * 2); ctx.fill();

          // Legs
          const legA = Math.sin(s.frame * 0.25) * (fighting ? 4 : 10);
          ctx.strokeStyle = darkC; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(s.x - 2, baseY - 14); ctx.lineTo(s.x - 5, baseY - legA); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s.x + 2, baseY - 14); ctx.lineTo(s.x + 5, baseY + legA); ctx.stroke();

          // Body
          ctx.fillStyle = bodyC;
          rr(ctx, s.x - 7, baseY - 32, 14, 18, 3); ctx.fill();
          ctx.strokeStyle = darkC; ctx.lineWidth = 1; ctx.stroke();

          // Head
          ctx.fillStyle = '#fcd34d';
          ctx.beginPath(); ctx.arc(s.x, baseY - 42, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = darkC;
          ctx.beginPath(); ctx.arc(s.x, baseY - 43, 9, Math.PI, 0); ctx.fill();

          ctx.globalAlpha = 1;
        }
      };

      [...state.soldiers].sort((a, b) => a.y - b.y).forEach(drawSoldier);

      // ── Particles ──────────────────────────────────────────────────────────
      for (const p of state.particles) {
        const a = p.life / p.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle   = p.color;
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
          const a = (wf - 0.5) * 2;
          const sc = 0.6 + 0.4 * a;
          ctx.save();
          ctx.translate(cw / 2, CANVAS_H / 2);
          ctx.scale(sc, sc);
          ctx.globalAlpha = a;

          ctx.fillStyle = isPlayerWin ? 'rgba(30,58,138,0.92)' : 'rgba(127,29,29,0.92)';
          rr(ctx, -115, -34, 230, 68, 14); ctx.fill();
          ctx.strokeStyle = isPlayerWin ? '#93c5fd' : '#fca5a5';
          ctx.lineWidth = 3; ctx.stroke();

          ctx.font = 'bold 25px system-ui,sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = isPlayerWin ? '#fde047' : '#f87171';
          ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10;
          ctx.fillText(isPlayerWin ? '🏆 You Win!' : '💀 Game Over', 0, -10);
          ctx.font = 'bold 14px system-ui,sans-serif';
          ctx.fillStyle = '#fff'; ctx.shadowBlur = 6;
          ctx.fillText(isPlayerWin ? 'Amazing job! 🌟' : 'Try again! 💪', 0, 15);
          ctx.shadowBlur = 0;
          ctx.restore();
          ctx.globalAlpha = 1;
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
        width: '100%',
        height: `${CANVAS_H}px`,
        display: 'block',
        borderRadius: 0,
        borderTop: '2px solid rgba(99,102,241,0.22)',
        borderBottom: '2px solid rgba(99,102,241,0.22)',
        boxShadow: '0 6px 28px rgba(0,0,0,0.14)',
      }}
    />
  );
});

TowerDefenseGame.displayName = 'TowerDefenseGame';
export default TowerDefenseGame;
