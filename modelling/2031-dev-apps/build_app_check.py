"""Bucket 3: check each development application against the app (Peel Growth Pipeline).

Runs app_match.js (the app's own developments, read-only), then builds a workbook of matches and
flags. Decision D12: the app only flags differences; no value is changed here.

Input:  everything build_areas.py uses, plus the app's data/ directory
Output: private/Bucket3_App_Check.xlsx

Usage:  python3 build_app_check.py
"""
import collections
import json
import math
import os
import subprocess
import sys
import tempfile

from openpyxl import Workbook
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import xlsx_style as X  # noqa: E402
from build_areas import PRIVATE, prepare, sheet_decisions  # noqa: E402

PPU_LOW, PPU_HIGH = 1.5, 4.0      # screening range for persons per unit (Region population / app units)
PPU_DOUBT = 8.0                   # a site match this far off is not trusted
SITE_DOUBT_POP = 500              # a site match with no app homes and at least this many people is not trusted
NONRES = ('industrial', 'commercial', 'office', 'warehouse', 'institutional', 'retail', 'f2:', 'f1:', 'e:', 'd:')
RES = ('residential', 'dwelling', 'townhouse', 'apartment', 'subdivision', 'detached', 'condominium', 'semi')
PHASES = ['inception', 'review', 'approved', 'permit', 'construction', 'completed', 'cancelled']
PHASE_LABEL = {'inception': 'Pre-application', 'review': 'In review', 'approved': 'Plan approved',
               'permit': 'Building permit', 'construction': 'Under construction', 'completed': 'Completed',
               'cancelled': 'Withdrawn / cancelled'}
HOW_LABEL = {'file': 'File number', 'site': 'Inside app site outline', 'address': 'Nearby, same address',
             'nearby': 'Nearby only', 'none': 'No match'}


def run_matcher(apps):
    with tempfile.TemporaryDirectory() as tmp:
        src, out = os.path.join(tmp, 'apps.json'), os.path.join(tmp, 'match.json')
        json.dump([{'id': a['id'], 'file': a.get('File_numbe') or '', 'lat': a['_lat'], 'lng': a['_lon'],
                    'streetnum': a.get('STREETNUM') or '', 'streetname': a.get('STREETNAME') or '',
                    'pop': a['Population']} for a in apps], open(src, 'w'))
        subprocess.run(['node', os.path.join(HERE, 'app_match.js'), src, out], check=True)
        return json.load(open(out))


def non_residential(m):
    types = ' '.join(m.get('types') or []).lower() + ' ' + ' '.join((f.get('type') or '') for f in m.get('files') or []).lower()
    return not (m.get('units') or 0) and any(k in types for k in NONRES) and not any(k in types for k in RES)


def assess(a, m):
    """Confidence, derived numbers and flags for one application. Flags that could take people out of
    the 2031 growth are only raised on High / Medium confidence matches."""
    how = m.get('how', 'none')
    units = m.get('units') or 0
    pop = a['Population']
    ppu = pop / units if units else None
    conf = {'file': 'High', 'site': 'Medium', 'address': 'Medium', 'nearby': 'Low', 'none': None}[how]
    doubt = []
    if how == 'site':
        expected_empty = m.get('phase') == 'cancelled'   # a cancelled development has no homes by definition
        if not units and pop >= SITE_DOUBT_POP and not expected_empty:
            doubt.append(f'app development has no homes counted but the Region file has {pop:,.0f} people')
        elif ppu and ppu > PPU_DOUBT:
            doubt.append(f'{ppu:.1f} people per app unit')
        if m.get('legacyOnly'):
            doubt.append('app development is made only of legacy files')
    if doubt:
        conf = 'Low'
    c = m.get('completion') or {}
    by2021 = c.get('dated_by_2021', 0) + c.get('issued_by_2020', 0)
    unsure = c.get('issued_2021', 0)
    after = c.get('dated_after_2021', 0) + c.get('issued_after_2021', 0)
    flags = []

    def flag(sev, check, detail):
        flags.append({'sev': sev, 'check': check, 'detail': detail})
    trusted = conf in ('High', 'Medium')
    if how == 'none':
        flag('Medium', 'Not found in the app', 'No app development matches this file number or location.')
    elif not trusted:
        flag('Medium', 'App match doubtful', f"Best guess {m.get('title')} ({HOW_LABEL[how]}); "
             + ('; '.join(doubt) if doubt else 'no address or file confirmation') + '. App evidence not used.')
    if trusted:
        if m.get('phase') == 'cancelled':
            flag('High', 'Withdrawn or cancelled in the app',
                 f"{m.get('title')}: every file is withdrawn, refused, cancelled or expired. This growth may not happen.")
        if non_residential(m):
            flag('High', 'App shows a non-residential development',
                 f"{m.get('title')} has no homes in the app ({', '.join((m.get('types') or [])[:3])}). If the Region "
                 'population is an employment equivalent this is expected; otherwise the population may be wrong.')
        if by2021 and (by2021 >= 0.5 * max(units, 1) or (m.get('phase') == 'completed' and not after)):
            flag('High', 'Probably in the 2021 existing population (D13)',
                 f'{by2021:,} app units built by the end of 2021 (completion date, or Brampton / Caledon permit '
                 'issued by 2020). Counting them as growth would double count.')
        elif by2021:
            flag('Medium', 'Partly built by 2021 (D13)',
                 f'{by2021:,} of {units:,} app units built by the end of 2021; {after:,} after.')
        elif m.get('phase') == 'completed' and not after and not unsure:
            flag('Medium', 'Completed in the app, date unknown',
                 'The app shows the development as completed but no permit gives a completion or issue date.')
        if unsure:
            flag('Low', 'Built around 2021 (check)', f'{unsure:,} units on permits issued in 2021; completion date unknown.')
        if ppu and not PPU_LOW <= ppu <= PPU_HIGH:
            flag('Medium', 'People per unit outside the usual range',
                 f'{pop:,.0f} people / {units:,} app units = {ppu:.1f} per unit (screening range {PPU_LOW}-{PPU_HIGH}). '
                 "The app's unit count may be incomplete, or the population may be off.")
    for n in m.get('notes') or []:
        flag('Low', 'File number points elsewhere', n + '.')
    return {'conf': conf, 'ppu': ppu, 'by2021': by2021, 'unsure': unsure, 'after': after, 'flags': flags,
            'doubt': '; '.join(doubt)}


def _newer_row(a, b):
    from build_areas import _newer
    return _newer(a, b)


def pair_evidence(cands, match, info):
    rows = []
    for v in cands:
        if not v['d11'].startswith('To app check'):
            continue
        a, b = v['a'], v['b']
        ma, mb = match[a['id']], match[b['id']]
        ca, cb = info[a['id']]['conf'], info[b['id']]['conf']
        same_file = (ma.get('how') == mb.get('how') == 'file' and ma.get('matchedRef') == mb.get('matchedRef'))
        same_dev = ma.get('key') and ma.get('key') == mb.get('key')
        units = ma.get('units') or 0
        newer = _newer_row(a, b)
        keep = f'keep {newer["id"]} (newer)' if newer else 'keep one (dates tied)'
        fits = lambda pop: units and PPU_LOW <= pop / units <= PPU_HIGH   # noqa: E731
        if 'Low' in (ca, cb) or None in (ca, cb):
            finding = 'App match too weak for one or both rows'
            suggest = 'Planning to decide without app evidence.'
        elif same_dev and non_residential(ma):
            finding = (f"Both rows are {'app file ' + ma['matchedRef'] if same_file else 'one app development'} "
                       f"({ma.get('title')}), which the app shows as non-residential")
            suggest = f'One development: {keep}. Also confirm whether it should carry population at all.'
        elif same_dev:
            what = f"app file {ma['matchedRef']}" if same_file else f"one app development ({ma.get('title')})"
            comb = (a['Population'] + b['Population']) / units if units else None
            finding = f'Both rows are {what}, {units:,} app units'
            if fits(a['Population']) and fits(b['Population']):
                suggest = (f"One development entered twice: each row alone fits the app's units "
                           f"({a['Population'] / units:.1f} and {b['Population'] / units:.1f} per unit); {keep}.")
            elif comb and PPU_LOW <= comb <= PPU_HIGH:
                suggest = f'Probably phases: only together do they fit the app units ({comb:.1f} per unit); keep both.'
            else:
                suggest = (f'Overlapping: together {comb:.1f} per app unit; Planning to choose the row that is current.'
                           if comb else 'The app has no unit count; Planning to decide.')
        else:
            finding = f"Different app developments: {ma.get('title')} / {mb.get('title')}"
            suggest = 'Probably separate developments: keep both.'
        rows.append({'v': v, 'finding': finding, 'suggest': suggest})
    return rows


def shared_developments(apps, match, info):
    groups = collections.defaultdict(list)
    for a in apps:
        m = match[a['id']]
        if m.get('key') and info[a['id']]['conf'] in ('High', 'Medium'):
            groups[m['key']].append(a)
    out = []
    for key, xs in groups.items():
        if len(xs) < 2:
            continue
        m = match[xs[0]['id']]
        inc = [x for x in xs if x['_include'] == 'Yes']
        pop = sum(x['Population'] for x in inc)
        units = m.get('units') or 0
        out.append({'title': m.get('title'), 'phase': m.get('phase'), 'units': units, 'rows': xs, 'inc_pop': pop,
                    'ppu': pop / units if units else None})
    return sorted(out, key=lambda g: -(g['ppu'] or 0))


# ---------------------------------------------------------------- sheets

def sheet_readme(ws, meta, counts, n):
    ws.title = 'README'
    ws.column_dimensions['A'].width = 30
    ws.column_dimensions['B'].width = 105
    ws['A1'] = 'Bucket 3: development applications checked against the app'
    ws['A1'].font = X.TITLE
    ws['A2'] = 'For review by Planning. The app only flags differences (decision D12): no value was changed.'
    ws['A2'].font = X.SUB
    rows = [
        ('App data', f"Peel Growth Pipeline, municipal open data as shown on {meta.get('appDataAt') or 'unknown'}. "
                     'Developments are built exactly as the app builds them (files on one site linked into one '
                     'development, each given a phase).'),
        ('How matched', 'File number: the Region file number translated to the municipality\'s numbering '
                        '(e.g. Brampton SP-21-266B = SPA-2021-0266, Mississauga OZ-22-005M = OZ/OPA 22-5) and within '
                        '1 km. Inside app site outline: the point falls inside an application\'s outline. Nearby: the '
                        'nearest development within 150 m. Brampton draft plan numbers (21T-...B) are not in the '
                        'open data, so those match by location.'),
        ('Confidence', 'High = file number. Medium = inside a site outline or nearby with the same address. Low = '
                       'nearby only, or a site match that does not fit (no homes in the app for a large population, '
                       f'or more than {PPU_DOUBT:g} people per app unit). Flags that could take people out of 2031 '
                       'growth are raised only on High and Medium matches.'),
        ('Built by 2021 (D13)', 'Provisional: the 2031 model starts from a 2021 existing population. Mississauga '
                                'permits give a completion date. Brampton and Caledon permits give only an issue date, '
                                'so a permit issued by 2020 is treated as built by 2021 and one issued in 2021 as '
                                '"check". Confirm the model\'s base date with Modelling.'),
        ('People per unit', f'Region population / app units, screened against {PPU_LOW}-{PPU_HIGH}. The app counts '
                            'units from municipal records and descriptions and can miss some, so a high figure is a '
                            'prompt to look, not proof.'),
        ('Result', f"{n} applications: " + ', '.join(f'{v} {k}' for k, v in counts.items()) + '.'),
        ('Sheets', 'Flags (one row per flag, yellow decision column), Matches (one row per application), Pair '
                   'Evidence (the duplicate pairs left open by D11), Shared Developments (several Region rows on '
                   'one app development), Phase Summary (population by app phase and area), Decisions.'),
    ]
    r = 4
    for k, v in rows:
        ws.cell(r, 1, k).font = X.BOLD
        c = ws.cell(r, 2, v)
        c.font, c.alignment = X.BASE, X.WRAP
        ws.row_dimensions[r].height = 15 * max(1, -(-len(v) // 100))
        r += 1


MATCH_COLS = [
    ('id', 'Row ID', 9, None), ('_area', 'Priority area', 20, None), ('_include', 'In 2031 total? (D11)', 10, None),
    ('File_numbe', 'Region file number', 18, None), ('Population', 'Region population', 11, '#,##0'),
    ('how', 'How matched', 18, None), ('conf', 'Confidence', 10, None), ('matchedRef', 'App file matched', 16, None),
    ('title', 'App development', 32, None), ('phase', 'App phase', 14, None), ('units', 'App units', 9, '#,##0'),
    ('ppu', 'People per app unit', 10, '0.0'), ('by2021', 'App units built by 2021', 10, '#,##0'),
    ('unsure', 'App units built in 2021 (check)', 10, '#,##0'), ('after', 'App units built after 2021', 10, '#,##0'),
    ('remaining', 'App units not yet built', 10, '#,##0'), ('milestones', 'App milestones', 34, None),
    ('files', 'App files on the development', 50, None), ('nflags', 'Flags', 7, '0'),
]


def sheet_matches(ws, apps, match, info):
    ws.title = 'Matches'
    X.header(ws, 1, [c[1] for c in MATCH_COLS], [c[2] for c in MATCH_COLS])
    for n, a in enumerate(apps, 2):
        m, i = match[a['id']], info[a['id']]
        bo = m.get('buildout') or {}
        vals = {
            'id': a['id'], '_area': a['_area'], '_include': a['_include'], 'File_numbe': a.get('File_numbe') or None,
            'Population': a['Population'], 'how': HOW_LABEL[m.get('how', 'none')], 'conf': i['conf'],
            'matchedRef': m.get('matchedRef'), 'title': m.get('title'),
            'phase': PHASE_LABEL.get(m.get('phase'), m.get('phase')), 'units': m.get('units'),
            'ppu': round(i['ppu'], 2) if i['ppu'] else None, 'by2021': i['by2021'] or None,
            'unsure': i['unsure'] or None, 'after': i['after'] or None, 'remaining': bo.get('remaining'),
            'milestones': '; '.join(f'{k} {v}' for k, v in (m.get('milestones') or {}).items()) or None,
            'files': '; '.join(f"{f['ref']} ({f['type']}, {f['status']})" for f in (m.get('files') or [])[:8]) or None,
            'nflags': f"=COUNTIF(Flags!$A:$A,A{n})",
        }
        for c, (k, _, _, fmt) in enumerate(MATCH_COLS, 1):
            cell = X.body(ws.cell(n, c, vals[k]), X.BOLD if k == 'id' else (X.BASE if k == 'nflags' else X.INPUT), fmt)
            if k == 'conf' and vals[k]:
                cell.fill = {'High': X.SEV_FILL['Low'], 'Medium': X.SEV_FILL['Medium'], 'Low': X.SEV_FILL['High']}[vals[k]]
    ws.freeze_panes = 'B2'
    ws.auto_filter.ref = f'A1:{get_column_letter(len(MATCH_COLS))}{len(apps) + 1}'
    return {k: get_column_letter(i) for i, (k, _, _, _) in enumerate(MATCH_COLS, 1)}


def sheet_flags(ws, apps, info):
    ws.title = 'Flags'
    cols = ['Row ID', 'Priority area', 'Region population', 'In 2031 total?', 'Severity', 'Check', 'Detail',
            'Reviewer decision', 'Reviewer comment']
    X.header(ws, 1, cols, [9, 20, 11, 10, 9, 30, 80, 24, 30])
    order = {'High': 0, 'Medium': 1, 'Low': 2}
    rows = [(a, f) for a in apps for f in info[a['id']]['flags']]
    rows.sort(key=lambda x: (order[x[1]['sev']], x[1]['check'], -x[0]['Population']))
    for n, (a, f) in enumerate(rows, 2):
        X.body(ws.cell(n, 1, a['id']), X.BOLD)
        X.body(ws.cell(n, 2, a['_area']))
        X.body(ws.cell(n, 3, a['Population']), fmt='#,##0')
        X.body(ws.cell(n, 4, a['_include']))
        X.body(ws.cell(n, 5, f['sev'])).fill = X.SEV_FILL[f['sev']]
        X.body(ws.cell(n, 6, f['check']), wrap=True)
        X.body(ws.cell(n, 7, f['detail']), wrap=True)
        for c in (8, 9):
            X.body(ws.cell(n, c), wrap=True).fill = X.REVIEW_FILL
        ws.row_dimensions[n].height = 15 * max(1, math.ceil(len(f['detail']) / 78))
    ws.freeze_panes = 'B2'
    ws.auto_filter.ref = f'A1:I{len(rows) + 1}'
    return rows


def sheet_pairs(ws, prs, match):
    ws.title = 'Pair Evidence'
    ws['A1'] = 'Duplicate pairs left open by decision D11, with what the app says'
    ws['A1'].font = X.TITLE
    ws['A2'] = 'Suggestions only. Planning decides in the yellow column.'
    ws['A2'].font = X.SUB
    cols = ['Row A', 'Population A', 'App match A', 'Row B', 'Population B', 'App match B', 'Why it was open',
            'What the app shows', 'Suggestion', 'Planning decision']
    X.header(ws, 4, cols, [9, 11, 36, 9, 11, 36, 26, 40, 40, 26])

    def desc(a):
        m = match[a['id']]
        return (f"{m.get('title')} ({HOW_LABEL[m.get('how', 'none')]}{', ' + m['matchedRef'] if m.get('matchedRef') else ''}; "
                f"{PHASE_LABEL.get(m.get('phase'), '-')}, {m.get('units') or 0:,} units)") if m.get('title') else 'No match'
    for n, p in enumerate(prs, 5):
        a, b = p['v']['a'], p['v']['b']
        vals = [a['id'], a['Population'], desc(a), b['id'], b['Population'], desc(b), p['v']['d11'].split(': ', 1)[-1],
                p['finding'], p['suggest'], None]
        for c, v in enumerate(vals, 1):
            cell = X.body(ws.cell(n, c, v), X.BOLD if c in (1, 4) else X.BASE, '#,##0' if c in (2, 5) else None,
                          wrap=c in (3, 6, 7, 8, 9))
            if c == 10:
                cell.fill = X.REVIEW_FILL
        ws.row_dimensions[n].height = 15 * max(2, math.ceil(max(len(vals[2]), len(vals[5]), len(p['suggest'])) / 36))
    ws.freeze_panes = 'A5'


def sheet_shared(ws, groups):
    ws.title = 'Shared Developments'
    ws['A1'] = 'Several Region rows on one app development'
    ws['A1'].font = X.TITLE
    ws['A2'] = (f'Rows in the 2031 total only. More than {PPU_HIGH:g} people per app unit suggests the rows overlap '
                '(a duplicate) or the app is missing units. High and Medium confidence matches only.')
    ws['A2'].font = X.SUB
    cols = ['App development', 'App phase', 'App units', 'Region rows', 'Rows in 2031 total', 'Population (in total)',
            'People per app unit', 'Check?', 'Planning decision']
    X.header(ws, 4, cols, [40, 16, 10, 34, 34, 13, 11, 9, 30])
    for n, g in enumerate(groups, 5):
        inc = [x['id'] for x in g['rows'] if x['_include'] == 'Yes']
        vals = [g['title'], PHASE_LABEL.get(g['phase'], g['phase']), g['units'] or None,
                ', '.join(x['id'] for x in g['rows']), ', '.join(inc), g['inc_pop'],
                round(g['ppu'], 2) if g['ppu'] else None,
                'Yes' if (g['ppu'] is None or g['ppu'] > PPU_HIGH) else 'No', None]
        for c, v in enumerate(vals, 1):
            cell = X.body(ws.cell(n, c, v), fmt={3: '#,##0', 6: '#,##0', 7: '0.0'}.get(c), wrap=c in (1, 4, 5))
            if c == 8 and v == 'Yes':
                cell.fill = X.SEV_FILL['Medium']
            if c == 9:
                cell.fill = X.REVIEW_FILL
    ws.freeze_panes = 'A5'


def sheet_phases(ws, labels, mcol, n_apps):
    ws.title = 'Phase Summary'
    ws['A1'] = 'Population in the 2031 total, by priority area and app phase'
    ws['A1'].font = X.TITLE
    ws['A2'] = ('Formulas on the Matches sheet; only rows in the 2031 total (D11) and High / Medium confidence '
                'matches count by phase. Evidence for the share built by 2031 (Bucket 4).')
    ws['A2'].font = X.SUB
    phase_cols = [PHASE_LABEL[p] for p in PHASES]
    cols = ['Priority area'] + phase_cols + ['No or doubtful match', 'Total']
    X.header(ws, 4, cols, [22] + [12] * (len(cols) - 1))
    rng = lambda c: f'Matches!${mcol[c]}$2:${mcol[c]}${n_apps + 1}'   # noqa: E731
    first = 5
    for i, lab in enumerate(sorted(labels, key=lambda r: r['map_order'])):
        r = first + i
        X.body(ws.cell(r, 1, lab['area_name']), X.BOLD)
        for j, ph in enumerate(phase_cols, 2):
            f = (f'=SUMIFS({rng("Population")},{rng("_area")},$A{r},{rng("_include")},"Yes",{rng("phase")},"{ph}",'
                 f'{rng("conf")},"High")+SUMIFS({rng("Population")},{rng("_area")},$A{r},{rng("_include")},"Yes",'
                 f'{rng("phase")},"{ph}",{rng("conf")},"Medium")')
            X.body(ws.cell(r, j, f), fmt='#,##0;-#,##0;-')
        k = len(phase_cols) + 2
        last_ph = get_column_letter(k - 1)
        X.body(ws.cell(r, k + 1, f'=SUMIFS({rng("Population")},{rng("_area")},$A{r},{rng("_include")},"Yes")'),
               X.BOLD, '#,##0')
        X.body(ws.cell(r, k, f'={get_column_letter(k + 1)}{r}-SUM(B{r}:{last_ph}{r})'), fmt='#,##0;-#,##0;-')
    last = first + len(labels) - 1
    t = last + 1
    X.body(ws.cell(t, 1, 'Total'), X.BOLD)
    for c in range(2, len(cols) + 1):
        L = get_column_letter(c)
        X.body(ws.cell(t, c, f'=SUM({L}{first}:{L}{last})'), X.BOLD, '#,##0;-#,##0;-').fill = X.TOTAL_FILL
    t2 = t + 1
    X.body(ws.cell(t2, 1, 'Share of total'), X.BOLD)
    for c in range(2, len(cols) + 1):
        L = get_column_letter(c)
        X.body(ws.cell(t2, c, f'={L}{t}/${get_column_letter(len(cols))}${t}'), fmt='0%')
    ws.freeze_panes = 'B5'


def main():
    st = prepare()
    apps = st['apps']
    res = run_matcher(apps)
    match = {r['id']: r for r in res['results']}
    info = {a['id']: assess(a, match[a['id']]) for a in apps}
    prs = pair_evidence(st['cands'], match, info)
    groups = shared_developments(apps, match, info)
    counts = collections.Counter(info[a['id']]['conf'] or 'no match' for a in apps)
    counts = {f'{k} confidence' if k != 'no match' else k: v for k, v in sorted(counts.items())}

    wb = Workbook()
    sheet_readme(wb.active, res, counts, len(apps))
    ws_flags = wb.create_sheet()
    mcol = sheet_matches(wb.create_sheet(), apps, match, info)
    rows = sheet_flags(ws_flags, apps, info)
    sheet_pairs(wb.create_sheet(), prs, match)
    sheet_shared(wb.create_sheet(), groups)
    sheet_phases(wb.create_sheet(), st['labels'], mcol, len(apps))
    sheet_decisions(wb.create_sheet(), st['decisions'])
    wb.move_sheet('Flags', offset=-(len(wb.sheetnames) - 2))
    for ws in wb.worksheets:
        X.print_fit(ws)
    out = os.path.join(PRIVATE, 'Bucket3_App_Check.xlsx')
    wb.save(out)
    sev = collections.Counter(f['sev'] for _, f in rows)
    print(f"wrote {out}: {counts}; flags High {sev['High']}, Medium {sev['Medium']}, Low {sev['Low']}; "
          f"{len(prs)} pairs; {len(groups)} shared developments")


if __name__ == '__main__':
    main()
