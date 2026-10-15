#!/usr/bin/env node
/*
 * Stage 1 benchmark check for the lidar elevation sampler, run in GitHub Actions
 * (Probe data sources, mode=elev-bench):
 *  - City of Brampton survey benchmarks whose description gives the tablet's height above grade
 *    (tablets are set in walls, so ground = published elevation − height above grade);
 *  - their CGVD28 elevations moved to CGVD2013 (the lidar DTM's datum) with NRCan's own grids
 *    (HT2_2010v70 for CGVD28, CGG2013a for CGVD2013, both on NAD83(CSRS)) through PROJ's cct:
 *    H2013 − H28 = N28 − N2013;
 *  - the lidar DTM at each, and a transect from Lake Ontario onto land at Port Credit (where the
 *    lidar coverage ends) to see what a partly covered request returns.
 * Writes data/probe/elevation-bench.json (committed to the branch it runs on).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ORIGIN = 'https://jaredacostar-cmd.github.io';
const DTM = 'https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation/Ontario_DTM_LidarDerived/ImageServer';
const BM = 'https://maps1.brampton.ca/arcgis/rest/services/ACRIS/ACRIS/MapServer/15';
const q = o => new URLSearchParams(o).toString();
async function getJ(url, timeout = 60000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { Origin: ORIGIN } }); return { status: r.status, json: await r.json().catch(() => null) }; }
  catch (e) { return { status: 0, error: e.message }; } finally { clearTimeout(t); }
}
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; };
async function samples(pts) {
  const r = await getJ(`${DTM}/getSamples?${q({ geometry: JSON.stringify({ points: pts, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: true, outFields: 'Project,Resolution_m', f: 'json' })}`);
  return { status: r.status, error: (r.json && r.json.error) || r.error || null, samples: (r.json && r.json.samples) || [] };
}
// "Tablet is set 0.38m above grade" → 0.38; "below grade" → negative.
function gradeHeight(desc) {
  const m = String(desc || '').match(/(\d+(?:\.\d+)?)\s*m(?:etres?|\.)?\s*(above|below)\s*(?:the\s+)?(?:finished\s+|existing\s+)?(grade|ground)/i);
  return m ? (m[2].toLowerCase() === 'below' ? -1 : 1) * +m[1] : null;
}
// What the tablet is set in (the description itself names private addresses, so it is not kept).
const kindOf = d => /culvert|bridge|abutment|headwall|retaining/i.test(String(d || '')) ? 'structure' : /house|dwelling|residence/i.test(String(d || '')) ? 'house' : 'building';
function geoid(grid, pts) {
  // cct reads "lon lat h t" in degrees and adds the grid value to h (multiplier=1): h_out = N.
  const input = pts.map(([x, y]) => `${x} ${y} 0 0`).join('\n') + '\n';
  const out = execFileSync('cct', ['-d', '4', '+proj=vgridshift', `+grids=${grid}`, '+multiplier=1'], { input, env: { ...process.env, PROJ_NETWORK: 'ON' } }).toString();
  return out.trim().split('\n').map(l => num(l.trim().split(/\s+/)[2]));
}

(async () => {
  const out = { generatedAt: new Date().toISOString(), dtm: DTM, benchmarks: BM };

  // 1. Where coverage ends: a transect from Lake Ontario onto land at Port Credit, and one mixed request.
  const tr = Array.from({ length: 10 }, (_, i) => [-79.585, 43.535 + i * 0.003]);
  out.transect = { pts: tr, ...(await samples(tr)) };
  out.mixed = { pts: [[-79.585, 43.56], [-79.55, 43.45]], ...(await samples([[-79.585, 43.56], [-79.55, 43.45]])) };
  for (const k of ['transect', 'mixed']) out[k].samples = out[k].samples.map(s => ({ id: s.locationId, value: s.value, project: s.attributes && s.attributes.Project, res: s.attributes && s.attributes.Resolution_m }));
  console.log('transect', JSON.stringify(out.transect).slice(0, 1200));
  console.log('mixed', JSON.stringify(out.mixed).slice(0, 600));

  // 2. Benchmarks with a stated height above grade.
  const bm = await getJ(`${BM}/query?${q({ where: '1=1', outFields: 'MONUMENT,ELEVATION,DATUM_V,STATUS,VC,DESCRIPTION,LAST_INSP', returnGeometry: true, outSR: 4326, f: 'json' })}`);
  const feats = ((bm.json && bm.json.features) || []).filter(f => f.geometry && num(f.attributes.ELEVATION) > 50);
  out.benchmarkCount = feats.length;
  const cand = feats.map(f => ({ a: f.attributes, g: f.geometry, h: gradeHeight(f.attributes.DESCRIPTION) })).filter(x => x.h != null && /1978|1979/.test(String(x.a.DATUM_V)) && /active/i.test(String(x.a.STATUS)));
  out.withGradeHeight = cand.length;
  const pts = cand.map(x => [x.g.x, x.g.y]);
  // 3. CGVD28 → CGVD2013 at each point.
  let n28 = [], n13 = [];
  try { n28 = geoid('ca_nrc_HT2_2010v70.tif', pts); n13 = geoid('ca_nrc_CGG2013an83.tif', pts); out.datumShift = 'NRCan HT2_2010v70 (CGVD28) and CGG2013a (CGVD2013) via PROJ cct'; }
  catch (e) { out.datumShiftError = e.message.slice(0, 300); }
  // 4. The lidar DTM at each (40 points a request).
  const lid = [];
  for (let i = 0; i < pts.length; i += 40) {
    const r = await samples(pts.slice(i, i + 40));
    pts.slice(i, i + 40).forEach((_, k) => { const s = r.samples.find(t => t.locationId === k); lid.push(s ? { z: num(s.value), project: s.attributes && s.attributes.Project } : null); });
  }
  out.points = cand.map((x, i) => {
    const shift = n28[i] != null && n13[i] != null ? +(n28[i] - n13[i]).toFixed(3) : null;
    const ground2013 = shift != null ? +(num(x.a.ELEVATION) - x.h + shift).toFixed(3) : null;
    const l = lid[i];
    return { monument: x.a.MONUMENT, elevation28: num(x.a.ELEVATION), aboveGrade: x.h, shift, ground2013, lidar: l && l.z, project: l && l.project, diff: l && l.z != null && ground2013 != null ? +(l.z - ground2013).toFixed(3) : null, lat: +x.g.y.toFixed(6), lng: +x.g.x.toFixed(6), lastInsp: String(x.a.LAST_INSP || '').trim() || null, kind: kindOf(x.a.DESCRIPTION) };
  });
  const d = out.points.map(p => p.diff).filter(v => v != null).sort((a, b) => a - b);
  const sh = out.points.map(p => p.shift).filter(v => v != null);
  out.stats = d.length ? { n: d.length, median: d[Math.floor(d.length / 2)], p10: d[Math.floor(d.length * 0.1)], p90: d[Math.floor(d.length * 0.9)], within05: d.filter(v => Math.abs(v) <= 0.5).length, within025: d.filter(v => Math.abs(v) <= 0.25).length, shiftRange: sh.length ? [Math.min(...sh), Math.max(...sh)] : null } : null;
  console.log('bench', JSON.stringify(out.stats), out.withGradeHeight, out.datumShiftError || '');

  const file = 'data/probe/elevation-bench.json';
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`Wrote ${file}`);
})().catch(e => { console.error(e); process.exit(1); });
