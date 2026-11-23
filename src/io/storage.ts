import type { Project } from '../model/types';

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
export function parseProject(raw: string): Project {
  const data = JSON.parse(raw) as Partial<Project>;
  if (!data || data.format !== 'dream-house-builder' || !Array.isArray(data.buildings) || !data.buildings.length) {
    throw new Error('זה לא קובץ של "בונים חלום"');
  }
  if (data.version !== 1) throw new Error('גרסת קובץ לא נתמכת');
  for (const b of data.buildings) {
    if (!Array.isArray(b.levels) || !b.levels.length) throw new Error('קובץ פגום: חסרות קומות');
    for (const l of b.levels) {
      l.walls ??= [];
      l.openings ??= [];
      l.furniture ??= [];
      l.roomStyles ??= [];
    }
  }
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
