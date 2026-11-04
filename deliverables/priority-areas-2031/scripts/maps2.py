import json, subprocess, os, numpy as np, shutil
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Polygon as MPoly
from shapely.geometry import shape
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
exec(open('areas.py').read())
R=json.load(open('results2.json'))
OUT='/home/user/Fsr-reviewer/deliverables/priority-areas-2031/maps'
shutil.rmtree(OUT,ignore_errors=True); os.makedirs(OUT)
STAGE_COL={'Pre-application':'#9e9ac8','In review':'#3182bd','Plan approved':'#31a354','Building permit':'#fd8d3c','Under construction':'#e6550d','Built':'#636363'}
SLIDE0=int(os.environ.get('SLIDE0','8'))
def slug(n): return n.replace('/','-').replace(' ','_')
def rings_px(geo):
    g=shape(geo); polys=[g] if g.geom_type=='Polygon' else list(getattr(g,'geoms',[]))
    out=[]
    for p in polys:
        if p.geom_type!='Polygon': continue
        out.append(np.array([ll2px(x,y) for x,y in p.exterior.coords]))
    return out
im=Image.open('hi-1.png').convert('RGB')
crop=(150,1450,3250,4420); base=np.array(im.crop(crop))
fig,ax=plt.subplots(figsize=(10,9.9),dpi=200)
ax.imshow(base,extent=(crop[0],crop[2],crop[3],crop[1]),alpha=0.55)
for a in R['areas']:
    x0,y0,x1,y1=a['px']
    ax.add_patch(Rectangle((x0,y0),x1-x0,y1-y0,fill=False,ec='#c00000',lw=1.0,ls='--'))
    for P in rings_px(a['boundary']): ax.add_patch(MPoly(P,closed=True,fc='#005596',ec='#003b6b',alpha=0.55,lw=0.6))
    ax.text(x1+6,y0-4,a['code'],fontsize=8.5,fontweight='bold',color='white',va='bottom',ha='left',bbox=dict(boxstyle='round,pad=0.18',fc='#005596',ec='none'))
ax.add_patch(Rectangle((0,0),0,0,fill=False,ec='#c00000',ls='--',label='Region map box'))
ax.add_patch(Rectangle((0,0),0,0,fc='#005596',alpha=0.55,label='Boundary used (app parcels / plan / MTSA)'))
ax.legend(loc='lower left',fontsize=8,framealpha=0.95)
ax.set_xlim(crop[0],crop[2]); ax.set_ylim(crop[3],crop[1]); ax.axis('off')
ax.set_title('Reference: Region map (Scenario 1 2031, 2026-05-20) with the boundaries used for A01–A19',fontsize=10)
fig.tight_layout(); fig.savefig(f'{OUT}/A00_overview.png'); plt.close(fig)
DPI=900; k=DPI/300
for a in R['areas']:
    x0,y0,x1,y1=a['px']; PS=rings_px(a['boundary'])
    xs=[x0,x1]+[p[:,0].min() for p in PS]+[p[:,0].max() for p in PS]; ys=[y0,y1]+[p[:,1].min() for p in PS]+[p[:,1].max() for p in PS]
    X0,X1,Y0,Y1=min(xs),max(xs),min(ys),max(ys); cx,cy=(X0+X1)/2,(Y0+Y1)/2
    side=max(X1-X0,Y1-Y0)*1.25+50; X0,Y0=cx-side/2,cy-side/2
    fn=f'tmp_{a["code"]}'
    subprocess.run(['pdftoppm','-r',str(DPI),'-x',str(int(X0*k)),'-y',str(int(Y0*k)),'-W',str(int(side*k)),'-H',str(int(side*k)),'-png','-singlefile','../pdf/in.pdf',fn],check=True)
    img=np.array(Image.open(fn+'.png').convert('RGB')); os.remove(fn+'.png')
    fig,ax=plt.subplots(figsize=(7.2,7.2),dpi=170)
    ax.imshow(img,extent=(X0,X0+side,Y0+side,Y0),alpha=0.5)
    ax.add_patch(Rectangle((x0,y0),x1-x0,y1-y0,fill=False,ec='#c00000',lw=1.6,ls='--',label='Region map box'))
    for i,P in enumerate(PS): ax.add_patch(MPoly(P,closed=True,fc='#005596',ec='#003b6b',alpha=0.25,lw=1.2,label='Boundary used' if i==0 else None))
    for r in a['rows']:
        x,y=ll2px(r['lng'],r['lat'])
        ax.scatter([x],[y],s=40,c=STAGE_COL.get(r['stage'],'k'),edgecolors='white',linewidths=0.8,zorder=3)
        ax.annotate(str(int(r['id'].split('-')[1])),(x,y),xytext=(4,4),textcoords='offset points',fontsize=7,fontweight='bold',zorder=4,bbox=dict(boxstyle='round,pad=0.1',fc='white',ec='none',alpha=0.8))
    for d in a['dots']: ax.scatter([d['x']],[d['y']],s=70,facecolors='none',edgecolors='black',linewidths=1.2,zorder=5)
    ax.scatter([],[],s=60,facecolors='none',edgecolors='black',label='Region map point')
    ax.legend(loc='lower left',fontsize=6.5,framealpha=0.92)
    ax.set_xlim(X0,X0+side); ax.set_ylim(Y0+side,Y0); ax.set_xticks([]); ax.set_yticks([])
    tt=a['total']
    ax.set_title(f"Reference · {a['code']} {a['name']} on the Region map — final growth {tt['uF']:,.0f} units · {tt['pF']:,.0f} people\nExcel sheet \"{a['code']}\" · PPT slide {SLIDE0+a['id']} · labels = development no. ({a['code']}-###)",fontsize=8.5)
    fig.tight_layout(); fig.savefig(f"{OUT}/{a['code']}_{slug(a['name'])}.png"); plt.close(fig)
print('maps done')
