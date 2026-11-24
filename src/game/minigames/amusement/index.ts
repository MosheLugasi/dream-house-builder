import type { MiniGameDef } from '../types';

/** Placeholder until the game is written: shows a "coming soon" banner and ends. */
export const GAME: MiniGameDef = {
  id: 'amusement',
  howTo: ['בקרוב!'],
  medals: { bronze: 1, silver: 2, gold: 3, unit: 'points' },
  start(ctx) {
    ctx.ui.banner('בקרוב!');
    setTimeout(() => ctx.quit(), 1200);
    return { update() {}, dispose() {} };
  },
};
