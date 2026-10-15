#!/usr/bin/env node
/*
 * Build data/capital.json (Region of Peel capital projects, "Proposed Projects - Line") and
 * data/capital-links-audit.json (how the DC capital program matches those records).
 *   - Pages the layer (max 1,000 a page) with outSR=4326; UTM 17N coordinates are converted
 *     locally if the server ignores outSR.
 *   - Only the whitelisted fields in scripts/capital-lib.js are kept: no people, contractors,
 *     conflict notes or comments.
 *   - DC works (data/dc-infra.json lines, scripts/dc-facilities.json items) are matched by
 *     component, project, then street + overlapping line; data/capital-overrides.json applies last.
 * Prints field names, value counts and match rates (no record-level capital data) for the log.
 * Usage: node scripts/build-capital.js --out <dir> [--raw file.json]
 *   --raw: build from a saved layer response ({ features: [...] }) instead of fetching.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./capital-lib.js');
const F = require('./facilities-lib.js');

const LAYER = 'https://gisprd.peelregion.ca/arcgis/rest/services/SampleWorldCities/MapServer/4';
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const outDir = arg('--out') || 'data';
const root = path.join(__dirname, '..');
const UA = { 'user-agent': 'peel-dev-tracker (+https://github.com/jaredacostar-cmd/fsr-reviewer)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, params) {
  const qs = new URLSearchParams(params);
  let last;
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(`${url}?${qs}`, { headers: UA });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j;
    } catch (e) { last = e; await sleep(1500 * (k + 1)); }
  }
  throw last;
}

async function fetchLayer() {
  const info = await getJSON(LAYER, { f: 'json' });
  console.log(`Layer "${info.name}" geom=${info.geometryType} sr=${info.extent?.spatialReference?.wkid || info.sourceSpatialReference?.wkid} max=${info.maxRecordCount}`);
  const fields = (info.fields || []).map(f => f.name);
  console.log(`Fields (${fields.length}): ${(info.fields || []).map(f => `${f.name}${f.alias && f.alias !== f.name ? ` ("${f.alias}")` : ''}`).join(', ')}`);
  const mapped = new Set(Object.values(C.KEEP).flat().map(s => s.toLowerCase()));
  const never = new Set(C.NEVER.map(s => s.toLowerCase()));
  console.log(`Kept: ${fields.filter(f => mapped.has(f.toLowerCase())).join(', ')}`);
  console.log(`Dropped (never stored): ${fields.filter(f => never.has(f.toLowerCase())).join(', ')}`);
  console.log(`Dropped (not in the keep list): ${fields.filter(f => !mapped.has(f.toLowerCase()) && !never.has(f.toLowerCase())).join(', ')}`);
  const missing = Object.entries(C.KEEP).filter(([, names]) => !names.some(n => fields.some(f => f.toLowerCase() === n.toLowerCase()))).map(([k]) => k);
  if (missing.length) console.log(`WARNING keep-list keys with no field on the layer: ${missing.join(', ')}`);

  const oid = info.objectIdField || (info.fields || []).find(f => f.type === 'esriFieldTypeOID')?.name || 'OBJECTID';
  const size = Math.min(1000, info.maxRecordCount || 1000);
  const base = { where: '1=1', outFields: '*', returnGeometry: true, outSR: 4326, f: 'json' };
  const pageable = info.advancedQueryCapabilities ? info.advancedQueryCapabilities.supportsPagination !== false : !!info.supportsPagination;
  const out = [];
  if (pageable) {
    for (let offset = 0; ; offset += size) {
      const j = await getJSON(`${LAYER}/query`, { ...base, orderByFields: `${oid} ASC`, resultOffset: offset, resultRecordCount: size });
      const f = j.features || [];
      out.push(...f);
      if (offset === 0) console.log(`Response spatial reference: ${j.spatialReference?.latestWkid || j.spatialReference?.wkid}`);
      if (!f.length || (!j.exceededTransferLimit && f.length < size)) break;
    }
  } else {
    const ids = ((await getJSON(`${LAYER}/query`, { where: '1=1', returnIdsOnly: true, f: 'json' })).objectIds || []).sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i += 200) {
      const j = await getJSON(`${LAYER}/query`, { ...base, where: '', objectIds: ids.slice(i, i + 200).join(',') });
      out.push(...(j.features || []));
    }
  }
  let count = null;
  try { count = (await getJSON(`${LAYER}/query`, { where: '1=1', returnCountOnly: true, f: 'json' })).count; } catch { /* optional */ }
  console.log(`Fetched ${out.length} features (server count ${count ?? '?'})`);
  // Shapes of the id fields (digits → 9, letters → A), so matching rules can be tuned without
  // printing record-level values.
  for (const n of ['ProjectNumber', 'ComponentID']) {
    const m = {};
    for (const f of out) { const v = f.attributes?.[n]; const k = v == null || v === '' ? '(blank)' : String(v).replace(/[0-9]/g, '9').replace(/[A-Za-z]/g, 'A'); m[k] = (m[k] || 0) + 1; }
    console.log(`${n} shapes: ${Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, c]) => `${k}=${c}`).join(' | ')}`);
  }
  return { features: out, valueCounts: valueCounts(out, ['WorkType', 'Phase', 'ProjectStatus', 'Municipality']) };
}

// Value counts of a few classification fields (aggregate only, for tuning the rules).
function valueCounts(features, names) {
  const out = {};
  for (const n of names) {
    const m = {};
    for (const f of features) { const a = f.attributes || f.properties || {}; const k = Object.keys(a).find(x => x.toLowerCase() === n.toLowerCase()); const v = k ? String(a[k] ?? '(blank)').trim() || '(blank)' : '(no field)'; m[v] = (m[v] || 0) + 1; }
    out[n] = Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
  }
  return out;
}

const readJSON = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; } };

async function main() {
  const raw = arg('--raw') ? readJSON(arg('--raw'), { features: [] }) : await fetchLayer();
  const vc = raw.valueCounts || valueCounts(raw.features, ['WorkType', 'Phase', 'ProjectStatus', 'Municipality']);
  for (const [k, m] of Object.entries(vc)) console.log(`${k}: ${Object.entries(m).slice(0, 40).map(([v, n]) => `${v}=${n}`).join(' | ')}`);

  const records = C.uniqueIds(raw.features.map(C.toRecord));
  const overrides = readJSON(path.join(root, 'data', 'capital-overrides.json'), { links: [] });
  const works = C.dcWorks(readJSON(path.join(root, 'data', 'dc-infra.json'), {}), readJSON(path.join(root, 'scripts', 'dc-facilities.json'), {}));
  const links = C.matchDc(works, records, overrides);
  const aud = C.audit(works, records, links);

  // Capital work at a facility: candidate rules modelled side by side (aggregate results only).
  const sv = readJSON(path.join(root, 'data', 'servicing.json'), {});
  const facs = F.registry({ waterFacilities: readJSON(path.join(root, 'data', 'water-facilities.json'), { facilities: [] }).facilities, wwFacilities: readJSON(path.join(root, 'data', 'ww-facilities.json'), { facilities: [] }).facilities, wwPlants: sv.plants || [], dcInfra: readJSON(path.join(root, 'data', 'dc-infra.json'), {}) });
  const RULES = ['project', 'near:25', 'near:50', 'near:100', 'near:200', 'nearsys:50', 'nearsys:100', 'nearsys:200', 'nearsysnew:50', 'nearsysnew:100', 'nearsysnew:200'];
  const model = F.modelRules(facs, records, RULES, readJSON(path.join(root, 'scripts', 'dc-facilities.json'), {}));
  aud.facilityRules = { facilities: facs.length, rules: model };

  const lastUpdate = records.map(r => r.lastUpdate).filter(Boolean).sort().pop() || null;
  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: { layer: LAYER, name: 'Proposed Projects - Line', description: 'Current, historic and future capital projects undertaken by the Region of Peel', latestLastUpdate: lastUpdate },
    note: 'General screening results only. Peel\'s W&WW Infrastructure Planning team must validate or confirm all results.',
    counts: C.tally(records),
    records,
    links,
  };
  if (C.hasForbidden(out)) throw new Error('a personnel / contractor / notes field reached the output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'capital.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(outDir, 'capital-links-audit.json'), JSON.stringify({ version: 1, generatedAt: out.generatedAt, ...aud }, null, 1));

  console.log('\nRecords by system × status:');
  for (const [s, m] of Object.entries(out.counts)) console.log(`  ${s.padEnd(10)} ${Object.entries(m).map(([k, n]) => `${k}=${n}`).join('  ')}`);
  console.log(`Slip computable: ${records.filter(r => r.slip).length}; with geometry: ${records.filter(r => r.geometry).length}; latest LastUpdate ${lastUpdate}`);
  console.log(`\nDC match: ${JSON.stringify(aud.counts)}`);
  const by = (list, f) => list.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
  console.log(`Unmatched DC works: ${aud.unmatchedDc.length} ${JSON.stringify(by(aud.unmatchedDc, w => `${w.system} ${w.kind}`))} (full list in capital-links-audit.json)`);
  console.log(`Links by system: ${JSON.stringify(by(links, l => `${l.dc.split(':')[0]} ${l.method}`))}`);
  console.log(`\nCapital work at a facility (${facs.length} facilities) — rule: links | facilities linked | max per facility | lines on 2+ facilities | agree with project rule`);
  for (const [r, m] of Object.entries(model)) console.log(`  ${r.padEnd(15)} ${String(m.links).padStart(5)} ${String(m.facilitiesLinked).padStart(4)} ${String(m.maxPerFacility).padStart(4)} ${String(m.capitalOnSeveralFacilities).padStart(4)} ${String(m.agreesWithProject).padStart(4)}  status ${JSON.stringify(m.byStatus)}  types ${JSON.stringify(m.byWorkType)}`);
  for (const rule of ['project', 'nearsysnew:100']) {
    const ls = F.facilityCapitalLinks(facs, records, rule, readJSON(path.join(root, 'scripts', 'dc-facilities.json'), {}));
    const per = ls.reduce((m, l) => { const f = facs.find(x => x.key === l.facility); const k = f ? f.name : l.facility; (m[k] = m[k] || []).push(l); return m; }, {});
    console.log(`  ${rule} by facility: ${Object.entries(per).sort((a, b) => b[1].length - a[1].length).slice(0, 25).map(([k, v]) => `${k} ${v.length} (${[...new Set(v.map(l => records.find(r => r.id === l.capital).workType))].slice(0, 2).join('/')}, ${Math.min(...v.map(l => l.distM))}–${Math.max(...v.map(l => l.distM))} m)`).join('; ')}`);
  }
  console.log(`Unmatched capital water / wastewater records: ${aud.unmatchedCapital.length}; low-confidence links: ${aud.lowConfidence.length}; schedule differences: ${aud.scheduleDiffs.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
