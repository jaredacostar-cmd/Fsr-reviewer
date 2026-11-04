import json, copy
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_LABEL_POSITION
R=json.load(open('results2.json'))
D='/home/user/Fsr-reviewer/deliverables/priority-areas-2031'
OUT=f'{D}/Priority_Areas_2031_Growth_Analysis.pptx'
SLIDE0=10
BLUE=RGBColor(0x00,0x5B,0x9C); BLACK=RGBColor(0,0,0); GREY=RGBColor(0x4B,0x54,0x5B); RUST=RGBColor(0xCF,0x48,0x27); WHITE=RGBColor(255,255,255); LIGHT=RGBColor(0xE5,0xEE,0xF6)
def slug(n): return n.replace('/','-').replace(' ','_')
f0=lambda v: f"{round(v):,}"
prs=Presentation('../tpl/peel_base.pptx')
# drop the template's sample and instruction slides
sl=prs.slides._sldIdLst
for sid in list(sl):
    prs.part.drop_rel(sid.rId); sl.remove(sid)
LAY={l.name:l for l in prs.slide_layouts}
n=[0]
def new(layout, title=None):
    s=prs.slides.add_slide(LAY[layout]); n[0]+=1
    if title is not None and s.shapes.title is not None:
        s.shapes.title.text=title
        if layout.startswith(('Content','2-column','1-column')):
            for r in s.shapes.title.text_frame.paragraphs[0].runs: r.font.size=Pt(24)
    if layout not in ('Title - grey bar - Peel image','Title - simple - dark'):
        tb=s.shapes.add_textbox(Inches(8.63),Inches(5.21),Inches(0.86),Inches(0.3)); p=tb.text_frame.paragraphs[0]; p.text=str(n[0]); p.alignment=PP_ALIGN.RIGHT; p.runs[0].font.size=Pt(8); p.runs[0].font.color.rgb=GREY
        tb2=s.shapes.add_textbox(Inches(0.5),Inches(5.21),Inches(6),Inches(0.3)); q=tb2.text_frame.paragraphs[0]; q.text=f"Peel Growth Pipeline app · snapshot {R['generatedAt'][:10]} · growth since the 2021 Census · screening estimate"; q.runs[0].font.size=Pt(8); q.runs[0].font.color.rgb=GREY
    return s
def ph(s,idx):
    for p in s.placeholders:
        if p.placeholder_format.idx==idx: return p
def text(s,x,y,w,h,paras,size=12,color=BLACK,bullets=False,anchor=MSO_ANCHOR.TOP):
    tb=s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)); tf=tb.text_frame; tf.word_wrap=True; tf.vertical_anchor=anchor
    tf.margin_left=tf.margin_right=Inches(0.02)
    for i,pa in enumerate(paras):
        if isinstance(pa,str): pa={'t':pa}
        p=tf.paragraphs[0] if i==0 else tf.add_paragraph()
        r=p.add_run(); r.text=(('• ' if bullets and not pa.get('nob') else '')+pa['t']); r.font.size=Pt(pa.get('size',size)); r.font.bold=pa.get('b',False); r.font.italic=pa.get('i',False); r.font.color.rgb=pa.get('c',color)
        p.space_after=Pt(pa.get('after',4))
    return tb
def table(s,x,y,w,rows,colw,size=9,hdr_rows=1,rowh=0.2,bold_last=False,align=None):
    nr,nc=len(rows),len(rows[0])
    t=s.shapes.add_table(nr,nc,Inches(x),Inches(y),Inches(w),Inches(rowh*nr)).table
    for j,cw in enumerate(colw): t.columns[j].width=Inches(cw)
    for i,row in enumerate(rows):
        t.rows[i].height=Inches(rowh)
        for j,v in enumerate(row):
            c=t.cell(i,j); c.text=str(v) if v is not None else ''
            c.margin_left=c.margin_right=Inches(0.04); c.margin_top=c.margin_bottom=Inches(0.01); c.vertical_anchor=MSO_ANCHOR.MIDDLE
            p=c.text_frame.paragraphs[0]
            if p.runs:
                p.runs[0].font.size=Pt(size)
                if i<hdr_rows: p.runs[0].font.bold=True
                if bold_last and i==nr-1: p.runs[0].font.bold=True
            if align and i>=hdr_rows: p.alignment=align[j]
            elif j>0: p.alignment=PP_ALIGN.CENTER if i<hdr_rows else PP_ALIGN.RIGHT
    return t
T={k:sum(a['total'][k] for a in R['areas']) for k in R['areas'][0]['total']}
mapPop=sum(a['mapPop'] for a in R['areas']); nApps=sum(a['nApps'] for a in R['areas'])

# 1 Title
s=new('Title - grey bar - Peel image')
s.shapes.title.text='2031 priority areas: growth from applications'
for r in s.shapes.title.text_frame.paragraphs[0].runs: r.font.size=Pt(30)
ph(s,1).text='19 areas · growth since the 2021 Census'
ph(s,13).text=f"Peel Growth Pipeline app · {R['generatedAt'][:10]}"

# 2 Key numbers
s=new('Content with heading only - light',f"{f0(T['uF'])} homes of growth; {round(100*T['u31']/T['uF'])}% of it by 2031")
lab=[('2021–2026','built since census day','u26'),('2026–2031','forecast in the period','u2631'),('Total to 2031','2021–2026 + 2026–2031','u31'),('Final growth','full build-out of applications','uF')]
for i,(h,sub,k) in enumerate(lab):
    x=0.5+i*2.27
    sh=s.shapes.add_shape(5,Inches(x),Inches(1.3),Inches(2.1),Inches(1.6)); sh.fill.solid(); sh.fill.fore_color.rgb=BLUE if k=='uF' else LIGHT; sh.line.fill.background()
    sh.adjustments[0]=0.08
    text(s,x+0.12,1.42,1.9,0.3,[{'t':h,'b':True,'size':12,'c':WHITE if k=='uF' else BLUE}])
    text(s,x+0.12,1.72,1.9,0.55,[{'t':f0(T[k]),'b':True,'size':26,'c':WHITE if k=='uF' else BLUE}])
    text(s,x+0.12,2.25,1.9,0.6,[{'t':f"units · {f0(T['p'+k[1:]])} people",'size':8.5,'c':WHITE if k=='uF' else GREY,'after':0},{'t':f"{f0(T['j'+k[1:]])} jobs · {sub}",'size':8.5,'i':True,'c':WHITE if k=='uF' else GREY}])
text(s,0.5,3.05,9,2.1,[
 {'t':f"Growth is counted on top of the 2021 Census (census day 2021-05-11), from {nApps} planning applications in the app. Homes built before census day are already in the census and are not counted."},
 {'t':f"The applications add {f0(T['pF'])} residents at full build-out: {round(100*T['pF']/mapPop)}% of the {f0(mapPop)} people printed on the Region map. Where the Region is higher, the land has no application yet."},
 {'t':"Boundaries were reviewed against every secondary plan, MTSA and precinct the app holds (slides 3–4). Macville uses the Region's blue applications, and Steeles uses the whole MTSA."},
 {'t':f"Cross-references: area A08 = Excel sheet A08 = slide 18 (slide {SLIDE0} + area no.) = app-screens/A08_SP47_app.png. Development A08-012 is label 12 in the screenshot."}],size=11,bullets=True)

# 3 How growth is counted / boundaries
s=new('2-column content with subhead','How growth and boundaries are set')
ph(s,1).text='Four growth figures'
ph(s,3).text='One boundary rule'
def fill(p,items,size=11):
    tf=p.text_frame; tf.clear()
    for i,t in enumerate(items):
        q=tf.paragraphs[0] if i==0 else tf.add_paragraph(); q.text=t
        for r in q.runs: r.font.size=Pt(size)
fill(ph(s,2),['2021–2026: built since census day (permits completed; Brampton and Caledon dates estimated from issue date).','2026–2031: the app Forecast\'s share of what is left to build, placed in 2026–2031.','Total to 2031: the two added.','Final growth: full build-out of the applications.','People at Peel persons per unit by type. Jobs from the floor area on the applications.'],10.5)
fill(ph(s,4),['1. Your direction first: A01 Macville = the Region\'s blue applications (ArgoMcville, Bolton North Hill Op 1 and 2, Solmar). A15 = the whole Steeles at Mississauga MTSA.','2. An existing boundary where its size matches the Region\'s: A06 = Brookvalley (Mayfield West Phase 2) Secondary Plan, 438 ha vs 435.7 ha.','3. Otherwise the app\'s application parcels with at least half their land in the Region box. These match the Region\'s hectares best (e.g. North American Lands 27.6 vs 25.8 ha).'],10.5)

# 4 Boundary review table
s=new('Content with heading only - light','Boundary review for each area')
MODEW={'user':'Your direction','named':'Existing boundary','parcels':'App parcels'}
C=json.load(open('cands2.json'))
rows=[['Area','Boundary used','Used (ha)','Region (ha)','Best existing boundary checked (size vs Region ha)']]
for a in R['areas']:
    c=C[a['code']][0] if C[a['code']] else None
    nm={1:'Region blue applications',15:'Steeles at Mississauga MTSA',6:'Brookvalley Secondary Plan'}.get(a['id'],MODEW[a['mode']])
    rows.append([f"{a['code']} {a['name']}",nm,f"{a['boundaryHa']:,.0f}",f"{a['mapHa']:,.1f}",(f"{c['kind']}: {c['name'][:34]} · {c['ha']:,.0f} ha ({c['ratio']}×)" if c else '')])
table(s,0.5,1.2,9.0,rows,[1.85,1.75,0.65,0.7,4.05],size=7.5,rowh=0.193,align=[PP_ALIGN.LEFT,PP_ALIGN.LEFT,PP_ALIGN.RIGHT,PP_ALIGN.RIGHT,PP_ALIGN.LEFT])

# 5 Region map reference
s=new('Content with heading only - light','Reference: Region map and boundaries')
s.shapes.add_picture(f'{D}/maps/A00_overview.png',Inches(0.5),Inches(1.2),height=Inches(3.95))
text(s,4.75,1.3,4.75,3.8,[{'t':'Red dashed: the Region map boxes, georeferenced from the PDF (the map is rotated about 45°).'},{'t':'Blue: the boundary used for each area, either application parcels, the Brookvalley Secondary Plan or the Steeles MTSA.'},{'t':'Macville (A01) reaches past its box to take in the Region\'s blue Bolton North Hill and Solmar applications.'},{'t':'Per-area reference maps: maps/Axx_<name>.png, numbered like the app screenshots.'}],size=11,bullets=True)

# 6 App overview
s=new('Content with heading only - light','The 19 areas drawn in the app')
s.shapes.add_picture(f'{D}/app-screens/A00_all_areas_app.png',Inches(0.5),Inches(1.2),width=Inches(6.3))
text(s,7.0,1.3,2.5,3.8,[{'t':'The Peel Growth Pipeline full map, with each boundary drawn as the app\'s own selection and every counted application selected.'},{'t':'The app\'s panel totals the applications\' full build-out.'},{'t':'No basemap: the tile servers could not be reached when this was captured.','i':True}],size=10.5,bullets=True)

# 7 Summary table units + pop
s=new('Content with heading only - light','Growth by area: units and people')
rows=[['Area','Units 2021–26','Units 2026–31','Units to 2031','Units final','Pop 2021–26','Pop 2026–31','Pop to 2031','Pop final','Region map pop']]
for a in R['areas']:
    t=a['total']; rows.append([f"{a['code']} {a['name']}",f0(t['u26']),f0(t['u2631']),f0(t['u31']),f0(t['uF']),f0(t['p26']),f0(t['p2631']),f0(t['p31']),f0(t['pF']),f0(a['mapPop'])])
rows.append(['Total',f0(T['u26']),f0(T['u2631']),f0(T['u31']),f0(T['uF']),f0(T['p26']),f0(T['p2631']),f0(T['p31']),f0(T['pF']),f0(mapPop)])
table(s,0.5,1.2,9.0,rows,[1.8]+[0.8]*9,size=7.5,rowh=0.183,bold_last=True)

# 8 Jobs + chart
s=new('Content with heading only - light','Jobs, and the app against the Region')
rows=[['Area','Jobs 2021–26','2026–31','To 2031','Final']]
for a in R['areas']:
    t=a['total']; rows.append([f"{a['code']} {a['name']}",f0(t['j26']),f0(t['j2631']),f0(t['j31']),f0(t['jF'])])
rows.append(['Total',f0(T['j26']),f0(T['j2631']),f0(T['j31']),f0(T['jF'])])
table(s,0.5,1.2,4.2,rows,[1.8,0.6,0.6,0.6,0.6],size=7.5,rowh=0.183,bold_last=True)
cd=CategoryChartData(); cd.categories=[a['code'] for a in R['areas']]
cd.add_series('Final growth (app)',[round(a['total']['pF']) for a in R['areas']])
cd.add_series('Total to 2031 (app)',[round(a['total']['p31']) for a in R['areas']])
cd.add_series('Region map population',[a['mapPop'] for a in R['areas']])
gf=s.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED,Inches(4.9),Inches(1.15),Inches(4.6),Inches(3.95),cd); ch=gf.chart
ch.has_legend=True; ch.legend.position=XL_LEGEND_POSITION.TOP; ch.legend.include_in_layout=False; ch.legend.font.size=Pt(8)
ch.has_title=True; ch.chart_title.text_frame.text='Residential population by area'; ch.chart_title.text_frame.paragraphs[0].runs[0].font.size=Pt(10)
ca=ch.category_axis; ca.reverse_order=True; ca.tick_labels.font.size=Pt(7.5)
va=ch.value_axis; va.tick_labels.font.size=Pt(7.5); va.has_major_gridlines=True; va.major_gridlines.format.line.color.rgb=RGBColor(0xDD,0xDD,0xDD); va.tick_labels.number_format='#,##0'; va.tick_labels.number_format_is_linked=False
for ser,col in zip(ch.plots[0].series,[BLUE,RGBColor(0x7F,0xAD,0xD6),RUST]): ser.format.fill.solid(); ser.format.fill.fore_color.rgb=col
ch.plots[0].gap_width=40

# 9 Crosswalk
s=new('Content with heading only - light','Crosswalk: Region map points')
rows=[['Area','Region points','Matched ≤400 m','Inside boundary','Applications counted','Main app plan']]
for a in R['areas']:
    plans=__import__('collections').Counter(r['plan'] for r in a['rows'] if r['plan']).most_common(1)
    rows.append([f"{a['code']} {a['name']}",len(a['dots']),sum(1 for d in a['dots'] if d['match']),sum(1 for d in a['dots'] if d['inside']),a['nApps'],plans[0][0][:24] if plans else ''])
table(s,0.5,1.2,6.5,rows,[1.75,0.65,0.75,0.7,0.85,1.8],size=7,rowh=0.185,align=[PP_ALIGN.LEFT]+[PP_ALIGN.CENTER]*4+[PP_ALIGN.LEFT])
nd=sum(len(a['dots']) for a in R['areas']); nm=sum(1 for a in R['areas'] for d in a['dots'] if d['match'])
text(s,7.1,1.3,2.4,3.8,[{'t':f"{nm} of {nd} Region points sit within 400 m of a counted application."},{'t':'"Inside boundary" is lower where the Region\'s point sits beside the parcel rather than on it.'},{'t':'Point-by-point detail: Excel sheet "Crosswalk".'}],size=10.5,bullets=True)

# 10 Section
s=new('Section - dark','Area by area')
ph(s,1).text='Each area: the app screenshot, its growth and its largest applications'

# 11-29 areas
for a in R['areas']:
    t=a['total']
    s=new('Content with heading only - light',f"{a['code']} · {a['name']}")
    s.shapes.add_picture(f"{D}/app-screens/{a['code']}_{slug(a['name'])}_app.png",Inches(0.5),Inches(1.2),width=Inches(5.6))
    text(s,0.5,4.74,5.6,0.45,[{'t':f"App screenshot: the boundary used is drawn as an app selection, with each application labelled ({a['code']}-###). Region map reference: maps/{a['code']}_{slug(a['name'])}.png",'size':7.5,'i':True,'c':GREY}])
    rows=[['Growth','2021–26','2026–31','To 2031','Final'],['Units',f0(t['u26']),f0(t['u2631']),f0(t['u31']),f0(t['uF'])],['People',f0(t['p26']),f0(t['p2631']),f0(t['p31']),f0(t['pF'])],['Jobs',f0(t['j26']),f0(t['j2631']),f0(t['j31']),f0(t['jF'])]]
    table(s,6.3,1.2,3.2,rows,[0.6,0.65,0.65,0.65,0.65],size=8.5,rowh=0.24)
    bd={1:"the Region's blue applications plus the two in its box",15:'the whole Steeles at Mississauga MTSA',6:'the Brookvalley Secondary Plan'}.get(a['id'],'app application parcels (≥50% in the Region box)')
    mv=f" {'; '.join(x[2] for x in a['moved'])} counted in {a['moved'][0][1]}." if a['moved'] else ''
    text(s,6.3,2.25,3.2,0.95,[{'t':f"Boundary: {bd}, {a['boundaryHa']:,.0f} ha (Region map {a['mapHa']} ha).{mv}"},{'t':f"Region map: {f0(a['mapPop'])} people. App final growth = {round(100*t['pF']/a['mapPop'])}% of that. {sum(1 for d in a['dots'] if d['match'])} of {len(a['dots'])} Region points matched."}],size=8.5,color=GREY)
    top=a['rows'][:5]
    rows=[['No. / development','Stage','Final','2031']]+[[f"{int(r['id'].split('-')[1])}  {r['title'][:19]}",r['stage'].replace('Under construction','Under constr.'),f0(r['uF']),f0(r['u31'])] for r in top]
    table(s,6.3,3.25,3.2,rows,[1.45,0.85,0.45,0.45],size=7.5,rowh=0.22,align=[PP_ALIGN.LEFT,PP_ALIGN.LEFT,PP_ALIGN.RIGHT,PP_ALIGN.RIGHT])
    text(s,6.3,4.72,3.2,0.3,[{'t':f"Largest {len(top)} of {a['nApps']} applications (units). All: Excel sheet {a['code']}.",'size':7.5,'i':True,'c':GREY}])
    s.notes_slide.notes_text_frame.text=f"{a['code']} {a['name']}: {a['why']}\n"+'\n'.join(f"{r['id']} {r['title']} | {r['stage']} | final {f0(r['uF'])} units, to 2031 {f0(r['u31'])} | {r['files']}" for r in a['rows'])

# 30 Method & caveats
s=new('2-column content','Method and caveats')
fill(ph(s,1),['Every figure comes from the Peel Growth Pipeline app\'s own modules, run on its published snapshot.','2021 Census base: only growth from census day (2021-05-11) is counted.','Region boxes were georeferenced from the PDF by fitting municipal boundaries (~160 m).','Each development counts in one area. Building-permit-only infill is not counted.'],10.5)
fill(ph(s,2),['Unofficial screening estimate from public data, not the Region\'s capacity ledger.','Lands with no application in the app are not counted, so the Region\'s figures can be higher.','Untimed applications (e.g. the Heritage / Bovaird block) add nothing by 2031.','Jobs exist only where applications state floor area.'],10.5)

# 31 closing
s=new('Thank you - Peel image','Thank you')
for p in s.placeholders:
    if p.placeholder_format.idx in (19,2,20): p.text={19:'2031 priority areas',2:'Growth analysis',20:'Details: the Excel workbook'}[p.placeholder_format.idx]
prs.save(OUT); print('slides',n[0])
