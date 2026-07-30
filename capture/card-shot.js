const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8091;
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=M[path.extname(f).toLowerCase()]||'application/octet-stream';
 r.writeHead(200,{'Content-Type':t,'Content-Length':b.length});r.end(b);});
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 const pg=await br.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 const bad=[]; pg.on('response',r=>{if(r.url().includes('local-logos')&&r.status()!==200)bad.push(r.status()+' '+r.url().slice(-34));});
 await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForTimeout(7000);
 await pg.evaluate(()=>document.querySelector('#about')?.scrollIntoView({behavior:'instant'}));
 await pg.waitForTimeout(4000);
 const c=await pg.$('.about-card');
 if(c) await c.screenshot({path:path.join(OUT,'shots','about-card.png'),animations:'disabled',timeout:60000});
 const yrs=await pg.evaluate(()=>[...document.querySelectorAll('.about-card-year')].map(e=>e.textContent.replace(/\s+/g,'')));
 console.log('rendered years:', yrs.join('  '));
 console.log('logo request failures:', bad.length, bad.slice(0,3));
 await br.close(); srv.close();
})();
