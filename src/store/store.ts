import { create } from 'zustand';
import { produce } from 'immer';
import type { Building, Level, Project } from '../model/types';
import { emptyProject } from '../model/defaults';
import { sampleProject } from '../model/sample';
import { loadCurrentProject, saveProject } from '../io/storage';

export type Mode = 'plan' | 'view3d' | 'walk';

export type Tool =
  | { type: 'select' }
  | { type: 'wall' }
  | { type: 'room' }
  | { type: 'opening'; style: string }
  | { type: 'furniture'; catalogId: string }
  | { type: 'paint'; target: 'floor' | 'wall' | 'exterior'; finish: string }
  | { type: 'erase' };

export type Selection =
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'room'; point: { x: number; y: number } };

export interface ViewOptions {
  wallsLow: boolean;
  showRoof: boolean;
  quality: 'low' | 'high';
  snap: boolean;
  showDimensions: boolean;
  firstPerson: boolean;
  timeOfDay: 'day' | 'sunset' | 'night';
}

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  mode: Mode;
  tool: Tool;
  selection: Selection | null;
  levelIndex: number;
  view: ViewOptions;
  /** thickness used by the wall / room tools */
  wallThickness: number;
  /** short status / hint text shown at the bottom */
  hint: string;

  setMode(mode: Mode): void;
  setTool(tool: Tool): void;
  select(sel: Selection | null): void;
  setView(patch: Partial<ViewOptions>): void;
  setHint(hint: string): void;
  setWallThickness(t: number): void;
  setLevelIndex(i: number): void;
  /** Apply a change to the project. By default it creates an undo step. */
  update(fn: (draft: Project) => void, opts?: { transient?: boolean }): void;
  /** Push the current project on the undo stack (call once before a series of transient updates). */
  checkpoint(): void;
  undo(): void;
  redo(): void;
  loadProject(project: Project): void;
}

const MAX_HISTORY = 100;

function initialProject(): Project {
  return loadCurrentProject() ?? sampleProject();
}

export const useStore = create<State>((set, get) => ({
  project: initialProject(),
  past: [],
  future: [],
  mode: 'plan',
  tool: { type: 'select' },
  selection: null,
  levelIndex: 0,
  view: { wallsLow: false, showRoof: false, quality: 'high', snap: true, showDimensions: true, firstPerson: false, timeOfDay: 'day' },
  hint: '',
  wallThickness: 0.2,

  setWallThickness: (wallThickness) => set({ wallThickness }),
  setLevelIndex: (levelIndex) => set({ levelIndex, selection: null }),
  setMode: (mode) => set({ mode, tool: { type: 'select' } }),
  setTool: (tool) => set({ tool, selection: tool.type === 'select' ? get().selection : null }),
  select: (selection) => set({ selection }),
  setView: (patch) => set({ view: { ...get().view, ...patch } }),
  setHint: (hint) => {
    if (get().hint !== hint) set({ hint });
  },
  update: (fn, opts) => {
    const { project, past } = get();
    const next = produce(project, (d) => {
      fn(d);
      d.updatedAt = Date.now();
    });
    if (next === project) return;
    if (opts?.transient) set({ project: next });
    else set({ project: next, past: [...past, project].slice(-MAX_HISTORY), future: [] });
  },
  checkpoint: () => {
    const { project, past } = get();
    if (past[past.length - 1] === project) return;
    set({ past: [...past, project].slice(-MAX_HISTORY), future: [] });
  },
  undo: () => {
    const { project, past, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], selection: null });
  },
  redo: () => {
    const { project, past, future } = get();
    if (!future.length) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1), selection: null });
  },
  loadProject: (project) => set({ project, past: [], future: [], selection: null, levelIndex: 0, tool: { type: 'select' } }),
}));

// ---- selectors / helpers -------------------------------------------------------------------

export const currentBuilding = (p: Project): Building => p.buildings[0];
export const currentLevel = (p: Project, levelIndex: number): Level => {
  const b = currentBuilding(p);
  return b.levels[Math.min(levelIndex, b.levels.length - 1)];
};
/** Mutable draft access inside `update`. */
export const draftLevel = (d: Project): Level => currentLevel(d, useStore.getState().levelIndex);

export function newProject(kind: 'empty' | 'sample'): void {
  useStore.getState().loadProject(kind === 'sample' ? sampleProject() : emptyProject());
}

// ---- autosave --------------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((state, prev) => {
  if (state.project === prev.project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProject(useStore.getState().project), 400);
});
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => saveProject(useStore.getState().project));
}
