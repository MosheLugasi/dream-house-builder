/**
 * Continuous vehicle sounds. `set()` is called every frame with speed (m/s) and throttle (0…1); every parameter
 * follows through `setTargetAtTime`, so there is no zipper noise, and a model fades in / out when it starts or stops.
 */
import type { VehicleSound } from './types';
import { Patch, Smooth, chain, clamp, type Graph } from './util';

type Kind = VehicleSound['kind'];

interface Model {
  kind: Kind;
  patch: Patch;
  master: GainNode;
  level: number;
  update(speed: number, throttle: number, now: number): void;
}

/** Sawtooth → high-pass → resonances: every cycle of the saw becomes one little "tick" / "chug". */
function pulseTrain(p: Patch, out: AudioNode, rate: number, hp: number, res: readonly (readonly [number, number, number])[]): OscillatorNode {
  const o = p.osc('sawtooth', rate);
  const h = p.bq('highpass', hp, 0.7);
  o.connect(h);
  for (const [f, q, g] of res) chain(h, p.bq('bandpass', f, q), p.gain(g), out);
  return o;
}

/** slow random wobble (±depth around 1) for a gain – keeps steady sounds from droning */
function wobble(p: Patch, target: GainNode, cutoff: number, depth: number): void {
  chain(p.noise('brown'), p.bq('lowpass', cutoff, 0.7), p.gain(depth * 6), target.gain);
}

function engine(g: Graph, kind: 'car' | 'bus', out: AudioNode): Model {
  const bus = kind === 'bus';
  const C = bus
    ? { idle: 19, top: 66, lp0: 300, lpT: 620, lpR: 260, sub: 0.4, hp: 60, gears: [5, 10.5], tyre: 420, body: 300, level: 0.22, clatter: 0.5 }
    : { idle: 27, top: 98, lp0: 380, lpT: 720, lpR: 420, sub: 0.25, hp: 80, gears: [6.5, 13.5], tyre: 640, body: 430, level: 0.24, clatter: 0.12 };
  const p = new Patch(g);
  const master = p.gain(0);
  master.connect(out);

  // --- engine tone: two detuned saws at the firing frequency + a square one octave below
  const o1 = p.osc('sawtooth', C.idle);
  const o2 = p.osc('sawtooth', C.idle);
  o2.detune.value = bus ? 14 : 9;
  const o3 = p.osc('square', C.idle / 2);
  const mix = p.gain(1);
  chain(o1, p.gain(0.5), mix);
  chain(o2, p.gain(0.4), mix);
  chain(o3, p.gain(C.sub), mix);
  const lp = p.bq('lowpass', C.lp0, 1.1);
  const tame = p.bq('lowpass', bus ? 1500 : 2200, 0.5);
  const eng = p.gain(0);
  const rough = p.gain(1);
  wobble(p, rough, 11, 0.16);
  // two all-passes smear the phases of the harmonics: same tone, far lower peaks than a raw sawtooth
  chain(mix, lp, tame, p.bq('highpass', C.hp, 0.7), p.bq('allpass', 170, 0.6), p.bq('allpass', 560, 0.6), eng, rough, master);
  // cycle-to-cycle irregularity: a few cents of random pitch jitter keep it from sounding like a test tone
  const jitter = chain(p.noise('brown'), p.bq('lowpass', 25, 0.7), p.gain(110));
  for (const o of [o1, o2, o3]) jitter.connect(o.detune);
  // body / exhaust resonance gives the tone some mid presence on small speakers
  const body = p.bq('bandpass', C.body, 1.4);
  chain(mix, body, p.gain(0.5), tame);

  // --- combustion clatter (strong on the diesel bus): noise gated by the firing pulses
  const cl = p.gain(0);
  const gate = p.gain(0.5);
  chain(o1, p.gain(0.5), gate.gain);
  chain(p.noise('white'), p.bq('bandpass', bus ? 1100 : 1600, 0.8), gate, cl, master);

  // --- tyres on the road
  const tyre = p.gain(0);
  const tyreF = p.bq('bandpass', C.tyre, 0.6);
  chain(p.noise('pink'), tyreF, p.bq('lowpass', 1800, 0.5), tyre, master);
  const air = p.gain(0);
  chain(p.noise('white'), p.bq('bandpass', 1500, 0.4), p.bq('lowpass', 3500, 0.5), air, master);

  const sF = [new Smooth(o1.frequency, 0.1), new Smooth(o2.frequency, 0.1), new Smooth(o3.frequency, 0.1)];
  const sLp = new Smooth(lp.frequency, 0.09);
  const sEng = new Smooth(eng.gain, 0.09);
  const sCl = new Smooth(cl.gain, 0.09);
  const sTyre = new Smooth(tyre.gain, 0.15);
  const sTyreF = new Smooth(tyreF.frequency, 0.2);
  const sAir = new Smooth(air.gain, 0.2);
  let gear = 0;

  return {
    kind,
    patch: p,
    master,
    level: C.level,
    update(speed, throttle, now) {
      const v = Math.abs(speed);
      // a simple automatic gearbox with hysteresis: revs climb in each gear and drop on the shift
      while (gear < C.gears.length && v > C.gears[gear]) gear++;
      while (gear > 0 && v < C.gears[gear - 1] - 1.6) gear--;
      const lo = gear === 0 ? 0 : C.gears[gear - 1] - 1.6;
      const hi = gear < C.gears.length ? C.gears[gear] : C.gears[gear - 1] * 1.7;
      const inGear = clamp((v - lo) / (hi - lo), 0, 1.15);
      let rpm = (gear === 0 ? 0.0 : 0.3) + inGear * (gear === 0 ? 0.8 : 0.52);
      // pulling away / revving on the spot: the throttle lifts the revs before the car moves
      rpm = Math.max(rpm, throttle * 0.38) + throttle * 0.06;
      rpm = clamp(rpm, 0, 1.1);
      const f = C.idle + (C.top - C.idle) * rpm;
      sF[0].set(f, now);
      sF[1].set(f, now);
      sF[2].set(f / 2, now);
      sLp.set(C.lp0 + C.lpT * throttle * (0.45 + 0.55 * rpm) + C.lpR * rpm, now);
      sEng.set((0.62 + 0.3 * throttle) * (0.85 + 0.15 * rpm), now);
      sCl.set(C.clatter * (0.35 + 0.65 * throttle), now);
      const road = Math.pow(clamp(v / 16, 0, 1.2), 1.4);
      sTyre.set(0.5 * road, now);
      sTyreF.set(C.tyre * (0.8 + 0.5 * clamp(v / 16, 0, 1)), now);
      sAir.set(0.12 * Math.pow(clamp(v / 22, 0, 1.2), 2), now);
    },
  };
}

function tractor(g: Graph, out: AudioNode): Model {
  const p = new Patch(g);
  const master = p.gain(0);
  master.connect(out);
  // slow single-cylinder-ish diesel: every power stroke is an audible "chug"
  const sum = p.gain(0);
  const o = pulseTrain(p, sum, 8, 30, [
    [86, 3.5, 0.45],
    [172, 3.5, 1.1],
    [345, 3, 0.9],
    [720, 2, 0.45],
  ]);
  const rough = p.gain(1);
  wobble(p, rough, 9, 0.12);
  chain(sum, p.bq('lowpass', 1400, 0.5), p.bq('highpass', 48, 0.7), rough, master);
  // tappet clatter riding on each stroke
  const cl = p.gain(0);
  const gate = p.gain(0.45);
  chain(o, p.gain(0.55), gate.gain);
  chain(p.noise('white'), p.bq('bandpass', 1500, 0.9), gate, cl, master);
  const tyre = p.gain(0);
  chain(p.noise('brown'), p.bq('bandpass', 170, 0.8), tyre, master);

  const sRate = new Smooth(o.frequency, 0.14);
  const sSum = new Smooth(sum.gain, 0.1);
  const sCl = new Smooth(cl.gain, 0.1);
  const sTyre = new Smooth(tyre.gain, 0.2);
  return {
    kind: 'other',
    patch: p,
    master,
    level: 0.32,
    update(speed, throttle, now) {
      const v = Math.abs(speed);
      sRate.set(clamp(7.5 + 8 * throttle + v * 0.9, 6, 26), now);
      sSum.set(0.55 + 0.45 * throttle, now);
      sCl.set(0.1 * (0.4 + 0.6 * throttle), now);
      sTyre.set(1.6 * clamp(v / 8, 0, 1), now);
    },
  };
}

function bicycle(g: Graph, out: AudioNode): Model {
  const p = new Patch(g);
  const master = p.gain(0);
  master.connect(out);
  const bright = p.bq('lowpass', 6500, 0.5);
  bright.connect(master);

  // freewheel pawls: only while coasting
  const fw = p.gain(0);
  const fwOsc = pulseTrain(p, fw, 10, 1400, [
    [3300, 5, 1],
    [5000, 6, 0.4],
    [1900, 4, 0.35],
  ]);
  fw.connect(bright);
  // chain over the sprockets: only while pedalling – a softer, lower, slightly noisy purr
  const ch = p.gain(0);
  const chOsc = pulseTrain(p, ch, 9, 500, [
    [1150, 3, 1],
    [2300, 3.5, 0.5],
  ]);
  const chNoise = p.gain(0.5);
  chain(chOsc, p.gain(0.5), chNoise.gain);
  chain(p.noise('white'), p.bq('bandpass', 1700, 1.2), chNoise, p.gain(0.3), ch);
  ch.connect(bright);
  // tyres
  const tyre = p.gain(0);
  const wob = p.gain(1);
  wobble(p, wob, 4, 0.12);
  chain(p.noise('white'), p.bq('bandpass', 1700, 0.5), p.bq('highpass', 600, 0.5), wob, tyre, bright);

  const sFw = new Smooth(fw.gain, 0.06);
  const sFwRate = new Smooth(fwOsc.frequency, 0.12);
  const sCh = new Smooth(ch.gain, 0.08);
  const sChRate = new Smooth(chOsc.frequency, 0.12);
  const sTyre = new Smooth(tyre.gain, 0.15);
  return {
    kind: 'bicycle',
    patch: p,
    master,
    level: 0.5,
    update(speed, throttle, now) {
      const v = Math.abs(speed);
      const moving = clamp((v - 0.25) / 0.6, 0, 1);
      sFwRate.set(clamp(4 + v * 4.6, 4, 42), now);
      sFw.set(0.9 * moving * (1 - clamp(throttle * 2.5, 0, 1)), now);
      sChRate.set(clamp(7 + v * 2.2, 7, 26), now);
      sCh.set(0.55 * clamp(throttle * 2, 0, 1) * clamp(v / 0.8 + 0.3, 0, 1), now);
      sTyre.set(0.3 * Math.pow(clamp(v / 9, 0, 1.2), 1.3), now);
    },
  };
}

function scooter(g: Graph, out: AudioNode): Model {
  const p = new Patch(g);
  const master = p.gain(0);
  master.connect(out);
  const lp = p.bq('lowpass', 5000, 0.5);
  lp.connect(master);
  // small hard wheels on pavement: a gritty band whose loudness jitters with the surface
  const roll = p.gain(0);
  const jit = p.gain(0.8);
  wobble(p, jit, 28, 0.55);
  const rollF = p.bq('bandpass', 1050, 0.9);
  chain(p.noise('pink'), rollF, jit, roll, lp);
  // deck / stem rattle and the low rumble through the board
  const low = p.gain(0);
  chain(p.noise('brown'), p.bq('bandpass', 190, 1), low, lp);
  // paving joints: tick-tock at a rate that follows speed
  const joints = p.gain(0);
  const jOsc = pulseTrain(p, joints, 5, 120, [
    [520, 4, 1],
    [1650, 4, 0.5],
    [2900, 3, 0.2],
  ]);
  joints.connect(lp);

  const sRoll = new Smooth(roll.gain, 0.12);
  const sRollF = new Smooth(rollF.frequency, 0.2);
  const sLow = new Smooth(low.gain, 0.15);
  const sJ = new Smooth(joints.gain, 0.12);
  const sJRate = new Smooth(jOsc.frequency, 0.15);
  return {
    kind: 'scooter',
    patch: p,
    master,
    level: 0.17,
    update(speed, throttle, now) {
      const v = Math.abs(speed);
      const k = Math.pow(clamp(v / 6, 0, 1.3), 1.2) * (1 + 0.15 * throttle);
      sRoll.set(2.2 * k, now);
      sRollF.set(850 + 500 * clamp(v / 6, 0, 1.3), now);
      sLow.set(0.7 * k, now);
      sJ.set(0.8 * clamp((v - 0.2) / 1.5, 0, 1), now);
      sJRate.set(clamp(v / 0.45, 0.5, 16), now);
    },
  };
}

export class VehicleSynth {
  private cur: Model | null = null;
  private dying: { m: Model; at: number }[] = [];
  private lastCall = -1;

  constructor(
    private readonly g: Graph,
    private readonly out: AudioNode,
  ) {}

  get active(): boolean {
    return this.cur !== null;
  }

  set(v: VehicleSound | null, now: number): void {
    if (v && this.cur && this.cur.kind !== v.kind) this.stop(now);
    if (!v) {
      this.stop(now);
      return;
    }
    if (!this.cur) {
      const m = v.kind === 'car' || v.kind === 'bus' ? engine(this.g, v.kind, this.out) : v.kind === 'bicycle' ? bicycle(this.g, this.out) : v.kind === 'scooter' ? scooter(this.g, this.out) : tractor(this.g, this.out);
      m.master.gain.setValueAtTime(0, now);
      m.master.gain.setTargetAtTime(m.level, now, 0.12);
      this.cur = m;
    }
    this.cur.update(Number.isFinite(v.speed) ? v.speed : 0, clamp(Number.isFinite(v.throttle) ? v.throttle : 0, 0, 1), now);
    this.lastCall = now;
  }

  private stop(now: number): void {
    const m = this.cur;
    if (!m) return;
    this.cur = null;
    m.master.gain.setTargetAtTime(0, now, 0.1);
    this.dying.push({ m, at: now + 0.9 });
  }

  /** housekeeping: frees faded-out models and stops a vehicle the game forgot about */
  pump(now: number): void {
    if (this.cur && now - this.lastCall > 0.6) this.stop(now);
    if (this.dying.length) {
      this.dying = this.dying.filter((d) => {
        if (d.at > now) return true;
        d.m.patch.dispose();
        return false;
      });
    }
  }

  dispose(): void {
    this.cur?.patch.dispose();
    this.cur = null;
    for (const d of this.dying) d.m.patch.dispose();
    this.dying = [];
  }
}
