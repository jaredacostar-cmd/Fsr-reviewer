/*
 * Shapefile export (zipped .shp / .shx / .dbf / .prj / .cpg) for ArcMap and ArcGIS Pro.
 *
 * Pure functions, no DOM access, no dependencies: safe to require under `node --test` and to
 * load in the browser as a plain <script> (exposes window.PeelShapefile). js/exports.js gathers
 * the layers (the same FeatureCollections as the GeoJSON exports) and downloads the zip.
 *
 * Shapefile limits, and how each is met:
 * - One shape type per file: a layer is split by family (point, multipoint, line, polygon),
 *   with a suffix only when a layer has more than one.
 * - Field names of at most 10 characters: long names are shortened (shortFieldNames) and every
 *   layer's short → full names are listed in fields.csv inside the zip.
 * - Text of at most 254 bytes: longer text is cut at a character boundary; README.txt says so.
 * - Coordinates are WGS84 longitude / latitude (.prj); text is UTF-8 (.cpg, read by ArcMap 10.x
 *   and ArcGIS Pro).
 * - Polygon rings are written clockwise (outer) and counter-clockwise (holes), the reverse of
 *   GeoJSON's order.
 * Features without a geometry are left out (counted in README.txt).
 */
(function (root) {
'use strict';

var PRJ_WGS84 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
var MAX_TEXT = 254;
var FAMILIES = {
  point: { type: 1, label: 'point' },
  multipoint: { type: 8, label: 'multipoint' },
  line: { type: 3, label: 'line' },
  polygon: { type: 5, label: 'polygon' },
};
var FAMILY_OF = { Point: 'point', MultiPoint: 'multipoint', LineString: 'line', MultiLineString: 'line', Polygon: 'polygon', MultiPolygon: 'polygon' };

var utf8 = function (s) { return new TextEncoder().encode(s); };

// ---- Field names (10 characters, letters / digits / underscore, unique ignoring case) ----
function cleanName(name) {
  var s = String(name).normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!s) s = 'field';
  if (!/^[A-Za-z]/.test(s)) s = 'f' + s;
  return s;
}
// SQL words ArcGIS won't take as a field name (definition queries, copying into a geodatabase).
var RESERVED = new Set('add alter and between by column create date delete drop exists for from group in insert into is like not null or order select set table to update values where'.split(' '));
function shortName(name) {
  var s = cleanName(name);
  if (RESERVED.has(s.toLowerCase())) return s + '_';
  if (s.length <= 10) return s;
  // Words from snake_case and camelCase; vowels after each word's first letter go first.
  var words = s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').split('_').filter(Boolean).map(function (w) { return w.toLowerCase(); });
  var strip = words.map(function (w) { return w[0] + w.slice(1).replace(/[aeiou]/g, ''); });
  var joined = strip.join('_');
  if (joined.length <= 10) return joined;
  joined = strip.join('');
  if (joined.length <= 10) return joined;
  // Still too long: trim the longest word a letter at a time (each keeps at least one letter).
  var parts = strip.slice();
  while (parts.join('').length > 10) {
    var i = 0;
    for (var k = 1; k < parts.length; k++) if (parts[k].length > parts[i].length) i = k;
    if (parts[i].length <= 1) { parts = [parts.join('').slice(0, 10)]; break; }
    parts[i] = parts[i].slice(0, -1);
  }
  return parts.join('');
}
// Short names for a layer's fields, in order, unique ignoring case (a clash gets a number).
function shortFieldNames(names) {
  var used = new Set();
  return names.map(function (n) {
    var s = shortName(n), out = s, i = 1;
    while (used.has(out.toLowerCase())) { var tag = String(i++); out = s.slice(0, 10 - tag.length) + tag; }
    used.add(out.toLowerCase());
    return out;
  });
}

// ---- Attributes (.dbf) ----
var isEmpty = function (v) { return v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v)); };
var textOf = function (v) { return isEmpty(v) ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); };
// UTF-8 bytes of s, cut to at most max bytes without splitting a character.
function cutBytes(s, max) {
  var b = utf8(s);
  if (b.length <= max) return b;
  var n = max;
  while (n > 0 && (b[n] & 0xc0) === 0x80) n--;
  return b.slice(0, n);
}
var decimalsOf = function (v) { var m = String(v).match(/\.(\d+)$/); return m ? m[1].length : 0; };
// Field definitions for a layer: numbers → N, true / false → L, everything else → C.
function fieldDefs(keys, rows) {
  var names = shortFieldNames(keys);
  return keys.map(function (key, i) {
    var vals = rows.map(function (r) { return r[key]; }).filter(function (v) { return !isEmpty(v); });
    if (vals.length && vals.every(function (v) { return typeof v === 'boolean'; })) return { key: key, name: names[i], type: 'L', width: 1, dec: 0 };
    if (vals.length && vals.every(function (v) { return typeof v === 'number' && isFinite(v); })) {
      var dec = Math.min(8, Math.max.apply(null, vals.map(decimalsOf)));
      var width = Math.max.apply(null, vals.map(function (v) { return v.toFixed(dec).length; }));
      // ArcGIS reads N(9, 0) as Long integer and N(13+, d) as Double: no narrower, so values fit when edited.
      if (width <= 19) return { key: key, name: names[i], type: 'N', width: Math.max(width, dec ? 13 : 9), dec: dec };
    }
    var w = Math.max.apply(null, [1].concat(vals.map(function (v) { return Math.min(MAX_TEXT, utf8(textOf(v)).length); })));
    var cut = vals.some(function (v) { return utf8(textOf(v)).length > MAX_TEXT; });
    return { key: key, name: names[i], type: 'C', width: w, dec: 0, cut: cut };
  });
}
function writeDbf(fields, rows) {
  var recLen = 1 + fields.reduce(function (s, f) { return s + f.width; }, 0);
  var headLen = 32 + 32 * fields.length + 1;
  var buf = new Uint8Array(headLen + recLen * rows.length + 1);
  var dv = new DataView(buf.buffer);
  var now = new Date();
  buf[0] = 0x03; buf[1] = now.getFullYear() - 1900; buf[2] = now.getMonth() + 1; buf[3] = now.getDate();
  dv.setUint32(4, rows.length, true); dv.setUint16(8, headLen, true); dv.setUint16(10, recLen, true);
  fields.forEach(function (f, i) {
    var o = 32 + 32 * i;
    buf.set(utf8(f.name), o);
    buf[o + 11] = f.type.charCodeAt(0); buf[o + 16] = f.width; buf[o + 17] = f.dec;
  });
  buf[headLen - 1] = 0x0d;
  var o = headLen;
  rows.forEach(function (r) {
    buf[o++] = 0x20;
    fields.forEach(function (f) {
      var v = r[f.key], cell;
      if (f.type === 'N') cell = isEmpty(v) ? '' : v.toFixed(f.dec);
      else if (f.type === 'L') cell = isEmpty(v) ? '?' : v ? 'T' : 'F';
      else cell = null;
      buf.fill(0x20, o, o + f.width);
      if (cell === null) buf.set(cutBytes(textOf(v), f.width), o);
      else buf.set(utf8(cell), o + (f.type === 'N' ? f.width - cell.length : 0));
      o += f.width;
    });
  });
  buf[o] = 0x1a;
  return buf;
}

// ---- Shapes (.shp / .shx) ----
var ringArea = function (ring) { var a = 0; for (var i = 0, n = ring.length; i < n; i++) { var p = ring[i], q = ring[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
var closed = function (ring) { var f = ring[0], l = ring[ring.length - 1]; return f[0] === l[0] && f[1] === l[1] ? ring : ring.concat([f]); };
// Outer rings clockwise (negative signed area), holes counter-clockwise.
var orient = function (ring, outer) { var r = closed(ring); return (ringArea(r) < 0) === outer ? r : r.slice().reverse(); };
// The parts (arrays of [x, y]) of a geometry in shapefile order.
function partsOf(g) {
  switch (g.type) {
    case 'Point': return [[g.coordinates]];
    case 'MultiPoint': return [g.coordinates];
    case 'LineString': return [g.coordinates];
    case 'MultiLineString': return g.coordinates;
    case 'Polygon': return g.coordinates.map(function (r, i) { return orient(r, i === 0); });
    case 'MultiPolygon': return [].concat.apply([], g.coordinates.map(function (poly) { return poly.map(function (r, i) { return orient(r, i === 0); }); }));
  }
  return [];
}
// A geometry the shapefile can hold: finite coordinates, lines of 2+ points, rings of 3+.
var MIN_POINTS = { point: 1, multipoint: 1, line: 2, polygon: 3 };
var validGeom = function (g) {
  if (!g || !FAMILY_OF[g.type] || !Array.isArray(g.coordinates)) return false;
  var raw = g.type === 'Point' ? [[g.coordinates]] : g.type === 'MultiPoint' || g.type === 'LineString' ? [g.coordinates]
    : g.type === 'MultiPolygon' ? [].concat.apply([], g.coordinates) : g.coordinates;
  var min = MIN_POINTS[FAMILY_OF[g.type]];
  return raw.length > 0 && raw.every(function (p) {
    return Array.isArray(p) && p.length >= min && p.every(function (c) { return Array.isArray(c) && c[0] !== null && c[1] !== null && isFinite(c[0]) && isFinite(c[1]); });
  });
};
function bboxOf(parts) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  parts.forEach(function (p) { p.forEach(function (c) { b[0] = Math.min(b[0], +c[0]); b[1] = Math.min(b[1], +c[1]); b[2] = Math.max(b[2], +c[0]); b[3] = Math.max(b[3], +c[1]); }); });
  return b;
}
function shapeContent(type, g) {
  var parts = partsOf(g).filter(function (p) { return p.length; });
  if (type === 1) {
    var c = parts[0][0], pb = new DataView(new ArrayBuffer(20));
    pb.setInt32(0, 1, true); pb.setFloat64(4, +c[0], true); pb.setFloat64(12, +c[1], true);
    return { bytes: new Uint8Array(pb.buffer), box: bboxOf(parts) };
  }
  var pts = [].concat.apply([], parts), box = bboxOf(parts);
  var multi = type === 8, size = 4 + 32 + 4 + (multi ? 0 : 4 + 4 * parts.length) + 16 * pts.length;
  var dv = new DataView(new ArrayBuffer(size)), o = 0;
  dv.setInt32(o, type, true); o += 4;
  box.forEach(function (v) { dv.setFloat64(o, v, true); o += 8; });
  if (multi) { dv.setInt32(o, pts.length, true); o += 4; }
  else {
    dv.setInt32(o, parts.length, true); dv.setInt32(o + 4, pts.length, true); o += 8;
    var start = 0;
    parts.forEach(function (p) { dv.setInt32(o, start, true); o += 4; start += p.length; });
  }
  pts.forEach(function (c) { dv.setFloat64(o, +c[0], true); dv.setFloat64(o + 8, +c[1], true); o += 16; });
  return { bytes: new Uint8Array(dv.buffer), box: box };
}
function header(type, words, box) {
  var dv = new DataView(new ArrayBuffer(100));
  dv.setInt32(0, 9994, false); dv.setInt32(24, words, false); dv.setInt32(28, 1000, true); dv.setInt32(32, type, true);
  box.forEach(function (v, i) { dv.setFloat64(36 + 8 * i, v, true); });
  return new Uint8Array(dv.buffer);
}
function writeShp(type, geoms) {
  var shapes = geoms.map(function (g) { return shapeContent(type, g); });
  var box = shapes.reduce(function (b, s) { return [Math.min(b[0], s.box[0]), Math.min(b[1], s.box[1]), Math.max(b[2], s.box[2]), Math.max(b[3], s.box[3])]; }, [Infinity, Infinity, -Infinity, -Infinity]);
  if (!shapes.length) box = [0, 0, 0, 0];
  var shpLen = 100 + shapes.reduce(function (s, x) { return s + 8 + x.bytes.length; }, 0);
  var shp = new Uint8Array(shpLen), shx = new Uint8Array(100 + 8 * shapes.length);
  shp.set(header(type, shpLen / 2, box)); shx.set(header(type, shx.length / 2, box));
  var sdv = new DataView(shp.buffer), xdv = new DataView(shx.buffer), o = 100;
  shapes.forEach(function (s, i) {
    xdv.setInt32(100 + 8 * i, o / 2, false); xdv.setInt32(104 + 8 * i, s.bytes.length / 2, false);
    sdv.setInt32(o, i + 1, false); sdv.setInt32(o + 4, s.bytes.length / 2, false);
    shp.set(s.bytes, o + 8); o += 8 + s.bytes.length;
  });
  return { shp: shp, shx: shx };
}

// ---- Layers ----
// A safe file name: letters, digits and underscores (ArcMap's geoprocessing tools dislike others).
var fileBase = function (s) { return String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'layer'; };
/**
 * One GeoJSON FeatureCollection → shapefile parts, split by shape family.
 * Returns { files: [{ name, bytes }], parts: [{ file, family, count, fields }], skipped }.
 */
function layerFiles(base, fc) {
  base = fileBase(base);
  var groups = {}, skipped = 0;
  ((fc && fc.features) || []).forEach(function (f) {
    if (!f || !validGeom(f.geometry)) { skipped++; return; }
    var fam = FAMILY_OF[f.geometry.type];
    (groups[fam] = groups[fam] || []).push(f);
  });
  var fams = Object.keys(FAMILIES).filter(function (k) { return groups[k]; });
  var files = [], parts = [];
  fams.forEach(function (fam) {
    var feats = groups[fam], name = fams.length > 1 ? base + '_' + fam : base;
    var rows = feats.map(function (f) { return f.properties || {}; });
    var keys = [];
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
    var fields = fieldDefs(keys.slice(0, 255), rows);
    if (!fields.length) fields = [{ key: '__id', name: 'id', type: 'N', width: String(rows.length).length, dec: 0 }];
    var idRows = rows.map(function (r, i) { return Object.assign({ __id: i + 1 }, r); });
    var sh = writeShp(FAMILIES[fam].type, feats.map(function (f) { return f.geometry; }));
    files.push({ name: name + '.shp', bytes: sh.shp }, { name: name + '.shx', bytes: sh.shx },
      { name: name + '.dbf', bytes: writeDbf(fields, idRows) }, { name: name + '.prj', bytes: utf8(PRJ_WGS84) }, { name: name + '.cpg', bytes: utf8('UTF-8') });
    parts.push({ file: name + '.shp', family: FAMILIES[fam].label, count: feats.length, fields: fields });
  });
  return { files: files, parts: parts, skipped: skipped };
}

// ---- Zip (stored, or deflated where the browser offers CompressionStream) ----
var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  var c = 0xffffffff;
  for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return null;
  try {
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) { return null; }
}
/** files: [{ name, bytes }] → the .zip as a Uint8Array. */
async function zip(files, opts) {
  var deflate = !(opts && opts.deflate === false);
  var d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  var locals = [], central = [], offset = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i], name = utf8(f.name), crc = crc32(f.bytes);
    var packed = deflate ? await deflateRaw(f.bytes) : null;
    var method = packed && packed.length < f.bytes.length ? 8 : 0, data = method ? packed : f.bytes;
    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, f.bytes.length, true); lh.setUint16(26, name.length, true);
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, f.bytes.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    locals.push(new Uint8Array(lh.buffer), name, data);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  var cdSize = central.reduce(function (s, b) { return s + b.length; }, 0);
  var end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  var all = locals.concat(central, [new Uint8Array(end.buffer)]);
  var out = new Uint8Array(all.reduce(function (s, b) { return s + b.length; }, 0)), o = 0;
  all.forEach(function (b) { out.set(b, o); o += b.length; });
  return out;
}

// ---- The download: every layer, fields.csv and README.txt in one zip ----
var csvCell = function (v) { var s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
/**
 * layers: [{ name, title, fc }] (fc null when that layer isn't loaded: listed as not included).
 * meta: { title, notes: [lines], props: {key: value} } for README.txt.
 * Returns Promise<{ bytes, summary }>.
 */
async function buildShapefileZip(layers, meta) {
  meta = meta || {};
  var files = [], fieldRows = [['layer_file', 'short_name', 'full_name', 'type']], lines = [], anyCut = false;
  lines.push(meta.title || 'Shapefile export', '');
  (meta.notes || []).forEach(function (l) { lines.push(l); });
  Object.keys(meta.props || {}).forEach(function (k) { if (!isEmpty(meta.props[k])) lines.push(k + ': ' + textOf(meta.props[k])); });
  lines.push('', 'Layers (WGS84 longitude / latitude; text in UTF-8):');
  var summary = [];
  layers.forEach(function (l) {
    if (!l.fc) { lines.push('- ' + l.title + ': not included (not loaded yet)'); summary.push({ title: l.title, count: 0, missing: true }); return; }
    var out = layerFiles(l.name, l.fc), count = 0;
    files = files.concat(out.files);
    out.parts.forEach(function (p) {
      count += p.count;
      lines.push('- ' + l.title + ': ' + p.file + ' (' + p.count + ' ' + p.family + ' feature' + (p.count === 1 ? '' : 's') + ')');
      p.fields.forEach(function (f) {
        if (f.key !== '__id') fieldRows.push([p.file, f.name, f.key, { C: 'text', N: 'number', L: 'yes / no' }[f.type]]);
        if (f.cut) anyCut = true;
      });
    });
    if (!out.parts.length) lines.push('- ' + l.title + ': no features');
    if (out.skipped) lines.push('  ' + out.skipped + ' without a location left out');
    summary.push({ title: l.title, count: count });
  });
  lines.push('', 'Field names are shortened to 10 characters (a shapefile limit); fields.csv lists each short name with its full name.');
  if (anyCut) lines.push('Text longer than 254 bytes is cut (a shapefile limit); the CSV and GeoJSON exports keep it in full.');
  files.push({ name: 'fields.csv', bytes: utf8(fieldRows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n') });
  files.push({ name: 'README.txt', bytes: utf8(lines.join('\r\n') + '\r\n') });
  return { bytes: await zip(files), summary: summary };
}

var api = {
  shortName: shortName,
  shortFieldNames: shortFieldNames,
  fieldDefs: fieldDefs,
  writeDbf: writeDbf,
  writeShp: writeShp,
  layerFiles: layerFiles,
  crc32: crc32,
  zip: zip,
  buildShapefileZip: buildShapefileZip,
  PRJ_WGS84: PRJ_WGS84,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.PeelShapefile = api;
})(typeof window !== 'undefined' ? window : globalThis);
