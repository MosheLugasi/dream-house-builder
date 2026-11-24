import type { MiniGameDef } from '../types';
import { MEDALS } from './logic';
import { startPark } from './session';
import { buildPark } from './venue';

/**
 * "לונה פארק": plan and build an amusement park in the south plot, then visit it – a 3-minute round
 * with a punch card for every ride standing in the park (see session.ts). The rides are catalog
 * items that also work on their own in walk mode (src/catalog/items/gameItemsC.ts).
 */
export const GAME: MiniGameDef = {
  id: 'amusement',
  howTo: [
    '3 דקות בלונה פארק: עלו על כמה שיותר מתקנים שונים – כל מתקן = חותמת בכרטיסייה ונקודות לפי כמה הוא מפחיד.',
    'E ליד הכניסה למתקן – עולים. המתקן מחזיר אתכם לבד בסוף הסיבוב.',
    'אתגרים: רווח = ידיים למעלה כל הירידה · F בפסגת הגלגל = צילום · W בספלים = סחרור · התנגשויות במכוניות.',
    'V – מבט מהמושב. בונוס גדול למי שעולה על כל סוגי המתקנים!',
    'דירוג הפארק (מגוון, אוכל, נוי ותאורה) נותן בונוס – אפשר להוסיף מתקנים ודוכנים בעורך השכונה.',
  ],
  medals: { bronze: MEDALS.bronze, silver: MEDALS.silver, gold: MEDALS.gold, unit: 'points' },
  venue: { plot: 'south', build: buildPark },
  start: startPark,
};
