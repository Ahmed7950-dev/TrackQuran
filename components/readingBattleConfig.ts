// ─────────────────────────────────────────────────────────────────────────────
// Reading Battle — ALL content and balance in one place.
// Characters, sounds, verses, arena walls and combat numbers are data here so
// real assets later are a pure swap with zero gameplay-code changes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Reading phase ────────────────────────────────────────────────────────────
export const READ_SECONDS = 30;          // per-student reading turn
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
  moveSpeed: 15,            // arena units / second
  playerRadius: 2.0,
  antiStall: { afterMs: 90_000, dps: 2 },   // outside the centre square
  battleCountdownMs: 3400,
  frozenGraceMs: 10_000,    // disconnected player is killable, then eliminated
};

// ── Arena (100 × 100 units) ──────────────────────────────────────────────────
// Flat background art is separate from collisions: swap BG_IMAGE for AI art
// later, the walls below stay authoritative for gameplay.
export const ARENA_BG_IMAGE: string | null = '/rb/arena-bg.png';
/** Brawl-Stars-style obstacles: one 3D block sprite (pre-rendered from the
 *  user's Tripo model via Blender, front-top ortho) tiled onto WALL_TILES.
 *  Collision rects and the per-tile draw list both DERIVE from the map below,
 *  so art and physics always match. Edit the map freely: '#' = block.
 *  Constraints: keep the border ring open, spawn tiles + 1-tile margin open,
 *  and every open tile connected (the map below is validated for all three). */
export const BLOCK_SPRITE: string | null = '/rb/block.png';
export const BLOCK_ASPECT = 400 / 256;   // sprite height / width
export const TILE = 4;                    // arena units per tile (25 x 25 grid)
export const WALL_TILES: string[] = [
  '.........................',
  '.........................',
  '...##.....#...#.....##...',
  '...##.....#...#.....##...',
  '.........................',
  '.#....##...#.#...##....#.',
  '.#....##.........##....#.',
  '..........#...#..........',
  '....#.....#...#.....#....',
  '....#...............#....',
  '.......##.......##.......',
  '..#...................#..',
  '..#...#...........#...#..',
  '..#...................#..',
  '.......##.......##.......',
  '....#...............#....',
  '....#.....#...#.....#....',
  '..........#...#..........',
  '.#....##.........##....#.',
  '.#....##...#.#...##....#.',
  '.........................',
  '...##.....#...#.....##...',
  '...##.....#...#.....##...',
  '.........................',
  '.........................',
];

export interface WallRect { x: number; y: number; w: number; h: number }

/** Every block tile's arena-unit origin — one sprite drawn per entry,
 *  y-sorted with the players for real 2.5D occlusion. */
export const WALL_TILE_LIST: Array<{ x: number; y: number }> = [];
for (let r = 0; r < WALL_TILES.length; r++) {
  for (let c = 0; c < WALL_TILES[r].length; c++) {
    if (WALL_TILES[r][c] === '#') WALL_TILE_LIST.push({ x: c * TILE, y: r * TILE });
  }
}

/** Collision truth — greedy-merged rects over the same map. */
export const WALLS: WallRect[] = (() => {
  const rows = WALL_TILES.length, cols = WALL_TILES[0].length;
  const used = WALL_TILES.map(row => row.split('').map(() => false));
  const rects: WallRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (WALL_TILES[r][c] !== '#' || used[r][c]) continue;
      let w = 1;
      while (c + w < cols && WALL_TILES[r][c + w] === '#' && !used[r][c + w]) w++;
      let h = 1;
      outer: while (r + h < rows) {
        for (let i = 0; i < w; i++) if (WALL_TILES[r + h][c + i] !== '#' || used[r + h][c + i]) break outer;
        h++;
      }
      for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) used[r + dr][c + dc] = true;
      rects.push({ x: c * TILE, y: r * TILE, w: w * TILE, h: h * TILE });
    }
  }
  return rects;
})();

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

/** The tech-gun prop in the soldier's hand — user-tuned on the /gun-tune bench. */
export const RB_GUN = {
  url: '/rb/gun.glb?v=1', bone: 'mixamorigRightHand',
  s: 74, x: -16.5, y: 22, z: 6.5, rx: 3.1416, ry: 0, rz: -1.5708,
  muzzle: [0.5, 0.4, 0] as [number, number, number],
};

/** Where fire leaves the gun (user-tuned on the /gun-tune bench).
 *  forward = arena units ahead of the player along the aim,
 *  side    = units toward the character's RIGHT of the aim,
 *  lift    = visual height of the bullet track + aim line. */
export const RB_FIRE = {
  forward: 2.4,
  side: 0,
  lift: 1.2,
};
