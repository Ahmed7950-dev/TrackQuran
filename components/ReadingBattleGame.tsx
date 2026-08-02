// ─────────────────────────────────────────────────────────────────────────────
// READING BATTLE — turn-based Quran reading challenge + top-down maze battle.
//
// Reuses the Letter Race foundations wholesale:
//  • createGameChannel (Supabase broadcast, host-authoritative, 25Hz snapshots,
//    guests own their movement and stream inputs)
//  • join UX: share link + QR + lobby roster; heartbeat reaper for departures
//  • virtual joystick — same sizes, travel maths and media queries
//  • the WebKit audio fix: Web Audio only, everything pre-decoded to
//    AudioBuffers before play, context unlocked on the Start gesture, cheap
//    BufferSource playback (overlapping shots are free)
//
// RESPECT RULE: Quran text appears ONLY in the reading phase, in a proper
// Quranic font, never altered and never mixed with battle visuals. The battle
// phase contains no Quran text. Eliminations are a cartoon "poof" — no gore.
//
// All balance/content lives in readingBattleConfig.ts (pure asset swap later).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createGameChannel } from '../services/p2pGameChannel';
import {
  READ_SECONDS, MAX_UPGRADES, BONUS_AMMO_PER_EXTRA, VERSE_SURAHS,
  RB_CHARACTERS, RB_SOUNDS, BALANCE, WALLS, CENTER_SQUARE, SPAWNS, MAX_PLAYERS,
  ARENA_BG_IMAGE, BLOCK_SPRITE, BLOCK_ASPECT, TILE, WALL_TILE_LIST,
  STORM_RINGS, STORM_PAD,
  RB_FIRE, RB_GUNS, RB_HEROES, gunStats,
} from './readingBattleConfig';

const ONLINE_SITE_URL = 'https://www.lisanquran.com';
const SNAPSHOT_MS = 40;   // host → all (25Hz)
const INPUT_MS    = 33;   // guest → host (~30Hz)
const HAFS: React.CSSProperties = { fontFamily: "'Hafs', 'Amiri', serif", direction: 'rtl' };

type Phase = 'lobby' | 'levels' | 'reading' | 'preBattle' | 'battle' | 'victory';

interface RBPlayer {
  gid: string; name: string; charKey: string;
  isTutor: boolean; fighting: boolean;
  level: number; upgrades: number; bonusAmmo: number;
  x: number; y: number; h: number;       // arena units / degrees
  hp: number; armor: number; ammo: number; grenades: number;
  alive: boolean; frozenUntil: number;   // 0 = not frozen
  kills: number; dmg: number;
  lastMeleeAt: number; lastFireAt: number;
  gun: number;   // index into RB_GUNS (lobby weapon choice)
  hero: number;  // index into RB_HEROES (lobby character choice)
}

interface Bullet {
  on: boolean; x: number; y: number; dx: number; dy: number; left: number; owner: string;
  vx: number; vy: number;   // visual offset (arena units): ground point → the gun muzzle at fire time
  spx: number; spy: number; // ground spawn point (visual decay reference)
  decay: number;            // ground distance over which the muzzle offset fades to 0 (≈ aim distance)
}
interface Nade   { on: boolean; x: number; y: number; sx: number; sy: number; tx: number; ty: number; t0: number; owner: string }
interface Fx     { on: boolean; kind: 'boom' | 'poof' | 'hit'; x: number; y: number; t0: number }

interface Snapshot {
  ph: Phase;
  players: Array<{ gid: string; nm: string; ck: string; tu: number; fi: number; lv: number; up: number; ba: number;
    x: number; y: number; h: number; hp: number; ar: number; am: number; gr: number; al: number; fz: number; k: number; d: number; wp: number; hr: number }>;
  rd: { tg: string; tEnd: number; seg: string; evT: string; evN: number; done: number };
  bt: { st: number; zn: number; bl: Array<[number, number, number]>; gn: Array<[number, number, number]> };
  wn: string;
  pz: number;   // 1 = battle paused (ESC) — everyone freezes together
  now: number;
}

/* ── geometry ─────────────────────────────────────────────────────────────── */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Push a circle out of every wall rect (simple axis resolve). */
function collideWalls(px: number, py: number, r: number): [number, number] {
  let x = px, y = py;
  for (const w of WALLS) {
    const cx = clamp(x, w.x, w.x + w.w);
    const cy = clamp(y, w.y, w.y + w.h);
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      y = cy + (dy / d) * r;
    } else {
      // centre inside the rect — eject through the nearest face
      const left = x - w.x, right = w.x + w.w - x, top = y - w.y, bot = w.y + w.h - y;
      const m = Math.min(left, right, top, bot);
      if (m === left) x = w.x - r; else if (m === right) x = w.x + w.w + r;
      else if (m === top) y = w.y - r; else y = w.y + w.h + r;
    }
  }
  return [clamp(x, 2.5, 97.5), clamp(y, 2.5, 97.5)];
}

/** Does the segment (x1,y1)→(x2,y2) cross any wall? (bullet blocking) */
function segmentHitsWall(x1: number, y1: number, x2: number, y2: number): boolean {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 1.2) || 1;
  for (let i = 1; i <= steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps;
    const y = y1 + ((y2 - y1) * i) / steps;
    for (const w of WALLS) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
    }
  }
  return false;
}

/** March along the segment, stop just before entering a wall — for aim lines. */
function clipSegmentAtWall(x1: number, y1: number, x2: number, y2: number): [number, number] {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 0.6) || 1;
  let lx = x1, ly = y1;
  for (let i = 1; i <= steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps;
    const y = y1 + ((y2 - y1) * i) / steps;
    for (const w of WALLS) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return [lx, ly];
    }
    lx = x; ly = y;
  }
  return [x2, y2];
}

/* ── the bat-cloud storm (Brawl-Stars poison) ─────────────────────────────
   Whole RINGS of tiles get clouded, one beat at a time: the outermost row
   of the map first, then the next one in. Everything is a pure function of
   bt.startedAt, so every client agrees with zero extra network traffic —
   guests just add their clock skew. */
const GRID_TILES = Math.round(100 / TILE);   // 25 × 25, same grid as the blocks

/** How many rings have landed (0 = the storm hasn't started). */
function stormRings(nowMs: number, startedAt: number): number {
  const since = nowMs - startedAt - BALANCE.storm.startMs;
  if (since < 0) return 0;
  return Math.min(STORM_RINGS, Math.floor(since / BALANCE.storm.stepMs) + 1);
}
/** A tile's ring: 0 = outermost row/column, negative beyond the arena edge. */
const tileRing = (tx: number, ty: number) =>
  Math.min(tx, GRID_TILES - 1 - tx, ty, GRID_TILES - 1 - ty);
/** Is this arena point still clear of cloud? */
const stormSafe = (x: number, y: number, rings: number) =>
  rings <= 0 || tileRing(Math.floor(x / TILE), Math.floor(y / TILE)) >= rings;

/* ── audio: pre-decoded buffers, synth placeholders (Letter Race fix) ─────── */
function synthBuffer(ac: AudioContext, key: string): AudioBuffer {
  const sr = ac.sampleRate;
  const mk = (secs: number, fill: (t: number, i: number) => number) => {
    const b = ac.createBuffer(1, Math.ceil(sr * secs), sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fill(i / sr, i);
    return b;
  };
  const env = (t: number, dur: number) => Math.max(0, 1 - t / dur);
  switch (key) {
    case 'countdown': return mk(0.14, t => Math.sin(2 * Math.PI * 880 * t) * env(t, 0.14) * 0.5);
    case 'correct':   return mk(0.35, t => (Math.sin(2 * Math.PI * (620 + 700 * t) * t)) * env(t, 0.35) * 0.5);
    case 'buzz':      return mk(0.4,  t => (Math.sin(2 * Math.PI * 130 * t) > 0 ? 1 : -1) * env(t, 0.4) * 0.3);
    case 'upgrade':   return mk(0.5,  t => (Math.sin(2 * Math.PI * 523 * t) + Math.sin(2 * Math.PI * 784 * t)) * env(t, 0.5) * 0.28);
    case 'shot':      return mk(0.09, (t, i) => (Math.random() * 2 - 1) * env(t, 0.07) * 0.5 + Math.sin(2 * Math.PI * 210 * t) * env(t, 0.05) * 0.4);
    case 'melee':     return mk(0.12, t => (Math.random() * 2 - 1) * env(t, 0.1) * 0.22);
    case 'boom':      return mk(0.6,  t => (Math.random() * 2 - 1) * env(t, 0.55) * 0.6 + Math.sin(2 * Math.PI * 70 * t) * env(t, 0.4) * 0.5);
    case 'poof':      return mk(0.3,  t => Math.sin(2 * Math.PI * (600 - 500 * t) * t) * env(t, 0.3) * 0.4);
    case 'win':       return mk(0.9,  t => (Math.sin(2 * Math.PI * 523 * t) + Math.sin(2 * Math.PI * 659 * t) + Math.sin(2 * Math.PI * 784 * t)) * env(t, 0.9) * 0.22);
    default:          return mk(0.1,  t => Math.sin(2 * Math.PI * 440 * t) * env(t, 0.1) * 0.3);
  }
}

/* ── verse pool (fetched from the app's existing Uthmani source) ──────────── */
async function fetchVersePool(): Promise<string[]> {
  const words: string[] = [];
  for (const surah of VERSE_SURAHS) {
    try {
      const res = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surah}`);
      const json = await res.json();
      for (const v of json.verses ?? []) {
        const t = (v.text_uthmani ?? '').trim();
        if (t) words.push(...t.split(/\s+/));
      }
    } catch { /* skip an unreachable surah; the pool just gets shorter */ }
  }
  return words;
}

// ── The hero character (Mixamo soldier) — live 3D on DOM screens.
//    'stretch' = Arm Stretching loop (reading challenge), 'shoot' = rifle pose.
const RBHero: React.FC<{ clip?: string; className?: string; url?: string }> = ({ clip = 'stretch', className, url = HERO_GLB }) => {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    let stage: { dispose(): void } | null = null;
    let dead = false;
    (async () => {
      try {
        const { PortraitStage } = await import('./letterRaceStage');
        if (dead || !ref.current) return;
        const st = new PortraitStage(ref.current, url, false, 1, clip, 0, 0.6);
        stage = st;
        await st.init();
      } catch { /* hero is decorative — never block the game on it */ }
    })();
    return () => { dead = true; stage?.dispose(); };
  }, [clip, url]);
  return <canvas ref={ref} className={className} />;
};

// The Mixamo soldier. Clips: 'stretch' (reading page), 'run' (Shoot Rifle
// cycle) + 'idle' (held aim pose) for the RunnerStage battle overlay.
// Rest pose faces +Z like the Tripo rigs — no yaw offset anywhere.
const HERO_GLB = '/rb/hero.glb?v=4';
// per-fighter hue-rotate tints so identical soldiers stay tellable apart
// (index 0 keeps the original camo)
const HERO_HUES = [0, 160, 280, 60, 210, 320, 110, 250];
// The Tripo tech-gun, parented to the soldier's right hand. Transform tuned
// live via window.__rbGun in DEV, then baked here; muzzle = local offset the
// aim line starts from.
// Gun attachments live per-hero in RB_HEROES + RB_FIRE in readingBattleConfig.ts (tuned on /gun-tune)

const UPGRADE_META = [
  { icon: '🔪', label: 'Knife' },
  { icon: '🦺', label: 'Armor' },
  { icon: '🔫', label: 'AK-47' },
  { icon: '➕', label: '+30 ammo' },
  { icon: '💣', label: 'Grenades ×3' },
];

const charOf = (key: string) => RB_CHARACTERS.find(c => c.key === key) ?? RB_CHARACTERS[0];

function newPlayer(gid: string, name: string, charKey: string, isTutor: boolean, fighting: boolean, gun = 0, hero = 0): RBPlayer {
  return {
    gid, name, charKey, isTutor, fighting, gun, hero,
    level: 3, upgrades: 0, bonusAmmo: 0,
    x: 50, y: 50, h: 0,
    hp: BALANCE.health, armor: 0, ammo: 0, grenades: 0,
    alive: true, frozenUntil: 0, kills: 0, dmg: 0,
    lastMeleeAt: 0, lastFireAt: 0,
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
interface Props {
  roomId?: string;          // present → guest joining via link
  onExit: () => void;
}

const ReadingBattleGame: React.FC<Props> = ({ roomId, onExit }) => {
  const isGuest = !!roomId;
  const gidRef = useRef<string>(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `g${Math.random()}`);
  const myGid = isGuest ? gidRef.current : 'host';

  const [phase, setPhase] = useState<Phase>('lobby');
  const phaseRef = useRef<Phase>('lobby');
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const [, setTick] = useState(0);
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(roomId ?? null);
  const [myName, setMyName] = useState('');
  const [tutorPlays, setTutorPlays] = useState(false);
  const [myGun, setMyGun] = useState(0);
  const myGunRef = useRef(0);
  const [myHero, setMyHero] = useState(0);
  const myHeroRef = useRef(0);
  const [joined, setJoined] = useState(false);        // guest pressed Join
  const [gotSnap, setGotSnap] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [spectateIdx, setSpectateIdx] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const pauseStartRef = useRef(0);
  const [isFs, setIsFs] = useState(false);

  const shareLink = onlineRoomId ? `${ONLINE_SITE_URL}/reading-battle/${onlineRoomId}` : '';

  // ── world (mutable, read by loops) ────────────────────────────────────────
  const world = useRef({
    players: [] as RBPlayer[],
    rd: { turnGid: '', tEnd: 0, seg: '', evT: '', evN: 0, done: 0, ptr: 0 },
    bt: { startedAt: 0, zoneOn: false },
    winner: '',
  });
  const bulletsRef = useRef<Bullet[]>(Array.from({ length: 48 }, () => ({ on: false, x: 0, y: 0, dx: 0, dy: 0, left: 0, owner: '', vx: 0, vy: 0, spx: 0, spy: 0, decay: 14 })));
  const nadesRef   = useRef<Nade[]>(Array.from({ length: 12 }, () => ({ on: false, x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, t0: 0, owner: '' })));
  const fxRef      = useRef<Fx[]>(Array.from({ length: 24 }, () => ({ on: false, kind: 'hit', x: 0, y: 0, t0: 0 })));
  const wordsRef   = useRef<string[]>([]);
  const evSeenRef  = useRef(0);

  // host-side per-guest bookkeeping
  const guestSeenRef   = useRef<Map<string, number>>(new Map());
  const guestActsRef   = useRef<Map<string, { atk: number; fire: number; nade: number }>>(new Map());
  const channelRef     = useRef<ReturnType<typeof createGameChannel> | null>(null);
  const hostSnapRef    = useRef<Snapshot | null>(null);
  const rejoinAtRef    = useRef(0);
  const clockSkewRef   = useRef(0); // hostNow - localNow (guests render timers with this)

  const me = () => world.current.players.find(p => p.gid === myGid);
  // DEV-only inspection hook for the browser test harness.
  useEffect(() => {
    if ((import.meta as any).env?.DEV) { (window as any).__rbWorld = world; (window as any).__rbPhase = () => phaseRef.current; }
  }, []);

  /* ── audio (pre-decoded, Letter Race pattern) ───────────────────────────── */
  const acRef = useRef<AudioContext | null>(null);
  const sfxRef = useRef<Record<string, AudioBuffer>>({});
  const ensureAc = useCallback((): AudioContext => (
    acRef.current ?? (acRef.current = new (window.AudioContext || (window as any).webkitAudioContext)())
  ), []);
  useEffect(() => {
    let live = true;
    const ac = ensureAc();
    (async () => {
      for (const [key, url] of Object.entries(RB_SOUNDS)) {
        try {
          if (url) {
            const buf = await fetch(url).then(r => (r.ok ? r.arrayBuffer() : Promise.reject()));
            const b = await ac.decodeAudioData(buf);
            if (live) sfxRef.current[key] = b;
          } else {
            sfxRef.current[key] = synthBuffer(ac, key);
          }
        } catch { sfxRef.current[key] = synthBuffer(ac, key); }
      }
      if (live) setAssetsReady(true);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const playSfx = useCallback((key: string, vol = 0.9) => {
    try {
      const b = sfxRef.current[key];
      if (!b) return;
      const ac = ensureAc();
      ac.resume?.();
      const src = ac.createBufferSource();
      const g = ac.createGain();
      g.gain.value = vol;
      src.buffer = b; src.connect(g); g.connect(ac.destination);
      src.start();
    } catch { /* audio unavailable */ }
  }, [ensureAc]);

  /* ── verse pool (host only) ─────────────────────────────────────────────── */
  useEffect(() => {
    if (isGuest) return;
    fetchVersePool().then(w => { wordsRef.current = w; setTick(t => t + 1); });
  }, [isGuest]);

  /* ── host: create room + channel ────────────────────────────────────────── */
  useEffect(() => {
    if (isGuest) return;
    const id = onlineRoomId ?? crypto.randomUUID();
    if (!onlineRoomId) { setOnlineRoomId(id); return; }
    const ch = createGameChannel(`reading-battle:${id}`, 'host');
    world.current.players = [newPlayer('host', 'Tutor', RB_CHARACTERS[0].key, true, false)];

    ch.on('broadcast', { event: 'hello' }, ({ payload }: { payload: { gid: string; name: string; charKey: string; gun?: number; hero?: number } }) => {
      const g = world.current;
      const gid = String(payload.gid || '');
      if (!gid) return;
      guestSeenRef.current.set(gid, performance.now());
      let pl = g.players.find(q => q.gid === gid);
      if (!pl) {
        if (phaseRef.current !== 'lobby' && phaseRef.current !== 'levels') return; // no mid-game joins
        const fighters = g.players.filter(q => q.fighting || !q.isTutor).length;
        if (fighters >= MAX_PLAYERS) return;
        // non-empty name, auto-suffix duplicates: "Ahmed (2)"
        let nm = (payload.name || 'Player').slice(0, 14).trim() || 'Player';
        const clash = (n: string) => g.players.some(q => q.gid !== gid && q.name === n);
        if (clash(nm)) { let i = 2; while (clash(`${nm} (${i})`)) i++; nm = `${nm} (${i})`; }
        // identity colour by join order — the animal picker is gone
        pl = newPlayer(gid, nm, RB_CHARACTERS[g.players.length % RB_CHARACTERS.length].key, false, true);
        g.players.push(pl);
      }
      if (typeof payload.gun === 'number') pl.gun = ((payload.gun | 0) % RB_GUNS.length + RB_GUNS.length) % RB_GUNS.length;
      if (typeof payload.hero === 'number') pl.hero = ((payload.hero | 0) % RB_HEROES.length + RB_HEROES.length) % RB_HEROES.length;
      setTick(t => t + 1);
    });

    ch.on('broadcast', { event: 'input' }, ({ payload }: { payload: any }) => {
      if (!payload?.gid) return;
      guestSeenRef.current.set(payload.gid, performance.now());
      const pl = world.current.players.find(q => q.gid === payload.gid);
      if (!pl) return;
      if (pl.frozenUntil) pl.frozenUntil = 0; // reconnected
      if (pl.alive && phaseRef.current === 'battle' && !pausedRef.current) {
        // guests own their movement (Letter Race model); host clamps + resolves walls
        const [x, y] = collideWalls(clamp(payload.x, 0, 100), clamp(payload.y, 0, 100), BALANCE.playerRadius);
        pl.x = x; pl.y = y; pl.h = payload.h ?? pl.h;
        const prev = guestActsRef.current.get(payload.gid) ?? { atk: 0, fire: 0, nade: 0 };
        const nxt = { atk: payload.atkN ?? 0, fire: payload.fireN ?? 0, nade: payload.nadeN ?? 0 };
        for (let i = prev.atk; i < nxt.atk; i++) hostMelee(pl);
        for (let i = prev.fire; i < nxt.fire; i++) hostFire(pl);
        for (let i = prev.nade; i < nxt.nade; i++) hostNade(pl, typeof payload.nx === 'number' ? payload.nx : undefined, typeof payload.ny === 'number' ? payload.ny : undefined);
        guestActsRef.current.set(payload.gid, nxt);
      } else {
        guestActsRef.current.set(payload.gid, { atk: payload.atkN ?? 0, fire: payload.fireN ?? 0, nade: payload.nadeN ?? 0 });
      }
    });

    ch.on('broadcast', { event: 'leave' }, ({ payload }: { payload: { gid: string } }) => {
      if (payload?.gid) removeGuest(String(payload.gid));
    });

    // any player's ESC pauses the battle for everyone
    ch.on('broadcast', { event: 'pause' }, () => hostTogglePause());

    const reaper = window.setInterval(() => {
      const now = performance.now();
      for (const pl of [...world.current.players]) {
        if (pl.gid === 'host') continue;
        const seen = guestSeenRef.current.get(pl.gid);
        if (seen === undefined) { guestSeenRef.current.set(pl.gid, now); continue; }
        if (now - seen <= 6000) continue;
        if (phaseRef.current === 'battle' && pl.alive) {
          // spec §7.7: freeze 10s (killable), then eliminate
          if (!pl.frozenUntil) pl.frozenUntil = now + BALANCE.frozenGraceMs;
          else if (now >= pl.frozenUntil) hostEliminate(pl, null);
        } else {
          removeGuest(pl.gid);
        }
      }
    }, 1000);

    ch.subscribe();
    channelRef.current = ch;
    return () => { window.clearInterval(reaper); ch.unsubscribe(); channelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, onlineRoomId]);

  const removeGuest = (gid: string) => {
    const g = world.current;
    const idx = g.players.findIndex(q => q.gid === gid);
    if (idx <= 0) return;
    g.players.splice(idx, 1);
    guestSeenRef.current.delete(gid);
    guestActsRef.current.delete(gid);
    if (g.rd.turnGid === gid && phaseRef.current === 'reading') hostNextReader();
    if (phaseRef.current === 'battle') hostCheckWin();
    setTick(t => t + 1);
  };

  /* ── host: snapshots ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (isGuest || !onlineRoomId) return;
    const iv = window.setInterval(() => {
      const ch = channelRef.current;
      if (!ch) return;
      const g = world.current;
      // Phase timers ALSO advance here: rAF suspends when the tutor's tab is
      // backgrounded, but intervals keep ticking, so the game never stalls if
      // the tutor briefly switches apps.
      if (phaseRef.current === 'reading' && Date.now() >= g.rd.tEnd) hostNextReader();
      if (phaseRef.current === 'preBattle' && Date.now() >= g.bt.startedAt) setPhase('battle');
      const snap: Snapshot = {
        ph: phaseRef.current,
        players: g.players.map(p => ({
          gid: p.gid, nm: p.name, ck: p.charKey, tu: p.isTutor ? 1 : 0, fi: p.fighting ? 1 : 0,
          lv: p.level, up: p.upgrades, ba: p.bonusAmmo,
          x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, h: Math.round(p.h),
          hp: Math.round(p.hp), ar: Math.round(p.armor), am: p.ammo, gr: p.grenades,
          al: p.alive ? 1 : 0, fz: p.frozenUntil ? Math.max(0, Math.round(p.frozenUntil - performance.now())) : 0,
          k: p.kills, d: Math.round(p.dmg), wp: p.gun, hr: p.hero,
        })),
        rd: { tg: g.rd.turnGid, tEnd: g.rd.tEnd, seg: g.rd.seg, evT: g.rd.evT, evN: g.rd.evN, done: g.rd.done },
        bt: {
          st: g.bt.startedAt, zn: g.bt.zoneOn ? 1 : 0,
          bl: bulletsRef.current.filter(b => b.on).map(b => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.max(0, g.players.findIndex(q => q.gid === b.owner))] as [number, number, number]),
          gn: nadesRef.current.filter(n => n.on).map(n => [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10, nadeHeight(n)] as [number, number, number]),
        },
        wn: g.winner,
        pz: pausedRef.current ? 1 : 0,
        now: Date.now(),
      };
      ch.streamSend('state', snap);
    }, SNAPSHOT_MS);
    return () => window.clearInterval(iv);
  }, [isGuest, onlineRoomId]);

  /* ── guest: join + apply snapshots ──────────────────────────────────────── */
  useEffect(() => {
    if (!isGuest || !roomId || !joined) return;
    const ch = createGameChannel(`reading-battle:${roomId}`, 'guest');
    ch.on('broadcast', { event: 'state' }, ({ payload: s }: { payload: Snapshot }) => {
      hostSnapRef.current = s;
      clockSkewRef.current = s.now - Date.now();
      setGotSnap(true);
      const g = world.current;
      const now = performance.now();
      // roster merge, keeping OUR simulated body
      const changed = s.players.length !== g.players.length || s.players.some((sp, i) => g.players[i]?.gid !== sp.gid);
      if (changed) {
        const old = new Map(g.players.map(q => [q.gid, q]));
        g.players = s.players.map(sp => old.get(sp.gid) ?? newPlayer(sp.gid, sp.nm, sp.ck, !!sp.tu, !!sp.fi));
      }
      s.players.forEach((sp, i) => {
        const p = g.players[i];
        p.name = sp.nm; p.charKey = sp.ck; p.isTutor = !!sp.tu; p.fighting = !!sp.fi;
        p.gun = sp.wp ?? 0;
        p.hero = sp.hr ?? 0;
        p.level = sp.lv; p.upgrades = sp.up; p.bonusAmmo = sp.ba;
        // a real hit knocks ≥5 hp+armor between snapshots (zone drain is ~0.1)
        const dmgTaken = (p.hp - sp.hp) + (p.armor - sp.ar);
        if (s.ph === 'battle' && dmgTaken >= 5) playSfx('wounded', sp.gid === myGid ? 0.9 : 0.5);
        p.hp = sp.hp; p.armor = sp.ar; p.ammo = sp.am; p.grenades = sp.gr;
        const wasAlive = p.alive;
        p.alive = !!sp.al; p.frozenUntil = sp.fz ? now + sp.fz : 0;
        p.kills = sp.k; p.dmg = sp.d;
        if (p.gid === myGid) {
          if (s.ph !== 'battle' || !p.alive) { p.x = sp.x; p.y = sp.y; p.h = sp.h; }
          // else: we own our position (prediction)
        } else {
          // simple interpolation toward the snapshot
          p.x += (sp.x - p.x) * 0.5; p.y += (sp.y - p.y) * 0.5; p.h = sp.h;
        }
        if (wasAlive && !p.alive) { spawnFx('poof', p.x, p.y); playSfx('poof'); }
      });
      // reading events (correct / buzz) — play once per counter bump
      if (s.rd.evN !== evSeenRef.current) {
        evSeenRef.current = s.rd.evN;
        if (s.rd.evT === 'correct') playSfx('correct');
        if (s.rd.evT === 'upgrade') { playSfx('upgrade'); }
        if (s.rd.evT === 'buzz') playSfx('buzz', 1);
      }
      world.current.rd = { ...world.current.rd, turnGid: s.rd.tg, tEnd: s.rd.tEnd, seg: s.rd.seg, evT: s.rd.evT, evN: s.rd.evN, done: s.rd.done };
      world.current.bt.startedAt = s.bt.st; world.current.bt.zoneOn = !!s.bt.zn;
      world.current.winner = s.wn;
      if (!!s.pz !== pausedRef.current) { pausedRef.current = !!s.pz; setPaused(!!s.pz); }
      // mirror projectiles for rendering
      const bl = bulletsRef.current;
      const prevBl = bl.map(b => ({ on: b.on, x: b.x, y: b.y }));
      bl.forEach(b => { b.on = false; });
      s.bt.bl.slice(0, bl.length).forEach(([x, y, oi], i) => {
        const b = bl[i];
        b.on = true;
        // direction from consecutive snapshots → smooth local flight below
        if (prevBl[i].on) {
          const ddx = x - prevBl[i].x, ddy = y - prevBl[i].y;
          const d = Math.hypot(ddx, ddy);
          if (d > 0.01 && d < 20) { b.dx = ddx / d; b.dy = ddy / d; }
        } else {
          b.dx = 0; b.dy = 0;
          // fresh bullet: anchor its visual to the shooter's muzzle
          const ownerGid = g.players[oi]?.gid ?? '';
          [b.vx, b.vy] = muzzleVisOffset(ownerGid, x, y);
          b.spx = x; b.spy = y;
          b.decay = ownerGid === myGid ? aimDistance() : 14;
          // opponents' gunfire (own shots already play locally in doShoot)
          if (ownerGid !== myGid) playSfx('shot', 0.35);
        }
        b.x = x; b.y = y;
      });
      const gn = nadesRef.current;
      const prevGn = gn.map(n => ({ on: n.on, x: n.x, y: n.y }));
      gn.forEach(n => { n.on = false; });
      s.bt.gn.slice(0, gn.length).forEach(([x, y], i) => { gn[i].on = true; gn[i].x = x; gn[i].y = y; });
      // a grenade slot that vanished mid-battle = it exploded — guests get
      // the boom + blast ring too (they only mirror positions otherwise)
      if (s.ph === 'battle') {
        prevGn.forEach((pg, i) => {
          if (pg.on && !gn[i].on) { spawnFx('boom', pg.x, pg.y); playSfx('boom', 0.9); }
        });
      }
      if (s.ph !== phaseRef.current) {
        if (s.ph === 'battle') playSfx('countdown');
        if (s.ph === 'victory') playSfx('win');
        setPhase(s.ph);
      }
      // auto-rejoin if the reaper dropped us while our phone slept
      if (!g.players.some(p => p.gid === myGid) && performance.now() - rejoinAtRef.current > 2500) {
        rejoinAtRef.current = performance.now();
        ch.send({ type: 'broadcast', event: 'hello', payload: { gid: myGid, name: myName || 'Player', charKey: RB_CHARACTERS[0].key, gun: myGunRef.current, hero: myHeroRef.current } });
      }
      setTick(t => t + 1);
    });
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        const hello = () => ch.send({ type: 'broadcast', event: 'hello', payload: { gid: myGid, name: myName || 'Player', charKey: RB_CHARACTERS[0].key, gun: myGunRef.current, hero: myHeroRef.current } });
        hello();
        const iv = window.setInterval(() => { if (hostSnapRef.current) window.clearInterval(iv); else hello(); }, 2000);
      }
    });
    channelRef.current = ch;
    const sayLeave = () => { try { ch.send({ type: 'broadcast', event: 'leave', payload: { gid: myGid } }); } catch { /* gone */ } };
    window.addEventListener('pagehide', sayLeave);
    return () => { window.removeEventListener('pagehide', sayLeave); sayLeave(); ch.unsubscribe(); channelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, roomId, joined]);

  /* ── guest: stream inputs (movement + action counters) ──────────────────── */
  const actsRef = useRef({ atk: 0, fire: 0, nade: 0 });
  useEffect(() => {
    if (!isGuest || !joined) return;
    const iv = window.setInterval(() => {
      const ch = channelRef.current;
      const p = me();
      if (!ch || !p) return;
      ch.streamSend('input', {
        gid: myGid, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, h: Math.round(p.h),
        atkN: actsRef.current.atk, fireN: actsRef.current.fire, nadeN: actsRef.current.nade,
        nx: Math.round(nadeAtRef.current.x * 10) / 10, ny: Math.round(nadeAtRef.current.y * 10) / 10,
      });
    }, INPUT_MS);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, joined]);

  /* ── host combat helpers ────────────────────────────────────────────────── */
  const spawnFx = (kind: Fx['kind'], x: number, y: number) => {
    const f = fxRef.current.find(f => !f.on) ?? fxRef.current[0];
    f.on = true; f.kind = kind; f.x = x; f.y = y; f.t0 = performance.now();
  };
  const nadeHeight = (n: Nade) => {
    const t = clamp((performance.now() - n.t0) / BALANCE.grenade.flightMs, 0, 1);
    return Math.sin(t * Math.PI) * 6;
  };

  const applyDamage = (victim: RBPlayer, dmg: number, attacker: RBPlayer | null) => {
    if (!victim.alive) return;
    const a = Math.min(victim.armor, dmg);
    victim.armor -= a;
    victim.hp -= (dmg - a);
    if (attacker) attacker.dmg += dmg;
    spawnFx('hit', victim.x, victim.y);
    playSfx('wounded', victim.gid === myGid ? 0.9 : 0.55);
    if (victim.hp <= 0) hostEliminate(victim, attacker);
  };
  const hostEliminate = (victim: RBPlayer, attacker: RBPlayer | null) => {
    victim.alive = false; victim.hp = 0; victim.frozenUntil = 0;
    if (attacker && attacker.gid !== victim.gid) attacker.kills++;
    spawnFx('poof', victim.x, victim.y);
    playSfx('poof');
    hostCheckWin();
  };
  const hostCheckWin = () => {
    if (phaseRef.current !== 'battle') return;
    const alive = world.current.players.filter(p => p.fighting && p.alive);
    if (alive.length <= 1) {
      world.current.winner = alive[0]?.gid ?? '';
      setPhase('victory');
      playSfx('win');
    }
  };
  const hostMelee = (pl: RBPlayer) => {
    if (!pl.alive || phaseRef.current !== 'battle') return;
    const now = performance.now();
    const kn = pl.upgrades >= 1;
    const spec = kn ? BALANCE.knife : BALANCE.fists;
    if (now - pl.lastMeleeAt < spec.cooldownMs) return;
    pl.lastMeleeAt = now;
    playSfx('melee', 0.5);
    const rad = (pl.h * Math.PI) / 180;
    const fx = Math.sin(rad), fy = -Math.cos(rad);
    for (const q of world.current.players) {
      if (q === pl || !q.alive || !q.fighting) continue;
      const dx = q.x - pl.x, dy = q.y - pl.y;
      const d = Math.hypot(dx, dy);
      if (d > spec.range + BALANCE.playerRadius) continue;
      const dot = d > 0.01 ? (dx * fx + dy * fy) / d : 1;
      if (dot < 0.25) continue; // roughly a forward cone
      if (segmentHitsWall(pl.x, pl.y, q.x, q.y)) continue; // no punching through walls
      applyDamage(q, spec.damage, pl);
    }
  };
  /** Screen offset (arena units) from a ground point to a player's LIVE gun
   *  muzzle, as the 3D stage projects it — bullets and the aim line anchor to
   *  this so fire visually leaves the barrel at every facing. Falls back to a
   *  plain height lift while the model is still loading. */
  const muzzleVisOffset = (gid: string, gx: number, gy: number): [number, number] => {
    const idx = stageFightersRef.current.indexOf(gid);
    const m = idx >= 0 ? stageObjRef.current?.getMuzzle?.(idx) : null;
    if (!m) return [0, -RB_FIRE.lift];
    const v = viewRef.current;
    return [
      (m.x * v.dpr - (v.ox + gx * v.scale)) / v.scale,
      (m.y * v.dpr - (v.oy + gy * v.scale)) / v.scale,
    ];
  };

  const hostFire = (pl: RBPlayer, aimDist = 14) => {
    if (!pl.alive || phaseRef.current !== 'battle') return;
    if (pl.upgrades < 3 || pl.ammo <= 0) return;
    const gs = gunStats(pl.gun);
    const now = performance.now();
    if (now - pl.lastFireAt < gs.fireRateMs) return;
    pl.lastFireAt = now;
    pl.ammo--;
    playSfx('shot', 0.55);
    const b = bulletsRef.current.find(b => !b.on) ?? bulletsRef.current[0];
    const rad = (pl.h * Math.PI) / 180;
    // per-gun focus: the muzzle stays put, the bullet's PATH scatters
    // (triangular distribution — most shots near the aim, tails rare)
    const dir = rad + (Math.random() + Math.random() - 1) * gs.spread;
    b.on = true; b.owner = pl.gid;
    // spawn at the fire origin: forward along the aim + toward the gun hand
    b.x = pl.x + Math.sin(rad) * RB_FIRE.forward + Math.cos(rad) * RB_FIRE.side;
    b.y = pl.y - Math.cos(rad) * RB_FIRE.forward + Math.sin(rad) * RB_FIRE.side;
    b.dx = Math.sin(dir); b.dy = -Math.cos(dir);
    [b.vx, b.vy] = muzzleVisOffset(pl.gid, b.x, b.y);
    b.spx = b.x; b.spy = b.y; b.decay = Math.max(2, aimDist);
    b.left = gs.range;
  };
  const hostNade = (pl: RBPlayer, tx?: number, ty?: number) => {
    if (!pl.alive || phaseRef.current !== 'battle') return;
    if (pl.grenades <= 0) return;
    pl.grenades--;
    const n = nadesRef.current.find(n => !n.on) ?? nadesRef.current[0];
    n.on = true; n.owner = pl.gid; n.t0 = performance.now();
    n.sx = pl.x; n.sy = pl.y;
    // aimed throw (mouse / drag circle) capped at throwDist; heading throw otherwise
    let dx: number, dy: number;
    if (typeof tx === 'number' && typeof ty === 'number') {
      dx = tx - pl.x; dy = ty - pl.y;
      const d = Math.hypot(dx, dy);
      if (d > BALANCE.grenade.throwDist) { dx *= BALANCE.grenade.throwDist / d; dy *= BALANCE.grenade.throwDist / d; }
    } else {
      const rad = (pl.h * Math.PI) / 180;
      dx = Math.sin(rad) * BALANCE.grenade.throwDist;
      dy = -Math.cos(rad) * BALANCE.grenade.throwDist;
    }
    n.tx = clamp(pl.x + dx, 3, 97);
    n.ty = clamp(pl.y + dy, 3, 97);
    n.x = n.sx; n.y = n.sy;
  };

  /* ── host: referee actions ──────────────────────────────────────────────── */
  const readingOrder = () => world.current.players.filter(p => !p.isTutor).map(p => p.gid);
  const hostBeginReading = () => {
    const g = world.current;
    const order = readingOrder();
    if (order.length === 0) { hostStartBattle(); return; }
    g.rd.done = 0; g.rd.ptr = 0;
    g.rd.turnGid = order[0];
    hostDealSegment();
    g.rd.tEnd = Date.now() + READ_SECONDS * 1000 + 3400; // 3-2-1 + the reading turn
    setPhase('reading');
  };
  const hostDealSegment = () => {
    const g = world.current;
    const reader = g.players.find(p => p.gid === g.rd.turnGid);
    const n = clamp(reader?.level ?? 3, 1, 5);
    const words = wordsRef.current;
    if (!words.length) { g.rd.seg = '…'; return; }
    const seg: string[] = [];
    for (let i = 0; i < n; i++) seg.push(words[(g.rd.ptr + i) % words.length]);
    g.rd.ptr = (g.rd.ptr + n) % words.length;
    g.rd.seg = seg.join(' ');
  };
  const hostCorrect = () => {
    const g = world.current;
    const reader = g.players.find(p => p.gid === g.rd.turnGid);
    if (!reader) return;
    if (reader.upgrades < MAX_UPGRADES) {
      reader.upgrades++;
      g.rd.evT = 'upgrade';
    } else if (reader.upgrades >= 3) {
      reader.bonusAmmo += BONUS_AMMO_PER_EXTRA;
      g.rd.evT = 'correct';
    } else {
      g.rd.evT = 'correct';
    }
    g.rd.evN++;
    playSfx(g.rd.evT === 'upgrade' ? 'upgrade' : 'correct');
    hostDealSegment();
    setTick(t => t + 1);
  };
  const hostBuzz = () => {
    const g = world.current;
    g.rd.evT = 'buzz'; g.rd.evN++;
    playSfx('buzz', 1);
    setTick(t => t + 1);
  };
  const hostNextReader = () => {
    const g = world.current;
    const order = readingOrder();
    const idx = order.indexOf(g.rd.turnGid);
    g.rd.done++;
    if (idx < 0 || idx + 1 >= order.length) { hostStartBattle(); return; }
    g.rd.turnGid = order[idx + 1];
    hostDealSegment();
    g.rd.tEnd = Date.now() + READ_SECONDS * 1000 + 3400;
    setTick(t => t + 1);
  };
  const hostStartBattle = () => {
    const g = world.current;
    const fighters = g.players.filter(p => p.fighting);
    const spawns = [...SPAWNS].sort(() => Math.random() - 0.5);
    fighters.forEach((p, i) => {
      // tutor-as-player: level converts directly to the loadout tier (§7.3)
      const up = p.isTutor ? clamp(p.level, 1, 5) : p.upgrades;
      p.upgrades = up;
      p.hp = BALANCE.health;
      p.armor = up >= 2 ? BALANCE.armor : 0;
      p.ammo = (up >= 3 ? BALANCE.ak.magazine : 0) + (up >= 4 ? BALANCE.ak.extraAmmo : 0) + p.bonusAmmo;
      p.grenades = up >= 5 ? BALANCE.grenade.count : 0;
      p.alive = true; p.kills = 0; p.dmg = 0; p.frozenUntil = 0;
      const s = spawns[i % spawns.length];
      p.x = s.x; p.y = s.y; p.h = 180;
    });
    // referee-only tutor: not on the field
    g.players.forEach(p => { if (!p.fighting) p.alive = false; });
    g.bt.startedAt = Date.now() + BALANCE.battleCountdownMs;
    g.bt.zoneOn = false;
    g.winner = '';
    pausedRef.current = false; setPaused(false);
    bulletsRef.current.forEach(b => { b.on = false; });
    nadesRef.current.forEach(n => { n.on = false; });
    setPhase('preBattle');
    playSfx('countdown');
  };
  /** Tutor shortcut: no reading round — everyone battles with FULL gear. */
  const hostSkipToBattle = () => {
    world.current.players.forEach(p => { p.upgrades = MAX_UPGRADES; p.level = 5; });
    hostStartBattle();
  };
  const hostPlayAgain = () => {
    const g = world.current;
    g.players.forEach(p => {
      p.upgrades = 0; p.bonusAmmo = 0; p.hp = BALANCE.health; p.armor = 0;
      p.ammo = 0; p.grenades = 0; p.alive = true; p.kills = 0; p.dmg = 0;
    });
    g.winner = '';
    setPhase('lobby');
  };

  /* ── simulation + render loop ───────────────────────────────────────────── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPaintRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const touchJoyRef = useRef({ active: false, dx: 0, dy: 0, mag: 0 });
  const joyBaseRef = useRef<HTMLDivElement>(null);
  const joyKnobRef = useRef<HTMLDivElement>(null);
  // aim: mouse (desktop) / right stick (mobile) — h is the AIM direction now
  const mouseRef = useRef({ inside: false, cx: 0, cy: 0 });
  const lmbRef = useRef(false);
  const aimJoyRef = useRef({ active: false, dx: 0, dy: -1, mag: 0 });
  const aimBaseRef = useRef<HTMLDivElement>(null);
  const aimKnobRef = useRef<HTMLDivElement>(null);
  const nadeDragRef = useRef({ active: false, sx: 0, sy: 0, baseAx: 50, baseAy: 50, ax: 50, ay: 50 });
  const nadeAtRef = useRef({ x: 50, y: 50 });   // last grenade target (guests stream it)
  const viewRef = useRef({ ox: 0, oy: 0, scale: 1, dpr: 1 }); // canvas → arena mapping
  // live 3D soldiers — RunnerStage overlay canvas (same renderer as Letter Race)
  const stageCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageObjRef = useRef<any>(null);
  const stageSelfIdxRef = useRef(0);
  const stageFightersRef = useRef<string[]>([]);
  const stagePrevRef = useRef<Map<string, { x: number; y: number; t: number; sp: number }>>(new Map());
  const camRef = useRef({ x: 50, y: 50 });
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const blockImgRef = useRef<HTMLImageElement | null>(null);
  const cloudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stormSfxAtRef = useRef(0);   // rate-limits the in-cloud hurt cry
  useEffect(() => {
    if (ARENA_BG_IMAGE) {
      const img = new Image();
      img.onload = () => { bgImgRef.current = img; };
      img.src = ARENA_BG_IMAGE;
    }
    if (BLOCK_SPRITE) {
      const img = new Image();
      img.onload = () => { blockImgRef.current = img; };
      img.src = BLOCK_SPRITE;
    }
    // the bat-cloud (Lottie) renders into an offscreen canvas the painter
    // tiles over the storm area — one animation feeds every tile
    let cloudAnim: { destroy(): void } | null = null;
    let deadCloud = false;
    const cc = document.createElement('canvas');
    cc.width = 450; cc.height = 300;
    (async () => {
      try {
        const [lottieMod, data] = await Promise.all([
          import('lottie-web'),
          fetch('/rb/cloud.json').then(r => r.json()),
        ]);
        if (deadCloud) return;
        const lottie = (lottieMod as any).default ?? lottieMod;
        cloudAnim = lottie.loadAnimation({
          renderer: 'canvas',
          loop: true,
          autoplay: true,
          animationData: data,
          rendererSettings: { context: cc.getContext('2d'), clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' },
        });
        cloudCanvasRef.current = cc;
      } catch { /* the storm still darkens without the art */ }
    })();
    return () => { deadCloud = true; cloudAnim?.destroy(); cloudCanvasRef.current = null; };
  }, []);

  /* ── battle overlay: one RunnerStage renders every fighter as a live 3D
        soldier (scissored viewports over the arena canvas, Letter Race's
        renderer). Built when the battle roster locks at preBattle. ─────────── */
  const inBattle = phase === 'preBattle' || phase === 'battle' || phase === 'victory';
  useEffect(() => {
    if (!inBattle) return;
    const canvas = stageCanvasRef.current;
    if (!canvas) return;
    let stage: { dispose(): void } | null = null;
    let dead = false;
    const gids = world.current.players.filter(p => p.fighting).map(p => p.gid);
    stageFightersRef.current = gids;
    stageSelfIdxRef.current = gids.indexOf(myGid);
    (async () => {
      try {
        const { RunnerStage } = await import('./letterRaceStage');
        if (dead) return;
        const models = gids.map((gid, i) => {
          const pl = world.current.players.find(q => q.gid === gid);
          const heroDef = RB_HEROES[pl?.hero ?? 0] ?? RB_HEROES[0];
          return {
            url: heroDef.url, scale: 1, pinOrigin: true,
            tint: i === 0 ? undefined : HERO_HUES[i % HERO_HUES.length],
            glow: charOf(pl?.charKey ?? '').color,
            // each character carries its own hand transform; only the rifle swaps
            prop: { ...heroDef.gun, url: RB_GUNS[pl?.gun ?? 0]?.url ?? RB_GUNS[0].url },
          };
        });
        const st = new RunnerStage(canvas, () => {
          const v = viewRef.current;
          const W = canvas.clientWidth || 1;
          const H = canvas.clientHeight || 1;
          const now = performance.now();
          return stageFightersRef.current.map(gid => {
            const p = world.current.players.find(q => q.gid === gid);
            if (!p || !p.alive || !p.fighting) return null;
            // walk detection: smoothed speed from position deltas (works for
            // self AND snapshot-interpolated opponents alike)
            let rec = stagePrevRef.current.get(gid);
            if (!rec) { rec = { x: p.x, y: p.y, t: now, sp: 0 }; stagePrevRef.current.set(gid, rec); }
            const dt = (now - rec.t) / 1000;
            if (dt > 0.01) {
              const inst = Math.hypot(p.x - rec.x, p.y - rec.y) / dt / BALANCE.moveSpeed;
              rec.sp += (Math.min(1, inst) - rec.sp) * 0.35;
              rec.x = p.x; rec.y = p.y; rec.t = now;
            }
            return {
              x: ((v.ox + p.x * v.scale) / v.dpr / W) * 100,
              y: ((v.oy + p.y * v.scale) / v.dpr / H) * 100,
              heading: p.h,
              speed: rec.sp * 0.13,           // RunnerStage normalizes against 0.13
              anim: (rec.sp > 0.12 ? 'run' : 'idle') as 'run' | 'idle',
            };
          });
        }, models, {
          size: () => (viewRef.current.scale / viewRef.current.dpr) * 13,
          // block footprints in CSS px — the stage turns them into depth-only
          // boxes so soldiers hide behind them (glow silhouette shows through)
          occluders: () => {
            const v = viewRef.current;
            const u = v.scale / v.dpr;
            const bx = v.ox / v.dpr, by = v.oy / v.dpr;
            return WALL_TILE_LIST.map(t => ({
              cx: bx + (t.x + TILE / 2) * u,
              cy: by + (t.y + TILE / 2) * u,
              w: TILE * u,
              d: TILE * u,
              h: 6.25 * u,   // the art's full visible height above its base line
            }));
          },
        });
        stage = st;
        stageObjRef.current = st;
        await st.init();
      } catch { /* the 3D soldiers are visual — never block the battle */ }
    })();
    return () => { dead = true; stage?.dispose(); stageObjRef.current = null; stagePrevRef.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inBattle]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = world.current;
      const ph = phaseRef.current;

      // phase timers driven by the HOST
      if (!isGuest) {
        if (ph === 'reading' && Date.now() >= g.rd.tEnd) hostNextReader();
        if (ph === 'preBattle' && Date.now() >= g.bt.startedAt) setPhase('battle');
        if (ph === 'battle' && !pausedRef.current) {
          const rings = stormRings(Date.now(), g.bt.startedAt);
          g.bt.zoneOn = rings > 0; // wire-compat flag (banner on guests)
          if (rings > 0) {
            for (const p of g.players) {
              if (!p.alive || !p.fighting) continue;
              if (!stormSafe(p.x, p.y, rings)) {
                p.hp -= BALANCE.storm.dps * dt;
                if (p.hp <= 0) hostEliminate(p, null);
              }
            }
          }
        }
      }

      // OWN movement (host-as-player and guests alike) during battle
      const p = me();
      if (ph === 'battle' && !pausedRef.current && p && p.alive && p.fighting && !p.frozenUntil) {
        let mx = 0, my = 0;
        const held = keysRef.current;
        if (held.has('KeyW') || held.has('ArrowUp')) my -= 1;
        if (held.has('KeyS') || held.has('ArrowDown')) my += 1;
        if (held.has('KeyA') || held.has('ArrowLeft')) mx -= 1;
        if (held.has('KeyD') || held.has('ArrowRight')) mx += 1;
        const tj = touchJoyRef.current;
        if (tj.active && tj.mag > 0.2) { mx = tj.dx; my = tj.dy; }
        const m = Math.hypot(mx, my);
        if (m > 0.05) {
          mx /= Math.max(1, m); my /= Math.max(1, m);
          p.x += mx * BALANCE.moveSpeed * dt;
          p.y += my * BALANCE.moveSpeed * dt;
          [p.x, p.y] = collideWalls(p.x, p.y, BALANCE.playerRadius);
          p.h = (Math.atan2(mx, -my) * 180) / Math.PI;
          if (p.h < 0) p.h += 360;
        }
        // aim OVERRIDES the movement heading: mouse cursor (desktop) or the
        // right stick (mobile). Falls back to the movement heading otherwise.
        if (!isTouch && mouseRef.current.inside) {
          const a = arenaFromClient(mouseRef.current.cx, mouseRef.current.cy);
          const adx = a.ax - p.x, ady = a.ay - p.y;
          if (Math.hypot(adx, ady) > 0.8) {
            p.h = (Math.atan2(adx, -ady) * 180) / Math.PI;
            if (p.h < 0) p.h += 360;
          }
        } else if (isTouch && aimJoyRef.current.active && aimJoyRef.current.mag > 0.25) {
          const aj = aimJoyRef.current;
          p.h = (Math.atan2(aj.dx, -aj.dy) * 180) / Math.PI;
          if (p.h < 0) p.h += 360;
        }
        // hold-to-fire (LMB / right stick) — doShoot swaps to knife when dry
        if ((!isTouch && lmbRef.current) || (isTouch && aimJoyRef.current.active && aimJoyRef.current.mag > 0.35)) doShoot();
      }

      // caught in the cloud: the same hurt cry as taking a bullet, on a slow
      // repeat. Every client decides this locally (the storm is a pure
      // function of the battle clock), so guests hear it without extra data —
      // their per-snapshot hp drop is far too small to trip the hit detector.
      if (ph === 'battle' && !pausedRef.current && p && p.alive && p.fighting) {
        const nowMs = Date.now() + (isGuest ? clockSkewRef.current : 0);
        const rings = stormRings(nowMs, g.bt.startedAt);
        if (rings > 0 && !stormSafe(p.x, p.y, rings) && now - stormSfxAtRef.current > 1100) {
          stormSfxAtRef.current = now;
          playSfx('wounded', 0.9);
        }
      }

      // host: advance projectiles + resolve hits
      if (!isGuest && ph === 'battle' && !pausedRef.current) {
        for (const b of bulletsRef.current) {
          if (!b.on) continue;
          const step = BALANCE.ak.bulletSpeed * dt;
          const nx = b.x + b.dx * step, ny = b.y + b.dy * step;
          if (segmentHitsWall(b.x, b.y, nx, ny)) { b.on = false; continue; }
          b.x = nx; b.y = ny; b.left -= step;
          if (b.left <= 0) { b.on = false; continue; }
          for (const q of g.players) {
            if (!q.alive || !q.fighting || q.gid === b.owner) continue;
            if (Math.hypot(q.x - b.x, q.y - b.y) <= BALANCE.playerRadius + 0.8) {
              b.on = false;
              const shooter = g.players.find(pp => pp.gid === b.owner) ?? null;
              applyDamage(q, gunStats(shooter?.gun ?? 0).damage, shooter);
              break;
            }
          }
        }
        for (const n of nadesRef.current) {
          if (!n.on) continue;
          const t = (performance.now() - n.t0);
          const ft = clamp(t / BALANCE.grenade.flightMs, 0, 1);
          n.x = n.sx + (n.tx - n.sx) * ft;
          n.y = n.sy + (n.ty - n.sy) * ft;
          if (t >= BALANCE.grenade.fuseMs) {
            n.on = false;
            spawnFx('boom', n.x, n.y);
            playSfx('boom');
            const R = BALANCE.grenade.radius;
            for (const q of g.players) {
              if (!q.alive || !q.fighting) continue;
              const d = Math.hypot(q.x - n.x, q.y - n.y);
              if (d > R) continue;
              const dmg = BALANCE.grenade.damageEdge + (BALANCE.grenade.damageCenter - BALANCE.grenade.damageEdge) * (1 - d / R);
              applyDamage(q, Math.round(dmg), g.players.find(pp => pp.gid === n.owner) ?? null);
            }
          }
        }
      }
      // guests: fly the mirrored bullets forward between snapshots so shots
      // render at full frame rate instead of stepping at snapshot rate
      if (isGuest && ph === 'battle' && !pausedRef.current) {
        for (const b of bulletsRef.current) {
          if (b.on && (b.dx || b.dy)) {
            b.x += b.dx * BALANCE.ak.bulletSpeed * dt;
            b.y += b.dy * BALANCE.ak.bulletSpeed * dt;
          }
        }
      }
      // guests animate mirrored grenade arcs locally (visual only)

      drawArena(dt);
      // DOM HUD refresh at ~10fps only — the canvas above repaints every frame
      // imperatively, so React reconciliation stays off the hot path (the same
      // lesson the Letter Race perf work taught us).
      if (now - lastPaintRef.current > 100) {
        lastPaintRef.current = now;
        setTick(t => (t + 1) % 1000000);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest]);

  /* ── canvas painter (pseudo-3D walls; bodies live on the 3D overlay) ────── */
  const drawArena = (dt: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ph = phaseRef.current;
    if (ph !== 'preBattle' && ph !== 'battle' && ph !== 'victory') return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth * dpr, H = cv.clientHeight * dpr;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    // camera: follow me alive, else spectate cycle target, else centre
    const g = world.current;
    const alive = g.players.filter(p => p.alive && p.fighting);
    const self = me();
    let target = self && self.alive && self.fighting ? self : alive[spectateIdx % Math.max(1, alive.length)] ?? null;
    if (!target) target = { x: 50, y: 50 } as RBPlayer;
    const cam = camRef.current;
    cam.x += (target.x - cam.x) * Math.min(1, dt * 6);
    cam.y += (target.y - cam.y) * Math.min(1, dt * 6);

    const VIEW = 58; // arena units across the smaller screen dimension
    const scale = Math.min(W, H) / VIEW;
    const ox = W / 2 - cam.x * scale;
    const oy = H / 2 - cam.y * scale;
    const px = (x: number) => ox + x * scale;
    const py = (y: number) => oy + y * scale;
    viewRef.current = { ox, oy, scale, dpr };

    // ground (out-of-bounds matches the desert art edge so corners don't show void)
    ctx.fillStyle = bgImgRef.current ? '#f19e54' : '#0f2418'; // sampled from the v2 art's edges
    ctx.fillRect(0, 0, W, H);
    if (bgImgRef.current) {
      ctx.drawImage(bgImgRef.current, px(0), py(0), 100 * scale, 100 * scale);
    } else {
      ctx.fillStyle = '#173420';
      ctx.fillRect(px(0), py(0), 100 * scale, 100 * scale);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 10; i < 100; i += 10) {
        ctx.beginPath(); ctx.moveTo(px(i), py(0)); ctx.lineTo(px(i), py(100)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px(0), py(i)); ctx.lineTo(px(100), py(i)); ctx.stroke();
      }
    }
    // centre courtyard hint — the storm's final safe area
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(px(CENTER_SQUARE.x), py(CENTER_SQUARE.y), CENTER_SQUARE.w * scale, CENTER_SQUARE.h * scale);

    // painter's list: entities AND obstacle blocks sorted by base Y, so
    // players walk behind and in front of the 3D blocks (Brawl Stars look)
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    const blockH = TILE * BLOCK_ASPECT; // sprite extends above its tile
    for (const t of WALL_TILE_LIST) {
      items.push({ y: t.y + TILE, draw: () => {
        const img = blockImgRef.current;
        if (img) {
          ctx.drawImage(img, px(t.x), py(t.y + TILE - blockH), TILE * scale, blockH * scale);
        } else {
          ctx.fillStyle = '#5f8532';
          ctx.fillRect(px(t.x), py(t.y), TILE * scale, TILE * scale);
          ctx.fillStyle = '#79a63f';
          ctx.fillRect(px(t.x), py(t.y - 1.5), TILE * scale, 1.5 * scale);
        }
      } });
    }
    for (const p of g.players) {
      if (!p.fighting || (!p.alive && ph !== 'victory')) continue;
      if (!p.alive) continue;
      const c = charOf(p.charKey);
      items.push({ y: p.y, draw: () => {
        const X = px(p.x), Y = py(p.y), R = BALANCE.playerRadius * scale;
        // identity ring only — body + contact shadow come from the 3D overlay
        ctx.strokeStyle = c.color; ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.ellipse(X, Y + R * 0.45, R * 0.95, R * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
        // name + bars
        ctx.font = `bold ${Math.round(10 * dpr)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = p.gid === myGid ? '#fde047' : '#ffffff';
        ctx.fillText(p.name, X, Y - R * 3.0);
        const bw = R * 2.2, bh = 4 * dpr, bx = X - bw / 2, byy = Y - R * 2.7;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, byy, bw, bh);
        ctx.fillStyle = '#4ade80'; ctx.fillRect(bx, byy, bw * clamp(p.hp / BALANCE.health, 0, 1), bh);
        if (p.armor > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, byy + bh + 1, bw, bh * 0.8);
          ctx.fillStyle = '#93c5fd'; ctx.fillRect(bx, byy + bh + 1, bw * clamp(p.armor / BALANCE.armor, 0, 1), bh * 0.8);
        }
        if (p.frozenUntil) {
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText('⏸ reconnecting…', X, Y + R * 2.1);
        }
      } });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    // ── local-only aim visuals — drawn on MY canvas only, opponents never see
    if (ph === 'battle' && !pausedRef.current && self && self.alive && self.fighting) {
      // the line IS the bullet track: anchored to the LIVE gun muzzle (3D
      // projection) and parallel to the ground aim ray, clipped by walls —
      // exactly what a bullet fired this instant will fly
      const rad0 = (self.h * Math.PI) / 180;
      const fx0 = Math.sin(rad0), fy0 = -Math.cos(rad0);
      const sx0 = self.x + fx0 * RB_FIRE.forward + Math.cos(rad0) * RB_FIRE.side;
      const sy0 = self.y + fy0 * RB_FIRE.forward + Math.sin(rad0) * RB_FIRE.side;
      const [ovx, ovy] = muzzleVisOffset(myGid, sx0, sy0);
      // straight from the muzzle DOWN TO the aim point: the muzzle offset
      // fades to zero across the aim distance, so the far end lands exactly
      // on the cursor circle — and the bullets glide the same slope
      const drawAimLine = (len: number) => {
        const [ex, ey] = clipSegmentAtWall(sx0, sy0, sx0 + fx0 * len, sy0 + fy0 * len);
        const fade = Math.max(0, 1 - Math.hypot(ex - sx0, ey - sy0) / Math.max(2, len));
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([5 * dpr, 5 * dpr]);
        ctx.beginPath();
        ctx.moveTo(px(sx0) + ovx * scale, py(sy0) + ovy * scale);
        ctx.lineTo(px(ex) + ovx * scale * fade, py(ey) + ovy * scale * fade);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      if (!isTouch && mouseRef.current.inside) {
        const a = arenaFromClient(mouseRef.current.cx, mouseRef.current.cy);
        drawAimLine(Math.max(2, Math.hypot(a.ax - self.x, a.ay - self.y) - RB_FIRE.forward));
      } else if (isTouch && aimJoyRef.current.active) {
        drawAimLine(16);
      }
      const nd = nadeDragRef.current;
      if (nd.active) {
        // vivid landing circle while the grenade button is held
        const pulse = 1 + Math.sin(performance.now() / 120) * 0.08;
        const TR = BALANCE.grenade.radius * scale * pulse * (isTouch ? 0.5 : 1);
        ctx.fillStyle = 'rgba(190,242,100,0.18)';
        ctx.beginPath(); ctx.arc(px(nd.ax), py(nd.ay), TR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(190,242,100,0.95)';
        ctx.lineWidth = 3 * dpr;
        ctx.setLineDash([7 * dpr, 5 * dpr]);
        ctx.beginPath(); ctx.arc(px(nd.ax), py(nd.ay), TR, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(190,242,100,0.95)';
        ctx.beginPath(); ctx.arc(px(nd.ax), py(nd.ay), 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
      }
    }

    // projectiles above everything — each bullet leaves the barrel with its
    // captured muzzle offset and glides down to the aim point (the offset
    // fades over the aim distance, exactly like the dashed line)
    ctx.fillStyle = '#fef08a';
    for (const b of bulletsRef.current) {
      if (!b.on) continue;
      const trav = Math.hypot(b.x - b.spx, b.y - b.spy);
      const fade = b.decay > 0 ? Math.max(0, 1 - trav / b.decay) : 0;
      ctx.beginPath(); ctx.arc(px(b.x) + b.vx * scale * fade, py(b.y) + b.vy * scale * fade, 0.18 * scale, 0, Math.PI * 2); ctx.fill();
    }
    for (const n of nadesRef.current) {
      if (!n.on) continue;
      const h = nadeHeight(n);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(px(n.x), py(n.y), 0.24 * scale, 0.13 * scale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#365314';
      ctx.beginPath(); ctx.arc(px(n.x), py(n.y - h), 0.26 * scale, 0, Math.PI * 2); ctx.fill();
    }
    // fx
    const now = performance.now();
    for (const f of fxRef.current) {
      if (!f.on) continue;
      const t = (now - f.t0) / (f.kind === 'boom' ? 500 : 400);
      if (t >= 1) { f.on = false; continue; }
      if (f.kind === 'boom') {
        ctx.strokeStyle = `rgba(251,146,60,${1 - t})`;
        ctx.lineWidth = 5 * dpr * (1 - t);
        ctx.beginPath(); ctx.arc(px(f.x), py(f.y), BALANCE.grenade.radius * scale * t, 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'poof') {
        ctx.fillStyle = `rgba(226,232,240,${1 - t})`;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(px(f.x) + Math.cos(a) * 14 * dpr * t, py(f.y) + Math.sin(a) * 14 * dpr * t, 4 * dpr * (1 - t), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = `rgba(248,113,113,${1 - t})`;
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath(); ctx.arc(px(f.x), py(f.y), 6 * dpr * t, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // ── the bat-cloud storm: rings of tile clouds, no backdrop ──
    if (ph === 'battle') {
      const nowMs = Date.now() + (isGuest ? clockSkewRef.current : 0);
      const rings = stormRings(nowMs, g.bt.startedAt);
      const cc = cloudCanvasRef.current;
      if (rings > 0 && cc) {
        // only the tiles actually on screen
        const t0x = Math.max(-STORM_PAD, Math.floor(-ox / scale / TILE) - 1);
        const t1x = Math.min(GRID_TILES + STORM_PAD, Math.ceil((W - ox) / scale / TILE) + 1);
        const t0y = Math.max(-STORM_PAD, Math.floor(-oy / scale / TILE) - 1);
        const t1y = Math.min(GRID_TILES + STORM_PAD, Math.ceil((H - oy) / scale / TILE) + 1);
        // big puffs on a checkerboard: full-size clouds that still leave the
        // ground visible between them instead of merging into one mass
        const cw = TILE * scale * 1.5;
        const chh = cw * (2 / 3);                // the Lottie art is 3:2
        const ring0At = g.bt.startedAt + BALANCE.storm.startMs;
        for (let ty = t0y; ty < t1y; ty++) {
          for (let tx = t0x; tx < t1x; tx++) {
            if (((tx + ty) & 1) !== 0) continue;   // checkerboard spacing
            const r = tileRing(tx, ty);
            if (r >= rings) continue;
            // each ring pops in on its own beat (rows outside the map ride ring 0)
            const age = nowMs - (ring0At + Math.max(0, r) * BALANCE.storm.stepMs);
            const t = clamp(age / 320, 0, 1);
            const back = 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
            const sc = 0.3 + 0.7 * back;         // easeOutBack: a little pop
            const w2 = cw * sc, h2 = chh * sc;
            const cx = px((tx + 0.5) * TILE), cy = py((ty + 0.5) * TILE);
            ctx.globalAlpha = 0.92 * clamp(t * 2.5, 0.15, 1);
            ctx.drawImage(cc, cx - w2 / 2, cy - h2 / 2, w2, h2);
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    // dot cursor — the OS cursor is hidden during desktop battle
    if (ph === 'battle' && !isTouch && !pausedRef.current && mouseRef.current.inside) {
      const m = mouseRef.current;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(m.cx * dpr, m.cy * dpr, 3 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.arc(m.cx * dpr, m.cy * dpr, 6.5 * dpr, 0, Math.PI * 2); ctx.stroke();
    }
  };

  /* ── inputs: keyboard + joystick + action buttons ───────────────────────── */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const HANDLED = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'];
      if (!HANDLED.includes(e.code)) return;
      e.preventDefault();
      if (e.code === 'Escape') { requestPauseToggle(); return; }
      keysRef.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ONE trigger: rifle when armed, knife/fists automatically when out of ammo
  // (the knife has no button of its own). Guests predict their own cooldowns
  // locally so held autofire doesn't flood the action counters.
  /** Lobby choices — host writes his player directly, guests re-hello. */
  const sendChoiceHello = () => {
    try {
      channelRef.current?.send({ type: 'broadcast', event: 'hello', payload: { gid: myGid, name: myName || 'Player', charKey: RB_CHARACTERS[0].key, gun: myGunRef.current, hero: myHeroRef.current } });
    } catch { /* offline — the next auto-hello carries it */ }
  };
  const pickGun = (i: number) => {
    setMyGun(i);
    myGunRef.current = i;
    if (!isGuest) {
      const t = world.current.players.find(p => p.gid === 'host');
      if (t) t.gun = i;
    } else if (joined) sendChoiceHello();
  };
  const pickHero = (i: number) => {
    setMyHero(i);
    myHeroRef.current = i;
    if (!isGuest) {
      const t = world.current.players.find(p => p.gid === 'host');
      if (t) t.hero = i;
    } else if (joined) sendChoiceHello();
  };

  /** Ground distance from me to the aim target (cursor / stick line end). */
  const aimDistance = (): number => {
    const p = me();
    if (!p) return 14;
    if (isTouch || !mouseRef.current.inside) return 16;
    const a = arenaFromClient(mouseRef.current.cx, mouseRef.current.cy);
    return Math.max(2, Math.hypot(a.ax - p.x, a.ay - p.y) - RB_FIRE.forward);
  };

  const doShoot = () => {
    const p = me();
    if (!p || !p.alive || phaseRef.current !== 'battle' || pausedRef.current) return;
    const gun = p.upgrades >= 3 && p.ammo > 0;
    if (!isGuest) { if (gun) hostFire(p, aimDistance()); else hostMelee(p); return; }
    const now = performance.now();
    if (gun) {
      if (now - p.lastFireAt < gunStats(p.gun).fireRateMs) return;
      p.lastFireAt = now;
      actsRef.current.fire++;
      playSfx('shot', 0.55);
    } else {
      const spec = p.upgrades >= 1 ? BALANCE.knife : BALANCE.fists;
      if (now - p.lastMeleeAt < spec.cooldownMs) return;
      p.lastMeleeAt = now;
      actsRef.current.atk++;
      playSfx('melee', 0.5);
    }
  };
  const doNade = (tx: number, ty: number) => {
    const p = me();
    if (!p || !p.alive || phaseRef.current !== 'battle' || pausedRef.current) return;
    if (p.grenades <= 0) return;
    if (isGuest) { nadeAtRef.current = { x: tx, y: ty }; actsRef.current.nade++; }
    else hostNade(p, tx, ty);
  };

  /* ── pause (ESC — networked, freezes everyone) ──────────────────────────── */
  const hostTogglePause = () => {
    if (phaseRef.current !== 'battle') return;
    if (!pausedRef.current) {
      pausedRef.current = true;
      pauseStartRef.current = performance.now();
      setPaused(true);
    } else {
      // shift running clocks by the paused span so fuses/zone don't jump
      const span = performance.now() - pauseStartRef.current;
      nadesRef.current.forEach(n => { if (n.on) n.t0 += span; });
      world.current.bt.startedAt += span;
      pausedRef.current = false;
      setPaused(false);
    }
  };
  const requestPauseToggle = () => {
    if (phaseRef.current !== 'battle') return;
    if (isGuest) { try { channelRef.current?.send({ type: 'broadcast', event: 'pause', payload: { gid: myGid } }); } catch { /* offline */ } }
    else hostTogglePause();
  };

  /* ── fullscreen ─────────────────────────────────────────────────────────── */
  const fsSupported = typeof document !== 'undefined' &&
    !!((document.documentElement as any).requestFullscreen || (document.documentElement as any).webkitRequestFullscreen);
  const toggleFs = () => {
    const el = rootRef.current as any;
    const doc = document as any;
    try {
      if (!(doc.fullscreenElement || doc.webkitFullscreenElement)) {
        (el?.requestFullscreen || el?.webkitRequestFullscreen)?.call(el)?.catch?.(() => {});
      } else {
        (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc)?.catch?.(() => {});
      }
    } catch { /* unsupported */ }
  };
  useEffect(() => {
    const onFs = () => setIsFs(!!((document as any).fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); };
  }, []);

  /* ── canvas px → arena units (via the transform drawArena stored) ───────── */
  const arenaFromClient = (cx: number, cy: number) => {
    const v = viewRef.current;
    return { ax: (cx * v.dpr - v.ox) / v.scale, ay: (cy * v.dpr - v.oy) / v.scale };
  };

  const isTouch = typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches === true ||
     (((import.meta as any).env?.DEV) && (window as any).__rbForceTouch === true));
  const joyMove = (e: React.TouchEvent) => {
    const base = joyBaseRef.current;
    const t = e.targetTouches[0]; // NOT touches[0] — both sticks are used at once
    if (!base || !t) return;
    const r = base.getBoundingClientRect();
    let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    touchJoyRef.current = { active: true, dx, dy, mag: Math.min(1, mag) };
    const k = joyKnobRef.current;
    const travel = r.width * 0.29;
    if (k) k.style.transform = `translate(calc(-50% + ${dx * travel}px), calc(-50% + ${dy * travel}px))`;
  };
  const joyEnd = () => {
    touchJoyRef.current = { active: false, dx: 0, dy: 0, mag: 0 };
    const k = joyKnobRef.current;
    if (k) k.style.transform = 'translate(-50%,-50%)';
  };

  /* ── right stick: aim + autofire while held ─────────────────────────────── */
  const aimMove = (e: React.TouchEvent) => {
    const base = aimBaseRef.current;
    const t = e.targetTouches[0];
    if (!base || !t) return;
    const r = base.getBoundingClientRect();
    let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    aimJoyRef.current = { active: true, dx, dy, mag: Math.min(1, mag) };
    const k = aimKnobRef.current;
    const travel = r.width * 0.29;
    if (k) k.style.transform = `translate(calc(-50% + ${dx * travel}px), calc(-50% + ${dy * travel}px))`;
  };
  const aimEnd = () => {
    aimJoyRef.current = { active: false, dx: 0, dy: -1, mag: 0 };
    const k = aimKnobRef.current;
    if (k) k.style.transform = 'translate(-50%,-50%)';
  };

  /* ── grenade button: hold shows a draggable landing circle, release throws ─ */
  const updateNadeTarget = (cx: number, cy: number) => {
    const nd = nadeDragRef.current;
    const p = me();
    if (!nd.active || !p) return;
    const v = viewRef.current;
    const cssPerUnit = v.scale / v.dpr;
    const ax = nd.baseAx + (cx - nd.sx) / cssPerUnit;
    const ay = nd.baseAy + (cy - nd.sy) / cssPerUnit;
    let dx = ax - p.x, dy = ay - p.y;
    const d = Math.hypot(dx, dy);
    if (d > BALANCE.grenade.throwDist) { dx *= BALANCE.grenade.throwDist / d; dy *= BALANCE.grenade.throwDist / d; }
    nd.ax = clamp(p.x + dx, 3, 97);
    nd.ay = clamp(p.y + dy, 3, 97);
  };
  const nadeTouchStart = (e: React.TouchEvent) => {
    const p = me();
    const t = e.targetTouches[0];
    if (!p || !t || !p.alive || phaseRef.current !== 'battle' || pausedRef.current || p.grenades <= 0) return;
    const rad = (p.h * Math.PI) / 180;
    const d = BALANCE.grenade.throwDist * 0.55;
    nadeDragRef.current = {
      active: true, sx: t.clientX, sy: t.clientY,
      baseAx: p.x + Math.sin(rad) * d, baseAy: p.y - Math.cos(rad) * d,
      ax: p.x, ay: p.y,
    };
    updateNadeTarget(t.clientX, t.clientY);
  };
  const nadeTouchMove = (e: React.TouchEvent) => {
    const t = e.targetTouches[0];
    if (t) updateNadeTarget(t.clientX, t.clientY);
  };
  const nadeTouchEnd = () => {
    const nd = nadeDragRef.current;
    if (!nd.active) return;
    nd.active = false;
    doNade(nd.ax, nd.ay);
  };

  /* ── desktop mouse: steer aim, LMB fire (hold = auto), RMB grenade ──────── */
  useEffect(() => {
    if (isTouch) return;
    const mm = (e: MouseEvent) => { const m = mouseRef.current; m.inside = true; m.cx = e.clientX; m.cy = e.clientY; };
    const mout = (e: MouseEvent) => { if (!e.relatedTarget) { mouseRef.current.inside = false; lmbRef.current = false; } };
    const md = (e: MouseEvent) => {
      if (phaseRef.current !== 'battle' || pausedRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('button, input, a')) return; // UI stays clickable
      if (e.button === 0) { lmbRef.current = true; doShoot(); }
      else if (e.button === 2) { const a = arenaFromClient(e.clientX, e.clientY); doNade(a.ax, a.ay); }
    };
    const mu = (e: MouseEvent) => { if (e.button === 0) lmbRef.current = false; };
    const cm = (e: MouseEvent) => { if (phaseRef.current === 'battle') e.preventDefault(); };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseout', mout);
    window.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);
    window.addEventListener('contextmenu', cm);
    return () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseout', mout);
      window.removeEventListener('mousedown', md);
      window.removeEventListener('mouseup', mu);
      window.removeEventListener('contextmenu', cm);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTouch]);

  // scroll lock (same iOS handling as Letter Race)
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = rootRef.current;
    const stopPan = (e: TouchEvent) => { if (phaseRef.current === 'battle' || phaseRef.current === 'preBattle') e.preventDefault(); };
    el?.addEventListener('touchmove', stopPan, { passive: false });
    return () => { document.body.style.overflow = prev; el?.removeEventListener('touchmove', stopPan); };
  }, []);

  /* ── derived for render ─────────────────────────────────────────────────── */
  const players = world.current.players;
  const fighters = players.filter(p => p.fighting);
  const students = players.filter(p => !p.isTutor);
  const rd = world.current.rd;
  const meP = me();
  const localNow = Date.now() + (isGuest ? clockSkewRef.current : 0);
  const readSecondsLeft = Math.max(0, Math.ceil((rd.tEnd - localNow) / 1000));
  const readCountingDown = rd.tEnd - localNow > READ_SECONDS * 1000; // in the 3-2-1 slice
  const battleCountLeft = Math.max(0, Math.ceil((world.current.bt.startedAt - localNow) / 1000));
  const reader = players.find(p => p.gid === rd.turnGid);
  const iAmReader = rd.turnGid === myGid;
  const winner = players.find(p => p.gid === world.current.winner);
  // Solo allowed for now so the game can be play-tested alone (tutor-as-player
  // or one student). Raise back to 2 for real sessions.
  const MIN_FIGHTERS = 1;
  const canStart = !isGuest && fighters.length >= MIN_FIGHTERS && assetsReady && wordsRef.current.length > 0;

  const btnBase: React.CSSProperties = { border: 'none', borderRadius: 999, padding: '13px 30px', fontWeight: 900, cursor: 'pointer', fontSize: 16, color: '#fff' };

  /* ═══════════════════════════ RENDER ═══════════════════════════ */
  return (
    <div ref={rootRef} className="fixed inset-0 z-[9999] overflow-hidden select-none" style={{ background: 'linear-gradient(160deg,#071a10 0%,#0d2b1a 60%,#123a22 100%)', touchAction: phase === 'battle' ? 'none' : undefined, cursor: phase === 'battle' && !isTouch && !paused ? 'none' : undefined }}>

      {/* battle canvas (always mounted; painter only draws in battle phases) */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ display: inBattle ? 'block' : 'none' }} />
      {/* live 3D soldiers — transparent overlay, input passes through */}
      <canvas ref={stageCanvasRef} className="absolute inset-0 w-full h-full" style={{ display: inBattle ? 'block' : 'none', pointerEvents: 'none', zIndex: 5 }} />

      {/* ── top bar ── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-2 px-3 py-2" style={{ background: 'linear-gradient(rgba(4,20,10,0.7), rgba(4,20,10,0))' }}>
        <button onClick={onExit} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', borderRadius: 10, padding: '7px 12px', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>✕ Exit</button>
        <span className="text-white font-extrabold text-sm sm:text-base">📖⚔️ Reading Battle</span>
        {phase === 'battle' && world.current.bt.zoneOn && (
          <span className="text-red-300 text-xs font-bold animate-pulse">☁️ The cloud is closing — run to the centre!</span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {fighters.map(p => (
            <span key={p.gid} title={p.name}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border-2 ${p.alive ? 'border-white/70' : 'border-white/20 opacity-40'}`}
              style={{ background: charOf(p.charKey).color }}>
              <span className="font-extrabold text-white">{(p.name || '?').charAt(0).toUpperCase()}</span>
            </span>
          ))}
        </span>
        {fsSupported && (
          <button onClick={toggleFs} title={isFs ? 'Exit fullscreen' : 'Fullscreen'}
            style={{ background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', borderRadius: 10, padding: '7px 11px', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>
            {isFs ? '⇲' : '⛶'}
          </button>
        )}
      </div>

      {/* ══ LOBBY — full-screen showcase ══ */}
      {phase === 'lobby' && (
        <div className="absolute inset-0 z-20 overflow-y-auto">
          {/* ambient glows */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(1100px 520px at 30% -8%, rgba(16,185,129,0.16), transparent 60%), radial-gradient(900px 520px at 92% 108%, rgba(245,158,11,0.12), transparent 60%)' }} />

          <div className="relative min-h-full max-w-[1500px] mx-auto flex flex-col lg:flex-row lg:items-stretch gap-6 px-4 sm:px-10 pt-14 pb-8">

            {/* ── left: the soldier showcase ── */}
            <div className="flex-1 flex flex-col items-center justify-center py-2">
              <h1 className="text-3xl sm:text-4xl xl:text-5xl font-extrabold text-white text-center tracking-tight">
                📖 Read <span className="text-emerald-300">→</span> earn gear <span className="text-emerald-300">→</span> ⚔️ battle!
              </h1>
              <p className="text-emerald-200/80 text-sm sm:text-base mt-2 mb-2 text-center">Up to {MAX_PLAYERS} fighters · the tutor referees the reading</p>

              {/* pedestal + big soldier */}
              <div className="relative flex flex-col items-center">
                <div className="absolute bottom-10 w-64 h-24 rounded-full pointer-events-none" style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,0.35), transparent 70%)', filter: 'blur(8px)' }} />
                <RBHero clip="stretch" url={RB_HEROES[myHero]?.url} className="relative w-[240px] h-[330px] sm:w-[300px] sm:h-[410px] xl:w-[340px] xl:h-[470px]" />
                <p className="text-white/45 text-[11px] font-semibold -mt-2">Your soldier — uniform colours are assigned automatically</p>
              </div>

              {/* character choice */}
              <div className="mt-4 w-full max-w-xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300 mb-2 text-center">Choose your fighter</p>
                <div className="flex gap-3 justify-center">
                  {RB_HEROES.map((h, i) => (
                    <button key={h.key} onClick={() => pickHero(i)}
                      className={`rounded-2xl px-4 py-2 flex flex-col items-center border transition-all duration-150 ${myHero === i
                        ? 'border-emerald-400/90 bg-emerald-400/10 shadow-[0_0_24px_rgba(52,211,153,0.25)]'
                        : 'border-white/10 bg-white/[0.06] hover:bg-white/10 hover:border-white/25'}`}>
                      <RBHero clip="idle" url={h.url} className="w-20 h-28" />
                      <span className={`text-[11px] font-bold mt-1 ${myHero === i ? 'text-emerald-300' : 'text-white/70'}`}>{h.name}</span>
                      <span className={`text-[9px] font-bold tracking-widest ${myHero === i ? 'text-emerald-400/90' : 'text-transparent'}`}>SELECTED</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* weapon rack */}
              <div className="mt-4 w-full max-w-xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300 mb-2 text-center">Choose your weapon</p>
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  {RB_GUNS.map((g, i) => (
                    <button key={g.key} onClick={() => pickGun(i)}
                      className={`group rounded-2xl px-2 pt-3 pb-2 flex flex-col items-center border transition-all duration-150 ${myGun === i
                        ? 'border-emerald-400/90 bg-emerald-400/10 shadow-[0_0_24px_rgba(52,211,153,0.25)] scale-[1.03]'
                        : 'border-white/10 bg-white/[0.06] hover:bg-white/10 hover:border-white/25'}`}>
                      <img src={g.thumb} alt={g.name} className={`w-full max-w-[96px] h-10 sm:h-12 object-contain transition-transform duration-150 ${myGun === i ? 'scale-110' : 'group-hover:scale-105'}`} />
                      <span className={`text-[11px] font-bold mt-1.5 ${myGun === i ? 'text-emerald-300' : 'text-white/70'}`}>{g.name}</span>
                      <span className={`text-[9px] font-bold tracking-widest ${myGun === i ? 'text-emerald-400/90' : 'text-white/35'}`}>{myGun === i ? 'EQUIPPED' : g.class.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
                {/* the selected weapon's card: stats bars, same numbers the battle runs on */}
                {(() => {
                  const g = RB_GUNS[myGun] ?? RB_GUNS[0];
                  const s = g.stats;
                  const rows = [
                    { label: 'Damage', frac: s.damage / 15, hint: `${s.damage} per hit` },
                    { label: 'Fire rate', frac: (1000 / s.fireRateMs) / 9.5, hint: `${(1000 / s.fireRateMs).toFixed(1)} shots/s` },
                    { label: 'Focus', frac: Math.max(0.06, 1 - s.spread / 0.1), hint: s.spread <= 0.025 ? 'laser-tight' : s.spread <= 0.06 ? 'steady' : 'sprays wide' },
                    { label: 'Range', frac: s.range / 85, hint: `${s.range}m` },
                  ];
                  return (
                    <div className="mt-3 bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3">
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-sm font-extrabold text-white">{g.name}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/90">{g.class}</span>
                      </div>
                      <div className="space-y-1.5">
                        {rows.map(r => (
                          <div key={r.label} className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wider text-white/55">{r.label}</span>
                            <div className="flex-1 h-2 rounded-full bg-black/35 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300"
                                style={{ width: `${Math.round(clamp(r.frac, 0, 1) * 100)}%` }} />
                            </div>
                            <span className="w-20 shrink-0 text-right text-[10px] font-semibold text-white/65">{r.hint}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── right: control panel ── */}
            <div className="w-full lg:w-[400px] flex flex-col gap-4 justify-center pb-4">

              <div className="bg-white/[0.07] backdrop-blur border border-white/10 rounded-3xl p-5 space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">{isGuest ? 'Fighter' : 'Referee'}</p>
                <input
                  value={myName}
                  onChange={e => setMyName(e.target.value.slice(0, 14))}
                  placeholder={isGuest ? 'Your name…' : 'Your name (tutor)…'}
                  className="w-full px-4 py-3.5 rounded-2xl bg-black/25 border border-white/15 text-white text-lg placeholder:text-white/35 font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                {!isGuest && (
                  <label className="flex items-center gap-3 text-white/90 text-sm font-semibold cursor-pointer bg-black/20 rounded-2xl px-4 py-3 border border-white/10">
                    <input type="checkbox" checked={tutorPlays} onChange={e => {
                      setTutorPlays(e.target.checked);
                      const t = world.current.players.find(p => p.gid === 'host');
                      if (t) { t.fighting = e.target.checked; t.name = myName || 'Tutor'; }
                    }} className="w-5 h-5 rounded accent-emerald-500" />
                    I'm playing too <span className="text-white/50 font-medium">(referee + fighter)</span>
                  </label>
                )}
              </div>

              {!isGuest ? (
                <div className="bg-white/[0.07] backdrop-blur border border-white/10 rounded-3xl p-5 space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">Invite students</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={shareLink} className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-black/30 border border-white/10 text-emerald-100 text-xs font-mono" />
                    <button onClick={() => { try { navigator.clipboard?.writeText(shareLink); } catch { /* */ } setLinkCopied(true); window.setTimeout(() => setLinkCopied(false), 1500); }}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold whitespace-nowrap transition-colors">{linkCopied ? '✓ Copied' : 'Copy link'}</button>
                    <button onClick={() => setQrOpen(true)} className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-emerald-50 text-slate-800 text-xs font-bold transition-colors">QR</button>
                  </div>
                </div>
              ) : (
                !joined && (
                  <button
                    onClick={() => { ensureAc().resume?.(); setJoined(true); }}
                    disabled={!myName.trim()}
                    style={{ ...btnBase, width: '100%', padding: '16px 30px', background: myName.trim() ? 'linear-gradient(135deg,#f97316,#ea580c)' : '#47556988', cursor: myName.trim() ? 'pointer' : 'default', boxShadow: myName.trim() ? '0 8px 30px rgba(249,115,22,0.35)' : 'none' }}>
                    🔗 Join the battle!
                  </button>
                )
              )}
              {isGuest && joined && (
                <div className="bg-white/[0.07] backdrop-blur border border-white/10 rounded-3xl px-5 py-4 text-center text-emerald-200 text-sm font-semibold">
                  {gotSnap ? '✅ Connected — waiting for the tutor to start…' : '⏳ Joining…'}
                </div>
              )}

              {/* roster */}
              <div className="bg-white/[0.07] backdrop-blur border border-white/10 rounded-3xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">Players</p>
                  <span className="text-xs font-extrabold text-white/80 bg-black/30 border border-white/10 rounded-full px-2.5 py-0.5">{fighters.length}/{MAX_PLAYERS}</span>
                </div>
                {players.length === 0 && <p className="text-white/40 text-sm">Share the link — students appear here…</p>}
                <div className="space-y-2">
                  {players.map(p => (
                    <div key={p.gid} className="flex items-center gap-3 text-white text-sm font-semibold bg-black/20 border border-white/5 rounded-2xl px-3 py-2">
                      <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold text-white shadow-inner" style={{ background: charOf(p.charKey).color }}>{(p.name || '?').charAt(0).toUpperCase()}</span>
                      <span className="flex-1 truncate">{p.gid === 'host' ? (myName || 'Tutor') : p.name}</span>
                      {p.isTutor
                        ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/25 text-amber-200 font-bold">{p.fighting ? 'REFEREE + FIGHTER' : 'REFEREE'}</span>
                        : <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 font-bold">{RB_GUNS[p.gun]?.name?.toUpperCase() ?? ''}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {!isGuest && (
                <button onClick={() => { ensureAc().resume?.(); playSfx('countdown', 0.4); const t = world.current.players.find(p => p.gid === 'host'); if (t) { t.name = myName || 'Tutor'; t.fighting = tutorPlays; } setPhase('levels'); }}
                  disabled={!canStart}
                  style={{ ...btnBase, width: '100%', padding: '17px 30px', fontSize: 17, background: canStart ? 'linear-gradient(135deg,#16a34a,#15803d)' : '#47556988', cursor: canStart ? 'pointer' : 'default', boxShadow: canStart ? '0 8px 30px rgba(22,163,74,0.35)' : 'none' }}>
                  {assetsReady && wordsRef.current.length > 0
                    ? (fighters.length >= MIN_FIGHTERS
                        ? (fighters.length === 1 ? 'Start — solo test ▶' : 'Start — set levels ▶')
                        : 'Waiting for a fighter…')
                    : '⏳ Loading sounds & verses…'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ LEVELS (tutor referee panel) ══ */}
      {phase === 'levels' && !isGuest && (
        <div className="absolute inset-0 z-20 overflow-y-auto flex items-start justify-center pt-14 pb-8 px-4">
          <div className="w-full max-w-md space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-extrabold text-white">Set each student's level</h2>
              <p className="text-emerald-200/70 text-sm mt-1">Level = words per reading segment (1–5)</p>
            </div>
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4 space-y-3">
              {students.map(p => (
                <div key={p.gid} className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-extrabold text-white" style={{ background: charOf(p.charKey).color }}>{(p.name || '?').charAt(0).toUpperCase()}</span>
                  <span className="flex-1 text-white font-bold text-sm truncate">{p.name}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(lv => (
                      <button key={lv} onClick={() => { p.level = lv; setTick(t => t + 1); }}
                        className={`w-8 h-8 rounded-lg text-sm font-extrabold ${p.level === lv ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/60'}`}>{lv}</button>
                    ))}
                  </div>
                </div>
              ))}
              {tutorPlays && (
                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  <span className="flex-1 text-amber-200 font-bold text-sm">Your loadout level (no reading for you)</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(lv => {
                      const t = players.find(p => p.gid === 'host')!;
                      return (
                        <button key={lv} onClick={() => { t.level = lv; setTick(x => x + 1); }}
                          className={`w-8 h-8 rounded-lg text-sm font-extrabold ${t.level === lv ? 'bg-amber-500 text-white' : 'bg-white/10 text-white/60'}`}>{lv}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => { playSfx('countdown', 0.5); hostBeginReading(); }}
              style={{ ...btnBase, width: '100%', background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
              All set — begin reading 📖
            </button>
            <button onClick={() => { playSfx('countdown', 0.5); hostSkipToBattle(); }}
              style={{ ...btnBase, width: '100%', background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
              ⚔️ Skip reading — battle now, full gear for everyone
            </button>
          </div>
        </div>
      )}
      {phase === 'levels' && isGuest && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
          <p className="text-white/80 font-bold text-lg text-center">⏳ The tutor is setting levels…</p>
        </div>
      )}

      {/* ══ READING ══ */}
      {phase === 'reading' && (
        <div className="absolute inset-0 z-20 overflow-y-auto flex items-start justify-center pt-14 pb-8 px-4">
          <div className="w-full max-w-2xl space-y-4">
            {/* whose turn + timer — visible to EVERYONE */}
            <div className="text-center">
              <p className="text-emerald-300 font-bold text-sm uppercase tracking-widest">Now reading</p>
              <p className="text-white text-2xl font-extrabold flex items-center justify-center gap-2">
                <span className="w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-white" style={{ background: charOf(reader?.charKey ?? '').color }}>{(reader?.name ?? '?').charAt(0).toUpperCase()}</span>
                {reader?.name ?? '…'}
              </p>
              <div className={`mt-2 text-6xl font-extrabold tabular-nums ${readSecondsLeft <= 5 && !readCountingDown ? 'text-red-400' : 'text-white'}`}>
                {readCountingDown ? Math.max(1, Math.min(3, readSecondsLeft - READ_SECONDS)) : readSecondsLeft}
              </div>
              <p className="text-white/50 text-xs font-semibold">{readCountingDown ? 'get ready…' : 'seconds left'}</p>
            </div>

            {/* the SEGMENT — only the reader + the referee see the text.
                Quran text: proper font, large, never altered. */}
            {(iAmReader || !isGuest) && !readCountingDown && (
              <div key={rd.evN + rd.seg} className={`bg-[#fdf8ee] rounded-3xl border-4 border-amber-300 px-6 py-12 text-center shadow-2xl ${rd.evT === 'buzz' ? 'rb-shake' : ''}`}>
                <p dir="rtl" style={{ fontSize: 'clamp(44px, 9vw, 84px)', lineHeight: 2.3 }} className="font-quranic text-slate-900">{rd.seg}</p>
              </div>
            )}
            {!iAmReader && isGuest && (
              <div className="bg-white/10 border border-white/15 rounded-2xl px-6 py-8 text-center">
                <p className="text-white/70 font-semibold">👀 Spectating — {reader?.name ?? 'someone'} is reading…</p>
              </div>
            )}

            {/* referee buttons */}
            {!isGuest && !readCountingDown && (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={hostCorrect} style={{ ...btnBase, background: 'linear-gradient(135deg,#16a34a,#15803d)', fontSize: 20, padding: '18px 10px' }}>✓ Correct</button>
                <button onClick={hostBuzz} style={{ ...btnBase, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', fontSize: 20, padding: '18px 10px' }}>🔔 Buzz</button>
              </div>
            )}
            {!isGuest && (
              <button onClick={hostNextReader} className="w-full text-white/50 text-xs font-semibold underline">skip to next reader ▸</button>
            )}

            {/* the hero, stretching before the fight — reader's gear under it */}
            <div className="bg-white/10 border border-white/15 rounded-2xl p-3 flex flex-col items-center">
              <RBHero clip="stretch" url={RB_HEROES[myHero]?.url} className="w-44 h-52" />
              {reader && (
                <div className="flex gap-2 text-2xl mt-1">
                  {UPGRADE_META.map((u, i) => (
                    <span key={i} title={u.label} className={i < reader.upgrades ? '' : 'opacity-20 grayscale'}>{u.icon}</span>
                  ))}
                </div>
              )}
            </div>

            {/* live upgrade progress — everyone sees it */}
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Gear earned</p>
              {students.map(p => (
                <div key={p.gid} className={`flex items-center gap-2 ${p.gid === rd.turnGid ? 'bg-white/10 rounded-lg px-2 py-1 -mx-2' : ''}`}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold text-white flex-shrink-0" style={{ background: charOf(p.charKey).color }}>{(p.name || '?').charAt(0).toUpperCase()}</span>
                  <span className="text-white text-sm font-bold w-24 truncate">{p.name}</span>
                  <span className="flex gap-1 text-lg">
                    {UPGRADE_META.map((u, i) => (
                      <span key={i} className={i < p.upgrades ? '' : 'opacity-20 grayscale'}>{u.icon}</span>
                    ))}
                  </span>
                  {p.bonusAmmo > 0 && <span className="text-amber-300 text-xs font-bold">+{p.bonusAmmo} ammo</span>}
                </div>
              ))}
            </div>

            {/* upgrade celebration banner */}
            {rd.evT === 'upgrade' && reader && (
              <div key={`cele-${rd.evN}`} className="rb-pop text-center">
                <span className="inline-block bg-amber-400 text-amber-950 font-extrabold px-4 py-2 rounded-full shadow-lg">
                  🎉 {reader.name} earned: {UPGRADE_META[Math.min(reader.upgrades, MAX_UPGRADES) - 1]?.label}!
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ PRE-BATTLE countdown ══ */}
      {phase === 'preBattle' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-white/80 font-bold text-xl mb-2">⚔️ Battle begins in</p>
            <p className="text-white text-8xl font-extrabold">{battleCountLeft > 0 ? battleCountLeft : 'FIGHT!'}</p>
          </div>
        </div>
      )}

      {/* ══ BATTLE HUD ══ */}
      {phase === 'battle' && meP && meP.fighting && meP.alive && (
        <>
          {/* my stats */}
          <div className="absolute top-12 left-3 z-30 bg-black/40 rounded-xl px-3 py-2 text-white text-xs font-bold space-y-1">
            <div className="flex items-center gap-1.5">❤️ <div className="w-24 h-2 bg-white/20 rounded-full overflow-hidden"><div className="h-full bg-green-400" style={{ width: `${clamp(meP.hp, 0, 100)}%` }} /></div></div>
            {meP.armor > 0 && <div className="flex items-center gap-1.5">🦺 <div className="w-24 h-2 bg-white/20 rounded-full overflow-hidden"><div className="h-full bg-sky-300" style={{ width: `${clamp((meP.armor / BALANCE.armor) * 100, 0, 100)}%` }} /></div></div>}
          </div>
          {/* touch controls — same joystick as Letter Race */}
          {isTouch && (
            <>
              <div
                ref={joyBaseRef}
                onTouchStart={joyMove} onTouchMove={joyMove} onTouchEnd={joyEnd} onTouchCancel={joyEnd}
                className="rb-joy rb-joy-l" style={{ position: 'absolute', bottom: 30, left: 22, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.4)', zIndex: 25, touchAction: 'none' }}>
                <div ref={joyKnobRef} style={{ position: 'absolute', left: '50%', top: '50%', width: 58, height: 58, borderRadius: '50%', background: 'rgba(255,255,255,0.65)', boxShadow: '0 3px 10px rgba(0,0,0,0.35)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: -22, width: '100%', textAlign: 'center', color: '#fff', fontWeight: 900, fontSize: 11, textShadow: '0 1px 3px rgba(0,0,0,0.7)', pointerEvents: 'none' }}>MOVE</div>
              </div>
              <div
                ref={aimBaseRef}
                onTouchStart={aimMove} onTouchMove={aimMove} onTouchEnd={aimEnd} onTouchCancel={aimEnd}
                className="rb-joy rb-joy-r" style={{ position: 'absolute', bottom: 30, right: 22, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(252,165,165,0.5)', zIndex: 25, touchAction: 'none' }}>
                <div ref={aimKnobRef} style={{ position: 'absolute', left: '50%', top: '50%', width: 58, height: 58, borderRadius: '50%', background: 'rgba(254,202,202,0.7)', boxShadow: '0 3px 10px rgba(0,0,0,0.35)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: -22, width: '100%', textAlign: 'center', color: '#fff', fontWeight: 900, fontSize: 11, textShadow: '0 1px 3px rgba(0,0,0,0.7)', pointerEvents: 'none' }}>
                  {meP.upgrades >= 3 && meP.ammo > 0 ? `SHOOT · ${meP.ammo}` : meP.upgrades >= 1 ? 'KNIFE' : 'FISTS'}
                </div>
              </div>
              {meP.grenades > 0 && (
                <button
                  className="rb-nade"
                  onTouchStart={nadeTouchStart} onTouchMove={nadeTouchMove} onTouchEnd={nadeTouchEnd} onTouchCancel={nadeTouchEnd}
                  style={{ position: 'absolute', bottom: 192, right: 44, width: 66, height: 66, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', background: 'rgba(132,204,22,0.55)', color: '#fff', fontWeight: 900, fontSize: 11, touchAction: 'none', lineHeight: 1.25, zIndex: 25 }}>
                  💣<br />×{meP.grenades}
                </button>
              )}
            </>
          )}
          {!isTouch && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 bg-black/40 rounded-full px-4 py-1.5 text-white/70 text-xs font-semibold">
              WASD move · mouse aim · click {meP.upgrades >= 3 && meP.ammo > 0 ? `fire (${meP.ammo})` : meP.upgrades >= 1 ? 'knife' : 'fists'}{meP.grenades > 0 ? ` · right-click grenade (×${meP.grenades})` : ''} · ESC pause
            </div>
          )}
        </>
      )}
      {/* ══ PAUSED (ESC — everyone freezes) ══ */}
      {phase === 'battle' && paused && (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(4,20,10,0.6)' }}>
          <div className="text-center space-y-4">
            <p className="text-white text-6xl">⏸</p>
            <p className="text-white text-2xl font-extrabold">Game paused</p>
            <button onClick={requestPauseToggle} style={{ ...btnBase, background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>▶ Resume</button>
            {!isTouch && <p className="text-emerald-200/70 text-xs font-semibold">ESC resumes for everyone</p>}
          </div>
        </div>
      )}

      {/* spectator overlay (dead or referee-only) */}
      {phase === 'battle' && (!meP || !meP.fighting || !meP.alive) && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 text-center">
          <button onClick={() => setSpectateIdx(i => i + 1)} className="bg-black/50 text-white font-bold px-4 py-2 rounded-full text-sm">
            👁️ Spectating — tap to switch player
          </button>
        </div>
      )}

      {/* ══ VICTORY ══ */}
      {phase === 'victory' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-4" style={{ background: 'rgba(4,20,10,0.82)' }}>
          <div className="w-full max-w-md text-center space-y-4">
            <div className="text-7xl">🏆</div>
            <h2 className="text-3xl font-extrabold text-white">
              {winner ? `${winner.name} wins!` : 'Battle over!'}
            </h2>
            {winner && (
              <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2">
                <span className="w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-white" style={{ background: charOf(winner.charKey).color }}>{(winner.name || '?').charAt(0).toUpperCase()}</span>
                <span className="text-white font-bold">Champion 🎖️</span>
              </div>
            )}
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4 space-y-1.5 text-left">
              {fighters.map(p => (
                <div key={p.gid} className="flex items-center gap-2 text-sm text-white">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold text-white" style={{ background: charOf(p.charKey).color }}>{(p.name || '?').charAt(0).toUpperCase()}</span>
                  <span className="font-bold flex-1 truncate">{p.name}</span>
                  <span className="text-white/70">⚔️ {p.kills} · 💥 {p.dmg} dmg · 🎁 {p.upgrades} gear</span>
                </div>
              ))}
            </div>
            {!isGuest ? (
              <div className="flex gap-3 justify-center">
                <button onClick={hostPlayAgain} style={{ ...btnBase, background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>🔄 Play again</button>
                <button onClick={onExit} style={{ ...btnBase, background: 'rgba(255,255,255,0.15)' }}>Exit</button>
              </div>
            ) : (
              <p className="text-white/60 text-sm font-semibold">Waiting for the tutor…</p>
            )}
          </div>
        </div>
      )}

      {/* QR modal */}
      {qrOpen && shareLink && (
        <div onClick={() => setQrOpen(false)} className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer">
          <div className="bg-white rounded-3xl p-6">
            <QRCodeSVG value={shareLink} size={Math.min((typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 420) - 120, 380)} level="M" />
          </div>
        </div>
      )}

      <style>{`
        @keyframes rbShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(5px); } }
        .rb-shake { animation: rbShake 0.45s; }
        @keyframes rbPop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        .rb-pop { animation: rbPop 0.4s ease-out; }
        @media (max-width: 740px) {
          .rb-joy { width: 170px !important; height: 170px !important; bottom: 20px !important; }
          .rb-joy-l { left: 12px !important; }
          .rb-joy-r { right: 12px !important; }
          .rb-joy > div:first-child { width: 72px !important; height: 72px !important; }
          .rb-nade { width: 76px !important; height: 76px !important; bottom: 204px !important; right: 58px !important; font-size: 10px !important; }
        }
        @media (max-height: 480px) {
          .rb-joy { width: 140px !important; height: 140px !important; bottom: 14px !important; }
          .rb-joy-l { left: 10px !important; }
          .rb-joy-r { right: 10px !important; }
          .rb-joy > div:first-child { width: 60px !important; height: 60px !important; }
          .rb-nade { width: 62px !important; height: 62px !important; bottom: 166px !important; right: 48px !important; font-size: 9px !important; }
        }
      `}</style>
    </div>
  );
};

export default ReadingBattleGame;
