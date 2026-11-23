import type { BuildContext, FurnitureDef } from '../types';
import { D, INK, INK_SOFT, LINE_THIN, darken, lighten, sym, type Ctx2D } from '../kit';
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

/** Top-down symbol: tail, legs/paws, body, collar, head with muzzle and ears. Front (+Z) points down. */
function petPlan(ctx: Ctx2D, d: PlanDims, c: Record<string, string>, opt: { stripes?: boolean; patch?: boolean } = {}): void {
  const coat = lighten(c.coat, 0.18);
  const dark = darken(c.coat, 0.22);
  const mark = c.markings;
  const len = d.zc - d.zr;
  const mid = (d.zc + d.zr) / 2;
  // tail
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, d.zr + d.bw * 0.3);
  ctx.quadraticCurveTo(d.curl * 0.2, d.zr - d.tail * 0.55, d.curl, d.zr - d.tail);
  ctx.strokeStyle = INK;
  ctx.lineWidth = d.bw * 0.5 + LINE_THIN * 2;
  ctx.stroke();
  ctx.strokeStyle = opt.stripes ? mark : coat;
  ctx.lineWidth = d.bw * 0.5;
  ctx.stroke();
  // paws peeking out beside the body
  for (const s of [1, -1]) {
    D.ellipse(ctx, s * d.bw * 0.86, d.zc - len * 0.1, d.bw * 0.3, d.bw * 0.42, lighten(c.coat, 0.4), INK, LINE_THIN);
    D.ellipse(ctx, s * d.bw * 0.86, d.zr + len * 0.2, d.bw * 0.3, d.bw * 0.42, lighten(c.coat, 0.4), INK, LINE_THIN);
  }
  // body: wider at the chest, narrower at the waist
  ctx.beginPath();
  ctx.moveTo(0, d.zr);
  ctx.bezierCurveTo(d.bw * 1.25, d.zr, d.bw * 0.7, mid, d.bw, mid + len * 0.2);
  ctx.bezierCurveTo(d.bw * 1.15, d.zc - len * 0.05, d.bw * 0.6, d.zc + d.bw * 0.5, 0, d.zc + d.bw * 0.5);
  ctx.bezierCurveTo(-d.bw * 0.6, d.zc + d.bw * 0.5, -d.bw * 1.15, d.zc - len * 0.05, -d.bw, mid + len * 0.2);
  ctx.bezierCurveTo(-d.bw * 0.7, mid, -d.bw * 1.25, d.zr, 0, d.zr);
  ctx.closePath();
  ctx.fillStyle = coat;
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (opt.stripes) {
    ctx.strokeStyle = mark;
    ctx.lineWidth = len * 0.045;
    for (let i = 0; i < 6; i++) {
      const z = d.zr + len * (0.14 + i * 0.14);
      ctx.beginPath();
      ctx.moveTo(-d.bw, z - len * 0.03);
      ctx.quadraticCurveTo(0, z + len * 0.05, d.bw, z - len * 0.03);
      ctx.stroke();
    }
  } else if (opt.patch) {
    D.ellipse(ctx, d.bw * 0.15, mid - len * 0.05, d.bw * 0.95, len * 0.2, mark, null);
  } else {
    // a darker line down the back
    D.ellipse(ctx, 0, mid, d.bw * 0.3, len * 0.42, dark, null);
  }
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE_THIN;
  ctx.stroke();
  // collar
  D.line(ctx, -d.bw * 0.62, d.zc + d.bw * 0.2, d.bw * 0.62, d.zc + d.bw * 0.2, c.collar, d.bw * 0.22);
  // ears (drawn under the head for pointed ears, beside it for drop ears)
  const earFill = opt.patch ? mark : dark;
  if (d.ear === 'point') {
    for (const s of [1, -1])
      D.poly(ctx, [[s * d.hr * 0.25, d.hz - d.hr * 0.55], [s * d.hr * 1.0, d.hz - d.hr * 0.75], [s * d.hr * 0.9, d.hz + d.hr * 0.1]], true, earFill, INK, LINE_THIN);
  }
  // head + muzzle
  D.ellipse(ctx, 0, d.nz - d.hr * 0.5, d.hr * 0.5, d.hr * 0.62, lighten(c.coat, opt.stripes || opt.patch ? 0.6 : 0.35), INK, LINE_THIN);
  D.circle(ctx, 0, d.hz, d.hr, coat, INK, LINE_THIN);
  if (opt.stripes) {
    for (const x of [-0.3, 0, 0.3]) D.line(ctx, x * d.hr, d.hz - d.hr * 0.55, x * d.hr * 0.8, d.hz + d.hr * 0.05, mark, d.hr * 0.12);
  }
  if (d.ear === 'drop') {
    for (const s of [1, -1]) D.ellipse(ctx, s * d.hr * 0.98, d.hz + d.hr * 0.05, d.hr * 0.36, d.hr * 0.72, earFill, INK, LINE_THIN, s * -0.25);
  } else if (d.ear === 'fold') {
    for (const s of [1, -1])
      D.poly(ctx, [[s * d.hr * 0.35, d.hz - d.hr * 0.5], [s * d.hr * 1.05, d.hz - d.hr * 0.45], [s * d.hr * 0.8, d.hz + d.hr * 0.45]], true, earFill, INK, LINE_THIN);
  }
  // nose and eyes
  D.circle(ctx, 0, d.nz - d.hr * 0.12, d.hr * 0.16, '#2b2523', null);
  for (const s of [1, -1]) D.circle(ctx, s * d.hr * 0.42, d.hz + d.hr * 0.42, d.hr * 0.1, '#2b2523', null);
  void INK_SOFT;
}

const dog: FurnitureDef = {
  id: 'pet-dog',
  name: 'כלב',
  category: 'pet',
  size: { w: 0.3, d: 1.1, h: 0.76 },
  noBake: true,
  colors: [
    { key: 'coat', label: 'פרווה', default: '#d7a35a' },
    { key: 'markings', label: 'גוון בהיר', default: '#f1dcae' },
    { key: 'collar', label: 'קולר', default: '#c8362e' },
  ],
  pet: { kind: 'dog', walkSpeed: 1.4, runSpeed: 5, label: 'כלב' },
  build: (ctx) => buildPet('dog', ctx),
  draw2d: (ctx, c) => sym(ctx, () => petPlan(ctx, { bw: 0.125, zr: -0.3, zc: 0.2, hz: 0.36, hr: 0.085, nz: 0.54, tail: 0.24, curl: 0.05, ear: 'drop' }, c)),
};

const puppy: FurnitureDef = {
  id: 'pet-puppy',
  name: 'כלב קטן (טרייר)',
  category: 'pet',
  size: { w: 0.19, d: 0.6, h: 0.45 },
  noBake: true,
  colors: [
    { key: 'coat', label: 'פרווה', default: '#f3eee4' },
    { key: 'markings', label: 'כתמים', default: '#b5733a' },
    { key: 'collar', label: 'קולר', default: '#2f7fc4' },
  ],
  pet: { kind: 'dog', walkSpeed: 1.1, runSpeed: 4, label: 'כלב' },
  build: (ctx) => buildPet('dog', ctx, { breed: 'terrier' }),
  draw2d: (ctx, c) => sym(ctx, () => petPlan(ctx, { bw: 0.078, zr: -0.2, zc: 0.1, hz: 0.19, hr: 0.058, nz: 0.295, tail: 0.085, curl: 0.02, ear: 'fold' }, c, { patch: true })),
};

const cat: FurnitureDef = {
  id: 'pet-cat',
  name: 'חתול',
  category: 'pet',
  size: { w: 0.16, d: 0.78, h: 0.36 },
  noBake: true,
  colors: [
    { key: 'coat', label: 'פרווה', default: '#d98f3e' },
    { key: 'markings', label: 'פסים', default: '#a9621f' },
    { key: 'collar', label: 'קולר', default: '#3aa6a0' },
  ],
  pet: { kind: 'cat', walkSpeed: 1.0, runSpeed: 4, label: 'חתול' },
  build: (ctx) => buildPet('cat', ctx),
  draw2d: (ctx, c) => sym(ctx, () => petPlan(ctx, { bw: 0.062, zr: -0.14, zc: 0.1, hz: 0.185, hr: 0.05, nz: 0.27, tail: 0.24, curl: 0.06, ear: 'point' }, c, { stripes: true })),
};

export const PETS: FurnitureDef[] = [dog, puppy, cat];
