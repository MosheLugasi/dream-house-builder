import * as THREE from 'three';
import { D, INK, INK_SOFT, Kit, LINE_THIN, M, sym } from '../kit';
import type { FurnitureDef } from '../types';
import { bicycle } from './_vehicleCycles';
import { slot } from './_parts';
import { canvasMaterial, EMOJI_FONT, title } from './_gameAShared';

/**
 * Pizzeria items (team A): take-away counter, lit pizza sign, stack of pizza boxes and an electric
 * delivery bike with a thermal box on the rack (the delivery game rides it).
 */

/** draw a whole pizza (top view) into a canvas */
function drawPizza(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed = 3): void {
  g.fillStyle = '#d99a4e';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c8372b';
  g.beginPath();
  g.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f7d77a';
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r * 0.78;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.14, r * 0.1, a, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r * 0.7;
    g.fillStyle = '#9b2a1e';
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.09, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r * 0.7;
    g.fillStyle = '#3d7a2f';
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.07, r * 0.035, a, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(120,60,20,0.5)';
  g.lineWidth = r * 0.02;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    g.beginPath();
    g.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }
}

/** a pizza seen from above (texture for a thin disc) */
export function pizzaMaterial(): THREE.Material {
  return canvasMaterial('pizza-top', 256, 256, (g, w) => drawPizza(g, w / 2, w / 2, w / 2 - 2), '#d0603a', 0.05);
}

/** the lid of a pizza box (texture for the top face) */
export function boxLidMaterial(): THREE.Material {
  return canvasMaterial(
    'pizza-box-lid',
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#e7d2ad';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#b89b6c';
      g.lineWidth = 6;
      g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#c8372b';
      g.beginPath();
      g.arc(w / 2, h / 2 - 16, 58, 0, Math.PI * 2);
      g.fill();
      g.font = `72px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🍕', w / 2, h / 2 - 14);
      title(g, 'פיצה חמה', w / 2, h - 42, 34, '#7a3b16');
    },
    '#e7d2ad',
    0.05,
  );
}

function signFace(): THREE.Material {
  return canvasMaterial(
    'pizza-sign-face',
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#1f7a3a';
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fffaf0';
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 22, 0, Math.PI * 2);
      g.fill();
      drawPizza(g, w / 2, h / 2 - 40, 150, 11);
      g.fillStyle = '#c8372b';
      g.fillRect(70, h - 150, w - 140, 84);
      title(g, 'פיצה שמש', w / 2, h - 106, 64);
    },
    '#c8372b',
    0.45,
  );
}

function counterFront(): THREE.Material {
  return canvasMaterial(
    'pizza-counter-front',
    512,
    192,
    (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#c8372b';
        g.fillRect((i * w) / 8, 0, w / 8, h);
      }
      g.fillStyle = 'rgba(31,122,58,0.92)';
      g.fillRect(60, 40, w - 120, h - 80);
      title(g, '🍕 איסוף משלוחים', w / 2, h / 2 + 3, 46);
    },
    '#c8372b',
    0.25,
  );
}

const COUNTER = { w: 2.6, d: 0.95, h: 2.55 };

const pizzaCounter: FurnitureDef = {
  id: 'pizza-counter',
  name: 'דלפק פיצה לאיסוף',
  category: 'public',
  group: 'פיצריה',
  tags: ['פיצה', 'פיצריה', 'דלפק', 'משלוחים', 'טייק אוויי'],
  size: { ...COUNTER },
  colors: [slot('top', 'משטח', '#e9e4da'), slot('canopy', 'גגון', '#c8372b')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const { w, d, h } = COUNTER;
    k.box(w, 0.92, d, M.paint('#f4efe6', 0.6), 0, 0, 0);
    k.box(w - 0.1, 0.8, 0.01, counterFront(), 0, 0.07, d / 2 - 0.004);
    k.box(w, 0.05, d, M.marble(c.top), 0, 0.92, 0);
    k.box(w, 0.08, d, M.paint('#3b3d40', 0.8), 0, 0, 0);
    // heat-lamp canopy on two posts
    const steel = M.brushed();
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) k.box(0.05, h - 0.97, 0.05, steel, x, 0.97, -d / 2 + 0.1);
    const canopy = k.box(w, 0.06, d * 0.9, M.paint(c.canopy, 0.4), 0, h - 0.12, -0.02);
    canopy.rotation.x = 0.12;
    for (const x of [-0.7, 0, 0.7]) {
      k.cyl(0.11, 0.12, steel, x, h - 0.32, 0.05, 0.05, 12);
      k.disc(0.09, 0.01, M.glow('#ffb36b', 1.2), x, h - 0.335, 0.05, 16);
    }
    // pizza boxes, a pizza on a board and the till
    const card = M.paint('#dcc59c', 0.85);
    for (let i = 0; i < 5; i++) {
      k.box(0.42, 0.05, 0.42, card, -0.85, 0.97 + i * 0.052, -0.05);
    }
    k.box(0.4, 0.004, 0.4, boxLidMaterial(), -0.85, 0.97 + 5 * 0.052, -0.05);
    k.disc(0.24, 0.02, M.wood('#a5733f'), 0.15, 0.97, 0.0, 20);
    const pz = k.disc(0.21, 0.012, pizzaMaterial(), 0.15, 0.99, 0.0, 24);
    pz.rotation.y = 0.4;
    k.rbox(0.36, 0.14, 0.3, 0.02, M.paint('#2b2d31', 0.5), 0.85, 0.97, -0.1);
    const scr = k.box(0.26, 0.18, 0.02, M.screen('#1a3b5c'), 0.85, 1.12, -0.14);
    scr.rotation.x = -0.35;
    return k.g;
  },
  draw2d: (ctx, c) =>
    sym(ctx, () => {
      const { w, d } = COUNTER;
      D.box(ctx, -w / 2, -d / 2, w / 2, d / 2, 0.02, c.top, INK, LINE_THIN);
      D.circle(ctx, 0.15, 0, 0.22, '#d0603a', INK_SOFT, LINE_THIN);
      D.box(ctx, -1.06, -0.26, -0.64, 0.16, 0, '#dcc59c', INK_SOFT, LINE_THIN);
      D.line(ctx, -w / 2, d / 2 - 0.04, w / 2, d / 2 - 0.04, c.canopy, 0.04);
    }),
};

const pizzaSign: FurnitureDef = {
  id: 'pizza-sign',
  name: 'שלט פיצריה מואר',
  category: 'public',
  group: 'פיצריה',
  tags: ['פיצה', 'פיצריה', 'שלט', 'מואר'],
  size: { w: 1.7, d: 0.4, h: 4.4 },
  colors: [slot('pole', 'עמוד', '#2b2d31')],
  build: ({ colors: c }) => {
    const k = new Kit();
    const pole = M.metal(c.pole, 0.4, 0.8);
    k.cyl(0.08, 3.0, pole, 0, 0, 0, 0.07, 14);
    k.cyl(0.19, 0.1, M.paint('#3b3d40'), 0, 0, 0, 0.19, 16);
    const rim = k.cyl(0.8, 0.22, M.paint('#1f7a3a', 0.4), 0, 0, 0, 0.8, 40);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 3.6;
    for (const z of [0.115, -0.115]) {
      const f = k.cyl(0.76, 0.01, signFace(), 0, 0, z, 0.76, 40);
      f.rotation.x = Math.PI / 2;
      if (z < 0) f.rotation.z = Math.PI;
      f.position.y = 3.6;
      // the canvas is mapped on the cap; turn it upright
      f.rotation.y = z > 0 ? 0 : Math.PI;
    }
    return k.g;
  },
  draw2d: (ctx) =>
    sym(ctx, () => {
      D.box(ctx, -0.8, -0.12, 0.8, 0.12, 0.1, '#1f7a3a', INK, LINE_THIN);
      D.circle(ctx, 0, 0, 0.09, '#2b2d31', INK, LINE_THIN);
    }),
};

const boxStack: FurnitureDef = {
  id: 'pizza-box-stack',
  name: 'ערימת קרטוני פיצה',
  category: 'public',
  group: 'פיצריה',
  tags: ['פיצה', 'קרטון', 'קופסה', 'משלוחים'],
  size: { w: 0.44, d: 0.44, h: 0.5 },
  build: () => {
    const k = new Kit();
    const card = M.paint('#dcc59c', 0.85);
    for (let i = 0; i < 9; i++) {
      const m = k.box(0.42, 0.05, 0.42, card, 0, i * 0.054, 0);
      m.rotation.y = Math.sin(i * 2.1) * 0.06;
    }
    k.box(0.4, 0.004, 0.4, boxLidMaterial(), 0, 9 * 0.054 - 0.003, 0).rotation.y = Math.sin(8 * 2.1) * 0.06;
    return k.g;
  },
  draw2d: (ctx) =>
    sym(ctx, () => {
      D.box(ctx, -0.21, -0.21, 0.21, 0.21, 0.01, '#dcc59c', INK, LINE_THIN);
      D.circle(ctx, 0, 0, 0.1, '#c8372b', INK_SOFT, LINE_THIN);
    }),
};

/** thermal box on the delivery bike's rack (item space) */
export const DELIVERY_BOX = { z: -0.66, y: 0.84, w: 0.46, d: 0.44, h: 0.38 };

function thermalSide(color: string): THREE.Material {
  return canvasMaterial(
    `pizza-thermal-${color}`,
    256,
    256,
    (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(w / 2, h / 2 - 20, 70, 0, Math.PI * 2);
      g.fill();
      g.font = `86px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🍕', w / 2, h / 2 - 16);
      title(g, 'משלוחים', w / 2, h - 40, 40);
    },
    color,
    0.15,
  );
}

const deliveryBike: FurnitureDef = {
  id: 'delivery-bike',
  name: 'אופני שליחויות חשמליים',
  category: 'vehicle',
  tags: ['אופניים', 'משלוחים', 'פיצה', 'שליח', 'חשמלי'],
  size: { w: 0.6, d: 1.8, h: 1.24 },
  colors: [slot('frame', 'שלדה', '#2b2d31'), slot('seat', 'מושב', '#3a2a20'), slot('box', 'ארגז', '#c8372b')],
  noBake: true,
  vehicle: {
    ...bicycle.vehicle!,
    maxSpeed: 8.5,
    acceleration: 3,
    prompt: 'לרכוב על אופני השליחויות',
  },
  build: (ctx) => {
    const g = bicycle.build(ctx);
    const c = ctx.colors;
    const k = new Kit();
    const B = DELIVERY_BOX;
    const steel = M.metal('#2b2d31', 0.4, 0.8);
    // rack: two rails and stays down to the rear axle
    for (const x of [-0.09, 0.09]) {
      k.rod([x, B.y - 0.02, B.z - 0.2], [x, B.y - 0.02, B.z + 0.3], 0.008, steel);
      k.rod([x, B.y - 0.02, B.z - 0.15], [x * 0.7, 0.35, -0.54], 0.008, steel);
    }
    const side = thermalSide(c.box);
    k.rbox(B.w, B.h, B.d, 0.03, M.paint(c.box, 0.6), 0, B.y, B.z);
    k.box(B.w - 0.06, B.h - 0.08, 0.006, side, 0, B.y + 0.04, B.z - B.d / 2 - 0.002).rotation.y = Math.PI;
    k.box(0.006, B.h - 0.08, B.d - 0.08, side, B.w / 2 + 0.002, B.y + 0.04, B.z);
    k.box(0.006, B.h - 0.08, B.d - 0.08, side, -B.w / 2 - 0.002, B.y + 0.04, B.z);
    k.box(B.w - 0.02, 0.012, B.d - 0.02, M.paint('#f2f2ee', 0.5), 0, B.y + B.h, B.z);
    // battery on the down tube
    k.rbox(0.07, 0.07, 0.34, 0.02, M.paint('#1b1c1f', 0.5), 0, 0.5, 0.08).rotation.x = -0.75;
    g.add(k.g);
    return g;
  },
  draw2d: (ctx, c) => {
    bicycle.draw2d(ctx, c);
    sym(ctx, () => D.box(ctx, -0.23, -0.88, 0.23, -0.44, 0.03, c.box, INK, LINE_THIN));
  },
};

export const GAME_A_PIZZA_ITEMS: FurnitureDef[] = [pizzaCounter, pizzaSign, boxStack, deliveryBike];
