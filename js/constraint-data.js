/* Constraint data (PeelCxData): the built constraint layers (data/constraints/, scripts/
 * build-constraints.js) loaded on demand, the Development › Site constraint checklist, and the
 * area card "Land under constraints".
 *
 * Screening context only: every line says what a mapped layer shows at the development's point,
 * never a determination; the owner (conservation authority, province) confirms.
 */
(function (root) {
  'use strict';
  const G = typeof module !== 'undefined' && module.exports ? require('./constraint-geo.js') : root.PeelConstraintGeo;
  const BASE = 'data/constraints/';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- Checklist rules ------------------------------------------------------------------------
  // The conservation authority areas without published mapping, by the initials Peel's watercourse
  // layer uses.
  const NOT_PUBLISHED = { NVCA: 'the Nottawasaga Valley Conservation Authority area (north Caledon)', HRCA: 'the Conservation Halton area', CH: 'the Conservation Halton area' };
  const CA_SHORT = { 'reg-cvc': 'CVC', 'reg-trca': 'TRCA', 'flood-cvc': 'CVC', 'flood-trca': 'TRCA' };
  const CA_FULL = { CVC: 'Credit Valley Conservation', TRCA: 'Toronto and Region Conservation Authority' };
  const R_NEAR = 120, R_WATER_CLOSE = 30, R_CA = 3000;
  const fmtM = m => `${Math.max(1, Math.round(m))} m`;
  const STATUS_TEXT = { flag: 'Flagged', near: 'Nearby', clear: 'Clear', np: 'Not published', na: 'Not checked' };

  // pt: [lng, lat]. near: { datasetId: { ok, feats: [{ label: [name, type, extra], polys: [rings…] | null, lines: [line…] | null }] } }
  // for the tiles around the point. Returns one line per check, never empty:
  // [{ key, status: flag | near | clear | np | na, text, layer, sources: [datasetId] }].
  function evaluateSite(pt, near) {
    const has = id => near[id] && near[id].ok;
    const feats = id => (has(id) ? near[id].feats : []);
    const inside = id => feats(id).filter(f => f.polys && f.polys.some(r => G.pointInRings(pt, r)));
    const dist = f => Math.min(...(f.polys || []).map(r => G.distToRings(pt, r)), ...(f.lines || []).map(l => G.distToLine(pt, l)));
    // The conservation authority from the nearest Peel watercourse (within 3 km), for "not published".
    const caNear = (() => {
      let best = null;
      for (const f of feats('wc-peel')) { const d = dist(f); if (d <= R_CA && f.label[2] && (!best || d < best.d)) best = { d, ca: String(f.label[2]).toUpperCase() }; }
      return best && best.ca;
    })();
    const out = [];
    const missing = ids => ids.filter(id => !has(id));
    const notChecked = (key, layer, ids, what) => ({ key, status: 'na', text: `${what}: not checked (${missing(ids).join(', ')} did not load)`, layer, sources: ids });
    // 1. Regulation limit.
    {
      const ids = ['reg-cvc', 'reg-trca'], hit = ids.filter(id => inside(id).length);
      if (hit.length) out.push({ key: 'reg', status: 'flag', text: `Inside a mapped regulation limit (${hit.map(id => CA_SHORT[id]).join(', ')}) (screening; confirm with ${hit.map(id => CA_FULL[CA_SHORT[id]]).join(' / ')})`, layer: 'reg', sources: hit });
      else if (caNear && NOT_PUBLISHED[caNear]) out.push({ key: 'reg', status: 'np', text: `Regulation limit: not published for ${NOT_PUBLISHED[caNear]}`, layer: 'reg', sources: [] });
      else if (missing(ids).length) out.push(notChecked('reg', 'reg', ids, 'Regulation limit'));
      else out.push({ key: 'reg', status: 'clear', text: 'Outside the mapped regulation limits (CVC, TRCA) (screening; a feature need not be mapped to be regulated)', layer: 'reg', sources: ids });
    }
    // 2. Floodplain.
    {
      const ids = ['flood-cvc', 'flood-trca'], hit = ids.filter(id => inside(id).length);
      if (hit.length) {
        const names = [...new Set(hit.flatMap(id => inside(id).map(f => f.label[0])).filter(n => n && !/^(regulatory )?floodplain/i.test(n)))];
        out.push({ key: 'flood', status: 'flag', text: `Inside a mapped floodplain (${hit.map(id => id === 'flood-trca' ? 'TRCA, generalized' : 'CVC regulatory floodlines').join('; ')})${names.length ? `: ${names.join(', ')}` : ''} (screening; confirm with the conservation authority)`, layer: 'flood', sources: hit });
      } else if (caNear && NOT_PUBLISHED[caNear]) out.push({ key: 'flood', status: 'np', text: `Floodplain: not published for ${NOT_PUBLISHED[caNear]}`, layer: 'flood', sources: [] });
      else if (missing(ids).length) out.push(notChecked('flood', 'flood', ids, 'Floodplain'));
      else out.push({ key: 'flood', status: 'clear', text: 'Outside the mapped floodplain (CVC regulatory, TRCA generalized)', layer: 'flood', sources: ids });
    }
    // 3. Provincial plan areas.
    {
      const ids = ['greenbelt', 'orm', 'nep'], hits = ids.flatMap(id => inside(id).map(f => ({ id, name: f.label[0] })));
      const uniq = [...new Map(hits.map(h => [h.name, h])).values()];
      if (uniq.length) out.push({ key: 'plan', status: 'flag', text: `Inside a provincial plan area: ${uniq.map(h => h.name).join('; ')} (screening; the plan's policies and the municipality's official plan apply)`, layer: uniq[0].id, sources: [...new Set(uniq.map(h => h.id))] });
      else if (missing(ids).length) out.push(notChecked('plan', 'greenbelt', ids, 'Greenbelt / Oak Ridges Moraine / Niagara Escarpment'));
      else out.push({ key: 'plan', status: 'clear', text: 'Outside the Greenbelt, Oak Ridges Moraine and Niagara Escarpment plan areas', layer: 'greenbelt', sources: ids });
    }
    // 4. PSW / ANSI on or within 120 m.
    {
      const ids = ['psw', 'ansi'], hits = ids.flatMap(id => feats(id).map(f => ({ id, f, d: dist(f) }))).filter(h => h.d <= R_NEAR).sort((a, b) => a.d - b.d);
      if (hits.length) {
        const top = [...new Map(hits.map(h => [`${h.id}|${h.f.label[0]}`, h])).values()].slice(0, 3);
        out.push({ key: 'natural', status: 'flag', text: `${top.map(h => `${h.id === 'psw' ? 'Provincially significant wetland' : `ANSI${h.f.label[0] && h.f.label[0] !== 'ANSI' ? ` (${h.f.label[0]})` : ''}`} ${h.d === 0 ? 'on the site' : `within ${fmtM(h.d)}`}`).join('; ')} (screening; an environmental study may be needed)`, layer: 'natural', sources: [...new Set(top.map(h => h.id))] });
      } else if (missing(ids).length) out.push(notChecked('natural', 'natural', ids, 'PSW / ANSI'));
      else out.push({ key: 'natural', status: 'clear', text: `No provincially significant wetland or ANSI mapped on or within ${R_NEAR} m`, layer: 'natural', sources: ids });
    }
    // 5. Source protection: not in this app (decision 2).
    out.push({ key: 'source', status: 'np', text: 'Wellhead protection area / intake protection zone / HVA / SGRA: not included in this app; check the CTC Source Protection Region maps', layer: null, sources: [] });
    // 6. Watercourse within 30 m / 120 m.
    {
      const ids = ['wc-peel', 'wc-ohn'], all = ids.flatMap(id => feats(id).map(f => ({ id, f, d: dist(f) }))).filter(h => h.d <= R_NEAR).sort((a, b) => a.d - b.d);
      const w = all[0];
      if (w) {
        const name = all.map(h => h.f.label[0]).find(n => n && n !== 'Watercourse') || 'unnamed watercourse';
        out.push({ key: 'water', status: w.d <= R_WATER_CLOSE ? 'flag' : 'near', text: `Watercourse within ${w.d <= R_WATER_CLOSE ? R_WATER_CLOSE : R_NEAR} m: ${name}, about ${fmtM(w.d)} (screening; setbacks are set by the conservation authority)`, layer: 'water', sources: [...new Set(all.map(h => h.id))] });
      } else if (missing(ids).length === ids.length) out.push(notChecked('water', 'water', ids, 'Watercourses'));
      else out.push({ key: 'water', status: 'clear', text: `No watercourse mapped within ${R_NEAR} m`, layer: 'water', sources: ids.filter(has) });
    }
    return out;
  }

  // ---- Area card ----------------------------------------------------------------------------------
  const AREA_ROWS = [['reg', 'Regulation limits', 'CVC and TRCA regulation limits', 'reg'], ['flood', 'Floodplain', 'CVC regulatory floodlines and TRCA generalized floodplain', 'flood'], ['plan', 'Provincial plan areas', 'Greenbelt, Oak Ridges Moraine and Niagara Escarpment plans', 'greenbelt']];
  // stats: areaStats(); devs: [{ key, lng, lat }] in the scope; grid for the point lookup.
  function areaRows(stats, devs, grid) {
    const inside = Object.fromEntries(AREA_ROWS.map(([k]) => [k, []]));
    for (const d of devs || []) { if (d.lng == null || d.lat == null) continue; const f = G.flagsAt(grid, d.lng, d.lat); if (!f) continue; for (const [k] of AREA_ROWS) if (f[k]) inside[k].push(d.key); }
    return AREA_ROWS.map(([k, label, from, layer]) => ({ k, label, from, layer, pct: stats.pct[k] || 0, ha: (stats.by[k] || 0) * grid.cellM2 / 1e4, devs: inside[k] }));
  }
  const fmtPct = v => v === 0 ? '0%' : v < 0.1 ? '<0.1%' : v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`;
  const fmtHa = v => v >= 1000 ? `${Math.round(v).toLocaleString('en-CA')} ha` : v >= 10 ? `${Math.round(v)} ha` : `${v.toFixed(1)} ha`;
  function areaCardHTML(scopeName, stats, rows, grid) {
    return `<div class="ov-h"><h3>Land under constraints</h3><span class="muted small">${esc(scopeName)} · ${fmtHa(stats.ha)}</span></div>
      <table class="dt ov-t cx-area"><thead><tr><th>Mapped layer</th><th class="n">Share of the area</th><th class="n">Developments inside</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(r.label)}<small class="muted">${esc(r.from)}</small></td><td class="n"><strong>${fmtPct(r.pct)}</strong><small class="muted">${fmtHa(r.ha)}</small></td><td class="n">${r.devs.length ? `<button type="button" class="btn small link" data-cx-devs="${esc(r.k)}">${r.devs.length.toLocaleString('en-CA')}</button>` : '0'}</td></tr>`).join('')}</tbody></table>
      <p class="small muted cx-basis">Basis: land mapped in each layer, overlaps counted once · ${grid.cellM} m grid · a development counts by its point · screening, not an official determination (the conservation authority or province confirms) · <button type="button" class="btn small link" data-cx-show="reg">Show the layers</button></p>`;
  }

  // ---- HTML for the checklist ---------------------------------------------------------------------
  const ICON = { flag: '▲', near: '△', clear: '✓', np: '–', na: '?' };
  function checklistHTML(lines, manifest) {
    const byId = new Map(((manifest && manifest.datasets) || []).map(d => [d.id, d]));
    const src = id => { const d = byId.get(id); return d ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" title="${esc(`${d.owner} · ${d.licence}${d.asOf ? ` · as of ${d.asOf}` : ''}`)}">${esc(d.title)}</a>` : ''; };
    return `<ul class="cx-check" aria-label="Site constraint checklist (screening)">${lines.map(l => `<li class="cx-l cx-${l.status}" data-cx-key="${esc(l.key)}"><span class="cx-i" aria-hidden="true">${ICON[l.status]}</span><span class="cx-t"><span class="sr-only">${STATUS_TEXT[l.status]}: </span>${esc(l.text)}<small class="cx-s">${l.layer ? `<button type="button" class="btn small link" data-cx-show="${esc(l.layer)}">Show layer</button>` : ''}${l.sources.map(src).filter(Boolean).join(' · ')}</small></span></li>`).join('')}</ul>
      <p class="small muted cx-basis">Basis: mapped layers at the development's point${manifest && manifest.built ? ` · built ${esc(manifest.built)}` : ''} · screening, not an official determination (the conservation authority or province confirms)</p>`;
  }
  // The feature card: name, type, owner, as-of, source, screening note (and the owner's disclaimer).
  function featureCardHTML(d, label) {
    return `<div class="cx-card"><h3>${esc(label[0])}</h3><p class="small">${esc(label[1] || d.title)}</p>
      <dl class="cx-dl small"><dt>Layer</dt><dd>${esc(d.title)}</dd><dt>Owner</dt><dd>${esc(d.owner)}</dd><dt>As of</dt><dd>${esc(d.asOf || 'not stated by the source')}</dd><dt>Licence</dt><dd>${d.licenceUrl ? `<a href="${esc(d.licenceUrl)}" target="_blank" rel="noopener">${esc(d.licence)}</a>` : esc(d.licence)}</dd><dt>Source</dt><dd><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url.replace(/^https?:\/\//, '').slice(0, 70))}…</a></dd></dl>
      <p class="small muted">${esc(d.note)}</p>${d.disclaimer ? `<p class="small muted cx-disc">${esc(d.disclaimer)}</p>` : ''}</div>`;
  }

  const pure = { evaluateSite, areaRows, areaCardHTML, checklistHTML, featureCardHTML, NOT_PUBLISHED, AREA_ROWS, R_NEAR, R_WATER_CLOSE };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // ---- Browser: loading ---------------------------------------------------------------------------
  const cache = new Map();
  const getJSON = url => { if (!cache.has(url)) { const pr = fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error(`${url}: ${r.status}`))); cache.set(url, pr); pr.catch(() => cache.delete(url)); } return cache.get(url); };
  const manifest = () => getJSON(`${BASE}manifest.json`);
  const index = id => getJSON(`${BASE}${id}/index.json`).then(ix => { if (!ix._have) ix._have = new Set(ix.tiles); return ix; });
  // One tile's features, decoded, with their labels: [{ label, polys, edges, lines }].
  async function tile(id, tx, ty) {
    const ix = await index(id), k = G.tileKey(tx, ty);
    if (!ix._have.has(k)) return [];
    const key = `${id}|${k}|dec`;
    if (!cache.has(key)) cache.set(key, getJSON(`${BASE}${id}/${k}.json`).then(t => {
      const d = G.decodeTile(t, tx, ty), byLi = new Map();
      const get = li => { if (!byLi.has(li)) byLi.set(li, { label: ix.labels[li] || ['', ''], polys: null, edges: null, lines: null, id, k }); return byLi.get(li); };
      // One entry per feature part: polygons keep their rings together (even-odd).
      const out = [];
      d.polys.forEach(p => out.push({ label: ix.labels[p.li] || ['', ''], polys: [p.parts], edges: null, lines: null, li: p.li, id, k }));
      d.edges.forEach(e => { const g = get(e.li); g.edges = (g.edges || []).concat(e.parts); });
      d.lines.forEach(l => out.push({ label: ix.labels[l.li] || ['', ''], polys: null, edges: null, lines: l.parts, li: l.li, id, k }));
      return { feats: out, edges: [...byLi.values()].filter(g => g.edges) };
    }));
    return cache.get(key);
  }
  async function featuresNear(id, lng, lat, r) {
    const ts = await Promise.all(G.tilesAround(lng, lat, r).map(([tx, ty]) => tile(id, tx, ty)));
    return ts.flatMap(t => (Array.isArray(t) ? t : t.feats));
  }
  const CHECK_IDS = ['reg-cvc', 'reg-trca', 'flood-cvc', 'flood-trca', 'greenbelt', 'orm', 'nep', 'psw', 'ansi', 'wc-peel', 'wc-ohn'];
  async function siteChecklist(p) {
    const near = {};
    await Promise.all(CHECK_IDS.map(async id => {
      try { near[id] = { ok: true, feats: await featuresNear(id, p.lng, p.lat, id === 'wc-peel' ? R_CA : R_NEAR + 10) }; } catch (e) { near[id] = { ok: false, feats: [] }; }
    }));
    return evaluateSite([p.lng, p.lat], near);
  }
  async function siteChecklistHTML(p) {
    const [lines, man] = await Promise.all([siteChecklist(p), manifest().catch(() => null)]);
    return checklistHTML(lines, man);
  }
  const grid = () => getJSON(`${BASE}grid.json`);
  // scope: { name, muni } or { name, polys: [rings…] }; devs: developments in the scope.
  async function areaCard(scope, devs) {
    const g = await grid();
    const sc = scope.muni ? { muni: g.munis.indexOf(scope.muni) + 1 } : scope.polys ? G.scanUnion(scope.polys, g) : (() => { const m = new Map(); for (let r = 0; r < g.rows; r++) m.set(r, [[0, g.cols]]); return m; })();
    const stats = G.areaStats(g, sc);
    const rows = areaRows(stats, devs.map(p => ({ key: p.key, lng: p.lng, lat: p.lat })), g);
    return { html: areaCardHTML(scope.name, stats, rows, g), rows, stats };
  }
  root.PeelCxData = { ...pure, BASE, manifest, index, tile, featuresNear, siteChecklist, siteChecklistHTML, grid, areaCard, CHECK_IDS };
})(typeof window !== 'undefined' ? window : globalThis);
