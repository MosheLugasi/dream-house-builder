/**
 * Plan footprints of rigid bodies (pure geometry, no Rapier): the walk world's oriented boxes are kept
 * in step with the simulated props (the walker, pets and balls collide with those boxes), and props that
 * were placed overlapping something are found before they would be shot apart.
 */

/** Same layout as the walk world's `WalkBox` (plan centre, half extents, plan rotation, heights). */
export interface PlanBox {
  x: number;
  y: number;
  hw: number;
  hd: number;
  rotation: number;
  y0: number;
  y1: number;
}

/**
 * Enclosing plan box of a rotated 3D box. The collider (half extents `he`, centre `c` in the body
 * frame) of a body at `pos` turned by quaternion `q` is projected on the ground plane: the plan axes
 * follow the body axis that lies flattest (the box keeps a sensible orientation when a lamp post falls).
 */
export function projectBox(
  pos: { x: number; y: number; z: number },
  q: { x: number; y: number; z: number; w: number },
  he: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
  out: PlanBox,
): PlanBox {
  const { x, y, z, w } = q;
  // rotation matrix columns = body axes in the world
  const ax = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  const ay = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
  const az = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
  const axes = [ax, ay, az];
  const ext = [he.x, he.y, he.z];
  // centre in the world
  const cx = pos.x + ax[0] * c.x + ay[0] * c.y + az[0] * c.z;
  const cy = pos.y + ax[1] * c.x + ay[1] * c.y + az[1] * c.z;
  const cz = pos.z + ax[2] * c.x + ay[2] * c.y + az[2] * c.z;
  // the most vertical axis is "up"; the plan box is aligned with the longest horizontal one of the others
  let up = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(axes[i][1]) > Math.abs(axes[up][1])) up = i;
  let best = -1;
  let bestLen = -1;
  for (let i = 0; i < 3; i++) {
    if (i === up) continue;
    const len = Math.hypot(axes[i][0], axes[i][2]) * (ext[i] + 1e-3);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  const bh = Math.hypot(axes[best][0], axes[best][2]) || 1;
  const e1x = axes[best][0] / bh;
  const e1z = axes[best][2] / bh;
  let hw = 0;
  let hd = 0;
  let hh = 0;
  for (let i = 0; i < 3; i++) {
    const a = axes[i];
    hw += ext[i] * Math.abs(a[0] * e1x + a[2] * e1z);
    hd += ext[i] * Math.abs(-a[0] * e1z + a[2] * e1x);
    hh += ext[i] * Math.abs(a[1]);
  }
  out.x = cx;
  out.y = cz;
  out.hw = hw;
  out.hd = hd;
  // plan rotation r maps local X to (cos r, sin r) in plan (x, y = 3D z)
  out.rotation = Math.atan2(e1z, e1x);
  out.y0 = cy - hh;
  out.y1 = cy + hh;
  return out;
}

/**
 * How deep two plan boxes overlap (separating-axis test; heights must overlap too). 0 = apart or just
 * touching.
 */
export function overlapDepth(a: PlanBox, b: PlanBox): number {
  const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (dy <= 0) return 0;
  const axes = [a.rotation, a.rotation + Math.PI / 2, b.rotation, b.rotation + Math.PI / 2];
  let depth = dy;
  for (const t of axes) {
    const ux = Math.cos(t);
    const uy = Math.sin(t);
    const ra = radius(a, ux, uy);
    const rb = radius(b, ux, uy);
    const d = Math.abs((b.x - a.x) * ux + (b.y - a.y) * uy);
    const o = ra + rb - d;
    if (o <= 0) return 0;
    if (o < depth) depth = o;
  }
  return depth;
}

function radius(b: PlanBox, ux: number, uy: number): number {
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  return b.hw * Math.abs(c * ux + s * uy) + b.hd * Math.abs(-s * ux + c * uy);
}

/** A wall segment (plan) as a plan box. */
export function wallBox(a: { x: number; y: number }, b: { x: number; y: number }, half: number, y0: number, y1: number): PlanBox {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, hw: Math.hypot(dx, dy) / 2 + half, hd: half, rotation: Math.atan2(dy, dx), y0, y1 };
}
