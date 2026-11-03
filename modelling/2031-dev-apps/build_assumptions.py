"""Bucket 4: units, density and share built by 2031 for each application, and the 2031 population.

Every assumption is an editable (yellow) cell on the Assumptions sheet or a per-row override; the
application rows and the area summary are live formulas, so Planning can change an assumption and
see the 2031 population move. 2031 population = full population x share built by 2031 (D02).

Input:  everything build_app_check.py uses, plus private/stated_units.csv (unit totals stated in
        the Region's own file text)
Output: private/Bucket4_Assumptions.xlsx

Usage:  python3 build_assumptions.py
"""
import csv
import math
import os
import sys

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import xlsx_style as X  # noqa: E402
from build_app_check import PHASE_LABEL, assess, non_residential, run_matcher  # noqa: E402
from build_areas import PRIVATE, prepare, sheet_decisions  # noqa: E402

# Starting values (decisions D19-D23). Planning edits them on the Assumptions sheet.
DENSITY_CLASSES = [('Low', 0, 3.4), ('Medium', 100, 2.8), ('High', 300, 1.9)]   # from persons/ha, people per unit
PHASE_SHARE = [('Pre-application', 0.15), ('In review', 0.40), ('Plan approved', 0.75), ('Building permit', 1.0),
               ('Under construction', 1.0), ('Completed', 1.0), ('Withdrawn / cancelled', 0.0)]
AREA_DEFAULT = 1.0          # D27: today's assumption, every application population is the 2031 figure
LIMIT_ON, LIMIT_RATE, LIMIT_FROM, LIMIT_TO = 'No', 300, 2026, 2031
WITHDRAWN = 'Withdrawn / cancelled'

# Two uses of the same sheets. 'planning' (default, D27): every area starts at today's assumption and
# Planning gives its estimate. 'app' (proof of concept, build_app_estimate.py): the app's own estimate,
# from the stage of each development in the app and the build-out speed limit; rows the app cannot
# confirm keep today's figure.
MODE = {'name': 'planning'}


def set_mode(name):
    MODE['name'] = name


def app_mode():
    return MODE['name'] == 'app'
TOP_N = 15


class Refs:
    """Cell addresses on the Assumptions sheet, for the formulas."""


def sheet_assumptions(ws, labels):
    ws.title = 'Assumptions'
    for c, w in zip('ABCD', [34, 16, 16, 70]):
        ws.column_dimensions[c].width = w
    ws['A1'] = 'Assumptions for 2031 (edit the yellow cells)'
    ws['A1'].font = X.TITLE
    ws['A2'] = ('Starting values are placeholders agreed at checkpoint 4 (D19-D23) for Planning to replace. '
                'Every number on the Applications and Area Summary sheets recalculates from these cells.')
    ws['A2'].font = X.SUB
    R = Refs()

    def yellow(cell, fmt=None):
        cell.fill = X.REVIEW_FILL
        cell.font = X.INPUT
        cell.border = X.BOX
        if fmt:
            cell.number_format = fmt
        return cell

    # A. people per unit
    X.header(ws, 4, ['A. People per unit by density', 'From (persons/ha)', 'People per unit', 'Note'])
    for i, (name, start, ppu) in enumerate(DENSITY_CLASSES):
        r = 5 + i
        X.body(ws.cell(r, 1, name), X.BOLD)
        yellow(ws.cell(r, 2, start), '#,##0')
        yellow(ws.cell(r, 3, ppu), '0.00')
        X.body(ws.cell(r, 4, 'Placeholder (D19). A row is in the class whose "from" density it reaches.'), wrap=True)
    R.cls = '$A$5:$A$7'
    R.cls_from = {'Medium': '$B$6', 'High': '$B$7'}
    R.ppu = '$C$5:$C$7'
    X.body(ws.cell(8, 4, 'Rows with an employment equivalent (D15) get no units; rows whose Region text states a unit '
                         'total use that total.'), wrap=True)

    # B. share by app phase
    X.header(ws, 10, ['B. Share built by 2031, by the stage of the development in the app' if app_mode() else
                      'B. Reference only: share suggested by the app stage', 'Share', '', 'Note'])
    for i, (ph, share) in enumerate(PHASE_SHARE):
        r = 11 + i
        X.body(ws.cell(r, 1, ph), X.BOLD)
        if app_mode():
            yellow(ws.cell(r, 2, share), '0%')
        else:
            X.body(ws.cell(r, 2, share), X.INPUT, '0%')
        note = ('Applied: withdrawn rows stay visible but add nothing (D21).' if ph.startswith('Withdrawn') else
                'Applied where the app match is High or Medium confidence.' if app_mode() else
                'Not applied (D27). Shown beside each application as a hint for Planning\'s estimate.')
        X.body(ws.cell(r, 4, note), wrap=True)
    R.ph = f'$A$11:$A${10 + len(PHASE_SHARE)}'
    R.ph_share = f'$B$11:$B${10 + len(PHASE_SHARE)}'

    # C. build-out speed limit
    r0 = 12 + len(PHASE_SHARE)
    X.header(ws, r0, ['C. Build-out speed limit', 'Value', '', 'Note'])
    items = [('Apply the limit? (Yes / No)', 'Yes' if app_mode() else LIMIT_ON, None,
              'On for the app estimate.' if app_mode() else 'Off (D27). Planning may switch it on.'),
             ('Units per year, per development', LIMIT_RATE, '#,##0', 'Used only if the limit is on.'),
             ('Building from (end of year)', LIMIT_FROM, '0', 'Today is late 2026.'),
             ('Building to (end of year)', LIMIT_TO, '0', 'Scenario 1 horizon.')]
    for i, (lab, val, fmt, note) in enumerate(items):
        r = r0 + 1 + i
        X.body(ws.cell(r, 1, lab))
        yellow(ws.cell(r, 2, val), fmt)
        X.body(ws.cell(r, 4, note), wrap=True)
    R.lim_on = f'$B${r0 + 1}'
    r = r0 + 5
    X.body(ws.cell(r, 1, 'Years of building'))
    X.body(ws.cell(r, 2, f'=$B${r0 + 4}-$B${r0 + 3}'), fmt='0')
    X.body(ws.cell(r + 1, 1, 'Most units one development can add by 2031'), X.BOLD)
    X.body(ws.cell(r + 1, 2, f'=$B${r0 + 2}*$B${r}'), X.BOLD, '#,##0')
    R.lim_units = f'$B${r + 1}'
    dv = DataValidation(type='list', formula1='"Yes,No"', allow_blank=False)
    ws.add_data_validation(dv)
    dv.add(R.lim_on.replace('$', ''))

    # D. area default share
    r1 = r + 3
    X.header(ws, r1, ['D. Rows the app cannot confirm: share built by 2031' if app_mode() else
                      "D. Planning's estimate: share of each area's population built by 2031", 'Share', '', 'Note'])
    for i, lab in enumerate(sorted(labels, key=lambda x: x['map_order'])):
        rr = r1 + 1 + i
        X.body(ws.cell(rr, 1, lab['area_name']), X.BOLD)
        yellow(ws.cell(rr, 2, AREA_DEFAULT), '0%')
        X.body(ws.cell(rr, 4, "100% = today's figure: the app has no evidence to change it." if app_mode() else
                   "100% = today's assumption (all application populations are 2031). Replace with Planning's estimate."))
    R.area = f'$A${r1 + 1}:$A${r1 + len(labels)}'
    R.area_share = f'$B${r1 + 1}:$B${r1 + len(labels)}'

    # E. servicing limits by 2031 (applied after the share and the speed limit)
    r2 = r1 + len(labels) + 2
    limits = {} if app_mode() else load_limits()
    X.header(ws, r2, ['E. Servicing limit by 2031 (blank = none)', 'Limit (units)', 'Limit (people)', 'Source',
                      'Units by 2031 before limit', 'People by 2031 before limit', 'Factor applied'])
    for col, w in zip('EFG', [13, 13, 10]):
        ws.column_dimensions[col].width = w
    for i, lab in enumerate(sorted(labels, key=lambda x: x['map_order'])):
        rr = r2 + 1 + i
        lim = limits.get(lab['area_name'], {})
        X.body(ws.cell(rr, 1, lab['area_name']), X.BOLD)
        yellow(ws.cell(rr, 2, lim.get('units')), '#,##0')
        yellow(ws.cell(rr, 3, lim.get('people')), '#,##0')
        X.body(ws.cell(rr, 4, lim.get('source') or ('Not applied in the app estimate.' if app_mode() else None)),
               wrap=True)
    R.svc_first, R.svc_last = r2 + 1, r2 + len(labels)
    R.svc_area = f'$A${R.svc_first}:$A${R.svc_last}'
    R.svc_factor = f'$G${R.svc_first}:$G${R.svc_last}'
    R.ws = ws
    ws.freeze_panes = 'A4'
    return R


def load_limits():
    path = os.path.join(PRIVATE, 'servicing_limits.csv')
    out = {}
    if os.path.exists(path):
        for r in csv.DictReader(open(path, newline='', encoding='utf-8')):
            out[r['area']] = {'units': int(r['units']) if r['units'] else None,
                              'people': int(r['people']) if r['people'] else None, 'source': r['source']}
    return out


def fill_limits(R, L, n_apps):
    """Formulas for table E, once the Applications columns are known."""
    ws = R.ws
    rng = lambda k: f'Applications!${L[k]}$2:${L[k]}${n_apps + 1}'   # noqa: E731
    for r in range(R.svc_first, R.svc_last + 1):
        X.body(ws.cell(r, 5, f'=SUMIFS({rng("u_pre2")},{rng("area")},$A{r})'), fmt='#,##0')
        X.body(ws.cell(r, 6, f'=SUMIFS({rng("p_pre")},{rng("area")},$A{r})'), fmt='#,##0')
        X.body(ws.cell(r, 7, f'=MIN(1,IF(B{r}<>"",IF(E{r}>0,B{r}/E{r},1),1),IF(C{r}<>"",IF(F{r}>0,C{r}/F{r},1),1))'),
               X.BOLD, '0%')


COLS = [  # key, header, width, format
    ('id', 'Row ID', 9, None), ('area', 'Priority area', 20, None), ('inc', 'In 2031 total?', 9, None),
    ('cat', 'Application category', 22, None), ('file', 'File number', 16, None),
    ('pop', 'Full population', 11, '#,##0'), ('ha', 'Area (ha)', 9, '#,##0.00'),
    ('emp', 'Employment equivalent? (D15)', 11, None),
    ('pph', 'People per ha', 9, '#,##0'), ('cls', 'Density class', 10, None),
    ('stated', 'Units stated in Region text', 10, '#,##0'), ('ppu', 'People per unit used', 9, '0.00'),
    ('units', 'Units', 9, '#,##0'), ('uph', 'Units per ha', 9, '#,##0.0'),
    ('app_units', 'App units (check only)', 9, '#,##0'),
    ('conf', 'App match confidence', 10, None), ('phase', 'App phase (trusted matches)', 15, None),
    ('ph_share', 'Reference: share suggested by app stage (not applied)', 11, '0%'),
    ('ar_share', "Planning's area estimate", 9, '0%'),
    ('override', 'Planning override share', 10, '0%'), ('src', 'Share source', 15, None),
    ('share', 'Share before limit', 9, '0%'), ('dev', 'Development (for the speed limit)', 14, None),
    ('u_pre', 'Units by 2031 before limit', 9, '#,##0'), ('dev_pre', 'Development units by 2031 before limit', 11, '#,##0'),
    ('limited', 'Speed limit applies?', 9, None),
    ('final', 'Share after speed limit', 9, '0%'),
    ('p_pre', 'Population by 2031 before servicing limit', 11, '#,##0'),
    ('u_pre2', 'Units by 2031 before servicing limit', 10, '#,##0'),
    ('svc', 'Servicing limit factor (Assumptions E)', 10, '0%'),
    ('share_out', 'Share built by 2031', 9, '0%'), ('u2031', 'Units by 2031', 9, '#,##0'),
    ('p2031', '2031 population', 11, '#,##0'), ('note', 'Note', 50, None), ('rank', 'rank key', 6, None),
]


def sheet_applications(ws, apps, match, info, stated, R):
    ws.title = 'Applications'
    app_heads = {'ph_share': 'Share from app stage', 'ar_share': 'Share where the app has no evidence'}
    X.header(ws, 1, [app_heads.get(c[0], c[1]) if app_mode() else c[1] for c in COLS], [c[2] for c in COLS])
    L = {k: get_column_letter(i) for i, (k, _, _, _) in enumerate(COLS, 1)}
    A = "Assumptions!"
    for n, a in enumerate(apps, 2):
        m, i = match[a['id']], info[a['id']]
        trusted = i['conf'] in ('High', 'Medium')
        emp = 'Yes' if trusted and non_residential(m) else 'No'
        c = {k: f'{L[k]}{n}' for k in L}
        notes = []
        if a['_include'] != 'Yes':
            notes.append(a['_excl'])
        if a['id'] in stated:
            notes.append(stated[a['id']])
        if i['conf'] == 'Low':
            notes.append('App match doubtful: area default used')
        vals = {
            'id': a['id'], 'area': a['_area'], 'inc': a['_include'], 'cat': a.get('Category') or None,
            'file': a.get('File_numbe') or None, 'pop': a['Population'], 'ha': a['Area'], 'emp': emp,
            'pph': f'=IF({c["ha"]}>0,{c["pop"]}/{c["ha"]},"")',
            'cls': (f'=IF({c["emp"]}="Yes","Employment",IF({c["pph"]}>={A}{R.cls_from["High"]},"High",'
                    f'IF({c["pph"]}>={A}{R.cls_from["Medium"]},"Medium","Low")))'),
            'stated': stated_units(stated, a['id']),
            'ppu': f'=IF({c["emp"]}="Yes","",INDEX({A}{R.ppu},MATCH({c["cls"]},{A}{R.cls},0)))',
            'units': f'=IF({c["emp"]}="Yes","",IF({c["stated"]}<>"",{c["stated"]},ROUND({c["pop"]}/{c["ppu"]},0)))',
            'uph': f'=IF(OR({c["units"]}="",{c["ha"]}=0),"",{c["units"]}/{c["ha"]})',
            'app_units': m.get('units') if trusted else None,
            'conf': i['conf'] or 'No match',
            'phase': PHASE_LABEL.get(m.get('phase')) if trusted else None,
            'ph_share': f'=IF({c["phase"]}="","",INDEX({A}{R.ph_share},MATCH({c["phase"]},{A}{R.ph},0)))',
            'ar_share': f'=INDEX({A}{R.area_share},MATCH({c["area"]},{A}{R.area},0))',
            'override': None,
            'src': (f'=IF({c["override"]}<>"","Planning override",IF({c["phase"]}="{WITHDRAWN}","Withdrawn (D21)",'
                    f'IF({c["ph_share"]}<>"","App stage","No app evidence")))' if app_mode() else
                    f'=IF({c["override"]}<>"","Planning override",IF({c["phase"]}="{WITHDRAWN}","Withdrawn (D21)","Area estimate"))'),
            'share': (f'=IF({c["override"]}<>"",{c["override"]},IF({c["ph_share"]}<>"",{c["ph_share"]},{c["ar_share"]}))'
                      if app_mode() else
                      f'=IF({c["override"]}<>"",{c["override"]},IF({c["phase"]}="{WITHDRAWN}",0,{c["ar_share"]}))'),
            'dev': dev_id(a, m, trusted),
            'u_pre': f'=IF(AND({c["inc"]}="Yes",{c["units"]}<>""),{c["units"]}*{c["share"]},0)',
            'dev_pre': f'=SUMIFS(${L["u_pre"]}$2:${L["u_pre"]}${len(apps) + 1},${L["dev"]}$2:${L["dev"]}${len(apps) + 1},{c["dev"]})',
            'limited': (f'=IF(AND({A}{R.lim_on}="Yes",{c["src"]}="App stage",{c["dev_pre"]}>{A}{R.lim_units}),"Yes","No")'
                        if app_mode() else   # the app estimate limits only what the app evidences
                        f'=IF(AND({A}{R.lim_on}="Yes",{c["dev_pre"]}>{A}{R.lim_units}),"Yes","No")'),
            'final': f'=IF({c["limited"]}="Yes",{c["share"]}*{A}{R.lim_units}/{c["dev_pre"]},{c["share"]})',
            'p_pre': f'=IF({c["inc"]}="Yes",{c["pop"]}*{c["final"]},0)',
            'u_pre2': f'=IF(OR({c["inc"]}<>"Yes",{c["units"]}=""),0,{c["units"]}*{c["final"]})',
            'svc': f'=INDEX({A}{R.svc_factor},MATCH({c["area"]},{A}{R.svc_area},0))',
            'share_out': f'={c["final"]}*{c["svc"]}',
            'u2031': f'=IF({c["units"]}="","",{c["units"]}*{c["share_out"]})',
            'p2031': f'=IF({c["inc"]}="Yes",{c["pop"]}*{c["share_out"]},0)',
            'note': '; '.join(notes) or None,
            'rank': f'={c["p2031"]}+ROW()/10000000',
        }
        for col, (k, _, _, fmt) in enumerate(COLS, 1):
            v = vals[k]
            font = X.BOLD if k == 'id' else (X.BASE if isinstance(v, str) and v.startswith('=') else X.INPUT)
            cell = X.body(ws.cell(n, col, v), font, fmt, wrap=(k == 'note'))
            if k == 'override':
                cell.fill = X.REVIEW_FILL
            if k == 'p2031':
                cell.font = X.BOLD
    ws.column_dimensions[L['rank']].hidden = True
    ws.freeze_panes = 'C2'
    ws.auto_filter.ref = f'A1:{L["note"]}{len(apps) + 1}'
    ws.cell(1, len(COLS)).comment = Comment('Helper for the Top Rows sheet (2031 population plus a tiny tie-breaker).',
                                            'build_assumptions.py')
    return L


def dev_id(a, m, trusted):
    """D24: rows on one app development share one speed-limit allowance; others stand alone."""
    if trusted and m.get('key'):
        return 'App: ' + (m.get('title') or m['key'])[:60]
    return 'Row ' + a['id']


def stated_units(stated, rid):
    if rid not in stated:
        return None
    return stated[rid + '#units']


def sheet_summary(ws, labels, L, n_apps):
    ws.title = 'Area Summary'
    ws['A1'] = '2031 population by priority area'
    ws['A1'].font = X.TITLE
    ws['A2'] = 'All formulas on the Applications sheet; rows in the 2031 total only. Change the yellow cells on Assumptions.'
    ws['A2'].font = X.SUB
    cols = ['Priority area', 'Rows', 'Full population', 'Units (full)', 'Share built by 2031', '2031 population',
            'Units by 2031', '2031 pop. from the app stage' if app_mode() else '2031 pop. from the area estimate',
            '2031 pop. with no app evidence' if app_mode() else '2031 pop. from row overrides',
            'Full pop. withdrawn (D21)', 'Rows held by the speed limit', 'Share of 2031 total']
    X.header(ws, 4, cols, [22, 7, 13, 11, 11, 13, 11, 13, 13, 13, 11, 10])
    rng = lambda k: f'Applications!${L[k]}$2:${L[k]}${n_apps + 1}'   # noqa: E731
    inc = f'{rng("inc")},"Yes"'
    first = 5
    labs = sorted(labels, key=lambda x: x['map_order'])
    last = first + len(labs) - 1
    t = last + 1
    for i, lab in enumerate(labs):
        r = first + i
        ar = f'{rng("area")},$A{r}'
        X.body(ws.cell(r, 1, lab['area_name']), X.BOLD)
        X.body(ws.cell(r, 2, f'=COUNTIFS({ar},{inc})'), fmt='0')
        X.body(ws.cell(r, 3, f'=SUMIFS({rng("pop")},{ar},{inc})'), fmt='#,##0')
        X.body(ws.cell(r, 4, f'=SUMIFS({rng("units")},{ar},{inc})'), fmt='#,##0')
        X.body(ws.cell(r, 5, f'=IF(C{r}>0,F{r}/C{r},"")'), fmt='0%')
        X.body(ws.cell(r, 6, f'=SUMIFS({rng("p2031")},{ar},{inc})'), X.BOLD, '#,##0')
        X.body(ws.cell(r, 7, f'=SUMIFS({rng("u2031")},{ar},{inc})'), fmt='#,##0')
        for col, src in (((8, 'App stage'), (9, 'No app evidence')) if app_mode() else
                         ((8, 'Area estimate'), (9, 'Planning override'))):
            X.body(ws.cell(r, col, f'=SUMIFS({rng("p2031")},{ar},{inc},{rng("src")},"{src}")'), fmt='#,##0;-#,##0;-')
        X.body(ws.cell(r, 10, f'=SUMIFS({rng("pop")},{ar},{inc},{rng("src")},"Withdrawn (D21)")'), fmt='#,##0;-#,##0;-')
        X.body(ws.cell(r, 11, f'=COUNTIFS({ar},{inc},{rng("limited")},"Yes")'), fmt='0;-0;-')  # rows
        X.body(ws.cell(r, 12, f'=F{r}/$F${t}'), fmt='0.0%')
    X.body(ws.cell(t, 1, 'Total'), X.BOLD)
    for col in range(2, 13):
        Lc = get_column_letter(col)
        f = f'=SUM({Lc}{first}:{Lc}{last})' if col != 5 else f'=IF(C{t}>0,F{t}/C{t},"")'
        X.body(ws.cell(t, col, f), X.BOLD, ws.cell(first, col).number_format).fill = X.TOTAL_FILL
    ws.freeze_panes = 'B5'


def sheet_top(ws, L, n_apps):
    ws.title = 'Top Rows'
    ws['A1'] = f'The {TOP_N} applications adding the most 2031 population'
    ws['A1'].font = X.TITLE
    ws['A2'] = 'Live: re-ranks when assumptions change. These are where review time moves the total most.'
    ws['A2'].font = X.SUB
    cols = ['#', 'Row ID', 'Priority area', 'Full population', 'Share built by 2031', 'Share source',
            'Speed limit applies?', '2031 population', 'Share of 2031 total']
    X.header(ws, 4, cols, [5, 9, 22, 13, 11, 16, 10, 13, 10])
    rk = f'Applications!${L["rank"]}$2:${L["rank"]}${n_apps + 1}'

    def pick(col, r):
        return f'INDEX(Applications!${L[col]}$2:${L[col]}${n_apps + 1},MATCH(LARGE({rk},A{r}),{rk},0))'
    for k in range(TOP_N):
        r = 5 + k
        X.body(ws.cell(r, 1, k + 1))
        X.body(ws.cell(r, 2, '=' + pick('id', r)), X.BOLD)
        X.body(ws.cell(r, 3, '=' + pick('area', r)))
        X.body(ws.cell(r, 4, '=' + pick('pop', r)), fmt='#,##0')
        X.body(ws.cell(r, 5, '=' + pick('share_out', r)), fmt='0%')
        X.body(ws.cell(r, 6, '=' + pick('src', r)))
        X.body(ws.cell(r, 7, '=' + pick('limited', r)))
        X.body(ws.cell(r, 8, '=' + pick('p2031', r)), X.BOLD, '#,##0')
        X.body(ws.cell(r, 9, f"=H{r}/'Area Summary'!$F$24"), fmt='0.0%')
    t = 5 + TOP_N
    X.body(ws.cell(t, 3, f'Top {TOP_N} together'), X.BOLD)
    X.body(ws.cell(t, 8, f'=SUM(H5:H{t - 1})'), X.BOLD, '#,##0')
    X.body(ws.cell(t, 9, f'=SUM(I5:I{t - 1})'), X.BOLD, '0.0%')


def sheet_readme(ws):
    ws.title = 'README'
    ws.column_dimensions['A'].width = 28
    ws.column_dimensions['B'].width = 105
    ws['A1'] = 'Bucket 4: assumptions and 2031 population'
    ws['A1'].font = X.TITLE
    ws['A2'] = "For Planning's estimate. Starts from today's assumption (100% built by 2031) until Planning enters its own."
    ws['A2'].font = X.SUB
    rows = [
        ('What Modelling receives', '2031 population = full population x share built by 2031 (decision D02), for the '
                                    'rows in the 2031 total (duplicates removed at checkpoints 2-3).'),
        ('Units', 'Where the Region file text states a unit total, that total. Otherwise full population / people per '
                  'unit for the row\'s density class (Assumptions A). Employment-equivalent rows (D15) get no units. '
                  'App units are shown as a check only (D12).'),
        ('Share built by 2031', 'First that applies: a Planning override on the row; 0% for a row withdrawn in the app '
                                '(D21); Planning\'s estimate for the row\'s priority area (Assumptions D). Every area starts '
                                'at 100%, today\'s assumption that the application populations are the 2031 figures '
                                '(D27). The share suggested by the app stage is shown beside each row for reference only.'),
        ('Speed limit', 'If on, no development adds more than the units per year x years of building (Assumptions C). '
                        'Rows on one app development share one allowance (D24); a row without a trusted app match is '
                        'its own development. When a development is over, each of its rows is scaled down in proportion. '
                        'Employment-equivalent rows have no units, so no limit.'),
        ('Servicing limits', 'Assumptions E: where a servicing constraint caps an area by 2031 (units or people), '
                             'every row in the area is scaled down by the same factor so the area fits the limit. '
                             'Applied after the share and the speed limit. Values come from the servicing meeting '
                             '(D28, D29).' if not app_mode() else 'Not applied in the app estimate.'),
        ('How to review', 'Change the yellow cells on Assumptions, or type a share in "Planning override share" on a '
                          'row. Area Summary and Top Rows update. Top Rows shows where a change moves the total most.'),
        ('Colours', 'Blue = value from the data. Black = formula. Yellow = Planning fills in or edits.'),
    ]
    r = 4
    for k, v in rows:
        ws.cell(r, 1, k).font = X.BOLD
        c = ws.cell(r, 2, v)
        c.font, c.alignment = X.BASE, X.WRAP
        ws.row_dimensions[r].height = 15 * max(1, -(-len(v) // 100))
        r += 1


def load_stated(path):
    out = {}
    if os.path.exists(path):
        for r in csv.DictReader(open(path, newline='', encoding='utf-8')):
            out[r['row_id']] = 'Units from ' + r['source'][0].lower() + r['source'][1:]
            out[r['row_id'] + '#units'] = int(r['units'])
    return out


def main():
    st = prepare()
    apps = st['apps']
    res = run_matcher(apps)
    match = {r['id']: r for r in res['results']}
    info = {a['id']: assess(a, match[a['id']]) for a in apps}
    stated = load_stated(os.path.join(PRIVATE, 'stated_units.csv'))
    wb = Workbook()
    sheet_readme(wb.active)
    R = sheet_assumptions(wb.create_sheet(), st['labels'])
    ws_sum = wb.create_sheet()
    ws_top = wb.create_sheet()
    L = sheet_applications(wb.create_sheet(), apps, match, info, stated, R)
    fill_limits(R, L, len(apps))
    sheet_summary(ws_sum, st['labels'], L, len(apps))
    assert len(st['labels']) == 19   # Top Rows refers to the Area Summary total in row 24
    sheet_top(ws_top, L, len(apps))
    sheet_decisions(wb.create_sheet(), st['decisions'])
    for ws in wb.worksheets:
        X.print_fit(ws)
    out = os.path.join(PRIVATE, 'Bucket4_Assumptions.xlsx')
    wb.save(out)
    print(f'wrote {out}: {len(apps)} rows; {sum(1 for k in stated if not k.endswith("#units"))} with stated units')


if __name__ == '__main__':
    main()
