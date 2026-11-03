"""Minimal, dependency-free reader for a point shapefile (.shp + .dbf)."""
import datetime as dt
import struct


def read_dbf(path, encoding='utf-8'):
    """Return (fields, rows). fields: [(name, type, length)]; rows: list of dicts.
    Deleted records are kept with '_deleted': True so row order matches the .shp."""
    with open(path, 'rb') as f:
        head = f.read(32)
        n, hlen, rlen = struct.unpack('<IHH', head[4:12])
        fields = []
        while True:
            d = f.read(32)
            if d[0] == 0x0D:
                break
            fields.append((d[:11].split(b'\0')[0].decode('ascii'), chr(d[11]), d[16]))
        f.seek(hlen)
        rows = []
        for _ in range(n):
            rec = f.read(rlen)
            row, off = {'_deleted': rec[:1] == b'*'}, 1
            for name, typ, ln in fields:
                raw = rec[off:off + ln].decode(encoding, 'replace').strip()
                off += ln
                row[name] = _convert(raw, typ)
            rows.append(row)
    return fields, rows


def _convert(raw, typ):
    if typ in 'NF':
        try:
            return float(raw) if raw else None
        except ValueError:
            return None
    if typ == 'D':
        if not raw or raw.strip('0') == '':
            return None
        try:
            return dt.date(int(raw[:4]), int(raw[4:6]), int(raw[6:8]))
        except ValueError:
            return None
    return raw


def read_points(path):
    """Return [(x, y)] for a type-1 (Point) shapefile, None for null shapes."""
    with open(path, 'rb') as f:
        data = f.read()
    stype = struct.unpack('<i', data[32:36])[0]
    if stype != 1:
        raise ValueError(f'expected a Point shapefile, got shape type {stype}')
    pts, off = [], 100
    while off < len(data):
        _, clen = struct.unpack('>ii', data[off:off + 8])
        st = struct.unpack('<i', data[off + 8:off + 12])[0]
        pts.append(struct.unpack('<dd', data[off + 12:off + 28]) if st == 1 else None)
        off += 8 + clen * 2
    return pts
