#!/usr/bin/env python3
"""
Trace EA study areas from the maps on their project pages (downloaded by scripts/fetch-ea-maps.js
to the ea-maps branch) into data/eas-overrides.json.

scripts/ea-trace.json lists, per EA:
  { "id": "<ea id>", "image": "ea-maps/<id>/1.png", "kind": "area" | "line",
    "ctrl": [ { "px": [x, y], "streets": ["Queen Street East", "Main Street North"], "city": "Brampton" }
            | { "px": [x, y], "lnglat": [lng, lat] } ... ],            # 3+ control points
    "outline": { "rgb": [r, g, b], "tol": 60 } | { "px": [[x, y], ...] } # colour of the drawn outline, or vertices
  }
Steps: geocode each street intersection (Nominatim, both streets' geometry intersected; cached in
scripts/ea-xings.json), fit pixel → lng/lat (least-squares affine), extract the outline (largest
enclosed region of that colour for an area; the colour's centre line for a line), simplify, transform,
and write eas-overrides.json entries: geometry, geomType, geomMethod "traced from the project page
image (n control points, residual m)", geomConfidence medium (residual <= 60 m) else low.

  python3 scripts/ea_trace.py            # needs network for new intersections (run in Actions)
  python3 scripts/ea_trace.py --selftest # pure checks, no network
"""
import json, math, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

# ---- geometry ------------------------------------------------------------------------------------
def fit_affine(px, ll):
    """Least-squares affine pixel -> (lng, lat). px, ll: lists of (x, y). Returns 6 coefficients."""
    n = len(px)
    if n < 3: raise ValueError('need 3+ control points')
    # Normal equations for [a b c] in lng = a*x + b*y + c (and the same for lat).
    sxx = sum(x * x for x, _ in px); sxy = sum(x * y for x, y in px); syy = sum(y * y for _, y in px)
    sx = sum(x for x, _ in px); sy = sum(y for _, y in px)
    M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]]
    def solve(v):
        r = [sum(px[i][0] * v[i] for i in range(n)), sum(px[i][1] * v[i] for i in range(n)), sum(v)]
        A = [row[:] + [r[k]] for k, row in enumerate(M)]
        for c in range(3):
            p = max(range(c, 3), key=lambda k: abs(A[k][c])); A[c], A[p] = A[p], A[c]
            if abs(A[c][c]) < 1e-12: raise ValueError('control points are collinear')
            for k in range(3):
                if k != c:
                    f = A[k][c] / A[c][c]
                    A[k] = [A[k][j] - f * A[c][j] for j in range(4)]
        return [A[k][3] / A[k][k] for k in range(3)]
    a = solve([p[0] for p in ll]); b = solve([p[1] for p in ll])
    return a + b

def apply(t, x, y):
    return (t[0] * x + t[1] * y + t[2], t[3] * x + t[4] * y + t[5])

def metres(a, b):
    kx = 111320 * math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110574)

def residual(t, px, ll):
    return max(metres(apply(t, *p), q) for p, q in zip(px, ll))

def dp(pts, eps):
    """Douglas-Peucker simplification (pixel space)."""
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    L = math.hypot(x2 - x1, y2 - y1) or 1e-9
    d = [abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / L for x, y in pts[1:-1]]
    i = max(range(len(d)), key=lambda k: d[k]) if d else -1
    if i >= 0 and d[i] > eps:
        a = dp(pts[:i + 2], eps); b = dp(pts[i + 1:], eps)
        return a[:-1] + b
    return [pts[0], pts[-1]]

# ---- outline extraction ----------------------------------------------------------------------------
def colour_mask(img, rgb, tol):
    import numpy as np
    a = np.asarray(img.convert('RGB')).astype(int)
    d = np.sqrt(((a - np.array(rgb)) ** 2).sum(axis=2))
    return d <= tol

def area_polygon(mask, simplify_px=3.0):
    """Largest region enclosed by the mask (outline + inside); its boundary as pixel vertices."""
    import numpy as np
    from collections import deque
    h, w = mask.shape
    # Thicken the outline slightly so dashed lines close.
    m = mask.copy()
    for dy in (-2, -1, 0, 1, 2):
        for dx in (-2, -1, 0, 1, 2):
            m |= np.roll(np.roll(mask, dy, 0), dx, 1)
    outside = np.zeros_like(m)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not m[y, x] and not outside[y, x]: outside[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not m[y, x] and not outside[y, x]: outside[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not m[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True; q.append((ny, nx))
    region = ~outside
    # Largest connected component of the enclosed region.
    lab = np.zeros((h, w), dtype=np.int32); best, best_n, cur = 0, 0, 0
    for y0 in range(h):
        for x0 in range(w):
            if region[y0, x0] and not lab[y0, x0]:
                cur += 1; n = 0; q = deque([(y0, x0)]); lab[y0, x0] = cur
                while q:
                    y, x = q.popleft(); n += 1
                    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= ny < h and 0 <= nx < w and region[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = cur; q.append((ny, nx))
                if n > best_n: best, best_n = cur, n
    if not best: return None
    comp = lab == best
    return trace_boundary(comp, simplify_px)

def trace_boundary(comp, simplify_px):
    """Moore-neighbour boundary tracing of a binary component; returns simplified closed ring (x, y)."""
    import numpy as np
    ys, xs = np.nonzero(comp)
    i = np.lexsort((xs, ys))[0]; start = (int(xs[i]), int(ys[i]))
    h, w = comp.shape
    inside = lambda x, y: 0 <= x < w and 0 <= y < h and comp[y, x]
    nb = [(-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1)]
    ring = [start]; cur = start; back = 0
    for _ in range(4 * comp.size):
        found = False
        for k in range(8):
            d = (back + k) % 8
            nx, ny = cur[0] + nb[d][0], cur[1] + nb[d][1]
            if inside(nx, ny):
                cur = (nx, ny); ring.append(cur); back = (d + 5) % 8; found = True; break
        if not found or (cur == start and len(ring) > 2): break
    # A closed ring: split at the point farthest from the start and simplify both halves.
    if len(ring) < 4: return None
    far = max(range(len(ring)), key=lambda k: (ring[k][0] - start[0]) ** 2 + (ring[k][1] - start[1]) ** 2)
    a = dp(ring[:far + 1], simplify_px); b = dp(ring[far:] + ([start] if ring[-1] != start else []), simplify_px)
    pts = a[:-1] + b
    if pts[0] != pts[-1]: pts.append(pts[0])
    return pts

def line_path(mask, simplify_px=3.0):
    """Centre line of a highlighted corridor: mask pixels binned along their main axis."""
    import numpy as np
    ys, xs = np.nonzero(mask)
    if len(xs) < 10: return None
    P = np.stack([xs, ys], 1).astype(float); c = P.mean(0)
    u, s, vt = np.linalg.svd(P - c, full_matrices=False); ax = vt[0]
    t = (P - c) @ ax
    bins = np.linspace(t.min(), t.max(), 60)
    pts = []
    for a, b in zip(bins[:-1], bins[1:]):
        sel = (t >= a) & (t < b)
        if sel.sum() >= 3: pts.append(tuple(P[sel].mean(0)))
    return dp(pts, simplify_px) if len(pts) >= 2 else None

# ---- geocoding (Actions only) ---------------------------------------------------------------------
UA = 'peel-dev-tracker (+https://github.com/jaredacostar-cmd/fsr-reviewer)'
def nominatim(params):
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({**params, 'format': 'jsonv2', 'polygon_geojson': 1, 'countrycodes': 'ca', 'viewbox': '-80.1,44.0,-79.5,43.45', 'bounded': 1, 'limit': 20})
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    time.sleep(1.2)
    with urllib.request.urlopen(req, timeout=40) as r: return json.loads(r.read())

def street_lines(name, city):
    out = []
    for f in nominatim({'street': name, 'city': city, 'state': 'Ontario'}):
        g = f.get('geojson') or {}
        if g.get('type') == 'LineString': out.append(g['coordinates'])
        elif g.get('type') == 'MultiLineString': out.extend(g['coordinates'])
    return out

def seg_x(p1, p2, p3, p4):
    d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0])
    if abs(d) < 1e-15: return None
    t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d
    u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d
    return (p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])) if 0 <= t <= 1 and 0 <= u <= 1 else None

def nearest_pair(A, B):
    """Intersection of two sets of lines, else the closest vertex pair midpoint when within 40 m."""
    for a in A:
        for b in B:
            for i in range(1, len(a)):
                for j in range(1, len(b)):
                    x = seg_x(a[i - 1], a[i], b[j - 1], b[j])
                    if x: return x, 0
    best = None
    for a in A:
        for p in a:
            for b in B:
                for q in b:
                    d = metres(p, q)
                    if best is None or d < best[1]: best = (((p[0] + q[0]) / 2, (p[1] + q[1]) / 2), d)
    return best if best and best[1] <= 40 else None

def geocode_xing(streets, city, cache):
    key = f"{streets[0]} & {streets[1]}, {city}"
    if key in cache: return cache[key]
    A, B = street_lines(streets[0], city), street_lines(streets[1], city)
    r = nearest_pair(A, B) if A and B else None
    cache[key] = [round(r[0][0], 6), round(r[0][1], 6)] if r else None
    print(f"  {key}: {cache[key]} ({len(A)} / {len(B)} ways)")
    return cache[key]

# ---- main -------------------------------------------------------------------------------------------
def main():
    from PIL import Image
    cfg = json.load(open(os.path.join(ROOT, 'scripts', 'ea-trace.json')))
    xpath = os.path.join(ROOT, 'scripts', 'ea-xings.json')
    cache = json.load(open(xpath)) if os.path.exists(xpath) else {}
    opath = os.path.join(ROOT, 'data', 'eas-overrides.json')
    ov = json.load(open(opath))
    ov.setdefault('eas', {})
    report = []
    for t in cfg['traces']:
        px, ll = [], []
        for c in t['ctrl']:
            q = c.get('lnglat') or geocode_xing(c['streets'], c.get('city', t.get('city', '')), cache)
            if q: px.append(tuple(c['px'])); ll.append(tuple(q))
        if len(px) < 3: report.append(f"{t['id']}: only {len(px)} control points geocoded — skipped"); continue
        tf = fit_affine(px, ll); res = residual(tf, px, ll)
        img_path = os.path.join(ROOT, t['image'])
        if 'px' in t['outline']: pts = [tuple(p) for p in t['outline']['px']]
        else:
            img = Image.open(img_path)
            mask = colour_mask(img, t['outline']['rgb'], t['outline'].get('tol', 60))
            if t.get('crop'):
                x0, y0, x1, y1 = t['crop']; import numpy as np
                keep = np.zeros_like(mask); keep[y0:y1, x0:x1] = True; mask &= keep
            pts = area_polygon(mask) if t['kind'] == 'area' else line_path(mask)
        if not pts: report.append(f"{t['id']}: outline not found"); continue
        coords = [[round(c, 6) for c in apply(tf, x, y)] for x, y in pts]
        if t['kind'] == 'area':
            if coords[0] != coords[-1]: coords.append(coords[0])
            geom = {'type': 'Polygon', 'coordinates': [coords]}
        else: geom = {'type': 'LineString', 'coordinates': coords}
        e = ov['eas'].setdefault(t['id'], {})
        e.update({'geometry': geom, 'geomType': 'area' if t['kind'] == 'area' else 'road' if t.get('road') else 'linear',
                  'geomMethod': f"traced from the project page image ({len(px)} control points, residual {round(res)} m)",
                  'geomConfidence': 'medium' if res <= 60 else 'low'})
        report.append(f"{t['id']}: {geom['type']} {len(coords)} vertices, {len(px)} control points, residual {round(res)} m")
    json.dump(cache, open(xpath, 'w'), indent=1)
    json.dump(ov, open(opath, 'w'), indent=1, ensure_ascii=False)
    print('\n'.join(report))

def selftest():
    import numpy as np
    from PIL import Image, ImageDraw
    # Affine: pixel grid -> a known lng/lat transform is recovered exactly.
    T = [0.0001, 0.00002, -79.8, -0.00001, -0.00008, 43.75]
    px = [(10, 20), (400, 30), (200, 300), (390, 380)]
    ll = [apply(T, *p) for p in px]
    tf = fit_affine(px, ll)
    assert residual(tf, px, ll) < 0.01, 'affine fit'
    # Outline extraction: a red dashed rectangle with black noise -> a 4-ish vertex ring.
    img = Image.new('RGB', (300, 200), 'white'); d = ImageDraw.Draw(img)
    for x in range(40, 260, 12): d.line([(x, 30), (x + 8, 30)], fill=(220, 30, 30), width=3); d.line([(x, 170), (x + 8, 170)], fill=(220, 30, 30), width=3)
    for y in range(30, 170, 12): d.line([(40, y), (40, y + 8)], fill=(220, 30, 30), width=3); d.line([(260, y), (260, y + 8)], fill=(220, 30, 30), width=3)
    d.line([(0, 100), (300, 100)], fill=(0, 0, 0), width=2)
    ring = area_polygon(colour_mask(img, (220, 30, 30), 60))
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    assert 4 <= len(ring) <= 12, ring
    assert abs(min(xs) - 38) <= 4 and abs(max(xs) - 262) <= 4 and abs(min(ys) - 28) <= 4 and abs(max(ys) - 172) <= 4, (min(xs), max(xs), min(ys), max(ys))
    # Line: a thick diagonal yellow corridor -> a polyline from end to end.
    img2 = Image.new('RGB', (300, 200), 'white'); ImageDraw.Draw(img2).line([(20, 180), (280, 20)], fill=(250, 200, 0), width=8)
    path = line_path(colour_mask(img2, (250, 200, 0), 50))
    assert len(path) >= 2 and math.hypot(path[0][0] - path[-1][0], path[0][1] - path[-1][1]) > 250, path
    # Intersection of two crossing streets.
    x = nearest_pair([[[-79.80, 43.70], [-79.70, 43.70]]], [[[-79.75, 43.65], [-79.75, 43.75]]])
    assert x and abs(x[0][0] + 79.75) < 1e-9 and abs(x[0][1] - 43.70) < 1e-9
    print('selftest ok')

if __name__ == '__main__':
    selftest() if '--selftest' in sys.argv else main()
