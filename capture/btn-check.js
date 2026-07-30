const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8095;
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const mk=(root)=>http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(root,rel);
 if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=MIME[path.extname(f).toLowerCase()]||'application/octet-stream';
 r.writeHead(200,{'Content-Type':t,'Accept-Ranges':'bytes','Content-Length':b.length});r.end(b);});
(async()=>{
 const srv=mk(OUT); await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 for (const [label,file] of [['CURRENT','index.html'],['BASELINE','_backup/base/out/index.html']]){
   const pg=await br.newPage({viewport:{width:1440,height:900}});
   await pg.goto(`http://localhost:${PORT}/${file}`,{waitUntil:'load',timeout:60000});
   await pg.waitForTimeout(6500);
   const d=await pg.evaluate(()=>{
     const sb=document.querySelector('.nav-container');
     const st=window.AnimationEngine?.debug?.state?.();
     const btns=[...document.querySelectorAll('.nav-button, .hero-cta-button, .hero-button, .nav-button-secondary')].slice(0,4).map(b=>{
       const p=b.querySelector('p'); const m=b.querySelector('.nav-button-mask')||b;
       return {txt:(p?.textContent||'').trim().slice(0,14), textW:Math.round(p?.getBoundingClientRect().width||0), boxW:Math.round(m.getBoundingClientRect().width), clones:b.querySelectorAll('.clone-p').length};
     });
     return {scale:st?.sidebarScale?.toFixed(4), scrollH:sb?.scrollHeight, bioLen:(document.querySelector('.nav-top-text')?.textContent||'').trim().length, btns};
   });
   console.log(`\n=== ${label} ===`);
   console.log(`sidebarScale ${d.scale}   nav-container scrollHeight ${d.scrollH}px   sidebar bio ${d.bioLen} chars`);
   d.btns.forEach(b=>console.log(`  "${b.txt}"`.padEnd(20)+`text ${b.textW}px  box ${b.boxW}px  ${b.textW>b.boxW?'*** OVERFLOW '+(b.textW-b.boxW)+'px':'ok'}  clones=${b.clones}`));
   await pg.close();
 }
 await br.close(); srv.close();
})();
