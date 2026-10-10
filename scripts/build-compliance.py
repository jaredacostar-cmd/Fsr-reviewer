#!/usr/bin/env python3
"""Build data/compliance.json: effluent limit exceedances at the Region of Peel's wastewater plants,
from Ontario's Environmental Compliance Reports (municipal and private sewage works, MECP, Ontario
Data Catalogue, one CSV per year; fetched by scripts/fetch-external.js to the ext-raw branch).
Usage: python3 scripts/build-compliance.py <ext-raw> data/compliance.json
"""
import csv, glob, io, json, os, re, sys

raw, out_p = sys.argv[1:3]
PLANT = [(r'BOOTH|LAKEVIEW', 'Lakeview'), (r'CLARKSON', 'Clarkson'), (r'INGLEWOOD', 'Inglewood')]
def date(s):
    s = (s or '').strip()
    m = re.match(r'(\d{2})/(\d{2})/(\d{4})$', s)
    return f'{m.group(3)}-{m.group(1)}-{m.group(2)}' if m else s[:10]
num = lambda s: float(s) if re.match(r'^-?\d+(\.\d+)?$', (s or '').strip()) else None

rows, years = [], []
for f in sorted(glob.glob(os.path.join(raw, 'environmental-compliance-reports', '*_municipal_private_sewage.csv'))):
    y = int(os.path.basename(f)[:4]); years.append(y)
    text = open(f, 'rb').read().decode('utf-8-sig', errors='replace')
    for r in csv.reader(io.StringIO(text)):
        if len(r) < 18 or 'PEEL' not in r[0].upper() or 'REGIONAL' not in r[0].upper(): continue
        pl = next((k for pat, k in PLANT if re.search(pat, r[1].upper())), None)
        if not pl: continue
        rows.append({'year': y, 'plant': pl, 'site': r[1].strip(), 'contaminant': r[6].replace(';', ',').strip().capitalize(), 'type': r[7].strip(),
                     'from': date(r[8]), 'to': date(r[9]), 'limit': num(r[10]), 'unit': r[11].strip(), 'freq': r[12].strip(),
                     'count': int(num(r[13]) or 1), 'max': num(r[15]), 'action': r[16].strip(), 'ministry': r[17].strip()})
rows.sort(key=lambda x: (x['from'], x['plant']))
out = {
    'version': 1,
    'source': "Ontario Ministry of the Environment, Conservation and Parks: Environmental Compliance Reports, municipal and private sewage works (Ontario Data Catalogue)",
    'url': 'https://data.ontario.ca/dataset/environmental-compliance-reports',
    'years': sorted(years), 'rows': rows,
}
json.dump(out, open(out_p, 'w'), indent=1)
by = {}
for r in rows: by.setdefault((r['plant'], r['year']), 0); by[(r['plant'], r['year'])] += r['count']
print(len(rows), 'rows', sorted(by.items()))
