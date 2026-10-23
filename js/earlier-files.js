/* Earlier files and what was filed on top (PeelEarlierFiles). A site is often built on an
 * application filed before the data starts (records since 2016) or before pre-consultation was
 * required: a Brampton site plan revision (SP13-080.002) names its original (SP13-080.000), a
 * concession-lot file (C04W14.009) is the ninth on its lot, a description names the plan the land
 * was created by (43M-1940), and a legacy "Transferred" file (no dates) stands in for the original.
 * Later site plans are then filed on that land, often on part of it or past its edge.
 *
 *   implied(p, known, sinceYear)  → the earlier files the site's own files point to and the data
 *                                   doesn't hold: { ref, kind, from, year, before, why, like? }
 *   baseOf(p)                     → the site's widest planning file (the original land)
 *   layered(p, projects)          → every planning file whose land is mostly inside the base's,
 *                                   on this site or another, in filing order, with its share inside
 *   discrepancies(p, base, rows, missing) → the differences in words
 *   lookup(p, items)              → (browser) the earlier files, live, with no date filter
 *
 * Pure apart from lookup() and the click handlers: runs in Node (tests/earlier-files.test.js).
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = () => (isNode ? require('./phases.js') : root.PeelPhases);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Math.round(v || 0).toLocaleString('en-CA');
  const pad3 = n => String(n).padStart(3, '0');
  const yearOf2 = yy => (Number(yy) >= 50 ? 1900 : 2000) + Number(yy);
  const canon = ref => (P() && P().canonRef ? P().canonRef(ref) : String(ref || '').toUpperCase());
  const firstAt = r => { let t = Infinity; for (const e of r.events || []) { const v = +new Date(e.date); if (v < t) t = v; } return isFinite(t) ? t : null; };
  const isLegacy = r => r.kind === 'application' && /^transferred$/i.test(String(r.statusRaw || '').trim());

  // File numbers a description can name (Brampton's and the region's common forms) and the
  // registered plan of subdivision the land was created by.
  const REF_IN_TEXT = /\b(SP\d{2}-\d{3}\.\d{3}|SPA-\d{4}-\d{4}|OZS-\d{4}-\d{4}|PRE-\d{4}-\d{4}|DPC-\d{4}-\d{4}|[CT]\d{2}[EW]\d{2}\.\d{3}|21T-\d{5}[A-Z]?|43M-\d{3,4})\b/gi;
  // The year in a file number, where it has one.
  function yearOfRef(ref) {
    const s = String(ref || '').toUpperCase();
    let m = s.match(/^SP(\d{2})-/); if (m) return yearOf2(m[1]);
    m = s.match(/^(?:SPA|OZS|PRE|DPC|DPS)-(\d{4})-/); if (m) return Number(m[1]);
    m = s.match(/^PRE(\d{2})\./); if (m) return yearOf2(m[1]);
    m = s.match(/^21T-(\d{2})/); if (m) return yearOf2(m[1]);
    return null;
  }

  /** The earlier files a site's own files point to that the data doesn't hold.
   *  known: a Set of canonical file numbers in the whole data (a file on another site is not missing). */
  function implied(p, known, sinceYear) {
    const out = [], seen = new Set(), have = k => known && known.has(canon(k));
    const add = x => { if (seen.has(x.ref)) return; seen.add(x.ref); x.before = x.year != null && sinceYear ? x.year < sinceYear : null; out.push(x); };
    const apps = ((p && p.records) || []).filter(r => r.kind === 'application' && r.ref);
    for (const r of apps) {
      const ref = String(r.ref).trim().toUpperCase();
      // A Brampton site plan revision: SP13-080.002 is revision 2 of SP13-080.000.
      let m = ref.match(/^(SP(\d{2})-\d{3})\.(\d{3})$/);
      if (m && Number(m[3]) > 0) {
        const base = `${m[1]}.000`;
        if (!have(base)) add({ ref: base, kind: 'revision', from: r.ref, year: yearOf2(m[2]), like: `${m[1]}.%`,
          why: `${r.ref} is revision ${Number(m[3])} of ${base}, the original site plan` });
      }
      // A Brampton concession-lot file: C04W14.009 is the ninth file on Concession 4 W, Lot 14.
      m = ref.match(/^(([CT])(\d{2})([EW])(\d{2}))\.(\d{3})$/);
      if (m && Number(m[6]) > 1) {
        const n = Number(m[6]), gone = [];
        for (let i = 1; i < n; i++) if (!have(`${m[1]}.${pad3(i)}`)) gone.push(i);
        if (gone.length) add({ ref: gone.length === 1 ? `${m[1]}.${pad3(gone[0])}` : `${m[1]}.${pad3(gone[0])}–.${pad3(gone[gone.length - 1])}`, kind: 'lot', from: r.ref, year: null, like: `${m[1]}.%`, count: gone.length,
          why: `${r.ref} is file ${n} on Concession ${Number(m[3])} ${m[4] === 'W' ? 'West' : 'East'}, Lot ${Number(m[5])}; ${gone.length === n - 1 ? 'none' : `${gone.length}`} of the ${n - 1} earlier file${n - 1 === 1 ? '' : 's'} on that lot ${gone.length === n - 1 ? 'is' : 'are not'} in the data` });
      }
      // A file or registered plan named in the description.
      const own = new Set(apps.map(x => canon(x.ref)));
      for (const t of String(r.description || '').match(REF_IN_TEXT) || []) {
        const x = t.toUpperCase();
        if (own.has(canon(x)) || canon(x) === canon(ref)) continue;
        if (/^43M-/.test(x)) { add({ ref: x, kind: 'plan', from: r.ref, year: null, why: `${r.ref}'s description names registered plan of subdivision ${x}, the plan this land was created by (not a file in the open data)` }); continue; }
        if (!have(x)) add({ ref: x, kind: 'named', from: r.ref, year: yearOfRef(x), why: `${r.ref}'s description names ${x}` });
      }
    }
    // A legacy file carried over from the old system, with no dates, standing in for the original.
    for (const r of apps) if (isLegacy(r) && !firstAt(r)) add({ ref: r.ref, kind: 'legacy', from: r.ref, year: yearOfRef(r.ref), held: true,
      why: `${r.ref} was carried over from Brampton's old system ("Transferred") with no dates; the application it stands for isn't published` });
    return out;
  }

  // ---- Land -------------------------------------------------------------------------------------
  const boxes = new WeakMap();
  const boxOf = rings => { let b = boxes.get(rings); if (!b) { b = [Infinity, Infinity, -Infinity, -Infinity]; for (const g of rings) for (const [x, y] of g) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } boxes.set(rings, b); } return b; };
  const meet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  const area = rings => (P().ringsArea ? P().ringsArea(rings) : 0);
  const share = (a, b) => (meet(boxOf(a), boxOf(b)) ? P().landShare(a, b) : 0);

  /** The site's widest planning file: the original land later files are filed on. */
  function baseOf(p) {
    let best = null, ba = 0;
    for (const r of (p && p.records) || []) if (r.kind === 'application' && r.poly) { const a = area(r.poly); if (a > ba) { best = r; ba = a; } }
    return best;
  }

  const INSIDE = 0.5;   // a file is on the base's land when at least half its own land is inside
  /** Every planning file with at least half its land inside the base's, on this site or another,
   *  in filing order (undated last): { r, dev, inside, own, at }. */
  function layered(p, projects, base = baseOf(p)) {
    if (!base) return [];
    const bb = boxOf(base.poly), out = [], seen = new Set([base]);
    const consider = (r, dev) => {
      if (seen.has(r) || r.kind !== 'application' || !r.poly || r.municipality !== base.municipality || !meet(boxOf(r.poly), bb)) return;
      seen.add(r);
      const inside = share(r.poly, base.poly);
      if (inside >= INSIDE) out.push({ r, dev, own: dev === p, inside, at: firstAt(r) });
    };
    for (const r of p.records) consider(r, p);
    for (const q of projects || []) if (q !== p) for (const r of q.records || []) consider(r, q);
    return out.sort((a, b) => (a.at == null) - (b.at == null) || (a.at || 0) - (b.at || 0) || String(a.r.ref).localeCompare(String(b.r.ref)));
  }

  /** The differences between the original application and what was filed on its land, in words:
   *  [{ kind: 'warn' | 'info', text }]. */
  function discrepancies(p, base, rows, missing = []) {
    const out = []; if (!base) return out;
    const dated = rows.filter(x => x.at != null), baseAt = firstAt(base);
    const yr = t => new Date(t).getUTCFullYear();
    if (isLegacy(base) && !baseAt) out.push({ kind: 'warn', text: `The site's land comes from ${base.ref}, a legacy file with no dates or proposal. Every date on the site comes from the ${num(dated.length)} later file${dated.length === 1 ? '' : 's'} filed on that land${dated.length ? ` (${yr(dated[0].at)}–${yr(dated[dated.length - 1].at)})` : ''}, not from the original application.` });
    const gone = missing.filter(m => m.kind !== 'legacy' && m.kind !== 'plan'), nGone = gone.reduce((t, m) => t + (m.count || 1), 0);
    if (gone.length) {
      // The earliest pre-consultation on the land: an original filed before it went straight to a formal application.
      const pre = dated.find(x => x.r.stage === 'precon');
      out.push({ kind: 'warn', text: `${num(nGone)} earlier file${nGone === 1 ? '' : 's'} the site's files point to ${nGone === 1 ? 'is' : 'are'} not in the data${gone.some(m => m.before) ? ' (filed before the data starts)' : ''}: ${gone.map(m => m.ref).join(', ')}. ${pre ? `The first pre-consultation on this land is ${pre.r.ref} (${yr(pre.at)}); the original proposal predates it` : 'No pre-consultation on this land is in the data'}, likely from before pre-consultation was required, so the later files are the only record of what changed.` });
    }
    // Later files that reach past the original land.
    const past = rows.filter(x => x.inside < 0.9);
    if (past.length) out.push({ kind: 'warn', text: `${num(past.length)} later file${past.length === 1 ? ' reaches' : 's reach'} past ${base.ref}'s land: ${past.slice(0, 6).map(x => `${x.r.ref || 'no number'} (${Math.round((1 - x.inside) * 100)}% outside)`).join('; ')}${past.length > 6 ? `; +${past.length - 6} more` : ''}.` });
    // The homes: the original's stated count against what the later developments on its land count.
    const devs = new Map();
    for (const x of rows) if (x.dev && !devs.has(x.dev)) devs.set(x.dev, x.dev.units || 0);
    const later = [...devs.values()].reduce((t, u) => t + u, 0), others = [...devs.keys()].filter(d => d !== p).length;
    if (later > 0 || base.units > 0) out.push({ kind: base.units > 0 && later !== base.units ? 'warn' : 'info', text: `${base.ref} ${base.units > 0 ? `states ${num(base.units)} homes` : 'states no homes'}; the ${num(devs.size)} development${devs.size === 1 ? '' : 's'} on its land${others ? ` (${others} shown as separate sites)` : ''} count ${num(later)}.` });
    // A site plan filed on the land after the original was approved: a revision on top of it.
    const sp = rows.filter(x => x.r.stage === 'siteplan' && !x.r.minor && x.at != null && (baseAt == null || x.at > baseAt));
    if (sp.length > 1) out.push({ kind: 'info', text: `${num(sp.length)} site plans were filed on this land after the original (${sp.map(x => x.r.ref).slice(0, 8).join(', ')}${sp.length > 8 ? ', …' : ''}).` });
    return out;
  }

  // ---- Browser ----------------------------------------------------------------------------------
  const App = () => root.PeelApp;
  const allProjects = () => { const st = App() && App().state, ps = st && st.projects; return (ps && ps.all) || ps || []; };
  let knownSet = null, knownOf = null;
  function known() {
    const ps = allProjects(); if (knownOf === ps && knownSet) return knownSet;
    knownSet = new Set(); knownOf = ps;
    for (const q of ps) for (const r of q.records || []) if (r.kind === 'application' && r.ref) knownSet.add(canon(r.ref));
    return knownSet;
  }
  const found = new Map();   // dev key → { status, recs, error }

  /** The earlier files, live from the municipality's open data with no "records since" filter. */
  async function lookup(p, items) {
    const A = root.PeelArcGIS, CFG = root.PEEL_CONFIG || {};
    const want = items.filter(m => m.kind === 'revision' || m.kind === 'lot' || m.kind === 'named');
    const exact = [...new Set(want.filter(m => m.kind !== 'lot').map(m => m.ref.toUpperCase()))];
    const likes = [...new Set(want.map(m => m.like).filter(Boolean))];
    if (!exact.length && !likes.length) return [];
    const q = s => `'${String(s).replace(/'/g, "''")}'`;
    const out = [], seen = new Set();
    let asked = 0, answered = 0, lastErr = null;
    for (const src of (CFG.services || []).filter(s => s.enabled !== false && s.kind === 'application' && s.municipality === p.municipality)) {
      let layers = [];
      try { layers = await A.resolveLayers(src.url); } catch (e) { asked++; lastErr = e; continue; }
      for (const layer of layers) {
        let info, res;
        try { info = await A.layerInfo(layer.url); } catch (e) { asked++; lastErr = e; continue; }
        if (!info.geometryType) continue;
        const fmap = P().detectFields(info.fields || []); if (!fmap.id) continue;
        const f = fmap.id, where = [...(exact.length ? [`UPPER(${f}) IN (${exact.map(q).join(',')})`] : []), ...likes.map(l => `UPPER(${f}) LIKE ${q(l)}`)].join(' OR ');
        asked++;
        try { res = await A.queryAll(layer.url, info, { where, max: 200, pageSize: 200 }); answered++; } catch (e) { lastErr = e; continue; }
        const lsrc = { ...src, id: `${src.id}/${layer.url.split('/').pop()}` };
        for (const ft of res.features) {
          const r = P().normalizeRecord(ft, fmap, lsrc);
          const k = `${canon(r.ref)}|${r.sourceId}`; if (seen.has(k)) continue; seen.add(k);
          out.push(r);
        }
      }
    }
    // (no layer answered: say so, rather than "none found")
    if (asked && !answered) throw lastErr || new Error('no layer answered');
    return out.sort((a, b) => (firstAt(a) == null) - (firstAt(b) == null) || (firstAt(a) || 0) - (firstAt(b) || 0));
  }

  const dayOf = t => (t == null ? 'no date' : new Date(t).toISOString().slice(0, 10));
  const dotOf = ph => (root.PeelUtil && root.PeelUtil.dot ? root.PeelUtil.dot(ph) : '');
  function rowHTML(x, base, tag) {
    const r = x.r || x, inside = x.inside != null ? x.inside : base && r.poly ? share(r.poly, base.poly) : null;
    const covers = base && r.poly && base !== r ? share(base.poly, r.poly) : null;
    return `<tr><td>${dotOf(r.phase)}<strong>${esc(r.ref || 'no number')}</strong>${tag ? ` <span class="ef-tag">${tag}</span>` : ''}<div class="muted">${esc(r.type || '')}${r.statusRaw ? ` · <em>${esc(r.statusRaw)}</em>` : ''}</div></td>
      <td>${esc(dayOf(firstAt(r)))}</td><td class="num">${r.units > 0 ? num(r.units) : '–'}</td>
      <td class="num">${inside != null ? `${Math.round(inside * 100)}%` : '–'}${covers != null && covers > 0 ? `<div class="muted">covers ${Math.round(covers * 100)}%</div>` : ''}</td>
      <td>${x.dev && !x.own ? `<button type="button" class="btn small link" data-ef-open="${esc(x.dev.key)}">${esc(x.dev.title || x.dev.key)}</button>` : x.own ? '<span class="muted">this site</span>' : ''}</td></tr>`;
  }
  /** The section: the original land, the earlier files missing from the data, what was filed on
   *  top and the differences. */
  function html(p) {
    if (!p || p.parent) return '';
    if (mapKey && mapKey !== p.key) { mapLayer.clearLayers(); mapKey = null; }   // (another site's layers come off the map)
    const base = baseOf(p); if (!base) return '';
    const st = App() && App().state, since = (st && Number(st.sinceYear)) || (root.PEEL_CONFIG && root.PEEL_CONFIG.sinceYear) || null;
    const missing = implied(p, known(), since);
    const rows = layered(p, allProjects(), base);
    const later = rows.filter(x => x.r !== base);
    if (!missing.length && !later.some(x => !x.own)) return '';
    const diffs = discrepancies(p, base, later, missing);
    const live = found.get(p.key);
    const canLook = missing.some(m => m.kind === 'revision' || m.kind === 'lot' || m.kind === 'named');
    const liveHTML = !live ? '' : live.status === 'loading' ? '<p class="small muted">Looking up the earlier files in the municipal open data…</p>'
      : live.error ? `<p class="small">Couldn't reach the municipal open data: ${esc(live.error)}</p>`
      : live.recs.length ? `<p class="small"><strong>Found live (${num(live.recs.length)})</strong>: the earlier files, with no date filter. Inside = share of the file's land inside ${esc(base.ref)}'s; covers = share of ${esc(base.ref)}'s land it covers.</p>
        <table class="rec-t ef-t small"><thead><tr><th>File</th><th>Filed</th><th class="num">Homes</th><th class="num">Inside</th><th></th></tr></thead><tbody>${live.recs.map(r => rowHTML({ r, inside: r.poly ? share(r.poly, base.poly) : null }, base, 'earlier')).join('')}</tbody></table>
        ${live.recs.map(r => r.description ? `<p class="small"><strong>${esc(r.ref)}</strong>: ${esc(r.description)}</p>` : '').join('')}`
      : '<p class="small muted">None of those file numbers is in the municipal open data: the originals were not carried into the current system.</p>';
    return `<details class="sect ef" id="devtab-earlier" open><summary><h2 class="section-title">Original application and later files on its land</h2><span class="muted small sect-sum">${num(missing.length)} earlier file${missing.length === 1 ? '' : 's'} referenced · ${num(later.length)} filed on the land</span></summary>
      <p class="small">The land of <strong>${esc(base.ref)}</strong>${base.type ? ` (${esc(base.type)})` : ''}, ${esc(dayOf(firstAt(base)) === 'no date' ? 'no date in the city record' : `filed ${dayOf(firstAt(base))}`)}, and every planning file with at least half its land inside it.${since ? ` The app loads files from ${since} on; older ones are only seen through the files that name them.` : ''}</p>
      ${diffs.length ? `<ul class="why-list small">${diffs.map(d => `<li class="why-${d.kind === 'warn' ? 'warn' : 'info'}"><span>${esc(d.text)}</span></li>`).join('')}</ul>` : ''}
      ${missing.length ? `<p class="small"><strong>Earlier files referenced</strong></p><ul class="small ef-miss">${missing.map(m => `<li><strong>${esc(m.ref)}</strong>${m.year ? ` (${m.year})` : ''}: ${esc(m.why)}${m.before ? ' · <span class="muted">before the data starts</span>' : ''}</li>`).join('')}</ul>` : ''}
      <div class="pt-actions small">${canLook ? `<button type="button" class="btn small" data-ef-lookup="${esc(p.key)}"${live && live.status === 'loading' ? ' disabled' : ''}>Look up the earlier files</button>` : ''}<button type="button" class="btn small" data-ef-map="${esc(p.key)}" title="The original land dashed, later files outlined (red: reaches past it), earlier files found live dotted. Press again to hide">Show the layers on the map</button></div>
      <div class="ef-live">${liveHTML}</div>
      <p class="small"><strong>Filed on ${esc(base.ref)}'s land</strong>, oldest first</p>
      <table class="rec-t ef-t small"><thead><tr><th>File</th><th>Filed</th><th class="num">Homes</th><th class="num">Inside</th><th>Site</th></tr></thead><tbody>${rowHTML({ r: base, own: true, inside: 1 }, null, 'original land')}${later.map(x => rowHTML(x, base)).join('')}</tbody></table>
      <p class="small muted">Inside: share of the file's land inside ${esc(base.ref)}'s (under 90% reaches past it). A file shown under another site is counted there, not here.</p>
    </details>`;
  }

  // The map: the original land dashed, the later files outlined and labelled, the earlier files
  // found live dotted.
  let mapLayer = null, mapKey = null;
  function showOnMap(p) {
    const L = root.L, MC = root.PeelMapCore, map = MC && MC.map; if (!L || !map) return;
    if (!mapLayer) mapLayer = L.layerGroup().addTo(map);
    mapLayer.clearLayers();
    if (mapKey === p.key) { mapKey = null; return; }   // (a second press clears it)
    mapKey = p.key;
    const base = baseOf(p); if (!base) return;
    const ll = rings => rings.map(r => r.map(([x, y]) => [y, x]));
    const tok = n => { const U = root.PeelUtil; return U && U.token ? U.token(n) : undefined; };
    const add = (r, style, label) => { const g = L.polygon(ll(r.poly), { interactive: true, ...style }).addTo(mapLayer); g.bindTooltip(label, { sticky: true }); return g; };
    const b = add(base, { color: tok('--cap-tight'), weight: 3, dashArray: '8 6', fillOpacity: 0.04 }, `${base.ref} · original land`);
    for (const x of layered(p, allProjects(), base)) if (x.r !== base) add(x.r, { color: x.inside < 0.9 ? tok('--ph-cancelled') : tok('--select'), weight: 2, fillOpacity: 0.08 }, `${x.r.ref || 'no number'} · ${dayOf(x.at)} · ${Math.round(x.inside * 100)}% inside`);
    const live = found.get(p.key);
    for (const r of (live && live.recs) || []) if (r.poly) add(r, { color: tok('--cap-room'), weight: 2, dashArray: '2 5', fillOpacity: 0.05 }, `${r.ref} · earlier file · ${dayOf(firstAt(r))}`);
    map.fitBounds(b.getBounds(), { maxZoom: 18 });
  }

  function rerender() {
    const DT = root.PeelDevTab, DN = root.PeelDevNav, p = DN && DN.getCurrentProject && DN.getCurrentProject();
    const host = typeof document !== 'undefined' && document.getElementById('devtab-earlier');
    if (!p || !host) return;
    const tmp = document.createElement('div'); tmp.innerHTML = html(p);
    if (tmp.firstElementChild) host.replaceWith(tmp.firstElementChild);
    else if (DT && DT.render) DT.render();
  }
  const projectByKey = k => allProjects().find(q => q.key === k) || null;
  if (!isNode && typeof document !== 'undefined') document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-ef-lookup],[data-ef-map],[data-ef-open]'); if (!t) return;
    const k = t.dataset.efLookup || t.dataset.efMap || t.dataset.efOpen, p = projectByKey(k); if (!p) return;
    if (t.dataset.efOpen) { const DN = root.PeelDevNav; if (DN && DN.showDetail) DN.showDetail(p); return; }
    if (t.dataset.efMap) { showOnMap(p); return; }
    const st = App() && App().state, since = (st && Number(st.sinceYear)) || null;
    found.set(p.key, { status: 'loading', recs: [] }); rerender();
    lookup(p, implied(p, known(), since))
      .then(recs => { found.set(p.key, { status: 'done', recs }); })
      .catch(err => { found.set(p.key, { status: 'done', recs: [], error: err && err.message || String(err) }); })
      .then(() => { rerender(); if (mapKey === p.key) { mapKey = null; showOnMap(p); } });
  });

  const api = { implied, baseOf, layered, discrepancies, lookup, html, yearOfRef, showOnMap };
  if (isNode) module.exports = api;
  else root.PeelEarlierFiles = api;
})(typeof window !== 'undefined' ? window : globalThis);
