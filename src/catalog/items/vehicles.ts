import type { FurnitureDef } from '../types';
import { carCompact, carFamily, minibus } from './_vehicleCars';
import { bicycle, kickScooter, kidsBike } from './_vehicleCycles';
import { tractor } from './_vehicleTractor';

/**
 * Rideable vehicles. Every item is `noBake`: `build` returns a fresh group whose wheels (and
 * steering pivots) stay separate nodes, listed in `userData.wheels` (see `WheelPart`).
 */
export const VEHICLES: FurnitureDef[] = [bicycle, kidsBike, kickScooter, carCompact, carFamily, minibus, tractor];
