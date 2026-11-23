/**
 * Audition page for the sound engine: a button for every sound, switches for loops / ambience / vehicles and the
 * offline self-test (also run headless by `selftest.cjs`).
 *
 *   npx vite --port 5194 --strictPort         (repo root)
 *   open http://localhost:5194/tools/audio-preview/index.html
 *   node tools/audio-preview/selftest.cjs     (headless measurements + sample WAVs)
 */
import { audio } from '../../src/audio/AudioEngine';
import type { Ambience, Sfx, VehicleSound } from '../../src/audio/types';
import { drawSpectrogram, renderScenario } from './spectro';
import { ALL_LOOPS, ALL_SFX, ALL_SURFACES, ALL_VEHICLES, AMBIENCES, VEHICLE_TOP, runSelfTest, vehicleProfile, type Row, type SelfTestResult } from './selftest';

declare global {
  interface Window {
    __audio: typeof audio;
    __selftest?: SelfTestResult;
    __selftestError?: string;
    __runSelfTest: () => Promise<SelfTestResult>;
    __spectro: (spec: string, seed?: number, floorDb?: number, topDb?: number) => Promise<string>;
  }
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const app = $('#app');
const status = $('#status');
/** sections register here what "silence()" has to reset in the page itself */
const onSilence: (() => void)[] = [];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

function section(title: string, wide = false): HTMLElement {
  const s = el('section', { className: wide ? 'wide' : '' }, el('h2', {}, title));
  app.append(s);
  return s;
}

function slider(label: string, min: number, max: number, value: number, step = 0.01): { wrap: HTMLElement; input: HTMLInputElement; out: HTMLElement } {
  const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  const out = el('span', {}, String(value));
  input.addEventListener('input', () => (out.textContent = input.value));
  return { wrap: el('label', {}, label, input, out), input, out };
}

// ---------------------------------------------------------------- header: unlock, mute, volume, meter

const unlock = () => {
  audio.unlock();
  status.textContent = audio.unlocked ? 'running' : 'unlocking…';
};
document.addEventListener('pointerdown', unlock, { capture: true });
$('#unlock').addEventListener('click', unlock);
const mute = $<HTMLInputElement>('#mute');
mute.checked = audio.muted;
mute.addEventListener('change', () => (audio.muted = mute.checked));
const vol = $<HTMLInputElement>('#vol');
vol.value = String(audio.volume);
vol.addEventListener('input', () => (audio.volume = Number(vol.value)));

let analyser: AnalyserNode | null = null;
let hold = 0;
const meterBar = $('#meter i');
const meterHold = $('#meter b');
const levelText = $('#level');
function meter(): void {
  requestAnimationFrame(meter);
  const dbg = audio.debug();
  if (!dbg) return;
  if (!analyser) {
    analyser = dbg.ctx.createAnalyser();
    analyser.fftSize = 2048;
    dbg.core.output.connect(analyser);
  }
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let peak = 0;
  let sq = 0;
  for (const x of data) {
    peak = Math.max(peak, Math.abs(x));
    sq += x * x;
  }
  hold = Math.max(peak, hold * 0.985);
  const toDb = (x: number) => (x > 1e-6 ? 20 * Math.log10(x) : -120);
  const pos = (dbv: number) => `${Math.max(0, Math.min(100, ((dbv + 60) / 60) * 100))}%`;
  meterBar.style.width = pos(toDb(Math.sqrt(sq / data.length)));
  meterHold.style.left = pos(toDb(hold));
  levelText.textContent = `peak ${toDb(hold).toFixed(1)} dBFS · ${dbg.core.stats.voices} voices · ${dbg.core.stats.nodes} nodes · ${dbg.ctx.state}`;
}
requestAnimationFrame(meter);

// ---------------------------------------------------------------- one-shots

{
  const s = section('Sfx – play(name)');
  const pitch = slider('pitch', 0.5, 2, 1);
  const pan = slider('pan', -1, 1, 0);
  const volume = slider('volume', 0, 1, 1);
  s.append(el('div', { className: 'row' }, pitch.wrap, pan.wrap, volume.wrap));
  const groups: [string, Sfx[]][] = [
    ['ui', ['click', 'place', 'delete', 'camera', 'whoosh']],
    ['house', ['door-open', 'door-close', 'door-slide', 'switch-on', 'switch-off', 'flush', 'bell']],
    ['body', ['sit', 'stand', 'jump', 'land', 'yawn']],
    ['rewards', ['star', 'success', 'fanfare', 'goal']],
    ['street', ['horn', 'bus-horn', 'bike-bell']],
    ['play', ['kick', 'bounce', 'splash', 'squeak']],
    ['animals', ['bark', 'meow', 'purr']],
  ];
  const listed = new Set(groups.flatMap((g) => g[1]));
  const rest = ALL_SFX.filter((x) => !listed.has(x));
  if (rest.length) groups.push(['other', rest]);
  for (const [name, list] of groups) {
    const row = el('div', { className: 'row' }, el('span', { className: 'hint' }, `${name}:`));
    for (const sfx of list) {
      const b = el('button', {}, sfx);
      b.addEventListener('click', () => audio.play(sfx, { pitch: Number(pitch.input.value), pan: Number(pan.input.value), volume: Number(volume.input.value) }));
      row.append(b);
    }
    s.append(row);
  }
}

// ---------------------------------------------------------------- footsteps

{
  const s = section('Footsteps – footstep(surface, strength)');
  const strength = slider('strength', 0.1, 1, 0.5);
  const rate = slider('steps / s', 1, 5, 1.9, 0.1);
  s.append(el('div', { className: 'row' }, strength.wrap, rate.wrap));
  let walking: string | null = null;
  let timer = 0;
  const buttons = new Map<string, HTMLButtonElement>();
  const stop = () => {
    clearTimeout(timer);
    if (walking) buttons.get(walking)?.classList.remove('on');
    walking = null;
  };
  onSilence.push(stop);
  const walk = () => {
    if (!walking) return;
    audio.footstep(walking as (typeof ALL_SURFACES)[number], Number(strength.input.value));
    timer = window.setTimeout(walk, (1000 / Number(rate.input.value)) * (0.94 + Math.random() * 0.12));
  };
  const one = el('div', { className: 'row' }, el('span', { className: 'hint' }, 'single:'));
  const loop = el('div', { className: 'row' }, el('span', { className: 'hint' }, 'walk:'));
  for (const surf of ALL_SURFACES) {
    const b = el('button', {}, surf);
    b.addEventListener('click', () => audio.footstep(surf, Number(strength.input.value)));
    one.append(b);
    const w = el('button', {}, surf);
    buttons.set(surf, w);
    w.addEventListener('click', () => {
      const was = walking;
      stop();
      if (was !== surf) {
        walking = surf;
        w.classList.add('on');
        walk();
      }
    });
    loop.append(w);
  }
  s.append(one, loop);
}

// ---------------------------------------------------------------- piano

{
  const s = section('Piano – note(midi, duration)');
  const dur = slider('duration', 0.1, 3, 0.6, 0.1);
  const octave = slider('lowest C (midi)', 24, 84, 48, 12);
  const keys = el('div', { className: 'keys' });
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const draw = () => {
    keys.replaceChildren();
    const base = Number(octave.input.value);
    for (let i = 0; i <= 24; i++) {
      const black = names[i % 12].includes('#');
      const k = el('div', { className: black ? 'black' : '' }, black ? '' : `${names[i % 12]}${Math.floor((base + i) / 12) - 1}`);
      k.addEventListener('pointerdown', () => audio.note(base + i, Number(dur.input.value)));
      keys.append(k);
    }
  };
  octave.input.addEventListener('input', draw);
  draw();
  const chord = el('button', {}, 'C major chord');
  chord.addEventListener('click', () => [60, 64, 67, 72].forEach((n) => audio.note(n, 1.6)));
  const tune = el('button', {}, 'little tune');
  tune.addEventListener('click', () => {
    const seq = [60, 60, 67, 67, 69, 69, 67, -1, 65, 65, 64, 64, 62, 62, 60];
    seq.forEach((n, i) => n > 0 && setTimeout(() => audio.note(n, 0.4), i * 300));
  });
  s.append(el('div', { className: 'row' }, dur.wrap, octave.wrap, chord, tune), keys);
}

// ---------------------------------------------------------------- loops

{
  const s = section('Loops – setLoop(name, on, volume)');
  for (const loop of ALL_LOOPS) {
    const b = el('button', {}, loop);
    const v = slider('volume', 0, 1, 1);
    let on = false;
    onSilence.push(() => {
      on = false;
      b.classList.remove('on');
    });
    const apply = () => audio.setLoop(loop, on, Number(v.input.value));
    b.addEventListener('click', () => {
      on = !on;
      b.classList.toggle('on', on);
      apply();
    });
    v.input.addEventListener('input', apply);
    s.append(el('div', { className: 'row' }, b, v.wrap));
  }
}

// ---------------------------------------------------------------- ambience

{
  const s = section('Ambience – setAmbience({outdoor, night, wind, rain})');
  const outdoor = slider('outdoor', 0, 1, 1);
  const night = slider('night', 0, 1, 0);
  const wind = slider('wind', 0, 1, 0.15);
  const rain = slider('rain', 0, 1, 0);
  const onBtn = el('button', {}, 'ambience on');
  let on = false;
  const cur = (): Ambience => ({ outdoor: Number(outdoor.input.value), night: Number(night.input.value), wind: Number(wind.input.value), rain: Number(rain.input.value) });
  const apply = () => on && audio.setAmbience(cur());
  onBtn.addEventListener('click', () => {
    on = !on;
    onBtn.classList.toggle('on', on);
    if (on) apply();
    else audio.silence();
  });
  for (const x of [outdoor, night, wind, rain]) x.input.addEventListener('input', apply);
  const presets = el('div', { className: 'row' }, el('span', { className: 'hint' }, 'presets:'));
  for (const [name, a] of Object.entries(AMBIENCES)) {
    const b = el('button', {}, name);
    b.addEventListener('click', () => {
      const set = (x: { input: HTMLInputElement; out: HTMLElement }, val: number) => {
        x.input.value = String(val);
        x.out.textContent = String(val);
      };
      set(outdoor, a.outdoor);
      set(night, a.night);
      set(wind, a.wind ?? 0.15);
      set(rain, a.rain ?? 0);
      on = true;
      onBtn.classList.add('on');
      apply();
    });
    presets.append(b);
  }
  s.append(el('div', { className: 'row' }, onBtn), el('div', { className: 'row' }, outdoor.wrap, night.wrap), el('div', { className: 'row' }, wind.wrap, rain.wrap), presets);
  onSilence.push(() => {
    on = false;
    onBtn.classList.remove('on');
  });
}

// ---------------------------------------------------------------- vehicles

{
  const s = section('Vehicle – setVehicle({kind, speed, throttle}) every frame');
  const speed = slider('speed m/s', 0, 20, 0, 0.1);
  const throttle = slider('throttle', 0, 1, 0);
  let kind: VehicleSound['kind'] | null = null;
  let demoStart = -1;
  const kinds = el('div', { className: 'row' });
  const buttons: HTMLButtonElement[] = [];
  for (const k of ALL_VEHICLES) {
    const b = el('button', {}, k === 'other' ? 'other (tractor)' : k);
    buttons.push(b);
    b.addEventListener('click', () => {
      const same = kind === k;
      buttons.forEach((x) => x.classList.remove('on'));
      kind = same ? null : k;
      demoStart = -1;
      if (!same) b.classList.add('on');
    });
    kinds.append(b);
  }
  onSilence.push(() => {
    kind = null;
    demoStart = -1;
    buttons.forEach((x) => x.classList.remove('on'));
  });
  const demo = el('button', {}, 'demo: idle → accelerate → cruise → brake');
  demo.addEventListener('click', () => {
    if (!kind) {
      kind = 'car';
      buttons[0].classList.add('on');
    }
    demoStart = performance.now();
  });
  const horns = el('div', { className: 'row' }, el('span', { className: 'hint' }, 'horns:'));
  for (const h of ['horn', 'bus-horn', 'bike-bell'] as const) {
    const b = el('button', {}, h);
    b.addEventListener('click', () => audio.play(h));
    horns.append(b);
  }
  s.append(kinds, el('div', { className: 'row' }, speed.wrap, throttle.wrap), el('div', { className: 'row' }, demo), horns, el('div', { className: 'hint' }, `demo top speeds: ${JSON.stringify(VEHICLE_TOP)}`));
  let was = false;
  const frame = () => {
    requestAnimationFrame(frame);
    if (!kind) {
      if (was) audio.setVehicle(null);
      was = false;
      return;
    }
    was = true;
    if (demoStart >= 0) {
      const t = (performance.now() - demoStart) / 1000;
      const v = vehicleProfile(kind, t);
      if (!v) {
        demoStart = -1;
        speed.input.value = '0';
        throttle.input.value = '0';
      } else {
        speed.input.value = String(v.speed);
        throttle.input.value = String(v.throttle);
        speed.out.textContent = v.speed.toFixed(1);
        throttle.out.textContent = v.throttle.toFixed(2);
      }
    }
    audio.setVehicle({ kind, speed: Number(speed.input.value), throttle: Number(throttle.input.value) });
  };
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- self-test

function table(rows: Row[]): HTMLTableElement {
  const t = el('table');
  t.append(el('tr', {}, ...['group', 'name', 'len s', 'peak dB', 'rms dB', 'LA dB', 'centroid Hz', 'DC', 'voices', 'nodes', 'result'].map((h) => el('th', {}, h))));
  for (const r of rows) {
    const cells = [r.group, r.name, r.len.toFixed(2), r.peakDb.toFixed(1), r.rmsDb.toFixed(1), r.laDb.toFixed(1), r.centroid.toFixed(0), r.dc.toFixed(4), String(r.maxVoices), String(r.maxNodes), r.fail.length ? r.fail.join('; ') : 'ok'];
    t.append(el('tr', { className: r.fail.length ? 'fail' : '' }, ...cells.map((c) => el('td', {}, c))));
  }
  return t;
}

{
  const s = section('Offline self-test (renders everything on OfflineAudioContext and measures it)', true);
  const run = el('button', {}, 'run self-test');
  const out = el('div');
  const info = el('span', { className: 'hint' });
  s.append(el('div', { className: 'row' }, run, info), out);
  const go = async () => {
    info.textContent = 'rendering…';
    const res = await runSelfTest((m) => (info.textContent = m));
    info.textContent = `${res.rows.length} renders in ${(res.ms / 1000).toFixed(1)} s – ${res.failures.length ? `${res.failures.length} FAILED` : 'all ok'}`;
    out.replaceChildren(table(res.rows));
    return res;
  };
  run.addEventListener('click', () => void go());
  window.__runSelfTest = go;
  if (new URLSearchParams(location.search).has('selftest')) {
    go().then(
      (res) => (window.__selftest = res),
      (e) => (window.__selftestError = String(e?.stack ?? e)),
    );
  }
}

// ---------------------------------------------------------------- spectrogram ("look at the sound")

{
  const s = section('Spectrogram of an offline render', true);
  const specs = [
    ...ALL_SFX.map((x) => `sfx:${x}`),
    ...ALL_SURFACES.map((x) => `steps:${x}`),
    'note:36',
    'note:60',
    'note:84',
    'chord',
    ...ALL_LOOPS.map((x) => `loop:${x}`),
    ...ALL_VEHICLES.map((x) => `vehicle:${x}`),
    ...Object.keys(AMBIENCES).map((x) => `amb:${x}`),
  ];
  const sel = el('select');
  for (const x of specs) sel.append(el('option', { value: x }, x));
  const canvas = el('canvas');
  canvas.style.maxWidth = '100%';
  const show = async (spec: string, seed = 1, floorDb = -100, topDb = -25) => {
    const buf = await renderScenario(spec, seed);
    drawSpectrogram(canvas, buf, spec, 40, 14000, floorDb, topDb);
    return canvas.toDataURL('image/png');
  };
  const go = el('button', {}, 'render');
  go.addEventListener('click', () => void show(sel.value, 1 + Math.floor(Math.random() * 1000)));
  s.append(el('div', { className: 'row' }, sel, go), canvas);
  window.__spectro = show;
}

$('#silence').addEventListener('click', () => {
  for (const f of onSilence) f();
  audio.silence();
});

window.__audio = audio;
