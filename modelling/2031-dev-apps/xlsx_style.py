"""Shared workbook styling for the 2031 dev-app modelling workbooks."""
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

FONT = 'Arial'
BASE = Font(name=FONT, size=10)
BOLD = Font(name=FONT, size=10, bold=True)
TITLE = Font(name=FONT, size=14, bold=True)
SUB = Font(name=FONT, size=10, italic=True, color='555555')
INPUT = Font(name=FONT, size=10, color='0000FF')          # transcribed / hard-coded value
GREY = Font(name=FONT, size=10, italic=True, color='808080')   # excluded / inactive row
LINK = Font(name=FONT, size=10, color='008000')           # link to another sheet
HEAD_FILL = PatternFill('solid', fgColor='1F3864')
HEAD_FONT = Font(name=FONT, size=10, bold=True, color='FFFFFF')
REVIEW_FILL = PatternFill('solid', fgColor='FFFF00')       # reviewer fills this in
TOTAL_FILL = PatternFill('solid', fgColor='D9E1F2')
SEV_FILL = {'High': PatternFill('solid', fgColor='F8CBAD'),
            'Medium': PatternFill('solid', fgColor='FFE699'),
            'Low': PatternFill('solid', fgColor='E2EFDA')}
THIN = Side(style='thin', color='BFBFBF')
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical='top')
TOP = Alignment(vertical='top')


def header(ws, row, labels, widths=None):
    for i, lab in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=lab)
        c.font, c.fill, c.border = HEAD_FONT, HEAD_FILL, BOX
        c.alignment = Alignment(wrap_text=True, vertical='center')
        if widths:
            ws.column_dimensions[get_column_letter(i)].width = widths[i - 1]
    ws.row_dimensions[row].height = 30


def body(cell, font=BASE, fmt=None, wrap=False):
    cell.font, cell.border = font, BOX
    cell.alignment = WRAP if wrap else TOP
    if fmt:
        cell.number_format = fmt
    return cell


def text_block(ws, start_row, lines, col=1):
    """lines: list of (text, font) or str. Returns the next free row."""
    r = start_row
    for ln in lines:
        text, font = (ln, BASE) if isinstance(ln, str) else ln
        c = ws.cell(row=r, column=col, value=text)
        c.font = font
        c.alignment = Alignment(wrap_text=True, vertical='top')
        r += 1
    return r


def print_fit(ws, landscape=True):
    """Print the sheet one page wide."""
    ws.page_setup.orientation = 'landscape' if landscape else 'portrait'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
