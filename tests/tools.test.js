'use strict';
/* Phase 3b tool framework tests: js/tools.js against a minimal DOM stub.
 * The module is browser code (attaches to window); here we drive the registry,
 * banner, one-tool-at-a-time sync, Esc, and the result-as-scope flow with a
 * fake PeelApp.scope bridge and assert the UI transitions it performs.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

function makeEl() {
  return {
    hidden: true, innerHTML: '', textContent: '',
    dataset: {}, _attrs: {}, _l: {},
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    addEventListener(t, fn) { this._l[t] = fn; },
    querySelector() { return null; },
    fireClick(target) { if (this._l.click) this._l.click({ target }); },
  };
}

let els;
const bridgeCalls = [];
function resetDOM() {
  els = {
    '#tool-banner': makeEl(),
    '#tool-title': makeEl(),
    '#pane-tool-body': makeEl(),
    '#ftab-tool': makeEl(),
    '#pane-tool': makeEl(),
    '#tool-close': makeEl(),
  };
  bridgeCalls.length = 0;
  global.document = {
    readyState: 'complete',
    querySelector: s => els[s] || null,
    addEventListener() {},
  };
  global.window = {
    PeelApp: {
      scope: {
        showFootTab: k => bridgeCalls.push(['showFootTab', k]),
        renderTrail: () => bridgeCalls.push(['renderTrail']),
      },
    },
  };
}

function freshTools() {
  delete require.cache[require.resolve('../js/tools.js')];
  return require('../js/tools.js');
}

test('register/ids/def/handles bookkeeping', () => {
  resetDOM();
  const T = freshTools();
  assert.deepEqual(T.ids(), []);
  assert.equal(T.handles('nope'), false);
  T.register('inspect', { title: 'Inspect point' });
  assert.deepEqual(T.ids(), ['inspect']);
  assert.equal(T.handles('inspect'), true);
  assert.equal(T.def('inspect').title, 'Inspect point');
  assert.throws(() => T.register('bad', {}), /title/);
});

test('sync: one tool at a time, banner shown/hidden, activate/deactivate called', () => {
  resetDOM();
  const T = freshTools();
  const log = [];
  T.register('a', { title: 'A', hint: 'tap', onActivate: () => log.push('a:on'), onDeactivate: () => log.push('a:off') });
  T.register('b', { title: 'B', onActivate: () => log.push('b:on'), onDeactivate: () => log.push('b:off') });
  T.sync('a');
  assert.equal(T.active(), 'a');
  assert.equal(els['#tool-banner'].hidden, false);
  assert.match(els['#tool-banner'].innerHTML, /<strong>A<\/strong>/);
  assert.match(els['#tool-banner'].innerHTML, /tap/);
  T.sync('b');
  assert.deepEqual(log, ['a:on', 'a:off', 'b:on']);
  assert.match(els['#tool-banner'].innerHTML, /<strong>B<\/strong>/);
  T.sync(null);
  assert.equal(T.active(), null);
  assert.equal(els['#tool-banner'].hidden, true);
  assert.deepEqual(log, ['a:on', 'a:off', 'b:on', 'b:off']);
});

test('sync with unknown mode clears the active tool', () => {
  resetDOM();
  const T = freshTools();
  T.register('a', { title: 'A' });
  T.sync('a');
  T.sync('measure'); // an app.js-native tool mode: registry has no entry
  assert.equal(T.active(), null);
  assert.equal(els['#tool-banner'].hidden, true);
});

test('banner(null) hides; banner(html) shows', () => {
  resetDOM();
  const T = freshTools();
  T.banner('<em>hi</em>');
  assert.equal(els['#tool-banner'].hidden, false);
  assert.equal(els['#tool-banner'].innerHTML, '<em>hi</em>');
  T.banner(null);
  assert.equal(els['#tool-banner'].hidden, true);
});

test('escape() with no active tool returns false; with one, clears via sync when no bridge setTool', () => {
  resetDOM();
  const T = freshTools();
  assert.equal(T.escape(), false);
  T.register('a', { title: 'A' });
  T.sync('a');
  assert.equal(T.escape(), true);
  assert.equal(T.active(), null);
  assert.equal(els['#tool-banner'].hidden, true);
});

test('mapClick routes to the registered onClick', () => {
  resetDOM();
  const T = freshTools();
  const seen = [];
  T.register('inspect', { title: 'Inspect', onClick: ll => seen.push(ll) });
  assert.equal(T.mapClick('inspect', { lat: 1, lng: 2 }), true);
  assert.deepEqual(seen, [{ lat: 1, lng: 2 }]);
  assert.equal(T.mapClick('unknown', {}), false);
});

test('banner action buttons route to the active tool onBannerAct', () => {
  resetDOM();
  const T = freshTools();
  const acts = [];
  T.register('select', { title: 'Select', onBannerAct: (act) => acts.push(act) });
  T.sync('select'); // wires the banner (already wired at load via readyState complete)
  const btn = { getAttribute: () => 'lasso' };
  els['#tool-banner'].fireClick({ closest: () => btn });
  assert.deepEqual(acts, ['lasso']);
});

test('openResult: tab shown, body filled, foot tab + trail updated; trailCrumb; closeResult restores', () => {
  resetDOM();
  const T = freshTools();
  assert.equal(T.hasResult(), false);
  assert.equal(T.trailCrumb(), null);
  T.openResult({ title: 'Lasso selection', html: '<p>3 developments</p>' });
  assert.equal(T.hasResult(), true);
  assert.equal(T.resultTitle(), 'Lasso selection');
  assert.equal(els['#tool-title'].textContent, 'Lasso selection');
  assert.equal(els['#pane-tool-body'].innerHTML, '<p>3 developments</p>');
  assert.equal(els['#ftab-tool'].hidden, false);
  assert.deepEqual(bridgeCalls, [['showFootTab', 'tool'], ['renderTrail']]);
  const crumb = T.trailCrumb();
  assert.equal(crumb.label, 'Lasso selection');
  // Reopen via the crumb re-selects the tool tab.
  bridgeCalls.length = 0;
  crumb.go();
  assert.deepEqual(bridgeCalls, [['showFootTab', 'tool']]);
  // Close button.
  els['#tool-close'].fireClick({ closest: () => null });
  assert.equal(T.hasResult(), false);
  assert.equal(els['#ftab-tool'].hidden, true);
  assert.deepEqual(bridgeCalls, [['showFootTab', 'tool'], ['showFootTab', 'overview'], ['renderTrail']]);
  assert.equal(T.trailCrumb(), null);
});

test('closeResult with no result is a no-op', () => {
  resetDOM();
  const T = freshTools();
  assert.equal(T.closeResult(), false);
  assert.deepEqual(bridgeCalls, []);
});

test('a throwing tool hook never breaks the framework', () => {
  resetDOM();
  const T = freshTools();
  T.register('boom', { title: 'Boom', onActivate: () => { throw new Error('x'); }, onClick: () => { throw new Error('y'); } });
  T.sync('boom'); // must not throw
  assert.equal(T.active(), 'boom');
  T.mapClick('boom', {}); // must not throw
  T.sync(null);
  assert.equal(T.active(), null);
});
