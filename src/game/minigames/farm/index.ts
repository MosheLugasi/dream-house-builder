import * as THREE from 'three';
import { getFurniture, itemSize } from '../../../catalog';
import { bake, M } from '../../../catalog/kit';
import { buildChicken, FARM_BED } from '../../../catalog/items/_gameEFarm';
import type { Vec2 } from '../../../model/types';
import { Character } from '../../../render3d/Character';
import { randomLook } from '../../../render3d/characterTypes';
import type { MiniGameContext, MiniGameDef, MiniGameSession, PlacedProp } from '../types';
import { plotById } from '../plots';
import { Fireworks, TextSprite } from '../treasure/fx';
import { buildBedPlants, buildWeeds } from './plants';
import {
  CAN_CAPACITY,
  CROPS,
  DAY_SECONDS,
  basketCount,
  canFill,
  crop,
  dayHour,
  emptyBed,
  harvest,
  itemsIcons,
  itemsText,
  makeOrder,
  missing,
  orderValue,
  peck,
  plant,
  product,
  stageFraction,
  stageOf,
  stepBed,
  takeOrder,
  tipFor,
  water,
  type Basket,
  type BedState,
  type CropId,
  type Order,
  type ProductId,
} from './rules';
import { buildFarmVenue } from './venue';

/**
 * "החווה שלי": a three-minute day on the farm. Plant seeds in the beds that stand on the farm plot,
 * water them from the tap / well, chase weeds and crows away, harvest and sell at the market stand
 * to customers with orders. Score = coins from sales and tips.
 */

const SOIL_TOP = 0.3;
const BED_REACH = 0.85;
const STAND_REACH = 3.3;
const SCARECROW_RADIUS = 7.5;

interface Bed {
  prop: PlacedProp;
  st: BedState;
  group: THREE.Group;
  plants: THREE.Object3D | null;
  plantKey: string;
  weeds: THREE.Object3D | null;
  wet: THREE.Mesh[];
  wetMat: THREE.MeshStandardMaterial;
  icon: TextSprite;
  center: Vec2;
  rot: number;
  hw: number;
  hd: number;
  w: number;
  d: number;
  wasStage: number;
}

interface Crow {
  obj: THREE.Group;
  wings: THREE.Object3D[];
  bed: Bed | null;
  state: 'in' | 'peck' | 'out';
  t: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

interface Hen {
  body: THREE.Object3D;
  head: THREE.Object3D;
  home: Vec2;
  pos: Vec2;
  heading: number;
  target: Vec2;
  wait: number;
  peck: number;
}

interface Customer {
  ch: Character;
  order: Order;
  patience: number;
  slot: number;
  state: 'arrive' | 'wait' | 'leave';
  path: Vec2[];
  pos: Vec2;
  heading: number;
  bubble: TextSprite;
  happy: number;
}

const near = (a: Vec2, b: Vec2, r: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= r;

function start(ctx: MiniGameContext): MiniGameSession {
  const walk = ctx.walk;
  const plot = plotById('west');
  const inPlot = (p: Vec2, m = 2) => p.x >= plot.x0 - m && p.x <= plot.x0 + plot.w + m && p.y >= plot.y0 - m && p.y <= plot.y0 + plot.h + m;
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
  const v3 = new THREE.Vector3();

  /* ---------------------------------------------------------------- what stands on the farm */
  const bedProps = ctx.props((it) => it.catalogId === 'farm-bed').filter((p) => inPlot(p.pos));
  if (!bedProps.length) {
    ctx.ui.banner('אין ערוגות בחווה 🙁', 2600);
    ctx.ui.set({ hint: 'הציבו "ערוגת ירקות" (קטלוג ← חוץ וגינה ← חווה) במגרש החווה ונסו שוב' });
    later(() => ctx.quit(), 3200);
    return { update() {}, dispose: () => disposers.forEach((f) => f()) };
  }
  const nearFarm = (p: Vec2) => inPlot(p, 12);
  const waterSources = ctx.props((it) => /^(farm-tap|farm-well|drinking-fountain|pool-outdoor-shower)$/.test(it.catalogId)).filter((p) => nearFarm(p.pos));
  const scarecrows = ctx.props((it) => it.catalogId === 'farm-scarecrow').filter((p) => nearFarm(p.pos));
  const trees = ctx.props((it) => it.catalogId === 'tree-fruit').filter((p) => inPlot(p.pos)).map((p) => ({ p, lemons: 3, t: 0 }));
  const coops = ctx.props((it) => it.catalogId === 'farm-coop').filter((p) => inPlot(p.pos)).map((p) => ({ p, eggs: 1, t: 0, icon: null as TextSprite | null }));
  const signItem = ctx.project().site.props.find((f) => f.catalogId === 'game-sign-farm');
  const signPos: Vec2 = signItem ? { x: signItem.x, y: signItem.y } : { ...walk.pos };
  const stands = ctx.props((it) => /^(farm-market-stand|produce-stand|kiosk)$/.test(it.catalogId)).filter((p) => inPlot(p.pos));
  stands.sort((a, b) => Math.hypot(a.pos.x - signPos.x, a.pos.y - signPos.y) - Math.hypot(b.pos.x - signPos.x, b.pos.y - signPos.y));
  const stand = stands[0] ?? null;
  const standPos: Vec2 = stand ? stand.pos : signPos;
  const standRot = stand ? stand.rotation : (signItem?.rotation ?? 0);
  const front = { x: -Math.sin(standRot), y: Math.cos(standRot) };
  const lateral = { x: Math.cos(standRot), y: Math.sin(standRot) };
  const slotPos = (i: number): Vec2 => ({ x: standPos.x + front.x * 1.8 + lateral.x * (i - 1) * 1.35, y: standPos.y + front.y * 1.8 + lateral.y * (i - 1) * 1.35 });
  const prePos: Vec2 = { x: standPos.x + front.x * 3.7, y: standPos.y + front.y * 3.7 };

  /* ---------------------------------------------------------------- beds */
  const bedDef = getFurniture('farm-bed')!;
  const iconsOn = new Set<TextSprite>();
  const beds: Bed[] = bedProps.map((p, i) => {
    const s = itemSize(bedDef, p.item);
    const ky = s.h / FARM_BED.h;
    const group = new THREE.Group();
    group.position.set(p.pos.x, p.floorY + (p.item.elevation ?? 0) + SOIL_TOP * ky, p.pos.y);
    group.rotation.y = -p.rotation;
    ctx.root.add(group);
    const wetMat = new THREE.MeshStandardMaterial({ color: '#2a1d14', transparent: true, opacity: 0, roughness: 0.35, depthWrite: false });
    disposers.push(() => wetMat.dispose());
    const wet: THREE.Mesh[] = [];
    for (const z of [-s.d / 4 + 0.02, s.d / 4 - 0.02]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w - 0.22, s.d / 2 - 0.18), wetMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.03 * ky, z);
      m.renderOrder = 1;
      group.add(m);
      wet.push(m);
    }
    const icon = new TextSprite(128, 112, 0.5);
    icon.sprite.position.set(0, 0.95, 0);
    icon.sprite.visible = false;
    group.add(icon.sprite);
    disposers.push(() => icon.dispose());
    void i;
    return { prop: p, st: emptyBed(), group, plants: null, plantKey: '', weeds: null, wet, wetMat, icon, center: p.pos, rot: p.rotation, hw: s.w / 2, hd: s.d / 2, w: s.w, d: s.d, wasStage: -1 };
  });
  void iconsOn;

  const plantCache = new Map<string, THREE.Group>();
  disposers.push(() =>
    plantCache.forEach((g) =>
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      }),
    ),
  );
  const plantsFor = (c: CropId, stage: number, w: number, d: number, spoiled: boolean): THREE.Object3D => {
    const key = `${c}|${stage}|${w.toFixed(2)}|${d.toFixed(2)}|${spoiled}`;
    let g = plantCache.get(key);
    if (!g) {
      g = buildBedPlants(c, stage, w, d, spoiled);
      plantCache.set(key, g);
    }
    return g.clone();
  };

  const bedDistance = (b: Bed, p: Vec2): number => {
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const dx = p.x - b.center.x;
    const dy = p.y - b.center.y;
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    return Math.hypot(Math.max(0, Math.abs(lx) - b.hw), Math.max(0, Math.abs(ly) - b.hd));
  };

  const refreshBed = (b: Bed): void => {
    const st = b.st;
    const stage = stageOf(st);
    const key = st.crop ? `${st.crop}|${stage}|${st.spoiled}` : '';
    if (key !== b.plantKey) {
      if (b.plants) b.group.remove(b.plants);
      b.plants = st.crop ? plantsFor(st.crop, stage, b.w, b.d, st.spoiled) : null;
      if (b.plants) b.group.add(b.plants);
      b.plantKey = key;
      if (st.crop && stage > b.wasStage && stage > 0) {
        // a little pop when a plant reaches a new stage
        ctx.emit('spark', v3.set(b.center.x, b.group.position.y + 0.2, b.center.y), stage === 4 ? 14 : 4, 0.8);
        if (stage === 4) ctx.sfx('ding', 0.35);
      }
      b.wasStage = st.crop ? stage : -1;
    }
    if (b.plants) {
      const f = stageFraction(st);
      const sc = st.progress >= 1 ? 1 + Math.sin(ctx.elapsed() * 3) * 0.015 : 0.72 + f * 0.28;
      b.plants.scale.setScalar(sc);
    }
    if (st.weed !== !!b.weeds) {
      if (b.weeds) {
        b.group.remove(b.weeds);
        b.weeds = null;
      } else {
        const wg = buildWeeds(b.w, b.d, Math.floor(ctx.random() * 1000));
        disposers.push(() =>
          wg.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) m.geometry.dispose();
          }),
        );
        b.weeds = wg;
        b.group.add(wg);
      }
    }
    b.wetMat.opacity = st.moisture * 0.5;
    // status icon over the bed
    let icon = '';
    if (st.crop) {
      if (st.spoiled) icon = '🥀';
      else if (st.progress >= 1) icon = st.ripeFor > 30 ? '⏰' : '✨';
      else if (st.weed) icon = '🌿';
      else if (st.moisture <= 0) icon = '💧';
    }
    b.icon.sprite.visible = !!icon;
    if (icon) {
      b.icon.draw(icon, { bg: icon === '💧' ? 'rgba(220,240,255,0.95)' : icon === '✨' ? 'rgba(255,246,200,0.95)' : 'rgba(255,255,255,0.92)', font: 62 });
      b.icon.sprite.position.y = 0.95 + Math.sin(ctx.elapsed() * 3 + b.center.x) * 0.05;
    }
  };

  /* ---------------------------------------------------------------- watering can (in the hand) */
  const can = new THREE.Group();
  {
    const metal = M.paint('#4f9fd0', 0.4);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.2, 14), metal);
    body.position.set(0, -0.12, 0.05);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.26, 8), metal);
    spout.position.set(0, -0.08, 0.2);
    spout.rotation.x = 1.0;
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.015, 0.03, 10), M.paint('#2f6f9a'));
    rose.position.set(0, -0.0, 0.3);
    rose.rotation.x = 1.0;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14, Math.PI), metal);
    handle.position.set(0, -0.02, 0.03);
    handle.rotation.y = Math.PI / 2;
    can.add(body, spout, rose, handle);
    ctx.root.add(can);
  }
  let canLevel = CAN_CAPACITY;
  let pourT = 0;

  /* ---------------------------------------------------------------- hens */
  const hens: Hen[] = [];
  const henTemplate = (() => {
    const g = buildChicken();
    const head = g.getObjectByName('head')!;
    g.remove(head);
    const hp = head.position.clone();
    head.position.set(0, 0, 0);
    const body = bake(g);
    const hb = bake(head);
    return { body, head: hb, headPos: hp };
  })();
  disposers.push(() =>
    [henTemplate.body, henTemplate.head].forEach((g) =>
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      }),
    ),
  );
  const hiddenHolders: THREE.Object3D[] = [];
  const placedHens = ctx.props((it) => it.catalogId === 'farm-chicken').filter((p) => inPlot(p.pos));
  const henSpots: Vec2[] = placedHens.map((p) => {
    if (p.holder) {
      p.holder.visible = false;
      hiddenHolders.push(p.holder);
    }
    return p.pos;
  });
  if (henSpots.length < 2) for (const c of coops) for (let i = 0; i < 3; i++) henSpots.push({ x: c.p.pos.x + Math.cos(i * 2.1) * 1.6, y: c.p.pos.y + 1.4 + Math.sin(i * 2.1) * 0.8 });
  for (const s of henSpots.slice(0, 5)) {
    const body = henTemplate.body.clone();
    const head = henTemplate.head.clone();
    head.position.copy(henTemplate.headPos);
    body.add(head);
    ctx.root.add(body);
    hens.push({ body, head, home: { ...s }, pos: { ...s }, heading: ctx.random() * 6.28, target: { ...s }, wait: ctx.random() * 2, peck: 0 });
  }
  disposers.push(() => hiddenHolders.forEach((h) => (h.visible = true)));

  /* ---------------------------------------------------------------- crows */
  const crows: Crow[] = [];
  const crowMat = M.matte('#1d1d22');
  const crowBeak = M.matte('#e0b030');
  const makeCrow = (): Crow => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), crowMat);
    body.scale.set(0.8, 0.75, 1.35);
    body.position.y = 0.16;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), crowMat);
    head.position.set(0, 0.28, 0.15);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 6), crowBeak);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.27, 0.25);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.16), crowMat);
    tail.position.set(0, 0.17, -0.22);
    tail.rotation.x = -0.3;
    const eyeMat = M.matte('#ffffff');
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), eyeMat);
      eye.position.set(s * 0.05, 0.3, 0.19);
      g.add(eye);
    }
    const wings: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.08, 0.2, 0);
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.015, 0.2), crowMat);
      w.position.x = s * 0.13;
      pivot.add(w);
      g.add(pivot);
      wings.push(pivot);
    }
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4), crowBeak);
      leg.position.set(s * 0.04, 0.04, 0);
      g.add(leg);
    }
    g.add(body, head, beak, tail);
    g.scale.setScalar(1.6);
    ctx.root.add(g);
    return { obj: g, wings, bed: null, state: 'in', t: 0, from: new THREE.Vector3(), to: new THREE.Vector3() };
  };
  const protectedBed = (b: Bed) => scarecrows.some((s) => near(s.pos, b.center, SCARECROW_RADIUS));
  const spawnCrow = (): void => {
    const options = beds.filter((b) => b.st.crop && !b.st.spoiled && b.st.progress > 0.2 && !crows.some((c) => c.bed === b));
    if (!options.length) return;
    const open = options.filter((b) => !protectedBed(b));
    const c = makeCrow();
    const a = ctx.random() * Math.PI * 2;
    if (!open.length) {
      // every bed is guarded: the crow circles the scarecrow and gives up
      const s = scarecrows[0];
      const gy = ctx.groundAt(s.pos.x, s.pos.y);
      c.from.set(s.pos.x + Math.cos(a) * 25, gy + 9, s.pos.y + Math.sin(a) * 25);
      c.to.set(s.pos.x + 1.5, gy + 2.6, s.pos.y);
      c.state = 'out';
      c.t = -2.5;
      ctx.ui.popup('🎃 הדחליל הבריח עורב!', '#ffd34d');
      crows.push(c);
      return;
    }
    const b = open[Math.floor(ctx.random() * open.length)];
    c.bed = b;
    c.from.set(b.center.x + Math.cos(a) * 26, b.group.position.y + 10, b.center.y + Math.sin(a) * 26);
    c.to.set(b.center.x + (ctx.random() - 0.5) * b.hw, b.group.position.y + 0.02, b.center.y);
    c.obj.position.copy(c.from);
    c.state = 'in';
    c.t = 0;
    crows.push(c);
    ctx.ui.popup('🐦‍⬛ עורב בשדה! רוצו לגרש אותו', '#ff8a6a');
    ctx.sfx('squeak', 0.5);
  };
  const scareCrow = (c: Crow, byPlayer: boolean): void => {
    if (c.state === 'out') return;
    c.state = 'out';
    c.t = 0;
    c.from.copy(c.obj.position);
    const a = ctx.random() * Math.PI * 2;
    c.to.set(c.obj.position.x + Math.cos(a) * 30, c.obj.position.y + 12, c.obj.position.z + Math.sin(a) * 30);
    if (byPlayer) {
      ctx.ui.popup('קישטה! 🐦‍⬛💨', '#9fe08a');
      ctx.sfx('whoosh', 0.7);
      walk.character.gesture('wave');
      chased++;
    }
  };

  /* ---------------------------------------------------------------- customers */
  const customers: Customer[] = [];
  let nextCustomer = 16;
  let customerSeed = Math.floor(ctx.random() * 1000);
  const slotsUsed = () => new Set(customers.filter((c) => c.state !== 'leave').map((c) => c.slot));
  const available = (): ProductId[] => {
    const out: ProductId[] = [];
    for (const b of beds) if (b.st.crop && !b.st.spoiled) out.push(b.st.crop, b.st.crop);
    for (const k of Object.keys(basket) as ProductId[]) if ((basket[k] ?? 0) > 0) out.push(k);
    if (trees.length) out.push('lemon');
    if (coops.length || hens.length) out.push('egg');
    return out;
  };
  const spawnCustomer = (): void => {
    const used = slotsUsed();
    const slot = [1, 0, 2].find((s) => !used.has(s));
    if (slot === undefined) return;
    const level = Math.min(1, ctx.elapsed() / DAY_SECONDS);
    const order = makeOrder(() => ctx.random(), available(), level);
    const ch = new Character(randomLook(customerSeed++ * 7 + 11));
    const side = ctx.random() < 0.5 ? -1 : 1;
    const spawn = { x: prePos.x + lateral.x * side * 16, y: prePos.y + lateral.y * side * 16 };
    ch.root.position.set(spawn.x, ctx.groundAt(spawn.x, spawn.y), spawn.y);
    ctx.root.add(ch.root);
    const bubble = new TextSprite(300, 120, 0.5);
    bubble.sprite.position.set(0, 2.4 + (slot === 1 ? 0.42 : 0), 0);
    (bubble.sprite.material as THREE.SpriteMaterial).depthTest = false;
    bubble.sprite.renderOrder = 15;
    ch.root.add(bubble.sprite);
    customers.push({ ch, order, patience: order.patience, slot, state: 'arrive', path: [prePos, slotPos(slot)], pos: spawn, heading: 0, bubble, happy: 0 });
  };
  const leave = (c: Customer, happy: boolean): void => {
    c.state = 'leave';
    const side = ctx.random() < 0.5 ? -1 : 1;
    c.path = [prePos, { x: prePos.x + lateral.x * side * 17, y: prePos.y + lateral.y * side * 17 }];
    c.happy = happy ? 1.2 : 0;
    if (happy) c.ch.gesture('cheer');
  };
  const removeCustomer = (c: Customer): void => {
    ctx.root.remove(c.ch.root);
    c.bubble.dispose();
    c.ch.dispose();
    customers.splice(customers.indexOf(c), 1);
  };
  disposers.push(() => {
    for (const c of [...customers]) removeCustomer(c);
  });

  /* ---------------------------------------------------------------- state */
  const basket: Basket = {};
  let seedIdx = 3; // tomato
  let coins = 0;
  let served = 0;
  let lost = 0;
  let sold = 0;
  let harvested = 0;
  let chased = 0;
  let running = false;
  let over = false;
  let nextWeed = 28;
  let nextCrow = 42;
  let warned = false;
  const fireworks = new Fireworks(500);
  ctx.root.add(fireworks.points);
  disposers.push(() => fireworks.dispose());
  let tod = 0;

  // the farm's day: the sun rises and sets during the round (restored afterwards)
  type ViewStore = { getState(): { view: { timeOfDay: number }; setView(p: { timeOfDay: number }): void } };
  let viewStore: ViewStore | null = null;
  let savedHour: number | null = null;
  // (the app's store is reached through the page, never imported: game modules load inside the store's own import)
  const pageStore = typeof window !== 'undefined' ? (window as unknown as { __store?: ViewStore }).__store : undefined;
  if (pageStore) {
    viewStore = pageStore;
    savedHour = viewStore.getState().view.timeOfDay;
    viewStore.getState().setView({ timeOfDay: dayHour(0) });
  }
  disposers.push(() => {
    if (viewStore && savedHour !== null) viewStore.getState().setView({ timeOfDay: savedHour });
  });

  const seed = () => CROPS[seedIdx];
  const basketLine = () => (basketCount(basket) ? `🧺 ${itemsIcons(basket)}` : '🧺 הסל ריק');

  /* ---------------------------------------------------------------- actions (E) */
  interface Action {
    label: string;
    run(): void;
  }
  const act = (activity: 'feed' | 'wash', secs = 0.8) => walk.playFor(activity, secs);

  const currentAction = (): Action | null => {
    if (walk.driving || walk.occupation || !running) return null;
    const me = walk.pos;
    // sell at the stand
    if (near(me, standPos, STAND_REACH)) {
      const waiting = customers.filter((c) => c.state === 'wait');
      if (waiting.length) {
        const ok = waiting.find((c) => canFill(basket, c.order));
        if (ok) return { label: `🪙 E – למכור: ${itemsText(ok.order.items)}`, run: () => serve(ok) };
        const first = waiting[0];
        return {
          label: `חסר בסל: ${itemsText(missing(basket, first.order))}`,
          run: () => {
            ctx.ui.popup(`חסר: ${itemsText(missing(basket, first.order))}`, '#ff9a7a');
            ctx.sfx('miss', 0.5);
          },
        };
      }
    }
    // fill the can
    for (const w of waterSources) {
      if (near(me, w.pos, 2.0) && canLevel < CAN_CAPACITY) {
        return {
          label: '🚰 E – למלא את המזלף',
          run: () => {
            canLevel = CAN_CAPACITY;
            act('wash', 0.9);
            ctx.sfx('splash', 0.7);
            ctx.emit('water', v3.set(w.pos.x, w.floorY + 0.8, w.pos.y), 24, 0.15);
            ctx.ui.popup('💧 המזלף מלא!', '#8fd0ff');
          },
        };
      }
    }
    // the nearest bed
    let bed: Bed | null = null;
    let best = BED_REACH;
    for (const b of beds) {
      const d = bedDistance(b, me);
      if (d < best) {
        best = d;
        bed = b;
      }
    }
    if (bed) {
      const b = bed;
      const st = b.st;
      if (st.weed) return { label: '🌿 E – לעקור עשבים', run: () => weed(b) };
      if (st.crop && (st.spoiled || st.progress >= 1)) return { label: st.spoiled ? '🥀 E – לנקות את הערוגה' : `${crop(st.crop).icon} E – לקטוף!`, run: () => pick(b) };
      if (!st.crop) return { label: `🌱 E – לשתול ${seed().icon} ${seed().one} (1-6 להחלפה)`, run: () => sow(b) };
      if (st.moisture < 0.45) {
        if (canLevel > 0) return { label: '💧 E – להשקות', run: () => wet(b) };
        return { label: 'המזלף ריק – מלאו אותו בברז 🚰', run: () => ctx.sfx('miss', 0.4) };
      }
    }
    for (const t of trees) {
      if (t.lemons > 0 && near(me, t.p.pos, 2.1)) return { label: `🍋 E – לקטוף לימונים (${t.lemons})`, run: () => pickLemons(t) };
    }
    for (const c of coops) {
      if (c.eggs > 0 && near(me, c.p.pos, 2.3)) return { label: `🥚 E – לאסוף ביצים (${c.eggs})`, run: () => collectEggs(c) };
    }
    return null;
  };

  const at = (b: Bed, y = 0.3) => v3.set(b.center.x, b.group.position.y + y, b.center.y);
  const sow = (b: Bed) => {
    plant(b.st, seed().id);
    walk.faceTo(b.center);
    act('feed', 0.8);
    ctx.emit('crumb', at(b, 0.05), 10, 0.8);
    ctx.sfx('pop', 0.5);
    ctx.ui.popup(`${seed().icon} שתלתם ${seed().many}!`, '#bfe89a');
  };
  const wet = (b: Bed) => {
    water(b.st);
    canLevel--;
    walk.faceTo(b.center);
    act('feed', 1.0);
    pourT = 1.0;
    ctx.sfx('splash', 0.5);
  };
  const weed = (b: Bed) => {
    b.st.weed = false;
    walk.faceTo(b.center);
    act('feed', 0.7);
    ctx.emit('crumb', at(b, 0.1), 12, 0.8);
    ctx.sfx('pop', 0.6);
    ctx.ui.popup('🌿 הערוגה נקייה!', '#bfe89a');
  };
  const pick = (b: Bed) => {
    const r = harvest(b.st);
    walk.faceTo(b.center);
    act('feed', 0.8);
    if (!r) return;
    if (r.count === 0) {
      ctx.ui.popup('🥀 הירקות נבלו – שתלו מחדש', '#d0b080');
      ctx.sfx('miss', 0.4);
      return;
    }
    basket[r.crop] = (basket[r.crop] ?? 0) + r.count;
    harvested += r.count;
    ctx.emit('spark', at(b, 0.4), 16, 1);
    ctx.ui.popup(`+${r.count} ${crop(r.crop).icon} לסל!`, '#ffe27a');
    ctx.sfx('star', 0.6);
    [76, 81].forEach((n, k) => later(() => ctx.note(n, 0.4), k * 90));
  };
  const pickLemons = (t: (typeof trees)[number]) => {
    basket.lemon = (basket.lemon ?? 0) + t.lemons;
    ctx.ui.popup(`+${t.lemons} 🍋`, '#ffe27a');
    harvested += t.lemons;
    t.lemons = 0;
    t.t = 0;
    walk.faceTo(t.p.pos);
    walk.character.gesture('wave');
    ctx.sfx('pop', 0.6);
  };
  const collectEggs = (c: (typeof coops)[number]) => {
    basket.egg = (basket.egg ?? 0) + c.eggs;
    ctx.ui.popup(`+${c.eggs} 🥚`, '#fff2c8');
    harvested += c.eggs;
    c.eggs = 0;
    c.t = 0;
    walk.faceTo(c.p.pos);
    act('feed', 0.7);
    ctx.sfx('squeak', 0.5);
  };
  const serve = (c: Customer) => {
    const value = orderValue(c.order);
    const tip = tipFor(value, c.patience / c.order.patience);
    takeOrder(basket, c.order);
    coins += value + tip;
    served++;
    sold += Object.values(c.order.items).reduce((s, n) => s + (n ?? 0), 0);
    ctx.ui.popup(`+${value} 🪙`, '#ffd23a');
    if (tip > 0) ctx.ui.popup(`טיפ על מהירות +${tip}!`, '#9fe08a');
    ctx.sfx('success', 0.8);
    ctx.emit('heart', v3.set(c.pos.x, ctx.groundAt(c.pos.x, c.pos.y) + 2, c.pos.y), 6, 0.4);
    walk.faceTo(c.pos);
    walk.character.gesture('wave');
    ctx.ui.set({ score: coins });
    leave(c, true);
  };

  /* ---------------------------------------------------------------- round start */
  ctx.ui.set({
    score: 0,
    scoreLabel: 'מטבעות',
    timer: DAY_SECONDS,
    lines: [`🌱 זרעים: ${seed().icon} ${seed().one} (1-6)`, basketLine()],
    bar: { value: 1, label: '💧 מזלף', color: '#3fa0e0' },
    hint: 'שתלו (E ליד ערוגה) · השקו · קטפו · מכרו בדוכן',
  });
  ctx.ui.banner('🌅 בוקר טוב בחווה!', 1500);
  void ctx.ui.countdown().then(() => {
    if (over) return;
    running = true;
    ctx.ui.banner('🥕 יום עבודה בחווה – 3 דקות!', 1400);
  });

  const finishDay = () => {
    over = true;
    running = false;
    ctx.ui.banner('🌇 השמש שוקעת – היום נגמר!', 2000);
    ctx.sfx('fanfare', 0.8);
    walk.character.setActivity('cheer');
    for (let k = 0; k < 5; k++)
      later(() => {
        const f = walk.forward();
        const side = (ctx.random() - 0.5) * 14;
        fireworks.launch(walk.pos.x + f.x * 18 - f.y * side, walk.y, walk.pos.y + f.y * 18 + f.x * side, 3.5 + ctx.random() * 3, () => ctx.random());
      }, 300 + k * 350);
    later(() => {
      walk.character.setActivity('none');
      ctx.finish({
        score: coins,
        detail: served ? `מכרתם ל־${served} לקוחות והרווחתם ${coins} מטבעות!` : 'הפעם אף לקוח לא קיבל את ההזמנה – נסו שוב!',
        stats: [
          ['לקוחות מרוצים', String(served)],
          ['לקוחות שהלכו', String(lost)],
          ['פריטים שנמכרו', String(sold)],
          ['נקטפו', String(harvested)],
          ['עורבים שגורשו', String(chased)],
        ],
      });
    }, 2600);
  };

  /* ---------------------------------------------------------------- frame */
  let hudT = 0;
  const update = (dt: number): void => {
    fireworks.update(dt);
    const t = ctx.elapsed();
    // the can follows the right hand (tilted while pouring)
    walk.character.handWorld(v3);
    can.position.copy(v3);
    pourT = Math.max(0, pourT - dt);
    can.rotation.set(pourT > 0 ? 0.9 : 0.1, walk.facing, 0, 'YXZ');
    can.visible = !walk.driving;
    if (pourT > 0 && pourT < 0.85) {
      const f = walk.forward();
      void f;
      const fx = Math.sin(walk.facing);
      const fz = Math.cos(walk.facing);
      ctx.emit('water', v3.set(can.position.x + fx * 0.32, can.position.y - 0.05, can.position.z + fz * 0.32), 2, 0.05);
    }

    // hens wander and peck
    for (const h of hens) {
      if (h.wait > 0) {
        h.wait -= dt;
        h.peck += dt;
        h.head.position.y = henTemplate.headPos.y - Math.max(0, Math.sin(h.peck * 9)) * 0.14;
        h.head.position.z = henTemplate.headPos.z + Math.max(0, Math.sin(h.peck * 9)) * 0.06;
        if (h.wait <= 0) {
          const a = ctx.random() * Math.PI * 2;
          const r = 0.5 + ctx.random() * 2.2;
          h.target = { x: h.home.x + Math.cos(a) * r, y: h.home.y + Math.sin(a) * r };
        }
      } else {
        const dx = h.target.x - h.pos.x;
        const dy = h.target.y - h.pos.y;
        const d = Math.hypot(dx, dy);
        // run away from the player a little
        const pd = Math.hypot(walk.pos.x - h.pos.x, walk.pos.y - h.pos.y);
        if (d < 0.1) h.wait = 1 + ctx.random() * 3;
        else {
          const sp = pd < 1.5 ? 1.4 : 0.55;
          const want = Math.atan2(dx, dy);
          let dh = want - h.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          h.heading += dh * Math.min(1, dt * 6);
          h.pos.x += Math.sin(h.heading) * sp * dt;
          h.pos.y += Math.cos(h.heading) * sp * dt;
          h.head.position.set(0, henTemplate.headPos.y, henTemplate.headPos.z + Math.sin(t * 14) * 0.025);
        }
        if (pd < 1.2 && h.wait <= 0) {
          const a = Math.atan2(h.pos.x - walk.pos.x, h.pos.y - walk.pos.y);
          h.target = { x: h.pos.x + Math.sin(a) * 1.5, y: h.pos.y + Math.cos(a) * 1.5 };
        }
      }
      h.body.position.set(h.pos.x, ctx.groundAt(h.pos.x, h.pos.y) + Math.abs(Math.sin(t * 10 + h.home.x)) * (h.wait > 0 ? 0 : 0.02), h.pos.y);
      h.body.rotation.y = h.heading;
    }

    // crows
    for (let i = crows.length - 1; i >= 0; i--) {
      const c = crows[i];
      c.t += dt;
      const flap = Math.sin(t * 22) * 0.9;
      if (c.state === 'in') {
        const u = Math.min(1, c.t / 3.2);
        c.obj.position.lerpVectors(c.from, c.to, u);
        c.obj.position.y += Math.sin(u * Math.PI) * 2 * (1 - u);
        c.obj.rotation.y = Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z);
        c.wings.forEach((w, k) => (w.rotation.z = (k ? -1 : 1) * flap));
        if (u >= 1) {
          c.state = 'peck';
          c.t = 0;
        }
      } else if (c.state === 'peck') {
        c.wings.forEach((w, k) => (w.rotation.z = (k ? -1 : 1) * 0.1));
        c.obj.rotation.x = Math.max(0, Math.sin(c.t * 8)) * 0.5;
        if (c.t > 9 && c.bed) {
          peck(c.bed.st);
          ctx.ui.popup('😠 העורב אכל מהערוגה!', '#ff8a6a');
          ctx.sfx('miss', 0.5);
          scareCrow(c, false);
        }
      } else {
        c.obj.rotation.x = 0;
        const u = Math.max(0, Math.min(1, c.t / 3));
        if (c.t < 0) {
          // circling the scarecrow before giving up
          const a = c.t * 2.5;
          c.obj.position.set(c.to.x + Math.cos(a) * 2, c.to.y + 1 + Math.sin(c.t * 3) * 0.3, c.to.z + Math.sin(a) * 2);
          c.obj.rotation.y = a + Math.PI;
          if (c.t > -0.05) {
            c.from.copy(c.obj.position);
            c.to.set(c.obj.position.x + 30, c.obj.position.y + 10, c.obj.position.z + 10);
            c.t = 0;
          }
        } else {
          c.obj.position.lerpVectors(c.from, c.to, u);
          c.obj.rotation.y = Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z);
        }
        c.wings.forEach((w, k) => (w.rotation.z = (k ? -1 : 1) * flap));
        if (u >= 1 && c.t >= 0) {
          ctx.root.remove(c.obj);
          c.obj.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) m.geometry.dispose();
          });
          crows.splice(i, 1);
          continue;
        }
      }
      // the player chases it away
      if (c.state !== 'out' && Math.hypot(walk.pos.x - c.obj.position.x, walk.pos.y - c.obj.position.z) < 2.8 && c.obj.position.y - walk.y < 3) scareCrow(c, true);
    }

    // customers walk in, wait and leave
    for (const c of [...customers]) {
      let speed = 0;
      if (c.path.length) {
        const to = c.path[0];
        const dx = to.x - c.pos.x;
        const dy = to.y - c.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.15) {
          c.path.shift();
          if (!c.path.length) {
            if (c.state === 'arrive') {
              c.state = 'wait';
              ctx.sfx('bell', 0.5);
              ctx.ui.popup(`👋 לקוח מבקש: ${itemsText(c.order.items)}`, '#fff');
            } else if (c.state === 'leave') {
              removeCustomer(c);
              continue;
            }
          }
        } else {
          speed = c.state === 'leave' && c.happy > 0 ? 1.6 : 1.35;
          const want = Math.atan2(dx, dy);
          let dh = want - c.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          c.heading += dh * Math.min(1, dt * 7);
          const step = Math.min(d, speed * dt);
          c.pos.x += (dx / d) * step;
          c.pos.y += (dy / d) * step;
        }
      }
      if (c.state === 'wait') {
        c.heading = Math.atan2(standPos.x - c.pos.x, standPos.y - c.pos.y);
        if (running) c.patience -= dt;
        if (c.patience <= 0) {
          lost++;
          ctx.ui.popup('😞 הלקוח לא חיכה והלך', '#ff9a7a');
          ctx.sfx('miss', 0.4);
          leave(c, false);
        }
      }
      c.ch.root.position.set(c.pos.x, ctx.groundAt(c.pos.x, c.pos.y), c.pos.y);
      c.ch.root.rotation.y = c.heading;
      c.ch.update(dt, speed);
      const frac = c.patience / c.order.patience;
      if (c.state === 'leave') {
        c.bubble.draw(c.happy > 0 ? '😄 תודה!' : '😞', { bg: 'rgba(255,255,255,0.9)' });
        c.bubble.sprite.visible = c.path.length > 1;
      } else {
        c.bubble.draw(itemsIcons(c.order.items), { bar: c.state === 'wait' ? frac : null, barColor: frac > 0.5 ? '#6cbf3a' : frac > 0.25 ? '#f0b030' : '#e0402f' });
      }
    }

    // beds
    for (const b of beds) {
      if (running) stepBed(b.st, dt);
      refreshBed(b);
    }

    // trees and coops refill
    for (const tr of trees) {
      if (tr.lemons < 3) {
        tr.t += dt;
        if (tr.t > 12) {
          tr.t = 0;
          tr.lemons++;
        }
      }
    }
    for (const c of coops) {
      if (c.eggs < 4) {
        c.t += dt;
        if (c.t > 14) {
          c.t = 0;
          c.eggs++;
          if (near(walk.pos, c.p.pos, 12)) ctx.ui.popup('🐔 קוקוריקו! ביצה חדשה', '#fff2c8');
        }
      }
      if (!c.icon) {
        c.icon = new TextSprite(160, 112, 0.55);
        c.icon.sprite.position.set(c.p.pos.x, c.p.floorY + 2.0, c.p.pos.y);
        ctx.root.add(c.icon.sprite);
        const ic = c.icon;
        disposers.push(() => ic.dispose());
      }
      c.icon.sprite.visible = c.eggs > 0;
      if (c.eggs > 0) c.icon.draw(`🥚×${c.eggs}`, { font: 52 });
    }

    if (!running) {
      ctx.ui.set({ hint: over ? null : 'מתכוננים...' });
      return;
    }

    // the day goes on
    const left = DAY_SECONDS - (t - (goT ?? t));
    if (goT === null) goT = t;
    if (left <= 0) {
      finishDay();
      return;
    }
    if (!warned && left < 30) {
      warned = true;
      ctx.ui.banner('⏰ עוד 30 שניות עד השקיעה!', 1500);
    }
    tod += dt;
    if (viewStore && tod > 1) {
      tod = 0;
      viewStore.getState().setView({ timeOfDay: dayHour(DAY_SECONDS - left) });
    }
    const dayT = DAY_SECONDS - left;
    if (dayT > nextCustomer) {
      spawnCustomer();
      nextCustomer = dayT + 8 + ctx.random() * 5 - Math.min(3, dayT / 60);
    }
    if (dayT > nextWeed) {
      const options = beds.filter((b) => b.st.crop && !b.st.spoiled && !b.st.weed && b.st.progress < 1);
      if (options.length && beds.filter((b) => b.st.weed).length < 3) {
        options[Math.floor(ctx.random() * options.length)].st.weed = true;
        ctx.ui.popup('🌿 עשבים שוטים צמחו!', '#bfe89a');
      }
      nextWeed = dayT + 14 + ctx.random() * 7;
    }
    if (dayT > nextCrow) {
      if (crows.filter((c) => c.state !== 'out').length < 2) spawnCrow();
      nextCrow = dayT + 18 + ctx.random() * 9;
    }

    // HUD
    hudT -= dt;
    const action = currentAction();
    currentRef = action;
    const crow = crows.find((c) => c.state !== 'out');
    if (hudT <= 0) {
      hudT = 0.1;
      const orders = customers.filter((c) => c.state === 'wait').map((c) => `👤 ${itemsIcons(c.order.items)} ⏳${Math.ceil(c.patience)}`);
      ctx.ui.set({
        timer: left,
        score: coins,
        lines: [`🌱 זרעים: ${seed().icon} ${seed().one} (1-6)`, basketLine(), ...orders],
        bar: { value: canLevel / CAN_CAPACITY, label: canLevel ? `💧 מזלף ${canLevel}/${CAN_CAPACITY}` : '💧 המזלף ריק!', color: '#3fa0e0', danger: undefined },
        hint: action?.label ?? (crow ? '🐦‍⬛ רוצו אל העורב כדי לגרש אותו!' : 'E ליד ערוגה: לשתול · להשקות · לקטוף · ומכרו בדוכן 🧺'),
        target: crow ? { x: crow.obj.position.x, y: crow.obj.position.z, label: '🐦‍⬛ עורב' } : null,
      });
    }
  };
  let goT: number | null = null;
  let currentRef: Action | null = null;

  return {
    update,
    key(code, down) {
      if (!down) return false;
      const digit = /^(Digit|Numpad)([1-6])$/.exec(code);
      if (digit) {
        seedIdx = Number(digit[2]) - 1;
        ctx.ui.popup(`${seed().icon} ${seed().one} – ${crop(seed().id).grow} שניות לגדול`, '#bfe89a');
        ctx.sfx('click', 0.5);
        return true;
      }
      if (code === 'KeyQ') {
        seedIdx = (seedIdx + 1) % CROPS.length;
        ctx.ui.popup(`${seed().icon} ${seed().one}`, '#bfe89a');
        return true;
      }
      if ((code === 'KeyE' || code === 'Enter') && running) {
        const a = currentAction() ?? currentRef;
        if (a) {
          a.run();
          return true;
        }
      }
      return false;
    },
    dispose() {
      over = true;
      running = false;
      walk.character.setActivity('none');
      walk.endTimed();
      for (const f of disposers) f();
    },
  };
}

export const GAME: MiniGameDef = {
  id: 'farm',
  howTo: [
    'יום שלם בחווה – 3 דקות מהזריחה ועד השקיעה.',
    'בחרו זרעים במקשים 1-6 (חסה, גזר, תות, עגבנייה, מלפפון, חמנייה) ולחצו E ליד ערוגה כדי לשתול.',
    'השקו עם המזלף (E ליד ערוגה) – כשהוא מתרוקן, מלאו אותו בברז או בבאר.',
    'הצמחים גדלים: נבט, עלים, פרחים ופרי. קטפו (E) לפני שהם נובלים!',
    'עקרו עשבים שוטים וגרשו עורבים (רוצו אליהם). הדחליל שומר על הערוגות שלידו.',
    'לקוחות מגיעים לדוכן עם הזמנות – מלאו אותן מהסל (E ליד הדוכן). מהר = טיפ!',
    'יש גם לימונים על העצים וביצים בלול 🍋🥚',
  ],
  medals: { bronze: 150, silver: 450, gold: 800, unit: 'points' },
  venue: { plot: 'west', build: buildFarmVenue },
  start,
};

void product;
