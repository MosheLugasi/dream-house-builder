import { create } from 'zustand';
import { produce } from 'immer';
import { newId, type Building, type Level, type Project } from '../model/types';
import { emptyProject } from '../model/defaults';
import { sampleProject } from '../model/neighborhood';
import { changedElsewhere, isStored, loadCurrentProject, loadProject, lostOwnSave, saveProject, watchOtherTabs } from '../io/storage';
import { loadQuality, type Quality } from './quality';

export type Mode = 'site' | 'plan' | 'view3d' | 'walk';
/** what is being edited: the whole neighborhood, or the inside of one building */
export type Scope = 'site' | 'building';

export type Tool =
  | { type: 'select' }
  | { type: 'wall' }
  | { type: 'room' }
  | { type: 'opening'; style: string }
  | { type: 'furniture'; catalogId: string }
  | { type: 'paint'; target: 'floor' | 'wall' | 'exterior'; finish: string }
  | { type: 'road' }
  | { type: 'area'; finish: string }
  | { type: 'building'; template: string }
  | { type: 'erase' };

export type Selection =
  | { kind: 'wall'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'furniture'; id: string }
  | { kind: 'room'; point: { x: number; y: number } }
  | { kind: 'prop'; id: string }
  | { kind: 'building'; id: string }
  | { kind: 'area'; id: string };

export interface ViewOptions {
  wallsLow: boolean;
  showRoof: boolean;
  /** rendering preset of the 3D view (a device preference, remembered in localStorage) */
  quality: Quality;
  snap: boolean;
  showDimensions: boolean;
  firstPerson: boolean;
  /** hour of the day, 0…24 */
  timeOfDay: number;
  /** let the clock run (a full day takes a few minutes) */
  autoTime: boolean;
}

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  mode: Mode;
  scope: Scope;
  /** index of the building being edited in plan / building-scope 3D */
  buildingIndex: number;
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
  /** Open a building for editing (plan mode). */
  editBuilding(id: string): void;
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
  scope: 'building',
  buildingIndex: 0,
  tool: { type: 'select' },
  selection: null,
  levelIndex: 0,
  view: { wallsLow: false, showRoof: false, quality: loadQuality(), snap: true, showDimensions: true, firstPerson: false, timeOfDay: 14.5, autoTime: false },
  hint: '',
  wallThickness: 0.2,

  setWallThickness: (wallThickness) => set({ wallThickness }),
  setLevelIndex: (levelIndex) => set({ levelIndex, selection: null }),
  setMode: (mode) => {
    const scope: Scope = mode === 'site' ? 'site' : mode === 'plan' ? 'building' : get().scope;
    const keep = scope === get().scope ? get().selection : null;
    set({ mode, scope, tool: { type: 'select' }, selection: keep });
  },
  editBuilding: (id) => {
    const i = get().project.buildings.findIndex((b) => b.id === id);
    if (i < 0) return;
    set({ buildingIndex: i, levelIndex: 0, mode: 'plan', scope: 'building', tool: { type: 'select' }, selection: null });
  },
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
  loadProject: (project) =>
    set({ project, past: [], future: [], selection: null, levelIndex: 0, buildingIndex: 0, tool: { type: 'select' } }),
}));

// ---- selectors / helpers -------------------------------------------------------------------

export const currentBuilding = (p: Project): Building =>
  p.buildings[Math.min(useStore.getState().buildingIndex, p.buildings.length - 1)];
export const currentLevel = (p: Project, levelIndex: number): Level => {
  const b = currentBuilding(p);
  return b.levels[Math.min(levelIndex, b.levels.length - 1)];
};
/** Mutable draft access inside `update`. */
export const draftLevel = (d: Project): Level => currentLevel(d, useStore.getState().levelIndex);

export function newProject(kind: 'empty' | 'sample'): void {
  useStore.getState().loadProject(kind === 'sample' ? sampleProject() : emptyProject());
}

// ---- autosave and other tabs -----------------------------------------------------------------
//
// Only changes made in this tab are saved (an idle tab never writes over newer work from another
// tab). When another tab saves the project this tab has open, a tab without unsaved changes simply
// shows the newer version; if both tabs changed it, this tab keeps its work as a copy.

let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Save the open project now if this tab changed it. */
export function flushSave(): void {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const { project } = useStore.getState();
  if (isStored(project)) return;
  const r = saveProject(project);
  if (r === 'conflict') keepAsCopy();
  else if (r === 'failed') useStore.getState().setHint('⚠️ לא הצלחנו לשמור בדפדפן (אולי אין מקום). כדאי לגבות לקובץ בכפתור "גיבוי לקובץ".');
}

/** Both this tab and another one changed the project: keep this tab's version under a new id. */
function keepAsCopy(): void {
  const { project, past, future } = useStore.getState();
  const id = newId('prj');
  const name = `${project.name} (עותק)`;
  const fix = (p: Project): Project => ({ ...p, id, name });
  const copy = fix(project);
  useStore.setState({ project: copy, past: past.map(fix), future: future.map(fix) });
  saveProject(copy);
  useStore.getState().setHint(`הפרויקט שונה גם בלשונית אחרת – השינויים שלכם נשמרו בעותק "${name}"`);
}

useStore.subscribe((state, prev) => {
  if (state.project === prev.project || isStored(state.project)) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushSave);
  window.addEventListener('pagehide', flushSave);
  watchOtherTabs((id, _rev, base) => {
    const { project } = useStore.getState();
    // unsaved changes here: they are kept as a copy on the next save
    if (id !== project.id || !isStored(project)) return;
    // both tabs saved at the same moment and this tab's save was written over: keep it as a copy
    if (lostOwnSave(id, base)) return keepAsCopy();
    if (!changedElsewhere(id)) return;
    const fresh = loadProject(id);
    if (!fresh) return;
    const s = useStore.getState();
    const b = Math.min(s.buildingIndex, fresh.buildings.length - 1);
    const levels = fresh.buildings[b].levels.length;
    useStore.setState({
      project: fresh,
      past: [],
      future: [],
      selection: null,
      buildingIndex: b,
      levelIndex: Math.min(s.levelIndex, levels - 1),
    });
  });
}
