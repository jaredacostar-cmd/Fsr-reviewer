#!/usr/bin/env node
/*
 * End-to-end check of the latest-aerial basemap and the aerial completion check against
 * the live city imagery services, in headless Chromium. Run in CI (needs network):
 *   APP=http://localhost:8000/ OUT=/tmp/aerial node scripts/aerial-e2e.js
 * Prints each sample project's result and saves screenshots to OUT.
 */
'use strict';
const fs = require('fs');
const { chromium } = require('playwright');
const APP = process.env.APP || 'http://localhost:8000/';
const OUT = process.env.OUT || '/tmp/aerial';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const failed = [];
  page.on('requestfailed', r => failed.push(`${r.failure() && r.failure().errorText} ${r.url().slice(0, 140)}`));
  await page.goto(APP);
  await page.waitForFunction(() => window.PeelApp && PeelApp.state.projects.length > 0, null, { timeout: 120000 });

  // 1. Latest aerial basemap in each municipality.
  for (const [name, lat, lng] of [['mississauga', 43.5931, -79.6411], ['brampton', 43.6766, -79.8178], ['caledon', 43.8770, -79.7330]]) {
    await page.evaluate(([lat, lng]) => PeelApp.map.setView([lat, lng], 17, { animate: false }), [lat, lng]);
    await page.waitForTimeout(6000);
    const tiles = await page.evaluate(() => [...document.querySelectorAll('.leaflet-tile-loaded')].map(t => t.src.split('/rest/services/')[1] || t.src.split('/')[2]).reduce((m, k) => { const key = k.split('/').slice(0, 3).join('/'); m[key] = (m[key] || 0) + 1; return m; }, {}));
    console.log(`basemap ${name}: ${JSON.stringify(tiles)}`);
    await page.screenshot({ path: `${OUT}/basemap-${name}.png` });
  }
  console.log('attribution:', await page.evaluate(() => document.querySelector('.leaflet-control-attribution').textContent));

  // 1b. Raw colour of each imagery source at a rural and an urban point.
  const colour = await page.evaluate(async () => {
    const out = [];
    const pts = { 'Brampton farmland': [-79.83, 43.735], 'Brampton suburb': [-79.80, 43.70], 'Mississauga park': [-79.66, 43.565], 'Mississauga core': [-79.6411, 43.5931], 'Caledon farmland': [-79.85, 43.85] };
    const srcs = [];
    for (const [muni, src] of Object.entries(PEEL_CONFIG.imagery)) {
      const ys = Object.keys(src.years).map(Number).sort((a, b) => b - a);
      for (const y of [ys[0], ys[4], ys[ys.length - 1]]) srcs.push([muni, y, src.years[y].url]);
    }
    for (const [muni, y, url] of srcs) {
      let info = {};
      try { info = await (await fetch(`${url}?f=json`)).json(); } catch (e) {}
      for (const [pname, [lng, lat]] of Object.entries(pts)) {
        if (!pname.startsWith(muni)) continue;
        const [x, yy] = PeelAerial.merc(lng, lat);
        const img = new Image(); img.crossOrigin = 'anonymous';
        const u = PeelAerial.exportUrl(url, [x - 150, yy - 150, x + 150, yy + 150], 100, 100);
        const ok = await new Promise(r => { img.onload = () => r(true); img.onerror = () => r(false); img.src = u; });
        if (!ok) { out.push(`${muni} ${y} ${pname}: load failed`); continue; }
        const c = document.createElement('canvas'); c.width = 100; c.height = 100; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, 100, 100).data;
        let r = 0, g = 0, b = 0, sat = 0, n = 0; const cls = {};
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; n++; r += d[i]; g += d[i + 1]; b += d[i + 2]; sat += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); const k = PeelAerial.classify(d[i], d[i + 1], d[i + 2]); cls[k] = (cls[k] || 0) + 1; }
        out.push(`${muni} ${y} ${pname}: bands=${info.bandCount} type=${info.pixelType} n=${n} meanRGB=${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)} sat=${Math.round(sat / n)} classes=${JSON.stringify(cls)}`);
      }
    }
    return out;
  });
  console.log('\n' + colour.join('\n'));

  // 2. Aerial check on sample projects.
  const picks = await page.evaluate(() => {
    const ps = PeelApp.state.projects.filter(p => p.lat != null);
    const by = f => ps.filter(f).sort((a, b) => (b.units || 0) - (a.units || 0));
    const take = (arr, n) => arr.slice(0, n).map(p => p.key);
    return [
      ...take(by(p => /151 City Centre/i.test(p.title)), 1),
      ...take(by(p => /1250 South Service/i.test(p.title)), 1),
      ...take(by(p => p.municipality === 'Mississauga' && p.phase === 'completed' && p.units >= 100), 2),
      ...take(by(p => p.municipality === 'Mississauga' && p.phase === 'review' && p.units >= 100), 2),
      ...take(by(p => p.municipality === 'Brampton' && p.phase === 'construction'), 2),
      ...take(by(p => p.municipality === 'Brampton' && p.phase === 'review' && p.units >= 50), 1),
      ...take(by(p => p.municipality === 'Brampton' && p.phase === 'completed' && p.units === 1), 2),
      ...take(by(p => p.municipality === 'Caledon' && p.units >= 100), 2),
      ...take(by(p => p.municipality === 'Caledon' && p.phase === 'completed' && p.units === 1), 1),
    ];
  });
  const rows = [];
  for (const key of [...new Set(picks)]) {
    const t0 = Date.now();
    const r = await page.evaluate(async key => {
      const p = PeelApp.state.projects.find(x => x.key === key);
      try {
        const a = await PeelAerial.check(p, PEEL_CONFIG, { phaseLabel: p.phase });
        const st = s => s && `built ${Math.round(s.built * 100)} veg ${Math.round(s.veg * 100)} soil ${Math.round(s.soil * 100)} cov ${Math.round(s.coverage * 100)}`;
        return { title: p.title, muni: p.municipality, phase: p.phase, units: p.units, first: p.first && p.first.toISOString().slice(0, 10),
          prob: Math.round(a.result.probability * 100), status: a.result.status, years: `${a.years.before}->${a.years.latest}`,
          before: st(a.before && a.before.stats), now: st(a.latest.stats), change: a.change != null ? Math.round(a.change * 100) : null,
          fp: a.fp.now != null ? `${a.fp.before != null ? Math.round(a.fp.before * 100) : '?'}->${Math.round(a.fp.now * 100)}` : '-', site: a.geom.source,
          signals: a.result.signals.map(s => `${s.effect > 0 ? '+' : s.effect < 0 ? '-' : '='} ${s.text}`) };
      } catch (e) { return { title: p.title, muni: p.municipality, phase: p.phase, error: e.message }; }
    }, key);
    r.ms = Date.now() - t0;
    rows.push(r);
    console.log(`\n${r.title} [${r.muni}, ${r.phase}, ${r.units} units, first ${r.first}] ${r.ms} ms`);
    if (r.error) { console.log(`  ERROR ${r.error}`); continue; }
    console.log(`  => ${r.prob}% ${r.status} | years ${r.years} | before: ${r.before} | now: ${r.now} | class change ${r.change}% | footprints ${r.fp} | site: ${r.site}`);
    for (const s of r.signals) console.log(`     ${s}`);
  }

  // 3. The panel itself, as a user sees it.
  for (const [i, key] of [...new Set(picks)].slice(0, 4).entries()) {
    await page.evaluate(key => { const p = PeelApp.state.projects.find(x => x.key === key); document.querySelector('#f-search').value = ''; }, key);
    await page.evaluate(key => window.__open = PeelApp.state.projects.find(x => x.key === key), key);
    await page.evaluate(() => { const ev = new Event('x'); });
    await page.evaluate(() => PeelApp.showDetail(window.__open));
    await page.waitForFunction(() => document.querySelector('#aerial-check .aerial-pct, #aerial-check p:not(.aerial-loading)'), null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => document.querySelector('#aerial-check').scrollIntoView());
    await page.screenshot({ path: `${OUT}/panel-${i}.png` });
  }
  console.log('\nerrors:', JSON.stringify(errors));
  console.log('failed requests:', failed.length, JSON.stringify(failed.slice(0, 10)));
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(rows, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
