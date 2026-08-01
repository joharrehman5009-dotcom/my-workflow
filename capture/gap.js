const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8077;
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
   const s=document.querySelector('#testimonial .swiper-slide');
   const card=s.querySelector('.swiper-card')||s.firstElementChild;
   const bot=s.querySelector('.swiper-card-bottom');
   const cs=getComputedStyle(card), bs=getComputedStyle(bot);
   const cr=card.getBoundingClientRect(), brr=bot.getBoundingClientRect();
   return {
     cardCls:card.className, cardH:+cr.height.toFixed(1),
     cardPadBottom:cs.paddingBottom, cardDisplay:cs.display, cardJustify:cs.justifyContent,
     rowCls:bot.className, rowH:+brr.height.toFixed(1),
     rowMarginTop:bs.marginTop, rowMarginBottom:bs.marginBottom, rowPadBottom:bs.paddingBottom,
     gapBelowRow:+(cr.bottom-brr.bottom).toFixed(1),
     gapAboveRow:+(brr.top-cr.top).toFixed(1),
   };
 });
 Object.entries(d).forEach(([k,v])=>console.log(`  ${k.padEnd(16)}: ${v}`));
 await br.close(); srv.close();
})();
