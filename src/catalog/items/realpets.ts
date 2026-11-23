import type { BuildContext, FurnitureDef } from '../types';
import { D, INK, LINE_THIN, darken, lighten, sym, type Ctx2D } from '../kit';
import { Pet, type PetOptions } from '../../render3d/Pet';

/**
 * Pets: procedurally built and animated animals (see render3d/Pet.ts). Every item is `noBake`:
 * `build` returns the pet's root with `userData.pet` (a `PetRuntime`) so the game can animate it.
 */

function buildPet(kind: 'dog' | 'cat', ctx: BuildContext, opts?: PetOptions) {
  const pet = new Pet(kind, ctx.colors, opts);
  pet.root.userData.pet = pet;
  return pet.root;
}

interface PlanDims {
  /** half width of the body, z of rump and chest, head center z and radius, nose z */
  bw: number;
  zr: number;
  zc: number;
  hz: number;
  hr: number;
  nz: number;
  /** tail: length and sideways curl */
  tail: number;
  curl: number;
  ear: 'drop' | 'fold' | 'point';
}

/** Top-down symbol: tail, paws, body, collar, head with ears and muzzle. Front (+Z) points down. */
function petPlan(ctx: Ctx2D, d: PlanDims, c: Record<string, string>, opt: { stripes?: boolean; patch?: boolean } = {}): void {
  const coat = lighten(c.coat, 0.18);
  const dark = darken(c.coat, 0.2);
  const pale = lighten(c.coat, opt.stripes || opt.patch ? 0.65 : 0.45);
  const mark = c.markings;
  const len = d.zc - d.zr;
  const mid = (d.zc + d.zr) / 2;
  const lw = LINE_THIN * Math.min(1, Math.max(0.6, d.hr / 0.075));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // tail: an outlined, tapering stroke
  const tailPath = () => {
    ctx.beginPath();
    ctx.moveTo(0, d.zr + d.bw * 0.4);
    ctx.quadraticCurveTo(-d.curl * 0.3, d.zr - d.tail * 0.55, d.curl, d.zr - d.tail);
  };
  tailPath();
  ctx.strokeStyle = INK;
  ctx.lineWidth = d.bw * 0.42 + lw * 2;
  ctx.stroke();
  tailPath();
  ctx.strokeStyle = coat;
  ctx.lineWidth = d.bw * 0.42;
  ctx.stroke();
  // paws peeking out beside the body
  for (const s of [1, -1]) {
    D.ellipse(ctx, s * d.bw * 0.8, d.zc - len * 0.08, d.bw * 0.26, d.bw * 0.38, pale, INK, lw);
    D.ellipse(ctx, s * d.bw * 0.8, d.zr + len * 0.22, d.bw * 0.26, d.bw * 0.38, pale, INK, lw);
  }
  // body: rounded rump, waist, wider ribcage and shoulders
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(0, d.zr);
    ctx.bezierCurveTo(d.bw * 1.15, d.zr, d.bw * 0.95, mid - len * 0.22, d.bw * 0.86, mid - len * 0.05);
    ctx.bezierCurveTo(d.bw * 0.82, mid + len * 0.05, d.bw * 1.05, mid + len * 0.12, d.bw, mid + len * 0.3);
    ctx.bezierCurveTo(d.bw * 0.95, d.zc + d.bw * 0.2, d.bw * 0.5, d.zc + d.bw * 0.55, 0, d.zc + d.bw * 0.55);
    ctx.bezierCurveTo(-d.bw * 0.5, d.zc + d.bw * 0.55, -d.bw * 0.95, d.zc + d.bw * 0.2, -d.bw, mid + len * 0.3);
    ctx.bezierCurveTo(-d.bw * 1.05, mid + len * 0.12, -d.bw * 0.82, mid + len * 0.05, -d.bw * 0.86, mid - len * 0.05);
    ctx.bezierCurveTo(-d.bw * 0.95, mid - len * 0.22, -d.bw * 1.15, d.zr, 0, d.zr);
    ctx.closePath();
  };
  bodyPath();
  ctx.fillStyle = coat;
  ctx.fill();
  ctx.save();
  bodyPath();
  ctx.clip();
  if (opt.stripes) {
    ctx.strokeStyle = mark;
    ctx.lineWidth = len * 0.04;
    for (let i = 0; i < 7; i++) {
      const z = d.zr + len * (0.12 + i * 0.125);
      for (const s of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(s * d.bw * 1.1, z - len * 0.03);
        ctx.quadraticCurveTo(s * d.bw * 0.5, z + len * 0.03, s * d.bw * 0.16, z + len * 0.035);
        ctx.stroke();
      }
    }
    D.line(ctx, 0, d.zr + len * 0.05, 0, d.zc, mark, d.bw * 0.2);
  } else if (opt.patch) {
    D.ellipse(ctx, d.bw * 0.1, mid - len * 0.08, d.bw * 1.0, len * 0.19, mark, null);
    D.circle(ctx, 0, d.zr, d.bw * 0.5, mark, null);
  } else {
    // a slightly darker line down the back
    D.ellipse(ctx, 0, mid, d.bw * 0.34, len * 0.44, dark, null);
  }
  ctx.restore();
  bodyPath();
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.stroke();
  // neck (outlined, then filled so that it merges with the body) and collar
  const nw = d.hr * 1.35;
  ctx.lineCap = 'butt';
  D.line(ctx, 0, d.zc + d.bw * 0.3, 0, d.hz, INK, nw + lw * 2);
  D.line(ctx, 0, d.zc, 0, d.hz, coat, nw);
  const cz = (d.zc + d.bw * 0.55 + d.hz - d.hr) / 2;
  D.line(ctx, -nw / 2, cz, nw / 2, cz, c.collar, d.bw * 0.2);
  ctx.lineCap = 'round';
  const earFill = opt.patch ? mark : dark;
  // pointed ears lie under the skull, drop / folded ears over it
  if (d.ear === 'point') {
    for (const s of [1, -1])
      D.poly(ctx, [[s * d.hr * 0.3, d.hz - d.hr * 0.5], [s * d.hr * 1.08, d.hz - d.hr * 0.8], [s * d.hr * 0.98, d.hz + d.hr * 0.15]], true, earFill, INK, lw);
  }
  // muzzle, then skull
  D.ellipse(ctx, 0, d.nz - d.hr * 0.55, d.hr * (d.ear === 'point' ? 0.42 : 0.5), d.hr * 0.66, pale, INK, lw);
  D.circle(ctx, 0, d.hz, d.hr, coat, INK, lw);
  if (opt.stripes) {
    for (const x of [-0.34, 0, 0.34]) D.line(ctx, x * d.hr, d.hz - d.hr * 0.6, x * d.hr * 0.8, d.hz, mark, d.hr * 0.11);
  } else if (opt.patch) {
    // tan mask with a white blaze
    for (const s of [1, -1]) D.ellipse(ctx, s * d.hr * 0.52, d.hz - d.hr * 0.05, d.hr * 0.34, d.hr * 0.62, mark, null);
  }
  if (d.ear === 'drop') {
    for (const s of [1, -1]) D.ellipse(ctx, s * d.hr * 1.0, d.hz + d.hr * 0.05, d.hr * 0.34, d.hr * 0.74, earFill, INK, lw, s * -0.22);
  } else if (d.ear === 'fold') {
    for (const s of [1, -1])
      D.poly(ctx, [[s * d.hr * 0.3, d.hz - d.hr * 0.62], [s * d.hr * 1.08, d.hz - d.hr * 0.5], [s * d.hr * 0.72, d.hz + d.hr * 0.5]], true, earFill, INK, lw);
  }
  // nose and eyes
  D.circle(ctx, 0, d.nz - d.hr * 0.13, d.hr * (d.ear === 'point' ? 0.1 : 0.16), d.ear === 'point' ? '#c9736e' : '#2b2523', null);
  for (const s of [1, -1]) D.circle(ctx, s * d.hr * 0.42, d.hz + d.hr * 0.5, d.hr * 0.1, '#2b2523', null);
}

const dog: FurnitureDef = {
  id: 'pet-dog',
  name: 'כלב',
  category: 'pets',
  group: 'חיות ריאליסטיות',
  size: { w: 0.3, d: 1.36, h: 0.76 },
  noBake: true,
  colors: [
    { key: 'coat', label: 'פרווה', default: '#d7a35a' },
    { key: 'markings', label: 'גוון בהיר', default: '#f1dcae' },
    { key: 'collar', label: 'קולר', default: '#c8362e' },
  ],
  pet: { kind: 'dog', walkSpeed: 1.4, runSpeed: 5, label: 'כלב' },
  actions: [{ kind: 'pet', variant: 'dog' }],
  build: (ctx) => buildPet('dog', ctx),
  draw2d: (ctx, c) => sym(ctx, () => petPlan(ctx, { bw: 0.13, zr: -0.385, zc: 0.2, hz: 0.42, hr: 0.08, nz: 0.59, tail: 0.23, curl: 0.035, ear: 'drop' }, c)),
};

const puppy: FurnitureDef = {
  id: 'pet-puppy',
  name: 'כלב קטן (טרייר)',
  category: 'pets',
  group: 'חיות ריאליסטיות',
  size: { w: 0.19, d: 0.68, h: 0.45 },
  noBake: true,
  colors: [
    { key: 'coat', label: 'פרווה', default: '#f3eee4' },
    { key: 'markings', label: 'כתמים', default: '#b5733a' },
    { key: 'collar', label: 'קולר', default: '#2f7fc4' },
  ],
  pet: { kind: 'dog', walkSpeed: 1.1, runSpeed: 4, label: 'כלב' },
  actions: [{ kind: 'pet', variant: 'dog' }],
  build: (ctx) => buildPet('dog', ctx, { breed: 'terrier' }),
  draw2d: (ctx, c) => sym(ctx, () => petPlan(ctx, { bw: 0.074, zr: -0.215, zc: 0.105, hz: 0.225, hr: 0.052, nz: 0.325, tail: 0.05, curl: 0.008, ear: 'fold' }, c, { patch: true })),
};

const cat: FurnitureDef = {
  id: 'pet-cat',
  name: 'חתול',
  category: 'pets',
  group: 'חיות ריאליסטיות',
  size: { w: 0.17, d: 0.88, h: 0.37 },
  noBake: true,
  colors: [
    { key: 'coat', label: 'פרווה', default: '#d98f3e' },
    { key: 'markings', label: 'פסים', default: '#a9621f' },
    { key: 'collar', label: 'קולר', default: '#3aa6a0' },
  ],
  pet: { kind: 'cat', walkSpeed: 1.0, runSpeed: 4, label: 'חתול' },
  actions: [{ kind: 'pet', variant: 'cat' }],
  build: (ctx) => buildPet('cat', ctx),
  draw2d: (ctx, c) => sym(ctx, () => petPlan(ctx, { bw: 0.066, zr: -0.205, zc: 0.1, hz: 0.215, hr: 0.05, nz: 0.285, tail: 0.215, curl: 0.045, ear: 'point' }, c, { stripes: true })),
};

export const REAL_PETS: FurnitureDef[] = [dog, puppy, cat];
