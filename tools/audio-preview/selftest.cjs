/**
 * Headless audio self-test (nobody can listen in CI, so measure).
 *
 *   npx vite --port 5194 --strictPort &        (from the repo root)
 *   node tools/audio-preview/selftest.cjs [--no-wav] [--json out.json] [--port 5194]
 *
 * 1. Renders every sound on OfflineAudioContexts in Chromium (see selftest.ts), prints the measurement table and
 *    exits with code 1 when a rule is broken (silent, clipping, NaN, DC, ringing too long, leaked nodes).
 * 2. Writes a few representative renders as small WAV files into tools/audio-preview/samples/.
 * 3. Smoke-tests the LIVE engine: silent before unlock(), plays after, mute / volume persist, nothing throws.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const port = opt('--port', '5194');
const url = `http://localhost:${port}/tools/audio-preview/index.html`;

const pad = (s, n, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n));

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  // ---------------------------------------------------------------- offline measurements
  await page.goto(`${url}?selftest=1`);
  await page.waitForFunction(() => window.__selftest || window.__selftestError, null, { timeout: 600000 });
  const err = await page.evaluate(() => window.__selftestError);
  if (err) throw new Error(`self-test crashed: ${err}`);
  const res = await page.evaluate(() => window.__selftest);

  console.log(
    [pad('group', 9), pad('name', 32), pad('len', 6, true), pad('peak', 7, true), pad('rms', 7, true), pad('LA', 7, true), pad('centr', 6, true), pad('DC', 7, true), pad('vox', 4, true), pad('nodes', 6, true), ' result'].join(' '),
  );
  let group = '';
  for (const r of res.rows) {
    if (r.group !== group) console.log('-'.repeat(110));
    group = r.group;
    console.log(
      [
        pad(r.group, 9),
        pad(r.name, 32),
        pad(r.len.toFixed(2), 6, true),
        pad(r.peakDb.toFixed(1), 7, true),
        pad(r.rmsDb.toFixed(1), 7, true),
        pad(r.laDb.toFixed(1), 7, true),
        pad(r.centroid.toFixed(0), 6, true),
        pad(r.dc.toFixed(4), 7, true),
        pad(r.maxVoices, 4, true),
        pad(r.maxNodes, 6, true),
        ' ' + (r.fail.length ? 'FAIL: ' + r.fail.join('; ') : 'ok'),
      ].join(' '),
    );
  }
  console.log(`\n${res.rows.length} renders in ${(res.ms / 1000).toFixed(1)} s`);
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(res.rows, null, 1));

  if (!flag('--no-wav')) {
    const dir = path.join(__dirname, 'samples');
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, b64] of Object.entries(res.wavs)) {
      const file = path.join(dir, `${name}.wav`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log(`wrote ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1024).toFixed(0)} kB)`);
    }
  }

  // ---------------------------------------------------------------- live engine smoke test
  const failures = [...res.failures];
  const live = await browser.newPage();
  live.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  live.on('pageerror', (e) => errors.push(e.message));
  await live.goto(url);
  await live.waitForFunction(() => window.__audio);
  const report = await live.evaluate(async () => {
    const a = window.__audio;
    const out = {};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    localStorage.removeItem('dhb.audio');
    // before unlock: nothing exists, everything is a no-op
    a.play('horn');
    a.footstep('wood', 1);
    a.note(60);
    a.setAmbience({ outdoor: 1, night: 0 });
    a.setVehicle({ kind: 'car', speed: 3, throttle: 1 });
    a.setLoop('tv', true, 1);
    out.beforeUnlock = { unlocked: a.unlocked, ctx: a.debug() === null ? 'none' : 'EXISTS' };
    a.unlock();
    await sleep(300);
    const dbg = a.debug();
    out.afterUnlock = { unlocked: a.unlocked, state: dbg && dbg.ctx.state, sampleRate: dbg && dbg.ctx.sampleRate };
    const an = dbg.ctx.createAnalyser();
    an.fftSize = 2048;
    dbg.core.output.connect(an);
    const buf = new Float32Array(an.fftSize);
    const listen = async (ms) => {
      let peak = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        an.getFloatTimeDomainData(buf);
        for (const x of buf) peak = Math.max(peak, Math.abs(x));
        await sleep(15);
      }
      return peak > 1e-6 ? +(20 * Math.log10(peak)).toFixed(1) : -120;
    };
    // the ambience + tv requested before unlock are replayed
    out.replayedStateDb = await listen(1200);
    a.silence();
    await sleep(2200);
    out.afterSilenceDb = await listen(300);
    out.nodesAfterSilence = dbg.core.stats.nodes;
    a.play('horn');
    out.hornDb = await listen(600);
    // 200 live triggers: voices must drain completely
    const all = ['click', 'place', 'kick', 'bounce', 'switch-on', 'door-close', 'star', 'bark'];
    for (let i = 0; i < 200; i++) {
      a.play(all[i % all.length]);
      a.footstep('tile', 0.7);
      if (i % 4 === 0) a.note(60 + (i % 12), 0.2);
      await sleep(12);
    }
    out.voicesDuring = dbg.core.stats.voices;
    await sleep(3500);
    out.after200 = { voices: dbg.core.stats.voices, nodes: dbg.core.stats.nodes };
    // vehicle + watchdog: stop calling setVehicle and it must fade by itself
    for (let i = 0; i < 40; i++) {
      a.setVehicle({ kind: 'car', speed: i / 4, throttle: 1 });
      await sleep(16);
    }
    out.carDb = await listen(200);
    await sleep(2200);
    out.carForgotten = { db: await listen(200), nodes: dbg.core.stats.nodes };
    // mute / volume
    a.muted = true;
    await sleep(500);
    a.play('horn');
    out.muted = { db: await listen(300), state: dbg.ctx.state, unlocked: a.unlocked, stored: localStorage.getItem('dhb.audio') };
    a.muted = false;
    a.volume = 0.5;
    await sleep(300);
    a.play('horn');
    out.halfVolumeHornDb = await listen(600);
    out.stored = localStorage.getItem('dhb.audio');
    a.volume = 0.8;
    return out;
  });
  console.log('\nlive engine:', JSON.stringify(report, null, 1));
  const check = (ok, msg) => {
    if (!ok) failures.push(`live: ${msg}`);
  };
  check(report.beforeUnlock.unlocked === false && report.beforeUnlock.ctx === 'none', 'an AudioContext exists before unlock()');
  check(report.afterUnlock.unlocked === true && report.afterUnlock.state === 'running', 'not running after unlock()');
  check(report.replayedStateDb > -70, 'state requested before unlock was not replayed');
  check(report.afterSilenceDb < -60 && report.nodesAfterSilence === 0, 'silence() left sound or nodes behind');
  check(report.hornDb > -40 && report.hornDb < -3, `horn level ${report.hornDb}`);
  check(report.after200.voices === 0 && report.after200.nodes === 0, `voices/nodes left after 200 triggers: ${JSON.stringify(report.after200)}`);
  check(report.carDb > -60, 'car is silent');
  check(report.carForgotten.db < -60 && report.carForgotten.nodes === 0, 'vehicle keeps sounding when setVehicle stops being called');
  check(report.muted.db < -90 && report.muted.unlocked === true, 'mute does not silence');
  check(report.halfVolumeHornDb < report.hornDb - 4, 'volume has no effect');
  check(/"volume":0.5/.test(report.stored || ''), 'settings not persisted');

  await browser.close();
  if (errors.length) failures.push(...errors.map((e) => `page error: ${e}`));
  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  console.log('\nall audio checks passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
