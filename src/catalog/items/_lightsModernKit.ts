/**
 * Shared builders for the modern light fittings (`lightsModern.ts`).
 *
 * Every fitting is PARAMETRIC: `build` receives the clamped size and rebuilds the fitting at that
 * size (longer cord, bigger round shade, longer LED profile...) and publishes the real light position
 * on `userData.anchors.light`. Emissive meshes live in part 'glow' (pivot at the origin).
 */
import * as THREE from 'three';
import type { ColorSlot, FurnitureDef, ItemSize, ResizeSpec } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, mix, sym, type Ctx2D, type V3 } from '../kit';

export const CEIL = 2.7;
/** ~2900 K */
export const WARM = '#ffe1b5';
/** ~2700 K */
export const WARM27 = '#ffd9a8';
/** ~3000 K, a touch more neutral (LED panels, task lights) */
export const NEUTRAL = '#fff1dc';
export const CORD = '#1e1e20';

export function ns<T extends THREE.Object3D>(o: T): T {
  o.castShadow = false;
  return o;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------------------ materials */

/** Opal (milk) glass / acrylic diffuser, tinted by its base colour; glows when the lamp is on. */
export function opal(base: string, intensity = 1.0, light = WARM, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  return M.glow(mix(light, base, 0.25), intensity, base, side);
}
/** LED chip / lens (very bright). */
export function led(light = WARM, intensity = 2.4): THREE.MeshStandardMaterial {
  return M.glow(light, intensity, '#fffaf0');
}
/** Inside of a shade lit by the bulb (rendered from the inside). */
export function innerGlow(base: string, intensity = 0.55, light = WARM): THREE.MeshStandardMaterial {
  return M.glow(light, intensity, base, THREE.BackSide);
}
/** Powder-coated metal. */
export const powder = (c: string): THREE.MeshStandardMaterial => M.paint(c, 0.48);
/** Fabric-covered cord. */
export const cordMat = (c: string): THREE.MeshStandardMaterial => M.rubber(c);

/* ------------------------------------------------------------------------------ geometry */

/** Open cylinder / cone with its BOTTOM at y = 0 (optionally a sector). */
export function openCyl(rBot: number, rTop: number, h: number, seg = 32, thetaStart = 0, thetaLen = Math.PI * 2): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true, thetaStart, thetaLen);
  g.translate(0, h / 2, 0);
  return g;
}

/** Flat annulus (washer) in the XZ plane facing up (+Y) or down. */
export function annulusGeo(rIn: number, rOut: number, seg = 40, down = false): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(rIn, rOut, seg, 1);
  g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

/** Ring with a rectangular cross-section (LED halo rings), bottom at y = 0. */
export function bandGeo(rIn: number, rOut: number, h: number, seg = 48): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: Math.max(6, Math.round(seg / 2)) });
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Surface of revolution with smooth vertical flutes (ribbed / fluted glass).
 * `amp` = flute depth relative to the radius.
 */
export function ribbedGeo(profile: Array<[number, number]>, ribs = 24, amp = 0.04, perRib = 3): THREE.BufferGeometry {
  const seg = ribs * perRib;
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
    seg,
  );
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = profile.length;
  for (let i = 0; i < p.count; i++) {
    const col = Math.floor(i / n);
    const phi = (col / seg) * Math.PI * 2;
    const k = 1 - amp * (0.5 - 0.5 * Math.cos(ribs * phi));
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  // weld the seam normals
  const nr = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let j = 0; j < n; j++) {
    const a = j;
    const b = seg * n + j;
    const x = (nr.getX(a) + nr.getX(b)) / 2;
    const y = (nr.getY(a) + nr.getY(b)) / 2;
    const z = (nr.getZ(a) + nr.getZ(b)) / 2;
    const l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l);
    nr.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

/** Surface of revolution with crisp knife pleats (pleated fabric shades). */
export function pleatedGeo(profile: Array<[number, number]>, pleats = 32, amp = 0.012): THREE.BufferGeometry {
  const seg = pleats * 2;
  const src = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
    seg,
  );
  const p = src.getAttribute('position') as THREE.BufferAttribute;
  const n = profile.length;
  const rMax = Math.max(...profile.map((q) => q[0])) || 1;
  for (let i = 0; i < p.count; i++) {
    const col = Math.floor(i / n);
    const s = col % 2 === 0 ? 1 : -1;
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const k = (r + s * amp * (r / rMax)) / r;
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  const g = src.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

/** Ceiling canopy: a shallow disc whose top is flush with the ceiling. */
export function canopy(k: Kit, r: number, mat: THREE.Material, h = 0.024, x = 0, z = 0): void {
  k.lathe(
    [
      [0, 0],
      [r * 0.84, 0],
      [r * 0.97, h * 0.3],
      [r, h],
      [0, h],
    ],
    mat,
    x,
    CEIL - h,
    z,
    24,
  );
}

/** Straight vertical cord (or wire) between two heights. */
export function vcord(k: Kit, x: number, z: number, yBot: number, yTop: number, mat: THREE.Material, r = 0.0026): void {
  if (yTop - yBot < 0.002) return;
  ns(k.cyl(r, yTop - yBot, mat, x, yBot, z, r, 6));
}

/** Cord through points (soft curve). */
export function cordPath(k: Kit, pts: V3[], mat: THREE.Material, r = 0.0028): void {
  ns(k.tube(pts, r, mat, { radial: 5, seg: Math.max(10, pts.length * 6) }));
}

/** Round wall plate facing +Z with its back on z = zBack (y = centre). */
export function wallDisc(k: Kit, r: number, t: number, mat: THREE.Material, y: number, zBack: number, x = 0, seg = 24): void {
  const m = k.cyl(r, t, mat, 0, 0, 0, r * 0.96, seg);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, zBack + t / 2);
}

/** A sub-builder whose group is transformed (tilted heads); added to `into`. */
export function sub(into: Kit, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Kit {
  const s = new Kit();
  s.g.position.set(x, y, z);
  s.g.rotation.set(rx, ry, rz, 'YXZ');
  into.g.add(s.g);
  return s;
}

/* ------------------------------------------------------------------------------ plan symbols */

/** Light source symbol: circle with a small cross (dashed = overhead). */
export function lampSym(ctx: Ctx2D, r: number, fill: string | null, dashed = false, cx = 0, cy = 0): void {
  if (dashed) ctx.setLineDash([0.04, 0.03]);
  D.circle(ctx, cx, cy, r, fill, INK_SOFT, LINE_THIN);
  ctx.setLineDash([]);
  const k = Math.min(r * 0.5, 0.06);
  D.line(ctx, cx - k, cy - k, cx + k, cy + k, INK_SOFT, LINE_THIN);
  D.line(ctx, cx - k, cy + k, cx + k, cy - k, INK_SOFT, LINE_THIN);
}

/** Dashed rounded rectangle (overhead linear fittings). */
export function dashRect(ctx: Ctx2D, cx: number, cy: number, w: number, h: number, r: number, fill: string | null): void {
  ctx.setLineDash([0.04, 0.03]);
  D.rr(ctx, cx, cy, w, h, r, fill, INK_SOFT, LINE_THIN);
  ctx.setLineDash([]);
}

/* ------------------------------------------------------------------------------ definition */

export interface LampSpec {
  id: string;
  name: string;
  group: string;
  tags: string[];
  size: ItemSize;
  resize: ResizeSpec;
  mount?: 'floor' | 'wall' | 'ceiling';
  elevation?: number;
  colors: ColorSlot[];
  light: { color: string; intensity: number; distance: number };
  /** where the light comes from at size `s` (must match what `build` makes) */
  at(s: ItemSize): V3;
  /** build at size `s`: solid parts into `k`, emissive parts into `g` (part 'glow', pivot at the origin) */
  build(k: Kit, g: Kit, c: Record<string, string>, s: ItemSize): void;
  /** plan symbol at size `s` (inside [-w/2, w/2] × [-d/2, d/2]) */
  plan(ctx: Ctx2D, c: Record<string, string>, s: ItemSize): void;
}

/** Turn a spec into a parametric catalog definition with a `light` action and size-aware anchors. */
export function lamp(spec: LampSpec): FurnitureDef {
  const p = spec.at(spec.size);
  return {
    id: spec.id,
    name: spec.name,
    category: 'lighting',
    group: spec.group,
    tags: spec.tags,
    size: spec.size,
    ...(spec.mount ? { mount: spec.mount } : {}),
    ...(spec.elevation !== undefined ? { elevation: spec.elevation } : {}),
    colors: spec.colors,
    light: { x: p[0], y: p[1], z: p[2], ...spec.light },
    actions: [{ kind: 'light' }],
    parametric: true,
    resize: spec.resize,
    build: (ctx) => {
      const s = ctx.size ?? spec.size;
      const k = new Kit();
      const g = k.part('glow');
      spec.build(k, g, ctx.colors, s);
      const a = spec.at(s);
      k.g.userData.anchors = { light: { x: a[0], y: a[1], z: a[2] } };
      return k.g;
    },
    draw2d: (ctx, c, size) => sym(ctx, () => spec.plan(ctx, c, size ?? spec.size)),
  };
}
