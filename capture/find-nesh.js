const { chromium, devices } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8074;
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=M[path.extname(f).toLowerCase()]||'application/octet-stream';
 r.writeHead(200,{'Content-Type':t,'Content-Length':b.length});r.end(b);});
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 const ctx=await br.newContext({...devices['iPhone 14']});
 const pg=await ctx.newPage();
 await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForTimeout(7000);
 const d=await pg.evaluate(()=>{
   const out=[];
   document.querySelectorAll('svg,img,div,h1,p').forEach(e=>{
     const r=e.getBoundingClientRect();
     if(r.width<120||r.height<40) return;
     if(r.top>700||r.bottom<0) return;
     const cs=getComputedStyle(e);
     if(cs.display==='none'||cs.visibility==='hidden') return;
     const txt=(e.textContent||'').replace(/\s+/g,'').slice(0,14);
     const src=e.tagName==='IMG'?decodeURIComponent(e.getAttribute('src')||'').split('/').pop():'';
     out.push({tag:e.tagName,cls:(e.className.baseVal!==undefined?e.className.baseVal:e.className||'').toString().slice(0,34),
       x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),txt,src});
   });
   return out;
 });
 console.log('elements visible in the mobile hero area:');
 d.slice(0,18).forEach(e=>console.log(`  <${e.tag} .${e.cls}>  ${e.w}x${e.h} @(${e.x},${e.y})  ${e.src||e.txt}`));
 await ctx.close(); await br.close(); srv.close();
})();
