"""Side workbook (proof of concept): the FSR Reviewer app's own 2031 estimate.

Same rows and formulas as the Planning workbook, but the share built by 2031 comes from the stage
of each development in the app (Peel Growth Pipeline) and the build-out speed limit is on. Rows the
app cannot confirm keep today's figure (100%), so the gap to today's assumption is only what the app
can evidence. Not for Modelling: it sits beside Planning's estimate to show what the app adds.

Output: private/App_Estimate_2031.xlsx

Usage:  python3 build_app_estimate.py
"""
import os
import sys

from openpyxl import Workbook

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_assumptions as BA  # noqa: E402
import xlsx_style as X  # noqa: E402
from build_app_check import assess, run_matcher  # noqa: E402
from build_areas import PRIVATE, prepare, sheet_decisions  # noqa: E402


def sheet_readme(ws, res, n_apps):
    ws.title = 'README'
    ws.column_dimensions['A'].width = 28
    ws.column_dimensions['B'].width = 105
    ws['A1'] = 'FSR Reviewer app estimate of 2031 population (proof of concept)'
    ws['A1'].font = X.TITLE
    ws['A2'] = ("On the side: not for Modelling and not Planning's estimate. Shows what the app's evidence alone "
                'would say.')
    ws['A2'].font = X.SUB
    rows = [
        ('App data', f"Peel Growth Pipeline (FSR Reviewer), municipal open data as shown on {res.get('appDataAt')}: "
                     'planning files, building permits and their stages, linked into developments.'),
        ('Method', 'Each application is matched to its development in the app (Bucket 3). Where the match is High or '
                   'Medium confidence, the share built by 2031 comes from the development\'s stage (Assumptions B) and '
                   'the build-out speed limit applies per development (Assumptions C). Withdrawn developments count 0%. '
                   'Where the app has no trusted evidence, the row keeps today\'s figure (100%, Assumptions D) and '
                   'the speed limit does not apply to it.'),
        ('Compare with', "Planning_Review_2031.xlsx: today's assumption (every application population is the 2031 "
                         "figure) and, once entered, Planning's estimate. Area Summary column \"Today's assumption\" "
                         'shows the difference the app makes in each area.'),
        ('Limits', 'The stage shares and the speed limit are analyst placeholders, editable in yellow. About half the '
                   'population has no trusted app evidence (mostly large future areas with early files), so the app '
                   'estimate there is simply today\'s figure.'),
        ('Rows', f'{n_apps} applications; duplicates removed at checkpoints 2-3 are kept but not counted.'),
    ]
    r = 4
    for k, v in rows:
        ws.cell(r, 1, k).font = X.BOLD
        c = ws.cell(r, 2, v)
        c.font, c.alignment = X.BASE, X.WRAP
        ws.row_dimensions[r].height = 15 * max(1, -(-len(v) // 100))
        r += 1


def add_comparison(ws):
    """Area Summary: today's assumption (full population of the kept rows, less withdrawn) and the difference."""
    ws.cell(4, 13, "Today's assumption (100%)")
    ws.cell(4, 14, 'App estimate minus today')
    for c in (13, 14):
        h = ws.cell(4, c)
        h.font, h.fill, h.border, h.alignment = X.HEAD_FONT, X.HEAD_FILL, X.BOX, X.WRAP
        ws.column_dimensions[h.column_letter].width = 13
    for r in range(5, 25):
        X.body(ws.cell(r, 13, f'=C{r}'), fmt='#,##0')
        X.body(ws.cell(r, 14, f'=F{r}-M{r}'), X.BOLD if r == 24 else X.BASE, '#,##0;-#,##0;-')
    ws.cell(24, 13).font = X.BOLD
    for c in (13, 14):
        ws.cell(24, c).fill = X.TOTAL_FILL


def main():
    BA.set_mode('app')
    st = prepare()
    apps = st['apps']
    res = run_matcher(apps)
    match = {r['id']: r for r in res['results']}
    info = {a['id']: assess(a, match[a['id']]) for a in apps}
    stated = BA.load_stated(os.path.join(PRIVATE, 'stated_units.csv'))
    wb = Workbook()
    sheet_readme(wb.active, res, len(apps))
    ws_sum, ws_top = wb.create_sheet(), wb.create_sheet()
    R = BA.sheet_assumptions(wb.create_sheet(), st['labels'])
    L = BA.sheet_applications(wb.create_sheet(), apps, match, info, stated, R)
    BA.sheet_summary(ws_sum, st['labels'], L, len(apps))
    ws_sum['A1'] = '2031 population by priority area: the app estimate'
    add_comparison(ws_sum)
    BA.sheet_top(ws_top, L, len(apps))
    sheet_decisions(wb.create_sheet(), st['decisions'])
    for ws in wb.worksheets:
        X.print_fit(ws)
    out = os.path.join(PRIVATE, 'App_Estimate_2031.xlsx')
    wb.save(out)
    print(f'wrote {out}')


if __name__ == '__main__':
    main()
