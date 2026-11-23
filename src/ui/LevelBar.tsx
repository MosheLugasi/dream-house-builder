import { addLevel, removeLevel } from '../store/actions';
import { currentBuilding, useStore } from '../store/store';
import { Icon } from './icons';

/** Floor switcher for the building being edited. */
export function LevelBar() {
  const project = useStore((s) => s.project);
  const levelIndex = useStore((s) => s.levelIndex);
  const setLevelIndex = useStore((s) => s.setLevelIndex);
  useStore((s) => s.buildingIndex);
  const b = currentBuilding(project);
  const current = Math.min(levelIndex, b.levels.length - 1);
  return (
    <div className="level-bar" aria-label="קומות">
      <button className="level-add" onClick={addLevel} title="הוספת קומה מעל הקומה העליונה">
        <Icon name="plus" size={16} /> קומה
      </button>
      {b.levels
        .map((lvl, i) => ({ lvl, i }))
        .reverse()
        .map(({ lvl, i }) => (
          <button key={lvl.id} className={i === current ? 'active' : ''} onClick={() => setLevelIndex(i)}>
            {lvl.name}
          </button>
        ))}
      {b.levels.length > 1 && (
        <button
          className="level-remove"
          title="מחיקת הקומה הנוכחית"
          onClick={() => {
            if (window.confirm(`למחוק את "${b.levels[current].name}" על כל מה שבה?`)) removeLevel(current);
          }}
        >
          <Icon name="trash" size={15} />
        </button>
      )}
    </div>
  );
}
