import type { FurnitureItem, Project } from '../model/types';

/**
 * Local persistence (localStorage) + backup files.
 * Layout: `dhb.index` = ProjectMeta[], `dhb.project.<id>` = Project JSON (+ `rev` / `base` revision tags),
 * `dhb.current` = last saved id (per tab: sessionStorage `dhb.current`).
 * A real database can later replace this module without touching the rest of the app.
 */
export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  /** changes with every save (who saved + when): lets a tab notice that another tab saved the same project */
  rev?: string;
}

/**
 * Several tabs (or windows) of the same browser share one localStorage. Each tab remembers which
 * revision of a project it last loaded or saved; a save over a revision written meanwhile by another
 * tab is refused (`conflict`) so that nothing is silently overwritten – the caller keeps the work as
 * a copy. Different computers / browsers never share anything (no server).
 */
export type SaveResult = 'saved' | 'conflict' | 'failed';

const INDEX_KEY = 'dhb.index';
const CURRENT_KEY = 'dhb.current';
const projectKey = (id: string) => `dhb.project.${id}`;
const TAB = Math.random().toString(36).slice(2, 10);
let revCounter = 0;
/** project id → the revision this tab last loaded or wrote */
const knownRev = new Map<string, string | undefined>();
/** project objects whose content is exactly what storage holds (no need to save them again) */
const stored = new WeakSet<object>();

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
/** per-tab storage: which project this tab has open survives a reload of the tab */
function tabStorage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function readIndex(s: Storage): ProjectMeta[] {
  try {
    const list = JSON.parse(s.getItem(INDEX_KEY) ?? '[]') as ProjectMeta[];
    return Array.isArray(list) ? list.filter((m) => m && typeof m.id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The stored project JSON ends with `"rev":"…","base":"…"}`: the revision written and the one the
 * writer had seen. Both live in the same value as the data, so they can never disagree with it.
 * (Inside names and other strings quotes are escaped, so the unescaped `"rev":"` is only ever the key.)
 */
function revOf(raw: string | null): { rev?: string; base?: string } {
  if (!raw) return {};
  const i = raw.lastIndexOf('"rev":"');
  if (i < 0) return {};
  const rev = raw.slice(i + 7, raw.indexOf('"', i + 7));
  const j = raw.indexOf('"base":"', i);
  const base = j < 0 ? undefined : raw.slice(j + 8, raw.indexOf('"', j + 8));
  return { rev, base };
}

export function listProjects(): ProjectMeta[] {
  const s = storage();
  if (!s) return [];
  // the index is written after the data: when two tabs saved at once it may describe the other
  // tab's version. The data is the truth – repair the entries that disagree with it.
  let repaired = false;
  const list: ProjectMeta[] = [];
  for (const m of readIndex(s)) {
    const raw = s.getItem(projectKey(m.id));
    if (!raw) {
      repaired = true;
      continue;
    }
    const rev = revOf(raw).rev;
    if (rev !== undefined && rev !== m.rev) {
      try {
        const p = JSON.parse(raw) as Project;
        list.push({ id: m.id, name: p.name, updatedAt: p.updatedAt, rev });
        repaired = true;
        continue;
      } catch {
        /* keep the entry as it is */
      }
    }
    list.push(m);
  }
  if (repaired) {
    try {
      s.setItem(INDEX_KEY, JSON.stringify(list));
    } catch {
      /* listing still works */
    }
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The revision of a project as storage has it now (undefined: never saved, or saved by an old version). */
export function storedRev(id: string): string | undefined {
  return revOf(storage()?.getItem(projectKey(id)) ?? null).rev;
}

/** True when this exact project object was loaded from or written to storage by this tab. */
export function isStored(project: Project): boolean {
  return stored.has(project);
}

/** True when another tab saved this project after this tab last loaded / saved it. */
export function changedElsewhere(id: string): boolean {
  if (!knownRev.has(id)) return false;
  const now = storedRev(id);
  return now !== undefined && now !== knownRev.get(id);
}

/**
 * Another tab wrote revision `base`→`rev` of a project: was this tab's own last save of it written
 * over without being seen (two tabs saved at the same moment)?
 */
export function lostOwnSave(id: string, base: string | undefined): boolean {
  const mine = knownRev.get(id);
  return !!mine && mine.startsWith(`${TAB}.`) && base !== mine && storedRev(id) !== mine;
}

function remember(project: Project, rev: string | undefined): void {
  knownRev.set(project.id, rev);
  stored.add(project);
  tabStorage()?.setItem(CURRENT_KEY, project.id);
}

/**
 * Save a project. Refuses (`conflict`) when another tab saved the same project since this tab last
 * loaded or saved it, unless `force` is set.
 */
export function saveProject(project: Project, opts: { force?: boolean } = {}): SaveResult {
  const s = storage();
  if (!s) return 'failed';
  try {
    if (!opts.force && changedElsewhere(project.id)) return 'conflict';
    const rev = `${TAB}.${++revCounter}.${Date.now().toString(36)}`;
    const base = knownRev.get(project.id) ?? '';
    // one value holds the data and its revision; the index only lists the projects
    s.setItem(projectKey(project.id), JSON.stringify({ ...project, rev, base }));
    const index = readIndex(s).filter((m) => m.id !== project.id);
    index.push({ id: project.id, name: project.name, updatedAt: project.updatedAt, rev });
    s.setItem(INDEX_KEY, JSON.stringify(index));
    s.setItem(CURRENT_KEY, project.id);
    remember(project, rev);
    return 'saved';
  } catch (err) {
    console.warn('שמירה מקומית נכשלה', err);
    return 'failed';
  }
}

export function loadProject(id: string): Project | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(projectKey(id));
    if (!raw) return null;
    const p = parseProject(raw) as Project & { rev?: string; base?: string };
    delete p.rev;
    delete p.base;
    remember(p, revOf(raw).rev);
    return p;
  } catch {
    return null;
  }
}

/** The project this tab had open (after a reload), else the one saved last in any tab. */
export function loadCurrentProject(): Project | null {
  const s = storage();
  if (!s) return null;
  const own = tabStorage()?.getItem(CURRENT_KEY);
  const mine = own ? loadProject(own) : null;
  if (mine) return mine;
  const id = s.getItem(CURRENT_KEY);
  return id ? loadProject(id) : null;
}

export function deleteProject(id: string): void {
  const s = storage();
  if (!s) return;
  s.removeItem(projectKey(id));
  s.setItem(INDEX_KEY, JSON.stringify(readIndex(s).filter((m) => m.id !== id)));
  if (s.getItem(CURRENT_KEY) === id) s.removeItem(CURRENT_KEY);
  knownRev.delete(id);
}

/**
 * Call `onChange` whenever another tab saves a project (the browser only reports writes made by
 * other tabs), with the revision written and the one that tab had seen. Returns an unsubscribe function.
 */
export function watchOtherTabs(onChange: (id: string, rev: string | undefined, base: string | undefined) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const prefix = projectKey('');
  const handler = (e: StorageEvent) => {
    if (!e.key?.startsWith(prefix) || !e.newValue || e.storageArea !== storage()) return;
    const { rev, base } = revOf(e.newValue);
    onChange(e.key.slice(prefix.length), rev, base);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/** Validates and normalizes project JSON (from storage or a backup file). Throws on invalid input. */
/** Optional per-item size / mirror (added within v2): drop anything that is not a sane value. */
function cleanItem(f: FurnitureItem): void {
  const sz = f.size as unknown;
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0.005 && v < 100;
  if (sz !== undefined) {
    const o = sz as Record<string, unknown> | null;
    if (!o || typeof o !== 'object' || !ok(o.w) || !ok(o.d) || !ok(o.h)) delete f.size;
    else f.size = { w: o.w as number, d: o.d as number, h: o.h as number };
  }
  if (f.mirror !== undefined && typeof f.mirror !== 'boolean') delete f.mirror;
}

export function parseProject(raw: string): Project {
  const data = JSON.parse(raw) as Partial<Project>;
  if (!data || data.format !== 'dream-house-builder' || !Array.isArray(data.buildings) || !data.buildings.length) {
    throw new Error('זה לא קובץ של "בונים חלום"');
  }
  const version = (data as { version?: number }).version;
  if (version !== 1 && version !== 2) throw new Error('גרסת קובץ לא נתמכת');
  // v1 -> v2: buildings gained a position, the site gained roads / areas / props
  const site = (data.site ?? {}) as Partial<Project['site']>;
  site.ground ??= 'grass';
  site.size = Math.max(site.size ?? 0, 150);
  site.roads ??= [];
  site.areas ??= [];
  site.props ??= [];
  site.props.forEach(cleanItem);
  data.site = site as Project['site'];
  for (const b of data.buildings) {
    if (!Array.isArray(b.levels) || !b.levels.length) throw new Error('קובץ פגום: חסרות קומות');
    b.x ??= 0;
    b.y ??= 0;
    b.rotation ??= 0;
    b.roof ??= { type: 'flat', finish: 'roof-gravel' };
    b.roof.pitch ??= 30;
    b.roof.overhang ??= 0.45;
    for (const l of b.levels) {
      l.walls ??= [];
      l.openings ??= [];
      l.furniture ??= [];
      l.furniture.forEach(cleanItem);
      l.roomStyles ??= [];
    }
  }
  data.version = 2;
  return data as Project;
}

export function exportProjectFile(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = project.name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project';
  a.href = url;
  a.download = `${safeName}.dreamhouse.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importProjectFile(file: File): Promise<Project> {
  return file.text().then(parseProject);
}
