import json, numpy as np
from pyproj import Transformer
g=json.load(open('geo.json')); a=np.array(g['aff']); c0=np.array(g['c0'])
A=np.array([[a[0],a[1]],[a[3],a[4]]]); t=np.array([a[2],a[5]]); Ai=np.linalg.inv(A)
inv=Transformer.from_crs(26917,4326,always_xy=True)
fwd=Transformer.from_crs(4326,26917,always_xy=True)
def px2ll(x,y):
    e,n=Ai@(np.array([x,y])-t)+c0; return inv.transform(e,n)
def ll2px(lon,lat):
    e,n=fwd.transform(lon,lat); return A@(np.array([e,n])-c0)+t
# id, name, map population, map area ha, box (x0,y0,x1,y1) at 300 dpi, municipality
AREAS=[
 (1,'Macville',1349,31.98,(2210,1809,2304,1893),'Caledon'),
 (2,'Humber Station',8736,128.3,(2253,2017,2381,2140),'Caledon'),
 (3,'Mayfield/Gore',27000,120,(2085,2065,2206,2261),'Caledon'),
 (4,'Dixie Road',4337,163.82,(1640,2092,1762,2330),'Caledon'),
 (5,'Airport Road',9167,107.78,(1867,2104,1990,2313),'Caledon'),
 (6,'McLaughlin Road',21837,435.7,(1304,2115,1473,2194),'Caledon'),
 (7,'Alloa Phase One',20561,263,(1186,2185,1249,2333),'Caledon'),
 (8,'SP47',57194,585.41,(2147,2280,2405,2547),'Brampton'),
 (9,'Heritage Heights',58219,224.68,(1000,2531,1090,2732),'Brampton'),
 (10,'North American Lands',10773,25.79,(1104,2564,1175,2661),'Brampton'),
 (11,'McVean and Gore',8781,9.89,(2120,2660,2257,2785),'Brampton'),
 (12,'Kennedy',9716,10.10,(1491,2681,1575,2793),'Brampton'),
 (13,'DT Brampton',19805,13.48,(1354,2684,1457,2815),'Brampton'),
 (14,'Bram West',3896,45.09,(989,2798,1122,3008),'Brampton'),
 (15,'Steeles MTSA',12793,13.76,(1117,2967,1155,3023),'Brampton'),
 (16,'Shoppers World',20732,23.62,(1382,2927,1448,2987),'Brampton'),
 (17,'Ninth Line',9058,38.45,(753,3269,823,3672),'Mississauga'),
 (18,'Lakeshore',69769,62.08,(1558,3977,1689,4067),'Mississauga'),
 (19,'Port Credit',19441,21.98,(1333,3983,1472,4091),'Mississauga'),
]
