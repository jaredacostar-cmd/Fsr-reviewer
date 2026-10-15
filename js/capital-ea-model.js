/* Capital projects (construction) and environmental assessments: pure model.
 * Labels, filters, results-year fading, contracts (one project page covers many segments), slip
 * wording, picker ranking and hit tests, and the EA / capital project scope HTML in the agreed
 * section order. No DOM or Leaflet here, so every rule is unit-tested (tests/capital-ea-ui.test.js);
 * js/capital-ea.js draws the layers and js/map-pick.js shows the picker.
 * Privacy: only the fields kept by scripts/capital-lib.js exist on a record; nothing here reads or
 * prints people, contractors or notes.
 */
(function (root) {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** "2026-03-04" → "Mar 4, 2026"; "2026-03" → "Mar 2026"; null → "–". */
  function fmtDate(d) {
    if (!d) return '–';
    const [y, m, day] = String(d).split('-');
    if (!m) return y;
    return day ? `${MONTHS[+m - 1]} ${+day}, ${y}` : `${MONTHS[+m - 1]} ${y}`;
  }

  // ---- capital projects --------------------------------------------------------------------------
  const STATUS = {
    planned: { label: 'Planned', cls: 'planned' },
    tendered: { label: 'Tendered', cls: 'tendered' },
    awarded: { label: 'Awarded', cls: 'awarded' },
    'under construction': { label: 'Under construction', cls: 'building' },
    'substantially complete': { label: 'Substantially complete', cls: 'done' },
    complete: { label: 'Complete', cls: 'done' },
    unknown: { label: 'Status unknown', cls: 'unknown' },
  };
  const statusLabel = s => (STATUS[s] || STATUS.unknown).label;
  const statusBadge = s => `<span class="ce-badge ce-${(STATUS[s] || STATUS.unknown).cls}">${esc(statusLabel(s))}</span>`;
  // Construction (solid) vs planned (dotted); completed work is not on the "Planned & under construction" layer.
  const BUILDING = new Set(['tendered', 'awarded', 'under construction']);
  const isBuilding = r => BUILDING.has(r.status);
  const onConstructionLayer = r => BUILDING.has(r.status) || r.status === 'planned';

  const WORK_WORDS = { WM: 'Watermain', SAN: 'Sanitary sewer', ROAD: 'Road' };
  const DETAIL = { TRENCHLESS: 'trenchless', RELINING: 'relining', TUNNELING: 'tunnelling', DEVELOPMENT: 'development', 'REHAB EXCAVATION': 'rehabilitation', 'SMH_REPAIR/REPLACE': 'maintenance hole repair' };
  /** Layer work-type code → plain words ("SAN-TRENCHLESS" → "Sanitary sewer (trenchless)"). */
  function workLabel(wt) {
    const s = String(wt || '').trim();
    if (!s) return 'Capital work';
    const m = /^(WM|SAN|ROAD)\s*[-–]\s*(.+)$/i.exec(s) || /^(Sanitary|Road)\s*-\s*(.+)$/i.exec(s);
    const base = s.toUpperCase();
    if (WORK_WORDS[base]) return WORK_WORDS[base];
    if (!m) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    const head = WORK_WORDS[m[1].toUpperCase()] || (/^sanitary$/i.test(m[1]) ? 'Sanitary sewer' : 'Road');
    const tail = m[2].trim();
    if (DETAIL[tail.toUpperCase()]) return `${head} (${DETAIL[tail.toUpperCase()]})`;
    if (head === 'Road') return `Road: ${tail.toLowerCase().replace(/\s+(\d)-(\d)/, ' $1–$2')}`;
    return `${head} (${tail.toLowerCase()})`;
  }
  const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s/-])([a-z])/g, (x, a, b) => a + b.toUpperCase());

  /** Layer filter: system chips (water / wastewater / roads). */
  const capitalShown = (r, sys) => onConstructionLayer(r) && !!(sys || {})[r.system];

  const year = d => (d ? +String(d).slice(0, 4) : null);
  /** Year the work is in service: substantial completion (actual, else target). */
  const inServiceYear = r => year(r.substantialActual || r.substantialTarget);
  /** Results-year fading: work not in service by the chosen year fades (null year = build-out: nothing fades). */
  const fadedAt = (r, yr) => yr != null && (r.status === 'planned' ? (inServiceYear(r) == null || inServiceYear(r) > yr) : inServiceYear(r) != null && inServiceYear(r) > yr);

  const RANK = ['unknown', 'planned', 'tendered', 'awarded', 'under construction', 'substantially complete', 'complete'];
  /** Contracts: records grouped by project page (else project number), with totals. */
  function contracts(records) {
    const by = new Map();
    for (const r of records || []) {
      const k = r.contract || `id:${r.id}`;
      if (!by.has(k)) by.set(k, { key: k, records: [], lengthM: 0 });
      const c = by.get(k);
      c.records.push(r);
      c.lengthM += r.lengthM || 0;
    }
    for (const c of by.values()) {
      const lead = c.records.slice().sort((a, b) => RANK.indexOf(b.status) - RANK.indexOf(a.status) || (b.percentComplete || 0) - (a.percentComplete || 0))[0];
      c.lead = lead;
      c.status = lead.status;
      c.percent = Math.max(...c.records.map(r => r.percentComplete || 0)) || (lead.percentComplete ?? null);
      c.projectNumbers = [...new Set(c.records.map(r => r.projectNumber).filter(Boolean))];
      c.systems = [...new Set(c.records.map(r => r.system))];
      c.lastUpdate = c.records.map(r => r.lastUpdate).filter(Boolean).sort().pop() || null;
    }
    return by;
  }

  const MILESTONES = [['tender', 'Tender'], ['award', 'Award'], ['start', 'Start'], ['substantial', 'Substantial completion']];
  /**
   * Slip in neutral words, from the latest milestone where both a target and an actual exist:
   * "Start 7 months later than target" / "earlier than" / "Award on target". null when not computable.
   */
  function slipText(slip) {
    if (!slip) return null;
    for (const [k, t] of MILESTONES.slice().reverse()) {
      const m = slip[k];
      if (m == null) continue;
      if (m === 0) return `${t} on target`;
      return `${t} ${Math.abs(m)} month${Math.abs(m) === 1 ? '' : 's'} ${m > 0 ? 'later' : 'earlier'} than target`;
    }
    return null;
  }

  // ---- environmental assessments -----------------------------------------------------------------
  const EA_STATUS = { commenced: 'Commenced', consultation: 'Consultation', 'report review': 'Report review', complete: 'Complete', addendum: 'Addendum', unknown: 'Status unknown' };
  const eaBadge = s => `<span class="ce-badge ce-ea-${esc(String(s).replace(/\s+/g, '-'))}">${esc(EA_STATUS[s] || EA_STATUS.unknown)}</span>`;
  const EA_CURRENT = new Set(['commenced', 'consultation', 'report review', 'addendum']);
  /** EA filter: show = current | completed | all; sys chips water / wastewater / roads (multi = water or wastewater; storm = roads). */
  function eaShown(e, show, sys) {
    const s = sys || {};
    const sysOk = e.system === 'multi' ? (s.water || s.wastewater) : e.system === 'storm' ? s.roads : !!s[e.system];
    if (!sysOk) return false;
    if (show === 'all') return true;
    if (show === 'completed') return e.status === 'complete';
    return EA_CURRENT.has(e.status);
  }
  /** Placed only at a municipality centre: not drawn (it would stack dozens of EAs on one dot). */
  const eaUnplaced = e => !e.geometry || /^municipality centre/i.test(e.geomMethod || '') || e.geomMethod === 'none';
  /** Dashed outline: geometry drawn from an image or placed approximately. */
  const eaDashed = e => e.geomType === 'approx' || e.geomConfidence === 'low' || /traced/i.test(e.geomMethod || '');
  const SYS_ICON = { water: '💧', wastewater: '⬇', roads: '🛣', storm: '🌧', multi: '💧⬇' };
  const MS_LABEL = { commencement: 'Notice of commencement', pic: 'Public information centre', commentEnd: 'Comment period ends', report: 'Report released', completion: 'Notice of completion', reviewEnd: 'Review period ends', addendum: 'Addendum' };
  const MS_ORDER = ['commencement', 'pic', 'commentEnd', 'report', 'completion', 'reviewEnd', 'addendum'];

  // ---- picker ------------------------------------------------------------------------------------
  /** Tap priority (lower first): applications, facilities, construction, planned DC works, EAs, pipes, areas. */
  const PRIORITY = { development: 1, facility: 2, construction: 3, dc: 4, ea: 5, pipe: 6, area: 9 };
  /** Areas never block a point or a line: they become "Also here" context when anything else is hit. */
  function rankHits(hits) {
    const sorted = (hits || []).slice().sort((a, b) => (PRIORITY[a.kind] || 7) - (PRIORITY[b.kind] || 7) || (a.d || 0) - (b.d || 0));
    const targets = sorted.filter(h => h.kind !== 'area');
    const areas = sorted.filter(h => h.kind === 'area');
    return targets.length ? { targets, context: areas } : { targets: areas.slice(0, 1), context: areas.slice(1) };
  }
  /** Pixel tolerance: wider on touch. */
  const tolerance = touch => (touch ? 22 : 10);
  // Pixel geometry helpers (screen coordinates [x, y]).
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function lineDist(p, pts) { let best = Infinity; for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(p, pts[i - 1], pts[i])); return pts.length === 1 ? Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) : best; }
  function inRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  /** Screen distance from a tap to a GeoJSON geometry, through `toPx([lng, lat]) → [x, y]`. 0 inside a polygon. */
  function hitDistance(p, g, toPx) {
    if (!g) return Infinity;
    const px = c => toPx(c);
    switch (g.type) {
      case 'Point': { const q = px(g.coordinates); return Math.hypot(p[0] - q[0], p[1] - q[1]); }
      case 'LineString': return lineDist(p, g.coordinates.map(px));
      case 'MultiLineString': return Math.min(...g.coordinates.map(l => lineDist(p, l.map(px))));
      case 'Polygon': { const r = g.coordinates[0].map(px); return inRing(p, r) ? 0 : lineDist(p, r); }
      case 'MultiPolygon': return Math.min(...g.coordinates.map(poly => { const r = poly[0].map(px); return inRing(p, r) ? 0 : lineDist(p, r); }));
      default: return Infinity;
    }
  }
  /** "3 items here: EA · watermain · road" (the picker heading). */
  function pickHeading(targets) {
    const words = targets.map(t => t.short || t.kind);
    return `${targets.length} items here: ${[...new Set(words)].join(' · ')}`;
  }
  /** Repeated tap at (about) the same spot within 4 s steps to the next item. */
  const sameSpot = (a, b, t0, t1) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) <= 6 && Math.abs(t1 - t0) <= 4000;

  // ---- scope HTML ---------------------------------------------------------------------------------
  /**
   * EA scope, in order: header · purpose · milestone timeline + next step · decision (completed) ·
   * what came out of it · documents · footer. ctx: { screenNote, reportLink, watched, isPublic, capitalById, dcStatus(proj) }.
   */
  function eaScopeHTML(e, ctx = {}) {
    const ms = (e.milestones || []).slice().sort((a, b) => a.date.localeCompare(b.date) || MS_ORDER.indexOf(a.type) - MS_ORDER.indexOf(b.type));
    const today = ctx.today || new Date().toISOString().slice(0, 10);
    const parts = [];
    parts.push(`<div class="ce-head" data-sec="header"><h3>${esc(e.name)}</h3><div class="m"><span class="ce-sys" title="${esc(e.system)}">${SYS_ICON[e.system] || ''}</span> ${esc(titleCase(e.system))} · ${e.schedule && e.schedule !== 'unknown' ? `${/plan|IEA/.test(e.schedule) ? esc(e.schedule === 'IEA' ? 'Individual EA' : 'Master plan') : `Schedule ${esc(e.schedule)}`} · ` : ''}${eaBadge(e.status)}${e.municipality ? ` · ${esc(e.municipality)}` : ''}</div></div>`);
    parts.push(`<p class="ce-purpose" data-sec="purpose">${e.purpose ? esc(e.purpose) : '<span class="muted">Purpose not yet summarised.</span>'}</p>`);
    parts.push(`<div data-sec="timeline"><h4 class="sub-title">Milestones</h4>${ms.length ? `<ol class="ce-tl">${ms.map(m => `<li class="${m.date <= today ? 'past' : 'next'}"><span class="d">${esc(fmtDate(m.date))}</span> ${esc(MS_LABEL[m.type] || m.type)}</li>`).join('')}</ol>` : '<p class="muted small">No dated milestones on the project page.</p>'}${e.nextStep ? `<p class="ce-next"><strong>Next step:</strong> ${esc(e.nextStep.text)}${e.nextStep.date ? ` · ${esc(fmtDate(e.nextStep.date))}` : ''}</p>` : ''}</div>`);
    if (e.status === 'complete' || e.status === 'addendum') parts.push(`<div data-sec="decision"><h4 class="sub-title">Decision</h4><p>${e.decision ? esc(e.decision) : '<span class="muted">Preferred solution not yet summarised; see the report.</span>'}${e.links?.report ? ` <a href="${esc(e.links.report.url)}" target="_blank" rel="noopener">${esc(e.links.report.label || 'Report')} ↗</a>` : ''}</p></div>`);
    const dc = (e.related && e.related.dcProjects) || [];
    const cap = ((e.related && e.related.capitalProjects) || []).map(c => ({ ...c, rec: ctx.capitalById ? ctx.capitalById(c.id) : null }));
    parts.push(`<div data-sec="outcomes"><h4 class="sub-title">What came out of it</h4>${dc.length || cap.length ? `<ul class="small">${dc.map(d => `<li>DC program: ${esc(d.facility)} – ${esc(d.what)} <small>${esc(d.proj)}</small>${ctx.dcStatus ? ` · ${esc(ctx.dcStatus(d))}` : ''}</li>`).join('')}${cap.map(c => `<li><button type="button" class="btn small link" data-ce-cap="${esc(c.id)}">${esc(c.rec ? workLabel(c.rec.workType) : 'Capital project')} ${esc(c.projectNumber || '')}</button>${c.rec ? ` · ${statusBadge(c.rec.status)}` : ''}</li>`).join('')}</ul>` : '<p class="muted small">No linked DC or capital projects found.</p>'}</div>`);
    const L = e.links || {};
    const docs = [L.report && ['Report', L.report], ...(L.appendices || []).map(a => ['Appendix', a]), ...(L.notices || []).map(n => ['Notice', n])].filter(Boolean);
    parts.push(`<div data-sec="documents"><h4 class="sub-title">Documents</h4>${docs.length || L.page ? `<ul class="small">${L.page ? `<li><a href="${esc(L.page)}" target="_blank" rel="noopener">Project page (Peel) ↗</a></li>` : ''}${docs.map(([k, d]) => `<li>${esc(k)}: <a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label)} ↗</a></li>`).join('')}</ul>` : '<p class="muted small">No documents linked.</p>'}</div>`);
    parts.push(`<div class="ce-foot" data-sec="footer"><p class="small muted">${eaDashed(e) ? '<span class="ce-badge ce-approx">Approximate location</span> ' : ''}Location: ${esc(e.geomMethod || 'not placed')} · page checked ${esc(fmtDate(e.lastChecked))}</p>${ctx.screenNote || ''}<div class="ce-actions">${ctx.reportLink || ''} ${watchBtn(`ea:${e.id}`, ctx.watched)}</div></div>`);
    return parts.join('');
  }
  const watchBtn = (key, on) => `<button type="button" class="btn small${on ? ' on' : ''}" data-watch="${esc(key)}" aria-pressed="${on ? 'true' : 'false'}">${on ? '★ Watching' : '☆ Watch'}</button>`;

  /**
   * Capital project scope (a contract), in order: header · progress · slip · why it exists ·
   * length / municipality / ward · project page · footer. Never shows people or contractors.
   * ctx: { screenNote, reportLink, watched, isPublic, dcLinks: [{key, method, confidence, diameter, year, name}], ea: {id, name, status} | null, description }.
   */
  function capitalScopeHTML(c, ctx = {}) {
    const r = c.lead;
    const parts = [];
    const fromTo = r.from || r.to ? `${esc(titleCase(r.from || '?'))} → ${esc(titleCase(r.to || '?'))}` : '';
    parts.push(`<div class="ce-head" data-sec="header"><h3>${esc(workLabel(r.workType))}${r.street ? ` · ${esc(titleCase(r.street))}` : ''}</h3><div class="m">${fromTo ? `${fromTo} · ` : ''}${statusBadge(c.status)}${c.records.length > 1 ? ` · ${c.records.length} segments in this contract` : ''}</div></div>`);
    if (ctx.description) parts.push(`<p class="ce-purpose" data-sec="description">${esc(ctx.description)}</p>`);
    const pct = c.percent;
    parts.push(`<div data-sec="progress"><h4 class="sub-title">Progress</h4>${pct != null ? `<div class="ce-bar" role="img" aria-label="${pct}% complete"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div><p class="small">${pct}% built</p>` : ''}<table class="dt ce-ms"><thead><tr><th></th><th>Target</th><th>Actual</th></tr></thead><tbody>${MILESTONES.map(([k, t]) => `<tr><td>${esc(t)}</td><td>${esc(fmtDate(r[`${k}Target`]))}</td><td>${esc(fmtDate(r[`${k}Actual`]))}</td></tr>`).join('')}</tbody></table></div>`);
    const st = slipText(r.slip);
    if (st) parts.push(`<p class="ce-slip pv-hide" data-sec="slip">${esc(st)}</p>`);
    const why = [];
    for (const d of ctx.dcLinks || []) why.push(`<li>DC program: ${esc(d.name || d.key)}${d.diameter ? ` · ${esc(d.diameter)} mm` : ''}${d.year ? ` · scheduled ${esc(d.year)}` : ''} <small class="muted">(match: ${esc(d.method)}, ${esc(d.confidence)})</small></li>`);
    if (ctx.ea) why.push(`<li>From an EA: <button type="button" class="btn small link" data-ce-ea="${esc(ctx.ea.id)}">${esc(ctx.ea.name)}</button> · ${eaBadge(ctx.ea.status)}</li>`);
    parts.push(`<div data-sec="why"><h4 class="sub-title">Why it exists</h4>${why.length ? `<ul class="small">${why.join('')}</ul>` : '<p class="small">Not in the DC program.</p>'}</div>`);
    parts.push(`<p class="small" data-sec="facts">Length ${Math.round(c.lengthM || 0).toLocaleString('en-CA')} m (computed)${r.municipality ? ` · ${esc(titleCase(r.municipality))}` : ''}${r.ward ? ` · Ward ${esc(r.ward)}` : ''}${c.projectNumbers.length ? ` · Project ${esc(c.projectNumbers.join(', '))}` : ''}</p>`);
    if (r.website) parts.push(`<p class="small" data-sec="page"><a href="${esc(r.website)}" target="_blank" rel="noopener">Project page (Peel) ↗</a></p>`);
    parts.push(`<div class="ce-foot" data-sec="footer"><p class="small muted">As of ${esc(fmtDate(c.lastUpdate))} · Region of Peel capital projects layer</p>${ctx.screenNote || ''}<div class="ce-actions">${ctx.reportLink || ''} ${watchBtn(`cap:${c.key}`, ctx.watched)}</div></div>`);
    return parts.join('');
  }

  /** One-line hover preview. */
  const capitalHover = c => `${workLabel(c.lead.workType)}${c.lead.street ? ` · ${titleCase(c.lead.street)}` : ''} · ${statusLabel(c.status)}${c.percent != null && isBuilding(c.lead) ? ` · ${c.percent}%` : ''}`;
  const eaHover = e => `EA · ${e.name} · ${EA_STATUS[e.status] || EA_STATUS.unknown}`;

  const api = {
    esc, fmtDate, STATUS, statusLabel, statusBadge, isBuilding, onConstructionLayer, workLabel, titleCase, capitalShown,
    inServiceYear, fadedAt, contracts, slipText, MILESTONES,
    EA_STATUS, EA_CURRENT, eaBadge, eaShown, eaDashed, eaUnplaced, MS_LABEL,
    PRIORITY, rankHits, tolerance, hitDistance, pickHeading, sameSpot,
    eaScopeHTML, capitalScopeHTML, capitalHover, eaHover, watchBtn,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelCapitalEAModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
