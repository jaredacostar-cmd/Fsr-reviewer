(async()=>{
const A=PeelApp.state, SC=PeelSewerCap, ST=PeelSewerTrace, DI=PeelDcInfra, MM=PeelMapMarkers, D=PeelDemand, DC=PeelDcCost, SD=PeelSvcData, SvcTab=PeelSvcTab, MA=PeelMapAnalysis, Areas=PeelAreas;
await SC.loadSewers();
const t0=performance.now();
const pipes=MM.SEW.data.pipes, N=pipes.length;
const LAYS=new Set(['built','approved','proposed']);
const keyOf=ln=>ln.p||ln.c;
// pipe -> DC line running along it (pipeReliefOf), with the size rule
let rej=0;const TXT=/twin|relief|replac|upsiz|upgrad|parallel/i;
const sizeOk=(ln,pd)=>TXT.test((ln.n||'')+' '+(ln.t||''))||(ln.d?ln.d>=0.5*pd:(ln.k==='primary'||ln.k==='force'||pd<=600));
const offOk=(ln,med)=>ln.k==='local'?med<=30:med<=150;
const relief=new Array(N).fill(null);
for(let i=0;i<N;i++){const c=pipes[i][10],pts=[];for(let k=0;k<c.length;k+=2)pts.push([c[k],c[k+1]]);
 const mid=pts[Math.floor(pts.length/2)],dLng=300/(111320*Math.cos(mid[1]*Math.PI/180)),dLat=300/111320;let best=null;
 const pd=pipes[i][0];for(const ln of A.dcInfra.wastewater.lines){const b=ln.bbox;if(mid[0]<b[0]-dLng||mid[0]>b[2]+dLng||mid[1]<b[1]-dLat||mid[1]>b[3]+dLat)continue;if(!sizeOk(ln,pd)){rej++;continue;}
  const dd=pts.map(pt=>DI.dcDist(pt,ln.g));const near=dd.filter(x=>x<=150).length/pts.length;const med=dd.slice().sort((a,b)=>a-b)[Math.floor(dd.length/2)];if(near>=0.5&&!offOk(ln,med)){rej++;continue;}
  if(near>=0.5&&(!best||near>best.near||(near===best.near&&(ln.d||0)>(best.ln.d||0))))best={ln,near};}
 relief[i]=best?best.ln:null;}
const members=new Map();relief.forEach((ln,i)=>{if(!ln)return;const k=keyOf(ln);(members.get(k)||members.set(k,[]).get(k)).push(i);});
const t1=performance.now();
// developments
const G=SC.sewerGrowth(), devs=[];
const est=new Map();
const estOf=p=>{if(!est.has(p))est.set(p,D.estimate([p],A.criteria,'all',PeelApp.jobsOf));return est.get(p);};
for(const p of A.projects){const lay=MM.svcLayerOf(p);if(!LAYS.has(lay)||p.lat==null)continue;const e=estOf(p);if(!(e.totalUnits>0||e.employment.jobs>0))continue;devs.push({p,lay,e});}
// group 1: outside the network, routed along DC mains
const g1=new Map();let nOut=0;
for(const d of devs){const p=d.p;if(p.dr&&p.dr.length)continue;nOut++;const path=ST.dcSewerPath(p);if(!path)continue;
 for(const ln of new Set([path.first,...path.lines])){const k=keyOf(ln);(g1.get(k)||g1.set(k,new Map()).get(k)).set(p,{d,km:path.km,joinM:path.joinM});}}
const t2=performance.now();
// group 2: upstream of member pipes
function upMark(mem){const mk=new Int8Array(N);for(const i of mem)mk[i]=1;
 return k=>{const path=[];let j=k,h=0;while(j>=0&&!mk[j]&&h<3000){path.push(j);mk[j]=3;j=pipes[j][3];h++;}
  const r=j>=0&&mk[j]===1?1:2;for(const x of path)mk[x]=r;return r===1;};}
// forecast first year
let first=new Map();try{const fm=PeelTiming.forecastModel();for(const [k,s] of fm.ss.sched||fm.ss){const ys=Object.keys((s.likely)||{}).map(Number).sort();if(ys.length)first.set(k,ys[0]);}}catch(e){first.err=String(e);}
// The app's expected year (PeelTiming.scheduleFor: half its homes done), for comparison with the first year.
const half=new Map();try{const fm=PeelTiming.forecastModel();if(PeelTiming.scheduleFor)for(const p of A.projects){const sc=PeelTiming.scheduleFor(p,fm);if(sc&&sc.likely)half.set(p.key,sc.likely);}}catch(e){}
const rates=DC.dcRates(), wwShare=rates.R.single.wastewater/(rates.R.single.water+rates.R.single.wastewater);
const rev=e=>{const u=e.units||{};const t=(u.single||0)*rates.single+(u.town||0)*rates.town+((u.apartment||0)+(u.unknown||0))*rates.aptLarge;return t;};
// costs
const K=A.dcCosts;
function lineCost(sys,key){const ix=K.index2026[sys],C=K.components;let gross=0,dc=0,estd=0;const byC=new Map();
 A.dcInfra[sys].lines.filter(x=>keyOf(x)===key).forEach((x,i)=>{const k=x.c||`_${i}`;const o=byC.get(k)||byC.set(k,{len:0,d:x.d}).get(k);for(let q=1;q<x.g.length;q++)o.len+=DI.dcM(x.g[q-1],x.g[q]);o.d=o.d||x.d;});
 for(const [c,o] of byC){const p=C[c];if(p){gross+=p.gross*ix;dc+=p.dc*ix;continue;}const u=K.unitCost[sys],g=u.a*Math.pow((o.d||600)/1000,u.b)*o.len*ix;gross+=g;dc+=g*K.dcShare[sys];estd+=g;}
 return {gross,dc,est:gross?estd/gross:0};}
const B=DC.dcaBudget(DC.DCB.budget,DC.DCB.years);
const scr=new Map();for(const r of B.keep)scr.set(r.key,r.committed?'committed':'keep');for(const r of B.defer)scr.set(r.key,'defer');for(const r of B.later)scr.set(r.key,'later');
const THIS=MM.THIS_YEAR;
const projList=[];const CUR=new Set(['28-2139','25-2120','22-2255','25-2181','25-2267','26-2242','24-2125','19-2208','31-1199','27-1142']);const geo={};
for(const sys of ['wastewater','water']){
 const by=new Map();for(const ln of A.dcInfra[sys].lines){const k=keyOf(ln);if(!k)continue;const g=by.get(k)||by.set(k,{key:k,sys,k:ln.k,d:0,y0:9999,y1:0,len:0,s:ln.s,n:ln.n||'',lines:[]}).get(k);g.lines.push(ln);g.d=Math.max(g.d,ln.d||0);if(ln.y){g.y0=Math.min(g.y0,ln.y);g.y1=Math.max(g.y1,ln.y);}for(let q=1;q<ln.g.length;q++)g.len+=DI.dcM(ln.g[q-1],ln.g[q]);if(ln.k==='primary'||ln.k==='transmission')g.k=ln.k;}
 for(const g of by.values()){
  let rows=[];const seen=new Set();
  if(sys==='wastewater'){
   for(const [p,x] of (g1.get(g.key)||new Map())){seen.add(p);rows.push({grp:1,d:x.d,how:`connects ${Math.round(x.joinM)} m away · ${x.km.toFixed(1)} km along planned mains`});}
   const mem=members.get(g.key)||[];
   if(mem.length){const up=upMark(mem);if(CUR.has(g.key)){const upP=[];for(let i=0;i<N;i++)if(up(i))upP.push(i);geo[g.key]={mem,up:upP};}for(const d of devs){if(seen.has(d.p))continue;const k=G.devPipe.get(d.p);if(k==null||k<0)continue;if(up(k)){seen.add(d.p);rows.push({grp:2,d,how:`joins a ${pipes[k][0]} mm sewer upstream`});}}}
   g.members=mem.length;
  } else {
   for(const d of devs){const p=d.p;if(p.pz&&p.pz.length)continue;const n=DI.dcNearest('water',[p.lng,p.lat],DI.DC_CONNECT_M);if(n&&keyOf(n.ln)===g.key){seen.add(p);rows.push({grp:1,d,how:`connects ${Math.round(n.m)} m away`});}}
  }
  const bys=g.y1||null;
  const built=rows.filter(r=>r.d.lay==='built');const builtUnits=built.reduce((t,r)=>t+(r.d.e.totalUnits||0),0);rows=rows.filter(r=>r.d.lay!=='built');const out=rows.map(r=>{const e=r.d.e,fy=first.get(r.d.p.key);const need=r.d.p.phase==='construction'?THIS:(fy||null),hy=half.get(r.d.p.key),needHalf=r.d.p.phase==='construction'?THIS:(hy||null);const rv=rev(e)*(sys==='wastewater'?wwShare:1-wwShare);
   return {grp:r.grp,key:r.d.p.key,title:r.d.p.title,muni:r.d.p.municipality,lay:r.d.lay,phase:r.d.p.phase,units:Math.round(e.totalUnits||0),pop:Math.round(e.population+e.employment.jobs),q:+(sys==='wastewater'?e.combined.wastewater.wetPeak:e.combined.water.maxDay).toFixed(2),need,gap:!!(need&&bys&&need<bys),needHalf,gapHalf:!!(needHalf&&bys&&needHalf<bys),rev:Math.round(rv),how:r.how,ll:[+r.d.p.lng.toFixed(5),+r.d.p.lat.toFixed(5)]};});
  let shed=0,shedU=0,shedIds=[];
  if(sys==='wastewater'){const tg=DI.dcTarget(g.lines[0]);if(tg){const up=SvcTab.upstreamOf(tg,SvcTab.svcFlowTree());shedIds=[tg,...up.map(u=>u.id)];const ids=new Set(shedIds);for(const d of devs){if(d.lay==='built'||seen.has(d.p))continue;if(SD.svcIds(d.p,'dr').some(x=>ids.has(x))){shed++;shedU+=d.e.totalUnits||0;}}}}
  else{const tg=DI.dcTarget(g.lines[0]);if(tg){shedIds=[tg];for(const d of devs){if(d.lay==='built'||seen.has(d.p))continue;if(SD.svcIds(d.p,'pz').includes(tg)){shed++;shedU+=d.e.totalUnits||0;}}}}
  g.shed=shed;g.shedU=Math.round(shedU);g.shedIds=shedIds;
  const c=lineCost(sys,g.key);
  const sk=scr.get(`ln:${sys}:${g.key}`)||null;
  projList.push({shed:g.shed,shedU:g.shedU,shedIds:g.shedIds,key:g.key,sys,k:g.k,d:g.d,y0:g.y0===9999?null:g.y0,y1:g.y1||null,len:Math.round(g.len),s:g.s,n:g.n,members:g.members||0,cost:Math.round(c.dc),est:+c.est.toFixed(2),screen:sk,
   nDev:out.length,nBuilt:built.length,builtUnits:Math.round(builtUnits),n1:out.filter(r=>r.grp===1).length,n2:out.filter(r=>r.grp===2).length,units:out.reduce((t,r)=>t+r.units,0),pop:out.reduce((t,r)=>t+r.pop,0),q:+out.reduce((t,r)=>t+r.q,0).toFixed(1),gaps:out.filter(r=>r.gap).length,gapsHalf:out.filter(r=>r.gapHalf).length,rev:out.reduce((t,r)=>t+r.rev,0),
   muni:(()=>{const m={};for(const r of out)m[r.muni]=(m[r.muni]||0)+1;return Object.entries(m).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;})(),
   devs:out.sort((a,b)=>a.grp-b.grp||b.units-a.units)});
 }}
const need=new Set();for(const k in geo){geo[k].mem.forEach(i=>need.add(i));geo[k].up.forEach(i=>need.add(i));}
pipes.forEach((p,i)=>{if(p[0]>=900)need.add(i);});
const pc={};for(const i of need){const c=pipes[i][10];pc[i]={d:pipes[i][0],c:Array.from(c).map(v=>+v.toFixed(5))};}
const lines={};for(const sys of ['wastewater','water'])for(const ln of A.dcInfra[sys].lines){const k=keyOf(ln);if(!k)continue;(lines[sys+':'+k]=lines[sys+':'+k]||[]).push(ln.g.map(([x,y])=>[+x.toFixed(5),+y.toFixed(5)]));}
const sheds={};for(const p of projList){if(!CUR.has(p.key))continue;sheds[p.key]=p.shedIds.map(id=>{const a=SD.svcById.get(id);return a?{id,name:SD.drName?SD.drName(a):a.name,rings:a.rings.map(r=>r.filter((_,i)=>i%3===0).map(([x,y])=>[+x.toFixed(4),+y.toFixed(4)]))}:null}).filter(Boolean);}
const loc={};for(const p of projList){const ln=A.dcInfra[p.sys].lines.find(x=>keyOf(x)===p.key);const id=DI.dcTarget(ln);const a=id&&SD.svcById.get(id);loc[p.key]=a?(SD.drName?SD.drName(a):a.name):null;}
const munis=(A.munis&&A.munis.features)?A.munis.features.map(f=>({n:f.properties&&(f.properties.name||f.properties.NAME),g:f.geometry})):null;
const brows=[...B.keep.map(r=>({dec:r.committed?'Committed':'Within',r})),...B.defer.map(r=>({dec:'Outside',r}))].map(({dec,r})=>({dec,key:r.key,name:r.name,short:r.short||null,pid:r.pid||null,sys:r.sys,y:r.y,cost:Math.round(r.cost||0),v:Math.round(r.v||0),other:!!r.other,est:r.c?+r.c.est.toFixed(2):null}));
return {rej,geo,pc,lines,sheds,loc,munisN:munis&&munis.length,brows,bud:{budget:B.budget,years:B.years,end:B.end,total:Math.round(B.total),spent:Math.round(B.spent),lower:Math.round(B.lower),upper:Math.round(B.upper)},ms:{relief:Math.round(t1-t0),g1:Math.round(t2-t1),all:Math.round(performance.now()-t0)},nDevs:devs.length,nOut,firstErr:first.err||null,firstN:first.size,budget:{budget:DC.DCB.budget,years:DC.DCB.years,end:B.end,keep:B.keep.length,defer:B.defer.length},screenKeys:[...scr.keys()].slice(0,8),wwShare,projList};
})()
