import * as THREE from 'three';

/** a WebGLProgram as three keeps it (`renderer.info.programs`) */
interface Program {
  id: number;
  isReady(): boolean;
  getUniforms(): unknown;
}

/** One compile pass over a list of objects (optionally in another light state, see `variants`). */
interface Job {
  objects: THREE.Object3D[];
  next: number;
  /** puts the scene into the light state to compile for and returns the undo (null = as it is) */
  variant: (() => () => void) | null;
}

/** a layer no camera looks at: objects whose shaders are still compiling wait on it */
const WAIT_LAYER = 31;
const WAIT_MASK = (1 << WAIT_LAYER) >>> 0;

const renderable = (o: THREE.Object3D): boolean =>
  !!(o as THREE.Mesh).material && ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite);

/**
 * Compiles shaders before anything is drawn with them, so that the frame does not stop for them.
 *
 * three.js compiles a material's program the first time an object with it is drawn, and the frame then
 * waits for the GPU driver: tens of milliseconds per program on an ordinary laptop (ANGLE / D3D), more
 * than a hundred programs when walk mode starts – a freeze of several seconds. Here programs are created
 * ahead of time (`renderer.compile`, a few objects per frame within a time budget) and the frame only uses
 * them once the driver reports them ready (`KHR_parallel_shader_compile`, which compiles on background
 * threads; without it one program is finished per frame). Meanwhile
 *  - after a big change (the 3D view opens, walking starts, the scope changes) the engine keeps showing
 *    the last image (`holding`) for up to a few seconds,
 *  - objects that appear later (furniture of a house one walks up to, a game's props, a model that has
 *    just loaded) wait on a hidden layer and pop in a few frames later instead of stopping the frame.
 *
 * Only what the frame would draw is compiled: visible objects (the hidden originals of batched meshes
 * would compile programs that are never used), into the render target the scene is drawn into (the
 * canvas and an off-screen target need different programs).
 */
export class ShaderWarmup {
  private jobs: Job[] = [];
  private pending: Program[] = [];
  /** objects waiting on the hidden layer → their own layer mask */
  private waiting = new Map<THREE.Object3D, number>();
  /** objects handled, with the material they were compiled for */
  private seen = new WeakMap<THREE.Object3D, THREE.Material | THREE.Material[]>();
  private holdUntil = 0;
  private readonly parallel: boolean;
  /** other light states the scene switches to by itself (e.g. the window lights joining it) */
  variants: (() => () => void)[] = [];
  /** programs compiled ahead of time / finished (diagnostics) */
  stats = { compiled: 0, scans: 0, held: 0 };
  private proxy = new THREE.Object3D();
  private list: THREE.Object3D[] = [];

  constructor(private renderer: THREE.WebGLRenderer) {
    // (enabling the extension is what lets `isReady()` ask without blocking)
    this.parallel = !!renderer.extensions.get('KHR_parallel_shader_compile');
    // compile() walks `scene.traverse` for materials and `traverseVisible` for lights: a stand-in that
    // yields just the chosen objects (the lights come from the real scene, passed as the target)
    this.proxy.traverse = (cb: (o: THREE.Object3D) => void) => {
      for (const o of this.list) cb(o);
    };
    this.proxy.traverseVisible = () => {};
  }

  /** Something is still being prepared. */
  get busy(): boolean {
    return this.jobs.length > 0 || this.pending.length > 0;
  }

  /** The frame should keep the previous image (a big change is being prepared). */
  get holding(): boolean {
    if (!this.busy) this.holdUntil = 0;
    return this.holdUntil > 0 && performance.now() < this.holdUntil;
  }

  /**
   * Prepare the scene as it will be drawn now. `all`: every visible object (a new view or light state),
   * otherwise only objects not seen before (or with another material). `hold`: keep the last image for
   * up to that many ms instead of drawing with half the scene compiled. Returns the objects queued.
   */
  scan(scene: THREE.Object3D, opts: { all?: boolean; hold?: number } = {}): number {
    this.stats.scans++;
    const objects: THREE.Object3D[] = [];
    scene.traverseVisible((o) => {
      if (!renderable(o) || this.waiting.has(o)) return;
      // (a copy made of an object while it waited would wait forever)
      if (o.layers.mask >>> 0 === WAIT_MASK) o.layers.set(0);
      const mat = (o as THREE.Mesh).material;
      if (!opts.all && this.seen.get(o) === mat) return;
      this.seen.set(o, mat);
      objects.push(o);
    });
    if (!objects.length) return 0;
    this.jobs.push({ objects, next: 0, variant: null });
    for (const v of this.variants) this.jobs.push({ objects, next: 0, variant: v });
    if (opts.hold) {
      this.holdUntil = Math.max(this.holdUntil, performance.now() + opts.hold);
      this.stats.held++;
    } else {
      // until their shaders are ready, new objects are not drawn (nor cast shadows)
      for (const o of objects) {
        this.waiting.set(o, o.layers.mask);
        o.layers.set(WAIT_LAYER);
      }
    }
    return objects.length;
  }

  /**
   * Do some of the work (call once per frame, before rendering): create programs for queued objects
   * for about `budgetMs`, and hand out the ones the driver has finished.
   * @param target the render target the scene is drawn into (null: the canvas)
   */
  pump(scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget | null, budgetMs = 6): void {
    if (!this.busy && !this.waiting.size) return;
    const r = this.renderer;
    const t0 = performance.now();
    // 1. create programs (CPU side: building the source, handing it to the driver), a chunk at a time
    while (this.jobs.length && performance.now() - t0 < budgetMs) {
      const job = this.jobs[0];
      this.list = job.objects.slice(job.next, job.next + 24);
      job.next += this.list.length;
      if (job.next >= job.objects.length) this.jobs.shift();
      const before = maxId(r);
      const undo = job.variant ? job.variant() : null;
      const prev = r.getRenderTarget();
      r.setRenderTarget(target);
      try {
        r.compile(this.proxy, camera, scene);
      } catch (err) {
        console.warn('shader warm-up failed', err);
      }
      r.setRenderTarget(prev);
      undo?.();
      this.list = [];
      for (const p of programs(r)) if (p.id > before) this.pending.push(p);
    }
    // 2. finish the programs the driver is done with (first use: link check and uniform locations)
    let finished = 0;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      const ready = this.parallel ? safeReady(p) : finished === 0 || performance.now() - t0 < budgetMs;
      if (!ready) continue;
      try {
        p.getUniforms();
      } catch {
        /* a disposed program */
      }
      finished++;
      this.stats.compiled++;
      this.pending.splice(i--, 1);
    }
    // 3. everything ready: show what was waiting
    if (!this.busy) this.release();
  }

  private release(): void {
    for (const [o, mask] of this.waiting) o.layers.mask = mask;
    this.waiting.clear();
  }

  /** Drop all work (e.g. the renderer is going away); waiting objects are shown again. */
  clear(): void {
    this.jobs = [];
    this.pending = [];
    this.holdUntil = 0;
    this.release();
  }
}

function programs(r: THREE.WebGLRenderer): Program[] {
  return (r.info.programs ?? []) as unknown as Program[];
}

function maxId(r: THREE.WebGLRenderer): number {
  let m = -1;
  for (const p of programs(r)) if (p.id > m) m = p.id;
  return m;
}

function safeReady(p: Program): boolean {
  try {
    return p.isReady() !== false;
  } catch {
    return true;
  }
}
