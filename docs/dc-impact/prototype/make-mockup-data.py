import json, math, sys
S=sys.argv[1]
d=json.load(open(f'{S}/'+(sys.argv[2] if len(sys.argv)>2 else 'impact3.json'))); M=json.load(open(sys.argv[3] if len(sys.argv)>3 else 'data/munis.json'))
P=d['projList']; geo=d['geo']; pc=d['pc']; lines=d['lines']; sheds=d['sheds']
KIND={'primary':'Trunk sewer','local':'Local sewer','force':'Force main','transmission':'Transmission main','feeder':'Feeder main'}
STAGE={'inception':'Pre-application','review':'In review','approved':'Approved','permit':'Permit issued','construction':'Under construction'}
SCR={'committed':'Committed','keep':'Within','defer':'Outside','later':'After 2035',None:'Not screened'}
def money(v):
  if v is None: return '–'
  if v>=1e9: return f'${v/1e9:.2f} B'
  if v>=1e7: return f'${v/1e6:.0f} M'
  if v>=1e6: return f'${v/1e6:.1f} M'
  if v>=1e4: return f'${v/1e3:.0f} k'
  if v>=1e3: return f'${v/1e3:.1f} k'
  return f'${v:.0f}'
n=lambda v:f'{round(v):,}'
def pip(x,y,ring):
  c=False;j=len(ring)-1
  for i in range(len(ring)):
    xi,yi=ring[i];xj,yj=ring[j]
    if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi: c=not c
    j=i
  return c
def muniOf(pt):
  for m in M['munis']:
    if any(pip(pt[0],pt[1],r) for r in m['rings']): return m['name']
  return 'Peel'
def ptsOf(p): return [pt for g in lines[('wastewater' if p['sys']=='wastewater' else 'water')+':'+p['key']] for pt in g]
# projection
def proj(bb,W,H,pad=0.06):
  x0,y0,x1,y1=bb; kx=math.cos(math.radians((y0+y1)/2))
  w=(x1-x0)*kx or 1e-3; h=(y1-y0) or 1e-3
  w*=1+2*pad; h*=1+2*pad
  s=min(W/w,H/h); cx=(x0+x1)/2; cy=(y0+y1)/2
  return lambda x,y:(round(W/2+(x-cx)*kx*s,1),round(H/2-(y-cy)*s,1))
def path(f,coords_list,minlen=0.8):
  out=[]
  for cs in coords_list:
    pts=[f(*c) for c in cs]; seg=[pts[0]]
    for q in pts[1:]:
      if abs(q[0]-seg[-1][0])+abs(q[1]-seg[-1][1])>=minlen: seg.append(q)
    if len(seg)==1 and len(pts)>1: seg.append(pts[-1])
    if len(seg)<2: continue
    out.append('M'+'L'.join(f'{a:g} {b:g}' for a,b in seg))
  return ''.join(out)
def pcoords(i):
  c=pc[str(i)]['c']; return [(c[k],c[k+1]) for k in range(0,len(c),2)]
def inb(cs,bb): return any(bb[0]<=x<=bb[2] and bb[1]<=y<=bb[3] for x,y in cs)
CUR=['28-2139','25-2120','22-2255','25-2181','25-2267','26-2242','24-2125','19-2208','31-1199','27-1142']
trunks=[(i,pcoords(i)) for i,v in pc.items() if v['d']>=900]
rows=[];details={}
for p in P:
  pts=ptsOf(p); mid=pts[len(pts)//2]
  mu=muniOf(mid)
  name=f"{KIND.get(p['k'],p['k'])}{' '+str(p['d'])+' mm' if p['d'] else ''}"
  yrs='–' if not p['y0'] else (str(p['y0']) if p['y0']==p['y1'] else f"{p['y0']}–{p['y1']}")
  devs=p['devs']; g1=[x for x in devs if x['grp']==1]; g2=[x for x in devs if x['grp']==2]
  gapd=[x for x in devs if x['gap']]
  rev=sum(x['rev'] for x in devs); risk=sum(x['rev'] for x in (devs if p['screen']=='defer' else gapd))
  per=p['cost']/p['units'] if p['units'] else None
  r={'key':p['key'],'sys':'ww' if p['sys']=='wastewater' else 'w','name':name,'muni':mu,'yrs':yrs,'y1':p['y1'] or 9999,'len':f"{p['len']/1000:.1f} km",'status':'Approved 2026' if p['s']=='approved' else 'Proposed',
     'nDev':p['nDev'],'units':p['units'],'unitsT':n(p['units']),'gaps':p['gaps'],'cost':p['cost'],'costT':money(p['cost']),'estT':'estimated' if p['est']>0.5 else ('part estimated' if p['est']>0 else ''),
     'screen':SCR[p['screen']],'scrTone':{'Committed':'room','Within':'room','Outside':'over','After 2035':'tight','Not screened':'none'}[SCR[p['screen']]],
     'perUnit':per or 0,'perUnitT':money(per) if per else '–','hasMap':p['key'] in CUR}
  rows.append(r)
  if not devs and p['key'] not in CUR: continue
  def drow(x):
    return {'title':x['title'][:70]+('…' if len(x['title'])>70 else ''),'muni':x['muni'],'stage':STAGE.get(x['phase'],x['phase']),'lay':x['lay'],'units':n(x['units']),'q':f"{x['q']:.1f} L/s",'need':str(x['need']) if x['need'] else '–','gap':x['gap'],'rev':money(x['rev']),'how':x['how'].replace(' · 0.0 km along planned mains',''),'grp':x['grp']}
  cov=(f"{rev/p['cost']:.1f}×" if rev/p['cost']<10 else f"{rev/p['cost']:.0f}×") if p['cost'] and rev else '–'
  sysw='wastewater' if p['sys']=='wastewater' else 'water'
  ans=(f"{n(p['nDev'])} development{'s' if p['nDev']!=1 else ''} (≈{n(p['units'])} units, ≈{n(p['pop'])} people + jobs, ≈{p['q']:.0f} L/s {'peak wet' if sysw=='wastewater' else 'max day'}) "
       + ("need it to connect or drain through it" if sysw=='wastewater' else "need it to connect")
       + (f". {p['gaps']} {'is' if p['gaps']==1 else 'are'} expected before it is finished in {p['y1']}" if p['gaps'] else (f". All are expected after it is finished in {p['y1']}" if p['nDev'] and p['y1'] else ''))
       + '.') if p['nDev'] else f"No development in the pipeline needs this {sysw} main to connect or drains through it."
  det={'key':p['key'],'answer':ans,'pop':n(p['pop']),'q':f"{p['q']:.0f}",'g1':[drow(x) for x in g1[:8]],'g2':[drow(x) for x in g2[:8]],'n1':len(g1),'n2':len(g2),
       'shed':p['shed'],'shedU':n(p['shedU']),'built':p['nBuilt'],'builtU':n(p['builtUnits']),
       'fund':{'cost':money(p['cost']),'est':f"{round(p['est']*100)}% estimated",'screen':SCR[p['screen']],'rev':money(rev),'cov':cov,'risk':money(risk),'riskN':len(devs) if p['screen']=='defer' else len(gapd),'perUnit':money(per) if per else '–',
               'why':{'committed':'Committed in the 2026 capital program.','keep':'Within the $1.0 B screen: it lets growth through by 2035.','defer':'Outside the $1.0 B screen.','later':'Scheduled after 2035, the end of the funding window.',None:'No capacity constraint or connector puts it in the funding screen. The screen sees no growth relying on it.'}[p['screen']]}}
  if p['key'] in CUR:
    W,H=640,420
    cs=[c for g in lines[sysw+':'+p['key']] for c in g]
    up=[pcoords(i) for i in geo.get(p['key'],{}).get('up',[])]
    if len(up)>1500: up=[pcoords(i) for i in geo[p['key']]['up'] if pc[str(i)]['d']>=600]
    mem=[pcoords(i) for i in geo.get(p['key'],{}).get('mem',[])]
    allp=cs+[tuple(x['ll']) for x in devs]+[c for u in up for c in u]
    if p['sys']!='wastewater':
      for s_ in sheds.get(p['key'],[]): allp+= [tuple(c) for r_ in s_['rings'] for c in r_]
    xs=[a for a,b in allp]; ys=[b for a,b in allp]
    bb=[min(xs),min(ys),max(xs),max(ys)]
    if bb[2]-bb[0]<0.02: c=(bb[0]+bb[2])/2; bb[0],bb[2]=c-0.01,c+0.01
    if bb[3]-bb[1]<0.015: c=(bb[1]+bb[3])/2; bb[1],bb[3]=c-0.0075,c+0.0075
    f=proj(bb,W,H)
    bbx=[bb[0]-0.05,bb[1]-0.05,bb[2]+0.05,bb[3]+0.05]
    base=path(f,[c for i,c in trunks if inb(c,bbx)],1.5)
    dcall=path(f,[g for k,gs in lines.items() for g in gs if not k.endswith(':'+p['key']) and inb(g,bbx)],1.2)
    mus=path(f,[r_ for m in M['munis'] for r_ in m['rings']],2)
    shedp=path(f,[r_ for s_ in sheds.get(p['key'],[]) for r_ in s_['rings']],1.5)
    dots=[]
    for x in devs[:400]:
      a,b=f(*x['ll'])
      if -10<a<W+10 and -10<b<H+10: dots.append({'x':a,'y':b,'r':round(min(9,2.5+math.sqrt(x['units'])/6),1),'c':'var(--g1)' if x['grp']==1 else 'var(--g2)','gap':x['gap']})
    def circ(ds,rr=None):
      return ''.join(f"M{x['x']-(rr or x['r']):g} {x['y']:g}a{(rr or x['r']):g} {(rr or x['r']):g} 0 1 0 {2*(rr or x['r']):g} 0a{(rr or x['r']):g} {(rr or x['r']):g} 0 1 0 {-2*(rr or x['r']):g} 0" for x in ds)
    det['map']={'d1':circ([x for x in dots if x['c']=='var(--g1)']),'d2':circ([x for x in dots if x['c']!='var(--g1)']),'dgap':''.join(f"M{x['x']-x['r']-3:g} {x['y']:g}a{x['r']+3:g} {x['r']+3:g} 0 1 0 {2*(x['r']+3):g} 0a{x['r']+3:g} {x['r']+3:g} 0 1 0 {-2*(x['r']+3):g} 0" for x in dots if x['gap']),'base':base,'dc':dcall,'mu':mus,'shed':shedp,'up':path(f,up,2 if len(up)>800 else 1.2),'mem':path(f,mem,1),'proj':path(f,lines[sysw+':'+p['key']],0.8),'upN':len(geo.get(p['key'],{}).get('up',[]))}
  details[p['key']]=det
# Peel overview map
allc=[c for gs in lines.values() for g in gs for c in g]+[c for m in M['munis'] for r_ in m['rings'] for c in r_]
xs=[a for a,b in allc]; ys=[b for a,b in allc]
f=proj([min(xs),min(ys),max(xs),max(ys)],520,560,0.03)
ov={'mu':path(f,[r_ for m in M['munis'] for r_ in m['rings']],2),'base':path(f,[c for i,c in trunks],2),
    'ww':path(f,[g for k,gs in lines.items() if k.startswith('wastewater:') for g in gs],1.5),'w':path(f,[g for k,gs in lines.items() if k.startswith('water:') for g in gs],1.5)}
hot=sorted([p for p in P if p['nDev']],key=lambda p:-p['units'])[:12]
ov['hot']=path(f,[g for p in hot for g in lines[('wastewater' if p['sys']=='wastewater' else 'water')+':'+p['key']]],1)
lab=[]
for m in M['munis']:
  cs=[c for r_ in m['rings'] for c in r_]; a,b=f(sum(x for x,y in cs)/len(cs),sum(y for x,y in cs)/len(cs)); lab.append({'n':m['name'].upper(),'x':a,'y':b})
ov['labels']=lab
# funding rows
byKey={('ln:'+('wastewater' if p['sys']=='wastewater' else 'water')+':'+p['key']):p for p in P}
fr=[]
for b in d['brows']:
  p=byKey.get(b['key'])
  fr.append({'dec':b['dec'],'tone':'room' if b['dec']!='Outside' else 'over','name':(b['short'] or b['name']),'pid':b['pid'] or '','water':b['sys']=='water','y':b['y'] or '–','cost':money(b['cost']) if b['cost'] else 'not costed','v':b['v'],'vT':(n(b['v'])+' people') if b['v']>0 else 'none',
             'dev':p['nDev'] if p else None,'units':p['units'] if p else 0,'aff':(f"{p['nDev']} dev · {n(p['units'])} units") if p and p['nDev'] else ('whole sewershed' if b['key'].startswith('step') else ('none' if p else '–')),'key':p['key'] if p else None})
ns=[p for p in P if p['screen'] is None and p['nDev']]
tot={'n':len(P),'ww':sum(1 for p in P if p['sys']=='wastewater'),'w':sum(1 for p in P if p['sys']!='wastewater'),'withDev':sum(1 for p in P if p['nDev']),'gapP':sum(1 for p in P if p['gaps']),
     'ns':len(ns),'nsUnits':n(sum({x['key']:x['units'] for p in ns for x in p['devs']}.values())),'nsDevs':n(len({x['key'] for p in ns for x in p['devs']})),'nsCost':money(sum(p['cost'] for p in ns)),'screened':sum(1 for p in P if p['screen']),'bud':d['bud'],'budT':money(d['bud']['budget']),'totT':money(d['bud']['total']),'spentT':money(d['bud']['spent'])}
json.dump({'rows':rows,'details':details,'ov':ov,'fund':fr,'tot':tot},open(f'{S}/build/data.json','w'),separators=(',',':'))
print(tot); import os; print(os.path.getsize(f'{S}/build/data.json'))
print({k:len(json.dumps(v)) for k,v in details.items() if 'map' in v})
