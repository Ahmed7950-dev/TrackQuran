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
export const ARENA_BG_IMAGE: string | null = '/rb/arena-bg.png';
/** Wall ART layered over the background. Pure visuals — the WALLS rects below
 *  are the collision truth, GENERATED from this image's alpha channel so art
 *  and physics always match. Regenerate with scratchpad walls_extract.mjs when
 *  the art changes. */
export const ARENA_WALLS_IMAGE: string | null = '/rb/arena-walls.png';

export interface WallRect { x: number; y: number; w: number; h: number }
/** Collision rects — GENERATED from arena-walls.png alpha (walls_extract.mjs).
 *  Do not hand-edit; regenerate when the walls art changes. */
export const WALLS: WallRect[] = [
  { x: 5, y: 22, w: 17, h: 4 },
  { x: 29, y: 22, w: 12, h: 4 },
  { x: 42, y: 22, w: 3, h: 4 },
  { x: 54, y: 22, w: 3, h: 4 },
  { x: 58, y: 22, w: 14, h: 3 },
  { x: 78, y: 22, w: 17, h: 4 },
  { x: 59, y: 25, w: 13, h: 1 },
  { x: 5, y: 26, w: 2, h: 11 },
  { x: 15, y: 26, w: 3, h: 6 },
  { x: 20, y: 26, w: 2, h: 13 },
  { x: 25, y: 26, w: 6, h: 4 },
  { x: 43, y: 26, w: 2, h: 7 },
  { x: 54, y: 26, w: 2, h: 6 },
  { x: 70, y: 26, w: 6, h: 4 },
  { x: 78, y: 26, w: 2, h: 13 },
  { x: 84, y: 26, w: 2, h: 7 },
  { x: 92, y: 26, w: 3, h: 11 },
  { x: 11, y: 28, w: 4, h: 5 },
  { x: 34, y: 28, w: 9, h: 5 },
  { x: 56, y: 28, w: 10, h: 5 },
  { x: 86, y: 28, w: 3, h: 5 },
  { x: 66, y: 29, w: 1, h: 8 },
  { x: 76, y: 29, w: 1, h: 7 },
  { x: 25, y: 30, w: 2, h: 7 },
  { x: 74, y: 30, w: 2, h: 7 },
  { x: 24, y: 31, w: 1, h: 5 },
  { x: 7, y: 32, w: 1, h: 5 },
  { x: 15, y: 32, w: 2, h: 1 },
  { x: 55, y: 32, w: 1, h: 1 },
  { x: 8, y: 33, w: 5, h: 4 },
  { x: 27, y: 33, w: 10, h: 4 },
  { x: 64, y: 33, w: 2, h: 4 },
  { x: 67, y: 33, w: 7, h: 4 },
  { x: 87, y: 33, w: 5, h: 4 },
  { x: 13, y: 35, w: 7, h: 4 },
  { x: 80, y: 35, w: 7, h: 4 },
  { x: 11, y: 37, w: 2, h: 8 },
  { x: 87, y: 37, w: 2, h: 8 },
  { x: 2, y: 40, w: 9, h: 5 },
  { x: 26, y: 40, w: 5, h: 5 },
  { x: 69, y: 40, w: 5, h: 5 },
  { x: 89, y: 40, w: 9, h: 5 },
  { x: 74, y: 44, w: 1, h: 5 },
  { x: 2, y: 45, w: 2, h: 14 },
  { x: 17, y: 45, w: 11, h: 4 },
  { x: 72, y: 45, w: 2, h: 4 },
  { x: 75, y: 45, w: 9, h: 4 },
  { x: 96, y: 45, w: 2, h: 14 },
  { x: 20, y: 49, w: 3, h: 4 },
  { x: 78, y: 49, w: 3, h: 3 },
  { x: 98, y: 50, w: 1, h: 7 },
  { x: 78, y: 52, w: 2, h: 2 },
  { x: 21, y: 53, w: 1, h: 1 },
  { x: 4, y: 55, w: 11, h: 4 },
  { x: 20, y: 55, w: 2, h: 8 },
  { x: 79, y: 55, w: 1, h: 8 },
  { x: 85, y: 55, w: 11, h: 4 },
  { x: 15, y: 56, w: 1, h: 15 },
  { x: 22, y: 56, w: 1, h: 7 },
  { x: 78, y: 56, w: 1, h: 7 },
  { x: 80, y: 56, w: 1, h: 6 },
  { x: 13, y: 59, w: 2, h: 12 },
  { x: 23, y: 59, w: 6, h: 4 },
  { x: 70, y: 59, w: 8, h: 4 },
  { x: 85, y: 59, w: 2, h: 12 },
  { x: 29, y: 60, w: 1, h: 8 },
  { x: 2, y: 62, w: 8, h: 4 },
  { x: 90, y: 62, w: 8, h: 4 },
  { x: 10, y: 63, w: 1, h: 8 },
  { x: 27, y: 63, w: 2, h: 1 },
  { x: 70, y: 63, w: 3, h: 1 },
  { x: 89, y: 63, w: 1, h: 8 },
  { x: 28, y: 64, w: 1, h: 4 },
  { x: 30, y: 64, w: 7, h: 4 },
  { x: 64, y: 64, w: 8, h: 4 },
  { x: 2, y: 66, w: 2, h: 15 },
  { x: 8, y: 66, w: 2, h: 4 },
  { x: 90, y: 66, w: 2, h: 4 },
  { x: 96, y: 66, w: 2, h: 15 },
  { x: 11, y: 67, w: 2, h: 4 },
  { x: 16, y: 67, w: 6, h: 4 },
  { x: 78, y: 67, w: 7, h: 4 },
  { x: 87, y: 67, w: 2, h: 4 },
  { x: 35, y: 68, w: 4, h: 4 },
  { x: 40, y: 68, w: 1, h: 5 },
  { x: 63, y: 68, w: 3, h: 3 },
  { x: 39, y: 69, w: 1, h: 4 },
  { x: 41, y: 69, w: 4, h: 4 },
  { x: 55, y: 69, w: 8, h: 4 },
  { x: 9, y: 70, w: 1, h: 1 },
  { x: 26, y: 70, w: 4, h: 4 },
  { x: 70, y: 70, w: 4, h: 4 },
  { x: 90, y: 70, w: 1, h: 1 },
  { x: 20, y: 71, w: 2, h: 10 },
  { x: 30, y: 71, w: 1, h: 3 },
  { x: 63, y: 71, w: 2, h: 2 },
  { x: 78, y: 71, w: 2, h: 10 },
  { x: 36, y: 72, w: 3, h: 1 },
  { x: 98, y: 72, w: 1, h: 7 },
  { x: 12, y: 73, w: 5, h: 3 },
  { x: 43, y: 73, w: 2, h: 7 },
  { x: 55, y: 73, w: 2, h: 8 },
  { x: 84, y: 73, w: 5, h: 3 },
  { x: 26, y: 74, w: 2, h: 7 },
  { x: 72, y: 74, w: 2, h: 7 },
  { x: 83, y: 74, w: 1, h: 7 },
  { x: 4, y: 76, w: 1, h: 5 },
  { x: 11, y: 76, w: 3, h: 5 },
  { x: 16, y: 76, w: 1, h: 4 },
  { x: 28, y: 76, w: 1, h: 5 },
  { x: 42, y: 76, w: 1, h: 5 },
  { x: 71, y: 76, w: 1, h: 5 },
  { x: 80, y: 76, w: 1, h: 5 },
  { x: 86, y: 76, w: 3, h: 4 },
  { x: 5, y: 77, w: 6, h: 4 },
  { x: 17, y: 77, w: 3, h: 4 },
  { x: 29, y: 77, w: 10, h: 4 },
  { x: 41, y: 77, w: 1, h: 3 },
  { x: 57, y: 77, w: 1, h: 4 },
  { x: 60, y: 77, w: 11, h: 4 },
  { x: 81, y: 77, w: 2, h: 4 },
  { x: 89, y: 77, w: 7, h: 4 },
  { x: 43, y: 80, w: 1, h: 1 },
  { x: 87, y: 80, w: 2, h: 1 },
];

/** Centre showdown square — no walls inside; the anti-stall zone spares it. */
export const CENTER_SQUARE = { x: 36, y: 27, w: 28, h: 43 }; // the brick square in the background art

/** Far-apart spawn points (assigned randomly). */
export const SPAWNS: Array<{ x: number; y: number }> = [
  { x: 7,  y: 7 },
  { x: 93, y: 7 },
  { x: 7,  y: 93 },
  { x: 93, y: 93 },
  { x: 50, y: 5 },
];

export const MAX_PLAYERS = 5;
