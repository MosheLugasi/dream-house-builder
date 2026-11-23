import type { BodyType } from '../characterTypes';

/** Proportions of one body type. Meters, standing, feet on y = 0, facing +Z; the character's LEFT is +X. */
export interface Spec {
  body: BodyType;
  /** stature (top of the skull, shoes on) */
  H: number;
  child: boolean;
  female: boolean;
  sole: number;
  ankleY: number;
  kneeY: number;
  hipY: number;
  hipX: number;
  spineY: number;
  chestY: number;
  neckY: number;
  /** head pivot (top of the neck) */
  headY: number;
  chinY: number;
  /** chin → crown */
  headH: number;
  shoulderY: number;
  shoulderX: number;
  upperArm: number;
  foreArm: number;
  hand: number;
  footLen: number;
  footW: number;
  r: {
    thighTop: number;
    thighMid: number;
    knee: number;
    calf: number;
    ankle: number;
    delt: number;
    bicep: number;
    elbow: number;
    fore: number;
    wrist: number;
    neck: number;
  };
  /** torso cross sections: [y, half width, front depth, back depth, super-ellipse exponent] */
  torso: number[][];
  face: Face;
}

/** Head / face shape controls, in head units (chin = 0, crown = 1). */
export interface Face {
  /** jaw half width at the jaw angle */
  jaw: number;
  /** chin half width */
  chin: number;
  /** cheek fullness */
  cheek: number;
  eyeY: number;
  eyeX: number;
  /** half width of the open eye */
  eyeR: number;
  /** nose length / projection scale */
  nose: number;
  noseY: number;
  mouthY: number;
  mouthW: number;
  lip: number;
  /** eyebrow thickness */
  brow: number;
  lash: number;
  /** cranium half width */
  skullW: number;
}

const MAN: Spec = {
  body: 'man',
  H: 1.78,
  child: false,
  female: false,
  sole: 0.028,
  ankleY: 0.1,
  kneeY: 0.515,
  hipY: 0.945,
  hipX: 0.09,
  spineY: 1.075,
  chestY: 1.25,
  neckY: 1.505,
  headY: 1.588,
  chinY: 1.548,
  headH: 0.232,
  shoulderY: 1.438,
  shoulderX: 0.186,
  upperArm: 0.3,
  foreArm: 0.262,
  hand: 0.186,
  footLen: 0.272,
  footW: 0.102,
  r: { thighTop: 0.086, thighMid: 0.074, knee: 0.055, calf: 0.057, ankle: 0.037, delt: 0.056, bicep: 0.046, elbow: 0.038, fore: 0.041, wrist: 0.029, neck: 0.056 },
  torso: [
    [0.85, 0.098, 0.07, 0.085, 2.1],
    [0.895, 0.166, 0.094, 0.116, 2.25],
    [0.945, 0.176, 0.1, 0.12, 2.3],
    [1.015, 0.168, 0.105, 0.108, 2.3],
    [1.09, 0.152, 0.1, 0.093, 2.3],
    [1.2, 0.168, 0.11, 0.1, 2.4],
    [1.3, 0.182, 0.12, 0.108, 2.45],
    [1.385, 0.186, 0.116, 0.11, 2.45],
    [1.47, 0.166, 0.09, 0.098, 2.3],
    [1.497, 0.112, 0.074, 0.088, 2.2],
    [1.517, 0.066, 0.06, 0.068, 2.0],
  ],
  face: { jaw: 0.262, chin: 0.125, cheek: 0.0, eyeY: 0.475, eyeX: 0.142, eyeR: 0.063, nose: 1.05, noseY: 0.32, mouthY: 0.2, mouthW: 0.108, lip: 0.75, brow: 1.25, lash: 0.6, skullW: 0.335 },
};

const WOMAN: Spec = {
  body: 'woman',
  H: 1.66,
  child: false,
  female: true,
  sole: 0.026,
  ankleY: 0.094,
  kneeY: 0.482,
  hipY: 0.885,
  hipX: 0.086,
  spineY: 1.005,
  chestY: 1.165,
  neckY: 1.402,
  headY: 1.48,
  chinY: 1.44,
  headH: 0.22,
  shoulderY: 1.345,
  shoulderX: 0.162,
  upperArm: 0.276,
  foreArm: 0.24,
  hand: 0.17,
  footLen: 0.245,
  footW: 0.09,
  r: { thighTop: 0.083, thighMid: 0.07, knee: 0.05, calf: 0.052, ankle: 0.033, delt: 0.046, bicep: 0.038, elbow: 0.032, fore: 0.034, wrist: 0.025, neck: 0.046 },
  torso: [
    [0.792, 0.094, 0.066, 0.082, 2.1],
    [0.838, 0.164, 0.09, 0.116, 2.2],
    [0.885, 0.177, 0.097, 0.122, 2.25],
    [0.945, 0.166, 0.1, 0.108, 2.25],
    [1.03, 0.13, 0.086, 0.083, 2.2],
    [1.11, 0.14, 0.1, 0.088, 2.3],
    [1.19, 0.151, 0.122, 0.093, 2.35],
    [1.27, 0.156, 0.106, 0.095, 2.35],
    [1.374, 0.144, 0.078, 0.086, 2.3],
    [1.397, 0.096, 0.064, 0.076, 2.2],
    [1.416, 0.054, 0.05, 0.056, 2.0],
  ],
  face: { jaw: 0.252, chin: 0.11, cheek: 0.35, eyeY: 0.465, eyeX: 0.144, eyeR: 0.069, nose: 0.9, noseY: 0.315, mouthY: 0.195, mouthW: 0.1, lip: 1.25, brow: 0.8, lash: 1.3, skullW: 0.335 },
};

const KID: Spec = {
  body: 'girl',
  H: 1.4,
  child: true,
  female: true,
  sole: 0.024,
  ankleY: 0.082,
  kneeY: 0.39,
  hipY: 0.712,
  hipX: 0.068,
  spineY: 0.815,
  chestY: 0.945,
  neckY: 1.138,
  headY: 1.212,
  chinY: 1.184,
  headH: 0.216,
  shoulderY: 1.09,
  shoulderX: 0.126,
  upperArm: 0.226,
  foreArm: 0.196,
  hand: 0.142,
  footLen: 0.215,
  footW: 0.082,
  r: { thighTop: 0.065, thighMid: 0.056, knee: 0.043, calf: 0.044, ankle: 0.03, delt: 0.039, bicep: 0.033, elbow: 0.028, fore: 0.029, wrist: 0.023, neck: 0.04 },
  torso: [
    [0.638, 0.074, 0.052, 0.064, 2.1],
    [0.672, 0.122, 0.076, 0.09, 2.2],
    [0.712, 0.13, 0.082, 0.094, 2.25],
    [0.762, 0.126, 0.086, 0.088, 2.25],
    [0.84, 0.118, 0.086, 0.079, 2.25],
    [0.92, 0.122, 0.088, 0.081, 2.3],
    [1.0, 0.128, 0.09, 0.084, 2.35],
    [1.055, 0.13, 0.086, 0.084, 2.35],
    [1.114, 0.112, 0.066, 0.074, 2.3],
    [1.133, 0.076, 0.054, 0.064, 2.2],
    [1.149, 0.046, 0.043, 0.048, 2.0],
  ],
  face: { jaw: 0.268, chin: 0.118, cheek: 0.8, eyeY: 0.44, eyeX: 0.15, eyeR: 0.076, nose: 0.75, noseY: 0.3, mouthY: 0.185, mouthW: 0.092, lip: 1.0, brow: 0.8, lash: 1.1, skullW: 0.345 },
};

/** Uniformly scale every length of a spec. */
function scaled(s: Spec, k: number, patch: Partial<Spec>): Spec {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(s)) {
    if (typeof v === 'number') out[key] = v * k;
    else out[key] = v;
  }
  out.r = Object.fromEntries(Object.entries(s.r).map(([key, v]) => [key, v * k]));
  out.torso = s.torso.map((t) => [t[0] * k, t[1] * k, t[2] * k, t[3] * k, t[4]]);
  return { ...(out as unknown as Spec), ...patch };
}

const SPECS: Record<BodyType, Spec> = {
  girl: KID,
  boy: scaled(KID, 1.42 / 1.4, {
    body: 'boy',
    female: false,
    face: { ...KID.face, lash: 0.6, brow: 1.0, lip: 0.8, jaw: 0.272, chin: 0.124 },
  }),
  woman: WOMAN,
  man: MAN,
};

export function specOf(body: BodyType): Spec {
  return SPECS[body] ?? SPECS.girl;
}
