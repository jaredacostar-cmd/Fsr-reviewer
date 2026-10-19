#!/usr/bin/env node
/*
 * Weekly data snapshot.
 *
 * Pulls every configured source plus every development / permit dataset found
 * on the Peel municipalities' open-data hubs, and writes:
 *   data/snapshot.json  current records (applications + new-build permits)
 *   data/history.json   each project's phase, recorded on every run, so phase
 *                       changes over time are kept even though the sources only
 *                       publish current status
 *
 * A source that fails this week keeps last week's records (marked stale), so a
 * temporary outage never wipes data. A source that loads with fewer than half of last
 * week's records is treated the same way (a short or broken download). Exits non-zero
 * only if every source fails.
 *
 * Usage: node scripts/build-snapshot.js [--out data]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const CFG = require('../js/config.js');
const P = require('../js/phases.js');
const L = require('../js/loader.js');
const { buildIndex, countUnitsFromText } = require('./build-snapshot-index.js');
const PV = require('../js/privacy.js');
const { shrank } = require('./build-guards.js');

const SNAPSHOT_MAX_PER_LAYER = 150000;
const CHANGE_LIST_MAX = 500;
const day = d => d.toISOString().slice(0, 10);
const rootId = sourceId => String(sourceId).split('/')[0];

// ---- Compact (de)serialisation ------------------------------------------------
const KEEP = ['uid', 'sourceId', 'municipality', 'kind', 'ref', 'address', 'type', 'description',
  'ward', 'units', 'gfa', 'statusRaw', 'phase', 'newBuild', 'unitMix', 'unitsFromText', 'poly',
  'fileKey', 'stage', 'minor', 'scope'];

function encodeRecord(r) {
  const o = {};
  for (const k of KEEP) {
    // No one's name, contact or staff note in a description (js/privacy.js; js/phases.js
    // normalizeRecord already scrubbed it once every count was read from it).
    const v = k === 'description' ? PV.scrubDescription(r[k], r) : r[k];
    if (v == null || v === '' || v === false) continue;
    // Permit descriptions are only shown in the detail panel; keep them short to keep the file small.
    const max = r.kind === 'permit' ? 160 : 600;
    // (scrubbed again once cut: a note kept whole because removing it changed a reading can be
    // removable from the shorter text, and the stored text must be a fixed point of the scrub)
    o[k] = typeof v === 'string' && v.length > max ? (k === 'description' ? PV.scrubDescription(v.slice(0, max) + '…', r) : v.slice(0, max) + '…') : v;
  }
  o.lat = +r.lat.toFixed(6);
  o.lng = +r.lng.toFixed(6);
  if (r.events.length) o.events = r.events.map(e => [day(e.date), e.phase, e.label]);
  return o;
}

function decodeRecord(o, sourceName) {
  return {
    sourceName, ref: '', address: '', type: '', description: '', ward: '', statusRaw: '',
    units: null, gfa: null, newBuild: false, unitMix: null, props: {},
    ...o,
    events: (o.events || []).map(([d, phase, label]) => ({ date: new Date(`${d}T00:00:00Z`), phase, label })),
  };
}

// ---- Build ---------------------------------------------------------------------
async function buildSnapshot({ cfg = CFG, previous = null, history = null, now = new Date(), log = console.log } = {}) {
  const today = day(now);

  // 1. Sources: the curated list in js/config.js. (Hub discovery is not used here: it also
  //    matches election "subdivisions", staging copies and unrelated "development" layers.)
  const sources = cfg.services.map(s => ({ ...s }));

  // 2. Load each source; carry last week's records forward if it fails.
  const prevSources = new Map(((previous && previous.sources) || []).map(s => [s.id, s]));
  const prevRecords = new Map();
  for (const r of (previous && previous.records) || []) {
    const id = rootId(r.sourceId);
    if (!prevRecords.has(id)) prevRecords.set(id, []);
    prevRecords.get(id).push(r);
  }
  const outSources = [], encoded = [];
  let okCount = 0;
  for (const src of sources) {
    const meta = { id: src.id, name: src.name, municipality: src.municipality, kind: src.kind, url: src.url, discovered: !!src.discovered };
    try {
      const res = await L.loadSource(src, { bbox: cfg.bbox, sinceYear: cfg.sinceYear, maxPerLayer: SNAPSHOT_MAX_PER_LAYER, pageSize: cfg.pageSize });
      // Applications always; permits only when they create new buildings / units.
      const kept = res.records.filter(r => r.kind === 'application' || r.newBuild);
      const before = (prevRecords.get(src.id) || []).length;
      if (shrank(kept.length, before, 0.5)) throw new Error(`only ${kept.length} records against ${before} last snapshot${res.truncated ? ' (truncated)' : ''}`);
      for (const r of kept) encoded.push(encodeRecord(r));
      outSources.push({ ...meta, url: res.url || meta.url, status: 'ok', updated: today, count: kept.length, loaded: res.records.length, truncated: res.truncated });
      okCount++;
      log(`load ${src.id}: ${res.records.length} records, kept ${kept.length}`);
    } catch (e) {
      const old = prevRecords.get(src.id) || [];
      encoded.push(...old);
      const prev = prevSources.get(src.id);
      outSources.push({ ...meta, status: old.length ? 'stale' : 'error', error: e.message, updated: prev ? prev.updated : null, count: old.length });
      log(`load ${src.id}: FAILED (${e.message}); kept ${old.length} records from last snapshot`);
    }
  }
  if (!okCount) throw new Error('every source failed; snapshot not written');

  // 3. Projects, exactly as the app builds them.
  const names = new Map(outSources.map(s => [s.id, s.name]));
  const decoded = encoded.map(o => decodeRecord(o, names.get(rootId(o.sourceId))));
  const projects = P.buildProjects(P.dedupeRecords(decoded));

  // 3b. Decoded records for the startup index: the same records, but through the
  // browser's unit-count-from-description pass (js/app.js applySnapshot) so the
  // index agrees with the full-load projects. The pass mutates records, so it
  // runs on copies; the index itself is built once the snapshot exists (3c).
  const idxDecoded = decoded.map(r => ({ ...r }));
  countUnitsFromText(idxDecoded);

  // 4. Phase history and this run's changes.
  const hist = history && history.projects ? history : { projects: {}, runs: [] };
  const firstRun = !hist.runs.length;
  const since = hist.runs.length ? hist.runs[hist.runs.length - 1] : null;
  const added = [], moved = [];
  // A change to the app's phase rules re-reads every site: the new phase is recorded (marked
  // 'rules') but is not a change on the ground, so it is not counted as this week's moves.
  const rulesChanged = !firstRun && (hist.rules || 1) !== P.PHASE_RULES;
  // A development whose key changed with the address fix of 2026-10-17 (js/phases.js keyAliases)
  // carries on the history recorded under its old key: not new this week, its phases kept.
  const carried = new Map();
  for (const [old, to] of P.keyAliases(projects)) if (hist.projects[old] && to[0] && !carried.has(to[0])) carried.set(to[0], old);
  for (const p of projects) {
    if (!hist.projects[p.key] && carried.has(p.key)) hist.projects[p.key] = hist.projects[carried.get(p.key)].map(x => x.slice());
    const h = hist.projects[p.key] || (hist.projects[p.key] = []);
    const last = h[h.length - 1];
    const info = { key: p.key, title: p.title, municipality: p.municipality, units: p.units || undefined };
    if (!last) {
      h.push([today, p.phase]);
      if (!firstRun) added.push({ ...info, phase: p.phase });
    } else if (last[1] !== p.phase) {
      if (rulesChanged) h.push([today, p.phase, 'rules']);
      else {
        h.push([today, p.phase]);
        moved.push({ ...info, from: last[1], to: p.phase });
      }
    }
  }
  hist.rules = P.PHASE_RULES;
  if (hist.runs[hist.runs.length - 1] !== today) hist.runs.push(today);
  hist.updated = today;

  const snapshot = {
    version: 1,
    generatedAt: now.toISOString(),
    sinceYear: cfg.sinceYear,
    note: 'Planning applications and new-build building permits only.',
    sources: outSources,
    changes: firstRun ? { baseline: true, until: today } : {
      since, until: today,
      addedCount: added.length, movedCount: moved.length,
      added: added.sort((a, b) => (b.units || 0) - (a.units || 0)).slice(0, CHANGE_LIST_MAX),
      moved: moved.sort((a, b) => (b.units || 0) - (a.units || 0)).slice(0, CHANGE_LIST_MAX),
    },
    records: encoded,
  };
  // 3c. Compact startup index (data/snapshot-index.json): one small object per
  // project, for first paint; the full snapshot follows right after.
  const index = buildIndex(P.buildProjects(P.dedupeRecords(idxDecoded)), snapshot);
  return { snapshot, history: hist, index, summary: { sources: outSources.length, ok: okCount, records: encoded.length, projects: projects.length, added: added.length, moved: moved.length } };
}

// A missing file is a first run; a file that can't be parsed stops the build (a corrupt
// history.json must not restart every project's phase history).
function readJSON(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  try { return JSON.parse(text); } catch (e) { throw new Error(`${file}: ${e.message}`); }
}

async function main() {
  const i = process.argv.indexOf('--out');
  const outDir = path.resolve(i > 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'data'));
  fs.mkdirSync(outDir, { recursive: true });
  const snapFile = path.join(outDir, 'snapshot.json');
  const histFile = path.join(outDir, 'history.json');
  const idxFile = path.join(outDir, 'snapshot-index.json');
  const { snapshot, history, index, summary } = await buildSnapshot({ previous: readJSON(snapFile), history: readJSON(histFile) });
  fs.writeFileSync(snapFile, JSON.stringify(snapshot));
  fs.writeFileSync(histFile, JSON.stringify(history));
  fs.writeFileSync(idxFile, JSON.stringify(index));
  const mb = f => (fs.statSync(f).size / 1e6).toFixed(1);
  console.log(`snapshot: ${summary.ok}/${summary.sources} sources, ${summary.records} records, ${summary.projects} projects, ` +
    `+${summary.added} new, ${summary.moved} changed phase; snapshot.json ${mb(snapFile)} MB, history.json ${mb(histFile)} MB, ` +
    `snapshot-index.json ${mb(idxFile)} MB (${Math.round(fs.statSync(idxFile).size / fs.statSync(snapFile).size * 100)}% of snapshot)`);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { buildSnapshot, encodeRecord, decodeRecord, readJSON };
