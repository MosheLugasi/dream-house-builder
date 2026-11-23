/**
 * Catalog preview (2D plan symbols contact sheet).
 *   /tools/catalog-preview/plan.html?cat=living&tile=260x230
 * Each tile shows the symbol at a common scale per tile (fit), with the declared footprint dashed in red.
 * `?scale=60` forces a fixed px/m scale so relative sizes can be compared.
 */
import { FURNITURE, resolveColors } from '/src/catalog/index.ts';
import { CATEGORY_LABELS } from '/src/catalog/types.ts';

const q = new URLSearchParams(location.search);
const cat = q.get('cat');
const ids = q.get('id')?.split(',');
const [tw, th] = (q.get('tile') ?? '250x230').split('x').map(Number);
const fixed = q.get('scale') ? Number(q.get('scale')) : null;
const items = FURNITURE.filter((f) => (!cat || f.category === cat) && (!ids || ids.includes(f.id)));

const nav = document.getElementById('nav')!;
nav.innerHTML =
  `<b>2D</b> <a href="?">all</a> ` +
  Object.keys(CATEGORY_LABELS)
    .map((c) => `<a href="?cat=${c}">${c}</a>`)
    .join(' ') +
  ` <a href="index.html">← 3D</a> <span>${items.length} items</span>`;

const sheet = document.getElementById('sheet') as HTMLCanvasElement;
const cols = Number(q.get('cols') ?? 6);
const rows = Math.ceil(items.length / cols);
const dpr = 2;
sheet.width = cols * tw * dpr;
sheet.height = Math.max(1, rows) * th * dpr;
sheet.style.width = `${cols * tw}px`;
sheet.style.height = `${rows * th}px`;
const ctx = sheet.getContext('2d')!;
ctx.scale(dpr, dpr);
ctx.fillStyle = '#fbfaf7';
ctx.fillRect(0, 0, cols * tw, rows * th);

const errors: string[] = [];
items.forEach((def, i) => {
  const x = (i % cols) * tw;
  const y = Math.floor(i / cols) * th;
  const pad = 16;
  const availW = tw - pad * 2;
  const availH = th - pad * 2 - 30;
  const s = fixed ?? Math.min(availW / def.size.w, availH / def.size.d, 420);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, tw, th);
  ctx.clip();
  ctx.translate(x + tw / 2, y + pad + availH / 2);
  ctx.scale(s, s);
  // sentinel state that draw2d must not leak / depend on
  ctx.lineWidth = 0.25;
  ctx.strokeStyle = '#ff00ff';
  ctx.fillStyle = '#ff00ff';
  try {
    def.draw2d(ctx, resolveColors(def));
  } catch (e) {
    errors.push(`${def.id}: ${String(e)}`);
    console.error(def.id, e);
  }
  if (ctx.lineWidth !== 0.25 || ctx.strokeStyle !== '#ff00ff' || ctx.fillStyle !== '#ff00ff') errors.push(`${def.id}: leaked canvas state`);
  ctx.setLineDash([0.04, 0.04]);
  ctx.lineWidth = 1 / s;
  ctx.strokeStyle = 'rgba(220,40,40,0.55)';
  ctx.strokeRect(-def.size.w / 2, -def.size.d / 2, def.size.w, def.size.d);
  ctx.restore();
  ctx.fillStyle = '#1d1f23';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(def.id, x + 8, y + th - 22);
  ctx.textAlign = 'right';
  ctx.fillText(def.name, x + tw - 8, y + th - 22);
  ctx.textAlign = 'left';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#6a6f76';
  ctx.fillText(`${def.size.w}×${def.size.d} m${def.mount && def.mount !== 'floor' ? ' · ' + def.mount : ''}`, x + 8, y + th - 8);
  ctx.strokeStyle = '#dedad2';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
});

declare global {
  interface Window {
    __errors: unknown;
    __ready: boolean;
  }
}
window.__errors = errors;
window.__ready = true;
