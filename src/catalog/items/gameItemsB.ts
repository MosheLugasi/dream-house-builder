import type { FurnitureDef } from '../types';
import { PARKOUR_ITEMS } from './_gameBParkour';
import { SKATE_ITEMS } from './_gameBSkate';

/** Catalog items for the neighborhood mini-games (team B): skatepark obstacles, a skateboard, obstacle-course pieces. */
export const GAME_ITEMS_B: FurnitureDef[] = [...SKATE_ITEMS, ...PARKOUR_ITEMS];
