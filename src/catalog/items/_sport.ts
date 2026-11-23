/**
 * Shared helpers for the sports / playground catalog files: axis-aligned cylinders, chains,
 * side-profile extrusions, swept channels (slides) and realistic balls.
 */
import * as THREE from 'three';
import { Kit, M, mesh, type V3 } from '../kit';

/** Cylinder whose axis runs along X, centred at (x, y, z). */
export function xcyl(k: Kit, r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, seg = 16): THREE.Mesh {
  return k.rod([x - len / 2, y, z], [x + len / 2, y, z], r, mat, r, seg);
}

/** Cylinder whose axis runs along Z, centred at (x, y, z). */
export function zcyl(k: Kit, r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, seg = 16): THREE.Mesh {
  return k.rod([x, y, z - len / 2], [x, y, z + len / 2], r, mat, r, seg);
}

/** Chain of alternating flat links from a to b (cheap: one box per link). */
export function chain(k: Kit, a: V3, b: V3, mat: THREE.Material, link = 0.05, w = 0.013): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.round(len / link));
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const p0: V3 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0];
    const p1: V3 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1];
    if (i % 2 === 0) k.beam(p0, p1, w, w * 0.32, mat);
    else k.beam(p0, p1, w * 0.32, w, mat);
  }
}

/**
 * Side profile extruded across X: shape x -> local z, shape y -> local y, thickness `t`
 * centred on x = 0 (rockers, silhouettes, slide cheeks).
 */
export function profileX(shape: THREE.Shape, t: number, bevel = 0, curveSegments = 10): THREE.BufferGeometry {
  const b = Math.min(bevel, t / 2 - 0.0005);
  const depth = b > 0 ? t - 2 * b : t;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return g;
}

/** Same as profileX but the profile lies in the XY plane and is extruded along Z, centred. */
export function profileZ(shape: THREE.Shape, t: number, bevel = 0, curveSegments = 10): THREE.BufferGeometry {
  const b = Math.min(bevel, t / 2 - 0.0005);
  const depth = b > 0 ? t - 2 * b : t;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * Sweep a closed cross-section along a path in the YZ plane.
 * path: [z, y] points; section: [x, n] points where n is the offset along the path's "up"
 * normal. Used for slide chutes.
 */
export function sweepYZ(path: Array<[number, number]>, section: Array<[number, number]>): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const ns = section.length;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    let tz = b[0] - a[0];
    let ty = b[1] - a[1];
    const tl = Math.hypot(tz, ty) || 1;
    tz /= tl;
    ty /= tl;
    // up-normal: rotate tangent by +90° in the (z, y) plane, pointing upwards
    let nz = -ty;
    let ny = tz;
    if (ny < 0) {
      nz = -nz;
      ny = -ny;
    }
    for (const [sx, sn] of section) pos.push(sx, p[1] + ny * sn, p[0] + nz * sn);
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < ns; j++) {
      const j1 = (j + 1) % ns;
      const a = i * ns + j;
      const b = i * ns + j1;
      const c = (i + 1) * ns + j;
      const d = (i + 1) * ns + j1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const uv: number[] = [];
  for (let i = 0; i < path.length; i++) for (let j = 0; j < ns; j++) uv.push(section[j][0], i * 0.2);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Smooth a polyline of [z, y] points (Catmull-Rom) into n samples. */
export function smoothPath(pts: Array<[number, number]>, n = 24): Array<[number, number]> {
  const c = new THREE.SplineCurve(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  return c.getPoints(n).map((p) => [p.x, p.y] as [number, number]);
}

/** Closed U-shaped chute cross-section [x, n] (inner surface at n = 0 in the middle). */
export function chuteSection(halfW: number, wall: number, t: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const r = Math.min(0.06, halfW * 0.3);
  // inner surface, left rim -> bottom -> right rim
  pts.push([-halfW, wall]);
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI + (i / 4) * (Math.PI / 2);
    pts.push([-halfW + r + Math.cos(a) * r, r + Math.sin(a) * r]);
  }
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push([halfW - r + Math.cos(a) * r, r + Math.sin(a) * r]);
  }
  pts.push([halfW, wall]);
  // rolled rim + outer surface back
  pts.push([halfW + t, wall + t * 0.6]);
  pts.push([halfW + t, r * 0.5]);
  pts.push([halfW - r * 0.5, -t]);
  pts.push([-halfW + r * 0.5, -t]);
  pts.push([-halfW - t, r * 0.5]);
  pts.push([-halfW - t, wall + t * 0.6]);
  return pts;
}

/* ------------------------------------------------------------------ balls */

export type BallKind = 'soccer' | 'basket' | 'beach' | 'volley' | 'tennis' | 'medicine' | 'bowling';

const ICO_DIRS: V3[] = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: V3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  return raw.map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l] as V3;
  });
})();

/** Patch of a sphere: (s, t) in [-1, 1]² mapped through a cube face (n, u, v) and normalised. */
function cubeStripGeo(r: number, n: V3, u: V3, v: V3, s0: number, s1: number, t0: number, t1: number, nu: number, nv: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const s = s0 + ((s1 - s0) * i) / nu;
      const t = t0 + ((t1 - t0) * j) / nv;
      const x = n[0] + u[0] * s + v[0] * t;
      const y = n[1] + u[1] * s + v[1] * t;
      const z = n[2] + u[2] * s + v[2] * t;
      const l = Math.hypot(x, y, z);
      pos.push((x / l) * r, (y / l) * r, (z / l) * r);
      nor.push(x / l, y / l, z / l);
      uv.push(i / nu, j / nv);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // make sure the winding faces outwards
  const p0 = new THREE.Vector3(pos[0], pos[1], pos[2]);
  const p1 = new THREE.Vector3(pos[3], pos[4], pos[5]);
  const p2 = new THREE.Vector3(pos[(nu + 1) * 3], pos[(nu + 1) * 3 + 1], pos[(nu + 1) * 3 + 2]);
  const fn = p1.clone().sub(p0).cross(p2.clone().sub(p0));
  if (fn.dot(p0) < 0) {
    const ix = g.getIndex()!.array as Uint16Array | Uint32Array;
    for (let i = 0; i < ix.length; i += 3) {
      const tmp = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = tmp;
    }
  }
  return g;
}

/** Spherical polygon (fan) around direction `c` through the ordered unit vectors `ring`. */
function sphereFanGeo(r: number, c: THREE.Vector3, ring: THREE.Vector3[], sub: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    for (let j = 0; j < sub; j++) pts.push(a.clone().lerp(b, j / sub).normalize());
  }
  const mids = pts.map((p) => p.clone().add(c).normalize());
  const pos: number[] = [];
  const push = (v: THREE.Vector3) => pos.push(v.x * r, v.y * r, v.z * r);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    for (const tri of [
      [c, mids[i], mids[i1]],
      [mids[i], pts[i], pts[i1]],
      [mids[i], pts[i1], mids[i1]],
    ]) {
      const [p, q, w] = tri;
      const fn = q.clone().sub(p).cross(w.clone().sub(p));
      if (fn.dot(p) < 0) {
        push(p);
        push(w);
        push(q);
      } else {
        push(p);
        push(q);
        push(w);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nor = pos.map((v) => v / r);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g;
}

function orientTo(m: THREE.Object3D, dir: V3, twist = 0): void {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir));
  const qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twist);
  m.quaternion.copy(q.multiply(qt));
}

function seamRing(k: Kit, R: number, tube: number, mat: THREE.Material, cx: number, cy: number, cz: number, rot: [number, number, number], off: V3 = [0, 0, 0]): THREE.Mesh {
  const m = k.add(mesh(new THREE.TorusGeometry(R, tube, 4, 48), mat), cx + off[0], cy + off[1], cz + off[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  return m;
}

/**
 * A realistic ball of radius r, centred at (x, y, z). `c` = colours (main / second / third).
 */
export function ball(k: Kit, kind: BallKind, r: number, x: number, y: number, z: number, c: { a: string; b?: string; c?: string }): void {
  const g = new Kit();
  switch (kind) {
    case 'soccer': {
      g.sphere(r, M.leather(c.a), 0, 0, 0, 1, 1, 1, 28);
      const patch = M.leather(c.b ?? '#1d1e21');
      const seam = M.matte('#9c9d9c');
      const V = (d: V3) => new THREE.Vector3(d[0], d[1], d[2]);
      ICO_DIRS.forEach((d, i) => {
        const a = V(d);
        const nb = ICO_DIRS.filter((_, j) => j !== i && V(ICO_DIRS[j]).dot(a) > 0.4).map(V);
        // order the neighbours around a
        const t1 = new THREE.Vector3(0, 1, 0).cross(a);
        if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0);
        t1.normalize();
        const t2 = a.clone().cross(t1);
        nb.sort((p, q) => Math.atan2(p.dot(t2), p.dot(t1)) - Math.atan2(q.dot(t2), q.dot(t1)));
        const ring = nb.map((b) => a.clone().multiplyScalar(2).add(b).normalize());
        g.add(mesh(sphereFanGeo(r * 1.004, a, ring, 3), patch));
        // hexagon-hexagon seams: middle third of each icosahedron edge
        for (const b of nb) {
          if (ICO_DIRS.findIndex((q) => V(q).equals(b)) < i) continue;
          const p0 = a.clone().multiplyScalar(2).add(b).normalize().multiplyScalar(r * 1.002);
          const p1 = b.clone().multiplyScalar(2).add(a).normalize().multiplyScalar(r * 1.002);
          const mid = p0.clone().add(p1).multiplyScalar(0.5).normalize().multiplyScalar(r * 1.002);
          const m = g.add(mesh(new THREE.BoxGeometry(0.0018, 0.0018, p0.distanceTo(p1)), seam), mid.x, mid.y, mid.z);
          m.lookAt(p1);
          m.castShadow = false;
        }
      });
      break;
    }
    case 'basket': {
      g.sphere(r, M.leather(c.a), 0, 0, 0, 1, 1, 1, 28);
      const seam = M.rubber('#1b1b1c');
      const t = r * 0.018;
      seamRing(g, r * 1.002, t, seam, 0, 0, 0, [Math.PI / 2, 0, 0]);
      seamRing(g, r * 1.002, t, seam, 0, 0, 0, [0, Math.PI / 2, 0]);
      for (const s of [-1, 1]) seamRing(g, r * 0.79, t, seam, 0, 0, 0, [0, Math.PI / 2, 0], [s * r * 0.62, 0, 0]);
      break;
    }
    case 'beach': {
      const cols = [c.a, '#f6f4ee', c.b ?? '#2f7fd0', '#f6f4ee', c.c ?? '#f2c230', '#f6f4ee'];
      for (let i = 0; i < 6; i++) {
        const geo = new THREE.SphereGeometry(r, 5, 14, (i / 6) * Math.PI * 2, Math.PI / 3, 0.2, Math.PI - 0.4);
        g.add(mesh(geo, M.plastic(cols[i])));
      }
      for (const s of [1, -1]) {
        const cap = new THREE.SphereGeometry(r, 12, 2, 0, Math.PI * 2, 0, 0.21);
        const m = g.add(mesh(cap, M.plastic(c.a)));
        if (s < 0) m.rotation.x = Math.PI;
      }
      g.cyl(r * 0.04, r * 0.012, M.plastic('#f6f4ee'), 0, r * 0.99, 0, r * 0.04, 8);
      break;
    }
    case 'volley': {
      g.sphere(r * 0.99, M.matte('#4a4d52'), 0, 0, 0, 1, 1, 1, 14);
      const cols = [c.a, c.b ?? '#f2c230', c.c ?? '#2459a6'];
      const faces: Array<[V3, V3, V3]> = [
        [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
        [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
        [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
        [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
        [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
      ];
      const gap = 0.022;
      faces.forEach(([n, u, v], fi) => {
        for (let s = 0; s < 3; s++) {
          const t0 = -1 + (2 * s) / 3 + gap;
          const t1 = -1 + (2 * (s + 1)) / 3 - gap;
          const geo = cubeStripGeo(r, n, u, v, -1 + gap, 1 - gap, t0, t1, 7, 2);
          g.add(mesh(geo, M.leather(cols[(fi + s) % 3])));
        }
      });
      break;
    }
    case 'tennis': {
      g.sphere(r, M.fur(c.a), 0, 0, 0, 1, 1, 1, 18);
      const pts: V3[] = [];
      const a = 0.72;
      const b = 1 - a;
      for (let i = 0; i < 48; i++) {
        const tt = (i / 48) * Math.PI * 2;
        const px = a * Math.cos(tt) + b * Math.cos(3 * tt);
        const py = a * Math.sin(tt) - b * Math.sin(3 * tt);
        const pz = 2 * Math.sqrt(a * b) * Math.sin(2 * tt);
        pts.push([px * r * 1.01, pz * r * 1.01, py * r * 1.01]);
      }
      g.tube(pts, r * 0.045, M.matte('#f4f3ee'), { closed: true, seg: 64, radial: 4 });
      break;
    }
    case 'medicine': {
      g.sphere(r, M.leather(c.a), 0, 0, 0, 1, 1, 1, 24);
      const band = M.rubber(c.b ?? '#c23b2b');
      seamRing(g, r * 0.985, r * 0.026, band, 0, 0, 0, [0, Math.PI / 2, 0]);
      seamRing(g, r * 0.985, r * 0.026, band, 0, 0, 0, [Math.PI / 2, 0, 0]);
      break;
    }
    case 'bowling': {
      g.sphere(r, M.lacquer(c.a), 0, 0, 0, 1, 1, 1, 28);
      const hole = M.matte('#0d0d0e');
      const dirs: V3[] = [
        [-0.2, 0.55, 0.81],
        [0.2, 0.55, 0.81],
        [0, 0.2, 0.98],
      ];
      dirs.forEach((d, i) => {
        const l = Math.hypot(...d);
        const n: V3 = [d[0] / l, d[1] / l, d[2] / l];
        const m = g.add(mesh(new THREE.CylinderGeometry(i === 2 ? r * 0.15 : r * 0.12, i === 2 ? r * 0.15 : r * 0.12, r * 0.02, 14), hole), n[0] * r * 0.995, n[1] * r * 0.995, n[2] * r * 0.995);
        orientTo(m, n);
      });
      break;
    }
  }
  k.sub(g, x, y, z);
}
