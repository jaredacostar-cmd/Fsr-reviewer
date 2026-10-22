/* Where the planned DC mains join the existing network — shown, and fixed by hand.
 * The sewer and water traces join each planned main's ends on their own (js/sewer-trace.js
 * dcSewerNet, js/water-trace.js wmGraph): onto another planned main or an existing sewer / watermain
 * of a matching size, within 60 m as drawn, further as a bridged gap. Both record each end's join;
 * this layer draws them over the Planned works, coloured by how sure the join is, and lets a
 * reviewer set one by hand: tap an end, then the main it joins (or mark it an open end).
 * Reviewed joins: data/dc-joins.json (committed) plus this browser's edits (store 'dcJoinEdits'),
 * matched to a main's end by position (within 5 m), so they survive a rebuild of the DC data and of
 * the existing network. Export writes the merged list, to commit as data/dc-joins.json.
 */
(function (root) {
  'use strict';

  const U = root.PeelUtil || {};
  const store = U.store || { get: (k, d) => d, set() {} };
  const esc = U.esc || (s => String(s ?? ''));
  const App = () => root.PeelApp;
  const DI = () => root.PeelDcInfra;
  const SC = () => root.PeelSewerCap;
  const MM = () => root.PeelMapMarkers;
  const ST = () => root.PeelSewerTrace;
  const WT = () => root.PeelWaterTrace;
  const map = () => root.PeelMapCore && root.PeelMapCore.map;

  const MATCH_M = 5;
  const dm = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos(a[1] * Math.PI / 180), (a[1] - b[1]) * 111320);
  const r6 = p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];

  // ---- Reviewed joins ----------------------------------------------------------------------
  // A join: { sys, end: [lng, lat], to: [lng, lat] | null, into: 'sewer' | 'watermain' | 'dc' | null,
  // note, at (date) }. to null = an open end (nothing joins there). A local edit with auto: true
  // drops a committed join (back to the automatic one).
  const J = { shipped: [], edits: store.get('dcJoinEdits', []), v: 1, loading: null };
  // Edits win over the committed list; each end once.
  function merge(shipped, edits) {
    const out = shipped.filter(s => !edits.some(e => e.sys === s.sys && dm(e.end, s.end) <= MATCH_M));
    for (const e of edits) if (!e.auto) out.push(e);
    return out;
  }
  let merged = merge(J.shipped, J.edits);
  function findIn(list, sys, pt) {
    let best = null, bd = MATCH_M;
    for (const j of list) { if (j.sys !== sys) continue; const m = dm(j.end, pt); if (m <= bd) { bd = m; best = j; } }
    return best;
  }
  // The reviewed join at a main's end, or null (automatic).
  const override = (sys, pt) => findIn(merged, sys, pt);
  const editAt = (sys, pt) => findIn(J.edits, sys, pt);
  function changed() {
    merged = merge(J.shipped, J.edits); J.v++;
    store.set('dcJoinEdits', J.edits);
    render();
  }
  function setEdit(sys, end, rec) {
    J.edits = J.edits.filter(e => !(e.sys === sys && dm(e.end, end) <= MATCH_M));
    J.edits.push({ sys, end: r6(end), ...rec, at: new Date().toISOString().slice(0, 10) });
    changed();
  }
  function load() {
    if (J.loading) return J.loading;
    J.loading = (typeof fetch === 'function' ? fetch('data/dc-joins.json').then(r => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null))
      .then(d => { if (d && Array.isArray(d.joins)) { J.shipped = d.joins; merged = merge(J.shipped, J.edits); J.v++; } return d; });
    return J.loading;
  }
  function exportJSON() {
    return { version: 1, note: 'Reviewed joins of the 2026 DC planned mains onto the existing network (js/dc-joins.js). end: the planned main\'s end; to: the point it joins (null: an open end); into: what it joins.', joins: merged.map(({ sys, end, to, into, note, at }) => ({ sys, end, to: to || null, into: into || null, ...(note ? { note } : {}), ...(at ? { at } : {}) })) };
  }

  // ---- How sure an automatic join is ---------------------------------------------------------
  // drawn: within 60 m (the maps draw it to the main); bridged: up to 200 m; far: beyond (worth a
  // look); open: nothing within reach (an upstream end, or a main the maps stop short).
  // Water is a looped network fed zone by zone: an end at a station, reservoir or tank joins
  // through it; one with nothing joined is worth a look (zone: the only main in reach is in another
  // pressure zone, which water doesn't cross without a facility).
  // An end the map cuts off (scripts/build-dc-infra.py 'x': at the edge of the map or its inset).
  const atEdge = j => !!(j.ln && j.ln.x && j.ln.g && j.ln.x.includes(j.pt[0] === j.ln.g[0][0] && j.pt[1] === j.ln.g[0][1] ? 0 : 1));
  function conf(j) {
    if (!j.auto) return 'reviewed';
    if (!j.into && atEdge(j)) return 'edge';
    if (j.sys === 'water') {
      if (j.fac) return 'facility';
      if (!j.into) return j.zoneBlocked ? 'zone' : 'unjoined';
    }
    if (!j.into) return 'open';
    return j.m <= 60 ? 'drawn' : j.m <= 200 ? 'bridged' : 'far';
  }
  const CONF = { drawn: 'joined as drawn', bridged: 'bridged gap', far: 'long bridged gap: check', open: 'open end', reviewed: 'reviewed',
    edge: 'the map cuts the main off here: it runs on past the edge of the map',
    facility: 'joins through the facility', zone: 'nearest main is in another pressure zone: check', unjoined: 'not connected: check (water mains loop)' };
  const zoneName = id => { const z = id && App() && App().state.servicing && App().state.servicing.zones.find(x => x.id === id); return z ? z.name : ''; };
  // What a join is, in a line.
  function joinText(j) {
    const c = conf(j), zn = j.sys === 'water' ? zoneName(j.zone) : '';
    const what = j.into ? `Joins ${intoText(j.into)}${j.m != null ? `, ${Math.round(j.m)} m` : ''}` : c === 'zone' ? `Nearest main ${Math.round(j.zoneBlocked.m)} m off is in ${zoneName(j.zoneBlocked.zone) || 'another zone'}: not joined` : c === 'facility' ? 'Not joined to a main' : c === 'edge' ? 'Not joined: the main runs off the edge of the DC map here'
      : j.sizeBlocked ? `Nearest main (${j.sizeBlocked.d ? `${j.sizeBlocked.d} mm, ` : ''}${Math.round(j.sizeBlocked.m)} m off) is under half its size: not joined` : 'Open end: no main within reach';
    return [what, j.fac ? `at ${j.fac}` : '', zn ? `in ${zn}` : '', j.along ? `also joins existing mains at ${j.along} point${j.along === 1 ? '' : 's'} along its length` : ''].filter(Boolean).join(' · ');
  }
  function intoText(into) {
    if (!into) return 'nothing';
    if (into.kind === 'sewer') return `the existing ${into.d} mm sewer`;
    if (into.kind === 'watermain') return `the existing ${into.d ? `${into.d} mm ` : ''}watermain`;
    return `the planned ${DI() ? DI().dcLineText(into.ln) : 'main'}`;
  }

  // ---- Map layer ---------------------------------------------------------------------------
  const S = { on: !!store.get('dcJoins', false), layer: null, pick: null, popup: null };
  const L_ = () => root.L;
  function joinsOf(sys) {
    if (sys === 'wastewater') { const g = ST() && ST().dcSewerNet(); return g ? g.joins : null; }
    const w = WT(); if (!w || !w.wmGraph) return null;
    try { return w.wmGraph().joins; } catch (e) { return null; }
  }
  function sysOn(sys) { const d = MM() && MM().getDcOn(); return !!d && d.on && (d.sys === 'both' || d.sys === sys); }
  async function ensureData() {
    await Promise.all([load(), SC() && SC().loadSewers(), WT() && WT().loadWatermains ? WT().loadWatermains() : null, WT() && WT().loadWaterFacilities ? WT().loadWaterFacilities() : null]);
  }
  function render() {
    const m = map(), L = L_(); if (!m || !L) return;
    if (!S.layer) { S.layer = L.layerGroup(); }
    S.layer.clearLayers();
    if (!S.on || !App() || !App().state.dcInfra) { m.removeLayer(S.layer); return; }
    S.layer.addTo(m);
    // Their own pane, over the developments' markers: while the layer is on, a tap on an end is for
    // its join, not for the area or development under it.
    if (!m.getPane('dcjPane')) m.createPane('dcjPane', m.getPane('rotatePane') || undefined).style.zIndex = root.PeelLayerGroups ? root.PeelLayerGroups.Z.flow - 5 : 635;
    const pane = 'dcjPane';
    for (const sys of ['wastewater', 'water']) {
      if (!sysOn(sys)) continue;
      const list = joinsOf(sys);
      if (!list) { if (!S.waiting) { S.waiting = true; ensureData().then(() => { if (joinsOf(sys)) render(); }); } continue; }
      for (const j of list) {
        const c = conf(j);
        if (j.to) L.polyline([[j.pt[1], j.pt[0]], [j.to[1], j.to[0]]], { className: `dcj-link dcj-${c}`, interactive: false, pane }).addTo(S.layer);
        L.circleMarker([j.pt[1], j.pt[0]], { radius: 5, className: `dcj-end dcj-${c}`, pane, bubblingMouseEvents: false })
          .bindTooltip(`<strong>${esc(DI().dcLineText(j.ln))}</strong><br>${esc(joinText(j))}<br><span class="muted">${esc(CONF[c])}${j.ov && j.ov.note ? ` · ${esc(j.ov.note)}` : ''} · tap to change</span>`, { className: 'pt', sticky: true })
          .on('click', ev => { L.DomEvent.stop(ev); openEnd(j); }).addTo(S.layer);
      }
    }
  }
  function setOn(v) {
    S.on = !!v; store.set('dcJoins', S.on);
    if (S.on && MM() && !MM().getDcOn().on && root.PeelMapAnalysis) root.PeelMapAnalysis.setDcOn({ on: true });
    if (S.on) ensureData().then(render); else { cancelPick(); render(); }
  }

  // The end's pop-up: what it joins, and the three choices.
  function openEnd(j) {
    const m = map(), L = L_(), c = conf(j), e = editAt(j.sys, j.pt);
    const html = `<div class="dcj-pop"><strong>${esc(DI().dcLineText(j.ln))}</strong>
      <p class="small">${esc(joinText(j))}. <span class="muted">${esc(CONF[c])}</span></p>
      <div class="dcj-acts"><button type="button" class="btn small" data-dcj="pick">Pick where it joins</button>
      <button type="button" class="btn small" data-dcj="open">Open end</button>
      ${!j.auto ? '<button type="button" class="btn small" data-dcj="auto">Automatic</button>' : ''}</div>
      ${e ? '<p class="small muted">Edited in this browser.</p>' : !j.auto ? '<p class="small muted">Reviewed (data/dc-joins.json).</p>' : ''}
      ${J.edits.length ? `<p class="small"><button type="button" class="btn small link" data-dcj="export">Export ${J.edits.length} edit${J.edits.length === 1 ? '' : 's'} (dc-joins.json)</button></p>` : ''}</div>`;
    S.popup = L.popup({ className: 'dcj-popup', maxWidth: 280 }).setLatLng([j.pt[1], j.pt[0]]).setContent(html).openOn(m);
    const el = S.popup.getElement(); if (!el) return;
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-dcj]'); if (!b) return;
      const act = b.dataset.dcj; m.closePopup(S.popup);
      if (act === 'pick') startPick(j);
      else if (act === 'open') setEdit(j.sys, j.pt, { to: null, into: null });
      else if (act === 'auto') setEdit(j.sys, j.pt, { auto: true });
      else if (act === 'export') download();
    });
  }
  function download() {
    const E = root.PeelExports, text = JSON.stringify(exportJSON(), null, 1);
    if (E && E.download) E.download('dc-joins.json', text, 'application/json');
  }

  // Pick mode: the next tap on the map sets the join, snapped to the nearest existing pipe or
  // planned main of the same system within 40 px (an existing main at the nearest point on it;
  // a planned main at a vertex, where the traces join it). Esc or a tap on nothing cancels.
  function snap(sys, own, lng, lat, r) {
    const cands = [];
    if (sys === 'wastewater' && SC() && MM().SEW.data) {
      const k = SC().nearestPipe(lng, lat, r);
      if (k >= 0) {
        const p = MM().SEW.data.pipes[k], cs = SC().pipeCoords(p);
        // The nearest point on the pipe.
        let best = null, bd = Infinity;
        for (let i = 1; i < cs.length; i++) { const q = nearestOnSeg([lng, lat], cs[i - 1], cs[i]), d = dm([lng, lat], q); if (d < bd) { bd = d; best = q; } }
        cands.push({ to: best, m: bd, into: 'sewer', label: `existing ${p[0]} mm sewer` });
      }
    }
    if (sys === 'water' && WT() && WT().wmGraph) {
      const G = WT().wmGraph(), t = G && G.tap([lng, lat], r);
      if (t) cands.push({ to: t.q, m: t.m, into: 'watermain', label: `existing ${t.dm ? `${t.dm} mm ` : ''}watermain` });
    }
    const n = DI().dcNearest(sys, [lng, lat], r, ln => ln !== own);
    if (n) {
      let best = n.ln.g[0], bd = Infinity;
      for (const g of n.ln.g) { const d = dm([lng, lat], g); if (d < bd) { bd = d; best = g; } }
      cands.push({ to: best, m: n.m, into: 'dc', label: `planned ${DI().dcLineText(n.ln)}` });
    }
    cands.sort((a, b) => a.m - b.m);
    return cands[0] || null;
  }
  function nearestOnSeg(p, a, b) {
    const kx = Math.cos(p[1] * Math.PI / 180), ax = (a[0] - p[0]) * kx, ay = a[1] - p[1], bx = (b[0] - p[0]) * kx, by = b[1] - p[1];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function startPick(j) {
    cancelPick();
    const m = map(); if (!m) return;
    const box = m.getContainer();
    const onClick = ev => {
      ev.stopPropagation(); ev.preventDefault();
      const ll = m.mouseEventToLatLng(ev), r = 40 * 40075016 * Math.cos(ll.lat * Math.PI / 180) / Math.pow(2, m.getZoom() + 8);
      const s = snap(j.sys, j.ln, ll.lng, ll.lat, Math.max(15, r));
      cancelPick();
      if (!s) { if (U.toast) U.toast('No pipe or planned main there: join not changed'); return; }
      setEdit(j.sys, j.pt, { to: r6(s.to), into: s.into });
      if (U.toast) U.toast(`Joined to the ${s.label}`);
    };
    const onKey = ev => { if (ev.key === 'Escape') cancelPick(); };
    box.addEventListener('click', onClick, true); document.addEventListener('keydown', onKey);
    box.classList.add('dcj-picking');
    S.pick = { off() { box.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey); box.classList.remove('dcj-picking'); } };
    if (U.toast) U.toast('Tap the pipe or planned main this end joins (Esc to cancel)', 5000);
  }
  function cancelPick() { if (S.pick) { S.pick.off(); S.pick = null; } }

  if (typeof document !== 'undefined') load();

  const api = {
    override, setEdit, load, exportJSON, merge, conf, atEdge, intoText, joinText, render, setOn, ensureData,
    isOn: () => S.on, edits: () => J.edits.slice(), version: () => J.v, download, MATCH_M,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDcJoins = api;
})(typeof window !== 'undefined' ? window : globalThis);
