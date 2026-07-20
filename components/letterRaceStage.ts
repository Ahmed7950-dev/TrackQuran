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

// The 3D wooden crate a runner holds while carrying a letter. Loaded once and
// cloned per carrying character; parented to the chest bone so it rides the
// carry-run's torso lean and sits "in the arms". Tunable live in DEV via
// window.__lrCrate = { bone, s, x, y, z, rx, ry, rz }.
const CRATE_URL = '/models/crate.glb?v=1';
const CRATE_BONES = ['Spine02', 'mixamorig:Spine2', 'Spine2']; // Tripo / Mixamo chest bone
const CRATE_DEFAULT = { s: 34, x: 0, y: 5, z: 7, rx: 0, ry: 0, rz: 0 };
let cratePromise: Promise<any> | null = null;
const loadCrate = () => (cratePromise ??= loadGLTF(CRATE_URL).catch(() => null));

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
}

export interface RunnerModel { url: string; scale: number; tint?: boolean }

export class RunnerStage {
  private renderer: any = null;
  private chars: CharRig[] = [];
  private raf = 0;
  private lastT = 0;
  private canvas: HTMLCanvasElement;
  private getPoses: () => (RunnerPose | null)[] | null;
  private disposed = false;
  private THREE: any = null;
  private models: RunnerModel[];

  constructor(
    canvas: HTMLCanvasElement,
    getPoses: () => (RunnerPose | null)[] | null,
    models: RunnerModel[] = [
      { url: '/models/runner.glb', scale: 1 }, { url: '/models/runner.glb', scale: 1 },
    ],
  ) {
    this.canvas = canvas;
    this.getPoses = getPoses;
    this.models = models;
  }

  async init(): Promise<void> {
    const { THREE, skClone } = await loadMods();
    if (this.disposed) return;
    this.THREE = THREE;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    const unique = [...new Set(this.models.map(m => m.url))];
    const loaded = new Map<string, any>();
    for (const url of unique) loaded.set(url, await loadGLTF(url));
    if (this.disposed) return;
    const crateGltf = await loadCrate();
    if (this.disposed) return;

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
      if (gltf.__hipsPinned) continue; // cached GLBs are patched exactly once
      gltf.__hipsPinned = true;
      const hips = gltf.scene.getObjectByName('mixamorig:Hips') ?? gltf.scene.getObjectByProperty('isBone', true);
      const parent = hips?.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        const P = parent.matrixWorld.clone();
        const Pinv = P.clone().invert();
        const w = new THREE.Vector3();
        for (const clip of gltf.animations) {
          for (const tr of clip.tracks as any[]) {
            if (!tr.name.endsWith('.position') || !/hips/i.test(tr.name)) continue;
            const v = tr.values as Float32Array;
            let wx0 = 0, wz0 = 0;
            for (let i = 0; i < v.length; i += 3) {
              w.set(v[i], v[i + 1], v[i + 2]).applyMatrix4(P);
              if (i === 0) { wx0 = w.x; wz0 = w.z; }
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
    const makeTintedTexture = (tex: any): any => {
      try {
        const img = tex.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
        const c = document.createElement('canvas');
        c.width = (img as any).width; c.height = (img as any).height;
        const ctx = c.getContext('2d')!;
        ctx.filter = 'hue-rotate(165deg)';
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
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (typeof m.metalness === 'number') m.metalness = Math.min(m.metalness, 0.05);
            if (typeof m.roughness === 'number') m.roughness = Math.max(m.roughness, 0.7);
            m.transparent = false;
            m.depthWrite = true;
            m.needsUpdate = true;
          }
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

      if (this.models[who].tint) {
        const seen = new Map<any, any>();
        root.traverse((o: any) => {
          if (o.isMesh && o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            const tinted = mats.map((m: any) => {
              if (!seen.has(m)) {
                const nm = m.clone();
                if (nm.map) nm.map = makeTintedTexture(nm.map);
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
      const key = new THREE.DirectionalLight(0xffffff, 2.9);
      key.position.set(-1.5, 3, 2.5);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xbfd8ff, 1.3);
      fill.position.set(2, 2, -1);
      scene.add(fill);
      scene.add(new THREE.AmbientLight(0xffffff, 1.5));

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
        }
      }
      this.chars.push(rig);
    }

    this.lastT = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      this.draw(dt);
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
    if (!poses || !r) return;
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
    const S = ((import.meta as any).env?.DEV && (window as any).__lrSizeOverride) || Math.max(110, Math.round(H * 0.17));
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
      if (c.crate) {
        const on = p.anim === 'carry';
        c.crate.visible = on;
        if (on) {
          const cfg = (((import.meta as any).env?.DEV && (window as any).__lrCrate) || CRATE_DEFAULT);
          c.crate.scale.setScalar(cfg.s);
          c.crate.position.set(cfg.x, cfg.y, cfg.z);
          c.crate.rotation.set(cfg.rx, cfg.ry, cfg.rz);
        }
      }
      // model yaw: heading 0 = up-screen (away from the camera → back visible).
      // ONE fixed camera angle for every animation — running, tackling and
      // falling all render from the same three-quarter view.
      c.root.rotation.y = -p.heading * Math.PI / 180 + Math.PI;
      const px = (p.x / 100) * W;
      const py = (p.y / 100) * H;
      // viewport centered horizontally, character feet ~62% down the square
      const vx = Math.round(px - S / 2);
      const vy = Math.round(H - py - S * 0.38); // WebGL y-up: bottom of viewport
      r.setViewport(vx, vy, S, S);
      r.setScissor(vx, vy, S, S);
      r.clearDepth(); // fresh depth per character; color is preserved
      r.render(c.scene, c.camera);
    }
    r.setScissorTest(false);
  }

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
  private mixer: any = null;
  private scene: any = null;
  private camera: any = null;
  // auto-framing targets: world half-height/half-width the frustum must cover
  private fitH = 0.62;
  private fitW = 0.42;
  private centerY = 0.55;

  constructor(canvas: HTMLCanvasElement, modelUrl: string, tinted: boolean, charScale = 1, clip = 'idle') {
    this.canvas = canvas;
    this.modelUrl = modelUrl;
    this.tinted = tinted;
    this.charScale = charScale; // kept for API compat — portraits self-frame now
    this.clip = clip;           // which animation to play (e.g. 'victory' on the result page)
  }

  async init(): Promise<void> {
    const { THREE, skClone } = await loadMods();
    if (this.disposed) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    const gltf = await loadGLTF(this.modelUrl);
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
    root.updateMatrixWorld(true);
    const boneBounds = () => {
      const mn = new THREE.Vector3(1e9, 1e9, 1e9), mx = new THREE.Vector3(-1e9, -1e9, -1e9);
      const v = new THREE.Vector3();
      for (const m of skinned) for (const b of m.skeleton.bones) { b.getWorldPosition(v); mn.min(v); mx.max(v); }
      return { mn, mx };
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
    this.centerY = (top + bottom) / 2;
    this.fitH = ((top - bottom) / 2) * 1.04;
    this.fitW = Math.max(halfW, 0.3);
    if (this.clip === 'victory') { this.fitW *= 1.3; this.fitH *= 1.12; } // arms swing wide mid-dance

    const scene = new THREE.Scene();
    scene.add(root);
    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(-1.2, 2.5, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 1.5);
    fill.position.set(2, 1.5, 1);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));

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

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose?.();
  }
}
