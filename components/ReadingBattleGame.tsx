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
}

interface Bullet { on: boolean; x: number; y: number; dx: number; dy: number; left: number; owner: string }
interface Nade   { on: boolean; x: number; y: number; sx: number; sy: number; tx: number; ty: number; t0: number; owner: string }
interface Fx     { on: boolean; kind: 'boom' | 'poof' | 'hit'; x: number; y: number; t0: number }

interface Snapshot {
  ph: Phase;
  players: Array<{ gid: string; nm: string; ck: string; tu: number; fi: number; lv: number; up: number; ba: number;
    x: number; y: number; h: number; hp: number; ar: number; am: number; gr: number; al: number; fz: number; k: number; d: number }>;
  rd: { tg: string; tEnd: number; seg: string; evT: string; evN: number; done: number };
  bt: { st: number; zn: number; bl: Array<[number, number]>; gn: Array<[number, number, number]> };
  wn: string;
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

const inCenter = (x: number, y: number) =>
  x >= CENTER_SQUARE.x && x <= CENTER_SQUARE.x + CENTER_SQUARE.w &&
  y >= CENTER_SQUARE.y && y <= CENTER_SQUARE.y + CENTER_SQUARE.h;

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

const UPGRADE_META = [
  { icon: '🔪', label: 'Knife' },
  { icon: '🦺', label: 'Armor' },
  { icon: '🔫', label: 'AK-47' },
  { icon: '➕', label: '+30 ammo' },
  { icon: '💣', label: 'Grenades ×3' },
];

const charOf = (key: string) => RB_CHARACTERS.find(c => c.key === key) ?? RB_CHARACTERS[0];

function newPlayer(gid: string, name: string, charKey: string, isTutor: boolean, fighting: boolean): RBPlayer {
  return {
    gid, name, charKey, isTutor, fighting,
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
  const [myChar, setMyChar] = useState<string>(RB_CHARACTERS[0].key);
  const [tutorPlays, setTutorPlays] = useState(false);
  const [joined, setJoined] = useState(false);        // guest pressed Join
  const [gotSnap, setGotSnap] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [spectateIdx, setSpectateIdx] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);

  const shareLink = onlineRoomId ? `${ONLINE_SITE_URL}/reading-battle/${onlineRoomId}` : '';

  // ── world (mutable, read by loops) ────────────────────────────────────────
  const world = useRef({
    players: [] as RBPlayer[],
    rd: { turnGid: '', tEnd: 0, seg: '', evT: '', evN: 0, done: 0, ptr: 0 },
    bt: { startedAt: 0, zoneOn: false },
    winner: '',
  });
  const bulletsRef = useRef<Bullet[]>(Array.from({ length: 48 }, () => ({ on: false, x: 0, y: 0, dx: 0, dy: 0, left: 0, owner: '' })));
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
    world.current.players = [newPlayer('host', 'Tutor', myChar, true, false)];

    ch.on('broadcast', { event: 'hello' }, ({ payload }: { payload: { gid: string; name: string; charKey: string } }) => {
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
        pl = newPlayer(gid, nm, payload.charKey, false, true);
        g.players.push(pl);
      }
      pl.charKey = RB_CHARACTERS.some(c => c.key === payload.charKey) ? payload.charKey : RB_CHARACTERS[0].key;
      setTick(t => t + 1);
    });

    ch.on('broadcast', { event: 'input' }, ({ payload }: { payload: any }) => {
      if (!payload?.gid) return;
      guestSeenRef.current.set(payload.gid, performance.now());
      const pl = world.current.players.find(q => q.gid === payload.gid);
      if (!pl) return;
      if (pl.frozenUntil) pl.frozenUntil = 0; // reconnected
      if (pl.alive && phaseRef.current === 'battle') {
        // guests own their movement (Letter Race model); host clamps + resolves walls
        const [x, y] = collideWalls(clamp(payload.x, 0, 100), clamp(payload.y, 0, 100), BALANCE.playerRadius);
        pl.x = x; pl.y = y; pl.h = payload.h ?? pl.h;
        const prev = guestActsRef.current.get(payload.gid) ?? { atk: 0, fire: 0, nade: 0 };
        const nxt = { atk: payload.atkN ?? 0, fire: payload.fireN ?? 0, nade: payload.nadeN ?? 0 };
        for (let i = prev.atk; i < nxt.atk; i++) hostMelee(pl);
        for (let i = prev.fire; i < nxt.fire; i++) hostFire(pl);
        for (let i = prev.nade; i < nxt.nade; i++) hostNade(pl);
        guestActsRef.current.set(payload.gid, nxt);
      } else {
        guestActsRef.current.set(payload.gid, { atk: payload.atkN ?? 0, fire: payload.fireN ?? 0, nade: payload.nadeN ?? 0 });
      }
    });

    ch.on('broadcast', { event: 'leave' }, ({ payload }: { payload: { gid: string } }) => {
      if (payload?.gid) removeGuest(String(payload.gid));
    });

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
          k: p.kills, d: Math.round(p.dmg),
        })),
        rd: { tg: g.rd.turnGid, tEnd: g.rd.tEnd, seg: g.rd.seg, evT: g.rd.evT, evN: g.rd.evN, done: g.rd.done },
        bt: {
          st: g.bt.startedAt, zn: g.bt.zoneOn ? 1 : 0,
          bl: bulletsRef.current.filter(b => b.on).map(b => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10] as [number, number]),
          gn: nadesRef.current.filter(n => n.on).map(n => [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10, nadeHeight(n)] as [number, number, number]),
        },
        wn: g.winner,
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
        p.level = sp.lv; p.upgrades = sp.up; p.bonusAmmo = sp.ba;
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
      // mirror projectiles for rendering
      const bl = bulletsRef.current;
      bl.forEach(b => { b.on = false; });
      s.bt.bl.slice(0, bl.length).forEach(([x, y], i) => { bl[i].on = true; bl[i].x = x; bl[i].y = y; });
      const gn = nadesRef.current;
      gn.forEach(n => { n.on = false; });
      s.bt.gn.slice(0, gn.length).forEach(([x, y], i) => { gn[i].on = true; gn[i].x = x; gn[i].y = y; });
      if (s.ph !== phaseRef.current) {
        if (s.ph === 'battle') playSfx('countdown');
        if (s.ph === 'victory') playSfx('win');
        setPhase(s.ph);
      }
      // auto-rejoin if the reaper dropped us while our phone slept
      if (!g.players.some(p => p.gid === myGid) && performance.now() - rejoinAtRef.current > 2500) {
        rejoinAtRef.current = performance.now();
        ch.send({ type: 'broadcast', event: 'hello', payload: { gid: myGid, name: myName || 'Player', charKey: myChar } });
      }
      setTick(t => t + 1);
    });
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        const hello = () => ch.send({ type: 'broadcast', event: 'hello', payload: { gid: myGid, name: myName || 'Player', charKey: myChar } });
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
  const hostFire = (pl: RBPlayer) => {
    if (!pl.alive || phaseRef.current !== 'battle') return;
    if (pl.upgrades < 3 || pl.ammo <= 0) return;
    const now = performance.now();
    if (now - pl.lastFireAt < BALANCE.ak.fireRateMs) return;
    pl.lastFireAt = now;
    pl.ammo--;
    playSfx('shot', 0.55);
    const b = bulletsRef.current.find(b => !b.on) ?? bulletsRef.current[0];
    const rad = (pl.h * Math.PI) / 180;
    b.on = true; b.owner = pl.gid;
    b.x = pl.x + Math.sin(rad) * 2.4; b.y = pl.y - Math.cos(rad) * 2.4;
    b.dx = Math.sin(rad); b.dy = -Math.cos(rad);
    b.left = BALANCE.ak.bulletRange;
  };
  const hostNade = (pl: RBPlayer) => {
    if (!pl.alive || phaseRef.current !== 'battle') return;
    if (pl.grenades <= 0) return;
    pl.grenades--;
    const n = nadesRef.current.find(n => !n.on) ?? nadesRef.current[0];
    const rad = (pl.h * Math.PI) / 180;
    n.on = true; n.owner = pl.gid; n.t0 = performance.now();
    n.sx = pl.x; n.sy = pl.y;
    n.tx = clamp(pl.x + Math.sin(rad) * BALANCE.grenade.throwDist, 3, 97);
    n.ty = clamp(pl.y - Math.cos(rad) * BALANCE.grenade.throwDist, 3, 97);
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
    g.rd.tEnd = Date.now() + READ_SECONDS * 1000 + 3400; // 3-2-1 + 15s
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
    bulletsRef.current.forEach(b => { b.on = false; });
    nadesRef.current.forEach(n => { n.on = false; });
    setPhase('preBattle');
    playSfx('countdown');
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
  const camRef = useRef({ x: 50, y: 50 });
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const blockImgRef = useRef<HTMLImageElement | null>(null);
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
  }, []);

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
        if (ph === 'battle') {
          if (!g.bt.zoneOn && Date.now() - g.bt.startedAt > BALANCE.antiStall.afterMs) g.bt.zoneOn = true;
          if (g.bt.zoneOn) {
            for (const p of g.players) {
              if (p.alive && p.fighting && !inCenter(p.x, p.y)) {
                p.hp -= BALANCE.antiStall.dps * dt;
                if (p.hp <= 0) hostEliminate(p, null);
              }
            }
          }
        }
      }

      // OWN movement (host-as-player and guests alike) during battle
      const p = me();
      if (ph === 'battle' && p && p.alive && p.fighting && !p.frozenUntil) {
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
      }

      // host: advance projectiles + resolve hits
      if (!isGuest && ph === 'battle') {
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
              applyDamage(q, BALANCE.ak.damage, g.players.find(pp => pp.gid === b.owner) ?? null);
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

  /* ── canvas painter (placeholder art, pseudo-3D walls) ──────────────────── */
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

    // ground (out-of-bounds matches the desert art edge so corners don't show void)
    ctx.fillStyle = bgImgRef.current ? '#d68c47' : '#0f2418';
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
    // centre showdown square
    ctx.fillStyle = g.bt.zoneOn ? 'rgba(74,222,128,0.16)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(px(CENTER_SQUARE.x), py(CENTER_SQUARE.y), CENTER_SQUARE.w * scale, CENTER_SQUARE.h * scale);
    if (g.bt.zoneOn) {
      // red-hot boundary walls during anti-stall
      ctx.strokeStyle = 'rgba(248,113,113,0.8)';
      ctx.lineWidth = 4 * dpr;
      ctx.strokeRect(px(0), py(0), 100 * scale, 100 * scale);
    }

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
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(X, Y + R * 0.75, R * 0.9, R * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        // capsule body (placeholder character — registry-driven colours)
        ctx.fillStyle = p.frozenUntil ? '#94a3b8' : c.color;
        ctx.strokeStyle = c.trim; ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.ellipse(X, Y, R * 0.85, R * 1.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // facing indicator
        const rad = (p.h * Math.PI) / 180;
        ctx.strokeStyle = c.trim; ctx.lineWidth = 3 * dpr;
        ctx.beginPath(); ctx.moveTo(X, Y);
        ctx.lineTo(X + Math.sin(rad) * R * 1.5, Y - Math.cos(rad) * R * 1.5); ctx.stroke();
        // face emoji
        ctx.font = `${Math.round(R * 1.0)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.emoji, X, Y - R * 0.15);
        // name + bars
        ctx.font = `bold ${Math.round(10 * dpr)}px sans-serif`;
        ctx.fillStyle = p.gid === myGid ? '#fde047' : '#ffffff';
        ctx.fillText(p.name, X, Y - R * 2.15);
        const bw = R * 2.2, bh = 4 * dpr, bx = X - bw / 2, byy = Y - R * 1.85;
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

    // projectiles above everything
    ctx.fillStyle = '#fef08a';
    for (const b of bulletsRef.current) {
      if (!b.on) continue;
      ctx.beginPath(); ctx.arc(px(b.x), py(b.y), 2.2 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    for (const n of nadesRef.current) {
      if (!n.on) continue;
      const h = nadeHeight(n);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(px(n.x), py(n.y), 3 * dpr, 1.6 * dpr, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#365314';
      ctx.beginPath(); ctx.arc(px(n.x), py(n.y - h), 3.2 * dpr, 0, Math.PI * 2); ctx.fill();
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
  };

  /* ── inputs: keyboard + joystick + action buttons ───────────────────────── */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const HANDLED = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyL'];
      if (!HANDLED.includes(e.code)) return;
      e.preventDefault();
      keysRef.current.add(e.code);
      if (e.code === 'KeyJ') doAttack();
      if (e.code === 'KeyK') doFire();
      if (e.code === 'KeyL') doNade();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doAttack = () => {
    const p = me();
    if (!p || !p.alive || phaseRef.current !== 'battle') return;
    if (isGuest) actsRef.current.atk++; else hostMelee(p);
  };
  const doFire = () => {
    const p = me();
    if (!p || !p.alive || phaseRef.current !== 'battle') return;
    if (isGuest) actsRef.current.fire++; else hostFire(p);
  };
  const doNade = () => {
    const p = me();
    if (!p || !p.alive || phaseRef.current !== 'battle') return;
    if (isGuest) actsRef.current.nade++; else hostNade(p);
  };

  const isTouch = typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches === true ||
     (((import.meta as any).env?.DEV) && (window as any).__rbForceTouch === true));
  const joyMove = (e: React.TouchEvent) => {
    const base = joyBaseRef.current;
    const t = e.touches[0];
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
  const canStart = !isGuest && students.length >= 1 && fighters.length >= 2 && assetsReady && wordsRef.current.length > 0;

  const btnBase: React.CSSProperties = { border: 'none', borderRadius: 999, padding: '13px 30px', fontWeight: 900, cursor: 'pointer', fontSize: 16, color: '#fff' };

  /* ═══════════════════════════ RENDER ═══════════════════════════ */
  return (
    <div ref={rootRef} className="fixed inset-0 z-[9999] overflow-hidden select-none" style={{ background: 'linear-gradient(160deg,#071a10 0%,#0d2b1a 60%,#123a22 100%)', touchAction: phase === 'battle' ? 'none' : undefined }}>

      {/* battle canvas (always mounted; painter only draws in battle phases) */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ display: phase === 'preBattle' || phase === 'battle' || phase === 'victory' ? 'block' : 'none' }} />

      {/* ── top bar ── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-2 px-3 py-2" style={{ background: 'linear-gradient(rgba(4,20,10,0.7), rgba(4,20,10,0))' }}>
        <button onClick={onExit} style={{ background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', borderRadius: 10, padding: '7px 12px', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>✕ Exit</button>
        <span className="text-white font-extrabold text-sm sm:text-base">📖⚔️ Reading Battle</span>
        {phase === 'battle' && world.current.bt.zoneOn && (
          <span className="text-red-300 text-xs font-bold animate-pulse">🔥 Move to the centre!</span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {fighters.map(p => (
            <span key={p.gid} title={p.name}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border-2 ${p.alive ? 'border-white/70' : 'border-white/20 opacity-40'}`}
              style={{ background: charOf(p.charKey).color }}>
              {charOf(p.charKey).emoji}
            </span>
          ))}
        </span>
      </div>

      {/* ══ LOBBY ══ */}
      {phase === 'lobby' && (
        <div className="absolute inset-0 z-20 overflow-y-auto flex items-start justify-center pt-14 pb-8 px-4">
          <div className="w-full max-w-md space-y-4">
            <div className="text-center">
              <h1 className="text-2xl font-extrabold text-white">📖 Read → earn gear → ⚔️ battle!</h1>
              <p className="text-emerald-200/80 text-sm mt-1">Up to {MAX_PLAYERS} fighters · tutor is the referee</p>
            </div>

            {/* name + character */}
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4 space-y-3">
              <input
                value={myName}
                onChange={e => setMyName(e.target.value.slice(0, 14))}
                placeholder={isGuest ? 'Your name…' : 'Your name (tutor)…'}
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <div className="grid grid-cols-4 gap-2">
                {RB_CHARACTERS.map(c => (
                  <button key={c.key} onClick={() => setMyChar(c.key)}
                    className={`rounded-xl p-2 flex flex-col items-center gap-1 border-2 transition-all ${myChar === c.key ? 'border-white scale-105' : 'border-transparent opacity-75'}`}
                    style={{ background: c.color }}>
                    <span className="text-2xl">{c.emoji}</span>
                    <span className="text-[10px] font-bold text-white/90">{c.name}</span>
                  </button>
                ))}
              </div>
              {!isGuest && (
                <label className="flex items-center gap-2 text-white/90 text-sm font-semibold cursor-pointer">
                  <input type="checkbox" checked={tutorPlays} onChange={e => {
                    setTutorPlays(e.target.checked);
                    const t = world.current.players.find(p => p.gid === 'host');
                    if (t) { t.fighting = e.target.checked; t.name = myName || 'Tutor'; t.charKey = myChar; }
                  }} className="w-4 h-4 rounded" />
                  I'm playing too (referee + fighter)
                </label>
              )}
            </div>

            {/* share (host) / join (guest) */}
            {!isGuest ? (
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Invite students</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={shareLink} className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/30 text-emerald-100 text-xs font-mono" />
                  <button onClick={() => { try { navigator.clipboard?.writeText(shareLink); } catch { /* */ } setLinkCopied(true); window.setTimeout(() => setLinkCopied(false), 1500); }}
                    className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold whitespace-nowrap">{linkCopied ? '✓ Copied' : 'Copy link'}</button>
                  <button onClick={() => setQrOpen(true)} className="px-3 py-2 rounded-lg bg-white text-slate-800 text-xs font-bold">QR</button>
                </div>
              </div>
            ) : (
              !joined && (
                <button
                  onClick={() => { ensureAc().resume?.(); setJoined(true); }}
                  disabled={!myName.trim()}
                  style={{ ...btnBase, width: '100%', background: myName.trim() ? 'linear-gradient(135deg,#f97316,#ea580c)' : '#47556988', cursor: myName.trim() ? 'pointer' : 'default' }}>
                  🔗 Join the battle!
                </button>
              )
            )}
            {isGuest && joined && (
              <p className="text-center text-emerald-200 text-sm font-semibold">
                {gotSnap ? '✅ Connected — waiting for the tutor to start…' : '⏳ Joining…'}
              </p>
            )}

            {/* roster */}
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-2">
                Players ({fighters.length}/{MAX_PLAYERS})
              </p>
              {players.length === 0 && <p className="text-white/50 text-sm">Waiting…</p>}
              <div className="space-y-1.5">
                {players.map(p => (
                  <div key={p.gid} className="flex items-center gap-2 text-white text-sm font-semibold">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: charOf(p.charKey).color }}>{charOf(p.charKey).emoji}</span>
                    <span>{p.gid === 'host' ? (myName || 'Tutor') : p.name}</span>
                    {p.isTutor && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/30 text-amber-200 font-bold">{p.fighting ? 'REFEREE + FIGHTER' : 'REFEREE'}</span>}
                  </div>
                ))}
              </div>
            </div>

            {!isGuest && (
              <button onClick={() => { ensureAc().resume?.(); playSfx('countdown', 0.4); const t = world.current.players.find(p => p.gid === 'host'); if (t) { t.name = myName || 'Tutor'; t.charKey = myChar; t.fighting = tutorPlays; } setPhase('levels'); }}
                disabled={!canStart}
                style={{ ...btnBase, width: '100%', background: canStart ? 'linear-gradient(135deg,#16a34a,#15803d)' : '#47556988', cursor: canStart ? 'pointer' : 'default' }}>
                {assetsReady && wordsRef.current.length > 0
                  ? (fighters.length >= 2 ? 'Start — set levels ▶' : 'Need at least 2 fighters…')
                  : '⏳ Loading sounds & verses…'}
              </button>
            )}
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
                  <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: charOf(p.charKey).color }}>{charOf(p.charKey).emoji}</span>
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
                <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: charOf(reader?.charKey ?? '').color }}>{charOf(reader?.charKey ?? '').emoji}</span>
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
              <div key={rd.evN + rd.seg} className={`bg-[#fdf8ee] rounded-3xl border-4 border-amber-300 px-6 py-10 text-center shadow-2xl ${rd.evT === 'buzz' ? 'rb-shake' : ''}`}>
                <p style={{ ...HAFS, fontSize: 'clamp(34px, 7vw, 64px)', lineHeight: 2 }} className="text-slate-900">{rd.seg}</p>
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

            {/* live upgrade progress — everyone sees it */}
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Gear earned</p>
              {students.map(p => (
                <div key={p.gid} className={`flex items-center gap-2 ${p.gid === rd.turnGid ? 'bg-white/10 rounded-lg px-2 py-1 -mx-2' : ''}`}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0" style={{ background: charOf(p.charKey).color }}>{charOf(p.charKey).emoji}</span>
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
                className="rb-joy" style={{ position: 'absolute', bottom: 30, left: 22, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.4)', zIndex: 25, touchAction: 'none' }}>
                <div ref={joyKnobRef} style={{ position: 'absolute', left: '50%', top: '50%', width: 58, height: 58, borderRadius: '50%', background: 'rgba(255,255,255,0.65)', boxShadow: '0 3px 10px rgba(0,0,0,0.35)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: -22, width: '100%', textAlign: 'center', color: '#fff', fontWeight: 900, fontSize: 11, textShadow: '0 1px 3px rgba(0,0,0,0.7)', pointerEvents: 'none' }}>MOVE</div>
              </div>
              <div className="rb-actions" style={{ position: 'absolute', bottom: 40, right: 22, display: 'flex', gap: 12, zIndex: 25 }}>
                <button onTouchStart={doAttack} onMouseDown={doAttack}
                  style={{ width: 70, height: 70, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', background: 'rgba(239,68,68,0.5)', color: '#fff', fontWeight: 900, fontSize: 11, touchAction: 'none', lineHeight: 1.25 }}>
                  {meP.upgrades >= 1 ? '🔪' : '👊'}<br />{meP.upgrades >= 1 ? 'KNIFE' : 'FISTS'}
                </button>
                {meP.upgrades >= 3 && (
                  <button onTouchStart={doFire} onMouseDown={doFire}
                    style={{ width: 70, height: 70, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', background: 'rgba(245,158,11,0.55)', color: '#fff', fontWeight: 900, fontSize: 11, touchAction: 'none', lineHeight: 1.25 }}>
                    🔫<br />{meP.ammo}
                  </button>
                )}
                {meP.grenades > 0 && (
                  <button onTouchStart={doNade} onMouseDown={doNade}
                    style={{ width: 70, height: 70, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.5)', background: 'rgba(132,204,22,0.5)', color: '#fff', fontWeight: 900, fontSize: 11, touchAction: 'none', lineHeight: 1.25 }}>
                    💣<br />×{meP.grenades}
                  </button>
                )}
              </div>
            </>
          )}
          {!isTouch && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 bg-black/40 rounded-full px-4 py-1.5 text-white/70 text-xs font-semibold">
              WASD move · J {meP.upgrades >= 1 ? 'knife' : 'fists'}{meP.upgrades >= 3 ? ` · K fire (${meP.ammo})` : ''}{meP.grenades > 0 ? ` · L grenade (×${meP.grenades})` : ''}
            </div>
          )}
        </>
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
                <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: charOf(winner.charKey).color }}>{charOf(winner.charKey).emoji}</span>
                <span className="text-white font-bold">{charOf(winner.charKey).name}</span>
              </div>
            )}
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4 space-y-1.5 text-left">
              {fighters.map(p => (
                <div key={p.gid} className="flex items-center gap-2 text-sm text-white">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ background: charOf(p.charKey).color }}>{charOf(p.charKey).emoji}</span>
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
          .rb-joy { width: 170px !important; height: 170px !important; bottom: 20px !important; left: 12px !important; }
          .rb-joy > div:first-child { width: 72px !important; height: 72px !important; }
          .rb-actions { bottom: 26px !important; right: 12px !important; gap: 8px !important; }
          .rb-actions button { width: 76px !important; height: 76px !important; font-size: 10px !important; }
        }
        @media (max-height: 480px) {
          .rb-joy { width: 140px !important; height: 140px !important; bottom: 14px !important; left: 10px !important; }
          .rb-joy > div:first-child { width: 60px !important; height: 60px !important; }
          .rb-actions button { width: 64px !important; height: 64px !important; font-size: 9px !important; }
        }
      `}</style>
    </div>
  );
};

export default ReadingBattleGame;
