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
  // (as capTag elsewhere: a match by outline overlap only (low confidence) is not trusted, nor a
  // "complete" status for a work the DC schedule puts after this year; y: that year)
  function dcActualHTML(entry0, hasCapital, y, thisYear = new Date().getFullYear()) {
    if (!hasCapital) return '';
    const entry = entry0 && entry0.conf !== 'low' && !(/complete/.test(entry0.status || '') && y > thisYear) ? entry0 : null;
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
    // To check (o.watch: watchList items): the records that need a look, before the list of active work.
    const watchSec = o.watch ? `<section class="ce-sec" data-sec="watch"><h3 class="sub-title">To check <small class="muted">${o.watch.length}</small></h3>${watchListHTML(o.watch, { all: o.allWatch })}</section>` : '';
    return `<p class="small">Region capital projects${where}: what is being built and where it is at.${o.capitalAsOf ? ` Capital projects as of ${esc(fmtDate(o.capitalAsOf))}.` : ''} Environmental assessments are on <button type="button" class="btn small link" data-ce-goto="eas">Capital › EAs</button>.</p>
      ${watchSec}
      <section class="ce-sec" data-sec="active"><h3 class="sub-title">Active construction <small class="muted">${act.length}</small></h3>${capSec}${o.hasCapital ? `<p class="small"><button type="button" class="btn small" data-ce-cap-csv>CSV: every contract${where}, one row each</button> <span class="muted">status, % built, days past target, last update, the EA and DC project it came from</span></p>` : ''}</section>
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

  // ---- EA to construction (Capital › EAs; the EAs page) -------------------------------------------
  // Each EA, from commencement to the construction that follows it. A contract linked to an EA is its
  // outcome only if it starts after the EA is complete (or, for an EA still under way, after its
  // expected report): construction never starts before the EA that decides it. Work that started
  // before or during the EA is other work in its study area (kept, shown apart). A strong link (the
  // EA's own project page) that starts before the EA is a date conflict to check. With only the EA's
  // completion year, the comparison is by year (the same year counts as following it).
  const LINK_STRENGTH = { 'project website': 3, 'inside the study area': 2, 'street + study area': 1 };
  const msOf = s => { if (!s) return null; const t = String(s); const v = Date.parse(t.length === 4 ? `${t}-07-01` : t.length === 7 ? `${t}-15` : t); return isFinite(v) ? v : null; };
  const yearOfMs = v => (v == null ? null : new Date(v).getUTCFullYear());
  function eaDates(e) {
    const ms = (e.milestones || []).map(m => ({ type: m.type, at: msOf(m.date), date: m.date })).filter(m => m.at != null).sort((a, b) => a.at - b.at);
    const start = ms[0] ? ms[0].at : null;
    const done = ms.filter(m => m.type === 'completion').pop();
    const complete = e.status === 'complete' || e.status === 'addendum';
    // Completion: the notice of completion's date, else the year completed (read from the page).
    const completion = complete ? (done ? { at: done.at, exact: String(done.date).length > 4, year: yearOfMs(done.at) } : e.completedYear ? { at: msOf(String(e.completedYear)), exact: false, year: +e.completedYear } : null) : null;
    // An EA under way: the latest report, completion or review-end date ahead.
    const ahead = complete ? null : ms.filter(m => ['report', 'completion', 'reviewEnd'].includes(m.type)).pop() || null;
    return { start, pics: ms.filter(m => m.type === 'pic').map(m => m.at), completion, expected: ahead ? { at: ahead.at, year: yearOfMs(ahead.at) } : null, complete };
  }
  function contractSpans(links, byId) {
    const by = new Map();
    for (const l of links || []) {
      const r = byId.get(l.id); if (!r) continue;
      const k = r.contract || r.projectNumber || r.id;
      if (!by.has(k)) by.set(k, { key: k, records: [], strength: 0, method: l.method });
      const c = by.get(k); c.records.push(r);
      if ((LINK_STRENGTH[l.method] || 0) > c.strength) { c.strength = LINK_STRENGTH[l.method] || 0; c.method = l.method; }
    }
    return [...by.values()].map(c => {
      const act = c.records.map(r => msOf(r.startActual)).filter(v => v != null), tgt = c.records.map(r => msOf(r.startTarget)).filter(v => v != null);
      const ends = c.records.map(r => msOf(r.substantialActual) || msOf(r.substantialTarget)).filter(v => v != null);
      const lead = c.records.slice().sort((a, b) => RANK.indexOf(b.status) - RANK.indexOf(a.status))[0];
      return { key: c.key, method: c.method, strength: c.strength, start: act.length ? Math.min(...act) : tgt.length ? Math.min(...tgt) : null, startActual: act.length > 0,
        end: ends.length ? Math.max(...ends) : null, status: lead.status, work: workLabel(lead.workType), street: lead.street || '', projectNumbers: [...new Set(c.records.map(r => r.projectNumber).filter(Boolean))], website: lead.website || null };
    });
  }
  // 'outcome' | 'other' | 'conflict' | 'unknown' (no start date, or a completed EA with no completion date).
  function classifyLink(d, c) {
    if (c.start == null) return 'unknown';
    const before = ref => (ref.exact === false ? yearOfMs(c.start) < ref.year : c.start < ref.at);
    if (d.complete) {
      if (!d.completion) return 'unknown';
      if (!before(d.completion)) return 'outcome';
      return c.strength >= 3 ? 'conflict' : 'other';
    }
    // Under way: work already started (or due before the expected report) is not its outcome.
    if (d.expected && !before({ at: d.expected.at, year: d.expected.year, exact: true })) return 'outcome';
    if (!d.expected && !c.startActual) return 'unknown';
    return c.strength >= 3 ? 'conflict' : 'other';
  }
  const BUCKETS = [
    ['limit', 'Waiting 9+ years', 'completed 9 or more years ago with no construction: past 10 years, the Class EA must be reviewed before construction'],
    ['waiting', 'Complete, waiting for construction', 'no construction has followed yet'],
    ['planned', 'Construction planned', 'construction that follows it is scheduled'],
    ['building', 'Under construction', 'construction that follows it is under way'],
    ['built', 'Built', 'the construction that followed it is complete'],
    ['current', 'EA under way', 'the study is still in progress'],
    ['nodate', 'Complete, date unknown', 'no completion date, so construction can’t be ordered against it'],
  ];
  function eaProgress(eas, capital, today = Date.now()) {
    const byId = new Map(((capital && capital.records) || capital || []).map(r => [r.id, r]));
    const thisYear = new Date(today).getUTCFullYear();
    return (eas || []).map(e => {
      const d = eaDates(e), cs = contractSpans((e.related && e.related.capitalProjects) || [], byId);
      for (const c of cs) c.cls = classifyLink(d, c);
      const out = cs.filter(c => c.cls === 'outcome');
      let bucket;
      if (!d.complete) bucket = 'current';
      else if (!d.completion) bucket = out.length ? 'planned' : 'nodate';
      else if (out.some(c => BUILDING.has(c.status) || c.status === 'substantially complete')) bucket = 'building';
      else if (out.length && out.every(c => c.status === 'complete' || c.status === 'substantially complete')) bucket = 'built';
      else if (out.length) bucket = 'planned';
      else { const yrs = thisYear - d.completion.year; bucket = yrs >= 9 ? 'limit' : 'waiting'; }
      return { e, d, contracts: cs, outcome: out, other: cs.filter(c => c.cls === 'other'), conflict: cs.filter(c => c.cls === 'conflict'), unknown: cs.filter(c => c.cls === 'unknown'), bucket,
        yearsSince: d.completion ? thisYear - d.completion.year : null };
    });
  }
  // One row of the timeline: the EA's span and its outcomes, as fractions of [from, to].
  function timelineRow(x, from, to) {
    const f = v => Math.max(0, Math.min(1, (v - from) / (to - from)));
    const eaEnd = x.d.completion ? x.d.completion.at : x.d.expected ? x.d.expected.at : null;
    return { ea: x.d.start != null || eaEnd != null ? { a: f(x.d.start != null ? x.d.start : eaEnd), b: f(eaEnd != null ? eaEnd : Date.now()), open: eaEnd == null } : null,
      pics: x.d.pics.map(f), done: x.d.completion ? f(x.d.completion.at) : null, expected: x.d.expected ? f(x.d.expected.at) : null,
      works: x.outcome.filter(c => c.start != null).map(c => ({ a: f(c.start), b: f(c.end != null ? Math.max(c.end, c.start) : c.start + 365 * 864e5), status: c.status, planned: !c.startActual })) };
  }
  // The timeline (rows from eaProgress); open(x): each row's attributes, what a tap opens (the EA on the map).
  function eaTimelineHTML(rows, open, today = Date.now()) {
    if (!rows.length) return '';
    const y0 = Math.max(2008, Math.min(...rows.map(x => x.d.start).filter(v => v != null).map(v => new Date(v).getUTCFullYear()), new Date(today).getUTCFullYear() - 10));
    const y1 = new Date(today).getUTCFullYear() + 6, from = Date.UTC(y0, 0, 1), to = Date.UTC(y1, 0, 1);
    const pct = v => `${(v * 100).toFixed(2)}%`;
    const ticks = []; for (let y = Math.ceil(y0 / 5) * 5; y < y1; y += 5) ticks.push(`<span class="eat-tick" style="left:${pct((Date.UTC(y, 0, 1) - from) / (to - from))}">${y}</span>`);
    const nowAt = pct((today - from) / (to - from));
    const line = x => {
      const t = timelineRow(x, from, to), parts = [];
      if (t.ea) parts.push(`<span class="eat-ea${t.ea.open ? ' open' : ''}" style="left:${pct(t.ea.a)};width:${pct(Math.max(0.004, t.ea.b - t.ea.a))}"></span>`);
      for (const p of t.pics) parts.push(`<span class="eat-pic" style="left:${pct(p)}" title="Public information centre"></span>`);
      if (t.done != null) parts.push(`<span class="eat-done" style="left:${pct(t.done)}" title="EA complete ${esc(String(x.d.completion.year))}"></span>`);
      else if (t.expected != null) parts.push(`<span class="eat-exp" style="left:${pct(t.expected)}" title="Report expected ${esc(String(x.d.expected.year))}"></span>`);
      for (const w of t.works) parts.push(`<span class="eat-w eat-w-${esc(w.status.replace(/\s+/g, '-'))}${w.planned ? ' planned' : ''}" style="left:${pct(w.a)};width:${pct(Math.max(0.006, w.b - w.a))}"></span>`);
      return `<li class="eat-row" ${Object.entries(open(x)).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')} tabindex="0" role="button"><span class="eat-nm">${esc(x.e.name)}<small>${esc(x.e.municipality || 'Peel')} · ${esc((BUCKETS.find(b => b[0] === x.bucket) || [])[1] || '')}</small></span><span class="eat-track">${parts.join('')}<span class="eat-now" style="left:${nowAt}"></span></span></li>`;
    };
    return `<h3 class="pnl-chart-t">Each EA and the construction after it <span class="pnl-chart-u">(${y0}–${y1})</span></h3>
      <div class="eat-axis" aria-hidden="true"><span class="eat-nm"></span><span class="eat-track">${ticks.join('')}</span></div>
      <ul class="eat" aria-label="EA timelines">${rows.map(line).join('')}</ul>
      <p class="small muted eat-key"><span class="eat-k eat-ea"></span> EA study <span class="eat-k eat-pic"></span> public information centre <span class="eat-k eat-done"></span> EA complete <span class="eat-k eat-exp"></span> report expected <span class="eat-k eat-w eat-w-under-construction"></span> construction <span class="eat-k eat-w planned"></span> planned <span class="eat-k eat-now"></span> today</p>`;
  }
  // EA to construction (navigation phase 4: one builder for Capital › EAs' fold and full table and the EAs page):
  // o = { eas, capital (its records), muni, today, open(x): a row's attributes } → { all, answer, figures, chart,
  // lists, folds, method, sources }. Construction counts as the EA's outcome only when it starts on or after the
  // EA's completion (the year, where only the year is known); earlier work in the study area is listed as other
  // work, never as following the EA (eaProgress).
  const num = n => (n == null ? '' : Number(n).toLocaleString('en-CA'));
  const yrOf = v => (v == null ? '' : String(new Date(v).getUTCFullYear()));
  const workLine = c => `${esc(c.work || 'Construction')}${c.street ? ` · ${esc(c.street)}` : ''} <small>${esc(c.status)}${c.start != null ? `, ${c.startActual ? 'started' : 'starts'} ${yrOf(c.start)}` : ''}</small>`;
  function eaFlowSpec(o) {
    const { eas = [], capital = [], muni = null, today = Date.now(), open } = o || {};
    const all = eaProgress(eas, capital, today).filter(x => !muni || !x.e.municipality || x.e.municipality === 'Region-wide' || x.e.municipality.split(' / ').includes(muni));
    const by = k => all.filter(x => x.bucket === k), n = k => by(k).length;
    const followed = all.filter(x => ['planned', 'building', 'built'].includes(x.bucket));
    const waiting = [...by('limit'), ...by('waiting')].sort((a, b) => a.d.completion.at - b.d.completion.at);
    const current = by('current').sort((a, b) => (a.d.expected ? a.d.expected.at : 9e15) - (b.d.expected ? b.d.expected.at : 9e15));
    const conflicts = all.filter(x => x.conflict.length);
    // (a report date already past on an EA still under way: the page has not been updated, or the EA is late)
    const now0 = today, nextRep = current.find(x => x.d.expected && x.d.expected.at >= now0), pastDue = current.filter(x => x.d.expected && x.d.expected.at < now0).length;
    // Current construction near a past EA that the weekly build hasn't linked (never counted as following it).
    const inMuni = x => !muni || !x.e.municipality || x.e.municipality.split(' / ').includes(muni);
    const possible = possibleLinks(eas, capital, today).filter(inMuni);
    // Construction starting 10+ years after the EA was complete: the Class EA may need a review first.
    const gapOf = (x, c) => (x.d.completion && c.start != null ? new Date(c.start).getUTCFullYear() - x.d.completion.year : null);
    const gapNote = g => (g != null && g >= 10 ? ` <span class="pnl-chip t-tight">${num(g)} years after the EA</span>` : '');
    const late = [...followed.flatMap(x => x.outcome.map(c => gapOf(x, c))), ...possible.map(p => gapOf(p, p.c))].filter(g => g != null && g >= 10).length;
    const done = all.length - n('current');
    // (each count says its own measure: Capital › EAs, beside it, counts an addendum as current and an EA with
    // no status published as neither; here an addendum's EA is complete and one with no status is under way)
    const addenda = all.filter(x => x.e.status === 'addendum').length, noStatus = by('current').filter(x => !EA_CURRENT.has(x.e.status)).length;
    const answer = !all.length ? 'No Region EAs in this area.'
      : `Of <strong>${num(done)}</strong> completed EA${done === 1 ? '' : 's'}${addenda ? ` (${num(addenda)} with an addendum under way)` : ''}, <strong>${num(followed.length)}</strong> ${followed.length === 1 ? 'has' : 'have'} construction that started after the EA was complete, <strong>${num(waiting.length)}</strong> ${waiting.length === 1 ? 'is' : 'are'} waiting for construction${n('limit') ? ` (${num(n('limit'))} for 9 years or more)` : ''}, and <strong>${num(n('nodate'))}</strong> ${n('nodate') === 1 ? 'has' : 'have'} no completion date yet. <strong>${num(n('current'))}</strong> ${n('current') === 1 ? 'is' : 'are'} under way${noStatus ? ` (${num(noStatus)} with no status published)` : ''}.${possible.length ? ` <strong>${num(possible.length)}</strong> current construction contract${possible.length === 1 ? ' lies' : 's lie'} near a past EA without a link: possible links to check.` : ''}${late ? ` <strong>${num(late)}</strong> contract${late === 1 ? ' starts' : 's start'} 10 or more years after ${late === 1 ? 'its' : 'their'} EA: check the EA was reviewed (a Class EA rule).` : ''}`;
    const row = (x, right) => ({ attrs: open(x), html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.e.name)}<small>${esc(x.e.municipality || 'Peel')}</small></span><span class="pnl-r-fig">${right}</span></div>` });
    const chartRows = [...followed, ...waiting].sort((a, b) => (a.d.completion ? a.d.completion.at : 9e15) - (b.d.completion ? b.d.completion.at : 9e15));
    const others = all.filter(x => x.other.length);
    const unknown = by('nodate');
    return { all, answer,
      figures: [
        { v: num(followed.length), u: 'EAs', label: 'construction followed', ctx: `${num(n('building'))} under construction · ${num(n('planned'))} planned · ${num(n('built'))} built` },
        { v: num(waiting.length), u: 'EAs', label: 'complete, no construction yet', ctx: waiting.length ? `oldest completed ${esc(String(waiting[0].d.completion.year))}` : '', tone: n('limit') ? 'tight' : null },
        { v: num(n('current')), u: 'EAs', label: 'under way', ctx: [nextRep ? `next report expected ${esc(String(nextRep.d.expected.year))}` : '', pastDue ? `${num(pastDue)} past their report date` : '', noStatus ? `${num(noStatus)} with no status published` : ''].filter(Boolean).join(' · ') },
        { v: num(n('nodate')), u: 'EAs', label: 'completion date unknown', ctx: 'construction can’t be ordered against them yet' },
      ],
      chart: eaTimelineHTML(chartRows, open, today),
      lists: [
        { title: 'Complete, waiting for construction (oldest first)', rows: waiting.map(x => row(x, `${esc(String(x.d.completion.year))}<small>${num(x.yearsSince)} year${x.yearsSince === 1 ? '' : 's'} ago${x.yearsSince >= 10 ? ' · review needed before construction' : x.bucket === 'limit' ? ' · near 10 years' : ''}</small>`)), total: waiting.length, all: true },
        { title: 'Construction that followed an EA', rows: followed.flatMap(x => x.outcome.map(c => ({ attrs: open(x), html: `<div class="pnl-r-top"><span class="pnl-r-name">${workLine(c)}${gapNote(gapOf(x, c))}<small>after ${esc(x.e.name)} (complete ${esc(String(x.d.completion ? x.d.completion.year : '?'))})</small></span></div>` }))), total: followed.length, all: true },
        { title: 'Possible links to check: current construction near a past EA', rows: possible.map(x => ({ attrs: open(x), html: `<div class="pnl-r-top"><span class="pnl-r-name">${workLine(x.c)}${gapNote(gapOf(x, x.c))}<small>near ${esc(x.e.name)}${x.d.completion ? ` (complete ${esc(String(x.d.completion.year))})` : ''} · ${esc(x.why.join(' · '))}</small></span></div>` })), total: possible.length, all: true },
        { title: 'EAs under way (by expected report)', rows: current.map(x => row(x, x.d.expected ? `${esc(String(x.d.expected.year))}<small>${x.d.expected.at < now0 ? 'report was due' : 'report expected'}</small>` : '<small>no report date yet</small>')), total: current.length },
      ],
      folds: [
        others.length ? { title: `Other work in the study areas (${num(others.reduce((t, x) => t + x.other.length, 0))}): started before the EA was complete, so not counted as following it`, html: `<ul class="small">${others.map(x => `<li><strong>${esc(x.e.name)}</strong>${x.d.completion ? ` (EA complete ${esc(String(x.d.completion.year))})` : x.d.expected ? ` (report expected ${esc(String(x.d.expected.year))})` : ''}: ${x.other.map(workLine).join('; ')}</li>`).join('')}</ul>` } : null,
        unknown.length ? { title: `Completion date unknown (${num(unknown.length)})`, html: `<p class="small muted">The EA’s page, notice and report don’t give a completion year yet, so linked construction can’t be ordered against it.</p><ul class="small">${unknown.map(x => `<li>${esc(x.e.name)} <span class="muted">· ${esc(x.e.municipality || 'Peel')}${x.contracts.length ? ` · ${num(x.contracts.length)} linked contract${x.contracts.length === 1 ? '' : 's'}` : ''}</span></li>`).join('')}</ul>` } : null,
        conflicts.length ? { title: `Date conflicts to check (${num(conflicts.length)})`, open: true, html: `<p class="small muted">The project’s own page links this construction to the EA, but it started before the EA was complete. One of the dates may be wrong.</p><ul class="small">${conflicts.map(x => `<li><strong>${esc(x.e.name)}</strong> (EA complete ${esc(String(x.d.completion ? x.d.completion.year : x.d.expected ? x.d.expected.year : '?'))}): ${x.conflict.map(workLine).join('; ')}</li>`).join('')}</ul>` } : null,
      ],
      method: 'Each Region Class EA (Water, Wastewater and Roads) from its project page, with the capital projects linked to it (by the project’s own page, inside the study area, or by street inside the study area). Construction counts as following the EA only when it starts on or after the EA was complete; where only the year is known, a start in the same year counts. For an EA under way, only construction due after the expected report counts. Earlier work in the study area is listed as other work. The completion year comes from, in order: the notice of completion, the report filing date, the page’s wording, the report’s cover, the report’s file name. Under the Municipal Class EA, when more than 10 years pass between the notice of completion and the start of construction, the EA must be reviewed (and an addendum filed if anything changed) before construction: waiting EAs past 10 years and construction starting 10 or more years after its EA are flagged to check; the app can’t see whether that review was done. Possible links: planned or active contracts of the same system and municipality, mostly within 250 m of a completed EA’s study area (500 m of a facility), starting after the EA was complete, that the weekly build has not linked; repairs, relining, resurfacing and developer-built works are left out, Region-wide studies are left out, and a study area placed with low confidence needs the street named in the EA as well. They are listed to check and never counted as following the EA. The start date is the actual start where recorded, else the target start. An EA with an addendum counts as complete here (Capital › EAs counts it as current), and one with no status published as under way.',
      sources: 'Region of Peel EA project pages and their notices and reports (weekly build, scripts/build-eas.js); Region of Peel capital project and construction pages (data/capital.json).' };
  }

  // ---- Possible links: current construction near a past EA, not yet linked to it ----------------------
  // For each completed EA, planned or active capital contracts that may be its outcome: the same system,
  // the same municipality, mostly within 250 m of the study area (500 m of a facility), starting after the
  // EA was complete, and not linked by the weekly build. Region-wide studies (master plans) are left out:
  // everything lies near them. A study area placed with low confidence needs the street named in the EA
  // as well. Possible links are listed to check; they never count as the EA's outcome.
  const STREET_SUFFIX = new Set(['ROAD', 'RD', 'STREET', 'ST', 'DRIVE', 'DR', 'AVENUE', 'AVE', 'AV', 'BOULEVARD', 'BLVD', 'LINE', 'SIDEROAD', 'SDRD', 'COURT', 'CRT', 'CT', 'CRESCENT', 'CRES', 'PARKWAY', 'PKWY', 'TRAIL', 'TRL', 'HIGHWAY', 'HWY', 'HY', 'WAY', 'LANE', 'GATE', 'PLACE', 'PL', 'N', 'S', 'E', 'W', 'NORTH', 'SOUTH', 'EAST', 'WEST', 'THE']);
  const streetCore = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(t => t && !STREET_SUFFIX.has(t));
  function sameStreetAs(street, text) { const a = streetCore(street); if (!a.length) return false; const b = new Set(streetCore(text)); return a.every(t => b.has(t)); }
  const ptsOf = g => (!g ? [] : g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' || g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' || g.type === 'Polygon' ? g.coordinates.flat() : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : []);
  function insideRing(x, y, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
  // Metres from a point to a geometry (0 inside a polygon), on a local flat projection.
  function metresTo(p, g) {
    if (g.type === 'Polygon' && insideRing(p[0], p[1], g.coordinates[0])) return 0;
    if (g.type === 'MultiPolygon' && g.coordinates.some(q => insideRing(p[0], p[1], q[0]))) return 0;
    const kx = 111320 * Math.cos(p[1] * Math.PI / 180), ky = 110540;
    const paths = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' || g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : ptsOf(g).map(q => [q]);
    let best = Infinity;
    for (const path of paths) for (let i = 0; i < path.length; i++) {
      const ax = (path[i][0] - p[0]) * kx, ay = (path[i][1] - p[1]) * ky;
      if (i === 0 || path.length === 1) { best = Math.min(best, Math.hypot(ax, ay)); if (path.length === 1) continue; }
      if (i === 0) continue;
      const bx = (path[i - 1][0] - p[0]) * kx, by = (path[i - 1][1] - p[1]) * ky, dx = ax - bx, dy = ay - by, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, -(bx * dx + by * dy) / L)) : 0;
      best = Math.min(best, Math.hypot(bx + t * dx, by + t * dy));
    }
    return best;
  }
  const ACTIVE_WORK = new Set(['planned', 'tendered', 'awarded', 'under construction']);
  // Repairs and renewals (relining, trenchless rehabilitation, inlet repair, resurfacing, noise walls),
  // developer-built works and EA studies are not what an EA leads to.
  const NOT_EA_WORK = /RELINING|TRENCHLESS|INLET|RESURFAC|NOISEWALL|DEVELOPMENT|EA STUDY|MAINTENANCE/i;
  const systemFits = (e, r) => (e.system === 'roads' ? r.system === 'roads' && !/STORM/i.test(r.workType || '') : e.system === 'storm' ? /STORM/i.test(r.workType || '')
    : e.system === 'multi' ? r.system === 'water' || r.system === 'wastewater' : r.system === e.system);
  function possibleLinks(eas, capital, today = Date.now()) {
    const recs = (capital && capital.records) || capital || [], byId = new Map(recs.map(r => [r.id, r]));
    const groups = new Map();
    for (const r of recs) {
      if (!ACTIVE_WORK.has(r.status) || !r.geometry || NOT_EA_WORK.test(r.workType || '') || NOT_EA_WORK.test(r.phase || '')) continue;
      const k = r.contract || r.projectNumber || r.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r);
    }
    const out = [];
    for (const e of eas || []) {
      if (!(e.status === 'complete' || e.status === 'addendum') || !e.geometry || e.municipality === 'Region-wide') continue;
      const d = eaDates(e), munis = String(e.municipality || '').toUpperCase().split(' / ').map(s => s.trim());
      const linked = new Set(((e.related && e.related.capitalProjects) || []).map(l => { const r = byId.get(l.id); return r ? r.contract || r.projectNumber || r.id : null; }));
      const tol = /Point/.test(e.geometry.type) ? 500 : 250;
      for (const [k, all] of groups) {
        const rs = all.filter(r => systemFits(e, r)), r0 = rs[0];
        if (!r0 || linked.has(k)) continue;
        if (r0.municipality && !String(r0.municipality).toUpperCase().split('/').some(m => munis.includes(m.trim()))) continue;
        const street = rs.some(r => sameStreetAs(r.street, e.name));
        if (e.geomConfidence === 'low' && !street) continue;
        const pts = rs.flatMap(r => ptsOf(r.geometry)); if (!pts.length) continue;
        const ds = pts.map(p => metresTo(p, e.geometry)), near = ds.filter(m => m <= tol).length;
        if (near < pts.length / 2) continue;
        const c = contractSpans(rs.map(r => ({ id: r.id, method: 'possible' })), byId)[0];
        const cls = classifyLink(d, { ...c, strength: 0 });
        if (cls === 'other') continue;                       // started before the EA was complete
        const inside = ds.filter(m => m === 0).length >= pts.length / 2;
        out.push({ e, d, c, street, inside, metres: Math.round(Math.min(...ds)), dateChecked: cls === 'outcome',
          why: [street ? 'on a street named in the EA' : null, inside ? 'inside the study area' : `within ${tol} m of the study area`, `same system (${r0.system})`, cls === 'outcome' ? 'starts after the EA was complete' : 'EA completion date unknown: order not checked'].filter(Boolean) });
      }
    }
    return out.sort((a, b) => (b.street - a.street) || (b.inside - a.inside) || a.e.name.localeCompare(b.e.name));
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

  // ---- For the people who use the outputs: the site brief, the watch list, the per-contract CSV -------
  // Screening wording throughout: what the records show and what to check, never what the Region should
  // do. Dates compare as day strings (YYYY-MM-DD); a month-only date counts from the 15th (msOf).
  const daysFrom = (a, b) => (msOf(a) == null || msOf(b) == null ? null : Math.round((msOf(b) - msOf(a)) / 864e5));
  /** "45 days" · "7 months" · "3 years": how long ago, in plain words. */
  function ago(days) {
    if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
    const mo = Math.round(days / 30.44);
    return mo < 24 ? `${mo} months` : `${Math.floor(mo / 12)} years`;
  }
  const WARD_MUNI = { M: 'Mississauga', B: 'Brampton', C: 'Caledon' };
  /** Where the work is: its ward's municipality (M01 → Mississauga), else the published field (which can name several). */
  const placeOf = r => WARD_MUNI[String(r.ward || '').charAt(0).toUpperCase()] || titleCase(r.municipality || '');
  const STALE_DAYS = 365, DORMANT_DAYS = 548;   // a year with no update; 18 months with no EA milestone
  const OPEN_WORK = new Set(['planned', 'tendered', 'awarded', 'under construction', 'unknown']);
  /** Year the contract's open work is in service (its latest substantial completion, actual or target). */
  // (complete work: the year it finished)
  const contractInService = c => { const rs = ACTIVE_WORK.has(c.status) ? c.records.filter(r => ACTIVE_WORK.has(r.status)) : c.records, ys = rs.map(inServiceYear).filter(Boolean); return ys.length ? Math.max(...ys) : null; };
  /**
   * What to check on a contract. overdue: tendered, awarded or under construction with a substantial
   * completion target before today and no actual (days past the target). stale: still open and not
   * updated in the year before the layer's latest update (asOf), or never dated. progress: the % built
   * reported, else for work under construction and not yet past its target the share of its start →
   * target span elapsed (estimated).
   */
  function contractCheck(c, today, asOf) {
    const late = !BUILDING.has(c.status) ? [] : c.records.filter(r => BUILDING.has(r.status) && r.substantialTarget && !r.substantialActual)
      .map(r => ({ target: r.substantialTarget, days: daysFrom(r.substantialTarget, today) })).filter(x => x.days > 0).sort((a, b) => b.days - a.days);
    const age = c.lastUpdate ? daysFrom(c.lastUpdate, asOf || today) : null;
    const stale = OPEN_WORK.has(c.status) && (age == null || age > STALE_DAYS) ? { days: age, lastUpdate: c.lastUpdate } : null;
    let progress = c.percent > 0 ? { pct: c.percent, basis: 'reported' } : null;
    if (!progress && c.status === 'under construction' && !late.length) {
      const r = c.lead, s = r.startActual || r.startTarget, span = daysFrom(s, r.substantialTarget), done = daysFrom(s, today);
      if (span > 0 && done != null) progress = { pct: Math.max(0, Math.min(99, Math.round(done / span * 100))), basis: 'estimated from dates' };
    }
    const flags = [...(late.length ? [`completion target passed ${ago(late[0].days)} ago`] : []), ...(stale ? [stale.lastUpdate ? `not updated since ${stale.lastUpdate}` : 'no update date'] : [])];
    return { overdue: late[0] || null, stale, progress, flags };
  }
  /** An EA marked current with nothing dated ahead and no milestone in 18 months (or none published): { last, days }. */
  function eaCheck(e, today) {
    if (!EA_CURRENT.has(e.status)) return null;
    const ds = (e.milestones || []).map(m => String(m.date || '')).filter(Boolean).map(d => (d.length === 7 ? `${d}-15` : d.length === 4 ? `${d}-07-01` : d)).sort();
    if (ds.some(d => d >= today)) return null;
    const last = ds.pop() || null, days = last ? daysFrom(last, today) : null;
    return days == null || days > DORMANT_DAYS ? { last, days } : null;
  }

  // The planner's watch list: the records that need a look, worst first, each with why and what to check.
  const WATCH_KINDS = [
    ['review', 'EA complete 9+ years, no construction'],
    ['overdue', 'Past its completion target'],
    ['dormant', 'EA with no recent activity'],
    ['stale', 'Not updated in a year'],
  ];
  const workTitle = c => `${workLabel(c.lead.workType)}${c.lead.street ? ` · ${titleCase(c.lead.street)}` : ''}`;
  /** o: { capital, eas (list), contracts, today, asOf, muni }. Items: { kind, key, label, ref, where, why, check, page }. */
  function watchList(o) {
    const today = o.today, out = [], cap = o.capital;
    const asOf = o.asOf || (cap && cap.source && cap.source.latestLastUpdate) || today;
    const cs = o.contracts || contracts((cap && cap.records) || []);
    for (const c of cs.values()) {
      const where = placeOf(c.lead);
      if (o.muni && !inMuni(where, o.muni) && !inMuni(c.lead.municipality, o.muni)) continue;
      const k = contractCheck(c, today, asOf), base = { key: `cap:${c.key}`, label: workTitle(c), ref: c.projectNumbers.join(', '), where, page: c.lead.website || '' };
      if (k.overdue) out.push({ ...base, kind: 'overdue', sort: -k.overdue.days, why: `${statusLabel(c.status)}; its completion target (${fmtDate(k.overdue.target)}) passed ${ago(k.overdue.days)} ago with no completion date recorded`, check: 'whether it is finished, or its new target' });
      else if (k.stale) out.push({ ...base, kind: 'stale', sort: -(k.stale.days == null ? 1e6 : k.stale.days), why: `${statusLabel(c.status)}; ${k.stale.lastUpdate ? `last updated ${fmtDate(k.stale.lastUpdate)}` : 'no update date in the record'}`, check: 'whether its status and dates are current' });
    }
    const list = (o.eas || []).filter(e => !o.muni || String(e.municipality || '').toUpperCase().includes(String(o.muni).toUpperCase()));
    for (const x of eaProgress(list, cap, msOf(today))) {
      const e = x.e, base = { key: `ea:${e.id}`, label: e.name, ref: 'EA', where: e.municipality || '', page: (e.links && e.links.page) || '' };
      if (x.bucket === 'limit') out.push({ ...base, kind: 'review', sort: -x.yearsSince, why: `Completed ${x.d.completion.year} (${x.yearsSince} years ago) and no linked construction follows it`, check: 'whether construction is planned: past 10 years the Class EA must be reviewed before construction' });
      const d = eaCheck(e, today);
      if (d) out.push({ ...base, kind: 'dormant', sort: -(d.days == null ? 1e6 : d.days), why: `${EA_STATUS[e.status]}; ${d.last ? `last milestone ${fmtDate(d.last)} (${ago(d.days)} ago) and none ahead published` : 'no dated milestone published'}`, check: 'whether the study is still under way, paused or complete' });
    }
    const rank = Object.fromEntries(WATCH_KINDS.map(([k], i) => [k, i]));
    return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.sort - b.sort || a.label.localeCompare(b.label)).map(({ sort, ...x }) => x);
  }
  const WATCH_SHOWN = 12;
  function watchListHTML(items, o = {}) {
    if (!items.length) return '<p class="small muted">Nothing to check: no work past its target or left without an update for a year, and no idle or long-waiting EA.</p>';
    const n = k => items.filter(x => x.kind === k).length, shown = o.all ? items : items.slice(0, WATCH_SHOWN);
    return `<p class="small">${WATCH_KINDS.filter(([k]) => n(k)).map(([k, t]) => `${esc(t)}: <strong>${n(k)}</strong>`).join(' · ')}</p>
      <ul class="ce-list ce-watch">${shown.map(x => `<li data-kind="${x.kind}"><button type="button" class="btn small link" data-ce-open="${esc(x.key)}">${esc(x.label)}</button>${x.ref && x.ref !== 'EA' ? ` <small class="muted">${esc(x.ref)}</small>` : ''}<br><small>${esc(x.why)}.</small> <small class="muted">To check: ${esc(x.check)}.</small></li>`).join('')}</ul>
      <p class="small">${items.length > shown.length ? `<button type="button" class="btn small" data-ce-allwatch>See all ${items.length}</button> ` : ''}<button type="button" class="btn small" data-ce-watch-csv>CSV of this list</button></p>`;
  }
  const WATCH_COLS = ['Flag', 'What', 'Project number(s)', 'Municipality', 'Why it is listed', 'To check', 'Project page', 'Data as of'];
  function watchSheetRows(items, asOf = '') {
    const label = Object.fromEntries(WATCH_KINDS);
    return { cols: WATCH_COLS, rows: (items || []).map(x => [label[x.kind], x.label, x.ref === 'EA' ? '' : x.ref, x.where, x.why, x.check, x.page, asOf]) };
  }

  // The site brief: the EAs and the open capital work near a development, for a servicing review.
  /**
   * o: { eas (list), contracts, lat, lng, pts ([lat, lng] boundary points), muni, m (default 1 km),
   * today, asOf }. Returns { m, eas: [{ e, d, idle }], may: [e], works: [{ c, d, check, inService }] },
   * each nearest first. Works: planned, tendered, awarded or under construction (complete work is not
   * coming).
   */
  function siteBrief(o) {
    const m = o.m || 1000, today = o.today, pts = o.pts || [];
    const eas = easNear(o.eas, o.lat, o.lng, m, pts).map(({ e, d }) => ({ e, d, idle: eaCheck(e, today) }));
    const all = [[o.lat, o.lng], ...pts], lat0 = Math.min(...all.map(p => p[0])), lat1 = Math.max(...all.map(p => p[0])), lng0 = Math.min(...all.map(p => p[1])), lng1 = Math.max(...all.map(p => p[1]));
    const dLat = m / 110574, dLng = m / (111320 * Math.cos(o.lat * Math.PI / 180));
    const works = [];
    for (const c of (o.contracts || new Map()).values()) {
      if (!ACTIVE_WORK.has(c.status)) continue;
      let d = Infinity;
      for (const r of c.records) {
        if (!r.geometry || !ACTIVE_WORK.has(r.status)) continue;
        const ps = ptsOf(r.geometry); if (!ps.length) continue;
        // (a quick box test first: a contract's segment more than m from the site's box is skipped)
        if (Math.max(...ps.map(p => p[1])) < lat0 - dLat || Math.min(...ps.map(p => p[1])) > lat1 + dLat || Math.max(...ps.map(p => p[0])) < lng0 - dLng || Math.min(...ps.map(p => p[0])) > lng1 + dLng) continue;
        for (const [la, ln] of all) d = Math.min(d, geomDistM(r.geometry, la, ln));
      }
      if (d <= m) works.push({ c, d, check: contractCheck(c, today, o.asOf), inService: contractInService(c) });
    }
    works.sort((a, b) => a.d - b.d || workTitle(a.c).localeCompare(workTitle(b.c)));
    return { m, eas, may: easMayApply(o.eas, o.muni), works };
  }
  const distWords = d => (d < 1 ? 'on the site' : `${Math.max(10, Math.round(d / 10) * 10)} m away`);
  // One plain sentence per EA and per work, as [name, the rest]: the lines of the brief and its text.
  function briefEaLine(x) {
    const e = x.e, dec = e.decision && (e.decision.text || e.decision);
    const when = e.status === 'complete' || e.status === 'addendum' ? (e.completedYear ? `completed ${e.completedYear}` : 'complete, year not published')
      : e.nextStep ? `next: ${e.nextStep.text}${e.nextStep.date ? ` ${fmtDate(e.nextStep.date)}` : ''}` : x.idle ? (x.idle.last ? `no milestone since ${fmtDate(x.idle.last)}` : 'no dated milestone published') : 'no next step published';
    return [e.name, `${EA_STATUS[e.status] || EA_STATUS.unknown} (${e.system === 'multi' ? 'Water and wastewater' : titleCase(e.system || '')}${e.schedule ? `, Schedule ${e.schedule}` : ''}), ${distWords(x.d)}; ${when}${dec ? `. Preferred solution (from the report; check it): "${dec}"` : ''}`];
  }
  function briefWorkLine(x) {
    const c = x.c, k = x.check, pct = k.progress ? `, ${k.progress.pct}% built${k.progress.basis === 'reported' ? '' : ' (estimated from its dates)'}` : '';
    const svc = k.overdue ? `; completion target ${fmtDate(k.overdue.target)} has passed with no completion recorded` : x.inService ? `; in service ${x.inService} (${c.records.some(r => ACTIVE_WORK.has(r.status) && r.substantialActual) ? 'actual' : 'target'})` : '; no completion target published';
    return [`${workTitle(c)}${c.projectNumbers.length ? ` (project ${c.projectNumbers.join(', ')})` : ''}`, `${statusLabel(c.status)}${pct}${svc}, ${distWords(x.d)}${k.stale ? `; ${k.stale.lastUpdate ? `record last updated ${fmtDate(k.stale.lastUpdate)}` : 'record has no update date'}` : ''}`];
  }
  /** Paste-ready text for review comments: plain lines, each with its page, and the sources' dates. */
  function siteBriefText(b, o = {}) {
    const km = b.m >= 1000 ? `${b.m / 1000} km` : `${b.m} m`, end = t => (/[.!?]"?$/.test(t) ? t : `${t}.`);
    const lines = [`Region EAs and capital works within ${km} of ${o.title || 'the site'} (screening from public Region of Peel data; confirm each on its project page).`];
    lines.push('', `Environmental assessments (${b.eas.length}):`, ...(b.eas.length ? b.eas.map(x => `- ${end(briefEaLine(x).join(': '))}${x.e.links && x.e.links.page ? ` ${x.e.links.page}` : ''}`) : ['- None mapped within this distance.']));
    if (b.may.length) lines.push(`- May also apply (not mapped; ${b.may.length}): ${b.may.map(e => e.name).join('; ')}.`);
    lines.push('', `Capital works planned or under way (${b.works.length}):`, ...(b.works.length ? b.works.map(x => `- ${end(briefWorkLine(x).join(': '))}${x.c.lead.website ? ` ${x.c.lead.website}` : ''}`) : ['- None in the capital projects layer within this distance.']));
    lines.push('', `Sources: Region of Peel EA pages${o.easChecked ? `, checked ${fmtDate(o.easChecked)}` : ''}; Region of Peel capital projects layer${o.asOf ? `, as of ${fmtDate(o.asOf)}` : ''}. General screening results only.`);
    return lines.join('\n');
  }
  /** The brief as HTML (the servicing memo and the site's EA section): two lists with their links. */
  function siteBriefHTML(b, o = {}) {
    const li = ([head, tail], url, key) => `<li>${o.links === false ? `<strong>${esc(head)}</strong>` : `<button type="button" class="btn small link" data-ce-open="${esc(key)}">${esc(head)}</button>`}: ${esc(tail)}${url ? ` <a href="${esc(url)}" target="_blank" rel="noopener">page ↗</a>` : ''}</li>`;
    return `<h3 class="sub-title">Environmental assessments <small class="muted">${b.eas.length}</small></h3>${b.eas.length ? `<ul class="small ce-brief">${b.eas.map(x => li(briefEaLine(x), x.e.links && x.e.links.page, `ea:${x.e.id}`)).join('')}</ul>` : '<p class="small muted">None mapped within this distance.</p>'}
      ${b.may.length ? `<p class="small muted">May also apply (not mapped): ${esc(b.may.map(e => e.name).join('; '))}.</p>` : ''}
      <h3 class="sub-title">Capital works planned or under way <small class="muted">${b.works.length}</small></h3>${b.works.length ? `<ul class="small ce-brief">${b.works.map(x => li(briefWorkLine(x), x.c.lead.website, `cap:${x.c.key}`)).join('')}</ul>` : '<p class="small muted">None in the capital projects layer within this distance.</p>'}`;
  }

  // ---- Exports: Capital and EA sheets for the workbook, GeoJSON for both layers (no people) ----------
  // One row per contract (a project page and its segments), flagged ones first. ctx: { today, asOf,
  // eas (list), links (data/capital.json links), muni }: the checks, the EA and DC program each came
  // from (and how sure that link is), and where the work is.
  const CAP_COLS = ['Project number(s)', 'Work type', 'System', 'Street', 'From', 'To', 'Located in', 'Municipality (as published)', 'Ward', 'Status', '% built', '% built basis', 'Start target', 'Start actual', 'Substantial completion target', 'Substantial completion actual', 'In service (year)', 'Days past completion target', 'Last updated', 'Months since update', 'To check', 'From an EA', 'EA link method', 'DC program link', 'DC link confidence', 'Tender target', 'Tender actual', 'Award target', 'Award actual', 'Length (m)', 'Project page', 'Data as of'];
  const dcLinkLabel = k => { const [sys, kind, ref, proj] = String(k).split(':'); return kind === 'fac' ? `${ref} (DC project ${proj})` : `${titleCase(sys)} DC line component ${String(ref || '').replace(/^c/, '')}`; };
  function capitalSheetRows(contracts, ctx = {}) {
    const today = ctx.today || new Date().toISOString().slice(0, 10), asOf = ctx.asOf || '';
    const keyOf = new Map();
    for (const c of (contracts || new Map()).values()) for (const r of c.records) keyOf.set(r.id, c.key);
    const eaBy = new Map(), dcBy = new Map(), push = (m, k, v) => { if (k == null) return; if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    for (const e of ctx.eas || []) for (const l of (e.related && e.related.capitalProjects) || []) push(eaBy, keyOf.get(l.id), { name: e.name, method: l.method });
    for (const l of ctx.links || []) push(dcBy, keyOf.get(l.capital), l);
    const uniq = a => [...new Set(a)];
    const rows = [];
    for (const c of (contracts || new Map()).values()) {
      const r = c.lead, where = placeOf(r);
      if (ctx.muni && !inMuni(where, ctx.muni) && !inMuni(r.municipality, ctx.muni)) continue;
      const k = contractCheck(c, today, asOf), ea = eaBy.get(c.key) || [], dc = dcBy.get(c.key) || [];
      const age = c.lastUpdate ? daysFrom(c.lastUpdate, asOf || today) : null;
      const dcConf = dc.length ? (dc.some(l => l.confidence !== 'low') ? 'medium' : 'low') : '';
      rows.push({ late: k.overdue ? k.overdue.days : -1, flagged: k.flags.length > 0, rank: RANK.indexOf(c.status), row: [c.projectNumbers.join(', '), workLabel(r.workType), c.systems.map(titleCase).join(', '), titleCase(r.street || ''), titleCase(r.from || ''), titleCase(r.to || ''), where, titleCase(r.municipality || ''), r.ward || '', statusLabel(c.status),
        k.progress ? k.progress.pct : '', k.progress ? k.progress.basis : '', r.startTarget || '', r.startActual || '', r.substantialTarget || '', r.substantialActual || '', contractInService(c) || '', k.overdue ? k.overdue.days : '', c.lastUpdate || '', age != null ? Math.round(age / 30.44) : '',
        k.flags.join('; '), uniq(ea.map(x => x.name)).join('; '), uniq(ea.map(x => x.method)).join('; '), uniq(dc.map(l => dcLinkLabel(l.dc))).join('; '), dcConf,
        r.tenderTarget || '', r.tenderActual || '', r.awardTarget || '', r.awardActual || '', Math.round(c.lengthM || 0), r.website || '', asOf] });
    }
    rows.sort((a, b) => (b.flagged - a.flagged) || b.late - a.late || b.rank - a.rank || String(a.row[0]).localeCompare(String(b.row[0])));
    return { cols: CAP_COLS, rows: rows.map(x => x.row) };
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
    eaReview, eaDates, contractSpans, classifyLink, eaProgress, timelineRow, eaTimelineHTML, eaFlowSpec, possibleLinks, sameStreetAs, metresTo, BUCKETS, LINK_STRENGTH, capitalSheetRows, eaSheetRows, capitalGeoJSON, easGeoJSON, CAP_COLS, EA_COLS,
    contractCheck, eaCheck, placeOf, ago, watchList, watchListHTML, watchSheetRows, WATCH_KINDS, WATCH_COLS, siteBrief, siteBriefText, siteBriefHTML, briefEaLine, briefWorkLine,
    eaScopeHTML, capitalScopeHTML, capitalHover, eaHover, watchBtn,
    dcCapitalIndex, dcActualHTML, eaMatch, eaSort, geomDistM, easNear, easMayApply, upcoming, openPeriods, eaICS, eaTabHTML, EA_SYS, activeConstruction, currentEAs, recentEAs, RECENT_YEARS, listsHTML, easForDc, easForDcHTML, weekItems, weekHTML, watchRows, attentionItems,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelCapitalEAModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
