import type { FurnitureDef } from '../types';
import { GAME_A_PIZZA_ITEMS } from './_gameAPizza';
import { GAME_A_RACE_ITEMS } from './_gameARace';

/** Catalog items for the neighborhood mini-games (team A): race day and the pizzeria. */
export const GAME_ITEMS_A: FurnitureDef[] = [...GAME_A_RACE_ITEMS, ...GAME_A_PIZZA_ITEMS];
