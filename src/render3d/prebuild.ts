import { getFurniture, resolveColors } from '../catalog';
import { placedSize } from '../catalog/placed';
import { finishes } from '../materials/finishes';
import type { FurnitureItem, Project } from '../model/types';

/** a unit of work */
type Job = () => void;

/**
 * Builds what the 3D view will need while the player is still in the 2D editor, in idle slots: the baked
 * templates of the project's catalog items (the 3D view then only clones them) and the finishes'
 * materials. Opening the 3D view the first time used to build all of it at once – a freeze of several
 * seconds on an ordinary laptop. Each slot does a little; anything not done yet when the view opens is
 * simply built then, as before.
 */
export class Prebuilder {
  private queue: Job[] = [];
  private seen = new Set<string>();
  private handle = 0;
  private project: Project | null = null;
  /** jobs done (diagnostics / tests) */
  done = 0;

  /** Queue the work for a project (only what was not prepared before). */
  plan(project: Project): void {
    if (project === this.project) return;
    this.project = project;
    const finish = (id: string | undefined) => {
      if (!id || this.seen.has(`f:${id}`)) return;
      this.seen.add(`f:${id}`);
      this.queue.push(() => void finishes.material(id));
    };
    const item = (f: FurnitureItem) => {
      const def = getFurniture(f.catalogId);
      // (noBake items are built fresh every time: nothing to cache)
      if (!def || def.noBake) return;
      const size = placedSize(def, f);
      const colors = resolveColors(def, f.colors);
      const key = `i:${f.catalogId}|${JSON.stringify(colors)}|${def.parametric ? `${size.w},${size.d},${size.h}` : ''}`;
      if (this.seen.has(key)) return;
      this.seen.add(key);
      this.queue.push(() => {
        try {
          def.build({ colors, rise: 3, size });
        } catch {
          /* the 3D view reports it when it builds the item */
        }
      });
    };
    finish(project.site.ground);
    for (const a of project.site.areas) finish(a.finish);
    for (const b of project.buildings) {
      finish(b.exterior);
      finish(b.defaultFloor);
      finish(b.defaultWall);
      finish(b.roof.finish);
      for (const lvl of b.levels) {
        for (const s of lvl.roomStyles) {
          finish(s.floor);
          finish(s.wall);
        }
      }
    }
    // the building being edited first, then the neighborhood
    for (const b of project.buildings) for (const lvl of b.levels) lvl.furniture.forEach(item);
    project.site.props.forEach(item);
    this.schedule();
  }

  /** Run jobs for at most `budgetMs` (or until the queue is empty); returns the jobs left. */
  runFor(budgetMs: number): number {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      this.queue.shift()!();
      this.done++;
    }
    return this.queue.length;
  }

  private schedule(): void {
    if (this.handle || !this.queue.length || typeof requestIdleCallback !== 'function') return;
    this.handle = requestIdleCallback((deadline) => {
      this.handle = 0;
      // at least one job per slot; another only while a good part of the slot is left
      do {
        this.queue.shift()!();
        this.done++;
      } while (this.queue.length && deadline.timeRemaining() > 8);
      this.schedule();
    });
  }
}

export const prebuilder = new Prebuilder();

/** Keep preparing the project in the store (a second after it last changed). */
export function startPrebuilding(store: { getState(): { project: Project }; subscribe(fn: (s: { project: Project }, p: { project: Project }) => void): () => void }): void {
  if (typeof requestIdleCallback !== 'function') return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => prebuilder.plan(store.getState().project), 1000);
  };
  store.subscribe((s, p) => {
    if (s.project !== p.project) later();
  });
  later();
  // fetch and parse the 3D engine's code (its own chunk) before the player asks for the 3D view
  requestIdleCallback(() => void import('./Engine').catch(() => undefined));
}
