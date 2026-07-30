const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8096;
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=MIME[path.extname(f).toLowerCase()]||'application/octet-stream';
 const rg=q.headers.range; if(rg&&/^bytes=/.test(rg)){const[s,e]=rg.replace('bytes=','').split('-');const st=+s||0,en=e?+e:b.length-1;
  r.writeHead(206,{'Content-Type':t,'Accept-Ranges':'bytes','Content-Range':`bytes ${st}-${en}/${b.length}`,'Content-Length':en-st+1});return r.end(b.slice(st,en+1));}
 r.writeHead(200,{'Content-Type':t,'Accept-Ranges':'bytes','Content-Length':b.length});r.end(b);});
(async()=>{await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 const pg=await br.newPage({viewport:{width:1440,height:900}});
 const errs=[],f404=[];
 pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,120));});
 pg.on('requestfailed',r=>{const e=r.failure()?.errorText||'';if(!e.includes('ERR_ABORTED'))f404.push(e+' '+r.url().slice(-60));});
 await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
 await pg.waitForTimeout(7000);
 const st=await pg.evaluate(()=>({
   libs:['gsap','ScrollTrigger','Lenis','Swiper','SplitText'].filter(g=>typeof window[g]!=='undefined'),
   anims:document.getAnimations().length,
   slides:document.querySelectorAll('#testimonial .swiper-slide').length,
   brs:document.querySelectorAll('h1 br, h2 br, h3 br').length,
   spans:document.querySelectorAll('.what_you_get-text span').length,
   heroH:document.querySelector('.hero-heading')?.innerHTML.slice(0,70),
 }));
 console.log('libs live      :', st.libs.join(', '));
 console.log('animations     :', st.anims);
 console.log('swiper slides  :', st.slides);
 console.log('<br> in headings:', st.brs);
 console.log('spans in what_you_get:', st.spans);
 console.log('hero heading   :', JSON.stringify(st.heroH));
 console.log('console errors :', errs.length, errs.slice(0,3));
 console.log('failed requests:', f404.length, f404.slice(0,3));
 await br.close(); srv.close();
})();
