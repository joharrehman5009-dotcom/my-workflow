const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8093;
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=MIME[path.extname(f).toLowerCase()]||'application/octet-stream';
 r.writeHead(200,{'Content-Type':t,'Accept-Ranges':'bytes','Content-Length':b.length});r.end(b);});
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 for (const vp of [[1366,768],[1280,720]]){
  for (const [lbl,f] of [['BASELINE(no content)','_baseline.html'],['CURRENT','index.html']]){
   const pg=await br.newPage({viewport:{width:vp[0],height:vp[1]}});
   await pg.goto(`http://localhost:${PORT}/${f}`,{waitUntil:'load',timeout:60000});
   await pg.waitForTimeout(6000);
   const d=await pg.evaluate(()=>{
     const st=window.AnimationEngine?.debug?.state?.();
     const sb=document.querySelector('.nav-container');
     const b=document.querySelector('.nav-button'); const p=b?.querySelector('p');
     const m=b?.querySelector('.nav-button-mask')||b;
     return {scale:+(st?.sidebarScale??1).toFixed(3), sh:sb?.scrollHeight,
       bio:(document.querySelector('.nav-top-text')?.textContent||'').trim().length,
       tw:+(p?.getBoundingClientRect().width||0).toFixed(1), bw:+(m?.getBoundingClientRect().width||0).toFixed(1)};
   });
   console.log(`${vp[0]}x${vp[1]}  ${lbl.padEnd(21)} scale ${String(d.scale).padEnd(6)} sidebarH ${String(d.sh).padEnd(5)} bio ${String(d.bio).padEnd(4)} label ${d.tw} / box ${d.bw}  headroom ${(d.bw-d.tw).toFixed(1)}px`);
   await pg.close();
  }
  console.log();
 }
 await br.close(); srv.close();
})();
