import * as THREE from 'three';
import { finishes } from '../materials/finishes';
import { roofPlan, type RoofRect } from '../model/roofPlan';
import { levelElevation, type Building } from '../model/types';
import { MeshBuilder, type V3 } from './MeshBuilder';

const SOFFIT = '__soffit';
const THICK = 0.14;
const soffitMaterial = new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.7 });

type P3 = { x: number; y: number; h: number }; // roof-frame x,y + height

/**
 * Pitched roof (gable / hip / shed) of a building, in building-local coordinates.
 * Returns null for flat roofs (those are part of the top level) and for footprints that are
 * not rectilinear.
 */
export function buildRoof(building: Building): THREE.Group | null {
  const { roof } = building;
  if (roof.type === 'flat' || roof.type === 'none') return null;
  const top = building.levels[building.levels.length - 1];
  const plan = roofPlan(top);
  if (!plan) return null;

  const eave = levelElevation(building, building.levels.length - 1) + top.height;
  const pitch = THREE.MathUtils.degToRad(Math.max(5, Math.min(60, roof.pitch ?? 30)));
  const tan = Math.tan(roof.type === 'shed' ? pitch * 0.5 : pitch);
  const over = Math.max(0, roof.overhang ?? 0.45);
  const mb = new MeshBuilder();
  const cos = Math.cos(plan.angle);
  const sin = Math.sin(plan.angle);
  const world = (p: P3, dy = 0): V3 => [p.x * cos - p.y * sin, p.h + dy, p.x * sin + p.y * cos];

  /** A sloped slab: top in the roof finish, soffit underneath and closed edges. */
  const plane = (pts: P3[], eaveDir: { x: number; y: number }) => {
    // u runs along the eave, v up the slope (so the texture's "down" points downhill)
    const o = pts[0];
    const slopeLen = Math.sqrt(1 + tan * tan) / tan;
    const uv = (p: P3): [number, number] => [(p.x - o.x) * eaveDir.x + (p.y - o.y) * eaveDir.y, (p.h - o.h) * slopeLen];
    const a = world(pts[0]);
    const b = world(pts[1]);
    const c = world(pts[2]);
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize();
    if (n.y < 0) n.negate();
    const normal: V3 = [n.x, n.y, n.z];
    const down: V3 = [-n.x, -n.y, -n.z];
    for (let i = 1; i + 1 < pts.length; i++) {
      mb.tri(roof.finish, world(pts[0]), world(pts[i]), world(pts[i + 1]), normal, [uv(pts[0]), uv(pts[i]), uv(pts[i + 1])]);
      mb.tri(SOFFIT, world(pts[0], -THICK), world(pts[i], -THICK), world(pts[i + 1], -THICK), down, [uv(pts[0]), uv(pts[i]), uv(pts[i + 1])]);
    }
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const mx = (p.x + q.x) / 2 - cx;
      const my = (p.y + q.y) / 2 - cy;
      const out: V3 = [mx * cos - my * sin, 0, mx * sin + my * cos];
      const L = Math.hypot(q.x - p.x, q.y - p.y, q.h - p.h);
      mb.quad(SOFFIT, world(p, -THICK), world(q, -THICK), world(q), world(p), out, [
        [0, 0],
        [L, 0],
        [L, THICK],
        [0, THICK],
      ]);
    }
  };

  /** A vertical wall piece (gable end etc.) in the exterior finish, visible from both sides. */
  const wall = (pts: P3[]) => {
    const a = world(pts[0]);
    const b = world(pts[1]);
    const c = world(pts[2]);
    const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize();
    const horiz = Math.abs(pts[1].x - pts[0].x) > Math.abs(pts[1].y - pts[0].y);
    const uv = (p: P3): [number, number] => [horiz ? p.x : p.y, p.h];
    for (const sgn of [1, -1]) {
      const normal: V3 = [n.x * sgn, n.y * sgn, n.z * sgn];
      for (let i = 1; i + 1 < pts.length; i++) {
        mb.tri(building.exterior, world(pts[0]), world(pts[i]), world(pts[i + 1]), normal, [uv(pts[0]), uv(pts[i]), uv(pts[i + 1])]);
      }
    }
  };

  const one = (r: RoofRect) => {
    const W = r.x1 - r.x0;
    const D = r.y1 - r.y0;
    // work in (l, s): l along the long side, s along the short side
    const swap = D > W;
    const l0 = swap ? r.y0 : r.x0;
    const l1 = swap ? r.y1 : r.x1;
    const s0 = swap ? r.x0 : r.y0;
    const s1 = swap ? r.x1 : r.y1;
    const P = (l: number, s: number, h: number): P3 => (swap ? { x: s, y: l, h } : { x: l, y: s, h });
    const lDir = swap ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const sDir = swap ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const neg = (v: { x: number; y: number }) => ({ x: -v.x, y: -v.y });
    const span = s1 - s0;
    const sc = (s0 + s1) / 2;
    const lowH = eave - over * tan;

    if (roof.type === 'shed') {
      const highH = eave + (span + over) * tan;
      plane([P(l0 - over, s0 - over, lowH), P(l1 + over, s0 - over, lowH), P(l1 + over, s1 + over, highH), P(l0 - over, s1 + over, highH)], lDir);
      const wallTop = eave + span * tan;
      wall([P(l0, s1, eave), P(l1, s1, eave), P(l1, s1, wallTop), P(l0, s1, wallTop)]);
      wall([P(l0, s0, eave), P(l0, s1, eave), P(l0, s1, wallTop)]);
      wall([P(l1, s0, eave), P(l1, s1, eave), P(l1, s1, wallTop)]);
      return;
    }
    const ridgeH = eave + (span / 2) * tan;
    if (roof.type === 'gable') {
      const a = l0 - over;
      const b = l1 + over;
      plane([P(a, s0 - over, lowH), P(b, s0 - over, lowH), P(b, sc, ridgeH), P(a, sc, ridgeH)], lDir);
      plane([P(b, s1 + over, lowH), P(a, s1 + over, lowH), P(a, sc, ridgeH), P(b, sc, ridgeH)], neg(lDir));
      wall([P(l0, s0, eave), P(l0, s1, eave), P(l0, sc, ridgeH)]);
      wall([P(l1, s0, eave), P(l1, s1, eave), P(l1, sc, ridgeH)]);
      return;
    }
    // hip
    const ra = l0 + span / 2;
    const rb = Math.max(ra, l1 - span / 2);
    const A = P(l0 - over, s0 - over, lowH);
    const B = P(l1 + over, s0 - over, lowH);
    const C = P(l1 + over, s1 + over, lowH);
    const E = P(l0 - over, s1 + over, lowH);
    const R0 = P(ra, sc, ridgeH);
    const R1 = P(rb, sc, ridgeH);
    plane(rb - ra > 1e-3 ? [A, B, R1, R0] : [A, B, R0], lDir);
    plane(rb - ra > 1e-3 ? [C, E, R0, R1] : [C, E, R0], neg(lDir));
    plane([E, A, R0], neg(sDir));
    plane([B, C, R1], sDir);
  };

  plan.rects.forEach(one);
  return mb.build((key) => (key === SOFFIT ? soffitMaterial : finishes.material(key)));
}
