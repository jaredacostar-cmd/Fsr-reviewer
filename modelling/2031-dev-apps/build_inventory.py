"""Bucket 1: inventory and reconciliation of the development applications sent for
2031 (Scenario 1) water / wastewater modelling.

Reads the Dev_Apps_V7 point shapefile and the map labels, cleans text without changing
values, tags the V6 / V7 version, logs data-quality issues and reconciles the application
total against the map. No assumptions, no area grouping.

Input:  private/input/Dev_Apps_V7.{shp,dbf}, private/map_labels.csv
Output: private/Bucket1_Inventory.xlsx

Usage:  python3 build_inventory.py [--shp PATH_WITHOUT_EXT] [--labels CSV] [--out XLSX]
"""
import argparse
import collections
import html
import math
import os
import re
import sys

from openpyxl import Workbook
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import xlsx_style as X  # noqa: E402
from build_map_areas import load_labels  # noqa: E402
from shapefile_lite import read_dbf, read_points  # noqa: E402

# Checks. Numbers used by the Python checks are listed on the README sheet.
NEAR_M = 50                 # points closer than this may be the same development
DENSITY_HIGH = 5000         # persons/ha above which the area value is worth a second look
DENSITY_LOW = 25            # persons/ha below which the population is worth a second look
SAME_POP_MIN = 1000         # identical populations at different sites, above this size
PER_CAP_L_D = 280           # Water_dema = Population * 280 * 1.8 / 86400 (shp.xml lineage)
MAX_DAY = 1.8
FILE_NO = re.compile(r'^(?:[A-Z]{1,6}-\d{2}-\d{3}[A-Z]|21T-\d{5}[A-Z]|T-\d{5}[A-Z])$')

# (original field, readable label, notes). Order = column order on the Applications sheet
# after the leading ID / version columns.
FIELDS = [
    ('File_numbe', 'File number', 'Municipal planning file number.'),
    ('Tracking_N', 'Tracking number', 'Region tracking number.'),
    ('Category', 'Application category', ''),
    ('Applicatio', 'Application year', 'Year the Region logged it.'),
    ('MUNICIPALI', 'Municipality', 'Capitalisation made consistent.'),
    ('_address', 'Address', 'Built from STREETNUM, UNIT_IDENT, STREETNAME, STREETTYPE, STREETDIRE.'),
    ('Secondary_', 'Secondary plan', ''),
    ('Population', 'Population', 'Proposed for modelling (see README).'),
    ('Populati_1', 'Population (second field)', 'Second population field; 0 in most rows. Origin unconfirmed.'),
    ('Area', 'Area (ha)', ''),
    ('Density', 'Density in file (persons/ha)', 'Calculated in GIS as Population / Area.'),
    ('_density_chk', 'Density check (persons/ha)', 'Formula: Population / Area.'),
    ('Water_dema', 'Water demand in file (L/s)', 'Calculated in GIS as Population x 280 x 1.8 / 86400 (max day).'),
    ('_water_chk', 'Water demand check (L/s)', 'Formula, using the constants on the README sheet.'),
    ('Peak_sanit', 'Peak sanitary flow (L/s)', 'Interpreted as peak wet weather flow from the review.'),
    ('Fire_water', 'Fire flow (L/s)', ''),
    ('SGU', 'SGU', 'Interpreted as Small Geographic Unit ID; 0 = not set.'),
    ('Received_D', 'Received date', '1899-12-30 placeholders blanked.'),
    ('Deadline', 'Review deadline', '1899-12-30 placeholders blanked.'),
    ('Water_Revi', 'Water reviewer', ''),
    ('Water_resp', 'Water response date', ''),
    ('Wastewater', 'Wastewater reviewer', ''),
    ('Wastewat_1', 'Wastewater response date', ''),
    ('_lon', 'Longitude', 'From the point geometry (NAD83 CSRS, degrees).'),
    ('_lat', 'Latitude', 'From the point geometry (NAD83 CSRS, degrees).'),
    ('_issues', 'Issues logged', 'Formula: count of Issues Log rows naming this Row ID.'),
    ('Address_Ad', 'Address note', ''),
    ('Land_Use', 'Existing land use', ''),
    ('Proposed_L', 'Proposed land use', ''),
    ('Wastewat_3', 'Development description', 'Interpreted from content (wastewater review text).'),
    ('Water_site', 'Water: site description', ''),
    ('Water_prop', 'Water: proposed development', ''),
    ('Existing_w', 'Water: existing infrastructure', ''),
    ('Proposed_w', 'Water: master plan projects', ''),
    ('Water_serv', 'Water: servicing proposal', ''),
    ('Water_conc', 'Water: conclusion', ''),
    ('Wastewat_2', 'Wastewater: site description', ''),
    ('Existing_1', 'Wastewater: existing infrastructure', ''),
    ('Proposed_1', 'Wastewater: master plan projects', ''),
    ('Wastewat_4', 'Wastewater: servicing proposal', ''),
    ('Wastewat_5', 'Wastewater: conclusion', ''),
    ('EIM_Link', 'EIM link', ''),
    ('Comment', 'Version comment (original)', '"Addition" = V7 addition; "Revised Pop/ha" = V6 revised.'),
]
ADDRESS_PARTS = ['STREETNUM', 'UNIT_IDENT', 'STREETNAME', 'STREETTYPE', 'STREETDIRE']
NUMERIC = {'Population': '#,##0', 'Populati_1': '#,##0', 'Area': '#,##0.00', 'Density': '#,##0',
           '_density_chk': '#,##0', 'Water_dema': '0.00', '_water_chk': '0.00', 'Peak_sanit': '0.00',
           'Fire_water': '#,##0', 'SGU': '0', '_lon': '0.00000', '_lat': '0.00000', '_issues': '0'}
DATES = {'Received_D', 'Deadline', 'Water_resp', 'Wastewat_1'}
LONG = {'Address_Ad', 'Wastewat_3', 'Water_site', 'Water_prop', 'Existing_w', 'Proposed_w',
        'Water_serv', 'Water_conc', 'Wastewat_2', 'Existing_1', 'Proposed_1', 'Wastewat_4',
        'Wastewat_5', 'EIM_Link'}


def clean_text(s):
    if not isinstance(s, str):
        return s
    t = html.unescape(s).replace('\xa0', ' ')
    return re.sub(r'[ \t]+', ' ', t).strip()


def version_of(comment):
    c = (comment or '').strip().lower()
    if c == 'addition':
        return 'V7 Addition'
    if c.startswith('revised'):
        return 'V6 Revised Pop/ha'
    return 'V6'


def metres(a, b):
    r = 6371000
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp, dl = p2 - p1, math.radians(b[0] - a[0])
    return 2 * r * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


def load(shp_base):
    fields, rows = read_dbf(shp_base + '.dbf')
    pts = read_points(shp_base + '.shp')
    if len(pts) != len(rows):
        raise SystemExit(f'.shp has {len(pts)} shapes but .dbf has {len(rows)} records')
    apps, html_cells, placeholders, muni_fixed = [], 0, collections.defaultdict(list), []
    for i, (r, p) in enumerate(zip(rows, pts), 1):
        a = {'id': f'DA-{i:03d}', 'version': version_of(r.get('Comment')), 'raw': r}
        for k, v in r.items():
            if isinstance(v, str) and ('&#' in v or '&amp;' in v or '\xa0' in v):
                html_cells += 1
            a[k] = clean_text(v)
        for k in ('Received_D', 'Deadline'):
            if a.get(k) and a[k].year == 1899:
                placeholders[k].append(a['id'])
                a[k] = None
        m = a.get('MUNICIPALI') or ''
        if m and m != m.title():
            muni_fixed.append((a['id'], m))
            a['MUNICIPALI'] = m.title()
        a['_address'] = ' '.join(x for x in (a.get(k) for k in ADDRESS_PARTS) if x) or None
        a['_lon'], a['_lat'] = (p if p else (None, None))
        apps.append(a)
    return fields, apps, {'html_cells': html_cells, 'placeholders': placeholders, 'muni_fixed': muni_fixed}


def ids(xs):
    return ', '.join(a['id'] for a in xs)


def find_issues(apps, meta):
    """Return a list of issue dicts. High = could change the population sent to modelling;
    Medium = blocks matching to the app or a calculated field is inconsistent; Low = no effect
    on population."""
    out = []

    def add(sev, check, rows, detail, at_stake, action):
        out.append({'sev': sev, 'check': check, 'rows': rows, 'detail': detail,
                    'at_stake': at_stake, 'action': action})

    # High: co-located points
    pairs = []
    for i, a in enumerate(apps):
        for b in apps[i + 1:]:
            if a['_lon'] is None or b['_lon'] is None:
                continue
            d = metres((a['_lon'], a['_lat']), (b['_lon'], b['_lat']))
            if d < NEAR_M:
                pairs.append((a, b, d))
    for a, b, d in pairs:
        same_file = (a.get('File_numbe') or '').replace('-', '') == (b.get('File_numbe') or '').replace('-', '') \
            and a.get('File_numbe')
        why = 'same file number' if same_file else 'different file numbers'
        add('High', 'Possible double count (co-located points)', [a, b],
            f"{a['id']} ({a.get('File_numbe') or 'no file no.'}, {a['Population']:,.0f} people, {a['Area']} ha) and "
            f"{b['id']} ({b.get('File_numbe') or 'no file no.'}, {b['Population']:,.0f} people, {b['Area']} ha) are "
            f"{d:.0f} m apart at {a.get('_address') or b.get('_address') or 'the same location'}; {why}. "
            'If one replaces the other, the smaller population is double counted.',
            min(a['Population'], b['Population']),
            'Planning to confirm: separate phases (keep both) or a resubmission (keep the current one). '
            'Bucket 3 checks each file against the app.')
    # High: the two population fields disagree
    for a in apps:
        p, p1 = a['Population'], a.get('Populati_1') or 0
        if p1 and p1 != p:
            note = ''
            if a['Water_dema'] and abs(a['Water_dema'] - p1 * PER_CAP_L_D * MAX_DAY / 86400) < 0.01:
                note = ' The water demand in the file was calculated from the second field, not Population.'
            if a['version'] == 'V6 Revised Pop/ha':
                note += ' This is the one "V6 Revised Pop/ha" row.'
            add('High', 'Population fields disagree', [a],
                f"Population = {p:,.0f}; second population field = {p1:,.0f}.{note}",
                abs(p1 - p),
                'Planning to confirm which figure is right for 2031.')
    # Medium: identical population at different sites
    by_pop = collections.defaultdict(list)
    for a in apps:
        if a['Population'] >= SAME_POP_MIN:
            by_pop[a['Population']].append(a)
    paired = {(x['id'], y['id']) for x, y, _ in pairs}
    for pop, xs in by_pop.items():
        if len(xs) > 1 and not all((x['id'], y['id']) in paired for x in xs for y in xs if x['id'] < y['id']):
            add('Medium', 'Same population at different sites', xs,
                f"{ids(xs)} {'both' if len(xs) == 2 else 'all'} have exactly {pop:,.0f} people but are at different locations "
                f"({'; '.join(x.get('_address') or '?' for x in xs)}). Could be a copy-paste error.",
                pop, 'Check each against its FSR.')
    # Medium: calculated fields inconsistent
    stale_d = [a for a in apps if abs((a['Density'] or 0) - a['Population'] / a['Area']) > 0.5]
    if stale_d:
        blank = [a for a in stale_d if not a['Density']]
        other = [a for a in stale_d if a['Density']]
        add('Medium', 'Density field not Population / Area', stale_d,
            f"{len(blank)} rows have no density calculated ({ids(blank)})"
            + (f"; {ids(other)} has a density that does not match its Population / Area." if other else '.'),
            None, 'None needed for modelling: the workbook recalculates density. Shown for completeness.')
    stale_w = [a for a in apps if abs((a['Water_dema'] or 0) - a['Population'] * PER_CAP_L_D * MAX_DAY / 86400) > 0.01]
    if stale_w:
        add('Medium', 'Water demand not the standard formula', stale_w,
            f"{len(stale_w)} rows have a water demand that does not equal Population x {PER_CAP_L_D} x {MAX_DAY} / 86400. "
            'Most are V7 additions whose demand seems to come from the FSR.',
            None, 'Modelling team to confirm whether they use this field or recalculate from population.')
    # Medium: fields needed to match against the app / judge timing
    for check, test, why in [
        ('Missing file number', lambda a: not a.get('File_numbe'), 'Cannot be matched to the app by file number; Bucket 3 will match by location.'),
        ('File number in a non-standard format', lambda a: a.get('File_numbe') and not FILE_NO.match(a['File_numbe']),
         'May not match the app by file number (e.g. a missing hyphen, or two files in one cell).'),
        ('Missing municipality', lambda a: not a.get('MUNICIPALI'), 'Bucket 2 will fill this from the location.'),
        ('Missing application year', lambda a: not a.get('Applicatio'), 'Limits the timing evidence for the 2031 share-built assumption.'),
        ('Missing application category', lambda a: not a.get('Category'), 'Limits the timing evidence for the 2031 share-built assumption.'),
        ('Pre-consultation only', lambda a: (a.get('Category') or '').startswith('PRECON'),
         'Pre-consultation is the earliest planning stage; relevant to the 2031 share-built assumption.'),
    ]:
        xs = [a for a in apps if test(a)]
        if xs:
            add('Medium', check, xs, f"{len(xs)} rows: {ids(xs)}.", sum(a['Population'] for a in xs), why)
    # Low
    ext = [a for a in apps if not DENSITY_LOW <= a['Population'] / a['Area'] <= DENSITY_HIGH]
    if ext:
        add('Low', 'Very high or very low density', ext,
            '; '.join(f"{a['id']} {a['Population'] / a['Area']:,.0f}/ha" for a in ext) + '.',
            None, f'Check the area value (outside {DENSITY_LOW}-{DENSITY_HIGH:,} persons/ha).')
    for check, test in [('Fire flow is 0 or blank', lambda a: not a.get('Fire_water')),
                        ('Peak sanitary flow is 0 or blank', lambda a: not a.get('Peak_sanit'))]:
        xs = [a for a in apps if test(a)]
        if xs:
            add('Low', check, xs, f"{len(xs)} rows: {ids(xs)}.", None, 'No effect on population.')
    for k, label in (('Received_D', 'Received date'), ('Deadline', 'Review deadline')):
        xs = meta['placeholders'].get(k) or []
        if xs:
            add('Low', f'{label} was a placeholder (1899-12-30)', [a for a in apps if a['id'] in xs],
                f"{len(xs)} rows; blanked in this workbook.", None, 'No effect on population.')
    if meta['muni_fixed']:
        add('Low', 'Municipality capitalisation fixed', [a for a in apps if a['id'] in {i for i, _ in meta['muni_fixed']}],
            '; '.join(f'{i}: "{m}"' for i, m in meta['muni_fixed']) + '.', None, 'None.')
    if meta['html_cells']:
        add('Low', 'Web formatting codes removed from text', [],
            f"{meta['html_cells']} text cells contained codes such as &#160; or &#58;; decoded to plain text. "
            'Values unchanged.', None, 'None.')
    for n, iss in enumerate(out, 1):
        iss['id'] = f'ISS-{n:03d}'
    return out, pairs


def match_labels(labels, apps):
    """For each map label, find the application(s) behind it: one row with the same population,
    two rows whose populations and areas add up to the label, or (probable) one row with the
    same area but a different population. Returns {area_name: match dict}."""
    out = {}
    for lab in labels:
        pop, ha = lab['population'], lab['area_ha']
        same = [a for a in apps if a['Population'] == pop]
        if len(same) == 1:
            a = same[0]
            area_ok = abs(a['Area'] - ha) < 0.01
            out[lab['area_name']] = {'rows': [a], 'status': 'Matches',
                                     'evidence': 'Exact population' + ('; area also matches.' if area_ok else
                                                                        f"; area differs ({a['Area']} ha).")}
            continue
        pair = [(a, b) for i, a in enumerate(apps) for b in apps[i + 1:]
                if a['Population'] + b['Population'] == pop and abs(a['Area'] + b['Area'] - ha) < 0.02]
        if len(pair) == 1:
            out[lab['area_name']] = {'rows': list(pair[0]), 'status': 'Matches',
                                     'evidence': 'Two rows add up exactly (population and area).'}
            continue
        by_area = [a for a in apps if abs(a['Area'] - ha) < 0.005]
        if len(by_area) == 1:
            a = by_area[0]
            out[lab['area_name']] = {'rows': [a], 'status': 'Probable',
                                     'evidence': f"Same area ({ha:g} ha) at {a.get('_address') or 'this site'} but a "
                                                 'different population. Confirm in Bucket 2.'}
    return out


def pop_field_text(apps, matches):
    zero = sum(1 for a in apps if not a.get('Populati_1'))
    txt = (f'Proposed: Population. The second field (Populati_1) is 0 or blank in {zero} of {len(apps)} rows.')
    for name, m in matches.items():
        if len(m['rows']) == 1 and m['status'] == 'Matches':
            a = m['rows'][0]
            if a.get('Populati_1') and a['Populati_1'] != a['Population']:
                txt += (f' Where the two differ and the row matches a map label ({name}, {a["id"]}), the map uses '
                        'Population, not the second field.')
    return txt + ' Rows where the two differ are in the Issues Log.'


# ---------------------------------------------------------------- sheets

def sheet_readme(ws, n_apps, src, pop_field_note):
    ws.title = 'README'
    ws.column_dimensions['A'].width = 34
    ws.column_dimensions['B'].width = 100
    ws['A1'] = 'Bucket 1: development application inventory (2031, Scenario 1)'
    ws['A1'].font = X.TITLE
    ws['A2'] = 'For review by Planning before anything is sent to Modelling. Draft; nothing here is approved.'
    ws['A2'].font = X.SUB
    rows = [
        ('Purpose', 'Clean, complete list of the development applications behind map 4507-WW (Scenario 1 2031), '
                    'with every data problem visible. No assumptions yet (units, phasing, share built by 2031 '
                    'come in later buckets).'),
        ('Core decision it supports', 'Which development-charge-funded water and wastewater linear projects are '
                                      'needed by 2031 and should get capital funding.'),
        ('Source', src),
        ('Applications', f'{n_apps} points. Row IDs (DA-001 ...) follow the order of records in the shapefile.'),
        ('Version tags', 'From the shapefile Comment field: blank = V6, "Addition" = V7 Addition, '
                         '"Revised Pop/ha" = V6 Revised Pop/ha (matches the map legend).'),
        ('Population field', pop_field_note),
        ('Cleaning done', 'Web formatting codes decoded (e.g. &#160;), municipality capitalisation made consistent, '
                          '1899-12-30 placeholder dates blanked, address parts joined. No population, area or flow '
                          'value was changed.'),
        ('Severity', 'High = could change the population sent to Modelling. Medium = blocks matching to the app or '
                     'a calculated field is inconsistent. Low = no effect on population.'),
        ('Population affected', 'On the Issues Log: for a possible double count, the smaller population of the pair; '
                                'where the population fields disagree, the difference between them; for the other '
                                'checks, the total population of the rows affected.'),
        ('Colours', 'Blue = value from the shapefile or map. Black = formula. Green = link to another sheet. '
                    'Yellow = reviewer fills in.'),
        ('Sheets', 'Reconciliation: application total against the map.  Applications: one row per application.  '
                   'Issues Log: every data problem, with a yellow decision column.  Possible Duplicates: pairs of '
                   'co-located points.  Map Labels: the 19 areas from the map.  Field Dictionary: original field '
                   'names and what they mean.'),
    ]
    r = 4
    for k, v in rows:
        ws.cell(r, 1, k).font = X.BOLD
        c = ws.cell(r, 2, v)
        c.font, c.alignment = X.BASE, X.WRAP
        ws.row_dimensions[r].height = 15 * max(1, -(-len(v) // 95))
        r += 1
    r += 1
    ws.cell(r, 1, 'Constants used by formulas').font = X.BOLD
    r += 1
    consts = {}
    for key, label, val, note in [
        ('per_cap', 'Water demand per person (L/person/day)', PER_CAP_L_D, 'From the shapefile metadata (CalculateField Water_dema).'),
        ('max_day', 'Maximum day factor', MAX_DAY, 'From the shapefile metadata (CalculateField Water_dema).'),
    ]:
        ws.cell(r, 1, label).font = X.BASE
        X.body(ws.cell(r, 2, val), X.INPUT).alignment = X.TOP
        ws.cell(r, 3, note).font = X.SUB
        consts[key] = f'README!$B${r}'
        r += 1
    r += 1
    ws.cell(r, 1, 'Thresholds used by the checks').font = X.BOLD
    r += 1
    for label, val in [('Co-located points (metres)', NEAR_M), ('High density (persons/ha)', DENSITY_HIGH),
                       ('Low density (persons/ha)', DENSITY_LOW),
                       ('Same-population check, minimum size', SAME_POP_MIN)]:
        ws.cell(r, 1, label).font = X.BASE
        X.body(ws.cell(r, 2, val), X.INPUT, '#,##0').alignment = X.TOP
        ws.cell(r, 3, 'Set by the analyst for screening; change in build_inventory.py and rebuild.').font = X.SUB
        r += 1
    return consts


def sheet_applications(ws, apps, consts):
    ws.title = 'Applications'
    cols = ['Row ID', 'Version'] + [lab for _, lab, _ in FIELDS]
    widths = [9, 15] + [45 if k in LONG else (24 if k in ('_address', 'Category', 'Secondary_') else 13)
                        for k, _, _ in FIELDS]
    X.header(ws, 1, cols, widths)
    colof = {k: get_column_letter(i + 3) for i, (k, _, _) in enumerate(FIELDS)}
    for n, a in enumerate(apps, 2):
        X.body(ws.cell(n, 1, a['id']), X.BOLD)
        X.body(ws.cell(n, 2, a['version']), X.INPUT)
        for i, (k, _, _) in enumerate(FIELDS, 3):
            if k == '_density_chk':
                v, font = f'=IF({colof["Area"]}{n}>0,{colof["Population"]}{n}/{colof["Area"]}{n},"")', X.BASE
            elif k == '_water_chk':
                v, font = f'={colof["Population"]}{n}*{consts["per_cap"]}*{consts["max_day"]}/86400', X.BASE
            elif k == '_issues':
                v, font = f"=COUNTIF('Issues Log'!$C:$C,\"*\"&A{n}&\"*\")", X.BASE
            else:
                v, font = a.get(k), X.INPUT
                if v == '':
                    v = None
            c = X.body(ws.cell(n, i, v), font, NUMERIC.get(k) or ('yyyy-mm-dd' if k in DATES else None),
                       wrap=False)
            if k in LONG:
                c.alignment = X.TOP
    ws.freeze_panes = 'C2'
    ws.auto_filter.ref = f'A1:{get_column_letter(len(cols))}{len(apps) + 1}'
    return colof


def sheet_issues(ws, issues):
    ws.title = 'Issues Log'
    cols = ['Issue ID', 'Severity', 'Row IDs', 'Rows affected', 'Check', 'Detail', 'Population affected',
            'Suggested action', 'Reviewer decision', 'Reviewer comment']
    X.header(ws, 1, cols, [10, 10, 30, 9, 30, 70, 12, 45, 22, 36])
    order = {'High': 0, 'Medium': 1, 'Low': 2}
    for n, iss in enumerate(sorted(issues, key=lambda x: (order[x['sev']], x['id'])), 2):
        X.body(ws.cell(n, 1, iss['id']), X.BOLD)
        X.body(ws.cell(n, 2, iss['sev'])).fill = X.SEV_FILL[iss['sev']]
        X.body(ws.cell(n, 3, ids(iss['rows']) or '(various)'), wrap=True)
        X.body(ws.cell(n, 4, len(iss['rows'])), fmt='0')
        X.body(ws.cell(n, 5, iss['check']), wrap=True)
        X.body(ws.cell(n, 6, iss['detail']), wrap=True)
        X.body(ws.cell(n, 7, iss['at_stake']), fmt='#,##0')
        X.body(ws.cell(n, 8, iss['action']), wrap=True)
        for c in (9, 10):
            X.body(ws.cell(n, c), wrap=True).fill = X.REVIEW_FILL
        longest = max(len(iss['detail']) / 68, len(ids(iss['rows'])) / 28, len(iss['action']) / 43, 1)
        ws.row_dimensions[n].height = min(15 * math.ceil(longest), 300)
    ws.freeze_panes = 'C2'
    ws.auto_filter.ref = f'A1:J{len(issues) + 1}'


def sheet_duplicates(ws, pairs, colof):
    ws.title = 'Possible Duplicates'
    ws['A1'] = 'Co-located application points (closer than %d m)' % NEAR_M
    ws['A1'].font = X.TITLE
    ws['A2'] = ('If the two rows are the same development (a resubmission), the smaller population is counted twice. '
                'If they are separate phases, both stay. Planning to decide in the yellow column.')
    ws['A2'].font = X.SUB
    cols = ['Pair', 'Row A', 'File A', 'Population A', 'Area A (ha)', 'Row B', 'File B', 'Population B',
            'Area B (ha)', 'Distance (m)', 'Address', 'Overcount if one replaces the other',
            'Same development? (Y/N)', 'Keep which row?']
    X.header(ws, 4, cols, [6, 9, 18, 12, 10, 9, 18, 12, 10, 10, 28, 16, 14, 14])

    def ref(a, k, text=False):
        f = f"INDEX(Applications!${colof[k]}:${colof[k]},MATCH(\"{a['id']}\",Applications!$A:$A,0))"
        return f'={f}&""' if text else f'={f}'
    for n, (a, b, d) in enumerate(pairs, 5):
        X.body(ws.cell(n, 1, n - 4))
        X.body(ws.cell(n, 2, a['id']), X.BOLD)
        X.body(ws.cell(n, 3, ref(a, 'File_numbe', True)), X.LINK)
        X.body(ws.cell(n, 4, ref(a, 'Population')), X.LINK, '#,##0')
        X.body(ws.cell(n, 5, ref(a, 'Area')), X.LINK, '0.00')
        X.body(ws.cell(n, 6, b['id']), X.BOLD)
        X.body(ws.cell(n, 7, ref(b, 'File_numbe', True)), X.LINK)
        X.body(ws.cell(n, 8, ref(b, 'Population')), X.LINK, '#,##0')
        X.body(ws.cell(n, 9, ref(b, 'Area')), X.LINK, '0.00')
        X.body(ws.cell(n, 10, round(d, 1)), X.INPUT, '0')
        X.body(ws.cell(n, 11, a.get('_address') or b.get('_address')), wrap=True)
        X.body(ws.cell(n, 12, f'=MIN(D{n},H{n})'), fmt='#,##0')
        for c in (13, 14):
            X.body(ws.cell(n, c)).fill = X.REVIEW_FILL
    last = 4 + len(pairs)
    t = last + 1
    X.body(ws.cell(t, 11, 'Most that could be double counted'), X.BOLD, wrap=True)
    X.body(ws.cell(t, 12, f'=SUM(L5:L{last})'), X.BOLD, '#,##0')
    for c in range(1, 15):
        ws.cell(t, c).fill = X.TOTAL_FILL
    ws.freeze_panes = 'C5'
    return t


def sheet_map(ws, labels, colof, matches):
    ws.title = 'Map Labels'
    ws['A1'] = 'The 19 priority areas as labelled on the map'
    ws['A1'].font = X.TITLE
    ws['A2'] = ('Copied from map 4507-WW (2026-05-20); full checks in Map_Areas_2031.xlsx. '
                'The match columns look for one application with exactly the label population.')
    ws['A2'].font = X.SUB
    cols = ['#', 'Area (map label)', 'Population (map)', 'Area ha (map)', 'Density (persons/ha)',
            'Applications with exactly this population', 'Matching Row ID', 'Matching row area (ha)', 'Note']
    X.header(ws, 4, cols, [5, 24, 14, 12, 12, 16, 12, 12, 60])
    pop, area = colof['Population'], colof['Area']
    notes = {}
    for name, m in matches.items():
        rid = ' + '.join(a['id'] for a in m['rows'])
        notes[name] = f"{m['status']}: {rid}. {m['evidence']}"
    first = 5
    for i, lab in enumerate(sorted(labels, key=lambda r: r['map_order'])):
        n = first + i
        X.body(ws.cell(n, 1, lab['map_order']))
        X.body(ws.cell(n, 2, lab['area_name']), X.BOLD)
        X.body(ws.cell(n, 3, lab['population']), X.INPUT, '#,##0')
        X.body(ws.cell(n, 4, lab['area_ha']), X.INPUT, '0.00')
        X.body(ws.cell(n, 5, f'=IF(D{n}>0,C{n}/D{n},"")'), fmt='#,##0')
        X.body(ws.cell(n, 6, f'=COUNTIF(Applications!${pop}:${pop},C{n})'), fmt='0')
        X.body(ws.cell(n, 7, f'=IFERROR(INDEX(Applications!$A:$A,MATCH(C{n},Applications!${pop}:${pop},0)),"")'))
        X.body(ws.cell(n, 8, f'=IFERROR(INDEX(Applications!${area}:${area},MATCH(C{n},Applications!${pop}:${pop},0)),"")'),
               fmt='0.00')
        note = notes.get(lab['area_name'], '')
        if lab['label_note']:
            note = (note + ' ' if note else '') + 'Map: ' + lab['label_note']
        X.body(ws.cell(n, 9, note or None), wrap=True)
        ws.row_dimensions[n].height = 15 * max(1, math.ceil(len(note) / 58))
    last = first + len(labels) - 1
    t = last + 1
    X.body(ws.cell(t, 2, 'Total (19 areas)'), X.BOLD)
    X.body(ws.cell(t, 3, f'=SUM(C{first}:C{last})'), X.BOLD, '#,##0')
    X.body(ws.cell(t, 4, f'=SUM(D{first}:D{last})'), X.BOLD, '0.00')
    for c in range(1, 10):
        ws.cell(t, c).fill = X.TOTAL_FILL
    ws.freeze_panes = 'C5'
    rowof = {lab['area_name']: first + i for i, lab in enumerate(sorted(labels, key=lambda r: r['map_order']))}
    return t, rowof


def sheet_reconciliation(ws, colof, map_total_row, map_rowof, dup_total_row, matches, n_labels):
    ws.title = 'Reconciliation'
    ws.column_dimensions['A'].width = 46
    for c, w in zip('BCDEF', [16, 16, 16, 16, 60]):
        ws.column_dimensions[c].width = w
    ws['A1'] = 'Reconciliation: applications against the map'
    ws['A1'].font = X.TITLE
    ws['A2'] = 'Every number below is a formula on the other sheets.'
    ws['A2'].font = X.SUB
    pop, area = colof['Population'], colof['Area']
    P = f'Applications!${pop}:${pop}'

    def row(r, label, formula, fmt='#,##0', bold=False, font=None):
        ws.cell(r, 1, label).font = X.BOLD if bold else X.BASE
        X.body(ws.cell(r, 2, formula), font or (X.BOLD if bold else X.BASE), fmt)

    X.header(ws, 4, ['Totals', 'Value'])
    row(5, 'Applications in the shapefile', '=COUNTA(Applications!$A:$A)-1', '0')
    row(6, 'Population, all applications', f'=SUM({P})')
    row(7, 'Population, 19 map labels', f"='Map Labels'!C{map_total_row}", font=X.LINK)
    row(8, 'Gap (map minus applications)', '=B7-B6', bold=True)
    row(9, 'Area, all applications (ha)', f'=SUM(Applications!${area}:${area})', '#,##0.00')
    row(10, 'Area, 19 map labels (ha)', f"='Map Labels'!D{map_total_row}", '#,##0.00', font=X.LINK)
    row(11, 'Area gap (ha)', '=B10-B9', '#,##0.00')
    c = ws.cell(11, 3, 'Areas agree, so the map labels look like sums of these same points; the gap is in population only.')
    c.font = X.SUB

    X.header(ws, 12, ['By version', 'Applications', 'Population', 'Share of population'])
    for i, v in enumerate(['V6', 'V7 Addition', 'V6 Revised Pop/ha']):
        r = 13 + i
        ws.cell(r, 1, v).font = X.BASE
        X.body(ws.cell(r, 2, f'=COUNTIF(Applications!$B:$B,A{r})'), fmt='0')
        X.body(ws.cell(r, 3, f'=SUMIF(Applications!$B:$B,A{r},{P})'), fmt='#,##0')
        X.body(ws.cell(r, 4, f'=C{r}/$B$6'), fmt='0.0%')
    ws.cell(16, 1, 'Total').font = X.BOLD
    X.body(ws.cell(16, 2, '=SUM(B13:B15)'), X.BOLD, '0')
    X.body(ws.cell(16, 3, '=SUM(C13:C15)'), X.BOLD, '#,##0')
    X.body(ws.cell(16, 4, '=SUM(D13:D15)'), X.BOLD, '0.0%')

    X.header(ws, 18, ['Explaining the gap', 'Map label', 'Applications', 'Difference', 'Status', 'Evidence'])

    def app_pop(*row_ids):
        return '=' + '+'.join(f'INDEX({P},MATCH("{i}",Applications!$A:$A,0))' for i in row_ids)
    order = {'Probable': 0, 'Matches': 1}
    items = sorted(((f"{name} vs {' + '.join(a['id'] for a in m['rows'])}", name, [a['id'] for a in m['rows']],
                     m['status'], m['evidence']) for name, m in matches.items()),
                   key=lambda x: (order[x[3]], x[1]))
    r = 19
    for label, area_name, rid, status, ev in items:
        ws.cell(r, 1, label).font = X.BASE
        X.body(ws.cell(r, 2, f"='Map Labels'!C{map_rowof[area_name]}"), X.LINK, '#,##0')
        X.body(ws.cell(r, 3, app_pop(*rid)), X.LINK, '#,##0')
        X.body(ws.cell(r, 4, f'=B{r}-C{r}'), fmt='#,##0')
        X.body(ws.cell(r, 5, status))
        X.body(ws.cell(r, 6, ev), wrap=True)
        r += 1
    ws.cell(r, 1, 'Explained so far').font = X.BOLD
    X.body(ws.cell(r, 4, f'=SUM(D19:D{r - 1})'), X.BOLD, '#,##0')
    r += 1
    ws.cell(r, 1, f'Still to explain (other {n_labels - len(matches)} areas, in Bucket 2)').font = X.BOLD
    X.body(ws.cell(r, 4, f'=B8-D{r - 1}'), X.BOLD, '#,##0').fill = X.TOTAL_FILL
    X.body(ws.cell(r, 6, 'Needs each application assigned to an area (Bucket 2).'), wrap=True)
    r += 2
    X.header(ws, r, ['Possible double counting', 'Population'])
    r += 1
    ws.cell(r, 1, 'Most that could be double counted (co-located pairs)').font = X.BASE
    X.body(ws.cell(r, 2, f"='Possible Duplicates'!L{dup_total_row}"), X.LINK, '#,##0')
    X.body(ws.cell(r, 6, 'The map labels are built from these same points, so any double count is in the map totals '
                         'too. Not removed: Planning decides on the Possible Duplicates sheet.'), wrap=True)
    ws.row_dimensions[r].height = 45


def sheet_dictionary(ws, fields, apps):
    ws.title = 'Field Dictionary'
    X.header(ws, 1, ['Column on Applications', 'Original field', 'Type', 'Rows filled', 'Notes'], [32, 14, 10, 11, 80])
    types = {name: t for name, t, _ in fields}
    tname = {'C': 'Text', 'F': 'Number', 'N': 'Number', 'D': 'Date'}
    rows = [('Row ID', '(added)', '', len(apps), 'DA-nnn, the record order in the shapefile.'),
            ('Version', 'Comment', 'Text', len(apps), 'Derived from Comment.')]
    for k, lab, note in FIELDS:
        if k.startswith('_'):
            orig = ', '.join(ADDRESS_PARTS) if k == '_address' else '(added)'
            filled = sum(1 for a in apps if a.get(k) not in (None, '')) if k in ('_address', '_lon', '_lat') else len(apps)
            rows.append((lab, orig, '', filled, note))
        else:
            filled = sum(1 for a in apps if a.get(k) not in (None, '', 0, 0.0))
            rows.append((lab, k, tname.get(types.get(k), ''), filled, note))
    for n, rr in enumerate(rows, 2):
        for c, v in enumerate(rr, 1):
            X.body(ws.cell(n, c, v), wrap=(c == 5))
    ws.freeze_panes = 'A2'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shp', default=os.path.join(HERE, 'private', 'input', 'Dev_Apps_V7'))
    ap.add_argument('--labels', default=os.path.join(HERE, 'private', 'map_labels.csv'))
    ap.add_argument('--out', default=os.path.join(HERE, 'private', 'Bucket1_Inventory.xlsx'))
    a = ap.parse_args()
    fields, apps, meta = load(a.shp)
    labels = load_labels(a.labels)
    issues, pairs = find_issues(apps, meta)
    matches = match_labels(labels, apps)

    wb = Workbook()
    consts = sheet_readme(wb.active, len(apps), f'{os.path.basename(a.shp)} shapefile ({len(apps)} points) and '
                                                'map 4507-WW-Development Application Modelling Update (2026-05-20).',
                          pop_field_text(apps, matches))
    ws_rec = wb.create_sheet()
    colof = sheet_applications(wb.create_sheet(), apps, consts)
    sheet_issues(wb.create_sheet(), issues)
    dup_total = sheet_duplicates(wb.create_sheet(), pairs, colof)
    map_total, map_rowof = sheet_map(wb.create_sheet(), labels, colof, matches)
    sheet_dictionary(wb.create_sheet(), fields, apps)
    sheet_reconciliation(ws_rec, colof, map_total, map_rowof, dup_total, matches, len(labels))
    for ws in wb.worksheets:
        X.print_fit(ws)
    wb.save(a.out)
    sev = collections.Counter(i['sev'] for i in issues)
    print(f'wrote {a.out}: {len(apps)} applications, {len(issues)} issues '
          f'(High {sev["High"]}, Medium {sev["Medium"]}, Low {sev["Low"]}), {len(pairs)} co-located pairs')


if __name__ == '__main__':
    main()
