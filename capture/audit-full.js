const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const OUT=path.join(__dirname,'out'),PORT=8084;
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
 const pg=await br.newPage({viewport:{width:1440,height:900}});
 const errs=[],bad=[],bytes={total:0,byType:{}};
 pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,90));});
 pg.on('requestfailed',r=>{const e=r.failure()?.errorText||'';if(!e.includes('ERR_ABORTED'))bad.push(e+' '+r.url().slice(-40));});
 pg.on('response',async r=>{ try{ const h=r.headers(); const len=+(h['content-length']||0);
   if(len){ const t=(h['content-type']||'other').split(';')[0].split('/')[0]; bytes.total+=len; bytes.byType[t]=(bytes.byType[t]||0)+len; } }catch(e){} });
 const t0=Date.now();
 await pg.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:60000});
 const loadMs=Date.now()-t0;
 await pg.waitForTimeout(8000);
 const a=await pg.evaluate(()=>{
   const q=s=>[...document.querySelectorAll(s)];
   return {
     imgsNoAlt:q('img').filter(i=>!i.getAttribute('alt')).length,
     imgsTotal:q('img').length,
     imgsNoLazy:q('img').filter(i=>i.loading!=='lazy').length,
     linksEmpty:q('a[href="#"]').length,
     linksTotal:q('a[href]').length,
     h1:q('h1').length, h2:q('h2').length,
     title:document.title,
     metaDesc:document.querySelector('meta[name=description]')?.content?.length||0,
     lang:document.documentElement.lang||'(none)',
     canonical:!!document.querySelector('link[rel=canonical]'),
     ogImage:document.querySelector('meta[property="og:image"]')?.content?.split('/').pop()||'(none)',
     jsonld:q('script[type="application/ld+json"]').length,
     reducedMotion:!!getComputedStyle(document.body).getPropertyValue('--rm'),
     animations:document.getAnimations().length,
     videos:q('video').length,
     videoAutoplay:q('video[autoplay]').length,
   };
 });
 console.log('=== LOAD ===');
 console.log('  load event      :', loadMs+'ms');
 console.log('  total bytes     :', (bytes.total/1048576).toFixed(2)+' MB');
 Object.entries(bytes.byType).sort((x,y)=>y[1]-x[1]).forEach(([k,v])=>console.log(`    ${k.padEnd(12)} ${(v/1048576).toFixed(2)} MB`));
 console.log('\n=== HEALTH ===');
 console.log('  console errors  :', errs.length, errs.slice(0,3));
 console.log('  failed requests :', bad.length, bad.slice(0,3));
 console.log('\n=== SEO / A11Y ===');
 Object.entries(a).forEach(([k,v])=>console.log(`  ${k.padEnd(16)}: ${v}`));
 await br.close(); srv.close();
})();
