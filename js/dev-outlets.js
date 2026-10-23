/* Where each development discharges — reviewed, and set by hand on the map (QA/QC › Review outlets).
 * The app sends a development's sewage into the nearest sanitary sewer of 300 mm or more (js/sewer-cap.js
 * sewerGrowth), or, off the existing network, along the planned DC mains (js/sewer-trace.js
 * dcSewerPath). A reviewer can confirm that outlet, or set another: an existing sewer, or a planned DC
 * main, a sewer being built (a capital project's new sewer, js/dc-joins.js capLines), or a local sewer
 * under 300 mm (data/sewers-local.json: it drains to a trunk, which the load model follows). Reviewed outlets: data/dev-outlets.json (committed) plus this browser's edits (store
 * 'devOutletEdits'), by development key and system. An outlet is kept as a point and the pipe's size,
 * not a pipe number, so it survives a rebuild of the sewer data. The load model, the trace and the DC
 * impact model (js/dc-impact.js) follow a set outlet; every place that shows it says it was set by hand.
 * Water (the main a development connects to) uses the same records with sys 'water' (next step).
 */
(function (root) {
  'use strict';

  const U = root.PeelUtil || {};
  const store = U.store || { get: (k, d) => d, set() {} };
  const App = () => root.PeelApp, MM = () => root.PeelMapMarkers, SC = () => root.PeelSewerCap, ST = () => root.PeelSewerTrace;
  const DI = () => root.PeelDcInfra, MP = () => root.PeelMasterPlan, IM = () => root.PeelDcImpact, DJ = () => root.PeelDcJoins, CEM = () => root.PeelCapitalEAModel;
  const DG = () => root.PeelDcGate, EL = () => root.PeelElevation, AR = () => root.PeelAreas;
  const r6 = p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
  const today = () => new Date().toISOString().slice(0, 10);

  // ---- Pure: the records ----------------------------------------------------------------------------
  // A record: { key, sys, mode: 'confirmed' | 'set', kind: 'sewer' | 'local' | 'dc' | 'cap', at: [lng, lat], mm, project,
  // src, by, date }. A local edit with auto: true drops a committed record (back to the automatic outlet).
  const idOf = r => `${r.sys || 'wastewater'}|${r.key}`;
  function merge(shipped, edits) {
    const out = new Map();
    for (const r of shipped || []) out.set(idOf(r), r);
    for (const e of edits || []) { if (e.auto) out.delete(idOf(e)); else out.set(idOf(e), e); }
    return out;
  }
  // The committed file, from the merged records (local marks dropped).
  function exportJSON(recs) {
    return { version: 1, note: 'Reviewed development outlets (js/dev-outlets.js, QA/QC › Review outlets). key: the development; sys: wastewater (or water); mode: confirmed (the automatic outlet, checked) or set (by hand); kind: sewer (an existing sanitary sewer, 300 mm+), local (an existing local sewer under 300 mm), cap (a sewer being built: a capital project) or dc (a planned DC main); at: the point it joins; mm: that pipe\'s size; project: the DC project (or the capital project); src: what says so; date: when.',
      outlets: [...recs.values()].map(({ key, sys, mode, kind, at, mm, project, src, by, date }) => ({ key, sys: sys || 'wastewater', mode, ...(kind ? { kind } : {}), ...(at ? { at } : {}), ...(mm ? { mm } : {}), ...(project ? { project } : {}), ...(src ? { src } : {}), ...(by ? { by } : {}), ...(date ? { date } : {}) })) };
  }
  // Which projects a candidate puts on the path and what that does to the gate: { add, drop, gate }.
  // now / then: [{ key, tier, y }]; gating tiers count for the gate.
  function diff(now, then, gating = ['A', 'B1']) {
    const has = (list, k) => list.some(x => x.key === k);
    const gate = list => Math.max(0, ...list.filter(x => gating.includes(x.tier) && x.y).map(x => x.y)) || null;
    return { add: then.filter(x => !has(now, x.key)), drop: now.filter(x => !has(then, x.key)), gate: gate(then), gateNow: gate(now) };
  }

  // ---- Pure: does an outlet fit the development? -----------------------------------------------
  // The stage (js/phases.js) limits what a development can drain to:
  //   built                    existing sewers (or one built since the sewer data: a capital sewer, complete);
  //   committed (a building    existing, or being built (a capital sewer or DC main tendered, awarded or
  //   permit, under            under construction): a DC main not yet tendered is a red flag;
  //   construction, or a site servicing permit on file)
  //   early (pre-application, in review, approved with no permit)   anything, planned DC mains too.
  // The checks flag; they never block (the data lag, and a stage can be wrong): a reviewer decides.
  const stageGroup = (phase, ssp) => (phase === 'completed' ? 'built' : phase === 'permit' || phase === 'construction' || ssp ? 'committed' : 'early');
  // Gravity: the site's own sewer leaves it at least GRAV_DEPTH m down and falls GRAV_SLOPE (0.5 %) to
  // the outlet; the outlet's invert must be below that. Depths: the Region's sewer inverts (CGVD28);
  // the ground passed in on the same datum.
  const GRAV_DEPTH = 1.5, GRAV_SLOPE = 0.005;
  const r1 = x => (Math.round(x * 10) / 10).toFixed(1);
  // c: { phase, ssp: site servicing permit year, built: year built, first: first-homes year, dist: m from
  //   the site, outlet: { cls: 'existing' | 'new' | 'building' | 'planned', install, ready, start,
  //   via: DC mains not tendered further down its route },
  //   gravity: { ground (undefined: still asking), invert }, drain: { site: [names], outlet: name } | null }
  // → [{ k, tone: 'ok' | 'warn' | 'bad' | 'unk', text }]
  function evidence(c) {
    const out = [], o = c.outlet || {}, g = stageGroup(c.phase, c.ssp), add = (k, tone, text) => out.push({ k, tone, text });
    const permit = c.phase === 'permit' || c.phase === 'construction' ? 'Building permit issued' : 'Site servicing permit on file';
    if (g === 'early') add('stage', 'ok', 'Not permitted yet: any outlet fits its stage');
    else if (g === 'built') {
      if (o.cls === 'existing' || o.cls === 'new') add('stage', 'ok', 'Built, on a sewer in service');
      else if (o.cls === 'building') add('stage', 'warn', 'Built, but this sewer is still being built');
      else add('stage', 'bad', 'Built, but this DC main is not started');
      if (o.cls !== 'planned' && (o.via || []).length) add('stage', 'bad', `Built, but its route needs DC main ${o.via.join(', ')}, not started`);
    } else if (o.cls === 'planned') add('stage', 'bad', `${permit}, but this DC main is not tendered`);
    else if ((o.via || []).length) add('stage', 'bad', `${permit}, but its route needs DC main ${o.via.join(', ')}, not tendered`);
    else add('stage', 'ok', `${permit}: ${o.cls === 'building' ? 'a sewer being built fits' : 'a sewer in service fits'}`);
    if ((o.cls === 'existing' || o.cls === 'new') && !o.readyBy) add('time', 'ok', 'In service now');
    else if (o.ready && c.first) add('time', o.ready > c.first ? 'bad' : 'ok', `In service ≈${o.ready}${o.readyBy ? ` (${o.readyBy} on its route)` : ''}, ${o.ready > c.first ? 'after' : 'by'} first homes ≈${c.first}`);
    else add('time', 'unk', 'In-service year not known');
    if (o.cls === 'existing' && o.install) {
      const ref = c.built || c.ssp;
      if (c.built && o.install > c.built + 1) add('install', 'bad', `Installed ${o.install}, after the development was built (${c.built})`);
      else if (ref && Math.abs(o.install - ref) <= 2 && c.dist <= 150) add('install', 'ok', `Installed ${o.install}, with the development (${ref}): likely its own sewer`);
    }
    if (c.ssp && o.start && o.start > c.ssp + 1 && (o.cls === 'building' || o.cls === 'planned')) add('permit', 'warn', `Site servicing permit ${c.ssp}, before this sewer starts (${o.start})`);
    const gv = c.gravity || {};
    if (gv.invert == null) add('gravity', 'unk', o.cls === 'existing' ? 'Gravity: no depth for this sewer' : 'Gravity: no depths for a sewer not yet in the data');
    else if (gv.ground === undefined) add('gravity', 'unk', 'Gravity: checking the ground…');
    else if (gv.ground == null) add('gravity', 'unk', 'Gravity: ground elevation not available');
    else {
      const m = gv.ground - GRAV_DEPTH - GRAV_SLOPE * (c.dist || 0) - gv.invert;
      if (m >= 1) add('gravity', 'ok', `Drains by gravity: ≈${r1(m)} m to spare`);
      else if (m >= 0) add('gravity', 'warn', `Gravity is tight: ≈${r1(m)} m to spare`);
      else add('gravity', 'bad', `≈${r1(-m)} m too shallow to drain by gravity: would need pumping`);
    }
    if (c.drain && c.drain.site.length && c.drain.outlet) {
      if (c.drain.site.includes(c.drain.outlet)) add('drain', 'ok', `Same drainage area (${c.drain.outlet})`);
      else add('drain', 'warn', `Different drainage area: site in ${c.drain.site[0]}, outlet in ${c.drain.outlet}`);
    }
    return out;
  }
  const TONES = ['bad', 'warn', 'unk', 'ok'];
  const worst = list => TONES.find(t => (list || []).some(x => x.tone === t)) || 'ok';
  // Does an outlet match what the FSR says (data/fsr-outlets.json, scripts/build-fsr-outlets.js)?
  // f: { outlet: { mm, street, status, project }, confidence, quotes: [{ page }] }; c: a candidate
  // ({ kind, mm, street, project }). Same Region project, or the size and street agreeing: ok; one of
  // them differing: warn; both (a sure read): bad; nothing to compare: unk.
  const normStreet = x => String(x || '').toLowerCase().replace(/\b(road|rd|street|st|avenue|ave|drive|dr|boulevard|blvd|way|crescent|cres|lane|ln|line|sideroad|parkway|pkwy|court|ct|trail|gate|circle|place|pl|east|west|north|south|e|w|n|s)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  function fsrCheck(f, c) {
    if (!f || !f.outlet || !c) return null;
    const o = f.outlet, pg = f.quotes && f.quotes[0] ? ` (p. ${f.quotes[0].page})` : '', said = [o.mm ? `${o.mm} mm` : '', o.street ? `on ${o.street}` : '', o.project || ''].filter(Boolean).join(' ') || 'an outlet';
    if (o.status === 'septic') return { k: 'fsr', tone: 'warn', text: `The FSR says a septic system, no municipal sewer${pg}` };
    if (o.project && c.project === o.project) return { k: 'fsr', tone: 'ok', text: `The FSR names this project${pg}` };
    const mm = o.mm && c.mm ? o.mm === c.mm : null, st = o.street && c.street ? normStreet(o.street) === normStreet(c.street) : null;
    if (mm === null && st === null) return { k: 'fsr', tone: 'unk', text: `The FSR names ${said}${pg}` };
    if (mm !== false && st !== false) return { k: 'fsr', tone: 'ok', text: `The FSR names this sewer${pg}` };
    if (mm === true || st === true) return { k: 'fsr', tone: 'warn', text: `The FSR names ${said}${pg}: the ${mm === false ? 'size' : 'street'} differs` };
    return { k: 'fsr', tone: f.confidence === 'low' ? 'unk' : 'bad', text: `The FSR names a different outlet: ${said}${pg}` };
  }

  // ---- State ----------------------------------------------------------------------------------------
  const O = { shipped: [], edits: store.get('devOutletEdits', []), v: 1, loading: null, fsr: null };
  let recs = merge(O.shipped, O.edits);
  const changed = () => { recs = merge(O.shipped, O.edits); O.v++; store.set('devOutletEdits', O.edits); pipeCache.clear(); };
  function load() {
    if (O.loading) return O.loading;
    const get = u => (typeof fetch === 'function' ? fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null));
    if (DJ() && DJ().load) DJ().load().then(refresh);     // (the capital projects' new sewers)
    // (what the FSRs say: data/fsr-outlets.json, matched to a development through its FSR, js/fsr.js)
    get('data/fsr-outlets.json').then(d => { if (d && Array.isArray(d.items)) O.fsr = new Map(d.items.filter(x => x.url).map(x => [x.url, x])); nearCache.key = null; refresh(); });
    if (root.PeelFsr && root.PeelFsr.loadFsr) root.PeelFsr.loadFsr().then(() => { nearCache.key = null; refresh(); });
    if (SC() && SC().loadLocalSewers) SC().loadLocalSewers().then(() => { nearCache.key = null; pipeCache.clear(); refresh(); });     // (the local sewers)
    O.loading = get('data/dev-outlets.json').then(d => { if (d && Array.isArray(d.outlets)) O.shipped = d.outlets; recs = merge(O.shipped, O.edits); O.v++; pipeCache.clear(); refresh(); return d; });
    return O.loading;
  }
  const recordOf = (p, sys = 'wastewater') => (p ? recs.get(`${sys}|${p.key}`) || null : null);
  const setRecord = (p, rec, sys = 'wastewater') => {
    O.edits = O.edits.filter(e => idOf(e) !== `${sys}|${p.key}`);
    O.edits.push({ key: p.key, sys, ...rec, date: today(), local: true });
    changed(); refresh();
  };
  const backToAuto = (p, sys = 'wastewater') => {
    O.edits = O.edits.filter(e => idOf(e) !== `${sys}|${p.key}`);
    if (O.shipped.some(r => idOf(r) === `${sys}|${p.key}`)) O.edits.push({ key: p.key, sys, auto: true, date: today(), local: true });
    changed(); refresh();
  };

  // ---- A set outlet, for the models ----------------------------------------------------------------
  // The existing pipe a set outlet joins: the nearest pipe to its point (within 15 m), the same size where
  // there is one; a planned-main outlet joins the existing network where its route along the planned mains
  // leaves them (dcSewerPath's exit). null: no set outlet, or nothing found (the automatic one applies).
  const pipeCache = new Map();
  // The route from an outlet point along the planned mains (dc), or along the sewer being built and on (cap).
  const routeFrom = (kind, at) => (ST() ? ST().dcSewerPath({ lng: at[0], lat: at[1] }, { cap: kind === 'cap' }) : null);
  function pipeFor(p) {
    const r = recordOf(p); if (!r || r.mode !== 'set' || !r.at || !SC() || !MM().SEW.data) return null;
    if (pipeCache.has(p.key)) return pipeCache.get(p.key);
    let k = null;
    const path = r.kind === 'dc' || r.kind === 'cap' ? routeFrom(r.kind, r.at) : null;
    if (path) k = path.exit;
    else if (r.kind === 'dc') k = null;
    // (a local sewer: the trunk it drains to; not found, the trunk nearest it)
    else if (r.kind === 'local') { const l = SC().localNear(r.at[0], r.at[1], 15), x = l.find(y => SC().localPipe(y.i)[0] === r.mm) || l[0], t = x ? SC().localPipe(x.i)[4] : -1; const s = t >= 0 ? t : SC().nearestPipe(r.at[0], r.at[1], 600); k = s >= 0 ? s : null; }
    // (a sewer being built with no route traced on from it: the existing sewer nearest where it was set)
    else if (r.kind === 'cap') { const s = SC().nearestPipe(r.at[0], r.at[1], 600); k = s >= 0 ? s : null; }
    else { let s = SC().nearestPipe(r.at[0], r.at[1], 15, r.mm || 0); if (s < 0) s = SC().nearestPipe(r.at[0], r.at[1], 15); k = s >= 0 ? s : null; }
    pipeCache.set(p.key, k);
    return k;
  }
  // A set outlet's route along the planned mains (tier A in js/dc-impact.js), or 'sewer': set onto an
  // existing sewer (no planned main needed to connect), or null: none set. A sewer being built: its
  // route on from it (a planned main downstream still counts), else 'sewer' (it joins the existing ones).
  function dcRouteFor(p) {
    const r = recordOf(p); if (!r || r.mode !== 'set') return null;
    if (r.kind === 'sewer' || r.kind === 'local') return 'sewer';
    return routeFrom(r.kind, r.at) || (r.kind === 'cap' ? 'sewer' : null);
  }
  const version = () => O.v;

  // ---- The page: queue, selection, pick, preview --------------------------------------------------
  const S = { sel: store.get('dvoSel', null), mode: 'idle', cand: null, src: '', filter: store.get('dvoFilter', 'all'), all: false };
  const projectsAlong = k => {
    const pipes = MM().SEW.data.pipes, keys = new Set();
    for (let j = k, h = 0; j != null && j >= 0 && h < 3000; j = pipes[j][3], h++) { const ln = MP().pipeReliefOf(j); if (ln) keys.add(ln.p || ln.c); }
    return keys;
  };
  // The projects an outlet puts on the path: [{ key, tier, y }].
  function projectsFor(cand) {
    const m = IM().model(); if (!m || !cand) return [];
    const out = [], seen = new Set();
    const add = (key, tier) => { if (seen.has(key)) return; seen.add(key); const pr = m.projects.get(`wastewater:${key}`); out.push({ key, tier, y: pr ? pr.y1 : null }); };
    let k = cand.k;     // (a local sewer: the trunk it drains to)
    if (cand.kind === 'dc' || cand.kind === 'cap') {
      const path = routeFrom(cand.kind, cand.at);
      // (a capital project's sewer on the route is not a DC project)
      if (path) { for (const ln of [path.first, ...path.lines]) if (!ln.cap) add(ln.p || ln.c, 'A'); k = path.exit; }
      else if (cand.kind === 'cap') k = SC().nearestPipe(cand.at[0], cand.at[1], 600);
    }
    if (k != null && k >= 0) for (const key of projectsAlong(k)) { const pr = m.projects.get(`wastewater:${key}`); add(key, pr && pr.relieves && pr.relieves.status !== 'ok' ? 'B1' : 'B2'); }
    return out;
  }
  // The queue: developments relying on a DC project (needs it to connect, or for capacity), largest first.
  function queue() {
    const m = IM() && IM().model(); if (!m) return null;
    // (wastewater: a development relying only on a water project has no outlet to review here)
    const units = new Map();
    for (const pr of m.projects.values()) if (pr.sys === 'wastewater') for (const x of pr.devs) if (m.gateTiers.includes(x.tier)) units.set(x.p.key, x.units);
    const rows = [...m.byDev.values()].filter(r => units.has(r.p.key)).map(r => {
      const links = r.links.filter(l => l.sys === 'wastewater'), gate = IM().gateOf(links, m.gateTiers);
      return { r, p: r.p, units: units.get(r.p.key) || 0, rec: recordOf(r.p), links, gate, first: r.first, gap: IM().gapOf(r.first, gate) };
    });
    const f = { all: () => true, gap: x => x.gap, misfit, fsr: x => !!fsrOutletOf(x.p), todo: x => !x.rec, done: x => !!x.rec }[S.filter] || (() => true);
    return { all: rows, rows: rows.filter(f).sort((a, b) => b.units - a.units) };
  }
  const selected = () => { const q = queue(); if (!q) return null; return (S.sel && q.all.find(x => x.p.key === S.sel)) || q.rows[0] || null; };
  // A candidate outlet: a point on an existing sewer (pipe k) or on a planned DC main (line ln).
  function sewerCand(k, pt, street) {
    const pp = MM().SEW.data.pipes[k], at = r6(nearestOn(pt, SC().pipeCoords(pp)));
    return { kind: 'sewer', k, at, mm: pp[0], street: street || null, status: 'existing', label: `${pp[0]} mm sanitary sewer${street ? ` on ${street}` : ''}` };
  }
  // (a planned main says how far it is built where the capital records match it: js/capital-ea-model.js)
  const BUILD_WORD = { tendered: 'tendered', awarded: 'awarded', 'under construction': 'under construction', 'substantially complete': 'built', complete: 'built' };
  let capIdx = null, capIdxFor = null;
  function dcStatus(proj) {
    const cap = App() && App().state.capital, dc = App() && App().state.dcInfra;
    if (!cap || !dc || !CEM()) return null;
    if (capIdxFor !== cap) { capIdx = CEM().dcCapitalIndex(cap, dc); capIdxFor = cap; }
    const e = capIdx.get(proj); if (!e || e.conf === 'low' || !BUILD_WORD[e.status]) return null;
    return { raw: e.status, word: e.status === 'under construction' && e.percent != null ? `${e.percent}% built` : BUILD_WORD[e.status] };
  }
  function dcCand(ln, pt) {
    const proj = ln.p || ln.c, st = dcStatus(proj);
    return { kind: 'dc', at: r6(nearestOn(pt, ln.g)), mm: ln.d || null, project: proj, raw: st ? st.raw : null, status: st ? `planned · ${st.word}` : 'planned', label: `${ln.d ? `${ln.d} mm ` : ''}planned DC main ${proj}` };
  }
  // A local sewer (under 300 mm, data/sewers-local.json); k: the trunk it drains to.
  function localCand(i, pt, street) {
    const lp = SC().localPipe(i), into = lp[4], k = into >= 0 ? into : SC().nearestPipe(pt[0], pt[1], 600);
    return { kind: 'local', i, k: k >= 0 ? k : null, at: r6(nearestOn(pt, SC().localCoords(i))), mm: lp[0], street: street || null, status: 'existing · local sewer', label: `${lp[0]} mm local sanitary sewer${street ? ` on ${street}` : ''}` };
  }
  // A capital project's new sewer (tendered or further: js/dc-joins.js capLines).
  const capWord = s => (/complete/.test(s) ? 'recently built' : s);
  function capCand(ln, pt) {
    const street = ln.n ? String(ln.n).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : '';
    return { kind: 'cap', at: r6(nearestOn(pt, ln.g)), mm: null, street: street || null, project: ln.p, raw: ln.s, st: ln.st || null, sub: ln.sub || null, status: capWord(ln.s), label: `New sanitary sewer${street ? ` on ${street}` : ''} (${ln.p})` };
  }
  // A tap on the map while picking: the nearest existing sewer or planned DC main within r metres.
  function pickAt(lng, lat, r) {
    if (S.mode !== 'pick' && S.mode !== 'preview') return;
    const pt = [lng, lat], k = SC().nearestPipe(lng, lat, r), dc = DI().dcNearest('wastewater', pt, r), cp = capNear(pt, r)[0], lc = SC().localNear ? SC().localNear(lng, lat, r)[0] : null;
    const opts = [k >= 0 ? { m: DI().dcDist(pt, SC().pipeCoords(MM().SEW.data.pipes[k])), c: () => sewerCand(k, pt) } : null, lc ? { m: lc.m, c: () => localCand(lc.i, pt) } : null,
      dc ? { m: dc.m, c: () => dcCand(dc.ln, pt) } : null, cp ? { m: cp.m, c: () => capCand(cp.ln, pt) } : null].filter(Boolean).sort((a, b) => a.m - b.m);
    if (!opts.length) { if (U.toast) U.toast('No sewer or planned main there: tap closer to one'); return; }
    S.cand = opts[0].c();
    S.mode = 'preview'; refresh();
  }
  // ---- Evidence for a candidate (the checks above, from the app's data) ---------------------------
  // The ground at the site (js/elevation.js): asked once per development; lidar is CGVD2013, the
  // Region's sewer depths CGVD28 (0.41 m higher here: data/elevation-validation.json shiftMedian);
  // the terrain-tile fallback is CGVD28 already.
  const ELEV_SHIFT = 0.41, ground = new Map();
  function groundOf(p) {
    if (ground.has(p.key)) return ground.get(p.key);
    if (!EL() || !EL().getGround) return null;
    ground.set(p.key, undefined);
    EL().getGround(p.lat, p.lng).then(r => { ground.set(p.key, r && r.z != null ? { z: r.z + (r.source === 'lidar' ? ELEV_SHIFT : 0), src: r.source } : null); nearCache.key = null; refresh(); }, () => { ground.set(p.key, null); nearCache.key = null; refresh(); });
    return undefined;
  }
  // A sewer's invert where a point meets it, between its upstream and downstream inverts (coords run downstream).
  const invertAt = (k, at) => { const pp = MM().SEW.data.pipes[k]; return invertAlong(SC().pipeCoords(pp), pp[12], pp[13], at); };
  function invertAlong(g, up, dn, at) {
    if (!(up > 0) || !(dn > 0)) return null;
    let tot = 0, here = 0, bd = Infinity;
    for (let i = 1; i < g.length; i++) {
      const L = DI().dcM(g[i - 1], g[i]), q = nearestOn(at, [g[i - 1], g[i]]), d = DI().dcM(q, at);
      if (d < bd) { bd = d; here = tot + DI().dcM(g[i - 1], q); }
      tot += L;
    }
    return up + (dn - up) * (tot ? here / tot : 0);
  }
  // (a planned main or a sewer being built: in service once everything on its route is, the DC mains it
  // needs to connect (tier A) included; via: those not tendered)
  function outletOf(c) {
    if (c.kind === 'sewer') return { cls: 'existing', install: MM().SEW.data.pipes[c.k][7] || null, invert: invertAt(c.k, c.at) };
    if (c.kind === 'local') { const lp = SC().localPipe(c.i); return { cls: 'existing', install: lp[1] || null, invert: invertAlong(SC().localCoords(c.i), lp[2], lp[3], c.at) }; }
    const route = projectsFor(c).filter(x => x.tier === 'A' && x.key !== c.project);
    const via = route.filter(x => !dcStatus(x.key)).map(x => x.key), late = route.filter(x => x.y).sort((a, b) => b.y - a.y)[0];
    const withRoute = (o, own) => (late && (!own || late.y > own) ? { ...o, ready: late.y, readyBy: late.key, via } : { ...o, ready: own, via });
    if (c.kind === 'cap') return withRoute({ cls: /complete/.test(c.raw || '') ? 'new' : 'building', start: c.st }, c.sub);
    const m = IM() && IM().model(), pr = m && m.projects.get(`wastewater:${c.project}`);
    return withRoute({ cls: /complete/.test(c.raw || '') ? 'new' : c.raw ? 'building' : 'planned' }, pr ? pr.y1 : null);
  }
  const stepYear = (p, k) => { const row = DG() && DG().rowOf ? DG().rowOf(p) : null, st = row && row.steps.find(x => x.k === k); return st && st.d ? +String(st.d).slice(0, 4) : null; };
  // What the development's newest FSR says about its outlet (the newest one read), or null.
  function fsrOutletOf(p) {
    const F = root.PeelFsr; if (!p || !O.fsr || !F || !F.fsrFor) return null;
    const r = F.fsrFor(p); if (!r) return null;
    const hit = r.items.filter(i => i.fsr && O.fsr.has(i.fsr.url) && O.fsr.get(i.fsr.url).outlet).sort((a, b) => (b.fsr.date || '').localeCompare(a.fsr.date || ''))[0];
    return hit ? O.fsr.get(hit.fsr.url) : null;
  }
  function checksFor(p, c, first) {
    if (!p || !c) return [];
    const fc = fsrCheck(fsrOutletOf(p), c);
    return fc ? [...checksBase(p, c, first), fc] : checksBase(p, c, first);
  }
  function checksBase(p, c, first) {
    const o = outletOf(c), gr = groundOf(p), dr = App() && App().state.servicing && App().state.servicing.drainage;
    const names = ids => ids.map(id => ((dr || []).find(a => a.id === id) || {}).name || id);
    return evidence({ phase: p.phase, ssp: stepYear(p, 'ssp'), built: stepYear(p, 'built'), first, dist: DI().dcM([p.lng, p.lat], c.at), outlet: o,
      gravity: { ground: gr === undefined ? undefined : gr ? gr.z : null, invert: o.invert ?? null },
      drain: dr && AR() && p.dr ? { site: names(p.dr), outlet: names(AR().locate(dr, c.at[0], c.at[1]))[0] || null } : null });
  }
  // The outlet in use now, as a candidate: a set one from its record, else the automatic one (cur: { k, path }).
  function currentCand(p, cur, streetOf = null) {
    const c = currentCand0(p, cur);
    if (!c || !streetOf || c.street || (c.kind !== 'sewer' && c.kind !== 'local')) return c;
    const st = streetOf(c.at[0], c.at[1]);
    return st ? { ...c, street: st, label: `${c.label} on ${st}` } : c;
  }
  function currentCand0(p, cur) {
    const r = recordOf(p), site = [p.lng, p.lat];
    if (r && r.mode === 'set' && r.at) {
      if (r.kind === 'local' && SC().localNear) { const l = SC().localNear(r.at[0], r.at[1], 15), x = l.find(y => SC().localPipe(y.i)[0] === r.mm) || l[0]; if (x) return localCand(x.i, r.at); }
      if (r.kind === 'cap') { const l = capNear(r.at, 30), x = l.find(y => y.ln.p === r.project) || l[0]; if (x) return capCand(x.ln, r.at); }
      if (r.kind === 'dc') { const n = DI().dcNearest('wastewater', r.at, 30); if (n) return dcCand(n.ln, r.at); }
      if (r.kind === 'sewer' && cur && cur.k != null && cur.k >= 0) return sewerCand(cur.k, r.at);
    }
    if (cur && cur.path) return cur.path.first.cap ? capCand(cur.path.first, site) : dcCand(cur.path.first, site);
    return cur && cur.k != null && cur.k >= 0 ? sewerCand(cur.k, site) : null;
  }
  // A queue row whose outlet does not fit its stage: permitted or built, but relying on a DC main not tendered.
  function misfit(x) {
    if (stageGroup(x.p.phase, stepYear(x.p, 'ssp')) === 'early') return false;
    const planned = key => { const st = dcStatus(key); return !st; };
    if (x.rec && x.rec.mode === 'set') return x.rec.kind === 'dc' && planned(x.rec.project);
    return x.links.some(l => l.tier === 'A' && planned(l.key));
  }

  // Keep the nearest of each run: items sorted by distance; sameRun(a, b) says two are one sewer (or one
  // project), so the list shows each pipe once, not every length of it.
  function distinct(items, sameRun, max = Infinity) {
    const out = [];
    for (const it of items) { if (out.length >= max) break; if (!out.some(o => sameRun(o, it))) out.push(it); }
    return out;
  }
  // The infrastructure near a development, to pick its outlet from: existing sanitary sewers (any size:
  // a site can connect to a local sewer) and planned DC mains within r metres, nearest first, each sewer
  // run and each DC project once. Each: a candidate (as a tap makes) plus m, its distance from the site.
  const nearCache = { key: null, list: [] };     // (cleared when the ground arrives)
  // The capital projects' new sewers within r metres, nearest first ({ ln, m }); a built one already in
  // the sewer data (an existing sewer within 10 m of its middle) is left out: it is listed as existing.
  function capNear(pt, r) {
    if (!DJ() || !DJ().capReady || !DJ().capReady()) return [];
    const out = [];
    for (const ln of DJ().capLines('wastewater')) {
      const m = DI().dcDist(pt, ln.g); if (m > r) continue;
      if (/complete/.test(ln.s)) { const mid = ln.g[Math.floor(ln.g.length / 2)]; if (SC().nearestPipe(mid[0], mid[1], 10) >= 0) continue; }
      out.push({ ln, m });
    }
    return out.sort((a, b) => a.m - b.m);
  }
  function nearby(p, { r = 400, sewers = 6, locals = 4, mains = 4, streetOf = null, first = null } = {}) {     // (mains: of each, planned and being built)
    if (!p || p.lat == null || !MM().SEW.data || !MM().SEW.grid) return [];
    const key = `${p.key}|${r}|${O.v}|${App() && App().state.dcInfra ? 1 : 0}|${App() && App().state.addressPoints ? 1 : 0}|${DJ() && DJ().capReady && DJ().capReady() ? 1 : 0}|${App() && App().state.capital ? 1 : 0}|${first}|${DG() && DG().loaded && DG().loaded() ? 1 : 0}|${SC().localLoaded && SC().localLoaded() ? 1 : 0}|${O.fsr ? 1 : 0}|${root.PeelFsr && root.PeelFsr.FSR && root.PeelFsr.FSR.by ? 1 : 0}`; // (street names arrive later)
    if (nearCache.key === key) return nearCache.list;
    const pt = [p.lng, p.lat], pipes = MM().SEW.data.pipes, grid = MM().SEW.grid;
    const gx = Math.floor(pt[0] / 0.004), gy = Math.floor(pt[1] / 0.003), R = Math.ceil(r / 300), seen = new Set(), sw = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const k of grid.get(`${gx + i},${gy + j}`) || []) {
      if (seen.has(k)) continue; seen.add(k);
      const m = DI().dcDist(pt, SC().pipeCoords(pipes[k])); if (m <= r) sw.push({ k, m });
    }
    sw.sort((a, b) => a.m - b.m);
    // (one sewer: the same size, one a few lengths downstream of the other)
    const down = (a, b) => { for (let j = pipes[a][3], h = 0; j != null && j >= 0 && h < 8; j = pipes[j][3], h++) if (j === b) return true; return false; };
    // (or the same size on the same street: twin lengths the network doesn't join)
    const named = sw.map(x => { const c = sewerCand(x.k, pt), st = streetOf ? streetOf(c.at[0], c.at[1]) : ''; return { ...(st ? sewerCand(x.k, pt, st) : c), st, m: x.m }; });
    const sameSewer = (a, b) => a.mm === b.mm && ((a.st && a.st === b.st) || down(a.k, b.k) || down(b.k, a.k));
    const out = distinct(named, sameSewer, sewers).map(({ st, ...c }) => c);
    // (local sewers: one per size and street, or per size and the trunk it drains to)
    if (SC().localNear) {
      const ln = SC().localNear(pt[0], pt[1], r).map(x => { const c = localCand(x.i, pt), st = streetOf ? streetOf(c.at[0], c.at[1]) : ''; return { ...(st ? localCand(x.i, pt, st) : c), st, m: x.m }; });
      for (const { st, ...c } of distinct(ln, (a, b) => a.mm === b.mm && (a.st ? a.st === b.st : a.k === b.k), locals)) out.push(c);
    }
    const di = App() && App().state.dcInfra;
    if (di) {
      const dl = di.wastewater.lines.map(ln => ({ ln, m: DI().dcDist(pt, ln.g) })).filter(x => x.m <= r).sort((a, b) => a.m - b.m);
      for (const x of distinct(dl, (a, b) => (a.ln.p || a.ln.c) === (b.ln.p || b.ln.c), mains)) out.push({ ...dcCand(x.ln, pt), m: x.m });
    }
    for (const x of distinct(capNear(pt, r), (a, b) => a.ln.p === b.ln.p, mains)) out.push({ ...capCand(x.ln, pt), m: x.m });
    // (each with its checks; one that fails a check (bad) after those that don't, then nearest first)
    for (const c of out) { c.checks = checksFor(p, c, first); c.fit = worst(c.checks); }
    out.sort((a, b) => (a.fit === 'bad') - (b.fit === 'bad') || a.m - b.m);
    nearCache.key = key; nearCache.list = out;
    return out;
  }
  // Two candidates on the same pipe (sewer) or the same project (planned main).
  const sameOutlet = (a, b) => !!a && !!b && a.kind === b.kind && (a.kind === 'sewer' ? a.k === b.k : a.kind === 'local' ? a.i === b.i : a.project === b.project);
  // Is a candidate the outlet in use now? (cur: { k, path } as the page shows it)
  const isCurrent = (c, cur) => !!cur && (c.kind === 'sewer' ? !cur.path && cur.k === c.k : !!(cur.path && !!cur.path.first.cap === (c.kind === 'cap') && (cur.path.first.p || cur.path.first.c) === c.project));
  // The nearest point on a polyline (flat, local).
  function nearestOn(pt, g) {
    const kx = Math.cos(pt[1] * Math.PI / 180); let best = g[0], bd = Infinity;
    for (let i = 1; i < g.length; i++) {
      const [ax, ay] = g[i - 1], [bx, by] = g[i], dx = (bx - ax) * kx, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, (((pt[0] - ax) * kx) * dx + (pt[1] - ay) * dy) / L)) : 0, q = [ax + t * (bx - ax), ay + t * (by - ay)];
      const d = Math.hypot((q[0] - pt[0]) * kx, q[1] - pt[1]); if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  function download() {
    const E = root.PeelExports; if (E && E.download) E.download('dev-outlets.json', JSON.stringify(exportJSON(recs), null, 1), 'application/json');
  }
  // (the page re-renders; the models re-run on their next read: their keys carry version())
  function refresh() {
    const W = root.PeelWorkspaces; if (W && W.mode && W.mode() === 'home' && W.page && W.page() === 'outlets' && W.renderPage) W.renderPage(true);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-dvo]'); if (!t) return;
      const [act, arg] = String(t.dataset.dvo).split(':'), cur = selected(), p = cur && cur.p;
      if (act === 'pick-dev') { S.sel = t.dataset.dvoKey; store.set('dvoSel', S.sel); S.mode = 'idle'; S.cand = null; refresh(); }
      else if (act === 'filter') { S.filter = arg; store.set('dvoFilter', arg); refresh(); }
      else if (act === 'all') { S.all = !S.all; refresh(); }
      else if (!p) return;
      else if (act === 'start') { S.mode = 'pick'; S.cand = null; refresh(); }
      // (the FSR's outlet: the nearby option that matches it best)
      else if (act === 'fsr-pick') { const f = fsrOutletOf(p), rank = { ok: 0, warn: 1 }; const c = nearCache.list.map(x => ({ x, t: (fsrCheck(f, x) || {}).tone })).filter(y => y.t in rank).sort((a, b) => rank[a.t] - rank[b.t] || a.x.m - b.x.m)[0]; if (c) { S.cand = c.x; S.mode = 'preview'; refresh(); } else if (U.toast) U.toast('Nothing nearby matches the FSR’s outlet: tap it on the map'); }
      else if (act === 'near') { const c = nearCache.list[+arg]; if (c) { S.cand = c; S.mode = 'preview'; refresh(); } }
      else if (act === 'cancel') { S.mode = 'idle'; S.cand = null; refresh(); }
      else if (act === 'save' && S.cand) { const src = (document.querySelector('[data-dvo-src]') || {}).value || ''; setRecord(p, { mode: 'set', kind: S.cand.kind, at: S.cand.at, mm: S.cand.mm, ...(S.cand.project ? { project: S.cand.project } : {}), ...(src ? { src } : {}) }); S.mode = 'idle'; S.cand = null; refresh(); }
      else if (act === 'confirm') { const src = (document.querySelector('[data-dvo-src]') || {}).value || ''; setRecord(p, { mode: 'confirmed', ...(src ? { src } : {}) }); }
      else if (act === 'auto') backToAuto(p);
      else if (act === 'export') download();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.mode !== 'idle') { S.mode = 'idle'; S.cand = null; refresh(); } });
  }
  // How a record reads wherever the outlet is used.
  const recText = r => (!r ? '' : `${r.mode === 'set' ? 'outlet set by hand' : 'outlet confirmed'}${r.src ? ` · ${r.src}` : ''}${r.date ? ` · ${r.date}` : ''}${r.local ? ' (this browser)' : ''}`);

  const api = { merge, exportJSON, diff, load, recordOf, pipeFor, dcRouteFor, version, queue, selected, projectsFor, pickAt, routeFrom, nearby, evidence, worst, stageGroup, checksFor, currentCand, misfit, fsrCheck, fsrOutletOf, normStreet, distinct, isCurrent, sameOutlet, nearestOn, recText, state: S, edits: () => O.edits.length, records: () => recs, setRecord, backToAuto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevOutlets = api;
})(typeof window !== 'undefined' ? window : globalThis);
