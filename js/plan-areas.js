(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { $, esc, token, store } = window.PeelUtil;
  const PeelAreas = window.PeelAreas; // pre-existing global (js/areas.js), loads before this module
  const map = window.PeelMapCore.map;
  const MM = () => window.PeelMapMarkers;
  const SD = () => window.PeelSvcData;
  const App = () => window.PeelApp;

  // ---- Planning areas: secondary plans / character areas and MTSAs ------------------------
  const areaById = new Map();
  const areaLayer = L.layerGroup().addTo(map);
  async function loadAreas() {
    try {
      const res = await fetch('data/areas.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const a = await res.json();
      App().state.areas = { secondaryPlans: PeelAreas.prepare(a.secondaryPlans), mtsas: PeelAreas.prepare(a.mtsas), precincts: PeelAreas.prepare(a.precincts || []), census: a.census, sources: a.sources, generatedAt: a.generatedAt };
      for (const x of [...App().state.areas.secondaryPlans, ...App().state.areas.mtsas]) areaById.set(x.id, x);
      // Census years (newest first): 2021 always; earlier ones (2016) when published.
      const list = a.censuses || (a.census ? [{ year: 2021, ...a.census }] : []);
      App().state.censuses = list.map(c => {
        const year = c.year || Number(String(c.date).slice(0, 4));
        return { year, date: c.date, source: c.source, das: PeelAreas.tagCensus(c), outlines: c.outlines ? `data/${c.outlines}` : year === 2021 ? 'data/das.json' : `data/das-${year}.json` };
      }).sort((x, y) => y.year - x.year);
      App().state.censusDas = App().state.censuses.length ? App().state.censuses[0].das : null;
      tagProjects();
      renderAreaSelects();
      renderPlanAreas();
      App().applyFilters();
      // The servicing model needs the census baseline: build it now that it is here.
      if (App().state.servicing && window.PeelSvcTab) window.PeelSvcTab.renderSvcTab();
    } catch (e) { /* areas are optional */ }
  }
  function tagProjects() {
    SD().tagServicing();
    if (!App().state.areas) return;
    for (const p of App().state.projects) {
      p.sp = PeelAreas.locate(App().state.areas.secondaryPlans, p.lng, p.lat, p.municipality);
      p.mtsa = PeelAreas.locate(App().state.areas.mtsas, p.lng, p.lat, p.municipality);
    }
  }
  function renderAreaSelects() {
    if (!App().state.areas) return;
    renderMulti('sp'); renderMulti('mtsa');
    const note = $('#f-sp-note'); if (note) note.hidden = !(App().state.muni === 'Mississauga' || App().state.sp.some(id => (areaById.get(id) || {}).municipality === 'Mississauga'));
  }
  // The area dropdowns: grouped checkbox lists. Names of a list's picks (or "MTSA" prefixed in
  // sentences), and a short summary for the closed dropdown.
  function areaName(k, id) { return k === 'sp' || k === 'mtsa' ? (areaById.get(id) || {}).name || '' : k === 'dr' ? SD().drName(SD().svcById.get(id) || {}) : (SD().svcById.get(id) || {}).name || ''; }
  function multiSummary(k, prose) {
    const ids = App().state[k], n = ids.length, f = MM().AREA_F[k];
    if (!n) return prose ? '' : f.all;
    const name = n === 1 ? areaName(k, ids[0]) : n <= 2 && prose ? ids.map(id => areaName(k, id)).join(' + ') : `${n} ${f.one === 'MTSA' ? 'MTSAs' : `${f.one}s`}`;
    return prose && k === 'mtsa' && n <= 2 ? `MTSA ${name}` : name;
  }
  function spSummary() { return multiSummary('sp'); }
  function multiGroups(k) {
    if (k === 'sp' || k === 'mtsa') {
      if (!App().state.areas) return [];
      const list = (k === 'sp' ? App().state.areas.secondaryPlans : App().state.areas.mtsas).filter(a => !App().state.muni || a.municipality === App().state.muni);
      return [...new Set(list.map(a => a.municipality))].map(m => [m, list.filter(a => a.municipality === m).map(a => [a.id, a.name])]);
    }
    if (!App().state.servicing) return [];
    if (k === 'pz') return [['', App().state.servicing.zones.slice().sort(SD().byZone).map(z => [z.id, z.name])]];
    const dr = App().state.servicing.drainage;
    return [...new Set(dr.map(d => d.plant))].map(pl => [SD().plantLabel(pl), dr.filter(d => d.plant === pl).map(d => [d.id, SD().drName(d)])]);
  }
  // The sp / mtsa / pz / dr dropdown markup, rendered into the filter panel (#f-areas).
  function areaMultiHTML() {
  // The sp / mtsa / pz / dr dropdowns live in the filter panel (#f-areas) now.
  // (Moved from search-filter.js top-level, old line 4142: this module loads after
  // search-filter.js, so PeelPlanAreas.areaMultiHTML is only available here.)
  const faBox = $('#f-areas'); if (faBox) faBox.innerHTML = areaMultiHTML();
    return Object.entries(MM().AREA_F).map(([k, f]) => `<div class="mo-field${f.svc ? ' ab-svc' : ''}"${f.svc ? ' hidden' : ''}><span id="f-${k}-label" data-info="${f.info}">${f.label}</span>
        <details class="multi" id="f-${k}" data-multi="${k}">
          <summary aria-labelledby="f-${k}-label f-${k}-summary"><span id="f-${k}-summary">${f.all}</span></summary>
          <div class="multi-panel">
            <div class="multi-tools"><input type="search" id="f-${k}-q" placeholder="${f.find}" aria-label="${f.find.replace('…', '')}"><button type="button" class="btn small link" data-multi-clear="${k}">Clear</button></div>
            <div class="multi-list" id="f-${k}-list" role="group" aria-label="${f.label}"></div>
          </div>
        </details></div>`).join('') +
      `<small id="f-sp-note" hidden>Mississauga has no secondary plans; its Official Plan character areas are listed instead.</small>`;
  }
  function renderMulti(k) {
    const box = $(`#f-${k}`); if (!box) return;
    const q = ($(`#f-${k}-q`).value || '').trim().toLowerCase();
    $(`#f-${k}-list`).innerHTML = multiGroups(k).map(([g, items]) => [g, items.filter(([, n]) => !q || n.toLowerCase().includes(q))]).filter(([, items]) => items.length)
      .map(([g, items]) => (g ? `<div class="multi-group">${esc(g)}</div>` : '') + items.map(([id, n]) =>
        `<label class="multi-item"><input type="checkbox" value="${esc(id)}"${App().state[k].includes(id) ? ' checked' : ''}><span>${esc(n)}</span></label>`).join('')).join('')
      || '<p class="small muted">No match.</p>';
    $(`#f-${k}-summary`).textContent = multiSummary(k);
    box.classList.toggle('on', App().state[k].length > 0);
  }
  // After a pick: outline and zoom to the chosen areas, then filter.
  function afterAreaPick(k, zoom) {
    if (MM().AREA_F[k].svc) SD().showSvcArea(zoom); else { showArea(zoom); renderPlanAreas(); }
    if (k === 'sp') $('#f-sp-note').hidden = !(App().state.muni === 'Mississauga' || App().state.sp.some(id => (areaById.get(id) || {}).municipality === 'Mississauga'));
    App().applyFilters();
  }
  // Outline the chosen areas on the map and zoom to them.
  function showArea(zoom) {
    areaLayer.clearLayers();
    const shown = [...App().state.sp, ...App().state.mtsa].map(id => areaById.get(id)).filter(Boolean);
    let bounds = null;
    for (const a of shown) {
      const l = L.polygon(a.rings.map(r => r.map(([x, y]) => [y, x])), {
        renderer: MM().canvas, interactive: false, fill: true, fillOpacity: 0.06, weight: 2.5, dashArray: '8 6',
        color: token(a.id.startsWith('mtsa') ? '--area-mtsa' : '--area-sp'),
      });
      areaLayer.addLayer(l);
      bounds = bounds ? bounds.extend(l.getBounds()) : l.getBounds();
    }
    if (zoom && bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }
  // Outlines of every secondary plan / character area and MTSA (map toggles), under the results
  // and developments; tapping one filters to it, tapping it again clears that filter.
  map.createPane('planPane', map.getPane('rotatePane') || undefined).style.zIndex = (window.PeelLayerGroups ? window.PeelLayerGroups.Z.plan : 330);
  const planRenderer = L.canvas({ pane: 'planPane', padding: 0.3 });
  const planLayer = L.layerGroup().addTo(map);
  function setAreaOn(ch) {
    Object.assign(MM().areaOn, ch); store.set('areaSp', MM().areaOn.sp); store.set('areaMtsa', MM().areaOn.mtsa); store.set('areaPr', !!MM().areaOn.pr);
    const set = (id, v) => { const c = document.getElementById(id); if (c) c.checked = v; };
    set('lyr-sp', MM().areaOn.sp); set('lyr-mtsa', MM().areaOn.mtsa); set('lyr-pr', !!MM().areaOn.pr);
    if (window.PeelLayerGroups) window.PeelLayerGroups.sync();
    renderPlanAreas();
  }
  function renderPlanAreas() {
    planLayer.clearLayers();
    if (!App().state.areas) return;
    // While constraint layers are on, the outlines are context only: the constraints take the
    // hover card and the tap (each pane draws on its own canvas; the top one takes the pointer).
    const tappable = !(window.PeelConstraints && window.PeelConstraints.anyOn && window.PeelConstraints.anyOn());
    for (const [on, list, colorName, kind] of [[MM().areaOn.sp, App().state.areas.secondaryPlans, '--area-sp', 'sp'], [MM().areaOn.pr, App().state.areas.precincts || [], '--area-pr', 'pr'], [MM().areaOn.mtsa, App().state.areas.mtsas, '--area-mtsa', 'mtsa']]) {
      if (!on) continue;
      for (const a of list) {
        if (App().state.muni && a.municipality !== App().state.muni) continue;
        const sel = (kind === 'mtsa' ? App().state.mtsa : App().state.sp).includes(a.id);
        const poly = L.polygon(a.rings.map(r => r.map(([x, y]) => [y, x])), { renderer: planRenderer, interactive: tappable, color: token(colorName), weight: sel ? 3 : 1.5, opacity: 0.9, dashArray: kind === 'mtsa' ? '4 4' : null, fill: true, fillColor: token(colorName), fillOpacity: sel ? 0.12 : 0.03 });
        // Precincts are outlines for context (developments are tagged by plan and MTSA, not precinct).
        if (!tappable || kind === 'pr') { poly.options.interactive = false; poly.addTo(planLayer); continue; }
        poly.bindTooltip(window.PeelUtil.hoverCard({ kind: kind === 'mtsa' ? 'MTSA' : kind === 'pr' ? 'Precinct' : a.municipality === 'Mississauga' ? 'Character area' : 'Secondary plan', name: a.name, sub: a.municipality || '', open: sel ? 'clear the filter' : 'filter to it' }), { sticky: true, className: 'pt' })
          .on('click', ev => { L.DomEvent.stop(ev); togglePlanArea(kind, a.id); }).addTo(planLayer);
      }
    }
  }
  function togglePlanArea(kind, id) {
    App().state[kind] = App().state[kind].includes(id) ? App().state[kind].filter(x => x !== id) : [...App().state[kind], id];
    renderAreaSelects(); showArea(); renderPlanAreas(); App().applyFilters();
  }
  for (const k of Object.keys(MM().AREA_F)) {
    const listEl = $(`#f-${k}-list`); if (listEl) listEl.onchange = e => {
      const cb = e.target.closest('input[type=checkbox]'); if (!cb) return;
      App().state[k] = cb.checked ? [...new Set([...App().state[k], cb.value])] : App().state[k].filter(id => id !== cb.value);
      $(`#f-${k}-summary`).textContent = multiSummary(k);
      $(`#f-${k}`).classList.toggle('on', App().state[k].length > 0);
      afterAreaPick(k, true);
    };
    const qEl = $(`#f-${k}-q`); if (qEl) qEl.oninput = () => renderMulti(k);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-multi-clear]'); if (!b) return;
    const k = b.dataset.multiClear; App().state[k] = []; const q = $(`#f-${k}-q`); if (q) q.value = ''; renderMulti(k); afterAreaPick(k, false);
  });
  // Close an open list when tapping elsewhere.
  document.addEventListener('click', e => { document.querySelectorAll('details.multi[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }); });

  const api = {
    areaById, loadAreas, tagProjects, renderAreaSelects, areaName, multiSummary,
    spSummary, areaMultiHTML, renderMulti, showArea, setAreaOn, renderPlanAreas,
    togglePlanArea,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPlanAreas = api;
})(typeof window !== 'undefined' ? window : globalThis);
