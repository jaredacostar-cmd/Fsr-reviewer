#!/usr/bin/env python3
"""Build data/housing.json: housing targets and progress, CMHC starts / completions and the
Ministry of Finance population projection for Peel.

Inputs: the ext-raw folder from scripts/fetch-external.js (probe-sources mode=external, ext-raw branch).
  - Ontario's housing supply progress (Ontario Data Catalogue), one CSV per year
  - CMHC Housing Market Information Portal: starts / completions by dwelling type by census
    subdivision, Toronto CMA (tables 1.1.1.9 and 1.1.3.9), one CSV per year
  - Ontario Ministry of Finance population projections, 49 census divisions, 2025-2051
Usage: python3 scripts/build-housing.py <ext-raw> data/housing.json
"""
import csv, glob, io, json, os, re, sys
import openpyxl

raw, out_p = sys.argv[1:3]
MUNI = {'Mississauga': 'Mississauga', 'Brampton': 'Brampton', 'Caledon': 'Caledon'}
num = lambda s: int(str(s).replace(',', '').strip() or 0)

# Housing supply progress: the CSV columns are the same in English and French; read by position.
targets, progress = {}, {}
for f in sorted(glob.glob(os.path.join(raw, 'ontario-s-housing-supply-progress', '*.csv'))):
    y = int(re.search(r'(20\d\d)\.csv$', f).group(1))
    text = open(f, 'rb').read().decode('cp1252', errors='replace')
    for r in csv.reader(io.StringIO(text)):
        if r and r[0] in MUNI:
            targets[r[0]] = num(r[1])
            progress.setdefault(r[0], {})[y] = {'sinceStart': num(r[2]), 'target': num(r[3]), 'progress': num(r[4])}

def cmhc(kind):
    by = {}
    for f in sorted(glob.glob(os.path.join(raw, 'cmhc', f'{kind}-9-20*.csv'))):
        y = int(re.search(r'(20\d\d)\.csv$', f).group(1))
        rows = list(csv.reader(io.StringIO(open(f, 'rb').read().decode('utf-8', errors='replace'))))
        for r in rows:
            m = re.match(r'(Mississauga|Brampton|Caledon) \(', r[0]) if r else None
            if m and len(r) >= 6:
                by.setdefault(m.group(1), {})[y] = {'single': num(r[1]), 'semi': num(r[2]), 'row': num(r[3]), 'apartment': num(r[4]), 'all': num(r[5])}
    return by

starts, completions = cmhc('starts'), cmhc('completions')

wb = openpyxl.load_workbook(os.path.join(raw, 'population-projections', '49_Census_Divisions_MOF_Population_Projections.xlsx'), read_only=True)
mof = {}
for r in wb.worksheets[0].iter_rows(values_only=True):
    if r[2] and str(r[2]).strip().upper() == 'PEEL' and str(r[3]).upper().startswith('TOTAL'):
        mof[int(r[0])] = int(r[4])

def modified(pkg):
    try: return json.load(open(os.path.join(raw, f'ckan-{pkg}.json')))['metadata_modified'][:10]
    except Exception: return None

out = {
    'version': 1,
    'fetched': __import__('datetime').date.today().isoformat(),
    'targets': {
        'source': "Ontario's housing supply progress (Ontario Data Catalogue): municipal housing targets to 2031 and annual progress (CMHC starts plus additional residential units, long-term care, retirement and student beds)",
        'url': 'https://data.ontario.ca/dataset/ontario-s-housing-supply-progress',
        'asOf': modified('ontario-s-housing-supply-progress'), 'by': '2031', 'muni': {m: {'target': targets.get(m), 'years': progress.get(m, {})} for m in MUNI},
    },
    'cmhc': {
        'source': 'CMHC Starts and Completions Survey, Housing Market Information Portal: starts and completions by dwelling type by census subdivision (Toronto CMA). Completions by census subdivision are archived after 2022.',
        'url': 'https://www03.cmhc-schl.gc.ca/hmip-pimh/en/TableMapChart/Table?TableId=1.1.1.9&GeographyId=2270&GeographyTypeId=3&DisplayAs=Table&GeograghyName=Toronto',
        'asOf': f"{max(max(v) for v in starts.values())}-12-31" if starts else None, 'starts': starts, 'completions': completions,
    },
    'mof': {
        'source': 'Ontario Ministry of Finance population projections 2025-2051, Peel census division (summer 2026 update; July 1 population, reference scenario)',
        'url': 'https://data.ontario.ca/dataset/population-projections',
        'asOf': modified('population-projections'), 'peel': mof,
    },
}
json.dump(out, open(out_p, 'w'), indent=1)
print('targets', targets); print('progress', progress)
print('starts', {m: sorted(v) for m, v in starts.items()}); print('completions', {m: sorted(v) for m, v in completions.items()})
print('mof', {y: mof[y] for y in (2025, 2031, 2041, 2051) if y in mof})
