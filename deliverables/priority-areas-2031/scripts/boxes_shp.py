# The 19 Region map boxes as a shapefile (NAD83 / UTM 17N, EPSG:26917), drawn in the map's own frame:
#   PriorityArea_Boxes        as on the Region map, A01 Macville enlarged to enclose all its developments
#   PriorityArea_Boxes_Fitted every box enlarged to enclose all the land counted for its area
# Also writes the resized A01 box back into results2.json so the maps, deck and workbook match.
import json, os, warnings, shapefile; warnings.filterwarnings('ignore')
exec(open('areas.py').read())
from shapely.geometry import Polygon, shape
from shapely.ops import transform
from pyproj import CRS
TU=Transformer.from_crs(4326,26917,always_xy=True).transform
OUT='/home/user/Fsr-reviewer/deliverables/priority-areas-2031/gis'; os.makedirs(OUT,exist_ok=True)
R=json.load(open('results2.json'))
MARGIN=6  # px at 300 dpi on the Region map, about 100 m
def px_bounds(geo):
    g=shape(geo); polys=[g] if g.geom_type=='Polygon' else list(g.geoms)
    pts=[ll2px(x,y) for p in polys for x,y in p.exterior.coords]
    return min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts)
def enclose(px,geo):
    x0,y0,x1,y1=px; a,b,c,d=px_bounds(geo)
    return (a-MARGIN if a<x0 else x0, b-MARGIN if b<y0 else y0, c+MARGIN if c>x1 else x1, d+MARGIN if d>y1 else y1)
def ring(px):
    x0,y0,x1,y1=px; return [px2ll(x,y) for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]
def utm(r): return [TU(x,y) for x,y in r]
prj=CRS.from_epsg(26917).to_wkt(version='WKT1_ESRI')
def write(name,boxes):
    w=shapefile.Writer(f'{OUT}/{name}',shapeType=shapefile.POLYGON)
    for f,t,s,d in [('AREA_ID','C',4,0),('NAME','C',30,0),('MUNI','C',12,0),('BOX_HA','N',10,1),('RESIZED','C',1,0),('N_APPS','N',5,0),
                    ('U_2126','N',10,0),('U_2631','N',10,0),('U_TO2031','N',10,0),('U_FINAL','N',10,0),
                    ('P_2126','N',10,0),('P_2631','N',10,0),('P_TO2031','N',10,0),('P_FINAL','N',10,0),
                    ('J_2126','N',10,0),('J_2631','N',10,0),('J_TO2031','N',10,0),('J_FINAL','N',10,0),
                    ('BOUNDARY','C',20,0),('PPT_SLIDE','N',3,0),('EXCEL','C',10,0),('NOTE','C',120,0)]:
        w.field(f,t,s,d)
    for a,px,resized,note in boxes:
        r=utm(ring(px)); poly=Polygon(r)
        if poly.exterior.is_ccw: r=r[::-1]      # shapefile outer rings run clockwise
        w.poly([r+[r[0]]])
        t=a['total']
        w.record(a['code'],a['name'],a['municipalityLabel'],round(poly.area/1e4,1),'Y' if resized else 'N',a['nApps'],
                 *[round(t[k]) for k in ['u26','u2631','u31','uF','p26','p2631','p31','pF','j26','j2631','j31','jF']],
                 {'user':'User direction','named':'Existing boundary','parcels':'App parcels'}[a['mode']],10+a['id'],a['code'],note)
    w.close()
    open(f'{OUT}/{name}.prj','w').write(prj); open(f'{OUT}/{name}.cpg','w').write('UTF-8')
main,fit=[],[]
for a in R['areas']:
    px=tuple(a.get('px_original',a['px']))
    if a['id']==1:
        npx=enclose(px,a['boundary'])
        main.append((a,npx,True,'Enlarged from the Region map box to enclose all Macville developments (ArgoMcville, Bolton North Hill, Solmar)'))
    else:
        main.append((a,px,False,'As drawn on the Region map'))
    fpx=enclose(px,a['boundary']); grew=fpx!=px
    fit.append((a,fpx,grew,'Enlarged to enclose all land counted for the area' if grew else 'Already encloses all land counted'))
write('PriorityArea_Boxes',main); write('PriorityArea_Boxes_Fitted',fit)
# keep the resized Macville box everywhere else
a=R['areas'][0]; a.setdefault('px_original',a['px']); a.setdefault('ring_original',a['ring'])
a['px']=list(main[0][1]); a['ring']=ring(main[0][1]); a['boxHa']=round(Polygon(utm(a['ring'])).area/1e4,1)
json.dump(R,open('results2.json','w'))
for (a,px,_,_),(b,fpx,g,_) in zip(main,fit):
    print(f"{a['code']} {a['name']:20} box {Polygon(utm(ring(px))).area/1e4:7.1f} ha | fitted {Polygon(utm(ring(fpx))).area/1e4:7.1f} ha{'  (enlarged)' if g else ''}")
