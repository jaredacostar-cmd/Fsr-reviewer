'use strict';
// Browser click-paths, run in CI on every pull request (.github/workflows/browser.yml) and locally:
//   npm run browser            (PLAYWRIGHT: path to the playwright module; CDN_DIR: local copies of the
//                               unpkg packages, for offline runs; CHROMIUM: a browser executable;
//                               SHARD=i/n: every n-th path from the i-th, as CI runs them side by side)
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
const [SHARD, SHARDS] = (process.env.SHARD || '1/1').split('/').map(Number);
if (!(SHARDS >= 1 && SHARD >= 1 && SHARD <= SHARDS)) throw new Error(`SHARD must be i/n with 1 <= i <= n, not ${process.env.SHARD}`);
let nth = 0;

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
  if (nth++ % SHARDS !== SHARD - 1) return;   // (another shard's path)
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
// (in the page: an element shown inside the part of its scrolling box that is on screen, top and bottom)
const IN_VIEW = ([sel, box]) => { const e = [...document.querySelectorAll(sel)].find(x => x.getClientRects().length); const b = document.querySelector(box); if (!e || !b) return { found: !!e }; const r = e.getBoundingClientRect(), c = b.getBoundingClientRect(), top = Math.max(0, c.top), bottom = Math.min(innerHeight, c.bottom); return { found: true, top: Math.round(r.top), box: [Math.round(top), Math.round(bottom)], in: r.top >= top - 1 && r.bottom <= bottom + 1 }; };
// (a page host's view picked as a person does: the strip's tab, then the views row's chip; navigation phase 6)
async function pickView(page, ev, key, tap = false) {
  const [t, s] = key.split(':'), at = () => ev(() => PeelWorkspaces.view());
  const hit = sel => (tap ? page.locator(sel).first().tap() : page.click(sel));
  if ((await at() || '').split(':')[0] !== t) { await hit(`#home .page-tabs [data-pg-tab="${t}"]`); await wait(1200); }
  if (s && await at() !== key) { await hit(`#home .page-subsecs [data-pg-sub="${s}"]`); await wait(1200); }
}

(async () => {
  const srv = await serve(ROOT, PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

  await check('first run: Home opens with the role picker, and the tour leaves nothing open', browser, { fresh: true }, async ({ page, ev }, expect) => {
    expect(await ev(() => PeelWorkspaces.mode()) === 'home', 'opens on Home');
    await page.waitForSelector('.tour-card [data-tour-role]', { timeout: 15000 });
    // (navigation phase 7: one list of six roles, owner decision 6; QA/QC added)
    const rk = await ev(() => [...document.querySelectorAll('.tour-card [data-tour-role]')].map(b => b.dataset.tourRole).join(','));
    expect(rk === await ev(() => PeelWorkspaces.ROLES.map(r => r.key).join(',')) && rk.split(',').length === 6 && rk.includes('qa'), `the tour's six roles (${rk})`);
    await page.click('[data-tour-role="engineer"]');
    for (let i = 0; i < 8 && await page.$('.tour-card'); i++) { await page.click('.tour-card [data-tour-next], .tour-card [data-tour-help]'); await wait(500); }
    expect(!(await page.$('.tour-card')), 'the tour ends');
    expect(await ev(() => !(window.DevScope && DevScope.current())), 'no development left open');
    // Home's menu keeps the role's shortcuts (For your role); one opens a view of Home.
    const sc = await ev(() => ({ got: [...document.querySelectorAll('#home .home-side .home-short')].map(b => b.textContent.trim()).join('|'), want: PeelWorkspaces.ROLES.find(r => r.key === 'engineer').links.map(l => l.label).join('|') }));
    expect(sc.got === sc.want, `For your role: the engineer's three (${sc.got})`);
    await page.locator('#home .home-side .home-short', { hasText: 'Servicing › Network' }).first().click(); await wait(2000);
    // (Servicing says loading until the servicing data lands, the pick held: 6a-S2b)
    await page.waitForFunction(() => PeelAnalysisTabs.tabReady('svc') && PeelWorkspaces.view() === 'svc:network', null, { timeout: 60000 }).catch(() => {});
    const at = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view() }));
    expect(at.page === 'home' && at.view === 'svc:network', `the Servicing › Network shortcut: Home at its view (${JSON.stringify(at)})`);
  });

  await check('a slow start: js/app.js arriving after the data and the map throws nothing', browser, { slowApp: 3000 }, async ({ ev }, expect) => {
    expect(await ev(() => document.querySelectorAll('.leaflet-marker-icon, .leaflet-interactive').length > 0), 'the map draws');
  });

  await check('Check a site: search, pick, the stage chip opens how the stage was set', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.openPage('site')); await wait(1500);
    // (navigation phase 7: the Find step lists both Find steps' files, Recently active, Large files under review and
    // Files with an FSR posted; Review an FSR's own step links back to Find. 6c: no views bar)
    const fl = await ev(() => ({ page: PeelWorkspaces.page(), eyebrow: (document.querySelector('#home .page-eyebrow') || {}).textContent || '', lists: [...document.querySelectorAll('#home .pnl-list-h h3')].map(h => h.textContent).join('|'), bar: document.querySelectorAll('#home .page-views').length, other: document.querySelectorAll('#home .pnl-stepper [data-ws-page]').length }));
    expect(fl.page === 'site' && /^Find\b/.test(fl.eyebrow) && ['Recently active', 'Large files under review', 'Files with an FSR posted'].every(t => fl.lists.includes(t)) && !fl.bar && !fl.other, `Find: its three lists, eyebrow Find, no step link (${JSON.stringify(fl)})`);
    await ev(() => PeelWorkspaces.openPage('fsr')); await wait(1500);
    await page.click('#home .pnl-stepper [data-ws-page="find"]'); await wait(1500);
    expect(await ev(() => PeelWorkspaces.page()) === 'site', 'Review an FSR’s step line: back to Find');
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

  // (navigation phase 6: Servicing capacity is Home › Servicing › Capacity; a view's Open the map, the map view's
  // ← Page and the full map's back bar keep the tab and view)
  await check('a page link opens the full map with a way back; Open the map and ← Page keep the tab and view', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => !document.querySelector('#ftab-svc[aria-busy]'), null, { timeout: 120000 });
    const at = () => ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), back: ((document.getElementById('back-bar') || {}).textContent || '').trim() }));
    await ev(() => PeelWorkspaces.openPage('tight')); await wait(2500);
    let s = await at();
    expect(s.page === 'home' && s.view === 'svc:capacity', `Servicing capacity: Home at Servicing › Capacity (${JSON.stringify(s)})`);
    const link = page.locator('#home [data-ss]').first();
    if (await link.count()) { await link.click(); await wait(2000); } else await ev(() => PeelWorkspaces.setMode('full'));
    s = await at();
    expect(s.mode === 'full', 'on the full map');
    expect(/Back to Home › Servicing/.test(s.back), `the back bar names the page and its view (${s.back})`);
    await page.locator('#back-bar [data-ws-back]').click(); await wait(1500);
    s = await at();
    expect(s.mode === 'home' && s.page === 'home' && /^svc:/.test(s.view || ''), `back on the page, at Servicing (${JSON.stringify(s)})`);
    // A view picked on the page; its Open the map, the map view's ← Page and the full map's back bar keep it.
    await ev(() => PeelWorkspaces.openPage('tight')); await wait(2000);
    await page.click('#home .page-subsecs [data-pg-sub="network"]'); await wait(2500);
    s = await at(); expect(s.view === 'svc:network', `the Network chip: Home › Servicing › Network (${s.view})`);
    await page.locator('#home .page-foot [data-ws-go][data-ws-keep]', { hasText: 'Open the map' }).first().click(); await wait(2500);
    const m = await ev(() => ({ mode: PeelWorkspaces.mode(), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub() }));
    expect(m.mode === 'ws' && m.tab === 'svc' && m.sub === 'network', `Open the map: the map view at Servicing › Network (${JSON.stringify(m)})`);
    // (navigation phase 6c: the map view's bar is ← Page · the search · Full map; no task chips, no source line on its panel)
    const bar = await ev(() => ({ btns: [...document.querySelectorAll('#ws-bar .ws-fullbtn')].map(b => b.textContent.trim()), rows: document.getElementById('ws-bar').children.length, gone: document.querySelectorAll('#ws-chips, .ws-chip, #analysis .pnl-src').length }));
    expect(bar.btns.join() === '← Page,Full map' && bar.rows === 1 && !bar.gone, `the map view's bar: ← Page, the search, Full map (${JSON.stringify(bar)})`);
    await page.locator('#ws-bar [data-ws-backpage]').click(); await wait(2000);
    s = await at(); expect(s.mode === 'home' && s.page === 'home' && s.view === 'svc:network', `← Page: Home at Servicing › Network (${JSON.stringify(s)})`);
    await page.locator('#home [data-ws-full]').first().click(); await wait(2000);
    s = await at(); expect(s.mode === 'full' && /Back to Home › Servicing › Network/.test(s.back), `the full map; the back bar names the view (${s.back})`);
    await page.locator('#back-bar [data-ws-back]').click(); await wait(1500);
    s = await at(); expect(s.mode === 'home' && s.page === 'home' && s.view === 'svc:network', `back: Home at Servicing › Network (${JSON.stringify(s)})`);
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

  await check('phone: Home\'s menu is ☰ in the top bar, the page actions in reach', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.openPage('tight')); await wait(2500);
    const a = await ev(() => { const r = document.querySelector('#home .page-foot .pnl-acts').getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: innerHeight }; });
    expect(a.bottom <= a.h && a.bottom > a.h - 120, 'the action bar sits at the bottom of the screen');
    // (navigation phase 6: the strip, five 44 px tabs, Servicing on and scrolled into the strip's own box; nothing
    // scrolls sideways)
    const st = await ev(() => { const tabs = [...document.querySelectorAll('#home .page-tabs .page-tab')], box = document.querySelector('#home .page-tabs').getBoundingClientRect(), on = document.querySelector('#home .page-tabs .page-tab.on'), r = on && on.getBoundingClientRect();
      return { n: tabs.length, min: Math.min(...tabs.map(t => Math.round(t.getBoundingClientRect().height))), on: on && on.dataset.pgTab, inBox: !!r && r.left >= box.left - 1 && r.right <= box.right + 1, home: document.getElementById('home').scrollWidth, doc: document.documentElement.scrollWidth }; });
    expect(st.n === 5 && st.min >= 44 && st.on === 'svc' && st.inBox && st.home <= 390 && st.doc <= 390, `the strip: five 44 px tabs, Servicing on and in sight, no sideways scroll (${JSON.stringify(st)})`);
    // (Home › Growth › Pipeline, the map's panel as a view: its "By dwelling type and stage" table, wider than a phone,
    // scrolls inside itself once opened (.dt-wide, js/app.js markWide on #home as on the panes), never the page)
    await page.locator('#home .page-tabs [data-pg-tab="growth"]').tap(); await wait(1500);
    await page.locator('#home .page-subsecs [data-pg-sub="pipeline"]').tap(); await wait(2500);
    await ev(() => { const s = [...document.querySelectorAll('#home details.see-all > summary')].find(x => /By dwelling type and stage/.test(x.textContent)); if (s) s.scrollIntoView({ block: 'center' }); }); await wait(500);
    await page.locator('#home details.see-all > summary', { hasText: 'By dwelling type and stage' }).first().tap(); await wait(1500);
    const pw = await ev(() => { const d = [...document.querySelectorAll('#home details.see-all')].find(x => /By dwelling type and stage/.test(x.querySelector('summary').textContent)), tb = d && d.querySelector('table.dt'), r = tb && tb.getBoundingClientRect();
      return { view: PeelWorkspaces.view(), open: !!d && d.open, wide: !!tb && tb.classList.contains('dt-wide'), right: r ? Math.round(r.right) : null, home: document.getElementById('home').scrollWidth, doc: document.documentElement.scrollWidth }; });
    expect(pw.view === 'growth:pipeline' && pw.open && pw.wide && pw.right <= 390 && pw.home <= 390 && pw.doc <= 390, `Home › Growth › Pipeline with By dwelling type and stage open: the table scrolls in its own box, no sideways scroll (${JSON.stringify(pw)})`);
    // (the top bar: no sideways scroll, the trail's "k filters" one 44 px button with a filter on)
    await ev(() => { PeelApp.state.minUnits = 10; PeelApp.applyFilters(); }); await wait(1500);
    const tb = await ev(() => { const b = document.querySelector('#trail [data-tb-filters]'), r = b && b.getBoundingClientRect(), t = document.getElementById('topbar'); return { btn: !!b && r.width > 0, h: r ? Math.round(r.height) : 0, w: r ? Math.round(r.width) : 0, right: r ? Math.round(r.right) : 0, top: t.scrollWidth, tw: t.clientWidth, doc: document.documentElement.scrollWidth }; });
    expect(tb.btn && tb.h >= 44 && tb.w >= 44 && tb.right <= 390 && tb.top <= tb.tw && tb.doc <= 390, `the top bar: the filters button 44 px and in sight, no sideways scroll (${JSON.stringify(tb)})`);
    // (a place four levels deep, a precinct in its plan, with that filter on: the trail scrolls in its own box to its end,
    // so the place is whole, clear of the button, and a tap on it is the step's)
    const deep = await ev(() => { const A = PeelPlanTables.areas(), a = A.filter(x => x.parent && A.some(y => y.id === x.parent && !y.parent)).sort((x, y) => x.name.length - y.name.length)[0]; if (!a) return null; PeelWsPages.drillTo(`a:${a.id}`); PeelApp.state.minUnits = 10; PeelApp.applyFilters(); return a.name; });
    await wait(2000);
    if (deep) {
      const d = await ev(() => { const steps = [...document.querySelectorAll('#trail .tb-step')], l = steps[steps.length - 1], r = l.getBoundingClientRect(), b = document.querySelector('#trail .tb-fl').getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { n: steps.length, last: l.textContent.trim(), right: Math.round(r.right), btn: Math.round(b.left), whole: l.scrollWidth <= l.clientWidth + 1, hit: hit === l, doc: document.documentElement.scrollWidth }; });
      expect(d.n >= 4 && d.last === deep && d.right <= d.btn && d.whole && d.hit && d.doc <= 390, `a deep place (${deep}): the last step whole and clear of the filters button (${JSON.stringify(d)})`);
    }
    await ev(() => { PeelWsPages.drillTo('peel'); PeelApp.state.minUnits = 0; PeelApp.applyFilters(); }); await wait(800);
    // (navigation phase 7, §3.8: Home's menu is ☰ in the top bar, beside Home; the page's ☰ row is gone, so the
    // page header comes first and a phone has three navigation rows above the answer)
    const nb = await ev(() => { const b = document.getElementById('tb-nav'), r = b && b.getBoundingClientRect(), t = document.getElementById('topbar').getBoundingClientRect(), side = document.querySelector('#home .home-side'), kids = [...document.querySelectorAll('#home .home-grid > *')].filter(x => x.getClientRects().length);
      return { shown: !!r && r.width > 0, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0, right: r ? Math.round(r.right) : 0, inBar: !!r && r.top >= t.top - 1 && r.bottom <= t.bottom + 1, exp: b && b.getAttribute('aria-expanded'), shut: !!side && side.getClientRects().length === 0, first: !!kids[0] && !!kids[0].querySelector('.home-h'), row: document.querySelectorAll('#home .home-menu-btn').length }; });
    expect(nb.shown && nb.w >= 44 && nb.h >= 44 && nb.right <= 390 && nb.inBar && nb.exp === 'false' && nb.shut && nb.first && !nb.row, `☰ in the top bar, 44 px; the menu shut, the page header first (${JSON.stringify(nb)})`);
    await page.locator('#tb-nav').tap(); await wait(800);
    const mo = await ev(() => { const side = document.querySelector('#home .home-side'), vis = sel => [...side.querySelectorAll(sel)].filter(x => x.getClientRects().length);
      return { ids: vis('ul .home-ws[data-ws-page]').map(b => b.dataset.wsPage).join(','), full: vis('.home-full').length, heads: vis('.home-g').length, pick: vis('.home-role').length, exp: document.getElementById('tb-nav').getAttribute('aria-expanded'), top: document.getElementById('home').scrollTop, home: document.getElementById('home').scrollWidth, doc: document.documentElement.scrollWidth }; });
    expect(mo.ids === 'home,week,find,help' && mo.full === 1 && !mo.heads && mo.pick === 1 && mo.exp === 'true' && mo.top === 0 && mo.home <= 390 && mo.doc <= 390, `☰ opens the five entries at the top of the page, no team heading (no role: the pick line), no sideways scroll (${JSON.stringify(mo)})`);
    await page.locator('#home .home-side [data-ws-page="find"]').first().tap(); await wait(1500);
    const fd = await ev(() => ({ page: PeelWorkspaces.page(), dev: !!(window.DevScope && DevScope.current()), shut: document.querySelector('#home .home-side').getClientRects().length === 0, exp: document.getElementById('tb-nav').getAttribute('aria-expanded') }));
    expect(fd.page === 'site' && !fd.dev && fd.shut && fd.exp === 'false', `Find from the menu: the Find step, the menu shut (${JSON.stringify(fd)})`);
  });

  await check('phone: a map view\'s bar and the full map\'s way back sit above the bottom sheet and take a tap', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    // A map view: its bar (← Page, the search, Full map) above the sheet at every height, each a tap (navigation phase
    // 6c: the panels' Full map → went with their source line; the full sheet stops under the bar, js/app.js).
    await ev(() => PeelWorkspaces.go('tight')); await wait(2500);
    for (const snap of ['peek', 'half', 'full']) {
      await ev(s => PeelApp.setAnalysisSnap(s), snap); await wait(800);
      const r = await ev(() => { const a = document.getElementById('analysis').getBoundingClientRect(); return ['[data-ws-backpage]', '[data-ws-full]'].map(q => { const b = document.querySelector(`#ws-bar ${q}`), x = b.getBoundingClientRect(), hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2); return { q, bottom: Math.round(x.bottom), sheet: Math.round(a.top), hit: !!(hit && hit.closest(q) === b) }; }); });
      expect(r.every(x => x.hit && x.bottom <= x.sheet), `${snap}: the map view's ← Page and Full map above the sheet, not under it (${JSON.stringify(r)})`);
    }
    await page.locator('#ws-bar [data-ws-full]').tap(); await wait(1500);
    expect(await ev(() => PeelWorkspaces.mode()) === 'full', 'its Full map takes the tap at a full sheet');
    await ev(() => PeelApp.setAnalysisSnap('peek')); await ev(() => PeelWorkspaces.openPage('home')); await wait(1500);
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
    await page.locator('#home .home-h [data-inquiry]').tap(); await wait(2500);   // (the site's header, navigation phase 5)
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

  // M3 (navigation phase 5): a development reads the same on every tab of the full map and on its page, for a
  // sample: the largest approved tree of files, one with demolitions, one of permits only, one of jobs only, one
  // in Caledon, one outside the mapped pressure zones. (The count note is read from the Overview's At a glance;
  // the related applications from Records' panel list and its full table, #devtab-related, against
  // PeelDevNav.relatedProjects: navigation phase 5.)
  await check('a development’s page and the full map agree: units, people or jobs, the flows, the constraints, the files, the stage', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && PeelApp.state.dcInfra, null, { timeout: 120000 });
    const sample = await ev(() => {
      const ps = PeelApp.state.projects, FT = PeelFileTree, files = p => p.records.some(r => r.kind === 'application'), tree = p => !!FT.of(p) && p.count && p.count.mode === 'tree';
      const jobs = p => PeelDemand.estimate([p], PeelApp.state.criteria, 'all', PeelApp.jobsOf).employment.jobs, one = f => (ps.find(f) || {}).key || null;
      const big = ps.filter(p => p.phase === 'approved' && tree(p) && FT.summary(FT.of(p)).files > 1).sort((a, b) => b.units - a.units)[0];
      return [['the largest approved tree of files', big ? big.key : null], ['with demolitions', one(p => p.unitsLost > 0 && p.units > 0 && tree(p))], ['permits only', one(p => p.units > 0 && p.records.length && !files(p))],
        ['jobs only', one(p => !(p.units > 0) && files(p) && jobs(p) > 0)], ['in Caledon', one(p => p.municipality === 'Caledon' && p.units > 0 && tree(p))], ['outside the mapped zones', one(p => p.units > 0 && p.pzNear && (PeelSvcData.svcFacts(p) || {}).zNear)]];
    });
    for (const [what, key] of sample) {
      if (!key) { expect(true, `${what}: none in today's data`); continue; }
      const at = `${what} (${key})`;
      await ev(k => { PeelWorkspaces.setMode('full'); PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); }, key); await wait(2000);
      for (const ts of [['overview'], ['growth', 'pipeline'], ['svc', 'network'], ['dca', 'timing'], ['records', 'files']]) { await ev(([t, s]) => { PeelAnalysisTabs.openTab(t, s); }, ts); await wait(1000); }
      const r = await ev(k => {
        const p = PeelDevNav.projectByKey(k), strip = h => String(h == null ? '' : h).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const spec = id => { const e = PeelPanel.get(id); return e && e.scope === `dev:${k}` ? e.spec : null; };
        const V = PeelSections.VIEWS.site, ov = spec('overview:'), gr = spec('growth:pipeline'), net = spec('svc:network'), cap = PeelSections.specFor(V['dca:timing'], p), rec = PeelSections.specFor(V['records:files'], p);
        const fig = (s, re) => { const f = ((s && s.figures) || []).find(x => x && re.test(`${x.u} ${x.label}`)); return f ? strip(f.v) : null; };
        const site = new Set((PeelTreeGroups.siteParts ? PeelTreeGroups.siteParts(p, PeelApp.state.projects.all || PeelApp.state.projects) : []).map(q => q.key));
        delete p._rel;   // (the list's cache on the project: dev-nav's, the one copy since S13, worked out again)
        const note = 'Counted from its permits';
        return { units: Math.round(p.units || 0).toLocaleString('en-CA'), jobsOnly: !(p.units > 0), permitsOnly: !p.records.some(x => x.kind === 'application'),
          ov: fig(ov, /^units planned/), ovJobs: fig(ov, /^jobs /), gr: fig(gr, /^units planned/), rec: fig(rec, /^homes counted once/),
          trail: ((document.querySelector('#trail .tb-count') || {}).textContent || '').replace(/[^\d,]/g, ''), steps: [...document.querySelectorAll('#trail .tb-step')].map(b => b.textContent.trim()), placed: !!PeelPlanTables.placeOf(p), muni: p.municipality, title: p.title,
          ovW: fig(ov, /water, maximum day/), netW: fig(net, /water, maximum day/), ovWW: fig(ov, /wastewater, peak wet/), netWW: fig(net, /wastewater, peak wet/),
          cap: fig(cap, /constraints it relies on/), needs: String((PeelMasterPlan.devNeeds(p) || []).length),
          stages: [ov, gr, net, cap, rec].map(s => (s && s.head && s.head.status ? s.head.status.text : null)),
          noteFn: PeelTreeCounts.noteHTML(p).includes(note), noteShown: ((ov && ov.lists) || []).some(l => l.title === 'At a glance' && l.rows.some(x => String(x.html).includes(note))),
          rel: PeelDevNav.relatedProjects(p).filter(x => !site.has(x.q.key)).slice(0, 12).map(x => x.q.key), shown: [...document.querySelectorAll('#records-body #devtab-related [data-dt-relq]')].map(b => b.dataset.dtRelq),
          panelRel: ((((rec && rec.lists) || []).find(l => l.title === 'Related applications') || {}).rows || []).map(x => x.attrs['data-pnl-dev']) };
      }, key);
      if (r.jobsOnly) expect(r.ovJobs && r.gr === '0' && r.trail === '0', `${at}: jobs on the Overview (${r.ovJobs}), no homes on Growth (${r.gr}) or the trail (${r.trail})`);
      else expect(r.ov === r.units && r.gr === r.units && r.trail === r.units, `${at}: ${r.units} units; the Overview ${r.ov}, Growth ${r.gr}, the trail ${r.trail}`);
      if (r.rec != null) expect(r.rec === r.units, `${at}: Records counts ${r.rec} homes once, the development ${r.units}`);
      // (where it sits, on the top bar's trail: Peel › its municipality › its plan … › the site; navigation phase 6b)
      expect(r.steps[0] === 'Peel' && r.steps[1] === r.muni && r.steps.at(-1) === r.title && (r.placed ? r.steps.length >= 4 : r.steps.length === 3), `${at}: the trail ${r.steps.join(' › ')} (in a plan: ${r.placed})`);
      expect(r.netW != null && r.ovW === r.netW && r.ovWW === r.netWW, `${at}: flows ${r.ovW} / ${r.ovWW} L/s on the Overview, ${r.netW} / ${r.netWW} on Servicing › Network`);
      expect(r.cap === r.needs, `${at}: Capital relies on ${r.cap} constraints, devNeeds ${r.needs}`);
      expect(r.stages.every(x => x && x === r.stages[0]), `${at}: one stage on every tab (${r.stages.join(' | ')})`);
      if (r.permitsOnly) expect(r.noteFn && r.noteShown, `${at}: “Counted from its permits” (the note ${r.noteFn}, shown ${r.noteShown})`);
      expect(r.shown.join() === r.rel.join() && r.panelRel.join() === r.rel.slice(0, 5).join(), `${at}: related applications ${r.panelRel.length} in Records' panel, ${r.shown.length} in its full table, ${r.rel.length} by PeelDevNav`);
      // Its page (navigation phase 6b, the host at a development): each view's figures are its map tab's, picked on
      // the page's strip (the map's five tabs) and Servicing's views.
      await ev(() => { PeelWorkspaces.openPage('site'); }); await wait(2000);
      const tabs = await ev(() => [...document.querySelectorAll('#home .page-tabs [data-pg-tab]')].map(b => b.dataset.pgTab));
      expect(tabs.join() === 'overview,growth,svc,dca,records', `${at}: the page's tabs (${tabs.join()})`);
      for (const key of await ev(() => Object.keys(PeelSections.VIEWS.site))) {
        await pickView(page, ev, key);
        const f = await ev(k => {
          const p = DevScope.current(), s = PeelSections.specFor(PeelSections.VIEWS.site[k], p), strip = h => String(h == null ? '' : h).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          // (as js/panel.js draws them: no n/a or – figure, four at most)
          const map = ((s && s.figures) || []).filter(x => x && !/^(n\/a|–|-)$/i.test(String(x.v))).slice(0, 4).map(x => strip(x.v));
          return { view: PeelWorkspaces.view(), page: [...document.querySelectorAll('#home .pnl-figs[data-psec="figures"] .pnl-fig > b')].map(b => strip(b.innerHTML)), map };
        }, key);
        expect(f.view === key && f.page.join(' | ') === f.map.join(' | '), `${at}, page view ${key} (${f.view}): ${f.page.join(' | ')} / the map's ${f.map.join(' | ')}`);
      }
    }
  });

  // A site's tabs: Check a site shows every map tab's panel for the development (Overview, Growth, Servicing ›
  // Network and FSR review, Capital, Records), each the map's own answer, picked on the page's strip and Servicing's
  // views (navigation phase 6b: the site's page is the page host at a development).
  await check('Check a site: every map tab is a tab of the page, with the map’s own answer', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    await ev(() => { const p = PeelApp.state.projects.find(q => q.phase === 'approved' && q.units > 300); PeelDevNav.showDetail(p); });
    await wait(2500);
    await ev(() => PeelWorkspaces.openPage('site')); await wait(2000);
    const tabs = await ev(() => [...document.querySelectorAll('#home .page-tabs .page-sec')].map(b => b.childNodes[0].textContent.trim()));
    expect(tabs.join() === 'Overview,Growth,Servicing,Capital,Records', `the tabs: ${tabs.join()}`);
    for (const key of await ev(() => Object.keys(PeelSections.VIEWS.site))) {
      await pickView(page, ev, key); await wait(1300);
      const r = await ev(k => {
        const p = DevScope.current(), s = PeelSections.specFor(PeelSections.VIEWS.site[k], p);
        const ans = document.querySelector('#home .home-answer'), strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const on = sel => ((document.querySelector(sel) || {}).dataset || {});
        return { view: PeelWorkspaces.view(), page: PeelWorkspaces.page(), on: on('#home .page-tabs .page-sec.on').pgTab || null, chip: on('#home .page-subsecs .page-sec.on').pgSub || null, text: strip(ans && ans.innerHTML), map: strip(s && s.answer) };
      }, key);
      const [t, sb] = key.split(':');
      expect(r.page === 'site' && r.view === key && r.on === t && (t === 'svc' ? r.chip === sb : !r.chip), `${key}: the strip shows ${r.on}${r.chip ? ` › ${r.chip}` : ''} (${r.page} at ${r.view})`);
      expect(r.map && r.text === r.map, `${key}: the page's answer is the map panel's ("${r.text.slice(0, 60)}" / "${String(r.map).slice(0, 60)}")`);
    }
    // Overview: the path line under Wastewater (a development on the mapped catchments: its plant), and the
    // DC projects it relies on named in Infrastructure coming.
    await page.click('#home .page-tabs [data-pg-tab="overview"]'); await wait(2500);
    const pl = await ev(() => {
      const p = DevScope.current(), f = PeelSvcData.svcFacts(p), rel = PeelDevVerdict.reliedOn(PeelMasterPlan.devNeeds(p) || []);
      const row = n => [...document.querySelectorAll('#home .pnl-row')].find(r => ((r.querySelector('.pnl-r-name') || {}).textContent || '').includes(n));
      const path = row('Path to the plant'), inf = row('Infrastructure coming'), names = [...document.querySelectorAll('#home .pnl-row .pnl-r-name')].map(x => x.textContent);
      return { plant: !!(f && f.pl), path: path ? path.querySelector('.pnl-r-line').textContent : null, after: names.indexOf('Path to the plant') === names.findIndex(x => /Wastewater/.test(x)) + 1, rel: rel.length ? rel[0] : null, late: rel.some(x => x.late), inf: inf ? inf.querySelector('.pnl-r-line').textContent : '', chip: inf ? (inf.querySelector('.pnl-r-top > :last-child') || {}).textContent : '' };
    });
    if (pl.plant) expect(pl.path && pl.path.includes('→') && /outlet: (Automatic|Confirmed|Set by hand)/.test(pl.path) && pl.after, `Overview: Path to the plant under Wastewater ("${pl.path}")`);
    else expect(!pl.path, 'no plant on the path: no path line');
    // (by number and name, as the search lists a DC project; one late: the row is something to check)
    if (pl.rel) expect(pl.inf.startsWith(`Relies on ${pl.rel.key}${pl.rel.name ? ` – ${pl.rel.name}` : ''} (`), `Infrastructure coming names ${pl.rel.key} ${pl.rel.name || ''} first ("${pl.inf.slice(0, 100)}")`);
    if (pl.late) expect(pl.chip !== 'OK', `a late DC project: Infrastructure coming is not OK (${pl.chip})`);
  });

  // Navigation phase 5, one development layout: a development's tabs on the full map. The Overview: At a glance,
  // the About and Approvals timeline folds, no #ov-dev, Open full table widening the same panel; Records, one view
  // (the files and events, related applications; its full table draws the files with the panel's tree, each file
  // with the link that put it there and "on its own", and ← Whole development back); Servicing › Network: the
  // path to the outlet and the plant, the four flows, the Water fold (fire flow looked up on opening) and the Site
  // fold; Capital, one view (no chip row: the EAs near it, Show EAs on the map, and the DCs it would pay in its
  // panel; the site's EA table in its full table). Then its page; then a development with no units or jobs,
  // whose Site checks are still Network's.
  await check('a development’s tabs: Overview’s At a glance, About and timeline; Records one view; Network’s flows, water and Site; Capital one view', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && PeelApp.state.dcInfra, null, { timeout: 120000 });
    // (an approved development of 300+ units, a tree of files when there is one: its files open on their own)
    const key = await ev(() => { const FT = PeelFileTree, ps = PeelApp.state.projects.filter(q => q.phase === 'approved' && q.units > 300); return (ps.find(q => FT.of(q) && FT.summary(FT.of(q)).files > 1) || ps[0]).key; });
    const panel = sel => ev(sl => {
      const h = document.querySelector(sl); if (!h) return null;
      const list = t => [...h.querySelectorAll('section.pnl-list')].find(l => ((l.querySelector('h3') || {}).textContent || '').trim() === t);
      return { lists: [...h.querySelectorAll('.pnl-list-h h3')].map(x => x.textContent.trim()), folds: [...h.querySelectorAll('details.pnl-fold[data-sec="fold"]')].map(d => ({ id: d.id, t: d.querySelector('summary').textContent.trim(), open: d.open })),
        flows: list('Flows') ? list('Flows').querySelectorAll('li.pnl-row').length : 0, shown: h.getClientRects().length > 0 };
    }, sel);
    const subtabsShown = t => ev(tb => { const r = document.querySelector(`#analysis .f-subtabs[data-pane="${tb}"]`); return !!r && !r.hidden && r.getClientRects().length > 0; }, t);
    await ev(k => { PeelWorkspaces.setMode('full'); PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); }, key); await wait(2500);
    // 1. The Overview.
    await ev(() => { PeelAnalysisTabs.openTab('overview'); }); await wait(1200);
    const ov = await panel('#pnl-overview'), ft = ov.folds.map(f => f.t);
    expect(ov.lists.includes('At a glance'), `${key}: the Overview lists At a glance (${ov.lists.join(' | ')})`);
    expect(ft.includes('About') && ft.includes('Approvals timeline') && ft.indexOf('About') < ft.indexOf('Approvals timeline') && ov.folds.find(f => f.t === 'About').open, `the Overview folds About (open), then Approvals timeline (${ft.join(' | ')})`);
    expect(await ev(() => !document.getElementById('ov-dev') && !(document.getElementById('ov-body') || {}).innerHTML), 'no #ov-dev, nothing under the panel');
    await ev(() => { PeelPanel.openFull(); }); await wait(1200);
    expect(await ev(() => !!document.querySelector('#analysis.ft-on.ft-pnl') && document.getElementById('pnl-overview').getClientRects().length > 0), 'Open full table widens the Overview panel itself');
    await ev(() => { PeelPanel.closeFull(); }); await wait(600);
    // The header's "files · history ›": Records, the files and events in view.
    await page.click('#pnl-overview [data-dev-hist]'); await wait(1500);
    expect(await ev(() => PeelAnalysisTabs.getFootTab() === 'records' && [...document.querySelectorAll('.dev-hist')].some(d => { const r = d.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight && r.bottom > 0; })), 'files · history › opens Records with the files and events in view');
    // 2. Records: one view; its full table.
    await ev(() => { PeelAnalysisTabs.openTab('records'); }); await wait(1500);
    const rec = await panel('#pnl-records'), recRel = await ev(k => { const p = PeelDevNav.projectByKey(k), site = new Set((PeelTreeGroups.siteParts ? PeelTreeGroups.siteParts(p, PeelApp.state.projects.all || PeelApp.state.projects) : []).map(q => q.key)); return PeelDevNav.relatedProjects(p).filter(x => !site.has(x.q.key)).length; }, key);
    expect(!(await subtabsShown('records')), 'Records has no chip row at a development');
    expect(await ev(() => !!document.querySelector('#pnl-records #pnl-hist .dev-hist')), 'Records\' panel folds the files and events');
    expect(rec.lists.includes('Related applications') === recRel > 0, `related applications listed when there are some (${recRel}; ${rec.lists.join(' | ')})`);
    await ev(() => { PeelPanel.openFull(); }); await wait(1500);
    const rf = await ev(() => ({ hist: !!document.querySelector('#records-body .dev-hist'), brief: !!document.querySelector('#records-body [data-info="dev-brief"]'), own: [...document.querySelectorAll('#records-body .tr .tr-own[data-dt-sub]')].map(b => b.dataset.dtSub), shown: [...document.querySelectorAll('#records-body .tr .tr-own[data-dt-sub]')].filter(b => b.checkVisibility()).map(b => b.dataset.dtSub), tree: (d => !!d && PeelFileTree.summary(d).files > 1)(PeelFileTree.of(DevScope.current())) }));
    expect(rf.hist && !rf.brief, `Records' full table: the files and events, no About (${JSON.stringify({ hist: rf.hist, brief: rf.brief })})`);
    if (rf.tree) {
      expect(rf.own.length > 1, `the full table's files are the tree, each "on its own" (${rf.own.length})`);
      // (each file the tree linked says how: its rule, the link's confidence and overlap; the panel's tree stays compact)
      const ln = await ev(() => ({ full: [...document.querySelectorAll('#records-body .tr .tr-link')].map(x => x.textContent), linked: PeelFileTree.build(PeelFileTree.of(DevScope.current())).all.filter(n => n.parent >= 0 || n.rule >= 0).length, panel: document.querySelectorAll('#pnl-records .tr-link').length }));
      expect((ln.full.length > 0) === (ln.linked > 0) && ln.full.every(t => /confidence|% inside/.test(t)) && !ln.panel, `the full table's files say the link that put them there (${ln.full.length} of ${ln.linked}: ${ln.full.slice(0, 2).join(' | ')})`);
      // (one in view: the earlier files on the same land are folded, and a closed fold's content keeps its boxes,
      // so getClientRects alone counts them: checkVisibility does not)
      const ref = rf.shown[rf.shown.length - 1];
      await page.click(`#records-body .tr .tr-own[data-dt-sub="${ref}"]`); await wait(2000);
      await ev(() => { PeelPanel.closeFull(); PeelAnalysisTabs.openTab('overview'); }); await wait(1500);
      const sub = await ev(() => ({ title: (DevScope.current() || {}).title || '', head: ((document.querySelector('#pnl-overview #pnl-about .sub-head') || {}).textContent || '').trim() }));
      expect(sub.title.startsWith(`${ref} · `) && sub.head.includes(`${ref} on its own`), `"on its own" makes ${ref} the scope, its About saying so ("${sub.title}"; "${sub.head.slice(0, 60)}")`);
      // ← Whole development in Records' full table: the whole development is the scope again.
      await ev(() => { PeelAnalysisTabs.openTab('records'); PeelPanel.openFull(); }); await wait(1500);
      await page.click('#records-body [data-dt-back]'); await wait(2000);
      const bk = await ev(() => (DevScope.current() || {}).key);
      expect(bk === key, `← Whole development: back to ${key} (${bk})`);
      await ev(() => { PeelPanel.closeFull(); }); await wait(500);
      if (bk !== key) { await ev(k => { PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); }, key); await wait(2000); }
    } else await ev(() => { PeelPanel.closeFull(); });
    // 3. Servicing › Network: the four flows, Water (fire flow on opening), Site, the allocation.
    await ev(() => { PeelAnalysisTabs.openTab('svc', 'network'); }); await wait(1500);
    const net = await panel('#pnl-svc'), nf = net.folds.map(f => f.id);
    expect(net.flows === 4, `Network lists the four flows (${net.flows}; ${net.lists.join(' | ')})`);
    expect(['pnl-water', 'pnl-site', 'pnl-alloc'].every(id => nf.includes(id)), `Network folds Water, Site and the allocation (${nf.join(' | ')})`);
    const pth = await ev(() => { const l = [...document.querySelectorAll('#pnl-svc section.pnl-list')].find(x => ((x.querySelector('h3') || {}).textContent || '').trim() === 'The path'); return l ? [...l.querySelectorAll('.pnl-kv > span:first-child')].map(x => x.textContent.trim()) : []; });
    expect(pth.includes('Discharges to') && pth.indexOf('Discharges to') === pth.length - 2, `the path: discharges to the outlet, then the plant (${pth.join(' · ')})`);
    await page.click('#pnl-svc #pnl-water > summary');
    const fire = await page.waitForFunction(() => { const b = document.querySelector('#pnl-svc #dev-fire'); return b && !/Looking up/.test(b.textContent) ? b.textContent.trim() : false; }, null, { timeout: 20000 }).then(h => h.jsonValue()).catch(() => null);
    expect(!!fire, `the Water fold fills the fire flow when it opens ("${String(fire).slice(0, 60)}")`);
    // 4. Capital: one view.
    await ev(() => { PeelAnalysisTabs.openTab('dca'); });
    await page.waitForFunction(() => document.querySelector('#pnl-dca .pnl-answer'), null, { timeout: 60000 }).catch(() => null); await wait(800);
    const cap = await panel('#pnl-dca'), cw = await ev(k => { const p = PeelDevNav.projectByKey(k); return { n: PeelCapitalEA.siteBriefCount() || 0, needs: (PeelMasterPlan.devNeeds(p) || []).length, pay: !!(PeelSvcData.svcFacts(p) && PeelDcCost.dcRevenueHTML(p)), copy: !!document.querySelector('#pnl-dca [data-ce-copy-brief]') }; }, key);
    expect(!(await subtabsShown('dca')) && (await ev(() => PeelAnalysisTabs.getDcSub())) === 'timing', 'Capital has no chip row at a development: one view');
    const near = cap.lists.filter(t => ['Coming up (90 days)', 'Near the site', 'May apply (not on the map yet)', 'Capital works planned or under way near the site'].includes(t));
    expect((cap.lists[0] === 'The projects it relies on' || !cw.needs) && (cw.n > 0) === (near.length > 0 && cw.copy), `Capital lists the projects it relies on, then the EAs and works near it when there are some (${cw.n}: ${cap.lists.join(' | ')}; copy ${cw.copy})`);
    expect(cap.folds.some(f => f.t === 'DCs it would pay') === cw.pay, `the DCs it would pay, a fold (${cap.folds.map(f => f.t).join(' | ')})`);
    if (await ev(() => (PeelCapitalEA.siteBriefFor() || { eas: [] }).eas.length > 0)) {
      // (EAs near: Show EAs on the map heads their list; the full table ends with the site's EA table, its
      // controls working there, drawn once)
      expect(await ev(() => !!document.querySelector('#pnl-dca .pnl-list-h [data-pnl-ce-map="ea"]')), 'Show EAs on the map heads the list of the EAs near');
      await ev(() => { PeelPanel.openFull(); }); await wait(1500);
      const se = await ev(() => { const b = document.querySelector('#dca-site-eas'), vis = q => !!b && [...b.querySelectorAll(q)].some(x => x.checkVisibility()); return { q: vis('[data-eatab-q]'), csv: vis('[data-eatab-csv]'), geo: vis('[data-eatab-geo]'), map: vis('[data-eatab-map]'), checked: b ? b.querySelectorAll('input[data-eatab-show]:checked').length : -1, pane: !!(document.getElementById('dca-eas-body') || {}).innerHTML }; });
      expect(se.q && se.csv && se.geo && se.map && se.checked === 1 && !se.pane, `Capital's full table: the site's EA table with its filters and exports, once (${JSON.stringify(se)})`);
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click('#dca-site-eas [data-eatab-csv]')]);
      expect(dl && /^peel-environmental-assessments-.+\.csv$/.test(dl.suggestedFilename()), `its CSV (${dl && dl.suggestedFilename()})`);
      await ev(() => { PeelPanel.closeFull(); }); await wait(600);
    }
    // 5. Its page: the Overview's About; Records' files and events (the strip's Records, navigation phase 6b).
    await ev(() => { PeelWorkspaces.openPage('site'); }); await wait(2000);
    const sum = await ev(() => [...document.querySelectorAll('#home details.pnl-fold > summary')].map(x => x.textContent.trim()));
    expect(sum.includes('About') && !sum.includes('Files, events and proposal'), `the page's Overview folds About (${sum.join(' | ')})`);
    await page.click('#home .page-tabs [data-pg-tab="records"]'); await wait(2000);
    expect((await ev(() => [...document.querySelectorAll('#home details.pnl-fold > summary')].map(x => x.textContent.trim()))).includes('Files and events') && await ev(() => PeelWorkspaces.view() === 'records:files'), 'the page\'s Records folds the files and events');
    // 6. No units or jobs (no servicing figures, about one development in five): Network still holds the Site checks.
    const z = await ev(() => { const q = PeelApp.state.projects.find(x => x.lat != null && !PeelSvcData.svcFacts(x)); return q && q.key; });
    await ev(k => { PeelWorkspaces.setMode('full'); PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); }, z); await wait(2500);
    await ev(() => { PeelAnalysisTabs.openTab('svc', 'network'); }); await wait(1500);
    const zn = await ev(() => ({ at: `${PeelAnalysisTabs.getFootTab()}:${PeelAnalysisTabs.getSvcSub()}`, answer: ((document.querySelector('#pnl-svc .pnl-answer') || {}).textContent || '').trim(), cx: document.querySelectorAll('#pnl-svc #pnl-site #devtab-cx').length, all: document.querySelectorAll('#devtab-cx').length }));
    expect(zn.at === 'svc:network' && /^No servicing figures/.test(zn.answer) && zn.cx === 1 && zn.all === 1, `${z}: no units or jobs, Network's Site fold holds the constraints (${JSON.stringify(zn)})`);
    await ev(() => { PeelWorkspaces.openPage('site'); }); await wait(2000);
    await page.click('#home .page-tabs [data-pg-tab="svc"]'); await wait(2000);
    expect(await ev(() => document.querySelectorAll('#home #pnl-site #devtab-cx').length === 1 && PeelWorkspaces.view() === 'svc:network'), 'and its page\'s Servicing › Network');
  });

  // Navigation phase 5: FSR review is a Servicing view (svs=fsr), the one host of the FSR cross-check. Check FSR
  // in the development's header opens it on the map and on its page; one form in the document; at Peel the view
  // hides; a link reopens it; the site page's strip is the map's tabs, Servicing with its views row (navigation
  // phase 6b: the site's page is the page host at a development); the page's own link reloaded cold is its FSR
  // review, and its Open the map the map's.
  await check('FSR review is a Servicing view: Check FSR in the header opens it on the map and on the page; one form; a link reopens it', browser, {}, async ({ page, ev }, expect) => {
    const ready = () => page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    await ready();
    const key = await ev(() => PeelApp.state.projects.find(q => q.phase === 'approved' && q.units > 300).key);
    await ev(k => { PeelWorkspaces.setMode('full'); PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); }, key); await wait(2500);
    await ev(() => { PeelAnalysisTabs.openTab('overview'); }); await wait(1000);
    expect(await ev(() => !document.getElementById('site-bar')), 'no site bar');
    // 1. The map: the header's Check FSR, one form, the view's link.
    await page.click('#pnl-overview .pnl-tools [data-at="svc:fsr"]'); await wait(2000);
    const m = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), form: !!document.querySelector('#pnl-svc [data-pnl-fsrbox] .fsr-check'), runs: document.querySelectorAll('.fsr-box [data-fc-run]').length, link: PeelShare.viewLink.hash() }));
    expect(m.tab === 'svc' && m.sub === 'fsr', `Check FSR opens Servicing › FSR review (${m.tab} › ${m.sub})`);
    const mv = await ev(IN_VIEW, ['#pnl-svc [data-fc="population"]', '#analysis-panes']);
    expect(mv.in, `the form in view after the one click, the cross-check first (${JSON.stringify(mv)})`);
    expect(m.form && m.runs === 1, `its form, the one in the document (${m.runs})`);
    expect(/(^|&)svs=fsr(&|$)/.test(m.link) && /(^|&)d=/.test(m.link), `the view's link keeps it (${m.link.slice(0, 140)})`);
    await page.fill('#pnl-svc .fsr-box [data-fc="population"]', '1234');
    await page.click('#pnl-svc .fsr-box [data-fc-run]'); await wait(1500);
    expect(await ev(() => { const r = document.querySelector('#pnl-svc [data-fc-results]'); return !!r && !r.hidden && r.textContent.trim().length > 0; }), 'Compare sets the consultant\u2019s figures beside the app\u2019s');
    // 2. At Peel the view hides (Capacity · Network); the link reopens it at the development.
    await ev(() => { DevScope.close(); PeelAnalysisTabs.showFootTab('svc'); }); await wait(1500);
    expect(await ev(() => { const c = document.querySelector('[data-svcsub="fsr"]'); return !!c && c.classList.contains('site-off') && !c.offsetParent; }), 'at Peel the FSR review chip is hidden');
    await ev(h => { PeelShare.viewLink.apply(h); }, m.link); await wait(3000);
    const r = await ev(() => ({ key: (DevScope.current() || {}).key, tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub() }));
    expect(r.key === key && r.tab === 'svc' && r.sub === 'fsr', `the link reopens FSR review at the development (${JSON.stringify(r)})`);
    // 3. Its page: the map's five tabs by their names; the header's Check FSR, the typed figure kept; Network back.
    await ev(() => { PeelWorkspaces.openPage('site'); }); await wait(2500);
    const secs = await ev(() => [...document.querySelectorAll('#home .page-tabs .page-sec')].map(b => b.childNodes[0].textContent.trim()).join());
    expect(secs === 'Overview,Growth,Servicing,Capital,Records', `the site page's tabs (${secs})`);
    await page.click('#home .home-h [data-ws-page="fsr"]'); await wait(2500);
    const pg = await ev(() => ({ page: PeelWorkspaces.page(), at: PeelWorkspaces.view(), form: !!document.querySelector('#home [data-pnl-fsrbox] .fsr-check'), runs: document.querySelectorAll('.fsr-box [data-fc-run]').length, pop: (document.querySelector('#home .fsr-box [data-fc="population"]') || {}).value, on: ((document.querySelector('#home .page-tabs .page-sec.on') || {}).textContent || '').trim(), view: (document.querySelector('#home .page-subsecs .page-sec.on') || {}).textContent }));
    expect(pg.page === 'site' && pg.at === 'svc:fsr' && pg.form && pg.runs === 1 && pg.on === 'Servicing' && pg.view === 'FSR review', `Check FSR on the page: Servicing › FSR review, one form (${JSON.stringify(pg)})`);
    const pv = await ev(IN_VIEW, ['#home [data-fc="population"]', '#home']), behind = await ev(() => ({ sub: PeelAnalysisTabs.getSvcSub(), hash: location.hash }));
    expect(pv.in, `the page's form in view too (${JSON.stringify(pv)})`);
    expect(behind.sub === 'fsr' && /(^|[#&])svs=fsr(&|$)/.test(behind.hash), `FSR review behind the page, the address saying so (${behind.sub}; ${behind.hash.slice(0, 120)})`);
    expect(pg.pop === '1234', `the figure typed on the map is kept (${pg.pop})`);
    // (the start screen's last workspace: the page as the reader names it, Review an FSR at FSR review, else Check a
    // site, by Check FSR or the views row alike)
    const lw = () => ev(() => JSON.parse(localStorage.getItem('peel-dev:lastWs')));
    expect(await lw() === 'fsr', 'Check FSR: the last workspace is Review an FSR');
    await page.click('#home .page-subsecs [data-pg-sub="network"]'); await wait(2000);
    const nw = await ev(() => ({ page: PeelWorkspaces.page(), at: PeelWorkspaces.view(), view: (document.querySelector('#home .page-subsecs .page-sec.on') || {}).textContent, lw: JSON.parse(localStorage.getItem('peel-dev:lastWs')) }));
    expect(nw.page === 'site' && nw.at === 'svc:network' && nw.view === 'Network' && nw.lw === 'site', `Network: the site page at Servicing, the last workspace Check a site (${JSON.stringify(nw)})`);
    await page.click('#home .page-subsecs [data-pg-sub="fsr"]'); await wait(2000);
    { const f = await ev(() => ({ at: PeelWorkspaces.view(), lw: JSON.parse(localStorage.getItem('peel-dev:lastWs')) })); expect(f.at === 'svc:fsr' && f.lw === 'fsr', `the views row's FSR review: the last workspace Review an FSR, as Check FSR's (${JSON.stringify(f)})`); }
    // 4. The page's own link, reloaded cold (#w=p:site&nav=3&t=svc&svs=fsr&d=<key>): the page's FSR review; Open the
    // map: the map's. (Phase 5's #w=p:fsr links: "kept from before phase 5".)
    await page.click('#home .home-h [data-ws-page="fsr"]'); await wait(1500);
    { const hs = await ev(() => location.hash); expect(/(^|[#&])w=p(%3A|:)site(&|$)/.test(hs) && /(^|[#&])svs=fsr(&|$)/.test(hs) && /(^|[#&])nav=3(&|$)/.test(hs) && hs.includes('d='), `the address is the page\u2019s link (${hs.slice(0, 140)})`); }
    await page.reload(); await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); await ready();
    await page.waitForFunction(() => document.querySelector('#home [data-pnl-fsrbox] .fsr-check'), null, { timeout: 60000 }).catch(() => null);
    const c = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), key: (DevScope.current() || {}).key, form: !!document.querySelector('#home [data-pnl-fsrbox] .fsr-check') }));
    expect(c.page === 'site' && c.view === 'svc:fsr' && c.key === key && c.form, `the link opens the page's FSR review (${JSON.stringify(c)})`);
    await page.click('#home .page-foot [data-ws-go="fsr"]'); await wait(2500);
    const mp = await ev(() => ({ mode: PeelWorkspaces.mode(), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), form: !!document.querySelector('#pnl-svc [data-pnl-fsrbox] .fsr-check') }));
    expect(mp.mode !== 'home' && mp.tab === 'svc' && mp.sub === 'fsr' && mp.form, `Open the map: Servicing › FSR review on the map (${JSON.stringify(mp)})`);
  });

  // Navigation phase 5 on a phone (390 × 844): a development's header is one row of tools that scrolls sideways,
  // ☆ Watch and ⋯ in reach (44 px), the ⋯ menu inside the screen and folded by a pick; the header scrolls with
  // its panel (taller than the half sheet with the flags and tools: R7's fallback); Check FSR one tap; its page
  // with no sideways scroll, Servicing's views row too.
  await check('phone: a development\u2019s header in one row, ⋯ in reach, Check FSR one tap, no sideways scroll', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    await ev(() => { const p = PeelApp.state.projects.find(q => q.phase === 'approved' && q.units > 300 && q.lat != null); PeelWorkspaces.setMode('full'); PeelApp.setAnalysisSnap('half'); PeelDevNav.showDetail(p); }); await wait(2500);
    await ev(() => { PeelAnalysisTabs.openTab('overview'); PeelApp.setAnalysisSnap('half'); }); await wait(1200);
    const h = await ev(() => {
      const q = s => document.querySelector(s), ht = el => (el ? Math.round(el.getBoundingClientRect().height) : 0), row = q('#pnl-overview .pnl-tools-row');
      return { row: ht(row), btns: row ? [...row.querySelectorAll('.btn')].map(ht) : [], watch: ht(q('#pnl-overview .pnl-flags .watch-btn')), more: ht(q('#pnl-overview .pnl-more > summary')), head: ht(q('#pnl-overview .pnl-head')), pos: getComputedStyle(q('#pnl-overview .pnl-head')).position, doc: document.documentElement.scrollWidth, panes: (q('#analysis-panes') || {}).scrollWidth || 0 };
    });
    expect(h.row > 0 && h.row < 60 && h.btns.length >= 3 && h.btns.every(x => x >= 44), `the tools in one row, each 44 px (${h.row}: ${h.btns.join()})`);
    expect(h.watch >= 44 && h.more >= 44, `☆ Watch and ⋯, 44 px (${h.watch}, ${h.more})`);
    expect(h.pos === 'static', `the header (${h.head} px) scrolls with its panel (${h.pos})`);
    expect(h.doc <= 390 && h.panes <= 390, `no sideways scroll (${h.doc}, ${h.panes})`);
    await page.locator('#pnl-overview .pnl-more > summary').tap(); await wait(800);
    const mn = await ev(() => { const m = document.querySelector('#pnl-overview .pnl-more .site-more-menu'), r = m.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, items: [...m.querySelectorAll('.btn')].map(b => Math.round(b.getBoundingClientRect().height)) }; });
    expect(mn.l >= 0 && mn.r <= mn.vw && mn.t >= 0 && mn.b <= mn.vh, `the ⋯ menu inside the screen (${JSON.stringify(mn)})`);
    expect(mn.items.length === 4 && mn.items.every(x => x >= 44), `its four items, 44 px (${mn.items.join()})`);
    await page.locator('#pnl-overview .pnl-more [data-scope-compare]').tap(); await wait(800);
    expect(await ev(() => !document.querySelector('#pnl-overview .pnl-more').open), 'a pick folds the menu');
    // (Compare opens the comparison, a sheet over the panel on a phone, as the site bar's Tools › Compare did:
    // its Clear all closes it)
    const cmp = await ev(() => { const c = document.getElementById('compare-col'), p = DevScope.current(); return !!c && c.classList.contains('tcmp-on') && PeelToolCompare.items().some(x => x.key === `dev:${p.key}`); });
    expect(cmp, '⋯ › Compare shows the development in the comparison');
    await page.locator('#compare-col [data-tcmp-clear]').tap(); await wait(600);
    expect(await ev(() => document.getElementById('compare-col').hidden), 'its Clear all closes the comparison');
    await ev(() => { PeelAnalysisTabs.openTab('overview'); }); await wait(800);
    await page.locator('#pnl-overview .pnl-tools [data-at="svc:fsr"]').tap(); await wait(2000);
    expect(await ev(() => PeelAnalysisTabs.getFootTab() === 'svc' && PeelAnalysisTabs.getSvcSub() === 'fsr'), 'Check FSR, one tap: Servicing › FSR review');
    const fv = await ev(IN_VIEW, ['#pnl-svc [data-fc="population"]', '#analysis-panes']);
    expect(fv.in, `its form in the half sheet, no scroll needed (${JSON.stringify(fv)})`);
    // Its page: the header's buttons and the strip's tabs 44 px; no sideways scroll on Overview, Servicing (its views
    // row) and FSR review (navigation phase 6b: the strip and Servicing's views).
    await ev(() => { PeelWorkspaces.openPage('site'); }); await wait(2500);
    const sp = async () => ev(() => ({ btns: [...document.querySelectorAll('#home .home-h .pnl-tools .btn, #home .home-h .watch-btn, #home .page-tabs .page-sec, #home .page-subsecs .page-sec')].map(b => Math.round(b.getBoundingClientRect().height)), doc: document.documentElement.scrollWidth, home: document.getElementById('home').scrollWidth }));
    const a = await sp();
    expect(a.btns.length >= 9 && a.btns.every(x => x >= 44) && a.doc <= 390 && a.home <= 390, `the site page: its header and tabs 44 px, no sideways scroll (${JSON.stringify(a)})`);
    await page.locator('#home .page-tabs [data-pg-tab="svc"]').first().tap(); await wait(2000);
    const b = await sp();
    expect(b.btns.length >= 11 && b.btns.every(x => x >= 44) && b.doc <= 390 && b.home <= 390, `its Servicing, the views row 44 px, no sideways scroll (${JSON.stringify(b)})`);
    await page.locator('#home .page-subsecs [data-pg-sub="fsr"]').tap(); await wait(2500);
    const f = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), doc: document.documentElement.scrollWidth, home: document.getElementById('home').scrollWidth }));
    expect(f.page === 'site' && f.view === 'svc:fsr' && f.doc <= 390 && f.home <= 390, `its FSR review, no sideways scroll (${JSON.stringify(f)})`);
    const pf = await ev(IN_VIEW, ['#home [data-fc="population"]', '#home']);
    expect(pf.in, `its form in view (${JSON.stringify(pf)})`);
    // (Records: the files and events, its Gantt chart's bars inside their track)
    await page.locator('#home .page-tabs [data-pg-tab="records"]').first().tap(); await wait(2500);
    const rc = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), doc: document.documentElement.scrollWidth, home: document.getElementById('home').scrollWidth }));
    expect(rc.page === 'site' && rc.view === 'records:files' && rc.doc <= 390 && rc.home <= 390, `its Records, no sideways scroll (${JSON.stringify(rc)})`);
  });

  // Navigation phase 5 (design §3.6): one header for a development, on every tab and on its page, in place of the
  // map's site bar. Each tab's panel carries its own copy, so what changes on one tab shows on the next (☆ Watch,
  // a trace's on state: a second press hides the path; the flags); ⋯ holds the rest: Record allocation opens
  // Servicing › Network's allocation fold, Compare adds the development, Export (CSV) its row, Copy link the view.
  await check('a development’s one header on every tab and its page: ☆ Watch and Trace sewer follow from tab to tab; ⋯ Record allocation, Compare, Export (CSV) and Copy link do what they say', browser, {}, async ({ ctx, page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && PeelApp.state.dcInfra, null, { timeout: 120000 });
    const key = await ev(() => PeelApp.state.projects.find(q => q.phase === 'approved' && q.units > 300 && q.lat != null && !PeelApp.watch.has(q.key)).key);
    await ev(k => { PeelWorkspaces.setMode('full'); PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); }, key); await wait(2500);
    const TABS = [['overview', null], ['growth', 'pipeline'], ['svc', 'network'], ['dca', 'timing'], ['records', 'files']];
    const show = async ts => { await ev(([t, s]) => { PeelAnalysisTabs.openTab(t, s || undefined); }, ts); await page.waitForSelector(`#pnl-${ts[0]} .pnl-head .pnl-tools-row`, { timeout: 60000 }).catch(() => null); await wait(1000); };
    const head = sel => ev(sl => {
      const h = document.querySelector(sl); if (!h) return null;
      const tx = s => [...h.querySelectorAll(s)].map(b => b.textContent.trim()), one = s => ((h.querySelector(s) || {}).textContent || '').trim();
      return { shown: h.getClientRects().length > 0, tools: tx('.pnl-tools-row .btn'), more: tx('.pnl-more [role="menuitem"]'), watch: one('.pnl-flags [data-watch]'), trace: one('.pnl-tools-row [data-trace]'), flags: (h.querySelector('.pnl-flag-list') || {}).innerHTML, fsr: [...h.querySelectorAll('.pnl-tools-row .btn')].filter(b => b.textContent === 'Check FSR').map(b => b.dataset.at || `page:${b.dataset.wsPage}`)[0] };
    }, sel);
    const TOOLS = 'Trace sewer|Trace water|Check FSR|Servicing memo|Inquiry draft', MORE = 'Record allocation|Compare|Export (CSV)|Copy link';
    // 1. The same header on the five tabs: its tools and actions in one row, ⋯, ☆ Watch beside the same flags.
    const heads = [];
    for (const ts of TABS) { await show(ts); heads.push([ts[0], await head(`#pnl-${ts[0]} .pnl-head`)]); }
    for (const [t, h] of heads) expect(h && h.shown && h.tools.join('|') === TOOLS && h.more.join('|') === MORE && h.watch === '☆ Watch' && h.fsr === 'svc:fsr', `${t}: the development's header (${JSON.stringify(h && { tools: h.tools, more: h.more, watch: h.watch, fsr: h.fsr })})`);
    expect(heads.every(([, h]) => h && h.flags === heads[0][1].flags), `the same flags on every tab (${heads.map(([t, h]) => `${t} ${h ? h.flags.length : '-'}`).join(', ')})`);
    expect(await ev(() => !document.getElementById('site-bar')), 'no site bar above the tabs');
    // 2. ☆ Watch on the Overview: Growth's copy says Watching; off again on Growth: the Overview's copy follows.
    await show(TABS[0]); await page.click('#pnl-overview .pnl-flags [data-watch]'); await wait(600);
    await show(TABS[1]);
    expect((await head('#pnl-growth .pnl-head')).watch === '★ Watching' && await ev(k => PeelApp.watch.has(k), key), 'watched from the Overview: Growth’s header says ★ Watching');
    await page.click('#pnl-growth .pnl-flags [data-watch]'); await wait(600);
    await show(TABS[0]);
    expect((await head('#pnl-overview .pnl-head')).watch === '☆ Watch' && !(await ev(k => PeelApp.watch.has(k), key)), 'and off again from Growth: the Overview’s header says ☆ Watch');
    // 3. Trace sewer on Network: the Overview's copy is on ("Hide the path"), and a press there hides the path.
    await show(TABS[2]); await page.click('#pnl-svc .pnl-tools-row [data-trace]');
    const traced = await page.waitForFunction(k => PeelSewerTrace.TRACE.key === k, key, { timeout: 30000 }).then(() => true, () => false);
    await show(TABS[0]);
    const ot = await ev(() => { const b = document.querySelector('#pnl-overview .pnl-tools-row [data-trace]'); return { t: b.textContent.trim(), on: b.dataset.on }; });
    expect(traced && ot.t === 'Hide the path' && ot.on === '1', `traced from Network: the Overview's Trace sewer is on (${traced}, ${JSON.stringify(ot)})`);
    await page.click('#pnl-overview .pnl-tools-row [data-trace]'); await wait(1000);
    expect(await ev(() => !PeelSewerTrace.TRACE.key), 'a press there hides the path');
    await show(TABS[2]);
    expect((await head('#pnl-svc .pnl-head')).trace === 'Trace sewer', 'and Network’s copy is off again');
    // 4. ⋯ on Capital › Record allocation: Servicing › Network, its allocation fold open, the menu folded.
    await show(TABS[3]);
    await page.click('#pnl-dca .pnl-more > summary'); await wait(400);
    await page.click('#pnl-dca .pnl-more [data-scope-alloc]'); await wait(1500);
    const al = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), open: !!(document.getElementById('pnl-alloc') || {}).open, inSvc: !!document.querySelector('#pnl-svc #pnl-alloc'), menu: !!(document.querySelector('#pnl-dca .pnl-more') || {}).open }));
    expect(al.tab === 'svc' && al.sub === 'network' && al.open && al.inSvc, `⋯ › Record allocation: Servicing › Network, its allocation fold open (${JSON.stringify(al)})`);
    expect(!al.menu, 'the pick folds the ⋯ menu');
    // 5. ⋯ on Records: Compare adds it; Export (CSV) downloads its row; Copy link copies the view (Records, d=).
    await show(TABS[4]);
    await page.click('#pnl-records .pnl-more > summary'); await wait(400);
    await page.click('#pnl-records .pnl-more [data-scope-compare]'); await wait(800);
    expect(await ev(k => PeelToolCompare.items().some(x => x.key === `dev:${k}`) && document.getElementById('compare-col').classList.contains('tcmp-on'), key), '⋯ › Compare adds the development to the comparison, shown');
    // (under 1800 px the comparison sits over the panel's side: its Clear all closes it)
    await page.click('#compare-col [data-tcmp-clear]'); await wait(600);
    await page.click('#pnl-records .pnl-more > summary'); await wait(400);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click('#pnl-records .pnl-more [data-scope-export]')]);
    const csv = dl ? fs.readFileSync(await dl.path(), 'utf8') : '', title = await ev(k => PeelDevNav.projectByKey(k).title, key);
    expect(dl && /^peel-.+\.csv$/.test(dl.suggestedFilename()) && csv.includes(title), `⋯ › Export (CSV): its row (${dl && dl.suggestedFilename()}, ${csv.split('\n').length} lines)`);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
    await page.click('#pnl-records .pnl-more > summary'); await wait(400);
    await page.click('#pnl-records .pnl-more [data-share]'); await wait(1000);
    const link = await ev(() => navigator.clipboard.readText()).catch(() => ''), lq = new URLSearchParams(link.split('#')[1] || '');
    expect(lq.get('d') === key && lq.get('t') === 'records', `⋯ › Copy link: this view, the development and Records (${link.slice(0, 120)})`);
    // 6. Its page: the same header; Check FSR the page's FSR review; ☆ Watch there shows on the map's copy.
    await ev(() => { PeelWorkspaces.openPage('site'); }); await wait(2500);
    const ph = await head('#home .home-h');
    expect(ph && ph.tools.join('|') === TOOLS && ph.more.join('|') === MORE && ph.fsr === 'page:fsr' && ph.flags === heads[0][1].flags, `the page's header: the same tools, ⋯ and flags; Check FSR its page (${JSON.stringify(ph && { tools: ph.tools, more: ph.more, fsr: ph.fsr })})`);
    await page.click('#home .home-h .pnl-flags [data-watch]'); await wait(600);
    await ev(() => { PeelWorkspaces.setMode('full'); }); await show(TABS[0]);
    expect((await head('#pnl-overview .pnl-head')).watch === '★ Watching', 'watched from its page: the map’s header says ★ Watching');
    await page.click('#pnl-overview .pnl-flags [data-watch]'); await wait(400);
    // 7. The "n links to check" flag on a page: the site's page at Records › Files (the map's too; navigation phase 6b).
    const ck = await ev(() => { const FT = PeelFileTree, q = PeelApp.state.projects.find(x => FT.of(x) && FT.summary(FT.of(x)).check > 0); return q && q.key; });
    await ev(k => { PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); PeelWorkspaces.openPage('site'); }, ck); await wait(2500);
    await page.click('#home .home-h [data-tree-check]'); await wait(2000);
    const tc = await ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), sec: ((document.querySelector('#home .page-tabs .page-sec.on') || {}).textContent || '').trim(), hist: [...document.querySelectorAll('#home .dev-hist')].some(x => x.getClientRects().length > 0) }));
    expect(tc.mode === 'home' && tc.page === 'site' && tc.view === 'records:files' && tc.sec === 'Records' && tc.hist, `${ck}: the page's "links to check" opens its Records (${JSON.stringify(tc)})`);
  });

  // Kept from before navigation phase 5 (design §7, the plan's alias rows): a browser left at Settings › Counting's
  // Previous opens on the tree count (owner decision 14: the switch is retired, its rule the fallback, with its
  // reason); a stored Development sub-tab (peel-dev:devsub) is never read: a development opens on its Overview, and
  // Records is its one view of the files; a stored FSR review pick is Servicing's first view at Peel and FSR review
  // again at a development, a stored EAs pick DC timing there; old links with d=: t=dev (the Overview), #w=fsr (the
  // map's Review an FSR view at FSR review), t=dca&dcs=eas (Capital's one view; the EAs again at Peel), #w=p:site
  // (its page at Overview).
  await check('kept from before phase 5: a stored Previous count is the tree count; a stored Development sub-tab is never read; stored FSR review and EAs picks wait for a development; old t=dev, #w=fsr, dcs=eas, #w=p:site and #w=p:fsr links open the one layout', browser, { prefs: { countMode: 'previous', footTab4: 'svc', svcSub: 'fsr', dcSub: 'eas' } }, async ({ page, ev }, expect) => {
    const load = async (url, ready) => { await page.goto(`http://localhost:${PORT}/${url}`); await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); if (ready) await page.waitForSelector(ready, { timeout: 120000 }); await wait(1500); };
    const svcReady = () => page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    // (the old release's raw sub-tab value, as js/devtab.js wrote it: once, before the next load)
    await page.addInitScript(() => { if (sessionStorage.getItem('devsubSet')) return; localStorage.setItem('peel-dev:devsub', 'site'); sessionStorage.setItem('devsubSet', '1'); });
    // 1. Previous: the tree count for every development the tree counts, the rest with their reason; no switch.
    const tc = await ev(() => { const ps = PeelApp.state.projects.all || PeelApp.state.projects; return { tree: ps.filter(p => p.count && p.count.mode === 'tree').length, why: ps.filter(p => p.count && p.count.mode !== 'tree').every(p => !!p.count.why), mode: typeof PeelTreeCounts.mode, kept: PeelUtil.store.get('countMode', null), sel: !!document.getElementById('count-mode') }; });
    expect(tc.tree > 1000 && tc.why && tc.mode === 'undefined' && !tc.sel, `the stored Previous: the tree count for ${tc.tree} developments, the rest say why they keep the count from their files and permits; no switch (${JSON.stringify(tc)})`);
    expect(tc.kept === 'previous', 'the stored pick is left as it was: nothing reads or writes it');
    // (the servicing model in first: worked out as its data lands, it holds the page for several seconds, and since
    // navigation phase 6 the full map opened from Home is at Overview, more work at once: the gear's clicks wait for a
    // page that answers, 30 s, not 5)
    await svcReady();
    await ev(() => { PeelWorkspaces.setMode('full'); }); await wait(1000);
    // (navigation phase 7: ⚙ opens one Settings sheet, no menu; its Counting pointer is gone, §5 row 170)
    await page.click('#tb-gear', { timeout: 30000 }); await wait(800);
    const st = await ev(() => { const m = document.getElementById('tb-gear-menu'); return { open: !m.hidden, heads: [...m.querySelectorAll('legend, h3')].map(h => h.textContent.trim()).filter(t => /^(Display|Start screen|Your role|Reports|Labs|Usage)/.test(t)).map(t => t.split(' ')[0]).join(','), counting: !!m.querySelector('.set-counting'), sel: !!m.querySelector('#count-mode'), menu: m.querySelectorAll('[data-tbg]').length }; });
    expect(st.open && st.heads === 'Display,Start,Your,Reports,Labs,Usage' && !st.counting && !st.sel && !st.menu, `Settings has no counting switch or pointer: the Scenario control counts (${JSON.stringify(st)})`);
    await page.keyboard.press('Escape'); await wait(300);
    expect(await ev(() => document.getElementById('tb-gear-menu').hidden), 'Escape closes the Settings sheet');
    // 2. The stored FSR review pick: Capacity at Peel; FSR review once a development opens (on its Overview).
    await svcReady();
    const key = await ev(() => PeelApp.state.projects.find(q => q.phase === 'approved' && q.units > 300 && q.lat != null).key);
    expect(await ev(() => PeelAnalysisTabs.getSvcSub()) === 'capacity', 'at Peel the stored FSR review pick shows Servicing › Capacity');
    await ev(k => { PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); }, key); await wait(2500);
    const op = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), dc: PeelAnalysisTabs.getDcSub() }));
    expect(op.tab === 'overview' && op.sub === 'fsr' && op.dc === 'timing', `a development opens on its Overview; Servicing at FSR review, Capital its one view (${JSON.stringify(op)})`);
    await ev(() => { PeelAnalysisTabs.openTab('svc'); }); await page.waitForSelector('#pnl-svc [data-pnl-fsrbox] .fsr-check', { timeout: 60000 }).catch(() => null);
    expect(await ev(() => PeelAnalysisTabs.getSvcSub() === 'fsr' && !!document.querySelector('#pnl-svc [data-pnl-fsrbox] .fsr-check')), 'Servicing opens at FSR review, its form');
    // 3. Old links with d=, opened cold (each with a query of its own: a new load, not a hash change).
    const d = encodeURIComponent(key), at = () => ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page && PeelWorkspaces.page(), key: (DevScope.current() || {}).key, tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), dc: PeelAnalysisTabs.getDcSub(), ovDev: !!document.getElementById('ov-dev'), devsub: document.querySelectorAll('[data-devsub]').length, stored: localStorage.getItem('peel-dev:devsub') }));
    await load(`?dev#t=dev&d=${d}`, '#pnl-overview .pnl-head .pnl-tools-row');
    const a = await at();
    expect(a.key === key && a.tab === 'overview' && !a.ovDev && !a.devsub, `t=dev&d=: the development's Overview, no Development sub-tabs (${JSON.stringify(a)})`);
    expect(a.stored === 'site', `the stored Development sub-tab is left as it was, never read (${a.stored})`);
    await ev(() => { PeelAnalysisTabs.openTab('records'); }); await page.waitForSelector('#pnl-records #pnl-hist .dev-hist', { timeout: 60000 }).catch(() => null);
    expect(await ev(() => !document.querySelector('#analysis .f-subtabs[data-pane="records"]:not([hidden])') && !!document.querySelector('#pnl-records #pnl-hist .dev-hist')), 'Records: one view, its files and events (the stored Site sub-tab changes nothing)');
    await load(`?fsr#w=fsr&d=${d}`); await svcReady();
    await page.waitForSelector('#pnl-svc [data-pnl-fsrbox] .fsr-check', { timeout: 60000 }).catch(() => null);
    const b = await at();
    expect(b.mode === 'ws' && b.key === key && b.tab === 'svc' && b.sub === 'fsr' && await ev(() => document.querySelectorAll('.fsr-box [data-fc-run]').length === 1), `#w=fsr&d=: the map's Review an FSR view at Servicing › FSR review, one form (${JSON.stringify(b)})`);
    await load(`?eas#t=dca&dcs=eas&d=${d}`); await svcReady();
    await page.waitForFunction(() => document.querySelector('#pnl-dca .pnl-answer'), null, { timeout: 60000 }).catch(() => null); await wait(800);
    const c = await at(), chips = await ev(() => { const r = document.querySelector('#analysis .f-subtabs[data-pane="dca"]'); return !!r && !r.hidden && r.getClientRects().length > 0; });
    expect(c.key === key && c.tab === 'dca' && c.dc === 'timing' && !chips, `t=dca&dcs=eas&d=: Capital's one view at the development, no chip row (${JSON.stringify({ tab: c.tab, dc: c.dc, chips })})`);
    await ev(() => { DevScope.close(); PeelAnalysisTabs.showFootTab('dca'); }); await wait(1500);
    expect(await ev(() => PeelAnalysisTabs.getDcSub()) === 'eas', 'closed: Capital › EAs again, the link’s pick');
    // (navigation phase 6b: the site's page is the page host at a development, the map's strip under its header)
    const strip = () => ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), key: (DevScope.current() || {}).key, on: (((((document.querySelector('#home .page-tabs .page-sec.on') || {}).childNodes || [])[0] || {}).textContent) || '').trim(), secs: [...document.querySelectorAll('#home .page-tabs .page-sec')].map(x => x.childNodes[0].textContent.trim()).join() }));
    await load(`?site#w=p:site&d=${d}`, '#home .page-tabs .page-sec.on');
    const s = await strip();
    expect(s.page === 'site' && s.view === 'overview:' && s.key === key && s.on === 'Overview' && s.secs === 'Overview,Growth,Servicing,Capital,Records', `#w=p:site&d=: its page at Overview, the map's five tabs (${JSON.stringify(s)})`);
    // Phase 5's FSR review link (openPage('fsr') wrote the Find step's Network): the page's own view by rule (nav < 3).
    await load(`?fsrl#w=p:fsr&nav=2&t=svc&svs=network&d=${d}`); await svcReady();
    await page.waitForSelector('#home [data-pnl-fsrbox] .fsr-check', { timeout: 60000 }).catch(() => null);
    const f = await strip();
    expect(f.page === 'site' && f.view === 'svc:fsr' && f.key === key && f.on === 'Servicing', `#w=p:fsr&nav=2&t=svc&svs=network&d=: the site's page at Servicing › FSR review (${JSON.stringify(f)})`);
  });

  // Navigation phase 6a, kept from before it (§7.1–7.2, risk 4): a stored last workspace opens Home at its tab, never
  // Overview, with Servicing shown "loading" on both strips until the servicing data lands; an old area page link
  // opens that page's own view; a Home link made before phase 6 (nav=2) opens Overview, a new one (nav=3) its view.
  // (slowData blocks the service worker, so this is its own path)
  await check('kept from before phase 6, and a tab before its data: a stored last workspace opens Home at its tab, Servicing shown loading until the servicing data lands (never Overview); an older #w=p:data&t=overview link opens Home at Records › Sources', browser, { prefs: { startScreen: 'last', lastWs: 'tight' }, slowData: { 'servicing.json': 40000 } }, async ({ page, ev }, expect) => {
    const load = async url => { await page.goto(`http://localhost:${PORT}/${url}`); await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); await wait(2000); };
    const at = () => ev(() => { const t = document.querySelector('#home .page-tabs [data-pg-tab="svc"]'), m = document.getElementById('ftab-svc');
      return { mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), on: !!(t && t.classList.contains('on')), busy: !!(t && t.getAttribute('aria-busy') === 'true'), answer: ((document.querySelector('#home .home-answer') || {}).textContent || '').trim(),
        views: [...document.querySelectorAll('#home .page-subsecs .page-sec')].map(b => b.textContent.trim()).join(), map: { hidden: !!(m && m.hidden), busy: !!(m && m.hasAttribute('aria-busy')), word: m ? getComputedStyle(m, '::after').content : '' } }; });
    // 1. Servicing picked (the stored last workspace) before its data: lit, loading, never Overview; the map's tab shown, marked.
    const s0 = await at();
    if (s0.map.busy) {
      expect(s0.mode === 'home' && s0.page === 'home' && s0.view === 'svc:capacity' && s0.on && s0.busy && /^Loading/.test(s0.answer) && s0.views === 'Capacity,Network,Old pipes', `before the servicing data: Home › Servicing lit and loading (${JSON.stringify(s0)})`);
      expect(!s0.map.hidden && /loading/.test(s0.map.word), `the map's strip shows Servicing, marked loading (${JSON.stringify(s0.map)})`);
    } else expect(s0.view === 'svc:capacity', `the servicing data was already in: Home › Servicing › Capacity (${s0.view})`);
    const landed = await page.waitForFunction(() => !document.querySelector('#ftab-svc[aria-busy]') && !document.querySelector('#home .page-tabs [data-pg-tab="svc"][aria-busy]'), null, { timeout: 90000 }).then(() => true, () => false);
    await wait(2500);
    const s1 = await at(), cap = await ev(() => { const st = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); PeelWorkspaces.renderPage(true); return { page: st(document.querySelector('#home .home-answer').innerHTML), want: st(PeelWsPages.build('tight').answer) }; });
    expect(landed && s1.view === 'svc:capacity' && s1.on && !s1.busy && cap.page === cap.want && !/^Loading/.test(cap.page), `the data in: the page fills in place, Servicing › Capacity (${JSON.stringify({ view: s1.view, busy: s1.busy, page: cap.page.slice(0, 60) })})`);
    // 2. An older link to the Data sources page: Home at Records › Sources (the page's own view; t was the map's).
    await load('?p6a#w=p:data&t=overview');
    const d = await at();
    expect(d.mode === 'home' && d.page === 'home' && d.view === 'records:sources', `#w=p:data&t=overview: Home › Records › Sources (${JSON.stringify({ mode: d.mode, page: d.page, view: d.view })})`);
    // 3. The link it shares now: Home, its tab and view, nav=3.
    const h = await ev(() => PeelShare.viewLink.hash());
    expect(/(^|&)w=home(&|$)/.test(h) && /(^|&)t=records(&|$)/.test(h) && /(^|&)rs=sources(&|$)/.test(h) && /(^|&)nav=3(&|$)/.test(h), `its share link: w=home, t=records, rs=sources, nav=3 (${h})`);
    // 4. A Home link made before phase 6 (nav=2 carried the map's tab): Overview; a new one (nav=3): its view.
    await load('?p6b#w=home&nav=2&t=svc&svs=network');
    const o2 = await at();
    expect(o2.mode === 'home' && o2.view === 'overview:', `#w=home&nav=2&t=svc&svs=network: Home's Overview, as it showed (${o2.view})`);
    await load('?p6c#w=home&nav=3&t=svc&svs=network');
    const o3 = await at();
    expect(o3.mode === 'home' && o3.view === 'svc:network' && o3.on, `#w=home&nav=3&t=svc&svs=network: Home › Servicing › Network (${o3.view})`);
    // 5. Capital › EAs needs neither the servicing model nor the DC program: with servicing.json still held, its own
    // content once the EA lists are in, while the strip may still say Capital is loading.
    await load('?p6d#w=p:eaflow');
    await page.waitForFunction(() => window.PeelCapitalEA && PeelCapitalEA.data && PeelCapitalEA.data.loaded, null, { timeout: 90000 }); await wait(2500);
    const e = await ev(() => { const t = document.querySelector('#home .page-tabs [data-pg-tab="dca"]'); return { view: PeelWorkspaces.view(), busy: !!(t && t.getAttribute('aria-busy') === 'true'), svc: !!(window.PeelApp && PeelApp.state.servicing), answer: ((document.querySelector('#home .home-answer') || {}).textContent || '').trim().slice(0, 80) }; });
    expect(e.view === 'dca:eas' && !/^Loading/.test(e.answer) && e.answer.length > 20, `#w=p:eaflow before the DC program: Home › Capital › EAs drawn (${JSON.stringify(e)})`);
  });

  // Navigation phase 7 (owner decision 17, AD-17; §3.2, §3.7): ⚙ is one Settings sheet (the focus in it, Escape back
  // to ⚙, a click outside closes it, a Labs switch keeps it open); Settings › Your role sets Home's For your role; the
  // start screen's Last place reopens the page, its tab and view, its development and its place; a development that
  // has gone opens the page without it; on a phone ⚙ in ⋯ folds ⋯ and the sheet fits the screen.
  await check('Last place and Settings: ⚙ is one sheet, its role sets Home’s shortcuts; the start screen’s Last place reopens the page, tab, view and development; a development gone, the page without it', browser, { prefs: { startScreen: 'last' } }, async ({ page, ev }, expect) => {
    // (the next load's stored place, set before the app reads it: a page still drawing could store its own first)
    await page.addInitScript(() => { const v = sessionStorage.getItem('lpNext'); if (v) { localStorage.setItem('peel-dev:lastPlace', v); sessionStorage.removeItem('lpNext'); } });
    const load = async url => { await page.goto(`http://localhost:${PORT}/${url}`); await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); await wait(2500); };
    const at = () => ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), d: (window.DevScope && DevScope.current() || {}).key || null, muni: PeelApp.state.muni, tab: ((document.querySelector('#home .page-tabs .page-sec.on') || {}).dataset || {}).pgTab, chip: ((document.querySelector('#home .page-subsecs .page-sec.on') || {}).textContent || '').trim(), eyebrow: ((document.querySelector('#home .page-eyebrow') || {}).textContent || '').trim() }));
    const kept = () => ev(() => JSON.parse(localStorage.getItem('peel-dev:lastPlace')));
    // 1. ⚙ opens the sheet at once: its sections in order, Last place the start screen picked, the focus in it.
    await page.click('#tb-gear', { timeout: 30000 }); await wait(800);
    const sh = await ev(() => { const m = document.getElementById('tb-gear-menu'); return { open: !m.hidden, dialog: m.getAttribute('role'), heads: [...m.querySelectorAll('legend, h3')].map(h => h.textContent.trim().split(' ')[0]).join(','), start: ((m.querySelector('[data-ws-start-btn].on') || {}).textContent || '').trim(), focus: m.contains(document.activeElement) }; });
    expect(sh.open && sh.dialog === 'dialog' && sh.heads === 'Display,Start,Your,Reports,Labs,Usage' && sh.start === 'Last place' && sh.focus, `⚙: the Settings sheet, Display · Start screen · Your role · Reports · Labs · Usage, Last place on, the focus in it (${JSON.stringify(sh)})`);
    await page.keyboard.press('Escape'); await wait(300);
    const es = await ev(() => ({ hidden: document.getElementById('tb-gear-menu').hidden, focus: (document.activeElement || {}).id }));
    expect(es.hidden && es.focus === 'tb-gear', `Escape closes it, the focus back on ⚙ (${JSON.stringify(es)})`);
    // Your role in the sheet: Home's menu keeps that role's shortcuts at once; a Labs switch leaves the sheet open.
    await page.click('#tb-gear'); await wait(800);
    await page.selectOption('#tb-gear-menu [data-role-set]', 'capital'); await wait(1000);
    const rl = await ev(() => ({ open: !document.getElementById('tb-gear-menu').hidden, role: PeelUtil.store.get('role', ''), got: [...document.querySelectorAll('#home .home-side .home-short')].map(b => b.textContent.trim()).join('|') }));
    expect(rl.open && rl.role === 'capital' && rl.got === 'Capital › DC timing|EA to construction (Capital › EAs)|Old pipes (Servicing › Old pipes)', `Settings › Your role: capital, Home's For your role (${JSON.stringify(rl)})`);
    await page.click('#tb-gear-menu [data-lab="swmm"]'); await wait(800);
    const lb = await ev(() => ({ open: !document.getElementById('tb-gear-menu').hidden, on: PeelLabs.on('swmm') }));
    await page.click('#tb-gear-menu [data-lab="swmm"]'); await wait(800);
    expect(lb.open && lb.on && !(await ev(() => PeelLabs.on('swmm'))), `a Labs switch keeps the sheet open (${JSON.stringify(lb)})`);
    // (a tap outside the sheet, on a shortcut: it closes as the shortcut opens Home › Capital › EAs)
    await page.locator('#home .home-side .home-short', { hasText: 'EA to construction' }).first().click(); await wait(2500);
    const ea = await ev(() => ({ hidden: document.getElementById('tb-gear-menu').hidden, page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), lists: [...document.querySelectorAll('#home .pnl-list-h h3')].map(h => h.textContent.trim()) }));
    expect(ea.hidden && ea.page === 'home' && ea.view === 'dca:eas', `the EA to construction shortcut: the sheet closed, Home › Capital › EAs (${JSON.stringify({ ...ea, lists: undefined })})`);
    // 2. A development's page at Servicing › Network: kept as the last place.
    await page.waitForFunction(() => PeelAnalysisTabs.tabReady('svc'), null, { timeout: 120000 }).catch(() => {});
    const key = await ev(() => { const p = PeelApp.state.projects.find(q => q.phase === 'approved' && q.units >= 300 && q.lat != null); PeelDevNav.showDetail(p); return p.key; }); await wait(2500);
    await ev(() => PeelWorkspaces.openPage('site')); await wait(2000);
    await pickView(page, ev, 'svc:network'); await wait(1000);
    const k1 = await kept();
    expect(k1 && k1.page === 'site' && k1.view === 'svc:network' && k1.d === key, `the site's page at Servicing › Network kept (${JSON.stringify(k1)})`);
    // 3. A load with no link: that page, its view and its development.
    await load('?lp1');
    await page.waitForFunction(() => PeelAnalysisTabs.tabReady('svc') && PeelWorkspaces.view() === 'svc:network', null, { timeout: 90000 }).catch(() => {});
    const c1 = await at();
    expect(c1.mode === 'home' && c1.page === 'site' && c1.view === 'svc:network' && c1.d === key && c1.tab === 'svc' && c1.chip === 'Network', `Last place: the site's page at Servicing › Network, its development (${JSON.stringify(c1)})`);
    // 4. Home › Growth › Areas at Caledon: the place filter comes back with it.
    await ev(() => PeelWorkspaces.openPage('home')); await wait(1500);
    await ev(() => PeelWsPages.drillTo('m:Caledon')); await wait(1500);
    await pickView(page, ev, 'growth:areas'); await wait(1000);
    const k2 = await kept();
    expect(k2 && k2.page === 'home' && k2.view === 'growth:areas' && k2.mu === 'Caledon' && !k2.d, `Home › Growth › Areas at Caledon kept (${JSON.stringify(k2)})`);
    await load('?lp2');
    await page.waitForFunction(() => PeelApp.state.muni === 'Caledon' && PeelWorkspaces.view() === 'growth:areas', null, { timeout: 60000 }).catch(() => {});
    const c2 = await at();
    expect(c2.page === 'home' && c2.view === 'growth:areas' && c2.muni === 'Caledon' && !c2.d, `Last place: Home › Growth › Areas at Caledon (${JSON.stringify(c2)})`);
    // 5. A development that has gone (a regroup): the page without it, its Find step.
    await ev(() => sessionStorage.setItem('lpNext', JSON.stringify({ page: 'site', view: 'svc:network', d: 'Nowhere|0 NO ST', mu: '', sp: '' })));
    await load('?lp3'); await wait(1500);
    const c3 = await at();
    expect(c3.page === 'site' && !c3.d && c3.view === null && /^Find · step 1 of 3/.test(c3.eyebrow), `a development gone: the site's page at its Find step (${JSON.stringify(c3)})`);
    // 6. A phone: ⚙ in ⋯ folds ⋯ (toggleSettings' own fold) and the sheet fits the screen, scrolling inside itself.
    await page.setViewportSize({ width: 390, height: 844 }); await wait(1500);
    await page.click('#tb-more'); await wait(500);
    await page.click('#tb-gear'); await wait(800);
    const ph = await ev(() => { const m = document.getElementById('tb-gear-menu'), r = m.getBoundingClientRect(); return { open: !m.hidden, left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), more: document.getElementById('tb-actions').classList.contains('open'), exp: document.getElementById('tb-more').getAttribute('aria-expanded'), home: document.getElementById('home').scrollWidth, doc: document.documentElement.scrollWidth }; });
    expect(ph.open && ph.left >= 0 && ph.right <= 390 && ph.bottom <= 844 && !ph.more && ph.exp === 'false' && ph.home <= 390 && ph.doc <= 390, `phone: ⋯ folded, the sheet inside 390 × 844, no sideways scroll (${JSON.stringify(ph)})`);
    await page.keyboard.press('Escape'); await wait(300);
    await ev(() => PeelUtil.store.set('role', ''));
  });

  // Navigation phase 7 (owner decision 6; §3.2, §3.7, §7): with no role Home's menu says where to pick one; Help › Start
  // here's This is my role sets the For your role shortcuts (one list of six, the same on Home's menu, the tour and
  // Settings); a shortcut opens the view it names and a row of What each tab answers opens its view; the old
  // #w=p:explore and #w=p:reference links open Find and Help.
  await check('Your role and old links: Help › Start here’s This is my role sets Home’s shortcuts, a shortcut and a row of What each tab answers open their view; #w=p:explore opens Find and #w=p:reference Help', browser, {}, async ({ page, ev }, expect) => {
    const side = () => ev(() => ({ pick: [...document.querySelectorAll('#home .home-side .home-role [data-ws-page="help"]')].map(b => b.textContent.trim()).join(), head: ((document.querySelector('#home .home-side h2.home-g') || {}).textContent || '').trim(), got: [...document.querySelectorAll('#home .home-side .home-short')].map(b => b.textContent.trim()).join('|') }));
    const r0 = await side();
    expect(/^Pick your role for shortcuts/.test(r0.pick) && !r0.got, `no role: the pick line, no shortcut (${JSON.stringify(r0)})`);
    await page.click('#home .home-side .home-role [data-ws-page="help"]'); await wait(1500);
    expect(await ev(() => PeelWorkspaces.page()) === 'help', 'the pick line opens Help');
    // (Start here: a role's card says "This is my role"; picking it keeps the role and redraws Home's menu at once)
    await page.click('#home .help-role [data-role-pick="growth"]'); await wait(1200);
    const gr = await ev(() => ({ role: PeelUtil.store.get('role', ''), on: document.querySelectorAll('#home .help-role.on').length, pressed: (b => b && b.getAttribute('aria-pressed'))(document.querySelector('#home .help-role.on [data-role-pick]')), want: PeelWorkspaces.ROLES.find(r => r.key === 'growth').links.map(l => l.label).join('|') }));
    const r1 = await side();
    expect(gr.role === 'growth' && gr.on === 1 && gr.pressed === 'true' && r1.got === gr.want && /^For your role · Growth or policy analyst/.test(r1.head) && !r1.pick, `This is my role: growth, its card on, Home's menu keeps its shortcuts (${JSON.stringify({ ...gr, ...r1 })})`);
    // A shortcut opens the view it names (What's coming: Home › Growth › Forecast), Home lit.
    await page.locator('#home .home-side .home-short', { hasText: 'What’s coming' }).first().click(); await wait(2500);
    const sc = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), lit: ((document.querySelector('#home .home-ws.on') || {}).dataset || {}).wsPage }));
    expect(sc.page === 'home' && sc.view === 'growth:timing' && sc.lit === 'home', `the What’s coming shortcut: Home › Growth › Forecast (${JSON.stringify(sc)})`);
    // What each tab answers: a row per view of Home; one opens its view.
    await ev(() => PeelWorkspaces.openPage('help')); await wait(1500);
    await page.click('#home .help-asks [data-ws-at="dca:eas"]'); await wait(2500);
    const as = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), lit: ((document.querySelector('#home .home-ws.on') || {}).dataset || {}).wsPage }));
    expect(as.page === 'home' && as.view === 'dca:eas' && as.lit === 'home', `a row of What each tab answers opens its view (${JSON.stringify(as)})`);
    // Old links, cold: #w=p:explore is Find (its step), #w=p:reference is Help (four sections, Help lit); the role stays.
    const load = async hash => { await page.goto(`http://localhost:${PORT}/${hash}`); await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); await wait(2500); };
    await load('?old1#w=p:explore');
    const ex = await ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), eyebrow: ((document.querySelector('#home .page-eyebrow') || {}).textContent || '').trim(), lit: ((document.querySelector('#home .home-ws.on') || {}).dataset || {}).wsPage }));
    expect(ex.mode === 'home' && ex.page === 'site' && /^Find/.test(ex.eyebrow) && ex.lit === 'find', `#w=p:explore: Find (${JSON.stringify(ex)})`);
    await load('?old2#w=p:reference');
    const rf = await ev(() => ({ page: PeelWorkspaces.page(), secs: [...document.querySelectorAll('#home .page-sec')].map(b => b.textContent).join(), lit: ((document.querySelector('#home .home-ws.on') || {}).dataset || {}).wsPage, role: PeelUtil.store.get('role', '') }));
    expect(rf.page === 'help' && rf.secs === 'Start here,How it works,Glossary,How the app decides' && rf.lit === 'help' && rf.role === 'growth', `#w=p:reference: Help, its four sections, the role kept (${JSON.stringify(rf)})`);
    await ev(() => PeelUtil.store.set('role', ''));
  });

  // Find: one sidebar entry (Explore's, navigation phase 7) for Check a site and Review an FSR's first steps, an
  // area's views being Home's tabs; the one search at the top of each; a site picked opens its page; its trail steps
  // back up; its FSR review is Servicing's second view (navigation phase 6b: the site's page has the map's strip, and
  // where it sits is the top bar's trail, each step that place, the site closed, the tab kept).
  await check('Find: one entry, the search on every page, a site and back up its trail, its FSR review', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    const side = await ev(() => [...document.querySelectorAll('#home .home-side ul [data-ws-page]')].map(b => b.dataset.wsPage));
    expect(side.join() === 'home,week,find,help', `the sidebar: ${side.join()}`);
    const lit = () => ev(() => ((document.querySelector('#home .home-ws.on') || {}).dataset || {}).wsPage);
    await page.click('#home .home-side [data-ws-page="find"]'); await wait(2000);
    const fd = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), lists: [...document.querySelectorAll('#home .pnl-list-h h3')].map(h => h.textContent).join('|') }));
    expect(fd.page === 'site' && fd.view === null && ['Recently active', 'Large files under review', 'Files with an FSR posted'].every(t => fd.lists.includes(t)), `Find opens the Find step, its three lists (${JSON.stringify(fd)})`);
    expect(await lit() === 'find', 'Find is lit in the sidebar');
    // (navigation phase 6: an area's views are Home's tabs: Home, then the strip's Growth › Areas, Home lit)
    await page.click('#home .home-side [data-ws-page="home"]'); await wait(2000);
    await pickView(page, ev, 'growth:areas');
    const a = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), search: !!document.querySelector('#home #page-search #search-box'), on: (document.querySelector('#home .home-ws.on') || {}).dataset, tabs: [...document.querySelectorAll('#home .page-tabs .page-sec')].map(b => b.childNodes[0].textContent.trim()), views: [...document.querySelectorAll('#home .page-subsecs .page-sec')].map(b => b.textContent.trim()) }));
    expect(a.page === 'home' && a.view === 'growth:areas', `Home › Growth › Areas (${a.page}, ${a.view})`);
    expect(a.search, 'the search box is at the top of the page');
    expect(a.on && a.on.wsPage === 'home', 'Home is lit in the sidebar');
    expect(a.tabs.join() === 'Overview,Growth,Servicing,Capital,Records' && a.views.join() === 'Pipeline,Areas,Forecast', `the strip and Growth's views: ${a.tabs.join()} | ${a.views.join()}`);
    // Home's Servicing: the map's own Servicing › Capacity answer; back to Growth, Areas kept.
    await page.click('#home .page-tabs [data-pg-tab="svc"]'); await wait(2000);
    const sv = await ev(() => { const st = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return { view: PeelWorkspaces.view(), on: (((document.querySelector('#home .page-tabs .page-sec.on') || {}).childNodes || [])[0] || { textContent: '' }).textContent.trim(), page: st(document.querySelector('#home .home-answer').innerHTML), map: st(PeelPanel.get('svc:capacity').spec.answer) }; });
    expect(sv.view === 'svc:capacity' && sv.on === 'Servicing' && sv.page.includes(sv.map), `Home's Servicing is the map's ("${sv.page.slice(0, 50)}", ${sv.view})`);
    await page.click('#home .page-tabs [data-pg-tab="growth"]'); await wait(1500);
    expect(await ev(() => PeelWorkspaces.view()) === 'growth:areas', 'back on Growth, at Areas');
    // A municipality (the drill is the filter), then a development from its list: its page, with its trail.
    await page.click('#home [data-ws-drill="m:Brampton"]'); await wait(1500);
    expect(await ev(() => PeelApp.state.muni) === 'Brampton', 'the drill to Brampton is the map’s filter');
    await page.locator('#home [data-ws-pick][data-ws-as="site"]').first().click(); await wait(3500);
    const s = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), dev: !!DevScope.current(), title: (DevScope.current() || {}).title, placed: !!(DevScope.current() && PeelPlanTables.placeOf(DevScope.current())),
      trail: [...document.querySelectorAll('#trail .tb-step')].map(b => b.textContent.trim()), own: document.querySelectorAll('#home [data-ws-explore], #home .page-explore').length,
      secs: [...document.querySelectorAll('#home .page-tabs .page-sec')].map(b => b.childNodes[0].textContent.trim()), search: !!document.querySelector('#home #page-search #search-box') }));
    expect(s.page === 'site' && s.view === 'overview:' && s.dev, `a development opens its page, at Overview (${s.page}, ${s.view})`);
    expect(await lit() === 'find', 'a site’s page: Find is lit');
    // (the top bar's trail: Peel › Brampton (the filter's, once) › its plan … › the site; the page has no line of its own)
    expect(s.trail[0] === 'Peel' && s.trail[1] === 'Brampton' && s.trail.filter(x => x === 'Brampton').length === 1 && s.trail.at(-1) === s.title && (!s.placed || s.trail.length >= 4) && !s.own, `its trail: ${s.trail.join(' › ')} (placed ${s.placed}; the page's own ${s.own})`);
    expect(s.secs.join() === 'Overview,Growth,Servicing,Capital,Records', `its tabs: ${s.secs.join()}`);
    expect(s.search, 'the search stays at the top');
    const lm = await ev(() => ({ inPage: !!document.querySelector('#home #page-map-slot #map'), chips: [...document.querySelectorAll('#home [data-ws-layer]')].map(b => b.dataset.wsLayer) }));
    expect(lm.inPage, 'the live map is on the site\u2019s page');
    expect(lm.chips.join() === 'devs,ex-water,ex-sanitary,ex-storm,dcw,cons,ea', `its layer chips: ${lm.chips.join()}`);
    // Its FSR review (Servicing, then its views row), then back to another tab of the site.
    await pickView(page, ev, 'svc:fsr');
    const f = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), box: !!document.querySelector('#home [data-pnl-fsrbox]'), on: (((document.querySelector('#home .page-tabs .page-sec.on') || {}).childNodes || [])[0] || { textContent: '' }).textContent.trim(), chip: (document.querySelector('#home .page-subsecs .page-sec.on') || {}).textContent }));
    expect(f.page === 'site' && f.view === 'svc:fsr' && f.box && f.on === 'Servicing' && f.chip === 'FSR review', `the FSR review (${f.page} at ${f.view}, ${f.on} › ${f.chip})`);
    expect(await lit() === 'find', 'its FSR review: Find is lit');
    await page.click('#home .page-tabs [data-pg-tab="growth"]'); await wait(2500);
    const g = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), on: (((document.querySelector('#home .page-tabs .page-sec.on') || {}).childNodes || [])[0] || { textContent: '' }).textContent.trim() }));
    expect(g.page === 'site' && g.view === 'growth:pipeline' && g.on === 'Growth', `back on the site at Growth (${g.page}, ${g.view}, ${g.on})`);
    // A step up the top bar's trail: Home at Brampton (the filter), the site closed, the tab kept (Growth, at the
    // area's own view: Areas, picked before the site opened).
    await page.locator('#trail .tb-step', { hasText: /^Brampton$/ }).first().click(); await wait(2500);
    const u = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), dev: !!DevScope.current(), muni: PeelApp.state.muni, name: (document.querySelector('#home h1') || {}).textContent }));
    expect(u.page === 'home' && u.view === 'growth:areas' && !u.dev && u.muni === 'Brampton' && /Brampton/.test(u.name), `up the trail to Brampton (${JSON.stringify(u)})`);
    expect(await lit() === 'home', 'Home is lit again');
  });

  // Navigation phase 6 (the site's page): a development's page is the map's tab strip at the development. Each view
  // opens with its own first action (the map panel's footer), and Open the map, the map view's ← Page and the full
  // map's back bar keep the tab, the view and the development; Capital is one view at a development (no chip row).
  await check('a development’s page is the map’s tabs: each view’s own first action; Open the map, ← Page and the full map’s back bar keep the tab, the view and the development', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && !document.querySelector('#ftab-dca[aria-busy]'), null, { timeout: 120000 });
    const key = await ev(() => PeelApp.state.projects.find(q => q.phase === 'approved' && q.units > 300).key);
    await ev(k => { PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); PeelWorkspaces.openPage('site'); }, key); await wait(2500);
    const at = () => ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), key: (DevScope.current() || {}).key, back: ((document.getElementById('back-bar') || {}).textContent || '').trim() }));
    // 1. Each view's first action is the map panel's footer's own; then Open the map, which keeps the view.
    for (const k of Object.keys(await ev(() => PeelSections.VIEWS.site)).filter(x => x !== 'svc:fsr')) {
      await pickView(page, ev, k); await wait(800);
      const r = await ev(k => {
        const p = DevScope.current(), s = PeelSections.specFor(PeelSections.VIEWS.site[k], p), b = document.querySelector('#home .page-foot .pnl-acts > :first-child');
        return { want: s && s.foot && s.foot.primary && s.foot.primary.label, got: b && b.textContent.trim(), keep: [...document.querySelectorAll('#home .page-foot [data-ws-go][data-ws-keep]')].some(x => x.textContent.trim() === 'Open the map') };
      }, k);
      expect(r.want && r.got === r.want, `${k}: the footer starts with the view's own action ("${r.got}" / "${r.want}")`);
      expect(r.keep, `${k}: Open the map keeps the view`);
    }
    // 2. Servicing › Network and Capital: the map at that tab with the development, ← Page back at the view.
    for (const [k, tab, sub] of [['svc:network', 'svc', 'network'], ['dca:timing', 'dca', null]]) {
      await pickView(page, ev, k);
      await page.locator('#home .page-foot [data-ws-go][data-ws-keep]', { hasText: 'Open the map' }).first().click(); await wait(2500);
      let s = await at();
      expect(s.mode === 'ws' && s.tab === tab && (!sub || s.sub === sub) && s.key === key, `${k}: Open the map: the map's ${tab} tab at the development (${JSON.stringify(s)})`);
      await page.locator('#ws-bar [data-ws-backpage]').click(); await wait(2000);
      s = await at();
      expect(s.mode === 'home' && s.page === 'site' && s.view === k && s.key === key, `${k}: ← Page: the site's page at the same view (${JSON.stringify(s)})`);
    }
    // 3. The full map from the page's sidebar, and its back bar: the page at Capital, then at Servicing › Network.
    for (const [k, words] of [['dca:timing', /Back to Check a site › Capital/], ['svc:network', /Back to Check a site › Servicing › Network/]]) {
      await pickView(page, ev, k);
      await page.locator('#home [data-ws-full]:visible').first().click(); await wait(2500);
      let s = await at();
      expect(s.mode === 'full' && s.key === key && words.test(s.back), `${k}: the full map; the back bar names the view (${s.mode}, ${s.back})`);
      await page.locator('#back-bar [data-ws-back]').click(); await wait(2000);
      s = await at();
      expect(s.mode === 'home' && s.page === 'site' && s.view === k && s.key === key, `${k}: back on the page at the same view (${JSON.stringify(s)})`);
    }
  });

  // Navigation phase 6 (the top bar's trail): at a development it places the site in its plan, Peel › municipality ›
  // plan … › the site, on the map and on its page (no line of the page's own). Each step is that place's filter, the
  // site closed, the tab kept: on the map the map, on the page Home at that tab, at the area's own view.
  await check('the top bar’s trail places a development in its plan: on the map and its page each step is that place’s filter, the site closed, the tab kept', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && !document.querySelector('#ftab-dca[aria-busy]'), null, { timeout: 120000 });
    // (a development under a plan and a level of it: a precinct)
    const d = await ev(() => {
      const PT = PeelPlanTables, ps = PeelApp.state.projects.filter(p => p.phase === 'approved' && p.units > 300 && p.lat != null);
      const p = ps.find(q => { const l = PT.placeOf(q); return l && PT.areaPath(l).length >= 2; });
      return p ? { key: p.key, title: p.title, muni: p.municipality, path: PT.areaPath(PT.placeOf(p)) } : null;
    });
    expect(!!d, 'an approved development under a plan and one of its levels'); if (!d) return;
    const st = () => ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), tab: PeelAnalysisTabs.getFootTab(), dev: (DevScope.current() || {}).title || null, muni: PeelApp.state.muni, sp: PeelApp.state.sp.slice(),
      trail: [...document.querySelectorAll('#trail .tb-step')].map(b => b.textContent.trim()), own: document.querySelectorAll('#home [data-ws-explore], #home .page-explore, #home .ex-where').length,
      stored: JSON.parse(localStorage.getItem('peel-dev:footTab4')), fl: (document.querySelector('#trail [data-tb-filters]') || { getAttribute: () => null }).getAttribute('aria-label') }));
    const step = async i => { await page.locator('#trail .tb-step').nth(i).click(); await wait(2500); };
    const open = async (to, tab) => {
      await ev(([k, to, tab]) => { PeelWsPages.drillTo('peel'); PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); if (to === 'site') PeelWorkspaces.openPage('site'); else { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab(tab); } }, [d.key, to, tab]); await wait(2500);
    };
    const placed = s => s.trail.length === 2 + d.path.length + 1 && s.trail[0] === 'Peel' && s.trail[1] === d.muni && s.trail.at(-1) === d.title;
    // 1. The map at Capital: the whole path; the municipality's step closes the site and filters to it, Capital kept.
    await open('map', 'dca'); let s = await st();
    expect(s.mode === 'full' && s.tab === 'dca' && placed(s), `the map's trail places the site (${s.trail.join(' › ')})`);
    await step(1); s = await st();
    expect(s.mode === 'full' && s.tab === 'dca' && !s.dev && s.muni === d.muni && !s.sp.length && s.trail.join() === `Peel,${d.muni}`, `the municipality's step: the filter, the site closed, Capital kept (${JSON.stringify(s)})`);
    // 2. With the municipality the filter the trail does not repeat it; the plan's step, on the map at Overview (the
    // site's, for the visit: the stored tab stays Capital, the one picked, as closing the site leaves it).
    await ev(k => { PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); }, d.key); await wait(2500);
    s = await st();
    expect(placed(s) && s.trail.filter(x => x === d.muni).length === 1, `with ${d.muni} the filter, its step is not repeated (${s.trail.join(' › ')})`);
    await step(2); s = await st();
    expect(s.mode === 'full' && !s.dev && s.muni === d.muni && s.sp.join() === d.path[0] && s.tab === 'overview', `the plan's step: the plan the filter, the site closed (${JSON.stringify(s)})`);
    expect(s.stored === 'dca', `the tab kept for the visit, not stored: footTab4 ${s.stored}`);
    // 3. The site's page: the same trail, none of its own; the precinct's step is Home at the precinct, Servicing kept.
    await open('site'); await pickView(page, ev, 'svc:network'); s = await st();
    expect(s.page === 'site' && s.view === 'svc:network' && placed(s) && !s.own, `the page's trail is the top bar's (${s.trail.join(' › ')}; the page's own ${s.own})`);
    await step(d.path.length + 1); s = await st();
    expect(s.page === 'home' && s.view === 'svc:capacity' && !s.dev && s.muni === d.muni && s.sp.join() === d.path.at(-1), `the last level's step: Home at Servicing, the site closed, the place the filter (${JSON.stringify(s)})`);
    // 4. Peel's step on the page at Growth: Home at Growth, every filter off.
    await open('site'); await pickView(page, ev, 'growth:pipeline'); await step(0); s = await st();
    expect(s.page === 'home' && s.view === 'growth:pipeline' && !s.dev && !s.muni && !s.sp.length && s.trail.join() === 'Peel', `Peel's step: Home at Growth, nothing filtered (${JSON.stringify(s)})`);
    // 5. A filter that does not hold it (another municipality, the site picked anyway): the site's own place, never the
    // filter's; that filter is the trail's "1 filter", removable there, the site kept.
    const other = d.muni === 'Caledon' ? 'Mississauga' : 'Caledon';
    await ev(([k, m]) => { PeelWsPages.drillTo(`m:${m}`); PeelWorkspaces.setMode('full'); PeelDevNav.showDetail(PeelDevNav.projectByKey(k)); }, [d.key, other]); await wait(2500);
    s = await st();
    expect(s.mode === 'full' && s.muni === other && s.dev === d.title && placed(s) && !s.trail.includes(other) && s.fl === '1 filter', `a ${other} filter: the trail is the site's own place, the filter its 1 filter (${s.trail.join(' › ')}; ${s.fl})`);
    await page.locator('#trail [data-tb-filters]').click(); await wait(800);
    const chips = await ev(() => [...document.querySelectorAll('#tb-fl-pop [data-pf-i]')].map(x => x.textContent.replace('×', '').trim()));
    expect(chips.join() === other, `the popover lists ${other} (${chips.join()})`);
    await page.locator('#tb-fl-pop [data-pf-i="0"]').click(); await wait(2500);
    s = await st();
    expect(!s.muni && s.dev === d.title && placed(s) && !s.fl, `${other} removed: the site kept, its place the trail (${JSON.stringify(s)})`);
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
    // A file number (a development matched by it alone): its page at Records, the file marked in its tree.
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
      // (navigation phase 6b: the site's page at Records › Files, the strip's Records on)
      const s = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), key: (DevScope.current() || {}).key, on: (((document.querySelector('#home .page-tabs .page-sec.on') || {}).childNodes || [])[0] || { textContent: '' }).textContent.trim() }));
      expect(s.page === 'site' && s.view === 'records:files' && s.key === f.key && s.on === 'Records', `its page at Records (${s.page} at ${s.view}, the strip's ${s.on})`);
      await wait(1000);
      const m = await ev(r => { const b = document.querySelector(`#home .tr-row > div > .tr-ref[data-dev-file="${CSS.escape(r)}"]`), row = b && b.closest('.tr-row'), fold = row && row.closest('details.tr-same'); return { row: !!row, hit: !!(row && row.classList.contains('tr-hit')), open: fold ? fold.open : null }; }, f.ref);
      // (a file in its tree: its row is there, marked, its fold of earlier files opened)
      if (f.tree) {
        expect(m.row, `${f.ref}: its row in the file tree`);
        expect(m.hit, 'the file is marked in the tree');
        if (f.fold) expect(m.open === true, `its fold of earlier files opened (${m.open})`);
      }
    }
    // A plan: its filter (navigation phase 6, owner decision 10), the page on the tab it was on: Home's Overview at
    // the plan, with its Area report (task 4: two clicks).
    const pl = await bigPlan(ev);
    expect(!!pl, 'a plan with 100+ units');
    // (Home's h1 at one plan names it as the filter panel does)
    const atPlan = () => ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), h1: (document.querySelector('#home h1') || {}).textContent || '', nm: PeelApp.state.sp.length === 1 ? PeelPlanAreas.areaName('sp', PeelApp.state.sp[0]) : '', sp: PeelApp.state.sp.slice(), mtsa: PeelApp.state.mtsa.slice(), muni: PeelApp.state.muni }));
    if (pl) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
      expect(await findPick(page, ev, pl.name, { label: pl.name, kind: 'secondary plan|character area', place: true }), `${pl.name} in the list`);
      const g = await atPlan();
      expect(g.page === 'home' && g.view === 'overview:' && g.sp.join() === pl.area && !!g.nm && g.h1.startsWith(g.nm), `Home's Overview at ${pl.name}, the plan the filter (${JSON.stringify(g)})`);
      // Its Area report (PDF) is the plan's: its developments, any share.
      const rt = await ev(() => { const R = PeelReports, was = R.areaReport, t = []; R.areaReport = (d, title) => t.push([title, d.length]); try { const b = document.querySelector('#home .page-foot [data-ws-areareport]'); if (b) b.click(); } finally { R.areaReport = was; } return t; });
      expect(rt.length === 1 && rt[0][0].includes(pl.name) && rt[0][1] > 0, `the Area report is the plan's (${JSON.stringify(rt)})`);
      await ev(() => { Object.assign(PeelApp.state, { muni: '', sp: [] }); PeelPlanAreas.renderAreaSelects(); PeelApp.applyFilters(); }); await wait(800);
    }
    // A plant: its scope on Servicing capacity's map.
    await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
    expect(await findPick(page, ev, 'clarkson', { kind: 'Wastewater treatment plant', place: true }), 'Clarkson (the plant) in the list');
    const c = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), ss: PeelApp.state.ss }));
    expect(c.mode === 'ws' && c.ws === 'tight' && c.ss === 'plant:Clarkson', `the plant's scope on Servicing capacity's map (${c.mode}, ${c.ws}, ${c.ss})`);
    // A DC project: Home › Capital › DC timing at it (in place), its developments by tier.
    const dc = await ev(() => { const l = PeelApp.state.dcInfra.wastewater.lines.find(x => x.p && x.p.length >= 5); return l ? { p: l.p, key: `wastewater:${l.p}` } : null; });
    expect(!!dc, 'a wastewater DC project');
    if (dc) {
      await ev(() => { if (PeelSvcScope.current()) PeelSvcScope.close(); PeelWorkspaces.openPage('home'); }); await wait(1200);
      expect(await findPick(page, ev, dc.p, { starts: `DC project ${dc.p}`, place: true }), `DC project ${dc.p} in the list`);
      const d = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), sel: PeelDcProjects.state.sel }));
      expect(d.page === 'home' && d.view === 'dca:timing' && d.sel === dc.key, `Home › Capital › DC timing at the project (${JSON.stringify(d)})`);
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
      // With that filter on, another plan of the same municipality picked on Home: that plan the filter, in place
      // of the first (navigation phase 6: drillTo).
      const pl2 = await ev(([id, area]) => { const r = PeelPlanTables.compute(), muni = x => { for (let y = x; y; y = y.parent ? r.nodes.get(y.parent) : null) if (y.kind === 'municipality') return y.name; return ''; }, m = muni(r.nodes.get(id));
        PeelApp.state.sp = []; PeelApp.applyFilters(); const u = PeelPlanTables.compute(), n = [...u.nodes.values()].find(x => x.kind === 'plan' && x.areaId !== area && x.m.planned >= 100 && muni(x) === m && x.name.length >= 6);
        PeelApp.state.sp = [area]; PeelPlanAreas.renderAreaSelects(); PeelApp.applyFilters(); return n ? { name: n.name, area: n.areaId } : null; }, [pl.id, pl.area]);
      if (pl2) {
        await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
        expect(await findPick(page, ev, pl2.name, { label: pl2.name, kind: 'secondary plan|character area', place: true }), `${pl2.name} in the list`);
        const g = await atPlan();
        expect(g.page === 'home' && g.view === 'overview:' && g.sp.join() === pl2.area && !g.mtsa.length && g.h1.startsWith(g.nm), `under ${pl.name}'s filter, ${pl2.name} picked: the filter is ${pl2.name} (${JSON.stringify(g)})`);
      }
      await ev(() => { Object.assign(PeelApp.state, { muni: '', sp: [] }); PeelPlanAreas.renderAreaSelects(); PeelApp.applyFilters(); }); await wait(800);
    }
    // An MTSA picked on a page leaves its filter on; a plan picked next is the filter in its place (the MTSA
    // filter off), Home still on its Overview.
    const mt1 = await ev(() => { const a = PeelApp.state.areas.mtsas.find(x => x.municipality && x.name.length >= 6 && PeelApp.state.areas.mtsas.filter(o => o.name === x.name).length === 1); return a ? { id: a.id, name: a.name } : null; });
    if (pl && mt1) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
      expect(await findPick(page, ev, mt1.name, { label: mt1.name, kind: 'MTSA', place: true }), `${mt1.name} in the list`);
      const a = await ev(() => PeelApp.state.mtsa.slice());
      expect(a.join() === mt1.id, `the MTSA's filter on (${a.join()})`);
      expect(await findPick(page, ev, pl.name, { label: pl.name, kind: 'secondary plan|character area', place: true }), `${pl.name} in the list, from Home at the MTSA`);
      const g = await atPlan();
      expect(g.page === 'home' && g.view === 'overview:' && g.sp.join() === pl.area && !g.mtsa.length && g.h1.startsWith(g.nm), `then ${pl.name}: the plan the filter, the MTSA filter off (${JSON.stringify(g)})`);
      await ev(() => { Object.assign(PeelApp.state, { muni: '', sp: [], mtsa: [] }); PeelPlanAreas.renderAreaSelects(); PeelApp.applyFilters(); }); await wait(800);
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
    // Its list in view, rows a thumb tall; a tap on the plan makes it the filter (Home stays on its Overview) and
    // lets go of the box.
    const pl = await bigPlan(ev);
    if (pl) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1500);
      await page.locator('#f-search').tap(); await page.keyboard.type(pl.name, { delay: 20 }); await wait(1200);
      const s = await ev(() => { const u = document.getElementById('search-sug'), r = u.getBoundingClientRect(); return { shown: !u.hidden, top: r.top, bottom: r.bottom, h: innerHeight, rows: [...u.querySelectorAll('li[data-i]')].map(li => Math.round(li.getBoundingClientRect().height)) }; });
      expect(s.shown && s.top >= 0 && s.bottom <= s.h, `the list in view (${Math.round(s.top)}–${Math.round(s.bottom)} of ${s.h})`);
      expect(s.rows.length > 0 && s.rows.every(h => h >= 44), `rows 44 px or taller (${s.rows.join()})`);
      await ev(() => { document.getElementById('f-search').blur(); }); await wait(500);
      expect(await findPick(page, ev, pl.name, { label: pl.name, kind: 'secondary plan|character area', place: true }, true), `${pl.name} in the list`);
      const g = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), sp: PeelApp.state.sp.slice(), focus: document.activeElement === document.getElementById('f-search') }));
      expect(g.page === 'home' && g.view === 'overview:' && g.sp.join() === pl.area, `the tap: the plan the filter, Home on its Overview (${JSON.stringify(g)})`);
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
    await page.click('#home .home-h [data-inquiry]'); await wait(2000);   // (the site's header, navigation phase 5)
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
    const c = await ev(() => ({ key: (DevScope.current() || {}).key, hidden: document.getElementById('scope-body').hidden, act: !!document.querySelector('#pnl-overview .pnl-head [data-inquiry]') }));
    expect(c.key === p.key && c.hidden, `× goes back to the development (${JSON.stringify(c)})`);
    expect(c.act, 'the map\u2019s development Overview: its header has Inquiry draft too');
    await page.click('#back-bar [data-ws-back]'); await wait(2000);
    const d = await ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), key: (DevScope.current() || {}).key }));
    expect(d.mode === 'home' && d.page === 'site' && d.key === p.key, `back on the site's page (${JSON.stringify(d)})`);
  });

  // A pick on any page, not only Home, opens what it found (navigation phase 1, §3.3): from Review an FSR a
  // development opens its FSR review, from another page its page at Overview; a pumping station its scope on
  // Servicing capacity's map, ← Page back to Home › Servicing › Capacity; an MTSA its filter, its municipality
  // first (navigation phase 6); a DC facility Capital's map view, its card there.
  await check('a pick on any page opens what it found: a development (from Review an FSR, its FSR review), a station, an MTSA, a DC facility', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && PeelApp.state.dcInfra && PeelApp.state.areas && PeelApp.state.servicing, null, { timeout: 120000 });
    // (a development of its own name: the one row that starts with it)
    const p = await ev(() => { const all = PeelApp.state.projects, q = all.find(x => x.phase === 'approved' && x.units > 300 && x.lat != null && x.title.length > 8 && x.title.length < 40 && all.filter(o => o.title.toLowerCase().includes(x.title.toLowerCase())).length === 1); return { key: q.key, title: q.title }; });
    await ev(() => PeelWorkspaces.openPage('fsr')); await wait(1500);
    expect(await findPick(page, ev, p.title, { has: [p.title] }), `${p.title} in Review an FSR's list`);
    // (the FSR review is drawn once the development's Servicing panels are worked out: 2 to 4 s after the pick)
    await page.waitForFunction(() => !!document.querySelector('#home [data-pnl-fsrbox]'), null, { timeout: 15000 }).catch(() => {});
    // (navigation phase 6b: the site's page at Servicing › FSR review)
    const f = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), key: (DevScope.current() || {}).key, box: !!document.querySelector('#home [data-pnl-fsrbox]'), focus: document.activeElement === document.getElementById('f-search') }));
    expect(f.page === 'site' && f.view === 'svc:fsr' && f.key === p.key && f.box, `from Review an FSR: its FSR review (${f.page} at ${f.view}, ${f.key === p.key})`);
    expect(!f.focus, 'the pick lets go of the box');
    await ev(() => { DevScope.close(); PeelWorkspaces.openPage('tight'); }); await wait(1500);
    // (navigation phase 6: Servicing capacity is Home › Servicing › Capacity, the strip's Servicing on)
    const sc = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), on: (document.querySelector('#home .page-tabs .page-sec.on') || { dataset: {} }).dataset.pgTab }));
    expect(sc.page === 'home' && sc.view === 'svc:capacity' && sc.on === 'svc', `Servicing capacity: Home › Servicing › Capacity (${JSON.stringify(sc)})`);
    expect(await findPick(page, ev, p.title, { has: [p.title] }), `${p.title} in Servicing capacity's list`);
    const s = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), key: (DevScope.current() || {}).key, on: (document.querySelector('#home .page-tabs .page-sec.on') || { dataset: {} }).dataset.pgTab }));
    expect(s.page === 'site' && s.view === 'overview:' && s.key === p.key && s.on === 'overview', `from Servicing capacity: its page at Overview (${s.page} at ${s.view}, ${s.on})`);
    // A pumping station: its scope on Servicing capacity's map; ← Page is that page.
    const st = await ev(() => { const a = (PeelApp.state.servicing.psAreas || []).find(x => PeelSvcData.drName(x).length >= 6); return a ? { id: a.id, name: PeelSvcData.drName(a) } : null; });
    expect(!!st, 'a pumping station catchment');
    if (st) {
      await ev(() => { DevScope.close(); PeelWorkspaces.openPage('projects'); }); await wait(1500);
      expect(await findPick(page, ev, st.name, { label: st.name, kind: 'Pumping station catchment', place: true }), `${st.name} in Capital's list`);
      const c = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), ss: PeelApp.state.ss }));
      expect(c.mode === 'ws' && c.ws === 'tight' && c.ss === st.id, `its scope on Servicing capacity's map (${c.mode}, ${c.ws}, ${c.ss})`);
      await page.click('#ws-bar [data-ws-backpage]'); await wait(1500);
      const b = await ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), box: !!document.querySelector('#home .page-find #page-search #search-box') }));
      expect(b.mode === 'home' && b.page === 'home' && b.view === 'svc:capacity' && b.box, `← Page: Home › Servicing › Capacity, its search back in the header (${JSON.stringify(b)})`);
      await ev(() => { if (PeelSvcScope.current()) PeelSvcScope.close(); });
    }
    // An MTSA: its municipality, then its filter, as on the map; Home stays on its Overview (navigation phase 6).
    const mt = await ev(() => { const a = PeelApp.state.areas.mtsas.find(x => x.municipality && x.name.length >= 6 && PeelApp.state.areas.mtsas.filter(o => o.name === x.name).length === 1); return a ? { id: a.id, name: a.name, muni: a.municipality } : null; });
    expect(!!mt, 'an MTSA');
    if (mt) {
      await ev(() => PeelWorkspaces.openPage('home')); await wait(1200);
      expect(await findPick(page, ev, mt.name, { label: mt.name, kind: 'MTSA', place: true }), `${mt.name} in the list`);
      const m = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), name: (document.querySelector('#home h1') || {}).textContent || '', muni: PeelApp.state.muni, mtsa: PeelApp.state.mtsa.slice() }));
      expect(m.page === 'home' && m.view === 'overview:' && m.muni === mt.muni && m.mtsa.join() === mt.id && m.name.startsWith(mt.muni), `Home at ${mt.muni}, the MTSA filter on (${JSON.stringify(m)})`);
      await ev(() => { PeelApp.state.mtsa = []; PeelApp.state.muni = ''; PeelPlanAreas.renderAreaSelects(); PeelApp.applyFilters(); }); await wait(800);
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
  // (navigation phase 6: the sections of Servicing capacity, Capital and Growth in an area are Home's tabs and views)
  await check('Home\u2019s tabs are the map\u2019s: every area view\u2019s answer is its panel\u2019s or its page builder\u2019s; Open the map keeps the view', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && !document.querySelector('#home [data-pg-tab][aria-busy], #ftab-dca[aria-busy]'), null, { timeout: 150000 });
    // (navigation phase 7: the sidebar's Servicing capacity and Capital entries went; their ids are aliases)
    const side = await ev(() => [...document.querySelectorAll('#home .home-side [data-ws-page]')].map(b => b.dataset.wsPage));
    expect(!side.some(id => ['tight', 'capital', 'projects', 'eaflow'].includes(id)), `the sidebar: ${side.join()}`);
    const st = 'h => String(h || "").replace(/<[^>]+>/g, "").replace(/\\s+/g, " ").trim()';
    // (the old ids Servicing capacity and Capital open Home at their tab; the views row is the map's chips there)
    for (const [entry, key] of [['tight', 'svc:capacity'], ['capital', 'dca:timing']]) {
      await ev(id => PeelWorkspaces.openPage(id), entry); await wait(3000);
      const r = await ev(k => { const [t] = k.split(':'); return { page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), lit: (document.querySelector('#home .home-ws.on') || {}).dataset, views: [...document.querySelectorAll('#home .page-subsecs .page-sec')].map(b => b.textContent.trim()), want: PeelAnalysisTabs.chipsAt(t, 'area').map(c => PeelWorkspaces.tabPath(t, c).split(' › ')[1]) }; }, key);
      expect(r.page === 'home' && r.view === key && r.lit && r.lit.wsPage === 'home' && r.views.join() === r.want.join(), `${entry}: Home at ${key}, Home lit, its views ${r.views.join()} (${r.want.join()})`);
    }
    for (const key of ['growth:pipeline', 'svc:network', 'dca:projects', 'records:checks', 'svc:capacity', 'dca:timing', 'dca:eas', 'records:sources']) {
      const [t, c] = key.split(':');
      await page.click(`#home .page-tabs [data-pg-tab="${t}"]`); await wait(800);
      await page.click(`#home .page-subsecs [data-pg-sub="${c}"]`);
      await page.waitForFunction(() => !/^Loading/.test(((document.querySelector('#home .home-answer') || {}).textContent || '').trim()), null, { timeout: 60000 }).catch(() => {});
      await wait(1200);
      // (the page drawn and its builder or panel read in one go: the same data, no redraw between them)
      const r = await ev(([k, st]) => {
        PeelWorkspaces.renderPage(true);
        const f = eval(st), v = PeelSections.VIEWS.area[k], s = v.page ? PeelWsPages.build(v.page) : PeelSections.areaPanel(k), first = document.querySelector('#home .page-foot .pnl-acts .btn');
        return { view: PeelWorkspaces.view(), chip: ((document.querySelector('#home .page-subsecs .page-sec.on') || {}).textContent || '').trim(), name: PeelWorkspaces.chipName(...k.split(':')), page: f(document.querySelector('#home .home-answer').innerHTML), want: s ? f(s.answer) : null, builder: !!v.page, first: first ? first.textContent.trim() : null, primary: !v.page && s && s.foot && s.foot.primary ? s.foot.primary.label : null };
      }, [key, st]);
      expect(r.view === key && r.chip === r.name, `${key}: Home at it, its chip on (${r.view}, ${r.chip} / ${r.name})`);
      expect(r.want && r.page === r.want, `${key}: the page's answer is its ${r.builder ? 'page builder' : 'map panel'}'s ("${String(r.page).slice(0, 50)}" / "${String(r.want).slice(0, 50)}")`);
      if (r.primary) expect(r.first === r.primary, `${key}: its first action is the panel's own (${r.first} / ${r.primary})`);
    }
    // (EAs: the EAs, then EA to construction, its fold open from the old page id)
    await ev(() => PeelWorkspaces.openPage('eaflow')); await wait(2500);
    const ea = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), on: ((document.querySelector('#home .page-subsecs .page-sec.on') || {}).textContent || '').trim(), lit: (document.querySelector('#home .home-ws.on') || {}).dataset }));
    expect(ea.page === 'home' && ea.view === 'dca:eas' && ea.on === 'EAs' && ea.lit && ea.lit.wsPage === 'home', `the EAs page is Home › Capital › EAs (${JSON.stringify(ea)})`);
    // Open the map from a panel view: its map view, at the same tab and view.
    await page.click('#home .page-subsecs [data-pg-sub="projects"]'); await wait(2500);
    await page.locator('#home .page-foot [data-ws-go][data-ws-keep]', { hasText: 'Open the map' }).first().click(); await wait(2500);
    const m = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getDcSub() }));
    expect(m.mode === 'ws' && m.ws === 'projects' && m.tab === 'dca' && m.sub === 'projects', `Capital › Projects' Open the map: the map view at Capital › Projects (${JSON.stringify(m)})`);
  });

  // Navigation phase 2: Servicing is Capacity · Network; Allocations is a fold of Capacity with its tables and
  // CSV in the full table; the water facilities are Network's; the model checks are Records › Data checks;
  // old Servicing links (and saved views) land there.
  await check('Servicing and Records: Capacity · Network, Allocations a fold with its CSV, the model checks in Records › Data checks (the Servicing model group, Review outlets, the ⓘ link; no gear page); old Servicing links land; one System control the lens sets, in a link as sy=', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    await ev(() => { PeelWorkspaces.setMode('full'); PeelAnalysisTabs.openTab('svc', 'capacity'); }); await wait(2500);
    const chips = await ev(() => [...document.querySelectorAll('[data-svcsub]')].filter(b => b.offsetParent).map(b => b.textContent.trim()).join('|'));
    // (navigation phase 6c: Old pipes is the third, an area's)
    expect(chips === 'Capacity|Network|Old pipes', `Servicing's chips: ${chips}`);
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
    // The Servicing capacity page (Home › Servicing › Capacity, navigation phase 6): its views, and the fold under
    // its lists.
    await ev(() => PeelWorkspaces.openPage('tight')); await wait(3000);
    const pg = await ev(() => ({ view: PeelWorkspaces.view(), bar: [...document.querySelectorAll('#home .page-subsecs .page-sec')].map(b => b.textContent.trim()).join(), fold: [...document.querySelectorAll('#home details.pnl-fold summary')].some(x => x.textContent.trim().startsWith('Allocations recorded')) }));
    expect(pg.view === 'svc:capacity' && pg.bar === 'Capacity,Network,Old pipes' && pg.fold, `the Servicing capacity page (${JSON.stringify(pg)})`);
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
  await check('phone: Servicing\u2019s three chips and Records › Data checks fit, the System control and the fold in reach, no sideways scroll', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect(), null, { timeout: 120000 });
    await ev(() => { PeelWorkspaces.setMode('full'); PeelApp.setAnalysisSnap('half'); PeelAnalysisTabs.openTab('svc', 'capacity'); }); await wait(2500);
    const sv = await ev(() => {
      const row = document.querySelector('.f-subtabs[data-pane="svc"]'), h = el => Math.round(el.getBoundingClientRect().height);
      const fold = [...document.querySelectorAll('#pnl-svc details.pnl-fold > summary')].find(x => x.textContent.trim().startsWith('Allocations recorded'));
      return { fits: !!row && row.scrollWidth <= row.clientWidth, chips: [...document.querySelectorAll('[data-svcsub]')].filter(b => b.offsetParent).map(h), sys: [...document.querySelectorAll('#pnl-svc [data-sys]')].map(h), fold: fold ? h(fold) : 0 };
    });
    expect(sv.fits, 'Servicing\u2019s chip row fits the screen');
    expect(sv.chips.length === 3 && sv.chips.every(x => x >= 44), `three chips (Old pipes the third, navigation phase 6c), 44 px or taller (${sv.chips.join()})`);
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
  await check('kept from before phase 2: a stored Servicing › Checks opens Records › Data checks, DC projects’ stored Wastewater is the System; a cold svs=alloc&sy=water link opens the fold at Water for the visit; t=water&ws=hydro is Network with its lab; Sort says Soonest · Largest impact', browser, { prefs: { startScreen: 'full', footTab4: 'svc', svcSub: 'checks', dcProjSys: 'wastewater' } }, async ({ page, ev }, expect) => {
    // (the full map as the start screen, at the last tab picked: Home opens on its Overview since navigation phase 6)
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

  // Navigation phase 6c-S3 (design §3.4, §5 rows 9, 21, 104): Old pipes is Servicing › Old pipes, an area's view on Home and
  // the map, one spec (the figures, the grid, the runs), its CSV first; the amber pipes on the map while it is open, never
  // under a page; its full table every run; a cold #w=p:pipes lands there, and on a phone nothing scrolls sideways.
  await check('Servicing › Old pipes: Home’s chip and the map’s, one grid, its CSV first, the amber pipes while it is open and around a run picked; #w=p:pipes and its 6a/6b page link land; Show the sewers on the map sets the lens', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelSvcCapacity && PeelSvcCapacity.collect && PeelSvcCapacity.collect() && !document.querySelector('#ftab-svc[aria-busy]'), null, { timeout: 150000 });
    // (the amber pipes: js/workspaces.js's own polylines, not interactive, in the tight colour)
    const amber = () => ev(() => { const c = PeelUtil.token('--cap-tight'); let n = 0; PeelMapCore.map.eachLayer(l => { if (l instanceof L.Polyline && l.options.interactive === false && l.options.opacity === 0.9 && l.options.color === c) n++; }); return n; });
    const grid = sel => page.waitForFunction(q => document.querySelectorAll(`${q} table.pg td.pg-c`).length === 9, sel, { timeout: 90000 }).then(() => true, () => false);
    const txt = q => `((document.querySelector('${q}') || {}).textContent || '').replace(/\\s+/g, ' ').trim()`;
    // 1. Home › Servicing › Old pipes, by the strip: the grid (9 cells) its chart, its CSV first, no amber pipes.
    await ev(() => PeelWorkspaces.openPage('home')); await wait(1500);
    await pickView(page, ev, 'svc:pipes');
    const g1 = await grid('#home .page-chart');
    const h = await ev(t => ({ view: PeelWorkspaces.view(), views: [...document.querySelectorAll('#home .page-subsecs .page-sec')].map(b => b.textContent.trim()).join(), first: eval(t[0]), answer: eval(t[1]), lastWs: PeelUtil.store.get('lastWs', '') }), [txt('#home .page-foot .pnl-acts .btn'), txt('#home .home-answer')]);
    expect(g1 && h.view === 'svc:pipes' && h.views === 'Capacity,Network,Old pipes' && h.first === 'Export the list (CSV)' && h.lastWs === 'pipes', `Home › Servicing › Old pipes: the grid, its CSV first (${JSON.stringify({ ...h, answer: h.answer.slice(0, 40) })})`);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), page.click('#home .page-foot [data-ws-pipescsv]')]);
    expect(dl && dl.suggestedFilename() === 'peel-old-pipes.csv', `its CSV (${dl && dl.suggestedFilename()})`);
    expect(await amber() === 0, 'no amber pipes under a page');
    // 2. Open the map: the map view at Servicing › Old pipes, its panel the same answer and grid, CSV first; the amber pipes on.
    await page.locator('#home .page-foot [data-ws-go="pipes"]', { hasText: 'Open the map' }).first().click(); await wait(2500);
    const g2 = await grid('#pnl-svc .pnl-chart');
    const m = await ev(t => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), answer: eval(t[0]), first: eval(t[1]) }), [txt('#pnl-svc .pnl-answer'), txt('#pnl-svc .pnl-foot .pnl-primary')]);
    expect(g2 && m.mode === 'ws' && m.ws === 'pipes' && m.tab === 'svc' && m.sub === 'pipes' && m.first === 'Export the list (CSV)' && m.answer === h.answer, `the map view at Servicing › Old pipes, the page's answer and grid (${JSON.stringify({ ...m, answer: m.answer.slice(0, 40) })})`);
    const n = await amber(); expect(n > 0, `the amber pipes on the map (${n})`);
    // 3. Its full table: the grid, by plant and every run on the list.
    await ev(() => PeelPanel.openFull()); await wait(1500);
    const ft = await ev(() => { const p = document.getElementById('pane-svc-pipes'), e = PeelPanel.get('svc:pipes'); return { shown: !!p && p.checkVisibility(), rows: document.querySelectorAll('#pipes-body table.pipes-full tbody tr').length, cells: document.querySelectorAll('#pipes-body table.pg td.pg-c').length, want: e && e.spec && e.spec.lists ? e.spec.lists[0].total : null }; });
    expect(ft.shown && ft.cells === 9 && ft.rows > 0 && ft.rows === ft.want, `its full table: the grid and every run (${JSON.stringify(ft)})`);
    await ev(() => PeelPanel.closeFull()); await wait(600);
    // 4. The map's Capacity chip: the amber pipes go; Old pipes again, they are back; ← Page: Home at it, none.
    await page.click('.f-subtabs[data-pane="svc"] [data-svcsub="capacity"]'); await wait(1500);
    expect(await amber() === 0, 'Capacity: the amber pipes gone');
    await page.click('.f-subtabs[data-pane="svc"] [data-svcsub="pipes"]'); await wait(1500);
    expect(await amber() === n, 'Old pipes again: the amber pipes back');
    // 4b. A run picked in its panel: the pipe's result on Overview, the amber pipes kept around it and after it closes;
    // Servicing again: Old pipes, its pipes.
    await page.click('#pnl-svc .pnl-row[data-pipe]'); await wait(2500);
    const rp = await ev(() => ({ tab: PeelAnalysisTabs.getFootTab(), ss: PeelApp.state.ss || '' })), n1 = await amber();
    expect(rp.tab === 'overview' && /^pipe:/.test(rp.ss) && n1 === n, `a run picked: its pipe's result, the amber pipes kept (${JSON.stringify({ ...rp, amber: n1 })})`);
    await page.click('#scope-body .pnl-x[data-scope-result-close]'); await wait(1500);
    expect(await amber() === n, 'its result closed: the amber pipes still there');
    await page.click('#ftab-svc'); await wait(1500);
    expect(await ev(() => PeelAnalysisTabs.getSvcSub()) === 'pipes' && await amber() === n, 'Servicing again: Old pipes, its pipes');
    await page.click('#ws-bar [data-ws-backpage]'); await wait(2500);
    expect(await ev(() => PeelWorkspaces.page() === 'home' && PeelWorkspaces.view() === 'svc:pipes') && await amber() === 0, '← Page: Home › Servicing › Old pipes, no amber pipes');
    // 5. A link made in its map view before 6c (Servicing › Network, where its panel sat): the map view at Old pipes.
    await page.goto(`http://localhost:${PORT}/?p6cw#w=pipes&nav=3&t=svc&svs=network`);
    await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); await wait(2500);
    await page.waitForFunction(() => PeelAnalysisTabs.getSvcSub() === 'pipes' && document.querySelectorAll('#pnl-svc .pnl-chart table.pg td.pg-c').length === 9, null, { timeout: 90000 }).catch(() => {});
    const ol = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), at: `${PeelAnalysisTabs.getFootTab()}:${PeelAnalysisTabs.getSvcSub()}` }));
    expect(ol.mode === 'ws' && ol.ws === 'pipes' && ol.at === 'svc:pipes' && await amber() > 0, `an older #w=pipes link: the map view at Servicing › Old pipes (${JSON.stringify(ol)})`);
    // 5b. A link copied on Old pipes' page in 6a or 6b (nav=3, the map's Servicing › Network behind the page): Home at
    // Servicing › Old pipes. Show the sewers on the map (from Planning): the full map at the Wastewater lens, Servicing ›
    // Old pipes kept; back. A run there: the map view at its pipe, the amber pipes around it; ← Page: Home at Old pipes.
    await ev(() => localStorage.setItem('peel-dev:mapView', JSON.stringify('planning')));
    await page.goto(`http://localhost:${PORT}/?p6cp#w=p:pipes&nav=3&t=svc&svs=network`);
    await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); await wait(2500);
    const g4 = await grid('#home .page-chart'), pl = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), lens: PeelMapAnalysis.currentView() }));
    expect(g4 && pl.page === 'home' && pl.view === 'svc:pipes', `a link copied on the Old pipes page in 6a/6b: Home › Servicing › Old pipes (${JSON.stringify(pl)})`);
    await page.locator('#home .page-foot [data-mview="wastewater"]').first().click(); await wait(2500);
    const lens = await ev(() => ({ mode: PeelWorkspaces.mode(), lens: PeelMapAnalysis.currentView(), at: `${PeelAnalysisTabs.getFootTab()}:${PeelAnalysisTabs.getSvcSub()}` }));
    expect(pl.lens === 'planning' && lens.mode === 'full' && lens.lens === 'wastewater' && lens.at === 'svc:pipes', `Show the sewers on the map: the full map at the Wastewater lens (${JSON.stringify({ from: pl.lens, ...lens })})`);
    await page.click('#back-bar [data-ws-back]'); await wait(2500);
    expect(await ev(() => PeelWorkspaces.page() === 'home' && PeelWorkspaces.view() === 'svc:pipes'), 'the way back: Home › Servicing › Old pipes');
    await page.locator('#home [data-ws-pipe]').first().click(); await wait(3000);
    const hr = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), tab: PeelAnalysisTabs.getFootTab(), ss: PeelApp.state.ss || '' })), n2 = await amber();
    expect(hr.mode === 'ws' && hr.ws === 'pipes' && hr.tab === 'overview' && /^pipe:/.test(hr.ss) && n2 > 0, `a run on Home: the map view at its pipe, the amber pipes around it (${JSON.stringify({ ...hr, amber: n2 })})`);
    await page.click('#ws-bar [data-ws-backpage]'); await wait(2500);
    expect(await ev(() => PeelWorkspaces.page() === 'home' && PeelWorkspaces.view() === 'svc:pipes'), '← Page: Home › Servicing › Old pipes');
    // 6. A cold #w=p:pipes on a phone: Home at Servicing › Old pipes, the grid in its box, nothing scrolls sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://localhost:${PORT}/?p6c#w=p:pipes`);
    await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); await wait(2500);
    const g3 = await grid('#home .page-chart');
    const c = await ev(() => { const e = document.getElementById('home'); return { page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), doc: document.documentElement.scrollWidth, vw: innerWidth, home: e ? e.scrollWidth - e.clientWidth : -1 }; });
    expect(g3 && c.page === 'home' && c.view === 'svc:pipes' && c.doc <= c.vw && c.home <= 0, `#w=p:pipes on a phone: Home › Servicing › Old pipes, no sideways scroll (${JSON.stringify(c)})`);
  });

  // Help and This week (step 5; navigation phase 7: Reference is Help, four sections, §3.7): one Help entry (Start here,
  // How it works, the Glossary, How the app decides); the data sources and checks are Home's Records tab, Start here
  // links there; This week carries the watch list.
  await check('Help: one entry, four sections, the data sources and checks on Home’s Records tab; This week: the watch list', browser, {}, async ({ page, ev }, expect) => {
    const side = await ev(() => [...document.querySelectorAll('#home .home-side [data-ws-page]')].map(b => b.dataset.wsPage));
    expect(side.includes('help') && !side.some(id => ['reference', 'guides', 'glossary'].includes(id)), `the sidebar: ${side.join()}`);
    await page.click('#home .home-side ul [data-ws-page="help"]'); await wait(1500);
    const bar = await ev(() => ({ page: PeelWorkspaces.page(), secs: [...document.querySelectorAll('#home .page-sec')].map(b => b.textContent), lit: (document.querySelector('#home .home-ws.on') || {}).dataset, roles: document.querySelectorAll('#home .help-role').length, asks: document.querySelectorAll('#home .help-asks tbody tr').length, views: Object.keys(PeelSections.VIEWS.area).length }));
    expect(bar.page === 'help' && bar.secs.join() === 'Start here,How it works,Glossary,How the app decides' && bar.lit && bar.lit.wsPage === 'help', `Help (${bar.page}: ${bar.secs.join()})`);
    expect(bar.roles === 6 && bar.asks === bar.views + 1, `Start here: the six roles, What each tab answers a row per view of Home and a development's page (${bar.roles}, ${bar.asks} / ${bar.views})`);
    const st = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    // (navigation phase 6: the data sources and checks are Home's Records tab, Home lit; phase 7: Start here's links)
    await page.click('#home .help-page > p [data-ws-at="records:sources"]'); await wait(2000);
    const ds = await ev(() => ({ page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), lit: ((document.querySelector('#home .home-ws.on') || {}).dataset || {}).wsPage, a: document.querySelector('#home .home-answer').innerHTML, m: PeelSections.areaPanel('records:sources').answer }));
    expect(ds.page === 'home' && ds.view === 'records:sources' && ds.lit === 'home' && st(ds.a) === st(ds.m), `Data sources is Home › Records › Sources, the map's ("${st(ds.a).slice(0, 50)}", ${ds.view}, ${ds.lit})`);
    await page.click('#home .page-subsecs [data-pg-tab="records"][data-pg-sub="checks"]'); await wait(2000);
    const dc = await ev(() => ({ view: PeelWorkspaces.view(), a: document.querySelector('#home .home-answer').innerHTML, m: (PeelSections.areaPanel('records:checks') || {}).answer }));
    expect(dc.view === 'records:checks' && dc.m && st(dc.a) === st(dc.m), `Data checks is Home › Records › Data checks, the map's ("${st(dc.a).slice(0, 50)}")`);
    // (navigation phase 2: its Servicing model list, and the Review outlets row opening its page from here)
    const rl = await ev(() => ({ lists: [...document.querySelectorAll('#home .pnl-list-h h3')].map(h => h.textContent), row: !!document.querySelector('#home .pnl-row[data-ws-page="outlets"]') }));
    expect(rl.lists.includes('Servicing model') && rl.row, `Records › Data checks: the Servicing model list and Review outlets (${rl.lists.join(' | ')})`);
    // (it follows a Scenario change made with another tab open, and its Servicing model rows and See all open the
    // map's Records › Data checks full table at their comparison; navigation phase 6: the page's tab is the map's,
    // so the change is made on Home's Overview)
    await page.waitForFunction(() => PeelApp.state.svcModel && PeelApp.state.reports && PeelApp.state.plantFlows && PeelApp.state.wwEvents, null, { timeout: 120000 });
    await ev(() => PeelWorkspaces.openPage('home')); await wait(1000);
    const t0 = await ev(() => PeelAnalysisTabs.getFootTab());
    await ev(() => document.querySelector('#scen-bar [data-svcopt="ww"][data-v="design"]').click()); await wait(3000);
    await ev(() => PeelWorkspaces.openPage('data')); await wait(1000);
    await page.click('#home .page-subsecs [data-pg-sub="checks"]'); await wait(2000);
    const dz = await ev(() => { const l = [...document.querySelectorAll('#home .pnl-list')].find(x => (x.querySelector('h3') || {}).textContent === 'Servicing model'); return { view: PeelWorkspaces.view(), mode: PeelApp.state.svcModel.mode, text: l ? l.innerText.replace(/\s+/g, ' ') : '', see: !!(l && l.querySelector('.pnl-list-h button[data-at="records:checks"][data-full-table]')) }; });
    expect(t0 === 'overview' && dz.view === 'records:checks' && dz.mode === 'design' && dz.text.includes('design flows: the capacity check shows the factors'), `Records › Data checks after Design flows picked on Overview: the model's own words (${JSON.stringify({ t0, view: dz.view, mode: dz.mode, text: dz.text.slice(0, 120) })})`);
    expect(dz.see, 'its Servicing model list has See all into the full table');
    await page.click('#home .pnl-row[data-ft-go="Reported 2025 production"]'); await wait(2500);
    const dj = await ev(() => { const panes = document.getElementById('analysis-panes'), x = [...document.querySelectorAll('#svc-checks-body h3')].find(y => y.textContent.startsWith('Reported 2025 production')); const r = x && x.getBoundingClientRect(), b = panes.getBoundingClientRect(); return { mode: PeelWorkspaces.mode(), tab: PeelAnalysisTabs.getFootTab(), rs: PeelAnalysisTabs.getRSub(), on: document.getElementById('analysis').classList.contains('ft-on'), inView: !!r && r.top < b.bottom && r.bottom > b.top }; });
    expect(dj.mode === 'full' && dj.tab === 'records' && dj.rs === 'checks' && dj.on && dj.inView, `a Servicing model row on the page: the full map's Records › Data checks full table at its comparison (${JSON.stringify(dj)})`);
    await page.keyboard.press('Escape'); await wait(500);
    await ev(() => { document.querySelector('#scen-bar [data-svcopt="ww"][data-v="calibrated"]').click(); PeelWorkspaces.openPage('data'); }); await wait(2000);
    await page.click('#home .page-subsecs [data-pg-sub="checks"]'); await wait(2000);
    if (rl.row) { await page.click('#home .pnl-row[data-ws-page="outlets"]'); await wait(1500); expect(await ev(() => PeelWorkspaces.mode() === 'home' && PeelWorkspaces.page() === 'outlets'), 'its Review outlets row opens the page'); }
    // A watched development is on This week's page.
    const w = await ev(() => { const p = PeelApp.state.projects.find(q => q.units > 100 && q.phase === 'review'); PeelUtil.store.set('watch', [p.key]); PeelWorkspaces.openPage('week'); return p.title; });
    await wait(2000);
    const wl = await ev(() => [...document.querySelectorAll('#home .pnl-list-h h3, #home h3')].map(h => h.textContent).join('|') + '#' + document.querySelector('#home').innerText.includes('Your watch list'));
    const has = await ev(t => document.querySelector('#home').innerText.includes(t), w);
    expect(/true$/.test(wl) && has, `This week lists the watch list with ${w}`);
    // (navigation phase 6c: one This week spec, the page's, its map view's and Home's; its first action Open in Watch)
    const act = await ev(() => { const b = document.querySelector('#home .page-foot .pnl-acts .btn'); return b ? `${b.textContent}|${b.classList.contains('pnl-primary')}|${b.hasAttribute('data-ws-watch')}` : ''; });
    expect(act === 'Open in Watch|true|true', `This week's first action: Open in Watch (${act})`);
    await ev(() => PeelUtil.store.set('watch', []));
  });

  // Navigation phase 6c-S2 and S4 (design §3.4, §5 rows 16, 18, 63, 71-72): the map view has no task chips, so an old
  // #w=<chip> link opens its map view at the chip's tab and view with the chip's layers, once (what the reader then turns
  // on stays on); #w=week is This week's one spec, the page's, the map view's and Home's, its first action Open in Watch.
  await check('A map view without task chips: an old #w=tight link opens it with its layers, once; #w=week is This week’s one spec and Open in Watch opens the Watch tab', browser, {}, async ({ page, ev }, expect) => {
    const load = async hash => { await page.goto(`http://localhost:${PORT}/${hash}`); await page.waitForFunction(() => window.PeelApp && PeelApp.fullSnapshotReady && PeelApp.fullSnapshotReady(), null, { timeout: 240000 }); await wait(2500); };
    const st = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const layers = () => ev(() => [...PeelLayerGroups.onSet()].sort().join());
    // 1. #w=tight, cold: the map view at Servicing › Capacity with the capacity colours and the wastewater blocks only; its
    // bar is ← Page · the search · Full map, with no chip row and no source line on its panel.
    await load('?p6r1#w=tight');
    await page.waitForFunction(() => PeelAnalysisTabs.getFootTab() === 'svc' && !document.querySelector('#ftab-svc[aria-busy]'), null, { timeout: 150000 }).catch(() => {});
    await wait(1500);
    const t = await ev(() => ({ mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), tab: PeelAnalysisTabs.getFootTab(), sub: PeelAnalysisTabs.getSvcSub(), btns: [...document.querySelectorAll('#ws-bar .ws-fullbtn')].map(b => b.textContent.trim()).join(), chips: document.querySelectorAll('#ws-chips, .ws-chip, #analysis .pnl-src').length }));
    expect(t.mode === 'ws' && t.ws === 'tight' && t.tab === 'svc' && t.sub === 'capacity' && t.btns === '← Page,Full map' && !t.chips, `#w=tight: the map view at Servicing › Capacity, ← Page · Full map, no chips (${JSON.stringify(t)})`);
    const l0 = await layers();
    expect(l0 === 'bk,cap', `its layers: the capacity colours and the wastewater blocks (${l0})`);
    // 2. Once: a layer the reader turns on stays on through the map's own chips, which never re-apply the preset.
    await ev(() => PeelLayerGroups.apply(new Set([...PeelLayerGroups.onSet(), 'devs']))); await wait(500);
    await page.click('.f-subtabs[data-pane="svc"] [data-svcsub="network"]'); await wait(1200);
    await page.click('.f-subtabs[data-pane="svc"] [data-svcsub="capacity"]'); await wait(1200);
    const l1 = await layers();
    expect(l1.split(',').includes('devs') && l1.split(',').includes('cap'), `the preset is applied once: a layer turned on stays on through Network and back (${l1})`);
    // 3. #w=week with a watched development: the map view's Overview panel is the spec the page and Home read.
    const w = await ev(() => { const p = PeelApp.state.projects.find(q => q.units > 100 && q.phase === 'review'); PeelUtil.store.set('watch', [p.key]); return p.title; });
    await load('?p6r2#w=week');
    await page.waitForSelector('#pnl-overview .pnl-answer', { timeout: 60000 }); await wait(1500);
    const wk = await ev(title => {
      const s = PeelWsPages.weekSpec(), pg = PeelWsPages.build('week'), chg = (PeelWsPages.build('home').groups || []).find(g => g.title === 'Change'), tight = f => f && /tight plant/.test(f.label);
      const q = sel => [...document.querySelectorAll(`#pnl-overview ${sel}`)], first = document.querySelector('#pnl-overview .pnl-foot .pnl-acts .btn');
      return { mode: PeelWorkspaces.mode(), ws: PeelWorkspaces.current(), tab: PeelAnalysisTabs.getFootTab(), answer: (document.querySelector('#pnl-overview .pnl-answer') || {}).innerHTML, spec: s.answer, page: pg.answer,
        figs: q('.pnl-figs .pnl-fig').length, specFigs: s.figures.length, lists: q('.pnl-list-h h3').map(h => h.textContent.trim()), specLists: s.lists.map(l => l.title),
        watched: q('.pnl-list').some(l => /Your watch list/.test(l.textContent) && l.textContent.includes(title)),
        first: first ? first.textContent.trim() : '', primary: !!first && first.classList.contains('pnl-primary') && first.hasAttribute('data-ws-watch'),
        homeTight: ((chg && chg.figures) || []).filter(tight).map(f => f.v).join(), specTight: s.figures.filter(tight).map(f => f.v).join() };
    }, w);
    expect(wk.mode === 'ws' && wk.ws === 'week' && wk.tab === 'overview' && st(wk.answer) === st(wk.spec) && st(wk.spec) === st(wk.page), `#w=week: the map view's answer is the page's (${JSON.stringify({ mode: wk.mode, ws: wk.ws, tab: wk.tab, answer: st(wk.answer).slice(0, 60) })})`);
    expect(wk.figs === wk.specFigs && wk.lists.length > 0 && wk.lists.every(x => wk.specLists.includes(x)) && wk.watched, `its figures and lists are the spec's, the watch list with ${w} (${wk.figs} of ${wk.specFigs}; ${wk.lists.join(' | ')})`);
    expect(wk.first === 'Open in Watch' && wk.primary && wk.homeTight !== '' && wk.homeTight === wk.specTight, `its first action is Open in Watch; Home's Change group shows the spec's "on a tight plant" (${JSON.stringify({ first: wk.first, primary: wk.primary, home: wk.homeTight, spec: wk.specTight })})`);
    // 4. Open in Watch, on the map view and on the page: the full map with its Watch tab, the watch list in it.
    const watch = () => ev(() => ({ mode: PeelWorkspaces.mode(), on: (document.querySelector('.tabs [data-tab="week"]') || { getAttribute: () => null }).getAttribute('aria-selected'), text: (document.getElementById('tab-week') || { textContent: '' }).textContent }));
    await page.click('#pnl-overview .pnl-foot [data-ws-watch]'); await wait(1500);
    const w1 = await watch();
    expect(w1.mode === 'full' && w1.on === 'true' && w1.text.includes(w), `the map view's Open in Watch: the full map's Watch tab, the watched development in it (${w1.mode}, ${w1.on})`);
    await ev(() => PeelWorkspaces.openPage('week')); await wait(2000);
    await page.click('#home .page-foot [data-ws-watch]'); await wait(1500);
    const w2 = await watch();
    expect(w2.mode === 'full' && w2.on === 'true', `the page's Open in Watch: the same (${w2.mode}, ${w2.on})`);
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

  // Plan areas: Growth in an area and the map's plan filter ("Open the map") count the same
  // developments the same way (a straddling one by its share), for every plan, sub-area and precinct.
  // The developments table and its treemap (js/dev-table.js): grouped by plan, by stage; a tile or a
  // row under the pointer is ringed on the map; a row opens the site.
  await check('Growth in an area: the developments table, its treemap under the map, a row opens the site', browser, {}, async ({ page, ev }, expect) => {
    await ev(() => PeelWorkspaces.openPage('growth')); await wait(2000);
    expect(await ev(() => PeelWorkspaces.page() === 'home' && PeelWorkspaces.view() === 'growth:areas'), 'Growth in an area: Home › Growth › Areas');
    await page.click('#home [data-ws-drill="m:Caledon"]'); await wait(3000);
    const trail = () => ev(() => [...document.querySelectorAll('#trail .tb-step')].map(b => b.textContent.trim()));
    // (navigation phase 6: the drill is the filter; the trail shows the place)
    const cm = await ev(() => ({ muni: PeelApp.state.muni, sp: PeelApp.state.sp.slice() })), tr0 = await trail();
    expect(cm.muni === 'Caledon' && !cm.sp.length && tr0.includes('Caledon'), `the drill to Caledon is the filter, the trail has its step (${JSON.stringify(cm)}, ${tr0.join(' › ')})`);
    const t = await ev(() => ({ groups: [...document.querySelectorAll('#home .gt-gn b')].map(b => b.textContent), rows: document.querySelectorAll('#home .gt-r').length, tiles: document.querySelectorAll('#home .home-map .gtm-t[data-ws-pick]').length, over: document.querySelector('#home .gt').scrollWidth - document.querySelector('#home .gt-scroll').clientWidth }));
    expect(t.groups.includes('Caledon Station') && t.groups.includes('Not in a plan'), `grouped by plan (${t.groups.slice(0, 4).join()})`);
    expect(t.rows > 0 && t.tiles > 0, `${t.rows} rows, ${t.tiles} tiles`);
    expect(t.over <= 1, `the table fits its column (${t.over}px over)`);
    // The two-part rule: a plan (one with a development partly outside it, when Caledon has one) is the filter, its
    // planned figure its share (= PeelPlanTables.inside(), the node's); the trail ends with it; Caledon's step goes up.
    const pl = await ev(() => { const r = PeelPlanTables.compute(), st = new Set(r.straddling.flatMap(x => x.plans.map(q => q.id))), ns = [...r.nodes.values()].filter(n => n.kind === 'plan' && n.areaId && n.parent === 'm:Caledon').sort((x, y) => y.m.planned - x.m.planned); const n = ns.find(x => st.has(x.areaId)) || ns[0]; return n ? { id: n.id, area: n.areaId, planned: Math.round(n.m.planned), straddles: st.has(n.areaId) } : null; });
    if (pl) {
      await ev(id => { const b = document.querySelector(`#home [data-ws-drill="${CSS.escape(id)}"]`); if (b) b.click(); else { PeelWsPages.drillTo(id); PeelWorkspaces.renderPage(true); } }, pl.id); await wait(3500);
      const pa = await ev(() => { const ins = PeelPlanTables.inside(), fig = [...document.querySelectorAll('#home .pnl-figs .pnl-fig')].find(f => /planned/.test(f.textContent)); return { sp: PeelApp.state.sp.slice(), nm: PeelPlanAreas.areaName('sp', PeelApp.state.sp[0]), inside: ins && Math.round(ins.planned), fig: fig ? +fig.querySelector('b').textContent.replace(/[^\d]/g, '') : null }; }), tr = await trail();
      expect(pa.sp.join() === pl.area && pa.fig === pa.inside && pa.inside === pl.planned, `at the plan: the filter, planned ${pa.fig} = its share ${pa.inside} = the node's ${pl.planned} (straddles: ${pl.straddles})`);
      expect(tr[tr.length - 1] === pa.nm && tr.includes('Caledon'), `the trail: ${tr.join(' › ')}`);
      await page.locator('#trail .tb-step', { hasText: /^Caledon$/ }).first().click(); await wait(3000);
      const up = await ev(() => ({ muni: PeelApp.state.muni, sp: PeelApp.state.sp.slice(), view: PeelWorkspaces.view() }));
      expect(up.muni === 'Caledon' && !up.sp.length && up.view === 'growth:areas', `the trail's Caledon step: all of Caledon, the page kept (${JSON.stringify(up)})`);
    }
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

  // One trail (navigation phase 6, 6a-S6): the drill is the map's filter, so the top bar's trail is the way up; a
  // precinct's place in the plan tree is a step for each level. The filters besides the place are the trail's
  // "k filters": a popover lists them, each removable, Reset all clears everything, × clears the k and keeps the place;
  // the page follows each at once (its own "Filters on" row is gone).
  await check('one trail: a precinct drilled to is the filter, its plan-tree steps go up; the other filters are the trail’s k filters, each removable, × keeps the place', browser, {}, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => window.PeelPlanTables && PeelPlanTables.compute && PeelPlanTables.compute() && PeelApp.state.areas, null, { timeout: 120000 });
    // (the largest level under a plan: the Growth › Areas rows lead down to it, one level at a time)
    const pc = await ev(() => { const PT = PeelPlanTables, r = PT.compute(), n = [...r.nodes.values()].filter(x => x.areaId && x.m.planned >= 0.5 && PT.areaPath(x.areaId).length >= 2 && PT.areaPath(x.areaId).every(id => r.nodes.has(`a:${id}`))).sort((a, b) => b.m.planned - a.m.planned)[0];
      if (!n) return null; let mu = n; while (mu && mu.kind !== 'municipality') mu = r.nodes.get(mu.parent); const path = PT.areaPath(n.areaId); return { path, muni: mu && mu.name, names: path.map(id => r.nodes.get(`a:${id}`).name) }; });
    expect(!!(pc && pc.muni), `a level under a plan (${JSON.stringify(pc)})`);
    if (!pc || !pc.muni) return;
    const at = () => ev(() => { const b = document.querySelector('#trail [data-tb-filters]'), pop = document.getElementById('tb-fl-pop'), S = PeelApp.state;
      return { muni: S.muni, sp: S.sp.slice(), min: S.minUnits, newOnly: S.newOnly, view: PeelWorkspaces.view(), h1: ((document.querySelector('#home h1') || {}).textContent || '').trim(), steps: [...document.querySelectorAll('#trail .tb-step')].map(x => x.textContent.trim()),
        fl: b ? b.getAttribute('aria-label') : null, open: !!pop && !pop.hidden, exp: b ? b.getAttribute('aria-expanded') : null, chips: [...document.querySelectorAll('#tb-fl-pop [data-pf-i]')].map(x => x.textContent.replace('×', '').trim()), row: !!document.querySelector('#home .page-filters') }; });
    const step = name => page.locator('#trail .tb-step', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
    // 1. Down Growth › Areas a level at a time: the municipality, its plan, the precinct; each is the filter.
    await ev(() => PeelWorkspaces.openPage('growth')); await wait(2000);
    for (const id of [`m:${pc.muni}`, ...pc.path.map(a => `a:${a}`)]) { await page.locator(`#home [data-ws-drill="${id}"]`).first().click(); await wait(2500); }
    const leaf = pc.path[pc.path.length - 1], top = pc.names[pc.names.length - 2];
    let s = await at();
    expect(s.view === 'growth:areas' && s.muni === pc.muni && s.sp.join() === leaf && s.h1 === pc.names[pc.names.length - 1], `drilled to ${pc.names.join(' › ')}: the filter, the page at it (${JSON.stringify({ muni: s.muni, sp: s.sp, view: s.view, h1: s.h1 })})`);
    expect(s.steps.join(' › ') === ['Peel', pc.muni, ...pc.names].join(' › '), `the trail is its place in the plan tree: ${s.steps.join(' › ')}`);
    expect(!s.fl && !s.row, `no other filter: no k filters, and no Filters on row on the page (${JSON.stringify({ fl: s.fl, row: s.row })})`);
    // 2. Two other filters, set where they are set (the filter panel's own controls): the trail counts them.
    await ev(() => { const z = document.getElementById('f-size'); z.value = '10'; z.dispatchEvent(new Event('change', { bubbles: true })); const n = document.getElementById('f-new'); n.checked = false; n.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(2500);
    s = await at();
    expect(s.min === 10 && !s.newOnly && s.fl === '2 filters' && !s.open && s.exp === 'false' && s.sp.join() === leaf, `the trail: 2 filters, besides the place (${JSON.stringify({ fl: s.fl, min: s.min, newOnly: s.newOnly, sp: s.sp })})`);
    // 3. The plan's step: that level the filter, the precinct gone; the municipality and the other filters stay.
    await step(top); await wait(2500);
    s = await at();
    expect(s.sp.join() === pc.path[pc.path.length - 2] && s.muni === pc.muni && s.min === 10 && !s.newOnly && s.view === 'growth:areas' && s.h1 === top && s.steps[s.steps.length - 1] === top, `the plan's step: all of ${top}, the other filters kept, the page at it (${JSON.stringify({ sp: s.sp, min: s.min, h1: s.h1, steps: s.steps })})`);
    // 4. k filters: each one, removable; Escape closes it.
    await page.locator('#trail [data-tb-filters]').click(); await wait(800);
    s = await at();
    const box = await ev(() => { const r = document.getElementById('tb-fl-pop').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom) }; });
    expect(s.open && s.exp === 'true' && s.chips.join() === '10+ units,Including alterations' && box.l >= 0 && box.r <= 1440 && box.b <= 900, `the popover lists them, in sight (${JSON.stringify({ chips: s.chips, box })})`);
    await page.locator('#tb-fl-pop [data-pf-i="0"]').click(); await wait(2000);
    s = await at();
    expect(s.min === 0 && !s.newOnly && s.open && s.chips.join() === 'Including alterations' && s.fl === '1 filter' && s.sp.join() === pc.path[pc.path.length - 2] && s.h1 === top, `one removed: the rest listed, the place and the page kept (${JSON.stringify({ chips: s.chips, fl: s.fl, sp: s.sp, h1: s.h1 })})`);
    await page.keyboard.press('Escape'); await wait(500);
    expect(!(await at()).open, 'Escape closes the popover');
    // 5. ×: the k cleared, the place and the page kept.
    await page.locator('#trail [data-tb-filters-x]').click(); await wait(2000);
    s = await at();
    expect(s.newOnly && !s.fl && s.sp.join() === pc.path[pc.path.length - 2] && s.muni === pc.muni && s.view === 'growth:areas' && s.h1 === top, `×: the filters cleared, the place kept (${JSON.stringify({ fl: s.fl, newOnly: s.newOnly, sp: s.sp, h1: s.h1 })})`);
    // 6. The municipality's step: all of it, the plan filter gone.
    await step(pc.muni); await wait(2500);
    s = await at();
    expect(s.muni === pc.muni && !s.sp.length && s.h1 === pc.muni && s.steps.join(' › ') === `Peel › ${pc.muni}`, `the municipality's step: all of ${pc.muni} (${JSON.stringify({ sp: s.sp, h1: s.h1, steps: s.steps })})`);
    // 7. Reset all (in the popover): every filter, the place too.
    await ev(() => { const z = document.getElementById('f-size'); z.value = '10'; z.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(2000);
    await page.locator('#trail [data-tb-filters]').click(); await wait(800);
    await page.locator('#tb-fl-pop [data-pf-reset]').click(); await wait(2500);
    s = await at();
    expect(!s.muni && !s.sp.length && s.min === 0 && !s.fl && !s.open && s.steps.join() === 'Peel' && s.view === 'growth:areas', `Reset all: every filter and the place (${JSON.stringify({ muni: s.muni, min: s.min, steps: s.steps, view: s.view })})`);
  });

  // One Peel-wide note (navigation phase 6, 6a-S4): Home's Servicing and Capital below Peel say once, under the strip
  // and in the map's own words (js/svc-scope.js peelWideText), that their facilities serve all of Peel; the map says
  // the same; at Peel, and on Growth or Records, nothing. On a phone it fits.
  await check('phone: Home’s Servicing and Capital at a municipality say Peel-wide once, in the map’s words, under the strip; nothing at Peel or on Growth and Records', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
    await page.waitForFunction(() => !document.querySelector('#ftab-svc[aria-busy]') && !document.querySelector('#ftab-dca[aria-busy]'), null, { timeout: 150000 }); await wait(1500);
    const at = () => ev(() => { const st = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), kids = [...((document.querySelector('#home .page-main') || {}).children || [])], idx = sel => kids.findIndex(k => k.matches(sel)), notes = [...document.querySelectorAll('#home .page-wide')];
      return { view: PeelWorkspaces.view(), n: notes.length, text: notes[0] ? st(notes[0].innerHTML) : '', want: st(PeelSvcScope.peelWideText(...PeelWorkspaces.view().split(':'))), order: ['.page-tabs', '.page-wide', '.home-answer'].map(idx), inAnswer: /Peel-wide/.test((document.querySelector('#home .home-answer') || {}).textContent || ''), home: document.getElementById('home').scrollWidth, doc: document.documentElement.scrollWidth }; });
    const tab = async t => { await page.locator(`#home .page-tabs [data-pg-tab="${t}"]`).click(); await wait(2000); return at(); };
    let s = await tab('svc');
    expect(s.view === 'svc:capacity' && !s.n && !s.want, `at Peel, Servicing has no Peel-wide note (${JSON.stringify({ view: s.view, n: s.n })})`);
    // Brampton (Home's municipality picker, on its Overview): Servicing and Capital say it once, in the map's words.
    await tab('overview'); await page.locator('#home [data-ws-muni="Brampton"]').click(); await wait(2500);
    for (const [t, words] of [['svc', /^Peel-wide\. Plants, pumping stations, storage and pressure zones serve all of Peel/], ['dca', /^Peel-wide\. DC projects serve all of Peel/]]) {
      s = await tab(t);
      expect(s.n === 1 && words.test(s.text) && s.text === s.want && /Brampton/.test(s.text), `${t} at Brampton: one note, the map's words (${s.text.slice(0, 100)})`);
      expect(s.order[0] >= 0 && s.order[0] < s.order[1] && s.order[1] < s.order[2] && !s.inAnswer, `${t}: under the strip, before the answer, and not again in it (${JSON.stringify({ order: s.order, inAnswer: s.inAnswer })})`);
      expect(s.home <= 390 && s.doc <= 390, `${t}: no sideways scroll (${s.home}, ${s.doc})`);
    }
    // The map at the same tab (the view's Open the map) says the same, its #scope-note; ← Page, then Growth and Records
    // say nothing.
    await page.locator('#home .page-foot [data-ws-go]', { hasText: 'Open the map' }).first().click(); await wait(2500);
    const fm = await ev(() => { const st = h => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), n = document.getElementById('scope-note'); return { mode: PeelWorkspaces.mode(), tab: PeelAnalysisTabs.getFootTab(), shown: !!n && !n.hidden, text: n ? st(n.innerHTML) : '', want: st(PeelSvcScope.peelWideText('dca')) }; });
    expect(fm.mode === 'ws' && fm.tab === 'dca' && fm.shown && fm.text === fm.want, `the map's Capital says the same (${JSON.stringify({ mode: fm.mode, tab: fm.tab, shown: fm.shown })})`);
    await page.locator('#ws-bar [data-ws-backpage]').click(); await wait(2000);
    expect(await ev(() => PeelWorkspaces.view()) === 'dca:timing', '← Page: Home › Capital › DC timing');
    // Capital › EAs and Projects are the area's own (their tables filtered to Brampton): no Peel-wide note there.
    for (const v of ['eas', 'projects']) {
      await page.locator(`#home .page-subsecs [data-pg-sub="${v}"]`).click(); await wait(2000); s = await at();
      expect(s.view === `dca:${v}` && !s.n && !s.want, `Capital › ${v} at Brampton: no Peel-wide note (${JSON.stringify({ view: s.view, n: s.n })})`);
    }
    await page.locator('#home .page-subsecs [data-pg-sub="timing"]').click(); await wait(1500);
    for (const t of ['growth', 'records']) { s = await tab(t); expect(s.view.startsWith(`${t}:`) && !s.n, `${t} at Brampton: no Peel-wide note (${s.view}, ${s.n})`); }
    await tab('overview'); await page.locator('#home [data-ws-muni=""]').click(); await wait(2500);
    s = await tab('dca');
    expect(!s.n && !s.want, `back at Peel: Capital has no note (${s.n})`);
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
    // 4c. At a plan (navigation phase 6, the two-part rule): its parts, each development by its share; the footer
    // is the plan's own left to build (= Growth › Areas' node); then Brampton, then Peel again.
    const pp = await ev(() => { const r = PeelPlanTables.compute(), n = [...r.nodes.values()].filter(x => x.kind === 'plan' && x.areaId && x.children.length > 1 && x.m.left > 100).sort((x, y) => y.m.left - x.m.left)[0]; return n ? { id: n.id, area: n.areaId } : null; });
    if (pp) {
      await ev(x => { PeelApp.state.sp = [x]; PeelPlanAreas.renderAreaSelects(); PeelApp.applyFilters(); }, pp.area);
      await page.waitForFunction(() => { const th = document.querySelector('#pnl-growth #pnl-by-period .ldg-table thead th'); return th && th.textContent === 'Part of the plan'; }, null, { timeout: 60000 }).catch(() => {});
      await wait(800);
      const pr = await ev(id => { const n = s => +String(s).replace(/[^\d]/g, ''), t = document.querySelector('#pnl-growth #pnl-by-period .ldg-table'), nd = PeelPlanTables.compute().nodes.get(id); return { head: t.querySelector('thead th').textContent, total: n(t.querySelector('tfoot td:last-child strong').textContent), node: nd ? Math.round(nd.m.left) : null }; }, pp.id);
      expect(pr.head === 'Part of the plan' && pr.node != null && Math.abs(pr.total - pr.node) <= 1, `at a plan: its parts, the footer its own left to build (${JSON.stringify(pr)})`);
      await ev(() => { PeelApp.state.sp = []; PeelPlanAreas.renderAreaSelects(); PeelApp.applyFilters(); });
    }
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
    // (navigation phase 6: Home opens on its Overview, and the map with it, so the page is Home's Growth from its strip,
    // the Forecast kept: the page draws the same By period, shut as the reader left it)
    await ev(() => PeelWorkspaces.openPage('home')); await wait(500);
    await page.click('#home .page-tabs [data-pg-tab="growth"]'); await wait(800);
    expect(await ev(() => PeelWorkspaces.view() === 'growth:timing' && !!document.querySelector('#home .page-lead') && !document.querySelector('#home .page-lead[open]')), 'Home › Growth › Forecast: By period shut, as the reader left it');
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

  // What's coming (navigation phase 3; Home › Growth › Forecast under the Forecast's question since phase 6),
  // opened with By period; a fold the reader shut on the Forecast page stays shut when the page rebuilds; the page's own
  // developments list moved to the Forecast's full table (one tap), which opens on the map.
  await check('phone: What’s coming opens Home › Growth › Forecast at By period; no sideways scroll (the page, the full table, the map’s panel); a cut-off works; the developments in the full table', browser, { w: 390, h: 844 }, async ({ page, ev }, expect) => {
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
    // 2. What's coming: Home › Growth › Forecast (navigation phase 6), By period first and open, under the
    // Forecast's question, in the first screen and above the figures; Home lit.
    await ev(() => PeelWorkspaces.openPage('coming'));
    await page.waitForSelector('#home #pnl-by-period[open] .ldg-table', { timeout: 30000 }); await wait(1500);
    const s = await ev(() => { const sum = document.querySelector('#home #pnl-by-period > summary').getBoundingClientRect(), hm = document.getElementById('home'), figs = document.querySelector('#home .pnl-figs'); return { w: document.documentElement.scrollWidth, vw: innerWidth, hw: hm.scrollWidth, hc: hm.clientWidth, h1: document.querySelector('#home h1').textContent, sum: Math.round(sum.height), top: Math.round(sum.top), figs: figs ? Math.round(figs.getBoundingClientRect().top) : null, lead: !!document.querySelector('#home .page-lead#pnl-by-period'), vh: innerHeight, disc: (document.querySelector('#home #pnl-by-period .ldg-table caption') || {}).textContent || '', lit: ((document.querySelector('#home .home-ws.on') || {}).dataset || {}).wsPage, page: PeelWorkspaces.page(), view: PeelWorkspaces.view() }; });
    expect(s.page === 'home' && s.view === 'growth:timing' && s.h1 === 'When do the homes and people arrive?', `Home › Growth › Forecast under the Forecast's question (${s.page}, ${s.view}: ${s.h1})`);
    expect(s.lead && s.top < s.vh && (s.figs == null || s.top < s.figs), `By period leads: in the first screen, above the figures (${s.top} of ${s.vh}; figures at ${s.figs})`);
    expect(s.w <= s.vw && s.hw <= s.hc, `no sideways scroll (document ${s.w}/${s.vw}, page ${s.hw}/${s.hc})`);
    expect(s.sum >= 44, `By period's summary is a 44 px target (${s.sum})`);
    expect(/Public-data estimate\. Not the Region’s committed capacity ledger\./.test(s.disc), 'the table carries the disclaimer');
    expect(s.lit === 'home', `Home lit in the menu (${s.lit})`);
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
  await check('kept from before phase 3: a stored Growth › Ledger opens the Forecast at By period with its cut-off, people and sort; the cut-off is the table’s own, never the Scenario’s Count; cold gs=ledger and What’s coming links open a shut By period for the visit', browser, { prefs: { startScreen: 'full', footTab4: 'growth', gSub: 'ledger', ledgerCut: 'approved', ledgerMeasure: 'people', ledgerSort: 'year' } }, async ({ page, ev }, expect) => {
    // (the full map as the start screen: it opens at the last tab picked; Home opens on its Overview since
    // navigation phase 6, so a start on Home would not read footTab4 here)
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
    const wc = await ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), h1: document.querySelector('#home h1').textContent, kept: PeelUtil.store.get('ledgerOpen', true) }));
    expect(wc.mode === 'home' && wc.page === 'home' && wc.view === 'growth:timing' && wc.h1 === 'When do the homes and people arrive?' && wc.kept === false, `w=p:coming opened cold: Home › Growth › Forecast, By period open (${JSON.stringify(wc)})`);
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
  // the project's card on the map (its dcwork: scope) and the project in place on Home's Capital tab, with its map;
  // Home's DC projects late opens it at Late.
  await check('Capital › DC timing: one list with both verdicts, Late filters it, a row opens the project’s card on the map and the project in place on Home’s Capital tab with its map; the Funding lab inside it; Home’s DC projects late opens it at Late', browser, {}, async ({ page, ev }, expect) => {
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
    // Late filters the list: the DC projects late, then the late reliefs that are no DC line (a plant expansion);
    // the header, the late figure and the Late chip count them all (at System Both, Home's number).
    if (await ev(() => !!document.querySelector('#pnl-dca .dcp-status [data-dc-status="gap"]'))) {
      await page.click('#pnl-dca .dcp-status [data-dc-status="gap"]'); await wait(1000);
      const l = await ev(() => { const n = s => +((s || {}).textContent || '').replace(/\D/g, '');
        return { metas: [...document.querySelectorAll('#pnl-dca .pnl-list .pnl-row .pnl-r-meta')].map(m => m.textContent), fig: n(document.querySelector('#pnl-dca .pnl-fig[data-dc-status="gap"] b')),
          chip: n(document.querySelector('#pnl-dca .dcp-status [data-dc-status="gap"]')), head: ((document.querySelector('#pnl-dca .pnl-head .pnl-chip') || {}).textContent || '').trim(),
          n: PeelDcCost.dcAnalysis().list.filter(r => r.rec === 'advance').length, status: PeelDcProjects.state.status }; });
      expect(l.status === 'gap' && l.metas.length > 0 && l.metas.every(t => /in service after it runs out/.test(t)), `Late: every row is late (${l.metas.length} rows)`);
      expect(l.fig === l.n && l.chip === l.n && new RegExp(`^${l.n} late`).test(l.head), `the late figure, the Late chip and the header count every relief late (${l.fig} / ${l.chip} / "${l.head}" / ${l.n})`);
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
    // The Capital page (Home › Capital, navigation phase 6): DC timing is its first view; a project opens in place
    // with its map; the views row's DC timing returns to the list.
    await ev(() => { PeelLabs.set('funding', false); PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage('projects'); }); await wait(1500);
    const bar = await ev(() => ({ view: PeelWorkspaces.view(), bar: [...document.querySelectorAll('#home .page-subsecs .page-sec')].map(b => b.textContent.trim()).join('|'), want: PeelAnalysisTabs.chipsAt('dca', 'area').map(c => PeelWorkspaces.chipName('dca', c)).join('|') }));
    expect(bar.view === 'dca:timing' && bar.bar === bar.want && bar.bar === 'DC timing|EAs|Projects', `Home › Capital's views (${bar.view}: ${bar.bar})`);
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
    await page.click('#home .page-subsecs [data-pg-sub="timing"]'); await wait(1500);
    expect(await ev(() => !!document.querySelector('#home [data-dcproj-open]') && !document.querySelector('#home [data-dcproj-back]')), 'the views row’s DC timing: the list again');
    // Home's DC projects late: every relief late (the analysis itself); a tap opens the Capital page's DC timing
    // section at Late, even where the page was left on its Projects section; its header, late figure and Late chip
    // say Home's number (at System Both: Home never filters) and the list shows the late ones. The workbook's
    // filter is untouched.
    await page.click('#home .page-subsecs [data-pg-sub="projects"]'); await wait(1500);
    expect(await ev(() => PeelWorkspaces.view() === 'dca:projects' && ((document.querySelector('#home .page-subsecs .page-sec.on') || {}).textContent || '').trim() === 'Projects'), 'Home’s Capital left on its Projects view');
    await ev(() => { PeelAnalysisTabs.setSys('both'); PeelWorkspaces.openPage('home'); }); await wait(2500);
    const h = await ev(() => ({ v: +(((document.querySelector('#home .pnl-fig[data-dc-status="gap"] b') || {}).textContent || '').replace(/\D/g, '')), n: PeelDcCost.dcAnalysis().list.filter(r => r.rec === 'advance').length, f: PeelMasterPlan.dcnFilter }));
    expect(h.v === h.n, `Home's DC projects late is the analysis' (${h.v} / ${h.n})`);
    await page.click('#home .pnl-fig[data-dc-status="gap"]'); await wait(2500);
    const hl = await ev(() => { const n = s => +((s || {}).textContent || '').replace(/\D/g, ''), H = document.getElementById('home');
      return { page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), status: PeelDcProjects.state.status, sec: ((H.querySelector('.page-subsecs .page-sec.on') || {}).textContent || '').trim(),
        fig: n(H.querySelector('.pnl-fig[data-dc-status="gap"] b')), chip: n(H.querySelector('.dcp-status [data-dc-status="gap"]')), rows: H.querySelectorAll('.pnl-list .pnl-row').length,
        also: /Also late, with no DC line/.test((H.querySelector('.home-answer') || {}).textContent || ''),
        other: PeelDcCost.dcAnalysis().list.filter(r => r.rec === 'advance' && !/^ln:/.test(r.key)).length, f: PeelMasterPlan.dcnFilter }; });
    expect(hl.page === 'home' && hl.view === 'dca:timing' && hl.status === 'gap' && hl.sec === 'DC timing', `Home › Capital › DC timing, Late (${hl.page}, ${hl.view}, ${hl.status}, ${hl.sec})`);
    expect(hl.fig === h.v && hl.chip === h.v && (h.v === 0 || hl.rows > 0), `its late figure and Late chip are Home's, the list shows them (${hl.fig} / ${hl.chip} / ${hl.rows} rows / ${h.v})`);
    expect(!hl.other || hl.also, 'the answer names the late reliefs that are no DC line');
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
  // page, Home › Capital › EAs is its page (the EAs, then EA to construction).
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
    // 5. The EAs page: Home › Capital › EAs (navigation phase 6), the EAs then EA to construction; the EAs built
    // there when the map has none.
    await ev(() => { PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage('eaflow'); }); await wait(2500);
    const pg = await ev(() => ({ view: PeelWorkspaces.view(), on: ((document.querySelector('#home .page-subsecs .page-sec.on') || {}).textContent || '').trim(), lists: [...document.querySelectorAll('#home .pnl-list-h h3')].map(h => h.textContent.trim()), rows: document.querySelectorAll('#home .eat-row').length }));
    expect(pg.view === 'dca:eas' && pg.on === 'EAs', `Home › Capital › EAs (${pg.view}, ${pg.on})`);
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
    // The Capital page and the EAs page (Home › Capital › DC timing and › EAs since navigation phase 6).
    for (const [id, key] of [['projects', 'dca:timing'], ['eaflow', 'dca:eas']]) {
      await ev(id => { PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage(id); }, id); await wait(2500);
      const p = await ev(() => { const hm = document.getElementById('home'); return { view: PeelWorkspaces.view(), home: hm.scrollWidth <= hm.clientWidth, doc: document.documentElement.scrollWidth <= innerWidth, rows: [...document.querySelectorAll('#home .eat-row')].map(el => Math.round(el.getBoundingClientRect().height)) }; });
      expect(p.view === key && p.home && p.doc, `the ${id} page: Home at ${key}, no sideways scroll (${JSON.stringify({ view: p.view, home: p.home, doc: p.doc })})`);
      if (id === 'eaflow') expect(p.rows.length > 0 && p.rows.every(x => x >= 44), `the EAs page's timeline rows, 44 px (${p.rows.slice(0, 4).join()})`);
    }
  });

  // Navigation phase 4's old links and stored picks (navigation-design §7.1–7.3): what an earlier release stored
  // (the DC projects chip, its sort, the project it had open) and linked to (dcs=dcproj, dcs=funding, the EA to
  // construction chip and page, the DC projects page, a DC project's ss=dcwork:) land on DC timing, EAs and the card.
  await check('kept from before phase 4: a stored DC projects chip opens DC timing at its stored sort, never its stored project; cold dcs=dcproj and dcs=funding links open DC timing (the funding one with its lab and fold); #w=eaflow opens Capital › EAs at EA to construction; the DC projects and EA to construction pages; ss=dcwork: opens the project’s card', browser, { prefs: { startScreen: 'full', footTab4: 'dca', dcSub: 'dcproj', dcProjSort: 'affected', dcProjSel: 'wastewater:26-2242' } }, async ({ page, ev }, expect) => {
    // (the full map as the start screen, at the last tab picked: Home opens on its Overview since navigation phase 6)
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
    // (navigation phase 6: the pages are Home's Capital tab, their views the views row's)
    const bar = () => ev(() => ({ mode: PeelWorkspaces.mode(), page: PeelWorkspaces.page(), view: PeelWorkspaces.view(), on: ((document.querySelector('#home .page-subsecs .page-sec.on') || {}).textContent || '').trim(), lists: [...document.querySelectorAll('#home .pnl-list-h h3')].map(h => h.textContent.trim()) }));
    await load('?page#w=p:eaflow', '#home .eat-row');
    const ep = await bar();
    expect(ep.mode === 'home' && ep.page === 'home' && ep.view === 'dca:eas' && ep.on === 'EAs' && ep.lists.includes('Current EAs') && ep.lists.includes('Complete, waiting for construction (oldest first)'), `w=p:eaflow: Home › Capital › EAs, with EA to construction (${JSON.stringify(ep)})`);
    await load('?projects#w=p:projects', '#home [data-dcproj-open]');
    const cp = await bar();
    expect(cp.mode === 'home' && cp.page === 'home' && cp.view === 'dca:timing' && cp.on === 'DC timing', `w=p:projects: Home › Capital › DC timing, the list (${JSON.stringify({ mode: cp.mode, page: cp.page, view: cp.view, on: cp.on })})`);
    // A DC project's link: its card on the Overview, the developments relying on it by tier once worked out.
    await load(`?work#ss=dcwork:${m.k}`);
    const got = await page.waitForFunction(k => PeelApp.state.ss === `dcwork:${k}` && !!document.querySelector('#scope-body tr.ld-row[data-dev]'), m.k, { timeout: 120000 }).then(() => true, () => false);
    const wk = await ev(() => { const b = document.getElementById('scope-body'); return { mode: PeelWorkspaces.mode(), ss: PeelApp.state.ss, tab: PeelAnalysisTabs.getFootTab(), answer: ((b && b.querySelector('.pnl-answer')) || {}).textContent || '', tiers: [...(b ? b.querySelectorAll('caption') : [])].some(x => /relying on it, by tier/.test(x.textContent)), trail: [...document.querySelectorAll('#trail .tb-step')].map(x => x.textContent.trim()) }; });
    expect(got && wk.mode === 'full' && wk.tab === 'overview' && wk.tiers, `ss=dcwork:${m.k} opened cold: its card, the developments by tier (${JSON.stringify({ mode: wk.mode, ss: wk.ss, tab: wk.tab, tiers: wk.tiers })})`);
    expect(/rel(y|ies) on it/.test(wk.answer) && wk.trail.includes('DC timing'), `its headline names both verdicts, its trail DC timing ("${wk.answer.slice(0, 120)}"; ${wk.trail.join(' › ')})`);
  });

  // Task 8 (navigation-design §6.1, §3.5): the developments relying on a DC project in two clicks on the map,
  // Capital (DC timing is its first view) and a row: the project's card lists every one by tier, and a row of it
  // opens the development; a row of the list in full opens the same card; on Home's Capital tab the project opens
  // in place, five a tier, See all lists the rest there.
  await check('the developments relying on a DC project in two clicks (task 8): Capital, a row; its card lists every one by tier and opens one; the list in full opens the same card; on Home’s Capital tab See all lists every one in place', browser, {}, async ({ page, ev }, expect) => {
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
    // The Capital page (Home › Capital › DC timing, navigation phase 6): the project in place, its tiers five rows
    // each; See all lists the rest there, Show fewer shuts it.
    await ev(() => { PeelWorkspaces.setMode('home'); PeelWorkspaces.openPage('projects'); }); await wait(2500);
    expect(await ev(() => PeelWorkspaces.page() === 'home' && PeelWorkspaces.view() === 'dca:timing'), 'the Capital page: Home › Capital › DC timing');
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
    // (navigation phase 7, owner decision 5: a tool page, no sidebar entry; the QA/QC role's first shortcut)
    const side = await ev(() => [...document.querySelectorAll('#home .home-side [data-ws-page]')].map(b => b.dataset.wsPage));
    expect(!side.includes('outlets'), `with no role Review outlets is not in Home's sidebar (${side.join()})`);
    await ev(() => { PeelUtil.store.set('role', 'qa'); PeelWorkspaces.openPage('home'); }); await wait(1500);
    const qa = await ev(() => [...document.querySelectorAll('#home .home-side .home-short')].map(b => b.textContent.trim()).join('|'));
    expect(qa === 'Review outlets|Records › Data checks|Records › Sources', `For your role (QA/QC): ${qa}`);
    await page.locator('#home .home-side .home-short', { hasText: 'Review outlets' }).first().click();
    await page.waitForSelector('#home [data-dvo="start"]', { timeout: 120000 }); await wait(800);
    expect(await ev(() => PeelWorkspaces.page()) === 'outlets', 'its shortcut opens Review outlets');
    await ev(() => { PeelUtil.store.set('role', ''); PeelWorkspaces.renderPage(true); }); await wait(500);
    // A site's path to it (AD-5): with the DC impact model worked out (this page built it), a queued
    // development's Overview has "Review →" in its Path to the plant row; it opens the editor at it. A
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
  console.log(`\n${results.length - bad} of ${results.length} browser paths pass${SHARDS > 1 ? ` (shard ${SHARD} of ${SHARDS}, ${nth} paths in all)` : ''}`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
