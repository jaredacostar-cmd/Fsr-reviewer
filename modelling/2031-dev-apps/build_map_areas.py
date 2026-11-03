"""Build the map-areas workbook: the 19 priority areas exactly as labelled on map
4507-WW-Development Application Modelling Update (Scenario 1 2031, 2026-05-20).

Input:  private/map_labels.csv (transcribed by hand from the PDF map)
Output: private/Map_Areas_2031.xlsx

Usage:  python3 build_map_areas.py [--labels CSV] [--out XLSX]
"""
import argparse
import csv
import os
import sys

from openpyxl import Workbook

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xlsx_style as X  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MAP_INFO = [
    ('Map title', 'Scenario 1 2031 - Priority Area - For Modeling (2026-05-20)'),
    ('Map ID', '4507-WW-Development Application Modelling Update'),
    ('Prepared by', 'Water & Wastewater Planning, Public Works (May 2026)'),
    ('Data source', 'Region of Peel'),
    ('Projection / scale', 'NAD 1983 UTM Zone 17N, 1:192,036'),
    ('Legend layers', 'V6; V7 (Addition); V6 Revised Pop/ha'),
]


def load_labels(path):
    with open(path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r['map_order'] = int(r['map_order'])
        r['population'] = int(r['population'])
        r['area_ha'] = float(r['area_ha'])
    return rows


def write_map_sheet(ws, labels):
    ws.title = 'Map Areas'
    ws['A1'] = 'Scenario 1 (2031) priority areas, as labelled on the map'
    ws['A1'].font = X.TITLE
    ws['A2'] = ('Blue = value copied from the map label. Black = formula. '
                'Yellow = reviewer fills in.')
    ws['A2'].font = X.SUB
    cols = ['#', 'Area (map label)', 'Population (map)', 'Area ha (map)',
            'Density (persons/ha)', 'Share of map total', 'Label note',
            'Label checked against map? (Y/N)', 'Reviewer comment']
    X.header(ws, 4, cols, [5, 26, 15, 13, 14, 12, 48, 16, 36])
    first = 5
    for i, lab in enumerate(sorted(labels, key=lambda r: r['map_order'])):
        r = first + i
        last = first + len(labels) - 1
        X.body(ws.cell(r, 1, lab['map_order']))
        X.body(ws.cell(r, 2, lab['area_name']), X.BOLD)
        X.body(ws.cell(r, 3, lab['population']), X.INPUT, '#,##0')
        X.body(ws.cell(r, 4, lab['area_ha']), X.INPUT, '#,##0.00')
        X.body(ws.cell(r, 5, f'=IF(D{r}>0,C{r}/D{r},"")'), fmt='#,##0')
        X.body(ws.cell(r, 6, f'=C{r}/$C${last + 1}'), fmt='0.0%')
        X.body(ws.cell(r, 7, lab['label_note'] or None), wrap=True)
        for c in (8, 9):
            X.body(ws.cell(r, c)).fill = X.REVIEW_FILL
    last = first + len(labels) - 1
    t = last + 1
    X.body(ws.cell(t, 2, 'Total (19 areas)'), X.BOLD)
    X.body(ws.cell(t, 3, f'=SUM(C{first}:C{last})'), X.BOLD, '#,##0')
    X.body(ws.cell(t, 4, f'=SUM(D{first}:D{last})'), X.BOLD, '#,##0.00')
    X.body(ws.cell(t, 5, f'=IF(D{t}>0,C{t}/D{t},"")'), X.BOLD, '#,##0')
    X.body(ws.cell(t, 6, f'=SUM(F{first}:F{last})'), X.BOLD, '0.0%')
    for c in range(1, 10):
        ws.cell(t, c).fill = X.TOTAL_FILL
        ws.cell(t, c).border = X.BOX
    ws.freeze_panes = 'C5'
    ws.auto_filter.ref = f'A4:I{last}'
    return first, last


def write_about(ws, n):
    ws.title = 'About'
    ws.column_dimensions['A'].width = 22
    ws.column_dimensions['B'].width = 90
    ws['A1'] = 'About this workbook'
    ws['A1'].font = X.TITLE
    r = 3
    for k, v in MAP_INFO:
        ws.cell(r, 1, k).font = X.BOLD
        ws.cell(r, 2, v).font = X.BASE
        r += 1
    r += 1
    X.text_block(ws, r, [
        ('How the values were captured', X.BOLD),
        f'All {n} area labels (name, population, area) were copied by hand from the PDF map and '
        'checked against the PDF text layer. Nothing has been calculated or adjusted. Density and '
        'share of total are formulas.',
        '',
        ('Known caveats', X.BOLD),
        '- The map shows full population for each priority area. It does not show units, phasing, or '
        'how much is expected to be built by 2031. Those assumptions come in later stages of this work.',
        '- Area notes (unit missing, round numbers that look estimated) are in the Label note column.',
        '- The Bucket 1 inventory workbook compares these totals with the application points behind the map.',
        '',
        ('How to review', X.BOLD),
        'On the Map Areas sheet, compare each row with the map. Put Y or N in the yellow '
        '"Label checked" column and add a comment if anything differs.',
    ])
    for row in ws.iter_rows(min_row=r, max_row=r + 20, max_col=1):
        for c in row:
            ws.merge_cells(start_row=c.row, start_column=1, end_row=c.row, end_column=2)
            ws.row_dimensions[c.row].height = 15 * max(1, -(-len(str(c.value or '')) // 105))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--labels', default=os.path.join(HERE, 'private', 'map_labels.csv'))
    ap.add_argument('--out', default=os.path.join(HERE, 'private', 'Map_Areas_2031.xlsx'))
    a = ap.parse_args()
    labels = load_labels(a.labels)
    wb = Workbook()
    write_map_sheet(wb.active, labels)
    write_about(wb.create_sheet(), len(labels))
    for ws in wb.worksheets:
        X.print_fit(ws)
    wb.save(a.out)
    print(f'wrote {a.out} ({len(labels)} areas, total {sum(x["population"] for x in labels):,})')


if __name__ == '__main__':
    main()
