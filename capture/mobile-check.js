const { chromium, devices } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8075;
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.svg':'image/svg+xml','.webm':'video/webm','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.join(OUT,rel);
 if(!f.startsWith(OUT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 const b=fs.readFileSync(f),t=M[path.extname(f).toLowerCase()]||'application/octet-stream';
 const rg=q.headers.range;
 if(rg&&/^bytes=/.test(rg)){const[a,e]=rg.replace('bytes=','').split('-');const st=+a||0,en=e?+e:b.length-1;
  r.writeHead(206,{'Content-Type':t,'Accept-Ranges':'bytes','Content-Range':`bytes ${st}-${en}/${b.length}`,'Content-Length':en-st+1});return r.end(b.slice(st,en+1));}
 r.writeHead(200,{'Content-Type':t,'Accept-Ranges':'bytes','Content-Length':b.length});r.end(b);});
(async()=>{
 await new Promise(r=>srv.listen(PORT,r));
 const br=await chromium.launch({channel:'chrome'});
 for (const [label,dev] of [['iPhone 14',devices['iPhone 14']],['Pixel 7',devices['Pixel 7']],['iPad',devices['iPad (gen 7)']]]) {
   const ctx=await br.newContext({...dev});
   const pg=await ctx.newPage();
   const errs=[],bad=[];
   pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,90));});
   pg.on('requestfailed',r=>{const e=r.failure()?.errorText||'';if(!e.includes('ERR_ABORTED'))bad.push(r.url().split('/').pop());});
   await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
   await pg.waitForTimeout(7000);
   const d=await pg.evaluate(()=>{
     const b=document.body, de=document.documentElement;
     const hero=document.querySelector('.hero-heading');
     const vis=(s)=>{const e=document.querySelector(s);if(!e)return 'absent';
       const cs=getComputedStyle(e);const r=e.getBoundingClientRect();
       return `${cs.display}/${cs.visibility}/op${cs.opacity} ${Math.round(r.width)}x${Math.round(r.height)}`;};
     return {
       vw:window.innerWidth, vh:window.innerHeight,
       docW:de.scrollWidth, bodyW:b.scrollWidth,
       overflowX: de.scrollWidth > window.innerWidth ? `YES by ${de.scrollWidth-window.innerWidth}px` : 'no',
       scrollH:de.scrollHeight,
       heroHeading:vis('.hero-heading'),
       heroVisible: hero ? getComputedStyle(hero).visibility : 'n/a',
       mobileMenu:vis('.mobile-menu'),
       navContainer:vis('.nav-container'),
       heroImg:vis('.hero-profile-img'),
       sections:[...document.querySelectorAll('section')].length,
       animations:document.getAnimations().length,
       libs:['gsap','ScrollTrigger','Lenis','Swiper'].filter(g=>typeof window[g]!=='undefined').length,
     };
   });
   console.log(`\n=== ${label}  (${d.vw}x${d.vh}) ===`);
   Object.entries(d).forEach(([k,v])=>{ if(k!=='vw'&&k!=='vh') console.log(`  ${k.padEnd(14)}: ${v}`); });
   console.log(`  ${'console errors'.padEnd(14)}: ${errs.length} ${errs.slice(0,2).join(' | ')}`);
   console.log(`  ${'failed reqs'.padEnd(14)}: ${bad.length} ${bad.slice(0,2).join(' | ')}`);
   await pg.screenshot({path:path.join(OUT,'shots',`mobile-${label.replace(/\W/g,'')}.png`),animations:'disabled',timeout:60000}).catch(()=>{});
   await ctx.close();
 }
 await br.close(); srv.close();
})();
