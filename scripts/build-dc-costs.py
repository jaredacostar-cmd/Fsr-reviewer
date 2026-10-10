#!/usr/bin/env python3
"""Build data/dc-costs.json: capital cost of DC components and the Region's water / wastewater DC rates.

Costs come from the 2020 DC Background Study capital tables (Watson & Associates, Sept 2020; text
on the ref-docs-dc branch, dc/dcbs2024.txt.gz). Each table row carries the component number that
the 2026 DC capital maps still use (data/dc-infra.json `c` and facility phases), so the 2020 gross
cost and the DC-recoverable share are matched by component. Components new since 2020 have no
published cost yet (the 2026 DC Background Study's project list isn't public in table form).

Usage: python3 scripts/build-dc-costs.py <dcbs2024.txt> data/dc-infra.json data/dc-costs.json
"""
import json, math, re, sys

src, infra_p, out_p = sys.argv[1:4]
txt = open(src, encoding='utf-8').read().split('\n')
row = re.compile(r'^\s{0,4}(\d{1,3})\s+(\d{5})\s+(\d{6})\s+(.*?)\s(20[2-4]\d)\s+([\d,]+)\s+(.*)$')
num = lambda s: 0 if s in ('-', '') else (-1 if s.startswith('(') else 1) * int(s.strip('()').replace(',', ''))

comps, projects = {}, {}
for i, l in enumerate(txt):
    m = row.match(l)
    if not m: continue
    vals = re.findall(r'\(?[\d,]+\)?|-', m.group(7))
    if len(vals) < 6: continue  # water tables have no grants column
    gross, dc = int(m.group(6).replace(',', '')), num(vals[-3])
    head = re.sub(r'\s{2,}', ' · ', m.group(4).strip())
    c = comps.setdefault(m.group(2), {'gross': 0, 'dc': 0, 'proj2020': m.group(3), 'year': int(m.group(5)), 'what': head[:90]})
    c['gross'] += gross; c['dc'] += dc
    pj = projects.setdefault(m.group(3), {'gross': 0, 'dc': 0, 'what': head[:90]})
    pj['gross'] += gross; pj['dc'] += dc

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

# Unit cost of mains (2020$ gross per metre) against diameter, per system: a log-log fit over the
# priced components' total lengths on the 2026 maps (i = a * (d/1000)^b), for components the 2020
# study doesn't price. DC-recoverable share: the priced components' average, per system.
def length(g):
    s = 0
    for (x1, y1), (x2, y2) in zip(g, g[1:]):
        s += math.hypot((x2 - x1) * 111320 * math.cos(math.radians(y1)), (y2 - y1) * 111320)
    return s
unit, share = {}, {}
for sys_ in ('wastewater', 'water'):
    lens, dia = {}, {}
    for ln in infra[sys_]['lines']:
        if ln.get('c') and ln.get('d'):
            lens[ln['c']] = lens.get(ln['c'], 0) + length(ln['g']); dia[ln['c']] = ln['d']
    pts = [(math.log(dia[c] / 1000), math.log(matched[c]['gross'] / lens[c])) for c in lens if c in matched and lens[c] > 150 and matched[c]['gross'] > 0]
    n = len(pts); mx = sum(x for x, _ in pts) / n; my = sum(y for _, y in pts) / n
    b = sum((x - mx) * (y - my) for x, y in pts) / sum((x - mx) ** 2 for x, _ in pts); a = math.exp(my - b * mx)
    unit[sys_] = {'a': round(a), 'b': round(b, 3), 'n': n}
    pr = [matched[c] for c in matched if c in lens]
    share[sys_] = round(sum(v['dc'] for v in pr) / sum(v['gross'] for v in pr), 3)
# Facilities with no priced component and no 2020 project match: the median priced item of the same kind.
fac = {}
for sys_ in ('wastewater', 'water'):
    for f in infra[sys_]['facilities']:
        for it in f['items']:
            ph = [p[2] for p in it.get('phases', []) if len(p) > 2]
            if ph and all(p in matched for p in ph):
                fac.setdefault(f"{sys_}:{f['kind']}", []).append(sum(matched[p]['gross'] for p in ph))
facMedian = {k: sorted(v)[len(v) // 2] for k, v in fac.items()}

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
    # All 2020 projects by project number (the 2026 maps keep some numbers: 22-2950 = 222950).
    'projects': projects,
    'unitCost': unit, 'dcShare': share, 'facilityMedian': facMedian,
    # 2020$ to 2026$: the Region's DC rate indexing since the 2020 study (Table ES-2 single / semi
    # rates against the August 2026 rates), per service.
    # Plant capacity steps with no DC project number, costed from their council approval (dollars of that year).
    'stepCosts': {'2028:558': {'gross': 130000000, 'year': 2024, 'note': 'G.E. Booth capacity restoration to 558 ML/d: $130 million approved by Regional Council, February 2024', 'ref': 'https://www.link2build.ca/news/posts/peel-region-allocates-130-million-to-expand-wastewater-capacity/'}},
    'index2026': {'water': round(30180.96 / 22392.53, 4), 'wastewater': round(32776.33 / 23371.54, 4), 'note': 'DC rates indexed since the 2020 study (Statistics Canada construction price index, as the by-law requires): August 2026 single / semi rate over the 2020 schedule.'},
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
print('unit', unit, 'share', share, 'facMedian', facMedian)
print('gross matched $', sum(v['gross'] for v in matched.values()), 'dc $', sum(v['dc'] for v in matched.values()))
