'use strict';
// The weekly builds' guards (scripts/build-guards.js): a source outage or a short download keeps
// last week's data instead of replacing it; and the workflows that commit the data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const B = require('../scripts/build-guards.js');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('shrank: only against a previous count, and anything that is not a number is short', () => {
  assert.equal(B.shrank(79, 100, 0.8), true);
  assert.equal(B.shrank(80, 100, 0.8), false);
  assert.equal(B.shrank(500, 100, 0.8), false);
  assert.equal(B.shrank(0, 0, 0.8), false, 'no previous count: nothing to compare');
  assert.equal(B.shrank(0, undefined, 0.8), false);
  assert.equal(B.shrank(NaN, 100, 0.8), true);
  assert.equal(B.shrank(undefined, 100, 0.5), true);
});

test('council: last week\'s meetings in an unreadable calendar year are carried over', () => {
  const prev = {
    'Brampton:1': { muni: 'Brampton', date: '2024-03-01', items: [] },
    'Brampton:2': { muni: 'Brampton', date: '2025-05-01', items: [] },
    'Brampton:3': { muni: 'Brampton', date: '2025-06-01', items: [] },
    'Caledon:9': { muni: 'Caledon', date: '2025-06-01', items: [] },
    'Brampton:0': { muni: 'Brampton', date: '2018-06-01', items: [] },
  };
  const fresh = { muni: 'Brampton', date: '2025-06-01', items: [{ n: '1' }] };
  const out = { 'Brampton:3': fresh };
  const n = B.carryMeetings(prev, out, { muni: 'Brampton', failedYears: new Set(['2025', '2018']), since: '2019-01-01' });
  assert.equal(n, 1);
  assert.deepEqual(Object.keys(out).sort(), ['Brampton:2', 'Brampton:3']);
  assert.equal(out['Brampton:3'], fresh, 'a meeting read this week is not replaced');
  // A year that was read: a meeting gone from it is not brought back.
  const out2 = {};
  assert.equal(B.carryMeetings(prev, out2, { muni: 'Brampton', failedYears: new Set(), since: '2019-01-01' }), 0);
  assert.deepEqual(out2, {});
});

test('council build: carries over unreadable pages and refuses to write under 80% of last week', () => {
  const s = src('scripts/build-council.js');
  assert.match(s, /if \(!html\) \{ if \(old\) \{ out\.meetings\[id\] = old;/);
  assert.match(s, /carryMeetings\(prev\.meetings, out\.meetings/);
  // The refusal comes before either file is written.
  const refuse = s.indexOf('shrank(nNow, nPrev, 0.8)'), write = s.indexOf("writeFileSync(path.join(OUT, 'council.json')");
  assert.ok(refuse > 0 && refuse < write);
});

test('council build, portals stubbed: an outage keeps every meeting; an empty calendar is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'council-'));
  const run = fetchBody => spawnSync(process.execPath, ['--import', `data:text/javascript,globalThis.fetch=async()=>(${fetchBody})`, path.join(ROOT, 'scripts', 'build-council.js'), '--out', dir], { encoding: 'utf8' });
  try {
    for (const f of ['council.json', 'council-decisions.json']) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(dir, f));
    const before = JSON.parse(fs.readFileSync(path.join(dir, 'council.json'), 'utf8'));
    // Every calendar unreadable (404): last week's meetings are all carried over.
    let r = run('{ok:false,status:404}');
    assert.equal(r.status, 0, r.stderr);
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'council.json'), 'utf8'));
    assert.deepEqual(Object.keys(after.meetings).sort(), Object.keys(before.meetings).sort());
    assert.deepEqual(after.files, before.files);
    // Calendars read but empty: under 80% of last week, nothing written.
    const text = fs.readFileSync(path.join(dir, 'council.json'), 'utf8'), dec = fs.readFileSync(path.join(dir, 'council-decisions.json'), 'utf8');
    r = run('{ok:true,status:200,text:async()=>JSON.stringify({d:[]})}');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /REFUSED: 0 meetings against \d+ last week/);
    assert.equal(fs.readFileSync(path.join(dir, 'council.json'), 'utf8'), text);
    assert.equal(fs.readFileSync(path.join(dir, 'council-decisions.json'), 'utf8'), dec);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('per-municipality shrink check (functional servicing reports, areas)', () => {
  const prev = B.countBy([{ muni: 'Mississauga' }, { muni: 'Mississauga' }, { muni: 'Mississauga' }, { muni: 'Caledon' }, { muni: 'Caledon' }], 'muni');
  assert.deepEqual(prev, { Mississauga: 3, Caledon: 2 });
  assert.deepEqual(B.shrunkGroups({ Mississauga: 3, Caledon: 2 }, prev, 0.7), []);
  assert.deepEqual(B.shrunkGroups({ Mississauga: 3 }, prev, 0.7), [{ key: 'Caledon', n: 0, prev: 2 }]);
  assert.deepEqual(B.shrunkGroups({ Mississauga: 2, Caledon: 2 }, prev, 0.7), [{ key: 'Mississauga', n: 2, prev: 3 }]);
  assert.deepEqual(B.shrunkGroups({ Brampton: 1 }, {}, 0.7), [], 'a new municipality is fine');
});

test('constraint grid: rebuilt only when every layer that feeds it was rebuilt', () => {
  const { DATASETS } = require('../scripts/build-constraints.js');
  const gridIds = DATASETS.filter(d => d.grid).map(d => d.id);
  assert.ok(gridIds.includes('reg-cvc') && gridIds.includes('reg-trca'));
  assert.equal(B.gridComplete(DATASETS, new Set(DATASETS.map(d => d.id))), true);
  assert.equal(B.gridComplete(DATASETS, new Set(gridIds)), true);
  assert.equal(B.gridComplete(DATASETS, new Set(['reg-cvc'])), false, '--only reg-cvc keeps the previous grid');
  assert.equal(B.gridComplete(DATASETS, new Set(gridIds.filter(id => id !== 'reg-trca'))), false, 'a refused layer keeps the previous grid');
  const s = src('scripts/build-constraints.js');
  // A short layer is refused before its folder is deleted and rewritten.
  const refuse = s.indexOf('shrank(cut.kept, old.features, 0.8)'), write = s.indexOf('const w = writeDataset(d, cut)');
  assert.ok(refuse > 0 && refuse < write);
});

test('address points: a missing or zero count from the service is a short download', () => {
  assert.equal(B.addressesShort(500000, 504000), false);
  assert.equal(B.addressesShort(200000, 504000), true);
  assert.equal(B.addressesShort(500000, undefined), true);
  assert.equal(B.addressesShort(500000, NaN), true);
  assert.equal(B.addressesShort(0, 0), true);
});

test('snapshot readJSON: a missing file is a first run, a corrupt one stops the build', () => {
  const { readJSON } = require('../scripts/build-snapshot.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guards-'));
  try {
    assert.equal(readJSON(path.join(dir, 'none.json')), null);
    fs.writeFileSync(path.join(dir, 'ok.json'), '{"a":1}');
    assert.deepEqual(readJSON(path.join(dir, 'ok.json')), { a: 1 });
    fs.writeFileSync(path.join(dir, 'history.json'), '{"projects":{');
    assert.throws(() => readJSON(path.join(dir, 'history.json')), /history\.json/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- Measured plant flow (python) ------------------------------------------------------------
// A minimal MECP XLSX (inline strings, one sheet) per year, written by python's zipfile.
const XLSX_PY = `
import json, sys, zipfile
from xml.sax.saxutils import escape
path, rows = sys.argv[1], json.loads(sys.argv[2])
def col(i):
    s = ''
    i += 1
    while i:
        i, r = divmod(i - 1, 26); s = chr(65 + r) + s
    return s
sheet = ''.join('<row r="%d">%s</row>' % (n + 1, ''.join('<c r="%s%d" t="inlineStr"><is><t>%s</t></is></c>' % (col(i), n + 1, escape(str(v))) for i, v in enumerate(r))) for n, r in enumerate(rows))
M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
with zipfile.ZipFile(path, 'w') as z:
    z.writestr('xl/workbook.xml', '<workbook xmlns="%s" xmlns:r="%s"><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>' % (M, R))
    z.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
    z.writestr('xl/worksheets/sheet1.xml', '<worksheet xmlns="%s"><sheetData>%s</sheetData></worksheet>' % (M, sheet))
`;
const HEAD = ['Company Code', 'Works Name', 'Month', 'Parameter', 'Reported Value', 'Unit of Measure'];
const flowRows = (year, months) => [HEAD, ...Array.from({ length: months }, (_, i) => ['110001284', 'G.E. BOOTH', `${year}/${String(i + 1).padStart(2, '0')}`, 'SEWAGE FLOW, MONTHLY TOTAL', '14000', '10(3)M3'])];

test('plant flows: refuses an unreadable year and a year with fewer months than last time', t => {
  const py = spawnSync('python3', ['--version']);
  if (py.error) { t.skip('python3 not installed'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plant-flows-'));
  const raw = path.join(dir, 'municipal-treated-wastewater-effluent');
  fs.mkdirSync(raw);
  const xlsx = (year, rows) => { const r = spawnSync('python3', ['-I', '-c', XLSX_PY, path.join(raw, `${year}.xlsx`), JSON.stringify(rows)], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  const out = path.join(dir, 'plant-flows.json');
  const build = () => spawnSync('python3', ['-I', path.join(ROOT, 'scripts', 'build-plant-flows.py'), dir, out, path.join(dir, 'no-reports.json')], { encoding: 'utf8' });
  try {
    xlsx(2023, flowRows(2023, 12)); xlsx(2024, flowRows(2024, 12));
    let r = build();
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const first = fs.readFileSync(out, 'utf8');
    assert.deepEqual(Object.keys(JSON.parse(first).plants.Lakeview.annual), ['2023', '2024']);

    // 2024 comes down with 6 months: refused, the file stays.
    xlsx(2024, flowRows(2024, 6));
    r = build();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /REFUSED: Lakeview 2024 would drop from 12 to 6 months/);
    assert.equal(fs.readFileSync(out, 'utf8'), first);

    // A year whose columns aren't found: refused (not skipped silently).
    xlsx(2024, flowRows(2024, 12));
    xlsx(2025, [['Something', 'Else'], ['1', '2']]);
    r = build();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /REFUSED: columns not found in 2025\.xlsx/);
    assert.equal(fs.readFileSync(out, 'utf8'), first);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- Workflows -------------------------------------------------------------------------------
test('workflows: data commits rebase before pushing; free-text input never pasted into a script', () => {
  const site = src('.github/workflows/site.yml'), probe = src('.github/workflows/probe-sources.yml');
  for (const [name, y] of [['site.yml', site], ['probe-sources.yml', probe]]) {
    // Every push to the branch the run is on goes through scripts/push-data.sh (pull --rebase, retries);
    // the raw-data branches are force-pushed on purpose.
    const bare = y.split('\n').filter(l => /\bgit push\b/.test(l) && !/git push -f origin /.test(l));
    assert.deepEqual(bare, [], `${name}: git push without a rebase`);
    assert.match(y, /data-commit-\$\{\{ github\.ref_name \}\}/, `${name}: shared data-commit concurrency group`);
  }
  assert.match(src('scripts/push-data.sh'), /git pull --rebase --autostash origin "\$branch"/);
  // inputs.only reaches run: scripts through the environment, and is checked against an allowlist.
  assert.deepEqual(probe.split('\n').filter(l => /\$\{\{\s*inputs\.only/.test(l) && !/^\s*ONLY: /.test(l)), []);
  assert.match(probe, /ONLY: \$\{\{ inputs\.only \}\}/);
  assert.ok(probe.includes('[[ "$ONLY" =~ ^[a-z0-9,_-]*$ ]]'));
  // EA rebuilds keep the capital links (data/capital.json) rather than a missing file.
  assert.doesNotMatch(probe, /--capital \/nonexistent/);
  assert.match(probe, /pip install -q pillow==[\d.]+ numpy==[\d.]+/);
});

test('site workflow: commits the DA outlines, reverts both capital files, main only', () => {
  const site = src('.github/workflows/site.yml');
  const add = site.split('\n').find(l => /git add data\/snapshot\.json/.test(l));
  for (const f of ['data/das.json', 'data/das-2016.json', 'data/areas.json', 'data/capital-links-audit.json']) assert.ok(add.includes(` ${f}`), f);
  assert.ok(!add.includes('snapshot-index.json'), 'the startup index stays out until the owner enables it');
  assert.match(site, /git checkout -- data\/capital\.json data\/capital-links-audit\.json/);
  assert.match(site, /snapshot:\n(?:.*\n)*?\s+if: github\.event_name != 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(site, /deploy:\n(?:.*\n)*?\s+if: always\(\) && needs\.snapshot\.result != 'cancelled' && github\.ref == 'refs\/heads\/main'/);
});
