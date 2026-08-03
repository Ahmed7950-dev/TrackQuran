// ─────────────────────────────────────────────────────────────────────────────
// Reading Battle — ALL content and balance in one place.
// Characters, sounds, verses, arena walls and combat numbers are data here so
// real assets later are a pure swap with zero gameplay-code changes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Reading phase ────────────────────────────────────────────────────────────
export const READ_SECONDS = 30;          // per-student reading turn
export const MAX_UPGRADES = 5;
export const BONUS_AMMO_PER_EXTRA = 10;  // each Correct beyond 5 (needs the AK)

/** Surahs drawn on for reading segments. Fetched at lobby time from the same
 *  Uthmani source the rest of the app uses (api.quran.com v4), so the text is
 *  never re-typed here. Edit freely — content, not code.
 *  MIDDLE-of-the-Quran surahs on purpose: Al-Fatiha and the short end surahs
 *  are recited from memory, which defeats a READING challenge — these force
 *  the student to actually read. The host shuffles the order per game, so each
 *  battle opens in a different surah. */
export const VERSE_SURAHS: number[] = [12, 16, 21, 23, 25, 27, 29, 31, 35, 42];

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
  shot:      '/rb/sfx/bullet.m4a',   // AK shot (user's bullet.wav)
  melee:     null,   // swing
  boom:      '/rb/sfx/grenade.m4a',  // grenade explosion (user's grenade.flac)
  poof:      null,   // elimination
  win:       null,   // victory fanfare
  wounded:   '/rb/sfx/wounded.m4a',  // a player takes a hit (user's wounded.wav)
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
  /** The bat-cloud storm (Brawl-Stars poison): after startMs, one RING of
   *  cloud tiles pops in every stepMs — the outermost row/column of the map
   *  first, then the next one in, and so on until only the centre courtyard
   *  is left. Standing on a clouded tile burns dps (armor is bypassed). */
  storm: { startMs: 45_000, stepMs: 9_000, dps: 3 },
  battleCountdownMs: 3400,
  frozenGraceMs: 10_000,    // disconnected player is killable, then eliminated
};

// ── Arena (100 × 100 units) ──────────────────────────────────────────────────
// Flat background art is separate from collisions: swap BG_IMAGE for AI art
// later, the walls below stay authoritative for gameplay.
export const ARENA_BG_IMAGE: string | null = '/rb/arena-bg.png?v=2';
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

/** Storm geometry, in TILE units of the same 25×25 grid the blocks use.
 *  RINGS = how many rows the cloud eats before it stops (10 leaves tiles
 *  10..14 open ≈ the centre courtyard). PAD = extra cloud rows drawn beyond
 *  the arena edge so the storm reads as arriving from outside the map. */
export const STORM_RINGS = 10;
export const STORM_PAD = 5;

/** Centre showdown square — no walls inside; the anti-stall zone spares it. */
export const CENTER_SQUARE = { x: 41, y: 39, w: 18, h: 22 }; // the brick courtyard in the v2 background art (measured)

/** Far-apart spawn points (assigned randomly). */
export const SPAWNS: Array<{ x: number; y: number }> = [
  { x: 7,  y: 7 },
  { x: 93, y: 7 },
  { x: 7,  y: 93 },
  { x: 93, y: 93 },
  { x: 50, y: 5 },
];

export const MAX_PLAYERS = 5;

/** Playable characters — each GLB carries the same clip set (stretch/run/idle)
 *  on a mixamorig skeleton, and each carries its own gun attachment (hand bone
 *  + transform + muzzle marker), tunable on /gun-tune. */
export const RB_HEROES = [
  {
    key: 'soldier', name: 'Soldier', url: '/rb/hero.glb?v=4',
    gun: { bone: 'mixamorigRightHand', s: 74, x: -16.5, y: 22, z: 6.5, rx: 3.1416, ry: 0, rz: -1.5708, muzzle: [0.5, 0.4, 0] as [number, number, number] },
  },
  {
    // the Titan is roughly half the soldier's bone-space height, so his gun
    // numbers are about half the soldier's
    key: 'titan', name: 'Titan', url: '/rb/titan.glb?v=7',
    gun: { bone: 'mixamorigRightHand', s: 34, x: -7.7, y: 10.3, z: 3, rx: 3.1416, ry: 0, rz: -1.5708, muzzle: [0.5, 0.4, 0] as [number, number, number] },
  },
  {
    // same Mixamo pipeline as the Titan (embedded Shoot Rifle walk + hero.glb
    // stretch retarget), so it shares his gun numbers
    key: 'frost', name: 'Frost', url: '/rb/frost.glb?v=1',
    gun: { bone: 'mixamorigRightHand', s: 34, x: -7.7, y: 10.3, z: 3, rx: 3.1416, ry: 0, rz: -1.5708, muzzle: [0.5, 0.4, 0] as [number, number, number] },
  },
];

/** Back-compat alias: the Soldier's gun attachment (must stay BELOW RB_HEROES
 *  — an alias above the declaration builds fine but breaks at runtime). */
export const RB_GUN = { url: '/rb/gun.glb?v=1', ...RB_HEROES[0].gun };

// ── Zombie mode ──────────────────────────────────────────────────────────────
/** The horde model. Its punch clip is named 'tackle' so it slots straight into
 *  the stage's existing anim union — no renderer change needed. */
export const ZOMBIE_GLB = '/rb/zombie.glb?v=1';
/** How many zombies get a real 3D body. Beyond this the horde still fights and
 *  is drawn on the 2D canvas — this only caps skinned meshes on screen. */
export const ZOMBIE_MODELS = 14;

export const ZOMBIES = {
  firstWaveMs: 5_000,      // grace after the countdown before wave 1 walks in
  waveGapMs: 16_000,       // next wave regardless of how the last one went
  countBase: 2,            // wave N spawns countBase + N*countPerWave (wave 1 = 4)
  countPerWave: 2,
  maxAlive: 34,
  hpBase: 40,              // wave N zombie has hpBase + N*hpPerWave
  hpPerWave: 14,
  speedWalk: 5,            // arena units/s while heading for the centre
  speedChase: 8,           // once it has seen a player (player runs at 15)
  speedPerWave: 0.4,       // both speeds grow a little each wave
  speedMax: 13.5,          // never faster than a sprinting player
  sightRange: 24,
  attackRange: 3.4,
  // a swarm stacks: four in contact is already ~29 dps, so keep the single
  // bite modest — players are meant to lose ground slowly, not evaporate
  attackDamage: 8,
  attackCooldownMs: 1100,
  spawnMargin: 3,          // how far outside the arena edge they walk in from
};

/** Crates that drop around the map in zombie mode. `amount` is per pickup. */
export const PICKUPS = [
  { key: 'ammo',    name: 'Ammo',    sprite: '/rb/pickups/ammo.png',    amount: 30, color: '#f59e0b' },
  { key: 'health',  name: 'Health',  sprite: '/rb/pickups/health.png',  amount: 40, color: '#ef4444' },
  { key: 'grenade', name: 'Grenade', sprite: '/rb/pickups/grenade.png', amount: 2,  color: '#84cc16' },
];
export const PICKUP_RULES = {
  everyMs: 9_000,     // one crate drops this often…
  maxOnMap: 7,        // …until this many are waiting
  pickRadius: 3.2,    // walk this close to take it
  size: 5,            // arena units drawn on the floor
};

/** Selectable weapons (lobby picker). All Tripo rifles are normalized to the
 *  same 1-unit length, so every one shares RB_GUN's hand transform + muzzle.
 *
 *  Stats are studied from the real guns the models depict:
 *  - damage      per bullet
 *  - fireRateMs  ms between shots (hold to autofire)
 *  - range       arena units a bullet flies before dying (arena is 100)
 *  - spread      radians of random scatter per shot — 0 = laser focus
 *  Damage-per-second is deliberately near-equal (~60) so every gun is a
 *  playstyle, not an upgrade: the magazine and ammo pickups stay shared. */
export const RB_GUNS = [
  {
    key: 'tech', name: 'Honey Badger', class: 'PDW',
    url: '/rb/gun.glb?v=1', thumb: '/rb/guns/tech.png',
    stats: { damage: 7, fireRateMs: 110, range: 45, spread: 0.035 },
  },
  {
    key: 'falcon', name: 'AK-47', class: 'Battle rifle',
    url: '/rb/gun2.glb?v=1', thumb: '/rb/guns/falcon.png',
    stats: { damage: 14, fireRateMs: 240, range: 60, spread: 0.055 },
  },
  {
    key: 'storm', name: 'M4A1', class: 'Assault rifle',
    url: '/rb/gun3.glb?v=1', thumb: '/rb/guns/storm.png',
    stats: { damage: 10, fireRateMs: 165, range: 60, spread: 0.02 },
  },
  {
    key: 'viper', name: 'M240', class: 'Machine gun',
    url: '/rb/gun4.glb?v=1', thumb: '/rb/guns/viper.png',
    stats: { damage: 12, fireRateMs: 200, range: 80, spread: 0.09 },
  },
];
export type RBGunStats = (typeof RB_GUNS)[number]['stats'];
/** A player's gun stats with a safe fallback. */
export const gunStats = (i: number): RBGunStats => (RB_GUNS[i] ?? RB_GUNS[0]).stats;

/** Where fire leaves the gun (user-tuned on the /gun-tune bench).
 *  forward = arena units ahead of the player along the aim,
 *  side    = units toward the character's RIGHT of the aim,
 *  lift    = visual height of the bullet track + aim line. */
export const RB_FIRE = {
  forward: 2.4,
  side: 0,
  lift: 1.2,
};
