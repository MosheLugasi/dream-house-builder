import { create } from 'zustand';

/** UI state of walk mode (not part of the project / undo history). */
export interface WalkChoice {
  id: string;
  label: string;
  icon: string;
}

export type Instrument = 'piano' | 'guitar' | 'drums' | null;

export interface Toast {
  id: number;
  text: string;
}

interface WalkState {
  choices: WalkChoice[];
  instrument: Instrument;
  toasts: Toast[];
  score: number;
  /** 0..1 black overlay (sleeping) */
  fade: number;
  flash: number;
  muted: boolean;
  /** last piano/drum key pressed (for highlighting) */
  pressed: string | null;
  setChoices(c: WalkChoice[]): void;
  toast(text: string): void;
  addScore(n: number): void;
  set(patch: Partial<Pick<WalkState, 'instrument' | 'fade' | 'flash' | 'muted' | 'pressed' | 'score'>>): void;
}

let toastId = 0;

export const useWalk = create<WalkState>((set, get) => ({
  choices: [],
  instrument: null,
  toasts: [],
  score: 0,
  fade: 0,
  flash: 0,
  muted: false,
  pressed: null,
  setChoices: (choices) => {
    const cur = get().choices;
    if (cur.length === choices.length && cur.every((c, i) => c.id === choices[i].id && c.label === choices[i].label)) return;
    set({ choices });
  },
  toast: (text) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-3), { id, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2600);
  },
  addScore: (n) => set({ score: get().score + n }),
  set: (patch) => set(patch),
}));
