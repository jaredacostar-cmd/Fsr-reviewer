/* Peel Growth Pipeline (unofficial) – Phase 3b tool 7: Batch test sites.
 *
 * Upload (or paste) a CSV of candidate sites; each row gets the same servicing
 * check the single-site "Test a site" flow runs, without adding anything to
 * the map. Results render as a table with an Export CSV button.
 *
 * Contract:
 *   window.PeelToolBatch = { open() }
 * open() shows a file input + format help in the Tool result pane via
 * PeelTools.openResult. Another worker wires the "Batch from CSV" entry point;
 * open() works standalone.
 *
 * CSV columns (header row, case-insensitive; a headerless file is read
 * positionally as lat,lng,single,town,apartment,jobs,ha):
 *   name, point ("lat,lng") | lat | lng, single, town, apartment (apt),
 *   jobs, ha (site area, hectares)
 *
 * Pure, unit-tested: parseBatchCSV(text) → { rows, errors }.
 * rows: [{ name, lat, lng, single, town, apartment, jobs, ha, line }]
 * errors: [{ line, message }]
 */
(function () {
  'use strict';

  var P = function () { return (typeof window !== 'undefined' && window.PeelApp) || null; };
  var PT = function () { return (typeof window !== 'undefined' && window.PeelTools) || null; };

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var MAX_ROWS = 200;

  /* ---- pure CSV parsing ---- */

  function splitCSVLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); });
  }

  var HEADER_MAP = [
    [/^name$/i, 'name'],
    [/^point$/i, 'point'],
    [/^(lat|latitude)$/i, 'lat'],
    [/^(lng|lon|long|longitude)$/i, 'lng'],
    [/single|detached|semis?$/i, 'single'],
    [/town/i, 'town'],
    [/^(apt|apartments?)$|apartment/i, 'apartment'],
    [/jobs?|employment/i, 'jobs'],
    [/^(ha|hectares?|site_?ha|area_?ha|site ?area)$/i, 'ha'],
  ];

  function headerIndex(cells) {
    var idx = {};
    cells.forEach(function (cell, i) {
      for (var k = 0; k < HEADER_MAP.length; k++) {
        if (HEADER_MAP[k][0].test(cell) && !(HEADER_MAP[k][1] in idx)) { idx[HEADER_MAP[k][1]] = i; break; }
      }
    });
    return ('lat' in idx || 'lng' in idx || 'point' in idx) ? idx : null;
  }

  function num(v, what, line, errors, min) {
    if (v == null || v === '') return 0;
    var n = Number(String(v).replace(/,/g, ''));
    var lo = min == null ? 0 : min;
    if (!isFinite(n) || n < lo) { errors.push({ line: line, message: what + ' must be a number ≥ ' + lo + ', got "' + v + '"' }); return null; }
    return n;
  }

  function parseBatchCSV(text) {
    var rows = [], errors = [];
    var lines = String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r?\n/);
    var cells = lines.map(splitCSVLine).filter(function (c) { return c.length > 1 || (c.length === 1 && c[0] !== ''); });
    if (!cells.length) return { rows: rows, errors: errors };
    var idx = headerIndex(cells[0]);
    var start = 0, positional = null;
    if (idx) start = 1;
    else {
      // No header: positional. 8+ cols → name first; 7 → lat,lng,…; 2 → lat,lng.
      var n = cells[0].length;
      if (n >= 8) positional = ['name', 'lat', 'lng', 'single', 'town', 'apartment', 'jobs', 'ha'];
      else if (n >= 3) positional = ['lat', 'lng', 'single', 'town', 'apartment', 'jobs', 'ha'];
      else if (n === 2) positional = ['lat', 'lng'];
      else { errors.push({ line: 1, message: 'Expected at least lat,lng columns.' }); return { rows: rows, errors: errors }; }
    }
    var get = function (row, key) {
      var i = idx ? idx[key] : positional.indexOf(key);
      return i == null || i < 0 ? '' : (row[i] == null ? '' : row[i]);
    };
    for (var r = start; r < cells.length; r++) {
      var line = r + 1, row = cells[r], bad = errors.length;
      var name = String(get(row, 'name') || '').trim();
      var latRaw = get(row, 'lat'), lngRaw = get(row, 'lng');
      var ptRaw = get(row, 'point');
      if (ptRaw) {
        var m = String(ptRaw).split(',');
        latRaw = m[0]; lngRaw = m[1];
      }
      var lat = num(latRaw, 'lat', line, errors, -90), lng = num(lngRaw, 'lng', line, errors, -180);
      if (lat != null && (lat < -90 || lat > 90)) { errors.push({ line: line, message: 'lat out of range (-90…90): ' + latRaw }); lat = null; }
      if (lng != null && (lng < -180 || lng > 180)) { errors.push({ line: line, message: 'lng out of range (-180…180): ' + lngRaw }); lng = null; }
      var single = num(get(row, 'single'), 'single', line, errors);
      var town = num(get(row, 'town'), 'town', line, errors);
      var apartment = num(get(row, 'apartment'), 'apartment', line, errors);
      var jobs = num(get(row, 'jobs'), 'jobs', line, errors);
      var ha = num(get(row, 'ha'), 'ha', line, errors);
      if (errors.length !== bad || lat == null || lng == null || single == null || town == null || apartment == null || jobs == null || ha == null) continue;
      if (rows.length >= MAX_ROWS) { errors.push({ line: line, message: 'Row limit is ' + MAX_ROWS + ' — remaining rows skipped.' }); break; }
      rows.push({ name: name || ('Site ' + line), lat: lat, lng: lng, single: single, town: town,
        apartment: apartment, jobs: jobs, ha: ha, line: line });
    }
    return { rows: rows, errors: errors };
  }

  /* ---- servicing checks (through the bridge; mirrors Test-a-site) ---- */

  function safe(fn, dflt) { try { return fn(); } catch (err) { return dflt; } }

  function checkRow(app, row) {
    var w = { id: 'batch-' + row.line, name: row.name, lat: row.lat, lng: row.lng,
      single: row.single, town: row.town, apartment: row.apartment, jobs: row.jobs,
      ha: row.ha, phase: 'review', municipality: '' };
    var p = safe(function () { return app.whatIfProject(w); }, null);
    if (!p) return { row: row, status: 'error', note: 'Could not build the test project.' };
    var e = safe(function () { return app.scope.estimate(p); }, null);
    var units = e ? Math.round(e.totalUnits) : 0;
    var people = e ? Math.round(e.population) : 0;
    if (!e || !(units > 0 || (e.employment && e.employment.jobs > 0))) {
      return { row: row, status: 'skipped', note: 'No program — add units or jobs.', units: units, people: people };
    }
    var needs = safe(function () { return app.devNeeds(p); }, null);
    if (!needs) return { row: row, status: 'nodata', note: 'Servicing model not loaded.', units: units, people: people,
      maxDay: e.combined.water.maxDay, wetPeak: e.combined.wastewater.wetPeak };
    var t = needs[0] || null;
    var status = 'ok', note = 'Screens with room';
    if (t) {
      if (t.status === 'gap') { status = 'constrained'; note = 'Screens constrained'; }
      else if (t.status === 'planned') { status = 'constrained'; note = 'Screens constrained — DC project in time'; }
      else if (t.status === 'check') { status = 'check'; note = 'Check the data'; }
    }
    return { row: row, status: status, note: note,
      units: units, people: people,
      maxDay: e.combined.water.maxDay, wetPeak: e.combined.wastewater.wetPeak,
      tightest: t ? (t.name + (t.sub ? ' — ' + t.sub : '')) : null,
      tightestOut: t ? (t.out === 'today' ? 'already' : (t.out == null ? null : '≈' + t.out)) : null };
  }

  function runAll(app, rows) {
    var noSvc = !(app.state && app.state.svcModel);
    return rows.map(function (row) {
      if (noSvc) return { row: row, status: 'nodata', note: 'Servicing model not loaded.', units: Math.round(row.single + row.town + row.apartment), people: null };
      return checkRow(app, row);
    });
  }

  /* ---- result rendering ---- */

  function ensureStyle() {
    if (typeof document === 'undefined' || document.getElementById('tbatch-style')) return;
    var s = document.createElement('style');
    s.id = 'tbatch-style';
    s.textContent =
      '.tbatch-help{font-size:var(--fs-2);color:var(--text-secondary)}' +
      '.tbatch-help code{background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:0 4px;font-size:var(--fs-1)}' +
      '.tbatch-in{margin:var(--space-2) 0}' +
      '.tbatch-in textarea{width:100%;min-height:120px;font-family:var(--font-mono,monospace);font-size:var(--fs-1);background:var(--surface-1);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-panel);padding:var(--space-2)}' +
      '.tbatch-actions{display:flex;gap:var(--space-2);flex-wrap:wrap;margin:var(--space-2) 0}' +
      '.tbatch-st-ok{color:var(--cap-room);font-weight:500}' +
      '.tbatch-st-constrained{color:var(--cap-over);font-weight:500}' +
      '.tbatch-st-check{color:var(--cap-tight);font-weight:500}' +
      '.tbatch-st-skipped,.tbatch-st-nodata,.tbatch-st-error{color:var(--text-muted)}' +
      '.tbatch-err{font-size:var(--fs-2);color:var(--cap-over)}';
    document.head.appendChild(s);
  }

  var lastResults = null;

  function openHTML() {
    return '<div class="tbatch-wrap">' +
      '<p class="tbatch-help">CSV with a header row. Columns: <code>name</code>, <code>point</code> (“lat,lng”) or <code>lat</code> + <code>lng</code>, ' +
      '<code>single</code>, <code>town</code>, <code>apartment</code> (or <code>apt</code>), <code>jobs</code>, <code>ha</code> (site area, hectares). ' +
      'Without a header, columns are read as <code>lat,lng,single,town,apartment,jobs,ha</code>. ' +
      'Each row gets the Test-a-site servicing check (screening estimate); nothing is added to the map. Limit ' + MAX_ROWS + ' rows.</p>' +
      '<div class="tbatch-in"><input type="file" data-tbatch-file accept=".csv,text/csv,text/plain" aria-label="Choose a CSV file"></div>' +
      '<div class="tbatch-in"><textarea data-tbatch-text placeholder="…or paste CSV here" aria-label="Paste CSV"></textarea></div>' +
      '<div class="tbatch-actions"><button type="button" class="btn" data-tbatch-run>Run checks</button></div>' +
      '<div data-tbatch-out></div></div>';
  }

  function fmtN(n) { return n == null ? '–' : Math.round(n).toLocaleString('en-CA'); }
  function fmtLs(n) { return n == null || !isFinite(n) ? '–' : (Number(n).toLocaleString('en-CA', { maximumFractionDigits: 1 }) + ' L/s'); }

  function resultsHTML(parsed, results) {
    var h = '';
    if (parsed.errors.length) {
      h += '<p class="tbatch-err">' + parsed.errors.length + ' row' + (parsed.errors.length === 1 ? '' : 's') + ' skipped:</p><ul class="tbatch-err">' +
        parsed.errors.slice(0, 10).map(function (e) { return '<li>Line ' + e.line + ': ' + esc(e.message) + '</li>'; }).join('') + '</ul>';
    }
    if (!results.length) return h + '<p class="muted">No valid rows.</p>';
    h += '<table class="dt"><caption>' + results.length + ' sites checked <span class="est-tag">screening estimate</span></caption>' +
      '<thead><tr><th>Site</th><th>Units</th><th>People</th><th>Water max day</th><th>WW peak wet</th><th>Status</th><th>Tightest constraint</th></tr></thead><tbody>' +
      results.map(function (r) {
        return '<tr><td>' + esc(r.row.name) + '<br><span class="muted">' + r.row.lat.toFixed(5) + ', ' + r.row.lng.toFixed(5) + '</span></td>' +
          '<td>' + fmtN(r.units) + '</td><td>' + (r.people == null ? '–' : fmtN(r.people)) + '</td>' +
          '<td>' + fmtLs(r.maxDay) + '</td><td>' + fmtLs(r.wetPeak) + '</td>' +
          '<td><span class="tbatch-st-' + r.status + '">' + esc(r.note) + '</span></td>' +
          '<td>' + (r.tightest ? esc(r.tightest) + (r.tightestOut ? ' <span class="muted">· runs out ' + esc(r.tightestOut) + '</span>' : '') : '<span class="muted">–</span>') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="tbatch-actions"><button type="button" class="btn small" data-tbatch-export>Export CSV</button></div>';
    return h;
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    if (!lastResults || typeof document === 'undefined') return;
    var head = ['name', 'lat', 'lng', 'single', 'town', 'apartment', 'jobs', 'ha', 'units', 'people',
      'water_maxday_ls', 'ww_wetpeak_ls', 'status', 'tightest_constraint'];
    var lines = [head.join(',')].concat(lastResults.map(function (r) {
      return [r.row.name, r.row.lat, r.row.lng, r.row.single, r.row.town, r.row.apartment, r.row.jobs, r.row.ha,
        r.units == null ? '' : r.units, r.people == null ? '' : r.people,
        r.maxDay == null ? '' : Math.round(r.maxDay * 10) / 10, r.wetPeak == null ? '' : Math.round(r.wetPeak * 10) / 10,
        r.note, r.tightest || ''].map(csvCell).join(',');
    }));
    var disc = (typeof window !== 'undefined' && window.PeelUtil && window.PeelUtil.CSV_DISCLAIMER) || '';
    var blob = new Blob([disc + lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'batch-servicing.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function runFromText(text) {
    var app = P(), pt = PT();
    if (!pt) return;
    if (!app) {
      setOut('<p class="muted">The app is still loading — try again in a moment.</p>');
      return;
    }
    var parsed = parseBatchCSV(text);
    lastResults = runAll(app, parsed.rows);
    setOut(resultsHTML(parsed, lastResults));
  }

  function setOut(html) {
    var el = typeof document !== 'undefined' && document.querySelector('[data-tbatch-out]');
    if (el) el.innerHTML = html;
  }

  function open() {
    ensureStyle();
    var pt = PT();
    if (!pt) return;
    lastResults = null;
    pt.openResult({ title: 'Batch test sites', html: openHTML(), reopen: open, screen: true });
  }

  // Delegated file input / run / export (the pane's innerHTML is rebuilt by openResult).
  var wired = false;
  if (typeof document !== 'undefined' && !wired) {
    wired = true;
    document.addEventListener('change', function (e) {
      var fi = e.target && e.target.closest ? e.target.closest('[data-tbatch-file]') : null;
      if (!fi || !fi.files || !fi.files[0]) return;
      var rd = new FileReader();
      rd.onload = function () { runFromText(String(rd.result || '')); };
      rd.readAsText(fi.files[0]);
    });
    document.addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('[data-tbatch-run]')) {
        var ta = document.querySelector('[data-tbatch-text]');
        runFromText(ta ? ta.value : '');
        return;
      }
      if (e.target.closest('[data-tbatch-export]')) exportCSV();
    });
  }

  var api = { open: open };
  if (typeof window !== 'undefined') window.PeelToolBatch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = { parseBatchCSV: parseBatchCSV, api: api };
})();
