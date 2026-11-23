import { describe, expect, it } from 'vitest';
import { parseProject } from '../src/io/storage';
import { emptyProject } from '../src/model/defaults';
import { sampleProject } from '../src/model/sample';
import { buildGraph, roomAt, styleOfRoom } from '../src/model/graph';

describe('project files', () => {
  it('round-trips a project through JSON', () => {
    const p = sampleProject();
    const back = parseProject(JSON.stringify(p));
    expect(back).toEqual(p);
  });

  it('rejects foreign or broken files', () => {
    expect(() => parseProject('{"hello":1}')).toThrow();
    expect(() => parseProject('not json')).toThrow();
    const p = emptyProject();
    expect(() => parseProject(JSON.stringify({ ...p, version: 99 }))).toThrow();
    expect(() => parseProject(JSON.stringify({ ...p, buildings: [] }))).toThrow();
  });

  it('fills in missing arrays of older/partial files', () => {
    const p = emptyProject() as unknown as { buildings: { levels: Record<string, unknown>[] }[] };
    delete p.buildings[0].levels[0].furniture;
    const back = parseProject(JSON.stringify(p));
    expect(back.buildings[0].levels[0].furniture).toEqual([]);
  });
});

describe('sample house', () => {
  const lvl = sampleProject().buildings[0].levels[0];
  const graph = buildGraph(lvl.walls);

  it('has five rooms, each with a named style', () => {
    expect(graph.rooms).toHaveLength(5);
    for (const room of graph.rooms) expect(styleOfRoom(graph, room, lvl.roomStyles)?.name).toBeTruthy();
  });

  it('keeps every opening inside its wall', () => {
    for (const o of lvl.openings) {
      const w = lvl.walls.find((x) => x.id === o.wallId)!;
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      expect(o.offset - o.width / 2).toBeGreaterThan(0);
      expect(o.offset + o.width / 2).toBeLessThan(L);
    }
  });

  it('places all furniture inside a room or outdoors, never inside a wall', () => {
    for (const f of lvl.furniture) {
      for (const w of lvl.walls) {
        const dx = w.b.x - w.a.x;
        const dy = w.b.y - w.a.y;
        const t = Math.max(0, Math.min(1, ((f.x - w.a.x) * dx + (f.y - w.a.y) * dy) / (dx * dx + dy * dy)));
        const d = Math.hypot(f.x - (w.a.x + dx * t), f.y - (w.a.y + dy * t));
        expect(d, `${f.catalogId} at ${f.x},${f.y}`).toBeGreaterThan(w.thickness / 2 - 0.001);
      }
      void roomAt(graph, { x: f.x, y: f.y });
    }
  });
});
