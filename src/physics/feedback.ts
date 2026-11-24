import * as THREE from 'three';
import { sound } from '../audio/sound';
import type { ParticleKind } from '../render3d/fx';
import type { PhysMaterial } from './profile';
import type { ImpactEvent } from './types';

/**
 * What a crash looks and sounds like: thumps and metal crunches scaled with the impulse, sparks when
 * metal scrapes metal, dust and splinters otherwise, a camera shake for the driver. The plan is pure
 * (tested); `playCrash` performs it with the procedural sound engine (silent until the first user
 * gesture and muted with everything else) and the walk-mode particles.
 */

export interface CrashPlan {
  /** 0..1 loudness before distance */
  level: number;
  /** sound layers */
  thump: number;
  crunch: number;
  clack: number;
  bounce: number;
  sparks: number;
  dust: number;
  splinters: number;
  /** camera shake for the driver, 0..1 */
  shake: number;
}

/** 0..1 how violent a hit is, from its impulse (N·s): a cone flicked away ≈ 0.1, a car into a wall ≈ 0.9. */
export function crashLevel(impulse: number): number {
  return Math.max(0, Math.min(1, (Math.log10(Math.max(1, impulse)) - 1.4) / 3));
}

const hard = (m: PhysMaterial) => m === 'metal' || m === 'stone' || m === 'glass';

export function crashPlan(e: ImpactEvent): CrashPlan {
  const level = Math.max(crashLevel(e.impulse), e.broke ? 0.7 : 0);
  const a = e.material;
  const b = e.otherMaterial;
  const metal = a === 'metal' && (b === 'metal' || b === 'stone');
  const plan: CrashPlan = { level, thump: 0, crunch: 0, clack: 0, bounce: 0, sparks: 0, dust: 0, splinters: 0, shake: 0 };
  if (level <= 0.02) return plan;
  plan.thump = hard(a) || hard(b) || level > 0.4 ? level : level * 0.6;
  plan.crunch = metal && level > 0.3 ? (level - 0.2) * 1.2 : 0;
  plan.clack = hard(a) || hard(b) ? Math.min(1, level * 1.2) : level * 0.5;
  plan.bounce = a === 'plastic' || b === 'plastic' || a === 'soft' ? Math.min(1, 0.3 + level) : 0;
  plan.sparks = metal && level > 0.3 ? Math.round(6 + 40 * (level - 0.3)) : 0;
  plan.dust = level > 0.2 ? Math.round(2 + 10 * level) : 0;
  plan.splinters = (a === 'wood' || b === 'wood' || a === 'plastic') && level > 0.15 ? Math.round(4 + 16 * level) : 0;
  if (e.kind === 'player') plan.shake = Math.max(0, Math.min(1, (e.dv - 1.2) / 8)) * (e.otherKind === 'prop' && !e.broke ? 0.5 : 1);
  return plan;
}

export interface ParticleSink {
  emit(kind: ParticleKind, at: THREE.Vector3, opts?: Record<string, number>): void;
}

const at = new THREE.Vector3();
let lastSound = 0;
let soundsThisWindow = 0;

/** Play a crash: sounds (scaled by distance to the listener) and particles at the contact point. */
export function playCrash(e: ImpactEvent, fx: ParticleSink | null, listener: THREE.Vector3, now = performance.now()): CrashPlan {
  const plan = crashPlan(e);
  if (plan.level <= 0.02) return plan;
  const dist = Math.hypot(e.x - listener.x, e.y - listener.y, e.z - listener.z);
  const near = Math.max(0, 1 - dist / 45);
  // a pile-up of props must not machine-gun the speakers: a few sounds per 120 ms at most
  if (now - lastSound > 120) {
    lastSound = now;
    soundsThisWindow = 0;
  }
  if (near > 0.02 && soundsThisWindow < 3) {
    soundsThisWindow++;
    const v = near * (0.35 + 0.65 * plan.level);
    if (plan.thump > 0) sound.drum(plan.level > 0.55 ? 'kick' : 'tom2', Math.min(1, plan.thump * v * 1.2));
    if (plan.crunch > 0) sound.drum('crash', Math.min(1, plan.crunch * v));
    if (plan.crunch > 0.4) sound.drum('snare', Math.min(1, plan.crunch * v * 0.8));
    if (plan.clack > 0) sound.sfx('clack', Math.min(1, plan.clack * v));
    if (plan.bounce > 0) sound.sfx('bounce', Math.min(1, plan.bounce * v * 0.7));
  }
  if (fx && dist < 60) {
    at.set(e.x, e.y, e.z);
    if (plan.sparks) fx.emit('spark', at, { count: plan.sparks, spread: 0.25, jitter: 4.5, vy: 1.6, gravity: 7, life: 0.55, size: 0.05 });
    if (plan.dust) {
      at.y = Math.max(0.15, e.y - 0.3);
      fx.emit('smoke', at, { count: plan.dust, spread: 0.6, jitter: 0.9, vy: 0.25, life: 1.6, size: 0.25, alpha: 0.35, r: 0.62, g: 0.6, b: 0.56 });
    }
    if (plan.splinters) {
      const c = e.material === 'plastic' || e.otherMaterial === 'plastic' ? { r: 0.85, g: 0.85, b: 0.82 } : { r: 0.72, g: 0.52, b: 0.3 };
      fx.emit('crumb', at.set(e.x, e.y, e.z), { count: plan.splinters, spread: 0.3, jitter: 3, vy: 2, size: 0.035, ...c });
    }
  }
  return plan;
}
