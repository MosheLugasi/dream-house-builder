import * as THREE from 'three';

/**
 * Draws the meshes of placed items through a few `BatchedMesh`es (one per material) instead of one
 * draw call per mesh. A neighborhood has thousands of item meshes (trees, lamps, benches, fences, the
 * games district…) that share a few hundred materials; drawn one by one they cost ~10 000 draw calls
 * per frame (scene + shadow map), batched a few hundred.
 *
 * The items keep their normal scene graph – picking, interactions, mini-games and physics keep using
 * the holders – only the rendering moves: a batched mesh is hidden (`visible = false`) and an instance
 * of the batch draws it. Before every render the batches follow the originals:
 *  - moved (matrixWorld changed: an item carried, pushed, a door swinging) → the instance moves,
 *  - hidden (the mesh's parent chain invisible or detached) → the instance hides,
 *  - material swapped (a lamp switched on / off) → the instance moves to the other material's batch,
 *  - made visible by someone else → the mesh is given back to normal rendering.
 * Tiny far-away instances (a few pixels) are skipped as well.
 */

interface Batch {
  key: string;
  mesh: THREE.BatchedMesh;
  /** geometry id in this batch per shared source geometry, with a reference count */
  geos: Map<THREE.BufferGeometry, { id: number; refs: number }>;
  /** vertex / index capacity */
  vcap: number;
  icap: number;
}

interface Inst {
  mesh: THREE.Mesh;
  batch: Batch;
  id: number;
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  /** world-space bounding sphere of the instance */
  center: THREE.Vector3;
  radius: number;
  visible: boolean;
  far: boolean;
}

interface Item {
  root: THREE.Object3D;
  insts: Inst[];
  /** meshes under the root when it was batched (models that load later change it: then re-batch) */
  meshes: number;
}

const countMeshes = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
};

const DEFAULT_ON_BEFORE_RENDER = THREE.Object3D.prototype.onBeforeRender;
const DEFAULT_ON_AFTER_RENDER = THREE.Object3D.prototype.onAfterRender;
const _sphere = new THREE.Sphere();
const _v = new THREE.Vector3();

/** Attribute layout of a geometry (a batch can only hold geometries with the same one). */
function layout(g: THREE.BufferGeometry): string {
  return Object.keys(g.attributes)
    .sort()
    .map((k) => {
      const at = g.attributes[k] as THREE.BufferAttribute;
      return `${k}${at.itemSize}${at.array?.constructor?.name ?? ''}${at.normalized ? 'n' : ''}${(at as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? 'x' : ''}`;
    })
    .join(',') + (g.index ? '|i' : '');
}

/** Whether a mesh can be drawn by a batch instead of on its own. */
function batchable(m: THREE.Mesh): boolean {
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as unknown as THREE.BatchedMesh).isBatchedMesh) return false;
  if (Array.isArray(m.material) || !m.visible) return false;
  const mat = m.material as THREE.Material;
  // sorted, blended or specially drawn things stay on their own
  if (mat.transparent || mat.blending !== THREE.NormalBlending || m.renderOrder !== 0) return false;
  if (m.customDepthMaterial || m.customDistanceMaterial) return false;
  // a mesh with its own render hook (rides that tick while on screen, vehicle lamps…) must keep rendering
  if (m.onBeforeRender !== DEFAULT_ON_BEFORE_RENDER || m.onAfterRender !== DEFAULT_ON_AFTER_RENDER) return false;
  const g = m.geometry;
  // (draw groups do not matter with a single material: the batch draws the whole geometry)
  if (!g.attributes.position || Object.keys(g.morphAttributes).length) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  if (!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(mat as THREE.MeshLambertMaterial).isMeshLambertMaterial && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && !(mat as THREE.MeshPhongMaterial).isMeshPhongMaterial) return false;
  return true;
}

export class StaticBatches {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private items = new Map<string, Item>();
  /** screen-size culling: hide instances smaller than this (bounding radius / distance) */
  minSize = 0.0018;
  enabled = true;
  private frame = 0;
  /** instances and draw calls of the last frame (diagnostics) */
  stats = { meshes: 0, batches: 0, culled: 0 };

  constructor() {
    this.group.name = 'static-batches';
  }

  /** Draw (the suitable meshes of) an item through the batches. */
  add(id: string, root: THREE.Object3D): void {
    this.remove(id);
    if (!this.enabled) return;
    const item: Item = { root, insts: [], meshes: countMeshes(root) };
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !batchable(m)) return;
      const inst = this.place(m, m.material as THREE.Material);
      if (inst) item.insts.push(inst);
    });
    this.items.set(id, item);
  }

  /** Give an item's meshes back to normal rendering (and drop its instances). */
  remove(id: string): void {
    const item = this.items.get(id);
    if (!item) return;
    for (const inst of item.insts) {
      this.unplace(inst);
      inst.mesh.visible = true;
    }
    this.items.delete(id);
  }

  private batchFor(mesh: THREE.Mesh, material: THREE.Material): Batch {
    const key = `${material.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${layout(mesh.geometry)}`;
    let b = this.batches.get(key);
    if (!b) {
      const g = mesh.geometry;
      const verts = Math.max(1024, g.attributes.position.count * 4);
      const index = g.index ? Math.max(2048, g.index.count * 4) : 0;
      const bm = new THREE.BatchedMesh(16, verts, index, material);
      bm.castShadow = mesh.castShadow;
      bm.receiveShadow = mesh.receiveShadow;
      bm.frustumCulled = false; // (instances are culled one by one)
      bm.perObjectFrustumCulled = true;
      bm.sortObjects = false;
      bm.name = `batch:${material.name || material.type}`;
      b = { key, mesh: bm, geos: new Map(), vcap: verts, icap: index };
      this.batches.set(key, b);
      this.group.add(bm);
    }
    return b;
  }

  private place(mesh: THREE.Mesh, material: THREE.Material): Inst | null {
    const b = this.batchFor(mesh, material);
    const bm = b.mesh;
    const src = mesh.geometry;
    let geo = b.geos.get(src);
    if (!geo) {
      const nv = src.attributes.position.count;
      const ni = src.index ? src.index.count : 0;
      const full = () => bm.unusedVertexCount < nv || (!!src.index && bm.unusedIndexCount < ni);
      // (deleted geometries leave holes: compact first, grow if that is not enough)
      if (full() && b.geos.size) bm.optimize();
      if (full()) {
        const usedV = b.vcap - bm.unusedVertexCount;
        const usedI = src.index ? b.icap - bm.unusedIndexCount : 0;
        b.vcap = Math.max((usedV + nv) * 2, 1024);
        b.icap = src.index ? Math.max((usedI + ni) * 2, 2048) : 0;
        bm.setGeometrySize(b.vcap, b.icap);
      }
      let id: number;
      try {
        id = bm.addGeometry(src);
      } catch {
        return null;
      }
      geo = { id, refs: 0 };
      b.geos.set(src, geo);
    }
    if (bm.instanceCount >= bm.maxInstanceCount) bm.setInstanceCount(bm.maxInstanceCount * 2);
    let id: number;
    try {
      id = bm.addInstance(geo.id);
    } catch {
      return null;
    }
    geo.refs++;
    if (!src.boundingSphere) src.computeBoundingSphere();
    const inst: Inst = { mesh, batch: b, id, material, geometry: src, matrix: new THREE.Matrix4(), center: new THREE.Vector3(), radius: 0, visible: true, far: false };
    this.setMatrix(inst);
    mesh.visible = false;
    return inst;
  }

  private unplace(inst: Inst): void {
    const b = inst.batch;
    b.mesh.deleteInstance(inst.id);
    const geo = b.geos.get(inst.geometry);
    if (geo && --geo.refs <= 0) {
      b.mesh.deleteGeometry(geo.id);
      b.geos.delete(inst.geometry);
    }
    if (b.geos.size === 0) {
      this.group.remove(b.mesh);
      b.mesh.dispose();
      this.batches.delete(b.key);
    }
  }

  private setMatrix(inst: Inst): void {
    const w = inst.mesh.matrixWorld;
    inst.matrix.copy(w);
    inst.batch.mesh.setMatrixAt(inst.id, w);
    _sphere.copy(inst.geometry.boundingSphere!).applyMatrix4(w);
    inst.center.copy(_sphere.center);
    inst.radius = _sphere.radius;
  }

  /** Is the mesh shown by its scene graph (ignoring its own flag, which the batch owns)? */
  private shown(mesh: THREE.Object3D): boolean {
    let o = mesh.parent;
    while (o) {
      if (!o.visible) return false;
      if ((o as THREE.Scene).isScene) return true;
      o = o.parent;
    }
    return false;
  }

  /** Follow the originals (call after the world matrices are up to date, before rendering). */
  sync(camera: THREE.Camera): void {
    // now and then: items whose model arrived (or changed) since they were batched are batched again
    if (++this.frame % 30 === 0) {
      for (const [id, item] of this.items) if (countMeshes(item.root) !== item.meshes) this.add(id, item.root);
    }
    const eye = camera.getWorldPosition(_v);
    const min = this.minSize;
    let meshes = 0;
    let culled = 0;
    for (const [id, item] of this.items) {
      for (let i = 0; i < item.insts.length; i++) {
        const inst = item.insts[i];
        const mesh = inst.mesh;
        // someone else showed it again: it is no longer ours
        if (mesh.visible) {
          this.unplace(inst);
          item.insts.splice(i--, 1);
          continue;
        }
        // a different material (a lamp switched on or off): move to that material's batch
        if (mesh.material !== inst.material || mesh.geometry !== inst.geometry) {
          this.unplace(inst);
          mesh.visible = true;
          const ok = batchable(mesh) ? this.place(mesh, mesh.material as THREE.Material) : null;
          if (ok) item.insts[i] = ok;
          else item.insts.splice(i--, 1);
          continue;
        }
        if (!inst.matrix.equals(mesh.matrixWorld)) this.setMatrix(inst);
        let visible = this.shown(mesh);
        if (visible && min > 0) {
          // screen-size culling with a little hysteresis (no popping back and forth at the threshold)
          const d = Math.max(1e-3, inst.center.distanceTo(eye) - inst.radius);
          const size = inst.radius / d;
          inst.far = inst.far ? size < min * 1.25 : size < min;
          if (inst.far) {
            visible = false;
            culled++;
          }
        }
        if (visible !== inst.visible) {
          inst.visible = visible;
          inst.batch.mesh.setVisibleAt(inst.id, visible);
        }
        if (visible) meshes++;
      }
    }
    this.stats.meshes = meshes;
    this.stats.culled = culled;
    this.stats.batches = this.batches.size;
  }

  dispose(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
    for (const b of this.batches.values()) b.mesh.dispose();
    this.batches.clear();
  }
}

/** The batches of the running engine (set by the Engine; item layers register their items here). */
export const itemBatches: { current: StaticBatches | null } = { current: null };
