/**
 * "Look at the sound": renders one scenario offline and paints a log-frequency spectrogram plus the waveform.
 * Used from the preview page and (headless) to review sounds nobody can listen to.
 */
import type { Loop, Sfx, Surface, VehicleSound } from '../../src/audio/types';
import { AMBIENCES, SR, WARM, cut, render as renderRaw, vehicleProfile } from './selftest';

/** e.g. "sfx:bark", "step:wood", "steps:grass", "note:60", "chord", "loop:tv", "vehicle:car", "amb:day-outdoor" */
export async function renderScenario(spec: string, seed = 1): Promise<AudioBuffer> {
  const [kind, name = ''] = spec.split(':');
  // everything starts after a short warm-up that is cut off again (see WARM in selftest.ts)
  type Script = Parameters<typeof renderRaw>[1];
  const render = async (dur: number, script: Script) => cut(await renderRaw(WARM + dur, (e, t) => t >= WARM - 1e-6 && script(e, t - WARM), seed, true)).buf;
  const at0 = (t: number) => Math.abs(t) < 1e-6;
  const long = ['fanfare', 'goal', 'bell', 'star', 'bike-bell', 'purr', 'success', 'yawn'];
  switch (kind) {
    case 'sfx':
      return render(name === 'flush' ? 3.6 : long.includes(name) ? 2.4 : 1.2, (e, t) => at0(t) && e.play(name as Sfx));
    case 'step':
      return render(0.5, (e, t) => at0(t) && e.footstep(name as Surface, 0.6));
    case 'steps':
      return render(3, (e, t) => Math.round(t / 0.05) % 10 === 0 && e.footstep(name as Surface, 0.6));
    case 'note':
      return render(2.5, (e, t) => at0(t) && e.note(Number(name), 0.8));
    case 'chord':
      return render(3, (e, t) => at0(t) && [60, 64, 67, 72].forEach((n) => e.note(n, 1.6)));
    case 'loop':
      return render(8, (e, t) => e.setLoop(name as Loop, t < 7, 1));
    case 'vehicle':
      return render(11, (e, t) => e.setVehicle(vehicleProfile(name as VehicleSound['kind'], t)));
    case 'amb':
      return render(14, (e) => e.setAmbience(AMBIENCES[name] ?? AMBIENCES['day-outdoor']));
    default:
      throw new Error(`unknown scenario ${spec}`);
  }
}

function colour(v: number): [number, number, number] {
  // black → indigo → magenta → orange → pale yellow
  const stops: [number, number, number][] = [
    [0, 0, 4],
    [50, 18, 110],
    [150, 40, 120],
    [235, 105, 50],
    [252, 220, 150],
    [255, 255, 235],
  ];
  const x = Math.max(0, Math.min(0.9999, v)) * (stops.length - 1);
  const i = Math.floor(x);
  const k = x - i;
  return [0, 1, 2].map((c) => stops[i][c] + (stops[i + 1][c] - stops[i][c]) * k) as [number, number, number];
}

export function drawSpectrogram(canvas: HTMLCanvasElement, buf: AudioBuffer, title = '', fmin = 40, fmax = 14000, floorDb = -100, topDb = -25): void {
  const W = 1100;
  const H = 420;
  const waveH = 70;
  const left = 46;
  const bottom = 18;
  canvas.width = W;
  canvas.height = H + waveH;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = buf.length;
  const N = 2048;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const plotW = W - left;
  const plotH = H - bottom;
  const img = g.createImageData(plotW, plotH);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const mags = new Float64Array(N / 2);
  // precompute which FFT bin each pixel row reads
  const rowBin = new Float64Array(plotH);
  for (let y = 0; y < plotH; y++) rowBin[y] = (fmin * Math.pow(fmax / fmin, 1 - y / (plotH - 1)) * N) / SR;
  for (let x = 0; x < plotW; x++) {
    const centre = Math.floor((x / plotW) * n);
    for (let i = 0; i < N; i++) {
      const j = centre - N / 2 + i;
      re[i] = j >= 0 && j < n ? ((L[j] + R[j]) / 2) * win[i] : 0;
      im[i] = 0;
    }
    // in-place radix-2 FFT
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang);
      const wi = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let cr = 1;
        let ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k;
          const b = a + len / 2;
          const vr = re[b] * cr - im[b] * ci;
          const vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr;
          im[b] = im[a] - vi;
          re[a] += vr;
          im[a] += vi;
          const t = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = t;
        }
      }
    }
    for (let k = 0; k < N / 2; k++) mags[k] = (Math.sqrt(re[k] * re[k] + im[k] * im[k]) * 4) / N; // a full-scale sine reads 0 dB
    for (let y = 0; y < plotH; y++) {
      const b = rowBin[y];
      const b0 = Math.min(N / 2 - 2, Math.floor(b));
      // take the max over the bins this pixel covers so thin partials stay visible at the top
      const span = Math.max(1, Math.ceil(rowBin[Math.max(0, y - 1)] - b));
      let m = mags[b0] + (mags[b0 + 1] - mags[b0]) * (b - b0);
      for (let k = 1; k < span && b0 + k < N / 2; k++) m = Math.max(m, mags[b0 + k]);
      const dbv = m > 1e-9 ? 20 * Math.log10(m) : -180;
      const [r, gg, bb] = colour((dbv - floorDb) / (topDb - floorDb));
      const o = (y * plotW + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = bb;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, left, 0);
  // axes
  g.font = '11px ui-monospace, monospace';
  g.fillStyle = '#ccd';
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const y = (1 - Math.log(f / fmin) / Math.log(fmax / fmin)) * (plotH - 1);
    g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), 4, y + 4);
    g.beginPath();
    g.moveTo(left, y);
    g.lineTo(W, y);
    g.stroke();
  }
  const dur = n / SR;
  const tick = dur > 8 ? 1 : dur > 3 ? 0.5 : dur > 1.2 ? 0.2 : 0.05;
  for (let t = 0; t <= dur + 1e-6; t += tick) {
    const x = left + (t / dur) * plotW;
    g.fillText(t.toFixed(tick < 0.1 ? 2 : 1), x + 2, H - 5);
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, plotH);
    g.stroke();
  }
  // waveform (peak envelope), ±0.5 full scale = full height so quiet sounds are visible; red line marks -3 dBFS
  let peak = 0;
  g.fillStyle = '#7fd4ff';
  for (let x = 0; x < plotW; x++) {
    const a = Math.floor((x / plotW) * n);
    const b = Math.floor(((x + 1) / plotW) * n);
    let lo = 0;
    let hi = 0;
    for (let i = a; i < b; i++) {
      const s = (L[i] + R[i]) / 2;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    }
    const mid = H + waveH / 2;
    g.fillRect(left + x, mid - hi * waveH, 1, Math.max(1, (hi - lo) * waveH));
  }
  g.fillStyle = '#fff';
  g.fillText(`${title}   peak ${peak > 0 ? (20 * Math.log10(peak)).toFixed(1) : '-inf'} dBFS   colour ${floorDb}…${topDb} dB   wave ±0.5 FS`, left + 6, 14);
}
