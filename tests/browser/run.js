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

async function open(browser, { w = 1440, h = 900, fresh = false, slowApp = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
  // (js/app.js held back: the data files and the map arrive first, as on a slow connection)
  if (slowApp) await ctx.route(/\/js\/app\.js/, async route => { await wait(slowApp); route.continue(); });
  if (CDN) await ctx.route('https://unpkg.com/**', route => { const m = /unpkg\.com\/([^@]+)@([^/]+)\/(.+)$/.exec(route.request().url()); const f = m && `${CDN}/${m[1]}-${m[2]}/package/${m[3]}`; if (f && fs.existsSync(f)) route.fulfill({ path: f, contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript' }); else route.abort(); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (!fresh) await page.addInitScript(() => { for (const k of ['tourDone', 'homeTourDone', 'mapTourOffered']) localStorage.setItem(`peel-dev:${k}`, 'true'); });
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
    for (const snap of ['peek', 'half']) {
      await ev(s => PeelApp.setAnalysisSnap(s), snap); await wait(800);
      const r = await ev(() => { const b = document.querySelector('#back-bar [data-ws-back]').getBoundingClientRect(), a = document.getElementById('analysis').getBoundingClientRect(), hit = document.elementFromPoint(b.left + 20, b.top + b.height / 2); return { bottom: b.bottom, sheet: a.top, hit: !!(hit && hit.closest('#back-bar')) }; });
      expect(r.bottom <= r.sheet && r.hit, `${snap}: "Back to Home" above the sheet, not under it`);
    }
    await page.click('#back-bar [data-ws-back]'); await wait(1500);
    expect(await ev(() => PeelWorkspaces.mode()) === 'home', 'the tap goes back to Home');
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
      return { plant: !!(f && f.pl), path: path ? path.querySelector('.pnl-r-line').textContent : null, after: names.indexOf('Path to the plant') === names.findIndex(x => /Wastewater/.test(x)) + 1, rel: rel.length ? rel[0].key : null, inf: inf ? inf.querySelector('.pnl-r-line').textContent : '' };
    });
    if (pl.plant) expect(pl.path && pl.path.includes('→') && /outlet: (Automatic|Confirmed|Set by hand)/.test(pl.path) && pl.after, `Summary: Path to the plant under Wastewater ("${pl.path}")`);
    else expect(!pl.path, 'no plant on the path: no path line');
    if (pl.rel) expect(pl.inf.startsWith(`Relies on ${pl.rel} (`), `Infrastructure coming names ${pl.rel} first ("${pl.inf.slice(0, 80)}")`);
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
    const f = await ev(() => {
      const all = PeelApp.state.projects, lc = s => String(s || '').toLowerCase();
      for (const p of all) {
        if (p.lat == null) continue;
        for (const r of p.records || []) {
          const q = lc(r.ref);
          if (r.kind !== 'application' || q.length < 7 || !/\d/.test(q) || lc(p.title).includes(q) || p.records.some(x => lc(x.address).includes(q))) continue;
          if (all.filter(o => o.lat != null && (lc(o.title).includes(q) || o.records.some(x => lc(x.address).includes(q) || lc(x.ref).startsWith(q)))).length === 1) return { key: p.key, title: p.title, ref: r.ref, tree: !!(window.PeelFileTree && PeelFileTree.of(p)) };
        }
      }
      return null;
    });
    expect(!!f, 'a development found by a file number alone');
    if (f) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
      expect(await findPick(page, ev, f.ref, { has: [f.title, f.ref] }), `${f.ref} in the list`);
      const s = await ev(() => ({ page: PeelWorkspaces.page(), key: (DevScope.current() || {}).key, files: !!document.querySelector('#home .page-sec.on[data-ws-sec="files"]') }));
      expect(s.page === 'site' && s.key === f.key && s.files, `its page at Files (${s.page}, at Files: ${s.files})`);
      await wait(1000);
      const m = await ev(r => ({ row: !!document.querySelector(`#home .tr-row > div > .tr-ref[data-dev-file="${CSS.escape(r)}"]`), hit: !!document.querySelector('#home .tr-row.tr-hit') }), f.ref);
      if (f.tree && m.row) expect(m.hit, 'the file is marked in the tree');
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
    // A DC project: Capital › DC projects at it, its developments by tier.
    const dc = await ev(() => { const l = PeelApp.state.dcInfra.wastewater.lines.find(x => x.p && x.p.length >= 5); return l ? { p: l.p, key: `wastewater:${l.p}` } : null; });
    expect(!!dc, 'a wastewater DC project');
    if (dc) {
      await ev(() => { if (PeelSvcScope.current()) PeelSvcScope.close(); PeelWorkspaces.openPage('home'); }); await wait(1200);
      expect(await findPick(page, ev, dc.p, { starts: `DC project ${dc.p}`, place: true }), `DC project ${dc.p} in the list`);
      const d = await ev(() => ({ page: PeelWorkspaces.page(), sel: PeelDcProjects.state.sel }));
      expect(d.page === 'projects' && d.sel === dc.key, `Capital at the project (${d.page}, ${d.sel})`);
      const back = await page.waitForSelector('#home [data-dcproj-back]', { timeout: 90000 }).then(() => true, () => false);
      expect(back, 'the project open in DC projects (its developments, a way back)');
      await ev(() => PeelDcProjects.select(null));
    }
    // The full map: a plan pick still sets the map's plan filter.
    if (pl) {
      await ev(() => { PeelWorkspaces.setMode('full'); PeelDataTab.showTab('explore'); }); await wait(1500);
      expect(await findPick(page, ev, pl.name, { label: pl.name, kind: 'secondary plan|character area', place: true }), `${pl.name} in the full map's list`);
      const s = await ev(() => ({ mode: PeelWorkspaces.mode(), sp: PeelApp.state.sp.slice() }));
      expect(s.mode === 'full' && s.sp[0] === pl.area, `the full map filters to the plan (${s.mode}, ${s.sp.join()})`);
      await ev(() => { PeelApp.state.sp = []; PeelApp.applyFilters(); }); await wait(800);
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
    for (const [entry, ws, secs] of [['tight', 'servicing', ['network', 'alloc', 'checks']], ['capital', 'capital', ['dcproj', 'projects', 'eas']]]) {
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
    expect(ea.page === 'eaflow' && ea.on === 'EA to construction' && ea.lit && ea.lit.wsPage === 'capital', `EA to construction is a section of Capital (${ea.page}, ${ea.on})`);
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

  // The pipeline ledger (docs/pipeline-ledger-plan.md, Phase 2): Growth › Ledger adds up to Growth's
  // left to build at Everything, the cut-off buttons and the units / people switch change it, every total
  // carries the disclaimer, a row opens its development.
  await check('Growth › Ledger: Peel equals left to build; cut-offs, people, a row opens the site', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab('growth', 'ledger'); });
    await page.waitForSelector('#ledger-body .ldg-table', { timeout: 30000 }); await wait(1500);
    await page.click('[data-ledger-cut="all"]'); await page.click('[data-ledger-measure="units"]'); await wait(800);
    const num = s => +String(s).replace(/[^\d]/g, '');
    const a = await ev(() => ({ peel: document.querySelector('#ledger-body .ldg-peel td:last-child strong').textContent, left: Math.round(Growth.pipelineTotals(PeelDemandUI.overviewSet()).left), disc: document.querySelector('#ledger-body .ldg-table caption').textContent, check: PeelLedgerUI.model().r.check }));
    expect(num(a.peel) === a.left, `Peel ${a.peel} = Growth's left to build ${a.left}`);
    expect(/Public-data estimate\. Not the Region’s committed capacity ledger\./.test(a.disc), 'the table carries the disclaimer');
    expect(a.check < 1e-6, `every parent equals its children (check ${a.check})`);
    await page.click('[data-ledger-cut="committed"]'); await wait(800);
    const com = await ev(() => +document.querySelector('#ledger-body .ldg-peel td:last-child strong').textContent.replace(/[^\d]/g, ''));
    expect(com > 0 && com < a.left, `committed only: ${com} of ${a.left}`);
    await page.click('[data-ledger-measure="people"]'); await wait(800);
    expect(await ev(() => /^People by/.test(document.querySelector('#ledger-body .ldg-table caption').textContent)), 'the people switch');
    await page.click('[data-ledger-cut="all"]'); await page.click('[data-ledger-measure="units"]'); await wait(800);
    const key = await ev(() => document.querySelector('#ledger-body tr.ldg-row').dataset.pnlDev);
    await page.locator('#ledger-body tr.ldg-row').first().click(); await wait(2500);
    expect(await ev(() => (DevScope.current() || {}).key) === key, `a row opens its development (${key})`);
  });

  await check('phone: Home › What’s coming shows the ledger with no sideways scroll', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.openPage('coming'));
    await page.waitForSelector('#home .ldg-table', { timeout: 30000 }); await wait(1500);
    const s = await ev(() => ({ w: document.documentElement.scrollWidth, vw: innerWidth, disc: document.querySelectorAll('#home .ldg-disc').length, rows: document.querySelectorAll('#home tr.ldg-row').length }));
    expect(s.w <= s.vw, `no sideways scroll (${s.w} > ${s.vw})`);
    expect(s.disc > 0 && s.rows > 0, `the list and the disclaimer (${s.rows} rows)`);
    await page.click('#home [data-ledger-cut="approved"]'); await wait(1000);
    expect(await ev(() => document.querySelector('#home [data-ledger-cut="approved"]').getAttribute('aria-pressed') === 'true'), 'a cut-off button works on the page');
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

  await check('Capital › DC projects: the list, a project and back; the Funding lab inside it; the workspace section and its map', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab('dca', 'dcproj'); });
    await page.waitForSelector('#pnl-dca [data-dcproj-open]', { timeout: 90000 });
    const chips = await ev(() => [...document.querySelectorAll('[data-dcasub]')].filter(b => b.offsetParent).map(b => b.textContent.trim()));
    expect(chips.join('|') === 'DC timing|DC projects|Projects|EAs', `Capital's chips (${chips.join(' · ')})`);
    const a = await ev(() => ({ rows: document.querySelectorAll('#pnl-dca [data-dcproj-open]').length, body: document.querySelectorAll('#dca-dcproj-body tr[data-dcproj-open]').length, fund: !!document.querySelector('#pnl-dca details') && [...document.querySelectorAll('#pnl-dca details summary')].some(s => /Funding/.test(s.textContent)) }));
    expect(a.rows > 0 && a.body > a.rows, `a short list and the full table (${a.rows} / ${a.body})`);
    expect(!a.fund, 'no funding screen while the Funding lab is off');
    await page.click('#pnl-dca [data-dcproj-open]'); await wait(800);
    const p = await ev(() => ({ back: !!document.querySelector('#pnl-dca [data-dcproj-back]'), devs: document.querySelectorAll('#pnl-dca [data-pnl-dev]').length, map: !!document.querySelector('#pnl-dca [data-dcproj-map]') }));
    expect(p.back && p.devs > 0 && p.map, `a project: its developments, Show on the map, a way back (${p.devs} rows)`);
    await page.click('#pnl-dca [data-dcproj-back]'); await wait(500);
    expect(await ev(() => !!document.querySelector('#pnl-dca [data-dcproj-open]')), 'back to the list');
    await ev(() => { PeelLabs.set('funding', true); PeelDcaTab.renderDca(); }); await wait(1500);
    expect(await ev(() => [...document.querySelectorAll('#pnl-dca details summary')].some(s => /Funding screen/.test(s.textContent))), 'the Funding lab adds the funding screen to DC projects');
    await ev(() => { PeelLabs.set('funding', false); PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage('projects'); }); await wait(1500);
    await page.click('[data-ws-wsec="capital:dcproj"]'); await page.waitForSelector('#home [data-dcproj-open]', { timeout: 30000 });
    await page.click('#home [data-dcproj-open]'); await wait(1500);
    const w = await ev(() => ({ back: !!document.querySelector('#home [data-dcproj-back]'), name: (document.querySelector('#home h1') || {}).textContent || '',
      oneP: document.querySelectorAll('#home .home-answer').length === 1 && !!document.querySelector('#home .home-answer .ws-back') && /rel(y|ies) on it|relies on it|No development/.test((document.querySelector('#home .home-answer') || {}).textContent || ''),
      proj: document.querySelectorAll('#home .home-map-svg .hm-dcp').length, dots: document.querySelectorAll('#home .home-map-svg .hm-dcd').length, toFull: !!document.querySelector('#home [data-dcproj-map]') }));
    expect(w.back && /·/.test(w.name), `the workspace section opens a project in place, with its name and a way back ("${w.name.slice(0, 60)}")`);
    expect(w.oneP, 'its answer is one sentence, the way back above it');
    expect(w.proj > 0 && w.dots > 0 && w.toFull, `the side map shows the project and the developments relying on it, and opens the full map (${w.proj} lines, ${w.dots} developments)`);
    await page.click('#home [data-dcproj-back]'); await wait(800);
  });

  await check('QA/QC › Review outlets: open a development, tap the map or pick from the nearby list (existing, local, being built, planned) to set its outlet, save it with its source, back to automatic', browser, {}, async ({ page, ev }, expect) => {
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
