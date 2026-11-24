import * as THREE from 'three';
import type { AmuseRide } from '../../../catalog/items/_gameCKit';
import type { FurnitureDef } from '../../../catalog/types';
import type { Vec2 } from '../../../model/types';
import type { Occupation } from '../../../render3d/WalkController';
import type { MiniGameContext, MiniGameSession, PlacedProp } from '../types';
import { BONUS, HandsUp, ROUND_SECONDS, allKindsDone, classifyProp, punchLine, ratePark, ridePoints, starText, type ParkInventory, type Punch, type RideKind } from './logic';
import { Crowd, type CrowdRide, type Spot } from './visitors';
import { MIDWAY } from './venue';

/**
 * "כרטיסיית לונה פארק": a 3-minute visit to the park in the 'south' plot. The rides that stand there
 * (the player may have moved or added some in the neighborhood editor) are on the punch card; every
 * completed ride stamps it and scores by its thrill; mini-challenges on the rides add bonuses; the
 * park's rating (variety, food, decorations, lighting) adds a bonus at the start.
 */

interface ParkRide extends CrowdRide {
  prop: PlacedProp;
  punch: Punch;
  holder: THREE.Object3D;
  /** seconds before the next visitors-only cycle may start */
  cool: number;
  npcCycle: boolean;
  /** seconds left of a visitors-only turn on the Ferris wheel */
  npcT: number;
  cyclesSeen: number;
}

/** ride cameras, in the rider's frame: back (−) / front (+), up, side; where to look; how fast to follow */
const CAMS: Record<RideKind, { back: number; up: number; side: number; lookAhead: number; lookUp: number; ease: number }> = {
  coaster: { back: -7.5, up: 2.8, side: 0, lookAhead: 5, lookUp: 0.6, ease: 6 },
  bumper: { back: -5.6, up: 2.9, side: 0, lookAhead: 2.5, lookUp: -0.2, ease: 4 },
  ferris: { back: 5.2, up: 1.6, side: -1.8, lookAhead: 0, lookUp: 0.6, ease: 5 },
  drop: { back: 3.8, up: 1.1, side: 0.8, lookAhead: 0, lookUp: 0.3, ease: 8 },
  pirate: { back: 0.4, up: 1.6, side: 5.5, lookAhead: 0, lookUp: 0.4, ease: 7 },
  teacups: { back: 0, up: 0, side: 0, lookAhead: 0, lookUp: 0.3, ease: 3 },
};

const SEAT = 0.45;
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpF = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const UPW = new THREE.Vector3(0, 1, 0);

/** a calliope waltz: [midi, beats] – played softly on the piano while the park is open */
const WALTZ: Array<[number, number]> = [
  [72, 1], [76, 1], [79, 1], [84, 2], [83, 1], [81, 2], [79, 1], [76, 3],
  [74, 1], [77, 1], [81, 1], [84, 2], [83, 1], [81, 2], [79, 1], [77, 3],
  [76, 1], [79, 1], [84, 1], [88, 2], [86, 1], [84, 2], [81, 1], [79, 3],
  [77, 1], [76, 1], [74, 1], [72, 2], [74, 1], [76, 2], [74, 1], [72, 3],
];
const BASS = [48, 43, 48, 43, 50, 43, 50, 43, 48, 43, 48, 45, 50, 43, 48, 48];

export function startPark(ctx: MiniGameContext): MiniGameSession {
  const walk = ctx.walk;
  const plot = ctx.plotToSite(0, 0);
  const plotEnd = ctx.plotToSite(110, 50);
  const inPlot = (x: number, y: number) => x > plot.x - 4 && x < plotEnd.x + 4 && y > plot.y - 4 && y < plotEnd.y + 4;

  // ---------------------------------------------------------------- what stands in the park
  const all = ctx.props((item) => inPlot(item.x, item.y));
  const rides: ParkRide[] = [];
  const food: Spot[] = [];
  const inv: ParkInventory = { rides: [], food: [], decor: 0, lights: 0 };
  const localToSite = (holder: THREE.Object3D, x: number, z: number): Vec2 => {
    holder.updateWorldMatrix(true, false);
    tmpV.set(x, 0, z);
    holder.localToWorld(tmpV);
    return { x: tmpV.x, y: tmpV.z };
  };
  for (const p of all) {
    const def: FurnitureDef = p.def;
    const rt = p.holder?.userData.body?.userData.amuse as AmuseRide | undefined;
    if (def.ride && rt && p.holder) {
      const e = rt.entrance;
      const entrance = localToSite(p.holder, e.x, e.z);
      const centre = localToSite(p.holder, 0, 0);
      let ax = entrance.x - centre.x;
      let ay = entrance.y - centre.y;
      const l = Math.hypot(ax, ay) || 1;
      ax /= l;
      ay /= l;
      const kind = rt.kind as RideKind;
      inv.rides.push(kind);
      rides.push({
        rt,
        prop: p,
        holder: p.holder,
        entrance,
        away: { x: ax, y: ay },
        facing: Math.atan2(-ax, -ay),
        punch: { id: p.item.id, kind, label: rt.label, icon: rt.icon, thrill: rt.thrill, done: false, rides: 0 },
        cool: 2 + rides.length * 1.7,
        npcCycle: false,
        npcT: 0,
        cyclesSeen: rt.cycles,
      });
      continue;
    }
    const c = classifyProp(def.id, def.tags, !!def.light, !!def.ride);
    if (c === 'food') {
      inv.food.push(def.id);
      if (p.holder) food.push({ at: localToSite(p.holder, 0, def.size.d / 2 + 0.9), facing: Math.atan2(-(localToSite(p.holder, 0, 1).x - localToSite(p.holder, 0, 0).x), -(localToSite(p.holder, 0, 1).y - localToSite(p.holder, 0, 0).y)) });
    } else if (c === 'decor') inv.decor++;
    else if (c === 'light') inv.lights++;
  }
  const rating = ratePark(inv);
  const card = rides.map((r) => r.punch);

  if (!rides.length) {
    ctx.ui.banner('אין מתקנים בפארק! 🎡 הוסיפו מתקנים מהקטלוג (גן שעשועים › לונה פארק)', 4200);
    const h = setTimeout(() => ctx.quit(), 4300);
    return { update() {}, dispose: () => clearTimeout(h) };
  }

  const midY = ctx.plotToSite(0, MIDWAY.y).y;
  const mid = { y: midY, x0: ctx.plotToSite(MIDWAY.x0, 0).x, x1: ctx.plotToSite(MIDWAY.x1, 0).x };
  const watchSpots: Spot[] = rides.map((r) => ({ at: { x: r.entrance.x + r.away.x * 5 + (r.away.y ? 3 : 0), y: r.entrance.y + r.away.y * 5 }, facing: r.facing }));
  const crowd = new Crowd(ctx, rides, food, watchSpots, mid, Math.min(12, 5 + rides.length));

  // ---------------------------------------------------------------- round state
  let score = rating.bonus;
  let left = ROUND_SECONDS;
  let started = false;
  let over = false;
  let challenges = 0;
  let allKindsGiven = false;
  let riding: ParkRide | null = null;
  let waiting: ParkRide | null = null;
  let seat = -1;
  let startCycles = 0;
  let occ: Occupation | null = null;
  let firstPerson = false;
  let handsUp = false;
  let pushing = false;
  const keys = new Set<string>();
  const hands = new HandsUp();
  let photoTaken = false;
  let spinGiven = false;
  let loopGiven = false;
  let rideBumps = 0;
  let swingHands = 0;
  const camPos = new THREE.Vector3();
  let camInit = false;
  let musicT = 0;
  let musicI = 0;
  let beat = 0;
  let lastRuleLine = '';
  let hudT = 0;

  const kindsInPark = new Set(card.map((p) => p.kind));
  const ratingLine = `דירוג הפארק ${starText(rating.overall)} · בונוס ${rating.bonus}`;
  const ratingParts = `🎢 מגוון ${starText(rating.variety)}  🍿 אוכל ${starText(rating.food)}  🌳 נוי ${starText(rating.decor)}  💡 תאורה ${starText(rating.lighting)}`;

  for (const r of rides) {
    r.rt.onEvent = (e) => onRideEvent(r, e);
  }
  // for tests and debugging: where the rides can be boarded
  ctx.root.userData.park = { rides: rides.map((r) => ({ label: r.rt.label, kind: r.rt.kind, entrance: r.entrance, rt: r.rt })), rating };

  // ---------------------------------------------------------------- helpers
  const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
  const nearestRide = (maxD: number): ParkRide | null => {
    let best: ParkRide | null = null;
    let bd = maxD;
    for (const r of rides) {
      const d = dist(walk.pos, r.entrance);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  };
  const busy = (r: ParkRide) => r.rt.state === 'running' || r.rt.state === 'loading';
  /** next ride to go for: the nearest ride without a stamp (preferring one that is free) */
  const nextTarget = (): ParkRide | null => {
    let best: ParkRide | null = null;
    let bd = Infinity;
    for (const r of rides) {
      if (r.punch.done) continue;
      const d = dist(walk.pos, r.entrance) + (busy(r) ? 40 : 0);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  };

  function onRideEvent(r: ParkRide, e: string): void {
    if (r !== riding) return;
    if (e === 'start') ctx.sfx('whoosh', 0.4);
    if (e === 'top' && (r.rt.kind === 'coaster' || r.rt.kind === 'drop')) ctx.ui.banner(r.rt.kind === 'drop' ? 'מחכים… 😬 החזיקו רווח!' : 'הנה זה בא! ידיים למעלה – רווח!', 1400);
    if (e === 'spin' && !spinGiven) {
      spinGiven = true;
      award(BONUS.spin, '🌀 סחרחורת! הספל במהירות מלאה');
    }
    if (e === 'bump' && rideBumps < BONUS.bumpCap) {
      rideBumps++;
      award(BONUS.bump, `💥 בום! (${rideBumps})`, true);
      const n = r.rt.seatFrames[seat];
      if (n) ctx.emit('spark', n.getWorldPosition(tmpV).setY(tmpV.y + 0.3), 10, 0.5);
    }
  }

  function award(points: number, text: string, small = false): void {
    score += points;
    if (!small) challenges++;
    ctx.ui.popup(`${text} +${points}`, '#ffd84a');
    ctx.sfx(small ? 'pop' : 'star', small ? 0.6 : 0.8);
  }

  // ---------------------------------------------------------------- riding
  function board(r: ParkRide): void {
    if (riding) return;
    if (busy(r) || (r.rt.state === 'done' && r.npcCycle && r.rt.kind !== 'ferris')) {
      waiting = r;
      ctx.ui.popup('בתור לסיבוב הבא… ⏳');
      return;
    }
    waiting = null;
    // the player's seat: the free one nearest the entrance
    const ent = new THREE.Vector3(r.entrance.x, ctx.groundAt(r.entrance.x, r.entrance.y) + 1, r.entrance.y);
    let best = -1;
    let bd = Infinity;
    r.rt.seatFrames.forEach((n, i) => {
      if (r.rt.extraRiders.has(i)) return;
      // coasters: the front row is the best seat
      const d = r.rt.kind === 'coaster' ? i : n.getWorldPosition(tmpV).distanceTo(ent);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) {
      ctx.ui.popup('אין מקום פנוי – רגע…');
      return;
    }
    riding = r;
    seat = best;
    startCycles = r.rt.cycles;
    photoTaken = spinGiven = loopGiven = false;
    rideBumps = 0;
    swingHands = 0;
    handsUp = pushing = false;
    keys.clear();
    camInit = false;
    if (r.rt.control) {
      r.rt.control.external = true;
      r.rt.control.throttle = 0;
      r.rt.control.steer = 0;
    }
    // people from the queue come along
    const node = r.rt.seatFrames[seat];
    crowd.board(r, r.rt.kind === 'bumper' ? 4 : 5, new Set([seat]), node.getWorldPosition(new THREE.Vector3()));
    r.npcCycle = false;
    // a ride that has just come back with visitors goes again for the player
    if (r.rt.state === 'done') r.rt.dispatch();
    occ = {
      activity: 'none',
      label: r.rt.label,
      lockMovement: true,
      exit: { x: r.entrance.x + r.away.x * 0.6, y: r.entrance.y + r.away.y * 0.6 },
      frame: (dt) => {
        const push = r.rt.kind === 'teacups' ? (pushing ? 1 : 0.35) : 0;
        if (r.rt.control) {
          const k = keys;
          r.rt.control.throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 0.7 : 0);
          r.rt.control.steer = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
        }
        r.rt.update(dt, push, [seat]);
        const n = r.rt.seatFrames[seat];
        n.updateWorldMatrix(true, false);
        n.getWorldPosition(tmpV);
        n.getWorldQuaternion(tmpQ);
        tmpF.set(0, 0, 1).applyQuaternion(tmpQ);
        return { x: tmpV.x, y: tmpV.z, floor: tmpV.y - SEAT, lift: 0, facing: Math.atan2(tmpF.x, tmpF.z), pose: 'sit', seatHeight: SEAT };
      },
      onEnd: () => {
        if (occ) {
          // ended from outside (should not happen during a ride): get off cleanly
          occ = null;
          leaveRide(false);
        }
      },
    };
    walk.occupy(occ);
    ctx.sfx('click');
    ctx.ui.banner(`${r.rt.icon} ${r.rt.label}`, 1200);
  }

  /** the ride is over (or abandoned): unglue everything */
  function leaveRide(completed: boolean): void {
    const r = riding;
    if (!r) return;
    riding = null;
    if (r.rt.control) {
      r.rt.control.external = false;
      r.rt.control.throttle = r.rt.control.steer = 0;
    }
    crowd.unboard(r);
    r.cool = 4 + ctx.random() * 4;
    if (occ) {
      const o = occ;
      occ = null;
      if (walk.occupation === o) walk.release();
    }
    walk.character.root.visible = true;
    walk.character.setActivity('none');
    ctx.camera.up.set(0, 1, 0);
    handsUp = false;
    if (!completed) return;
    const first = !r.punch.done;
    r.punch.done = true;
    r.punch.rides++;
    const pts = ridePoints(r.punch.thrill, !first);
    score += pts;
    const at = new THREE.Vector3(walk.pos.x, walk.y + 1.6, walk.pos.y);
    ctx.emit('confetti', at, first ? 40 : 14, 0.8);
    if (first) {
      ctx.ui.banner(`🎟️ חותמת! ${r.punch.icon} ${r.punch.label} +${pts}`, 1800);
      ctx.sfx('success');
      walk.character.gesture('cheer');
    } else {
      ctx.ui.popup(`שוב ${r.punch.label}! +${pts}`);
      ctx.sfx('star', 0.7);
    }
    if (!allKindsGiven && allKindsDone(card)) {
      allKindsGiven = true;
      score += BONUS.allKinds;
      setTimeout(() => {
        ctx.ui.banner(`🏆 עליתם על כל סוגי המתקנים! +${BONUS.allKinds}`, 2200);
        ctx.sfx('fanfare');
      }, 1900);
    }
  }

  function camera(dt: number): void {
    const r = riding;
    if (!r) return;
    const n = r.rt.seatFrames[seat];
    n.getWorldPosition(tmpV);
    n.getWorldQuaternion(tmpQ);
    tmpF.set(0, 0, 1).applyQuaternion(tmpQ);
    tmpU.set(0, 1, 0).applyQuaternion(tmpQ);
    const ch = walk.character;
    // the rider follows the seat completely (banking, loops, swinging)
    ch.root.quaternion.copy(tmpQ);
    ch.root.position.copy(tmpV).addScaledVector(tmpU, -SEAT);
    const c = ctx.camera;
    if (firstPerson) {
      ch.root.visible = false;
      c.position.copy(tmpV).addScaledVector(tmpU, 0.92).addScaledVector(tmpF, 0.22);
      c.quaternion.copy(tmpQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, Math.PI, 0, 'YXZ')));
      return;
    }
    ch.root.visible = true;
    // a camera made for each ride, easing after the rider
    const k = r.rt.kind;
    const v = CAMS[k];
    const up = tmpU.clone().lerp(UPW, k === 'coaster' ? 0.55 : 1).normalize();
    const side = new THREE.Vector3().crossVectors(up, tmpF).normalize();
    const want = tmpV.clone().addScaledVector(tmpF, v.back).addScaledVector(up, v.up).addScaledVector(side, v.side);
    if (k === 'teacups') {
      // from outside the platform, looking down into the cup
      const c0 = r.holder.getWorldPosition(new THREE.Vector3());
      const out = tmpV.clone().sub(c0).setY(0).normalize();
      want.copy(tmpV).addScaledVector(out, 4.8).addScaledVector(UPW, 3.6);
    } else if (k === 'pirate') {
      // from in front of the ride, outside its frame: the whole ship swings past
      want.set(0, 6.5, 15).applyMatrix4(r.holder.matrixWorld);
    }
    const ground = ctx.groundAt(want.x, want.z) + 0.6;
    if (want.y < ground) want.y = ground;
    if (!camInit) {
      camPos.copy(want);
      camInit = true;
    } else camPos.lerp(want, 1 - Math.exp(-dt * v.ease));
    c.position.copy(camPos);
    c.up.copy(up);
    c.lookAt(tmpV.clone().addScaledVector(tmpF, v.lookAhead).addScaledVector(up, v.lookUp));
    c.up.set(0, 1, 0);
  }

  function rideHint(r: ParkRide): string {
    const v = ' · V – מבט מהמושב';
    switch (r.rt.kind) {
      case 'ferris':
        return `F בפסגה – צילום 📸${v}`;
      case 'teacups':
        return `החזיקו W – לסובב את הספל!${v}`;
      case 'bumper':
        return 'W/S – נסיעה · A/D – היגוי · תתנגשו במכוניות!';
      default:
        return `החזיקו רווח – ידיים למעלה בירידות!${v}`;
    }
  }

  function ridingUpdate(dt: number): void {
    const r = riding!;
    const rt = r.rt;
    // hands up: Space; the character cheers
    const ch = walk.character;
    const want = handsUp ? 'cheer' : 'none';
    if (ch.getActivity() !== want) ch.setActivity(want);
    const res = hands.step(rt.drop && rt.state === 'running', handsUp);
    if (res === 'win') {
      if (rt.kind === 'pirate') {
        if (swingHands < 5) {
          swingHands++;
          award(BONUS.handsUpSwing, '🙌 ידיים למעלה!', true);
        }
      } else if (swingHands < 2) {
        swingHands++;
        award(BONUS.handsUp, '🙌 ידיים למעלה כל הירידה!');
      }
    }
    if (rt.kind === 'coaster' && !loopGiven && rt.state === 'running') {
      const n = rt.seatFrames[seat];
      n.getWorldQuaternion(tmpQ);
      if (tmpU.set(0, 1, 0).applyQuaternion(tmpQ).y < -0.5) {
        loopGiven = true;
        award(BONUS.loop, '🙃 הפוכים בלולאה!', true);
      }
    }
    // the bar: how far through the ride
    let label = rt.state === 'loading' ? 'מתיישבים… חגורות!' : rt.state === 'running' ? 'הסיבוב' : 'יורדים';
    if (hands.inDrop) label = hands.clean ? '🙌 ידיים למעלה – אל תורידו!' : 'ירידה!';
    let hint = rideHint(r);
    if (rt.kind === 'ferris' && !photoTaken && nearTop(r)) hint = '📸 אנחנו בפסגה! לחצו F לצילום';
    if (hudT - dt <= 0) ctx.ui.set({
      bar: { value: rt.state === 'running' ? rt.progress : rt.state === 'done' ? 1 : 0, label, color: hands.clean ? '#ffd84a' : undefined },
      hint,
      target: null,
      combo: rt.kind === 'bumper' && rideBumps ? `💥 ×${rideBumps}` : null,
    });
    // done: stamp and step off
    if (rt.cycles > startCycles && rt.state === 'done') leaveRide(true);
  }

  function nearTop(r: ParkRide): boolean {
    const n = r.rt.seatFrames[seat];
    n.getWorldPosition(tmpV);
    return tmpV.y - r.prop.floorY > 16.5;
  }

  // ---------------------------------------------------------------- the rides without the player
  function runRides(dt: number): void {
    for (const r of rides) {
      if (r === riding) continue;
      const rt = r.rt;
      rt.update(dt, 0, []);
      const ferris = rt.kind === 'ferris';
      if (r.npcCycle) {
        // the Ferris wheel never stops for visitors: they ride the slow idle turn for a while
        r.npcT -= dt;
        const over = ferris ? r.npcT <= 0 : rt.cycles > r.cyclesSeen && (rt.state === 'done' || rt.state === 'idle');
        if (over) {
          r.npcCycle = false;
          crowd.unboard(r);
          r.cool = 6 + ctx.random() * 8;
        }
        continue;
      }
      r.cool -= dt;
      // visitors-only rides: not while the player is close by or waiting for it
      const near = dist(walk.pos, r.entrance) < 26;
      if (r.cool <= 0 && (ferris || !near) && waiting !== r && crowd.queueOf(r).length >= 2 && (rt.state === 'idle' || rt.state === 'done')) {
        crowd.board(r, rt.kind === 'bumper' ? 4 : 6, new Set());
        r.npcCycle = true;
        r.npcT = 24;
        r.cyclesSeen = rt.cycles;
        if (!ferris) rt.dispatch();
      }
    }
  }

  // ---------------------------------------------------------------- music
  function music(dt: number): void {
    musicT -= dt;
    if (musicT > 0) return;
    const [m, beats] = WALTZ[musicI % WALTZ.length];
    const vol = riding ? 0.08 : 0.18;
    ctx.note(m, vol);
    if (beat % 3 === 0) ctx.note(BASS[Math.floor(beat / 3) % BASS.length], vol * 0.9);
    musicI++;
    beat += beats;
    musicT = (beats * 60) / 168;
  }

  // ---------------------------------------------------------------- HUD
  function hud(): void {
    const target = !riding && !over ? (waiting ?? nextTarget()) : null;
    const lines = [punchLine(card), started ? ratingLine : ratingParts];
    if (waiting) lines.push(`⏳ בתור: ${waiting.rt.label} – עוד רגע…`);
    const ruleLine = lines.join('|');
    if (ruleLine !== lastRuleLine) {
      lastRuleLine = ruleLine;
      ctx.ui.set({ lines });
    }
    if (riding) {
      ctx.ui.set({ timer: Math.max(0, left), score });
      return;
    }
    const near = nearestRide(4);
    let hint = 'עקבו אחרי החץ למתקן הבא · E – לעלות';
    if (near) hint = near.punch.done ? `E – לעלות שוב על ${near.rt.label} (חותמת כבר יש)` : `E – לעלות על ${near.rt.label} ${near.rt.icon}`;
    if (near && (busy(near) || (near.npcCycle && near.rt.kind !== 'ferris'))) hint = `${near.rt.icon} ${near.rt.label} באמצע סיבוב – E להיכנס לתור`;
    if (waiting) hint = `⏳ מחכים בתור ל${waiting.rt.label}…`;
    if (over) hint = 'הזמן נגמר!';
    ctx.ui.set({
      timer: Math.max(0, left),
      score,
      scoreLabel: 'נקודות',
      hint,
      bar: null,
      combo: null,
      target: target ? { x: target.entrance.x, y: target.entrance.y, label: `${target.rt.icon} ${target.rt.label}` } : null,
    });
  }

  function end(): void {
    if (over) return;
    over = true;
    const rode = card.filter((p) => p.done).length;
    const kinds = new Set(card.filter((p) => p.done).map((p) => p.kind)).size;
    ctx.finish({
      score,
      detail: rode ? `עליתם על ${rode} מתקנים שונים מתוך ${card.length}!` : 'הפארק מחכה לכם – נסו שוב ועלו על מתקן!',
      stats: [
        ['מתקנים', `${rode}/${card.length}`],
        ['סוגי מתקנים', `${kinds}/${kindsInPark.size}`],
        ['אתגרים', String(challenges)],
        ['דירוג הפארק', starText(rating.overall)],
        ['בונוס דירוג', `+${rating.bonus}`],
      ],
    });
  }

  // ---------------------------------------------------------------- start
  ctx.ui.set({ score, scoreLabel: 'נקודות', timer: left, lines: [punchLine(card), ratingParts], hint: 'בונים פארק עשיר יותר = יותר נקודות!' });
  // step in through the gate, facing the park
  const gate = all.find((p) => p.def.id === 'amuse-gate' && p.holder);
  if (gate?.holder) {
    const p = localToSite(gate.holder, 0, -3.8);
    const q = localToSite(gate.holder, 0, -6);
    // teleport's yaw is the camera's: it looks the opposite way of the character's facing
    walk.teleport(p, Math.atan2(q.x - p.x, q.y - p.y) + Math.PI, ctx.groundAt(p.x, p.y));
  }
  ctx.ui.banner(`דירוג הפארק: ${starText(rating.overall)}  (+${rating.bonus})`, 2600);
  ctx.sfx('fanfare', 0.6);
  const t0 = setTimeout(() => {
    void ctx.ui.countdown().then(() => {
      started = true;
      ctx.ui.popup('🎟️ כרטיסייה ביד – לכו למתקנים!');
    });
  }, 2200);

  return {
    update(dt) {
      crowd.update(dt);
      music(dt);
      runRides(dt);
      // a ride started through the walk mode's own buttons: take it over
      if (!riding && walk.occupation && walk.occupation !== occ) {
        const r = rides.find((x) => x.rt.playerOn);
        if (r) {
          walk.release();
          board(r);
        }
      }
      if (started && !over) left -= dt;
      if (riding) {
        ridingUpdate(dt);
        camera(dt);
      } else if (waiting) {
        if (dist(walk.pos, waiting.entrance) > 9) waiting = null;
        else if (!busy(waiting) && !waiting.npcCycle) board(waiting);
      }
      if (started && !over && left <= 0) {
        if (riding) {
          if (left > -dt * 1.5) ctx.ui.banner('⏰ הסיבוב האחרון!', 1500);
        } else end();
      }
      // the HUD is React: refresh it ten times a second, not every frame
      hudT -= dt;
      if (hudT <= 0) {
        hudT = 0.1;
        hud();
      }
    },
    key(code, down) {
      if (riding) {
        if (down) keys.add(code);
        else keys.delete(code);
        if (code === 'Space') {
          handsUp = down;
          return true;
        }
        if (code === 'KeyV' && down) {
          firstPerson = !firstPerson;
          ctx.ui.popup(firstPerson ? '👀 מבט מהמושב' : '🎥 מצלמה רגילה');
          return true;
        }
        if (code === 'KeyF' && down && riding.rt.kind === 'ferris') {
          if (!photoTaken && nearTop(riding)) {
            photoTaken = true;
            ctx.sfx('camera');
            award(BONUS.photo, '📸 צילום מהפסגה!');
          }
          return true;
        }
        if (code === 'KeyW' || code === 'ArrowUp') pushing = down;
        // nothing else ends the ride: it brings you back by itself
        return code !== 'Escape';
      }
      if (code === 'KeyE' && down && started && !over) {
        const r = nearestRide(4);
        if (r) {
          board(r);
          return true;
        }
      }
      return false;
    },
    dispose() {
      clearTimeout(t0);
      if (riding) leaveRide(false);
      else if (occ && walk.occupation === occ) walk.release();
      for (const r of rides) {
        r.rt.onEvent = null;
        r.rt.extraRiders.clear();
        if (r.rt.control) r.rt.control.external = false;
      }
      crowd.dispose();
      walk.character.root.visible = true;
      ctx.camera.up.set(0, 1, 0);
    },
  };
}

