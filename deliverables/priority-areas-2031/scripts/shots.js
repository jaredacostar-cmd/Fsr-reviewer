// Screenshots of the Peel Growth Pipeline app, one per priority area: the area drawn as the app's own
// selection (its lasso polygon), every development in it selected, the app's selection result open,
// and each planning application labelled with its development number (A08-012 -> "12").
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = '/home/user/Fsr-reviewer';
const serve = require(ROOT + '/tests/browser/serve.js');
const R = require('./results.json');
const OUT = ROOT + '/deliverables/priority-areas-2031/app-screens';
const only = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const slug = n => n.replace(/\//g, '-').replace(/ /g, '_');
(async () => {
  const srv = await serve(ROOT, 8792);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  const CDN = __dirname + '/cdn';
  await ctx.route('https://unpkg.com/**', route => { const m = /unpkg\.com\/([^@]+)@([^/]+)\/(.+)$/.exec(route.request().url()); const f = m && `${CDN}/${m[1]}-${m[2]}/package/${m[3]}`; if (f && fs.existsSync(f)) route.fulfill({ path: f, contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript' }); else route.abort(); });
  await ctx.route(/arcgis|services\d*\.arcgis|tile|openstreetmap|esri/i, route => { const u = route.request().url(); if (u.startsWith('http://localhost')) return route.continue(); route.abort(); });
  const page = await ctx.newPage();
  page.on('pageerror', e => {});
  await page.addInitScript(() => { for (const k of ['tourDone', 'homeTourDone', 'mapTourOffered']) localStorage.setItem(`peel-dev:${k}`, 'true'); localStorage.setItem('peel-dev:theme', JSON.stringify('light')); });
  await page.goto('http://localhost:8792/');
  await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 300000 });
  await page.waitForTimeout(4000);
  // the full map (Home's sidebar: Full map)
  await page.locator('text=Full map >> visible=true').first().click();
  await page.waitForTimeout(4000);
  await page.mouse.move(800, 600);
  await page.addStyleTag({ content: '.info-card{display:none!important}' });
  for (const a of R.areas) {
    if (only && a.code !== only) continue;
    const rows = a.rows.map(r => ({ key: r.key, n: r.kind === 'Planning application' ? String(+r.id.split('-')[1]) : null, lat: r.lat, lng: r.lng }));
    const info = await page.evaluate(({ ring, rows, title }) => {
      const AS = PeelAreaSelect, M = PeelMapCore.map, st = PeelApp.state;
      const byKey = new Map(st.projects.map(p => [p.key, p]));
      AS.clearSelection();
      AS.selAreas = [ring];
      let n = 0;
      for (const r of rows) { const p = byKey.get(r.key); if (p) { AS.selection.set(p.key, p); n++; } }
      AS.drawSelection();
      if (window._lbl) window._lbl.remove();
      window._lbl = L.layerGroup().addTo(M);
      for (const r of rows) if (r.n) L.marker([r.lat, r.lng], { opacity: 0, interactive: false, icon: L.divIcon({ className: '', html: '' }) })
        .bindTooltip(r.n, { permanent: true, direction: 'right', offset: [6, 0], className: 'area-lbl' }).addTo(window._lbl);
      if (!document.getElementById('area-lbl-css')) { const s = document.createElement('style'); s.id = 'area-lbl-css'; s.textContent = '.area-lbl{font:700 11px/1 Arial;padding:1px 3px;background:rgba(255,255,255,.9);border:1px solid #7a0000;color:#111;box-shadow:none}.area-lbl:before{display:none}'; document.head.appendChild(s); }
      PeelMeasure.openSelectionResult(title, n);
      const b = L.latLngBounds(ring.map(([x, y]) => [y, x]));
      M.invalidateSize();
      M.fitBounds(b, { padding: [60, 60] });
      return { n };
    }, { ring: a.ring, rows, title: `${a.code} · ${a.name}` });
    await page.mouse.move(3, 3);
    await page.waitForTimeout(3500);
    const f = `${OUT}/${a.code}_${slug(a.name)}_app.png`;
    await page.screenshot({ path: f });
    console.log(a.code, info.n, f);
  }
  if (!only || only === 'A00') {
    await page.evaluate(({ areas }) => {
      const AS = PeelAreaSelect, M = PeelMapCore.map, st = PeelApp.state;
      const byKey = new Map(st.projects.map(p => [p.key, p]));
      AS.clearSelection(); if (window._lbl) window._lbl.remove();
      window._lbl = L.layerGroup().addTo(M);
      AS.selAreas = areas.map(a => a.ring);
      let n = 0;
      for (const a of areas) { for (const k of a.keys) { const p = byKey.get(k); if (p) { AS.selection.set(p.key, p); n++; } }
        const c = L.latLngBounds(a.ring.map(([x, y]) => [y, x])).getNorthEast();
        L.marker(c, { opacity: 0, interactive: false, icon: L.divIcon({ className: '', html: '' }) }).bindTooltip(a.code, { permanent: true, direction: 'right', className: 'area-lbl' }).addTo(window._lbl); }
      AS.drawSelection();
      PeelMeasure.openSelectionResult('19 priority areas (A01–A19)', n);
      M.invalidateSize();
      M.fitBounds(L.latLngBounds(areas.flatMap(a => a.ring.map(([x, y]) => [y, x]))), { padding: [30, 30] });
    }, { areas: R.areas.map(a => ({ code: a.code, ring: a.ring, keys: a.rows.map(r => r.key) })) });
    await page.mouse.move(3, 3);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/A00_all_areas_app.png` });
    console.log('A00 done');
  }
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
