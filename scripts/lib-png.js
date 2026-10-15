'use strict';
// A minimal PNG decoder for 8-bit RGB / RGBA tiles (the Terrarium terrain tiles), so Node scripts
// read tiles the way the browser's canvas does: decode(buffer) → { width, height, data } with data
// as RGBA bytes. No dependencies (zlib is built in). Interlaced and palette PNGs are not supported.
const zlib = require('zlib');

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, depth = 0, color = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; color = body[9]; interlace = body[12]; }
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || !(color === 2 || color === 6) || interlace) throw new Error(`unsupported PNG (depth ${depth}, colour ${color}, interlace ${interlace})`);
  const bpp = color === 6 ? 4 : 3, stride = width * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4), prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < width; x++) { const o = (y * width + x) * 4; out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
    cur.copy(prev);
  }
  return { width, height, data: out };
}

// Encoder: 8-bit RGB (data has 3 bytes per pixel) or RGBA (4). Each row takes the filter (None,
// Sub, Up) with the smallest sum of absolute values, the usual heuristic.
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, body) { const len = Buffer.alloc(4), crc = Buffer.alloc(4), tb = Buffer.concat([Buffer.from(type, 'ascii'), body]); len.writeUInt32BE(body.length); crc.writeUInt32BE(crc32(tb)); return Buffer.concat([len, tb, crc]); }
function encode(width, height, data, channels = 3) {
  const stride = width * channels, raw = Buffer.alloc((stride + 1) * height), cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < height; y++) {
    const row = data.subarray(y * stride, (y + 1) * stride), up = y ? data.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 3; f++) {
      const c = cand[f]; let sum = 0;
      for (let x = 0; x < stride; x++) { const v = (row[x] - (f === 1 ? (x >= channels ? row[x - channels] : 0) : f === 2 ? (up ? up[x] : 0) : 0)) & 255; c[x] = v; sum += v < 128 ? v : 256 - v; }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best; cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(width, 0); ih.writeUInt32BE(height, 4); ih[8] = 8; ih[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
module.exports = { decode, encode };
