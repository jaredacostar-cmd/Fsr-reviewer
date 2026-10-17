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
    unknown: { label: 'Status not stated', cls: 'unknown' },
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

  // ---- map styling ----------------------------------------------------------------------------------
  /** Below this zoom an EA is a small marker at its label point; from it, its outline, route or site. */
  const EA_OUTLINE_ZOOM = 12;
  /**
   * EA line style: current EAs strong, completed ones faint; an approximate or traced location is
   * thinner and fainter still (the least certain shapes must not be the loudest on the map).
   */
  function eaStyle(e) {
    // Low confidence (placed approximately) is thinner and fainter; a medium-confidence trace from the
    // project map keeps its weight and is only dashed.
    const current = e.status !== 'complete', weak = e.geomType === 'approx' || e.geomConfidence === 'low', dashed = eaDashed(e);
    const weight = (current ? 2.5 : 1.5) * (weak ? 0.6 : 1);
    const opacity = (current ? 0.95 : 0.5) * (weak ? 0.65 : 1);
    return { weight: +weight.toFixed(2), opacity: +opacity.toFixed(2), fillOpacity: current ? (weak ? 0.02 : 0.06) : 0, dashArray: dashed ? '4 5' : current ? null : '1 4' };
  }
  /**
   * Where an EA's name (and its low-zoom marker) goes: a study area's area-weighted centroid when it
   * lies inside (else the bbox centre if inside, else the first vertex); a route's middle vertex; a
   * site's point. [lng, lat].
   */
  function labelPoint(g) {
    if (!g) return null;
    const inside = (ring, p) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
    const ringCentroid = ring => { let a = 0, x = 0, y = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; a += f; x += (ring[j][0] + ring[i][0]) * f; y += (ring[j][1] + ring[i][1]) * f; } return a ? [x / (3 * a), y / (3 * a)] : ring[0]; };
    const polyPoint = ring => { const c = ringCentroid(ring); if (inside(ring, c)) return c; const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), b = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; return inside(ring, b) ? b : ring[0]; };
    const mid = cs => cs[Math.floor(cs.length / 2)];
    switch (g.type) {
      case 'Point': return g.coordinates;
      case 'MultiPoint': return g.coordinates[0];
      case 'LineString': return mid(g.coordinates);
      case 'MultiLineString': return mid(g.coordinates.slice().sort((a, b) => b.length - a.length)[0]);
      case 'Polygon': return polyPoint(g.coordinates[0]);
      case 'MultiPolygon': return polyPoint(g.coordinates.slice().sort((a, b) => b[0].length - a[0].length)[0][0]);
      default: return null;
    }
  }
  /** Construction labels: "% built" between 1 and 99; 100 while still under way reads "finishing"; 0 or none: no label. */
  const pctLabel = c => (c.percent == null || c.percent <= 0 ? null : c.percent >= 100 ? 'finishing' : `${c.percent}% built`);
  /** The system casing under a construction line (existing-pipe colours; roads in the street grey). */
  const SYS_CASING = { water: '--pipe-water', wastewater: '--pipe-sanitary', roads: '--xing-street' };

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
      case 'MultiPoint': return Math.min(...g.coordinates.map(c => { const q = px(c); return Math.hypot(p[0] - q[0], p[1] - q[1]); }));
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


  // ---- DC timing: actual status where matched ------------------------------------------------------
  /**
   * DC project number → the most advanced matched capital contract { status, percent, lastUpdate, key }.
   * Links name DC works as "<sys>:line:c<component>" (looked up in the DC map for its project) or
   * "<sys>:fac:<facility>:<project>:<item>".
   */
  function dcCapitalIndex(capital, dcInfra) {
    const idx = new Map();
    if (!capital || !capital.links) return idx;
    const cs = contracts(capital.records || []);
    const byId = new Map((capital.records || []).map(r => [r.id, r]));
    const compProj = new Map();
    for (const sys of ['water', 'wastewater']) for (const ln of ((dcInfra && dcInfra[sys] && dcInfra[sys].lines) || [])) if (ln.c) compProj.set(`${sys}:c${String(+ln.c)}`, ln.p || ln.c);
    for (const l of capital.links) {
      const [sys, kind, ref, proj4] = l.dc.split(':');
      const proj = kind === 'fac' ? proj4 : compProj.get(`${sys}:${ref}`);
      const r = byId.get(l.capital); if (!proj || !r) continue;
      const c = cs.get(r.contract || `id:${r.id}`);
      const cur = idx.get(proj);
      // A project-matched (medium) link outranks an outline-overlap (low) one; then the most advanced
      // contract. The entry says how sure the match is (conf), so a label can leave a low one out.
      const conf = l.confidence === 'low' ? 0 : 1, curConf = cur ? (cur.conf === 'low' ? 0 : 1) : -1;
      if (!cur || conf > curConf || (conf === curConf && (RANK.indexOf(c.status) > RANK.indexOf(cur.status) || (c.status === cur.status && (c.percent || 0) > (cur.percent || 0))))) idx.set(proj, { status: c.status, percent: c.percent, lastUpdate: c.lastUpdate, key: c.key, conf: l.confidence || 'medium' });
    }
    return idx;
  }
  /** DC timing cell: actual status when matched ("Tendered", "60% built", as of), else "not in capital records (DC schedule)". */
  function dcActualHTML(entry, hasCapital) {
    if (!hasCapital) return '';
    if (!entry) return '<small class="muted ce-dc-sched">not in capital records (DC schedule)</small>';
    const what = entry.status === 'under construction' && entry.percent != null ? `${entry.percent}% built` : statusLabel(entry.status);
    return `<small class="ce-dc-act"><button type="button" class="btn small link" data-ce-open="cap:${esc(entry.key)}">${esc(what)}</button> as of ${esc(fmtDate(entry.lastUpdate))}</small>`;
  }

  // ---- Capital tab lists -------------------------------------------------------------------------
  const inMuni = (m, muni) => !muni || String(m || '').toUpperCase().split(/[/,]/).map(x => x.trim()).includes(String(muni).toUpperCase());
  /** Active construction: tendered / awarded / under construction contracts, most built first. */
  const activeConstruction = (cs, muni) => [...cs.values()].filter(c => BUILDING.has(c.status) && inMuni(c.lead.municipality, muni)).sort((a, b) => (b.percent || 0) - (a.percent || 0) || String(a.lead.street).localeCompare(String(b.lead.street)));
  /** Current EAs: commenced / consultation / report review / addendum; soonest next step first. */
  const currentEAs = (list, muni) => (list || []).filter(e => EA_CURRENT.has(e.status) && (!muni || String(e.municipality || '').includes(muni))).sort((a, b) => String((a.nextStep && a.nextStep.date) || '9999').localeCompare(String((b.nextStep && b.nextStep.date) || '9999')) || a.name.localeCompare(b.name));
  /** Recently completed EAs: complete with a completion year in the last two years. */
  const RECENT_YEARS = 2;
  const recentEAs = (list, muni, thisYear) => (list || []).filter(e => e.status === 'complete' && e.completedYear && e.completedYear >= thisYear - RECENT_YEARS && (!muni || String(e.municipality || '').includes(muni))).sort((a, b) => b.completedYear - a.completedYear || a.name.localeCompare(b.name));

  // Capital › Construction: active Region capital projects (the EA lists are on Capital › EAs).
  function listsHTML(o) {
    const cs = o.contracts || new Map();
    const act = activeConstruction(cs, o.muni);
    const where = o.muni ? ` in ${esc(o.muni)}` : '';
    const capSec = !o.hasCapital ? '<p class="small muted">Capital projects are not published yet (waiting on Peel GIS).</p>'
      : act.length ? `<ul class="ce-list">${act.slice(0, o.allCap ? act.length : 15).map(c => `<li><button type="button" class="btn small link" data-ce-open="cap:${esc(c.key)}">${esc(workLabel(c.lead.workType))}${c.lead.street ? ` · ${esc(titleCase(c.lead.street))}` : ''}</button> ${statusBadge(c.status)}${c.percent != null ? ` <span class="small">${c.percent}% built</span>` : ''}<small class="muted"> ${esc(c.projectNumbers.join(', '))}</small></li>`).join('')}</ul>${act.length > 15 && !o.allCap ? `<p><button type="button" class="btn small" data-ce-allcap>See all ${act.length}</button></p>` : ''}`
        : `<p class="small muted">No active construction${where}.</p>`;
    return `<p class="small">Region capital projects${where}: what is being built and where it is at.${o.capitalAsOf ? ` Capital projects as of ${esc(fmtDate(o.capitalAsOf))}.` : ''} Environmental assessments are on <button type="button" class="btn small link" data-ce-goto="eas">Capital › EAs</button>.</p>
      <section class="ce-sec" data-sec="active"><h3 class="sub-title">Active construction <small class="muted">${act.length}</small></h3>${capSec}</section>
      ${o.screenNote || ''}`;
  }

  /**
   * EAs for a DC facility: linked through its DC items, or an EA placed on this facility (facility
   * geometry within 300 m). For the DC facility panel.
   */
  function easForDc(fc, list, distM) {
    return (list || []).filter(e => ((e.related && e.related.dcProjects) || []).some(d => d.facility === fc.name)
      || (fc.g && e.geomType === 'facility' && e.geometry && e.geometry.type === 'Point' && distM(fc.g, e.geometry.coordinates) <= 300));
  }
  const easForDcHTML = eas => (eas.length ? `<h3 class="sub-title">Environmental assessments</h3><ul class="small">${eas.map(e => `<li><button type="button" class="btn small link" data-ce-open="ea:${esc(e.id)}">${esc(e.name)}</button> ${eaBadge(e.status)}${e.completedYear ? ` <small class="muted">completed ${e.completedYear}</small>` : ''}${e.nextStep && e.nextStep.date ? ` <small class="muted">next: ${esc(e.nextStep.text)} · ${esc(fmtDate(e.nextStep.date))}</small>` : ''}</li>`).join('')}</ul>` : '');

  // ---- This week, Watch, Needs attention -------------------------------------------------------------
  /** This week: capital changes (one per contract) and EA page changes; watched items first, then newest. */
  function weekItems(capital, eas, watched) {
    const items = [], w = watched || new Set();
    const cs = contracts((capital && capital.records) || []);
    const byId = new Map(((capital && capital.records) || []).map(r => [r.id, r]));
    const seen = new Map();
    for (const ch of (capital && capital.changes) || []) {
      const r = byId.get(ch.id), key = `cap:${(r && (r.contract || `id:${r.id}`)) || ch.contract || ch.id}`;
      const c = r ? cs.get(r.contract || `id:${r.id}`) : null;
      if (seen.has(key)) { seen.get(key).text += `; ${ch.change}`; continue; }
      const it = { key, kind: 'capital', label: c ? `${workLabel(c.lead.workType)}${c.lead.street ? ` · ${titleCase(c.lead.street)}` : ''}` : `Project ${ch.projectNumber || ''}`, text: ch.change, date: ch.date, watched: w.has(key) };
      seen.set(key, it); items.push(it);
    }
    for (const ch of (eas && eas.changes) || []) items.push({ key: `ea:${ch.id}`, kind: 'ea', label: ch.name, text: ch.change, date: ch.date, watched: w.has(`ea:${ch.id}`) });
    return items.sort((a, b) => (b.watched - a.watched) || String(b.date).localeCompare(String(a.date)) || a.label.localeCompare(b.label));
  }
  const weekHTML = items => items.length ? items.map(it => `<li><button type="button" data-ce-open="${esc(it.key)}"><span class="ce-wk-ic">${it.kind === 'ea' ? 'EA' : '⛏'}</span><span><span class="t">${it.watched ? '★ ' : ''}${esc(it.label)}</span><span class="m">${esc(it.text)}${it.date ? ` · ${esc(fmtDate(it.date))}` : ''}</span></span></button></li>`).join('') : '';
  /** Watched EAs and capital projects for the watchlist. */
  function watchRows(watch, capital, eas) {
    const cs = contracts((capital && capital.records) || []), eaBy = new Map(((eas && eas.eas) || []).map(e => [e.id, e]));
    const rows = [];
    for (const k of watch || []) {
      if (k.startsWith('ea:')) { const e = eaBy.get(k.slice(3)); if (e) rows.push(`<li><button type="button" data-ce-open="${esc(k)}"><span class="ce-wk-ic">EA</span><span><span class="t">★ ${esc(e.name)}</span><span class="m">${esc(EA_STATUS[e.status] || '')}${e.nextStep ? ` · next: ${esc(e.nextStep.text)}${e.nextStep.date ? ` ${esc(fmtDate(e.nextStep.date))}` : ''}` : ''}</span></span></button></li>`); }
      else if (k.startsWith('cap:')) { const c = cs.get(k.slice(4)); if (c) rows.push(`<li><button type="button" data-ce-open="${esc(k)}"><span class="ce-wk-ic">⛏</span><span><span class="t">★ ${esc(workLabel(c.lead.workType))}${c.lead.street ? ` · ${esc(titleCase(c.lead.street))}` : ''}</span><span class="m">${esc(statusLabel(c.status))}${c.percent != null ? ` · ${c.percent}% built` : ''}</span></span></button></li>`); }
    }
    return rows;
  }
  /**
   * Needs attention (Peel / area scope): EAs whose review or comment period closes in the next 30
   * days, and DC-matched capital projects whose dates moved later since last week.
   * Items: { tone, ce, text } (ce = the scope to open).
   */
  function attentionItems(capital, eas, today) {
    const t0 = today || new Date().toISOString().slice(0, 10);
    const t30 = new Date(Date.parse(t0) + 30 * 864e5).toISOString().slice(0, 10);
    const out = [];
    for (const e of (eas && eas.eas) || []) {
      const m = (e.milestones || []).filter(x => (x.type === 'reviewEnd' || x.type === 'commentEnd') && x.date.length === 10 && x.date >= t0 && x.date <= t30).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (m) out.push({ tone: 'warn', ce: `ea:${e.id}`, sort: m.date, text: `${m.type === 'reviewEnd' ? 'EA review period' : 'EA comment period'} closes ${fmtDate(m.date)}: ${e.name}` });
    }
    const byId = new Map(((capital && capital.records) || []).map(r => [r.id, r])), seen = new Set();
    for (const ch of (capital && capital.changes) || []) {
      if (!ch.dc || !(ch.slipMonths > 0)) continue;
      const r = byId.get(ch.id), key = r ? (r.contract || `id:${r.id}`) : ch.id;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ tone: 'warn', ce: `cap:${key}`, sort: 'z', text: `DC project ${ch.projectNumber || ''}: capital dates moved ${ch.slipMonths} month${ch.slipMonths === 1 ? '' : 's'} later since last week` });
    }
    return out.sort((a, b) => a.sort.localeCompare(b.sort)).map(({ sort, ...x }) => x);
  }

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
    const dec = e.decision && typeof e.decision === 'object' ? e.decision : e.decision ? { text: e.decision } : null;
    if (e.status === 'complete' || e.status === 'addendum') parts.push(`<div data-sec="decision"><h4 class="sub-title">Decision</h4><p>${dec ? `${esc(dec.text)}${dec.method ? ` <small class="muted">(${esc(dec.method)})</small>` : ''}` : '<span class="muted">Preferred solution not yet summarised; see the report.</span>'}${e.links?.report ? ` <a href="${esc(e.links.report.url)}" target="_blank" rel="noopener">${esc(e.links.report.label || 'Report')} ↗</a>` : ''}</p></div>`);
    const dc = (e.related && e.related.dcProjects) || [];
    const cap = ((e.related && e.related.capitalProjects) || []).map(c => ({ ...c, rec: ctx.capitalById ? ctx.capitalById(c.id) : null }));
    parts.push(`<div data-sec="outcomes"><h4 class="sub-title">What came out of it</h4>${dc.length || cap.length ? `<ul class="small">${dc.map(d => `<li>DC program: ${esc(d.facility)} – ${esc(d.what)} <small>${esc(d.proj)}</small>${ctx.dcStatus ? ` · ${esc(ctx.dcStatus(d))}` : ''}</li>`).join('')}${cap.map(c => `<li><button type="button" class="btn small link" data-ce-cap="${esc(c.id)}">${esc(c.rec ? workLabel(c.rec.workType) : 'Capital project')} ${esc(c.projectNumber || '')}</button>${c.rec ? ` · ${statusBadge(c.rec.status)}` : ''}${c.method ? ` <small class="muted">(${esc(c.method)})</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">No linked DC or capital projects found.</p>'}${reviewHTML(e, cap, ctx.thisYear)}</div>`);
    const L = e.links || {};
    const docs = [L.report && ['Report', L.report], ...(L.appendices || []).map(a => ['Appendix', a]), ...(L.notices || []).map(n => ['Notice', n])].filter(Boolean);
    parts.push(`<div data-sec="documents"><h4 class="sub-title">Documents</h4>${docs.length || L.page ? `<ul class="small">${L.page ? `<li><a href="${esc(L.page)}" target="_blank" rel="noopener">Project page (Peel) ↗</a></li>` : ''}${docs.map(([k, d]) => `<li>${esc(k)}: <a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label)} ↗</a></li>`).join('')}</ul>` : '<p class="muted small">No documents linked.</p>'}</div>`);
    parts.push(`<div class="ce-foot" data-sec="footer"><p class="small muted">${eaDashed(e) ? `<span class="ce-badge ce-approx">${/traced/i.test(e.geomMethod || '') ? 'Traced from the project map — approximate' : 'Approximate location'}</span> ` : ''}Location: ${esc(e.geomMethod || 'not placed')} · page checked ${esc(fmtDate(e.lastChecked))}</p>${ctx.screenNote || ''}<div class="ce-actions">${ctx.reportLink || ''} ${watchBtn(`ea:${e.id}`, ctx.watched)}</div></div>`);
    return parts.join('');
  }
  // Internal (hidden in the public view): a completed EA approaching or past 10 years with no linked
  // construction under way or done. Under the Municipal Class EA a review may then be required; from
  // January 1, 2027 Ontario replaces it with the Municipal Project Assessment Process (O. Reg. 258/26).
  // Approaching = 9 years; past = 10 or more.
  function eaReview(e, capRecs, thisYear = new Date().getFullYear()) {
    if (!(e.status === 'complete' || e.status === 'addendum') || !e.completedYear) return null;
    if ((capRecs || []).some(c => c.rec && /under construction|substantially complete|complete/.test(c.rec.status || ''))) return null;
    const years = thisYear - e.completedYear;
    return years >= 10 ? { level: 'past', years } : years >= 9 ? { level: 'approaching', years } : null;
  }
  function reviewHTML(e, capRecs, thisYear) {
    const r = eaReview(e, capRecs, thisYear); if (!r) return '';
    return `<p class="small pv-hide ce-review" data-internal="ea-review">Completed ${esc(e.completedYear)} (${r.years} years ago) with no linked construction under way: ${r.level === 'past' ? 'past' : 'approaching'} 10 years, so a review may be required. From January 1, 2027 the Municipal Class EA is replaced by the Municipal Project Assessment Process (O. Reg. 258/26).</p>`;
  }

  // ---- EAs tab (Capital › EAs) ----------------------------------------------------------------------
  const EA_SYS = [['water', 'Water'], ['wastewater', 'Wastewater'], ['roads', 'Roads'], ['storm', 'Storm']];
  const EA_SORTS = [['next', 'Next step'], ['name', 'Name'], ['completed', 'Completed'], ['municipality', 'Municipality']];
  /** Tab filter: f = { q, show: current | complete | all, sys: { water, wastewater, roads, storm } }; multi = water or wastewater. */
  function eaMatch(e, f = {}) {
    const sys = f.sys || {};
    const sysOk = e.system === 'multi' ? (sys.water !== false || sys.wastewater !== false) : sys[e.system] !== false;
    if (!sysOk) return false;
    if (f.show === 'current' && !EA_CURRENT.has(e.status)) return false;
    if (f.show === 'complete' && e.status !== 'complete') return false;
    const q = String(f.q || '').trim().toLowerCase();
    return !q || `${e.name} ${e.municipality || ''} ${e.purpose || ''} ${e.system}`.toLowerCase().includes(q);
  }
  function eaSort(list, by) {
    const nextKey = e => (e.nextStep && e.nextStep.date) || (EA_CURRENT.has(e.status) ? '9998' : '9999');
    const cmp = { next: (a, b) => nextKey(a).localeCompare(nextKey(b)), name: (a, b) => a.name.localeCompare(b.name), completed: (a, b) => (b.completedYear || 0) - (a.completedYear || 0), municipality: (a, b) => String(a.municipality || '').localeCompare(String(b.municipality || '')) }[by] || (() => 0);
    return list.slice().sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name));
  }
  // Distance (m) from a point to an EA's geometry: 0 inside a study area. Local equirectangular metres.
  function geomDistM(g, lat, lng) {
    if (!g) return Infinity;
    const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110574, P = c => [(c[0] - lng) * kx, (c[1] - lat) * ky];
    const seg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L2)) : 0; return Math.hypot(a[0] + t * dx, a[1] + t * dy); };
    const line = cs => { const q = cs.map(P); let d = q.length === 1 ? Math.hypot(...q[0]) : Infinity; for (let i = 1; i < q.length; i++) d = Math.min(d, seg(q[i - 1], q[i])); return d; };
    const inside = ring => { const q = ring.map(P); let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > 0) !== (q[j][1] > 0) && 0 < (q[j][0] - q[i][0]) * (0 - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) c = !c; return c; };
    const poly = rings => (inside(rings[0]) ? 0 : Math.min(...rings.map(line)));
    switch (g.type) {
      case 'Point': return Math.hypot(...P(g.coordinates));
      case 'MultiPoint': return Math.min(...g.coordinates.map(c => Math.hypot(...P(c))));
      case 'LineString': return line(g.coordinates);
      case 'MultiLineString': return Math.min(...g.coordinates.map(line));
      case 'Polygon': return poly(g.coordinates);
      case 'MultiPolygon': return Math.min(...g.coordinates.map(poly));
      default: return Infinity;
    }
  }
  /** EAs within m metres of a point (a development's site), nearest first, with the distance. */
  // pts: the site's boundary points ([lat, lng]); the distance is from the nearest of them (0 inside).
  const easNear = (list, lat, lng, m = 1000, pts = null) => (list || []).filter(e => !eaUnplaced(e))
    .map(e => ({ e, d: Math.min(geomDistM(e.geometry, lat, lng), ...(pts || []).map(([la, ln]) => geomDistM(e.geometry, la, ln))) })).filter(x => x.d <= m).sort((a, b) => a.d - b.d);
  /** EAs not on the map that name the municipality or the whole Region: they may apply to a site. */
  const easMayApply = (list, muni) => (list || []).filter(e => eaUnplaced(e) && (/region-wide/i.test(e.municipality || '') || (muni && inMuni(e.municipality, muni))));
  /**
   * Dated milestones from today to today + days: { e, m, monthOnly }. A month-only date ("2026-11")
   * counts from its month. For "Coming up" and the calendar file.
   */
  function upcoming(list, today, days = 90) {
    const end = new Date(Date.parse(today) + days * 864e5).toISOString().slice(0, 10), month = today.slice(0, 7);
    const out = [];
    for (const e of list || []) for (const m of e.milestones || []) {
      const monthOnly = m.date.length === 7;
      if (monthOnly ? (m.date >= month && m.date <= end.slice(0, 7)) : (m.date >= today && m.date <= end)) out.push({ e, m, monthOnly });
    }
    return out.sort((a, b) => a.m.date.localeCompare(b.m.date) || a.e.name.localeCompare(b.e.name));
  }
  /** Comment or review periods that are open now (their closing date is today or later, within 60 days). */
  const openPeriods = (list, today) => upcoming(list, today, 60).filter(x => !x.monthOnly && (x.m.type === 'commentEnd' || x.m.type === 'reviewEnd'));
  // iCalendar text for dated milestones (all-day events). Month-only dates are left out: no day to put them on.
  function eaICS(items, stamp) {
    const escT = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    // (RFC 5545: 75 octets a line, continued with a space; split between characters, never inside one)
    const octets = ch => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
    const fold = l => { const out = []; let cur = '', n = 0; for (const ch of l) { const b = octets(ch); if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; } cur += ch; n += b; } out.push(cur); return out.join('\r\n '); };
    const day = d => d.replace(/-/g, ''), next = d => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10).replace(/-/g, '');
    const ts = String(stamp || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z';
    const ev = items.filter(x => !x.monthOnly).map(({ e, m }) => ['BEGIN:VEVENT', `UID:${e.id}-${m.type}-${m.date}@peel-growth-pipeline`, `DTSTAMP:${ts}`, `DTSTART;VALUE=DATE:${day(m.date)}`, `DTEND;VALUE=DATE:${next(m.date)}`, `SUMMARY:${escT(`${MS_LABEL[m.type] || m.type}: ${e.name}`)}`, `DESCRIPTION:${escT(`Region of Peel environmental assessment (${EA_STATUS[e.status] || ''}). Times, places and how to comment are on the project page. Unofficial: check with the Region. General screening results only. Peel's W&WW Infrastructure Planning team must validate or confirm all results.`)}`, ...(e.links && e.links.page ? [`URL:${e.links.page}`] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT']);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//peel-growth-pipeline//EA milestones//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Peel EA milestones', ...ev.flat(), 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
  }
  const LOC_NOTE = e => (eaUnplaced(e) ? 'not on the map yet' : eaDashed(e) ? 'approximate location' : '');
  /**
   * Capital › EAs. o: { eas, f (filter), sort, today, thisYear, muni, near: { title, lat, lng, m } | null,
   * checked (pages checked date), screenNote, isPublic }.
   */
  function eaTabHTML(o) {
    const all = o.eas || [], today = o.today, f = o.f || { show: 'current' };
    let scoped = all, where = '';
    if (o.near) { const hits = easNear(all, o.near.lat, o.near.lng, o.near.m, o.near.pts); scoped = hits.map(h => ({ ...h.e, _d: h.d })); where = ` within ${(o.near.m / 1000).toLocaleString('en-CA')} km of ${o.near.edge ? 'the site boundary of ' : ''}${esc(o.near.title)}`; }
    else if (o.muni) { scoped = all.filter(e => inMuni(e.municipality, o.muni) || /region-wide/i.test(e.municipality || '')); where = ` in ${esc(o.muni)}`; }
    const cur = scoped.filter(e => EA_CURRENT.has(e.status)), done = scoped.filter(e => e.status === 'complete');
    const recent = done.filter(e => e.completedYear && e.completedYear >= o.thisYear - RECENT_YEARS);
    const up = upcoming(scoped, today, 90), open = openPeriods(scoped, today), unmapped = scoped.filter(e => eaUnplaced(e) || eaDashed(e));
    // At a site with no current EA nearby, the list opens on All (until a filter is picked).
    const fx = o.near && !o.picked && !cur.length && scoped.length ? { ...f, show: 'all' } : f;
    const list = eaSort(scoped.filter(e => eaMatch(e, fx)), o.sort || 'next');
    const may = o.near ? easMayApply(all, o.near.muni) : [];
    const tile = (n, t, warn) => `<div class="dca-tile${warn ? ' warn' : ''}"><b>${n}</b><span>${t}</span></div>`;
    const chip = (attr, val, on, label) => `<label class="mo-chip"><input type="${attr === 'show' ? 'radio' : 'checkbox'}" name="ea-${attr}" data-eatab-${attr}="${esc(val)}"${on ? ' checked' : ''}><span>${label}</span></label>`;
    const sysOn = k => !(f.sys && f.sys[k] === false);
    const row = e => {
      const loc = LOC_NOTE(e);
      const tail = e.status === 'complete' ? (e.completedYear ? `completed ${e.completedYear}` : 'complete') : e.nextStep ? `next: ${esc(e.nextStep.text)}${e.nextStep.date ? ` · ${esc(fmtDate(e.nextStep.date))}` : ''}` : 'no next step published';
      return `<li class="ea-row"><button type="button" class="btn small link ea-name" data-ce-open="ea:${esc(e.id)}">${esc(e.name)}</button>
        <span class="ea-meta"><span class="ce-sys" aria-hidden="true">${SYS_ICON[e.system] || ''}</span> ${esc(titleCase(e.system))}${e.schedule && e.schedule !== 'unknown' ? ` · ${/plan/i.test(e.schedule) ? 'Master plan' : `Schedule ${esc(e.schedule)}`}` : ''} · ${eaBadge(e.status)}${e.municipality && !o.muni ? ` · ${esc(e.municipality)}` : ''}${e._d != null ? ` · ${e._d < 1 ? 'covers the site' : `${Math.round(e._d / 10) * 10} m away`}` : ''}</span>
        <span class="ea-next small muted">${tail}${loc ? ` · <span class="ce-badge ce-approx">${loc}</span>` : ''}${e.links && e.links.report ? ` · <a href="${esc(e.links.report.url)}" target="_blank" rel="noopener">Report ↗</a>` : ''}</span></li>`;
    };
    const upRow = ({ e, m, monthOnly }) => `<li><span class="ea-up-d">${esc(fmtDate(m.date))}${monthOnly ? ' <small class="muted">(month)</small>' : ''}</span> <span>${esc(MS_LABEL[m.type] || m.type)}: <button type="button" class="btn small link" data-ce-open="ea:${esc(e.id)}">${esc(e.name)}</button></span></li>`;
    // EAs not on the map yet that name the site's municipality or the whole Region: listed apart.
    const mayHTML = may.length ? `<section class="ce-sec ea-may" data-sec="may-apply"><h3 class="sub-title">May apply <small class="muted">not on the map yet · ${may.length}</small></h3><ul class="ea-list">${may.map(row).join('')}</ul>
      <p class="small muted">These name ${esc(o.near.muni || 'the municipality')} or the whole Region but have no mapped study area, so they can't be checked against the site.</p></section>` : '';
    if (o.near && !scoped.length) return `<p class="small">No environmental assessments mapped${where}.</p>${mayHTML}<p class="small muted">EAs placed only approximately or not yet mapped are not checked against the site.</p>${o.screenNote || ''}`;
    return `<p class="small">Region of Peel environmental assessments${where}: ${scoped.length} listed${o.checked ? `, project pages checked ${esc(fmtDate(o.checked))}` : ''}. Tap one to open it and see it on the map.</p>
      <div class="dca-sum ea-tiles">${tile(cur.length, 'current (commenced, in consultation, under review or in addendum)')}${tile(up.length, 'milestones in the next 90 days')}${tile(open.length, `comment or review period${open.length === 1 ? '' : 's'} open now`, open.length > 0)}${tile(recent.length, `completed ${o.thisYear - RECENT_YEARS} or later`)}</div>
      ${mayHTML}
      <section class="ce-sec" data-sec="coming-up"><h3 class="sub-title">Coming up <small class="muted">next 90 days</small></h3>${up.length ? `<ul class="ea-up">${up.map(upRow).join('')}</ul>` : '<p class="small muted">No dated milestones in the next 90 days.</p>'}
        <p class="small"><button type="button" class="btn small" data-eatab-ics${up.some(x => !x.monthOnly) ? '' : ' disabled'}>Add to calendar (.ics)</button> <span class="muted">dated meetings and deadlines in the next 90 days; times and places are on each project page</span></p></section>
      <section class="ce-sec" data-sec="list"><h3 class="sub-title">All EAs <small class="muted">${list.length} shown</small></h3>
        <div class="ea-tools"><input type="search" class="ea-q" data-eatab-q value="${esc(f.q || '')}" placeholder="Search name, place or purpose" aria-label="Search the EAs">
          <div class="mo-chips" role="radiogroup" aria-label="Which EAs">${[['current', `Current (${cur.length})`], ['complete', `Complete (${done.length})`], ['all', `All (${scoped.length})`]].map(([k, t]) => chip('show', k, (fx.show || 'current') === k, t)).join('')}</div>
          <div class="mo-chips" aria-label="Systems">${EA_SYS.map(([k, t]) => chip('sys', k, sysOn(k), t)).join('')}</div>
          <label class="small ea-sort">Sort <select data-eatab-sort aria-label="Sort the EAs">${EA_SORTS.map(([k, t]) => `<option value="${k}"${(o.sort || 'next') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>
        ${list.length ? `<ul class="ea-list">${list.map(row).join('')}</ul>` : '<p class="small muted">No EAs match these filters.</p>'}
        <p class="small ea-out"><button type="button" class="btn small" data-eatab-csv>CSV</button> <button type="button" class="btn small" data-eatab-geo>GeoJSON</button> <button type="button" class="btn small" data-eatab-map>Show these on the map</button>${unmapped.length ? ` <span class="muted">${unmapped.length} with an approximate or no mapped location</span>` : ''}</p></section>
      ${o.screenNote || ''}`;
  }

  // ---- Exports: Capital and EA sheets for the workbook, GeoJSON for both layers (no people) ----------
  const CAP_COLS = ['Project number(s)', 'Work type', 'Street', 'From', 'To', 'Municipality', 'Ward', 'Status', '% built', 'Tender target', 'Tender actual', 'Award target', 'Award actual', 'Start target', 'Start actual', 'Substantial completion target', 'Substantial completion actual', 'Length (m)', 'Project page', 'As of'];
  function capitalSheetRows(contracts) {
    const rows = [...(contracts || new Map()).values()].map(c => { const r = c.lead; return [c.projectNumbers.join(', '), workLabel(r.workType), titleCase(r.street || ''), titleCase(r.from || ''), titleCase(r.to || ''), titleCase(r.municipality || ''), r.ward || '', statusLabel(c.status), c.percent != null ? c.percent : '', r.tenderTarget || '', r.tenderActual || '', r.awardTarget || '', r.awardActual || '', r.startTarget || '', r.startActual || '', r.substantialTarget || '', r.substantialActual || '', Math.round(c.lengthM || 0), r.website || '', c.lastUpdate || '']; });
    return { cols: CAP_COLS, rows };
  }
  const EA_COLS = ['Name', 'System', 'Municipality', 'Schedule', 'Status', 'Milestones', 'Next step', 'Completed', 'Decision (from the report; check it)', 'Linked capital projects', 'Project page', 'Report', 'Location method', 'Location confidence', 'Page checked'];
  function eaSheetRows(eas) {
    const rows = (eas || []).map(e => [e.name, titleCase(e.system || ''), e.municipality || '', e.schedule || '', EA_STATUS[e.status] || EA_STATUS.unknown, (e.milestones || []).map(m => `${MS_LABEL[m.type] || m.type} ${m.date}`).join('; '), e.nextStep ? `${e.nextStep.text}${e.nextStep.date ? ` (${e.nextStep.date})` : ''}` : '', e.completedYear || '', (e.decision && e.decision.text) || e.decision || '', [...new Set(((e.related && e.related.capitalProjects) || []).map(c => c.projectNumber).filter(Boolean))].join('; '), (e.links && e.links.page) || '', (e.links && e.links.report && e.links.report.url) || '', e.geomMethod || 'not placed', e.geomConfidence || '', e.lastChecked || '']);
    return { cols: EA_COLS, rows };
  }
  // props: extra collection properties (the disclaimer, screening note).
  function capitalGeoJSON(records, props = {}) {
    return { type: 'FeatureCollection', properties: { source: 'Region of Peel capital projects layer', ...props }, features: (records || []).filter(r => r.geometry).map(r => ({ type: 'Feature', geometry: r.geometry, properties: { projectNumber: r.projectNumber || null, workType: workLabel(r.workType), system: r.system, street: r.street || null, from: r.from || null, to: r.to || null, municipality: r.municipality || null, ward: r.ward || null, status: r.status, percentComplete: r.percentComplete != null ? r.percentComplete : null, tenderTarget: r.tenderTarget || null, tenderActual: r.tenderActual || null, awardTarget: r.awardTarget || null, awardActual: r.awardActual || null, startTarget: r.startTarget || null, startActual: r.startActual || null, substantialTarget: r.substantialTarget || null, substantialActual: r.substantialActual || null, lengthM: r.lengthM || null, website: r.website || null, lastUpdate: r.lastUpdate || null } })) };
  }
  function easGeoJSON(eas, props = {}) {
    return { type: 'FeatureCollection', properties: { source: 'Region of Peel environmental assessments (list and project pages)', ...props }, features: (eas || []).filter(e => e.geometry).map(e => ({ type: 'Feature', geometry: e.geometry, properties: { name: e.name, system: e.system, municipality: e.municipality || null, schedule: e.schedule || null, status: e.status, completedYear: e.completedYear || null, page: (e.links && e.links.page) || null, locationMethod: e.geomMethod || null, locationConfidence: e.geomConfidence || null, approximate: eaDashed(e) } })) };
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
    EA_OUTLINE_ZOOM, eaStyle, labelPoint, pctLabel, SYS_CASING,
    eaReview, capitalSheetRows, eaSheetRows, capitalGeoJSON, easGeoJSON, CAP_COLS, EA_COLS,
    eaScopeHTML, capitalScopeHTML, capitalHover, eaHover, watchBtn,
    dcCapitalIndex, dcActualHTML, eaMatch, eaSort, geomDistM, easNear, easMayApply, upcoming, openPeriods, eaICS, eaTabHTML, EA_SYS, activeConstruction, currentEAs, recentEAs, RECENT_YEARS, listsHTML, easForDc, easForDcHTML, weekItems, weekHTML, watchRows, attentionItems,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelCapitalEAModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
