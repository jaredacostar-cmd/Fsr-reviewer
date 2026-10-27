/* Peel Growth Pipeline (unofficial) – Phase 3b tool 4: Compare.
 *
 * Compares 2–3 developments or areas side by side in the #compare-col column
 * (the Phase 2 shell provision: fourth grid column at >=1800px; overlay
 * drawer/sheet below that via the tcmp- rules in this module).
 *
 * Contract (for the workers wiring the header's ⋯ and pop-up buttons):
 *   window.PeelToolCompare = {
 *     addDevelopment(p),  // p: a development project object (needs .key/.title)
 *     addArea(a),         // a: { name|title, members|devs|projects|keys|items } or an array of projects
 *     remove(i),          // drop the item at index i
 *     clear(),            // empty the comparison
 *     render(),           // (re)render #compare-col from the item list
 *     items(),            // the current compare items (copies: {kind,key,title,sub,p?,members?})
 *     sumEstimates(list), // shared pure helper: sum demand-estimate objects
 *     tightestConstraint(list), // shared pure helper: pick the tightest constraint
 *   }
 * Max 3 items: adding a 4th replaces the oldest (noted under the header).
 * Safe to call any time after this script loads, even before js/app.js has
 * run — values are read lazily through window.PeelApp on every render.
 * Compare coexists with the dev scope; it always renders into #compare-col.
 *
 * Pure, unit-tested helpers: sumEstimates(list), tightestConstraint(list).
 * They take plain data (estimate objects / devNeeds constraint objects) so
 * tests never need the app bridge.
 */
(function () {
  'use strict';

  var P = function () { return (typeof window !== 'undefined' && window.PeelApp) || null; };
  var PH = function () { return (typeof window !== 'undefined' && window.PeelPhases) || null; };
  var MAX_ITEMS = 3;

  var items = [];   // { kind:'dev'|'area', key, title, sub, p?, members? }
  var note = '';    // one-line note under the header (e.g. replaced-oldest)

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // fmt() helpers come from the app bridge when it is ready; local fallbacks
  // keep render() crash-free before app.js runs.
  function F() {
    var f = P() && P().scope && P().scope.fmt;
    return {
      esc: (f && f.esc) || esc,
      fmtNum: (f && f.fmtNum) || (function (n) { return n == null ? '' : Number(n).toLocaleString('en-CA'); }),
      uUnits: (f && f.uUnits) || (function (n) { return (n == null ? '' : Math.round(Number(n)).toLocaleString('en-CA')) + ' units'; }),
      uPop: (f && f.uPop) || (function (n) { return (n == null ? '' : Math.round(Number(n)).toLocaleString('en-CA')) + ' pop'; }),
      uLs: (f && f.uLs) || (function (n) { return (n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-CA', { maximumFractionDigits: 1 })) + ' L/s'; }),
      roundPop: (f && f.roundPop) || (function (n) { return Math.round(n); }),
      dot: (f && f.dot) || (function () { return ''; }),
    };
  }
  var EST = '<span class="est-tag">screening estimate</span>';

  /* ---- pure helpers (exported for tests) ---- */

  // Sum demand-estimate objects (the shape D.estimate / scope.estimate returns).
  function sumEstimates(list) {
    var t = { totalUnits: 0, population: 0, jobs: 0,
      water: { avg: 0, maxDay: 0, peakHour: 0 },
      wastewater: { avg: 0, peak: 0, wetPeak: 0 } };
    (list || []).forEach(function (e) {
      if (!e) return;
      t.totalUnits += e.totalUnits || 0;
      t.population += e.population || 0;
      t.jobs += (e.employment && e.employment.jobs) || 0;
      var cb = e.combined || {};
      if (cb.water) { t.water.avg += cb.water.avg || 0; t.water.maxDay += cb.water.maxDay || 0; t.water.peakHour += cb.water.peakHour || 0; }
      if (cb.wastewater) { t.wastewater.avg += cb.wastewater.avg || 0; t.wastewater.peak += cb.wastewater.peak || 0; t.wastewater.wetPeak += cb.wastewater.wetPeak || 0; }
    });
    return t;
  }

  // The tightest constraint, using the same ordering devNeeds() sorts by:
  // gap < planned < check < ok, then earliest run-out year, then fewest people of room.
  var CON_ORDER = { gap: 0, planned: 1, check: 2, ok: 3 };
  function tightestConstraint(list) {
    var cs = (list || []).filter(Boolean);
    if (!cs.length) return null;
    return cs.slice().sort(function (a, b) {
      return ((CON_ORDER[a.status] == null ? 9 : CON_ORDER[a.status]) - (CON_ORDER[b.status] == null ? 9 : CON_ORDER[b.status]))
        || ((a.out === 'today' ? 0 : a.out || 9999) - (b.out === 'today' ? 0 : b.out || 9999))
        || ((a.people || 0) - (b.people || 0));
    })[0];
  }

  /* ---- item management ---- */

  function push(item) {
    if (!item || !item.key) return false;
    if (items.some(function (x) { return x.key === item.key; })) { note = 'Already in the comparison.'; return true; }
    if (items.length >= MAX_ITEMS) {
      var dropped = items.shift();
      note = 'Compare holds ' + MAX_ITEMS + ' — replaced ' + dropped.title + '.';
    } else note = '';
    items.push(item);
    return true;
  }

  function addDevelopment(p) {
    if (!p || p.key == null) return false;
    var ok = push({ kind: 'dev', key: 'dev:' + p.key, title: p.title || 'Untitled development', sub: p.municipality || '', p: p });
    render();
    return ok;
  }

  function normMembers(a) {
    if (Array.isArray(a)) return a;
    if (!a || typeof a !== 'object') return [];
    var m = a.members || a.devs || a.projects || a.items || [];
    if (a.keys && Array.isArray(a.keys) && P() && P().state && Array.isArray(P().state.projects)) {
      var byKey = {};
      P().state.projects.forEach(function (p) { byKey[p.key] = p; });
      m = m.concat(a.keys.map(function (k) { return byKey[k]; }).filter(Boolean));
    }
    return Array.isArray(m) ? m.filter(Boolean) : [];
  }

  function addArea(a) {
    var members = normMembers(a);
    var title = (!Array.isArray(a) && a && (a.name || a.title)) || 'Area';
    var key = (!Array.isArray(a) && a && (a.key || a.id)) || ('area:' + title);
    var ok = push({ kind: 'area', key: String(key), title: String(title), sub: members.length + ' development' + (members.length === 1 ? '' : 's'), members: members });
    render();
    return ok;
  }

  function remove(i) {
    if (i < 0 || i >= items.length) return false;
    items.splice(i, 1);
    note = '';
    render();
    return true;
  }

  function clear() {
    items.length = 0;
    note = '';
    render();
  }

  /* ---- per-item numbers (lazy through the bridge) ---- */

  function devNumbers(p) {
    var app = P(), f = F(), out = { ready: !!app };
    if (!app || !app.scope) return out;
    var e = null;
    try { e = app.scope.estimate(p); } catch (err) { e = null; }
    out.units = e ? f.uUnits(e.totalUnits) : '–';
    out.people = e ? f.uPop(f.roundPop(e.population)) + (e.employment && e.employment.jobs ? ' + ' + f.fmtNum(f.roundPop(e.employment.jobs)) + ' jobs' : '') : '–';
    out.maxDay = e ? f.uLs(e.combined.water.maxDay) + ' ' + EST : '–';
    out.wetPeak = e ? f.uLs(e.combined.wastewater.wetPeak) + ' ' + EST : '–';
    var sf = null;
    try { sf = app.scope.svcFacts(p); } catch (err) { sf = null; }
    var shorts = (app.scope && app.scope.PLANT_SHORT) || {};
    out.zone = (sf && sf.z && sf.z.name ? sf.z.name.replace('Pressure zone ', 'Zone ') : '–');
    out.plant = (sf && sf.pl ? (shorts[sf.pl] || (sf.pl + ' WRRF')) : '–');
    var needs = null;
    try { needs = app.devNeeds(p); } catch (err) { needs = null; }
    out.tightest = needs && needs.length ? needs[0] : null;
    out.noSvc = !needs;
    out.flags = '';
    try {
      var st = app.scope.statusOf(p);
      var chips = app.scope.devFlags(p, st, sf);
      out.flags = chips || '';
    } catch (err) { out.flags = ''; }
    return out;
  }

  function areaNumbers(members) {
    var app = P(), f = F(), out = { ready: !!app };
    if (!app || !app.scope) return out;
    var ests = [];
    members.forEach(function (p) { try { var e = app.scope.estimate(p); if (e) ests.push(e); } catch (err) { /* skip */ } });
    var t = sumEstimates(ests);
    out.units = f.uUnits(t.totalUnits);
    out.people = f.uPop(f.roundPop(t.population)) + (t.jobs ? ' + ' + f.fmtNum(f.roundPop(t.jobs)) + ' jobs' : '');
    out.maxDay = f.uLs(t.water.maxDay) + ' ' + EST;
    out.wetPeak = f.uLs(t.wastewater.wetPeak) + ' ' + EST;
    // Most common pressure zone / plant across members.
    var zones = {}, plants = {}, shorts = app.scope.PLANT_SHORT || {};
    members.slice(0, 50).forEach(function (p) {
      try {
        var sf = app.scope.svcFacts(p);
        if (sf && sf.z && sf.z.name) { var zn = sf.z.name.replace('Pressure zone ', 'Zone '); zones[zn] = (zones[zn] || 0) + 1; }
        if (sf && sf.pl) { var pn = shorts[sf.pl] || (sf.pl + ' WRRF'); plants[pn] = (plants[pn] || 0) + 1; }
      } catch (err) { /* skip */ }
    });
    var top = function (m) { var ks = Object.keys(m); return ks.length ? ks.sort(function (a, b) { return m[b] - m[a]; })[0] : '–'; };
    out.zone = top(zones);
    out.plant = top(plants);
    // Tightest constraint across (up to 50) members.
    var all = [];
    members.slice().sort(function (a, b) { return (b.units || 0) - (a.units || 0); }).slice(0, 50).forEach(function (p) {
      try { var n = app.devNeeds(p); if (n) all = all.concat(n); } catch (err) { /* skip */ }
    });
    out.tightest = tightestConstraint(all);
    out.noSvc = !all.length && !(app.state && app.state.svcModel);
    out.flags = '';
    return out;
  }

  var CON_STATUS_TXT = { gap: 'runs out before a DC project relieves it', planned: 'DC project in time', check: 'check the data', ok: 'room to build-out' };

  function tightestHTML(t) {
    if (!t) return '<span class="muted">No servicing data.</span>';
    var f = F();
    var out = t.out === 'today' ? 'already' : (t.out == null ? 'after the horizon' : '≈' + t.out);
    return '<strong>' + f.esc(t.name) + '</strong><br><span class="muted">' + f.esc(t.sub || '') + '</span><br>' +
      '<span class="tcmp-st tcmp-st-' + esc(t.status) + '">' + esc(CON_STATUS_TXT[t.status] || t.status) + '</span>' +
      ' <span class="muted">· runs out ' + esc(out) + '</span>';
  }

  function phaseBadge(p) {
    var f = F(), ph = PH(), label = p.phase;
    try { if (ph && ph.PHASE_BY_KEY && ph.PHASE_BY_KEY[p.phase]) label = ph.PHASE_BY_KEY[p.phase].label; } catch (err) { /* keep raw */ }
    return f.dot(p.phase) + ' ' + f.esc(label);
  }

  function cardHTML(item, i) {
    var f = F();
    var n = item.kind === 'dev' ? devNumbers(item.p) : areaNumbers(item.members);
    var rows = [];
    var kv = function (k, v) { rows.push('<div class="tcmp-f"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'); };
    if (item.kind === 'dev') kv('Stage', phaseBadge(item.p)); else kv('Type', 'Area');
    kv('Units', n.units != null ? n.units : '<span class="muted">Loading…</span>');
    kv('People', n.people != null ? n.people : '<span class="muted">Loading…</span>');
    kv('Water max day', n.maxDay != null ? n.maxDay : '<span class="muted">Loading…</span>');
    kv('Wastewater peak wet', n.wetPeak != null ? n.wetPeak : '<span class="muted">Loading…</span>');
    kv('Zone → plant', n.zone != null ? f.esc(n.zone) + ' → ' + f.esc(n.plant) : '<span class="muted">Loading…</span>');
    kv('Tightest constraint', n.tightest !== undefined ? (n.noSvc ? '<span class="muted">No servicing data.</span>' : tightestHTML(n.tightest)) : '<span class="muted">Loading…</span>');
    if (item.kind === 'dev' && n.flags) kv('Flags', n.flags);
    return '<section class="tcmp-card" aria-label="' + esc(item.title) + '">' +
      '<div class="tcmp-card-h"><div><strong>' + f.esc(item.title) + '</strong>' +
      (item.sub ? '<div class="muted small">' + f.esc(item.sub) + '</div>' : '') + '</div>' +
      '<button type="button" class="btn small" data-tcmp-rm="' + i + '" aria-label="Remove ' + esc(item.title) + '">×</button></div>' +
      rows.join('') + '</section>';
  }

  /* ---- style (one <style>, tcmp- prefixed, CSS variables only) ---- */

  function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById('tcmp-style')) return;
    var s = document.createElement('style');
    s.id = 'tcmp-style';
    s.textContent =
      '.compare-col.tcmp-on{display:block}' +
      '@media (min-width:1200px) and (max-width:1799px){' +
      '.compare-col.tcmp-on{position:fixed;top:var(--top-h,0px);right:0;bottom:var(--footer-h,0px);width:min(440px,100vw);z-index:1000;overflow-y:auto;box-shadow:var(--shadow);border-left:1px solid var(--border)}}' +
      '@media (max-width:1199px){' +
      '.compare-col.tcmp-on{position:fixed;left:0;right:0;bottom:0;z-index:1150;max-height:62dvh;overflow-y:auto;background:var(--surface-1);border-top:1px solid var(--border);border-radius:var(--radius-panel) var(--radius-panel) 0 0;padding-bottom:env(safe-area-inset-bottom)}}' +
      '.tcmp-head{position:sticky;top:0;background:var(--surface-1);z-index:2;display:flex;align-items:center;justify-content:space-between;gap:var(--space-2);padding:var(--space-3) var(--space-3) var(--space-2);border-bottom:1px solid var(--border)}' +
      '.tcmp-head h2{font-size:var(--fs-4);margin:0}' +
      '.tcmp-note{padding:var(--space-1) var(--space-3);font-size:var(--fs-1);color:var(--text-muted)}' +
      '.tcmp-grid{display:grid;gap:var(--space-2);padding:var(--space-2) var(--space-3) var(--space-3)}' +
      '@media (min-width:1200px){.tcmp-grid{grid-template-columns:repeat(var(--tcmp-n,1),minmax(0,1fr))}}' +
      '@media (max-width:1199px){.tcmp-grid{grid-template-columns:minmax(0,1fr)}}' +
      '.tcmp-card{min-width:0;border:1px solid var(--border);border-radius:var(--radius-panel);padding:var(--space-2);background:var(--surface-2)}' +
      '.tcmp-card-h{display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-2);margin-bottom:var(--space-1)}' +
      '.tcmp-f{padding:var(--space-1) 0;border-top:1px solid var(--border);font-size:var(--fs-2)}' +
      '.tcmp-f .k{font-size:var(--fs-1);color:var(--text-muted)}' +
      '.tcmp-f .v{margin-top:2px;overflow-wrap:anywhere}' +
      '.tcmp-st{font-weight:500}' +
      '.tcmp-st-gap{color:var(--cap-over)}' +
      '.tcmp-st-planned{color:var(--cap-tight)}' +
      '.tcmp-st-check{color:var(--text-primary)}' +
      '.tcmp-st-ok{color:var(--cap-room)}';
    document.head.appendChild(s);
  }

  /* ---- render ---- */

  function render() {
    if (typeof document === 'undefined') return;
    var col = document.getElementById('compare-col');
    if (!col) return;
    // The layout keeps a column for Compare only while it is open (css/app.css).
    var app = document.querySelector('.app');
    if (app) app.classList.toggle('cmp-open', items.length > 0);
    if (!items.length) {
      col.hidden = true;
      col.classList.remove('tcmp-on');
      col.innerHTML = '';
      return;
    }
    ensureStyle();
    col.hidden = false;
    col.classList.add('tcmp-on');
    col.style.setProperty('--tcmp-n', String(items.length));
    col.innerHTML =
      '<div class="tcmp-head"><h2>Compare</h2>' +
      '<button type="button" class="btn small" data-tcmp-clear>Clear all</button></div>' + ((window.PeelUtil || {}).SCREEN_NOTE || '') +
      (note ? '<div class="tcmp-note">' + esc(note) + '</div>' : '') +
      '<div class="tcmp-grid">' + items.map(cardHTML).join('') + '</div>';
  }

  // Delegated remove / clear (the column's innerHTML is rebuilt on render).
  var wired = false;
  function ensureWired() {
    if (wired || typeof document === 'undefined') return;
    wired = true;
    document.addEventListener('click', function (e) {
      var rm = e.target && e.target.closest ? e.target.closest('[data-tcmp-rm]') : null;
      if (rm && rm.closest('#compare-col')) { remove(+rm.getAttribute('data-tcmp-rm')); return; }
      var cl = e.target && e.target.closest ? e.target.closest('[data-tcmp-clear]') : null;
      if (cl && cl.closest('#compare-col')) clear();
    });
  }
  ensureWired();

  var api = { addDevelopment: addDevelopment, addArea: addArea, remove: remove, clear: clear, render: render,
    // Phase 5 exports: the comparison PDF reads the current items through items()
    // and reuses the pure helpers through the api (same inputs as the tool).
    items: function () { return items.slice(); },
    sumEstimates: sumEstimates, tightestConstraint: tightestConstraint,
    // exposed for tests / debugging (not part of the contract)
    _items: function () { return items.slice(); } };

  if (typeof window !== 'undefined') window.PeelToolCompare = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = { sumEstimates: sumEstimates, tightestConstraint: tightestConstraint, api: api };
})();
