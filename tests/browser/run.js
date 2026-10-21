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

  // Servicing and Capital: one entry each; the map's other sub-views of the tab are sections of the page,
  // each the map panel's own answer.
  await check('Servicing and Capital: the map\u2019s sub-views are sections of their page, with the map\u2019s answers', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    const side = await ev(() => [...document.querySelectorAll('#home .home-side [data-ws-page]')].map(b => b.dataset.wsPage));
    expect(side.includes('capital') && !side.includes('projects') && !side.includes('eaflow'), `the sidebar: ${side.join()}`);
    const st = 'h => String(h || "").replace(/<[^>]+>/g, "").replace(/\\s+/g, " ").trim()';
    for (const [entry, ws, secs] of [['tight', 'servicing', ['network', 'alloc', 'checks']], ['capital', 'capital', ['projects', 'eas']]]) {
      await page.click(`#home .home-side [data-ws-page="${entry}"]`); await wait(3000);
      const bar = await ev(() => [...document.querySelectorAll('#home .page-sec')].map(b => b.textContent));
      expect(bar.length === 4, `${ws}: its sections ${bar.join()}`);
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

  // Reference and This week (step 5): one Reference entry (Help, How it works, the Glossary, the data
  // sources and checks that were map-only); This week carries the watch list.
  await check('Reference: one entry, the data sources and checks on pages; This week: the watch list', browser, {}, async ({ page, ev }, expect) => {
    const side = await ev(() => [...document.querySelectorAll('#home .home-side [data-ws-page]')].map(b => b.dataset.wsPage));
    expect(side.includes('reference') && !side.some(id => ['help', 'guides', 'glossary'].includes(id)), `the sidebar: ${side.join()}`);
    await page.click('#home .home-side [data-ws-page="reference"]'); await wait(1500);
    const bar = await ev(() => ({ page: PeelWorkspaces.page(), secs: [...document.querySelectorAll('#home .page-sec')].map(b => b.textContent), lit: (document.querySelector('#home .home-ws.on') || {}).dataset }));
    expect(bar.page === 'help' && bar.secs.join() === 'Help,How it works,Glossary,Data sources,Data checks' && bar.lit && bar.lit.wsPage === 'reference', `Reference (${bar.page}: ${bar.secs.join()})`);
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
    expect(await ev(() => /people/.test(document.querySelector('#ledger-body .ldg-table caption').textContent)), 'the people switch');
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

  await browser.close(); srv.close();
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name} (${(r.ms / 1000).toFixed(1)} s)${r.ok ? '' : `\n       - ${r.fails.join('\n       - ')}`}`);
  const bad = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - bad} of ${results.length} browser paths pass`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
