/**
 * Shared vehicle building blocks: materials, wheels, seats, lamps, licence plates and the
 * static-part template cache. Everything here is cached at module level because `build` runs
 * once per placed vehicle.
 */
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, M, bake, mesh } from '../kit';
import type { WheelPart } from '../types';

/* ------------------------------------------------------------------ caches */

const matCache = new Map<string, THREE.Material>();
function cachedMat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined;
  if (!m) {
    m = make();
    m.name = `vehicle|${key}`;
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, unknown>();
/** Memoize a geometry (or a bundle of geometries) under a module-wide key. */
export function memo<T>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (g === undefined) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const MAX_STATIC = 96;
const staticCache = new Map<string, THREE.Group>();
/**
 * Bake the non-moving parts of a vehicle once per (key) and hand out cheap clones that share
 * geometry and materials.
 */
export function staticPart(key: string, make: () => THREE.Object3D): THREE.Group {
  let tpl = staticCache.get(key);
  if (!tpl) {
    tpl = bake(make(), key);
    if (staticCache.size >= MAX_STATIC) {
      const first = staticCache.keys().next().value;
      if (first !== undefined) staticCache.delete(first);
    }
    staticCache.set(key, tpl);
  }
  return tpl.clone(true);
}

/* ------------------------------------------------------------------ materials */

const hasDom = typeof document !== 'undefined';

function plateTexture(text: string): THREE.CanvasTexture | null {
  if (!hasDom) return null;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const c = cv.getContext('2d');
  if (!c) return null;
  c.fillStyle = '#f4c81e';
  c.fillRect(0, 0, 256, 64);
  c.fillStyle = '#2148a8';
  c.fillRect(0, 0, 26, 64);
  c.strokeStyle = '#1c1c1c';
  c.lineWidth = 4;
  c.strokeRect(2, 2, 252, 60);
  c.fillStyle = '#161616';
  c.font = '900 44px "Arial Narrow", Arial, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 142, 35);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export const VM = {
  /** Automotive paint: coloured base under a glossy clear coat. */
  paint(color: string): THREE.MeshPhysicalMaterial {
    return cachedMat(
      `paint|${color}`,
      () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.46, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.1 }),
    );
  },
  /** Glossy powder-coated tube / sheet metal (bike frames, tractor panels). */
  enamel(color: string): THREE.MeshPhysicalMaterial {
    return cachedMat(
      `enamel|${color}`,
      () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.36, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    );
  },
  /** Lightly tinted window glass (see-through from both sides, never casts a shadow). */
  glass(): THREE.MeshPhysicalMaterial {
    return M.glass('#a9c6cd', 0.34);
  },
  tire(): THREE.MeshStandardMaterial {
    return M.rubber('#1c1c1e');
  },
  /** Unpainted black plastic: bumpers, cladding, wheel wells, trims. */
  trim(): THREE.MeshStandardMaterial {
    return cachedMat('trim', () => new THREE.MeshStandardMaterial({ color: '#232427', roughness: 0.62, metalness: 0 }));
  },
  /** Cabin lining (door cards, headliner). */
  liner(color: string = '#6f7278'): THREE.MeshStandardMaterial {
    return cachedMat(`liner|${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }));
  },
  cabin(color: string = '#3b3e45'): THREE.MeshStandardMaterial {
    return cachedMat(`cabin|${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 }));
  },
  alloy(): THREE.MeshStandardMaterial {
    return M.metal('#c9ccd0', 0.32, 0.9);
  },
  /** Clear head-lamp lens that glows softly. */
  lamp(): THREE.MeshPhysicalMaterial {
    return cachedMat(
      'lamp',
      () =>
        new THREE.MeshPhysicalMaterial({
          color: '#f4f6f8',
          emissive: '#fff3cf',
          emissiveIntensity: 0.55,
          roughness: 0.08,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
        }),
    );
  },
  tail(): THREE.MeshPhysicalMaterial {
    return cachedMat(
      'tail',
      () =>
        new THREE.MeshPhysicalMaterial({
          color: '#b3121a',
          emissive: '#ff1a1a',
          emissiveIntensity: 0.4,
          roughness: 0.12,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
        }),
    );
  },
  amber(): THREE.MeshPhysicalMaterial {
    return cachedMat(
      'amber',
      () =>
        new THREE.MeshPhysicalMaterial({
          color: '#f08a12',
          emissive: '#ff8a00',
          emissiveIntensity: 0.35,
          roughness: 0.14,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
        }),
    );
  },
  /** Yellow number plate with made-up digits. */
  plate(text: string): THREE.MeshStandardMaterial {
    return cachedMat(`plate|${text}`, () => {
      const map = plateTexture(text);
      return new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : '#f4c81e', map, roughness: 0.5, metalness: 0 });
    });
  },
};

/* ------------------------------------------------------------------ geometry helpers */

/** Surface of revolution around the X axis from [radius, axial] pairs (+axial = +X). */
export function latheX(profile: Array<[number, number]>, seg = 24): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, a]) => new THREE.Vector2(Math.max(0, r), a)),
    seg,
  );
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Cylinder whose axis is X, centered on the origin. */
export function cylX(r: number, len: number, seg = 16, rEnd: number = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rEnd, r, len, seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Merge geometries after reducing them to position / normal / uv. */
export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = geos.map((src) => {
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    return g;
  });
  const out = mergeGeometries(clean, false) ?? new THREE.BufferGeometry();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Ring sector in the YZ plane (centered on the X axis), extruded along X: mudguards, fenders. */
export function arcBandGeo(rIn: number, rOut: number, a0: number, a1: number, width: number, seg = 16): THREE.BufferGeometry {
  // angle measured from +Z towards +Y
  const s = new THREE.Shape();
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    const x = Math.cos(a) * rOut;
    const y = Math.sin(a) * rOut;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  for (let i = seg; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / seg;
    s.lineTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -width / 2);
  // shape x -> world z, shape y -> world y, extrusion -> world x (a proper rotation, winding is kept)
  g.rotateY(-Math.PI / 2);
  return toCreasedNormals(g, 0.7);
}

/* ------------------------------------------------------------------ road wheels */

export interface WheelSpec {
  /** outer tire radius */
  r: number;
  /** tire width */
  w: number;
  /** rim radius */
  rimR: number;
  style: 'alloy5' | 'alloy10' | 'steel';
}

/** Tire + rim geometry, axle along X, outer face towards +X, centered on the axle. */
export function wheelGeos(s: WheelSpec): { tire: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  return memo(`wheel|${s.r}|${s.w}|${s.rimR}|${s.style}`, () => {
    const hw = s.w / 2;
    const { r, rimR } = s;
    const mid = (r + rimR) / 2;
    const prof: Array<[number, number]> = [
      [rimR, -hw * 0.8],
      [rimR + 0.012, -hw * 0.97],
      [mid, -hw],
      [r - 0.03, -hw * 0.96],
      [r - 0.009, -hw * 0.82],
      [r, -hw * 0.64],
    ];
    prof.push([r, hw * 0.64], [r - 0.009, hw * 0.82], [r - 0.03, hw * 0.96], [mid, hw], [rimR + 0.012, hw * 0.97], [rimR, hw * 0.8]);
    const tireParts: THREE.BufferGeometry[] = [latheX(prof, 24)];
    // dark brake / drum behind the spokes and a closing disc on the inner side
    const back = new THREE.CircleGeometry(rimR - 0.01, 18);
    back.rotateY(Math.PI / 2);
    back.translate(hw * 0.12, 0, 0);
    const inner = new THREE.CircleGeometry(rimR + 0.004, 18);
    inner.rotateY(-Math.PI / 2);
    inner.translate(-hw * 0.8, 0, 0);
    tireParts.push(back, inner);

    const rimParts: THREE.BufferGeometry[] = [];
    const face = hw * 0.66;
    if (s.style === 'steel') {
      rimParts.push(
        latheX(
          [
            [rimR + 0.004, hw * 0.84],
            [rimR - 0.012, hw * 0.8],
            [rimR - 0.03, hw * 0.3],
            [rimR * 0.6, hw * 0.22],
            [rimR * 0.46, hw * 0.52],
            [rimR * 0.22, hw * 0.56],
            [0, hw * 0.56],
          ],
          24,
        ),
      );
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const nut = cylX(0.014, 0.024, 6);
        nut.translate(hw * 0.56, Math.cos(a) * rimR * 0.34, Math.sin(a) * rimR * 0.34);
        rimParts.push(nut);
      }
      const cap = cylX(rimR * 0.16, 0.04, 16, rimR * 0.12);
      cap.translate(hw * 0.58, 0, 0);
      rimParts.push(cap);
    } else {
      // barrel with a bright lip
      rimParts.push(
        latheX(
          [
            [rimR + 0.005, hw * 0.83],
            [rimR - 0.006, hw * 0.8],
            [rimR - 0.016, hw * 0.7],
            [rimR - 0.022, hw * 0.14],
          ],
          24,
        ),
      );
      const hubR = Math.min(0.062, rimR * 0.3);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const base = (i / n) * Math.PI * 2;
        const variants = s.style === 'alloy10' ? [-0.2, 0.2] : [0];
        for (const off of variants) {
          const len = rimR - 0.012 - hubR * 0.5;
          const wid = s.style === 'alloy10' ? 0.026 : 0.058;
          const sp = new THREE.BoxGeometry(0.022, len, wid);
          // taper the spoke towards the rim and lean it inwards a little
          const p = sp.getAttribute('position') as THREE.BufferAttribute;
          for (let k = 0; k < p.count; k++) {
            const t = p.getY(k) / len + 0.5;
            p.setZ(k, p.getZ(k) * (1.25 - 0.5 * t));
            p.setX(k, p.getX(k) - t * 0.012);
          }
          sp.translate(face, hubR * 0.5 + len / 2, 0);
          if (off) {
            // splay pairs: both start near the hub centre line and spread towards the rim
            sp.translate(0, -hubR * 0.5, 0);
            sp.rotateX(off);
            sp.translate(0, hubR * 0.5 * Math.cos(off), 0);
          }
          sp.rotateX(base);
          sp.computeVertexNormals();
          rimParts.push(sp);
        }
      }
      const hub = cylX(hubR, 0.03, 14, hubR * 0.8);
      hub.translate(face + 0.004, 0, 0);
      rimParts.push(hub);
      const cap = cylX(hubR * 0.5, 0.016, 10, hubR * 0.4);
      cap.translate(face + 0.024, 0, 0);
      rimParts.push(cap);
    }
    return { tire: merge(tireParts), rim: merge(rimParts) };
  });
}

/** A spin node (axle-centered group) holding a tire and a rim. `side` = +1 for wheels on the +X side. */
export function roadWheel(s: WheelSpec, side: 1 | -1, rimMat: THREE.Material): THREE.Group {
  const { tire, rim } = wheelGeos(s);
  const spin = new THREE.Group();
  const t = mesh(tire, VM.tire());
  const r = mesh(rim, rimMat);
  if (side < 0) {
    t.rotation.y = Math.PI;
    r.rotation.y = Math.PI;
  }
  spin.add(t, r);
  return spin;
}

/**
 * Attach a spin node to the vehicle root at the axle position; steerable wheels get a yaw pivot
 * on the king-pin axis. Returns the WheelPart entry.
 */
export function mountWheel(root: THREE.Object3D, spin: THREE.Object3D, radius: number, x: number, z: number, steer: boolean): WheelPart {
  if (steer) {
    const pivot = new THREE.Group();
    pivot.name = 'steer';
    pivot.position.set(x, radius, z);
    pivot.add(spin);
    root.add(pivot);
    return { spin, radius, steer: pivot };
  }
  spin.position.set(x, radius, z);
  root.add(spin);
  return { spin, radius };
}

/* ------------------------------------------------------------------ cabin parts */

/**
 * Car seat. (x, z) is where the sitter's hips go, `seatY` the height of the sitting surface.
 * Nothing reaches in front of the backrest plane or above the cushion, so a seated figure fits.
 */
export function carSeat(k: Kit, x: number, z: number, seatY: number, mat: THREE.Material, w = 0.46, baseTo = seatY - 0.3, headrest = true): void {
  k.rbox(w, 0.12, 0.5, 0.04, mat, x, seatY - 0.12, z + 0.08, 1);
  const back = k.rbox(w, 0.6, 0.1, 0.04, mat, x, seatY - 0.04, z - 0.21, 1);
  back.rotation.x = -0.13;
  if (headrest) {
    k.rbox(0.25, 0.17, 0.085, 0.035, mat, x, seatY + 0.6, z - 0.3, 1);
    k.box(0.03, 0.08, 0.02, VM.cabin('#2a2c31'), x, seatY + 0.53, z - 0.285);
  }
  if (baseTo < seatY - 0.13) k.box(w * 0.8, seatY - 0.12 - baseTo, 0.36, VM.cabin('#2a2c31'), x, baseTo, z + 0.06);
}

/**
 * Steering wheel on a column. (x, z) = the driver's hip position, seatY = seat surface; the wheel
 * sits clear of the driver's knees and hands. `tilt` = lean of the wheel plane from vertical.
 */
export function steeringWheel(k: Kit, x: number, z: number, seatY: number, tilt = 0.42, radius = 0.165, columnLen = 0.3, dz = 0.5, dy = 0.45): void {
  const g = new THREE.Group();
  const dark = VM.cabin('#2a2c31');
  const ring = mesh(new THREE.TorusGeometry(radius, 0.014, 6, 20), dark);
  g.add(ring);
  for (const a of [Math.PI / 2 + 0.0, Math.PI * 1.17, Math.PI * 1.83]) {
    const sp = mesh(new THREE.BoxGeometry(0.03, radius, 0.012), dark);
    sp.position.set((Math.cos(a) * radius) / 2, (Math.sin(a) * radius) / 2, 0);
    sp.rotation.z = a - Math.PI / 2;
    g.add(sp);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.04, 16).rotateX(Math.PI / 2), dark);
  hub.position.z = 0.005;
  g.add(hub);
  const col = mesh(new THREE.CylinderGeometry(0.024, 0.028, columnLen, 10).rotateX(Math.PI / 2), dark);
  col.position.z = columnLen / 2 + 0.02;
  g.add(col);
  // wheel plane faces the driver (-Z) and leans back at the top
  g.rotation.x = tilt;
  k.add(g, x, seatY + dy, z + dz);
}

/** Dome-shaped lamp lens lying on a surface whose outward normal is `dir` ('front' = +Z, 'rear' = -Z). */
export function lens(k: Kit, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, bulge: number, dir: 'front' | 'rear', yaw = 0): THREE.Mesh {
  const g = memo('lensDome', () => new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2));
  const m = mesh(g, mat);
  m.scale.set(w, h, bulge * 2);
  m.position.set(x, y, z);
  m.rotation.y = (dir === 'front' ? 0 : Math.PI) + yaw;
  k.g.add(m);
  return m;
}

/** Number plate: thin panel facing +Z ('front') or -Z ('rear'). */
export function plate(k: Kit, text: string, y: number, z: number, dir: 'front' | 'rear', w = 0.46, h = 0.105): void {
  const g = new THREE.PlaneGeometry(w, h);
  const m = mesh(g, VM.plate(text));
  m.position.set(0, y, z + (dir === 'front' ? 0.006 : -0.006));
  if (dir === 'rear') m.rotation.y = Math.PI;
  k.g.add(m);
  const b = k.box(w + 0.02, h + 0.02, 0.01, VM.trim(), 0, y - h / 2 - 0.01, z);
  b.castShadow = false;
}
