import { useEffect, useState } from 'react';
import type { Engine } from '../render3d/Engine';
import type { CharacterLook, HairStyle } from '../render3d/Character';
import { loadLook, saveLook } from '../render3d/look';
import { useStore } from '../store/store';
import { useWalk } from '../store/walk';
import { sound } from '../audio/sound';
import { Modal } from './Dialogs';

const KEY_LABELS = ['E', 'F', 'G', 'T'];

const EMOTES = [
  { code: 'Digit1', icon: '👋', label: 'נפנוף', key: '1' },
  { code: 'Digit2', icon: '💃', label: 'ריקוד', key: '2' },
  { code: 'Digit3', icon: '👏', label: 'מחיאות כפיים', key: '3' },
  { code: 'Digit4', icon: '🙌', label: 'הידד', key: '4' },
  { code: 'Digit5', icon: '🙆', label: 'מתיחות', key: '5' },
];

const TIMES = [
  { id: 'day', icon: '☀️', label: 'יום' },
  { id: 'sunset', icon: '🌅', label: 'שקיעה' },
  { id: 'night', icon: '🌙', label: 'לילה' },
] as const;

export function TimeOfDayChips() {
  const tod = useStore((s) => s.view.timeOfDay);
  const setView = useStore((s) => s.setView);
  return (
    <div className="chip-group" role="group" aria-label="שעה ביום">
      {TIMES.map((t) => (
        <button key={t.id} className={`chip ${tod === t.id ? 'on' : ''}`} title={t.label} onClick={() => setView({ timeOfDay: t.id })}>
          {t.icon} <span className="chip-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

const WHITE = [
  { code: 'KeyA', note: 'דו' },
  { code: 'KeyS', note: 'רה' },
  { code: 'KeyD', note: 'מי' },
  { code: 'KeyF', note: 'פה' },
  { code: 'KeyG', note: 'סול' },
  { code: 'KeyH', note: 'לה' },
  { code: 'KeyJ', note: 'סי' },
  { code: 'KeyK', note: 'דו' },
  { code: 'KeyL', note: 'רה' },
  { code: 'Semicolon', note: 'מי' },
];
const BLACK: Array<{ code: string; after: number }> = [
  { code: 'KeyW', after: 0 },
  { code: 'KeyE', after: 1 },
  { code: 'KeyT', after: 3 },
  { code: 'KeyY', after: 4 },
  { code: 'KeyU', after: 5 },
  { code: 'KeyO', after: 7 },
  { code: 'KeyP', after: 8 },
];
const CHORDS = ['C', 'G', 'Am', 'F', 'Dm', 'Em', 'E', 'D'];
const DRUMS = ['בס', 'סנר', 'היי-האט', 'טום 1', 'טום 2', 'מצילה', 'היי-האט', 'סנר'];
const ROW = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'];
const keyChar = (code: string) => (code === 'Semicolon' ? ';' : code.replace('Key', ''));

function InstrumentPanel({ engine }: { engine: Engine | null }) {
  const instrument = useWalk((s) => s.instrument);
  const pressed = useWalk((s) => s.pressed);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!pressed) return;
    setFlash(pressed);
    const t = setTimeout(() => setFlash(null), 140);
    useWalk.getState().set({ pressed: null });
    return () => clearTimeout(t);
  }, [pressed]);
  if (!instrument) return null;
  const play = (code: string) => {
    sound.unlock();
    engine?.instrumentKey(instrument, code);
  };
  return (
    <div className="instrument" dir="ltr">
      {instrument === 'piano' && (
        <div className="piano">
          {WHITE.map((k) => (
            <button key={k.code} className={`white ${flash === k.code ? 'hit' : ''}`} onPointerDown={() => play(k.code)}>
              <small>{k.note}</small>
              <kbd>{keyChar(k.code)}</kbd>
            </button>
          ))}
          {BLACK.map((k) => (
            <button
              key={k.code}
              className={`black ${flash === k.code ? 'hit' : ''}`}
              style={{ left: `calc(${(k.after + 1) * 10}% - 3%)` }}
              onPointerDown={() => play(k.code)}
            >
              <kbd>{keyChar(k.code)}</kbd>
            </button>
          ))}
        </div>
      )}
      {instrument !== 'piano' && (
        <div className="pads">
          {ROW.map((code, i) => (
            <button key={code} className={`pad ${flash === code ? 'hit' : ''}`} onPointerDown={() => play(code)}>
              <strong>{instrument === 'guitar' ? CHORDS[i] : DRUMS[i]}</strong>
              <kbd>{keyChar(code)}</kbd>
            </button>
          ))}
        </div>
      )}
      <p dir="rtl">
        לחצו על המקשים או נגנו במקלדת ·{' '}
        <button className="link-btn" onClick={() => engine?.runChoice('end')}>
          סיום (Esc)
        </button>
      </p>
    </div>
  );
}

const HAIR: Array<{ id: HairStyle; label: string }> = [
  { id: 'short', label: 'קצר' },
  { id: 'ponytail', label: 'קוקו' },
  { id: 'long', label: 'ארוך' },
  { id: 'bun', label: 'פקעת' },
  { id: 'curly', label: 'מתולתל' },
  { id: 'bald', label: 'קרחת' },
];
const SKINS = ['#f6d7c3', '#e8b996', '#d29b74', '#b07650', '#8a5a3b', '#5e3b26'];

function ColorRow({ label, value, onChange, presets }: { label: string; value: string; onChange: (v: string) => void; presets: string[] }) {
  return (
    <div className="look-row">
      <span>{label}</span>
      <div className="look-swatches">
        {presets.map((c) => (
          <button key={c} className={value === c ? 'on' : ''} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
        ))}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export function CharacterDialog({ engine, onClose }: { engine: Engine | null; onClose: () => void }) {
  const [look, setLook] = useState<CharacterLook>(() => loadLook());
  const update = (patch: Partial<CharacterLook>) => {
    const next = { ...look, ...patch };
    setLook(next);
    saveLook(next);
    engine?.setLook(next);
  };
  return (
    <Modal title="הדמות שלי" onClose={onClose} className="side-panel">
      <div className="look-editor">
        <div className="look-row">
          <span>תסרוקת</span>
          <div className="segmented">
            {HAIR.map((h) => (
              <button key={h.id} className={(look.hairStyle ?? 'ponytail') === h.id ? 'active' : ''} onClick={() => update({ hairStyle: h.id, longHair: h.id !== 'short' })}>
                {h.label}
              </button>
            ))}
          </div>
        </div>
        <ColorRow label="עור" value={look.skin} onChange={(skin) => update({ skin })} presets={SKINS} />
        <ColorRow label="שיער" value={look.hair} onChange={(hair) => update({ hair })} presets={['#1f1a17', '#5a3620', '#8b5a2b', '#d4a96a', '#e8d6a8', '#b5462e', '#9a9a9a']} />
        <ColorRow label="חולצה" value={look.shirt} onChange={(shirt) => update({ shirt })} presets={['#e8725a', '#4f7896', '#f3f1ec', '#2f3339', '#6f8f72', '#d6a544', '#c77dff']} />
        <ColorRow label={look.skirt ? 'חצאית' : 'מכנסיים'} value={look.pants} onChange={(pants) => update({ pants })} presets={['#3f5f8a', '#2f3339', '#c9bca7', '#6b4f3a', '#8a2f2f', '#5e7a52']} />
        <ColorRow label="נעליים" value={look.shoes} onChange={(shoes) => update({ shoes })} presets={['#f4f4f2', '#1e1f22', '#8b5a2b', '#c0392b', '#4f7896']} />
        <div className="look-row">
          <span>גובה</span>
          <input type="range" min={1.2} max={1.95} step={0.01} value={look.height} onChange={(e) => update({ height: parseFloat(e.target.value) })} />
          <em>{Math.round(look.height * 100)} ס"מ</em>
        </div>
        <div className="look-row">
          <label className={`chip toggle ${look.skirt ? 'on' : ''}`}>
            <input type="checkbox" checked={!!look.skirt} onChange={(e) => update({ skirt: e.target.checked })} /> חצאית
          </label>
          <label className={`chip toggle ${look.glasses ? 'on' : ''}`}>
            <input type="checkbox" checked={!!look.glasses} onChange={(e) => update({ glasses: e.target.checked })} /> משקפיים
          </label>
        </div>
      </div>
    </Modal>
  );
}

export function WalkHUD({ engine }: { engine: Engine | null }) {
  const choices = useWalk((s) => s.choices);
  const toasts = useWalk((s) => s.toasts);
  const score = useWalk((s) => s.score);
  const fade = useWalk((s) => s.fade);
  const flash = useWalk((s) => s.flash);
  const muted = useWalk((s) => s.muted);
  const instrument = useWalk((s) => s.instrument);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const setMode = useStore((s) => s.setMode);
  const [lookOpen, setLookOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  useEffect(() => {
    if (!flash) return;
    setFlashOn(true);
    const t = setTimeout(() => setFlashOn(false), 180);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <>
      <div className="view-controls">
        <TimeOfDayChips />
        <label className={`chip toggle ${view.firstPerson ? 'on' : ''}`}>
          <input type="checkbox" checked={view.firstPerson} onChange={(e) => setView({ firstPerson: e.target.checked })} />
          מבט מהעיניים
        </label>
        <button
          className="chip"
          title="השתקה (M)"
          onClick={() => {
            const m = !sound.isMuted();
            sound.setMuted(m);
            useWalk.getState().set({ muted: m });
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="chip" onClick={() => setLookOpen(true)}>
          🧑 הדמות שלי
        </button>
        <button className="chip" onClick={() => setHelpOpen((v) => !v)}>
          ⌨️ מקשים
        </button>
        <button className="chip" onClick={() => setMode('view3d')}>
          סיום הסיור
        </button>
      </div>
      {score > 0 && <div className="score">⭐ {score}</div>}

      {!instrument && (
        <div className="emote-bar">
          {EMOTES.map((e) => (
            <button key={e.code} title={`${e.label} (${e.key})`} onClick={() => engine?.emote(e.code)}>
              <span>{e.icon}</span>
              <kbd>{e.key}</kbd>
            </button>
          ))}
          <button title="קפיצה (רווח)" onClick={() => engine?.jump()}>
            <span>🦘</span>
            <kbd>␣</kbd>
          </button>
          <button title="לקרוא לחיות המחמד (C)" onClick={() => engine?.callPets()}>
            <span>🐕</span>
            <kbd>C</kbd>
          </button>
          <button title="צילום תמונה (P)" onClick={() => engine?.takePhoto()}>
            <span>📸</span>
            <kbd>P</kbd>
          </button>
        </div>
      )}

      {choices.length > 0 && !instrument && (
        <div className="action-panel">
          {choices.map((c, i) => (
            <button key={c.id} className={i === 0 ? 'primary' : ''} onClick={() => engine?.runChoice(c.id)}>
              <kbd>{KEY_LABELS[i]}</kbd>
              <span className="ai">{c.icon}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}

      <InstrumentPanel engine={engine} />

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>

      {helpOpen && (
        <div className="walk-help">
          <div>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> או חיצים – הליכה · <kbd>Shift</kbd> – ריצה
          </div>
          <div>גרירת עכבר – מבט · גלגלת – מרחק · <kbd>V</kbd> – מבט מהעיניים</div>
          <div>
            <kbd>E</kbd> <kbd>F</kbd> <kbd>G</kbd> <kbd>T</kbd> – הפעולות שליד הדמות · <kbd>רווח</kbd> – קפיצה
          </div>
          <div>
            <kbd>1</kbd>–<kbd>5</kbd> – תנועות · <kbd>C</kbd> – לקרוא לחיות · <kbd>P</kbd> – צילום · <kbd>N</kbd> – יום/לילה · <kbd>M</kbd> – שקט
          </div>
        </div>
      )}

      <div className="fade-overlay" style={{ opacity: fade }} />
      <div className={`flash-overlay ${flashOn ? 'on' : ''}`} />
      {lookOpen && <CharacterDialog engine={engine} onClose={() => setLookOpen(false)} />}
    </>
  );
}
