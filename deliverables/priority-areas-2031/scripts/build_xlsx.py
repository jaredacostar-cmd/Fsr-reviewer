import json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.table import Table, TableStyleInfo
R=json.load(open('results.json'))
OUT='/home/user/Fsr-reviewer/deliverables/priority-areas-2031/Priority_Areas_2031_Population_Analysis.xlsx'
PPT='Priority_Areas_2031_Population_Analysis.pptx'
SLIDE0=7
def slug(n): return n.replace('/','-').replace(' ','_')
F='Arial'
H=Font(name=F,bold=True,color='FFFFFF'); HF=PatternFill('solid',fgColor='7A0000')
SUB=PatternFill('solid',fgColor='F2DCDB'); B=Font(name=F,bold=True); N=Font(name=F); LINK=Font(name=F,color='0563C1',underline='single'); GREEN=Font(name=F,color='008000'); BLUE=Font(name=F,color='0000FF')
thin=Side(style='thin',color='BFBFBF')
def hdr(ws,row,cols,start=1):
    for i,c in enumerate(cols):
        x=ws.cell(row,start+i,c); x.font=H; x.fill=HF; x.alignment=Alignment(wrap_text=True,vertical='center',horizontal='center')
def font_all(ws):
    for row in ws.iter_rows():
        for c in row:
            if c.font and c.font.name!=F: c.font=c.font.copy(name=F)
wb=Workbook()
# ---------------- Read Me ----------------
rm=wb.active; rm.title='Read Me'
lines=[
('Scenario 1 2031 Priority Areas: population analysis from the Peel Growth Pipeline app',True),
('',False),
('What this is',True),
('A crosswalk between the 19 priority areas on the Region map "4507-WW-Development Application Modelling Update" (Scenario 1 2031, 2026-05-20) and the developments in the Peel Growth Pipeline app (this repository).',False),
(f"App data: the app's published snapshot of {R['generatedAt'][:10]} (planning applications and new-build permits, 2016 on). Every figure was computed by the app itself: it was loaded headless and read from its own modules (PeelDemand.estimate, PeelPhases.unbuiltOf, PeelLedger + PeelTiming forecast, PeelEmployment).",False),
('',False),
('The three linked deliverables (cross-reference keys)',True),
('Area ID A01–A19 is used everywhere: Excel sheet "A08" = PPT slide 15 (slide = 7 + area no.) = app screenshot app-screens/A08_SP47_app.png. Every development has an ID such as A08-012; the number 12 is its label in the app screenshot, and its row on sheet A08 and in sheet Developments.',False),
('App screenshots (app-screens/): the Peel Growth Pipeline full map with each area drawn as the app\'s own selection and every development in it selected; the app\'s panel shows the developments\' full size (pre-2021 included). The Region map crops in maps/ are kept as a reference, with the same numbering.',False),
('Region map points (dots) are given IDs A08-R1… on sheet Crosswalk, with the nearest app planning application (within 400 m) and its development ID.',False),
('',False),
('Area boundaries',True),
('Each area is the red box drawn on the Region PDF map, georeferenced to NAD83 / UTM 17N by fitting the map\'s municipal boundaries to the app\'s boundaries (scale matches the stated 1:192,036 to 0.02%; mean fit error ~10 px at 300 dpi ≈ 160 m). The map is rotated ~45°, so each box is a rotated rectangle on the ground. Box areas (ha) are larger than the Region\'s stated areas because the boxes frame the sites, not the planning boundaries. A development is in an area when its app location (its site point) falls inside the box.',False),
('Names follow the Region map labels and leader lines, checked against the app\'s plan names (e.g. A09 holds "52: Heritage Heights", A08 "47: Highway 427 Industrial", A13 "7: Downtown Brampton", A16 "55: Hurontario-Main Corridor"). Leader lines for Macville / Dixie Road / Humber Station / Airport Road cross each other on the PDF; those four were assigned by geography (A01 at King St / Humber Station Rd, A04 at Dixie Rd / Mayfield Rd).',False),
('',False),
('Definitions (the app\'s own)',True),
('BASIS: every figure is GROWTH ON TOP OF THE 2021 CENSUS (census day 2021-05-11), for hydraulic models whose base year is the 2021 Census. Anything built before census day is already in the census and is shown separately ("Built before census day"), never added in.',True),
('Existing (2021–2026) = units built in these developments from census day 2021-05-11 to the app snapshot (Oct 2026): every building permit completed since census day, the app\'s own count (PeelAreas.growthSince, as in Growth › 2021 existing "+ Built since"). Where a city publishes no completion date (Brampton, Caledon), completion is estimated from the permit issue date + 12 months (+30 months for 20+ units), as the app does. Jobs existing = jobs of developments completed since census day.',False),
('Anticipated 2031 (growth 2021–2031) = Existing 2021–2026 + the share of units left to build that the app\'s Forecast places in 2026–2031 (Growth › Forecast › By period, column "2026 to 2031"; PeelLedger.bucketShares from the PeelTiming time-in-stage model). Developments the forecast does not time count nothing by 2031.',False),
('Build-out (growth since 2021) = Existing 2021–2026 + everything left to build (PeelPhases.unbuiltOf). Withdrawn/refused developments are excluded. Add "Built before census day" to get the developments\' full size.',False),
('Built before census day (reference) = units / people / jobs of these developments completed before 2021-05-11, already counted in the 2021 Census: do not add to a 2021-based model.',False),
('Residential population = units × persons per unit by dwelling type (Peel DC standard: single/semi 4.2, town 3.4, apartment 3.1 or 2.7 above 475 persons/ha, type not stated 2.7).',False),
('Jobs = non-residential floor area on the applications ÷ m² per job (app default). Existing jobs = jobs of built developments. 2031 jobs = existing + jobs of mixed-use sites in proportion to their 2031 homes + all jobs of employment-only sites that are Plan approved, Building permit or Under construction (the app counts employment by phase: committed = approved to under construction). Applications stating no floor area carry no jobs.',False),
('Kind: "Planning application" = a development with at least one planning file (pre-consultation, OPA/ZBA, draft plan, site plan, condo). "Building permit only" = new-build permits with no planning file in the app\'s data (infill and lots in subdivisions registered before 2016). Both are counted in the totals; sheet "Summary" also shows planning applications on their own.',False),
('',False),
('Colour key',True),
('Black = values/formulas · Green = links to another sheet · Blue = values read from the Region PDF map (population and hectares as printed).',False),
('',False),
('Caveats',True),
('Unofficial screening estimate from public data; not the Region\'s committed capacity ledger. Box boundaries are approximations of the Region\'s areas; developments near a box edge may belong to a neighbouring area. Region map points not matched to an app application (sheet Crosswalk) are sites the Region models that the app has no planning application for within 400 m: usually lands with no file yet (e.g. A06 McLaughlin Road, A02 Humber Station).',False),
]
for i,(t,b) in enumerate(lines,1):
    c=rm.cell(i,1,t); c.font=Font(name=F,bold=b,size=14 if i==1 else 10); c.alignment=Alignment(wrap_text=True,vertical='top')
rm.column_dimensions['A'].width=150
# ---------------- Developments (master) ----------------
dv=wb.create_sheet('Developments')
cols=['Dev ID','Area ID','Area','Kind','Development (app title)','Municipality','Stage (app)','Plan (app)','Planning files (status)','Building permits',
      'Units build-out (growth since 2021)','Units existing (built 2021–2026)','Units 2031 (growth 2021–2031)','Res pop build-out (growth since 2021)','Res pop existing (2021–2026)','Res pop 2031 (growth 2021–2031)','Jobs build-out (growth since 2021)','Jobs existing (2021–2026)','Jobs 2031 (growth 2021–2031)',
      'Units built before census day (in 2021 Census)','Res pop built before census day','Jobs built before census day','Share of left-to-build by 2031','Expected year (likely)','Expected range','Forecast tier','Employment uses','Non-res floor area (m²)','Description','Latitude','Longitude','App key']
hdr(dv,1,cols)
r=2
for a in R['areas']:
    for x in a['rows']:
        vals=[x['id'],a['code'],a['name'],x['kind'],x['title'],x['municipality'],x['stage'],x['plan'],x['files'],x['permits'],
              x['u_bo'],x['u_ex'],x['u_31'],x['p_bo'],x['p_ex'],x['p_31'],x['j_bo'],x['j_ex'],x['j_31'],x['u_pre'],x['p_pre'],x['j_pre'],
              x['share2031'],x['expectedYear'],f"{x['expLow']}–{x['expHigh']}" if x['expLow'] else '',x['tier'] or '',x['employmentUses'],x['nonresM2'] or None,x['description'][:500],round(x['lat'],6),round(x['lng'],6),x['key']]
        for j,v in enumerate(vals,1):
            c=dv.cell(r,j,v); c.font=N
        dv.cell(r,2).hyperlink=f"#'{a['code']}'!A1"; dv.cell(r,2).font=GREEN
        r+=1
last=r-1
for j in range(11,23): 
    for i in range(2,r): dv.cell(i,j).number_format='#,##0'
for i in range(2,r): dv.cell(i,23).number_format='0%'
widths=[11,8,20,20,38,13,17,26,50,9]+[12]*12+[10,10,11,8,30,12,60,11,11,30]
for j,w in enumerate(widths,1): dv.column_dimensions[L(j)].width=w
dv.freeze_panes='C2'; dv.auto_filter.ref=f"A1:{L(len(cols))}{last}"
DEVR=f"Developments!$B$2:$B${last}"; KIND=f"Developments!$D$2:$D${last}"
col={'u_bo':'K','u_ex':'L','u_31':'M','p_bo':'N','p_ex':'O','p_31':'P','j_bo':'Q','j_ex':'R','j_31':'S','u_pre':'T','p_pre':'U','j_pre':'V'}
# ---------------- Summary ----------------
sm=wb.create_sheet('Summary',1)
sm['A1']='Scenario 1 2031 Priority Areas: growth on top of the 2021 Census (units, residential population, jobs) from the Peel Growth Pipeline app'; sm['A1'].font=Font(name=F,bold=True,size=14)
sm['A2']=f"Basis: 2021 Census (census day 2021-05-11). Existing = built 2021-05-11 to Oct 2026; 2031 = growth 2021–2031; build-out = growth since 2021 at full build-out. All developments in each area (planning applications + building-permit-only). App snapshot {R['generatedAt'][:10]}. Formulas sum sheet 'Developments'. Excel sheet Axx = PPT slide 7+xx = app-screens/Axx_*_app.png."
sm['A2'].font=Font(name=F,italic=True,size=9)
def block(top,title,crit):
    sm.cell(top,1,title).font=Font(name=F,bold=True,size=12)
    groups=[('Area',1,6),('Region map (PDF)',7,8),('App developments',9,11),('Units: growth since 2021 Census',12,14),('Residential population: growth since 2021 Census',15,17),('Jobs: growth since 2021 Census',18,20),('Compare',21,21),('Cross-reference',22,24),('Built before census day (already in 2021 Census; reference only)',25,27)]
    for g,a_,b_ in groups:
        sm.merge_cells(start_row=top+1,start_column=a_,end_row=top+1,end_column=b_); c=sm.cell(top+1,a_,g); c.font=B; c.fill=SUB; c.alignment=Alignment(horizontal='center')
    hdr(sm,top+2,['Area ID','Area','Municipality (map)','Box area (ha)','Main app plan','Municipalities in box','Population (map)','Area ha (map)','Developments','Planning applications','Permit-only',
                  'Build-out','Existing 2021–26','2031','Build-out','Existing 2021–26','2031','Build-out','Existing 2021–26','2031','App build-out pop ÷ map pop','Excel sheet','App screenshot','PPT slide','Units','Res pop','Jobs'])
    first=top+3
    for k,a in enumerate(R['areas']):
        rr=first+k
        import collections
        plan=collections.Counter(x['plan'] for x in a['rows'] if x['plan']).most_common(1)
        v=[a['code'],a['name'],a['municipalityLabel'],a['boxHa'],plan[0][0] if plan else '',', '.join(f"{m} {n}" for m,n in a['munis'].items()),a['mapPop'],a['mapHa']]
        for j,x in enumerate(v,1): sm.cell(rr,j,x).font=N
        sm.cell(rr,7).font=BLUE; sm.cell(rr,8).font=BLUE
        sm.cell(rr,9,f'=COUNTIFS({DEVR},$A{rr}{crit})')
        sm.cell(rr,10,f'=COUNTIFS({DEVR},$A{rr},{KIND},"Planning application")')
        sm.cell(rr,11,f'=COUNTIFS({DEVR},$A{rr},{KIND},"Building permit only")' if not crit else 0)
        for j,k2 in enumerate(['u_bo','u_ex','u_31','p_bo','p_ex','p_31','j_bo','j_ex','j_31'],12):
            c=col[k2]; sm.cell(rr,j,f'=SUMIFS(Developments!${c}$2:${c}${last},{DEVR},$A{rr}{crit})').number_format='#,##0'
        sm.cell(rr,21,f'=IF(G{rr}>0,O{rr}/G{rr},"")').number_format='0%'
        for j,k2 in enumerate(['u_pre','p_pre','j_pre'],25):
            c=col[k2]; x=sm.cell(rr,j,f'=SUMIFS(Developments!${c}$2:${c}${last},{DEVR},$A{rr}{crit})'); x.number_format='#,##0'; x.font=Font(name=F,color='7F7F7F')
        c=sm.cell(rr,22,f"Sheet {a['code']}"); c.hyperlink=f"#'{a['code']}'!A1"; c.font=LINK
        sm.cell(rr,23,f"app-screens/{a['code']}_{slug(a['name'])}_app.png").font=N
        sm.cell(rr,24,SLIDE0+a['id']).font=N
        sm.cell(rr,4).number_format='#,##0'
    tr=first+len(R['areas'])
    sm.cell(tr,1,'Total').font=B; sm.cell(tr,2,'19 priority areas').font=B
    for j in [7,8,9,10,11]+list(range(12,21))+[25,26,27]:
        c=sm.cell(tr,j,f'=SUM({L(j)}{first}:{L(j)}{tr-1})'); c.font=B; c.number_format='#,##0'
    c=sm.cell(tr,21,f'=IF(G{tr}>0,O{tr}/G{tr},"")'); c.font=B; c.number_format='0%'
    for j in range(1,28): sm.cell(tr,j).border=Border(top=Side(style='medium'))
    return first,tr
f1,t1=block(4,'A. All developments (planning applications + building-permit-only)','')
f2,t2=block(t1+3,'B. Planning applications only','' + f',{KIND},"Planning application"')
nt=t2+2
for i,t in enumerate(['Notes: all figures are growth on top of the 2021 Census. Existing 2021–26 = built since census day 2021-05-11 (app: every permit completed since census day). 2031 = existing 2021–26 + the app Forecast\'s 2026–2031 share of units left to build. Build-out = existing 2021–26 + left to build. Columns Y–AA (grey) = built before census day: already in the 2021 Census, do not add.',
                      'Population (map) and Area ha (map) are as printed on the Region PDF (blue). App build-out pop ÷ map pop compares the app\'s population at build-out with the Region\'s figure for the area; the app counts only what has been applied for.',
                      'Check: block A total build-out units should equal the sum of sheet Developments column K →']):
    sm.cell(nt+i,1,t).font=Font(name=F,size=9,italic=True)
sm.cell(nt+2,12,f'=SUM(Developments!K2:K{last})-L{t1}').number_format='#,##0;-#,##0;"0 ✓"'
for j,w in enumerate([8,20,13,9,26,28,11,9,11,11,9,10,10,10,10,10,10,10,10,10,11,10,30,7,10,10,10],1): sm.column_dimensions[L(j)].width=w
sm.row_dimensions[6].height=30; sm.freeze_panes='C7'
# ---------------- Crosswalk ----------------
cw=wb.create_sheet('Crosswalk',2)
cw['A1']='Crosswalk: Region map points (V6 / V7 / V6 Revised) → nearest app planning application'; cw['A1'].font=Font(name=F,bold=True,size=13)
cw['A2']='Points read from the PDF map (overlapping points are split by size, so counts in dense clusters are approximate). Match = nearest planning application in the same area within 400 m.'; cw['A2'].font=Font(name=F,italic=True,size=9)
hdr(cw,4,['Region point ID','Area ID','Area','Point type (map legend)','Latitude','Longitude','Matched Dev ID','Matched development (app)','Distance (m)','Stage','Units build-out','Res pop build-out','Planning files'])
rr=5
idx={x['id']:x for a in R['areas'] for x in a['rows']}
for a in R['areas']:
    for d in a['dots']:
        m=idx.get(d['match'])
        v=[d['dot'],a['code'],a['name'],d['kind'],round(d['lat'],6),round(d['lon'],6),d['match'] or 'no app within 400 m',d['matchTitle'],d['dist'],m['stage'] if m else '',m['u_bo'] if m else None,m['p_bo'] if m else None,m['files'] if m else '']
        for j,x in enumerate(v,1): cw.cell(rr,j,x).font=N
        cw.cell(rr,2).hyperlink=f"#'{a['code']}'!A1"; cw.cell(rr,2).font=GREEN
        cw.cell(rr,11).number_format='#,##0'; cw.cell(rr,12).number_format='#,##0'
        rr+=1
for j,w in enumerate([13,8,20,18,11,11,18,40,11,16,11,11,60],1): cw.column_dimensions[L(j)].width=w
cw.freeze_panes='A5'; cw.auto_filter.ref=f"A4:M{rr-1}"
# ---------------- Area sheets ----------------
for k,a in enumerate(R['areas']):
    ws=wb.create_sheet(a['code'])
    srow=f1+k
    ws['A1']=f"{a['code']} · {a['name']}"; ws['A1'].font=Font(name=F,bold=True,size=14)
    c=ws['A2']; c.value='← Summary'; c.hyperlink=f"#'Summary'!A{srow}"; c.font=LINK
    ws['C2']=f"PPT slide {SLIDE0+a['id']} · app screenshot: app-screens/{a['code']}_{slug(a['name'])}_app.png · Region map reference: maps/{a['code']}_{slug(a['name'])}.png · Region map: population {a['mapPop']:,}, {a['mapHa']} ha"; ws['C2'].font=Font(name=F,italic=True,size=9)
    ws['A3']='Growth on top of the 2021 Census (census day 2021-05-11). Built before census day is already in the census: reference only.'; ws['A3'].font=Font(name=F,italic=True,size=9)
    hdr(ws,4,['','Build-out (since 2021)','Existing 2021–26','2031 (2021–31)','Built before census day'])
    for i,(lab,cs) in enumerate([('Units',('L','M','N','Y')),('Residential population',('O','P','Q','Z')),('Jobs',('R','S','T','AA'))]):
        ws.cell(5+i,1,lab).font=B
        for j,cc in enumerate(cs):
            c=ws.cell(5+i,2+j,f"=Summary!{cc}{srow}"); c.font=GREEN; c.number_format='#,##0'
    ws.cell(8,1,'Planning applications / permit-only').font=B
    ws.cell(8,2,f"=Summary!J{srow}").font=GREEN; ws.cell(8,3,f"=Summary!K{srow}").font=GREEN
    ws.cell(9,1,'Check: rows below = Summary (units build-out)').font=Font(name=F,size=9,italic=True)
    hdr(ws,11,['Dev ID','Map label','Kind','Development','Municipality','Stage','Plan','Planning files (status)','Units build-out (since 2021)','Units existing 2021–26','Units 2031 (2021–31)','Res pop build-out (since 2021)','Res pop existing 2021–26','Res pop 2031 (2021–31)','Jobs build-out (since 2021)','Jobs existing 2021–26','Jobs 2031 (2021–31)','Expected year','Region point(s) matched','Units built before census day','Description'])
    dm={}
    for d in a['dots']:
        if d['match']: dm.setdefault(d['match'],[]).append(d['dot'])
    rr=12
    for x in a['rows']:
        v=[x['id'],int(x['id'].split('-')[1]) if x['kind']=='Planning application' else '',x['kind'],x['title'],x['municipality'],x['stage'],x['plan'],x['files'],
           x['u_bo'],x['u_ex'],x['u_31'],x['p_bo'],x['p_ex'],x['p_31'],x['j_bo'],x['j_ex'],x['j_31'],x['expectedYear'],', '.join(dm.get(x['id'],[])),x['u_pre'],x['description'][:400]]
        for j,val in enumerate(v,1):
            c=ws.cell(rr,j,val); c.font=N
            if 9<=j<=17 or j==20: c.number_format='#,##0'
        rr+=1
    end=rr-1
    ws.cell(rr,4,'Total').font=B
    for j in list(range(9,18))+[20]:
        c=ws.cell(rr,j,f'=SUM({L(j)}12:{L(j)}{end})'); c.font=B; c.number_format='#,##0'
    ws.cell(9,4,f'=IF(ROUND(I{rr}-B5,0)=0,"OK: matches Summary","CHECK")').font=B
    for j,w in enumerate([11,7,19,38,12,16,24,45,11,11,11,11,11,11,11,11,11,9,14,11,60],1): ws.column_dimensions[L(j)].width=w
    ws.freeze_panes='E12'; ws.auto_filter.ref=f"A11:U{end}"
font_all(wb['Summary'])
wb.save(OUT); print('saved',OUT,last)
