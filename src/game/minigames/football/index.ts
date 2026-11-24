import * as THREE from 'three';
import { itemSize } from '../../../catalog';
import { SCOREBOARD, STADIUM_GOAL, standSeatPoints, STAND } from '../../../catalog/items/_gameDStadium';
import { netMat } from '../../../catalog/items/_street_shared';
import type { Vec2 } from '../../../model/types';
import type { Character } from '../../../render3d/Character';
import type { CharacterLook } from '../../../render3d/characterTypes';
import type { Occupation, OccupationFrame } from '../../../render3d/WalkController';
import type { MiniGameContext, MiniGameDef, MiniGameSession, PlacedProp } from '../types';
import {
  BALL_R,
  FREE_KICK_FROM,
  SHOTS,
  ZONE_NAMES,
  crossing,
  difficulty,
  goalPoints,
  hitFrame,
  inNet,
  netCatch,
  planKeeper,
  planShot,
  powerError,
  resultDetail,
  shotSpeed,
  stepBall,
  zoneOf,
  type Ball,
  type Difficulty,
  type GoalFrame,
  type KeeperPlan,
  type Zone,
} from './logic';
import { Bin, CameraRig, canvasTexture, clamp, easeOut, facingTo, lerp, smooth } from './shared';
import { buildStadium } from './venue';

/** Goals the game can use, with their mouth in item-local meters (at catalog size). */
const GOALS: Record<string, { halfW: number; top: number; mouthZ: number; depth: number; roof: number; postR: number }> = {
  'stadium-goal': { halfW: STADIUM_GOAL.halfW, top: STADIUM_GOAL.top, mouthZ: STADIUM_GOAL.mouthZ, depth: STADIUM_GOAL.mouthZ - STADIUM_GOAL.backZ, roof: STADIUM_GOAL.roofDepth, postR: STADIUM_GOAL.r },
  'football-goal': { halfW: 1.5, top: 2.0, mouthZ: 0.6, depth: 1.2, roof: 0.05, postR: 0.045 },
  'goal-soccer': { halfW: 0.89, top: 1.185, mouthZ: 0.44, depth: 0.85, roof: 0.3, postR: 0.035 },
};

const KEEPER_LOOK: CharacterLook = {
  body: 'man',
  skin: '#c99a76',
  hair: '#2b1d14',
  hairStyle: 'short',
  top: '#f2e43a',
  topStyle: 'longsleeve',
  bottom: '#1b1c20',
  bottomStyle: 'shorts',
  shoes: '#15161a',
  accessory: 'none',
};

const WALL_LOOK = (i: number): CharacterLook => ({
  body: 'man',
  skin: ['#e8b996', '#a8764f', '#d7a77f', '#7a5236'][i % 4],
  hair: ['#2b1d14', '#5a3620', '#111111', '#8a5a2b'][i % 4],
  hairStyle: i % 2 ? 'curly' : 'short',
  top: '#d23c3c',
  topStyle: 'tshirt',
  bottom: '#f4f4f0',
  bottomStyle: 'shorts',
  shoes: '#111111',
  accessory: 'none',
});

type Phase = 'intro' | 'aim' | 'power' | 'runup' | 'flight' | 'result' | 'done';
type Outcome = 'goal' | 'saved' | 'caught' | 'post' | 'bar' | 'wide' | 'over' | 'wall';

interface ShotRecord {
  outcome: Outcome;
  points: number;
  zone: Zone;
}

const SWALLOW = /^(Key|Arrow|Digit|Space|Enter|Shift|Numpad)/;

class PenaltyRound implements MiniGameSession {
  private bin = new Bin();
  private frame = new THREE.Group();
  /** goal-local space (see logic.ts) */
  private inner = new THREE.Group();
  private g: GoalFrame;
  /** penalty distance (scaled with the goal) */
  private spot: number;
  private scale: number;
  private goalProp: PlacedProp | null;
  private hiddenNet: THREE.Object3D | null = null;
  private cam: CameraRig;
  private phase: Phase = 'intro';
  private phaseT = 0;
  private shot = 0;
  private score = 0;
  private goals = 0;
  private streak = 0;
  private bestStreak = 0;
  private corners = 0;
  private saves = 0;
  private history: ShotRecord[] = [];
  private held = new Set<string>();
  // aim + power
  private aim = { x: 0, y: 1.1 };
  private wob = 0;
  private power = 0;
  private powerT = 0;
  private curve = 0;
  private diff: Difficulty = difficulty(0);
  // ball
  private ballMesh: THREE.Mesh;
  private shadow: THREE.Mesh;
  private ball: Ball = { x: 0, y: BALL_R, z: 9, vx: 0, vy: 0, vz: 0, spin: 0 };
  private ballStart = { x: 0, z: 9 };
  private kickT = -1;
  private flightT = 0;
  private plan: KeeperPlan | null = null;
  private outcome: Outcome | null = null;
  private touched: 'post' | 'bar' | 'keeper' | 'wall' | null = null;
  private crossAt: { x: number; y: number } | null = null;
  private caught = false;
  // keeper + wall
  private keeper: Character;
  private kp = { x: 0, lift: 0, phi: 0, state: 'ready' as 'ready' | 'dive' | 'fall' | 'down' | 'up' | 'cheer', t: 0, fromX: 0, fromPhi: 0, fromLift: 0 };
  private wall: Character[] = [];
  private wallX = 0;
  private wallZ = 0;
  private freeKick = false;
  // visuals
  private reticle: THREE.Group;
  private zones: THREE.Group;
  private net: { mesh: THREE.Mesh; base: Float32Array; hit: THREE.Vector3; amp: number; t: number } | null = null;
  private crowd: { body: THREE.InstancedMesh; head: THREE.InstancedMesh; seats: Array<{ p: THREE.Vector3; ph: number; q: THREE.Quaternion }>; hype: number } | null = null;
  private board: { g: CanvasRenderingContext2D; tex: THREE.CanvasTexture } | null = null;
  private occ: Occupation;
  private fov = 60;
  private runFrom = new THREE.Vector3();
  private runTo = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private m4 = new THREE.Matrix4();

  constructor(private ctx: MiniGameContext) {
    const found = this.findGoal();
    this.goalProp = found?.prop ?? null;
    const spec = found?.spec ?? GOALS['stadium-goal'];
    const sx = found ? found.sx : 1;
    const sy = found ? found.sy : 1;
    const sz = found ? found.sz : 1;
    this.g = { halfW: spec.halfW * sx, top: spec.top * sy, depth: spec.depth * sz, roof: Math.max(0.05, spec.roof * sz), postR: spec.postR };
    this.scale = clamp(this.g.halfW / STADIUM_GOAL.halfW, 0.45, 1.4);
    this.spot = 9 * this.scale;
    // goal-local frame in the world
    if (found) {
      const p = found.prop;
      this.frame.position.set(p.pos.x, p.floorY, p.pos.y);
      this.frame.rotation.y = -p.rotation;
      this.inner.position.z = spec.mouthZ * sz;
    } else {
      // no goal in the neighborhood: a stand-in at the venue
      const s = ctx.plotToSite(25, 6);
      this.frame.position.set(s.x, ctx.groundAt(s.x, s.y), s.y);
      this.buildStandInGoal();
    }
    this.frame.add(this.inner);
    ctx.root.add(this.frame);
    this.frame.updateMatrixWorld(true);
    this.cam = new CameraRig(ctx.camera);
    // a longer lens: the goal fills the view like on TV
    this.fov = ctx.camera.fov;
    ctx.camera.fov = 44;
    ctx.camera.updateProjectionMatrix();

    this.ballMesh = this.makeBall();
    this.shadow = this.makeShadow();
    this.reticle = this.makeReticle();
    this.zones = this.makeZones();
    this.makeNet();
    this.keeper = this.bin.npc(KEEPER_LOOK, this.inner);
    this.keeper.root.position.set(0, 0, 0.35);
    this.makeCrowd();
    this.makeScoreboard();

    this.occ = {
      activity: 'none',
      lockMovement: true,
      label: 'בעיטות עונשין',
      frame: (dt) => this.shooterFrame(dt),
    };
    ctx.walk.occupy(this.occ);
    this.setupShot(true);
    ctx.ui.set({ score: 0, scoreLabel: 'נקודות', hint: 'מתכוננים…' });
    ctx.ui.banner('⚽ בעיטות עונשין!', 1500);
    void ctx.ui.countdown().then(() => {
      if (this.phase === 'intro') this.enter('aim');
    });
  }

  // ---- setup -------------------------------------------------------------------------------

  private findGoal(): { prop: PlacedProp; spec: (typeof GOALS)[string]; sx: number; sy: number; sz: number } | null {
    const ctx = this.ctx;
    const all = ctx.props((item) => item.catalogId in GOALS);
    if (!all.length) return null;
    const plotC = ctx.plotToSite(25, 25);
    const sign = ctx.props((item) => item.catalogId === 'game-sign-football')[0];
    // goals of the stadium first (near the plot), the one farthest from the start sign
    const near = all.filter((p) => Math.hypot(p.pos.x - plotC.x, p.pos.y - plotC.y) < 40);
    const pool = near.length ? near : all;
    const ref = sign ? sign.pos : plotC;
    let best = pool[0];
    let bestScore = -Infinity;
    for (const p of pool) {
      const s = Math.hypot(p.pos.x - ref.x, p.pos.y - ref.y) + (p.item.catalogId === 'stadium-goal' ? 100 : 0) - (near.length ? 0 : Math.hypot(p.pos.x - plotC.x, p.pos.y - plotC.y));
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    const spec = GOALS[best.item.catalogId];
    const size = itemSize(best.def, best.item);
    return { prop: best, spec, sx: size.w / best.def.size.w, sy: size.h / best.def.size.h, sz: size.d / best.def.size.d };
  }

  private buildStandInGoal(): void {
    const mat = this.bin.add(new THREE.MeshStandardMaterial({ color: '#f6f6f2', roughness: 0.4 }));
    const { halfW, top } = this.g;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, top, 12), mat);
      post.position.set(s * halfW, top / 2, 0);
      this.inner.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, halfW * 2, 12), mat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, top, 0);
    this.inner.add(bar);
  }

  private makeBall(): THREE.Mesh {
    const t = canvasTexture(256, 128);
    if (t) {
      const { g } = t;
      g.fillStyle = '#f7f7f4';
      g.fillRect(0, 0, 256, 128);
      // 12 pentagons at the vertices of an icosahedron, drawn in lon/lat space
      const phi = (1 + Math.sqrt(5)) / 2;
      const verts = [
        [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
        [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
        [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
      ];
      g.fillStyle = '#1d1e22';
      for (const [x, y, z] of verts) {
        const l = Math.hypot(x, y, z);
        const lat = Math.asin(y / l);
        const lon = Math.atan2(z, x);
        const u = ((lon + Math.PI) / (Math.PI * 2)) * 256;
        const v = (0.5 - lat / Math.PI) * 128;
        const stretch = 1 / Math.max(0.25, Math.cos(lat));
        for (const off of [-256, 0, 256]) {
          g.beginPath();
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
            const px = u + off + Math.cos(a) * 11 * stretch;
            const py = v + Math.sin(a) * 11;
            if (k) g.lineTo(px, py);
            else g.moveTo(px, py);
          }
          g.closePath();
          g.fill();
        }
      }
      t.tex.needsUpdate = true;
      this.bin.add(t.tex);
    }
    const mat = this.bin.add(new THREE.MeshStandardMaterial({ color: '#ffffff', map: t?.tex ?? null, roughness: 0.45 }));
    const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), mat);
    m.castShadow = true;
    this.inner.add(m);
    return m;
  }

  private makeShadow(): THREE.Mesh {
    const mat = this.bin.add(new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false }));
    const m = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.1, 16), mat);
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    this.inner.add(m);
    return m;
  }

  private makeReticle(): THREE.Group {
    const grp = new THREE.Group();
    const mat = this.bin.add(new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
    const dark = this.bin.add(new THREE.MeshBasicMaterial({ color: '#1b1c20', transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
    const s = this.scale;
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, order = 30) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, 0);
      mesh.renderOrder = order;
      grp.add(mesh);
      return mesh;
    };
    add(new THREE.RingGeometry(0.24 * s, 0.33 * s, 32), dark, 0, 0, 29);
    add(new THREE.RingGeometry(0.26 * s, 0.31 * s, 32), mat);
    add(new THREE.CircleGeometry(0.045 * s, 12), mat);
    for (const [x, y, w, h] of [
      [0.44, 0, 0.2, 0.05],
      [-0.44, 0, 0.2, 0.05],
      [0, 0.44, 0.05, 0.2],
      [0, -0.44, 0.05, 0.2],
    ]) {
      add(new THREE.PlaneGeometry(w * s, h * s), mat, x * s, y * s);
    }
    grp.visible = false;
    this.inner.add(grp);
    return grp;
  }

  /** the corner "target" zones on the goal plane (more points) */
  private makeZones(): THREE.Group {
    const grp = new THREE.Group();
    const { halfW: w, top: h } = this.g;
    const gold = this.bin.add(new THREE.MeshBasicMaterial({ color: '#ffcf3a', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    const silver = this.bin.add(new THREE.MeshBasicMaterial({ color: '#bfe7ff', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    for (const s of [-1, 1]) {
      const cw = w * 0.38 - 0.06;
      const top = new THREE.Mesh(new THREE.PlaneGeometry(cw, h * 0.42 - 0.06), gold);
      top.position.set(s * (w - 0.06 - cw / 2), h - 0.06 - (h * 0.42 - 0.06) / 2, 0.01);
      const low = new THREE.Mesh(new THREE.PlaneGeometry(cw, h * 0.32), silver);
      low.position.set(s * (w - 0.06 - cw / 2), (h * 0.32) / 2, 0.01);
      top.renderOrder = low.renderOrder = 5;
      grp.add(top, low);
    }
    grp.visible = false;
    this.inner.add(grp);
    return grp;
  }

  /** a net with its own geometry that bulges where the ball hits it */
  private makeNet(): void {
    if (this.goalProp?.holder) {
      const n = this.goalProp.holder.getObjectByName('part:net');
      if (n) {
        this.hiddenNet = n;
        n.visible = false;
      }
    }
    if (!this.goalProp?.holder || !this.hiddenNet) {
      if (this.goalProp) return; // a goal without a separate net keeps its own
    }
    const { halfW: w, top: h, depth, roof } = this.g;
    const mat = netMat('#f2f2ee', 0.09, true, [1, 1]);
    const cell = 1 / 0.14;
    // one sheet: roof (crossbar → roof edge) then the sloping back down to the ground
    const nx = 26;
    const nyRoof = 3;
    const nyBack = 9;
    const rows = nyRoof + nyBack;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const backLen = Math.hypot(h, depth - roof);
    for (let j = 0; j <= rows; j++) {
      let y: number;
      let z: number;
      let v: number;
      if (j <= nyRoof) {
        const t = j / nyRoof;
        y = h;
        z = -roof * t;
        v = roof * t;
      } else {
        const t = (j - nyRoof) / nyBack;
        y = h * (1 - t);
        z = -roof - (depth - roof) * t;
        v = roof + backLen * t;
      }
      for (let i = 0; i <= nx; i++) {
        const x = -w + (2 * w * i) / nx;
        pos.push(x, y, z);
        uv.push((x + w) * cell, v * cell);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + nx + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    this.inner.add(mesh);
    // side nets (static)
    for (const s of [-1, 1]) {
      const sg = new THREE.BufferGeometry();
      const pts = [s * w, h, 0, s * w, 0, 0, s * w, 0, -depth, s * w, h, -roof];
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, h * cell, 0, 0, depth * cell, 0, roof * cell, h * cell], 2));
      sg.setIndex([0, 1, 2, 0, 2, 3]);
      sg.computeVertexNormals();
      this.inner.add(new THREE.Mesh(sg, mat));
    }
    this.net = { mesh, base: Float32Array.from(pos), hit: new THREE.Vector3(), amp: 0, t: 9 };
  }

  private makeCrowd(): void {
    const ctx = this.ctx;
    const plotC = ctx.plotToSite(25, 25);
    const stands = ctx.props((item) => item.catalogId === 'stadium-stand').filter((p) => Math.hypot(p.pos.x - plotC.x, p.pos.y - plotC.y) < 45);
    if (!stands.length) return;
    const pts = standSeatPoints();
    const seats: Array<{ p: THREE.Vector3; ph: number; q: THREE.Quaternion }> = [];
    for (const st of stands) {
      const size = itemSize(st.def, st.item);
      const k = { x: size.w / STAND.w, y: size.h / STAND.h, z: size.d / STAND.d };
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -st.rotation);
      for (const p of pts) {
        if (ctx.random() < 0.3) continue;
        const local = new THREE.Vector3(p.x * k.x * (st.item.mirror ? -1 : 1), p.y * k.y, p.z * k.z).applyQuaternion(q);
        seats.push({ p: new THREE.Vector3(st.pos.x + local.x, st.floorY + local.y, st.pos.y + local.z), ph: ctx.random() * 10, q });
      }
    }
    const n = seats.length;
    const shirts = ['#1f9d6a', '#f2c230', '#2f7fd0', '#e0402f', '#ffffff', '#1f9d6a', '#f08a24', '#8a46d8'];
    const skins = ['#e8b996', '#c99a76', '#a8764f', '#7a5236', '#f1c9a5'];
    const bodyMat = this.bin.add(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }));
    const headMat = this.bin.add(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }));
    const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.16, 0.34, 3, 8), bodyMat, n);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 10, 8), headMat, n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      body.setColorAt(i, c.set(shirts[Math.floor(ctx.random() * shirts.length)]));
      head.setColorAt(i, c.set(skins[Math.floor(ctx.random() * skins.length)]));
    }
    body.castShadow = true;
    body.frustumCulled = head.frustumCulled = false;
    ctx.root.add(body, head);
    this.crowd = { body, head, seats, hype: 0.15 };
    this.updateCrowd(0);
  }

  private updateCrowd(dt: number): void {
    const cr = this.crowd;
    if (!cr) return;
    cr.hype = Math.max(0.12, cr.hype - dt * 0.35);
    const t = this.ctx.elapsed();
    const m = this.m4;
    for (let i = 0; i < cr.seats.length; i++) {
      const s = cr.seats[i];
      const jump = cr.hype > 0.5 ? Math.max(0, Math.sin(t * 9 + s.ph)) * 0.32 * cr.hype : Math.sin(t * 2 + s.ph) * 0.015;
      const stand = cr.hype > 0.5 ? 0.25 : 0;
      m.makeTranslation(s.p.x, s.p.y + 0.3 + stand + jump, s.p.z);
      cr.body.setMatrixAt(i, m);
      m.makeTranslation(s.p.x, s.p.y + 0.66 + stand + jump, s.p.z);
      cr.head.setMatrixAt(i, m);
    }
    cr.body.instanceMatrix.needsUpdate = true;
    cr.head.instanceMatrix.needsUpdate = true;
  }

  private makeScoreboard(): void {
    const sb = this.ctx.props((item) => item.catalogId === 'stadium-scoreboard')[0];
    if (!sb) return;
    const t = canvasTexture(512, 228);
    if (!t) return;
    this.bin.add(t.tex);
    const size = itemSize(sb.def, sb.item);
    const k = { x: size.w / SCOREBOARD.w, y: size.h / SCOREBOARD.h, z: size.d / SCOREBOARD.d };
    const mat = this.bin.add(new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(SCOREBOARD.faceW * k.x, SCOREBOARD.faceH * k.y), mat);
    const holder = new THREE.Group();
    holder.position.set(sb.pos.x, sb.floorY, sb.pos.y);
    holder.rotation.y = -sb.rotation;
    plane.position.set(0, SCOREBOARD.faceY * k.y, (SCOREBOARD.faceZ + 0.012) * k.z);
    holder.add(plane);
    this.ctx.root.add(holder);
    this.board = { g: t.g, tex: t.tex };
    this.drawBoard();
  }

  private drawBoard(): void {
    const b = this.board;
    if (!b) return;
    const g = b.g;
    const W = 512;
    const H = 228;
    g.fillStyle = '#0d1013';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1f9d6a';
    g.fillRect(0, 0, W, 46);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    g.font = '700 30px system-ui, Arial, sans-serif';
    g.fillText(this.freeKick ? 'בעיטה חופשית' : 'בעיטות עונשין', W / 2, 24);
    g.direction = 'ltr';
    g.font = '700 84px "Courier New", monospace';
    g.fillStyle = '#ffb02e';
    g.fillText(`${this.goals}`, W * 0.72, 108);
    g.fillText(`${Math.round(this.score)}`.padStart(4, ' '), W * 0.3, 108);
    g.font = '600 22px system-ui, Arial, sans-serif';
    g.fillStyle = '#9fe0c4';
    g.direction = 'rtl';
    g.fillText('גולים', W * 0.72, 160);
    g.fillText('נקודות', W * 0.3, 160);
    // a light for every shot
    for (let i = 0; i < SHOTS; i++) {
      const r = this.history[i];
      g.fillStyle = !r ? '#2a2f35' : r.outcome === 'goal' ? '#36e07a' : '#ff4a3d';
      g.beginPath();
      g.arc(W - 40 - i * 48, 200, 13, 0, Math.PI * 2);
      g.fill();
    }
    b.tex.needsUpdate = true;
  }

  // ---- shots -------------------------------------------------------------------------------

  /** goal-local → site plan point */
  private plan2(x: number, z: number): Vec2 {
    this.tmp.set(x, 0, z);
    this.inner.localToWorld(this.tmp);
    return { x: this.tmp.x, y: this.tmp.z };
  }

  private setupShot(first = false): void {
    const i = this.shot;
    this.diff = difficulty(i);
    this.freeKick = i >= FREE_KICK_FROM;
    const r = this.ctx.random;
    let bx = 0;
    let bz = this.spot;
    if (this.freeKick) {
      bz = 17 * this.scale;
      bx = (r() < 0.5 ? -1 : 1) * (1.5 + r() * 2.5) * this.scale;
    }
    this.ballStart = { x: bx, z: bz };
    this.ball = { x: bx, y: BALL_R, z: bz, vx: 0, vy: 0, vz: 0, spin: 0 };
    this.aim = { x: 0, y: this.g.top * 0.55 };
    this.power = 0;
    this.powerT = 0;
    this.curve = 0;
    this.kickT = -1;
    this.flightT = 0;
    this.plan = null;
    this.outcome = null;
    this.touched = null;
    this.crossAt = null;
    this.caught = false;
    this.kp.state = 'ready';
    this.kp.x = 0;
    this.kp.lift = 0;
    this.kp.phi = 0;
    this.keeper.setActivity('none');
    this.setupWall();
    this.drawBoard();
    this.ctx.walk.character.setActivity('none');
    if (!first && this.freeKick && i === FREE_KICK_FROM) this.ctx.ui.banner('🧱 בעיטות חופשיות עם חומה! ×1.5', 2000);
  }

  private setupWall(): void {
    if (!this.freeKick) {
      for (const w of this.wall) w.root.visible = false;
      return;
    }
    if (!this.wall.length) for (let i = 0; i < 3; i++) this.wall.push(this.bin.npc(WALL_LOOK(i), this.inner));
    const { x: bx, z: bz } = this.ballStart;
    // the wall stands 6.5 m from the ball and covers the near post: the far side stays open
    const nearPost = Math.sign(bx) * this.g.halfW * 0.72;
    const dx = nearPost - bx;
    const dz = -bz;
    const l = Math.hypot(dx, dz);
    const d = 6.5 * this.scale;
    this.wallX = bx + (dx / l) * d;
    this.wallZ = bz + (dz / l) * d;
    const px = -dz / l;
    const pz = dx / l;
    this.wall.forEach((w, i) => {
      const o = (i - 1) * 0.5;
      w.root.visible = true;
      w.root.position.set(this.wallX + px * o, 0, this.wallZ + pz * o);
      w.root.rotation.set(0, Math.atan2(bx - w.root.position.x, bz - w.root.position.z), 0);
      w.setActivity('none');
    });
  }

  private enter(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    const ui = this.ctx.ui;
    this.reticle.visible = p === 'aim' || p === 'power';
    this.zones.visible = p === 'aim' || p === 'power';
    if (p === 'aim') ui.set({ hint: 'A/D/W/S – לכוון את הכוונת · רווח – לנעול כיוון', bar: null });
    if (p === 'power') ui.set({ hint: 'רווח – לעצור את מד העוצמה (בירוק!) · להחזיק A/D – בעיטה מסובבת' });
    if (p === 'runup' || p === 'flight') ui.set({ hint: null });
    this.refreshHud();
  }

  private refreshHud(): void {
    const marks = this.history.map((h) => (h.outcome === 'goal' ? '⚽' : '❌')).join('');
    const pending = '·'.repeat(Math.max(0, SHOTS - this.history.length));
    this.ctx.ui.set({
      score: this.score,
      lines: [`בעיטה ${Math.min(SHOTS, this.shot + 1)} מתוך ${SHOTS}${this.freeKick ? ' · חופשית ×1.5' : ''}`, `גולים: ${this.goals} · הצלות: ${this.saves}`, `${marks}${pending}`],
      combo: this.streak >= 2 ? `🔥 רצף ${this.streak}` : null,
    });
  }

  private shoot(): void {
    const r = this.ctx.random;
    const [ex, ey] = powerError(this.power, r);
    const tx = this.aim.x + ex + (this.curve ? (r() - 0.5) * 0.15 : 0);
    const ty = Math.max(0.15, this.aim.y + ey);
    const speed = shotSpeed(this.power) * (this.freeKick ? 0.95 : 1);
    this.ball = planShot(this.ballStart.x, this.ballStart.z, tx, ty, speed, this.curve * 1.15);
    const cross = crossing(this.ball);
    this.plan = planKeeper(cross, this.g, this.diff, speed, r);
    // the run-up: from where the shooter stands to the ball
    this.runFrom.copy(this.shooterSpot());
    this.behind(0.32, -0.22, this.runTo);
    this.enter('runup');
    this.ctx.ui.set({ bar: null });
    const label = this.power > 0.93 ? 'חזק מדי!' : this.power >= 0.55 && this.power <= 0.8 ? 'עוצמה מושלמת!' : null;
    if (label) this.ctx.ui.popup(label, this.power > 0.93 ? '#ff6b5a' : '#5be38a');
  }

  /** unit vector from the goal towards the ball (x, z) and its right-hand side */
  private axes(): { dx: number; dz: number; rx: number; rz: number } {
    const { x, z } = this.ballStart;
    const l = Math.hypot(x, z) || 1;
    const dx = x / l;
    const dz = z / l;
    return { dx, dz, rx: dz, rz: -dx };
  }

  /** a point behind the ball: `back` meters further from the goal, `right` meters to the shooter's right */
  private behind(back: number, right: number, out = new THREE.Vector3()): THREE.Vector3 {
    const a = this.axes();
    return out.set(this.ballStart.x + a.dx * back + a.rx * right, 0, this.ballStart.z + a.dz * back + a.rz * right);
  }

  private shooterSpot(): THREE.Vector3 {
    return this.behind(2.1, -0.75);
  }

  /** the player's place while the game runs */
  private shooterFrame(_dt: number): OccupationFrame {
    let p: THREE.Vector3;
    let speed = 0;
    if (this.phase === 'runup') {
      const u = clamp(this.phaseT / 0.75, 0, 1);
      p = this.tmp2.lerpVectors(this.runFrom, this.runTo, u);
      speed = u < 1 ? 3.6 : 0;
    } else if (this.phase === 'flight' || (this.phase === 'result' && this.kickT >= 0)) {
      // follow through a step after the kick
      p = this.behind(0.32 - Math.min(0.5, this.flightT * 0.8), -0.22, this.tmp2);
    } else p = this.shooterSpot();
    const plan = this.plan2(p.x, p.z);
    const look = this.plan2(this.ballStart.x * 0.5, 0);
    return { x: plan.x, y: plan.y, floor: this.ctx.groundAt(plan.x, plan.y), facing: facingTo(plan, look), pose: 'stand', speed };
  }

  // ---- frame -------------------------------------------------------------------------------

  update(dt: number): void {
    const ctx = this.ctx;
    if (ctx.walk.occupation !== this.occ) ctx.walk.occupy(this.occ);
    this.phaseT += dt;
    const ui = ctx.ui;
    switch (this.phase) {
      case 'aim': {
        const sp = 1.9 * this.scale;
        const h = this.held;
        if (h.has('KeyA') || h.has('ArrowLeft')) this.aim.x -= sp * dt;
        if (h.has('KeyD') || h.has('ArrowRight')) this.aim.x += sp * dt;
        if (h.has('KeyW') || h.has('ArrowUp')) this.aim.y += sp * dt;
        if (h.has('KeyS') || h.has('ArrowDown')) this.aim.y -= sp * dt;
        this.aim.x = clamp(this.aim.x, -this.g.halfW - 0.5, this.g.halfW + 0.5);
        this.aim.y = clamp(this.aim.y, 0.15, this.g.top + 0.5);
        this.wob += dt;
        break;
      }
      case 'power': {
        this.powerT += dt * this.diff.powerSpeed;
        // up and down: 0 → 1 → 0 …
        const c = this.powerT % 2;
        this.power = c < 1 ? c : 2 - c;
        const h = this.held;
        this.curve = h.has('KeyA') || h.has('ArrowLeft') ? -1 : h.has('KeyD') || h.has('ArrowRight') ? 1 : 0;
        this.wob += dt;
        const color = this.power > 0.93 ? '#e0402f' : this.power >= 0.55 && this.power <= 0.8 ? '#2fbf5b' : '#f0b429';
        ui.set({ bar: { value: this.power, label: this.curve ? `עוצמה · סיבוב ${this.curve < 0 ? '⟲ שמאלה' : '⟳ ימינה'}` : 'עוצמה', color, danger: 0.93 } });
        break;
      }
      case 'runup': {
        if (this.phaseT >= 0.75 && this.kickT < 0) {
          this.kickT = 0;
          ctx.walk.character.setActivity('kick');
        }
        if (this.kickT >= 0) {
          this.kickT += dt;
          if (this.kickT >= 0.4) this.launch();
        }
        break;
      }
      case 'flight':
        this.flightT += dt;
        this.simulate(dt);
        break;
      case 'result':
        if (this.kickT >= 0) {
          this.flightT += dt;
          this.simulate(dt);
        }
        if (this.phaseT > 2.6) this.next();
        break;
      default:
        break;
    }
    this.updateKeeper(dt);
    this.updateWall(dt);
    this.updateBallMesh();
    this.updateReticle();
    this.updateNet(dt);
    this.updateCrowd(dt);
    this.updateCamera(dt);
  }

  private launch(): void {
    this.enter('flight');
    this.kickT = 0;
    this.flightT = 0;
    this.ctx.sfx('kick', 1);
    if (this.freeKick) for (const w of this.wall) w.setActivity('jump');
  }

  private simulate(dt: number): void {
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    const b = this.ball;
    const g = this.g;
    for (let i = 0; i < n; i++) {
      if (this.caught) break;
      const pz = b.z;
      const px = b.x;
      const py = b.y;
      stepBall(b, h);
      // crossing the goal line
      if (pz > 0 && b.z <= 0 && !this.crossAt) {
        const f = pz / (pz - b.z);
        this.crossAt = { x: px + (b.x - px) * f, y: py + (b.y - py) * f };
      }
      // the wall
      if (this.freeKick && !this.touched) {
        for (const w of this.wall) {
          const dx = b.x - w.root.position.x;
          const dz = b.z - w.root.position.z;
          const top = w.root.position.y + 1.8;
          if (Math.hypot(dx, dz) < 0.28 + BALL_R && b.y < top && b.y > w.root.position.y + 0.1) {
            b.vz = Math.abs(b.vz) * 0.35;
            b.vx = b.vx * 0.3 + (this.ctx.random() - 0.5) * 4;
            b.vy = Math.abs(b.vy) * 0.3 + 1.5;
            b.spin = 0;
            this.touched = 'wall';
            this.ctx.sfx('bounce', 0.9);
            if (this.phase === 'flight') this.resolve('wall');
            break;
          }
        }
      }
      // the keeper's hands
      if (this.plan && !this.touched && this.plan.save && b.z < 0.55 && b.vz < 0) {
        const p = this.plan;
        const near = Math.hypot(b.x - p.x, b.y - p.y) < this.diff.reach + 0.45 || (Math.abs(b.x) < 0.5 && b.y < 1.8);
        if (near) {
          const sp = Math.hypot(b.vx, b.vy, b.vz);
          this.touched = 'keeper';
          if (sp < 16.5 && Math.abs(b.y - 1.1) < 0.8 && Math.abs(b.x) < 1.3) {
            this.caught = true;
            b.vx = b.vy = b.vz = 0;
            this.resolve('caught');
          } else {
            b.vz = Math.abs(b.vz) * 0.28 + 1.5;
            b.vx = Math.sign(b.x || 1) * (2 + this.ctx.random() * 3);
            b.vy = 1.5 + this.ctx.random() * 2.5;
            b.spin = 0;
            this.ctx.sfx('kick', 0.6);
            this.resolve('saved');
          }
          break;
        }
      }
      // posts and crossbar (not from inside the net once it is a goal)
      const frameHit = b.z < 0 && Math.abs(b.x) < g.halfW && b.y < g.top ? null : hitFrame(b, g);
      if (frameHit && !this.touched) {
        this.touched = frameHit;
        this.ctx.sfx('clack', 1);
        this.ctx.sfx('bounce', 0.8);
        this.ctx.ui.popup(frameHit === 'post' ? 'עמוד!' : 'משקוף!', '#ffd84a');
      }
      // a scored ball stays in the net
      if (this.outcome === 'goal' && b.z > -BALL_R) {
        b.z = -BALL_R;
        b.vz = -Math.abs(b.vz) * 0.3;
      }
      if (inNet(b, g) && this.touched !== 'keeper' && this.touched !== 'wall') {
        const bulge = netCatch(b, g, h);
        if (bulge > 1.5 && this.net && this.net.t > 0.25) {
          this.net.hit.set(b.x, b.y, b.z);
          this.net.amp = Math.min(0.5, bulge * 0.024) * this.scale;
          this.net.t = 0;
        }
        if (this.phase === 'flight') this.resolve('goal');
      }
    }
    if (this.phase !== 'flight') return;
    // missed: past the goal line outside the frame, or the ball has stopped
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    if (b.z < -0.4 && !inNet(b, g)) this.resolve(this.crossAt && this.crossAt.y > g.top ? 'over' : this.touched === 'post' ? 'post' : this.touched === 'bar' ? 'bar' : 'wide');
    else if (this.flightT > 3.2 || (speed < 0.4 && this.flightT > 0.6)) this.resolve(this.touched === 'post' ? 'post' : this.touched === 'bar' ? 'bar' : 'wide');
    else if (this.touched && b.vz > 0 && b.z > 1.5) this.resolve(this.touched === 'bar' ? 'bar' : this.touched === 'post' ? 'post' : 'wide');
  }

  private resolve(o: Outcome): void {
    if (this.outcome) return;
    this.outcome = o;
    this.enter('result');
    const ctx = this.ctx;
    const ui = ctx.ui;
    const ch = ctx.walk.character;
    let points = 0;
    let zone: Zone = 'out';
    if (o === 'goal') {
      const c = this.crossAt ?? { x: this.ball.x, y: this.ball.y };
      zone = zoneOf(c.x, c.y, this.g);
      if (zone === 'out') zone = 'side';
      this.goals++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (zone === 'top-corner') this.corners++;
      const gp = goalPoints(zone, this.streak, this.freeKick);
      points = gp.points;
      this.score += points;
      ui.banner(zone === 'top-corner' ? '⚽ גוווול! טופ פינה!' : this.touched === 'post' || this.touched === 'bar' ? '⚽ גול! מהקורה פנימה!' : '⚽ גוווול!', 1700);
      ui.popup(`+${points}${ZONE_NAMES[zone] ? ` · ${ZONE_NAMES[zone]}` : ''}`, '#5be38a');
      if (gp.bonus) ui.popup(`בונוס רצף +${gp.bonus}`, '#ffd84a');
      ctx.sfx('goal', 1);
      ctx.sfx('cheer', 1);
      if (this.crowd) this.crowd.hype = 1.4;
      ch.setActivity(zone === 'top-corner' && this.streak >= 2 ? 'flip' : 'cheer');
      this.tmp.set(this.ball.x, 1.2, -0.6);
      this.inner.localToWorld(this.tmp);
      ctx.emit('confetti', this.tmp.clone(), zone === 'top-corner' ? 60 : 30, 1.4);
    } else {
      this.streak = 0;
      const text: Record<Exclude<Outcome, 'goal'>, string> = {
        saved: '🧤 השוער הדף!',
        caught: '🧤 השוער תפס!',
        post: 'פגעת בעמוד!',
        bar: 'פגעת במשקוף!',
        wide: 'החטאה – החוצה',
        over: 'מעל השער!',
        wall: '🧱 החומה חסמה!',
      };
      ui.banner(text[o], 1500);
      if (o === 'saved' || o === 'caught') {
        this.saves++;
        this.kp.state = this.kp.state === 'ready' ? 'cheer' : this.kp.state;
        if (this.crowd) this.crowd.hype = 0.6;
      }
      ctx.sfx('miss', 0.8);
      ch.gesture('wave');
    }
    this.history.push({ outcome: o, points, zone });
    this.refreshHud();
    this.drawBoard();
  }

  private next(): void {
    this.shot++;
    if (this.shot >= SHOTS) {
      this.phase = 'done';
      const ctx = this.ctx;
      ctx.finish({
        score: this.score,
        detail: resultDetail(this.goals, SHOTS),
        stats: [
          ['גולים', `${this.goals} / ${SHOTS}`],
          ['טופ פינות', String(this.corners)],
          ['הרצף הכי ארוך', String(this.bestStreak)],
          ['הצלות של השוער', String(this.saves)],
        ],
      });
      return;
    }
    this.setupShot();
    this.enter('aim');
    if (this.shot === SHOTS - 1) this.ctx.ui.banner('בעיטה אחרונה!', 1300);
  }

  // ---- keeper, wall, ball, net, camera -------------------------------------------------------

  private updateKeeper(dt: number): void {
    const k = this.kp;
    const kch = this.keeper;
    const t = this.ctx.elapsed();
    const plan = this.plan;
    const since = this.phase === 'flight' || this.phase === 'result' ? this.flightT : -1;
    if (k.state === 'ready') {
      // bounce on the line, follow the aim a little (the better he gets, the more he reads the aim)
      const lean = (this.phase === 'aim' || this.phase === 'power' ? this.aim.x : 0) * 0.08 * (0.5 + this.diff.read);
      k.x += (Math.sin(t * 2.3) * 0.22 + lean - k.x) * Math.min(1, dt * 4);
      k.lift = Math.max(0, Math.sin(t * 6.5)) * 0.03;
      k.phi *= Math.exp(-dt * 8);
      if (plan && since >= plan.start && this.phase !== 'runup') {
        k.state = 'dive';
        k.t = 0;
        k.fromX = k.x;
        k.fromPhi = k.phi;
        k.fromLift = k.lift;
        kch.setActivity('cheer');
      }
    } else if (k.state === 'dive' && plan) {
      k.t += dt;
      const dur = Math.max(0.18, plan.arrive - plan.start);
      const u = clamp(k.t / dur, 0, 1);
      const e = easeOut(u);
      const side = Math.abs(plan.x) < 0.55 ? 0 : Math.sign(plan.x);
      if (side === 0) {
        k.x = lerp(k.fromX, plan.x, e);
        k.lift = Math.max(0, plan.y - 1.75) * Math.sin(u * Math.PI * 0.5) * 0.9;
        k.phi = 0;
      } else {
        const feet = side * clamp(Math.abs(plan.x) - 1.05, 0, 1.35);
        const liftT = clamp(plan.y - 1.15, 0, 0.75) * 0.85 + 0.08;
        const phiT = Math.atan2(plan.x - feet, Math.max(0.25, plan.y - liftT));
        k.x = lerp(k.fromX, feet, e);
        k.lift = liftT * Math.sin(Math.min(1, u * 1.1) * Math.PI * 0.5);
        k.phi = lerp(k.fromPhi, phiT, e);
      }
      if (u >= 1) {
        k.state = side === 0 ? 'down' : 'fall';
        k.t = 0;
        k.fromPhi = k.phi;
        k.fromLift = k.lift;
        k.fromX = k.x;
      }
    } else if (k.state === 'fall') {
      k.t += dt;
      const u = clamp(k.t / 0.42, 0, 1);
      const side = Math.sign(k.phi) || 1;
      k.phi = lerp(k.fromPhi, side * 1.42, u * u);
      k.lift = lerp(k.fromLift, 0.02, u * u);
      k.x = k.fromX + side * 0.25 * u;
      if (u >= 1) {
        k.state = 'down';
        k.t = 0;
        this.ctx.sfx('bounce', 0.5);
      }
    } else if (k.state === 'down') {
      k.t += dt;
      k.lift = Math.max(0, k.lift - dt * 2);
      if (k.t > 0.9) {
        k.state = 'up';
        k.t = 0;
        k.fromPhi = k.phi;
        kch.setActivity('none');
      }
    } else if (k.state === 'up') {
      k.t += dt;
      const u = smooth(k.t / 0.6);
      k.phi = lerp(k.fromPhi, 0, u);
      if (u >= 1) {
        k.state = this.outcome === 'saved' || this.outcome === 'caught' ? 'cheer' : 'ready';
        k.t = 0;
        if (k.state === 'cheer') kch.setActivity('cheer');
      }
    } else if (k.state === 'cheer') {
      k.t += dt;
      k.phi *= Math.exp(-dt * 6);
      if (k.t > 1.4) {
        k.state = 'ready';
        kch.setActivity('none');
      }
    }
    kch.root.position.set(k.x, k.lift, 0.35);
    kch.root.rotation.set(0, 0, -k.phi);
    kch.update(dt, 0);
    if (this.caught) {
      kch.handWorld(this.tmp);
      this.inner.worldToLocal(this.tmp);
      this.ball.x = this.tmp.x;
      this.ball.y = Math.max(BALL_R, this.tmp.y);
      this.ball.z = this.tmp.z + 0.12;
    }
  }

  private updateWall(dt: number): void {
    if (!this.freeKick) return;
    const since = this.phase === 'flight' || (this.phase === 'result' && this.kickT >= 0) ? this.flightT : -1;
    for (const w of this.wall) {
      const u = since < 0 ? 0 : clamp((since - 0.05) / 0.6, 0, 1);
      w.root.position.y = Math.sin(u * Math.PI) * 0.42;
      w.update(dt, 0);
    }
  }

  private updateBallMesh(): void {
    const b = this.ball;
    const m = this.ballMesh;
    const px = m.position.x;
    const pz = m.position.z;
    m.position.set(b.x, b.y, b.z);
    // roll / spin
    const dx = b.x - px;
    const dz = b.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > 1e-5) {
      this.tmp.set(dz, 0, -dx).normalize();
      m.rotateOnWorldAxis(this.tmp, -d / BALL_R);
    }
    this.shadow.position.set(b.x, 0.012, b.z);
    const s = Math.max(0.3, 1 - (b.y - BALL_R) * 0.25);
    this.shadow.scale.setScalar(s);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.35 * s;
  }

  private updateReticle(): void {
    if (!this.reticle.visible) return;
    // the reticle drifts (more in later rounds, and still a little while the power runs)
    const w = this.diff.wobble * this.scale * (this.phase === 'power' ? 0.6 : 1);
    const t = this.wob;
    const x = this.aim.x + Math.sin(t * 1.7) * w + Math.sin(t * 3.1 + 1) * w * 0.4;
    const y = this.aim.y + Math.sin(t * 2.3 + 0.5) * w * 0.7;
    this.reticle.position.set(x, y, 0.03);
    const pulse = this.phase === 'power' ? 1 : 1 + Math.sin(this.ctx.elapsed() * 6) * 0.06;
    this.reticle.scale.setScalar(pulse);
  }

  private updateNet(dt: number): void {
    const n = this.net;
    if (!n || n.amp <= 0.001) return;
    n.t += dt;
    const a = n.amp * Math.exp(-n.t * 3.2) * Math.cos(n.t * 13);
    const attr = n.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const base = n.base;
    for (let i = 0; i < arr.length; i += 3) {
      const dx = base[i] - n.hit.x;
      const dy = base[i + 1] - n.hit.y;
      const f = Math.exp(-(dx * dx + dy * dy) / 0.5);
      arr[i] = base[i];
      arr[i + 1] = base[i + 1] - a * f * 0.25;
      arr[i + 2] = base[i + 2] - a * f;
    }
    attr.needsUpdate = true;
    if (n.t > 2.5) {
      n.amp = 0;
      arr.set(base);
      attr.needsUpdate = true;
    }
  }

  private updateCamera(dt: number): void {
    const bs = this.ballStart;
    const s = this.scale;
    const pos = this.tmp;
    const look = this.tmp2;
    // behind and to the right of the shooter, looking at the goal; it follows the ball a little in flight
    const back = 4.6 * s;
    if (this.phase === 'flight' || this.phase === 'result') {
      const u = smooth(this.flightT / 1.1);
      const b = this.ball;
      this.behind(lerp(back, back * 0.4, u), lerp(0.4, 0.3, u), pos);
      pos.y = lerp(1.9, 1.6, u);
      look.set(lerp(bs.x * 0.3, clamp(b.x, -4, 4) * 0.6, u), lerp(0.7 * s, clamp(b.y, 0.3, 2.5) * 0.6 + 0.3, u), lerp(bs.z * 0.22, Math.max(-1, Math.min(b.z, bs.z)) * 0.4, u));
    } else {
      this.behind(back, 0.4, pos);
      pos.y = 1.9;
      look.set(bs.x * 0.3, 0.7 * s, bs.z * 0.22);
    }
    this.inner.localToWorld(pos);
    this.inner.localToWorld(look);
    this.cam.set(pos, look, dt, this.phase === 'flight' ? 3 : 5, this.phase === 'intro' && this.phaseT < 0.05);
  }

  // ---- input -------------------------------------------------------------------------------

  key(code: string, down: boolean): boolean {
    if (code === 'Escape') return false;
    if (down) this.held.add(code);
    else this.held.delete(code);
    if (down && code === 'Space') {
      if (this.phase === 'aim') {
        this.enter('power');
        this.ctx.sfx('click', 0.6);
      } else if (this.phase === 'power') {
        this.aim = { x: this.reticle.position.x, y: this.reticle.position.y };
        this.shoot();
      }
    }
    return SWALLOW.test(code);
  }

  dispose(): void {
    const walk = this.ctx.walk;
    if (walk.occupation === this.occ) walk.release();
    if (this.hiddenNet) this.hiddenNet.visible = true;
    this.ctx.camera.fov = this.fov;
    this.ctx.camera.updateProjectionMatrix();
    this.bin.dispose();
  }
}

export const GAME: MiniGameDef = {
  id: 'football',
  howTo: [
    '10 בעיטות מול שוער שמשתפר בכל בעיטה; ב-3 האחרונות – בעיטה חופשית מעל חומה (×1.5)',
    'A/D/W/S או החצים – להזיז את הכוונת על השער, רווח – לנעול',
    'רווח שוב – לעצור את מד העוצמה בירוק; יותר מדי = מעל המשקוף',
    'להחזיק A או D בזמן העוצמה – בעיטה מסובבת שמתעקלת באוויר',
    'פינות למעלה = 300, פינות למטה = 200, אמצע = 100, ורצף גולים מוסיף בונוס',
  ],
  medals: { bronze: 350, silver: 1100, gold: 2200, unit: 'points' },
  venue: { plot: 'e-north', build: buildStadium },
  start: (ctx) => new PenaltyRound(ctx),
};
