import * as THREE from 'three';
import { itemSize } from '../../../catalog';
import { PIER } from '../../../catalog/items/_gameDLake';
import type { Vec2 } from '../../../model/types';
import type { Occupation, OccupationFrame } from '../../../render3d/WalkController';
import { Bin, CameraRig, Flash, clamp, easeOut, lerp, onWater } from '../football/shared';
import type { MiniGameContext, MiniGameDef, MiniGameSession } from '../types';
import {
  FISH_COUNT,
  RARITY,
  addToAlbum,
  albumFishCount,
  catchPoints,
  fightStrength,
  fmtKg,
  loadAlbum,
  rollCatch,
  saveAlbum,
  startFight,
  stepFight,
  strikeWindow,
  type Album,
  type Catch,
  type Fight,
} from './species';
import { LAKE, buildLake } from './venue';

const ROUND = 180;
const MIN_CAST = 3;
const MAX_CAST = 18;
const WATER_Y = 0.02;
const SWALLOW = /^(Key|Arrow|Digit|Space|Enter|Shift|Numpad)/;

type Phase = 'intro' | 'ready' | 'charge' | 'cast' | 'wait' | 'bite' | 'fight' | 'landing' | 'photo' | 'reelback' | 'over';

class FishingRound implements MiniGameSession {
  private bin = new Bin();
  private cam: CameraRig;
  private flash: Flash;
  private phase: Phase = 'intro';
  private phaseT = 0;
  private timeLeft = ROUND;
  private held = new Set<string>();
  private album: Album;
  private albumStart: number;
  // where we stand
  private stand: Vec2;
  private floor: number;
  private dir: Vec2;
  private right: Vec2;
  private facing: number;
  // cast
  private charge = 0;
  private chargeT = 0;
  private aimAngle = 0;
  private castFrom = new THREE.Vector3();
  private castTo = new THREE.Vector3();
  private castDist = 0;
  private castDur = 0.8;
  private bobber = new THREE.Vector3();
  private biteAt = 0;
  private nibbles: number[] = [];
  private fish: Catch | null = null;
  private fight: Fight | null = null;
  private lateral = 0;
  private strength = 0.5;
  // score
  private score = 0;
  private catches: Catch[] = [];
  private roundSpecies = new Set<string>();
  private newSpecies = 0;
  private lost = 0;
  private heaviest: Catch | null = null;
  // 3D
  private rod: THREE.Group;
  private rodTip: THREE.Group;
  private rodPitch = 0.7;
  private rodBend = 0;
  private line: THREE.Line;
  private linePos: Float32Array;
  private bobberMesh: THREE.Group;
  private aimRing: THREE.Mesh;
  private shadowFish: THREE.Mesh;
  private ripples: Array<{ m: THREE.Mesh; t: number }> = [];
  private fishModel: THREE.Group | null = null;
  private occ: Occupation;
  private jumpTimer = 3;
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(private ctx: MiniGameContext) {
    this.album = loadAlbum();
    this.albumStart = albumFishCount(this.album);
    // the pier (the one in the lake plot first); without one: the middle of the lake's north shore
    const plotC = ctx.plotToSite(25, 25);
    const piers = ctx.props((it) => it.catalogId === 'fishing-pier').sort((a, b) => Math.hypot(a.pos.x - plotC.x, a.pos.y - plotC.y) - Math.hypot(b.pos.x - plotC.x, b.pos.y - plotC.y));
    const pier = piers[0];
    if (pier) {
      const size = itemSize(pier.def, pier.item);
      const th = pier.rotation;
      this.dir = { x: -Math.sin(th), y: Math.cos(th) };
      const along = size.d / 2 - 0.7;
      this.stand = { x: pier.pos.x + this.dir.x * along, y: pier.pos.y + this.dir.y * along };
      this.floor = pier.floorY + PIER.deckY * (size.h / PIER.h) + 0.01;
    } else {
      const s = ctx.plotToSite(25.5, LAKE.y0 - 0.6);
      this.stand = s;
      this.dir = { x: 0, y: 1 };
      this.floor = ctx.groundAt(s.x, s.y);
    }
    this.right = { x: -this.dir.y, y: this.dir.x };
    this.facing = Math.atan2(this.dir.x, this.dir.y);
    this.cam = new CameraRig(ctx.camera);
    this.flash = new Flash(this.bin, ctx.root);

    // rod: butt at the origin, along +Y
    this.rod = new THREE.Group();
    const cork = this.bin.add(new THREE.MeshStandardMaterial({ color: '#b98a5a', roughness: 0.9 }));
    const blank = this.bin.add(new THREE.MeshStandardMaterial({ color: '#1d3557', roughness: 0.35, metalness: 0.3 }));
    const metal = this.bin.add(new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.3, metalness: 0.9 }));
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.34, 10), cork);
    handle.position.y = 0.1;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, 1.0, 8), blank);
    lower.position.y = 0.77;
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 14), metal);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0.04, 0.2, 0.02);
    this.rodTip = new THREE.Group();
    this.rodTip.position.y = 1.27;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.009, 0.95, 6), blank);
    upper.position.y = 0.475;
    this.rodTip.add(upper);
    for (const y of [0.45, 0.75, 1.05]) {
      const g = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 4, 8), metal);
      g.position.set(0, y, 0.012);
      this.rod.add(g);
    }
    this.rod.add(handle, lower, reel, this.rodTip);
    for (const m of [handle, lower, upper]) m.castShadow = true;
    ctx.root.add(this.rod);

    // line
    this.linePos = new Float32Array(25 * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(lg, this.bin.add(new THREE.LineBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.85 })));
    this.line.frustumCulled = false;
    ctx.root.add(this.line);

    // bobber: red top, white bottom, a little antenna that glows at night
    this.bobberMesh = new THREE.Group();
    const red = this.bin.add(new THREE.MeshStandardMaterial({ color: '#e0302a', roughness: 0.4, emissive: '#ff2a1a', emissiveIntensity: 0.25 }));
    const white = this.bin.add(new THREE.MeshStandardMaterial({ color: '#f6f6f2', roughness: 0.4 }));
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), red);
    stick.position.y = 0.1;
    this.bobberMesh.add(top, bottom, stick);
    this.bobberMesh.visible = false;
    ctx.root.add(this.bobberMesh);

    // aim marker on the water while charging
    const ringMat = this.bin.add(new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.8, depthWrite: false }));
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 32), ringMat);
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.visible = false;
    ctx.root.add(this.aimRing);
    // a dark fish shape under the water that comes to the bait
    const shMat = this.bin.add(new THREE.MeshBasicMaterial({ color: '#0b2530', transparent: true, opacity: 0, depthWrite: false }));
    this.shadowFish = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), shMat);
    this.shadowFish.rotation.x = -Math.PI / 2;
    this.shadowFish.scale.set(0.35, 1, 1);
    ctx.root.add(this.shadowFish);
    // ripples
    const ripMat = this.bin.add(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), ripMat.clone());
      this.bin.add(m.material as THREE.Material);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      ctx.root.add(m);
      this.ripples.push({ m, t: 9 });
    }

    this.occ = {
      activity: 'game',
      lockMovement: true,
      label: 'דייג באגם',
      frame: () => this.standFrame(),
    };
    ctx.walk.occupy(this.occ);
    ctx.ui.set({ score: 0, scoreLabel: 'נקודות', timer: ROUND, lines: this.lines(), hint: 'מתכוננים לדוג…' });
    ctx.ui.banner('🎣 דייג באגם – 3 דקות!', 1500);
    void ctx.ui.countdown().then(() => {
      if (this.phase === 'intro') this.enter('ready');
    });
  }

  // ---- helpers -----------------------------------------------------------------------------

  private standFrame(): OccupationFrame {
    // lean a little with the fish while fighting
    const lean = this.phase === 'fight' ? clamp(this.lateral * 0.05, -0.35, 0.35) : this.phase === 'charge' ? this.aimAngle : 0;
    return { x: this.stand.x, y: this.stand.y, floor: this.floor, facing: this.facing + lean, pose: 'stand' };
  }

  /** a point on the water: `d` meters out from where we stand, `side` meters to the right */
  private waterPoint(d: number, side: number, out: THREE.Vector3): THREE.Vector3 {
    const x = this.stand.x + this.dir.x * d + this.right.x * side;
    const y = this.stand.y + this.dir.y * d + this.right.y * side;
    return out.set(x, this.ctx.groundAt(x, y) + WATER_Y, y);
  }

  private enter(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    const ui = this.ctx.ui;
    const hints: Partial<Record<Phase, string | null>> = {
      ready: 'להחזיק רווח – לטעון הטלה (A/D – לכוון) · לשחרר – להטיל',
      charge: 'לשחרר את הרווח כשהמד גבוה – הטלה רחוקה = דגים נדירים',
      wait: 'מחכים לנשיכה… לא למשוך מוקדם מדי!',
      bite: '!!! רווח – עכשיו !!!',
      fight: 'להחזיק רווח – לגלגל · לשחרר כשהחוט מתוח · A/D – ללכת עם הדג',
      photo: null,
      cast: null,
      landing: null,
      reelback: null,
    };
    if (p in hints) ui.set({ hint: hints[p] ?? null });
    if (p !== 'fight' && p !== 'charge') ui.set({ bar: null });
    this.aimRing.visible = p === 'charge';
  }

  private lines(extra?: string[]): string[] {
    const album = albumFishCount(this.album);
    return [`דגים: ${this.catches.filter((c) => !c.species.junk).length} · באלבום ${album}/${FISH_COUNT}`, ...(extra ?? [])];
  }

  private ripple(at: THREE.Vector3, size = 1): void {
    const r = this.ripples.reduce((a, b) => (b.t > a.t ? b : a));
    r.t = 0;
    r.m.position.set(at.x, at.y + 0.01, at.z);
    r.m.userData.size = size;
    r.m.visible = true;
  }

  // ---- frame -------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    if (ctx.walk.occupation !== this.occ) ctx.walk.occupy(this.occ);
    this.phaseT += dt;
    if (this.phase !== 'intro' && this.phase !== 'over') {
      this.timeLeft -= dt;
      ctx.ui.set({ timer: Math.max(0, this.timeLeft) });
      if (this.timeLeft <= 0 && this.phase !== 'fight' && this.phase !== 'landing' && this.phase !== 'photo') {
        this.end();
        return;
      }
    }
    const held = this.held;
    switch (this.phase) {
      case 'ready':
        if (held.has('KeyA') || held.has('ArrowLeft')) this.aimAngle = Math.min(0.6, this.aimAngle + dt * 0.9);
        if (held.has('KeyD') || held.has('ArrowRight')) this.aimAngle = Math.max(-0.6, this.aimAngle - dt * 0.9);
        break;
      case 'charge': {
        if (held.has('KeyA') || held.has('ArrowLeft')) this.aimAngle = Math.min(0.6, this.aimAngle + dt * 0.9);
        if (held.has('KeyD') || held.has('ArrowRight')) this.aimAngle = Math.max(-0.6, this.aimAngle - dt * 0.9);
        this.chargeT += dt / 1.2;
        const c = this.chargeT % 2;
        this.charge = c < 1 ? c : 2 - c;
        ctx.ui.set({ bar: { value: this.charge, label: `מרחק הטלה: ${Math.round(this.castDistance())} מ'`, color: '#2a8fb5' } });
        const d = this.castDistance();
        this.waterPoint(d * Math.cos(this.aimAngle), -d * Math.sin(this.aimAngle), this.v);
        this.aimRing.position.set(this.v.x, this.v.y + 0.02, this.v.z);
        const ok = onWater(ctx.project().site.areas, this.v.x, this.v.z);
        (this.aimRing.material as THREE.MeshBasicMaterial).color.set(ok ? '#ffe14a' : '#ff5a4a');
        this.rodPitch = lerp(this.rodPitch, 1.25, Math.min(1, dt * 6));
        break;
      }
      case 'cast':
        this.updateCast(dt);
        break;
      case 'wait':
        this.updateWait(dt);
        break;
      case 'bite':
        this.bobber.y = this.waterY() - 0.07;
        if (this.fish && this.phaseT > strikeWindow(this.fish)) {
          ctx.ui.popup('הדג ברח עם הפיתיון…', '#ffb0a0');
          ctx.sfx('miss', 0.6);
          this.lost++;
          this.reelBack();
        }
        break;
      case 'fight':
        this.updateFight(dt);
        break;
      case 'landing':
        this.updateLanding(dt);
        break;
      case 'photo':
        if (this.phaseT > 3.0) {
          this.clearFishModel();
          this.ctx.walk.character.setActivity('game');
          if (this.timeLeft <= 0) this.end();
          else this.enter('ready');
        }
        break;
      case 'reelback': {
        const u = clamp(this.phaseT / 0.7, 0, 1);
        this.tipWorld(this.v2);
        this.bobber.lerpVectors(this.castTo, this.v2, easeOut(u));
        if (u >= 1) {
          this.bobberMesh.visible = false;
          this.enter('ready');
        }
        break;
      }
      default:
        break;
    }
    if (this.phase === 'ready' || this.phase === 'wait' || this.phase === 'bite' || this.phase === 'reelback') this.rodPitch = lerp(this.rodPitch, 0.75, Math.min(1, dt * 4));
    this.ambientLife(dt);
    this.updateRod(dt);
    this.followHand();
    this.updateLine();
    this.updateRipples(dt);
    this.updateCamera(dt);
    this.flash.update(dt, ctx.camera);
  }

  private waterY(): number {
    return this.ctx.groundAt(this.bobber.x, this.bobber.z) + WATER_Y;
  }

  private castDistance(): number {
    return MIN_CAST + (MAX_CAST - MIN_CAST) * this.charge;
  }

  private release(): void {
    const ctx = this.ctx;
    this.castDist = this.castDistance();
    const a = this.aimAngle;
    this.waterPoint(this.castDist * Math.cos(a), -this.castDist * Math.sin(a), this.castTo);
    this.tipWorld(this.castFrom);
    this.castDur = 0.55 + this.castDist * 0.03;
    ctx.walk.character.setActivity('throw');
    ctx.sfx('whoosh', 0.7);
    this.enter('cast');
  }

  private updateCast(_dt: number): void {
    const ctx = this.ctx;
    // the rod swings back, then forward; the bobber leaves at the forward swing
    const t = this.phaseT;
    this.rodPitch = t < 0.22 ? lerp(0.9, 2.1, t / 0.22) : lerp(2.1, 0.45, clamp((t - 0.22) / 0.2, 0, 1));
    const fly = t - 0.38;
    if (fly < 0) {
      this.tipWorld(this.bobber);
      this.bobberMesh.visible = true;
      return;
    }
    const u = clamp(fly / this.castDur, 0, 1);
    this.bobber.lerpVectors(this.castFrom, this.castTo, u);
    this.bobber.y += Math.sin(u * Math.PI) * (1.2 + this.castDist * 0.18) * (1 - u * 0.2);
    if (u >= 1) {
      this.bobber.copy(this.castTo);
      const ok = onWater(ctx.project().site.areas, this.castTo.x, this.castTo.z);
      if (!ok) {
        ctx.ui.popup('אופס – זה נחת על היבשה! מטילים שוב', '#ffd0a0');
        ctx.sfx('bounce', 0.5);
        this.reelBack();
        return;
      }
      ctx.sfx('splash', 0.6);
      ctx.emit('water', this.castTo.clone(), 10, 0.15);
      this.ripple(this.castTo, 0.8);
      // how long until a bite: the golden hours are quicker
      const h = ctx.hour();
      const golden = (h >= 5 && h < 8.5) || (h >= 17 && h < 20.5);
      this.biteAt = (2.2 + ctx.random() * 4.5) * (golden ? 0.75 : 1);
      this.nibbles = [];
      const n = Math.floor(ctx.random() * 3);
      for (let i = 0; i < n; i++) this.nibbles.push(0.6 + ctx.random() * (this.biteAt - 1.2));
      this.nibbles.sort((a, b) => a - b);
      const far = clamp((this.castDist - MIN_CAST) / (MAX_CAST - MIN_CAST), 0, 1);
      this.fish = rollCatch(h, far, ctx.random);
      this.enter('wait');
    }
  }

  private updateWait(dt: number): void {
    const ctx = this.ctx;
    const t = this.phaseT;
    const base = this.waterY();
    let dip = 0;
    for (const n of this.nibbles) {
      const k = t - n;
      if (k > 0 && k < 0.35) dip = Math.max(dip, Math.sin((k / 0.35) * Math.PI) * 0.035);
      if (k > 0 && k - dt <= 0) {
        this.ripple(this.bobber, 0.35);
        ctx.sfx('pop', 0.25);
      }
    }
    this.bobber.y = base + Math.sin(ctx.elapsed() * 2.2) * 0.008 - dip;
    // the fish's shadow comes in during the last seconds
    const sh = this.shadowFish;
    const left = this.biteAt - t;
    const m = sh.material as THREE.MeshBasicMaterial;
    if (left < 2.2 && this.fish && !this.fish.species.junk) {
      const u = 1 - left / 2.2;
      const s = 0.4 + Math.min(1.6, this.fish.length / 60);
      const ang = this.facing + 1.1;
      sh.position.set(this.bobber.x + Math.sin(ang) * (1 - u) * 2.2, base - 0.01, this.bobber.z + Math.cos(ang) * (1 - u) * 2.2);
      sh.rotation.z = ang;
      sh.scale.set(0.35 * s, s, 1);
      m.opacity = 0.45 * u;
    } else m.opacity = 0;
    if (t >= this.biteAt) {
      m.opacity = 0;
      this.ripple(this.bobber, 1);
      ctx.emit('water', this.bobber.clone(), 14, 0.2);
      ctx.sfx('splash', 0.9);
      ctx.ui.popup('!!!', '#ffffff');
      this.enter('bite');
    }
  }

  private strike(): void {
    const ctx = this.ctx;
    if (this.phase === 'wait') {
      // too early: the fish swims off and a new one comes later
      ctx.ui.popup('מוקדם מדי – הדג נבהל!', '#ffd0a0');
      ctx.sfx('miss', 0.4);
      this.biteAt = this.phaseT + 3 + ctx.random() * 3;
      this.nibbles = [this.phaseT + 1.2 + ctx.random()];
      (this.shadowFish.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    if (this.phase !== 'bite' || !this.fish) return;
    const quick = this.phaseT < 0.35;
    ctx.ui.popup(quick ? 'תפיסה מהירה!' : 'נתפס!', '#5be38a');
    ctx.sfx('whoosh', 0.6);
    this.fight = startFight(this.castDist, ctx.random);
    if (quick) this.fight.stamina = 0.85;
    this.strength = fightStrength(this.fish);
    this.lateral = Math.sin(this.aimAngle) * -this.castDist;
    this.bobberMesh.visible = false;
    this.enter('fight');
  }

  private updateFight(dt: number): void {
    const ctx = this.ctx;
    const f = this.fight!;
    const reel = this.held.has('Space');
    const steer = this.held.has('KeyA') || this.held.has('ArrowLeft') ? -1 : this.held.has('KeyD') || this.held.has('ArrowRight') ? 1 : 0;
    const end = stepFight(f, dt, reel, steer, this.strength, ctx.random);
    // the fish swims sideways while it runs
    if (f.run) this.lateral += f.dir * dt * (1.2 + this.strength * 2);
    this.lateral = clamp(this.lateral, -f.dist * 0.7, f.dist * 0.7);
    const along = Math.sqrt(Math.max(0.5, f.dist * f.dist - this.lateral * this.lateral));
    this.waterPoint(along, this.lateral, this.bobber);
    this.rodPitch = lerp(this.rodPitch, 1.0 + f.tension * 0.35, Math.min(1, dt * 5));
    this.rodBend = f.tension;
    // splashes when it fights near the surface
    if (f.run && ctx.random() < dt * 3) {
      ctx.emit('water', this.bobber.clone(), 6, 0.25);
      this.ripple(this.bobber, 0.6);
    }
    if (reel && ctx.random() < dt * 9) ctx.walk.character.strike(-1);
    // its dark shape under the surface where the line goes in
    const sh = this.shadowFish;
    const s = 0.4 + Math.min(1.6, (this.fish?.length ?? 40) / 60);
    sh.position.set(this.bobber.x, this.bobber.y - 0.03, this.bobber.z);
    sh.rotation.z = this.facing + (f.dir * Math.PI) / 2 + Math.PI;
    sh.scale.set(0.35 * s, s, 1);
    (sh.material as THREE.MeshBasicMaterial).opacity = this.fish?.species.junk ? 0 : 0.5;
    const arrow = f.run && f.dir ? (f.dir < 0 ? '⬅ הדג מושך שמאלה – A' : 'הדג מושך ימינה – D ➡') : f.run ? 'הדג בורח פנימה!' : 'הדג נח – גלגלו!';
    const col = f.tension > 0.85 ? '#e0402f' : f.tension > 0.6 ? '#f0b429' : '#2fbf5b';
    ctx.ui.set({ bar: { value: f.tension, label: 'מתח החוט', color: col, danger: 0.85 }, lines: this.lines([`מרחק: ${f.dist.toFixed(1)} מ'`, arrow]) });
    if (f.tension > 0.9 && ctx.random() < dt * 4) ctx.sfx('squeak', 0.3);
    if (!end) return;
    if (end === 'landed') {
      this.land();
      return;
    }
    this.lost++;
    if (end === 'snapped') {
      ctx.ui.banner('💥 החוט נקרע!', 1300);
      ctx.sfx('clack', 0.9);
    } else {
      ctx.ui.banner('הדג השתחרר מהקרס…', 1300);
      ctx.sfx('splash', 0.5);
    }
    this.fight = null;
    this.rodBend = 0;
    this.ctx.ui.set({ lines: this.lines() });
    (this.shadowFish.material as THREE.MeshBasicMaterial).opacity = 0;
    this.castTo.copy(this.bobber);
    this.bobberMesh.visible = true;
    this.enter('reelback');
  }

  private land(): void {
    const ctx = this.ctx;
    const c = this.fish!;
    this.fight = null;
    this.rodBend = 0;
    (this.shadowFish.material as THREE.MeshBasicMaterial).opacity = 0;
    ctx.ui.set({ bar: null });
    this.fishModel = this.buildFishModel(c);
    this.fishModel.position.copy(this.bobber);
    ctx.root.add(this.fishModel);
    ctx.emit('water', this.bobber.clone(), 18, 0.3);
    ctx.sfx('splash', 1);
    this.enter('landing');
  }

  private updateLanding(_dt: number): void {
    const ctx = this.ctx;
    const ch = ctx.walk.character;
    const u = clamp(this.phaseT / 0.6, 0, 1);
    const hand = ch.handWorld(this.v2);
    if (this.fishModel) {
      this.fishModel.position.lerpVectors(this.bobber, hand, easeOut(u));
      this.fishModel.position.y += Math.sin(u * Math.PI) * 0.8;
      this.fishModel.rotation.z = Math.sin(this.phaseT * 30) * 0.4 * (1 - u);
    }
    if (u < 1) return;
    // the catch!
    const c = this.fish!;
    const pts = catchPoints(c);
    const variety = !c.species.junk && !this.roundSpecies.has(c.species.id) ? 50 : 0;
    this.roundSpecies.add(c.species.id);
    const isNew = addToAlbum(this.album, c);
    saveAlbum(this.album);
    if (isNew && !c.species.junk) this.newSpecies++;
    this.catches.push(c);
    if (!c.species.junk && (!this.heaviest || c.weight > this.heaviest.weight)) this.heaviest = c;
    this.score += pts + variety;
    const rar = RARITY[c.species.rarity];
    ctx.ui.set({
      score: this.score,
      lines: this.lines([`📸 ${c.species.name} ${c.species.junk ? '' : rar.stars}`, c.species.junk ? 'מציאה מהאגם!' : `${fmtKg(c.weight)} · ${c.length} ס״מ · ${rar.label}`, `+${pts}${variety ? ` (+${variety} מין חדש בסיבוב)` : ''}`]),
    });
    if (isNew && !c.species.junk) {
      ctx.ui.banner(`✨ מין חדש באלבום! ${c.species.name}`, 2200);
      ctx.sfx('fanfare', 0.7);
      ctx.emit('confetti', hand.clone().add(this.v.set(0, 0.5, 0)), 30, 0.6);
    } else ctx.ui.banner(`🎣 ${c.species.name}${c.species.junk ? '' : ` – ${fmtKg(c.weight)}`}`, 1800);
    ctx.ui.popup(`+${pts + variety}`, rar.color);
    ctx.sfx(c.species.rarity === 'common' ? 'success' : 'star', 0.8);
    ch.setActivity('cheer');
    ch.gesture('cheer');
    this.flash.fire();
    ctx.sfx('camera', 0.8);
    this.enter('photo');
  }

  private reelBack(): void {
    this.castTo.copy(this.bobber);
    this.fight = null;
    this.rodBend = 0;
    (this.shadowFish.material as THREE.MeshBasicMaterial).opacity = 0;
    this.enter('reelback');
  }

  private end(): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    const fish = this.catches.filter((c) => !c.species.junk);
    const album = albumFishCount(this.album);
    const h = this.heaviest;
    this.ctx.finish({
      score: this.score,
      detail: fish.length ? `תפסת ${fish.length} דגים מ-${new Set(fish.map((c) => c.species.id)).size} מינים שונים!` : 'הפעם הדגים לא נשכו… נסו הטלה רחוקה יותר',
      stats: [
        ['דגים שנתפסו', String(fish.length)],
        ['הדג הכבד ביותר', h ? `${h.species.name} · ${fmtKg(h.weight)}` : '—'],
        ['מינים חדשים באלבום', String(this.newSpecies)],
        ['📔 האלבום שלך', `${album} / ${FISH_COUNT} מינים`],
        ['דגים שברחו', String(this.lost)],
      ],
    });
  }

  // ---- visuals -----------------------------------------------------------------------------

  private tipWorld(out: THREE.Vector3): THREE.Vector3 {
    this.rod.updateMatrixWorld(true);
    return this.rodTip.localToWorld(out.set(0, 0.95, 0));
  }

  private updateRod(dt: number): void {
    const ch = this.ctx.walk.character;
    ch.handWorld(this.v);
    this.rod.position.copy(this.v);
    // direction: forward (where we face) pitched up by rodPitch
    const f = this.facing + (this.phase === 'fight' ? clamp(this.lateral * 0.05, -0.35, 0.35) : this.phase === 'charge' || this.phase === 'ready' ? this.aimAngle : 0);
    const fx = Math.sin(f);
    const fz = Math.cos(f);
    const p = this.rodPitch;
    this.v2.set(fx * Math.cos(p), Math.sin(p), fz * Math.cos(p)).normalize();
    this.q.setFromUnitVectors(this.up, this.v2);
    this.rod.quaternion.copy(this.q);
    // the tip bends towards the fish with the tension
    const bendTarget = this.rodBend * 0.75;
    this.rodTip.rotation.x = lerp(this.rodTip.rotation.x, bendTarget, Math.min(1, dt * 8));
    this.rod.visible = this.phase !== 'photo' || this.phaseT < 0.1;
    this.bobberMesh.position.copy(this.bobber);
    // a little bigger far away, so that a child can see it dip
    const far = this.v.distanceTo(this.bobber);
    this.bobberMesh.scale.setScalar(1 + Math.max(0, far - 3) * 0.12);
  }

  private updateLine(): void {
    const show = this.bobberMesh.visible || this.phase === 'fight' || this.phase === 'landing';
    this.line.visible = show && this.phase !== 'photo';
    if (!this.line.visible) return;
    const tip = this.tipWorld(this.v);
    const end = this.phase === 'landing' && this.fishModel ? this.fishModel.position : this.bobber;
    const tension = this.phase === 'fight' ? this.fight?.tension ?? 0.5 : this.phase === 'cast' ? 0.9 : 0.15;
    const sag = (1 - tension) * Math.min(1.5, tip.distanceTo(end) * 0.12);
    const a = this.linePos;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      a[i * 3] = lerp(tip.x, end.x, t);
      a[i * 3 + 1] = lerp(tip.y, end.y, t) - Math.sin(t * Math.PI) * sag;
      a[i * 3 + 2] = lerp(tip.z, end.z, t);
    }
    (this.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateRipples(dt: number): void {
    for (const r of this.ripples) {
      if (r.t > 2) {
        r.m.visible = false;
        continue;
      }
      r.t += dt;
      const s = (0.15 + r.t * 0.9) * (r.m.userData.size ?? 1);
      r.m.scale.set(s, s, s);
      (r.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 * (1 - r.t / 2));
    }
  }

  /** fish jumping somewhere in the lake now and then (the lake is alive) */
  private ambientLife(dt: number): void {
    this.jumpTimer -= dt;
    if (this.jumpTimer > 0) return;
    const ctx = this.ctx;
    this.jumpTimer = 4 + ctx.random() * 6;
    const d = 6 + ctx.random() * 14;
    const side = (ctx.random() - 0.5) * 16;
    this.waterPoint(d, side, this.v);
    if (!onWater(ctx.project().site.areas, this.v.x, this.v.z)) return;
    ctx.emit('water', this.v.clone(), 8, 0.15);
    this.ripple(this.v, 0.7);
  }

  private updateCamera(dt: number): void {
    const s = this.stand;
    const d = this.dir;
    const r = this.right;
    const pos = this.v;
    const look = this.v2;
    if (this.phase === 'photo' || (this.phase === 'landing' && this.phaseT > 0.4)) {
      // a photo from the water: the angler holds the catch up
      pos.set(s.x + d.x * 2.4 + r.x * 0.5, this.floor + 1.5, s.y + d.y * 2.4 + r.y * 0.5);
      look.set(s.x, this.floor + 1.35, s.y);
      this.cam.set(pos, look, dt, 3);
      return;
    }
    const target = this.phase === 'fight' || this.phase === 'wait' || this.phase === 'bite' ? this.bobber : null;
    pos.set(s.x - d.x * 3.4 + r.x * 1.0, this.floor + 2.3, s.y - d.y * 3.4 + r.y * 1.0);
    if (target) look.set(lerp(s.x + d.x * 6, target.x, 0.6), this.floor + 0.2, lerp(s.y + d.y * 6, target.z, 0.6));
    else look.set(s.x + d.x * 8, this.floor + 0.2, s.y + d.y * 8);
    this.cam.set(pos, look, dt, 2.5);
  }

  private buildFishModel(c: Catch): THREE.Group {
    const g = new THREE.Group();
    const [back, belly, fin] = c.species.colors;
    const len = clamp(c.length / 100, 0.12, 1.4) * (c.species.junk ? 1 : 1);
    const mb = this.bin.add(new THREE.MeshStandardMaterial({ color: back, roughness: 0.35, metalness: 0.2 }));
    const mw = this.bin.add(new THREE.MeshStandardMaterial({ color: belly, roughness: 0.4, metalness: 0.15 }));
    const mf = this.bin.add(new THREE.MeshStandardMaterial({ color: fin, roughness: 0.5, side: THREE.DoubleSide }));
    if (c.species.id === 'boot') {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.12), mb);
      leg.position.set(0, 0.11, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.26), mb);
      foot.position.set(0, -0.02, 0.07);
      g.add(leg, foot);
      return g;
    }
    if (c.species.id === 'bottle') {
      const glass = this.bin.add(new THREE.MeshStandardMaterial({ color: back, transparent: true, opacity: 0.6, roughness: 0.1 }));
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 12), glass);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03, 0.08, 10), glass);
      neck.position.y = 0.14;
      const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), mw);
      g.add(b, neck, paper);
      g.rotation.z = Math.PI / 2;
      return g;
    }
    // the fish hangs head-up from the hand: its length runs along Y
    const shape = c.species.shape ?? 1;
    const h = (len / (3.2 * shape)) * 1.0;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), mb);
    body.scale.set(h * 0.55, len * 0.5, h);
    body.position.y = -len * 0.45;
    const bel = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), mw);
    bel.scale.set(h * 0.5, len * 0.42, h * 0.8);
    bel.position.set(0, -len * 0.47, h * 0.18);
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.lineTo(-h * 0.7, -h * 0.9);
    tailShape.quadraticCurveTo(0, -h * 0.55, h * 0.7, -h * 0.9);
    tailShape.closePath();
    const tail = new THREE.Mesh(new THREE.ShapeGeometry(tailShape), mf);
    tail.rotation.y = Math.PI / 2;
    tail.position.y = -len * 0.92;
    const dorsal = new THREE.Shape();
    dorsal.moveTo(0, 0);
    dorsal.lineTo(len * 0.12, h * 0.45);
    dorsal.lineTo(len * 0.3, 0);
    dorsal.closePath();
    const df = new THREE.Mesh(new THREE.ShapeGeometry(dorsal), mf);
    df.rotation.set(0, Math.PI / 2, Math.PI / 2);
    df.position.set(0, -len * 0.62, -h * 0.4);
    const eyeM = this.bin.add(new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.2 }));
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.008, h * 0.09), 8, 6), eyeM);
      eye.position.set(s * h * 0.25, -len * 0.12, h * 0.2);
      g.add(eye);
    }
    for (const m of [body, bel, tail, df]) m.castShadow = true;
    g.add(body, bel, tail, df);
    // tiny fish are shown a bit bigger so the photo shows them
    g.scale.setScalar(Math.max(1, 0.3 / len));
    return g;
  }

  private clearFishModel(): void {
    if (this.fishModel) {
      this.fishModel.removeFromParent();
      this.fishModel.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      this.fishModel = null;
    }
  }

  // ---- input -------------------------------------------------------------------------------

  key(code: string, down: boolean): boolean {
    if (code === 'Escape') return false;
    if (down) this.held.add(code);
    else this.held.delete(code);
    if (code === 'Space') {
      if (down && this.phase === 'ready') {
        this.charge = 0;
        this.chargeT = 0;
        this.enter('charge');
      } else if (!down && this.phase === 'charge') this.release();
      else if (down && (this.phase === 'wait' || this.phase === 'bite')) this.strike();
    }
    return SWALLOW.test(code);
  }

  /** keep the fish model following the hand while the photo is taken */
  private followHand(): void {
    if (!this.fishModel || this.phase !== 'photo') return;
    this.ctx.walk.character.handWorld(this.v);
    this.fishModel.position.copy(this.v);
    this.fishModel.rotation.set(0, this.facing, 0);
  }

  dispose(): void {
    const walk = this.ctx.walk;
    if (walk.occupation === this.occ) walk.release();
    this.bin.dispose();
  }
}

/** the album, shown on the "how to play" card */
function albumLine(): string {
  const a = loadAlbum();
  const n = albumFishCount(a);
  return n ? `📔 האלבום שלך: ${n} מתוך ${FISH_COUNT} מינים – יש עוד לגלות!` : `📔 ${FISH_COUNT} מיני דגים לאסוף לאלבום – חלקם רק בלילה או עם שחר`;
}

const HOW_TO = [
  '3 דקות של דייג מקצה המזח: כמה שיותר נקודות!',
  'להחזיק רווח ולשחרר – הטלה (A/D מכוונים). הטלה רחוקה = דגים גדולים ונדירים',
  'כשהמצוף צולל – רווח מהר! (לא לפני – זה רק נגיסה)',
  'בגלגול: להחזיק רווח, לשחרר כשהמתח אדום; A/D – ללכת עם הדג',
  'נקודות = נדירות × משקל, ובונוס על כל מין חדש',
];

export const GAME: MiniGameDef = {
  id: 'fishing',
  get howTo(): string[] {
    return [...HOW_TO, albumLine()];
  },
  medals: { bronze: 250, silver: 800, gold: 1500, unit: 'points' },
  venue: { plot: 'e-far', build: buildLake },
  start: (ctx) => new FishingRound(ctx),
};
