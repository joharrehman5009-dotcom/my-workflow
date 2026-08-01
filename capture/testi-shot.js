const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8083;
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=M[path.extname(f).toLowerCase()]||'application/octet-stream';
 r.writeHead(200,{'Content-Type':t,'Content-Length':b.length});r.end(b);});
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 const pg=await br.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 const errs=[],bad=[];
 pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,80));});
 pg.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url().split('/').pop());});
 await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForTimeout(7000);
 await pg.evaluate(()=>document.querySelector('#testimonial')?.scrollIntoView({block:'center',behavior:'instant'}));
 await pg.waitForTimeout(3500);
 const el=await pg.$('#testimonial .swiper-slide');
 if(el) await el.screenshot({path:path.join(OUT,'shots','testimonial.png'),animations:'disabled',timeout:60000});
 console.log('console errors :',errs.length,errs.slice(0,2));
 console.log('4xx responses  :',bad.length,bad.slice(0,4));
 await br.close(); srv.close();
})();
