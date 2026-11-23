import { useRef, useState } from 'react';
import { clampSize, getFurniture, isResizable, itemSize, linkedWD, resizeRange, resolveColors } from '../catalog';
import type { FurnitureDef, ItemSize } from '../catalog';
import { fitAlongWall } from '../model/fitWall';
import type { FurnitureItem, Wall } from '../model/types';
import { useStore } from '../store/store';

type Axis = 'w' | 'd' | 'h';
const AXES: Array<{ key: Axis; label: string }> = [
  { key: 'w', label: 'רוחב' },
  { key: 'd', label: 'עומק' },
  { key: 'h', label: 'גובה' },
];

/** Modern palette offered next to every colour slot (one click instead of the colour picker). */
const SWATCHES = ['#f4f2ee', '#d9d4ca', '#9a948a', '#3b3d40', '#1d1e20', '#c8a27a', '#8a5a3b', '#6f7f63', '#2f4858', '#b5523b', '#d8b45a', '#9fb4c7'];

type Patch = Partial<FurnitureItem>;

/**
 * Size, mirror and colours of a placed catalog item. Sliders update live without filling the
 * undo history: one checkpoint when a drag starts, transient updates while it runs.
 */
export function ItemEditor({
  item,
  onChange,
  walls,
}: {
  item: FurnitureItem;
  onChange: (patch: Patch, transient?: boolean) => void;
  /** walls of the level (building items): enables "fit along the wall" */
  walls?: Wall[];
}) {
  const def = getFurniture(item.catalogId);
  const [locked, setLocked] = useState(false);
  const dragging = useRef(false);
  // the item as last changed here (updates are applied before React re-renders with them)
  const latest = useRef(item);
  latest.current = item;
  if (!def) return null;
  const size = itemSize(def, item);
  const range = resizeRange(def);
  const resizable = isResizable(def);

  const begin = () => {
    if (dragging.current) return;
    dragging.current = true;
    useStore.getState().checkpoint();
  };
  // parametric items are rebuilt for every size: while a slider moves, rebuild at most ~8 times a second
  const pending = useRef<{ next: ItemSize; timer: number | null }>({ next: size, timer: null });
  const end = () => {
    dragging.current = false;
    const p = pending.current;
    if (p.timer !== null) {
      window.clearTimeout(p.timer);
      p.timer = null;
      apply(p.next, true);
    }
  };
  const live = (next: ItemSize) => {
    if (!def.parametric) return apply(next, dragging.current);
    const p = pending.current;
    p.next = next;
    if (p.timer !== null) return;
    p.timer = window.setTimeout(() => {
      p.timer = null;
      apply(p.next, dragging.current);
    }, 120);
  };

  /** new size with one axis changed (and the others following when proportions are locked) */
  const withAxis = (axis: Axis, value: number): ItemSize => {
    // round things have one diameter: width and depth move together
    if (!locked && linkedWD(def) && axis !== 'h') return clampSize(def, { ...size, w: value, d: value });
    if (!locked) return clampSize(def, { ...size, [axis]: value });
    const k = value / size[axis];
    const next = { w: size.w, d: size.d, h: size.h };
    for (const a of ['w', 'd', 'h'] as Axis[]) if (range[a][0] < range[a][1]) next[a] = size[a] * k;
    return clampSize(def, next);
  };
  const apply = (next: ItemSize, transient = false, extra: Patch = {}) => {
    const same = next.w === def.size.w && next.d === def.size.d && next.h === def.size.h;
    // most things stand with their back against a wall: a deeper item grows forwards, not into the wall
    const cur = itemSize(def, latest.current);
    const grow = (next.d - cur.d) / 2;
    const r = latest.current.rotation;
    const moved = Math.abs(grow) > 1e-6 ? { x: latest.current.x - Math.sin(r) * grow, y: latest.current.y + Math.cos(r) * grow } : {};
    latest.current = { ...latest.current, ...moved, ...extra, size: same ? undefined : next };
    onChange({ size: same ? undefined : next, ...moved, ...extra }, transient);
  };
  const scaleAll = (k: number) => {
    const next = { w: size.w, d: size.d, h: size.h };
    for (const a of ['w', 'd', 'h'] as Axis[]) if (range[a][0] < range[a][1]) next[a] = size[a] * k;
    apply(clampSize(def, next));
  };

  return (
    <div className="item-editor">
      <h4 className="ie-title">מידות</h4>
      {AXES.filter(({ key }) => !(linkedWD(def) && key === 'd')).map(({ key, label: base }) => {
        const label = linkedWD(def) && key === 'w' ? 'קוטר' : base;
        const [lo, hi] = range[key];
        const cm = Math.round(size[key] * 100);
        if (!resizable || lo >= hi) {
          return (
            <div key={key} className="finish-row">
              <span>{label}</span>
              <strong>{cm} ס"מ</strong>
            </div>
          );
        }
        return (
          <div key={key} className="ie-axis">
            <div className="ie-axis-head">
              <span>{label}</span>
              <span className="field-input">
                <input
                  type="number"
                  value={cm}
                  min={Math.ceil(lo * 100)}
                  max={Math.floor(hi * 100)}
                  step={1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v) && v > 0) apply(withAxis(key, v / 100));
                  }}
                />
                <em>ס"מ</em>
              </span>
            </div>
            <input
              className="ie-slider"
              type="range"
              dir="ltr"
              min={lo}
              max={hi}
              step={def.parametric ? 0.05 : 0.01}
              value={size[key]}
              aria-label={label}
              onPointerDown={begin}
              onPointerUp={end}
              onKeyDown={begin}
              onKeyUp={end}
              onChange={(e) => live(withAxis(key, parseFloat(e.target.value)))}
            />
          </div>
        );
      })}
      {resizable && (
        <>
          <label className="ie-check">
            <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
            שמירה על פרופורציות
          </label>
          <div className="row ie-row">
            <button className="btn" onClick={() => scaleAll(0.9)} title="קטן ב-10%">
              − קטן יותר
            </button>
            <button className="btn" onClick={() => scaleAll(1.1)} title="גדול ב-10%">
              + גדול יותר
            </button>
          </div>
          {walls && range.w[0] < range.w[1] && def.mount !== 'ceiling' && (() => {
            const fit = fitAlongWall(walls, item, size);
            if (!fit || Math.abs(clampSize(def, { ...size, w: fit.w }).w - size.w) < 0.005) return null;
            return (
              <button
                className="btn block"
                title="מותחים את הפריט לכל אורך הקיר שמאחוריו"
                onClick={() => {
                  apply(clampSize(def, { ...size, w: fit.w }), false, { x: fit.x, y: fit.y });
                }}
              >
                ↔ התאמה לאורך הקיר ({Math.round(clampSize(def, { ...size, w: fit.w }).w * 100)} ס"מ)
              </button>
            );
          })()}
          {item.size && (
            <button className="link" onClick={() => apply(def.size)}>
              חזרה לגודל המקורי
            </button>
          )}
        </>
      )}
      <label className="ie-check">
        <input type="checkbox" checked={!!item.mirror} onChange={(e) => onChange({ mirror: e.target.checked || undefined })} />
        היפוך מראה (ימין ↔ שמאל)
      </label>
      {def.colors?.length ? <ColorEditor def={def} item={item} onChange={onChange} /> : null}
    </div>
  );
}

function ColorEditor({ def, item, onChange }: { def: FurnitureDef; item: FurnitureItem; onChange: (patch: Patch, transient?: boolean) => void }) {
  const colors = resolveColors(def, item.colors);
  const picking = useRef(false);
  const set = (key: string, value: string, transient = false) => onChange({ colors: { ...item.colors, [key]: value } }, transient);
  return (
    <>
      <h4 className="ie-title">צבעים</h4>
      {def.colors!.map((slot) => (
        <div key={slot.key} className="ie-color">
          <label className="field">
            <span>{slot.label}</span>
            <input
              type="color"
              value={colors[slot.key]}
              onFocus={() => {
                // the native picker fires many changes: one undo step for the whole pick
                if (!picking.current) useStore.getState().checkpoint();
                picking.current = true;
              }}
              onBlur={() => (picking.current = false)}
              onChange={(e) => set(slot.key, e.target.value, picking.current)}
            />
          </label>
          <div className="ie-swatches" role="group" aria-label={slot.label}>
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={`ie-swatch ${colors[slot.key].toLowerCase() === c ? 'on' : ''}`}
                style={{ background: c }}
                title={c}
                aria-label={`${slot.label} ${c}`}
                onClick={() => set(slot.key, c)}
              />
            ))}
          </div>
        </div>
      ))}
      {item.colors && (
        <button className="link" onClick={() => onChange({ colors: undefined })}>
          חזרה לצבעי המקור
        </button>
      )}
    </>
  );
}
