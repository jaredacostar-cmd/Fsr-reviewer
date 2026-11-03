from PIL import Image; import numpy as np, json
from scipy import ndimage
from scipy.cluster.vq import kmeans2
Image.MAX_IMAGE_PIXELS=None
exec(open('areas.py').read())
im=np.array(Image.open('hi-1.png').convert('RGB')).astype(int)
im[3700:,2450:]=255; im[:950,:700]=255
dots=[]
for kind,col in {'V6':(201,186,227),'V7 (Addition)':(214,152,162),'V6 Revised Pop/ha':(214,186,152)}.items():
    m=(np.abs(im-np.array(col)).sum(2)<12)
    lab,n=ndimage.label(m)
    for i,s in enumerate(ndimage.find_objects(lab)):
        ys,xs=np.nonzero(lab[s]==i+1); a=len(xs)
        if a<25: continue
        k=max(1,int(round(a/88)))
        P=np.c_[xs+s[1].start, ys+s[0].start].astype(float)
        if k==1: cs=[P.mean(0)]
        else:
            np.random.seed(0); cs,_=kmeans2(P,k,minit='++',seed=1)
        for cx,cy in cs:
            lon,lat=px2ll(cx,cy)
            box=next((aid for aid,nm,pp,ha,(x0,y0,x1,y1),mu in AREAS if x0-3<=cx<=x1+3 and y0-3<=cy<=y1+3),None)
            dots.append({'kind':kind,'x':float(cx),'y':float(cy),'lon':lon,'lat':lat,'area':box,'px':a if k==1 else None})
print(len(dots)); import collections
print(collections.Counter((d['area'],d['kind']) for d in dots))
json.dump(dots,open('dots.json','w'))
