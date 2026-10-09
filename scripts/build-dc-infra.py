#!/usr/bin/env python3
"""
Planned water / wastewater infrastructure from the Region of Peel 2026 Development Charges capital
maps (draft, v2, March 2026): geospatial PDFs exported from ArcGIS Pro, fetched by the probe workflow
(mode=dc-maps -> ref-docs-dc branch) as SVG (pdftocairo), word boxes (pdftotext -bbox-layout) and
the GDAL geotransform.

Lines are read by style (colour, dash): wastewater proposed local main (green), primary main (red),
force main (purple); approved 2026 mains are dashed. Water: distribution feeder main (blue) and
transmission main (red). Labels (construction year / component number / project number, and the
diameter) are attached to the nearest line of the same frame. Inset maps are mapped onto the main map
through their dashed extent boxes (same aspect ratio), then everything is georeferenced (UTM 17N ->
WGS84). Facility boxes (plants, stations, reservoirs) are outlined text in the PDF: they are
transcribed in scripts/dc-facilities.json and placed at the nearest facility symbol.

Usage: python3 scripts/build-dc-infra.py <dir with dc/*.svg.gz, *.bbox.html.gz, *.gdalinfo.txt> [out]
"""
import gzip, json, math, re, sys
from collections import defaultdict

SRC = sys.argv[1] if len(sys.argv) > 1 else 'ref-docs-dc'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'data/dc-infra.json'
NUM = r'-?[\d.]+(?:e-?\d+)?'

def parse_d(d):
    toks = re.findall(r'[MLCZ]|' + NUM, d); polys, cur, i, cmd = [], [], 0, None
    while i < len(toks):
        t = toks[i]
        if t in 'MLCZ':
            cmd = t; i += 1
            if t == 'Z' and cur: cur.append(cur[0])
            if t == 'M':
                if len(cur) > 1: polys.append(cur)
                cur = []
            continue
        if cmd in ('M', 'L'): cur.append((float(toks[i]), float(toks[i + 1]))); i += 2
        elif cmd == 'C': cur.append((float(toks[i + 4]), float(toks[i + 5]))); i += 6
        else: i += 1
    if len(cur) > 1: polys.append(cur)
    return polys

def apply(m, pts):
    a, b, c, d, e, f = m
    return [(a * x + c * y + e, b * x + d * y + f) for x, y in pts]

def load_svg(path):
    s = gzip.open(path, 'rt').read()
    clips = []
    for body in re.findall(r'<clipPath id="[^"]+">\s*(.*?)</clipPath>', s, re.S):
        for a in re.findall(r'<path ([^>]*?)/>', body):
            tm = re.search(r'transform="matrix\(([^)]*)\)"', a)
            m = tuple(float(x) for x in tm.group(1).split(',')) if tm else (1, 0, 0, 1, 0, 0)
            for poly in parse_d(re.search(r' d="([^"]*)"', ' ' + a).group(1)):
                pp = apply(m, poly); xs = [x for x, y in pp]; ys = [y for x, y in pp]
                if len(poly) <= 6: clips.append((min(xs), min(ys), max(xs), max(ys)))
    body = re.sub(r'<g id="glyph-[^"]*">.*?</g>', '', s, flags=re.S)
    body = re.sub(r'<clipPath.*?</clipPath>', '', body, flags=re.S)
    out = []
    for a in re.findall(r'<path ([^>]*?)/>', body):
        d = re.search(r' d="([^"]*)"', ' ' + a)
        if not d: continue
        g = lambda k: (re.search(k + r'="([^"]+)"', a) or [None, None])[1]
        tm = re.search(r'transform="matrix\(([^)]*)\)"', a)
        m = tuple(float(x) for x in tm.group(1).split(',')) if tm else (1, 0, 0, 1, 0, 0)
        out.append({'stroke': g('stroke'), 'fill': g('fill'), 'w': float(g('stroke-width')) if g('stroke-width') else None,
                    'dash': g('stroke-dasharray'), 'polys': [apply(m, p) for p in parse_d(d.group(1))]})
    return out, clips

def bbox_of(poly):
    xs = [x for x, y in poly]; ys = [y for x, y in poly]
    return (min(xs), min(ys), max(xs), max(ys))

def inside(pt, r, pad=0): return r[0] - pad <= pt[0] <= r[2] + pad and r[1] - pad <= pt[1] <= r[3] + pad

def seg_dist(p, a, b):
    ax, ay = a; bx, by = b; dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L))
    return math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)

def poly_dist(p, poly): return min(seg_dist(p, a, b) for a, b in zip(poly, poly[1:]))

def utm_to_ll(E, N, zone=17):
    # Inverse transverse Mercator (GRS80; NAD83 ~ WGS84 at this scale).
    a = 6378137.0; f = 1 / 298.257222101; k0 = 0.9996; e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    x = E - 500000.0; y = N; M = y / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu) + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu)
    C1 = ep2 * math.cos(p1) ** 2; T1 = math.tan(p1) ** 2; N1 = a / math.sqrt(1 - e2 * math.sin(p1) ** 2)
    R1 = a * (1 - e2) / (1 - e2 * math.sin(p1) ** 2) ** 1.5; D = x / (N1 * k0)
    lat = p1 - (N1 * math.tan(p1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720)
    lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / math.cos(p1)
    return (round(math.degrees(lon) + (zone - 1) * 6 - 180 + 3, 6), round(math.degrees(lat), 6))

STYLES = {
    'wastewater': {
        'rgb(21.960449%, 65.881348%, 0%)': 'local', 'rgb(100%, 0%, 0%)': 'primary', 'rgb(77.253723%, 0%, 100%)': 'force',
    },
    'water': {
        'rgb(0%, 43.920898%, 100%)': 'feeder', 'rgb(100%, 0%, 0%)': 'transmission',
    },
}
SYMBOL_STATUS = {
    'wastewater': {'rgb(21.960449%, 65.881348%, 0%)': 'approved', 'rgb(14.901733%, 45.097351%, 0%)': 'proposed'},
    'water': {'rgb(0%, 43.920898%, 100%)': 'approved', 'rgb(0%, 30.195618%, 65.881348%)': 'proposed'},
}
FRAME = '30.58'      # inset / box frame stroke
EXTENT = '20.39'     # dashed inset extent on the main map

def build(kind):
    paths, clips = load_svg(f'{SRC}/dc/{kind}.svg.gz')
    gt = [float(v) for v in re.findall(NUM, re.search(r'GeoTransform =\s*([^\n]+\n[^\n]+)', open(f'{SRC}/dc/{kind}.gdalinfo.txt').read()).group(1))]
    to_ll = lambda x, y: utm_to_ll(gt[0] + x * gt[1] + y * gt[2], gt[3] + x * gt[4] + y * gt[5])
    frames = []
    for p in paths:
        if p['stroke'] and FRAME in p['stroke'] and not p['dash']:
            for poly in p['polys']:
                r = bbox_of(poly)
                if r[2] - r[0] > 40 and r[3] - r[1] > 30 and len(poly) <= 6: frames.append(r)
    extents = [bbox_of(poly) for p in paths if p['dash'] and p['stroke'] and EXTENT in p['stroke'] for poly in p['polys']]
    # Pair each frame with the extent box of the same aspect ratio (inset maps); others are boxes.
    pairs = []
    used = set()
    for f in sorted(frames, key=lambda r: -(r[2] - r[0]) * (r[3] - r[1])):
        fa = (f[2] - f[0]) / (f[3] - f[1])
        best = None
        for i, e in enumerate(extents):
            if i in used: continue
            ea = (e[2] - e[0]) / (e[3] - e[1])
            err = abs(math.log(fa / ea))
            # Use the clip rectangle of the inset when there is one (exact frame).
            if err < 0.03 and (best is None or err < best[0]): best = (err, i)
        if best: used.add(best[1]); pairs.append((f, extents[best[1]]))
    boxes = [f for f in frames if not any(f == p[0] for p in pairs)]
    def frame_of(pt):
        for f, e in pairs:
            if inside(pt, f): return (f, e)
        return None
    def in_box(pt): return any(inside(pt, b) for b in boxes)
    def to_main(pt, fe):
        if not fe: return pt
        f, e = fe; s = (e[2] - e[0]) / (f[2] - f[0])
        return (e[0] + (pt[0] - f[0]) * s, e[1] + (pt[1] - f[1]) * s)
    outer = max(frames + [b for b in clips if b[2] - b[0] < 1700], key=lambda r: (r[2] - r[0]) * (r[3] - r[1]))
    # Lines by style.
    lines = []
    for p in paths:
        cls = STYLES[kind].get(p['stroke']) if p['stroke'] else None
        if not cls or not p['w'] or p['w'] < 1.5: continue
        for poly in p['polys']:
            if len(poly) < 2: continue
            mid = poly[len(poly) // 2]
            if in_box(mid) and not frame_of(mid): continue     # legend swatches
            fe = frame_of(mid)
            lines.append({'cls': cls, 'status': 'approved' if p['dash'] else 'proposed', 'src': poly, 'fe': fe})
    # Legend swatches: tiny isolated lines inside the legend box (frame without extent) are already dropped.
    # Labels: year / component / project blocks, and diameters.
    h = gzip.open(f'{SRC}/dc/{kind}.bbox.html.gz', 'rt').read()
    words = [(float(a), float(b), float(c), float(d), t) for a, b, c, d, t in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', h)]
    projs = [w for w in words if re.fullmatch(r'\d\d-\d{4}', w[4])]
    comps = [w for w in words if re.fullmatch(r'\d{5}', w[4])]
    years = [w for w in words if re.fullmatch(r'20[2-5]\d', w[4])]
    dias = [w for w in words if re.fullmatch(r'(150|200|250|300|375|400|450|525|600|675|750|825|900|1050|1200|1350|1500|1650|1800|2100|2400)', w[4])]
    labels = []
    for pw in projs:
        cx = (pw[0] + pw[2]) / 2
        comp = min((c for c in comps if 0 < pw[1] - c[1] < 14 and abs((c[0] + c[2]) / 2 - cx) < 12), key=lambda c: pw[1] - c[1], default=None)
        if not comp: continue
        yr = min((y for y in years if 0 < comp[1] - y[1] < 14 and abs((y[0] + y[2]) / 2 - cx) < 12), key=lambda y: comp[1] - y[1], default=None)
        box = (min(pw[0], comp[0], yr[0] if yr else 1e9), (yr or comp)[1], max(pw[2], comp[2]), pw[3])
        labels.append({'proj': pw[4], 'comp': comp[4], 'year': int(yr[4]) if yr else None, 'box': box})
    # Attach each label to the nearest line in its frame (distance from the label box edge).
    for lb in labels:
        b = lb['box']; c = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
        if in_box(c) and not frame_of(c): lb['skip'] = True; continue
        fe = frame_of(c)
        cands = [ln for ln in lines if ln['fe'] == fe]
        best = None
        for ln in cands:
            d = min(poly_dist(pt, ln['src']) for pt in [c, (b[0], c[1]), (b[2], c[1]), (c[0], b[1]), (c[0], b[3])])
            if best is None or d < best[0]: best = (d, ln)
        if best and best[0] < 30: best[1].setdefault('labels', []).append((best[0], lb))
    for ln in lines:
        if ln.get('labels'):
            ln['labels'].sort(key=lambda x: x[0]); lb = ln['labels'][0][1]
            ln.update(year=lb['year'], comp=lb['comp'], proj=lb['proj'])
    # Diameter: nearest number along the line (same frame), within 12 pt.
    for dw in dias:
        c = ((dw[0] + dw[2]) / 2, (dw[1] + dw[3]) / 2); fe = frame_of(c)
        best = min(((poly_dist(c, ln['src']), ln) for ln in lines if ln['fe'] == fe), key=lambda x: x[0], default=None)
        if best and best[0] < 12: best[1].setdefault('dias', []).append(int(dw[4]))
    # Unlabelled pieces: take the label of a touching piece of the same style (connected chains).
    def ends(ln): return [ln['src'][0], ln['src'][-1]]
    for _ in range(6):
        changed = False
        for ln in lines:
            if ln.get('comp'): continue
            for o in lines:
                if o is ln or not o.get('comp') or o['fe'] != ln['fe'] or o['cls'] != ln['cls'] or o['status'] != ln['status']: continue
                if any(math.hypot(a[0] - b[0], a[1] - b[1]) < 1.0 for a in ends(ln) for b in ends(o)):
                    ln.update(year=o['year'], comp=o['comp'], proj=o['proj'], inherited=True); changed = True; break
        if not changed: break
    # Main-map pieces inside an inset extent are drawn again (labelled) in the inset: keep the inset's.
    extents_used = [e for f, e in pairs]
    out = []
    for ln in lines:
        pts = [to_main(p, ln['fe']) for p in ln['src']]
        if not ln['fe'] and any(inside(pts[len(pts) // 2], e) for e in extents_used): continue
        dia = max(set(ln.get('dias', [])), key=ln.get('dias', []).count) if ln.get('dias') else None
        out.append({'k': ln['cls'], 's': ln['status'], 'y': ln.get('year'), 'c': ln.get('comp'), 'p': ln.get('proj'), 'd': dia,
                    'g': [to_ll(*p) for p in pts]})
    # Facility symbols are characters of an Esri symbol font: the character gives the kind, the
    # fill of its glyph the status (approved 2026 / proposed 2027-2051 / existing).
    svg = gzip.open(f'{SRC}/dc/{kind}.svg.gz', 'rt').read()
    uses = [(float(x), float(y), f) for f, x, y in re.findall(r'<g fill="([^"]+)"[^>]*>\s*<use xlink:href="#glyph-[\d-]+" x="([-\d.]+)" y="([-\d.]+)"/>', svg)]
    grid = defaultdict(list)
    for u in uses: grid[(int(u[0] // 10), int(u[1] // 10))].append(u)
    KIND = {'*': 'pumping_station', ',': 'odour_control', ')': 'reservoir', 'T': 'elevated_tank'}
    STATUS = SYMBOL_STATUS[kind]
    syms = []
    for w in words:
        if w[4] not in KIND: continue
        x, y = w[0], w[3]
        near = [u for gx in (int(x // 10) - 1, int(x // 10), int(x // 10) + 1) for gy in (int(y // 10) - 1, int(y // 10), int(y // 10) + 1) for u in grid[(gx, gy)]
                if abs(u[0] - x) < 4 and abs(u[1] - y) < 5 and u[2] in STATUS]
        if not near: continue
        c = ((w[0] + w[2]) / 2, (w[1] + w[3]) / 2)
        if in_box(c) and not frame_of(c): continue      # legend
        fe = frame_of(c)
        pt = to_main(c, fe)
        if not fe and any(inside(pt, e) for e in extents_used): continue
        st = STATUS[near[0][2]]
        if any(s['k'] == KIND[w[4]] and s['s'] == st and math.hypot(s['pt'][0] - pt[0], s['pt'][1] - pt[1]) < 3 for s in syms): continue
        syms.append({'k': KIND[w[4]], 's': st, 'pt': pt})
    for s in syms:
        lng, lat = to_ll(*s['pt'])
        # Symbol glyph anchor: a constant offset against the Region's pumping station points
        # (34 existing stations, spread about 2 m).
        s['g'] = (round(lng + 0.0004155, 6), round(lat - 0.000303, 6))
    # Facility names on the map (to place the transcribed facility boxes).
    names = []
    for m in re.finditer(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', h, re.S):
        t = ' '.join(re.findall(r'>([^<]+)</word>', m.group(5))).strip()
        c = ((float(m.group(1)) + float(m.group(3))) / 2, (float(m.group(2)) + float(m.group(4))) / 2)
        if in_box(c) and not frame_of(c): continue
        names.append((t.lower(), to_main(c, frame_of(c)), c))
    # Names wrapped onto two lines ("Jack / Darling 3", "Beckett / Sproule").
    for (t1, p1, c1), (t2, p2, c2) in zip(list(names), list(names)[1:]):
        if 0 < c2[1] - c1[1] < 16 and abs(c2[0] - c1[0]) < 40: names.append((f'{t1} {t2}', p1, c1))
    stats = defaultdict(int)
    for o in out: stats[(o['k'], o['s'], bool(o['c']))] += 1
    print(kind, 'pairs', len(pairs), 'boxes', len(boxes), 'lines', len(out), 'labels', len(labels), dict(stats))
    return {'lines': out, 'symbols': syms, 'labels': len(labels), 'to_ll': to_ll, 'names': names}

COMPAT = {'pumping_station': {'pumping_station', 'reservoir'}, 'reservoir': {'reservoir', 'pumping_station'}, 'elevated_tank': {'elevated_tank'},
          'odour_control': {'odour_control'}, 'well': set(), 'plant': set(), 'program': set()}
def place_facilities(kind, res, fac, plants):
    out, used = [], set()
    def snap(pt_page=None, ll=None, kinds=(), radius_pt=60, radius_m=300):
        best = None
        for i, s in enumerate(res['symbols']):
            if i in used or s['k'] not in kinds: continue
            if pt_page: d = math.hypot(s['pt'][0] - pt_page[0], s['pt'][1] - pt_page[1]); ok = d < radius_pt
            else: d = math.hypot((s['g'][0] - ll[0]) * 80400, (s['g'][1] - ll[1]) * 111200); ok = d < radius_m
            if ok and (best is None or d < best[0]): best = (d, i)
        if best: used.add(best[1]); return res['symbols'][best[1]]['g']
        return None
    for f in fac[kind]:
        g = None
        kinds = COMPAT.get(f['kind'], set())
        if f.get('plant') and f['plant'] in plants: g = plants[f['plant']]
        elif f.get('at'): g = tuple(f['at'])
        elif f.get('near'): g = snap(ll=f['near'], kinds=kinds) or tuple(f['near'])
        elif f.get('label'):
            lab = f['label'].lower()
            hits = [pt for t, pt, _ in res['names'] if t == lab or t.startswith(lab + ' ') or t.endswith(' ' + lab) or (lab in t and len(t) < len(lab) + 12)]
            if hits:
                g = snap(pt_page=hits[0], kinds=kinds) if kinds else None
                g = g or res['to_ll'](*hits[0])
        out.append({**{k: v for k, v in f.items() if k not in ('label', 'near', 'at')}, 'g': g})
        if not g and f['kind'] != 'program': print('  not placed:', f['name'])
    return out

def study_components(path):
    """Component number -> project name, description and diameter, from the 2020 DC Background Study
    capital tables (pdftotext -layout: a row line per component with its name and description
    wrapped on the lines around it, in fixed columns)."""
    try: lines = gzip.open(path, 'rt').read().split('\n')
    except OSError: return {}
    row = re.compile(r'^\s*\d+\s+(\d{5})\s+(\d{6})\s+\S.*?\s(20\d\d)\s+[\d,]+')
    rows = [(i, row.match(l)) for i, l in enumerate(lines) if row.match(l)]
    out = {}
    clean = lambda parts: re.sub(r'\s+', ' ', ' '.join(p for p in parts if p)).strip()
    for j, (i, m) in enumerate(rows):
        lo = (rows[j - 1][0] + i) // 2 + 1 if j else max(0, i - 4)
        hi = (i + rows[j + 1][0]) // 2 if j + 1 < len(rows) else i + 4
        blk = [l for l in lines[lo:hi + 1] if not re.search(r'Watson|PAGE|H:\\|Service:|Prj\.No|Component Description|Infrastructure Costs', l)]
        blk = [l if k != i - lo else l for k, l in enumerate(blk)]
        name = clean(l[56:103].strip() for l in blk)
        desc = clean(l[103:158].strip() for l in blk)
        mm = re.search(r'(\d{3,4})-mm', desc)
        out[m.group(1)] = {'proj20': m.group(2), 'name': name, 'year20': int(m.group(3)), 'desc': desc[:240], 'mm': int(mm.group(1)) if mm else None}
    return out

if __name__ == '__main__':
    import os
    res = {k: build(k) for k in ('wastewater', 'water')}
    here = os.path.dirname(os.path.abspath(__file__))
    fac = json.load(open(os.path.join(here, 'dc-facilities.json')))
    svc = json.load(open(os.path.join(here, '..', 'data', 'servicing.json')))
    plants = {p['name']: tuple(p['lnglat']) for p in svc.get('plants', [])}
    study = study_components(f'{SRC}/dc/dcbs2024.txt.gz')
    print('study components', len(study))
    doc = {
        'version': 1, 'generatedAt': __import__('datetime').date.today().isoformat(),
        'source': {
            'status': 'Draft, not approved by Council (v2, March 2026)',
            'maps': {'wastewater': 'https://peelregion.ca/sites/default/files/2026-03/capital-map-wastewater-development-charges-v2.pdf',
                     'water': 'https://peelregion.ca/sites/default/files/2026-03/capital-map-water-development-charges-v2.pdf'},
            'study': 'https://peelregion.ca/sites/default/files/2024-05/peel_development-charges-background-study.pdf',
            'method': 'Lines and symbols read from the geospatial PDFs (ArcGIS Pro export, UTM 17N); inset maps placed through their extent boxes; facility boxes transcribed. Positions within a few metres of the PDF.',
        },
        # Treatment capacity steps: the plant is assumed to have the new capacity the year after
        # its last construction year (editable in the app).
        'plantCapacity': {
            'Lakeview': [
                {'year': 2028, 'mld': 558, 'note': '+40 ML/d, council-approved February 2024 (in service by 2028)', 'ref': 'https://www.link2build.ca/news/posts/peel-region-allocates-130-million-to-expand-wastewater-capacity/'},
                {'year': 2037, 'mld': 600, 'proj': '25-2945', 'note': 'Treatment expansion to 600 ML/d: design 2033, construction 2036 (2026 DC map; 518 to 600 ML/d in the 2020 DC Background Study)'},
            ],
            'Clarkson': [
                {'year': 2029, 'mld': 500, 'proj': '22-2950', 'note': 'Treatment expansion to 500 ML/d: construction 2026-2028 (2026 DC map; 350 to 500 ML/d in the 2020 DC Background Study)'},
            ],
        },
    }
    for k in res:
        lines = res[k]['lines']
        for ln in lines:
            st = study.get(ln['c'] or '')
            if st:
                ln['n'] = st['name']; ln['t'] = st['desc']
                if not ln['d'] and st['mm']: ln['d'] = st['mm']
        doc[k] = {'lines': lines, 'facilities': place_facilities(k, res[k], fac, plants),
                  'symbols': [{'k': s['k'], 's': s['s'], 'g': s['g']} for s in res[k]['symbols']]}
    json.dump(doc, open(OUT, 'w'), separators=(',', ':'))
    print('wrote', OUT, os.path.getsize(OUT))
    for k in res:
        c = defaultdict(int)
        for s in res[k]['symbols']: c[(s['k'], s['s'])] += 1
        print(k, dict(c))
