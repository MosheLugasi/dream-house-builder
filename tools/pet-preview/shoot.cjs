/**
 * Screenshot the pet preview with Playwright.
 *   npx vite --port 5192 --strictPort &        (from the repo root)
 *   node tools/pet-preview/shoot.cjs <name> "<query>" [outDir]
 * Saves <outDir or tools/pet-preview/shots>/<name>.png and prints the contact report summary.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const [name = 'dog-turn', query = '', out] = process.argv.slice(2);
  const outDir = out || path.join(__dirname, 'shots');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('[page]', m.text());
  });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  const url = `http://localhost:5192/tools/pet-preview/index.html?${query}`;
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
      await page.waitForTimeout(250);
      // the shared Vite dep cache may trigger one reload: make sure the page is still the ready one
      ok = await page.evaluate(() => window.__ready === true);
    } catch (e) {
      console.error('retry', attempt, String(e).split('\n')[0]);
    }
  }
  const err = await page.evaluate(() => window.__error);
  if (err) console.error('PAGE ERROR', err);
  await page.locator('#wrap').screenshot({ path: path.join(outDir, `${name}.png`) });
  const rep = await page.evaluate(() => window.__report);
  if (rep) {
    const t = rep.tiles || [];
    console.log(
      JSON.stringify({
        id: rep.id,
        triangles: rep.triangles,
        groups: rep.drawCallsMainPass,
        bones: rep.bones,
        minY_mm: t.map((x) => +(x.minY * 1000).toFixed(1)),
        paws_mm: t.map((x) => x.paws.map((p) => +(p * 1000).toFixed(0)).join('/')),
        bbox: t.length ? { maxY: +t[0].maxY.toFixed(3), minZ: +t[0].minZ.toFixed(3), maxZ: +t[0].maxZ.toFixed(3), maxX: +t[0].maxX.toFixed(3) } : null,
      }),
    );
  }
  if (process.env.GAIT) {
    for (const sp of process.env.GAIT.split(',')) {
      const id = new URLSearchParams(query).get('pet') || 'pet-dog';
      console.log(JSON.stringify(await page.evaluate(([i, s]) => window.__gaitCheck(i, s), [id, Number(sp)])));
    }
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
