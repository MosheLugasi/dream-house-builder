/** Appearance of a person (the player or a neighbor). Plain data: saved in localStorage. */
export type BodyType = 'girl' | 'boy' | 'woman' | 'man';
export type HairStyle = 'ponytail' | 'short' | 'long' | 'bun' | 'curly' | 'braids' | 'bald';
export type TopStyle = 'tshirt' | 'longsleeve' | 'hoodie' | 'dress';
export type BottomStyle = 'pants' | 'shorts' | 'skirt';
export type Accessory = 'none' | 'glasses' | 'cap' | 'backpack' | 'bow';

export interface CharacterLook {
  body: BodyType;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  topStyle: TopStyle;
  bottom: string;
  bottomStyle: BottomStyle;
  shoes: string;
  accessory: Accessory;
  /** iris color (optional; brown when missing) */
  eyes?: string;
  /** color of the cap / backpack / bow (optional; derived from the top color when missing) */
  accessoryColor?: string;
}

export const DEFAULT_LOOK: CharacterLook = {
  body: 'girl',
  skin: '#e8b996',
  hair: '#5a3620',
  hairStyle: 'ponytail',
  top: '#e8725a',
  topStyle: 'tshirt',
  bottom: '#3f5f8a',
  bottomStyle: 'pants',
  shoes: '#f4f4f2',
  accessory: 'none',
};

export type Pose = 'stand' | 'sit' | 'lie' | 'ride';
/** One-shot animations layered on top of the current pose. */
export type Gesture = 'wave' | 'cheer' | 'pet' | 'kick';

/** Extra motion state passed to `Character.update` every frame. */
export interface CharacterMotion {
  /** turning rate, rad/s (positive = turning left); used to lean into turns */
  turn?: number;
  /** true while jumping / falling */
  airborne?: boolean;
  /** vertical speed, m/s (positive = rising) */
  vy?: number;
  /** eyes closed (sleeping) */
  asleep?: boolean;
}

// option lists (Hebrew labels), palettes and `randomLook` for the character creator and for neighbours
export {
  ACCESSORY_COLORS,
  ACCESSORY_OPTIONS,
  BODY_OPTIONS,
  BOTTOM_COLORS,
  BOTTOM_STYLE_OPTIONS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLE_OPTIONS,
  SHOE_COLORS,
  SKIN_TONES,
  TOP_COLORS,
  TOP_STYLE_OPTIONS,
  randomLook,
  type Option,
} from './character/options';
