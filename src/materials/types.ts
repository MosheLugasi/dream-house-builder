import type * as THREE from 'three';

/**
 * Surface finishes (floors, wall paints/wallpapers, exterior cladding, ground covers).
 *
 * All finishes are procedural (generated on a canvas at runtime, no network assets).
 * Geometry UVs are expressed in METERS, so each texture must be set up with
 * RepeatWrapping and `repeat = 1 / tileSize` where tileSize is the real-world size (in meters)
 * covered by one copy of the texture.
 *
 * Besides the catalog ids, any id of the form `paint:#rrggbb` is a valid finish:
 * a matte wall paint of that color.
 */
export type FinishKind = 'floor' | 'wall' | 'exterior' | 'ground' | 'roof';

export interface FinishDef {
  id: string;
  /** Hebrew display name */
  name: string;
  kinds: FinishKind[];
  /** representative flat CSS color, used for the 2D plan fill */
  color2d: string;
}

export interface FinishLibrary {
  /** all catalog finishes (not including ad-hoc `paint:#hex` ones) */
  list: FinishDef[];
  /** look up a def; for `paint:#hex` returns a synthesized def */
  get(id: string): FinishDef;
  /** cached, shared PBR material for a finish id (never dispose/mutate it) */
  material(id: string): THREE.MeshStandardMaterial;
  /** small preview image (data URL, ~96px) for the catalog UI; cached */
  swatch(id: string): string;
}
