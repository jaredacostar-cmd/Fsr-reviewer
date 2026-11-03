'use strict';
// Bucket 3: match each Region development application to the app's developments (projects).
//
// Reads a JSON list of applications (from build_app_check.py) and the app's data directory, builds
// the developments exactly as the app does (scripts/app-devs.js), and for each application returns
// the best match and the evidence the workbook needs. It only reads: nothing in the app changes.
//
//   node app_match.js <apps.json> <out.json> [dataDir]
//
// Match tiers, most to least reliable:
//   file      the Region file number, translated to the municipality's own numbering, is one of the
//             development's files, and that file is within FILE_MAX_M of the point
//   site      the point falls inside the outline of one of the development's applications
//   address   a development within NEAR_M whose address has the same street number and street name
//   nearby    a development within NEAR_M, address not confirmed
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const { loadAppDevs } = require(path.join(REPO, 'scripts', 'app-devs.js'));
const P = require(path.join(REPO, 'js', 'phases.js'));

const FILE_MAX_M = 1000;   // a file-number match further away than this is reported, not used
const NEAR_M = 150;        // nearest-development search radius
const BASE_END = Date.UTC(2021, 11, 31, 23, 59, 59);   // D13: end of 2021
const MUNI_BY_LETTER = { B: 'Brampton', M: 'Mississauga', C: 'Caledon' };

// Region file number -> candidate references in the municipality's own numbering.
function candidates(file) {
  const out = [];
  const re = /(21T|T|[A-Z]{1,6})[- ]?(\d{2})[- ]?(\d{3,5})([A-Z])?/g;
  for (const m of String(file || '').toUpperCase().matchAll(re)) {
    const [, pre, yy, num, letter] = m;
    const muni = MUNI_BY_LETTER[letter] || null;
    const n = String(Number(num));
    const yyyy = `20${yy}`;
    const refs = [];
    if (muni === 'Brampton') {
      const br = { SP: 'SPA', OZ: 'OZS', RZ: 'OZS', PRE: 'PRE', DPS: 'DPS' }[pre];
      if (br) refs.push(`${br}-${yyyy}-${num.padStart(4, '0')}`);
    } else if (muni === 'Mississauga') {
      if (pre === 'OZ' || pre === 'RZ') refs.push(`OZ/OPA ${yy}-${n}`, `OZ ${yy} ${n}`);
      if (pre === 'SP') refs.push(`SP ${yy}-${n}`, `SP ${yy}/${num}`);
      if (pre === '21T' || pre === 'T') refs.push(`21T-M ${yy}-${Number(num.slice(-3))}`, `21T-M -${yy}${num}`);
    } else if (muni === 'Caledon') {
      if (pre === '21T' || pre === 'T') refs.push(`21T-${yy}${num}C`, `21T-${yy}${num}`);
      else refs.push(`${yyyy}-${num.padStart(4, '0')}`);   // Caledon numbers each type separately
    }
    out.push({ muni, refs, raw: m[0] });
  }
  return out;
}

const rad = x => (x * Math.PI) / 180;
function metres(a, b) {
  const dp = rad(b.lat - a.lat), dl = rad(b.lng - a.lng);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dl / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
function inPoly(pt, poly) {
  if (!Array.isArray(poly)) return false;
  const rings = typeof poly[0]?.[0] === 'number' ? [poly] : poly;
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > pt.lat) !== (yj > pt.lat) && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
function polyArea(poly) {   // rough size, for picking the most specific outline
  const rings = typeof poly[0]?.[0] === 'number' ? [poly] : poly;
  let a = 0;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}
function recDist(pt, r) {
  if (r.poly && inPoly(pt, r.poly)) return 0;
  return r.lat == null ? Infinity : metres(pt, { lat: r.lat, lng: r.lng });
}
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function addressAgrees(a, p) {
  if (!a.streetnum || !a.streetname) return false;
  const name = norm(a.streetname).split(' ')[0];
  const texts = [p.title, ...(p.records || []).map(r => r.address)].map(norm);
  return texts.some(t => new RegExp(`(^| )${a.streetnum}( |-|$)`).test(t) && t.includes(name));
}
const iso = d => (d ? new Date(d).toISOString().slice(0, 10) : null);

// Units completed by the end of 2021, after it, or undated, from the development's permits.
// Mississauga permits carry a completion date; Brampton and Caledon permits only an issue date, so
// for those the issue year is reported and the workbook applies the issue-date proxy.
function completion(p) {
  const out = { dated_by_2021: 0, dated_after_2021: 0, issued_by_2020: 0, issued_2021: 0, issued_after_2021: 0, undated: 0 };
  for (const r of p.records || []) {
    if (r.kind !== 'permit' || r.phase !== 'completed' || !(r.units > 0)) continue;
    const done = (r.events || []).filter(e => e.phase === 'completed').map(e => Date.parse(e.date)).filter(Boolean);
    const issued = (r.events || []).filter(e => e.phase === 'permit').map(e => Date.parse(e.date)).filter(Boolean);
    if (done.length) out[Math.min(...done) <= BASE_END ? 'dated_by_2021' : 'dated_after_2021'] += r.units;
    else if (issued.length) {
      const y = new Date(Math.min(...issued)).getUTCFullYear();
      out[y <= 2020 ? 'issued_by_2020' : y === 2021 ? 'issued_2021' : 'issued_after_2021'] += r.units;
    } else out.undated += r.units;
  }
  return out;
}

function describe(p, how, extra) {
  const apps = (p.records || []).filter(r => r.kind === 'application');
  return {
    how, ...extra,
    key: p.key, title: p.title, municipality: p.municipality, phase: p.phase,
    units: p.units ?? null, types: p.types || null, newBuild: p.newBuild ?? null, legacyOnly: !!p.legacyOnly,
    buildout: p.buildout ? { planned: p.buildout.planned ?? null, permitted: p.buildout.permitted ?? null,
      completed: p.buildout.completed ?? null, remaining: p.buildout.remaining ?? null } : null,
    milestones: Object.fromEntries(Object.entries(p.milestones || {}).map(([k, v]) => [k, iso(v)])),
    completion: completion(p),
    files: apps.map(r => ({ ref: r.ref, type: r.type, status: r.statusRaw, phase: r.phase, units: r.units ?? null })),
  };
}

function main() {
  const [appsPath, outPath, dataDir] = process.argv.slice(2);
  const apps = JSON.parse(fs.readFileSync(appsPath, 'utf8'));
  const data = loadAppDevs(dataDir || path.join(REPO, 'data'));
  const projectOf = new Map();
  for (const p of data.projects) for (const r of p.records || []) projectOf.set(r.uid, p);
  const byKey = new Map();
  for (const p of data.projects) {
    for (const r of p.records || []) {
      if (r.kind !== 'application') continue;
      const k = `${r.municipality}|${r.fileKey || P.canonRef(r.ref)}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    }
  }
  const appRecs = data.projects.flatMap(p => (p.records || []).filter(r => r.kind === 'application' && r.poly));

  const results = apps.map(a => {
    const pt = { lat: a.lat, lng: a.lng };
    const notes = [];
    // 1. file number
    for (const c of candidates(a.file)) {
      for (const ref of c.refs) {
        const recs = byKey.get(`${c.muni}|${P.canonRef(ref)}`) || [];
        const near = recs.map(r => ({ r, d: recDist(pt, r) })).sort((x, y) => x.d - y.d)[0];
        if (!near) continue;
        if (near.d <= FILE_MAX_M) {
          return { id: a.id, ...describe(projectOf.get(near.r.uid), 'file',
            { matchedRef: near.r.ref, regionRef: c.raw, dist_m: Math.round(near.d), notes }) };
        }
        notes.push(`File ${near.r.ref} exists but is ${(near.d / 1000).toFixed(1)} km away; not used`);
      }
    }
    // 2. inside an application outline: current developments before ones made only of legacy files
    //    (pre-2000s site plans carried over without dates), then the smallest outline (most specific)
    const legacy = r => !!projectOf.get(r.uid)?.legacyOnly;
    const inside = appRecs.filter(r => Math.abs(r.lat - a.lat) < 0.05 && Math.abs(r.lng - a.lng) < 0.05 && inPoly(pt, r.poly))
      .sort((x, y) => (legacy(x) - legacy(y)) || (polyArea(x.poly) - polyArea(y.poly)));
    if (inside.length) {
      const p = projectOf.get(inside[0].uid);
      const others = [...new Set(inside.slice(1).map(r => projectOf.get(r.uid)).filter(q => q && q !== p).map(q => q.title))];
      return { id: a.id, ...describe(p, 'site', { matchedRef: inside[0].ref, dist_m: 0, notes, alsoInside: others.slice(0, 5) }) };
    }
    // 3./4. nearest development
    let best = null, bd = Infinity;
    for (const p of data.projects) {
      if (p.lat == null || Math.abs(p.lat - a.lat) > 0.01 || Math.abs(p.lng - a.lng) > 0.015) continue;
      const d = metres(pt, p);
      if (d < bd) { bd = d; best = p; }
    }
    if (best && bd <= NEAR_M) {
      const how = addressAgrees(a, best) ? 'address' : 'nearby';
      return { id: a.id, ...describe(best, how, { dist_m: Math.round(bd), notes }) };
    }
    return { id: a.id, how: 'none', notes, nearest_m: best ? Math.round(bd) : null };
  });
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(),
    appDataAt: JSON.parse(fs.readFileSync(path.join(dataDir || path.join(REPO, 'data'), 'refresh.json'), 'utf8')).shown || null,
    results }, null, 1));
  const c = {};
  for (const r of results) c[r.how] = (c[r.how] || 0) + 1;
  console.log(`matched ${results.length} applications:`, JSON.stringify(c));
}

main();
