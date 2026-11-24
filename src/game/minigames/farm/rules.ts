/**
 * Rules of "החווה שלי" – pure and testable: crops and how they grow, the state of one bed, customer
 * orders, prices, tips and the farm's day.
 */

export type CropId = 'lettuce' | 'carrot' | 'strawberry' | 'tomato' | 'cucumber' | 'sunflower';
export type ProductId = CropId | 'lemon' | 'egg';

export interface ProductDef {
  id: ProductId;
  /** singular / plural Hebrew names */
  one: string;
  many: string;
  icon: string;
  price: number;
}

export interface CropDef extends ProductDef {
  id: CropId;
  /** seconds of (watered, weed-free) growth from seed to ripe */
  grow: number;
  /** how many you pick from a bed */
  yield: number;
  /** key that selects its seeds */
  key: string;
}

export const CROPS: CropDef[] = [
  { id: 'lettuce', one: 'חסה', many: 'חסות', icon: '🥬', price: 22, grow: 16, yield: 2, key: '1' },
  { id: 'carrot', one: 'גזר', many: 'גזרים', icon: '🥕', price: 12, grow: 19, yield: 4, key: '2' },
  { id: 'strawberry', one: 'תות', many: 'תותים', icon: '🍓', price: 12, grow: 23, yield: 5, key: '3' },
  { id: 'tomato', one: 'עגבנייה', many: 'עגבניות', icon: '🍅', price: 14, grow: 26, yield: 5, key: '4' },
  { id: 'cucumber', one: 'מלפפון', many: 'מלפפונים', icon: '🥒', price: 15, grow: 24, yield: 4, key: '5' },
  { id: 'sunflower', one: 'חמנייה', many: 'חמניות', icon: '🌻', price: 45, grow: 32, yield: 1, key: '6' },
];

export const EXTRA: ProductDef[] = [
  { id: 'lemon', one: 'לימון', many: 'לימונים', icon: '🍋', price: 10 },
  { id: 'egg', one: 'ביצה', many: 'ביצים', icon: '🥚', price: 9 },
];

export const PRODUCTS: ProductDef[] = [...CROPS, ...EXTRA];
export const product = (id: ProductId): ProductDef => PRODUCTS.find((p) => p.id === id)!;
export const crop = (id: CropId): CropDef => CROPS.find((c) => c.id === id)!;

/** how long a 'round' of the farm lasts, and the clock it shows */
export const DAY_SECONDS = 180;
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 18.5;
export const dayHour = (t: number): number => DAY_START_HOUR + (DAY_END_HOUR - DAY_START_HOUR) * Math.min(1, Math.max(0, t / DAY_SECONDS));

/* ------------------------------------------------------------------ beds */

/** watering keeps a bed wet for this long */
export const WET_SECONDS = 22;
/** ripe crops spoil after this long on the plant */
export const SPOIL_SECONDS = 45;
/** waterings in a full can */
export const CAN_CAPACITY = 5;

export interface BedState {
  crop: CropId | null;
  /** 0 seed … 1 ripe */
  progress: number;
  /** 0 dry … 1 just watered */
  moisture: number;
  weed: boolean;
  /** seconds since it ripened */
  ripeFor: number;
  spoiled: boolean;
}

export const emptyBed = (): BedState => ({ crop: null, progress: 0, moisture: 0, weed: false, ripeFor: 0, spoiled: false });

/** 0 seeds, 1 sprouts, 2 leaves, 3 flowers, 4 ripe */
export function stageOf(b: BedState): number {
  if (!b.crop) return -1;
  return b.progress >= 1 ? 4 : Math.min(3, Math.floor(b.progress * 4));
}

/** progress inside the current stage, 0..1 (plants swell within a stage) */
export function stageFraction(b: BedState): number {
  if (!b.crop || b.progress >= 1) return 1;
  return b.progress * 4 - Math.floor(b.progress * 4);
}

export function stepBed(b: BedState, dt: number): void {
  b.moisture = Math.max(0, b.moisture - dt / WET_SECONDS);
  if (!b.crop || b.spoiled) return;
  if (b.progress >= 1) {
    b.ripeFor += dt;
    if (b.ripeFor >= SPOIL_SECONDS) b.spoiled = true;
    return;
  }
  if (b.moisture <= 0) return;
  const rate = (1 / crop(b.crop).grow) * (b.weed ? 0.4 : 1);
  b.progress = Math.min(1, b.progress + rate * dt);
}

export function plant(b: BedState, c: CropId): boolean {
  if (b.crop) return false;
  const wet = b.moisture;
  Object.assign(b, emptyBed(), { crop: c, moisture: wet });
  return true;
}

export function water(b: BedState): void {
  b.moisture = 1;
}

/** pick a ripe bed (or clear a spoiled one): returns what goes into the basket */
export function harvest(b: BedState): { crop: CropId; count: number } | null {
  if (!b.crop) return null;
  if (b.spoiled) {
    const c = b.crop;
    Object.assign(b, emptyBed(), { moisture: b.moisture });
    return { crop: c, count: 0 };
  }
  if (b.progress < 1) return null;
  const c = b.crop;
  Object.assign(b, emptyBed(), { moisture: b.moisture });
  return { crop: c, count: crop(c).yield };
}

/** a crow pecked at it: back one stage (ripe fruit gets eaten too) */
export function peck(b: BedState): void {
  if (!b.crop || b.spoiled) return;
  b.progress = Math.max(0, b.progress - 0.26);
  b.ripeFor = 0;
}

/* ------------------------------------------------------------------ basket and orders */

export type Basket = Partial<Record<ProductId, number>>;

export interface Order {
  items: Basket;
  /** seconds the customer waits */
  patience: number;
}

export const basketCount = (b: Basket): number => Object.values(b).reduce((s, n) => s + (n ?? 0), 0);

export function canFill(basket: Basket, order: Order): boolean {
  return (Object.keys(order.items) as ProductId[]).every((k) => (basket[k] ?? 0) >= (order.items[k] ?? 0));
}

/** what is still missing for an order */
export function missing(basket: Basket, order: Order): Basket {
  const out: Basket = {};
  for (const k of Object.keys(order.items) as ProductId[]) {
    const need = (order.items[k] ?? 0) - (basket[k] ?? 0);
    if (need > 0) out[k] = need;
  }
  return out;
}

export function takeOrder(basket: Basket, order: Order): void {
  for (const k of Object.keys(order.items) as ProductId[]) basket[k] = (basket[k] ?? 0) - (order.items[k] ?? 0);
}

export const orderValue = (order: Order): number => (Object.keys(order.items) as ProductId[]).reduce((s, k) => s + product(k).price * (order.items[k] ?? 0), 0);

/** tip for a quick service: up to half the price when served at once */
export const tipFor = (value: number, patienceLeft: number): number => Math.round(value * 0.5 * Math.max(0, Math.min(1, patienceLeft)));

/** "2 עגבניות ותות" */
export function itemsText(items: Basket): string {
  const parts = (Object.keys(items) as ProductId[])
    .filter((k) => (items[k] ?? 0) > 0)
    .map((k) => {
      const n = items[k]!;
      const p = product(k);
      return n === 1 ? p.one : `${n} ${p.many}`;
    });
  if (parts.length <= 1) return parts[0] ?? '';
  const last = parts.pop()!;
  return `${parts.join(', ')} ${/^\d/.test(last) ? 'ו־' : 'ו'}${last}`;
}

export const itemsIcons = (items: Basket): string =>
  (Object.keys(items) as ProductId[])
    .filter((k) => (items[k] ?? 0) > 0)
    .map((k) => `${items[k]}${product(k).icon}`)
    .join(' ');

/**
 * A new customer's order. `available` = products the farm can make right now (what is planted, in
 * the basket, on the trees…); orders are mostly drawn from those so they are always achievable.
 * `level` 0..1 grows through the day: bigger orders, a bit less patience.
 */
export function makeOrder(random: () => number, available: ProductId[], level: number): Order {
  // duplicates in `available` weight the choice (what is planted twice comes up more often)
  const pool = available.length ? [...available] : (['lettuce', 'carrot'] as ProductId[]);
  const kinds = Math.min(new Set(pool).size, 1 + (random() < 0.5 + level * 0.4 ? 1 : 0) + (level > 0.4 && random() < 0.45 ? 1 : 0));
  const items: Basket = {};
  const left = [...pool];
  for (let i = 0; i < kinds; i++) {
    const k = left.splice(Math.floor(random() * left.length), 1)[0];
    // remove the other copies of it from the pool
    for (let j = left.length - 1; j >= 0; j--) if (left[j] === k) left.splice(j, 1);
    const most = k === 'sunflower' ? 1 : k === 'lettuce' ? 2 : 2 + Math.round(level * 2);
    items[k] = 1 + Math.floor(random() * most);
    if (!left.length) break;
  }
  return { items, patience: Math.round(62 - level * 14) };
}
