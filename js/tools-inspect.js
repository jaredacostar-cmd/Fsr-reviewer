/* Peel Growth Pipeline (unofficial) – Phase 3b tool: "Inspect point"
 *
 * Tap anywhere for one composite servicing report: pressure zone, wastewater
 * block, the nearest existing mains (a live ArcGIS query), the sewer path to
 * the plant, the treatment plant's reserve, and the planned DC works nearby.
 * Each section loads independently and fails with a muted note.
 *
 * Registers id 'inspect' with PeelTools when the framework is present.
 */
(function () {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const EST = '<span class="est-tag">screening estimate</span>';

  const P = () => (typeof window !== 'undefined' ? window.PeelApp : null);
  const PA = () => (typeof window !== 'undefined' ? window.PeelAreas : null);

  const sec = (title, inner) => `<section><h4>${esc(title)}</h4>${inner}</section>`;
  const fail = what => `<p class="muted small">${esc(what)} — unavailable.</p>`;

  function fmtInt(n) {
    if (n == null || !isFinite(n)) return '–';
    return Math.round(n).toLocaleString('en-CA');
  }

  // ---- Sections (each fails independently) ------------------------------------

  async function zoneSection(app, lat, lng) {
    try {
      const svc = app.state.servicing;
      if (!svc || !PA()) return fail('Pressure zone data not loaded');
      const ids = PA().locate(svc.zones, lng, lat);
      let zone = ids.length ? svc.zones.find(z => z.id === ids[0]) : null;
      let note = '';
      if (!zone) {
        const est = await app.estimateZone({ lat, lng });
        zone = est && est.z;
        if (zone) note = ` <span class="muted small">(estimated — outside the mapped zones)</span>`;
      }
      if (!zone) return '<p class="muted small">Outside the mapped pressure zones.</p>';
      return `<p><strong>${esc(zone.name.replace('Pressure zone ', 'Zone '))}</strong>${note}</p>`;
    } catch (e) { return fail('Pressure zone lookup'); }
  }

  async function blockSection(app, lat, lng) {
    try {
      const b = app.blockAt(lng, lat);
      if (!b) return '<p class="muted small">Outside the mapped wastewater blocks.</p>';
      return `<p><strong>${esc(b.id)}</strong>${b.name && b.name !== b.id ? ` — ${esc(b.name)}` : ''}</p>`;
    } catch (e) { return fail('Wastewater block lookup'); }
  }

  async function mainsSection(app, lat, lng) {
    try {
      const res = await app.existingAround(lng, lat, 200);
      if (!res) return fail('Nearest mains');
      const labels = { water: 'Watermain', sanitary: 'Sanitary sewer', storm: 'Storm sewer' };
      const parts = [];
      for (const k of ['water', 'sanitary', 'storm']) {
        const g = res[k];
        if (!g || !g.list || !g.list.length) { parts.push(`<p class="muted small">No ${labels[k].toLowerCase()} within 200 m.</p>`); continue; }
        const items = g.list.slice(0, 5).map(it => {
          const a = it.a || {};
          const what = [a.d ? `${a.d} mm` : '', a.mat || '', /FM/.test(a.type || '') ? 'forcemain' : ''].filter(Boolean).join(' ');
          return `<li>${esc(what || 'main')} — ${fmtInt(it.m)} m${it.street ? ` · ${esc(it.street)}` : ''}${it.n > 1 ? ` (×${it.n})` : ''}</li>`;
        }).join('');
        parts.push(`<p class="small"><strong>${labels[k]}</strong></p><ul class="why-list">${items}</ul>${g.more ? `<p class="muted small">+${g.more} more within 200 m.</p>` : ''}`);
      }
      return `${parts.join('')}<p class="muted small">Live query of the Region's published GIS layers.</p>`;
    } catch (e) { return fail('Nearest mains (GIS query)'); }
  }

  async function traceSection(app, latlng) {
    try {
      const t = await app.tracePoint(latlng);
      return app.traceSummaryHTML(t);
    } catch (e) { return fail('Sewer path trace'); }
  }

  async function plantSection(app, trace) {
    try {
      if (!trace || !trace.plantName) return fail('Treatment plant reserve (no trace reached a plant)');
      if (trace.plantName === 'Toronto') return '<p class="muted small">Drains to the City of Toronto system — capacity not modelled here.</p>';
      const c = app.plantCons(trace.plantName);
      if (!c) return fail(`Treatment plant reserve (${trace.plantName})`);
      return `<table class="dt"><caption>${esc(c.name)} — room to the 90% expansion trigger ${EST}</caption>
        <tbody>
        <tr><td>Room to the 90% trigger after existing + built + committed</td><td>${c.room.toFixed(1)} ML/d</td></tr>
        <tr><td>≈ People</td><td>≈${fmtInt(Math.max(0, c.people))}</td></tr>
        <tr><td>Runs out</td><td>${c.out === 'today' ? 'at capacity today' : c.out == null ? 'holds to build-out' : `≈${c.out}`}</td></tr>
        </tbody></table>`;
    } catch (e) { return fail('Treatment plant reserve'); }
  }

  async function worksSection(app, lat, lng) {
    try {
      const pt = [lng, lat];
      const parts = [];
      for (const sys of ['wastewater', 'water']) {
        const n = app.dcNearest(sys, pt, 1000);
        parts.push(n
          ? `<li>${esc(app.dcLineText(n.ln))} — ${fmtInt(n.m)} m away</li>`
          : `<li class="muted">No planned ${sys} main within 1 km.</li>`);
      }
      return `<ul class="why-list">${parts.join('')}</ul><p class="muted small">From the 2026 development-charges background maps.</p>`;
    } catch (e) { return fail('Planned works lookup'); }
  }

  // ---- Tool registration ------------------------------------------------------

  async function onClick(latlng) {
    const app = P(); if (!app || !latlng || typeof window === 'undefined' || !window.PeelTools) return;
    const PT = window.PeelTools;
    const lat = latlng.lat, lng = latlng.lng;
    PT.openResult({ title: 'Inspect point', html: `<p class="muted">Loading the servicing picture at ${lat.toFixed(5)}, ${lng.toFixed(5)}…</p>` });
    // The trace is needed by two sections; run it once, up front.
    let trace = null, traceHtml = '';
    try { trace = await app.tracePoint(latlng); traceHtml = app.traceSummaryHTML(trace); }
    catch (e) { traceHtml = fail('Sewer path trace'); }
    const [zone, block, mains, plant, works] = await Promise.all([
      zoneSection(app, lat, lng),
      blockSection(app, lat, lng),
      mainsSection(app, lat, lng),
      plantSection(app, trace),
      worksSection(app, lat, lng),
    ]);
    PT.openResult({
      title: 'Inspect point',
      html: `<p class="muted small">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
        ${sec('Pressure zone', zone)}
        ${sec('Wastewater block', block)}
        ${sec('Nearest existing mains', mains)}
        ${sec('Sewer path to the plant', traceHtml)}
        ${sec('Treatment plant reserve', plant)}
        ${sec('Planned works nearby', works)}`,
    });
  }

  if (typeof window !== 'undefined' && window.PeelTools) {
    window.PeelTools.register('inspect', {
      title: 'Inspect point',
      icon: 'tips',
      hint: 'tap anywhere',
      onClick,
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { zoneSection, blockSection, mainsSection, plantSection, worksSection, onClick };
  }
})();
