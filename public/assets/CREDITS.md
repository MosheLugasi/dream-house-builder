# Asset credits and licences

Every file under `public/assets/` was downloaded once, converted for the web and committed; nothing is fetched
from the network at runtime. All files are **CC0 1.0** (public domain dedication) except the plant models,
which are **CC BY 4.0** and need the attribution below wherever the game is published.

Conversion tools (not shipped): glTF-Transform (meshopt, quantization, WebP), Pillow (resizing, WebP, colour
grading), three.js `FBXLoader` / `GLTFExporter` (FBX → glTF), a small RGBE script (HDRI 2k → 1k).

## Vehicles – `vehicles/` (CC0)

From the Innerscene Free Parts Library (https://www.innerscene.com/tools/library – "everything is public domain
(CC0)", terms: https://www.innerscene.com/tools/library/terms). Obtained through the CC0 re-exports in
https://github.com/mohammedemara48-code/police-command (`public/models/`, CREDITS.md there), which already had the
interiors removed and a lighter `-lo` variant.

| File | Source model | Licence |
|---|---|---|
| `hatch.glb`, `hatch-lo.glb` (מכונית קטנה) | "Silver five-door compact hatchback", Innerscene – https://www.innerscene.com/tools/library/3d-parts/silver-five-door-compact-hatchback-6bf4a878 | CC0 1.0 |
| `sedan.glb`, `sedan-lo.glb` (מכונית משפחתית) | "White four-door sedan", Innerscene – https://www.innerscene.com/tools/library/3d-parts/white-four-door-sedan-1f271353 | CC0 1.0 |
| `van.glb`, `van-lo.glb` (מיניבוס) | "Passenger van with side windows", Innerscene – https://www.innerscene.com/tools/library/3d-parts/passenger-van-with-side-windows-474dd4a2 | CC0 1.0 |

Changes: scaled (hatch 0.94, sedan 0.95), centred, front turned to +Z, body joined per material, one wheel
re-pivoted on its axle (the game mirrors it for all four), textures dropped (the game assigns its own
materials), meshopt-compressed.

## Plants – `plants/` (CC BY 4.0 – attribution required)

| File | Source | Author | Licence |
|---|---|---|---|
| `oak.glb` (עץ נשיר) | "Oak trees pack (17var, LODs, seasons, gameready)" – https://sketchfab.com/3d-models/oak-trees-pack-17var-lods-seasons-gameready-a5e4e64f9f1d4089bdcc6170a9333393 | LOLIPOP (@lolipop_1707) | CC BY 4.0 |
| `bush.glb` (שיח) | "Bush models pack (gameready, LODs)" – https://sketchfab.com/3d-models/bush-models-pack-gameready-lods-f2d9ffd3e6a94cf0b9464ccd66a4c2f8 | LOLIPOP (@lolipop_1707) | CC BY 4.0 |

**Attribution:** "Oak trees pack" and "Bush models pack" by LOLIPOP (@lolipop_1707), licensed under CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). Modified: one variant each, LOD0 + LOD1 only, converted from FBX
to glTF, textures resized to 1024 px WebP, meshopt-compressed. Obtained through the npm package
`com.mavrodiev.asset-library` 1.4.0 (its `Third Party Notices.md` lists the same source and licence).

## Texture sets – `textures/` (CC0)

Each set is `color.webp` (1024, ambient occlusion lightly baked in), `normal.webp` (1024, OpenGL convention) and
`rough.webp` (512). Sources marked (M) came through the npm package `com.mavrodiev.asset-library` 1.4.0 (which
lists their origin and licence), (P) through https://github.com/mohammedemara48-code/police-command
(`public/textures/`, CC0).

| Folder | Used by finish | Source | Licence |
|---|---|---|---|
| `asphalt` | asphalt | Poly Haven "Clean Asphalt" – https://polyhaven.com/a/clean_asphalt (M) | CC0 1.0 |
| `grass` | grass (re-graded greener) | Poly Haven "Leafy Grass", Charlotte Baglioni – https://polyhaven.com/a/leafy_grass (M) | CC0 1.0 |
| `sand` | sand | Poly Haven "Coast Sand 01", Rob Tuytel – https://polyhaven.com/a/coast_sand_01 (M) | CC0 1.0 |
| `gravel` | gravel | Poly Haven "Rocky Trail", Amal Kumar – https://polyhaven.com/a/rocky_trail (M) | CC0 1.0 |
| `sandstone-blocks` | jerusalem-stone (colour matched) | Poly Haven "Sandstone Blocks 05" – https://polyhaven.com/a/sandstone_blocks_05 (P) | CC0 1.0 |
| `paving-stones` | pavers | ambientCG PavingStones038 – https://ambientcg.com/view?id=PavingStones038 (M) | CC0 1.0 |
| `brick-red` | brick-red | ambientCG Bricks051 – https://ambientcg.com/view?id=Bricks051 (M) | CC0 1.0 |
| `brick-white` | brick-white | ambientCG Bricks060 – https://ambientcg.com/view?id=Bricks060 (M) | CC0 1.0 |
| `plaster` | stucco-white, stucco-sand (neutral grey, tinted per finish) | Poly Haven "Plaster Grey 04" – https://polyhaven.com/a/plaster_grey_04 (M) | CC0 1.0 |
| `marble` | marble-white | ambientCG Marble012 – https://ambientcg.com/view?id=Marble012 (M) | CC0 1.0 |
| `floor-tiles-large` | porcelain-grey | Poly Haven "Large Floor Tiles 02" – https://polyhaven.com/a/large_floor_tiles_02 (M) | CC0 1.0 |
| `floor-tiles-terracotta` | terracotta-tiles | Poly Haven "Floor Tiles 08" – https://polyhaven.com/a/floor_tiles_08 (M) | CC0 1.0 |
| `kit/wood` | `M.wood` (neutral grey detail, tinted by the material colour) | ambientCG Wood048 – https://ambientcg.com/view?id=Wood048 (M) | CC0 1.0 |
| `kit/fabric` | `M.fabric` (the same) | ambientCG Fabric019 – https://ambientcg.com/view?id=Fabric019 (M) | CC0 1.0 |
| `kit/marble` | `M.marble` (the same) | ambientCG Marble012 – https://ambientcg.com/view?id=Marble012 (M) | CC0 1.0 |

## HDRIs – `hdri/` (CC0)

Downsampled from 2k to 1k (equirectangular Radiance `.hdr`).

| File | Source | Author | Licence |
|---|---|---|---|
| `kloofendal_48d_partly_cloudy_puresky_1k.hdr` (day) | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky (M) | Greg Zaal, Poly Haven | CC0 1.0 |
| `highway_bridge_sunset_1k.hdr` (sunset) | https://polyhaven.com/a/highway_bridge_sunset (M) | Dario Barresi, Jenelle van Heerden, Poly Haven | CC0 1.0 |
| `modern_buildings_night_1k.hdr` (night) | https://polyhaven.com/a/modern_buildings_night (M) | Greg Zaal, Poly Haven | CC0 1.0 |
