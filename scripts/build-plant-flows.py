#!/usr/bin/env python3
"""Build data/plant-flows.json: monthly measured flow at the Region of Peel's wastewater plants,
2008 onward, from Ontario's Municipal Treated Wastewater Effluent data (MECP, Ontario Data Catalogue,
one XLSX per year; fetched by `scripts/fetch-external.js --only mwd` to the ext-raw branch).

Each year's file has one row per plant x month x parameter. The flow row is
"SEWAGE FLOW, MONTHLY TOTAL" in thousands of cubic metres (10(3)M3). Plants are matched by MECP
company code, which stays the same when a plant is renamed (Lakeview WPCP -> G.E. Booth).

Usage: python3 scripts/build-plant-flows.py <ext-raw> data/plant-flows.json [data/peel-reports.json]

Standard library only (the XLSX is read as zipped XML). Refuses to write (exit 1) when a year's
file has columns it cannot find, or when a plant has fewer years, or fewer months in a year, than
the previous file (a broken download must not replace good history).
"""
import calendar, glob, json, os, re, sys, zipfile
import xml.etree.ElementTree as ET
from datetime import date

raw, out_p = sys.argv[1], sys.argv[2]
reports_p = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(out_p), 'peel-reports.json')

# MECP company code -> the app's plant key (data/peel-reports.json, js/svc-data.js).
PLANTS = {'110001284': 'Lakeview', '110001328': 'Clarkson', '110001440': 'Inglewood'}
RATED = {'Lakeview': 518, 'Clarkson': 350, 'Inglewood': 0.243}   # ML/d, annual average (Peel 2025 reports)
FLOW = 'SEWAGE FLOW, MONTHLY TOTAL'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def col_index(ref):
    """'AB12' -> 27 (0-based column)."""
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def xlsx_rows(path):
    """Yield each row of the first worksheet as a list of strings."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
                shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        first = wb.find('m:sheets/m:sheet', NS).get(REL)
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        target = next(r.get('Target') for r in rels if r.get('Id') == first)
        sheet = 'xl/' + target.lstrip('/').replace('xl/', '', 1) if not target.startswith('xl/') else target
        with z.open(sheet) as fh:
            for _, el in ET.iterparse(fh):
                if el.tag != '{%s}row' % NS['m']:
                    continue
                cells = {}
                for c in el.findall('m:c', NS):
                    t, v = c.get('t'), c.find('m:v', NS)
                    if t == 's' and v is not None:
                        val = shared[int(v.text)]
                    elif t == 'inlineStr':
                        val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
                    else:
                        val = v.text if v is not None else ''
                    cells[col_index(c.get('r'))] = val
                el.clear()
                if cells:
                    yield [cells.get(i, '') for i in range(max(cells) + 1)]


def month_key(s):
    """'2024/01', '2024-01', '202401' or an Excel date serial -> '2024-01'."""
    s = str(s).strip()
    m = re.match(r'(\d{4})\D?(\d{2})', s)
    if m:
        return f'{m.group(1)}-{m.group(2)}'
    if re.match(r'^\d+(\.\d+)?$', s):          # Excel serial date
        d = date.fromordinal(date(1899, 12, 30).toordinal() + int(float(s)))
        return f'{d.year}-{d.month:02d}'
    return None


monthly = {p: {} for p in PLANTS.values()}
names = {p: {} for p in PLANTS.values()}
years_read = []
skipped = []
for f in sorted(glob.glob(os.path.join(raw, 'municipal-treated-wastewater-effluent', '*.xlsx'))):
    rows = xlsx_rows(f)
    head = [h.strip().lower() for h in next(rows)]
    def find(*keys):
        # Keys in order of preference: 'reported value' must win over 'result structure'.
        for k in keys:
            for i, h in enumerate(head):
                if k in h:
                    return i
        raise StopIteration
    try:
        i_code, i_name, i_month = find('company code', 'works number', 'works #'), find('works name'), find('month', 'sample date')
        i_par, i_val, i_unit = find('parameter'), find('reported value', 'result value'), find('unit of measure', 'unit')
    except StopIteration:
        print('SKIP (columns not found):', os.path.basename(f), head)
        skipped.append(os.path.basename(f))
        continue
    n = 0
    for r in rows:
        code = str(r[i_code]).strip().split('.')[0] if i_code < len(r) else ''
        plant = PLANTS.get(code)
        if not plant or i_par >= len(r) or r[i_par].strip().upper() != FLOW:
            continue
        mk = month_key(r[i_month])
        try:
            v = float(str(r[i_val]).replace(',', ''))
        except ValueError:
            continue
        unit = str(r[i_unit]).upper().replace(' ', '')
        if not mk or '10(3)M3' not in unit:
            continue
        monthly[plant][mk] = round(v, 3)          # thousand m3 in the month
        names[plant][mk[:4]] = r[i_name].strip()
        n += 1
    years_read.append(re.search(r'(20\d\d)', os.path.basename(f)).group(1))
    print(os.path.basename(f), 'flow rows', n)

plants = {}
for code, p in PLANTS.items():
    ann = {}
    for y in sorted({k[:4] for k in monthly[p]}):
        ms = {k: v for k, v in monthly[p].items() if k.startswith(y)}
        days = sum(calendar.monthrange(int(y), int(k[5:]))[1] for k in ms)
        avg = sum(ms.values()) / days if days else None      # 1e3 m3 / d = ML/d
        wet = max(ms, key=lambda k: ms[k] / calendar.monthrange(int(y), int(k[5:]))[1])
        wet_v = ms[wet] / calendar.monthrange(int(y), int(wet[5:]))[1]
        ann[y] = {'avgMLd': round(avg, 2), 'wettestMonth': wet, 'wettestMonthMLd': round(wet_v, 2), 'months': len(ms), 'name': names[p].get(y, '')}
    plants[p] = {'code': code, 'ratedMLd': RATED[p], 'annual': ann, 'monthly': dict(sorted(monthly[p].items()))}

# Check against the Region's own annual reports where both give a year.
checks = []
try:
    rep = json.load(open(reports_p))['wastewater']['plants']
    for p, d in plants.items():
        for y, v in (rep.get(p, {}).get('history') or {}).items():
            a = d['annual'].get(y)
            if a and a['months'] == 12:
                checks.append({'plant': p, 'year': y, 'mecpMLd': a['avgMLd'], 'peelMLd': v, 'diffPct': round((a['avgMLd'] - v) / v * 100, 1)})
except (OSError, KeyError, ValueError) as e:
    print('no peel-reports check:', e)

out = {
    'version': 1,
    'source': "Ontario Ministry of the Environment, Conservation and Parks: Municipal Treated Wastewater Effluent (monthly total flow, Ontario Data Catalogue)",
    'url': 'https://data.ontario.ca/dataset/municipal-treated-wastewater-effluent',
    'built': date.today().isoformat(),
    'units': {'monthly': 'thousand m3 in the month', 'avgMLd': 'ML/d, annual average (total / days reported)'},
    'note': 'Measured flow at each plant, as reported to MECP. Rated capacity is the annual average daily flow (Peel 2025 annual reports). A year with fewer than 12 months is shown as partial.',
    'steps': [{'date': '2025-03-12', 'from': 'Lakeview', 'to': 'Clarkson',
               'note': 'On March 12, 2025 a west-to-east connection was closed and its flow redistributed from G.E. Booth to Clarkson (Region of Peel 2025 G.E. Booth annual report); this is separate from the planned 70 ML/d diversion (2027-2028). Trends for either plant alone break there; the two together do not.'}],
    'years': sorted(set(years_read)),
    'plants': plants,
    'checks': checks,
}

# Guard: every year's file must be read.
if skipped:
    sys.exit(f'REFUSED: columns not found in {", ".join(skipped)}; kept {out_p}')

# Guard: never replace a longer history with a shorter one (years, or months in a year).
try:
    prev = json.load(open(out_p))
    for p, d in prev.get('plants', {}).items():
        if len(plants.get(p, {}).get('annual', {})) < len(d.get('annual', {})):
            sys.exit(f'REFUSED: {p} would drop from {len(d["annual"])} to {len(plants.get(p, {}).get("annual", {}))} years; kept {out_p}')
        for y, a in d.get('annual', {}).items():
            n = plants.get(p, {}).get('annual', {}).get(y, {}).get('months', 0)
            if n < a.get('months', 0):
                sys.exit(f'REFUSED: {p} {y} would drop from {a["months"]} to {n} months; kept {out_p}')
except (OSError, ValueError):
    pass

json.dump(out, open(out_p, 'w'), separators=(',', ':'))
for p, d in plants.items():
    a = d['annual']
    if a:
        y0, y1 = min(a), max(a)
        print(f"{p}: {len(a)} years {y0}-{y1}; {y1} avg {a[y1]['avgMLd']} ML/d, wettest {a[y1]['wettestMonth']} {a[y1]['wettestMonthMLd']} ML/d")
print('checks vs Peel reports:', [(c['plant'], c['year'], c['diffPct']) for c in checks])
