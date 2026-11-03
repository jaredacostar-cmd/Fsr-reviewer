import json, numpy as np, collections
exec(open('areas.py').read())
from shapely.geometry import Polygon, Point
D=json.load(open('devs.json')); devs=D['devs']; dots=json.load(open('dots.json'))
COMMIT_JOBS={'approved','permit','construction'}
STAGE_ORDER=['inception','review','approved','permit','construction','completed']
res={'generatedAt':D['generatedAt'],'areas':[]}
def m(lon,lat):
    return np.array(fwd.transform(lon,lat))
for aid,name,mpop,mha,(x0,y0,x1,y1),mun in AREAS:
    ring=[px2ll(x,y) for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]
    P=Polygon(ring); boxha=Polygon([fwd.transform(*c) for c in ring]).area/1e4
    ins=[v for v in devs if v['phase']!='cancelled' and (v['units']>0 or v['jobs']>0) and P.contains(Point(v['lng'],v['lat']))]
    ins.sort(key=lambda v:(-(1 if v['files'] else 0), -v['units'], -v['jobs'], v['title']))
    rows=[]
    for i,v in enumerate(ins,1):
        sh=v['to2031Share'] if v['left']>0 else 0
        js=sh if v['left']>0 else (1.0 if v['phase'] in COMMIT_JOBS else 0.0)
        r=dict(id=f"A{aid:02d}-{i:03d}", area=aid, kind='Planning application' if v['files'] else 'Building permit only',
               title=v['title'], municipality=v['municipality'], stage=v['phaseLabel'], plan=v['plan'], files=v['files'], permits=v['permits'],
               description=v['description'], types=v['types'], employmentUses=v['employmentUses'], nonresM2=v['nonresM2'],
               lat=v['lat'], lng=v['lng'], expectedYear=v['expectedYear'], expLow=v['expLow'], expHigh=v['expHigh'], tier=v['tier'],
               u_bo=v['completed']+v['left'], u_ex=v['completed'], u_31=v['completed']+v['left']*sh,
               p_bo=v['popBuilt']+v['popLeft'], p_ex=v['popBuilt'], p_31=v['popBuilt']+v['popLeft']*sh,
               j_bo=v['jobs'], j_ex=v['jobsBuilt'], j_31=v['jobsBuilt']+v['jobsLeft']*js, share2031=sh, key=v['key'], appUnits=v['units'])
        rows.append(r)
    # region dots -> nearest app development (planning application)
    ad=[]
    for k,dt in enumerate([d for d in dots if d['area']==aid],1):
        q=m(dt['lon'],dt['lat'])
        best=min(rows, key=lambda r: np.hypot(*(m(r['lng'],r['lat'])-q)) if r['kind']=='Planning application' else 1e12, default=None)
        dist=float(np.hypot(*(m(best['lng'],best['lat'])-q))) if best else None
        ad.append(dict(dot=f"A{aid:02d}-R{k}", kind=dt['kind'], lat=dt['lat'], lon=dt['lon'], x=dt['x'], y=dt['y'], match=best['id'] if best and dist<400 else '', matchTitle=best['title'] if best and dist<400 else '', dist=round(dist) if dist is not None else None))
    S=lambda f,flt=lambda r:True: sum(r[f] for r in rows if flt(r))
    tot={k:S(k) for k in ['u_bo','u_ex','u_31','p_bo','p_ex','p_31','j_bo','j_ex','j_31']}
    app={k:S(k,lambda r:r['kind']=='Planning application') for k in tot}
    stages=collections.Counter(r['stage'] for r in rows if r['kind']=='Planning application')
    res['areas'].append(dict(id=aid, code=f"A{aid:02d}", name=name, municipalityLabel=mun, mapPop=mpop, mapHa=mha, boxHa=round(boxha,1),
        ring=ring, px=(x0,y0,x1,y1), nDevs=len(rows), nApps=sum(1 for r in rows if r['kind']=='Planning application'), nPermitOnly=sum(1 for r in rows if r['kind']!='Planning application'),
        munis=dict(collections.Counter(r['municipality'] for r in rows)), stages=dict(stages), total=tot, apps=app, rows=rows, dots=ad))
    print(f"A{aid:02d} {name:22} n={len(rows):4} apps={res['areas'][-1]['nApps']:3} U {tot['u_bo']:7.0f} {tot['u_ex']:6.0f} {tot['u_31']:7.0f} | P {tot['p_bo']:7.0f} {tot['p_ex']:6.0f} {tot['p_31']:7.0f} | J {tot['j_bo']:6.0f} {tot['j_ex']:5.0f} {tot['j_31']:6.0f} | mapPop {mpop} dots {len(ad)} matched {sum(1 for x in ad if x['match'])}")
json.dump(res,open('results.json','w'))
