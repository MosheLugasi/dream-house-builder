import * as THREE from 'three';
import { itemSize } from '../../../catalog';
import { LED, STAGE, TRUSS, TRUSS_COLORS } from '../../../catalog/items/_gameDStage';
import type { Vec2 } from '../../../model/types';
import type { Character } from '../../../render3d/Character';
import { randomLook, type Activity } from '../../../render3d/characterTypes';
import type { Occupation, OccupationFrame } from '../../../render3d/WalkController';
import { Bin, CameraRig, canvasTexture, clamp, lerp } from '../football/shared';
import type { MiniGameContext, MiniGameDef, MiniGameSession, PlacedProp } from '../types';
import {
  GOOD,
  JUDGE_COLOR,
  JUDGE_TEXT,
  LATE,
  LEVELS,
  accuracy,
  beatsToSec,
  grade,
  judge,
  makeSong,
  multiplier,
  newTally,
  tally,
  type Judgement,
  type Lane,
  type MusicEvent,
  type Song,
  type Tally,
} from './chart';
import { Band } from './synth';
import { STAGE_AT, buildStage } from './venue';

const LANE_COLORS = ['#c45cff', '#2fc7ff', '#3ee07a', '#ff4f7b'];
/** arrow rotation (z) per lane: ← ↓ ↑ → */
const LANE_ROT = [Math.PI / 2, Math.PI, 0, -Math.PI / 2];
const KEY_LANE: Record<string, Lane> = { ArrowLeft: 0, KeyA: 0, ArrowDown: 1, KeyS: 1, ArrowUp: 2, KeyW: 2, ArrowRight: 3, KeyD: 3 };
const SWALLOW = /^(Key|Arrow|Digit|Space|Enter|Shift|Numpad)/;
const MAX_NOTES = 64;

type Phase = 'select' | 'count' | 'play' | 'finale' | 'done';

interface LiveNote {
  sec: number;
  lane: Lane;
  hit: boolean;
  missed: boolean;
}

/** arrow pointing up (+Y), about 1 unit across */
function arrowShape(inner = 0): THREE.Shape {
  const s = new THREE.Shape();
  const pts: Array<[number, number]> = [
    [0, 0.5],
    [0.5, 0],
    [0.2, 0],
    [0.2, -0.5],
    [-0.2, -0.5],
    [-0.2, 0],
    [-0.5, 0],
  ];
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  if (inner > 0) {
    const h = new THREE.Path();
    const k = 1 - inner;
    pts
      .slice()
      .reverse()
      .forEach(([x, y], i) => (i ? h.lineTo(x * k, y * k - 0.02) : h.moveTo(x * k, y * k - 0.02)));
    h.closePath();
    s.holes.push(h);
  }
  return s;
}

class DanceShow implements MiniGameSession {
  private bin = new Bin();
  private band: Band | null = null;
  private cam: CameraRig;
  private phase: Phase = 'select';
  private phaseT = 0;
  private level: 0 | 1 | 2 = 0;
  private song: Song | null = null;
  private notes: LiveNote[] = [];
  private nextNote = 0;
  private t: Tally = newTally();
  /** simulated song clock (when the audio clock is not running) */
  private simT = -1;
  forceSim = false;
  private lead = 2;
  private beat = 0;
  private beatPulse = 0;
  private barColor = 0;
  // stage frame
  private stage = new THREE.Group();
  private top = STAGE.top;
  private front = 1;
  // dancer moves
  private step = { x: 0, z: 0, lift: 0, spin: 0, spinT: -1 };
  private occ: Occupation;
  // visuals
  private hw = new THREE.Group();
  private noteMesh: THREE.InstancedMesh;
  private receptors: THREE.Mesh[] = [];
  private flashes = [0, 0, 0, 0];
  private bursts: Array<{ m: THREE.Mesh; t: number }> = [];
  private beams: Array<{ g: THREE.Group; m: THREE.Mesh; base: THREE.Quaternion; i: number }> = [];
  private pulses: Array<{ o: THREE.Object3D; s: THREE.Vector3 }> = [];
  private screen: { g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; t: number } | null = null;
  private crowd: Array<{ ch: Character; ph: number; next: number; act: Activity }> = [];
  private hype = 0.25;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private col = new THREE.Color();
  private zAxis = new THREE.Vector3(0, 0, 1);
  private dancerPlan: Vec2 = { x: 0, y: 0 };
  private fov = 60;
  private facing = 0;

  constructor(private ctx: MiniGameContext) {
    this.placeStage();
    this.cam = new CameraRig(ctx.camera);
    // the note highway, attached to the camera
    ctx.root.add(this.hw);
    const mk = (color: string, opacity: number) => this.bin.add(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.62), mk('#0d0820', 0.62));
    bg.position.set(0, 0.17, -0.001);
    bg.renderOrder = 40;
    this.hw.add(bg);
    for (let i = 0; i < 4; i++) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 1.62), mk('#ffffff', 0.16));
      lane.position.set(this.laneX(i) + 0.09, 0.17, 0);
      lane.renderOrder = 41;
      if (i < 3) this.hw.add(lane);
    }
    const hitLine = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.006), mk('#ffffff', 0.5));
    hitLine.position.set(0, this.hitY(), 0);
    hitLine.renderOrder = 41;
    this.hw.add(hitLine);
    const ring = new THREE.ShapeGeometry(arrowShape(0.28));
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(ring, mk(LANE_COLORS[i], 0.55));
      r.position.set(this.laneX(i), this.hitY(), 0.001);
      r.rotation.z = LANE_ROT[i];
      r.scale.setScalar(0.15);
      r.renderOrder = 42;
      this.hw.add(r);
      this.receptors.push(r);
      const b = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 24), mk('#ffffff', 0));
      b.position.copy(r.position);
      b.renderOrder = 44;
      this.hw.add(b);
      this.bursts.push({ m: b, t: 9 });
    }
    const noteMat = this.bin.add(new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false, toneMapped: false, transparent: true }));
    this.noteMesh = new THREE.InstancedMesh(new THREE.ShapeGeometry(arrowShape()), noteMat, MAX_NOTES);
    this.noteMesh.renderOrder = 43;
    this.noteMesh.frustumCulled = false;
    for (let i = 0; i < MAX_NOTES; i++) this.noteMesh.setColorAt(i, this.col.set('#ffffff'));
    this.noteMesh.count = 0;
    this.hw.add(this.noteMesh);
    this.hw.visible = false;

    this.makeLights();
    this.makeCrowd();

    // when the show ends the dancer steps down in front of the stage
    this.v.set(0.6, 0, STAGE.d / 2 + 1.4);
    this.stage.localToWorld(this.v);
    this.occ = { activity: 'dance', lockMovement: true, label: 'מופע ריקוד', frame: () => this.dancerFrame(), exit: { x: this.v.x, y: this.v.z } };
    this.fov = ctx.camera.fov;
    ctx.camera.fov = 50;
    ctx.camera.updateProjectionMatrix();
    ctx.walk.occupy(this.occ);
    ctx.walk.character.setActivity('wave');
    ctx.ui.banner('💃 מופע ריקוד!', 1500);
    this.showSelect();
  }

  // ---- stage -------------------------------------------------------------------------------

  private near(id: string, max: number): PlacedProp[] {
    const c = this.v.set(0, 0, 0);
    this.stage.localToWorld(c);
    return this.ctx.props((it) => it.catalogId === id).filter((p) => Math.hypot(p.pos.x - c.x, p.pos.y - c.z) < max);
  }

  private placeStage(): void {
    const ctx = this.ctx;
    const plotC = ctx.plotToSite(STAGE_AT.x, STAGE_AT.y);
    const stages = ctx.props((it) => it.catalogId === 'concert-stage').sort((a, b) => Math.hypot(a.pos.x - plotC.x, a.pos.y - plotC.y) - Math.hypot(b.pos.x - plotC.x, b.pos.y - plotC.y));
    const st = stages[0];
    if (st) {
      const size = itemSize(st.def, st.item);
      this.top = STAGE.top * (size.h / st.def.size.h);
      this.front = (size.d / STAGE.d) * 1.0;
      this.stage.position.set(st.pos.x, st.floorY, st.pos.y);
      this.stage.rotation.y = -st.rotation;
    } else {
      // no stage: dance on the plaza in front of the start sign
      this.top = 0;
      this.stage.position.set(plotC.x, ctx.groundAt(plotC.x, plotC.y), plotC.y);
      this.stage.rotation.y = -Math.PI;
    }
    ctx.root.add(this.stage);
    this.stage.updateMatrixWorld(true);
    this.v.set(0, 0, this.front);
    this.stage.localToWorld(this.v);
    this.dancerPlan = { x: this.v.x, y: this.v.z };
    this.v2.set(0, 0, this.front + 5);
    this.stage.localToWorld(this.v2);
    this.facing = Math.atan2(this.v2.x - this.v.x, this.v2.z - this.v.z);
  }

  private makeLights(): void {
    const ctx = this.ctx;
    // light beams from the par cans of every truss near the stage
    const coneGeo = new THREE.ConeGeometry(0.75, 6.0, 20, 1, true);
    coneGeo.translate(0, -3.0, 0);
    for (const tr of this.near('stage-truss', 16)) {
      const holder = tr.holder;
      if (!holder) continue;
      const size = itemSize(tr.def, tr.item);
      const kx = size.w / TRUSS.w;
      const ky = size.h / TRUSS.h;
      TRUSS.cans.forEach((x, i) => {
        const mat = this.bin.add(
          new THREE.MeshBasicMaterial({ color: TRUSS_COLORS[i], transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
        );
        const g = new THREE.Group();
        g.position.set(x * kx, TRUSS.canY * ky - 0.1, 0.12);
        // aim down at the stage behind the truss, fanned out
        g.rotation.set(0.62, 0, (i - 3) * 0.12);
        const m = new THREE.Mesh(coneGeo, mat);
        m.renderOrder = 6;
        g.add(m);
        holder.add(g);
        // the group lives under the catalog holder: remember to take it off in dispose
        this.beamHolders.push(g);
        this.beams.push({ g, m, base: g.quaternion.clone(), i });
      });
    }
    for (const sp of this.near('stage-speaker', 18)) {
      const p = sp.holder?.getObjectByName('part:pulse');
      if (p) this.pulses.push({ o: p, s: p.scale.clone() });
    }
    // the LED wall shows the show
    const led = this.near('led-screen', 16)[0];
    const t = canvasTexture(256, 148);
    if (led && t) {
      this.bin.add(t.tex);
      const size = itemSize(led.def, led.item);
      const k = { x: size.w / LED.w, y: size.h / LED.h, z: size.d / LED.d };
      const mat = this.bin.add(new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(LED.faceW * k.x, LED.faceH * k.y), mat);
      const holder = new THREE.Group();
      holder.position.set(led.pos.x, led.floorY, led.pos.y);
      holder.rotation.y = -led.rotation;
      plane.position.set(0, LED.faceY * k.y, (LED.faceZ + 0.015) * k.z);
      holder.add(plane);
      ctx.root.add(holder);
      this.screen = { g: t.g, tex: t.tex, t: 0 };
    }
  }

  private beamHolders: THREE.Object3D[] = [];

  private makeCrowd(): void {
    const ctx = this.ctx;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const look = randomLook(1000 + Math.floor(ctx.random() * 100000));
      const ch = this.bin.npc(look, ctx.root);
      const row = i % 3;
      const col = Math.floor(i / 3);
      const x = (col - 1.5) * 2.3 + (row === 1 ? 1.1 : 0) + (ctx.random() - 0.5) * 0.6;
      const z = STAGE.d / 2 + 2.4 + row * 1.6 + ctx.random() * 0.5;
      this.v.set(x, 0, z);
      this.stage.localToWorld(this.v);
      const gy = ctx.groundAt(this.v.x, this.v.z);
      ch.root.position.set(this.v.x, gy, this.v.z);
      this.v2.set(0, 0, 0);
      this.stage.localToWorld(this.v2);
      ch.root.rotation.y = Math.atan2(this.v2.x - this.v.x, this.v2.z - this.v.z);
      ch.setActivity('none');
      this.crowd.push({ ch, ph: ctx.random() * 6, next: ctx.random() * 2, act: 'none' });
    }
  }

  // ---- highway geometry (camera-attached, units of the half screen height) -------------------

  private laneX(i: number): number {
    return (i - 1.5) * 0.18;
  }
  private hitY(): number {
    return -0.5;
  }
  private spawnY(): number {
    return 0.95;
  }

  // ---- flow --------------------------------------------------------------------------------

  private showSelect(): void {
    const ui = this.ctx.ui;
    ui.set({
      score: 0,
      scoreLabel: 'נקודות',
      lines: LEVELS.map((l, i) => `${i === this.level ? '▶ ' : ''}${i + 1} · ${l.name} – "${l.song}" (${l.bpm} BPM)`),
      hint: 'בחרו שיר: 1 / 2 / 3 (או ←/→) · רווח – להתחיל',
    });
  }

  private begin(): void {
    const ctx = this.ctx;
    this.song = makeSong(this.level, 7);
    this.lead = LEVELS[this.level].lead;
    this.notes = this.song.notes.map((n) => ({ sec: beatsToSec(this.song!, n.t), lane: n.lane, hit: false, missed: false }));
    this.nextNote = 0;
    this.t = newTally();
    this.phase = 'count';
    this.phaseT = 0;
    ctx.ui.set({ lines: [`🎵 "${this.song.name}" · ${LEVELS[this.level].name}`], hint: '← ↓ ↑ → (או A S W D) כשהחץ מגיע לקו!' });
    ctx.sfx('click');
    void ctx.ui.countdown().then(() => {
      if (this.phase !== 'count') return;
      this.band = new Band();
      this.band.onBeat = (inst, vel) => this.onBeat(inst, vel);
      this.band.play(this.song!, 0.1);
      this.simT = -0.1;
      this.phase = 'play';
      this.phaseT = 0;
      this.hw.visible = true;
      ctx.walk.character.setActivity('dance');
    });
  }

  private now(): number {
    if (this.band && this.band.running && !this.forceSim) return this.band.songTime();
    return this.simT;
  }

  private onBeat(inst: MusicEvent['inst'], vel: number): void {
    if (inst === 'kick') {
      this.beatPulse = vel;
      this.beat++;
      for (const p of this.pulses) p.o.scale.set(p.s.x * 1.08, p.s.y * 1.08, p.s.z * 1.35);
    }
    if (inst === 'crash') this.barColor++;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (ctx.walk.occupation !== this.occ) ctx.walk.occupy(this.occ);
    this.phaseT += dt;
    this.band?.tick();
    if (this.phase === 'play') {
      this.simT += dt;
      // in the simulated clock there is no audio: fake the beat for the visuals
      if (!this.band?.running || this.forceSim) {
        const b = Math.floor((this.simT * this.song!.bpm) / 60);
        if (b > this.beat) this.onBeat('kick', 1);
      }
      this.play(dt);
    }
    if (this.phase === 'finale' && this.phaseT > 3.2) this.finish();
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
    for (const p of this.pulses) p.o.scale.lerp(p.s, Math.min(1, dt * 10));
    this.updateDancer(dt);
    this.updateCrowd(dt);
    this.updateLights(dt);
    this.updateScreen(dt);
    this.updateCamera(dt);
    this.updateHighway(dt);
  }

  private play(_dt: number): void {
    const now = this.now();
    // misses: arrows that went past the line
    for (let i = this.nextNote; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.sec > now) break;
      if (!n.hit && !n.missed && now - n.sec > LATE) {
        n.missed = true;
        this.apply('miss', n.lane);
      }
    }
    while (this.nextNote < this.notes.length && (this.notes[this.nextNote].hit || this.notes[this.nextNote].missed)) this.nextNote++;
    const song = this.song!;
    const total = beatsToSec(song, song.beats);
    this.ctx.ui.set({ timer: Math.max(0, total - now), bar: { value: clamp(now / total, 0, 1), label: `🎵 ${song.name}`, color: '#8a46d8' } });
    if (now > total + 0.3) this.startFinale();
  }

  private press(lane: Lane): void {
    this.flashes[lane] = 1;
    if (this.phase !== 'play') return;
    const now = this.now();
    let best: LiveNote | null = null;
    for (let i = this.nextNote; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.sec - now > GOOD) break;
      if (n.lane !== lane || n.hit || n.missed) continue;
      if (Math.abs(n.sec - now) <= GOOD) {
        best = n;
        break;
      }
    }
    if (!best) return;
    const j = judge(now - best.sec);
    if (!j) return;
    best.hit = true;
    this.apply(j, lane);
  }

  private apply(j: Judgement, lane: Lane): void {
    const ctx = this.ctx;
    const prevMult = multiplier(this.t.combo);
    tally(this.t, j);
    const ui = ctx.ui;
    if (j === 'miss') {
      this.band?.miss();
      this.hype = Math.max(0.15, this.hype - 0.12);
      if (this.t.miss % 3 === 1) ui.popup(JUDGE_TEXT.miss, JUDGE_COLOR.miss);
    } else {
      const b = this.bursts[lane];
      b.t = 0;
      ((b.m.material as THREE.MeshBasicMaterial).color as THREE.Color).set(JUDGE_COLOR[j]);
      ui.popup(JUDGE_TEXT[j], JUDGE_COLOR[j]);
      this.hype = Math.min(1, this.hype + (j === 'perfect' ? 0.03 : 0.015));
      this.move(lane);
      const c = this.t.combo;
      if (multiplier(c) > prevMult) {
        ui.banner(`×${multiplier(c)} מכפיל!`, 1000);
        ctx.sfx('star', 0.6);
      }
      if (c > 0 && c % 25 === 0) {
        ui.banner(`🔥 ${c} ברצף!`, 1200);
        ctx.sfx('cheer', 0.8);
        this.step.spinT = 0;
        if (c % 50 === 0) ctx.walk.character.setActivity('flip');
        this.v.set(0, this.top + 2.2, this.front);
        this.stage.localToWorld(this.v);
        ctx.emit('confetti', this.v.clone(), 24, 1.2);
      } else if (c >= 10 && c % 8 === 0) ctx.walk.character.gesture('cheer');
    }
    ui.set({
      score: this.t.score,
      combo: this.t.combo >= 4 ? `×${multiplier(this.t.combo)} · ${this.t.combo} קומבו` : null,
      lines: [`🎵 "${this.song!.name}" · ${LEVELS[this.level].name}`, `מושלם ${this.t.perfect} · טוב ${this.t.good} · פספוס ${this.t.miss}`],
    });
  }

  /** a dance step towards the arrow */
  private move(lane: Lane): void {
    const s = this.step;
    if (lane === 0) s.x = -0.28;
    else if (lane === 3) s.x = 0.28;
    else if (lane === 2) s.lift = 0.14;
    else s.z = -0.18;
  }

  private startFinale(): void {
    const ctx = this.ctx;
    this.phase = 'finale';
    this.phaseT = 0;
    this.hw.visible = false;
    ctx.ui.set({ bar: null, timer: null, hint: null });
    const acc = accuracy(this.t);
    ctx.ui.banner(acc >= 0.85 ? '🌟 הופעה מדהימה!' : acc >= 0.6 ? '👏 כל הכבוד!' : '🎤 סוף השיר!', 2200);
    ctx.sfx('cheer', 1);
    ctx.sfx('fanfare', 0.8);
    ctx.walk.character.setActivity('cheer');
    this.hype = 1;
    for (let i = 0; i < 3; i++) {
      this.v.set((i - 1) * 3.5, this.top + 4, this.front);
      this.stage.localToWorld(this.v);
      ctx.emit('confetti', this.v.clone(), 50, 2.5);
    }
  }

  private finish(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const t = this.t;
    const acc = accuracy(t);
    this.ctx.finish({
      score: t.score,
      detail: `"${this.song!.name}" (${LEVELS[this.level].name}) – דירוג ${grade(acc)}, דיוק ${Math.round(acc * 100)}%`,
      stats: [
        ['מושלם', String(t.perfect)],
        ['טוב', String(t.good)],
        ['פספוס', String(t.miss)],
        ['הקומבו הכי ארוך', String(t.best)],
      ],
    });
  }

  // ---- per frame visuals ---------------------------------------------------------------------

  private dancerFrame(): OccupationFrame {
    const s = this.step;
    // stage-local offset → world
    this.v.set(s.x, 0, this.front + s.z);
    this.stage.localToWorld(this.v);
    const spin = s.spinT >= 0 ? Math.min(1, s.spinT / 0.7) * Math.PI * 2 : 0;
    return { x: this.v.x, y: this.v.z, floor: this.stage.position.y + this.top, lift: s.lift, facing: this.facing + spin, pose: 'stand' };
  }

  private updateDancer(dt: number): void {
    const s = this.step;
    const k = Math.min(1, dt * 6);
    s.x = lerp(s.x, 0, k * 0.6);
    s.z = lerp(s.z, 0, k * 0.6);
    s.lift = Math.max(0, s.lift - dt * 0.9);
    if (s.spinT >= 0) {
      s.spinT += dt;
      if (s.spinT > 0.7) s.spinT = -1;
    }
  }

  private updateCrowd(dt: number): void {
    const h = this.phase === 'play' || this.phase === 'finale' ? this.hype : 0.2;
    if (this.phase === 'play') this.hype = Math.max(0.2, this.hype - dt * 0.01);
    for (const c of this.crowd) {
      c.next -= dt;
      if (c.next <= 0) {
        c.next = 1.5 + this.ctx.random() * 2.5;
        const pool: Activity[] = h < 0.35 ? ['none', 'clap', 'none'] : h < 0.7 ? ['clap', 'dance', 'wave', 'dance'] : ['dance', 'cheer', 'dance', 'clap'];
        const a = pool[Math.floor(this.ctx.random() * pool.length)];
        if (a !== c.act) {
          c.act = a;
          c.ch.setActivity(a);
        }
      }
      // jump to the beat when the show is hot
      const base = this.ctx.groundAt(c.ch.root.position.x, c.ch.root.position.z);
      c.ch.root.position.y = base + (h > 0.75 && c.act === 'dance' ? this.beatPulse * 0.12 * (0.5 + 0.5 * Math.sin(c.ph)) : 0);
      c.ch.update(dt, 0);
    }
  }

  private updateLights(dt: number): void {
    const t = this.ctx.elapsed();
    const playing = this.phase === 'play' || this.phase === 'finale';
    for (const b of this.beams) {
      const mat = b.m.material as THREE.MeshBasicMaterial;
      const sweep = playing ? Math.sin(t * (0.8 + this.hype * 1.6) + b.i * 0.9) * (0.15 + this.hype * 0.35) : Math.sin(t * 0.4 + b.i) * 0.08;
      this.q.setFromAxisAngle(this.zAxis, sweep);
      b.g.quaternion.copy(b.base).multiply(this.q);
      const ci = (b.i + this.barColor) % TRUSS_COLORS.length;
      mat.color.set(TRUSS_COLORS[ci]);
      mat.opacity = playing ? 0.08 + this.beatPulse * (0.12 + this.hype * 0.12) : 0.06;
    }
    void dt;
  }

  private updateScreen(dt: number): void {
    const sc = this.screen;
    if (!sc) return;
    sc.t += dt;
    if (sc.t < 1 / 15) return;
    sc.t = 0;
    const g = sc.g;
    const W = 256;
    const H = 148;
    const t = this.ctx.elapsed();
    const grad = g.createLinearGradient(0, 0, W, H);
    const hue = (t * 20 + this.barColor * 60) % 360;
    grad.addColorStop(0, `hsl(${hue}, 80%, ${18 + this.beatPulse * 20}%)`);
    grad.addColorStop(1, `hsl(${(hue + 120) % 360}, 80%, 14%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // equalizer bars
    const playing = this.phase === 'play';
    for (let i = 0; i < 16; i++) {
      const v = playing ? 0.25 + 0.6 * Math.abs(Math.sin(t * (3 + i * 0.37) + i)) * (0.4 + this.beatPulse * 0.6) : 0.1 + 0.05 * Math.sin(t * 2 + i);
      g.fillStyle = `hsl(${(hue + i * 14) % 360}, 90%, 60%)`;
      g.fillRect(8 + i * 15, H - 8 - v * 90, 11, v * 90);
    }
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    if (this.phase === 'select' || this.phase === 'count') {
      g.font = '700 26px system-ui, Arial, sans-serif';
      g.fillText('מופע ריקוד', W / 2, 34);
      g.font = '600 16px system-ui, Arial, sans-serif';
      g.fillText(LEVELS[this.level].song, W / 2, 62);
    } else {
      g.font = '800 34px system-ui, Arial, sans-serif';
      g.direction = 'ltr';
      g.fillText(String(this.t.score), W / 2, 34);
      if (this.t.combo >= 4) {
        g.font = '700 18px system-ui, Arial, sans-serif';
        g.direction = 'rtl';
        g.fillText(`${this.t.combo} קומבו!`, W / 2, 64);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 1, H);
    sc.tex.needsUpdate = true;
  }

  private updateCamera(dt: number): void {
    // in the crowd, looking up at the dancer
    const sway = Math.sin(this.ctx.elapsed() * 0.3) * 0.6;
    this.v.set(-1.2 + sway, this.top + 1.9, this.front + STAGE.d / 2 + 4.6);
    this.stage.localToWorld(this.v);
    this.v2.set(-1.1, this.top + 1.25, this.front);
    this.stage.localToWorld(this.v2);
    this.cam.set(this.v, this.v2, dt, 2.5);
  }

  private updateHighway(dt: number): void {
    const cam = this.ctx.camera;
    // glue it in front of the camera: 1 m ahead, scaled to the half height of the view
    const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    this.hw.position.copy(cam.position);
    this.hw.quaternion.copy(cam.quaternion);
    this.hw.translateZ(-1);
    this.hw.scale.setScalar(half);
    // on the right of the screen
    this.hw.translateX(cam.aspect * half * 0.52);
    for (let i = 0; i < 4; i++) {
      this.flashes[i] = Math.max(0, this.flashes[i] - dt * 5);
      const r = this.receptors[i];
      const f = this.flashes[i];
      r.scale.setScalar(0.15 * (1 + f * 0.18 + this.beatPulse * 0.06));
      (r.material as THREE.MeshBasicMaterial).opacity = 0.5 + f * 0.5;
      const b = this.bursts[i];
      if (b.t < 1) {
        b.t += dt * 3;
        b.m.scale.setScalar(0.12 + b.t * 0.22);
        (b.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - b.t));
      }
    }
    if (!this.hw.visible || !this.song) return;
    const now = this.now();
    let n = 0;
    const hy = this.hitY();
    const sy = this.spawnY();
    for (let i = this.nextNote > 4 ? this.nextNote - 4 : 0; i < this.notes.length && n < MAX_NOTES; i++) {
      const note = this.notes[i];
      const dtN = note.sec - now;
      if (dtN > this.lead) break;
      if (note.hit) continue;
      if (note.missed && dtN < -0.35) continue;
      const y = hy + (dtN / this.lead) * (sy - hy);
      const s = 0.15 * (note.missed ? 0.85 : 1 + (dtN < 0.12 && dtN > -0.05 ? 0.08 : 0));
      this.q.setFromAxisAngle(this.zAxis, LANE_ROT[note.lane]);
      this.m4.compose(this.v.set(this.laneX(note.lane), y, 0.002), this.q, this.v2.set(s, s, s));
      this.noteMesh.setMatrixAt(n, this.m4);
      this.noteMesh.setColorAt(n, this.col.set(note.missed ? '#555566' : LANE_COLORS[note.lane]));
      n++;
    }
    this.noteMesh.count = n;
    this.noteMesh.instanceMatrix.needsUpdate = true;
    if (this.noteMesh.instanceColor) this.noteMesh.instanceColor.needsUpdate = true;
  }

  // ---- input -------------------------------------------------------------------------------

  key(code: string, down: boolean): boolean {
    if (code === 'Escape') return false;
    if (!down) return SWALLOW.test(code);
    if (this.phase === 'select') {
      const pick = code === 'Digit1' || code === 'Numpad1' ? 0 : code === 'Digit2' || code === 'Numpad2' ? 1 : code === 'Digit3' || code === 'Numpad3' ? 2 : -1;
      if (pick >= 0) {
        this.level = pick as 0 | 1 | 2;
        this.showSelect();
        this.begin();
      } else if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD') {
        const d = code === 'ArrowRight' || code === 'KeyD' ? 1 : -1;
        this.level = clamp(this.level + d, 0, 2) as 0 | 1 | 2;
        this.ctx.sfx('click', 0.5);
        this.showSelect();
      } else if (code === 'Space' || code === 'Enter') this.begin();
      return SWALLOW.test(code);
    }
    const lane = KEY_LANE[code];
    if (lane !== undefined) this.press(lane);
    return SWALLOW.test(code);
  }

  dispose(): void {
    const walk = this.ctx.walk;
    if (walk.occupation === this.occ) walk.release();
    this.band?.stop();
    this.ctx.camera.fov = this.fov;
    this.ctx.camera.updateProjectionMatrix();
    for (const g of this.beamHolders) {
      g.removeFromParent();
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    }
    for (const p of this.pulses) p.o.scale.copy(p.s);
    this.bin.dispose();
  }
}

export const GAME: MiniGameDef = {
  id: 'dance',
  howTo: [
    'עולים לבמה ורוקדים לשיר: בוחרים רמה 1 קל · 2 בינוני · 3 קשה',
    'כשחץ מגיע לקו הלבן – לוחצים על אותו חץ: ← ↓ ↑ → (או A S W D)',
    'בדיוק בזמן = מושלם (100), קצת לפני או אחרי = טוב (50)',
    'כל 10 ברצף מעלים את המכפיל (עד ×4) – והקהל משתגע!',
  ],
  medals: { bronze: 5000, silver: 16000, gold: 32000, unit: 'points' },
  venue: { plot: 'e-south', build: buildStage },
  start: (ctx) => new DanceShow(ctx),
};
