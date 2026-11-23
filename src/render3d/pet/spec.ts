/**
 * Anatomy tables of the pets. All numbers are meters in the BIND pose (a relaxed square stand):
 * the animal faces +Z, +Y is up, the origin is on the ground under the middle of the body.
 * Sagittal landmarks are written as [z, y].
 */

export type V2 = [number, number];

/** bone indices (all bones have identity bind orientation) */
export const B = {
  pelvis: 0,
  spine: 1,
  chest: 2,
  neck1: 3,
  neck2: 4,
  head: 5,
  jaw: 6,
  earL: 7,
  earR: 8,
  eyeL: 9,
  eyeR: 10,
  tongue: 11,
  /** 4 legs × (upper, lower, pastern, paw); legs: 0 front-left, 1 front-right, 2 hind-left, 3 hind-right */
  leg: 12,
  tail: 28,
} as const;

export type TorsoBone = 'pelvis' | 'spine' | 'chest' | 'neck1' | 'neck2' | 'head';

export interface TorsoStation {
  z: number;
  y: number;
  up: number;
  down: number;
  w: number;
  n?: number;
  skin: Partial<Record<TorsoBone, number>>;
}

export interface LegSpec {
  /** lateral offset of the leg plane */
  x: number;
  /** top joint (shoulder / hip), middle joint (elbow / knee), ankle (wrist / hock), paw joint */
  j: [V2, V2, V2, V2];
}

/** head-local station: a = distance along the muzzle axis from the head joint, c = center height */
export interface HeadStation {
  a: number;
  c: number;
  up: number;
  down: number;
  w: number;
  n?: number;
}

export interface Breed {
  key: 'retriever' | 'terrier' | 'cat';
  kind: 'dog' | 'cat';
  /** height at the withers – the reference length for gait scaling */
  h: number;
  torso: TorsoStation[];
  torsoCap: [number, number];
  bones: { pelvis: V2; chest: V2; neck1: V2; neck2: V2; head: V2 };
  front: LegSpec;
  hind: LegSpec;
  /** leg thickness scale relative to the retriever */
  legR: number;
  paw: { toe: number; heel: number; w: number; h: number };
  head: { pitch: number; st: HeadStation[]; capStart: number; capEnd: number };
  jaw: { hinge: [number, number]; len: number; w0: number; w1: number; up: number; down: number; tip: number };
  /** a = station along the muzzle axis, th = angle around the head (0 = side, π/2 = top), sink = how deep the eyeball sits (× r) */
  eye: { a: number; th: number; r: number; sink: number; out: number; pupil: [number, number]; iris: string; irisR: number };
  nose: { a: number; c: number; w: number; h: number; d: number; color: string };
  ear: {
    /** [x, y, a] in head-local space for the LEFT (+X) ear, base → tip */
    path: [number, number, number][];
    /** half-width (along the side axis) per path point */
    w: number[];
    thick: number;
    /** side axis of the ear loft in head space */
    side: [number, number, number];
    /** pivot (head-local) */
    pivot: [number, number, number];
  };
  tail: {
    base: V2;
    len: number;
    n: number;
    r0: number;
    r1: number;
    /** extra hair hanging under the tail (retriever) */
    feather: number;
    /** rest pitch of each segment: 0 = straight back, + = up */
    pitch: number[];
  };
  collar: { k: number; hw: number; tag: number };
  whiskers: number;
  anim: {
    /** speeds (m/s) where walk→trot and trot→gallop are centered */
    trotAt: number;
    gallopAt: number;
    /** pelvis-bone height when sitting; pelvis / chest bone heights when lying */
    sitPelvisY: number;
    sitChestRaise: number;
    liePelvisY: number;
    lieChestY: number;
  };
}

/* ------------------------------------------------------------------ retriever */

export const RETRIEVER: Breed = {
  key: 'retriever',
  kind: 'dog',
  h: 0.56,
  torso: [
    { z: -0.36, y: 0.44, up: 0.055, down: 0.07, w: 0.058, skin: { pelvis: 1 } },
    { z: -0.315, y: 0.438, up: 0.092, down: 0.108, w: 0.108, skin: { pelvis: 1 } },
    { z: -0.25, y: 0.435, up: 0.106, down: 0.116, w: 0.128, skin: { pelvis: 1 } },
    { z: -0.13, y: 0.438, up: 0.104, down: 0.106, w: 0.098, skin: { pelvis: 0.3, spine: 0.7 } },
    { z: 0.0, y: 0.425, up: 0.122, down: 0.132, w: 0.134, skin: { spine: 0.6, chest: 0.4 } },
    { z: 0.11, y: 0.415, up: 0.142, down: 0.152, w: 0.142, n: 2.1, skin: { chest: 1 } },
    { z: 0.2, y: 0.432, up: 0.13, down: 0.142, w: 0.13, skin: { chest: 1 } },
    { z: 0.258, y: 0.492, up: 0.108, down: 0.124, w: 0.106, skin: { chest: 0.5, neck1: 0.5 } },
    { z: 0.305, y: 0.568, up: 0.09, down: 0.104, w: 0.092, skin: { neck1: 0.3, neck2: 0.7 } },
    { z: 0.345, y: 0.638, up: 0.076, down: 0.084, w: 0.08, skin: { neck2: 0.4, head: 0.6 } },
    { z: 0.378, y: 0.688, up: 0.05, down: 0.052, w: 0.054, skin: { head: 1 } },
  ],
  torsoCap: [0.03, 0.02],
  bones: { pelvis: [-0.25, 0.44], chest: [0.13, 0.42], neck1: [0.245, 0.48], neck2: [0.3, 0.565], head: [0.35, 0.648] },
  front: { x: 0.094, j: [[0.215, 0.4], [0.1, 0.295], [0.118, 0.105], [0.128, 0.034]] },
  hind: { x: 0.09, j: [[-0.265, 0.435], [-0.185, 0.275], [-0.355, 0.135], [-0.335, 0.034]] },
  legR: 1,
  paw: { toe: 0.04, heel: 0.024, w: 0.037, h: 0.05 },
  head: {
    pitch: 0.2,
    st: [
      { a: -0.012, c: 0.027, up: 0.056, down: 0.052, w: 0.056 },
      { a: 0.03, c: 0.027, up: 0.074, down: 0.066, w: 0.076, n: 2.1 },
      { a: 0.07, c: 0.024, up: 0.07, down: 0.064, w: 0.074, n: 2.2 },
      { a: 0.108, c: 0.006, up: 0.054, down: 0.054, w: 0.059, n: 2.4 },
      { a: 0.14, c: -0.002, up: 0.045, down: 0.044, w: 0.051, n: 2.7 },
      { a: 0.18, c: -0.007, up: 0.041, down: 0.041, w: 0.047, n: 2.9 },
      { a: 0.215, c: -0.01, up: 0.035, down: 0.037, w: 0.042, n: 2.7 },
    ],
    capStart: 0.034,
    capEnd: 0.016,
  },
  jaw: { hinge: [0.062, -0.036], len: 0.148, w0: 0.044, w1: 0.032, up: 0.014, down: 0.018, tip: 0.011 },
  eye: { a: 0.094, th: 0.93, r: 0.02, sink: 0.66, out: 0.45, pupil: [0.45, 0.45], iris: '#5a3413', irisR: 0.84 },
  nose: { a: 0.228, c: 0.003, w: 0.023, h: 0.018, d: 0.016, color: '#1c1614' },
  ear: {
    path: [
      [0.046, 0.07, 0.024],
      [0.075, 0.064, 0.03],
      [0.09, 0.022, 0.036],
      [0.088, -0.03, 0.042],
      [0.08, -0.066, 0.047],
    ],
    w: [0.034, 0.041, 0.046, 0.038, 0.016],
    thick: 0.008,
    side: [0, 0, 1],
    pivot: [0.063, 0.068, 0.027],
  },
  tail: { base: [-0.368, 0.468], len: 0.37, n: 5, r0: 0.032, r1: 0.012, feather: 0.024, pitch: [-0.95, -0.85, -0.7, -0.5, -0.3] },
  collar: { k: 7.75, hw: 0.012, tag: 0.017 },
  whiskers: 0,
  anim: { trotAt: 2.0, gallopAt: 3.7, sitPelvisY: 0.165, sitChestRaise: 0.012, liePelvisY: 0.125, lieChestY: 0.153 },
};

/* ------------------------------------------------------------------ cat */

export const CAT: Breed = {
  key: 'cat',
  kind: 'cat',
  h: 0.25,
  torso: [
    { z: -0.19, y: 0.2, up: 0.034, down: 0.04, w: 0.034, skin: { pelvis: 1 } },
    { z: -0.16, y: 0.198, up: 0.05, down: 0.056, w: 0.052, skin: { pelvis: 1 } },
    { z: -0.12, y: 0.195, up: 0.058, down: 0.066, w: 0.062, skin: { pelvis: 1 } },
    { z: -0.05, y: 0.19, up: 0.057, down: 0.07, w: 0.062, skin: { pelvis: 0.3, spine: 0.7 } },
    { z: 0.02, y: 0.186, up: 0.06, down: 0.07, w: 0.066, skin: { spine: 0.6, chest: 0.4 } },
    { z: 0.075, y: 0.186, up: 0.062, down: 0.068, w: 0.064, skin: { chest: 1 } },
    { z: 0.115, y: 0.197, up: 0.056, down: 0.062, w: 0.056, skin: { chest: 1 } },
    { z: 0.147, y: 0.225, up: 0.046, down: 0.052, w: 0.048, skin: { chest: 0.5, neck1: 0.5 } },
    { z: 0.168, y: 0.25, up: 0.04, down: 0.044, w: 0.043, skin: { neck1: 0.3, neck2: 0.7 } },
    { z: 0.186, y: 0.27, up: 0.032, down: 0.034, w: 0.036, skin: { neck2: 0.3, head: 0.7 } },
  ],
  torsoCap: [0.016, 0.012],
  bones: { pelvis: [-0.12, 0.195], chest: [0.07, 0.188], neck1: [0.138, 0.216], neck2: [0.16, 0.243], head: [0.178, 0.264] },
  front: { x: 0.04, j: [[0.105, 0.18], [0.058, 0.124], [0.068, 0.044], [0.073, 0.015]] },
  hind: { x: 0.045, j: [[-0.125, 0.19], [-0.08, 0.114], [-0.168, 0.066], [-0.156, 0.015]] },
  legR: 0.56,
  paw: { toe: 0.024, heel: 0.012, w: 0.019, h: 0.023 },
  head: {
    pitch: 0.14,
    st: [
      { a: -0.004, c: 0.015, up: 0.031, down: 0.03, w: 0.033 },
      { a: 0.026, c: 0.015, up: 0.044, down: 0.04, w: 0.05 },
      { a: 0.055, c: 0.011, up: 0.042, down: 0.039, w: 0.049, n: 2.1 },
      { a: 0.075, c: 0.002, up: 0.031, down: 0.033, w: 0.038, n: 2.2 },
      { a: 0.089, c: -0.006, up: 0.019, down: 0.023, w: 0.026, n: 2.3 },
      { a: 0.1, c: -0.009, up: 0.012, down: 0.016, w: 0.017, n: 2.1 },
    ],
    capStart: 0.015,
    capEnd: 0.006,
  },
  jaw: { hinge: [0.046, -0.02], len: 0.046, w0: 0.019, w1: 0.012, up: 0.006, down: 0.008, tip: 0.005 },
  eye: { a: 0.071, th: 0.72, r: 0.0145, sink: 0.7, out: 0.22, pupil: [0.26, 0.62], iris: '#b4b23a', irisR: 0.86 },
  nose: { a: 0.106, c: -0.004, w: 0.0062, h: 0.0048, d: 0.004, color: '#d98a86' },
  ear: {
    path: [
      [0.03, 0.034, 0.024],
      [0.034, 0.054, 0.022],
      [0.038, 0.072, 0.019],
      [0.041, 0.088, 0.017],
    ],
    w: [0.025, 0.021, 0.012, 0.003],
    thick: 0.008,
    side: [1, 0, 0.35],
    pivot: [0.032, 0.044, 0.022],
  },
  tail: { base: [-0.19, 0.212], len: 0.29, n: 7, r0: 0.016, r1: 0.012, feather: 0, pitch: [-0.75, -0.8, -0.6, -0.3, 0.05, 0.4, 0.7] },
  collar: { k: 7.6, hw: 0.005, tag: 0.007 },
  whiskers: 5,
  anim: { trotAt: 1.7, gallopAt: 2.6, sitPelvisY: 0.081, sitChestRaise: 0.016, liePelvisY: 0.068, lieChestY: 0.071 },
};

/* ------------------------------------------------------------------ terrier (derived) */

function scaleV2(v: V2, k: number): V2 {
  return [v[0] * k, v[1] * k];
}

function scaledDog(src: Breed, k: number): Breed {
  const s = (n: number) => n * k;
  return {
    ...src,
    h: s(src.h),
    torso: src.torso.map((t) => ({ ...t, z: s(t.z), y: s(t.y), up: s(t.up), down: s(t.down), w: s(t.w) })),
    torsoCap: [s(src.torsoCap[0]), s(src.torsoCap[1])],
    bones: {
      pelvis: scaleV2(src.bones.pelvis, k),
      chest: scaleV2(src.bones.chest, k),
      neck1: scaleV2(src.bones.neck1, k),
      neck2: scaleV2(src.bones.neck2, k),
      head: scaleV2(src.bones.head, k),
    },
    front: { x: s(src.front.x), j: src.front.j.map((p) => scaleV2(p, k)) as LegSpec['j'] },
    hind: { x: s(src.hind.x), j: src.hind.j.map((p) => scaleV2(p, k)) as LegSpec['j'] },
    legR: src.legR * k,
    paw: { toe: s(src.paw.toe), heel: s(src.paw.heel), w: s(src.paw.w), h: s(src.paw.h) },
    tail: { ...src.tail, base: scaleV2(src.tail.base, k), len: s(src.tail.len), r0: s(src.tail.r0), r1: s(src.tail.r1), feather: s(src.tail.feather) },
    collar: { k: src.collar.k, hw: s(src.collar.hw), tag: s(src.collar.tag) },
    anim: {
      ...src.anim,
      sitPelvisY: s(src.anim.sitPelvisY),
      sitChestRaise: s(src.anim.sitChestRaise),
      liePelvisY: s(src.anim.liePelvisY),
      lieChestY: s(src.anim.lieChestY),
    },
  };
}

const TK = 0.55;
const HK = 0.66; // the head of a small dog is relatively bigger
const hs = (n: number) => n * HK;

export const TERRIER: Breed = {
  ...scaledDog(RETRIEVER, TK),
  key: 'terrier',
  legR: 0.6,
  head: {
    pitch: 0.16,
    st: [
      { a: hs(-0.012), c: hs(0.024), up: hs(0.05), down: hs(0.046), w: hs(0.05) },
      { a: hs(0.03), c: hs(0.024), up: hs(0.064), down: hs(0.058), w: hs(0.066), n: 2.1 },
      { a: hs(0.07), c: hs(0.02), up: hs(0.06), down: hs(0.056), w: hs(0.062), n: 2.2 },
      { a: hs(0.096), c: hs(0.006), up: hs(0.045), down: hs(0.046), w: hs(0.048), n: 2.3 },
      { a: hs(0.12), c: hs(-0.004), up: hs(0.034), down: hs(0.037), w: hs(0.038), n: 2.6 },
      { a: hs(0.155), c: hs(-0.008), up: hs(0.029), down: hs(0.033), w: hs(0.034), n: 2.7 },
      { a: hs(0.183), c: hs(-0.01), up: hs(0.025), down: hs(0.029), w: hs(0.03), n: 2.5 },
    ],
    capStart: hs(0.03),
    capEnd: hs(0.014),
  },
  jaw: { hinge: [hs(0.055), hs(-0.03)], len: hs(0.127), w0: hs(0.034), w1: hs(0.022), up: hs(0.012), down: hs(0.016), tip: hs(0.01) },
  eye: { a: hs(0.088), th: 0.93, r: hs(0.02), sink: 0.68, out: 0.45, pupil: [0.45, 0.45], iris: '#3d2210', irisR: 0.84 },
  nose: { a: hs(0.192), c: 0, w: hs(0.02), h: hs(0.016), d: hs(0.015), color: '#15110f' },
  ear: {
    // "button" ear: stands up, then folds forward
    path: [
      [hs(0.036), hs(0.058), hs(0.012)],
      [hs(0.05), hs(0.092), hs(0.016)],
      [hs(0.054), hs(0.098), hs(0.045)],
      [hs(0.052), hs(0.07), hs(0.074)],
    ],
    w: [hs(0.03), hs(0.03), hs(0.026), hs(0.008)],
    thick: hs(0.007),
    side: [1, 0, 0.25],
    pivot: [hs(0.042), hs(0.07), hs(0.014)],
  },
  tail: { base: [-0.365 * TK, 0.5 * TK], len: 0.12, n: 4, r0: 0.014, r1: 0.007, feather: 0, pitch: [0.8, 1.0, 1.12, 1.18] },
  anim: { trotAt: 1.35, gallopAt: 2.7, sitPelvisY: 0.165 * TK, sitChestRaise: 0.008, liePelvisY: 0.112 * TK, lieChestY: 0.146 * TK },
};

export const BREEDS: Record<Breed['key'], Breed> = { retriever: RETRIEVER, terrier: TERRIER, cat: CAT };
