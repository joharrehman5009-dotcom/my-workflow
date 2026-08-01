const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8079;
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=M[path.extname(f).toLowerCase()]||'application/octet-stream';
 r.writeHead(200,{'Content-Type':t,'Content-Length':b.length});r.end(b);});
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 for (const vp of [[1920,1080],[1440,900],[1366,768]]) {
   const pg=await br.newPage({viewport:{width:vp[0],height:vp[1]},deviceScaleFactor:1});
   await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
   await pg.waitForTimeout(7000);
   const d=await pg.evaluate(()=>{
     const h=document.querySelector('.hero-heading');
     const lines=h.querySelectorAll('.line');
     const r=h.getBoundingClientRect();
     const cs=getComputedStyle(h);
     return {lines:lines.length, w:Math.round(r.width), h:Math.round(r.height),
             fs:cs.fontSize, lh:cs.lineHeight,
             overflow: Math.round(r.right) > window.innerWidth ? 'OVERFLOWS' : 'fits'};
   });
   console.log(`${vp[0]}x${vp[1]}  SplitText lines=${d.lines}  box ${d.w}x${d.h}  font ${d.fs}/${d.lh}  ${d.overflow}`);
   if (vp[0]===1440) await pg.screenshot({path:path.join(OUT,'shots','hero-oneline.png'),clip:{x:0,y:0,width:1440,height:820},animations:'disabled',timeout:60000});
   await pg.close();
 }
 await br.close(); srv.close();
})();
