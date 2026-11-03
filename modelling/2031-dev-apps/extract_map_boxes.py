"""Bucket 2, step 1: read the priority-area boxes off the map PDF and georeference them.

The map (ArcMap export) draws each priority area as a dark-red rectangle and each application as
a point symbol. The symbols' page positions are matched to the shapefile points (known
coordinates) to fit a page -> UTM 17N transform; the rectangles are then known on the ground.

Needs `pdftocairo` (poppler) to turn the PDF into SVG.

Input:  private/input/<map>.pdf, private/input/Dev_Apps_V7.shp
Output: private/map_boxes.json  (transform, fit quality, the boxes in page and UTM coordinates)

Usage:  python3 extract_map_boxes.py [--pdf PDF] [--shp BASE] [--out JSON]
"""
import argparse
import glob
import json
import math
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from geo import apply, fit_affine, to_utm  # noqa: E402
from shapefile_lite import read_points  # noqa: E402

BOX_STROKE = 'rgb(85.882568%, 20.39032%, 14.509583%)'   # the map's dark-red area outline
MAP_SCALE = 192036                                       # from the map's title block
PT_M = MAP_SCALE * 0.0254 / 72                           # ground metres per PDF point


def _attr(a, k):
    m = re.search(k + r'="([^"]*)"', a)
    return m.group(1) if m else None


def scan_svg(svg_text):
    rects, dots = [], []
    for a in re.findall(r'<path ([^>]*)/>', svg_text):
        d, tr = _attr(a, 'd') or '', _attr(a, 'transform') or ''
        nums = [float(x) for x in re.findall(r'-?\d+\.?\d*', d)]
        pts = list(zip(nums[0::2], nums[1::2]))
        m = re.match(r'matrix\(([^)]*)\)', tr)
        if m:
            A, B, C, D, E, F = [float(v) for v in m.group(1).split(',')]
            pts = [(A * x + C * y + E, B * x + D * y + F) for x, y in pts]
        if not pts:
            continue
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        cmds = re.sub(r'[^A-Za-z]', '', d)
        if _attr(a, 'stroke') == BOX_STROKE and cmds.startswith('MLLL') and w > 3 and h > 3:
            rects.append({'x0': min(xs), 'y0': min(ys), 'x1': max(xs), 'y1': max(ys)})
        fill = _attr(a, 'fill')
        if 'C' in cmds and w < 6 and h < 6 and fill and fill != 'none':
            dots.append(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2))
    # one position per symbol (a symbol is drawn as several circles)
    sym = []
    for x, y in dots:
        if not any(abs(x - u) < 0.6 and abs(y - v) < 0.6 for u, v in sym):
            sym.append((x, y))
    return rects, sym


def near_box(p, rects, tol=5):
    return any(r['x0'] - tol <= p[0] <= r['x1'] + tol and r['y0'] - tol <= p[1] <= r['y1'] + tol for r in rects)


def georeference(symbols, ground):
    """Fit page -> UTM: try rotations at the map's known scale, then refine with an affine fit
    against nearest points (iterated, best 80% of pairs). Returns (transform, residuals_m)."""
    cx, cy = sum(p[0] for p in ground) / len(ground), sum(p[1] for p in ground) / len(ground)
    dx, dy = sum(p[0] for p in symbols) / len(symbols), sum(p[1] for p in symbols) / len(symbols)
    best = None
    for step in range(-120, 121):
        th = math.radians(step * 0.5 * 3)       # -180..180 in 1.5 degree steps
        t = (PT_M * math.cos(th), PT_M * math.sin(th), 0, PT_M * math.sin(th), -PT_M * math.cos(th), 0)
        q = apply(t, (dx, dy))
        t = (t[0], t[1], cx - q[0], t[3], t[4], cy - q[1])
        for _ in range(15):
            pairs = []
            for p in symbols:
                g = apply(t, p)
                k = min(ground, key=lambda s: (s[0] - g[0]) ** 2 + (s[1] - g[1]) ** 2)
                pairs.append((p, k, math.dist(g, k)))
            pairs.sort(key=lambda z: z[2])
            keep = pairs[:max(6, int(len(pairs) * 0.8))]
            t = fit_affine([a for a, _, _ in keep], [b for _, b, _ in keep])
        res = sorted(min(math.dist(apply(t, p), s) for s in ground) for p in symbols)
        med = res[len(res) // 2]
        if best is None or med < best[0]:
            best = (med, t, res)
    return best[1], best[2]


def main():
    ap = argparse.ArgumentParser()
    pdfs = glob.glob(os.path.join(HERE, 'private', 'input', '*.pdf'))
    ap.add_argument('--pdf', default=pdfs[0] if pdfs else None)
    ap.add_argument('--shp', default=os.path.join(HERE, 'private', 'input', 'Dev_Apps_V7'))
    ap.add_argument('--out', default=os.path.join(HERE, 'private', 'map_boxes.json'))
    a = ap.parse_args()
    if not a.pdf:
        raise SystemExit('no map PDF found in private/input/')
    with tempfile.TemporaryDirectory() as tmp:
        svg = os.path.join(tmp, 'map.svg')
        subprocess.run(['pdftocairo', '-svg', a.pdf, svg], check=True)
        rects, symbols = scan_svg(open(svg, encoding='utf-8').read())
    symbols = [p for p in symbols if near_box(p, rects)]
    ground = [to_utm(*p) for p in read_points(a.shp + '.shp') if p]
    t, res = georeference(symbols, ground)
    scale = math.hypot(t[0], t[3])
    for r in rects:
        r['utm'] = [apply(t, c) for c in ((r['x0'], r['y0']), (r['x1'], r['y0']), (r['x1'], r['y1']), (r['x0'], r['y1']))]
    out = {
        'pdf': os.path.basename(a.pdf), 'boxes': rects, 'transform': t,
        'fit': {'symbols': len(symbols), 'median_m': res[len(res) // 2], 'p90_m': res[int(len(res) * 0.9)],
                'max_m': res[-1], 'scale_m_per_pt': scale, 'expected_m_per_pt': PT_M,
                'rotation_deg': math.degrees(math.atan2(t[3], t[0]))},
    }
    json.dump(out, open(a.out, 'w'), indent=1)
    f = out['fit']
    print(f"wrote {a.out}: {len(rects)} boxes, {f['symbols']} symbols; fit median {f['median_m']:.1f} m, "
          f"max {f['max_m']:.1f} m; scale {scale:.2f} m/pt (map says {PT_M:.2f}); rotation {f['rotation_deg']:.1f} deg")


if __name__ == '__main__':
    main()
