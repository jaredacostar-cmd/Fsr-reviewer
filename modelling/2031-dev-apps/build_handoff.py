"""Bucket 6: the file for Modelling.

Reads the Planning review workbook (as built, or as Planning returned it with their estimates) and
writes a plain values-only workbook: one row per application kept for 2031, with its priority area,
location, full and 2031 population, plus an area summary, the rows removed as duplicates, and notes
for Modelling. Planning's numbers are taken from the workbook's calculated values, so a returned
workbook needs to have been saved in Excel (or is recalculated here with LibreOffice if available).

Usage:  python3 build_handoff.py [--from private/Planning_Review_2031.xlsx] [--round "Round 1 (first draft)"]
Output: private/Modelling_Handoff_2031.xlsx and private/Modelling_Handoff_2031.csv
"""
import argparse
import csv
import datetime as dt
import glob
import os
import shutil
import subprocess
import sys
import tempfile

from openpyxl import Workbook, load_workbook

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import xlsx_style as X  # noqa: E402
from build_areas import PRIVATE, prepare, sheet_decisions  # noqa: E402
from geo import to_utm  # noqa: E402


def calculated(path):
    """The workbook with calculated values. Recalculates with LibreOffice when it was never calculated."""
    wb = load_workbook(path, data_only=True)
    ws = wb['Applications']
    head = [c.value for c in ws[1]]
    if ws.cell(2, head.index('2031 population') + 1).value is not None:
        return wb
    tmp = tempfile.mkdtemp()
    copy = os.path.join(tmp, os.path.basename(path))
    shutil.copy(path, copy)
    recalc = os.environ.get('RECALC') or next(iter(glob.glob('/root/.claude/skills/**/xlsx/scripts/recalc.py',
                                                             recursive=True)), None)
    if recalc:
        subprocess.run([sys.executable, recalc, copy, '180'], check=True, capture_output=True)
    else:
        subprocess.run(['soffice', '--headless', '--convert-to', 'xlsx', '--outdir', tmp + '/out', copy], check=True,
                       capture_output=True)
        copy = os.path.join(tmp, 'out', os.path.basename(path))
    wb = load_workbook(copy, data_only=True)
    if wb['Applications'].cell(2, head.index('2031 population') + 1).value is None:
        raise SystemExit('No calculated values: open the workbook in Excel, save it, and run again.')
    return wb


def read_rows(wb):
    ws = wb['Applications']
    head = [c.value for c in ws[1]]
    return {r[0]: dict(zip(head, r)) for r in ws.iter_rows(min_row=2, values_only=True) if r[0]}


def read_flag_decisions(wb):
    if 'Open Flags' not in wb.sheetnames:
        return []
    out = []
    for r in wb['Open Flags'].iter_rows(min_row=5, values_only=True):
        if r[0] and r[9]:
            out.append({'flag': r[0], 'rows': r[3], 'check': r[7], 'decision': r[9], 'comment': r[10]})
    return out


COLS = [('Row ID', 9, None), ('Shapefile record (FID)', 10, '0'), ('Priority area', 22, None),
        ('Municipality', 13, None), ('File number', 18, None), ('Address', 28, None), ('Version', 12, None),
        ('Employment equivalent', 11, None), ('Full population', 12, '#,##0'), ('Area (ha)', 9, '#,##0.00'),
        ('Share built by 2031', 10, '0%'), ('2031 population', 12, '#,##0'), ('Units by 2031', 10, '#,##0'),
        ('Basis of 2031 share', 18, None), ('Servicing limit applied', 11, None), ('Longitude', 11, '0.000000'),
        ('Latitude', 11, '0.000000'), ('UTM 17N easting', 12, '0'), ('UTM 17N northing', 12, '0')]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='src', default=os.path.join(PRIVATE, 'Planning_Review_2031.xlsx'))
    ap.add_argument('--round', default='Round 1 (first draft, before Planning estimates)')
    ap.add_argument('--out', default=os.path.join(PRIVATE, 'Modelling_Handoff_2031.xlsx'))
    a = ap.parse_args()
    st = prepare()
    wb_in = calculated(a.src)
    rows = read_rows(wb_in)
    flags = read_flag_decisions(wb_in)
    kept, removed = [], []
    for i, app in enumerate(st['apps']):
        r = rows[app['id']]
        e, n = to_utm(app['_lon'], app['_lat'])
        rec = [app['id'], i, app['_area'], app.get('_muni'), app.get('File_numbe') or None, app.get('_address'),
               app['version'], r['Employment equivalent? (D15)'], app['Population'], app['Area'],
               r['Share built by 2031'], round(r['2031 population']), round(r['Units by 2031']) if r['Units by 2031'] else None,
               r['Share source'],
               'Yes' if (r['Servicing limit factor (Assumptions E)'] or 1) < 1 else 'No',
               app['_lon'], app['_lat'], round(e), round(n)]
        (kept if app['_include'] == 'Yes' else removed).append((rec, app))

    wb = Workbook()
    ws = wb.active
    ws.title = 'README'
    ws.column_dimensions['A'].width = 30
    ws.column_dimensions['B'].width = 100
    ws['A1'] = '2031 development application population for Modelling'
    ws['A1'].font = X.TITLE
    ws['A2'] = f'{a.round}. Prepared {dt.date.today().isoformat()} by Water & Wastewater Planning. Values, not formulas.'
    ws['A2'].font = X.SUB
    tot_full = sum(x[0][8] for x in kept)
    tot_2031 = sum(x[0][11] for x in kept)
    limited = sorted({x[0][2] for x in kept if x[0][14] == 'Yes'})
    notes = [r for r in csv.DictReader(open(os.path.join(PRIVATE, 'meeting_notes.csv'), encoding='utf-8'))
             if r['topic'] in ('Modelling', 'Scope')] if os.path.exists(os.path.join(PRIVATE, 'meeting_notes.csv')) else []
    info = [
        ('Status', f'{a.round}. Planning is still reviewing; expect revised numbers.'),
        ('What is here', f'{len(kept)} development applications in 19 priority areas (Scenario 1), each with its full '
                         f'population and its population by 2031. Full: {tot_full:,.0f}. By 2031: {tot_2031:,.0f}.'),
        ('Source', 'Region development application points (Dev_Apps_V7) behind map 4507-WW (2026-05-20), cleaned and '
                   'checked against municipal open data; duplicates removed (sheet Removed Duplicates).'),
        ('2031 population', 'Full population x share built by 2031. Share: Planning\'s estimate per area (100% where '
                            'Planning has not yet given one), Planning overrides on single applications, withdrawn '
                            'applications 0%, then servicing limits' + (f" ({', '.join(limited)})" if limited else '') + '.'),
        ('Rounding', '2031 population and units are rounded to whole numbers per application.'),
        ('Employment equivalent', 'Rows marked Yes are non-residential sites; their population is an employment '
                                  'equivalent.'),
        ('Location', 'Point per application: longitude / latitude (NAD83 CSRS) and UTM 17N. "Shapefile record (FID)" is '
                     'the record number in Dev_Apps_V7.shp (0-based), for joining in GIS.'),
        ('Existing population', 'Assumed: the 2031 model starts from a 2021 existing population; these are additions '
                                'to it (to confirm with Modelling).'),
    ] + [(f"For Modelling: {n['area']}", f"{n['said']} {n['action']}") for n in notes]
    if flags:
        info.append(('Planning flag decisions', f'{len(flags)} recorded in the review workbook; '
                     f"{sum(1 for f in flags if f['decision'] == 'Exclude')} say Exclude and need applying in a rebuild."))
    r = 4
    for k, v in info:
        ws.cell(r, 1, k).font = X.BOLD
        c = ws.cell(r, 2, v)
        c.font, c.alignment = X.BASE, X.WRAP
        ws.row_dimensions[r].height = 15 * max(1, -(-len(v) // 95))
        r += 1

    def table(ws, recs):
        X.header(ws, 1, [c[0] for c in COLS], [c[1] for c in COLS])
        for n, rec in enumerate(recs, 2):
            for c, (v, (_, _, fmt)) in enumerate(zip(rec, COLS), 1):
                X.body(ws.cell(n, c, v), X.BOLD if c == 1 else X.BASE, fmt)
        ws.freeze_panes = 'B2'
        ws.auto_filter.ref = f'A1:{ws.cell(1, len(COLS)).column_letter}{len(recs) + 1}'
    ws2 = wb.create_sheet('Applications')
    table(ws2, [x[0] for x in kept])
    n = len(kept) + 2
    X.body(ws2.cell(n, 3, 'Total'), X.BOLD)
    X.body(ws2.cell(n, 9, f'=SUM(I2:I{n - 1})'), X.BOLD, '#,##0').fill = X.TOTAL_FILL
    X.body(ws2.cell(n, 12, f'=SUM(L2:L{n - 1})'), X.BOLD, '#,##0').fill = X.TOTAL_FILL

    ws3 = wb.create_sheet('Area Summary')
    X.header(ws3, 1, ['Priority area', 'Applications', 'Full population', '2031 population', 'Share built by 2031',
                      'Servicing limit applied'], [22, 12, 14, 14, 12, 12])
    labs = sorted(st['labels'], key=lambda x: x['map_order'])
    for i, lab in enumerate(labs, 2):
        xs = [x[0] for x in kept if x[0][2] == lab['area_name']]
        full, y = sum(x[8] for x in xs), sum(x[11] for x in xs)
        vals = [lab['area_name'], len(xs), full, y, y / full if full else None,
                'Yes' if lab['area_name'] in limited else 'No']
        for c, (v, fmt) in enumerate(zip(vals, [None, '0', '#,##0', '#,##0', '0%', None]), 1):
            X.body(ws3.cell(i, c, v), X.BOLD if c == 1 else X.BASE, fmt)
    t = len(labs) + 2
    X.body(ws3.cell(t, 1, 'Total'), X.BOLD)
    for c, fmt in ((2, '0'), (3, '#,##0'), (4, '#,##0')):
        L = ws3.cell(1, c).column_letter
        X.body(ws3.cell(t, c, f'=SUM({L}2:{L}{t - 1})'), X.BOLD, fmt).fill = X.TOTAL_FILL
    X.body(ws3.cell(t, 5, f'=D{t}/C{t}'), X.BOLD, '0%').fill = X.TOTAL_FILL
    ws3.freeze_panes = 'B2'

    ws4 = wb.create_sheet('Removed Duplicates')
    table(ws4, [x[0][:10] + [None, 0, None, x[1]['_excl'], 'No'] + x[0][15:] for x in removed])
    ws4.cell(1, 14).value = 'Why removed'
    sheet_decisions(wb.create_sheet(), st['decisions'])
    for w in wb.worksheets:
        X.print_fit(w)
    wb.save(a.out)
    csv_path = os.path.splitext(a.out)[0] + '.csv'
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow([c[0] for c in COLS])
        w.writerows([x[0] for x in kept])
    print(f'wrote {a.out} and {csv_path}: {len(kept)} applications, full {tot_full:,.0f}, 2031 {tot_2031:,.0f}; '
          f'{len(removed)} removed duplicates; {len(flags)} Planning flag decisions read')


if __name__ == '__main__':
    main()
