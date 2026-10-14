'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/filters.js');

test('FLAG_META: seven flags with key, label and title', () => {
  assert.equal(F.FLAG_META.length, 7);
  for (const [k, label, title] of F.FLAG_META) {
    assert.match(k, /^[a-z]+$/, `flag key ${k}`);
    assert.ok(label.length > 0, `label for ${k}`);
    assert.ok(title.length > 0, `title for ${k}`);
  }
  assert.deepEqual(F.FLAG_META.map(([k]) => k), ['stalled', 'appeal', 'dcwait', 'psover', 'week', 'watched', 'est']);
});

test('PHASE_LAYER_MAP: every js/phases.js phase key maps to a layer or null', () => {
  assert.deepEqual(F.PHASE_LAYER_MAP, {
    inception: 'proposed', review: 'proposed',
    approved: 'approved', permit: 'approved', construction: 'approved',
    completed: 'built', cancelled: null,
  });
});

test('wwLayersFromStages: phases imply the wastewater growth layers', () => {
  assert.deepEqual(F.wwLayersFromStages(['inception', 'review', 'approved', 'permit', 'construction']), { built: false, approved: true, proposed: true });
  assert.deepEqual(F.wwLayersFromStages(['completed']), { built: true, approved: false, proposed: false });
  assert.deepEqual(F.wwLayersFromStages(['cancelled']), { built: false, approved: false, proposed: false });
  assert.deepEqual(F.wwLayersFromStages([]), { built: false, approved: false, proposed: false });
  assert.deepEqual(F.wwLayersFromStages(['inception', 'review', 'approved', 'permit', 'construction', 'completed']), { built: true, approved: true, proposed: true });
  // Unknown keys are ignored, not fatal.
  assert.deepEqual(F.wwLayersFromStages(['bogus']), { built: false, approved: false, proposed: false });
});

test('migrateLegacyFocus: the old fo values map onto the new state', () => {
  const dflt = { flags: [], basis: 'all', minUnits: 0, landuse: 'all', yearPreset: null };
  assert.deepEqual(F.migrateLegacyFocus('growth'), { ...dflt, landuse: 'growth' });
  assert.deepEqual(F.migrateLegacyFocus('none'), dflt);
  assert.deepEqual(F.migrateLegacyFocus('bogus'), dflt);
  assert.deepEqual(F.migrateLegacyFocus('major'), { ...dflt, minUnits: 100 });
  assert.deepEqual(F.migrateLegacyFocus('committed'), { ...dflt, basis: 'committed' });
  assert.deepEqual(F.migrateLegacyFocus('left'), { ...dflt, basis: 'remaining' });
  assert.deepEqual(F.migrateLegacyFocus('employment'), { ...dflt, landuse: 'employment' });
  assert.deepEqual(F.migrateLegacyFocus('newapps'), { ...dflt, yearPreset: 'last12m' });
  assert.deepEqual(F.migrateLegacyFocus('stalled'), { ...dflt, flags: ['stalled'] });
  assert.deepEqual(F.migrateLegacyFocus('week'), { ...dflt, flags: ['week'] });
  assert.deepEqual(F.migrateLegacyFocus('watched'), { ...dflt, flags: ['watched'] });
});

test('encodeFlagParam / decodeFlagParam: round-trip, unknown keys dropped', () => {
  const flags = { stalled: true, appeal: false, dcwait: true, psover: false, week: false, watched: false, est: true };
  const s = F.encodeFlagParam(flags);
  assert.equal(s, 'stalled,dcwait,est');
  assert.deepEqual(F.decodeFlagParam(s), { stalled: true, appeal: false, dcwait: true, psover: false, week: false, watched: false, est: true });
  // Array input works too.
  assert.equal(F.encodeFlagParam(['week', 'watched']), 'week,watched');
  // Empty / missing.
  assert.equal(F.encodeFlagParam({}), '');
  assert.equal(F.encodeFlagParam(null), '');
  assert.deepEqual(F.decodeFlagParam(''), { stalled: false, appeal: false, dcwait: false, psover: false, week: false, watched: false, est: false });
  // Unknown keys never survive the round trip.
  assert.equal(F.encodeFlagParam({ stalled: true, bogus: true }), 'stalled');
  const dec = F.decodeFlagParam('stalled,bogus');
  assert.equal(dec.stalled, true);
  assert.ok(!('bogus' in dec));
});

test('browser global: window.PeelFilters when module is unavailable', () => {
  // filters.js is also loaded as a plain <script>; simulate the browser path by
  // evaluating its source without module/exports.
  const fs = require('node:fs');
  const src = fs.readFileSync(require('node:path').join(__dirname, '../js/filters.js'), 'utf8');
  const sandbox = {};
  const fn = new Function('window', 'module', 'globalThis', `${src}\nreturn window.PeelFilters || globalThis.PeelFilters;`);
  const api = fn(sandbox, undefined, sandbox);
  assert.ok(api && typeof api.migrateLegacyFocus === 'function');
  assert.equal(api.FLAG_META.length, 7);
});
