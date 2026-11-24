import { create } from 'zustand';
import type { MiniGameHud, MiniGameResult } from './types';
import type { MiniGameId } from './meta';

export interface MiniGameRecord {
  /** best score (highest, or lowest for timed games) of a completed round */
  best: number | null;
  /** best medal so far: 0 none, 1 bronze, 2 silver, 3 gold */
  medal: number;
  plays: number;
}

export interface Popup {
  id: number;
  text: string;
  color?: string;
}

export interface ResultCard extends MiniGameResult {
  id: MiniGameId;
  medal: number;
  record: boolean;
  best: number | null;
}

interface MiniGameState {
  /** the game being played */
  active: MiniGameId | null;
  hud: MiniGameHud;
  popups: Popup[];
  banner: { id: number; text: string } | null;
  countdown: string | null;
  /** distance and screen-space direction to the HUD target (set by the runtime every few frames) */
  nav: { meters: number; angle: number; label?: string } | null;
  result: ResultCard | null;
  menuOpen: boolean;
  /** game shown in the "how to play" card before it starts */
  intro: MiniGameId | null;
  records: Partial<Record<MiniGameId, MiniGameRecord>>;
  set(patch: Partial<Omit<MiniGameState, 'set' | 'setHud' | 'popup' | 'showBanner' | 'record'>>): void;
  setHud(patch: Partial<MiniGameHud>): void;
  popup(text: string, color?: string): void;
  showBanner(text: string, ms?: number): void;
  /** store a finished round; returns whether it is a new record */
  record(id: MiniGameId, score: number, medal: number, lowerIsBetter: boolean, completed: boolean): boolean;
}

const KEY = 'dhb.games';

function loadRecords(): Partial<Record<MiniGameId, MiniGameRecord>> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<MiniGameId, MiniGameRecord>>) : {};
  } catch {
    return {};
  }
}

let popupId = 0;
let bannerTimer: ReturnType<typeof setTimeout> | undefined;

export const useMiniGame = create<MiniGameState>((set, get) => ({
  active: null,
  hud: {},
  popups: [],
  banner: null,
  countdown: null,
  nav: null,
  result: null,
  menuOpen: false,
  intro: null,
  records: loadRecords(),
  set: (patch) => set(patch),
  setHud: (patch) => {
    const hud = { ...get().hud };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete (hud as Record<string, unknown>)[k];
      else (hud as Record<string, unknown>)[k] = v;
    }
    set({ hud });
  },
  popup: (text, color) => {
    const id = ++popupId;
    set({ popups: [...get().popups.slice(-4), { id, text, color }] });
    setTimeout(() => set({ popups: get().popups.filter((p) => p.id !== id) }), 1700);
  },
  showBanner: (text, ms = 1600) => {
    const id = ++popupId;
    set({ banner: { id, text } });
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      if (get().banner?.id === id) set({ banner: null });
    }, ms);
  },
  record: (id, score, medal, lowerIsBetter, completed) => {
    // start from what storage holds now: another tab may have played meanwhile
    const records = { ...get().records, ...loadRecords() };
    const r: MiniGameRecord = { ...(records[id] ?? { best: null, medal: 0, plays: 0 }) };
    r.plays++;
    let isRecord = false;
    if (completed) {
      isRecord = r.best === null || (lowerIsBetter ? score < r.best : score > r.best);
      if (isRecord) r.best = score;
      r.medal = Math.max(r.medal, medal);
    }
    records[id] = r;
    set({ records });
    try {
      localStorage.setItem(KEY, JSON.stringify(records));
    } catch {
      /* storage unavailable */
    }
    return isRecord;
  },
}));

/** "1:05.3" for seconds, "1,250" for points */
export function formatScore(score: number, unit: 'points' | 'seconds'): string {
  if (unit === 'seconds') {
    const m = Math.floor(score / 60);
    const s = score - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  }
  return Math.round(score).toLocaleString('he-IL');
}

/** 0 none, 1 bronze, 2 silver, 3 gold */
export function medalFor(score: number, m: { bronze: number; silver: number; gold: number; lowerIsBetter?: boolean }): number {
  const better = (a: number, b: number) => (m.lowerIsBetter ? a <= b : a >= b);
  return better(score, m.gold) ? 3 : better(score, m.silver) ? 2 : better(score, m.bronze) ? 1 : 0;
}

// records set in another tab show up here too
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) useMiniGame.setState({ records: { ...useMiniGame.getState().records, ...loadRecords() } });
  });
}
