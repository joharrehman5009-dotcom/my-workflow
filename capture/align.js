const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8081;
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
   const out=[];
   document.querySelectorAll('#testimonial .swiper-slide').forEach((s,i)=>{
     const quote=[...s.querySelectorAll('p')].filter(p=>p.textContent.trim().length>60)[0];
     const head=s.querySelector('.swiper-heading');
     const img=s.querySelector('.client-img');
     const allImgs=[...s.querySelectorAll('img')].map(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);
       return {cls:e.className,w:+r.width.toFixed(1),h:+r.height.toFixed(1),top:+r.top.toFixed(1),
               nat:e.naturalWidth+'x'+e.naturalHeight,disp:cs.display,pos:cs.position,objFit:cs.objectFit};});
     const info=s.querySelector('.client-info');
     const nm=s.querySelector('.text-weight-medium');
     const rl=s.querySelector('.client-text-small');
     const lk=s.querySelector('.client-text-link');
     const g=e=>{ if(!e) return null; const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
       return {top:+r.top.toFixed(1),h:+r.height.toFixed(1),mid:+(r.top+r.height/2).toFixed(1),disp:cs.display}; };
     out.push({i,img:g(img),info:g(info),nm:g(nm),rl:g(rl),lk:g(lk),
       lkText:JSON.stringify(lk?lk.textContent:null),
       qLen: quote?quote.textContent.trim().length:0,
       qH: quote?+quote.getBoundingClientRect().height.toFixed(1):0,
       qLines: quote?Math.round(quote.getBoundingClientRect().height/parseFloat(getComputedStyle(quote).lineHeight)):0,
       headLen: head?head.textContent.trim().length:0,
       headH: head?+head.getBoundingClientRect().height.toFixed(1):0,
       avatarTop: img?+img.getBoundingClientRect().top.toFixed(1):0,
       infoAlign:info?getComputedStyle(info).alignItems+"/"+getComputedStyle(info).justifyContent:null,
       allImgs,
       wrapCls:img?img.parentElement.className:null,
       wrapBox:img?(()=>{const r=img.parentElement.getBoundingClientRect();return {w:+r.width.toFixed(1),h:+r.height.toFixed(1),mid:+(r.top+r.height/2).toFixed(1)};})():null});
   });
   return out;
 });
 console.log('slide  headLen headH  qLen qLines  qH     avatarTop');
 d.forEach(s=>console.log(`  [${s.i}]   ${String(s.headLen).padStart(3)}    ${String(s.headH).padStart(5)}  ${String(s.qLen).padStart(4)}   ${String(s.qLines).padStart(2)}   ${String(s.qH).padStart(6)}  ${s.avatarTop}`));
 [].forEach(s=>{
   console.log(`slide[${s.i}]  info flex: ${s.infoAlign}`);
   console.log(`   avatar  mid=${s.img?.mid}  h=${s.img?.h}`);
   console.log(`   textblk mid=${s.info?.mid}  h=${s.info?.h}`);
   console.log(`   name    mid=${s.nm?.mid}`);
   console.log(`   role    mid=${s.rl?.mid}`);
   console.log(`   link    ${s.lk?`h=${s.lk.h} disp=${s.lk.disp} text=${s.lkText}`:'(absent)'}`);
   console.log(`   wrapper .${s.wrapCls} -> ${JSON.stringify(s.wrapBox)}`);
   s.allImgs.forEach(im=>console.log(`      img.${im.cls}  ${im.w}x${im.h}  nat=${im.nat}  ${im.disp}/${im.pos}/${im.objFit}`));
   console.log(`   >> wrapper vs text centre offset: ${s.wrapBox&&s.info?(s.wrapBox.mid-s.info.mid).toFixed(1):'n/a'}px`);
 });
 await br.close(); srv.close();
})();
