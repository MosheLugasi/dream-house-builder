import type { FurnitureDef } from '../types';
import { COASTERS } from './_gameCCoaster';
import { PARK_DECO } from './_gameCDeco';
import { bumperCars, pirateShip, teacups } from './_gameCSwing';
import { dropTower, ferrisWheel } from './_gameCWheel';

/** Catalog items for the neighborhood mini-games (team C): the amusement park ("לונה פארק"). */
export const GAME_ITEMS_C: FurnitureDef[] = [ferrisWheel, ...COASTERS, dropTower, pirateShip, teacups, bumperCars, ...PARK_DECO];
