import json, warnings; warnings.filterwarnings('ignore')
from shapely.geometry import Polygon
from shapely.ops import transform, unary_union
from pyproj import Transformer
tr=Transformer.from_crs(4326,26917,always_xy=True).transform
A=json.load(open('/home/user/Fsr-reviewer/data/areas.json')); R=json.load(open('results2.json'))
KIND={'secondaryPlans':'Secondary plan','mtsas':'MTSA','precincts':'Precinct'}
cands=[]
for kind in KIND:
    for f in A[kind]:
        try: cands.append((KIND[kind],f['name'],f['municipality'],transform(tr,unary_union([Polygon(r).buffer(0) for r in f['rings'] if len(r)>=4]))))
        except Exception: pass
out={}
for a in R['areas']:
    box=transform(tr,Polygon(a['ring'])); L=[]
    for k,n,m,g in cands:
        i=box.intersection(g).area
        if i<=0 or g.area<1: continue
        L.append(dict(kind=k,name=n,muni=m,ha=round(g.area/1e4,1),pctIn=round(100*i/g.area),pctBox=round(100*i/box.area),ratio=round(g.area/1e4/a['mapHa'],2)))
    L.sort(key=lambda x:-(x['pctIn']*x['pctBox']))
    out[a['code']]=L[:4]
json.dump(out,open('cands2.json','w')); print({k:len(v) for k,v in out.items()})
