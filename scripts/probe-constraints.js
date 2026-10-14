#!/usr/bin/env node
/*
 * Diagnostic: site constraint layers covering Peel — gas pipelines, hydro (transmission) lines,
 * watercourses and conservation authority regulation limits. For each candidate service:
 * fields and coded domains, the feature count inside Peel, sample attributes, and whether a
 * browser on the site's origin may query it (CORS).
 *   node scripts/probe-constraints.js
 */
'use strict';
const SHARING = 'https://www.arcgis.com/sharing/rest';
const ORIGIN = 'https://jaredacostar-cmd.github.io';
const PEEL = { xmin: -80.16, ymin: 43.47, xmax: -79.48, ymax: 44.00 };
const BBOX = `${PEEL.xmin},${PEEL.ymin},${PEEL.xmax},${PEEL.ymax}`;
const q = o => new URLSearchParams(o).toString();
async function get(url, timeout = 40000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Origin: ORIGIN } });
    const txt = await r.text(); const cors = r.headers.get('access-control-allow-origin');
    try { const j = JSON.parse(txt); Object.defineProperty(j, '_cors', { value: cors }); return j; } catch { return { status: r.status, text: txt.slice(0, 200), _cors: cors }; }
  } catch (e) { return { error: { message: e.message } }; } finally { clearTimeout(t); }
}
const inPeel = { geometry: BBOX, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects' };
const seen = new Set();
async function layer(url, opts = {}) {
  if (seen.has(url)) return; seen.add(url);
  const info = await get(`${url}?f=json`);
  if (info.error || info.status) return console.log(`    ${url} ERROR ${JSON.stringify(info.error || info.status).slice(0, 160)}`);
  if ((info.layers || info.tables) && !info.fields) {
    console.log(`  SERVICE ${url}: ${(info.layers || []).map(l => `${l.id}:${l.name}`).join(' | ').slice(0, 1500)}`);
    for (const l of (info.layers || [])) if (!opts.match || opts.match.test(l.name)) await layer(`${url}/${l.id}`);
    return;
  }
  const cnt = await get(`${url}/query?${q({ where: '1=1', ...inPeel, returnCountOnly: true, f: 'json' })}`);
  const smp = await get(`${url}/query?${q({ where: '1=1', ...inPeel, outFields: '*', returnGeometry: false, resultRecordCount: 4, f: 'json' })}`);
  console.log(`    LAYER ${url} "${info.name}" geom=${info.geometryType} inPeel=${cnt.count ?? JSON.stringify(cnt.error || cnt.status)} maxRec=${info.maxRecordCount} formats=${info.supportedQueryFormats} cors=${info._cors} minScale=${info.minScale} maxScale=${info.maxScale}`);
  console.log(`      fields: ${(info.fields || []).map(f => `${f.name}:${f.type.replace('esriFieldType', '')}`).join(', ').slice(0, 900)}`);
  for (const f of (info.fields || [])) if (f.domain && f.domain.codedValues) console.log(`      domain ${f.name}: ${f.domain.codedValues.map(c => `${c.code}=${c.name}`).join('; ').slice(0, 900)}`);
  if (info.types && info.types.length) console.log(`      types (${info.typeIdField}): ${info.types.map(t => `${t.id}=${t.name}`).join('; ').slice(0, 900)}`);
  for (const f of (smp.features || [])) console.log(`      sample: ${JSON.stringify(f.attributes).slice(0, 400)}`);
  // Counts by a type / class field inside Peel.
  for (const fld of (opts.groupBy || [])) {
    if (!(info.fields || []).some(f => f.name === fld)) continue;
    const st = await get(`${url}/query?${q({ where: '1=1', ...inPeel, groupByFieldsForStatistics: fld, outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: info.objectIdField || 'OBJECTID', outStatisticFieldName: 'n' }]), f: 'json' })}`);
    console.log(`      by ${fld}: ${(st.features || []).map(x => `${x.attributes[fld]}=${x.attributes.n}`).join('; ').slice(0, 900) || JSON.stringify(st.error || '').slice(0, 200)}`);
  }
}
async function search(query, label, match, num = 30) {
  const r = await get(`${SHARING}/search?${q({ q: query, num, f: 'json' })}`);
  console.log(`\n=== ${label}: ${(r.results || []).length}`);
  for (const it of r.results || []) {
    console.log(`  ITEM "${it.title}" type=${it.type} owner=${it.owner} url=${it.url || ''} modified=${new Date(it.modified).toISOString().slice(0, 10)}`);
    if (it.url && /Feature Service|Map Service/.test(it.type) && (!match || match.test(it.title))) await layer(it.url.replace(/\/$/, ''));
  }
}
async function overpass(label, ql) {
  const body = `[out:json][timeout:120];(${ql});out tags 400;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(body), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const j = await r.json(); const els = j.elements || [];
    const tally = {}; for (const e of els) { const t = e.tags || {}; const k = [t.power || '', t.substance || t.type || '', t.voltage || '', t.operator || ''].join('|'); tally[k] = (tally[k] || 0) + 1; }
    console.log(`\n=== OSM ${label}: ${els.length} ways (cors=${r.headers.get('access-control-allow-origin')})`);
    console.log('  ' + Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k}=${n}`).join('\n  '));
  } catch (e) { console.log(`\n=== OSM ${label}: ERROR ${e.message}`); }
}
(async () => {
  const FS = '(type:"Feature Service" OR type:"Map Service")';
  const LIO = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA';
  console.log('### Province (LIO): utility lines (hydro, gas), watercourses');
  await layer(`${LIO}/LIO_Open05/MapServer/11`, { groupBy: ['UTILITY_LINE_TYPE', 'UTILITY_TYPE', 'TYPE', 'FEATURE_TYPE', 'UTILITY_LINE_CLASS', 'CLASS'] });
  await layer(`${LIO}/LIO_Open01/MapServer/26`, { groupBy: ['WATERCOURSE_TYPE', 'FLOW_DIRECTION', 'PERMANENCY', 'HYDRO_FEATURE_TYPE'] });
  await layer(`${LIO}/LIO_Open01/MapServer/25`);
  console.log('\n### Conservation authorities');
  await layer('https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/ArcGIS/rest/services/TRCA_Regulation_Limit2/FeatureServer');
  await layer('https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/ArcGIS/rest/services/CreditRiver_PublicView/FeatureServer');
  const org = await get('https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/ArcGIS/rest/services?f=json');
  console.log(`  org d0ZCwU7eGKVeNiEE services: ${(org.services || []).map(s => s.name).join(' | ').slice(0, 3000)}`);
  for (const s of org.services || []) if (/regul|watercourse|hazard|flood|wetland/i.test(s.name)) await layer(s.url);
  await search(`${FS} AND ("regulation limit" OR "regulated area" OR "regulation area") AND (CVC OR "Credit Valley")`, 'CVC regulation limit', /regul/i);
  await search(`${FS} AND ("regulation limit" OR "regulated area") AND (TRCA OR "Toronto and Region")`, 'TRCA regulation limit', /regul/i);
  await search(`${FS} AND ("regulation limit" OR "regulated area" OR "regulation mapping") AND ("Conservation Halton" OR Halton)`, 'Conservation Halton regulation limit', /regul/i);
  await search(`${FS} AND ("regulation limit" OR "regulated area") AND (NVCA OR "Nottawasaga")`, 'NVCA regulation limit', /regul/i);
  await search(`${FS} AND ("regulation limit" OR "regulated area") AND (Ontario OR "conservation authority")`, 'Any CA regulation limit', /regul/i, 50);
  await search(`${FS} AND (watercourse OR stream OR creek) AND (Peel OR Brampton OR Mississauga OR Caledon OR "Credit Valley")`, 'Watercourses (Peel)', /water|stream|creek|hydro/i);
  await search(`${FS} AND ("transmission line" OR "hydro corridor" OR "gas pipeline" OR pipeline OR "utility corridor") AND (Ontario OR Peel)`, 'Hydro / gas', /transmi|hydro|pipe|utility|gas/i);
  console.log('\n### OpenStreetMap (Overpass) in Peel');
  const b = `${PEEL.ymin},${PEEL.xmin},${PEEL.ymax},${PEEL.xmax}`;
  await overpass('power lines', `way["power"~"^(line|minor_line|cable)$"](${b});`);
  await overpass('gas pipelines', `way["man_made"="pipeline"](${b});`);
})().catch(e => { console.error(e); process.exit(1); });
