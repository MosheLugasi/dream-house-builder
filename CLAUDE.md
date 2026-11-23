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
- Agents working in parallel share one scratchpad directory: use a private subfolder and never `pkill` by a generic name.

## Verifying visual changes
Chromium + Playwright are preinstalled. Launch with
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL, drive the app through
`window.__store` (Zustand store) and `window.__engine`, and look at screenshots before claiming a visual change works.
