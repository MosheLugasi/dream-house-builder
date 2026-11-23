import * as THREE from 'three';
import type { Opening, OpeningType } from '../model/types';

/**
 * Doors & windows catalog.
 *
 * 3D local frame: origin on the wall centerline at the opening's center, at floor level.
 * X runs along the wall, Y up, Z across the wall. Door leaves swing toward +Z unless flipped.
 * 2D local frame: x along the wall, y across; origin at the opening center.
 */
export interface OpeningDef {
  id: string;
  name: string;
  type: OpeningType;
  width: number;
  height: number;
  sill: number;
  /** people can walk through (all doors; never windows) */
  passable: boolean;
  build(o: Opening, wallThickness: number): THREE.Object3D;
  draw2d(ctx: CanvasRenderingContext2D, o: Opening, wallThickness: number): void;
}

/** Animated parts are listed in `object.userData.anim` so walk mode can open doors. */
export type OpeningAnim =
  | { kind: 'swing'; leaf: THREE.Object3D; angle: number }
  | { kind: 'slide'; leaf: THREE.Object3D; dx: number };

const mats = {
  white: new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.45 }),
  oak: new THREE.MeshStandardMaterial({ color: '#b08a5a', roughness: 0.55 }),
  entrance: new THREE.MeshStandardMaterial({ color: '#2f4a4f', roughness: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.35, metalness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.25, metalness: 0.9 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: '#a9c6cf',
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    opacity: 0.2,
    envMapIntensity: 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  stone: new THREE.MeshStandardMaterial({ color: '#d9d5cc', roughness: 0.6 }),
};

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow && mat !== mats.glass;
  m.receiveShadow = mat !== mats.glass;
  return m;
}

/** Casing around the opening: two jambs + head (+ sill board for windows). */
function casing(g: THREE.Group, o: Opening, t: number, mat: THREE.Material, fw = 0.06): void {
  const depth = t + 0.03;
  const { width: w, height: h, sill: s } = o;
  g.add(box(fw, h, depth, mat, -w / 2 + fw / 2, s + h / 2, 0));
  g.add(box(fw, h, depth, mat, w / 2 - fw / 2, s + h / 2, 0));
  g.add(box(w, fw, depth, mat, 0, s + h - fw / 2, 0));
  if (o.type === 'window') {
    g.add(box(w, fw, depth, mat, 0, s + fw / 2, 0));
    // interior + exterior sill boards
    g.add(box(w + 0.12, 0.035, depth + 0.1, mats.stone, 0, s - 0.0175, 0));
  }
}

function glassPane(g: THREE.Object3D, w: number, h: number, x: number, y: number, frame: THREE.Material, fw = 0.045): void {
  // sash frame + glass
  g.add(box(fw, h, 0.05, frame, x - w / 2 + fw / 2, y, 0));
  g.add(box(fw, h, 0.05, frame, x + w / 2 - fw / 2, y, 0));
  g.add(box(w - 2 * fw, fw, 0.05, frame, x, y + h / 2 - fw / 2, 0));
  g.add(box(w - 2 * fw, fw, 0.05, frame, x, y - h / 2 + fw / 2, 0));
  g.add(box(w - 2 * fw, h - 2 * fw, 0.012, mats.glass, x, y, 0, false));
}

function handle(parent: THREE.Object3D, x: number, y: number, zSide: number): void {
  for (const s of [-1, 1]) {
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 16), mats.metal);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(x, y, s * zSide);
    parent.add(rose);
    const lever = box(0.11, 0.018, 0.018, mats.metal, x - Math.sign(x || 1) * 0.045, y, s * (zSide + 0.035));
    parent.add(lever);
  }
}

function swingLeaf(
  g: THREE.Group,
  o: Opening,
  leafW: number,
  hingeX: number,
  dirX: 1 | -1,
  mat: THREE.Material,
  opts: { thick?: number; glassPanel?: boolean } = {},
): OpeningAnim {
  const thick = opts.thick ?? 0.04;
  const h = o.height - 0.07;
  const pivot = new THREE.Group();
  pivot.position.set(hingeX, 0, 0);
  const cx = (dirX * leafW) / 2;
  if (opts.glassPanel) {
    const leaf = box(leafW, h, thick, mat, cx, h / 2 + 0.005, 0);
    pivot.add(leaf);
    const gp = box(leafW * 0.28, h * 0.62, thick + 0.004, mats.glass, cx + dirX * leafW * 0.2, h * 0.55, 0, false);
    pivot.add(gp);
  } else {
    pivot.add(box(leafW, h, thick, mat, cx, h / 2 + 0.005, 0));
    // shallow panels for a classic look
    for (const py of [0.3, 0.72]) {
      const panel = box(leafW * 0.66, h * 0.36, thick + 0.006, mat, cx, h * py, 0);
      pivot.add(panel);
    }
  }
  handle(pivot, dirX * (leafW - 0.08), 1.02, thick / 2 + 0.006);
  g.add(pivot);
  const swingSign = o.flipV ? -1 : 1;
  return { kind: 'swing', leaf: pivot, angle: -dirX * swingSign * (Math.PI / 2) * 0.96 };
}

function swingDoor(mat: THREE.Material, opts: { thick?: number; glassPanel?: boolean; casingMat?: THREE.Material } = {}) {
  return (o: Opening, t: number): THREE.Object3D => {
    const g = new THREE.Group();
    casing(g, o, t, opts.casingMat ?? mats.white);
    const inner = o.width - 0.12;
    const hingeLeft = !o.flipH;
    const anim = swingLeaf(g, o, inner, hingeLeft ? -inner / 2 : inner / 2, hingeLeft ? 1 : -1, mat, opts);
    g.userData.anim = [anim];
    return g;
  };
}

function drawSwing2d(ctx: CanvasRenderingContext2D, o: Opening, t: number, leaves: 1 | 2): void {
  const w = o.width;
  const side = o.flipV ? -1 : 1;
  ctx.save();
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = '#3a3f47';
  ctx.fillStyle = '#ffffff';
  // jambs
  ctx.fillRect(-w / 2, -t / 2, 0.05, t);
  ctx.fillRect(w / 2 - 0.05, -t / 2, 0.05, t);
  ctx.strokeRect(-w / 2, -t / 2, 0.05, t);
  ctx.strokeRect(w / 2 - 0.05, -t / 2, 0.05, t);
  const drawLeaf = (hingeX: number, dir: 1 | -1, lw: number) => {
    ctx.beginPath();
    ctx.moveTo(hingeX, 0);
    ctx.lineTo(hingeX, side * lw);
    ctx.lineWidth = 0.04;
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth = 0.012;
    const a0 = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const a1 = dir > 0 ? 0 : Math.PI;
    ctx.arc(hingeX, 0, lw, a0, a1, (side > 0) === (dir > 0));
    ctx.stroke();
  };
  if (leaves === 1) {
    const hingeLeft = !o.flipH;
    drawLeaf(hingeLeft ? -w / 2 + 0.05 : w / 2 - 0.05, hingeLeft ? 1 : -1, w - 0.1);
  } else {
    drawLeaf(-w / 2 + 0.05, 1, w / 2 - 0.05);
    drawLeaf(w / 2 - 0.05, -1, w / 2 - 0.05);
  }
  ctx.restore();
}

function drawWindow2d(ctx: CanvasRenderingContext2D, o: Opening, t: number): void {
  const w = o.width;
  ctx.save();
  ctx.fillStyle = '#eaf4f8';
  ctx.strokeStyle = '#3a3f47';
  ctx.lineWidth = 0.015;
  ctx.fillRect(-w / 2, -t / 2, w, t);
  ctx.strokeRect(-w / 2, -t / 2, w, t);
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(w / 2, 0);
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = '#5b9db5';
  ctx.stroke();
  ctx.restore();
}

function windowBuilder(cols: number, rows: number, frame: THREE.Material = mats.white) {
  return (o: Opening, t: number): THREE.Object3D => {
    const g = new THREE.Group();
    casing(g, o, t, frame);
    const iw = o.width - 0.12;
    const ih = o.height - 0.12;
    const pw = iw / cols;
    const ph = ih / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        glassPane(g, pw, ph, -iw / 2 + pw * (c + 0.5), o.sill + 0.06 + ph * (r + 0.5), frame);
      }
    }
    return g;
  };
}

export const OPENINGS: OpeningDef[] = [
  {
    id: 'door-interior',
    name: 'דלת פנים',
    type: 'door',
    width: 0.9,
    height: 2.1,
    sill: 0,
    passable: true,
    build: swingDoor(mats.white),
    draw2d: (ctx, o, t) => drawSwing2d(ctx, o, t, 1),
  },
  {
    id: 'door-wood',
    name: 'דלת עץ',
    type: 'door',
    width: 0.9,
    height: 2.1,
    sill: 0,
    passable: true,
    build: swingDoor(mats.oak, { casingMat: mats.oak }),
    draw2d: (ctx, o, t) => drawSwing2d(ctx, o, t, 1),
  },
  {
    id: 'door-entrance',
    name: 'דלת כניסה',
    type: 'door',
    width: 1.0,
    height: 2.15,
    sill: 0,
    passable: true,
    build: swingDoor(mats.entrance, { thick: 0.06, glassPanel: true, casingMat: mats.dark }),
    draw2d: (ctx, o, t) => drawSwing2d(ctx, o, t, 1),
  },
  {
    id: 'door-double',
    name: 'דלת כפולה',
    type: 'door',
    width: 1.6,
    height: 2.1,
    sill: 0,
    passable: true,
    build: (o, t) => {
      const g = new THREE.Group();
      casing(g, o, t, mats.white);
      const inner = o.width - 0.12;
      g.userData.anim = [
        swingLeaf(g, o, inner / 2 - 0.003, -inner / 2, 1, mats.white),
        swingLeaf(g, o, inner / 2 - 0.003, inner / 2, -1, mats.white),
      ];
      return g;
    },
    draw2d: (ctx, o, t) => drawSwing2d(ctx, o, t, 2),
  },
  {
    id: 'door-sliding-glass',
    name: 'דלת הזזה מזכוכית',
    type: 'door',
    width: 2.4,
    height: 2.2,
    sill: 0,
    passable: true,
    build: (o, t) => {
      const g = new THREE.Group();
      casing(g, o, t, mats.dark, 0.05);
      const iw = o.width - 0.1;
      const ih = o.height - 0.06;
      const fixed = new THREE.Group();
      glassPane(fixed, iw / 2 + 0.03, ih, 0, ih / 2 + 0.005, mats.dark, 0.04);
      fixed.position.set(iw / 4, 0, -0.03);
      g.add(fixed);
      const slide = new THREE.Group();
      glassPane(slide, iw / 2 + 0.03, ih, 0, ih / 2 + 0.005, mats.dark, 0.04);
      slide.position.set(-iw / 4, 0, 0.03);
      slide.userData.baseX = -iw / 4;
      slide.add(box(0.02, 0.3, 0.03, mats.metal, iw / 4 - 0.02, 1.05, 0.04));
      g.add(slide);
      g.userData.anim = [{ kind: 'slide', leaf: slide, dx: iw / 2 - 0.06 } satisfies OpeningAnim];
      return g;
    },
    draw2d: (ctx, o, t) => {
      const w = o.width;
      ctx.save();
      ctx.fillStyle = '#eaf4f8';
      ctx.fillRect(-w / 2, -t / 2, w, t);
      ctx.strokeStyle = '#3a3f47';
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0.035);
      ctx.lineTo(0.05, 0.035);
      ctx.moveTo(-0.05, -0.035);
      ctx.lineTo(w / 2, -0.035);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'opening-passage',
    name: 'פתח מעבר',
    type: 'door',
    width: 1.2,
    height: 2.2,
    sill: 0,
    passable: true,
    build: (o, t) => {
      const g = new THREE.Group();
      casing(g, o, t, mats.white, 0.04);
      return g;
    },
    draw2d: (ctx, o, t) => {
      const w = o.width;
      ctx.save();
      ctx.strokeStyle = '#8a9099';
      ctx.lineWidth = 0.015;
      ctx.setLineDash([0.08, 0.06]);
      ctx.strokeRect(-w / 2, -t / 2, w, t);
      ctx.restore();
    },
  },
  {
    id: 'window-standard',
    name: 'חלון',
    type: 'window',
    width: 1.2,
    height: 1.2,
    sill: 0.95,
    passable: false,
    build: windowBuilder(2, 1),
    draw2d: drawWindow2d,
  },
  {
    id: 'window-wide',
    name: 'חלון רחב',
    type: 'window',
    width: 2.0,
    height: 1.3,
    sill: 0.9,
    passable: false,
    build: windowBuilder(3, 1),
    draw2d: drawWindow2d,
  },
  {
    id: 'window-small',
    name: 'חלון קטן',
    type: 'window',
    width: 0.6,
    height: 0.6,
    sill: 1.5,
    passable: false,
    build: windowBuilder(1, 1),
    draw2d: drawWindow2d,
  },
  {
    id: 'window-tall',
    name: 'חלון גבוה',
    type: 'window',
    width: 0.9,
    height: 2.0,
    sill: 0.25,
    passable: false,
    build: windowBuilder(1, 2),
    draw2d: drawWindow2d,
  },
  {
    id: 'window-panorama',
    name: 'חלון פנורמי',
    type: 'window',
    width: 2.8,
    height: 2.0,
    sill: 0.3,
    passable: false,
    build: windowBuilder(3, 1, mats.dark),
    draw2d: drawWindow2d,
  },
  {
    id: 'window-grid',
    name: 'חלון משבצות',
    type: 'window',
    width: 1.4,
    height: 1.4,
    sill: 0.9,
    passable: false,
    build: windowBuilder(3, 3, mats.dark),
    draw2d: drawWindow2d,
  },
];

const byId = new Map(OPENINGS.map((d) => [d.id, d]));
export function getOpeningDef(style: string, type?: OpeningType): OpeningDef {
  return byId.get(style) ?? (type === 'window' ? byId.get('window-standard')! : byId.get('door-interior')!);
}
