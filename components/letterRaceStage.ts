// components/letterRaceStage.ts
// -----------------------------------------------------------------------------
// Real-time 3D characters for Letter Race. One transparent full-screen WebGL
// canvas renders BOTH runners as skinned glTF models (public/models/runner.glb,
// clips: run / tackle / trip). Each character draws inside its own scissored
// viewport centered on the player's DOM field position, so the game logic keeps
// working in plain % coordinates and all DOM overlays (carried letter, shadow,
// name tag) stay untouched. The model rotates to the player's heading — true
// 360° 3D, no pre-rendered view strips (which could also blink/disappear while
// a new strip image decoded — this renderer has no per-frame image swaps).
// three.js is imported dynamically so the main bundle stays lean.
// -----------------------------------------------------------------------------

export type RunnerAnim = 'idle' | 'run' | 'tackle' | 'trip' | 'jump' | 'carry';

// ─────────────────────────────────────────────────────────────────────────────
// Shared model cache. Every stage (field + selector previews) loads through
// here, so a GLB is fetched and parsed ONCE per session — clicking through the
// selector re-uses the cached parse instead of re-downloading multi-MB files.
// Stages must clone (SkeletonUtils) before mutating scene graph or transforms.
// ─────────────────────────────────────────────────────────────────────────────
let modsPromise: Promise<any> | null = null;
const loadMods = () => modsPromise ??= Promise.all([
  import('three'),
  import('three/examples/jsm/loaders/GLTFLoader.js'),
  import('three/examples/jsm/utils/SkeletonUtils.js'),
]).then(([THREE, gl, sk]) => ({ THREE, GLTFLoader: gl.GLTFLoader, skClone: sk.clone }));

const gltfCache = new Map<string, Promise<any>>();
const loadGLTF = (url: string): Promise<any> => {
  let p = gltfCache.get(url);
  if (!p) {
    p = loadMods().then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url));
    gltfCache.set(url, p);
    p.catch(() => gltfCache.delete(url)); // failed fetch → allow retry
  }
  return p;
};

// The "-lite" variant of a character GLB: ~12k triangles (down from ~90k),
// basecolor-only textures resized to 512, KHR_materials_specular stripped —
// built by the offline pipeline for the FIELD on phones. The full model is
// still used for the large character selector / victory previews. Preserves
// any ?v= cache-bust suffix: /models/mario.glb?v=7 → /models/mario-lite.glb?v=7.
export const liteModelUrl = (url: string): string => url.replace(/(\.glb)(\?|$)/i, '-lite$1$2');

// The 3D wooden crate a runner holds while carrying a letter. Loaded once and
// cloned per carrying character; parented to the chest bone so it rides the
// carry-run's torso lean and sits "in the arms". Tunable live in DEV via
// window.__lrCrate = { bone, s, x, y, z, rx, ry, rz }.
const CRATE_URL = '/models/crate.glb?v=1';
// Tripo chest bone, then Mixamo (three.js strips the ':' → 'mixamorigSpine2').
const CRATE_BONES = ['Spine02', 'mixamorigSpine2', 'mixamorig:Spine2', 'Spine2'];
const CRATE_DEFAULT = { s: 36, x: 0.5, y: 3, z: 30, rx: 0, ry: 0, rz: 0 };
// The fennec (Sunny) rides a Mixamo skeleton whose chest bone has different
// local axes/scale, so it needs its own placement.
const CRATE_DEFAULT_MIXAMO = { s: 36, x: 0.5, y: 28, z: 11, rx: 0, ry: 0, rz: 0 };
let cratePromise: Promise<any> | null = null;
const loadCrate = () => (cratePromise ??= loadGLTF(CRATE_URL).catch(() => null));

// Phones/tablets can't render several skinned 3D characters at 2× pixel ratio
// with antialias, and can't afford to warm the whole model roster upfront.
// Detect them once and dial the stage down (see init + preloadRoster gate).
const detectedLowPower = typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) ||
   (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches));

// Mutable so the app can force the light path on (e.g. after measuring low FPS —
// the auto quality ladder) and so tests can exercise the mobile branch. Consumers
// import the live binding, so reassigning here updates them too.
export let isLowPowerDevice = detectedLowPower;
export function setLowPowerMode(on: boolean): void { isLowPowerDevice = on; }

// Warm the cache for the whole roster. A small worker pool loads several at a
// time so the tail of the list (newest characters) is ready in seconds instead
// of waiting behind every earlier model — a click still resolves instantly via
// the shared cache (deduped if a worker is already fetching it).
export const preloadRaceModels = async (urls: string[], concurrency = 4): Promise<void> => {
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift()!;
      try { await loadGLTF(url); } catch { /* ignore */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
};

// Soft blob shadow that grounds a character: a radial-fade disc lying on the
// ground plane. The elevated game camera foreshortens it into a natural
// ellipse; depthTest hides it behind the body, so it reads as a contact shadow.
const makeBlobShadow = (THREE: any, size: number, opacity = 0.5) => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, `rgba(0,0,0,${opacity})`);
  grad.addColorStop(0.55, `rgba(0,0,0,${opacity * 0.7})`);
  grad.addColorStop(0.85, `rgba(0,0,0,${opacity * 0.18})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012; // just off the ground — no z-fighting
  return mesh;
};

export interface RunnerPose {
  x: number;        // field % (0..100)
  y: number;        // field % (0..100)
  heading: number;  // degrees, 0 = up-screen, +clockwise
  speed: number;    // current forward speed (drives run cycle rate)
  anim: RunnerAnim;
}

interface CharRig {
  root: any;               // THREE.Object3D
  mixer: any;              // THREE.AnimationMixer
  actions: Record<string, any>;
  current: RunnerAnim | '';
  scene: any;              // per-character scene (independent lighting-safe)
  camera: any;
  crate?: any;             // 3D wooden crate held while carrying (hidden otherwise)
  crateMixamo?: boolean;   // crate parented to a Mixamo chest bone (fennec)
  prop?: any;              // rigid prop (Reading Battle gun) on a hand bone
  muzzleObj?: any;         // marker inside the prop — its screen pos feeds the aim line
  occ?: any;               // depth-only InstancedMesh hiding the body behind obstacles
  occDummy?: any;
}

// A rigid prop (the RB tech gun) parented to a named bone; muzzle = marker
// offset local to the prop whose screen position the game reads per frame.
export interface RunnerPropCfg {
  url: string; bone: string;
  s: number; x: number; y: number; z: number; rx: number; ry: number; rz: number;
  muzzle: [number, number, number];
}
// Screen-space obstacle for hide-behind: ground-centre + extents in CSS px
// (h = visible height above the ground line). The art itself stays on the 2D
// canvas below — these render DEPTH ONLY, so hidden body pixels just drop out
// and the 2D block shows through; the glow twin then draws the silhouette.
export interface StageOccluder { cx: number; cy: number; w: number; d: number; h: number }

// tint: true = the classic P2 teal (165°), or any hue-rotate angle in degrees.
// yawOffset: extra Y spin for models whose rest pose faces AWAY (Mixamo GLBs).
// pinOrigin: anchor the hips pin to the BIND pose instead of the clip's first
// frame — for clips whose frame 0 already sits away from the armature origin
// (the Reading Battle soldier's Shoot Rifle starts 1.1m into its walk).
// glow: x-ray silhouette colour shown where obstacles hide the body.
// prop: rigid prop config (see RunnerPropCfg).
export interface RunnerModel {
  url: string; scale: number; tint?: boolean | number; yawOffset?: number; pinOrigin?: boolean;
  glow?: string; prop?: RunnerPropCfg;
}

export class RunnerStage {
  private renderer: any = null;
  private chars: CharRig[] = [];
  private raf = 0;
  private lastT = 0;
  private canvas: HTMLCanvasElement;
  private getPoses: () => (RunnerPose | null)[] | null;
  private disposed = false;
  private ctxLost = false;
  private THREE: any = null;
  private models: RunnerModel[];
  private opts: { size?: () => number; occluders?: () => StageOccluder[] };
  // ndc-per-scene-unit derivatives at the character (shared camera geometry)
  private calib = { kx: 0.28, kyY: 0.24, kyZ: 0.2 };
  private muzzles: ({ x: number; y: number } | null)[] = [];
  private tmpV: any = null;

  constructor(
    canvas: HTMLCanvasElement,
    getPoses: () => (RunnerPose | null)[] | null,
    models: RunnerModel[] = [
      { url: '/models/runner.glb', scale: 1 }, { url: '/models/runner.glb', scale: 1 },
    ],
    opts: { size?: () => number; occluders?: () => StageOccluder[] } = {},   // size: viewport square in CSS px
  ) {
    this.canvas = canvas;
    this.getPoses = getPoses;
    this.models = models;
    this.opts = opts;
  }

  /** Screen position (CSS px, top-origin) of character i's prop muzzle — null until rendered. */
  getMuzzle(i: number): { x: number; y: number } | null {
    return this.muzzles[i] ?? null;
  }

  async init(): Promise<void> {
    const { THREE, skClone } = await loadMods();
    if (this.disposed) return;
    this.THREE = THREE;

    // On phones, race the LITE character models (~12k tris + basecolor-only,
    // vs ~90k tris + 4 PBR maps). The field only ever renders them small, so
    // the reduction is invisible; the selector still loads the full models.
    if (isLowPowerDevice) this.models = this.models.map(m => ({ ...m, url: liteModelUrl(m.url) }));

    // Render load scales with player count × pixels. The lag investigation
    // ultimately proved the jank was AUDIO, not rendering, so phones get most
    // of their visual quality back: antialias stays ON everywhere (MSAA is
    // close to free on mobile tile-based GPUs) and the pixel-ratio caps are
    // gentler (1.25/1.5 vs the old 1/1.5). The adaptive frame governor below
    // is the safety net for genuinely weak devices.
    const nModels = this.models.length;
    const prCap = isLowPowerDevice ? (nModels >= 3 ? 1.25 : 1.5) : 2;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, prCap));
    this.renderer.setClearColor(0x000000, 0);
    // A phone can drop the GL context under memory pressure. Without this the
    // frame loop keeps calling into a dead context and throws forever; the 2D
    // arena and the HUD below stay perfectly playable, so just stand down and
    // pick back up if the browser restores it.
    this.canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      this.ctxLost = true;
      console.warn('[stage] WebGL context lost — 3D characters paused');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.ctxLost = false;
      console.warn('[stage] WebGL context restored');
    });

    const unique = [...new Set(this.models.map(m => m.url))];
    const loaded = new Map<string, any>();
    for (const url of unique) {
      try { loaded.set(url, await loadGLTF(url)); } catch { loaded.set(url, null); }
    }
    // a broken character URL falls back to any model that DID load — one bad
    // asset must never blank the whole field
    const anyChar = [...loaded.values()].find(v => v);
    if (!anyChar) throw new Error('no character model loaded');
    for (const url of unique) if (!loaded.get(url)) loaded.set(url, anyChar);
    // props are decorative — a missing gun must never sink the characters
    for (const url of [...new Set(this.models.filter(m => m.prop).map(m => m.prop!.url))]) {
      try { loaded.set(url, await loadGLTF(url)); } catch { loaded.set(url, null); }
    }
    if (this.disposed) return;
    const crateGltf = await loadCrate();
    if (this.disposed) return;

    // camera geometry is identical for every character — derive the ndc-per-
    // scene-unit slopes once (occluder boxes + muzzle projection use them)
    {
      const calCam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      calCam.position.set(0, 3.0, 3.9);
      calCam.lookAt(0, 0.45, 0);
      calCam.updateMatrixWorld();
      const ndc = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).project(calCam);
      const o0 = ndc(0, 0, 0);
      this.calib = {
        kx: Math.abs(ndc(1, 0, 0).x - o0.x),
        kyY: Math.abs(ndc(0, 1, 0).y - o0.y),
        kyZ: Math.abs(ndc(0, 0, 1).y - o0.y),
      };
    }

    // Mixamo clips bake the root's TRAVEL into the hips position track — the
    // model runs forward inside its render window and snaps back every loop.
    // The hips' LOCAL axes are not world-aligned (the travel largely lives in
    // local Y!), so pin in WORLD space: convert each keyframe through the
    // hips' constant parent matrix, hold the horizontal world components at
    // their first-frame values, keep true world height (run bounce, the
    // tackle dive and the trip's fall to the ground all survive), map back.
    // (Retargeted characters like the robot are baked in-place already and
    // their root bone name doesn't match — the loop simply skips them.)
    for (const gltf of loaded.values()) {
      if (!gltf || gltf.__hipsPinned) continue; // null = failed prop; patch cached GLBs exactly once
      gltf.__hipsPinned = true;
      const hips = gltf.scene.getObjectByName('mixamorig:Hips') ?? gltf.scene.getObjectByProperty('isBone', true);
      const parent = hips?.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        const P = parent.matrixWorld.clone();
        const Pinv = P.clone().invert();
        const w = new THREE.Vector3();
        // pinOrigin models: hold the hips at their BIND-pose spot (the loaded
        // scene is still in bind pose here), not wherever frame 0 happens to be
        const pinOrigin = this.models.some(m => m.pinOrigin);
        const bind = new THREE.Vector3();
        if (pinOrigin) hips.getWorldPosition(bind);
        for (const clip of gltf.animations) {
          for (const tr of clip.tracks as any[]) {
            if (!tr.name.endsWith('.position') || !/hips/i.test(tr.name)) continue;
            const v = tr.values as Float32Array;
            let wx0 = 0, wz0 = 0;
            for (let i = 0; i < v.length; i += 3) {
              w.set(v[i], v[i + 1], v[i + 2]).applyMatrix4(P);
              if (i === 0) {
                wx0 = pinOrigin ? bind.x : w.x;
                wz0 = pinOrigin ? bind.z : w.z;
              }
              w.x = wx0; w.z = wz0;
              w.applyMatrix4(Pinv);
              v[i] = w.x; v[i + 1] = w.y; v[i + 2] = w.z;
            }
          }
        }
      }
    }

    // P2 gets a teal texture variant — the base color map redrawn through a
    // CSS hue-rotate on a canvas (same tint the sprites used).
    const makeTintedTexture = (tex: any, hue = 165, colorize = false): any => {
      try {
        const img = tex.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
        const c = document.createElement('canvas');
        c.width = (img as any).width; c.height = (img as any).height;
        const ctx = c.getContext('2d')!;
        // colorize: force a strong uniform recolour (sepia flattens to a warm
        // base, then saturate + hue-rotate dye it) — desaturated textures like
        // the RB soldier's grey camo barely respond to a plain hue-rotate
        ctx.filter = colorize
          ? `sepia(1) saturate(2.4) hue-rotate(${hue}deg)`
          : `hue-rotate(${hue}deg)`;
        ctx.drawImage(img as any, 0, 0);
        // NOTE: not tex.clone() — clones share the underlying image Source,
        // so writing the tinted canvas would repaint Player 1 too.
        const t = new this.THREE.Texture(c);
        t.colorSpace = tex.colorSpace;
        t.flipY = tex.flipY;
        t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
        t.needsUpdate = true;
        return t;
      } catch { return tex; }
    };

    for (let who = 0; who < this.models.length; who++) {
      const gltf = loaded.get(this.models[who].url);
      const root = skClone(gltf.scene);
      // Tripo exports ship METALLIC PBR materials (near-black without an
      // environment map) marked alphaMode BLEND — a whole character rendered
      // transparent means no depth writes, so back layers of the costume paint
      // over front ones depending on the view angle. Clamp to a matte, fully
      // OPAQUE response.
      root.traverse((o: any) => {
        if (o.isMesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const fixed = mats.map((m: any) => {
            if (isLowPowerDevice) {
              // Mobile: the Tripo exports are MeshPhysicalMaterial (KHR_materials_specular)
              // carrying normal + metallic + roughness + specular maps — the heaviest
              // shader three.js builds, and ~4 textures of VRAM per character. On a
              // 4-racer field that's the main cause of guest-phone jank. Swap for a
              // cheap Lambert that samples ONLY the basecolor: ~5-10× lighter fragment
              // cost, and the extra maps are never uploaded (≈4× less texture memory).
              // Cost is slightly flatter shading — invisible at race size. Skinning is
              // auto-detected from the SkinnedMesh, so the rig still animates.
              const lm = new THREE.MeshLambertMaterial({ map: m.map ?? null });
              if (m.color) lm.color.copy(m.color);
              lm.transparent = false;
              lm.depthWrite = true;
              return lm;
            }
            if (typeof m.metalness === 'number') m.metalness = Math.min(m.metalness, 0.05);
            if (typeof m.roughness === 'number') m.roughness = Math.max(m.roughness, 0.7);
            m.transparent = false;
            m.depthWrite = true;
            m.needsUpdate = true;
            return m;
          });
          o.material = Array.isArray(o.material) ? fixed : fixed[0];
        }
      });
      // Skinned meshes animate far outside their bind-pose bounds — never let
      // the frustum test cull them (this is also what made characters
      // sporadically disappear with edge-of-view poses).
      root.traverse((o: any) => { if (o.isMesh) o.frustumCulled = false; });
      // Normalize from the SKELETON, not the geometry: skinned vertices follow
      // the bones, and Mixamo FBX rigs carry a 0.01 armature scale that makes
      // geometry bounds lie wildly about the rendered size.
      const skinned: any[] = [];
      root.traverse((o: any) => { if (o.isSkinnedMesh) skinned.push(o); });
      root.updateMatrixWorld(true);
      const boneBounds = () => {
        const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9);
        const v = new THREE.Vector3();
        for (const m of skinned) for (const b of m.skeleton.bones) {
          b.getWorldPosition(v);
          mn.min(v); mx.max(v);
        }
        return { mn, mx };
      };
      let bb = boneBounds();
      const h = Math.max(0.001, bb.mx.y - bb.mn.y);
      // per-character scale knob (stout rigs read oversized from bone bounds)
      const targetH = 0.9 * this.models[who].scale;
      root.scale.setScalar(targetH / h);
      root.updateMatrixWorld(true);
      // Big-prop rigs (a huge helmet on a tiny chibi skeleton) dwarf their
      // bones — bone-normalizing then inflates the MESH to giant size. If the
      // real mesh towers over the target height, clamp by mesh bounds (upper
      // sanity bound guards against the FBX 100x-lie case).
      const meshBox = new THREE.Box3().setFromObject(root);
      const meshH = meshBox.max.y - meshBox.min.y;
      if (meshH > targetH * 1.45 && meshH < 50) {
        root.scale.multiplyScalar((targetH * 1.15) / meshH);
        root.updateMatrixWorld(true);
      }
      bb = boneBounds();
      root.position.x -= (bb.mn.x + bb.mx.x) / 2;
      root.position.z -= (bb.mn.z + bb.mx.z) / 2;
      root.position.y -= bb.mn.y;

      const tintVal = this.models[who].tint;
      if (tintVal) {
        const hue = typeof tintVal === 'number' ? tintVal : 165;
        const colorize = typeof tintVal === 'number'; // numeric tints = full uniform recolour
        const seen = new Map<any, any>();
        root.traverse((o: any) => {
          if (o.isMesh && o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            const tinted = mats.map((m: any) => {
              if (!seen.has(m)) {
                const nm = m.clone();
                if (nm.map) nm.map = makeTintedTexture(nm.map, hue, colorize);
                seen.set(m, nm);
              }
              return seen.get(m);
            });
            o.material = Array.isArray(o.material) ? tinted : tinted[0];
          }
        });
      }

      const scene = new THREE.Scene();
      scene.add(root);
      scene.add(makeBlobShadow(THREE, 0.9 * this.models[who].scale));
      // Mobile: one directional + ambient (each extra light adds a shading pass);
      // bump key + ambient to make up for the dropped fill so brightness holds.
      const key = new THREE.DirectionalLight(0xffffff, isLowPowerDevice ? 3.3 : 2.9);
      key.position.set(-1.5, 3, 2.5);
      scene.add(key);
      if (!isLowPowerDevice) {
        const fill = new THREE.DirectionalLight(0xbfd8ff, 1.3);
        fill.position.set(2, 2, -1);
        scene.add(fill);
      }
      scene.add(new THREE.AmbientLight(0xffffff, isLowPowerDevice ? 1.9 : 1.5));

      // camera: Brawl-Stars three-quarter — elevated, looking down at the
      // model, zoomed OUT so the character fills only ~half the viewport
      // square: limbs and the tackle lunge never crop at the viewport edge,
      // whatever direction the player faces.
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      camera.position.set(0, 3.0, 3.9);
      camera.lookAt(0, 0.45, 0);

      const mixer = new THREE.AnimationMixer(root);
      const actions: Record<string, any> = {};
      for (const clip of gltf.animations) {
        const a = mixer.clipAction(clip);
        if (clip.name === 'tackle' || clip.name === 'trip' || clip.name === 'jump') {
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
        }
        actions[clip.name] = a;
      }

      // 3D crate held while carrying: a plain clone parented to the chest bone,
      // hidden until the runner picks up a letter. Wood, so just opaque it and
      // kill frustum culling (skinned neighbours animate wide).
      const rig: CharRig = { root, mixer, actions, current: '', scene, camera };

      // rigid prop (the RB gun) on a named bone + muzzle marker inside it
      const propCfg = this.models[who].prop;
      const propGltf = propCfg ? loaded.get(propCfg.url) : null;
      if (propCfg && propGltf?.scene) {
        const bone = root.getObjectByName(propCfg.bone);
        if (bone) {
          const prop = skClone(propGltf.scene);
          prop.traverse((o: any) => {
            if (o.isMesh) {
              o.frustumCulled = false;
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              for (const m of mats) {
                if (!m) continue;
                m.transparent = false; m.depthWrite = true;
                if (typeof m.metalness === 'number') m.metalness = Math.min(m.metalness, 0.2);
                if (typeof m.roughness === 'number') m.roughness = Math.max(m.roughness, 0.55);
                m.needsUpdate = true;
              }
            }
          });
          bone.add(prop);
          const mz = new THREE.Object3D();
          prop.add(mz);
          rig.prop = prop;
          rig.muzzleObj = mz;
        }
      }

      // depth-only obstacle boxes: they write DEPTH but no colour, so body
      // pixels behind them vanish and the 2D block art shows through
      if (this.opts.occluders) {
        const occMat = new THREE.MeshBasicMaterial();
        occMat.colorWrite = false;
        // upright PLANES, not boxes: a plane's silhouette matches the 2D block
        // art rectangle exactly, so the hide/glow boundary hugs the art edges
        const occ = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), occMat, 48);
        occ.renderOrder = -1;
        occ.frustumCulled = false;
        occ.count = 0;
        scene.add(occ);
        rig.occ = occ;
      }

      // x-ray glow: skinned twins sharing the SAME skeleton, drawn only where
      // something nearer already wrote depth (GreaterDepth) — the classic
      // hidden-behind-cover silhouette
      const glowColor = this.models[who].glow;
      if (glowColor) {
        // ORDER IS THE TRICK: occluders (renderOrder -1) lay down depth, the
        // glow twins (-0.5, opaque queue) then pass GreaterDepth exactly where
        // an occluder covers them — the body hasn't rendered yet, so its own
        // overlapping parts can't self-x-ray. The body (0) draws last and
        // overwrites glow wherever it is actually visible.
        const gm = new THREE.MeshBasicMaterial({ color: glowColor, depthWrite: false });
        gm.depthFunc = THREE.GreaterDepth;
        const skinnedMeshes: any[] = [];
        root.traverse((o: any) => { if (o.isSkinnedMesh) skinnedMeshes.push(o); });
        for (const o of skinnedMeshes) {
          const twin = new THREE.SkinnedMesh(o.geometry, gm);
          twin.position.copy(o.position);
          twin.quaternion.copy(o.quaternion);
          twin.scale.copy(o.scale);
          twin.bind(o.skeleton, o.bindMatrix);
          twin.frustumCulled = false;
          twin.renderOrder = -0.5;
          o.parent.add(twin);
        }
      }

      if (crateGltf?.scene) {
        let bone: any = null;
        for (const nm of CRATE_BONES) { bone = root.getObjectByName(nm); if (bone) break; }
        if (bone) {
          const crate = skClone(crateGltf.scene);
          crate.traverse((o: any) => {
            if (o.isMesh) {
              o.frustumCulled = false;
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              for (const m of mats) { if (m) { m.transparent = false; m.depthWrite = true; if (typeof m.metalness === 'number') m.metalness = Math.min(m.metalness, 0.05); if (typeof m.roughness === 'number') m.roughness = Math.max(m.roughness, 0.7); m.needsUpdate = true; } }
            }
          });
          crate.visible = false;
          bone.add(crate);
          rig.crate = crate;
          rig.crateMixamo = /mixamorig/i.test(bone.name);
        }
      }
      this.chars.push(rig);
    }

    // Frame pacing. Phones no longer start from a hard ~38fps cap — the lag
    // was proven to be audio, so animation runs at full rate wherever the
    // device sustains it. Two guards protect weak phones instead:
    //  1. the startup PROBE (below) measures real draw cadence for ~0.8s and
    //     locks a cap the device can actually hold;
    //  2. a one-way RATCHET keeps watching after that — thermal throttling
    //     minutes into a race tightens the cap a notch, never loosens it, so
    //     pacing degrades gracefully instead of stuttering.
    // Animations stay real-time — dt is measured from the last DRAWN frame.
    let frameMin = 0;

    // Adaptive rate lock (mobile only): for the first ~0.8s draw EVERY frame and
    // measure the real rAF cadence — which stretches when the GPU can't finish a
    // frame in time, the one dependable capability signal a browser exposes (GPU
    // timer queries aren't reliable on mobile). Then lock the cap to a rate this
    // exact device can actually hold: a rock-steady 24 beats a stuttering 40.
    // warm: the FIRST draws of a race are shader-compile frames (three.js
    // builds each character's programs lazily on first render) — measuring
    // them locked a fast machine to 20fps in the lab. Skip ~25 drawn frames
    // before opening the measurement window, and lock on the MEDIAN so any
    // remaining one-off spike (GC, texture upload) can't skew the verdict.
    const probe = { on: isLowPowerDevice, warm: 0, until: 0, samples: [] as number[], prev: 0 };
    // Ratchet window (mobile only): rolling 2s average of drawn-frame spacing.
    const guard = { sum: 0, n: 0, windowEnd: 0 };
    this.lastT = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      // While probing, bypass the cap so rAF cadence reflects true draw cost.
      if (!probe.on && now - this.lastT < frameMin) return; // skip under the cap
      const gap = now - this.lastT;
      const dt = Math.min(0.05, gap / 1000);
      this.lastT = now;
      this.draw(dt);
      if (probe.on) {
        if (probe.warm < 25) { probe.warm++; probe.prev = now; }
        else if (probe.until === 0) { probe.until = now + 800; probe.prev = now; }
        else {
          const d = now - probe.prev; probe.prev = now;
          if (d > 4 && d < 500) probe.samples.push(d);
          if (now >= probe.until && probe.samples.length > 8) {
            const sorted = [...probe.samples].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            // rAF fires on a quantized display tick (8.3ms at 120Hz, 16.7 at
            // 60, 33.3 in iOS Low Power Mode). A cap that lands BETWEEN tick
            // multiples halves the rate — e.g. capping a steady-30Hz phone at
            // 38ms forces every draw to wait TWO ticks (15fps). So: estimate
            // the tick (p10 of samples = fastest sustained spacing), find how
            // many ticks a frame actually needs (k), and only cap when k > 1 —
            // placing the cap safely INSIDE the k-tick window.
            const tick = Math.max(4, sorted[Math.floor(sorted.length * 0.1)]);
            const k = Math.max(1, Math.round(median / tick));
            if (k > 1) frameMin = Math.max(frameMin, Math.min(50, (k - 0.25) * tick));
            probe.on = false;
            guard.windowEnd = now + 2000;
          }
        }
      } else if (isLowPowerDevice) {
        // Ratchet: if the device stops holding the locked rate (thermals, a
        // heavier round), tighten the cap toward what it IS sustaining.
        if (gap > 4 && gap < 500) { guard.sum += gap; guard.n++; }
        if (guard.windowEnd === 0) guard.windowEnd = now + 2000;
        if (now >= guard.windowEnd) {
          if (guard.n > 8) {
            const avg = guard.sum / guard.n;
            // Fires only when the sustained rate is well below the current cap
            // (avg ≥ ~22ms), so the quantization concern above never applies.
            if (avg > Math.max(frameMin, 16.6) * 1.35) {
              frameMin = Math.min(50, Math.max(frameMin, avg * 1.15));
            }
          }
          guard.sum = 0; guard.n = 0; guard.windowEnd = now + 2000;
        }
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private setAnim(c: CharRig, anim: RunnerAnim, speedNorm: number) {
    // Locomotion clips (run / idle / carry) share the speed-driven timeScale.
    // 'carry' is a run-while-holding cycle; fall back to 'run' if a GLB hasn't
    // been re-baked with it yet, so the crate still shows over a normal run.
    if (anim === 'run' || anim === 'idle' || anim === 'carry') {
      const clip = anim === 'carry' && c.actions['carry'] ? 'carry'
        : anim === 'idle' && c.actions['idle'] ? 'idle'
        : 'run';
      if (c.current !== clip) {
        c.mixer.stopAllAction();
        c.actions[clip]?.reset().play();
        c.current = clip as RunnerAnim;
      }
      const a = c.actions[clip];
      // idle plays at its own rate; run/carry follow the runner's speed. When a
      // carrier stops, freeze the carry-run on its current frame (timeScale 0)
      // instead of jogging in place.
      if (a && clip === 'carry') a.timeScale = speedNorm < 0.06 ? 0 : 0.9 + speedNorm * 1.4;
      else if (a && clip === 'run') a.timeScale = 0.9 + speedNorm * 1.4;
      return;
    }
    if (c.current !== anim) {
      const a = c.actions[anim];
      if (a) {
        c.mixer.stopAllAction();
        a.reset().play();
      }
      c.current = anim;
    }
  }

  private draw(dt: number) {
    const poses = this.getPoses();
    const r = this.renderer;
    if (!poses || !r || this.ctxLost) return;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (W === 0 || H === 0) return;
    if (this.canvas.width !== Math.floor(W * r.getPixelRatio()) || this.canvas.height !== Math.floor(H * r.getPixelRatio())) {
      r.setSize(W, H, false);
    }
    // ONE full clear per frame; per-character renders must NOT auto-clear —
    // when the two viewports overlap (players close together, e.g. a tackle)
    // the second clear would erase the first character.
    r.autoClear = false;
    r.setScissorTest(false);
    r.clear();
    r.setScissorTest(true);
    // character viewport square, sized relative to the field (like the 70px sprite)
    const S = ((import.meta as any).env?.DEV && (window as any).__lrSizeOverride)
      || (this.opts.size ? Math.max(40, Math.round(this.opts.size())) : Math.max(110, Math.round(H * 0.17)));
    // obstacles + muzzle bookkeeping (Reading Battle) — evaluated once per frame
    const occList = this.opts.occluders ? this.opts.occluders() : null;
    this.muzzles = this.chars.map(() => null);
    // draw players further up the field first, so nearer ones (lower on
    // screen = closer to the top-down camera) overlap them naturally
    const order = this.chars.map((_, i) => i)
      .filter(i => i < poses.length)
      .sort((a, b) => (poses[a]?.y ?? 0) - (poses[b]?.y ?? 0));
    for (const i of order) {
      const p = poses[i];
      const c = this.chars[i];
      if (!p || !c) continue;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue; // never vanish on bad data
      this.setAnim(c, p.anim, Math.min(1, p.speed / 0.13)); // 0.13 = game MAX_SPEED
      c.mixer.update(dt);
      if (c.prop) {
        // live-tunable in DEV: window.__rbGun = { s,x,y,z,rx,ry,rz,muzzle:[..] }
        const cfg = (((import.meta as any).env?.DEV && (window as any).__rbGun) || this.models[i]?.prop) as RunnerPropCfg;
        if (cfg) {
          c.prop.scale.setScalar(cfg.s);
          c.prop.position.set(cfg.x, cfg.y, cfg.z);
          c.prop.rotation.set(cfg.rx, cfg.ry, cfg.rz);
          if (c.muzzleObj && cfg.muzzle) c.muzzleObj.position.set(cfg.muzzle[0], cfg.muzzle[1], cfg.muzzle[2]);
        }
      }
      if (c.crate) {
        const on = p.anim === 'carry';
        c.crate.visible = on;
        if (on) {
          const cfg = c.crateMixamo
            ? ((window as any).__lrCrateM || CRATE_DEFAULT_MIXAMO)
            : ((window as any).__lrCrate || CRATE_DEFAULT);
          c.crate.scale.setScalar(cfg.s);
          c.crate.position.set(cfg.x, cfg.y, cfg.z);
          c.crate.rotation.set(cfg.rx, cfg.ry, cfg.rz);
        }
      }
      // model yaw: heading 0 = up-screen (away from the camera → back visible).
      // ONE fixed camera angle for every animation — running, tackling and
      // falling all render from the same three-quarter view.
      c.root.rotation.y = -p.heading * Math.PI / 180 + Math.PI + (this.models[i]?.yawOffset ?? 0);
      const px = (p.x / 100) * W;
      const py = (p.y / 100) * H;
      // viewport centered horizontally, character feet ~62% down the square
      const vx = Math.round(px - S / 2);
      const vy = Math.round(H - py - S * 0.38); // WebGL y-up: bottom of viewport
      // nearby obstacle boxes, converted from screen CSS px into scene units
      // via the calibrated projection slopes (they render depth only)
      if (c.occ && occList) {
        const cssX = this.calib.kx * S / 2;   // css px per scene unit
        const cssY = this.calib.kyY * S / 2;
        const cssZ = this.calib.kyZ * S / 2;
        const dummy = (c.occDummy ??= new this.THREE.Object3D());
        let n = 0;
        for (const o of occList) {
          if (n >= 48) break;
          const relX = o.cx - px, relY = o.cy - py;
          if (Math.abs(relX) > S * 0.8 || Math.abs(relY) > S * 0.9) continue;
          // plane stands on the obstacle's BASE line (its ground contact edge)
          const baseZ = (relY + o.d / 2) / cssZ;
          dummy.position.set(relX / cssX, (o.h / cssY) / 2, baseZ);
          dummy.scale.set(o.w / cssX, o.h / cssY, 1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          c.occ.setMatrixAt(n++, dummy.matrix);
        }
        c.occ.count = n;
        c.occ.instanceMatrix.needsUpdate = true;
      }
      r.setViewport(vx, vy, S, S);
      r.setScissor(vx, vy, S, S);
      r.clearDepth(); // fresh depth per character; color is preserved
      r.render(c.scene, c.camera);
      // muzzle → screen CSS px (top-origin) for the game's aim line
      if (c.muzzleObj) {
        const v = (this.tmpV ??= new this.THREE.Vector3());
        c.muzzleObj.getWorldPosition(v);
        v.project(c.camera);
        this.muzzles[i] = {
          x: vx + (v.x * 0.5 + 0.5) * S,
          y: H - (vy + (v.y * 0.5 + 0.5) * S),
        };
      }
    }
    r.setScissorTest(false);
  }

  // NOTE: never forceContextLoss() here — the game reuses ONE canvas across
  // stage rebuilds (roster/character changes re-run the effect), and a
  // force-lost context stays dead on that canvas: every later WebGLRenderer
  // gets the lost context and crashes in getShaderPrecisionFormat (null),
  // leaving an opaque-white dead canvas over the whole field. (Tried once to
  // pre-empt iOS context eviction — broke all platforms instead.)
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose?.();
    this.chars = [];
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// PortraitStage — a small live 3D preview for the character selector: one
// character, true front view at eye level, playing its 'idle' clip in a loop.
// Self-contained (own renderer/scene); dispose() when the slider moves on.
// ─────────────────────────────────────────────────────────────────────────────
export class PortraitStage {
  private renderer: any = null;
  private raf = 0;
  private lastT = 0;
  private disposed = false;
  private canvas: HTMLCanvasElement;
  private modelUrl: string;
  private tinted: boolean;
  private charScale: number;
  private clip: string;
  private yaw: number;
  private liteLightMul: number;
  private silhouettePad: number;
  private mixer: any = null;
  private scene: any = null;
  private camera: any = null;
  // auto-framing targets: world half-height/half-width the frustum must cover
  private fitH = 0.62;
  private fitW = 0.42;
  private centerY = 0.55;

  constructor(canvas: HTMLCanvasElement, modelUrl: string, tinted: boolean, charScale = 1, clip = 'idle', yaw = 0, liteLightMul = 1, silhouettePad = 0) {
    this.canvas = canvas;
    this.modelUrl = modelUrl;
    this.tinted = tinted;
    this.charScale = charScale; // kept for API compat — portraits self-frame now
    this.clip = clip;           // which animation to play (e.g. 'victory' on the result page)
    this.yaw = yaw;             // extra Y spin — models whose rest pose faces away (Mixamo GLBs)
    this.liteLightMul = liteLightMul; // dim lights when the LITE model loads (maps stripped → renders brighter)
    this.silhouettePad = silhouettePad; // >0 → frame the real posed skin, leaving this fraction of body height as headroom
  }

  async init(): Promise<void> {
    const { THREE, skClone } = await loadMods();
    if (this.disposed) return;
    // Full sharpness everywhere: this is the big close-up view (selector +
    // victory dance), one character on one small canvas — cheap on any GPU.
    // Phones keep the LITE model here (the full GLB's main-thread parse froze
    // WebKit ~700ms when the victory screen mounted), but at 2× + antialias
    // the lite mesh reads crisp.
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    // Phones preview the LITE model too: the full GLB is ~3× the download and
    // its main-thread parse froze WebKit ~700ms right as the victory screen
    // mounted (measured in the perf lab). Selector taps also resolve ~3× faster.
    const gltf = await loadGLTF(isLowPowerDevice ? liteModelUrl(this.modelUrl) : this.modelUrl);
    if (this.disposed) return;
    // clone — the cached scene is shared with the field stage and other previews
    const root = skClone(gltf.scene);

    // same clamps as the field: matte, fully opaque; optional P2 teal tint.
    // Tinting must clone the material first — the original is cache-shared.
    const tintSeen = new Map<any, any>();
    root.traverse((o: any) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const out = mats.map((m: any) => {
            if (this.tinted && m.map) {
              if (!tintSeen.has(m)) {
                const nm = m.clone();
                try {
                  const img = nm.map.image as any;
                  const c = document.createElement('canvas');
                  c.width = img.width; c.height = img.height;
                  const ctx = c.getContext('2d')!;
                  ctx.filter = 'hue-rotate(165deg)';
                  ctx.drawImage(img, 0, 0);
                  const t = new THREE.Texture(c);
                  t.colorSpace = nm.map.colorSpace; t.flipY = nm.map.flipY;
                  t.wrapS = nm.map.wrapS; t.wrapT = nm.map.wrapT;
                  t.needsUpdate = true;
                  nm.map = t;
                } catch { /* keep original */ }
                tintSeen.set(m, nm);
              }
              m = tintSeen.get(m);
            }
            if (typeof m.metalness === 'number') m.metalness = Math.min(m.metalness, 0.05);
            if (typeof m.roughness === 'number') m.roughness = Math.max(m.roughness, 0.7);
            m.transparent = false;
            m.depthWrite = true;
            m.needsUpdate = true;
            return m;
          });
          o.material = Array.isArray(o.material) ? out : out[0];
        }
      }
    });

    // normalize from skeleton bounds (geometry bounds lie on FBX-derived rigs).
    // Every portrait normalizes to the SAME height — the per-character field
    // scale knob is ignored here, it only made big characters overflow the frame.
    const skinned: any[] = [];
    root.traverse((o: any) => { if (o.isSkinnedMesh) skinned.push(o); });
    // spin BEFORE measuring — all the bounds/centering below then account for it
    if (this.yaw) root.rotation.y = this.yaw;
    root.updateMatrixWorld(true);
    const boneBounds = () => {
      const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9);
      const v = new THREE.Vector3();
      for (const m of skinned) for (const b of m.skeleton.bones) { b.getWorldPosition(v); mn.min(v); mx.max(v); }
      return { mn, mx };
    };
    /** True world extents of the deformed skin, sampled from the vertices the
     *  GPU will actually pose. Only used when the static geometry box lies. */
    const skinnedBounds = () => {
      const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9);
      const v = new THREE.Vector3();
      let seen = 0;
      for (const m of skinned) {
        const pos = m.geometry?.attributes?.position;
        if (!pos || typeof m.applyBoneTransform !== 'function') continue;
        const stride = Math.max(1, Math.floor(pos.count / 3000)); // ~3k samples is plenty for a silhouette
        for (let i = 0; i < pos.count; i += stride) {
          v.fromBufferAttribute(pos, i);
          m.applyBoneTransform(i, v);
          m.localToWorld(v);
          mn.min(v); mx.max(v);
          seen++;
        }
      }
      return seen ? { mn, mx } : null;
    };

    let bb = boneBounds();
    const h = Math.max(0.001, bb.mx.y - bb.mn.y);
    root.scale.setScalar(0.98 / h);
    root.updateMatrixWorld(true);
    bb = boneBounds();
    root.position.x -= (bb.mn.x + bb.mx.x) / 2;
    root.position.z -= (bb.mn.z + bb.mx.z) / 2;
    root.position.y -= bb.mn.y;
    root.updateMatrixWorld(true);

    // frame from MESH extents — hair, capes and manes reach past the last bone.
    // Bones say height ≈ 0.98; if the geometry box is wildly off (FBX-scale
    // lies are ~100×) fall back to bone bounds plus generous headroom.
    const height = bb.mx.y - bb.mn.y;
    let top = height * 1.24, bottom = -0.04 * height;
    let halfW = Math.max(Math.abs(bb.mn.x - (bb.mn.x + bb.mx.x) / 2), (bb.mx.x - bb.mn.x) / 2) * 1.45;
    const meshBox = new THREE.Box3().setFromObject(root);
    const mh = meshBox.max.y - meshBox.min.y;
    if (mh > 0.5 && mh < 2.5) {
      top = meshBox.max.y + 0.05;
      bottom = Math.min(0, meshBox.min.y) - 0.02;
      halfW = Math.max(Math.abs(meshBox.min.x), Math.abs(meshBox.max.x)) * 1.08;
    }
    // Opt-in (Reading Battle cards): frame from the REAL posed silhouette with
    // fixed headroom instead of the bind-pose box. That box is authored per
    // model — the soldier ships a wide T-pose box, the titan a collapsed slab —
    // so the generic path puts one camera at 3.45 and the other at 2.74 and the
    // titan looks zoomed in. Measuring the actual skin frames every fighter the
    // same, standing at the same distance whatever its rig looks like at bind.
    if (this.silhouettePad > 0) {
      const sb = skinnedBounds();
      if (sb) {
        const bodyH = Math.max(0.001, sb.mx.y - Math.min(0, sb.mn.y));
        top = sb.mx.y + bodyH * this.silhouettePad;
        bottom = Math.min(0, sb.mn.y) - bodyH * 0.04;
        halfW = Math.max(Math.abs(sb.mn.x), Math.abs(sb.mx.x)) * 1.08;
      }
    }
    this.centerY = (top + bottom) / 2;
    this.fitH = ((top - bottom) / 2) * 1.04;
    this.fitW = Math.max(halfW, 0.3);
    if (this.clip === 'victory') { this.fitW *= 1.3; this.fitH *= 1.12; } // arms swing wide mid-dance

    const scene = new THREE.Scene();
    scene.add(root);
    // the lite variant loses its metal/roughness maps and reads over-bright —
    // scale the whole rig down by liteLightMul on those devices only
    const lm = isLowPowerDevice ? this.liteLightMul : 1;
    const key = new THREE.DirectionalLight(0xffffff, 3.0 * lm);
    key.position.set(-1.2, 2.5, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 1.5 * lm);
    fill.position.set(2, 1.5, 1);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 1.6 * lm));

    // true front view; distance computed per-aspect so the whole character
    // (hair to feet, cape tip to cape tip) always fits — see updateCamera()
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    this.camera = camera;
    this.updateCamera(this.canvas.clientWidth && this.canvas.clientHeight
      ? this.canvas.clientWidth / this.canvas.clientHeight : 1);

    const mixer = new THREE.AnimationMixer(root);
    const idle = gltf.animations.find((a: any) => a.name === this.clip)
      ?? gltf.animations.find((a: any) => a.name === 'idle')
      ?? gltf.animations.find((a: any) => a.name === 'run');
    if (idle) {
      const action = mixer.clipAction(idle);
      if (idle.name === 'run') action.timeScale = 0.55;
      action.play();
    }
    this.mixer = mixer; this.scene = scene;

    this.lastT = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
      if (W === 0 || H === 0) return;
      const r = this.renderer;
      if (this.canvas.width !== Math.floor(W * r.getPixelRatio())) {
        r.setSize(W, H, false);
        this.updateCamera(W / H);
      }
      this.mixer.update(dt);
      r.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // position the camera so the frustum covers fitH vertically AND fitW
  // horizontally at the character's plane, whatever the canvas aspect
  private updateCamera(aspect: number) {
    const cam = this.camera;
    if (!cam) return;
    cam.aspect = aspect;
    const t = Math.tan((cam.fov / 2) * Math.PI / 180);
    const d = Math.max(this.fitH / t, this.fitW / (t * aspect)) + 0.3; // +z body depth
    cam.position.set(0, this.centerY, d);
    cam.lookAt(0, this.centerY, 0);
    cam.updateProjectionMatrix();
  }

  // Same rule as RunnerStage.dispose: NO forceContextLoss — PortraitView keeps
  // its canvas across model-prop changes, so the next PortraitStage must be
  // able to reuse the live context.
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose?.();
  }
}
