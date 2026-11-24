import * as THREE from 'three';
import { bake, blobGeo, M } from '../../../catalog/kit';
import { buildChest } from '../../../catalog/items/_gameETreasure';
import type { Vec2 } from '../../../model/types';
import { buildTreasureCamp } from '../farm/venue';
import type { MiniGameContext, MiniGameDef, MiniGameSession } from '../types';
import { CROWN, FINAL_BONUS, generateHunt, HINT_COST, stageScore, TREASURES, warmth, warmthLabel, type HuntStage } from './hunt';
import { Fireworks, ScreenCard, escapeHtml } from './fx';

/**
 * "ציד אוצרות": every round a new hunt is generated from what really stands in the neighborhood.
 * Five riddles, a hot/cold meter, an optional hint arrow (H), and a buried chest at every place:
 * dig it up with E for a piece of the map and a treasure. The last chest is the big one.
 */

const DIG_SECONDS = 1.7;
const HINT_SECONDS = 10;
const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type Phase = 'intro' | 'search' | 'dig' | 'open' | 'between' | 'final' | 'done';

interface ChestFx {
  root: THREE.Group;
  mound: THREE.Group;
  chest: THREE.Group;
  lid: THREE.Object3D | null;
  gem: THREE.Object3D | null;
  t: number;
}

function start(ctx: MiniGameContext): MiniGameSession {
  const walk = ctx.walk;
  const startPos: Vec2 = { ...walk.pos };
  const hunt: HuntStage[] = generateHunt(ctx.project(), startPos, { random: () => ctx.random() });
  const disposers: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const h = setTimeout(() => {
      timers.delete(h);
      fn();
    }, ms);
    timers.add(h);
  };
  disposers.push(() => timers.forEach((h) => clearTimeout(h)));
  let phase: Phase = 'intro';
  let stage = 0;
  let stageStart = 0;
  let goTime = 0;
  let score = 0;
  let hints = 0;
  let stageHints = 0;
  let hintLeft = 0;
  let beepTimer = 0;
  let phaseT = 0;
  let found: string[] = [];
  const v3 = new THREE.Vector3();

  if (hunt.length < 3) {
    ctx.ui.banner('אין מספיק מקומות בשכונה לציד אוצרות 🙁', 2600);
    ctx.ui.set({ hint: 'בנו עוד מבנים, מתקנים ופינות בשכונה – ונסו שוב!' });
    const h = setTimeout(() => ctx.quit(), 2800);
    return { update() {}, dispose: () => clearTimeout(h) };
  }
  const total = hunt.length;
  // a different treasure in every chest, the crown in the last one
  const bag = [...TREASURES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const loot = hunt.map((_, i) => (i === total - 1 ? CROWN : bag[i % bag.length]));

  /* ---------------------------------------------------------------- the riddle card */
  const card = new ScreenCard();
  disposers.push(() => card.dispose());
  const pieces = (): string =>
    hunt
      .map((_, i) => {
        const got = i < found.length;
        return `<span style="display:inline-block;width:30px;height:30px;line-height:30px;margin:0 3px;border-radius:7px;font-size:18px;${
          got ? 'background:#f6e3a8;border:2px solid #b8862d' : 'background:rgba(120,90,40,0.12);border:2px dashed rgba(120,90,40,0.45)'
        }">${got ? found[i] : i === stage && phase !== 'done' ? '❔' : ''}</span>`;
      })
      .join('');
  const showRiddle = () => {
    const s = hunt[stage];
    const last = stage === total - 1;
    card.set(
      `<div style="font-size:13px;opacity:.75;letter-spacing:.5px">📜 ${last ? 'החידה האחרונה – האוצר הגדול!' : `חידה ${stage + 1} מתוך ${total}`}</div>` +
        `<div style="font-size:20px;font-weight:700;margin:4px 0 8px">${escapeHtml(s.riddle)}</div>` +
        `<div style="direction:ltr">${pieces()}</div>`,
    );
    card.pulse();
  };
  card.set(`<div style="font-size:20px;font-weight:700">🗺️ ציד האוצרות מתחיל!</div><div style="font-size:14px">פתרו את החידות, עקבו אחרי המדחום ומצאו ${total} תיבות</div>`);

  /* ---------------------------------------------------------------- chest / mound objects */
  const chestTemplate = (gold: boolean) => {
    const { group } = buildChest({ wood: gold ? '#6e3f1f' : '#8a5a34', bands: '#3b3a38' }, { gold, coins: true, scale: gold ? 1.35 : 1 });
    const baked = bake(group);
    return baked;
  };
  const moundMat = M.matte('#6b4b30');
  const xMat = new THREE.MeshBasicMaterial({ color: '#c8341f' });
  disposers.push(() => xMat.dispose());
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  disposers.push(() => glowMat.dispose());

  const makeChest = (i: number): ChestFx => {
    const s = hunt[i];
    const gold = i === total - 1;
    const root = new THREE.Group();
    const gy = ctx.groundAt(s.spot.x, s.spot.y);
    root.position.set(s.spot.x, gy, s.spot.y);
    // a mound of fresh earth with a red X and a soft glow ring
    const mound = new THREE.Group();
    const m = new THREE.Mesh(blobGeo(0.62, 2, i + 3, 0.22), moundMat);
    m.scale.set(1, 0.32, 1);
    m.castShadow = m.receiveShadow = true;
    mound.add(m);
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.03, 0.12), xMat);
      bar.position.y = 0.2;
      bar.rotation.y = a;
      mound.add(bar);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 32), glowMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.name = 'ring';
    mound.add(ring);
    root.add(mound);
    const chest = chestTemplate(gold);
    chest.position.y = -0.9;
    chest.visible = false;
    root.add(chest);
    const lid = chest.children.find((c) => c.name === 'part:lid') ?? null;
    root.visible = false;
    ctx.root.add(root);
    return { root, mound, chest, lid, gem: null, t: 0 };
  };
  const chests = hunt.map((_, i) => makeChest(i));

  // the treasure that flies out of a chest
  const gemFor = (i: number): THREE.Object3D => {
    const l = loot[i];
    let o: THREE.Object3D;
    if (l === CROWN) {
      const g = new THREE.Group();
      const gold = M.metal('#f2c23a', 0.25, 1);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.14, 20, 1, true), gold);
      g.add(band);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), gold);
        p.position.set(Math.sin(a) * 0.21, 0.14, Math.cos(a) * 0.21);
        g.add(p);
        const j = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), M.glass(['#e0405a', '#3fa0e0', '#40c070'][k % 3], 0.9));
        j.position.set(Math.sin(a) * 0.215, 0.01, Math.cos(a) * 0.215);
        g.add(j);
      }
      o = g;
    } else if (l.icon === '🪙' || l.icon === '⭐') {
      const geo = l.icon === '⭐' ? starGeo() : new THREE.CylinderGeometry(0.16, 0.16, 0.035, 24);
      if (l.icon !== '⭐') geo.rotateX(Math.PI / 2);
      o = new THREE.Mesh(geo, M.metal(l.color, 0.25, 1));
    } else if (l.icon === '💍') {
      o = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 10, 24), M.metal('#e8b63c', 0.25, 1));
      const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), M.glass(l.color, 0.9));
      stone.position.y = 0.14;
      o.add(stone);
    } else {
      o = new THREE.Mesh(l.icon === '🔮' || l.icon === '🐚' ? new THREE.SphereGeometry(0.13, 18, 12) : new THREE.OctahedronGeometry(0.16, 0), M.glass(l.color, 0.85));
      o.scale.y = l.icon === '💎' ? 1.3 : 1;
    }
    return o;
  };

  /* ---------------------------------------------------------------- shovel in the hand */
  const shovel = new THREE.Group();
  {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8), M.wood('#9a6b43'));
    handle.position.y = -0.3;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.02), M.metal('#9aa1a6', 0.4, 0.9));
    blade.position.y = -0.82;
    shovel.add(handle, blade);
    shovel.visible = false;
    ctx.root.add(shovel);
  }

  /* ---------------------------------------------------------------- fireworks */
  const fireworks = new Fireworks();
  fireworks.onBurst = () => {
    ctx.sfx('pop', 0.6);
    ctx.note(72 + Math.floor(ctx.random() * 12), 0.25);
  };
  ctx.root.add(fireworks.points);
  disposers.push(() => fireworks.dispose());

  /* ---------------------------------------------------------------- stage flow */
  const current = () => hunt[stage];
  const distToSpot = () => Math.hypot(walk.pos.x - current().spot.x, walk.pos.y - current().spot.y);

  const beginStage = () => {
    phase = 'search';
    stageStart = ctx.elapsed();
    stageHints = 0;
    hintLeft = 0;
    chests[stage].root.visible = false;
    showRiddle();
    ctx.ui.banner(stage === total - 1 ? '🗺️ החידה האחרונה!' : `📜 חידה ${stage + 1}`, 1300);
    ctx.sfx('page', 0.8);
    ctx.ui.set({ target: null });
  };

  const useHint = () => {
    if (phase !== 'search' || hintLeft > 0) return;
    hints++;
    stageHints++;
    hintLeft = HINT_SECONDS;
    ctx.ui.popup(`💡 רמז! −${HINT_COST}`, '#ffd34d');
    ctx.sfx('ding', 0.7);
  };

  const startDig = () => {
    phase = 'dig';
    phaseT = 0;
    const s = current();
    hintLeft = 0;
    ctx.ui.set({ target: null, hint: 'חופרים... 🪏' });
    // step to a comfortable digging distance, facing the X (the camera then sees the chest)
    let dx = walk.pos.x - s.spot.x;
    let dy = walk.pos.y - s.spot.y;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const stand = { x: s.spot.x + dx * 1.25, y: s.spot.y + dy * 1.25 };
    walk.faceTo(s.spot);
    // the chest comes up facing the digger
    chests[stage].root.rotation.y = Math.atan2(stand.x - s.spot.x, stand.y - s.spot.y);
    walk.occupy({
      activity: 'feed',
      label: 'חופרים',
      lockMovement: true,
      frame: () => {
        if (phase !== 'dig') return null;
        return { x: stand.x, y: stand.y, floor: ctx.groundAt(stand.x, stand.y), facing: Math.atan2(s.spot.x - stand.x, s.spot.y - stand.y), pose: 'stand' };
      },
      onEnd: () => {
        shovel.visible = false;
      },
    });
    shovel.visible = true;
  };

  const openChest = () => {
    phase = 'open';
    phaseT = 0;
    walk.release();
    const s = current();
    const fx = chests[stage];
    fx.mound.visible = false;
    ctx.sfx('door-open', 0.8);
    const gem = gemFor(stage);
    gem.position.set(0, 0.5, 0);
    gem.visible = false;
    fx.root.add(gem);
    fx.gem = gem;
    walk.character.setActivity('none');
    void s;
  };

  const awardStage = () => {
    const s = current();
    const secs = ctx.elapsed() - stageStart;
    const pts = stageScore(secs, s.leg, stageHints);
    score += pts.total;
    const l = loot[stage];
    found = [...found, l.icon];
    const at = v3.set(s.spot.x, ctx.groundAt(s.spot.x, s.spot.y) + 1.1, s.spot.y);
    ctx.emit('spark', at, 30, 0.8);
    ctx.emit('confetti', at, 26, 0.5);
    ctx.ui.popup(`${l.icon} ${l.name}!`, l.color);
    ctx.ui.popup(`+${pts.total}${pts.speed > 0 ? ` (מהירות +${pts.speed})` : ''}`, '#ffe27a');
    if (stage < total - 1) ctx.ui.popup('🧩 חלק מהמפה!', '#f6e3a8');
    walk.character.gesture('cheer');
    ctx.sfx('star', 0.9);
    [72, 76, 79, 84].forEach((n, k) => later(() => ctx.note(n, 0.55), k * 110));
    ctx.ui.set({ score });
    showRiddleFound();
  };

  const showRiddleFound = () => {
    card.set(
      `<div style="font-size:13px;opacity:.75">מצאתם: ${escapeHtml(current().label)}</div>` +
        `<div style="font-size:21px;font-weight:700;margin:4px 0 8px">${loot[stage].icon} ${escapeHtml(loot[stage].name)}!</div>` +
        `<div style="direction:ltr">${pieces()}</div>`,
    );
    card.pulse();
  };

  const finishHunt = () => {
    phase = 'final';
    phaseT = 0;
    score += FINAL_BONUS;
    ctx.ui.set({ score, bar: null, target: null, hint: '🎆 מצאתם את האוצר הגדול!' });
    ctx.ui.banner('👑 האוצר הגדול!', 2200);
    ctx.ui.popup(`+${FINAL_BONUS} בונוס אוצר`, '#ffd23a');
    walk.character.setActivity('cheer');
    ctx.sfx('fanfare', 0.9);
    const s = current();
    const gy = ctx.groundAt(s.spot.x, s.spot.y);
    for (let k = 0; k < 4; k++) later(() => launchInView(s.spot, gy), k * 450);
  };

  /** a rocket that bursts where the camera looks (a little beyond the chest) */
  const launchInView = (at: Vec2, gy: number) => {
    const f = walk.forward();
    const side = (ctx.random() - 0.5) * 12;
    fireworks.launch(at.x + f.x * 18 - f.y * side, gy, at.y + f.y * 18 + f.x * side, 3.5 + ctx.random() * 3, () => ctx.random());
  };

  const done = () => {
    phase = 'done';
    walk.character.setActivity('none');
    const time = goTime ? ctx.elapsed() - goTime : 0;
    ctx.finish({
      score,
      detail: `מצאתם ${total} תיבות ואת האוצר הגדול ב־${fmt(time)}!`,
      stats: [
        ['זמן', fmt(time)],
        ['רמזים', String(hints)],
        ['האוצרות', found.join(' ')],
      ],
    });
  };

  /* ---------------------------------------------------------------- round start */
  ctx.ui.set({ score: 0, scoreLabel: 'נקודות', timer: 0, lines: [`🗺️ ${total} תיבות מחכות בשכונה`], hint: 'פתרו את החידה · H – רמז (−100) · E – לחפור' });
  ctx.ui.banner('🗺️ ציד אוצרות!', 1500);
  void ctx.ui.countdown().then(() => {
    if (phase !== 'intro') return;
    goTime = ctx.elapsed();
    beginStage();
  });

  /* ---------------------------------------------------------------- frame */
  const update = (dt: number): void => {
    phaseT += dt;
    fireworks.update(dt);
    if (goTime) ctx.ui.set({ timer: ctx.elapsed() - goTime });
    // chests that were found keep shining; the current one shows up when close
    for (let i = 0; i < chests.length; i++) {
      const fx = chests[i];
      if (!fx.root.visible) continue;
      const ring = fx.mound.getObjectByName('ring');
      if (ring) ring.scale.setScalar(1 + 0.08 * Math.sin(ctx.elapsed() * 4));
      if (fx.gem && i !== stage) fx.gem.rotation.y += dt * 1.5;
    }
    if (phase === 'intro' || phase === 'done') return;
    const s = current();
    const fx = chests[stage];
    const d = distToSpot();

    if (phase === 'search') {
      const w = warmth(d, s.leg);
      const lab = warmthLabel(w);
      const secs = ctx.elapsed() - stageStart;
      if (hintLeft > 0) {
        hintLeft -= dt;
        ctx.ui.set({ target: { x: s.spot.x, y: s.spot.y, label: '💡 רמז' } });
        if (hintLeft <= 0) ctx.ui.set({ target: null });
      }
      const near = d < 1.9;
      const driving = walk.driving;
      ctx.ui.set({
        bar: { value: w, label: `מדחום: ${lab.text}`, color: lab.color },
        lines: [`🧩 חלקי מפה: ${found.length}/${total}`, `💡 רמזים: ${hints}`],
        hint: near
          ? driving
            ? 'רדו מהרכב (E) – ואז E לחפור!'
            : '🪏 E – לחפור כאן!'
          : secs > 40 && hintLeft <= 0
            ? 'תקועים? H – רמז (חץ ל־10 שניות, −100)'
            : 'פתרו את החידה ועקבו אחרי המדחום · H – רמז · Shift – ריצה',
      });
      // the spot reveals itself when you are close
      fx.root.visible = d < 16;
      // a ticking "geiger" when it gets hot
      if (w > 0.72) {
        beepTimer -= dt;
        if (beepTimer <= 0) {
          beepTimer = 0.25 + (1 - w) * 2.4;
          ctx.note(70 + Math.round(w * 14), 0.22);
        }
      }
      if (d < 7 && ctx.random() < dt * 3) ctx.emit('spark', v3.set(s.spot.x, ctx.groundAt(s.spot.x, s.spot.y) + 0.35, s.spot.y), 2, 0.7);
    } else if (phase === 'dig') {
      const k = Math.min(1, phaseT / DIG_SECONDS);
      // the shovel in the right hand, the mound shrinks and earth flies
      walk.character.handWorld(v3);
      shovel.position.copy(v3);
      shovel.rotation.set(-0.5 - Math.sin(phaseT * 9) * 0.35, walk.facing, 0, 'YXZ');
      fx.mound.scale.set(1 - k * 0.6, 1 - k * 0.8, 1 - k * 0.6);
      fx.chest.visible = true;
      fx.chest.position.y = -0.9 + k * 0.9;
      if (ctx.random() < dt * 14) {
        ctx.emit('crumb', v3.set(s.spot.x, ctx.groundAt(s.spot.x, s.spot.y) + 0.25, s.spot.y), 6, 0.5);
        if (ctx.random() < 0.3) ctx.sfx('chomp', 0.35);
      }
      if (phaseT >= DIG_SECONDS) openChest();
    } else if (phase === 'open') {
      // lid swings open, the treasure rises and spins
      if (fx.lid) fx.lid.rotation.x = -Math.min(1.9, phaseT * 3.2);
      if (phaseT > 0.4 && fx.gem) {
        if (!fx.gem.visible) {
          fx.gem.visible = true;
          awardStage();
        }
        const u = Math.min(1, (phaseT - 0.4) / 0.9);
        fx.gem.position.y = 0.5 + u * (stage === total - 1 ? 1.4 : 1.0);
        fx.gem.rotation.y += dt * 4;
      }
      if (phaseT > 0.4 && ctx.random() < dt * 10) ctx.emit('spark', v3.set(s.spot.x, ctx.groundAt(s.spot.x, s.spot.y) + 0.9, s.spot.y), 3, 0.5);
      if (phaseT > 1.6) {
        if (stage === total - 1) finishHunt();
        else {
          phase = 'between';
          phaseT = 0;
        }
      }
    } else if (phase === 'between') {
      if (fx.gem) fx.gem.rotation.y += dt * 3;
      if (phaseT > 1.4) {
        stage++;
        beginStage();
      }
    } else if (phase === 'final') {
      if (fx.gem) {
        fx.gem.rotation.y += dt * 2;
        fx.gem.position.y = 1.9 + Math.sin(phaseT * 2) * 0.1;
      }
      if (ctx.random() < dt * 6) ctx.emit('confetti', v3.set(walk.pos.x, walk.y + 2, walk.pos.y), 6, 2);
      if (phaseT > 1.8 && phaseT < 4.2 && ctx.random() < dt * 2.5) launchInView(s.spot, ctx.groundAt(s.spot.x, s.spot.y));
      if (phaseT > 5.2) done();
    }
  };

  return {
    update,
    key(code, down) {
      if (!down) return false;
      if (code === 'KeyH') {
        useHint();
        return true;
      }
      if ((code === 'KeyE' || code === 'Enter') && phase === 'search' && distToSpot() < 1.9) {
        if (walk.driving) return false; // E gets off the bike first
        startDig();
        return true;
      }
      // while digging E / movement must not end the dig
      if (phase === 'dig' && (code === 'KeyE' || code === 'Space')) return true;
      return false;
    },
    dispose() {
      phase = 'done';
      if (walk.occupation) walk.release();
      walk.character.setActivity('none');
      for (const f of disposers) f();
    },
  };
}

function starGeo(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.07 : 0.17;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
  g.translate(0, 0, -0.02);
  return g;
}

export const GAME: MiniGameDef = {
  id: 'treasure',
  howTo: [
    'בכל סיבוב נוצר ציד חדש מהמקומות שבשכונה שלכם: בתי ספר, מזרקות, מתקנים ומה שבניתם!',
    'קראו את החידה וגלו לאיזה מקום היא רומזת – ברגל (Shift לריצה) או על אופניים.',
    'המדחום מראה חם/קר: ככל שמתקרבים – הוא מתחמם.',
    'ליד המקום מופיעה גבעת עפר עם X – לחצו E כדי לחפור ולפתוח את התיבה.',
    'H – רמז: חץ שמראה את הדרך ל־10 שניות (עולה 100 נקודות).',
    '5 תיבות, ובאחרונה – האוצר הגדול! מהר יותר ופחות רמזים = יותר נקודות.',
  ],
  medals: { bronze: 1300, silver: 2000, gold: 2500, unit: 'points' },
  venue: { plot: 'west', build: buildTreasureCamp },
  start,
};
