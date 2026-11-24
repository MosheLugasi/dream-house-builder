import { create } from 'zustand';
import { DEFAULT_LOOK, type CharacterLook } from '../render3d/characterTypes';
import type { Project } from '../model/types';

/**
 * Play progress that is about the PLAYER rather than about a project: the avatar's look, things
 * done so far (for challenges and stickers) and the stars collected in each neighborhood.
 * Stored in localStorage; never part of a project file.
 */
export type GameEvent =
  | 'room-built'
  | 'furniture-placed'
  | 'room-painted'
  | 'level-added'
  | 'roof-changed'
  | 'road-built'
  | 'building-added'
  | 'walked' // meters
  | 'cycled' // meters
  | 'drove' // meters
  | 'climbed-stairs'
  | 'sat'
  | 'slept'
  | 'slid'
  | 'swung'
  | 'bounced'
  | 'piano-note'
  | 'light-switched'
  | 'tv-watched'
  | 'water-used'
  | 'pet-petted'
  | 'star-collected'
  | 'goal-scored'
  | 'ball-kicked'
  | 'photo-taken'
  | 'night-walk'
  | 'avatar-changed'
  | 'minigame-played'
  | 'minigame-gold';

export interface Challenge {
  id: string;
  /** sticker shown in the album */
  icon: string;
  title: string;
  hint: string;
  group: 'build' | 'play';
  /** which counter it follows and how much is needed */
  event: GameEvent;
  goal: number;
}

export const CHALLENGES: Challenge[] = [
  { id: 'first-room', icon: '🏠', title: 'החדר הראשון', hint: 'בנו חדר במצב "תכנון בית"', group: 'build', event: 'room-built', goal: 1 },
  { id: 'decorator', icon: '🛋️', title: 'מעצבת פנים', hint: 'הניחו 10 רהיטים', group: 'build', event: 'furniture-placed', goal: 10 },
  { id: 'painter', icon: '🎨', title: 'צבעים חדשים', hint: 'צבעו או רצפו 3 חדרים', group: 'build', event: 'room-painted', goal: 3 },
  { id: 'second-floor', icon: '🪜', title: 'קומה שנייה', hint: 'הוסיפו קומה לבית', group: 'build', event: 'level-added', goal: 1 },
  { id: 'roofer', icon: '🏡', title: 'גג רעפים', hint: 'שנו את סוג הגג של בית', group: 'build', event: 'roof-changed', goal: 1 },
  { id: 'road-builder', icon: '🛣️', title: 'סוללת כבישים', hint: 'סללו 10 משבצות כביש', group: 'build', event: 'road-built', goal: 10 },
  { id: 'mayor', icon: '🏘️', title: 'ראש העיר', hint: 'הוסיפו 3 מבנים לשכונה', group: 'build', event: 'building-added', goal: 3 },
  { id: 'new-look', icon: '👗', title: 'מראה חדש', hint: 'עצבו את הדמות שלכם', group: 'play', event: 'avatar-changed', goal: 1 },
  { id: 'walker', icon: '👟', title: 'טיול בשכונה', hint: 'לכו 300 מטר', group: 'play', event: 'walked', goal: 300 },
  { id: 'cyclist', icon: '🚲', title: 'רוכבת אופניים', hint: 'רכבו 200 מטר על אופניים או קורקינט', group: 'play', event: 'cycled', goal: 200 },
  { id: 'driver', icon: '🚗', title: 'נהגת', hint: 'נהגו 300 מטר', group: 'play', event: 'drove', goal: 300 },
  { id: 'upstairs', icon: '🏢', title: 'למעלה ולמטה', hint: 'עלו במדרגות לקומה אחרת', group: 'play', event: 'climbed-stairs', goal: 1 },
  { id: 'slide', icon: '🛝', title: 'ויייי!', hint: 'התגלשו במגלשה', group: 'play', event: 'slid', goal: 1 },
  { id: 'swing', icon: '🎠', title: 'עד השמיים', hint: 'התנדנדו או הסתובבו במתקן משחק', group: 'play', event: 'swung', goal: 1 },
  { id: 'trampoline', icon: '🤸', title: 'קפיצה לגובה', hint: 'קפצו על טרמפולינה', group: 'play', event: 'bounced', goal: 5 },
  { id: 'pianist', icon: '🎹', title: 'פסנתרנית', hint: 'נגנו 12 תווים בפסנתר', group: 'play', event: 'piano-note', goal: 12 },
  { id: 'pet-friend', icon: '🐶', title: 'חבר על ארבע', hint: 'לטפו חיית מחמד', group: 'play', event: 'pet-petted', goal: 1 },
  { id: 'star-5', icon: '⭐', title: 'ציידת כוכבים', hint: 'אספו 5 כוכבים בסיור', group: 'play', event: 'star-collected', goal: 5 },
  { id: 'star-20', icon: '🌟', title: 'כל הכוכבים', hint: 'אספו 20 כוכבים', group: 'play', event: 'star-collected', goal: 20 },
  { id: 'goal', icon: '⚽', title: 'גוווול!', hint: 'בעטו כדור לתוך שער', group: 'play', event: 'goal-scored', goal: 1 },
  { id: 'good-night', icon: '🌙', title: 'לילה טוב', hint: 'שכבו במיטה ולכו לישון', group: 'play', event: 'slept', goal: 1 },
  { id: 'lights', icon: '💡', title: 'ויהי אור', hint: 'הדליקו או כבו 5 מנורות', group: 'play', event: 'light-switched', goal: 5 },
  { id: 'night-owl', icon: '🦉', title: 'טיול לילי', hint: 'טיילו בשכונה בלילה', group: 'play', event: 'night-walk', goal: 60 },
  { id: 'gamer', icon: '🎮', title: 'שחקנית השכונה', hint: 'שחקו 5 סיבובים במשחקי השכונה', group: 'play', event: 'minigame-played', goal: 5 },
  { id: 'gold-medal', icon: '🥇', title: 'מדליית זהב', hint: 'זכו במדליית זהב באחד ממשחקי השכונה', group: 'play', event: 'minigame-gold', goal: 1 },
  { id: 'photographer', icon: '📸', title: 'צלמת', hint: 'צלמו תמונה של מה שבניתם', group: 'play', event: 'photo-taken', goal: 1 },
];

interface Saved {
  look: CharacterLook;
  counters: Partial<Record<GameEvent, number>>;
  done: string[];
  stars: Record<string, string[]>;
}

const KEY = 'dhb.player';

function load(): Saved {
  const base: Saved = { look: DEFAULT_LOOK, counters: {}, done: [], stars: {} };
  try {
    if (typeof localStorage === 'undefined') return base;
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<Saved>;
    return {
      look: { ...DEFAULT_LOOK, ...(data.look ?? {}) },
      counters: data.counters ?? {},
      done: Array.isArray(data.done) ? data.done : [],
      stars: data.stars ?? {},
    };
  } catch {
    return base;
  }
}

interface ProgressState extends Saved {
  /** the most recently completed challenge, for the toast */
  toast: Challenge | null;
  /** short floating message (e.g. "⭐ 3/24") */
  flash: string;
  setLook(look: CharacterLook): void;
  report(event: GameEvent, amount?: number): void;
  collectStar(projectId: string, starId: string): void;
  resetStars(projectId: string): void;
  dismissToast(): void;
  setFlash(text: string): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist(s: Saved): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ look: s.look, counters: s.counters, done: s.done, stars: s.stars }));
    } catch {
      /* storage unavailable: progress simply is not kept */
    }
  }, 500);
}

export const useProgress = create<ProgressState>((set, get) => ({
  ...load(),
  toast: null,
  flash: '',
  setLook: (look) => {
    set({ look });
    persist(get());
  },
  report: (event, amount = 1) => {
    const s = get();
    const value = (s.counters[event] ?? 0) + amount;
    const counters = { ...s.counters, [event]: value };
    const newly = CHALLENGES.filter((c) => c.event === event && value >= c.goal && !s.done.includes(c.id));
    if (newly.length) set({ counters, done: [...s.done, ...newly.map((c) => c.id)], toast: newly[newly.length - 1] });
    else set({ counters });
    persist(get());
  },
  collectStar: (projectId, starId) => {
    const s = get();
    const have = s.stars[projectId] ?? [];
    if (have.includes(starId)) return;
    set({ stars: { ...s.stars, [projectId]: [...have, starId] } });
    get().report('star-collected');
  },
  resetStars: (projectId) => {
    const s = get();
    set({ stars: { ...s.stars, [projectId]: [] } });
    persist(get());
  },
  dismissToast: () => set({ toast: null }),
  setFlash: (flash) => set({ flash }),
}));

/** Shorthand used all over the runtime. */
export const report = (event: GameEvent, amount = 1): void => useProgress.getState().report(event, amount);

/** How many rooms a project has in total (used to notice "a room was built"). */
export function countRooms(project: Project, roomsOf: (walls: Project['buildings'][number]['levels'][number]['walls']) => number): number {
  let n = 0;
  for (const b of project.buildings) for (const l of b.levels) n += roomsOf(l.walls);
  return n;
}
