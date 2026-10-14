/* js/fsr-check.js — FSR cross-check (Phase 7).
 *
 * The site bar's "Check FSR" button opens this panel for the open development: the
 * consultant's population and flows from a Functional Servicing Report are entered and
 * compared against the app's figures for the site — its zone servicing, the traced
 * sewer path, pipe capacities along the path and the plant reserve. Differences over
 * ~10% are flagged (amber over 10%, red over 25%); anything relying on DC works not
 * yet built is flagged from the DC-works timing (the same devWorks gap the site-bar
 * flags use). A one-page comparison goes through the print-report pattern
 * (PeelReports.openReport + window.print()).
 *
 * The comparison / flag / threshold logic is pure and Node-requireable (see
 * tests/fsr-check.test.js); every DOM access and every app-module call is lazy and
 * guarded so the module loads before js/app.js installs PeelApp.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const U = () => root.PeelUtil;
  const App = () => root.PeelApp;
  const H = () => (App() && App().scope) || null;   // the app.js bridge, as in js/devscope.js
  const SD = () => root.PeelSvcData;
  const SC = () => root.PeelSewerCap;
  const DI = () => root.PeelDcInfra;
  const RP = () => root.PeelReports;

  const safe = fn => { try { return fn(); } catch (e) { return null; } };

  // ---- Pure logic (Node-requireable) ------------------------------------------------

  // Flag bands for |% difference| between the consultant's figure and the app's.
  const WARN_PCT = 10, BAD_PCT = 25;

  /** Parse a form value to a number, or null when empty / not a number. */
  function toNum(v) {
    if (v == null) return null;
    const s = String(v).trim().replace(/,/g, '');
    if (!s) return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  const NUM_KEYS = new Set(['population', 'waterAvg', 'waterMaxDay', 'waterPeakHour', 'wwAvg', 'wwPeak', 'wwWetPeak']);
  /** Normalise raw form input: numbers for the flow / population fields, trimmed text otherwise. */
  function normCon(raw) {
    const con = {};
    for (const k of NUM_KEYS) con[k] = toNum(raw && raw[k]);
    con.zone = raw && raw.zone != null ? String(raw.zone).trim() || null : null;
    con.sewerConn = raw && raw.sewerConn != null ? String(raw.sewerConn).trim() || null : null;
    return con;
  }

  /** Signed % difference of the consultant figure vs the app's ((c-a)/a*100). */
  function pctDiff(c, a) {
    if (c == null || a == null) return null;
    if (a === 0) return c === 0 ? 0 : (c > 0 ? Infinity : -Infinity);
    return (c - a) / a * 100;
  }

  /** Flag band for a % difference: ok ≤10%, warn ≤25%, bad beyond, na when missing. */
  function flagFor(d) {
    if (d == null || isNaN(d)) return 'na';
    const m = Math.abs(d);
    if (!isFinite(m)) return 'bad';
    if (m <= WARN_PCT) return 'ok';
    if (m <= BAD_PCT) return 'warn';
    return 'bad';
  }

  /** "+12.3%" / "−12.3%" / "n/a" for a % difference. */
  function fmtDiff(d) {
    if (d == null || isNaN(d)) return 'n/a';
    if (!isFinite(d)) return d > 0 ? '+∞' : '−∞';
    const s = Math.abs(d).toFixed(1);
    return (d > 0 ? '+' : d < 0 ? '−' : '') + s + '%';
  }

  const FLOW_ROWS = [
    ['population', 'Population', 'people'],
    ['waterAvg', 'Water · average day', 'L/s'],
    ['waterMaxDay', 'Water · max day', 'L/s'],
    ['waterPeakHour', 'Water · peak hour', 'L/s'],
    ['wwAvg', 'Sanitary · average', 'L/s'],
    ['wwPeak', 'Sanitary · peak dry', 'L/s'],
    ['wwWetPeak', 'Sanitary · peak wet', 'L/s'],
  ];

  /**
   * The numeric comparison rows: { key, label, unit, con, app, diff, flag }.
   * con / app are plain objects keyed as in FLOW_ROWS (con from normCon).
   */
  function flowRows(con, app) {
    return FLOW_ROWS.map(([key, label, unit]) => {
      const c = con ? con[key] : null, a = app ? app[key] : null;
      const d = c != null ? pctDiff(c, a) : null;
      return { key, label, unit, con: c, app: a, diff: d, flag: c == null || a == null ? 'na' : flagFor(d) };
    });
  }

  // "Pressure zone 5" == "Zone 5" == "5".
  const znorm = s => String(s || '').toLowerCase().replace(/pressure\s*zone/g, '').replace(/\bzone\b/g, '').replace(/[^a-z0-9]/g, '');
  function zoneMatch(a, b) {
    const x = znorm(a), y = znorm(b);
    if (!x || !y) return null;
    return x === y;
  }

  /**
   * The connection-point rows. The zone is auto-compared; the sewer connection is
   * free text (a pipe or manhole reference), so it is always a manual check.
   */
  function connRows(con, app) {
    const zm = zoneMatch(con && con.zone, app && app.zoneFull);
    return [
      {
        label: 'Pressure zone', con: (con && con.zone) || null, app: (app && app.zoneFull) || null,
        flag: zm == null ? 'na' : zm ? 'ok' : 'bad',
        note: zm == null ? 'One side not stated' : zm ? 'Same zone' : 'Different zone — check the connection point',
      },
      {
        label: 'Sewer connection', con: (con && con.sewerConn) || null, app: (app && app.catchmentFull) || null,
        flag: 'manual', note: 'Free text — compare by eye against the traced catchment',
      },
    ];
  }

  /**
   * Pipe capacity along the sewer path, from SC().pathPipes(p): the tightest local
   * pipe (under 750 mm) and the tightest trunk (750 mm and over). Bands follow the map legend:
   * green under 85% (free flowing), amber 85–100% (near full), red over 100% (surcharged).
   */
  function pipeChecks(pp) {
    if (!pp) return [];
    const out = [];
    for (const [kind, label] of [['local', 'Local sewers (under 750 mm)'], ['trunk', 'Trunk sewers (750 mm and over)']]) {
      const x = pp[kind];
      if (!x || x.r1 == null || !isFinite(x.r1)) continue;
      const pct = x.r1 * 100;
      out.push({
        label: `${label}${x.p && x.p[0] ? ` · ${x.p[0]} mm` : ''}`,
        pct, flag: pct < 85 ? 'ok' : pct <= 100 ? 'warn' : 'bad',
      });
    }
    return out;
  }

  /** The plant's uncommitted reserve vs the development's share of it (ML/d). */
  function plantCheck(c) {
    const f1 = n => n == null || !isFinite(n) ? '–' : String(Math.round(n * 10) / 10);
    if (!c || c.reserve == null) return { flag: 'na', text: 'No plant figures for this development.' };
    if (c.reserve <= 0) return { flag: 'bad', text: `${c.name || 'The plant'} screens over rated capacity — no uncommitted reserve.` };
    const share = c.use != null && c.use > 0 ? `; this development ≈${(c.use / c.reserve * 100).toFixed(1)}% of it` : '';
    return { flag: 'ok', text: `${c.name || 'Plant'}: uncommitted reserve ${f1(c.reserve)} ML/d${share}.` };
  }

  /**
   * DC-works timing flags from the devWorks shape ({ needBy, gap, trunks }) — the same
   * "relies on DC works" logic the site-bar flags use (Phase 1).
   */
  function dcCheck(w) {
    if (!w) return [{ level: 'na', text: 'DC works not loaded.' }];
    const out = [];
    if (w.gap) out.push({ level: 'bad', text: `Relies on DC works not yet built: committed before the planned main it connects to (construction ${w.needBy}, 2026 DC draft).` });
    else if (w.needBy) out.push({ level: 'warn', text: `Outside the existing network: servicing about ${w.needBy} on the 2026 DC draft schedule.` });
    for (const t of (w.trunks || []).filter(t => t && t.y).slice(0, 3))
      out.push({ level: 'info', text: `Downstream DC trunk: ${t.y}${t.d ? ` · ${t.d} mm` : ''}${t.p ? ` · project ${t.p}` : ''} (2026 DC draft).` });
    return out;
  }

  /** Count rows by flag. */
  function summarize(rows) {
    const s = { ok: 0, warn: 0, bad: 0, na: 0, manual: 0 };
    for (const r of rows || []) if (s[r.flag] != null) s[r.flag]++;
    return s;
  }

  /** One-line verdict for a flag summary. */
  function verdictOf(s) {
    if (!s) return '';
    const p = [];
    if (s.bad) p.push(`${s.bad} differ by more than 25%`);
    if (s.warn) p.push(`${s.warn} differ 10–25%`);
    if (s.ok) p.push(`${s.ok} match within 10%`);
    if (s.na) p.push(`${s.na} not entered`);
    return p.length ? p.join('; ') + '.' : 'No figures entered yet.';
  }

  // ---- App values (browser only) --------------------------------------------------

  /**
   * The app's side of the comparison for a development: the demand estimate the site
   * bar shows (Peel design criteria), the pressure zone, the traced sewer path, the
   * tightest pipes along the path, the plant reserve and the DC works it relies on.
   */
  function appValues(p) {
    const h = H();
    if (!h) return null;
    const f = safe(() => h.svcFacts && h.svcFacts(p));
    if (!f || !f.e || !f.cb) return null;
    const cb = f.cb, e = f.e, sd = SD();
    const p0 = f.path && f.path.length ? f.path[0] : null;
    const short = n => sd && n ? n.replace(/^Lakeview · /, 'G.E. Booth · ').replace(/^[^·]+· /, '') : n;
    return {
      population: e.population, jobs: e.employment ? e.employment.jobs : 0,
      waterAvg: cb.water.avg, waterMaxDay: cb.water.maxDay, waterPeakHour: cb.water.peakHour,
      wwAvg: cb.wastewater.avg, wwPeak: cb.wastewater.peak, wwWetPeak: cb.wastewater.wetPeak,
      zoneFull: f.z ? f.z.name : null,
      catchmentFull: p0 && sd ? sd.drName(p0) : null,
      catchmentShort: p0 && sd ? short(sd.drName(p0)) : null,
      plantFull: f.pl && sd ? sd.plantLabel(f.pl) : null,
      plantShort: f.pl && sd && sd.PLANT_SHORT ? (sd.PLANT_SHORT[f.pl] || f.pl) : f.pl,
      reserve: f.cap ? f.reserve : null, reserveUse: f.cap ? f.use : null, plantName: f.cap ? f.cap.name : null,
      pathTxt: f.path && sd ? f.path.slice(0, 6).map(a => a.kind === 'plant' ? sd.plantLabel(a.plant) : short(sd.drName(a))).join(' → ') : '',
      pipes: safe(() => SC() && SC().pathPipes && SC().pathPipes(p)),
      dcw: safe(() => (h.devWorks ? h.devWorks(p, f) : DI() && DI().devWorks(p, f))),
      layer: f.layer || null,
    };
  }

  // ---- Panel (browser only) -------------------------------------------------------

  let _open = null;            // { key, p } for the development the panel is showing
  const _drafts = {};          // consultant inputs by development key (this session)
  let _last = null;            // last run: { key, p, con, app, comp }

  const FLAG_TXT = { ok: 'Matches', warn: 'Check', bad: 'Differs', na: '—', manual: 'By eye', info: 'Note' };
  const flagBadge = flag => `<span class="fsr-flag ${flag}">${FLAG_TXT[flag] || flag}</span>`;

  function renderForm(box, p) {
    const u = U(), esc = u.esc, fmt1 = u.fmt1, fmtNum = u.fmtNum, roundPop = u.roundPop;
    const app = appValues(p);
    const d = _drafts[p.key] || {};
    const val = k => esc(d[k] != null ? d[k] : '');
    const hint = t => `<small>${t}</small>`;
    const ah = v => app && v != null ? fmt1(v) : '–';
    const nf = (k, label, appV) => `<label>${esc(label)}<input type="number" min="0" step="any" inputmode="decimal" data-fc="${k}" value="${val(k)}" aria-label="${esc(label)} (consultant)">${hint(`app: ${ah(appV)} L/s`)}</label>`;
    const zoneV = d.zone != null ? d.zone : (app && app.zoneFull) || '';
    const sewV = d.sewerConn != null ? d.sewerConn : (app && app.catchmentShort) || '';
    const popHint = app ? `app: ${fmtNum(roundPop(app.population))} people${app.jobs > 0 ? ` + ${fmtNum(roundPop(app.jobs))} jobs` : ''}` : 'app: no demand figures';
    box.innerHTML = `<div class="fsr-check">
      <h3 data-info="fsr-check">FSR cross-check <span class="muted">consultant's figures vs this app's</span></h3>
      ${app ? '' : `<p class="small why-stall">No servicing figures for this development yet (no units or jobs stated, or the servicing model has not loaded).</p>`}
      <p class="small muted">Enter the population and flows from the consultant's Functional Servicing Report, then Compare. Differences over 10% are flagged amber, over 25% red.</p>
      <div class="fsr-form" role="group" aria-label="Consultant's FSR figures">
        <fieldset><legend>Population</legend>
          <label>People<input type="number" min="0" step="1" inputmode="numeric" data-fc="population" value="${val('population')}" aria-label="Population (consultant)">${hint(esc(popHint))}</label>
        </fieldset>
        <fieldset><legend>Water (L/s)</legend>
          ${nf('waterAvg', 'Average day', app && app.waterAvg)}
          ${nf('waterMaxDay', 'Max day', app && app.waterMaxDay)}
          ${nf('waterPeakHour', 'Peak hour', app && app.waterPeakHour)}
        </fieldset>
        <fieldset><legend>Sanitary (L/s)</legend>
          ${nf('wwAvg', 'Average', app && app.wwAvg)}
          ${nf('wwPeak', 'Peak dry', app && app.wwPeak)}
          ${nf('wwWetPeak', 'Peak wet', app && app.wwWetPeak)}
        </fieldset>
        <fieldset><legend>Connection point</legend>
          <label>Pressure zone<input type="text" data-fc="zone" value="${esc(zoneV)}" aria-label="Pressure zone (consultant)">${hint(app && app.zoneFull ? `app: ${esc(app.zoneFull)}` : 'app: no pressure zone')}</label>
          <label>Sewer connection<input type="text" data-fc="sewerConn" value="${esc(sewV)}" aria-label="Sewer connection (consultant)" placeholder="e.g. nearest pipe / manhole">${hint(app && app.catchmentShort ? `app: ${esc(app.catchmentShort)}` : 'app: no traced catchment')}</label>
        </fieldset>
      </div>
      <div class="fsr-actions">
        <button type="button" class="btn small" data-fc-run>Compare</button>
        <button type="button" class="btn small" data-fc-print disabled>Print / PDF</button>
        <button type="button" class="btn small link" data-fc-clear>Clear</button>
      </div>
      <div class="fsr-results" data-fc-results hidden></div>
    </div>`;
  }

  function readForm(box) {
    const raw = {};
    box.querySelectorAll('[data-fc]').forEach(inp => { raw[inp.dataset.fc] = inp.value; });
    return normCon(raw);
  }

  function setPrintEnabled(box, on) {
    const b = box.querySelector('[data-fc-print]');
    if (b) b.disabled = !on;
  }

  function resultsHTML(comp, app) {
    const u = U(), esc = u.esc, fmt1 = u.fmt1, fmtNum = u.fmtNum;
    const num = (v, unit) => v == null ? '<span class="muted">–</span>'
      : unit === 'people' ? fmtNum(Math.round(v)) : `${fmt1(v)} <span class="muted">${esc(unit)}</span>`;
    const trows = comp.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${num(r.con, r.unit)}</td><td class="num">${num(r.app, r.unit)}</td>
      <td class="num">${r.diff == null ? '<span class="muted">n/a</span>' : esc(fmtDiff(r.diff))}</td><td>${flagBadge(r.flag)}</td></tr>`).join('');
    const infra = [];
    infra.push(`<li><strong>Zone &amp; sewer path:</strong> ${esc(app.zoneFull || 'no pressure zone')} → ${esc(app.plantFull || 'no traced plant')}${app.pathTxt ? `<br><span class="muted">${esc(app.pathTxt)}</span>` : ''}</li>`);
    for (const c of comp.conn)
      infra.push(`<li><strong>${esc(c.label)}:</strong> consultant “${esc(c.con || '–')}” vs app “${esc(c.app || '–')}” — ${flagBadge(c.flag)}${c.note ? ` <span class="muted">${esc(c.note)}</span>` : ''}</li>`);
    if (comp.pipes.length) for (const x of comp.pipes)
      infra.push(`<li><strong>${esc(x.label)}:</strong> ${x.pct.toFixed(0)}% of full capacity at build-out ${flagBadge(x.flag)}</li>`);
    else infra.push('<li><strong>Pipe capacity:</strong> <span class="muted">no pipe capacity on the path (sewer data not loaded)</span></li>');
    infra.push(`<li><strong>Plant reserve:</strong> ${esc(comp.plant.text)} ${flagBadge(comp.plant.flag)}</li>`);
    for (const x of comp.dc) infra.push(`<li><strong>DC works:</strong> ${esc(x.text)} ${flagBadge(x.level === 'info' ? 'info' : x.level)}</li>`);
    return `<p class="fsr-verdict">${esc(verdictOf(comp.sum))}</p>
      <div class="table-wrap"><table class="dt fsr-table"><caption>Consultant (FSR) vs this app (Peel design criteria)</caption>
      <thead><tr><th></th><th class="num">Consultant</th><th class="num">This app</th><th class="num">Difference</th><th></th></tr></thead>
      <tbody>${trows}</tbody></table></div>
      <ul class="b-lines small fsr-infra">${infra.join('')}</ul>
      <p class="small muted">Amber: over 10% different; red: over 25% different. The app's flows use Peel design criteria; the consultant's may use different persons-per-unit or rates — a flagged row is a prompt to check the basis, not an error.</p>`;
  }

  function runCheck(box) {
    const u = U(), esc = u.esc;
    const p = _open && _open.key === box.dataset.pkey ? _open.p : null;
    const out = box.querySelector('[data-fc-results]');
    if (!out) return;
    const con = readForm(box);
    const app = p ? appValues(p) : null;
    if (!app) {
      out.hidden = false;
      out.innerHTML = '<p class="small why-stall">No servicing figures for this development yet (no units or jobs stated, or the servicing model has not loaded).</p>';
      setPrintEnabled(box, false);
      return;
    }
    const rows = flowRows(con, app);
    const comp = { rows, conn: connRows(con, app), pipes: pipeChecks(app.pipes), plant: plantCheck({ name: app.plantName, reserve: app.reserve, use: app.reserveUse }), dc: dcCheck(app.dcw), sum: summarize(rows) };
    _last = { key: p.key, p: { title: p.title, municipality: p.municipality, phase: p.phase }, con, app, comp };
    out.hidden = false;
    out.innerHTML = resultsHTML(comp, app);
    setPrintEnabled(box, true);
  }

  function printBody(L) {
    const u = U(), esc = u.esc, fmt1 = u.fmt1, fmtNum = u.fmtNum;
    const { p, app, comp } = L;
    const date = new Date().toLocaleDateString('en-CA', { dateStyle: 'medium' });
    const num = (v, unit) => v == null ? '–' : unit === 'people' ? fmtNum(Math.round(v)) : `${fmt1(v)} ${unit}`;
    const trow = r => `<tr><td>${esc(r.label)}</td><td class="n">${num(r.con, r.unit)}</td><td class="n">${num(r.app, r.unit)}</td><td class="n">${r.diff == null ? 'n/a' : esc(fmtDiff(r.diff))}</td><td>${FLAG_TXT[r.flag] || ''}</td></tr>`;
    const infra = [];
    infra.push(`<li><strong>Zone &amp; sewer path:</strong> ${esc(app.zoneFull || 'no pressure zone')} → ${esc(app.plantFull || 'no traced plant')}${app.pathTxt ? ` — ${esc(app.pathTxt)}` : ''}</li>`);
    for (const c of comp.conn) infra.push(`<li><strong>${esc(c.label)}:</strong> consultant “${esc(c.con || '–')}” vs app “${esc(c.app || '–')}” — ${FLAG_TXT[c.flag] || ''}${c.note ? ` (${esc(c.note)})` : ''}</li>`);
    if (comp.pipes.length) for (const x of comp.pipes) infra.push(`<li><strong>${esc(x.label)}:</strong> ${x.pct.toFixed(0)}% of full capacity at build-out — ${FLAG_TXT[x.flag] || ''}</li>`);
    infra.push(`<li><strong>Plant reserve:</strong> ${esc(comp.plant.text)} — ${FLAG_TXT[comp.plant.flag] || ''}</li>`);
    for (const x of comp.dc) infra.push(`<li><strong>DC works:</strong> ${esc(x.text)}</li>`);
    return `<h1>FSR cross-check — ${esc(p.title)}</h1>
      <p class="sub">${esc(p.municipality || '')}${p.phase ? ` · phase ${esc(p.phase)}` : ''}</p>
      <p class="meta">Prepared ${esc(date)} · Peel Growth Pipeline (unofficial) · ${esc(u.UNOFFICIAL)}</p>
      <h2>Consultant (FSR) vs this app (Peel design criteria)</h2>
      <table><tr><th></th><th class="n">Consultant</th><th class="n">This app</th><th class="n">Difference</th><th></th></tr>${comp.rows.map(trow).join('')}</table>
      <p class="muted">${esc(verdictOf(comp.sum))} Flagged amber over 10% different, red over 25%.</p>
      <h2>Infrastructure check</h2><ul>${infra.join('')}</ul>
      <p class="note">${esc(u.UNOFFICIAL)}. Peel design criteria; a screening estimate, not a hydraulic model or a functional servicing report. 2026 DC capital maps are a draft, not approved by Council.</p>`;
  }

  /** One-page comparison through the print-report pattern (openReport + window.print()). */
  function printCheck() {
    const L = _last;
    if (!L || typeof window === 'undefined') return;
    const body = printBody(L);
    const rp = RP();
    if (rp && typeof rp.openReport === 'function') { rp.openReport(`FSR cross-check – ${L.p.title}`, body); return; }
    // Fallback: the same print-optimized view + window.print() pattern on its own.
    // Token-based (no hard-coded colours — see tests/tokens.test.js); the app's own
    // stylesheet provides the light-theme token values, as in PeelReports.openReport.
    const css = 'body{font:11px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text-primary);background:var(--surface-1);max-width:760px;margin:0 auto;padding:16px}'
      + 'h1{font-size:17px;margin:0 0 2px}h2{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);margin:12px 0 4px;border-bottom:1px solid var(--border);padding-bottom:2px}'
      + 'table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--border);padding:2px 4px;text-align:left;vertical-align:top}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}'
      + '.sub{color:var(--text-secondary);margin:0 0 4px}.meta,.muted{color:var(--text-muted);font-size:10px}ul{margin:2px 0 6px;padding-left:16px}li{margin:1px 0}.note{font-size:9.5px;color:var(--text-muted);margin-top:10px}'
      + '.noprint{margin:8px 0}@media print{.noprint{display:none}body{padding:0}@page{margin:12mm}}';
    const appCss = new URL('css/app.css', location.href).href;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FSR cross-check</title><link rel="stylesheet" href="${appCss}"><style>${css}</style></head><body>`
      + `<p class="noprint"><button onclick="print()">Print / Save as PDF</button></p>${body}`
      + `<script>addEventListener('load',()=>setTimeout(()=>print(),500))<\/script></body></html>`);
    w.document.close();
  }

  /** Toggle the panel for the open development (wired from the site bar's Check FSR button). */
  function toggleFor(p, btn) {
    if (typeof document === 'undefined' || !p) return;
    const box = document.getElementById('site-bar-fsr');
    if (!box) return;
    const opening = box.hidden;
    if (opening) {
      if (box.dataset.pkey !== p.key || !box.dataset.built) renderForm(box, p);
      _open = { key: p.key, p };
      box.dataset.built = '1';
    }
    box.dataset.pkey = p.key;
    box.hidden = !opening;
    if (btn && btn.setAttribute) btn.setAttribute('aria-expanded', String(opening));
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const t = e.target && e.target.closest ? e.target.closest('#site-bar-fsr [data-fc-run], #site-bar-fsr [data-fc-print], #site-bar-fsr [data-fc-clear]') : null;
      if (!t) return;
      const box = t.closest('#site-bar-fsr');
      if (!box) return;
      if (t.hasAttribute('data-fc-run')) return runCheck(box);
      if (t.hasAttribute('data-fc-print')) return printCheck();
      if (t.hasAttribute('data-fc-clear')) { delete _drafts[box.dataset.pkey]; renderForm(box, _open && _open.key === box.dataset.pkey ? _open.p : { key: box.dataset.pkey }); const out = box.querySelector('[data-fc-results]'); if (out) { out.hidden = true; out.innerHTML = ''; } setPrintEnabled(box, false); }
    });
    // Keep the consultant's inputs while the panel is rebuilt (e.g. the scope refresh).
    document.addEventListener('input', e => {
      const inp = e.target && e.target.closest ? e.target.closest('#site-bar-fsr [data-fc]') : null;
      if (!inp || !inp.dataset.fc) return;
      const box = inp.closest('#site-bar-fsr');
      if (!box || !box.dataset.pkey) return;
      (_drafts[box.dataset.pkey] = _drafts[box.dataset.pkey] || {})[inp.dataset.fc] = inp.value;
    });
  }

  // ---- Public contract ----
  const api = {
    WARN_PCT, BAD_PCT, NUM_KEYS, toNum, normCon, pctDiff, flagFor, fmtDiff,
    zoneMatch, flowRows, connRows, pipeChecks, plantCheck, dcCheck,
    summarize, verdictOf, appValues, toggleFor, runCheck, printCheck,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelFsrCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
