'use strict';
// CMHC tables are read by their own title line: completions are the completions (table 1.1.2, by
// zone, added up per municipality), the under-construction inventory (1.1.3) is kept apart.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('data/housing.json: completions are completions; the under-construction inventory is its own series', () => {
  const H = JSON.parse(src('data/housing.json')).cmhc, R = JSON.parse(src('data/peel-housing.json')).activity.muni;
  assert.equal(H.completions.Mississauga[2022].all, 1161, 'South 586 + Northwest 439 + Northeast 136');
  assert.equal(H.underConstruction.Mississauga[2022].all, 11743, 'the series once read as completions');
  // The Region's table (CMHC's survey as Peel publishes it) agrees, except 2018 (CMHC's revision).
  for (const m of ['Mississauga', 'Brampton', 'Caledon']) for (const [y, v] of Object.entries(H.completions[m])) {
    if (y === '2018') continue;
    assert.equal(v.all, R[m][y].completions.all, `${m} ${y}`);
  }
});

test('fetch-external: 1.1.2 is completions and 1.1.3 the under-construction inventory', () => {
  const s = src('scripts/fetch-external.js');
  assert.match(s, /'1\.1\.2\.8': 'completions', '1\.1\.3\.8': 'under-construction'/);
  assert.match(s, /'1\.1\.3\.9': 'under-construction-9'/);
});

test('build-housing: a file is read by its title, whatever its name', { skip: (() => { try { execFileSync('python3', ['-c', 'import openpyxl']); return false; } catch (e) { return 'python3 with openpyxl not available'; } })() }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmhc-'));
  const w = (f, text) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); };
  // Named "completions" but titled under construction, and the other way round (the old mix-up).
  w('cmhc/completions-9-2022.csv', '  Under Construction Inventory by Dwelling Type by Census Subdivision\n2022 Intended Markets - All\n,Single,Semi-Detached,Row,Apartment,All,\nMississauga (CY),204,44,262,"11,233","11,743",\n');
  w('cmhc/under-construction-2022.csv', '  Completions by Dwelling Type by Zone\n2022 Intended Markets - All\n,Single,Semi-Detached,Row,Apartment,All,\nMississauga (South),63,4,32,487,586,\nMississauga (Northwest),12,6,14,407,439,\nMississauga (Northeast),8,0,0,128,136,\nCaledon,547,30,63,0,640,\n');
  w('cmhc/starts-9-2022.csv', '  Starts by Dwelling Type by Census Subdivision\n2022 Intended Markets - All\n,Single,Semi-Detached,Row,Apartment,All,\nMississauga (CY),120,24,76,"4,235","4,455",\n');
  // A minimal projections workbook (python writes it).
  fs.mkdirSync(path.join(dir, 'population-projections'), { recursive: true });
  execFileSync('python3', ['-c', `import openpyxl; wb = openpyxl.Workbook(); ws = wb.active; ws.append(['year','x','geo','sex','pop']); ws.append([2025,'','PEEL','TOTAL',1000]); wb.save(${JSON.stringify(path.join(dir, 'population-projections', '49_Census_Divisions_MOF_Population_Projections.xlsx'))})`]);
  const out = path.join(dir, 'housing.json');
  execFileSync('python3', [path.join(__dirname, '..', 'scripts', 'build-housing.py'), dir, out], { stdio: 'pipe' });
  const H = JSON.parse(fs.readFileSync(out, 'utf8')).cmhc;
  assert.equal(H.completions.Mississauga[2022].all, 1161);
  assert.deepEqual(H.completions.Mississauga[2022], { single: 83, semi: 10, row: 46, apartment: 1022, all: 1161 });
  assert.equal(H.completions.Caledon[2022].all, 640);
  assert.equal(H.underConstruction.Mississauga[2022].all, 11743);
  assert.equal(H.starts.Mississauga[2022].all, 4455);
});
