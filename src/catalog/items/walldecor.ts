import * as THREE from 'three';
import type { FurnitureDef } from '../types';
import { D, INK_SOFT, Kit, LINE_THIN, M, PAL, darken, extrudeZ, lighten, mesh, mix, rng, roundedRectShape, sym, tint, type ArtStyle, type V3 } from '../kit';
import { slot } from './_parts';

/* ------------------------------------------------------------------ shared helpers */

/** Shift a built group vertically so its lowest point rests at y = 0. */
function settle(g: THREE.Group): THREE.Group {
  const box = new THREE.Box3().setFromObject(g, true);
  for (const ch of g.children) ch.position.y -= box.min.y;
  return g;
}

/** Elevation so the item's centre sits at `center` meters (eye level for art). */
const elev = (h: number, center = 1.5): number => Math.round((center - h / 2) * 100) / 100;

/** Vertical plane facing +Z, w × h, centred on x, bottom at y = 0; UVs in meters centred on the plane, offset by `u0`. */
function artGeo(w: number, h: number, u0 = 0, segX = 1, segY = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, segX, segY);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + u0, p.getY(i));
  g.translate(0, h / 2, 0);
  return g;
}

/** Rectangular ring (frame / passe-partout) in the XY plane, bottom at y = 0, extruded along Z (centred). */
function rectRing(w: number, h: number, bw: number, depth: number, bevel = 0, bh = bw): THREE.BufferGeometry {
  const b = Math.min(bevel, 0.004);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + b, b);
  s.lineTo(w / 2 - b, b);
  s.lineTo(w / 2 - b, h - b);
  s.lineTo(-w / 2 + b, h - b);
  s.lineTo(-w / 2 + b, b);
  const hole = new THREE.Path();
  hole.moveTo(-w / 2 + bw - b, bh - b);
  hole.lineTo(-w / 2 + bw - b, h - bh + b);
  hole.lineTo(w / 2 - bw + b, h - bh + b);
  hole.lineTo(w / 2 - bw + b, bh - b);
  hole.lineTo(-w / 2 + bw - b, bh - b);
  s.holes.push(hole);
  return extrudeZ(s, depth, b, 1);
}

export type FrameKind = 'wood' | 'black' | 'white' | 'gold' | 'ornate' | 'float' | 'canvas' | 'metal';

interface PicOpts {
  w: number;
  h: number;
  frame: FrameKind;
  frameColor: string;
  /** frame face width */
  fw?: number;
  /** total depth (back flush at zBack) */
  depth?: number;
  /** passe-partout margin (0 = none) */
  mat?: number;
  matColor?: string;
  glass?: boolean;
  art: (aw: number, ah: number) => THREE.Material;
  x?: number;
  y?: number;
  zBack: number;
}

function frameMat(kind: FrameKind, color: string): THREE.Material {
  switch (kind) {
    case 'wood':
    case 'float':
      return M.wood(color, 0.5);
    case 'gold':
    case 'ornate':
    case 'metal':
      return M.metal(color, kind === 'metal' ? 0.28 : 0.34, 1);
    default:
      return M.paint(color, 0.55);
  }
}

/** A framed (or gallery-wrapped) picture whose back is flush at `zBack`, bottom at `y`. */
function picture(k: Kit, o: PicOpts): void {
  const x = o.x ?? 0;
  const y = o.y ?? 0;
  const { w, h } = o;
  const fm = frameMat(o.frame, o.frameColor);
  if (o.frame === 'canvas') {
    const dp = o.depth ?? 0.032;
    const art = o.art(w, h);
    k.box(w, h, dp - 0.001, M.matte('#ece6da'), x, y, o.zBack + dp / 2 - 0.0005);
    k.geo(artGeo(w, h), art, x, y, o.zBack + dp + 0.0004).castShadow = false;
    // wrapped edges: thin strips of the picture's colours
    const edge = M.cloth(darken('#ffffff', 0.05));
    k.box(w + 0.0006, 0.0006, dp - 0.004, edge, x, y + h - 0.0003, o.zBack + dp / 2);
    return;
  }
  const fw = o.fw ?? 0.03;
  const depth = o.depth ?? 0.03;
  const zc = o.zBack + depth / 2;
  if (o.frame === 'float') {
    // floater frame: thin L-profile around a canvas with a shadow gap
    const gap = 0.008;
    k.geo(rectRing(w, h, fw, depth, 0.0015), fm, x, y, zc);
    k.geo(rectRing(w - 2 * fw + 0.002, h - 2 * fw + 0.002, 0.012, 0.004), M.matte('#1d1d1f'), x, y + fw - 0.001, o.zBack + 0.004);
    const cw = w - 2 * fw - 2 * gap;
    const ch = h - 2 * fw - 2 * gap;
    const cd = depth - 0.008;
    k.box(cw, ch, cd, M.matte('#ece6da'), x, y + fw + gap, o.zBack + 0.004 + cd / 2);
    k.geo(artGeo(cw, ch), o.art(cw, ch), x, y + fw + gap, o.zBack + 0.004 + cd + 0.0004).castShadow = false;
    return;
  }
  if (o.frame === 'ornate') {
    // stepped, gilded moulding: outer cove, raised bead, inner sight edge
    k.geo(rectRing(w, h, fw, depth * 0.62, 0.003), fm, x, y, o.zBack + depth * 0.31);
    k.geo(rectRing(w - fw * 0.5, h - fw * 0.5, fw * 0.42, depth * 0.9, 0.004), M.metal(lighten(o.frameColor, 0.12), 0.26, 1), x, y + fw * 0.25, o.zBack + depth * 0.45);
    k.geo(rectRing(w - fw * 1.5, h - fw * 1.5, fw * 0.18, depth, 0.002), M.metal(darken(o.frameColor, 0.2), 0.4, 1), x, y + fw * 0.75, zc);
    // carved corner ornaments
    for (const sx of [-1, 1]) for (const sy of [0, 1]) {
      const m = k.sphere(fw * 0.32, M.metal(lighten(o.frameColor, 0.08), 0.3, 1), x + sx * (w / 2 - fw * 0.5), y + (sy ? h - fw * 0.5 : fw * 0.5), o.zBack + depth * 0.82, 1, 1, 0.45, 10);
      m.castShadow = false;
    }
  } else {
    k.geo(rectRing(w, h, fw, depth, 0.0015), fm, x, y, zc);
  }
  const iw = w - 2 * fw + 0.004;
  const ih = h - 2 * fw + 0.004;
  const iy = y + fw - 0.002;
  const zf = o.zBack + depth - 0.006; // front of the picture package (behind the frame lip)
  k.box(iw, ih, 0.003, M.matte('#d9d2c4'), x, iy, o.zBack + 0.004);
  const mat = o.mat ?? 0;
  if (mat > 0) {
    const mc = M.matte(o.matColor ?? '#f6f3ec');
    k.geo(rectRing(iw, ih, mat, 0.003, 0.0008), mc, x, iy, zf - 0.0015);
    // bevel cut of the window (white core)
    k.geo(rectRing(iw - 2 * mat + 0.006, ih - 2 * mat + 0.006, 0.003, 0.003), M.matte('#ffffff'), x, iy + mat - 0.003, zf - 0.0025);
    const aw = iw - 2 * mat;
    const ah = ih - 2 * mat;
    k.geo(artGeo(aw, ah), o.art(aw, ah), x, iy + mat, zf - 0.0042).castShadow = false;
  } else {
    k.geo(artGeo(iw, ih), o.art(iw, ih), x, iy, zf - 0.001).castShadow = false;
  }
  if (o.glass) {
    const g = k.geo(artGeo(iw, ih), M.glass('#ffffff', 0.07), x, iy, zf + 0.0008);
    g.castShadow = false;
  }
}

/* ------------------------------------------------------------------ framed art */

interface ArtDef {
  id: string;
  name: string;
  tags: string[];
  w: number;
  h: number;
  style: ArtStyle;
  seed: number;
  /** background + 2..4 accent colours (accents become colour slots) */
  palette: string[];
  frame: FrameKind;
  frameColor: string;
  fw?: number;
  depth?: number;
  mat?: number;
  glass?: boolean;
}

const ACCENT_LABELS = ['צבע 1', 'צבע 2', 'צבע 3', 'צבע 4'];

function framedArt(a: ArtDef): FurnitureDef {
  const depth = a.depth ?? (a.frame === 'canvas' ? 0.035 : a.frame === 'ornate' ? 0.055 : 0.03);
  const accents = a.palette.slice(1);
  const hasFrame = a.frame !== 'canvas';
  return {
    id: a.id,
    name: a.name,
    category: 'decor',
    group: 'אמנות וקיר',
    tags: ['תמונה', 'ציור', 'אמנות', ...a.tags],
    size: { w: a.w, d: depth, h: a.h },
    mount: 'wall',
    elevation: elev(a.h),
    colors: [
      ...(hasFrame ? [slot('frame', 'מסגרת', a.frameColor)] : []),
      slot('bg', 'רקע', a.palette[0]),
      ...accents.map((c, i) => slot(`c${i + 1}`, ACCENT_LABELS[i], c)),
    ],
    build: ({ colors: c }) => {
      const k = new Kit();
      const pal = [c.bg, ...accents.map((_, i) => c[`c${i + 1}`])];
      picture(k, {
        w: a.w,
        h: a.h,
        frame: a.frame,
        frameColor: c.frame ?? a.frameColor,
        fw: a.fw,
        depth,
        mat: a.mat,
        glass: a.glass,
        art: (aw, ah) => M.art(a.style, a.seed, pal, aw, ah),
        zBack: -depth / 2,
      });
      return k.g;
    },
    draw2d: (ctx, c) =>
      sym(ctx, () => {
        D.rr(ctx, 0, 0, a.w, depth, 0.003, hasFrame ? tint(c.frame, 0.2) : tint(c.c1 ?? c.bg, 0.2), undefined, 0.008);
      }),
  };
}

const ART: ArtDef[] = [
  {
    id: 'art-abstract-large',
    name: 'ציור מופשט גדול במסגרת צפה',
    tags: ['מופשט', 'קנבס', 'גדול', 'מודרני', 'אלון'],
    w: 1.2,
    h: 0.9,
    style: 'abstract',
    seed: 3,
    palette: ['#efe6d6', '#c7775a', '#2f4858', '#d9a441', '#8a9a7b'],
    frame: 'float',
    frameColor: PAL.oak,
    fw: 0.014,
    depth: 0.045,
  },
  {
    id: 'art-geometric',
    name: 'הדפס גיאומטרי עם פספרטו',
    tags: ['גיאומטרי', 'הדפס', 'פספרטו', 'שחור', 'מודרני'],
    w: 0.6,
    h: 0.8,
    style: 'geometric',
    seed: 5,
    palette: ['#f1ebe0', '#d36f4e', '#264653', '#e9c46a', '#2a9d8f'],
    frame: 'black',
    frameColor: '#1f1f21',
    fw: 0.018,
    mat: 0.08,
    glass: true,
  },
  {
    id: 'art-landscape-panorama',
    name: 'נוף פנורמי',
    tags: ['נוף', 'פנורמי', 'גבעות', 'רחב', 'אלון'],
    w: 1.5,
    h: 0.55,
    style: 'landscape',
    seed: 8,
    palette: ['#b9d4e3', '#f0d9a7', '#f6e7c1', '#8fae7e', '#3e5b43'],
    frame: 'wood',
    frameColor: PAL.oak,
    fw: 0.028,
  },
  {
    id: 'art-lines-small',
    name: 'רישום קווי קטן',
    tags: ['קווים', 'רישום', 'מינימליסטי', 'קטן', 'פספרטו'],
    w: 0.4,
    h: 0.5,
    style: 'lines',
    seed: 11,
    palette: ['#f7f3ec', '#1f1f1f', '#d8a48f'],
    frame: 'black',
    frameColor: '#1c1c1e',
    fw: 0.014,
    mat: 0.06,
    glass: true,
  },
  {
    id: 'art-botanical',
    name: 'הדפס בוטני במסגרת זהב',
    tags: ['בוטני', 'עלים', 'צמחים', 'זהב', 'פספרטו', 'וינטג\''],
    w: 0.5,
    h: 0.7,
    style: 'botanical',
    seed: 2,
    palette: ['#f4efe4', '#4f6f4a', '#7d9a6c', '#a3b18a'],
    frame: 'gold',
    frameColor: '#c9a35a',
    fw: 0.016,
    mat: 0.07,
    glass: true,
  },
  {
    id: 'art-sea-canvas',
    name: 'קנבס ים',
    tags: ['ים', 'חוף', 'גלים', 'קנבס', 'ללא מסגרת', 'כחול'],
    w: 1.0,
    h: 0.7,
    style: 'sea',
    seed: 4,
    palette: ['#7fb3c8', '#1f5673', '#efe0c0'],
    frame: 'canvas',
    frameColor: '#ffffff',
  },
  {
    id: 'art-stripes',
    name: 'הדפס פסים צבעוני',
    tags: ['פסים', 'צבעוני', 'רטרו', 'לבן', 'גרפי'],
    w: 0.7,
    h: 0.9,
    style: 'stripes',
    seed: 6,
    palette: ['#e9dccb', '#c8553d', '#f2d0a4', '#588b8b', '#2e4057'],
    frame: 'white',
    frameColor: '#f4f2ee',
    fw: 0.025,
    mat: 0.05,
  },
  {
    id: 'art-city-night',
    name: 'עיר בלילה',
    tags: ['עיר', 'לילה', 'קו רקיע', 'אורבני', 'שחור', 'רחב'],
    w: 1.2,
    h: 0.6,
    style: 'city',
    seed: 9,
    palette: ['#0f1a2e', '#3a3f6b', '#2b2f45'],
    frame: 'black',
    frameColor: '#1d1d1f',
    fw: 0.022,
  },
  {
    id: 'art-circles',
    name: 'עיגולים מודרניים',
    tags: ['עיגולים', 'אמצע המאה', 'מודרני', 'ריבועי', 'עץ'],
    w: 0.7,
    h: 0.7,
    style: 'circles',
    seed: 12,
    palette: ['#efe8dc', '#e07a5f', '#3d405b', '#81b29a', '#f2cc8f'],
    frame: 'wood',
    frameColor: PAL.walnut,
    fw: 0.024,
    mat: 0.05,
  },
  {
    id: 'art-mountains',
    name: 'הרים בערפל',
    tags: ['הרים', 'נוף', 'ערפל', 'אנכי', 'גדול', 'פספרטו'],
    w: 0.8,
    h: 1.1,
    style: 'mountains',
    seed: 7,
    palette: ['#cfd9df', '#e2c5a0', '#f0e4d0', '#7d8fa3', '#2f3e4e'],
    frame: 'black',
    frameColor: '#202022',
    fw: 0.02,
    mat: 0.09,
    glass: true,
  },
  {
    id: 'art-sunset-canvas',
    name: 'שקיעה על קנבס',
    tags: ['שקיעה', 'שמש', 'קנבס', 'ללא מסגרת', 'חם', 'ריבועי'],
    w: 0.9,
    h: 0.9,
    style: 'sunset',
    seed: 10,
    palette: ['#f7c59f', '#f08a4b', '#ffd29d', '#a4567a', '#3d2c4e'],
    frame: 'canvas',
    frameColor: '#ffffff',
  },
  {
    id: 'art-portrait-classic',
    name: 'דיוקן קלאסי במסגרת מוזהבת',
    tags: ['דיוקן', 'קלאסי', 'זהב', 'מוזהב', 'עתיק', 'שמן'],
    w: 0.62,
    h: 0.78,
    style: 'portrait',
    seed: 1,
    palette: ['#3b3a36', '#d9b99b', '#5a2e2e', '#2b1d14'],
    frame: 'ornate',
    frameColor: '#bf9a4e',
    fw: 0.075,
  },
];

/* ------------------------------------------------------------------ triptych */

const TRIP = { pw: 0.45, ph: 0.8, gap: 0.05, d: 0.035 };
const TRIP_W = Math.round((TRIP.pw * 3 + TRIP.gap * 2) * 1000) / 1000;

const triptych: FurnitureDef = {
  id: 'art-triptych',
  name: 'טריפטיך שקיעה (3 קנבסים)',
  category: 'decor',
  group: 'אמנות וקיר',
  tags: ['טריפטיך', 'שלישייה', 'קנבס', 'שקיעה', 'הרים', 'סט', 'גדול'],
  size: { w: TRIP_W, d: TRIP.d, h: TRIP.ph },
  mount: 'wall',
  elevation: elev(TRIP.ph),
  colors: [slot('bg', 'רקע', '#f3c9a0'), slot('c1', 'צבע 1', '#e98a5a'), slot('c2', 'צבע 2', '#fbe3c0'), slot('c3', 'צבע 3', '#9a6a8a'), slot('c4', 'צבע 4', '#2e2a45')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { pw, ph, gap, d } = TRIP;
    const art = M.art('sunset', 21, [c.bg, c.c1, c.c2, c.c3, c.c4], TRIP_W, ph);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * (pw + gap);
      k.box(pw, ph, d - 0.001, M.matte('#ece6da'), x, 0, -d / 2 + (d - 0.001) / 2);
      k.geo(artGeo(pw, ph, x), art, x, 0, d / 2 + 0.0004).castShadow = false;
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (let i = 0; i < 3; i++) D.rr(ctx, (i - 1) * (TRIP.pw + TRIP.gap), 0, TRIP.pw, TRIP.d, 0.003, tint(c.c1, 0.3), undefined, 0.008);
    }),
};

/* ------------------------------------------------------------------ gallery wall (6 frames) */

interface GalleryFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  frame: FrameKind;
  color: string;
  style: ArtStyle;
  seed: number;
  pal: string[];
  mat?: number;
}

const GALLERY: GalleryFrame[] = [
  { x: -0.64, y: 0.1, w: 0.42, h: 0.6, frame: 'black', color: '#1f1f21', style: 'lines', seed: 31, pal: ['#f6f2ea', '#222222', '#d39a7c'], mat: 0.06 },
  { x: -0.12, y: 0.46, w: 0.5, h: 0.38, frame: 'wood', color: PAL.oak, style: 'landscape', seed: 32, pal: ['#c4d8e2', '#f2d8a8', '#f8ead0', '#9bb38a', '#46604a'] },
  { x: -0.12, y: 0.0, w: 0.5, h: 0.4, frame: 'black', color: '#1f1f21', style: 'geometric', seed: 33, pal: ['#efe8dc', '#c8553d', '#2e4057', '#e8c07d', '#6c8e7d'], mat: 0.04 },
  { x: 0.34, y: 0.54, w: 0.3, h: 0.3, frame: 'gold', color: '#c9a35a', style: 'circles', seed: 34, pal: ['#f3ede2', '#d98c6a', '#38405a', '#9cb59c'], mat: 0.04 },
  { x: 0.34, y: 0.06, w: 0.3, h: 0.42, frame: 'white', color: '#f2f0ea', style: 'botanical', seed: 35, pal: ['#f5f0e6', '#56724e', '#86a073'], mat: 0.04 },
  { x: 0.7, y: 0.28, w: 0.3, h: 0.4, frame: 'wood', color: PAL.walnut, style: 'sea', seed: 36, pal: ['#8bbccc', '#2a5d78', '#efdfc0'] },
];
const GAL = { w: 1.7, h: 0.84, d: 0.03 };

const galleryWall: FurnitureDef = {
  id: 'art-gallery-wall',
  name: 'קיר גלריה – 6 תמונות',
  category: 'decor',
  group: 'אמנות וקיר',
  tags: ['גלריה', 'סט', 'קולאז\'', 'תמונות', 'מסגרות', 'קיר תמונות'],
  size: { w: GAL.w, d: GAL.d, h: GAL.h },
  mount: 'wall',
  elevation: elev(GAL.h, 1.45),
  colors: [slot('accent', 'צבע מוביל', '#c8553d')],
  build: ({ colors: c }) => {
    const k = new Kit();
    GALLERY.forEach((f, i) => {
      const pal = i === 2 || i === 0 ? f.pal.map((p, j) => (j === (i === 0 ? 2 : 1) ? c.accent : p)) : f.pal;
      picture(k, { w: f.w, h: f.h, frame: f.frame, frameColor: f.color, fw: f.frame === 'gold' ? 0.014 : 0.018, depth: GAL.d, mat: f.mat, art: (aw, ah) => M.art(f.style, f.seed, pal, aw, ah), x: f.x, y: f.y, zBack: -GAL.d / 2 });
    });
    return k.g;
  },
  draw2d: (ctx) =>
    sym(ctx, () => {
      for (const f of GALLERY) D.rr(ctx, f.x, 0, f.w, GAL.d, 0.003, tint(f.color, 0.25), undefined, 0.006);
    }),
};

/* ------------------------------------------------------------------ world map print */

type LL = Array<[number, number]>;
const LAND: LL[] = [
  // North America
  [[-168, 66], [-156, 71], [-140, 70], [-125, 70], [-110, 73], [-95, 72], [-80, 73], [-62, 66], [-56, 52], [-66, 44], [-70, 41], [-76, 35], [-81, 30], [-80, 25], [-84, 30], [-90, 29], [-97, 26], [-97, 21], [-92, 18], [-87, 21], [-84, 15], [-83, 10], [-78, 8], [-80, 7], [-86, 12], [-92, 15], [-105, 20], [-110, 24], [-112, 30], [-115, 30], [-118, 34], [-124, 40], [-124, 48], [-131, 55], [-140, 60], [-152, 58], [-165, 60]],
  // Greenland
  [[-73, 78], [-60, 82], [-30, 83], [-20, 75], [-22, 70], [-42, 60], [-50, 64], [-56, 72]],
  // South America
  [[-80, 8], [-75, 11], [-62, 11], [-50, 2], [-35, -6], [-39, -15], [-48, -26], [-58, -38], [-65, -41], [-68, -52], [-74, -52], [-72, -40], [-71, -28], [-70, -18], [-76, -14], [-81, -5], [-80, 0]],
  // Eurasia
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [10, 58], [5, 62], [15, 69], [28, 71], [40, 67], [60, 69], [70, 73], [80, 73], [100, 77], [115, 74], [140, 72], [160, 70], [180, 68], [180, 65], [170, 60], [160, 55], [156, 51], [142, 53], [140, 46], [132, 43], [128, 38], [122, 40], [121, 31], [118, 24], [110, 20], [108, 15], [106, 10], [100, 13], [98, 8], [103, 1], [100, 6], [97, 17], [92, 21], [88, 22], [80, 15], [77, 8], [73, 18], [67, 25], [57, 25], [56, 27], [50, 30], [48, 29], [56, 24], [59, 22], [52, 16], [43, 12], [39, 21], [35, 28], [33, 31], [35, 36], [28, 37], [26, 40], [22, 37], [20, 40], [16, 38], [12, 44], [8, 44], [3, 43], [-1, 37], [-6, 36]],
  // Africa
  [[-17, 21], [-10, 30], [-6, 35], [10, 37], [11, 33], [20, 31], [32, 31], [34, 28], [39, 21], [43, 12], [51, 12], [41, -2], [40, -11], [35, -24], [32, -29], [25, -34], [19, -35], [14, -22], [12, -6], [9, 4], [-4, 5], [-8, 4], [-13, 8], [-17, 14]],
  // Australia
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [140, -38], [135, -34], [129, -32], [116, -35]],
  // islands
  [[-5, 50], [1, 51], [2, 53], [-3, 56], [-5, 58], [-6, 55], [-3, 54]],
  [[130, 31], [135, 34], [140, 36], [142, 40], [141, 45], [139, 42], [136, 36], [130, 33]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  [[172, -34], [178, -38], [174, -41], [171, -44], [167, -46], [172, -41]],
  [[109, 2], [117, 7], [119, 1], [116, -4], [110, -3]],
  [[95, 5], [98, 4], [106, -6], [102, -4]],
  [[131, -1], [141, -3], [150, -10], [141, -9], [134, -4]],
  [[-24, 65], [-14, 66], [-14, 64], [-22, 63]],
  [[-85, 22], [-74, 20], [-78, 22]],
  [[120, 18], [126, 7], [122, 7]],
];

const mapCache = new Map<string, THREE.Material>();

function worldMapMaterial(ocean: string, land: string): THREE.Material {
  const key = `${ocean}|${land}`;
  let m = mapCache.get(key);
  if (m) return m;
  let map: THREE.Texture | null = null;
  if (typeof document !== 'undefined') {
    const W = 1024;
    const H = 560;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const x = cv.getContext('2d');
    if (x) {
      const lon = (v: number) => ((v + 180) / 360) * W;
      const lat = (v: number) => ((80 - v) / 140) * H;
      const g = x.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.7);
      g.addColorStop(0, lighten(ocean, 0.12));
      g.addColorStop(1, darken(ocean, 0.08));
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      // graticule
      x.strokeStyle = darken(ocean, 0.18);
      x.lineWidth = 1;
      for (let l = -150; l <= 180; l += 30) {
        x.beginPath();
        x.moveTo(lon(l), 0);
        x.lineTo(lon(l), H);
        x.stroke();
      }
      for (let l = -60; l <= 60; l += 30) {
        x.beginPath();
        x.moveTo(0, lat(l));
        x.lineTo(W, lat(l));
        x.stroke();
      }
      x.setLineDash([6, 5]);
      x.strokeStyle = darken(ocean, 0.3);
      x.beginPath();
      x.moveTo(0, lat(0));
      x.lineTo(W, lat(0));
      x.stroke();
      x.setLineDash([]);
      // coast halo, land, coast line
      for (const pass of [0, 1, 2]) {
        for (const poly of LAND) {
          x.beginPath();
          poly.forEach(([lo, la], i) => (i ? x.lineTo(lon(lo), lat(la)) : x.moveTo(lon(lo), lat(la))));
          x.closePath();
          if (pass === 0) {
            x.strokeStyle = lighten(ocean, 0.35);
            x.lineWidth = 7;
            x.lineJoin = 'round';
            x.stroke();
          } else if (pass === 1) {
            x.fillStyle = land;
            x.fill();
          } else {
            x.strokeStyle = darken(land, 0.35);
            x.lineWidth = 1.4;
            x.stroke();
          }
        }
      }
      // relief speckle on land
      const r = rng(4);
      x.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 2500; i++) {
        x.fillStyle = r() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
        x.fillRect(r() * W, r() * H, 3, 3);
      }
      x.globalCompositeOperation = 'source-over';
      // compass rose
      const cx = lon(-150);
      const cy = lat(-35);
      x.fillStyle = darken(land, 0.45);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        x.beginPath();
        x.moveTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34);
        x.lineTo(cx + Math.cos(a + 0.7) * 8, cy + Math.sin(a + 0.7) * 8);
        x.lineTo(cx + Math.cos(a - 0.7) * 8, cy + Math.sin(a - 0.7) * 8);
        x.fill();
      }
      x.strokeStyle = darken(land, 0.45);
      x.beginPath();
      x.arc(cx, cy, 22, 0, Math.PI * 2);
      x.stroke();
      // a few "cities"
      x.fillStyle = '#9a3b2e';
      for (const [lo, la] of [[35, 32], [-74, 41], [2, 49], [139, 36], [-46, -23], [151, -34], [28, -26], [77, 29], [-0.1, 51.5], [116, 40]]) {
        x.beginPath();
        x.arc(lon(lo), lat(la), 3.2, 0, Math.PI * 2);
        x.fill();
      }
      // aged paper vignette
      const v = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(70,45,20,0.18)');
      x.fillStyle = v;
      x.fillRect(0, 0, W, H);
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
    }
  }
  m = new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : mix(ocean, land, 0.4), map, roughness: 0.85, metalness: 0 });
  mapCache.set(key, m);
  return m;
}

const MAP = { w: 1.25, h: 0.74, d: 0.028 };

const worldMap: FurnitureDef = {
  id: 'art-world-map',
  name: 'הדפס מפת עולם',
  category: 'decor',
  group: 'אמנות וקיר',
  tags: ['מפה', 'מפת עולם', 'יבשות', 'גלובוס', 'וינטג\'', 'חדר עבודה', 'חדר ילדים'],
  size: { w: MAP.w, d: MAP.d, h: MAP.h },
  mount: 'wall',
  elevation: elev(MAP.h),
  colors: [slot('frame', 'מסגרת', PAL.walnut), slot('ocean', 'ים', '#b9d0cc'), slot('land', 'יבשה', '#c9a96e')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const fw = 0.02;
    k.geo(rectRing(MAP.w, MAP.h, fw, MAP.d, 0.0015), M.wood(c.frame, 0.5), 0, 0, 0);
    k.box(MAP.w - 2 * fw + 0.004, MAP.h - 2 * fw + 0.004, 0.003, M.matte('#d9d2c4'), 0, fw - 0.002, -MAP.d / 2 + 0.004);
    const g = new THREE.PlaneGeometry(MAP.w - 2 * fw, MAP.h - 2 * fw);
    g.translate(0, MAP.h / 2, 0);
    k.geo(g, worldMapMaterial(c.ocean, c.land), 0, 0, MAP.d / 2 - 0.007).castShadow = false;
    k.geo(artGeo(MAP.w - 2 * fw, MAP.h - 2 * fw), M.glass('#ffffff', 0.06), 0, fw, MAP.d / 2 - 0.005).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => D.rr(ctx, 0, 0, MAP.w, MAP.d, 0.003, tint(c.frame, 0.25), undefined, 0.008)),
};

/* ------------------------------------------------------------------ mirrors */

/** Disc facing +Z (circle geometry), centre at (x, y, z). */
function faceDisc(k: Kit, r: number, mat: THREE.Material, x: number, y: number, z: number, seg = 40): THREE.Mesh {
  return k.geo(new THREE.CircleGeometry(r, seg), mat, x, y, z);
}
/** Cylinder whose axis is Z (a thick disc against the wall); z = back face. */
function wallDisc(k: Kit, r: number, depth: number, mat: THREE.Material, x: number, y: number, zBack: number, seg = 40, rFront = r): THREE.Mesh {
  const g = new THREE.CylinderGeometry(rFront, r, depth, seg);
  g.rotateX(Math.PI / 2);
  return k.geo(g, mat, x, y, zBack + depth / 2);
}
/** Torus lying in the wall plane (facing +Z). */
function wallRing(k: Kit, r: number, tube: number, mat: THREE.Material, x: number, y: number, z: number, seg = 48, radial = 8): THREE.Mesh {
  return k.geo(new THREE.TorusGeometry(r, tube, radial, seg), mat, x, y, z);
}

const RM = { r: 0.3, strap: 0.26, d: 0.035 };

const mirrorRound: FurnitureDef = {
  id: 'mirror-round',
  name: 'מראה עגולה על רצועת עור',
  category: 'decor',
  group: 'מראות',
  tags: ['מראה', 'עגולה', 'רצועה', 'עור', 'פליז', 'כניסה'],
  size: { w: RM.r * 2 + 0.02, d: RM.d, h: RM.r * 2 + RM.strap + 0.01 },
  mount: 'wall',
  elevation: 1.0,
  colors: [slot('frame', 'מסגרת', PAL.brass), slot('strap', 'רצועה', '#7a4a2a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r, strap, d } = RM;
    const cy = r + 0.01;
    const zb = -d / 2;
    const metal = M.metal(c.frame, 0.28, 1);
    wallDisc(k, r - 0.004, 0.012, M.matte('#3a332c'), 0, cy, zb, 40);
    wallRing(k, r - 0.002, 0.009, metal, 0, cy, zb + 0.016, 56, 8);
    faceDisc(k, r - 0.008, M.mirror(), 0, cy, zb + 0.017, 48);
    // leather strap from a brass knob, looping around the rim
    const leather = M.leather(c.strap);
    const knobY = cy + r + strap - 0.03;
    const sw = 0.03;
    const top: V3 = [0, knobY, zb + 0.012];
    for (const s of [-1, 1]) {
      const a = Math.PI / 2 + s * 0.42;
      const p: V3 = [Math.cos(a) * (r + 0.004), cy + Math.sin(a) * (r + 0.004), zb + 0.02];
      k.beam(top, p, sw, 0.004, leather);
    }
    const loop = new THREE.TorusGeometry(r + 0.006, 0.005, 4, 20, 0.84);
    loop.rotateZ(Math.PI / 2 - 0.42);
    k.geo(loop, leather, 0, cy, zb + 0.02).scale.set(1, 1, 0.6);
    const knob = wallDisc(k, 0.018, 0.026, metal, 0, knobY, zb, 18, 0.014);
    knob.castShadow = true;
    k.sphere(0.012, metal, 0, knobY, zb + 0.03, 1, 1, 0.5, 12);
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => D.rr(ctx, 0, 0, RM.r * 2, RM.d, 0.004, '#cfe3ee', tint(c.frame, 0), 0.01)),
};

const AM = { w: 0.72, h: 1.12, d: 0.035, fw: 0.045 };

function archShape(w: number, h: number, y0 = 0): THREE.Shape {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, y0);
  s.lineTo(r, y0);
  s.lineTo(r, y0 + h - r);
  s.absarc(0, y0 + h - r, r, 0, Math.PI, false);
  s.lineTo(-r, y0);
  return s;
}

const mirrorArched: FurnitureDef = {
  id: 'mirror-arched',
  name: 'מראה קשתית במסגרת עץ',
  category: 'decor',
  group: 'מראות',
  tags: ['מראה', 'קשת', 'עץ', 'אלון', 'סקנדינבי', 'חדר שינה'],
  size: { w: AM.w, d: AM.d, h: AM.h },
  mount: 'wall',
  elevation: 0.85,
  colors: [slot('frame', 'מסגרת', PAL.oak)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, h, d, fw } = AM;
    const frame = archShape(w, h);
    frame.holes.push(new THREE.Path(archShape(w - 2 * fw, h - 2 * fw, fw).getPoints(28).reverse()));
    k.geo(extrudeZ(frame, d, 0.003, 28), M.wood(c.frame, 0.5), 0, 0, 0);
    // inner chamfer lip
    const lip = archShape(w - 2 * fw + 0.012, h - 2 * fw + 0.012, fw - 0.006);
    lip.holes.push(new THREE.Path(archShape(w - 2 * fw - 0.004, h - 2 * fw - 0.004, fw + 0.002).getPoints(28).reverse()));
    k.geo(extrudeZ(lip, 0.006, 0, 28), M.wood(darken(c.frame, 0.12), 0.5), 0, 0, d / 2 - 0.009);
    k.geo(extrudeZ(archShape(w - 2 * fw + 0.004, h - 2 * fw + 0.004, fw - 0.002), 0.004, 0, 28), M.mirror(), 0, 0, d / 2 - 0.012);
    k.geo(extrudeZ(archShape(w - 0.01, h - 0.01, 0.005), 0.004, 0, 16), M.matte('#5a4b3c'), 0, 0, -d / 2 + 0.002);
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => D.rr(ctx, 0, 0, AM.w, AM.d, 0.004, tint(c.frame, 0.2), undefined, 0.01)),
};

const FM = { w: 0.7, h: 1.8, t: 0.03, lean: 0.1 };
const FM_D = 0.216;

const mirrorFloor: FurnitureDef = {
  id: 'mirror-floor-leaning',
  name: 'מראת קומה נשענת',
  category: 'decor',
  group: 'מראות',
  tags: ['מראה', 'קומה', 'נשענת', 'גוף מלא', 'חדר שינה', 'חדר ארונות', 'מתכת'],
  size: { w: FM.w, d: FM_D, h: 1.8 },
  colors: [slot('frame', 'מסגרת', '#26272a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, h, t, lean } = FM;
    const g = new Kit();
    const fw = 0.028;
    const fm = M.metal(c.frame, 0.45, 0.7);
    g.geo(rectRing(w, h, fw, t, 0.003), fm, 0, 0, -t / 2);
    g.box(w - 2 * fw + 0.004, h - 2 * fw + 0.004, 0.004, M.mirror(), 0, fw - 0.002, -0.012);
    g.box(w - 0.01, h - 0.01, 0.004, M.matte('#6b5b4a'), 0, 0.005, -t + 0.003);
    // felt pads
    for (const s of [-1, 1]) g.box(0.05, 0.006, 0.02, M.rubber('#3a3a3a'), s * (w / 2 - 0.06), -0.006, -t / 2);
    k.sub(g, 0, 0, 0);
    g.g.rotation.x = -lean;
    // place: front bottom edge near +d/2, top leans on the wall at -d/2
    g.g.position.set(0, 0.009, FM_D / 2 - 0.002);
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.poly(ctx, [[-FM.w / 2, FM_D / 2], [FM.w / 2, FM_D / 2], [FM.w / 2, -FM_D / 2], [-FM.w / 2, -FM_D / 2]], true, '#e3eef3', INK_SOFT, LINE_THIN);
      D.rr(ctx, 0, FM_D / 2 - 0.02, FM.w, 0.035, 0.004, tint(c.frame, 0.3), undefined, 0.008);
    }),
};

const SB = { r: 0.46, mr: 0.16, d: 0.04 };

const mirrorSunburst: FurnitureDef = {
  id: 'mirror-sunburst',
  name: 'מראת שמש מפליז',
  category: 'decor',
  group: 'מראות',
  tags: ['מראה', 'שמש', 'קרניים', 'פליז', 'זהב', 'רטרו', 'הוליווד'],
  size: { w: SB.r * 2, d: SB.d, h: SB.r * 2 },
  mount: 'wall',
  elevation: elev(SB.r * 2, 1.55),
  colors: [slot('frame', 'קרניים', PAL.brass)],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r, mr, d } = SB;
    const cy = r;
    const zb = -d / 2;
    const metal = M.metal(c.frame, 0.26, 1);
    const dark = M.metal(darken(c.frame, 0.25), 0.4, 1);
    wallDisc(k, mr + 0.03, 0.016, dark, 0, cy, zb, 36);
    wallRing(k, mr + 0.012, 0.011, metal, 0, cy, zb + 0.022, 48, 8);
    faceDisc(k, mr, M.mirror(), 0, cy, zb + 0.023, 40);
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i / n) * Math.PI * 2;
      const long = i % 2 === 0;
      const r0 = mr + 0.03;
      const r1 = long ? r - 0.011 : r - 0.12;
      const z = zb + 0.008 + (long ? 0 : 0.004);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      k.rod([ca * r0, cy + sa * r0, z], [ca * r1, cy + sa * r1, z], long ? 0.0045 : 0.006, metal, long ? 0.003 : 0.0035, 6);
      if (long) k.sphere(0.011, metal, ca * (r - 0.012), cy + sa * (r - 0.012), z, 1, 1, 0.8, 8);
      else k.sphere(0.0075, metal, ca * r1, cy + sa * r1, z, 1, 1, 1, 6);
    }
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, 0, SB.mr * 2, SB.d, 0.003, '#cfe3ee', tint(c.frame, 0), 0.008);
      D.line(ctx, -SB.r, 0, SB.r, 0, tint(c.frame, 0), 0.008);
    }),
};

const RT = { r: 0.36, mr: 0.2, d: 0.035 };

const mirrorRattan: FurnitureDef = {
  id: 'mirror-rattan-flower',
  name: 'מראת ראטן פרח',
  category: 'decor',
  group: 'מראות',
  tags: ['מראה', 'ראטן', 'קש', 'בוהו', 'פרח', 'טבעי', 'עגולה'],
  size: { w: RT.r * 2, d: RT.d, h: 0.69 },
  mount: 'wall',
  elevation: elev(RT.r * 2, 1.5),
  colors: [slot('frame', 'ראטן', '#c9a675')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r, mr, d } = RT;
    const cy = r;
    const zb = -d / 2;
    const cane = M.wicker(c.frame);
    const cane2 = M.wicker(darken(c.frame, 0.1));
    wallDisc(k, mr + 0.012, 0.012, M.matte('#4a3c2e'), 0, cy, zb, 36);
    wallRing(k, mr + 0.008, 0.012, cane, 0, cy, zb + 0.018, 44, 7);
    wallRing(k, mr + 0.03, 0.008, cane2, 0, cy, zb + 0.012, 44, 6);
    faceDisc(k, mr, M.mirror(), 0, cy, zb + 0.02, 40);
    const n = 14;
    const petal = (r - mr - 0.044) / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const pr = mr + 0.03 + petal;
      const g = new THREE.TorusGeometry(petal, 0.0065, 5, 16);
      g.scale(1, 0.55, 1);
      g.rotateZ(a);
      k.geo(g, i % 2 ? cane : cane2, Math.cos(a) * pr, cy + Math.sin(a) * pr, zb + 0.008);
    }
    return settle(k.g);
  },
  draw2d: (ctx, c) => sym(ctx, () => D.rr(ctx, 0, 0, RT.r * 2, RT.d, 0.004, tint(c.frame, 0.2), undefined, 0.008)),
};

/* ------------------------------------------------------------------ wall clocks */

/** Clock hands as animated parts: pivot at the dial centre (0, cy, zFace), hands point UP at rest. */
function clockHands(
  k: Kit,
  cy: number,
  zFace: number,
  o: { hourLen: number; minLen: number; secLen?: number; hourW: number; minW: number; tail?: number; mat: THREE.Material; secMat?: THREE.Material; capR?: number; capMat?: THREE.Material; secDisc?: number; shaped?: boolean },
): void {
  const tail = o.tail ?? 0.02;
  const hp = k.part('hour', 0, cy, zFace);
  const mp = k.part('minute', 0, cy, zFace);
  const handShape = (len: number, w: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(-w * 0.6, -tail);
    s.lineTo(w * 0.6, -tail);
    s.lineTo(w / 2, len * 0.75);
    s.lineTo(0, len);
    s.lineTo(-w / 2, len * 0.75);
    s.closePath();
    return s;
  };
  if (o.shaped) {
    hp.geo(extrudeZ(handShape(o.hourLen, o.hourW), 0.0025), o.mat, 0, 0, 0.004);
    mp.geo(extrudeZ(handShape(o.minLen, o.minW), 0.0025), o.mat, 0, 0, 0.0075);
  } else {
    hp.box(o.hourW, o.hourLen + tail, 0.0025, o.mat, 0, -tail, 0.004);
    mp.box(o.minW, o.minLen + tail, 0.0025, o.mat, 0, -tail, 0.0075);
  }
  const capR = o.capR ?? 0.007;
  if (o.secLen) {
    const sp = k.part('second', 0, cy, zFace);
    const sm = o.secMat ?? M.matte('#c0392b');
    sp.box(0.0018, o.secLen + tail * 1.6, 0.0015, sm, 0, -tail * 1.6, 0.0105);
    if (o.secDisc) {
      const g = new THREE.CircleGeometry(o.secDisc, 20);
      sp.geo(g, sm, 0, o.secLen - o.secDisc * 1.2, 0.0114);
    }
    const cap = new THREE.CylinderGeometry(capR, capR, 0.004, 14);
    cap.rotateX(Math.PI / 2);
    sp.geo(cap, o.capMat ?? sm, 0, 0, 0.012);
  } else {
    const cap = new THREE.CylinderGeometry(capR, capR, 0.004, 14);
    cap.rotateX(Math.PI / 2);
    mp.geo(cap, o.capMat ?? o.mat, 0, 0, 0.0095);
  }
}

/** Tick mark (box) on a dial, radial, at angle `a` from 12 o'clock clockwise. */
function tick(k: Kit, mat: THREE.Material, cy: number, z: number, a: number, rOut: number, len: number, w: number, t = 0.0015): void {
  const rm = rOut - len / 2;
  const m = k.box(w, len, t, mat, 0, 0, 0);
  m.geometry.translate(0, -len / 2, 0);
  m.rotation.z = -a;
  m.position.set(Math.sin(a) * rm, cy + Math.cos(a) * rm, z + t / 2);
}

const CM = { r: 0.17, d: 0.04 };

const clockMinimal: FurnitureDef = {
  id: 'clock-minimal',
  name: 'שעון קיר מינימליסטי',
  category: 'decor',
  group: 'שעונים',
  tags: ['שעון', 'מינימליסטי', 'מודרני', 'מתכת', 'שקט', 'סקנדינבי'],
  size: { w: CM.r * 2, d: CM.d, h: CM.r * 2 },
  mount: 'wall',
  elevation: 1.75,
  colors: [slot('rim', 'מסגרת', '#c9ccce'), slot('face', 'לוח', '#f4f2ed'), slot('hands', 'מחוגים', '#1f2023')],
  actions: [{ kind: 'clock' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r, d } = CM;
    const cy = r;
    const zb = -d / 2;
    const rim = M.brushed(c.rim);
    // shallow case + thin rim + flat dial
    const caseG = new THREE.CylinderGeometry(r - 0.004, r - 0.004, d - 0.012, 48, 1, true);
    caseG.rotateX(Math.PI / 2);
    k.geo(caseG, rim, 0, cy, zb + (d - 0.012) / 2);
    wallRing(k, r - 0.005, 0.005, rim, 0, cy, zb + d - 0.013, 56, 8);
    faceDisc(k, r - 0.006, M.paint(c.face, 0.7), 0, cy, zb + d - 0.016, 56);
    wallDisc(k, r - 0.006, 0.006, M.matte('#8a8a8a'), 0, cy, zb, 32);
    const ink = M.matte(c.hands);
    for (let i = 0; i < 12; i++) {
      const big = i % 3 === 0;
      tick(k, ink, cy, zb + d - 0.016, (i / 12) * Math.PI * 2, r - 0.018, big ? 0.03 : 0.012, big ? 0.006 : 0.0025);
    }
    clockHands(k, cy, zb + d - 0.016, { hourLen: 0.085, minLen: 0.13, secLen: 0.135, hourW: 0.006, minW: 0.004, mat: ink, secMat: M.matte('#d9822b'), capR: 0.0055 });
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => D.rr(ctx, 0, 0, CM.r * 2, CM.d, 0.01, tint(c.rim, 0.2), undefined, 0.008)),
};

const CS = { r: 0.2, d: 0.06 };

const clockStation: FurnitureDef = {
  id: 'clock-station',
  name: 'שעון תחנה',
  category: 'decor',
  group: 'שעונים',
  tags: ['שעון', 'תחנה', 'רכבת', 'קלאסי', 'שחור לבן', 'גדול', 'משרד'],
  size: { w: CS.r * 2, d: CS.d, h: CS.r * 2 },
  mount: 'wall',
  elevation: 1.7,
  colors: [slot('rim', 'מסגרת', '#1d1e21'), slot('face', 'לוח', '#fbfbf8'), slot('second', 'מחוג שניות', '#d0262d')],
  actions: [{ kind: 'clock' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r, d } = CS;
    const cy = r;
    const zb = -d / 2;
    const rim = M.lacquer(c.rim);
    const body = new THREE.CylinderGeometry(r - 0.006, r - 0.012, d - 0.024, 56);
    body.rotateX(-Math.PI / 2);
    k.geo(body, rim, 0, cy, zb + (d - 0.024) / 2);
    wallRing(k, r - 0.012, 0.012, rim, 0, cy, zb + d - 0.013, 64, 10);
    const fz = zb + d - 0.018;
    faceDisc(k, r - 0.016, M.paint(c.face, 0.5), 0, cy, fz, 64);
    const ink = M.matte('#141414');
    for (let i = 0; i < 60; i++) {
      const big = i % 5 === 0;
      tick(k, ink, cy, fz, (i / 60) * Math.PI * 2, r - 0.024, big ? 0.04 : 0.012, big ? 0.009 : 0.003);
    }
    clockHands(k, cy, fz, { hourLen: 0.115, minLen: 0.16, secLen: 0.125, hourW: 0.013, minW: 0.01, tail: 0.04, mat: ink, secMat: M.matte(c.second), secDisc: 0.0125, capR: 0.005 });
    // domed glass
    const glass = new THREE.SphereGeometry(r * 2.2, 40, 6, 0, Math.PI * 2, 0, Math.asin((r - 0.016) / (r * 2.2)));
    glass.rotateX(Math.PI / 2);
    k.geo(glass, M.glass('#ffffff', 0.08), 0, cy, fz + 0.022 - r * 2.2).castShadow = false;
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => D.rr(ctx, 0, 0, CS.r * 2, CS.d, 0.012, tint(c.rim, 0.4), undefined, 0.008)),
};

const CW = { r: 0.18, d: 0.035 };

const clockWood: FurnitureDef = {
  id: 'clock-wood',
  name: 'שעון קיר מעץ מלא',
  category: 'decor',
  group: 'שעונים',
  tags: ['שעון', 'עץ', 'אגוז', 'טבעי', 'פליז', 'סקנדינבי'],
  size: { w: CW.r * 2, d: CW.d, h: CW.r * 2 },
  mount: 'wall',
  elevation: 1.75,
  colors: [slot('wood', 'עץ', PAL.walnut), slot('hands', 'מחוגים', PAL.brass)],
  actions: [{ kind: 'clock' }],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { r, d } = CW;
    const cy = r;
    const zb = -d / 2;
    const wood = M.wood(c.wood, 0.45);
    // solid disc with a chamfered front edge
    const body = new THREE.CylinderGeometry(r - 0.008, r, d - 0.008, 56, 1);
    body.rotateX(Math.PI / 2);
    // UVs for grain across the face
    const uv = body.getAttribute('uv') as THREE.BufferAttribute;
    const p = body.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * 1.2, p.getY(i) * 1.2);
    k.geo(body, wood, 0, cy, zb + (d - 0.008) / 2);
    const front = new THREE.CircleGeometry(r - 0.008, 56);
    const fuv = front.getAttribute('uv') as THREE.BufferAttribute;
    const fp = front.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fp.getY(i) * 1.2, fp.getX(i) * 1.2);
    const fz = zb + d - 0.0079;
    k.geo(front, wood, 0, cy, fz);
    const metal = M.metal(c.hands, 0.3, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rr = r - 0.03;
      const big = i % 3 === 0;
      const m = wallDisc(k, big ? 0.008 : 0.0055, 0.003, metal, Math.sin(a) * rr, cy + Math.cos(a) * rr, fz, 14);
      m.castShadow = false;
    }
    clockHands(k, cy, fz, { hourLen: 0.085, minLen: 0.125, hourW: 0.012, minW: 0.009, tail: 0.018, mat: metal, capR: 0.008, shaped: true });
    return k.g;
  },
  draw2d: (ctx, c) => sym(ctx, () => D.rr(ctx, 0, 0, CW.r * 2, CW.d, 0.01, tint(c.wood, 0.3), undefined, 0.008)),
};

/* ------------------------------------------------------------------ macramé wall hanging */

const MC = { w: 0.56, h: 0.9, d: 0.04 };

const macrame: FurnitureDef = {
  id: 'wall-macrame',
  name: 'מקרמה לקיר',
  category: 'decor',
  group: 'אמנות וקיר',
  tags: ['מקרמה', 'בוהו', 'חבלים', 'קשרים', 'כותנה', 'עבודת יד'],
  size: { w: MC.w, d: MC.d, h: MC.h },
  mount: 'wall',
  elevation: 1.05,
  colors: [slot('cord', 'חבל', '#ebe2cf'), slot('rod', 'מוט', '#b48a5a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(211);
    const { w, h, d } = MC;
    const zb = -d / 2;
    const rodY = h - 0.14 + 0.05;
    const rz = zb + 0.016;
    k.rod([-w / 2 + 0.005, rodY, rz], [w / 2 - 0.005, rodY, rz], 0.012, M.wood(c.rod), 0.012, 10);
    const cordM = M.linen(c.cord);
    const knotM = M.linen(darken(c.cord, 0.05));
    // hanging string to a nail
    k.tube([[-w / 2 + 0.05, rodY, rz], [-0.12, rodY + 0.08, zb + 0.006], [0, h + 0.044, zb + 0.004], [0.12, rodY + 0.08, zb + 0.006], [w / 2 - 0.05, rodY, rz]], 0.0022, cordM, { seg: 24, radial: 3 });
    k.sphere(0.006, M.brass(), 0, h + 0.044, zb + 0.005, 1, 1, 1, 6);
    const n = 12;
    const span = w - 0.1;
    const xs = Array.from({ length: n }, (_, i) => -span / 2 + (i / (n - 1)) * span);
    const rows = 7;
    const rowY = (i: number) => rodY - 0.07 - i * 0.065;
    const paths: V3[][] = xs.map((x) => [[x, rodY + 0.012, rz + 0.012], [x, rodY - 0.03, rz + 0.008]]);
    const knots: V3[] = [];
    for (let i = 0; i < rows; i++) {
      const off = i % 2;
      const y = rowY(i);
      // diamond mask: rows shrink towards the bottom
      const half = Math.min(i + 1, rows - i) * 2 + 1;
      const pairs: Array<[number, number]> = [];
      for (let a = off; a + 1 < n; a += 2) pairs.push([a, a + 1]);
      const used = new Set<number>();
      for (const [a, b] of pairs) {
        const mid = (a + b) / 2 - (n - 1) / 2;
        if (Math.abs(mid) > half) continue;
        const cx = (xs[a] + xs[b]) / 2;
        paths[a].push([cx - 0.006, y, rz + 0.008]);
        paths[b].push([cx + 0.006, y, rz + 0.008]);
        knots.push([cx, y, rz + 0.008]);
        used.add(a);
        used.add(b);
      }
      xs.forEach((x, j) => {
        if (!used.has(j)) paths[j].push([x, y, rz + 0.006]);
      });
    }
    // fringe: V-shaped cut
    xs.forEach((x, j) => {
      const len = 0.08 + Math.abs(j - (n - 1) / 2) * 0.03 + r() * 0.015;
      const y0 = rowY(rows - 1) - 0.04;
      paths[j].push([x + (x > 0 ? 0.008 : -0.008), y0, rz + 0.005], [x + (x > 0 ? 0.014 : -0.014), Math.max(0.004, y0 - len), rz + 0.004]);
    });
    for (const p of paths) k.tube(p, 0.0032, cordM, { seg: p.length * 2, radial: 3, tension: 0.3 });
    for (const q of knots) k.sphere(0.011, knotM, q[0], q[1], q[2], 1.25, 0.9, 0.6, 6);
    // lark's head knots on the rod
    for (const x of xs) k.sphere(0.009, knotM, x, rodY - 0.005, rz + 0.012, 1, 1.2, 0.8, 6);
    return settle(k.g);
  },
  draw2d: (ctx, c) => sym(ctx, () => D.rr(ctx, 0, 0, MC.w, 0.026, 0.01, tint(c.rod, 0.3), undefined, 0.008)),
};

/* ------------------------------------------------------------------ woven tapestry */

const TP = { w: 0.9, h: 1.243, d: 0.04 };

const tapestry: FurnitureDef = {
  id: 'wall-tapestry',
  name: 'שטיח קיר ארוג',
  category: 'decor',
  group: 'אמנות וקיר',
  tags: ['שטיח קיר', 'אריג', 'קילים', 'בוהו', 'טקסטיל', 'גדילים'],
  size: { w: TP.w, d: TP.d, h: TP.h },
  mount: 'wall',
  elevation: 0.9,
  colors: [slot('c1', 'רקע', '#e7dcc8'), slot('c2', 'דוגמה', '#b5553c'), slot('c3', 'דוגמה 2', '#3f5a63'), slot('rod', 'מוט', '#7a5a3c')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const r = rng(223);
    const { w, h, d } = TP;
    const zb = -d / 2;
    const rodY = h + 0.007 - 0.07;
    const rz = zb + 0.016;
    k.rod([-w / 2, rodY, rz], [w / 2, rodY, rz], 0.011, M.wood(c.rod), 0.011, 10);
    for (const s of [-1, 1]) k.sphere(0.016, M.wood(darken(c.rod, 0.15)), s * (w / 2 - 0.016), rodY, rz, 1, 1, 1, 10);
    k.tube([[-w / 2 + 0.08, rodY, rz], [-0.1, h - 0.03, zb + 0.006], [0, h + 0.003, zb + 0.004], [0.1, h - 0.023, zb + 0.006], [w / 2 - 0.08, rodY, rz]], 0.003, M.leather('#5c3b26'), { seg: 20, radial: 4 });
    // gently draped cloth with a woven pattern
    const tw = w - 0.1;
    const th = rodY - 0.02 - 0.16;
    const g = artGeo(tw, th, 0, 16, 10);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = p.getY(i) / th;
      p.setZ(i, Math.sin((p.getX(i) / tw) * Math.PI * 5) * 0.006 * (1 - v * 0.7) + (1 - v) * 0.006);
    }
    g.computeVertexNormals();
    const pal = [c.c1, c.c2, c.c3, lighten(c.c2, 0.35)];
    const cloth = M.rug('kilim', pal, tw, th);
    k.geo(g, cloth, 0, 0.16, rz + 0.004);
    // back of the cloth
    const back = artGeo(tw, th);
    back.rotateY(Math.PI);
    k.geo(back, M.fabric(c.c1, 20), 0, 0.16, rz + 0.002);
    // folded top hem around the rod
    k.rbox(tw, 0.035, 0.012, 0.005, M.fabric(c.c1, 20), 0, rodY - 0.025, rz + 0.002);
    // fringe
    const fr = M.fabric(darken(c.c1, 0.06), 30);
    for (let i = 0; i < 28; i++) {
      const x = -tw / 2 + 0.01 + (i / 27) * (tw - 0.02);
      const len = 0.13 + r() * 0.025;
      k.rod([x, 0.162, rz + 0.008], [x + (r() - 0.5) * 0.012, 0.162 - len, rz + 0.006], 0.003, fr, 0.0022, 4);
      if (i % 3 === 0) k.sphere(0.006, fr, x, 0.16, rz + 0.008, 1.2, 1, 0.8, 6);
    }
    return settle(k.g);
  },
  draw2d: (ctx, c) => sym(ctx, () => D.rr(ctx, 0, 0, TP.w, 0.024, 0.008, tint(c.c2, 0.3), undefined, 0.008)),
};

/* ------------------------------------------------------------------ decorative plates */

const PLATES: Array<{ x: number; y: number; r: number; style: ArtStyle; seed: number }> = [
  { x: -0.06, y: 0.42, r: 0.16, style: 'botanical', seed: 41 },
  { x: -0.37, y: 0.52, r: 0.11, style: 'circles', seed: 42 },
  { x: 0.27, y: 0.55, r: 0.12, style: 'geometric', seed: 43 },
  { x: -0.33, y: 0.2, r: 0.12, style: 'geometric', seed: 44 },
  { x: 0.22, y: 0.2, r: 0.13, style: 'circles', seed: 45 },
  { x: 0.0, y: 0.1, r: 0.09, style: 'lines', seed: 46 },
  { x: 0.0, y: 0.74, r: 0.085, style: 'stripes', seed: 47 },
];
const PL = { w: 0.9, h: 0.82, d: 0.035 };

const wallPlates: FurnitureDef = {
  id: 'wall-plates',
  name: 'סט צלחות נוי לקיר',
  category: 'decor',
  group: 'אמנות וקיר',
  tags: ['צלחות', 'קרמיקה', 'פורצלן', 'סט', 'כפרי', 'מטבח', 'וינטג\''],
  size: { w: PL.w, d: PL.d, h: PL.h },
  mount: 'wall',
  elevation: elev(PL.h, 1.5),
  colors: [slot('glaze', 'זיגוג', '#f6f3ec'), slot('pattern', 'דוגמה', '#2f5b8a'), slot('accent', 'דוגמה 2', '#c9a35a')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const zb = -PL.d / 2;
    const glaze = M.ceramic(c.glaze);
    const rimM = M.ceramic(c.pattern);
    PLATES.forEach((p, i) => {
      const { r } = p;
      const dep = 0.022 + r * 0.06;
      // plate profile (radius, height above the wall): foot ring, well, rim
      const prof: Array<[number, number]> = [
        [0, 0.004],
        [r * 0.58, 0.0],
        [r * 0.66, dep * 0.45],
        [r * 0.95, dep * 0.95],
        [r, dep],
        [r * 0.98, dep + 0.003],
        [r * 0.7, dep * 0.62 + 0.004],
        [r * 0.62, dep * 0.35 + 0.004],
        [0, dep * 0.35 + 0.004],
      ];
      const g = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 26);
      g.rotateX(Math.PI / 2);
      const cyy = p.y + PL.h / 2 - 0.415;
      k.geo(g, glaze, p.x, cyy, zb);
      // decorated well + coloured rim band
      const well = new THREE.CircleGeometry(r * 0.6, 24);
      const uv = well.getAttribute('uv') as THREE.BufferAttribute;
      const wp = well.getAttribute('position') as THREE.BufferAttribute;
      for (let j = 0; j < uv.count; j++) uv.setXY(j, wp.getX(j), wp.getY(j));
      const pal = [c.glaze, c.pattern, i % 2 ? c.accent : lighten(c.pattern, 0.35), darken(c.pattern, 0.2)];
      k.geo(well, M.art(p.style, p.seed, pal, r * 1.2, r * 1.2), p.x, cyy, zb + dep * 0.35 + 0.0045).castShadow = false;
      const band = new THREE.RingGeometry(r * 0.84, r * 0.93, 26);
      const bm = k.geo(band, i % 3 === 1 ? M.ceramic(c.accent) : rimM, p.x, cyy, zb + dep * 0.92);
      bm.castShadow = false;
    });
    for (const ch of k.g.children) ch.position.x += 0.045;
    return settle(k.g);
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      for (const p of PLATES) D.rr(ctx, p.x + 0.045, 0, p.r * 2, PL.d, 0.006, tint(c.glaze, 0), INK_SOFT, LINE_THIN);
    }),
};

/* ------------------------------------------------------------------ coat hook rail */

const CR = { w: 0.8, d: 0.15, h: 0.66 };

const coatRail: FurnitureDef = {
  id: 'wall-coat-rail',
  name: 'מתלה מעילים לקיר',
  category: 'decor',
  group: 'אמנות וקיר',
  tags: ['מתלה', 'ווים', 'מעילים', 'כניסה', 'עץ', 'כובע', 'תיק'],
  size: { w: CR.w, d: CR.d, h: CR.h },
  mount: 'wall',
  elevation: 1.05,
  colors: [slot('board', 'לוח', PAL.oak), slot('hooks', 'ווים', '#26272a'), slot('bag', 'תיק', '#d8ccb4')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d } = CR;
    const zb = -d / 2;
    const by = 0.46;
    k.rbox(w, 0.1, 0.022, 0.004, M.wood(c.board, 0.5), 0, by, zb + 0.011);
    const hm = M.metal(c.hooks, 0.45, 0.7);
    const xs = [-0.3, -0.15, 0, 0.15, 0.3];
    const hy = by + 0.05;
    for (const x of xs) {
      k.cyl(0.012, 0.008, hm, x, hy, zb + 0.022, 0.012, 12).rotation.x = Math.PI / 2;
      k.tube([[x, hy, zb + 0.024], [x, hy - 0.005, zb + 0.07], [x, hy + 0.01, zb + 0.09], [x, hy + 0.035, zb + 0.092]], 0.0045, hm, { seg: 10, radial: 6 });
      k.sphere(0.008, hm, x, hy + 0.038, zb + 0.092, 1, 1, 1, 8);
    }
    for (const s of [-1, 1]) {
      const sc = k.cyl(0.005, 0.002, M.brass(), s * (w / 2 - 0.04), hy, zb + 0.022, 0.005, 8);
      sc.rotation.x = Math.PI / 2;
    }
    // straw hat hung by its crown on the second hook
    const hat = new Kit();
    hat.lathe([[0.15, 0], [0.155, 0.004], [0.146, 0.01], [0.1, 0.013], [0.088, 0.02], [0.085, 0.075], [0.065, 0.095], [0, 0.099]], M.wicker('#d6b980'), 0, 0, 0, 30);
    hat.lathe([[0.0885, 0.02], [0.0885, 0.04], [0.0862, 0.04], [0.0862, 0.02]], M.cloth('#2d2d2d'), 0, 0, 0, 30);
    k.sub(hat, -0.15, hy - 0.01, zb + 0.042);
    hat.g.rotation.x = Math.PI / 2 - 0.1;
    // canvas tote bag on the fourth hook
    const bag = M.fabric(c.bag, 18);
    const bx = 0.15;
    k.cushion(0.3, 0.34, 0.04, bag, bx, 0, zb + 0.06, 0.012, 0.012, 2);
    for (const s of [-1, 1]) k.tube([[bx + s * 0.07, 0.33, zb + 0.065], [bx + s * 0.035, hy - 0.02, zb + 0.08], [bx, hy + 0.02, zb + 0.09]], 0.007, M.fabric(darken(c.bag, 0.15), 18), { seg: 10, radial: 5 });
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      D.rr(ctx, 0, -CR.d / 2 + 0.011, CR.w, 0.022, 0.003, tint(c.board, 0.3), undefined, 0.008);
      for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) D.line(ctx, x, -CR.d / 2 + 0.022, x, -CR.d / 2 + 0.095, tint(c.hooks, 0.2), 0.008);
      D.ellipse(ctx, -0.15, -CR.d / 2 + 0.07, 0.15, 0.05, tint('#d6b980', 0.3), INK_SOFT, LINE_THIN);
      D.rr(ctx, 0.15, -CR.d / 2 + 0.06, 0.3, 0.04, 0.01, tint(c.bag, 0.2), INK_SOFT, LINE_THIN);
    }),
};

export const WALL_DECOR: FurnitureDef[] = [
  ...ART.map(framedArt),
  triptych,
  galleryWall,
  worldMap,
  mirrorRound,
  mirrorArched,
  mirrorFloor,
  mirrorSunburst,
  mirrorRattan,
  clockMinimal,
  clockStation,
  clockWood,
  macrame,
  tapestry,
  wallPlates,
  coatRail,
];
