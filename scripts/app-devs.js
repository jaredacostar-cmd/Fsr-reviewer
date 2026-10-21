'use strict';
// The developments as the app builds them from data/snapshot.json (js/app.js applySnapshot →
// rebuild): records decoded, unit counts read from descriptions (sources with countUnits: false
// excepted), deduplicated, council decisions applied (data/council-decisions.json), grouped into
// the trees (js/tree-groups.js through buildProjects' regroup hook) and counted
// (js/tree-counts.js). Shared by the weekly builds that key their output by development
// (scripts/build-dc-gate.js) and the tests (tests/helpers/real-devs.js), so their keys and unit
// counts are the app's.
const fs = require('fs');
const path = require('path');
const P = require('../js/phases.js');
const TG = require('../js/tree-groups.js');
const TC = require('../js/tree-counts.js');
const CD = require('../js/council-decisions.js');
const { decodeRecord } = require('./build-snapshot.js');
const { countUnitsFromText } = require('./build-snapshot-index.js');

/**
 * @param {object} snap      data/snapshot.json
 * @param {object} [opts]    tree: data/tree-counts.json, council: data/council-decisions.json
 *   (either missing: the app's fallback, today's grouping or no decisions)
 * @returns {{ projects, records, tree, byKey }}
 */
function buildAppDevs(snap, opts = {}) {
  const names = new Map((snap.sources || []).map(s => [s.id, s.name]));
  const raw = snap.records.map(o => decodeRecord(o, names.get(String(o.sourceId).split('/')[0])));
  countUnitsFromText(raw);
  const records = P.dedupeRecords(raw);
  if (opts.council) CD.applyTo(records, opts.council, P.canonRef);
  const tree = opts.tree || null;
  TG.setData(tree); TC.setData(tree);
  const grouped = !!(tree && TG.ready());
  const projects = P.buildProjects(records, grouped ? { regroup: parts => TG.regroup(parts) } : {});
  if (tree) TC.apply(projects, { mode: 'tree', data: tree, ringsArea: P.ringsArea });
  return { projects, records, tree, byKey: new Map(projects.map(p => [p.key, p])) };
}

/** The same, reading the files from a data directory. */
function loadAppDevs(dataDir) {
  const read = f => { const p = path.join(dataDir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
  return buildAppDevs(read('snapshot.json'), { tree: read('tree-counts.json'), council: read('council-decisions.json') });
}

module.exports = { buildAppDevs, loadAppDevs };
