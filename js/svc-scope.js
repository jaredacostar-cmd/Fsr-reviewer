/* Servicing scopes (design audit, Group 5): the servicing ladder as scopes, like the planning ladder.
 *   wastewater: Peel › plant › pumping-station catchment or block (with everything upstream)
 *   water:      Peel › South Peel water system › pressure zone
 * A scope is one reference in App().state.ss ('plant:Lakeview', 'wsys:lake', or a servicing area id
 * from PeelSvcData.svcById). It filters the developments (app.js matches), adds its steps to the
 * trail, gets its own Overview card (headroom, what feeds it, what it feeds, the developments
 * loading it), goes in the share link (ss=…) and replaces the "What loads this?" tool result.
 */
(function (root) {
  'use strict';
  const { esc, fmtNum, fmt1, roundPop, uLs, uML, dot, hlP, skel, pipeClass, SCREEN_NOTE_SHORT, capTxt } = window.PeelUtil;
  const D = window.PeelDemand;
  const App = () => window.PeelApp;
  const SD = () => window.PeelSvcData;
  const MM = () => window.PeelMapMarkers;
  const MA = () => window.PeelMapAnalysis;
  const MP = () => window.PeelMasterPlan;
  const SvcTab = () => window.PeelSvcTab;
  const ST = () => window.PeelSewerTrace;
  const AT = () => window.PeelAnalysisTabs;
  const OT = () => window.PeelOverviewTab;
  const Sh = () => window.PeelShare;
  const Rep = () => window.PeelReports;
  const Areas = () => window.PeelAreas;
  const DI = () => window.PeelDcInfra;
  const P = window.PeelPhases;
  const TB = () => window.PeelTopbar;

  const PLANTS = ['Lakeview', 'Clarkson', 'Inglewood'];
  const KIND_LABEL = { plant: 'Wastewater treatment plant', ps: 'Pumping station catchment', block: 'Wastewater block and everything upstream', zone: 'Water pressure zone', wsys: 'Water system (lake-based)' };

  // A scope reference → what it covers: key 'dr' / 'pz' (developments by their servicing areas) or
  // 'ps' (by the catchment outline); ids the areas counted.
  function resolve(ref) {
    if (isResultRef(ref)) return result && result.ref === ref ? { ref, kind: 'result', rkind: ref.slice(0, ref.indexOf(':')), title: result.title, short: result.title, result } : null;
    const sv = App() && App().state.servicing; if (!ref || !sv) return null;
    const i = ref.indexOf(':'), k = ref.slice(0, i), v = ref.slice(i + 1);
    if (k === 'plant') return PLANTS.includes(v) ? { ref, kind: 'plant', pl: v, title: SD().plantLabel(v), short: SD().PLANT_SHORT[v], key: 'dr', ids: new Set(sv.drainage.filter(d => d.plant === v).map(d => d.id)) } : null;
    if (k === 'wsys') return v === 'lake' ? { ref, kind: 'wsys', title: 'South Peel water system', short: 'South Peel water', key: 'pz', ids: new Set(MP().lakeZones()) } : null;
    const a = SD().svcById.get(ref); if (!a) return null;
    if (a.zone) return { ref, kind: 'zone', a, title: a.name, short: a.name, key: 'pz', ids: new Set([a.id]), lake: MP().lakeZones().includes(a.id) };
    if (a.kind === 'ps') return { ref, kind: 'ps', a, pl: a.plant, title: SD().drName(a), short: SD().drName(a), key: 'ps', ids: new Set([a.id]) };
    const up = SvcTab().upstreamOf(a.id, SvcTab().svcFlowTree());
    return { ref, kind: 'block', a, pl: a.plant, title: SD().drName(a), short: SD().drName(a), key: 'dr', up, ids: new Set([a.id, ...up.map(u => u.id)]) };
  }
  let memo = { k: null, s: null, members: null };
  function current() {
    const ref = App() && App().state.ss; if (!ref) return null;
    const k = `${ref}|${App().state.svcGen || 0}|${!!App().state.servicing}|${result ? result.v : 0}`;
    if (memo.k !== k) memo = { k, s: resolve(ref), members: null };
    return memo.s;
  }
  // Is a development in the current scope? (app.js matches; no scope → every development)
  function has(p) {
    const s = current(); if (!s) return true;
    if (s.kind === 'result') return !s.result.devKeys || s.result.devKeys.has(p.key);
    if (s.key === 'ps') return !!(s.a.bbox && p.lat != null && Areas().locate([s.a], p.lng, p.lat).length);
    return SD().svcIds(p, s.key).some(id => s.ids.has(id));
  }

  // ---- Open / close ---------------------------------------------------------------------------
  function open(ref) {
    if (!resolve(ref)) return false;
    if (window.DevScope && window.DevScope.current()) window.DevScope.close();
    result = null;
    App().state.ss = ref; showAll = false;
    AT().setFootPref('overview'); AT().showFootTab('overview');
    App().applyFilters(); OT().renderOverview(); Sh().viewLink.write();
    const s = current();
    if (s && s.a && ST() && ST().focusSvc) ST().focusSvc(s.a.id, { zoom: true, loads: false });
    return true;
  }
  // Drop the scope without re-rendering (the caller re-filters), e.g. the trail's Peel step.
  function clear() { if (App()) App().state.ss = null; result = null; }
  function close() { clear(); App().applyFilters(); OT().renderOverview(); Sh().viewLink.write(); }

  // ---- Result scopes (SPEC §3): every feature click and tool result opens here ------------------
  // A DC work, a sewer pipe, a single file, a wastewater block, a water facility, a selection or a
  // tool's result is a scope too: it opens in the right panel (Overview) with its trail step, filters
  // the developments to the ones it lists, and goes in the share link (ss=pipe:123, file:<uid>, …).
  //   openResult({ ref, title, html, reopen, devKeys, filter, screen })
  //     ref: '<kind>:<id>' (kinds below; default 'tool:<title>'); devKeys: the developments it covers
  //     (filter: true reads them from the result's data-dev rows); reopen(): re-runs the producer.
  const RESULT_KINDS = new Set(['tool', 'dcwork', 'pipe', 'file', 'iiblock', 'wfac', 'sel', 'help', 'cx', 'ea', 'cap']);
  const isResultRef = ref => !!ref && RESULT_KINDS.has(String(ref).slice(0, String(ref).indexOf(':')));
  let result = null, resultV = 0;
  const slug = t => String(t || 'result').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  function devKeysOf(html) { const out = new Set(); String(html || '').replace(/data-dev="([^"]+)"/g, (m, k) => { out.add(k.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")); return m; }); return out.size ? out : null; }
  function openResult(o) {
    o = o || {};
    const ref = o.ref || `tool:${slug(o.title)}`;
    if (window.DevScope && window.DevScope.current() && !o.keepDev) window.DevScope.close();
    const keys = o.devKeys ? new Set(o.devKeys) : o.filter ? devKeysOf(o.html) : null;
    result = { ref, title: o.title || 'Result', group: o.group || null, html: (o.screen ? window.PeelUtil.SCREEN_NOTE : '') + (o.html || ''), reopen: typeof o.reopen === 'function' ? o.reopen : null, devKeys: keys, v: ++resultV };
    App().state.ss = ref; showAll = false;
    // Layers that drew a selection for an earlier result (EA / capital highlights) drop it when replaced.
    if (typeof document !== 'undefined' && typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('peel:result-opened', { detail: { ref } }));
    AT().setFootPref('overview'); AT().showFootTab('overview');
    App().applyFilters(); OT().renderOverview(); if (TB()) TB().renderTrail(); Sh().viewLink.write();
    const host = typeof document !== 'undefined' && document.getElementById('scope-body'); if (host) host.scrollTop = 0;
    // On a phone the right panel is a bottom sheet: raise it from its peek so the result shows.
    const DT = window.PeelDataTab, A = App();
    if (DT && DT.shellNarrow && DT.shellNarrow() && A.getAnalysisSnap && A.getAnalysisSnap() === 'peek') A.setAnalysisSnap('half');
    return result;
  }
  function closeResult() {
    if (!result) return false;
    result = null;
    if (isResultRef(App().state.ss)) App().state.ss = null;
    if (typeof document !== 'undefined' && typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('peel:tool-closed'));
    App().applyFilters(); OT().renderOverview(); if (TB()) TB().renderTrail(); Sh().viewLink.write();
    return true;
  }
  function reopenResult() {
    if (!result) return false;
    if (result.reopen) { try { result.reopen(); return true; } catch (e) { /* show what we have */ } }
    AT().showFootTab('overview'); OT().renderOverview();
    return true;
  }
  const hasResult = () => !!result && App().state.ss === result.ref;
  const resultTitle = () => (result ? result.title : null);
  // A shared link to a result scope: re-run its producer once the data it needs has loaded.
  const RESTORE = {
    pipe: id => { const M = MM(); if (!M.SEW.data) { window.PeelSewerCap.loadSewers(); return false; } window.PeelSewerCap.showPipeLoads(+id); return true; },
    file: uid => { const A = App(); if (!A.fullSnapshotReady || !A.fullSnapshotReady()) return false; for (const p of A.state.projects) { const r = p.records.find(x => x.uid === uid); if (r) { window.PeelAerialCheck.showRecordDetail(r, p); return true; } } return true; },
    dcwork: id => {
      const I = App().state.dcInfra; if (!I) { if (MA() && MA().setDcOn) MA().setDcOn({ on: true, sys: 'both' }); return false; }
      const [sys, ...rest] = id.split(':'), key = rest.join(':'), d = I[sys]; if (!d) return true;
      const ln = d.lines.find(x => (x.p || x.c) === key); if (ln) { MP().showDcLine(ln); return true; }
      const fc = d.facilities.find(x => x.name === key); if (fc) DI().showFacility(fc);
      return true;
    },
    iiblock: id => { if (!ST() || !ST().showBlock) return true; return ST().showBlock(id) !== false; },
    // EAs and capital projects re-open once their data has loaded (js/capital-ea.js).
    ea: id => { const C = window.PeelCapitalEA; if (!C || !C.data.loaded) return false; C.openEA(id); return true; },
    cap: key => { const C = window.PeelCapitalEA; if (!C || !C.data.loaded) return false; C.openCapital(key); return true; },
  };
  function restore(ref, tries = 40) {
    if (!isResultRef(ref) || (result && result.ref === ref)) return;
    const k = ref.slice(0, ref.indexOf(':')), id = ref.slice(ref.indexOf(':') + 1), f = RESTORE[k];
    if (!f) { if (App().state.ss === ref) { App().state.ss = null; App().applyFilters(); } return; }
    let done = false; try { done = f(id); } catch (e) { done = false; }
    if (!done && tries > 0) setTimeout(() => restore(ref, tries - 1), 500);
  }

  // Trail steps, top of the ladder first: plant before its blocks and stations; the water system
  // before a lake-based zone.
  function crumbs() {
    const s = current(); if (!s) return [];
    if (s.kind === 'result') {
      const back = { label: s.short, go: () => { AT().showFootTab('overview'); OT().renderOverview(); }, title: `Back to ${s.title}` };
      // A group step before the title: Peel › EA › name (opens Capital › EAs), Peel › Capital › project (Capital › Construction).
      const g = s.result && s.result.group;
      return g ? [{ label: g, go: () => { if (AT().setDcSub) AT().setDcSub(g === 'EA' ? 'eas' : 'projects'); AT().showFootTab('dca'); }, title: g === 'EA' ? 'Environmental assessments (Capital › EAs)' : 'Capital projects (Capital › Construction)' }, back] : [back];
    }
    const step = (ref, label, title) => ({ label, go: () => open(ref), title });
    const out = [];
    if ((s.kind === 'block' || s.kind === 'ps') && PLANTS.includes(s.pl)) out.push(step(`plant:${s.pl}`, SD().PLANT_SHORT[s.pl], `Open ${SD().plantLabel(s.pl)}`));
    if (s.kind === 'zone' && s.lake) out.push(step('wsys:lake', 'South Peel water', 'Open the South Peel water system'));
    out.push(step(s.ref, s.short, `Back to ${s.title}`));
    return out;
  }
  const label = () => { const s = current(); return s ? s.title : ''; };

  // ---- The scope's Overview card ----------------------------------------------------------------
  let showAll = false;
  const link = (ref, text) => `<button type="button" class="btn small link" data-ss="${esc(ref)}">${esc(text)}</button>`;
  const tile = (v, u, l, sub = '') => `<div class="ov-tile"><b>${v}</b><span class="ov-u">${u}</span><span class="ov-l">${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const tileHTML = tile;
  // Developments loading the scope (the filtered set), each alone at Peel design criteria.
  function loadRows(s, set) {
    const c = App().state.criteria, water = s.key === 'pz', rows = [];
    for (const p of set) {
      const lay = MM().svcLayerOf(p); if (lay === 'out' || lay === 'existing') continue;
      const e = D.estimate([p], c, 'all', App().jobsOf); if (!(e.totalUnits > 0 || e.employment.jobs > 0)) continue;
      const cb = e.combined;
      rows.push({ p, lay, e, avg: water ? cb.water.avg : cb.wastewater.avg, peak: water ? cb.water.maxDay : cb.wastewater.wetPeak });
    }
    return rows.sort((x, y) => y.peak - x.peak);
  }
  function headroom(s) {
    const M = App().state.svcModel, R = App().state.reports;
    // Stage 3: each tile is also kept as a key figure for the standard panel (the same values).
    const figs = [], out = o => ({ ...o, figs });
    const tile = (v, u, l, sub = '') => { figs.push({ v, u, label: l, ctx: sub }); return tileHTML(v, u, l, sub); };
    if (s.kind === 'plant') {
      // One capacity function (js/capacity.js): the same % and reserve as every other tab (SPEC 1.4).
      const k = window.PeelCapacity.of(`plant:${s.pl}`), c = MP().cached(`plant:${s.pl}`, () => MP().plantCons(s.pl)); if (!k || !c) return { tiles: '', hl: '' };
      const reserve = k.reserve, ppl = k.perPerson > 0 ? reserve * 1e6 / k.perPerson : null, pc = window.PeelCapacity.pctTxt;
      return out({
        hl: `<strong>${esc(s.title)}</strong> ${SvcTab().trigText(c)}: existing + built + committed use <strong>${pc(k.pctCommitted)}</strong> of its rated ${capTxt(k.rated, k.rated)}, <strong>${pc(k.pctBuildout)}</strong> at build-out (${SvcTab().wwFlowLabel('long')}).`,
        tiles: tile(fmt1(k.rated), 'ML/d', 'rated capacity') + tile(pc(k.pctCommitted), 'of rated', 'existing + built + committed', `${pc(k.pctBuildout)} at build-out`)
          + tile(fmt1(Math.abs(reserve)), 'ML/d', reserve < 0 ? 'over 100% of rated after committed' : 'room to 100% after committed (D-5-1 reserve)', ppl != null && reserve > 0 ? `≈${fmtNum(roundPop(ppl))} people` : '')
          + tile(c.out === 'today' ? 'now' : c.out ? `≈${c.out}` : `after ${window.PeelSvcPlants.hz.end}`, '', 'reaches the 90% expansion trigger', c.relief.length ? `next: ${esc(c.relief[0].text)}` : ''),
      });
    }
    if (s.kind === 'block') {
      const l = M.cum.get(s.a.id); if (!l) return { tiles: '', hl: '' };
      const now = M.adwf(MA().censusOnly(l)), bo = M.adwf(l);
      return out({
        hl: `<strong>${esc(s.title)}</strong>${s.up.length ? ` and the ${fmtNum(s.up.length)} block${s.up.length === 1 ? '' : 's'} upstream` : ''} carry ${fmt1(now)} ML/d at the census, ${fmt1(bo)} ML/d at build-out (average dry weather, design), to ${esc(SD().plantLabel(s.pl))}.`,
        tiles: tile(fmt1(now), 'ML/d', 'average dry at the census') + tile(fmt1(bo), 'ML/d', 'average dry at build-out', `+${fmt1(bo - now)} ML/d growth`)
          + tile(fmtNum(s.up.length), s.up.length === 1 ? 'block' : 'blocks', 'upstream')
          + (s.a.trunkMm ? tile(fmtNum(s.a.trunkMm), 'mm', `${pipeClass(s.a.trunkMm)} sewer at its outlet`, 'pipe capacity not assessed') : ''),
      });
    }
    if (s.kind === 'ps') {
      const ld = MA().psLoad(s.a); if (!ld) return { tiles: '', hl: `<strong>${esc(s.title)}</strong>: no firm capacity on record for this station.` };
      return out({
        hl: `<strong>${esc(s.title)}</strong>: peak wet weather ≈${fmtNum(Math.round(ld.wet))} L/s at build-out, <strong>${Math.round(ld.pct)}%</strong> of its firm capacity (${fmtNum(ld.firm)} L/s), to ${esc(SD().plantLabel(s.pl))}.`,
        tiles: tile(fmtNum(ld.firm), 'L/s', 'firm capacity') + tile(fmtNum(Math.round(ld.wet)), 'L/s', 'peak wet at build-out (check)', `${Math.round(ld.pct)}% of firm`) + tile(fmtNum(Math.round(ld.dry)), 'L/s', 'peak dry at build-out (reference)'),
      });
    }
    if (s.kind === 'zone') {
      const l = M.zones.get(s.a.id); if (!l) return { tiles: '', hl: '' };
      const now = M.wMax(l.census, 0), bo = M.wMax(M.total(l), M.jobs(l));
      return out({
        hl: `<strong>${esc(s.title)}</strong>: maximum day ${fmt1(now)} ML/d at the census, ${fmt1(bo)} ML/d at build-out.${s.lake ? ' Supplied from the lake (South Peel water system).' : ''}`,
        tiles: tile(fmt1(now), 'ML/d', 'max day at the census') + tile(fmt1(bo), 'ML/d', 'max day at build-out', `+${fmt1(bo - now)} ML/d growth`),
      });
    }
    // wsys: South Peel treatment — the 2025 measured maximum day plus the lake zones' growth, from the
    // one capacity function (as the Overview, the Water tab and the DC tab).
    const sp = R && R.water && R.water.southPeel; if (!sp) return { tiles: '', hl: '' };
    const k = window.PeelCapacity.of('wsys:southPeel'); if (!k) return { tiles: '', hl: '' };
    const pc = window.PeelCapacity.pctTxt, ty = k.triggerYear === 'today' ? 'is at its 90% expansion trigger now' : k.triggerYear ? `reaches its 90% expansion trigger ≈${k.triggerYear}` : 'stays below its 90% expansion trigger';
    return out({
      hl: `<strong>South Peel water system</strong> ${ty}: rated ${fmt1(k.rated)} ML/d of treatment (A.P. Kennedy + Lorne Park); 2025 maximum day ${fmt1(sp.maxDayMLd)} ML/d + committed growth = <strong>${pc(k.pctCommitted)}</strong> of rated, <strong>${pc(k.pctBuildout)}</strong> at build-out.`,
      tiles: tile(fmt1(k.rated), 'ML/d', 'rated treatment') + tile(fmt1(sp.maxDayMLd), 'ML/d', '2025 maximum day (measured)') + tile(pc(k.pctCommitted), 'of rated', 'existing + built + committed', `${pc(k.pctBuildout)} at build-out`)
        + tile(fmt1(Math.abs(k.reserve)), 'ML/d', k.reserve < 0 ? 'over 100% of rated after committed' : 'room to 100% after committed (D-5-1 reserve)'),
    });
  }
  // The ladder both ways: what the scope drains to / is fed by, and what feeds it.
  function ladder(s) {
    const M = App().state.svcModel, sv = App().state.servicing, up = [], down = [];
    const flowOf = id => { const l = M.cum.get(id); return l ? M.adwf(l) : 0; };
    if (s.kind === 'plant') {
      const stations = (sv.psAreas || []).filter(a => a.plant === s.pl).map(a => ({ a, ld: MA().psLoad(a) })).sort((x, y) => (y.ld ? y.ld.pct : -1) - (x.ld ? x.ld.pct : -1));
      if (stations.length) down.push(`<li><strong>Pumping stations</strong> (peak wet at build-out, % of firm): ${stations.map(x => `${link(x.a.id, SD().drName(x.a))}${x.ld ? ` ${Math.round(x.ld.pct)}%` : ''}`).join(' · ')}</li>`);
      const outlets = [...s.ids].map(id => SD().svcById.get(id)).filter(a => a && !(a.downstream && s.ids.has(a.downstream))).sort((x, y) => flowOf(y.id) - flowOf(x.id));
      if (outlets.length) down.push(`<li><strong>Arriving at the plant</strong> (block and everything upstream, average dry at build-out): ${outlets.slice(0, 8).map(a => `${link(a.id, SD().drName(a))} ${fmt1(flowOf(a.id))} ML/d`).join(' · ')}${outlets.length > 8 ? ` · +${outlets.length - 8} more` : ''}</li>`);
    }
    if (s.kind === 'block') {
      const dn = s.a.downstream && SD().svcById.get(s.a.downstream);
      up.push(`<li><strong>Drains to</strong> ${dn ? link(dn.id, SD().drName(dn)) : 'the plant directly'} → ${link(`plant:${s.pl}`, SD().plantLabel(s.pl))}</li>`);
      const kids = sv.drainage.filter(d => d.downstream === s.a.id).sort((x, y) => flowOf(y.id) - flowOf(x.id));
      if (kids.length) down.push(`<li><strong>Fed by</strong> ${kids.map(k => `${link(k.id, SD().drName(k))} ${fmt1(flowOf(k.id))} ML/d`).join(' · ')}</li>`);
      else down.push('<li><strong>Fed by</strong> nothing upstream: a head-of-system block</li>');
    }
    if (s.kind === 'ps' && PLANTS.includes(s.pl)) up.push(`<li><strong>Pumps to</strong> ${link(`plant:${s.pl}`, SD().plantLabel(s.pl))}</li>`);
    if (s.kind === 'zone') up.push(`<li><strong>Supplied by</strong> ${s.lake ? link('wsys:lake', 'the South Peel water system') : 'its own well system'}</li>`);
    if (s.kind === 'wsys') {
      const zs = [...s.ids].map(id => ({ a: SD().svcById.get(id), l: M.zones.get(id) })).filter(x => x.a && x.l).map(x => ({ ...x, bo: M.wMax(M.total(x.l), M.jobs(x.l)) })).sort((x, y) => y.bo - x.bo);
      down.push(`<li><strong>Zones</strong> (max day at build-out): ${zs.map(x => `${link(x.a.id, x.a.name)} ${fmt1(x.bo)} ML/d`).join(' · ')}</li>`);
    }
    return up.length || down.length ? `<section class="ov-card ss-ladder"><div class="ov-h"><h3>Servicing ladder</h3></div><ul class="small ss-list">${up.join('')}${down.join('')}</ul></section>` : '';
  }
  // ---- Stage 3: a servicing scope's Overview as the standard panel (the one-plant board) --------------
  // Header (the trail back to Peel, the scope, its status), the headroom sentence and tiles, its
  // capacity bar, its relief, what is driving it (the developments loading it), the ladder folded; the
  // card is the full table.
  function panelSpec(s, set) {
    const PN = window.PeelPanel, h = headroom(s), rows = loadRows(s, set), water = s.key === 'pz';
    const k = s.kind === 'plant' ? window.PeelCapacity.of(`plant:${s.pl}`) : s.kind === 'wsys' ? window.PeelCapacity.of('wsys:southPeel') : s.kind === 'ps' ? window.PeelCapacity.of(`ps:${s.a.id}`) : null;
    const c = s.kind === 'plant' ? MP().cached(`plant:${s.pl}`, () => MP().plantCons(s.pl)) : null;
    const tone = k ? PN.toneOf(k.pctBuildout) : null;
    const LB = window.PeelLayerBar;
    const dev = r => ({ tone: null, attrs: { 'data-pnl-dev': r.p.key }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${dot(r.p.phase)} ${esc(r.p.title)}</span><span class="pnl-r-fig">${uLs(r.peak)}<small>${water ? 'max day' : 'peak wet'}</small></span></div><small class="pnl-r-line">${esc(MM().LAYER_NAME[r.lay])} · ${esc(r.p.municipality)} · ${fmtNum(roundPop(r.e.population + r.e.employment.jobs))} people + jobs</small>` });
    const relief = c && c.relief.length ? c.relief.map(r => ({ html: `<div class="pnl-kv"><span>${esc(r.text)}</span></div>`, kv: true })) : [];
    return {
      calc: true, fullTitle: `${s.title} · every development loading it, the ladder and the planned works`,
      head: { trail: [{ label: 'Peel', attrs: { 'data-ss-close': '' } }, { label: s.title }], close: { 'data-ss-close': '' }, name: s.title,
        status: tone ? { tone, text: { over: 'Over', tight: 'Tight', room: 'Room' }[tone] } : null,
        identity: `${esc(KIND_LABEL[s.kind])}${k ? ` · ${k.firm != null ? 'firm' : 'rated'} ${k.unit === 'L/s' ? `${fmtNum(Math.round(k.cap))} L/s` : capTxt(k.cap, k.cap)}` : ''} · ${fmtNum(set.length)} developments in this scope` },
      answer: h.hl || `<strong>${esc(s.title)}</strong>`,
      figures: (h.figs || []).slice(0, 4).map(f => ({ ...f, tone: null })),
      chart: k && LB ? `<p class="small pnl-chart-t">Existing, built, committed and proposed flow <span class="pnl-chart-u">(% of ${k.firm != null ? 'firm' : 'rated'} capacity)</span></p>${LB.capacityBarHTML(k)}${LB.legendHTML([{ layer: 'existing' }, { layer: 'built' }, { layer: 'committed' }, { layer: 'proposed' }, 'trigger', 'rated', 'over'])}` : '',
      lists: [
        ...(relief.length ? [{ title: 'Relief', rows: relief, total: relief.length }] : []),
        { title: 'What is driving it', rows: rows.slice(0, 5).map(dev), total: rows.length, seeAll: { 'data-full-table': 'overview' } },
      ],
      folds: [{ title: 'Servicing ladder', html: ladder(s).replace(/^<section[^>]*>|<\/section>$/g, '') }],
      method: `${esc(SvcTab().scenarioText())}. Developments built since the census, committed and proposed; existing development is in the census flow. ${k ? (s.kind === 'ps' ? 'Peak wet weather against firm capacity (2020 Master Plan, Vol. 4, s. 2.3.2).' : 'Against rated capacity; the 2020 Master Plan expands a plant when 90% of rated is projected to be reached.') : ''}`,
      sources: 'Region of Peel 2025 annual reports; 2020 Water and Wastewater Master Plan; the sewer network and blocks (data/servicing.json, data/blocks.json); the applications and permits on the map at Peel design criteria.',
      foot: { primary: { label: 'Show on the map', attrs: { 'data-pnl-focus': s.a ? s.a.id : '' }, title: 'Zoom to it, with everything upstream' }, secondary: [{ label: 'Area report', attrs: { 'data-ss-report': '' } }] },
    };
  }
  function cardHTML(s, set) {
    if (!App().state.svcModel) return skel('Loading the servicing model');
    const h = headroom(s), rows = loadRows(s, set), water = s.key === 'pz';
    const shown = showAll ? rows : rows.slice(0, 10);
    const totAvg = rows.reduce((t, r) => t + r.avg, 0);
    const totPj = rows.reduce((t, r) => t + r.e.population + r.e.employment.jobs, 0);
    const what = water ? ['Average day', 'Max day'] : ['Average dry', 'Peak wet'];
    const works = (s.key === 'dr' || s.key === 'pz') && DI() && DI().dcAreaWorksHTML ? DI().dcAreaWorksHTML(s.ids, s.key, s.kind === 'plant' ? s.pl : null) : '';
    return `<div class="ov-top">${hlP(h.hl || `<strong>${esc(s.title)}</strong>`)}</div>${SCREEN_NOTE_SHORT}
      <p class="small muted ss-kind">${esc(KIND_LABEL[s.kind])} · ${fmtNum(set.length)} developments in this scope · <button type="button" class="btn small link" data-ss-close>Back to Peel</button></p>
      ${h.tiles ? `<div class="ov-tiles ss-tiles">${h.tiles}</div>` : ''}
      <div class="ss-grid">
        ${ladder(s)}
        <section class="ov-card ss-devs"><div class="ov-h"><h3>Developments loading it</h3><button type="button" class="btn small" data-ss-report>Area report</button></div>
          ${rows.length ? `<div class="dcb-scroll"><table class="dt ov-t ss-t"><caption class="small muted">${fmtNum(rows.length)} developments adding flow since the census, largest ${water ? 'max day' : 'peak wet weather'} first; each alone at Peel design criteria (peaks are not additive)</caption>
          <thead><tr><th>Development</th><th class="n">People + jobs</th><th class="n">${what[0]}</th><th class="n">${what[1]}</th><th class="n" title="This development's people + jobs as a share of all the growth loading it (not a share of capacity or reserve)">Share of growth<br><span class="muted">(people + jobs)</span></th></tr></thead>
          <tbody>${shown.map(r => `<tr><td>${dot(r.p.phase)} <button type="button" class="btn small link" data-ov-dev="${esc(r.p.key)}">${esc(r.p.title)}</button><small class="muted">${esc(MM().LAYER_NAME[r.lay])} · ${esc(r.p.municipality)}</small></td><td class="n">${fmtNum(roundPop(r.e.population + r.e.employment.jobs))}</td><td class="n">${uLs(r.avg)}</td><td class="n">${uLs(r.peak)}</td><td class="n">${totPj > 0 ? `${Math.round((r.e.population + r.e.employment.jobs) / totPj * 100)}%` : '–'}</td></tr>`).join('')}</tbody></table></div>
          ${rows.length > 10 ? `<p><button type="button" class="btn small" data-ss-all>${showAll ? 'Show top 10' : `See all ${fmtNum(rows.length)}`}</button></p>` : ''}
          <p class="small muted">Growth total, ${water ? 'average day' : 'average dry weather (design)'}: ${uLs(totAvg)} · ${uML(D.toMLd(totAvg))}.</p>` : '<p class="small muted">No development adds flow here since the census.</p>'}
        </section>
        ${works ? `<section class="ov-card ss-works">${works}</section>` : ''}
      </div>
      <p class="small muted ov-info">${esc(SvcTab().scenarioText())}. Developments built since the census, committed and proposed; existing development is in the census flow.</p>`;
  }

  // Water / Wastewater / DC are Peel-wide: below Peel (municipality, area, servicing scope) they say
  // so, and link the plants or zones the scoped developments load (design audit, Group 6).
  const PEEL_WIDE = { svc: 'Plants, pumping stations, storage and pressure zones', water: 'Pressure zones and treatment', ww: 'Plants, blocks and pumping stations', dca: 'DC projects' };
  function peelWideNote() {
    const el = typeof document !== 'undefined' && document.getElementById('scope-note'); if (!el || !App() || !App().state) return;
    const st = App().state, tab = AT() && AT().getFootTab();
    const below = st.muni || st.sp.length || st.mtsa.length || st.pz.length || st.dr.length || st.ss;
    if (!below || (window.DevScope && window.DevScope.current()) || !PEEL_WIDE[tab]) { el.hidden = true; return; }
    const set = st.filtered || [], count = new Map(), bump = k => count.set(k, (count.get(k) || 0) + 1);
    if (tab === 'water' || tab === 'svc') { for (const p of set) for (const id of SD().svcIds(p, 'pz')) bump(id); }
    if (tab !== 'water') for (const p of set) { const pl = MM().plantOfDev(p); if (PLANTS.includes(pl)) bump(`plant:${pl}`); }
    const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 5).filter(([ref]) => resolve(ref));
    el.innerHTML = `<strong>Peel-wide.</strong> ${PEEL_WIDE[tab]} serve all of Peel, so these tables are not filtered to ${esc(OT().scopeText())}.${top.length ? ` The ${fmtNum(set.length)} developments shown load: ${top.map(([ref, n]) => `${link(ref, resolve(ref).short)} (${fmtNum(n)})`).join(' · ')}.` : ''}`;
    el.hidden = false;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ss],[data-ss-close],[data-ss-all],[data-ss-report]'); if (!b) return;
    if (b.dataset.ss) { e.preventDefault(); open(b.dataset.ss); return; }
    if (b.hasAttribute('data-ss-close')) { close(); return; }
    if (b.hasAttribute('data-ss-all')) { showAll = !showAll; OT().renderOverview(); return; }
    if (b.hasAttribute('data-ss-report')) { const s = current(); if (s) Rep().areaReport(App().state.filtered.filter(has), `Area report – ${s.title}`, s.a && s.a.rings ? s.a.rings : []); }
  });

  const api = { resolve, current, has, open, close, clear, crumbs, label, cardHTML, panelSpec, peelWideNote, PLANTS, KIND_LABEL, openResult, closeResult, reopenResult, hasResult, resultTitle, isResultRef, restore, devKeysOf, RESULT_KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSvcScope = api;
})(typeof window !== 'undefined' ? window : globalThis);
