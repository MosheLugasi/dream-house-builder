import { useEffect, useRef, useState } from 'react';
import type { Engine } from '../render3d/Engine';
import { useStore } from '../store/store';
import { saveQuality, type Quality } from '../store/quality';
import { Icon } from './icons';
import { TimeOfDayChips, WalkHUD } from './WalkHUD';

const clock = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;

/** Time of day: slider, clock and a "let time run" switch. */
function TimeControl() {
  const time = useStore((s) => s.view.timeOfDay);
  const auto = useStore((s) => s.view.autoTime);
  const setView = useStore((s) => s.setView);
  const icon = time >= 6 && time < 18.5 ? '☀' : '☾';
  return (
    <div className="time-control" title="שעה ביום">
      <span className="time-icon">{icon}</span>
      <input
        type="range"
        min={0}
        max={24}
        step={0.25}
        value={time}
        aria-label="שעה ביום"
        onChange={(e) => setView({ timeOfDay: parseFloat(e.target.value) })}
      />
      <span className="time-label">{clock(time)}</span>
      <button className={`time-auto ${auto ? 'on' : ''}`} onClick={() => setView({ autoTime: !auto })} title="הזמן רץ מעצמו">
        {auto ? '❚❚' : '▶'}
      </button>
    </div>
  );
}

const QUALITY_CHOICES: { id: Quality; label: string; title: string }[] = [
  { id: 'low', label: 'רגיל', title: 'מהיר: בלי אפקטים (למחשבים חלשים)' },
  { id: 'high', label: 'גבוה', title: 'צללים, הצללת סביבה, אור מהחלונות' },
  { id: 'ultra', label: 'אולטרה', title: 'הכי מציאותי: צללים חדים, דשא, החלקת קצוות כשהמצלמה עומדת (דורש כרטיס מסך חזק)' },
];

/** Rendering quality: רגיל / גבוה / אולטרה (remembered on this device). */
function QualityChips() {
  const quality = useStore((s) => s.view.quality);
  const setView = useStore((s) => s.setView);
  return (
    <div className="chip-group" role="group" aria-label="איכות תצוגה">
      {QUALITY_CHOICES.map((q) => (
        <button
          key={q.id}
          className={`chip ${quality === q.id ? 'on' : ''}`}
          title={q.title}
          aria-pressed={quality === q.id}
          onClick={() => {
            saveQuality(q.id);
            setView({ quality: q.id });
          }}
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}

export function View3D({ active, onAvatar }: { active: boolean; onAvatar: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mode = useStore((s) => s.mode);
  const view = useStore((s) => s.view);
  const hint = useStore((s) => s.hint);
  const [engine, setEngine] = useState<Engine | null>(null);
  const setView = useStore((s) => s.setView);
  const scope = useStore((s) => s.scope);

  // create the engine the first time the 3D view is shown
  useEffect(() => {
    if (!active || engineRef.current || error) return;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    import('../render3d/Engine')
      .then(({ Engine }) => {
        if (disposed || !hostRef.current) return;
        const engine = new Engine(hostRef.current);
        engineRef.current = engine;
        setEngine(engine);
        (window as unknown as { __engine?: Engine }).__engine = engine;
        ro = new ResizeObserver(([entry]) => engine.resize(entry.contentRect.width, entry.contentRect.height));
        ro.observe(hostRef.current);
        engine.start();
      })
      .catch((err) => {
        console.error(err);
        setError('לא הצלחנו להפעיל תצוגת תלת־ממד בדפדפן הזה.');
      });
    return () => {
      disposed = true;
      ro?.disconnect();
    };
  }, [active, error]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (active) engine.start();
    else engine.stop();
  }, [active]);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    [],
  );

  return (
    <div className="viewport" style={{ display: active ? 'block' : 'none' }}>
      <div ref={hostRef} className="three-host" />
      {error && <div className="viewport-error">{error}</div>}
      {!error && <TimeControl />}
      {mode === 'view3d' && (
        <div className="view-controls">
          <button className="chip" onClick={() => engineRef.current?.frameAll()} title="מרכוז המבט">
            <Icon name="fit" size={16} />
          </button>
          {scope === 'building' && (
            <>
              <label className={`chip toggle ${view.wallsLow ? 'on' : ''}`}>
                <input type="checkbox" checked={view.wallsLow} onChange={(e) => setView({ wallsLow: e.target.checked })} />
                קירות נמוכים
              </label>
              <label className={`chip toggle ${view.showRoof ? 'on' : ''}`}>
                <input type="checkbox" checked={view.showRoof} onChange={(e) => setView({ showRoof: e.target.checked })} />
                כל הבניין עם הגג
              </label>
            </>
          )}
          <TimeOfDayChips />
          <QualityChips />
        </div>
      )}
      {mode === 'walk' && (
        <>
          <WalkHUD engine={engine} onAvatar={onAvatar} />
          {hint && <div className="walk-hint">{hint}</div>}
        </>
      )}
    </div>
  );
}
