# Dream House Builder – working notes

Hebrew-first (RTL) browser game: design houses in 2D, view/furnish in 3D, walk inside with a character.
Product requirements: `docs/requirements.md`. Architecture + roadmap: `docs/architecture.md`.

## Commands
- `npm run dev` – Vite dev server (port 5173)
- `npm test` – Vitest unit tests (`tests/`)
- `npm run build` – `tsc --noEmit` + production build into `dist/` (relative base, static hosting friendly)

## Conventions
- All lengths in meters, angles in radians. Plan `(x, y)` maps to 3D `(x, z)`; +Y is up.
- Furniture: origin at footprint center on the floor, front faces local +Z. Plan rotation θ ⇒ `rotation.y = -θ`.
- `Project` in the Zustand store is the single source of truth; never mutate it outside `update()` (Immer).
  Use `{ transient: true }` + one `checkpoint()` for drags so a gesture is one undo step.
- Rooms are derived from walls (`model/graph.ts`), never stored. Room styling is anchored by a point (`RoomStyle`).
- `src/catalog/types.ts` and `src/materials/types.ts` are contracts – extend with optional fields only.
- No network assets: textures and models are procedural.
- UI strings are Hebrew; keep code, comments and identifiers in English.
- The saved file format is versioned (`version: 2`); structural changes need a migration in `io/storage.ts#parseProject`.
- Two edit scopes: `site` (neighborhood map; items in site coordinates) and `building` (inside one building; building-local
  coordinates). Convert with `toSite` / `toLocal` from `model/types.ts`.
- Stairs and vehicles are catalog items (`stair` / `vehicle` on `FurnitureDef`, both `noBake`). Kit `box()` takes the height of
  the box's BOTTOM, not its center.
- Placed items can be resized and mirrored (`item.size`, `item.mirror`); always read sizes through `itemSize(def, item)` and
  item-local points through `src/catalog/placed.ts` (never `def.size` / `def.seats` / `def.light` directly for a placed item).
  `parametric` items rebuild at the size and publish `userData.anchors`; the rest are stretched (docs/catalog-authoring.md).
- Walk-mode behaviour of items is declared with `FurnitureDef.actions` + animated `Kit.part(...)` pieces and run by
  `render3d/Interactions.ts` (guide: `docs/catalog-authoring.md`). Self-simulating things carry a runtime in `userData`:
  play equipment (`ride` + `userData.ride: RideRuntime`) and realistic pets (`pet` + `userData.pet: PetRuntime`).
  Play state (lamp on, tap running, ball/pet position) is never written to `Project`.
- Time of day is a continuous hour in `view.timeOfDay`; `Atmosphere` derives sun, sky and `night` (0..1) from it.
- Player progress (avatar look, sticker album, stars) lives in `src/game/progress.ts` (localStorage `dhb.player`), not in the project file.
- Two procedural sound engines: `sound` (`src/audio/sound.ts`: item effects, instruments, music) and `audio`
  (`src/audio/index.ts`, contract `src/audio/types.ts`: footsteps, ambience, vehicles, game sfx). Both stay silent until the first user gesture; mute both together.
- Lamps do not own `PointLight`s: `LightManager` assigns a pool of 8 lights to the nearest lit sources.
- Neighborhood mini-games: `src/game/minigames/` (contract `types.ts`, one folder per game, venues installed into plots by
  `plots.ts#installVenue`, runtime `render3d/MiniGames.ts`). Game modules are imported by `sampleProject()`: never import
  `store/store.ts` from them at module level (circular import) – use the `MiniGameContext`.
- Several sessions may push to `main`: `git fetch` and merge before pushing, never force-push.
- Agents working in parallel share one scratchpad directory: use a private subfolder and never `pkill` by a generic name.

## Verifying visual changes
Chromium + Playwright are preinstalled. Launch with
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL, drive the app through
`window.__store` (Zustand store), `window.__walk`, `window.__progress` and `window.__engine`, and look at screenshots before claiming a visual change works.
