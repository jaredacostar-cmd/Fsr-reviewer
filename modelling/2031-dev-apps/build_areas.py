"""Bucket 2: assign each development application to one of the 19 priority areas by location.

Uses the georeferenced map boxes (extract_map_boxes.py), names each box by the map label whose
area its applications add up to, reconciles population per area, derives the municipality from
the location where the file has none, and lists duplicate candidates for Bucket 3.

Input:  private/input/Dev_Apps_V7.*, private/map_labels.csv, private/map_boxes.json,
        private/decisions.csv, ../../data/munis.json (the app's municipal outlines)
Output: private/Bucket2_Areas.xlsx, private/Bucket2_check_map.png

Usage:  python3 build_areas.py
"""
import argparse
import collections
import csv
import glob
import json
import math
import os
import re
import subprocess
import sys
import tempfile

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import xlsx_style as X  # noqa: E402
from build_inventory import find_issues, load  # noqa: E402
from build_map_areas import load_labels  # noqa: E402
from geo import to_utm  # noqa: E402

EDGE_M = 150          # a point this close outside a box (symbol overlapping the edge) goes to that box
AREA_TOL_HA = 0.02    # a box is named after the label whose area its applications add up to, within this
MUNI_NEAR_M = 100     # the municipal outlines are accurate to about 60 m; closer than this = check
SAME_AREA_MIN_HA = 1  # same-area duplicate check ignores parcels smaller than this

PALETTE = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#17becf',
           '#bcbd22', '#393b79', '#e6550d', '#31a354', '#843c39', '#7b4173', '#3182bd', '#636363',
           '#fd8d3c', '#74c476', '#de9ed6']


# ---------------------------------------------------------------- geometry

def invert(t):
    a, b, c, d, e, f = t
    det = a * e - b * d
    return lambda X_, Y_: ((e * (X_ - c) - b * (Y_ - f)) / det, (-d * (X_ - c) + a * (Y_ - f)) / det)


def box_dist_pt(p, r):
    dx = max(r['x0'] - p[0], 0, p[0] - r['x1'])
    dy = max(r['y0'] - p[1], 0, p[1] - r['y1'])
    return math.hypot(dx, dy)


def in_rings(x, y, rings):
    inside = False
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                inside = not inside
    return inside


def dist_to_rings_m(lon, lat, rings):
    kx = 111320 * math.cos(math.radians(lat))
    ky = 110574
    best = float('inf')
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            ax, ay = (x1 - lon) * kx, (y1 - lat) * ky
            bx, by = (x2 - lon) * kx, (y2 - lat) * ky
            vx, vy = bx - ax, by - ay
            L = vx * vx + vy * vy
            t = 0 if L == 0 else max(0, min(1, -(ax * vx + ay * vy) / L))
            best = min(best, math.hypot(ax + t * vx, ay + t * vy))
    return best


# ---------------------------------------------------------------- assignment

def assign(apps, boxes, labels):
    inv = invert(boxes['transform'])
    scale = boxes['fit']['scale_m_per_pt']
    rects = boxes['boxes']
    for a in apps:
        a['_page'] = inv(*to_utm(a['_lon'], a['_lat']))
        hits = [k for k, r in enumerate(rects) if box_dist_pt(a['_page'], r) <= 0.5]
        a['_box'], a['_outside_m'] = None, None
        if len(hits) == 1:
            a['_box'], a['_method'] = hits[0], 'Inside box'
        elif len(hits) > 1:
            a['_method'] = 'Not assigned: inside two boxes'
        else:
            k = min(range(len(rects)), key=lambda i: box_dist_pt(a['_page'], rects[i]))
            dm = box_dist_pt(a['_page'], rects[k]) * scale
            a['_outside_m'] = dm
            if dm <= EDGE_M:
                a['_box'], a['_method'] = k, f'Nearest box (point {dm:.0f} m outside its edge)'
            else:
                a['_method'] = f'Not assigned: {dm:.0f} m from the nearest box'
    names = {}
    for k in range(len(rects)):
        ha = sum(a['Area'] for a in apps if a['_box'] == k)
        cand = [lab['area_name'] for lab in labels if abs(lab['area_ha'] - ha) <= AREA_TOL_HA]
        names[k] = cand[0] if len(cand) == 1 else None
    for a in apps:
        a['_area'] = names.get(a['_box']) if a['_box'] is not None else None
        if a['_box'] is not None and not a['_area']:
            a['_method'] += '; box not matched to a label'
    return names


def municipalities(apps, munis):
    for a in apps:
        found = [m['name'] for m in munis['munis'] if in_rings(a['_lon'], a['_lat'], m['rings'])]
        loc = found[0] if len(found) == 1 else None
        near = min(dist_to_rings_m(a['_lon'], a['_lat'], m['rings']) for m in munis['munis'])
        given = a.get('MUNICIPALI') or None
        a['_muni_loc'], a['_muni_edge_m'] = loc, near
        if given and loc and given == loc:
            a['_muni'], note = given, 'File and location agree'
        elif given and loc:
            a['_muni'], note = given, f'Disagrees: file says {given}, location says {loc}'
        elif given:
            a['_muni'], note = given, 'From the file (location outside the outlines)'
        elif loc:
            a['_muni'], note = loc, 'Derived from location'
        else:
            a['_muni'], note = None, 'Unknown'
        if near < MUNI_NEAR_M and loc:
            note += f'; {near:.0f} m from a municipal boundary'
        a['_muni_note'] = note


# ---------------------------------------------------------------- duplicates

def file_tokens(s):
    if not s:
        return set()
    toks = set()
    for m in re.finditer(r'(?:21T|T|[A-Z]{1,6})-?\d{2}-?\d{3,5}[A-Z]?', s.upper()):
        t = m.group(0).replace('-', '')
        if re.match(r'^T\d{5}', t):
            t = '21' + t                     # T-21016B and 21T-21016B are the same draft plan
        toks.add(t)
    return toks


def duplicate_candidates(apps, pairs):
    found = collections.OrderedDict()

    def add(a, b, why):
        key = tuple(sorted((a['id'], b['id'])))
        found.setdefault(key, {'a': a if a['id'] < b['id'] else b, 'b': b if a['id'] < b['id'] else a, 'why': []})
        if why not in found[key]['why']:
            found[key]['why'].append(why)
    for a, b, _ in pairs:
        add(a, b, 'Same location')
    for i, a in enumerate(apps):
        for b in apps[i + 1:]:
            shared = file_tokens(a.get('File_numbe')) & file_tokens(b.get('File_numbe'))
            if shared:
                add(a, b, 'Shared file number ' + ', '.join(sorted(shared)))
            if (a['_area'] and a['_area'] == b['_area'] and a['Area'] >= SAME_AREA_MIN_HA
                    and abs(a['Area'] - b['Area']) < 0.005):
                add(a, b, f"Same area ({a['Area']:g} ha) in the same priority area")
    out = []
    for v in found.values():
        a, b = v['a'], v['b']
        v['dist_m'] = math.dist(to_utm(a['_lon'], a['_lat']), to_utm(b['_lon'], b['_lat']))
        out.append(v)
    return out


def _clearly_one(v):
    """D11: a pair is clearly one development if it shares a file number, has the same area, or is a
    pre-consultation followed by another application at the same place."""
    if any(w.startswith(('Shared file number', 'Same area')) for w in v['why']):
        return True
    pre = [(x.get('Category') or '').startswith('PRECON') for x in (v['a'], v['b'])]
    return 'Same location' in v['why'] and any(pre) and not all(pre)


def _newer(a, b):
    """The newer of two rows by application year, then received date when both have one; None if tied."""
    ya, yb = a.get('Applicatio') or '', b.get('Applicatio') or ''
    if ya and yb and ya != yb:
        return a if ya > yb else b
    ra, rb = a.get('Received_D'), b.get('Received_D')
    if ya == yb and ra and rb and ra != rb:
        return a if ra > rb else b
    return None


def resolve_d11(cands, apps):
    """Apply decision D11 to each candidate pair; mark dropped rows on the applications."""
    for a in apps:
        a['_include'], a['_excl'] = 'Yes', None
    for v in cands:
        if not _clearly_one(v):
            v['d11'] = 'To app check (Bucket 3): may be separate developments'
            continue
        new = _newer(v['a'], v['b'])
        if new is None:
            v['d11'] = 'To app check (Bucket 3): dates tied'
            continue
        old = v['b'] if new is v['a'] else v['a']
        v['d11'] = f"Keep {new['id']}, drop {old['id']} (older)"
        if old['_include'] == 'Yes':
            old['_include'] = 'No'
            old['_excl'] = f"Older duplicate of {new['id']} (decision D11)"


# ---------------------------------------------------------------- check map

def check_map(pdf, boxes, apps, names, colour, out_png, dpi=150):
    from PIL import Image, ImageDraw, ImageFont
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['pdftoppm', '-png', '-r', str(dpi), '-singlefile', pdf, os.path.join(tmp, 'm')], check=True)
        img = Image.open(os.path.join(tmp, 'm.png')).convert('RGB')
    k = dpi / 72
    rects = boxes['boxes']
    x0 = min(r['x0'] for r in rects) - 40
    y0 = min(r['y0'] for r in rects) - 25
    x1 = max(r['x1'] for r in rects) + 95
    y1 = max(r['y1'] for r in rects) + 25
    img = Image.eval(img, lambda v: 255 - (255 - v) // 3)        # fade the base map
    dr = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default(size=int(9 * k))
        small = ImageFont.load_default(size=int(6 * k))
    except TypeError:
        font = small = ImageFont.load_default()
    taken = [(r['x0'] * k, r['y0'] * k, r['x1'] * k, r['y1'] * k) for r in rects]
    for i, r in enumerate(rects):
        col = colour.get(names.get(i), '#000000')
        dr.rectangle(taken[i], outline=col, width=int(1.2 * k))

    def clash(bb):
        return any(bb[0] < t[2] and t[0] < bb[2] and bb[1] < t[3] and t[1] < bb[3] for t in taken)
    for i, r in enumerate(rects):
        name = names.get(i) or f'Box {i + 1} (no label)'
        col = colour.get(names.get(i), '#000000')
        x0b, y0b, x1b, y1b = taken[i]
        w, h = dr.textbbox((0, 0), name, font=font)[2:]
        spots = [(x1b + 3, y0b), (x0b, y0b - h - 3), (x0b, y1b + 3), (x0b - w - 3, y0b),
                 (x1b + 3, y1b - h), (x0b - w - 3, y1b - h), (x1b + 3, y0b - h - 3), (x0b, y1b + h + 6)]
        pos = next((sp for sp in spots if not clash((sp[0], sp[1], sp[0] + w, sp[1] + h))), spots[0])
        dr.rectangle((pos[0] - 1, pos[1] - 1, pos[0] + w + 1, pos[1] + h + 2), fill='#ffffff')
        dr.text(pos, name, fill=col, font=font)
        taken.append((pos[0], pos[1], pos[0] + w, pos[1] + h))
    for a in apps:
        px, py = a['_page'][0] * k, a['_page'][1] * k
        col = colour.get(a['_area'], '#000000')
        rad = 2.2 * k
        dr.ellipse([px - rad, py - rad, px + rad, py + rad], fill=col, outline='#000000')
        if a['_method'] != 'Inside box':
            dr.ellipse([px - 2 * rad, py - 2 * rad, px + 2 * rad, py + 2 * rad], outline='#000000', width=int(k))
            dr.text((px + 2 * rad, py + rad), a['id'], fill='#000000', font=small)
    img = img.crop((int(x0 * k), int(y0 * k), int(x1 * k), int(y1 * k)))
    img.save(out_png)
    return img.size


# ---------------------------------------------------------------- workbook

def sheet_readme(ws, boxes, n_apps, counts):
    ws.title = 'README'
    ws.column_dimensions['A'].width = 30
    ws.column_dimensions['B'].width = 105
    ws['A1'] = 'Bucket 2: applications assigned to the 19 priority areas'
    ws['A1'].font = X.TITLE
    ws['A2'] = 'For review by Planning before anything is sent to Modelling. Draft; nothing here is approved.'
    ws['A2'].font = X.SUB
    f = boxes['fit']
    rows = [
        ('Method', 'The map PDF draws each priority area as a dark-red box. Each application symbol on the map was '
                   'matched to its shapefile point to line the map up with real coordinates; each application was '
                   'then placed in the box it falls in. Each box is named after the map label whose area (ha) its '
                   'applications add up to, and the population is checked against the label.'),
        ('How well the map lines up', f"{f['symbols']} map symbols matched to points: median error {f['median_m']:.1f} m, "
                                      f"worst {f['max_m']:.1f} m. Scale {f['scale_m_per_pt']:.2f} m per map point "
                                      f"(the map's 1:192,036 gives {f['expected_m_per_pt']:.2f}). The map is rotated "
                                      f"{f['rotation_deg']:.1f} degrees."),
        ('Result', f"{counts['inside']} of {n_apps} applications fall inside a box; {counts['edge']} just outside a "
                   f"box edge (within {EDGE_M} m, symbol overlapping the box) and assigned to it; "
                   f"{counts['none']} not assigned. All boxes named: {counts['named']} of {len(boxes['boxes'])}."),
        ('Municipality', "Where the file has no municipality it is taken from the location, using the app's municipal "
                         "outlines (2021 census areas, accurate to about 60 m; not legal boundaries). Points closer "
                         f"than {MUNI_NEAR_M} m to a boundary are noted."),
        ('Duplicate candidates', 'Pairs that may be the same development: same location (from Bucket 1), a shared '
                                 'file number, or the same area in the same priority area. Decision D11: where a pair '
                                 'is clearly one development and the dates say which is newer, the older row is '
                                 'excluded from the 2031 total (kept on the sheet, marked). The rest go to the app '
                                 'check in Bucket 3.'),
        ('Colours', 'Blue = value from the shapefile or map. Black = formula. Yellow = reviewer fills in.'),
        ('Sheets', 'Area Summary, Applications, Exceptions, Duplicate Candidates, Check Map, Decisions.'),
    ]
    r = 4
    for k, v in rows:
        ws.cell(r, 1, k).font = X.BOLD
        c = ws.cell(r, 2, v)
        c.font, c.alignment = X.BASE, X.WRAP
        ws.row_dimensions[r].height = 15 * max(1, -(-len(v) // 100))
        r += 1


def sheet_decisions(ws, decisions):
    ws.title = 'Decisions'
    X.header(ws, 1, ['ID', 'Date', 'Decision', 'Decided by', 'Bucket'], [6, 11, 100, 11, 8])
    for n, d in enumerate(decisions, 2):
        for c, k in enumerate(['id', 'date', 'decision', 'decided_by', 'bucket'], 1):
            X.body(ws.cell(n, c, d[k]), wrap=(k == 'decision'))
    ws.freeze_panes = 'A2'


APP_COLS = [
    ('id', 'Row ID', 9, None), ('version', 'Version', 15, None), ('File_numbe', 'File number', 18, None),
    ('Category', 'Application category', 26, None), ('_address', 'Address', 26, None),
    ('Population', 'Population', 11, '#,##0'), ('Area', 'Area (ha)', 10, '#,##0.00'),
    ('_area', 'Priority area', 22, None), ('_method', 'How assigned', 34, None),
    ('_include', 'Include in 2031 total?', 11, None), ('_excl', 'Why excluded', 34, None),
    ('MUNICIPALI', 'Municipality (file)', 14, None), ('_muni_loc', 'Municipality (location)', 14, None),
    ('_muni', 'Municipality used', 14, None), ('_muni_note', 'Municipality note', 40, None),
    ('_lon', 'Longitude', 11, '0.00000'), ('_lat', 'Latitude', 11, '0.00000'),
]


def sheet_applications(ws, apps):
    ws.title = 'Applications'
    X.header(ws, 1, [c[1] for c in APP_COLS], [c[2] for c in APP_COLS])
    for n, a in enumerate(apps, 2):
        for c, (k, _, _, fmt) in enumerate(APP_COLS, 1):
            v = a.get(k)
            X.body(ws.cell(n, c, v if v != '' else None), X.BOLD if k == 'id' else
                   (X.INPUT if not k.startswith('_') or k in ('_address', '_lon', '_lat') else X.BASE), fmt)
    ws.freeze_panes = 'B2'
    ws.auto_filter.ref = f'A1:{get_column_letter(len(APP_COLS))}{len(apps) + 1}'
    return {k: get_column_letter(i) for i, (k, _, _, _) in enumerate(APP_COLS, 1)}


def sheet_summary(ws, labels, apps, col, decisions):
    ws.title = 'Area Summary'
    ws['A1'] = 'Priority areas: applications against the map labels'
    ws['A1'].font = X.TITLE
    ws['A2'] = ('Applications, population and area are formulas on the Applications sheet. '
                'Population carried forward leaves out rows excluded as older duplicates (decision D11); '
                'it is the full population that goes on to the 2031 assumptions (Bucket 4).')
    ws['A2'].font = X.SUB
    cols = ['#', 'Priority area', 'Applications', 'Population (applications)', 'Area ha (applications)',
            'Population (map)', 'Area ha (map)', 'Population: map minus applications', 'Area: map minus applications',
            'Status', 'Explanation', 'Population carried forward', 'Reviewer agrees? (Y/N)', 'Reviewer comment']
    X.header(ws, 4, cols, [5, 22, 12, 13, 12, 12, 11, 14, 13, 11, 60, 13, 12, 30])
    A, P, H, I = col['_area'], col['Population'], col['Area'], col['_include']
    rng = lambda c: f'Applications!${c}$2:${c}${len(apps) + 1}'   # noqa: E731
    dec_area = {d['area']: d for d in decisions if d.get('area')}
    first = 5
    for i, lab in enumerate(sorted(labels, key=lambda r: r['map_order'])):
        r = first + i
        name = lab['area_name']
        members = [a for a in apps if a['_area'] == name]
        pop = sum(a['Population'] for a in members)
        ha = sum(a['Area'] for a in members)
        dpop = lab['population'] - pop
        if dpop == 0 and abs(lab['area_ha'] - ha) <= AREA_TOL_HA:
            status, why = 'Matches', 'Population and area match the map label.'
        elif abs(lab['area_ha'] - ha) <= AREA_TOL_HA:
            status = 'Explained' if name in dec_area else 'Differs'
            if status == 'Explained':
                d = dec_area[name]
                why = f"Area matches; population differs. Decision {d['id']}: {d['decision']}"
            else:
                single = [a['id'] for a in members if a['Population'] == abs(dpop)]
                why = (f"Area matches, but the label is {abs(dpop):,.0f} {'more' if dpop > 0 else 'fewer'} people than the "
                       f"sum of its {len(members)} applications. "
                       + (f"{', '.join(single)} has exactly that population. " if single else
                          'No single application explains it; the label was probably made before a row was revised. ')
                       + 'The application rows are what goes forward.')
        else:
            status, why = 'Differs', 'Area does not match the label; check the assignment.'
        dropped = [a['id'] for a in members if a['_include'] != 'Yes']
        if dropped:
            why += f" Carried forward leaves out {', '.join(dropped)} (older duplicates, D11)."
        edge = [a['id'] for a in members if a['_method'] != 'Inside box']
        if edge:
            why += f" Includes {', '.join(edge)}, just outside the box edge."
        X.body(ws.cell(r, 1, lab['map_order']))
        X.body(ws.cell(r, 2, name), X.BOLD)
        X.body(ws.cell(r, 3, f'=COUNTIF({rng(A)},B{r})'), fmt='0')
        X.body(ws.cell(r, 4, f'=SUMIF({rng(A)},B{r},{rng(P)})'), fmt='#,##0')
        X.body(ws.cell(r, 5, f'=SUMIF({rng(A)},B{r},{rng(H)})'), fmt='#,##0.00')
        X.body(ws.cell(r, 6, lab['population']), X.INPUT, '#,##0')
        X.body(ws.cell(r, 7, lab['area_ha']), X.INPUT, '#,##0.00')
        X.body(ws.cell(r, 8, f'=F{r}-D{r}'), fmt='#,##0;-#,##0;-')
        X.body(ws.cell(r, 9, f'=G{r}-E{r}'), fmt='0.00;-0.00;-')
        X.body(ws.cell(r, 10, status)).fill = X.SEV_FILL['Low'] if status == 'Matches' else X.SEV_FILL['Medium']
        X.body(ws.cell(r, 11, why), wrap=True)
        X.body(ws.cell(r, 12, f'=SUMIFS({rng(P)},{rng(A)},B{r},{rng(I)},"Yes")'), fmt='#,##0')
        for c in (13, 14):
            X.body(ws.cell(r, c)).fill = X.REVIEW_FILL
        ws.row_dimensions[r].height = 15 * max(1, math.ceil(len(why) / 62))
    last = first + len(labels) - 1
    u = last + 1
    X.body(ws.cell(u, 2, 'Not assigned to an area'), X.BOLD)
    X.body(ws.cell(u, 3, f'=COUNTBLANK({rng(A)})'), fmt='0')
    X.body(ws.cell(u, 4, f'=SUMIF({rng(A)},"",{rng(P)})'), fmt='#,##0')
    X.body(ws.cell(u, 5, f'=SUMIF({rng(A)},"",{rng(H)})'), fmt='#,##0.00')
    t = u + 1
    X.body(ws.cell(t, 2, 'Total'), X.BOLD)
    for c, fmt in ((3, '0'), (4, '#,##0'), (5, '#,##0.00'), (6, '#,##0'), (7, '#,##0.00'),
                   (8, '#,##0;-#,##0;-'), (9, '0.00;-0.00;-'), (12, '#,##0')):
        L = get_column_letter(c)
        X.body(ws.cell(t, c, f'=SUM({L}{first}:{L}{u})'), X.BOLD, fmt)
    for c in range(1, 15):
        ws.cell(t, c).fill = X.TOTAL_FILL
    ws.freeze_panes = 'C5'


def sheet_exceptions(ws, apps):
    ws.title = 'Exceptions'
    X.header(ws, 1, ['Row ID', 'Type', 'Detail', 'Population', 'Priority area', 'Reviewer decision'],
             [9, 26, 80, 11, 22, 30])
    rows = []
    for a in apps:
        if a['_method'] != 'Inside box':
            rows.append((a, 'Area assignment', f"{a['_method']}. Assigned to {a['_area'] or 'no area'}."))
        if a['_muni_note'].startswith('Disagrees') or 'boundary' in a['_muni_note'] or a['_muni_note'] == 'Unknown':
            rows.append((a, 'Municipality', a['_muni_note'] + '.'))
    for n, (a, typ, det) in enumerate(rows, 2):
        X.body(ws.cell(n, 1, a['id']), X.BOLD)
        X.body(ws.cell(n, 2, typ))
        X.body(ws.cell(n, 3, det), wrap=True)
        X.body(ws.cell(n, 4, a['Population']), fmt='#,##0')
        X.body(ws.cell(n, 5, a['_area']))
        X.body(ws.cell(n, 6)).fill = X.REVIEW_FILL
    if not rows:
        ws.cell(2, 1, 'None.').font = X.BASE
    ws.freeze_panes = 'A2'
    return len(rows)


def sheet_duplicates(ws, cands):
    ws.title = 'Duplicate Candidates'
    ws['A1'] = 'Pairs that may be the same development (checked against the app in Bucket 3)'
    ws['A1'].font = X.TITLE
    ws['A2'] = ('If a pair is one development (e.g. a resubmission), the smaller population is counted twice. '
                'Decision D11 column: older rows excluded where clear; the rest go to the app check.')
    ws['A2'].font = X.SUB
    cols = ['#', 'Why flagged', 'Row A', 'File A', 'Population A', 'Area A (ha)', 'Row B', 'File B',
            'Population B', 'Area B (ha)', 'Distance (m)', 'Priority area', 'Overcount if one replaces the other',
            'New since Bucket 1?', 'Decision D11', 'Bucket 3 finding']
    X.header(ws, 4, cols, [5, 34, 9, 20, 11, 10, 9, 20, 11, 10, 10, 20, 14, 11, 30, 34])
    for n, v in enumerate(cands, 5):
        a, b = v['a'], v['b']
        vals = [n - 4, '; '.join(v['why']), a['id'], a.get('File_numbe') or None, a['Population'], a['Area'],
                b['id'], b.get('File_numbe') or None, b['Population'], b['Area'], round(v['dist_m']),
                a['_area'] if a['_area'] == b['_area'] else f"{a['_area']} / {b['_area']}", f'=MIN(E{n},I{n})',
                'No' if 'Same location' in v['why'] else 'Yes', v['d11'], None]
        fmts = [None, None, None, None, '#,##0', '0.00', None, None, '#,##0', '0.00', '#,##0', None, '#,##0', None, None,
                None]
        for c, (val, fmt) in enumerate(zip(vals, fmts), 1):
            cell = X.body(ws.cell(n, c, val), X.BOLD if c in (3, 7) else X.BASE, fmt, wrap=(c in (2, 15, 16)))
            if c == 16:
                cell.fill = X.REVIEW_FILL
        ws.row_dimensions[n].height = 15 * max(1, math.ceil(len(vals[1]) / 32))
    last = 4 + len(cands)
    t = last + 1
    X.body(ws.cell(t, 12, 'Most that could be double counted'), X.BOLD, wrap=True)
    X.body(ws.cell(t, 13, f'=SUM(M5:M{last})'), X.BOLD, '#,##0')
    for c in range(1, 17):
        ws.cell(t, c).fill = X.TOTAL_FILL
    ws.freeze_panes = 'C5'


PRIVATE = os.path.join(HERE, 'private')
DEFAULTS = {
    'shp': os.path.join(PRIVATE, 'input', 'Dev_Apps_V7'),
    'labels': os.path.join(PRIVATE, 'map_labels.csv'),
    'boxes': os.path.join(PRIVATE, 'map_boxes.json'),
    'decisions': os.path.join(PRIVATE, 'decisions.csv'),
    'munis': os.path.join(HERE, '..', '..', 'data', 'munis.json'),
    'exclusions': os.path.join(PRIVATE, 'exclusions.csv'),
}


def apply_exclusions(apps, path):
    """Rows Planning decided to leave out at a checkpoint (private/exclusions.csv: row_id, keep, decision)."""
    if not path or not os.path.exists(path):
        return
    by = {a['id']: a for a in apps}
    for r in csv.DictReader(open(path, newline='', encoding='utf-8')):
        a = by.get(r['row_id'])
        if a and a['_include'] == 'Yes':
            a['_include'] = 'No'
            a['_excl'] = f"Duplicate of {r['keep']} (decision {r['decision']})"



def prepare(paths=None):
    """Buckets 1-2 in memory: the applications with area, municipality and D11 applied.
    Shared by later buckets so every workbook starts from the same rows."""
    p = {**DEFAULTS, **(paths or {})}
    _, apps, meta = load(p['shp'])
    labels = load_labels(p['labels'])
    boxes = json.load(open(p['boxes']))
    decisions = list(csv.DictReader(open(p['decisions'], newline='', encoding='utf-8')))
    names = assign(apps, boxes, labels)
    municipalities(apps, json.load(open(p['munis'])))
    _, pairs = find_issues(apps, meta)
    cands = duplicate_candidates(apps, pairs)
    resolve_d11(cands, apps)
    apply_exclusions(apps, p.get('exclusions'))
    return {'apps': apps, 'labels': labels, 'boxes': boxes, 'decisions': decisions, 'names': names,
            'cands': cands}


def main():
    ap = argparse.ArgumentParser()
    for k, v in DEFAULTS.items():
        ap.add_argument(f'--{k}', default=v)
    ap.add_argument('--out', default=os.path.join(PRIVATE, 'Bucket2_Areas.xlsx'))
    a = ap.parse_args()
    st = prepare({k: getattr(a, k) for k in DEFAULTS})
    apps, labels, boxes, decisions, names, cands = (st[k] for k in ('apps', 'labels', 'boxes', 'decisions', 'names', 'cands'))

    colour = {lab['area_name']: PALETTE[i % len(PALETTE)]
              for i, lab in enumerate(sorted(labels, key=lambda r: r['map_order']))}
    png = os.path.join(os.path.dirname(a.out), 'Bucket2_check_map.png')
    pdf = glob.glob(os.path.join(HERE, 'private', 'input', '*.pdf'))[0]
    size = check_map(pdf, boxes, apps, names, colour, png)

    counts = {'inside': sum(x['_method'] == 'Inside box' for x in apps),
              'edge': sum(x['_method'].startswith('Nearest box') for x in apps),
              'none': sum(x['_box'] is None for x in apps),
              'named': sum(1 for v in names.values() if v)}
    wb = Workbook()
    sheet_readme(wb.active, boxes, len(apps), counts)
    ws_sum = wb.create_sheet()
    col = sheet_applications(wb.create_sheet(), apps)
    sheet_summary(ws_sum, labels, apps, col, decisions)
    n_exc = sheet_exceptions(wb.create_sheet(), apps)
    sheet_duplicates(wb.create_sheet(), cands)
    ws_img = wb.create_sheet('Check Map')
    ws_img['A1'] = ('Points coloured by assigned area, over the faded original map. Ringed and labelled points '
                    'were assigned to the nearest box or not assigned.')
    ws_img['A1'].font = X.SUB
    img = XLImage(png)
    img.width, img.height = size[0] * 0.55, size[1] * 0.55
    ws_img.add_image(img, 'A3')
    sheet_decisions(wb.create_sheet(), decisions)
    for ws in wb.worksheets:
        X.print_fit(ws)
    wb.save(a.out)
    new = sum(1 for v in cands if 'Same location' not in v['why'])
    print(f"wrote {a.out}: inside {counts['inside']}, edge {counts['edge']}, unassigned {counts['none']}, "
          f"boxes named {counts['named']}/{len(names)}; {n_exc} exceptions; {len(cands)} duplicate candidates "
          f"({new} new); check map {png}")


if __name__ == '__main__':
    main()
