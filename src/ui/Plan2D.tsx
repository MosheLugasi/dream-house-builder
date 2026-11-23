import { useEffect, useRef } from 'react';
import { PlanView } from '../editor2d/PlanView';
import { useStore } from '../store/store';
import { Icon } from './icons';

export function Plan2D({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<PlanView | null>(null);
  const snap = useStore((s) => s.view.snap);
  const showDimensions = useStore((s) => s.view.showDimensions);
  const setView = useStore((s) => s.setView);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const view = new PlanView(canvas);
    viewRef.current = view;
    const ro = new ResizeObserver(([entry]) => view.resize(entry.contentRect.width, entry.contentRect.height));
    ro.observe(canvas.parentElement!);
    return () => {
      ro.disconnect();
      view.dispose();
    };
  }, []);

  return (
    <div className="viewport" style={{ display: active ? 'block' : 'none' }}>
      <canvas ref={canvasRef} className="plan-canvas" />
      <div className="view-controls">
        <button className="chip" onClick={() => viewRef.current?.zoomBy(1.25)} title="הגדלה">
          +
        </button>
        <button className="chip" onClick={() => viewRef.current?.zoomBy(0.8)} title="הקטנה">
          −
        </button>
        <button className="chip" onClick={() => viewRef.current?.fit()} title="התאמה למסך">
          <Icon name="fit" size={16} />
        </button>
        <label className={`chip toggle ${snap ? 'on' : ''}`}>
          <input type="checkbox" checked={snap} onChange={(e) => setView({ snap: e.target.checked })} />
          הצמדה
        </label>
        <label className={`chip toggle ${showDimensions ? 'on' : ''}`}>
          <input type="checkbox" checked={showDimensions} onChange={(e) => setView({ showDimensions: e.target.checked })} />
          מידות
        </label>
      </div>
    </div>
  );
}
