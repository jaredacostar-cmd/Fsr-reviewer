/* js/exports.js — data exports UI (Phase 6 extraction).
 * CSV/GeoJSON of developments & areas, shapefiles of the map layers, download helper, and the Excel workbook
 * export (top-bar Export menu).
 * Extracted verbatim from js/app.js (lines 3506-3575, 5267-5343, 5352-5403);
 * lines 5344-5351 (dead appVersion, shadowed by the live one in js/reports.js)
 * are deleted per the catalogue. The only other edits are the reference rewrites
 * in SPLIT_MAP.md §0 rule 4.
 * Note: `await appVersion()` resolves to PeelReports.appVersion.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, fmtDate, UNOFFICIAL, CSV_DISCLAIMER, DISCLAIMER_PROPS, SCREEN_LINE, CRITERIA_STAMP } = root.PeelUtil;
  const P = root.PeelPhases;
  const D = root.PeelDemand;
  const PV = root.PeelProvenance || null;
  const App = () => root.PeelApp;
  const DD = () => root.PeelDevDetail;
  const MP = () => root.PeelMasterPlan;
  const SP = () => root.PeelSvcPlants;
  const DI = () => root.PeelDcInfra;
  const SD = () => root.PeelSvcData;
  const MM = () => root.PeelMapMarkers;
  const ST = () => root.PeelSvcTab;
  const MA = () => root.PeelMapAnalysis;
  const DN = () => root.PeelDevNav;
  const AS = () => root.PeelAreaSelect;
  const TS = () => root.PeelToolScope;
  const FI = () => root.PeelFilterUI;
  const CA = () => root.PeelCensusAreas;
  const RP = () => root.PeelReports;

/* ---- app.js lines 3506-3575 ---- */
  // ---- Export ----------------------------------------------------------------------
  function exportRows(list = App().state.filtered) {
    return list.map(p => ({
      address: p.title, municipality: p.municipality, phase: P.PHASE_BY_KEY[p.phase].label,
      ...Object.fromEntries(P.PHASES.map(s => [`${s.key}_date`, fmtDate(p.milestones[s.key])])),
      units: p.units ?? '',
      planned_units: p.buildout ? p.buildout.planned : '', permitted_units: p.buildout ? p.buildout.permitted : '',
      completed_units: p.buildout ? p.buildout.completed : '', left_to_build: p.buildout ? p.buildout.remaining : '',
      building_permits: p.records.filter(r => r.kind === 'permit').length,
      est_population: p.units ? Math.round(D.estimate([p], App().state.criteria).population) : '',
      ...(e => ({ employment_uses: e ? e.uses.map(u => u.label).join('; ') : '', nonres_floor_area_m2: e && e.totalM2 ? e.totalM2 : '', est_jobs: e && e.jobs ? e.jobs : '', ...(d => ({ emp_water_avg_lps: d ? +d.water.avg.toFixed(2) : '', emp_wastewater_peak_lps: d ? +d.wastewater.peak.toFixed(2) : '' }))(e && e.jobs ? D.employmentDemand(e.jobs, App().state.criteria) : null) }))(App().empOf(p)),
      gfa: p.gfa ?? '', types: p.types.join('; '),
      files: p.records.map(r => `${r.kind}:${r.ref}${r.statusRaw ? ` (${r.statusRaw})` : ''}`).join('; '),
      description: p.description, lat: p.lat != null ? +p.lat.toFixed(6) : '', lng: p.lng != null ? +p.lng.toFixed(6) : '',
      // Step C2: its plan (the innermost, largest share) and every plan's share of its land.
      ...(x => ({ plan: x.plan, plan_shares: x.shares }))(root.PeelPlanTables ? root.PeelPlanTables.planOf(p) : { plan: '', shares: '' }),
      ...provenanceFields(p),
      ...svcExportFields(p),
    }));
  }
  // Provenance on every row (design audit, Group 10): the portal, a link to the record and when it was
  // pulled, from the development's latest file; "not recorded" rather than a blank.
  function provenanceFields(p) {
    const last = r => Math.max(0, ...(r.events || []).map(e => +e.date || 0));
    const r = (p.records || []).slice().sort((a, b) => last(b) - last(a))[0];
    if (!r) return { source_portal: 'not recorded', source_record_url: 'not recorded', source_pulled_on: 'not recorded' };
    const srcId = r.sourceId ? String(r.sourceId).split('/')[0] : null;
    const s = srcId && (App().state.sources || []).find(x => x.id === srcId || String(x.id).split('/')[0] === srcId);
    const url = PV && s ? PV.recordSourceUrl(r, s.url) : null;
    const pulled = PV ? PV.retrievedAt(r, App().state.snapshot && { generatedAt: App().state.snapshot.generatedAt }) : null;
    return { source_portal: (PV ? PV.portalFor(r.sourceName) : r.sourceName) || 'not recorded', source_record_url: url || 'not recorded', source_pulled_on: pulled || 'not recorded' };
  }
  // Servicing fields for GIS / spreadsheet: layer, build-out people + jobs, flows at Peel design
  // criteria (L/s), pressure zone, catchment and plant (with the distance when assigned to the nearest).
  function svcExportFields(p) {
    const e = D.estimate([p], App().state.criteria, 'all', App().jobsOf), cb = e.combined, r2 = v => +v.toFixed(2);
    const z = App().state.servicing ? SD().svcIds(p, 'pz').map(id => SD().svcById.get(id)).filter(Boolean)[0] : null;
    const d = App().state.servicing ? SD().svcIds(p, 'dr').map(id => SD().svcById.get(id)).filter(Boolean)[0] : null;
    const zn = App().state.servicing && SD().nearOf(p, 'pz'), dn = App().state.servicing && SD().nearOf(p, 'dr');
    return {
      servicing_layer: MM().svcLayerOf(p), buildout_population: Math.round(e.population), buildout_jobs: Math.round(e.employment.jobs),
      water_avg_lps: r2(cb.water.avg), water_maxday_lps: r2(cb.water.maxDay), water_peakhour_lps: r2(cb.water.peakHour),
      ww_avg_dry_lps: r2(cb.wastewater.avg), ww_peak_dry_lps: r2(cb.wastewater.peak), ww_peak_wet_lps: r2(cb.wastewater.wetPeak),
      pressure_zone: z ? z.name : '', pressure_zone_nearest_m: zn ? Math.round(zn.m) : '',
      catchment: d ? SD().drName(d) : '', catchment_nearest_m: dn ? Math.round(dn.m) : '', catchment_via_planned_main: dn && dn.via ? `${dn.via.p || ''} (${dn.via.y || ''})` : '', plant: d ? SD().plantLabel(d.plant) : '',
      ...(w => ({ dc_ww_main: w && w.ww ? `${w.ww.ln.y || ''} ${w.ww.ln.d ? `${w.ww.ln.d}mm ` : ''}${w.ww.ln.p || ''}`.trim() : '', dc_water_main: w && w.wa ? `${w.wa.ln.y || ''} ${w.wa.ln.d ? `${w.wa.ln.d}mm ` : ''}${w.wa.ln.p || ''}`.trim() : '', dc_servicing_year: w && w.needBy ? w.needBy : '', dc_timing_gap: w && w.gap ? 'yes' : '' }))(App().state.dcInfra ? DI().devWorks(p, SD().svcFacts(p)) : null),
    };
  }
  // Pressure zones and catchments as polygons with their census / build-out figures (GIS).
  function areasGeoJSON() {
    const M = App().state.svcModel; if (!App().state.servicing || !M) return null;
    const r2 = v => +(+v).toFixed(3);
    const feat = (a, props) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: a.rings }, properties: { id: a.id, name: a.zone ? a.name : SD().drName(a), ...props } });
    const zones = App().state.servicing.zones.map(a => { const l = M.zones.get(a.id); return feat(a, { kind: 'pressure_zone', ...(l ? { census_pop: Math.round(l.census), buildout_pop: Math.round(M.total(l)), buildout_jobs: Math.round(M.jobs(l)), maxday_census_mld: r2(M.wMax(l.census, 0)), maxday_buildout_mld: r2(M.wMax(M.total(l), M.jobs(l))) } : {}) }); });
    const dr = App().state.servicing.drainage.map(a => {
      const l = M.local.get(a.id), c = M.cum.get(a.id), ps = MA().psLoad(a);
      return feat(a, { kind: a.kind, plant: SD().plantLabel(a.plant), downstream: a.downstream || '', area_ha: a.areaHa,
        ...(l ? { local_census_pop: Math.round(l.census), local_buildout_pop: Math.round(M.total(l)), local_adwf_census_mld: r2(M.adwf(MA().censusOnly(l))), local_adwf_buildout_mld: r2(M.adwf(l)) } : {}),
        ...(c ? { outlet_adwf_buildout_mld: r2(M.adwf(c)), outlet_pdwf_buildout_mld: r2(M.pdwf(c, 1)), outlet_pwwf_buildout_mld: r2(M.pdwf(c, 1) + M.ii(c)) } : {}),
        ...(ps ? { ps_firm_lps: ps.firm, ps_peak_wet_lps: Math.round(ps.wet), ps_pct_firm: Math.round(ps.pct) } : {}) });
    });
    return { type: 'FeatureCollection', properties: { ...DISCLAIMER_PROPS, scenario: ST().scenarioText(), generated: new Date().toISOString() }, features: [...zones, ...dr] };
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  // Named so the topbar Export menu calls the same actions as the list panel's
  // Export row (a sibling worktree is removing that row; the functions stay).
  function exportDevsCSV(list, name = 'peel-developments.csv') {
    const rows = exportRows(Array.isArray(list) ? list : undefined); if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const cell = v => window.PeelUtil.csvCell(v);
    download(name, CSV_DISCLAIMER + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n'), 'text/csv');
  }
  function devsGeoJSON() {
    const rows = exportRows();
    const fc = { type: 'FeatureCollection', features: rows.filter(r => r.lat).map(r => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [+r.lng, +r.lat] }, properties: r })) };
    fc.properties = { ...DISCLAIMER_PROPS, scenario: App().state.svcModel ? ST().scenarioText() : '', generated: new Date().toISOString() };
    return fc;
  }
  function exportDevsGeoJSON() { download('peel-developments.geojson', JSON.stringify(devsGeoJSON()), 'application/geo+json'); }
  function exportAreasGeoJSON() { const fc = areasGeoJSON(); if (fc) download('peel-servicing-areas.geojson', JSON.stringify(fc), 'application/geo+json'); }
  // The map layers as shapefiles in one zip, for ArcMap / ArcGIS Pro (js/export-shapefile.js):
  // the same features and fields as the GeoJSON exports; a layer not loaded yet is listed in README.txt.
  async function exportShapefiles() {
    const SH = root.PeelShapefile, CE = root.PeelCapitalEA;
    if (!SH) { alert('The shapefile writer failed to load; use GeoJSON instead.'); return; }
    const layers = [
      { name: 'peel_developments', title: 'Developments shown', fc: devsGeoJSON() },
      { name: 'peel_servicing_areas', title: 'Servicing areas (pressure zones and catchments)', fc: areasGeoJSON() },
      { name: 'peel_dc_planned_works', title: 'Planned works (2026 DC)', fc: App().state.dcInfra ? DI().dcGeoJSON() : null },
      // Capital projects only once the layer is published (as in the Export menu).
      ...(CE && CE.data.capital ? [{ name: 'peel_capital_projects', title: 'Capital projects', fc: CE.consGeoJSON() }] : []),
      { name: 'peel_environmental_assessments', title: 'Environmental assessments', fc: CE ? CE.easGeoJSON() : null },
    ];
    const { bytes } = await SH.buildShapefileZip(layers, {
      title: 'Peel Growth Pipeline (unofficial) - shapefile export',
      props: { ...DISCLAIMER_PROPS, filters: FI().activeFilters().map(f => f.label).join(', ') || 'none', scenario: App().state.svcModel ? ST().scenarioText() : '', generated: new Date().toISOString() },
    });
    download('peel-growth-pipeline-shapefiles.zip', bytes, 'application/zip');
  }

/* ---- app.js lines 5267-5343 ---- */
  // ---- Export: an Excel workbook of what is on screen (top-bar Export menu) ----
  // Scopes: water, plants, catchments, growth (bottom panel) and dev / selection (side panel).
  const SCOPES = {
    water: { title: 'Water by pressure zone', els: () => [$('#water-body')] },
    wcap: { title: 'Water treatment and capacity', els: () => [$('#wcap-body')] },
    wfac: { title: 'Existing water facilities', els: () => [$('#wfac-body')] },
    plants: { title: 'Wastewater treatment plants and capacity', els: () => [$('#plants-body')] },
    catchments: { title: 'Wastewater by sanitary catchment', els: () => [$('#ww-body')] },
    growth: { title: 'Demand', els: () => [$('#growth-pipeline-body')].filter(e => e && !e.hidden) },
    census: { title: 'Growth', els: () => [$('#growth-census-body')].filter(e => e && !e.hidden) },
    dev: { title: 'Development servicing summary', els: () => [$('#pane-dev-body'), $('#scope-body')].filter(e => e && !e.hidden && e.innerHTML) },
    loads: { title: 'What loads it', els: () => [TS().toolScopeBody() || $('#scope-body')] },
    whatif: { title: 'Test site servicing check', els: () => [$('#scope-body')] },
  };
  // One criteria row for exports: group, item, used value, Peel default, unit,
  // and the source document + version behind the default.
  function criteriaExportRow(g, k) {
    const c = App().state.criteria, d = D.DEFAULT_CRITERIA;
    const s = D.sourceOf(g, k) || {};
    return { group: ST().CRIT_LABEL[g] || g, item: (ST().CRIT_KEY_LABEL[g] || {})[k] || k, used: +c[g][k], def: +d[g][k], unit: (D.CRIT_UNITS[g] || {})[k] || '', doc: s.doc || '', ver: s.ver || '' };
  }
  function criteriaTableHTML() {
    const d = D.DEFAULT_CRITERIA;
    const rows = Object.keys(d).flatMap(g => Object.keys(d[g]).map(k => { const r = criteriaExportRow(g, k);
      return `<tr${r.used !== r.def ? ' class="mod"' : ''}><td>${esc(r.group)}</td><td>${esc(r.item)}</td><td>${esc(String(r.used))}</td><td>${esc(String(r.def))}</td><td>${esc(r.unit)}</td><td>${esc(r.doc)}${r.ver ? `, ${esc(r.ver)}` : ''}</td></tr>`; }));
    return `<table class="dt"><thead><tr><th>Group</th><th>Item</th><th>Used</th><th>Peel default</th><th>Unit</th><th>Source document</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  function reportMeta(scope) {
    const bc = CA().baselineCensus(), R = App().state.reports;
    const title = scope === 'loads' ? (((TS().toolScopeBody() || $('#scope-body')).querySelector('h3') || {}).textContent || SCOPES.loads.title) : scope === 'dev' && DN().getCurrentProject() ? `${SCOPES.dev.title} – ${DN().getCurrentProject().title}` : scope === 'dev' && AS().selection.size ? `Selection servicing summary – ${fmtNum(AS().selection.size)} developments` : SCOPES[scope].title;
    return { title, lines: [
      `Prepared ${new Date().toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })} with the Peel Growth Pipeline (unofficial)`,
      UNOFFICIAL,
      `Data: ${App().state.snapshot ? `applications and permits ${App().state.snapshot.generatedAt.slice(0, 10)}` : 'live applications'} · ${bc ? `${bc.year} Census` : ''}${R ? ` · Region of Peel ${R.year} annual reports` : ''}`,
      `Wastewater mode: ${ST().svcOpt.ww === 'calibrated' ? 'Capacity check (calibrated to 2025 reported flows)' : 'Design flows (Peel criteria)'} · water max day factor: ${ST().svcOpt.md === 'observed' ? 'observed 2025' : 'design'} · 70 ML/d G.E. Booth → Clarkson diversion: ${ST().svcOpt.div === 'on' ? 'on' : 'off'} · developments outside mapped areas: ${ST().svcOpt.nr === 'on' ? `assigned to the nearest within ${SD().kmText(SD().NEAR_M)}` : 'left out'}`,
      `Filters: ${FI().activeFilters().map(f => f.label).join(', ') || 'none'}`,
      ST().criteriaChanges().length ? `Modified criteria: ${ST().criteriaChanges().join('; ')}` : 'Criteria: Peel defaults',
    ] };
  }
  // Table → rows for Excel: header labels from (possibly two-row) headers; each cell's main value
  // as a number where it is one, and its sub-lines with a unit (people, jobs, ha) as extra columns.
  function tableRows(t) {
    const grid = [];
    [...(t.tHead ? t.tHead.rows : [])].forEach((tr, r) => {
      grid[r] = grid[r] || []; let col = 0;
      for (const th of tr.cells) {
        while (grid[r][col] !== undefined) col++;
        for (let i = 0; i < th.rowSpan; i++) for (let j = 0; j < th.colSpan; j++) { (grid[r + i] = grid[r + i] || [])[col + j] = th.innerText.replace(/\s+/g, ' ').trim(); }
        col += th.colSpan;
      }
    });
    const ncol = Math.max(0, ...grid.map(g => g.length));
    const heads = Array.from({ length: ncol }, (_, i) => [...new Set(grid.map(g => g[i]).filter(Boolean))].join(' – '));
    const val = el => {
      const c = el.cloneNode(true); c.querySelectorAll('small, .u').forEach(x => x.remove());
      const txt = c.innerText.replace(/\s+/g, ' ').trim(), n = txt.replace(/[,\s]/g, '').replace(/^−/, '-').replace(/^×/, '');
      return /^-?\d+(\.\d+)?%?$/.test(n) ? Number(n.replace('%', '')) : txt;
    };
    const unitOf = el => { const u = el.querySelector(':scope > .u'); if (u) return u.textContent.trim(); const c = el.cloneNode(true); c.querySelectorAll('small').forEach(x => x.remove()); return /^\s*[−-]?[\d,.]+%\s*$/.test(c.textContent) ? '%' : /^\s*×[\d.]+\s*$/.test(c.textContent) ? '×' : ''; };
    const extraKeys = []; const rows = [];
    for (const tr of t.tBodies[0] ? t.tBodies[0].rows : []) {
      const row = { main: [], extra: {} }; let col = 0;
      for (const td of tr.cells) {
        row.main[col] = val(td);
        td.querySelectorAll('small').forEach(sm => sm.querySelectorAll('.u').forEach(u => {
          const prev = u.previousSibling, num = prev && prev.textContent.match(/[−-]?[\d,]+(\.\d+)?\s*$/);
          if (!num) return; const k = `${heads[col] || ''} · ${u.textContent.trim()} (second line)`;
          if (!extraKeys.includes(k)) extraKeys.push(k); row.extra[k] = Number(num[0].replace(/[,\s]/g, '').replace('−', '-'));
        }));
        col += td.colSpan;
      }
      rows.push(row);
    }
    const unitHead = heads.map((h, i) => { const r = t.tBodies[0] && [...t.tBodies[0].rows].find(tr => tr.cells[i] && unitOf(tr.cells[i])); return r ? `${h} (${unitOf(r.cells[i])})` : h; });
    return [[...unitHead, ...extraKeys], ...rows.map(r => [...Array.from({ length: ncol }, (_, i) => r.main[i] ?? ''), ...extraKeys.map(k => r.extra[k] ?? '')])];
  }
  const loadScript = src => new Promise((ok, fail) => { if (window.XLSX) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
/* ---- app.js lines 5352-5403 ---- */
  // Tables from analysis tab bodies for the workbook: a section-header row
  // naming each panel, then each visible table's rows (the tableRows helper).
  function panelTableRows(panels) {
    if (window.PeelUtil && window.PeelUtil.flushLater) window.PeelUtil.flushLater();   // (views waiting to render out of sight)
    const out = [];
    for (const [label, sel] of panels) {
      const body = $(sel); if (!body) continue;
      const tables = [...body.querySelectorAll('table')].filter(t => !t.closest('[hidden]'));
      if (!tables.length) continue;
      if (out.length) out.push([]);
      out.push([label]);
      tables.forEach((t, i) => { if (i) out.push([]); for (const r of tableRows(t)) out.push(r); });
    }
    return out.length ? out : [['(no tables rendered — open the tab first)']];
  }
  // One Excel workbook for the current scope + filters: Summary, Developments,
  // Records, Water, Wastewater, DC, Criteria, Sources (js/export-workbook.js
  // builds the Summary / Developments / DC / Sources sheets; the rest reuse
  // the existing helpers). Supersedes the old per-scope exportXLSX.
  async function exportWorkbook() {
    const WB = window.PeelExportWorkbook;
    try { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'); } catch (e) { alert('Could not load the Excel library; use PDF / print instead.'); return; }
    if (!WB) { alert('The workbook builder failed to load; use PDF / print instead.'); return; }
    const wb = XLSX.utils.book_new();
    const add = (name, aoa) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
    const bc = CA().baselineCensus(), R = App().state.reports;
    add('Summary', WB.summaryRows({
      title: 'Peel Growth Pipeline – export workbook',
      prepared: `Prepared ${new Date().toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })} with the Peel Growth Pipeline (unofficial)`,
      filters: FI().activeFilters().map(f => f.label).join(', ') || 'none',
      scenario: ST().scenarioText(),
      dataDates: `${App().state.snapshot ? `applications and permits ${App().state.snapshot.generatedAt.slice(0, 10)}` : 'live applications'}${bc ? ` · ${bc.year} Census` : ''}${R ? ` · Region of Peel ${R.year} annual reports` : ''}`,
      version: await RP().appVersion(),
      disclaimer: UNOFFICIAL, screening: SCREEN_LINE, criteria: CRITERIA_STAMP,
    }));
    const dev = WB.developmentsSheetRows(exportRows());   // defaults to state.filtered: totals match the screen
    add('Developments', [dev.cols, ...dev.rows]);
    add('By plan', root.PeelPlanTables ? root.PeelPlanTables.sheetRows() : [['(not loaded)']]);
    add('Plan × servicing', root.PeelPlanTables ? root.PeelPlanTables.matrixSheetRows() : [['(not loaded)']]);
    const rec = DD().recordAuditRows();
    add('Records', [rec.cols, ...rec.rows]);
    add('Water', panelTableRows([['Water treatment & capacity', '#wcap-body'], ['Water by pressure zone', '#water-body'], ['Existing water facilities', '#wfac-body']]));
    add('Wastewater', panelTableRows([['Wastewater treatment plants', '#plants-body'], ['Wastewater by sanitary catchment', '#ww-body']]));
    const ppu = (App().state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment;
    const dc = WB.dcTimingRows(MP().allNeeds(), { filter: MP().dcnFilter, ppu, hzEnd: SP().hz.end, plantTrigger: MP().PLANT_TRIGGER });
    add('DC', [dc.cols, ...dc.rows]);
    // Capital projects (when published) and the EA list (js/capital-ea.js); no people.
    if (root.PeelCapitalEA && root.PeelCapitalEA.workbookSheets) for (const [name, t] of root.PeelCapitalEA.workbookSheets()) add(name, [t.cols, ...t.rows]);
    const d = D.DEFAULT_CRITERIA;
    add('Criteria', [['Group', 'Item', 'Used', 'Peel default', 'Unit', 'Source document', 'Source version'], ...Object.keys(d).flatMap(g => Object.keys(d[g]).map(k => { const r = criteriaExportRow(g, k); return [r.group, r.item, r.used, r.def, r.unit, r.doc, r.ver]; }))]);
    const src = WB.sourceRows(App().state.sources, { generatedAt: App().state.snapshot && App().state.snapshot.generatedAt, portalFor: PV ? PV.portalFor : null });
    add('Sources', [src.cols, ...src.rows]);
    XLSX.writeFile(wb, 'peel-growth-pipeline-workbook.xlsx');
  }
  // The top-bar Export menu's Excel item is the only remaining data-export user
  // (Worker A owns that menu line and is replacing it with a single-workbook
  // export); the per-panel PDF / Excel buttons are gone, so exportPDF is dead.

  // ---- Public contract ----
  const api = { exportRows, download, exportDevsCSV, exportDevsGeoJSON, exportAreasGeoJSON, exportShapefiles, devsGeoJSON, areasGeoJSON, exportWorkbook, reportMeta, criteriaExportRow, criteriaTableHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelExports = api;
})(typeof window !== 'undefined' ? window : globalThis);
