'use strict';
// Browser click-paths, run in CI on every pull request (.github/workflows/browser.yml) and locally:
//   npm run browser            (PLAYWRIGHT: path to the playwright module; CDN_DIR: local copies of the
//                               unpkg packages, for offline runs; CHROMIUM: a browser executable)
// Each path is what a person does, with real clicks and keys; a path fails on a wrong result or any
// page error. The live municipal and Region services are not needed: the paths use the published
// data in data/.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const serve = require('./serve.js');
const ROOT = path.join(__dirname, '..', '..');
const PORT = +(process.env.PORT || 8790);
const CDN = process.env.CDN_DIR;
const results = [];

async function open(browser, { w = 1440, h = 900, fresh = false, slowApp = 0, slowData = null, prefs = null } = {}) {
  // (slowData: no service worker, which would answer the held files itself)
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, serviceWorkers: slowData ? 'block' : 'allow' });
  // (js/app.js held back: the data files and the map arrive first, as on a slow connection)
  if (slowApp) await ctx.route(/\/js\/app\.js/, async route => { await wait(slowApp); route.continue(); });
  // (slowData: data files held back, { 'dc-gate.json': ms }, as a slow connection delivers a large one late)
  for (const [f, ms] of Object.entries(slowData || {})) await ctx.route(`**/data/${f}*`, async route => { await wait(ms); route.continue(); });
  if (CDN) await ctx.route('https://unpkg.com/**', route => { const m = /unpkg\.com\/([^@]+)@([^/]+)\/(.+)$/.exec(route.request().url()); const f = m && `${CDN}/${m[1]}-${m[2]}/package/${m[3]}`; if (f && fs.existsSync(f)) route.fulfill({ path: f, contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript' }); else route.abort(); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (!fresh) await page.addInitScript(() => { for (const k of ['tourDone', 'homeTourDone', 'mapTourOffered']) localStorage.setItem(`peel-dev:${k}`, 'true'); });
  // (prefs: what an earlier release left in this browser, stored once, before the app first reads it)
  if (prefs) await page.addInitScript(p => { if (sessionStorage.getItem('prefsSet')) return; for (const [k, v] of Object.entries(p)) localStorage.setItem(`peel-dev:${k}`, JSON.stringify(v)); sessionStorage.setItem('prefsSet', '1'); }, prefs);
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  return { ctx, page, errors, ev: (f, a) => page.evaluate(f, a) };
}
async function check(name, browser, opts, fn) {
  const t0 = Date.now(); let s;
  try {
    s = await open(browser, opts);
    const fails = [];
    const expect = (ok, what) => { if (!ok) fails.push(what); };
    await fn(s, expect);
    if (s.errors.length) fails.push(`page errors: ${s.errors.slice(0, 3).join(' | ')}`);
    results.push({ name, ok: !fails.length, fails, ms: Date.now() - t0 });
  } catch (e) {
    results.push({ name, ok: false, fails: [String(e.message || e).slice(0, 300)], ms: Date.now() - t0 });
  } finally { if (s) await s.ctx.close(); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await serve(ROOT, PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

  await check('first run: Home opens with the role picker, and the tour leaves nothing open', browser, { fresh: true }, async ({ page, ev }, expect) => {
    expect(await ev(() => PeelWorkspaces.mode()) === 'home', 'opens on Home');
    await page.waitForSelector('.tour-card [data-tour-role]', { timeout: 15000 });
    await page.click('[data-tour-role="engineer"]');
    for (let i = 0; i < 8 && await page.$('.tour-card'); i++) { await page.click('.tour-card [data-tour-next], .tour-card [data-tour-help]'); await wait(500); }
    expect(!(await page.$('.tour-card')), 'the tour ends');
    expect(await ev(() => !(window.DevScope && DevScope.current())), 'no development left open');
  });

  await check('a slow start: js/app.js arriving after the data and the map throws nothing', browser, { slowApp: 3000 }, async ({ ev }, expect) => {
    expect(await ev(() => document.querySelectorAll('.leaflet-marker-icon, .leaflet-interactive').length > 0), 'the map draws');
  });

  await check('Check a site: search, pick, the stage chip opens how the stage was set', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.openPage('site')); await wait(1500);
    const box = page.locator('#f-search').first();
    await box.click(); await page.keyboard.type('0 heritage', { delay: 30 }); await wait(1200);
    expect(await ev(() => PeelApp.state.search === ''), 'typing does not filter');
    const li = page.locator('#search-sug li[data-i]', { hasText: '0 HERITAGE RD' }).first();
    await li.dispatchEvent('mousedown'); await wait(2500);
    expect(await ev(() => (DevScope.current() || {}).title === '0 HERITAGE RD'), 'the picked development opens');
    // (the page settles after a pick: it re-renders once its panels are worked out)
    await wait(1500);
    const boxOpen = () => [...document.querySelectorAll('#home [data-stage-box]')].some(b => !b.hidden && b.textContent.includes('Next:'));
    await page.locator('#home [data-stage-chip].pnl-chip').first().click();
    const opened = await page.waitForFunction(boxOpen, null, { timeout: 5000 }).then(() => true, () => false);
    expect(opened, 'the stage box opens');
  });

  await check('the header count opens the full table', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.setMode('full')); await wait(1500);
    await page.locator('#analysis .pnl-head .pnl-chip-btn').first().click(); await wait(1500);
    expect(await ev(() => document.getElementById('analysis').classList.contains('ft-on')), 'full table open');
  });

  await check('Start over clears filters, search and the development, back to Home', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.setMode('full')); await wait(1000);
    await ev(() => { PeelApp.state.search = 'heritage'; PeelApp.applyFilters(); PeelDevNav.showDetail(PeelApp.state.projects.find(p => /^0 HERITAGE R/i.test(p.title) && p.units === 5146)); }); await wait(2000);
    await page.locator('#tb-restart').click(); await wait(2000);
    const s = await ev(() => ({ mode: PeelWorkspaces.mode(), search: PeelApp.state.search, dev: !!DevScope.current(), chips: document.querySelectorAll('#active-filters .chip').length }));
    expect(s.mode === 'home', 'back to Home'); expect(s.search === '', 'search cleared'); expect(!s.dev, 'development closed'); expect(s.chips === 0, 'no filter chips (the default years are not a filter)');
  });

  await check('a page link opens the full map with a way back', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.openPage('tight')); await wait(2500);
    const link = page.locator('#home [data-ss]').first();
    if (await link.count()) { await link.click(); await wait(2000); } else await ev(() => PeelWorkspaces.setMode('full'));
    expect(await ev(() => PeelWorkspaces.mode()) === 'full', 'on the full map');
    expect(await ev(() => /Back to Servicing capacity/.test((document.getElementById('back-bar') || {}).textContent || '')), 'the back bar names the page');
    await page.locator('#back-bar [data-ws-back]').click(); await wait(1500);
    expect(await ev(() => PeelWorkspaces.mode() === 'home' && PeelWorkspaces.page() === 'tight'), 'back on the page');
  });

  await check('keyboard: arrow keys move between developments, Enter opens one', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.setMode('full')); await wait(1000);
    await ev(() => { const p = PeelApp.state.projects.find(q => /^0 HERITAGE R/i.test(q.title) && q.units === 5146); PeelMapCore.map.setView([p.lat, p.lng], 15); }); await wait(2000);
    await ev(() => PeelMapCore.map.getContainer().focus());
    await page.keyboard.press('ArrowRight'); await wait(400);
    const cur = await ev(() => (PeelMapKeys.current() || {}).title || null);
    expect(!!cur, 'a development is under the cursor');
    expect(await ev(() => /Enter opens it/.test(document.getElementById('map-kb-live').textContent)), 'the live region names it');
    await page.keyboard.press('ArrowDown'); await wait(300);
    await page.keyboard.press('Enter'); await wait(2000);
    expect(await ev(() => !!DevScope.current()), 'Enter opens it');
  });

  await check('phone: Home\'s menu behind one button, the page actions in reach', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.openPage('tight')); await wait(2500);
    const a = await ev(() => { const r = document.querySelector('#home .page-foot .pnl-acts').getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: innerHeight }; });
    expect(a.bottom <= a.h && a.bottom > a.h - 120, 'the action bar sits at the bottom of the screen');
    await page.locator('#home .home-menu-btn').click(); await wait(800);
    const groups = await ev(() => [...document.querySelectorAll('#home .home-side .home-g')].filter(x => x.offsetParent).length);
    expect(groups >= 4, 'the menu opens grouped');
  });

  await check('phone: the full map\'s way back sits above the bottom sheet and takes a tap', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    await page.locator('[data-ws-full]:visible').first().click(); await wait(2000);
    const back = () => ev(() => { const b = document.querySelector('#back-bar [data-ws-back]').getBoundingClientRect(), a = document.getElementById('analysis').getBoundingClientRect(), hit = document.elementFromPoint(b.left + 20, b.top + b.height / 2); return { bottom: Math.round(b.bottom), sheet: Math.round(a.top), hit: !!(hit && hit.closest('#back-bar')), snap: PeelApp.getAnalysisSnap(), stored: localStorage.getItem('peel-dev:analysisSnap') }; });
    for (const snap of ['peek', 'half', 'full']) {
      await ev(s => PeelApp.setAnalysisSnap(s), snap); await wait(800);
      const r = await back();
      expect(r.bottom <= r.sheet && r.hit, `${snap}: "Back to Home" above the sheet, not under it (${JSON.stringify(r)})`);
    }
    await ev(() => PeelApp.setAnalysisSnap('peek')); await wait(500);
    await page.click('#back-bar [data-ws-back]'); await wait(1500);
    expect(await ev(() => PeelWorkspaces.mode()) === 'home', 'the tap goes back to Home');
    // A site's Inquiry draft (kept at the development) opens the sheet full for itself only: the way back
    // still takes a tap; × puts the sheet back; nothing remembered for the next visit.
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    await ev(() => { const q = PeelApp.state.projects.find(x => x.phase === 'approved' && x.units > 300); PeelDevNav.showDetail(q); }); await wait(2500);
    await ev(() => PeelWorkspaces.openPage('site')); await wait(2000);
    await page.locator('#home .page-foot [data-inquiry]').tap(); await wait(2500);
    const d = await back(), pre = await ev(() => !!document.querySelector('#scope-body:not([hidden]) .tinq-pre'));
    expect(pre && d.snap === 'full' && d.hit && d.bottom <= d.sheet, `the draft on a full sheet, "Back to Check a site" above it and tappable (${JSON.stringify(d)})`);
    await page.locator('#scope-body .pnl-x[data-scope-result-close]').tap(); await wait(1500);
    const x = await back();
    expect(x.snap === 'peek' && x.hit && x.stored === '"peek"', `× puts the sheet back at its peek, nothing remembered (${JSON.stringify(x)})`);
  });

  // A filter change paints the map and the view in sight, and leaves the rest for when the page is
  // free: no single freeze of several seconds (it was 5-6 s, the servicing model rebuilt twice).
  await check('a filter change: no long freeze, and the Growth views it put off are there when opened', browser, {}, async ({ page, ev }, expect) => {
    await page.locator('[data-ws-full]:visible').first().click(); await wait(2000);
    await ev(() => PeelAnalysisTabs.showFootTab('overview')); await wait(1000);
    const t = await ev(() => new Promise(done => { const lt = []; const o = new PerformanceObserver(l => { for (const e of l.getEntries()) lt.push(e.duration); }); o.observe({ type: 'longtask' }); PeelApp.state.muni = 'Brampton'; PeelApp.applyFilters(); setTimeout(() => { o.disconnect(); done(Math.max(0, ...lt)); }, 4000); }));
    expect(t < 2500, `the longest freeze ${Math.round(t)} ms`);
    expect(await ev(() => PeelUtil.laterPending()) === 0, 'nothing left waiting once the page is free');
    await ev(() => PeelAnalysisTabs.showFootTab('growth', 'areas')); await wait(800);
    expect(await ev(() => /Since the 2021 Census, Brampton has added/.test(document.querySelector('#growth-census-body').innerText)), 'Growth › Areas is for the new filter');
    await ev(() => { PeelApp.state.muni = ''; PeelApp.applyFilters(); });
  });

  // One set of numbers: Home, the workspace pages and the full map's panels show the same figure for
  // the same thing, for Peel and each municipality and at every counting basis (Scenario).
  await check('pages and the full map agree: units, left to build, people, jobs, the first trigger, this week', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    for (const muni of ['', 'Mississauga', 'Brampton', 'Caledon']) for (const basis of ['all', 'buildout', 'committed', 'remaining']) {
      await ev(([m, b]) => { PeelApp.state.muni = m; PeelApp.state.sp = []; PeelApp.state.mtsa = []; PeelApp.state.basis = b; PeelApp.applyFilters(); }, [muni, basis]);
      await wait(2500);
      const r = await ev(() => {
        const num = s => +String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/[^\d.]/g, '');
        const figs = s => [...(s && s.figures || []), ...((s && s.groups) || []).flatMap(g => g.figures || [])].filter(Boolean);
        const find = (s, re) => figs(s).find(f => re.test(`${f.u} ${f.label}`));
        const ov = PeelOverviewTab.lastAreaSpec(), gr = PeelWsPages.build('growth'), home = PeelWsPages.build('home'), tight = PeelWsPages.build('tight'), week = PeelWsPages.build('week');
        const set = PeelApp.state.filtered, G = Growth.pipelineTotals(set), L = PeelLayers.pipeline(set);
        const trig = s => { const f = figs(s).find(x => /first 90% trigger/.test(x.label)); return f ? `${f.v} ${String(f.ctx).replace(/<[^>]+>/g, '').match(/(?:Peel-wide · )?([^·]+?)(?: reaches| ·|$)/)[1].trim()}` : null; };
        return {
          ovUnits: num(find(ov, /^units /).v), grUnits: num(find(gr, /^units /).v),
          ovPeople: num(find(ov, /^people /).v), grPeople: num(find(gr, /^people /).v),
          ovJobs: num(find(ov, /^jobs /).v), grJobs: num(find(gr, /^jobs /).v),
          left: Math.round(G.left), notBuilt: Math.round(L.notBuilt),
          homeTrig: trig(home), tightTrig: trig(tight),
          homeWeek: num(find(home, /this week/).v), weekPage: num((week.answer.match(/<strong>([\d,]+)<\/strong> change/) || [])[1] || 0),
        };
      });
      const at = `${muni || 'Peel'}, ${basis}`;
      expect(r.ovUnits === r.grUnits, `${at}: units ${r.ovUnits} on the map, ${r.grUnits} on Growth in an area`);
      expect(r.ovPeople === r.grPeople, `${at}: people ${r.ovPeople} on the map, ${r.grPeople} on Growth in an area`);
      expect(r.ovJobs === r.grJobs, `${at}: jobs ${r.ovJobs} on the map, ${r.grJobs} on Growth in an area`);
      expect(r.left === r.notBuilt, `${at}: left to build ${r.left} (Growth), not yet built ${r.notBuilt} (the stage chart)`);
      expect(r.homeTrig === r.tightTrig, `${at}: first trigger ${r.homeTrig} on Home, ${r.tightTrig} on Servicing capacity`);
      expect(r.homeWeek === r.weekPage, `${at}: ${r.homeWeek} changes on Home, ${r.weekPage} on This week`);
    }
    await ev(() => { PeelApp.state.muni = ''; PeelApp.state.basis = 'all'; PeelApp.applyFilters(); });
  });

  // A site's sections: Check a site shows every map tab's panel for the development (Summary,
  // Growth, Servicing, Capital, Files), each the map's own answer.
  await check('Check a site: every map tab is a section of the page, with the map’s own answer', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    await ev(() => { const p = PeelApp.state.projects.find(q => q.phase === 'approved' && q.units > 300); PeelDevNav.showDetail(p); });
    await wait(2500);
    await ev(() => PeelWorkspaces.openPage('site')); await wait(2000);
    const secs = await ev(() => [...document.querySelectorAll('#home [data-ws-sec]')].map(b => b.dataset.wsSec));
    expect(secs.join() === 'summary,growth,servicing,capital,files', `the sections: ${secs.join()}`);
    for (const id of secs) {
      await page.click(`#home [data-ws-sec="${id}"]`); await wait(2500);
      const r = await ev(id => {
        const p = DevScope.current(), s = PeelSections.specFor(id, p) || (id === 'summary' ? PeelPanel.get('overview:').spec : null);
        const ans = document.querySelector('#home .home-answer'), strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        return { on: (document.querySelector('#home .page-sec.on') || {}).dataset ? document.querySelector('#home .page-sec.on').dataset.wsSec : null, page: strip(ans && ans.innerHTML), map: strip(s && s.answer) };
      }, id);
      expect(r.on === id, `${id}: the section bar shows ${r.on}`);
      expect(r.map && r.page === r.map, `${id}: the page's answer is the map panel's ("${r.page.slice(0, 60)}" / "${String(r.map).slice(0, 60)}")`);
    }
    // Summary: the path line under Wastewater (a development on the mapped catchments: its plant), and the
    // DC projects it relies on named in Infrastructure coming.
    await page.click('#home [data-ws-sec="summary"]'); await wait(2500);
    const pl = await ev(() => {
      const p = DevScope.current(), f = PeelSvcData.svcFacts(p), rel = PeelDevVerdict.reliedOn(PeelMasterPlan.devNeeds(p) || []);
      const row = n => [...document.querySelectorAll('#home .pnl-row')].find(r => ((r.querySelector('.pnl-r-name') || {}).textContent || '').includes(n));
      const path = row('Path to the plant'), inf = row('Infrastructure coming'), names = [...document.querySelectorAll('#home .pnl-row .pnl-r-name')].map(x => x.textContent);
      return { plant: !!(f && f.pl), path: path ? path.querySelector('.pnl-r-line').textContent : null, after: names.indexOf('Path to the plant') === names.findIndex(x => /Wastewater/.test(x)) + 1, rel: rel.length ? rel[0] : null, late: rel.some(x => x.late), inf: inf ? inf.querySelector('.pnl-r-line').textContent : '', chip: inf ? (inf.querySelector('.pnl-r-top > :last-child') || {}).textContent : '' };
    });
    if (pl.plant) expect(pl.path && pl.path.includes('→') && /outlet: (Automatic|Confirmed|Set by hand)/.test(pl.path) && pl.after, `Summary: Path to the plant under Wastewater ("${pl.path}")`);
    else expect(!pl.path, 'no plant on the path: no path line');
    // (by number and name, as the search lists a DC project; one late: the row is something to check)
    if (pl.rel) expect(pl.inf.startsWith(`Relies on ${pl.rel.key}${pl.rel.name ? ` – ${pl.rel.name}` : ''} (`), `Infrastructure coming names ${pl.rel.key} ${pl.rel.name || ''} first ("${pl.inf.slice(0, 100)}")`);
    if (pl.late) expect(pl.chip !== 'OK', `a late DC project: Infrastructure coming is not OK (${pl.chip})`);
  });

  // Explore: one sidebar entry for Growth in an area, Check a site, Review an FSR, Forecast and Study
  // area; the one search at the top of each; a site picked opens its page; its trail steps back up; the
  // FSR review is one of its sections.
  await check('Explore: one entry, the search on every view, a site and back up its trail, its FSR review', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    const side = await ev(() => [...document.querySelectorAll('#home .home-side [data-ws-page]')].map(b => b.dataset.wsPage));
    expect(side.includes('explore') && !side.some(id => ['site', 'fsr', 'growth', 'outlook', 'study'].includes(id)), `the sidebar: ${side.join()}`);
    await page.click('#home .home-side [data-ws-page="explore"]'); await wait(2000);
    const a = await ev(() => ({ page: PeelWorkspaces.page(), search: !!document.querySelector('#home #page-search #search-box'), on: (document.querySelector('#home .home-ws.on') || {}).dataset, secs: [...document.querySelectorAll('#home .page-sec')].map(b => b.textContent) }));
    expect(a.page === 'growth', `Explore opens on Growth in an area (${a.page})`);
    expect(a.search, 'the search box is at the top of the page');
    expect(a.on && a.on.wsPage === 'explore', 'Explore is lit in the sidebar');
    expect(a.secs.join() === 'Growth,Forecast,Servicing,Capital', `the area's sections: ${a.secs.join()}`);
    // The area's Servicing: the map's own Servicing › Capacity answer; back to Growth.
    await page.click('#home .page-sec[data-ws-asec="servicing"]'); await wait(2000);
    const sv = await ev(() => { const st = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return { on: (document.querySelector('#home .page-sec.on') || {}).textContent, page: st(document.querySelector('#home .home-answer').innerHTML), map: st(PeelPanel.get('svc:capacity').spec.answer) }; });
    expect(sv.on === 'Servicing' && sv.page.includes(sv.map), `the area's Servicing is the map's ("${sv.page.slice(0, 50)}")`);
    await page.click('#home .page-sec[data-ws-page="growth"]'); await wait(1500);
    // A municipality, then a development from its list: its page, with its trail.
    await page.click('#home [data-ws-drill="m:Brampton"]'); await wait(1500);
    await page.locator('#home [data-ws-pick][data-ws-as="site"]').first().click(); await wait(3500);
    const s = await ev(() => ({ page: PeelWorkspaces.page(), dev: !!DevScope.current(), trail: [...document.querySelectorAll('#home [data-ws-explore]')].map(b => b.textContent), secs: [...document.querySelectorAll('#home .page-sec')].map(b => b.textContent), search: !!document.querySelector('#home #page-search #search-box') }));
    expect(s.page === 'site' && s.dev, `a development opens its page (${s.page})`);
    expect(s.trail[0] === 'Peel' && s.trail.includes('Brampton'), `its trail: ${s.trail.join(' › ')}`);
    expect(s.secs.join() === 'Summary,Growth,Servicing,Capital,Files,FSR review', `its sections: ${s.secs.join()}`);
    expect(s.search, 'the search stays at the top');
    const lm = await ev(() => ({ inPage: !!document.querySelector('#home #page-map-slot #map'), chips: [...document.querySelectorAll('#home [data-ws-layer]')].map(b => b.dataset.wsLayer) }));
    expect(lm.inPage, 'the live map is on the site\u2019s page');
    expect(lm.chips.join() === 'devs,ex-water,ex-sanitary,ex-storm,dcw,cons,ea', `its layer chips: ${lm.chips.join()}`);
    // Its FSR review, then back to a section of the site.
    await page.click('#home .page-sec[data-ws-page="fsr"]'); await wait(2500);
    const f = await ev(() => ({ page: PeelWorkspaces.page(), box: !!document.querySelector('#home [data-pnl-fsrbox]'), on: (document.querySelector('#home .page-sec.on') || {}).textContent }));
    expect(f.page === 'fsr' && f.box && f.on === 'FSR review', `the FSR review (${f.page}, ${f.on})`);
    await page.click('#home .page-sec[data-ws-sec="growth"]'); await wait(2500);
    const g = await ev(() => ({ page: PeelWorkspaces.page(), on: (document.querySelector('#home .page-sec.on') || {}).textContent }));
    expect(g.page === 'site' && g.on === 'Growth', `back on the site at Growth (${g.page}, ${g.on})`);
    // A step up the trail: Growth in an area at Brampton, the site closed.
    await page.locator('#home [data-ws-explore="m:Brampton"]').first().click(); await wait(2500);
    const u = await ev(() => ({ page: PeelWorkspaces.page(), dev: !!DevScope.current(), name: (document.querySelector('#home h1') || {}).textContent }));
    expect(u.page === 'growth' && !u.dev && /Brampton/.test(u.name), `up the trail to Brampton (${u.page}, ${u.name})`);
  });

  // Find from every page (navigation phase 1): the one search and Draw an area in every page's header;
  // on a page a pick opens what it found; the full map's search works as before.
  // (type q into the box, then pick the row that matches want: its label, a text it starts with or holds,
  // the kind under it, a place row; tap: a touch, else the mousedown the list listens for)
  const findPick = async (page, ev, q, want, tap = false) => {
    await ev(() => { document.getElementById('f-search').value = ''; });
    const box = page.locator('#f-search');
    if (tap) await box.tap(); else await box.click();
    await page.keyboard.type(q, { delay: 20 }); await wait(1200);
    const i = await ev(w => { const li = [...document.querySelectorAll('#search-sug li[data-i]')].find(x => !x.classList.contains('sug-filter') && (!w.place || !!x.querySelector('.sug-pin'))
      && (!w.label || ((x.querySelector('.sug-pin + span') || {}).firstChild || {}).nodeValue === w.label) && (!w.starts || x.textContent.startsWith(w.starts))
      && (w.has || []).every(t => x.textContent.includes(t)) && (!w.kind || new RegExp(w.kind).test((x.querySelector('small') || {}).textContent || ''))); return li ? li.dataset.i : null; }, want);
    if (i == null) return false;
    const li = page.locator(`#search-sug li[data-i="${i}"]`);
    if (tap) await li.tap(); else await li.dispatchEvent('mousedown');
    await wait(2500);
    return true;
  };
  // (the largest secondary plan with 100+ units: Growth in an area's own node)
  const bigPlan = ev => ev(() => { const r = PeelPlanTables.compute(), n = [...r.nodes.values()].find(x => x.kind === 'plan' && x.m.planned >= 100); return n ? { id: n.id, name: n.name, area: n.areaId } : null; });
  await check('Find from every page: Home’s header search routes a file number, a plan, a facility and a DC project; the full map’s search still filters', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && PeelApp.state.dcInfra && PeelApp.state.areas, null, { timeout: 120000 });
    for (const id of ['home', 'tight', 'week', 'projects', 'help']) {
      await ev(i => PeelWorkspaces.openPage(i), id); await wait(1200);
      const h = await ev(() => ({ box: !!document.querySelector('#home .page-find #page-search #search-box'), draw: !!document.querySelector('#home .page-draw[data-ws-go="study"]') }));
      expect(h.box && h.draw, `${id}: the search and Draw an area in the page header`);
    }
    // A file number (a development matched by it alone): its page at Files, the file marked in its tree.
    // (one in its tree's fold of earlier files when there is one: the mark opens the fold)
    const f = await ev(() => {
      const all = PeelApp.state.projects, lc = s => String(s || '').toLowerCase(), T = window.PeelFileTree;
      let first = null;
      for (const p of all) {
        if (p.lat == null) continue;
        const d = T && T.of(p), nodes = d ? T.build(d).all : [];
        for (const r of p.records || []) {
          const q = lc(r.ref);
          if (r.kind !== 'application' || q.length < 7 || !/\d/.test(q) || lc(p.title).includes(q) || p.records.some(x => lc(x.address).includes(q))) continue;
          const n = nodes.find(x => x.ref === r.ref); let top = n; while (top && top.parent >= 0) top = nodes[top.parent];
          const fold = !!(top && top.i > 0); if (first && !fold) continue;
          if (all.filter(o => o.lat != null && (lc(o.title).includes(q) || o.records.some(x => lc(x.address).includes(q) || lc(x.ref).startsWith(q)))).length === 1) { const x = { key: p.key, title: p.title, ref: r.ref, tree: !!n, fold }; if (fold) return x; first = x; }
        }
      }
      return first;
    });
    expect(!!f, 'a development found by a file number alone');
    if (f) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
      expect(await findPick(page, ev, f.ref, { has: [f.title, f.ref] }), `${f.ref} in the list`);
      const s = await ev(() => ({ page: PeelWorkspaces.page(), key: (DevScope.current() || {}).key, files: !!document.querySelector('#home .page-sec.on[data-ws-sec="files"]') }));
      expect(s.page === 'site' && s.key === f.key && s.files, `its page at Files (${s.page}, at Files: ${s.files})`);
      await wait(1000);
      const m = await ev(r => { const b = document.querySelector(`#home .tr-row > div > .tr-ref[data-dev-file="${CSS.escape(r)}"]`), row = b && b.closest('.tr-row'), fold = row && row.closest('details.tr-same'); return { row: !!row, hit: !!(row && row.classList.contains('tr-hit')), open: fold ? fold.open : null }; }, f.ref);
      // (a file in its tree: its row is there, marked, its fold of earlier files opened)
      if (f.tree) {
        expect(m.row, `${f.ref}: its row in the file tree`);
        expect(m.hit, 'the file is marked in the tree');
        if (f.fold) expect(m.open === true, `its fold of earlier files opened (${m.open})`);
      }
    }
    // A plan: Growth in an area at it, the map and the other pages unfiltered.
    const pl = await bigPlan(ev);
    expect(!!pl, 'a plan with 100+ units');
    if (pl) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
      expect(await findPick(page, ev, pl.name, { label: pl.name, kind: 'secondary plan|character area', place: true }), `${pl.name} in the list`);
      const g = await ev(() => ({ page: PeelWorkspaces.page(), name: (document.querySelector('#home h1') || {}).textContent, sp: PeelApp.state.sp.length }));
      expect(g.page === 'growth' && g.name === pl.name && g.sp === 0, `Growth in an area at ${pl.name} (${g.page}, "${g.name}", ${g.sp} plan filters)`);
      // Its Area report (PDF) is the plan's, not the map's developments (the drill does not filter).
      const rt = await ev(() => { const R = PeelReports, was = R.areaReport, t = []; R.areaReport = (d, title) => t.push([title, d.length]); try { const b = document.querySelector('#home .page-foot [data-ws-areareport]'); if (b) b.click(); } finally { R.areaReport = was; } return t; });
      expect(rt.length === 1 && rt[0][0].includes(pl.name) && rt[0][1] > 0, `the Area report is the plan's (${JSON.stringify(rt)})`);
    }
    // A plant: its scope on Servicing capacity's map.
    await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
    expect(await findPick(page, ev, 'clarkson', { kind: 'Wastewater treatment plant', place: true }), 'Clarkson (the plant) in the list');
    const c = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), ss: PeelApp.state.ss }));
    expect(c.mode === 'ws' && c.ws === 'tight' && c.ss === 'plant:Clarkson', `the plant's scope on Servicing capacity's map (${c.mode}, ${c.ws}, ${c.ss})`);
    // A DC project: Capital › DC timing at it (in place, on the Capital page), its developments by tier.
    const dc = await ev(() => { const l = PeelApp.state.dcInfra.wastewater.lines.find(x => x.p && x.p.length >= 5); return l ? { p: l.p, key: `wastewater:${l.p}` } : null; });
    expect(!!dc, 'a wastewater DC project');
    if (dc) {
      await ev(() => { if (PeelSvcScope.current()) PeelSvcScope.close(); PeelWorkspaces.openPage('home'); }); await wait(1200);
      expect(await findPick(page, ev, dc.p, { starts: `DC project ${dc.p}`, place: true }), `DC project ${dc.p} in the list`);
      const d = await ev(() => ({ page: PeelWorkspaces.page(), sel: PeelDcProjects.state.sel }));
      expect(d.page === 'projects' && d.sel === dc.key, `Capital at the project (${d.page}, ${d.sel})`);
      const back = await page.waitForSelector('#home [data-dcproj-back]', { timeout: 90000 }).then(() => true, () => false);
      expect(back, 'the project open in Capital › DC timing at it (its developments, a way back)');
      await ev(() => PeelDcProjects.select(null));
    }
    // The full map: a plan pick still sets the map's plan filter.
    if (pl) {
      await ev(() => { PeelWorkspaces.setMode('full'); PeelDataTab.showTab('explore'); }); await wait(1500);
      expect(await findPick(page, ev, pl.name, { label: pl.name, kind: 'secondary plan|character area', place: true }), `${pl.name} in the full map's list`);
      const s = await ev(() => ({ mode: PeelWorkspaces.mode(), sp: PeelApp.state.sp.slice() }));
      expect(s.mode === 'full' && s.sp[0] === pl.area, `the full map filters to the plan (${s.mode}, ${s.sp.join()})`);
      // With that filter on, another plan of the same municipality picked on Home: Growth in an area at
      // that plan, the filter off (the plan tree holds only the developments shown).
      const pl2 = await ev(([id, area]) => { const r = PeelPlanTables.compute(), muni = x => { for (let y = x; y; y = y.parent ? r.nodes.get(y.parent) : null) if (y.kind === 'municipality') return y.name; return ''; }, m = muni(r.nodes.get(id));
        PeelApp.state.sp = []; PeelApp.applyFilters(); const u = PeelPlanTables.compute(), n = [...u.nodes.values()].find(x => x.kind === 'plan' && x.areaId !== area && x.m.planned >= 100 && muni(x) === m && x.name.length >= 6);
        PeelApp.state.sp = [area]; PeelPlanAreas.renderAreaSelects(); PeelApp.applyFilters(); return n ? { name: n.name, area: n.areaId } : null; }, [pl.id, pl.area]);
      if (pl2) {
        await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
        expect(await findPick(page, ev, pl2.name, { label: pl2.name, kind: 'secondary plan|character area', place: true }), `${pl2.name} in the list`);
        const g = await ev(() => ({ page: PeelWorkspaces.page(), name: (document.querySelector('#home h1') || {}).textContent, sp: PeelApp.state.sp.slice(), mtsa: PeelApp.state.mtsa.slice() }));
        expect(g.page === 'growth' && g.name === pl2.name && !g.sp.length && !g.mtsa.length, `under ${pl.name}'s filter, ${pl2.name} picked: Growth in an area at it, the filter off (${g.page}, "${g.name}", ${g.sp.join()})`);
      }
      await ev(() => { PeelApp.state.sp = []; PeelApp.applyFilters(); }); await wait(800);
    }
    // An MTSA picked on a page leaves its filter on; a plan picked next: Growth in an area at the plan,
    // the MTSA filter off.
    const mt1 = await ev(() => { const a = PeelApp.state.areas.mtsas.find(x => x.municipality && x.name.length >= 6 && PeelApp.state.areas.mtsas.filter(o => o.name === x.name).length === 1); return a ? { id: a.id, name: a.name } : null; });
    if (pl && mt1) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
      expect(await findPick(page, ev, mt1.name, { label: mt1.name, kind: 'MTSA', place: true }), `${mt1.name} in the list`);
      const a = await ev(() => PeelApp.state.mtsa.slice());
      expect(a.join() === mt1.id, `the MTSA's filter on (${a.join()})`);
      expect(await findPick(page, ev, pl.name, { label: pl.name, kind: 'secondary plan|character area', place: true }), `${pl.name} in the list, from Growth in an area`);
      const g = await ev(() => ({ page: PeelWorkspaces.page(), name: (document.querySelector('#home h1') || {}).textContent, sp: PeelApp.state.sp.slice(), mtsa: PeelApp.state.mtsa.slice() }));
      expect(g.page === 'growth' && g.name === pl.name && !g.sp.length && !g.mtsa.length, `then ${pl.name}: Growth in an area at it, the MTSA filter off (${g.page}, "${g.name}", ${g.mtsa.join()})`);
    }
    // 1600 px: on a page the box is in the header and the top-bar slot hides; the full map has it back.
    await page.setViewportSize({ width: 1600, height: 900 }); await wait(800);
    await ev(() => PeelWorkspaces.openPage('home')); await wait(1500);
    const w1 = await ev(() => ({ slot: document.getElementById('tb-search').hidden, inPage: !!document.querySelector('#page-search #search-box') }));
    expect(w1.slot && w1.inPage, `1600 px, a page: the box in its header, the top-bar slot hidden (${JSON.stringify(w1)})`);
    await ev(() => PeelWorkspaces.setMode('full')); await wait(1500);
    const w2 = await ev(() => ({ slot: document.getElementById('tb-search').hidden, inBar: !!document.querySelector('#tb-search #search-box') }));
    expect(!w2.slot && w2.inBar, `1600 px, the full map: the box in the top bar (${JSON.stringify(w2)})`);
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(500);
  });

  await check('phone: the search in every page header, 44 px, its list in view, no sideways scroll; a pick opens the place; Draw an area leaves the map to draw on', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelApp && PeelApp.state.areas && window.PeelPlanTables, null, { timeout: 120000 });
    for (const id of ['home', 'tight', 'growth']) {
      await ev(i => PeelWorkspaces.openPage(i), id); await wait(1500);
      const r = await ev(() => { const i = document.querySelector('#home #page-search input').getBoundingClientRect(), d = document.querySelector('#home .page-draw').getBoundingClientRect(); return { ih: i.height, l: i.left, r: i.right, dh: d.height, dr: d.right, w: document.documentElement.scrollWidth, vw: innerWidth }; });
      expect(r.ih >= 44 && r.l >= 0 && r.r <= 390, `${id}: the box ${Math.round(r.ih)} px tall, inside the screen (${Math.round(r.l)}–${Math.round(r.r)})`);
      expect(r.dh >= 44 && r.dr <= 390, `${id}: Draw an area ${Math.round(r.dh)} px tall, beside it`);
      expect(r.w <= r.vw, `${id}: no sideways scroll (${r.w} > ${r.vw})`);
    }
    // Its list in view, rows a thumb tall; a tap on the plan opens Growth in an area and lets go of the box.
    const pl = await bigPlan(ev);
    if (pl) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1500);
      await page.locator('#f-search').tap(); await page.keyboard.type(pl.name, { delay: 20 }); await wait(1200);
      const s = await ev(() => { const u = document.getElementById('search-sug'), r = u.getBoundingClientRect(); return { shown: !u.hidden, top: r.top, bottom: r.bottom, h: innerHeight, rows: [...u.querySelectorAll('li[data-i]')].map(li => Math.round(li.getBoundingClientRect().height)) }; });
      expect(s.shown && s.top >= 0 && s.bottom <= s.h, `the list in view (${Math.round(s.top)}–${Math.round(s.bottom)} of ${s.h})`);
      expect(s.rows.length > 0 && s.rows.every(h => h >= 44), `rows 44 px or taller (${s.rows.join()})`);
      await ev(() => { document.getElementById('f-search').blur(); }); await wait(500);
      expect(await findPick(page, ev, pl.name, { label: pl.name, kind: 'secondary plan|character area', place: true }, true), `${pl.name} in the list`);
      const g = await ev(() => ({ page: PeelWorkspaces.page(), focus: document.activeElement === document.getElementById('f-search') }));
      expect(g.page === 'growth', `the tap opens Growth in an area (${g.page})`);
      expect(!g.focus, 'the pick lets go of the box (the keyboard closes)');
    }
    // Typing on a page that redraws (Home while it loads, a tile landing): the focus and the list stay.
    await ev(() => PeelWorkspaces.openPage('home')); await wait(1500);
    await page.locator('#f-search').tap(); await page.keyboard.type('bram', { delay: 30 }); await wait(1000);
    await ev(() => { PeelWorkspaces.renderPage(false); PeelWorkspaces.renderPage(true); }); await wait(300);
    const k = await ev(() => ({ focus: document.activeElement === document.getElementById('f-search'), shown: !document.getElementById('search-sug').hidden }));
    expect(k.focus && k.shown, `typing keeps the focus and the list while the page would redraw (${JSON.stringify(k)})`);
    await ev(() => { const b = document.getElementById('f-search'); b.value = ''; b.blur(); }); await wait(1000);
    await page.locator('#f-search').tap(); await wait(300);
    await ev(() => { PeelWorkspaces.renderPage(false); PeelWorkspaces.renderPage(true); }); await wait(300);
    expect(await ev(() => document.activeElement === document.getElementById('f-search')), 'a tap with nothing typed keeps the focus (the keyboard stays up)');
    // Draw an area: the Study area map with Select on, the sheet down to its peek (a result kept at a
    // development leaves it full), the drawing layer under a thumb in the middle of the map.
    await ev(() => { document.getElementById('f-search').blur(); PeelApp.setAnalysisSnap('full', false); PeelWorkspaces.openPage('projects'); }); await wait(1500);
    await page.locator('#home .page-draw').tap(); await wait(2000);
    const dr = await ev(() => {
      const b = PeelMapCore.map.getContainer().getBoundingClientRect(), a = document.getElementById('analysis'), y = (b.top + Math.min(b.bottom, a.getBoundingClientRect().top)) / 2, e = document.elementFromPoint(innerWidth / 2, y);
      return { mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), lasso: PeelAreaSelect.getLassoOn(), snap: a.dataset.snap, room: Math.round(Math.min(b.bottom, a.getBoundingClientRect().top) - b.top), layer: !!(e && e.closest('.lasso-layer')), y: Math.round(y) };
    });
    expect(dr.mode === 'ws' && dr.ws === 'study' && dr.lasso, `Draw an area: the Study area map, Select on (${dr.mode}, ${dr.ws}, ${dr.lasso})`);
    expect(dr.snap === 'peek' && dr.room >= 400 && dr.layer, `the sheet at its peek, the map there to draw on (${dr.snap}, ${dr.room} px of map; the drawing layer at y ${dr.y}: ${dr.layer})`);
    await ev(() => PeelAreaSelect.setLasso(false));
  });

  // The Inquiry draft (navigation phase 1, AD-13): a development action and the Export item, one function:
  // one draft on the map's Overview, the development kept (keepDev); × back to the site, the back bar to its page.
  await check('Inquiry draft: a site action and the Export item open one draft on the map, the development kept', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    const p = await ev(() => { const q = PeelApp.state.projects.find(x => x.phase === 'approved' && x.units > 300); PeelDevNav.showDetail(q); return { key: q.key, title: q.title }; });
    await wait(2500);
    await ev(() => PeelWorkspaces.openPage('site')); await wait(2000);
    await page.click('#home .page-foot [data-inquiry]'); await wait(2000);
    const a = await ev(() => ({ mode: PeelWorkspaces.mode(), key: (DevScope.current() || {}).key, pre: !!document.querySelector('#scope-body:not([hidden]) .tinq-pre'), trail: [...document.querySelectorAll('#trail .tb-step')].map(b => b.textContent) }));
    expect(a.mode === 'full', `the draft opens on the map (${a.mode})`);
    expect(a.key === p.key, 'the development stays open');
    expect(a.pre, 'the draft is on the Overview, in sight');
    expect(a.trail.slice(-2).join(' › ') === `${p.title} › Inquiry draft — ${p.title}`, `the trail: ${a.trail.join(' › ')}`);
    // Export ▾ › Inquiry response draft: the same draft, once.
    await page.click('#tb-export'); await wait(400);
    await page.click('#tb-export-menu [data-tbx="inquiry"]'); await wait(1500);
    const b = await ev(() => ({ n: document.querySelectorAll('#scope-body .tinq-pre').length, old: !!document.getElementById('inq-copy'), key: (DevScope.current() || {}).key }));
    expect(b.n === 1 && !b.old && b.key === p.key, `one draft from Export, the development kept (${JSON.stringify(b)})`);
    // × (the header's Peel step closes both): back to the site's Overview, its own Inquiry draft there too.
    await page.click('#scope-body .pnl-x[data-scope-result-close]'); await wait(1500);
    const c = await ev(() => ({ key: (DevScope.current() || {}).key, hidden: document.getElementById('scope-body').hidden, act: !!document.querySelector('#pnl-overview .pnl-foot [data-inquiry]') }));
    expect(c.key === p.key && c.hidden, `× goes back to the development (${JSON.stringify(c)})`);
    expect(c.act, 'the map\u2019s development Overview has Inquiry draft too');
    await page.click('#back-bar [data-ws-back]'); await wait(2000);
    const d = await ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), key: (DevScope.current() || {}).key }));
    expect(d.mode === 'home' && d.page === 'site' && d.key === p.key, `back on the site's page (${JSON.stringify(d)})`);
  });

  // A pick on any page, not only Home, opens what it found (navigation phase 1, §3.3): from Review an FSR a
  // development opens its FSR review, from another page its page at Summary; a pumping station its scope on
  // Servicing capacity's map, ← Page back to that page; an MTSA its filter, Growth in an area at its
  // municipality; a DC facility Capital's map view, its card there.
  await check('a pick on any page opens what it found: a development (from Review an FSR, its FSR review), a station, an MTSA, a DC facility', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && PeelApp.state.dcInfra && PeelApp.state.areas && PeelApp.state.servicing, null, { timeout: 120000 });
    // (a development of its own name: the one row that starts with it)
    const p = await ev(() => { const all = PeelApp.state.projects, q = all.find(x => x.phase === 'approved' && x.units > 300 && x.lat != null && x.title.length > 8 && x.title.length < 40 && all.filter(o => o.title.toLowerCase().includes(x.title.toLowerCase())).length === 1); return { key: q.key, title: q.title }; });
    await ev(() => PeelWorkspaces.openPage('fsr')); await wait(1500);
    expect(await findPick(page, ev, p.title, { has: [p.title] }), `${p.title} in Review an FSR's list`);
    const f = await ev(() => ({ page: PeelWorkspaces.page(), key: (DevScope.current() || {}).key, box: !!document.querySelector('#home [data-pnl-fsrbox]'), focus: document.activeElement === document.getElementById('f-search') }));
    expect(f.page === 'fsr' && f.key === p.key && f.box, `from Review an FSR: its FSR review (${f.page}, ${f.key === p.key})`);
    expect(!f.focus, 'the pick lets go of the box');
    await ev(() => { DevScope.close(); PeelWorkspaces.openPage('tight'); }); await wait(1500);
    expect(await findPick(page, ev, p.title, { has: [p.title] }), `${p.title} in Servicing capacity's list`);
    const s = await ev(() => ({ page: PeelWorkspaces.page(), key: (DevScope.current() || {}).key, sec: (document.querySelector('#home .page-sec.on') || { dataset: {} }).dataset.wsSec }));
    expect(s.page === 'site' && s.key === p.key && s.sec === 'summary', `from Servicing capacity: its page at Summary (${s.page}, ${s.sec})`);
    // A pumping station: its scope on Servicing capacity's map; ← Page is that page.
    const st = await ev(() => { const a = (PeelApp.state.servicing.psAreas || []).find(x => PeelSvcData.drName(x).length >= 6); return a ? { id: a.id, name: PeelSvcData.drName(a) } : null; });
    expect(!!st, 'a pumping station catchment');
    if (st) {
      await ev(() => { DevScope.close(); PeelWorkspaces.openPage('projects'); }); await wait(1500);
      expect(await findPick(page, ev, st.name, { label: st.name, kind: 'Pumping station catchment', place: true }), `${st.name} in Capital's list`);
      const c = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), ss: PeelApp.state.ss }));
      expect(c.mode === 'ws' && c.ws === 'tight' && c.ss === st.id, `its scope on Servicing capacity's map (${c.mode}, ${c.ws}, ${c.ss})`);
      await page.click('#ws-bar [data-ws-backpage]'); await wait(1500);
      const b = await ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), box: !!document.querySelector('#home .page-find #page-search #search-box') }));
      expect(b.mode === 'home' && b.page === 'tight' && b.box, `← Page: Servicing capacity, its search back in the header (${JSON.stringify(b)})`);
      await ev(() => { if (PeelSvcScope.current()) PeelSvcScope.close(); });
    }
    // An MTSA: its filter, as on the map, and Growth in an area at its municipality.
    const mt = await ev(() => { const a = PeelApp.state.areas.mtsas.find(x => x.municipality && x.name.length >= 6 && PeelApp.state.areas.mtsas.filter(o => o.name === x.name).length === 1); return a ? { id: a.id, name: a.name, muni: a.municipality } : null; });
    expect(!!mt, 'an MTSA');
    if (mt) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
      expect(await findPick(page, ev, mt.name, { label: mt.name, kind: 'MTSA', place: true }), `${mt.name} in the list`);
      const m = await ev(() => ({ page: PeelWorkspaces.page(), name: (document.querySelector('#home h1') || {}).textContent, mtsa: PeelApp.state.mtsa.slice() }));
      expect(m.page === 'growth' && m.name === mt.muni && m.mtsa.join() === mt.id, `Growth in an area at ${mt.muni}, the MTSA filter on (${m.page}, "${m.name}", ${m.mtsa.join()})`);
      await ev(() => { PeelApp.state.mtsa = []; PeelPlanAreas.renderAreaSelects(); PeelApp.applyFilters(); }); await wait(800);
    }
    // A DC facility: Capital's map view, its card there.
    const fc = await ev(() => { const x = PeelApp.state.dcInfra.wastewater.facilities.find(f => f.name.length >= 6 && f.g); return x ? { name: x.name } : null; });
    expect(!!fc, 'a wastewater DC facility');
    if (fc) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
      expect(await findPick(page, ev, fc.name, { label: fc.name, kind: 'DC wastewater', place: true }), `${fc.name} in the list`);
      const d = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), card: [...document.querySelectorAll('#scope-body:not([hidden]) h3')].map(h => h.textContent) }));
      expect(d.mode === 'ws' && d.ws === 'projects' && d.card.includes(fc.name), `Capital's map view with its card (${d.mode}, ${d.ws}, ${d.card.join(' | ')})`);
    }
  });

  // Draw an area from any page's header (navigation phase 1, task 7): the Study area map view with the
  // Select tool on; a drag picks the developments inside it; ← Page shows them on the Study area page.
  await check('Draw an area from a page header: the Study area map with Select on, a drag picks the developments, ← Page lists them', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.openPage('projects')); await wait(1500);
    await page.click('#home .page-draw'); await wait(2000);
    const a = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), lasso: PeelAreaSelect.getLassoOn(), sel: PeelAreaSelect.selection.size }));
    expect(a.mode === 'ws' && a.ws === 'study' && a.lasso && !a.sel, `the Study area map view, Select on (${JSON.stringify(a)})`);
    // (at street zoom round the largest development; a box round one shown where the drawing layer takes
    // the pointer, its corners too)
    await ev(() => { const p = PeelApp.state.filtered.filter(q => q.lat != null).sort((x, y) => (y.units || 0) - (x.units || 0))[0]; PeelMapCore.map.setView([p.lat, p.lng], 15, { animate: false }); }); await wait(2000);
    const D = 90;
    const at = await ev(d => {
      const map = PeelMapCore.map, b = map.getContainer().getBoundingClientRect(), on = (x, y) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('.lasso-layer') && !e.closest('.lasso-hint')); };
      for (const p of PeelApp.state.filtered) {
        if (p.lat == null) continue;
        const c = map.latLngToContainerPoint([p.lat, p.lng]), x = b.left + c.x, y = b.top + c.y;
        if ([[0, 0], [-d, -d], [d, -d], [d, d], [-d, d]].every(([dx, dy]) => on(x + dx, y + dy))) return { x, y };
      }
      return null;
    }, D);
    expect(!!at, 'a development in view, the drawing layer round it');
    if (at) {
      await page.mouse.move(at.x - D, at.y - D); await page.mouse.down();
      for (const [x, y] of [[D, -D], [D, D], [-D, D], [-D, -D + 8]]) await page.mouse.move(at.x + x, at.y + y, { steps: 8 });
      await page.mouse.up(); await wait(2000);
    }
    const s = await ev(() => ({ n: PeelAreaSelect.selection.size, lasso: PeelAreaSelect.getLassoOn() }));
    expect(s.n > 0 && !s.lasso, `the drag picks the developments inside it (${s.n}), Select off`);
    await page.click('#ws-bar [data-ws-backpage]'); await wait(2000);
    const b = await ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), answer: (document.querySelector('#home .home-answer') || {}).textContent || '', sel: !!document.querySelector('#home .page-sel'), draw: !!document.querySelector('#home .page-draw'), box: !!document.querySelector('#home #page-search #search-box') }));
    expect(b.mode === 'home' && b.page === 'study' && b.sel && b.answer.includes(`holds ${s.n.toLocaleString('en-CA')} development`), `← Page: the Study area page holds them (${b.page}: "${b.answer.slice(0, 80)}")`);
    expect(b.box && !b.draw, 'its header has the search, and no Draw an area (the page draws on its own map)');
    await ev(() => PeelAreaSelect.clearSelection());
  });

  // Servicing and Capital: one entry each; the map's other sub-views of the tab are sections of the page,
  // each the map panel's own answer.
  await check('Servicing and Capital: the map\u2019s sub-views are sections of their page, with the map\u2019s answers', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    const side = await ev(() => [...document.querySelectorAll('#home .home-side [data-ws-page]')].map(b => b.dataset.wsPage));
    expect(side.includes('capital') && !side.includes('projects') && !side.includes('eaflow'), `the sidebar: ${side.join()}`);
    const st = 'h => String(h || "").replace(/<[^>]+>/g, "").replace(/\\s+/g, " ").trim()';
    for (const [entry, ws, secs] of [['tight', 'servicing', ['network']], ['capital', 'capital', ['projects']]]) {
      await page.click(`#home .home-side [data-ws-page="${entry}"]`); await wait(3000);
      const bar = await ev(() => [...document.querySelectorAll('#home .page-sec')].map(b => b.textContent.trim()));
      const want = await ev(ws => PeelSections.WORKSPACES[ws].secs.map(x => x.title), ws);
      expect(bar.join() === want.join(), `${ws}: its sections ${bar.join()} (${want.join()})`);
      for (const id of secs) {
        await page.click(`#home .page-sec[data-ws-wsec="${ws}:${id}"]`); await wait(3000);
        const r = await ev(([ws, id, st]) => { const f = eval(st), s = PeelSections.wsSpecFor(ws, id); return { on: (document.querySelector('#home .page-sec.on') || {}).dataset, page: f(document.querySelector('#home .home-answer').innerHTML), map: s ? f(s.answer) : null }; }, [ws, id, st]);
        expect(r.on && r.on.wsWsec === `${ws}:${id}`, `${ws} › ${id}: the bar`);
        expect(r.map && r.page === r.map, `${ws} › ${id}: the page's answer is the map panel's ("${String(r.page).slice(0, 50)}" / "${String(r.map).slice(0, 50)}")`);
      }
    }
    await page.click('#home .page-sec[data-ws-page="eaflow"]'); await wait(2500);
    const ea = await ev(() => ({ page: PeelWorkspaces.page(), on: (document.querySelector('#home .page-sec.on') || {}).textContent, lit: (document.querySelector('#home .home-ws.on') || {}).dataset }));
    expect(ea.page === 'eaflow' && ea.on === 'EAs' && ea.lit && ea.lit.wsPage === 'capital', `EAs (with EA to construction) is a section of Capital (${ea.page}, ${ea.on})`);
  });

  // Navigation phase 2: Servicing is Capacity · Network; Allocations is a fold of Capacity with its tables and
  // CSV in the full table; the water facilities are Network's; the model checks are Records › Data checks;
  // old Servicing links (and saved views) land there.
  await check('Servicing and Records: Capacity · Network, Allocations a fold with its CSV, the model checks in Records › Data checks (the Servicing model group, Review outlets, the ⓘ link; no gear page); old Servicing links land; one System control the lens sets, in a link as sy=', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab('svc', 'capacity'); }); await wait(2500);
    const chips = await ev(() => [...document.querySelectorAll('[data-svcsub]')].filter(b => b.offsetParent).map(b => b.textContent.trim()).join('|'));
    expect(chips === 'Capacity|Network', `Servicing's chips: ${chips}`);
    const folds = await ev(() => [...document.querySelectorAll('#pnl-svc details.pnl-fold summary')].map(x => x.textContent.trim()));
    expect(folds.some(t => t.startsWith('Allocations recorded')), `Capacity's folds: ${folds.join(' | ')}`);
    // "Export or import the CSV ›": Capacity's full table at the plants' room after allocations, the CSV bar under it.
    await page.click('#pnl-svc #pnl-alloc-rec > summary'); await wait(400);
    await page.click('#pnl-svc #pnl-alloc-rec [data-full-table]'); await wait(2000);
    const ft = await ev(() => {
      const panes = document.getElementById('analysis-panes'), cap = [...document.querySelectorAll('#alloc-body caption')].find(c => c.textContent.startsWith('Plants: room at the 90%'));
      const r = cap && cap.closest('table').getBoundingClientRect(), b = panes.getBoundingClientRect();
      return { on: document.getElementById('analysis').classList.contains('ft-on'), sub: PeelAnalysisTabs.getSvcSub(), csv: !!document.querySelector('#alloc-body [data-alloc-csv]') && !!document.querySelector('#alloc-body [data-alloc-imp]'), shown: !document.getElementById('pane-alloc').hidden, inView: !!r && r.top < b.bottom && r.bottom > b.top };
    });
    expect(ft.on && ft.sub === 'capacity' && ft.csv && ft.shown, `Capacity's full table with the CSV bar (${JSON.stringify(ft)})`);
    expect(ft.inView, 'the jump lands at the plants\u2019 room after allocations, not the top of the facility table');
    await page.keyboard.press('Escape'); await wait(500);
    await page.click('#pnl-svc #pnl-alloc-rec > summary'); await wait(400);   // (closed again: the old links below open it)
    // Network: the existing water facilities, and the hydraulic check while its lab is on.
    await ev(() => PeelAnalysisTabs.openTab('svc', 'network')); await wait(2500);
    const lists = await ev(() => [...document.querySelectorAll('#pnl-svc .pnl-list-h h3')].map(h => h.textContent));
    expect(lists.includes('Existing water facilities'), `Network's lists: ${lists.join(' | ')}`);
    await page.click('#pnl-svc [data-sec="footer"] [data-full-table]'); await wait(2000);
    const net = await ev(() => ({ wfac: !document.getElementById('pane-wfac').hidden && getComputedStyle(document.getElementById('pane-wfac')).display !== 'none', table: !!document.querySelector('#wfac-body table'), hydro: getComputedStyle(document.getElementById('pane-hydro')).display }));
    expect(net.wfac && net.table, `Network's full table: the existing water facilities (${JSON.stringify(net)})`);
    expect(net.hydro === 'none', 'the hydraulic check stays behind its lab');
    const was = await ev(() => PeelLabs.on('hydro'));
    await ev(() => PeelLabs.set('hydro', true)); await wait(1000);
    expect(await ev(() => getComputedStyle(document.getElementById('pane-hydro')).display !== 'none'), 'Labs › Hydraulic check on: in Network\u2019s full table');
    await ev(w => PeelLabs.set('hydro', w), was); await wait(500);
    await page.keyboard.press('Escape'); await wait(500);
    // Old links, through the path a saved view takes (the same ready() a link runs).
    await ev(() => PeelShare.viewLink.apply('t=svc&svs=alloc')); await wait(2500);
    const al = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), open: !!document.querySelector('#pnl-svc #pnl-alloc-rec[open]') }));
    expect(al.tab === 'svc' && al.sub === 'capacity' && al.open, `t=svc&svs=alloc: Capacity, the fold open (${JSON.stringify(al)})`);
    // (closed by the reader, a redraw keeps it closed)
    await page.click('#pnl-svc #pnl-alloc-rec > summary'); await wait(400);
    await ev(() => PeelAnalysisTabs.openTab('svc', 'capacity')); await wait(1500);
    expect(await ev(() => !!document.querySelector('#pnl-svc #pnl-alloc-rec') && !document.querySelector('#pnl-svc #pnl-alloc-rec[open]')), 'a fold the reader closed stays closed');
    // (the old link applied again, as a saved view does, opens it again; closed by the reader, a System tap leaves it closed)
    await ev(() => PeelShare.viewLink.apply('t=svc&svs=alloc')); await wait(2500);
    expect(await ev(() => !!document.querySelector('#pnl-svc #pnl-alloc-rec[open]')), 't=svc&svs=alloc again, after the reader closed it: the fold open');
    await page.click('#pnl-svc #pnl-alloc-rec > summary'); await wait(400);
    await page.click('#pnl-svc [data-sys="water"]'); await wait(1500);
    expect(await ev(() => !!document.querySelector('#pnl-svc #pnl-alloc-rec') && !document.querySelector('#pnl-svc #pnl-alloc-rec[open]')), 'closed again by the reader: a System tap leaves it closed');
    await page.click('#pnl-svc [data-sys="both"]'); await wait(1500);
    await ev(() => PeelShare.viewLink.apply('t=svc&svs=checks')); await wait(2500);
    const ck = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getRSub() }));
    expect(ck.tab === 'records' && ck.sub === 'checks', `t=svc&svs=checks: Records › Data checks (${JSON.stringify(ck)})`);
    await page.click('#pnl-records [data-sec="footer"] [data-full-table]'); await wait(2000);
    const sm = await ev(() => { const p = document.getElementById('pane-svc-checks'); return { shown: !p.hidden && getComputedStyle(p).display !== 'none', text: document.getElementById('svc-checks-body').textContent.includes('Servicing model') }; });
    expect(sm.shown && sm.text, `Records › Data checks' full table: the Servicing model group (${JSON.stringify(sm)})`);
    await page.keyboard.press('Escape'); await wait(500);
    await ev(() => PeelShare.viewLink.apply('t=ww&ws=alloc')); await wait(2500);
    const ww = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), open: !!document.querySelector('#pnl-svc #pnl-alloc-rec[open]') }));
    expect(ww.tab === 'svc' && ww.sub === 'capacity' && ww.open, `t=ww&ws=alloc: Capacity, the fold open (${JSON.stringify(ww)})`);
    await ev(() => PeelShare.viewLink.apply('t=water&ws=facilities')); await wait(2500);
    expect(await ev(() => PeelAnalysisTabs.getFootTab() === 'svc' && PeelAnalysisTabs.getSvcSub() === 'network'), 't=water&ws=facilities: Servicing › Network');
    // The Servicing capacity page: its bar, and the fold under its lists.
    await ev(() => PeelWorkspaces.openPage('tight')); await wait(3000);
    const pg = await ev(() => ({ bar: [...document.querySelectorAll('#home .page-sec')].map(b => b.textContent.trim()).join(), fold: [...document.querySelectorAll('#home details.pnl-fold summary')].some(x => x.textContent.trim().startsWith('Allocations recorded')) }));
    expect(pg.bar === 'Capacity,Network' && pg.fold, `the Servicing capacity page (${JSON.stringify(pg)})`);
    // Records › Data checks (chunk 2): the data checks, then the Servicing model group and Review outlets.
    await page.waitForFunction(() => PeelApp.state.svcModel && PeelApp.state.plantFlows && PeelApp.state.wwEvents, null, { timeout: 120000 });
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab('records', 'checks'); }); await wait(2500);
    const rk = await ev(() => ({ chips: [...document.querySelectorAll('[data-rsub]')].filter(b => b.offsetParent).map(b => b.textContent.trim()).join('|'), lists: [...document.querySelectorAll('#pnl-records .pnl-list-h h3')].map(h => h.textContent),
      svc: ([...document.querySelectorAll('#pnl-records .pnl-list')].find(l => l.querySelector('h3') && l.querySelector('h3').textContent === 'Servicing model') || {}).textContent || '' }));
    expect(rk.chips === 'Sources|Data checks', `Records' chips: ${rk.chips}`);
    expect(rk.lists.includes('Servicing model') && rk.lists.includes('Where developments discharge'), `Records › Data checks' lists: ${rk.lists.join(' | ')}`);
    expect(/times the model's flow|design flows/.test(rk.svc) && rk.svc.includes('Plant flow: Ministry data') && rk.svc.includes('Pumping stations: GIS layer'), `the Servicing model list, with the gear page's two checks (${rk.svc.replace(/\s+/g, ' ').slice(0, 160)})`);
    await page.click('#pnl-records [data-sec="footer"] [data-full-table]'); await wait(2000);
    const rf = await ev(() => { const t = document.getElementById('svc-checks-body').textContent; return { audit: !document.getElementById('rec-data-checks').hidden && !!document.getElementById('audit-panel'), pf: t.includes('Plant flow: Ministry data'), ro: t.includes('Pumping stations: open GIS layer') }; });
    expect(rf.audit && rf.pf && rf.ro, `the full table: the duplicate check, then the Ministry's plant flow and the station roster (${JSON.stringify(rf)})`);
    await page.keyboard.press('Escape'); await wait(500);
    // The Servicing model's See all: the full table at the Master Plan comparison (a stop the jump finds).
    await page.evaluate(() => { const l = [...document.querySelectorAll('#pnl-records .pnl-list')].find(x => x.querySelector('h3') && x.querySelector('h3').textContent === 'Servicing model'); const b = l && l.querySelector('.pnl-all'); if (b) b.click(); }); await wait(2000);
    const sa = await ev(() => { const panes = document.getElementById('analysis-panes'), h = [...document.querySelectorAll('#svc-checks-body h3')].find(x => x.textContent.startsWith('2020 Master Plan vs this tracker')); const r = h && h.getBoundingClientRect(), b = panes.getBoundingClientRect(); return { on: document.getElementById('analysis').classList.contains('ft-on'), inView: !!r && r.top < b.bottom && r.bottom > b.top }; });
    expect(sa.on && sa.inView, `Servicing model › See all lands at the 2020 Master Plan comparison (${JSON.stringify(sa)})`);
    await page.keyboard.press('Escape'); await wait(500);
    // … and each row at its own (the station roster has no table: found by its heading).
    for (const [go, head] of [['Reported 2025 production', 'Reported 2025 production'], ['Pumping stations: open GIS layer', 'Pumping stations: open GIS layer']]) {
      await page.click(`#pnl-records .pnl-row[data-ft-go="${go}"]`); await wait(2000);
      const rj = await ev(h => { const panes = document.getElementById('analysis-panes'), x = [...document.querySelectorAll('#svc-checks-body h3')].find(y => y.textContent.startsWith(h)); const r = x && x.getBoundingClientRect(), b = panes.getBoundingClientRect(); return { on: document.getElementById('analysis').classList.contains('ft-on'), inView: !!r && r.top < b.bottom && r.bottom > b.top }; }, head);
      expect(rj.on && rj.inView, `Servicing model › ${go}: the full table at it (${JSON.stringify(rj)})`);
      await page.keyboard.press('Escape'); await wait(500);
    }
    // Review outlets from the panel's list.
    await page.click('#pnl-records .pnl-row[data-ws-page="outlets"]'); await wait(1500);
    expect(await ev(() => PeelWorkspaces.mode() === 'home' && PeelWorkspaces.page() === 'outlets'), 'Where developments discharge › Review outlets opens its page');
    // The Overview's ⓘ link (in the panel's Method fold too): Records › Data checks, not a gear page.
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab('overview'); }); await wait(2500);
    await page.click('#pnl-overview details[data-sec="method"] > summary'); await wait(400);
    await page.click('#pnl-overview details[data-sec="method"] [data-at="records:checks"]'); await wait(1500);
    const ik = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getRSub(), gear: typeof window.GearPages.sources, menu: document.getElementById('tb-gear-menu').hidden }));
    expect(ik.tab === 'records' && ik.sub === 'checks', `the ⓘ link opens Records › Data checks (${JSON.stringify(ik)})`);
    expect(ik.gear === 'undefined' && ik.menu, 'no Sources & checks gear page');
    // At a development, Network's full table leaves out the Peel-wide water facilities and hydraulic check.
    const hw = await ev(() => PeelLabs.on('hydro'));
    await ev(() => { PeelLabs.set('hydro', true); const q = PeelApp.state.projects.find(x => x.phase === 'approved' && x.units > 300); PeelDevNav.showDetail(q); }); await wait(2500);
    await ev(() => PeelAnalysisTabs.openTab('svc', 'network')); await wait(2000);
    await page.click('#pnl-svc .pnl-foot button.pnl-sec[data-full-table]'); await wait(2000);
    const sw = await ev(() => ({ dev: !!DevScope.current(), on: document.getElementById('analysis').classList.contains('ft-on'), wfac: getComputedStyle(document.getElementById('pane-wfac')).display, hydro: getComputedStyle(document.getElementById('pane-hydro')).display }));
    expect(sw.dev && sw.on && sw.wfac === 'none' && sw.hydro === 'none', `a development's Network full table: no water facilities, no hydraulic check (${JSON.stringify(sw)})`);
    // … nor does the workbook's Water sheet there (the Excel library stubbed: each sheet comes back as its rows).
    const wb = await ev(async () => {
      const sheets = [], had = window.XLSX;
      window.XLSX = { utils: { book_new: () => ({}), aoa_to_sheet: a => a, book_append_sheet: (w, a, n) => sheets.push([n, a]) }, writeFile: () => {} };
      try { await PeelExports.exportWorkbook(); } finally { window.XLSX = had; }
      const water = (sheets.find(x => x[0] === 'Water') || [])[1] || [];
      return water.filter(r => r.length === 1).map(r => r[0]);
    });
    expect(!wb.includes('Existing water facilities'), `the workbook at a development: no Peel-wide water facilities on its Water sheet (${wb.join(' | ')})`);
    await page.keyboard.press('Escape'); await wait(500);
    await ev(w => { PeelLabs.set('hydro', w); DevScope.close(); }, hw); await wait(500);
    // One System control (chunk 3): Water on Capacity lists the water facilities, is kept, and is in the link.
    await ev(() => PeelAnalysisTabs.openTab('svc', 'capacity')); await wait(2000);
    await page.click('#pnl-svc [data-sys="water"]'); await wait(1500);
    const sy = await ev(() => ({ sys: PeelAnalysisTabs.getSys(), names: [...document.querySelectorAll('#pnl-svc .pnl-list .pnl-row .pnl-r-name')].map(n => n.textContent.trim()), link: PeelShare.viewLink.hash(), kept: PeelUtil.store.get('sysPick', null), on: !!document.querySelector('#pnl-svc [data-sys="water"].on') }));
    expect(sy.sys === 'water' && sy.on && sy.kept === 'water', `System › Water: the pick, kept (${JSON.stringify({ sys: sy.sys, on: sy.on, kept: sy.kept })})`);
    expect(sy.names.length > 0 && sy.names.every(t => t.startsWith('💧')), `Capacity lists the water facilities only (${sy.names.slice(0, 4).join(' | ')})`);
    expect(/(^|&)sy=water(&|$)/.test(sy.link), 'the share link carries sy=water');
    // … the same pick in Capital › DC timing (opened by its old name, DC projects: the alias, navigation phase 4).
    await ev(() => PeelAnalysisTabs.openTab('dca', 'dcproj'));
    await page.waitForSelector('#pnl-dca [data-dcproj-open]', { timeout: 90000 }); await wait(500);
    const dp = await ev(() => ({ on: !!document.querySelector('#pnl-dca [data-sys="water"].on'), h: [...document.querySelectorAll('#pnl-dca .pnl-list-h h3')].map(h => h.textContent) }));
    expect(dp.on && dp.h.includes('Water projects'), `DC timing at the same System (${JSON.stringify(dp)})`);
    // (a System tap on Capacity once the Scenario has put the DC impact model out of date: DC projects is out of
    // sight, so the tap does not rebuild it; it walks every sewer pipe)
    await ev(() => PeelAnalysisTabs.openTab('svc', 'capacity')); await wait(1500);
    await ev(() => document.querySelector('#scen-bar [data-svcopt="ww"][data-v="design"]').click()); await wait(3000);
    const tp = await ev(() => { const t = performance.now(); document.querySelector('#pnl-svc [data-sys="ww"]').click(); return { ms: Math.round(performance.now() - t), built: !!PeelDcImpact.current(), sys: PeelAnalysisTabs.getSys() }; });
    expect(tp.sys === 'ww' && !tp.built, `a System tap on Capacity leaves the DC impact model unbuilt (${JSON.stringify(tp)})`);
    await ev(() => document.querySelector('#scen-bar [data-svcopt="ww"][data-v="calibrated"]').click()); await wait(3000);
    await page.click('#pnl-svc [data-sys="water"]'); await wait(1000);
    // The lens sets it, and still opens its tab; Planning leaves it.
    await page.click('#tb-views [data-mview="wastewater"]'); await wait(2000);
    const l1 = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sys: PeelAnalysisTabs.getSys() }));
    expect(l1.tab === 'svc' && l1.sys === 'ww', `the Wastewater lens: Servicing, System Wastewater (${JSON.stringify(l1)})`);
    await page.click('#tb-views [data-mview="dc"]'); await wait(2000);
    const l2 = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sys: PeelAnalysisTabs.getSys() }));
    expect(l2.tab === 'dca' && l2.sys === 'both', `the Capital lens: Capital, System Both (${JSON.stringify(l2)})`);
    await ev(() => PeelAnalysisTabs.setSys('water')); await wait(500);
    await page.click('#tb-views [data-mview="planning"]'); await wait(2000);
    expect(await ev(() => PeelAnalysisTabs.getSys()) === 'water', 'the Planning lens leaves the System');
    // A link without sy= (every link before it) opens at Both, and leaves the stored pick.
    await ev(() => PeelShare.viewLink.apply('t=svc&svs=capacity')); await wait(2500);
    const l3 = await ev(() => ({ sys: PeelAnalysisTabs.getSys(), kept: PeelUtil.store.get('sysPick', null), on: !!document.querySelector('#pnl-svc [data-sys="both"].on') }));
    expect(l3.sys === 'both' && l3.on && l3.kept === 'water', `t=svc&svs=capacity: Both, the stored pick kept (${JSON.stringify(l3)})`);
  });

  // Phone (navigation phase 2): Servicing's two chips and Records › Data checks fit; the System control and the
  // Allocations fold are a thumb tall; the Servicing capacity page carries both, with no sideways scroll.
  await check('phone: Servicing\u2019s two chips and Records › Data checks fit, the System control and the fold in reach, no sideways scroll', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    await ev(() => { PeelWorkspaces.setMode('full'); PeelApp.setAnalysisSnap('half'); PeelAnalysisTabs.openTab('svc', 'capacity'); }); await wait(2500);
    const sv = await ev(() => {
      const row = document.querySelector('.f-subtabs[data-pane="svc"]'), h = el => Math.round(el.getBoundingClientRect().height);
      const fold = [...document.querySelectorAll('#pnl-svc details.pnl-fold > summary')].find(x => x.textContent.trim().startsWith('Allocations recorded'));
      return { fits: !!row && row.scrollWidth <= row.clientWidth, chips: [...document.querySelectorAll('[data-svcsub]')].filter(b => b.offsetParent).map(h), sys: [...document.querySelectorAll('#pnl-svc [data-sys]')].map(h), fold: fold ? h(fold) : 0 };
    });
    expect(sv.fits, 'Servicing\u2019s chip row fits the screen');
    expect(sv.chips.length === 2 && sv.chips.every(x => x >= 44), `two chips, 44 px or taller (${sv.chips.join()})`);
    expect(sv.sys.length === 3 && sv.sys.every(x => x >= 44), `the System control, 44 px (${sv.sys.join()})`);
    expect(sv.fold >= 44, `the Allocations recorded fold, 44 px (${sv.fold})`);
    await ev(() => PeelAnalysisTabs.openTab('records', 'checks')); await wait(2500);
    const rc = await ev(() => { const r = document.querySelector('#pnl-records .pnl-row[data-ws-page="outlets"]'); if (!r) return null; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom), vh: innerHeight }; });
    expect(rc && rc.h >= 44 && rc.top >= 0 && rc.bottom <= rc.vh, `Where developments discharge: its row 44 px and in view (${JSON.stringify(rc)})`);
    await ev(() => PeelWorkspaces.openPage('tight')); await wait(3000);
    const tp = await ev(() => ({ w: document.documentElement.scrollWidth, vw: innerWidth, sys: document.querySelectorAll('#home [data-sys]').length, fold: [...document.querySelectorAll('#home details.pnl-fold summary')].some(x => x.textContent.trim().startsWith('Allocations recorded')) }));
    expect(tp.w <= tp.vw, `the Servicing capacity page: no sideways scroll (${tp.w} > ${tp.vw})`);
    expect(tp.sys >= 3 && tp.fold, `the page carries the System control and the fold (${JSON.stringify({ sys: tp.sys, fold: tp.fold })})`);
  });

  // Navigation phase 2, kept from before it (navigation-design §7.2–7.3): what an earlier release stored in this
  // browser (Servicing › Checks last picked, DC projects' own Wastewater) and a link opened cold (svs=alloc with
  // sy=, t=water&ws=hydro) land in their new homes; Capacity's Sort says Soonest · Largest impact.
  await check('kept from before phase 2: a stored Servicing › Checks opens Records › Data checks, DC projects’ stored Wastewater is the System; a cold svs=alloc&sy=water link opens the fold at Water for the visit; t=water&ws=hydro is Network with its lab; Sort says Soonest · Largest impact', browser, { prefs: { footTab4: 'svc', svcSub: 'checks', dcProjSys: 'wastewater' } }, async ({ page, ev }, expect) => {
    const pr = await ev(() => ({ tab: PeelAnalysisTabs.getFootPref(), rs: PeelAnalysisTabs.getRSub(), svs: PeelAnalysisTabs.getSvcSub(), sys: PeelAnalysisTabs.getSys(), kept: PeelUtil.store.get('sysPick', null) }));
    expect(pr.tab === 'records' && pr.rs === 'checks' && pr.svs === 'capacity', `the stored Servicing › Checks: Records › Data checks, Servicing back at Capacity (${JSON.stringify(pr)})`);
    expect(pr.sys === 'ww' && pr.kept === null, `DC projects' stored Wastewater is the System, read once (${JSON.stringify(pr)})`);
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && PeelApp.state.svcModel, null, { timeout: 120000 });
    await ev(() => PeelWorkspaces.setMode('full')); await wait(2500);
    const rk = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), on: ([...document.querySelectorAll('[data-rsub].on')].find(b => b.offsetParent) || {}).textContent, lists: [...document.querySelectorAll('#pnl-records .pnl-list-h h3')].map(h => h.textContent) }));
    expect(rk.tab === 'records' && rk.on === 'Data checks' && rk.lists.includes('Servicing model'), `the map opens on Records › Data checks with the Servicing model (${JSON.stringify(rk)})`);
    await ev(() => PeelAnalysisTabs.openTab('svc')); await wait(2500);
    const names = () => ev(() => [...document.querySelectorAll('#pnl-svc .pnl-list .pnl-row .pnl-r-name')].map(n => n.textContent.trim()));
    const cw = { on: await ev(() => PeelAnalysisTabs.getSvcSub() === 'capacity' && !!document.querySelector('#pnl-svc [data-sys="ww"].on')), names: await names() };
    expect(cw.on && cw.names.length > 0 && !cw.names.some(t => t.startsWith('💧')), `Servicing opens on Capacity at Wastewater: no water facility (${cw.names.slice(0, 3).join(' | ')})`);
    // One sort vocabulary: Soonest · Largest impact, each saying what it orders by; a tap reorders the list.
    const so = await ev(() => [...document.querySelectorAll('#pnl-svc .seg[aria-label="Sort"] [data-cap-sort]')].map(b => ({ k: b.dataset.capSort, t: b.textContent.trim(), tip: b.title, on: b.classList.contains('on') })));
    expect(so.map(b => b.t).join('|') === 'Soonest|Largest impact' && so.every(b => b.tip.length > 10), `Capacity's Sort: ${so.map(b => `${b.t} (${b.tip})`).join(' · ')}`);
    const was = (so.find(b => b.on) || so[0]).k, other = was === 'limit' ? 'impact' : 'limit';
    await page.click(`#pnl-svc [data-cap-sort="${other}"]`); await wait(1200);
    const re = { on: await ev(k => !!document.querySelector(`#pnl-svc [data-cap-sort="${k}"].on`) && PeelUtil.store.get('capSort', null) === k, other), names: await names() };
    expect(re.on && re.names.length === cw.names.length && re.names.join() !== cw.names.join(), `${other === 'impact' ? 'Largest impact' : 'Soonest'} reorders the list (${re.names.slice(0, 3).join(' | ')})`);
    await page.click(`#pnl-svc [data-cap-sort="${was}"]`); await wait(800);
    // A link opened cold (links before nav=2 did not carry sy=; this one does): Capacity with Allocations recorded
    // open, at Water for the visit only.
    await page.goto(`http://localhost:${PORT}/?link#t=svc&svs=alloc&sy=water`);
    await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 });
    await page.waitForSelector('#pnl-svc #pnl-alloc-rec', { timeout: 120000 }); await wait(2500);
    const cl = await ev(() => ({ mode: PeelWorkspaces.mode(), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), open: !!document.querySelector('#pnl-svc #pnl-alloc-rec[open]'), sys: PeelAnalysisTabs.getSys(), on: !!document.querySelector('#pnl-svc [data-sys="water"].on'), kept: PeelUtil.store.get('sysPick', null), link: PeelShare.viewLink.hash() }));
    expect(cl.mode === 'full' && cl.tab === 'svc' && cl.sub === 'capacity' && cl.open, `t=svc&svs=alloc opened cold: Capacity, Allocations recorded open (${JSON.stringify({ mode: cl.mode, tab: cl.tab, sub: cl.sub, open: cl.open })})`);
    expect(cl.sys === 'water' && cl.on && cl.kept === null && /(^|&)sy=water(&|$)/.test(cl.link), `sy=water: the System for the visit, not stored, and still in the link (${JSON.stringify({ sys: cl.sys, on: cl.on, kept: cl.kept })})`);
    expect((await names()).every(t => t.startsWith('💧')), 'Capacity lists the water facilities only');
    // An old hydraulic-check link: Servicing › Network, its lab switched on, the check in Network's full table.
    const hw = await ev(() => PeelLabs.on('hydro'));
    await ev(() => PeelShare.viewLink.apply('t=water&ws=hydro')); await wait(2500);
    const hy = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), lab: PeelLabs.on('hydro'), sys: PeelAnalysisTabs.getSys() }));
    expect(hy.tab === 'svc' && hy.sub === 'network' && hy.lab, `t=water&ws=hydro: Servicing › Network, Labs › Hydraulic check on (${JSON.stringify(hy)})`);
    expect(hy.sys === 'both', 'a link without sy= opens at Both');
    await page.click('#pnl-svc [data-sec="footer"] [data-full-table]'); await wait(2000);
    expect(await ev(() => document.getElementById('analysis').classList.contains('ft-on') && getComputedStyle(document.getElementById('pane-hydro')).display !== 'none' && !document.getElementById('pane-hydro').hidden), 'the hydraulic check in Network’s full table');
    await page.keyboard.press('Escape'); await wait(500);
    await ev(w => PeelLabs.set('hydro', w), hw);
  });

  // Reference and This week (step 5): one Reference entry (Help, How it works, the Glossary, How the app decides, the data
  // sources and checks that were map-only); This week carries the watch list.
  await check('Reference: one entry, the data sources and checks on pages; This week: the watch list', browser, {}, async ({ page, ev }, expect) => {
    const side = await ev(() => [...document.querySelectorAll('#home .home-side [data-ws-page]')].map(b => b.dataset.wsPage));
    expect(side.includes('reference') && !side.some(id => ['help', 'guides', 'glossary'].includes(id)), `the sidebar: ${side.join()}`);
    await page.click('#home .home-side [data-ws-page="reference"]'); await wait(1500);
    const bar = await ev(() => ({ page: PeelWorkspaces.page(), secs: [...document.querySelectorAll('#home .page-sec')].map(b => b.textContent), lit: (document.querySelector('#home .home-ws.on') || {}).dataset }));
    expect(bar.page === 'help' && bar.secs.join() === 'Help,How it works,Glossary,How the app decides,Data sources,Data checks' && bar.lit && bar.lit.wsPage === 'reference', `Reference (${bar.page}: ${bar.secs.join()})`);
    const st = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    await page.click('#home .page-sec[data-ws-page="data"]'); await wait(2000);
    const ds = await ev(() => ({ page: PeelWorkspaces.page(), a: document.querySelector('#home .home-answer').innerHTML, m: PeelSections.areaPanel('records:sources').answer }));
    expect(ds.page === 'data' && st(ds.a) === st(ds.m), `Data sources is the map's Records › Sources ("${st(ds.a).slice(0, 50)}")`);
    await page.click('#home .page-sec[data-ws-wsec="reference:checks"]'); await wait(2000);
    const dc = await ev(() => ({ a: document.querySelector('#home .home-answer').innerHTML, m: (PeelSections.wsSpecFor('reference', 'checks') || {}).answer }));
    expect(dc.m && st(dc.a) === st(dc.m), `Data checks is the map's Records › Data checks ("${st(dc.a).slice(0, 50)}")`);
    // (navigation phase 2: its Servicing model list, and the Review outlets row opening its page from here)
    const rl = await ev(() => ({ lists: [...document.querySelectorAll('#home .pnl-list-h h3')].map(h => h.textContent), row: !!document.querySelector('#home .pnl-row[data-ws-page="outlets"]') }));
    expect(rl.lists.includes('Servicing model') && rl.row, `Reference › Data checks: the Servicing model list and Review outlets (${rl.lists.join(' | ')})`);
    // (it follows a Scenario change made with another tab open, and its Servicing model rows and See all open the
    // map's Records › Data checks full table at their comparison)
    await page.waitForFunction(() => PeelApp.state.svcModel && PeelApp.state.reports && PeelApp.state.plantFlows && PeelApp.state.wwEvents, null, { timeout: 120000 });
    await ev(() => document.querySelector('#scen-bar [data-svcopt="ww"][data-v="design"]').click()); await wait(3000);
    await ev(() => PeelWorkspaces.openPage('data')); await wait(1000);
    await page.click('#home .page-sec[data-ws-wsec="reference:checks"]'); await wait(2000);
    const dz = await ev(() => { const l = [...document.querySelectorAll('#home .pnl-list')].find(x => (x.querySelector('h3') || {}).textContent === 'Servicing model'); return { tab: PeelAnalysisTabs.getFootTab(), mode: PeelApp.state.svcModel.mode, text: l ? l.innerText.replace(/\s+/g, ' ') : '', see: !!(l && l.querySelector('.pnl-list-h button[data-at="records:checks"][data-full-table]')) }; });
    expect(dz.tab !== 'records' && dz.mode === 'design' && dz.text.includes('design flows: the capacity check shows the factors'), `Reference › Data checks after Design flows, Records not open: the model's own words (${JSON.stringify({ tab: dz.tab, mode: dz.mode, text: dz.text.slice(0, 120) })})`);
    expect(dz.see, 'its Servicing model list has See all into the full table');
    await page.click('#home .pnl-row[data-ft-go="Reported 2025 production"]'); await wait(2500);
    const dj = await ev(() => { const panes = document.getElementById('analysis-panes'), x = [...document.querySelectorAll('#svc-checks-body h3')].find(y => y.textContent.startsWith('Reported 2025 production')); const r = x && x.getBoundingClientRect(), b = panes.getBoundingClientRect(); return { mode: PeelWorkspaces.mode(), tab: PeelAnalysisTabs.getFootTab(), rs: PeelAnalysisTabs.getRSub(), on: document.getElementById('analysis').classList.contains('ft-on'), inView: !!r && r.top < b.bottom && r.bottom > b.top }; });
    expect(dj.mode === 'full' && dj.tab === 'records' && dj.rs === 'checks' && dj.on && dj.inView, `a Servicing model row on the page: the full map's Records › Data checks full table at its comparison (${JSON.stringify(dj)})`);
    await page.keyboard.press('Escape'); await wait(500);
    await ev(() => { document.querySelector('#scen-bar [data-svcopt="ww"][data-v="calibrated"]').click(); PeelWorkspaces.openPage('data'); }); await wait(2000);
    await page.click('#home .page-sec[data-ws-wsec="reference:checks"]'); await wait(2000);
    if (rl.row) { await page.click('#home .pnl-row[data-ws-page="outlets"]'); await wait(1500); expect(await ev(() => PeelWorkspaces.mode() === 'home' && PeelWorkspaces.page() === 'outlets'), 'its Review outlets row opens the page'); }
    // A watched development is on This week's page.
    const w = await ev(() => { const p = PeelApp.state.projects.find(q => q.units > 100 && q.phase === 'review'); PeelUtil.store.set('watch', [p.key]); PeelWorkspaces.openPage('week'); return p.title; });
    await wait(2000);
    const wl = await ev(() => [...document.querySelectorAll('#home .pnl-list-h h3, #home h3')].map(h => h.textContent).join('|') + '#' + document.querySelector('#home').innerText.includes('Your watch list'));
    const has = await ev(t => document.querySelector('#home').innerText.includes(t), w);
    expect(/true$/.test(wl) && has, `This week lists the watch list with ${w}`);
    await ev(() => PeelUtil.store.set('watch', []));
  });

  // Home (step 6): the scope picker sets the municipality; the four groups; the new lists; the figures
  // are the pages' own.
  await check('Home: the municipality picker, four groups of figures, the largest left to build', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('#home .home-grp-h h2').length >= 4, null, { timeout: 30000 }).catch(() => {});
    const g = await ev(() => [...document.querySelectorAll('#home .home-grp-h h2')].map(h => h.textContent));
    expect(g.join() === 'Growth,Servicing,Capital,Change', `the groups: ${g.join()}`);
    await page.click('#home [data-ws-muni="Caledon"]'); await wait(3000);
    const c = await ev(() => ({ muni: PeelApp.state.muni, name: document.querySelector('#home h1').textContent, planned: (document.querySelector('#home .home-grp .pnl-fig b') || {}).textContent, g: Math.round(Growth.pipelineTotals(PeelApp.state.filtered).planned).toLocaleString('en-CA'), list: document.querySelector('#home').innerText.includes('Largest left to build') }));
    expect(c.muni === 'Caledon' && /^Caledon/.test(c.name), `Caledon picked (${c.name})`);
    expect(c.planned === c.g, `Home's homes planned ${c.planned} = Growth's ${c.g} for Caledon`);
    expect(c.list, 'Largest left to build is listed');
    await page.click('#home [data-ws-muni=""]'); await wait(2000);
    expect(await ev(() => PeelApp.state.muni === ''), 'back to Peel');
    // Servicing: the first zone limit (100% of firm pumping) beside the first 90% trigger, once the pumps
    // are in; the trigger opens its plant; a Needs attention row opens its facility as a scope.
    await page.waitForFunction(() => !PeelSvcCapacity.partial || !PeelSvcCapacity.partial(), null, { timeout: 60000 }).catch(() => {}); await wait(1500);
    const sv = await ev(() => {
      const g = [...document.querySelectorAll('#home .home-grp')].find(x => /Servicing/.test((x.querySelector('.home-grp-h h2') || {}).textContent || ''));
      const zone = PeelWsPages.firstZone(PeelSvcCapacity.collect() || []), trig = PeelWsPages.firstTrigger(PeelSvcCapacity.collect() || []);
      const tf = g && [...g.querySelectorAll('.pnl-fig')].find(f => /first 90% trigger/.test(f.textContent));
      return { text: g ? g.textContent : '', zone: zone && zone.name, pumps: (PeelSvcCapacity.collect() || []).filter(r => r.kind === 'pump').length, trigSs: trig && trig.ss, figSs: tf ? tf.dataset.wsSs || null : null };
    });
    // (none at its limit by the horizon's end: "None" before 2051, and the most loaded zone)
    if (sv.zone) expect(sv.text.includes('first zone limit (100% of firm)') && sv.text.includes('100% of firm pumping') && sv.text.includes(sv.zone), `the Servicing group has the first zone limit, ${sv.zone} (${sv.text.replace(/\s+/g, ' ').slice(0, 160)})`);
    else if (sv.pumps) expect(sv.text.includes('first zone limit (100% of firm)') && /None\s*first zone limit \(100% of firm\)\s*before \d{4} · most loaded: /.test(sv.text), `the Servicing group says no zone reaches its limit (${sv.text.replace(/\s+/g, ' ').slice(0, 200)})`);
    else expect(!sv.text.includes('first zone limit'), 'no pumps loaded: no zone figure');
    expect(sv.figSs === (sv.trigSs || null), `the first 90% trigger opens its plant (${sv.figSs} / ${sv.trigSs})`);
    const ss = await ev(() => { const r = document.querySelector('#home .page-list .pnl-row[data-ws-ss]'); return r ? r.dataset.wsSs : null; });
    expect(!!ss, 'a Needs attention row with a scope');
    if (ss) {
      await page.click(`#home .page-list .pnl-row[data-ws-ss="${ss}"]`); await wait(2500);
      const c = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), ss: PeelApp.state.ss }));
      expect(c.mode === 'ws' && c.ws === 'tight' && c.ss === ss, `the row opens ${ss} on Servicing capacity's map (${c.mode}, ${c.ws}, ${c.ss})`);
    }
  });

  // Plan areas: Growth in an area and the map's plan filter ("Show on the map") count the same
  // developments the same way (a straddling one by its share), for every plan, sub-area and precinct.
  // The developments table and its treemap (js/dev-table.js): grouped by plan, by stage; a tile or a
  // row under the pointer is ringed on the map; a row opens the site.
  await check('Growth in an area: the developments table, its treemap under the map, a row opens the site', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.openPage('growth')); await wait(2000);
    await page.click('#home [data-ws-drill="m:Caledon"]'); await wait(3000);
    const t = await ev(() => ({ groups: [...document.querySelectorAll('#home .gt-gn b')].map(b => b.textContent), rows: document.querySelectorAll('#home .gt-r').length, tiles: document.querySelectorAll('#home .home-map .gtm-t[data-ws-pick]').length, over: document.querySelector('#home .gt').scrollWidth - document.querySelector('#home .gt-scroll').clientWidth }));
    expect(t.groups.includes('Caledon Station') && t.groups.includes('Not in a plan'), `grouped by plan (${t.groups.slice(0, 4).join()})`);
    expect(t.rows > 0 && t.tiles > 0, `${t.rows} rows, ${t.tiles} tiles`);
    expect(t.over <= 1, `the table fits its column (${t.over}px over)`);
    await page.locator('#home .gtm-t[data-hx]').first().hover(); await wait(300);
    expect(await ev(() => document.querySelectorAll('#home .home-map-svg .hm-ring').length === 1), 'a tile under the pointer is ringed on the map');
    await page.click('#home [data-gt-by="stage"]'); await wait(1500);
    const st = await ev(() => [...document.querySelectorAll('#home .gt-gn b')].map(b => b.textContent));
    expect(st[0] === 'In review', `grouped by stage (${st.join()})`);
    const key = await ev(() => document.querySelector('#home .gt-r').dataset.wsPick);
    await page.locator('#home .gt-r').first().click(); await wait(3000);
    const s = await ev(() => ({ page: PeelWorkspaces.page(), dev: (DevScope.current() || {}).key }));
    expect(s.page === 'site' && s.dev === key, `a row opens its site (${s.page}, ${s.dev})`);
  });

  await check('plan areas: Growth in an area and the map’s plan filter agree, precincts included', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    const nodes = await ev(() => [...PeelPlanTables.compute().nodes.values()].filter(n => n.areaId).map(n => ({ id: n.areaId, name: n.name, units: Math.round(n.m.planned), people: PeelUtil.roundPop(n.m.people) })));
    expect(nodes.length > 100, `${nodes.length} plan areas`);
    expect(nodes.some(n => /^Precinct /.test(n.name)), 'precincts are in the tree');
    for (const n of nodes) {
      const got = await ev(async id => {
        PeelApp.state.sp = [id]; PeelApp.applyFilters(); await new Promise(res => setTimeout(res, 500));
        const num = s => +String(s).replace(/<[^>]+>/g, '').replace(/[^\d.]/g, ''), f = (PeelOverviewTab.lastAreaSpec().figures || []).filter(Boolean);
        return { units: num(f.find(x => x.u === 'units').v), people: num(f.find(x => x.u === 'people').v) };
      }, n.id);
      expect(got.units === n.units, `${n.name}: ${n.units} units on Growth in an area, ${got.units} with the map's plan filter`);
      expect(got.people === n.people, `${n.name}: ${n.people} people on Growth in an area, ${got.people} with the map's plan filter`);
    }
    await ev(() => { PeelApp.state.sp = []; PeelApp.applyFilters(); });
  });

  // The pipeline ledger (docs/pipeline-ledger-plan.md, Phase 2), since navigation phase 3 Growth ›
  // Forecast's fold By period: it adds up to Growth's left to build at Everything, its own cut-off buttons
  // and the units / people switch change it, every total carries the disclaimer, its 2026 to 2031 column is
  // the Forecast's units expected by 2031 (one model); the old name, an old link and What's coming open the
  // fold, a redraw never rewrites the reader's pick, the developments are in the full table (a row opens
  // its site). (Selectors are scoped to the panel: the full table holds the same buttons.)
  await check('Growth › Forecast, By period: Peel equals left to build; its own cut-off and people; one model with the Forecast; the developments in the full table; old links open it', browser, {}, async ({ page, ev }, expect) => {
    const F = '#pnl-growth #pnl-by-period';
    // 1. The old name, as old links and buttons name it: the Forecast, By period open.
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab('growth', 'ledger'); });
    await page.waitForSelector(`${F}[open] .ldg-table`, { timeout: 30000 }); await wait(1500);
    const c1 = await ev(() => ({ sub: PeelAnalysisTabs.getGSub(), chips: [...document.querySelectorAll('[data-gsub]')].filter(b => b.getClientRects().length).map(b => b.textContent.trim()).join('|') }));
    expect(c1.sub === 'timing', `the Ledger opens the Forecast (${c1.sub})`);
    expect(c1.chips === 'Pipeline|Areas|Forecast', `Growth's chips: ${c1.chips}`);
    // 2. Everything, units, nothing hidden: Peel = left to build; the disclaimer; the check column.
    if (await ev(() => PeelLedgerUI.settings.hideLapsed)) { await page.click(`${F} [data-ledger-lapse]`); await wait(800); }
    await page.click(`${F} [data-ledger-cut="all"]`); await wait(800); await page.click(`${F} [data-ledger-measure="units"]`); await wait(800);
    const num = s => +String(s).replace(/[^\d]/g, '');
    const a = await ev(() => ({ peel: document.querySelector('#pnl-growth #pnl-by-period .ldg-peel td:last-child strong').textContent, left: Math.round(Growth.pipelineTotals(PeelDemandUI.overviewSet()).left), disc: document.querySelector('#pnl-growth #pnl-by-period .ldg-table caption').textContent, check: PeelLedgerUI.model().r.check }));
    expect(num(a.peel) === a.left, `Peel ${a.peel} = Growth's left to build ${a.left}`);
    expect(/Public-data estimate\. Not the Region’s committed capacity ledger\./.test(a.disc), 'the table carries the disclaimer');
    expect(a.check < 1e-6, `every parent equals its children (check ${a.check})`);
    // 3. One model with the Forecast (once it is timed): By period's 2026 to 2031 = the units expected by 2031.
    await page.waitForFunction(() => { const c = PeelLedgerUI.compute(); return !!(c && c.timed && c.homes); }, null, { timeout: 60000 }).catch(() => {});
    const one = await ev(() => { const fc = PeelTiming.bandsFromSchedules(PeelTiming.pipelineItems(PeelDemandUI.demandSet()), PeelTiming.forecastModel().ss); return { ledger: PeelLedger.sumOf(PeelLedgerUI.model().r.root.cells, { bucket: 'to2031', cutoff: 'all', measure: 'units' }), forecast: fc.years.filter(r => r.year <= 2031).reduce((t, r) => t + r.likely, 0) }; });
    expect(Math.abs(one.ledger - one.forecast) <= Math.max(1, one.forecast * 0.01), `By period's 2026 to 2031 (${Math.round(one.ledger)}) = the Forecast's units expected by 2031 (${Math.round(one.forecast)})`);
    // 4. Committed only, the people switch.
    await page.click(`${F} [data-ledger-cut="committed"]`); await wait(800);
    const com = await ev(() => +document.querySelector('#pnl-growth #pnl-by-period .ldg-peel td:last-child strong').textContent.replace(/[^\d]/g, ''));
    expect(com > 0 && com < a.left, `committed only: ${com} of ${a.left}`);
    await page.click(`${F} [data-ledger-measure="people"]`); await wait(800);
    expect(await ev(() => /^People by/.test(document.querySelector('#pnl-growth #pnl-by-period .ldg-table caption').textContent)), 'the people switch');
    await page.click(`${F} [data-ledger-cut="all"]`); await wait(800); await page.click(`${F} [data-ledger-measure="units"]`); await wait(800);
    // 4b. At a municipality the rows are its plans and Not in a plan, as Growth › Areas places them: each
    // plan's units = its left to build there (compared as maps: Areas orders plans by people, the table by
    // units), the total row = the municipality's left to build, named; then Peel again.
    await ev(() => { PeelApp.state.muni = 'Brampton'; PeelApp.applyFilters(); });
    await page.waitForFunction(() => { const th = document.querySelector('#pnl-growth #pnl-by-period .ldg-table thead th'); return th && th.textContent === 'Plan'; }, null, { timeout: 60000 }).catch(() => {});
    await wait(800);
    const b = await ev(() => {
      const n = s => +String(s).replace(/[^\d]/g, ''), t = document.querySelector('#pnl-growth #pnl-by-period .ldg-table');
      const rows = [...t.querySelectorAll('tbody tr')].map(tr => [tr.querySelector('th').textContent, n(tr.querySelector('td:last-child strong').textContent)]);
      const kids = PeelPlanTables.compute().nodes.get('m:Brampton').children.filter(c => c.m.left >= 0.5).map(c => [c.name, Math.round(c.m.left)]);
      return { head: t.querySelector('thead th').textContent, rows, kids, foot: t.querySelector('tfoot th').textContent, total: n(t.querySelector('tfoot td:last-child strong').textContent), left: Math.round(Growth.pipelineTotals(PeelDemandUI.overviewSet()).left), check: PeelLedgerUI.model().r.check };
    });
    expect(b.head === 'Plan', `at Brampton the rows are its plans (head ${b.head})`);
    const tm = new Map(b.rows.filter(([, v]) => v > 0)), am = new Map(b.kids);
    expect(tm.size === am.size && [...am].every(([k, v]) => tm.has(k) && Math.abs(tm.get(k) - v) <= 1), `each plan's units = Growth › Areas' left to build there (table ${JSON.stringify([...tm])}, Areas ${JSON.stringify([...am])})`);
    expect(b.rows.length > 1 && b.rows[b.rows.length - 1][0] === 'Not in a plan', `Not in a plan last (${b.rows.map(r => r[0]).join('|')})`);
    expect(b.foot === 'Brampton' && b.total === b.left, `the total row: Brampton ${b.total} = its left to build ${b.left} (${b.foot})`);
    expect(b.check < 1e-6, `the plans add up to Brampton (check ${b.check})`);
    await ev(() => { PeelApp.state.muni = ''; PeelApp.applyFilters(); });
    await page.waitForFunction(() => { const th = document.querySelector('#pnl-growth #pnl-by-period .ldg-table thead th'); return th && th.textContent === 'Municipality'; }, null, { timeout: 60000 }).catch(() => {});
    expect(await ev(() => document.querySelector('#pnl-growth #pnl-by-period .ldg-table thead th').textContent === 'Municipality'), 'Peel again: municipality rows');
    // 5. Shut by the reader (kept in this browser); an old link opens it; What's coming opens it.
    await page.click(`${F} > summary`); await wait(300);
    expect(await ev(() => PeelUtil.store.get('ledgerOpen', true) === false), 'shut by the reader: kept in this browser');
    await ev(() => PeelShare.viewLink.apply('t=growth&gs=ledger')); await wait(1500);
    expect(await ev(() => !!document.querySelector('#pnl-growth #pnl-by-period[open]')), 'an old gs=ledger link opens By period');
    await page.click(`${F} > summary`); await wait(300);
    await ev(() => PeelWorkspaces.go('coming')); await wait(1500);
    const c5 = await ev(() => ({ mode: PeelWorkspaces.mode(), sub: PeelAnalysisTabs.getGSub(), open: !!document.querySelector('#pnl-growth #pnl-by-period[open]') }));
    expect(c5.mode === 'ws' && c5.sub === 'timing' && c5.open, `What's coming opens the Forecast with By period open (${JSON.stringify(c5)})`);
    // 5b. A redraw is not a pick: shut on the map, a page, back on the map: still shut, and kept.
    await ev(() => PeelWorkspaces.setMode('full')); await wait(800);
    if (await ev(() => !!document.querySelector('#pnl-growth #pnl-by-period[open]'))) { await page.click(`${F} > summary`); await wait(300); }
    expect(await ev(() => PeelUtil.store.get('ledgerOpen', true) === false), 'shut by the reader again');
    await ev(() => PeelWorkspaces.openPage('home')); await wait(500);
    await ev(() => PeelWorkspaces.setMode('full')); await wait(500);
    const c5b = await ev(() => ({ there: !!document.querySelector('#pnl-growth #pnl-by-period'), open: !!document.querySelector('#pnl-growth #pnl-by-period[open]'), kept: PeelUtil.store.get('ledgerOpen', true) }));
    expect(c5b.there && !c5b.open && c5b.kept === false, `back on the map from a page: By period as the reader left it (${JSON.stringify(c5b)})`);
    await page.click(`${F} > summary`); await wait(300);
    expect(await ev(() => PeelUtil.store.get('ledgerOpen', true) === true), 'opened again by the reader');
    // 6. The developments in the full table, at their table; a row opens its development.
    await page.click(`${F} [data-full-table]`); await wait(1200);
    const ft = await ev(() => {
      const an = document.getElementById('analysis'), pane = document.getElementById('pane-growth-ledger'), cap = document.querySelector('#ledger-body table.ldg-list caption');
      const box = document.getElementById('analysis-panes').getBoundingClientRect(), r = cap ? cap.closest('table').getBoundingClientRect() : null;
      return { on: an.classList.contains('ft-on'), shown: !!pane && getComputedStyle(pane).display !== 'none', cap: cap ? cap.textContent : '', top: r ? Math.round(r.top) : null, box: [Math.round(box.top), Math.round(box.bottom)] };
    });
    expect(ft.on && ft.shown, `the Forecast's full table with By period's pane (${JSON.stringify(ft)})`);
    expect(/^Developments by stage, tier and expected year/.test(ft.cap), `the developments list (${ft.cap.slice(0, 60)})`);
    expect(ft.top != null && ft.top >= ft.box[0] - 2 && ft.top < ft.box[1], `the full table opens at the developments (top ${ft.top}, box ${ft.box})`);
    const key = await ev(() => document.querySelector('#ledger-body tr.ldg-row').dataset.pnlDev);
    await page.locator('#ledger-body tr.ldg-row').first().click(); await wait(2500);
    expect(await ev(() => (DevScope.current() || {}).key) === key, `a row opens its development (${key})`);
  });

  // What's coming (navigation phase 3): the Forecast page under the ledger's question, opened with By
  // period; a fold the reader shut on the Forecast page stays shut when the page rebuilds; the page's own
  // developments list moved to the Forecast's full table (one tap), which opens on the map.
  await check('phone: What’s coming opens the Forecast page at By period; no sideways scroll (the page, the full table, the map’s panel); a cut-off works; the developments in the full table', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    // 1. The Forecast page: By period shut by the reader stays shut on a rebuild (foldsNow).
    // (#home is the page's scroller, fixed at the screen's width: the document never grows wider, so the
    // page's sideways scroll is #home's own)
    const sideways = () => ev(() => { const h = document.getElementById('home'), d = document.documentElement; return { w: d.scrollWidth, vw: innerWidth, hw: h.scrollWidth, hc: h.clientWidth }; });
    await ev(() => PeelWorkspaces.openPage('outlook'));
    await page.waitForSelector('#home #pnl-by-period[open] .ldg-table', { timeout: 60000 }); await wait(1500);
    const s0 = await sideways();
    expect(s0.w <= s0.vw && s0.hw <= s0.hc, `no sideways scroll on the Forecast page, By period open (document ${s0.w}/${s0.vw}, page ${s0.hw}/${s0.hc})`);
    await page.click('#home #pnl-by-period > summary'); await wait(400);
    await ev(() => PeelWorkspaces.renderPage(true)); await wait(400);
    const s1 = await ev(() => ({ there: !!document.querySelector('#home #pnl-by-period'), open: !!document.querySelector('#home #pnl-by-period[open]'), kept: PeelUtil.store.get('ledgerOpen', true) }));
    expect(s1.there && !s1.open && s1.kept === false, `shut on the Forecast page, still shut when it rebuilds (${JSON.stringify(s1)})`);
    // 2. What's coming: the same page under its own question, By period open; the sidebar lights it.
    await ev(() => PeelWorkspaces.openPage('coming'));
    await page.waitForSelector('#home #pnl-by-period[open] .ldg-table', { timeout: 30000 }); await wait(1500);
    const s = await ev(() => { const sum = document.querySelector('#home #pnl-by-period > summary').getBoundingClientRect(), hm = document.getElementById('home'); return { w: document.documentElement.scrollWidth, vw: innerWidth, hw: hm.scrollWidth, hc: hm.clientWidth, h1: document.querySelector('#home h1').textContent, sum: Math.round(sum.height), disc: (document.querySelector('#home #pnl-by-period .ldg-table caption') || {}).textContent || '', lit: ((document.querySelector('#home .home-ws.on') || {}).dataset || {}).wsPage, page: PeelWorkspaces.page() }; });
    expect(s.page === 'coming' && s.h1 === 'What is coming, where, when and how sure?', `the ledger's question as the page's title (${s.page}: ${s.h1})`);
    expect(s.w <= s.vw && s.hw <= s.hc, `no sideways scroll (document ${s.w}/${s.vw}, page ${s.hw}/${s.hc})`);
    expect(s.sum >= 44, `By period's summary is a 44 px target (${s.sum})`);
    expect(/Public-data estimate\. Not the Region’s committed capacity ledger\./.test(s.disc), 'the table carries the disclaimer');
    expect(s.lit === 'coming', `What's coming lit in the menu (${s.lit})`);
    // 3. A cut-off button works on the page (the page rebuilds from the panel, the fold still open).
    await page.click('#home [data-ledger-cut="approved"]'); await wait(1000);
    const s3 = await ev(() => ({ on: (document.querySelector('#home [data-ledger-cut="approved"]') || { getAttribute: () => null }).getAttribute('aria-pressed'), open: !!document.querySelector('#home #pnl-by-period[open]') }));
    expect(s3.on === 'true' && s3.open, `a cut-off button works on the page (${JSON.stringify(s3)})`);
    // 4. The developments: the Forecast's full table, on the map.
    await page.click('#home #pnl-by-period [data-full-table]'); await wait(2000);
    // (on the map the sheet's #analysis-panes is the scroller)
    const panes = () => ev(() => { const a = document.getElementById('analysis-panes'); return { aw: a.scrollWidth, ac: a.clientWidth }; });
    const s4 = await ev(() => ({ mode: PeelWorkspaces.mode(), ft: document.getElementById('analysis').classList.contains('ft-on'), rows: document.querySelectorAll('#ledger-body tr.ldg-row').length, w: document.documentElement.scrollWidth, vw: innerWidth }));
    Object.assign(s4, await panes());
    expect(s4.mode === 'full' && s4.ft && s4.rows > 0, `the developments in the full table (${JSON.stringify(s4)})`);
    expect(s4.w <= s4.vw && s4.aw <= s4.ac, `no sideways scroll in the full table (document ${s4.w}/${s4.vw}, panes ${s4.aw}/${s4.ac})`);
    // 5. Back to the Forecast's panel, the sheet pulled up: By period and its link fit the sheet too.
    await ev(() => PeelPanel.closeFull()); await wait(800);
    await ev(() => PeelApp.setAnalysisSnap('full')); await wait(1000);
    const s5 = await ev(() => { const l = document.querySelector('#pnl-growth #pnl-by-period[open] [data-full-table]'); return { link: !!l && l.getClientRects().length > 0, ft: document.getElementById('analysis').classList.contains('ft-on') }; });
    Object.assign(s5, await panes());
    expect(s5.link && !s5.ft && s5.aw <= s5.ac, `no sideways scroll in the map's Forecast panel, By period open (panes ${s5.aw}/${s5.ac}; ${JSON.stringify(s5)})`);
  });

  // By period counts the site servicing permits however late data/dc-gate.json (1.3 MB) lands: Home sets
  // the Forecast's panel before it is in, and the gate sets the panel's folds again out of sight, so the
  // map's Growth › Forecast and What's coming show the full table's figure, never building permits only.
  await check('a late dc-gate.json: By period on the map’s Growth › Forecast and on What’s coming counts the site servicing permits, as the model does', browser, { slowData: { 'dc-gate.json': 12000 } }, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelDcGate && PeelDcGate.loaded(), null, { timeout: 120000 }); await wait(3000);
    const read = sel => ev(q => {
      const n = t => { const m = /([\d,]+) units are committed/.exec(t || ''); return m ? m[1] : null; };
      const d = document.querySelector(q), x = document.createElement('div'); x.innerHTML = PeelLedgerUI.model().answer;
      return { shown: d ? n(d.textContent) : null, model: n(x.textContent), loading: !!d && /Site servicing permits are still loading/.test(d.textContent) };
    }, sel);
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.showFootTab('growth', 'timing'); });
    await page.waitForSelector('#pnl-growth #pnl-by-period .ldg-table', { timeout: 60000 }); await wait(1500);
    const a = await read('#pnl-growth #pnl-by-period');
    expect(a.shown && a.shown === a.model && !a.loading, `the map's Growth › Forecast: By period's committed is the model's (${JSON.stringify(a)})`);
    await ev(() => PeelWorkspaces.openPage('coming'));
    await page.waitForSelector('#home #pnl-by-period .ldg-table', { timeout: 60000 }); await wait(1500);
    const b = await read('#home #pnl-by-period');
    expect(b.shown && b.shown === b.model && !b.loading, `What's coming: By period's committed is the model's (${JSON.stringify(b)})`);
  });

  // Kept from before phase 3 (navigation-design §7.2–7.3): a browser that last stood on Growth › Ledger,
  // the ledger's own settings stored, opens Growth on the Forecast (never Pipeline), By period open at its
  // stored cut-off, people and sort. The cut-off is the table's own (owner decision 2): a tap moves neither
  // the Scenario's Count nor the Forecast's figures, and the Count leaves it. A By period the reader shut
  // stays shut in this browser; a cold old link and What's coming's page link open it for the visit.
  await check('kept from before phase 3: a stored Growth › Ledger opens the Forecast at By period with its cut-off, people and sort; the cut-off is the table’s own, never the Scenario’s Count; cold gs=ledger and What’s coming links open a shut By period for the visit', browser, { prefs: { footTab4: 'growth', gSub: 'ledger', ledgerCut: 'approved', ledgerMeasure: 'people', ledgerSort: 'year' } }, async ({ page, ev }, expect) => {
    const F = '#pnl-growth #pnl-by-period';
    const cutOn = () => ev(() => [...document.querySelectorAll('#pnl-growth #pnl-by-period [data-ledger-cut][aria-pressed="true"]')].map(b => b.dataset.ledgerCut).join());
    const pr = await ev(() => ({ tab: PeelAnalysisTabs.getFootPref(), sub: PeelAnalysisTabs.getGSub() }));
    expect(pr.tab === 'growth' && pr.sub === 'timing', `the stored Ledger: Growth on the Forecast, not Pipeline (${JSON.stringify(pr)})`);
    await ev(() => PeelWorkspaces.setMode('full'));
    await page.waitForSelector(`${F}[open] .ldg-table`, { timeout: 60000 }); await wait(1500);
    const a = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), on: ([...document.querySelectorAll('[data-gsub].on')].find(b => b.getClientRects().length) || {}).textContent, cap: document.querySelector('#pnl-growth #pnl-by-period .ldg-table caption').textContent, hint: (document.querySelector('#pnl-growth #pnl-by-period .ldg-hint') || {}).textContent || '' }));
    expect(a.tab === 'growth' && a.on === 'Forecast', `the map opens on Growth › Forecast (${a.tab} › ${a.on})`);
    expect(await cutOn() === 'approved' && /^People by municipality and milestone \(\+ Plan approved\)/.test(a.cap), `By period at the stored + Plan approved, in people (${a.cap.slice(0, 60)})`);
    expect(/for this table only/.test(a.hint), `it says the cut-off counts for this table only (${a.hint})`);
    // The stored sort: the developments in the full table by expected year.
    await page.click(`${F} [data-full-table]`); await wait(1500);
    const so = await ev(() => ({ ft: document.getElementById('analysis').classList.contains('ft-on'), th: [...document.querySelectorAll('#ledger-body table.ldg-list th[aria-sort="ascending"], #ledger-body table.ldg-list th[aria-sort="descending"]')].map(t => t.textContent.trim()).join('|') }));
    expect(so.ft && so.th === 'Expected ▾', `the full table's developments by the stored sort, expected year (${JSON.stringify(so)})`);
    await page.keyboard.press('Escape'); await wait(800);
    // Owner decision 2: a cut-off tap leaves the Scenario's Count and the Forecast's figures as they were …
    const fig = () => ev(() => ({ basis: PeelApp.state.basis, chip: (document.querySelector('#tb-scen .tb-scen-t') || {}).textContent || '', figs: ((document.querySelector('#pnl-growth [data-sec="figures"]') || {}).textContent || '').trim() }));
    const f0 = await fig();
    await page.click(`${F} [data-ledger-cut="review"]`); await wait(1000);
    const f1 = await fig();
    expect(await cutOn() === 'review' && await ev(() => PeelUtil.store.get('ledgerCut', null)) === 'review', 'the cut-off: + In review, kept in this browser');
    expect(f0.figs.length > 0 && f1.basis === f0.basis && f1.chip === f0.chip && f1.figs === f0.figs, `the Scenario's Count and the Forecast's figures unchanged (${JSON.stringify({ f0, f1 })})`);
    // … and the Count (committed only) leaves By period's cut-off as it is.
    await ev(() => document.querySelector('#scen-bar [data-svcopt="basis"][data-v="committed"]').click()); await wait(2500);
    const c2 = await ev(() => ({ basis: PeelApp.state.basis, cut: PeelLedgerUI.settings.cutoff, open: !!document.querySelector('#pnl-growth #pnl-by-period[open]') }));
    expect(c2.basis === 'committed' && c2.cut === 'review' && await cutOn() === 'review' && c2.open, `the Count at committed only: By period keeps + In review (${JSON.stringify(c2)})`);
    await ev(b => { PeelApp.state.basis = b; PeelApp.applyFilters(); }, f0.basis); await wait(1500);
    // Shut by the reader: kept in this browser. A cold old link opens it for the visit, the store untouched.
    // (each link with a query of its own: a new load, not a hash change)
    await page.click(`${F} > summary`); await wait(300);
    expect(await ev(() => PeelUtil.store.get('ledgerOpen', true) === false), 'shut by the reader');
    await page.goto(`http://localhost:${PORT}/?link#t=growth&gs=ledger`);
    await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 });
    await page.waitForSelector(`${F}[open] .ldg-table`, { timeout: 120000 }); await wait(1500);
    const cl = await ev(() => ({ mode: PeelWorkspaces.mode(), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getGSub(), kept: PeelUtil.store.get('ledgerOpen', true), link: PeelShare.viewLink.hash() }));
    expect(cl.mode === 'full' && cl.tab === 'growth' && cl.sub === 'timing' && cl.kept === false, `t=growth&gs=ledger opened cold: the Forecast, By period open for the visit (${JSON.stringify(cl)})`);
    expect(/(^|&)gs=timing(&|$)/.test(cl.link) && !/gs=ledger/.test(cl.link), `the link now says gs=timing (${cl.link})`);
    // What's coming's page link, cold: the page, By period open, the store untouched.
    await page.goto(`http://localhost:${PORT}/?page#w=p:coming`);
    await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 });
    await page.waitForSelector('#home #pnl-by-period[open] .ldg-table', { timeout: 120000 }); await wait(1500);
    const wc = await ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), h1: document.querySelector('#home h1').textContent, kept: PeelUtil.store.get('ledgerOpen', true) }));
    expect(wc.mode === 'home' && wc.page === 'coming' && wc.kept === false, `w=p:coming opened cold: What's coming, By period open (${JSON.stringify(wc)})`);
    // The next visit with no link: By period as the reader left it, shut.
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); await wait(2500);
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab('growth', 'timing'); });
    await page.waitForSelector(`${F} .ldg-table`, { state: 'attached', timeout: 60000 }); await wait(1500);
    const nx = await ev(() => ({ there: !!document.querySelector('#pnl-growth #pnl-by-period'), open: !!document.querySelector('#pnl-growth #pnl-by-period[open]'), cut: PeelLedgerUI.settings.cutoff }));
    expect(nx.there && !nx.open && nx.cut === 'review', `the next visit: By period shut, as the reader left it, at its cut-off (${JSON.stringify(nx)})`);
  });

  // Task 7 (navigation-design §6.1): the growth of a drawn area by horizon year in four clicks: Draw an
  // area, the drag, Growth, Forecast. By period is open to start, and its table is the developments drawn.
  await check('a drawn area by period in four clicks (task 7): Draw an area, drag, Growth, Forecast; By period open, its total the drawn developments’ left to build', browser, {}, async ({ page, ev }, expect) => {
    const F = '#pnl-growth #pnl-by-period';
    expect(await ev(() => PeelWorkspaces.mode() === 'home' && PeelWorkspaces.page() === 'home' && !!document.querySelector('#home .page-draw')), 'Home, with Draw an area in its header');
    await page.click('#home .page-draw'); await wait(2000);   // 1. Draw an area
    await ev(() => { const p = PeelApp.state.filtered.filter(q => q.lat != null).sort((x, y) => (y.units || 0) - (x.units || 0))[0]; PeelMapCore.map.setView([p.lat, p.lng], 13, { animate: false }); }); await wait(2000);   // (a district: several developments)
    const D = 90;
    const at = await ev(d => {
      const map = PeelMapCore.map, b = map.getContainer().getBoundingClientRect(), on = (x, y) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('.lasso-layer') && !e.closest('.lasso-hint')); };
      for (const p of PeelApp.state.filtered) {
        if (p.lat == null) continue;
        const c = map.latLngToContainerPoint([p.lat, p.lng]), x = b.left + c.x, y = b.top + c.y;
        if ([[0, 0], [-d, -d], [d, -d], [d, d], [-d, d]].every(([dx, dy]) => on(x + dx, y + dy))) return { x, y };
      }
      return null;
    }, D);
    expect(!!at, 'a development in view, the drawing layer round it');
    if (at) {   // 2. the drag
      await page.mouse.move(at.x - D, at.y - D); await page.mouse.down();
      for (const [x, y] of [[D, -D], [D, D], [-D, D], [-D, -D + 8]]) await page.mouse.move(at.x + x, at.y + y, { steps: 8 });
      await page.mouse.up(); await wait(2000);
    }
    const s = await ev(() => ({ n: PeelAreaSelect.selection.size, scope: PeelApp.state.ss || null, sub: PeelAnalysisTabs.getGSub() }));
    expect(s.n > 0 && s.scope === 'sel:selection', `the drag picks the developments inside it, a scope of its own (${JSON.stringify(s)})`);
    expect(s.sub === 'pipeline', `Growth opens on Pipeline (no Growth view picked in this browser), so Forecast is the fourth click (${s.sub})`);
    await page.click('.f-tab[data-tab="growth"]'); await wait(1500);   // 3. Growth
    await page.click('[data-gsub="timing"]');   // 4. Forecast
    await page.waitForSelector(`${F}[open] .ldg-table`, { timeout: 60000 }); await wait(1500);
    const g = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getGSub(), scope: PeelApp.state.ss || null }));
    expect(g.tab === 'growth' && g.sub === 'timing' && g.scope === 'sel:selection', `Growth › Forecast at the drawn area, By period open (${JSON.stringify(g)})`);
    // (Everything, units, nothing hidden: the total is the drawn developments' left to build)
    if (await ev(() => PeelLedgerUI.settings.hideLapsed)) { await page.click(`${F} [data-ledger-lapse]`); await wait(800); }
    if (await ev(() => PeelLedgerUI.settings.cutoff !== 'all')) { await page.click(`${F} [data-ledger-cut="all"]`); await wait(800); }
    if (await ev(() => PeelLedgerUI.settings.measure !== 'units')) { await page.click(`${F} [data-ledger-measure="units"]`); await wait(800); }
    const b = await ev(() => {
      const set = PeelDemandUI.overviewSet(), sel = PeelAreaSelect.selection;
      return { devs: PeelLedgerUI.compute().devs, set: set.length, inSel: set.every(p => sel.has(p.key)), total: +document.querySelector('#pnl-growth #pnl-by-period .ldg-peel td:last-child strong').textContent.replace(/[^\d]/g, ''), left: Math.round(Growth.pipelineTotals(set).left), peel: Math.round(Growth.pipelineTotals(PeelApp.state.projects.filter(p => p.phase !== 'cancelled')).left), check: PeelLedgerUI.model().r.check };
    });
    expect(b.set > 0 && b.inSel && b.devs === b.set, `By period counts the developments drawn (${b.devs} of ${b.set}, all selected: ${b.inSel})`);
    expect(b.total === b.left && b.total < b.peel, `its total ${b.total} = their left to build ${b.left} (Peel's ${b.peel})`);
    expect(b.check < 1e-6, `every parent equals its children (check ${b.check})`);
    await ev(() => PeelAreaSelect.clearSelection());
  });

  await check('DC impact model: tiers as the DC panel, built kept apart, cost shares add up, a gate per development', browser, {}, async ({ ev }, expect) => {
    const r = await ev(async () => {
      await PeelSewerCap.loadSewers();
      for (let i = 0; i < 60 && !PeelDcImpact.model(); i++) await new Promise(res => setTimeout(res, 500));
      const t0 = performance.now(), m = PeelDcImpact.model(), ms = performance.now() - t0; if (!m) return null;
      const P = [...m.projects.values()], built = new Set(PeelApp.state.projects.filter(p => PeelMapMarkers.svcLayerOf(p) === 'built').map(p => p.key));
      const gating = x => m.gateTiers.includes(x.tier);
      const off = P.filter(p => p.cost > 0 && p.devs.some(gating) && Math.abs(p.devs.reduce((t, x) => t + x.share, 0) - p.cost) > 1).map(p => p.key);
      const b2share = P.reduce((t, p) => t + p.devs.filter(x => x.tier === 'B2' && x.share).length, 0);
      // As the DC main's panel: B1 only where the sewer it relieves runs short, B2 only where it has room.
      const panel = P.filter(p => p.relieves).every(p => p.devs.every(x => x.tier === 'A' || (x.tier === 'B1') === (p.relieves.status !== 'ok')));
      const devs = [...m.byDev.values()];
      return { ms, n: P.length, withDev: P.filter(p => p.devs.length).length, tiers: [...new Set(P.flatMap(p => p.devs.map(x => x.tier)))].sort().join(''), b2share, panel, gateTiers: m.gateTiers.join(''),
        builtIn: P.reduce((t, p) => t + p.devs.filter(x => built.has(x.p.key)).length, 0), off, linked: devs.length,
        gateOk: devs.every(d => !d.gate || d.links.some(l => l.key === d.gate.key && l.y === d.gate.y)), gaps: devs.filter(d => d.gap).length,
        again: PeelDcImpact.model() === m };
    });
    expect(!!r, 'the model is ready once the sewers and the servicing model are loaded');
    if (!r) return;
    expect(r.n > 150 && r.withDev > 0 && r.linked > 0, `projects and links (${r.n} projects, ${r.withDev} with developments, ${r.linked} developments)`);
    expect(/^A/.test(r.tiers) && /B/.test(r.tiers), `tiers A and B present (${r.tiers})`);
    expect(r.gateTiers === 'AB1', `gates on A and B1 (${r.gateTiers})`);
    expect(r.panel, 'B1 exactly where the relieved sewer runs short, as the DC main panel says');
    expect(r.b2share === 0, `B2 (on the path only) carries no cost share (${r.b2share})`);
    expect(r.builtIn === 0, `no built development in a tier (${r.builtIn})`);
    expect(!r.off.length, `each project's shares add up to its cost (${r.off.slice(0, 3).join(', ')})`);
    expect(r.gateOk, 'every gate is one of the development’s own projects');
    expect(r.again, 'a second call is served from the cache');
    expect(r.ms < 10000, `computed in ${Math.round(r.ms)} ms`);
  });

  // Navigation phase 4: DC timing and DC projects are one list, both verdicts named; Late filters it; a row opens
  // the project's card on the map (its dcwork: scope) and the project in place on the Capital page, with its map;
  // Home's DC projects late opens it at Late.
  await check('Capital › DC timing: one list with both verdicts, Late filters it, a row opens the project’s card on the map and the project in place on the Capital page with its map; the Funding lab inside it; Home’s DC projects late opens it at Late', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.setSys('both'); PeelAnalysisTabs.openTab('dca', 'timing'); });
    await page.waitForSelector('#pnl-dca [data-dcproj-open]', { timeout: 90000 });
    const chips = await ev(() => [...document.querySelectorAll('[data-dcasub]')].filter(b => b.offsetParent).map(b => b.textContent.trim()));
    expect(chips.join('|') === 'DC timing|EAs|Projects', `Capital's chips (${chips.join(' · ')})`);
    // The list, then its full table: the list in full first (both verdicts), then the capacity analysis.
    const a = await ev(() => {
      const b = document.getElementById('dca-dcproj-body'), t = document.getElementById('dca-timing-body');
      return { rows: document.querySelectorAll('#pnl-dca .pnl-list [data-dcproj-open]').length, body: document.querySelectorAll('#dca-dcproj-body tr[data-dcproj-open]').length,
        first: !!(b && t && (b.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)), cap: ((b && b.querySelector('caption')) || {}).textContent || '',
        meta: [...document.querySelectorAll('#pnl-dca .pnl-list .pnl-row')].every(r => /capacity runs out/.test(r.textContent)),
        fund: [...document.querySelectorAll('#pnl-dca details summary')].some(s => /Funding/.test(s.textContent)) };
    });
    expect(a.rows > 0 && a.body > a.rows, `a short list and the list in full (${a.rows} / ${a.body})`);
    expect(a.first && /^Every DC project, both verdicts/.test(a.cap), `the list in full comes first ("${a.cap.slice(0, 60)}")`);
    expect(a.meta, 'every row says the first verdict: when the capacity it relieves runs out');
    expect(!a.fund, 'no funding screen while the Funding lab is off');
    // The second verdict: worked out after the list painted, then drawn.
    const built = await page.waitForFunction(() => !!PeelDcImpact.current(), null, { timeout: 60000 }).then(() => true, () => false);
    expect(built, 'the DC projects allocation is worked out after the list paints');
    await wait(1000);
    const v2 = await ev(() => ({ working: [...document.querySelectorAll('#pnl-dca .pnl-list .pnl-row')].some(r => /working out/.test(r.textContent)),
      fig: ([...document.querySelectorAll('#pnl-dca .pnl-fig')].find(f => /first homes before it is built/.test(f.textContent)) || {}).textContent || '' }));
    expect(!v2.working && /expected first/.test(v2.fig), `the second verdict filled in (${v2.fig.slice(0, 80)})`);
    // Late filters the list.
    if (await ev(() => !!document.querySelector('#pnl-dca .dcp-status [data-dc-status="gap"]'))) {
      await page.click('#pnl-dca .dcp-status [data-dc-status="gap"]'); await wait(1000);
      const l = await ev(() => ({ metas: [...document.querySelectorAll('#pnl-dca .pnl-list .pnl-row .pnl-r-meta')].map(m => m.textContent), fig: +(((document.querySelector('#pnl-dca .pnl-fig[data-dc-status="gap"] b') || {}).textContent || '').replace(/\D/g, '')),
        total: PeelDcProjects.rowsFor(PeelDcCost.dcAnalysis(), PeelDcImpact.current()).length, status: PeelDcProjects.state.status }));
      expect(l.status === 'gap' && l.metas.length > 0 && l.metas.every(t => /in service after it runs out/.test(t)), `Late: every row is late (${l.metas.length} rows)`);
      expect(l.fig === l.total, `the late figure is the list's total (${l.fig} / ${l.total})`);
      await page.click('#pnl-dca .dcp-status [data-dc-status="all"]'); await wait(800);
    }
    // A row opens the project's card, its dcwork: scope on the Overview (sorted by Most affected, so the first has
    // developments relying on it): both verdicts, the developments by tier (the allocation is in by now), what it
    // relieves; the trail's DC timing step opens Capital › DC timing, the card's All DC projects › the list.
    await page.click('#pnl-dca [data-dcproj-sort="affected"]'); await wait(800);
    await page.click('#pnl-dca .pnl-list [data-dcproj-open]'); await wait(2000);
    const c = await ev(() => { const b = document.getElementById('scope-body'), t = (b && b.textContent) || '';
      return { ss: PeelApp.state.ss || '', tab: PeelAnalysisTabs.getFootTab(), answer: ((b && b.querySelector('.pnl-answer')) || {}).textContent || '', relieves: /What it relieves/.test(t),
        tiers: [...(b ? b.querySelectorAll('caption') : [])].some(x => /relying on it, by tier/.test(x.textContent)), rows: b ? b.querySelectorAll('tr.ld-row[data-dev]').length : 0,
        trail: [...document.querySelectorAll('#trail .tb-step')].map(x => x.textContent.trim()) }; });
    expect(/^dcwork:/.test(c.ss) && c.tab === 'overview', `a row opens the project's card (${c.ss}, ${c.tab})`);
    expect(/In service|relieves no modelled constraint|held back|check the data/.test(c.answer) && /rel(y|ies) on it/.test(c.answer), `its headline names both verdicts ("${c.answer.slice(0, 140)}")`);
    expect(c.tiers && c.rows > 0 && c.relieves, `the developments relying on it by tier (${c.rows} rows), then what it relieves`);
    expect(c.trail.includes('DC timing'), `the trail has a DC timing step (${c.trail.join(' › ')})`);
    await ev(() => { const s = [...document.querySelectorAll('#trail .tb-step')].find(x => x.textContent.trim() === 'DC timing'); if (s) s.click(); }); await wait(1000);
    expect(await ev(() => PeelAnalysisTabs.getFootTab() === 'dca' && PeelAnalysisTabs.getDcSub() === 'timing'), 'its trail step opens Capital › DC timing');
    await ev(() => PeelAnalysisTabs.showFootTab('overview')); await wait(1000);
    await page.click('#scope-body [data-scope-result-close][data-at="dca:timing"]'); await wait(1000);
    expect(await ev(() => !PeelSvcScope.hasResult() && PeelAnalysisTabs.getFootTab() === 'dca' && !!document.querySelector('#pnl-dca [data-dcproj-open]')), 'All DC projects ›: the card closed, the list open');
    await ev(() => { PeelLabs.set('funding', true); PeelDcaTab.renderDca(); }); await wait(1500);
    expect(await ev(() => [...document.querySelectorAll('#pnl-dca details summary')].some(s => /Funding screen/.test(s.textContent))), 'the Funding lab adds the funding screen to DC timing');
    // The Capital page: DC timing is its first section; a project opens in place with its map; the bar's DC timing returns to the list.
    await ev(() => { PeelLabs.set('funding', false); PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage('projects'); }); await wait(1500);
    const bar = await ev(() => ({ bar: [...document.querySelectorAll('#home .page-sec')].map(b => b.textContent.trim()).join('|'), want: PeelSections.WORKSPACES.capital.secs.map(x => x.title).join('|') }));
    expect(bar.bar === bar.want, `the Capital page's sections (${bar.bar})`);
    await page.waitForSelector('#home [data-dcproj-open]', { timeout: 30000 });
    await page.click('#home [data-dcproj-open]'); await wait(1500);
    const w = await ev(() => ({ back: !!document.querySelector('#home [data-dcproj-back]'), name: (document.querySelector('#home h1') || {}).textContent || '',
      oneP: document.querySelectorAll('#home .home-answer').length === 1 && !!document.querySelector('#home .home-answer .ws-back') && /rel(y|ies) on it|relies on it|No development/.test((document.querySelector('#home .home-answer') || {}).textContent || ''),
      proj: document.querySelectorAll('#home .home-map-svg .hm-dcp').length, dots: document.querySelectorAll('#home .home-map-svg .hm-dcd').length, toFull: !!document.querySelector('#home [data-dcproj-map]') }));
    expect(w.back && /·/.test(w.name), `the Capital page opens a project in place, with its name and a way back ("${w.name.slice(0, 60)}")`);
    expect(w.oneP, 'its answer is one sentence, the way back above it');
    expect(w.proj > 0 && w.dots > 0 && w.toFull, `the side map shows the project and the developments relying on it, and opens the full map (${w.proj} lines, ${w.dots} developments)`);
    // Open the map, a project open: the map view at its card.
    await page.click('#home [data-ws-dcwork]'); await wait(2000);
    const om = await ev(() => ({ mode: PeelWorkspaces.mode(), ss: PeelApp.state.ss || '', sel: PeelDcProjects.state.sel, tab: PeelAnalysisTabs.getFootTab() }));
    expect(om.mode !== 'home' && om.ss === `dcwork:${om.sel}` && om.tab === 'overview', `Open the map: the project's card on the map (${JSON.stringify(om)})`);
    await ev(() => { PeelSvcScope.closeResult(); PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage('projects'); }); await wait(1500);
    await page.click('#home .page-sec[data-ws-page="projects"]'); await wait(1500);
    expect(await ev(() => !!document.querySelector('#home [data-dcproj-open]') && !document.querySelector('#home [data-dcproj-back]')), 'the bar’s DC timing: the list again');
    // Home's DC projects late: every relief late (the analysis itself); a tap opens the list at Late, which with
    // the answer's "Also late" adds up to it (at System Both: Home never filters). The workbook's filter is untouched.
    await ev(() => { PeelAnalysisTabs.setSys('both'); PeelWorkspaces.openPage('home'); }); await wait(2500);
    const h = await ev(() => ({ v: +(((document.querySelector('#home .pnl-fig[data-dc-status="gap"] b') || {}).textContent || '').replace(/\D/g, '')), n: PeelDcCost.dcAnalysis().list.filter(r => r.rec === 'advance').length, f: PeelMasterPlan.dcnFilter }));
    expect(h.v === h.n, `Home's DC projects late is the analysis' (${h.v} / ${h.n})`);
    await page.click('#home .pnl-fig[data-dc-status="gap"]'); await wait(2500);
    const hl = await ev(() => ({ page: PeelWorkspaces.page(), status: PeelDcProjects.state.status, late: PeelDcProjects.rowsFor(PeelDcCost.dcAnalysis(), PeelDcImpact.current()).length,
      also: +((/Also late: (\d+)/.exec(((document.querySelector('#home .home-answer') || {}).textContent || '')) || [0, 0])[1]), f: PeelMasterPlan.dcnFilter }));
    expect(hl.page === 'projects' && hl.status === 'gap', `the Capital page at Late (${hl.page}, ${hl.status})`);
    expect(hl.late + hl.also === h.v, `the list's late and the answer's Also late add up to Home's (${hl.late} + ${hl.also} / ${h.v})`);
    expect(hl.f === h.f, `the workbook's DC filter unchanged (${hl.f})`);
    await ev(() => { PeelDcProjects.state.status = 'all'; PeelDcProjects.refresh(); });
  });

  // Navigation phase 4: the DC timing tool result is Capital › DC timing. Every way to it opens the list at the
  // workbook filter's Status, the System left as the reader set it (one control); no tool result opens; only the
  // list's Status chips write the filter, and the workbook's DC sheet follows it.
  await check('the DC timing tool result and “All DC timing →” open Capital › DC timing at its Status, the System the reader’s; no tool result; the workbook’s DC sheet follows the list’s Status chip', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => !!(PeelApp.state.svcModel && PeelApp.state.dcInfra), null, { timeout: 120000 });
    await ev(() => PeelSewerCap.loadSewers()); await wait(500);
    // 1. showDcTiming (App().showDcTiming, Help's Show me): the list at Late, the System the reader's.
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.setSys('both'); PeelMasterPlan.dcnFilter = 'gap:water'; PeelMasterPlan.showDcTiming(); });
    await page.waitForSelector('#pnl-dca .dcp-status [data-dc-status]', { timeout: 90000 }); await wait(800);
    const a = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getDcSub(), status: PeelDcProjects.state.status, sys: PeelAnalysisTabs.getSys(), result: PeelSvcScope.hasResult(), on: !!document.querySelector('#pnl-dca .dcp-status [data-dc-status="gap"].on') }));
    expect(a.tab === 'dca' && a.sub === 'timing' && a.status === 'gap' && !a.result && a.on, `showDcTiming opens Capital › DC timing at Late, no tool result (${JSON.stringify(a)})`);
    expect(a.sys === 'both', `the System stays the reader's, never the filter's (${a.sys})`);
    // 2. A development's "All DC timing →" (its Capital full table, when it has one): the development closes.
    const opened = await ev(() => { const q = PeelApp.state.projects.find(x => x.phase === 'approved' && x.units > 300); if (!q) return false; PeelDevNav.showDetail(q); return true; });
    if (opened) {
      await wait(2000); await ev(() => { PeelAnalysisTabs.openTab('dca', 'timing'); PeelPanel.openFull(); }); await wait(2500);
      if (await ev(() => !!document.querySelector('#dca-timing-body [data-dcn-all]'))) {
        await ev(() => { PeelDcProjects.state.status = 'all'; document.querySelector('#dca-timing-body [data-dcn-all]').click(); }); await wait(1500);
        const b = await ev(() => ({ dev: !!DevScope.current(), status: PeelDcProjects.state.status, list: !!document.querySelector('#pnl-dca .dcp-status'), result: PeelSvcScope.hasResult(), tab: PeelAnalysisTabs.getFootTab() }));
        expect(!b.dev && b.status === 'gap' && b.list && !b.result && b.tab === 'dca', `All DC timing → closes the development and opens the list at Late (${JSON.stringify(b)})`);
      }
      await ev(() => { if (PeelPanel.closeFull) PeelPanel.closeFull(); if (DevScope.current()) DevScope.close(); }); await wait(1000);
    }
    // 3. A Status chip writes the filter (its status and the System at the tap); a later link keeps the System.
    await ev(() => { PeelAnalysisTabs.openTab('dca', 'timing'); PeelAnalysisTabs.setSys('water'); }); await wait(1500);
    await page.click('#pnl-dca .dcp-status [data-dc-status="all"]'); await wait(800);
    const f = await ev(() => PeelMasterPlan.dcnFilter);
    expect(f === 'all:water', `a Status chip writes the workbook's filter: its status and the System at the tap (${f})`);
    await ev(() => { PeelAnalysisTabs.setSys('both'); PeelMasterPlan.showDcTiming(); }); await wait(1000);
    const g = await ev(() => ({ sys: PeelAnalysisTabs.getSys(), status: PeelDcProjects.state.status }));
    expect(g.sys === 'both' && g.status === 'all', `"All DC timing →" again: the filter's Status, the System still the reader's (${JSON.stringify(g)})`);
    // 4. Layers › More settings "DC timing: capacity vs DC projects →": the list, no tool result.
    await ev(() => { PeelAnalysisTabs.openTab('overview'); const b = document.getElementById('opt-dctiming'); if (b) b.click(); }); await wait(1500);
    const l = await ev(() => ({ btn: !!document.getElementById('opt-dctiming'), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getDcSub(), result: PeelSvcScope.hasResult() }));
    expect(l.btn && l.tab === 'dca' && l.sub === 'timing' && !l.result, `More settings' DC timing link opens the list (${JSON.stringify(l)})`);
    // 5. The workbook's DC sheet: the constraints at the filter step 3 wrote (water only).
    const x = await ev(() => { const all = PeelMasterPlan.allNeeds(), r = PeelExportWorkbook.dcTimingRows(all, { filter: PeelMasterPlan.dcnFilter, ppu: 2.5, hzEnd: PeelSvcPlants.hz.end, plantTrigger: PeelMasterPlan.PLANT_TRIGGER });
      return { f: PeelMasterPlan.dcnFilter, rows: r.rows.length, water: all.filter(c => c.sys === 'water').length, all: all.length }; });
    expect(x.f === 'all:water' && x.rows === x.water && x.rows < x.all, `the DC sheet follows the list's Status chip: water only (${JSON.stringify(x)})`);
  });

  // Navigation phase 4: EA to construction joins Capital › EAs. On the map, a fold of its panel (shut; the chip,
  // an old #w=eaflow link and its page open it; the reader's tap keeps it), its lists in the full table; on a
  // page, the Capital page's EAs section is its page (the EAs, then EA to construction).
  await check('Capital › EAs carries EA to construction: a fold (shut, kept as the reader leaves it, its link into the full table), the chip opens it; the EAs page', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelCapitalEA && PeelCapitalEA.data.loaded, null, { timeout: 120000 });
    // 1. The fold, shut; open it: the timeline; a redraw keeps it open.
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab('dca', 'eas'); }); await wait(2000);
    const f = await ev(() => { const d = document.querySelector('#pnl-dca #pnl-eaflow'); return d ? { sum: d.querySelector('summary').textContent.trim(), open: d.open } : null; });
    expect(f && f.sum === 'EA to construction' && !f.open, `Capital › EAs has the fold EA to construction, shut (${JSON.stringify(f)})`);
    await page.click('#pnl-dca #pnl-eaflow > summary'); await wait(600);
    await ev(() => PeelDcaTab.renderDca()); await wait(600);
    const o = await ev(() => { const d = document.querySelector('#pnl-dca #pnl-eaflow'); return { open: !!(d && d.open), rows: d ? d.querySelectorAll('.eat .eat-row').length : 0, kept: PeelCapitalEA.eaFlowOpen() }; });
    expect(o.open && o.kept && o.rows > 0, `opened, the timeline (${o.rows} rows), kept through a redraw (${JSON.stringify(o)})`);
    // 2. Its link: the full table at its first list, in view.
    await page.click('#pnl-dca #pnl-eaflow [data-ft-go]'); await wait(1500);
    const ft = await ev(() => { const panes = document.getElementById('analysis-panes'), on = document.getElementById('analysis').classList.contains('ft-on');
      const c = [...panes.querySelectorAll('#dca-eas-body .ea-flow caption')].find(x => /^Complete, waiting for construction/.test(x.textContent.trim()));
      if (!c) return { on, cap: false }; const r = c.getBoundingClientRect(), b = panes.getBoundingClientRect(); return { on, cap: true, top: Math.round(r.top - b.top), h: Math.round(b.height) }; });
    expect(ft.on && ft.cap && ft.top >= -2 && ft.top < ft.h, `the full table at "Complete, waiting for construction" (${JSON.stringify(ft)})`);
    // 3. A row of it opens the EA.
    await page.click('#dca-eas-body .ea-flow tr[data-ce-open]'); await wait(1500);
    expect(/^ea:/.test(await ev(() => PeelApp.state.ss || '')), 'a full-table row opens its EA');
    await ev(() => { if (PeelPanel.closeFull) PeelPanel.closeFull(); PeelSvcScope.closeResult(); }); await wait(800);
    // 4. The reader shuts it; the EA to construction chip opens it again.
    await ev(() => { PeelAnalysisTabs.openTab('dca', 'eas'); }); await wait(1200);
    if (await ev(() => { const d = document.querySelector('#pnl-dca #pnl-eaflow'); return !!(d && d.open); })) await page.click('#pnl-dca #pnl-eaflow > summary');
    await wait(500);
    expect(await ev(() => !PeelCapitalEA.eaFlowOpen()), 'the reader shut it');
    await ev(() => PeelWorkspaces.go('eaflow')); await wait(2500);
    expect(await ev(() => PeelAnalysisTabs.getDcSub() === 'eas' && !!document.querySelector('#pnl-dca #pnl-eaflow[open]')), 'the EA to construction chip: Capital › EAs with the fold open');
    // 5. The EAs page: Capital's EAs section, the EAs then EA to construction; the EAs built there when the map has none.
    await ev(() => { PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage('eaflow'); }); await wait(2500);
    const pg = await ev(() => ({ on: ((document.querySelector('#home .page-sec.on') || {}).textContent || '').trim(), lists: [...document.querySelectorAll('#home .pnl-list-h h3')].map(h => h.textContent.trim()), rows: document.querySelectorAll('#home .eat-row').length }));
    expect(pg.on === 'EAs', `the bar: EAs (${pg.on})`);
    expect(pg.lists.includes('Current EAs') && pg.lists.includes('Complete, waiting for construction (oldest first)') && pg.lists.indexOf('Current EAs') < pg.lists.indexOf('Complete, waiting for construction (oldest first)'), `the EAs, then EA to construction (${pg.lists.join(' | ')})`);
    expect(pg.rows > 0, `the timeline (${pg.rows} rows)`);
    await ev(() => { PeelPanel.clear('dca:eas'); PeelWorkspaces.renderPage(true); }); await wait(1500);
    expect(await ev(() => [...document.querySelectorAll('#home .pnl-list-h h3')].some(h => h.textContent.trim() === 'Current EAs')), 'the EAs with no stored panel: built on demand');
    await page.click('#home .eat-row'); await wait(2500);
    const op = await ev(() => ({ mode: PeelWorkspaces.mode(), ss: PeelApp.state.ss || '' }));
    expect(op.mode !== 'home' && /^ea:/.test(op.ss), `a timeline row opens the EA on the map (${JSON.stringify(op)})`);
  });

  // Navigation phase 4 on a phone: Capital's three chips, DC timing's filters, a project's card, Capital › EAs' fold
  // and the Capital and EAs pages in reach, nothing wider than the screen.
  await check('phone: Capital’s three chips, DC timing’s filters and a project’s card in reach, EA to construction’s fold and the EAs page; no sideways scroll', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    await ev(() => { PeelWorkspaces.setMode('full'); PeelApp.setAnalysisSnap('half'); PeelAnalysisTabs.setSys('both'); PeelAnalysisTabs.openTab('dca', 'timing'); });
    await page.waitForSelector('#pnl-dca [data-dcproj-open]', { timeout: 90000 }); await wait(1000);
    const a = await ev(() => { const row = document.querySelector('.f-subtabs[data-pane="dca"]'), h = el => Math.round(el.getBoundingClientRect().height);
      return { fits: !!row && row.scrollWidth <= row.clientWidth, chips: [...document.querySelectorAll('[data-dcasub]')].filter(b => b.offsetParent).map(h), status: [...document.querySelectorAll('#pnl-dca [data-dc-status]')].filter(b => b.closest('.dcp-status')).map(h), sorts: [...document.querySelectorAll('#pnl-dca [data-dcproj-sort]')].map(h) }; });
    expect(a.fits, 'Capital’s chip row fits the screen');
    expect(a.chips.length === 3 && a.chips.every(x => x >= 44), `three chips, 44 px or taller (${a.chips.join()})`);
    expect(a.status.length > 0 && a.status.every(x => x >= 44), `the Status chips, 44 px (${a.status.join()})`);
    expect(a.sorts.length >= 3 && a.sorts.every(x => x >= 44), `the sorts, 44 px (${a.sorts.join()})`);
    const wide = () => ev(() => { const l = document.querySelector('#pnl-dca .pnl-list-h'), p = document.getElementById('analysis-panes');
      return { head: !!l && l.scrollWidth <= l.clientWidth, segs: l ? [...l.querySelectorAll('.seg')].every(x => x.scrollWidth <= x.clientWidth) : false, panes: p.scrollWidth <= p.clientWidth, doc: document.documentElement.scrollWidth <= innerWidth }; });
    let w = await wide();
    expect(w.head && w.segs && w.panes && w.doc, `DC timing's list header, its controls and the panel fit (${JSON.stringify(w)})`);
    await ev(() => { PeelLabs.set('funding', true); PeelDcaTab.renderDca(); }); await wait(1500);
    w = await wide();
    expect(w.head && w.segs && w.panes && w.doc, `with the Funding lab's fourth sort too (${JSON.stringify(w)})`);
    await ev(() => { PeelLabs.set('funding', false); PeelDcaTab.renderDca(); }); await wait(1000);
    // A row: its card, nothing wider than the screen (its developments table scrolls inside itself).
    await ev(() => document.querySelector('#pnl-dca [data-dcproj-sort="affected"]').click()); await wait(800);
    await ev(() => document.querySelector('#pnl-dca .pnl-list [data-dcproj-open]').click()); await wait(2500);
    const c = await ev(() => { const b = document.getElementById('scope-body'), csv = b && [...b.querySelectorAll('button')].find(x => x.textContent.trim() === 'CSV: its developments');
      return { card: !!b && /^dcwork:/.test(PeelApp.state.ss || ''), doc: document.documentElement.scrollWidth, vw: innerWidth, csv: csv ? Math.round(csv.getBoundingClientRect().height) : 0 }; });
    expect(c.card && c.doc <= c.vw, `a project's card, no sideways scroll (${c.doc} / ${c.vw})`);
    expect(c.csv >= 44, `CSV: its developments, 44 px (${c.csv})`);
    await ev(() => PeelSvcScope.closeResult()); await wait(800);
    // Capital › EAs with EA to construction open: the fold's summary and rows 44 px, its link inside the panel.
    await ev(() => { PeelAnalysisTabs.openTab('dca', 'eas'); PeelCapitalEA.openEaFlow(); }); await wait(1500);
    const e = await ev(() => { const d = document.querySelector('#pnl-dca #pnl-eaflow'), p = document.getElementById('analysis-panes'), l = d && d.querySelector('[data-ft-go]'), h = el => Math.round(el.getBoundingClientRect().height);
      return d ? { open: d.open, sum: h(d.querySelector('summary')), rows: [...d.querySelectorAll('.eat-row')].map(h), link: l ? Math.round(l.getBoundingClientRect().right) : 0, pr: Math.round(p.getBoundingClientRect().right), panes: p.scrollWidth <= p.clientWidth } : null; });
    expect(e && e.open && e.sum >= 44 && e.rows.length > 0 && e.rows.every(x => x >= 44), `EA to construction's fold: its summary and timeline rows 44 px (${e && `${e.sum}, ${e.rows.slice(0, 4).join()}`})`);
    expect(e && e.panes && e.link <= e.pr, `the fold and its full-table link fit the panel (${JSON.stringify(e && { link: e.link, pr: e.pr, panes: e.panes })})`);
    // The Capital page and the EAs page.
    for (const id of ['projects', 'eaflow']) {
      await ev(id => { PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage(id); }, id); await wait(2500);
      const p = await ev(() => { const hm = document.getElementById('home'); return { home: hm.scrollWidth <= hm.clientWidth, doc: document.documentElement.scrollWidth <= innerWidth, rows: [...document.querySelectorAll('#home .eat-row')].map(el => Math.round(el.getBoundingClientRect().height)) }; });
      expect(p.home && p.doc, `the ${id} page: no sideways scroll (${JSON.stringify({ home: p.home, doc: p.doc })})`);
      if (id === 'eaflow') expect(p.rows.length > 0 && p.rows.every(x => x >= 44), `the EAs page's timeline rows, 44 px (${p.rows.slice(0, 4).join()})`);
    }
  });

  // Navigation phase 4's old links and stored picks (navigation-design §7.1–7.3): what an earlier release stored
  // (the DC projects chip, its sort, the project it had open) and linked to (dcs=dcproj, dcs=funding, the EA to
  // construction chip and page, the DC projects page, a DC project's ss=dcwork:) land on DC timing, EAs and the card.
  await check('kept from before phase 4: a stored DC projects chip opens DC timing at its stored sort, never its stored project; cold dcs=dcproj and dcs=funding links open DC timing (the funding one with its lab and fold); #w=eaflow opens Capital › EAs at EA to construction; the DC projects and EA to construction pages; ss=dcwork: opens the project’s card', browser, { prefs: { footTab4: 'dca', dcSub: 'dcproj', dcProjSort: 'affected', dcProjSel: 'wastewater:26-2242' } }, async ({ page, ev }, expect) => {
    const load = async (url, ready) => { await page.goto(`http://localhost:${PORT}/${url}`); await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); if (ready) await page.waitForSelector(ready, { timeout: 120000 }); await wait(1500); };
    const pr = await ev(() => ({ tab: PeelAnalysisTabs.getFootPref(), sub: PeelAnalysisTabs.getDcSub(), sort: PeelDcProjects.state.sort, sel: PeelDcProjects.state.sel, kept: PeelUtil.store.get('dcSort', null) }));
    expect(pr.tab === 'dca' && pr.sub === 'timing', `the stored DC projects chip: Capital › DC timing (${JSON.stringify(pr)})`);
    expect(pr.sort === 'affected' && pr.kept === null && pr.sel === null, `its stored Most affected is DC timing's sort, its stored project not reopened (${JSON.stringify(pr)})`);
    await ev(() => PeelWorkspaces.setMode('full'));
    await page.waitForSelector('#pnl-dca .pnl-list [data-dcproj-open]', { timeout: 90000 }); await wait(1000);
    const m = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), on: ([...document.querySelectorAll('[data-dcasub].on')].find(b => b.offsetParent) || {}).textContent, sort: ((document.querySelector('#pnl-dca [data-dcproj-sort].on') || {}).textContent || '').trim(), back: !!document.querySelector('#pnl-dca [data-dcproj-back]'), k: document.querySelector('#pnl-dca .pnl-list [data-dcproj-open]').dataset.dcprojOpen }));
    expect(m.tab === 'dca' && m.on === 'DC timing' && m.sort === 'Most affected' && !m.back, `the map opens on the list at Most affected, no project open (${JSON.stringify(m)})`);
    await page.click('#pnl-dca [data-dcproj-sort="soonest"]'); await wait(800);
    expect(await ev(() => PeelUtil.store.get('dcSort', null) === 'soonest' && PeelDcProjects.state.sort === 'soonest'), 'a pick is the one stored sort, dcSort');
    // Old links, opened cold (each with a query of its own: a new load, not a hash change).
    await load('?dcproj#t=dca&dcs=dcproj', '#pnl-dca .pnl-list [data-dcproj-open]');
    const dl = await ev(() => ({ mode: PeelWorkspaces.mode(), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getDcSub(), sort: PeelDcProjects.state.sort, link: PeelShare.viewLink.hash() }));
    expect(dl.mode === 'full' && dl.tab === 'dca' && dl.sub === 'timing' && dl.sort === 'soonest', `t=dca&dcs=dcproj opened cold: Capital › DC timing, at the stored sort (${JSON.stringify({ mode: dl.mode, tab: dl.tab, sub: dl.sub, sort: dl.sort })})`);
    expect(/(^|&)dcs=timing(&|$)/.test(dl.link) && !/dcs=dcproj/.test(dl.link), `the link now says dcs=timing (${dl.link})`);
    const lab = await ev(() => PeelLabs.on('funding'));
    await load('?funding#t=dca&dcs=funding', '#pnl-dca .pnl-list [data-dcproj-open]');
    const fu = await ev(() => ({ sub: PeelAnalysisTabs.getDcSub(), lab: PeelLabs.on('funding'), fold: [...document.querySelectorAll('#pnl-dca details.pnl-fold')].filter(d => /^Funding screen/.test(d.querySelector('summary').textContent)).map(d => d.open), perunit: !!document.querySelector('#pnl-dca [data-dcproj-sort="perunit"]') }));
    expect(fu.sub === 'timing' && fu.lab && fu.fold.length === 1 && fu.fold[0] && fu.perunit, `t=dca&dcs=funding: DC timing, Labs › DC funding on, its Funding screen fold open and the $ a unit sort (${JSON.stringify(fu)})`);
    await ev(w => PeelLabs.set('funding', w), lab);
    // The EA to construction chip: Capital › EAs with its fold open; its page and the Capital page's old ids.
    await load('?chip#w=eaflow', '#pnl-dca #pnl-eaflow[open]');
    const ec = await ev(() => ({ mode: PeelWorkspaces.mode(), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getDcSub(), kept: PeelCapitalEA.eaFlowOpen(), rows: document.querySelectorAll('#pnl-dca #pnl-eaflow .eat-row').length }));
    expect(ec.mode === 'ws' && ec.tab === 'dca' && ec.sub === 'eas' && ec.kept && ec.rows > 0, `#w=eaflow: Capital › EAs, EA to construction open (${JSON.stringify(ec)})`);
    const bar = () => ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), on: ((document.querySelector('#home .page-sec.on') || {}).textContent || '').trim(), lists: [...document.querySelectorAll('#home .pnl-list-h h3')].map(h => h.textContent.trim()) }));
    await load('?page#w=p:eaflow', '#home .eat-row');
    const ep = await bar();
    expect(ep.mode === 'home' && ep.page === 'eaflow' && ep.on === 'EAs' && ep.lists.includes('Current EAs') && ep.lists.includes('Complete, waiting for construction (oldest first)'), `w=p:eaflow: the Capital page's EAs, with EA to construction (${JSON.stringify(ep)})`);
    await load('?projects#w=p:projects', '#home [data-dcproj-open]');
    const cp = await bar();
    expect(cp.mode === 'home' && cp.page === 'projects' && cp.on === 'DC timing', `w=p:projects: the Capital page at DC timing, the list (${JSON.stringify({ mode: cp.mode, page: cp.page, on: cp.on })})`);
    // A DC project's link: its card on the Overview, the developments relying on it by tier once worked out.
    await load(`?work#ss=dcwork:${m.k}`);
    const got = await page.waitForFunction(k => PeelApp.state.ss === `dcwork:${k}` && !!document.querySelector('#scope-body tr.ld-row[data-dev]'), m.k, { timeout: 120000 }).then(() => true, () => false);
    const wk = await ev(() => { const b = document.getElementById('scope-body'); return { mode: PeelWorkspaces.mode(), ss: PeelApp.state.ss, tab: PeelAnalysisTabs.getFootTab(), answer: ((b && b.querySelector('.pnl-answer')) || {}).textContent || '', tiers: [...(b ? b.querySelectorAll('caption') : [])].some(x => /relying on it, by tier/.test(x.textContent)), trail: [...document.querySelectorAll('#trail .tb-step')].map(x => x.textContent.trim()) }; });
    expect(got && wk.mode === 'full' && wk.tab === 'overview' && wk.tiers, `ss=dcwork:${m.k} opened cold: its card, the developments by tier (${JSON.stringify({ mode: wk.mode, ss: wk.ss, tab: wk.tab, tiers: wk.tiers })})`);
    expect(/rel(y|ies) on it/.test(wk.answer) && wk.trail.includes('DC timing'), `its headline names both verdicts, its trail DC timing ("${wk.answer.slice(0, 120)}"; ${wk.trail.join(' › ')})`);
  });

  // Task 8 (navigation-design §6.1, §3.5): the developments relying on a DC project in two clicks on the map,
  // Capital (DC timing is its first view) and a row: the project's card lists every one by tier, and a row of it
  // opens the development; a row of the list in full opens the same card; on the Capital page the project opens
  // in place, five a tier, See all lists the rest there.
  await check('the developments relying on a DC project in two clicks (task 8): Capital, a row; its card lists every one by tier and opens one; the list in full opens the same card; on the Capital page See all lists every one in place', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => !!(PeelApp.state.svcModel && PeelApp.state.dcInfra), null, { timeout: 120000 });
    await ev(() => PeelWorkspaces.setMode('full')); await wait(1500);
    expect(await ev(() => PeelAnalysisTabs.getDcSub() === 'timing'), 'Capital opens on DC timing');
    await page.click('.f-tab[data-tab="dca"]');   // 1. Capital
    await page.waitForSelector('#pnl-dca .pnl-list [data-dcproj-open]', { timeout: 90000 });
    await page.waitForFunction(() => !!PeelDcImpact.current(), null, { timeout: 90000 }); await wait(1500);
    // (the row the reader picks: of those shown, the one with the most developments relying on it)
    const k = await ev(() => { const m = PeelDcImpact.current(); return [...document.querySelectorAll('#pnl-dca .pnl-list [data-dcproj-open]')].map(b => b.dataset.dcprojOpen).sort((a, b) => (m.projects.get(b) || { devs: [] }).devs.length - (m.projects.get(a) || { devs: [] }).devs.length)[0]; });
    await page.click(`#pnl-dca .pnl-list [data-dcproj-open="${k}"]`); await wait(2500);   // 2. the row
    const card = () => ev(k => { const b = document.getElementById('scope-body'), pr = PeelDcImpact.current().projects.get(k), want = new Set(pr.devs.map(x => x.p.key)), rows = b ? [...b.querySelectorAll('tr.ld-row[data-dev]')].map(r => r.dataset.dev) : [];
      return { ss: PeelApp.state.ss || '', tab: PeelAnalysisTabs.getFootTab(), cap: ((b && b.querySelector('caption')) || {}).textContent || '', counted: pr.devs.filter(x => PeelDcImpact.current().gateTiers.includes(x.tier)).length,
        n: rows.length, every: rows.length === want.size && rows.every(x => want.has(x)), tiers: [...new Set(b ? [...b.querySelectorAll('tr.ld-row[data-dev] td:nth-child(2)')].map(td => td.textContent) : [])] }; }, k);
    const c = await card();
    expect(c.ss === `dcwork:${k}` && c.tab === 'overview', `two clicks: Capital, a row; the project's card (${c.ss}, ${c.tab})`);
    expect(c.n > 0 && c.every, `the card lists every development relying on it, the fold's too (${c.n})`);
    expect(new RegExp(`^${c.counted.toLocaleString('en-CA')} developments? relying on it, by tier`).test(c.cap) && c.tiers.every(t => ['Needs it to connect', 'Needs it for capacity', 'On its path, not needed'].includes(t)), `by tier: "${c.cap}" (${c.tiers.join(' · ')})`);
    const dev = await ev(() => document.querySelector('#scope-body tr.ld-row[data-dev]').dataset.dev);
    await page.click(`#scope-body tr.ld-row[data-dev="${dev}"]`); await wait(2000);
    expect(await ev(d => !!(window.DevScope && DevScope.current() && DevScope.current().key === d), dev), `a row of it opens the development (${dev})`);
    await ev(() => { if (DevScope.current()) DevScope.close(); PeelSvcScope.closeResult(); PeelAnalysisTabs.openTab('dca', 'timing'); }); await wait(1500);
    // The list in full: the same project's row opens the same card.
    await ev(() => PeelPanel.openFull()); await wait(2000);
    await page.click(`#dca-dcproj-body tr[data-dcproj-open="${k}"]`); await wait(2500);
    const f = await card();
    expect(f.ss === `dcwork:${k}` && f.tab === 'overview' && f.every, `the list in full: its row opens the same card (${f.ss}, ${f.n} developments)`);
    await ev(() => { if (PeelPanel.closeFull) PeelPanel.closeFull(); PeelSvcScope.closeResult(); }); await wait(1000);
    // The Capital page: the project in place, its tiers five rows each; See all lists the rest there, Show fewer shuts it.
    await ev(() => { PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage('projects'); }); await wait(2500);
    await page.click(`#home [data-dcproj-open="${k}"]`); await wait(2000);
    const tiers = () => ev(() => [...document.querySelectorAll('#home section.page-list')].filter(s => /^(Needs it|On its path)/.test(s.querySelector('h3').textContent)).map(s => ({ t: s.querySelector('h3').textContent, li: s.querySelectorAll('li').length, btn: ((s.querySelector('[data-dcproj-more]') || {}).textContent || '').trim() })));
    const t0 = await tiers(), big = t0.find(x => x.btn);
    expect(t0.length > 0 && t0.every(x => x.li <= 5), `the project in place, its tiers five rows each at most (${t0.map(x => `${x.t}: ${x.li}`).join(' · ')})`);
    if (big) {
      const n = +big.btn.replace(/\D/g, '');
      await page.click('#home [data-dcproj-more]'); await wait(1500);
      const t1 = (await tiers()).find(x => x.t === big.t);
      expect(n > 5 && t1 && t1.li === n && t1.btn === 'Show fewer', `See all: every one of "${big.t}" in place (${t1 && t1.li} / ${n})`);
      await page.click('#home [data-dcproj-more]'); await wait(1000);
      expect(((await tiers()).find(x => x.t === big.t) || {}).li === 5, 'Show fewer: five again');
    }
  });

  await check('QA/QC › Review outlets: open a development, tap the map or pick from the nearby list (existing, local, being built, planned) to set its outlet, save it with its source, back to automatic', browser, {}, async ({ page, ev }, expect) => {
    // Its way in from Records › Data checks (AD-5): the panel's row on the full map opens the page.
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab('records', 'checks'); }); await wait(1500);
    await page.click('#pnl-records .pnl-row[data-ws-page="outlets"]'); await wait(1500);
    const rc = await ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page() }));
    expect(rc.mode === 'home' && rc.page === 'outlets', `Records › Data checks › Review outlets → opens the page (${JSON.stringify(rc)})`);
    await ev(() => { PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage('outlets'); });
    await page.waitForSelector('#home [data-dvo="start"]', { timeout: 120000 }); await wait(800);
    const side = await ev(() => [...document.querySelectorAll('#home .home-side [data-ws-page]')].map(b => b.dataset.wsPage));
    expect(side.includes('outlets'), `Review outlets is in Home's sidebar (${side.join()})`);
    // A site's path to it (AD-5): with the DC impact model worked out (this page built it), a queued
    // development's Summary has "Review →" in its Path to the plant row; it opens the editor at it. A
    // development the queue does not list has none.
    const rk = await ev(() => { const q = PeelDevOutlets.queue(), keys = new Set(q.all.map(x => x.p.key)), plant = p => { const f = PeelSvcData.svcFacts(p); return !!(f && f.pl); };
      const x = q.all.find(r => plant(r.p)), y = PeelApp.state.projects.find(p => !keys.has(p.key) && p.lat != null && plant(p));
      return { inQ: x ? x.p.key : null, outQ: y ? y.key : null, built: !!PeelDcImpact.current() }; });
    expect(rk.built && !!rk.inQ, `the model is worked out and a queued development drains to a plant (${rk.inQ})`);
    if (rk.inQ) {
      await ev(k => { PeelDevNav.showDetail(PeelApp.state.projects.find(p => p.key === k)); }, rk.inQ); await wait(1500);
      await ev(() => PeelWorkspaces.openPage('site')); await wait(2000);
      const btn = await ev(() => { const b = document.querySelector('#home .pnl-row [data-dvo="pick-dev"][data-ws-page="outlets"]'); return b ? { key: b.dataset.dvoKey, row: b.closest('.pnl-row').querySelector('.pnl-r-name').textContent } : null; });
      expect(btn && btn.key === rk.inQ && btn.row === 'Path to the plant', `Review → in the Path to the plant row (${JSON.stringify(btn)})`);
      if (btn) {
        await page.click('#home .pnl-row [data-dvo="pick-dev"]'); await wait(1500);
        const o = await ev(() => ({ page: PeelWorkspaces.page(), sel: (PeelDevOutlets.selected() || { p: {} }).p.key }));
        expect(o.page === 'outlets' && o.sel === rk.inQ, `Review → opens Review outlets at the development (${o.page}, ${o.sel})`);
      }
    }
    if (rk.outQ) {
      await ev(k => { PeelDevNav.showDetail(PeelApp.state.projects.find(p => p.key === k)); }, rk.outQ); await wait(1500);
      await ev(() => PeelWorkspaces.openPage('site')); await wait(2000);
      expect(await ev(() => !document.querySelector('#home [data-dvo="pick-dev"]')), 'no Review → for a development the queue does not list');
    }
    await ev(() => { if (DevScope.current()) DevScope.close(); PeelWorkspaces.openPage('outlets'); });
    await page.waitForSelector('#home [data-dvo="start"]', { timeout: 60000 }); await wait(800);
    // (a development on the existing sewers, so a tap at its site lands on its own sewer)
    await ev(() => { const q = PeelDevOutlets.queue(), G = PeelSewerCap.sewerGrowth(), x = q.rows.find(r => r.p.dr && r.p.dr.length && G.devPipe.get(r.p) != null); PeelDevOutlets.state.sel = x.p.key; PeelWorkspaces.renderPage(true); });
    await wait(800);
    expect(await ev(() => PeelDevOutlets.queue().all.every(x => x.links.length && x.links.every(l => l.sys === 'wastewater'))), 'the queue: developments relying on a DC wastewater project');
    const st = () => ev(() => { const S = PeelDevOutlets.state, sel = PeelDevOutlets.selected(), p = sel && sel.p; return { key: p && p.key, k: p ? PeelSewerCap.sewerGrowth().devPipe.get(p) : null, rec: p ? PeelDevOutlets.recordOf(p) : null, mode: S.mode, cand: S.cand && { kind: S.cand.kind, k: S.cand.k } }; });
    const a = await st();
    expect(!!a.key && a.k != null && !a.rec, `a development open with its automatic outlet (${a.key}, pipe ${a.k})`);
    await page.click('#home [data-dvo="start"]'); await wait(500);
    expect(await ev(() => !!document.querySelector('#home [data-dvo-map].picking')), 'the map is in pick mode');
    // a real tap where the site's connector meets its sewer: it snaps to that sewer (the tap reaches the ground)
    const at = await ev(() => { const c = document.querySelector('#home [data-dvo-map] .hm-dvo-conn'), svg = c.ownerSVGElement, q = c.getPointAtLength(c.getTotalLength()), pt = svg.createSVGPoint(); pt.x = q.x; pt.y = q.y; const s = pt.matrixTransform(c.getScreenCTM()); return [s.x, s.y]; });
    await page.mouse.click(at[0], at[1]); await wait(800);
    const b = await st();
    expect(b.mode === 'preview' && b.cand && b.cand.kind === 'sewer' && b.cand.k === a.k, `the tap picks its own sewer (${JSON.stringify(b.cand)})`);
    expect(await ev(() => /Preview/.test(document.querySelector('#home .dvo-panel').textContent)), 'a preview before saving');
    // the nearby list: each sewer run and planned main once, nearest first, its own sewer marked; pick from it
    const nb = await ev(() => [...document.querySelectorAll('#home .dvo-near-b')].map(b => ({ t: b.textContent, on: b.classList.contains('on'), bad: b.classList.contains('fit-bad'), m: +b.querySelector('.dvo-near-m').textContent.replace(/[^0-9]/g, '') })));
    expect(nb.length >= 2 && nb.every((x, i) => !i || (x.bad === nb[i - 1].bad ? x.m >= nb[i - 1].m : x.bad)), `a nearby list: those that fit first, then nearest first (${nb.map(x => `${x.m}${x.bad ? '✕' : ''}`).join(', ')} m)`);
    // the checks: stage, timing, gravity, drainage area
    const evs = await ev(() => [...document.querySelectorAll('#home .dvo-ev li')].map(li => li.className + ' ' + li.textContent));
    expect(evs.some(x => /stage|permit|Built/i.test(x)) && evs.some(x => /service/.test(x)) && evs.some(x => /Gravity|gravity|pumping/.test(x)), `the checks are shown (${evs.join(' | ')})`);
    expect(await ev(() => !!document.querySelector('#home [data-dvo="filter:misfit"]')), 'a queue filter for outlets that don’t fit their stage');
    expect(nb.some(x => /its outlet now/.test(x.t) && x.on), 'its own sewer is on the list, marked, and picked');
    expect(await ev(() => document.querySelectorAll('#home [data-dvo-map] .hm-dvo-near').length) >= 1, 'numbered on the map');
    const other = nb.findIndex(x => !/its outlet now/.test(x.t));
    await page.click(`#home .dvo-near-b[data-dvo="near:${other}"]`); await wait(800);
    const b2 = await st();
    expect(b2.mode === 'preview' && !(b2.cand.kind === 'sewer' && b2.cand.k === a.k), `another from the list previews it instead (${JSON.stringify(b2.cand)})`);
    const own = await ev(() => [...document.querySelectorAll('#home .dvo-near-b')].findIndex(b => /its outlet now/.test(b.textContent)));
    await page.click(`#home .dvo-near-b[data-dvo="near:${own}"]`); await wait(800);
    expect((await st()).cand.k === a.k, 'and back to its own sewer from the list');
    await page.fill('#home [data-dvo-src]', 'browser path'); await page.click('#home [data-dvo="save"]'); await wait(1500);
    const c = await st();
    expect(c.rec && c.rec.mode === 'set' && c.rec.src === 'browser path' && c.k === a.k, `saved, with its source, and the load model uses it (pipe ${c.k})`);
    expect(await ev(() => /Set by hand/.test(document.querySelector('#home .dvo-panel').textContent) && !!document.querySelector('#home [data-dvo="export"]')), 'the panel says set by hand, with Export');
    await page.click('#home .dvo-panel [data-dvo="auto"]'); await wait(1500);
    const d = await st();
    expect(!d.rec && d.k === a.k, 'Automatic drops it');
    // a local sewer (under 300 mm, data/sewers-local.json; one made up here, beside the site): listed, picked,
    // saved; the load model follows the trunk it drains to
    await ev(k => { const p = PeelDevOutlets.selected().p, d = 0.0004, sc = 1e5; PeelSewerCap.setLocalSewers({ scale: sc, pipes: [[200, 2011, null, null, k, [Math.round((p.lng - d) * sc), Math.round((p.lat + d / 2) * sc), Math.round((p.lng + d) * sc), Math.round((p.lat + d / 2) * sc)]]] }); PeelWorkspaces.renderPage(true); }, a.k);
    await wait(500); await page.click('#home [data-dvo="start"]'); await wait(800);
    const li = await ev(() => [...document.querySelectorAll('#home .dvo-near-b')].findIndex(b => /200 mm local sanitary sewer/.test(b.textContent)));
    expect(li >= 0, 'the local sewer is on the nearby list');
    await page.click(`#home .dvo-near-b[data-dvo="near:${li}"]`); await wait(800);
    await page.click('#home [data-dvo="save"]'); await wait(1500);
    const lr = await ev(() => { const p = PeelDevOutlets.selected().p, r = PeelDevOutlets.recordOf(p); return { kind: r && r.kind, mm: r && r.mm, k: PeelSewerCap.sewerGrowth().devPipe.get(p), text: document.querySelector('#home .dvo-panel').textContent }; });
    expect(lr.kind === 'local' && lr.mm === 200 && lr.k === a.k, `saved as a local sewer; the load model follows its trunk (${JSON.stringify({ kind: lr.kind, k: lr.k })})`);
    expect(/local sanitary sewer/.test(lr.text), 'the panel names the local sewer');
    await page.click('#home .dvo-panel [data-dvo="auto"]'); await wait(1000);
    // what the development's FSR says (data/fsr-outlets.json): quoted with its page, checked against the outlet,
    // and 'Find the FSR's outlet nearby' while picking
    const fd = await ev(() => { const DO = PeelDevOutlets, x = DO.queue().all.find(r => DO.fsrOutletOf(r.p)); if (!x) return null; DO.state.sel = x.p.key; DO.state.mode = 'idle'; DO.state.cand = null; PeelWorkspaces.renderPage(true); return x.p.key; });
    expect(!!fd, 'a development in the queue with its FSR read');
    if (fd) {
      await wait(800);
      const fb = await ev(() => { const q = document.querySelector('#home .dvo-fsr'); return q && { text: q.textContent, link: (q.querySelector('a') || {}).href || '' }; });
      expect(fb && /“/.test(fb.text) && /#page=\d+/.test(fb.link), `the FSR's own words, with its page linked (${fb && fb.link})`);
      expect(await ev(() => [...document.querySelectorAll('#home .dvo-ev li')].some(li => /FSR/.test(li.textContent))), 'an FSR check on the outlet');
      expect(await ev(() => /^FSR/.test((document.querySelector('#home [data-dvo-src]') || {}).value || '')), 'the source prefilled with the FSR and page');
      await page.click('#home [data-dvo="start"]'); await wait(800);
      expect(!!(await page.$('#home [data-dvo="fsr-pick"]')), 'Find the FSR’s outlet nearby, while picking');
      await page.click('#home [data-dvo="cancel"]'); await wait(500);
    }
    // a sewer being built (a capital project) near a development: on the list, picked, saved, followed by the models
    const capDev = await ev(() => { const DO = PeelDevOutlets, x = DO.queue().all.find(r => DO.nearby(r.p).some(c => c.kind === 'cap')); if (!x) return null; DO.state.sel = x.p.key; PeelWorkspaces.renderPage(true); return x.p.key; });
    expect(!!capDev, 'a development with a sewer being built nearby');
    if (capDev) {
      await wait(800); await page.click('#home [data-dvo="start"]'); await wait(800);
      const ci = await ev(() => [...document.querySelectorAll('#home .dvo-near-b')].findIndex(b => /New sanitary sewer/.test(b.textContent)));
      expect(ci >= 0, 'listed as a new sanitary sewer');
      await page.click(`#home .dvo-near-b[data-dvo="near:${ci}"]`); await wait(800);
      expect(await ev(() => PeelDevOutlets.state.cand && PeelDevOutlets.state.cand.kind === 'cap'), 'previewed as a sewer being built');
      await page.click('#home [data-dvo="save"]'); await wait(1500);
      const cr = await ev(() => { const p = PeelDevOutlets.selected().p, r = PeelDevOutlets.recordOf(p); return { kind: r && r.kind, project: r && r.project, pipe: PeelDevOutlets.pipeFor(p), route: !!PeelDevOutlets.dcRouteFor(p), text: document.querySelector('#home .dvo-panel').textContent }; });
      expect(cr.kind === 'cap' && !!cr.project && cr.pipe != null && cr.route, `saved: the load model and the trace follow it (${JSON.stringify({ kind: cr.kind, project: cr.project, pipe: cr.pipe })})`);
      expect(/being built/.test(cr.text), 'the panel says it is being built');
      await page.click('#home .dvo-panel [data-dvo="auto"]'); await wait(1000);
    }
    await ev(() => localStorage.removeItem('peel-dev:devOutletEdits'));
  });

  await browser.close(); srv.close();
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name} (${(r.ms / 1000).toFixed(1)} s)${r.ok ? '' : `\n       - ${r.fails.join('\n       - ')}`}`);
  const bad = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - bad} of ${results.length} browser paths pass`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
