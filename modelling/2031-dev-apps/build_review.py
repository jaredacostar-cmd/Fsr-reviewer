"""Bucket 5: the single review workbook for Planning.

Brings Buckets 1-4 together: a cover (goal, totals from map labels to 2031 population, the key
levers, sign-off), the live assumptions and applications from Bucket 4, the area summary and top
rows, every open flag from Buckets 1-3 in one list, the points by area, and the decisions log.
The detailed Bucket 1-3 workbooks remain the supporting evidence.

Output: private/Planning_Review_2031.xlsx

Usage:  python3 build_review.py
"""
import collections
import datetime as dt
import os
import re
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment
from openpyxl.worksheet.datavalidation import DataValidation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import xlsx_style as X  # noqa: E402
from build_app_check import (PPU_HIGH, assess, non_residential, pair_evidence, run_matcher,  # noqa: E402
                             shared_developments)
from build_areas import PRIVATE, prepare, sheet_decisions  # noqa: E402
from build_assumptions import (load_stated, sheet_applications, sheet_assumptions, sheet_summary,  # noqa: E402
                               sheet_top)
from build_map_areas import write_points_by_area  # noqa: E402

SKIP_CHECKS = {'Employment equivalent (D15)'}     # decided at checkpoint 3: information only
PPU_EXTREME = (1.0, 6.0)                          # D25: only these people-per-unit flags reach Planning
PPU_CHECK = 'People per unit outside the usual range'


def label_uses_population(st, a):
    """True when the row alone makes up its map label, which then confirms the Population field."""
    lab = next((x for x in st['labels'] if x['area_name'] == a['_area']), None)
    return bool(lab) and lab['population'] == a['Population']


def open_flags(st, match, info):
    """Every flag still open for Planning, from Buckets 1-3 (rows in the 2031 total only)."""
    apps = st['apps']
    inc = [a for a in apps if a['_include'] == 'Yes']
    out = []

    def add(src, sev, rows, check, detail):
        out.append({'src': src, 'sev': sev, 'rows': rows, 'check': check, 'detail': detail})
    # Bucket 3: per row
    for a in inc:
        ppu = info[a['id']]['ppu']
        for f in info[a['id']]['flags']:
            if f['check'] == PPU_CHECK and ppu and PPU_EXTREME[0] <= ppu <= PPU_EXTREME[1]:
                continue
            if f['check'] not in SKIP_CHECKS:
                add('3 App check', f['sev'], [a], f['check'], f['detail'])
    # Bucket 3: open pairs (D17)
    for p in pair_evidence(st['cands'], match, info):
        a, b = p['v']['a'], p['v']['b']
        if a['_include'] == 'Yes' and b['_include'] == 'Yes':
            add('3 App check', 'Medium', [a, b], 'Possible duplicate pair (D17)',
                f"{p['finding']}. {p['suggest']} Both rows stay in the total until Planning decides.")
    # Bucket 3: several rows on one development
    for g in shared_developments(apps, match, info):
        rows = [x for x in g['rows'] if x['_include'] == 'Yes']
        if len(rows) > 1 and g['ppu'] and g['ppu'] > PPU_HIGH and not non_residential(match[rows[0]['id']]):
            add('3 App check', 'Medium', rows, 'Several rows on one app development (D17)',
                f"{g['title']}: {g['inc_pop']:,.0f} people on {g['units']:,} app units = {g['ppu']:.1f} per unit. "
                'The rows may overlap, or the app may be missing units.')
    # Bucket 1: population fields, identical populations
    for a in inc:
        p1 = a.get('Populati_1') or 0
        if p1 and p1 != a['Population'] and not label_uses_population(st, a):
            add('1 Inventory', 'Medium', [a], 'Two population fields disagree',
                f"Population {a['Population']:,.0f} is used (D08); the file's second population field says {p1:,.0f}.")
    by_pop = collections.defaultdict(list)
    for a in inc:
        if a['Population'] >= 1000:
            by_pop[a['Population']].append(a)
    for pop, xs in by_pop.items():
        if len(xs) > 1 and len({x['_area'] for x in xs}) > 1:
            add('1 Inventory', 'Medium', xs, 'Same population at different sites',
                f"{', '.join(x['id'] for x in xs)} each have exactly {pop:,.0f} people at different sites; "
                'possibly a copy-paste error.')
    # Bucket 2: assignment and municipality
    for a in inc:
        if a['_method'] != 'Inside box':
            add('2 Areas', 'Low', [a], 'Assigned to the nearest area', f"{a['_method']}; assigned to {a['_area']}.")
        if 'boundary' in a['_muni_note'] or a['_muni_note'].startswith('Disagrees'):
            add('2 Areas', 'Low', [a], 'Municipality near a boundary', a['_muni_note'] + '.')
    order = {'High': 0, 'Medium': 1, 'Low': 2}
    out.sort(key=lambda f: (order[f['sev']], f['src'], -sum(x['Population'] for x in f['rows'])))
    for n, f in enumerate(out, 1):
        f['id'] = f'F-{n:03d}'
    return out


def sheet_flags(ws, flags, L, n_apps):
    ws.title = 'Open Flags'
    ws['A1'] = 'Open flags for Planning'
    ws['A1'].font = X.TITLE
    ws['A2'] = ('Rows in the 2031 total only. Record a decision in the yellow columns; if it changes a number, '
                'use the Planning override share on the Applications sheet (or note it here for the next rebuild).')
    ws['A2'].font = X.SUB
    cols = ['Flag', 'From bucket', 'Severity', 'Rows', 'Priority area', 'Full population', '2031 population',
            'Check', 'Detail', 'Planning decision', 'Comment']
    X.header(ws, 4, cols, [7, 12, 9, 20, 18, 11, 11, 28, 70, 22, 28])
    P = f'Applications!${L["p2031"]}$2:${L["p2031"]}${n_apps + 1}'
    ID = f'Applications!$A$2:$A${n_apps + 1}'
    dv = DataValidation(type='list', formula1='"Accept as is,Change (see comment),Exclude,Needs more information"',
                        allow_blank=True)
    ws.add_data_validation(dv)
    for n, f in enumerate(flags, 5):
        ids = [x['id'] for x in f['rows']]
        vals = [f['id'], f['src'], f['sev'], ', '.join(ids), ' / '.join(sorted({x['_area'] for x in f['rows']})),
                sum(x['Population'] for x in f['rows']),
                '=' + '+'.join(f'INDEX({P},MATCH("{i}",{ID},0))' for i in ids), f['check'], f['detail'], None, None]
        for c, v in enumerate(vals, 1):
            cell = X.body(ws.cell(n, c, v), X.BOLD if c == 1 else X.BASE, '#,##0' if c in (6, 7) else None,
                          wrap=c in (4, 5, 8, 9, 11))
            if c == 3:
                cell.fill = X.SEV_FILL[f['sev']]
            if c in (10, 11):
                cell.fill = X.REVIEW_FILL
        dv.add(f'J{n}')
        ws.row_dimensions[n].height = 15 * max(1, -(-len(f['detail']) // 68), -(-len(vals[3]) // 18))
    ws.freeze_panes = 'B5'
    ws.auto_filter.ref = f'A4:K{len(flags) + 4}'
    return len(flags)


def default_areas(st, info, n=4):
    """The areas with the most full population on rows without a trusted app match."""
    tot = collections.Counter()
    for a in st['apps']:
        if a['_include'] == 'Yes' and info[a['id']]['conf'] not in ('High', 'Medium'):
            tot[a['_area']] += a['Population']
    return [k for k, _ in tot.most_common(n)]


def sheet_cover(ws, st, L, n_apps, R, n_flags, info):
    ws.title = 'Cover'
    ws.column_dimensions['A'].width = 46
    ws.column_dimensions['B'].width = 18
    ws.column_dimensions['C'].width = 70
    ws['A1'] = '2031 development application population: Planning review'
    ws['A1'].font = X.TITLE
    ws['A2'] = (f"Scenario 1, 2031. DRAFT for Planning review, built {dt.date.today().isoformat()}. "
                'Not for Modelling until signed off below.')
    ws['A2'].font = X.SUB

    def section(r, title):
        c = ws.cell(r, 1, title)
        c.font, c.fill = X.HEAD_FONT, X.HEAD_FILL
        for k in (2, 3):
            ws.cell(r, k).fill = X.HEAD_FILL
        return r + 1

    def line(r, label, value, note=None, fmt='#,##0', font=None):
        X.body(ws.cell(r, 1, label), X.BOLD if font is X.BOLD else X.BASE)
        X.body(ws.cell(r, 2, value), font or X.BASE, fmt)
        X.body(ws.cell(r, 3, note), X.SUB if note else X.BASE, wrap=True)
        return r + 1

    r = section(4, 'Purpose')
    for k, v in [('Core decision', 'Which development-charge-funded water and wastewater linear projects get capital '
                                   'funding for 2031 (D01).'),
                 ('What this workbook does', 'States, for each development application behind map 4507-WW (Scenario 1 '
                                             '2031), the units, density and share built by 2031, and the resulting 2031 '
                                             'population that goes to Modelling (D02).'),
                 ('What Planning is asked to do', 'Check the assumptions (yellow cells on Assumptions), the largest rows '
                                                  '(Top Rows) and the open flags (Open Flags), then sign off below.')]:
        X.body(ws.cell(r, 1, k), X.BOLD)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
        c = X.body(ws.cell(r, 2, v), wrap=True)
        c.alignment = Alignment(wrap_text=True, vertical='top')
        ws.row_dimensions[r].height = 30
        r += 1

    pop = f'Applications!${L["pop"]}$2:${L["pop"]}${n_apps + 1}'
    inc = f'Applications!${L["inc"]}$2:${L["inc"]}${n_apps + 1}'
    map_total = sum(x['population'] for x in st['labels'])
    r = section(r + 1, 'From the map to the 2031 population')
    r0 = r
    r = line(r, 'Map labels, 19 priority areas', map_total, 'Map 4507-WW (2026-05-20).', font=X.INPUT)
    dec_area = [d for d in st['decisions'] if d.get('area')]
    r = line(r, 'less: map labels above their applications', f'=B{r0}-SUM({pop})',
             ('Mostly ' + '; '.join(f"{d['area']} ({d['id']}: application value used)" for d in dec_area) + '.')
             if dec_area else 'Map labels compared with the sum of their applications (Bucket 2).')
    r = line(r, 'less: duplicate applications removed', f'=SUMIFS({pop},{inc},"No")',
             'Older or repeated rows of one development (D11, D16).')
    r = line(r, 'Full population of the applications kept', "='Area Summary'!C24", 'Full build-out.', font=X.BOLD)
    r = line(r, 'less: not built by 2031', "='Area Summary'!C24-'Area Summary'!F24",
             'Share built by 2031 and the build-out speed limit (Assumptions).')
    r = line(r, '2031 population for Modelling', "='Area Summary'!F24", 'Changes live with the assumptions.', font=X.BOLD)
    ws.cell(r - 1, 2).fill = X.TOTAL_FILL
    r = line(r, 'Share of full population built by 2031', "='Area Summary'!E24", None, '0%')

    lim_row = int(re.sub(r'\D', '', R.lim_on))
    r = section(r + 1, 'Levers that move the total most (edit on Assumptions)')
    r = line(r, 'Build-out speed limit applied?', f'=Assumptions!{R.lim_on}', 'D23, per development (D24).', None)
    r = line(r, 'Units per year, per development', f'=Assumptions!$B${lim_row + 1}', 'Placeholder.')
    r = line(r, 'Area default share (lowest / highest)',
             f'=TEXT(MIN(Assumptions!{R.area_share}),"0%")&" / "&TEXT(MAX(Assumptions!{R.area_share}),"0%")',
             'Used for rows the app cannot confirm (D22). Placeholder 25%.', None)
    r = line(r, '2031 population resting on the area default', "='Area Summary'!I24",
             'Set these first. Largest areas without app evidence: ' + ', '.join(default_areas(st, info)) + '.')

    r = section(r + 1, 'Open flags')
    for sev in ('High', 'Medium', 'Low'):
        r = line(r, f'{sev} flags without a Planning decision',
                 f"=COUNTIFS('Open Flags'!$C$5:$C${n_flags + 4},\"{sev}\",'Open Flags'!$J$5:$J${n_flags + 4},\"\")",
                 None, '0')

    r = section(r + 1, 'Sign-off')
    dv = DataValidation(type='list', formula1='"Approved,Approved with changes,Not approved"', allow_blank=True)
    ws.add_data_validation(dv)
    for lab in ['Reviewed by (Planning)', 'Role', 'Date', 'Decision', 'Conditions / comments',
                'Sent to Modelling by', 'Date sent']:
        X.body(ws.cell(r, 1, lab), X.BOLD)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
        X.body(ws.cell(r, 2)).fill = X.REVIEW_FILL
        if lab == 'Decision':
            dv.add(f'B{r}')
        if lab.startswith('Conditions'):
            ws.row_dimensions[r].height = 45
        r += 1
    r = section(r + 1, 'Sheets')
    for k, v in [('Area Summary', 'Full and 2031 population by priority area.'),
                 ('Top Rows', 'The applications adding the most 2031 population (live).'),
                 ('Open Flags', 'Every open question from the inventory, area and app checks.'),
                 ('Assumptions', 'All the assumptions (yellow).'),
                 ('Applications', 'One row per application: units, density, share built by 2031, 2031 population.'),
                 ('Points by Area', 'The applications in each priority area, one block of columns per area.'),
                 ('Decisions', 'Every decision taken so far (D01 onwards).'),
                 ('Supporting files', 'Bucket1_Inventory, Bucket2_Areas (with check map), Bucket3_App_Check, '
                                      'Map_Areas_2031.')]:
        X.body(ws.cell(r, 1, k), X.BOLD)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
        X.body(ws.cell(r, 2, v), wrap=True)
        r += 1


def main():
    st = prepare()
    apps = st['apps']
    res = run_matcher(apps)
    match = {r['id']: r for r in res['results']}
    info = {a['id']: assess(a, match[a['id']]) for a in apps}
    stated = load_stated(os.path.join(PRIVATE, 'stated_units.csv'))
    flags = open_flags(st, match, info)

    wb = Workbook()
    ws_cover = wb.active
    ws_sum, ws_top, ws_flags = wb.create_sheet(), wb.create_sheet(), wb.create_sheet()
    R = sheet_assumptions(wb.create_sheet(), st['labels'])
    L = sheet_applications(wb.create_sheet(), apps, match, info, stated, R)
    sheet_summary(ws_sum, st['labels'], L, len(apps))
    sheet_top(ws_top, L, len(apps))
    n_flags = sheet_flags(ws_flags, flags, L, len(apps))
    write_points_by_area(wb.create_sheet(), st['labels'])
    sheet_decisions(wb.create_sheet(), st['decisions'])
    sheet_cover(ws_cover, st, L, len(apps), R, n_flags, info)
    for ws in wb.worksheets:
        X.print_fit(ws)
    out = os.path.join(PRIVATE, 'Planning_Review_2031.xlsx')
    wb.save(out)
    sev = collections.Counter(f['sev'] for f in flags)
    print(f"wrote {out}: {n_flags} open flags (High {sev['High']}, Medium {sev['Medium']}, Low {sev['Low']})")


if __name__ == '__main__':
    main()
