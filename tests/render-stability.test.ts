import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { subtractRect, visibleAreas } from '../src/render3d/buildSite';
import { StaticBatches } from '../src/render3d/StaticBatches';
import type { Site } from '../src/model/types';

const area = (x0: number, y0: number, x1: number, y1: number, finish = 'grass') => ({ id: `a${x0}${y0}`, x0, y0, x1, y1, finish });
const sum = (rects: [number, number, number, number][]) => rects.reduce((s, r) => s + (r[2] - r[0]) * (r[3] - r[1]), 0);

describe('site areas (no coplanar overlaps → no z-fighting)', () => {
  it('subtracts rectangles', () => {
    expect(subtractRect([0, 0, 10, 10], [20, 20, 30, 30])).toEqual([[0, 0, 10, 10]]);
    expect(subtractRect([0, 0, 10, 10], [-1, -1, 11, 11])).toEqual([]);
    const ring = subtractRect([0, 0, 10, 10], [4, 4, 6, 6]);
    expect(ring).toHaveLength(4);
    expect(sum(ring)).toBeCloseTo(96);
  });

  it('later areas cover earlier ones and roads cover areas, as in the 2D plan', () => {
    const site = { areas: [area(0, 0, 50, 50), area(10, 10, 20, 20, 'cobblestone')], roads: [[4, 4]] } as unknown as Site;
    const [lawn, cobble] = visibleAreas(site);
    // the cobblestone keeps all of itself, the lawn loses the cobblestone and the road cell (40..50)
    expect(sum(cobble.rects)).toBeCloseTo(100);
    expect(sum(lawn.rects)).toBeCloseTo(2500 - 100 - 100);
    // nothing of the result overlaps anything else
    const all = [...lawn.rects, ...cobble.rects];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const ov = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
        expect(ov).toBeCloseTo(0);
      }
  });
});

describe('static batches', () => {
  const make = () => {
    const scene = new THREE.Scene();
    const mat = new THREE.MeshStandardMaterial();
    const geo = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const item = (x: number) => {
      const holder = new THREE.Group();
      const m = new THREE.Mesh(geo, mat);
      holder.add(m);
      holder.position.x = x;
      scene.add(holder);
      return { holder, mesh: m };
    };
    return { scene, mat, item };
  };

  it('draws items through one batch per material and follows them', () => {
    const { scene, item } = make();
    const b = new StaticBatches();
    scene.add(b.group);
    const a = item(0);
    const c = item(5);
    scene.updateMatrixWorld();
    b.add('a', a.holder);
    b.add('c', c.holder);
    // the originals are hidden from rendering, one batch draws both
    expect(a.mesh.visible).toBe(false);
    expect(b.group.children).toHaveLength(1);
    const batch = b.group.children[0] as THREE.BatchedMesh;
    expect(batch.instanceCount).toBe(2);
    const cam = new THREE.PerspectiveCamera();
    b.sync(cam);
    // moved
    c.holder.position.x = 7;
    scene.updateMatrixWorld();
    b.sync(cam);
    const m = new THREE.Matrix4();
    const ids = [0, 1].map((i) => batch.getMatrixAt(i, m.clone()).elements[12]).sort();
    expect(ids).toEqual([0, 7]);
    // hidden by its holder
    a.holder.visible = false;
    b.sync(cam);
    expect(batch.getVisibleAt(0) || batch.getVisibleAt(1)).toBe(true);
    expect(batch.getVisibleAt(0) && batch.getVisibleAt(1)).toBe(false);
    // removed: the mesh renders on its own again
    b.remove('a');
    expect(a.mesh.visible).toBe(true);
    expect(batch.instanceCount).toBe(1);
  });

  it('follows a material swap and gives back meshes someone else shows', () => {
    const { scene, item } = make();
    const b = new StaticBatches();
    scene.add(b.group);
    const a = item(0);
    scene.updateMatrixWorld();
    b.add('a', a.holder);
    const cam = new THREE.PerspectiveCamera();
    a.mesh.material = new THREE.MeshStandardMaterial({ emissive: '#fff' });
    b.sync(cam);
    expect(b.group.children).toHaveLength(1);
    expect((b.group.children[0] as THREE.Mesh).material).toBe(a.mesh.material);
    a.mesh.visible = true;
    b.sync(cam);
    expect(b.group.children).toHaveLength(0);
  });

  it('leaves transparent and hooked meshes alone', () => {
    const { scene, item } = make();
    const b = new StaticBatches();
    const a = item(0);
    a.mesh.material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });
    const c = item(1);
    c.mesh.onBeforeRender = () => {};
    scene.updateMatrixWorld();
    b.add('a', a.holder);
    b.add('c', c.holder);
    expect(a.mesh.visible).toBe(true);
    expect(c.mesh.visible).toBe(true);
    expect(b.group.children).toHaveLength(0);
  });
});
