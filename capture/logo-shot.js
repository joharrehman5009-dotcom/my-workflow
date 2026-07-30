const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8090;
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=M[path.extname(f).toLowerCase()]||'application/octet-stream';
 r.writeHead(200,{'Content-Type':t,'Content-Length':b.length});r.end(b);});
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 const pg=await br.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 const errs=[],bad=[];
 pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,90));});
 pg.on('requestfailed',r=>{const e=r.failure()?.errorText||'';if(!e.includes('ERR_ABORTED'))bad.push(e+' '+r.url().slice(-40));});
 await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForTimeout(7000);
 // scroll so the sidebar has assembled and the marquee is visible
 await pg.evaluate(()=>window.scrollTo({top:1400,behavior:'instant'}));
 await pg.waitForTimeout(3500);
 const mq=await pg.$('.nav-comapny-wrap');
 if(mq) await mq.screenshot({path:path.join(OUT,'shots','marquee.png'),animations:'disabled',timeout:60000});
 const box=await pg.evaluate(()=>{
   const r=document.querySelector('.nav-comapny-item svg rect');
   const im=document.querySelector('.nav-comapny-item svg image');
   const s=document.querySelector('.nav-comapny-item svg');
   return {rect:!!r, image:!!im, imgHref:im?.getAttribute('href')?.split('/').pop(),
           svgW:Math.round(s?.getBoundingClientRect().width||0), svgH:Math.round(s?.getBoundingClientRect().height||0)};
 });
 console.log('marquee svg  :', JSON.stringify(box));
 console.log('console errors:',errs.length,errs.slice(0,3));
 console.log('failed req   :',bad.length,bad.slice(0,3));
 await pg.evaluate(()=>document.querySelector('#about')?.scrollIntoView({behavior:'instant'}));
 await pg.waitForTimeout(3500);
 const c=await pg.$('.about-card');
 if(c) await c.screenshot({path:path.join(OUT,'shots','about-card.png'),animations:'disabled',timeout:60000});
 await br.close(); srv.close();
})();
