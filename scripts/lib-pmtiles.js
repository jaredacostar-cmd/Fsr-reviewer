'use strict';
// A minimal PMTiles v3 writer and reader (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md)
// for the 3D view's tiles: a root directory, and leaf directories once there are too many tiles for
// the root (the spec's 16 KiB header + root), gzip-compressed directories and metadata, identical
// tiles stored once. No dependencies.
const zlib = require('zlib');

const TYPE = { mvt: 1, png: 2, jpg: 3, webp: 4 };
const COMPRESSION = { none: 1, gzip: 2 };

// Tile id: the tiles of all lower zooms, then the Hilbert index within the zoom.
function zxyToTileId(z, x, y) {
  let acc = 0; for (let t = 0; t < z; t++) acc += 4 ** t;
  const n = 2 ** z, xy = [x, y]; let d = 0;
  for (let s = n / 2; s >= 1; s /= 2) {
    const rx = (xy[0] & s) > 0 ? 1 : 0, ry = (xy[1] & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) { if (rx === 1) { xy[0] = s - 1 - xy[0]; xy[1] = s - 1 - xy[1]; } const t = xy[0]; xy[0] = xy[1]; xy[1] = t; }
  }
  return acc + d;
}

function writeVarint(out, v) { while (v >= 0x80) { out.push((v % 0x80) | 0x80); v = Math.floor(v / 0x80); } out.push(v); }
function readVarint(buf, pos) { let v = 0, mul = 1, b; do { b = buf[pos.i++]; v += (b & 0x7f) * mul; mul *= 0x80; } while (b & 0x80); return v; }

function encodeDirectory(entries) {
  const out = []; writeVarint(out, entries.length);
  let last = 0; for (const e of entries) { writeVarint(out, e.tileId - last); last = e.tileId; }
  for (const e of entries) writeVarint(out, e.runLength);
  for (const e of entries) writeVarint(out, e.length);
  entries.forEach((e, i) => writeVarint(out, i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length ? 0 : e.offset + 1));
  return Buffer.from(out);
}
function decodeDirectory(buf) {
  const pos = { i: 0 }, n = readVarint(buf, pos), es = [];
  let last = 0; for (let i = 0; i < n; i++) { last += readVarint(buf, pos); es.push({ tileId: last }); }
  for (const e of es) e.runLength = readVarint(buf, pos);
  for (const e of es) e.length = readVarint(buf, pos);
  es.forEach((e, i) => { const v = readVarint(buf, pos); e.offset = v === 0 && i > 0 ? es[i - 1].offset + es[i - 1].length : v - 1; });
  return es;
}

const u64 = (b, o, v) => { b.writeUInt32LE(v % 2 ** 32, o); b.writeUInt32LE(Math.floor(v / 2 ** 32), o + 4); };
const r64 = (b, o) => b.readUInt32LE(o) + b.readUInt32LE(o + 4) * 2 ** 32;
const e7 = v => Math.round(v * 1e7);

// tiles: [{ z, x, y, data: Buffer }] (already compressed as tileCompression says).
// opts: { type: 'png' | 'mvt', tileCompression: 'none' | 'gzip', bounds: [w, s, e, n], metadata: {} }
function write(tiles, opts) {
  const byId = tiles.map(t => ({ ...t, tileId: zxyToTileId(t.z, t.x, t.y) })).sort((a, b) => a.tileId - b.tileId);
  const seen = new Map(), chunks = [], entries = []; let offset = 0;
  for (const t of byId) {
    const key = t.data.toString('base64');
    let at = seen.get(key);
    if (at == null) { at = offset; seen.set(key, at); chunks.push(t.data); offset += t.data.length; }
    const prev = entries[entries.length - 1];
    if (prev && prev.tileId + prev.runLength === t.tileId && prev.offset === at && prev.length === t.data.length) prev.runLength++;
    else entries.push({ tileId: t.tileId, offset: at, length: t.data.length, runLength: 1 });
  }
  const meta = zlib.gzipSync(Buffer.from(JSON.stringify(opts.metadata || {})));
  // The root alone while it fits; else leaf directories of `per` entries each, the root pointing at
  // them (an entry with run length 0), doubling `per` until the root fits.
  let root = zlib.gzipSync(encodeDirectory(entries)), leaves = Buffer.alloc(0);
  if (root.length > 16384 - 127) {
    for (let per = 4096; ; per *= 2) {
      const parts = [], rootEntries = []; let lo = 0;
      for (let i = 0; i < entries.length; i += per) {
        const leaf = zlib.gzipSync(encodeDirectory(entries.slice(i, i + per)));
        rootEntries.push({ tileId: entries[i].tileId, offset: lo, length: leaf.length, runLength: 0 });
        parts.push(leaf); lo += leaf.length;
      }
      root = zlib.gzipSync(encodeDirectory(rootEntries)); leaves = Buffer.concat(parts);
      if (root.length <= 16384 - 127) break;
    }
  }
  const data = Buffer.concat(chunks), h = Buffer.alloc(127);
  const zs = byId.map(t => t.z), [w, s, e, n] = opts.bounds;
  h.write('PMTiles', 0, 'ascii'); h[7] = 3;
  u64(h, 8, 127); u64(h, 16, root.length);
  u64(h, 24, 127 + root.length); u64(h, 32, meta.length);
  u64(h, 40, 127 + root.length + meta.length); u64(h, 48, leaves.length);
  u64(h, 56, 127 + root.length + meta.length + leaves.length); u64(h, 64, data.length);
  u64(h, 72, byId.length); u64(h, 80, entries.length); u64(h, 88, seen.size);
  h[96] = 1; h[97] = COMPRESSION.gzip; h[98] = COMPRESSION[opts.tileCompression || 'none']; h[99] = TYPE[opts.type];
  h[100] = Math.min(...zs); h[101] = Math.max(...zs);
  h.writeInt32LE(e7(w), 102); h.writeInt32LE(e7(s), 106); h.writeInt32LE(e7(e), 110); h.writeInt32LE(e7(n), 114);
  h[118] = Math.max(...zs); h.writeInt32LE(e7((w + e) / 2), 119); h.writeInt32LE(e7((s + n) / 2), 123);
  return Buffer.concat([h, root, meta, leaves, data]);
}

// Reader (tests and checks): { header, metadata, get(z, x, y) → Buffer | null }.
function read(buf) {
  if (buf.toString('ascii', 0, 7) !== 'PMTiles' || buf[7] !== 3) throw new Error('not a PMTiles v3 archive');
  const header = {
    rootOffset: r64(buf, 8), rootLength: r64(buf, 16), metaOffset: r64(buf, 24), metaLength: r64(buf, 32), leafOffset: r64(buf, 40), leafLength: r64(buf, 48),
    dataOffset: r64(buf, 56), dataLength: r64(buf, 64), addressed: r64(buf, 72), entries: r64(buf, 80), contents: r64(buf, 88),
    internalCompression: buf[97], tileCompression: buf[98], tileType: buf[99], minZoom: buf[100], maxZoom: buf[101],
    bounds: [buf.readInt32LE(102) / 1e7, buf.readInt32LE(106) / 1e7, buf.readInt32LE(110) / 1e7, buf.readInt32LE(114) / 1e7],
  };
  const un = b => header.internalCompression === COMPRESSION.gzip ? zlib.gunzipSync(b) : b;
  const dir = decodeDirectory(un(buf.subarray(header.rootOffset, header.rootOffset + header.rootLength)));
  const metadata = JSON.parse(un(buf.subarray(header.metaOffset, header.metaOffset + header.metaLength)).toString('utf8') || '{}');
  // (a leaf: the last root entry at or before the id with run length 0)
  const leafCache = new Map();
  const leaf = e => { if (!leafCache.has(e.offset)) leafCache.set(e.offset, decodeDirectory(un(buf.subarray(header.leafOffset + e.offset, header.leafOffset + e.offset + e.length)))); return leafCache.get(e.offset); };
  function find(d, id) {
    let lo = 0, hi = d.length - 1, at = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (d[m].tileId <= id) { at = m; lo = m + 1; } else hi = m - 1; }
    if (at < 0) return null;
    const e = d[at];
    if (e.runLength === 0) return find(leaf(e), id);
    return id < e.tileId + e.runLength ? e : null;
  }
  function get(z, x, y) {
    const e = find(dir, zxyToTileId(z, x, y));
    return e ? buf.subarray(header.dataOffset + e.offset, header.dataOffset + e.offset + e.length) : null;
  }
  const allEntries = () => dir.flatMap(e => (e.runLength === 0 ? leaf(e) : [e]));
  return { header, metadata, entries: dir, allEntries, get };
}

module.exports = { zxyToTileId, encodeDirectory, decodeDirectory, write, read, TYPE, COMPRESSION };
