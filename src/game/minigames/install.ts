import { useStore } from '../../store/store';
import type { MiniGameId } from './meta';
import { hasVenue, installVenue } from './plots';
import { miniGame } from './registry';

/** Build the venue of a game into the current project (one undo step). Returns false if it has none. */
export function installMiniGameVenue(id: MiniGameId): boolean {
  const def = miniGame(id);
  if (!def.venue) return false;
  const venue = def.venue;
  useStore.getState().update((d) => installVenue(d, id, venue.plot, venue.build));
  return true;
}

/** Does the game still need its venue built in the current project? */
export function needsVenue(id: MiniGameId): boolean {
  const def = miniGame(id);
  return !!def.venue && !hasVenue(useStore.getState().project, id);
}
