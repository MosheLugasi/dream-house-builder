import { getFurniture, resolveColors } from '../catalog';
import { getOpeningDef, OPENINGS } from '../catalog/openings';
import { finishes } from '../materials/finishes';
import { dist } from '../model/geom';
import { getGraph, roomAt, styleOfRoom } from '../model/graph';
import {
  deleteSelection,
  duplicateSelection,
  pruneRoomStyles,
  setRoomStyle,
  updateFurniture,
  updateOpening,
  updateWall,
} from '../store/actions';
import { currentBuilding, currentLevel, useStore } from '../store/store';
import { Icon } from './icons';

const ROOM_NAMES = ['סלון', 'מטבח', 'פינת אוכל', 'חדר שינה', 'חדר ילדים', 'אמבטיה', 'שירותים', 'חדר עבודה', 'מסדרון', 'מרפסת', 'חדר כביסה', 'מחסן'];

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 0.05,
  unit = "מ'",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-input">
        <input
          type="number"
          value={Number(value.toFixed(2))}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
        />
        <em>{unit}</em>
      </span>
    </label>
  );
}

function FinishRow({ label, id }: { label: string; id: string }) {
  const def = finishes.get(id);
  return (
    <div className="finish-row">
      <span>{label}</span>
      <span className="finish-chip">
        <i style={{ background: def.color2d }} />
        {def.name}
      </span>
    </div>
  );
}

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const levelIndex = useStore((s) => s.levelIndex);
  const update = useStore((s) => s.update);
  const building = currentBuilding(project);
  const lvl = currentLevel(project, levelIndex);
  const graph = getGraph(lvl.walls);

  let body: React.ReactNode = null;
  let title = 'הבית';

  if (selection?.kind === 'furniture') {
    const item = lvl.furniture.find((f) => f.id === selection.id);
    const def = item && getFurniture(item.catalogId);
    if (item && def) {
      title = def.name;
      const colors = resolveColors(def, item.colors);
      body = (
        <>
          <p className="note">
            {Math.round(def.size.w * 100)}×{Math.round(def.size.d * 100)}×{Math.round(def.size.h * 100)} ס"מ
          </p>
          {def.colors?.map((slot) => (
            <label key={slot.key} className="field">
              <span>{slot.label}</span>
              <input
                type="color"
                value={colors[slot.key]}
                onChange={(e) => updateFurniture(item.id, { colors: { ...item.colors, [slot.key]: e.target.value } })}
              />
            </label>
          ))}
          {def.colors?.length && item.colors ? (
            <button className="link" onClick={() => updateFurniture(item.id, { colors: undefined })}>
              חזרה לצבעי המקור
            </button>
          ) : null}
          <div className="row">
            <button className="btn" onClick={() => updateFurniture(item.id, { rotation: item.rotation - Math.PI / 4 })}>
              <Icon name="rotate" size={16} /> סיבוב 45°
            </button>
            <button className="btn" onClick={() => updateFurniture(item.id, { rotation: item.rotation + Math.PI / 2 })}>
              סיבוב 90°
            </button>
          </div>
          {def.mount === 'wall' && (
            <NumberField label="גובה מהרצפה" value={item.elevation} max={2.6} onChange={(v) => updateFurniture(item.id, { elevation: v })} />
          )}
          <div className="row">
            <button className="btn" onClick={duplicateSelection}>
              <Icon name="copy" size={16} /> שכפול
            </button>
            <button className="btn danger" onClick={() => deleteSelection()}>
              <Icon name="trash" size={16} /> מחיקה
            </button>
          </div>
        </>
      );
    }
  } else if (selection?.kind === 'wall') {
    const wall = lvl.walls.find((w) => w.id === selection.id);
    if (wall) {
      title = 'קיר';
      body = (
        <>
          <div className="finish-row">
            <span>אורך</span>
            <strong>{dist(wall.a, wall.b).toFixed(2)} מ'</strong>
          </div>
          <label className="field">
            <span>עובי</span>
            <select value={wall.thickness} onChange={(e) => updateWall(wall.id, { thickness: parseFloat(e.target.value) })}>
              {[0.1, 0.12, 0.15, 0.2, 0.25, 0.3].map((t) => (
                <option key={t} value={t}>
                  {Math.round(t * 100)} ס"מ
                </option>
              ))}
            </select>
          </label>
          <p className="note">גררו את העיגולים שבקצוות כדי לשנות אורך וכיוון, או את הקיר עצמו כדי להזיז אותו.</p>
          <button
            className="btn danger"
            onClick={() => {
              deleteSelection();
              pruneRoomStyles();
            }}
          >
            <Icon name="trash" size={16} /> מחיקת הקיר
          </button>
        </>
      );
    }
  } else if (selection?.kind === 'opening') {
    const o = lvl.openings.find((x) => x.id === selection.id);
    if (o) {
      const def = getOpeningDef(o.style, o.type);
      title = def.name;
      body = (
        <>
          <label className="field">
            <span>סוג</span>
            <select value={o.style} onChange={(e) => updateOpening(o.id, { style: e.target.value })}>
              {OPENINGS.filter((d) => d.type === o.type).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <NumberField label="רוחב" value={o.width} min={0.4} max={6} onChange={(v) => updateOpening(o.id, { width: v })} />
          <NumberField label="גובה" value={o.height} min={0.3} max={lvl.height - o.sill} onChange={(v) => updateOpening(o.id, { height: v })} />
          {o.type === 'window' && (
            <NumberField label="גובה אדן" value={o.sill} max={lvl.height - 0.4} onChange={(v) => updateOpening(o.id, { sill: v })} />
          )}
          {o.type === 'door' && (
            <div className="row">
              <button className="btn" onClick={() => updateOpening(o.id, { flipH: !o.flipH })}>
                <Icon name="flip" size={16} /> צד הציר
              </button>
              <button className="btn" onClick={() => updateOpening(o.id, { flipV: !o.flipV })}>
                כיוון פתיחה
              </button>
            </div>
          )}
          <button className="btn danger" onClick={() => deleteSelection()}>
            <Icon name="trash" size={16} /> מחיקה
          </button>
        </>
      );
    }
  } else if (selection?.kind === 'room') {
    const room = roomAt(graph, selection.point);
    if (room) {
      const style = styleOfRoom(graph, room, lvl.roomStyles);
      title = style?.name ?? 'חדר';
      body = (
        <>
          <label className="field">
            <span>שם החדר</span>
            <input
              type="text"
              list="room-names"
              value={style?.name ?? ''}
              placeholder="חדר"
              onChange={(e) => setRoomStyle(selection.point, { name: e.target.value || undefined })}
            />
            <datalist id="room-names">
              {ROOM_NAMES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <div className="finish-row">
            <span>שטח</span>
            <strong>{room.area.toFixed(1)} מ"ר</strong>
          </div>
          <FinishRow label="רצפה" id={style?.floor ?? building.defaultFloor} />
          <FinishRow label="קירות" id={style?.wall ?? building.defaultWall} />
          <p className="note">כדי להחליף חומר: פתחו את "חומרים וצבעים", בחרו ולחצו על החדר.</p>
        </>
      );
    }
  }

  if (!body) {
    const totalArea = graph.rooms.reduce((sum, r) => sum + r.area, 0);
    body = (
      <>
        <div className="finish-row">
          <span>חדרים</span>
          <strong>{graph.rooms.length}</strong>
        </div>
        <div className="finish-row">
          <span>שטח כולל</span>
          <strong>{totalArea.toFixed(1)} מ"ר</strong>
        </div>
        <NumberField
          label="גובה תקרה"
          value={lvl.height}
          min={2.2}
          max={4.5}
          step={0.1}
          onChange={(v) =>
            update((d) => {
              currentLevel(d, levelIndex).height = v;
            })
          }
        />
        <FinishRow label="חיפוי חוץ" id={building.exterior} />
        <p className="note">בחרו קיר, דלת, רהיט או חדר כדי לראות ולשנות את המאפיינים שלהם.</p>
      </>
    );
  }

  return (
    <aside className="inspector">
      <h3>{title}</h3>
      {body}
    </aside>
  );
}
