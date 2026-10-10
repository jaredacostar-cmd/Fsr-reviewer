#!/usr/bin/env python3
"""Build data/dc-costs.json: capital cost of DC components and the Region's water / wastewater DC rates.

Costs come from the 2020 DC Background Study capital tables (Watson & Associates, Sept 2020; text
on the ref-docs-dc branch, dc/dcbs2024.txt.gz). Each table row carries the component number that
the 2026 DC capital maps still use (data/dc-infra.json `c` and facility phases), so the 2020 gross
cost and the DC-recoverable share are matched by component. Components new since 2020 have no
published cost yet (the 2026 DC Background Study's project list isn't public in table form).

Usage: python3 scripts/build-dc-costs.py <dcbs2024.txt> data/dc-infra.json data/dc-costs.json
"""
import json, re, sys

src, infra_p, out_p = sys.argv[1:4]
txt = open(src, encoding='utf-8').read().split('\n')
row = re.compile(r'^\s{0,4}(\d{1,3})\s+(\d{5})\s+(\d{6})\s+(.*?)\s(20[2-4]\d)\s+([\d,]+)\s+(.*)$')
num = lambda s: 0 if s in ('-', '') else (-1 if s.startswith('(') else 1) * int(s.strip('()').replace(',', ''))

comps = {}
for i, l in enumerate(txt):
    m = row.match(l)
    if not m: continue
    vals = re.findall(r'\(?[\d,]+\)?|-', m.group(7))
    if len(vals) < 6: continue  # water tables have no grants column
    gross, dc = int(m.group(6).replace(',', '')), num(vals[-3])
    head = re.sub(r'\s{2,}', ' · ', m.group(4).strip())
    c = comps.setdefault(m.group(2), {'gross': 0, 'dc': 0, 'proj2020': m.group(3), 'year': int(m.group(5)), 'what': head[:90]})
    c['gross'] += gross; c['dc'] += dc

infra = json.load(open(infra_p))
used = set()
def walk(o):
    if isinstance(o, dict):
        if isinstance(o.get('c'), str): used.add(o['c'])
        for ph in o.get('phases', []) or []:
            if len(ph) > 2: used.add(ph[2])
        for v in o.values(): walk(v)
    elif isinstance(o, list):
        for v in o: walk(v)
walk(infra)
matched = {k: v for k, v in comps.items() if k in used}

out = {
    'version': 1,
    'basis': '2020$',
    'source': {
        'study': '2020 DC Background Study, Region of Peel (Watson & Associates, September 18, 2020): water and wastewater capital tables',
        'url': 'https://www.peelregion.ca/finance/_media/Peel%20Development-Charges-Background-Study.pdf',
        'note': 'Gross capital cost estimate and the potential DC-recoverable cost (after post-period benefit, benefit to existing and grants), by component, in 2020 dollars. Matched to the 2026 DC capital maps by component number; components added since 2020 have no published cost.',
    },
    'componentsIn2020': len(comps),
    'componentsOnMaps': len(used),
    'components': matched,
    # Region of Peel water and wastewater DCs per unit, August 1, 2026 to January 31, 2027 (indexed
    # rates). Unit types other than single / semi use the 2020 schedule's ratios (Table ES-2).
    'rates': {
        'effective': '2026-08-01',
        'until': '2027-01-31',
        'ref': 'Region of Peel development charges, residential water and wastewater (single / semi), indexed August 1, 2026; Regional Council report March 26, 2026',
        'url': 'https://peelregion.ca/development-charges',
        'single': {'water': 30180.96, 'wastewater': 32776.33},
        'ratio2020': {'single': 1, 'apartmentLarge': round(16242.84 / 22392.53, 4), 'apartmentSmall': round(8590.38 / 22392.53, 4), 'other': round(17734.97 / 22392.53, 4)},
        'ratioNote': 'Apartments (>750 sq ft), small units (≤750 sq ft) and other residential (townhouses) scaled from the single / semi rate by the 2020 schedule (Table ES-2).',
    },
}
json.dump(out, open(out_p, 'w'), indent=1)
print(f'{len(comps)} components in the 2020 tables, {len(used)} on the 2026 maps, {len(matched)} matched')
print('gross matched $', sum(v['gross'] for v in matched.values()), 'dc $', sum(v['dc'] for v in matched.values()))
