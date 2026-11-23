import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clampSize, DESIGN_CEILING, FURNITURE, getFurniture, isResizable, itemSize, resizeRange, resolveColors } from '../src/catalog';
import { placedBoxes, placedLight, placedObjectScale, placedSeats } from '../src/catalog/placed';
import type { FurnitureDef, ItemAnchors, ItemSize } from '../src/catalog/types';
import { parseProject } from '../src/io/storage';
import { sampleProject } from '../src/model/neighborhood';

const anyDef = (pred: (d: FurnitureDef) => boolean) => {
  const d = FURNITURE.find(pred);
  if (!d) throw new Error('no such item in the catalog');
  return d;
};

describe('item sizes', () => {
  it('lets ordinary items grow and shrink, and keeps vehicles / pets / stairs fixed', () => {
    const sofa = anyDef((d) => !!d.seats?.length && d.category === 'living' && !d.parametric);
    expect(isResizable(sofa)).toBe(true);
    const r = resizeRange(sofa);
    expect(r.w[0]).toBeCloseTo(sofa.size.w * 0.5);
    expect(r.w[1]).toBeCloseTo(sofa.size.w * 2);
    for (const fixed of [anyDef((d) => !!d.vehicle), anyDef((d) => !!d.pet), anyDef((d) => !!d.stair)]) {
      expect(isResizable(fixed), fixed.id).toBe(false);
      expect(clampSize(fixed, { w: 99, d: 99, h: 99 })).toEqual(fixed.size);
    }
  });

  it('clamps requested sizes and ignores garbage', () => {
    const def = anyDef((d) => d.category === 'living' && !d.parametric && isResizable(d));
    const s = clampSize(def, { w: 1000, d: -1, h: Number.NaN });
    expect(s.w).toBeCloseTo(resizeRange(def).w[1]);
    expect(s.d).toBe(def.size.d);
    expect(s.h).toBe(def.size.h);
    expect(itemSize(def, {})).toBe(def.size);
  });

  it('moves seats, lights and the footprint with the size, and mirrors them', () => {
    const sofa = anyDef((d) => !!d.seats?.length && d.category === 'living' && !d.parametric && d.seats.some((s) => Math.abs(s.x) > 0.2));
    const size = { w: sofa.size.w * 1.5, d: sofa.size.d, h: sofa.size.h * 1.2 };
    const seats = placedSeats(sofa, { size });
    const base = sofa.seats!;
    seats.forEach((s, i) => {
      expect(s.x).toBeCloseTo(base[i].x * 1.5);
      expect(s.height).toBeCloseTo(base[i].height * 1.2);
    });
    const mirrored = placedSeats(sofa, { size, mirror: true });
    mirrored.forEach((s, i) => {
      expect(s.x).toBeCloseTo(-seats[i].x);
      expect(s.facing).toBeCloseTo(-seats[i].facing);
    });
    expect(placedObjectScale(sofa, { size, mirror: true })).toEqual({ x: expect.closeTo(-1.5), y: expect.closeTo(1.2), z: 1 });
    const boxes = placedBoxes(sofa, { size }, { w: sofa.size.w, d: sofa.size.d }, null);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].w).toBeCloseTo(size.w);

    // a pendant made 1.5x longer still hangs from the ceiling: its bulb moves down
    const pendant = anyDef((d) => d.mount === 'ceiling' && !!d.light && !d.parametric && isResizable(d));
    const tall = { ...pendant.size, h: Math.min(resizeRange(pendant).h[1], pendant.size.h * 1.5) };
    const l = placedLight(pendant, { size: tall })!;
    const k = tall.h / pendant.size.h;
    expect(l.y).toBeCloseTo(DESIGN_CEILING - (DESIGN_CEILING - pendant.light!.y) * k);
  });

  it('prefers the anchors a parametric build publishes', () => {
    const fake: FurnitureDef = { ...anyDef((d) => !!d.light), parametric: true };
    const anchors: ItemAnchors = { light: { x: 0.3, y: 1, z: 0 }, boxes: [{ x: -1, z: 0, w: 1, d: 0.6, h: 0.9 }] };
    expect(placedLight(fake, { mirror: true }, anchors)).toEqual({ x: -0.3, y: 1, z: 0 });
    expect(placedBoxes(fake, { mirror: true }, { w: 1, d: 1 }, anchors)[0].x).toBe(1);
  });
});

/** Build a parametric item at a size and return its bounding box (y relative to the floor / ceiling). */
function boundsAt(def: FurnitureDef, size: ItemSize): THREE.Box3 {
  const obj = def.build({ colors: resolveColors(def), size });
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj, true);
}

describe('parametric items', () => {
  const list = FURNITURE.filter((d) => d.parametric);

  it('rebuild inside the requested size at the smallest, default and largest size', () => {
    const problems: string[] = [];
    for (const def of list) {
      const r = resizeRange(def);
      for (const size of [clampSize(def, { w: r.w[0], d: r.d[0], h: r.h[0] }), def.size, clampSize(def, { w: r.w[1], d: r.d[1], h: r.h[1] })]) {
        const b = boundsAt(def, size);
        const tol = 0.012;
        const tag = `${def.id} @ ${size.w}×${size.d}×${size.h}`;
        if (b.min.x < -size.w / 2 - tol || b.max.x > size.w / 2 + tol) problems.push(`${tag}: x ${b.min.x.toFixed(3)}..${b.max.x.toFixed(3)}`);
        if (b.min.z < -size.d / 2 - tol || b.max.z > size.d / 2 + tol) problems.push(`${tag}: z ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)}`);
        const [y0, y1] = def.mount === 'ceiling' ? [DESIGN_CEILING - size.h, DESIGN_CEILING] : [0, size.h];
        if (b.min.y < y0 - tol || b.max.y > y1 + tol) problems.push(`${tag}: y ${b.min.y.toFixed(3)}..${b.max.y.toFixed(3)} outside ${y0.toFixed(2)}..${y1.toFixed(2)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('publish anchors inside their footprint', () => {
    const problems: string[] = [];
    for (const def of list) {
      const a = def.build({ colors: resolveColors(def), size: def.size }).userData.anchors as ItemAnchors | undefined;
      if (def.light && !a?.light) problems.push(`${def.id}: lamp without anchors.light`);
      for (const b of a?.boxes ?? []) {
        if (Math.abs(b.x) + b.w / 2 > def.size.w / 2 + 0.02 || Math.abs(b.z) + b.d / 2 > def.size.d / 2 + 0.02) problems.push(`${def.id}: box outside the footprint`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('saved sizes', () => {
  it('survive a save and drop invalid values', () => {
    const p = sampleProject();
    const f = p.buildings[0].levels[0].furniture;
    f[0].size = { w: 1.1, d: 0.5, h: 0.8 };
    f[0].mirror = true;
    (f[1] as unknown as { size: unknown }).size = { w: 'big', d: 1, h: 1 };
    const back = parseProject(JSON.stringify(p));
    const g = back.buildings[0].levels[0].furniture;
    expect(g[0].size).toEqual({ w: 1.1, d: 0.5, h: 0.8 });
    expect(g[0].mirror).toBe(true);
    expect(g[1].size).toBeUndefined();
    expect(getFurniture(g[0].catalogId)).toBeDefined();
  });
});
