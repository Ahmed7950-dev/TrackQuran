// ─────────────────────────────────────────────────────────────────────────────
// Reading Battle — ALL content and balance in one place.
// Characters, sounds, verses, arena walls and combat numbers are data here so
// real assets later are a pure swap with zero gameplay-code changes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Reading phase ────────────────────────────────────────────────────────────
export const READ_SECONDS = 15;          // per-student reading turn
export const MAX_UPGRADES = 5;
export const BONUS_AMMO_PER_EXTRA = 10;  // each Correct beyond 5 (needs the AK)

/** Surahs drawn on for reading segments, in order. Fetched at lobby time from
 *  the same Uthmani source the rest of the app uses (api.quran.com v4), so the
 *  text is never re-typed here. Edit freely — content, not code. */
export const VERSE_SURAHS: number[] = [1, 112, 113, 114, 110, 108, 107, 106, 105, 103];

// ── Characters (placeholder capsules — swap via this registry only) ──────────
// `sprite` may later point to an image; the renderer uses it when present and
// falls back to the coloured capsule when null.
export interface RBCharacter {
  key: string;
  name: string;
  color: string;    // capsule body
  trim: string;     // darker shade (head/outline)
  emoji: string;    // face badge on the capsule + selector chip
  sprite: string | null;
}
export const RB_CHARACTERS: RBCharacter[] = [
  { key: 'scout',   name: 'Scout',   color: '#38bdf8', trim: '#0369a1', emoji: '🐺', sprite: null },
  { key: 'ranger',  name: 'Ranger',  color: '#34d399', trim: '#047857', emoji: '🦅', sprite: null },
  { key: 'blaze',   name: 'Blaze',   color: '#f97316', trim: '#9a3412', emoji: '🦊', sprite: null },
  { key: 'bolt',    name: 'Bolt',    color: '#facc15', trim: '#a16207', emoji: '⚡', sprite: null },
  { key: 'shadow',  name: 'Shadow',  color: '#a78bfa', trim: '#5b21b6', emoji: '🐈', sprite: null },
  { key: 'rocky',   name: 'Rocky',   color: '#94a3b8', trim: '#334155', emoji: '🐻', sprite: null },
  { key: 'coral',   name: 'Coral',   color: '#fb7185', trim: '#9f1239', emoji: '🦩', sprite: null },
  { key: 'mint',    name: 'Mint',    color: '#2dd4bf', trim: '#115e59', emoji: '🐢', sprite: null },
];

// ── Sounds (null → synthesized placeholder; set a URL for a real file) ───────
export const RB_SOUNDS: Record<string, string | null> = {
  countdown: null,   // short beep per tick
  correct:   null,   // rising chime
  buzz:      null,   // harsh buzz
  upgrade:   null,   // fanfare
  shot:      null,   // AK shot
  melee:     null,   // swing
  boom:      null,   // grenade
  poof:      null,   // elimination
  win:       null,   // victory fanfare
};

// ── Battle balance (spec §7.2 — tune freely) ─────────────────────────────────
export const BALANCE = {
  health: 100,
  armor: 50,
  fists:   { damage: 5,  range: 3.2, cooldownMs: 500 },
  knife:   { damage: 15, range: 4.2, cooldownMs: 380 },
  ak:      { damage: 10, magazine: 30, extraAmmo: 30, fireRateMs: 165, bulletSpeed: 90, bulletRange: 60 },
  grenade: { count: 3, damageCenter: 40, damageEdge: 10, radius: 11, throwDist: 16, flightMs: 700, fuseMs: 2000 },
  moveSpeed: 22,            // arena units / second
  playerRadius: 2.0,
  antiStall: { afterMs: 90_000, dps: 2 },   // outside the centre square
  battleCountdownMs: 3400,
  frozenGraceMs: 10_000,    // disconnected player is killable, then eliminated
};

// ── Arena (100 × 100 units) ──────────────────────────────────────────────────
// Flat background art is separate from collisions: swap BG_IMAGE for AI art
// later, the walls below stay authoritative for gameplay.
export const ARENA_BG_IMAGE: string | null = null;

export interface WallRect { x: number; y: number; w: number; h: number }
/** Maze: outer boundary + inner walls; the centre square (38–62) stays OPEN. */
export const WALLS: WallRect[] = [
  // outer boundary
  { x: 0,  y: 0,  w: 100, h: 2 },
  { x: 0,  y: 98, w: 100, h: 2 },
  { x: 0,  y: 0,  w: 2,   h: 100 },
  { x: 98, y: 0,  w: 2,   h: 100 },
  // corner rooms
  { x: 14, y: 14, w: 16, h: 3 },
  { x: 14, y: 14, w: 3,  h: 12 },
  { x: 70, y: 14, w: 16, h: 3 },
  { x: 83, y: 14, w: 3,  h: 12 },
  { x: 14, y: 83, w: 16, h: 3 },
  { x: 14, y: 74, w: 3,  h: 12 },
  { x: 70, y: 83, w: 16, h: 3 },
  { x: 83, y: 74, w: 3,  h: 12 },
  // mid-edge baffles
  { x: 47, y: 8,  w: 6,  h: 3 },
  { x: 47, y: 89, w: 6,  h: 3 },
  { x: 8,  y: 47, w: 3,  h: 6 },
  { x: 89, y: 47, w: 3,  h: 6 },
  // inner ring pieces framing the open centre (38–62 free)
  { x: 30, y: 30, w: 12, h: 3 },
  { x: 58, y: 30, w: 12, h: 3 },
  { x: 30, y: 67, w: 12, h: 3 },
  { x: 58, y: 67, w: 12, h: 3 },
  { x: 30, y: 33, w: 3,  h: 10 },
  { x: 67, y: 33, w: 3,  h: 10 },
  { x: 30, y: 57, w: 3,  h: 10 },
  { x: 67, y: 57, w: 3,  h: 10 },
];

/** Centre showdown square — no walls inside; the anti-stall zone spares it. */
export const CENTER_SQUARE = { x: 38, y: 38, w: 24, h: 24 };

/** Far-apart spawn points (assigned randomly). */
export const SPAWNS: Array<{ x: number; y: number }> = [
  { x: 7,  y: 7 },
  { x: 93, y: 7 },
  { x: 7,  y: 93 },
  { x: 93, y: 93 },
  { x: 50, y: 5 },
];

export const MAX_PLAYERS = 5;
