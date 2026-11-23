import type { Accessory, BodyType, BottomStyle, CharacterLook, HairStyle, TopStyle } from '../render3d/characterTypes';

const SKIN = ['#f3d2b8', '#e8b996', '#d49a6f', '#b97a50', '#8d5a3b', '#6b4329'];
const HAIR = ['#2a1d16', '#5a3620', '#8a5a34', '#c79a4f', '#1c1c20', '#7d7f86', '#a8432d'];
const TOPS = ['#e8725a', '#4f8fb8', '#6aa67c', '#e7c14f', '#9b6fc2', '#f2efe8', '#d9668f', '#3d4a5c'];
const BOTTOMS = ['#3f5f8a', '#2e3440', '#6b5a48', '#8a9aa8', '#5a6e52', '#b9a48a'];
const SHOES = ['#f4f4f2', '#2b2b2f', '#b5533c', '#3f6f8f'];
const BODIES: BodyType[] = ['woman', 'man', 'girl', 'boy'];
const HAIRS: Record<BodyType, HairStyle[]> = {
  woman: ['long', 'bun', 'ponytail', 'curly', 'short'],
  girl: ['ponytail', 'braids', 'long', 'curly', 'bun'],
  man: ['short', 'short', 'curly', 'bald'],
  boy: ['short', 'curly', 'short'],
};
const TOP_STYLES: TopStyle[] = ['tshirt', 'longsleeve', 'hoodie', 'dress'];
const BOTTOM_STYLES: BottomStyle[] = ['pants', 'shorts', 'skirt'];
const ACCESSORIES: Accessory[] = ['none', 'none', 'glasses', 'cap', 'backpack', 'none'];

/** A deterministic random appearance (for the neighbors walking around). */
export function randomLook(seed: number): CharacterLook {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  const pick = <T,>(list: T[]): T => list[Math.floor(rnd() * list.length)];
  const body = pick(BODIES);
  const female = body === 'woman' || body === 'girl';
  let topStyle = pick(TOP_STYLES);
  if (topStyle === 'dress' && !female) topStyle = 'tshirt';
  let bottomStyle = pick(BOTTOM_STYLES);
  if (bottomStyle === 'skirt' && !female) bottomStyle = 'pants';
  return {
    body,
    skin: pick(SKIN),
    hair: pick(HAIR),
    hairStyle: pick(HAIRS[body]),
    top: pick(TOPS),
    topStyle,
    bottom: pick(BOTTOMS),
    bottomStyle,
    shoes: pick(SHOES),
    accessory: pick(ACCESSORIES),
  };
}
