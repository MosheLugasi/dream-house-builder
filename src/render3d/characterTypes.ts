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
  /** stature in meters (optional): scales the body type uniformly; its natural height when missing */
  height?: number;
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

/** Body animations layered over the base pose (looping until changed, except the one-shots: kick, shoot, throw, jump, flip, call). */
export type Activity =
  | 'none'
  | 'wave'
  | 'dance'
  | 'clap'
  | 'cheer'
  | 'jump'
  | 'type'
  | 'piano'
  | 'guitar'
  | 'drums'
  | 'cook'
  | 'eat'
  | 'drink'
  | 'read'
  | 'run'
  | 'pedal'
  | 'row'
  | 'lift'
  | 'punch'
  | 'yoga'
  | 'stretch'
  | 'bounce'
  | 'swing'
  | 'kick'
  | 'shoot'
  | 'throw'
  | 'pet'
  | 'sleep'
  | 'game'
  | 'play'
  | 'wash'
  | 'feed'
  | 'slide'
  | 'call'
  | 'photo'
  | 'flip';

/** Things held in the hands (the guitar hangs in front of the chest; dumbbells are in both hands). */
export type Prop = 'book' | 'cup' | 'apple' | 'guitar' | 'controller' | 'dart' | 'dumbbells' | 'spoon' | 'phone' | 'ball' | 'paddle' | 'cue' | 'mic' | 'none';

/**
 * The older, simpler appearance model (still found in saved data and accepted by `Character.setLook`):
 * convert with `normalizeLook`.
 */
export interface LegacyLook {
  height: number;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  longHair: boolean;
  hairStyle?: HairStyle;
  skirt?: boolean;
  glasses?: boolean;
}
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
