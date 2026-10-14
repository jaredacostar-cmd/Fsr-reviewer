/* js/dev-verdict.js — development scope verdicts (Phase 6 extraction).
 * The "one home per number" Overview card inputs: pure verdict/needs-attention
 * derivation + scope brief helpers.
 * Extracted verbatim from js/app.js (lines 1722-1838); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const map = root.PeelMapCore.map;
  const App = () => root.PeelApp;
  const AT = () => root.PeelAnalysisTabs;
  const MM = () => root.PeelMapMarkers;
  const MP = () => root.PeelMasterPlan;
  const MA = () => root.PeelMapAnalysis;
  const DN = () => root.PeelDevNav;
  const SC = () => root.PeelSewerCap;
  const DI = () => root.PeelDcInfra;
  const ST = () => root.PeelSewerTrace;

/* ---- app.js lines 1722-1838 ---- */
  // ---- Development scope (Phase 3): one home per number --------------------------------
  // The development open as the analysis scope: Worker A's DevScope when present, otherwise
  // the development open in the detail panel (the module-level currentProject).
  function scopedDev() {
    try {
      if (typeof DevScope !== 'undefined' && DevScope && typeof DevScope.current === 'function') {
        const p = DevScope.current();
        if (p) return p;
      }
    } catch (e) { /* DevScope not ready: fall through to the detail panel */ }
    return DN().getCurrentProject();
  }
  // First sentence of a (possibly escaped) status line.
  const firstSentence = (s) => {
    const t = String(s || '').trim(), m = /^(.*?\.)\s/.exec(t);
    return m ? m[1] : t;
  };
  // Pure verdict derivation for the scoped Overview card (unit-tested in tests/verdict.test.js
  // via source extraction). Each takes plain data and returns { tone, text }; the caller
  // supplies raw strings and escapes the returned text once.
  const verdictWater = (d) => {
    if (!d.zone) return { tone: 'warn', text: 'No pressure zone mapped' };
    if (d.outside) return { tone: 'warn', text: `Outside the mapped pressure zones — counted in ${d.zone} (nearest): a screening estimate` };
    return { tone: 'ok', text: `${d.zone}: this site is ${d.sharePct}% of the zone's build-out max day` };
  };
  const verdictWastewater = (d) => {
    if (d.noPath) return { tone: 'warn', text: 'Not in a traced drainage area' };
    if (d.toronto) return { tone: 'ok', text: 'Drains to the City of Toronto system (Malton): capacity is Toronto’s, not Peel’s' };
    const bad = d.pipePct >= 100 || d.psPct >= 100 || d.over;
    const warn = d.pipePct >= 90 || d.psPct >= 90 || d.commitPct >= 90;
    const bits = [];
    if (d.pipeMm != null) bits.push(`tightest pipe ${d.pipeMm} mm at ${d.pipePct}% of full capacity`);
    if (d.psName) bits.push(`${d.psName} ≈${d.psPct}% of firm capacity`);
    if (d.plant) bits.push(d.over ? `${d.plant} screens over rated capacity` : `${d.plant} reserve ${d.reserve} ML/d — this site ${d.usePct}% of it`);
    return { tone: bad ? 'bad' : warn ? 'warn' : 'ok', text: bits.join(' · ') || 'No capacity flags on its path' };
  };
  const verdictDc = (d) => {
    if (d.loading) return { tone: 'warn', text: 'The 2026 DC program is still loading' };
    if (d.gap) return { tone: 'bad', text: `Screens ahead of its main: needs a planned main by ${d.needBy}, before that main is in service` };
    if (d.needBy) return { tone: 'warn', text: `Outside the existing network: servicing about ${d.needBy} on the 2026 DC draft schedule` };
    if (d.nearby) return { tone: 'ok', text: `Served by the existing network · ${d.nearby} planned ${d.nearby === 1 ? 'work' : 'works'} nearby` };
    return { tone: 'ok', text: 'Served by the existing network — no planned works nearby' };
  };
  const verdictMilestone = (d) => {
    if (d.withdrawn) return { tone: 'warn', text: 'Withdrawn — no next milestone' };
    if (d.done) return { tone: 'ok', text: 'Completed — built out' };
    if (d.appeal) return { tone: 'warn', text: `Under appeal — next: ${d.next}, after the Tribunal decides` };
    if (d.stalled) return { tone: 'warn', text: `Stalled ${d.stalled} with no activity — next: ${d.next}` };
    return { tone: 'ok', text: `Next milestone: ${d.next}` };
  };
  // Pure Needs-attention derivation for the Overview card (unit-tested in
  // tests/needs-attention.test.js via source extraction). Takes plain data and returns
  // items { tone, text, tab, dev } in display order; the caller escapes the text once and
  // turns tab into a [data-ov-tab] button and dev into a [data-ov-dev] button.
  //   d.adv:     [{ name }] — DC projects that come online after the capacity they relieve runs out
  //   d.trig:    [{ sys, now, text }] — capacity constraints at/past the 90% expansion trigger
  //   d.stalled: [{ key, title, muni, units, unitsTxt, years }] — stalled sites, filtered to 250+ units here
  //   d.changes: [{ key, text }] — this week's new / phase-changed developments
  const needsAttention = (d) => {
    const items = [];
    const adv = d.adv || [];
    if (adv.length) {
      const names = adv.slice(0, 3).map(a => a.name).join('; ');
      items.push({ tone: 'bad', tab: 'dca', dev: null,
        text: `${adv.length} DC project${adv.length === 1 ? '' : 's'} come${adv.length === 1 ? 's' : ''} online after the capacity ${adv.length === 1 ? 'it relieves' : 'they relieve'} runs out: ${names}${adv.length > 3 ? ` (+${adv.length - 3} more)` : ''}` });
    }
    for (const c of d.trig || []) items.push({ tone: c.now ? 'bad' : 'warn', tab: c.sys === 'water' ? 'water' : 'ww', dev: null, text: c.text });
    const big = (d.stalled || []).filter(s => s.units >= 250).sort((a, b) => b.units - a.units).slice(0, 3);
    for (const s of big) items.push({ tone: 'warn', tab: null, dev: s.key, text: `Stalled ${s.years} with no activity — ${s.title} (${s.unitsTxt} units, ${s.muni})` });
    for (const c of (d.changes || []).slice(0, 4)) items.push({ tone: 'ok', tab: null, dev: c.key, text: c.text });
    return items;
  };
  // One-line pointer to a number's home tab, used where a duplicate was removed.
  const homeLine = (tab, label) => `<button type="button" class="btn small link" data-foot-tab="${tab}">${label} →</button>`;
  // The brief HTML carries document-wide ids (dev-*); footer copies get prefixed ids so the
  // detail panel's async fills and toggles keep working on the originals.
  const scopeBriefIds = (root) => {
    for (const n of root.querySelectorAll('[id^="dev-"]')) n.id = `f-${n.id}`;
  };
  // [data-foot-tab] clicks anywhere, plus the development-brief buttons reused in the footer
  // tabs whose handlers otherwise live on #detail-body ([data-pipe], [data-dcn-*]): no dead ends.
  // Clicks inside #detail-body keep their existing handlers (this listener skips them).
  document.addEventListener('click', e => {
    if (e.target.closest('#detail-body')) return;
    const g = e.target.closest('[data-foot-tab]');
    if (g) { AT().showFootTab(g.dataset.footTab); return; }
    const pb = e.target.closest('[data-pipe]');
    if (pb && MM().SEW.data) { const i = +pb.dataset.pipe; SC().showPipeLoads(i); const c = MM().SEW.data.pipes[i][10]; map.setView([c[1], c[0]], Math.max(map.getZoom(), 15)); return; }
    if (e.target.closest('[data-dcn-all]')) { SC().loadSewers(); MP().showDcTiming(); return; }
    const cn = e.target.closest('[data-dcn-cons]');
    if (cn && MP().DCN.reg && MP().DCN.reg.get(cn.dataset.dcnCons)) { MP().showConsDevs(MP().DCN.reg.get(cn.dataset.dcnCons)); return; }
    const r = e.target.closest('[data-dcn-relief]');
    if (r && MP().DCN.reg) {
      const [id, k] = r.dataset.dcnRelief.split('|'), c = MP().DCN.reg.get(id), rl = c && c.relief[+k];
      if (rl && rl.ln) { if (!MM().getDcOn().on) MA().setDcOn({ on: true, sys: 'both' }); MP().showDcLine(rl.ln); map.fitBounds(L.latLngBounds(rl.ln.g.map(([x, y]) => [y, x])), { maxZoom: 15, padding: [30, 30] }); }
      else if (rl && rl.fc) { DI().showFacility(rl.fc); if (rl.fc.g) map.setView([rl.fc.g[1], rl.fc.g[0]], Math.max(map.getZoom(), 14)); }
    }
    // Controls from the demand-by-application rows reused in the footer Demand tab.
    const us = e.target.closest('[data-uu-set]');
    if (us) { const cp = scopedDev(); if (cp) { const inp = us.parentElement.querySelector('[data-uu]'), n = +inp.value; const r0 = cp.records.find(x => x.ref === us.dataset.uuSet); if (r0 && n > 0) App().setUserUnits(r0, n); else inp.focus(); } return; }
    const uc = e.target.closest('[data-uu-clear]');
    if (uc) { const cp = scopedDev(); if (cp) { const r0 = cp.records.find(x => x.ref === uc.dataset.uuClear); if (r0) App().setUserUnits(r0, 0); } return; }
    const sb = e.target.closest('[data-sub]');
    if (sb) {
      const cp = scopedDev();
      if (cp) { const sub = DN().subProject(cp.parent || cp, sb.dataset.sub); if (sub) { MM().hoverSubLayer.clearLayers(); DN().showDetail(sub); const rings = MM().siteApps(sub).flatMap(a => a.poly); if (rings.length) ST().fitClear(L.latLngBounds(MM().toLatLngs(rings).flat()).pad(0.4)); } }
      return;
    }
    const dp = e.target.closest('[data-dev-parent]');
    if (dp) { const cp = scopedDev(); if (cp && cp.parent) DN().showDetail(cp.parent); return; }
    const o = e.target.closest('[data-open]');
    if (o) {
      const scope = o.closest('.f-pane') || document;
      const d = scope.querySelector(`#f-${CSS.escape(o.dataset.open)}`) || document.getElementById(o.dataset.open);
      if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  });

  // ---- Public contract ----
  const api = { scopedDev, firstSentence, verdictWater, verdictWastewater, verdictDc, verdictMilestone, needsAttention, homeLine, scopeBriefIds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevVerdict = api;
})(typeof window !== 'undefined' ? window : globalThis);
