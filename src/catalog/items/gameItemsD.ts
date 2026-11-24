import type { FurnitureDef } from '../types';
import { LAKE_ITEMS } from './_gameDLake';
import { STADIUM_ITEMS } from './_gameDStadium';
import { STAGE_ITEMS } from './_gameDStage';

/** Catalog items for the neighborhood mini-games (team D): stadium, fishing lake, concert stage. */
export const GAME_ITEMS_D: FurnitureDef[] = [...STADIUM_ITEMS, ...LAKE_ITEMS, ...STAGE_ITEMS];
