import type { FinishDef } from './types';
import type { Surface } from './textureGen';
import * as ground from './gen/ground';
import * as masonry from './gen/masonry';
import * as roof from './gen/roof';
import * as tiles from './gen/tiles';
import * as walls from './gen/walls';
import * as wood from './gen/wood';

/** catalog entry: the public def plus everything needed to generate the textures lazily */
export interface FinishSpec extends FinishDef {
  /** real-world size of one texture tile, meters [width, height] */
  tile: [number, number];
  /** texture resolution (power of two) */
  res: 256 | 512 | 1024;
  /** generator; must work at any power-of-two `n` (swatches use a low resolution) */
  gen: (n: number, w: number, h: number) => Surface;
  /** multiplier on the physically derived normal slopes */
  normalStrength?: number;
  normalScale?: number;
  /** texture rotation in radians (herringbone) */
  rotation?: number;
  envMapIntensity?: number;
  /**
   * Large-area finishes (lawn, asphalt ...): modulate the color with a very low frequency,
   * non-repeating noise in the shader so the texture tiling is not visible from far away.
   * `strength` = +-brightness, `tint`/`tintAmount` = color the bright patches drift towards.
   */
  macro?: { strength: number; tint?: string; tintAmount?: number };
  /** real-world width shown in the swatch (default 1.2 m) */
  swatchMeters?: number;
  /** strength of the fake lighting in the swatch (default 1) */
  swatchShade?: number;
  /**
   * Photographic PBR set (`public/assets/textures/<set>/{color,normal,rough}.webp`, CC0 – see
   * `public/assets/CREDITS.md`) that replaces the generated textures once it has loaded in a browser.
   * The generator stays the instant first version, the Node/test version and the swatch.
   */
  photo?: PhotoSet;
}

export interface PhotoSet {
  set: string;
  /** real-world size covered by one copy of the photo, meters */
  tile: [number, number];
  /** multiplies the photo's colour (neutral sets are tinted per finish); default white */
  color?: string;
  normalScale?: number;
  /** multiplies the roughness map (default 1) */
  roughness?: number;
}

/** finishes that switch to a photographic texture set when it is available */
const PHOTOS: Record<string, PhotoSet> = {
  asphalt: { set: 'asphalt', tile: [3, 3], normalScale: 0.9 },
  grass: { set: 'grass', tile: [2.4, 2.4], normalScale: 0.8 },
  sand: { set: 'sand', tile: [2.5, 2.5] },
  gravel: { set: 'gravel', tile: [2.4, 2.4] },
  pavers: { set: 'paving-stones', tile: [2, 2] },
  'jerusalem-stone': { set: 'sandstone-blocks', tile: [2.4, 2.4] },
  'brick-red': { set: 'brick-red', tile: [1.4, 1.4] },
  'brick-white': { set: 'brick-white', tile: [1.3, 1.3] },
  'stucco-white': { set: 'plaster', tile: [2, 2], color: '#f3efe8', normalScale: 0.8 },
  'stucco-sand': { set: 'plaster', tile: [2, 2], color: '#e2cfab', normalScale: 0.8 },
  'marble-white': { set: 'marble', tile: [1.6, 1.6], color: '#fbfaf8', roughness: 0.5 },
  'porcelain-grey': { set: 'floor-tiles-large', tile: [1.8, 1.8] },
  'terracotta-tiles': { set: 'floor-tiles-terracotta', tile: [1.5, 1.5] },
};

export const CATALOG: FinishSpec[] = [
  // ----------------------------------------------------------------------------- floors: wood
  {
    id: 'oak-planks',
    name: 'פרקט אלון בהיר',
    kinds: ['floor'],
    color2d: '#c9a877',
    tile: [2.4, 2.4],
    res: 1024,
    gen: (n, w, h) => wood.plankFloor(n, w, h, wood.OAK, 101, 0.15, 1.1, 1.9),
  },
  {
    id: 'walnut-planks',
    name: 'פרקט אגוז כהה',
    kinds: ['floor'],
    color2d: '#6b4a32',
    tile: [2.4, 2.4],
    res: 1024,
    gen: (n, w, h) => wood.plankFloor(n, w, h, wood.WALNUT, 202, 0.15, 1.1, 1.9),
  },
  {
    id: 'oak-herringbone',
    name: 'פרקט אלון בדוגמת אדרה (פישבון)',
    kinds: ['floor'],
    color2d: '#c4a270',
    tile: [1.8, 1.8],
    res: 1024,
    rotation: Math.PI / 4,
    gen: (n, w, h) => wood.herringboneFloor(n, w, h, wood.OAK, 303),
  },
  {
    id: 'greywash-planks',
    name: 'פרקט אפור מולבן',
    kinds: ['floor'],
    color2d: '#b7b1a5',
    tile: [2.4, 2.4],
    res: 1024,
    gen: (n, w, h) => wood.plankFloor(n, w, h, wood.GREYWASH, 404, 0.2, 1.2, 2.0),
  },
  {
    id: 'maple-planks',
    name: 'פרקט מייפל',
    kinds: ['floor'],
    color2d: '#e2cba4',
    tile: [2.4, 2.4],
    res: 1024,
    gen: (n, w, h) => wood.plankFloor(n, w, h, wood.MAPLE, 505, 0.1, 0.9, 1.8),
  },
  {
    id: 'wood-deck',
    name: 'דק עץ',
    kinds: ['floor', 'ground'],
    color2d: '#83614a',
    tile: [2.9, 2.9],
    res: 1024,
    gen: (n, w, h) => wood.deckBoards(n, w, h, 606),
  },
  // ---------------------------------------------------------------------- floors: tile & stone
  {
    id: 'ceramic-white',
    name: 'אריחי קרמיקה לבנים 60×60',
    kinds: ['floor', 'wall'],
    color2d: '#ecebe6',
    tile: [1.2, 1.2],
    res: 1024,
    gen: tiles.ceramicWhite,
  },
  {
    id: 'porcelain-grey',
    name: 'גרניט פורצלן אפור 60×60',
    kinds: ['floor', 'wall'],
    color2d: '#8f908d',
    tile: [2.4, 2.4],
    res: 1024,
    gen: tiles.porcelainGrey,
  },
  {
    id: 'marble-white',
    name: 'שיש לבן מעורק',
    kinds: ['floor', 'wall'],
    color2d: '#e9e8e5',
    tile: [2.4, 2.4],
    res: 1024,
    gen: tiles.marbleWhite,
  },
  {
    id: 'terrazzo',
    name: 'טרצו',
    kinds: ['floor'],
    color2d: '#d3cdc1',
    tile: [1.2, 1.2],
    res: 1024,
    swatchMeters: 0.5,
    gen: tiles.terrazzo,
  },
  {
    id: 'checker-tiles',
    name: 'אריחי שחמט שחור־לבן',
    kinds: ['floor'],
    color2d: '#8a8885',
    tile: [1.2, 1.2],
    res: 1024,
    gen: tiles.checkerTiles,
  },
  {
    id: 'hex-tiles',
    name: 'אריחי משושה לבנים',
    kinds: ['floor', 'wall'],
    color2d: '#e3e1db',
    tile: [0.8, 0.866025],
    res: 1024,
    swatchMeters: 0.6,
    gen: tiles.hexTiles,
  },
  {
    id: 'terracotta-tiles',
    name: 'אריחי טרקוטה',
    kinds: ['floor'],
    color2d: '#b4673f',
    tile: [1.8, 1.8],
    res: 1024,
    gen: tiles.terracottaTiles,
  },
  {
    id: 'concrete-polished',
    name: 'בטון מוחלק',
    kinds: ['floor'],
    color2d: '#a09f9a',
    tile: [2.6, 2.6],
    res: 1024,
    macro: { strength: 0.05 },
    gen: walls.concretePolished,
  },
  // --------------------------------------------------------------------------- floors: carpet
  {
    id: 'carpet-beige',
    name: 'שטיח מקיר לקיר – בז\'',
    kinds: ['floor'],
    color2d: '#cbbda4',
    tile: [1.0, 1.0],
    res: 512,
    swatchMeters: 0.4,
    normalStrength: 0.6,
    gen: (n, w, h) => walls.carpet(n, w, h, '#c9baa0', 3601),
  },
  {
    id: 'carpet-grey',
    name: 'שטיח מקיר לקיר – אפור',
    kinds: ['floor'],
    color2d: '#96979a',
    tile: [1.0, 1.0],
    res: 512,
    swatchMeters: 0.4,
    normalStrength: 0.6,
    gen: (n, w, h) => walls.carpet(n, w, h, '#94959a', 3602),
  },
  {
    id: 'carpet-blue',
    name: 'שטיח מקיר לקיר – כחול מעושן',
    kinds: ['floor'],
    color2d: '#7b8fa4',
    tile: [1.0, 1.0],
    res: 512,
    swatchMeters: 0.4,
    normalStrength: 0.6,
    gen: (n, w, h) => walls.carpet(n, w, h, '#788da3', 3603),
  },
  // ------------------------------------------------------------------------------------ walls
  {
    id: 'plaster-white',
    name: 'טיח לבן',
    kinds: ['wall'],
    color2d: '#f0ede7',
    tile: [1.6, 1.6],
    res: 512,
    gen: (n, w, h) => walls.plaster(n, w, h, '#f0ede7'),
  },
  {
    id: 'wallpaper-stripes',
    name: 'טפט פסים רכים',
    kinds: ['wall'],
    color2d: '#dfe0d3',
    tile: [0.96, 0.96],
    res: 512,
    swatchMeters: 0.6,
    gen: walls.wallpaperStripes,
  },
  {
    id: 'wallpaper-botanical',
    name: 'טפט עלים',
    kinds: ['wall'],
    color2d: '#dde0d0',
    tile: [1.2, 1.2],
    res: 1024,
    swatchMeters: 0.7,
    gen: walls.wallpaperBotanical,
  },
  {
    id: 'wallpaper-geometric',
    name: 'טפט גאומטרי',
    kinds: ['wall'],
    color2d: '#d3dadb',
    tile: [1.2, 1.2],
    res: 1024,
    swatchMeters: 0.6,
    gen: walls.wallpaperGeometric,
  },
  {
    id: 'wallpaper-stars',
    name: 'טפט כוכבים לחדר ילדים',
    kinds: ['wall'],
    color2d: '#e0e9ee',
    tile: [1.2, 1.2],
    res: 1024,
    swatchMeters: 0.7,
    gen: walls.wallpaperStars,
  },
  {
    id: 'subway-tiles',
    name: 'אריחי סאבווי לבנים',
    kinds: ['wall'],
    color2d: '#ecebe6',
    tile: [1.2, 1.2],
    res: 1024,
    swatchMeters: 0.6,
    gen: tiles.subwayTiles,
  },
  {
    id: 'zellige-tiles',
    name: 'אריחי זליג\' בגווני ים',
    kinds: ['wall', 'floor'],
    color2d: '#3f8f88',
    tile: [1.0, 1.0],
    res: 1024,
    swatchMeters: 0.6,
    gen: tiles.zelligeTiles,
  },
  {
    id: 'wood-slats',
    name: 'חיפוי פסי עץ (למלות)',
    kinds: ['wall'],
    color2d: '#b48e5c',
    tile: [0.9, 0.9],
    res: 1024,
    swatchMeters: 0.6,
    gen: (n, w, h) => wood.slatWall(n, w, h, 707),
  },
  {
    id: 'brick-exposed',
    name: 'לבנים חשופות',
    kinds: ['wall', 'exterior'],
    color2d: '#a35f47',
    tile: [1.76, 1.8],
    res: 1024,
    gen: (n, w, h) => masonry.brickWall(n, w, h, masonry.BRICK_EXPOSED),
  },
  {
    id: 'brick-white',
    name: 'לבנים צבועות לבן',
    kinds: ['wall', 'exterior'],
    color2d: '#e9e6df',
    tile: [1.76, 1.8],
    res: 1024,
    gen: (n, w, h) => masonry.brickWall(n, w, h, masonry.BRICK_WHITE),
  },
  {
    id: 'concrete-smooth',
    name: 'בטון חשוף חלק',
    kinds: ['wall', 'exterior', 'floor'],
    color2d: '#a7a6a1',
    tile: [1.8, 1.8],
    res: 1024,
    swatchMeters: 1.8,
    gen: walls.concreteSmooth,
  },
  {
    id: 'concrete-board',
    name: 'בטון חשוף בתבנית לוחות',
    kinds: ['wall', 'exterior'],
    color2d: '#9f9d98',
    tile: [2.4, 2.4],
    res: 1024,
    gen: walls.concreteBoard,
  },
  // --------------------------------------------------------------------------------- exterior
  {
    id: 'stucco-white',
    name: 'טיח חוץ (שליכט) לבן',
    kinds: ['exterior', 'wall'],
    color2d: '#f1efe9',
    tile: [1.5, 1.5],
    res: 1024,
    swatchMeters: 0.5,
    gen: (n, w, h) => walls.stucco(n, w, h, '#f1efe9'),
  },
  {
    id: 'stucco-sand',
    name: 'טיח חוץ (שליכט) בגוון חול',
    kinds: ['exterior', 'wall'],
    color2d: '#d8c6a6',
    tile: [1.5, 1.5],
    res: 1024,
    swatchMeters: 0.5,
    gen: (n, w, h) => walls.stucco(n, w, h, '#d8c6a6'),
  },
  {
    id: 'brick-red',
    name: 'לבנים אדומות',
    kinds: ['exterior', 'wall'],
    color2d: '#9d4f3a',
    tile: [1.76, 1.8],
    res: 1024,
    gen: (n, w, h) => masonry.brickWall(n, w, h, masonry.BRICK_RED),
  },
  {
    id: 'brick-grey',
    name: 'לבנים אפורות',
    kinds: ['exterior', 'wall'],
    color2d: '#8d8b87',
    tile: [1.76, 1.8],
    res: 1024,
    gen: (n, w, h) => masonry.brickWall(n, w, h, masonry.BRICK_GREY),
  },
  {
    id: 'jerusalem-stone',
    name: 'אבן ירושלמית (טלטיש)',
    kinds: ['exterior', 'wall'],
    color2d: '#dccba6',
    tile: [2.4, 2.4],
    res: 1024,
    gen: (n, w, h) => masonry.jerusalemStone(n, w, h, false),
  },
  {
    id: 'jerusalem-stone-rough',
    name: 'אבן ירושלמית מבוקעת (טובזה)',
    kinds: ['exterior', 'wall'],
    color2d: '#d6c39c',
    tile: [2.4, 2.4],
    res: 1024,
    gen: (n, w, h) => masonry.jerusalemStone(n, w, h, true),
  },
  {
    id: 'wood-siding',
    name: 'חיפוי עץ אופקי',
    kinds: ['exterior', 'wall'],
    color2d: '#b07d4f',
    tile: [2.4, 2.4],
    res: 1024,
    gen: (n, w, h) => wood.lapSiding(n, w, h, 808),
  },
  {
    id: 'cladding-dark',
    name: 'חיפוי לוחות כהה מודרני',
    kinds: ['exterior', 'wall'],
    color2d: '#3d4044',
    tile: [2.4, 2.4],
    res: 1024,
    swatchMeters: 2.4,
    gen: walls.claddingDark,
  },
  // ------------------------------------------------------------------------------------- roof
  {
    id: 'roof-terracotta',
    name: 'רעפי חרס אדומים',
    kinds: ['roof'],
    color2d: '#b4583c',
    tile: [2.0, 2.1],
    res: 1024,
    swatchShade: 0.25,
    gen: roof.roofTerracotta,
  },
  {
    id: 'roof-slate',
    name: 'רעפי צפחה אפורים',
    kinds: ['roof'],
    color2d: '#4d5258',
    tile: [2.0, 2.0],
    res: 1024,
    swatchShade: 0.5,
    gen: roof.roofSlate,
  },
  {
    id: 'roof-gravel',
    name: 'גג שטוח – חצץ בהיר',
    kinds: ['roof'],
    color2d: '#b9b8b3',
    tile: [1.6, 1.6],
    res: 1024,
    swatchMeters: 0.5,
    swatchShade: 0.4,
    macro: { strength: 0.06 },
    gen: (n, w, h) => ground.pebbles(n, w, h, ground.ROOF_BALLAST),
  },
  // ----------------------------------------------------------------------------------- ground
  {
    id: 'grass',
    name: 'דשא',
    kinds: ['ground'],
    color2d: '#5f8f3a',
    tile: [4, 4],
    res: 1024,
    swatchMeters: 1.0,
    swatchShade: 0.15,
    normalStrength: 0.5,
    macro: { strength: 0.2, tint: '#cfc86a', tintAmount: 0.4 },
    gen: (n, w, h) => ground.grass(n, w, h, ground.LAWN),
  },
  {
    id: 'grass-dry',
    name: 'עשב בר יבש',
    kinds: ['ground'],
    color2d: '#a59a5c',
    tile: [4, 4],
    res: 1024,
    swatchMeters: 1.0,
    swatchShade: 0.15,
    normalStrength: 0.5,
    macro: { strength: 0.16, tint: '#b08f62', tintAmount: 0.5 },
    gen: (n, w, h) => ground.grass(n, w, h, ground.WILD_GRASS),
  },
  {
    id: 'asphalt',
    name: 'אספלט',
    kinds: ['ground'],
    color2d: '#454547',
    tile: [2.5, 2.5],
    res: 1024,
    swatchMeters: 0.6,
    macro: { strength: 0.1 },
    gen: ground.asphalt,
  },
  {
    id: 'pavers',
    name: 'אבנים משתלבות',
    kinds: ['ground', 'floor'],
    color2d: '#96958f',
    tile: [1.6, 1.6],
    res: 1024,
    swatchMeters: 0.8,
    macro: { strength: 0.07 },
    gen: masonry.concretePavers,
  },
  {
    id: 'cobblestone',
    name: 'אבני מרצפת (קוביות גרניט)',
    kinds: ['ground'],
    color2d: '#8a8780',
    tile: [1.68, 1.68],
    res: 1024,
    swatchMeters: 0.8,
    swatchShade: 0.5,
    macro: { strength: 0.08 },
    gen: masonry.cobblestone,
  },
  {
    id: 'gravel',
    name: 'חצץ',
    kinds: ['ground'],
    color2d: '#a59e91',
    tile: [1.8, 1.8],
    res: 1024,
    swatchMeters: 0.5,
    swatchShade: 0.4,
    macro: { strength: 0.08 },
    gen: (n, w, h) => ground.pebbles(n, w, h, ground.GRAVEL),
  },
  {
    id: 'soil',
    name: 'אדמת גן',
    kinds: ['ground'],
    color2d: '#644b36',
    tile: [2, 2],
    res: 512,
    swatchMeters: 0.8,
    swatchShade: 0.3,
    normalStrength: 0.6,
    macro: { strength: 0.14, tint: '#c8a888', tintAmount: 0.25 },
    gen: ground.soil,
  },
  {
    id: 'sand',
    name: 'חול',
    kinds: ['ground'],
    color2d: '#dcc89f',
    tile: [2, 2],
    res: 512,
    swatchMeters: 0.8,
    macro: { strength: 0.07 },
    gen: ground.sand,
  },
  {
    id: 'water',
    name: 'מים',
    kinds: ['ground'],
    color2d: '#3b8fae',
    tile: [3, 3],
    res: 512,
    swatchMeters: 1.5,
    swatchShade: 0.5,
    macro: { strength: 0.1 },
    gen: ground.water,
  },
];

for (const spec of CATALOG) {
  const photo = PHOTOS[spec.id];
  if (photo) spec.photo = photo;
}
