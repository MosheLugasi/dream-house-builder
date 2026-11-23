/**
 * Screenshot the preview harness with Playwright.
 *
 *   npx vite --port 5198 &            (from the repo root)
 *   node tools/materials-preview/shoot.cjs <name> "<query string>" [--cards]
 *
 * Saves tools/materials-preview/shots/<name>.png (whole grid). With --cards every finish is
 * also saved separately as shots/<name>/<id>.png. Prints generation timings as JSON.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const [name = 'all', query = '', ...flags] = process.argv.slice(2);
  const outDir = path.join(__dirname, 'shots');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(process.env.VW || 1340), height: 900 } });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text());
  });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://localhost:5198/tools/materials-preview/index.html?${query}`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 600000 });
  await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => {}))));
  await page.locator('#grid').screenshot({ path: path.join(outDir, `${name}.png`) });
  if (flags.includes('--cards')) {
    fs.mkdirSync(path.join(outDir, name), { recursive: true });
    for (const card of await page.locator('.card[data-id]').all()) {
      const id = await card.getAttribute('data-id');
      await card.screenshot({ path: path.join(outDir, name, `${id}.png`) });
    }
  }
  console.log(JSON.stringify(await page.evaluate(() => window.__timings)));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
