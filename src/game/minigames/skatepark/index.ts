import * as THREE from 'three';
import { getFurniture } from '../../../catalog';
import type { Vec2 } from '../../../model/types';
import { Character } from '../../../render3d/Character';
import { randomLook } from '../../../render3d/characterTypes';
import { makeItemHolder } from '../../../render3d/ItemLayer';
import { seatsOf, type AirEvent, type WalkSurface, type WalkVehicle } from '../../../render3d/WalkController';
import { toSurfaceLocal, fromSurfaceLocal } from '../../../render3d/walkSurfaces';
import { plotById } from '../plots';
import type { MiniGameContext, MiniGameDef, MiniGameSession } from '../types';
import { installObstacleSurfaces } from './surfaces';
import { Combo, MEDALS, airTrick, grindName, judgeLanding, verdict, type Family, type FlipKind, type GrabDir } from './tricks';
import { buildSkateparkVenue } from './venue';

// placed obstacles become standable surfaces in every walk world (not only during a round)
installObstacleSurfaces();

const ROUND = 90;
const FLIP_TIME = 0.42;
const PLOT = 'se' as const;
const START = { x: 25, y: 7 };

const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

interface Air {
  flips: FlipKind[];
  flipKind: FlipKind | null;
  flipT: number;
  grab: { dir: GrabDir; time: number } | null;
  grabbing: boolean;
  from: WalkSurface | null;
}

interface Balance {
  b: number;
  v: number;
  t: number;
}

export const GAME: MiniGameDef = {
  id: 'skatepark',
  howTo: [
    'רוכבים על הסקייטבורד (או אופניים / קורקינט) 90 שניות וצוברים נקודות על פעלולים.',
    'W דחיפה · S בלם · A/D פנייה · רווח – אולי (קפיצה). רמפות מעיפות אתכם לאוויר!',
    'באוויר: A/D סיבוב 180/360/540 · W/S פליפים · רווח (עם כיוון) – גראב. נוחתים ישר!',
    'נוחתים על מעקה או לדג׳ לאורכו – גרינד (A/D לאיזון). Shift על הקרקע – מנואל (W/S לאיזון).',
    'טריקים ברצף = קומבו ×2, ×3… נפילה מוחקת את הקומבו. כל מתקן חדש – בונוס!',
    'אפשר לסדר את הפארק מחדש בעורך השכונה – המשחק משתמש ברמפות שעומדות בו.',
  ],
  medals: { bronze: MEDALS.bronze, silver: MEDALS.silver, gold: MEDALS.gold, unit: 'points' },
  venue: { plot: PLOT, build: buildSkateparkVenue },
  start: (ctx) => new SkateSession(ctx),
};

class SkateSession implements MiniGameSession {
  private walk: MiniGameContext['walk'];
  private plot = plotById(PLOT);
  private v: WalkVehicle | null = null;
  private tempBoard: WalkVehicle | null = null;
  private family: Family = 'board';
  private deck: THREE.Object3D | null = null;
  private body: THREE.Object3D | null = null;
  private steerNode: THREE.Object3D | null = null;
  private phase: 'countdown' | 'ride' | 'bail' | 'over' = 'countdown';
  private left = ROUND;
  private score = 0;
  private combo = new Combo();
  private bestCombo = 0;
  private tricks = 0;
  private falls = 0;
  private air: Air | null = null;
  private grind: { s: WalkSurface; t: number; mode: 'normal' | 'nose' | 'tail'; bal: Balance; sparks: number } | null = null;
  private manual: { bal: Balance; t: number } | null = null;
  private idle = 0;
  private bailT = 0;
  private bailSide: Vec2 = { x: 0, y: 0 };
  private held = new Set<string>();
  private used = new Set<string>();
  private obstacleCount = 0;
  private overT = 0;
  private spectators: Character[] = [];
  private cheerT = 0;
  private hudT = 0;
  private tmp = new THREE.Vector3();
  private onAir = (e: AirEvent) => this.airEvent(e);

  constructor(private ctx: MiniGameContext) {
    this.walk = ctx.walk;
    this.setupRide();
    this.setupSpectators();
    this.countObstacles();
    this.walk.airListeners.add(this.onAir);
    ctx.ui.set({ timer: ROUND, score: 0, scoreLabel: 'נקודות', lines: ['מתכוננים…'], hint: 'W דחיפה · A/D פנייה · רווח אולי · באוויר: A/D סיבוב, W/S פליפ, רווח גראב' });
    ctx.ui.banner('🛹 פארק אתגרי – 90 שניות!');
    void ctx.ui.countdown().then(() => {
      if (this.phase !== 'countdown') return;
      this.phase = 'ride';
      ctx.sfx('whoosh');
    });
  }

  // ---- setup ------------------------------------------------------------------------------------

  private inPlot(x: number, y: number, margin = 0): boolean {
    const p = this.plot;
    return x >= p.x0 - margin && x <= p.x0 + p.w + margin && y >= p.y0 - margin && y <= p.y0 + p.h + margin;
  }

  private setupRide(): void {
    const walk = this.walk;
    const start = this.ctx.plotToSite(START.x, START.y);
    let v = walk.driving ? walk.currentVehicle : null;
    if (v && !this.agile(v)) v = null;
    if (!v) {
      // the plot's own boards first, then bikes / scooters, nearest to the start
      const score = (c: WalkVehicle) => {
        const board = this.stance(c) ? 0 : 100;
        return board + Math.hypot(c.holder.position.x - start.x, c.holder.position.z - start.y);
      };
      const cands = this.ctx.world().vehicles.filter((c) => this.agile(c) && this.inPlot(c.holder.position.x, c.holder.position.z, 2));
      cands.sort((a, b) => score(a) - score(b));
      v = cands[0] ?? null;
    }
    if (!v) {
      // nothing to ride in the park: a board just for this round
      const def = getFurniture('skateboard-ride');
      const holder = def ? makeItemHolder({ catalogId: def.id }, { levelHeight: 2.7, rise: 3, lights: false }) : null;
      if (def && holder) {
        this.ctx.root.add(holder);
        v = { id: 'skatepark-round-board', def, holder };
        this.tempBoard = v;
      }
    }
    if (!v) return;
    this.v = v;
    if (walk.currentVehicle !== v) {
      v.holder.position.set(start.x, this.ctx.groundAt(start.x, start.y), start.y);
      v.holder.rotation.set(0, 0, 0);
      walk.ride(v);
    }
    this.family = this.stance(v) ? 'board' : 'bike';
    const body = v.holder.userData.body as THREE.Object3D | undefined;
    this.body = body ?? null;
    this.deck = (body?.userData.deck as THREE.Object3D | undefined) ?? null;
    const wheels = (body?.userData.wheels ?? v.holder.userData.wheels ?? []) as Array<{ steer?: THREE.Object3D }>;
    this.steerNode = wheels.find((w) => w.steer)?.steer ?? null;
  }

  private stance(v: WalkVehicle): boolean {
    const body = v.holder.userData.body as THREE.Object3D | undefined;
    return (body?.userData.stance ?? v.holder.userData.stance) === 'side';
  }

  private agile(v: WalkVehicle): boolean {
    const k = v.def.vehicle?.kind;
    return k === 'bicycle' || k === 'scooter' || this.stance(v);
  }

  private setupSpectators(): void {
    const seats = this.ctx
      .props((item) => item.catalogId === 'skate-bleachers' && this.inPlot(item.x, item.y))
      .flatMap((p) => seatsOf(p.def, p.pos.x, p.pos.y, p.rotation, p.floorY, p.item.elevation, p.item.id));
    // a few spectators spread over the seats
    const n = Math.min(5, seats.length);
    for (let i = 0; i < n; i++) {
      const s = seats[Math.floor((i * seats.length) / n + this.ctx.random() * 2) % seats.length];
      const c = new Character(randomLook(Math.floor(this.ctx.random() * 100000)));
      c.root.position.set(s.pos.x, s.floorY, s.pos.y);
      c.root.rotation.y = Math.atan2(s.dir.x, s.dir.y);
      c.setPose('sit', s.height - s.floorY);
      this.ctx.root.add(c.root);
      this.spectators.push(c);
    }
  }

  private countObstacles(): void {
    const ids = new Set<string>();
    for (const s of this.ctx.world().surfaces ?? []) if (s.id && this.inPlot(s.x, s.y)) ids.add(s.id);
    this.obstacleCount = ids.size;
  }

  // ---- input ------------------------------------------------------------------------------------

  key(code: string, down: boolean): boolean {
    if (down) this.held.add(code);
    else this.held.delete(code);
    // never leave the board by accident during the round
    if (code === 'KeyE' || code === 'Enter' || code === 'KeyF' || code === 'KeyG' || code === 'KeyT') return true;
    if (this.phase === 'countdown' || this.phase === 'bail' || this.phase === 'over') {
      if (MOVE.includes(code) || code === 'Space') return down;
      return false;
    }
    if (!down) {
      if (code === 'Space' && this.air) this.air.grabbing = false;
      return false;
    }
    // on a rail: W / S switch to a nose / tail grind
    if (this.grind && (code === 'KeyW' || code === 'ArrowUp' || code === 'KeyS' || code === 'ArrowDown')) {
      const mode = code === 'KeyW' || code === 'ArrowUp' ? 'nose' : 'tail';
      if (this.grind.mode !== mode) {
        this.grind.mode = mode;
        this.ctx.sfx('clack', 0.4);
      }
      return false;
    }
    if (this.air && this.walk.airborne) {
      if ((code === 'KeyW' || code === 'ArrowUp') && !this.air.flipKind) this.startFlip('kick');
      else if ((code === 'KeyS' || code === 'ArrowDown') && !this.air.flipKind) this.startFlip('heel');
      else if (code === 'Space' && !this.air.grab) {
        const dir: GrabDir = this.isHeld('KeyW', 'ArrowUp') ? 'up' : this.isHeld('KeyS', 'ArrowDown') ? 'down' : this.isHeld('KeyA', 'ArrowLeft') ? 'left' : this.isHeld('KeyD', 'ArrowRight') ? 'right' : 'none';
        this.air.grab = { dir, time: 0 };
        this.air.grabbing = true;
        return true;
      }
    }
    return false;
  }

  private isHeld(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  private startFlip(kind: FlipKind): void {
    if (!this.air) return;
    this.air.flipKind = kind;
    this.air.flipT = 0;
    this.ctx.sfx('clack', 0.5);
  }

  // ---- air & landings ---------------------------------------------------------------------------

  private airEvent(e: AirEvent): void {
    if (!e.vehicle || this.phase === 'countdown') return;
    if (e.phase === 'takeoff') {
      if (this.grind) this.endGrind();
      if (this.manual) this.endManual();
      this.air = { flips: [], flipKind: null, flipT: 0, grab: null, grabbing: false, from: e.surface };
      this.useObstacle(e.surface);
      return;
    }
    const air = this.air;
    this.air = null;
    this.resetVisuals();
    if (this.phase !== 'ride' && this.phase !== 'over') return;
    if (!air) return;
    const landing = judgeLanding(e.align, air.flipKind ? air.flipT : 0);
    if (landing === 'bail-angle' || landing === 'bail-flip') {
      this.bail(landing === 'bail-flip' ? 'הפליפ לא נגמר!' : 'נחיתה עקומה!');
      return;
    }
    const trick = airTrick(this.family, { spin: this.walk.airSpin, flips: air.flips, grab: air.grab, airTime: e.airTime });
    this.useObstacle(e.surface);

    if (trick) {
      const name = landing === 'fakie' ? `${trick.name} (פייקי)` : trick.name;
      this.addTrick(name, trick.points);
      if (e.airTime > 0.6) this.ctx.emit('smoke', this.boardPos(), 10, 0.4);
    }
    // landed on a rail or a ledge, lengthwise: grind
    if (e.surface && (e.surface.tag === 'rail' || e.surface.tag === 'ledge') && this.v) {
      const phi = this.v.holder.rotation.y;
      const axis = -e.surface.rotation;
      if (Math.abs(Math.cos(phi - axis)) > 0.72) this.startGrind(e.surface);
    }
    if (e.impact > 3) this.ctx.sfx('land', Math.min(1, e.impact / 7));
  }

  private useObstacle(s: WalkSurface | null): void {
    if (!s?.id || this.used.has(s.id) || !this.inPlot(s.x, s.y)) return;
    this.used.add(s.id);
    const bonus = 200;
    this.score += bonus;
    const def = getFurniture(String(s.data?.catalogId ?? ''));
    this.ctx.ui.popup(`מתקן חדש${def ? `: ${def.name}` : ''} +${bonus}`, '#7fe0ff');
  }

  private addTrick(name: string, points: number): void {
    const p = this.combo.add(name, points);
    this.tricks++;
    this.idle = 0;
    this.ctx.ui.popup(`${name} +${p}`, this.combo.multiplier >= 3 ? '#ffcf3a' : '#ffffff');
    this.ctx.sfx(this.combo.multiplier >= 3 ? 'ding' : 'pop', 0.6);
    if (points >= 500) this.crowd('cheer');
  }

  private bankCombo(): void {
    if (!this.combo.active) return;
    const n = this.combo.tricks.length;
    const v = this.combo.bank();
    this.score += v;
    this.bestCombo = Math.max(this.bestCombo, v);
    if (n >= 2) {
      this.ctx.ui.banner(`קומבו ×${Math.min(10, n)}! +${v.toLocaleString('he-IL')}`, 1300);
      this.ctx.note(76, 0.6);
      this.ctx.note(83, 0.5);
    } else this.ctx.ui.popup(`+${v}`, '#9cff8a');
    if (v >= 800) {
      this.crowd('cheer');
      this.ctx.emit('confetti', this.boardPos().add(this.tmp.set(0, 1.2, 0)), 24, 0.8);
    } else if (v >= 250) this.crowd('clap');
  }

  private bail(reason: string): void {
    this.phase = 'bail';
    this.bailT = 1.4;
    this.falls++;
    this.grind = null;
    this.manual = null;
    this.air = null;
    this.resetVisuals();
    const lost = this.combo.value;
    this.combo.reset();
    this.walk.setVehicleSpeed(0);
    for (const c of MOVE) this.walk.setVirtualKey(c, false);
    this.ctx.ui.banner(`נפילה! ${reason}`, 1200);
    if (lost > 0) this.ctx.ui.popup(`הקומבו אבד (−${lost})`, '#ff7a6a');
    this.ctx.sfx('miss');
    this.ctx.emit('smoke', this.boardPos(), 14, 0.5);
    const phi = this.v?.holder.rotation.y ?? 0;
    this.bailSide = { x: Math.cos(phi) * 0.75, y: -Math.sin(phi) * 0.75 };
    this.walk.character.setPose('lie', 0.04);
  }

  // ---- grinds & manuals -------------------------------------------------------------------------

  private startGrind(s: WalkSurface): void {
    this.grind = { s, t: 0, mode: 'normal', bal: { b: 0, v: (this.ctx.random() - 0.5) * 0.6, t: 0 }, sparks: 0 };
    this.ctx.sfx('clack', 0.8);
  }

  private endGrind(): void {
    const g = this.grind;
    this.grind = null;
    if (!g || g.t < 0.12) return;
    const name = grindName(this.family, g.mode, g.s.tag === 'ledge');
    this.addTrick(name, Math.round(100 + g.t * 300 + (g.mode !== 'normal' ? 60 : 0)));
  }

  private endManual(): void {
    const m = this.manual;
    this.manual = null;
    if (this.deck) this.deck.rotation.x = 0;
    if (this.body) this.body.rotation.x = 0;
    if (!m || m.t < 0.4) return;
    this.addTrick(this.family === 'board' ? 'מנואל' : 'ווילי', Math.round(60 + m.t * 150));
  }

  /** an unstable balance: drifts away from the middle, the player pushes it back (input −1..1) */
  private balance(bal: Balance, input: number, dt: number, drift: number): boolean {
    bal.t += dt;
    const noise = (this.ctx.random() - 0.5) * drift;
    bal.v += (bal.b * 1.6 + noise * 3 - input * 3.2) * dt;
    bal.v *= 1 - Math.min(1, dt * 1.2);
    bal.b += bal.v * dt;
    return Math.abs(bal.b) < 1;
  }

  private updateGrind(dt: number): void {
    const g = this.grind!;
    const v = this.v!;
    const h = v.holder;
    // still on it?
    if (this.walk.airborne || this.walk.surfaceUnder !== g.s) {
      if (!this.walk.airborne) this.endGrind();
      return;
    }
    g.t += dt;
    // lock onto the rail's axis
    const l = toSurfaceLocal(g.s, h.position.x, h.position.z);
    const p = fromSurfaceLocal(g.s, 0, l.y);
    h.position.x = p.x;
    h.position.z = p.y;
    const axis = -g.s.rotation;
    h.rotation.y = Math.cos(h.rotation.y - axis) >= 0 ? axis : axis + Math.PI;
    const speed = this.walk.vehicleSpeed;
    if (Math.abs(speed) < 2.4) this.walk.setVehicleSpeed(2.4 * (Math.sign(speed) || 1));
    const input = (this.isHeld('KeyD', 'ArrowRight') ? 1 : 0) - (this.isHeld('KeyA', 'ArrowLeft') ? 1 : 0);
    if (!this.balance(g.bal, input, dt, 0.9 + g.t * 0.4)) {
      this.bail('איבדת שיווי משקל על המעקה');
      return;
    }
    h.rotation.z = g.bal.b * 0.35;
    g.sparks -= dt;
    if (g.sparks <= 0) {
      g.sparks = 0.07;
      this.ctx.emit('spark', this.boardPos(), 4, 0.15);
    }
  }

  private updateManual(dt: number): void {
    const m = this.manual!;
    m.t += dt;
    const input = (this.isHeld('KeyW', 'ArrowUp') ? 1 : 0) - (this.isHeld('KeyS', 'ArrowDown') ? 1 : 0);
    if (!this.balance(m.bal, -input, dt, 0.8 + m.t * 0.35)) {
      this.bail(this.family === 'board' ? 'המנואל ברח' : 'הווילי ברח');
      return;
    }
    const tilt = -0.22 + m.bal.b * 0.12;
    if (this.deck) this.deck.rotation.x = tilt;
    else if (this.body) this.body.rotation.x = tilt * 1.6;
  }

  // ---- frame ------------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    for (const s of this.spectators) s.update(dt, 0);
    if (this.cheerT > 0) {
      this.cheerT -= dt;
      if (this.cheerT <= 0) for (const s of this.spectators) s.setActivity('none');
    }
    if (!this.v) {
      ctx.ui.banner('אין במה לרכוב 🙁');
      ctx.quit();
      return;
    }
    // got off somehow (Esc from a seat, a teleport…): back on the board
    if (!this.walk.driving && this.phase !== 'over') this.walk.ride(this.v);

    if (this.phase === 'countdown') {
      this.walk.setVehicleSpeed(0);
      return;
    }
    if (this.phase === 'ride' || this.phase === 'bail') {
      this.left = Math.max(0, this.left - dt);
      if (this.left <= 0) {
        this.phase = 'over';
        this.overT = 0;
      }
    }
    if (this.phase === 'bail') {
      this.bailT -= dt;
      this.walk.setVehicleSpeed(0);
      const ch = this.walk.character;
      const h = this.v.holder.position;
      ch.root.position.set(h.x + this.bailSide.x, h.y, h.z + this.bailSide.y);
      if (this.bailT <= 0) {
        this.phase = 'ride';
        const spec = this.v.def.vehicle!;
        ch.setPose(spec.rider.pose === 'stand' ? 'stand' : spec.rider.pose, spec.rider.y);
        ctx.ui.popup('קמים וממשיכים! 💪');
      }
    }
    if (this.phase === 'ride' || this.phase === 'over') this.updateRide(dt);
    if (this.phase === 'over') {
      this.overT += dt;
      if (!this.walk.airborne || this.overT > 2) this.end();
      return;
    }
    this.hud(dt);
  }

  private updateRide(dt: number): void {
    const air = this.air;
    if (air && this.walk.airborne) {
      if (air.flipKind) {
        air.flipT += dt / FLIP_TIME;
        const a = Math.min(1, air.flipT) * Math.PI * 2 * (air.flipKind === 'kick' ? 1 : -1);
        if (this.family === 'board' && this.deck) this.deck.rotation.z = a;
        else if (air.flipKind === 'kick' && this.body) this.body.rotation.y = a;
        else if (this.steerNode) this.steerNode.rotation.y = a;
        if (air.flipT >= 1) {
          air.flips.push(air.flipKind);
          air.flipKind = null;
          air.flipT = 0;
          this.resetVisuals();
        }
      }
      if (air.grab && air.grabbing) {
        air.grab.time += dt;
        if (this.deck) this.deck.rotation.x = 0.18;
      }
    }
    if (this.grind) this.updateGrind(dt);
    if (this.phase !== 'ride' && this.phase !== 'over') return;
    // manuals: Shift while rolling on the ground
    const onGround = !this.walk.airborne && !this.grind;
    const shift = this.isHeld('ShiftLeft', 'ShiftRight');
    if (onGround && shift && !this.manual && Math.abs(this.walk.vehicleSpeed) > 1.2) {
      this.manual = { bal: { b: 0, v: (this.ctx.random() - 0.5) * 0.4, t: 0 }, t: 0 };
    } else if (this.manual && (!shift || !onGround || Math.abs(this.walk.vehicleSpeed) < 0.6)) this.endManual();
    if (this.manual) this.updateManual(dt);
    // a combo is banked after a moment of plain rolling
    if (onGround && !this.manual && this.combo.active && this.phase === 'ride') {
      this.idle += dt;
      if (this.idle > 0.85) this.bankCombo();
    }
  }

  private hud(dt: number): void {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const ui = this.ctx.ui;
    const lines: string[] = [];
    const air = this.air;
    let hint: string;
    let bar: { value: number; label?: string; color?: string; danger?: number } | null = null;
    if (this.phase === 'bail') hint = 'אאוץ׳! עוד רגע ממשיכים…';
    else if (this.grind) {
      lines.push(`🔩 ${grindName(this.family, this.grind.mode, this.grind.s.tag === 'ledge')} ${this.grind.t.toFixed(1)} ש׳`);
      hint = 'A/D – איזון על המעקה · W נוז · S טייל';
      bar = { value: (this.grind.bal.b + 1) / 2, label: 'איזון', color: '#7fe0ff', danger: 0.85 };
    } else if (this.manual) {
      lines.push(`⚖️ ${this.family === 'board' ? 'מנואל' : 'ווילי'} ${this.manual.t.toFixed(1)} ש׳`);
      hint = 'W/S – איזון · עזבו Shift לסיום';
      bar = { value: (this.manual.bal.b + 1) / 2, label: 'איזון', color: '#ffcf3a', danger: 0.85 };
    } else if (air && this.walk.airborne) {
      const flips = air.flipKind ? [...air.flips, air.flipKind] : air.flips;
      const t = airTrick(this.family, { spin: this.walk.airSpin, flips, grab: air.grab, airTime: this.walk.airTime });
      lines.push(`✈️ ${t ? t.name : 'באוויר!'}`);
      hint = 'A/D סיבוב · W/S פליפ · רווח (+כיוון) גראב';
    } else hint = 'W דחיפה · A/D פנייה · רווח אולי · Shift מנואל · רמפות = אוויר!';
    lines.push(`מתקנים: ${this.used.size}/${this.obstacleCount} · נפילות: ${this.falls}`);
    ui.set({
      timer: this.left,
      score: this.score,
      combo: this.combo.active ? `×${this.combo.multiplier} · ${this.combo.value.toLocaleString('he-IL')}` : null,
      lines,
      hint,
      bar,
    });
  }

  private crowd(kind: 'cheer' | 'clap'): void {
    if (!this.spectators.length) return;
    for (const s of this.spectators) s.setActivity(kind);
    this.cheerT = 1.6;
    if (kind === 'cheer') this.ctx.sfx('cheer', 0.5);
  }

  private boardPos(): THREE.Vector3 {
    const h = this.v!.holder.position;
    return new THREE.Vector3(h.x, h.y + 0.1, h.z);
  }

  private resetVisuals(): void {
    if (this.deck) this.deck.rotation.set(0, 0, 0);
    if (this.body) this.body.rotation.set(0, 0, 0);
    if (this.steerNode) this.steerNode.rotation.y = 0;
  }

  private end(): void {
    if (this.manual) this.endManual();
    if (this.grind) this.endGrind();
    this.bankCombo();
    this.ctx.finish({
      score: this.score,
      detail: verdict(this.score),
      stats: [
        ['טריקים', String(this.tricks)],
        ['הקומבו הגדול', this.bestCombo.toLocaleString('he-IL')],
        ['מתקנים שנוסו', `${this.used.size} מתוך ${this.obstacleCount}`],
        ['נפילות', String(this.falls)],
      ],
    });
  }

  dispose(): void {
    this.walk.airListeners.delete(this.onAir);
    this.resetVisuals();
    if (this.v) this.v.holder.rotation.z = 0;
    const spec = this.v?.def.vehicle;
    if (spec && this.walk.driving) this.walk.character.setPose(spec.rider.pose === 'stand' ? 'stand' : spec.rider.pose, spec.rider.y);
    // a board that only existed for this round goes away with the rider stepping off it
    if (this.tempBoard && this.walk.currentVehicle === this.tempBoard) this.walk.interact();
    for (const s of this.spectators) s.dispose();
    this.spectators = [];
    this.ctx.ui.set({ bar: null, combo: null });
  }
}

