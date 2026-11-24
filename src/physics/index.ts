import type { PhysicsWorld } from './world';

/**
 * Walk-mode rigid-body physics. Rapier (WebAssembly, embedded in the JS chunk) is loaded only when
 * walk mode starts – the editor and the Node tests never load it. Everything else in this folder is
 * pure and safe to import anywhere.
 */
let mod: Promise<typeof import('./world')> | null = null;

export function loadPhysics(): Promise<PhysicsWorld> {
  mod ??= import('./world');
  return mod.then((m) => m.createPhysics());
}

export type { PhysicsWorld } from './world';
export type { ImpactEvent, VehicleState, WalkItem, WalkPhysics, WalkerBody } from './types';
