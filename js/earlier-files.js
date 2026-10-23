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

  // ---- Units on the land over time --------------------------------------------------------------
  // Space: the files on the original land fall into parcels (a file at least half inside another of
  // no more than 3× its size is the same parcel); a pre-consultation joins the parcel it lies on, and
  // one over several parcels is listed but sets no count. Time: on a parcel, the latest file stating
  // a count replaces the earlier ones (a withdrawn or inactive file doesn't count); parcels add up.
  // Built: the new-dwelling permits on a parcel, issued from 3 years before the file that set its
  // count, all completed.
  const HOME_UNITS = /(\d[\d,]*)\s+(?:(?:new|proposed|residential|dwelling|apartment|condominium|townhouse|rental|stacked|back[- ]to[- ]back|purpose[- ]built|standard|rear[- ]lane)\s+)*(?:units?|suites)\b/gi;
  const sentences = t => String(t || '').split(/(?<=[.;])\s+/);
  const toNum = s => Number(String(s).replace(/,/g, ''));
  /** A file's stated home count: an explicit total ("A total of 36 stacked townhouse units, 1016
   *  residential condominium units" = 1,052), else the app's reading. { units, app, how } */
  function statedOf(r) {
    const app = r.units > 0 ? r.units : r.precUnits > 0 ? r.precUnits : null;
    for (const s of sentences(r.description)) {
      const i = s.search(/\btotal\s+of\b/i); if (i < 0) continue;
      // The counts listed one after another ("36 stacked townhouse units, 1016 residential condominium
      // units"); a count further on ("…, which are distributed as 67 units in each building") is not added.
      let n = 0, end = -1;
      for (const m of s.slice(i).matchAll(HOME_UNITS)) { if (end >= 0 && !/^[\s,]*(?:and\s+)?$/i.test(s.slice(i).slice(end, m.index))) break; n += toNum(m[1]); end = m.index + m[0].length; }
      if (n > 0) return { units: n, app, how: 'the total stated' };
    }
    return { units: app, app, how: app ? (r.unitsFromText || r.precUnits ? 'the description' : 'the units field') : null };
  }
  /** A change of count written into a file's description ("reduction in units proposed for Tower B
   *  (from 353 to 298)"): { from, to, delta, text } or null. */
  function revisionOf(r) {
    for (const s of sentences(r.description)) {
      if (!/\b(reduc|increas|revis|chang)\w*/i.test(s) || !/\bunits?\b/i.test(s)) continue;
      const m = s.match(/\bfrom\s+(\d[\d,]*)\s+to\s+(\d[\d,]*)/i); if (!m) continue;
      const from = toNum(m[1]), to = toNum(m[2]);
      if (from > 0 && to > 0 && from !== to) return { from, to, delta: to - from, text: s.trim() };
    }
    return null;
  }
  const yearOf = t => (t == null ? null : new Date(t).getUTCFullYear());
  const isDwellingPermit = r => r.kind === 'permit' && r.lat != null && (!P().permitRole || ['units', 'res'].includes(P().permitRole(r)));
  const firstAtOf = firstAt;
  const lastAt = r => { let t = -Infinity; for (const e of r.events || []) { const v = +new Date(e.date); if (v > t) t = v; } return isFinite(t) ? t : null; };
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // The parcels' colours (map outline, table swatch), as CSS custom properties.
  const PARCEL_TOKENS = ['--hue-blue', '--hue-violet', '--hue-teal', '--cap-tight', '--hue-lilac', '--ph-cancelled', '--growth-3', '--q-2'];

  /** Units added by a file rather than a new total ("to add 4 units to ground floor"), or null. */
  function addOf(r) {
    const m = String(r.description || '').match(/\b(?:to\s+)?(?:add|adding|additional)\s+(\d[\d,]*)\s+(?:[a-z-]+\s+){0,3}?(?:units?|suites)\b/i);
    return m && toNum(m[1]) > 0 ? toNum(m[1]) : null;
  }
  // The building heights a file names ("40-storey", "21 storey"): how a file over a whole block is
  // matched to the building it is for.
  const storeysOf = r => new Set([...String(r.description || '').matchAll(/(\d{1,3})\s*[- ]?\s*(?:storeys?|stories|story|sty)\b/gi)].map(m => Number(m[1])));
  const phaseOf = r => { const m = String(r.description || '').match(/\bphase\s*(\d+)\b/i); return m ? Number(m[1]) : null; };
  // A file for another building beside what stands ("24 residential units addition to the existing retail plaza").
  const ADDITION = /\bunits?\s+addition\b|\baddition\s+to\s+the\s+existing\b/i;
  const CITY_FILE = /^CI\s*\d/i;   // a city-initiated policy file (a development permit area, a study): not an application
  const FRAME_MAX = 150000;   // m²: the whole application a site was split from, not a block or secondary plan
  /** The whole application the site's land was split from: the largest planning file (up to 15 ha,
   *  not a city-initiated policy file) holding at least half the site's widest file, on this site or
   *  another; else the site's widest. */
  function frameOf(p, projects) {
    const w = baseOf(p); if (!w) return null;
    let best = w, ba = area(w.poly);
    const wb = boxOf(w.poly);
    for (const q of projects || []) for (const r of q.records || []) {
      if (r.kind !== 'application' || !r.poly || r.municipality !== w.municipality || r.stage === 'precon' || CITY_FILE.test(r.ref || '') || !meet(boxOf(r.poly), wb)) continue;
      const a = area(r.poly);
      if (a > ba && a <= FRAME_MAX && share(w.poly, r.poly) >= INSIDE) { best = r; ba = a; }
    }
    return best;
  }

  /** The land over time: { base, parcels, spans, years, flags, totals } or null.
   *  parcels: [{ letter, name, token, files, extra, area, steps, count, total, built, underway, permits, app }] */
  function unitsOverTime(p, projects, now = Date.now()) {
    const base = frameOf(p, projects); if (!base) return null;
    const rows = layered(p, projects, base).filter(x => x.r !== base && x.r.poly);
    // (the whole application is itself a file on the land: it states a count for one of its parts)
    rows.push({ r: base, dev: [p, ...(projects || [])].find(q => q.records && q.records.includes(base)) || p, own: p.records.includes(base), inside: 1, at: firstAt(base) });
    if (rows.length < 2) return null;
    // Parcels from the smallest footprints up: a file holding one parcel's seed joins it; a file
    // holding several is over several parcels (a whole block, or the whole application).
    const ar = new Map(rows.map(x => [x, area(x.r.poly)]));
    const groups = [], spans = [];
    for (const x of rows.slice().sort((a, b) => ar.get(a) - ar.get(b))) {
      const touch = groups.map(g => ({ g, s: share(g[0].r.poly, x.r.poly) })).filter(t => t.s >= 0.15), held = touch.filter(t => t.s >= INSIDE).map(t => t.g);
      if (touch.length >= 2) { spans.push({ x, over: touch.map(t => t.g) }); continue; }
      const on = held.length ? held : groups.filter(g => share(x.r.poly, g[0].r.poly) >= INSIDE);
      if (on.length) on[0].push(x); else groups.push([x]);
    }
    // A file over several parcels counts for one when its count matches one parcel's own files
    // (within 5%), or the building height it names does; else it sets no count.
    const extra = new Map(groups.map(g => [g, []]));
    for (const sp of spans) {
      const r = sp.x.r, st = statedOf(r), add = addOf(r), sx = storeysOf(r);
      let g = null, why = '';
      if (st.units > 0 && !add) {
        const hit = sp.over.filter(h => h.some(m => { const v = statedOf(m.r).units; return v > 0 && Math.abs(v - st.units) <= 0.05 * v; }));
        if (hit.length === 1) { g = hit[0]; why = 'same count'; }
      }
      if (!g && sx.size) {
        const hit = sp.over.filter(h => h.some(m => [...storeysOf(m.r)].some(n => sx.has(n))));
        if (hit.length === 1) { g = hit[0]; why = `${[...sx].join(', ')} storeys`; }
      }
      if (g && (st.units > 0 || add)) { extra.get(g).push({ ...sp.x, why }); sp.to = g; }
    }
    const ownSpans = spans.filter(sp => !sp.to);
    // Permits on each parcel (once, on the parcel whose own land holds them).
    const permitsOf = new Map(groups.map(g => [g, []]));
    const bb = boxOf(base.poly), seen = new Set();
    for (const q of projects || []) for (const r of q.records || []) {
      if (r.kind !== 'permit' || r.lat == null || r.lng < bb[0] || r.lng > bb[2] || r.lat < bb[1] || r.lat > bb[3] || seen.has(r) || !isDwellingPermit(r)) continue;
      const g = groups.find(g => P().pointInRings(r.lng, r.lat, g[0].r.poly)) || groups.find(g => g.some(m => P().pointInRings(r.lng, r.lat, m.r.poly)));
      if (g) { seen.add(r); permitsOf.get(g).push(r); }
    }
    const nowY = yearOf(now);
    const byTime = (a, b) => (a.at == null) - (b.at == null) || (a.at || 0) - (b.at || 0);
    const parcels = groups.map(g => {
      g.sort(byTime);
      // Buildings (tracks) on the parcel: a file replaces the count of the building it revises; one
      // for another building (another phase, an addition, other heights and a count 25%+ apart) adds.
      const steps = [], tracks = []; let setAt = null;
      const sum = () => tracks.reduce((t, k) => t + k.units, 0);
      const near = (a, b) => Math.abs(a - b) <= 0.25 * Math.max(a, b);
      const meets = (a, b) => [...a].some(n => b.has(n));
      const trackFor = (r, units) => {
        const sx = storeysOf(r), ph = phaseOf(r);
        if (ADDITION.test(r.description || '')) return null;
        // The same building: a count within 25%, or a rough pre-consultation count made firm by a formal file.
        const alike = tracks.filter(k => (ph != null && k.phase != null ? ph === k.phase : true) && (near(units, k.units) || (k.stage === 'precon' && r.stage !== 'precon')));
        if (!alike.length) return null;
        return alike.find(k => sx.size && meets(sx, k.storeys)) || alike.find(k => near(units, k.units)) || alike[alike.length - 1];
      };
      for (const x of [...g, ...extra.get(g)].sort(byTime)) {
        const r = x.r, st = statedOf(r), out = r.phase === 'cancelled', add = !out && addOf(r);
        const over = x.why ? `whole-block file, counted here (${x.why})` : '';
        const before = sum();
        if (add && tracks.length) {
          // An addition to a building's count, not a new total.
          const sx = storeysOf(r), k = tracks.find(t => sx.size && meets(sx, t.storeys)) || tracks[tracks.length - 1];
          k.units += add; k.ref = r.ref; k.stage = r.stage; k.refs.push(r.ref); setAt = x.at;
          steps.push({ x, r, at: x.at, units: k.units, total: sum(), counted: true, change: add, added: true, note: [`adds ${num(add)} unit${add === 1 ? '' : 's'}`, over].filter(Boolean).join(' · ') });
          continue;
        }
        const counted = !out && st.units > 0;
        let k = null, fresh = false, trackPrev = null;
        if (counted) {
          k = trackFor(r, st.units);
          if (k) { trackPrev = k.units; k.units = st.units; k.ref = r.ref; k.stage = r.stage; k.refs.push(r.ref); for (const n of storeysOf(r)) k.storeys.add(n); if (phaseOf(r) != null) k.phase = phaseOf(r); }
          else { fresh = tracks.length > 0; k = { units: st.units, ref: r.ref, stage: r.stage, storeys: storeysOf(r), phase: phaseOf(r), refs: [r.ref] }; tracks.push(k); }
          setAt = x.at;
        }
        steps.push({ x, r, at: x.at, units: st.units, total: counted ? sum() : null, app: st.app, how: st.how, counted, change: counted && (trackPrev != null || fresh) ? sum() - before : null, trackPrev, newTrack: fresh, over: !!x.why,
          note: [out ? `${r.statusRaw || 'withdrawn'}: not counted` : st.units > 0 ? (fresh ? 'another building on the parcel: added' : '') : 'states no homes', over].filter(Boolean).join(' · ') });
        const rv = !out && revisionOf(r);
        if (rv && k && counted) { const b2 = sum(); k.units += rv.delta; steps.push({ x, r, at: x.at, revised: true, units: k.units, total: sum(), counted: true, change: sum() - b2, note: `resubmission: ${rv.text}` }); }
      }
      const count = tracks.length ? sum() : null;
      // What the files state, before resubmissions and additions written in their descriptions.
      const stated = tracks.length ? tracks.reduce((t, k) => { const s = steps.filter(z => z.counted && !z.revised && !z.added && z.r.ref === k.ref).pop(); return t + (s ? s.units : k.units); }, 0) : null;
      // Named by its address (a minor file's, such as a garbage-bin change, last) and the file that set its count.
      const named = [...g].reverse(), lead = named.find(x => x.r.stage !== 'precon' && !x.r.minor && x.r.address) || named.find(x => x.r.address) || g[g.length - 1];
      // Built: the dwelling permits from 3 years before the file that set the count.
      const from = setAt != null ? setAt - 3 * 365.25 * 864e5 : -Infinity;
      const permits = permitsOf.get(g).filter(r => { const t = firstAtOf(r); return t == null || t >= from; });
      const done = permits.length && permits.every(r => r.phase === 'completed');
      const builtAt = done ? Math.max(...permits.map(r => lastAt(r) || firstAtOf(r) || 0)) : null;
      const counted = steps.filter(s => s.counted), last = counted[counted.length - 1];
      // The app development that holds the parcel's own land (a whole-block file may sit in another).
      const ownLast = counted.filter(s => !s.x.why).pop(), owner = ownLast ? ownLast.x.dev : last ? last.x.dev : g[0].dev;
      const devs = [...new Set(steps.filter(s => s.counted).map(s => s.x.dev).filter(Boolean))];
      const title = t => String(t || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Rd|Dr|St|Ave|Pkwy|Cres|Blvd)\b/g, w => w);
      return { files: g, extra: extra.get(g), steps, count, stated, tracks: tracks.map(k => ({ units: k.units, ref: k.ref, stage: k.stage, refs: k.refs })), setAt, name: title(lead.r.address || (lead.dev && lead.dev.title) || lead.r.ref), key: last ? last.r.ref : null, area: Math.max(...g.map(x => ar.get(x) || 0)),
        permits, built: done && count > 0 ? { at: builtAt, year: yearOf(builtAt) } : null, underway: !done && permits.length > 0,
        first: g.find(x => x.at != null), app: owner ? { dev: owner, units: owner.units || 0 } : null, devs,
      };
    }).filter(pc => pc.steps.some(s => s.units > 0) || pc.files.some(x => x.r.stage !== 'precon'));
    parcels.sort((a, b) => (a.first ? a.first.at : Infinity) - (b.first ? b.first.at : Infinity));
    parcels.forEach((pc, i) => { pc.letter = LETTERS[i] || String(i + 1); pc.token = PARCEL_TOKENS[i % PARCEL_TOKENS.length]; });
    // Year by year: each parcel's count at the end of the year, the land's total and what is built.
    const atYear = (pc, y) => {
      let v = null; for (const s of pc.steps) if (s.counted && s.at != null && yearOf(s.at) <= y) v = s.total;
      // (built before the file that states its count, such as a condominium registered after: the homes stand from then)
      if (v == null && pc.built && pc.built.year <= y) { const s = pc.steps.find(x => x.counted); v = s ? s.total : null; }
      return v;
    };
    const y0 = Math.min(...parcels.flatMap(pc => pc.steps.filter(s => s.at != null).map(s => yearOf(s.at))), ...parcels.filter(pc => pc.built).map(pc => pc.built.year));
    const years = [];
    if (isFinite(y0)) for (let y = y0; y <= nowY; y++) {
      const cells = parcels.map(pc => atYear(pc, y)), built = parcels.reduce((t, pc, i) => t + (pc.built && pc.built.year <= y ? cells[i] || 0 : 0), 0);
      const land = cells.reduce((t, v) => t + (v || 0), 0), prevRow = years[years.length - 1];
      const changed = !prevRow || cells.some((v, i) => v !== prevRow.cells[i]) || built !== prevRow.built;
      if (changed || y === nowY) years.push({ year: y, cells, land, built, changed: prevRow ? cells.map((v, i) => v !== prevRow.cells[i]) : cells.map(v => v != null) });
    }
    // What disagrees.
    const flags = [];
    for (const pc of parcels) {
      const L = `${pc.letter} (${pc.name})`;
      if (pc.app && pc.count != null && pc.app.units !== pc.count && pc.app.units !== pc.stated) flags.push({ kind: 'warn', parcel: pc.letter, text: `${L}: the app counts ${num(pc.app.units)} homes; the latest files state ${num(pc.stated)}${pc.stated !== pc.count ? `, ≈${num(pc.count)} after ${pc.steps.some(x => x.revised) ? 'its resubmission' : 'later additions'}` : ''}.` });
      if (pc.devs.length > 1) flags.push({ kind: 'warn', parcel: pc.letter, text: `${L}: its files are split across ${pc.devs.length} developments in the app (${pc.devs.map(d => `${d.title || d.key}, ${num(d.units || 0)}`).join('; ')}): open any of them to see the whole land here.` });
      const sp = pc.steps.filter(s => s.counted && !s.revised && s.r.stage === 'siteplan').pop(), co = pc.steps.filter(s => s.counted && s.r.stage === 'condo').pop();
      if (sp && co && sp.units !== co.units) flags.push({ kind: 'info', parcel: pc.letter, text: `${L}: the site plan states ${num(sp.units)}, the condominium ${num(co.units)} (${co.units > sp.units ? '+' : ''}${num(co.units - sp.units)}).` });
      for (const s of pc.steps) if (s.added) flags.push({ kind: 'info', parcel: pc.letter, text: `${L}: ${s.r.ref} adds ${num(s.change)} unit${s.change === 1 ? '' : 's'} to the count (${num(s.units - s.change)} → ${num(s.units)}).` });
      for (const s of pc.steps) if (s.revised) flags.push({ kind: 'warn', parcel: pc.letter, text: `${L}: ${s.r.ref} changes its count in its description (${s.change > 0 ? '+' : ''}${num(s.change)}): ${s.note.replace(/^resubmission: /, '')}` });
      for (const s of pc.steps) if (s.counted && s.app && s.units !== s.app && !s.revised && !s.added) flags.push({ kind: 'warn', parcel: pc.letter, text: `${L}: ${s.r.ref} states ${num(s.units)} (${s.how}); the app reads ${num(s.app)}.` });
      for (const s of pc.steps) if (s.counted && s.trackPrev != null && Math.abs(s.units - s.trackPrev) > 0.1 * Math.max(1, s.trackPrev)) flags.push({ kind: 'info', parcel: pc.letter, text: `${L}: ${s.r.ref} ${s.units > s.trackPrev ? 'raised' : 'cut'} the count from ${num(s.trackPrev)} to ${num(s.units)}.` });
      for (const s of pc.steps) if (s.newTrack) flags.push({ kind: 'info', parcel: pc.letter, text: `${L}: ${s.r.ref} is another building on the parcel (${num(s.units)}), added to it rather than replacing the earlier count.` });
    }
    const last = years[years.length - 1] || { land: 0, built: 0 };
    return { base, parcels, spans: ownSpans, years, flags, totals: { land: last.land, built: last.built } };
  }
  /** One sentence: built, and what is proposed on top (a range where a resubmission changed it). */
  function unitsSummary(u) {
    if (!u || !u.parcels.length) return '';
    const built = u.parcels.filter(pc => pc.built), open = u.parcels.filter(pc => !pc.built && pc.count > 0);
    const rng = pc => (pc.stated != null && pc.stated !== pc.count ? `≈${num(Math.min(pc.count, pc.stated))}–${num(Math.max(pc.count, pc.stated))}` : num(pc.count));
    const b = built.length ? `${num(built.reduce((t, pc) => t + pc.count, 0))} homes built on ${built.length} parcel${built.length === 1 ? '' : 's'} (${built.map(pc => `${pc.letter} ${num(pc.count)}`).join(' + ')})` : 'No homes built on this land yet';
    const o = open.map(pc => { const s = pc.steps.find(x => x.counted); return `${rng(pc)} more on parcel ${pc.letter} (${pc.name})${s && s.at != null ? `, first proposed in ${yearOf(s.at)}` : ''}${pc.underway ? ', permits issued' : ''}`; });
    return `${b}${o.length ? `; ${o.join('; ')}` : ''}.`;
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
    const base = frameOf(p, allProjects()); if (!base) return '';
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
      ${(() => { const u = unitsOf(p), t = unitsSummary(u); return t ? `<p class="small ef-units"><strong>Homes on this land:</strong> ${esc(t)} <button type="button" class="btn small link" data-ef-growth="${esc(p.key)}">Units over time, by parcel →</button></p>` : ''; })()}
      ${diffs.length ? `<ul class="why-list small">${diffs.map(d => `<li class="why-${d.kind === 'warn' ? 'warn' : 'info'}"><span>${esc(d.text)}</span></li>`).join('')}</ul>` : ''}
      ${missing.length ? `<p class="small"><strong>Earlier files referenced</strong></p><ul class="small ef-miss">${missing.map(m => `<li><strong>${esc(m.ref)}</strong>${m.year ? ` (${m.year})` : ''}: ${esc(m.why)}${m.before ? ' · <span class="muted">before the data starts</span>' : ''}</li>`).join('')}</ul>` : ''}
      <div class="pt-actions small">${canLook ? `<button type="button" class="btn small" data-ef-lookup="${esc(p.key)}"${live && live.status === 'loading' ? ' disabled' : ''}>Look up the earlier files</button>` : ''}<button type="button" class="btn small" data-ef-map="${esc(p.key)}" title="The original land dashed, each parcel in its colour with its homes, earlier files found live dotted. Press again to hide">Show the layers on the map</button></div>
      <div class="ef-live">${liveHTML}</div>
      <p class="small"><strong>Filed on ${esc(base.ref)}'s land</strong>, oldest first</p>
      <table class="rec-t ef-t small"><thead><tr><th>File</th><th>Filed</th><th class="num">Homes</th><th class="num">Inside</th><th>Site</th></tr></thead><tbody>${rowHTML({ r: base, own: p.records.includes(base), dev: allProjects().find(q => q.records.includes(base)), inside: 1 }, null, 'original land')}${later.map(x => rowHTML(x, base)).join('')}</tbody></table>
      <p class="small muted">Inside: share of the file's land inside ${esc(base.ref)}'s (under 90% reaches past it). A file shown under another site is counted there, not here.</p>
    </details>`;
  }

  // The land over time, kept per development until the developments change.
  const uCache = new Map(); let uOf = null;
  function unitsOf(p) {
    const ps = allProjects(); if (uOf !== ps) { uCache.clear(); uOf = ps; }
    if (!uCache.has(p.key)) uCache.set(p.key, unitsOverTime(p, ps));
    return uCache.get(p.key);
  }
  const sw = pc => `<i class="ef-sw" style="background:var(${pc.token})"></i>`;
  const cnt = v => (v == null ? '–' : num(v));
  /** Growth at a development: the units on its land year by year, a column per parcel, then each
   *  parcel's files in order with the count each states. */
  function unitsHTML(p, opts = {}) {
    if (!p || p.parent) return '';
    const u = unitsOf(p); if (!u || !u.parcels.length || !u.years.length) return '';
    if (u.parcels.length < 2 && !u.parcels.some(pc => pc.steps.filter(s => s.counted).length > 1)) return '';
    const ps = u.parcels;
    const head = `<tr><th>Year</th>${ps.map(pc => `<th class="num" title="${esc(pc.name)}${pc.key ? ` · ${esc(pc.key)}` : ''}">${sw(pc)}${esc(pc.letter)}</th>`).join('')}<th class="num">On the land</th><th class="num">Built</th></tr>`;
    const body = u.years.map((y, i) => {
      const prev = u.years[i - 1];
      const d = (v, w) => (prev && v !== w ? `<small class="ef-d">${v - w > 0 ? '▲' : '▼'}${num(Math.abs(v - w))}</small>` : '');
      return `<tr><td>${y.year}${prev && y.year - prev.year > 1 ? `<small class="muted"> (no change since ${prev.year})</small>` : ''}</td>${y.cells.map((v, k) => `<td class="num${y.changed[k] && prev ? ' ef-ch' : ''}">${cnt(v)}${prev ? d(v || 0, prev.cells[k] || 0) : ''}</td>`).join('')}<td class="num"><strong>${num(y.land)}</strong>${prev ? d(y.land, prev.land) : ''}</td><td class="num">${num(y.built)}</td></tr>`;
    }).join('');
    const stage = r => (r.stage === 'precon' ? 'pre-consultation' : r.stage === 'siteplan' ? 'site plan' : r.stage === 'condo' ? 'condominium' : r.stage === 'master' ? 'official plan / zoning / subdivision' : r.type || 'file');
    const parcel = pc => {
      const steps = pc.steps.map(s => `<tr class="${s.counted ? '' : 'muted'}"><td>${s.revised ? '↳ later' : esc(dayOf(s.at))}</td><td><button type="button" class="tr-ref" data-dev-file="${esc(s.r.ref)}"${s.x.dev && !s.x.own ? ` data-dev-key="${esc(s.x.dev.key)}"` : ''}>${esc(s.r.ref)}</button></td><td>${esc(s.revised ? 'resubmission' : stage(s.r))}</td><td class="num">${s.units > 0 ? num(s.units) : '–'}</td><td class="num">${s.change ? `${s.change > 0 ? '▲' : '▼'}${num(Math.abs(s.change))}` : ''}</td><td>${esc(s.revised ? s.note.replace(/^resubmission: /, '') : s.note || (s.how && s.how !== 'the units field' ? `from ${s.how}` : ''))}</td></tr>`).join('');
      const pm = pc.built ? `Built: ${num(pc.permits.length)} building permit${pc.permits.length === 1 ? '' : 's'}, all closed, last in ${pc.built.year}.` : pc.underway ? `Under way: ${num(pc.permits.length)} building permit${pc.permits.length === 1 ? '' : 's'} issued, not all closed.` : 'No building permits for these homes yet.';
      const app = pc.app && pc.app.dev ? ` The app counts <strong>${num(pc.app.units)}</strong> on <button type="button" class="btn small link" data-ef-open="${esc(pc.app.dev.key)}">${esc(pc.app.dev.title || pc.app.dev.key)}</button>.` : '';
      return `<details class="ef-parcel"${pc.count > 0 && !pc.built ? ' open' : ''}><summary>${sw(pc)}<strong>${esc(pc.letter)} · ${esc(pc.name)}</strong> <span class="muted small">${pc.area >= 10000 ? `${(pc.area / 10000).toFixed(1)} ha` : `${num(Math.round(pc.area / 10) * 10)} m²`} · ${pc.count != null ? `${num(pc.count)} homes` : 'no homes stated'}${pc.built ? ` · built ${pc.built.year}` : pc.underway ? ' · under way' : ''}</span></summary>
        <table class="rec-t ef-t small"><thead><tr><th>Filed</th><th>File</th><th>Stage</th><th class="num">Homes</th><th class="num">Change</th><th>Note</th></tr></thead><tbody>${steps}</tbody></table>
        <p class="small muted">${pm}${app}</p></details>`;
    };
    const spans = u.spans.length ? `<p class="small muted">Over several parcels, setting no count: ${u.spans.map(sp => `${esc(sp.x.r.ref)} (${esc(dayOf(sp.x.at))}${statedOf(sp.x.r).units ? `, ${num(statedOf(sp.x.r).units)} homes stated` : ''}, over ${sp.over.map(g => { const pc = ps.find(q => q.files === g); return pc ? pc.letter : '?'; }).join(' and ')})`).join('; ')}.</p>` : '';
    return `<section class="ef-units-sect" id="ef-units">${opts.fold ? '' : '<h3 class="sub-title">Units on this land over time</h3>'}
      <p class="small">${esc(unitsSummary(u))}</p>
      ${u.flags.length ? `<ul class="why-list small">${u.flags.map(f => `<li class="why-${f.kind}"><span>${esc(f.text)}</span></li>`).join('')}</ul>` : ''}
      <div class="bd-w"><table class="dt ef-years"><caption>Homes stated on ${esc(u.base.ref)}'s land at the end of each year, by parcel</caption><thead>${head}</thead><tbody>${body}</tbody></table></div>
      <div class="pt-actions small"><button type="button" class="btn small" data-ef-map="${esc(p.key)}">Show the parcels on the map</button></div>
      ${ps.map(parcel).join('')}${spans}
      <p class="small muted">How it's counted. Parcels: files whose land lies at least half inside another file's (of no more than 3× its size) are one parcel; a pre-consultation over several parcels sets no count. Time: on a parcel the latest file stating a count replaces the earlier ones; a withdrawn or inactive file doesn't count; parcels add up. Built: the parcel's new-dwelling permits, from 3 years before the file that set its count, all closed. Counts are the files' own words, so a pre-consultation's is rough.</p>
    </section>`;
  }

  // The map: the original land dashed, each parcel in its colour with its homes, the earlier files
  // found live dotted.
  let mapLayer = null, mapKey = null;
  function showOnMap(p) {
    const L = root.L, MC = root.PeelMapCore, map = MC && MC.map; if (!L || !map) return;
    if (!mapLayer) mapLayer = L.layerGroup().addTo(map);
    mapLayer.clearLayers();
    if (mapKey === p.key) { mapKey = null; return; }   // (a second press clears it)
    mapKey = p.key;
    const base = frameOf(p, allProjects()); if (!base) return;
    const ll = rings => rings.map(r => r.map(([x, y]) => [y, x]));
    const tok = n => { const U = root.PeelUtil; return U && U.token ? U.token(n) : undefined; };
    const add = (r, style, label) => { const g = L.polygon(ll(r.poly), { interactive: true, ...style }).addTo(mapLayer); g.bindTooltip(label, { sticky: true }); return g; };
    const b = add(base, { color: tok('--cap-tight'), weight: 3, dashArray: '8 6', fillOpacity: 0.04 }, `${base.ref} · original land`);
    const u = unitsOf(p), drawn = new Set();
    for (const pc of (u && u.parcels) || []) {
      const c = tok(pc.token), big = pc.files.reduce((m, x) => (area(x.r.poly) > area(m.r.poly) ? x : m), pc.files[0]);
      for (const x of pc.files) { drawn.add(x.r); add(x.r, { color: c, weight: x === big ? 2.5 : 1, fillColor: c, fillOpacity: x === big ? 0.25 : 0.04 }, `${pc.letter} · ${pc.name} · ${x.r.ref || 'no number'} · ${dayOf(x.at)}`); }
      L.tooltip({ permanent: true, direction: 'center', className: 'ef-lbl' }).setLatLng(L.polygon(ll(big.r.poly)).getBounds().getCenter()).setContent(`${pc.letter} · ${pc.count != null ? num(pc.count) : '–'}${pc.built ? ' built' : ''}`).addTo(mapLayer);
    }
    for (const x of layered(p, allProjects(), base)) if (x.r !== base && !drawn.has(x.r)) add(x.r, { color: x.inside < 0.9 ? tok('--ph-cancelled') : tok('--select'), weight: 1, dashArray: '3 4', fill: false }, `${x.r.ref || 'no number'} · ${dayOf(x.at)} · over several parcels`);
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
    const t = e.target.closest && e.target.closest('[data-ef-lookup],[data-ef-map],[data-ef-open],[data-ef-growth]'); if (!t) return;
    const k = t.dataset.efLookup || t.dataset.efMap || t.dataset.efOpen || t.dataset.efGrowth, p = projectByKey(k); if (!p) return;
    if (t.dataset.efGrowth) { const AT = root.PeelAnalysisTabs; if (AT && AT.openTab) AT.openTab('growth', 'pipeline'); setTimeout(() => { const f = document.getElementById('ef-units-fold'), el = document.getElementById('ef-units'); if (f) f.open = true; if (el) el.scrollIntoView({ block: 'start' }); }, 50); return; }
    if (t.dataset.efOpen) { const DN = root.PeelDevNav; if (DN && DN.showDetail) DN.showDetail(p); return; }
    if (t.dataset.efMap) { showOnMap(p); return; }
    const st = App() && App().state, since = (st && Number(st.sinceYear)) || null;
    found.set(p.key, { status: 'loading', recs: [] }); rerender();
    lookup(p, implied(p, known(), since))
      .then(recs => { found.set(p.key, { status: 'done', recs }); })
      .catch(err => { found.set(p.key, { status: 'done', recs: [], error: err && err.message || String(err) }); })
      .then(() => { rerender(); if (mapKey === p.key) { mapKey = null; showOnMap(p); } });
  });

  const api = { implied, baseOf, layered, discrepancies, lookup, html, yearOfRef, showOnMap, statedOf, revisionOf, addOf, frameOf, unitsOverTime, unitsSummary, unitsHTML };
  if (isNode) module.exports = api;
  else root.PeelEarlierFiles = api;
})(typeof window !== 'undefined' ? window : globalThis);
