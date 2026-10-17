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

async function open(browser, { w = 1440, h = 900, fresh = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
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

  await browser.close(); srv.close();
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name} (${(r.ms / 1000).toFixed(1)} s)${r.ok ? '' : `\n       - ${r.fails.join('\n       - ')}`}`);
  const bad = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - bad} of ${results.length} browser paths pass`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
