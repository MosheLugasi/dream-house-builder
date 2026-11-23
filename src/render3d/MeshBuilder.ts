import * as THREE from 'three';

export type V3 = [number, number, number];
export type UV = [number, number];

interface Bucket {
  pos: number[];
  nrm: number[];
  uv: number[];
  idx: number[];
}

/** Accumulates quads/triangles per material key and turns them into one mesh per key. */
export class MeshBuilder {
  private buckets = new Map<string, Bucket>();

  private bucket(key: string): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = { pos: [], nrm: [], uv: [], idx: [] };
      this.buckets.set(key, b);
    }
    return b;
  }

  /** Triangle; winding is fixed automatically so that it faces `normal`. */
  tri(key: string, a: V3, b: V3, c: V3, normal: V3, uvs: [UV, UV, UV]): void {
    const bk = this.bucket(key);
    const base = bk.pos.length / 3;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const facing = nx * normal[0] + ny * normal[1] + nz * normal[2];
    bk.pos.push(...a, ...b, ...c);
    bk.nrm.push(...normal, ...normal, ...normal);
    bk.uv.push(...uvs[0], ...uvs[1], ...uvs[2]);
    if (facing >= 0) bk.idx.push(base, base + 1, base + 2);
    else bk.idx.push(base, base + 2, base + 1);
  }

  /** Quad with corners in perimeter order. */
  quad(key: string, a: V3, b: V3, c: V3, d: V3, normal: V3, uvs: [UV, UV, UV, UV]): void {
    this.tri(key, a, b, c, normal, [uvs[0], uvs[1], uvs[2]]);
    this.tri(key, a, c, d, normal, [uvs[0], uvs[2], uvs[3]]);
  }

  build(materialFor: (key: string) => THREE.Material): THREE.Group {
    const group = new THREE.Group();
    for (const [key, b] of this.buckets) {
      if (!b.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.idx);
      const mesh = new THREE.Mesh(geo, materialFor(key));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = key;
      group.add(mesh);
    }
    return group;
  }
}
