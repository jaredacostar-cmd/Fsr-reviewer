/* DC servicing gate in the app (PeelDcGate): which developments count toward the DC analysis,
 * read from data/dc-gate.json (scripts/build-dc-gate.js, built weekly from the city site servicing
 * and septic permits, js/servicing-permits.js).
 *
 *   - A chip in a development's header beside the stage ("DC: counted · servicing applied 2025-05-01").
 *     Pressed, a box opens under the header listing the permits that set it.
 *   - Each permit: "Show on map" drops a pin on it; "Check the city record" fetches that permit
 *     live from the city's own permit server and shows its fields (no builder, contractor or other
 *     names: js/privacy.js), with a link to the record on the server.
 *   - The DC servicing filter (Filters › What, state.dcgate) narrows the map and lists to a bucket.
 *
 * Pure: BUCKETS, tone(), chipText(), recordQuery() (tests/dc-gate-ui.test.js).
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Bucket key → short chip words, filter label, long explanation, tone.
  // Each city's own name for the permit, as its permit records write it.
  const TERM = { Mississauga: 'Site Servicing', Brampton: 'Site Service', Caledon: 'Site Services' };
  const termOf = muni => TERM[muni] || 'Site servicing';
  const BUCKETS = {
    counted:      { chip: m => `${termOf(m)} permit`,                label: 'Applied for or issued',               tone: 'room',  why: 'A water or wastewater site servicing permit has been applied for or issued on this site, so it counts toward the DC analysis.' },
    existingOnly: { chip: m => `${termOf(m)} permit: existing building`, label: 'For existing buildings only',     tone: 'tight', why: 'The only site servicing permits here are for buildings already there (a replacement main, a fire line). Not counted: check by hand.' },
    private:      { chip: () => 'Septic permit: private servicing',  label: 'Septic (private servicing)',           tone: 'aer',   why: 'Privately serviced (septic): outside the Regional DC count.' },
    permitNoSvc:  { chip: m => `No ${termOf(m)} permit`,             label: 'Building permit, none applied for',    tone: 'wait',  why: 'A building permit but no site servicing permit. Often serviced through a subdivision agreement or an existing connection. Not counted under the servicing rule.' },
    none:         { chip: m => `No ${termOf(m)} permit`,             label: 'None applied for yet',                 tone: 'wait',  why: 'No site servicing permit yet. Not counted.' },
  };
  // Filter values (state.dcgate): a bucket, or 'notcounted' for every bucket but counted.
  const FILTER = [['', 'Any'], ['counted', BUCKETS.counted.label], ['notcounted', 'Not applied for (all others)'],
    ['permitNoSvc', BUCKETS.permitNoSvc.label], ['none', BUCKETS.none.label], ['existingOnly', BUCKETS.existingOnly.label], ['private', BUCKETS.private.label]];
  const FILTER_KEYS = new Set(FILTER.map(([k]) => k));
  const filterLabel = k => (FILTER.find(([v]) => v === k) || [k, k])[1];

  function chipText(row) {
    if (!row) return '';
    const b = BUCKETS[row.bucket]; if (!b) return '';
    const c = b.chip(row.municipality);
    if (row.bucket === 'counted' && row.servicingApplied) return `${c} · applied ${row.servicingApplied}`;
    if (row.septicReview) return `${c} · septic on site, check`;
    return c;
  }
  const tone = row => (row && BUCKETS[row.bucket] ? BUCKETS[row.bucket].tone : 'wait');
  /** Does a gate row pass the filter value? */
  function passes(row, f) {
    if (!f) return true;
    if (!row) return false;
    return f === 'notcounted' ? row.bucket !== 'counted' : row.bucket === f;
  }

  // Each permit source: the layer, its permit-number field and the fields shown (no people fields).
  const SOURCES = {
    'mis-permits': { layer: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/ArcGIS/rest/services/Issued_Building_Permits/FeatureServer/0',
      id: 'BP_NO', fields: ['BP_NO', 'STATUS', 'ADDRESS', 'FILE_TYPE', 'APP_DETAIL', 'SCOPE', 'DESCRIPTION', 'RES_UNITS', 'APPLICATION_DATE', 'ISSUE_DATE', 'COMPLETE_DATE'], html: true },
    'bra-permits': { layer: 'https://maps1.brampton.ca/arcgis/rest/services/BuildingPermit/Building_Permits/MapServer/0',
      id: 'PERMITNUMBER', fields: ['PERMITNUMBER', 'STATUSDESC', 'ADDRESS', 'SUBDESC', 'WORKDESC', 'INDATE', 'ISSUEDATE', 'EXPIRYDATE', 'DWELLINGS', 'GFA'] },
    'cal-permits': { layer: 'https://utility.arcgis.com/usrsvcs/servers/51b993780db441b083808ed0bd59a554/rest/services/AGOL/MiscLayers/MapServer/0',
      id: 'REFERENCEFILE', fields: ['REFERENCEFILE', 'CUSTOMFOLDERNUMBER', 'STATUSDESC', 'FULLADDRESS', 'FOLDERTYPE', 'SUBDESC', 'WORKDESC', 'FOLDERDESCRIPTION', 'INDATE', 'ISSUEDATE', 'UNITSCREATED'] },
  };
  const DESC_FIELDS = new Set(['DESCRIPTION', 'FOLDERDESCRIPTION']);
  const DATE_FIELDS = /DATE$/;
  /** The query URL for one permit on its city server. format: 'json' (the app reads it) or the
   *  link a person opens ('html' where the server allows it, else pretty JSON). */
  function recordQuery(src, ref, format = 'json') {
    const s = SOURCES[src]; if (!s || !ref) return null;
    const f = format === 'json' ? 'json' : (s.html ? 'html' : 'pjson');
    const q = new URLSearchParams({ where: `${s.id}='${String(ref).replace(/'/g, "''")}'`, outFields: s.fields.join(','), returnGeometry: 'false', f });
    return `${s.layer}/query?${q.toString()}`;
  }

  // ---- Browser ---------------------------------------------------------------------------------
  const G = { data: null, by: null, loading: null };
  function load() {
    if (G.data || G.loading || typeof fetch !== 'function') return G.loading || Promise.resolve(G.data);
    G.loading = fetch('data/dc-gate.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => {
      G.data = d || { developments: [] };
      G.by = new Map(G.data.developments.map(r => [r.key, r]));
      G.loading = null;
      refreshAll();
      const A = root.PeelApp; if (A && A.state && A.state.dcgate && A.applyFilters) A.applyFilters();
      // (a Home page drawn before the permits loaded: drawn again with them)
      const W = root.PeelWorkspaces; if (W && W.mode && W.mode() === 'home' && W.renderPage) W.renderPage(true);
      return G.data;
    });
    return G.loading;
  }
  const rowOf = p => (p && G.by ? G.by.get(p.key) || null : null);
  const loaded = () => !!G.by;

  let openKey = null;
  function chipHTML(p) {
    if (!p) return '';
    if (!G.by) { load(); return ''; }
    const row = rowOf(p); if (!row) return '';
    const on = openKey === p.key;
    return `<button type="button" class="pnl-chip dcg-chip t-${tone(row)}" data-dcg-chip="${esc(p.key)}" aria-expanded="${on}" title="${esc(BUCKETS[row.bucket].why)} Press to see the permits.">${esc(chipText(row))} <span class="aer-car" aria-hidden="true">${on ? '▾' : '▸'}</span></button>`;
  }
  const boxHTML = p => (p && rowOf(p) ? `<div class="dcg-box" data-dcg-box="${esc(p.key)}"${openKey === p.key ? '' : ' hidden'}>${openKey === p.key ? boxInner(rowOf(p)) : ''}</div>` : '');

  const SVC_WORDS = { water: 'water', wastewater: 'wastewater', storm: 'storm only', 'not stated': 'pipes not stated' };
  function evidenceHTML(e, i, key, muni) {
    if (!e.ref) return `<li class="dcg-ev"><span class="dcg-k">Septic</span> named in this development's own permit text</li>`;
    const kind = e.kind === 'septic' ? 'Septic permit' : `${termOf(muni)} permit`;
    const svc = e.kind === 'site' ? (e.services || []).map(s => SVC_WORDS[s] || s).join(' + ') : '';
    const dates = [e.applied ? `applied ${e.applied}` : '', e.issued ? `issued ${e.issued}` : 'not issued yet'].filter(Boolean).join(' · ');
    const how = e.match === 'boundary' ? 'inside the site boundary' : e.match === 'address' ? 'same address' : e.match ? `${e.match} of the site point` : '';
    const live = e.src && SOURCES[e.src];
    return `<li class="dcg-ev" data-dcg-ev="${i}">
      <div><strong>${esc(e.ref)}</strong> <span class="dcg-k">${kind}</span>${svc ? ` · ${esc(svc)}` : ''}${e.existing ? ' · <span class="dcg-warn">existing building</span>' : ''}</div>
      <div class="small muted">${esc(dates)}${how ? ` · matched ${esc(how)}` : ''}${e.address ? ` · ${esc(e.address)}` : ''}</div>
      ${e.description ? `<div class="small">${esc(e.description)}</div>` : ''}
      <div class="dcg-act small">${e.lat != null ? `<button type="button" class="btn small link" data-dcg-pin="${esc(key)}|${i}">Show on map</button>` : ''}${live ? `${e.lat != null ? ' · ' : ''}<button type="button" class="btn small link" data-dcg-rec="${esc(key)}|${i}">Check the city record</button>` : ''}</div>
      <div class="dcg-rec" hidden></div>
    </li>`;
  }
  function boxInner(row) {
    if (!row) return '';
    const b = BUCKETS[row.bucket], ev = row.evidence || [];
    const extra = [row.septicReview ? 'A septic permit is on this site too. On a development this size it is usually the house already on the land.' : '',
      row.predated ? `${row.predated} older servicing permit${row.predated === 1 ? '' : 's'} on the land (applied more than a year before the first planning file) ${row.predated === 1 ? 'was' : 'were'} left out: ${row.predated === 1 ? 'it is' : 'they are'} for what stood there before.` : ''].filter(Boolean);
    return `<p class="small"><strong>Site servicing permit: ${esc(b.label.toLowerCase())}.</strong> ${esc(b.why)}</p>
      ${extra.map(t => `<p class="small muted">${esc(t)}</p>`).join('')}
      ${ev.length ? `<ul class="dcg-list">${ev.map((e, i) => evidenceHTML(e, i, row.key, row.municipality)).join('')}</ul>` : '<p class="small muted">No site servicing or septic permit matched to this site.</p>'}
      <p class="small muted dcg-note">From the city building permit feeds. A site servicing permit is a local Building Code permit for the private-side pipes: it shows servicing is underway, not the Region's own servicing application.</p>
      <p class="aer-foot small"><button type="button" class="btn small link" data-dcg-close>Close</button></p>`;
  }

  // ---- Source record, fetched live ------------------------------------------------------------
  const fmtVal = (k, v) => {
    if (v == null || v === '') return '';
    if (DATE_FIELDS.test(k) && typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
    if (DESC_FIELDS.has(k) && root.PeelPrivacy) return root.PeelPrivacy.scrubDescription(String(v));
    return String(v).trim();
  };
  async function showRecord(el, e) {
    const url = recordQuery(e.src, e.ref, 'json'), link = recordQuery(e.src, e.ref, 'link');
    el.hidden = false;
    el.innerHTML = '<p class="small muted">Asking the city’s permit server…</p>';
    try {
      const r = await fetch(url); const d = await r.json();
      if (d.error) throw new Error(d.error.message || 'server error');
      const fs = (d.features || []).map(f => f.attributes);
      if (!fs.length) { el.innerHTML = `<p class="small dcg-warn">The city server has no permit ${esc(e.ref)} now: it may have been renumbered or removed. <a href="${esc(link)}" target="_blank" rel="noopener">Query ↗</a></p>`; return; }
      const alias = d.fieldAliases || {};
      const tables = fs.slice(0, 3).map(a => `<table class="dcg-tab small"><tbody>${SOURCES[e.src].fields.map(k => { const v = fmtVal(k, a[k]); return v ? `<tr><th>${esc(alias[k] || k)}</th><td>${esc(v)}</td></tr>` : ''; }).join('')}</tbody></table>`).join('');
      el.innerHTML = `<p class="small"><strong>City record, live</strong>${fs.length > 1 ? ` (${fs.length} records share this number${fs.length > 3 ? ', first 3 shown' : ''})` : ''} · <a href="${esc(link)}" target="_blank" rel="noopener">open on the city server ↗</a></p>${tables}`;
    } catch (err) {
      el.innerHTML = `<p class="small muted">The city server didn’t answer (${esc(err.message || 'network')}). <a href="${esc(link)}" target="_blank" rel="noopener">Try the record on the server ↗</a></p>`;
    }
  }

  // ---- Map pin -----------------------------------------------------------------------------------
  let pinLayer = null;
  function pin(e) {
    const L = root.L, MC = root.PeelMapCore; if (!L || !MC || !MC.map || e.lat == null) return;
    if (!pinLayer) pinLayer = L.layerGroup().addTo(MC.map);
    pinLayer.clearLayers();
    const col = (getComputedStyle(document.documentElement).getPropertyValue('--cap-tight-t') || '').trim() || 'orange';
    L.circleMarker([e.lat, e.lng], { radius: 9, color: col, weight: 3, fill: true, fillColor: col, fillOpacity: 0.3, className: 'dcg-pin' })
      .bindTooltip(`${e.ref} · ${e.kind === 'septic' ? 'septic' : 'site servicing'}`, { permanent: true, direction: 'top', offset: [0, -8] })
      .addTo(pinLayer);
    MC.map.setView([e.lat, e.lng], Math.max(MC.map.getZoom(), 17));
  }

  // ---- Wiring -------------------------------------------------------------------------------------
  const byKey = (attr, key) => [...document.querySelectorAll(`[${attr}]`)].filter(x => x.getAttribute(attr) === key);
  function refreshAll() {
    if (typeof document === 'undefined') return;
    const p = root.DevScope && root.DevScope.current && root.DevScope.current();
    if (!p) return;
    // The header was built before the gate loaded: put the chip beside the stage and the box under it.
    for (const t of document.querySelectorAll('.pnl-title')) {
      if (t.querySelector('[data-dcg-chip]')) continue;
      const head = t.closest('.pnl-head'); if (!head || !head.querySelector('[data-stage-chip]')) continue;
      t.insertAdjacentHTML('beforeend', chipHTML(p));
      if (!head.querySelector('[data-dcg-box]')) head.insertAdjacentHTML('beforeend', boxHTML(p));
    }
    for (const b of byKey('data-dcg-chip', p.key)) b.outerHTML = chipHTML(p);
  }
  function toggle(key) {
    openKey = openKey === key ? null : key;
    const p = root.DevScope && root.DevScope.current && root.DevScope.current();
    for (const x of byKey('data-dcg-box', key)) { x.hidden = openKey !== key; x.innerHTML = openKey === key ? boxInner(G.by && G.by.get(key)) : ''; }
    if (p && p.key === key) for (const b of byKey('data-dcg-chip', key)) b.outerHTML = chipHTML(p);
  }
  // (development keys hold '|' themselves: "Mississauga|30 BRISTOL RD E"; the index is after the last one)
  const evOf = v => { const s = String(v), at = s.lastIndexOf('|'), key = s.slice(0, at), i = s.slice(at + 1); const row = G.by && G.by.get(key); return row && row.evidence ? row.evidence[+i] : null; };
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', e => {
      const t = e.target.closest ? e.target : null; if (!t) return;
      const c = t.closest('[data-dcg-chip]'); if (c) { e.preventDefault(); toggle(c.getAttribute('data-dcg-chip')); return; }
      if (t.closest('[data-dcg-close]')) { const b = t.closest('[data-dcg-box]'); if (b) toggle(b.getAttribute('data-dcg-box')); return; }
      // Growth in an area › Site servicing permits: a bucket opens the map filtered to it.
      const fb = t.closest('[data-dcg-filter]');
      if (fb) {
        const A = root.PeelApp, W = root.PeelWorkspaces; e.preventDefault(); e.stopPropagation();
        if (A && A.state) { A.state.dcgate = fb.getAttribute('data-dcg-filter'); const sel = document.getElementById('f-dcgate'); if (sel) sel.value = A.state.dcgate; }
        if (W && W.setMode) W.setMode('full');
        if (A && A.applyFilters) A.applyFilters();
        return;
      }
      const pb = t.closest('[data-dcg-pin]'); if (pb) { const ev = evOf(pb.getAttribute('data-dcg-pin')); if (ev) pin(ev); return; }
      const rb = t.closest('[data-dcg-rec]');
      if (rb) {
        const ev = evOf(rb.getAttribute('data-dcg-rec')), host = rb.closest('.dcg-ev'), box = host && host.querySelector('.dcg-rec');
        if (ev && box) { if (!box.hidden && box.dataset.done) { box.hidden = true; return; } box.dataset.done = '1'; showRecord(box, ev); }
      }
    });
    const go = () => load();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else setTimeout(go, 0);
  }

  const api = { TERM, termOf, BUCKETS, FILTER, FILTER_KEYS, filterLabel, chipText, tone, passes, recordQuery, SOURCES, load, loaded, rowOf, chipHTML, boxHTML, boxInner };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDcGate = api;
})(typeof window !== 'undefined' ? window : globalThis);
