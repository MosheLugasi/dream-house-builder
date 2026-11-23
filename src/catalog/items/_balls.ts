/**
 * Balls that can be kicked around (`BallSpec`).
 *
 * Unlike every other item, the ORIGIN of a ball is the point where it touches the ground and the
 * sphere's center is at y = radius. Balls are `noBake`: `build` returns a group whose only child is
 * the sphere mesh, exposed as `userData.ballMesh` so the game can spin it while it rolls. The
 * patterns are painted in direction space (no DOM needed), so they look right from every side.
 */
import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, darken, lighten, mix, noise3, sym, tint } from '../kit';
import { slot } from './_parts';

type RGB = [number, number, number];

const hex = (c: string): RGB => {
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const MAX_TEX = 24;
const texCache = new Map<string, THREE.DataTexture>();

/**
 * Equirectangular texture matching the UVs of `THREE.SphereGeometry`: `paint` gets the unit
 * direction (in the sphere's local frame) of every texel and returns its sRGB color.
 */
function sphereTexture(key: string, w: number, h: number, paint: (x: number, y: number, z: number) => RGB): THREE.DataTexture {
  let tex = texCache.get(key);
  if (tex) return tex;
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const theta = (1 - (j + 0.5) / h) * Math.PI;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    for (let i = 0; i < w; i++) {
      const phi = ((i + 0.5) / w) * Math.PI * 2;
      const [r, g, b] = paint(-Math.cos(phi) * st, ct, Math.sin(phi) * st);
      const o = (j * w + i) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  if (texCache.size >= MAX_TEX) {
    const first = texCache.keys().next().value;
    if (first !== undefined) texCache.delete(first);
  }
  texCache.set(key, tex);
  return tex;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function ballMat(key: string, rough: number, tex: () => THREE.DataTexture): THREE.MeshStandardMaterial {
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex(), roughness: rough, metalness: 0 });
    m.name = `ball|${key}`;
    if (matCache.size >= MAX_TEX) {
      const first = matCache.keys().next().value;
      if (first !== undefined) matCache.delete(first);
    }
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** Sphere centered on its own origin; `tilt` turns the pattern's pole away from straight up. */
function ballGeo(r: number, tilt: [number, number] = [0, 0]): THREE.BufferGeometry {
  const key = `${r}|${tilt.join(',')}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, 32, 20);
    g.rotateZ(tilt[0]);
    g.rotateX(tilt[1]);
    geoCache.set(key, g);
  }
  return g;
}

/** The ball object: a group at the ground contact point with the sphere mesh one radius above it. */
function ballObject(r: number, mat: THREE.Material, tilt?: [number, number]): THREE.Object3D {
  const root = new THREE.Group();
  const m = new THREE.Mesh(ballGeo(r, tilt), mat);
  m.name = 'ball';
  m.position.y = r;
  m.castShadow = true;
  m.receiveShadow = true;
  root.add(m);
  root.userData.ballMesh = m;
  return root;
}

/* ------------------------------------------------------------------ football */

interface SoccerFace {
  x: number;
  y: number;
  z: number;
  /** 1 / distance of the face plane from the center */
  inv: number;
  pent: boolean;
}
let soccerFaces: SoccerFace[] | null = null;

/** The 32 face planes of a truncated icosahedron: 12 pentagons (icosahedron vertices) + 20 hexagons (its faces). */
function soccer(): SoccerFace[] {
  if (soccerFaces) return soccerFaces;
  const out: SoccerFace[] = [];
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: THREE.Vector3[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-t, t]) {
      verts.push(new THREE.Vector3(0, a, b).normalize(), new THREE.Vector3(a, b, 0).normalize(), new THREE.Vector3(b, 0, a).normalize());
    }
  }
  // distance of the face planes from the center, for a circumradius of 1
  const dPent = 0.9393;
  const dHex = 0.9149;
  for (const v of verts) out.push({ x: v.x, y: v.y, z: v.z, inv: 1 / dPent, pent: true });
  // faces = triples of mutually adjacent vertices (edge angle of an icosahedron: cos = 1/√5)
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      if (verts[i].dot(verts[j]) < 0.4) continue;
      for (let k = j + 1; k < 12; k++) {
        if (verts[i].dot(verts[k]) < 0.4 || verts[j].dot(verts[k]) < 0.4) continue;
        const c = verts[i].clone().add(verts[j]).add(verts[k]).normalize();
        out.push({ x: c.x, y: c.y, z: c.z, inv: 1 / dHex, pent: false });
      }
    }
  }
  soccerFaces = out;
  return out;
}

const FOOTBALL_R = 0.11;

const football: FurnitureDef = {
  id: 'ball-football',
  name: 'כדורגל',
  category: 'playground',
  size: { w: FOOTBALL_R * 2, d: FOOTBALL_R * 2, h: FOOTBALL_R * 2 },
  colors: [slot('base', 'צבע בסיס', '#f4f4f0'), slot('panels', 'מחומשים', '#1c1d20')],
  ball: { radius: FOOTBALL_R, bounce: 0.6, mass: 0.43 },
  noBake: true,
  build: ({ colors: c }) => {
    const key = `football|${c.base}|${c.panels}`;
    const mat = ballMat(key, 0.48, () => {
      const base = hex(c.base);
      const pent = hex(c.panels);
      const seam = hex(mix(darken(c.base, 0.55), c.panels, 0.3));
      const faces = soccer();
      return sphereTexture(key, 512, 256, (x, y, z) => {
        // the face a ray from the center leaves through is the one whose plane it reaches first
        let best = -1;
        let second = -1;
        let isPent = false;
        for (const f of faces) {
          const s = (f.x * x + f.y * y + f.z * z) * f.inv;
          if (s > best) {
            second = best;
            best = s;
            isPent = f.pent;
          } else if (s > second) second = s;
        }
        // stitched seam along the panel edges
        const edge = 1 - smooth(0.006, 0.02, best - second);
        return lerp3(isPent ? pent : base, seam, edge * 0.9);
      });
    });
    return ballObject(FOOTBALL_R, mat, [0.35, 0.2]);
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const r = FOOTBALL_R;
      D.circle(ctx, 0, 0, r, tint(c.base, 0.5), undefined, 0.006);
      const pent = (cx: number, cy: number, pr: number, rot: number): Array<[number, number]> =>
        [0, 1, 2, 3, 4].map((i) => [cx + Math.cos(rot + (i / 5) * Math.PI * 2) * pr, cy + Math.sin(rot + (i / 5) * Math.PI * 2) * pr] as [number, number]);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r - 0.004, 0, Math.PI * 2);
      ctx.clip();
      D.poly(ctx, pent(0, 0, r * 0.36, -Math.PI / 2), true, tint(c.panels, 0.3), null);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        D.line(ctx, Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36, Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, INK_SOFT, 0.004);
        D.poly(ctx, pent(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02, r * 0.36, a + Math.PI), true, tint(c.panels, 0.3), null);
      }
      ctx.restore();
    }),
};

/* ------------------------------------------------------------------ basketball */

const BASKETBALL_R = 0.12;

const basketball: FurnitureDef = {
  id: 'ball-basketball',
  name: 'כדורסל',
  category: 'playground',
  size: { w: BASKETBALL_R * 2, d: BASKETBALL_R * 2, h: BASKETBALL_R * 2 },
  colors: [slot('ball', 'צבע', '#d9661f')],
  ball: { radius: BASKETBALL_R, bounce: 0.75, mass: 0.6 },
  noBake: true,
  build: ({ colors: c }) => {
    const key = `basketball|${c.ball}`;
    const mat = ballMat(key, 0.78, () => {
      const lightC = hex(lighten(c.ball, 0.08));
      const darkC = hex(darken(c.ball, 0.14));
      const seam = hex('#17130f');
      return sphereTexture(key, 512, 256, (x, y, z) => {
        // eight panels: two great circles + two side loops
        const loop = Math.abs(Math.abs(x) - (0.5 + 0.45 * y * y)) / Math.sqrt(1 + 0.81 * y * y);
        const d = Math.min(Math.abs(x), Math.abs(y), loop);
        // pebbled leather
        const peb = noise3(x * 46 + 7, y * 46 + 3, z * 46 + 11);
        return lerp3(lerp3(darkC, lightC, peb), seam, 1 - smooth(0.014, 0.026, d));
      });
    });
    return ballObject(BASKETBALL_R, mat, [0.5, 0.35]);
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const r = BASKETBALL_R;
      D.circle(ctx, 0, 0, r, tint(c.ball, 0.3), undefined, 0.006);
      const ink = '#3a2a1e';
      D.line(ctx, -r, 0, r, 0, ink, 0.005);
      D.line(ctx, 0, -r, 0, r, ink, 0.005);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      for (const s of [-1, 1]) D.circle(ctx, s * r * 1.45, 0, r * 0.95, null, ink, 0.005);
      ctx.restore();
    }),
};

/* ------------------------------------------------------------------ beach ball */

const BEACH_R = 0.2;
const BEACH_COLS = ['#e8413a', '#fafaf5', '#f6c624', '#2f7fd6', '#fafaf5', '#35a85a'];

const beachBall: FurnitureDef = {
  id: 'ball-beach',
  name: 'כדור ים',
  category: 'playground',
  size: { w: BEACH_R * 2, d: BEACH_R * 2, h: BEACH_R * 2 },
  ball: { radius: BEACH_R, bounce: 0.8, mass: 0.1 },
  noBake: true,
  build: () => {
    const mat = ballMat('beach', 0.22, () => {
      const cols = BEACH_COLS.map(hex);
      const cap = hex('#fafaf5');
      const line = hex('#c9c6bd');
      return sphereTexture('beach', 512, 256, (x, y, z) => {
        // six gores around the Y axis, white round caps on both poles
        const a = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1;
        const g = a * 6;
        const rr = Math.hypot(x, z);
        const toSeam = Math.abs(g - Math.round(g)) * ((Math.PI * 2) / 6) * rr;
        let col = lerp3(cols[Math.floor(g) % 6], line, (1 - smooth(0.004, 0.012, toSeam)) * 0.8);
        const pole = Math.acos(Math.min(1, Math.abs(y)));
        col = lerp3(cap, col, smooth(0.25, 0.262, pole));
        return lerp3(col, line, (1 - smooth(0.003, 0.01, Math.abs(pole - 0.256))) * 0.8);
      });
    });
    return ballObject(BEACH_R, mat, [0.6, 0.4]);
  },
  draw2d: (ctx) =>
    sym(ctx, () => {
      const r = BEACH_R;
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, a0, a0 + Math.PI / 3);
        ctx.closePath();
        ctx.fillStyle = tint(BEACH_COLS[i], 0.25);
        ctx.fill();
      }
      D.circle(ctx, 0, 0, r, null, undefined, 0.007);
      D.circle(ctx, 0, 0, r * 0.2, '#ffffff', INK_SOFT, 0.006);
    }),
};

export const BALLS: FurnitureDef[] = [football, basketball, beachBall];
