import { useEffect, useState } from 'react';
import { deleteSelection, duplicateSelection, pruneRoomStyles, updateFurniture } from '../store/actions';
import { currentLevel, useStore, type Tool } from '../store/store';
import { HelpDialog, ProjectsDialog } from './Dialogs';
import { Inspector } from './Inspector';
import { LevelBar } from './LevelBar';
import { Plan2D } from './Plan2D';
import { Site2D } from './Site2D';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { View3D } from './View3D';

const TOOL_HINTS: Record<Tool['type'], string> = {
  select: 'לחצו על קיר, רהיט, דלת או חדר כדי לבחור · גררו כדי להזיז · גלגלת העכבר – זום',
  wall: 'לחצו כדי להתחיל קיר ושוב בכל פינה · לחיצה כפולה או Esc לסיום',
  room: 'גררו מלבן כדי ליצור חדר',
  opening: 'קרבו את העכבר לקיר ולחצו כדי למקם',
  furniture: 'לחצו כדי למקם · R לסיבוב · Esc לביטול',
  paint: 'לחצו על חדר (או על קיר חיצוני) כדי להחיל את החומר',
  erase: 'לחצו על פריט כדי למחוק אותו',
  road: 'גררו על המפה כדי לסלול כביש · גרירה על כביש קיים מוחקת אותו',
  area: 'גררו מלבן כדי לסמן גינה, רחבה או מגרש',
  building: 'לחצו על המפה כדי למקם את המבנה · R לסיבוב',
};

export function App() {
  const mode = useStore((s) => s.mode);
  const tool = useStore((s) => s.tool);
  const scope = useStore((s) => s.scope);
  const [dialog, setDialog] = useState<'projects' | 'help' | null>(null);
  const [seen3d, setSeen3d] = useState(false);

  useEffect(() => {
    if (mode === 'view3d' || mode === 'walk') setSeen3d(true);
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (ctrl && e.code === 'KeyY') {
        e.preventDefault();
        st.redo();
      } else if (ctrl && e.code === 'KeyD') {
        e.preventDefault();
        duplicateSelection();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.mode !== 'walk') {
        if (st.selection && st.selection.kind !== 'room') {
          e.preventDefault();
          deleteSelection();
          if (st.scope === 'building') pruneRoomStyles();
        }
      } else if (e.key.startsWith('Arrow') && st.mode === 'plan' && st.selection?.kind === 'furniture') {
        const selId = st.selection.id;
        const f = currentLevel(st.project, st.levelIndex).furniture.find((x) => x.id === selId);
        if (!f) return;
        e.preventDefault();
        const step = e.shiftKey ? 0.01 : 0.05;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        updateFurniture(f.id, { x: f.x + dx, y: f.y + dy });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app mode-${mode}`}>
      <TopBar onProjects={() => setDialog('projects')} onHelp={() => setDialog('help')} />
      <div className="workspace">
        {mode !== 'walk' && <Sidebar />}
        <main className="stage">
          <Site2D active={mode === 'site'} />
          <Plan2D active={mode === 'plan'} />
          {(seen3d || mode === 'view3d' || mode === 'walk') && <View3D active={mode === 'view3d' || mode === 'walk'} />}
          {scope === 'building' && (mode === 'plan' || mode === 'view3d') && <LevelBar />}
          {mode !== 'walk' && <div className="statusbar">{TOOL_HINTS[tool.type]}</div>}
        </main>
        {mode !== 'walk' && <Inspector />}
      </div>
      {dialog === 'projects' && <ProjectsDialog onClose={() => setDialog(null)} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
