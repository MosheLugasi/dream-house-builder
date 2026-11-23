import { useEffect, useRef } from 'react';
import { SiteView } from '../editor2d/SiteView';
import { Icon } from './icons';

export function Site2D({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<SiteView | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const view = new SiteView(canvas);
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
      </div>
    </div>
  );
}
