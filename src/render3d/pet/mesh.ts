/**
 * Geometry helpers for the procedural pets: a vertex buffer with skin weights and a lofting
 * routine that sweeps an (asymmetric super-)ellipse along a spline. Everything is plain math –
 * no DOM, no WebGL – so it can run under Node.
 */
import * as THREE from 'three';

/** [boneIndex, weight] pairs */
export type Skin = [number, number][];

export const GROUP_FUR = 0;
export const GROUP_SMOOTH = 1;

export class MeshBuf {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[][] = [[], []];
  /** vertex pairs that share a position inside one surface (uv seam): their normals are averaged */
  weld: number[][] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vert(p: THREE.Vector3, c: THREE.Color, u: number, v: number, skin: Skin): number {
    const i = this.count;
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
    const s = skin.filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0;
    for (const e of s) sum += e[1];
    for (let k = 0; k < 4; k++) {
      this.si.push(k < s.length ? s[k][0] : 0);
      this.sw.push(k < s.length ? s[k][1] / sum : 0);
    }
    return i;
  }

  tri(group: number, a: number, b: number, c: number): void {
    this.idx[group].push(a, b, c);
  }

  get triangles(): number {
    return (this.idx[0].length + this.idx[1].length) / 3;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    const index = [...this.idx[0], ...this.idx[1]];
    g.setIndex(index);
    g.addGroup(0, this.idx[0].length, 0);
    g.addGroup(this.idx[0].length, this.idx[1].length, 1);
    g.computeVertexNormals();
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const acc = new THREE.Vector3();
    for (const set of this.weld) {
      acc.set(0, 0, 0);
      for (const i of set) acc.x += n.getX(i), (acc.y += n.getY(i)), (acc.z += n.getZ(i));
      acc.normalize();
      for (const i of set) n.setXYZ(i, acc.x, acc.y, acc.z);
    }
    return g;
  }
}

export interface Station {
  c: THREE.Vector3;
  /** radius towards the frame's up axis / away from it / sideways */
  up: number;
  down: number;
  w: number;
  /** super-ellipse exponent (2 = ellipse, larger = boxier) */
  n?: number;
  skin: Skin;
}

export interface Ring extends Station {
  n: number;
  /** side, up, tangent (right-handed: s × u = t) */
  s: THREE.Vector3;
  u: THREE.Vector3;
  t: THREE.Vector3;
  /** fractional station index */
  k: number;
  /** arc length from the first ring */
  len: number;
}

function cr(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}
function crd(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  return 0.5 * (-a + c + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t2);
}
const clampBetween = (v: number, a: number, b: number, slack = 0.12) => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const e = (hi - lo) * slack + 1e-5;
  return Math.min(hi + e, Math.max(lo - e, v));
};

export function mixSkin(a: Skin, b: Skin, t: number): Skin {
  const m = new Map<number, number>();
  for (const [i, w] of a) m.set(i, (m.get(i) ?? 0) + w * (1 - t));
  for (const [i, w] of b) m.set(i, (m.get(i) ?? 0) + w * t);
  return [...m.entries()];
}

/**
 * Turn sparse stations into rings: Catmull-Rom through the centers, gently clamped radii.
 * `side` is the (constant) side axis of the sweep; the up axis is tangent × side.
 * `sub` = rings per interval (number or per-interval list).
 */
export function sampleRings(st: Station[], side: THREE.Vector3, sub: number | number[]): Ring[] {
  const rings: Ring[] = [];
  const at = (i: number) => st[Math.max(0, Math.min(st.length - 1, i))];
  const sm = (t: number) => t * t * (3 - 2 * t);
  let len = 0;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i < st.length - 1; i++) {
    const n = typeof sub === 'number' ? sub : sub[i];
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const last = i === st.length - 2;
    for (let j = 0; j < n + (last ? 1 : 0); j++) {
      const t = j / n;
      const p = new THREE.Vector3(cr(a.c.x, b.c.x, c.c.x, d.c.x, t), cr(a.c.y, b.c.y, c.c.y, d.c.y, t), cr(a.c.z, b.c.z, c.c.z, d.c.z, t));
      const tan = new THREE.Vector3(crd(a.c.x, b.c.x, c.c.x, d.c.x, t), crd(a.c.y, b.c.y, c.c.y, d.c.y, t), crd(a.c.z, b.c.z, c.c.z, d.c.z, t));
      if (tan.lengthSq() < 1e-12) tan.subVectors(c.c, b.c);
      tan.normalize();
      const u = new THREE.Vector3().crossVectors(tan, side).normalize();
      const s = new THREE.Vector3().crossVectors(u, tan).normalize();
      if (prev) len += prev.distanceTo(p);
      prev = p;
      const r = (f: (s: Station) => number) => clampBetween(cr(f(a), f(b), f(c), f(d), t), f(b), f(c));
      rings.push({
        c: p,
        s,
        u,
        t: tan,
        up: r((q) => q.up),
        down: r((q) => q.down),
        w: r((q) => q.w),
        n: (b.n ?? 2) + ((c.n ?? 2) - (b.n ?? 2)) * t,
        skin: mixSkin(b.skin, c.skin, sm(t)),
        k: i + t,
        len,
      });
    }
  }
  return rings;
}

const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

/** point of a ring at angle `th` (0 = side, π/2 = up, -π/2 = down), radii scaled by `scale` */
export function ringPoint(r: Ring, th: number, out = new THREE.Vector3(), scale = 1, shift = 0): THREE.Vector3 {
  const e = 2 / r.n;
  const cx = spow(Math.cos(th), e);
  const sy = spow(Math.sin(th), e);
  const x = cx * r.w * scale;
  const y = sy * (sy >= 0 ? r.up : r.down) * scale;
  return out.copy(r.c).addScaledVector(r.s, x).addScaledVector(r.u, y).addScaledVector(r.t, shift);
}

export interface LoftInfo {
  /** fractional station index */
  k: number;
  /** cos / sin of the angle around the ring: side (+1 = towards `side`), upness (+1 = up axis) */
  cs: number;
  sn: number;
  p: THREE.Vector3;
  ring: Ring;
  /** 0 on the body of the loft, >0 inside the start cap, <0 inside the end cap (|1| = pole) */
  cap: number;
}

export interface LoftOpts {
  group?: number;
  segs: number;
  color: (i: LoftInfo) => THREE.Color;
  /** round caps: length of the dome along the tangent (0 = flat fan) */
  capStart?: number;
  capEnd?: number;
  /** meters of arc length per texture tile along the loft, and tiles around */
  uTile?: number;
  vRepeat?: number;
  /** optional per-vertex skin override */
  skin?: (i: LoftInfo, ringSkin: Skin) => Skin;
  /** optional radial displacement (m) */
  displace?: (i: LoftInfo) => number;
}

export function loft(buf: MeshBuf, rings: Ring[], o: LoftOpts): void {
  const group = o.group ?? GROUP_FUR;
  const segs = o.segs;
  const uTile = o.uTile ?? 0.16;
  const vRep = o.vRepeat ?? 2;
  const info: LoftInfo = { k: 0, cs: 0, sn: 0, p: new THREE.Vector3(), ring: rings[0], cap: 0 };
  const rows: number[][] = [];
  const p = new THREE.Vector3();

  const addRow = (r: Ring, scale: number, shift: number, cap: number) => {
    const row: number[] = [];
    for (let j = 0; j <= segs; j++) {
      const th = -Math.PI / 2 + (j / segs) * Math.PI * 2;
      ringPoint(r, th, p, scale, shift);
      info.k = r.k;
      info.cs = Math.cos(th);
      info.sn = Math.sin(th);
      info.ring = r;
      info.cap = cap;
      info.p.copy(p);
      if (o.displace) {
        const d = o.displace(info);
        if (d) {
          p.addScaledVector(r.s, (info.cs * d * r.w) / Math.max(r.w, r.up, r.down)).addScaledVector(r.u, info.sn * d);
          info.p.copy(p);
        }
      }
      const skin = o.skin ? o.skin(info, r.skin) : r.skin;
      row.push(buf.vert(p, o.color(info), (r.len + shift) / uTile, (j / segs) * vRep, skin));
    }
    buf.weld.push([row[0], row[segs]]);
    rows.push(row);
  };
  const pole = (r: Ring, shift: number, cap: number): number => {
    info.k = r.k;
    info.cs = 0;
    info.sn = 0;
    info.ring = r;
    info.cap = cap;
    p.copy(r.c).addScaledVector(r.t, shift);
    info.p.copy(p);
    const skin = o.skin ? o.skin(info, r.skin) : r.skin;
    return buf.vert(p, o.color(info), (r.len + shift) / uTile, 0.5 * vRep, skin);
  };

  const first = rings[0];
  const last = rings[rings.length - 1];
  const cs = o.capStart ?? 0;
  const ce = o.capEnd ?? 0;
  let poleA = -1;
  if (cs > 0) {
    poleA = pole(first, -cs, 1);
    addRow(first, 0.5, -cs * 0.866, 0.66);
    addRow(first, 0.866, -cs * 0.5, 0.33);
  } else {
    poleA = pole(first, 0, 1);
  }
  for (const r of rings) addRow(r, 1, 0, 0);
  let poleB = -1;
  if (ce > 0) {
    addRow(last, 0.866, ce * 0.5, -0.33);
    addRow(last, 0.5, ce * 0.866, -0.66);
    poleB = pole(last, ce, -1);
  } else {
    poleB = pole(last, 0, -1);
  }
  for (let j = 0; j < segs; j++) buf.tri(group, poleA, rows[0][j + 1], rows[0][j]);
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    for (let j = 0; j < segs; j++) {
      buf.tri(group, a[j], a[j + 1], b[j]);
      buf.tri(group, a[j + 1], b[j + 1], b[j]);
    }
  }
  const e = rows[rows.length - 1];
  for (let j = 0; j < segs; j++) buf.tri(group, poleB, e[j], e[j + 1]);
}

/** find the ring closest to fractional station index k */
export function ringAt(rings: Ring[], k: number): Ring {
  let best = rings[0];
  for (const r of rings) if (Math.abs(r.k - k) < Math.abs(best.k - k)) best = r;
  return best;
}

/* ------------------------------------------------------------------ fur textures */

let furTex: { map: THREE.Texture; normalMap: THREE.Texture } | null = null;

/** Tileable short-hair texture (strokes run along U) + matching normal map. Lazily created; needs a DOM. */
export function furTextures(): { map: THREE.Texture; normalMap: THREE.Texture } | null {
  if (furTex) return furTex;
  if (typeof document === 'undefined') return null;
  const S = 256;
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const strokes = (ctx: CanvasRenderingContext2D, count: number, dark: string, light: string, lw: number) => {
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const len = 10 + rnd() * 26;
      const a = (rnd() - 0.5) * 0.5;
      const dx = Math.cos(a) * len;
      const dy = Math.sin(a) * len;
      ctx.strokeStyle = rnd() < 0.55 ? dark : light;
      ctx.globalAlpha = 0.12 + rnd() * 0.3;
      ctx.lineWidth = lw * (0.6 + rnd() * 0.9);
      for (const ox of [-S, 0, S])
        for (const oy of [-S, 0, S]) {
          ctx.beginPath();
          ctx.moveTo(x + ox, y + oy);
          ctx.quadraticCurveTo(x + ox + dx * 0.5, y + oy + dy * 0.5 + (rnd() - 0.5) * 3, x + ox + dx, y + oy + dy);
          ctx.stroke();
        }
    }
    ctx.globalAlpha = 1;
  };
  const cm = document.createElement('canvas');
  cm.width = cm.height = S;
  const cx = cm.getContext('2d')!;
  cx.fillStyle = '#ececec';
  cx.fillRect(0, 0, S, S);
  strokes(cx, 1700, '#b9b9b9', '#ffffff', 1.5);

  const ch = document.createElement('canvas');
  ch.width = ch.height = S;
  const hx = ch.getContext('2d', { willReadFrequently: true })!;
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, S, S);
  seed = 99;
  strokes(hx, 1500, '#000000', '#ffffff', 2.2);
  const h = hx.getImageData(0, 0, S, S).data;
  const out = hx.createImageData(S, S);
  const H = (x: number, y: number) => h[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2;
      const dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      out.data[i] = (-dx / l) * 127 + 128;
      out.data[i + 1] = (dy / l) * 127 + 128;
      out.data[i + 2] = (1 / l) * 127 + 128;
      out.data[i + 3] = 255;
    }
  hx.putImageData(out, 0, 0);

  const map = new THREE.CanvasTexture(cm);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(ch);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  furTex = { map, normalMap };
  return furTex;
}
