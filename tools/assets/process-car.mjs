// Re-structure a car GLB for the game:
//  - front towards +Z, root transform baked into the vertices, optional uniform scale
//  - one `body` node + four `wheel_FL|FR|RL|RR` nodes placed at the wheel centres (identity rotation),
//    each with ONE mesh whose primitives are joined per material
//  - textures and UVs dropped (all source maps were flat 64 px colour swatches; the game assigns its own
//    materials by name), meshopt + quantization
// usage: node process-car.mjs in.glb out.glb [scale]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { dequantize, transformMesh, joinPrimitives, prune, quantize, meshopt, weld, getBounds } from '@gltf-transform/functions';

const [, , inFile, outFile, scaleArg] = process.argv;
const SCALE = Number(scaleArg ?? 1);
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inFile);
const root = doc.getRoot();
await doc.transform(dequantize());

// materials: drop textures and extensions, keep names (the runtime maps names to its own materials)
for (const m of root.listMaterials()) {
  m.setBaseColorTexture(null).setMetallicRoughnessTexture(null).setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
  for (const e of m.listExtensions()) m.setExtension(e.extensionName, null);
  m.setName(m.getName().replace(/\.\d+$/, ''));
}
for (const e of root.listExtensionsUsed()) if (/materials_(clearcoat|ior|transmission)|texture_webp/.test(e.extensionName)) e.dispose();

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
let S = [SCALE, 0, 0, 0, 0, SCALE, 0, 0, 0, 0, SCALE, 0, 0, 0, 0, 1];
const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const apply = (m, p) => [0, 1, 2].map((i) => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);

const scene = root.listScenes()[0];
// centre the footprint on the origin along Z (the catalog footprint is symmetric)
{
  const b0 = getBounds(scene);
  const cz = ((b0.min[2] + b0.max[2]) / 2) * SCALE;
  S = mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -cz, 1], S);
  console.log('centre shift z', (-cz).toFixed(3));
}
const top = scene.listChildren();
const meshNodes = [];
const wheelNodes = [];
const visit = (n) => {
  if (/^wheel_/.test(n.getName())) wheelNodes.push(n);
  else {
    if (n.getMesh()) meshNodes.push(n);
    for (const c of n.listChildren()) visit(c);
  }
};
top.forEach(visit);

/** world-space bbox of a node (scaled) */
const bounds = (n) => {
  const b = getBounds(n);
  return { min: b.min.map((v) => v * SCALE), max: b.max.map((v) => v * SCALE) };
};

const groups = { body: [] };
const wheels = [];
for (const w of wheelNodes) {
  const c = apply(mul(S, w.getWorldMatrix()), [0, 0, 0]);
  const parts = [];
  let r = 0;
  for (const ch of w.listChildren()) {
    const nodes = [];
    const v2 = (n) => {
      if (n.getMesh()) nodes.push(n);
      n.listChildren().forEach(v2);
    };
    v2(ch);
    for (const n of nodes) {
      const b = bounds(n);
      const mid = b.min.map((v, i) => (v + b.max[i]) / 2);
      const ext = Math.max(...b.max.map((v, i) => v - b.min[i]));
      // distance from the axle in the wheel plane; caps sit a little outboard along the axle
      const off = Math.abs(mid[0] - c[0]) > 0.2 ? 9 : Math.hypot(mid[1] - c[1], mid[2] - c[2]);
      if (/tyre|tire/i.test(n.getName())) r = Math.max(r, (b.max[1] - b.min[1]) / 2);
      // keep only parts centred on the axle and no bigger than the wheel; the rest belongs to the body
      if (off < 0.09 && ext < 0.95) parts.push(n);
      else {
        console.log(`  moved to body: ${n.getName()} off=${off.toFixed(2)} ext=${ext.toFixed(2)}`);
        meshNodes.push(n);
      }
    }
  }
  wheels.push({ c, parts, r });
}
// name wheels by position: +Z = front, +X = left (driver side)
for (const w of wheels) w.name = `wheel_${w.c[2] > 0 ? 'F' : 'R'}${w.c[0] > 0 ? 'L' : 'R'}`;

function bakeInto(nodes, matrixFor) {
  const prims = new Map();
  for (const n of nodes) {
    const mesh = n.getMesh().clone();
    transformMesh(mesh, matrixFor(n));
    for (const p of mesh.listPrimitives()) {
      for (const sem of p.listSemantics()) if (sem !== 'POSITION' && sem !== 'NORMAL') p.setAttribute(sem, null);
      const key = p.getMaterial()?.getName() ?? '';
      if (!prims.has(key)) prims.set(key, []);
      prims.get(key).push(p);
    }
  }
  const out = doc.createMesh();
  for (const [, list] of prims) {
    const joined = list.length > 1 ? joinPrimitives(list) : list[0];
    out.addPrimitive(joined);
  }
  return out;
}

const vehicle = doc.createNode('vehicle');
const body = doc.createNode('body').setMesh(bakeInto(meshNodes, (n) => mul(S, n.getWorldMatrix())));
body.getMesh().setName('body');
vehicle.addChild(body);
// every wheel is built from the front-left (+X) one: the source models are not consistent per wheel
// (a missing rim, stray body parts); the game mirrors it for the right side by a half turn about Y
const tpl = wheels.find((w) => w.name === 'wheel_FL');
const wheel = doc.createNode('wheel').setMesh(bakeInto(tpl.parts, (n) => mul(T(-tpl.c[0], -tpl.c[1], -tpl.c[2]), mul(S, n.getWorldMatrix()))));
wheel.getMesh().setName('wheel');
vehicle.addChild(wheel);
vehicle.setExtras({ radius: Math.round(tpl.r * 1000) / 1000, wheels: wheels.map((w) => ({ name: w.name, at: w.c.map((v) => Math.round(v * 1000) / 1000) })) });
for (const w of wheels) console.log(w.name, w.c.map((v) => v.toFixed(3)).join(','), 'r', w.r.toFixed(3), 'parts', w.parts.length);
const disposeTree = (n) => {
  n.listChildren().forEach(disposeTree);
  n.dispose();
};
for (const n of top) disposeTree(n);
scene.addChild(vehicle);
await doc.transform(prune(), weld(), quantize({ quantizePosition: 14, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const b = getBounds(scene);
console.log('bounds', b.min.map((v) => v.toFixed(3)).join(','), b.max.map((v) => v.toFixed(3)).join(','));
await io.write(outFile, doc);
