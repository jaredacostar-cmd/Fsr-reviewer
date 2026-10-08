#!/usr/bin/env node
/*
 * Diagnostic: what aerial imagery and building footprints cover Peel, how recent they
 * are, and whether a browser page can read their pixels (CORS).
 *   node scripts/probe-imagery.js
 */
'use strict';
const CFG = require('../js/config.js');
const SHARING = 'https://www.arcgis.com/sharing/rest';
const ORIGIN = 'https://jaredacostar-cmd.github.io';
const PTS = { 'Square One (Mississauga)': [-79.6411, 43.5931], 'Mount Pleasant (Brampton)': [-79.8178, 43.6766], 'Bolton (Caledon)': [-79.7330, 43.8770] };

async function req(url, { json = true, timeout = 30000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { Origin: ORIGIN }, signal: ctl.signal });
    const cors = r.headers.get('access-control-allow-origin');
    const type = r.headers.get('content-type');
    const body = json ? await r.json().catch(() => null) : Buffer.from(await r.arrayBuffer());
    return { status: r.status, cors, type, body };
  } catch (e) { return { status: 'ERR ' + e.message }; } finally { clearTimeout(t); }
}
const q = (o) => new URLSearchParams(o).toString();
const short = s => String(s ?? '').replace(/\s+/g, ' ').slice(0, 160);
// Web Mercator tile for lng/lat at zoom z.
function tileOf(lng, lat, z) {
  const n = 2 ** z, x = Math.floor((lng + 180) / 360 * n);
  const r = lat * Math.PI / 180, y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
  return { x, y, z };
}

async function describe(url) {
  const base = url.replace(/\/$/, '');
  const info = await req(`${base}?f=json`);
  const b = info.body || {};
  const lods = b.tileInfo && b.tileInfo.lods ? `${b.tileInfo.lods[0].level}-${b.tileInfo.lods[b.tileInfo.lods.length - 1].level}` : '-';
  console.log(`  ${base}\n    status=${info.status} cors=${info.cors} name="${short(b.name || b.mapName || b.serviceDescription)}" cached=${!!b.singleFusedMapCache || !!b.tileInfo} lods=${lods} wkid=${b.spatialReference && (b.spatialReference.latestWkid || b.spatialReference.wkid)}`);
  console.log(`    copyright="${short(b.copyrightText)}" desc="${short(b.description || b.serviceDescription)}"`);
  if (b.timeInfo) console.log(`    timeInfo=${JSON.stringify(b.timeInfo).slice(0, 200)}`);
  const [lng, lat] = Object.values(PTS)[0];
  if (b.tileInfo) {
    const t = tileOf(lng, lat, 17);
    const r = await req(`${base}/tile/${t.z}/${t.y}/${t.x}`, { json: false });
    console.log(`    tile z17 status=${r.status} cors=${r.cors} type=${r.type} bytes=${r.body ? r.body.length : 0}`);
  } else if (/ImageServer|MapServer/.test(base)) {
    const d = 0.002, op = /ImageServer/.test(base) ? 'exportImage' : 'export';
    const r = await req(`${base}/${op}?${q({ bbox: `${lng - d},${lat - d},${lng + d},${lat + d}`, bboxSR: 4326, size: '256,256', format: 'jpg', f: 'image' })}`, { json: false });
    console.log(`    ${op} status=${r.status} cors=${r.cors} type=${r.type} bytes=${r.body ? r.body.length : 0}`);
  }
}

async function search(query, num = 40) {
  const r = await req(`${SHARING}/search?${q({ q: query, num, f: 'json', sortField: 'modified', sortOrder: 'desc' })}`);
  return (r.body && r.body.results) || [];
}
async function orgOf(host) {
  const r = await req(`https://hub.arcgis.com/api/v3/domains/${host}`);
  return r.body && r.body.orgId;
}

(async () => {
  console.log('=== Esri Wayback releases');
  const wb = await req('https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json');
  const rel = Object.entries(wb.body).map(([id, v]) => ({ id, date: v.itemTitle.match(/\d{4}-\d{2}-\d{2}/)[0], meta: v.metadataLayerUrl })).sort((a, b) => b.date.localeCompare(a.date));
  console.log(`  config cors=${wb.cors} releases=${rel.length} newest=${rel[0].date} oldest=${rel[rel.length - 1].date}`);
  for (const [name, [lng, lat]] of Object.entries(PTS)) {
    const t = tileOf(lng, lat, 18);
    const tile = await req(`https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${rel[0].id}/18/${t.y}/${t.x}`, { json: false });
    console.log(`  ${name}: wayback tile status=${tile.status} cors=${tile.cors} bytes=${tile.body ? tile.body.length : 0}`);
    // Capture date of the imagery at this point, for the newest and a few older releases.
    for (const r of [rel[0], rel[12], rel[24], rel[48], rel[72]].filter(Boolean)) {
      const id = await req(`${r.meta}/identify?${q({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', sr: 4326, layers: 'all', tolerance: 1, mapExtent: `${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}`, imageDisplay: '400,400,96', returnGeometry: false, f: 'json' })}`);
      const res = (id.body && id.body.results) || [];
      const a = res.find(x => x.attributes && (x.attributes.SRC_DATE || x.attributes.SRC_DATE2)) || {};
      const at = a.attributes || {};
      console.log(`    release ${r.date}: meta status=${id.status} cors=${id.cors} layer="${a.layerName || ''}" SRC_DATE=${at.SRC_DATE || at.SRC_DATE2 || '?'} SRC_RES=${at.SRC_RES || '?'} SRC_DESC="${short(at.SRC_DESC || at.NICE_DESC)}" keys=${Object.keys(at).join(',').slice(0, 160)}`);
    }
  }
  console.log('\n=== Current Esri World Imagery');
  await describe('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer');
  await describe('https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer');

  console.log('\n=== Municipal / regional imagery on ArcGIS Online');
  const hosts = (CFG.hubs || []).map(h => h.host).concat(['data.peelregion.ca', 'peel-region-open-data-portal-peelregion.hub.arcgis.com', 'geohub.brampton.ca', 'data.mississauga.ca', 'data-caledon.opendata.arcgis.com']);
  const orgs = new Map();
  for (const h of new Set(hosts)) { const o = await orgOf(h); console.log(`  hub ${h} -> org ${o}`); if (o) orgs.set(o, h); }
  const IMG = '(type:"Image Service" OR type:"Map Service" OR type:"Tile Layer" OR type:"WMTS" OR type:"Vector Tile Service")';
  const seen = new Set();
  const show = async it => {
    if (!it.url || seen.has(it.url)) return; seen.add(it.url);
    console.log(`\n  ITEM "${it.title}" type=${it.type} owner=${it.owner} modified=${new Date(it.modified).toISOString().slice(0, 10)} tags=${(it.tags || []).slice(0, 8).join('|')}`);
    await describe(it.url);
  };
  for (const o of orgs.keys()) {
    for (const it of await search(`orgid:${o} AND ${IMG} AND (ortho* OR aerial OR imagery OR photo OR orthophoto OR orthoimagery)`)) await show(it);
  }
  for (const it of await search(`${IMG} AND (orthophoto OR orthoimagery OR "aerial imagery" OR ortho) AND (Peel OR Mississauga OR Brampton OR Caledon)`, 60)) await show(it);

  console.log('\n=== ArcGIS Server catalogs (imagery folders)');
  for (const server of ['https://maps1.brampton.ca/arcgis/rest/services', 'https://gis.peelregion.ca/arcgis/rest/services', 'https://maps.peelregion.ca/arcgis/rest/services', 'https://gis.mississauga.ca/arcgis/rest/services', 'https://www.mississauga.ca/arcgis/rest/services', 'https://maps.caledon.ca/arcgis/rest/services', 'https://gis.caledon.ca/arcgis/rest/services']) {
    const root = await req(`${server}?f=json`);
    console.log(`  ${server} status=${root.status} folders=${root.body && root.body.folders ? root.body.folders.join(',').slice(0, 300) : '-'}`);
    if (!root.body || !root.body.folders) continue;
    const svcs = [...(root.body.services || [])];
    for (const f of root.body.folders) { const r = await req(`${server}/${f}?f=json`); svcs.push(...((r.body && r.body.services) || [])); }
    for (const s of svcs.filter(s => /ortho|aerial|imag|photo|air/i.test(s.name))) await describe(`${server}/${s.name}/${s.type}`);
  }

  console.log('\n=== Building footprints');
  for (const o of orgs.keys()) {
    for (const it of await search(`orgid:${o} AND type:"Feature Service" AND (footprint OR footprints OR "building outline" OR buildings)`)) {
      if (!it.url) continue;
      const lyr = /\/\d+$/.test(it.url) ? it.url : `${it.url}/0`;
      const info = await req(`${lyr}?f=json`);
      const [lng, lat] = Object.values(PTS)[0];
      const cnt = await req(`${lyr}/query?${q({ geometry: `${lng - 0.003},${lat - 0.003},${lng + 0.003},${lat + 0.003}`, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', returnCountOnly: true, f: 'json' })}`);
      console.log(`  "${it.title}" ${lyr} modified=${new Date(it.modified).toISOString().slice(0, 10)} cors=${info.cors} geom=${info.body && info.body.geometryType} fields=${info.body && info.body.fields ? info.body.fields.map(f => f.name).join(',').slice(0, 300) : '-'} countNearSquareOne=${cnt.body && cnt.body.count}`);
    }
  }
  for (const it of await search('type:"Feature Service" AND (Microsoft building footprints OR MSBFP) AND (Canada OR Ontario)', 10)) {
    console.log(`  MS "${it.title}" ${it.url} owner=${it.owner}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
