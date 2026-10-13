#!/usr/bin/env python3
"""Build data/water-facilities.json: the Region of Peel's existing water facilities ("vertical"
infrastructure): treatment plants, pumping stations, reservoirs, elevated tanks and standpipes.

- Locations and types: the Region's open data (water_infrastructure FeatureServer layers 1-3:
  storage, treatment plants, pumping stations), downloaded to the servicing-raw branch by
  scripts/fetch-servicing-raw.js (data-raw/waterStorage, waterPlants, waterPumpingStations).
- Capacities: the 2020 Water and Wastewater Master Plan, Volume 3 (Tables 4-7: pumping station
  installed / firm / actual firm capacity by pumping zone; reservoir volumes; Table 9 treatment
  capacity against forecast demand; Tables 11-12 stations and reservoirs short of capacity by 2041),
  and the Region's 2025 drinking water reports (plant ratings and flows) in data/peel-reports.json.
Facilities within 400 m that share a name are one site (a reservoir with its pumping station).
Usage: python3 scripts/build-water-facilities.py <data-raw dir> data/peel-reports.json data/dc-infra.json data/water-facilities.json
"""
import json, math, re, sys

raw, reports_p, infra_p, out_p = sys.argv[1:5]
def load(name): return json.load(open(f'{raw}/{name}.json'))

MP = 'https://peelregion.ca/sites/default/files/2024-07/ea-peel-2020-master-plan-volume-3.pdf'
# Volume 3, Tables 4-6 (pp. 26-28): pumping zone, pumps, installed, firm, actual firm capacity (ML/d;
# actual firm from the model, with friction losses; None = n/a). Zone codes: LLP / HLP = low- / high-lift
# pumps, number = pressure zone supplied, W / C / E = west / central / east transmission system.
PUMPS = {
    'Lorne Park WTP (low lift)': ('West', [('LL in plant', 10, 1041, 900, None)]),
    'Lorne Park': ('West', [('HLP1W', 7, 541, 450, 336), ('HLP2W', 2, 300, 150, 152)]),
    'Herridge': ('West', [('LLP2W', 8, 408, 340, 309), ('HLP3W', 4, 100, 68, 48)]),
    'Streetsville': ('West', [('LLP3W', 6, 379, 289, 250), ('HLP4W', 5, 272, 204, 179)]),
    'Battleford': ('West', [('4A', 4, 189, 142, None)]),
    'Meadowvale North': ('West', [('LLP4W', 6, 346, 276, 226), ('HLP5W', 6, 143, 116, 97)]),
    'West Brampton': ('West', [('LLP5W', 4, 90, 60, 40), ('HLP6W', 4, 93, 62, 93)]),
    'Alloa': ('West', [('LLP6W', 3, 126, 84, 80), ('HLP7W', 3, 45, 30, 27)]),
    'A.P. Kennedy WTP (low lift)': ('Central', [('LL in plant', 11, 1681, 1494, None)]),
    'A.P. Kennedy': ('Central', [('HLP1C', 5, 425, 335, 282), ('HLP2C', 7, 950, 800, 998)]),
    'Silverthorn': ('Central', [('LLP2C', 5, 495, 387, 192), ('HLP3C', 3, 103, 58, 58)]),
    'Hanlan': ('Central', [('LLP3C', 9, 1150, 1005, 1024), ('HLP4C', 4, 160, 103, 119)]),
    'Beckett Sproule': ('Central', [('LLP4C', 6, 390, 297, 195), ('HLP5C', 6, 255, 195, 176), ('Transfer (east)', 4, 408, 306, None)]),
    'East Brampton': ('Central', [('LLP5C', 4, 177, 117, 100), ('HLP6C', 4, 205, 140, 109)]),
    'North Brampton': ('Central', [('LLP6C', 4, 126, 90, 73), ('HLP7C', 4, 36, 26, 21)]),
    'Airport Road': ('East', [('York Region', 10, 458, 402, None), ('LLP4E', 4, 182, 126, 149), ('HLP5E', 4, 180, 135, 131)]),
    'Tullamore': ('East', [('LLP5E', 3, 90, 60, 48), ('HLP6E', 4, 160, 120, 120)]),
    'Bolton North Hill': ('East', [('6B', 3, 14, 9, None)]),
}
# Table 7 (p. 29): reservoir capacity (ML) and the storage zone it serves.
STORAGE = {'Lorne Park WTP': (23, 'WS1'), 'Herridge': (47, 'WS1'), 'Streetsville': (48, 'WS2'), 'Meadowvale North': (55, 'WS3'),
           'West Brampton': (40, 'WS4'), 'Alloa': (35, 'WS5'), 'Snelgrove': (4, 'WS6'), 'A.P. Kennedy WTP': (25, 'CS1'),
           'Silverthorn': (46, 'CS1'), 'Hanlan': (74, 'CS2'), 'Beckett Sproule': (93, 'CS3'), 'East Brampton': (39, 'CS4'),
           'North Brampton': (53, 'CS5'), 'Mayfield West': (9, 'CS7'), 'Airport Road': (54, 'ES3'), 'Tullamore': (48, 'ES4'),
           'Bolton (elevated tanks and standpipes)': (19, 'BS6')}
YEARS = [2019, 2021, 2026, 2031, 2036, 2041]
# Table 9 (p. 35): treatment capacity (90% of installed) and forecast maximum day demand, ML/d.
PLANT_ASSESS = {'A.P. Kennedy': {'capacity': [1080] * 6, 'demand': [695, 734, 822, 918, 960, 1003]},
                'Lorne Park': {'capacity': [450] * 6, 'demand': [294, 308, 337, 367, 390, 412]}}
# Table 11 (p. 39): pumping requirements short of the existing system capacity, ML/d.
PS_ASSESS = {'Lorne Park': ('Zone 2 high lift', [166, 180, 210, 227, 250, 274], [152] * 6),
             'West Brampton': [('Zone 5 low lift', [62, 62, 67, 99, 108, 116], [74] * 6), ('Zone 6 high lift', [52, 57, 77, 88, 99, 110], [87] * 6)],
             'Beckett Sproule': ('Transfer pumping', [300, 325, 387, 457, 469, 484], [275] * 6)}
# Table 12 (p. 40): storage required against available, ML.
ST_ASSESS = {'Silverthorn': ([31, 31, 43, 44, 46, 49], [46] * 6), 'West Brampton': ([31, 32, 34, 44, 46, 49], [40] * 6)}

def norm(s):
    s = s.upper().replace('LORNEPARK', 'LORNE PARK').replace('ARTHUR P.', 'A.P.').replace('A. P.', 'A.P.')
    s = re.sub(r'#\s*\d+|\bPLT\b\.?|\bPLANT\b|\bWATER\b|\bTREAT\.?\b|\bTREATMENT\b|\bWTP\b|\bWT\b|\bRES\b|\bRESERVOIR\b|\bET\b|\bELEVATED TANK\b|\bSTANDPIPE\b|\bBOOSTER\b|\bPUMPING\b|\bSTN\b|\bSTATION\b|\bBPS\b|\bRE-CHLORINATION\b|\bWELL\b|\d+', ' ', s)
    words = [w for w in re.sub(r'[^A-Z. ]', ' ', s).split() if w.strip('.')]
    return ' '.join(w if w == 'A.P.' else w.strip('.').title() for w in words)
KIND = {'CLRWEL': 'clearwell', 'ELEVTK': 'elevated_tank', 'RESERV': 'reservoir', 'STANDP': 'standpipe'}
pts = []
for x in load('waterPlants'): pts.append(('plant', x['p']['WTRTreatmentPlantDesc'], x['g']['coordinates']))
for x in load('waterPumpingStations'):
    d = x['p']['WTRPumpingStationDescription']
    pts.append(('rechlorination' if 'CHLORINATION' in d else 'well' if 'WELL' in d else 'booster', d, x['g']['coordinates']))
for x in load('waterStorage'): pts.append((KIND.get(x['p']['WaterStorageType'], 'storage'), x['p']['WaterStorageDesc'], x['g']['coordinates']))

def dist(a, b):
    if not a or not b: return 1e9
    return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians(a[1])), (a[1] - b[1]) * 111320)
sites = []
for kind, desc, c in pts:
    base = norm(desc)
    s = next((s for s in sites if s['base'] == base and dist(s['lnglat'], c) < 400), None)
    if not s:
        s = {'base': base, 'lnglat': [round(c[0], 6), round(c[1], 6)], 'parts': []}; sites.append(s)
    s['parts'].append({'kind': kind, 'desc': desc.strip()})

# Master Plan pumping stations co-located with a storage site of the same name, or at the DC map's facility.
infra = json.load(open(infra_p))
dcpos = {f['name']: f['g'] for f in infra['water']['facilities'] if f.get('g')}
def site_for(name, kinds=None):
    b = norm(name)
    cand = [s for s in sites if s['base'] == b]
    if not cand and name in dcpos:
        s = {'base': b, 'lnglat': dcpos[name], 'parts': [], 'posFrom': 'DC capital map'}; sites.append(s); return s
    return cand[0] if cand else None

for name, (system, rows) in PUMPS.items():
    key = name.replace(' (low lift)', '').replace(' WTP', '')
    s = site_for('Bolton North Booster' if key == 'Bolton North Hill' else 'Lorne Park WTP' if key == 'Lorne Park' and 'low lift' in name else key)
    if not s:
        s = {'base': norm(key), 'lnglat': None, 'parts': [], 'posFrom': 'location not published'}; sites.append(s)
    s['system'] = system
    s.setdefault('pumps', []).extend({'zone': z, 'pumps': n, 'installed': i, 'firm': f, 'actualFirm': a, 'station': name.replace(' (low lift)', ' low lift')} for z, n, i, f, a in rows)
for name, (ml, zone) in STORAGE.items():
    s = site_for('Bolton Et' if name.startswith('Bolton') else name.replace(' WTP', ''))
    if not s: print('no site for storage', name); continue
    s['storageML'] = ml; s['storageZone'] = zone
    s.setdefault('system', {'W': 'West', 'C': 'Central', 'E': 'East', 'B': 'East'}[zone[0]])
for k, v in PLANT_ASSESS.items(): (site_for(k) or {})['assess'] = {'what': 'Treatment (90% of installed) vs forecast maximum day, ML/d', 'years': YEARS, 'capacity': v['capacity'], 'demand': v['demand'], 'ref': 'Table 9, p. 35'}
for k, v in PS_ASSESS.items():
    s = site_for(k); rows = v if isinstance(v, list) else [v]
    s.setdefault('assessPumps', []).extend({'what': w, 'years': YEARS, 'demand': d, 'capacity': c, 'ref': 'Table 11, p. 39'} for w, d, c in rows)
for k, (req, av) in ST_ASSESS.items(): site_for(k)['assessStorage'] = {'years': YEARS, 'required': req, 'available': av, 'ref': 'Table 12, p. 40'}

# Plant ratings and 2025 flows (drinking water reports).
R = json.load(open(reports_p))['water']
for p in R['southPeel']['plants']:
    s = site_for(p['name'].replace(' WTP', '')); s['plant'] = {'ratedMLd': p['ratedMLd'], 'avgMLd': p['avgMLd'], 'maxDayMLd': p['maxDayMLd'], 'year': json.load(open(reports_p)).get('year', 2025), 'ref': p.get('pages')}
for sysn in R['caledon']:
    for s in sites:
        if any(w in sysn['name'] for w in s['base'].split()) and any(pp['kind'] == 'plant' for pp in s['parts']):
            s['groundwater'] = {'system': sysn['name'], 'ratedM3d': sysn['ratedM3d'], 'avgM3d': sysn['avgM3d'], 'maxDayM3d': sysn['maxDayM3d'], 'population': sysn['population']}
            s['system'] = 'Caledon groundwater'

ORDER = ['plant', 'clearwell', 'pumping', 'booster', 'reservoir', 'elevated_tank', 'standpipe', 'well', 'rechlorination']
out = []
for i, s in enumerate(sites):
    kinds = [p['kind'] for p in s['parts']] + (['pumping'] if s.get('pumps') and not any(k == 'plant' for k in [p['kind'] for p in s['parts']]) else [])
    main = min(kinds, key=lambda k: ORDER.index(k) if k in ORDER else 99)
    out.append({'id': f'wf{i + 1}', 'name': s['base'], 'kind': main, 'kinds': sorted(set(kinds), key=lambda k: ORDER.index(k) if k in ORDER else 99),
                'system': s.get('system') or ('East' if 'Bolton' in s['base'] else 'Caledon groundwater' if re.search(r'Alton|Caledon Village|Caledon East|Palgrave|Inglewood|Cheltenham|Mono Mills|Centreville', s['base']) else 'Lake-based'),
                'lnglat': s['lnglat'], 'parts': [p['desc'] for p in s['parts']], **{k: s[k] for k in ('pumps', 'storageML', 'storageZone', 'plant', 'groundwater', 'assess', 'assessPumps', 'assessStorage', 'posFrom') if k in s}})
out.sort(key=lambda f: (ORDER.index(f['kind']) if f['kind'] in ORDER else 99, f['name']))
doc = {'version': 1, 'sources': {
    'locations': 'Region of Peel open data, water_infrastructure FeatureServer (layers 1 storage, 2 treatment plants, 3 pumping stations)',
    'capacities': '2020 Water and Wastewater Master Plan for the Lake-Based Systems, Volume 3: Tables 4-7 (pp. 26-29), 9, 11, 12', 'mpUrl': MP,
    'plants': 'Region of Peel 2025 drinking water reports (data/peel-reports.json)'}, 'facilities': out}
json.dump(doc, open(out_p, 'w'), indent=1)
from collections import Counter
print(len(out), 'sites', Counter(f['kind'] for f in out), 'with pumps', sum(1 for f in out if f.get('pumps')), 'storage', sum(1 for f in out if f.get('storageML')))
for f in out: print(' ', f['id'], f['name'], f['kind'], f['system'], f.get('storageML'), len(f.get('pumps', [])), f['parts'])
