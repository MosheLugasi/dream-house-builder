import type { FurnitureDef } from '../types';
import { FARM_ITEMS } from './_gameEFarm';
import { TREASURE_ITEMS } from './_gameETreasure';

/** Catalog items for the neighborhood mini-games (team E): the farm and the treasure hunt. */
export const GAME_ITEMS_E: FurnitureDef[] = [...FARM_ITEMS, ...TREASURE_ITEMS];
