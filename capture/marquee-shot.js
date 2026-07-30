const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8092;
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=MIME[path.extname(f).toLowerCase()]||'application/octet-stream';
 r.writeHead(200,{'Content-Type':t,'Content-Length':b.length});r.end(b);});
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 const pg=await br.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 const f404=[];
 pg.on('requestfailed',r=>{const e=r.failure()?.errorText||'';if(!e.includes('ERR_ABORTED'))f404.push(r.url().slice(-50));});
 pg.on('response',r=>{if(r.url().includes('local-logos')&&r.status()!==200)f404.push(r.status()+' '+r.url().slice(-40));});
 await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForTimeout(7000);
 await pg.evaluate(()=>window.scrollTo({top:900,behavior:'instant'}));
 await pg.waitForTimeout(3000);
 const el=await pg.$('.nav-comapny-wrap');
 if(el){ await el.screenshot({path:path.join(OUT,'shots','marquee.png'),animations:'disabled',timeout:60000}); console.log('marquee.png written'); }
 else console.log('.nav-comapny-wrap not found');
 const info=await pg.evaluate(()=>{
   const w=document.querySelector('.nav-comapny-wrap');
   const s=w&&getComputedStyle(w);
   const r=w&&w.getBoundingClientRect();
   const svg=document.querySelector('.nav-comapny-item svg');
   return {box:r?Math.round(r.width)+'x'+Math.round(r.height):'-', color:s?s.color:'-',
     svgBox:svg?Math.round(svg.getBoundingClientRect().width)+'x'+Math.round(svg.getBoundingClientRect().height):'-'};
 });
 console.log('marquee box:',info.box,' currentColor:',info.color,' first svg:',info.svgBox);
 console.log('logo request failures:',f404.length,f404.slice(0,4));
 await br.close(); srv.close();
})();
