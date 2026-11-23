/**
 * Offline self-test: renders every sound of the engine on `OfflineAudioContext`s (same graph as the live engine),
 * measures it and checks a few hard rules (not silent, no clipping, no NaN, no DC, one-shots end in time, nothing
 * leaks). Runs in the browser – see `selftest.cjs` for the headless runner.
 */
import { createEngine, type EngineCore } from '../../src/audio/core';
import { SFX_INFO } from '../../src/audio/sfx';
import type { Ambience, Loop, Sfx, Surface, VehicleSound } from '../../src/audio/types';
import { mulberry32 } from '../../src/audio/util';

export const SR = 44100;
const STEP = 0.05;
const RAW_GAIN = 0.1;
/**
 * One-shots are triggered this long after the context started and the lead-in is cut off again: Chromium's
 * DynamicsCompressor ducks the first ~200 ms after it is created, which would make short sounds measure ~10 dB low.
 */
export const WARM = 0.4;
/** a sound on its own must stay below this (pre-limiter) so that the limiter is only a safety net */
const SINGLE_PEAK_DB = -6;

export const ALL_SFX = Object.keys(SFX_INFO) as Sfx[];
export const ALL_SURFACES: Surface[] = ['wood', 'tile', 'stone', 'carpet', 'grass', 'asphalt', 'sand', 'water', 'metal'];
export const ALL_LOOPS: Loop[] = ['tv', 'tap', 'shower', 'washing', 'fan', 'stove', 'fountain', 'swing'];
export const ALL_VEHICLES: VehicleSound['kind'][] = ['car', 'bus', 'bicycle', 'scooter', 'other'];
export const VEHICLE_TOP: Record<VehicleSound['kind'], number> = { car: 16, bus: 12, bicycle: 6, scooter: 4, other: 5 };

export interface Row {
  group: string;
  name: string;
  /** seconds until the signal stays below -60 dBFS */
  len: number;
  peakDb: number;
  rmsDb: number;
  /** A-weighted level over the measured window */
  laDb: number;
  centroid: number;
  dc: number;
  bad: number;
  /** largest sample-to-sample jump (click detector), linear */
  maxStep: number;
  maxVoices: number;
  maxNodes: number;
  endNodes: number;
  endVoices: number;
  fail: string[];
}

type Script = (e: EngineCore, t: number) => void;

interface Rendered {
  buf: AudioBuffer;
  maxVoices: number;
  maxNodes: number;
  endNodes: number;
  endVoices: number;
}

/** Renders `dur` seconds; `script` runs at t = 0 and then every 50 ms of audio time, like a (slow) game loop. */
export async function render(dur: number, script: Script, seed = 1, raw = false): Promise<Rendered> {
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const eng = createEngine(ctx, { rng: mulberry32(seed) });
  // "raw" renders run 20 dB down so the limiter never engages, and are scaled back up afterwards: that is the
  // level a sound has on its own, before the safety net.
  if (raw) eng.setMaster(RAW_GAIN, 0);
  let maxVoices = 0;
  let maxNodes = 0;
  const tickAt = (t: number) => {
    script(eng, t);
    eng.pump();
    maxVoices = Math.max(maxVoices, eng.stats.voices);
    maxNodes = Math.max(maxNodes, eng.stats.nodes);
  };
  for (let i = 1; i * STEP < dur - 0.01; i++) {
    const t = i * STEP;
    void ctx.suspend(t).then(() => {
      tickAt(t);
      void ctx.resume();
    });
  }
  tickAt(0);
  const buf = await ctx.startRendering();
  if (raw) {
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] /= RAW_GAIN;
    }
  }
  // let pending 'ended' events arrive, then give the engine a last chance to free faded-out patches
  await new Promise((r) => setTimeout(r, 40));
  eng.pump();
  await new Promise((r) => setTimeout(r, 0));
  const res = { buf, maxVoices, maxNodes, endNodes: eng.stats.nodes, endVoices: eng.stats.voices };
  eng.dispose();
  return res;
}

/** copy of `buf` without its first `start` seconds */
export function cut(r: Rendered, start = WARM): Rendered {
  const off = Math.round(start * SR);
  const out = new AudioBuffer({ numberOfChannels: r.buf.numberOfChannels, length: Math.max(1, r.buf.length - off), sampleRate: SR });
  for (let c = 0; c < r.buf.numberOfChannels; c++) out.getChannelData(c).set(r.buf.getChannelData(c).subarray(off));
  return { ...r, buf: out };
}

// ---------------------------------------------------------------- analysis

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

function aWeight(f: number): number {
  const f2 = f * f;
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return ra * 1.2589; // +2 dB normalisation at 1 kHz
}

const db = (x: number) => (x > 1e-10 ? 20 * Math.log10(x) : -200);

export interface Metrics {
  len: number;
  peakDb: number;
  rmsDb: number;
  laDb: number;
  centroid: number;
  dc: number;
  bad: number;
  maxStep: number;
  first: number;
}

/** Measures `buf`; level / spectrum figures use [from, to) if given, otherwise the part above -60 dBFS. */
export function analyze(buf: AudioBuffer, from?: number, to?: number): Metrics {
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = buf.length;
  let peak = 0;
  let bad = 0;
  let first = -1;
  let last = -1;
  let maxStep = 0;
  for (let i = 0; i < n; i++) {
    const l = L[i];
    const r = R[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) {
      bad++;
      continue;
    }
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
    if (a > 0.001) {
      if (first < 0) first = i;
      last = i;
    }
    if (i > 0) {
      const d = Math.max(Math.abs(l - L[i - 1]), Math.abs(r - R[i - 1]));
      if (d > maxStep) maxStep = d;
    }
  }
  const a0 = from !== undefined ? Math.floor(from * SR) : Math.max(0, first);
  const a1 = to !== undefined ? Math.min(n, Math.floor(to * SR)) : last + 1;
  const count = Math.max(1, a1 - a0);
  let sq = 0;
  let sumL = 0;
  let sumR = 0;
  for (let i = a0; i < a1; i++) {
    sq += (L[i] * L[i] + R[i] * R[i]) / 2;
    sumL += L[i];
    sumR += R[i];
  }
  // spectrum (Hann, 50 % overlap) of the mono sum over the same window
  const N = 4096;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let eA = 0;
  let num = 0;
  let den = 0;
  for (let s = a0 - N / 2; s < a1; s += N / 2) {
    for (let i = 0; i < N; i++) {
      const j = s + i;
      re[i] = j >= a0 && j < a1 ? ((L[j] + R[j]) / 2) * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const f = (k * SR) / N;
      const aw = aWeight(f);
      eA += (2 * p * aw * aw) / N / 0.75;
      num += p * f;
      den += p;
    }
  }
  return {
    len: last < 0 ? 0 : (last + 1) / SR,
    first: first < 0 ? 0 : first / SR,
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sq / count)),
    laDb: db(Math.sqrt(eA / count)),
    centroid: den > 0 ? num / den : 0,
    dc: Math.max(Math.abs(sumL / count), Math.abs(sumR / count)),
    bad,
    maxStep,
  };
}

/** highest absolute sample in [from, to) seconds */
function peakIn(buf: AudioBuffer, from: number, to: number): number {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = Math.floor(from * SR); i < Math.min(d.length, Math.floor(to * SR)); i++) p = Math.max(p, Math.abs(d[i]));
  }
  return p;
}

function row(group: string, name: string, r: Rendered, m: Metrics): Row {
  const fail: string[] = [];
  if (m.bad > 0) fail.push(`${m.bad} NaN/Inf samples`);
  if (m.peakDb < -70) fail.push('silent');
  return {
    group,
    name,
    len: m.len,
    peakDb: m.peakDb,
    rmsDb: m.rmsDb,
    laDb: m.laDb,
    centroid: m.centroid,
    dc: m.dc,
    bad: m.bad,
    maxStep: m.maxStep,
    maxVoices: r.maxVoices,
    maxNodes: r.maxNodes,
    endNodes: r.endNodes,
    endVoices: r.endVoices,
    fail,
  };
}

// ---------------------------------------------------------------- WAV export (mono, 22.05 kHz, 16 bit)

export function toWav(buf: AudioBuffer, from = 0, to = buf.duration): Uint8Array {
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const a0 = Math.floor(from * SR);
  const a1 = Math.min(buf.length, Math.floor(to * SR));
  const mono = (i: number) => (i < a0 || i >= a1 ? 0 : (L[i] + R[i]) / 2);
  // half-band low-pass before dropping every other sample
  const taps = [-1 / 32, 0, 9 / 32, 16 / 32, 9 / 32, 0, -1 / 32];
  const n = Math.floor((a1 - a0) / 2);
  const out = new Uint8Array(44 + n * 2);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, SR / 2, true);
  dv.setUint32(28, SR, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < taps.length; k++) s += taps[k] * mono(a0 + i * 2 + k - 3);
    dv.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(s * 32767))), true);
  }
  return out;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------------------------------------------------------------- scenarios

export function vehicleProfile(kind: VehicleSound['kind'], t: number): VehicleSound | null {
  const top = VEHICLE_TOP[kind];
  if (t < 1) return { kind, speed: 0, throttle: 0 };
  if (t < 5) {
    const k = (t - 1) / 4;
    return { kind, speed: top * (1 - Math.pow(1 - k, 2)), throttle: 1 };
  }
  if (t < 8) return { kind, speed: top, throttle: 0.35 };
  if (t < 10) return { kind, speed: top * Math.pow(1 - (t - 8) / 2, 1.5), throttle: 0 };
  return null;
}

export const AMBIENCES: Record<string, Ambience> = {
  'day-outdoor': { outdoor: 1, night: 0 },
  'night-outdoor': { outdoor: 1, night: 1 },
  'day-indoor': { outdoor: 0, night: 0 },
  'day-doorway': { outdoor: 0.5, night: 0 },
  'rain-outdoor': { outdoor: 1, night: 0, rain: 0.8 },
  'rain-indoor': { outdoor: 0, night: 0, rain: 0.8 },
  'windy-day': { outdoor: 1, night: 0, wind: 0.8 },
};

export interface SelfTestResult {
  rows: Row[];
  failures: string[];
  wavs: Record<string, string>;
  ms: number;
}

export async function runSelfTest(log: (s: string) => void = () => {}): Promise<SelfTestResult> {
  const started = performance.now();
  const rows: Row[] = [];
  const wavs: Record<string, string> = {};
  /** run `fn` once, after the warm-up; pair with `cut()` */
  const once =
    (fn: (e: EngineCore) => void): Script =>
    (e, t) => {
      if (Math.round(t / STEP) === Math.round(WARM / STEP)) fn(e);
    };
  const leakCheck = (rw: Row) => {
    if (rw.endVoices !== 0) rw.fail.push(`${rw.endVoices} voices still alive`);
    if (rw.endNodes !== 0) rw.fail.push(`${rw.endNodes} nodes still alive`);
  };

  // ---- every one-shot
  for (const s of ALL_SFX) {
    const info = SFX_INFO[s];
    const r = cut(await render(WARM + info.maxDur + 1.2, once((e) => e.play(s)), 1, true));
    const m = analyze(r.buf);
    const rw = row('sfx', s, r, m);
    if (m.peakDb > SINGLE_PEAK_DB) rw.fail.push(`peak ${m.peakDb.toFixed(1)} dBFS > ${SINGLE_PEAK_DB}`);
    if (m.len > info.maxDur) rw.fail.push(`rings for ${m.len.toFixed(2)} s (max ${info.maxDur})`);
    leakCheck(rw);
    rows.push(rw);
    if (s === 'door-open' || s === 'star' || s === 'bark' || s === 'meow') wavs[s] = b64(toWav(r.buf, 0, Math.min(r.buf.duration, m.len + 0.15)));
  }
  log('sfx done');

  // ---- footsteps: walking (0.5) and running / landing (1)
  for (const surface of ALL_SURFACES) {
    for (const strength of [0.5, 1]) {
      const r = cut(await render(WARM + 1.2, once((e) => e.footstep(surface, strength)), 3, true));
      const m = analyze(r.buf);
      const rw = row('step', `${surface}@${strength}`, r, m);
      if (m.peakDb > SINGLE_PEAK_DB) rw.fail.push(`peak ${m.peakDb.toFixed(1)} dBFS > ${SINGLE_PEAK_DB}`);
      if (m.len > 0.5) rw.fail.push(`rings for ${m.len.toFixed(2)} s (max 0.5)`);
      leakCheck(rw);
      rows.push(rw);
    }
  }
  {
    // a short walk on wood for the sample file
    const r = cut(
      await render(WARM + 2.6, (e, t) => {
        const k = Math.round(t / STEP) - Math.round(WARM / STEP);
        if (k >= 0 && k % 10 === 0 && k < 46) e.footstep('wood', 0.55);
      }),
    );
    wavs['footstep-wood'] = b64(toWav(r.buf, 0, 2.6));
  }
  log('footsteps done');

  // ---- piano
  for (const midi of [36, 48, 60, 72, 84, 96]) {
    const r = cut(await render(WARM + 4, once((e) => e.note(midi, 0.6)), 1, true));
    const m = analyze(r.buf);
    const rw = row('piano', `note ${midi}`, r, m);
    if (m.peakDb > SINGLE_PEAK_DB) rw.fail.push(`peak ${m.peakDb.toFixed(1)} dBFS > ${SINGLE_PEAK_DB}`);
    if (m.len > 2.5) rw.fail.push(`rings for ${m.len.toFixed(2)} s (max 2.5)`);
    leakCheck(rw);
    rows.push(rw);
  }
  {
    const r = cut(await render(WARM + 4.5, once((e) => [60, 64, 67, 72].forEach((n) => e.note(n, 1.6))), 1, true));
    const m = analyze(r.buf);
    const rw = row('piano', 'C major chord', r, m);
    if (m.peakDb > SINGLE_PEAK_DB) rw.fail.push(`peak ${m.peakDb.toFixed(1)} dBFS > ${SINGLE_PEAK_DB}`);
    leakCheck(rw);
    rows.push(rw);
    wavs['piano-c-major'] = b64(toWav(r.buf, 0, Math.min(4.5, m.len + 0.1)));
  }
  {
    // a fast run with long notes: the polyphony cap must damp old notes, not pile up
    const r = cut(
      await render(WARM + 6, (e, t) => {
        const k = Math.round(t / STEP) - Math.round(WARM / STEP);
        if (k >= 0 && k < 60) e.note(48 + ((k * 7) % 36), 3);
      }),
    );
    const m = analyze(r.buf);
    const rw = row('piano', 'fast run, 60 long notes', r, m);
    if (m.peakDb > -3) rw.fail.push(`peak ${m.peakDb.toFixed(1)} dBFS > -3`);
    leakCheck(rw);
    rows.push(rw);
  }
  log('piano done');

  // ---- loops: 3 s on, then off
  for (const loop of ALL_LOOPS) {
    const r = await render(5, (e, t) => e.setLoop(loop, t < 3, 1), 5, true);
    const m = analyze(r.buf, 0.6, 3);
    const rw = row('loop', loop, r, m);
    if (m.peakDb > SINGLE_PEAK_DB) rw.fail.push(`peak ${m.peakDb.toFixed(1)} dBFS > ${SINGLE_PEAK_DB}`);
    if (m.dc > 0.01) rw.fail.push(`DC ${m.dc.toFixed(4)}`);
    if (peakIn(r.buf, 4.4, 5) > 0.001) rw.fail.push('still audible 1.4 s after switching off');
    leakCheck(rw);
    rows.push(rw);
  }
  log('loops done');

  // ---- vehicles: idle → accelerate → cruise → brake → off
  for (const kind of ALL_VEHICLES) {
    const r = await render(11.6, (e, t) => e.setVehicle(vehicleProfile(kind, t)), 7, true);
    const all = analyze(r.buf, 0.3, 10);
    const rw = row('vehicle', `${kind} (whole run)`, r, all);
    if (all.peakDb > SINGLE_PEAK_DB) rw.fail.push(`peak ${all.peakDb.toFixed(1)} dBFS > ${SINGLE_PEAK_DB}`);
    if (all.dc > 0.01) rw.fail.push(`DC ${all.dc.toFixed(4)}`);
    if (peakIn(r.buf, 11, 11.6) > 0.001) rw.fail.push('still audible 1 s after stopping');
    leakCheck(rw);
    rows.push(rw);
    for (const [label, a, b] of [
      ['idle', 0.4, 1],
      ['accelerate', 1.5, 5],
      ['cruise', 5.5, 8],
    ] as const) {
      const m = analyze(r.buf, a, b);
      const sub = row('vehicle', `${kind} ${label}`, r, m);
      // a bicycle or scooter standing still is rightly silent
      if (label === 'idle' && (kind === 'bicycle' || kind === 'scooter')) sub.fail = sub.fail.filter((f) => f !== 'silent');
      rows.push(sub);
    }
    if (kind === 'car') wavs['car-accelerate'] = b64(toWav(r.buf, 0.2, 6.2));
  }
  log('vehicles done');

  // ---- ambience: 10 s, then silence()
  for (const [name, amb] of Object.entries(AMBIENCES)) {
    const r = await render(
      12.2,
      (e, t) => {
        const k = Math.round(t / STEP);
        if (k < 200) e.setAmbience(amb);
        else if (k === 200) e.silence();
      },
      11,
      true,
    );
    const m = analyze(r.buf, 1.5, 10);
    const rw = row('ambience', name, r, m);
    if (m.peakDb > SINGLE_PEAK_DB) rw.fail.push(`peak ${m.peakDb.toFixed(1)} dBFS > ${SINGLE_PEAK_DB}`);
    if (m.dc > 0.01) rw.fail.push(`DC ${m.dc.toFixed(4)}`);
    if (peakIn(r.buf, 11.7, 12.2) > 0.001) rw.fail.push('still audible 1.7 s after silence()');
    leakCheck(rw);
    rows.push(rw);
    if (name === 'day-outdoor') wavs['birds'] = b64(toWav(r.buf, 0.5, 8.5));
  }
  {
    // day → night cross-fade must not jump
    const r = await render(8, (e, t) => e.setAmbience({ outdoor: t < 5 ? 1 : 0, night: t < 2.5 ? 0 : 1 }), 13);
    const m = analyze(r.buf, 0.5, 8);
    rows.push(row('ambience', 'day→night→indoor', r, m));
  }
  log('ambience done');

  // ---- the master chain must be transparent for quiet material (compressor make-up gain compensated)
  {
    const a = cut(await render(WARM + 1, once((e) => e.play('switch-on')), 1, true));
    const b = cut(await render(WARM + 1, once((e) => e.play('switch-on')), 1, false));
    const ma = analyze(a.buf);
    const mb = analyze(b.buf);
    const rw = row('mix', 'chain unity (switch-on, limited)', b, mb);
    if (Math.abs(ma.peakDb - mb.peakDb) > 0.3) rw.fail.push(`master chain is not unity: ${mb.peakDb.toFixed(2)} vs ${ma.peakDb.toFixed(2)} dB`);
    rows.push(rw);
    // and a loud single sound must come out below -3 dBFS
    const h = cut(await render(WARM + 1.5, once((e) => e.play('bus-horn')), 1, false));
    const mh = analyze(h.buf);
    const rh = row('mix', 'bus-horn through the limiter', h, mh);
    if (mh.peakDb > -3) rh.fail.push(`peak ${mh.peakDb.toFixed(1)} dBFS > -3`);
    rows.push(rh);
  }

  // ---- stress mix: everything at once must stay under the ceiling
  {
    const hits: Sfx[] = ['horn', 'fanfare', 'bark', 'bell', 'door-close', 'bus-horn', 'goal', 'kick', 'splash', 'bike-bell'];
    const r = await render(
      8,
      (e, t) => {
        const k = Math.round(t / STEP);
        e.setAmbience({ outdoor: 1, night: 0.5, wind: 1, rain: 1 });
        e.setVehicle({ kind: k < 80 ? 'bus' : 'car', speed: 16, throttle: 1 });
        for (const l of ['tv', 'shower', 'washing', 'fountain'] as const) e.setLoop(l, true, 1);
        e.footstep(ALL_SURFACES[k % ALL_SURFACES.length], 1);
        if (k % 4 === 0) for (const h of hits) e.play(h);
        if (k % 6 === 0) [48, 60, 64, 67, 72, 76].forEach((n) => e.note(n, 0.8));
      },
      17,
    );
    const m = analyze(r.buf, 0.5, 8);
    const rw = row('mix', 'stress (everything at once)', r, m);
    if (m.peakDb > -1) rw.fail.push(`peak ${m.peakDb.toFixed(1)} dBFS > -1`);
    if (m.dc > 0.01) rw.fail.push(`DC ${m.dc.toFixed(4)}`);
    rows.push(rw);
  }
  {
    // a plausible busy moment: driving through the neighbourhood by day, honking once
    const r = await render(
      8,
      (e, t) => {
        e.setAmbience({ outdoor: 1, night: 0 });
        e.setVehicle(vehicleProfile('car', t + 1));
        e.setLoop('fountain', true, 0.5);
        if (Math.abs(t - 3) < 1e-6) e.play('horn');
        if (Math.abs(t - 5) < 1e-6) e.play('star');
      },
      19,
    );
    const m = analyze(r.buf, 0.5, 8);
    const rw = row('mix', 'typical drive', r, m);
    if (m.peakDb > SINGLE_PEAK_DB) rw.fail.push(`peak ${m.peakDb.toFixed(1)} dBFS > ${SINGLE_PEAK_DB}`);
    rows.push(rw);
  }
  log('mixes done');

  // ---- leaks: 200 and 400 triggers must both end with zero live nodes, and concurrency must stay bounded
  for (const count of [200, 400]) {
    const dur = count * STEP + 5;
    const r = await render(
      dur,
      (e, t) => {
        const k = Math.round(t / STEP);
        if (k >= count) return;
        if (k % 3 === 0) e.play(ALL_SFX[(k / 3) % ALL_SFX.length]);
        else if (k % 3 === 1) e.footstep(ALL_SURFACES[k % ALL_SURFACES.length], 0.5 + 0.5 * ((k % 5) / 4));
        else e.note(48 + (k % 30), 0.3);
      },
      23,
    );
    const m = analyze(r.buf);
    const rw = row('leak', `${count} triggers`, r, m);
    leakCheck(rw);
    if (r.maxVoices > 44) rw.fail.push(`${r.maxVoices} concurrent voices`);
    rows.push(rw);
  }
  {
    // machine-gunned identical triggers must be thinned out by the rate limiter
    const r = await render(3, (e, t) => {
      if (t > 0.3 && t < 2.3) for (let i = 0; i < 10; i++) {
        e.footstep('tile', 1);
        e.play('kick');
      }
    });
    const m = analyze(r.buf);
    const rw = row('leak', 'rapid repeats (400 calls each)', r, m);
    leakCheck(rw);
    if (m.peakDb > SINGLE_PEAK_DB) rw.fail.push(`peak ${m.peakDb.toFixed(1)} dBFS > ${SINGLE_PEAK_DB}`);
    if (r.maxVoices > 12) rw.fail.push(`${r.maxVoices} concurrent voices – limiter not working`);
    rows.push(rw);
  }
  {
    // on/off toggling of loops, vehicles and ambience must free everything
    const r = await render(9, (e, t) => {
      const k = Math.round(t / STEP);
      const phase = Math.floor(k / 10) % 2 === 0;
      if (k < 120) {
        for (const l of ALL_LOOPS) e.setLoop(l, phase, 0.5 + 0.5 * Math.sin(t * 7));
        e.setVehicle(phase ? { kind: ALL_VEHICLES[Math.floor(k / 20) % 5], speed: 5, throttle: 0.5 } : null);
        if (phase) e.setAmbience({ outdoor: 0.5, night: (k % 40) / 40, rain: 0.3 });
        else if (k % 10 === 0) e.silence();
      } else if (k === 120) e.silence();
    });
    const m = analyze(r.buf);
    const rw = row('leak', 'toggle loops/vehicle/ambience', r, m);
    leakCheck(rw);
    if (peakIn(r.buf, 8.4, 9) > 0.001) rw.fail.push('still audible after silence()');
    rows.push(rw);
  }
  log('leak tests done');

  const failures = rows.filter((r) => r.fail.length).map((r) => `${r.group}/${r.name}: ${r.fail.join('; ')}`);
  return { rows, failures, wavs, ms: performance.now() - started };
}
