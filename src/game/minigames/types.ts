import type * as THREE from 'three';
import type { FurnitureDef } from '../../catalog/types';
import type { FurnitureItem, Project, Vec2 } from '../../model/types';
import type { WalkController, WalkWorld } from '../../render3d/WalkController';
import type { MiniGameId } from './meta';
import type { VenueBuilder, Plot } from './plots';

/**
 * Contract between the mini-game runtime (render3d/MiniGames.ts) and the games
 * (src/game/minigames/<id>/). A game is a definition (metadata, medals, how to build its venue,
 * how to start) and, while it runs, a session that is updated every frame in walk mode.
 */
export interface MiniGameDef {
  id: MiniGameId;
  /** Hebrew instructions, one short line each (shown in the menu and before starting) */
  howTo: string[];
  /**
   * Medal thresholds on the final score. Higher is better unless `lowerIsBetter` (times).
   * `unit` decides how scores are shown: points, or seconds as m:ss.t.
   */
  medals: { bronze: number; silver: number; gold: number; lowerIsBetter?: boolean; unit: 'points' | 'seconds' };
  /** the game's own place in the neighborhood (absent = it uses what already exists, e.g. the roads) */
  venue?: {
    /** the plot reserved for it (see plots.ts) */
    plot: Plot['id'];
    /** place props / areas / buildings in plot-local meters (origin = plot's north-west corner, x east, y south) */
    build(v: VenueBuilder): void;
  };
  /**
   * Start a round. The runtime has already put the player in walk mode; the game moves them where
   * it wants (`ctx.walk.teleport`), shows a countdown if it likes, and later calls `ctx.finish`.
   */
  start(ctx: MiniGameContext): MiniGameSession;
}

export interface MiniGameSession {
  /** every frame while the game runs (after the walk controller moved the character), dt ≤ 0.05 */
  update(dt: number): void;
  /** keys while the game runs; return true to swallow the key (the walk controller then ignores it) */
  key?(code: string, down: boolean): boolean;
  /** the round ends (finished, quit or restarted): remove listeners, timers and anything you changed */
  dispose(): void;
}

/** A catalog item standing in the neighborhood, with its world placement. */
export interface PlacedProp {
  item: FurnitureItem;
  def: FurnitureDef;
  /** its 3D holder (position = site x / height / site y, rotation.y = −rotation) */
  holder: THREE.Object3D | undefined;
  /** site position (plan) */
  pos: Vec2;
  /** plan rotation */
  rotation: number;
  /** height of the ground it stands on */
  floorY: number;
}

export interface MiniGameHud {
  /** short status rows under the title, e.g. "הקפה 2/3", "מקום 1 מתוך 4" */
  lines?: string[];
  /** main number (points, deliveries…) and its label */
  score?: number | string;
  scoreLabel?: string;
  /** a clock in seconds (count-down or count-up is the game's business – it just shows m:ss.t) */
  timer?: number | null;
  /** big combo / multiplier text, e.g. "×3 קומבו" */
  combo?: string | null;
  /** bottom hint: which keys do what right now */
  hint?: string | null;
  /** 0..1 bar (fishing line tension, round progress…) with an optional label */
  bar?: { value: number; label?: string; color?: string; danger?: number } | null;
  /** navigation target: an arrow floats above the player and the HUD shows the distance */
  target?: { x: number; y: number; z?: number; label?: string } | null;
}

export interface MiniGameUi {
  /** merge into the HUD (pass null to clear a field) */
  set(patch: Partial<MiniGameHud>): void;
  /** a short floating message (trick names, "+250"), stacked near the center */
  popup(text: string, color?: string): void;
  /** a big centred banner for ~1.6 s ("הקפה אחרונה!", "שיא חדש!") */
  banner(text: string, ms?: number): void;
  /** 3‑2‑1‑צא! with sound; resolves when it says "go" */
  countdown(from?: number): Promise<void>;
}

export interface MiniGameResult {
  /** the number compared with the medals (points, or seconds when `lowerIsBetter`) */
  score: number;
  /** a sentence for the result card, e.g. "הגעת ראשונה מתוך 4!" */
  detail?: string;
  /** extra rows for the result card: [label, value] */
  stats?: Array<[string, string]>;
  /** false = the round was failed (time ran out before finishing): no medal, no record */
  completed?: boolean;
}

export interface MiniGameContext {
  readonly id: MiniGameId;
  readonly scene: THREE.Scene;
  /** add your 3D objects here: the group is removed (and its geometry disposed) when the round ends */
  readonly root: THREE.Group;
  readonly camera: THREE.PerspectiveCamera;
  readonly walk: WalkController;
  /** the current walk world (walls, boxes, seats, vehicles, groundAt…) */
  world(): WalkWorld;
  project(): Project;
  /** catalog items on the site (not inside buildings), optionally filtered */
  props(filter?: (item: FurnitureItem, def: FurnitureDef) => boolean): PlacedProp[];
  /** the game's plot (if it has a venue): convert plot-local meters to site coordinates */
  plotToSite(x: number, y: number): Vec2;
  /** height of the ground (sidewalks are raised) */
  groundAt(x: number, y: number): number;
  /** 0 by day … 1 at night; hour of the day */
  night(): number;
  hour(): number;
  /** particles: 'water' | 'steam' | 'smoke' | 'fire' | 'heart' | 'note' | 'zzz' | 'confetti' | 'bubble' | 'spark' | 'crumb' */
  emit(kind: 'water' | 'steam' | 'smoke' | 'fire' | 'heart' | 'note' | 'zzz' | 'confetti' | 'bubble' | 'spark' | 'crumb', at: THREE.Vector3, count?: number, spread?: number): void;
  /** short game sounds (see audio/types.ts Sfx and audio/sound.ts Sfx) */
  sfx(name: string, volume?: number): void;
  /** play a piano note (MIDI number) – melodies, success jingles */
  note(midi: number, volume?: number): void;
  readonly ui: MiniGameUi;
  /** end the round with a result (shows the result card with medal and record) */
  finish(result: MiniGameResult): void;
  /** leave without a result */
  quit(): void;
  /** seconds since the round started (frozen while paused) */
  elapsed(): number;
  /** deterministic random in [0, 1) for this round */
  random(): number;
}
