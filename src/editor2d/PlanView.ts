import { getFurniture, resolveColors } from '../catalog';
import { getOpeningDef } from '../catalog/openings';
import { finishes } from '../materials/finishes';
import { add, closestOnSegment, dist, dot, mul, norm, perp, rotate, snapTo, sub } from '../model/geom';
import { getGraph, roomAt, styleOfRoom, type LevelGraph } from '../model/graph';
import type { FurnitureItem, Level, Opening, Vec2, Wall } from '../model/types';
import {
  addFurniture,
  addRoomRect,
  addWalls,
  clampOffset,
  deleteSelection,
  moveNode,
  placeOpening,
  pruneRoomStyles,
  setExterior,
  setRoomStyle,
  snapFurnitureToWall,
  updateFurniture,
  updateOpening,
} from '../store/actions';
import { currentBuilding, currentLevel, useStore, type Selection } from '../store/store';

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'furniture'; id: string; grab: Vec2; moved: boolean }
  | { kind: 'rotate'; id: string; moved: boolean }
  | { kind: 'opening'; id: string; moved: boolean }
  | { kind: 'node'; from: Vec2; moved: boolean }
  | { kind: 'wall'; id: string; start: Vec2; a: Vec2; b: Vec2; moved: boolean }
  | { kind: 'room'; start: Vec2 };

interface SnapResult {
  p: Vec2;
  guides: { a: Vec2; b: Vec2 }[];
  onNode: boolean;
}

const COLORS = {
  paper: '#f6f4ef',
  gridMinor: '#e7e4dc',
  gridMajor: '#d5d1c6',
  wall: '#3d424b',
  wallSel: '#e2703a',
  accent: '#e2703a',
  dim: '#7a7f87',
  label: '#3d424b',
  guide: '#2aa5a0',
};

/** Imperative 2D plan editor drawn on a canvas. */
export class PlanView {
  private ctx: CanvasRenderingContext2D;
  private scale = 60; // px per meter
  private origin = { x: 0, y: 0 }; // screen px of world (0,0)
  private dpr = 1;
  private width = 0;
  private height = 0;
  private drag: Drag | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; cx: number; cy: number } | null = null;
  private cursor: Vec2 = { x: 0, y: 0 };
  private cursorOnCanvas = false;
  private chainStart: Vec2 | null = null; // wall tool: last placed point
  private chainFirst: Vec2 | null = null;
  private snapInfo: SnapResult | null = null;
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
      if (s.tool !== prev.tool) {
        this.chainStart = null;
        this.chainFirst = null;
        this.placeRotation = 0;
      }
      if (s.buildingIndex !== prev.buildingIndex || s.project.id !== prev.project.id) this.fit();
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

  /** Zoom so that the whole plan is visible. */
  fit(): void {
    const lvl = this.level();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (p: Vec2) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    };
    lvl.walls.forEach((w) => {
      grow(w.a);
      grow(w.b);
    });
    lvl.furniture.forEach((f) => grow({ x: f.x, y: f.y }));
    if (minX === Infinity) {
      minX = -6;
      minY = -4;
      maxX = 6;
      maxY = 4;
    }
    const pad = 1.5;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    this.scale = Math.max(12, Math.min(140, Math.min(this.width / w, this.height / h)));
    this.origin.x = this.width / 2 - ((minX + maxX) / 2) * this.scale;
    this.origin.y = this.height / 2 - ((minY + maxY) / 2) * this.scale;
    this.requestDraw();
  }

  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2): void {
    const before = this.toWorld(sx, sy);
    this.scale = Math.max(10, Math.min(260, this.scale * factor));
    this.origin.x = sx - before.x * this.scale;
    this.origin.y = sy - before.y * this.scale;
    this.requestDraw();
  }

  // ---- helpers -------------------------------------------------------------------------------

  private state = () => useStore.getState();
  private level = (): Level => currentLevel(this.state().project, this.state().levelIndex);
  private graph = (): LevelGraph => getGraph(this.level().walls);
  private toWorld = (sx: number, sy: number): Vec2 => ({ x: (sx - this.origin.x) / this.scale, y: (sy - this.origin.y) / this.scale });
  private toScreen = (p: Vec2): Vec2 => ({ x: p.x * this.scale + this.origin.x, y: p.y * this.scale + this.origin.y });
  private px = (n: number) => n / this.scale; // screen px -> meters
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

  private gridStep(): number {
    return this.state().view.snap ? 0.1 : 0.01;
  }

  /** Snap a point for wall drawing / node dragging: nodes > wall lines > axis alignment > grid. */
  private snapPoint(raw: Vec2, opts: { from?: Vec2 | null; ignore?: Vec2 } = {}): SnapResult {
    const lvl = this.level();
    const tol = this.px(12);
    const guides: SnapResult['guides'] = [];
    const nodes: Vec2[] = [];
    for (const w of lvl.walls) {
      for (const p of [w.a, w.b]) {
        if (opts.ignore && dist(p, opts.ignore) < 0.004) continue;
        nodes.push(p);
      }
    }
    if (this.chainFirst && this.state().tool.type === 'wall') nodes.push(this.chainFirst);
    // 1. existing endpoints
    let best: Vec2 | null = null;
    let bestD = tol;
    for (const n of nodes) {
      const d = dist(n, raw);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (best) return { p: { ...best }, guides, onNode: true };

    const step = this.gridStep();
    let p = { x: snapTo(raw.x, step), y: snapTo(raw.y, step) };

    // 2. angle constraint relative to the chain start (0/45/90…)
    if (opts.from) {
      const v = sub(raw, opts.from);
      const ang = Math.atan2(v.y, v.x);
      const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      if (Math.abs(ang - snapped) < (7 * Math.PI) / 180) {
        const l = snapTo(Math.hypot(v.x, v.y), step);
        p = { x: opts.from.x + Math.cos(snapped) * l, y: opts.from.y + Math.sin(snapped) * l };
        // keep axis-aligned results exactly on the axis
        if (Math.abs(Math.cos(snapped)) < 1e-9) p.x = opts.from.x;
        if (Math.abs(Math.sin(snapped)) < 1e-9) p.y = opts.from.y;
      }
    }

    // 3. axis alignment with other endpoints
    let ax: Vec2 | null = null;
    let ay: Vec2 | null = null;
    let dxBest = tol * 0.7;
    let dyBest = tol * 0.7;
    for (const n of nodes) {
      const dx = Math.abs(n.x - raw.x);
      const dy = Math.abs(n.y - raw.y);
      if (dx < dxBest) {
        dxBest = dx;
        ax = n;
      }
      if (dy < dyBest) {
        dyBest = dy;
        ay = n;
      }
    }
    const axisLocked = opts.from && (Math.abs(p.x - opts.from.x) < 1e-9 || Math.abs(p.y - opts.from.y) < 1e-9);
    if (ax && !(axisLocked && opts.from && Math.abs(p.x - opts.from.x) < 1e-9)) {
      p.x = ax.x;
      guides.push({ a: ax, b: p });
    }
    if (ay && !(axisLocked && opts.from && Math.abs(p.y - opts.from.y) < 1e-9)) {
      p.y = ay.y;
      guides.push({ a: ay, b: p });
    }

    // 4. wall lines (T junctions): project onto a nearby wall
    let wallHit: { point: Vec2; d: number } | null = null;
    for (const w of lvl.walls) {
      if (opts.ignore && (dist(w.a, opts.ignore) < 0.004 || dist(w.b, opts.ignore) < 0.004)) continue;
      const c = closestOnSegment(p, w.a, w.b);
      if (c.dist < tol * 0.8 && (!wallHit || c.dist < wallHit.d)) wallHit = { point: c.point, d: c.dist };
    }
    if (wallHit) p = wallHit.point;
    return { p, guides, onNode: false };
  }

  // ---- hit testing ---------------------------------------------------------------------------

  private hitFurniture(p: Vec2): FurnitureItem | null {
    const items = this.level().furniture;
    let best: FurnitureItem | null = null;
    let bestArea = Infinity;
    for (const f of items) {
      const def = getFurniture(f.catalogId);
      if (!def) continue;
      const local = rotate(sub(p, { x: f.x, y: f.y }), -f.rotation);
      const hw = Math.max(def.size.w / 2, this.px(8));
      const hd = Math.max(def.size.d / 2, this.px(8));
      if (Math.abs(local.x) <= hw && Math.abs(local.y) <= hd) {
        const area = def.size.w * def.size.d * (def.walkable ? 100 : 1); // rugs lose against things on them
        if (area < bestArea) {
          bestArea = area;
          best = f;
        }
      }
    }
    return best;
  }

  private hitOpening(p: Vec2): Opening | null {
    const lvl = this.level();
    for (const o of lvl.openings) {
      const w = lvl.walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const d = norm(sub(w.b, w.a));
      const center = add(w.a, mul(d, o.offset));
      const rel = sub(p, center);
      const along = dot(rel, d);
      const across = dot(rel, perp(d));
      if (Math.abs(along) <= o.width / 2 && Math.abs(across) <= Math.max(w.thickness / 2 + 0.1, this.px(8))) return o;
    }
    return null;
  }

  private hitWall(p: Vec2): { wall: Wall; t: number; dist: number } | null {
    let best: { wall: Wall; t: number; dist: number } | null = null;
    for (const w of this.level().walls) {
      const c = closestOnSegment(p, w.a, w.b);
      const tol = Math.max(w.thickness / 2, this.px(7));
      if (c.dist <= tol && (!best || c.dist < best.dist)) best = { wall: w, t: c.t, dist: c.dist };
    }
    return best;
  }

  private hitNode(p: Vec2): Vec2 | null {
    const tol = this.px(9);
    for (const w of this.level().walls) {
      for (const n of [w.a, w.b]) if (dist(n, p) < tol) return n;
    }
    return null;
  }

  private rotateHandlePos(f: FurnitureItem): Vec2 | null {
    const def = getFurniture(f.catalogId);
    if (!def) return null;
    return add({ x: f.x, y: f.y }, rotate({ x: 0, y: -def.size.d / 2 - this.px(22) }, f.rotation));
  }

  // ---- events --------------------------------------------------------------------------------

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    if (this.chainStart) {
      this.chainStart = null;
      this.chainFirst = null;
      this.requestDraw();
    } else if (this.state().tool.type !== 'select') {
      this.state().setTool({ type: 'select' });
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.state().mode !== 'plan') return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') {
      this.spaceDown = true;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (this.chainStart) {
        this.chainStart = null;
        this.chainFirst = null;
      } else {
        this.state().setTool({ type: 'select' });
        this.state().select(null);
      }
      this.requestDraw();
    } else if (e.key.toLowerCase() === 'r' || e.key === 'ר') {
      const step = e.shiftKey ? Math.PI / 12 : Math.PI / 2;
      const tool = this.state().tool;
      const sel = this.state().selection;
      if (tool.type === 'furniture') {
        this.placeRotation += step;
        this.requestDraw();
      } else if (sel?.kind === 'furniture') {
        const f = this.level().furniture.find((x) => x.id === sel.id);
        if (f) updateFurniture(f.id, { rotation: f.rotation + step });
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') this.spaceDown = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const { x, y } = this.eventPos(e);
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), x, y);
    } else {
      this.origin.x -= e.deltaX;
      this.requestDraw();
    }
  };

  private onDblClick = (): void => {
    if (this.state().tool.type === 'wall') {
      this.chainStart = null;
      this.chainFirst = null;
      this.requestDraw();
    }
  };

  private onPointerLeave = (): void => {
    this.cursorOnCanvas = false;
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
    this.cursorOnCanvas = true;
    const st = this.state();
    const tool = st.tool;

    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      this.drag = { kind: 'pan', lastX: pos.x, lastY: pos.y };
      return;
    }

    switch (tool.type) {
      case 'select': {
        const sel = st.selection;
        // rotation handle of the selected furniture
        if (sel?.kind === 'furniture') {
          const f = this.level().furniture.find((x) => x.id === sel.id);
          const h = f && this.rotateHandlePos(f);
          if (f && h && dist(h, world) < this.px(12)) {
            this.drag = { kind: 'rotate', id: f.id, moved: false };
            return;
          }
        }
        // endpoints of the selected wall
        if (sel?.kind === 'wall') {
          const node = this.hitNode(world);
          const w = this.level().walls.find((x) => x.id === sel.id);
          if (node && w && (dist(node, w.a) < 0.004 || dist(node, w.b) < 0.004)) {
            this.drag = { kind: 'node', from: { ...node }, moved: false };
            return;
          }
        }
        const f = this.hitFurniture(world);
        const o = this.hitOpening(world);
        const wallHit = this.hitWall(world);
        // prefer openings, then non-rug furniture, then walls, then rugs
        const fDef = f && getFurniture(f.catalogId);
        if (o) {
          st.select({ kind: 'opening', id: o.id });
          this.drag = { kind: 'opening', id: o.id, moved: false };
        } else if (f && !(fDef?.walkable && wallHit)) {
          st.select({ kind: 'furniture', id: f.id });
          this.drag = { kind: 'furniture', id: f.id, grab: sub(world, { x: f.x, y: f.y }), moved: false };
        } else if (wallHit) {
          const node = this.hitNode(world);
          st.select({ kind: 'wall', id: wallHit.wall.id });
          if (node) this.drag = { kind: 'node', from: { ...node }, moved: false };
          else this.drag = { kind: 'wall', id: wallHit.wall.id, start: world, a: { ...wallHit.wall.a }, b: { ...wallHit.wall.b }, moved: false };
        } else {
          const room = roomAt(this.graph(), world);
          st.select(room ? { kind: 'room', point: { ...room.labelPoint } } : null);
          this.drag = { kind: 'pan', lastX: pos.x, lastY: pos.y };
        }
        break;
      }
      case 'wall': {
        const snap = this.snapPoint(world, { from: this.chainStart });
        if (!this.chainStart) {
          this.chainStart = snap.p;
          this.chainFirst = snap.p;
        } else if (dist(snap.p, this.chainStart) > 0.05) {
          addWalls([[this.chainStart, snap.p]], st.wallThickness);
          const closed = this.chainFirst && dist(snap.p, this.chainFirst) < 0.004;
          // stop the chain when closing the loop or when landing on an existing wall/node
          if (closed || snap.onNode) {
            this.chainStart = null;
            this.chainFirst = null;
          } else {
            this.chainStart = snap.p;
          }
        }
        break;
      }
      case 'room': {
        const snap = this.snapPoint(world);
        this.drag = { kind: 'room', start: snap.p };
        break;
      }
      case 'opening': {
        const hit = this.openingPlacement(world);
        if (hit) {
          const id = placeOpening(hit.wall, tool.style, hit.offset);
          st.setTool({ type: 'select' });
          st.select({ kind: 'opening', id });
        }
        break;
      }
      case 'furniture': {
        const placed = this.furniturePlacement(world, tool.catalogId, this.placeRotation);
        const id = addFurniture(tool.catalogId, placed.pos, placed.rotation);
        st.setTool({ type: 'select' });
        if (id) st.select({ kind: 'furniture', id });
        break;
      }
      case 'paint': {
        if (tool.target === 'exterior') {
          setExterior(tool.finish);
        } else {
          const room = roomAt(this.graph(), world);
          if (room) setRoomStyle(world, tool.target === 'floor' ? { floor: tool.finish } : { wall: tool.finish });
          else if (tool.target === 'wall' && this.hitWall(world)) setExterior(tool.finish);
        }
        break;
      }
      case 'erase': {
        const f = this.hitFurniture(world);
        const o = this.hitOpening(world);
        const w = this.hitWall(world);
        const target: Selection | null = o
          ? { kind: 'opening', id: o.id }
          : f
            ? { kind: 'furniture', id: f.id }
            : w
              ? { kind: 'wall', id: w.wall.id }
              : null;
        if (target) {
          deleteSelection(target);
          pruneRoomStyles();
        }
        break;
      }
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
    this.cursorOnCanvas = true;
    const st = this.state();
    const drag = this.drag;
    if (drag) {
      switch (drag.kind) {
        case 'pan':
          this.origin.x += pos.x - drag.lastX;
          this.origin.y += pos.y - drag.lastY;
          drag.lastX = pos.x;
          drag.lastY = pos.y;
          break;
        case 'furniture': {
          const f = this.level().furniture.find((x) => x.id === drag.id);
          if (!f) break;
          if (!drag.moved) {
            if (dist(sub(world, drag.grab), { x: f.x, y: f.y }) < this.px(3)) break;
            st.checkpoint();
            drag.moved = true;
          }
          const placed = this.furniturePlacement(sub(world, drag.grab), f.catalogId, f.rotation, e.altKey);
          updateFurniture(f.id, { x: placed.pos.x, y: placed.pos.y, rotation: placed.rotation }, true);
          break;
        }
        case 'rotate': {
          const f = this.level().furniture.find((x) => x.id === drag.id);
          if (!f) break;
          if (!drag.moved) {
            st.checkpoint();
            drag.moved = true;
          }
          let ang = Math.atan2(world.y - f.y, world.x - f.x) + Math.PI / 2;
          if (!e.altKey) ang = snapTo(ang, Math.PI / 12);
          updateFurniture(f.id, { rotation: ang }, true);
          break;
        }
        case 'opening': {
          const lvl = this.level();
          const o = lvl.openings.find((x) => x.id === drag.id);
          if (!o) break;
          if (!drag.moved) {
            st.checkpoint();
            drag.moved = true;
          }
          // allow moving to another wall
          const hit = this.openingPlacement(world, o.width);
          if (hit) updateOpening(o.id, { wallId: hit.wall.id, offset: hit.offset }, true);
          break;
        }
        case 'node': {
          const snap = this.snapPoint(world, { ignore: drag.from });
          if (dist(snap.p, drag.from) < 0.004) break;
          if (!drag.moved) {
            st.checkpoint();
            drag.moved = true;
          }
          this.snapInfo = snap;
          moveNode(drag.from, snap.p, true);
          drag.from = { ...snap.p };
          break;
        }
        case 'wall': {
          const step = this.gridStep();
          const w = this.level().walls.find((x) => x.id === drag.id);
          if (!w) break;
          // move perpendicular to the wall only (keeps neighbours tidy)
          const n = perp(norm(sub(drag.b, drag.a)));
          const amount = snapTo(dot(sub(world, drag.start), n), step);
          const delta = mul(n, amount);
          const na = add(drag.a, delta);
          const nb = add(drag.b, delta);
          if (dist(na, w.a) < 0.004) break;
          if (!drag.moved) {
            st.checkpoint();
            drag.moved = true;
          }
          moveNode(w.a, na, true);
          const w2 = this.level().walls.find((x) => x.id === drag.id)!;
          moveNode(w2.b, nb, true);
          break;
        }
        case 'room':
          this.snapInfo = this.snapPoint(world);
          break;
      }
      this.requestDraw();
      return;
    }
    // hover feedback
    const tool = st.tool;
    if (tool.type === 'wall') this.snapInfo = this.snapPoint(world, { from: this.chainStart });
    else if (tool.type === 'room') this.snapInfo = this.snapPoint(world);
    else this.snapInfo = null;
    this.updateCursor(world);
    this.requestDraw();
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    if (drag.kind === 'room') {
      const end = this.snapPoint(this.cursor).p;
      addRoomRect(drag.start, end, this.state().wallThickness);
    }
    if ((drag.kind === 'node' || drag.kind === 'wall') && drag.moved) pruneRoomStyles();
    this.snapInfo = null;
    this.requestDraw();
  };

  private updateCursor(world: Vec2): void {
    const tool = this.state().tool;
    let cursor = 'default';
    if (this.spaceDown) cursor = 'grab';
    else if (tool.type === 'select') {
      if (this.hitFurniture(world) || this.hitOpening(world)) cursor = 'move';
      else if (this.hitWall(world)) cursor = 'pointer';
    } else if (tool.type === 'erase') cursor = 'not-allowed';
    else cursor = 'crosshair';
    this.canvas.style.cursor = cursor;
  }

  /** Where an opening would land for a cursor position: nearest wall within reach. */
  private openingPlacement(world: Vec2, width?: number): { wall: Wall; offset: number } | null {
    let best: { wall: Wall; offset: number; d: number } | null = null;
    for (const w of this.level().walls) {
      const c = closestOnSegment(world, w.a, w.b);
      const reach = Math.max(0.6, this.px(30));
      if (c.dist > reach) continue;
      const L = dist(w.a, w.b);
      if (L < 0.6) continue;
      if (!best || c.dist < best.d) {
        const tool = this.state().tool;
        const wdt = width ?? (tool.type === 'opening' ? getOpeningDef(tool.style).width : 0.9);
        const step = this.state().view.snap ? 0.05 : 0.01;
        best = { wall: w, offset: clampOffset(snapTo(c.t * L, step), Math.min(wdt, L - 0.2), L), d: c.dist };
      }
    }
    return best;
  }

  private furniturePlacement(world: Vec2, catalogId: string, rotation: number, free = false): { pos: Vec2; rotation: number } {
    const def = getFurniture(catalogId);
    const snapOn = this.state().view.snap && !free;
    if (def && snapOn && !def.walkable && !def.stair && def.mount !== 'ceiling') {
      const s = snapFurnitureToWall(world, def.size, this.level().walls, def.mount === 'wall' ? 1.0 : 0.22);
      if (s) {
        // slide along the wall on a 5 cm grid
        return s;
      }
    }
    const step = snapOn ? 0.05 : 0.01;
    return { pos: { x: snapTo(world.x, step), y: snapTo(world.y, step) }, rotation };
  }

  // ---- drawing -------------------------------------------------------------------------------

  private draw(): void {
    const { ctx } = this;
    const st = this.state();
    const lvl = this.level();
    const graph = this.graph();
    const building = currentBuilding(st.project);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawGrid();

    ctx.save();
    ctx.translate(this.origin.x, this.origin.y);
    ctx.scale(this.scale, this.scale);

    // the level below, as a faint guide
    const below = st.levelIndex > 0 ? building.levels[st.levelIndex - 1] : null;
    if (below) {
      ctx.fillStyle = '#dcd8cf';
      for (const e of getGraph(below.walls).edges) {
        ctx.beginPath();
        this.tracePolygon([e.aNeg, e.pa, e.aPos, e.bPos, e.pb, e.bNeg]);
        ctx.fill();
      }
    }

    // rooms
    for (const room of graph.rooms) {
      const style = styleOfRoom(graph, room, lvl.roomStyles);
      const floorId = style?.floor ?? building.defaultFloor;
      ctx.beginPath();
      this.tracePolygon(room.polygon);
      for (const h of room.holes) this.tracePolygon(h);
      ctx.fillStyle = finishes.get(floorId).color2d;
      ctx.globalAlpha = 0.55;
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
      const sel = st.selection;
      if (sel?.kind === 'room' && roomAt(graph, sel.point)?.index === room.index) {
        ctx.fillStyle = 'rgba(226,112,58,0.14)';
        ctx.fill('evenodd');
      }
    }

    // stair openings arriving from the level below
    if (below) {
      for (const f of below.furniture) {
        const def = getFurniture(f.catalogId);
        if (!def?.stair) continue;
        this.drawFurniture(f, 0.45);
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rotation);
        ctx.setLineDash([0.18, 0.12]);
        ctx.lineWidth = 0.035;
        ctx.strokeStyle = COLORS.accent;
        ctx.strokeRect(-def.size.w / 2, -def.size.d / 2, def.size.w, def.size.d);
        ctx.restore();
      }
    }

    // furniture: rugs first, then floor items, then wall/ceiling items
    const order = (f: FurnitureItem) => {
      const d = getFurniture(f.catalogId);
      return d?.walkable ? 0 : d?.mount === 'ceiling' ? 3 : d?.mount === 'wall' ? 2 : 1;
    };
    const items = lvl.furniture.slice().sort((a, b) => order(a) - order(b));
    for (const f of items) this.drawFurniture(f, 1);

    // walls
    ctx.fillStyle = COLORS.wall;
    for (const e of graph.edges) {
      ctx.beginPath();
      this.tracePolygon([e.aNeg, e.pa, e.aPos, e.bPos, e.pb, e.bNeg]);
      ctx.fill();
    }
    const sel = st.selection;
    if (sel?.kind === 'wall') {
      ctx.fillStyle = COLORS.wallSel;
      for (const e of graph.edges) {
        if (e.wallId !== sel.id) continue;
        ctx.beginPath();
        this.tracePolygon([e.aNeg, e.pa, e.aPos, e.bPos, e.pb, e.bNeg]);
        ctx.fill();
      }
    }

    // openings
    for (const o of lvl.openings) this.drawOpening(o, lvl, sel?.kind === 'opening' && sel.id === o.id);

    ctx.restore();

    // screen-space overlays
    this.drawRoomLabels(graph, lvl);
    if (st.view.showDimensions) this.drawWallDimensions(lvl);
    this.drawSelectionOverlay(lvl);
    this.drawToolPreview(lvl);
    this.drawScaleBar();
  }

  private tracePolygon(pts: Vec2[]): void {
    const { ctx } = this;
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }

  private drawGrid(): void {
    const { ctx } = this;
    const minor = this.scale >= 45 ? 0.5 : 1;
    const drawLines = (step: number, color: string, lw: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
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
    if (this.scale >= 22) drawLines(minor, COLORS.gridMinor, 1);
    drawLines(this.scale >= 22 ? minor * (minor === 0.5 ? 2 : 5) : 5, COLORS.gridMajor, 1);
  }

  private drawFurniture(f: FurnitureItem, alpha: number): void {
    const def = getFurniture(f.catalogId);
    if (!def) return;
    const { ctx } = this;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rotation);
    ctx.globalAlpha = alpha * (def.mount === 'ceiling' ? 0.55 : 1);
    ctx.lineWidth = 0.02;
    ctx.lineJoin = 'round';
    try {
      def.draw2d(ctx, resolveColors(def, f.colors));
    } catch {
      ctx.strokeStyle = '#555';
      ctx.strokeRect(-def.size.w / 2, -def.size.d / 2, def.size.w, def.size.d);
    }
    ctx.restore();
  }

  private drawOpening(o: Opening, lvl: Level, selected: boolean): void {
    const w = lvl.walls.find((x) => x.id === o.wallId);
    if (!w) return;
    const { ctx } = this;
    const d = norm(sub(w.b, w.a));
    const c = add(w.a, mul(d, o.offset));
    const def = getOpeningDef(o.style, o.type);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(Math.atan2(d.y, d.x));
    // cut the wall
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(-o.width / 2, -w.thickness / 2 - 0.01, o.width, w.thickness + 0.02);
    def.draw2d(ctx, o, w.thickness);
    if (selected) {
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = this.px(2);
      ctx.strokeRect(-o.width / 2 - 0.03, -w.thickness / 2 - 0.03, o.width + 0.06, w.thickness + 0.06);
    }
    ctx.restore();
  }

  private drawRoomLabels(graph: LevelGraph, lvl: Level): void {
    const { ctx } = this;
    if (this.scale < 18) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const room of graph.rooms) {
      const style = styleOfRoom(graph, room, lvl.roomStyles);
      const s = this.toScreen(room.labelPoint);
      const name = style?.name ?? 'חדר';
      ctx.font = '600 13px system-ui, sans-serif';
      const areaText = `${room.area.toFixed(1)} מ"ר`;
      const wName = ctx.measureText(name).width;
      ctx.font = '11px system-ui, sans-serif';
      const wArea = ctx.measureText(areaText).width;
      const bw = Math.max(wName, wArea) + 14;
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      this.roundRect(s.x - bw / 2, s.y - 18, bw, 36, 7);
      ctx.fill();
      ctx.fillStyle = COLORS.label;
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(name, s.x, s.y - 7);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(areaText, s.x, s.y + 9);
    }
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private dimensionLabel(a: Vec2, b: Vec2, offsetPx: number, color: string, bold = false): void {
    const { ctx } = this;
    const L = dist(a, b);
    if (L * this.scale < 34) return;
    const sa = this.toScreen(a);
    const sb = this.toScreen(b);
    const d = norm(sub(sb, sa));
    const n = perp(d);
    const mid = { x: (sa.x + sb.x) / 2 + n.x * offsetPx, y: (sa.y + sb.y) / 2 + n.y * offsetPx };
    let ang = Math.atan2(d.y, d.x);
    if (ang > Math.PI / 2 + 0.01 || ang < -Math.PI / 2 - 0.01) ang += Math.PI;
    ctx.save();
    ctx.translate(mid.x, mid.y);
    ctx.rotate(ang);
    ctx.font = `${bold ? '600 ' : ''}11px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = L.toFixed(2);
    const tw = ctx.measureText(text).width + 6;
    ctx.fillStyle = 'rgba(246,244,239,0.85)';
    ctx.fillRect(-tw / 2, -7, tw, 14);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0.5);
    ctx.restore();
  }

  private drawWallDimensions(lvl: Level): void {
    if (this.scale < 30) return;
    for (const w of lvl.walls) {
      this.dimensionLabel(w.a, w.b, -(w.thickness / 2) * this.scale - 11, COLORS.dim);
    }
  }

  private drawSelectionOverlay(lvl: Level): void {
    const { ctx } = this;
    const sel = this.state().selection;
    if (!sel) return;
    if (sel.kind === 'furniture') {
      const f = lvl.furniture.find((x) => x.id === sel.id);
      const def = f && getFurniture(f.catalogId);
      if (!f || !def) return;
      const c = this.toScreen({ x: f.x, y: f.y });
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(f.rotation);
      const hw = (def.size.w / 2) * this.scale + 4;
      const hd = (def.size.d / 2) * this.scale + 4;
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(-hw, -hd, hw * 2, hd * 2);
      ctx.setLineDash([]);
      // rotate handle
      ctx.beginPath();
      ctx.moveTo(0, -hd);
      ctx.lineTo(0, -hd - 18 + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -hd - 18 + 4, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (sel.kind === 'wall') {
      const w = lvl.walls.find((x) => x.id === sel.id);
      if (!w) return;
      for (const p of [w.a, w.b]) {
        const s = this.toScreen(p);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      this.dimensionLabel(w.a, w.b, (w.thickness / 2) * this.scale + 12, COLORS.accent, true);
    }
  }

  private drawToolPreview(lvl: Level): void {
    const { ctx } = this;
    const st = this.state();
    const tool = st.tool;
    const snap = this.snapInfo;

    const drawGuides = () => {
      if (!snap) return;
      ctx.save();
      ctx.strokeStyle = COLORS.guide;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (const g of snap.guides) {
        const a = this.toScreen(g.a);
        const b = this.toScreen(g.b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    };
    const dot2 = (p: Vec2, filled: boolean) => {
      const s = this.toScreen(p);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = filled ? COLORS.accent : '#fff';
      ctx.fill();
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    if (this.drag?.kind === 'room' && snap) {
      const a = this.toScreen(this.drag.start);
      const b = this.toScreen(snap.p);
      ctx.save();
      ctx.fillStyle = 'rgba(226,112,58,0.12)';
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = st.wallThickness * this.scale;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.restore();
      const s = this.drag.start;
      this.dimensionLabel(s, { x: snap.p.x, y: s.y }, -16, COLORS.accent, true);
      this.dimensionLabel(s, { x: s.x, y: snap.p.y }, 16, COLORS.accent, true);
      drawGuides();
      return;
    }
    if (this.drag?.kind === 'node') drawGuides();
    if (!this.cursorOnCanvas) return;

    if (tool.type === 'wall' && snap) {
      drawGuides();
      if (this.chainStart) {
        const a = this.toScreen(this.chainStart);
        const b = this.toScreen(snap.p);
        ctx.save();
        ctx.strokeStyle = COLORS.accent;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = st.wallThickness * this.scale;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
        this.dimensionLabel(this.chainStart, snap.p, -(st.wallThickness / 2) * this.scale - 14, COLORS.accent, true);
        dot2(this.chainStart, true);
      }
      dot2(snap.p, snap.onNode);
    } else if (tool.type === 'room' && snap) {
      drawGuides();
      dot2(snap.p, snap.onNode);
    } else if (tool.type === 'opening') {
      const hit = this.openingPlacement(this.cursor);
      if (hit) {
        const def = getOpeningDef(tool.style);
        const L = dist(hit.wall.a, hit.wall.b);
        const preview: Opening = {
          id: '__preview',
          wallId: hit.wall.id,
          type: def.type,
          style: def.id,
          offset: hit.offset,
          width: Math.min(def.width, L - 0.2),
          height: def.height,
          sill: def.sill,
        };
        ctx.save();
        ctx.translate(this.origin.x, this.origin.y);
        ctx.scale(this.scale, this.scale);
        ctx.globalAlpha = 0.85;
        this.drawOpening(preview, lvl, true);
        ctx.restore();
        // distances to the wall ends
        const d = norm(sub(hit.wall.b, hit.wall.a));
        const p0 = add(hit.wall.a, mul(d, hit.offset - preview.width / 2));
        const p1 = add(hit.wall.a, mul(d, hit.offset + preview.width / 2));
        this.dimensionLabel(hit.wall.a, p0, 18, COLORS.accent);
        this.dimensionLabel(p1, hit.wall.b, 18, COLORS.accent);
      }
    } else if (tool.type === 'furniture') {
      const placed = this.furniturePlacement(this.cursor, tool.catalogId, this.placeRotation);
      ctx.save();
      ctx.translate(this.origin.x, this.origin.y);
      ctx.scale(this.scale, this.scale);
      this.drawFurniture({ id: '__preview', catalogId: tool.catalogId, x: placed.pos.x, y: placed.pos.y, rotation: placed.rotation, elevation: 0 }, 0.75);
      ctx.restore();
    }
  }

  private drawScaleBar(): void {
    const { ctx } = this;
    const meters = this.scale > 80 ? 1 : this.scale > 30 ? 2 : 5;
    const w = meters * this.scale;
    const x = 16;
    const y = this.height - 18;
    ctx.save();
    ctx.strokeStyle = COLORS.label;
    ctx.fillStyle = COLORS.label;
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
