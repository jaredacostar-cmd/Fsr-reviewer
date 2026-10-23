'use strict';
/* Shapefile export (js/export-shapefile.js): field names, attribute types, shapes, ring order
 * and the zip, read back byte by byte; plus the Export menu wiring. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const S = require('../js/export-shapefile.js');

const root = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(root, f), 'utf8');

// Minimal zip reader: { name: bytes } (stored or deflated entries).
function unzip(buf) {
  const b = Buffer.from(buf), out = {};
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let o = b.readUInt32LE(end + 16);
  for (let i = 0; i < b.readUInt16LE(end + 10); i++) {
    assert.equal(b.readUInt32LE(o), 0x02014b50);
    const method = b.readUInt16LE(o + 10), crc = b.readUInt32LE(o + 16), size = b.readUInt32LE(o + 20);
    const nlen = b.readUInt16LE(o + 28), elen = b.readUInt16LE(o + 30), clen = b.readUInt16LE(o + 32), lo = b.readUInt32LE(o + 42);
    const name = b.toString('utf8', o + 46, o + 46 + nlen);
    const start = lo + 30 + b.readUInt16LE(lo + 26) + b.readUInt16LE(lo + 28);
    const data = b.subarray(start, start + size);
    const bytes = method === 8 ? zlib.inflateRawSync(data) : data;
    assert.equal(S.crc32(bytes), crc, `${name} crc`);
    out[name] = bytes;
    o += 46 + nlen + elen + clen;
  }
  return out;
}
// .dbf → { fields: [{ name, type, width, dec }], rows: [{ name: raw text }] }
function readDbf(b) {
  b = Buffer.from(b);
  const n = b.readUInt32LE(4), head = b.readUInt16LE(8), rec = b.readUInt16LE(10), fields = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) fields.push({ name: b.toString('latin1', o, o + 11).replace(/\0.*$/, ''), type: String.fromCharCode(b[o + 11]), width: b[o + 16], dec: b[o + 17] });
  const rows = [];
  for (let i = 0; i < n; i++) {
    let o = head + i * rec + 1; const r = {};
    for (const f of fields) { r[f.name] = b.toString('utf8', o, o + f.width).trim(); o += f.width; }
    rows.push(r);
  }
  assert.equal(b[head + n * rec], 0x1a, 'dbf ends with 0x1A');
  return { fields, rows };
}

test('field names: 10 characters at most, unique ignoring case', () => {
  assert.equal(S.shortName('units'), 'units');
  assert.equal(S.shortName('water_avg_lps'), 'wtravglps');
  assert.deepEqual(['from', 'to', 'Date'].map(S.shortName), ['from_', 'to_', 'Date_'], 'SQL reserved words');
  const names = S.shortFieldNames(['pressure_zone_nearest_m', 'pressure_zone_nearest_km', 'Units', 'units', '2026 cost', 'café_name']);
  for (const n of names) { assert.ok(n.length <= 10, n); assert.match(n, /^[A-Za-z][A-Za-z0-9_]*$/); }
  assert.equal(new Set(names.map(n => n.toLowerCase())).size, names.length);
});

test('attribute types: numbers N (Long / Double widths), true / false L, the rest C cut at 254 bytes', () => {
  const rows = [{ n: 12, d: 0.25, b: true, t: 'x', mix: 1, long: 'é'.repeat(200) }, { n: '', d: 1.5, b: false, t: null, mix: 'a' }];
  const f = Object.fromEntries(S.fieldDefs(Object.keys(rows[0]), rows).map(x => [x.key, x]));
  assert.deepEqual([f.n.type, f.n.width, f.n.dec], ['N', 9, 0]);
  assert.deepEqual([f.d.type, f.d.width, f.d.dec], ['N', 13, 2]);
  assert.equal(f.b.type, 'L');
  assert.equal(f.mix.type, 'C');
  assert.deepEqual([f.long.type, f.long.width, f.long.cut], ['C', 254, true]);
  const dbf = readDbf(S.writeDbf(Object.values(f), rows));
  assert.equal(dbf.rows[0].n, '12'); assert.equal(dbf.rows[1].n, '');
  assert.equal(dbf.rows[0].d, '0.25'); assert.equal(dbf.rows[0].b, 'T'); assert.equal(dbf.rows[1].b, 'F');
  assert.equal(dbf.rows[0].long, 'é'.repeat(127), 'cut at a character boundary');
});

test('a layer splits by shape type; rings are written clockwise outside, counter-clockwise for holes', () => {
  const fc = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-79.7, 43.6] }, properties: { a: 1 } },
    { type: 'Feature', geometry: null, properties: { a: 2 } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.7, 43.6]] }, properties: { a: 3 } },   // one point: not a line
    { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[-79.7, 43.6], [-79.6, 43.7]], [[-79.5, 43.5], [-79.4, 43.4]]] }, properties: { a: 4 } },
    // GeoJSON order (outer counter-clockwise, hole clockwise), hole left open.
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [1, 2], [2, 2], [2, 1]]] }, properties: { a: 5 } },
  ] };
  const out = S.layerFiles('Peel test-layer', fc);
  assert.equal(out.skipped, 2);
  assert.deepEqual(out.parts.map(p => [p.file, p.count]), [['peel_test_layer_point.shp', 1], ['peel_test_layer_line.shp', 1], ['peel_test_layer_polygon.shp', 1]]);
  const file = n => Buffer.from(out.files.find(f => f.name === n).bytes);
  for (const base of ['peel_test_layer_point', 'peel_test_layer_line', 'peel_test_layer_polygon']) {
    const shp = file(`${base}.shp`), shx = file(`${base}.shx`);
    assert.equal(shp.readInt32BE(0), 9994); assert.equal(shp.readInt32BE(24) * 2, shp.length);
    assert.equal(shx.readInt32BE(24) * 2, shx.length);
    assert.equal(shx.readInt32BE(100) * 2, 100, 'first record right after the header');
    assert.ok(file(`${base}.prj`).toString().startsWith('GEOGCS["GCS_WGS_1984"'));
    assert.equal(file(`${base}.cpg`).toString(), 'UTF-8');
  }
  const pt = file('peel_test_layer_point.shp');
  assert.deepEqual([pt.readInt32LE(32), pt.readInt32LE(108), pt.readDoubleLE(112), pt.readDoubleLE(120)], [1, 1, -79.7, 43.6]);
  const poly = file('peel_test_layer_polygon.shp'), o = 108;
  assert.equal(poly.readInt32LE(o), 5);
  assert.deepEqual([poly.readInt32LE(o + 36), poly.readInt32LE(o + 40)], [2, 10], 'two rings, the hole closed');
  const pts = Array.from({ length: 10 }, (_, i) => [poly.readDoubleLE(o + 52 + 16 * i), poly.readDoubleLE(o + 60 + 16 * i)]);
  const area = r => r.slice(0, -1).reduce((s, p, i) => s + p[0] * r[i + 1][1] - r[i + 1][0] * p[1], 0) / 2;
  assert.ok(area(pts.slice(0, 5)) < 0, 'outer ring clockwise');
  assert.ok(area(pts.slice(5)) > 0, 'hole counter-clockwise');
});

test('the zip: every layer, fields.csv and README.txt; stored and deflated entries read back', async () => {
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-79.7, 43.6] }, properties: { address: '1 Main St', pressure_zone_nearest_m: 30 } }] };
  const { bytes, summary } = await S.buildShapefileZip([{ name: 'peel_developments', title: 'Developments', fc }, { name: 'peel_eas', title: 'EAs', fc: null }], { title: 'Test', props: { disclaimer: 'Unofficial prototype' } });
  assert.deepEqual(summary, [{ title: 'Developments', count: 1 }, { title: 'EAs', count: 0, missing: true }]);
  const files = unzip(bytes);
  assert.deepEqual(Object.keys(files).sort(), ['README.txt', 'fields.csv', ...['cpg', 'dbf', 'prj', 'shp', 'shx'].map(e => `peel_developments.${e}`)].sort());
  const readme = files['README.txt'].toString();
  assert.match(readme, /disclaimer: Unofficial prototype/);
  assert.match(readme, /EAs: not included \(not loaded yet\)/);
  assert.match(files['fields.csv'].toString(), /peel_developments\.shp,prsznnrstm,pressure_zone_nearest_m,number/);
  assert.equal(readDbf(files['peel_developments.dbf']).rows[0].address, '1 Main St');
  const stored = unzip(await S.zip([{ name: 'a.txt', bytes: new TextEncoder().encode('hello') }], { deflate: false }));
  assert.equal(stored['a.txt'].toString(), 'hello');
});

test('Export menu: a Shapefiles item wired to exportShapefiles; the module loads and is cached offline', () => {
  const top = src('js/topbar.js');
  assert.match(top, /data-tbx="shp">Shapefiles \(\.zip\)/);
  assert.match(top, /shp: PE\(\)\.exportShapefiles/);
  assert.match(src('js/exports.js'), /async function exportShapefiles\(\)/);
  assert.match(src('index.html'), /<script src="js\/export-shapefile\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('sw.js'), /'js\/export-shapefile\.js'/);
});
