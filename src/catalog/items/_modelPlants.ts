/**
 * Photographic plant models (glTF with bark / leaf-card textures, `public/assets/plants/`; credits and
 * licences in `public/assets/CREDITS.md`). Same pattern as the cars: `build()` returns at once with the
 * procedural plant (always in Node / tests), the shared parsed model replaces it when it has loaded.
 * Geometry and textures are shared by every instance; the colour slots tint the leaf / bark textures.
 */
import * as THREE from 'three';
import { hasDom, loadGLB, whenIdle } from '../../assets/loader';
import { staticPart } from './_vehicleParts';

type Colors = Record<string, string>;

interface Level {
  geo: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  matrix: THREE.Matrix4;
}
interface PlantModel {
  lod0: Level[];
  lod1: Level[];
  box: THREE.Box3;
}

const models = new Map<string, PlantModel>();
const pending = new Map<string, Promise<PlantModel>>();

function loadPlant(file: string): Promise<PlantModel> {
  let p = pending.get(file);
  if (!p) {
    p = loadGLB(`plants/${file}.glb`).then((g) => {
      g.scene.updateMatrixWorld(true);
      const level = (name: string): Level[] => {
        const out: Level[] = [];
        g.scene.getObjectByName(name)?.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) out.push({ geo: m.geometry, mat: m.material as THREE.MeshStandardMaterial, matrix: m.matrixWorld.clone() });
        });
        return out;
      };
      const lod0 = level('LOD0');
      if (!lod0.length) throw new Error(`plant ${file}: no LOD0`);
      const lod1 = level('LOD1');
      const box = new THREE.Box3().setFromObject(g.scene.getObjectByName('LOD0')!, true);
      // leaf cards lack the light that passes through real leaves: lift them a little
      for (const l of lod0.concat(lod1)) if (l.mat.alphaTest > 0 && !l.mat.userData.lifted) {
        l.mat.color.multiplyScalar(1.3);
        l.mat.userData.lifted = true;
      }
      const res = { lod0, lod1: lod1.length ? lod1 : lod0, box };
      models.set(file, res);
      return res;
    });
    p.catch(() => undefined);
    pending.set(file, p);
  }
  return p;
}

export function preloadPlants(files: string[]): void {
  whenIdle(() => files.forEach((f) => void loadPlant(f).catch(() => undefined)));
}

/** A placed copy of the model inside the item: offset, turn and uniform scale relative to the fitted model. */
export interface PlantCopy {
  x: number;
  z: number;
  rot: number;
  scale: number;
}

export interface PlantSpec {
  file: string;
  /** default colours of the colour slots: the model's own textures look like this */
  leaves: string;
  trunk?: string;
  /** copies making up the item (a bush clump); default one centred copy */
  copies?: PlantCopy[];
  /** distance at which the lighter level takes over, m */
  lodDistance?: number;
  /**
   * How far the model may outgrow the footprint (canopy overhang): it is fitted to the item's height,
   * but at most `overhang` times the footprint. Default 1 (fits the footprint).
   */
  overhang?: number;
  /** extra horizontal stretch of every copy (a squat bush from an upright one) */
  stretch?: number;
}

const tinted = new Map<string, THREE.MeshStandardMaterial>();
/** The model's material with its colour multiplied by (wanted / default), cached per colour. */
function tintMat(base: THREE.MeshStandardMaterial, want: string | undefined, def: string | undefined): THREE.MeshStandardMaterial {
  if (!want || !def || want.toLowerCase() === def.toLowerCase()) return base;
  const key = `${base.uuid}|${want}`;
  let m = tinted.get(key);
  if (!m) {
    const a = new THREE.Color(want);
    const b = new THREE.Color(def);
    const f = (x: number, y: number) => Math.min(1.8, Math.max(0.25, x / Math.max(0.02, y)));
    m = base.clone();
    m.color.setRGB(f(a.r, b.r), f(a.g, b.g), f(a.b, b.b));
    tinted.set(key, m);
  }
  return m;
}

function levelGroup(lv: Level[], c: Colors, spec: PlantSpec): THREE.Group {
  const g = new THREE.Group();
  for (const l of lv) {
    const isLeaf = l.mat.name === 'leaves' || l.mat.alphaTest > 0;
    const mat = isLeaf ? tintMat(l.mat, c.leaves, spec.leaves) : tintMat(l.mat, c.trunk, spec.trunk);
    const m = new THREE.Mesh(l.geo, mat);
    m.matrixAutoUpdate = false;
    m.matrix.copy(l.matrix);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function attach(root: THREE.Group, m: PlantModel, c: Colors, spec: PlantSpec, size: { w: number; d: number; h: number }): void {
  const copies = spec.copies ?? [{ x: 0, z: 0, rot: 0, scale: 1 }];
  const sz = m.box.getSize(new THREE.Vector3());
  const ctr = m.box.getCenter(new THREE.Vector3());
  // fit the model (centred on its footprint) into the item's size; copies scale relative to that
  const st = spec.stretch ?? 1;
  const fit = Math.min(size.h / sz.y, (spec.overhang ?? 1) * Math.min(size.w / (sz.x * st), size.d / (sz.z * st))) * 0.98;
  for (const cp of copies) {
    const lod = new THREE.LOD();
    lod.addLevel(levelGroup(m.lod0, c, spec), 0);
    lod.addLevel(levelGroup(m.lod1, c, spec), spec.lodDistance ?? 30);
    const s = fit * cp.scale;
    const holder = new THREE.Group();
    holder.add(lod);
    lod.position.set(-ctr.x * s, -m.box.min.y * s, -ctr.z * s);
    lod.scale.set(s * st, s, s * st);
    lod.position.x *= st;
    lod.position.z *= st;
    holder.rotation.y = cp.rot;
    holder.position.set(cp.x, 0, cp.z);
    root.add(holder);
  }
  if ((spec.overhang ?? 1) <= 1) {
    // a clump of copies must still stay on the footprint
    const b = new THREE.Box3().setFromObject(root, true);
    const k = Math.min(1, size.w / 2 / Math.max(-b.min.x, b.max.x), size.d / 2 / Math.max(-b.min.z, b.max.z)) * 0.99;
    if (k < 1) for (const ch of root.children) {
      ch.position.multiplyScalar(k);
      ch.scale.multiplyScalar(k);
    }
  }
}

/**
 * Plant item: the photographic model when loaded, else the procedural `fallback` (baked and cached per
 * colour set, like a normal baked item). Use with `noBake: true`.
 */
export function modelPlant(id: string, c: Colors, spec: PlantSpec, size: { w: number; d: number; h: number }, fallback: () => THREE.Object3D): THREE.Group {
  const root = new THREE.Group();
  root.name = id;
  const ready = models.get(spec.file);
  if (ready) {
    attach(root, ready, c, spec, size);
    return root;
  }
  const fb = staticPart(`plant|${id}|${Object.values(c).join(',')}`, fallback);
  root.add(fb);
  if (hasDom) {
    loadPlant(spec.file)
      .then((m) => {
        root.remove(fb);
        attach(root, m, c, spec, size);
      })
      .catch(() => undefined);
  }
  return root;
}
