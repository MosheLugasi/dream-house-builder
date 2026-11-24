import { GAME as amusement } from './amusement';
import { GAME as dance } from './dance';
import { GAME as delivery } from './delivery';
import { GAME as farm } from './farm';
import { GAME as fishing } from './fishing';
import { GAME as football } from './football';
import { GAME as parkour } from './parkour';
import { GAME as race } from './race';
import { GAME as skatepark } from './skatepark';
import { GAME as treasure } from './treasure';
import type { MiniGameId } from './meta';
import type { MiniGameDef } from './types';

export const MINI_GAMES: MiniGameDef[] = [race, delivery, skatepark, parkour, amusement, football, fishing, dance, treasure, farm];

export const miniGame = (id: MiniGameId): MiniGameDef => MINI_GAMES.find((g) => g.id === id)!;
