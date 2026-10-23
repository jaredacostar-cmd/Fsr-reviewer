#!/usr/bin/env node
/*
 * Pipeline ledger, Phase 5: the annual snapshot (docs/ledger/annual-procedure.md).
 *
 * Builds the ledger rows (js/ledger.js) for Peel exactly as Growth › Ledger shows them with no filters,
 * from the data in data/, and writes data/ledger/<name>.json and data/ledger/<name>.csv in the fixed
 * column template (js/ledger-snapshot.js), plus data/ledger/index.json listing every snapshot.
 * A snapshot is frozen once written: the script refuses to write a name that already exists.
 *
 *   node scripts/build-ledger.js                  name from the data date (e.g. 2026-fall)
 *   node scripts/build-ledger.js --name 2026-fall
 *   node scripts/build-ledger.js --dry-run        build and print the totals, write nothing
 *   (--data <dir>, --out <dir>: defaults data/ and data/ledger/)
 *
 * The scope, as the app: developments with a planning application, new building, not withdrawn, with
 * dormant developments and site activity held aside (dormant as of the data date). Pressure zone and
 * plant: the mapped area holding the point, else the nearest within 5 km (the app also uses the planned
 * DC main a site would connect to; that step is browser-only, so a few unmapped sites can differ).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../js/phases.js');
const D = require('../js/demand.js');
const T = require('../js/timing.js');
const L = require('../js/ledger.js');
const S = require('../js/ledger-snapshot.js');
const Ar = require('../js/areas.js');
const { loadAppDevs } = require('./app-devs.js');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = k => process.argv.includes(k);
const NEAR_M = 5000;

function readJSON(dir, f) { const p = path.join(dir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }

/** The app's default set at Peel (js/app.js holdDormant + the default filters). */
function appSet(projects, asOf) {
  return projects.filter(p => !p.siteActivity && !P.dormantOf(p, asOf))
    .filter(p => p.phase !== 'cancelled' && (p.kinds || []).includes('application') && p.newBuild);
}

/** Pressure zone and plant by location (js/svc-data.js tagAreas, without the planned-main step). */
// The wastewater catchments are the Region's blocks (data/blocks.json, version 2+), as js/svc-data.js
// loads them; the traced drainage areas of servicing.json only without them.
function placer(servicing, blocks) {
  if (!servicing) return { zoneOf: () => null, plantOf: () => null };
  const fromBlocks = blocks && blocks.version >= 2 ? blocks.blocks.filter(b => b.plant).map(b => ({ id: `dr:B${b.id}`, name: `Block ${b.id}`, kind: 'block', plant: b.plant, outletAt: b.outletAt, served: b.served ?? 1, rings: b.parts.map(p => p[0]) })) : null;
  const zones = Ar.prepare(servicing.pressureZones || []), drainage = Ar.prepare(fromBlocks || servicing.drainageAreas || []);
  const byId = new Map([...zones, ...drainage].map(a => [a.id, a]));
  const lowServed = a => !!a && a.served != null && a.served < 0.5;
  const sewered = drainage.filter(a => !lowServed(a));
  const zoneOf = p => {
    if (p.lat == null) return null;
    const id = Ar.locate(zones, p.lng, p.lat)[0] || (Ar.nearest(zones, p.lng, p.lat, NEAR_M) || {}).id;
    const z = id && byId.get(id);
    return z ? { id: z.id, name: z.name } : null;
  };
  const plantOf = p => {
    if (p.lat == null) return null;
    let id = Ar.locate(drainage, p.lng, p.lat)[0];
    const a = id && byId.get(id);
    if (a && lowServed(a) && !(a.outletAt && Math.hypot((a.outletAt[0] - p.lng) * 80600, (a.outletAt[1] - p.lat) * 111320) < 1500)) id = null;
    if (!id) id = (Ar.nearest(sewered, p.lng, p.lat, NEAR_M) || {}).id;
    const d = id && byId.get(id);
    return d ? d.plant || null : null;
  };
  return { zoneOf, plantOf };
}

/** The ledger rows and the snapshot, from a data directory. */
function build(dataDir, opts = {}) {
  const snap = readJSON(dataDir, 'snapshot.json');
  const asOf = Date.parse(snap.generatedAt);
  const { projects } = loadAppDevs(dataDir);
  const set = appSet(projects, asOf);
  const gate = readJSON(dataDir, 'dc-gate.json'), byKey = new Map(((gate && gate.developments) || []).map(r => [r.key, r]));
  const { zoneOf, plantOf } = placer(readJSON(dataDir, 'servicing.json'), readJSON(dataDir, 'blocks.json'));
  // The forecast over every development (as js/timing.js forecastModel; the population data loaded).
  const H = readJSON(dataDir, 'housing.json'), R = readJSON(dataDir, 'peel-reports.json');
  const homes = T.homesNeeded(H && H.mof && H.mof.peel, R && R.forecast2051 && R.forecast2051.municipalities);
  const live = projects.filter(p => !p.siteActivity && !P.dormantOf(p, asOf));
  const munis = T.datedMunis(live);
  const cal = T.calibrate(T.observationsFromProjects(live)), curves = T.stageCurves(T.curveObservations(live, asOf, { munis }));
  const ss = T.stageSchedules(T.pipelineItems(live), cal, { curves, homes, now: asOf });
  const model = { cal, curves, homes, ss, now: asOf, munis };
  const rows = L.rows(set, {
    gateOf: p => byKey.get(p.key) || null,
    people: p => D.estimate([p], D.DEFAULT_CRITERIA, 'remaining').population,
    zoneOf, plantOf,
    yearsOf: p => { const s = ss.sched.get(p.key), a = ss.after.get(p.key); return s || a ? { shares: L.bucketShares(s ? s.likely : null, a ? a.likely : 0, P.unbuiltOf(p)) } : null; },
    scheduleOf: p => T.scheduleFor(p, model),
    asOf,
  });
  const sourceDate = snap.generatedAt.slice(0, 10);
  const notes = [
    `Site servicing permits: data/dc-gate.json built ${gate && gate.generatedAt ? gate.generatedAt.slice(0, 10) : 'n/a'}.`,
    `Timing: the Forecast view's time-in-stage model (likely band), curves from the municipalities that date completions (${[...munis].join(', ') || 'none'}).`,
    'Confidence tiers as drafted in docs/pipeline-ledger-plan.md (Phase 4), to confirm with the Region.',
  ];
  const s = S.snapshot(rows, { name: opts.name || S.nameFor(asOf), sourceDate, frozenAt: opts.frozenAt || new Date().toISOString().slice(0, 10), notes });
  return { s, rows, set, asOf };
}

function main() {
  const dataDir = path.resolve(arg('--data', path.join(ROOT, 'data')));
  const outDir = path.resolve(arg('--out', path.join(dataDir, 'ledger')));
  const t0 = Date.now();
  const { s } = build(dataDir, { name: arg('--name', null) });
  const t = s.totals, n = v => Math.round(v).toLocaleString('en-CA');
  console.log(`ledger ${s.name} (template ${s.template}, data ${s.sourceDate}): ${n(t.developments)} developments, ${n(t.units_left)} units left to build (${n(t.units_committed)} committed), ${n(t.people)} people; tiers ${JSON.stringify(t.tiers)}; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (flag('--dry-run')) return;
  const w = write(s, outDir);
  if (!w.ok) { console.error(w.error); process.exit(1); }
  console.log(`wrote ${w.files.map(f => path.relative(ROOT, f)).join(', ')}`);
}

/** Writes the snapshot's .json and .csv and lists it in index.json. Frozen: refuses a name that exists. */
function write(s, outDir) {
  const json = path.join(outDir, `${s.name}.json`), csv = path.join(outDir, `${s.name}.csv`);
  if (fs.existsSync(json) || fs.existsSync(csv)) return { ok: false, error: `${s.name} already exists in ${outDir}: a snapshot is frozen once written. Pick another --name.` };
  const t = s.totals;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(json, JSON.stringify(s));
  fs.writeFileSync(csv, S.toCSV(s));
  const idxFile = path.join(outDir, 'index.json');
  const idx = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, 'utf8')) : { snapshots: [] };
  idx.snapshots = idx.snapshots.filter(x => x.name !== s.name).concat([{ name: s.name, template: s.template, sourceDate: s.sourceDate, frozenAt: s.frozenAt, developments: t.developments, units_left: t.units_left, units_committed: t.units_committed }]);
  idx.snapshots.sort((a, b) => String(a.sourceDate).localeCompare(String(b.sourceDate)));
  fs.writeFileSync(idxFile, `${JSON.stringify(idx, null, 1)}\n`);
  return { ok: true, files: [json, csv, idxFile] };
}

if (require.main === module) main();
module.exports = { build, write, appSet, placer };
