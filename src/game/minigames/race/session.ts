import * as THREE from 'three';
import { getFurniture, resolveColors } from '../../../catalog';
import { GANTRY_LIGHTS } from '../../../catalog/items/_gameARace';
import type { WalkBox } from '../../../render3d/WalkController';
import type { MiniGameContext, MiniGameSession } from '../types';
import {
  buildCircuit,
  crossGate,
  findLoop,
  idealRaceTime,
  loopTarget,
  normalisedTime,
  project,
  roadNet,
  rubberBand,
  speedProfile,
  standings,
  startCellNear,
  type Circuit,
  type DriveSpec,
} from './circuit';
import { basic, curtain, disposeFx, textSprite } from './fx';
import { backToSign, lookWith, makeVehicle, mountPlayer, placeVehicle, Rider, rollWheels, setDriveSpeed, WorldHooks, yawOf, type GameVehicle } from './ride';

export const LAPS = 3;

type Kind = 'car' | 'bicycle' | 'scooter';

interface Choice {
  kind: Kind;
  key: string;
  label: string;
  catalogId: string;
  colorKey: string;
  playerColor: string;
  drive: DriveSpec;
  /** lateral room either side of the centre line the AI may use */
  laneMax: number;
  /** half width used for overtaking */
  width: number;
  /** grid rows behind the line, lateral slot offset */
  rows: [number, number];
  side: number;
}

const CHOICES: Choice[] = [
  {
    kind: 'car',
    key: 'Digit1',
    label: '🚗 מכונית מירוץ',
    catalogId: 'car-compact',
    colorKey: 'body',
    playerColor: '#f2c230',
    drive: { vmax: 20, accel: 5.2, brake: 9, grip: 9.5 },
    laneMax: 1.8,
    width: 1.05,
    rows: [-5.5, -13],
    side: 1.5,
  },
  {
    kind: 'bicycle',
    key: 'Digit2',
    label: '🚲 אופני כביש',
    catalogId: 'bicycle',
    colorKey: 'frame',
    playerColor: '#f2c230',
    drive: { vmax: 12.5, accel: 3.8, brake: 7, grip: 8 },
    laneMax: 2.4,
    width: 0.5,
    rows: [-3, -7],
    side: 1.2,
  },
  {
    kind: 'scooter',
    key: 'Digit3',
    label: '🛴 קורקינט',
    catalogId: 'kick-scooter',
    colorKey: 'frame',
    playerColor: '#f2c230',
    drive: { vmax: 11, accel: 3.6, brake: 7, grip: 8 },
    laneMax: 2.4,
    width: 0.45,
    rows: [-2.5, -6],
    side: 1.2,
  },
];

const RIVALS = [
  { name: 'רוני', color: '#d6332a', skill: 0.9, seed: 11 },
  { name: 'מאיה', color: '#2f6fd6', skill: 0.86, seed: 23 },
  { name: 'גיל', color: '#2fa84f', skill: 0.82, seed: 37 },
];

const LANES: number[] = [];
for (let l = -2.4; l <= 2.401; l += 0.4) LANES.push(Math.round(l * 10) / 10);

interface Racer {
  name: string;
  color: string;
  progress: number;
  finishedAt: number | null;
  lateral: number;
  speed: number;
}

interface Ai extends Racer {
  v: GameVehicle;
  rider: Rider;
  skill: number;
  lane: number;
  laneTarget: number;
  baseLane: number;
  box: WalkBox;
  laneTimer: number;
  steer: number;
  heading: number;
}

/** m:ss.t */
export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function startRace(ctx: MiniGameContext): MiniGameSession {
  const hooks = new WorldHooks(ctx, { hideTraffic: true });
  let phase: 'choose' | 'grid' | 'race' | 'done' = 'choose';
  let choice: Choice | null = null;
  let circuit: Circuit | null = null;
  let profile: Float64Array | null = null;
  let ideal = 0;
  let player: GameVehicle | null = null;
  const ais: Ai[] = [];
  const me: Racer = { name: 'את/ה', color: '#f2c230', progress: 0, finishedAt: null, lateral: 0, speed: 0 };
  let raceT = 0;
  let q = 0; // next gate in the sequence (gate q % G, lap ⌊q / G⌋)
  let projIdx = -1;
  let lapStart = 0;
  let lastLap: number | null = null;
  let bestLap: number | null = null;
  let wrongWay = 0;
  let wrongShown = -10;
  let offTrack = 0;
  let missedShown = -10;
  let doneTimer = 0;
  let lastPlace = 4;
  let mask: Uint16Array | null = null;
  let finishCalled = false;
  let lights: THREE.Mesh[] = [];
  let lightsLit = 0;
  let gateCurtain: THREE.Mesh | null = null;
  let gridStart = 0;
  let prevX = ctx.walk.pos.x;
  let prevY = ctx.walk.pos.y;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

  // ---- choosing a vehicle ----------------------------------------------------------------------
  ctx.ui.set({
    lines: ['בחרו כלי למירוץ:', `1 – ${CHOICES[0].label}`, `2 – ${CHOICES[1].label}`, `3 – ${CHOICES[2].label}`],
    hint: 'מקשים 1 / 2 / 3 – או לעלות (E) על כלי שחונה בפיטס',
    timer: null,
  });
  ctx.ui.banner('🏁 בחרו כלי למירוץ!', 2200);

  const choose = (c: Choice) => {
    if (phase !== 'choose') return;
    choice = c;
    try {
      setup(c);
    } catch (err) {
      console.error('race setup failed', err);
      ctx.ui.banner('אין כאן מספיק כבישים למירוץ 🙁', 2500);
      later(2500, () => ctx.quit());
    }
  };

  const setup = (c: Choice) => {
    const p = ctx.project();
    const net = roadNet(p.site.roads);
    const sign = p.site.props.find((f) => f.catalogId === 'game-sign-race');
    const anchor = sign ? { x: sign.x, y: sign.y } : ctx.walk.pos;
    const start = startCellNear(net, p.site.roads, anchor.x, anchor.y);
    if (!start) throw new Error('no straight road');
    const arches = p.site.props.filter((f) => f.catalogId === 'race-arch');
    const loop = findLoop(net, start, { ...loopTarget(c.kind), prefer: arches.map((a) => [Math.floor(a.x / 10), Math.floor(a.y / 10)] as [number, number]) });
    if (!loop) throw new Error('no loop');
    const obstacles = p.site.props.filter((f) => !f.catalogId.startsWith('race-arch')).map((f) => ({ x: f.x, y: f.y }));
    circuit = buildCircuit(net, loop, { obstacles, arches: arches.map((a) => ({ id: a.id, x: a.x, y: a.y })) });
    const sp = speedProfile(circuit, c.drive);
    profile = sp.v;
    ideal = idealRaceTime(sp.lapTime, LAPS, c.drive);
    // the street is closed for the race: parked cars and posts standing on its asphalt step aside
    const cells = new Set(loop.map(([i, j]) => `${i},${j}`));
    hooks.clearProps(
      ctx.props((item, def) => !item.id.startsWith('v-race-') && (!!def.vehicle || def.category === 'street' || def.category === 'outdoor')).filter(
        (pp) => cells.has(`${Math.floor(pp.pos.x / 10)},${Math.floor(pp.pos.y / 10)}`) && ctx.groundAt(pp.pos.x, pp.pos.y) < 0.08,
      ),
    );
    buildTrackObjects(circuit);
    buildMask(circuit, c);

    // the grid: three rivals and the player at the back
    const C = circuit;
    const slot = (k: number) => ({ s: c.rows[k >> 1], lat: k % 2 ? c.side : -c.side });
    const tune = { maxSpeed: c.drive.vmax, acceleration: c.drive.accel };
    RIVALS.forEach((r, n) => {
      const v = makeVehicle(ctx, `mg-race-ai-${n}`, c.catalogId, { [c.colorKey]: r.color }, tune);
      if (!v) return;
      const sl = slot(n);
      const rider = new Rider(ctx, v.def, lookWith(r.seed, r.color));
      const box: WalkBox = { id: `mg-race-ai-${n}`, x: 0, y: 0, hw: v.def.size.w / 2, hd: v.def.size.d / 2, rotation: 0, y0: 0, y1: v.def.size.h };
      hooks.addBox(box);
      const ai: Ai = {
        name: r.name,
        color: r.color,
        progress: sl.s,
        finishedAt: null,
        lateral: sl.lat,
        speed: 0,
        v,
        rider,
        skill: r.skill,
        lane: sl.lat,
        laneTarget: sl.lat,
        baseLane: (n - 1) * Math.min(1.4, c.laneMax * 0.7),
        box,
        laneTimer: n * 0.1,
        steer: 0,
        heading: 0,
      };
      placeAi(ai, C, 0);
      ais.push(ai);
      const label = textSprite(r.name, { bg: r.color, height: 0.5, font: 64 });
      label.position.set(0, c.kind === 'car' ? v.def.size.h + 0.55 : 2.05, 0);
      v.holder.add(label);
    });
    const ps = slot(3);
    player = makeVehicle(ctx, 'mg-race-player', c.catalogId, { [c.colorKey]: c.playerColor }, tune);
    if (!player) throw new Error('no vehicle');
    hooks.addVehicle(player);
    hooks.sync();
    const at = pointAt(C, ps.s, ps.lat);
    placeVehicle(ctx, player, at, at.heading);
    me.progress = ps.s;
    if (!mountPlayer(ctx, player)) {
      // the world may not have the vehicle yet: try again on the next frames
      later(120, () => player && mountPlayer(ctx, player));
    }
    prevX = player.holder.position.x;
    prevY = player.holder.position.z;
    projIdx = project(C, prevX, prevY).i;
    phase = 'grid';
    gridStart = ctx.elapsed();
    // read-only peek for automated checks (Playwright): scene.getObjectByName('minigame:race')
    ctx.root.userData.race = { circuit: C, ais, me, state: () => ({ phase, q, raceT, lastPlace, ideal, bestLap }) };
    ctx.ui.set({
      lines: [`הקפה 0/${LAPS}`, c.label],
      hint: 'W/S – גז ובלם · A/D – היגוי · R – חזרה למסלול · H – צופר',
      score: '4/4',
      scoreLabel: 'מקום',
      timer: 0,
      target: { x: C.gates[0].x, y: C.gates[0].y, label: 'קו הזינוק' },
    });
    ctx.ui.banner(`${c.label} · ${Math.round(C.length)} מ׳ להקפה`, 1800);
    later(900, () => {
      if (phase !== 'grid') return;
      void ctx.ui.countdown(3).then(() => {
        if (phase !== 'grid') return;
        phase = 'race';
        raceT = 0;
        lapStart = 0;
        setLights('#2bd94a', 5);
        ctx.sfx('horn', 0.6);
        ctx.sfx('cheer', 0.5);
        ctx.ui.popup('🚦 צא!', '#2bd94a');
      });
    });
  };

  // ---- the track's objects (gantry, arches, start lights, labels) ------------------------------
  const buildTrackObjects = (C: Circuit) => {
    const gantryDef = getFurniture('race-gantry');
    const archDef = getFurniture('race-arch');
    C.gates.forEach((g, gi) => {
      if (g.placed) return;
      const def = gi === 0 ? gantryDef : archDef;
      if (!def) return;
      const width = gi === 0 ? 10 : 9.4;
      const obj = def.build({ colors: resolveColors(def, gi === 0 ? undefined : { color: gi % 2 ? '#ff7a1a' : '#e8437a' }), size: { ...def.size, w: width } });
      // the front faces the racers coming towards it
      obj.position.set(g.x, ctx.groundAt(g.x, g.y) - 0.1, g.y);
      obj.rotation.y = yawOf(-g.dx, -g.dy);
      ctx.root.add(obj);
      // posts are solid
      const anchors = obj.userData.anchors as { boxes?: Array<{ x: number; z: number; w: number; d: number }> } | undefined;
      for (const b of anchors?.boxes ?? []) {
        const c = Math.cos(obj.rotation.y);
        const s = Math.sin(obj.rotation.y);
        hooks.addBox({ id: `mg-race-post-${gi}-${b.x}`, x: g.x + b.x * c + b.z * s, y: g.y - b.x * s + b.z * c, hw: b.w / 2, hd: b.d / 2, rotation: -obj.rotation.y, y0: 0, y1: 5 });
      }
      if (gi === 0) {
        // five start lights that the countdown switches on
        const L = GANTRY_LIGHTS;
        const geo = new THREE.CircleGeometry(L.r * 0.92, 18);
        for (const x of L.xs) {
          const m = new THREE.Mesh(geo, basic('#3a1010'));
          m.position.set(x, L.y, L.z + 0.025);
          obj.add(m);
          lights.push(m);
        }
      } else {
        const label = textSprite(`שער ${gi}`, { bg: 'rgba(20,22,26,0.75)', height: 0.75 });
        label.position.set(g.x, 5.6, g.y);
        ctx.root.add(label);
      }
    });
    gateCurtain = curtain(8.6, 3.6, '#ffd84a');
    ctx.root.add(gateCurtain);
  };

  const setLights = (color: string, count: number) => {
    lights.forEach((m, i) => (m.material as THREE.MeshBasicMaterial).color.set(i < count ? color : '#3a1010'));
  };

  /** which lanes are blocked by parked cars, posts, trees… along the circuit (bit per LANES entry) */
  const buildMask = (C: Circuit, c: Choice) => {
    const n = C.xs.length;
    mask = new Uint16Array(n);
    const near = ctx.world().boxes.filter((b) => {
      if (b.id?.startsWith('traffic-') || b.id?.startsWith('mg-race-ai')) return false;
      if (b.y0 > 1.2) return false;
      return true;
    });
    // only boxes close to the circuit matter
    const cells = new Set(C.cells.map(([i, j]) => `${i},${j}`));
    const close = near.filter((b) => cells.has(`${Math.floor(b.x / 10)},${Math.floor(b.y / 10)}`));
    const r = c.width + 0.35;
    for (let i = 0; i < n; i++) {
      let bits = 0;
      for (let l = 0; l < LANES.length; l++) {
        const x = C.xs[i] - C.ty[i] * LANES[l];
        const y = C.ys[i] + C.tx[i] * LANES[l];
        for (const b of close) {
          const cs = Math.cos(-b.rotation);
          const sn = Math.sin(-b.rotation);
          const rx = x - b.x;
          const ry = y - b.y;
          const lx = rx * cs - ry * sn;
          const ly = rx * sn + ry * cs;
          if (Math.abs(lx) < b.hw + r && Math.abs(ly) < b.hd + r) {
            bits |= 1 << l;
            break;
          }
        }
      }
      mask[i] = bits;
    }
  };

  // ---- geometry helpers ------------------------------------------------------------------------
  const idx = (C: Circuit, s: number) => {
    const n = C.xs.length;
    const f = s / C.ds;
    return ((Math.floor(f) % n) + n) % n;
  };
  const pointAt = (C: Circuit, s: number, lat: number) => {
    const n = C.xs.length;
    const f = s / C.ds;
    const i = ((Math.floor(f) % n) + n) % n;
    const j = (i + 1) % n;
    const t = f - Math.floor(f);
    const x = C.xs[i] + (C.xs[j] - C.xs[i]) * t;
    const y = C.ys[i] + (C.ys[j] - C.ys[i]) * t;
    const tx = C.tx[i] + (C.tx[j] - C.tx[i]) * t;
    const ty = C.ty[i] + (C.ty[j] - C.ty[i]) * t;
    const l = Math.hypot(tx, ty) || 1;
    return { x: x - (ty / l) * lat, y: y + (tx / l) * lat, heading: yawOf(tx / l, ty / l), tx: tx / l, ty: ty / l };
  };
  const laneFree = (C: Circuit, s: number, lane: number, ahead: number) => {
    if (!mask) return true;
    let l = 0;
    let bd = Infinity;
    LANES.forEach((v, k) => {
      if (Math.abs(v - lane) < bd) {
        bd = Math.abs(v - lane);
        l = k;
      }
    });
    for (let d = 0; d <= ahead; d += 2) if (mask[idx(C, s + d)] & (1 << l)) return false;
    return true;
  };

  const placeAi = (ai: Ai, C: Circuit, dt: number) => {
    const p = pointAt(C, ai.progress, ai.lane);
    const prevHeading = ai.heading;
    // lateral drift turns the nose a little
    const drift = ai.speed > 0.5 ? Math.atan2(ai.laneTarget - ai.lane, Math.max(4, ai.speed * 1.2)) * 0.6 : 0;
    ai.heading = p.heading + drift;
    const h = ai.v.holder;
    h.position.set(p.x, ctx.groundAt(p.x, p.y), p.y);
    h.rotation.y = ai.heading;
    const turnRate = dt > 0 ? wrapAngle(ai.heading - prevHeading) / dt : 0;
    const spec = ai.v.def.vehicle!;
    ai.steer = Math.max(-spec.maxSteer, Math.min(spec.maxSteer, Math.atan((-turnRate * spec.wheelbase) / Math.max(1, ai.speed))));
    const twoWheels = spec.kind !== 'car';
    const roll = twoWheels ? Math.max(-0.4, Math.min(0.4, ai.steer * ai.speed * 0.085)) : Math.max(-0.045, Math.min(0.045, -ai.steer * ai.speed * 0.006));
    h.rotation.z += (roll - h.rotation.z) * Math.min(1, dt * 6);
    ai.box.x = p.x;
    ai.box.y = p.y;
    ai.box.rotation = -ai.heading;
    ai.lateral = ai.lane;
    if (dt > 0) rollWheels(ai.v.wheels, ai.speed, ai.steer, dt);
    ai.rider.update(dt, h, ai.speed);
  };

  // ---- the AI drivers -------------------------------------------------------------------------
  const driveAi = (ai: Ai, C: Circuit, c: Choice, dt: number) => {
    const racing = phase === 'race' || phase === 'done';
    let vt = 0;
    if (racing && profile) {
      const look = profile[idx(C, ai.progress + ai.speed * 0.25)];
      const band = rubberBand(ai.progress - me.progress);
      vt = look * ai.skill * band;
      if (ai.finishedAt !== null) vt = Math.min(vt, c.drive.vmax * 0.4);
    }
    // keep a lane: look for racers and obstacles ahead
    ai.laneTimer -= dt;
    const others: Racer[] = [me, ...ais.filter((o) => o !== ai)];
    const need = c.width * 2 + 0.4;
    const blocker = (lane: number, from: number, to: number) => {
      for (const o of others) {
        const along = o.progress - ai.progress;
        if (along > from && along < to && Math.abs(o.lateral - lane) < need) return o;
      }
      return null;
    };
    const ahead = 4 + ai.speed * 0.9;
    const front = blocker(ai.lane, 0.5, ahead);
    if (ai.laneTimer <= 0 && racing) {
      ai.laneTimer = 0.3;
      const wantFree = (lane: number) => Math.abs(lane) <= c.laneMax && laneFree(C, ai.progress, lane, 16) && !blocker(lane, -2.5, ahead + 2);
      if (front || !laneFree(C, ai.progress, ai.laneTarget, 16) || Math.abs(ai.laneTarget - ai.baseLane) > 0.1) {
        const cands = LANES.filter((l) => Math.abs(l) <= c.laneMax).sort((a, b) => Math.abs(a - ai.lane) - Math.abs(b - ai.lane));
        // drift back to its own line when that is clear, else the nearest clear lane
        if (wantFree(ai.baseLane) && !front) ai.laneTarget = ai.baseLane;
        else {
          const pick = cands.find(wantFree);
          if (pick !== undefined) ai.laneTarget = pick;
        }
      }
    }
    if (front) vt = Math.min(vt, Math.max(0, front.speed - 0.3));
    if (!laneFree(C, ai.progress, ai.lane, Math.max(4, ai.speed * 0.8))) vt = Math.min(vt, 2);
    const acc = c.drive.accel * (ai.speed < vt ? 1 : 0);
    ai.speed += Math.max(-c.drive.brake * dt, Math.min(acc * dt, vt - ai.speed));
    ai.speed = Math.max(0, ai.speed);
    ai.progress += ai.speed * dt;
    const lr = 1.6 * dt;
    ai.lane += Math.max(-lr, Math.min(lr, ai.laneTarget - ai.lane));
    placeAi(ai, C, dt);
    if (ai.finishedAt === null && ai.progress >= LAPS * C.length) {
      ai.finishedAt = raceT;
      if (me.finishedAt === null) ctx.ui.popup(`${ai.name} סיים/ה!`, ai.color);
    }
  };

  // ---- the player's progress and gates ----------------------------------------------------------
  const G = () => circuit!.gates.length;
  const gateAbs = (k: number) => {
    const C = circuit!;
    return Math.floor(k / G()) * C.length + C.gates[k % G()].s;
  };

  const passGate = (C: Circuit) => {
    const gi = q % G();
    const g = C.gates[gi];
    q++;
    const lapDone = gi === 0 && q > 1;
    if (lapDone) {
      const lt = raceT - lapStart;
      lapStart = raceT;
      lastLap = lt;
      const lapNo = Math.floor((q - 1) / G());
      const best = bestLap === null || lt < bestLap;
      if (best) bestLap = lt;
      if (lapNo >= LAPS) {
        finishRace();
        return;
      }
      ctx.ui.banner(lapNo === LAPS - 1 ? `🔔 הקפה אחרונה! (${fmtTime(lt)})` : `הקפה ${lapNo + 1}/${LAPS} · ${fmtTime(lt)}`, 1800);
      if (best && lapNo > 1) ctx.ui.popup('⚡ הקפה הכי מהירה!', '#ffd23a');
      ctx.sfx('bell', 0.8);
      ctx.emit('confetti', new THREE.Vector3(g.x, 3.5, g.y), 30, 3);
    } else if (gi === 0) {
      ctx.ui.popup('🏁 המירוץ התחיל!', '#ffffff');
    } else {
      ctx.sfx('ding', 0.9);
      ctx.note(79, 0.5);
      later(90, () => ctx.note(84, 0.5));
      ctx.ui.popup(`✔ שער ${gi}`, '#7ee081');
      ctx.emit('spark', new THREE.Vector3(g.x, 3, g.y), 18, 2.5);
    }
  };

  const finishRace = () => {
    const C = circuit!;
    me.finishedAt = raceT;
    phase = 'done';
    const place = 1 + ais.filter((a) => a.finishedAt !== null && a.finishedAt <= raceT).length;
    lastPlace = place;
    ctx.ui.banner(place === 1 ? '🏆 ניצחת! מקום ראשון!' : `🏁 סיימת במקום ${place}!`, 3000);
    ctx.sfx(place === 1 ? 'fanfare' : 'success', 0.9);
    ctx.sfx('cheer', 0.8);
    ctx.walk.character.gesture('cheer');
    const g = C.gates[0];
    for (let i = 0; i < 5; i++) later(i * 350, () => ctx.emit('confetti', new THREE.Vector3(g.x + (i - 2) * 1.5, 4.2, g.y), 40, 3));
    const podium = standings([me, ...ais]).slice(0, 3);
    later(1400, () => {
      const names = podium.map((k, i) => `${['🥇', '🥈', '🥉'][i]} ${k === 0 ? 'את/ה' : ais[k - 1].name}`);
      ctx.ui.popup(names.join('  '), '#ffd23a');
    });
    doneTimer = 4.2;
    ctx.ui.set({ target: null, hint: null });
  };

  const endRound = (completed: boolean) => {
    if (finishCalled) return;
    finishCalled = true;
    const c = choice!;
    const C = circuit!;
    const real = me.finishedAt ?? raceT;
    const place = completed ? lastPlace : 4;
    ctx.finish({
      score: completed ? normalisedTime(real, ideal) : 0,
      completed,
      detail: completed
        ? `${place === 1 ? 'ניצחת' : `מקום ${place}`} מתוך 4 עם ${c.label} · הציון הוא הזמן שלך, מותאם לכלי ולאורך המסלול`
        : 'היריבים כבר סיימו – נסו שוב, אפשר גם לבחור כלי אחר!',
      stats: [
        ['זמן המירוץ', fmtTime(real)],
        ['הקפה הכי מהירה', bestLap !== null ? fmtTime(bestLap) : '—'],
        ['מקום', `${place}/4`],
        ['אורך הקפה', `${Math.round(C.length)} מ׳`],
      ],
    });
  };

  const respawn = (C: Circuit) => {
    if (!player || phase !== 'race') return;
    const s = Math.max(gateAbs(Math.max(0, q - 1)), me.progress) - 2;
    const at = pointAt(C, s, 0);
    placeVehicle(ctx, player, at, at.heading);
    setDriveSpeed(ctx, 0);
    prevX = at.x;
    prevY = at.y;
    projIdx = idx(C, s);
    ctx.sfx('whoosh', 0.6);
    ctx.ui.popup('↩ חזרה למסלול', '#ffffff');
  };

  // ---- per frame ---------------------------------------------------------------------------------
  const updateRace = (dt: number) => {
    const C = circuit!;
    const c = choice!;
    const walk = ctx.walk;
    hooks.frame();
    if (phase === 'race' || phase === 'done') raceT += dt;

    // the player is held on the grid until the lights go green
    // got off (the on-screen button)? back on
    if (phase === 'race' && player && walk.currentVehicle?.id !== player.id && !walk.occupation) mountPlayer(ctx, player);
    if (phase === 'grid' && player) {
      if (walk.currentVehicle?.id !== player.id && ctx.elapsed() - gridStart > 0.3) mountPlayer(ctx, player);
      const ps = pointAt(C, c.rows[1], c.side);
      placeVehicle(ctx, player, ps, ps.heading);
      setDriveSpeed(ctx, 0);
      const lit = Math.min(3, Math.floor((ctx.elapsed() - gridStart - 0.9) / 0.8) + 1);
      if (lit !== lightsLit && lit > 0) {
        lightsLit = lit;
        setLights('#ff2a1f', lit + (lit === 3 ? 2 : 0));
      }
    }

    // where is the player on the circuit?
    const px = player ? player.holder.position.x : walk.pos.x;
    const py = player ? player.holder.position.z : walk.pos.y;
    let pr = project(C, px, py, projIdx, 30);
    if (pr.dist > 12) pr = project(C, px, py);
    projIdx = pr.i;
    me.lateral = pr.lateral;
    me.speed = Math.abs(walk.vehicleSpeed);

    // gates: only the next one counts
    if (phase === 'race') {
      for (let gi = 0; gi < G(); gi++) {
        const dir = crossGate(C.gates[gi], prevX, prevY, px, py);
        if (dir !== 1) continue;
        if (gi === q % G()) passGate(C);
        else {
          const d = (gi - (q % G()) + G()) % G();
          if (d >= 1 && d <= G() - 2 && raceT - missedShown > 2.5) {
            missedShown = raceT;
            ctx.ui.banner(`⛔ פספסת שער! חזרו ל${q % G() === 0 ? (q === 0 ? 'קו הזינוק' : 'קו הסיום') : `שער ${q % G()}`}`, 2200);
            ctx.sfx('miss', 0.8);
          }
        }
        if (phase !== 'race') break;
      }
    }
    prevX = px;
    prevY = py;

    // progress (for the standings): along the line, but never past the next gate
    if (phase !== 'choose') {
      const s = pr.i * C.ds;
      const lo = q > 0 ? gateAbs(q - 1) : -C.length;
      const hi = gateAbs(q);
      const base = Math.floor((q - 1) / G()) * C.length;
      let best = base + s;
      for (const cand of [base + s - C.length, base + s + C.length]) if (Math.abs(cand - (lo + hi) / 2) < Math.abs(best - (lo + hi) / 2)) best = cand;
      if (me.finishedAt === null) me.progress = Math.max(lo - 5, Math.min(hi + 1, best));
    }

    for (const ai of ais) driveAi(ai, C, c, dt);

    if (phase === 'race') {
      // wrong way / off the track
      const t = { x: C.tx[pr.i], y: C.ty[pr.i] };
      const v = walk.velocity;
      const along = v.x * t.x + v.y * t.y;
      if (me.speed > 2 && pr.dist < 9 && along < -1) wrongWay += dt;
      else wrongWay = Math.max(0, wrongWay - dt * 2);
      if (wrongWay > 1 && raceT - wrongShown > 3) {
        wrongShown = raceT;
        ctx.ui.banner('⛔ כיוון לא נכון! הסתובבו', 1800);
        ctx.sfx('miss', 0.6);
      }
      offTrack = pr.dist > 14 ? offTrack + dt : 0;

      // positions and overtakes
      const order = standings([me, ...ais]);
      const place = order.indexOf(0) + 1;
      if (place < lastPlace && raceT > 3) {
        const passed = order[place];
        if (passed > 0) ctx.ui.popup(`⚡ עקפת את ${ais[passed - 1].name}!`, ais[passed - 1].color);
        ctx.sfx('whoosh', 0.5);
      }
      lastPlace = place;

      // nobody waits forever
      const lastAi = Math.max(...ais.map((a) => a.finishedAt ?? Infinity));
      if ((Number.isFinite(lastAi) && raceT > lastAi + 60) || raceT > ideal * 3.2) endRound(false);
    }

    // next gate: curtain, nav arrow
    if (phase === 'race' || phase === 'grid') {
      const g = C.gates[q % G()];
      if (gateCurtain) {
        gateCurtain.visible = q % G() !== 0;
        gateCurtain.position.set(g.x, ctx.groundAt(g.x, g.y) + 1.8, g.y);
        gateCurtain.rotation.y = yawOf(g.dx, g.dy);
        (gateCurtain.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.08 * Math.sin(ctx.elapsed() * 5);
      }
      const lap = Math.max(1, Math.min(LAPS, Math.floor(Math.max(0, q - 1) / G()) + 1));
      const lines = [`הקפה ${q === 0 ? 0 : lap}/${LAPS}`, `שער ${q % G() === 0 ? 'סיום' : `${q % G()}/${G() - 1}`}`];
      if (lastLap !== null) lines.push(`הקפה קודמת ${fmtTime(lastLap)}`);
      if (bestLap !== null) lines.push(`הכי מהירה ${fmtTime(bestLap)}`);
      if (offTrack > 3) lines.push('↩ ללחוץ R כדי לחזור למסלול');
      ctx.ui.set({
        lines,
        timer: raceT,
        score: `${lastPlace}/4`,
        scoreLabel: 'מקום',
        bar: { value: Math.min(1, me.speed / c.drive.vmax), label: `${Math.round(me.speed * 3.6)} קמ״ש`, color: '#e0402f' },
        target: { x: g.x, y: g.y, label: q % G() === 0 ? (q === 0 ? 'קו הזינוק' : 'קו הסיום') : `שער ${q % G()}` },
      });
    }

    if (phase === 'done') {
      doneTimer -= dt;
      ctx.ui.set({ timer: me.finishedAt, bar: null });
      if (doneTimer <= 0) endRound(true);
    }
  };

  return {
    update(dt) {
      hooks.sync();
      if (phase === 'choose') {
        // boarding one of the pit's vehicles chooses it
        const v = ctx.walk.currentVehicle;
        if (v && !v.id.startsWith('mg-race')) {
          const k = v.def.vehicle?.kind;
          const c = CHOICES.find((x) => x.kind === (k === 'bus' || k === 'other' ? 'car' : k));
          if (c) choose(c);
        }
        return;
      }
      if (circuit && choice) updateRace(dt);
    },
    key(code, down) {
      if (phase === 'choose') {
        const c = CHOICES.find((x) => x.key === code || x.key.replace('Digit', 'Numpad') === code);
        if (c && down) {
          choose(c);
          return true;
        }
        return false;
      }
      // no getting off in the middle of a race
      if (code === 'KeyE' || code === 'Enter' || code === 'KeyF' || code === 'KeyG' || code === 'KeyT') return true;
      if (code === 'KeyR') {
        if (down && circuit) respawn(circuit);
        return true;
      }
      return false;
    },
    dispose() {
      for (const t of timers) clearTimeout(t);
      const walk = ctx.walk;
      if (player && walk.currentVehicle?.id === player.id) {
        // step off next to the vehicle (the round's vehicles disappear with the round)
        walk.interact();
        backToSign(ctx, 'game-sign-race');
      }
      for (const ai of ais) ai.rider.dispose();
      hooks.dispose();
      disposeFx();
    },
  };
}
