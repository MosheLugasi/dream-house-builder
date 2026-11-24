/**
 * Songs and rules of the dance game (pure, testable): a generated song (drums, bass, chords, a lead
 * melody) at three levels, the arrow chart derived from the music, timing judgement and scoring.
 * Times are in BEATS inside a song; seconds = beats × 60 / bpm.
 */

export type Lane = 0 | 1 | 2 | 3; // ← ↓ ↑ →
export const LANE_ARROWS = ['⬅', '⬇', '⬆', '➡'];

export interface Note {
  /** beat */
  t: number;
  lane: Lane;
}

export type Inst = 'kick' | 'snare' | 'hat' | 'clap' | 'bass' | 'chord' | 'lead' | 'crash';

export interface MusicEvent {
  t: number;
  inst: Inst;
  /** midi note(s) */
  midi?: number[];
  /** length in beats */
  len?: number;
  vel?: number;
}

export interface Song {
  name: string;
  level: 0 | 1 | 2;
  bpm: number;
  /** total beats (including the outro) */
  beats: number;
  music: MusicEvent[];
  notes: Note[];
  /** beat where the arrows start (after the intro) */
  firstBeat: number;
}

export const LEVELS = [
  { name: 'קל', song: 'שמש בשכונה', bpm: 96, lead: 2.0 },
  { name: 'בינוני', song: 'ריקוד על הגג', bpm: 112, lead: 1.7 },
  { name: 'קשה', song: 'מסיבת כוכבים', bpm: 128, lead: 1.45 },
] as const;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// chord roots (midi) and qualities of three progressions
const PROGS: number[][][] = [
  // C G Am F
  [
    [48, 52, 55],
    [43, 47, 50],
    [45, 48, 52],
    [41, 45, 48],
  ],
  // Am F C G
  [
    [45, 48, 52],
    [41, 45, 48],
    [48, 52, 55],
    [43, 47, 50],
  ],
  // Fm-ish electro: Dm Bb F C
  [
    [50, 53, 57],
    [46, 50, 53],
    [41, 45, 48],
    [48, 52, 55],
  ],
];
const SCALES: number[][] = [
  [60, 62, 64, 67, 69, 72, 74, 76],
  [57, 60, 62, 64, 67, 69, 72, 74],
  [62, 65, 67, 69, 72, 74, 77, 79],
];

const INTRO_BARS = 2;
const SECTION_BARS = 8;
const OUTRO_BARS = 2;

/**
 * Generate a song for a level. Structure: intro · verse · chorus · verse · chorus · outro.
 * The arrows follow the lead melody (higher notes → lanes further right) and, on harder levels,
 * the off-beats and some double arrows.
 */
export function makeSong(level: 0 | 1 | 2, seed = 7): Song {
  const L = LEVELS[level];
  const r = mulberry(seed * 31 + level * 101);
  const prog = PROGS[level];
  const scale = SCALES[level];
  const music: MusicEvent[] = [];
  const notes: Note[] = [];
  const bars = INTRO_BARS + SECTION_BARS * 4 + OUTRO_BARS;
  const beats = bars * 4;

  // a two-bar rhythm motif for verse and chorus (eighth-note grid: 16 slots)
  const motif = (density: number): number[] => {
    const slots: number[] = [];
    for (let i = 0; i < 16; i++) {
      const strong = i % 4 === 0;
      const p = strong ? 0.85 : i % 2 === 0 ? density * 0.8 : density * 0.45;
      if (r() < p) slots.push(i);
    }
    if (!slots.includes(0)) slots.unshift(0);
    return slots;
  };
  const density = [0.22, 0.55, 0.85][level];
  const verseRhythm = motif(density * 0.85);
  const chorusRhythm = motif(density);
  // melodic contour per motif note: a walk on the scale
  const contour = (n: number): number[] => {
    const out: number[] = [];
    let d = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      d += Math.floor(r() * 5) - 2;
      d = Math.max(0, Math.min(scale.length - 1, d));
      out.push(d);
    }
    return out;
  };
  const verseMel = contour(verseRhythm.length);
  const chorusMel = contour(chorusRhythm.length).map((d) => Math.min(scale.length - 1, d + 1));

  for (let bar = 0; bar < bars; bar++) {
    const b0 = bar * 4;
    const chord = prog[bar % 4];
    const intro = bar < INTRO_BARS;
    const outro = bar >= bars - OUTRO_BARS;
    const sectionIdx = Math.floor((bar - INTRO_BARS) / SECTION_BARS);
    const chorus = !intro && !outro && sectionIdx % 2 === 1;
    // drums
    for (let beat = 0; beat < 4; beat++) {
      const t = b0 + beat;
      if (!(outro && bar === bars - 1 && beat > 0)) music.push({ t, inst: 'kick', vel: beat === 0 ? 1 : 0.85 });
      if (!intro && (beat === 1 || beat === 3)) music.push({ t, inst: chorus ? 'clap' : 'snare', vel: 0.8 });
      if (!(outro && bar === bars - 1)) {
        music.push({ t, inst: 'hat', vel: 0.35 });
        music.push({ t: t + 0.5, inst: 'hat', vel: chorus ? 0.55 : 0.4 });
      }
      if (level === 2 && chorus) music.push({ t: t + 0.75, inst: 'hat', vel: 0.25 });
    }
    if (bar === INTRO_BARS || (chorus && (bar - INTRO_BARS) % SECTION_BARS === 0) || bar === bars - 1) music.push({ t: b0, inst: 'crash', vel: 0.7 });
    // bass: root on the beat, octave bounce on the off-beats
    for (let e = 0; e < 8; e++) {
      const t = b0 + e * 0.5;
      const root = chord[0] - 12;
      if (outro && bar === bars - 1 && e > 0) break;
      if (e % 2 === 0 || level > 0) music.push({ t, inst: 'bass', midi: [e % 2 === 1 && level > 0 ? root + 12 : root], len: 0.45, vel: e % 2 === 0 ? 0.9 : 0.6 });
    }
    // chords: a pad on every bar (stabs in the chorus)
    if (chorus) for (const s of [0, 1.5, 2.5]) music.push({ t: b0 + s, inst: 'chord', midi: chord.map((m) => m + 12), len: 0.6, vel: 0.55 });
    else music.push({ t: b0, inst: 'chord', midi: chord.map((m) => m + 12), len: 3.8, vel: 0.45 });
    if (intro || outro) continue;
    // lead melody (two-bar motif, the second bar of the pair answers a step higher)
    const rhythm = chorus ? chorusRhythm : verseRhythm;
    const mel = chorus ? chorusMel : verseMel;
    const half = (bar - INTRO_BARS) % 2;
    const lift = (Math.floor((bar - INTRO_BARS) / 2) % 4 === 3 ? 1 : 0) + (sectionIdx >= 2 ? 1 : 0);
    rhythm.forEach((slot, i) => {
      if ((slot < 8) !== (half === 0)) return;
      const t = b0 + (slot % 8) * 0.5;
      const deg = Math.min(scale.length - 1, mel[i] + lift);
      // fit the note to the chord on strong beats
      let midi = scale[deg];
      if (slot % 4 === 0) {
        const chordPcs = chord.map((m) => m % 12);
        if (!chordPcs.includes(midi % 12)) midi = scale[Math.max(0, deg - 1)];
      }
      const next = rhythm[i + 1] ?? 16;
      music.push({ t, inst: 'lead', midi: [midi], len: Math.min(1.5, Math.max(0.4, (next - slot) * 0.5 - 0.1)), vel: 0.6 });
      // the arrow for this note
      const onBeat = slot % 2 === 0;
      if (level === 0 && !onBeat) return;
      const lane = laneFor(deg, i, scale.length);
      notes.push({ t, lane });
      // harder levels: a second arrow on strong chorus beats (a "jump")
      if (level === 2 && chorus && slot % 8 === 0 && r() < 0.6) notes.push({ t, lane: ((lane + 2) % 4) as Lane });
    });
    // level 0: keep a steady beat where the melody rests
    if (level === 0) {
      for (let beat = 0; beat < 4; beat += 2) {
        const t = b0 + beat;
        if (!notes.some((n) => Math.abs(n.t - t) < 0.01)) notes.push({ t, lane: (beat === 0 ? 1 : 2) as Lane });
      }
    }
  }
  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  // never two arrows of the same lane too close (unplayable)
  const minGap = [1, 0.5, 0.5][level];
  const clean: Note[] = [];
  for (const n of notes) {
    const prev = [...clean].reverse().find((p) => p.lane === n.lane);
    if (prev && n.t - prev.t < minGap - 1e-6) continue;
    if (clean.some((p) => p.t === n.t && p.lane === n.lane)) continue;
    clean.push(n);
  }
  music.sort((a, b) => a.t - b.t);
  return { name: L.song, level, bpm: L.bpm, beats, music, notes: clean, firstBeat: INTRO_BARS * 4 };
}

/** pitch → lane: low notes left, high notes right, with a little variety */
function laneFor(deg: number, i: number, n: number): Lane {
  const base = Math.floor((deg / n) * 4);
  const wobble = i % 5 === 3 ? 1 : 0;
  return (Math.max(0, Math.min(3, base + wobble)) % 4) as Lane;
}

// ---- judging and scoring --------------------------------------------------------------------

export type Judgement = 'perfect' | 'good' | 'miss';
export const PERFECT = 0.055;
export const GOOD = 0.12;
/** a note is missed when it is this late */
export const LATE = 0.16;

export function judge(deltaSec: number): Judgement | null {
  const d = Math.abs(deltaSec);
  if (d <= PERFECT) return 'perfect';
  if (d <= GOOD) return 'good';
  return null;
}

export const JUDGE_TEXT: Record<Judgement, string> = { perfect: 'מושלם!', good: 'טוב', miss: 'פספוס' };
export const JUDGE_COLOR: Record<Judgement, string> = { perfect: '#ffd84a', good: '#5be38a', miss: '#ff6b5a' };

/** ×1 … ×4: one step every 10 notes in a row */
export const multiplier = (combo: number): number => 1 + Math.min(3, Math.floor(combo / 10));

export function notePoints(j: Judgement, combo: number): number {
  if (j === 'miss') return 0;
  return (j === 'perfect' ? 100 : 50) * multiplier(combo);
}

export interface Tally {
  score: number;
  combo: number;
  best: number;
  perfect: number;
  good: number;
  miss: number;
}

export const newTally = (): Tally => ({ score: 0, combo: 0, best: 0, perfect: 0, good: 0, miss: 0 });

/** apply one judgement (combo first, so the 10th note in a row already scores ×2) */
export function tally(t: Tally, j: Judgement): number {
  if (j === 'miss') {
    t.miss++;
    t.combo = 0;
    return 0;
  }
  t.combo++;
  t.best = Math.max(t.best, t.combo);
  if (j === 'perfect') t.perfect++;
  else t.good++;
  const p = notePoints(j, t.combo);
  t.score += p;
  return p;
}

/** the best possible score of a song */
export function maxScore(song: Song): number {
  const t = newTally();
  for (let i = 0; i < song.notes.length; i++) tally(t, 'perfect');
  return t.score;
}

/** 0..1 accuracy for the result card */
export function accuracy(t: Tally): number {
  const n = t.perfect + t.good + t.miss;
  return n ? (t.perfect + t.good * 0.5) / n : 0;
}

export function grade(acc: number): string {
  return acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : acc >= 0.5 ? 'C' : 'D';
}

export const beatsToSec = (song: Song, beats: number): number => (beats * 60) / song.bpm;
