/**
 * Screenshot the catalog preview with Playwright (WebGL via SwiftShader).
 *
 *   npx vite --port 5199 &                     (from the repo root)
 *   node tools/catalog-preview/shoot.cjs <out.png> "<query string>" [plan]
 *
 * Prints the per-item report (bbox / triangles / notes) of the 3D sheet as JSON lines.
 */
const { chromium } = require('playwright');

(async () => {
  const [out = 'catalog.png', query = '', which = 'index'] = process.argv.slice(2);
  const port = process.env.PORT || 5199;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: Number(process.env.VW || 1400), height: 900 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('[page]', m.text());
  });
  await page.goto(`http://localhost:${port}/tools/catalog-preview/${which}.html?${query}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000 });
  await page.screenshot({ path: out, fullPage: true });
  if (which === 'index') {
    const rep = await page.evaluate(() => window.__report);
    for (const r of rep) if (!r.ok || (r.notes && r.notes.length)) console.log(JSON.stringify(r));
    console.log(`items: ${rep.length}`);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
