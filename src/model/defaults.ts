import { DEFAULT_LEVEL_HEIGHT, newId, type Building, type Level, type Project } from './types';

export function emptyLevel(name: string): Level {
  return { id: newId('lvl'), name, height: DEFAULT_LEVEL_HEIGHT, walls: [], openings: [], furniture: [], roomStyles: [] };
}

export function emptyBuilding(): Building {
  return {
    id: newId('bld'),
    name: 'הבית שלי',
    exterior: 'stucco-white',
    defaultFloor: 'oak-planks',
    defaultWall: 'paint:#f4f1ea',
    roof: { type: 'flat', finish: 'roof-gravel' },
    levels: [emptyLevel('קומת קרקע')],
  };
}

export function emptyProject(name = 'פרויקט חדש'): Project {
  const now = Date.now();
  return {
    format: 'dream-house-builder',
    version: 1,
    id: newId('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    site: { ground: 'grass', size: 60 },
    buildings: [emptyBuilding()],
  };
}
