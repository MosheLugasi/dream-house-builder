import { useEffect, useMemo, useRef, useState } from 'react';
import { FURNITURE, resolveColors } from '../catalog';
import { OPENINGS } from '../catalog/openings';
import { CATEGORY_LABELS, type FurnitureCategory, type FurnitureDef } from '../catalog/types';
import { finishes } from '../materials/finishes';
import type { FinishKind } from '../materials/types';
import { useStore, type Tool } from '../store/store';
import { Icon } from './icons';
import { requestThumbnail } from './thumbnails';

type Tab = 'build' | 'openings' | 'furniture' | 'finishes';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'build', label: 'בנייה', icon: 'wall' },
  { id: 'openings', label: 'דלתות וחלונות', icon: 'door' },
  { id: 'furniture', label: 'רהיטים', icon: 'sofa' },
  { id: 'finishes', label: 'חומרים וצבעים', icon: 'paint' },
];

export const PAINT_COLORS = [
  '#ffffff', '#f4f1ea', '#ebe5d9', '#ddd3c2', '#c9bca7', '#a89a85',
  '#f6e3d7', '#efc9b5', '#e0a48a', '#c9765a', '#f7ecc9', '#ecd590',
  '#e4e8e1', '#c9d5c4', '#a3b89c', '#6f8f72', '#dfe8ee', '#bcd0de',
  '#8fb0c7', '#4f7896', '#e9e0ee', '#c9b6d6', '#d9d9d9', '#5c6068',
];

function useTool() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const pick = (next: Tool, planOnly = false) => {
    const st = useStore.getState();
    if (planOnly && st.mode !== 'plan') st.setMode('plan');
    else if (st.mode === 'walk') st.setMode('view3d');
    setTool(next);
  };
  return { tool, pick };
}

function Symbol2D({ def }: { def: FurnitureDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    const scale = (size * 0.84) / Math.max(def.size.w, def.size.d, 0.3);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(scale, scale);
    ctx.lineWidth = 0.02;
    try {
      def.draw2d(ctx, resolveColors(def));
    } catch {
      /* ignore */
    }
    ctx.restore();
  }, [def]);
  return <canvas ref={ref} width={128} height={128} className="thumb-canvas" />;
}

function FurnitureThumb({ def }: { def: FurnitureDef }) {
  const [url, setUrl] = useState<string | undefined>();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancel = () => {};
    const el = ref.current;
    if (!el) return;
    // render only when scrolled into view
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        cancel = requestThumbnail(def.id, setUrl);
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancel();
    };
  }, [def.id]);
  return (
    <div ref={ref} className="thumb">
      {url ? <img src={url} alt="" draggable={false} /> : <Symbol2D def={def} />}
    </div>
  );
}

function Swatch({ id }: { id: string }) {
  const [url, setUrl] = useState<string>();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        setTimeout(() => setUrl(finishes.swatch(id)), 0);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [id]);
  return (
    <div ref={ref} className="thumb swatch" style={{ background: finishes.get(id).color2d }}>
      {url && <img src={url} alt="" draggable={false} />}
    </div>
  );
}

function BuildTab() {
  const { tool, pick } = useTool();
  const thickness = useStore((s) => s.wallThickness);
  const setThickness = useStore((s) => s.setWallThickness);
  const tools: { tool: Tool; label: string; icon: string; desc: string; planOnly?: boolean }[] = [
    { tool: { type: 'select' }, label: 'בחירה והזזה', icon: 'select', desc: 'בחרו, גררו וסובבו' },
    { tool: { type: 'room' }, label: 'חדר', icon: 'room', desc: 'גררו מלבן – וקיבלתם חדר', planOnly: true },
    { tool: { type: 'wall' }, label: 'קיר', icon: 'wall', desc: 'שרטוט חופשי, נקודה אחר נקודה', planOnly: true },
    { tool: { type: 'erase' }, label: 'מחיקה', icon: 'erase', desc: 'לחצו על מה שרוצים להסיר' },
  ];
  return (
    <div className="tab-body">
      <div className="tool-list">
        {tools.map((t) => (
          <button key={t.label} className={`tool-card ${tool.type === t.tool.type ? 'active' : ''}`} onClick={() => pick(t.tool, t.planOnly)}>
            <span className="tool-icon">
              <Icon name={t.icon} size={22} />
            </span>
            <span>
              <strong>{t.label}</strong>
              <small>{t.desc}</small>
            </span>
          </button>
        ))}
      </div>
      <h4>עובי קיר</h4>
      <div className="segmented">
        {[0.1, 0.15, 0.2, 0.25, 0.3].map((t) => (
          <button key={t} className={Math.abs(thickness - t) < 1e-6 ? 'active' : ''} onClick={() => setThickness(t)}>
            {Math.round(t * 100)}
          </button>
        ))}
      </div>
      <p className="note">ס"מ. קירות חיצוניים בדרך כלל 20–30, פנימיים 10–15.</p>
      <div className="tips">
        <h4>טיפים</h4>
        <ul>
          <li>חדרים שנוגעים זה בזה מתחברים לבד לקיר משותף.</li>
          <li>קיר שנסגר לצורה סגורה הופך אוטומטית לחדר עם רצפה.</li>
          <li>גררו קצה של קיר כדי לשנות את הצורה.</li>
        </ul>
      </div>
    </div>
  );
}

function OpeningsTab() {
  const { tool, pick } = useTool();
  return (
    <div className="tab-body">
      {(['door', 'window'] as const).map((type) => (
        <section key={type}>
          <h4>{type === 'door' ? 'דלתות ופתחים' : 'חלונות'}</h4>
          <div className="grid">
            {OPENINGS.filter((o) => o.type === type).map((o) => (
              <button
                key={o.id}
                className={`card ${tool.type === 'opening' && tool.style === o.id ? 'active' : ''}`}
                onClick={() => pick({ type: 'opening', style: o.id }, true)}
              >
                <OpeningThumb id={o.id} />
                <span>{o.name}</span>
                <small>
                  {Math.round(o.width * 100)}×{Math.round(o.height * 100)}
                </small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function OpeningThumb({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const def = OPENINGS.find((o) => o.id === id);
    const canvas = ref.current;
    if (!def || !canvas) return;
    const ctx = canvas.getContext('2d')!;
    const size = canvas.width;
    const t = 0.2;
    const scale = (size * 0.8) / Math.max(def.width + 0.5, 1.2);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size * (def.type === 'door' ? 0.3 : 0.5));
    ctx.scale(scale, scale);
    ctx.fillStyle = '#3d424b';
    ctx.fillRect(-def.width / 2 - 0.25, -t / 2, 0.25, t);
    ctx.fillRect(def.width / 2, -t / 2, 0.25, t);
    def.draw2d(ctx, { id: '', wallId: '', type: def.type, style: def.id, offset: 0, width: def.width, height: def.height, sill: def.sill }, t);
    ctx.restore();
  }, [id]);
  return (
    <div className="thumb">
      <canvas ref={ref} width={128} height={128} className="thumb-canvas" />
    </div>
  );
}

function FurnitureGroup({ title, list, tool, pick }: { title: string; list: FurnitureDef[]; tool: Tool; pick: (t: Tool) => void }) {
  return (
    <>
      {title && <h5 className="catalog-group">{title}</h5>}
      {list.map((f) => (
        <button
          key={f.id}
          className={`card ${tool.type === 'furniture' && tool.catalogId === f.id ? 'active' : ''}`}
          onClick={() => pick({ type: 'furniture', catalogId: f.id })}
          title={`${f.name} · ${Math.round(f.size.w * 100)}×${Math.round(f.size.d * 100)} ס"מ${f.actions?.length ? ' · אינטראקטיבי' : ''}`}
        >
          <FurnitureThumb def={f} />
          <span>{f.name}</span>
          {!!f.actions?.length && <i className="interactive-badge" title="אפשר לשחק עם זה בסיור">✨</i>}
        </button>
      ))}
    </>
  );
}

function FurnitureTab() {
  const { tool, pick } = useTool();
  const [category, setCategory] = useState<FurnitureCategory | 'all'>('living');
  const [query, setQuery] = useState('');
  const categories = useMemo(() => {
    const present = new Set(FURNITURE.map((f) => f.category));
    return (Object.keys(CATEGORY_LABELS) as FurnitureCategory[]).filter((c) => present.has(c));
  }, []);
  const q = query.trim();
  const items = FURNITURE.filter((f) =>
    q ? f.name.includes(q) || (f.group ?? '').includes(q) || (f.tags ?? []).some((t) => t.includes(q)) : category === 'all' || f.category === category,
  );
  // keep catalog order but gather each sub-group together
  const groups = new Map<string, FurnitureDef[]>();
  for (const f of items) {
    const g = q ? '' : (f.group ?? '');
    const list = groups.get(g) ?? [];
    list.push(f);
    groups.set(g, list);
  }
  const ordered = [...groups.entries()].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : 0));
  return (
    <div className="tab-body">
      <input className="search" placeholder="חיפוש: ספה, קטיפה, כלב, מנורה…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {!q && (
        <div className="pills">
          {categories.map((c) => (
            <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      )}
      <p className="note">{q ? `${items.length} תוצאות` : `${items.length} פריטים`} · {FURNITURE.length} בקטלוג</p>
      <div className="grid">
        {ordered.map(([g, list]) => (
          <FurnitureGroup key={g || '_'} title={groups.size > 1 ? g || 'כללי' : ''} list={list} tool={tool} pick={pick} />
        ))}
        {!items.length && <p className="note">לא נמצאו פריטים.</p>}
      </div>
    </div>
  );
}

const KIND_TABS: { kind: FinishKind; label: string; target: 'floor' | 'wall' | 'exterior' }[] = [
  { kind: 'floor', label: 'רצפות', target: 'floor' },
  { kind: 'wall', label: 'קירות', target: 'wall' },
  { kind: 'exterior', label: 'חיפוי חוץ', target: 'exterior' },
];

function FinishesTab() {
  const { tool, pick } = useTool();
  const [kind, setKind] = useState<FinishKind>('floor');
  const target = KIND_TABS.find((k) => k.kind === kind)!.target;
  const list = finishes.list.filter((f) => f.kinds.includes(kind));
  const isActive = (id: string) => tool.type === 'paint' && tool.finish === id && tool.target === target;
  return (
    <div className="tab-body">
      <div className="pills">
        {KIND_TABS.map((k) => (
          <button key={k.kind} className={kind === k.kind ? 'active' : ''} onClick={() => setKind(k.kind)}>
            {k.label}
          </button>
        ))}
      </div>
      <p className="note">
        {kind === 'floor' && 'בחרו חומר ולחצו על חדר כדי לרצף אותו.'}
        {kind === 'wall' && 'בחרו צבע או חיפוי ולחצו על חדר כדי לצבוע את קירותיו.'}
        {kind === 'exterior' && 'בחרו חיפוי ולחצו על הבית כדי לחפות את קירות החוץ.'}
      </p>
      {kind !== 'floor' && (
        <>
          <h4>צבעים</h4>
          <div className="palette">
            {PAINT_COLORS.map((c) => (
              <button
                key={c}
                className={isActive(`paint:${c}`) ? 'active' : ''}
                style={{ background: c }}
                title={c}
                onClick={() => pick({ type: 'paint', target, finish: `paint:${c}` })}
              />
            ))}
            <label className="custom-color" title="צבע אחר">
              <Icon name="plus" size={16} />
              <input type="color" onChange={(e) => pick({ type: 'paint', target, finish: `paint:${e.target.value}` })} />
            </label>
          </div>
          <h4>חיפויים וטפטים</h4>
        </>
      )}
      <div className="grid">
        {list.map((f) => (
          <button key={f.id} className={`card ${isActive(f.id) ? 'active' : ''}`} onClick={() => pick({ type: 'paint', target, finish: f.id })}>
            <Swatch id={f.id} />
            <span>{f.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Sidebar() {
  const [tab, setTab] = useState<Tab>('build');
  return (
    <aside className="sidebar">
      <div className="side-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {tab === 'build' && <BuildTab />}
      {tab === 'openings' && <OpeningsTab />}
      {tab === 'furniture' && <FurnitureTab />}
      {tab === 'finishes' && <FinishesTab />}
    </aside>
  );
}
