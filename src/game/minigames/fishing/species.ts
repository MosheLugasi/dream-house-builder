/**
 * The fish of the lake and the rules of a catch (pure, testable): which fish bites (time of day,
 * cast distance, rarity), how much it weighs, how many points it is worth, how it fights on the line,
 * and the player's persistent species album (localStorage).
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
/** when a fish bites: any time, by day, at night, at dawn (5–8) or at dusk (17–20) */
export type When = 'any' | 'day' | 'night' | 'dawn' | 'dusk' | 'twilight';

export interface Species {
  id: string;
  name: string;
  rarity: Rarity;
  /** kg */
  weight: [number, number];
  /** cm */
  length: [number, number];
  when: When;
  /** prefers casts far from the pier */
  far?: boolean;
  /** body colours for the 3D model: back, belly, fins/marks */
  colors: [string, string, string];
  /** body shape: 1 = normal, >1 longer (eel), <1 rounder */
  shape?: number;
  /** a found object rather than a fish */
  junk?: boolean;
}

export const RARITY: Record<Rarity, { label: string; stars: string; mult: number; weight: number; color: string }> = {
  common: { label: 'נפוץ', stars: '★', mult: 1, weight: 50, color: '#cfd8dc' },
  uncommon: { label: 'לא שכיח', stars: '★★', mult: 2, weight: 26, color: '#5be38a' },
  rare: { label: 'נדיר', stars: '★★★', mult: 3, weight: 12, color: '#4ab3ff' },
  epic: { label: 'אגדי למחצה', stars: '★★★★', mult: 5, weight: 4.5, color: '#c27dff' },
  legendary: { label: 'אגדה!', stars: '★★★★★', mult: 10, weight: 1.2, color: '#ffcf3a' },
};

export const SPECIES: Species[] = [
  { id: 'tilapia', name: 'אמנון', rarity: 'common', weight: [0.3, 1.6], length: [18, 40], when: 'any', colors: ['#7d8a78', '#d9ddd2', '#5b6a58'] },
  { id: 'carp', name: 'קרפיון', rarity: 'common', weight: [1, 6], length: [35, 75], when: 'any', colors: ['#a57f3a', '#e8d5a2', '#7a5a28'], shape: 0.9 },
  { id: 'bluegill', name: 'שמשון כחול', rarity: 'common', weight: [0.1, 0.5], length: [12, 24], when: 'day', colors: ['#3d6f99', '#f0b85a', '#2a4a6a'], shape: 0.75 },
  { id: 'mullet', name: 'בורי', rarity: 'common', weight: [0.4, 2.2], length: [25, 55], when: 'day', colors: ['#8fa2b3', '#eef2f4', '#5d6f80'], shape: 1.15 },
  { id: 'sardine', name: 'לבנון הכנרת', rarity: 'common', weight: [0.03, 0.12], length: [8, 15], when: 'any', colors: ['#aab9c4', '#f4f7f9', '#7a8c99'], shape: 1.1 },
  { id: 'perch', name: 'אוקונוס', rarity: 'uncommon', weight: [0.3, 1.6], length: [20, 42], when: 'day', colors: ['#8c9a33', '#e8e3b0', '#3d4a1a'] },
  { id: 'trout', name: 'פורל קשת', rarity: 'uncommon', weight: [0.5, 3.2], length: [30, 65], when: 'dawn', colors: ['#7f9470', '#f2e6e0', '#d9667a'], shape: 1.15 },
  { id: 'catfish', name: 'שפמנון', rarity: 'uncommon', weight: [2, 12], length: [50, 110], when: 'night', colors: ['#4a4636', '#c8c0a6', '#2f2c22'], shape: 1.3 },
  { id: 'salmon', name: 'סלמון', rarity: 'uncommon', weight: [2, 8], length: [50, 90], when: 'twilight', far: true, colors: ['#8a6f6a', '#f3d9cf', '#c96d5a'], shape: 1.15 },
  { id: 'eel', name: 'צלופח', rarity: 'rare', weight: [0.5, 3], length: [50, 120], when: 'night', colors: ['#3f4a2c', '#c9c79a', '#2a3120'], shape: 3.2 },
  { id: 'koi', name: 'קוי יפני', rarity: 'rare', weight: [1, 5], length: [35, 70], when: 'day', colors: ['#f08a24', '#fbf4ea', '#e0402f'], shape: 0.95 },
  { id: 'pike', name: 'זאב המים', rarity: 'rare', weight: [2, 11], length: [50, 120], when: 'twilight', far: true, colors: ['#5d7a35', '#e6e8c8', '#3a4f1f'], shape: 1.6 },
  { id: 'goldfish', name: 'דג זהב ענק', rarity: 'epic', weight: [0.6, 2.4], length: [25, 45], when: 'any', colors: ['#ffb020', '#ffe2a0', '#ff7a18'], shape: 0.85 },
  { id: 'wels', name: 'שפמנון ענק', rarity: 'epic', weight: [15, 42], length: [140, 230], when: 'night', far: true, colors: ['#34352d', '#bdb59d', '#22231d'], shape: 1.45 },
  { id: 'rainbow', name: 'דג הקשת המוזהב', rarity: 'legendary', weight: [3, 8], length: [55, 85], when: 'twilight', far: true, colors: ['#ffd84a', '#fff6d6', '#ff5fa2'], shape: 1.1 },
  { id: 'boot', name: 'נעל ישנה', rarity: 'common', weight: [0.4, 0.9], length: [26, 32], when: 'any', colors: ['#5a4632', '#3a2d20', '#8a7356'], junk: true },
  { id: 'bottle', name: 'בקבוק עם מכתב', rarity: 'rare', weight: [0.3, 0.6], length: [22, 30], when: 'any', colors: ['#7fc8a9', '#e9f7ef', '#f4e3b5'], junk: true },
];

export const FISH_COUNT = SPECIES.filter((s) => !s.junk).length;

export const speciesById = (id: string): Species | undefined => SPECIES.find((s) => s.id === id);

/** Does a species bite at this hour (0..24)? */
export function bitesAt(s: Species, hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  const day = h >= 7 && h < 18.5;
  const night = h >= 20 || h < 5;
  const dawn = h >= 5 && h < 8.5;
  const dusk = h >= 17 && h < 20.5;
  switch (s.when) {
    case 'any':
      return true;
    case 'day':
      return day;
    case 'night':
      return night;
    case 'dawn':
      return dawn;
    case 'dusk':
      return dusk;
    case 'twilight':
      return dawn || dusk;
  }
}

/** Relative chance of each species biting right now. `far` = 0 (at the pier) … 1 (longest cast). */
export function biteWeights(hour: number, far: number): Array<{ s: Species; w: number }> {
  const out: Array<{ s: Species; w: number }> = [];
  for (const s of SPECIES) {
    if (!bitesAt(s, hour)) continue;
    let w = RARITY[s.rarity].weight;
    // long casts reach the big, rare fish
    const rare = s.rarity !== 'common';
    w *= rare ? 0.6 + far * 1.2 : 1.25 - far * 0.5;
    if (s.far) w *= 0.25 + far * 1.6;
    if (s.junk) w *= 0.35;
    out.push({ s, w });
  }
  return out;
}

export interface Catch {
  species: Species;
  /** kg */
  weight: number;
  /** cm */
  length: number;
}

/** Pick the fish that bites (and its size). */
export function rollCatch(hour: number, far: number, random: () => number): Catch {
  const ws = biteWeights(hour, far);
  const total = ws.reduce((a, b) => a + b.w, 0);
  let r = random() * total;
  let s = ws[ws.length - 1].s;
  for (const e of ws) {
    r -= e.w;
    if (r <= 0) {
      s = e.s;
      break;
    }
  }
  // size: skewed towards the small end, bigger on long casts
  const u = Math.min(1, Math.pow(random(), 1.6 - far * 0.6));
  const weight = s.weight[0] + (s.weight[1] - s.weight[0]) * u;
  const length = s.length[0] + (s.length[1] - s.length[0]) * Math.pow(u, 0.7);
  return { species: s, weight: Math.round(weight * 100) / 100, length: Math.round(length) };
}

/** Points for a catch: rarity × (20 + 30·√kg); junk is a small fixed prize. */
export function catchPoints(c: Catch): number {
  if (c.species.junk) return c.species.id === 'bottle' ? 60 : 5;
  return Math.round(RARITY[c.species.rarity].mult * (20 + 30 * Math.sqrt(c.weight)));
}

/** How hard the fish fights, 0.2 … 1. */
export function fightStrength(c: Catch): number {
  if (c.species.junk) return 0.12;
  const r = { common: 0, uncommon: 0.12, rare: 0.22, epic: 0.32, legendary: 0.4 }[c.species.rarity];
  return Math.min(1, 0.2 + r + Math.min(0.45, Math.sqrt(c.weight) * 0.12));
}

/** seconds you have to strike after the bite */
export const strikeWindow = (c: Catch): number => (c.species.rarity === 'common' ? 0.95 : c.species.rarity === 'uncommon' ? 0.85 : 0.72);

// ---- the fight on the line ----------------------------------------------------------------

export interface Fight {
  /** meters of line out */
  dist: number;
  /** 0 … 1 (1 = the line snaps) */
  tension: number;
  /** 0 … 1 */
  stamina: number;
  /** the fish swims: -1 left, 1 right, 0 straight away */
  dir: number;
  /** pulling hard right now (a run) */
  run: boolean;
  timer: number;
  /** seconds of slack line */
  slack: number;
  maxDist: number;
}

export type FightEnd = 'landed' | 'snapped' | 'escaped' | null;

export function startFight(dist: number, random: () => number): Fight {
  return { dist, tension: 0.3, stamina: 1, dir: random() < 0.5 ? -1 : 1, run: true, timer: 1 + random(), slack: 0, maxDist: dist + 9 };
}

/**
 * One step of the fight. `reel` = Space held, `steer` = A/D (-1/0/1). Following the fish's direction
 * with A/D keeps the tension down and tires it faster; pulling against it is dangerous.
 */
export function stepFight(f: Fight, dt: number, reel: boolean, steer: number, strength: number, random: () => number): FightEnd {
  f.timer -= dt;
  if (f.timer <= 0) {
    // alternate runs and rests; runs get shorter as the fish tires
    f.run = !f.run;
    f.timer = f.run ? 0.9 + random() * 1.6 * f.stamina : 0.7 + random() * 1.3;
    if (f.run) f.dir = random() < 0.2 ? 0 : random() < 0.5 ? -1 : 1;
  }
  const pull = strength * (f.run ? 1 : 0.25) * (0.35 + 0.65 * f.stamina);
  const follow = f.dir !== 0 && steer === f.dir;
  const against = f.dir !== 0 && steer === -f.dir;
  if (reel) {
    let rise = 0.16 + pull * 0.95;
    if (follow) rise *= 0.45;
    if (against) rise += 0.35;
    f.tension += rise * dt;
    f.dist -= (1.7 - pull * 1.1) * dt * (follow ? 1.15 : 1);
    f.slack = 0;
  } else {
    f.tension -= (0.55 - pull * 0.25) * dt;
    f.dist += pull * 1.4 * dt;
    if (!f.run) f.slack += dt;
    else f.slack = 0;
    if (against) f.tension += 0.2 * dt;
  }
  f.tension = Math.max(0, f.tension);
  const tire = 0.045 + (reel ? 0.04 : 0) + (follow ? 0.07 : 0);
  f.stamina = Math.max(0, f.stamina - tire * dt);
  if (f.tension >= 1) return 'snapped';
  if (f.dist <= 1.2) return 'landed';
  if (f.dist > f.maxDist) return 'snapped';
  if (f.slack > 3.2 && f.tension < 0.08) return 'escaped';
  return null;
}

// ---- the album (persistent) ------------------------------------------------------------------

export interface Album {
  /** species id → how many caught and the heaviest (kg) */
  species: Record<string, { n: number; best: number }>;
}

const KEY = 'dhb.fishing.album';

export function loadAlbum(): Album {
  try {
    if (typeof localStorage === 'undefined') return { species: {} };
    const raw = localStorage.getItem(KEY);
    const a = raw ? (JSON.parse(raw) as Album) : null;
    return a && typeof a.species === 'object' && a.species ? a : { species: {} };
  } catch {
    return { species: {} };
  }
}

export function saveAlbum(a: Album): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable */
  }
}

/** Add a catch; returns true when the species is new to the album. */
export function addToAlbum(a: Album, c: Catch): boolean {
  const e = a.species[c.species.id];
  if (!e) {
    a.species[c.species.id] = { n: 1, best: c.weight };
    return true;
  }
  e.n++;
  e.best = Math.max(e.best, c.weight);
  return false;
}

export const albumFishCount = (a: Album): number => SPECIES.filter((s) => !s.junk && a.species[s.id]).length;

export const fmtKg = (kg: number): string => (kg < 1 ? `${Math.round(kg * 1000)} גרם` : `${kg.toFixed(1)} ק״ג`);
