import type { Accessory, BodyType, BottomStyle, CharacterLook, HairStyle, TopStyle } from '../characterTypes';

/** A choice in the character creator: stable id + Hebrew label. */
export interface Option<T extends string> {
  id: T;
  label: string;
}

export const BODY_OPTIONS: Option<BodyType>[] = [
  { id: 'girl', label: 'ילדה' },
  { id: 'boy', label: 'ילד' },
  { id: 'woman', label: 'אישה' },
  { id: 'man', label: 'גבר' },
];

export const HAIR_STYLE_OPTIONS: Option<HairStyle>[] = [
  { id: 'ponytail', label: 'קוקו' },
  { id: 'short', label: 'קצר' },
  { id: 'long', label: 'ארוך' },
  { id: 'bun', label: 'פקעת' },
  { id: 'curly', label: 'מתולתל' },
  { id: 'braids', label: 'צמות' },
  { id: 'bald', label: 'קירח' },
];

export const TOP_STYLE_OPTIONS: Option<TopStyle>[] = [
  { id: 'tshirt', label: 'חולצה קצרה' },
  { id: 'longsleeve', label: 'חולצה ארוכה' },
  { id: 'hoodie', label: 'קפוצ׳ון' },
  { id: 'dress', label: 'שמלה' },
];

export const BOTTOM_STYLE_OPTIONS: Option<BottomStyle>[] = [
  { id: 'pants', label: 'מכנסיים' },
  { id: 'shorts', label: 'מכנסיים קצרים' },
  { id: 'skirt', label: 'חצאית' },
];

export const ACCESSORY_OPTIONS: Option<Accessory>[] = [
  { id: 'none', label: 'בלי' },
  { id: 'glasses', label: 'משקפיים' },
  { id: 'cap', label: 'כובע מצחייה' },
  { id: 'backpack', label: 'תיק גב' },
  { id: 'bow', label: 'סרט' },
];

/** Realistic skin tones, light → dark. */
export const SKIN_TONES: string[] = ['#f3d0b6', '#edc3a2', '#e8b996', '#dba57e', '#c98d62', '#a56c43', '#7e5030', '#56351f'];

export const HAIR_COLORS: string[] = ['#17120f', '#3a2416', '#5a3620', '#8a5a2b', '#b98a4a', '#e2c078', '#a8431f', '#d8702e', '#8c8c8a', '#e6e2da', '#d85a9a', '#4a78c8'];

export const EYE_COLORS: string[] = ['#5a3a22', '#3a2416', '#7a5a2e', '#4f7a4a', '#3f77a8', '#6e7f8a'];

export const TOP_COLORS: string[] = ['#e8725a', '#d9483b', '#f2b33d', '#f4e9d0', '#ffffff', '#7cc47f', '#2f8f83', '#3d7fc4', '#2c3550', '#8a5fc0', '#e884b0', '#3a3a3c'];

export const BOTTOM_COLORS: string[] = ['#3f5f8a', '#2c3550', '#6f8fb5', '#3a3a3c', '#6b6f76', '#c9b48a', '#8a6a4a', '#4f7a55', '#b8463c', '#e884b0', '#8a5fc0', '#f1ede4'];

export const SHOE_COLORS: string[] = ['#f4f4f2', '#3a3a3c', '#e24a3b', '#3d7fc4', '#f2b33d', '#7cc47f', '#e884b0', '#8a6a4a'];

export const ACCESSORY_COLORS: string[] = ['#d9483b', '#3d7fc4', '#f2b33d', '#7cc47f', '#e884b0', '#8a5fc0', '#3a3a3c', '#f4f4f2'];

/** Small deterministic PRNG (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A random but plausible person. With a `seed` the result is reproducible (neighbours keep their look);
 * without one every call differs.
 */
export function randomLook(seed?: number): CharacterLook {
  const r = prng(seed === undefined ? Math.floor(Math.random() * 0xffffffff) : Math.floor(seed) * 2654435761 + 12345);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)];
  const weighted = <T>(list: readonly [T, number][]): T => {
    const total = list.reduce((s, e) => s + e[1], 0);
    let x = r() * total;
    for (const [v, w] of list) {
      x -= w;
      if (x <= 0) return v;
    }
    return list[list.length - 1][0];
  };
  const body = pick<BodyType>(['girl', 'boy', 'woman', 'man']);
  const fem = body === 'girl' || body === 'woman';
  const hairStyle = fem
    ? weighted<HairStyle>([['ponytail', 3], ['long', 3], ['bun', 2], ['braids', body === 'girl' ? 3 : 1], ['curly', 2], ['short', 1]])
    : weighted<HairStyle>([['short', 6], ['curly', 2], ['bald', body === 'man' ? 1.5 : 0.1], ['long', 0.5]]);
  const topStyle = fem
    ? weighted<TopStyle>([['tshirt', 3], ['longsleeve', 2], ['hoodie', 2], ['dress', 3]])
    : weighted<TopStyle>([['tshirt', 4], ['longsleeve', 2], ['hoodie', 3]]);
  const bottomStyle = fem
    ? weighted<BottomStyle>([['pants', 3], ['shorts', 2], ['skirt', 2]])
    : weighted<BottomStyle>([['pants', 4], ['shorts', 3]]);
  // natural hair colours mostly; the fun ones are rare
  const hair = r() < 0.06 ? pick(HAIR_COLORS.slice(10)) : pick(HAIR_COLORS.slice(0, body === 'woman' || body === 'man' ? 10 : 8));
  const skin = pick(SKIN_TONES);
  const dark = SKIN_TONES.indexOf(skin) >= 5;
  const accessory = weighted<Accessory>([['none', 5], ['glasses', 1.5], ['cap', 1.5], ['backpack', body === 'girl' || body === 'boy' ? 2 : 0.7], ['bow', fem ? 1.2 : 0]]);
  const look: CharacterLook = {
    body,
    skin,
    hair: dark && r() < 0.8 ? pick(HAIR_COLORS.slice(0, 3)) : hair,
    hairStyle,
    top: pick(TOP_COLORS),
    topStyle,
    bottom: pick(BOTTOM_COLORS),
    bottomStyle,
    shoes: pick(SHOE_COLORS),
    accessory,
    eyes: dark ? pick(EYE_COLORS.slice(0, 3)) : pick(EYE_COLORS),
  };
  if (accessory === 'cap' || accessory === 'backpack' || accessory === 'bow') look.accessoryColor = pick(ACCESSORY_COLORS);
  return look;
}
