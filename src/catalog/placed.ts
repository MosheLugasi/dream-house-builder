import { itemScale, itemSize, scaleLocal } from './index';
import type { ActionKind, FurnitureDef, ItemAnchors, ItemSize, LocalPoint, SeatAnchor } from './types';

/**
 * Geometry of a PLACED item: the catalog definition combined with the size and mirroring the
 * player chose. Every point returned here is in the item's local frame, in real meters, already
 * mirrored – ready to be rotated / translated into the world like any other local point.
 *
 * Parametric items publish size-dependent anchors on their built object (`userData.anchors`); pass
 * them in when the 3D object is at hand. Without them (or for stretched items) the static points of
 * the definition are scaled with the size.
 */
export interface Placement {
  size?: { w: number; d: number; h: number } | null;
  mirror?: boolean;
}

export interface PlacedBox {
  x: number;
  z: number;
  w: number;
  d: number;
  /** top of the box above the item's bottom */
  h: number;
}

/** The size an item has once placed. */
export function placedSize(def: FurnitureDef, item: Placement): ItemSize {
  return itemSize(def, item);
}

/**
 * Transform to apply to the object returned by `def.build` so it matches the placement:
 * stretch for non-parametric items (parametric ones are already built at the size) and the mirror.
 */
export function placedObjectScale(def: FurnitureDef, item: Placement): { x: number; y: number; z: number } {
  const k = def.parametric ? { x: 1, y: 1, z: 1 } : itemScale(def, placedSize(def, item));
  return { x: item.mirror ? -k.x : k.x, y: k.y, z: k.z };
}

const mirrorPoint = (p: LocalPoint, mirror: boolean | undefined): LocalPoint => (mirror ? { x: -p.x, y: p.y, z: p.z } : p);

/** A point of the static definition (designed at the catalog size) on the placed item. */
export function placedPoint(def: FurnitureDef, item: Placement, p: LocalPoint): LocalPoint {
  return mirrorPoint(scaleLocal(def, placedSize(def, item), p), item.mirror);
}

/** Where the lamp's light comes from, or null for items without a light. */
export function placedLight(def: FurnitureDef, item: Placement, anchors?: ItemAnchors | null): LocalPoint | null {
  if (!def.light) return null;
  if (def.parametric && anchors?.light) return mirrorPoint(anchors.light, item.mirror);
  return placedPoint(def, item, def.light);
}

/** Where people sit or lie on the placed item. */
export function placedSeats(def: FurnitureDef, item: Placement, anchors?: ItemAnchors | null): SeatAnchor[] {
  const flip = (s: SeatAnchor): SeatAnchor => (item.mirror ? { ...s, x: -s.x, facing: -s.facing } : s);
  if (def.parametric && anchors?.seats) return anchors.seats.map(flip);
  const size = placedSize(def, item);
  const k = itemScale(def, size);
  return (def.seats ?? []).map((s) => flip({ ...s, x: s.x * k.x, z: s.z * k.z, height: s.height * k.y }));
}

/** Effect origin of an action (spout, hob, flame…) on the placed item. */
export function placedActionPoint(def: FurnitureDef, item: Placement, kind: ActionKind, anchors?: ItemAnchors | null): LocalPoint | undefined {
  if (def.parametric && anchors?.actions?.[kind]) return mirrorPoint(anchors.actions[kind]!, item.mirror);
  const at = def.actions?.find((a) => a.kind === kind)?.at;
  return at ? placedPoint(def, item, at) : undefined;
}

/**
 * The solid footprint as boxes (local, mirrored). `base` is the catalog's single solid box for the
 * item (null = nothing blocks); a parametric build may split it into several boxes (L / U kitchens).
 */
export function placedBoxes(def: FurnitureDef, item: Placement, base: { w: number; d: number } | null, anchors?: ItemAnchors | null): PlacedBox[] {
  if (!base) return [];
  const size = placedSize(def, item);
  if (def.parametric && anchors?.boxes?.length) {
    return anchors.boxes.map((b) => ({ ...b, x: item.mirror ? -b.x : b.x }));
  }
  const k = itemScale(def, size);
  // a trunk-only footprint (trees, poles) keeps its size; a full footprint follows the item
  const full = base.w >= def.size.w - 1e-6 && base.d >= def.size.d - 1e-6;
  return [{ x: 0, z: 0, w: full ? size.w : base.w * Math.min(k.x, 1.5), d: full ? size.d : base.d * Math.min(k.z, 1.5), h: size.h }];
}
