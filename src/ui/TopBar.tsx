import { useRef, useState } from 'react';
import { exportProjectFile, importProjectFile } from '../io/storage';
import { useStore, type Mode } from '../store/store';
import { CHALLENGES, useProgress } from '../game/progress';
import { hasAvatarCreator } from './GameHud';
import { Icon } from './icons';

const MODES: { mode: Mode; label: string; icon: string }[] = [
  { mode: 'site', label: 'שכונה', icon: 'map' },
  { mode: 'plan', label: 'תכנון בית', icon: 'plan' },
  { mode: 'view3d', label: 'תלת־ממד', icon: 'cube' },
  { mode: 'walk', label: 'סיור', icon: 'walk' },
];

export function TopBar({
  onProjects,
  onHelp,
  onChallenges,
  onAvatar,
}: {
  onProjects: () => void;
  onHelp: () => void;
  onChallenges: () => void;
  onAvatar: () => void;
}) {
  const stickers = useProgress((s) => s.done.length);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const name = useStore((s) => s.project.name);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const update = useStore((s) => s.update);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3500);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="home" size={22} />
        </span>
        <span className="brand-name">בונים חלום</span>
      </div>
      <input
        className="project-name"
        value={name}
        aria-label="שם הפרויקט"
        onChange={(e) => update((d) => void (d.name = e.target.value), { transient: true })}
      />
      <nav className="mode-tabs" aria-label="מצב תצוגה">
        {MODES.map((m) => (
          <button key={m.mode} className={mode === m.mode ? 'active' : ''} onClick={() => setMode(m.mode)}>
            <Icon name={m.icon} size={18} />
            {m.label}
          </button>
        ))}
      </nav>
      <div className="topbar-actions">
        {message && <span className="flash">{message}</span>}
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title="ביטול (Ctrl+Z)">
          <Icon name="redo" />
        </button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title="ביצוע מחדש (Ctrl+Y)">
          <Icon name="undo" />
        </button>
        <span className="sep" />
        <button className="text-btn stickers-btn" onClick={onChallenges} title="אתגרים ומדבקות">
          ⭐ {stickers}/{CHALLENGES.length}
        </button>
        {hasAvatarCreator && (
          <button className="text-btn" onClick={onAvatar} title="עיצוב הדמות">
            👤
          </button>
        )}
        <button className="text-btn" onClick={onProjects}>
          <Icon name="folder" size={18} />
          הפרויקטים שלי
        </button>
        <button
          className="text-btn"
          title="שמירת קובץ גיבוי למחשב"
          onClick={() => {
            exportProjectFile(useStore.getState().project);
            flash('קובץ הגיבוי ירד למחשב');
          }}
        >
          <Icon name="download" size={18} />
          גיבוי לקובץ
        </button>
        <button className="text-btn" title="פתיחת קובץ גיבוי" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={18} />
          פתיחת קובץ
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              useStore.getState().loadProject(await importProjectFile(file));
              flash('הקובץ נפתח');
            } catch (err) {
              flash(err instanceof Error ? err.message : 'לא הצלחנו לפתוח את הקובץ');
            }
          }}
        />
        <button className="icon-btn" onClick={onHelp} title="עזרה">
          <Icon name="help" />
        </button>
      </div>
    </header>
  );
}
