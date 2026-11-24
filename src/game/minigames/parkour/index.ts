import * as THREE from 'three';
import { itemSize } from '../../../catalog';
import { MONKEY, monkeyRungs, zipCable } from '../../../catalog/items/_gameBShapes';
import type { Vec2 } from '../../../model/types';
import type { OccupationFrame, WalkSurface } from '../../../render3d/WalkController';
import { fromSurfaceLocal, toSurfaceLocal } from '../../../render3d/walkSurfaces';
import { plotById } from '../plots';
import type { MiniGameContext, MiniGameDef, MiniGameSession, PlacedProp } from '../types';
import { installObstacleSurfaces } from '../skatepark/surfaces';
import { GhostRecorder, MEDALS, buildCourse, courseKey, ghostAt, loadGhost, passed, saveGhost, splitDelta, verdict, type Gate, type GhostRun } from './course';
import { buildParkourVenue } from './venue';

installObstacleSurfaces();

const PLOT = 'sw' as const;
const TIME_LIMIT = 300;
const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export const GAME: MiniGameDef = {
  id: 'parkour',
  howTo: [
    'רצים במסלול נגד השעון: משער הזינוק, דרך כל דגלי הביקורת לפי המספרים, עד שער הסיום.',
    'WASD/חצים – הליכה · Shift – ריצה · רווח – קפיצה (גם אל במות ומדרגות).',
    'מול קיר טיפוס, רשת או מנהרה – ממשיכים ללחוץ W. על הקורה – הולכים לאט, בריצה מאבדים שיווי משקל!',
    'סולם קופים: מהבמה לוחצים רווח, ואז A ו-D לסירוגין – יד אחרי יד. אומגה: רווח על הבמה.',
    'נוגעים במים? חוזרים לדגל האחרון. רוח הרפאים הכחולה היא הריצה הכי טובה שלכם – נסו לנצח אותה!',
    'אפשר לבנות מסלול חדש בעורך: דגלי ביקורת 1–8, מכשולים, חבלי נתיב ומים – המשחק רץ במה שבניתם.',
  ],
  medals: { bronze: MEDALS.bronze, silver: MEDALS.silver, gold: MEDALS.gold, lowerIsBetter: true, unit: 'seconds' },
  venue: { plot: PLOT, build: buildParkourVenue },
  start: (ctx) => new ParkourSession(ctx),
};

type Station =
  | { kind: 'climb'; s: WalkSurface }
  | { kind: 'net' | 'tunnel' | 'monkey' | 'zip'; p: PlacedProp };

/** plan point → local frame of a placed item (x along its width, z along its depth) */
function toLocal(p: PlacedProp, x: number, y: number): Vec2 {
  const c = Math.cos(p.rotation);
  const s = Math.sin(p.rotation);
  const dx = x - p.pos.x;
  const dy = y - p.pos.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

function fromLocal(p: PlacedProp, lx: number, lz: number): Vec2 {
  const c = Math.cos(p.rotation);
  const s = Math.sin(p.rotation);
  return { x: p.pos.x + lx * c - lz * s, y: p.pos.y + lx * s + lz * c };
}

/** facing angle (character convention: forward = (sin f, cos f)) of the item's local ±z axis */
const facingAlong = (rotation: number, sign: 1 | -1): number => Math.atan2(-Math.sin(rotation) * sign, Math.cos(rotation) * sign);

class ParkourSession implements MiniGameSession {
  private walk: MiniGameContext['walk'];
  private plot = plotById(PLOT);
  private gates: Gate[] = [];
  private next = 1;
  private phase: 'countdown' | 'run' | 'done' = 'countdown';
  private t = 0;
  private falls = 0;
  private splits: number[] = [];
  private respawnAt: { p: Vec2; y: number } = { p: { x: 0, y: 0 }, y: 0 };
  private water: Array<[number, number, number, number]> = [];
  private stations: Station[] = [];
  private held = new Set<string>();
  private busy: string | null = null;
  private beam = 0;
  private best: GhostRun | null = null;
  private courseId = '';
  private recorder = new GhostRecorder();
  private ghost: THREE.Group;
  private ghostPose = { x: 0, h: 0, y: 0, facing: 0 };
  private hudT = 0;
  private splashT = 0;
  private trolley: THREE.Group | null = null;
  private monkeyPress: ((code: string) => void) | null = null;

  constructor(private ctx: MiniGameContext) {
    this.walk = ctx.walk;
    this.buildCourse();
    this.ghost = this.makeGhost();
    ctx.root.add(this.ghost);
    this.toStart();
    ctx.ui.set({ timer: 0, score: `0/${this.gates.length - 1}`, scoreLabel: 'דגלים', lines: this.best ? [`השיא: ${this.best.time.toFixed(1)} ש׳ – רוח הרפאים מחכה!`] : ['ריצה ראשונה – בהצלחה!'], hint: 'Shift ריצה · רווח קפיצה · W מול מכשול – טיפוס' });
    ctx.ui.banner('🧗 מסלול מכשולים – לרוץ!');
    void ctx.ui.countdown().then(() => {
      if (this.phase !== 'countdown') return;
      this.phase = 'run';
      ctx.sfx('whoosh');
    });
  }

  // ---- course -----------------------------------------------------------------------------------

  private inPlot(x: number, y: number): boolean {
    const p = this.plot;
    return x >= p.x0 && x <= p.x0 + p.w && y >= p.y0 && y <= p.y0 + p.h;
  }

  private buildCourse(): void {
    const ctx = this.ctx;
    const props = ctx.props((item) => this.inPlot(item.x, item.y));
    const sign = props.find((p) => p.item.catalogId === 'game-sign-parkour');
    const fallback = sign ? { x: sign.pos.x, y: sign.pos.y + 3, rotation: 0 } : { ...ctx.plotToSite(5, 7), rotation: 0 };
    this.gates = buildCourse(
      props.map((p) => ({ id: p.item.id, catalogId: p.item.catalogId, x: p.pos.x, y: p.pos.y, rotation: p.rotation, w: itemSize(p.def, p.item).w })),
      fallback,
    );
    this.courseId = courseKey(this.gates);
    this.best = loadGhost(this.courseId);
    for (const a of ctx.project().site.areas) {
      if (a.finish !== 'water') continue;
      const x0 = Math.min(a.x0, a.x1);
      const x1 = Math.max(a.x0, a.x1);
      const y0 = Math.min(a.y0, a.y1);
      const y1 = Math.max(a.y0, a.y1);
      if (x1 < this.plot.x0 || x0 > this.plot.x0 + this.plot.w || y1 < this.plot.y0 || y0 > this.plot.y0 + this.plot.h) continue;
      this.water.push([x0, y0, x1, y1]);
    }
    for (const s of ctx.world().surfaces ?? []) if (s.tag === 'climb' && this.inPlot(s.x, s.y)) this.stations.push({ kind: 'climb', s });
    const kinds: Record<string, 'net' | 'tunnel' | 'monkey' | 'zip'> = { 'pk-cargo-net': 'net', 'pk-tunnel': 'tunnel', 'pk-monkey-bars': 'monkey', 'pk-zipline': 'zip' };
    for (const p of props) {
      const kind = kinds[p.item.catalogId];
      if (kind) this.stations.push({ kind, p });
    }
  }

  /** where to stand at a gate, facing the next one */
  private dirTo(from: Vec2, i: number): Vec2 {
    const g = this.gates[Math.min(i, this.gates.length - 1)];
    const dx = g.x - from.x;
    const dy = g.y - from.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  private toStart(): void {
    const g = this.gates[0];
    const d = this.dirTo(g, 1);
    // the start arch: stand just behind it, looking along the course
    let p = { x: g.x - d.x * 1.2, y: g.y - d.y * 1.2 };
    if (g.w > 0) {
      // run straight through the arch: along its local z, towards the next gate
      const nz = { x: -Math.sin(g.rotation), y: Math.cos(g.rotation) };
      const s = nz.x * d.x + nz.y * d.y >= 0 ? 1 : -1;
      p = { x: g.x - nz.x * s * 1.3, y: g.y - nz.y * s * 1.3 };
    }
    this.respawnAt = { p, y: this.ctx.groundAt(p.x, p.y) };
    this.teleport(this.respawnAt.p, 1);
  }

  private teleport(p: Vec2, nextIndex: number, y = this.ctx.groundAt(p.x, p.y)): void {
    const d = this.dirTo(p, nextIndex);
    this.walk.teleport(p, Math.atan2(-d.x, -d.y), y);
  }

  // ---- input ------------------------------------------------------------------------------------

  key(code: string, down: boolean): boolean {
    if (down) this.held.add(code);
    else this.held.delete(code);
    if (this.phase === 'countdown') return MOVE.includes(code) || code === 'Space' ? down : false;
    if (!down) return false;
    if (this.monkeyPress && (code === 'KeyA' || code === 'KeyD' || code === 'ArrowLeft' || code === 'ArrowRight')) {
      this.monkeyPress(code);
      return true;
    }
    if (this.busy) return code === 'Space' || code === 'KeyE';
    if (this.phase !== 'run') return false;
    if (code === 'Space' || code === 'KeyE') return this.tryStation(true);
    return false;
  }

  private isHeld(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  // ---- stations ---------------------------------------------------------------------------------

  /** Start the obstacle the runner faces (W held against it, or Space / E for bars and zip-lines). */
  private tryStation(pressed: boolean): boolean {
    const walk = this.walk;
    if (walk.occupation || walk.airborne || this.busy) return false;
    const me = walk.pos;
    const f = { x: Math.sin(walk.facing), y: Math.cos(walk.facing) };
    const pushing = this.isHeld('KeyW', 'ArrowUp');
    for (const st of this.stations) {
      if (st.kind === 'climb') {
        const l = toSurfaceLocal(st.s, me.x, me.y);
        if (Math.abs(l.x) > st.s.hw - 0.1 || l.y < st.s.hd - 0.05 || l.y > st.s.hd + 0.8) continue;
        if (walk.y > st.s.y0 + 0.3) continue;
        const into = { x: Math.sin(st.s.rotation), y: -Math.cos(st.s.rotation) };
        if (f.x * into.x + f.y * into.y < 0.4) continue;
        if (!pushing && !pressed) continue;
        this.climbWall(st.s, l.x);
        return true;
      }
      const p = st.p;
      const size = itemSize(p.def, p.item);
      const l = toLocal(p, me.x, me.y);
      if (st.kind === 'net' || st.kind === 'tunnel') {
        const hd = size.d / 2;
        const lateral = st.kind === 'net' ? size.w / 2 - 0.15 : 0.55;
        if (Math.abs(l.x) > lateral || Math.abs(l.y) < hd - 0.3 || Math.abs(l.y) > hd + 0.85) continue;
        const side = l.y > 0 ? 1 : -1;
        const into = { x: Math.sin(p.rotation) * side, y: -Math.cos(p.rotation) * side };
        if (f.x * into.x + f.y * into.y < 0.4 || (!pushing && !pressed)) continue;
        if (st.kind === 'net') this.climbNet(p, side as 1 | -1, l.x);
        else this.crawl(p, side as 1 | -1);
        return true;
      }
      if (st.kind === 'monkey') {
        const tag = walk.surfaceUnder?.tag;
        if ((tag !== 'monkey-start' && tag !== 'monkey-end') || walk.surfaceUnder?.id !== p.item.id) continue;
        if (!pressed && !(pushing && Math.abs(l.y) < size.d / 2 - MONKEY.platform + 0.35)) continue;
        this.hang(p, l.y > 0 ? 1 : -1);
        return true;
      }
      if (st.kind === 'zip') {
        if (walk.surfaceUnder?.tag !== 'zip' || walk.surfaceUnder?.id !== p.item.id) continue;
        if (!pressed) continue;
        this.ride(p);
        return true;
      }
    }
    return false;
  }

  private near(): string | null {
    const me = this.walk.pos;
    for (const st of this.stations) {
      if (st.kind === 'climb') {
        const l = toSurfaceLocal(st.s, me.x, me.y);
        if (Math.abs(l.x) < st.s.hw && l.y > st.s.hd - 0.1 && l.y < st.s.hd + 1.2 && this.walk.y < st.s.y0 + 0.3) return 'W אל הקיר – טיפוס!';
        continue;
      }
      const size = itemSize(st.p.def, st.p.item);
      const l = toLocal(st.p, me.x, me.y);
      if (st.kind === 'net' && Math.abs(l.x) < size.w / 2 && Math.abs(l.y) < size.d / 2 + 1.2) return 'W אל הרשת – לטפס מעליה!';
      if (st.kind === 'tunnel' && Math.abs(l.x) < 0.8 && Math.abs(l.y) < size.d / 2 + 1.2) return 'W אל המנהרה – זוחלים!';
      if (st.kind === 'monkey' && this.walk.surfaceUnder?.id === st.p.item.id) return 'רווח – לקפוץ אל המוטות, ואז A / D לסירוגין';
      if (st.kind === 'zip' && this.walk.surfaceUnder?.id === st.p.item.id && this.walk.surfaceUnder?.tag === 'zip') return 'רווח – לתפוס את הידית ולגלוש!';
    }
    return null;
  }

  private occupy(label: string, frame: (dt: number) => OccupationFrame | null, exit?: Vec2, onEnd?: () => void): void {
    this.busy = label;
    this.walk.occupy({
      activity: 'cheer',
      label,
      lockMovement: true,
      exit,
      frame,
      onEnd: () => {
        this.busy = null;
        this.monkeyPress = null;
        onEnd?.();
      },
    });
  }

  private climbWall(s: WalkSurface, lx: number): void {
    const ground = this.walk.y;
    const top = s.y0 + (s.top ?? 0);
    const face = fromSurfaceLocal(s, lx, s.hd + 0.28);
    const onTop = fromSurfaceLocal(s, lx, s.hd - 0.45);
    const facing = Math.atan2(Math.sin(s.rotation), -Math.cos(s.rotation));
    const climbH = top - ground;
    const T = 0.55 + climbH * 0.55;
    let t = 0;
    this.ctx.sfx('whoosh', 0.4);
    this.occupy(
      'מטפסים!',
      (dt) => {
        t += dt;
        if (t < T) {
          const k = t / T;
          return { x: face.x, y: face.y, floor: ground, lift: climbH * k * 0.92, facing, pose: 'stand', tilt: -0.12 + 0.05 * Math.sin(t * 14) };
        }
        const k = Math.min(1, (t - T) / 0.3);
        if (k >= 1) return null;
        return { x: face.x + (onTop.x - face.x) * k, y: face.y + (onTop.y - face.y) * k, floor: top, lift: -0.08 * climbH * (1 - k), facing, pose: 'stand' };
      },
      onTop,
    );
  }

  private climbNet(p: PlacedProp, side: 1 | -1, lx: number): void {
    const size = itemSize(p.def, p.item);
    const ground = this.walk.y;
    const hd = size.d / 2;
    const apex = size.h - 1.05;
    const facing = facingAlong(p.rotation, (-side) as 1 | -1);
    let t = 0;
    const T = 2.6;
    const end = fromLocal(p, lx, -side * (hd + 0.45));
    this.occupy(
      'מטפסים ברשת',
      (dt) => {
        t += dt;
        const k = Math.min(1, t / T);
        if (t >= T) return null;
        const z = side * (hd + 0.15) * (1 - 2 * k);
        const q = fromLocal(p, lx, z);
        const lift = apex * (1 - Math.abs(1 - 2 * k)) ** 0.8;
        return { x: q.x, y: q.y, floor: ground, lift, facing, pose: 'stand', tilt: k < 0.5 ? -0.25 : 0.2 };
      },
      end,
    );
  }

  private crawl(p: PlacedProp, side: 1 | -1): void {
    const size = itemSize(p.def, p.item);
    const ground = this.walk.y;
    const hd = size.d / 2;
    const facing = facingAlong(p.rotation, (-side) as 1 | -1);
    let z = side * (hd + 0.3);
    const end = fromLocal(p, 0, -side * (hd + 0.5));
    this.ctx.sfx('squeak', 0.4);
    this.busy = 'זוחלים';
    this.walk.occupy({
      activity: 'none',
      label: 'זוחלים במנהרה',
      lockMovement: true,
      exit: end,
      onEnd: () => {
        this.busy = null;
      },
      frame: (dt) => {
        z -= side * dt * 1.6;
        if (side * z < -(hd + 0.3)) return null;
        const q = fromLocal(p, 0, z);
        return { x: q.x, y: q.y, floor: ground, lift: 0.02, facing, pose: 'lie', seatHeight: 0.05 };
      },
    });
  }

  /** monkey bars: A / D alternately, one rung per press */
  private hang(p: PlacedProp, from: 1 | -1): void {
    const size = itemSize(p.def, p.item);
    const rungs = monkeyRungs(size);
    if (from < 0) rungs.reverse();
    const ground = this.ctx.groundAt(p.pos.x, p.pos.y);
    const reach = this.walk.character.stats.height * 1.22;
    const hangLift = MONKEY.barY - reach;
    const facing = facingAlong(p.rotation, (-from) as 1 | -1);
    const endTop = ground + MONKEY.top;
    const endZ = -from * (size.d / 2 - MONKEY.platform / 2);
    let i = 0;
    let at = 0;
    let last = '';
    let wobble = 0;
    let swing = 0;
    let drop = false;
    this.ctx.sfx('whoosh', 0.4);
    this.monkeyPress = (code) => {
      const hand = code === 'KeyA' || code === 'ArrowLeft' ? 'L' : 'R';
      if (hand === last) {
        wobble++;
        swing = 1;
        this.ctx.ui.popup(wobble >= 3 ? 'אוי!' : 'יד אחרת!', '#ff9a6a');
        this.ctx.sfx('squeak', 0.5);
        if (wobble >= 3) drop = true;
        return;
      }
      last = hand;
      if (i < rungs.length - 1) i++;
      this.ctx.sfx('clack', 0.35);
    };
    let fallY = 0;
    this.occupy(
      'סולם קופים – A / D לסירוגין',
      (dt) => {
        swing *= 1 - Math.min(1, dt * 2);
        at += (i - at) * Math.min(1, dt * 7);
        const z = rungs[Math.floor(at)] + (rungs[Math.min(rungs.length - 1, Math.floor(at) + 1)] - rungs[Math.floor(at)]) * (at - Math.floor(at));
        const q = fromLocal(p, 0, z);
        if (drop) {
          fallY = ground + hangLift;
          return null;
        }
        if (i === rungs.length - 1 && at > rungs.length - 1.08) return null;
        const tilt = Math.sin(at * Math.PI) * 0.18 + swing * Math.sin(this.ctx.elapsed() * 12) * 0.25;
        return { x: q.x, y: q.y, floor: ground, lift: hangLift, facing, pose: 'stand', tilt };
      },
      undefined,
      () => {
        const w = this.walk;
        if (drop) {
          // let go: fall from the bars (into whatever is below)
          w.y = fallY;
          this.ctx.ui.popup('נפלת מהמוטות!', '#ff7a6a');
        } else {
          const q = fromLocal(p, 0, endZ);
          w.pos = { ...q };
          w.y = endTop;
          this.ctx.ui.popup('יד אחרי יד – מעולה! 🐒', '#9cff8a');
          this.ctx.sfx('star', 0.6);
        }
      },
    );
  }

  private ride(p: PlacedProp): void {
    const size = itemSize(p.def, p.item);
    const cab = zipCable(size);
    const ground = this.ctx.groundAt(p.pos.x, p.pos.y);
    const hang = this.walk.character.stats.height * 1.2;
    const facing = facingAlong(p.rotation, 1);
    const len = cab.z1 - cab.z0;
    let s = 0;
    let v = 0.8;
    const cableY = (k: number) => cab.y0 + (cab.y1 - cab.y0) * k - Math.sin(Math.PI * k) * 0.25;
    // trolley and handle
    const tr = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.8, roughness: 0.35 });
    const grip = new THREE.MeshStandardMaterial({ color: '#e8433a', roughness: 0.6 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.18), metal);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), metal);
    rod.position.y = -0.26;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), grip);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = -0.47;
    tr.add(box, rod, bar);
    tr.rotation.y = facing;
    this.ctx.root.add(tr);
    this.trolley = tr;
    this.ctx.sfx('whoosh', 0.7);
    const end = fromLocal(p, 0, cab.z1 + 0.6);
    this.occupy(
      'אומגה!',
      (dt) => {
        const k = s / len;
        const slope = (cableY(Math.min(1, k + 0.01)) - cableY(k)) / (len * 0.01);
        v = Math.max(1.5, Math.min(8, v - 9.8 * slope * dt * 0.7 - v * 0.05 * dt));
        s += v * dt;
        if (s >= len) return null;
        const kk = s / len;
        const q = fromLocal(p, 0, cab.z0 + s);
        const cy = ground + cableY(kk);
        tr.position.set(q.x, cy + 0.1, q.y);
        tr.rotation.x = -0.15;
        return { x: q.x, y: q.y, floor: ground, lift: cy - ground - hang, facing, pose: 'stand', tilt: -0.08 };
      },
      end,
      () => {
        this.ctx.root.remove(tr);
        this.trolley = null;
        this.walk.y = Math.max(this.walk.y, ground + cableY(1) - hang);
        this.ctx.ui.popup('ווווהוו! 🪂', '#9cff8a');
      },
    );
  }

  // ---- frame ------------------------------------------------------------------------------------

  update(dt: number): void {
    const walk = this.walk;
    const ctx = this.ctx;
    if (this.phase === 'countdown') {
      this.updateGhost(0);
      return;
    }
    if (this.phase !== 'run') return;
    this.t += dt;
    const ch = walk.character;
    this.recorder.add(dt, ch.root.position.x, ch.root.position.y + ch.lift, ch.root.position.z, ch.root.rotation.y);
    this.updateGhost(this.t);
    if (this.t > TIME_LIMIT) {
      ctx.finish({ score: TIME_LIMIT, completed: false, detail: 'נגמר הזמן – נסו שוב!', stats: [['נפילות', String(this.falls)]] });
      this.phase = 'done';
      return;
    }
    // obstacles you walk into
    if (!this.busy && this.isHeld('KeyW', 'ArrowUp')) this.tryStation(false);
    // the balance beam: walk, don't run
    const under = walk.surfaceUnder;
    if (!this.busy && under?.tag === 'beam' && !walk.airborne) {
      if (walk.speed > 2.4) this.beam += dt * 1.6;
      else this.beam = Math.max(0, this.beam - dt * 0.7);
      // a gentle hand towards the middle of the beam
      const l = toSurfaceLocal(under, walk.pos.x, walk.pos.y);
      if (Math.abs(l.x) > 0.02) {
        const q = fromSurfaceLocal(under, l.x * (1 - Math.min(1, dt * 2.5)), l.y);
        walk.pos = q;
      }
      if (this.beam >= 1) {
        this.beam = 0;
        const side = fromSurfaceLocal(under, (l.x >= 0 ? 1 : -1) * 0.5, l.y);
        walk.pos = side;
        ctx.ui.popup('איבדת שיווי משקל!', '#ff7a6a');
      }
    } else if (under?.tag !== 'beam') this.beam = 0;
    // water: back to the last checkpoint
    this.splashT -= dt;
    if (!this.busy && this.splashT <= 0 && !under && walk.feetY < ctx.groundAt(walk.pos.x, walk.pos.y) + 0.08 && this.inWater(walk.pos)) this.splash();
    // gates
    const g = this.gates[this.next];
    if (g && passed(g, walk.pos)) this.passGate(g);
    this.hud(dt);
  }

  private inWater(p: Vec2): boolean {
    return this.water.some(([x0, y0, x1, y1]) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1);
  }

  private splash(): void {
    const walk = this.walk;
    this.falls++;
    this.splashT = 0.8;
    this.ctx.sfx('splash');
    this.ctx.emit('water', new THREE.Vector3(walk.pos.x, walk.y + 0.2, walk.pos.y), 30, 0.5);
    this.ctx.ui.banner('💦 שפלאש! חוזרים לדגל האחרון', 1200);
    this.teleport(this.respawnAt.p, this.next, this.respawnAt.y);
  }

  private passGate(g: Gate): void {
    const ctx = this.ctx;
    const t = this.t;
    this.splits.push(t);
    this.respawnAt = { p: { ...this.walk.pos }, y: this.walk.y };
    this.next++;
    const delta = splitDelta(t, this.best?.splits[this.splits.length - 1]);
    if (g.kind === 'finish') {
      this.finish();
      return;
    }
    ctx.sfx('ding');
    ctx.note(79, 0.6);
    ctx.emit('confetti', new THREE.Vector3(g.x, this.ctx.groundAt(g.x, g.y) + 2.2, g.y), 18, 0.5);
    ctx.ui.popup(`דגל ${g.n} · ${t.toFixed(1)} ש׳${delta ? ` (${delta})` : ''}`, delta && delta.startsWith('−') ? '#9cff8a' : '#ffffff');
  }

  private finish(): void {
    const ctx = this.ctx;
    this.phase = 'done';
    const time = Math.round(this.t * 10) / 10;
    const saved = saveGhost({ key: this.courseId, time, splits: this.splits, samples: this.recorder.samples });
    ctx.sfx('success');
    ctx.emit('confetti', new THREE.Vector3(this.walk.pos.x, this.walk.y + 2, this.walk.pos.y), 40, 1);
    this.walk.playFor('cheer', 2.5);
    const stats: Array<[string, string]> = [
      ['נפילות', String(this.falls)],
      ['דגלי ביקורת', String(this.gates.length - 2)],
    ];
    if (this.best) stats.push(['רוח הרפאים', `${this.best.time.toFixed(1)} ש׳`]);
    if (saved) stats.push(['👻', 'רוח רפאים חדשה נשמרה']);
    ctx.finish({ score: time, detail: verdict(time, this.falls), stats });
  }

  private hud(dt: number): void {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const g = this.gates[this.next];
    const lines = [`נפילות: ${this.falls}`];
    if (this.best) {
      const ghostAhead = ghostAt(this.best, this.t) ? 'רוח הרפאים עדיין רצה 👻' : 'רוח הרפאים כבר סיימה!';
      lines.push(`שיא: ${this.best.time.toFixed(1)} ש׳ · ${ghostAhead}`);
    }
    let bar: { value: number; label?: string; color?: string; danger?: number } | null = null;
    if (this.walk.surfaceUnder?.tag === 'beam') bar = { value: Math.min(1, this.beam), label: 'שיווי משקל – לא לרוץ!', color: '#ffcf3a', danger: 0.7 };
    this.ctx.ui.set({
      timer: this.t,
      score: `${this.next - 1}/${this.gates.length - 1}`,
      lines,
      hint: this.busy ? null : (this.near() ?? 'Shift ריצה · רווח קפיצה · W מול מכשול – טיפוס'),
      bar,
      target: g ? { x: g.x, y: g.y, label: g.kind === 'finish' ? 'סיום' : `דגל ${g.n}` } : null,
    });
  }

  // ---- ghost ------------------------------------------------------------------------------------

  private makeGhost(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#8fd8ff', emissive: '#3a9cff', emissiveIntensity: 0.6, transparent: true, opacity: 0.42, depthWrite: false });
    const h = this.walk.character.stats.height;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, h * 0.42, 4, 10), mat);
    body.position.y = h * 0.52;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), mat);
    head.position.y = h * 0.88;
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, h * 0.25, 3, 8), mat);
    legs.position.y = h * 0.2;
    g.add(body, head, legs);
    g.renderOrder = 3;
    g.visible = false;
    return g;
  }

  private updateGhost(t: number): void {
    if (!this.best) return;
    const p = ghostAt(this.best, t, this.ghostPose);
    this.ghost.visible = !!p;
    if (!p) return;
    this.ghost.position.set(p.x, p.h, p.y);
    this.ghost.rotation.y = p.facing;
  }

  dispose(): void {
    if (this.busy) this.walk.release();
    if (this.trolley) this.ctx.root.remove(this.trolley);
    this.ctx.ui.set({ bar: null, target: null });
  }
}
