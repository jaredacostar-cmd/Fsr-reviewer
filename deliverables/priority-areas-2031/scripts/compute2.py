# Growth (2021 Census base) for the 19 priority areas, on reviewed boundaries:
#   user  : the user's own choice (A01 Macville = the Region's blue applications; A15 = the whole MTSA)
#   named : an existing boundary in the app whose size matches the Region's hectares (A06 Brookvalley)
#   parcels: the app's application parcels with at least half their land in the Region box (everywhere else)
# Only planning applications with growth since census day (2021-05-11) count; a development counts in one area.
import json, warnings, numpy as np, collections; warnings.filterwarnings('ignore')
exec(open('areas.py').read())
from shapely.geometry import Polygon, Point, mapping, shape
from shapely.ops import transform, unary_union
from pyproj import Transformer
TU=Transformer.from_crs(4326,26917,always_xy=True).transform; TL=Transformer.from_crs(26917,4326,always_xy=True).transform
D=json.load(open('devs.json')); dev={d['key']:d for d in D['devs'] if d['phase']!='cancelled'}
PO=json.load(open('polys.json')); dots=json.load(open('dots.json')); NA=json.load(open('/home/user/Fsr-reviewer/data/areas.json'))
def pg(rings):
    try: return unary_union([Polygon(r).buffer(0) for r in rings if len(r)>=4])
    except Exception: return None
G={}
for k,apps in PO.items():
    if k not in dev: continue
    g=unary_union([x for x in (pg(ap['poly']) for ap in apps) if x is not None and not x.is_empty])
    if g.is_empty: continue
    g=transform(TU,g)
    if g.area<3e7: G[k]=g
named={f['name']:(kind,transform(TU,unary_union([Polygon(r).buffer(0) for r in f['rings'] if len(r)>=4]))) for kind in ['secondaryPlans','mtsas','precincts'] for f in NA[kind]}
MAC=['Caledon|14196 HUMBER STATION RD','Caledon|@43.8715,-79.7726','Caledon|14275 THE GORE RD','Caledon|14275 THE GORE RD#1','Caledon|14685 HWY 50','Caledon|14475 HWY 50','Caledon|14337 HWY 50','Caledon|14245 HWY 50','Caledon|9408 COLUMBIA WAY']
MAC_NOTE={'Caledon|14196 HUMBER STATION RD':'In the Region box','Caledon|@43.8715,-79.7726':'In the Region box','Caledon|14275 THE GORE RD':'ArgoMcville','Caledon|14275 THE GORE RD#1':'ArgoMcville (same owner address, Caledon Station)','Caledon|14685 HWY 50':'Bolton North Hill Op 1 (Landowners Group OPA lands)','Caledon|14475 HWY 50':'Bolton North Hill Op 1','Caledon|14337 HWY 50':'Bolton North Hill Op 1','Caledon|14245 HWY 50':'Bolton North Hill Op 2','Caledon|9408 COLUMBIA WAY':'Solmar'}
MODE={1:('user','Region map applications shown in blue (ArgoMcville, Bolton North Hill Op 1 and 2, Solmar) plus the two applications in the Region box; user direction'),
      15:('user','Whole MTSA: "Steeles at Mississauga (Transit Hub)" from the app (Brampton Plan MTSA layer); user direction'),
      6:('named','Existing boundary: Brookvalley (Mayfield West Phase 2 Secondary Plan Stage 3), 438.1 ha vs 435.7 ha on the Region map')}
NAMED={6:'Brookvalley (Mayfield West Phase 2 Secondary Plan Stage 3)',15:'Steeles at Mississauga (Transit Hub)'}
COMMIT_JOBS={'approved','permit','construction'}
def growth(d):
    return (d['uSince']+d['left']>0) or (d['jobsSince']+d['jobsLeft']>0)
def frac_in(b,k):
    d=dev[k]; g=G.get(k)
    if g is not None: return b.intersection(g).area/g.area
    return 1.0 if b.contains(Point(TU(d['lng'],d['lat']))) else 0.0
assigned={}
order=[1,15,6]+[a[0] for a in AREAS if a[0] not in (1,15,6)]
spec={a[0]:a for a in AREAS}
out={}
for aid in order:
    _,name,mpop,mha,(x0,y0,x1,y1),mun=spec[aid]
    ring=[px2ll(x,y) for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]
    box=transform(TU,Polygon(ring))
    mode,why=MODE.get(aid,('parcels','Application parcels: the app\'s planning applications with at least half their land in the Region box'))
    if aid==1: cand=[k for k in MAC if k in dev]
    elif aid in NAMED:
        b=named[NAMED[aid]][1]; cand=[k for k in dev if dev[k]['files'] and frac_in(b,k)>=0.5 and growth(dev[k])]
    else:
        cand=[k for k in dev if dev[k]['files'] and frac_in(box,k)>=0.5 and growth(dev[k])]
    moved=[k for k in cand if k in assigned]
    mem=[k for k in cand if k not in assigned]
    for k in mem: assigned[k]=aid
    if aid in NAMED: bnd=named[NAMED[aid]][1]
    else: bnd=unary_union([G[k] if k in G else Point(TU(dev[k]['lng'],dev[k]['lat'])).buffer(25) for k in mem]) if mem else box
    out[aid]=dict(aid=aid,name=name,mpop=mpop,mha=mha,mun=mun,ring=ring,px=(x0,y0,x1,y1),mode=mode,why=why,mem=mem,moved=[(k,assigned[k]) for k in moved],bnd=bnd,box=box)
res={'generatedAt':D['generatedAt'],'censusDay':'2021-05-11','areas':[]}
def ll(g):
    g2=transform(TL,g)
    return mapping(g2)
for aid in sorted(out):
    o=out[aid]; rows=[]
    mem=sorted(o['mem'],key=lambda k:(-(dev[k]['uSince']+dev[k]['left']),-dev[k]['jobs'],dev[k]['title']))
    for i,k in enumerate(mem,1):
        v=dev[k]; sh=v['to2031Share'] if v['left']>0 else 0
        js=sh if v['left']>0 else (1.0 if v['phase'] in COMMIT_JOBS else 0.0)
        g=G.get(k)
        rows.append(dict(id=f"A{aid:02d}-{i:03d}",key=k,title=v['title'],municipality=v['municipality'],stage=v['phaseLabel'],plan=v['plan'],files=v['files'],
            description=v['description'],lat=v['lat'],lng=v['lng'],parcelHa=round(g.area/1e4,2) if g is not None else None,
            pctInBox=round(100*o['box'].intersection(g).area/g.area) if g is not None else None,expectedYear=v['expectedYear'],tier=v['tier'],
            note=MAC_NOTE.get(k,'') if aid==1 else '',
            u26=v['uSince'],u2631=v['left']*sh,u31=v['uSince']+v['left']*sh,uF=v['uSince']+v['left'],
            p26=v['popSince'],p2631=v['popLeft']*sh,p31=v['popSince']+v['popLeft']*sh,pF=v['popSince']+v['popLeft'],
            j26=v['jobsSince'],j2631=v['jobsLeft']*js,j31=v['jobsSince']+v['jobsLeft']*js,jF=v['jobsSince']+v['jobsLeft'],
            share2031=sh,estDates=v['estDates']))
    # Region dots -> nearest member
    ad=[]
    for n,dt in enumerate([d for d in dots if d['area']==aid],1):
        q=np.array(TU(dt['lon'],dt['lat'])); best=None;bd=1e12
        for r in rows:
            g=G.get(r['key']); dd=g.distance(Point(q)) if g is not None else float(np.hypot(*(np.array(TU(r['lng'],r['lat']))-q)))
            if dd<bd: bd=dd;best=r
        ad.append(dict(dot=f"A{aid:02d}-R{n}",kind=dt['kind'],lat=dt['lat'],lon=dt['lon'],x=dt['x'],y=dt['y'],match=best['id'] if best and bd<=400 else '',matchTitle=best['title'] if best and bd<=400 else '',dist=round(bd) if best else None,inside=bool(o['bnd'].buffer(1).contains(Point(q)))))
    K=['u26','u2631','u31','uF','p26','p2631','p31','pF','j26','j2631','j31','jF']
    tot={k:sum(r[k] for r in rows) for k in K}
    res['areas'].append(dict(id=aid,code=f"A{aid:02d}",name=o['name'],municipalityLabel=o['mun'],mapPop=o['mpop'],mapHa=o['mha'],
        boxHa=round(o['box'].area/1e4,1),boundaryHa=round(o['bnd'].area/1e4,1),mode=o['mode'],why=o['why'],ring=o['ring'],px=o['px'],
        boundary=ll(o['bnd']),nApps=len(rows),munis=dict(collections.Counter(r['municipality'] for r in rows)),moved=[(k,f"A{a:02d}",dev[k]['title']) for k,a in o['moved']],
        total=tot,rows=rows,dots=ad))
    t=tot; print(f"A{aid:02d} {o['name']:20} {o['mode']:7} bnd {o['bnd'].area/1e4:7.1f} ha (map {o['mha']}) apps {len(rows):3} | U {t['u26']:5.0f} {t['u2631']:6.0f} {t['u31']:6.0f} {t['uF']:6.0f} | P {t['pF']:7.0f} | J {t['jF']:6.0f} | dots {len(ad)} m{sum(1 for x in ad if x['match'])} in{sum(1 for x in ad if x['inside'])} moved {[x[2] for x in res['areas'][-1]['moved']]}")
json.dump(res,open('results2.json','w'))
