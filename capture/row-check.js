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
 const pg=await br.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForTimeout(7000);
 await pg.evaluate(()=>document.querySelector('#testimonial')?.scrollIntoView({block:'center',behavior:'instant'}));
 await pg.waitForTimeout(3000);
 const d=await pg.evaluate(()=>[...document.querySelectorAll('#testimonial .swiper-slide')].map((s,i)=>{
   const sr=s.getBoundingClientRect();
   const card=s.querySelector('.swiper-card');
   const cr=card?card.getBoundingClientRect():sr;
   const img=s.querySelector('.client-img');
   const bot=s.querySelector('.swiper-card-bottom');
   const q=[...s.querySelectorAll('p')].filter(p=>p.textContent.trim().length>60)[0];
   const rel=e=>e?+(e.getBoundingClientRect().top-cr.top).toFixed(1):null;
   return {i, cardH:+cr.height.toFixed(1), slideH:+sr.height.toFixed(1),
           avatarFromCardTop:rel(img), bottomRowFromCardTop:rel(bot), quoteFromCardTop:rel(q)};
 }));
 console.log('slide  cardH   quoteTop  bottomRow  avatar   (all relative to card top)');
 d.forEach(s=>console.log(`  [${s.i}]  ${String(s.cardH).padStart(6)}  ${String(s.quoteFromCardTop).padStart(7)}  ${String(s.bottomRowFromCardTop).padStart(8)}  ${String(s.avatarFromCardTop).padStart(6)}`));
 const uniq=[...new Set(d.map(s=>s.avatarFromCardTop))];
 const uc=[...new Set(d.map(s=>s.cardH))];
 console.log(`\navatar offsets distinct: ${uniq.length} -> ${uniq.join(', ')}`);
 console.log(`card heights distinct  : ${uc.length} -> ${uc.join(', ')}`);
 console.log(uniq.length===1&&uc.length===1 ? '\nALIGNED: every card identical height, avatar row at the same offset' : '\nNOT YET ALIGNED');
 await br.close(); srv.close();
})();
