'use strict';
// How is this worked out? Every figure has a "?" that opens its working: the rule, the inputs with
// their values and sources, and the data files it reads (js/how.js). A development's units, people
// and flows and Servicing's capacity counts carry their exact working; every other figure opens its
// panel's method and the data files its panel reads, so every panel and page needs a FILES entry.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('../js/how.js');
const D = require('../js/demand.js');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const reg = JSON.parse(src('data/sources.json'));

test('every panel the app sets and every page it builds has the data files it reads', () => {
  const keys = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))) {
    for (const m of src(`js/${f}`).matchAll(/(?:PN|PeelPanel|Panel|PN\(\))\.set\(\s*['`]([a-z]+:[a-z-]*)['`]/g)) keys.add(m[1]);
  }
  for (const k of ['records:sources', 'records:checks', 'overview:result']) keys.add(k);
  // (navigation phases 2 and 4 retired svc:alloc, svc:checks and dca:dcproj: the scan must still find every panel)
  for (const k of ['overview:', 'growth:pipeline', 'growth:areas', 'growth:timing', 'svc:capacity', 'svc:network', 'dca:timing', 'dca:projects', 'dca:eas', 'records:files']) assert.ok(keys.has(k), `${k} found`);
  assert.ok(keys.size >= 13, `${keys.size} panel keys found`);
  for (const k of keys) assert.ok(H.filesFor(k), `panel ${k}: add its data files to FILES in js/how.js`);
  const build = /const BUILD = \{([^}]+)\}/.exec(src('js/ws-pages.js'))[1].split(',').map(s => s.trim()).filter(Boolean);
  for (const id of build) assert.ok(H.filesFor(id), `page ${id}: add its data files to FILES in js/how.js`);
});

test('every data file named has a receipt (data/sources.json)', () => {
  for (const [k, files] of Object.entries(H.FILES)) for (const f of files) assert.ok(reg.files[f], `${k}: data/${f} has no receipt`);
});

// A development: 100 townhouses and 200 apartments on 2 ha.
const P = { units: 300, unitMix: { town: 100, apartment: 200 }, types: [], description: '', siteAreaHa: 2, phase: 'review', records: [] };
const pe = D.estimate([P], D.DEFAULT_CRITERIA);

test('people: units by type × persons per unit, each line adds up to the total', () => {
  const h = H.people(pe, D.DEFAULT_CRITERIA);
  assert.equal(h.inputs.length, 2);
  assert.match(h.inputs[0].value, /^100 units × 3\.40 = 340 people$/);
  assert.deepEqual(h.inputs[0].src, { doc: 'linear-ww', where: 'Tables 2-1 / 2-2' });
  assert.match(h.rule, new RegExp(`Total ${Math.round(pe.population).toLocaleString('en-CA')} people`));
});

test('water, maximum day: the arithmetic shown gives the figure', () => {
  const h = H.water(pe, D.DEFAULT_CRITERIA);
  const avg = pe.population * 270 / 86400;
  assert.match(h.inputs[0].value, new RegExp(`× 270 L/cap/d ÷ 86,400 = ${avg.toFixed(2)} L/s`));
  assert.match(h.inputs[1].value, new RegExp(`× 1\\.80 = ${(avg * 1.8).toFixed(2)} L/s`));
  assert.match(h.rule, new RegExp(`${(Math.round(pe.combined.water.maxDay * 10) / 10).toFixed(1)} L/s`));
});

test('wastewater, peak wet weather: average × Harmon + I&I, each part with its section', () => {
  const h = H.wastewater(pe, D.DEFAULT_CRITERIA), ww = pe.wastewater;
  assert.equal(h.inputs.length, 3);
  assert.match(h.inputs[1].value, new RegExp(`= ${ww.peakingFactor.toFixed(2)}; peak ${ww.peak.toFixed(2)} L/s`));
  assert.match(h.inputs[2].label, /I&I on 2\.00 ha \(application boundary\)/);
  assert.match(h.inputs[2].value, /2\.00 ha × 0\.26 L\/s\/ha = 0\.52 L\/s/);
  assert.deepEqual(h.inputs.map(i => i.src.where), ['s. 2.2', 's. 2.4', 's. 2.5']);
  assert.ok(Math.abs(ww.peak + ww.infiltration - pe.combined.wastewater.wetPeak) < 1e-9);
});

test('units: the rule that picked the count and each file that states one, with its record', () => {
  const r1 = { kind: 'application', ref: 'OZ 24-15', units: 3162, type: 'Rezoning', sourceId: 'mis-devapps/6', uid: 'mis-devapps/6:22' };
  const r2 = { kind: 'application', ref: 'SP 25-1', units: 1200, type: 'Site plan' };
  const h = H.units({ records: [r2, r1], buildout: { basis: 'master', planned: 3162, permitted: 0 } });
  assert.match(h.rule, /largest unit count stated on the rezoning/);
  assert.equal(h.inputs[0].src.rec, r1, 'the largest first');
  assert.match(h.inputs[0].value, /^3,162 units$/);
  assert.match(H.units({ records: [], buildout: {} }).rule, /No file on the site states a unit count/);
  assert.match(H.units({ records: [r1], unitsLost: 4, buildout: { basis: 'master', planned: 3162, permitted: 3200 } }).rule, /permits are the total.*demolished/);
});

test('capacity: the facilities a count holds, each load ÷ capacity with its basis', () => {
  const row = (name, pctBo, basis = 'design') => ({ name, sub: 'pumping station', sys: 'ww', unit: 'L/s', cap: 100, capWord: 'firm', basis, existing: 50, built: 60, committed: 70, buildout: pctBo, pctBo });
  const rows = [row('A', 120), row('B', 95, 'metered'), row('C', 40)];
  const over = H.capacityCount(rows, 100), tight = H.capacityCount(rows, 90, 100);
  assert.deepEqual(over.inputs.map(i => i.label), ['A · pumping station']);
  assert.match(over.inputs[0].value, /^120 L\/s at build-out \(Peel design criteria\) ÷ 100 L\/s firm = 120%$/);
  assert.deepEqual(tight.inputs[0].src, { file: 'ww-facilities.json' }, 'the source is where the capacity comes from');
  assert.deepEqual(H.capSrc({ kind: 'plant', sys: 'ww' }), { file: 'peel-reports.json' });
  assert.deepEqual(H.capSrc({ kind: 'storage', sys: 'water' }), { file: 'water-facilities.json' });
  assert.deepEqual(H.capSrc({ kind: 'pipe', sys: 'ww' }), { file: 'sewers.json' });
  assert.match(over.rule, /1 of 3/);
  const one = H.capacityRow(rows[0]);
  assert.deepEqual(one.inputs.map(i => i.value), ['50 L/s', '10 L/s', '10 L/s', '50 L/s', '100 L/s']);
  assert.deepEqual(one.inputs[4].src, { file: 'ww-facilities.json' });
});

test('the box: the working, its sources linked, the data files with their receipts; without working, the panel method', () => {
  const rec = { kind: 'application', ref: 'OZ 24-15', units: 3162, sourceId: 'mis-devapps/6' };
  const entry = { fig: { v: '3,162', u: 'units', label: 'planned' }, how: H.units({ records: [rec], buildout: { basis: 'master' } }), files: ['snapshot.json'] };
  const ctx = { recUrl: r => (r === rec ? 'https://x/FeatureServer/6/22?f=html' : null), docs: { 'linear-ww': { title: 'Linear Wastewater Standards', url: 'https://peel/lww.pdf' } },
    receipts: [{ file: 'snapshot.json', title: 'Planning applications and building permits', asOf: '2026-10-19', dateMeaning: 'pulled', links: [{ label: 'Layer', url: 'https://x/FeatureServer' }] }], criteria: 'Peel design criteria' };
  const h = H.boxHTML(entry, ctx);
  assert.match(h, /<strong>3,162 units<\/strong> planned/);
  assert.match(h, /<a href="https:\/\/x\/FeatureServer\/6\/22\?f=html"[^>]*>Record ↗<\/a>/);
  assert.match(h, /Planning applications and building permits<\/strong> <small><code>data\/snapshot\.json<\/code> · pulled 2026-10-19/);
  assert.match(h, /data-src-cite="snapshot\.json"/);
  const ppl = H.boxHTML({ fig: { v: 1, u: 'people', label: 'x' }, how: H.people(pe, D.DEFAULT_CRITERIA) }, ctx);
  assert.match(ppl, /<a href="https:\/\/peel\/lww\.pdf"[^>]*>Linear Wastewater Standards, Tables 2-1 \/ 2-2 ↗<\/a>/);
  const fb = H.boxHTML({ fig: { v: 4, u: 'over', label: 'over capacity' }, method: 'Committed = existing + built…', sources: 'Annual reports', files: ['servicing.json'] }, {});
  assert.match(fb, /How this panel works it out<\/span>Committed = existing/);
  assert.match(fb, /<code>data\/servicing\.json<\/code>/, 'receipts not loaded: the files are still named');
  const cap = H.boxHTML({ fig: { v: 8, u: 'over', label: 'x' }, how: H.capacityCount([{ name: 'A', sys: 'ww', kind: 'ps', unit: 'L/s', cap: 1, capWord: 'firm', basis: 'design', buildout: 2, pctBo: 200 }], 100) },
    { receipts: [{ file: 'ww-facilities.json', title: 'WW', links: [{ label: '2020 Master Plan, Volume 4: Table 6', url: 'https://peel/mp4.pdf' }] }] });
  assert.match(cap, /<a href="https:\/\/peel\/mp4\.pdf"[^>]*title="data\/ww-facilities\.json">2020 Master Plan, Volume 4: Table 6 ↗<\/a>/, 'a data file source links its document');
  const t = H.citeText(entry, ctx);
  assert.match(t, /^3,162 units planned\nWorked out: The largest unit count/);
  assert.match(t, /- OZ 24-15: 3,162 units \[https:\/\/x\/FeatureServer\/6\/22\?f=html\]/);
  assert.match(t, /Data: data\/snapshot\.json \(2026-10-19\)/);
});

test('every figure gets its "?" in panels and pages, under a fixed id (a re-render is unchanged)', () => {
  globalThis.PeelHow = H;
  const PN = require('../js/panel.js');
  const PNapi = PN.html ? PN : globalThis.PeelPanel;
  const spec = { key: 'svc:capacity', head: { name: 'x' }, answer: 'a', figures: [{ v: 1, u: 'over', label: 'over' }, { v: 2, u: 'tight', label: 'tight', how: { rule: 'r', inputs: [] } }], method: 'm' };
  const a = PNapi.html(spec), b = PNapi.html(spec);
  assert.equal(a, b);
  assert.match(a, /data-how="svc:capacity#0"/);
  assert.match(a, /data-how="svc:capacity#1"/);
  assert.equal(H.REG.get('svc:capacity#1').how.rule, 'r');
  assert.deepEqual(H.REG.get('svc:capacity#0').files, H.filesFor('svc:capacity'));
  delete globalThis.PeelHow;
  assert.match(src('js/ws-pages.js'), /figHTML\(f, gl, \{ key: `page:\$\{m\.id\}`, files: root\.PeelHow && root\.PeelHow\.filesFor\(m\.id\)/);
  assert.match(src('js/overview-tab.js'), /\(\) => H\.units\(p\)[\s\S]*\(\) => H\.people\(pe, crit\)[\s\S]*\(\) => H\.water\(pe, crit\)[\s\S]*\(\) => H\.wastewater\(pe, crit\)/);
  assert.equal((src('js/svc-capacity.js').match(/how: H\(\) && H\(\)\.capacity(Count|Row)/g) || []).length, 4);
  assert.match(src('index.html'), /<script src="js\/how\.js\?v=__BUILD__"><\/script>/);
});
