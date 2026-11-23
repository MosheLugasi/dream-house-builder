import { getFurniture, itemSize, resolveColors } from '../catalog';
import { finishes } from '../materials/finishes';
import { rotate, snapTo, sub } from '../model/geom';
import { getGraph, roomAt } from '../model/graph';
import { TEMPLATES } from '../model/templates';
import { ROAD_CELL, toLocal, type Building, type FurnitureItem, type SiteArea, type Vec2 } from '../model/types';
import { roadPieces, roadSet } from '../render3d/buildSite';
import { addArea, addBuilding, addProp, deleteSelection, setRoad, updateArea, updateBuilding, updateProp } from '../store/actions';
import { useStore, type Selection } from '../store/store';

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'prop'; id: string; grab: Vec2; moved: boolean }
  | { kind: 'rotate'; id: string; moved: boolean }
  | { kind: 'building'; id: string; grab: Vec2; moved: boolean }
  | { kind: 'area-move'; id: string; grab: Vec2; moved: boolean }
  | { kind: 'road'; on: boolean; started: boolean }
  | { kind: 'area'; start: Vec2 };

const C = {
  accent: '#e2703a',
  wall: '#3d424b',
  asphalt: '#70747b',
  sidewalk: '#d4cfc4',
  mark: '#f6f4ea',
  label: '#2f3339',
};

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Local bounds of a building's walls (or a placeholder square for an empty lot). */
export function buildingBounds(b: Building): Bounds & { empty: boolean } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const lvl of b.levels) {
    for (const w of lvl.walls) {
      for (const p of [w.a, w.b]) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 8, maxY: 8, empty: true };
  return { minX, minY, maxX, maxY, empty: false };
}

/** Top-down editor of the neighborhood: buildings, roads, ground areas, street furniture and vehicles. */
export class SiteView {
  private ctx: CanvasRenderingContext2D;
  private scale = 7; // px per meter
  private origin = { x: 0, y: 0 };
  private dpr = 1;
  private width = 0;
  private height = 0;
  private drag: Drag | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; cx: number; cy: number } | null = null;
  private cursor: Vec2 = { x: 0, y: 0 };
  private cursorOn = false;
  private placeRotation = 0;
  private spaceDown = false;
  private raf = 0;
  private unsub: () => void;
  private fitted = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('dblclick', this.onDblClick);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.unsub = useStore.subscribe((s, prev) => {
      if (s.tool !== prev.tool) this.placeRotation = 0;
      if (s.project.id !== prev.project.id) this.fit();
      this.requestDraw();
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.unsub();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('dblclick', this.onDblClick);
    c.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  resize(width: number, height: number): void {
    if (width < 2 || height < 2) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    if (!this.fitted) {
      this.fitted = true;
      this.fit();
    }
    this.requestDraw();
  }

  fit(): void {
    const { project } = this.state();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const b of project.buildings) for (const p of this.buildingCorners(b)) grow(p.x, p.y);
    for (const [i, j] of project.site.roads) {
      grow(i * ROAD_CELL, j * ROAD_CELL);
      grow((i + 1) * ROAD_CELL, (j + 1) * ROAD_CELL);
    }
    for (const a of project.site.areas) {
      grow(a.x0, a.y0);
      grow(a.x1, a.y1);
    }
    for (const f of project.site.props) grow(f.x, f.y);
    if (minX === Infinity) {
      minX = -20;
      minY = -20;
      maxX = 20;
      maxY = 20;
    }
    const pad = 12;
    this.scale = Math.max(1.5, Math.min(40, Math.min(this.width / (maxX - minX + pad * 2), this.height / (maxY - minY + pad * 2))));
    this.origin.x = this.width / 2 - ((minX + maxX) / 2) * this.scale;
    this.origin.y = this.height / 2 - ((minY + maxY) / 2) * this.scale;
    this.requestDraw();
  }

  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2): void {
    const before = this.toWorld(sx, sy);
    this.scale = Math.max(1, Math.min(120, this.scale * factor));
    this.origin.x = sx - before.x * this.scale;
    this.origin.y = sy - before.y * this.scale;
    this.requestDraw();
  }

  // ---- helpers -------------------------------------------------------------------------------

  private state = () => useStore.getState();
  private toWorld = (sx: number, sy: number): Vec2 => ({ x: (sx - this.origin.x) / this.scale, y: (sy - this.origin.y) / this.scale });
  private toScreen = (p: Vec2): Vec2 => ({ x: p.x * this.scale + this.origin.x, y: p.y * this.scale + this.origin.y });
  private px = (n: number) => n / this.scale;
  private eventPos(e: PointerEvent | MouseEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  private requestDraw = (): void => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  };

  private buildingCorners(b: Building): Vec2[] {
    const bb = buildingBounds(b);
    const c = Math.cos(b.rotation);
    const s = Math.sin(b.rotation);
    return [
      [bb.minX, bb.minY],
      [bb.maxX, bb.minY],
      [bb.maxX, bb.maxY],
      [bb.minX, bb.maxY],
    ].map(([x, y]) => ({ x: b.x + x * c - y * s, y: b.y + x * s + y * c }));
  }

  // ---- hit testing ---------------------------------------------------------------------------

  private hitProp(p: Vec2): FurnitureItem | null {
    let best: FurnitureItem | null = null;
    let bestArea = Infinity;
    for (const f of this.state().project.site.props) {
      const def = getFurniture(f.catalogId);
      if (!def) continue;
      const local = rotate(sub(p, { x: f.x, y: f.y }), -f.rotation);
      const size = itemSize(def, f);
      const hw = Math.max(size.w / 2, this.px(9));
      const hd = Math.max(size.d / 2, this.px(9));
      if (Math.abs(local.x) <= hw && Math.abs(local.y) <= hd) {
        const area = size.w * size.d * (def.walkable ? 100 : 1);
        if (area < bestArea) {
          bestArea = area;
          best = f;
        }
      }
    }
    return best;
  }

  private hitBuilding(p: Vec2): Building | null {
    for (const b of this.state().project.buildings.slice().reverse()) {
      const bb = buildingBounds(b);
      const l = toLocal(b, p);
      const m = 0.4;
      if (l.x >= bb.minX - m && l.x <= bb.maxX + m && l.y >= bb.minY - m && l.y <= bb.maxY + m) return b;
    }
    return null;
  }

  private hitArea(p: Vec2): SiteArea | null {
    for (const a of this.state().project.site.areas.slice().reverse()) {
      if (p.x >= a.x0 && p.x <= a.x1 && p.y >= a.y0 && p.y <= a.y1) return a;
    }
    return null;
  }

  private rotateHandle(f: FurnitureItem): Vec2 | null {
    const def = getFurniture(f.catalogId);
    if (!def) return null;
    const r = rotate({ x: 0, y: -itemSize(def, f).d / 2 - this.px(22) }, f.rotation);
    return { x: f.x + r.x, y: f.y + r.y };
  }

  private cell(p: Vec2): [number, number] {
    return [Math.floor(p.x / ROAD_CELL), Math.floor(p.y / ROAD_CELL)];
  }

  private buildingPlacement(template: string, world: Vec2): { pos: Vec2; rotation: number; size: { w: number; d: number } } | null {
    const t = TEMPLATES.find((x) => x.id === template);
    if (!t) return null;
    const half = rotate({ x: t.size.w / 2, y: t.size.d / 2 }, this.placeRotation);
    return { pos: { x: snapTo(world.x - half.x, 0.5), y: snapTo(world.y - half.y, 0.5) }, rotation: this.placeRotation, size: t.size };
  }

  // ---- events --------------------------------------------------------------------------------

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    if (this.state().tool.type !== 'select') this.state().setTool({ type: 'select' });
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.state().mode !== 'site') return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') {
      this.spaceDown = true;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      this.state().setTool({ type: 'select' });
      this.state().select(null);
    } else if (e.code === 'KeyR') {
      const step = e.shiftKey ? Math.PI / 12 : Math.PI / 2;
      const st = this.state();
      const sel = st.selection;
      if (st.tool.type === 'furniture' || st.tool.type === 'building') {
        this.placeRotation += step;
        this.requestDraw();
      } else if (sel?.kind === 'prop') {
        const f = st.project.site.props.find((x) => x.id === sel.id);
        if (f) updateProp(f.id, { rotation: f.rotation + step });
      } else if (sel?.kind === 'building') {
        const b = st.project.buildings.find((x) => x.id === sel.id);
        if (b) this.rotateBuilding(b, step);
      }
    }
  };

  /** Rotate a building around the middle of its footprint rather than around its local origin. */
  private rotateBuilding(b: Building, step: number): void {
    const bb = buildingBounds(b);
    const mid = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
    const before = rotate(mid, b.rotation);
    const after = rotate(mid, b.rotation + step);
    updateBuilding(b.id, { rotation: b.rotation + step, x: b.x + before.x - after.x, y: b.y + before.y - after.y });
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') this.spaceDown = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const { x, y } = this.eventPos(e);
    this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), x, y);
  };

  private onDblClick = (e: MouseEvent): void => {
    if (this.state().tool.type !== 'select') return;
    const pos = this.eventPos(e);
    const world = this.toWorld(pos.x, pos.y);
    if (this.hitProp(world)) return;
    const b = this.hitBuilding(world);
    if (b) this.state().editBuilding(b.id);
  };

  private onPointerLeave = (): void => {
    this.cursorOn = false;
    this.requestDraw();
  };

  private onPointerDown = (e: PointerEvent): void => {
    const pos = this.eventPos(e);
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, pos);
    if (this.pointers.size === 2) {
      const [p1, p2] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2 };
      this.drag = null;
      return;
    }
    const world = this.toWorld(pos.x, pos.y);
    this.cursor = world;
    this.cursorOn = true;
    const st = this.state();
    const tool = st.tool;
    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      this.drag = { kind: 'pan', lastX: pos.x, lastY: pos.y };
      return;
    }
    switch (tool.type) {
      case 'select': {
        const sel = st.selection;
        if (sel?.kind === 'prop') {
          const f = st.project.site.props.find((x) => x.id === sel.id);
          const h = f && this.rotateHandle(f);
          if (f && h && Math.hypot(h.x - world.x, h.y - world.y) < this.px(12)) {
            this.drag = { kind: 'rotate', id: f.id, moved: false };
            return;
          }
        }
        const prop = this.hitProp(world);
        const building = prop ? null : this.hitBuilding(world);
        const area = prop || building ? null : this.hitArea(world);
        if (prop) {
          st.select({ kind: 'prop', id: prop.id });
          this.drag = { kind: 'prop', id: prop.id, grab: sub(world, { x: prop.x, y: prop.y }), moved: false };
        } else if (building) {
          st.select({ kind: 'building', id: building.id });
          this.drag = { kind: 'building', id: building.id, grab: sub(world, { x: building.x, y: building.y }), moved: false };
        } else if (area) {
          st.select({ kind: 'area', id: area.id });
          this.drag = { kind: 'area-move', id: area.id, grab: sub(world, { x: area.x0, y: area.y0 }), moved: false };
        } else {
          st.select(null);
          this.drag = { kind: 'pan', lastX: pos.x, lastY: pos.y };
        }
        break;
      }
      case 'road': {
        const [i, j] = this.cell(world);
        const on = !roadSet(st.project.site).has(`${i},${j}`);
        st.checkpoint();
        setRoad(i, j, on, true);
        this.drag = { kind: 'road', on, started: true };
        break;
      }
      case 'area':
        this.drag = { kind: 'area', start: { x: snapTo(world.x, 0.5), y: snapTo(world.y, 0.5) } };
        break;
      case 'furniture': {
        const id = addProp(tool.catalogId, { x: snapTo(world.x, 0.1), y: snapTo(world.y, 0.1) }, this.placeRotation);
        st.setTool({ type: 'select' });
        if (id) st.select({ kind: 'prop', id });
        break;
      }
      case 'building': {
        const place = this.buildingPlacement(tool.template, world);
        if (place) {
          const id = addBuilding(tool.template, place.pos);
          if (id) {
            if (place.rotation) updateBuilding(id, { rotation: place.rotation }, true);
            st.setTool({ type: 'select' });
            st.select({ kind: 'building', id });
          }
        }
        break;
      }
      case 'erase': {
        const prop = this.hitProp(world);
        const building = prop ? null : this.hitBuilding(world);
        const area = prop || building ? null : this.hitArea(world);
        const [i, j] = this.cell(world);
        const target: Selection | null = prop
          ? { kind: 'prop', id: prop.id }
          : building
            ? { kind: 'building', id: building.id }
            : area
              ? { kind: 'area', id: area.id }
              : null;
        if (target) deleteSelection(target);
        else setRoad(i, j, false);
        break;
      }
      default:
        this.drag = { kind: 'pan', lastX: pos.x, lastY: pos.y };
    }
    this.requestDraw();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const pos = this.eventPos(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, pos);
    if (this.pinch && this.pointers.size === 2) {
      const [p1, p2] = [...this.pointers.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      this.origin.x += cx - this.pinch.cx;
      this.origin.y += cy - this.pinch.cy;
      this.zoomBy(d / Math.max(1, this.pinch.d), cx, cy);
      this.pinch = { d, cx, cy };
      return;
    }
    const world = this.toWorld(pos.x, pos.y);
    this.cursor = world;
    this.cursorOn = true;
    const st = this.state();
    const drag = this.drag;
    if (drag) {
      const begin = (d: { moved: boolean }) => {
        if (!d.moved) {
          st.checkpoint();
          d.moved = true;
        }
      };
      switch (drag.kind) {
        case 'pan':
          this.origin.x += pos.x - drag.lastX;
          this.origin.y += pos.y - drag.lastY;
          drag.lastX = pos.x;
          drag.lastY = pos.y;
          break;
        case 'prop': {
          const f = st.project.site.props.find((x) => x.id === drag.id);
          if (!f) break;
          const target = sub(world, drag.grab);
          if (!drag.moved && Math.hypot(target.x - f.x, target.y - f.y) < this.px(3)) break;
          begin(drag);
          const step = e.altKey ? 0.01 : 0.1;
          updateProp(f.id, { x: snapTo(target.x, step), y: snapTo(target.y, step) }, true);
          break;
        }
        case 'rotate': {
          const f = st.project.site.props.find((x) => x.id === drag.id);
          if (!f) break;
          begin(drag);
          let ang = Math.atan2(world.y - f.y, world.x - f.x) + Math.PI / 2;
          if (!e.altKey) ang = snapTo(ang, Math.PI / 12);
          updateProp(f.id, { rotation: ang }, true);
          break;
        }
        case 'building': {
          const b = st.project.buildings.find((x) => x.id === drag.id);
          if (!b) break;
          const target = sub(world, drag.grab);
          if (!drag.moved && Math.hypot(target.x - b.x, target.y - b.y) < this.px(3)) break;
          begin(drag);
          updateBuilding(b.id, { x: snapTo(target.x, 0.5), y: snapTo(target.y, 0.5) }, true);
          break;
        }
        case 'area-move': {
          const a = st.project.site.areas.find((x) => x.id === drag.id);
          if (!a) break;
          const target = sub(world, drag.grab);
          const x0 = snapTo(target.x, 0.5);
          const y0 = snapTo(target.y, 0.5);
          if (x0 === a.x0 && y0 === a.y0) break;
          begin(drag);
          updateArea(a.id, { x0, y0, x1: x0 + (a.x1 - a.x0), y1: y0 + (a.y1 - a.y0) }, true);
          break;
        }
        case 'road': {
          const [i, j] = this.cell(world);
          setRoad(i, j, drag.on, true);
          break;
        }
        case 'area':
          break;
      }
      this.requestDraw();
      return;
    }
    const tool = st.tool;
    let cursor = 'default';
    if (this.spaceDown) cursor = 'grab';
    else if (tool.type === 'select') cursor = this.hitProp(world) || this.hitBuilding(world) ? 'move' : 'default';
    else if (tool.type === 'erase') cursor = 'not-allowed';
    else cursor = 'crosshair';
    this.canvas.style.cursor = cursor;
    this.requestDraw();
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const drag = this.drag;
    this.drag = null;
    if (drag?.kind === 'area') {
      const st = this.state();
      const tool = st.tool;
      const end = { x: snapTo(this.cursor.x, 0.5), y: snapTo(this.cursor.y, 0.5) };
      if (tool.type === 'area') {
        const id = addArea(drag.start, end, tool.finish);
        if (id) {
          st.setTool({ type: 'select' });
          st.select({ kind: 'area', id });
        }
      }
    }
    this.requestDraw();
  };

  // ---- drawing -------------------------------------------------------------------------------

  private draw(): void {
    const { ctx } = this;
    const st = this.state();
    const { project } = st;
    const site = project.site;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = finishes.get(site.ground).color2d;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawGrid();

    ctx.save();
    ctx.translate(this.origin.x, this.origin.y);
    ctx.scale(this.scale, this.scale);

    // ground areas
    for (const a of site.areas) {
      ctx.fillStyle = finishes.get(a.finish).color2d;
      ctx.fillRect(a.x0, a.y0, a.x1 - a.x0, a.y1 - a.y0);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = this.px(1);
      ctx.strokeRect(a.x0, a.y0, a.x1 - a.x0, a.y1 - a.y0);
    }

    // roads
    const set = roadSet(site);
    for (const [i, j] of site.roads) {
      const p = roadPieces(set, i, j);
      ctx.fillStyle = C.sidewalk;
      for (const [x0, y0, x1, y1] of p.sidewalk) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = C.asphalt;
      // tiny overlap hides hairlines between pieces
      for (const [x0, y0, x1, y1] of p.asphalt) ctx.fillRect(x0 - 0.02, y0 - 0.02, x1 - x0 + 0.04, y1 - y0 + 0.04);
      ctx.fillStyle = C.mark;
      for (const [x0, y0, x1, y1] of p.marks) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }

    // buildings
    for (const b of project.buildings) this.drawBuilding(b, 1);

    // props: flat things first
    const order = (f: FurnitureItem) => (getFurniture(f.catalogId)?.walkable ? 0 : 1);
    for (const f of site.props.slice().sort((a, b) => order(a) - order(b))) this.drawItem(f, 1);
    ctx.restore();

    this.drawLabels(project.buildings);
    this.drawSelection();
    this.drawPreview();
    this.drawScaleBar();
  }

  private drawGrid(): void {
    const { ctx } = this;
    const lines = (step: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = Math.floor(-this.origin.x / this.scale / step) * step;
      const y0 = Math.floor(-this.origin.y / this.scale / step) * step;
      for (let x = x0; x * this.scale + this.origin.x < this.width; x += step) {
        const sx = Math.round(x * this.scale + this.origin.x) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, this.height);
      }
      for (let y = y0; y * this.scale + this.origin.y < this.height; y += step) {
        const sy = Math.round(y * this.scale + this.origin.y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(this.width, sy);
      }
      ctx.stroke();
    };
    if (this.scale >= 3) lines(ROAD_CELL, 'rgba(255,255,255,0.35)');
    else lines(ROAD_CELL * 5, 'rgba(255,255,255,0.35)');
  }

  private drawBuilding(b: Building, alpha: number): void {
    const { ctx } = this;
    const lvl = b.levels[0];
    const graph = getGraph(lvl.walls);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rotation);
    ctx.globalAlpha = alpha;
    const bb = buildingBounds(b);
    if (bb.empty) {
      ctx.setLineDash([0.6, 0.4]);
      ctx.strokeStyle = C.wall;
      ctx.lineWidth = this.px(1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(0, 0, 8, 8);
      ctx.strokeRect(0, 0, 8, 8);
      ctx.setLineDash([]);
    }
    // garden items first, then the house on top
    for (const f of lvl.furniture) {
      if (!roomAt(graph, { x: f.x, y: f.y })) this.drawItem(f, alpha);
    }
    ctx.fillStyle = '#f4efe4';
    for (const room of graph.rooms) {
      ctx.beginPath();
      room.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = C.wall;
    for (const e of graph.edges) {
      ctx.beginPath();
      [e.aNeg, e.pa, e.aPos, e.bPos, e.pb, e.bNeg].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawItem(f: FurnitureItem, alpha: number): void {
    const def = getFurniture(f.catalogId);
    if (!def) return;
    const { ctx } = this;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rotation);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 0.02;
    ctx.lineJoin = 'round';
    const size = itemSize(def, f);
    if (f.mirror) ctx.scale(-1, 1);
    try {
      def.draw2d(ctx, resolveColors(def, f.colors), size);
    } catch {
      ctx.strokeRect(-size.w / 2, -size.d / 2, size.w, size.d);
    }
    ctx.restore();
  }

  private drawLabels(buildings: Building[]): void {
    if (this.scale < 3.5) return;
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 12px system-ui, sans-serif';
    for (const b of buildings) {
      const pts = this.buildingCorners(b);
      const c = this.toScreen({ x: (pts[0].x + pts[2].x) / 2, y: (pts[0].y + pts[2].y) / 2 });
      const text = b.name || 'מבנה';
      const w = ctx.measureText(text).width + 14;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(c.x - w / 2, c.y - 11, w, 22, 7);
      ctx.fill();
      ctx.fillStyle = C.label;
      ctx.fillText(text, c.x, c.y + 0.5);
    }
    ctx.restore();
  }

  private drawSelection(): void {
    const { ctx } = this;
    const st = this.state();
    const sel = st.selection;
    if (!sel) return;
    ctx.save();
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (sel.kind === 'building') {
      const b = st.project.buildings.find((x) => x.id === sel.id);
      if (b) {
        const pts = this.buildingCorners(b).map(this.toScreen);
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
      }
    } else if (sel.kind === 'area') {
      const a = st.project.site.areas.find((x) => x.id === sel.id);
      if (a) {
        const p0 = this.toScreen({ x: a.x0, y: a.y0 });
        const p1 = this.toScreen({ x: a.x1, y: a.y1 });
        ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      }
    } else if (sel.kind === 'prop') {
      const f = st.project.site.props.find((x) => x.id === sel.id);
      const def = f && getFurniture(f.catalogId);
      if (f && def) {
        const c = this.toScreen({ x: f.x, y: f.y });
        ctx.translate(c.x, c.y);
        ctx.rotate(f.rotation);
        const hw = (itemSize(def, f).w / 2) * this.scale + 4;
        const hd = (itemSize(def, f).d / 2) * this.scale + 4;
        ctx.strokeRect(-hw, -hd, hw * 2, hd * 2);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, -hd);
        ctx.lineTo(0, -hd - 14);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -hd - 14, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawPreview(): void {
    const { ctx } = this;
    const st = this.state();
    const tool = st.tool;
    if (this.drag?.kind === 'area' && tool.type === 'area') {
      const a = this.toScreen(this.drag.start);
      const b = this.toScreen({ x: snapTo(this.cursor.x, 0.5), y: snapTo(this.cursor.y, 0.5) });
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = finishes.get(tool.finish).color2d;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.fillStyle = C.label;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const w = Math.abs(this.cursor.x - this.drag.start.x);
      const h = Math.abs(this.cursor.y - this.drag.start.y);
      ctx.fillText(`${w.toFixed(0)} × ${h.toFixed(0)} מ'`, (a.x + b.x) / 2, Math.min(a.y, b.y) - 8);
      ctx.restore();
      return;
    }
    if (!this.cursorOn) return;
    if (tool.type === 'road') {
      const [i, j] = this.cell(this.cursor);
      const p = this.toScreen({ x: i * ROAD_CELL, y: j * ROAD_CELL });
      ctx.save();
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(226,112,58,0.18)';
      ctx.fillRect(p.x, p.y, ROAD_CELL * this.scale, ROAD_CELL * this.scale);
      ctx.strokeRect(p.x, p.y, ROAD_CELL * this.scale, ROAD_CELL * this.scale);
      ctx.restore();
    } else if (tool.type === 'furniture') {
      ctx.save();
      ctx.translate(this.origin.x, this.origin.y);
      ctx.scale(this.scale, this.scale);
      this.drawItem({ id: '__p', catalogId: tool.catalogId, x: snapTo(this.cursor.x, 0.1), y: snapTo(this.cursor.y, 0.1), rotation: this.placeRotation, elevation: 0 }, 0.75);
      ctx.restore();
    } else if (tool.type === 'building') {
      const place = this.buildingPlacement(tool.template, this.cursor);
      if (!place) return;
      ctx.save();
      ctx.translate(this.origin.x, this.origin.y);
      ctx.scale(this.scale, this.scale);
      ctx.translate(place.pos.x, place.pos.y);
      ctx.rotate(place.rotation);
      ctx.fillStyle = 'rgba(226,112,58,0.2)';
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = this.px(2);
      ctx.fillRect(0, 0, place.size.w, place.size.d);
      ctx.strokeRect(0, 0, place.size.w, place.size.d);
      ctx.restore();
    }
  }

  private drawScaleBar(): void {
    const { ctx } = this;
    const meters = this.scale > 20 ? 5 : this.scale > 6 ? 10 : this.scale > 2.5 ? 50 : 100;
    const w = meters * this.scale;
    const x = 16;
    const y = this.height - 18;
    ctx.save();
    ctx.strokeStyle = C.label;
    ctx.fillStyle = C.label;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y - 4);
    ctx.stroke();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${meters} מ'`, x + w / 2, y - 6);
    ctx.restore();
  }
}
