import type { FurnitureItem, Project } from '../model/types';

/**
 * Local persistence (localStorage) + backup files.
 * Layout: `dhb.index` = ProjectMeta[], `dhb.project.<id>` = Project JSON, `dhb.current` = id.
 * A real database can later replace this module without touching the rest of the app.
 */
export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

const INDEX_KEY = 'dhb.index';
const CURRENT_KEY = 'dhb.current';
const projectKey = (id: string) => `dhb.project.${id}`;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function listProjects(): ProjectMeta[] {
  const s = storage();
  if (!s) return [];
  try {
    const list = JSON.parse(s.getItem(INDEX_KEY) ?? '[]') as ProjectMeta[];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveProject(project: Project): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(projectKey(project.id), JSON.stringify(project));
    const index = listProjects().filter((m) => m.id !== project.id);
    index.push({ id: project.id, name: project.name, updatedAt: project.updatedAt });
    s.setItem(INDEX_KEY, JSON.stringify(index));
    s.setItem(CURRENT_KEY, project.id);
    return true;
  } catch (err) {
    console.warn('שמירה מקומית נכשלה', err);
    return false;
  }
}

export function loadProject(id: string): Project | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(projectKey(id));
    return raw ? parseProject(raw) : null;
  } catch {
    return null;
  }
}

export function loadCurrentProject(): Project | null {
  const s = storage();
  if (!s) return null;
  const id = s.getItem(CURRENT_KEY);
  return id ? loadProject(id) : null;
}

export function deleteProject(id: string): void {
  const s = storage();
  if (!s) return;
  s.removeItem(projectKey(id));
  s.setItem(INDEX_KEY, JSON.stringify(listProjects().filter((m) => m.id !== id)));
  if (s.getItem(CURRENT_KEY) === id) s.removeItem(CURRENT_KEY);
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
