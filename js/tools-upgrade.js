/* Peel Growth Pipeline (unofficial) – Phase 3b tool 6: Upgrade a pipe (what-if).
 *
 * "Upgrade this pipe" (wired by another worker into pipe pop-ups) calls
 * open(pipeIndex). A small form in the Tool result pane takes a new diameter
 * and slope; Apply recomputes the Manning full-pipe capacity for that pipe,
 * stores an override on the live pipe record, and recolors the downstream
 * route with an overlay. Everything is labelled "screening · what-if".
 * Reset restores the published diameter/slope/capacity.
 *
 * Contract:
 *   window.PeelToolUpgrade = {
 *     open(pipeIndex),  // form for SEW.data.pipes[pipeIndex]
 *     reset(),          // restore the published values, clear the overlay
 *     active(),         // upgraded pipe index, or -1
 *   }
 *
 * Cache busting: app.js memoizes constraint results in cached(), keyed by
 * scenarioKey(). js/app.js carries a minimal, commented Phase 3b addition:
 * a `sewUpgKey` suffix on scenarioKey() plus PeelApp.upgBump(k) to set it and
 * PeelApp.pipeColour(r) for the capacity colours — so the upgraded capacity
 * flows through devNeeds / DC timing like a real scenario change, with no
 * other app.js behaviour touched.
 *
 * Pure, unit-tested helpers: manningLs(dMm, slopeFrac), routeFrom(pipes, i),
 * pipeXY(pipe). manningLs replicates the app's own formula
 * (Manning, n = 0.013, full circular pipe).
 */
(function () {
  'use strict';

  var P = function () { return (typeof window !== 'undefined' && window.PeelApp) || null; };
  var PT = function () { return (typeof window !== 'undefined' && window.PeelTools) || null; };
  var L = function () { return (typeof window !== 'undefined' && window.L) || null; };

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  var upg = null;   // { i, orig:{d,s,cap}, layer, seq }
  var seq = 0;

  /* ---- pure helpers (exported for tests) ---- */

  // Full-pipe capacity, L/s — the same formula app.js uses for published capacities.
  function manningLs(dMm, S) {
    var d = dMm / 1000;
    return S > 0 ? 1000 * (1 / 0.013) * (Math.PI * d * d / 4) * Math.pow(d / 4, 2 / 3) * Math.sqrt(S) : 0;
  }

  // Downstream route from pipe i: follow each pipe's next-pipe-downstream
  // link (field [3]), like app.js pipeRoute().
  function routeFrom(pipes, i) {
    var out = [], seen = {};
    for (var k = i; k != null && k >= 0 && k < pipes.length && pipes[k] && !seen[k] && out.length < 8000; k = pipes[k][3]) {
      out.push(k); seen[k] = true;
    }
    return out;
  }

  // Pipe geometry: field [10] is flat [x0,y0,x1,y1,…] → [[x,y],…].
  function pipeXY(p) {
    var c = p[10] || [], out = [];
    for (var k = 0; k + 1 < c.length; k += 2) out.push([c[k], c[k + 1]]);
    return out;
  }

  /* ---- the tool ---- */

  function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById('tupg-style')) return;
    var s = document.createElement('style');
    s.id = 'tupg-style';
    s.textContent =
      '.tupg-form{display:grid;gap:var(--space-2);max-width:420px}' +
      '.tupg-form .row{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2)}' +
      '.tupg-actions{display:flex;gap:var(--space-2);flex-wrap:wrap;margin-top:var(--space-1)}' +
      '.tupg-tag{display:inline-block;font-size:var(--fs-1);color:var(--text-muted);border:1px solid var(--border);border-radius:999px;padding:2px var(--space-2);margin-left:var(--space-2);vertical-align:middle}' +
      '.tupg-err{color:var(--cap-over);font-size:var(--fs-2)}' +
      '.tupg-res{font-size:var(--fs-2)}' +
      '.tupg-res .dt{margin-top:var(--space-2)}';
    document.head.appendChild(s);
  }

  function msgHTML(text) {
    return '<p class="muted">' + esc(text) + '</p>';
  }

  function curOf(app, i) {
    var p = app.sewerPipes()[i];
    return { d: p[0], sPct: p[1] * 100, cap: p[2], badSlope: p[1] < 0.0001 };
  }

  function open(i) {
    if (!(window.PeelUtil || {}).PIPE_RESULTS) return;   // pipe-by-pipe results are off for now
    ensureStyle();
    var pt = PT(), app = P();
    if (!pt) return;
    if (!app) { pt.openResult({ title: 'Upgrade a pipe', html: msgHTML('The app is still loading — try again in a moment.') }); return; }
    var pipes = null;
    try { pipes = app.sewerPipes(); } catch (err) { pipes = null; }
    if (!pipes || !pipes[i]) {
      pt.openResult({ title: 'Upgrade a pipe', html: msgHTML('Sewer data is not loaded yet. Open the Wastewater tab (or tap a sewer) first, then use “Upgrade this pipe” again.') });
      return;
    }
    if (upg && upg.i !== i) reset();
    if (!upg) upg = { i: i, orig: null, layer: null };
    else upg.i = i;
    renderForm(null);
  }

  function fieldVal(id) {
    var el = typeof document !== 'undefined' && document.getElementById(id);
    return el ? el.value : '';
  }

  function renderForm(resHTML, errText) {
    var pt = PT(), app = P();
    if (!pt || !app || !upg) return;
    var cur = curOf(app, upg.i);
    var fmtN = function (n) { return n == null ? '–' : Math.round(n).toLocaleString('en-CA'); };
    var baseLine = upg.orig
      ? 'Published: ' + upg.orig.d + ' mm · slope ' + (upg.orig.s * 100).toFixed(3) + '% · ' + (upg.orig.cap ? fmtN(upg.orig.cap) + ' L/s' : 'n/a') +
        ' → now (what-if): ' + cur.d + ' mm · ' + cur.sPct.toFixed(2) + '% · ' + (cur.cap ? fmtN(cur.cap) + ' L/s' : 'n/a') + ' (Manning, n = 0.013).'
      : 'Published: ' + cur.d + ' mm · slope ' + cur.sPct.toFixed(3) + '% · full capacity ' +
        (cur.cap ? fmtN(cur.cap) + ' L/s (Manning, n = 0.013)' : 'n/a') + '.';
    pt.openResult({
      title: 'Upgrade pipe — ' + cur.d + ' mm sewer',
      html: '<div class="tupg-wrap"><p><strong>' + cur.d + ' mm sanitary sewer</strong>' +
        '<span class="tupg-tag">screening · what-if</span></p>' +
        '<p class="small muted">' + esc(baseLine) + '</p>' +
        '<div class="tupg-form"><div class="row">' +
        '<label class="field"><span>New diameter (mm)</span><input id="tupg-d" type="number" min="100" max="4000" step="25" value="' + cur.d + '"></label>' +
        '<label class="field"><span>New slope (%)</span><input id="tupg-s" type="number" min="0.01" max="10" step="0.01" value="' + cur.sPct.toFixed(2) + '"></label>' +
        '</div>' +
        (errText ? '<p class="tupg-err">' + esc(errText) + '</p>' : '') +
        '<div class="tupg-actions"><button type="button" class="btn" data-tupg-apply>Apply upgrade</button>' +
        '<button type="button" class="btn small" data-tupg-reset>Reset</button></div></div>' +
        (resHTML ? '<div class="tupg-res">' + resHTML + '</div>' : '') +
        '<p class="small muted">The upgrade replaces the pipe\u2019s Manning full capacity in this session and recolors its downstream route. ' +
        'Capacity figures are a screening estimate, not a hydraulic model. Reset restores the published values.</p></div>',
      reopen: function () { open(upg.i); },
    });
  }

  function drawOverlay(app, i) {
    var leaf = L();
    if (!leaf) return null;
    if (upg.layer) { try { upg.layer.remove(); } catch (err) { /* ignore */ } }
    var layer = leaf.layerGroup().addTo(app.map);
    var pipes = app.sewerPipes(), route = routeFrom(pipes, i);
    var worst = null;
    route.forEach(function (j) {
      var st = null;
      try { st = app.pipeStats(j); } catch (err) { st = null; }
      var r = st ? st.r1 : null;
      if (r != null && (worst == null || r > worst)) worst = r;
      var latlngs = pipeXY(pipes[j]).map(function (c) { return [c[1], c[0]]; });
      if (latlngs.length < 2) return;
      var color = null;
      try { color = app.pipeColour(r); } catch (err) { color = null; }
      if (!color && typeof document !== 'undefined') {
        try { color = getComputedStyle(document.documentElement).getPropertyValue('--cap-room').trim(); } catch (e) { color = ''; }
      }
      if (!color) return; // no resolved colour: skip rather than hard-code one
      var tip = pipes[j][0] + ' mm sewer' + (r != null ? ' · ' + Math.round(r * 100) + '% of full capacity at build-out' : '') +
        ' <span class="tupg-tag">screening · what-if</span>';
      leaf.polyline(latlngs, { color: color, weight: j === i ? 9 : 6, opacity: 1, lineCap: 'round' })
        .bindTooltip(tip, { sticky: true, className: 'pt' }).addTo(layer);
    });
    upg.layer = layer;
    return { n: route.length, worst: worst };
  }

  function apply() {
    var app = P();
    if (!app || !upg) return;
    var d = Math.round(+fieldVal('tupg-d')), sPct = +fieldVal('tupg-s');
    if (!isFinite(d) || d < 100 || d > 4000) { renderForm(null, 'Diameter must be between 100 and 4000 mm.'); return; }
    if (!isFinite(sPct) || sPct < 0.01 || sPct > 10) { renderForm(null, 'Slope must be between 0.01% and 10% (under 0.01% the published-slope check treats capacity as unreliable).'); return; }
    var pipes = app.sewerPipes(), p = pipes[upg.i];
    if (!upg.orig) upg.orig = { d: p[0], s: p[1], cap: p[2] };
    var newCap = manningLs(d, sPct / 100);
    p[0] = d; p[1] = sPct / 100; p[2] = newCap;
    seq += 1;
    // Bust the app.js DCN cache so devNeeds / DC timing recompute with the upgrade.
    try { if (typeof app.upgBump === 'function') app.upgBump('|upg:' + seq + ':' + upg.i); } catch (err) { /* older app.js: overlay still shows */ }
    var ov = drawOverlay(app, upg.i);
    var fmtN = function (n) { return n == null ? '–' : Math.round(n).toLocaleString('en-CA'); };
    var res = '<table class="dt"><caption>Upgraded capacity <span class="est-tag">screening estimate</span></caption><tbody>' +
      '<tr><td>Diameter</td><td>' + upg.orig.d + ' mm → <strong>' + d + ' mm</strong></td></tr>' +
      '<tr><td>Slope</td><td>' + (upg.orig.s * 100).toFixed(3) + '% → <strong>' + sPct.toFixed(2) + '%</strong></td></tr>' +
      '<tr><td>Full capacity (Manning)</td><td>' + (upg.orig.cap ? fmtN(upg.orig.cap) : 'n/a') + ' L/s → <strong>' + fmtN(newCap) + ' L/s</strong></td></tr>' +
      (ov ? '<tr><td>Downstream route</td><td>' + ov.n + ' pipes recolored' + (ov.worst != null ? ' · tightest now ' + Math.round(ov.worst * 100) + '% of capacity' : '') + '</td></tr>' : '') +
      '</tbody></table>' +
      '<p class="small">Tap the pipe (or a development it serves) to see the updated loads — the development and DC timing views now use the upgraded capacity.</p>';
    renderForm(res, null);
  }

  function reset() {
    var app = P();
    if (!app || !upg) return false;
    if (upg.orig) {
      var pipes = null;
      try { pipes = app.sewerPipes(); } catch (err) { pipes = null; }
      if (pipes && pipes[upg.i]) { pipes[upg.i][0] = upg.orig.d; pipes[upg.i][1] = upg.orig.s; pipes[upg.i][2] = upg.orig.cap; }
    }
    try { if (typeof app.upgBump === 'function') app.upgBump(''); } catch (err) { /* ignore */ }
    if (upg.layer) { try { upg.layer.remove(); } catch (err) { /* ignore */ } }
    var i = upg.i;
    upg = null;
    // Re-render the base form so the published values show again.
    open(i);
    return true;
  }

  function active() { return upg ? upg.i : -1; }

  // Delegated Apply / Reset (the pane's innerHTML is rebuilt by openResult).
  var wired = false;
  if (typeof document !== 'undefined' && !wired) {
    wired = true;
    document.addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('[data-tupg-apply]')) { apply(); return; }
      if (e.target.closest('[data-tupg-reset]')) { reset(); }
    });
  }

  var api = { open: open, reset: reset, active: active };
  if (typeof window !== 'undefined') window.PeelToolUpgrade = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = { manningLs: manningLs, routeFrom: routeFrom, pipeXY: pipeXY, api: api };
})();
