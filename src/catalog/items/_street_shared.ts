/** Helpers shared by the street / playground / public items: canvas-textured materials and a few geometry tools. */
import * as THREE from 'three';
import { Kit, M, noise3, rng } from '../kit';

export type Colors = Record<string, string>;
export type C2D = CanvasRenderingContext2D;

const hasDom = typeof document !== 'undefined';
const matCache = new Map<string, THREE.MeshStandardMaterial>();

export interface CanvasMatOpts {
  /** flat color used when no DOM canvas is available (tests / SSR) */
  fallback: string;
  rough?: number;
  metal?: number;
  /** alpha-blended (nets, grids): not shadow casting, no depth write */
  transparent?: boolean;
  doubleSide?: boolean;
  /** tile the texture: repeats per UV unit */
  repeat?: [number, number];
  /** make the drawing glow a little (lit signs, screens) */
  emissive?: number;
  /** Kit box / cylinder primitives get UVs in meters (use together with `repeat` = tiles per meter) */
  uvMeters?: boolean;
}

/** Cached material whose color map is painted once on a canvas. Shared: never mutate or dispose. */
export function canvasMat(key: string, w: number, h: number, draw: (c: C2D, w: number, h: number) => void, o: CanvasMatOpts): THREE.MeshStandardMaterial {
  let m = matCache.get(key);
  if (m) return m;
  let map: THREE.CanvasTexture | null = null;
  if (hasDom) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    if (c) {
      c.lineJoin = 'round';
      c.lineCap = 'round';
      draw(c, w, h);
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      if (o.repeat) {
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(o.repeat[0], o.repeat[1]);
      }
    }
  }
  m = new THREE.MeshStandardMaterial({
    color: map ? '#ffffff' : o.fallback,
    map,
    roughness: o.rough ?? 0.6,
    metalness: o.metal ?? 0,
    transparent: o.transparent ?? false,
    depthWrite: !(o.transparent ?? false),
    opacity: map || !o.transparent ? 1 : 0.25,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (o.emissive && map) {
    m.emissive = new THREE.Color('#ffffff');
    m.emissiveMap = map;
    m.emissiveIntensity = o.emissive;
  }
  if (o.uvMeters) m.userData.uvMeters = true;
  m.name = `canvas|${key}`;
  matCache.set(key, m);
  return m;
}

/** canvas rounded-rect path by top-left corner */
export function crr(c: C2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.arcTo(x + w, y, x + w, y + rr, rr);
  c.lineTo(x + w, y + h - rr);
  c.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  c.lineTo(x + rr, y + h);
  c.arcTo(x, y + h, x, y + h - rr, rr);
  c.lineTo(x, y + rr);
  c.arcTo(x, y, x + rr, y, rr);
  c.closePath();
}

/** hand-drawn looking wobbly line (chalk squiggles standing in for text) */
export function squiggle(c: C2D, x0: number, y: number, x1: number, amp: number, seed: number): void {
  const r = rng(seed);
  c.beginPath();
  c.moveTo(x0, y);
  const n = Math.max(3, Math.round(Math.abs(x1 - x0) / (amp * 2.2)));
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    c.quadraticCurveTo(x - (x1 - x0) / n / 2, y + (r() - 0.5) * 2 * amp, x, y + (r() - 0.5) * amp * 0.6);
  }
  c.stroke();
}

/** A net / wire grid: opaque lines on a transparent background. `diamond` rotates the mesh by 45°. */
export function netMat(color: string, lines = 0.09, diamond = false, repeat: [number, number] = [1, 1]): THREE.MeshStandardMaterial {
  return canvasMat(
    `net|${color}|${lines}|${diamond}|${repeat.join('x')}`,
    64,
    64,
    (c, s) => {
      c.clearRect(0, 0, s, s);
      c.strokeStyle = color;
      c.lineWidth = s * lines;
      c.lineCap = 'butt';
      if (diamond) {
        for (const d of [-1, 0, 1]) {
          c.beginPath();
          c.moveTo(d * s, 0);
          c.lineTo(d * s + s, s);
          c.moveTo(d * s + s, 0);
          c.lineTo(d * s, s);
          c.stroke();
        }
      } else {
        c.beginPath();
        c.moveTo(0, s / 2);
        c.lineTo(s, s / 2);
        c.moveTo(s / 2, 0);
        c.lineTo(s / 2, s);
        c.stroke();
      }
    },
    { fallback: color, transparent: true, doubleSide: true, rough: 0.7, repeat },
  );
}

/** Speckled surface (EPDM rubber, cork, terrazzo): base color with random flecks. Tiles every `1/rep` meters. */
export function speckleMat(base: string, flecks: string[], rough = 0.9, density = 900, perMeter = 1): THREE.MeshStandardMaterial {
  return canvasMat(
    `speckle|${base}|${flecks.join(',')}|${density}|${perMeter}`,
    256,
    256,
    (c, s) => {
      c.fillStyle = base;
      c.fillRect(0, 0, s, s);
      const r = rng(41);
      for (let i = 0; i < density; i++) {
        c.fillStyle = flecks[Math.floor(r() * flecks.length)];
        const x = r() * s;
        const y = r() * s;
        const rad = 0.8 + r() * 1.6;
        c.beginPath();
        c.arc(x, y, rad, 0, Math.PI * 2);
        c.fill();
      }
    },
    { fallback: base, rough, repeat: [perMeter, perMeter], uvMeters: true },
  );
}

/* ------------------------------------------------------------------ geometry */

/** Set UVs from positions (meters): u = x * s, v = z * s (flat horizontal parts) or v = y * s (`vertical`). */
export function planarUV(g: THREE.BufferGeometry, s = 1, vertical = false): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) * s;
    uv[i * 2 + 1] = (vertical ? p.getY(i) : p.getZ(i)) * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Flat face in the XY plane (facing +Z) cut to `shape`, UVs stretched 0..1 over the w × h box around (cx, cy). */
export function shapeFaceGeo(shape: THREE.Shape, w: number, h: number, cx = 0, cy = 0, curveSegments = 8): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shape, curveSegments);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - cx) / w + 0.5, (p.getY(i) - cy) / h + 0.5);
  uv.needsUpdate = true;
  return g;
}

/** Plane facing +Z, w × h, centered. */
export function faceGeo(w: number, h: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h);
}

/** Extrude a profile drawn in (z, y) along X (centered on x). Good for side silhouettes. */
export function extrudeX(shape: THREE.Shape, width: number, bevel = 0, curveSegments = 8): THREE.BufferGeometry {
  const b = Math.min(bevel, width / 2 - 0.0005);
  const depth = b > 0 ? width - 2 * b : width;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments });
  g.translate(0, 0, -depth / 2);
  // shape x -> world z, extrusion -> world x
  g.rotateY(Math.PI / 2);
  g.scale(1, 1, -1);
  // the mirror flips the winding: restore it
  const idx = g.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
  } else {
    for (const name of Object.keys(g.attributes)) {
      const at = g.getAttribute(name) as THREE.BufferAttribute;
      const n = at.itemSize;
      const arr = at.array as Float32Array;
      for (let i = 0; i + 2 < at.count; i += 3) {
        for (let q = 0; q < n; q++) {
          const t = arr[(i + 1) * n + q];
          arr[(i + 1) * n + q] = arr[(i + 2) * n + q];
          arr[(i + 2) * n + q] = t;
        }
      }
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Polygon shape from points. */
export function polyShape(pts: Array<[number, number]>): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

/**
 * Sweep a closed cross-section along a path lying in the YZ plane (slides, gutters, curved roofs).
 * `profile` = [x, n] pairs (x lateral, n = offset along the path normal, "up"); `path` = [z, y] points.
 */
export function sweepYZ(profile: Array<[number, number]>, path: Array<[number, number]>, capEnds = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const np = profile.length;
  const frames: Array<{ z: number; y: number; nz: number; ny: number }> = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    let tz = b[0] - a[0];
    let ty = b[1] - a[1];
    const l = Math.hypot(tz, ty) || 1;
    tz /= l;
    ty /= l;
    // normal = tangent rotated +90° in the (z, y) plane, pointing up for a path running towards +z
    frames.push({ z: path[i][0], y: path[i][1], nz: -ty, ny: tz });
  }
  // duplicate vertices per profile edge so edges stay crisp
  for (let i = 0; i < frames.length - 1; i++) {
    const f0 = frames[i];
    const f1 = frames[i + 1];
    for (let j = 0; j < np; j++) {
      const p0 = profile[j];
      const p1 = profile[(j + 1) % np];
      const base = pos.length / 3;
      pos.push(p0[0], f0.y + f0.ny * p0[1], f0.z + f0.nz * p0[1]);
      pos.push(p1[0], f0.y + f0.ny * p1[1], f0.z + f0.nz * p1[1]);
      pos.push(p0[0], f1.y + f1.ny * p0[1], f1.z + f1.nz * p0[1]);
      pos.push(p1[0], f1.y + f1.ny * p1[1], f1.z + f1.nz * p1[1]);
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  if (capEnds) {
    const tri = THREE.ShapeUtils.triangulateShape(
      profile.map(([x, n]) => new THREE.Vector2(x, n)),
      [],
    );
    for (const end of [0, frames.length - 1]) {
      const f = frames[end];
      const base = pos.length / 3;
      for (const [x, n] of profile) pos.push(x, f.y + f.ny * n, f.z + f.nz * n);
      for (const t of tri) {
        const [a, b, c] = t.map((q) => profile[q]);
        // a counter-clockwise triangle in (x, n) faces along the path tangent
        const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
        if (ccw === (end !== 0)) idx.push(base + t[0], base + t[1], base + t[2]);
        else idx.push(base + t[0], base + t[2], base + t[1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Helical coil spring standing on y = 0. */
export function coilGeo(r: number, wire: number, turns: number, h: number, radial = 6): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = Math.round(turns * 14);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, wire + t * (h - 2 * wire), Math.sin(a) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, radial, false);
}

/** Bend a geometry sideways: every vertex is shifted by fn(y). */
export function bendGeo(g: THREE.BufferGeometry, fn: (y: number) => [number, number]): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const [dx, dz] = fn(p.getY(i));
    p.setXYZ(i, p.getX(i) + dx, p.getY(i), p.getZ(i) + dz);
  }
  g.computeVertexNormals();
  return g;
}

/** Radially flute + roughen a lathe-like geometry around the Y axis (gnarly trunks). */
export function gnarlGeo(g: THREE.BufferGeometry, lobes: number, amp: number, twist: number, seed = 1): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + amp * Math.sin(a * lobes + y * twist + seed) + amp * 0.8 * (noise3(Math.cos(a) * 2 + seed, y * 3, Math.sin(a) * 2) - 0.5);
    p.setXYZ(i, x * k, y, z * k);
  }
  return g;
}

/** A horizontal tube with a round cap disc: short cylinder whose axis points along `dir` ('x' | 'z'). */
export function axisCyl(k: Kit, r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, axis: 'x' | 'z', rEnd: number = r, seg = 14): THREE.Mesh {
  const g = new THREE.CylinderGeometry(rEnd, r, len, seg);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  return k.geo(g, mat, x, y, z);
}

/** Galvanized steel used for sign posts and rails. */
export const galv = (): THREE.MeshStandardMaterial => M.metal('#b4b9bd', 0.5, 0.85);
