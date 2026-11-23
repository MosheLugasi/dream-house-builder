import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FURNITURE, resolveColors } from '../src/catalog';
import { bake, Kit, M } from '../src/catalog/kit';
import type { ActionKind } from '../src/catalog/types';

describe('bake with animated parts', () => {
  it('keeps parts as separate groups with their pivot transform', () => {
    const k = new Kit();
    k.box(1, 1, 1, M.matte('#888888'));
    const door = k.part('door', -0.5, 0.1, 0.5, { open: -1.6 });
    door.box(0.5, 1, 0.02, M.matte('#ffffff'), 0.25, 0, 0);
    const out = bake(k.g);
    const p = out.getObjectByName('part:door')!;
    expect(p).toBeDefined();
    expect(p.position.toArray()).toEqual([-0.5, 0.1, 0.5]);
    expect(p.userData.open).toBe(-1.6);
    // the part's own geometry stays relative to the hinge
    const g = (p.children[0] as THREE.Mesh).geometry;
    g.computeBoundingBox();
    expect(g.boundingBox!.min.x).toBeCloseTo(0, 3);
    expect(g.boundingBox!.max.x).toBeCloseTo(0.5, 3);
  });

  it('keeps every fish of a fish part separate', () => {
    const k = new Kit();
    const fish = k.part('fish', 0, 0.5, 0);
    for (let i = 0; i < 3; i++) {
      const f = new Kit();
      f.sphere(0.02, M.matte('#ff8800'));
      fish.sub(f, i * 0.1, 0, 0);
    }
    const out = bake(k.g);
    expect(out.getObjectByName('part:fish')!.children.length).toBe(3);
  });
});

/** parts each action kind needs (see docs/catalog-authoring.md) */
const NEEDS: Partial<Record<ActionKind, string[]>> = {
  tv: ['screen'],
  computer: ['screen'],
  game: ['screen'],
  fan: ['rotor'],
  swing: ['swing'],
  rock: ['rock'],
  fish: ['fish'],
  clock: ['hour', 'minute'],
};

describe('catalog', () => {
  it('has hundreds of items with unique ids', () => {
    const ids = new Set<string>();
    for (const f of FURNITURE) {
      expect(ids.has(f.id), `duplicate id ${f.id}`).toBe(false);
      ids.add(f.id);
    }
    expect(FURNITURE.length).toBeGreaterThan(300);
  });

  it('builds every item and every action has what it needs', () => {
    const problems: string[] = [];
    for (const def of FURNITURE) {
      let obj: THREE.Object3D;
      try {
        obj = def.build({ colors: resolveColors(def) });
      } catch (e) {
        problems.push(`${def.id}: build failed ${String(e)}`);
        continue;
      }
      const parts = new Set<string>();
      obj.traverse((o) => {
        if (typeof o.userData.part === 'string') parts.add(o.userData.part);
      });
      for (const a of def.actions ?? []) {
        for (const p of NEEDS[a.kind] ?? []) if (!parts.has(p)) problems.push(`${def.id}: action ${a.kind} needs part ${p}`);
        if ((a.kind === 'sleep' || a.kind === 'swing' || a.kind === 'rock') && !def.seats?.length) problems.push(`${def.id}: ${a.kind} needs a seat`);
        if (a.kind === 'slide' && (a.path?.length ?? 0) < 2) problems.push(`${def.id}: slide needs a path`);
        if (a.kind === 'light' && !def.light) problems.push(`${def.id}: light action without light`);
      }
      if (!def.name || /[a-z]/i.test(def.name.replace(/[A-Z]{1,3}\d*|\d+"?/g, ''))) {
        // names are Hebrew (abbreviations like "LED", "DJ" are fine)
        if (!/[֐-׿]/.test(def.name)) problems.push(`${def.id}: name is not Hebrew`);
      }
    }
    expect(problems).toEqual([]);
  });
});
