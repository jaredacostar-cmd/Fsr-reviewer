'use strict';
/* The DC servicing gate in the app (js/dc-gate.js): chip words, the filter, the city record links. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/dc-gate.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('chip words: each city\'s own name for the permit', () => {
  assert.equal(G.chipText({ bucket: 'counted', municipality: 'Mississauga', servicingApplied: '2025-05-01' }), 'Site Servicing permit · applied 2025-05-01');
  assert.equal(G.chipText({ bucket: 'counted', municipality: 'Brampton' }), 'Site Service permit');
  assert.equal(G.chipText({ bucket: 'none', municipality: 'Caledon' }), 'No Site Services permit');
  assert.equal(G.chipText({ bucket: 'private', municipality: 'Caledon' }), 'Septic permit: private servicing');
  assert.equal(G.chipText({ bucket: 'none', municipality: 'Brampton', septicReview: true }), 'No Site Service permit · septic on site, check');
  assert.equal(G.chipText(null), '');
});

test('filter: a bucket, or every bucket but counted', () => {
  assert.ok(G.passes({ bucket: 'counted' }, 'counted'));
  assert.ok(!G.passes({ bucket: 'none' }, 'counted'));
  assert.ok(G.passes({ bucket: 'permitNoSvc' }, 'notcounted'));
  assert.ok(!G.passes({ bucket: 'counted' }, 'notcounted'));
  assert.ok(!G.passes(null, 'counted'), 'out of the DC pipeline: not shown under a DC filter');
  assert.ok(G.passes(null, ''));
  for (const [k] of G.FILTER) assert.ok(G.FILTER_KEYS.has(k));
});

test('city record queries: one permit, by number, without people fields', () => {
  const u = new URL(G.recordQuery('bra-permits', "26-103103-000-00"));
  assert.match(u.pathname, /Building_Permits\/MapServer\/0\/query$/);
  assert.equal(u.searchParams.get('where'), "PERMITNUMBER='26-103103-000-00'");
  assert.equal(u.searchParams.get('f'), 'json');
  for (const s of Object.values(G.SOURCES)) for (const f of s.fields) assert.ok(!/BUILDER|CONTRACTOR|OWNER|APPLICANT|AGENT|FOLDERNAME|PROPCOMMENT/i.test(f), f);
  assert.equal(new URL(G.recordQuery('mis-permits', 'DRAIN 1', 'link')).searchParams.get('f'), 'html');
  assert.equal(new URL(G.recordQuery('cal-permits', '2026-1', 'link')).searchParams.get('f'), 'pjson', 'Caledon blocks the HTML page');
  assert.equal(new URL(G.recordQuery('mis-permits', "O'B")).searchParams.get('where'), "BP_NO='O''B'");
  assert.equal(G.recordQuery('nope', 'x'), null);
});

test('wired in: header chip, filter select, share link, offline shell', () => {
  assert.match(src('js/panel.js'), /if \(DG\) \{ h\.badge \+= DG\.chipHTML\(p\); h\.extra \+= DG\.boxHTML\(p\); \}/);
  assert.match(src('index.html'), /<select id="f-dcgate"/);
  assert.match(src('index.html'), /<script src="js\/dc-gate\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('js/app.js'), /window\.PeelDcGate\.passes\(window\.PeelDcGate\.rowOf\(p\), state\.dcgate\)/);
  assert.match(src('js/share.js'), /set\('dg', App\(\)\.state\.dcgate\)/);
  assert.match(src('sw.js'), /'js\/dc-gate\.js',/);
});
