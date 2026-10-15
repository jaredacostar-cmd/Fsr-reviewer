(function (root) {
'use strict';
  // The ground profile's chart and controls (PeelProfileView), for Measure (js/measure.js):
  //  - ground (lidar / terrain tiles), stretches corrected to Peel manholes, manhole ground dots,
  //    sanitary inverts, watermains at the assumed cover, crossings and the measured points;
  //  - shading where the depth to invert is under the threshold (a setting, 2.0 m by default);
  //  - a hover / touch crosshair: distance, ground (with its source), invert, depth or cover;
  //  - an expand button (a larger chart, still in the panel), grade per leg, the vertical
  //    exaggeration, the accuracy label (from data/elevation-validation.json) and a CSV;
  //  - the profile along a sewer (manhole to manhole: inverts, published depths, slope per pipe,
  //    adverse slopes flagged).
  // Screening only: every figure is indicative, not design.
  const { esc, token, store, CSV_DISCLAIMER } = root.PeelUtil;
  const PC = root.PeelProfileCore;
  const tok = name => token(name) || `var(${name})`;
  const fmtDist = m => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);
  const f1 = v => (v == null || !isFinite(v) ? '–' : v.toFixed(1));
  const f2 = v => (v == null || !isFinite(v) ? '–' : v.toFixed(2));

  // ---- Settings and the validation table ---------------------------------------------------------
  const shallowM = () => { const v = +(store && store.get('profShallow', PC.SHALLOW_M)); return v > 0 && v < 10 ? v : PC.SHALLOW_M; };
  let table = null, tableLoading = null;
  function loadTable() {
    if (!tableLoading && typeof fetch === 'function') tableLoading = fetch('data/elevation-validation.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(t => { table = t; return t; });
    return tableLoading || Promise.resolve(null);
  }
  // The datum shift for Peel manhole grounds (to the lidar's CGVD2013), when Peel's datum is CGVD28:
  // the area's median shift from the table, else the Peel-wide one. Never applied silently: the
  // label says so.
  function datumShift(lat, lng) {
    if (!table || !table.datums || table.datums.peelSewers !== 'CGVD28') return { shift: 0, note: table && table.datums && table.datums.peelSewers === 'CGVD2013' ? 'Peel inverts and the lidar are both CGVD2013.' : 'The vertical datum of Peel\'s inverts is not confirmed: manhole grounds are used as published.' };
    const a = PC.areaAt(table, lat, lng), s = a && a.shift != null ? a.shift : table.datums.shiftMedian;
    return s != null ? { shift: s, note: `Peel inverts converted from CGVD28 to CGVD2013 (${s >= 0 ? '+' : ''}${s.toFixed(2)} m, NRCan grids).` } : { shift: 0, note: 'Peel inverts are CGVD28; no shift available here, so manhole grounds are used as published.' };
  }

  // ---- The chart -----------------------------------------------------------------------------------
  // model: { prof (samples: d, z, zRaw, corrected, source, san, wat, leg), marks [{ d, c, l }], xings
  // [{ d, kind }], manholes [{ d, groundAdj, depth, invert }], spans, colors { san, wat, xing }, wmCover }
  function scale(model, W, H) {
    const { prof, wmCover } = model;
    const zs = prof.flatMap(p => [p.z, p.zRaw != null ? p.zRaw : p.z, p.san ? p.san.inv : p.z, p.wat ? p.z - wmCover : p.z]).concat((model.manholes || []).map(m => m.groundAdj));
    const lo = Math.floor(Math.min(...zs) - 1), hi = Math.ceil(Math.max(...zs) + 1), D = prof[prof.length - 1].d || 1;
    const top = model.marks && model.marks.length ? 16 : 6, left = 30, right = 6, bottom = 16;
    return { W, H, lo, hi, D, top, left, X: d => left + d / D * (W - left - right), Y: z => top + (1 - (z - lo) / (hi - lo || 1)) * (H - bottom - top), plotW: W - left - right, plotH: H - bottom - top, bottom };
  }
  const zAt = (prof, d) => PC.zAtD(prof, d, 'z');
  function chartSVG(model, W, H) {
    const s = scale(model, W, H), { X, Y, lo, hi, D, top } = s, prof = model.prof, base = H - s.bottom;
    const path = get => { let d = '', on = false; for (const p of prof) { const z = get(p); if (z == null) { on = false; continue; } d += `${on ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(z).toFixed(1)}`; on = true; } return d; };
    const line = path(p => p.z);
    const raw = prof.some(p => p.corrected) ? path(p => (p.corrected ? p.zRaw : null)) : '';
    const corr = prof.some(p => p.corrected) ? path(p => (p.corrected ? p.z : null)) : '';
    const coarse = prof.some(p => p.source === 'terrain') ? path(p => (p.source === 'terrain' ? p.z : null)) : '';
    const san = path(p => (p.san && !p.san.fm ? p.san.inv : null)), wat = path(p => (p.wat ? p.z - model.wmCover : null));
    // Shallow: depth to invert under the threshold, shaded to the baseline.
    const shallow = PC.shallowRuns(prof, shallowM()).map(r => `<rect class="prof-shallow" x="${X(r.from).toFixed(1)}" y="${top}" width="${Math.max(1.5, X(r.to) - X(r.from)).toFixed(1)}" height="${(base - top).toFixed(1)}"/>`).join('');
    const marks = (model.marks || []).map(m => `<g><line x1="${X(m.d).toFixed(1)}" x2="${X(m.d).toFixed(1)}" y1="${top - 2}" y2="${base}" stroke="${m.c}" stroke-width="1" stroke-dasharray="2 2" opacity=".8"/><circle cx="${X(m.d).toFixed(1)}" cy="${Y(zAt(prof, m.d)).toFixed(1)}" r="3.6" fill="${m.c}" stroke="var(--surface-1)" stroke-width="1.2"/><text x="${X(m.d).toFixed(1)}" y="${top - 5}" text-anchor="middle" font-size="9" font-weight="700" fill="${m.c}">${esc(m.l)}</text></g>`).join('');
    const xings = (model.xings || []).map((x, k) => { const cx = X(x.d).toFixed(1), cy = Y(zAt(prof, x.d)); const c = model.colors.xing[x.kind]; return `<g><line x1="${cx}" x2="${cx}" y1="${(cy - 5).toFixed(1)}" y2="${(cy + 5).toFixed(1)}" stroke="${c}" stroke-width="2.4"/><text x="${cx}" y="${(cy + 14).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="600" fill="${c}">${k + 1}</text></g>`; }).join('');
    const mh = (model.manholes || []).map(m => `<circle class="prof-mh" cx="${X(m.d).toFixed(1)}" cy="${Y(m.groundAdj).toFixed(1)}" r="3"><title>Peel manhole ground ${m.groundAdj.toFixed(2)} m (invert ${m.invert.toFixed(2)} + published depth ${m.depth.toFixed(2)} m)</title></circle>`).join('');
    const aria = `Ground profile, ${fmtDist(D)}${corr ? ', with stretches corrected to Peel manholes' : ''}${san ? ', sanitary inverts' : ''}${wat ? ', watermains at an assumed cover' : ''}`;
    return { s, svg: `<svg class="elev-svg prof-chart" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="aspect-ratio:${W}/${H}" role="img" aria-label="${esc(aria)}">
      ${shallow}
      <path d="${line}L${X(D)},${base}L${X(0)},${base}Z" fill="color-mix(in srgb, var(--accent) 16%, transparent)"/>
      ${raw ? `<path class="prof-raw" d="${raw}" fill="none" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="2 2"/>` : ''}
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
      ${corr ? `<path class="prof-corr" d="${corr}" fill="none" stroke="var(--accent)" stroke-width="3" vector-effect="non-scaling-stroke" opacity=".55"/>` : ''}
      ${coarse ? `<path class="elev-coarse" d="${coarse}" fill="none" stroke="var(--surface-1)" stroke-width="1.8" stroke-dasharray="3 3"/>` : ''}
      ${san ? `<path d="${san}" fill="none" stroke="${model.colors.san}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>` : ''}
      ${wat ? `<path d="${wat}" fill="none" stroke="${model.colors.wat}" stroke-width="1.8" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>` : ''}
      ${mh}${xings}${marks}
      <line class="prof-cross" x1="-10" x2="-10" y1="${top}" y2="${base}" stroke="var(--text-primary)" stroke-width="1" vector-effect="non-scaling-stroke"/>
      <g font-size="9" fill="var(--text-muted)"><text x="2" y="${Y(hi) + 4}">${hi} m</text><text x="2" y="${Y(lo)}">${lo} m</text><text x="${X(0)}" y="${H - 4}">0</text><text x="${X(D) - 2}" y="${H - 4}" text-anchor="end">${fmtDist(D)}</text></g></svg>` };
  }
  // The crosshair readout for the sample nearest a distance.
  function readout(model, d) {
    const prof = model.prof; let i = 0, best = Infinity;
    prof.forEach((p, k) => { const v = Math.abs(p.d - d); if (v < best) { best = v; i = k; } });
    const p = prof[i], parts = [`<strong>${fmtDist(p.d)}</strong>`];
    const src = `${p.source === 'lidar' ? 'lidar' : p.source === 'terrain' ? 'terrain tiles' : '?'}${p.corrected ? ', corrected to manholes' : ''}`;
    parts.push(`ground ${f2(p.z)} m <span class="muted">(${esc(src)})</span>`);
    const mh = (model.manholes || []).find(m => Math.abs(m.d - p.d) <= Math.max(5, (prof[1] ? prof[1].d - prof[0].d : 5)));
    if (mh) parts.push(`Peel manhole: ground ${f2(mh.groundAdj)} m, depth to invert ${f2(mh.depth)} m <span class="muted">(published)</span>`);
    else if (p.san && !p.san.fm) parts.push(`invert ${f2(p.san.inv)} m · depth ${f2(p.z - p.san.inv)} m`);
    if (p.wat) parts.push(`watermain${p.wat.d ? ` ${p.wat.d} mm` : ''} · cover ${model.wmCover} m <span class="muted">(assumed)</span>`);
    return { i, html: parts.join(' · ') };
  }

  // ---- Rendering into the tool banner ---------------------------------------------------------------
  const state = new WeakMap();   // container → { model, big }
  function render(el, model) {
    if (!el) return;
    const st = state.get(el) || { big: false }; st.model = model; state.set(el, st);
    const W = st.big ? 640 : 300, H = st.big ? 260 : (model.pipes ? 126 : 100);
    const { s, svg } = chartSVG(model, W, H);
    const ve = PC.exaggeration(s.plotW, s.plotH, s.D, s.hi - s.lo);
    const grades = gradesHTML(model);
    el.innerHTML = `${model.head || ''}
      <div class="prof-wrap${st.big ? ' prof-big' : ''}">${svg}<div class="prof-tip" hidden></div></div>
      <span class="pd-row prof-tools"><button type="button" class="btn small" data-prof-act="expand" aria-pressed="${st.big}">${st.big ? 'Smaller' : 'Expand'}</button> <button type="button" class="btn small" data-prof-act="csv">CSV</button>
        <label class="prof-thr">Shade depth under <input type="number" min="0.5" max="9.5" step="0.5" value="${shallowM()}" data-prof-act="thr" aria-label="Shade where the depth to invert is under (m)"> m</label></span>
      ${legendHTML(model)}${grades}
      <span class="pd-row muted small">Vertical exaggeration ≈ ×${ve >= 10 ? Math.round(ve) : ve.toFixed(1)}. Indicative only, not design.</span>
      ${model.tail || ''}`;
    bind(el, st, s);
  }
  function legendHTML(model) {
    const sw = (cls, style) => `<span class="lg-line ${cls}" style="${style}"></span>`;
    const items = [`${sw('', 'background:var(--accent)')}ground`];
    if (model.prof.some(p => p.corrected)) items.push(`${sw('lg-thick', 'background:var(--accent);opacity:.55')}corrected to Peel manholes <span class="muted">(dotted: raw)</span>`);
    if ((model.manholes || []).length) items.push('<span class="lg-dot prof-mh-dot"></span>Peel manhole ground');
    if (model.prof.some(p => p.san && !p.san.fm)) items.push(`${sw('', `background:${model.colors.san}`)}sanitary invert`);
    if (model.prof.some(p => p.wat)) items.push(`${sw('lg-dash', `border-color:${model.colors.wat}`)}watermain (${model.wmCover} m cover, assumed)`);
    if (PC.shallowRuns(model.prof, shallowM()).length) items.push(`<span class="lg-box prof-shallow-key"></span>depth to invert under ${shallowM()} m`);
    return `<span class="pd-row prof-legend">${items.map(t => `<span>${t}</span>`).join('')}</span>`;
  }
  function gradesHTML(model) {
    const g = PC.legGrades(model.prof), marks = model.marks || [];
    if (!g.length) return '';
    return `<span class="pd-row prof-grades">${g.map((x, k) => `<span>${esc((marks[k] || {}).l || '')}→${esc((marks[k + 1] || {}).l || '')} <strong>${x.grade >= 0 ? '+' : ''}${(x.grade * 100).toFixed(2)}%</strong></span>`).join('')}<span class="muted">grade per leg</span></span>`;
  }
  function bind(el, st, s) {
    const svg = el.querySelector('svg.prof-chart'), tip = el.querySelector('.prof-tip'), cross = el.querySelector('.prof-cross');
    if (!svg || !tip) return;
    const at = e => {
      const r = svg.getBoundingClientRect(); if (!r.width) return;
      const x = (e.clientX - r.left) / r.width * s.W, d = Math.max(0, Math.min(s.D, (x - s.left) / s.plotW * s.D));
      const ro = readout(st.model, d), p = st.model.prof[ro.i], cx = s.X(p.d);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
      tip.innerHTML = ro.html; tip.hidden = false;
      const left = Math.max(0, Math.min(r.width - tip.offsetWidth, (cx / s.W) * r.width - tip.offsetWidth / 2));
      tip.style.left = `${left}px`;
    };
    const off = () => { tip.hidden = true; cross.setAttribute('x1', -10); cross.setAttribute('x2', -10); };
    svg.addEventListener('pointermove', at);
    svg.addEventListener('pointerdown', at);
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') off(); });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-prof-act]'); if (!b || b.tagName === 'INPUT') return;
      const el = b.closest('#tp-elev, .prof-host'), st = el && state.get(el); if (!st) return;
      if (b.dataset.profAct === 'expand') { st.big = !st.big; render(el, st.model); }
      else if (b.dataset.profAct === 'csv') downloadCSV(st.model);
    });
    document.addEventListener('change', e => {
      const i = e.target.closest && e.target.closest('input[data-prof-act="thr"]'); if (!i) return;
      const v = +i.value; if (store && v > 0 && v < 10) store.set('profShallow', v);
      const el = i.closest('#tp-elev, .prof-host'), st = el && state.get(el); if (st) render(el, st.model);
    });
  }
  function downloadCSV(model) {
    const meta = `# Ground profile (Measure). ${model.sourcesNote || ''}\n# ${model.accuracy || ''}\n# ${model.datumNote || ''}\n# Watermain cover ${model.wmCover} m is assumed (depth not published). Indicative only, not design.\n`;
    const text = (CSV_DISCLAIMER || '') + meta + PC.toCSV(model.prof).replace(/^/, '');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = 'ground-profile.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // ---- The profile along a sewer ---------------------------------------------------------------------
  // route: [{ up, dn, len, dUp, dDn, d (mm), g }] in flow order (from js/measure.js sewerWalk), plus the
  // raw DEM sampled at each manhole (demUp / demDn) when available.
  function sewerHTML(route, opts = {}) {
    const rows = PC.sewerSlopes(route);
    if (!rows.length) return '<span class="muted">No sanitary main found within 30 m of the tap.</span>';
    const W = 320, H = 150, total = rows[rows.length - 1].to || 1;
    const zs = rows.flatMap(r => [r.up, r.dn, r.groundUp, r.groundDn, r.demUp, r.demDn]).filter(v => v != null && isFinite(v));
    const lo = Math.floor(Math.min(...zs) - 1), hi = Math.ceil(Math.max(...zs) + 1), X = d => 30 + d / total * (W - 36), Y = z => 8 + (1 - (z - lo) / (hi - lo || 1)) * (H - 26);
    const inv = rows.map(r => `<line x1="${X(r.from).toFixed(1)}" y1="${Y(r.up).toFixed(1)}" x2="${X(r.to).toFixed(1)}" y2="${Y(r.dn).toFixed(1)}" stroke="${r.adverse ? 'var(--cap-over)' : opts.sanColor || 'var(--accent)'}" stroke-width="2.4"><title>Pipe ${rows.indexOf(r) + 1}: ${r.slope == null ? 'slope unknown' : `${r.slope.toFixed(2)}%`}${r.adverse ? ' (adverse)' : ''}</title></line>`).join('');
    const gr = rows.flatMap(r => [[r.from, r.groundUp], [r.to, r.groundDn]]).filter(([, z]) => z != null).map(([d, z]) => `<circle class="prof-mh" cx="${X(d).toFixed(1)}" cy="${Y(z).toFixed(1)}" r="2.8"/>`).join('');
    const dem = rows.flatMap(r => [[r.from, r.demUp], [r.to, r.demDn]]).filter(([, z]) => z != null);
    const demPath = dem.map(([d, z], i) => `${i ? 'L' : 'M'}${X(d).toFixed(1)},${Y(z).toFixed(1)}`).join('');
    const adverse = rows.filter(r => r.adverse).length;
    return `<div class="prof-wrap"><svg class="elev-svg" viewBox="0 0 ${W} ${H}" width="100%" style="aspect-ratio:${W}/${H}" role="img" aria-label="Profile along the sanitary sewer: ${rows.length} pipes, ${fmtDist(total)}${adverse ? `, ${adverse} with an adverse slope` : ''}">
        ${demPath ? `<path d="${demPath}" fill="none" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3 2"/>` : ''}${inv}${gr}
        <g font-size="9" fill="var(--text-muted)"><text x="2" y="${Y(hi) + 4}">${hi} m</text><text x="2" y="${Y(lo)}">${lo} m</text><text x="30" y="${H - 4}">0</text><text x="${W - 6}" y="${H - 4}" text-anchor="end">${fmtDist(total)}</text></g></svg></div>
      <span class="pd-row prof-legend"><span><span class="lg-line" style="background:${opts.sanColor || 'var(--accent)'}"></span>invert (published)</span><span><span class="lg-dot prof-mh-dot"></span>manhole ground (invert + published depth)</span>${demPath ? '<span><span class="lg-line lg-dash" style="border-color:var(--text-muted)"></span>ground, lidar / terrain (raw)</span>' : ''}${adverse ? '<span><span class="lg-line" style="background:var(--cap-over)"></span>adverse slope</span>' : ''}</span>
      <div class="table-wrap"><table class="dt small prof-sewer"><thead><tr><th scope="col">Pipe</th><th scope="col" class="num">Length</th><th scope="col" class="num">Dia.</th><th scope="col" class="num">Invert up → down</th><th scope="col" class="num">Slope</th><th scope="col" class="num">Depth up / down</th></tr></thead><tbody>
      ${rows.map((r, k) => `<tr${r.adverse ? ' class="warn"' : ''}><td>${k + 1}</td><td class="num">${fmtDist(r.len || 0)}</td><td class="num">${r.d ? `${r.d} mm` : '–'}</td><td class="num">${f2(r.up)} → ${f2(r.dn)}</td><td class="num">${r.slope == null ? '–' : `${r.slope.toFixed(2)}%`}${r.adverse ? ' <strong>adverse</strong>' : ''}</td><td class="num">${PC.depthOk(r.dUp) ? f1(r.dUp) : '–'} / ${PC.depthOk(r.dDn) ? f1(r.dDn) : '–'}</td></tr>`).join('')}
      </tbody></table></div>
      <span class="pd-row muted small">${rows.length} pipe${rows.length === 1 ? '' : 's'} downstream from the tap, ${fmtDist(total)}${opts.stopped ? ` (${esc(opts.stopped)})` : ''}. Inverts and depths: Region of Peel sanitary mains, as published.${opts.datumNote ? ` ${esc(opts.datumNote)}` : ''} Slope = (invert up − invert down) / length; adverse = the invert rises downstream. Indicative only, not design.</span>`;
  }

  const api = { loadTable, getTable: () => table, datumShift, shallowM, chartSVG, readout, render, legendHTML, gradesHTML, sewerHTML, downloadCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelProfileView = api;
})(typeof window !== 'undefined' ? window : globalThis);
