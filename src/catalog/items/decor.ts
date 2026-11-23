import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, extrudeZ, leafGeo, lighten, mix, rng, smoothProfile, sym, tint, type V3 } from '../kit';
import { pot, slot } from './_parts';

/* ------------------------------------------------------------------ plants */

const plantLarge: FurnitureDef = {
  id: 'plant-large',
  name: 'עציץ גדול (פיקוס)',
  category: 'decor',
  size: { w: 0.86, d: 0.86, h: 1.76 },
  colors: [slot('pot', 'עציץ', PAL.white), slot('leaves', 'עלים', '#3f6f3a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(41);
    const soilY = pot(k, 0.21, 0.16, 0.38, M.ceramic(c.pot));
    const bark = M.bark('#6b5443');
    // gently curving trunk with two side branches
    const trunk: V3[] = [
      [0, soilY - 0.02, 0],
      [0.02, 0.6, 0.015],
      [-0.025, 0.95, -0.01],
      [0.01, 1.3, 0.02],
      [0, 1.5, 0],
    ];
    k.tube(trunk, 0.02, bark, { seg: 16, radial: 6 });
    const branches: V3[][] = [
      [
        [0.01, 0.8, 0.01],
        [0.11, 0.98, 0.05],
        [0.17, 1.2, 0.08],
      ],
      [
        [-0.02, 0.95, -0.01],
        [-0.12, 1.1, -0.07],
        [-0.16, 1.32, -0.1],
      ],
    ];
    for (const b of branches) k.tube(b, 0.011, bark, { seg: 8, radial: 5 });
    const mats = [M.leaf(c.leaves), M.leaf(lighten(c.leaves, 0.12)), M.leaf(darken(c.leaves, 0.15))];
    const at = (pts: V3[], t: number): THREE.Vector3 => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      return curve.getPoint(t);
    };
    const addLeaf = (p: THREE.Vector3, yaw: number, pitch: number, len: number) => {
      const g = leafGeo(len * 1.3, len * 0.8, { fold: 0.2, droop: 0.24, seg: 5, tipBias: 0.5 });
      const m = k.geo(g, mats[Math.floor(r() * mats.length)]);
      m.rotation.order = 'YXZ';
      m.rotation.set(-pitch, yaw, (r() - 0.5) * 0.3);
      // short petiole offset so the leaf starts just off the stem
      m.position.set(p.x + Math.sin(yaw) * 0.015, p.y, p.z + Math.cos(yaw) * 0.015);
    };
    const golden = 2.39996;
    // leaves along the upper trunk
    for (let i = 0; i < 26; i++) {
      const t = 0.3 + (i / 25) * 0.7;
      const p = at(trunk, t);
      addLeaf(p, i * golden, 0.25 + t * 0.55 + r() * 0.15, 0.3 - t * 0.06 + r() * 0.05);
    }
    // crown tuft
    for (let i = 0; i < 4; i++) addLeaf(new THREE.Vector3(0, 1.5, 0), i * 1.6 + 0.4, 1.0 + r() * 0.25, 0.22);
    // leaves on the branches
    branches.forEach((b, bi) => {
      for (let i = 0; i < 6; i++) {
        const t = 0.35 + (i / 5) * 0.65;
        addLeaf(at(b, t), i * golden + bi * 1.3, 0.35 + t * 0.5 + r() * 0.15, 0.27 - t * 0.05);
      }
    });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const r = rng(4);
      const fill = tint(c.leaves, 0.45);
      for (let i = 0; i < 11; i++) {
        const a = i * 2.39996;
        const d = 0.11 + (i / 11) * 0.18;
        D.ellipse(ctx, Math.cos(a) * d, Math.sin(a) * d, 0.15 - i * 0.004, 0.085, fill, undefined, LINE_THIN, a + (r() - 0.5) * 0.4);
        D.line(ctx, Math.cos(a) * (d - 0.12), Math.sin(a) * (d - 0.12), Math.cos(a) * (d + 0.12), Math.sin(a) * (d + 0.12), tint(c.leaves, 0.1), 0.006);
      }
      D.circle(ctx, 0, 0, 0.2, null, INK_SOFT, LINE_THIN);
    }),
};

const plantSmall: FurnitureDef = {
  id: 'plant-small',
  name: 'עציץ קטן',
  category: 'decor',
  size: { w: 0.32, d: 0.32, h: 0.37 },
  colors: [slot('pot', 'עציץ', PAL.terracotta), slot('leaves', 'עלים', '#5e8f4a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(9);
    const soilY = pot(k, 0.085, 0.062, 0.13, M.clay(c.pot));
    k.cyl(0.09, 0.012, M.clay(darken(c.pot, 0.08)), 0, 0, 0, 0.075, 20);
    const stem = M.foliage(mix(c.leaves, '#b6c98a', 0.4));
    const mats = [M.leaf(c.leaves), M.leaf(lighten(c.leaves, 0.14))];
    // pilea: round coin leaves on thin arching stems
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996;
      const t = i / 15;
      const reach = 0.05 + t * 0.085;
      const h = soilY + 0.22 - t * 0.14 + r() * 0.02;
      const x = Math.cos(a) * reach;
      const z = Math.sin(a) * reach;
      k.tube(
        [
          [x * 0.15, soilY - 0.005, z * 0.15],
          [x * 0.55, soilY + (h - soilY) * 0.75, z * 0.55],
          [x, h, z],
        ],
        0.003,
        stem,
        { seg: 5, radial: 4 },
      );
      const g = new THREE.CircleGeometry(0.036 + (1 - t) * 0.012 + r() * 0.006, 10);
      g.rotateX(-Math.PI / 2);
      const leaf = k.geo(g, mats[i % 2], x, h + 0.002, z);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.set(0.25 + t * 0.6, -a + Math.PI / 2, 0);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const fill = tint(c.leaves, 0.45);
      D.circle(ctx, 0, 0, 0.09, tint(c.pot, 0.4), undefined, LINE_THIN);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39996;
        const d = 0.045 + (i / 9) * 0.075;
        D.circle(ctx, Math.cos(a) * d, Math.sin(a) * d, 0.045, fill, undefined, 0.007);
      }
    }),
};

const plantSnake: FurnitureDef = {
  id: 'plant-snake',
  name: 'עציץ לשון החותנת',
  category: 'decor',
  size: { w: 0.32, d: 0.32, h: 1.0 },
  colors: [slot('pot', 'עציץ', PAL.charcoal), slot('leaves', 'עלים', '#4c7a45')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(17);
    // tall cylinder planter on a small wooden stand
    const wood = M.wood(PAL.oak);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.rod([Math.cos(a) * 0.14, 0.002, Math.sin(a) * 0.14], [Math.cos(a) * 0.115, 0.2, Math.sin(a) * 0.115], 0.011, wood, 0.014);
    }
    const soilY = pot(k, 0.145, 0.135, 0.3, M.stone(c.pot, 0.6), 0, 0.12, 0);
    k.ring(0.128, 0.008, wood, 0, 0.17, 0, 24);
    const mats = [M.leaf(c.leaves), M.leaf(darken(c.leaves, 0.18)), M.leaf(mix(c.leaves, '#c9cf7a', 0.35))];
    for (let i = 0; i < 13; i++) {
      const a = i * 2.39996;
      const t = i / 12;
      const len = 0.58 - t * 0.26 + r() * 0.04;
      const g = leafGeo(len, 0.07, { fold: 0.3, droop: 0.02, seg: 5, tipBias: 0.35 });
      const m = k.geo(g, mats[i % 3]);
      m.rotation.order = 'YXZ';
      m.rotation.set(-(Math.PI / 2 - 0.08 - t * 0.3), a, (r() - 0.5) * 0.5);
      m.position.set(Math.cos(a) * t * 0.05, soilY - 0.01, Math.sin(a) * t * 0.05);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.circle(ctx, 0, 0, 0.15, tint(c.pot, 0.6));
      const fill = tint(c.leaves, 0.4);
      for (let i = 0; i < 8; i++) {
        const a = i * 2.39996;
        D.ellipse(ctx, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.095, 0.026, fill, undefined, 0.007, a);
      }
    }),
};

/* ------------------------------------------------------------------ wall art */

const artCache = new Map<string, THREE.Material>();

/** A calm abstract landscape print generated on a canvas (falls back to a flat color without DOM). */
function artMaterial(accent: string): THREE.Material {
  let m = artCache.get(accent);
  if (m) return m;
  let map: THREE.Texture | null = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = 320;
    cv.height = 224;
    const x = cv.getContext('2d');
    if (x) {
      x.fillStyle = '#efe7d8';
      x.fillRect(0, 0, 320, 224);
      // sun
      x.fillStyle = accent;
      x.beginPath();
      x.arc(214, 82, 40, 0, Math.PI * 2);
      x.fill();
      // layered hills
      const hills: Array<[string, number, number, number]> = [
        [lighten(PAL.dustyBlue, 0.25), 120, 26, 0.012],
        [PAL.sage, 142, 22, 0.017],
        [mix(PAL.sage, PAL.navy, 0.45), 168, 18, 0.023],
        [PAL.navy, 196, 12, 0.03],
      ];
      hills.forEach(([col, base, amp, f], i) => {
        x.fillStyle = col;
        x.beginPath();
        x.moveTo(0, 224);
        for (let px = 0; px <= 320; px += 4) {
          x.lineTo(px, base + Math.sin(px * f + i * 1.7) * amp + Math.sin(px * f * 2.3 + i) * amp * 0.35);
        }
        x.lineTo(320, 224);
        x.closePath();
        x.fill();
      });
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
    }
  }
  m = new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : mix(accent, '#efe7d8', 0.5), map, roughness: 0.85 });
  artCache.set(accent, m);
  return m;
}

const painting: FurnitureDef = {
  id: 'wall-painting',
  name: 'תמונה לקיר',
  category: 'decor',
  size: { w: 0.9, d: 0.035, h: 0.65 },
  mount: 'wall',
  elevation: 1.3,
  colors: [slot('frame', 'מסגרת', PAL.oak), slot('accent', 'צבע בציור', PAL.terracotta)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const w = 0.9;
    const h = 0.65;
    const d = 0.035;
    const fw = 0.025;
    const wood = M.wood(c.frame);
    // frame: four bars
    k.box(w, fw, d, wood, 0, 0, 0);
    k.box(w, fw, d, wood, 0, h - fw, 0);
    for (const s of [-1, 1]) k.box(fw, h - 2 * fw, d, wood, s * (w / 2 - fw / 2), fw, 0);
    // white mat + print
    k.box(w - 2 * fw, h - 2 * fw, 0.004, M.matte('#f6f3ec'), 0, fw, d / 2 - 0.012);
    const pw = w - 2 * fw - 0.14;
    const ph = h - 2 * fw - 0.12;
    const art = new THREE.PlaneGeometry(pw, ph);
    k.geo(art, artMaterial(c.accent), 0, h / 2, d / 2 - 0.0095).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.9, 0.035, 0.004, tint(c.frame, 0.2), undefined, 0.008);
    }),
};

const MIRROR = { w: 0.6, h: 1.4, d: 0.03 };

const wallMirror: FurnitureDef = {
  id: 'wall-mirror',
  name: 'מראה לקיר',
  category: 'decor',
  size: { w: MIRROR.w, d: MIRROR.d, h: MIRROR.h },
  mount: 'wall',
  elevation: 0.45,
  colors: [slot('frame', 'מסגרת', PAL.brass)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, h, d } = MIRROR;
    const arch = (ww: number, hh: number, y0: number): THREE.Shape => {
      const s = new THREE.Shape();
      const r = ww / 2;
      s.moveTo(-r, y0);
      s.lineTo(r, y0);
      s.lineTo(r, y0 + hh - r);
      s.absarc(0, y0 + hh - r, r, 0, Math.PI, false);
      s.lineTo(-r, y0);
      return s;
    };
    const frame = arch(w, h, 0);
    const t = 0.014;
    const hole = arch(w - 2 * t, h - 2 * t, t);
    frame.holes.push(new THREE.Path(hole.getPoints(24).reverse()));
    k.geo(extrudeZ(frame, d, 0, 24), M.metal(c.frame, 0.3, 1));
    k.geo(extrudeZ(arch(w - 2 * t, h - 2 * t, t), 0.006, 0, 24), M.mirror(), 0, 0, d / 2 - 0.012);
    k.geo(extrudeZ(arch(w - 2 * t, h - 2 * t, t), 0.004, 0, 12), M.matte('#6b5b4a'), 0, 0, -d / 2 + 0.002);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, MIRROR.w, MIRROR.d, 0.004, '#cfe3ee', tint(c.frame, 0), 0.01);
    }),
};

const wallClock: FurnitureDef = {
  id: 'wall-clock',
  name: 'שעון קיר',
  category: 'decor',
  size: { w: 0.34, d: 0.045, h: 0.34 },
  mount: 'wall',
  elevation: 1.75,
  colors: [slot('rim', 'מסגרת', PAL.oak), slot('face', 'לוח', PAL.white)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = 0.17;
    const d = 0.03;
    const rim = new THREE.CylinderGeometry(r, r, d, 40, 1, false);
    rim.rotateX(Math.PI / 2);
    k.geo(rim, M.wood(c.rim), 0, r, 0);
    const face = new THREE.CircleGeometry(r - 0.018, 40);
    k.geo(face, M.paint(c.face, 0.6), 0, r, d / 2 + 0.0008).castShadow = false;
    const ink = M.matte('#2b2c2f');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const big = i % 3 === 0;
      const m = k.box(big ? 0.007 : 0.004, big ? 0.026 : 0.014, 0.002, ink, 0, 0, 0);
      m.rotation.z = -a;
      const rr = r - 0.04;
      m.position.set(Math.sin(a) * rr, r + Math.cos(a) * rr, d / 2 + 0.002);
    }
    // hands at ten past ten
    const hand = (len: number, wd: number, ang: number, z: number, mat: THREE.Material) => {
      const m = k.box(wd, len, 0.002, mat, 0, 0, 0);
      m.rotation.z = -ang;
      m.position.set(Math.sin(ang) * (len / 2 - 0.012), r + Math.cos(ang) * (len / 2 - 0.012), d / 2 + z);
    };
    hand(0.085, 0.009, -Math.PI / 3 + 0.09, 0.004, ink);
    hand(0.125, 0.006, Math.PI / 3, 0.0065, ink);
    hand(0.13, 0.002, Math.PI * 1.08, 0.009, M.matte(PAL.terracotta));
    const cap = k.cyl(0.008, 0.012, M.brass(), 0, 0, 0, 0.008, 12);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, r, d / 2 + 0.006);
    // the clock body is 3 cm deep; push it back so its rear face is flush with the wall plane
    k.g.children.forEach((o) => (o.position.z += -0.045 / 2 + d / 2));
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, 0.34, 0.045, 0.01, tint(c.rim, 0.2), undefined, 0.008);
    }),
};

/* ------------------------------------------------------------------ vase */

const floorVase: FurnitureDef = {
  id: 'floor-vase',
  name: 'אגרטל רצפתי',
  category: 'decor',
  size: { w: 0.44, d: 0.44, h: 1.34 },
  colors: [slot('vase', 'אגרטל', PAL.terracotta), slot('plumes', 'ענפים', '#e2d3b5')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(23);
    k.lathe(
      smoothProfile(
        [
          [0, 0],
          [0.085, 0],
          [0.105, 0.03],
          [0.14, 0.18],
          [0.13, 0.36],
          [0.075, 0.5],
          [0.052, 0.58],
          [0.062, 0.62],
          [0.05, 0.62],
          [0.04, 0.57],
          [0, 0.5],
        ],
        36,
      ),
      M.clay(c.vase),
      0,
      0,
      0,
      28,
    );
    // dried pampas stems with soft plumes
    const stem = M.matte('#b79f74');
    const plume = M.fabric(c.plumes, 20);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39996 + 0.5;
      const lean = 0.07 + r() * 0.11;
      const top = 1.0 + r() * 0.18;
      const ex = Math.cos(a) * lean;
      const ez = Math.sin(a) * lean;
      const pts: V3[] = [
        [ex * 0.1, 0.45, ez * 0.1],
        [ex * 0.5, 0.8, ez * 0.5],
        [ex, top, ez],
      ];
      k.tube(pts, 0.004, stem, { seg: 6, radial: 4 });
      const p = k.sphere(0.05, plume, ex * 1.18, top + 0.03, ez * 1.18, 0.62, 2.6, 0.62, 8);
      p.rotation.set(Math.sin(a) * lean * 1.6, 0, -Math.cos(a) * lean * 1.6);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (let i = 0; i < 7; i++) {
        const a = i * 2.39996 + 0.5;
        D.ellipse(ctx, Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.08, 0.035, tint(c.plumes, 0.3), INK_SOFT, 0.007, a);
      }
      D.circle(ctx, 0, 0, 0.14, tint(c.vase, 0.4));
      D.circle(ctx, 0, 0, 0.055, null, INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ curtain */

const CURTAIN = { w: 1.8, d: 0.14, h: 2.5, panel: 0.56 };

function pleated(width: number, height: number, pleats: number, amp: number, flip: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height, pleats * 6, 4);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / width + 0.5;
    const v = p.getY(i) / height + 0.5;
    // pleats are crisp at the heading and relax (and flare slightly) towards the hem
    const a = amp * (0.75 + 0.45 * (1 - v));
    const z = Math.sin(u * pleats * Math.PI * 2) * a;
    const flare = 1 + (1 - v) * 0.06;
    p.setXYZ(i, p.getX(i) * flare + flip * (1 - v) * 0.02, p.getY(i) + height / 2, z);
  }
  g.computeVertexNormals();
  return g;
}

const curtain: FurnitureDef = {
  id: 'curtain',
  name: 'וילון',
  category: 'decor',
  size: { w: CURTAIN.w, d: CURTAIN.d, h: CURTAIN.h },
  mount: 'wall',
  elevation: 0.02,
  colors: [slot('fabric', 'בד', PAL.linen), slot('rod', 'מוט', PAL.black)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h, panel } = CURTAIN;
    const metal = M.metal(c.rod, 0.4, 0.8);
    const rodY = h - 0.03;
    const rodZ = 0.012;
    k.rod([-w / 2 + 0.03, rodY, rodZ], [w / 2 - 0.03, rodY, rodZ], 0.011, metal);
    for (const s of [-1, 1]) {
      k.sphere(0.022, metal, s * (w / 2 - 0.024), rodY, rodZ, 1, 1, 1, 12);
      k.rod([s * (w / 2 - 0.16), rodY, -d / 2], [s * (w / 2 - 0.16), rodY, rodZ], 0.007, metal);
      const plate = k.cyl(0.02, 0.006, metal, 0, 0, 0, 0.02, 12);
      plate.rotation.x = Math.PI / 2;
      plate.position.set(s * (w / 2 - 0.16), rodY, -d / 2 + 0.003);
    }
    const cloth = M.cloth(c.fabric);
    for (const s of [-1, 1]) {
      const g = pleated(panel, rodY - 0.012, 6, 0.024, s);
      k.geo(g, cloth, s * (w / 2 - 0.07 - panel / 2), 0, rodZ + 0.004);
      // rings
      for (let i = 0; i < 6; i++) {
        const x = s * (w / 2 - 0.09 - (i / 5) * (panel - 0.05));
        const ring = k.ring(0.016, 0.003, metal, x, rodY, rodZ, 10);
        ring.rotation.set(0, Math.PI / 2, 0);
      }
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, panel } = CURTAIN;
      D.line(ctx, -w / 2 + 0.03, 0.012, w / 2 - 0.03, 0.012, INK_SOFT, 0.012);
      ctx.strokeStyle = darken(tint(c.fabric, 0.1), 0.25);
      ctx.lineWidth = 0.022;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        const x0 = s * (w / 2 - 0.07);
        for (let i = 0; i <= 40; i++) {
          const u = i / 40;
          const x = x0 - s * u * panel;
          const y = 0.016 + Math.sin(u * 6 * Math.PI * 2) * 0.03;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }),
};

export const DECOR: FurnitureDef[] = [plantLarge, plantSmall, plantSnake, painting, wallMirror, wallClock, floorVase, curtain];
