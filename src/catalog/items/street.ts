import type { FurnitureDef } from '../types';
import { STREET_POLES } from './_street_poles';
import { STREET_FURN } from './_street_furn';
import { STREET_GREEN } from './_street_green';

/** Neighborhood & street furniture: lamps, signs, shelters, bins, fences, trees. */
export const STREET: FurnitureDef[] = [...STREET_POLES, ...STREET_FURN, ...STREET_GREEN];
