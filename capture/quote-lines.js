const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8078;
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
 await pg.evaluate(()=>document.querySelector('#testimonial')?.scrollIntoView({block:'center',behavior:'instant'}));
 await pg.waitForTimeout(3000);
 const d=await pg.evaluate(()=>{
   return [...document.querySelectorAll('#testimonial .swiper-slide')].map((s,i)=>{
     const head=s.querySelector('.swiper-heading');
     const q=[...s.querySelectorAll('p')].filter(p=>p.textContent.trim().length>60)[0];
     const bot=s.querySelector('.swiper-card-bottom');
     const lh=q?parseFloat(getComputedStyle(q).lineHeight):0;
     const qr=q?q.getBoundingClientRect():null;
     const hr=head?head.getBoundingClientRect():null;
     const brr=bot?bot.getBoundingClientRect():null;
     return {i, chars:q?q.textContent.trim().length:0,
       headChars:head?head.textContent.trim().length:0,
       headLines:hr&&lh?Math.round(hr.height/parseFloat(getComputedStyle(head).lineHeight)):0,
       qLines:qr&&lh?Math.round(qr.height/lh):0,
       avatarTop:brr?+brr.top.toFixed(0):0};
   });
 });
 const tops=d.map(x=>x.avatarTop);
 console.log('slide  quoteChars  qLines  headChars  headLines  avatarTop');
 d.forEach(x=>console.log(`  [${x.i}]   ${String(x.chars).padStart(4)}       ${x.qLines}        ${String(x.headChars).padStart(3)}         ${x.headLines}        ${x.avatarTop}`));
 console.log(`\navatarTop spread: ${Math.min(...tops)} .. ${Math.max(...tops)}  (${Math.max(...tops)-Math.min(...tops)}px)`);
 console.log(`quote length spread: ${Math.min(...d.map(x=>x.chars))} .. ${Math.max(...d.map(x=>x.chars))} chars`);
 await br.close(); srv.close();
})();
