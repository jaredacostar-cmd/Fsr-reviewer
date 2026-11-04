// Load the Peel Growth Pipeline app headless (published data in data/) and dump, for every development,
// the app's own figures: units/people/jobs at build-out, built (existing), left to build and the
// Forecast's share of left-to-build expected 2026-2031.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const ROOT = '/home/user/Fsr-reviewer';
const serve = require(ROOT + '/tests/browser/serve.js');
(async () => {
  const srv = await serve(ROOT, 8791);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const CDN = __dirname + '/cdn';
  await ctx.route('https://unpkg.com/**', route => { const m = /unpkg\.com\/([^@]+)@([^/]+)\/(.+)$/.exec(route.request().url()); const f = m && `${CDN}/${m[1]}-${m[2]}/package/${m[3]}`; if (f && fs.existsSync(f)) route.fulfill({ path: f, contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript' }); else route.abort(); });
  await ctx.route(/arcgis|services\d*\.arcgis|tile|openstreetmap|esri/i, route => { const u = route.request().url(); if (u.startsWith('http://localhost')) return route.continue(); route.abort(); });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.addInitScript(() => { for (const k of ['tourDone', 'homeTourDone', 'mapTourOffered']) localStorage.setItem(`peel-dev:${k}`, 'true'); });
  await page.goto('http://localhost:8791/');
  await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 300000 });
  // the servicing permits (commitment) and the forecast model
  await page.evaluate(() => window.PeelDcGate && PeelDcGate.load ? PeelDcGate.load() : null).catch(() => {});
  await page.waitForFunction(() => { const T = window.PeelTiming; const m = T && T.forecastModel && T.forecastModel(); return m && m.ss && m.homes; }, null, { timeout: 300000 }).catch(e => console.error('forecast wait', e.message));
  await page.waitForTimeout(3000);
  const out = await page.evaluate(() => {
    const polys = {};
    for (const p of PeelApp.state.projects) {
      if (p.phase === 'cancelled') continue;
      const apps = p.records.filter(r => r.kind === 'application' && r.poly && r.phase !== 'cancelled');
      if (apps.length) polys[p.key] = apps.map(r => ({ ref: r.ref, status: r.statusRaw, units: r.units || null, poly: r.poly }));
    }
    return { n: Object.keys(polys).length, polys };
  });
  fs.writeFileSync('polys.json', JSON.stringify(out.polys)); console.log('devs with outlines', out.n);
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
