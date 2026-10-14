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
async function get(url, timeout = 25000) {
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
  const body = `[out:json][timeout:80];(${ql});out tags 400;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(body), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(90000) });
    const j = await r.json(); const els = j.elements || [];
    const tally = {}; for (const e of els) { const t = e.tags || {}; const k = [t.power || '', t.substance || t.type || '', t.voltage || '', t.operator || ''].join('|'); tally[k] = (tally[k] || 0) + 1; }
    console.log(`\n=== OSM ${label}: ${els.length} ways (cors=${r.headers.get('access-control-allow-origin')})`);
    console.log('  ' + Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k}=${n}`).join('\n  '));
  } catch (e) { console.log(`\n=== OSM ${label}: ERROR ${e.message}`); }
}
// Response sizes and type lists the app depends on (node scripts/probe-constraints.js quick).
async function quick() {
  const size = async (label, url, params) => {
    const t0 = Date.now(), ctl = AbortSignal.timeout(120000);
    try { const r = await fetch(`${url}/query?${q(params)}`, { signal: ctl, headers: { Origin: ORIGIN } }); const txt = await r.text(); let n = ''; try { const j = JSON.parse(txt); n = (j.features || []).length; } catch {} console.log(`  SIZE ${label}: ${(txt.length / 1e6).toFixed(2)} MB, ${n} features, ${Date.now() - t0} ms, status ${r.status}`); }
    catch (e) { console.log(`  SIZE ${label}: ERROR ${e.message}`); }
  };
  const tile = (x, y, d = 0.02) => ({ geometry: `${x},${y},${x + d},${y + d}`, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects' });
  const CVC = 'https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/arcgis/rest/services/Generic_Regulations_Limit_2025/FeatureServer/0';
  const TRCA = 'https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/ArcGIS/rest/services/TRCA_Regulation_Limit2/FeatureServer/0';
  const UL = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open05/MapServer/11';
  const OHN = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open01/MapServer/26';
  console.log('### Quick: sizes');
  for (const off of [0.00005, 0.0001, 0.0002]) await size(`CVC regulation limit, whole, offset ${off}`, CVC, { where: '1=1', outFields: 'objectid', returnGeometry: true, outSR: 4326, maxAllowableOffset: off, geometryPrecision: 5, f: 'geojson' });
  await size('CVC regulation limit, 2 km tile in Brampton', CVC, { where: '1=1', ...tile(-79.78, 43.68), outFields: 'objectid', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.00005, geometryPrecision: 5, f: 'geojson' });
  await size('CVC regulation limit, quantized view 2 km tile', CVC, { where: '1=1', ...tile(-79.78, 43.68), outFields: 'objectid', returnGeometry: true, outSR: 4326, f: 'json', quantizationParameters: JSON.stringify({ mode: 'view', originPosition: 'upperLeft', tolerance: 0.00005, extent: { xmin: -79.78, ymin: 43.68, xmax: -79.76, ymax: 43.70, spatialReference: { wkid: 4326 } } }) });
  await size('TRCA regulation limit, 2 km tile in Brampton east', TRCA, { where: '1=1', ...tile(-79.70, 43.74), outFields: 'OBJECTID', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.00005, f: 'geojson' });
  await size('OHN watercourse, 2 km tile', OHN, { where: '1=1', ...tile(-79.74, 43.68), outFields: 'WATERCOURSE_TYPE,OFFICIAL_NAME_LABEL', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.00005, f: 'geojson' });
  console.log('### Quick: utility line types in Peel');
  const st = await get(`${UL}/query?${q({ where: '1=1', ...inPeel, groupByFieldsForStatistics: 'CLASS_SUBTYPE', outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]), f: 'json' })}`);
  console.log('  ' + JSON.stringify((st.features || []).map(f => f.attributes)).slice(0, 1500) + JSON.stringify(st.error || ''));
  const all = await get(`${UL}/query?${q({ where: '1=1', ...inPeel, outFields: 'CLASS_SUBTYPE,OPERATING_STATUS_IND,LOCATION_DESCR,GENERAL_COMMENTS', returnGeometry: false, f: 'json' })}`);
  const tally = {}; for (const f of all.features || []) { const a = f.attributes; const k = `${a.CLASS_SUBTYPE} | ${a.LOCATION_DESCR || ''} | ${a.GENERAL_COMMENTS || ''}`; tally[k] = (tally[k] || 0) + 1; }
  console.log('  ' + Object.entries(tally).map(([k, n]) => `${n} × ${k}`).join('\n  '));
  const wt = await get(`${OHN}/query?${q({ where: '1=1', ...inPeel, groupByFieldsForStatistics: 'WATERCOURSE_TYPE', outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]), f: 'json' })}`);
  console.log('  OHN types: ' + JSON.stringify((wt.features || []).map(f => f.attributes)));
  const nm = await get(`${OHN}/query?${q({ where: "OFFICIAL_NAME_LABEL IS NOT NULL", ...inPeel, returnCountOnly: true, f: 'json' })}`);
  console.log('  OHN named in Peel: ' + JSON.stringify(nm));
  console.log('### Quick: OpenStreetMap, one 2 km tile');
  for (const [l, ql] of [['power', 'way["power"~"^(line|minor_line|cable)$"]'], ['pipeline', 'way["man_made"="pipeline"]']]) {
    const t0 = Date.now();
    try { const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(`[out:json][timeout:25];${ql}(43.68,-79.78,43.80,-79.60);out tags;`), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN }, signal: AbortSignal.timeout(60000) });
      const txt = await r.text(); let els = []; try { els = JSON.parse(txt).elements || []; } catch {}
      const tally = {}; for (const e of els) { const t = e.tags || {}; const k = [t.power || t.man_made, t.substance || '', t.voltage || '', t.operator || ''].join('|'); tally[k] = (tally[k] || 0) + 1; }
      console.log(`  OSM ${l}: status ${r.status} ${els.length} ways ${Date.now() - t0} ms cors=${r.headers.get('access-control-allow-origin')} ${Object.entries(tally).map(([k, n]) => `${k}=${n}`).join('; ').slice(0, 600)}`); }
    catch (e) { console.log(`  OSM ${l}: ERROR ${e.message}`); }
  }
}
(async () => {
  if (process.argv[2] === 'quick') return quick();
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
