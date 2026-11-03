import json, subprocess, os, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
exec(open('areas.py').read())
R=json.load(open('results.json'))
OUT='/home/user/Fsr-reviewer/deliverables/priority-areas-2031/maps'
STAGE_COL={'Pre-application':'#9e9ac8','In review':'#3182bd','Plan approved':'#31a354','Building permit':'#fd8d3c','Under construction':'#e6550d','Built':'#636363'}
SLIDE0=6
plt.rcParams['font.family']='DejaVu Sans'
def slug(n): return n.replace('/','-').replace(' ','_')
# ---------- overview ----------
im=Image.open('hi-1.png').convert('RGB')
crop=(150,1450,3250,4420)
base=np.array(im.crop(crop))
fig,ax=plt.subplots(figsize=(10,9.9),dpi=200)
ax.imshow(base,extent=(crop[0],crop[2],crop[3],crop[1]),alpha=0.55)
for a in R['areas']:
    x0,y0,x1,y1=a['px']
    ax.add_patch(Rectangle((x0,y0),x1-x0,y1-y0,fill=False,ec='#c00000',lw=1.6))
    for r in a['rows']:
        if r['kind']!='Planning application': continue
        x,y=ll2px(r['lng'],r['lat']); ax.plot(x,y,'o',ms=2.2,color=STAGE_COL.get(r['stage'],'k'),mec='none')
    ax.text(x1+6,y0-4,a['code'],fontsize=8.5,fontweight='bold',color='white',va='bottom',ha='left',
            bbox=dict(boxstyle='round,pad=0.18',fc='#7a0000',ec='none'))
for s,c in STAGE_COL.items(): ax.plot([],[],'o',color=c,label=s,ms=5)
ax.add_patch(Rectangle((0,0),0,0,fill=False,ec='#c00000',label='Priority area (Region map box)'))
ax.legend(loc='lower left',fontsize=7.5,title='App planning applications, by stage',title_fontsize=8,framealpha=0.95)
ax.set_xlim(crop[0],crop[2]); ax.set_ylim(crop[3],crop[1]); ax.axis('off')
ax.set_title('Scenario 1 2031 priority areas (A01–A19) with Peel Growth Pipeline applications\nExcel: sheet "Summary" · PPT: slide 3 · area maps: maps/Axx_*.png',fontsize=10)
fig.tight_layout(); fig.savefig(f'{OUT}/A00_overview.png'); plt.close(fig)
# ---------- per area ----------
DPI=900; k=DPI/300
for a in R['areas']:
    x0,y0,x1,y1=a['px']; w,h=x1-x0,y1-y0; cx,cy=(x0+x1)/2,(y0+y1)/2
    side=max(w,h)*1.35+50
    X0,Y0=cx-side/2,cy-side/2
    fn=f'tmp_{a["code"]}'
    subprocess.run(['pdftoppm','-r',str(DPI),'-x',str(int(X0*k)),'-y',str(int(Y0*k)),'-W',str(int(side*k)),'-H',str(int(side*k)),'-png','-singlefile','../pdf/in.pdf',fn],check=True)
    img=np.array(Image.open(fn+'.png').convert('RGB')); os.remove(fn+'.png')
    fig,ax=plt.subplots(figsize=(7.2,7.2),dpi=170)
    ext=(X0,X0+side,Y0+side,Y0)
    ax.imshow(img,extent=ext,alpha=0.5)
    ax.add_patch(Rectangle((x0,y0),w,h,fill=False,ec='#c00000',lw=2.2))
    po=[r for r in a['rows'] if r['kind']!='Planning application']
    if po:
        P=np.array([ll2px(r['lng'],r['lat']) for r in po]); ax.plot(P[:,0],P[:,1],'.',ms=2.5,color='#555555',alpha=0.8,label=f'Building permit only ({len(po)})')
    apps=[r for r in a['rows'] if r['kind']=='Planning application']
    umax=max([r['u_bo'] for r in apps]+[1])
    for r in apps:
        x,y=ll2px(r['lng'],r['lat'])
        s=30+300*np.sqrt(max(r['u_bo'],0)/umax) if r['u_bo']>0 else 30
        mk='s' if r['u_bo']==0 else 'o'
        ax.scatter([x],[y],s=s,c=STAGE_COL.get(r['stage'],'k'),edgecolors='white',linewidths=0.8,marker=mk,zorder=3,alpha=0.9)
        ax.annotate(r['id'].split('-')[1].lstrip('0'),(x,y),xytext=(4,4),textcoords='offset points',fontsize=7,fontweight='bold',color='#111',zorder=4,
                    bbox=dict(boxstyle='round,pad=0.1',fc='white',ec='none',alpha=0.75))
    for d in a['dots']:
        ax.scatter([d['x']],[d['y']],s=70,facecolors='none',edgecolors='black',linewidths=1.2,zorder=5)
    for s_,c in STAGE_COL.items():
        if any(r['stage']==s_ for r in apps): ax.scatter([],[],s=40,c=c,label=s_)
    ax.scatter([],[],s=60,facecolors='none',edgecolors='black',label='Region map point (V6/V7)')
    ax.legend(loc='lower left',fontsize=6.5,framealpha=0.92,title='Labels = development no. (A%s-###)'%a['code'][1:],title_fontsize=6.5)
    ax.set_xlim(X0,X0+side); ax.set_ylim(Y0+side,Y0); ax.set_xticks([]); ax.set_yticks([])
    # scale bar 500 m
    pxm=0.0615*side/side; L=500*0.0615
    ax.plot([X0+side*0.70,X0+side*0.70+L],[Y0+side*0.96]*2,color='k',lw=3); ax.text(X0+side*0.70+L/2,Y0+side*0.945,'500 m',ha='center',fontsize=7)
    tt=a['total']
    ax.set_title(f"{a['code']} · {a['name']}  —  build-out {tt['u_bo']:,.0f} units · {tt['p_bo']:,.0f} people · {tt['j_bo']:,.0f} jobs\n"
                 f"Excel: sheet \"{a['code']}\" · PPT: slide {SLIDE0+a['id']} · {len(apps)} planning applications numbered; map rotated as the Region's (north ≈ up-left)",fontsize=8.5)
    fig.tight_layout(); fig.savefig(f"{OUT}/{a['code']}_{slug(a['name'])}.png"); plt.close(fig)
    print(a['code'],'ok')
