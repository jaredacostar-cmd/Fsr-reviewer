#!/usr/bin/env node
/*
 * Diagnostic: list the development / planning / permit feature services each
 * Peel municipality publishes, with layers, fields, record counts, sample
 * status values and date ranges. Prints compact text for reading in CI logs.
 *
 * Usage: node scripts/probe-sources.js
 */
'use strict';
const CFG = require('../js/config.js');
const A = require('../js/arcgis.js');
const P = require('../js/phases.js');

const SHARING = 'https://www.arcgis.com/sharing/rest';
const BROAD = '(development OR permit OR permits OR application OR applications OR planning OR subdivision OR "site plan" OR zoning OR building OR construction OR housing OR "official plan" OR growth OR units OR dwelling)';
const get = (url, params) => A.fetchJSON(url, params, { timeout: 45000 });
const short = s => String(s == null ? '' : s).replace(/\s+/g, ' ').slice(0, 70);

async function orgOf(host) {
  try { return (await get(`https://hub.arcgis.com/api/v3/domains/${host}`, {})).orgId; }
  catch (e) { console.log(`  domain lookup failed: ${e.message}`); return null; }
}

async function search(q) {
  const out = [];
  for (let start = 1; start > 0 && out.length < 400;) {
    const r = await get(`${SHARING}/search`, { q, num: 100, start, f: 'json', sortField: 'modified', sortOrder: 'desc' });
    out.push(...(r.results || [])); start = r.nextStart;
  }
  return out;
}

async function describeLayer(url) {
  const info = await get(url, { f: 'json' });
  const fm = P.detectFields(info.fields || []);
  let count = '?';
  try { count = (await get(`${url}/query`, { where: '1=1', returnCountOnly: true, f: 'json' })).count; } catch (e) { count = `err ${e.message}`; }
  console.log(`    LAYER ${url}  "${info.name}" geom=${info.geometryType || 'none'} count=${count} max=${info.maxRecordCount}`);
  console.log(`      fields: ${(info.fields || []).map(f => `${f.name}:${String(f.type).replace('esriFieldType', '')}`).join(', ').slice(0, 1500)}`);
  console.log(`      detected: id=${fm.id} addr=${fm.address} status=${fm.status} type=${fm.type} desc=${fm.description} units=${fm.units} mix=${JSON.stringify(fm.unitMix)} dates=${fm.dates.map(d => `${d.field}->${d.event}`).join(' ')}`);
  for (const f of [fm.status, fm.type].filter(Boolean)) {
    try {
      const r = await get(`${url}/query`, { where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: f, outStatisticFieldName: 'n' }]), groupByFieldsForStatistics: f, orderByFields: 'n DESC', f: 'json' });
      console.log(`      ${f} values: ${(r.features || []).slice(0, 25).map(x => `${short(x.attributes[f])}=${x.attributes.n}`).join(' | ')}`);
    } catch (e) { console.log(`      ${f} values: err ${e.message}`); }
  }
  for (const d of fm.dates.slice(0, 4)) {
    try {
      const r = await get(`${url}/query`, { where: '1=1', outStatistics: JSON.stringify([{ statisticType: 'min', onStatisticField: d.field, outStatisticFieldName: 'lo' }, { statisticType: 'max', onStatisticField: d.field, outStatisticFieldName: 'hi' }]), f: 'json' });
      const a = (r.features || [])[0]?.attributes || {};
      const fmt = v => typeof v === 'number' ? new Date(v).toISOString().slice(0, 10) : v;
      console.log(`      ${d.field} range: ${fmt(a.lo)} .. ${fmt(a.hi)}`);
    } catch (e) { /* stats unsupported */ }
  }
  try {
    const r = await get(`${url}/query`, { where: '1=1', outFields: '*', resultRecordCount: 2, returnGeometry: false, f: 'json' });
    for (const x of (r.features || [])) console.log(`      sample: ${JSON.stringify(x.attributes).slice(0, 1200)}`);
  } catch (e) { console.log(`      sample: err ${e.message}`); }
}

async function main() {
  // With URLs as arguments, describe just those layers / services.
  const targets = process.argv.slice(2).filter(a => /^https?:/.test(a));
  if (targets.length) {
    for (const t of targets) {
      console.log(`\n  --- ${t}`);
      try { for (const l of (await A.resolveLayers(t)).slice(0, 12)) await describeLayer(l.url); }
      catch (e) { console.log(`    error: ${e.message}`); }
    }
    return;
  }
  for (const hub of CFG.hubs) {
    console.log(`\n===== ${hub.municipality} (${hub.host})`);
    const org = await orgOf(hub.host);
    console.log(`  orgId=${org}`);
    let items = [];
    try {
      items = await search(org ? `orgid:${org} AND type:"Feature Service" AND ${BROAD}` : `type:"Feature Service" AND "${hub.municipality}" AND ${BROAD}`);
    } catch (e) { console.log(`  search failed: ${e.message}`); }
    console.log(`  ${items.length} feature services matched the broad query`);
    for (const it of items) console.log(`  ITEM ${it.id} | ${short(it.title)} | ${it.url} | modified ${new Date(it.modified).toISOString().slice(0, 10)}`);
    try {
      const picked = await A.discoverHub(hub, CFG);
      console.log(`  app discovery picks ${picked.length}: ${picked.map(p => `${p.kind}:${short(p.name)}`).join(' ; ')}`);
    } catch (e) { console.log(`  app discovery failed: ${e.message}`); }
    // Describe the likely-relevant ones in detail.
    const rel = items.filter(it => /permit|develop|application|subdivision|site plan|zoning|official plan|planning|growth|housing|units/i.test(it.title) && !CFG.discoverExclude.test(it.title)).slice(0, 14);
    for (const it of rel) {
      console.log(`\n  --- ${short(it.title)}`);
      try {
        for (const l of (await A.resolveLayers(it.url)).slice(0, 4)) await describeLayer(l.url);
      } catch (e) { console.log(`    error: ${e.message}`); }
    }
  }
  console.log('\n===== Configured services');
  for (const s of CFG.services) {
    console.log(`\n  --- ${s.id}`);
    try { for (const l of (await A.resolveLayers(s.url)).slice(0, 3)) await describeLayer(l.url); }
    catch (e) { console.log(`    error: ${e.message}`); }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
