const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8089;
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=M[path.extname(f).toLowerCase()]||'application/octet-stream';
 r.writeHead(200,{'Content-Type':t,'Content-Length':b.length});r.end(b);});
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 const pg=await br.newPage({viewport:{width:1440,height:900}});
 await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForTimeout(7000);
 await pg.evaluate(()=>document.querySelector('#about')?.scrollIntoView({behavior:'instant'}));
 await pg.waitForTimeout(3000);
 const d=await pg.evaluate(()=>{
   const out=[];
   document.querySelectorAll('.about-card').forEach((card,ci)=>{
     const imgs=[...card.querySelectorAll('.about-card-img')].map(e=>{
       const r=e.getBoundingClientRect();
       const cs=getComputedStyle(e);
       return {cls:e.className.replace('about-card-img','').trim()||'(none)',
               file:decodeURIComponent(e.getAttribute('src')||'').split('/').pop().slice(-26),
               x:Math.round(r.x), w:Math.round(r.width), z:cs.zIndex, disp:cs.display, vis:cs.visibility};
     });
     out.push({ci,imgs});
   });
   return out;
 });
 d.forEach(c=>{
   console.log(`card[${c.ci}]`);
   c.imgs.forEach((i,k)=>console.log(`   [${k}] x=${String(i.x).padStart(4)} w=${String(i.w).padStart(3)} z=${String(i.z).padEnd(6)} ${i.disp==='none'?'HIDDEN':'shown '} cls="${i.cls}"  ${i.file}`));
   const vis=c.imgs.filter(i=>i.disp!=='none');
   if(vis.length>=2){ const ov=(vis[0].x+vis[0].w)-vis[1].x; console.log(`   visible overlap: ${ov}px of ${vis[1].w}px  (${Math.round(100*ov/vis[1].w)}% of the right circle covered)`); }
 });
 await br.close(); srv.close();
})();
