// the catalog first: its item files must be fully loaded before the game reads their constants
import '../../../catalog';
import * as THREE from 'three';
import { boxLidMaterial, DELIVERY_BOX } from '../../../catalog/items/_gameAPizza';
import { M } from '../../../catalog/kit';
import type { Vec2 } from '../../../model/types';
import { Character } from '../../../render3d/Character';
import type { Occupation } from '../../../render3d/WalkController';
import { disposeFx, groundRing, textSprite } from '../race/fx';
import { backToSign, lookWith, makeVehicle, mountPlayer, placeVehicle, WorldHooks, yawOf, type GameVehicle } from '../race/ride';
import type { MiniGameContext, MiniGameSession } from '../types';
import {
  cool,
  CRASH_HEAT,
  CRASH_POINTS,
  customersOf,
  deliveryPoints,
  DOOR_REACH,
  isCrash,
  nextStreak,
  pickCustomer,
  ROUND_SECONDS,
  STOP_SPEED,
  type Customer,
} from './logic';

const PICKUP_R = 3.2;

export function startDelivery(ctx: MiniGameContext): MiniGameSession {
  const hooks = new WorldHooks(ctx);
  const walk = ctx.walk;
  const project = ctx.project();
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

  // ---- the shop: the pizza counter nearest to the game's sign (the player may have moved it) ----
  const sign = project.site.props.find((f) => f.catalogId === 'game-sign-delivery');
  const signPos = sign ? { x: sign.x, y: sign.y } : { ...walk.pos };
  const counters = project.site.props.filter((f) => f.catalogId === 'pizza-counter');
  counters.sort((a, b) => Math.hypot(a.x - signPos.x, a.y - signPos.y) - Math.hypot(b.x - signPos.x, b.y - signPos.y));
  const counter = counters[0];
  // the counter's front (+Z) in plan: (−sin θ, cos θ)
  const cFront = counter ? { x: -Math.sin(counter.rotation), y: Math.cos(counter.rotation) } : { x: 0, y: -1 };
  const shop = counter ? { x: counter.x, y: counter.y } : signPos;
  const pickup: Vec2 = { x: shop.x + cFront.x * 2.6, y: shop.y + cFront.y * 2.6 };
  const shopBuilding = project.buildings
    .filter((b) => b.id.startsWith('v-delivery-'))
    .sort((a, b) => Math.hypot(a.x - shop.x, a.y - shop.y) - Math.hypot(b.x - shop.x, b.y - shop.y))[0];
  const customers = customersOf(project.buildings, project.site.roads, (b) => b === shopBuilding || Math.hypot(b.x - shop.x, b.y - shop.y) < 18);

  // ---- props of the round -----------------------------------------------------------------------
  const ring = groundRing(PICKUP_R, '#ffb02e');
  ring.position.set(pickup.x, ctx.groundAt(pickup.x, pickup.y) + 0.06, pickup.y);
  ctx.root.add(ring);
  const doorRing = groundRing(1.4, '#4ade80');
  doorRing.visible = false;
  ctx.root.add(doorRing);
  const pickupLabel = textSprite('🍕 איסוף פיצה', { bg: 'rgba(200,55,43,0.9)', height: 0.6 });
  pickupLabel.position.set(pickup.x, 3.2, pickup.y);
  ctx.root.add(pickupLabel);

  // the chef behind the counter
  const chef = new Character(lookWith(77, '#ffffff'));
  chef.root.position.set(shop.x - cFront.x * 0.85, ctx.groundAt(shop.x, shop.y), shop.y - cFront.y * 0.85);
  chef.root.rotation.y = yawOf(cFront.x, cFront.y);
  ctx.root.add(chef.root);

  // the delivery bike, parked next to the pick-up spot
  const side = { x: -cFront.y, y: cFront.x };
  const bikeAt = { x: pickup.x + side.x * 2.2, y: pickup.y + side.y * 2.2 };
  const bike: GameVehicle | null = makeVehicle(ctx, 'mg-delivery-bike', 'delivery-bike', { box: '#c8372b' }, { maxSpeed: 9, acceleration: 3.4 });
  if (bike) {
    placeVehicle(ctx, bike, bikeAt, yawOf(side.x, side.y));
    hooks.addVehicle(bike);
  }
  hooks.sync();

  // a pizza box (carried in the hands, flying into the bike's box…)
  const pizzaBox = new THREE.Group();
  const card = M.paint('#dcc59c', 0.85);
  const boxBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), card);
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(0.39, 0.39), boxLidMaterial());
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = 0.031;
  pizzaBox.add(boxBody, lid);
  pizzaBox.visible = false;
  ctx.root.add(pizzaBox);

  // ---- state ------------------------------------------------------------------------------------
  type Phase = 'intro' | 'pickup' | 'deliver' | 'handover' | 'over';
  let phase: Phase = 'intro';
  let timeLeft = ROUND_SECONDS;
  let points = 0;
  let deliveries = 0;
  let streak = 0;
  let bestStreak = 0;
  let heat = 1;
  let rush = false;
  let order: Customer | null = null;
  let orderNo = 0;
  let lastCustomer: string | null = null;
  let bumps = 0;
  let crashCool = 0;
  let prevSpeed = 0;
  let steamT = 0;
  let tick = 11;
  let loading = 0; // seconds of the box flying from the counter into the bike
  let customer: Character | null = null;
  let customerFor: string | null = null;
  let cheerT = 0;
  let finished = false;
  let hotDeliveries = 0;

  // read-only peek for automated checks (Playwright): scene.getObjectByName('minigame:delivery')
  ctx.root.userData.delivery = { pickup, state: () => ({ phase, points, deliveries, heat, timeLeft, order: order && { name: order.name, step: order.entrance.step, out: order.entrance.out } }) };

  const startPos = { x: bikeAt.x - side.x * 0.9 + cFront.x * 0.4, y: bikeAt.y - side.y * 0.9 + cFront.y * 0.4 };
  walk.teleport(startPos, yawOf(-cFront.x, -cFront.y) + Math.PI, 0);
  walk.faceTo(bikeAt);
  ctx.ui.set({
    lines: ['🍕 פיצה שמש – משלוחים!', 'עלו על אופני השליחויות (E)'],
    score: 0,
    scoreLabel: 'נקודות',
    timer: ROUND_SECONDS,
    hint: 'E – לעלות על האופניים · W/S גז ובלם · A/D היגוי',
    target: null,
  });
  ctx.ui.banner('🍕 שליח פיצה – 3 דקות!', 1800);
  later(1200, () => {
    void ctx.ui.countdown(3).then(() => {
      if (phase !== 'intro') return;
      phase = 'pickup';
      ctx.sfx('bike-bell');
      ctx.ui.popup('לאסוף את הפיצה הראשונה!', '#ffb02e');
    });
  });

  // ---- orders -------------------------------------------------------------------------------------
  const newOrder = () => {
    orderNo++;
    order = pickCustomer(customers, pickup, lastCustomer, ctx.random);
    rush = orderNo > 1 && (orderNo % 3 === 0 || ctx.random() < 0.15);
    heat = 1;
    bumps = 0;
    if (!order) {
      ctx.ui.banner('אין בתים עם דלת בשכונה 🙁', 2500);
      later(2500, () => ctx.quit());
      return;
    }
    phase = 'deliver';
    ctx.ui.banner(rush ? `⚡ הזמנה דחופה! ${order.name}` : `🍕 הזמנה: ${order.name}`, 1800);
    ctx.sfx(rush ? 'bell' : 'ding', 0.8);
    ctx.note(76, 0.5);
    later(110, () => ctx.note(81, 0.5));
    const e = order.entrance;
    doorRing.visible = true;
    doorRing.position.set(e.step.x, ctx.groundAt(e.step.x, e.step.y) + 0.07, e.step.y);
  };

  const loadPizza = () => {
    loading = 0.55;
    pizzaBox.visible = true;
    chef.gesture('wave');
    ctx.sfx('pop', 0.8);
    newOrder();
  };

  // ---- the customer at the door ------------------------------------------------------------------
  const ensureCustomer = () => {
    if (!order || customerFor === order.buildingId) return;
    removeCustomer();
    customerFor = order.buildingId;
    customer = new Character(lookWith(100 + orderNo * 7, ['#7c4dff', '#ff7043', '#26a69a', '#ec407a', '#5c6bc0'][orderNo % 5]));
    const e = order.entrance;
    customer.root.position.set(e.step.x, ctx.groundAt(e.step.x, e.step.y), e.step.y);
    customer.root.rotation.y = yawOf(e.out.x, e.out.y);
    ctx.root.add(customer.root);
    customer.gesture('wave');
  };
  const removeCustomer = () => {
    if (!customer) return;
    customer.root.removeFromParent();
    customer.dispose();
    customer = null;
    customerFor = null;
  };

  // ---- handing the pizza over (the rider gets off, runs to the door and back) -------------------------
  const handOver = () => {
    if (!order || !bike) return;
    const e = order.entrance;
    const from = { x: walk.pos.x, y: walk.pos.y };
    const door = { x: e.step.x + e.out.x * 0.7, y: e.step.y + e.out.y * 0.7 };
    const back = { x: bike.holder.position.x + Math.cos(bike.holder.rotation.y) * 0.75, y: bike.holder.position.z - Math.sin(bike.holder.rotation.y) * 0.75 };
    const d1 = Math.hypot(door.x - from.x, door.y - from.y);
    const d2 = Math.hypot(back.x - door.x, back.y - door.y);
    const RUN = 4.4;
    const t1 = d1 / RUN;
    const t2 = t1 + 0.9;
    const t3 = t2 + d2 / RUN;
    let t = 0;
    let given = false;
    const heatNow = heat;
    const rushNow = rush;
    const who = order;
    phase = 'handover';
    const o: Occupation = {
      activity: 'none',
      label: 'מוסרים פיצה',
      lockMovement: true,
      key: () => true,
      frame: (dt) => {
        t += dt;
        walk.character.reach = t < t1 + 0.4;
        if (t < t1) {
          const f = t / t1;
          const x = from.x + (door.x - from.x) * f;
          const y = from.y + (door.y - from.y) * f;
          return { x, y, floor: ctx.groundAt(x, y), facing: yawOf(door.x - from.x, door.y - from.y), pose: 'stand', speed: RUN };
        }
        if (t < t2) {
          if (!given && t > t1 + 0.35) {
            given = true;
            delivered(who, heatNow, rushNow);
          }
          return { x: door.x, y: door.y, floor: ctx.groundAt(door.x, door.y), facing: yawOf(-e.out.x, -e.out.y), pose: 'stand', speed: 0 };
        }
        if (t < t3) {
          const f = (t - t2) / Math.max(0.01, t3 - t2);
          const x = door.x + (back.x - door.x) * f;
          const y = door.y + (back.y - door.y) * f;
          return { x, y, floor: ctx.groundAt(x, y), facing: yawOf(back.x - door.x, back.y - door.y), pose: 'stand', speed: RUN };
        }
        return null;
      },
      onEnd: () => {
        walk.character.reach = false;
        if (!given) delivered(who, heatNow, rushNow);
        later(30, () => {
          if (bike && !finished) mountPlayer(ctx, bike);
          if (phase === 'handover') phase = 'pickup';
        });
      },
    };
    walk.occupy(o);
    walk.character.reach = true;
    pizzaBox.visible = true;
    ctx.sfx('door-open', 0.5);
  };

  const delivered = (who: Customer, h: number, wasRush: boolean) => {
    streak = nextStreak(streak, h);
    bestStreak = Math.max(bestStreak, streak);
    if (h >= 0.5) hotDeliveries++;
    const tip = deliveryPoints(h, streak, wasRush);
    points += tip.total;
    deliveries++;
    lastCustomer = who.buildingId;
    pizzaBox.visible = false;
    doorRing.visible = false;
    order = null;
    if (customer) {
      customer.setActivity('cheer');
      cheerT = 2.2;
      const head = customer.headWorld();
      ctx.emit('heart', head.clone().add(new THREE.Vector3(0, 0.3, 0)), 8, 0.4);
      ctx.emit('confetti', head, 24, 0.8);
    }
    ctx.sfx('cheer', 0.7);
    ctx.sfx('star', 0.6);
    ctx.note(72, 0.6);
    later(120, () => ctx.note(76, 0.6));
    later(240, () => ctx.note(79, 0.7));
    ctx.ui.popup(`+${tip.total} ${h >= 0.8 ? '🔥 חמה!' : h >= 0.5 ? '🙂' : '🥶 קרה...'}`, h >= 0.5 ? '#ffd23a' : '#9ad7ff');
    if (wasRush) ctx.ui.popup('⚡ בונוס דחוף ×1.5', '#ffb02e');
    if (streak >= 2) ctx.ui.popup(`רצף ${streak}! +${tip.streak}`, '#ff8a3d');
    ctx.ui.banner(`תודה! ${who.name} 💛`, 1300);
  };

  // ---- per frame ------------------------------------------------------------------------------------
  const hud = () => {
    const lines = [`🍕 משלוחים: ${deliveries}`];
    let target: { x: number; y: number; label?: string } | null = null;
    let hint: string;
    const riding = !!bike && walk.currentVehicle?.id === bike.id;
    if (phase === 'deliver' && order) {
      lines.push(`${rush ? '⚡ ' : ''}הזמנה: ${order.name}`, `📍 ${order.address}`);
      target = { x: order.entrance.step.x, y: order.entrance.step.y, label: order.name };
      const near = Math.hypot(walk.pos.x - order.entrance.step.x, walk.pos.y - order.entrance.step.y) < DOOR_REACH;
      hint = near ? (Math.abs(walk.vehicleSpeed) < STOP_SPEED ? 'E – למסור את הפיצה!' : 'לעצור ליד הדלת (S)') : 'לרכוב לפי החץ · להיזהר לא להתנגש!';
    } else if (phase === 'pickup') {
      lines.push(deliveries ? 'לחזור לפיצריה לפיצה הבאה' : 'לאסוף את הפיצה הראשונה בדלפק');
      target = { x: pickup.x, y: pickup.y, label: 'פיצה שמש' };
      hint = 'לעצור בעיגול הכתום ליד הדלפק';
    } else if (phase === 'handover') {
      hint = 'מוסרים את הפיצה…';
    } else hint = 'E – לעלות על האופניים';
    if (!riding && phase !== 'handover' && phase !== 'intro' && phase !== 'over') hint = 'E – לעלות על האופניים';
    ctx.ui.set({
      lines,
      score: points,
      timer: Math.max(0, timeLeft),
      combo: streak >= 2 ? `×${streak} רצף` : null,
      hint,
      target,
      bar:
        phase === 'deliver'
          ? { value: heat, label: heat > 0.66 ? '🔥 חמה' : heat > 0.33 ? '♨️ פושרת' : '🥶 מתקררת', color: heat > 0.66 ? '#ff5a1f' : heat > 0.33 ? '#ffb02e' : '#5fb3ff', danger: 0.33 }
          : null,
    });
  };

  const end = () => {
    if (finished) return;
    finished = true;
    phase = 'over';
    ctx.finish({
      score: points,
      detail: deliveries ? `מסרת ${deliveries} פיצות${hotDeliveries === deliveries ? ' – כולן חמות! 🔥' : ''}` : 'עוד לא נמסרה פיצה – נסו שוב!',
      stats: [
        ['משלוחים', String(deliveries)],
        ['פיצות חמות', String(hotDeliveries)],
        ['הרצף הכי ארוך', String(bestStreak)],
        ['נקודות', String(points)],
      ],
    });
  };

  return {
    update(dt) {
      hooks.sync();
      const t = ctx.elapsed();
      (ring.material as THREE.MeshBasicMaterial).opacity = phase === 'pickup' ? 0.45 + 0.25 * Math.sin(t * 5) : 0.15;
      (doorRing.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.25 * Math.sin(t * 6);
      chef.update(dt, 0);
      if (customer) {
        customer.update(dt, 0);
        if (cheerT > 0) {
          cheerT -= dt;
          if (cheerT <= 0) removeCustomer();
        }
      }

      if (phase !== 'intro' && phase !== 'over') {
        timeLeft -= dt;
        if (timeLeft <= 10 && Math.ceil(timeLeft) < tick) {
          tick = Math.ceil(timeLeft);
          if (tick > 0) ctx.note(tick <= 3 ? 84 : 79, 0.5);
        }
        if (timeLeft <= 0) {
          ctx.ui.banner('⏰ נגמר הזמן!', 1500);
          end();
          return;
        }
      }

      const riding = !!bike && walk.currentVehicle?.id === bike.id;
      const speed = Math.abs(walk.vehicleSpeed);

      // pick-up at the counter
      if (phase === 'pickup' && riding && Math.hypot(walk.pos.x - pickup.x, walk.pos.y - pickup.y) < PICKUP_R && speed < 2.5) loadPizza();

      // the box flies from the counter into the bike
      if (loading > 0 && bike) {
        loading -= dt;
        const f = 1 - Math.max(0, loading) / 0.55;
        const a = new THREE.Vector3(shop.x, 1.1, shop.y);
        const B = DELIVERY_BOX;
        const phi = bike.holder.rotation.y;
        const b = new THREE.Vector3(bike.holder.position.x + Math.sin(phi) * B.z, B.y + B.h, bike.holder.position.z + Math.cos(phi) * B.z);
        pizzaBox.position.lerpVectors(a, b, f);
        pizzaBox.position.y += Math.sin(f * Math.PI) * 1.2;
        pizzaBox.rotation.set(0, phi + f * Math.PI * 2, 0);
        if (loading <= 0) {
          pizzaBox.visible = false;
          ctx.sfx('clack', 0.6);
        }
      }

      // carried in the hands at the door
      if (phase === 'handover' && pizzaBox.visible) {
        const hand = walk.character.handWorld();
        const f = { x: Math.sin(walk.facing), y: Math.cos(walk.facing) };
        pizzaBox.position.set(walk.pos.x + f.x * 0.32, hand.y + 0.05, walk.pos.y + f.y * 0.32);
        pizzaBox.rotation.set(0, walk.facing, 0);
      }

      if (phase === 'deliver' && order) {
        heat = cool(heat, dt, rush);
        if (Math.hypot(walk.pos.x - order.entrance.step.x, walk.pos.y - order.entrance.step.y) < 40) ensureCustomer();
        // steam from the hot box
        steamT -= dt;
        if (steamT <= 0 && heat > 0.4 && bike) {
          steamT = 0.5;
          const phi = bike.holder.rotation.y;
          ctx.emit('steam', new THREE.Vector3(bike.holder.position.x + Math.sin(phi) * DELIVERY_BOX.z, 1.35, bike.holder.position.z + Math.cos(phi) * DELIVERY_BOX.z), 2, 0.1);
        }
      }

      // bumping into things shakes the pizza
      crashCool -= dt;
      if (riding && crashCool <= 0 && isCrash(prevSpeed, speed)) {
        crashCool = 1;
        ctx.sfx('boing', 0.7);
        if (phase === 'deliver') {
          bumps++;
          heat = Math.max(0, heat - CRASH_HEAT);
          points = Math.max(0, points - CRASH_POINTS);
          ctx.ui.popup(`💥 הפיצה קפצה! −${CRASH_POINTS}`, '#ff6b6b');
          ctx.emit('crumb', new THREE.Vector3(walk.pos.x, 1.2, walk.pos.y), 10, 0.3);
        } else ctx.ui.popup('💥 בום!', '#ff6b6b');
      }
      prevSpeed = speed;
      hud();
    },
    key(code, down) {
      if (phase === 'over') return false;
      const riding = !!bike && walk.currentVehicle?.id === bike.id;
      if (code === 'KeyE' || code === 'Enter') {
        if (!down) return true;
        if (phase === 'handover') return true;
        if (!riding) {
          if (bike) mountPlayer(ctx, bike);
          return true;
        }
        if (phase === 'deliver' && order) {
          const d = Math.hypot(walk.pos.x - order.entrance.step.x, walk.pos.y - order.entrance.step.y);
          if (d < DOOR_REACH && Math.abs(walk.vehicleSpeed) < STOP_SPEED) handOver();
          else if (d < DOOR_REACH) ctx.ui.popup('קודם לעצור 🛑', '#ffffff');
          else ctx.ui.popup(`צריך להגיע לדלת של ${order.name}`, '#ffffff');
        } else if (phase === 'pickup') ctx.ui.popup('הפיצה מחכה בדלפק 🍕', '#ffffff');
        return true;
      }
      if (code === 'KeyF' || code === 'KeyG' || code === 'KeyT') return true;
      return false;
    },
    dispose() {
      finished = true;
      for (const h of timers) clearTimeout(h);
      if (walk.occupation) walk.release();
      for (const h of timers) clearTimeout(h);
      if (bike && walk.currentVehicle?.id === bike.id) walk.interact();
      backToSign(ctx, 'game-sign-delivery');
      walk.character.reach = false;
      removeCustomer();
      chef.root.removeFromParent();
      chef.dispose();
      hooks.dispose();
      disposeFx();
      void bumps;
    },
  };
}
