/* Peel Growth Pipeline (unofficial) – Phase 3b tool 5: Inquiry response draft.
 *
 * Builds a plain-text servicing summary for a development (or a map point)
 * that staff can paste into an inquiry reply, plus a Copy button.
 *
 * Contract:
 *   window.PeelToolInquiry = {
 *     draftForDevelopment(p),   // p: a development project object → draft text (also shown)
 *     draftForPoint(latlng, program?), // {lat,lng} + optional {name,single,town,apartment,jobs}
 *     copy(text),               // clipboard with textarea fallback → Promise<bool>
 *   }
 * buildDraft(fields) is PURE (plain object → string) and unit-tested; it never
 * touches the app bridge. The draftFor* wrappers gather fields lazily through
 * window.PeelApp and render the result into the Tool result pane via
 * PeelTools.openResult. Another worker adds the Export-menu entry point.
 *
 * The sewer-path section uses the servicing model's drainage path
 * (svcFacts().path) rather than the map trace: tracing would move the map and
 * redraw the trace layer as a side effect, which a copy-paste draft must not do.
 */
(function () {
  'use strict';

  var P = function () { return (typeof window !== 'undefined' && window.PeelApp) || null; };
  var PT = function () { return (typeof window !== 'undefined' && window.PeelTools) || null; };

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ---- tiny plain-text formatters (local so buildDraft stays pure) ---- */
  var fInt = function (n) { return n == null || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-CA'); };
  var f1 = function (n) {
    if (n == null || !isFinite(n)) return '–';
    return Number(n).toLocaleString('en-CA', { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 });
  };
  var fCoord = function (n) { return n == null || !isFinite(n) ? '–' : Number(n).toFixed(5); };

  var DISCLAIMER = 'Unofficial prototype · public data only · not a Region of Peel product';
  var PREPARED_BY = 'Prepared by Peel Growth Pipeline (unofficial)';

  /**
   * PURE: build the plain-text draft from a fields object.
   * fields: {
   *   title, sub, site,                       // strings
   *   program, programNote,                   // string | null
   *   water: { zone, avg, maxDay, peakHour } | null,
   *   wastewater: { path:[names], plant, plantReserve, avg, peak, wetPeak, nearest } | null,
   *   constraints: [{ name, detail, status, out }],  // tightest first
   *   noServicing: bool,                      // servicing model not loaded
   *   snapshotDate, preparedDate,             // 'YYYY-MM-DD' | null
   * }
   */
  function buildDraft(f) {
    f = f || {};
    var L = [];
    L.push('Servicing inquiry summary — ' + (f.title || 'Untitled site'));
    if (f.sub) L.push(f.sub);
    L.push('Prepared ' + (f.preparedDate || 'date unknown') + ' · Peel Growth Pipeline (unofficial)');
    L.push('');
    L.push('Site: ' + (f.site || 'location unknown'));
    if (f.program) { L.push(''); L.push('Proposed program (screening estimate): ' + f.program); }
    if (f.programNote) L.push('Note: ' + f.programNote);
    if (f.noServicing) {
      L.push('');
      L.push('Servicing context is unavailable: the servicing model has not loaded in this session.');
    } else {
      if (f.water) {
        L.push('');
        L.push('Water (Peel design criteria, screening estimate)');
        L.push('  Pressure zone: ' + (f.water.zone || 'unknown'));
        L.push('  Average ' + f1(f.water.avg) + ' L/s · max day ' + f1(f.water.maxDay) + ' L/s · peak hour ' + f1(f.water.peakHour) + ' L/s');
      }
      if (f.wastewater) {
        var w = f.wastewater;
        L.push('');
        L.push('Wastewater (Peel design criteria, screening estimate)');
        if (w.path && w.path.length) L.push('  Sewer path: ' + w.path.join(' → '));
        if (w.nearest) L.push('  Nearest existing sewer: ' + w.nearest);
        L.push('  Average ' + f1(w.avg) + ' L/s · peak dry ' + f1(w.peak) + ' L/s · peak wet ' + f1(w.wetPeak) + ' L/s');
        if (w.plant) L.push('  Treatment: ' + w.plant + (w.plantReserve != null ? ' · uncommitted reserve ' + f1(w.plantReserve) + ' ML/d' : ''));
      }
      var cons = f.constraints || [];
      if (cons.length) {
        L.push('');
        L.push('Tightest constraint');
        var c0 = cons[0];
        L.push('  ' + c0.name + (c0.detail ? ' — ' + c0.detail : ''));
        L.push('  Status: ' + c0.status + (c0.out ? ' · runs out ' + c0.out : ''));
        if (cons.length > 1) {
          L.push('');
          L.push('Other constraints');
          cons.slice(1).forEach(function (c) {
            L.push('  - ' + c.name + ' (' + c.status + (c.out ? ', runs out ' + c.out : '') + ')' + (c.detail ? ' — ' + c.detail : ''));
          });
        }
      } else if (!f.noServicing) {
        L.push('');
        L.push('Constraints: none flagged — no sewer on its path reaches 90% of capacity by build-out and no tabled facility applies (screening estimate).');
      }
    }
    L.push('');
    L.push('Caveats');
    L.push('  - Screening estimate from public data and Peel design criteria: not a hydraulic model, not a functional servicing report.');
    L.push('  - Sewer capacity is full-pipe Manning on the published slope; "check the data" flags likely slope errors rather than real shortfalls.');
    L.push('  - The 2026 DC capital maps are a draft; project schedules change annually.');
    L.push('  - Confirm servicing with the Region of Peel before relying on these figures.');
    L.push('');
    L.push('Data dates');
    L.push('  - Planning applications and building permits: ' + (f.snapshotDate || 'live pull') + ' (weekly snapshot)');
    L.push('  - 2021 Census; Region of Peel annual reports; 2026 DC capital maps (draft)');
    L.push('');
    L.push(DISCLAIMER);
    L.push(PREPARED_BY);
    return L.join('\n');
  }

  /* ---- field gathering (lazy through the bridge) ---- */

  function safe(fn, dflt) { try { return fn(); } catch (err) { return dflt; } }

  function plantName(app, pl) {
    var shorts = (app.scope && app.scope.PLANT_SHORT) || {};
    return shorts[pl] || (pl ? pl + ' WRRF' : null);
  }

  var CON_STATUS_TXT = { gap: 'runs out before a DC project relieves it', planned: 'DC project in time', check: 'check the data', ok: 'room to build-out' };

  function constraintFields(c) {
    return {
      name: c.name || c.id || 'Constraint',
      detail: c.sub || '',
      status: CON_STATUS_TXT[c.status] || c.status || 'unknown',
      out: c.out === 'today' ? 'already' : (c.out == null ? null : '≈' + c.out),
    };
  }

  function fieldsFor(app, p, title, sub, programText, programNote) {
    var e = safe(function () { return app.scope.estimate(p); }, null);
    var f = safe(function () { return app.scope.svcFacts(p); }, null);
    var needs = safe(function () { return app.devNeeds(p); }, null);
    var snap = app.state && app.state.snapshot && app.state.snapshot.generatedAt;
    var noSvc = !(app.state && app.state.svcModel);

    var water = null, wastewater = null;
    if (f && e) {
      var cb = e.combined || {};
      water = {
        zone: f.z && f.z.name ? f.z.name.replace('Pressure zone ', 'Zone ') : null,
        avg: cb.water && cb.water.avg, maxDay: cb.water && cb.water.maxDay, peakHour: cb.water && cb.water.peakHour,
      };
      var path = (f.path || []).map(function (a) {
        return a.kind === 'plant' ? plantName(app, a.plant) + ' inflow' : String(a.name || '').replace(/^Lakeview · /, 'G.E. Booth · ');
      });
      var nearest = null;
      var k = safe(function () { return app.nearestPipe(p.lng, p.lat); }, -1);
      if (k != null && k >= 0) {
        var st = safe(function () { return app.pipeStats(k); }, null);
        if (st && st.p) nearest = st.p[0] + ' mm sanitary sewer' + (st.r1 != null ? ', ' + Math.round(st.r1 * 100) + '% of full capacity at build-out (screening estimate)' : '');
      }
      wastewater = {
        path: path, nearest: nearest,
        avg: cb.wastewater && cb.wastewater.avg, peak: cb.wastewater && cb.wastewater.peak, wetPeak: cb.wastewater && cb.wastewater.wetPeak,
        plant: f.pl ? plantName(app, f.pl) : null,
        plantReserve: f.cap ? f.reserve : null,
      };
    }
    var today = new Date();
    var pd = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    return {
      title: title, sub: sub,
      site: fCoord(p.lat) + ', ' + fCoord(p.lng),
      program: programText, programNote: programNote,
      water: water, wastewater: wastewater,
      constraints: (needs || []).map(constraintFields),
      noServicing: noSvc,
      snapshotDate: snap ? String(snap).slice(0, 10) : null,
      preparedDate: pd,
    };
  }

  function programTextFor(e) {
    if (!e || !(e.totalUnits > 0 || (e.employment && e.employment.jobs > 0))) return null;
    var mix = e.units || {};
    var parts = [];
    if (mix.single) parts.push(mix.single + ' single');
    if (mix.town) parts.push(mix.town + ' town');
    if (mix.apartment) parts.push(mix.apartment + ' apartment');
    var s = fInt(e.totalUnits) + ' units' + (parts.length ? ' (' + parts.join(' · ') + ')' : '') + ' · ~' + fInt(e.population) + ' people';
    if (e.employment && e.employment.jobs) s += ' + ~' + fInt(e.employment.jobs) + ' jobs';
    return s;
  }

  function showDraft(text, title, reopen) {
    var pt = PT();
    if (!pt) return text;
    if (typeof document !== 'undefined') {
      var s = document.getElementById('tinq-style');
      if (!s) {
        s = document.createElement('style');
        s.id = 'tinq-style';
        s.textContent =
          '.tinq-actions{display:flex;gap:var(--space-2);align-items:center;margin-bottom:var(--space-2)}' +
          '.tinq-pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--fs-2);line-height:1.5;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-panel);padding:var(--space-3);margin:0}' +
          '.tinq-note{font-size:var(--fs-1);color:var(--text-muted)}';
        document.head.appendChild(s);
      }
    }
    pt.openResult({
      title: title,
      html: '<div class="tinq-wrap"><div class="tinq-actions"><button type="button" class="btn small" data-tinq-copy>Copy</button>' +
        '<span class="tinq-note">Plain text — paste it into the reply.</span></div>' +
        '<pre class="tinq-pre">' + esc(text) + '</pre></div>',
      reopen: reopen || null,
    });
    return text;
  }

  function draftForDevelopment(p) {
    var app = P();
    if (!app || !app.scope || !p) return null;
    var e = safe(function () { return app.scope.estimate(p); }, null);
    var title = p.title || 'Untitled development';
    var sub = [p.municipality, p.phase].filter(Boolean).join(' · ');
    var text = buildDraft(fieldsFor(app, p, title, sub || null, programTextFor(e), null));
    return showDraft(text, 'Inquiry draft — ' + title, function () { draftForDevelopment(p); });
  }

  function draftForPoint(latlng, program) {
    var app = P();
    if (!app || !app.scope || !latlng) return null;
    program = program || {};
    var w = {
      id: 'inq-' + Date.now().toString(36),
      name: program.name || 'Inquiry point',
      lat: latlng.lat, lng: latlng.lng,
      single: Math.max(0, +program.single || 0), town: Math.max(0, +program.town || 0),
      apartment: Math.max(0, +program.apartment || 0), jobs: Math.max(0, +program.jobs || 0),
      ha: Math.max(0, +program.ha || 0), phase: 'review', municipality: '',
    };
    var p = safe(function () { return app.whatIfProject(w); }, null);
    if (!p) return null;
    var e = safe(function () { return app.scope.estimate(p); }, null);
    var hasProgram = (w.single + w.town + w.apartment) > 0 || w.jobs > 0;
    var text = buildDraft(fieldsFor(
      app, p,
      'Point ' + fCoord(latlng.lat) + ', ' + fCoord(latlng.lng),
      null,
      programTextFor(e),
      hasProgram ? null : 'No development program was supplied, so flows and constraints need a unit mix — pass one as the second argument to draftForPoint. Servicing context below is for the point itself.'
    ));
    return showDraft(text, 'Inquiry draft — point', function () { draftForPoint(latlng, program); });
  }

  function copy(text) {
    var done = function (ok) { return !!ok; };
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(String(text)).then(function () { return true; }, function () { return fallbackCopy(text); });
      }
    } catch (err) { /* fall through */ }
    return Promise.resolve(fallbackCopy(text)).then(done);
  }

  function fallbackCopy(text) {
    try {
      if (typeof document === 'undefined') return false;
      var ta = document.createElement('textarea');
      ta.value = String(text);
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    } catch (err) { return false; }
  }

  // Delegated Copy button (the pane's innerHTML is rebuilt by openResult).
  var wired = false;
  if (typeof document !== 'undefined' && !wired) {
    wired = true;
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-tinq-copy]') : null;
      if (!b) return;
      var wrap = b.closest('.tinq-wrap');
      var pre = wrap && wrap.querySelector('.tinq-pre');
      if (!pre) return;
      copy(pre.textContent).then(function (ok) {
        b.textContent = ok ? 'Copied' : 'Copy failed — select the text manually';
        setTimeout(function () { b.textContent = 'Copy'; }, 2500);
      });
    });
  }

  var api = { buildDraft: buildDraft, draftForDevelopment: draftForDevelopment, draftForPoint: draftForPoint, copy: copy };
  if (typeof window !== 'undefined') window.PeelToolInquiry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
