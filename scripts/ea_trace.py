#!/usr/bin/env python3
"""
Trace EA study areas from the maps on their project pages (downloaded by scripts/fetch-ea-maps.js
to the ea-maps branch) into data/eas-overrides.json.

scripts/ea-trace.json lists, per EA:
  { "id": "<ea id>", "image": "ea-maps/<id>/1.png", "kind": "area" | "line",
    "ctrl": [ { "px": [x, y], "streets": ["Queen Street East", "Main Street North"], "city": "Brampton" }
            | { "px": [x, y], "lnglat": [lng, lat] } ... ],            # 2+ control points (1 with mPerPx)
    "outline": { "rgb": [r, g, b], "tol": 60 } | { "px": [[x, y], ...] } # colour of the drawn outline, or vertices
    "mPerPx": 2.45, "rotationDeg": 0  # scale bar (checks the fit; with ONE control point it sets the scale); rotationDeg = clockwise angle of the north arrow from image-up
  }
Steps: geocode each street intersection (Nominatim, both streets' geometry intersected; cached in
scripts/ea-xings.json), fit pixel → lng/lat (similarity for 2-3 points, least-squares affine for 4+), extract the outline (largest
enclosed region of that colour for an area; the colour's centre line for a line), simplify, transform,
and write eas-overrides.json entries: geometry, geomType, geomMethod "traced from the project page
image (n control points, residual m)", geomConfidence medium when the control points
or the scale bar check the fit and the residual is <= 60 m, else low. Streets that cross twice keep both
crossings; the combination that fits best is used. Control points that disagree by > 250 m are skipped.

Road corridors and points (scripts/ea-trace.json "roads"; no image needed), from the same local streets:
  { "id", "kind": "road", "road": "Mayfield Road", "from": "Chinguacousy Road" | {"street", "offsetM", "dir": "N"},
    "to": ..., "city" }                      → the road's centreline between the two crossings (shortest path
                                               along the road's own ways; an offset walks that far along it)
  { "id", "kind": "road", "segments": [ {road, from, to}, ... ] }   → several corridors (MultiLineString)
  { "id", "kind": "point", "streets": [A, B] | "points": [[A, B], ...], "city" } → intersection(s)
  { "id", "kind": "point", "road": R, "water": "Shaw's Creek", "city" }       → where the road crosses the creek
  { "id", "kind": "water", "water": "Lornewood Creek", "city" }               → the creek's line (what the sewer follows)
Waterways come from EA_WATER (a GeoJSON sequence of waterway ways). Method text credits OpenStreetMap (ODbL).

  python3 scripts/ea_trace.py            # needs network for new intersections (run in Actions)
  python3 scripts/ea_trace.py --selftest # pure checks, no network
"""
import cmath, itertools, json, math, os, sys, time, urllib.parse, urllib.request

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

def fit_similarity(px, ll, rot_deg=None):
    """Two (or more) control points: shift + rotation + uniform scale, in a local metric frame
    (image y points down). rot_deg fixes the rotation (the north arrow, clockwise from image-up) when
    the control points sit too close together to give it. Returned as affine coefficients."""
    lat0 = sum(q[1] for q in ll) / len(ll); kx = 111320 * math.cos(math.radians(lat0)); ky = 110574
    P = [complex(x, -y) for x, y in px]
    Q = [complex(q[0] * kx, q[1] * ky) for q in ll]
    pm = sum(P) / len(P); qm = sum(Q) / len(Q)
    num = sum((q - qm) * (p - pm).conjugate() for p, q in zip(P, Q)); den = sum(abs(p - pm) ** 2 for p in P)
    a = num / den
    if rot_deg is not None:
        u = cmath.exp(1j * math.radians(rot_deg)); a = max((num * u.conjugate()).real / den, 1e-9) * u
    b = qm - a * pm          # q = a * p + b, p = x - iy
    # lng*kx = Re(a)(x) + Im(a)(y) + Re(b); lat*ky = Im(a)(x) - Re(a)(y) + Im(b)
    return [a.real / kx, a.imag / kx, b.real / kx, a.imag / ky, -a.real / ky, b.imag / ky]

def m_per_px(t):
    lat = t[5]; kx = 111320 * math.cos(math.radians(lat)); ky = 110574
    return math.hypot(t[0] * kx, t[3] * ky)

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

# ---- local OpenStreetMap roads (Actions: the Ontario extract cut to Peel with osmium) -----------------
# EA_ROADS: GeoJSON sequence of highway ways; EA_MUNIS: administrative boundaries. When set, streets come
# from these (every segment, not Nominatim's first 20) and crossings are kept inside the named city.
ABBR = {'st': 'street', 'rd': 'road', 'ave': 'avenue', 'av': 'avenue', 'blvd': 'boulevard', 'dr': 'drive', 'pkwy': 'parkway',
        'cres': 'crescent', 'ct': 'court', 'hwy': 'highway', 'ln': 'lane', 'sdrd': 'sideroad', 'cir': 'circle', 'pl': 'place',
        'e': 'east', 'w': 'west', 'n': 'north', 's': 'south', 'trl': 'trail', 'gt': 'gate', 'tr': 'trail'}
DIRS = {'east', 'west', 'north', 'south'}
def norm_street(s):
    w = [ABBR.get(x, x) for x in __import__('re').sub(r'[^a-z0-9 ]', ' ', str(s).lower()).split()]
    w = ['old' if x == 'olde' else x for x in w]   # Olde Base Line Road
    return ' '.join(w).replace('base line', 'baseline').replace('side road', 'sideroad')
ROADS = None
def roads():
    """name -> [coords], from EA_ROADS (one feature per line)."""
    global ROADS
    if ROADS is not None: return ROADS
    ROADS = {}
    path = os.environ.get('EA_ROADS')
    if not path or not os.path.exists(path): return ROADS
    for line in open(path, encoding='utf8'):
        line = line.strip().lstrip('\x1e')
        if not line: continue
        f = json.loads(line); g = f.get('geometry') or {}; pr = f.get('properties') or {}
        if g.get('type') != 'LineString': continue
        names = {pr.get(k) for k in ('name', 'alt_name', 'old_name', 'official_name') if pr.get(k)}
        for ref in str(pr.get('ref') or '').split(';'):
            n = ''.join(c for c in ref if c.isdigit())
            if n: names |= {f'Highway {n}', f'Regional Road {n}'}
        for n in names: ROADS.setdefault(norm_street(n), []).append(g['coordinates'])
    print(f"  local roads: {sum(len(v) for v in ROADS.values())} ways, {len(ROADS)} names")
    return ROADS
MUNIS = None
def munis():
    """City name -> [rings], from EA_MUNIS."""
    global MUNIS
    if MUNIS is not None: return MUNIS
    MUNIS = {}
    path = os.environ.get('EA_MUNIS')
    if not path or not os.path.exists(path): return MUNIS
    for line in open(path, encoding='utf8'):
        line = line.strip().lstrip('\x1e')
        if not line: continue
        f = json.loads(line); g = f.get('geometry') or {}; nm = (f.get('properties') or {}).get('name')
        if nm not in ('Brampton', 'Mississauga', 'Caledon', 'Town of Caledon', 'City of Brampton', 'City of Mississauga'): continue
        polys = g['coordinates'] if g.get('type') == 'MultiPolygon' else [g['coordinates']] if g.get('type') == 'Polygon' else []
        MUNIS.setdefault(nm.split(' of ')[-1], []).extend(p[0] for p in polys)
    print(f"  city boundaries: {sorted(MUNIS)}")
    return MUNIS
def in_ring(x, y, ring):
    c = False
    for i in range(len(ring)):
        x1, y1 = ring[i - 1]; x2, y2 = ring[i]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def near_city(pt, city, m=300):
    """Inside the city, or within m metres of it (boundary roads: Steeles, Mayfield, Winston Churchill)."""
    rings = munis().get(city)
    if not rings: return True
    dx = m / (111320 * math.cos(math.radians(pt[1]))); dy = m / 110574
    return any(in_ring(pt[0] + a * dx, pt[1] + b * dy, r) for a, b in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (.7, .7), (-.7, .7), (.7, -.7), (-.7, -.7)) for r in rings)
def local_lines(name):
    """Ways named `name`; "Queen Street" also takes "Queen Street East / West" (a direction suffix)."""
    R = roads(); q = norm_street(name)
    out = list(R.get(q, []))
    if not q.split()[-1] in DIRS:
        for d in DIRS: out += R.get(f'{q} {d}', [])
    return out

def street_lines(name, city):
    if isinstance(name, list): return [l for n in name for l in street_lines(n, city)]   # alternate names (Highway 50 / Queen Street South)
    if roads(): return local_lines(name)
    out = []
    res = nominatim({'street': name, 'city': city, 'state': 'Ontario'}) if city else []
    if not res: res = nominatim({'q': f"{name}, Ontario"})   # boundary roads (Steeles, Mayfield) sit in two cities
    for f in res:
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

LAST_GAP = None   # the closest approach when two streets do not cross (for the report)
def crossings(A, B, near=40):
    """Every point where the two sets of lines cross (merged within 25 m), else the closest vertex pair's
    midpoint when within `near` m (a street that ends at the other)."""
    global LAST_GAP
    out = []
    for a in A:
        for b in B:
            for i in range(1, len(a)):
                for j in range(1, len(b)):
                    x = seg_x(a[i - 1], a[i], b[j - 1], b[j])
                    if x and all(metres(x, o) > 25 for o in out): out.append(x)
    if out: return out
    best = None
    for a in A:
        for p in a:
            for b in B:
                for q in b:
                    d = metres(p, q)
                    if best is None or d < best[1]: best = (((p[0] + q[0]) / 2, (p[1] + q[1]) / 2), d)
    LAST_GAP = best
    return [best[0]] if best and best[1] <= near else []

def merge_near(pts, m):
    """Points within m metres of each other, as their centroid (the carriageways of a divided road)."""
    groups = []
    for p in pts:
        g = next((g for g in groups if metres(p, g[0]) <= m), None)
        if g: g.append(p)
        else: groups.append([p])
    return [(sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)) for g in groups]

def similar_names(name, table):
    """Names close to one that matched nothing (spelling help for the config)."""
    import difflib
    names = name if isinstance(name, list) else [name]
    return sorted({m for n in names for m in difflib.get_close_matches(norm_street(n), list(table), n=4, cutoff=0.7)})
def explain_miss(names, lines_):
    """Why a lookup found nothing: names with no ways get spelling suggestions, else the closest approach."""
    out = [f"no ways named {n if isinstance(n, str) else ' / '.join(n)} (similar: {', '.join(similar_names(n, roads())) or 'none'})"
           for n, ls in zip(names, lines_) if not ls]
    if not out and LAST_GAP: out.append(f"closest approach {round(LAST_GAP[1])} m at {[round(v, 5) for v in LAST_GAP[0]]}")
    return '; '.join(out)
def geocode_xing(streets, city, cache, near=40):
    """Candidate points for an intersection (more than one when the streets cross twice, e.g. a crescent).
    `near`: how far apart (m) the ends of two streets that only nearly meet may be."""
    global LAST_GAP
    nm = lambda n: ' / '.join(n) if isinstance(n, list) else n
    key = f"{'osm:' if roads() else ''}{nm(streets[0])} & {nm(streets[1])}, {city}"
    if key not in cache:
        LAST_GAP = None
        A, B = street_lines(streets[0], city), street_lines(streets[1], city)
        xs = crossings(A, B, near) if A and B else []
        if roads(): xs = [x for x in merge_near(xs, 90) if near_city(x, city)]   # a divided road crosses as up to 4 points
        cache[key] = [[round(v, 6) for v in x] for x in xs]
        print(f"  {key}: {len(cache[key])} crossing(s) {cache[key][:3]} ({len(A)} / {len(B)} ways)")
        if not xs and roads(): print(f"    {explain_miss(streets, [A, B])}")
    v = cache[key]
    return [] if not v else [v] if isinstance(v[0], (int, float)) else v   # older cache entries held one point

def fit(t, px, ll):
    """Pixel -> lng/lat transform for one set of control points, and its worst residual (m)."""
    if len(px) == 1:
        # One point + the scale bar + the map's rotation (north-up = 0): a similarity transform.
        ang = math.radians(t.get('rotationDeg', 0)); sc = t['mPerPx']
        kx = 111320 * math.cos(math.radians(ll[0][1])); ky = 110574
        (x0, y0), (lng0, lat0) = px[0], ll[0]
        c, s_ = math.cos(ang), math.sin(ang)
        tf = [sc * c / kx, sc * s_ / kx, 0, sc * s_ / ky, -sc * c / ky, 0]
        tf[2] = lng0 - tf[0] * x0 - tf[1] * y0; tf[5] = lat0 - tf[3] * x0 - tf[4] * y0
        return tf, 0.0
    if 'rotationDeg' in t: tf = fit_similarity(px, ll, t['rotationDeg'])
    elif len(px) >= 4 and not t.get('similarity'): tf = fit_affine(px, ll)
    else: tf = fit_similarity(px, ll)   # 2-3 points: similarity, so 3 points still check each other
    return tf, residual(tf, px, ll)

def best_fit(t, ctrl):
    """ctrl: [(px, [candidate lnglat, ...])]. Try the candidate combinations and keep the one that fits best:
    smallest residual when the points over-determine the fit, else the scale closest to the scale bar."""
    px = [p for p, _ in ctrl]
    checks = len(px) >= 3 or len(px) == 2 and 'rotationDeg' in t
    best = None
    for ll in itertools.islice(itertools.product(*[cs for _, cs in ctrl]), 5000):
        tf, res = fit(t, px, list(ll))
        score = res if checks else abs(m_per_px(tf) / t['mPerPx'] - 1) if t.get('mPerPx') and len(px) == 2 else 0
        if best is None or score < best[0]: best = (score, tf, res, list(ll))
    return best[1], best[2], best[3]

# ---- road corridors, intersections and creek crossings (no image) ------------------------------------
OSM_CREDIT = '© OpenStreetMap contributors, ODbL'
WATER = None
def waters():
    """Waterway name -> [coords], from EA_WATER."""
    global WATER
    if WATER is not None: return WATER
    WATER = {}
    path = os.environ.get('EA_WATER')
    if not path or not os.path.exists(path): return WATER
    for line in open(path, encoding='utf8'):
        line = line.strip().lstrip('\x1e')
        if not line: continue
        f = json.loads(line); g = f.get('geometry') or {}; nm = (f.get('properties') or {}).get('name')
        if g.get('type') != 'LineString': continue
        WATER.setdefault('*', []).append(g['coordinates'])   # every waterway, named or not
        if nm: WATER.setdefault(norm_street(nm), []).append(g['coordinates'])
    print(f"  local waterways: {len(WATER.get('*', []))} ways, {len(WATER) - 1} names")
    return WATER

def water_lines(name):
    """Waterways named `name` (a list: alternate spellings, e.g. Shaw's / Shaws Creek)."""
    if isinstance(name, list): return [l for n in name for l in water_lines(n)]
    return waters().get('*' if name == '*' else norm_street(name), [])   # '*': any waterway (a creek unnamed in OSM)
def road_graph(lines):
    """Nodes (rounded lng/lat) and weighted edges from a road's ways."""
    key = lambda p: (round(p[0], 6), round(p[1], 6))
    adj = {}
    for l in lines:
        for i in range(1, len(l)):
            a, b = key(l[i - 1]), key(l[i]); w = metres(a, b)
            adj.setdefault(a, []).append((b, w)); adj.setdefault(b, []).append((a, w))
    # Join a way's loose end to the nearest node of another way within 30 m (a short unnamed bridge or
    # ramp piece, or a carriageway split, leaves the named ways apart).
    cell = lambda p: (int(p[0] / 0.0005), int(p[1] / 0.0005))
    grid = {}
    for n in adj: grid.setdefault(cell(n), []).append(n)
    for n in [n for n, nb in adj.items() if len(nb) == 1]:
        near = {m for nb, _ in adj[n] for m in [nb]} | {n}
        cx, cy = cell(n); best = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for m in grid.get((cx + dx, cy + dy), []):
                    if m in near: continue
                    d = metres(n, m)
                    if d <= 30 and (best is None or d < best[0]): best = (d, m)
        if best: adj[n].append((best[1], best[0])); adj[best[1]].append((n, best[0]))
    return adj
def nearest_node(adj, pt):
    """The point itself, joined into the graph on the nearest segment (so walks and paths start exactly
    at a crossing, not at the next vertex)."""
    if not adj: return None
    p = (round(pt[0], 6), round(pt[1], 6))
    if p in adj: return p
    kx = 111320 * math.cos(math.radians(p[1]))
    best = None
    for a, nb in adj.items():
        for b, _ in nb:
            ax, ay, bx, by = (a[0] - p[0]) * kx, (a[1] - p[1]) * 110574, (b[0] - p[0]) * kx, (b[1] - p[1]) * 110574
            vx, vy = bx - ax, by - ay; L2 = vx * vx + vy * vy
            t = max(0.0, min(1.0, -(ax * vx + ay * vy) / L2)) if L2 else 0.0
            d = math.hypot(ax + t * vx, ay + t * vy)
            if best is None or d < best[0]: best = (d, a, b)
    _, a, b = best
    adj[p] = [(a, metres(p, a)), (b, metres(p, b))]
    adj[a].append((p, metres(p, a))); adj[b].append((p, metres(p, b)))
    return p
def dijkstra(adj, src):
    import heapq
    dist, prev, q = {src: 0.0}, {}, [(0.0, src)]
    while q:
        d, n = heapq.heappop(q)
        if d > dist.get(n, 1e18): continue
        for m, w in adj.get(n, []):
            nd = d + w
            if nd < dist.get(m, 1e18): dist[m] = nd; prev[m] = n; heapq.heappush(q, (nd, m))
    return dist, prev
def path_to(prev, src, dst):
    out = [dst]
    while out[-1] != src:
        if out[-1] not in prev: return None
        out.append(prev[out[-1]])
    return out[::-1]
def walk(adj, start, dir_, m):
    """From `start`, the path of about m metres along the road heading roughly `dir_` (N / S / E / W)."""
    dist, prev = dijkstra(adj, start)
    vec = {'N': (0, 1), 'S': (0, -1), 'E': (1, 0), 'W': (-1, 0)}[dir_]
    best = None
    for n, d in dist.items():
        if d < m * 0.8: continue
        kx = 111320 * math.cos(math.radians(start[1]))
        dx, dy = (n[0] - start[0]) * kx, (n[1] - start[1]) * 110574
        score = (dx * vec[0] + dy * vec[1]) / max(1.0, math.hypot(dx, dy)) - abs(d - m) / max(m, 1)
        if best is None or score > best[0]: best = (score, n)
    if not best: return [start]
    pts = path_to(prev, start, best[1]) or [start]
    # Cut the path at m metres.
    out, run = [pts[0]], 0.0
    for i in range(1, len(pts)):
        w = metres(pts[i - 1], pts[i])
        if run + w >= m:
            f = (m - run) / w if w else 0
            out.append((pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1]))); return out
        out.append(pts[i]); run += w
    return out
def end_point(adj, road, end, city, cache):
    """A corridor end: the road's crossing with a street (candidates), moved by an offset when given."""
    street = end if isinstance(end, (str, list)) else end['street']
    cands = geocode_xing([road, street], city, cache, end.get('nearM', 40) if isinstance(end, dict) else 40)
    if isinstance(end, dict) and end.get('offsetM'):
        out = []
        for c in cands:
            n = nearest_node(adj, c)
            if n: out.append(walk(adj, n, end.get('dir', 'N'), end['offsetM'])[-1])
        return out
    return cands
def corridor(seg, city, cache):
    """The road's centreline between two ends: the pair of candidates with the shortest path along the road."""
    lines = street_lines(seg['road'], city)
    adj = road_graph(lines)
    if not adj: return None, f"no ways named {seg['road']}"
    A, B = end_point(adj, seg['road'], seg['from'], city, cache), end_point(adj, seg['road'], seg['to'], city, cache)
    if not A or not B: return None, f"{seg['road']}: {'from' if not A else 'to'} crossing not found"
    best = None
    NA, NB = [nearest_node(adj, a) for a in A], [nearest_node(adj, b) for b in B]   # join every end first
    for a, na in zip(A, NA):
        dist, prev = dijkstra(adj, na)
        for b, nb in zip(B, NB):
            if nb in dist and (best is None or dist[nb] < best[0]): best = (dist[nb], path_to(prev, na, nb), a, b)
    if not best or not best[1] or best[0] < 30: return None, f"{seg['road']}: no path between the ends"
    pts = [tuple(best[2])] + best[1] + [tuple(best[3])]
    pts = dp(pts, 0.00003)
    return [[round(c, 6) for c in p] for p in pts], f"{round(best[0])} m"
def name_of(x): return ' / '.join(x) if isinstance(x, list) else x['street'] if isinstance(x, dict) else x
def end_text(x):
    if isinstance(x, dict) and x.get('offsetM'): return f"{x['offsetM']} m {({'N': 'north', 'S': 'south', 'E': 'east', 'W': 'west'})[x.get('dir', 'N')]} of {x['street']}"
    return name_of(x)
def place_roads(cfg, ov, cache, report):
    for r in cfg.get('roads', []):
        city = r.get('city', '')
        geom = None; method = None
        if r['kind'] == 'road':
            segs = r.get('segments') or [r]
            parts, notes = [], []
            for sg in segs:
                line, note = corridor(sg, sg.get('city', city), cache)
                if line: parts.append(line)
                notes.append(note)
            if len(parts) < len(segs): report.append(f"{r['id']}: corridor not placed ({'; '.join(notes)})"); continue
            geom = {'type': 'LineString', 'coordinates': parts[0]} if len(parts) == 1 else {'type': 'MultiLineString', 'coordinates': parts}
            method = 'road centreline ' + '; '.join(f"{name_of(sg['road'])} from {end_text(sg['from'])} to {end_text(sg['to'])}" for sg in segs) + f" ({OSM_CREDIT})"
            gtype = 'road'
        elif r['kind'] == 'point':
            if r.get('water'):
                A, W = street_lines(r['road'], city), water_lines(r['water'])
                xs = [x for x in crossings(A, W, r.get('nearM', 40)) if near_city(x, city)] if A and W else []
                pts = merge_near(xs, 60)
                if r.get('nearXing') and pts:
                    # Many crossings (any waterway): the one closest to a named intersection, within 1.5 km.
                    c = geocode_xing(r['nearXing'], city, cache)
                    pts = sorted((p for p in pts if c and metres(p, c[0]) <= 1500), key=lambda p: metres(p, c[0]))[:1]
                    if not c: print(f"  {' & '.join(map(name_of, r['nearXing']))}: not found (no anchor for the crossing)")
                if not pts and not W: print(f"  {name_of(r['water'])}: no waterways by that name (similar: {', '.join(similar_names(r['water'], waters())) or 'none'})")
                elif not pts: print(f"  {name_of(r['road'])} / {name_of(r['water'])}: {explain_miss([r['road']], [A])}")
                method = f"where {name_of(r['road'])} crosses {r.get('waterText') or name_of(r['water'])} ({OSM_CREDIT})"
            else:
                pairs = r.get('points') or [r['streets']]
                pts = []
                for pr in pairs:
                    c = geocode_xing(pr, city, cache)
                    if c: pts.append(c[0])
                if len(pts) < len(pairs): pts = []
                method = 'intersection of ' + '; '.join(f"{name_of(a)} and {name_of(b)}" for a, b in pairs) + f" ({OSM_CREDIT})"
            if not pts: report.append(f"{r['id']}: point not found"); continue
            pts = [[round(c, 6) for c in p] for p in pts]
            geom = {'type': 'Point', 'coordinates': pts[0]} if len(pts) == 1 else {'type': 'MultiPoint', 'coordinates': pts}
            gtype = 'road'
        elif r['kind'] == 'water':
            ls = [l for l in water_lines(r['water']) if any(near_city(p, city, 0) for p in l[::max(1, len(l) // 4)])]
            if not ls: report.append(f"{r['id']}: {name_of(r['water'])} not found"); continue
            geom = {'type': 'MultiLineString', 'coordinates': [[[round(c, 6) for c in p] for p in dp([tuple(q) for q in l], 0.00003)] for l in ls]}
            method = f"along {name_of(r['water'])}, the creek the sewer follows ({OSM_CREDIT})"
            gtype = 'linear'
        e = ov['eas'].setdefault(r['id'], {})
        if r.get('method'): method = f"{r['method']}: {method}"   # e.g. an approximate placement says so first
        e.update({'geometry': geom, 'geomType': r.get('geomType', gtype), 'geomMethod': method, 'geomConfidence': r.get('confidence', 'medium')})
        report.append(f"{r['id']}: {geom['type']} — {method}")

# ---- main -------------------------------------------------------------------------------------------
def main():
    from PIL import Image
    cfg = json.load(open(os.path.join(ROOT, 'scripts', 'ea-trace.json')))
    xpath = os.path.join(ROOT, 'scripts', 'ea-xings.json')
    cache = json.load(open(xpath)) if os.path.exists(xpath) else {}
    if roads(): cache = {k: v for k, v in cache.items() if v and k.startswith('osm:')}   # local roads: recompute, keep only earlier local hits
    opath = os.path.join(ROOT, 'data', 'eas-overrides.json')
    ov = json.load(open(opath))
    ov.setdefault('eas', {})
    report = []
    for t in cfg['traces']:
        ctrl = []
        for c in t['ctrl']:
            cands = [c['lnglat']] if c.get('lnglat') else geocode_xing(c['streets'], c.get('city', t.get('city', '')), cache)
            if cands: ctrl.append((tuple(c['px']), [tuple(q) for q in cands]))
        px = [p for p, _ in ctrl]
        if len(px) < 2 and not (len(px) == 1 and t.get('mPerPx')): report.append(f"{t['id']}: only {len(px)} control points geocoded — skipped"); continue
        tf, res, ll = best_fit(t, ctrl)
        amb = sum(len(cs) > 1 for _, cs in ctrl)
        checked = len(px) >= 3 or len(px) == 2 and 'rotationDeg' in t   # the control points check each other
        if res > 250: report.append(f"{t['id']}: control points disagree by {round(res)} m — skipped"); continue
        if res > 30: report.append(f"  {t['id']} per-point residuals (m): " + ', '.join(f"{tuple(p)} {round(metres(apply(tf, *p), q))}" for p, q in zip(px, ll)))
        # Scale check against the map's scale bar (metres per pixel), when given.
        scale_note = ''
        if t.get('mPerPx'):
            k = m_per_px(tf) / t['mPerPx']
            scale_note = f", scale {k:.2f}× the scale bar"
            if abs(k - 1) > t.get('mPerPxTol', 0.25): report.append(f"{t['id']}: scale off by {k:.2f}× — check the control points"); continue
            checked = checked or len(px) >= 2
        img_path = os.path.join(ROOT, t['image'])
        lines = None; polys = None
        if 'polys' in t['outline']: polys = [[tuple(p) for p in r] for r in t['outline']['polys']]; pts = polys[0]
        elif 'lines' in t['outline']: lines = [[tuple(p) for p in l] for l in t['outline']['lines']]; pts = lines[0]
        elif 'px' in t['outline']: pts = [tuple(p) for p in t['outline']['px']]
        else:
            img = Image.open(img_path)
            mask = colour_mask(img, t['outline']['rgb'], t['outline'].get('tol', 60))
            if t.get('crop'):
                x0, y0, x1, y1 = t['crop']; import numpy as np
                keep = np.zeros_like(mask); keep[y0:y1, x0:x1] = True; mask &= keep
            pts = area_polygon(mask) if t['kind'] == 'area' else line_path(mask)
        if not pts: report.append(f"{t['id']}: outline not found"); continue
        coords = [[round(c, 6) for c in apply(tf, x, y)] for x, y in pts]
        if polys:
            rings = []
            for r in polys:
                c = [[round(v, 6) for v in apply(tf, x, y)] for x, y in r]
                if c[0] != c[-1]: c.append(c[0])
                rings.append([c])
            geom = {'type': 'MultiPolygon', 'coordinates': rings} if len(rings) > 1 else {'type': 'Polygon', 'coordinates': rings[0]}
        elif lines and len(lines) > 1:
            geom = {'type': 'MultiLineString', 'coordinates': [[[round(c, 6) for c in apply(tf, x, y)] for x, y in l] for l in lines]}
        elif t['kind'] == 'area':
            if coords[0] != coords[-1]: coords.append(coords[0])
            geom = {'type': 'Polygon', 'coordinates': [coords]}
        else: geom = {'type': 'LineString', 'coordinates': coords}
        e = ov['eas'].setdefault(t['id'], {})
        e.update({'geometry': geom, 'geomType': 'area' if t['kind'] == 'area' else 'road' if t.get('road') else 'linear',
                  'geomMethod': ("traced from the project page image (1 control point and the map scale)" if len(px) < 2 else
                                 f"traced from the project page image ({len(px)} control points, residual {round(res)} m)" if len(px) >= 3 or 'rotationDeg' in t else
                                 f"traced from the project page image ({len(px)} control points{', scale bar checked' if t.get('mPerPx') else ''})"),
                  'geomConfidence': 'medium' if checked and len(px) >= 2 and res <= 60 else 'low'})
        report.append(f"{t['id']}: {geom['type']} {len(coords)} vertices, {len(px)} control points{f' ({amb} with two crossings)' if amb else ''}, residual {round(res)} m{scale_note}")
    place_roads(cfg, ov, cache, report)
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
    # Similarity from two points: a rotated, scaled grid is recovered (image y down).
    ang = math.radians(30); sc = 3.0   # 3 m / px, rotated 30 degrees
    kx = 111320 * math.cos(math.radians(43.7)); ky = 110574
    def truth(x, y):
        X, Y = x * sc, -y * sc
        return (-79.76 + (X * math.cos(ang) - Y * math.sin(ang)) / kx, 43.7 + (X * math.sin(ang) + Y * math.cos(ang)) / ky)
    sp = [(100, 100), (500, 300)]; sl = [truth(*p) for p in sp]
    ts = fit_similarity(sp, sl)
    chk = truth(300, 50)
    assert metres(apply(ts, 300, 50), chk) < 0.5, metres(apply(ts, 300, 50), chk)
    assert abs(m_per_px(ts) - 3.0) < 0.01, m_per_px(ts)
    # Fixed rotation (north arrow 30 degrees clockwise of image-up): scale and shift still recovered.
    tr = fit_similarity(sp, sl, 30)
    assert metres(apply(tr, 300, 50), chk) < 0.5 and abs(m_per_px(tr) - 3.0) < 0.01, (metres(apply(tr, 300, 50), chk), m_per_px(tr))
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
    x = crossings([[[-79.80, 43.70], [-79.70, 43.70]]], [[[-79.75, 43.65], [-79.75, 43.75]]])
    assert len(x) == 1 and abs(x[0][0] + 79.75) < 1e-9 and abs(x[0][1] - 43.70) < 1e-9
    # A crescent crossing the street twice: both crossings kept; the fit picks the one that agrees with the others.
    two = crossings([[[-79.80, 43.70], [-79.70, 43.70]]], [[[-79.78, 43.69], [-79.77, 43.71], [-79.76, 43.69]]])
    assert len(two) == 2, two
    T2 = [0.0001, 0.0, -79.8, 0.0, -0.0000725, 43.75]
    P = [(100, 100), (400, 120), (250, 600)]; good = [apply(T2, *p) for p in P]
    ctrl = [(P[0], [good[0]]), (P[1], [(good[1][0] + 0.01, good[1][1]), good[1]]), (P[2], [good[2]])]
    tf, res, ll = best_fit({}, ctrl)
    assert ll[1] == good[1] and res < 50, (ll, res)
    # Local roads: abbreviations and a direction suffix match; a divided road's crossings merge; the city filters.
    import tempfile
    global ROADS, MUNIS
    d = tempfile.mkdtemp(); rp, mp = os.path.join(d, 'r.geojsonseq'), os.path.join(d, 'm.geojsonseq')
    with open(rp, 'w') as f:
        for nm, ref, coords in [('Queen Street East', None, [[-79.80, 43.70], [-79.70, 43.70]]), ('Queen Street East', None, [[-79.80, 43.7003], [-79.70, 43.7003]]),
                                ('Kennedy Road North', None, [[-79.75, 43.65], [-79.75, 43.75]]), ('Queen Street South', '50', [[-79.60, 43.80], [-79.60, 43.90]]),
                                ('King Street', None, [[-79.65, 43.85], [-79.55, 43.85]]), ('King Street', None, [[-79.75, 43.60], [-79.74, 43.80]])]:
            f.write('\x1e' + json.dumps({'type': 'Feature', 'properties': {'name': nm, **({'ref': ref} if ref else {})}, 'geometry': {'type': 'LineString', 'coordinates': coords}}) + '\n')
    with open(mp, 'w') as f:
        f.write(json.dumps({'type': 'Feature', 'properties': {'name': 'Caledon'}, 'geometry': {'type': 'Polygon', 'coordinates': [[[-79.7, 43.8], [-79.5, 43.8], [-79.5, 44.0], [-79.7, 44.0], [-79.7, 43.8]]]}}) + '\n')
    old = (os.environ.get('EA_ROADS'), os.environ.get('EA_MUNIS'), ROADS, MUNIS)
    os.environ['EA_ROADS'], os.environ['EA_MUNIS'] = rp, mp; ROADS = MUNIS = None
    try:
        x = geocode_xing(['Kennedy Rd', 'Queen St'], 'Brampton', {})
        assert len(x) == 1 and abs(x[0][0] + 79.75) < 1e-6 and abs(x[0][1] - 43.70015) < 1e-4, x
        y = geocode_xing(['Highway 50', 'King St'], 'Caledon', {})   # two King Streets: only the one in Caledon crosses Hwy 50
        assert len(y) == 1 and abs(y[0][0] + 79.60) < 1e-6 and abs(y[0][1] - 43.85) < 1e-6, y
    finally:
        for k, v in zip(('EA_ROADS', 'EA_MUNIS'), old[:2]):
            if v is None: os.environ.pop(k, None)
            else: os.environ[k] = v
        ROADS, MUNIS = old[2], old[3]
    # Road corridors, offsets, intersections and creek crossings on a small grid (no network).
    global WATER
    keep = (ROADS, MUNIS, WATER)
    lat0 = 43.70; dlat = 1000 / 110574            # ~1 km of latitude
    ROADS = {'main street': [[[-79.75, lat0 - dlat], [-79.75, lat0 + 0.5 * dlat]], [[-79.75, lat0 + 0.5 * dlat], [-79.75, lat0 + 3 * dlat]]],
             'first avenue': [[[-79.76, lat0], [-79.74, lat0]]], 'second avenue': [[[-79.76, lat0 + 2 * dlat], [-79.74, lat0 + 2 * dlat]]]}
    MUNIS = {}; WATER = {'mill creek': [[[-79.76, lat0 + 1.2 * dlat], [-79.74, lat0 + 1.3 * dlat]]]}
    try:
        line, note = corridor({'road': 'Main Street', 'from': 'First Avenue', 'to': 'Second Avenue'}, '', {})
        assert line and abs(metres(line[0], line[-1]) - 2000) < 30 and abs(line[0][1] - lat0) < 1e-5, (line, note)
        # An offset walks along the road: 500 m north of First Avenue to 300 m north of Second Avenue.
        line, _ = corridor({'road': 'Main Street', 'from': {'street': 'First Avenue', 'offsetM': 500, 'dir': 'N'}, 'to': {'street': 'Second Avenue', 'offsetM': 300, 'dir': 'N'}}, '', {})
        assert line and abs(metres((-79.75, lat0), line[0]) - 500) < 30 and abs(metres((-79.75, lat0 + 2 * dlat), line[-1]) - 300) < 30, line
        ov = {'eas': {}}; rep = []
        place_roads({'roads': [{'id': 'a', 'kind': 'road', 'road': 'Main Street', 'from': 'First Avenue', 'to': 'Second Avenue'},
                               {'id': 'b', 'kind': 'point', 'streets': ['Main Street', 'Second Avenue']},
                               {'id': 'c', 'kind': 'point', 'road': 'Main Street', 'water': 'Mill Creek'},
                               {'id': 'd', 'kind': 'road', 'road': 'Main Street', 'from': 'First Avenue', 'to': 'Third Avenue'}]}, ov, {}, rep)
        assert ov['eas']['a']['geometry']['type'] == 'LineString' and ov['eas']['a']['geomType'] == 'road' and 'OpenStreetMap' in ov['eas']['a']['geomMethod'], ov['eas']['a']
        assert ov['eas']['a']['geomMethod'].startswith('road centreline Main Street from First Avenue to Second Avenue')
        assert ov['eas']['b']['geometry']['type'] == 'Point' and abs(ov['eas']['b']['geometry']['coordinates'][1] - (lat0 + 2 * dlat)) < 1e-5
        assert ov['eas']['c']['geometry']['type'] == 'Point' and ov['eas']['c']['geomMethod'].startswith('where Main Street crosses Mill Creek')
        assert 'd' not in ov['eas'] and any(r.startswith('d: corridor not placed') for r in rep), rep
    finally:
        ROADS, MUNIS, WATER = keep
    print('selftest ok')

if __name__ == '__main__':
    selftest() if '--selftest' in sys.argv else main()
