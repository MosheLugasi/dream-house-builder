# Catalog authoring guide

How to add furniture / accessories to the catalog. Read `src/catalog/types.ts` (the contract),
`src/catalog/kit.ts` (materials, geometry helpers, `Kit` builder, 2D helpers) and
`src/catalog/items/_parts.ts` (legs, cabinets, books, pots, taps). Good examples:
`items/living.ts` (sofas), `items/dining.ts`, `items/outdoor.ts`, `items/lighting.ts`.

## Item definition
```ts
const item: FurnitureDef = {
  id: 'sofa-chesterfield-3',          // globally unique, kebab-case
  name: 'ספה צ\'סטרפילד תלת-מושבית',   // Hebrew display name
  category: 'living',
  group: 'ספות',                       // Hebrew sub-group inside the category
  tags: ['קטיפה', 'קלאסי'],            // Hebrew search words (materials, style, synonyms)
  size: { w, d, h },                   // meters; w along X, d along Z, h up
  colors: [slot('fabric', 'ריפוד', '#2f5d50'), ...],  // user-editable colour slots
  seats: [{ x, z, height, facing: 0, kind: 'sit' }],   // where the character can sit / lie
  actions: [{ kind: 'tv' }],           // interactive behaviours in walk mode (below)
  build: ({ colors: c }) => { const k = new Kit(); ...; return k.g; },
  draw2d: (ctx, c) => sym(ctx, () => { ... }),
};
```
- Origin = centre of the footprint ON the floor. Front faces **+Z**, back (wall side) at **-Z**.
- The 3D object must fit inside the declared size: x ∈ [-w/2, w/2], z ∈ [-d/2, d/2], y ∈ [0, h]
  (ceiling items: hang down from y = 2.7, `mount: 'ceiling'`; wall items: `mount: 'wall'`,
  `elevation` = default height of the bottom, back flush at z = -d/2).
- `draw2d` draws a top-down plan symbol in meters: canvas x = local X, canvas y = local Z
  (front points DOWN). Stay inside the footprint. Use `sym`, `D.*`, `tint(color)`, `INK_SOFT`,
  `LINE_THIN`. Keep it architectural: soft fills, thin outlines, a few interior lines.
- Rugs / mats: `walkable: true`. Lamps: `light: LightSpec` + `actions: [{ kind: 'light' }]`.
- Budget: ≲ 4000 triangles per item (the preview flags more), few distinct materials.
  Small round things: 12–20 segments, not 64.
- Everything is procedural: no image files, no network.

## Realism checklist
- Use the right material: `M.wood`, `M.fabric`, `M.velvet` (sheen), `M.boucle`, `M.linen`,
  `M.knit`, `M.leather`, `M.rattan` (cane webbing), `M.wicker` (basket weave), `M.marble`,
  `M.terrazzo`, `M.stone`, `M.brushed` (stainless), `M.chrome`, `M.brass`, `M.blackMetal`,
  `M.lacquer` (piano black / gloss), `M.ceramic`, `M.glass`, `M.mirror`, `M.screen`,
  `M.glow`/`M.shade` (lamps), `M.leaf`/`M.foliage`/`M.bark` (plants), `M.fur` (pets, sheepskin),
  `M.art(style, seed, palette, w, h)` (paintings: use `artPlaneGeo(w, h)`),
  `M.rug(style, palette, w, d)` (top face of a `k.slab` of a centred w × d shape).
- Real proportions (seat height ≈ 0.45, table ≈ 0.75, counter 0.9, bar 1.05, bed 0.5…).
- Soft edges: `rbox`, `cushion`, `pillow`, bevelled `slab`s, lathes for turned/round shapes.
- Details sell realism: piping, seams, tufting buttons, stitched panels, feet glides, handles,
  shadow gaps, cushions that sag slightly, a book or vase on a shelf.
- Variety: build each family with ONE parametric builder and derive many variants (sizes,
  styles, materials, default colours) – e.g. a sofa builder with arm / back / leg / cushion
  options yields dozens of distinct sofas. Variants must look clearly different in 3D.

## Animated parts and actions (walk mode)
Mark animated pieces as parts with `const p = k.part('door', hingeX, y, hingeZ, { open: -1.7 })`
and build the part's meshes with the part builder `p` RELATIVE TO THE PIVOT. Parts are baked
separately and animated per instance by the runtime. Supported `actions` and what they need:

| kind | needs |
|---|---|
| `light` | `light` spec; optional part `glow` holding the emissive bulb/shade meshes |
| `tv`, `computer`, `game` | part `screen`: a flat mesh (e.g. `k.box(w, h, 0.002, M.screen())` inside the part) facing +Z |
| `music` | optional parts `spin` (record / reel, turns around local Y) and `pulse` (speaker cones, scaled to the beat) |
| `piano` | a `sit` seat at the bench (or none for a standing keyboard) |
| `guitar`, `drums` | – (character plays it next to the item) |
| `fan` | part `rotor` (blades), spins around local Y |
| `fire` | `at` = base of the flames (fireplace, fire pit, candle) |
| `water` | `at` = spout / shower head (water falls down from there) |
| `cook` | `at` = top of the pot / grill (steam rises); character stands in front (+Z) |
| `snack` | optional part `door` (fridge) – character eats/drinks |
| `open` | parts `door` (rotate around local Y by `userData.open` radians; pivot = hinge) and/or `drawer` (slide along +Z by `userData.open` meters) |
| `sleep` | a `lie` seat |
| `read` | – |
| `run`, `pedal`, `row` | `at` = where the character stands / sits (top of belt, saddle); parts `spin` (flywheel, belt rollers, pedals) turn around local X |
| `workout` | `at` = where the character stands |
| `bounce` | `at` = centre of the jumping surface |
| `swing` | part `swing` with its pivot at the top bar (rotates around local X); a `sit` seat (in item space at rest) |
| `rock` | part `rock` with its pivot at floor level (rotates around local X); usually a `sit` seat |
| `slide` | `path` = local points from the top of the slide to the bottom |
| `ball` | the whole item is the ball (sphere centred at x = z = 0, resting on the floor) |
| `hoop` | `at` = centre of the ring |
| `darts` | `at` = centre of the board (board faces +Z) |
| `pet` | parts `body` (pivot at the body centre), `head`, `tail`, `leg0..leg3` (pivot at hip/shoulder, legs hang down -Y); `variant: 'dog' | 'cat' | ...`. Origin between the paws, facing +Z |
| `fish` | part `fish` whose children are individual fish; `area` = water volume |
| `clock` | parts `hour`, `minute`, optional `second` with pivot at the dial centre; hands point UP (+Y) at rest and turn around local Z |
| `play` | `at` = where the character stands to play (pool, ping-pong, foosball…) |

Example (wardrobe door):
```ts
const door = k.part('door', -w / 2 + 0.01, 0.1, d / 2 - 0.01, { open: -1.75 }); // hinge on the left
door.rbox(dw, dh, 0.018, 0.002, front, dw / 2, 0, -0.009); // panel extends to the right of the hinge
```

## Verifying
```
npx vite --port <your port> &
node tools/catalog-preview/shoot.cjs /path/out.png "id=a,b,c&tile=420x340&cols=4" index   # 3D sheet + report
node tools/catalog-preview/shoot.cjs /path/out.png "id=a,b,c" plan                         # 2D symbols
```
`?cat=<category>` shows a whole category, `&seats` draws seat markers, `&lights` lamp positions,
`&mode=row` shows items side by side at true scale next to a 1.70 m figure.
The report lists items whose geometry exceeds the declared size – fix every hard error.
Look at the screenshots; iterate until items look convincing.
