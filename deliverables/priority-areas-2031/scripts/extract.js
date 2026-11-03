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
    const A = PeelApp, st = A.state, D = PeelDemand, P = PeelPhases, L = PeelLedger, T = PeelTiming, G = window.PeelDcGate;
    const crit = st.criteria, m = T.forecastModel();
    const gateOn = !!(G && G.loaded && G.loaded());
    const yearsOf = p => { const s = m.ss.sched.get(p.key), a = m.ss.after.get(p.key); return s || a ? { shares: L.bucketShares(s ? s.likely : null, a ? a.likely : 0, P.unbuiltOf(p)) } : null; };
    const all = st.projects;
    const rows = L.rows(all, { all: true, gateOf: gateOn ? p => G.rowOf(p) : null, yearsOf, scheduleOf: p => T.scheduleFor(p, m), asOf: Date.parse(st.snapshot.generatedAt) });
    const byId = new Map(rows.map(r => [r.id, r]));
    const ex = new Map(PeelExports.exportRows(all).map((r, i) => [all[i].key, r]));
    return { generatedAt: st.snapshot.generatedAt, gateOn, criteria: crit, n: all.length, devs: all.map(p => {
      const r = byId.get(p.key), e = ex.get(p.key);
      const est = b => D.estimate([p], crit, b, A.jobsOf);
      const bo = est('all'), done = est('completed'), rem = est('remaining');
      return {
        key: p.key, title: p.title, municipality: p.municipality, phase: p.phase, phaseLabel: P.PHASE_BY_KEY[p.phase].label,
        lat: p.lat, lng: p.lng, units: p.units || 0, completed: p.buildout ? p.buildout.completed : (p.phase === 'completed' ? p.units || 0 : 0),
        left: P.unbuiltOf(p) || 0, popBuildout: bo.population, popBuilt: done.population, popLeft: rem.population,
        jobs: A.jobsOf(p) || 0, jobsBuilt: done.employment.jobs, jobsLeft: rem.employment.jobs,
        to2031Share: r ? (r.buckets.to2031 || 0) : 0, expectedYear: r && r.expectedYear ? r.expectedYear.likely : null,
        expLow: r && r.expectedYear ? r.expectedYear.low : null, expHigh: r && r.expectedYear ? r.expectedYear.high : null,
        capacityStage: r ? r.capacityStage : null, tier: r && r.confidence ? r.confidence.tier : null,
        types: (p.types || []).join('; '), employmentUses: e ? e.employment_uses : '', nonresM2: e ? e.nonres_floor_area_m2 : '',
        files: (p.records || []).filter(x => x.kind === 'application').map(x => `${x.ref}${x.statusRaw ? ` (${x.statusRaw})` : ''}`).join('; '),
        permits: (p.records || []).filter(x => x.kind === 'permit').length,
        description: p.description || '', plan: e ? e.plan : '', siteAreaHa: p.siteAreaHa || null,
        pz: e ? e.pressure_zone : '', plant: e ? e.plant : '',
        rings: p.rings || p.geom || null,
      };
    }) };
  });
  fs.writeFileSync('devs.json', JSON.stringify(out));
  console.log('devs', out.n, 'gate', out.gateOn, out.generatedAt);
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
