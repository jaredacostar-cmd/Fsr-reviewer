from PIL import Image; import numpy as np, json
from scipy import ndimage, optimize
from pyproj import Transformer
Image.MAX_IMAGE_PIXELS=None
im=np.array(Image.open('hi-1.png').convert('RGB')).astype(int)
r,g,b=im[...,0],im[...,1],im[...,2]
mask=(abs(r-168)<25)&(abs(g-112)<25)&(b<50)
mask[:, :]&=True
mask[3700:,2450:]=False   # legend
mask[4500:,:]=False
mask[:950,:700]=False     # key map
dt=ndimage.distance_transform_edt(~mask)
tr=Transformer.from_crs(4326,26917,always_xy=True)
M=json.load(open('/home/user/Fsr-reviewer/data/munis.json'))
pts=[]
for m in M['munis']:
    for ring in m['rings']:
        ring=np.array(ring)
        # densify
        for a,bb in zip(ring[:-1],ring[1:]):
            for t in np.linspace(0,1,6,endpoint=False): pts.append(a+(bb-a)*t)
pts=np.array(pts); E,N=tr.transform(pts[:,0],pts[:,1]); P=np.c_[E,N]
c0=P.mean(0); Pc=P-c0
ys,xs=np.nonzero(mask); pc=np.array([xs.mean(),ys.mean()])
def apply(p,Q):
    s,th,tx,ty=p
    R=np.array([[np.cos(th),-np.sin(th)],[np.sin(th),np.cos(th)]])
    q=(Q@R.T)*s
    return np.c_[q[:,0]+tx, -q[:,1]+ty]   # y down
def cost(p):
    q=apply(p,Pc); x=np.clip(q[:,0],0,dt.shape[1]-1).astype(int); y=np.clip(q[:,1],0,dt.shape[0]-1).astype(int)
    d=dt[y,x]; return np.mean(np.minimum(d,60)**1)
# scale: map 1:192036 at 300dpi -> px per m = 300/0.0254/192036
s0=300/0.0254/192036
best=None
for th in np.radians(np.arange(-60,61,2)):
    for ds in [0.95,1,1.05]:
        p=[s0*ds,th,pc[0],pc[1]]
        res=optimize.minimize(cost,p,method='Nelder-Mead',options={'xatol':1e-4,'fatol':1e-3,'maxiter':3000})
        if best is None or res.fun<best.fun: best=res
print(best.x, np.degrees(best.x[1]), best.fun, s0)
# refine with full affine
def apply6(a,Q):
    return np.c_[a[0]*Q[:,0]+a[1]*Q[:,1]+a[2], a[3]*Q[:,0]+a[4]*Q[:,1]+a[5]]
s,th,tx,ty=best.x
a0=[s*np.cos(th),-s*np.sin(th),tx,-s*np.sin(th),-s*np.cos(th),ty]
def cost6(a):
    q=apply6(a,Pc); x=np.clip(q[:,0],0,dt.shape[1]-1).astype(int); y=np.clip(q[:,1],0,dt.shape[0]-1).astype(int)
    return np.mean(np.minimum(dt[y,x],60))
r6=optimize.minimize(cost6,a0,method='Nelder-Mead',options={'maxiter':20000,'xatol':1e-6,'fatol':1e-4})
print('affine',r6.x,r6.fun, 'sim',best.fun)
json.dump({'c0':c0.tolist(),'sim':best.x.tolist(),'aff':r6.x.tolist()},open('geo.json','w'))
# overlay
q=apply6(r6.x,Pc)
ov=Image.open('hi-1.png').convert('RGB')
from PIL import ImageDraw
d=ImageDraw.Draw(ov)
for x,y in q[::2]: d.ellipse([x-3,y-3,x+3,y+3],fill=(0,200,0))
ov.resize((1100,1700)).save('overlay.png')
