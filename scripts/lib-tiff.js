'use strict';
// A minimal TIFF reader for single-band float32 rasters (the lidar ImageServer's exportImage with
// format=tiff, pixelType=F32): strips or tiles, uncompressed or deflate, no predictor.
// decode(buffer) → { width, height, data: Float32Array, noData }.
const zlib = require('zlib');

function decode(buf) {
  const le = buf.toString('ascii', 0, 2) === 'II';
  if (!le && buf.toString('ascii', 0, 2) !== 'MM') throw new Error('not a TIFF');
  const u16 = o => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o), u32 = o => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
  if (u16(2) !== 42) throw new Error('BigTIFF or unknown TIFF');
  const ifd = u32(4), n = u16(ifd), tags = {};
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4), sz = SIZE[type] || 1;
    const at = count * sz <= 4 ? e + 8 : u32(e + 8), vals = [];
    if (type === 2) { tags[tag] = buf.toString('ascii', at, at + count).replace(/\0+$/, ''); continue; }
    for (let k = 0; k < count && k < 1e6; k++) {
      const o = at + k * sz;
      vals.push(type === 3 ? u16(o) : type === 4 ? u32(o) : type === 11 ? (le ? buf.readFloatLE(o) : buf.readFloatBE(o)) : type === 12 ? (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o)) : buf[o]);
    }
    tags[tag] = vals;
  }
  const width = tags[256][0], height = tags[257][0], bits = (tags[258] || [32])[0], comp = (tags[259] || [1])[0];
  const fmt = (tags[339] || [1])[0], spp = (tags[277] || [1])[0], pred = (tags[317] || [1])[0];
  if (bits !== 32 || fmt !== 3 || spp !== 1) throw new Error(`unsupported TIFF: ${bits}-bit, format ${fmt}, ${spp} samples`);
  if (pred !== 1) throw new Error(`unsupported TIFF predictor ${pred}`);
  if (![1, 8, 32946].includes(comp)) throw new Error(`unsupported TIFF compression ${comp}`);
  const inflate = b => comp === 1 ? b : zlib.inflateSync(b);
  const f32 = (b, o) => le ? b.readFloatLE(o) : b.readFloatBE(o);
  const data = new Float32Array(width * height);
  if (tags[324]) {   // tiled
    const tw = tags[322][0], th = tags[323][0], across = Math.ceil(width / tw);
    tags[324].forEach((off, t) => {
      const b = inflate(buf.subarray(off, off + tags[325][t])), x0 = (t % across) * tw, y0 = Math.floor(t / across) * th;
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const X = x0 + x, Y = y0 + y; if (X < width && Y < height) data[Y * width + X] = f32(b, (y * tw + x) * 4); }
    });
  } else {           // strips
    const rps = (tags[278] || [height])[0]; let row = 0;
    tags[273].forEach((off, s) => {
      const b = inflate(buf.subarray(off, off + tags[279][s]));
      for (let y = 0; y < rps && row + y < height; y++) for (let x = 0; x < width; x++) data[(row + y) * width + x] = f32(b, (y * width + x) * 4);
      row += rps;
    });
  }
  const nd = tags[42113] != null ? parseFloat(tags[42113]) : null;
  return { width, height, data, noData: Number.isFinite(nd) ? nd : null };
}

// Encoder for tests: an uncompressed little-endian single-strip float32 TIFF.
function encode(width, height, data, noData = null) {
  const entries = [[256, 4, [width]], [257, 4, [height]], [258, 3, [32]], [259, 3, [1]], [262, 3, [1]], [273, 4, [0]], [277, 3, [1]], [278, 4, [height]], [279, 4, [width * height * 4]], [339, 3, [3]]];
  if (noData != null) entries.push([42113, 2, String(noData)]);
  const n = entries.length, ifdLen = 2 + n * 12 + 4, extra = noData != null ? String(noData).length + 1 : 0;
  const head = 8, dataOff = head + ifdLen + extra + (extra % 2), buf = Buffer.alloc(dataOff + width * height * 4);
  buf.write('II', 0, 'ascii'); buf.writeUInt16LE(42, 2); buf.writeUInt32LE(8, 4); buf.writeUInt16LE(n, 8);
  let extraAt = head + ifdLen;
  entries.forEach(([tag, type, v], i) => {
    const e = 10 + i * 12; buf.writeUInt16LE(tag, e); buf.writeUInt16LE(type, e + 2);
    if (type === 2) { const s = `${v}\0`; buf.writeUInt32LE(s.length, e + 4); if (s.length <= 4) buf.write(s, e + 8, 'ascii'); else { buf.write(s, extraAt, 'ascii'); buf.writeUInt32LE(extraAt, e + 8); extraAt += s.length; } return; }
    buf.writeUInt32LE(1, e + 4);
    const val = tag === 273 ? dataOff : v[0];
    if (type === 3) buf.writeUInt16LE(val, e + 8); else buf.writeUInt32LE(val, e + 8);
  });
  for (let i = 0; i < width * height; i++) buf.writeFloatLE(data[i], dataOff + i * 4);
  return buf;
}

module.exports = { decode, encode };
