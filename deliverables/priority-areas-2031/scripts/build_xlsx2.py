import json, collections
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L
R=json.load(open('results2.json')); C=json.load(open('cands2.json'))
OUT='/home/user/Fsr-reviewer/deliverables/priority-areas-2031/Priority_Areas_2031_Growth_Analysis.xlsx'
SLIDE0=10
def slug(n): return n.replace('/','-').replace(' ','_')
F='Arial'; BLUE_PEEL='005596'
H=Font(name=F,bold=True,color='FFFFFF'); HF=PatternFill('solid',fgColor=BLUE_PEEL); SUB=PatternFill('solid',fgColor='DCE8F2')
B=Font(name=F,bold=True); N=Font(name=F); LINK=Font(name=F,color='0563C1',underline='single'); GREEN=Font(name=F,color='008000'); INP=Font(name=F,color='0000FF')
def hdr(ws,row,cols,start=1,fill=HF):
    for i,c in enumerate(cols):
        x=ws.cell(row,start+i,c); x.font=H; x.fill=fill; x.alignment=Alignment(wrap_text=True,vertical='center',horizontal='center')
wb=Workbook()
rm=wb.active; rm.title='Read Me'
MODE={'user':'User direction','named':'Existing boundary','parcels':'Application parcels'}
lines=[('Scenario 1 2031 Priority Areas: growth from development applications (Peel Growth Pipeline app)',True,14),('',False,10),
('What this is',True,11),
('Growth for the 19 priority areas on the Region map "4507-WW Development Application Modelling Update" (Scenario 1 2031, 2026-05-20), for hydraulic models based on the 2021 Census. Every figure is growth added on top of the 2021 Census, computed by the Peel Growth Pipeline app itself (loaded headless; its own modules: PeelAreas.growthSince, PeelPhases.unbuiltOf, PeelLedger + PeelTiming forecast, PeelDemand, PeelEmployment).',False,10),
(f"App data snapshot: {R['generatedAt'][:10]}. Census day: {R['censusDay']}.",False,10),('',False,10),
('The four growth figures (units, residential population, jobs)',True,11),
('1. Growth 2021–2026 = built in these applications from census day 2021-05-11 to the snapshot (every building permit completed since census day; Brampton and Caledon completion dates estimated from issue date + 12 months, +30 months for 20+ units, as the app does).',False,10),
('2. Growth 2026–2031 = the app Forecast\'s share of the units left to build that it places in 2026–2031 (Growth › Forecast › By period). Untimed developments add nothing to 2031.',False,10),
('3. Total growth to 2031 = 1 + 2 (formula).',False,10),
('4. Final growth = 1 + everything left to build: the full build-out of the applications.',False,10),
('Residential population = units × Peel persons per unit by type (single/semi 4.2, town 3.4, apartment 3.1 or 2.7 above 475 persons/ha, type not stated 2.7). Jobs = non-residential floor area on the applications ÷ m² per job; employment-only sites count by 2031 when Plan approved, Building permit or Under construction (the app\'s rule: employment counts by phase). Homes built before census day are already in the census and are never counted.',False,10),
('Only planning applications count (pre-consultation, OPA/ZBA, draft plan, site plan, condominium) with growth since census day; building-permit-only infill is not included. Each development counts in one area only.',False,10),('',False,10),
('Boundaries (sheet "Boundary review")',True,11),
('Every area was checked against the boundaries the app holds: 120 secondary plans, 75 MTSAs and 30 precincts (Brampton Plan schedules, Caledon and Mississauga official plans), plus each application\'s own parcel. Rule: (1) user direction first: A01 Macville = the Region map\'s blue applications (ArgoMcville, Bolton North Hill Op 1 and 2, Solmar) plus the applications in the Region box; A15 Steeles MTSA = the whole MTSA. (2) An existing boundary where its size matches the Region\'s hectares: A06 McLaughlin Road = Brookvalley (Mayfield West Phase 2) Secondary Plan, 438.1 ha vs 435.7 ha. (3) Everywhere else, the app\'s application parcels with at least half their land inside the Region box: these match the Region\'s hectares best (e.g. SP47 450 ha of parcels with growth; North American Lands 27.6 vs 25.79 ha; Kennedy 10.3 vs 10.1 ha) and keep the count to growth from applications.',False,10),
('Region boxes were georeferenced from the PDF (NAD83 / UTM 17N, fitted to the municipal boundaries; ~160 m).',False,10),('',False,10),
('Cross-references',True,11),
(f'Area A08 = Excel sheet "A08" = PPT slide 18 (slide = {SLIDE0} + area no.) = app screenshot app-screens/A08_SP47_app.png; Region map reference maps/A08_SP47.png. Development A08-012 is label 12 in both images and its row on sheet A08 and in sheet Developments.',False,10),('',False,10),
('Colour key: black = values or formulas · green = links to another sheet · blue = values read from the Region PDF map.',False,10),
('Caveat: unofficial screening estimate from public open data, not the Region\'s capacity ledger. Lands with no application in the app\'s data are not counted, so the Region\'s figures can be higher.',False,10)]
for i,(t,b,s) in enumerate(lines,1):
    c=rm.cell(i,1,t); c.font=Font(name=F,bold=b,size=s); c.alignment=Alignment(wrap_text=True,vertical='top')
rm.column_dimensions['A'].width=150
# Developments
dv=wb.create_sheet('Developments')
cols=['Dev ID','Area ID','Area','Development (app)','Municipality','Stage (app)','Plan (app)','Planning files (status)','Parcel (ha)','% of parcel in Region box',
 'Units 2021–2026','Units 2026–2031','Units total to 2031','Units final growth','Res pop 2021–2026','Res pop 2026–2031','Res pop total to 2031','Res pop final growth',
 'Jobs 2021–2026','Jobs 2026–2031','Jobs total to 2031','Jobs final growth','Share of left-to-build in 2026–2031','Expected year (likely)','Forecast tier','Note','Description','Latitude','Longitude','App key']
hdr(dv,1,cols); r=2
for a in R['areas']:
    for x in a['rows']:
        v=[x['id'],a['code'],a['name'],x['title'],x['municipality'],x['stage'],x['plan'],x['files'],x['parcelHa'],(x['pctInBox']/100 if x['pctInBox'] is not None else None),
           x['u26'],x['u2631'],f'=K{r}+L{r}',x['uF'],x['p26'],x['p2631'],f'=O{r}+P{r}',x['pF'],x['j26'],x['j2631'],f'=S{r}+T{r}',x['jF'],
           x['share2031'],x['expectedYear'],x['tier'] or '',x['note'],x['description'][:500],round(x['lat'],6),round(x['lng'],6),x['key']]
        for j,val in enumerate(v,1): dv.cell(r,j,val).font=N
        dv.cell(r,2).hyperlink=f"#'{a['code']}'!A1"; dv.cell(r,2).font=GREEN
        for j in range(11,23): dv.cell(r,j).number_format='#,##0'
        dv.cell(r,10).number_format='0%'; dv.cell(r,23).number_format='0%'; dv.cell(r,9).number_format='#,##0.0'
        r+=1
last=r-1
for j,w in enumerate([11,8,20,36,12,16,26,48,9,10]+[11]*12+[10,9,8,30,60,11,11,30],1): dv.column_dimensions[L(j)].width=w
dv.freeze_panes='E2'; dv.auto_filter.ref=f"A1:{L(len(cols))}{last}"; dv.row_dimensions[1].height=45
AR=f"Developments!$B$2:$B${last}"
# Summary
sm=wb.create_sheet('Summary',1)
sm['A1']='Scenario 1 2031 Priority Areas: growth on top of the 2021 Census, from development applications'; sm['A1'].font=Font(name=F,bold=True,size=14)
sm['A2']=f"Peel Growth Pipeline app, snapshot {R['generatedAt'][:10]}. Census day 2021-05-11. Planning applications only. Formulas sum sheet 'Developments'. Sheet Axx = PPT slide {SLIDE0}+xx = app-screens/Axx_*_app.png."; sm['A2'].font=Font(name=F,italic=True,size=9)
groups=[('Area',1,4),('Region map (PDF)',5,6),('Apps',7,7),('Units: growth',8,11),('Residential population: growth',12,15),('Jobs: growth',16,19),('Compare',20,20),('Cross-reference',21,24)]
for g,a_,b_ in groups:
    sm.merge_cells(start_row=4,start_column=a_,end_row=4,end_column=b_); c=sm.cell(4,a_,g); c.font=B; c.fill=SUB; c.alignment=Alignment(horizontal='center')
G4=['2021–2026','2026–2031','Total to 2031','Final growth']
hdr(sm,5,['Area ID','Area','Boundary used','Boundary (ha)','Population (map)','Area ha (map)','Planning applications']+G4*3+['App final pop ÷ map pop','Excel sheet','App screenshot','Region map reference','PPT slide'])
first=6
SRC={'u':['K','L','M','N'],'p':['O','P','Q','R'],'j':['S','T','U','V']}
for i,a in enumerate(R['areas']):
    rr=first+i
    v=[a['code'],a['name'],MODE[a['mode']],a['boundaryHa'],a['mapPop'],a['mapHa']]
    for j,x in enumerate(v,1): sm.cell(rr,j,x).font=N
    sm.cell(rr,5).font=INP; sm.cell(rr,6).font=INP; sm.cell(rr,4).number_format='#,##0.0'; sm.cell(rr,5).number_format='#,##0'
    sm.cell(rr,7,f'=COUNTIFS({AR},$A{rr})')
    col=8
    for k in 'upj':
        for c in SRC[k]:
            sm.cell(rr,col,f'=SUMIFS(Developments!${c}$2:${c}${last},{AR},$A{rr})').number_format='#,##0'; col+=1
    sm.cell(rr,20,f'=IF(E{rr}>0,O{rr}/E{rr},"")').number_format='0%'
    c=sm.cell(rr,21,f"Sheet {a['code']}"); c.hyperlink=f"#'{a['code']}'!A1"; c.font=LINK
    sm.cell(rr,22,f"app-screens/{a['code']}_{slug(a['name'])}_app.png").font=N
    sm.cell(rr,23,f"maps/{a['code']}_{slug(a['name'])}.png").font=N
    sm.cell(rr,24,SLIDE0+a['id']).font=N
tr=first+len(R['areas'])
sm.cell(tr,1,'Total').font=B; sm.cell(tr,2,'19 priority areas').font=B
for j in [4,5,6,7]+list(range(8,20)):
    c=sm.cell(tr,j,f'=SUM({L(j)}{first}:{L(j)}{tr-1})'); c.font=B; c.number_format='#,##0'
c=sm.cell(tr,20,f'=IF(E{tr}>0,O{tr}/E{tr},"")'); c.font=B; c.number_format='0%'
for j in range(1,25): sm.cell(tr,j).border=Border(top=Side(style='medium'))
notes=['2021–2026 = built since census day (2021-05-11). 2026–2031 = the app Forecast\'s share of what is left to build placed in 2026–2031. Total to 2031 = the two added. Final growth = full build-out of the applications (2021–2026 + everything left to build).',
       'Homes built before census day are in the 2021 Census and are not counted. Population (map) and Area ha (map) are as printed on the Region PDF (blue).',
       'Check: final growth units here minus sheet Developments column N (should be 0) →']
for i,t in enumerate(notes): sm.cell(tr+2+i,1,t).font=Font(name=F,size=9,italic=True)
sm.cell(tr+4,11,f'=K{tr}-SUM(Developments!N2:N{last})').number_format='0;-0;"0 ✓"'
for j,w in enumerate([8,20,18,10,11,9,11]+[10]*12+[11,10,34,30,7],1): sm.column_dimensions[L(j)].width=w
sm.row_dimensions[5].height=32; sm.freeze_panes='C6'
# Boundary review
bw=wb.create_sheet('Boundary review',2)
bw['A1']='Boundary review: existing boundaries checked for each area, and the one used'; bw['A1'].font=Font(name=F,bold=True,size=13)
bw['A2']='Candidates = the app\'s secondary plans, MTSAs and precincts overlapping the Region box, best overlap first ("x map ha" = candidate size ÷ the Region\'s stated area). Parcels = the app\'s application parcels (≥50% in the box) with growth since 2021.'; bw['A2'].font=Font(name=F,italic=True,size=9)
hdr(bw,4,['Area ID','Area','Region map area (ha)','Region box (ha)','Boundary used','How chosen','Boundary used (ha)','Why','Candidate 1','Candidate 2','Candidate 3','Candidate 4','Developments counted elsewhere'])
for i,a in enumerate(R['areas']):
    rr=5+i
    cs=[f"{c['kind']}: {c['name']} · {c['ha']:,} ha ({c['ratio']}x map ha) · {c['pctIn']}% of it in box · {c['pctBox']}% of box" for c in C[a['code']]]+['']*4
    v=[a['code'],a['name'],a['mapHa'],a['boxHa'],{'user':'User direction','named':'Existing boundary','parcels':'Application parcels'}[a['mode']],a['mode'],a['boundaryHa'],a['why']]+cs[:4]+['; '.join(f"{t} → {c}" for k,c,t in a['moved'])]
    for j,x in enumerate(v,1):
        c=bw.cell(rr,j,x); c.font=N; c.alignment=Alignment(wrap_text=True,vertical='top')
    bw.cell(rr,1).hyperlink=f"#'{a['code']}'!A1"; bw.cell(rr,1).font=GREEN; bw.cell(rr,3).font=INP
for j,w in enumerate([8,18,10,10,18,9,10,55,40,40,40,40,26],1): bw.column_dimensions[L(j)].width=w
bw.freeze_panes='C5'
# Crosswalk
cw=wb.create_sheet('Crosswalk',3)
cw['A1']='Crosswalk: Region map points (V6 / V7 / V6 Revised) → nearest app application in the area'; cw['A1'].font=Font(name=F,bold=True,size=13)
cw['A2']='Points read from the PDF (approximate in dense clusters). Match = nearest counted application within 400 m of its parcel. Inside = the point falls inside the boundary used.'; cw['A2'].font=Font(name=F,italic=True,size=9)
hdr(cw,4,['Region point ID','Area ID','Area','Point type','Latitude','Longitude','Inside boundary used','Matched Dev ID','Matched development','Distance (m)','Units final growth','Res pop final growth'])
idx={x['id']:x for a in R['areas'] for x in a['rows']}; rr=5
for a in R['areas']:
    for d in a['dots']:
        m=idx.get(d['match'])
        v=[d['dot'],a['code'],a['name'],d['kind'],round(d['lat'],6),round(d['lon'],6),'yes' if d['inside'] else 'no',d['match'] or 'none within 400 m',d['matchTitle'],d['dist'],m['uF'] if m else None,m['pF'] if m else None]
        for j,x in enumerate(v,1): cw.cell(rr,j,x).font=N
        cw.cell(rr,2).hyperlink=f"#'{a['code']}'!A1"; cw.cell(rr,2).font=GREEN; cw.cell(rr,11).number_format='#,##0'; cw.cell(rr,12).number_format='#,##0'; rr+=1
for j,w in enumerate([13,8,20,18,11,11,10,18,38,10,12,12],1): cw.column_dimensions[L(j)].width=w
cw.freeze_panes='A5'
# Area sheets
for i,a in enumerate(R['areas']):
    ws=wb.create_sheet(a['code']); srow=first+i
    ws['A1']=f"{a['code']} · {a['name']}"; ws['A1'].font=Font(name=F,bold=True,size=14)
    c=ws['A2']; c.value='← Summary'; c.hyperlink=f"#'Summary'!A{srow}"; c.font=LINK
    c=ws['B2']; c.value='Boundary review'; c.hyperlink=f"#'Boundary review'!A{5+i}"; c.font=LINK
    ws['D2']=f"PPT slide {SLIDE0+a['id']} · app screenshot app-screens/{a['code']}_{slug(a['name'])}_app.png · Region map reference maps/{a['code']}_{slug(a['name'])}.png"; ws['D2'].font=Font(name=F,italic=True,size=9)
    ws['A3']=f"Boundary: {a['why']} ({a['boundaryHa']:,} ha; Region map {a['mapHa']} ha, population {a['mapPop']:,})."; ws['A3'].font=Font(name=F,italic=True,size=9)
    hdr(ws,5,['Growth since 2021 Census']+G4)
    for k,(lab,cs) in enumerate([('Units',('H','I','J','K')),('Residential population',('L','M','N','O')),('Jobs',('P','Q','R','S'))]):
        ws.cell(6+k,1,lab).font=B
        for j,cc in enumerate(cs):
            x=ws.cell(6+k,2+j,f"=Summary!{cc}{srow}"); x.font=GREEN; x.number_format='#,##0'
    hdr(ws,11,['Dev ID','Label','Development','Municipality','Stage','Plan','Planning files (status)','Parcel (ha)','Units 2021–26','Units 2026–31','Units to 2031','Units final','Pop 2021–26','Pop 2026–31','Pop to 2031','Pop final','Jobs 2021–26','Jobs 2026–31','Jobs to 2031','Jobs final','Expected year','Region point(s)','Note','Description'])
    dm={}
    for d in a['dots']:
        if d['match']: dm.setdefault(d['match'],[]).append(d['dot'])
    rr=12
    for x in a['rows']:
        v=[x['id'],int(x['id'].split('-')[1]),x['title'],x['municipality'],x['stage'],x['plan'],x['files'],x['parcelHa'],
           x['u26'],x['u2631'],f'=I{rr}+J{rr}',x['uF'],x['p26'],x['p2631'],f'=M{rr}+N{rr}',x['pF'],x['j26'],x['j2631'],f'=Q{rr}+R{rr}',x['jF'],x['expectedYear'],', '.join(dm.get(x['id'],[])),x['note'],x['description'][:400]]
        for j,val in enumerate(v,1):
            c=ws.cell(rr,j,val); c.font=N
            if 9<=j<=20: c.number_format='#,##0'
        rr+=1
    end=rr-1
    ws.cell(rr,3,'Total').font=B
    for j in range(9,21):
        c=ws.cell(rr,j,f'=SUM({L(j)}12:{L(j)}{end})' if end>=12 else 0); c.font=B; c.number_format='#,##0'
    ws['A10']='Check: rows below vs Summary (final units):'; ws['A10'].font=Font(name=F,size=9,italic=True)
    ws['D10']=f'=IF(ROUND(L{rr}-E6,0)=0,"OK: matches Summary","CHECK")'; ws['D10'].font=B
    for j,w in enumerate([11,6,34,12,16,24,44,9]+[10]*12+[9,14,30,60],1): ws.column_dimensions[L(j)].width=w
    ws.freeze_panes='D12'; ws.row_dimensions[11].height=30
    if end>=12: ws.auto_filter.ref=f"A11:X{end}"
wb.save(OUT); print('saved',last)
