// Screenshot the character preview harness (vite must be running on port 5195):
//   node tools/character-preview/shoot.cjs <out.png | -> "<query>" [width] [height]
// The query may also be a path starting with / (e.g. the creator test page). METRICS=1 prints window.__metrics.
const { chromium } = require('playwright');
(async () => {
  const [out, query = '', w = '1600', h = '900'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  const url = query.startsWith('/') ? `http://localhost:5195${query}` : `http://localhost:5195/tools/character-preview/index.html?${query}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__done === true, null, { timeout: 90000 });
      await page.waitForTimeout(300);
      // the shared dep cache may trigger one reload: make sure we are still done
      if (await page.evaluate(() => window.__done === true)) break;
    } catch (e) {
      if (attempt === 3) { console.error('FAILED', e.message); }
    }
  }
  if (out !== '-') await page.screenshot({ path: out });
  const metrics = await page.evaluate(() => window.__metrics ?? null).catch(() => null);
  if (process.env.METRICS) console.log(JSON.stringify(metrics, null, 1));
  if (errs.length) console.log('ERRORS:\n' + errs.slice(0, 8).join('\n'));
  await browser.close();
})();
