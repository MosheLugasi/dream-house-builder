/**
 * Upholstery geometry for seating (sofas, armchairs, ottomans): padded panels with rounded seams,
 * crowning, tufting dimples and channels; a bend deformer for curved pieces; arm profiles and
 * leg / base styles.
 */
import * as THREE from 'three';
import { Kit, M, extrudeZ, mesh, noise3, type V3 } from '../kit';

/* ---------------------------------------------------------------- padded panel */

export interface PadOpts {
  /** thickness of the front sheet (above the seam plane) */
  t: number;
  /** thickness of the back sheet (0 = open back, for faces resting on a frame) */
  tB?: number;
  /** edge round-over radius (in plan); defaults to min(t, w/2, h/2) */
  r?: number;
  /** edge profile exponent: 2 = round, 3..5 = boxy with a crisp welt */
  p?: number;
  /** extra bulge in the middle of the front face (meters) */
  crown?: number;
  /** interior grid step (meters) */
  step?: number;
  /** segments across each rounded edge band */
  eN?: number;
  /** tufting buttons (panel coordinates), dimple depth / radius */
  tufts?: Array<[number, number]>;
  tuftDepth?: number;
  tuftR?: number;
  /** vertical grooves at these x positions, horizontal grooves at these y positions */
  channels?: number[];
  rows?: number[];
  grooveDepth?: number;
  grooveW?: number;
  /** soft random wrinkles (meters) */
  wrinkle?: number;
  seed?: number;
  /** thickness multipliers at the bottom (y = -h/2) and top (y = +h/2) edges */
  tBot?: number;
  tTop?: number;
  /** interior grid step of the back sheet (fine for pads that get bent) */
  backStep?: number;
  /** extra grid lines */
  xs?: number[];
  ys?: number[];
}

export interface Pad {
  geo: THREE.BufferGeometry;
  /** height of the front surface at an interior point */
  surf(x: number, y: number): number;
}

function axisCoords(len: number, r: number, eN: number, step: number, extra: number[] = []): number[] {
  const half = len / 2;
  const pts: number[] = [];
  for (let i = 0; i < eN; i++) {
    const off = r * (1 - Math.cos(((i / eN) * Math.PI) / 2));
    pts.push(-half + off, half - off);
  }
  const L = len - 2 * r;
  const n = Math.max(1, Math.ceil(L / step - 1e-6));
  for (let i = 0; i <= n; i++) pts.push(-half + r + (L * i) / n);
  for (const e of extra) if (e > -half + r && e < half - r) pts.push(e);
  pts.sort((a, b) => a - b);
  const out: number[] = [];
  for (const p of pts) if (!out.length || p - out[out.length - 1] > 0.004) out.push(p);
  out[out.length - 1] = half;
  return out;
}

/**
 * Padded panel in the XY plane (w along X, h along Y), front face towards +Z. The front and the
 * back sheet meet at z = 0 along a rounded-rectangle seam, like a sewn cushion.
 */
export function padGeo(w: number, h: number, o: PadOpts): Pad {
  const tB = o.tB ?? 0;
  const r = Math.max(0.003, Math.min(o.r ?? Math.min(o.t, 0.08), w / 2 - 0.001, h / 2 - 0.001));
  const p = o.p ?? 2.4;
  const eN = o.eN ?? 3;
  const step = o.step ?? 0.14;
  const crown = o.crown ?? 0;
  const tuftD = o.tuftDepth ?? 0.03;
  const tuftR2 = (o.tuftR ?? 0.045) ** 2;
  const gD = o.grooveDepth ?? 0.03;
  const gW2 = (o.grooveW ?? 0.022) ** 2;
  const wr = o.wrinkle ?? 0;
  const seed = o.seed ?? 1;
  const tBot = o.tBot ?? 1;
  const tTop = o.tTop ?? 1;
  const ix = w / 2 - r;
  const iy = h / 2 - r;

  const frontZ = (x: number, y: number, f: number): number => {
    const X = x / (w / 2);
    const Y = y / (h / 2);
    const thick = o.t * (tBot + ((tTop - tBot) * (Y + 1)) / 2);
    let z = thick + crown * Math.max(0, 1 - X * X) * Math.max(0, 1 - Y * Y);
    if (o.tufts) for (const [tx, ty] of o.tufts) z -= tuftD * Math.exp(-((x - tx) ** 2 + (y - ty) ** 2) / tuftR2);
    if (o.channels) {
      let g = 0;
      for (const cx of o.channels) g = Math.max(g, Math.exp(-((x - cx) ** 2) / gW2));
      z -= gD * g;
    }
    if (o.rows) {
      let g = 0;
      for (const cy of o.rows) g = Math.max(g, Math.exp(-((y - cy) ** 2) / gW2));
      z -= gD * g;
    }
    if (wr) z += wr * 2 * (noise3(x * 7 + seed * 5.1, y * 7, seed * 1.7) - 0.5) * (0.4 + 0.6 * f);
    return z * f;
  };

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const sheet = (xs: number[], ys: number[], front: boolean): void => {
    const base = pos.length / 3;
    for (const y of ys) {
      for (const x of xs) {
        const qx = Math.max(-ix, Math.min(ix, x));
        const qy = Math.max(-iy, Math.min(iy, y));
        let ox = x - qx;
        let oy = y - qy;
        const linf = Math.max(Math.abs(ox), Math.abs(oy));
        const l2 = Math.hypot(ox, oy);
        if (l2 > 1e-9) {
          ox *= linf / l2;
          oy *= linf / l2;
        }
        const s = Math.min(1, Math.max(0, 1 - linf / r));
        const f = Math.pow(Math.max(0, 1 - Math.pow(1 - s, p)), 1 / p);
        const px = qx + ox;
        const py = qy + oy;
        const z = front ? frontZ(px, py, f) : -tB * f;
        pos.push(px, py, z);
        // unfold the rounded edge band so the weave is not smeared over the sides
        const flat = front ? o.t * (tBot + ((tTop - tBot) * (py / (h / 2) + 1)) / 2) : tB;
        const un = linf > 1e-9 ? (Math.max(0, flat - Math.abs(z)) * 0.9) / linf : 0;
        uv.push(px + ox * un, py + oy * un);
      }
    }
    const nx = xs.length;
    for (let j = 0; j < ys.length - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = base + j * nx + i;
        const b = a + 1;
        const c = a + nx + 1;
        const d = a + nx;
        if (front) idx.push(a, b, c, a, c, d);
        else idx.push(a, c, b, a, d, c);
      }
    }
  };
  const ex = [...(o.xs ?? [])];
  const ey = [...(o.ys ?? [])];
  if (o.tufts) for (const [tx, ty] of o.tufts) {
    ex.push(tx);
    ey.push(ty);
  }
  if (o.channels) for (const c of o.channels) ex.push(c - 0.012, c, c + 0.012);
  if (o.rows) for (const c of o.rows) ey.push(c - 0.012, c, c + 0.012);
  sheet(axisCoords(w, r, eN, step, ex), axisCoords(h, r, eN, step, ey), true);
  if (tB > 0) sheet(axisCoords(w, r, eN, o.backStep ?? 10), axisCoords(h, r, eN, 10), false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return {
    geo: g,
    surf: (x, y) => frontZ(x, y, 1),
  };
}

/** Button-tufting grid (diamond pattern) inside a w × h panel. */
export function diamondTufts(w: number, h: number, cols: number, rows: number, marginX = 0.08, marginY = 0.08): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const dx = (w - 2 * marginX) / Math.max(1, cols - 1);
  const dy = rows > 1 ? (h - 2 * marginY) / (rows - 1) : 0;
  for (let j = 0; j < rows; j++) {
    const odd = j % 2 === 1;
    const n = odd ? cols - 1 : cols;
    for (let i = 0; i < n; i++) {
      out.push([-w / 2 + marginX + dx * (i + (odd ? 0.5 : 0)), rows > 1 ? -h / 2 + marginY + dy * j : 0]);
    }
  }
  return out;
}

export interface PadPlace {
  /** rotation about X applied to the panel (e.g. -PI/2 lays it flat, front up) */
  rx?: number;
  ry?: number;
  /** button material: adds a small button at every tuft */
  buttons?: THREE.Material;
  buttonR?: number;
}

/**
 * Add a padded panel to a kit. The panel's CENTRE (seam plane) is placed at (x, y, z), then
 * rotated by `rx` about X and `ry` about Y.
 */
export function addPad(k: Kit, w: number, h: number, o: PadOpts, mat: THREE.Material, x: number, y: number, z: number, pl: PadPlace = {}): THREE.Group {
  const pad = padGeo(w, h, o);
  const g = new THREE.Group();
  g.add(mesh(pad.geo, mat));
  if (pl.buttons && o.tufts) {
    const br = pl.buttonR ?? 0.011;
    const bg = new THREE.SphereGeometry(br, 5, 3);
    for (const [tx, ty] of o.tufts) {
      const b = mesh(bg, pl.buttons);
      b.position.set(tx, ty, pad.surf(tx, ty) - br * 0.15);
      b.scale.set(1, 1, 0.55);
      g.add(b);
    }
  }
  g.rotation.order = 'YXZ';
  g.rotation.set(pl.rx ?? 0, pl.ry ?? 0, 0);
  k.add(g, x, y, z);
  return g;
}

/** Horizontal cushion (front sheet up) with its BOTTOM at y; w along X, d along Z. */
export function seatPad(k: Kit, w: number, d: number, t: number, mat: THREE.Material, x: number, y: number, z: number, o: Partial<PadOpts> = {}, pl: PadPlace = {}): THREE.Group {
  const tB = o.tB ?? t * 0.4;
  return addPad(k, w, d, { r: Math.min(t * 0.55, 0.07), p: 2.6, ...o, t: t - tB, tB }, mat, x, y + tB, z, { rx: -Math.PI / 2, ...pl });
}

/**
 * Upright cushion leaning back by `lean` radians. (x, y, z) is its bottom-back edge; `ry` turns
 * the whole cushion (0 = facing +Z).
 */
export function backPad(k: Kit, w: number, h: number, t: number, lean: number, mat: THREE.Material, x: number, y: number, z: number, o: Partial<PadOpts> = {}, ry = 0, pl: PadPlace = {}): THREE.Group {
  const tB = o.tB ?? t * 0.35;
  const outer = new THREE.Group();
  const inner = new Kit();
  addPad(inner, w, h, { r: Math.min(t * 0.5, 0.07), p: 2.4, ...o, t: t - tB, tB }, mat, 0, h / 2, tB, pl);
  inner.g.rotation.x = -lean;
  outer.add(inner.g);
  outer.rotation.y = ry;
  k.add(outer, x, y, z);
  return outer;
}

/* ---------------------------------------------------------------- bending (curved sofas, barrel chairs) */

/**
 * Bend every mesh of `root` around a vertical axis at (0, cz): x becomes arc length on the
 * circle of radius (cz - z). Geometry must be finely subdivided along X.
 */
export function bendGroup(root: THREE.Object3D, cz: number, R: number): void {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const rel = new THREE.Matrix4();
  for (const me of meshes) {
    rel.multiplyMatrices(inv, me.matrixWorld);
    const g = me.geometry.clone();
    g.applyMatrix4(rel);
    if (rel.determinant() < 0) {
      // keep outward winding after a mirror
      const ix = g.getIndex();
      if (ix) {
        const a = ix.array as Uint16Array | Uint32Array;
        for (let i = 0; i < a.length; i += 3) {
          const t = a[i + 1];
          a[i + 1] = a[i + 2];
          a[i + 2] = t;
        }
      }
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const th = x / R;
      const rho = cz - z;
      const c = Math.cos(th);
      const s = Math.sin(th);
      p.setXYZ(i, rho * s, p.getY(i), cz - rho * c);
      const nx = n.getX(i);
      const nz = n.getZ(i);
      n.setXYZ(i, nx * c - nz * s, n.getY(i), nx * s + nz * c);
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const nm = mesh(g, me.material as THREE.Material);
    me.parent?.remove(me);
    root.add(nm);
  }
  // drop the now empty transform groups
  const empties: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && !(o as THREE.Mesh).isMesh) empties.push(o);
  });
  for (const e of empties) e.parent?.remove(e);
}

/** Subdivided box (for parts that get bent). Bottom at y, centred on x / z. */
export function segBoxGeo(w: number, h: number, d: number, step = 0.08): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / step)), 1, 1);
  g.translate(0, h / 2, 0);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    if (ax > 0.5) uv.setXY(i, p.getZ(i), p.getY(i));
    else if (ay > 0.5) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}

/* ---------------------------------------------------------------- arms */

export type ArmKind = 'track' | 'rolled' | 'flared' | 'slope' | 'round' | 'box' | 'scroll' | 'none' | 'wood';

/** Rounded rectangle path with separate top / bottom corner radii (x0..x1, y0..y1). */
function rrect(s: THREE.Shape, x0: number, y0: number, x1: number, y1: number, rt: number, rb: number): THREE.Shape {
  rt = Math.min(rt, (x1 - x0) / 2, (y1 - y0) / 2);
  rb = Math.min(rb, (x1 - x0) / 2, (y1 - y0) / 2);
  s.moveTo(x0 + rb, y0);
  s.lineTo(x1 - rb, y0);
  if (rb > 0) s.absarc(x1 - rb, y0 + rb, rb, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - rt);
  if (rt > 0) s.absarc(x1 - rt, y1 - rt, rt, 0, Math.PI / 2, false);
  s.lineTo(x0 + rt, y1);
  if (rt > 0) s.absarc(x0 + rt, y1 - rt, rt, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + rb);
  if (rb > 0) s.absarc(x0 + rb, y0 + rb, rb, Math.PI, Math.PI * 1.5, false);
  return s;
}

/**
 * Front-view profile of a RIGHT arm: x from 0 (seat side) to aw (outside), y from 0 to ah.
 * The profile is inset by `b` (the extrusion bevel grows it back).
 */
export function armShape(kind: ArmKind, aw: number, ah: number, b: number): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = b;
  const x1 = aw - b;
  const y0 = b;
  const y1 = ah - b;
  const W = x1 - x0;
  switch (kind) {
    case 'rolled':
    case 'scroll': {
      // panel tucked under an outward roll
      const rr = Math.min(kind === 'scroll' ? W * 0.5 : W * 0.48, 0.11);
      const cx = x1 - rr;
      const cy = y1 - rr;
      const a0 = -1.25;
      s.moveTo(x0, y0);
      s.lineTo(cx + rr * Math.cos(a0) - 0.004, y0);
      s.lineTo(cx + rr * Math.cos(a0), cy + rr * Math.sin(a0));
      s.absarc(cx, cy, rr, a0, Math.PI, false);
      s.lineTo(x0, cy - 0.02);
      s.lineTo(x0, y0);
      return s;
    }
    case 'flared': {
      const rr = Math.min(W * 0.36, 0.075);
      const cx = x1 - rr;
      const cy = y1 - rr;
      s.moveTo(x0 + W * 0.12, y0);
      s.lineTo(x0 + W * 0.62, y0);
      s.quadraticCurveTo(x0 + W * 0.66, cy * 0.6, cx + rr * Math.cos(-1.0), cy + rr * Math.sin(-1.0));
      s.absarc(cx, cy, rr, -1.0, Math.PI * 0.92, false);
      s.quadraticCurveTo(x0 + W * 0.05, cy * 0.75, x0 + W * 0.12, y0 + cy * 0.25);
      s.lineTo(x0 + W * 0.12, y0);
      return s;
    }
    case 'round':
      return rrect(s, x0, y0, x1, y1, W * 0.48, 0);
    case 'box':
      return rrect(s, x0, y0, x1, y1, 0.025, 0);
    case 'track':
    default:
      return rrect(s, x0, y0, x1, y1, Math.min(0.045, W * 0.3), 0);
  }
}

/** Side-view profile (z, y) of a sloped arm: high at the back, lower and rounded at the front. */
export function slopeArmShape(d: number, ah: number, drop: number, b: number): THREE.Shape {
  const s = new THREE.Shape();
  const z0 = -d / 2 + b;
  const z1 = d / 2 - b;
  const y0 = b;
  const yb = ah - b;
  const yf = ah - drop - b;
  const r = 0.06;
  s.moveTo(z0, y0);
  s.lineTo(z1, y0);
  s.lineTo(z1, yf - r);
  s.quadraticCurveTo(z1, yf, z1 - r, yf + r * 0.15);
  s.quadraticCurveTo((z0 + z1) / 2, yb - 0.01, z0 + 0.05, yb);
  s.quadraticCurveTo(z0, yb, z0, yb - 0.05);
  s.lineTo(z0, y0);
  return s;
}

/**
 * Upholstered arm. (x, y, z): centre of the arm's inner bottom edge... precisely: the arm occupies
 * x in [x, x + side * aw], y in [y, y + ah], z in [z - d/2, z + d/2]. `side` = +1 right arm, -1 left.
 */
export function upholsteredArm(k: Kit, kind: ArmKind, aw: number, ah: number, d: number, mat: THREE.Material, x: number, y: number, z: number, side: 1 | -1): THREE.Mesh {
  const b = Math.min(0.022, aw * 0.15);
  let g: THREE.BufferGeometry;
  if (kind === 'slope') {
    g = extrudeZ(slopeArmShape(d, ah, ah * 0.28, b), aw, b, 6);
    // shape x -> world z, extrusion -> world x
    g.rotateY(-Math.PI / 2);
    g.translate(aw / 2, 0, 0);
  } else {
    g = extrudeZ(armShape(kind, aw, ah, b), d, b, kind === 'rolled' || kind === 'scroll' || kind === 'flared' ? 7 : kind === 'round' ? 6 : 3);
  }
  const m = k.geo(g, mat, x, y, z);
  if (side < 0) m.scale.x = -1;
  return m;
}

/* ---------------------------------------------------------------- legs & bases */

export type BaseKind = 'taper' | 'turned' | 'bun' | 'block' | 'brass' | 'sled' | 'hairpin' | 'plinth' | 'skirt' | 'wood' | 'none';

/** Round tapered leg with an optional metal ferrule; (x, z) is the top centre, splay in x/z. */
export function taperLeg(k: Kit, x: number, z: number, h: number, mat: THREE.Material, rTop = 0.022, rBot = 0.013, sx = 0, sz = 0, ferrule?: THREE.Material): void {
  const tilt = Math.atan2(Math.hypot(sx, sz), h);
  const lift = rBot * Math.sin(tilt);
  k.rod([x + sx, lift, z + sz], [x, h, z], rBot, mat, rTop, 10);
  if (ferrule) {
    const fh = Math.min(0.03, h * 0.25);
    const t = fh / h;
    const r = rBot + (rTop - rBot) * t;
    k.rod([x + sx, lift, z + sz], [x + sx * (1 - t), fh, z + sz * (1 - t)], rBot + 0.0015, ferrule, r + 0.0015, 10);
  }
}

/** Turned leg (lathe) with a brass castor cup; bottom at y = 0. */
export function turnedLeg(k: Kit, x: number, z: number, h: number, mat: THREE.Material, r = 0.03, cup?: THREE.Material): void {
  const c = cup ? 0.028 : 0;
  if (cup) {
    k.lathe([[0, 0], [r * 0.55, 0], [r * 0.62, 0.012], [r * 0.7, c], [0, c]], cup, x, 0, z, 10);
  }
  const H = h - c;
  const prof: Array<[number, number]> = [
    [0, 0],
    [r * 0.5, 0],
    [r * 0.62, H * 0.12],
    [r * 0.85, H * 0.42],
    [r * 1.0, H * 0.58],
    [r * 0.75, H * 0.66],
    [r * 0.9, H * 0.74],
    [r * 0.95, H * 0.94],
    [r * 0.8, H],
    [0, H],
  ];
  k.lathe(prof, mat, x, c, z, 10);
}

/** Flattened bun foot. */
export function bunFoot(k: Kit, x: number, z: number, h: number, mat: THREE.Material, r = 0.045): void {
  k.sphere(r, mat, x, h / 2, z, 1, h / 2 / r, 1, 8);
}

/**
 * Base under an upholstered body whose underside is at y = legH, footprint w × d centred at (cx, cz).
 */
export function sofaBase(
  k: Kit,
  kind: BaseKind,
  w: number,
  d: number,
  legH: number,
  legMat: THREE.Material,
  upMat: THREE.Material,
  cx = 0,
  cz = 0,
  opts: { mid?: boolean; inset?: number; splay?: number } = {},
): void {
  const inset = opts.inset ?? 0.07;
  const lx = w / 2 - inset;
  const lz = d / 2 - inset;
  const corners: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  if (opts.mid) corners.push([0, -1], [0, 1]);
  switch (kind) {
    case 'taper': {
      const sp = opts.splay ?? 0.025;
      for (const [sx, sz] of corners) taperLeg(k, cx + sx * lx, cz + sz * lz, legH, legMat, 0.022, 0.012, sx * sp, sz * sp * 0.8);
      break;
    }
    case 'brass': {
      const sp = opts.splay ?? 0.018;
      for (const [sx, sz] of corners) taperLeg(k, cx + sx * lx, cz + sz * lz, legH, legMat, 0.021, 0.012, sx * sp, sz * sp, M.brass());
      break;
    }
    case 'turned': {
      for (const [sx, sz] of corners) {
        if (sz > 0) turnedLeg(k, cx + sx * lx, cz + sz * lz, legH, legMat, 0.03, M.brass());
        else taperLeg(k, cx + sx * lx, cz + sz * lz, legH, legMat, 0.022, 0.015, sx * 0.012, -0.02);
      }
      break;
    }
    case 'bun':
      for (const [sx, sz] of corners) bunFoot(k, cx + sx * lx, cz + sz * lz, legH, legMat, Math.max(0.04, legH * 0.55));
      break;
    case 'block':
      for (const [sx, sz] of corners) k.rbox(0.05, legH, 0.05, 0.006, legMat, cx + sx * lx, 0, cz + sz * lz, 1);
      break;
    case 'sled': {
      // flat-bar loops under each side
      const t = 0.012;
      const bw = 0.04;
      for (const sx of [-1, 1]) {
        const x = cx + sx * (w / 2 - 0.09);
        k.box(bw, t, d - 0.1, legMat, x, 0, cz);
        for (const sz of [-1, 1]) k.box(bw, legH, t, legMat, x, 0, cz + sz * (d / 2 - 0.05 - t / 2));
        k.box(bw, t, d - 0.1, legMat, x, legH - t, cz);
      }
      break;
    }
    case 'hairpin': {
      for (const [sx, sz] of corners) {
        const x = cx + sx * (lx - 0.02);
        const z = cz + sz * (lz - 0.02);
        for (const o of [-1, 1]) {
          k.rod([x + sx * 0.012, 0.006, z + sz * 0.012], [x + o * 0.03 * Math.abs(sx || 1), legH, z - sz * 0.02], 0.005, legMat, 0.005, 6);
        }
        k.cyl(0.008, 0.008, legMat, x + sx * 0.012, 0, z + sz * 0.012, 0.008, 8);
        k.box(0.08, 0.006, 0.06, legMat, x, legH - 0.006, z - sz * 0.01);
      }
      break;
    }
    case 'plinth':
      k.rbox(w - 0.1, legH, d - 0.1, 0.01, legMat, cx, 0, cz, 1);
      break;
    case 'skirt': {
      // tailored skirt hanging from the deck, kick pleats at the corners
      const t = 0.012;
      const gap = 0.012;
      const sh = legH - gap;
      k.rbox(w - 0.012, sh, t, 0.004, upMat, cx, gap, cz + d / 2 - t / 2 - 0.002, 1);
      k.rbox(w - 0.012, sh, t, 0.004, upMat, cx, gap, cz - d / 2 + t / 2 + 0.002, 1);
      for (const sx of [-1, 1]) k.rbox(t, sh, d - 0.012, 0.004, upMat, cx + sx * (w / 2 - t / 2 - 0.002), gap, cz, 1);
      // pleat shadows
      const dark = M.matte('#2a2624');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.02, gap + 0.01, dark, cx + sx * (w / 2 - 0.08), 0, cz + sz * (d / 2 - 0.08), 0.02, 8);
      for (const sx of [-1, 1]) k.box(0.004, sh * 0.96, 0.004, dark, cx + sx * (w / 2 - 0.004), gap, cz + d / 2 - 0.004);
      break;
    }
    case 'wood':
    case 'none':
    default:
      break;
  }
}

/* ---------------------------------------------------------------- small upholstery props */

/** Cylindrical bolster with gathered ends; axis along X, centre at (x, y, z) (y = centre). */
export function bolster(k: Kit, len: number, r: number, mat: THREE.Material, x: number, y: number, z: number, button?: THREE.Material): void {
  const prof: Array<[number, number]> = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (t * Math.PI) / 2;
    prof.push([r * Math.sin(a) * 0.98, -len / 2 + r * 0.35 * (1 - Math.sin(a))]);
  }
  prof.push([r, 0]);
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const a = (t * Math.PI) / 2;
    prof.push([r * Math.sin(a) * 0.98, len / 2 - r * 0.35 * (1 - Math.sin(a))]);
  }
  const m = k.lathe(prof, mat, x, y, z, 14);
  m.rotation.z = Math.PI / 2;
  if (button) {
    for (const s of [-1, 1]) k.sphere(0.016, button, x + s * (len / 2 - 0.002), y, z, 0.5, 1, 1, 6);
  }
}

/** Throw pillow leaning back against a backrest; (x, y, z) = bottom centre. */
export function throwPillow(k: Kit, size: number, mat: THREE.Material, x: number, y: number, z: number, rotY: number, tilt = 0.38, thick = 0.14): void {
  const p = k.pillow(size, thick, size * 0.92, mat);
  p.rotation.order = 'YXZ';
  p.rotation.set(Math.PI / 2 - tilt, rotY, 0);
  p.position.set(x, y + size * 0.44, z);
}

/** Smooth closed tube through points (piping, rims). */
export function piping(k: Kit, pts: V3[], r: number, mat: THREE.Material, closed = false, seg?: number): THREE.Mesh {
  return k.tube(pts, r, mat, { closed, seg: seg ?? pts.length * 4, radial: 5 });
}

/* ---------------------------------------------------------------- shells (egg / pod chairs) */

export interface ShellOpts {
  rx: number;
  ry: number;
  rz: number;
  /** half-width (radians, around Y from the front) of the opening at polar angle th (0 = top) */
  open: (th: number) => number;
  /** polar angle where the shell is cut at the bottom */
  thMax: number;
  thick: number;
  rows?: number;
  cols?: number;
}

/**
 * Ellipsoidal shell with an opening at the front (+Z). Returns the outer skin, the inner skin
 * (facing inwards) and the rim strip joining them, so they can get different materials.
 */
export function shellGeos(o: ShellOpts): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  const rows = o.rows ?? 16;
  const cols = o.cols ?? 24;
  const pt = (th: number, ph: number, inset: number): THREE.Vector3 => {
    const s = Math.sin(th);
    return new THREE.Vector3((o.rx - inset) * s * Math.sin(ph), (o.ry - inset) * Math.cos(th), (o.rz - inset) * s * Math.cos(ph));
  };
  const grid = (inset: number): THREE.Vector3[][] => {
    const out: THREE.Vector3[][] = [];
    for (let j = 0; j <= rows; j++) {
      const th = (o.thMax * j) / rows;
      const w = Math.min(Math.PI - 0.05, Math.max(0, o.open(th)));
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= cols; i++) row.push(pt(th, w + ((2 * Math.PI - 2 * w) * i) / cols, inset));
      out.push(row);
    }
    return out;
  };
  const surf = (g: THREE.Vector3[][], flip: boolean): THREE.BufferGeometry => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    g.forEach((row, j) =>
      row.forEach((p, i) => {
        pos.push(p.x, p.y, p.z);
        uv.push((i / cols) * 2 * Math.PI * o.rx, (j / rows) * o.thMax * o.ry);
      }),
    );
    const n = cols + 1;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * n + i;
        const b = a + 1;
        const c = a + n + 1;
        const d = a + n;
        if (flip) idx.push(a, b, c, a, c, d);
        else idx.push(a, c, b, a, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  const go = grid(0);
  const gi = grid(o.thick);
  // rim: left edge (i = 0), bottom row, right edge (i = cols)
  const loopO: THREE.Vector3[] = [];
  const loopI: THREE.Vector3[] = [];
  for (let j = 0; j <= rows; j++) {
    loopO.push(go[j][0]);
    loopI.push(gi[j][0]);
  }
  for (let i = 1; i <= cols; i++) {
    loopO.push(go[rows][i]);
    loopI.push(gi[rows][i]);
  }
  for (let j = rows - 1; j >= 0; j--) {
    loopO.push(go[j][cols]);
    loopI.push(gi[j][cols]);
  }
  const rp: number[] = [];
  for (let i = 0; i < loopO.length - 1; i++) {
    const a = loopO[i];
    const b = loopO[i + 1];
    const c = loopI[i + 1];
    const d = loopI[i];
    rp.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z);
    // both windings: the strip is seen from either side
    rp.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rim.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((rp.length / 3) * 2).fill(0), 2));
  rim.computeVertexNormals();
  return { outer: surf(go, false), inner: surf(gi, true), rim };
}

/** Round cushion (lathe) of radius r and thickness t with a soft crown; bottom at y = 0. */
export function roundCushionProfile(r: number, t: number, crown = 0.015): Array<[number, number]> {
  const e = Math.min(t * 0.5, r * 0.3);
  return [
    [0, 0],
    [r - e, 0],
    [r - e * 0.3, e * 0.3],
    [r, e],
    [r, t - e],
    [r - e * 0.3, t - e * 0.3],
    [r - e, t],
    [r * 0.6, t + crown * 0.7],
    [0, t + crown],
  ];
}

/** Points of a horizontal rounded rectangle (for closed piping loops). */
export function rrLoop(w: number, d: number, r: number, y: number, n = 3): V3[] {
  const out: V3[] = [];
  const cs: Array<[number, number, number]> = [
    [w / 2 - r, d / 2 - r, 0],
    [-w / 2 + r, d / 2 - r, Math.PI / 2],
    [-w / 2 + r, -d / 2 + r, Math.PI],
    [w / 2 - r, -d / 2 + r, Math.PI * 1.5],
  ];
  for (const [cx, cz, a0] of cs) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
    }
  }
  return out;
}
