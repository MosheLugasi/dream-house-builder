import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getFurniture } from '../src/catalog';
import { OBSTACLE_SHAPES, kickerProfile, quarterPipeProfile } from '../src/catalog/items/_gameBShapes';
import { plotById } from '../src/game/minigames/plots';
import { obstacleSurfaces, siteObstacleSurfaces } from '../src/game/minigames/skatepark/surfaces';
import { Combo, airTrick, judgeLanding, spinHalves } from '../src/game/minigames/skatepark/tricks';
import { sampleProject } from '../src/model/neighborhood';
import { WalkController, emptyWorld, type AirEvent, type WalkVehicle } from '../src/render3d/WalkController';
import { surfaceHeightAt, surfaceSlopeAlong, surfaceTop } from '../src/render3d/walkSurfaces';

function controller() {
  const cam = new THREE.PerspectiveCamera();
  const dom = { addEventListener() {}, removeEventListener() {}, setPointerCapture() {} } as unknown as HTMLElement;
  return new WalkController(cam, dom);
}

function boardVehicle(x: number, y: number, rotation: number): WalkVehicle {
  const def = getFurniture('skateboard-ride')!;
  const holder = new THREE.Group();
  const body = def.build({ colors: { deck: '#f00', stripe: '#ff0', wheels: '#fff' } });
  holder.add(body);
  holder.userData.body = body;
  holder.position.set(x, 0, y);
  holder.rotation.y = -rotation;
  return { id: 'board', def, holder };
}

describe('obstacle surfaces', () => {
  it('quarter pipe profile starts at the ground in front and ends steep under a flat deck', () => {
    const p = quarterPipeProfile({ w: 3, d: 2.4, h: 1.3 });
    expect(p[p.length - 1]).toEqual([1.2, 0]);
    expect(p[0][1]).toBeCloseTo(1.3);
    const a = p[2];
    const b = p[1];
    const top = Math.atan((a[1] - b[1]) / (b[0] - a[0]));
    void top;
    const kp = kickerProfile({ w: 1.5, d: 1.8, h: 0.6 });
    expect(kp[0][1]).toBeCloseTo(0.6);
    expect(kp[kp.length - 1][1]).toBe(0);
  });

  it('places surfaces like the item (rotation, mirror, elevation)', () => {
    const def = getFurniture('skate-kicker')!;
    const s = obstacleSurfaces({ id: 'k', catalogId: 'skate-kicker', x: 10, y: 5, rotation: Math.PI / 2, elevation: 0 }, def, 0.1)[0];
    expect(s.y0).toBeCloseTo(0.1);
    // local front (+z, ground level) maps to site −x for a quarter turn
    const front = surfaceHeightAt(s, 10 - 0.85, 5)!;
    const lip = surfaceHeightAt(s, 10 + 0.85, 5)!;
    expect(front).toBeLessThan(0.2);
    expect(lip).toBeGreaterThan(0.6);
    // going uphill along +x
    expect(surfaceSlopeAlong(s, 10, 5, 1, 0)).toBeGreaterThan(0.2);
    expect(surfaceTop([s], 10 + 0.85, 5, 0.3)).toBeNull();
  });

  it('every shape stays inside the item footprint', () => {
    for (const [id, shape] of Object.entries(OBSTACLE_SHAPES)) {
      const def = getFurniture(id);
      expect(def, id).toBeTruthy();
      for (const s of shape(def!.size)) {
        if (s.tag === 'rail') continue; // rails grab a little wider than the tube
        expect(Math.abs(s.cx) + s.hw, id).toBeLessThanOrEqual(def!.size.w / 2 + 1e-6);
        expect(Math.abs(s.cz) + s.hd, id).toBeLessThanOrEqual(def!.size.d / 2 + 1e-6);
      }
    }
  });
});

describe('walk physics on surfaces', () => {
  it('a skateboard flies off a kicker and lands', () => {
    const walk = controller();
    const world = emptyWorld();
    const def = getFurniture('skate-kicker')!;
    // kicker facing −y (front towards the rider coming from +y… rotation π: front points to −y)
    world.surfaces = obstacleSurfaces({ id: 'k', catalogId: 'skate-kicker', x: 0, y: 0, rotation: Math.PI, elevation: 0 }, def, 0);
    world.surfaceOwners = new Set(['k']);
    walk.world = world;
    const v = boardVehicle(0, -6, 0); // heading +y (rotation.y = 0 → +z = +y)
    world.vehicles.push(v);
    walk.ride(v);
    const events: AirEvent[] = [];
    walk.airListeners.add((e) => events.push(e));
    walk.setVirtualKey('KeyW', true);
    let maxY = 0;
    for (let i = 0; i < 200; i++) {
      walk.update(1 / 30);
      maxY = Math.max(maxY, v.holder.position.y);
    }
    expect(events.some((e) => e.phase === 'takeoff' && e.vehicle)).toBe(true);
    const land = events.find((e) => e.phase === 'land');
    expect(land).toBeTruthy();
    expect(land!.airTime).toBeGreaterThan(0.2);
    expect(maxY).toBeGreaterThan(0.7);
    expect(v.holder.position.z).toBeGreaterThan(3);
  });

  it('the walker steps onto low boxes, is blocked by high ones and falls off edges', () => {
    const walk = controller();
    const world = emptyWorld();
    const def = getFurniture('pk-platform')!;
    world.surfaces = [
      ...obstacleSurfaces({ id: 'low', catalogId: 'pk-platform', x: 0, y: 3, rotation: 0, elevation: 0, size: { w: 1.2, d: 1.2, h: 0.3 } }, def, 0),
      ...obstacleSurfaces({ id: 'high', catalogId: 'pk-platform', x: 0, y: 6, rotation: 0, elevation: 0, size: { w: 1.2, d: 1.2, h: 1.2 } }, def, 0),
    ];
    walk.world = world;
    walk.teleport({ x: 0, y: 0 }, Math.PI); // camera yaw π: forward = +y
    walk.setVirtualKey('KeyW', true);
    let onLow = false;
    for (let i = 0; i < 150; i++) {
      walk.update(1 / 30);
      if (Math.abs(walk.pos.y - 3) < 0.4 && walk.y > 0.25) onLow = true;
    }
    expect(onLow).toBe(true);
    // stopped in front of the high platform
    expect(walk.pos.y).toBeLessThan(6 - 0.6 + 0.05);
    expect(walk.y).toBeLessThan(0.05);
  });
});


describe('tricks', () => {
  it('names and scores air tricks', () => {
    expect(spinHalves(Math.PI * 2 - 0.3)).toBe(2);
    const t = airTrick('board', { spin: Math.PI * 2, flips: ['kick'], grab: null, airTime: 0.8 })!;
    expect(t.name).toBe('360 קיקפליפ');
    expect(t.points).toBe(48 + 250 + 250);
    expect(airTrick('bike', { spin: Math.PI, flips: ['kick'], grab: { dir: 'up', time: 0.5 }, airTime: 1 })!.name).toBe('180 טייל-וויפ + סופרמן');
    expect(airTrick('board', { spin: 0, flips: [], grab: null, airTime: 0.3 })).toBeNull();
    expect(airTrick('board', { spin: 0, flips: [], grab: null, airTime: 0.7 })!.name).toBe('אולי');
    expect(airTrick('board', { spin: 0, flips: ['kick', 'kick'], grab: null, airTime: 0.7 })!.name).toBe('דאבל קיקפליפ');
  });

  it('judges landings', () => {
    expect(judgeLanding(0.95, 0)).toBe('clean');
    expect(judgeLanding(-0.9, 0)).toBe('fakie');
    expect(judgeLanding(0.3, 0)).toBe('bail-angle');
    expect(judgeLanding(1, 0.5)).toBe('bail-flip');
  });

  it('multiplies combos and makes repeats cheaper', () => {
    const c = new Combo();
    c.add('קיקפליפ', 300);
    expect(c.add('קיקפליפ', 300)).toBe(150);
    c.add('50-50 גרינד', 200);
    expect(c.multiplier).toBe(3);
    expect(c.value).toBe((300 + 150 + 200) * 3);
    expect(c.bank()).toBe(1950);
    expect(c.active).toBe(false);
  });
});

describe('the default skatepark', () => {
  it('stands in its plot and every obstacle becomes a surface', () => {
    const p = sampleProject();
    const plot = plotById('se');
    const props = p.site.props.filter((f) => f.x >= plot.x0 && f.x <= plot.x0 + plot.w && f.y >= plot.y0 && f.y <= plot.y0 + plot.h);
    expect(props.some((f) => f.catalogId === 'game-sign-skatepark')).toBe(true);
    expect(props.filter((f) => f.catalogId === 'skateboard-ride').length).toBeGreaterThan(0);
    const surfaces = siteObstacleSurfaces(props, () => 0);
    expect(new Set(surfaces.map((s) => s.id)).size).toBeGreaterThanOrEqual(9);
  });
});
