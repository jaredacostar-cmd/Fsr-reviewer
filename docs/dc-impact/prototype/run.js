const path=require('path'),fs=require('fs');
const { chromium } = require(process.env.PLAYWRIGHT||'playwright-core');

const ROOT=path.join(__dirname,'..','..','..'), CDN=process.env.CDN_DIR, PORT=+(process.env.PORT||8791);
const serve = require(path.join(ROOT,'tests/browser/serve.js'));
(async()=>{
  const srv=await serve(ROOT,PORT);
  const b=await chromium.launch(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{});
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  await ctx.route(/^https:\/\/(?!localhost)/, route=>{const m=/unpkg\.com\/([^@]+)@([^/]+)\/(.+)$/.exec(route.request().url()); const f=m&&`${CDN}/${m[1]}-${m[2]}/package/${m[3]}`; if(f&&fs.existsSync(f)) route.fulfill({path:f,contentType:f.endsWith('.css')?'text/css':'application/javascript'}); else route.abort();});
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.addInitScript(()=>{for(const k of ['tourDone','homeTourDone','mapTourOffered'])localStorage.setItem(`peel-dev:${k}`,'true');});
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(()=>window.PeelApp&&PeelApp.fullSnapshotReady&&PeelApp.fullSnapshotReady(),null,{timeout:240000});
  await page.waitForTimeout(2500);
  const script=fs.readFileSync(process.argv[2],'utf8');
  const out=await page.evaluate(script);
  fs.writeFileSync(process.argv[3]||'/dev/stdout',typeof out==='string'?out:JSON.stringify(out,null,1));
  if(process.argv[4]) await page.screenshot({path:process.argv[4]});
  console.error('errors:',errs.slice(0,5));
  await b.close(); srv.close&&srv.close(); process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
