/*
 * Phase model + normalisation for Peel Region development records.
 *
 * Pure functions only (no DOM, no network) so they can be unit-tested in Node.
 * Every municipal dataset uses its own field names and status vocabulary, so
 * records are normalised by pattern-matching field names and status text
 * rather than by a hard-coded schema per source.
 */
(function (root) {
  'use strict';

  // Ordered lifecycle, inception -> completion. `rank` drives "furthest phase reached".
  const PHASES = [
    { key: 'inception',    rank: 0, label: 'Inception',          short: '1', desc: 'Pre-consultation or application submitted' },
    { key: 'review',       rank: 1, label: 'Under review',       short: '2', desc: 'Circulation, public meeting, appeal' },
    { key: 'approved',     rank: 2, label: 'Approved',           short: '3', desc: 'Planning approval (OPA / ZBA / subdivision / site plan)' },
    { key: 'permit',       rank: 3, label: 'Permit issued',      short: '4', desc: 'Building permit issued' },
    { key: 'construction', rank: 4, label: 'Under construction', short: '5', desc: 'Inspections underway' },
    { key: 'completed',    rank: 5, label: 'Completed',          short: '✓', desc: 'Occupancy, final inspection or permit closed' },
  ];
  const CANCELLED = { key: 'cancelled', rank: -1, label: 'Withdrawn / refused', short: '×', desc: 'Withdrawn, refused, cancelled or expired' };
  const ALL_PHASES = PHASES.concat([CANCELLED]);
  const PHASE_BY_KEY = Object.fromEntries(ALL_PHASES.map(p => [p.key, p]));

  // ---- Status text -> phase -------------------------------------------------
  // Order matters: the first matching rule wins, so the more specific phrases
  // ("complete application", "incomplete") are tested before generic ones.
  const STATUS_RULES = [
    ['review',       /\b(in)?complete (application|submission)|deemed complete|incomplete\b/i],
    ['cancelled',    /withdr[ae]wn?|cancel|refus|denied|reject|revok|expired|abandon|void|dismiss|lapsed|not approved|closed[- ]+(incomplete|no work|without)/i],
    ['completed',    /final(ed|led)?\b|complete[d]?\b|occupan|occupied|certif(icate|ied) of completion|\bclosed\b|finish|built\b|done\b/i],
    ['construction', /inspect|under ?construct|construct(ion)? (start|underway|in progress)|framing|foundation|footing|excavat|work (start|in progress|underway)|partial occupancy/i],
    ['permit',       /permit (issued|active|open)|\bissued\b|^active permit|\bopen permit/i],
    ['approved',     /approv|registered|registration|endorse|in effect|by-?law (passed|enacted)|council adopted|adopted|\bfinal and binding|agreement (signed|executed)|conditions (cleared|met)|tribunal (allowed|approved)/i],
    ['review',       /review|circulat|process|pending|hearing|public meeting|appeal|deferred|in progress|under consideration|recommend|report|resubmi|revision|on hold|\bactive\b|\bopen\b/i],
    ['inception',    /pre[- ]?(consult|app)|pre[- ]?submission|inquiry|enquiry|intake|received|submitted|\bnew\b|applied|application filed|filed/i],
  ];

  function phaseFromStatus(text) {
    if (text == null) return null;
    const s = String(text).trim();
    if (!s) return null;
    for (const [phase, re] of STATUS_RULES) if (re.test(s)) return phase;
    return null;
  }

  // ---- Field detection --------------------------------------------------------
  const FIELD_PATTERNS = {
    id:          [/^(application|app|file|permit|folder|bp|case|project)[_ ]?(no|num|number|id|rsn|name)$/i, /^(file|permit|application)(no|num|number)$/i, /(permit|file|application|app)_?(no|num|number)/i, /^folder_?rsn$/i],
    address:     [/^(full_?)?(civic_?)?address$/i, /^(site_?|street_?|location_?)?address(_?\d)?$/i, /addr/i, /^location$/i],
    status:      [/^(app(lication)?_?|permit_?|folder_?|file_?)?status(_?desc(ription)?)?$/i, /status/i, /^stage$/i, /stage/i, /^state$/i],
    type:        [/^(app(lication)?_?|permit_?|folder_?|work_?|file_?)?type(_?desc(ription)?)?$/i, /type/i, /^class/i, /category/i],
    description: [/^(project_?|work_?|app(lication)?_?|permit_?|folder_?)?desc(ription)?$/i, /desc/i, /scope/i, /proposal/i, /purpose/i],
    units:       [/^(new_?|proposed_?|total_?|res(idential)?_?|net_?)?(dwelling_?)?units?(_?(count|proposed|new|total))?$/i, /units/i, /dwelling/i],
    gfa:         [/gfa/i, /floor_?area/i],
    ward:        [/^ward/i],
  };

  // Date fields -> which lifecycle event they record.
  const DATE_RULES = [
    ['cancelled',  /withdr|cancel|refus|expir|revok|denied/i],
    ['completed',  /final|complet|occup|closed?|clos(e|ing)_?d|finish/i],
    ['construction', /inspect|construct(ion)?_?start|start_?construct/i],
    ['permit',     /issu/i],
    ['approved',   /approv|decision|register|adopt|endorse|council|by_?law|notice_?of_?decision/i],
    ['review',     /circulat|public_?meeting|hearing|complete_?app|deemed_?complete|review/i],
    ['inception',  /appl(y|ied|ication)|receiv|submi|intake|open(ed)?|creat|filed|in_?date|start/i],
  ];
  // Housekeeping timestamps that say nothing about the project lifecycle.
  const IGNORE_DATE = /edit|update|modif|load|extract|refresh|etl|globalid|sync|last_?change|creationdate|created_?date|snapshot|as_?of/i;

  function pickField(names, patterns) {
    for (const re of patterns) {
      const hit = names.find(n => re.test(n));
      if (hit) return hit;
    }
    return null;
  }

  /**
   * Build a field map for a layer.
   * @param {Array<{name:string,type?:string,alias?:string}>} fields  layer field metadata
   * @param {object} [sample]  one record's properties (used when metadata lacks types)
   */
  function detectFields(fields, sample) {
    const list = (fields && fields.length ? fields : Object.keys(sample || {}).map(name => ({ name })))
      .filter(f => !/^(objectid|fid|shape|shape__|globalid)/i.test(f.name));
    const names = list.map(f => f.name);
    const map = {};
    for (const key of Object.keys(FIELD_PATTERNS)) map[key] = pickField(names, FIELD_PATTERNS[key]);
    // Don't let "status" double as "type" etc.
    if (map.type && map.type === map.status) map.type = null;
    if (map.description && (map.description === map.status || map.description === map.type)) map.description = null;
    if (map.id && /desc/i.test(map.id)) map.id = null;

    // Unit mix by dwelling type, when a dataset publishes it (e.g. SINGLES, SEMIS, TOWNS, APTS).
    const NUMERIC = /Integer|Double|Single|SmallInteger|BigInteger/;
    const numeric = list.filter(f => !f.type || NUMERIC.test(f.type)).map(f => f.name);
    const UNIT_MIX = {
      single:    /^(sing(le)?s?|sfd|sdd|detached)(_?(units?|dwell\w*|count|prop\w*|new))?$/i,
      semi:      /^semi(s|_?detached)?(_?(units?|dwell\w*|count|prop\w*|new))?$/i,
      town:      /^(town(house)?s?|th|rows?|row_?house?s?|street_?towns?|stacked_?towns?)(_?(units?|dwell\w*|count|prop\w*|new))?$/i,
      apartment: /^(apt|apts|apartments?|condos?|aprt\w*)(_?(units?|dwell\w*|count|prop\w*|new))?$/i,
    };
    map.unitMix = {};
    for (const [k, re] of Object.entries(UNIT_MIX)) {
      const hit = numeric.find(n => re.test(n));
      if (hit) map.unitMix[k] = hit;
    }
    if (!Object.keys(map.unitMix).length) map.unitMix = null;
    else if (map.units && Object.values(map.unitMix).includes(map.units)) map.units = null;

    map.dates = [];
    for (const f of list) {
      const isDateType = f.type === 'esriFieldTypeDate' || f.type === 'esriFieldTypeDateOnly' || f.type === 'esriFieldTypeTimestampOffset';
      const looksDate = /date|_dt$|^dt_|time/i.test(f.name) || /date/i.test(f.alias || '');
      if (!isDateType && !looksDate) continue;
      const label = (f.alias && f.alias !== f.name) ? `${f.name} ${f.alias}` : f.name;
      if (IGNORE_DATE.test(f.name)) continue;
      const rule = DATE_RULES.find(([, re]) => re.test(label));
      if (rule) map.dates.push({ field: f.name, event: rule[0], label: f.alias || f.name });
    }
    return map;
  }

  // ---- Value helpers -----------------------------------------------------------
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (v > 1e11) return new Date(v);              // epoch ms (ArcGIS)
      if (v > 19000101 && v < 21001231) {            // yyyymmdd as number
        const s = String(v); return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00`);
      }
      return null;
    }
    const s = String(v).trim();
    if (/^\d{8}$/.test(s)) return parseDate(Number(s));
    const d = new Date(s);
    if (isNaN(d)) return null;
    const y = d.getFullYear();
    return (y < 1900 || y > 2100) ? null : d;
  }

  function str(v) {
    if (v == null) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  const STREET_ABBR = [
    [/\bSTREET\b/g, 'ST'], [/\bAVENUE\b/g, 'AVE'], [/\bROAD\b/g, 'RD'], [/\bDRIVE\b/g, 'DR'],
    [/\bBOULEVARD\b/g, 'BLVD'], [/\bCRESCENT\b/g, 'CRES'], [/\bCOURT\b/g, 'CRT'], [/\bPLACE\b/g, 'PL'],
    [/\bLANE\b/g, 'LANE'], [/\bPARKWAY\b/g, 'PKY'], [/\bHIGHWAY\b/g, 'HWY'], [/\bTRAIL\b/g, 'TRL'],
    [/\bCIRCLE\b/g, 'CIR'], [/\bSQUARE\b/g, 'SQ'], [/\bTERRACE\b/g, 'TER'], [/\bGATE\b/g, 'GT'],
    [/\bEAST\b/g, 'E'], [/\bWEST\b/g, 'W'], [/\bNORTH\b/g, 'N'], [/\bSOUTH\b/g, 'S'],
  ];

  /** Canonical form used to link applications and permits on the same site. */
  function normalizeAddress(addr) {
    let s = str(addr).toUpperCase();
    if (!s) return '';
    s = s.replace(/,.*$/, '')                       // drop city / postal suffix
         .replace(/\b(UNIT|SUITE|STE|APT|BLDG|BUILDING|LOT|BLK|BLOCK)\s*[#\w-]+/g, '')
         .replace(/#\s*\w+/g, '')
         .replace(/^\s*\w+\s*-\s*(?=\d)/, '')          // Canadian unit-civic "1203-55 Main St" -> "55 Main St"
         .replace(/[.']/g, '')
         .replace(/\s+/g, ' ');
    for (const [re, rep] of STREET_ABBR) s = s.replace(re, rep);
    return s.trim();
  }

  // Keywords that mark a building permit as creating something new rather than
  // an alteration / sign / deck / demolition. Used by the "new builds only" filter.
  const NEW_BUILD = /\bnew\b|erect|construct|dwelling|townhouse|apartment|condo|subdivision|residential|commercial|industrial|institutional|mixed[- ]use|addition|storey|units?\b|warehouse|plaza|tower|building/i;
  const NOT_NEW_BUILD = /\bsign\b|deck|demoli|plumbing only|hvac|fire alarm|sprinkler|tent|pool|shed|interior alteration|second unit|basement|porch|fence|solar|backflow|change of use/i;

  function isNewBuild(rec) {
    if (rec.kind !== 'permit') return true;
    if (rec.units > 0 || rec.gfa > 0) return true;
    const text = `${rec.type} ${rec.description}`;
    if (NOT_NEW_BUILD.test(text)) return false;
    return NEW_BUILD.test(text);
  }

  function num(v) {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    return isFinite(n) ? n : null;
  }

  /** Point used for the map marker: centroid for polygons, midpoint for lines. */
  function representativePoint(geom) {
    if (!geom) return null;
    const t = geom.type, c = geom.coordinates;
    if (!c) return null;
    if (t === 'Point') return [c[1], c[0]];
    if (t === 'MultiPoint') return c.length ? [c[0][1], c[0][0]] : null;
    const rings = t === 'Polygon' ? [c[0]] : t === 'MultiPolygon' ? c.map(p => p[0]) : t === 'LineString' ? [c] : t === 'MultiLineString' ? c : [];
    let best = null, bestArea = -1;
    for (const ring of rings) {
      if (!ring || !ring.length) continue;
      // shoelace centroid; falls back to vertex average for degenerate rings
      let a = 0, cx = 0, cy = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
      }
      let pt;
      if (Math.abs(a) > 1e-14) pt = [cy / (3 * a), cx / (3 * a)];
      else {
        const sx = ring.reduce((s, p) => s + p[0], 0), sy = ring.reduce((s, p) => s + p[1], 0);
        pt = [sy / ring.length, sx / ring.length];
      }
      if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = pt; }
    }
    return best;
  }

  /**
   * Turn one GeoJSON feature into a normalised record.
   * @param {object} feature  GeoJSON feature (WGS84)
   * @param {object} fmap     result of detectFields()
   * @param {object} src      { id, name, municipality, kind: 'application'|'permit', url }
   */
  function normalizeRecord(feature, fmap, src) {
    const p = feature.properties || {};
    const statusRaw = fmap.status ? str(p[fmap.status]) : '';
    const events = [];
    for (const d of fmap.dates) {
      const date = parseDate(p[d.field]);
      if (date) events.push({ date, phase: d.event, label: d.label, field: d.field });
    }
    // Permits: the issue date is the permit milestone; the application date is
    // still "inception" for the permit itself but not for the project if it
    // already went through planning, which mergeProject() handles via ranks.
    if (src.kind === 'permit') {
      for (const e of events) if (e.phase === 'approved') e.phase = 'permit';
    }
    events.sort((a, b) => a.date - b.date);

    let phase = phaseFromStatus(statusRaw);
    // Ambiguous words mean different things for permits vs applications.
    if (src.kind === 'permit') {
      if (phase === 'approved' || (phase === 'review' && /\b(active|open)\b/i.test(statusRaw))) phase = 'permit';
    } else if (phase === 'permit') {
      phase = 'approved'; // "issued" on a planning file means approval issued
    }

    // Dates can only move the phase forward (a completion date beats a stale status).
    const dateRank = events.reduce((r, e) => e.phase === 'cancelled' ? r : Math.max(r, PHASE_BY_KEY[e.phase].rank), -1);
    const hasCancelDate = events.some(e => e.phase === 'cancelled');
    if (phase !== 'cancelled') {
      if (!phase && hasCancelDate) phase = 'cancelled';
      else {
        const statusRank = phase ? PHASE_BY_KEY[phase].rank : -1;
        let rank = Math.max(statusRank, dateRank);
        // Without a status, a record in a permits layer is at least issued and an
        // open planning file is at least under review.
        if (statusRank < 0) rank = Math.max(rank, src.kind === 'permit' ? PHASE_BY_KEY.permit.rank : PHASE_BY_KEY.review.rank);
        phase = PHASES[rank].key;
      }
    }

    const point = representativePoint(feature.geometry);
    const rec = {
      uid: `${src.id}:${feature.id != null ? feature.id : (p.OBJECTID ?? p.objectid ?? p.FID ?? Math.random().toString(36).slice(2))}`,
      sourceId: src.id,
      sourceName: src.name,
      municipality: src.municipality,
      kind: src.kind,
      ref: fmap.id ? str(p[fmap.id]) : '',
      address: fmap.address ? str(p[fmap.address]) : '',
      type: fmap.type ? str(p[fmap.type]) : '',
      description: fmap.description ? str(p[fmap.description]) : '',
      ward: fmap.ward ? str(p[fmap.ward]) : '',
      units: fmap.units ? num(p[fmap.units]) : null,
      gfa: fmap.gfa ? num(p[fmap.gfa]) : null,
      statusRaw,
      phase,
      events,
      lat: point ? point[0] : null,
      lng: point ? point[1] : null,
      props: p,
    };
    if (fmap.unitMix) {
      const mix = {};
      let total = 0;
      for (const [k, f] of Object.entries(fmap.unitMix)) { mix[k] = Math.max(0, num(p[f]) || 0); total += mix[k]; }
      if (total > 0) {
        rec.unitMix = mix;
        if (!(rec.units > 0)) rec.units = total;
      }
    }
    rec.newBuild = isNewBuild(rec);
    return rec;
  }

  /** "ISSUE_DATE" -> "Issue date" for display. */
  function humanizeField(name) {
    const s = String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_]+/g, ' ').trim().toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---- Projects: link records on the same site -------------------------------
  function projectKey(rec) {
    const a = normalizeAddress(rec.address);
    if (a && /\d/.test(a)) return `${rec.municipality}|${a}`;
    if (rec.lat != null) return `${rec.municipality}|@${rec.lat.toFixed(4)},${rec.lng.toFixed(4)}`;
    return `${rec.municipality}|#${rec.uid}`;
  }

  function buildProjects(records) {
    const groups = new Map();
    for (const r of records) {
      const k = projectKey(r);
      let g = groups.get(k);
      if (!g) groups.set(k, g = []);
      g.push(r);
    }
    const projects = [];
    for (const [key, recs] of groups) projects.push(mergeProject(key, recs));
    return projects;
  }

  function mergeProject(key, recs) {
    let live = recs.filter(r => r.phase !== 'cancelled');
    // Redevelopment: files that start after an earlier build on the site was
    // completed are a new cycle, and the site's phase is that cycle's phase.
    const doneAt = Math.max(-Infinity, ...recs.flatMap(r => r.events.filter(e => e.phase === 'completed').map(e => +e.date)));
    if (isFinite(doneAt)) {
      const newer = live.filter(r => r.events.length && +r.events[0].date > doneAt);
      if (newer.length) live = newer;
    }
    const phase = live.length
      ? PHASES[Math.max(...live.map(r => PHASE_BY_KEY[r.phase].rank))].key
      : 'cancelled';

    // Milestones: earliest date at which each phase was reached, across all records.
    const milestones = {};
    const timeline = [];
    for (const r of recs) {
      const tag = r.ref || r.type || (r.kind === 'permit' ? 'Permit' : 'Application');
      for (const e of r.events) {
        timeline.push({ date: e.date, phase: e.phase, text: `${PHASE_BY_KEY[e.phase].label} · ${humanizeField(e.label)}`, record: r.uid, tag });
        if (!milestones[e.phase] || e.date < milestones[e.phase]) milestones[e.phase] = e.date;
      }
    }
    timeline.sort((a, b) => a.date - b.date);
    // Applications with no recorded date still prove inception happened.
    const pts = recs.filter(r => r.lat != null);
    const lat = pts.length ? pts.reduce((s, r) => s + r.lat, 0) / pts.length : null;
    const lng = pts.length ? pts.reduce((s, r) => s + r.lng, 0) / pts.length : null;
    const best = recs.find(r => r.address) || recs[0];
    const dates = timeline.map(t => t.date);
    const sumOf = f => {
      // Units/GFA are repeated across the files of one project; take the max, not the sum.
      const v = recs.map(r => r[f]).filter(x => x != null && x > 0);
      return v.length ? Math.max(...v) : null;
    };
    return {
      key,
      title: best.address || best.ref || '(no address)',
      municipality: recs[0].municipality,
      phase,
      rank: PHASE_BY_KEY[phase].rank,
      records: recs,
      kinds: Array.from(new Set(recs.map(r => r.kind))),
      milestones,
      timeline,
      first: dates.length ? dates[0] : null,
      last: dates.length ? dates[dates.length - 1] : null,
      units: sumOf('units'),
      gfa: sumOf('gfa'),
      // Unit mix of the record reporting the most units (files on one site repeat the same proposal).
      unitMix: (recs.filter(r => r.unitMix).sort((a, b) => (b.units || 0) - (a.units || 0))[0] || {}).unitMix || null,
      newBuild: recs.some(r => r.newBuild),
      types: Array.from(new Set(recs.map(r => r.type).filter(Boolean))),
      description: (recs.find(r => r.description) || {}).description || '',
      lat, lng,
    };
  }

  const api = {
    PHASES, CANCELLED, ALL_PHASES, PHASE_BY_KEY,
    phaseFromStatus, detectFields, parseDate, normalizeAddress, normalizeRecord,
    representativePoint, buildProjects, humanizeField, mergeProject, projectKey, isNewBuild,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPhases = api;
})(typeof window !== 'undefined' ? window : globalThis);
