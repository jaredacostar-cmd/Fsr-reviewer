# Remove the "Population: …" and "Area: … ha" figures from the Region PDF, keeping the area names.
import pymupdf, re, sys
src, dst = sys.argv[1], sys.argv[2]
doc = pymupdf.open(src); page = doc[0]
W = sorted(page.get_text('words'), key=lambda w: (w[5], w[6], w[7]))
num = re.compile(r'^[\d,.]+$')
hits, on = [], False
for w in W:
    t = w[4]
    if re.match(r'^Population', t) or t == 'Area:':
        on = True; hits.append(w); continue
    if on and (num.match(t) or t == 'ha'):
        hits.append(w); continue
    on = False
for w in hits:
    x0,y0,x1,y1=w[:4]; h=y1-y0
    page.add_redact_annot(pymupdf.Rect(x0+0.3,y0+0.38*h,x1-0.3,y1-0.38*h))
page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
doc.save(dst)
left=pymupdf.open(dst)[0].get_text()
print('names kept:', all(n in left for n in ['MACVILLE','DIXIE ROAD','NORTH AMERICAN LANDS','HERITAGE HEIGHTS','SP47','LAKESHORE','PORT CREDIT','STEELES MTSA','Priority Area']))
print(len(hits), 'words removed:', ' '.join(w[4] for w in hits))
