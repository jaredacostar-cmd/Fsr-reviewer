'use strict';
// SPEC 1.4 acceptance, in the browser: for each wastewater plant and the South Peel water system, the
// % shown on the Overview, Wastewater › Plants, the DC tab and the scope card equals
// PeelCapacity.of(). Run against a served copy of the site:
//   APP_URL=http://localhost:8765/ node tests/e2e/capacity.e2e.js
// (PLAYWRIGHT: path to the playwright module; CDN_DIR: local copies of unpkg packages, offline.)
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const URL = process.env.APP_URL || 'http://localhost:8765/';
const CDN = process.env.CDN_DIR;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (CDN) await ctx.route('https://unpkg.com/**', route => { const m = /unpkg\.com\/([^@]+)@([^/]+)\/(.+)$/.exec(route.request().url()); const f = m && `${CDN}/${m[1]}-${m[2]}/package/${m[3]}`; if (f && fs.existsSync(f)) route.fulfill({ path: f, contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript' }); else route.abort(); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('peel-dev:tourDone', 'true'); });
  await page.goto(URL);
  await page.waitForFunction(() => window.PeelApp && PeelApp.state.svcModel && PeelApp.state.reports && window.PeelCapacity && PeelCapacity.of('wsys:southPeel'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const T = window.PeelAnalysisTabs, wait = ms => new Promise(f => setTimeout(f, ms));
    const refs = ['plant:Lakeview', 'plant:Clarkson', 'plant:Inglewood', 'wsys:southPeel'];
    const want = Object.fromEntries(refs.map(k => { const c = PeelCapacity.of(k); return [k, [Math.round(c.pctCommitted), Math.round(c.pctBuildout)]]; }));
    const got = {};
    const put = (where, ref, v) => { (got[ref] = got[ref] || {})[where] = v; };
    // Overview bars.
    T.showFootTab('overview'); await wait(800);
    for (const el of document.querySelectorAll('.ov-cap')) {
      const b = el.querySelector('[data-ss]'); const m = /(\d+)%<\/b> committed → <b>(\d+)%/.exec(el.innerHTML);
      if (b && m) put('overview', b.dataset.ss === 'wsys:lake' ? 'wsys:southPeel' : b.dataset.ss, [+m[1], +m[2]]);
    }
    // Wastewater › Plants: the tiles (build-out % of rated) and the table (committed %).
    T.setWwSub('plants'); T.showFootTab('ww'); await wait(800);
    const short = { 'G.E. Booth': 'plant:Lakeview', 'Lakeview': 'plant:Lakeview', 'Clarkson': 'plant:Clarkson', 'Inglewood': 'plant:Inglewood' };
    for (const t of document.querySelectorAll('#plants-body .tiles > *')) {
      const txt = t.textContent.replace(/\s+/g, ' '); const name = Object.keys(short).find(n => txt.includes(n)); const m = /(\d+)\s*%\s*of rated at build-out/.exec(txt);
      if (name && m) put('ww tiles (build-out)', short[name], [null, +m[1]]);
    }
    for (const tr of document.querySelectorAll('#plants-body table.cap-t tbody tr')) {
      const txt = tr.textContent; const name = Object.keys(short).find(n => tr.cells[0].textContent.includes(n)); const m = /^(\d+)%/.exec(tr.cells[2].textContent.trim());
      if (name && m) put('ww table (committed)', short[name], [+m[1], null]);
    }
    // Scope cards.
    for (const ref of refs) {
      window.PeelSvcScope.open(ref === 'wsys:southPeel' ? 'wsys:lake' : ref); await wait(600);
      const box = document.querySelector('.ss-tiles'); const txt = box ? box.parentElement.innerHTML : ''; const m = /(\d+)%<\/strong> of (?:its )?rated[^]*?<strong>(\d+)%<\/strong> at build-out/.exec(txt);
      if (m) put('scope card', ref, [+m[1], +m[2]]);
      window.PeelSvcScope.close && window.PeelSvcScope.close();
    }
    // DC tab constraints.
    T.setDcSub && T.setDcSub('timing'); T.showFootTab('dca'); await wait(1500);
    for (const el of document.querySelectorAll('[data-dcn-cons]')) {
      const id = el.dataset.dcnCons; const small = el.parentElement.querySelector('small'); const m = small && /(\d+)% committed → (\d+)% build-out of rated/.exec(small.textContent);
      const ref = id === 'wsys:southPeel' ? id : /^plant:/.test(id) ? id : null;
      if (ref && m) put('DC tab', ref, [+m[1], +m[2]]);
    }
    return { want, got };
  });
  let bad = 0;
  for (const [ref, w] of Object.entries(r.want)) {
    for (const [where, v] of Object.entries(r.got[ref] || {})) {
      const ok = (v[0] == null || v[0] === w[0]) && (v[1] == null || v[1] === w[1]);
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'DIFF'} ${ref.padEnd(18)} ${where.padEnd(24)} shown ${v.map(x => x == null ? '–' : `${x}%`).join(' → ')}  capacity() ${w.map(x => `${x}%`).join(' → ')}`);
    }
    if (!r.got[ref]) { console.log(`MISS ${ref}: not found on any tab`); bad++; }
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
