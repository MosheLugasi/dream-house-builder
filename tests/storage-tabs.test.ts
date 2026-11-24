import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../src/model/types';

/** A minimal Web Storage shared by the "tabs" of one browser. */
class MemoryStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

type StorageModule = typeof import('../src/io/storage');

/** A fresh copy of the storage module = one browser tab (its own memory, the shared localStorage). */
async function openTab(): Promise<StorageModule> {
  vi.resetModules();
  vi.stubGlobal('sessionStorage', new MemoryStorage());
  return import('../src/io/storage');
}

async function sample(): Promise<Project> {
  const { sampleProject } = await import('../src/model/neighborhood');
  return sampleProject();
}

describe('saving with several tabs open', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses to overwrite a newer save from another tab, and lets a tab that saw it save', async () => {
    const p = await sample();
    const a = await openTab();
    expect(a.saveProject(p)).toBe('saved');

    const b = await openTab();
    const inB = b.loadProject(p.id)!;
    expect(inB.name).toBe(p.name);
    expect(b.isStored(inB)).toBe(true);

    // tab B edits and saves
    expect(b.saveProject({ ...inB, name: 'B', updatedAt: Date.now() })).toBe('saved');

    // tab A still holds the old version: its save is refused instead of erasing B's work
    expect(a.changedElsewhere(p.id)).toBe(true);
    expect(a.saveProject({ ...p, name: 'A' })).toBe('conflict');
    expect(a.loadProject(p.id)!.name).toBe('B');

    // after loading the newer version, tab A can save again
    expect(a.changedElsewhere(p.id)).toBe(false);
    expect(a.saveProject({ ...p, name: 'A2' })).toBe('saved');
    expect(b.saveProject({ ...inB, name: 'B2' })).toBe('conflict');
  });

  it('notices when its own save was written over by a tab that saved at the same moment', async () => {
    const p = await sample();
    const a = await openTab();
    a.saveProject(p);
    const b = await openTab();
    b.loadProject(p.id);
    // A saves; B saves "at the same moment" without having seen A's save (forced, as a stale cache would)
    expect(a.saveProject({ ...p, name: 'A' })).toBe('saved');
    expect(b.saveProject({ ...p, name: 'B' }, { force: true })).toBe('saved');
    const raw = localStorage.getItem(`dhb.project.${p.id}`)!;
    const base = /"base":"([^"]*)"/.exec(raw)![1];
    expect(a.lostOwnSave(p.id, base)).toBe(true);
    expect(b.lostOwnSave(p.id, base)).toBe(false);
    // the revision tags never leak into the project itself
    const back = a.loadProject(p.id)! as unknown as Record<string, unknown>;
    expect(back.rev).toBeUndefined();
    expect(back.base).toBeUndefined();
    expect(back.name).toBe('B');
    // a stale index entry (written last by the losing tab) is repaired from the data
    const index = JSON.parse(localStorage.getItem('dhb.index')!) as Array<{ id: string; name: string }>;
    Object.assign(index.find((m) => m.id === p.id)!, { name: 'A', rev: 'stale' });
    localStorage.setItem('dhb.index', JSON.stringify(index));
    expect(a.listProjects().find((m) => m.id === p.id)!.name).toBe('B');
  });

  it('keeps different projects in different tabs apart', async () => {
    const p1 = await sample();
    const p2 = { ...(await sample()), id: 'prj-other', name: 'אחר' };
    const a = await openTab();
    const b = await openTab();
    expect(a.saveProject(p1)).toBe('saved');
    expect(b.saveProject(p2)).toBe('saved');
    expect(a.saveProject({ ...p1, name: 'x' })).toBe('saved');
    expect(b.saveProject({ ...p2, name: 'y' })).toBe('saved');
    expect(a.listProjects().map((m) => m.name).sort()).toEqual(['x', 'y']);
  });

  it('reopens the project this tab had open after a reload', async () => {
    const p1 = await sample();
    const p2 = { ...(await sample()), id: 'prj-second', name: 'שני' };
    vi.resetModules();
    const tabA = new MemoryStorage();
    vi.stubGlobal('sessionStorage', tabA);
    const a = await import('../src/io/storage');
    a.saveProject(p1);
    const b = await openTab(); // another tab saves later: it becomes the "last saved" project
    b.saveProject(p2);
    // tab A reloads (same session storage)
    vi.resetModules();
    vi.stubGlobal('sessionStorage', tabA);
    const a2 = await import('../src/io/storage');
    expect(a2.loadCurrentProject()!.id).toBe(p1.id);
    // a brand new tab opens the last saved one
    const c = await openTab();
    expect(c.loadCurrentProject()!.id).toBe(p2.id);
  });
});

describe('player progress from two tabs', () => {
  it('unites stars and challenges and keeps the larger counters', async () => {
    const { mergeSaved } = await import('../src/game/progress');
    const { DEFAULT_LOOK } = await import('../src/render3d/characterTypes');
    const mine = { look: DEFAULT_LOOK, counters: { walked: 50, drove: 10 }, done: ['a'], stars: { p: ['s1', 's2'] } };
    const theirs = { look: DEFAULT_LOOK, counters: { walked: 80 }, done: ['b'], stars: { p: ['s2', 's3'], q: ['t'] } };
    const m = mergeSaved(mine, theirs);
    expect(m.counters).toEqual({ walked: 80, drove: 10 });
    expect(m.done.sort()).toEqual(['a', 'b']);
    expect(m.stars.p.sort()).toEqual(['s1', 's2', 's3']);
    expect(m.stars.q).toEqual(['t']);
  });
});
